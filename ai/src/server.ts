/**
 * Entry point: prepare storage, start listening, shut down cleanly.
 */

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { jobStore } from './services/jobStore.service.js';
import { storageService } from './services/storage.service.js';

async function main(): Promise<void> {
  await storageService.init();
  jobStore.startSweeper();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`ZORA backend listening on http://localhost:${env.PORT}`, {
      environment: env.NODE_ENV,
      defaultModel: env.FASHN_DEFAULT_MODEL,
      webhooks: env.FASHN_USE_WEBHOOKS ? 'enabled' : 'polling only',
      persistOutputs: env.PERSIST_OUTPUTS,
    });

    if (env.FASHN_USE_WEBHOOKS && !env.PUBLIC_BASE_URL) {
      logger.warn('FASHN_USE_WEBHOOKS is on but PUBLIC_BASE_URL is unset — falling back to polling.');
    }
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down.`);
    jobStore.stopSweeper();

    server.close(() => process.exit(0));

    // Don't let in-flight try-ons hold the process open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

main().catch((error) => {
  logger.error('Failed to start the server', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
