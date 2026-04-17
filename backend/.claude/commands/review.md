# Backend Code Review Checklist

Run through this checklist before marking any backend PR ready for review.

---

## Pydantic Models
- [ ] Every route has an explicit `response_model=` annotation
- [ ] Every request body uses a Pydantic `BaseModel` — no `dict` or `Any` in route signatures
- [ ] Response schemas use `model_config = {"from_attributes": True}` when validating from ORM objects
- [ ] No `Optional` field without a sensible default or explicit `= None`

## Database
- [ ] No raw SQL strings — use SQLAlchemy ORM `select()`, `update()`, `delete()`
- [ ] All DB calls use `await db.execute(...)` — no sync SQLAlchemy in async context
- [ ] New ORM models have a corresponding Alembic migration file
- [ ] No `db.commit()` in route handlers — let `get_db` dependency handle commit/rollback

## Authentication
- [ ] Every route that touches user data has `current_user: User = Depends(get_current_user)`
- [ ] `/health` endpoint is the only public route (no auth required)
- [ ] `/register` and `/login` are public (intentionally no auth)
- [ ] JWT secret loaded from `os.environ["JWT_SECRET_KEY"]` — not hardcoded

## File Uploads
- [ ] All `UploadFile` parameters pass through `validate_image_upload()` before processing
- [ ] File size checked (≤ 10 MB) before reading full content
- [ ] MIME type validated with `python-magic` — not just file extension
- [ ] Upload bytes stored in S3/MinIO — never written to local disk in production paths

## AI Service Calls
- [ ] All calls to `http://localhost:8001` use `call_ai_service()` helper with timeout
- [ ] No direct `import torch` or ML library imports in backend code
- [ ] AI service 503/504 errors are handled and return appropriate HTTP errors to client
- [ ] VTON and scrape calls use background tasks — routes return 202 immediately

## Security
- [ ] No hardcoded secrets, tokens, or API keys in any file
- [ ] All env vars loaded via `os.environ` or `pydantic-settings`
- [ ] No `print()` of user passwords, tokens, or PII
- [ ] No `eval()` or `exec()` anywhere

## Health Endpoint
- [ ] `GET /health` exists, queries the DB with `SELECT 1`, returns `{"status": "ok"}`
- [ ] Health route does not require auth

## HTTP Semantics
- [ ] GET routes are idempotent and read-only
- [ ] POST creates resources → 201 or 202 (background job)
- [ ] PUT replaces a resource entirely → 200
- [ ] PATCH partially updates → 200
- [ ] DELETE → 204 (no body)
- [ ] 404 returned when resource not found (not 200 with null)
- [ ] 403 returned when accessing another user's resource (not 404)

## httpx Usage
- [ ] All `httpx` calls use `async with httpx.AsyncClient(timeout=N)` — no default timeout
- [ ] Timeout is set appropriately per endpoint (scrape: 20s, VTON: 120s, recommend: 30s)
