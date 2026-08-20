/**
 * Liveness and readiness probes.
 *
 * /health answers without touching FASHN — use it for container liveness.
 * /ready calls FASHN's credits endpoint, so it also proves the API key works
 * and that there are credits left to spend.
 */

import type { Request, Response } from 'express';

import { env } from '../config/env.js';
import { fashnService } from '../services/fashn.service.js';
import { jobStore } from '../services/jobStore.service.js';

const startedAt = Date.now();

export async function getHealth(_req: Request, res: Response): Promise<void> {
  res.json({
    status: 'ok',
    service: 'zora-backend',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    activeJobs: jobStore.size,
    defaultModel: env.FASHN_DEFAULT_MODEL,
    webhooksEnabled: env.FASHN_USE_WEBHOOKS,
  });
}

export async function getReadiness(_req: Request, res: Response): Promise<void> {
  try {
    const { credits } = await fashnService.getCredits();

    res.json({
      status: credits.total > 0 ? 'ready' : 'degraded',
      fashn: { reachable: true, credits },
      ...(credits.total > 0
        ? {}
        : { warning: 'FASHN credits are exhausted; try-on requests will fail with OutOfCredits.' }),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      fashn: {
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
