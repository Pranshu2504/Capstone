# ZORA

An AI wardrobe stylist. One React Native codebase ships to **Android** and to the
**web**; a TypeScript/Express API backs both.

| | |
| --- | --- |
| **Live app** | https://capstone-blush-iota.vercel.app |
| **API** | https://zora-api-wn30.onrender.com |
| API health | https://zora-api-wn30.onrender.com/health |

> The API runs on Render's free tier and sleeps after inactivity, so the first
> request in a while takes ~30s. The app stays usable meanwhile — the hooks fall
> back to bundled fixtures until the API answers.

```
Capstone/
├── frontend/     React Native app (Android) + Vite web target — deploys to Vercel
├── backend/      Express + Prisma + Postgres API           — deploys to Render
└── ai/           Standalone try-on service — superseded, see below
```

`backend/` serves **both** the wardrobe API and virtual try-on, so there is one
backend URL and the frontend needs a single `VITE_API_URL`.

> `ai/` still runs standalone on port 4001 if you want try-on in its own process,
> but its routes now live in `backend/src/tryon/` and that is what deploys.

The web build reuses `frontend/src` and `frontend/App.tsx` **verbatim**. Nothing in
the screens branches on platform for the sake of the web port: `vite.config.ts`
aliases `react-native` to `react-native-web` and points the handful of native-only
modules at shims in `frontend/src/shims/`.

---

## Running locally

You need **Node 20+** and a running **Postgres 14+**. Two terminals.

### 1. Backend — http://localhost:4000

```bash
cd backend
cp .env.example .env          # then edit DATABASE_URL if your Postgres user differs
createdb zora_dev
npm install
npm run db:deploy             # apply migrations
npm run db:seed               # load the demo wardrobe
npm run dev
```

Check it: `curl localhost:4000/health` → `{"ok":true,"db":"up",...}`

### 2. Frontend (web) — http://localhost:5173

```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install --legacy-peer-deps
npm run web
```

> `--legacy-peer-deps` is required: the React Native 0.81 dependency graph pins peer
> ranges that npm's strict resolver rejects.

### 3. Frontend (Android) — unchanged

```bash
cd frontend
npm run start                 # Metro, in its own terminal
npm run android
```

