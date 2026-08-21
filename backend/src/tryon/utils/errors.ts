/**
 * Application error types. Everything thrown inside a route handler should be
 * an AppError so the error middleware can render a consistent JSON body.
 */

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  /** True when the caller can retry the same request and reasonably expect success. */
  readonly retryable: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options: { details?: unknown; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.retryable = options.retryable ?? statusCode >= 500;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'BadRequest', message, { details, retryable: false });
  }

  static notFound(message: string): AppError {
    return new AppError(404, 'NotFound', message, { retryable: false });
  }

  static payloadTooLarge(message: string): AppError {
    return new AppError(413, 'PayloadTooLarge', message, { retryable: false });
  }

  static unsupportedMedia(message: string): AppError {
    return new AppError(415, 'UnsupportedMediaType', message, { retryable: false });
  }

  static timeout(message: string): AppError {
    return new AppError(504, 'GatewayTimeout', message, { retryable: true });
  }

  static internal(message: string, cause?: unknown): AppError {
    return new AppError(500, 'InternalServerError', message, { cause, retryable: true });
  }
}

/**
 * An error returned by FASHN itself, either from the HTTP layer of /v1/run
 * or as the `error` field of a failed prediction.
 */
export class FashnRequestError extends AppError {
  readonly fashnErrorName: string;
  readonly predictionId?: string;

  constructor(args: {
    statusCode: number;
    fashnErrorName: string;
    message: string;
    predictionId?: string;
    retryable?: boolean;
    details?: unknown;
  }) {
    super(args.statusCode, `Fashn.${args.fashnErrorName}`, args.message, {
      details: args.details,
      retryable: args.retryable ?? false,
    });
    this.name = 'FashnRequestError';
    this.fashnErrorName = args.fashnErrorName;
    this.predictionId = args.predictionId;
  }
}
