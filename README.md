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

## Deployment (free tier)

| Part | Host | Config |
|---|---|---|
| PostgreSQL | [Neon](https://neon.tech) | copy the pooled connection string |
| API | [Render](https://render.com) (Docker) | `render.yaml` blueprint |
| Frontend | [Vercel](https://vercel.com) (Vite) | `frontend/vercel.json`, root directory `frontend` |

1. **Neon** — create a project and copy its connection string (`postgresql://...?sslmode=require`).
2. **Render** — *New → Blueprint*, pick this repo. Fill in `DATABASE_URL` (Neon), `CORS_ORIGINS`
   (the Vercel URL, no trailing slash) and optionally `GEMINI_API_KEY`. `JWT_SECRET_KEY` is generated.
   Migrations run and the demo company is seeded on startup (`SEED_DEMO_DATA=true`).
3. **Vercel** — import the repo, set *Root Directory* to `frontend`, add
   `VITE_API_URL=https://<your-render-service>.onrender.com`, deploy.
4. Back on Render, make sure `CORS_ORIGINS` matches the final Vercel domain.

The free Render instance sleeps after ~15 minutes idle; the first request after that takes
up to a minute, and the login page tells visitors so.
