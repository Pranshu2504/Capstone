import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getCurrentUser } from '../lib/currentUser.js';
import { asyncHandler, HttpError, notFound } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { serializeItem, serializeItems } from '../lib/serializers.js';
import {
  deleteGarmentPhoto,
  signGarmentPhotos,
  uploadGarmentPhoto,
} from '../lib/wardrobeStorage.js';
import { analyseGarmentPhoto } from '../services/garmentVision.js';

export const wardrobeRouter = Router();

/** Garment photos are held in memory just long enough to forward to storage. */
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error(`Expected an image, received ${file.mimetype}.`));
  },
});

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

    const user = await getCurrentUser(req);
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

    res.json(await serializeItems(items, signGarmentPhotos));
  }),
);

// Category counts drive the Wardrobe grid tiles.
wardrobeRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req);
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
    const user = await getCurrentUser(req);
    const item = await prisma.wardrobeItem.findFirst({
      where: { id: req.params.id, userId: user.id },
    });
    if (!item) throw notFound('Wardrobe item');
    const [serialized] = await serializeItems([item], signGarmentPhotos);
    res.json(serialized);
  }),
);

wardrobeRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body', parsed.error.flatten());

    const user = await getCurrentUser(req);
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

    const user = await getCurrentUser(req);
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
    const user = await getCurrentUser(req);
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
    const user = await getCurrentUser(req);
    const existing = await prisma.wardrobeItem.findFirst({
      where: { id: req.params.id, userId: user.id },
      select: { id: true, imagePath: true },
    });
    if (!existing) throw notFound('Wardrobe item');

    await prisma.wardrobeItem.delete({ where: { id: existing.id } });
    // Best-effort: a surviving object is wasted storage, not a broken response.
    await deleteGarmentPhoto(existing.imagePath);
    res.status(204).end();
  }),
);

/**
 * Uploads one or more garment photos and turns each into a wardrobe item.
 *
 * Each photo is stored privately, then read once by the vision pass so the
 * stylist can later reason over text alone. A photo the model cannot parse
 * still becomes an item — just an unlabelled one the user can correct.
 */
wardrobeRouter.post(
  '/upload',
  photoUpload.array('photos', 8),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new HttpError(400, 'Attach at least one photo as "photos".');

    const user = await getCurrentUser(req);

    /*
     * Two levels of concurrency, because a strict loop made an eight-photo
     * batch take as long as eight uploads plus eight vision calls end to end.
     *
     * Within a photo: the storage upload and the vision pass both only need
     * the buffer, so waiting for one before starting the other bought nothing.
     *
     * Across photos: a bounded pool rather than Promise.all — firing every
     * vision call at once is the quickest way to trip Gemini's per-minute
     * limit, which degrades the whole batch to unlabelled placeholders.
     */
    const MAX_IN_FLIGHT = 4;
    const created: Awaited<ReturnType<typeof prisma.wardrobeItem.create>>[] = new Array(files.length);
    let next = 0;

    const worker = async (): Promise<void> => {
      for (let i = next++; i < files.length; i = next++) {
        const file = files[i];

        const [imagePath, { analysis }] = await Promise.all([
          uploadGarmentPhoto({ userId: user.id, buffer: file.buffer, mimeType: file.mimetype }),
          analyseGarmentPhoto(file.buffer.toString('base64'), file.mimetype),
        ]);

        // Indexed rather than pushed so the response keeps the order the
        // photos were picked in, whichever worker finishes first.
        created[i] = await prisma.wardrobeItem.create({
          data: {
            userId: user.id,
            imagePath,
            name: analysis.name,
            category: analysis.category,
            color: analysis.color,
            colorName: analysis.colorName,
            fabric: analysis.fabric,
            pattern: analysis.pattern,
            occasions: analysis.occasions,
            styleTags: analysis.styleTags,
            seasons: analysis.seasons,
            formality: analysis.formality,
            description: analysis.description,
          },
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_IN_FLIGHT, files.length) }, () => worker()),
    );

    res.status(201).json(await serializeItems(created, signGarmentPhotos));
  }),
);
