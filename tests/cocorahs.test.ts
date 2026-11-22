// CoCoRaHS parser. The fixture copies the real export's header and row format verbatim
// (checked 2026-11-22) but uses made-up stations and coordinates, so no volunteer's real
// location is stored in this repository.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cocorahsUrl, hasPrecip, parseCocorahs, reportDates, splitCsvLine } from '../src/data/cocorahs.ts';

const csv = fs.readFileSync(new URL('./fixtures/cocorahs-sample.csv', import.meta.url), 'utf8');
const now = Date.parse('2026-11-22T08:30:00Z');

describe('parseCocorahs', () => {
  const { readings, stats } = parseCocorahs([csv], { now, maxAgeHours: 36 });
  const byId = Object.fromEntries(readings.map((r) => [r.id, r]));

  it('keeps standard stations with values, including dry reports and traces', () => {
    expect(Object.keys(byId).sort()).toEqual(['BHS-NP-9004', 'CO-LR-9005', 'MN-HN-9001', 'TN-RD-9003', 'TX-BXR-9002']);
    expect(byId['CO-LR-9005']).toMatchObject({ value: 0.42, unit: 'in', param: 'CCR-PRCP24', name: 'Sample Town 1.2 N', kind: 'observation', approval: 'Unknown' });
    expect(byId['TX-BXR-9002'].value).toBe(0);
    expect(byId['MN-HN-9001']).toMatchObject({ value: 0, qualifiers: ['TRACE'] });
  });

  it('reads observation times as UTC, including reports that cross midnight UTC', () => {
    expect(byId['CO-LR-9005'].observedAt).toBe('2026-11-21T13:00:00.000Z');
    expect(byId['TN-RD-9003'].observedAt).toBe('2026-11-22T00:00:00.000Z');
  });

  it('rounds every location to 0.01 degrees', () => {
    for (const r of readings) {
      expect(Math.abs(r.lat * 100 - Math.round(r.lat * 100))).toBeLessThan(1e-6);
      expect(Math.abs(r.lon * 100 - Math.round(r.lon * 100))).toBeLessThan(1e-6);
    }
    expect(byId['CO-LR-9005'].lat).toBeCloseTo(40.59, 6);
    expect(byId['CO-LR-9005'].lon).toBeCloseTo(-105.08, 6);
  });

  it('counts every dropped row by reason', () => {
    expect(stats.received).toBe(9);
    expect(stats.accepted).toBe(5);
    expect(stats.rejected).toEqual({
      'missing value': 1,
      'partner-network station (terms not stated)': 1,
      'physically impossible value': 1,
      'older than the latest report window': 1,
    });
  });

  it('keeps the newest report when two dates overlap', () => {
    const later = csv.split('\n')[0] + '\n2026-11-22, 13:00:00, 2026-11-22 13:05:00, CO-LR-9005, Sample Town 1.2 N, 40.5853217, -105.0844223, 0.05, 0.0, NA, NA, NA, 2026-11-22 13:05:10\n';
    const r = parseCocorahs([later, csv], { now: Date.parse('2026-11-22T15:00:00Z'), maxAgeHours: 36 });
    expect(r.readings.find((x) => x.id === 'CO-LR-9005')?.value).toBe(0.05);
    expect(r.stats.rejected['superseded by a newer report']).toBe(1);
  });

  it('treats a header-only day as empty, and a non-CSV body as an error', () => {
    expect(parseCocorahs([csv.split('\n')[0]], { now, maxAgeHours: 36 }).readings).toEqual([]);
    expect(() => parseCocorahs(['<html>error</html>'], { now, maxAgeHours: 36 })).toThrow('not the expected CSV');
    expect(() => parseCocorahs([''], { now, maxAgeHours: 36 })).toThrow('empty');
  });
});

describe('request building', () => {
  it('asks for one local report date with UTC times', () => {
    const u = new URL(cocorahsUrl(new Date(Date.UTC(2026, 10, 2))));
    expect(u.origin + u.pathname).toBe('https://data.cocorahs.org/export/exportreports.aspx');
    expect(Object.fromEntries(u.searchParams)).toEqual({ ReportType: 'Daily', dtf: '3', TimesInGMT: 'True', Format: 'CSV', ReportDateType: 'reportdate', Date: '11/02/2026' });
  });
  it('covers today and yesterday as dated on the U.S. East Coast', () => {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    expect(reportDates(Date.parse('2026-11-22T08:30:00Z')).map(iso)).toEqual(['2026-11-22', '2026-11-21']);
    expect(reportDates(Date.parse('2026-11-22T03:00:00Z')).map(iso)).toEqual(['2026-11-21', '2026-11-20']);
  });
});

describe('helpers', () => {
  it('splits quoted CSV fields', () => {
    expect(splitCsvLine('a, "b, c" ,"d ""e"""')).toEqual(['a', 'b, c', 'd "e"']);
  });
  it('counts traces as precipitation but not zeros', () => {
    expect(hasPrecip({ value: 0, qualifiers: ['TRACE'] })).toBe(true);
    expect(hasPrecip({ value: 0, qualifiers: [] })).toBe(false);
    expect(hasPrecip({ value: 0.01, qualifiers: [] })).toBe(true);
  });
});
