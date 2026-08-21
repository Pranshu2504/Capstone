import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Render sets no CORS_ORIGIN by default; keep localhost usable out of the box.
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // The single demo user the API serves for unauthenticated requests.
  demoUserHandle: process.env.DEMO_USER_HANDLE ?? '@aria.chen',
  // Optional: without these, /api/auth/* returns 503 and every request falls
  // back to the demo user, same as before Supabase auth existed.
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  // Private Storage bucket holding user garment photos. Created on demand.
  wardrobeBucket: process.env.SUPABASE_WARDROBE_BUCKET ?? 'wardrobe',

  // ── Stylist (Google Gemini) ─────────────────────────────────────────────
  // Optional: without a key, garment uploads still work (they just skip the
  // vision pass) and /api/recommend falls back to deterministic scoring.
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.7-flash',
};
