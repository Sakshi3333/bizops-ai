import uuid

from pydantic import BaseModel, EmailStr

from app.schemas.gst import Gstin, StateCode


class UpdateCompany(BaseModel):
    """Name is deliberately not editable here: it is baked into every issued JWT."""

    email: EmailStr | None = None
    address: str | None = None
    gstin: Gstin | None = None
    state_code: StateCode | None = None


class CompanyOut(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    currency: str
    address: str | None
    gstin: str | None
    state_code: str | None

    model_config = {"from_attributes": True}
