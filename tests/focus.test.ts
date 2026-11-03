import { describe, it, expect } from 'vitest';
import { rainFocus } from '../src/viz/focus.ts';
import type { GaugeReading } from '../src/data/types.ts';

const rain = (lon: number, lat: number, value: number, param: GaugeReading['param'] = '00045'): GaugeReading => ({
  id: `USGS-${lon}${lat}`, lon, lat, param, value, unit: 'in', observedAt: '2026-11-02T19:00:00Z',
  approval: 'Provisional', qualifiers: [], kind: 'observation',
});

describe('rainFocus', () => {
  it('finds the busiest cluster of wet gauges', () => {
    const f = rainFocus([
      rain(-93.1, 45.1, 0.02), rain(-93.5, 45.4, 0.05), rain(-92.8, 44.9, 0.01),
      rain(-80, 35, 0.3), rain(-80.2, 35.2, 0.1),
    ]);
    expect(f?.count).toBe(3);
    expect(f?.lat).toBeCloseTo(45.13, 1);
    expect(f?.lon).toBeCloseTo(-93.13, 1);
  });

  it('ignores dry gauges and other parameters', () => {
    const f = rainFocus([rain(-93, 45, 0), rain(-93, 45, 0), rain(-93, 45, 0), rain(-93, 45, 500, '00060')]);
    expect(f).toBeNull();
  });

  it('needs at least minGauges wet gauges in one place', () => {
    expect(rainFocus([rain(-93, 45, 0.1), rain(-93.2, 45, 0.1)])).toBeNull();
    expect(rainFocus([rain(-93, 45, 0.1), rain(-93.2, 45, 0.1)], 2)?.count).toBe(2);
  });
});
