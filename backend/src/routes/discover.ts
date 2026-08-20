import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { serializePost, serializeTrend } from '../lib/serializers.js';

export const discoverRouter = Router();

discoverRouter.get(
  '/trends',
  asyncHandler(async (_req, res) => {
    const trends = await prisma.trend.findMany({ orderBy: { position: 'asc' } });
    res.json(trends.map(serializeTrend));
  }),
);

discoverRouter.get(
  '/community/posts',
  asyncHandler(async (_req, res) => {
    const posts = await prisma.communityPost.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(posts.map(serializePost));
  }),
);

discoverRouter.get(
  '/vibes',
  asyncHandler(async (_req, res) => {
    const vibes = await prisma.vibe.findMany({ orderBy: { position: 'asc' } });
    res.json(vibes.map((v) => v.name));
  }),
);
