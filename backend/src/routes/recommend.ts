import { Router } from 'express';
import { z } from 'zod';

import { getCurrentUser } from '../lib/currentUser.js';
import { isStylistConfigured } from '../lib/gemini.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { serializeItem, serializeOutfit } from '../lib/serializers.js';
import { signGarmentPhotos } from '../lib/wardrobeStorage.js';
import { recommendOutfit } from '../services/stylist.js';
import { STYLIST_QUESTIONS } from '../services/stylistQuestions.js';

export const recommendRouter = Router();

/** The client renders whatever this returns, so the two never drift apart. */
recommendRouter.get('/questions', (_req, res) => {
  res.json({ questions: STYLIST_QUESTIONS, aiEnabled: isStylistConfigured });
});

const answersSchema = z.object({
  occasion: z.string().optional(),
  formality: z.string().optional(),
  mood: z.array(z.string()).optional(),
  colorTheme: z.string().optional(),
  repeatPolicy: z.string().optional(),
  notes: z.string().max(500).optional(),
  weather: z
    .object({ tempC: z.number().optional(), summary: z.string().optional() })
    .optional(),
});

const todayUTC = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

/**
 * Answers in, one outfit out.
 *
 * The pick is persisted as today's Outfit — the same row the Mirror screen's
 * hero already reads — so a recommendation survives a reload and shows up as
 * "today's outfit" without a second concept for it.
 */
recommendRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = answersSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'Invalid answers', parsed.error.flatten());

    const user = await getCurrentUser(req);

    const items = await prisma.wardrobeItem.findMany({ where: { userId: user.id } });
    if (!items.length) {
      throw new HttpError(
        409,
        'Your wardrobe is empty — add a few photos of your clothes first.',
      );
    }

    // Past suggestions plus any verdict on them. Rejections are the strongest
    // steer the stylist gets, so this is worth a join rather than a headline list.
    const recent = await prisma.outfit.findMany({
      where: { userId: user.id },
      orderBy: [{ forDate: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      select: {
        headline: true,
        liked: true,
        outfitItems: { select: { item: { select: { name: true } } } },
      },
    });

    const pick = await recommendOutfit({
      user,
      items,
      answers: parsed.data,
      history: recent.map((o) => ({
        headline: o.headline,
        itemNames: o.outfitItems.map((oi) => oi.item.name),
        liked: o.liked,
      })),
    });

    if (!pick) throw new HttpError(422, 'Could not assemble an outfit from your wardrobe.');

    // One outfit per user per day (@@unique([userId, forDate])) — re-running
    // the interview replaces the day's pick rather than stacking duplicates.
    const forDate = todayUTC();
    const outfit = await prisma.$transaction(async (tx) => {
      await tx.outfit.deleteMany({ where: { userId: user.id, forDate } });
      return tx.outfit.create({
        data: {
          userId: user.id,
          headline: pick.headline,
          subhead: pick.subhead,
          occasion: parsed.data.occasion ?? null,
          reasoning: [...pick.reasoning, pick.stylingNote],
          forDate,
          outfitItems: {
            create: pick.itemIds.map((itemId, position) => ({ itemId, position })),
          },
        },
        include: { outfitItems: { include: { item: true } } },
      });
    });

    const photoUrls = await signGarmentPhotos(
      outfit.outfitItems.map((oi) => oi.item.imagePath ?? '').filter(Boolean),
    );

    res.status(201).json({
      ...serializeOutfit(outfit),
      // Re-serialized with signed photos so the result card can show the real
      // garments and the try-on hand-off has a URL to work with. Same shape as
      // every other wardrobe item, just with the URL filled in.
      itemDetails: outfit.outfitItems
        .sort((a, b) => a.position - b.position)
        .map((oi) =>
          serializeItem(oi.item, oi.item.imagePath ? photoUrls.get(oi.item.imagePath) : undefined),
        ),
      stylingNote: pick.stylingNote,
      aiGenerated: pick.aiGenerated,
    });
  }),
);

const feedbackSchema = z.object({ liked: z.boolean() });

/**
 * Records a yes/no on a suggestion.
 *
 * The verdict is not just analytics — `recommendOutfit` reads it back on the
 * next run, so a "no" stops those pieces being offered together again and a
 * "yes" pulls the next look towards them.
 */
recommendRouter.post(
  '/:id/feedback',
  asyncHandler(async (req, res) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());

    const user = await getCurrentUser(req);
    const existing = await prisma.outfit.findFirst({
      where: { id: req.params.id, userId: user.id },
      select: { id: true },
    });
    if (!existing) throw notFound('Outfit');

    const outfit = await prisma.outfit.update({
      where: { id: existing.id },
      data: { liked: parsed.data.liked, feedbackAt: new Date() },
      select: { id: true, liked: true },
    });
    res.json(outfit);
  }),
);
