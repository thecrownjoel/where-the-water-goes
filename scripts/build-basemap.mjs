#!/usr/bin/env node
// Build the bundled offline basemap from raw public-domain sources.
//
// Usage:
//   node scripts/fetch-basemap-sources.mjs <rawDir>   # downloads sources
//   node scripts/build-basemap.mjs <rawDir> [outDir]
//
// Inputs (see docs/DATA_SOURCES.md):
//   etopo_6min.asc   NOAA NGDC ETOPO1 (ice surface), decimated to 0.1667 deg via NOAA CoastWatch ERDDAP
//   ne_*.geojson     Natural Earth vector layers (public domain)
//
// Outputs (in outDir, default public/data/base):
//   elevation.bin    Int16 little-endian, row-major, north row first, W->E, meters
//   elevation.json   grid metadata
//   land.json, lakes.json, rivers.json   quantized, simplified geometry
//   manifest.json    provenance for every output file

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { simplifyLine, quantize, orientNetwork, makeElevationSampler } from '../src/geo/geometry.mjs';

const rawDir = process.argv[2];
const outDir = process.argv[3] ?? 'public/data/base';
if (!rawDir) {
  console.error('usage: build-basemap.mjs <rawDir> [outDir]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const outputs = [];
const write = (name, data, source) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
  fs.writeFileSync(path.join(outDir, name), buf);
  outputs.push({ file: name, bytes: buf.length, sha256: sha256(buf), source });
  console.log(`wrote ${name} ${(buf.length / 1024).toFixed(0)} KiB`);
};

// ---------- Elevation (ESRI ASCII grid) ----------
function parseEsriAscii(text) {
  const lines = text.split('\n');
  const hdr = {};
  let i = 0;
  for (; i < 6; i++) {
    const [k, v] = lines[i].trim().split(/\s+/);
    hdr[k.toLowerCase()] = Number(v);
  }
  const ncols = hdr.ncols, nrows = hdr.nrows;
  if (!Number.isInteger(ncols) || !Number.isInteger(nrows)) throw new Error('bad ESRI ASCII header');
  const out = new Int16Array(ncols * nrows);
  let n = 0;
  for (; i < lines.length && n < out.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;
    for (const tok of row.split(/\s+/)) {
      const v = Number(tok);
      if (!Number.isFinite(v)) throw new Error(`non-numeric cell at ${n}`);
      out[n++] = v === hdr.nodata_value ? 0 : Math.max(-32768, Math.min(32767, Math.round(v)));
    }
  }
  if (n !== out.length) throw new Error(`expected ${out.length} cells, got ${n}`);
  return { ...hdr, data: out };
}

const grid = parseEsriAscii(fs.readFileSync(path.join(rawDir, 'etopo_6min.asc'), 'utf8'));
// Grid is node-registered from -180..180 / -90..90 (2161 x 1081). Drop the duplicated
// 180E column so the texture wraps seamlessly: width 2160, height 1081.
const W = grid.ncols - 1, H = grid.nrows;
const elev = new Int16Array(W * H);
for (let r = 0; r < H; r++) elev.set(grid.data.subarray(r * grid.ncols, r * grid.ncols + W), r * W);
write('elevation.bin', Buffer.from(elev.buffer), 'noaa-etopo1');
write('elevation.json', {
  width: W, height: H, lonWest: -180, latNorth: 90, cellDeg: grid.cellsize,
  registration: 'node', units: 'm', datum: 'MSL', layout: 'int16le row-major, north row first',
}, 'noaa-etopo1');
const sampleElev = makeElevationSampler(elev, W, H, grid.cellsize);

// ---------- Land ----------
function polygonsOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}
function linesOf(geom) {
  if (!geom) return [];
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  return [];
}

const land = [];
for (const f of readJson('ne_50m_land.geojson').features) {
  for (const poly of polygonsOf(f.geometry)) {
    const rings = poly.map((ring) => quantize(simplifyLine(ring, 0.02))).filter((r) => r.length >= 8);
    if (rings.length) land.push(rings);
  }
}
write('land.json', { q: 1000, polygons: land }, 'natural-earth');

