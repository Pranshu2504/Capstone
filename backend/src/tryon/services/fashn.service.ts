/**
 * Thin, typed client for the FASHN API.
 *
 * FASHN is asynchronous throughout:
 *   POST /v1/run          → { id }            (queues a prediction)
 *   GET  /v1/status/{id}  → { status, output } (poll until terminal)
 *   GET  /v1/credits      → { credits }
 *
 * Optionally FASHN will POST the terminal payload to a webhook_url instead of
 * you polling. Both paths are supported here.
 */

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError, FashnRequestError } from '../utils/errors.js';
import {
  isTerminalStatus,
  RETRYABLE_FASHN_ERRORS,
  type FashnCreditsResponse,
  type FashnError,
  type FashnModelName,
  type FashnRunRequest,
  type FashnRunResponse,
  type FashnStatusResponse,
  type TryonMaxInputs,
  type TryonV16Inputs,
} from '../types/fashn.types.js';

/** HTTP status → the error name FASHN documents for it. */
const API_ERROR_NAME_BY_STATUS: Record<number, string> = {
  400: 'BadRequest',
  401: 'UnauthorizedAccess',
  403: 'UnauthorizedAccess',
  404: 'NotFound',
  429: 'RateLimitExceeded',
  500: 'InternalServerError',
};

/**
 * FASHN often answers with just `{"error": "UnauthorizedAccess"}` — the name
 * with no explanation. Substitute the meaning documented for each code so
 * callers get something actionable.
 */
const DOCUMENTED_MESSAGES: Record<string, string> = {
  BadRequest: 'Invalid request format — check the JSON structure and required parameters.',
  UnauthorizedAccess: 'Invalid or missing FASHN API key. Check FASHN_API_KEY in your .env.',
  NotFound: 'Resource not found — verify the endpoint URL and prediction id.',
  RateLimitExceeded: 'Too many requests in the window. Back off and retry.',
  ConcurrencyLimitExceeded: 'Too many concurrent predictions. Wait for in-flight jobs to finish.',
  OutOfCredits: 'No FASHN credits remaining. Top up at app.fashn.ai before retrying.',
  InternalServerError: 'FASHN had a server-side error. Retry with backoff.',
  ImageLoadError: 'FASHN could not fetch or decode an input image.',
  ContentModerationError: 'An input violated FASHN content policies.',
  InputValidationError: 'One or more parameters were invalid or inconsistent.',
  ThirdPartyError: 'An upstream provider refused the request.',
  UnavailableError: 'FASHN is temporarily overloaded. Retry with backoff.',
  PipelineError: 'FASHN hit an unexpected internal failure.',
};

const MAX_TRANSPORT_RETRIES = 3;

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** Abort the individual HTTP call after this many ms. */
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse whatever FASHN returned into a FashnError. The API is consistent about
 * `{ error: { name, message } }` but we defend against bare strings too.
 */
function parseErrorPayload(payload: unknown, fallbackName: string): FashnError {
  /** A message equal to the error name carries no information — explain it instead. */
  const describe = (name: string, message?: string): FashnError => {
    const useful = message && message !== name ? message : DOCUMENTED_MESSAGES[name];
    return { name, message: useful ?? 'FASHN returned an unspecified error.' };
  };

  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error: unknown }).error;

    // Some responses use a bare string, which is the error name itself.
    if (typeof error === 'string') {
      const name = error in DOCUMENTED_MESSAGES ? error : fallbackName;
      return describe(name, error);
    }
    if (error && typeof error === 'object') {
      const { name, message } = error as { name?: unknown; message?: unknown };
      return describe(
        typeof name === 'string' ? name : fallbackName,
        typeof message === 'string' ? message : undefined,
      );
    }
  }

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return describe(fallbackName, payload);
  }

  return describe(fallbackName);
}

/**
 * 429 with a `ConcurrencyLimitExceeded` or `OutOfCredits` body means something
 * different from a plain rate limit, so read the body before deciding.
 */
function refineRateLimitName(payload: unknown, fallback: string): string {
  const parsed = parseErrorPayload(payload, fallback);
  return parsed.name;
}

