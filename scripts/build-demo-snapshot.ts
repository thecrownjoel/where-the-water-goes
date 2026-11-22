#!/usr/bin/env node
// Build the bundled archived snapshots used by demo/offline mode, one per gauge layer.
//
//   node scripts/build-demo-snapshot.ts                       # fetch every layer now
//   node scripts/build-demo-snapshot.ts groundwater           # one layer, fetched now
//   node scripts/build-demo-snapshot.ts discharge saved.json  # one USGS layer from a saved response
//
// The snapshots are real data at a fixed point in time and are always labelled "archived" in
// the UI — they are never presented as current. CoCoRaHS snapshots carry the CC BY 4.0 credit
// in the file and keep locations rounded to 0.01°, exactly as the live layer does.

import fs from 'node:fs';
import { latestUrl, observedRange, parseLatest } from '../src/data/usgs.ts';
import { encodeSnapshot } from '../src/data/archive.ts';
import { fetchLayerSnapshot } from '../src/data/provider.ts';
import { LAYERS, LAYER_IDS, type LayerId } from '../src/data/layers.ts';
import type { GaugeSnapshot } from '../src/data/types.ts';

async function build(id: LayerId, input?: string) {
  const layer = LAYERS[id];
  const out = `public/${layer.archivePath}`;
  if (!input) {
    const { snapshot, truncated } = await fetchLayerSnapshot(layer, Date.now());
    if (truncated) throw new Error(`${id}: response was paginated; refusing to archive a partial snapshot`);
    fs.writeFileSync(out, JSON.stringify(encodeSnapshot({ ...snapshot, mode: 'archived' })));
    console.log(`wrote ${out}: ${snapshot.readings.length} readings`, snapshot.stats.rejected);
    return;
  }
  if (layer.source !== 'usgs') throw new Error(`${id}: building from a saved response is only supported for USGS layers`);
  const url = latestUrl(layer.codes);
  const body: unknown = JSON.parse(fs.readFileSync(input, 'utf8'));
  const ts = (body as { timeStamp?: string }).timeStamp;
  if (!ts) throw new Error('saved response has no timeStamp; cannot establish retrieval time');
  const retrievedAt = new Date(ts).toISOString();
  const parsed = parseLatest(body, { now: Date.parse(retrievedAt), codes: layer.codes, maxAgeHours: layer.maxAgeHours });
  if (parsed.truncated) throw new Error(`${id}: response was paginated; refusing to archive a partial snapshot`);
  const snap: GaugeSnapshot = {
    layer: id,
    readings: parsed.readings,
    provenance: { sourceId: 'usgs-latest-continuous', retrievedAt, requestUrl: url },
    mode: 'archived',
    observedRange: observedRange(parsed.readings),
    stats: parsed.stats,
  };
  fs.writeFileSync(out, JSON.stringify(encodeSnapshot(snap)));
  console.log(`wrote ${out}: ${parsed.readings.length} readings`, parsed.stats.rejected);
}

const [only, input] = process.argv.slice(2);
if (only) {
  if (!LAYER_IDS.includes(only as LayerId)) throw new Error(`unknown layer ${only}; expected ${LAYER_IDS.join(', ')}`);
  await build(only as LayerId, input);
} else {
  for (const id of LAYER_IDS) await build(id);
}
