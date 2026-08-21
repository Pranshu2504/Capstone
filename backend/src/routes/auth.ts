import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, HttpError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { serializeUser } from '../lib/serializers.js';
import { isAuthConfigured, supabaseAdmin } from '../lib/supabaseAdmin.js';

export const authRouter = Router();

const syncSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/** Turns a name/email into a unique "@handle", e.g. "@jane.doe", then "@jane.doe2". */
async function nextHandle(seed: string): Promise<string> {
  const base =
    seed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'user';
  let handle = `@${base}`;
  let suffix = 1;
  while (await prisma.user.findUnique({ where: { handle }, select: { id: true } })) {
    suffix += 1;
    handle = `@${base}${suffix}`;
  }
  return handle;
}

/**
 * Creates (or fetches) the local profile row for the calling Supabase user.
 * The client calls this once right after sign-up, before the Interview
 * screen; it's a cheap idempotent upsert keyed by supabaseId, so calling it
 * again on sign-in is harmless.
 */
authRouter.post(
  '/sync',
  asyncHandler(async (req, res) => {
    if (!isAuthConfigured || !supabaseAdmin) {
      throw new HttpError(503, 'Authentication is not configured on this server.');
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!token) throw new HttpError(401, 'Missing bearer token.');

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, 'Invalid or expired session.');

    const existing = await prisma.user.findUnique({ where: { supabaseId: data.user.id } });
    if (existing) {
      res.json(serializeUser(existing));
      return;
    }

    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());

    const email = data.user.email ?? null;
    const handle = await nextHandle(parsed.data.name || email?.split('@')[0] || 'user');

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name,
        handle,
        email,
        supabaseId: data.user.id,
        moodKeywords: [],
        palette: [],
      },
    });
    res.status(201).json(serializeUser(created));
  }),
);
