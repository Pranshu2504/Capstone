import { API_BASE_URL } from '@/config/api';

// Set by AuthContext whenever the Supabase session changes. A plain module
// closure avoids a circular import between api/client.ts and context/AuthContext.tsx.
let authTokenGetter: () => string | null = () => null;
export function setAuthTokenGetter(fn: () => string | null): void {
  authTokenGetter = fn;
}
/** Read the current session token — for callers that build their own request. */
export function getAuthToken(): string | null {
  return authTokenGetter();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The API sleeps when idle and takes ~25s to wake.
 *
 * Render's free tier spins a service down after about fifteen minutes of
 * inactivity. The first request afterwards hangs until the container boots,
 * and the browser aborts it long before that — which surfaces as a bare
 * "Failed to fetch" with nothing to act on. Retrying rides out the wake-up
 * instead of reporting the app as broken.
 */
const COLD_START_RETRIES = 2;
const COLD_START_BACKOFF_MS = 4000;

/** Warms the API so the next real request does not pay the wake-up cost. */
export function warmUpApi(): void {
  void fetch(`${API_BASE_URL}/health`).catch(() => {
    /* Best effort — the retry below covers a failure here. */
  });
}

/** Thin typed fetch wrapper around the ZORA backend. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const token = getAuthToken();

  const send = () =>
    fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

  let response: Response;
  let lastCause: unknown;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await send();
      break;
    } catch (cause) {
      lastCause = cause;
      // Only a network-level failure retries. A 4xx is an answer, not a nap.
      if (attempt >= COLD_START_RETRIES) {
        throw new ApiError(
          0,
          'Could not reach ZORA. The server may be waking up — try again in a moment.',
          lastCause,
        );
      }
      await sleep(COLD_START_BACKOFF_MS * (attempt + 1));
    }
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message, (payload as { details?: unknown } | null)?.details);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export { API_BASE_URL };
