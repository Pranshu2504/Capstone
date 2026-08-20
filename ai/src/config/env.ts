import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /** Create one at https://app.fashn.ai → Developer API → Create new API key. */
  FASHN_API_KEY: z
    .string({ error: 'Required — create a key at app.fashn.ai → Developer API, then set it in .env' })
    .min(1, 'Must not be empty — paste your key from app.fashn.ai'),
  FASHN_BASE_URL: z.string().url().default('https://api.fashn.ai/v1'),

  /** Which try-on model to use when the request does not name one. */
  FASHN_DEFAULT_MODEL: z.enum(['tryon-max', 'tryon-v1.6']).default('tryon-v1.6'),

  /** How long a single try-on may stay pending before we give up, in ms. */
  TRYON_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  /** Gap between /v1/status polls, in ms. The docs' own quickstart uses 3s. */
  TRYON_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3_000),

  /** Comma-separated list, or "*" to allow any origin. */
  CORS_ORIGINS: z.string().default('*'),

  /** Where uploads and downloaded outputs are written. */
  STORAGE_DIR: z.string().default('storage'),
  /**
   * Public base URL of this server, e.g. https://mirror.example.com.
   * Only needed for webhooks and for serving stored images to a remote client.
   */
  PUBLIC_BASE_URL: z.string().url().optional(),
  /**
   * When true, ask FASHN to POST results to `${PUBLIC_BASE_URL}/api/webhooks/fashn`
   * instead of polling. Requires a publicly reachable PUBLIC_BASE_URL.
   */
  FASHN_USE_WEBHOOKS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Shared secret appended to the webhook URL and checked on delivery. */
  FASHN_WEBHOOK_SECRET: z.string().optional(),

  /**
   * FASHN's CDN drops outputs after 3 days. When true we copy each result into
   * STORAGE_DIR so the wardrobe keeps working afterwards.
   */
  PERSIST_OUTPUTS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.error(`\nInvalid environment configuration:\n${issues}\n\nSee .env.example.\n`);
  process.exit(1);
}

const raw = parsed.data;

const storageRoot = path.resolve(process.cwd(), raw.STORAGE_DIR);

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  corsOrigins: raw.CORS_ORIGINS === '*' ? '*' : raw.CORS_ORIGINS.split(',').map((o) => o.trim()),
  storage: {
    root: storageRoot,
    uploads: path.join(storageRoot, 'uploads'),
    outputs: path.join(storageRoot, 'outputs'),
  },
} as const;

export type Env = typeof env;
