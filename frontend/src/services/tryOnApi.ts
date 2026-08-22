/**
 * Client for the AI try-on service (`Capstone/ai`).
 *
 * Kept separate from `@/api/client`, which talks to the Prisma backend: this
 * is a different service on a different port with its own contract.
 *
 *   POST /api/tryon        → 202 { jobId, status } (or 200 when wait=true)
 *   GET  /api/tryon/:jobId → the same job, polled until terminal
 *   GET  /api/ready        → service + FASHN health
 */

import { AI_BASE_URL } from '@/config/aiApi';
import type { PickedImage } from '@/utils/pickImage';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';
export type FashnStatus = 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed';

export interface TryOnImage {
  /** Absolute and ready for <Image source={{ uri }} />. */
  url: string;
  cdnUrl: string;
  persisted: boolean;
}

/** One garment in a layered try-on, in the order it goes on. */
export interface ChainGarment {
  url: string;
  category: 'auto' | 'tops' | 'bottoms' | 'one-pieces';
}

export interface TryOnJob {
  jobId: string;
  predictionId: string | null;
  status: JobStatus;
  fashnStatus: FashnStatus | null;
  model: string;
  images: TryOnImage[];
  error: { name: string; message: string } | null;
  durationMs: number | null;
  /** Only set for layered try-ons: which garment is being fitted. */
  chain: { total: number; current: number } | null;
}

export interface TryOnOptions {
  /** Garment type. "auto" lets FASHN classify it. */
  category?: 'auto' | 'tops' | 'bottoms' | 'one-pieces';
  /** performance ≈ 5s, balanced ≈ 8s, quality ≈ 12-17s. */
  mode?: 'performance' | 'balanced' | 'quality';
  /** Hint about how the garment was shot. */
  garmentPhotoType?: 'auto' | 'flat-lay' | 'model';
  /** 1-4. Each sample costs a credit but improves the odds of a good result. */
  numSamples?: number;
}

/** The service's uniform error envelope. */
export class TryOnApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'TryOnApiError';
    this.code = code;
    this.retryable = retryable;
  }
}

/** Turn a service-relative path ("/static/outputs/x.png") into a loadable URL. */
function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${AI_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

async function parseError(response: Response): Promise<TryOnApiError> {
  try {
    const body = await response.json();
    const error = body?.error;
    if (error?.message) {
      return new TryOnApiError(error.code ?? 'Unknown', error.message, Boolean(error.retryable));
    }
  } catch {
    // Fall through to the generic message below.
  }
  return new TryOnApiError('Unknown', `Request failed with HTTP ${response.status}.`, response.status >= 500);
}

/**
 * Append an image to FormData in whichever shape the platform needs.
 *
 * The web image-picker shim hands back a `blob:` URL, which multipart cannot
 * upload directly — fetch it back into a Blob first. React Native instead
 * understands its own {uri, name, type} descriptor.
 */
async function appendImage(form: FormData, field: string, image: PickedImage): Promise<void> {
  // Anything already addressable over the network — including the signed
  // Supabase URLs the stylist hands over — has to be fetched into a Blob;
  // only a local file path can be passed to FormData by reference.
  if (/^(blob:|data:|https?:)/.test(image.uri)) {
    const blob = await (await fetch(image.uri)).blob();
    (form.append as (n: string, v: unknown, f?: string) => void)(field, blob, image.name);
    return;
  }

  form.append(field, { uri: image.uri, name: image.name, type: image.type } as never);
}

function normalizeJob(raw: TryOnJob): TryOnJob {
  return {
    ...raw,
    images: (raw.images ?? []).map((image) => ({ ...image, url: absoluteUrl(image.url) })),
  };
}

/**
 * Submit a try-on. Returns as soon as the service has queued it — poll
 * `getTryOnJob` with the returned jobId until the status is terminal.
 */
export async function submitTryOn(
  personImage: PickedImage,
  garmentImage: PickedImage,
  options: TryOnOptions = {},
): Promise<TryOnJob> {
  const form = new FormData();
  await appendImage(form, 'model_image', personImage);
  await appendImage(form, 'garment_image', garmentImage);

  form.append('model', 'tryon-v1.6');
  form.append('category', options.category ?? 'auto');
  form.append('mode', options.mode ?? 'performance');
  form.append('garment_photo_type', options.garmentPhotoType ?? 'auto');
  form.append('num_samples', String(options.numSamples ?? 1));

  // Content-Type is deliberately unset so the runtime adds the multipart boundary.
  const response = await fetch(`${AI_BASE_URL}/api/tryon`, { method: 'POST', body: form });

  if (!response.ok) throw await parseError(response);

  return normalizeJob(await response.json());
}

/** Fetch the current state of a job. */
export async function getTryOnJob(jobId: string): Promise<TryOnJob> {
  const response = await fetch(`${AI_BASE_URL}/api/tryon/${jobId}`);
  if (!response.ok) throw await parseError(response);
  return normalizeJob(await response.json());
}

const TERMINAL: JobStatus[] = ['completed', 'failed', 'timeout'];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.includes(status);
}

