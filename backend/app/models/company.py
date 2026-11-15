from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from app.models.user import User


class Company(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="INR")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    # GST registration. A company without a GSTIN is treated as unregistered:
    # its invoices carry one plain tax line instead of the CGST/SGST/IGST split.
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    state_code: Mapped[str | None] = mapped_column(String(2), nullable=True)

    users: Mapped[list["User"]] = relationship(back_populates="company")
