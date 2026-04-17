---
name: recommender
description: Trigger this skill when working on fit recommendations, size predictions, measurement comparison, outfit suggestions, style AI, or LLM-based fashion advice using local models
---

# Recommender Skill

## Goal
Given a user's body measurements and a garment's size chart, produce a structured fit recommendation (size verdict, confidence, reasoning). Uses rule-based logic first, then augments with a locally-running LLM (Ollama + Llama 3.1) for natural language reasoning. No paid APIs.

## Output Schema (Pydantic v2)

```python
from pydantic import BaseModel, Field
from typing import Literal

class FitRecommendation(BaseModel):
    recommended_size: str = Field(..., description="'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' or numeric e.g. '32'")
    verdict: Literal["perfect_fit", "slightly_tight", "slightly_loose", "size_up", "size_down", "unavailable"]
    confidence: float = Field(..., ge=0.0, le=1.0, description="Rule-based confidence score 0–1")
    fit_breakdown: dict[str, str] = Field(..., description="Per-measurement verdict: {'chest': 'good', 'waist': 'tight'}")
    reasoning: str = Field(..., description="LLM-generated plain-English explanation")
    ease_applied_cm: dict[str, float] = Field(..., description="Ease allowance added per dimension")
```

## Rule-Based Measurement Comparison

Ease allowances are added to body measurements before comparing to garment dimensions.
See `resources/fit-logic-rules.md` for the full ease table.

```python
from typing import Optional

# Ease allowances by garment category (in cm)
EASE_ALLOWANCES = {
    "t_shirt":      {"chest": 6,  "waist": 4,  "hip": 0},
    "dress_shirt":  {"chest": 8,  "waist": 6,  "hip": 0},
    "jacket":       {"chest": 12, "waist": 10, "hip": 6},
    "jeans":        {"chest": 0,  "waist": 2,  "hip": 4,  "inseam": 2},
    "dress":        {"chest": 6,  "waist": 4,  "hip": 6},
    "skirt":        {"chest": 0,  "waist": 2,  "hip": 4},
    "suit":         {"chest": 10, "waist": 8,  "hip": 6},
}

def compare_measurements(
    body_cm: dict[str, float],
    garment_size_chart: dict[str, dict[str, float]],  # {"S": {"chest": 96, ...}, ...}
    category: str,
) -> FitRecommendation:
    """
    Compare body measurements + ease to garment size chart.
    Returns FitRecommendation with best-fit size and confidence.
    """
    ease = EASE_ALLOWANCES.get(category, {"chest": 6, "waist": 4, "hip": 4})
    scores: dict[str, float] = {}

    for size, dims in garment_size_chart.items():
        size_score = 0.0
        dim_count = 0
        for dim, body_val in body_cm.items():
            if dim not in dims:
                continue
            needed = body_val + ease.get(dim, 0)
            garment_val = dims[dim]
            diff = garment_val - needed
            # Score: 0=perfect, negative=tight, positive=loose
            if -1 <= diff <= 3:
                size_score += 1.0        # perfect
            elif -3 <= diff < -1:
                size_score += 0.6        # slightly tight
            elif 3 < diff <= 6:
                size_score += 0.7        # slightly loose
            else:
                size_score += 0.2        # poor fit
            dim_count += 1

        if dim_count > 0:
            scores[size] = size_score / dim_count

    if not scores:
        return FitRecommendation(
            recommended_size="unknown",
            verdict="unavailable",
            confidence=0.0,
            fit_breakdown={},
            reasoning="No size chart data available for comparison.",
            ease_applied_cm=ease,
        )

    best_size = max(scores, key=lambda s: scores[s])
    confidence = scores[best_size]

    # Compute per-dimension verdict for best size
    fit_breakdown = {}
    best_dims = garment_size_chart[best_size]
    for dim, body_val in body_cm.items():
        if dim not in best_dims:
            continue
        needed = body_val + ease.get(dim, 0)
        diff = best_dims[dim] - needed
        if diff < -2:
            fit_breakdown[dim] = "tight"
        elif diff > 5:
            fit_breakdown[dim] = "loose"
        else:
            fit_breakdown[dim] = "good"

    verdict = _score_to_verdict(confidence, fit_breakdown)

    return FitRecommendation(
        recommended_size=best_size,
        verdict=verdict,
        confidence=round(confidence, 2),
        fit_breakdown=fit_breakdown,
        reasoning="",  # filled by LLM step below
        ease_applied_cm=ease,
    )


def _score_to_verdict(score: float, breakdown: dict[str, str]) -> str:
    tight_count = sum(1 for v in breakdown.values() if v == "tight")
    loose_count = sum(1 for v in breakdown.values() if v == "loose")
    if score >= 0.85:
        return "perfect_fit"
    elif tight_count > loose_count:
        return "size_up"
    elif loose_count > tight_count:
        return "size_down"
    elif score >= 0.6:
        return "slightly_tight" if tight_count > 0 else "slightly_loose"
    else:
        return "size_up"
```

