import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.gst import HsnCode


class CreateProduct(BaseModel):
    sku: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    unit_price: Decimal = Field(ge=0)
    hsn_code: HsnCode | None = None
    gst_rate: Decimal | None = Field(default=None, ge=0, le=100)
    stock_quantity: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=0, ge=0)


class UpdateProduct(BaseModel):
    sku: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    unit_price: Decimal | None = Field(default=None, ge=0)
    hsn_code: HsnCode | None = None
    gst_rate: Decimal | None = Field(default=None, ge=0, le=100)
    stock_quantity: int | None = Field(default=None, ge=0)
    reorder_level: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ProductOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    sku: str
    name: str
    description: str | None
    unit_price: Decimal
    hsn_code: str | None
    gst_rate: Decimal | None
    stock_quantity: int
    reorder_level: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
