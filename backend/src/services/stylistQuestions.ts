/**
 * The "what should I wear today?" interview.
 *
 * Served to the client from `GET /api/recommend/questions` rather than
 * duplicated in the app, so the wording and the scoring stay in step — the
 * ids below are exactly the keys `POST /api/recommend` reads.
 */

export interface StylistChoice {
  value: string;
  label: string;
  /** Swatch for palette-style options; the client renders a colour chip. */
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

export const STYLIST_QUESTIONS: StylistQuestion[] = [
  {
    id: 'occasion',
    prompt: 'where is today taking you?',
    helper: 'the single biggest thing your outfit has to survive',
    type: 'single',
    choices: [
      { value: 'office', label: 'Work', hint: 'desk, meetings, commute' },
      { value: 'casual', label: 'Everyday', hint: 'errands, coffee, nothing formal' },
      { value: 'campus', label: 'Campus', hint: 'classes, library, long day' },
      { value: 'date', label: 'Date', hint: 'dinner, drinks, someone to impress' },
      { value: 'events', label: 'Event', hint: 'party, wedding, celebration' },
      { value: 'travel', label: 'Travel', hint: 'airports, trains, long sitting' },
      { value: 'indian', label: 'Festive', hint: 'traditional or ethnic wear' },
      { value: 'workout', label: 'Active', hint: 'gym, sport, movement' },
    ],
  },
  {
    id: 'formality',
    prompt: 'how put together?',
    helper: 'be honest about the effort you have in you today',
    type: 'single',
    choices: [
      { value: '1', label: 'Comfort first', hint: 'nobody is judging' },
      { value: '2', label: 'Casual', hint: 'easy but considered' },
      { value: '3', label: 'Smart casual', hint: 'the safe middle' },
      { value: '4', label: 'Sharp', hint: 'you want to look deliberate' },
      { value: '5', label: 'Full occasion', hint: 'pull out the good pieces' },
    ],
  },
  {
    id: 'mood',
    prompt: 'how do you want to come across?',
    helper: 'pick as many as feel true',
    type: 'multi',
    choices: [
      { value: 'powerful', label: 'Powerful', color: '#1C1C1C' },
      { value: 'effortless', label: 'Effortless', color: '#8B8682' },
      { value: 'playful', label: 'Playful', color: '#6B3A2A' },
      { value: 'mysterious', label: 'Mysterious', color: '#1C1540' },
      { value: 'warm', label: 'Warm', color: '#8B5E3C' },
      { value: 'sharp', label: 'Sharp', color: '#2A2218' },
    ],
  },
  {
    id: 'colorTheme',
    prompt: 'any colour direction?',
    type: 'single',
    choices: [
      { value: 'any', label: 'Surprise me', hint: 'no constraint' },
      { value: 'neutral', label: 'Neutrals', color: '#C8BCA8' },
      { value: 'monochrome', label: 'All black', color: '#1C1C1C' },
      { value: 'earthy', label: 'Earthy', color: '#8B5E3C' },
      { value: 'bold', label: 'One bold piece', color: '#8B3A22' },
      { value: 'soft', label: 'Soft & light', color: '#F5EDD6' },
      { value: 'jewel', label: 'Jewel tones', color: '#1C2A3A' },
    ],
  },
  {
    id: 'repeatPolicy',
    prompt: 'about what you have been wearing…',
    helper: 'ZORA knows what you wore recently',
    type: 'single',
    choices: [
      { value: 'avoid', label: 'Something different', hint: 'skip the last week' },
      { value: 'any', label: "Don't care", hint: 'repeats are fine' },
      { value: 'dustoff', label: 'Wear the forgotten', hint: 'favour untouched pieces' },
    ],
  },
  {
    id: 'notes',
    prompt: 'anything else ZORA should know?',
    helper: 'optional — a detail, a constraint, a feeling',
    type: 'text',
    optional: true,
  },
];
