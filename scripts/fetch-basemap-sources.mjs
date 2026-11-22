#!/usr/bin/env node
// Download the raw public-domain inputs for scripts/build-basemap.mjs into <rawDir>.
// Treat downloads as untrusted data: the build script only parses them as JSON / numbers.
//
//   node scripts/fetch-basemap-sources.mjs .data-raw
//   node scripts/build-basemap.mjs .data-raw
//   node scripts/build-aquifers.mjs .data-raw

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const rawDir = process.argv[2] ?? '.data-raw';
fs.mkdirSync(rawDir, { recursive: true });

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const files = [
  ['ne_50m_land.geojson', NE + 'ne_50m_land.geojson'],
  ['ne_10m_lakes.geojson', NE + 'ne_10m_lakes.geojson'],
  ['ne_10m_rivers_lake_centerlines.geojson', NE + 'ne_10m_rivers_lake_centerlines.geojson'],
  ['ne_10m_rivers_north_america.geojson', NE + 'ne_10m_rivers_north_america.geojson'],
  // NOAA ETOPO1 (ice surface) via NOAA CoastWatch ERDDAP, every 10th node = 0.1667 deg.
  ['etopo_6min.asc', 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.esriAscii?altitude%5B(-90.0):10:(90.0)%5D%5B(-180.0):10:(180.0)%5D'],
];

for (const [name, url] of files) {
  const out = path.join(rawDir, name);
  if (fs.existsSync(out)) { console.log('exists', out); continue; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('saved', out, fs.statSync(out).size, 'bytes');
}
// USGS Principal Aquifers (2003), https://doi.org/10.5066/P9Y2HOUJ. Pinned by hash: the file has
// not changed since 2015, so a different hash means something other than the published data.
const AQUIFERS_URL = 'https://water.usgs.gov/GIS/dsdl/aquifers_us.zip';
const AQUIFERS_SHA256 = '3c597778c51325012aa5ff593751a6e4e662f43906e690fc3eb125c7073b1ebc';
const aqZip = path.join(rawDir, 'aquifers_us.zip');
if (!fs.existsSync(aqZip)) {
  const res = await fetch(AQUIFERS_URL);
  if (!res.ok) throw new Error(`${AQUIFERS_URL}: HTTP ${res.status}`);
  fs.writeFileSync(aqZip, Buffer.from(await res.arrayBuffer()));
  console.log('saved', aqZip);
}
const aqHash = crypto.createHash('sha256').update(fs.readFileSync(aqZip)).digest('hex');
if (aqHash !== AQUIFERS_SHA256) throw new Error(`aquifers_us.zip hash mismatch: ${aqHash}`);
execFileSync('unzip', ['-o', '-q', aqZip, '-d', path.join(rawDir, 'aquifers_us')]);
files.push(['aquifers_us.zip', AQUIFERS_URL]);

fs.writeFileSync(path.join(rawDir, 'SOURCES.json'), JSON.stringify({ retrievedAt: new Date().toISOString(), files }, null, 2));
