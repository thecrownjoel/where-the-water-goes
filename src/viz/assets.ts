// Loads the bundled offline basemap. Everything here ships with the app; no network needed.

export interface ElevationGrid {
  width: number;
  height: number;
  cellDeg: number;
  data: Int16Array;
}

export interface Basemap {
  elevation: ElevationGrid;
  land: { q: number; polygons: number[][][] };
  lakes: { q: number; lakes: { n: string | null; k: 'lake' | 'reservoir'; r: number; g: number[][] }[] };
  rivers: { q: number; rivers: { n: string | null; r: number; w: number | null; m: string; d: number; c: number[] }[] };
}

const BASE = `${import.meta.env.BASE_URL}data/base/`;

async function json<T>(name: string): Promise<T> {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`failed to load ${name}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadBasemap(): Promise<Basemap> {
  const [meta, elevBuf, land, lakes, rivers] = await Promise.all([
    json<{ width: number; height: number; cellDeg: number }>('elevation.json'),
    fetch(BASE + 'elevation.bin').then((r) => {
      if (!r.ok) throw new Error('failed to load elevation.bin');
      return r.arrayBuffer();
    }),
    json<Basemap['land']>('land.json'),
    json<Basemap['lakes']>('lakes.json'),
    json<Basemap['rivers']>('rivers.json'),
  ]);
  const data = new Int16Array(elevBuf);
  if (data.length !== meta.width * meta.height) throw new Error('elevation grid size mismatch');
  return { elevation: { ...meta, data }, land, lakes, rivers };
}
