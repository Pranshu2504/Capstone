/**
 * Base URL of the try-on API for the web (Vite) build.
 *
 * Try-on now lives inside the same service as the wardrobe API, so this
 * defaults to `VITE_API_URL` and a separate variable is no longer needed.
 * `VITE_AI_API_URL` remains as an override for running the two apart.
 */
const configured =
  (import.meta.env?.VITE_AI_API_URL as string | undefined) ??
  (import.meta.env?.VITE_API_URL as string | undefined);

export const AI_BASE_URL = (configured ?? 'http://localhost:4000').replace(/\/+$/, '');
