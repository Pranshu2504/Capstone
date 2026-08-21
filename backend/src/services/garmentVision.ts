import { generateJson, isStylistConfigured } from '../lib/gemini.js';

/** What the vision pass reads off one garment photo. */
export interface GarmentAnalysis {
  name: string;
  category: string;
  color: string;
  colorName: string;
  fabric: string;
  pattern: string;
  occasions: string[];
  styleTags: string[];
  seasons: string[];
  /** 1 = loungewear, 5 = black tie. Drives how "dressed up" a pick reads. */
  formality: number;
  description: string;
}

/** Kept in sync with the frontend's category rails so items file correctly. */
const CATEGORIES = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories'];
const OCCASIONS = ['office', 'casual', 'events', 'date', 'travel', 'workout', 'indian', 'formal'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short human name, e.g. "charcoal wool blazer"' },
    category: { type: 'string', enum: CATEGORIES },
    color: { type: 'string', description: 'Dominant colour as a #RRGGBB hex code' },
    colorName: { type: 'string', description: 'Colour name, e.g. "Onyx", "Sand"' },
    fabric: { type: 'string', description: 'Best guess at the material, e.g. "Cotton"' },
    pattern: { type: 'string', description: 'e.g. "solid", "striped", "floral"' },
    occasions: { type: 'array', items: { type: 'string', enum: OCCASIONS } },
    styleTags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Two to four aesthetic descriptors, e.g. "minimal", "structured"',
    },
    seasons: { type: 'array', items: { type: 'string', enum: SEASONS } },
    formality: { type: 'integer', minimum: 1, maximum: 5 },
    description: { type: 'string', description: 'One sentence describing the garment' },
  },
  required: [
    'name',
    'category',
    'color',
    'colorName',
    'fabric',
    'pattern',
    'occasions',
    'styleTags',
    'seasons',
    'formality',
    'description',
  ],
  additionalProperties: false,
};

const SYSTEM = `You catalogue clothing for a personal wardrobe app.

Look at the photo and describe the single main garment in it. Be specific and
literal — read the actual colour, cut and material off the image rather than
guessing at a generic version of the item.

Rules:
- "color" must be a #RRGGBB hex sampled from the garment itself, not from the
  background or the person wearing it.
- If several garments are visible, describe the most prominent one only.
- formality: 1 loungewear, 2 casual, 3 smart casual, 4 business, 5 black tie.
- Keep "name" lowercase and under five words.`;

/** Falls back to a neutral, clearly-unanalysed item so upload never hard-fails. */
function fallback(): GarmentAnalysis {
  return {
    name: 'new item',
    category: 'Tops',
    color: '#8B8682',
    colorName: 'Unsorted',
    fabric: 'Unknown',
    pattern: 'solid',
    occasions: ['casual'],
    styleTags: [],
    seasons: [],
    formality: 2,
    description: 'Not analysed yet — add details by hand.',
  };
}

/**
 * Reads one garment photo into structured metadata.
 *
 * Runs once per upload so the far more frequent recommendation calls can
 * reason over text alone. Any failure (no API key, quota, a photo the model
 * can't parse) degrades to a placeholder the user can edit rather than
 * rejecting the upload.
 */
export async function analyseGarmentPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<{ analysis: GarmentAnalysis; analysed: boolean }> {
  if (!isStylistConfigured) return { analysis: fallback(), analysed: false };

  try {
    const analysis = await generateJson<GarmentAnalysis>({
      systemInstruction: SYSTEM,
      schema: SCHEMA,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: 'Catalogue this garment.' },
          ],
        },
      ],
    });
    return { analysis: { ...fallback(), ...analysis }, analysed: true };
  } catch (err) {
    console.error('[vision] Garment analysis failed:', err instanceof Error ? err.message : err);
    return { analysis: fallback(), analysed: false };
  }
}