## Ollama LLM Reasoning

> [!IMPORTANT]
> **Model-Agnostic Design**: Always use the `OLLAMA_MODEL` environment variable. Do not hardcode "llama3.1" or any specific model in the prompt logic or API calls, as newer, more efficient local models are constantly releasing.

After rule-based scoring, call Ollama for a plain-English explanation. Ollama runs locally at port 11434 — no internet required after model pull.

```python
import json
import httpx
import os

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")

async def generate_fit_reasoning(
    rec: FitRecommendation,
    garment_name: str,
    category: str,
    body_cm: dict[str, float],
) -> str:
    """
    Call Ollama Llama 3.1 to generate a friendly fit explanation.
    Returns plain-English reasoning string.
    """
    system_prompt = (
        "You are ZORA, a fashion fit assistant. "
        "Given measurement data, write a brief (2-3 sentence), friendly explanation "
        "of why a size was recommended. Be specific about which measurements drove the decision. "
        "Do not make up measurements. Output only the explanation text, no JSON."
    )

    user_prompt = (
        f"Garment: {garment_name} ({category})\n"
        f"Recommended size: {rec.recommended_size}\n"
        f"Verdict: {rec.verdict}\n"
        f"Confidence: {rec.confidence:.0%}\n"
        f"Fit breakdown: {json.dumps(rec.fit_breakdown)}\n"
        f"User measurements (cm): {json.dumps(body_cm)}\n"
        f"Ease applied (cm): {json.dumps(rec.ease_applied_cm)}\n"
        "Write a short, clear explanation for the recommendation."
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
                "options": {"temperature": 0.3, "top_p": 0.9},
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"].strip()
```

## OpenCLIP Style Embeddings + Qdrant Search

```python
import open_clip
import torch
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import os

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "style_embeddings")

# Load OpenCLIP once at startup
# pretrained="laion2b_s32b_b82k" — weights trained on LAION-2B (fully open-source, no OpenAI dependency)
# Alternative: "laion400m_e32" for a smaller/faster model
model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-L-14", pretrained="laion2b_s32b_b82k"
)
model.eval()

def embed_garment_image(image_path: str) -> list[float]:
    """Compute OpenCLIP ViT-L/14 embedding for a garment image."""
    from PIL import Image
    img = preprocess(Image.open(image_path)).unsqueeze(0)
    with torch.no_grad():
        embedding = model.encode_image(img)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
    return embedding.squeeze().tolist()


def search_similar_styles(embedding: list[float], top_k: int = 5) -> list[dict]:
    """Search Qdrant for visually similar garments."""
    client = QdrantClient(url=QDRANT_URL)
    results = client.search(
        collection_name=QDRANT_COLLECTION,
        query_vector=embedding,
        limit=top_k,
    )
    return [{"id": r.id, "score": r.score, "payload": r.payload} for r in results]
```

## Pitfalls

1. **Ollama must be running** — check with `curl http://localhost:11434/api/tags`. If not running, return reasoning="" rather than failing the whole request.
2. **Size chart normalization**: different brands use different measurement conventions (with-ease vs. body measurement). See `resources/fit-logic-rules.md` for normalization rules.
3. **Missing dimensions**: if a garment size chart only has chest (no waist/hip), compute confidence on available dimensions only.
4. **LLM timeout**: set `httpx` timeout to 30s. If Ollama times out, return the rule-based result with a generic reasoning fallback.
5. **Qdrant not available**: catch connection errors and return empty similar styles list — don't block the recommendation.

## Validation Steps

```bash
# Verify Ollama is running with correct model
curl http://localhost:11434/api/tags | python -m json.tool | grep llama3.1

# Run recommender unit test
python -m pytest ai/recommender/tests/ -v

# Expected: FitRecommendation schema valid, reasoning non-empty, confidence in [0,1]
```

## Resource References
- `resources/fit-logic-rules.md` — ease tables, confidence formula, size normalization rules
