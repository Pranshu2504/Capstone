/** Wire types returned by the ZORA backend (backend/src/lib/serializers.ts). */

export interface ApiUser {
  id: string;
  name: string;
  handle: string;
  moodKeywords: string[];
  palette: string[];
  favoritesBrand: string | null;
}

export interface ApiWardrobeItem {
  id: string;
  name: string;
  category: string;
  color: string;
  colorName: string;
  fabric: string;
  timesWorn: number;
  lastWorn: string | null;
  occasions: string[];
  dustOff: boolean;
  image: string | null;
}

export interface ApiOutfit {
  id: string;
  headline: string;
  subhead: string | null;
  occasion: string | null;
  reasoning: string[];
  date: string;
  items: string[];
  itemDetails: ApiWardrobeItem[];
}

export interface ApiPlannedDay {
  id: string;
  date: string;
  label: string;
  colors: string[];
  outfitId: string | null;
}

export interface ApiCalendar {
  days: ApiPlannedDay[];
  planned: Record<string, { colors: string[]; label: string }>;
}

export interface ApiTrend {
  id: string;
  name: string;
  tag: string;
  description: string;
}

export interface ApiCommunityPost {
  id: string;
  handle: string;
  lookName: string;
  aesthetic: string;
  hasSimilar: boolean;
  color: string;
}

export interface ApiCategoryCount {
  category: string;
  count: number;
}
