import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.invoice import InvoiceStatus
from app.schemas.gst import HsnCode, StateCode


class InvoiceItemInput(BaseModel):
    """product_id set => description/unit_price are ignored here and
    always snapshotted server-side from the current Product. product_id
    unset => a custom line, so description/unit_price are required from
    the client.

    hsn_code/tax_percent are optional on either kind of line: left out, a
    product line takes them from the Product and any line without a rate
    falls back to the invoice's tax_percent.
    """

    product_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=255)
    quantity: int = Field(default=1, ge=1)
    unit_price: Decimal | None = Field(default=None, ge=0)
    hsn_code: HsnCode | None = None
    tax_percent: Decimal | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def _validate_custom_line(self) -> "InvoiceItemInput":
        if self.product_id is None and (not self.description or self.unit_price is None):
            raise ValueError("Custom line items require both description and unit_price")
        return self


class CreateInvoice(BaseModel):
    customer_id: uuid.UUID
    issue_date: date
    due_date: date
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    # GST state code; defaults to the customer's state, then the company's own.
    place_of_supply: StateCode | None = None
    notes: str | None = None
    items: list[InvoiceItemInput] = Field(min_length=1)


class UpdateInvoice(BaseModel):
    customer_id: uuid.UUID | None = None
    issue_date: date | None = None
    due_date: date | None = None
    tax_percent: Decimal | None = Field(default=None, ge=0, le=100)
    place_of_supply: StateCode | None = None
    notes: str | None = None
    items: list[InvoiceItemInput] | None = Field(default=None, min_length=1)


class ChangeInvoiceStatus(BaseModel):
    status: InvoiceStatus


class InvoiceItemOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    description: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    hsn_code: str | None
    tax_percent: Decimal | None
    tax_amount: Decimal

    model_config = {"from_attributes": True}


class InvoiceOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    customer_id: uuid.UUID
    number: str
    status: InvoiceStatus
    issue_date: date
    due_date: date
    paid_at: datetime | None
    subtotal: Decimal
    tax_percent: Decimal
    tax_amount: Decimal
    place_of_supply: str | None
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total: Decimal
    notes: str | None
    created_at: datetime
    items: list[InvoiceItemOut]

    model_config = {"from_attributes": True}
