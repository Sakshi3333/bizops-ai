from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.tenant import TenantContextMiddleware  # also registers the do_orm_execute filter
from app.routers import auth, customers, dashboard, invoices, products

app = FastAPI(title="BizOps AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TenantContextMiddleware)

app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(products.router)
app.include_router(invoices.router)
app.include_router(dashboard.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
