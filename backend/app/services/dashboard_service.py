"""Dashboard aggregation queries, all SQL-side (GROUP BY / conditional SUM).

Shared by app/routers/dashboard.py and the AI assistant's tools
(app/routers/assistant.py) - both call these same functions, so the
assistant's answers can never drift from what the dashboard shows.

None of these take a company_id: every query here runs against models
already covered by the tenant filter (see core/tenant.py), scoped
entirely by the ambient request context set by TenantContextMiddleware.
There is no parameter through which a caller could ask for another
tenant's data.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.product import Product


def _add_months(d: date, delta: int) -> date:
    month_index = d.month - 1 + delta
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _utc_midnight(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


@dataclass
class RevenueSummary:
    revenue_this_month: Decimal
    revenue_last_month: Decimal
    outstanding_total: Decimal
    overdue_total: Decimal


def get_revenue_summary(db: Session) -> RevenueSummary:
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

    return RevenueSummary(
        revenue_this_month=_paid_sum(this_month_start, next_month_start),
        revenue_last_month=_paid_sum(last_month_start, this_month_start),
        outstanding_total=outstanding_total,
        overdue_total=overdue_total,
    )


@dataclass
class MonthlyRevenuePoint:
    month: str  # "YYYY-MM"
    paid_amount: Decimal
    invoiced_amount: Decimal


def get_monthly_trend(db: Session) -> list[MonthlyRevenuePoint]:
    today = date.today()
    this_month_start = date(today.year, today.month, 1)
    # 12-month trend: this month back through 11 months ago. Aggregated
    # with GROUP BY in SQL; the only Python-side work is filling months
    # that have no matching rows with an explicit 0, so a real gap is
    # never mistaken for missing data.
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

    trend = []
    for i in range(12):
        month = _add_months(trend_start, i)
        trend.append(
            MonthlyRevenuePoint(
                month=month.strftime("%Y-%m"),
                paid_amount=paid_by_month.get(month, Decimal("0")),
                invoiced_amount=invoiced_by_month.get(month, Decimal("0")),
            )
        )
    return trend


def get_status_counts(db: Session) -> dict[InvoiceStatus, int]:
    rows = db.execute(select(Invoice.status, func.count(Invoice.id)).group_by(Invoice.status)).all()
    counts_by_status = {row[0]: row[1] for row in rows}
    return {s: counts_by_status.get(s, 0) for s in InvoiceStatus}


@dataclass
class OverdueInvoice:
    number: str
    customer_name: str
    total: Decimal
    due_date: date
    days_overdue: int


def list_overdue_invoices(db: Session) -> list[OverdueInvoice]:
    today = date.today()
    rows = db.execute(
        select(Invoice.number, Customer.name, Invoice.total, Invoice.due_date)
        .join(Customer, Customer.id == Invoice.customer_id)
        .where(Invoice.status == InvoiceStatus.SENT, Invoice.due_date < today)
        .order_by(Invoice.due_date)
    ).all()
    return [
        OverdueInvoice(
            number=row.number,
            customer_name=row.name,
            total=row.total,
            due_date=row.due_date,
            days_overdue=(today - row.due_date).days,
        )
        for row in rows
    ]


@dataclass
class TopCustomerRow:
    customer_id: object
    name: str
    total_billed: Decimal


def list_top_customers(db: Session, limit: int = 5) -> list[TopCustomerRow]:
    rows = db.execute(
        select(Customer.id, Customer.name, func.sum(Invoice.total).label("total_billed"))
        .join(Invoice, Invoice.customer_id == Customer.id)
        .where(Invoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.PAID]))
        .group_by(Customer.id, Customer.name)
        .order_by(func.sum(Invoice.total).desc())
        .limit(limit)
    ).all()
    return [TopCustomerRow(customer_id=row.id, name=row.name, total_billed=row.total_billed) for row in rows]


@dataclass
class LowStockProductRow:
    product_id: object
    sku: str
    name: str
    stock_quantity: int
    reorder_level: int


def list_low_stock_products(db: Session) -> list[LowStockProductRow]:
    rows = db.scalars(
        select(Product)
        .where(Product.is_active.is_(True), Product.stock_quantity < Product.reorder_level)
        .order_by(Product.stock_quantity)
    ).all()
    return [
        LowStockProductRow(
            product_id=p.id,
            sku=p.sku,
            name=p.name,
            stock_quantity=p.stock_quantity,
            reorder_level=p.reorder_level,
        )
        for p in rows
    ]
