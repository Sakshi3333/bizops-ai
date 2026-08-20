# BizOps AI — Backend

FastAPI (Python 3.12) backend skeleton.

## Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -e .
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
```

Fill in `.env` with your actual `DATABASE_URL` and `ANTHROPIC_API_KEY`.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Verify with:

```bash
curl http://localhost:8000/health
```

## Structure

```
app/
  core/       # settings, config
  models/     # SQLAlchemy models
  routers/    # FastAPI routers
  services/   # business logic
  main.py     # app entrypoint
```
