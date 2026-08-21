import { randomUUID } from 'node:crypto';

import { env } from './env.js';
import { HttpError } from './http.js';
import { isAuthConfigured, supabaseAdmin } from './supabaseAdmin.js';

/**
 * Garment photos live in a **private** Supabase Storage bucket — these are
 * pictures of the user's own clothes, so a public bucket would make every
 * upload readable by anyone holding the URL. Reads go out as short-lived
 * signed URLs minted at serialize time instead.
 */

export const isWardrobeStorageConfigured = isAuthConfigured;

/** Signed URLs outlive a session comfortably without being effectively permanent. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24h

let bucketReady = false;

/**
 * Creates the bucket on first use so a fresh Supabase project needs no
 * dashboard setup. Idempotent: a duplicate-name error means another process
 * (or an earlier boot) already made it.
 */
async function ensureBucket(): Promise<void> {
  if (bucketReady || !supabaseAdmin) return;

  const { error } = await supabaseAdmin.storage.createBucket(env.wardrobeBucket, {
    public: false,
    fileSizeLimit: '10MB',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });

  // "already exists" is the expected path on every boot after the first.
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new HttpError(502, `Could not create storage bucket: ${error.message}`);
  }
  bucketReady = true;
}

/** Stores one garment photo and returns its object path (not a URL). */
export async function uploadGarmentPhoto(args: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  if (!supabaseAdmin) {
    throw new HttpError(503, 'Photo storage is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).');
  }
  await ensureBucket();

  const extension = args.mimeType === 'image/png' ? 'png' : args.mimeType === 'image/webp' ? 'webp' : 'jpg';
  // Namespaced by user so one person's uploads can be listed or purged alone.
  const path = `${args.userId}/${randomUUID()}.${extension}`;

  const { error } = await supabaseAdmin.storage
    .from(env.wardrobeBucket)
    .upload(path, args.buffer, { contentType: args.mimeType, upsert: false });

  if (error) throw new HttpError(502, `Photo upload failed: ${error.message}`);
  return path;
}

/**
 * Mints signed URLs for many object paths at once.
 *
 * Batched deliberately: signing per item turned a 30-item wardrobe list into
 * 30 round trips. Returns a path→URL map; a path that fails to sign is simply
 * absent, and the caller renders that item without a photo.
 */
export async function signGarmentPhotos(paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length || !supabaseAdmin) return signed;

  const { data, error } = await supabaseAdmin.storage
    .from(env.wardrobeBucket)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  // A signing failure degrades to "no photo", never a failed request.
  if (error || !data) return signed;

  for (const entry of data) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/** Best-effort cleanup so deleting an item doesn't orphan its photo. */
export async function deleteGarmentPhoto(path: string | null): Promise<void> {
  if (!path || !supabaseAdmin) return;
  await supabaseAdmin.storage.from(env.wardrobeBucket).remove([path]);
}
