import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { latestDischargeUrl, latestUrl, parseLatest, parseLatestDischarge, observedRange } from '../src/data/usgs.ts';

const sample = JSON.parse(fs.readFileSync('tests/fixtures/usgs-latest-sample.json', 'utf8'));
const NOW = Date.parse('2026-11-01T23:47:17Z');

function feature(props: Record<string, unknown>, coords: unknown = [-77, 39]) {
  return {
    type: 'Feature',
    id: 'x',
    geometry: { type: 'Point', coordinates: coords },
    properties: {
      monitoring_location_id: 'USGS-01646500',
      time: '2026-11-01T23:00:00+00:00',
      value: '2210',
      unit_of_measure: 'ft^3/s',
      approval_status: 'Provisional',
      qualifier: null,
      ...props,
    },
  };
}
const fc = (features: unknown[], extra: Record<string, unknown> = {}) => ({ type: 'FeatureCollection', features, links: [], ...extra });

describe('latestDischargeUrl', () => {
  it('requests discharge (00060) as JSON with only the needed properties', () => {
    const u = new URL(latestDischargeUrl());
    expect(u.origin + u.pathname).toBe('https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items');
    expect(u.searchParams.get('parameter_code')).toBe('00060');
    expect(u.searchParams.get('f')).toBe('json');
    expect(u.searchParams.get('properties')).toContain('approval_status');
  });
});

describe('parseLatestDischarge', () => {
  it('parses real USGS records and drops stale discontinued sites', () => {
    const r = parseLatestDischarge(sample, { now: NOW });
    expect(r.stats.received).toBe(sample.features.length);
    expect(r.readings.length).toBeGreaterThan(0);
    expect(r.stats.rejected['stale (not current)']).toBeGreaterThan(0);
    for (const g of r.readings) {
      expect(NOW - Date.parse(g.observedAt)).toBeLessThanOrEqual(48 * 3600_000);
      expect(Number.isFinite(g.value)).toBe(true);
    }
    expect(r.stats.accepted + Object.values(r.stats.rejected).reduce((a, b) => a + b, 0)).toBe(r.stats.received);
  });

  it('keeps values exactly as published, including negative tidal discharge', () => {
    const r = parseLatestDischarge(fc([feature({ value: '-1530' })]), { now: NOW });
    expect(r.readings[0].value).toBe(-1530);
  });

  it('marks ESTIMATED qualifiers as estimates, not observations', () => {
    const r = parseLatestDischarge(fc([feature({ qualifier: 'ICE,ESTIMATED' })]), { now: NOW });
    expect(r.readings[0].kind).toBe('estimate');
    expect(r.readings[0].qualifiers).toEqual(['ICE', 'ESTIMATED']);
  });

  it('rejects malformed records without throwing', () => {
    const r = parseLatestDischarge(fc([
      feature({ value: '' }),
      feature({ value: 'abc' }),
      feature({ value: null }),
      feature({ unit_of_measure: 'm^3/s' }),
      feature({ monitoring_location_id: '<script>' }),
      feature({ time: 'yesterday' }),
      feature({ time: '2026-11-03T00:00:00Z' }),
      feature({}, [500, 0]),
      feature({}, null),
      { nope: true },
      null,
    ]), { now: NOW });
    expect(r.readings).toHaveLength(0);
    expect(r.stats.rejected).toMatchObject({
      'missing value': 1,
      'non-numeric value': 2,
      'unexpected unit': 1,
      'invalid site id': 1,
      'invalid time': 1,
      'time in future': 1,
      'invalid coordinates': 1,
      'missing location': 1,
      'malformed feature': 2,
    });
  });

  it('keeps the most recent series when a site appears twice', () => {
    const r = parseLatestDischarge(fc([
      feature({ time: '2026-11-01T20:00:00Z', value: '1' }),
      feature({ time: '2026-11-01T23:00:00Z', value: '2' }),
      feature({ time: '2026-11-01T21:00:00Z', value: '3' }),
    ]), { now: NOW });
    expect(r.readings).toHaveLength(1);
    expect(r.readings[0].value).toBe(2);
  });

  it('throws only when the envelope is not a FeatureCollection', () => {
    expect(() => parseLatestDischarge({ type: 'Feature' })).toThrow();
    expect(() => parseLatestDischarge('<html>')).toThrow();
  });

  it('reports truncation when a next page exists', () => {
    const r = parseLatestDischarge(fc([feature({})], { links: [{ rel: 'next', href: 'x' }] }), { now: NOW });
    expect(r.truncated).toBe(true);
  });

  it('computes the observed time range', () => {
    const r = parseLatestDischarge(fc([
      feature({ monitoring_location_id: 'USGS-1', time: '2026-11-01T20:00:00Z' }),
      feature({ monitoring_location_id: 'USGS-2', time: '2026-11-01T23:15:00Z' }),
    ]), { now: NOW });
    expect(observedRange(r.readings)).toEqual(['2026-11-01T20:00:00.000Z', '2026-11-01T23:15:00.000Z']);
    expect(observedRange([])).toBeNull();
  });
});

