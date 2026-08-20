# BizOps AI

A two-part full-stack project:

- **`backend/`** — FastAPI (Python 3.12) API
- **`frontend/`** — React + TypeScript app (Vite)

## Running the backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -e .
copy .env.example .env       # Windows, then fill in real values
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
