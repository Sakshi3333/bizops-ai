# BizOps AI

A two-part full-stack project:

- **`backend/`** — FastAPI (Python 3.12) API
- **`frontend/`** — React + TypeScript app (Vite)

## Quick start (Docker)

Requires Docker Desktop running. From this folder:

```bash
docker compose up -d --build
docker compose exec backend python -m app.seed   # optional demo data
```

- App: http://localhost:5173 · API: http://localhost:8000/docs
- Demo logins (password `demo1234`): `admin@demo.bizops`, `manager@demo.bizops`, `employee@demo.bizops`
- Set `GEMINI_API_KEY` (and a real `JWT_SECRET_KEY`) in your shell or a `.env` next to
  `docker-compose.yml` to enable the AI assistant.

## Roles

| Action | Employee | Manager / Admin |
|---|---|---|
| View everything, add/edit customers, create/send invoices, mark paid | ✅ | ✅ |
| Add/edit/archive products, archive customers, cancel invoices | ❌ | ✅ |

"Delete" on customers and products archives them (they stay on past invoices).

## Running the backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -e .
copy .env.example .env       # Windows, then fill in real values
alembic upgrade head
python -m app.seed           # optional demo data
uvicorn app.main:app --reload --port 8000
```

API runs at `http://localhost:8000`. See `backend/README.md` for details.

## Running the frontend

```bash
cd frontend
npm install
copy .env.example .env       # Windows, then fill in real values
npm run dev
```

App runs at `http://localhost:5173` and calls the backend's `/health`
endpoint on load to confirm the two sides can talk to each other.

## Prerequisites

- Python 3.12+
- Node.js 20+
- A PostgreSQL database (for `DATABASE_URL`)
