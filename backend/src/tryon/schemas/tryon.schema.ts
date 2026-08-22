/**
 * Request validation for the try-on endpoints.
 *
 * Multipart bodies arrive as strings, so every field is coerced. Defaults here
 * mirror the FASHN documentation exactly, and the two model variants are kept
 * as a discriminated union so tryon-max options cannot leak into a v1.6 call.
 */

import { z } from 'zod';

/** Multipart form fields are strings; accept "true"/"false" as well as booleans. */
const booleanish = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);

const seedSchema = z.coerce.number().int().min(0).max(4_294_967_295);

/** Shared knobs that apply to both try-on models. */
const commonSchema = z.object({
  /** Optional label so the client can tag the job (e.g. a wardrobe item id). */
  reference: z.string().max(200).optional(),
  seed: seedSchema.optional(),
  output_format: z.enum(['png', 'jpeg']).optional(),
  /**
   * When true, this request blocks until the image is ready instead of
   * returning a job id to poll.
   */
  wait: booleanish.optional(),
});

const tryonV16Schema = commonSchema.extend({
  model: z.literal('tryon-v1.6'),
  category: z.enum(['auto', 'tops', 'bottoms', 'one-pieces']).default('auto'),
  mode: z.enum(['performance', 'balanced', 'quality']).default('balanced'),
  garment_photo_type: z.enum(['auto', 'flat-lay', 'model']).default('auto'),
  segmentation_free: booleanish.default(true),
  moderation_level: z.enum(['conservative', 'permissive', 'none']).default('permissive'),
  num_samples: z.coerce.number().int().min(1).max(4).default(1),
});

const tryonMaxSchema = commonSchema.extend({
  model: z.literal('tryon-max'),
  /** Styling instruction, e.g. "tuck in the shirt", "roll up sleeves". */
  prompt: z.string().max(1000).optional(),
  resolution: z.enum(['1k', '2k', '4k']).default('1k'),
  generation_mode: z.enum(['fast', 'balanced', 'quality']).default('balanced'),
  num_images: z.coerce.number().int().min(1).max(4).default(1),
});

export const tryOnRequestSchema = z.discriminatedUnion('model', [tryonV16Schema, tryonMaxSchema]);

export type TryOnRequest = z.infer<typeof tryOnRequestSchema>;
export type TryOnV16Request = z.infer<typeof tryonV16Schema>;
export type TryOnMaxRequest = z.infer<typeof tryonMaxSchema>;

/**
 * Image inputs may arrive as uploaded files (preferred) or as URLs pointing at
 * images FASHN can fetch itself. At least one form must be present per slot;
 * the controller enforces that after multer has run.
 */
/**
 * Garments for a layered try-on, in the order they go on.
 *
 * Arrives as a JSON string when sent through multipart alongside the person
 * photo, so it is parsed leniently rather than requiring a JSON body the
 * file upload cannot use.
 */
export const chainGarmentsSchema = z.object({
  garments: z
    .preprocess(
      (value) => (typeof value === 'string' ? JSON.parse(value) : value),
      z.array(
        z.object({
          url: z.string().url(),
          category: z.enum(['auto', 'tops', 'bottoms', 'one-pieces']).default('auto'),
        }),
      ),
    )
    // Four layers is already eight credits; past that it is a mistake.
    .refine((g) => g.length >= 1 && g.length <= 4, 'Send between 1 and 4 garments.'),
});

export const imageUrlFieldsSchema = z.object({
  model_image_url: z.string().url().optional(),
  garment_image_url: z.string().url().optional(),
});

export const listJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
