import { describe, it, expect } from 'vitest';
import { subsolarPoint } from '../src/viz/coords.ts';
import { unwrapLon } from '../src/viz/Director.ts';
import { sanitize, DEFAULTS } from '../src/ui/settings.ts';
import { escapeHtml, formatDischarge, formatValue, utc } from '../src/ui/format.ts';
import { rainSize } from '../src/viz/Gauges.ts';
import { SOURCES } from '../src/data/registry.ts';

describe('subsolarPoint', () => {
  it('is near the Tropic of Cancer at the June solstice', () => {
    expect(subsolarPoint(new Date('2026-06-21T12:00:00Z')).lat).toBeCloseTo(23.44, 0);
  });
  it('is near the equator and the prime meridian at the March equinox, ~12:07 UTC', () => {
    const p = subsolarPoint(new Date('2026-03-20T12:07:00Z'));
    expect(Math.abs(p.lat)).toBeLessThan(0.5);
    expect(Math.abs(p.lon)).toBeLessThan(2);
  });
});

describe('unwrapLon', () => {
  it('takes the short way across the antimeridian', () => {
    expect(unwrapLon(170, -170)).toBe(190);
    expect(unwrapLon(-170, 170)).toBe(-190);
    expect(unwrapLon(-97, -91)).toBe(-91);
  });
});

describe('settings', () => {
  it('sanitizes untrusted stored values', () => {
    expect(sanitize(null)).toEqual(DEFAULTS);
    const s = sanitize({ intensity: 99, fpsCap: 144, lighting: 'night', dataMode: 'evil', showGauges: 'yes' });
    expect(s.intensity).toBe(1);
    expect(s.fpsCap).toBe(DEFAULTS.fpsCap);
    expect(s.lighting).toBe('night');
    expect(s.dataMode).toBe('auto');
    expect(s.showGauges).toBe(true);
  });
});

describe('format', () => {
  it('escapes HTML', () => expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;'));
  it('formats discharge without inventing precision', () => {
    expect(formatDischarge(316000)).toBe('316,000 ft³/s');
    expect(formatDischarge(17)).toBe('17 ft³/s');
    expect(formatDischarge(0.42)).toBe('0.42 ft³/s');
  });
  it('labels times as UTC', () => expect(utc('2026-11-01T23:05:00Z')).toBe('2026-11-01 23:05 UTC'));
});

describe('registry', () => {
  it('every source has terms, attribution and at least one doc link', () => {
    for (const s of SOURCES) {
      expect(s.terms.length).toBeGreaterThan(0);
      expect(s.attribution.length).toBeGreaterThan(0);
      expect(s.docs.length).toBeGreaterThan(0);
      for (const d of s.docs) expect(d).toMatch(/^https:\/\//);
    }
  });
  it('no source claims agency endorsement', () => {
    expect(JSON.stringify(SOURCES)).not.toMatch(/endorsed by|official partner|in partnership with/i);
  });
});

describe('formatValue', () => {
  it('states the unit and, for elevations, the datum', () => {
    expect(formatValue({ param: '00045', value: 0.04 })).toBe('0.04 in');
    expect(formatValue({ param: '62614', value: 1020.1 })).toBe('1,020.10 ft (NGVD 29)');
    expect(formatValue({ param: '62615', value: 612.345 })).toBe('612.35 ft (NAVD 88)');
    expect(formatValue({ param: '00060', value: 2210 })).toBe('2,210 ft³/s');
  });
});

describe('rainSize', () => {
  it('grows monotonically with rainfall and never below the base size', () => {
    expect(rainSize(0)).toBeCloseTo(0.009);
    expect(rainSize(0.01)).toBeLessThan(rainSize(0.1));
    expect(rainSize(-1)).toBe(rainSize(0));
  });
});
