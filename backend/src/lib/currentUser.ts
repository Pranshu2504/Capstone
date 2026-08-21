import type { Request } from 'express';

import { env } from './env.js';
import { HttpError } from './http.js';
import { prisma } from './prisma.js';
import { isAuthConfigured, supabaseAdmin } from './supabaseAdmin.js';

/**
 * Resolves the requesting user. A Bearer token is verified against Supabase
 * and mapped to the local User by supabaseId; no token falls back to the
 * single seeded demo user, so curl/tests/tools that call the API directly
 * keep working exactly as before auth existed.
 */
export async function getCurrentUser(req: Request) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (token) {
    if (!isAuthConfigured || !supabaseAdmin) {
      throw new HttpError(503, 'Authentication is not configured on this server.');
    }
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw new HttpError(401, 'Invalid or expired session.');
    }
    const user = await prisma.user.findUnique({ where: { supabaseId: data.user.id } });
    if (!user) {
      throw new HttpError(404, 'No profile for this account yet — call /api/auth/sync first.');
    }
    return user;
  }

  const user = await prisma.user.findUnique({ where: { handle: env.demoUserHandle } });
  if (!user) {
    throw new HttpError(
      503,
      `Demo user "${env.demoUserHandle}" is missing. Run \`npm run db:seed\` in backend/.`,
    );
  }
  return user;
}
