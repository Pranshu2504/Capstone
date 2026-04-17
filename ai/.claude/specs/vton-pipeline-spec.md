# Virtual Try-On Pipeline — Full Specification

## Problem Statement
Users of ZORA want to see how a garment from any product URL will look on their body before buying. The system must take a product URL + user photo, automatically scrape the garment, generate a photorealistic try-on, and produce a fit recommendation — all using free, self-hosted ML models.

---

## Functional Requirements

1. **FR-01**: User can paste any fashion product URL (Myntra, Zara, H&M, ASOS, Uniqlo, etc.).
2. **FR-02**: System automatically scrapes the garment image and metadata from the URL.
3. **FR-03**: System removes background from the garment image.
4. **FR-04**: System composites the garment onto the user's photo using IDM-VTON.
5. **FR-05**: System produces a fit recommendation (size, verdict, reasoning) based on user body measurements.
6. **FR-06**: User receives a try-on result image and fit recommendation in a single response.
7. **FR-07**: All processing happens asynchronously — the frontend polls for job status.
8. **FR-08**: Every step has a graceful fallback (CatVTON if IDM-VTON OOM; "size chart not found" if scraping fails).
9. **FR-09**: No paid external APIs are used at any step.
10. **FR-10**: Result images are stored in S3/MinIO with a signed URL returned to the frontend.

---

## Full Pipeline: Step by Step

```
User pastes URL + selects photo
          │
          ▼
[1] POST /api/tryon/start
          │ returns {job_id, status: "queued"}
          │
          ▼
[2] Backend → Redis queue (job_id + url + user_photo_s3_key + user_id)
          │
          ▼
[3] AI service worker picks up job
          │
          ├─[3a] Scrape garment URL (Playwright)
          │       → extract product_name, image_url, size_chart, category
          │
          ├─[3b] Remove garment background (rembg)
          │       → garment_no_bg.png
          │
          ├─[3c] Download user photo from S3
          │
          ├─[3d] Run IDM-VTON (or CatVTON fallback)
          │       → tryon_result.jpg
          │
          ├─[3e] Upload result to S3 → signed URL (7-day expiry)
          │
          └─[3f] Compute fit recommendation
                  → rule-based comparison + Ollama Llama 3.1 reasoning
          │
          ▼
[4] AI service updates job status in Redis:
    {status: "complete", result_url, recommendation}
          │
          ▼
[5] Frontend polls GET /api/jobs/{job_id}
          │ until status == "complete" or "failed"
          ▼
[6] Frontend displays result image + fit card
```

---

## API Contract

### 1. Start Try-On Job
```
POST /api/tryon/start
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

Fields:
  garment_url: string (required) — product URL
  person_photo: File (required) — JPEG/PNG, max 10 MB
  category: string (optional) — "upper_body" | "lower_body" | "dresses"
            (auto-detected from scrape if omitted)

Response 202:
{
  "job_id": "uuid-v4",
  "status": "queued",
  "estimated_seconds": 30
}

Response 422:
{
  "detail": "person_photo exceeds 10 MB limit"
}

Response 429:
{
  "detail": "Rate limit: max 3 concurrent try-on jobs per user"
}
```

### 2. Poll Job Status
```
GET /api/jobs/{job_id}
Authorization: Bearer <jwt>

Response 200 (queued/processing):
{
  "job_id": "uuid-v4",
  "status": "queued" | "scraping" | "removing_bg" | "inferring" | "recommending",
  "progress_message": "Removing garment background..."
}

Response 200 (complete):
{
  "job_id": "uuid-v4",
  "status": "complete",
  "result_image_url": "https://minio.zora.local/zora-assets/tryon/uuid.jpg?X-Amz-Signature=...",
  "garment": {
    "product_name": "Uniqlo Dry-Ex Polo Shirt",
    "brand": "Uniqlo",
    "category": "upper_body",
    "original_url": "https://..."
  },
  "recommendation": {
    "recommended_size": "M",
    "verdict": "perfect_fit",
    "confidence": 0.91,
    "fit_breakdown": {"chest": "good", "waist": "good"},
    "reasoning": "Based on your 92 cm chest measurement, size M provides 6 cm of ease — ideal for a relaxed fit. Your waist sits comfortably within the M range as well.",
    "ease_applied_cm": {"chest": 6, "waist": 4}
  },
  "model_used": "idmvton",
  "processing_time_seconds": 22.4
}

Response 200 (failed):
{
  "job_id": "uuid-v4",
  "status": "failed",
  "error": "Could not extract garment image from URL",
  "error_code": "SCRAPE_FAILED"
}

Response 404:
{
  "detail": "Job not found"
}
```

