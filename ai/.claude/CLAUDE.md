# ai/ — ML Models, Inference Services, AI Pipelines

## Purpose
This folder owns every ML model, inference pipeline, and AI integration. The backend never runs models directly — it always calls this service over HTTP on port 8001. All models and tools used here are free and open-source.

## Stack
- **Language**: Python 3.11
- **DL framework**: PyTorch 2.x (CUDA 12 preferred, CPU fallback supported)
- **Serving**: FastAPI + Uvicorn on **port 8001**
- **Data validation**: Pydantic v2
- **Package management**: `pip` with `requirements.txt`; virtual env in `.venv/`
- **Async HTTP client**: `httpx` for external/Ollama API calls

## Models & Tools — All Free / Open-Source

| Model / Tool | Task | Source |
|---|---|---|
| **SMPLest-X** | 3D body mesh from photos (primary) | `github.com/SMPLest/SMPLest-X` |
| **HMR2.0 / 4D-Humans** | Body mesh from single image (fallback) | `github.com/shubham-goel/4D-Humans` |
| **IDM-VTON** (ECCV 2024) | Virtual try-on, garment on body | `github.com/yisol/IDM-VTON` |
| **CatVTON** | Lightweight VTON fallback | `github.com/Zheng-Chong/CatVTON` |
| **OpenCLIP ViT-L/14** | Style embedding extraction | `github.com/mlfoundations/open_clip` |
| **rembg (u2net)** | Background removal from garment images | `github.com/danielgatis/rembg` |
| **Ollama + Llama 3.1 8B** | Fit reasoning, structured JSON output | `ollama.ai`, local port 11434 |
| **LLaVA 1.6 / Qwen2-VL** | Vision: size chart OCR, garment description | via Ollama or HuggingFace |
| **Qdrant** | Vector similarity search (style matching) | `github.com/qdrant/qdrant`, port 6333 |

## Inference Endpoint Rules
- All endpoints run on **port 8001**.
- Every module exposes `GET /health` → `{"status": "ok", "model": "<name>", "loaded": true|false}`.
- Return Pydantic model instances — never raw dicts.
- If model not loaded, return HTTP 503 with `{"detail": "Model not loaded"}` — do not crash the app.
- Log inference time for every request via a FastAPI middleware timer.
- Use `@asynccontextmanager` lifespan for model loading (not deprecated `on_event`).

## Folder Layout
```
ai/
├── main.py                  # FastAPI app, includes all routers
├── requirements.txt
├── .env.example
├── body_mesh/               # SMPLest-X + HMR2.0 pipeline
├── virtual_tryon/           # IDM-VTON + CatVTON pipeline
├── recommender/             # Fit logic + Ollama LLM integration
├── garment_scraper/         # Playwright scraper + rembg pipeline
├── embeddings/              # OpenCLIP + Qdrant
└── shared/
    ├── schemas.py           # Shared Pydantic models
    └── storage.py           # S3/MinIO upload/download helpers
```

## Environment Variables
```
# Vector search
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=style_embeddings

# Local LLM
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_VISION_MODEL=llava:13b

# File storage (MinIO local or AWS S3)
S3_BUCKET=zora-assets
S3_ENDPOINT_URL=http://localhost:9000   # leave blank for real AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1

# Redis job queue
REDIS_URL=redis://localhost:6379
```

## Skills Available
- `body-mesh` — SMPLest-X body mesh from photos, measurement extraction
- `virtual-tryon` — IDM-VTON / CatVTON garment try-on pipeline
- `recommender` — rule-based fit logic + Ollama LLM reasoning
- `garment-scraper` — Playwright scraper + rembg + Ollama vision for size charts
