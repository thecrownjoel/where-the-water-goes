// Decides what gauge data is on screen and labels it honestly:
//   live     → fetched from the source this session
//   cached   → previous fetch from local cache (fetch failed, or too soon to refetch)
//   archived → bundled historical snapshot; used for demo mode or when nothing else exists
//
// The provider never mixes modes inside one snapshot and never fabricates readings.

import type { CacheStore } from './cache.ts';
import { cocorahsUrl, parseCocorahs, reportDates } from './cocorahs.ts';
import { fetchJson, fetchText, type FetchDeps, type FetchPolicy, DEFAULT_POLICY } from './fetcher.ts';
import { LAYERS, type LayerSpec } from './layers.ts';
import type { GaugeSnapshot, ParseStats, GaugeReading } from './types.ts';
import { latestUrl, observedRange, parseLatest } from './usgs.ts';

export const CACHE_KEY = LAYERS.discharge.cacheKey;
/** Minimum time between network fetches, to be polite to USGS. */
export const MIN_REFETCH_MS = LAYERS.discharge.refetchMs;
/** A cached discharge snapshot older than this is not shown (observations would be stale). */
export const MAX_CACHE_AGE_MS = LAYERS.discharge.maxCacheAgeMs;

export interface ProviderOptions {
  cache: CacheStore;
  loadArchived: (layer: LayerSpec) => Promise<GaugeSnapshot>;
  fetchDeps?: FetchDeps;
  policy?: FetchPolicy;
  now?: () => number;
}

export interface LoadResult {
  /** null when the layer has nothing honest to show (e.g. rain with no current data). */
  snapshot: GaugeSnapshot | null;
  /** Human-readable reason when we could not show live data. */
  notice: string | null;
}

interface Fetched { readings: GaugeReading[]; stats: ParseStats; urls: string[]; sourceId: string; truncated: boolean }

async function fetchReadings(layer: LayerSpec, now: number, policy: FetchPolicy, deps: FetchDeps | undefined, signal?: AbortSignal): Promise<Fetched> {
  if (layer.source === 'cocorahs') {
    const urls = reportDates(now).map(cocorahsUrl);
    const bodies: string[] = [];
    // One date at a time: there is no hurry, and it halves the peak load on CoCoRaHS's server.
    for (const url of urls) bodies.push(await fetchText(url, policy, deps, signal));
    const parsed = parseCocorahs(bodies, { now, maxAgeHours: layer.maxAgeHours });
    return { ...parsed, urls, sourceId: 'cocorahs-daily', truncated: false };
  }
  const url = latestUrl(layer.codes);
  const body = await fetchJson(url, policy, deps, signal);
  const parsed = parseLatest(body, { now, codes: layer.codes, maxAgeHours: layer.maxAgeHours });
  return { readings: parsed.readings, stats: parsed.stats, urls: [url], sourceId: 'usgs-latest-continuous', truncated: parsed.truncated };
}

/**
 * Fetch a layer from its source now, with no cache involved. Throws when the source fails or
 * returns no current readings. Used by loadLayer and by the archived-snapshot builder.
 */
export async function fetchLayerSnapshot(
  layer: LayerSpec,
  now: number,
  policy: FetchPolicy = DEFAULT_POLICY,
  deps?: FetchDeps,
  signal?: AbortSignal,
): Promise<{ snapshot: GaugeSnapshot; truncated: boolean }> {
  const f = await fetchReadings(layer, now, policy, deps, signal);
  if (f.readings.length === 0) throw new Error('response contained no current readings');
  return {
    truncated: f.truncated,
    snapshot: {
      layer: layer.id,
      readings: f.readings,
      provenance: {
        sourceId: f.sourceId,
        retrievedAt: new Date(now).toISOString(),
        requestUrl: f.urls[0],
        ...(f.urls.length > 1 ? { requestUrls: f.urls } : {}),
      },
      mode: 'live',
      observedRange: observedRange(f.readings),
      stats: f.stats,
    },
  };
}

export async function loadLayer(
  layer: LayerSpec,
  mode: 'auto' | 'demo',
  opts: ProviderOptions,
  signal?: AbortSignal,
): Promise<LoadResult> {
  const now = opts.now ?? Date.now;
  if (mode === 'demo') {
    return { snapshot: { ...(await opts.loadArchived(layer)), layer: layer.id }, notice: null };
  }

  const cached = await opts.cache.get<GaugeSnapshot>(layer.cacheKey).catch(() => undefined);
  const cacheAge = cached ? now() - cached.storedAt : Infinity;
  const usableCache = cached && cacheAge < layer.maxCacheAgeMs ? cached : undefined;
  if (usableCache && cacheAge < layer.refetchMs) {
    return { snapshot: { ...usableCache.value, mode: 'cached', layer: layer.id }, notice: null };
  }

  const src = layer.sourceName;
  try {
    const { snapshot, truncated } = await fetchLayerSnapshot(layer, now(), opts.policy ?? DEFAULT_POLICY, opts.fetchDeps, signal);
    await opts.cache.put(layer.cacheKey, snapshot, now()).catch(() => undefined);
    return { snapshot, notice: truncated ? `${layer.title}: ${src} returned more pages than requested; showing first page only.` : null };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (usableCache) {
      return { snapshot: { ...usableCache.value, mode: 'cached', layer: layer.id }, notice: `${layer.title}: ${src} unavailable (${reason}); showing cached data.` };
    }
    if (!layer.archiveFallbackWhenLive) {
      return { snapshot: null, notice: `${layer.title}: ${src} unavailable (${reason}); layer hidden.` };
    }
    return {
      snapshot: { ...(await opts.loadArchived(layer)), layer: layer.id },
      notice: `${layer.title}: ${src} unavailable (${reason}) and no recent cache; showing archived snapshot.`,
    };
  }
}

/** Discharge layer (the primary layer, which always has something to show). */
export async function loadGauges(mode: 'auto' | 'demo', opts: ProviderOptions, signal?: AbortSignal) {
  const r = await loadLayer(LAYERS.discharge, mode, opts, signal);
  return r as LoadResult & { snapshot: GaugeSnapshot };
}
