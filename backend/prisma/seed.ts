/**
 * Seeds the database from the same fixtures the RN app shipped in
 * frontend/src/constants/mockData.ts, so the API renders an identical demo.
 * Idempotent: safe to re-run.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_HANDLE = '@aria.chen';

const WARDROBE = [
  { name: 'Black Cashmere Coat',    category: 'Outerwear',   color: '#1C1C1C', colorName: 'Onyx',   fabric: 'Cashmere',   timesWorn: 12, lastWorn: '2 days ago',  occasions: ['office', 'events'],  dustOff: false },
  { name: 'White Silk Blouse',      category: 'Tops',        color: '#F5EDD6', colorName: 'Ivory',  fabric: 'Silk',       timesWorn: 8,  lastWorn: '5 days ago',  occasions: ['office', 'events'],  dustOff: false },
  { name: 'Tailored Wool Trousers', category: 'Bottoms',     color: '#4A3728', colorName: 'Walnut', fabric: 'Wool',       timesWorn: 6,  lastWorn: '1 week ago',  occasions: ['office'],            dustOff: true  },
  { name: 'Linen Wide-Leg Pants',   category: 'Bottoms',     color: '#C8BCA8', colorName: 'Sand',   fabric: 'Linen',      timesWorn: 3,  lastWorn: '3 weeks ago', occasions: ['casual'],            dustOff: true  },
  { name: 'Leather Oxford Shoes',   category: 'Shoes',       color: '#3B2A1A', colorName: 'Cognac', fabric: 'Leather',    timesWorn: 15, lastWorn: 'Yesterday',   occasions: ['office', 'events'],  dustOff: false },
  { name: 'Merino Turtleneck',      category: 'Tops',        color: '#8B8682', colorName: 'Greige', fabric: 'Merino Wool',timesWorn: 2,  lastWorn: '2 weeks ago', occasions: ['casual', 'office'],  dustOff: true  },
  { name: 'Silk Scarf',             category: 'Accessories', color: '#C9A84C', colorName: 'Amber',  fabric: 'Silk',       timesWorn: 4,  lastWorn: '4 days ago',  occasions: ['events'],            dustOff: false },
  { name: 'Black Leather Belt',     category: 'Accessories', color: '#1C1C1C', colorName: 'Black',  fabric: 'Leather',    timesWorn: 20, lastWorn: 'Yesterday',   occasions: ['office', 'casual'],  dustOff: false },
  { name: 'Chelsea Boots',          category: 'Shoes',       color: '#1C1C1C', colorName: 'Black',  fabric: 'Leather',    timesWorn: 18, lastWorn: '3 days ago',  occasions: ['casual', 'office'],  dustOff: false },
  { name: 'Oversized Blazer',       category: 'Outerwear',   color: '#6B5B4E', colorName: 'Mocha',  fabric: 'Wool Blend', timesWorn: 1,  lastWorn: '1 month ago', occasions: ['events'],            dustOff: true  },
];

const TRENDS = [
  { name: 'Quiet Luxury',          tag: 'in your closet', description: 'Understated wealth, impeccable fabric' },
  { name: 'Office Siren',          tag: 'explore',        description: 'Power dressing with a sharp edge' },
  { name: 'Coastal Grandmother',   tag: 'explore',        description: 'Linen, comfort, lived-in elegance' },
];

const POSTS = [
  { handle: '@priya.m',  lookName: 'The Monday Armor',  aesthetic: 'Quiet Luxury',      hasSimilar: true,  color: '#2A2218' },
  { handle: '@rahul.k',  lookName: 'Friday Energy',     aesthetic: 'Dopamine Dressing', hasSimilar: false, color: '#1C3040' },
  { handle: '@meera.v',  lookName: 'Effortless Sunday', aesthetic: 'Indie Sleaze',      hasSimilar: false, color: '#251820' },
  { handle: '@sofia.d',  lookName: 'Sharp & Clean',     aesthetic: 'Office Siren',      hasSimilar: true,  color: '#0D1520' },
];

const VIBES = [
  'Quiet Luxury', 'Dopamine Dressing', 'Office Siren', 'Coastal Grandmother',
  'Indie Sleaze', 'Dark Academia', 'Clean Girl',
];

const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Returns the ISO date `offset` days from today, so the demo is never stale. */
function relativeISO(offset: number): string {
  const d = new Date(`${todayISO()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const user = await prisma.user.upsert({
    where: { handle: DEMO_HANDLE },
    create: {
      name: 'Aria',
      handle: DEMO_HANDLE,
      moodKeywords: ['Powerful', 'Effortless', 'Sharp'],
      palette: ['#1C1C1C', '#C9A84C', '#8B8682', '#F5EDD6', '#2A2218'],
      favoritesBrand: 'The Row',
    },
    update: {},
  });

  // Rebuild this user's wardrobe/outfit graph from scratch each run.
  await prisma.plannedDay.deleteMany({ where: { userId: user.id } });
  await prisma.outfit.deleteMany({ where: { userId: user.id } });
  await prisma.wardrobeItem.deleteMany({ where: { userId: user.id } });

  const items = new Map<string, string>();
  for (const item of WARDROBE) {
    const created = await prisma.wardrobeItem.create({ data: { ...item, userId: user.id } });
    items.set(created.name, created.id);
  }

  const outfitItemNames = [
    'Black Cashmere Coat',
    'White Silk Blouse',
    'Tailored Wool Trousers',
    'Leather Oxford Shoes',
  ];

  const today = await prisma.outfit.create({
    data: {
      userId: user.id,
      headline: 'effortless monday',
      subhead: '22° · partly cloudy · meeting at 3pm',
      occasion: 'office',
      reasoning: [
        '22° cloudy → coat layer needed',
        '3pm meeting → elevated casual',
        'Last 3 outfits: flowy dresses',
        'Your saved mood: Effortless + Sharp',
      ],
      forDate: utcDate(todayISO()),
      outfitItems: {
        create: outfitItemNames.map((name, position) => ({ itemId: items.get(name)!, position })),
      },
    },
  });

  // Planned days are anchored to today so the calendar always shows a live week.
  const planned = [
    { offset: 0, label: 'Office Look', colors: ['#1C1C1C', '#F5EDD6', '#3B2A1A'], outfitId: today.id },
    { offset: 2, label: 'Casual Day',  colors: ['#8B8682', '#C8BCA8'] },
    { offset: 4, label: 'Dinner Look', colors: ['#1C1C1C', '#C9A84C'] },
    { offset: 6, label: 'Weekend',     colors: ['#4A3728', '#F5EDD6', '#1C1C1C'] },
    { offset: 8, label: 'Event Night', colors: ['#3B2A1A', '#8B8682'] },
  ];

  for (const day of planned) {
    await prisma.plannedDay.create({
      data: {
        userId: user.id,
        date: utcDate(relativeISO(day.offset)),
        label: day.label,
        colors: day.colors,
        outfitId: day.outfitId ?? null,
      },
    });
  }

  for (const [position, trend] of TRENDS.entries()) {
    await prisma.trend.upsert({
      where: { name: trend.name },
      create: { ...trend, position },
      update: { ...trend, position },
    });
  }

  await prisma.communityPost.deleteMany();
  await prisma.communityPost.createMany({ data: POSTS });

  for (const [position, name] of VIBES.entries()) {
    await prisma.vibe.upsert({
      where: { name },
      create: { name, position },
      update: { position },
    });
  }

  console.log(
    `Seeded ${WARDROBE.length} items, 1 outfit, ${planned.length} planned days, ` +
      `${TRENDS.length} trends, ${POSTS.length} posts, ${VIBES.length} vibes for ${DEMO_HANDLE}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
