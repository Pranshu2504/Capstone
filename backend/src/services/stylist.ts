import type { User, WardrobeItem } from '@prisma/client';

import { generateJson, isStylistConfigured } from '../lib/gemini.js';

/** The answers the client collects, keyed by STYLIST_QUESTIONS ids. */
export interface StylistAnswers {
  occasion?: string;
  formality?: string;
  mood?: string[];
  colorTheme?: string;
  repeatPolicy?: string;
  notes?: string;
  /** Passed through from the device so the pick suits the actual day. */
  weather?: { tempC?: number; summary?: string };
}

/** A past suggestion the wearer judged, used to steer the next one. */
export interface OutfitVerdict {
  headline: string;
  itemNames: string[];
  liked: boolean | null;
}

export interface StylistPick {
  headline: string;
  subhead: string;
  itemIds: string[];
  reasoning: string[];
  stylingNote: string;
  /** True when Gemini produced this, false when the scorer did. */
  aiGenerated: boolean;
}

/** Recently-worn items are penalised rather than filtered, so a thin wardrobe still returns something. */
const RECENT_WEAR_PENALTY = 40;

const COLOR_THEME_HINTS: Record<string, string> = {
  neutral: 'beige, sand, cream, grey, taupe, ivory, camel',
  monochrome: 'black, charcoal, deep grey',
  earthy: 'brown, rust, olive, walnut, terracotta',
  bold: 'one saturated statement colour against neutrals',
  soft: 'pastels, ivory, blush, light and airy tones',
  jewel: 'navy, emerald, burgundy, deep teal',
  any: 'no constraint',
};

// ── Deterministic scorer (the no-API-key path) ──────────────────────────────

/** Rough luminance, used to tell dark pieces from light ones without a colour library. */
function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function wornRecently(item: WardrobeItem): boolean {
  const last = (item.lastWorn ?? '').toLowerCase();
  return /today|yesterday|hour|day ago|[1-6] days/.test(last);
}

function scoreItem(
  item: WardrobeItem,
  answers: StylistAnswers,
  history: { likedItems: Set<string>; rejectedItems: Set<string> },
): number {
  let score = 50;

  // Explicit verdicts outrank every inferred preference below.
  if (history.rejectedItems.has(item.id)) score -= 55;
  if (history.likedItems.has(item.id)) score += 30;

  if (answers.occasion && item.occasions.includes(answers.occasion)) score += 45;
  else if (answers.occasion && item.occasions.length) score -= 15;

  const wanted = Number(answers.formality ?? 3);
  if (item.formality != null) score -= Math.abs(item.formality - wanted) * 12;

  const lum = luminance(item.color);
  switch (answers.colorTheme) {
    case 'monochrome':
      score += lum < 0.2 ? 30 : -20;
      break;
    case 'soft':
      score += lum > 0.6 ? 25 : -10;
      break;
    case 'neutral':
      score += /sand|beige|cream|ivory|grey|gray|taupe|camel|stone|onyx/i.test(item.colorName) ? 25 : -5;
      break;
    case 'earthy':
      score += /walnut|rust|olive|brown|tan|terracotta|khaki/i.test(item.colorName) ? 25 : -5;
      break;
    case 'jewel':
      score += /navy|emerald|burgundy|teal|plum|sapphire/i.test(item.colorName) ? 25 : -5;
      break;
    default:
      break;
  }

  // Wear history — the answer to "about what you have been wearing".
  if (answers.repeatPolicy === 'avoid' && wornRecently(item)) score -= RECENT_WEAR_PENALTY;
  if (answers.repeatPolicy === 'dustoff') score += item.dustOff ? 35 : -item.timesWorn * 2;

  const temp = answers.weather?.tempC;
  if (temp != null) {
    const season = temp <= 14 ? 'winter' : temp >= 28 ? 'summer' : null;
    if (season && item.seasons.includes(season)) score += 20;
    if (season === 'summer' && /wool|cashmere|fleece/i.test(item.fabric)) score -= 30;
    if (season === 'winter' && /linen|mesh/i.test(item.fabric)) score -= 25;
  }

  return score;
}

/**
 * Picks a wearable outfit by scoring each item, then taking the best of each
 * slot. Deliberately simple and explainable — it is the honest fallback when
 * no Gemini key is set, not a second-rate imitation of the model.
 */
