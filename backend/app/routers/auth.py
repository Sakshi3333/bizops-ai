from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.company import Company
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, RegisterCompanyRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register-company", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
def register_company(payload: RegisterCompanyRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if db.scalar(select(Company).where(Company.name == payload.company_name)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Company name already registered")

    if db.scalar(select(User).where(User.email == payload.admin_email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    company = Company(
        name=payload.company_name,
        email=payload.company_email,
        currency=payload.currency,
    )
    db.add(company)
    db.flush()

    admin = User(
        company_id=company.id,
        name=payload.admin_name,
        email=payload.admin_email,
        password_hash=hash_password(payload.admin_password),
        role=UserRole.ADMIN,
    )
    db.add(admin)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Company or email already registered")

    db.refresh(company)
    db.refresh(admin)

    token = create_access_token(
        user_id=admin.id,
        company_id=company.id,
        company_name=company.name,
        role=admin.role.value,
        currency=company.currency,
    )
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    company = db.scalar(select(Company).where(Company.id == user.company_id))
    if company is None or not company.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    token = create_access_token(
        user_id=user.id,
        company_id=company.id,
        company_name=company.name,
        role=user.role.value,
        currency=company.currency,
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
