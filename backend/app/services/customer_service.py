"""Reused by app/routers/customers.py's callers and the AI assistant's
search_customers tool. No company_id parameter - scoped entirely by the
ambient tenant context, same as every other tenant-filtered query."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.customer import Customer


def search_customers_by_name(db: Session, name: str, limit: int = 10) -> list[Customer]:
    name = name.strip()
    if not name:
        return []
    pattern = f"%{name}%"
    return list(
        db.scalars(
            select(Customer)
            .where(Customer.is_active.is_(True), Customer.name.ilike(pattern))
            .order_by(Customer.name).limit(limit)
        ).all()
    )
