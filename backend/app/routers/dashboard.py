from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.product import Product
from app.models.user import User
from app.schemas.dashboard import (
    DashboardSummary,
    LowStockProduct,
    MonthlyRevenue,
    StatusCount,
    TopCustomer,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _add_months(d: date, delta: int) -> date:
    month_index = d.month - 1 + delta
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _utc_midnight(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DashboardSummary:
    today = date.today()
    this_month_start = date(today.year, today.month, 1)
    next_month_start = _add_months(this_month_start, 1)
    last_month_start = _add_months(this_month_start, -1)

    def _paid_sum(start: date, end: date) -> Decimal:
        return db.scalar(
            select(func.coalesce(func.sum(Invoice.total), Decimal("0"))).where(
                Invoice.status == InvoiceStatus.PAID,
                Invoice.paid_at >= _utc_midnight(start),
                Invoice.paid_at < _utc_midnight(end),
            )
        )

    revenue_this_month = _paid_sum(this_month_start, next_month_start)
    revenue_last_month = _paid_sum(last_month_start, this_month_start)

    outstanding_total = db.scalar(
        select(func.coalesce(func.sum(Invoice.total), Decimal("0"))).where(
            Invoice.status == InvoiceStatus.SENT
        )
    )
    overdue_total = db.scalar(
        select(func.coalesce(func.sum(Invoice.total), Decimal("0"))).where(
            Invoice.status == InvoiceStatus.SENT, Invoice.due_date < today
        )
    )

    # 12-month trend: this month back through 11 months ago. Aggregated with
    # GROUP BY in SQL; the only Python-side work is filling months that have
    # no matching rows with an explicit 0, so the chart never mistakes a gap
    # for missing data.
    trend_start = _add_months(this_month_start, -11)

    paid_rows = db.execute(
        select(
            func.date_trunc("month", Invoice.paid_at, "UTC").label("month"),
            func.sum(Invoice.total).label("amount"),
        )
        .where(Invoice.status == InvoiceStatus.PAID, Invoice.paid_at >= _utc_midnight(trend_start))
        .group_by(func.date_trunc("month", Invoice.paid_at, "UTC"))
    ).all()
    paid_by_month = {row.month.date().replace(day=1): row.amount for row in paid_rows}

    invoiced_rows = db.execute(
        select(
            func.date_trunc("month", Invoice.issue_date).label("month"),
            func.sum(Invoice.total).label("amount"),
        )
        .where(Invoice.status != InvoiceStatus.DRAFT, Invoice.issue_date >= trend_start)
        .group_by(func.date_trunc("month", Invoice.issue_date))
    ).all()
    invoiced_by_month = {row.month.date().replace(day=1): row.amount for row in invoiced_rows}

    monthly_trend = []
    for i in range(12):
        month = _add_months(trend_start, i)
        monthly_trend.append(
            MonthlyRevenue(
                month=month.strftime("%Y-%m"),
                paid_amount=paid_by_month.get(month, Decimal("0")),
                invoiced_amount=invoiced_by_month.get(month, Decimal("0")),
            )
        )

    status_rows = db.execute(
        select(Invoice.status, func.count(Invoice.id)).group_by(Invoice.status)
    ).all()
    counts_by_status = {row[0]: row[1] for row in status_rows}
    status_counts = [
        StatusCount(status=s.value, count=counts_by_status.get(s, 0)) for s in InvoiceStatus
    ]

    top_customer_rows = db.execute(
        select(Customer.id, Customer.name, func.sum(Invoice.total).label("total_billed"))
        .join(Invoice, Invoice.customer_id == Customer.id)
        .where(Invoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.PAID]))
        .group_by(Customer.id, Customer.name)
        .order_by(func.sum(Invoice.total).desc())
        .limit(5)
    ).all()
    top_customers = [
        TopCustomer(customer_id=row.id, name=row.name, total_billed=row.total_billed)
        for row in top_customer_rows
    ]

    low_stock_rows = db.scalars(
        select(Product)
        .where(Product.stock_quantity < Product.reorder_level)
        .order_by(Product.stock_quantity)
    ).all()
    low_stock_products = [
        LowStockProduct(
            product_id=p.id,
            sku=p.sku,
            name=p.name,
            stock_quantity=p.stock_quantity,
            reorder_level=p.reorder_level,
        )
        for p in low_stock_rows
    ]

    return DashboardSummary(
        revenue_this_month=revenue_this_month,
        revenue_last_month=revenue_last_month,
        outstanding_total=outstanding_total,
        overdue_total=overdue_total,
        monthly_trend=monthly_trend,
        status_counts=status_counts,
        top_customers=top_customers,
        low_stock_products=low_stock_products,
    )
