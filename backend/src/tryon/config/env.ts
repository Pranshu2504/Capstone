/**
 * Try-on configuration.
 *
 * Ported from the standalone `ai/` service so one Render service can serve both
 * the wardrobe API and try-on. Two deliberate differences from the original:
 *
 *   1. FASHN_API_KEY is OPTIONAL. The wardrobe API must boot without it — a
 *      missing key disables try-on, it does not take the whole server down.
 *   2. No process.exit on invalid config, for the same reason.
 *
 * Written against zod 3, which is what the backend uses.
 */
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  FASHN_API_KEY: z.string().min(1).optional(),
  FASHN_BASE_URL: z.string().url().default('https://api.fashn.ai/v1'),
  FASHN_DEFAULT_MODEL: z.enum(['tryon-max', 'tryon-v1.6']).default('tryon-v1.6'),

  /** How long a single try-on may stay pending before we give up, in ms. */
  TRYON_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  /** Gap between /v1/status polls, in ms. FASHN's own quickstart uses 3s. */
  TRYON_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3_000),

  /** Where uploads and downloaded outputs are written. */
  STORAGE_DIR: z.string().default('storage'),

  /** Public base URL of this server; needed only for webhook delivery. */
  PUBLIC_BASE_URL: z.string().url().optional(),
  FASHN_USE_WEBHOOKS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  FASHN_WEBHOOK_SECRET: z.string().optional(),

  /**
   * FASHN's CDN drops outputs after 3 days. When true, results are copied into
   * STORAGE_DIR. Leave off on hosts without a persistent disk — the files would
   * vanish on restart while appearing to have been saved.
   */
  PERSIST_OUTPUTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.warn(`\n[tryon] Ignoring invalid try-on configuration:\n${issues}\n`);
}

// Fall back to schema defaults so the rest of the API is unaffected by bad input.
const raw = parsed.success ? parsed.data : envSchema.parse({});

const storageRoot = path.resolve(process.cwd(), raw.STORAGE_DIR);

export const env = {
  ...raw,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  storage: {
    root: storageRoot,
    uploads: path.join(storageRoot, 'uploads'),
    outputs: path.join(storageRoot, 'outputs'),
  },
} as const;

/** True when a FASHN key is present, i.e. try-on can actually run. */
export const isTryOnConfigured = Boolean(raw.FASHN_API_KEY);

export type Env = typeof env;
