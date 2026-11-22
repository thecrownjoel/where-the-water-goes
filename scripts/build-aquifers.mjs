#!/usr/bin/env node
// Build the bundled principal-aquifer layer from the USGS shapefile.
//
//   node scripts/fetch-basemap-sources.mjs .data-raw     # downloads + verifies aquifers_us.zip
//   node scripts/build-aquifers.mjs .data-raw [outDir]
//
// Input: USGS (2003) "Principal Aquifers of the 48 Conterminous United States, Hawaii, Puerto
// Rico, and the U.S. Virgin Islands", https://doi.org/10.5066/P9Y2HOUJ (aquifers_us.zip, which
// unpacks to us_aquifers.shp/.dbf in NAD83 geographic coordinates).
//
// Output (outDir, default public/data/base): aquifers.json, and its entry in manifest.json.
// Polygons are simplified for national display. The source is a 1:2,500,000 map: regional,
// never local. "Other rocks" (AQ_CODE 999, not a principal aquifer) is dropped.
//
// The shapefile and dBASE readers below handle only what this file uses (Polygon/PolygonZ,
// character and numeric fields) and treat the input as untrusted: every offset is bounds-checked.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { simplifyLine, quantize } from '../src/geo/geometry.mjs';

const rawDir = process.argv[2];
const outDir = process.argv[3] ?? 'public/data/base';
if (!rawDir) {
  console.error('usage: build-aquifers.mjs <rawDir> [outDir]');
  process.exit(1);
}
const SRC_DIR = path.join(rawDir, 'aquifers_us');
const TOLERANCE_DEG = 0.02; // ~2 km, well under one texel of the 4096-px globe texture; source is 1:2,500,000
const MIN_EXTENT_DEG = 0.05; // rings smaller than this in both directions are dropped
const Q = 1000;

function readShp(file) {
  const b = fs.readFileSync(file);
  if (b.length < 100 || b.readInt32BE(0) !== 9994) throw new Error('not a shapefile');
  const shapeType = b.readInt32LE(32);
  if (shapeType !== 5 && shapeType !== 15) throw new Error(`expected Polygon shapefile, got type ${shapeType}`);
  const records = [];
  let off = 100;
  while (off + 8 <= b.length) {
    const len = b.readInt32BE(off + 4) * 2;
    const start = off + 8;
    off = start + len;
    if (off > b.length) throw new Error('truncated record');
    const type = b.readInt32LE(start);
    if (type === 0) { records.push([]); continue; }
    if (type !== shapeType) throw new Error(`mixed shape types (${type})`);
    const numParts = b.readInt32LE(start + 36), numPoints = b.readInt32LE(start + 40);
    const partsAt = start + 44, pointsAt = partsAt + numParts * 4;
    if (numParts < 0 || numPoints < 0 || pointsAt + numPoints * 16 > off) throw new Error('bad polygon header');
    const parts = [];
    for (let i = 0; i < numParts; i++) parts.push(b.readInt32LE(partsAt + i * 4));
    parts.push(numPoints);
    const rings = [];
    for (let i = 0; i < numParts; i++) {
      const ring = [];
      for (let k = parts[i]; k < parts[i + 1]; k++) {
        const p = pointsAt + k * 16;
        ring.push([b.readDoubleLE(p), b.readDoubleLE(p + 8)]);
      }
      rings.push(ring);
    }
    records.push(rings);
  }
  return records;
}

function readDbf(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(4), headerLen = b.readUInt16LE(8), recLen = b.readUInt16LE(10);
  const fields = [];
  for (let off = 32; off + 32 <= headerLen && b[off] !== 0x0d; off += 32) {
    fields.push({ name: b.toString('latin1', off, off + 11).replace(/\0.*$/, ''), len: b[off + 16] });
  }
  if (headerLen + n * recLen > b.length) throw new Error('truncated dbf');
  const rows = [];
  for (let i = 0; i < n; i++) {
    let o = headerLen + i * recLen + 1;
    const row = {};
    for (const f of fields) { row[f.name] = b.toString('latin1', o, o + f.len).trim(); o += f.len; }
    rows.push(row);
  }
  return rows;
}

const shp = readShp(path.join(SRC_DIR, 'us_aquifers.shp'));
const dbf = readDbf(path.join(SRC_DIR, 'us_aquifers.dbf'));
if (shp.length !== dbf.length) throw new Error(`shp/dbf record count mismatch: ${shp.length} vs ${dbf.length}`);

const rockTypes = {};
const byCode = new Map();
let pointsIn = 0, pointsOut = 0, droppedRings = 0;
for (let i = 0; i < shp.length; i++) {
  const row = dbf[i];
  const code = Number(row.AQ_CODE), rock = Number(row.ROCK_TYPE);
  if (code === 999 || !Number.isInteger(code) || !Number.isInteger(rock)) continue;
  if (row.ROCK_NAME) rockTypes[rock] = row.ROCK_NAME;
  const rings = [];
  for (const ring of shp[i]) {
    pointsIn += ring.length;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 - x0 < MIN_EXTENT_DEG && y1 - y0 < MIN_EXTENT_DEG) { droppedRings++; continue; }
    const q = quantize(simplifyLine(ring, TOLERANCE_DEG), Q);
    if (q.length < 8) { droppedRings++; continue; }
    pointsOut += q.length / 2;
    rings.push(q);
  }
  if (!rings.length) continue;
  if (!byCode.has(code)) byCode.set(code, { c: code, n: row.AQ_NAME, r: rock, p: [] });
  byCode.get(code).p.push(rings);
}

const aquifers = [...byCode.values()].sort((a, b) => a.c - b.c);
const out = { q: Q, rockTypes, aquifers };
const buf = Buffer.from(JSON.stringify(out));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'aquifers.json'), buf);
console.log(`aquifers: ${aquifers.length} principal aquifers, ${pointsIn} → ${pointsOut} points, ${droppedRings} tiny rings dropped, ${(buf.length / 1024).toFixed(0)} KiB`);

// Merge into manifest.json (build-basemap.mjs preserves entries it did not write).
const manifestPath = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { sources: {}, outputs: [] };
manifest.sources['usgs-principal-aquifers'] = {
  agency: 'U.S. Geological Survey',
  dataset: 'Principal Aquifers of the 48 Conterminous United States, Hawaii, Puerto Rico, and the U.S. Virgin Islands (2003)',
  retrieval: 'https://water.usgs.gov/GIS/dsdl/aquifers_us.zip (ScienceBase item 63140610d34e36012efa385d)',
  citation: 'U.S. Geological Survey, 2003, Principal Aquifers of the 48 Conterminous United States, Hawaii, Puerto Rico, and the U.S. Virgin Islands: U.S. Geological Survey data release, https://doi.org/10.5066/P9Y2HOUJ.',
  terms: 'USGS-authored data: U.S. public domain.',
  note: `1:2,500,000 source; simplified at ${TOLERANCE_DEG} deg for national display. Generated by scripts/build-aquifers.mjs.`,
};
manifest.outputs = manifest.outputs.filter((o) => o.file !== 'aquifers.json');
manifest.outputs.push({ file: 'aquifers.json', bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), source: 'usgs-principal-aquifers' });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('updated manifest.json');
