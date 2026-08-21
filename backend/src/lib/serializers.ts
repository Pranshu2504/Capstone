import type { CommunityPost, Outfit, OutfitItem, PlannedDay, Trend, User, WardrobeItem } from '@prisma/client';

/**
 * Serializers keep the wire format identical to the shapes the RN screens
 * already consume from mockData.ts, so components need no prop changes.
 */

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

export const serializeUser = (user: User) => ({
  id: user.id,
  name: user.name,
  handle: user.handle,
  email: user.email,
  moodKeywords: user.moodKeywords,
  palette: user.palette,
  favoritesBrand: user.favoritesBrand,
});

/**
 * `photoUrl` is minted per request from the private storage bucket, so it is
 * passed in rather than read off the row — the row only holds the object path.
 */
export const serializeItem = (item: WardrobeItem, photoUrl?: string) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  color: item.color,
  colorName: item.colorName,
  fabric: item.fabric,
  timesWorn: item.timesWorn,
  lastWorn: item.lastWorn,
  occasions: item.occasions,
  dustOff: item.dustOff,
  image: photoUrl ?? item.image,
  description: item.description,
  styleTags: item.styleTags,
  pattern: item.pattern,
  seasons: item.seasons,
  formality: item.formality,
});

/** Signs every photo in one round trip, then serializes. */
export async function serializeItems(
  items: WardrobeItem[],
  sign: (paths: string[]) => Promise<Map<string, string>>,
) {
  const urls = await sign(items.map((i) => i.imagePath ?? '').filter(Boolean));
  return items.map((item) => serializeItem(item, item.imagePath ? urls.get(item.imagePath) : undefined));
}

type OutfitWithItems = Outfit & {
  outfitItems: (OutfitItem & { item: WardrobeItem })[];
};

export const serializeOutfit = (outfit: OutfitWithItems) => {
  const ordered = [...outfit.outfitItems].sort((a, b) => a.position - b.position);
  return {
    id: outfit.id,
    headline: outfit.headline,
    subhead: outfit.subhead,
    occasion: outfit.occasion,
    reasoning: outfit.reasoning,
    date: toISODate(outfit.forDate),
    // `items` is the flat name list the Mirror screen renders today.
    items: ordered.map((oi) => oi.item.name),
    itemDetails: ordered.map((oi) => serializeItem(oi.item)),
  };
};

export const serializePlannedDay = (day: PlannedDay) => ({
  id: day.id,
  date: toISODate(day.date),
  label: day.label,
  colors: day.colors,
  outfitId: day.outfitId,
});

export const serializeTrend = (trend: Trend) => ({
  id: trend.id,
  name: trend.name,
  tag: trend.tag,
  description: trend.description,
});

export const serializePost = (post: CommunityPost) => ({
  id: post.id,
  handle: post.handle,
  lookName: post.lookName,
  aesthetic: post.aesthetic,
  hasSimilar: post.hasSimilar,
  color: post.color,
});
