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
  deleteTryOnJob,
  getCredits,
  getPrediction,
  getTryOnJob,
  listTryOnJobs,
} from '../controllers/tryon.controller.js';
import { handleFashnWebhook } from '../controllers/webhook.controller.js';
import { getHealth, getReadiness } from '../controllers/health.controller.js';

export const apiRouter = Router();

apiRouter.get('/health', getHealth);
apiRouter.get('/ready', getReadiness);

apiRouter.get('/fashn/credits', getCredits);

apiRouter
  .route('/tryon')
  .post(uploadTryOnImages, createTryOn)
  .get(listTryOnJobs);

apiRouter
  .route('/tryon/:jobId')
  .get(getTryOnJob)
  .delete(deleteTryOnJob);

apiRouter.get('/predictions/:predictionId', getPrediction);

apiRouter.post('/webhooks/fashn', handleFashnWebhook);