function scoreOutfit(
  items: WardrobeItem[],
  answers: StylistAnswers,
  history: { likedItems: Set<string>; rejectedItems: Set<string> },
): StylistPick | null {
  if (!items.length) return null;

  const ranked = items
    .map((item) => ({ item, score: scoreItem(item, answers, history) }))
    .sort((a, b) => b.score - a.score);

  const bestOf = (category: string) =>
    ranked.find((r) => r.item.category.toLowerCase() === category.toLowerCase())?.item ?? null;

  const chosen: WardrobeItem[] = [];
  const dress = bestOf('Dresses');
  const top = bestOf('Tops');
  const bottom = bestOf('Bottoms');

  // A dress only wins if it out-scores the top+bottom pairing it replaces.
  const dressScore = dress ? scoreItem(dress, answers, history) : -Infinity;
  const pairScore =
    top && bottom
      ? (scoreItem(top, answers, history) + scoreItem(bottom, answers, history)) / 2
      : -Infinity;

  if (dress && dressScore >= pairScore) {
    chosen.push(dress);
  } else {
    if (top) chosen.push(top);
    if (bottom) chosen.push(bottom);
  }

  const temp = answers.weather?.tempC;
  if (temp == null || temp <= 22) {
    const outer = bestOf('Outerwear');
    if (outer) chosen.push(outer);
  }
  const shoes = bestOf('Shoes');
  if (shoes) chosen.push(shoes);

  if (!chosen.length) chosen.push(ranked[0].item);

  const names = chosen.map((i) => i.name.toLowerCase());
  const reasoning = [
    answers.occasion ? `Built for ${answers.occasion}.` : 'Built from what you own.',
    `${chosen[0].colorName} leads, so the rest stays quiet.`,
    answers.repeatPolicy === 'dustoff'
      ? 'Favours pieces you have barely touched.'
      : answers.repeatPolicy === 'avoid'
        ? 'Skips anything you wore in the last few days.'
        : 'Balanced against how often you wear each piece.',
  ];

  return {
    headline: names.slice(0, 2).join(' + '),
    subhead: answers.mood?.length ? answers.mood.join(' · ') : 'today, assembled',
    itemIds: chosen.map((i) => i.id),
    reasoning,
    stylingNote: 'Roll the sleeves and keep jewellery minimal — let the silhouette do the work.',
    aiGenerated: false,
  };
}

// ── Gemini path ─────────────────────────────────────────────────────────────

const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Two to four lowercase words naming the look' },
    subhead: { type: 'string', description: 'One short line on the feeling of the outfit' },
    itemIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'ids of the chosen wardrobe items, in the order they are worn',
    },
    reasoning: {
      type: 'array',
      items: { type: 'string' },
      description: 'Two to four short sentences on why this works for today',
    },
    stylingNote: { type: 'string', description: 'One concrete tip for wearing it well' },
  },
  required: ['headline', 'subhead', 'itemIds', 'reasoning', 'stylingNote'],
  additionalProperties: false,
};

const SYSTEM = `You are ZORA, a personal stylist with taste and restraint.

You pick one outfit from the clothes the person actually owns. You are given
their full wardrobe with ids, how often each piece is worn, their stated
style profile, and their answers about today.

Hard rules:
- Only ever return ids from the wardrobe list. Never invent an item.
- Return a complete, wearable outfit: either a dress, or a top and a bottom.
  Add outerwear and shoes when the weather or occasion calls for it.
- Do not put two items from the same category together unless layering
  genuinely makes sense (a shirt under a jacket, for instance).
- Respect the occasion and formality answers above your own preferences.

Voice: lowercase headlines, calm and specific. Say why *these* pieces, not
generic styling advice. Never mention that you are an AI or that you were
given a list.`;

