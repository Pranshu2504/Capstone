import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import morgan from 'morgan';

import { env } from './lib/env.js';
import { HttpError } from './lib/http.js';
import { prisma } from './lib/prisma.js';
import { seedDemoData } from './lib/seedData.js';
import { calendarRouter } from './routes/calendar.js';
import { discoverRouter } from './routes/discover.js';
import { outfitsRouter } from './routes/outfits.js';
import { userRouter } from './routes/user.js';
import { wardrobeRouter } from './routes/wardrobe.js';
import { apiRouter as tryOnRouter } from './tryon/routes/index.js';
import { env as tryOnEnv, isTryOnConfigured } from './tryon/config/env.js';
import { storageService } from './tryon/services/storage.service.js';
import { jobStore } from './tryon/services/jobStore.service.js';

const app = express();

app.set('trust proxy', 1); // Render terminates TLS at its proxy.
// 50mb: try-on accepts base64 data URIs for the person and garment images.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin/curl requests send no Origin header.
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow any Vercel preview deployment of this project.
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up', env: env.nodeEnv, time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

app.get('/', (_req, res) => {
  res.json({ name: 'zora-backend', version: 1, health: '/health', api: '/api' });
});

app.use('/api/user', userRouter);
app.use('/api/wardrobe', wardrobeRouter);
app.use('/api/outfits', outfitsRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api', discoverRouter);

// Virtual try-on (FASHN). Ported from the standalone `ai/` service so a single
// deployment serves both halves of the API. Mounted last so its catch-all
// error handler cannot shadow the wardrobe routes.
if (tryOnEnv.PERSIST_OUTPUTS) {
  app.use(
    '/static',
    express.static(tryOnEnv.storage.root, { maxAge: '7d', index: false, dotfiles: 'ignore' }),
  );
}
app.use('/api', tryOnRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // A blocked origin is a client problem, not a server fault.
  if (err instanceof Error && err.message.includes('not allowed by CORS')) {
    return res.status(403).json({ error: err.message });
  }
  console.error('[unhandled]', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({
    error: env.nodeEnv === 'production' ? 'Internal server error' : message,
  });
});

/**
 * Seeds the demo data when the database has no demo user yet.
 *
 * Render's free tier provides no Shell, so `npm run db:seed` is not reachable
 * on a fresh deploy. Seeding here keeps a new environment self-provisioning.
 * It only ever runs against an empty database, so it cannot clobber real data.
 * Set AUTO_SEED=false to opt out.
 */
async function ensureSeeded(): Promise<void> {
  if (process.env.AUTO_SEED === 'false') return;

  try {
    const existing = await prisma.user.findUnique({
      where: { handle: env.demoUserHandle },
      select: { id: true },
    });
    if (existing) return;

    console.log(`No demo user found — seeding ${env.demoUserHandle}...`);
    await seedDemoData(prisma);
  } catch (err) {
    // Never block startup on seeding; /health stays honest either way.
    console.error('[seed] Auto-seed failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Startup work the standalone try-on service did in its own entrypoint: create
 * the upload/output directories, and start the sweeper that evicts expired jobs
 * from the in-memory store. Without the first, every upload fails with ENOENT;
 * without the second, the job map grows without bound.
 */
async function initTryOn(): Promise<void> {
  try {
    await storageService.init();
    jobStore.startSweeper();
  } catch (err) {
    console.error('[tryon] Initialisation failed:', err instanceof Error ? err.message : err);
  }
}

const server = app.listen(env.port, () => {
  console.log(`ZORA API listening on http://localhost:${env.port}`);
  console.log(`  CORS origins: ${env.corsOrigins.join(', ')}`);
  console.log(
    `  Try-on: ${isTryOnConfigured ? `enabled (${tryOnEnv.FASHN_DEFAULT_MODEL})` : 'disabled — set FASHN_API_KEY'}`,
  );
  void ensureSeeded();
  void initTryOn();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  });
}

export { app };