export class FashnService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  /**
   * FASHN_API_KEY is optional so the wardrobe API can boot without it. Routes
   * that reach FASHN are gated by requireTryOnConfigured, so an unset key
   * cannot reach a request — but fail loudly rather than sending `undefined`
   * as a bearer token if that guard is ever bypassed.
   */
  constructor(apiKey: string | undefined = env.FASHN_API_KEY, baseUrl: string = env.FASHN_BASE_URL) {
    if (!apiKey) {
      throw new Error('FASHN_API_KEY is not set — try-on is disabled on this server.');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const url = new URL(`${this.baseUrl}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    let lastError: AppError | undefined;

    for (let attempt = 1; attempt <= MAX_TRANSPORT_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);

      try {
        const response = await fetch(url, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });

        const rawBody = await response.text();
        let payload: unknown;
        try {
          payload = rawBody.length > 0 ? JSON.parse(rawBody) : null;
        } catch {
          payload = rawBody;
        }

        if (response.ok) {
          return payload as T;
        }

        let errorName = API_ERROR_NAME_BY_STATUS[response.status] ?? 'InternalServerError';
        if (response.status === 429) {
          errorName = refineRateLimitName(payload, 'RateLimitExceeded');
        }

        const parsed = parseErrorPayload(payload, errorName);
        const retryable = RETRYABLE_FASHN_ERRORS.has(parsed.name) && parsed.name !== 'OutOfCredits';

        lastError = new FashnRequestError({
          statusCode: response.status,
          fashnErrorName: parsed.name,
          message: parsed.message,
          retryable,
          details: { endpoint: options.path },
        });

        if (!retryable || attempt === MAX_TRANSPORT_RETRIES) throw lastError;

        // Honour Retry-After when FASHN sends it, otherwise exponential backoff.
        const retryAfterHeader = Number(response.headers.get('retry-after'));
        const backoffMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : 2 ** attempt * 500;

        logger.warn('FASHN request failed, retrying', {
          path: options.path,
          attempt,
          error: parsed.name,
          backoffMs,
        });
        await sleep(backoffMs);
      } catch (error) {
        if (error instanceof AppError) {
          if (!error.retryable || attempt === MAX_TRANSPORT_RETRIES) throw error;
          lastError = error;
          continue;
        }

        // Network failure or abort — worth one more try.
        const isAbort = error instanceof Error && error.name === 'AbortError';
        lastError = isAbort
          ? AppError.timeout(`FASHN did not respond within the timeout for ${options.path}.`)
          : AppError.internal(`Could not reach FASHN (${options.path}).`, error);

        if (attempt === MAX_TRANSPORT_RETRIES) throw lastError;
        await sleep(2 ** attempt * 500);
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? AppError.internal('FASHN request failed for an unknown reason.');
  }

  /**
   * Queue a prediction. Returns immediately with the prediction id — the image
   * is not ready yet.
   *
   * @param webhookUrl When set, FASHN POSTs the terminal payload here (up to 5
   *                   retries over ~5 minutes) instead of you polling.
   */
  async run<TInputs extends object>(
    modelName: FashnModelName,
    inputs: TInputs,
    webhookUrl?: string,
  ): Promise<string> {
    const body: FashnRunRequest<TInputs> = { model_name: modelName, inputs };

    const response = await this.request<FashnRunResponse>({
      method: 'POST',
      path: '/run',
      body,
      query: webhookUrl ? { webhook_url: webhookUrl } : undefined,
      // Payloads carry base64 images, so allow a generous upload window.
      timeoutMs: 120_000,
    });

    if (response.error) {
      throw new FashnRequestError({
        statusCode: 400,
        fashnErrorName: response.error.name,
        message: response.error.message,
      });
    }

    if (!response.id) {
      throw AppError.internal('FASHN accepted the request but returned no prediction id.');
    }

    logger.info('FASHN prediction queued', { predictionId: response.id, model: modelName });
    return response.id;
  }

  /** Fetch the current state of a prediction. */
  async getStatus(predictionId: string): Promise<FashnStatusResponse> {
    return this.request<FashnStatusResponse>({
      method: 'GET',
      path: `/status/${encodeURIComponent(predictionId)}`,
      timeoutMs: 30_000,
    });
  }

  /** Current credit balance — total, subscription and on-demand. */
  async getCredits(): Promise<FashnCreditsResponse> {
    return this.request<FashnCreditsResponse>({
      method: 'GET',
      path: '/credits',
      timeoutMs: 15_000,
    });
  }

  /**
   * Poll /v1/status until the prediction reaches a terminal state.
   *
   * @throws AppError on timeout, FashnRequestError when the prediction failed.
   */
  async waitForCompletion(
    predictionId: string,
    options: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
      onProgress?: (status: FashnStatusResponse) => void;
    } = {},
  ): Promise<FashnStatusResponse> {
    const pollIntervalMs = options.pollIntervalMs ?? env.TRYON_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? env.TRYON_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (options.signal?.aborted) {
        throw new AppError(499, 'ClientClosedRequest', 'The try-on was cancelled by the caller.');
      }

      const status = await this.getStatus(predictionId);
      options.onProgress?.(status);

      if (isTerminalStatus(status.status)) {
        if (status.status === 'completed') return status;

        const error = status.error ?? {
          name: 'PipelineError',
          message: `Prediction ended as "${status.status}" without an error message.`,
        };

        throw new FashnRequestError({
          // Runtime failures are FASHN-side, so surface them as 502 Bad Gateway.
          statusCode: 502,
          fashnErrorName: error.name,
          message: error.message,
          predictionId,
          retryable: RETRYABLE_FASHN_ERRORS.has(error.name),
        });
      }

      await sleep(pollIntervalMs);
    }

    throw AppError.timeout(
      `Prediction ${predictionId} was still pending after ${Math.round(timeoutMs / 1000)}s. ` +
        `It may still finish — poll /api/predictions/${predictionId} to check.`,
    );
  }

  /* ── Convenience wrappers, one per try-on model ─────────────────────── */

  /** Queue a `tryon-v1.6` prediction (fast, ~5-17s — good for the live mirror). */
  async runTryonV16(inputs: TryonV16Inputs, webhookUrl?: string): Promise<string> {
    return this.run<TryonV16Inputs>('tryon-v1.6', inputs, webhookUrl);
  }

  /** Queue a `tryon-max` prediction (higher fidelity, 1k/2k/4k, prompt-steerable). */
  async runTryonMax(inputs: TryonMaxInputs, webhookUrl?: string): Promise<string> {
    return this.run<TryonMaxInputs>('tryon-max', inputs, webhookUrl);
  }
}

/**
 * Constructed lazily. The wardrobe API must import this module even when no
 * FASHN key is configured, and the constructor throws in that case — so build
 * the real client on first use rather than at import time. Routes are gated by
 * requireTryOnConfigured, so first use only happens when a key exists.
 */
let instance: FashnService | undefined;

export const fashnService: FashnService = new Proxy({} as FashnService, {
  get(_target, property, receiver) {
    instance ??= new FashnService();
    const value = Reflect.get(instance, property, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
