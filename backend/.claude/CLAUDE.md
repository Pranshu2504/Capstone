# backend/ — FastAPI REST API Server

## Purpose
This folder is the REST API that the frontend calls. It orchestrates business logic and proxies ML work to the `ai/` inference service at `http://localhost:8001`. It never runs ML models or calls PyTorch directly.

## Stack
- **Language**: Python 3.11
- **Framework**: FastAPI + Uvicorn on **port 8000**
- **ORM**: SQLAlchemy 2.x (async) with Alembic migrations
- **Database**: PostgreSQL (via `DATABASE_URL`)
- **Cache / Queue**: Redis — job status for async VTON jobs
- **File storage**: MinIO (local dev) or AWS S3 via `aiobotocore`
- **HTTP client**: `httpx.AsyncClient` for calls to `ai/` service
- **Auth**: JWT via `python-jose`, password hashing via `passlib[bcrypt]`
- **Data validation**: Pydantic v2
- **Settings**: `pydantic-settings` reading from `.env`

## Key Rules
1. **Never call ML models directly** — proxy everything to `http://localhost:8001`.
2. **All routes use Pydantic request/response models** — no untyped dicts in route signatures.
3. **JWT-only auth** — stateless, `Authorization: Bearer <token>` header.
4. **File uploads**: validate MIME type (`image/jpeg`, `image/png`, `image/webp`) and size (≤ 10 MB) before processing.
5. **Async throughout** — `async def` routes, `AsyncSession`, `httpx.AsyncClient`.
6. **Background tasks** for long-running VTON jobs — return a `job_id` immediately, let frontend poll `/jobs/{id}`.

## Folder Layout
```
backend/
├── main.py                  # FastAPI app, mounts all routers
├── requirements.txt
├── .env.example
├── alembic/                 # Migration environment + versions/
├── alembic.ini
├── app/
│   ├── api/
│   │   ├── users.py         # /users routes
│   │   ├── garments.py      # /garments routes
│   │   ├── tryon.py         # /tryon routes (proxies to ai/)
│   │   ├── jobs.py          # /jobs/{id} polling route
│   │   └── health.py        # GET /health
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── services/            # Business logic, ai/ proxy calls
│   ├── dependencies.py      # get_db, get_current_user FastAPI deps
│   └── config.py            # pydantic-settings Settings class
└── tests/
```

## Environment Variables
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/zora
REDIS_URL=redis://localhost:6379
S3_BUCKET=zora-assets
S3_ENDPOINT_URL=http://localhost:9000   # MinIO local; blank for real S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
JWT_SECRET_KEY=
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
AI_SERVICE_URL=http://localhost:8001
```

## Skills Available
- `fastapi-patterns` — route patterns, middleware, background tasks, file upload validation
- `database` — SQLAlchemy models, Alembic migrations, async query patterns
- `auth` — JWT creation/validation, current user dependency, password hashing
