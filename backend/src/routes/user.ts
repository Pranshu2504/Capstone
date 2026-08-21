import { Router } from 'express';
import { z } from 'zod';
import { getCurrentUser } from '../lib/currentUser.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { serializeUser } from '../lib/serializers.js';

export const userRouter = Router();

userRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req);
    res.json(serializeUser(user));
  }),
);

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  moodKeywords: z.array(z.string()).optional(),
  palette: z.array(z.string()).optional(),
  favoritesBrand: z.string().nullable().optional(),
});

// Saves the Interview screen's answers onto the signed-in user's profile.
userRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());

    const user = await getCurrentUser(req);
    const updated = await prisma.user.update({ where: { id: user.id }, data: parsed.data });
    res.json(serializeUser(updated));
  }),
);
