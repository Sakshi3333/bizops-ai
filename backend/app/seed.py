"""Populate the database with a demo company so the app isn't empty on first run.

Usage (from backend/):  python -m app.seed
With Docker:            docker compose exec backend python -m app.seed

Safe to re-run: does nothing if the demo company already exists.
"""

import random
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.core.tenant import tenant_context
from app.models import Company, Customer, Invoice, InvoiceItem, InvoiceStatus, Product, User, UserRole

DEMO_COMPANY = "Demo Traders"
DEMO_PASSWORD = "demo1234"
DEMO_USERS = [
    ("Asha Admin", "admin@demo.bizops", UserRole.ADMIN),
    ("Manoj Manager", "manager@demo.bizops", UserRole.MANAGER),
    ("Esha Employee", "employee@demo.bizops", UserRole.EMPLOYEE),
]

CUSTOMERS = [
    ("Sharma Electronics", "orders@sharmaelec.in", "+91 98200 11111", "12 MG Road, Pune"),
    ("Green Leaf Cafe", "hello@greenleaf.in", "+91 98200 22222", "4 FC Road, Pune"),
    ("Patel Hardware", "patel.hw@example.com", "+91 98200 33333", "88 Station Rd, Nashik"),
    ("Sunrise School", "admin@sunrise.edu", "+91 98200 44444", "Sector 7, Navi Mumbai"),
    ("Kumar & Sons", "kumarsons@example.com", "+91 98200 55555", "21 Market Yard, Satara"),
    ("BrightSmile Dental", "frontdesk@brightsmile.in", "+91 98200 66666", "3 Baner Rd, Pune"),
    ("Metro Fitness", "ops@metrofit.in", "+91 98200 77777", "Linking Rd, Mumbai"),
    ("Lotus Boutique", "lotus@example.com", "+91 98200 88888", "Camp, Pune"),
]

# sku, name, unit price, stock, reorder level
PRODUCTS = [
    ("PRN-A4-500", "A4 Paper Ream (500 sheets)", "320.00", 140, 50),
    ("INK-BLK-01", "Black Ink Cartridge", "850.00", 12, 20),
    ("INK-CLR-01", "Colour Ink Cartridge", "1150.00", 8, 15),
    ("PEN-BLU-10", "Blue Ballpoint Pens (10 pack)", "90.00", 300, 100),
    ("STP-HVY-01", "Heavy Duty Stapler", "450.00", 25, 10),
    ("FLD-BOX-12", "Box Files (12 pack)", "780.00", 40, 15),
    ("USB-32GB", "USB Flash Drive 32GB", "399.00", 5, 20),
    ("MSE-WRL-01", "Wireless Mouse", "699.00", 30, 10),
    ("KBD-WRD-01", "Wired Keyboard", "549.00", 18, 10),
    ("WBM-SET-04", "Whiteboard Markers (4 set)", "160.00", 9, 25),
]


def _add_months(d: date, delta: int) -> date:
    month_index = d.month - 1 + delta
    return date(d.year + month_index // 12, month_index % 12 + 1, 1)


def seed() -> None:
    rng = random.Random(42)  # deterministic, so every demo looks the same

    # No request is in flight, so there's no tenant filter; run unscoped explicitly.
    with tenant_context(None), SessionLocal() as db:
        if db.scalar(select(Company).where(Company.name == DEMO_COMPANY)) is not None:
            print(f"'{DEMO_COMPANY}' already exists - nothing to do.")
            return

        company = Company(name=DEMO_COMPANY, email="accounts@demotraders.in", currency="INR")
        db.add(company)
        db.flush()

        password_hash = hash_password(DEMO_PASSWORD)
        for name, email, role in DEMO_USERS:
            db.add(User(company_id=company.id, name=name, email=email, password_hash=password_hash, role=role))

        customers = [
            Customer(company_id=company.id, name=n, email=e, phone=p, address=a) for n, e, p, a in CUSTOMERS
        ]
        products = [
            Product(
                company_id=company.id,
                sku=sku,
                name=name,
                unit_price=Decimal(price),
                stock_quantity=stock,
                reorder_level=reorder,
            )
            for sku, name, price, stock, reorder in PRODUCTS
        ]
        db.add_all(customers + products)
        db.flush()

        today = date.today()
        seq_by_year: dict[int, int] = {}
        invoice_count = 0

        # Roughly 4-6 invoices per month over the last six months.
        for months_back in range(5, -1, -1):
            month_start = _add_months(today.replace(day=1), -months_back)
            for _ in range(rng.randint(4, 6)):
                issue_date = month_start + timedelta(days=rng.randint(0, 27))
                if issue_date > today:
                    issue_date = today
                due_date = issue_date + timedelta(days=15)

                # Older invoices are mostly settled; recent ones are a mix.
                if months_back >= 2:
                    status = rng.choices(
                        [InvoiceStatus.PAID, InvoiceStatus.SENT, InvoiceStatus.CANCELLED], [80, 12, 8]
                    )[0]
                else:
                    status = rng.choices(
                        [InvoiceStatus.PAID, InvoiceStatus.SENT, InvoiceStatus.DRAFT], [45, 35, 20]
                    )[0]

                items = []
                subtotal = Decimal("0")
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
                        )
                    )
                    subtotal += line_total

                tax_percent = Decimal("18.00")
                tax_amount = (subtotal * tax_percent / Decimal("100")).quantize(Decimal("0.01"))

                paid_at = None
                if status == InvoiceStatus.PAID:
                    paid_day = min(issue_date + timedelta(days=rng.randint(1, 20)), today)
                    paid_at = datetime.combine(paid_day, time(11, 0), tzinfo=timezone.utc)

                seq_by_year[issue_date.year] = seq_by_year.get(issue_date.year, 0) + 1
                db.add(
                    Invoice(
                        company_id=company.id,
                        customer_id=rng.choice(customers).id,
                        number=f"INV-{issue_date.year}-{seq_by_year[issue_date.year]:04d}",
                        status=status,
                        issue_date=issue_date,
                        due_date=due_date,
                        paid_at=paid_at,
                        subtotal=subtotal,
                        tax_percent=tax_percent,
                        tax_amount=tax_amount,
                        total=subtotal + tax_amount,
                        items=items,
                    )
                )
                invoice_count += 1

        db.commit()

    print(f"Created '{DEMO_COMPANY}' with {len(customers)} customers, {len(products)} products, {invoice_count} invoices.")
    print(f"Log in with any of these (password: {DEMO_PASSWORD}):")
    for _, email, role in DEMO_USERS:
        print(f"  {email:<24} {role.value}")


if __name__ == "__main__":
    seed()
