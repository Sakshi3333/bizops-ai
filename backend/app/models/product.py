import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPkMixin


class Product(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("company_id", "sku", name="uq_products_company_id_sku"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    hsn_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # NULL = no rate of its own; invoice lines fall back to the invoice's default GST %.
    gst_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    stock_quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reorder_level: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
