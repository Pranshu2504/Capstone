/**
 * Image helpers: sniff the real format from magic bytes, read dimensions from
 * the file header, and convert buffers to the `data:` URIs FASHN accepts.
 *
 * We validate locally so an image that FASHN would reject with
 * InputValidationError never leaves this machine.
 */

import { AppError } from './errors.js';
import { FASHN_LIMITS } from '../types/fashn.types.js';

export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageMetadata {
  mimeType: SupportedMimeType;
  width: number;
  height: number;
  byteLength: number;
}

const EXTENSION_BY_MIME: Record<SupportedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionFor(mimeType: SupportedMimeType): string {
  return EXTENSION_BY_MIME[mimeType];
}

/**
 * Determine the format from the file's own bytes. A client-supplied
 * Content-Type can lie; the magic number cannot.
 */
export function sniffMimeType(buffer: Buffer): SupportedMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && PNG_SIGNATURE.every((byte, i) => buffer[i] === byte)) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/** Read pixel dimensions straight out of the header — no image library needed. */
function readDimensions(buffer: Buffer, mimeType: SupportedMimeType): { width: number; height: number } | null {
  switch (mimeType) {
    case 'image/png':
      // IHDR is always the first chunk: width at byte 16, height at byte 20.
      if (buffer.length < 24) return null;
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };

    case 'image/jpeg':
      return readJpegDimensions(buffer);

    case 'image/webp':
      return readWebpDimensions(buffer);
  }
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  // Walk the segment chain looking for a Start-Of-Frame marker, which carries
  // the frame dimensions.
  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1]!;

    // SOF0-SOF15 hold the dimensions, except DHT (C4), JPG (C8) and DAC (CC).
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }

  return null;
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  const chunkType = buffer.toString('ascii', 12, 16);

  // Lossy: dimensions sit after the 3-byte start code in the VP8 bitstream.
  if (chunkType === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  // Lossless: 14 bits each, packed little-endian right after the 0x2f signature.
  if (chunkType === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  // Extended: 24-bit canvas dimensions minus one.
  if (chunkType === 'VP8X' && buffer.length >= 30) {
    return {
      width: buffer.readUIntLE(24, 3) + 1,
      height: buffer.readUIntLE(27, 3) + 1,
    };
  }

  return null;
}

/**
 * Validate a buffer against FASHN's documented input limits: 30 MiB, at least
 * 15x15 px, and an aspect ratio between 1:16 and 16:1.
 *
 * @param label Field name used in error messages, e.g. "garment_image".
 */
export function inspectImage(buffer: Buffer, label: string): ImageMetadata {
  if (buffer.length === 0) {
    throw AppError.badRequest(`${label} is empty.`);
  }

  if (buffer.length > FASHN_LIMITS.maxImageBytes) {
    const mib = (buffer.length / 1024 / 1024).toFixed(1);
    throw AppError.payloadTooLarge(`${label} is ${mib} MiB; FASHN accepts at most 30 MiB per image.`);
  }

  const mimeType = sniffMimeType(buffer);
  if (!mimeType) {
    throw AppError.unsupportedMedia(
      `${label} is not a JPEG, PNG or WebP image. FASHN accepts those three formats.`,
    );
  }

  const dimensions = readDimensions(buffer, mimeType);
  if (!dimensions) {
    throw AppError.badRequest(`${label} appears to be a corrupt ${mimeType} — could not read its dimensions.`);
  }

  const { width, height } = dimensions;

  if (width < FASHN_LIMITS.minPixelDimension || height < FASHN_LIMITS.minPixelDimension) {
    throw AppError.badRequest(
      `${label} is ${width}x${height}px; FASHN requires at least ` +
        `${FASHN_LIMITS.minPixelDimension}x${FASHN_LIMITS.minPixelDimension}px.`,
    );
  }

  const aspectRatio = width / height;
  if (aspectRatio < FASHN_LIMITS.minAspectRatio || aspectRatio > FASHN_LIMITS.maxAspectRatio) {
    throw AppError.badRequest(
      `${label} has an aspect ratio of ${aspectRatio.toFixed(2)}:1; FASHN accepts 1:16 through 16:1.`,
    );
  }

  return { mimeType, width, height, byteLength: buffer.length };
}

/** Build the `data:image/jpeg;base64,…` URI form that FASHN accepts as an input. */
export function toDataUri(buffer: Buffer, mimeType: SupportedMimeType): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/** True for the `data:image/...;base64,...` form. */
export function isDataUri(value: string): boolean {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value);
}

/** True for an http(s) URL FASHN could fetch. */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
