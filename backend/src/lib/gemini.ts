import { GoogleGenAI } from '@google/genai';

import { env } from './env.js';

export const isStylistConfigured = Boolean(env.geminiApiKey);

/**
 * Gemini client for the two AI features: reading a garment photo into
 * structured metadata, and picking an outfit from the wardrobe.
 *
 * Null when GEMINI_API_KEY is unset — every caller degrades rather than
 * throwing, so the app stays usable with no key at all.
 */
export const gemini: GoogleGenAI | null = isStylistConfigured
  ? new GoogleGenAI({ apiKey: env.geminiApiKey! })
  : null;

/**
 * Tried in order when the preferred model is busy.
 *
 * The newest flash models are the best pick but are also the ones that return
 * 503 UNAVAILABLE under load; an older, less contended model answers a moment
 * later and beats dropping to the offline scorer.
 */
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];

/** 503/429 are capacity, not a bad request — only these are worth another model. */
function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One JSON-constrained Gemini call, retried across models when capacity bites.
 *
 * `responseJsonSchema` + a JSON mime type make the model return parseable
 * JSON instead of prose wrapped in a code fence, so no regex cleanup is
 * needed. Throws once every model has been tried; callers catch and fall back.
 */
export async function generateJson<T>(args: {
  systemInstruction: string;
  contents: unknown;
  schema: Record<string, unknown>;
}): Promise<T> {
  if (!gemini) throw new Error('Gemini is not configured (set GEMINI_API_KEY).');

  // Deduped so an explicit GEMINI_MODEL of "gemini-2.5-flash" isn't tried twice.
  const models = [...new Set([env.geminiModel, ...FALLBACK_MODELS])];
  let lastError: unknown;

  for (const [index, model] of models.entries()) {
    try {
      const response = await gemini.models.generateContent({
        model,
        contents: args.contents as never,
        config: {
          systemInstruction: args.systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema: args.schema,
        },
      });

      const text = response.text;
      if (!text) throw new Error('Gemini returned an empty response.');

      if (index > 0) console.warn(`[gemini] Served by fallback model ${model}.`);
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Gemini returned non-JSON output: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      lastError = err;
      // A malformed request fails identically on every model — don't burn calls.
      if (!isTransient(err)) throw err;
      if (index < models.length - 1) await sleep(400);
    }
  }

  throw lastError;
}
