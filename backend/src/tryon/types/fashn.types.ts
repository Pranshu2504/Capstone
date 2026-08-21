/**
 * Type definitions for the FASHN API (https://api.fashn.ai/v1).
 *
 * Transcribed from the official documentation:
 *   - https://docs.fashn.ai/api-reference/tryon-max
 *   - https://docs.fashn.ai/api-reference/tryon-v1-6
 *   - https://docs.fashn.ai/api-overview/error-handling
 *   - https://docs.fashn.ai/utility-endpoints/credits
 *
 * The API is asynchronous: POST /v1/run returns a prediction id, which you then
 * poll at GET /v1/status/{id} (or receive via webhook) until it reaches a
 * terminal status.
 */

/** An image input: either a publicly reachable URL or a `data:image/...;base64,` URI. */
export type FashnImageInput = string;

/** Every model FASHN exposes through the universal /v1/run endpoint. */
export type FashnModelName =
  | 'tryon-max'
  | 'tryon-v1.6'
  | 'product-to-model'
  | 'model-create'
  | 'model-variation'
  | 'background-change'
  | 'reframe'
  | 'edit'
  | 'image-to-video';

/* ────────────────────────────────────────────────────────────
   tryon-max  —  highest fidelity, 1k/2k/4k, prompt-steerable
   ──────────────────────────────────────────────────────────── */

export type TryonMaxResolution = '1k' | '2k' | '4k';
export type TryonMaxGenerationMode = 'fast' | 'balanced' | 'quality';

export interface TryonMaxInputs {
  /** Garment / accessory to place onto the model. Required. */
  product_image: FashnImageInput;
  /** Photo of the person who will wear the product. Required. */
  model_image: FashnImageInput;
  /** Optional styling instruction, e.g. "tuck in shirt", "roll up sleeves". Default "". */
  prompt?: string;
  /** Output size tier: 1k ≈ 1MP, 2k ≈ 4MP, 4k ≈ 16MP. Default "1k". */
  resolution?: TryonMaxResolution;
  /** Quality/speed tradeoff. Defaults to automatic (billed as "balanced"). */
  generation_mode?: TryonMaxGenerationMode;
  /** 0 … 2^32-1. Default 42. */
  seed?: number;
  /** 1 … 4 outputs per request. Default 1. */
  num_images?: number;
  /** Default "png". */
  output_format?: FashnOutputFormat;
  /** Return base64 strings instead of CDN URLs. Shortens retention to 60 min. Default false. */
  return_base64?: boolean;
}

/* ────────────────────────────────────────────────────────────
   tryon-v1.6  —  fast interactive try-on (~5-17s)
   ──────────────────────────────────────────────────────────── */

export type TryonV16Category = 'auto' | 'tops' | 'bottoms' | 'one-pieces';
export type TryonV16Mode = 'performance' | 'balanced' | 'quality';
export type TryonV16GarmentPhotoType = 'auto' | 'flat-lay' | 'model';
export type FashnModerationLevel = 'conservative' | 'permissive' | 'none';

export interface TryonV16Inputs {
  /** Photo of the person. Required. */
  model_image: FashnImageInput;
  /** Reference photo of the clothing item. Required. */
  garment_image: FashnImageInput;
  /** Garment type. "auto" classifies automatically. Default "auto". */
  category?: TryonV16Category;
  /** Skip clothing segmentation — better for bulky items. Default true. */
  segmentation_free?: boolean;
  /** Content-moderation strictness. Default "permissive". */
  moderation_level?: FashnModerationLevel;
  /** Hint about how the garment was photographed. Default "auto". */
  garment_photo_type?: TryonV16GarmentPhotoType;
  /** Speed/quality tradeoff: ~5s / ~8s / ~12-17s. Default "balanced". */
  mode?: TryonV16Mode;
  /** 0 … 2^32-1. Default 42. */
  seed?: number;
  /** 1 … 4 outputs per request. Default 1. */
  num_samples?: number;
  /** Default "png". */
  output_format?: FashnOutputFormat;
  /** Return base64 strings instead of CDN URLs. Shortens retention to 60 min. Default false. */
  return_base64?: boolean;
}

