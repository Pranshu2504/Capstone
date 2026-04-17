# Capstone — ZORA Virtual Try-On

## What the App Does
ZORA is a mobile fashion app. Users upload photos → a 3D body mesh is generated from their measurements → they can virtually try on clothes → garments can be scraped from any product URL → an AI fit recommendation is generated with size advice and style reasoning.

## Monorepo Structure

```
Capstone/
├── ai/          # ML models, inference services, AI pipelines (Python 3.11, PyTorch, FastAPI on port 8001)
├── backend/     # REST API server (Python 3.11, FastAPI on port 8000)
└── frontend/    # React Native mobile app (TypeScript, React Navigation, Reanimated)
```

## How Services Communicate
- **frontend → backend**: HTTP calls using native `fetch` to `API_BASE_URL` (set in `.env` / build config — never hardcoded)
- **backend → ai**: internal `httpx` calls to `http://localhost:8001`
- **All external calls**: free/open-source, self-hosted models only — no paid APIs

## Shared External Services — All Free / Open-Source

> [!IMPORTANT]
> **Model-Agnostic Architecture**: The open-source model landscape evolves extremely quickly. The models listed below are current SOTA references, but code must be written to be **model-agnostic**. Use generic adapters (e.g., `BaseVTONService`) and environment variables (e.g., `VTON_ENDPOINT`, `OLLAMA_MODEL`) rather than hardcoding tight coupling to specific model repos.

| Domain | Example SOTA Models (Do not hardcode) | Default Run Paradigm |
|--------|----------------------------------------|----------------------|
| **Virtual Try-on (VTON)** | IDM-VTON, CatVTON, OOTDiffusion | Self-hosted inference via Repo Wrapper |
| **3D Body Mesh** | SMPLest-X, HMR2.0 (4D-Humans) | Self-hosted via Python adapter |
| **Reasoning & Fit** | Llama 3.1 8B, Mistral-Nemo | Local API via Ollama (`env: OLLAMA_MODEL`) |
| **Vision/OCR** | LLaVA, Qwen2-VL | Local API via Ollama/HF |
| **Style Embeddings** | OpenCLIP (ViT-L/14 LAION) | Self-hosted pipeline |
| **Vector Search** | Qdrant | Self-hosted `qdrant/qdrant` container |
| **Background Removal**| rembg | pip package `rembg` |
| **Weather** | Open-Meteo | Free API |

## Shared Infrastructure

| Service | Purpose | Env Var |
|---------|---------|---------|
| PostgreSQL | Primary relational DB | `DATABASE_URL` |
| MinIO (local) or S3 | Image / mesh file storage | `S3_BUCKET`, `S3_ENDPOINT_URL`, `AWS_*` |
| Redis | Job queue, caching | `REDIS_URL` |
| Qdrant | Style embedding vector search | `QDRANT_URL` |
| Ollama | Local LLM inference | `OLLAMA_BASE_URL` (default `http://localhost:11434`) |

## Global Constraints (apply to all three services)
1. **No paid APIs, no hardcoded secrets** — use env vars, loaded via `python-dotenv` or React Native config.
2. **Every service must expose `/health`** — returns `{"status": "ok", "service": "<name>"}`.
3. **Pydantic v2 for all data models** in `ai/` and `backend/`.
4. **File uploads**: validate MIME type + size (max 10 MB) before any processing.
5. **Never call ML models directly from backend** — always proxy to the `ai/` inference service.
6. **No session state in backend** — JWT-only auth, stateless.
7. **All async I/O** — `async def` endpoints, `httpx.AsyncClient` for outbound calls.

## Development Setup
```bash
# 0. Pull base models into Ollama (one-time)
# Ensure models correspond to your .env config (e.g. OLLAMA_MODEL=llama3.1:8b)
ollama pull llama3.1:8b
ollama pull llava:13b

# 1. Start Qdrant
docker run -p 6333:6333 qdrant/qdrant

# 2. Start MinIO (local S3)
docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"

# 3. Start AI inference service
cd ai && uvicorn main:app --port 8001 --reload

# 4. Start backend
cd backend && uvicorn main:app --port 8000 --reload

# 5. Start frontend
cd frontend && npm start
# Android: npm run android
```

## Environment Files
Each subfolder has its own `.env` (gitignored). Copy `.env.example` to `.env` and fill values.
