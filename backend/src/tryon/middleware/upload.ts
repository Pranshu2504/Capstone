/**
 * Multipart upload handling for the two try-on image slots.
 *
 * Files are kept in memory rather than written to a temp dir: they go straight
 * into a base64 data URI, and StorageService writes its own archived copy.
 */

import multer from 'multer';

import { FASHN_LIMITS } from '../types/fashn.types.js';

export const TRY_ON_FIELDS = [
  { name: 'model_image', maxCount: 1 },
  { name: 'garment_image', maxCount: 1 },
] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FASHN_LIMITS.maxImageBytes,
    files: TRY_ON_FIELDS.length,
    fields: 20,
  },
  fileFilter: (_req, file, callback) => {
    // A coarse gate only — utils/image.ts re-checks the real magic bytes.
    if (file.mimetype.startsWith('image/')) {
      callback(null, true);
      return;
    }
    callback(new Error(`"${file.fieldname}" must be an image, received ${file.mimetype}.`));
  },
});

/** Accepts `model_image` and `garment_image` file parts plus text fields. */
export const uploadTryOnImages = upload.fields([...TRY_ON_FIELDS]);

export type UploadedFiles = Record<string, Express.Multer.File[] | undefined>;
