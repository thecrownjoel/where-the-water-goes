// Vector coastlines and lake shores: thin, faint, crisp at any zoom (the raster mask alone
// stair-steps when close). Cartographic only.

import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three';
import type { Basemap } from './assets.ts';
import { lonLatToVec3 } from './coords.ts';

export function createCoastlines(base: Basemap): LineSegments {
  const pos: number[] = [];
  const add = (ring: number[], q: number, r: number) => {
    let prev = lonLatToVec3(ring[0] / q, ring[1] / q, r);
    for (let i = 2; i < ring.length; i += 2) {
      const p = lonLatToVec3(ring[i] / q, ring[i + 1] / q, r);
      pos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  };
  for (const poly of base.land.polygons) for (const ring of poly) add(ring, base.land.q, 1.0008);
  for (const lake of base.lakes.lakes) if (lake.r <= 8) for (const ring of lake.g) add(ring, base.lakes.q, 1.001);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const m = new LineBasicMaterial({ color: 0x5aaecb, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false });
  const lines = new LineSegments(g, m);
  lines.name = 'coastlines';
  lines.renderOrder = 1;
  return lines;
}
