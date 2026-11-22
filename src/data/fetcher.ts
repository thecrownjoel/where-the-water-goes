// Polite HTTP fetching: timeouts, bounded retries with backoff, Retry-After on 429/503,
// response size limits. Pure functions over an injectable fetch so it is testable.

export interface FetchPolicy {
  timeoutMs: number;
  retries: number;
  baseDelayMs: number;
  /** Hard cap on response size; protects against runaway or hostile responses. */
  maxBytes: number;
}

export const DEFAULT_POLICY: FetchPolicy = {
  timeoutMs: 30_000,
  retries: 2,
  baseDelayMs: 2_000,
  maxBytes: 40 * 1024 * 1024,
};

export class FetchError extends Error {
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  constructor(message: string, status: number | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Parse an HTTP Retry-After header (seconds or HTTP date). */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const t = Date.parse(value);
  return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new FetchError('aborted')); }, { once: true });
  });

export interface FetchDeps {
  fetch: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Fetch JSON with retries. 4xx (except 408/429) fail fast; 429/5xx/network errors retry. */
export async function fetchJson(
  url: string,
  policy: FetchPolicy = DEFAULT_POLICY,
  deps: FetchDeps = { fetch: globalThis.fetch.bind(globalThis) },
  signal?: AbortSignal,
): Promise<unknown> {
  const text = await fetchText(url, policy, deps, signal, 'application/geo+json, application/json');
  try {
    return JSON.parse(text);
  } catch {
    throw new FetchError('malformed JSON');
  }
}

/** Fetch a text body (CSV, JSON…) with the same retry, timeout and size rules as fetchJson. */
export async function fetchText(
  url: string,
  policy: FetchPolicy = DEFAULT_POLICY,
  deps: FetchDeps = { fetch: globalThis.fetch.bind(globalThis) },
  signal?: AbortSignal,
  accept = 'text/csv, text/plain, */*',
): Promise<string> {
  const wait = deps.sleep ?? sleep;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0) {
      const retryAfter = lastErr instanceof FetchError ? lastErr.retryAfterMs : null;
      const backoff = policy.baseDelayMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
      // Honour Retry-After, but never wait more than 10 minutes inside one fetch.
      await wait(Math.min(retryAfter ?? backoff, 600_000), signal);
    }
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), policy.timeoutMs);
    try {
      const res = await deps.fetch(url, { signal: ctrl.signal, headers: { Accept: accept } });
      if (!res.ok) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        const err = new FetchError(`HTTP ${res.status}`, res.status, retryAfter);
        const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
        if (!retryable) throw err;
        lastErr = err;
        continue;
      }
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > policy.maxBytes) throw new FetchError('response too large');
      const text = await res.text();
      if (text.length > policy.maxBytes) throw new FetchError('response too large');
      return text;
    } catch (e) {
      if (signal?.aborted) throw new FetchError('aborted');
      if (e instanceof FetchError && e.status !== null && !(e.status === 408 || e.status === 429 || e.status >= 500)) throw e;
      if (e instanceof FetchError && e.message === 'response too large') throw e;
      lastErr = e instanceof FetchError ? e : new FetchError(e instanceof Error ? e.message : 'network error');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new FetchError('fetch failed');
}