### 3. Scrape Garment (internal — ai/ service)
```
POST http://localhost:8001/scrape
Content-Type: application/json

{
  "url": "https://www.uniqlo.com/..."
}

Response 200:
{
  "product_name": "...",
  "brand": "Uniqlo",
  "category": "upper_body",
  "garment_image_url": "https://...",
  "garment_image_no_bg_path": "/tmp/zora/abc_no_bg.png",
  "size_chart": [
    {"size_label": "S", "chest_cm": 88, "waist_cm": 72},
    {"size_label": "M", "chest_cm": 92, "waist_cm": 76},
    {"size_label": "L", "chest_cm": 96, "waist_cm": 80}
  ],
  "size_chart_source": "dom",
  "scrape_duration_seconds": 4.2
}

Response 422:
{"detail": "Cannot extract image from URL"}

Response 503:
{"detail": "Scraper busy — try again in 5s"}
```

### 4. Virtual Try-On (internal — ai/ service)
```
POST http://localhost:8001/tryon
Content-Type: application/json

{
  "person_image_path": "/tmp/zora/user_photo.jpg",
  "garment_image_path": "/tmp/zora/garment_no_bg.png",
  "category": "upper_body"
}

Response 200:
{
  "result_image_path": "/tmp/zora/tryon_result.jpg",
  "model_used": "idmvton",
  "inference_time_seconds": 18.3
}

Response 503:
{"detail": "IDM-VTON model not loaded"}
```

### 5. Fit Recommendation (internal — ai/ service)
```
POST http://localhost:8001/recommend
Content-Type: application/json

{
  "body_measurements": {
    "chest_cm": 92, "waist_cm": 76, "hip_cm": 96, "inseam_cm": 80
  },
  "size_chart": [...],
  "category": "upper_body",
  "garment_name": "Uniqlo Polo Shirt"
}

Response 200:
{
  "recommended_size": "M",
  "verdict": "perfect_fit",
  "confidence": 0.91,
  "fit_breakdown": {"chest": "good", "waist": "good"},
  "reasoning": "...",
  "ease_applied_cm": {"chest": 6, "waist": 4}
}
```

---

## Performance Constraints

| Step | Target | Hard Limit |
|------|--------|-----------|
| Garment scrape | < 5s | 15s |
| Background removal (rembg) | < 2s | 10s |
| IDM-VTON inference (GPU) | < 15s | 60s |
| IDM-VTON inference (CPU) | < 180s | 300s |
| CatVTON inference (GPU) | < 8s | 30s |
| Fit recommendation | < 3s | 15s (includes Ollama) |
| Total end-to-end (GPU) | < 30s | 90s |
| Total end-to-end (CPU) | < 300s | 480s |

---

## Edge Cases

1. **Invalid / non-product URL**: Return `SCRAPE_FAILED` with message "URL does not appear to be a fashion product page."
2. **Garment image behind login/paywall**: og:image usually still accessible. If not, return `SCRAPE_FAILED`.
3. **No size chart found**: Return recommendation with `size_chart_source: "not_found"` and `verdict: "unavailable"`. Inform user to check brand's size guide manually.
4. **Body not fully visible in photo**: Validate aspect ratio and body keypoint detection before sending to IDM-VTON. If invalid, return HTTP 422 with `"person_photo: full body must be visible"`.
5. **Garment is accessories (bag, shoes, hat)**: Detect `category: "accessories"` from scrape. Return 422 with `"Virtual try-on is only available for clothing (tops, bottoms, dresses)"`.
6. **IDM-VTON CUDA OOM**: Catch `torch.cuda.OutOfMemoryError`, retry with CatVTON. Log fallback in job status response.
7. **Ollama not running for fit reasoning**: Return rule-based recommendation with `reasoning: "AI reasoning unavailable — rule-based analysis used."` Do not fail the whole job.
8. **Rate limit hit (3 concurrent jobs/user)**: Return HTTP 429 immediately before queuing.
9. **S3/MinIO upload failure**: Retry 3 times with exponential backoff. If all fail, return result as base64 in response body (< 5 MB images only).
10. **Scraper blocked by anti-bot**: Log domain, return `SCRAPE_BLOCKED`. Suggest user screenshot the garment and upload manually (future feature).

---

## Acceptance Criteria

- [ ] `POST /api/tryon/start` with valid person photo + Uniqlo URL returns `job_id` within 500ms.
- [ ] `GET /api/jobs/{job_id}` returns `status: "complete"` within 90s on a GPU machine.
- [ ] Result image is a JPEG, at least 512×768 pixels.
- [ ] `recommendation.recommended_size` is a non-empty string matching a label from the garment's size chart.
- [ ] `recommendation.confidence` is a float in [0.0, 1.0].
- [ ] `recommendation.reasoning` is a non-empty string (at least 20 characters).
- [ ] Jobs for accessories return `status: "failed"` with `error_code: "UNSUPPORTED_CATEGORY"`.
- [ ] Uploading a 10.1 MB image returns HTTP 422 with file size error message.
- [ ] Garment background is removed (no white/grey rectangle around garment in result).
- [ ] All model weights are loaded from local disk — no external API calls during inference.
