# ZORA Backend — Virtual Try-On

Node + Express + TypeScript service that takes a photo of a person and a photo of a
garment and returns the person wearing it, using the [FASHN API](https://docs.fashn.ai/).

This is the **static** half of the mirror: image in, image out. The dynamic/3D work
slots in later behind the same endpoints.

---

## Setup

```bash
cd backend
npm install
cp .env.example .env      # then paste your FASHN key into .env
npm run dev               # http://localhost:4000
```

Get a key at [app.fashn.ai](https://app.fashn.ai) → **Developer API** → *Create new API key*.

Check it works:

```bash
curl localhost:4000/api/ready
# {"status":"ready","fashn":{"reachable":true,"credits":{"total":234,...}}}
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Watch mode via tsx |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Types only, no emit |

---

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/tryon` | Submit a try-on |
| `GET` | `/api/tryon` | Recent jobs (`?limit=50`) |
| `GET` | `/api/tryon/:jobId` | Poll one job |
| `DELETE` | `/api/tryon/:jobId` | Forget a job |
| `GET` | `/api/predictions/:predictionId` | Raw FASHN status passthrough |
| `GET` | `/api/fashn/credits` | Remaining credits |
| `GET` | `/api/health` | Liveness — never calls FASHN |
| `GET` | `/api/ready` | Readiness — verifies the key and credits |
| `POST` | `/api/webhooks/fashn` | FASHN completion callback |
| `GET` | `/static/**` | Uploaded inputs and stored outputs |

### `POST /api/tryon`

`multipart/form-data` with two image parts:

| Field | Notes |
| --- | --- |
| `model_image` | Photo of the person. **Required** |
| `garment_image` | Photo of the clothing. **Required** |

Instead of files you may send `model_image_url` / `garment_image_url` as JSON —
any publicly reachable image URL works.

Shared options:

| Field | Default | Values |
| --- | --- | --- |
| `model` | `tryon-v1.6` | `tryon-v1.6`, `tryon-max` |
| `wait` | `false` | `true` blocks until the image is ready |
| `seed` | `42` | `0` … `4294967295` |
| `output_format` | `png` | `png`, `jpeg` |
| `reference` | — | Your own tag, e.g. a wardrobe item id |

**`tryon-v1.6`** — fast (~5–17s), 1 credit/image. Best for the live mirror.

| Field | Default | Values |
| --- | --- | --- |
| `category` | `auto` | `auto`, `tops`, `bottoms`, `one-pieces` |
| `mode` | `balanced` | `performance` (~5s), `balanced` (~8s), `quality` (~12–17s) |
| `garment_photo_type` | `auto` | `auto`, `flat-lay`, `model` |
| `segmentation_free` | `true` | `true`, `false` — `true` handles bulky garments better |
| `moderation_level` | `permissive` | `conservative`, `permissive`, `none` |
| `num_samples` | `1` | `1`–`4` |

**`tryon-max`** — higher fidelity, prompt-steerable, 1–5 credits/image.

| Field | Default | Values |
| --- | --- | --- |
| `prompt` | — | e.g. `"tuck in the shirt"`, `"roll up sleeves"` |
| `resolution` | `1k` | `1k` (~1MP), `2k` (~4MP), `4k` (~16MP) |
| `generation_mode` | `balanced` | `fast`, `balanced`, `quality` |
| `num_images` | `1` | `1`–`4` |

Timing runs from ~10s (`fast`+`1k`) to ~55s (`quality`+`4k`).

---

## Two ways to call it

### Asynchronous (recommended for the mirror UI)

Returns `202` immediately so you can show a spinner, then poll.

```bash
curl -X POST localhost:4000/api/tryon \
  -F "model_image=@person.jpg" \
  -F "garment_image=@shirt.jpg" \
  -F "category=tops"
```

```json
{ "jobId": "caea8313-…", "predictionId": "…", "status": "processing", "images": [] }
```

```bash
curl localhost:4000/api/tryon/caea8313-…
```

```json
{
  "jobId": "caea8313-…",
  "status": "completed",
  "fashnStatus": "completed",
  "durationMs": 6025,
  "images": [
    {
      "url": "/static/outputs/caea8313-…-0.png",
      "cdnUrl": "https://cdn.fashn.ai/…/output_0.png",
      "persisted": true
    }
  ],
  "error": null
}
```

Render `images[].url` — it prefers the local copy, which does not expire.

`status` is one of `queued`, `processing`, `completed`, `failed`, `timeout`.
`fashnStatus` mirrors FASHN's own `starting` / `in_queue` / `processing` / `completed`,
which is handy for a more granular progress label.

### Synchronous

Add `wait=true` and the response *is* the finished image. Simpler to script, but
the request is held open for the full generation time.

```bash
curl -X POST localhost:4000/api/tryon \
  -F "model_image=@person.jpg" -F "garment_image=@dress.jpg" \
  -F "model=tryon-max" -F "resolution=2k" -F "wait=true"
```

---

## Frontend example

```ts
async function tryOn(person: File, garment: File) {
  const form = new FormData();
  form.append('model_image', person);
  form.append('garment_image', garment);
  form.append('category', 'tops');

  const res = await fetch('http://localhost:4000/api/tryon', { method: 'POST', body: form });
  let job = await res.json();
  if (!res.ok) throw new Error(job.error.message);

  // Poll until the job reaches a terminal state.
  while (job.status === 'queued' || job.status === 'processing') {
    await new Promise((r) => setTimeout(r, 2000));
    job = await (await fetch(`http://localhost:4000/api/tryon/${job.jobId}`)).json();
  }

  if (job.status !== 'completed') throw new Error(job.error?.message ?? job.status);
  return job.images.map((i) => new URL(i.url, 'http://localhost:4000').href);
}
```

---

## How images reach FASHN

FASHN accepts an image either as a public URL or as a `data:image/…;base64,…` URI.
This backend picks automatically:

- **No `PUBLIC_BASE_URL`** (plain localhost) → uploads are inlined as base64. Works
  with zero cloud setup, which is why it is the default.
- **`PUBLIC_BASE_URL` set** → uploads are archived under `/static/uploads/` and the
  URL is sent instead, keeping the request small.

Every upload is validated locally first, against the limits FASHN documents — 30 MiB
per image, at least 15×15px, aspect ratio within 1:16 to 16:1, JPEG/PNG/WebP only.
Format is detected from magic bytes, not the client's `Content-Type`, so a mislabelled
file is caught here rather than burning a credit.

## Output retention

FASHN's CDN deletes outputs after **3 days**. With `PERSIST_OUTPUTS=true` (the default)
each result is copied into `storage/outputs/` and served from `/static/outputs/`, so a
saved wardrobe look keeps working. If a download fails the job still succeeds and falls
back to the CDN URL, with `persisted: false` telling you which happened.

## Webhooks

Polling is the default and needs no public hostname. If this server is reachable from
the internet, set `PUBLIC_BASE_URL`, `FASHN_USE_WEBHOOKS=true` and `FASHN_WEBHOOK_SECRET`
— FASHN then POSTs results to `/api/webhooks/fashn?secret=…` instead. The secret is
compared in constant time, and polling stays on as a safety net, so a lost delivery
never strands a job. Whichever path finishes first wins; the other is ignored.

---

## Errors

Every failure has the same shape:

```json
{ "error": { "code": "Fashn.OutOfCredits", "message": "…", "retryable": false } }
```

`retryable` tells you whether resending the identical request is worth trying.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `BadRequest` | 400 | Missing/invalid field — details in `error.details` |
| `UnsupportedMediaType` | 415 | Not a JPEG, PNG or WebP |
| `PayloadTooLarge` | 413 | Image over 30 MiB |
| `NotFound` | 404 | Unknown job or route |
| `Fashn.UnauthorizedAccess` | 401 | Bad `FASHN_API_KEY` |
| `Fashn.OutOfCredits` | 429 | Top up at app.fashn.ai |
| `Fashn.RateLimitExceeded` | 429 | Back off |
| `Fashn.ConcurrencyLimitExceeded` | 429 | Too many in flight |
| `Fashn.ImageLoadError` | 502 | FASHN could not fetch/decode an input |
| `Fashn.ContentModerationError` | 502 | Input violated content policy |
| `Fashn.PipelineError` | 502 | FASHN internal failure — retry |
| `GatewayTimeout` | 504 | Still pending past `TRYON_TIMEOUT_MS` |

Transient FASHN errors are retried automatically inside the client with exponential
backoff (3 attempts, honouring `Retry-After`), so most of these never surface.
Failed predictions do not consume credits.

---

## Layout

```
src/
  server.ts                       start-up, graceful shutdown
  app.ts                          express wiring, CORS, static, error handling
  config/env.ts                   env parsing/validation (zod)
  routes/index.ts                 the full route table
  controllers/
    tryon.controller.ts           request handling + response shaping
    webhook.controller.ts         FASHN callback receiver
    health.controller.ts          liveness / readiness
  services/
    fashn.service.ts              typed FASHN client: run, status, credits, polling
    tryon.service.ts              orchestration: validate → upload → run → store
    jobStore.service.ts           in-memory job registry
    storage.service.ts            uploads + output mirroring
  middleware/
    upload.ts                     multer config for the two image slots
    errorHandler.ts               one JSON error shape for everything
  schemas/tryon.schema.ts         request validation, per-model
  types/fashn.types.ts            FASHN contract, transcribed from the docs
  utils/                          errors, logger, image inspection
```

Jobs live in memory and are swept after 24h, so they do not survive a restart.
Everything goes through `JobStore`, so swapping in Postgres or Redis is a
single-file change when the mirror needs history.
