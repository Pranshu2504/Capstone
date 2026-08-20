import { Router } from 'express';
import { getCurrentUser } from '../lib/currentUser.js';
import { asyncHandler } from '../lib/http.js';
import { serializeUser } from '../lib/serializers.js';

export const userRouter = Router();

userRouter.get(
  '/me',
  asyncHandler(async (_req, res) => {
    const user = await getCurrentUser();
    res.json(serializeUser(user));
  }),
);
