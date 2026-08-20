import { Router } from 'express';
import { z } from 'zod';
import { getCurrentUser } from '../lib/currentUser.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { serializePlannedDay } from '../lib/serializers.js';
import { parseDate } from './outfits.js';

export const calendarRouter = Router();

const rangeSchema = z.object({ from: z.string().optional(), to: z.string().optional() });

calendarRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = rangeSchema.safeParse(req.query);
    if (!query.success) throw new HttpError(400, 'Invalid query', query.error.flatten());

    const user = await getCurrentUser();
    const { from, to } = query.data;

    const days = await prisma.plannedDay.findMany({
      where: {
        userId: user.id,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: parseDate(from) } : {}),
                ...(to ? { lte: parseDate(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
    });

    const serialized = days.map(serializePlannedDay);

    // `planned` is the date-keyed map the Calendar screen already indexes into.
    res.json({
      days: serialized,
      planned: Object.fromEntries(
        serialized.map((d) => [d.date, { colors: d.colors, label: d.label }]),
      ),
    });
  }),
);

const upsertSchema = z.object({
  date: z.string(),
  label: z.string().min(1),
  colors: z.array(z.string()).default([]),
  outfitId: z.string().nullable().optional(),
});

calendarRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());

    const user = await getCurrentUser();
    const { date, label, colors, outfitId } = parsed.data;

    if (outfitId) {
      const owned = await prisma.outfit.findFirst({
        where: { id: outfitId, userId: user.id },
        select: { id: true },
      });
      if (!owned) throw new HttpError(400, 'outfitId is invalid');
    }

    const day = await prisma.plannedDay.upsert({
      where: { userId_date: { userId: user.id, date: parseDate(date) } },
      create: { userId: user.id, date: parseDate(date), label, colors, outfitId: outfitId ?? null },
      update: { label, colors, outfitId: outfitId ?? null },
    });

    res.json(serializePlannedDay(day));
  }),
);

calendarRouter.delete(
  '/:date',
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser();
    const date = parseDate(req.params.date);
    const existing = await prisma.plannedDay.findUnique({
      where: { userId_date: { userId: user.id, date } },
      select: { id: true },
    });
    if (!existing) throw notFound('Planned day');
    await prisma.plannedDay.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
