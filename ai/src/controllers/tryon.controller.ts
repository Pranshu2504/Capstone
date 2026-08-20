/**
 * HTTP handlers for the try-on flow.
 *
 * Express 5 forwards rejected promises to the error middleware automatically,
 * so these are plain async functions with no wrapper.
 */

import type { Request, Response } from 'express';

import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { fashnService } from '../services/fashn.service.js';
import { jobStore, type TryOnJob } from '../services/jobStore.service.js';
import { tryOnService, type ImageSource } from '../services/tryon.service.js';
import {
  imageUrlFieldsSchema,
  listJobsQuerySchema,
  tryOnRequestSchema,
} from '../schemas/tryon.schema.js';
import type { UploadedFiles } from '../middleware/upload.js';
import { env } from '../config/env.js';

/** Shape a job for the wire. Keeps the client contract in one place. */
function serializeJob(job: TryOnJob) {
  return {
    jobId: job.id,
    predictionId: job.predictionId,
    status: job.status,
    fashnStatus: job.fashnStatus,
    model: job.model,
    images: job.results.map((result) => ({
      /** Prefer our mirrored copy — the CDN URL expires after 3 days. */
      url: result.storedUrl ?? result.cdnUrl,
      cdnUrl: result.cdnUrl,
      persisted: result.storedUrl !== null,
    })),
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    durationMs: job.durationMs,
    params: job.params,
  };
}

/** Express 5 types route params as `string | string[]`; we only ever want one. */
function readParam(req: Request, name: string): string | undefined {
  const value = (req.params as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Pull one image slot out of the request. A file part wins over a URL field,
 * so a client can send either without ambiguity.
 */
function readImageSource(req: Request, fieldName: string, urlValue: string | undefined): ImageSource {
  const files = req.files as UploadedFiles | undefined;
  const file = files?.[fieldName]?.[0];

  if (file) {
    return { kind: 'buffer', buffer: file.buffer, originalName: file.originalname };
  }

  if (urlValue) {
    return { kind: 'url', url: urlValue };
  }

  throw AppError.badRequest(
    `Missing "${fieldName}". Upload it as a file part, or pass "${fieldName}_url" pointing at a public image.`,
  );
}

/**
 * POST /api/tryon
 *
 * multipart/form-data with `model_image` and `garment_image` files (or
 * `model_image_url` / `garment_image_url`), plus optional model parameters.
 *
 * Returns 202 with a jobId to poll, or 200 with the finished image when
 * `wait=true` is sent.
 */
export async function createTryOn(req: Request, res: Response): Promise<void> {
  // Default to the fast interactive model unless the client names one.
  const body = { model: env.FASHN_DEFAULT_MODEL, ...req.body };

  const options = tryOnRequestSchema.parse(body);
  const urls = imageUrlFieldsSchema.parse(req.body);

  const person = readImageSource(req, 'model_image', urls.model_image_url);
  const garment = readImageSource(req, 'garment_image', urls.garment_image_url);

  logger.info('Try-on requested', {
    model: options.model,
    wait: Boolean(options.wait),
    personSource: person.kind,
    garmentSource: garment.kind,
  });

  const { job, completed } = await tryOnService.submit({ person, garment, options });

  res.status(completed ? 200 : 202).json(serializeJob(job));
}

/**
 * GET /api/tryon/:jobId
 *
 * Poll this after a 202. Terminal states are completed / failed / timeout.
 */
export async function getTryOnJob(req: Request, res: Response): Promise<void> {
  const jobId = readParam(req, 'jobId');
  const job = jobId ? jobStore.get(jobId) : undefined;

  if (!job) {
    throw AppError.notFound(`No try-on job with id "${jobId}".`);
  }

  res.json(serializeJob(job));
}

/** GET /api/tryon — recent jobs, newest first. */
export async function listTryOnJobs(req: Request, res: Response): Promise<void> {
  const { limit } = listJobsQuerySchema.parse(req.query);
  const jobs = jobStore.list(limit);

  res.json({ count: jobs.length, jobs: jobs.map(serializeJob) });
}

/** DELETE /api/tryon/:jobId — forget a job and its results. */
export async function deleteTryOnJob(req: Request, res: Response): Promise<void> {
  const jobId = readParam(req, 'jobId');

  if (!jobId || !jobStore.delete(jobId)) {
    throw AppError.notFound(`No try-on job with id "${jobId}".`);
  }

  res.status(204).send();
}

/**
 * GET /api/predictions/:predictionId
 *
 * Passthrough to FASHN's own /v1/status, for when you hold a prediction id but
 * not one of our job ids (e.g. debugging).
 */
export async function getPrediction(req: Request, res: Response): Promise<void> {
  const predictionId = readParam(req, 'predictionId');

  if (!predictionId) {
    throw AppError.badRequest('A prediction id is required.');
  }

  const status = await fashnService.getStatus(predictionId);
  res.json(status);
}

/** GET /api/fashn/credits — remaining FASHN credits. */
export async function getCredits(_req: Request, res: Response): Promise<void> {
  const credits = await fashnService.getCredits();
  res.json(credits);
}
