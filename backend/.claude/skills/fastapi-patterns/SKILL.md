---
name: fastapi-patterns
description: Trigger when writing FastAPI routes, middleware, dependencies, error handlers, background tasks, file upload validation, or any backend API code for the ZORA backend
---

# FastAPI Patterns Skill

## Router Organization

Split routes by domain. Each file mounts on its own prefix.

```python
# backend/app/api/users.py
from fastapi import APIRouter
router = APIRouter(prefix="/users", tags=["users"])

# backend/app/api/garments.py
from fastapi import APIRouter
router = APIRouter(prefix="/garments", tags=["garments"])

# backend/main.py
from fastapi import FastAPI
from app.api import users, garments, tryon, jobs, health

app = FastAPI(title="ZORA API", version="1.0.0")
app.include_router(users.router)
app.include_router(garments.router)
app.include_router(tryon.router)
app.include_router(jobs.router)
app.include_router(health.router)
```

## Dependency Injection Patterns

```python
# backend/app/dependencies.py
from typing import AsyncGenerator
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_maker
from app.auth import decode_jwt
from app.models import User

bearer_scheme = HTTPBearer()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_jwt(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
```

## Error Handling with HTTPException

```python
from fastapi import HTTPException, status

# 400 — bad request / validation failed
raise HTTPException(status_code=400, detail="garment_url must be a valid HTTP URL")

# 401 — unauthenticated
raise HTTPException(status_code=401, detail="Authentication required")

# 403 — authenticated but forbidden
raise HTTPException(status_code=403, detail="You don't have access to this resource")

# 404 — resource not found
raise HTTPException(status_code=404, detail=f"Garment {garment_id} not found")

# 409 — conflict (duplicate)
raise HTTPException(status_code=409, detail="Email already registered")

# 422 — unprocessable (semantic validation beyond pydantic)
raise HTTPException(status_code=422, detail="person_photo: full body must be visible")

# 429 — rate limit
raise HTTPException(status_code=429, detail="Max 3 concurrent try-on jobs per user")

# 503 — upstream service down
raise HTTPException(status_code=503, detail="AI service unavailable — try again shortly")
```

## File Upload Validation

Always validate before doing any processing.

```python
from fastapi import UploadFile, HTTPException
import magic  # python-magic

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

async def validate_image_upload(file: UploadFile) -> bytes:
    """
    Read, validate MIME type and size, return raw bytes.
    Raises HTTPException on invalid input.
    """
    raw = await file.read()

    if len(raw) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=422,
            detail=f"File too large: {len(raw) / 1024 / 1024:.1f} MB — max 10 MB",
        )

    mime = magic.from_buffer(raw[:2048], mime=True)
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type: {mime}. Allowed: JPEG, PNG, WEBP",
        )

    return raw
```

## Background Tasks for Async VTON Jobs

Return a job ID immediately; let the worker process asynchronously.

```python
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, Form
from app.dependencies import get_current_user, get_db
from app.services.tryon_service import enqueue_tryon_job
from app.schemas.tryon import TryOnStartResponse

router = APIRouter(prefix="/tryon", tags=["tryon"])

@router.post("/start", response_model=TryOnStartResponse, status_code=202)
async def start_tryon(
    background_tasks: BackgroundTasks,
    garment_url: str = Form(...),
    person_photo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    raw_photo = await validate_image_upload(person_photo)
    job_id = str(uuid.uuid4())

    # Enqueue to Redis and kick off background worker
    background_tasks.add_task(
        enqueue_tryon_job,
        job_id=job_id,
        user_id=current_user.id,
        garment_url=garment_url,
        photo_bytes=raw_photo,
    )

    return TryOnStartResponse(job_id=job_id, status="queued", estimated_seconds=30)
```

## Proxying to ai/ Service

```python
import httpx
import os

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8001")

async def call_ai_service(endpoint: str, payload: dict, timeout: float = 120.0) -> dict:
    """
    Proxy a JSON request to the ai/ inference service.
    Raises HTTPException on failure.
    """
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.post(f"{AI_SERVICE_URL}{endpoint}", json=payload)
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="AI service unavailable")
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="AI service timed out")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"AI service error: {resp.text[:200]}",
        )
    return resp.json()
```

## Health Check Route Pattern

Every service must have this.

```python
# backend/app/api/health.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.dependencies import get_db

router = APIRouter(tags=["health"])

@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "service": "backend",
        "database": "ok" if db_ok else "unreachable",
    }
```

## Lifespan (model/connection loading)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown — nothing needed for stateless backend

app = FastAPI(lifespan=lifespan)
```

## Request/Response Pydantic Schemas

Always define separate request and response models — never reuse ORM models in routes.

```python
from pydantic import BaseModel, Field, EmailStr
from uuid import UUID
from datetime import datetime

class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    display_name: str = Field(..., min_length=1, max_length=100)

class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    created_at: datetime

    model_config = {"from_attributes": True}  # enables .model_validate(orm_obj)
```
