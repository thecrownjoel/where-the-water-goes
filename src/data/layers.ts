// Gauge layers: each is one USGS latest-continuous request with its own provenance, cache
// entry, staleness rule and fallback rule. Layers are never merged into one snapshot, so the
// UI can always say exactly where and when each set of values came from.

import type { ParameterCode } from './types.ts';

export type LayerId = 'discharge' | 'precipitation' | 'lake-level';

export interface LayerSpec {
  id: LayerId;
  codes: readonly ParameterCode[];
  /** Short label for the status line, e.g. "USGS streamflow". */
  title: string;
  /** Readings older than this are dropped as not current. */
  maxAgeHours: number;
  /** A cached snapshot older than this is never shown. */
  maxCacheAgeMs: number;
  /**
   * In live ("auto") mode, may a failed fetch fall back to the bundled archived snapshot?
   * True only where an old snapshot cannot be mistaken for current conditions at a glance.
   * Archived rain is never shown in live mode: an old storm drawn on today's globe would mislead.
   */
  archiveFallbackWhenLive: boolean;
  /** Bundled archived snapshot (relative to the app base URL). */
  archivePath: string;
  cacheKey: string;
  /** Minimum time between network fetches for this layer. */
  refetchMs: number;
}

const H = 3600_000;

export const LAYERS: Record<LayerId, LayerSpec> = {
  discharge: {
    id: 'discharge',
    codes: ['00060'],
    title: 'USGS streamflow',
    maxAgeHours: 48,
    maxCacheAgeMs: 7 * 24 * H,
    archiveFallbackWhenLive: true,
    archivePath: 'data/demo/usgs-snapshot.json',
    cacheKey: 'usgs-latest-discharge',
    refetchMs: H,
  },
  precipitation: {
    id: 'precipitation',
    codes: ['00045'],
    title: 'USGS rain gauges',
    // "Raining now" must mean now: a precipitation value more than 2 hours old is not shown,
    // and the layer is refetched every 30 minutes rather than hourly.
    maxAgeHours: 2,
    maxCacheAgeMs: 2 * H,
    refetchMs: H / 2,
    archiveFallbackWhenLive: false,
    archivePath: 'data/demo/usgs-precip-snapshot.json',
    cacheKey: 'usgs-latest-precipitation',
  },
  'lake-level': {
    id: 'lake-level',
    codes: ['62614', '62615'],
    title: 'USGS lake & reservoir levels',
    maxAgeHours: 48,
    maxCacheAgeMs: 7 * 24 * H,
    archiveFallbackWhenLive: false,
    archivePath: 'data/demo/usgs-lakes-snapshot.json',
    cacheKey: 'usgs-latest-lake-level',
    refetchMs: H,
  },
};

export const LAYER_IDS = Object.keys(LAYERS) as LayerId[];
