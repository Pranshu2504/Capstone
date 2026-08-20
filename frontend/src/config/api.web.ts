/**
 * API base URL for the web (Vite) build.
 *
 * `VITE_API_URL` is baked in at build time — set it in Vercel to the Render
 * service URL. Falls back to the local backend for `npm run web`.
 */
const configured = import.meta.env?.VITE_API_URL as string | undefined;

export const API_BASE_URL = (configured ?? 'http://localhost:4000').replace(/\/+$/, '');
