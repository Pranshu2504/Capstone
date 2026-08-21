/** Wire types returned by the ZORA backend (backend/src/lib/serializers.ts). */

export interface ApiUser {
  id: string;
  name: string;
  handle: string;
  email?: string | null;
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

// ── Stylist ("what should I wear today?") ────────────────────────────────────

export interface StylistChoice {
  value: string;
  label: string;
  color?: string;
  hint?: string;
}

export interface StylistQuestion {
  id: string;
  prompt: string;
  helper?: string;
  type: 'single' | 'multi' | 'text';
  optional?: boolean;
  choices?: StylistChoice[];
}

export interface StylistQuestionsResponse {
  questions: StylistQuestion[];
  /** False when the server has no Gemini key and is scoring deterministically. */
  aiEnabled: boolean;
}

/** Answers keyed by question id, plus the device's weather reading. */
export interface StylistAnswers {
  occasion?: string;
  formality?: string;
  mood?: string[];
  colorTheme?: string;
  repeatPolicy?: string;
  notes?: string;
  weather?: { tempC?: number; summary?: string };
}

export interface Recommendation extends ApiOutfit {
  /** One concrete tip for wearing the look well. */
  stylingNote: string;
  /** False when the server scored this deterministically instead of via Gemini. */
  aiGenerated: boolean;
}
