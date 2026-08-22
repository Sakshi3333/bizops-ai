from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.dashboard import (
    DashboardSummary,
    LowStockProduct,
    MonthlyRevenue,
    StatusCount,
    TopCustomer,
)
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DashboardSummary:
    revenue = dashboard_service.get_revenue_summary(db)
    trend = dashboard_service.get_monthly_trend(db)
    status_counts = dashboard_service.get_status_counts(db)
    top_customers = dashboard_service.list_top_customers(db, limit=5)
    low_stock = dashboard_service.list_low_stock_products(db)

    return DashboardSummary(
        revenue_this_month=revenue.revenue_this_month,
        revenue_last_month=revenue.revenue_last_month,
        outstanding_total=revenue.outstanding_total,
        overdue_total=revenue.overdue_total,
        monthly_trend=[
            MonthlyRevenue(month=p.month, paid_amount=p.paid_amount, invoiced_amount=p.invoiced_amount)
            for p in trend
        ],
        status_counts=[
            StatusCount(status=status.value, count=count) for status, count in status_counts.items()
        ],
        top_customers=[
            TopCustomer(customer_id=row.customer_id, name=row.name, total_billed=row.total_billed)
            for row in top_customers
        ],
        low_stock_products=[
            LowStockProduct(
                product_id=row.product_id,
                sku=row.sku,
                name=row.name,
                stock_quantity=row.stock_quantity,
                reorder_level=row.reorder_level,
            )
            for row in low_stock
        ],
    )
