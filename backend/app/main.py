from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.tenant import TenantContextMiddleware  # also registers the do_orm_execute filter
from app.routers import assistant, auth, company, customers, dashboard, invoices, products

app = FastAPI(title="BizOps AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TenantContextMiddleware)

app.include_router(auth.router)
app.include_router(company.router)
app.include_router(customers.router)
app.include_router(products.router)
app.include_router(invoices.router)
app.include_router(dashboard.router)
app.include_router(assistant.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
