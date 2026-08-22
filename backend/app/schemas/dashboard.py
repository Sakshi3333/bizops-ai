import uuid
from decimal import Decimal

from pydantic import BaseModel


class MonthlyRevenue(BaseModel):
    month: str  # "YYYY-MM"
    paid_amount: Decimal
    invoiced_amount: Decimal


class StatusCount(BaseModel):
    status: str
    count: int


class TopCustomer(BaseModel):
    customer_id: uuid.UUID
    name: str
    total_billed: Decimal


class LowStockProduct(BaseModel):
    product_id: uuid.UUID
    sku: str
    name: str
    stock_quantity: int
    reorder_level: int


class DashboardSummary(BaseModel):
    revenue_this_month: Decimal
    revenue_last_month: Decimal
    outstanding_total: Decimal
    overdue_total: Decimal
    monthly_trend: list[MonthlyRevenue]
    status_counts: list[StatusCount]
    top_customers: list[TopCustomer]
    low_stock_products: list[LowStockProduct]
