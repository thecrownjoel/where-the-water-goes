import { describe, it, expect } from 'vitest';
import { loadGauges, loadLayer, CACHE_KEY, MIN_REFETCH_MS, MAX_CACHE_AGE_MS } from '../src/data/provider.ts';
import { LAYERS } from '../src/data/layers.ts';
import { MemoryCache, purgeExpired } from '../src/data/cache.ts';
import type { GaugeSnapshot } from '../src/data/types.ts';

const NOW = Date.parse('2026-11-01T23:47:00Z');
const archived: GaugeSnapshot = {
  readings: [], mode: 'archived', observedRange: null,
  provenance: { sourceId: 'usgs-latest-continuous', retrievedAt: '2026-01-01T00:00:00Z', requestUrl: 'x' },
  stats: { received: 0, accepted: 0, rejected: {} },
};
const body = {
  type: 'FeatureCollection', links: [], timeStamp: '2026-11-01T23:47:00Z',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-77, 39] }, properties: {
    monitoring_location_id: 'USGS-01646500', time: '2026-11-01T23:00:00Z', value: '2210',
    unit_of_measure: 'ft^3/s', approval_status: 'Provisional', qualifier: null } }],
};
const ok = (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
const policy = { timeoutMs: 100, retries: 0, baseDelayMs: 1, maxBytes: 1e6 };
const opts = (cache: MemoryCache, fetch: typeof globalThis.fetch) => ({
  cache, loadArchived: async () => archived, fetchDeps: { fetch, sleep: async () => {} }, policy, now: () => NOW,
});

describe('loadGauges', () => {
  it('demo mode always shows the archived snapshot', async () => {
    const r = await loadGauges('demo', opts(new MemoryCache(), ok));
    expect(r.snapshot.mode).toBe('archived');
  });

  it('fetches live data, labels it live, records provenance and caches it', async () => {
    const cache = new MemoryCache();
    const r = await loadGauges('auto', opts(cache, ok));
    expect(r.snapshot.mode).toBe('live');
    expect(r.snapshot.readings).toHaveLength(1);
    expect(r.snapshot.provenance.retrievedAt).toBe(new Date(NOW).toISOString());
    expect(r.snapshot.provenance.requestUrl).toContain('parameter_code=00060');
    expect((await cache.get(CACHE_KEY))?.storedAt).toBe(NOW);
  });

  it('does not refetch within the polite interval; labels cached data as cached', async () => {
    const cache = new MemoryCache();
    await cache.put(CACHE_KEY, { ...archived, mode: 'live', readings: [{ id: 'USGS-1' }] }, NOW - MIN_REFETCH_MS / 2);
    let called = false;
    const spy = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    const r = await loadGauges('auto', opts(cache, spy));
    expect(called).toBe(false);
    expect(r.snapshot.mode).toBe('cached');
  });

  it('falls back to recent cache when USGS is down', async () => {
    const cache = new MemoryCache();
    await cache.put(CACHE_KEY, { ...archived, mode: 'live' }, NOW - 3 * MIN_REFETCH_MS);
    const r = await loadGauges('auto', opts(cache, down));
    expect(r.snapshot.mode).toBe('cached');
    expect(r.notice).toMatch(/cached/);
  });

  it('falls back to the archived snapshot when down and cache is too old', async () => {
    const cache = new MemoryCache();
    await cache.put(CACHE_KEY, { ...archived, mode: 'live' }, NOW - MAX_CACHE_AGE_MS - 1);
    const r = await loadGauges('auto', opts(cache, down));
    expect(r.snapshot.mode).toBe('archived');
    expect(r.notice).toMatch(/archived/);
  });

  it('treats a response with zero current readings as a failure, never as "no water"', async () => {
    const empty = (async () => new Response(JSON.stringify({ ...body, features: [] }))) as unknown as typeof fetch;
    const r = await loadGauges('auto', opts(new MemoryCache(), empty));
    expect(r.snapshot.mode).toBe('archived');
  });
});

describe('loadLayer (secondary layers)', () => {
  const rainBody = { ...body, features: [{ ...body.features[0], properties: {
    ...body.features[0].properties, parameter_code: '00045', unit_of_measure: 'in', value: '0.04' } }] };
  const rainOk = (async () => new Response(JSON.stringify(rainBody))) as unknown as typeof fetch;

  it('fetches rain live and caches it under its own key', async () => {
    const cache = new MemoryCache();
    const r = await loadLayer(LAYERS.precipitation, 'auto', opts(cache, rainOk));
    expect(r.snapshot?.mode).toBe('live');
    expect(r.snapshot?.layer).toBe('precipitation');
    expect(r.snapshot?.readings[0].unit).toBe('in');
    expect(await cache.get(LAYERS.precipitation.cacheKey)).toBeDefined();
    expect(await cache.get(CACHE_KEY)).toBeUndefined();
  });

  it('never shows archived rain in live mode: hides the layer instead', async () => {
    const r = await loadLayer(LAYERS.precipitation, 'auto', opts(new MemoryCache(), down));
    expect(r.snapshot).toBeNull();
    expect(r.notice).toMatch(/hidden/);
  });

  it('does not reuse rain cached more than 2 hours ago', async () => {
    const cache = new MemoryCache();
    await cache.put(LAYERS.precipitation.cacheKey, { ...archived, mode: 'live' }, NOW - 2.5 * 3600_000);
    const r = await loadLayer(LAYERS.precipitation, 'auto', opts(cache, down));
    expect(r.snapshot).toBeNull();
  });

  it('refetches rain after 30 minutes', async () => {
    const cache = new MemoryCache();
    await cache.put(LAYERS.precipitation.cacheKey, { ...archived, mode: 'live' }, NOW - 31 * 60_000);
    const r = await loadLayer(LAYERS.precipitation, 'auto', opts(cache, rainOk));
    expect(r.snapshot?.mode).toBe('live');
  });

  it('demo mode loads the layer\'s own archive', async () => {
    let asked = '';
    const o = { ...opts(new MemoryCache(), ok), loadArchived: async (l: { id: string }) => { asked = l.id; return archived; } };
    const r = await loadLayer(LAYERS['lake-level'], 'demo', o);
    expect(asked).toBe('lake-level');
    expect(r.snapshot?.mode).toBe('archived');
  });
});

describe('purgeExpired', () => {
  it('removes only expired entries', async () => {
    const c = new MemoryCache();
    await c.put('old', 1, 0);
    await c.put('new', 2, 1000);
    expect(await purgeExpired(c, 500, 1200)).toBe(1);
    expect(await c.keys()).toEqual(['new']);
  });
});

describe('CoCoRaHS layer', () => {
  const header = 'ObservationDate,ObservationTime,EntryDateTime,StationNumber,StationName,Latitude,Longitude,TotalPrecipAmt,NewSnowDepth,NewSnowSWE,TotalSnowDepth,TotalSnowSWE,DateTimeStamp';
  const row = (date: string, id: string, v: string) => `${date}, 13:00:00, ${date} 13:05:00, ${id}, Sample, 40.0, -105.0, ${v}, NA, NA, NA, NA, ${date} 13:05:00`;
  const at = Date.parse('2026-11-22T15:00:00Z');
  const bodies: Record<string, string> = {
    '11/22/2026': `${header}\n${row('2026-11-22', 'CO-LR-1', '0.20')}\n`,
    '11/21/2026': `${header}\n${row('2026-11-21', 'CO-LR-1', '0.90')}\n${row('2026-11-21', 'CO-LR-2', 'T')}\n`,
  };
  const urls: string[] = [];
  const csvFetch = (async (u: string) => {
    urls.push(u);
    return new Response(bodies[new URL(u).searchParams.get('Date')!] ?? header);
  }) as unknown as typeof fetch;

  it('fetches both report dates one at a time, keeps the newest report per station, and caches', async () => {
    const cache = new MemoryCache();
    const r = await loadLayer(LAYERS.cocorahs, 'auto', { ...opts(cache, csvFetch), now: () => at });
    expect(urls.map((u) => new URL(u).searchParams.get('Date'))).toEqual(['11/22/2026', '11/21/2026']);
    expect(r.snapshot?.mode).toBe('live');
    expect(r.snapshot?.provenance.sourceId).toBe('cocorahs-daily');
    expect(r.snapshot?.provenance.requestUrls).toHaveLength(2);
    expect(r.snapshot?.readings.map((x) => [x.id, x.value, x.qualifiers])).toEqual([['CO-LR-1', 0.2, []], ['CO-LR-2', 0, ['TRACE']]]);
    expect((await cache.get(LAYERS.cocorahs.cacheKey))?.storedAt).toBe(at);
  });

  it('does not refetch for 6 hours', async () => {
    const cache = new MemoryCache();
    await loadLayer(LAYERS.cocorahs, 'auto', { ...opts(cache, csvFetch), now: () => at });
    let called = false;
    const spy = (async () => { called = true; return new Response(header); }) as unknown as typeof fetch;
    const r = await loadLayer(LAYERS.cocorahs, 'auto', { ...opts(cache, spy), now: () => at + 5.9 * 3600_000 });
    expect(called).toBe(false);
    expect(r.snapshot?.mode).toBe('cached');
  });

  it('is hidden, never archived, when CoCoRaHS is down and nothing is cached', async () => {
    const r = await loadLayer(LAYERS.cocorahs, 'auto', { ...opts(new MemoryCache(), down), now: () => at });
    expect(r.snapshot).toBeNull();
    expect(r.notice).toContain('CoCoRaHS unavailable');
  });
});
