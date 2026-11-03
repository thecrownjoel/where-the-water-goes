import { describe, it, expect } from 'vitest';
import { simplifyLine, quantize, dequantize, makeElevationSampler, orientDownstream, orientNetwork } from '../src/geo/geometry.mjs';

describe('simplifyLine / quantize', () => {
  it('drops collinear points and keeps endpoints', () => {
    expect(simplifyLine([[0, 0], [1, 0.0001], [2, 0], [3, 5]], 0.01)).toEqual([[0, 0], [2, 0], [3, 5]]);
  });
  it('quantize round-trips to 1e-3 and removes duplicates', () => {
    const q = quantize([[1.23456, -7.89012], [1.2349, -7.8901], [2, 3]]);
    expect(q).toEqual([1235, -7890, 2000, 3000]);
    expect(dequantize(q)).toEqual([[1.235, -7.89], [2, 3]]);
  });
});

describe('makeElevationSampler', () => {
  // 4x3 grid, cell 90 deg: rows lat 90,0,-90; cols lon -180,-90,0,90
  const data = new Int16Array([0, 0, 0, 0, 10, 20, 30, 40, 0, 0, 0, 0]);
  const s = makeElevationSampler(data, 4, 3, 90);
  it('samples grid nodes exactly and interpolates', () => {
    expect(s(-90, 0)).toBe(20);
    expect(s(-135, 0)).toBe(15);
    expect(s(0, 45)).toBe(15);
  });
  it('wraps longitude across the antimeridian', () => {
    expect(s(135, 0)).toBe(25); // between 90E (40) and 180E (= -180, 10)
  });
});

// Elevation that decreases eastward: z = -lon * 100
const tilt = (lon: number) => -lon * 100;

describe('orientDownstream', () => {
  it('reverses a line drawn uphill', () => {
    const r = orientDownstream([[3, 0], [2, 0], [1, 0]], tilt);
    expect(r.reversed).toBe(true);
    expect(r.line[0]).toEqual([1, 0]);
  });
  it('reports flat lines as ambiguous', () => {
    expect(orientDownstream([[0, 0], [1, 0]], () => 50).ambiguous).toBe(true);
  });
});

describe('orientNetwork', () => {
  // A Y-shaped network: two tributaries join a main stem that reaches the sea (elev <= 0).
  // Tributary B is drawn backwards and joins at an interior vertex of the main stem, with a
  // small gap (as in real data).
  const elev = (lon: number, lat: number) => (lon >= 10 ? -10 : 1000 - lon * 90 + Math.abs(lat) * 10);
  const main = [[0, 0], [5, 0], [10, 0]];
  const tribA = [[0, 5], [2, 2], [5, 0]];
  const tribB = [[5.002, 0.001], [3, -2], [1, -5]]; // drawn mouth-first
  const out = orientNetwork([main, tribA, tribB], elev, { tolDeg: 0.005 });
  const ends = (src: number) => out.filter((o) => o.src === src).map((o) => [o.line[0], o.line[o.line.length - 1]]);

  it('orients every edge toward the coastal outlet', () => {
    for (const o of out) expect(o.method).toBe('network');
    // main stem split at the confluence; both pieces flow east
    for (const [a, b] of ends(0)) expect(b[0]).toBeGreaterThan(a[0]);
    expect(ends(1)[0][1]).toEqual([5, 0]);
    expect(ends(2)[0][1]).toEqual([5.002, 0.001]); // reversed so it ends at the confluence
  });

  it('gives continuous flow coordinates across the confluence', () => {
    const downstreamOfJunction = out.find((o) => o.src === 0 && o.line[0][0] === 5)!;
    const tribAEdge = out.find((o) => o.src === 1)!;
    // Tributary's upstream distance = its own length + distance from the confluence to the sea.
    const lenA = Math.hypot(2, 3) + Math.hypot(3, 2);
    expect(tribAEdge.d0).toBeCloseTo(lenA + downstreamOfJunction.d0, 2);
  });

  it('falls back to the lowest node for basins with no coastal outlet', () => {
    const inland = (lon: number) => 2000 - lon * 10;
    const r = orientNetwork([[[0, 0], [1, 0]], [[1, 0], [2, 0]]], inland);
    expect(r.every((o) => o.method === 'sink')).toBe(true);
    expect(r.every((o) => o.line[o.line.length - 1][0] > o.line[0][0])).toBe(true);
  });
});
