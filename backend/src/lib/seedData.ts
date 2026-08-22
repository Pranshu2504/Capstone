/**
 * Demo fixtures, mirroring what frontend/src/constants/mockData.ts used to
 * hardcode. Lives under src/ (rather than prisma/) so it compiles into dist
 * and the server can seed itself on first boot — Render's free tier has no
 * Shell to run `npm run db:seed` from.
 *
 * Re-running rebuilds the demo user's wardrobe graph from scratch.
 */
import type { PrismaClient } from '@prisma/client';

const DEMO_HANDLE = '@aria.chen';


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



export async function seedDemoData(prisma: PrismaClient): Promise<void> {
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

  // Deliberately no wardrobe, outfits or planned days.
  //
  // Seeding clothes gave the demo user a closet full of garments nobody owns,
  // and the stylist has no way to tell those from real uploads — so it would
  // confidently recommend a "Linen Wide-Leg Pants" that exists only here.
  // An empty wardrobe is honest: it says add photos, and every suggestion
  // after that is made of things you actually have.
  //
  // Trends, posts and vibes below are editorial content rather than anyone's
  // possessions, so they stay.

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
    `Seeded demo user, ` +
      `${TRENDS.length} trends, ${POSTS.length} posts, ${VIBES.length} vibes for ${DEMO_HANDLE}`,
  );
}

export { DEMO_HANDLE };
