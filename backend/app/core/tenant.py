import uuid
from contextlib import contextmanager
from contextvars import ContextVar

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from app.models.company import Company
from app.models.user import User

# None => unfiltered (no request in flight, e.g. a startup/admin script).
current_tenant_id: ContextVar[uuid.UUID | None] = ContextVar(
    "current_tenant_id", default=None
)
# True => bypass tenant filtering even though a tenant id is set (SuperAdmin).
current_is_superadmin: ContextVar[bool] = ContextVar(
    "current_is_superadmin", default=False
)


def set_tenant_context(tenant_id: uuid.UUID | None, is_superadmin: bool = False) -> None:
    current_tenant_id.set(tenant_id)
    current_is_superadmin.set(is_superadmin)


@contextmanager
def tenant_context(tenant_id: uuid.UUID | None, is_superadmin: bool = False):
    """Scope a block of code to a given tenant (useful for scripts/tests)."""
    tenant_token = current_tenant_id.set(tenant_id)
    superadmin_token = current_is_superadmin.set(is_superadmin)
    try:
        yield
    finally:
        current_tenant_id.reset(tenant_token)
        current_is_superadmin.reset(superadmin_token)


@event.listens_for(Session, "do_orm_execute")
def _apply_tenant_filter(execute_state):
    if execute_state.is_column_load or execute_state.is_relationship_load:
        return

    tenant_id = current_tenant_id.get()
    if tenant_id is None or current_is_superadmin.get():
        return

    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            Company,
            lambda cls: cls.id == tenant_id,
            include_aliases=True,
        ),
        with_loader_criteria(
            User,
            lambda cls: cls.company_id == tenant_id,
            include_aliases=True,
        ),
    )
