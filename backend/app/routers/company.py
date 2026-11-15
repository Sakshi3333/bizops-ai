from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.company import Company
from app.models.user import User, UserRole
from app.schemas.company import CompanyOut, UpdateCompany
from app.services.gst import merge_gst_identity

router = APIRouter(prefix="/company", tags=["company"])

require_admin = require_role(UserRole.ADMIN, UserRole.SUPERADMIN)


def _get_own_company(user: User, db: Session) -> Company:
    return db.scalar(select(Company).where(Company.id == user.company_id))


@router.get("", response_model=CompanyOut)
def get_company(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Company:
    return _get_own_company(current_user, db)


@router.patch("", response_model=CompanyOut)
def update_company(
    payload: UpdateCompany,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Company:
    company = _get_own_company(current_user, db)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("email", "") is None:
        raise HTTPException(422, "Company email cannot be empty")
    try:
        gstin, state_code = merge_gst_identity(company.gstin, company.state_code, changes)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    for field, value in changes.items():
        setattr(company, field, value)
    company.gstin, company.state_code = gstin, state_code
    db.commit()
    db.refresh(company)
    return company
