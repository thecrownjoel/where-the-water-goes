// USGS Water Data OGC API client: request building and strict response parsing.
// Field names below were confirmed against a live response on 2026-11-01 (and parameter_code,
// comma-separated parameter_code queries, and parameters 00045/62614/62615 on 2026-11-02):
//   properties.monitoring_location_id, parameter_code, time, value (string), unit_of_measure,
//   approval_status, qualifier (comma-separated string or null); geometry Point (CRS84).

import { USGS_LATEST_CONTINUOUS_URL } from './registry.ts';
import type { ApprovalStatus, GaugeReading, ParameterCode, ParseStats, Unit } from './types.ts';

export const LATEST_PROPERTIES = [
  'monitoring_location_id',
  'parameter_code',
  'time',
  'value',
  'unit_of_measure',
  'approval_status',
  'qualifier',
] as const;

export interface ParameterSpec {
  code: ParameterCode;
  /** Who publishes values of this kind. */
  agency: 'USGS' | 'CoCoRaHS';
  /** USGS parameter description, verbatim from the parameter-codes collection (2026-11-02; 72019 on 2026-11-22). */
  description: string;
  /** unit_of_measure strings accepted from the API for this parameter. */
  apiUnits: string[];
  unit: Unit;
  /** Physically impossible values are rejected, not clamped. */
  min?: number;
  max?: number;
}

export const PARAMETERS: Record<ParameterCode, ParameterSpec> = {
  '00060': { code: '00060', agency: 'USGS', description: 'Discharge, cubic feet per second', apiUnits: ['ft^3/s'], unit: 'ft3/s' },
  '00045': { code: '00045', agency: 'USGS', description: 'Precipitation, total, inches', apiUnits: ['in'], unit: 'in', min: 0 },
  '62614': { code: '62614', agency: 'USGS', description: 'Lake or reservoir water surface elevation above NGVD 1929, feet', apiUnits: ['ft'], unit: 'ft' },
  '62615': { code: '62615', agency: 'USGS', description: 'Lake or reservoir water surface elevation above NAVD 1988, feet', apiUnits: ['ft'], unit: 'ft' },
  // Negative depths are valid: the water level is above land surface (flowing/artesian wells).
  '72019': { code: '72019', agency: 'USGS', description: 'Depth to water level, feet below land surface', apiUnits: ['ft'], unit: 'ft' },
  // Not a USGS parameter; parsed by cocorahs.ts. 50 in is above the U.S. 24-hour record.
  'CCR-PRCP24': { code: 'CCR-PRCP24', agency: 'CoCoRaHS', description: 'Precipitation, 24-hour total, inches (CoCoRaHS volunteer report)', apiUnits: [], unit: 'in', min: 0, max: 50 },
};

/** Build the single request that returns the latest value of the given parameters at every site. */
export function latestUrl(codes: readonly ParameterCode[], limit = 50000): string {
  const params = new URLSearchParams({
    parameter_code: codes.join(','),
    f: 'json',
    limit: String(limit),
    properties: LATEST_PROPERTIES.join(','),
  });
  return `${USGS_LATEST_CONTINUOUS_URL}?${params.toString()}`;
}

export function latestDischargeUrl(limit = 50000): string {
  return latestUrl(['00060'], limit);
}

export interface ParseOptions {
  /** Reference "now" for staleness; defaults to the response timeStamp, then Date.now(). */
  now?: number;
  /** Readings older than this are dropped as not current. */
  maxAgeHours?: number;
  /** Parameters expected in this response (default: discharge only). */
  codes?: readonly ParameterCode[];
}

export interface ParseResult {
  readings: GaugeReading[];
  stats: ParseStats;
  /** Server timestamp of the response, if present. */
  serverTime: string | null;
  /** True if the response advertised a next page we did not follow. */
  truncated: boolean;
}

const ID_RE = /^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9._-]{1,40}$/;

