import uuid

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class RegisterCompanyRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    company_email: EmailStr
    currency: str = Field(default="INR", min_length=3, max_length=3)
    admin_name: str = Field(min_length=1, max_length=255)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    email: EmailStr
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}
