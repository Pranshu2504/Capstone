import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import pathModule from 'node:path';

import { env } from './env.js';
import { isAuthConfigured, supabaseAdmin } from './supabaseAdmin.js';

/**
 * Garment photos live in Supabase Storage or local disk fallback.
 * Reads go out as signed URLs or static uploaded file URLs.
 */
export const isWardrobeStorageConfigured = true;

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24h
let bucketReady = false;

async function ensureBucket(): Promise<boolean> {
  if (bucketReady) return true;
  if (!supabaseAdmin) return false;

  try {
    const { error } = await supabaseAdmin.storage.createBucket(env.wardrobeBucket, {
      public: false,
      fileSizeLimit: '10MB',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });

    if (!error || /already exists|duplicate/i.test(error.message)) {
      bucketReady = true;
      return true;
    }
  } catch (err) {
    console.warn('[storage] Supabase bucket setup warning:', err instanceof Error ? err.message : err);
  }
  return false;
}

/** Stores one garment photo and returns its object path (or local: path). */
export async function uploadGarmentPhoto(args: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const extension = args.mimeType === 'image/png' ? 'png' : args.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const filename = `${randomUUID()}.${extension}`;
  const path = `${args.userId}/${filename}`;

  if (supabaseAdmin && (await ensureBucket())) {
    try {
      const { error } = await supabaseAdmin.storage
        .from(env.wardrobeBucket)
        .upload(path, args.buffer, { contentType: args.mimeType, upsert: false });

      if (!error) return path;
      console.warn('[storage] Supabase upload failed, using local storage fallback:', error.message);
    } catch (err) {
      console.warn('[storage] Supabase upload exception, using local storage fallback:', err instanceof Error ? err.message : err);
    }
  }

  // Local file storage fallback
  const localDir = pathModule.join(process.cwd(), 'uploads', 'wardrobe', args.userId);
  await fs.mkdir(localDir, { recursive: true });
  const localFilePath = pathModule.join(localDir, filename);
  await fs.writeFile(localFilePath, args.buffer);

  return `local:${args.userId}/${filename}`;
}

/**
 * Mints URLs for object paths (Supabase signed URLs or local /uploads URLs).
 */
export async function signGarmentPhotos(paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return signed;

  const supabasePaths: string[] = [];
  for (const path of unique) {
    if (path.startsWith('local:')) {
      const relative = path.slice(6);
      signed.set(path, `/uploads/wardrobe/${relative}`);
    } else {
      supabasePaths.push(path);
    }
  }

  if (supabasePaths.length && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(env.wardrobeBucket)
        .createSignedUrls(supabasePaths, SIGNED_URL_TTL_SECONDS);

      if (!error && data) {
        for (const entry of data) {
          if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
        }
      }
    } catch (err) {
      console.warn('[storage] Signing error:', err instanceof Error ? err.message : err);
    }
  }

  return signed;
}

/** Best-effort cleanup so deleting an item doesn't orphan its photo. */
export async function deleteGarmentPhoto(path: string | null): Promise<void> {
  if (!path) return;
  if (path.startsWith('local:')) {
    const relative = path.slice(6);
    const localFilePath = pathModule.join(process.cwd(), 'uploads', 'wardrobe', relative);
    try {
      await fs.unlink(localFilePath);
    } catch {}
  } else if (supabaseAdmin) {
    await supabaseAdmin.storage.from(env.wardrobeBucket).remove([path]);
  }
}
