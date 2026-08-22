import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.product import Product
from app.models.user import User
from app.schemas.invoice import (
    ChangeInvoiceStatus,
    CreateInvoice,
    InvoiceItemInput,
    InvoiceOut,
    UpdateInvoice,
)

router = APIRouter(prefix="/invoices", tags=["invoices"])

# Only these transitions are allowed; anything else (including PATCHing
# status directly, which isn't exposed at all) is rejected.
_VALID_TRANSITIONS: dict[InvoiceStatus, set[InvoiceStatus]] = {
    InvoiceStatus.DRAFT: {InvoiceStatus.SENT, InvoiceStatus.CANCELLED},
    InvoiceStatus.SENT: {InvoiceStatus.PAID, InvoiceStatus.CANCELLED},
    InvoiceStatus.PAID: set(),
    InvoiceStatus.CANCELLED: set(),
}


def _get_invoice_or_404(invoice_id: uuid.UUID, db: Session) -> Invoice:
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id))
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return invoice


def _next_invoice_number(issue_date: date, db: Session) -> str:
    prefix = f"INV-{issue_date.year}-"
    last_number = db.scalar(
        select(func.max(Invoice.number)).where(Invoice.number.like(f"{prefix}%"))
    )
    seq = int(last_number[len(prefix) :]) + 1 if last_number else 1
    return f"{prefix}{seq:04d}"


def _build_items(item_inputs: list[InvoiceItemInput], db: Session) -> tuple[list[InvoiceItem], Decimal]:
    items: list[InvoiceItem] = []
    subtotal = Decimal("0")
    for item_input in item_inputs:
        if item_input.product_id is not None:
            product = db.scalar(select(Product).where(Product.id == item_input.product_id))
            if product is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
            description = product.name
            unit_price = product.unit_price
        else:
            description = item_input.description
            unit_price = item_input.unit_price

        line_total = (unit_price * item_input.quantity).quantize(Decimal("0.01"))
        items.append(
            InvoiceItem(
                product_id=item_input.product_id,
                description=description,
                quantity=item_input.quantity,
                unit_price=unit_price,
                line_total=line_total,
            )
        )
        subtotal += line_total
    return items, subtotal


def _recompute_totals(invoice: Invoice) -> None:
    invoice.tax_amount = (invoice.subtotal * invoice.tax_percent / Decimal("100")).quantize(Decimal("0.01"))
    invoice.total = invoice.subtotal + invoice.tax_amount


def _require_draft(invoice: Invoice) -> None:
    if invoice.status != InvoiceStatus.DRAFT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Invoice is {invoice.status.value}; only draft invoices can be edited",
        )


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Invoice]:
    return list(db.scalars(select(Invoice).order_by(Invoice.created_at.desc())).all())


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: CreateInvoice,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Invoice:
    customer = db.scalar(select(Customer).where(Customer.id == payload.customer_id))
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")

    items, subtotal = _build_items(payload.items, db)

    invoice = Invoice(
        company_id=current_user.company_id,
        customer_id=payload.customer_id,
        number=_next_invoice_number(payload.issue_date, db),
        status=InvoiceStatus.DRAFT,
        issue_date=payload.issue_date,
        due_date=payload.due_date,
        subtotal=subtotal,
        tax_percent=payload.tax_percent,
        notes=payload.notes,
        items=items,
    )
    _recompute_totals(invoice)

    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Invoice:
    return _get_invoice_or_404(invoice_id, db)


@router.patch("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: uuid.UUID,
    payload: UpdateInvoice,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Invoice:
    invoice = _get_invoice_or_404(invoice_id, db)
    _require_draft(invoice)

    if payload.customer_id is not None:
        customer = db.scalar(select(Customer).where(Customer.id == payload.customer_id))
        if customer is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
        invoice.customer_id = payload.customer_id
    if payload.issue_date is not None:
        invoice.issue_date = payload.issue_date
    if payload.due_date is not None:
        invoice.due_date = payload.due_date
    if payload.tax_percent is not None:
        invoice.tax_percent = payload.tax_percent
    if payload.notes is not None:
        invoice.notes = payload.notes

    if payload.items is not None:
        items, subtotal = _build_items(payload.items, db)
        invoice.items.clear()
        invoice.items.extend(items)
        invoice.subtotal = subtotal

    _recompute_totals(invoice)

    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/status", response_model=InvoiceOut)
def change_invoice_status(
    invoice_id: uuid.UUID,
    payload: ChangeInvoiceStatus,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Invoice:
    invoice = _get_invoice_or_404(invoice_id, db)

    if payload.status not in _VALID_TRANSITIONS.get(invoice.status, set()):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot transition invoice from {invoice.status.value} to {payload.status.value}",
        )

    if invoice.status == InvoiceStatus.DRAFT and payload.status == InvoiceStatus.SENT:
        for item in invoice.items:
            if item.product_id is None:
                continue
            product = db.scalar(select(Product).where(Product.id == item.product_id))
            if product is not None:
                product.stock_quantity = max(0, product.stock_quantity - item.quantity)
    elif invoice.status == InvoiceStatus.SENT and payload.status == InvoiceStatus.CANCELLED:
        for item in invoice.items:
            if item.product_id is None:
                continue
            product = db.scalar(select(Product).where(Product.id == item.product_id))
            if product is not None:
                product.stock_quantity = product.stock_quantity + item.quantity

    if payload.status == InvoiceStatus.PAID:
        invoice.paid_at = datetime.now(timezone.utc)

    invoice.status = payload.status
    db.commit()
    db.refresh(invoice)
    return invoice
