from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.core.tenant  # noqa: F401  (registers the do_orm_execute tenant filter)
from app.routers import auth

app = FastAPI(title="BizOps AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
