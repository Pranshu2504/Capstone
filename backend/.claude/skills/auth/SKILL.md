---
name: auth
description: Trigger when working on authentication, JWT tokens, user login/register, password hashing, or protected routes in the ZORA backend
---

# Auth Skill

## Stack
- JWT: `python-jose[cryptography]`
- Password hashing: `passlib[bcrypt]`
- FastAPI security: `HTTPBearer` scheme

## JWT Creation and Validation

```python
# backend/app/auth.py
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext

JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24 hours default

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    """Create a JWT access token for the given user ID."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> Optional[dict]:
    """
    Decode and validate a JWT token.
    Returns payload dict on success, None on invalid/expired token.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            return None
        return payload
    except JWTError:
        return None
```

## FastAPI Current User Dependency

```python
# backend/app/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import decode_jwt
from app.models.user import User
from app.database import async_session_maker

bearer_scheme = HTTPBearer()

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
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found",
        )
    return user
```

## Register and Login Routes

```python
# backend/app/api/users.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db, get_current_user
from app.auth import hash_password, verify_password, create_access_token
from app.models.user import User
from app.schemas.user import (
    UserCreateRequest, UserLoginRequest, TokenResponse, UserResponse
)
from app.db_queries import email_exists, create_user, get_user_by_email
import uuid

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: UserCreateRequest, db: AsyncSession = Depends(get_db)):
    if await email_exists(db, body.email):
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        id=uuid.uuid4(),
        email=body.email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
    )
    await create_user(db, user)

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, token_type="bearer")


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, body.email)
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
```

## Pydantic Auth Schemas

```python
# backend/app/schemas/user.py
from pydantic import BaseModel, EmailStr, Field
from uuid import UUID
from datetime import datetime

class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=100)

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

## Protected Route Pattern

```python
# Any route requiring auth — just add the dependency
from app.dependencies import get_current_user
from app.models.user import User

@router.get("/garments", response_model=list[GarmentResponse])
async def list_my_garments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),   # ← this is all you need
):
    garments = await get_user_garments(db, current_user.id)
    return [GarmentResponse.model_validate(g) for g in garments]
```

## JWT Secret Key Generation

For local development, generate a secure secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Set in `.env`:
```
JWT_SECRET_KEY=<generated 64-char hex string>
```

Never commit the actual secret. Use a secrets manager (HashiCorp Vault, AWS Secrets Manager) in production.
