import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import MANAGER_ROLES, get_current_user
from app.models.company import Company
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
from app.services.invoice_pdf import render_invoice_pdf
from app.services.invoice_tax import apply_tax

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


def _get_active_customer_or_error(customer_id: uuid.UUID, db: Session) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.id == customer_id))
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    if not customer.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Customer is archived")
    return customer


def _next_invoice_number(issue_date: date, db: Session) -> str:
    prefix = f"INV-{issue_date.year}-"
    last_number = db.scalar(
        select(func.max(Invoice.number)).where(Invoice.number.like(f"{prefix}%"))
    )
    seq = int(last_number[len(prefix) :]) + 1 if last_number else 1
    return f"{prefix}{seq:04d}"


def _get_company(user: User, db: Session) -> Company:
    return db.scalar(select(Company).where(Company.id == user.company_id))


def _build_items(item_inputs: list[InvoiceItemInput], db: Session) -> list[InvoiceItem]:
    items: list[InvoiceItem] = []
    for item_input in item_inputs:
        if item_input.product_id is not None:
            product = db.scalar(select(Product).where(Product.id == item_input.product_id))
            if product is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
            if not product.is_active:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Product '{product.name}' is archived")
            description = product.name
            unit_price = product.unit_price
            hsn_code = item_input.hsn_code or product.hsn_code
            tax_percent = (
                item_input.tax_percent if item_input.tax_percent is not None else product.gst_rate
            )
        else:
            description = item_input.description
            unit_price = item_input.unit_price
            hsn_code = item_input.hsn_code
            tax_percent = item_input.tax_percent

        line_total = (unit_price * item_input.quantity).quantize(Decimal("0.01"))
        items.append(
            InvoiceItem(
                product_id=item_input.product_id,
                description=description,
                quantity=item_input.quantity,
                unit_price=unit_price,
                line_total=line_total,
                hsn_code=hsn_code,
                tax_percent=tax_percent,
            )
        )
    return items


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
    customer = _get_active_customer_or_error(payload.customer_id, db)
    company = _get_company(current_user, db)

    invoice = Invoice(
        company_id=current_user.company_id,
        customer_id=payload.customer_id,
        number=_next_invoice_number(payload.issue_date, db),
        status=InvoiceStatus.DRAFT,
        issue_date=payload.issue_date,
        due_date=payload.due_date,
        tax_percent=payload.tax_percent,
        place_of_supply=payload.place_of_supply or customer.state_code or company.state_code,
        notes=payload.notes,
        items=_build_items(payload.items, db),
    )
    apply_tax(invoice, company)

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


@router.get("/{invoice_id}/pdf", response_class=Response)
def download_invoice_pdf(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    invoice = _get_invoice_or_404(invoice_id, db)
    company = db.scalar(select(Company).where(Company.id == invoice.company_id))
    customer = db.scalar(select(Customer).where(Customer.id == invoice.customer_id))
    pdf = render_invoice_pdf(invoice, company, customer)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{invoice.number}.pdf"'},
    )


@router.patch("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: uuid.UUID,
    payload: UpdateInvoice,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Invoice:
    invoice = _get_invoice_or_404(invoice_id, db)
    _require_draft(invoice)

    company = _get_company(current_user, db)

    customer_changed = payload.customer_id is not None and payload.customer_id != invoice.customer_id
    if payload.customer_id is not None:
        _get_active_customer_or_error(payload.customer_id, db)
        invoice.customer_id = payload.customer_id
    # Place of supply follows the customer unless it is set explicitly.
    if payload.place_of_supply is not None:
        invoice.place_of_supply = payload.place_of_supply
    elif customer_changed or "place_of_supply" in payload.model_fields_set:
        customer = db.scalar(select(Customer).where(Customer.id == invoice.customer_id))
        invoice.place_of_supply = customer.state_code or company.state_code
    if payload.issue_date is not None:
        invoice.issue_date = payload.issue_date
    if payload.due_date is not None:
        invoice.due_date = payload.due_date
    if payload.tax_percent is not None:
        invoice.tax_percent = payload.tax_percent
    if payload.notes is not None:
        invoice.notes = payload.notes

    if payload.items is not None:
        items = _build_items(payload.items, db)
        invoice.items.clear()
        invoice.items.extend(items)

    apply_tax(invoice, company)

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

    if payload.status == InvoiceStatus.CANCELLED and current_user.role not in MANAGER_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only managers and admins can cancel invoices"
        )

    if invoice.status == InvoiceStatus.DRAFT and payload.status == InvoiceStatus.SENT:
        # Tax is frozen from here on, so settle it against the company's current
        # GST registration (it may have changed since the draft was last saved).
        apply_tax(invoice, _get_company(current_user, db))
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
