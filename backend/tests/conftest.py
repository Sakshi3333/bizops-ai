"""Test setup: the API runs against a throwaway in-memory SQLite database.

DATABASE_URL is set before anything from `app` is imported, so the tests never
touch (or need) the real Postgres.
"""

import os

os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


def register(client: TestClient, name: str = "Acme Traders") -> dict[str, str]:
    """Registers a company and returns its admin's auth headers."""
    slug = name.lower().replace(" ", "")
    response = client.post(
        "/auth/register-company",
        json={
            "company_name": name,
            "company_email": f"accounts@{slug}.in",
            "admin_name": "Admin",
            "admin_email": f"admin@{slug}.in",
            "admin_password": "password123",
        },
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    return register(client)
