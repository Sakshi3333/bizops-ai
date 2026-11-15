"""Populate the database with a demo company so the app isn't empty on first run.

Usage (from backend/):  python -m app.seed
With Docker:            docker compose exec backend python -m app.seed

Safe to re-run: does nothing if the demo company already exists.
With --refresh-after-hours N, a demo company older than N hours is deleted and
rebuilt, so a public demo keeps current dates and sheds visitors' edits.
"""

import argparse
import random
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.core.tenant import tenant_context
from app.models import Company, Customer, Invoice, InvoiceItem, InvoiceStatus, Product, User, UserRole
from app.services.gst import gstin_check_digit
from app.services.invoice_tax import apply_tax

DEMO_COMPANY = "Demo Traders"
DEMO_PASSWORD = "demo1234"
DEMO_USERS = [
    ("Asha Admin", "admin@demo.bizops", UserRole.ADMIN),
    ("Manoj Manager", "manager@demo.bizops", UserRole.MANAGER),
    ("Esha Employee", "employee@demo.bizops", UserRole.EMPLOYEE),
]

def _demo_gstin(state_code: str, pan: str) -> str:
    """A made-up GSTIN with a valid check digit, so it passes the same validation as a real one."""
    first_14 = f"{state_code}{pan}1Z"
    return first_14 + gstin_check_digit(first_14)


DEMO_ADDRESS = "214 Laxmi Road, Pune 411030"
DEMO_GSTIN = _demo_gstin("27", "AAECD4821K")

# name, email, phone, address, GST state code, PAN (None = unregistered customer).
# Maharashtra (27) is the demo company's own state; the others get IGST invoices.
CUSTOMERS = [
    ("Sharma Electronics", "orders@sharmaelec.in", "+91 98200 11111", "12 MG Road, Pune", "27", "AAFCS7310P"),
    ("Green Leaf Cafe", "hello@greenleaf.in", "+91 98200 22222", "4 FC Road, Pune", "27", None),
    ("Patel Hardware", "patel.hw@example.com", "+91 98200 33333", "88 Ring Road, Surat", "24", "ABCFP2264M"),
    ("Sunrise School", "admin@sunrise.edu", "+91 98200 44444", "Sector 7, Navi Mumbai", "27", None),
    ("Kumar & Sons", "kumarsons@example.com", "+91 98200 55555", "21 Chickpet, Bengaluru", "29", "AAHFK5593R"),
    ("BrightSmile Dental", "frontdesk@brightsmile.in", "+91 98200 66666", "3 Baner Rd, Pune", "27", "AAKCB1047L"),
    ("Metro Fitness", "ops@metrofit.in", "+91 98200 77777", "Linking Rd, Mumbai", "27", "AAGCM8826D"),
    ("Lotus Boutique", "lotus@example.com", "+91 98200 88888", "Camp, Pune", "27", None),
]

# sku, name, unit price, stock, reorder level, HSN code, GST %
# HSN codes and rates are illustrative demo data, not tax advice.
PRODUCTS = [
    ("PRN-A4-500", "A4 Paper Ream (500 sheets)", "320.00", 140, 50, "4802", "12.00"),
    ("INK-BLK-01", "Black Ink Cartridge", "850.00", 12, 20, "8443", "18.00"),
    ("INK-CLR-01", "Colour Ink Cartridge", "1150.00", 8, 15, "8443", "18.00"),
    ("PEN-BLU-10", "Blue Ballpoint Pens (10 pack)", "90.00", 300, 100, "9608", "18.00"),
    ("STP-HVY-01", "Heavy Duty Stapler", "450.00", 25, 10, "8472", "18.00"),
    ("FLD-BOX-12", "Box Files (12 pack)", "780.00", 40, 15, "4820", "18.00"),
    ("USB-32GB", "USB Flash Drive 32GB", "399.00", 5, 20, "8523", "18.00"),
    ("MSE-WRL-01", "Wireless Mouse", "699.00", 30, 10, "8471", "18.00"),
    ("KBD-WRD-01", "Wired Keyboard", "549.00", 18, 10, "8471", "18.00"),
    ("WBM-SET-04", "Whiteboard Markers (4 set)", "160.00", 9, 25, "9608", "18.00"),
]


