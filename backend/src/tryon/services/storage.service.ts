/**
 * Local file storage for uploaded inputs and generated outputs.
 *
 * FASHN drops CDN outputs after 3 days, so anything the wardrobe should keep
 * gets copied here and re-served from /static.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { extensionFor, sniffMimeType, type SupportedMimeType } from '../utils/image.js';

export interface StoredFile {
  /** Filename on disk, e.g. "a1b2c3.jpg". */
  filename: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** Path relative to the server root, e.g. "/static/uploads/a1b2c3.jpg". */
  publicPath: string;
  /** Fully-qualified URL when PUBLIC_BASE_URL is configured, otherwise null. */
  publicUrl: string | null;
  byteLength: number;
}

export class StorageService {
  async init(): Promise<void> {
    await fs.mkdir(env.storage.uploads, { recursive: true });
    await fs.mkdir(env.storage.outputs, { recursive: true });
    logger.info('Storage ready', { root: env.storage.root });
  }

  private buildPublicRefs(kind: 'uploads' | 'outputs', filename: string) {
    const publicPath = `/static/${kind}/${filename}`;
    return {
      publicPath,
      publicUrl: env.PUBLIC_BASE_URL ? new URL(publicPath, env.PUBLIC_BASE_URL).toString() : null,
    };
  }

  /** Persist an uploaded image. Returns its on-disk and public locations. */
  async saveUpload(buffer: Buffer, mimeType: SupportedMimeType, prefix: string): Promise<StoredFile> {
    const filename = `${prefix}-${randomUUID()}.${extensionFor(mimeType)}`;
    const absolutePath = path.join(env.storage.uploads, filename);
    await fs.writeFile(absolutePath, buffer);

    return {
      filename,
      absolutePath,
      byteLength: buffer.length,
      ...this.buildPublicRefs('uploads', filename),
    };
  }

  /**
   * Copy a finished try-on off the FASHN CDN so it survives past the 3-day
   * retention window. Returns null if the download fails — a broken mirror
   * of the image is worse than falling back to the CDN URL.
   */
  async persistOutput(sourceUrl: string, jobId: string, index: number): Promise<StoredFile | null> {
    try {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        logger.warn('Could not download FASHN output', { sourceUrl, status: response.status });
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const mimeType = sniffMimeType(buffer) ?? 'image/png';
      const filename = `${jobId}-${index}.${extensionFor(mimeType)}`;
      const absolutePath = path.join(env.storage.outputs, filename);
      await fs.writeFile(absolutePath, buffer);

      logger.debug('Persisted FASHN output', { filename, bytes: buffer.length });

      return {
        filename,
        absolutePath,
        byteLength: buffer.length,
        ...this.buildPublicRefs('outputs', filename),
      };
    } catch (error) {
      logger.warn('Failed to persist FASHN output', {
        sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Persist every output of a completed prediction. Entries that fail to
   * download are skipped, so the result may be shorter than the input.
   */
  async persistOutputs(urls: string[], jobId: string): Promise<StoredFile[]> {
    const settled = await Promise.all(urls.map((url, index) => this.persistOutput(url, jobId, index)));
    return settled.filter((file): file is StoredFile => file !== null);
  }

  /** Delete an upload once the prediction that used it has finished. */
  async remove(absolutePath: string): Promise<void> {
    await fs.rm(absolutePath, { force: true });
  }
}

export const storageService = new StorageService();
