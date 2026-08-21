/**
 * Base URL of the AI try-on service for the web (Vite) build.
 *
 * `VITE_AI_API_URL` is baked in at build time — point it at the deployed
 * try-on service. Falls back to the local one for `npm run web`.
 */
const configured = import.meta.env?.VITE_AI_API_URL as string | undefined;

export const AI_BASE_URL = (configured ?? 'http://localhost:4001').replace(/\/+$/, '');
