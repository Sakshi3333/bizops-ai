from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    anthropic_api_key: str = ""  # unused - assistant now uses Gemini, see gemini_api_key
    gemini_api_key: str = ""

    jwt_secret_key: str = "change-me-in-.env"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24

    # Comma-separated list of frontend origins allowed to call the API.
    cors_origins: str = "http://localhost:5173"

    # "production" refuses to start with the placeholder JWT secret.
    environment: str = "development"

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        # Pin the driver we install (psycopg2): some hosts hand out postgres://, which
        # SQLAlchemy rejects, and SQLAlchemy 2.1 maps a bare postgresql:// to psycopg 3.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg2://" + value.removeprefix(prefix)
        return value

    @model_validator(mode="after")
    def _require_real_secret_in_production(self) -> "Settings":
        if self.environment == "production" and self.jwt_secret_key in ("", "change-me-in-.env"):
            raise ValueError("JWT_SECRET_KEY must be set to a real secret when ENVIRONMENT=production")
        return self


settings = Settings()
