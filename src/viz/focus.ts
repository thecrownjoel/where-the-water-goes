// Data-driven tour stops. Pure functions so they can be tested without WebGL.

import type { GaugeReading } from '../data/types.ts';

export interface Focus { lat: number; lon: number; count: number }

/**
 * Where are the most gauges currently recording rain? Bins wet gauges into cells of `cellDeg`
 * degrees, takes the busiest cell, and returns the centroid of wet gauges within `cellDeg` of
 * that cell's centre. Returns null if no cell has at least `minGauges` wet gauges — one wet
 * gauge is not worth a camera flight and could be a faulty sensor.
 */
export function rainFocus(readings: GaugeReading[], minGauges = 3, cellDeg = 4): Focus | null {
  const wet = readings.filter((r) => r.param === '00045' && r.value > 0);
  const cells = new Map<string, { n: number; lat: number; lon: number }>();
  for (const r of wet) {
    const i = Math.floor(r.lat / cellDeg), j = Math.floor(r.lon / cellDeg);
    const key = `${i},${j}`;
    const c = cells.get(key) ?? { n: 0, lat: (i + 0.5) * cellDeg, lon: (j + 0.5) * cellDeg };
    c.n++;
    cells.set(key, c);
  }
  let best: { n: number; lat: number; lon: number } | null = null;
  for (const c of cells.values()) if (!best || c.n > best.n) best = c;
  if (!best || best.n < minGauges) return null;
  const near = wet.filter((r) => Math.abs(r.lat - best.lat) <= cellDeg && Math.abs(r.lon - best.lon) <= cellDeg);
  const lat = near.reduce((s, r) => s + r.lat, 0) / near.length;
  const lon = near.reduce((s, r) => s + r.lon, 0) / near.length;
  return { lat, lon, count: near.length };
}
