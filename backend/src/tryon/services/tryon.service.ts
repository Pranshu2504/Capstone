/**
 * Try-on orchestration: turns an HTTP upload into a finished, stored image.
 *
 * Flow
 *   1. Validate both images against FASHN's documented limits.
 *   2. Save them locally (so the mirror can show what was requested).
 *   3. Encode as data URIs and POST /v1/run.
 *   4. Either poll to completion (sync mode) or return a job id and finish in
 *      the background (async mode / webhook mode).
 *   5. Mirror the CDN outputs into local storage before the 3-day expiry.
 */

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError, FashnRequestError } from '../utils/errors.js';
import { inspectImage, isDataUri, isHttpUrl, toDataUri } from '../utils/image.js';
import { fashnService, type FashnService } from './fashn.service.js';
import { jobStore, type JobStore, type TryOnJob } from './jobStore.service.js';
import { storageService, type StorageService } from './storage.service.js';
import type { TryOnRequest } from '../schemas/tryon.schema.js';
import type {
  FashnStatusResponse,
  TryonMaxInputs,
  TryonV16Inputs,
} from '../types/fashn.types.js';

/** One image slot: either raw bytes we uploaded, or a URL FASHN will fetch. */
export type ImageSource =
  | { kind: 'buffer'; buffer: Buffer; originalName?: string }
  | { kind: 'url'; url: string };

export interface TryOnInput {
  /** Photo of the person standing at the mirror. */
  person: ImageSource;
  /** Photo of the garment to wrap onto them. */
  garment: ImageSource;
  options: TryOnRequest;
}

/** One garment in a layered try-on, applied on top of the previous result. */
export interface ChainGarment {
  source: ImageSource;
  /** FASHN needs to know what it is replacing; "auto" guesses, badly for layers. */
  category: 'auto' | 'tops' | 'bottoms' | 'one-pieces';
}

export interface ChainInput {
  person: ImageSource;
  garments: ChainGarment[];
  options: TryOnRequest;
}

export interface TryOnSubmission {
  job: TryOnJob;
  /** Present only when the caller asked to wait. */
  completed: boolean;
}

export class TryOnService {
  constructor(
    private readonly fashn: FashnService = fashnService,
    private readonly jobs: JobStore = jobStore,
    private readonly storage: StorageService = storageService,
  ) {}

  /**
   * Turn an image slot into something FASHN accepts. Buffers are validated,
   * archived locally and inlined as base64; URLs are passed straight through.
   */
  private async resolveImage(
    source: ImageSource,
    label: string,
  ): Promise<{ value: string; storedPath: string | null; storedUrl: string | null }> {
    if (source.kind === 'url') {
      if (!isHttpUrl(source.url) && !isDataUri(source.url)) {
        throw AppError.badRequest(`${label} must be an http(s) URL or a base64 data URI.`);
      }
      return { value: source.url, storedPath: null, storedUrl: null };
    }

    const metadata = inspectImage(source.buffer, label);
    const stored = await this.storage.saveUpload(source.buffer, metadata.mimeType, label);

    logger.debug('Prepared image for FASHN', {
      label,
      mimeType: metadata.mimeType,
      dimensions: `${metadata.width}x${metadata.height}`,
      kib: Math.round(metadata.byteLength / 1024),
    });

    /**
     * Prefer a public URL when we have one — it keeps the /v1/run payload small
     * and lets FASHN fetch lazily. Fall back to a base64 data URI, which works
     * on localhost with no public hostname at all.
     */
    const value = stored.publicUrl ?? toDataUri(source.buffer, metadata.mimeType);

    return { value, storedPath: stored.absolutePath, storedUrl: stored.publicUrl ?? stored.publicPath };
  }

  /** Build the model-specific `inputs` object exactly as the docs define it. */
  private buildInputs(
    options: TryOnRequest,
    personImage: string,
    garmentImage: string,
  ): { modelName: 'tryon-v1.6' | 'tryon-max'; inputs: TryonV16Inputs | TryonMaxInputs } {
    if (options.model === 'tryon-max') {
      const inputs: TryonMaxInputs = {
        model_image: personImage,
        product_image: garmentImage,
        resolution: options.resolution,
        generation_mode: options.generation_mode,
        num_images: options.num_images,
        output_format: options.output_format ?? 'png',
        return_base64: false,
      };
      if (options.prompt) inputs.prompt = options.prompt;
      if (options.seed !== undefined) inputs.seed = options.seed;

      return { modelName: 'tryon-max', inputs };
    }

    const inputs: TryonV16Inputs = {
      model_image: personImage,
      garment_image: garmentImage,
      category: options.category,
      mode: options.mode,
      garment_photo_type: options.garment_photo_type,
      segmentation_free: options.segmentation_free,
      moderation_level: options.moderation_level,
      num_samples: options.num_samples,
      output_format: options.output_format ?? 'png',
      return_base64: false,
    };
    if (options.seed !== undefined) inputs.seed = options.seed;

    return { modelName: 'tryon-v1.6', inputs };
  }

