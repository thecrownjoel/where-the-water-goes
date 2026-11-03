// Decides what gauge data is on screen and labels it honestly:
//   live     → fetched from USGS this session
//   cached   → previous fetch from local cache (fetch failed, or too soon to refetch)
//   archived → bundled historical snapshot; used for demo mode or when nothing else exists
//
// The provider never mixes modes inside one snapshot and never fabricates readings.

import type { CacheStore } from './cache.ts';
import { fetchJson, type FetchDeps, type FetchPolicy, DEFAULT_POLICY } from './fetcher.ts';
import { LAYERS, type LayerSpec } from './layers.ts';
import type { GaugeSnapshot } from './types.ts';
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

  const url = latestUrl(layer.codes);
  try {
    const body = await fetchJson(url, opts.policy ?? DEFAULT_POLICY, opts.fetchDeps, signal);
    const retrievedAt = new Date(now()).toISOString();
    const parsed = parseLatest(body, { now: now(), codes: layer.codes, maxAgeHours: layer.maxAgeHours });
    if (parsed.readings.length === 0) throw new Error('response contained no current readings');
    const snapshot: GaugeSnapshot = {
      layer: layer.id,
      readings: parsed.readings,
      provenance: { sourceId: 'usgs-latest-continuous', retrievedAt, requestUrl: url },
      mode: 'live',
      observedRange: observedRange(parsed.readings),
      stats: parsed.stats,
    };
    await opts.cache.put(layer.cacheKey, snapshot, now()).catch(() => undefined);
    return { snapshot, notice: parsed.truncated ? `${layer.title}: USGS returned more pages than requested; showing first page only.` : null };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (usableCache) {
      return { snapshot: { ...usableCache.value, mode: 'cached', layer: layer.id }, notice: `${layer.title}: USGS unavailable (${reason}); showing cached data.` };
    }
    if (!layer.archiveFallbackWhenLive) {
      return { snapshot: null, notice: `${layer.title}: USGS unavailable (${reason}); layer hidden.` };
    }
    return {
      snapshot: { ...(await opts.loadArchived(layer)), layer: layer.id },
      notice: `${layer.title}: USGS unavailable (${reason}) and no recent cache; showing archived snapshot.`,
    };
  }
}

/** Discharge layer (the primary layer, which always has something to show). */
export async function loadGauges(mode: 'auto' | 'demo', opts: ProviderOptions, signal?: AbortSignal) {
  const r = await loadLayer(LAYERS.discharge, mode, opts, signal);
  return r as LoadResult & { snapshot: GaugeSnapshot };
}
