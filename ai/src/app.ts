import express from 'express';
import cors from 'cors';

import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

export function createApp(): express.Express {
  const app = express();

  // Trust the proxy so req.ip is accurate behind nginx/ngrok.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: env.corsOrigins === '*' ? true : env.corsOrigins,
      credentials: true,
    }),
  );

  // Base64 data URIs make for large JSON bodies when a client posts them directly.
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Concise request log. Skipped for static assets to keep output readable.
  app.use((req, res, next) => {
    if (req.path.startsWith('/static/')) return next();

    const startedAt = Date.now();
    res.on('finish', () => {
      logger.debug(`${req.method} ${req.originalUrl}`, {
        status: res.statusCode,
        ms: Date.now() - startedAt,
      });
    });
    next();
  });

  // Uploaded inputs and mirrored outputs.
  app.use(
    '/static',
    express.static(env.storage.root, {
      maxAge: '7d',
      index: false,
      dotfiles: 'ignore',
    }),
  );

  app.use('/api', apiRouter);

  app.get('/', (_req, res) => {
    res.json({
      service: 'ZORA smart-mirror backend',
      docs: 'See README.md for the endpoint reference.',
      endpoints: ['/api/health', '/api/ready', '/api/tryon', '/api/fashn/credits'],
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