/**
 * Poll a job until it finishes.
 *
 * @param onProgress Called on every poll, so the UI can show "in queue" vs
 *                   "processing" rather than a blank spinner.
 */
export async function waitForTryOn(
  jobId: string,
  onProgress?: (job: TryOnJob) => void,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<TryOnJob> {
  const intervalMs = options.intervalMs ?? 2000;
  const deadline = Date.now() + (options.timeoutMs ?? 180_000);

  while (Date.now() < deadline) {
    const job = await getTryOnJob(jobId);
    onProgress?.(job);

    if (isTerminal(job.status)) return job;

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new TryOnApiError('Timeout', 'The try-on is taking longer than expected.', true);
}

/** Check the try-on service is reachable and FASHN has credits. */
export async function checkTryOnService(): Promise<{
  ready: boolean;
  credits: number | null;
  detail: string;
}> {
  try {
    const response = await fetch(`${AI_BASE_URL}/api/ready`);
    const body = await response.json();

    if (body?.status === 'ready') {
      return { ready: true, credits: body.fashn?.credits?.total ?? null, detail: 'ready' };
    }
    return {
      ready: false,
      credits: body?.fashn?.credits?.total ?? null,
      detail: body?.warning ?? body?.fashn?.error ?? 'The try-on service is not ready.',
    };
  } catch {
    return {
      ready: false,
      credits: null,
      detail: `Cannot reach the try-on service at ${AI_BASE_URL}. Is it running?`,
    };
  }
}

/**
 * Wear several garments at once.
 *
 * FASHN fits one garment per prediction, so the server runs them in sequence
 * — the person photo goes in with the first garment and each result becomes
 * the model image for the next. That means a top and a bottom are two
 * predictions and **two credits**; the caller should say so before spending
 * them.
 *
 * Garments are passed as URLs because that is what the stylist already has:
 * signed links to the pieces it just recommended, no re-upload needed.
 */
export async function submitTryOnChain(
  personImage: PickedImage,
  garments: ChainGarment[],
  options: TryOnOptions = {},
): Promise<TryOnJob> {
  const form = new FormData();
  await appendImage(form, 'model_image', personImage);

  form.append('garments', JSON.stringify(garments));
  form.append('model', 'tryon-v1.6');
  form.append('mode', options.mode ?? 'performance');
  form.append('garment_photo_type', options.garmentPhotoType ?? 'auto');
  form.append('num_samples', String(options.numSamples ?? 1));

  const response = await fetch(`${AI_BASE_URL}/api/tryon/chain`, { method: 'POST', body: form });
  if (!response.ok) throw await parseError(response);

  return normalizeJob(await response.json());
}
