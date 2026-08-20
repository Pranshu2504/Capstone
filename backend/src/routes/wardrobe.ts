import { Router } from 'express';
import { z } from 'zod';
import { getCurrentUser } from '../lib/currentUser.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { serializeItem } from '../lib/serializers.js';

export const wardrobeRouter = Router();

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  color: z.string().min(1),
  colorName: z.string().min(1),
  fabric: z.string().min(1),
  timesWorn: z.number().int().min(0).optional(),
  lastWorn: z.string().nullable().optional(),
  occasions: z.array(z.string()).optional(),
  dustOff: z.boolean().optional(),
  image: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial();

const listQuerySchema = z.object({
  category: z.string().optional(),
  occasion: z.string().optional(),
  dustOff: z.enum(['true', 'false']).optional(),
});

wardrobeRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) throw new HttpError(400, 'Invalid query', query.error.flatten());

    const user = await getCurrentUser();
    const { category, occasion, dustOff } = query.data;

    const items = await prisma.wardrobeItem.findMany({
      where: {
        userId: user.id,
        ...(category ? { category } : {}),
        ...(occasion ? { occasions: { has: occasion } } : {}),
        ...(dustOff ? { dustOff: dustOff === 'true' } : {}),
      },
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
    });

    res.json(items.map(serializeItem));
  }),
);

// Category counts drive the Wardrobe grid tiles.
wardrobeRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const user = await getCurrentUser();
    const grouped = await prisma.wardrobeItem.groupBy({
      by: ['category'],
      where: { userId: user.id },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });
    res.json(grouped.map((g) => ({ category: g.category, count: g._count._all })));
  }),
);

wardrobeRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser();
    const item = await prisma.wardrobeItem.findFirst({
      where: { id: req.params.id, userId: user.id },
    });
    if (!item) throw notFound('Wardrobe item');
    res.json(serializeItem(item));
  }),
);

wardrobeRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());

    const user = await getCurrentUser();
    const item = await prisma.wardrobeItem.create({
      data: {
        ...parsed.data,
        occasions: parsed.data.occasions ?? [],
        userId: user.id,
      },
    });
    res.status(201).json(serializeItem(item));
  }),
);

wardrobeRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());

    const user = await getCurrentUser();
    const existing = await prisma.wardrobeItem.findFirst({
      where: { id: req.params.id, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw notFound('Wardrobe item');

    const item = await prisma.wardrobeItem.update({
      where: { id: existing.id },
      data: parsed.data,
    });
    res.json(serializeItem(item));
  }),
);

// Bumps wear count — used by "wore this today" in the Mirror screen.
wardrobeRouter.post(
  '/:id/wear',
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser();
    const existing = await prisma.wardrobeItem.findFirst({
      where: { id: req.params.id, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw notFound('Wardrobe item');

    const item = await prisma.wardrobeItem.update({
      where: { id: existing.id },
      data: { timesWorn: { increment: 1 }, lastWorn: 'Today', dustOff: false },
    });
    res.json(serializeItem(item));
  }),
);

wardrobeRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser();
    const existing = await prisma.wardrobeItem.findFirst({
      where: { id: req.params.id, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw notFound('Wardrobe item');

    await prisma.wardrobeItem.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
