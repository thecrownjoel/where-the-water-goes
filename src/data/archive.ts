// Compact on-disk format for the bundled archived snapshots (demo mode).
// Round-trips GaugeSnapshot exactly; mode is always forced to 'archived' on load.
//   /1  discharge only, 7-column rows
//   /2  any parameter, 8th column is the parameter code
//   /3  as /2, plus a 9th column with the station name ("" when the source has none)

import { PARAMETERS } from './usgs.ts';
import type { ApprovalStatus, GaugeReading, GaugeSnapshot, ParameterCode } from './types.ts';

type Row = [string, number, number, number, number, 'P' | 'A' | 'U', string, ParameterCode?, string?];

export interface ArchivedSnapshotFile {
  format: 'wtrshd-gauge-snapshot/1' | 'wtrshd-gauge-snapshot/2' | 'wtrshd-gauge-snapshot/3';
  note: string;
  layer?: GaugeSnapshot['layer'];
  provenance: GaugeSnapshot['provenance'];
  observedRange: GaugeSnapshot['observedRange'];
  stats: GaugeSnapshot['stats'];
  /** [id, lon, lat, value, observedAt (unix seconds), approval (P|A|U), qualifiers ("A,B" or ""), parameter code (/2+), name (/3)] */
  readings: Row[];
}

const APPROVAL_CODE: Record<ApprovalStatus, 'P' | 'A' | 'U'> = { Provisional: 'P', Approved: 'A', Unknown: 'U' };
const APPROVAL_FROM: Record<string, ApprovalStatus> = { P: 'Provisional', A: 'Approved', U: 'Unknown' };

const NOTES: Record<string, string> = {
  'cocorahs-daily': 'Archived snapshot of CoCoRaHS volunteer precipitation reports. Historical — not live data. © Colorado Climate Center, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); station locations rounded to 0.01°.',
};

export function encodeSnapshot(s: GaugeSnapshot): ArchivedSnapshotFile {
  return {
    format: 'wtrshd-gauge-snapshot/3',
    note: NOTES[s.provenance.sourceId] ?? 'Archived snapshot of USGS provisional/approved observations. Historical — not live data.',
    layer: s.layer,
    provenance: s.provenance,
    observedRange: s.observedRange,
    stats: s.stats,
    readings: s.readings.map((r) => [
      r.id,
      Math.round(r.lon * 1e5) / 1e5,
      Math.round(r.lat * 1e5) / 1e5,
      r.value,
      Math.round(Date.parse(r.observedAt) / 1000),
      APPROVAL_CODE[r.approval],
      r.qualifiers.join(','),
      r.param,
      r.name ?? '',
    ]),
  };
}

export function decodeSnapshot(f: unknown): GaugeSnapshot {
  const file = f as ArchivedSnapshotFile;
  const version = { 'wtrshd-gauge-snapshot/1': 1, 'wtrshd-gauge-snapshot/2': 2, 'wtrshd-gauge-snapshot/3': 3 }[file?.format as string];
  if (!file || !version || !Array.isArray(file.readings)) {
    throw new Error('not a wtrshd gauge snapshot');
  }
  const readings: GaugeReading[] = [];
  for (const row of file.readings) {
    if (!Array.isArray(row) || row.length !== version + 6) continue;
    const [id, lon, lat, value, t, a, q] = row;
    const spec = PARAMETERS[(version >= 2 ? row[7] : '00060') as ParameterCode];
    if (!spec) continue;
    if (typeof id !== 'string' || ![lon, lat, value, t].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    const qualifiers = typeof q === 'string' && q ? q.split(',') : [];
    const name = version >= 3 && typeof row[8] === 'string' && row[8] ? row[8] : undefined;
    readings.push({
      id, ...(name ? { name } : {}), lon, lat, param: spec.code, value, unit: spec.unit,
      observedAt: new Date(t * 1000).toISOString(),
      approval: APPROVAL_FROM[a] ?? 'Unknown',
      qualifiers,
      kind: qualifiers.includes('ESTIMATED') ? 'estimate' : 'observation',
    });
  }
  return {
    layer: file.layer ?? 'discharge',
    readings,
    provenance: file.provenance,
    mode: 'archived',
    observedRange: file.observedRange,
    stats: file.stats,
  };
}
