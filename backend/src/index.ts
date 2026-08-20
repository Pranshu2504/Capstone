import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import morgan from 'morgan';

import { env } from './lib/env.js';
import { HttpError } from './lib/http.js';
import { prisma } from './lib/prisma.js';
import { calendarRouter } from './routes/calendar.js';
import { discoverRouter } from './routes/discover.js';
import { outfitsRouter } from './routes/outfits.js';
import { userRouter } from './routes/user.js';
import { wardrobeRouter } from './routes/wardrobe.js';

const app = express();

app.set('trust proxy', 1); // Render terminates TLS at its proxy.
app.use(express.json({ limit: '2mb' }));
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

const server = app.listen(env.port, () => {
  console.log(`ZORA API listening on http://localhost:${env.port}`);
  console.log(`  CORS origins: ${env.corsOrigins.join(', ')}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  });
}

export { app };