The Android build talks to `http://10.0.2.2:4000` (the emulator's alias for your
host's localhost) — see `frontend/src/config/api.ts`. On a physical device, change
that to your machine's LAN IP.

---

## API

All routes serve a single seeded demo user until auth ships.

| Method   | Route                       | Purpose                                  |
| -------- | --------------------------- | ---------------------------------------- |
| `GET`    | `/health`                   | Liveness + database check                |
| `GET`    | `/api/user/me`              | Demo user profile, palette, mood keywords |
| `GET`    | `/api/wardrobe`             | Wardrobe items (`?category=`, `?occasion=`, `?dustOff=`) |
| `GET`    | `/api/wardrobe/categories`  | Per-category counts for the closet grid  |
| `POST`   | `/api/wardrobe`             | Add an item                              |
| `PATCH`  | `/api/wardrobe/:id`         | Edit an item                             |
| `POST`   | `/api/wardrobe/:id/wear`    | Increment wear count, clear `dustOff`    |
| `DELETE` | `/api/wardrobe/:id`         | Remove an item                           |
| `GET`    | `/api/outfits`              | All outfits                              |
| `GET`    | `/api/outfits/today`        | The Mirror screen's hero outfit          |
| `POST`   | `/api/outfits`              | Create an outfit from item ids           |
| `GET`    | `/api/calendar`             | Planned days (`?from=`&`?to=`, YYYY-MM-DD) |
| `PUT`    | `/api/calendar`             | Upsert a planned day                     |
| `DELETE` | `/api/calendar/:date`       | Clear a planned day                      |
| `GET`    | `/api/trends`               | Trend cards                              |
| `GET`    | `/api/community/posts`      | Community feed                           |
| `GET`    | `/api/vibes`                | Vibes strip                              |

The frontend reaches these through `frontend/src/api/hooks.ts`. **Every hook falls
back to the bundled fixtures in `src/constants/mockData.ts` when the API is
unreachable**, so the UI still renders a complete demo with the backend switched
off. Each hook returns `isLive` to say whether it is showing server data.

---

## Virtual try-on

`backend/src/tryon/` wraps the [FASHN API](https://docs.fashn.ai). Submit a photo
of a person plus a garment image, poll the job, get a generated image back. These
routes are served by the same process as the wardrobe API, on the same port.

Set `FASHN_API_KEY` in `backend/.env` to enable it — it is a **paid** credential
(`tryon-v1.6` costs 1 credit per image, `tryon-max` up to 5; get one at
[app.fashn.ai](https://app.fashn.ai) → Developer API). **Without it the wardrobe
API still runs normally** and only the try-on routes report `503`.

> `/api/ready` reports FASHN reachability and your remaining credits without
> generating anything. Use it, not a real try-on, to check wiring.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET` | `/api/health` | Liveness — local only, no FASHN call |
| `GET` | `/api/ready` | FASHN reachability + remaining credits |
| `POST` | `/api/tryon` | Submit a try-on (multipart) |
| `GET` | `/api/tryon/:jobId` | Poll one job |
| `GET` | `/api/tryon` | Recent jobs |
| `DELETE` | `/api/tryon/:jobId` | Forget a job |

`POST /api/tryon` takes `model_image` and `garment_image` as file parts, or
`model_image_url` / `garment_image_url` if FASHN can fetch them itself. Pass
`wait=true` to block until the image is ready instead of polling.

### Getting good results

**Feed it one garment, not an outfit.** FASHN applies a single item. Handing it
a flat-lay containing a coat, shirt, trousers and belt makes it merge them into
one invented garment — which looks like a bug and is not.

**Set `category` explicitly.** It defaults to `auto`, which has to guess and
guesses badly on busy images. When trying on a known wardrobe item, pass the
category you already have: `tops`, `bottoms`, or `one-pieces`.

Also set `garment_photo_type` — `flat-lay` for a product shot, `model` for a
photo of someone wearing it.

### Result URLs are service-relative

Images come back as `/static/outputs/….png`, relative to the API — not to the
web app. The client prefixes them via `absoluteUrl()` in
`frontend/src/services/tryOnApi.ts`. Anything else consuming this API must do
the same, or use the `cdnUrl` field, which is absolute but **expires after 3
days**.

---

## Deploying

### Backend → Render

`render.yaml` at the repo root is a blueprint: **Render → New → Blueprint**, point
it at this repo. It provisions the web service and a free Postgres instance, runs
`prisma migrate deploy` during build, and health-checks `/health`.

One manual step: set **`CORS_ORIGIN`** on the service to your Vercel production URL
(e.g. `https://zora.vercel.app`). Vercel *preview* origins (`*.vercel.app`) are
already allowed in code.

**Seeding is automatic.** On boot the server checks for the demo user and seeds
it if the database is empty — Render's free tier has no Shell, so `npm run db:seed`
is not reachable there. It only runs against an empty database, so a restart never
overwrites real data. Set `AUTO_SEED=false` to opt out.

> On Render's free tier the service sleeps after inactivity, so the first request
> after a while takes ~30s to wake. The frontend's fixture fallback means the UI
> still renders during that cold start rather than showing an empty state.

### Frontend → Vercel

Import the repo and set **Root Directory to `frontend`** — `frontend/vercel.json`
supplies the rest (build command, output directory, SPA rewrites, asset caching).

Set one environment variable:

| Variable       | Value                              |
| -------------- | ---------------------------------- |
| `VITE_API_URL` | `https://<your-service>.onrender.com` |

Try-on is served by that same URL, so no second variable is needed.
(`VITE_AI_API_URL` still overrides it if you run the two apart.)

**It is read at build time, not runtime.** Vite compiles their values
directly into the JavaScript bundle, so:

- Setting it *after* a deploy does nothing until you **redeploy**.
- If it is unset at build time, the local fallback in `frontend/src/config/`
  (`http://localhost:4000`) is what gets compiled in — and every visitor's
  browser will then try to reach *their own* machine on that port, which fails.
  The symptom looks like a CORS or server problem and is neither.

Setting `FASHN_API_KEY` on Render does **not** address this. That key lets the
server talk to FASHN, server to server. It has nothing to do with how the
browser locates the API — that is `VITE_API_URL` alone.

To check what a live build actually contains:

```bash
curl -s https://<your-app>.vercel.app/assets/index-*.js | grep -o 'onrender.com'
```

No hit means `VITE_API_URL` was missing when the bundle was built.

---

## Checks

```bash
cd backend  && npm run typecheck
cd frontend && npm run typecheck      # runs both the native and web configs
cd frontend && npm run build:web      # production bundle
```