describe('multi-parameter parsing', () => {
  it('requests several parameters in one comma-separated query', () => {
    const u = new URL(latestUrl(['62614', '62615']));
    expect(u.searchParams.get('parameter_code')).toBe('62614,62615');
    expect(u.searchParams.get('properties')).toContain('parameter_code');
  });

  it('keeps per-parameter units and datums', () => {
    const r = parseLatest(fc([
      feature({ parameter_code: '62614', unit_of_measure: 'ft', value: '1020.10' }),
      feature({ parameter_code: '62615', unit_of_measure: 'ft', value: '1019.45', monitoring_location_id: 'USGS-2' }),
    ]), { now: NOW, codes: ['62614', '62615'] });
    expect(r.readings.map((x) => [x.param, x.unit, x.value])).toEqual([['62614', 'ft', 1020.1], ['62615', 'ft', 1019.45]]);
  });

  it('rejects a parameter that was not requested, and a missing code when several were', () => {
    const r = parseLatest(fc([
      feature({ parameter_code: '00060' }),
      feature({ unit_of_measure: 'ft' }),
    ]), { now: NOW, codes: ['62614', '62615'] });
    expect(r.readings).toHaveLength(0);
    expect(r.stats.rejected['unexpected parameter']).toBe(2);
  });

  it('rejects the wrong unit for a parameter', () => {
    const r = parseLatest(fc([feature({ parameter_code: '00045', unit_of_measure: 'mm', value: '1' })]), { now: NOW, codes: ['00045'] });
    expect(r.stats.rejected['unexpected unit']).toBe(1);
  });

  it('rejects negative precipitation instead of clamping it', () => {
    const r = parseLatest(fc([
      feature({ parameter_code: '00045', unit_of_measure: 'in', value: '-0.01' }),
      feature({ parameter_code: '00045', unit_of_measure: 'in', value: '0.00', monitoring_location_id: 'USGS-2' }),
    ]), { now: NOW, codes: ['00045'] });
    expect(r.readings.map((x) => x.value)).toEqual([0]);
    expect(r.stats.rejected['physically impossible value']).toBe(1);
  });

  it('applies the layer staleness limit', () => {
    const r = parseLatest(fc([feature({ parameter_code: '00045', unit_of_measure: 'in', value: '0.1', time: '2026-11-01T20:00:00Z' })]),
      { now: NOW, codes: ['00045'], maxAgeHours: 2 });
    expect(r.stats.rejected['stale (not current)']).toBe(1);
  });

  it('accepts cooperator agency codes containing digits (e.g. MO005-…)', () => {
    const r = parseLatest(fc([feature({ monitoring_location_id: 'MO005-394156092030201' })]), { now: NOW });
    expect(r.readings).toHaveLength(1);
  });

  it('keeps both datums when one site reports both', () => {
    const r = parseLatest(fc([
      feature({ parameter_code: '62614', unit_of_measure: 'ft', value: '10' }),
      feature({ parameter_code: '62615', unit_of_measure: 'ft', value: '9' }),
    ]), { now: NOW, codes: ['62614', '62615'] });
    expect(r.readings).toHaveLength(2);
  });
});

describe('groundwater (72019)', () => {
  const gw = (value: string, extra: Record<string, unknown> = {}) =>
    feature({ monitoring_location_id: 'USGS-372535076581305', parameter_code: '72019', unit_of_measure: 'ft', value, ...extra });
  it('keeps depth to water as published, including water above land surface', () => {
    const r = parseLatest(fc([gw('31.98'), gw('-4.2', { monitoring_location_id: 'USGS-400000100000001' })]), { now: NOW, codes: ['72019'] });
    expect(r.readings.map((x) => [x.param, x.value, x.unit])).toEqual([['72019', 31.98, 'ft'], ['72019', -4.2, 'ft']]);
  });
  it('never accepts a CoCoRaHS code from a USGS response', () => {
    const r = parseLatest(fc([feature({ parameter_code: 'CCR-PRCP24', unit_of_measure: 'in', value: '1' })]), { now: NOW, codes: ['CCR-PRCP24'] });
    expect(r.readings).toHaveLength(0);
    expect(r.stats.rejected['unexpected parameter']).toBe(1);
  });
});
