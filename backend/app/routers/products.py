import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_manager
from app.models.product import Product
from app.models.user import User
from app.schemas.product import CreateProduct, ProductOut, UpdateProduct

router = APIRouter(prefix="/products", tags=["products"])


def _get_product_or_404(product_id: uuid.UUID, db: Session) -> Product:
    product = db.scalar(select(Product).where(Product.id == product_id))
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return product


@router.get("", response_model=list[ProductOut])
def list_products(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Product]:
    stmt = select(Product).order_by(Product.created_at.desc())
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    return list(db.scalars(stmt).all())


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: CreateProduct,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
) -> Product:
    product = Product(company_id=current_user.company_id, **payload.model_dump())
    db.add(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "SKU already exists for this company")
    db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Product:
    return _get_product_or_404(product_id, db)


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: uuid.UUID,
    payload: UpdateProduct,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
) -> Product:
    product = _get_product_or_404(product_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "SKU already exists for this company")
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: uuid.UUID,
    current_user: User = Depends(require_manager),
    db: Session = Depends(get_db),
) -> None:
    # Soft delete: existing invoices still reference this row, so it is
    # archived (hidden from lists and new invoices) rather than removed.
    product = _get_product_or_404(product_id, db)
    product.is_active = False
    db.commit()
