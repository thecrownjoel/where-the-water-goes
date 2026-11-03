// Core data types. Every value shown on screen carries its provenance and its kind, so the
// UI can never present a model output or estimate as if it were a measurement.

/**
 * What a value *is*. These are rendered differently and labelled differently.
 * - observation:   a measurement published by an agency (may still be provisional)
 * - estimate:      an agency-published value the agency itself flags as estimated
 * - model:         output of an agency model (e.g. NOAA National Water Model) — guidance, not measurement
 * - experimental:  anything computed by this project or its volunteers — never official
 */
export type DataKind = 'observation' | 'estimate' | 'model' | 'experimental';

/** How the snapshot currently on screen was obtained. */
export type SnapshotMode =
  | 'live' //     fetched from the official source during this session
  | 'cached' //   loaded from local cache after a failed or skipped fetch
  | 'archived'; // bundled historical snapshot (demo mode). Never presented as current.

export type ApprovalStatus = 'Provisional' | 'Approved' | 'Unknown';

export interface Provenance {
  /** Key into the data-source registry. */
  sourceId: string;
  /** When this client (or the snapshot builder) received the data. ISO 8601 UTC. */
  retrievedAt: string;
  /** Exact request URL, for reproducibility. */
  requestUrl: string;
}

/** USGS parameter codes this app understands (see PARAMETERS in usgs.ts). */
export type ParameterCode = '00060' | '00045' | '62614' | '62615';

/** Units as normalised by this app (USGS spells ft^3/s and ft3/s variously). */
export type Unit = 'ft3/s' | 'in' | 'ft';

export interface GaugeReading {
  /** Agency monitoring location id, e.g. "USGS-01646500". */
  id: string;
  lon: number;
  lat: number;
  /** USGS parameter code of this value. */
  param: ParameterCode;
  /** Value exactly as published (not converted, not smoothed). */
  value: number;
  unit: Unit;
  /** Observation time from the agency. ISO 8601 UTC. */
  observedAt: string;
  approval: ApprovalStatus;
  /** Agency qualifier codes, e.g. ["ICE"], ["ESTIMATED"]. */
  qualifiers: string[];
  kind: Extract<DataKind, 'observation' | 'estimate'>;
}

export interface ParseStats {
  received: number;
  accepted: number;
  /** Count of rejected records by reason. Shown in the About panel for transparency. */
  rejected: Record<string, number>;
}

export interface GaugeSnapshot {
  /** Which layer this snapshot belongs to (absent in files written before layers existed). */
  layer?: 'discharge' | 'precipitation' | 'lake-level';
  readings: GaugeReading[];
  provenance: Provenance;
  mode: SnapshotMode;
  /** Earliest and latest observation time among accepted readings, or null if empty. */
  observedRange: [string, string] | null;
  stats: ParseStats;
}
