/**
 * API surface.
 *
 *   GET    /api/health                     liveness + FASHN reachability
 *   GET    /api/fashn/credits              remaining FASHN credits
 *
 *   POST   /api/tryon                      submit a try-on (multipart)
 *   GET    /api/tryon                      recent jobs
 *   GET    /api/tryon/:jobId               poll one job
 *   DELETE /api/tryon/:jobId               forget a job
 *
 *   GET    /api/predictions/:predictionId  raw FASHN status passthrough
 *   POST   /api/webhooks/fashn             FASHN completion callback
 */

import { Router } from 'express';

import { uploadTryOnImages } from '../middleware/upload.js';
import {
  createTryOn,
  createTryOnChain,
  deleteTryOnJob,
  getCredits,
  getPrediction,
  getTryOnJob,
  listTryOnJobs,
} from '../controllers/tryon.controller.js';
import { handleFashnWebhook } from '../controllers/webhook.controller.js';
import { getHealth, getReadiness } from '../controllers/health.controller.js';
import { requireTryOnConfigured } from '../middleware/requireConfigured.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { wrap } from '../middleware/wrap.js';

export const apiRouter = Router();

apiRouter.get('/health', wrap(getHealth));
apiRouter.get('/ready', wrap(getReadiness));

// Everything past this point talks to FASHN.
apiRouter.use(['/ready', '/fashn', '/tryon', '/predictions'], requireTryOnConfigured);

apiRouter.get('/fashn/credits', wrap(getCredits));

apiRouter
  .route('/tryon')
  .post(uploadTryOnImages, wrap(createTryOn))
  .get(wrap(listTryOnJobs));

// Before /tryon/:jobId, or "chain" is read as a job id.
apiRouter.post('/tryon/chain', uploadTryOnImages, wrap(createTryOnChain));

apiRouter
  .route('/tryon/:jobId')
  .get(wrap(getTryOnJob))
  .delete(wrap(deleteTryOnJob));

apiRouter.get('/predictions/:predictionId', wrap(getPrediction));

apiRouter.post('/webhooks/fashn', wrap(handleFashnWebhook));

apiRouter.use(errorHandler);