  /** The webhook FASHN should call, when webhook mode is enabled. */
  private webhookUrl(): string | undefined {
    if (!env.FASHN_USE_WEBHOOKS || !env.PUBLIC_BASE_URL) return undefined;

    const url = new URL('/api/webhooks/fashn', env.PUBLIC_BASE_URL);
    if (env.FASHN_WEBHOOK_SECRET) url.searchParams.set('secret', env.FASHN_WEBHOOK_SECRET);
    return url.toString();
  }

  /**
   * Submit a try-on. Returns as soon as FASHN has queued the prediction unless
   * `options.wait` is set, in which case it blocks until the image is ready.
   */
  async submit(input: TryOnInput): Promise<TryOnSubmission> {
    const { options } = input;

    // Strip the image payloads out of the echoed params — they are huge.
    const { wait, ...echoedParams } = options;
    const job = this.jobs.create(options.model, echoedParams);

    let personRef: Awaited<ReturnType<typeof this.resolveImage>>;
    let garmentRef: Awaited<ReturnType<typeof this.resolveImage>>;

    try {
      [personRef, garmentRef] = await Promise.all([
        this.resolveImage(input.person, 'model_image'),
        this.resolveImage(input.garment, 'garment_image'),
      ]);
    } catch (error) {
      this.jobs.update(job.id, {
        status: 'failed',
        error: {
          name: 'InputValidationError',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }

    this.jobs.update(job.id, {
      params: {
        ...echoedParams,
        model_image: personRef.storedUrl ?? '(remote url)',
        garment_image: garmentRef.storedUrl ?? '(remote url)',
      },
    });

    const { modelName, inputs } = this.buildInputs(options, personRef.value, garmentRef.value);

    let predictionId: string;
    try {
      predictionId = await this.fashn.run(modelName, inputs, this.webhookUrl());
    } catch (error) {
      const fashnError =
        error instanceof FashnRequestError
          ? { name: error.fashnErrorName, message: error.message }
          : { name: 'PipelineError', message: error instanceof Error ? error.message : String(error) };

      this.jobs.update(job.id, { status: 'failed', error: fashnError });
      throw error;
    }

    this.jobs.attachPrediction(job.id, predictionId);

    if (wait) {
      await this.awaitAndFinalize(job.id, predictionId);
      return { job: this.jobs.get(job.id)!, completed: true };
    }

    // Fire-and-forget: the client polls GET /api/tryon/:jobId. Webhook mode
    // still polls as a safety net in case a delivery is lost.
    void this.awaitAndFinalize(job.id, predictionId).catch((error) => {
      logger.debug('Background try-on settled with an error', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { job: this.jobs.get(job.id)!, completed: false };
  }

  /**
   * Wears several garments at once by running them in sequence: the person
   * photo goes in with the first garment, and each result becomes the model
   * image for the next.
   *
   * FASHN fits one garment per prediction, so a t-shirt and jeans genuinely
   * are two runs and two credits — this makes that explicit rather than
   * quietly dropping the second garment.
   *
   * One job id covers the whole chain, so the client polls the same way it
   * does for a single garment; `chain` on the job says which step is running.
   */
  async submitChain(input: ChainInput): Promise<TryOnSubmission> {
    const { garments, options } = input;
    if (!garments.length) throw AppError.badRequest('At least one garment is required.');

    const { wait, ...echoedParams } = options;
    const job = this.jobs.create(options.model, {
      ...echoedParams,
      chained: garments.length,
    });

    this.jobs.update(job.id, { chain: { total: garments.length, current: 1 } });

    const run = async (): Promise<void> => {
      // Starts as the person, then becomes whatever the last step produced.
      let model: ImageSource = input.person;

      for (const [index, garment] of garments.entries()) {
        this.jobs.update(job.id, { chain: { total: garments.length, current: index + 1 } });

        const [personRef, garmentRef] = await Promise.all([
          this.resolveImage(model, 'model_image'),
          this.resolveImage(garment.source, 'garment_image'),
        ]);

        // Category is per garment: a chain is precisely the case where one
        // "auto" guess cannot be right for every layer.
        const stepOptions = { ...options, category: garment.category } as TryOnRequest;
        const { modelName, inputs } = this.buildInputs(stepOptions, personRef.value, garmentRef.value);

        const predictionId = await this.fashn.run(modelName, inputs, this.webhookUrl());
        this.jobs.attachPrediction(job.id, predictionId);

        const prediction = await this.fashn.waitForCompletion(predictionId, {
          onProgress: (status) => this.jobs.update(job.id, { fashnStatus: status.status }),
        });

        const output = prediction.output?.[0];
        if (!output) {
          throw AppError.badRequest(
            `Garment ${index + 1} produced no image, so the remaining layers were skipped.`,
          );
        }

        const isLast = index === garments.length - 1;
        if (isLast) {
          await this.finalizeSuccess(job.id, prediction);
        } else {
          // Intermediate images are inputs, not results — feed the CDN URL
          // straight back in rather than mirroring every half-dressed step.
          model = { kind: 'url', url: output };
        }
      }
    };

    const onFailure = (error: unknown) => {
      const isTimeout = error instanceof AppError && error.code === 'GatewayTimeout';
      this.jobs.update(job.id, {
        status: isTimeout ? 'timeout' : 'failed',
        error:
          error instanceof FashnRequestError
            ? { name: error.fashnErrorName, message: error.message }
            : {
                name: isTimeout ? 'TimeoutError' : 'PipelineError',
                message: error instanceof Error ? error.message : String(error),
              },
      });
    };

    if (wait) {
      try {
        await run();
      } catch (error) {
        onFailure(error);
        throw error;
      }
      return { job: this.jobs.get(job.id)!, completed: true };
    }

    void run().catch((error) => {
      onFailure(error);
      logger.debug('Background try-on chain settled with an error', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { job: this.jobs.get(job.id)!, completed: false };
  }

  /** Poll to completion, then record the outcome on the job. */
  private async awaitAndFinalize(jobId: string, predictionId: string): Promise<void> {
    try {
      const result = await this.fashn.waitForCompletion(predictionId, {
        onProgress: (status) => {
          this.jobs.update(jobId, { fashnStatus: status.status });
        },
      });

      await this.finalizeSuccess(jobId, result);
    } catch (error) {
      const isTimeout = error instanceof AppError && error.code === 'GatewayTimeout';

      this.jobs.update(jobId, {
        status: isTimeout ? 'timeout' : 'failed',
        error:
          error instanceof FashnRequestError
            ? { name: error.fashnErrorName, message: error.message }
            : {
                name: isTimeout ? 'TimeoutError' : 'PipelineError',
                message: error instanceof Error ? error.message : String(error),
              },
      });

      throw error;
    }
  }

  /**
   * Record a completed prediction: mirror its outputs locally and mark the job
   * done. Shared by the polling path and the webhook path.
   */
  async finalizeSuccess(jobId: string, prediction: FashnStatusResponse): Promise<TryOnJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    if (job.status === 'completed') return job; // Webhook and poller raced; first one wins.

    const cdnUrls = prediction.output ?? [];

    const stored = env.PERSIST_OUTPUTS ? await this.storage.persistOutputs(cdnUrls, jobId) : [];

    const results = cdnUrls.map((cdnUrl, index) => ({
      cdnUrl,
      storedUrl: stored[index]?.publicUrl ?? stored[index]?.publicPath ?? null,
      storedPath: stored[index]?.absolutePath ?? null,
    }));

    logger.info('Try-on completed', {
      jobId,
      predictionId: prediction.id,
      outputs: results.length,
      durationMs: Date.now() - Date.parse(job.createdAt),
    });

    return this.jobs.update(jobId, {
      status: 'completed',
      fashnStatus: 'completed',
      results,
      error: null,
    });
  }

  /** Record a failed prediction. Shared by the polling path and the webhook path. */
  finalizeFailure(jobId: string, prediction: FashnStatusResponse): TryOnJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed') return job;

    return this.jobs.update(jobId, {
      status: 'failed',
      fashnStatus: prediction.status,
      error: prediction.error ?? { name: 'PipelineError', message: 'Prediction failed without detail.' },
    });
  }
}

export const tryOnService = new TryOnService();