function reject(stats: ParseStats, reason: string) {
  stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse a latest-continuous response. Never throws on bad records — they are counted and
 * dropped. Throws only if the envelope itself is not a FeatureCollection.
 * Values are taken exactly as published; nothing is interpolated or filled.
 */
export function parseLatest(body: unknown, opts: ParseOptions = {}): ParseResult {
  if (!isObject(body) || body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
    throw new Error('USGS response is not a GeoJSON FeatureCollection');
  }
  const codes = opts.codes ?? ['00060'];
  const serverTime = typeof body.timeStamp === 'string' ? body.timeStamp : null;
  const serverMs = serverTime ? Date.parse(serverTime) : NaN;
  const now = opts.now ?? (Number.isFinite(serverMs) ? serverMs : Date.now());
  const maxAgeMs = (opts.maxAgeHours ?? 48) * 3600_000;
  const stats: ParseStats = { received: body.features.length, accepted: 0, rejected: {} };
  const byKey = new Map<string, GaugeReading>();

  for (const f of body.features as unknown[]) {
    if (!isObject(f) || !isObject(f.properties)) { reject(stats, 'malformed feature'); continue; }
    const p = f.properties;
    // Older saved responses omit parameter_code; that is only unambiguous for a single-code request.
    const pc = p.parameter_code ?? (codes.length === 1 ? codes[0] : undefined);
    if (typeof pc !== 'string' || !codes.includes(pc as ParameterCode) || PARAMETERS[pc as ParameterCode]?.agency !== 'USGS') { reject(stats, 'unexpected parameter'); continue; }
    const spec = PARAMETERS[pc as ParameterCode];
    const g = f.geometry;
    if (!isObject(g) || g.type !== 'Point' || !Array.isArray(g.coordinates)) { reject(stats, 'missing location'); continue; }
    const [lon, lat] = g.coordinates as unknown[];
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)
      || lon < -180 || lon > 180 || lat < -90 || lat > 90) { reject(stats, 'invalid coordinates'); continue; }
    const id = p.monitoring_location_id;
    if (typeof id !== 'string' || !ID_RE.test(id)) { reject(stats, 'invalid site id'); continue; }
    if (typeof p.unit_of_measure !== 'string' || !spec.apiUnits.includes(p.unit_of_measure)) { reject(stats, 'unexpected unit'); continue; }
    const raw = p.value;
    if (typeof raw !== 'string' && typeof raw !== 'number') { reject(stats, 'missing value'); continue; }
    const value = typeof raw === 'number' ? raw : raw.trim() === '' ? NaN : Number(raw);
    if (!Number.isFinite(value)) { reject(stats, 'non-numeric value'); continue; }
    if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) { reject(stats, 'physically impossible value'); continue; }
    if (typeof p.time !== 'string') { reject(stats, 'missing time'); continue; }
    const t = Date.parse(p.time);
    if (!Number.isFinite(t)) { reject(stats, 'invalid time'); continue; }
    if (t > now + 3600_000) { reject(stats, 'time in future'); continue; }
    if (now - t > maxAgeMs) { reject(stats, 'stale (not current)'); continue; }

    const qualifiers = typeof p.qualifier === 'string' && p.qualifier.trim()
      ? p.qualifier.split(',').map((q) => q.trim().toUpperCase()).filter(Boolean)
      : [];
    const approval: ApprovalStatus =
      p.approval_status === 'Provisional' || p.approval_status === 'Approved' ? p.approval_status : 'Unknown';
    const reading: GaugeReading = {
      id,
      lon,
      lat,
      param: spec.code,
      value,
      unit: spec.unit,
      observedAt: new Date(t).toISOString(),
      approval,
      qualifiers,
      kind: qualifiers.includes('ESTIMATED') ? 'estimate' : 'observation',
    };
    // A site can expose more than one time series of a parameter; keep the most recent.
    const key = `${id} ${spec.code}`;
    const prev = byKey.get(key);
    if (prev) {
      reject(stats, 'duplicate site (older series dropped)');
      if (Date.parse(prev.observedAt) >= t) continue;
    }
    byKey.set(key, reading);
  }

  const readings = [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id) || a.param.localeCompare(b.param));
  stats.accepted = readings.length;
  const links = Array.isArray(body.links) ? body.links : [];
  const truncated = links.some((l) => isObject(l) && l.rel === 'next');
  return { readings, stats, serverTime, truncated };
}

/** Discharge-only parser (kept for callers and tests that predate multi-parameter layers). */
export function parseLatestDischarge(body: unknown, opts: Omit<ParseOptions, 'codes'> = {}): ParseResult {
  return parseLatest(body, { ...opts, codes: ['00060'] });
}

export function observedRange(readings: GaugeReading[]): [string, string] | null {
  if (!readings.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const r of readings) {
    const t = Date.parse(r.observedAt);
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return [new Date(lo).toISOString(), new Date(hi).toISOString()];
}

/**
 * Public USGS page for a monitoring location (for "view source" links).
 * Verify before implementation: waterdata.usgs.gov blocks automated requests, so this URL
 * pattern (agency-prefixed id) could not be confirmed programmatically on 2026-11-01.
 */
export function siteUrl(id: string): string {
  return `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(id)}/`;
}
