/**
 * In-memory registry of try-on jobs.
 *
 * A "job" is our own record wrapped around a FASHN prediction: it survives the
 * request that created it, so the web client can fire-and-poll. Jobs are held
 * in a Map and evicted after JOB_TTL_MS.
 *
 * Swap this for Postgres/Redis when the mirror needs history across restarts —
 * every consumer goes through this interface, so nothing else has to change.
 */

import { randomUUID } from 'node:crypto';

import { logger } from '../utils/logger.js';
import type { FashnError, FashnStatus } from '../types/fashn.types.js';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';

export interface TryOnJobResult {
  /** URL on FASHN's CDN. Expires 3 days after generation. */
  cdnUrl: string;
  /** Locally mirrored copy, when PERSIST_OUTPUTS is on and the download worked. */
  storedUrl: string | null;
  storedPath: string | null;
}

export interface TryOnJob {
  id: string;
  /** FASHN prediction id, set once /v1/run has accepted the request. */
  predictionId: string | null;
  status: JobStatus;
  /** The raw FASHN status, useful for surfacing "in_queue" vs "processing". */
  fashnStatus: FashnStatus | null;
  model: string;
  results: TryOnJobResult[];
  error: FashnError | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Wall-clock generation time in ms, once finished. */
  durationMs: number | null;
  /** Echo of the request parameters, minus the image payloads. */
  params: Record<string, unknown>;
}

/** Jobs older than this are evicted to keep memory bounded. */
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export class JobStore {
  private readonly jobs = new Map<string, TryOnJob>();
  /** predictionId → jobId, so webhook deliveries can find their job. */
  private readonly byPredictionId = new Map<string, string>();
  private sweepTimer: NodeJS.Timeout | null = null;

  create(model: string, params: Record<string, unknown>): TryOnJob {
    const now = new Date().toISOString();
    const job: TryOnJob = {
      id: randomUUID(),
      predictionId: null,
      status: 'queued',
      fashnStatus: null,
      model,
      results: [],
      error: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      durationMs: null,
      params,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  get(jobId: string): TryOnJob | undefined {
    return this.jobs.get(jobId);
  }

  getByPredictionId(predictionId: string): TryOnJob | undefined {
    const jobId = this.byPredictionId.get(predictionId);
    return jobId ? this.jobs.get(jobId) : undefined;
  }

  /** Most recent first. */
  list(limit = 50): TryOnJob[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  attachPrediction(jobId: string, predictionId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.predictionId = predictionId;
    job.status = 'processing';
    job.updatedAt = new Date().toISOString();
    this.byPredictionId.set(predictionId, jobId);
  }

  update(jobId: string, patch: Partial<Omit<TryOnJob, 'id' | 'createdAt'>>): TryOnJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    Object.assign(job, patch);
    job.updatedAt = new Date().toISOString();

    if (patch.status && ['completed', 'failed', 'timeout'].includes(patch.status)) {
      job.completedAt = job.updatedAt;
      job.durationMs = Date.parse(job.updatedAt) - Date.parse(job.createdAt);
    }

    return job;
  }

  delete(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.predictionId) this.byPredictionId.delete(job.predictionId);
    return this.jobs.delete(jobId);
  }

  /** Drop jobs past their TTL. Called on an interval by startSweeper(). */
  sweep(): number {
    const cutoff = Date.now() - JOB_TTL_MS;
    let removed = 0;

    for (const [jobId, job] of this.jobs) {
      if (Date.parse(job.createdAt) < cutoff) {
        if (job.predictionId) this.byPredictionId.delete(job.predictionId);
        this.jobs.delete(jobId);
        removed += 1;
      }
    }

    if (removed > 0) logger.debug('Swept expired try-on jobs', { removed });
    return removed;
  }

  startSweeper(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  stopSweeper(): void {
    if (!this.sweepTimer) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  get size(): number {
    return this.jobs.size;
  }
}

export const jobStore = new JobStore();
