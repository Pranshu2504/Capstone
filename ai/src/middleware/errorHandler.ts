/**
 * Central error rendering. Every failure leaves the API in the same shape:
 *
 *   { "error": { "code": "...", "message": "...", "retryable": bool } }
 */

import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError, FashnRequestError } from '../utils/errors.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NotFound',
      message: `No route matches ${req.method} ${req.path}.`,
      retryable: false,
    },
  });
}

function describeMulterError(error: MulterError): AppError {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return AppError.payloadTooLarge(
        `"${error.field}" exceeds the 30 MiB per-image limit that FASHN enforces.`,
      );
    case 'LIMIT_UNEXPECTED_FILE':
      return AppError.badRequest(
        `Unexpected file field "${error.field}". Send the images as "model_image" and "garment_image".`,
      );
    case 'LIMIT_FILE_COUNT':
      return AppError.badRequest('Send at most one file per image field.');
    default:
      return AppError.badRequest(`Upload rejected: ${error.message}`);
  }
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = AppError.badRequest(
      'Request validation failed.',
      error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  } else if (error instanceof MulterError) {
    appError = describeMulterError(error);
  } else if (error instanceof SyntaxError && 'body' in error) {
    appError = AppError.badRequest('Request body is not valid JSON.');
  } else {
    appError = AppError.internal(
      error instanceof Error ? error.message : 'An unexpected error occurred.',
      error,
    );
  }

  const logMeta = {
    method: req.method,
    path: req.path,
    status: appError.statusCode,
    code: appError.code,
    ...(appError instanceof FashnRequestError && appError.predictionId
      ? { predictionId: appError.predictionId }
      : {}),
  };

  if (appError.statusCode >= 500) {
    logger.error(appError.message, { ...logMeta, stack: appError.stack });
  } else {
    logger.warn(appError.message, logMeta);
  }

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      retryable: appError.retryable,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      ...(appError instanceof FashnRequestError && appError.predictionId
        ? { predictionId: appError.predictionId }
        : {}),
      ...(env.isProduction ? {} : { stack: appError.stack?.split('\n').slice(0, 5) }),
    },
  });
}
