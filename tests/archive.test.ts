import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { encodeSnapshot, decodeSnapshot } from '../src/data/archive.ts';
import type { GaugeSnapshot } from '../src/data/types.ts';

const snap: GaugeSnapshot = {
  readings: [
    { id: 'USGS-01646500', lon: -77.12766, lat: 38.94977, param: '00060', value: 2210, unit: 'ft3/s', observedAt: '2026-11-01T23:00:00.000Z', approval: 'Provisional', qualifiers: [], kind: 'observation' },
    { id: 'USGS-1', lon: -100, lat: 45, param: '00060', value: -3.5, unit: 'ft3/s', observedAt: '2026-11-01T22:45:00.000Z', approval: 'Approved', qualifiers: ['ICE', 'ESTIMATED'], kind: 'estimate' },
  ],
  provenance: { sourceId: 'usgs-latest-continuous', retrievedAt: '2026-11-01T23:47:17.000Z', requestUrl: 'u' },
  mode: 'live',
  observedRange: ['2026-11-01T22:45:00.000Z', '2026-11-01T23:00:00.000Z'],
  stats: { received: 3, accepted: 2, rejected: { stale: 1 } },
};

describe('archived snapshot codec', () => {
  it('round-trips readings and always decodes as archived', () => {
    const d = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(snap))));
    expect(d.mode).toBe('archived');
    expect(d.readings).toEqual(snap.readings);
    expect(d.provenance).toEqual(snap.provenance);
  });

  it('rejects files of the wrong format and skips bad rows', () => {
    expect(() => decodeSnapshot({ format: 'other' })).toThrow();
    const f = encodeSnapshot(snap) as unknown as { readings: unknown[] };
    f.readings.push(['x', 'bad'], null);
    expect(decodeSnapshot(f).readings).toHaveLength(2);
  });

  it('round-trips other parameters with their units (format /2)', () => {
    const lake: GaugeSnapshot = { ...snap, layer: 'lake-level', readings: [
      { ...snap.readings[0], param: '62615', unit: 'ft', value: 612.34 },
      { ...snap.readings[1], param: '62614', unit: 'ft', value: 1020.1 },
    ] };
    const d = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(lake))));
    expect(d.layer).toBe('lake-level');
    expect(d.readings).toEqual(lake.readings);
  });

  it('still reads format /1 files as discharge', () => {
    const v1 = encodeSnapshot(snap) as unknown as { format: string; readings: unknown[][] };
    v1.format = 'wtrshd-gauge-snapshot/1';
    v1.readings = v1.readings.map((r) => r.slice(0, 7));
    const d = decodeSnapshot(v1);
    expect(d.layer).toBe('discharge');
    expect(d.readings).toEqual(snap.readings);
  });

  it('skips rows with an unknown parameter code', () => {
    const f = encodeSnapshot(snap) as unknown as { readings: unknown[][] };
    f.readings[0][7] = '99999';
    expect(decodeSnapshot(f).readings).toHaveLength(1);
  });

  it.each([
    ['public/data/demo/usgs-precip-snapshot.json', 'precipitation', '00045'],
    ['public/data/demo/usgs-lakes-snapshot.json', 'lake-level', '62615'],
  ])('bundled %s is valid, archived, and of the right layer', (path, layer, someCode) => {
    const d = decodeSnapshot(JSON.parse(fs.readFileSync(path, 'utf8')));
    expect(d.mode).toBe('archived');
    expect(d.layer).toBe(layer);
    expect(d.readings.length).toBeGreaterThan(100);
    expect(d.readings.some((r) => r.param === someCode)).toBe(true);
  });

  it('the bundled demo snapshot is valid and labelled archived', () => {
    const d = decodeSnapshot(JSON.parse(fs.readFileSync('public/data/demo/usgs-snapshot.json', 'utf8')));
    expect(d.mode).toBe('archived');
    expect(d.readings.length).toBeGreaterThan(1000);
    expect(d.provenance.sourceId).toBe('usgs-latest-continuous');
  });
});

describe('format /3', () => {
  it('round-trips station names and CoCoRaHS traces, with the CC BY note', () => {
    const snap: GaugeSnapshot = {
      layer: 'cocorahs',
      readings: [{ id: 'CO-LR-9005', name: 'Sample Town 1.2 N', lon: -105.08, lat: 40.59, param: 'CCR-PRCP24', value: 0, unit: 'in', observedAt: '2026-11-21T13:00:00.000Z', approval: 'Unknown', qualifiers: ['TRACE'], kind: 'observation' }],
      provenance: { sourceId: 'cocorahs-daily', retrievedAt: '2026-11-22T08:30:00.000Z', requestUrl: 'u1', requestUrls: ['u1', 'u2'] },
      mode: 'live', observedRange: ['2026-11-21T13:00:00.000Z', '2026-11-21T13:00:00.000Z'], stats: { received: 1, accepted: 1, rejected: {} },
    };
    const file = encodeSnapshot(snap);
    expect(file.format).toBe('wtrshd-gauge-snapshot/3');
    expect(file.note).toContain('CC BY 4.0');
    const back = decodeSnapshot(JSON.parse(JSON.stringify(file)));
    expect(back.mode).toBe('archived');
    expect(back.layer).toBe('cocorahs');
    expect(back.readings[0]).toEqual(snap.readings[0]);
    expect(back.provenance.requestUrls).toEqual(['u1', 'u2']);
  });
});
