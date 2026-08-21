/**
 * Supabase project config for the web (Vite) build.
 *
 * `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are baked in at build time —
 * set them in Vercel to override. Falls back to the same project as the
 * native build (supabase.ts) so `npm run web` works out of the box. The
 * anon/publishable key is safe to ship in a client bundle — it's the public
 * half of the pair, scoped by row-level security.
 */
export const SUPABASE_URL =
  (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? 'https://oentempxgyqksveskvle.supabase.co';
export const SUPABASE_ANON_KEY =
  (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_9wKaV9LW1Qb4e2L9El1R2w_UIeOpmSX';
