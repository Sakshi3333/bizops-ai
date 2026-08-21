import uuid
from contextlib import contextmanager
from contextvars import ContextVar

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.security import decode_access_token
from app.models.company import Company
from app.models.customer import Customer
from app.models.product import Product
from app.models.user import User, UserRole

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


class TenantContextMiddleware:
    """Sets the tenant contextvars once per request, in the request's own
    async task, before FastAPI's dependency resolution runs.

    This has to be plain ASGI (not Starlette's BaseHTTPMiddleware, and not
    something done inside the get_current_user dependency): FastAPI runs
    each sync dependency and the sync endpoint body via separate
    run_in_threadpool calls, each of which takes an independent copy of the
    current context. A contextvar.set() inside one of those threadpool
    calls (e.g. from within get_current_user) never propagates to the next
    one (e.g. the endpoint's own queries) - it's silently lost. Setting it
    here, directly in the request's async task before any threadpool hop
    happens, means every later copy correctly inherits it.

    Invalid/missing tokens are simply ignored here; get_current_user is
    still what enforces auth and returns 401.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        tenant_id: uuid.UUID | None = None
        is_superadmin = False

        headers = dict(scope.get("headers") or [])
        auth_header = headers.get(b"authorization", b"").decode("latin-1")
        if auth_header.lower().startswith("bearer "):
            try:
                payload = decode_access_token(auth_header[7:])
                company_id = payload.get("company_id")
                if company_id:
                    tenant_id = uuid.UUID(company_id)
                    is_superadmin = payload.get("role") == UserRole.SUPERADMIN.value
            except Exception:
                pass

        tenant_token = current_tenant_id.set(tenant_id)
        superadmin_token = current_is_superadmin.set(is_superadmin)
        try:
            await self.app(scope, receive, send)
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
        with_loader_criteria(
            Customer,
            lambda cls: cls.company_id == tenant_id,
            include_aliases=True,
        ),
        with_loader_criteria(
            Product,
            lambda cls: cls.company_id == tenant_id,
            include_aliases=True,
        ),
    )