function describeWardrobe(items: WardrobeItem[]): string {
  return items
    .map((i) =>
      [
        `id=${i.id}`,
        `name="${i.name}"`,
        `category=${i.category}`,
        `colour=${i.colorName}(${i.color})`,
        `fabric=${i.fabric}`,
        i.pattern ? `pattern=${i.pattern}` : '',
        i.formality != null ? `formality=${i.formality}/5` : '',
        i.occasions.length ? `occasions=[${i.occasions.join(',')}]` : '',
        i.seasons.length ? `seasons=[${i.seasons.join(',')}]` : '',
        i.styleTags.length ? `style=[${i.styleTags.join(',')}]` : '',
        `wornTimes=${i.timesWorn}`,
        i.lastWorn ? `lastWorn="${i.lastWorn}"` : 'lastWorn=never',
        i.dustOff ? 'NEGLECTED' : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join('\n');
}

function describeToday(answers: StylistAnswers, history: OutfitVerdict[]): string {
  const lines = [
    `occasion: ${answers.occasion ?? 'unspecified'}`,
    `formality wanted: ${answers.formality ?? '3'}/5`,
    `wants to feel: ${answers.mood?.join(', ') || 'unspecified'}`,
    `colour direction: ${COLOR_THEME_HINTS[answers.colorTheme ?? 'any'] ?? 'no constraint'}`,
    `repeat policy: ${answers.repeatPolicy ?? 'any'}`,
  ];
  if (answers.weather?.tempC != null) {
    lines.push(`weather: ${Math.round(answers.weather.tempC)}°C ${answers.weather.summary ?? ''}`.trim());
  }
  if (answers.notes?.trim()) lines.push(`their own words: "${answers.notes.trim()}"`);

  const liked = history.filter((h) => h.liked === true);
  const rejected = history.filter((h) => h.liked === false);
  const unjudged = history.filter((h) => h.liked === null);

  // Rejections are the strongest signal available, so they lead.
  if (rejected.length) {
    lines.push(
      `they said NO to these — do not suggest these combinations again:\n` +
        rejected.map((h) => `  - "${h.headline}" (${h.itemNames.join(', ')})`).join('\n'),
    );
  }
  if (liked.length) {
    lines.push(
      `they said YES to these — more like this:\n` +
        liked.map((h) => `  - "${h.headline}" (${h.itemNames.join(', ')})`).join('\n'),
    );
  }
  if (unjudged.length) {
    lines.push(`recently suggested (avoid repeating): ${unjudged.map((h) => h.headline).join('; ')}`);
  }
  return lines.join('\n');
}

/**
 * Asks Gemini for an outfit, then validates the ids it returned.
 *
 * The model is the only thing that can be creative here, but it is not
 * trusted: any id it invents is dropped, and if nothing survives we fall
 * through to the scorer rather than showing an outfit of nonexistent clothes.
 */
export async function recommendOutfit(args: {
  user: User;
  items: WardrobeItem[];
  answers: StylistAnswers;
  history: OutfitVerdict[];
}): Promise<StylistPick | null> {
  const { user, items, answers, history } = args;
  if (!items.length) return null;

  // Item-level verdicts, inherited from the outfits they appeared in.
  const byName = new Map(items.map((i) => [i.name, i.id]));
  const collect = (liked: boolean) =>
    new Set(
      history
        .filter((h) => h.liked === liked)
        .flatMap((h) => h.itemNames.flatMap((n) => (byName.has(n) ? [byName.get(n)!] : []))),
    );
  const verdicts = { likedItems: collect(true), rejectedItems: collect(false) };

  if (isStylistConfigured) {
    try {
      const profile = [
        `name: ${user.name}`,
        user.moodKeywords.length ? `style words: ${user.moodKeywords.join(', ')}` : '',
        user.palette.length ? `palette they chose: ${user.palette.join(', ')}` : '',
        user.favoritesBrand ? `brand they aspire to: ${user.favoritesBrand}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const pick = await generateJson<Omit<StylistPick, 'aiGenerated'>>({
        systemInstruction: SYSTEM,
        schema: SCHEMA,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `THEIR STYLE PROFILE\n${profile}\n\nTODAY\n${describeToday(
                  answers,
                  history,
                )}\n\nTHEIR WARDROBE\n${describeWardrobe(items)}\n\nPick today's outfit.`,
              },
            ],
          },
        ],
      });

      const owned = new Set(items.map((i) => i.id));
      const itemIds = (pick.itemIds ?? []).filter((id) => owned.has(id));

      if (itemIds.length) {
        return { ...pick, itemIds, aiGenerated: true };
      }
      console.warn('[stylist] Gemini returned no valid item ids; using the scorer.');
    } catch (err) {
      console.error('[stylist] Gemini call failed:', err instanceof Error ? err.message : err);
    }
  }

  return scoreOutfit(items, answers, verdicts);
}
