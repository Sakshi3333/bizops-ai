import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.gst import Gstin, StateCode


class CreateCustomer(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = None
    gstin: Gstin | None = None
    state_code: StateCode | None = None


class UpdateCustomer(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = None
    gstin: Gstin | None = None
    state_code: StateCode | None = None
    is_active: bool | None = None


class CustomerOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    email: EmailStr | None
    phone: str | None
    address: str | None
    gstin: str | None
    state_code: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
