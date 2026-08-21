import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Forwards async handler rejections to Express error middleware.
 *
 * These controllers were written for Express 5, which awaits handler return
 * values and routes rejections to `next()` automatically. The backend runs
 * Express 4, which does not — an unhandled rejection there escapes the request
 * entirely and, under Node 20+, terminates the process. A thrown 400 would take
 * the whole server down rather than answering the request.
 */
export function wrap(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
