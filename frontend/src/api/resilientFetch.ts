/**
 * fetch() that survives the API being asleep.
 *
 * The backend runs on a free instance that suspends after ~15 minutes idle.
 * Waking it takes ~25s and occasionally longer, during which a request either
 * hangs or fails outright. Left alone that surfaces as "Failed to fetch",
 * which is both alarming and useless — the server is fine, it is just
 * getting out of bed.
 *
 * Two things make that survivable:
 *
 *   - a per-attempt timeout, so a hung socket is abandoned rather than
 *     waited on until the platform's own timeout, which can exceed a minute;
 *   - several attempts spread over a budget longer than a cold start, so the
 *     wake-up finishes inside the retry window instead of after it.
 *
 * Only transport failures retry. An HTTP response — including a 500 — is an
 * answer, and repeating a request the server already handled risks doing the
 * work twice.
 */

export interface ResilientFetchOptions {
  /** Abandon a single attempt after this long. */
  attemptTimeoutMs?: number;
  /** Keep retrying until this much time has passed in total. */
  totalBudgetMs?: number;
  /** Called before each retry, for UI that wants to explain the wait. */
  onRetry?: (elapsedMs: number) => void;
}

const DEFAULTS = {
  // Comfortably past a warm response, well short of a cold start, so a truly
  // dead socket is abandoned quickly and retried rather than sat on.
  attemptTimeoutMs: 20_000,
  /*
   * A budget rather than a fixed number of attempts, because the two failure
   * modes take wildly different amounts of time. A booting server that hangs
   * burns the full per-attempt timeout; one that refuses the connection fails
   * instantly. Counting attempts means the refusing case gives up in seconds
   * — which is exactly the case a cold start produces.
   */
  totalBudgetMs: 75_000,
};

const BACKOFF_MS = [1_000, 2_000, 4_000, 6_000, 8_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Thrown once every attempt has failed at the transport level. */
export class NetworkUnreachableError extends Error {
  constructor(public readonly cause: unknown) {
    super('Could not reach ZORA. The server may be waking up — give it a moment.');
    this.name = 'NetworkUnreachableError';
  }
}

/**
 * `build` is a factory rather than a plain RequestInit so each attempt gets a
 * fresh body: a FormData handed to a fetch that failed mid-flight has been
 * read, and re-sending the same object is not reliably supported.
 */
export async function resilientFetch(
  url: string,
  build: () => RequestInit | Promise<RequestInit>,
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULTS.attemptTimeoutMs;
  const totalBudgetMs = options.totalBudgetMs ?? DEFAULTS.totalBudgetMs;

  const startedAt = Date.now();
  let lastCause: unknown;
  let attempt = 0;

  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);

    try {
      const init = await build();
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (cause) {
      lastCause = cause;
    } finally {
      clearTimeout(timer);
    }

    const elapsed = Date.now() - startedAt;
    const backoff = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    if (elapsed + backoff >= totalBudgetMs) break;

    options.onRetry?.(elapsed);
    await sleep(backoff);
    attempt += 1;
  }

  throw new NetworkUnreachableError(lastCause);
}

/**
 * Polls /health until the API answers, so the first thing a person does is
 * not the request that pays for the wake-up.
 *
 * Resolves false rather than throwing when the budget runs out — the app is
 * still usable, every request retries on its own, and blocking the UI on a
 * server that may simply be slow would be worse than letting them through.
 */
export async function waitForApi(baseUrl: string, budgetMs = 75_000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return true;
    } catch {
      // Still asleep; fall through to the wait below.
    }
    await sleep(3_000);
  }

  return false;
}
