import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_manager
from app.models.customer import Customer
from app.models.user import User
from app.schemas.customer import CreateCustomer, CustomerOut, UpdateCustomer

router = APIRouter(prefix="/customers", tags=["customers"])


def _get_customer_or_404(customer_id: uuid.UUID, db: Session) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.id == customer_id))
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    return customer


@router.get("", response_model=list[CustomerOut])
def list_customers(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Customer]:
    stmt = select(Customer).order_by(Customer.created_at.desc())
    if not include_inactive:
        stmt = stmt.where(Customer.is_active.is_(True))
    return list(db.scalars(stmt).all())


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CreateCustomer,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Customer:
    customer = Customer(company_id=current_user.company_id, **payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Customer:
    return _get_customer_or_404(customer_id, db)


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: uuid.UUID,
    payload: UpdateCustomer,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Customer:
    customer = _get_customer_or_404(customer_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: uuid.UUID,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
) -> None:
    # Soft delete: existing invoices still reference this row, so it is
    # archived (hidden from lists and new invoices) rather than removed.
    customer = _get_customer_or_404(customer_id, db)
    customer.is_active = False
    db.commit()