def _add_months(d: date, delta: int) -> date:
    month_index = d.month - 1 + delta
    return date(d.year + month_index // 12, month_index % 12 + 1, 1)


def _delete_company(db, company_id) -> None:
    invoice_ids = select(Invoice.id).where(Invoice.company_id == company_id)
    db.execute(delete(InvoiceItem).where(InvoiceItem.invoice_id.in_(invoice_ids)))
    for model in (Invoice, Customer, Product, User):
        db.execute(delete(model).where(model.company_id == company_id))
    db.execute(delete(Company).where(Company.id == company_id))


def seed(refresh_after: timedelta | None = None) -> None:
    rng = random.Random(42)  # deterministic, so every demo looks the same

    # No request is in flight, so there's no tenant filter; run unscoped explicitly.
    with tenant_context(None), SessionLocal() as db:
        existing = db.scalar(select(Company).where(Company.name == DEMO_COMPANY))
        if existing is not None:
            age = datetime.now(timezone.utc) - existing.created_at
            if refresh_after is None or age < refresh_after:
                print(f"'{DEMO_COMPANY}' already exists - nothing to do.")
                return
            print(f"'{DEMO_COMPANY}' is {age.days}d {age.seconds // 3600}h old - rebuilding it.")
            _delete_company(db, existing.id)
            db.flush()

        company = Company(
            name=DEMO_COMPANY,
            email="accounts@demotraders.in",
            currency="INR",
            address=DEMO_ADDRESS,
            gstin=DEMO_GSTIN,
            state_code=DEMO_GSTIN[:2],
        )
        db.add(company)
        db.flush()

        password_hash = hash_password(DEMO_PASSWORD)
        for name, email, role in DEMO_USERS:
            db.add(User(company_id=company.id, name=name, email=email, password_hash=password_hash, role=role))

        customers = [
            Customer(
                company_id=company.id,
                name=name,
                email=email,
                phone=phone,
                address=address,
                state_code=state_code,
                gstin=_demo_gstin(state_code, pan) if pan else None,
            )
            for name, email, phone, address, state_code, pan in CUSTOMERS
        ]
        products = [
            Product(
                company_id=company.id,
                sku=sku,
                name=name,
                unit_price=Decimal(price),
                stock_quantity=stock,
                reorder_level=reorder,
                hsn_code=hsn_code,
                gst_rate=Decimal(gst_rate),
            )
            for sku, name, price, stock, reorder, hsn_code, gst_rate in PRODUCTS
        ]
        db.add_all(customers + products)
        db.flush()

        today = date.today()
        seq_by_year: dict[int, int] = {}
        invoice_count = 0

        # Roughly 4-6 invoices per month over the last twelve months, matching the
        # dashboard's 12-month revenue chart.
        for months_back in range(11, -1, -1):
            month_start = _add_months(today.replace(day=1), -months_back)
            for n in range(rng.randint(4, 6)):
                issue_date = month_start + timedelta(days=rng.randint(0, 27))
                if issue_date > today:
                    issue_date = today
                due_date = issue_date + timedelta(days=15)

                # Older invoices are mostly settled; recent ones are a mix. The first two
                # this month are paid, so "revenue this month" is never an empty zero.
                if months_back == 0 and n < 2:
                    status = InvoiceStatus.PAID
                elif months_back >= 2:
                    status = rng.choices(
                        [InvoiceStatus.PAID, InvoiceStatus.SENT, InvoiceStatus.CANCELLED], [80, 12, 8]
                    )[0]
                else:
                    status = rng.choices(
                        [InvoiceStatus.PAID, InvoiceStatus.SENT, InvoiceStatus.DRAFT], [45, 35, 20]
                    )[0]

                items = []
                for product in rng.sample(products, rng.randint(1, 4)):
                    quantity = rng.randint(1, 10)
                    line_total = (product.unit_price * quantity).quantize(Decimal("0.01"))
                    items.append(
                        InvoiceItem(
                            product_id=product.id,
                            description=product.name,
                            quantity=quantity,
                            unit_price=product.unit_price,
                            line_total=line_total,
                            hsn_code=product.hsn_code,
                            tax_percent=product.gst_rate,
                        )
                    )

                paid_at = None
                if status == InvoiceStatus.PAID:
                    paid_day = min(issue_date + timedelta(days=rng.randint(1, 20)), today)
                    paid_at = datetime.combine(paid_day, time(11, 0), tzinfo=timezone.utc)

                seq_by_year[issue_date.year] = seq_by_year.get(issue_date.year, 0) + 1
                customer = rng.choice(customers)
                invoice = Invoice(
                    company_id=company.id,
                    customer_id=customer.id,
                    number=f"INV-{issue_date.year}-{seq_by_year[issue_date.year]:04d}",
                    status=status,
                    issue_date=issue_date,
                    due_date=due_date,
                    paid_at=paid_at,
                    tax_percent=Decimal("18.00"),
                    place_of_supply=customer.state_code,
                    items=items,
                )
                apply_tax(invoice, company)
                db.add(invoice)
                invoice_count += 1

        db.commit()

    print(f"Created '{DEMO_COMPANY}' with {len(customers)} customers, {len(products)} products, {invoice_count} invoices.")
    print(f"Log in with any of these (password: {DEMO_PASSWORD}):")
    for _, email, role in DEMO_USERS:
        print(f"  {email:<24} {role.value}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create the demo company.")
    parser.add_argument(
        "--refresh-after-hours",
        type=float,
        help="rebuild the demo company if it is older than this many hours",
    )
    args = parser.parse_args()
    seed(timedelta(hours=args.refresh_after_hours) if args.refresh_after_hours else None)
