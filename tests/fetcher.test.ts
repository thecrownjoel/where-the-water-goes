import { describe, it, expect } from 'vitest';
import { fetchJson, parseRetryAfter, FetchError, type FetchPolicy } from '../src/data/fetcher.ts';

const policy: FetchPolicy = { timeoutMs: 1000, retries: 2, baseDelayMs: 10, maxBytes: 1000 };

function fakeFetch(responses: (() => Response | Promise<Response>)[]) {
  let i = 0;
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const r = responses[Math.min(i++, responses.length - 1)];
    return r();
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('fetchJson', () => {
  it('retries 503 then succeeds', async () => {
    const sleeps: number[] = [];
    const f = fakeFetch([() => new Response('', { status: 503 }), () => new Response('{"ok":1}')]);
    const r = await fetchJson('u', policy, { fetch: f.fn, sleep: async (ms) => void sleeps.push(ms) });
    expect(r).toEqual({ ok: 1 });
    expect(f.calls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
  });

  it('honours Retry-After on 429', async () => {
    const sleeps: number[] = [];
    const f = fakeFetch([() => new Response('', { status: 429, headers: { 'retry-after': '7' } }), () => new Response('[]')]);
    await fetchJson('u', policy, { fetch: f.fn, sleep: async (ms) => void sleeps.push(ms) });
    expect(sleeps[0]).toBe(7000);
  });

  it('fails fast on 404', async () => {
    const f = fakeFetch([() => new Response('', { status: 404 })]);
    await expect(fetchJson('u', policy, { fetch: f.fn, sleep: async () => {} })).rejects.toMatchObject({ status: 404 });
    expect(f.calls).toHaveLength(1);
  });

  it('gives up after the retry budget', async () => {
    const f = fakeFetch([() => new Response('', { status: 500 })]);
    await expect(fetchJson('u', policy, { fetch: f.fn, sleep: async () => {} })).rejects.toBeInstanceOf(FetchError);
    expect(f.calls).toHaveLength(3);
  });

  it('rejects malformed JSON and oversized bodies without retrying', async () => {
    const bad = fakeFetch([() => new Response('<html>')]);
    await expect(fetchJson('u', policy, { fetch: bad.fn, sleep: async () => {} })).rejects.toThrow('malformed JSON');
    expect(bad.calls).toHaveLength(1);
    const big = fakeFetch([() => new Response('x'.repeat(2000))]);
    await expect(fetchJson('u', policy, { fetch: big.fn, sleep: async () => {} })).rejects.toThrow('too large');
  });

  it('retries network errors', async () => {
    const f = fakeFetch([() => { throw new TypeError('offline'); }, () => new Response('1')]);
    expect(await fetchJson('u', policy, { fetch: f.fn, sleep: async () => {} })).toBe(1);
  });
});

describe('parseRetryAfter', () => {
  it('parses seconds and HTTP dates', () => {
    expect(parseRetryAfter('120')).toBe(120_000);
    const now = Date.parse('2026-11-01T00:00:00Z');
    expect(parseRetryAfter('Sun, 01 Nov 2026 00:01:00 GMT', now)).toBe(60_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});
