# Garment API Specification

## Base URL
`http://localhost:8000/garments`

All routes require `Authorization: Bearer <token>` unless noted.

---

## Endpoints

### GET /garments
List the current user's wardrobe.

**Query params**
- `category`: filter by `upper_body | lower_body | dresses | accessories` (optional)
- `page`: default 1
- `per_page`: default 20, max 100

**Response 200**
```json
{
  "items": [
    {
      "id": "uuid",
      "product_name": "Uniqlo Polo Shirt",
      "brand": "Uniqlo",
      "category": "upper_body",
      "source_url": "https://...",
      "image_url": "https://minio.../garments/abc.jpg",
      "image_no_bg_url": "https://minio.../garments/abc_no_bg.png",
      "size_chart": [...],
      "is_active": true,
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 20
}
```

---

### POST /garments/scrape
Scrape a garment from a product URL and add it to the wardrobe.

**Request**
```json
{
  "url": "https://www.uniqlo.com/us/en/products/E459692-000",
  "category": "upper_body"
}
```

- `category` is optional — auto-detected from scraper if omitted
- `url` must be a valid `http(s)://` URL

**Response 202** — async job (scraping may take 5–15s)
```json
{
  "job_id": "uuid",
  "status": "queued",
  "estimated_seconds": 10
}
```

**Response 422**
```json
{"detail": "url: must be a valid fashion product URL"}
```

---

### GET /garments/{garment_id}
Get a single garment by ID.

**Response 200** — GarmentResponse

**Response 404**
```json
{"detail": "Garment not found"}
```

**Response 403** — garment belongs to another user
```json
{"detail": "Access denied"}
```

---

### DELETE /garments/{garment_id}
Soft-delete a garment (sets `is_active = false`).

**Response 204** — no body

---

### GET /garments/{garment_id}/recommend
Get a fit recommendation for this garment based on user's stored body measurements.

**Response 200**
```json
{
  "garment_id": "uuid",
  "recommended_size": "M",
  "verdict": "perfect_fit",
  "confidence": 0.91,
  "fit_breakdown": {
    "chest": "good",
    "waist": "good"
  },
  "reasoning": "Based on your 88 cm chest, size M provides ideal ease for a relaxed polo fit.",
  "ease_applied_cm": {"chest": 6, "waist": 4}
}
```

**Response 404** — no body measurements stored
```json
{"detail": "No body measurements found. Complete your body scan first."}
```

**Response 404** — garment has no size chart
```json
{"detail": "No size chart available for this garment. Cannot compute recommendation."}
```

---

### POST /garments/{garment_id}/tryon
Start a virtual try-on job for this garment using the user's latest selfie.

**Content-Type**: `multipart/form-data`

**Fields**
- `person_photo`: File (JPEG/PNG, ≤ 10 MB, optional if user has a saved body photo)

**Response 202**
```json
{
  "job_id": "uuid",
  "status": "queued",
  "estimated_seconds": 30
}
```

---

### GET /garments/jobs/{job_id}
Poll status of a scrape or try-on background job.

**Response 200 (in progress)**
```json
{
  "job_id": "uuid",
  "type": "scrape" | "tryon",
  "status": "queued" | "processing" | "complete" | "failed",
  "progress_message": "Removing garment background...",
  "created_at": "2025-01-15T10:00:00Z"
}
```

**Response 200 (scrape complete)**
```json
{
  "job_id": "uuid",
  "type": "scrape",
  "status": "complete",
  "garment_id": "uuid",
  "garment": {
    "product_name": "Uniqlo Polo Shirt",
    "brand": "Uniqlo",
    "category": "upper_body",
    "image_url": "https://..."
  }
}
```

**Response 200 (tryon complete)**
```json
{
  "job_id": "uuid",
  "type": "tryon",
  "status": "complete",
  "result_image_url": "https://minio.../tryon/uuid.jpg",
  "recommendation": { ... },
  "model_used": "idmvton",
  "processing_time_seconds": 22.4
}
```

**Response 200 (failed)**
```json
{
  "job_id": "uuid",
  "status": "failed",
  "error": "Could not extract garment image from URL",
  "error_code": "SCRAPE_FAILED"
}
```

---

## DB Table: `garments`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| owner_id | UUID FK → users(id) | CASCADE DELETE, indexed |
| product_name | VARCHAR(500) | |
| brand | VARCHAR(200) | nullable |
| category | VARCHAR(50) | `upper_body / lower_body / dresses / accessories` |
| source_url | VARCHAR(2000) | nullable |
| image_s3_key | VARCHAR(500) | nullable |
| image_no_bg_s3_key | VARCHAR(500) | nullable |
| size_chart | JSON | nullable, list of SizeChartRow |
| is_active | BOOLEAN | default true |
| created_at | TIMESTAMPTZ | |

## DB Table: `jobs`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | job_id returned to client |
| user_id | UUID FK | |
| type | VARCHAR(20) | `scrape / tryon / body_scan` |
| status | VARCHAR(20) | `queued / processing / complete / failed` |
| progress_message | TEXT | nullable |
| result_json | JSON | nullable, type-specific result |
| error | TEXT | nullable |
| error_code | VARCHAR(50) | nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
