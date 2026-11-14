FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

COPY alembic.ini ./
COPY alembic ./alembic

EXPOSE 8000

# Apply any pending migrations, optionally load demo data (the seed is idempotent;
# DEMO_REFRESH_HOURS rebuilds it once it is that old), then start the API. Hosts like Render inject $PORT; locally it defaults to 8000.
CMD ["sh", "-c", "alembic upgrade head && if [ \"$SEED_DEMO_DATA\" = \"true\" ]; then python -m app.seed ${DEMO_REFRESH_HOURS:+--refresh-after-hours $DEMO_REFRESH_HOURS}; fi && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
