"""
ZORA AI Service — main FastAPI app (port 8001).
Run: uvicorn main:app --port 8001 --reload
Docs: http://localhost:8001/docs
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")  # load ai/.env before anything else

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from body_mesh.router import router as body_mesh_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Future: pre-load lightweight adapters here
    yield
    # Future: unload / cleanup


app = FastAPI(
    title="ZORA AI Service",
    description=(
        "ML inference service for body mesh capture, virtual try-on, "
        "garment scraping and fit recommendation. Port 8001."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(body_mesh_router, prefix="/body-mesh", tags=["Body Mesh"])


@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "zora-ai", "version": "0.1.0"}
