import type { NextFunction, Request, Response } from 'express';

import { isTryOnConfigured } from '../config/env.js';

/**
 * Try-on needs a FASHN key; the rest of the API does not. When the key is
 * absent the server still starts and serves wardrobe data — these routes just
 * report why they are unavailable rather than failing with an opaque 500.
 */
export function requireTryOnConfigured(_req: Request, res: Response, next: NextFunction): void {
  if (isTryOnConfigured) return next();

  res.status(503).json({
    error: 'Try-on is not configured on this server',
    detail: 'Set FASHN_API_KEY in the environment to enable it.',
  });
}
