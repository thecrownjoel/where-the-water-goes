// Principal aquifers of the United States (USGS, 2003), bundled by scripts/build-aquifers.mjs.
// Pure data helpers: no DOM, no three.js.
//
// The source is a national map at 1:2,500,000. It shows where each principal aquifer is the
// uppermost one, in broad strokes; it cannot say what lies under a particular address.

export interface AquiferFile {
  q: number;
  /** USGS ROCK_TYPE code → rock-type name, e.g. 400 → "Carbonate-rock aquifers". */
  rockTypes: Record<string, string>;
  /** p: polygons; each polygon is a list of rings (quantized [lon, lat, lon, lat, …]), even–odd fill. */
  aquifers: { c: number; n: string; r: number; p: number[][][] }[];
}

export interface AquiferHit {
  code: number;
  name: string;
  rockType: number;
  rockName: string;
}

/** Extent of the texture the globe draws aquifers into (covers CONUS, Hawaii, PR, USVI). */
export const AQUIFER_EXTENT = { west: -161, east: -64, south: 17, north: 50 } as const;

/** Colors per USGS rock type (linear-ish RGB 0..1). Earth tones: this is geology, not water. */
export const ROCK_COLORS: Record<number, [number, number, number]> = {
  100: [0.86, 0.74, 0.36], // unconsolidated sand and gravel
  200: [0.86, 0.55, 0.28], // semiconsolidated sand
  300: [0.74, 0.34, 0.26], // sandstone
  400: [0.42, 0.68, 0.40], // carbonate rock
  500: [0.50, 0.60, 0.74], // sandstone and carbonate rock
  600: [0.70, 0.45, 0.56], // igneous and metamorphic rock
};

export const rockCss = (rock: number) => {
  const c = ROCK_COLORS[rock] ?? [0.6, 0.6, 0.6];
  return `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
};

interface Indexed { aquifer: AquiferFile['aquifers'][number]; rings: number[][]; box: [number, number, number, number] }

/** Point-in-polygon lookup over the bundled aquifers, with a bounding-box prefilter. */
export class AquiferIndex {
  private polys: Indexed[] = [];
  private readonly q: number;
  readonly file: AquiferFile;

  constructor(file: AquiferFile) {
    this.file = file;
    this.q = file.q;
    for (const aquifer of file.aquifers) {
      for (const rings of aquifer.p) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const ring of rings) {
          for (let i = 0; i + 1 < ring.length; i += 2) {
            x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]);
            y0 = Math.min(y0, ring[i + 1]); y1 = Math.max(y1, ring[i + 1]);
          }
        }
        this.polys.push({ aquifer, rings, box: [x0, y0, x1, y1] });
      }
    }
  }

  get aquiferCount() { return this.file.aquifers.length; }

  /** The principal aquifer at a point, or null (outside the map, or "other rocks"). */
  at(lon: number, lat: number): AquiferHit | null {
    const x = lon * this.q, y = lat * this.q;
    for (const p of this.polys) {
      const [x0, y0, x1, y1] = p.box;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      let inside = false;
      for (const ring of p.rings) {
        const n = ring.length;
        for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
          const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
      }
      if (inside) {
        const a = p.aquifer;
        return { code: a.c, name: a.n, rockType: a.r, rockName: this.file.rockTypes[a.r] ?? 'Unknown rock type' };
      }
    }
    return null;
  }
}
