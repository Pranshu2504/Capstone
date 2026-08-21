/**
 * Supabase project config for the native (Metro) build.
 *
 * The anon/publishable key is safe to ship in a client bundle — it's the
 * public half of the pair, scoped by row-level security — so unlike the
 * backend's service-role key it can live in source. There's no env-var
 * mechanism for the native build (see api.ts), so this mirrors that: hardcode
 * here, override via VITE_SUPABASE_* for the web build in supabase.web.ts.
 */
export const SUPABASE_URL = 'https://oentempxgyqksveskvle.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9wKaV9LW1Qb4e2L9El1R2w_UIeOpmSX';
