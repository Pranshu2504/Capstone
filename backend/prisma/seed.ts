/**
 * CLI entry point for `npm run db:seed`.
 * The fixtures live in src/lib/seedData.ts so the server can reuse them.
 */
import { PrismaClient } from '@prisma/client';

import { seedDemoData } from '../src/lib/seedData.js';

const prisma = new PrismaClient();

seedDemoData(prisma)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