// ---------- Lakes & reservoirs ----------
const lakes = [];
for (const f of readJson('ne_10m_lakes.geojson').features) {
  const p = f.properties ?? {};
  const kind = /reservoir/i.test(p.featurecla ?? '') ? 'reservoir' : 'lake';
  for (const poly of polygonsOf(f.geometry)) {
    const rings = poly.map((ring) => quantize(simplifyLine(ring, 0.01))).filter((r) => r.length >= 8);
    if (rings.length) lakes.push({ n: p.name ?? null, k: kind, r: p.scalerank ?? 10, g: rings });
  }
}
write('lakes.json', { q: 1000, lakes }, 'natural-earth');

// ---------- Rivers ----------
// Flow direction: Natural Earth does not encode it. We infer it from network topology
// (orient toward coastal outlets / lowest sinks) with ETOPO1 elevation; see orientNetwork()
// and docs/DATA_SOURCES.md. It is a visual heuristic and can be wrong locally.
const rawRivers = [];
function collectRivers(file, defaultRank) {
  for (const f of readJson(file).features) {
    const p = f.properties ?? {};
    if (p.featurecla && !/river|centerline/i.test(p.featurecla)) continue;
    for (const line of linesOf(f.geometry)) {
      if (line.length < 2) continue;
      rawRivers.push({ n: p.name ?? null, r: p.scalerank ?? defaultRank, w: p.strokeweig ?? null, line });
    }
  }
}
collectRivers('ne_10m_rivers_lake_centerlines.geojson', 8);
collectRivers('ne_10m_rivers_north_america.geojson', 12);
// Topology must be built on unsimplified lines (simplification drops confluence vertices).
const oriented = orientNetwork(rawRivers.map((r) => r.line), sampleElev, { tolDeg: 0.005 });
const methodCounts = {};
const rivers = [];
for (const o of oriented) {
  methodCounts[o.method] = (methodCounts[o.method] ?? 0) + 1;
  const q = quantize(simplifyLine(o.line, 0.01));
  if (q.length < 4) continue;
  const src = rawRivers[o.src];
  rivers.push({ n: src.n, r: src.r, w: src.w, m: o.method, d: Math.round(o.d0 * 1000) / 1000, c: q });
}
console.log(`rivers: ${rivers.length} edges`, methodCounts);
write('rivers.json', { q: 1000, rivers }, 'natural-earth+noaa-etopo1');

// ---------- Manifest ----------
const manifest = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/build-basemap.mjs',
  sources: {
    'noaa-etopo1': {
      agency: 'NOAA NCEI (formerly NGDC)',
      dataset: 'ETOPO1 1 Arc-Minute Global Relief Model, ice surface, grid-registered',
      retrieval: 'NOAA CoastWatch ERDDAP griddap etopo180, stride 10 (0.1667 deg)',
      citation: 'Amante, C. and B. W. Eakins, ETOPO1 1 Arc-Minute Global Relief Model: Procedures, Data Sources and Analysis. NOAA Technical Memorandum NESDIS NGDC-24, 2009.',
      terms: 'May be used and redistributed for free; not intended for legal use; no warranty (per ERDDAP dataset license attribute).',
    },
    'natural-earth': {
      agency: null,
      dataset: 'Natural Earth vector data (land 1:50m, lakes 1:10m, rivers 1:10m + North America supplement)',
      retrieval: 'https://github.com/nvkelso/natural-earth-vector (geojson/)',
      citation: 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.',
      terms: 'Public domain.',
      note: 'Not a federal dataset. Used only as a cartographic basemap; replace with USGS NHD/3DHP/WBD in a later milestone.',
    },
  },
  outputs,
};
// Keep entries written by other generators (scripts/build-aquifers.mjs).
const manifestPath = path.join(outDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const mine = new Set(outputs.map((o) => o.file));
  for (const [k, v] of Object.entries(prev.sources ?? {})) if (!(k in manifest.sources)) manifest.sources[k] = v;
  for (const o of prev.outputs ?? []) if (!mine.has(o.file)) outputs.push(o);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('wrote manifest.json');
