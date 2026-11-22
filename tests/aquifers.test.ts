import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AquiferIndex, type AquiferFile } from '../src/geo/aquifers.ts';

describe('AquiferIndex', () => {
  // A 10°×10° square with a 2°×2° hole, quantized at q=1000.
  const sq = (x0: number, y0: number, s: number) => [x0, y0, x0 + s, y0, x0 + s, y0 + s, x0, y0 + s].map((v) => v * 1000);
  const file: AquiferFile = { q: 1000, rockTypes: { 400: 'Carbonate-rock aquifers' }, aquifers: [{ c: 1, n: 'Test aquifer', r: 400, p: [[sq(-100, 30, 10), sq(-96, 34, 2)]] }] };
  const idx = new AquiferIndex(file);

  it('finds points inside and honours holes (even–odd)', () => {
    expect(idx.at(-99, 31)).toEqual({ code: 1, name: 'Test aquifer', rockType: 400, rockName: 'Carbonate-rock aquifers' });
    expect(idx.at(-95, 35)).toBeNull();
    expect(idx.at(-80, 31)).toBeNull();
  });

  it('names real aquifers from the bundled USGS map', () => {
    const real = new AquiferIndex(JSON.parse(fs.readFileSync(new URL('../public/data/base/aquifers.json', import.meta.url), 'utf8')));
    expect(real.aquiferCount).toBeGreaterThan(50);
    expect(real.at(-101, 39)?.name).toBe('High Plains aquifer');
    expect(real.at(-119.79, 36.74)?.name).toBe('Central Valley aquifer system');
    expect(real.at(-87.63, 41.88)?.rockName).toBe('Carbonate-rock aquifers');
    expect(real.at(-60, 30)).toBeNull(); // Atlantic Ocean
  });
});
