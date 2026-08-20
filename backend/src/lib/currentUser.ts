import { env } from './env.js';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';

/**
 * Until auth ships, every request resolves to the single seeded demo user.
 * Swapping this for a JWT lookup is the only change the routes will need.
 */
export async function getCurrentUser() {
  const user = await prisma.user.findUnique({ where: { handle: env.demoUserHandle } });
  if (!user) {
    throw new HttpError(
      503,
      `Demo user "${env.demoUserHandle}" is missing. Run \`npm run db:seed\` in backend/.`,
    );
  }
  return user;
}
