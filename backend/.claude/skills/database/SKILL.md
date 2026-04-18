---
name: database
description: Trigger when writing SQLAlchemy models, Alembic migrations, database queries, or anything touching PostgreSQL in the ZORA backend
---

# Database Skill

## SQLAlchemy 2.x Async Setup

```python
# backend/app/database.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
import os

DATABASE_URL = os.environ["DATABASE_URL"]  # must use asyncpg driver

engine = create_async_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass
```

## ORM Model Patterns

```python
# backend/app/models/user.py
from sqlalchemy import String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import uuid

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(60), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    measurements: Mapped["BodyMeasurement"] = relationship(back_populates="user", uselist=False)
    garments: Mapped[list["Garment"]] = relationship(back_populates="owner")
```

```python
# backend/app/models/body_measurement.py
from sqlalchemy import Float, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import uuid

class BodyMeasurement(Base):
    __tablename__ = "body_measurements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    chest_cm: Mapped[float] = mapped_column(Float, nullable=False)
    waist_cm: Mapped[float] = mapped_column(Float, nullable=False)
    hip_cm: Mapped[float] = mapped_column(Float, nullable=False)
    inseam_cm: Mapped[float] = mapped_column(Float, nullable=True)
    shoulder_width_cm: Mapped[float] = mapped_column(Float, nullable=True)
    arm_length_cm: Mapped[float] = mapped_column(Float, nullable=True)
    smplx_betas: Mapped[list[float]] = mapped_column(ARRAY(Float), nullable=True)

    user: Mapped["User"] = relationship(back_populates="measurements")
```

```python
# backend/app/models/garment.py
from sqlalchemy import String, Boolean, DateTime, ForeignKey, func, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import uuid

class Garment(Base):
    __tablename__ = "garments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_name: Mapped[str] = mapped_column(String(500), nullable=False)
    brand: Mapped[str] = mapped_column(String(200), nullable=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # upper_body/lower_body/dresses
    source_url: Mapped[str] = mapped_column(String(2000), nullable=True)
    image_s3_key: Mapped[str] = mapped_column(String(500), nullable=True)
    image_no_bg_s3_key: Mapped[str] = mapped_column(String(500), nullable=True)
    size_chart: Mapped[dict] = mapped_column(JSON, nullable=True)  # list of SizeChartRow dicts
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="garments")
```

## Alembic Migration Commands

```bash
# Initialize alembic (one-time)
alembic init alembic

# Generate migration from model changes
alembic revision --autogenerate -m "add garments table"

# Apply pending migrations
alembic upgrade head

# Roll back one migration
alembic downgrade -1

# View current revision
alembic current

# View migration history
alembic history --verbose
```

**alembic.ini** — set `sqlalchemy.url` to use the sync driver for migrations:
```
sqlalchemy.url = postgresql://user:pass@localhost:5432/zora
```

**alembic/env.py** — import all models so autogenerate detects them:
```python
from app.models.user import User
from app.models.body_measurement import BodyMeasurement
from app.models.garment import Garment
from app.database import Base
target_metadata = Base.metadata
```

## Async Session Pattern

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from app.models.garment import Garment
import uuid

# SELECT — fetch by primary key
async def get_garment(db: AsyncSession, garment_id: uuid.UUID) -> Garment | None:
    return await db.get(Garment, garment_id)

# SELECT with WHERE clause
async def get_user_garments(db: AsyncSession, user_id: uuid.UUID) -> list[Garment]:
    result = await db.execute(
        select(Garment)
        .where(Garment.owner_id == user_id, Garment.is_active == True)
        .order_by(Garment.created_at.desc())
    )
    return list(result.scalars().all())

# INSERT
async def create_garment(db: AsyncSession, garment: Garment) -> Garment:
    db.add(garment)
    await db.flush()   # write to DB, don't commit yet (dependency commits on request end)
    await db.refresh(garment)
    return garment

# UPDATE
async def soft_delete_garment(db: AsyncSession, garment_id: uuid.UUID) -> None:
    await db.execute(
        update(Garment)
        .where(Garment.id == garment_id)
        .values(is_active=False)
    )

# Check existence
async def email_exists(db: AsyncSession, email: str) -> bool:
    result = await db.execute(
        select(User.id).where(User.email == email).limit(1)
    )
    return result.scalar() is not None
```

## Common Query Patterns

```python
# Paginated list
async def list_garments(db: AsyncSession, user_id: uuid.UUID, page: int = 1, per_page: int = 20):
    offset = (page - 1) * per_page
    result = await db.execute(
        select(Garment)
        .where(Garment.owner_id == user_id, Garment.is_active == True)
        .order_by(Garment.created_at.desc())
        .limit(per_page)
        .offset(offset)
    )
    return result.scalars().all()

# Join query: user with measurements
from sqlalchemy.orm import selectinload

async def get_user_with_measurements(db: AsyncSession, user_id: uuid.UUID):
    result = await db.execute(
        select(User)
        .options(selectinload(User.measurements))
        .where(User.id == user_id)
    )
    return result.scalar_one_or_none()
```

## Database URL Format

```
# Async (for app)
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/zora

# Sync (for Alembic only)
# Set in alembic.ini — DO NOT use asyncpg here
sqlalchemy.url = postgresql://user:password@localhost:5432/zora
```
