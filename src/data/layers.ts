// Point layers: each is one source request (or, for CoCoRaHS, one request per report date) with
// its own provenance, cache entry, staleness rule and fallback rule. Layers are never merged
// into one snapshot, so the UI can always say exactly where and when each set of values came from.
//
// None of these needs a constant connection. Each layer is fetched at most every `refetchMs`,
// cached locally (IndexedDB), and served from the cache in between, across restarts.

import type { LayerId, ParameterCode } from './types.ts';

export type { LayerId };

export interface LayerSpec {
  id: LayerId;
  /** Which client fetches and parses this layer. */
  source: 'usgs' | 'cocorahs';
  /** Publisher, for notices ("USGS unavailable"). */
  sourceName: 'USGS' | 'CoCoRaHS';
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
    source: 'usgs',
    sourceName: 'USGS',
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
    source: 'usgs',
    sourceName: 'USGS',
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
    source: 'usgs',
    sourceName: 'USGS',
    codes: ['62614', '62615'],
    title: 'USGS lake & reservoir levels',
    maxAgeHours: 48,
    maxCacheAgeMs: 7 * 24 * H,
    archiveFallbackWhenLive: false,
    archivePath: 'data/demo/usgs-lakes-snapshot.json',
    cacheKey: 'usgs-latest-lake-level',
    refetchMs: H,
  },
  groundwater: {
    id: 'groundwater',
    source: 'usgs',
    sourceName: 'USGS',
    codes: ['72019'],
    title: 'USGS groundwater wells',
    maxAgeHours: 48,
    maxCacheAgeMs: 7 * 24 * H,
    archiveFallbackWhenLive: false,
    archivePath: 'data/demo/usgs-groundwater-snapshot.json',
    cacheKey: 'usgs-latest-groundwater',
    // Water tables move slowly; every 3 hours is plenty (~240 KB gzipped per request).
    refetchMs: 3 * H,
  },
  cocorahs: {
    id: 'cocorahs',
    source: 'cocorahs',
    sourceName: 'CoCoRaHS',
    codes: ['CCR-PRCP24'],
    title: 'CoCoRaHS volunteer rain reports',
    // Each station reports once a day; its latest report can be up to ~36 h old by the time the
    // next morning's report arrives.
    maxAgeHours: 36,
    maxCacheAgeMs: 36 * H,
    // A non-profit's server: reports arrive once a day, so a 6-hour refetch catches each
    // morning's reports without repeated requests. At most 4 fetches a day per computer.
    refetchMs: 6 * H,
    archiveFallbackWhenLive: false,
    archivePath: 'data/demo/cocorahs-snapshot.json',
    cacheKey: 'cocorahs-daily',
  },
};

export const LAYER_IDS = Object.keys(LAYERS) as LayerId[];

/** Layers drawn on top of the primary streamflow layer. */
export type SecondaryLayerId = Exclude<LayerId, 'discharge'>;
export const SECONDARY_LAYER_IDS = LAYER_IDS.filter((id): id is SecondaryLayerId => id !== 'discharge');
