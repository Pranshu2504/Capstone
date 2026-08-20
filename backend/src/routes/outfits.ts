import { Router } from 'express';
import { z } from 'zod';
import { getCurrentUser } from '../lib/currentUser.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { serializeOutfit } from '../lib/serializers.js';

export const outfitsRouter = Router();

const withItems = { outfitItems: { include: { item: true } } } as const;

/** Parses YYYY-MM-DD as a UTC midnight Date, matching Prisma's @db.Date. */
function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new HttpError(400, `Invalid date "${value}", expected YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Invalid date "${value}"`);
  return date;
}

const todayUTC = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

outfitsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const user = await getCurrentUser();
    const outfits = await prisma.outfit.findMany({
      where: { userId: user.id },
      include: withItems,
      orderBy: { forDate: 'desc' },
    });
    res.json(outfits.map(serializeOutfit));
  }),
);

/**
 * The Mirror screen's hero. Falls back to the most recent outfit on or before
 * today so a demo never renders an empty hero just because the date rolled over.
 */
outfitsRouter.get(
  '/today',
  asyncHandler(async (_req, res) => {
    const user = await getCurrentUser();
    const today = todayUTC();

    const outfit =
      (await prisma.outfit.findFirst({
        where: { userId: user.id, forDate: today },
        include: withItems,
      })) ??
      (await prisma.outfit.findFirst({
        where: { userId: user.id, forDate: { lte: today } },
        include: withItems,
        orderBy: { forDate: 'desc' },
      })) ??
      (await prisma.outfit.findFirst({
        where: { userId: user.id },
        include: withItems,
        orderBy: { forDate: 'asc' },
      }));

    if (!outfit) throw notFound("Today's outfit");
    res.json(serializeOutfit(outfit));
  }),
);

outfitsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser();
    const outfit = await prisma.outfit.findFirst({
      where: { id: req.params.id, userId: user.id },
      include: withItems,
    });
    if (!outfit) throw notFound('Outfit');
    res.json(serializeOutfit(outfit));
  }),
);

const createSchema = z.object({
  headline: z.string().min(1),
  subhead: z.string().nullable().optional(),
  occasion: z.string().nullable().optional(),
  reasoning: z.array(z.string()).optional(),
  date: z.string(),
  itemIds: z.array(z.string()).default([]),
});

outfitsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());

    const user = await getCurrentUser();
    const { itemIds, date, ...rest } = parsed.data;

    // Reject item ids belonging to another user rather than silently dropping them.
    if (itemIds.length) {
      const owned = await prisma.wardrobeItem.count({
        where: { id: { in: itemIds }, userId: user.id },
      });
      if (owned !== itemIds.length) throw new HttpError(400, 'One or more itemIds are invalid');
    }

    const outfit = await prisma.outfit.create({
      data: {
        ...rest,
        reasoning: rest.reasoning ?? [],
        forDate: parseDate(date),
        userId: user.id,
        outfitItems: { create: itemIds.map((id, position) => ({ itemId: id, position })) },
      },
      include: withItems,
    });

    res.status(201).json(serializeOutfit(outfit));
  }),
);

outfitsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser();
    const existing = await prisma.outfit.findFirst({
      where: { id: req.params.id, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw notFound('Outfit');
    await prisma.outfit.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

export { parseDate };