export type FashnOutputFormat = 'png' | 'jpeg';

/* ────────────────────────────────────────────────────────────
   Envelope: POST /v1/run
   ──────────────────────────────────────────────────────────── */

export interface FashnRunRequest<TInputs = Record<string, unknown>> {
  model_name: FashnModelName;
  /** All endpoint parameters live inside `inputs`, never at the top level. */
  inputs: TInputs;
}

export interface FashnRunResponse {
  id: string;
  error: FashnError | null;
}

/* ────────────────────────────────────────────────────────────
   Prediction lifecycle: GET /v1/status/{id}
   ──────────────────────────────────────────────────────────── */

export const FASHN_PENDING_STATUSES = ['starting', 'in_queue', 'processing'] as const;
export const FASHN_TERMINAL_STATUSES = ['completed', 'failed', 'canceled'] as const;

export type FashnPendingStatus = (typeof FASHN_PENDING_STATUSES)[number];
export type FashnTerminalStatus = (typeof FASHN_TERMINAL_STATUSES)[number];
export type FashnStatus = FashnPendingStatus | FashnTerminalStatus;

export function isTerminalStatus(status: string): status is FashnTerminalStatus {
  return (FASHN_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export interface FashnStatusResponse {
  id: string;
  status: FashnStatus;
  /** CDN URLs (or base64 strings when `return_base64` was set). Present once completed. */
  output: string[] | null;
  error: FashnError | null;
}

/** Webhook deliveries carry the same shape as the status response. */
export type FashnWebhookPayload = FashnStatusResponse;

/* ────────────────────────────────────────────────────────────
   Errors
   ──────────────────────────────────────────────────────────── */

/** Raised before a prediction id exists. Safe to retry with an identical payload. */
export type FashnApiErrorName =
  | 'BadRequest'
  | 'UnauthorizedAccess'
  | 'NotFound'
  | 'RateLimitExceeded'
  | 'ConcurrencyLimitExceeded'
  | 'OutOfCredits'
  | 'InternalServerError';

/** Raised during processing, surfaced with `status: "failed"`. Does not consume credits. */
export type FashnRuntimeErrorName =
  | 'ImageLoadError'
  | 'ContentModerationError'
  | 'InputValidationError'
  | 'ThirdPartyError'
  | 'UnavailableError'
  | 'PipelineError';

export type FashnErrorName = FashnApiErrorName | FashnRuntimeErrorName;

export interface FashnError {
  name: FashnErrorName | string;
  message: string;
}

/** Transient failures worth retrying with backoff. */
export const RETRYABLE_FASHN_ERRORS: ReadonlySet<string> = new Set<FashnErrorName>([
  'InternalServerError',
  'RateLimitExceeded',
  'ConcurrencyLimitExceeded',
  'UnavailableError',
  'PipelineError',
  'ThirdPartyError',
]);

/* ────────────────────────────────────────────────────────────
   Credits: GET /v1/credits
   ──────────────────────────────────────────────────────────── */

export interface FashnCreditsResponse {
  credits: {
    total: number;
    subscription: number;
    on_demand: number;
  };
}

/* ────────────────────────────────────────────────────────────
   Documented input limits (shared across try-on endpoints)
   ──────────────────────────────────────────────────────────── */

export const FASHN_LIMITS = {
  /** 30 MiB per image. */
  maxImageBytes: 30 * 1024 * 1024,
  minPixelDimension: 15,
  /** Aspect ratio must fall between 1:16 and 16:1. */
  minAspectRatio: 1 / 16,
  maxAspectRatio: 16,
  supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  /** CDN outputs live for 3 days (60 minutes when return_base64 is used). */
  outputRetentionDays: 3,
} as const;
