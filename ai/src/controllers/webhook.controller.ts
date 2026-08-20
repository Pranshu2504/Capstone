/**
 * Receiver for FASHN webhook deliveries.
 *
 * FASHN POSTs the terminal payload — the same shape as GET /v1/status — to the
 * `webhook_url` supplied on /v1/run, retrying up to 5 times over roughly five
 * minutes until it gets a 2xx. We therefore:
 *   • answer 200 quickly, even for payloads we cannot match to a job;
 *   • treat delivery as idempotent, since retries may duplicate a payload.
 */

import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { jobStore } from '../services/jobStore.service.js';
import { tryOnService } from '../services/tryon.service.js';
import type { FashnWebhookPayload } from '../types/fashn.types.js';

/** Constant-time compare so the secret cannot be guessed byte by byte. */
function secretMatches(provided: string | undefined): boolean {
  if (!env.FASHN_WEBHOOK_SECRET) return true; // No secret configured — nothing to check.
  if (!provided) return false;

  const expected = Buffer.from(env.FASHN_WEBHOOK_SECRET);
  const actual = Buffer.from(provided);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** POST /api/webhooks/fashn?secret=... */
export async function handleFashnWebhook(req: Request, res: Response): Promise<void> {
  const provided = typeof req.query.secret === 'string' ? req.query.secret : undefined;

  if (!secretMatches(provided)) {
    logger.warn('Rejected FASHN webhook with a bad secret', { ip: req.ip });
    throw new AppError(401, 'UnauthorizedAccess', 'Invalid webhook secret.');
  }

  const payload = req.body as FashnWebhookPayload;

  if (!payload?.id || !payload?.status) {
    throw AppError.badRequest('Webhook payload must include "id" and "status".');
  }

  const job = jobStore.getByPredictionId(payload.id);

  if (!job) {
    // The job may have been swept, or this instance never issued it. Ack anyway
    // so FASHN stops retrying.
    logger.warn('Webhook for an unknown prediction', { predictionId: payload.id });
    res.status(200).json({ received: true, matched: false });
    return;
  }

  logger.info('FASHN webhook received', {
    predictionId: payload.id,
    jobId: job.id,
    status: payload.status,
  });

  if (payload.status === 'completed') {
    await tryOnService.finalizeSuccess(job.id, payload);
  } else {
    tryOnService.finalizeFailure(job.id, payload);
  }

  res.status(200).json({ received: true, matched: true, jobId: job.id });
}
