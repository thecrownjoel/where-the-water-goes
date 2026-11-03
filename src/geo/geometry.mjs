// Pure geometry helpers shared by the build scripts and the app. No DOM, no three.js.
// Kept as plain .mjs so Node build scripts can import it without a TypeScript step.

/** Douglas–Peucker simplification in lon/lat degrees (planar approximation). */
export function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Flatten [[lon,lat],...] into an int array scaled by q, dropping consecutive duplicates. */
export function quantize(points, q = 1000) {
  const out = [];
  let px = NaN, py = NaN;
  for (const [lon, lat] of points) {
    const x = Math.round(lon * q), y = Math.round(lat * q);
    if (x === px && y === py) continue;
    out.push(x, y);
    px = x; py = y;
  }
  return out;
}

/** Inverse of quantize. */
export function dequantize(flat, q = 1000) {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i] / q, flat[i + 1] / q]);
  return out;
}

/**
 * Bilinear sampler over a global node-registered grid (north row first, lon -180..180-cell).
 * Longitude wraps; latitude clamps.
 */
export function makeElevationSampler(data, width, height, cellDeg) {
  return (lon, lat) => {
    let x = (lon + 180) / cellDeg;
    let y = (90 - lat) / cellDeg;
    x = ((x % width) + width) % width;
    y = Math.max(0, Math.min(height - 1, y));
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = (x0 + 1) % width, y1 = Math.min(height - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const v00 = data[y0 * width + x0], v10 = data[y0 * width + x1];
    const v01 = data[y1 * width + x0], v11 = data[y1 * width + x1];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  };
}

/**
 * Orient a polyline so that elevation tends to decrease along it (i.e. downstream).
 * Uses a least-squares slope of elevation against cumulative distance, which is more
 * robust than comparing endpoints. If the fitted drop is smaller than `minDrop` meters
 * the direction is reported as ambiguous and the original order is kept.
 */
export function orientDownstream(line, sample, minDrop = 5) {
  const n = line.length;
  if (n < 2) return { line: line.slice(), reversed: false, ambiguous: true };
  const s = new Float64Array(n), z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const dx = line[i][0] - line[i - 1][0], dy = line[i][1] - line[i - 1][1];
      s[i] = s[i - 1] + Math.hypot(dx * Math.cos((line[i][1] * Math.PI) / 180), dy);
    }
    z[i] = sample(line[i][0], line[i][1]);
  }
  const total = s[n - 1];
  if (total === 0) return { line: line.slice(), reversed: false, ambiguous: true };
  let ms = 0, mz = 0;
  for (let i = 0; i < n; i++) { ms += s[i]; mz += z[i]; }
  ms /= n; mz /= n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (s[i] - ms) * (z[i] - mz); den += (s[i] - ms) ** 2; }
  const slope = den ? num / den : 0;
  const drop = -slope * total; // positive = descends along current order
  if (Math.abs(drop) < minDrop) return { line: line.slice(), reversed: false, ambiguous: true };
  return drop > 0
    ? { line: line.slice(), reversed: false, ambiguous: false }
    : { line: line.slice().reverse(), reversed: true, ambiguous: false };
}

/**
 * Orient a set of river polylines consistently toward network outlets.
 *
 * 1. Each line endpoint is attached to the nearest vertex of any other line within
 *    `tolDeg`. Attaching to an endpoint merges the two nodes; attaching to an interior
 *    vertex splits that line there, so confluences become graph nodes.
 * 2. Outlets are degree-1 nodes at or below `coastElev` meters (sea level). Each connected
 *    component without such a node (endorheic basins, networks ending in large lakes, or
 *    fragments) uses its lowest degree-1 node instead.
 * 3. A multi-source Dijkstra (edge weight = length) from the outlets assigns each node a
 *    distance-to-outlet; every edge is oriented from its farther node to its nearer node.
 *
 * Returns one entry per output edge: { line, src, method, d0 } where `src` is the input index.
 * method: 'network' (component had a coastal outlet), 'sink' (lowest-node fallback), or
 * 'isolated' (single unconnected line, oriented by elevation trend; may be 'ambiguous').
 */
export function orientNetwork(lines, sample, { tolDeg = 0.005, coastElev = 5 } = {}) {
  // Spatial hash of every vertex.
  const cell = Math.max(tolDeg, 1e-6);
  const grid = new Map();
  const ck = (x, y) => `${x},${y}`;
  lines.forEach((l, i) => l.forEach((p, j) => {
    const k = ck(Math.floor(p[0] / cell), Math.floor(p[1] / cell));
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(i, j);
  }));
  // Union-find over vertex ids "line:vertex".
  const parent = new Map();
  const find = (x) => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r);
    let c = x;
    while (c !== r) { const n = parent.get(c) ?? r; parent.set(c, r); c = n; }
    return r;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const splits = lines.map(() => new Set());
  lines.forEach((l, i) => {
    if (l.length < 2) return;
    for (const j of [0, l.length - 1]) {
      const p = l[j];
      const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
      let best = tolDeg, bi = -1, bj = -1;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const a = grid.get(ck(cx + dx, cy + dy));
        if (!a) continue;
        for (let t = 0; t < a.length; t += 2) {
          if (a[t] === i) continue;
          const q = lines[a[t]][a[t + 1]];
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d <= best) { best = d; bi = a[t]; bj = a[t + 1]; }
        }
      }
      if (bi < 0) continue;
      const tl = lines[bi];
      if (bj !== 0 && bj !== tl.length - 1) splits[bi].add(bj);
      union(`${i}:${j}`, `${bi}:${bj}`);
    }
  });
  // Split lines into edges.
  const edges = [];
  lines.forEach((l, src) => {
    if (l.length < 2) return;
    const cuts = [...splits[src]].sort((x, y) => x - y);
    let start = 0;
    for (const c of [...cuts, l.length - 1]) {
      if (c <= start) continue;
      edges.push({ line: l.slice(start, c + 1), src, ia: `${src}:${start}`, ib: `${src}:${c}` });
      start = c;
    }
  });
  // Build node graph.
  const nodeId = new Map();
  const nodes = []; // {p, adj: [edgeIndex], elev}
  const nodeOf = (vid, p) => {
    const k = find(vid);
    let id = nodeId.get(k);
    if (id === undefined) {
      id = nodes.length;
      nodeId.set(k, id);
      nodes.push({ p, adj: [], elev: sample(p[0], p[1]) });
    }
    return id;
  };
  for (let e = 0; e < edges.length; e++) {
    const l = edges[e].line;
    const a = nodeOf(edges[e].ia, l[0]), b = nodeOf(edges[e].ib, l[l.length - 1]);
    edges[e].a = a; edges[e].b = b;
    let len = 0;
    for (let i = 1; i < l.length; i++) len += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    edges[e].len = Math.max(len, 1e-9);
    nodes[a].adj.push(e);
    if (b !== a) nodes[b].adj.push(e);
  }
  // Connected components.
  const comp = new Int32Array(nodes.length).fill(-1);
  const comps = [];
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] !== -1) continue;
    const members = [s];
    comp[s] = comps.length;
    for (let i = 0; i < members.length; i++) {
      for (const e of nodes[members[i]].adj) {
        for (const n of [edges[e].a, edges[e].b]) {
          if (comp[n] === -1) { comp[n] = comps.length; members.push(n); }
        }
      }
    }
    comps.push(members);
  }
  // Pick outlets.
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const compMethod = [];
  const heap = new MinHeap();
  comps.forEach((members, c) => {
    const leaves = members.filter((n) => nodes[n].adj.length === 1);
    const edgeCount = new Set(members.flatMap((n) => nodes[n].adj)).size;
    if (edgeCount === 1) { compMethod[c] = 'isolated'; return; }
    let outlets = leaves.filter((n) => nodes[n].elev <= coastElev);
    compMethod[c] = 'network';
    if (!outlets.length) {
      const pool = leaves.length ? leaves : members;
      let best = pool[0];
      for (const n of pool) if (nodes[n].elev < nodes[best].elev) best = n;
      outlets = [best];
      compMethod[c] = 'sink';
    }
    for (const o of outlets) { dist[o] = 0; heap.push(0, o); }
  });
  while (heap.size) {
    const [d, n] = heap.pop();
    if (d > dist[n]) continue;
    for (const e of nodes[n].adj) {
      const m = edges[e].a === n ? edges[e].b : edges[e].a;
      const nd = d + edges[e].len;
      if (nd < dist[m]) { dist[m] = nd; heap.push(nd, m); }
    }
  }
  return edges.map((e) => {
    const method = compMethod[comp[e.a]];
    if (method === 'isolated') {
      const o = orientDownstream(e.line, sample);
      return { line: o.line, src: e.src, method: o.ambiguous ? 'ambiguous' : 'isolated', d0: e.len };
    }
    // Flow goes from the node farther from the outlet to the nearer one.
    // d0 = network distance (degrees) from the upstream end to the outlet; lets renderers
    // keep animated flow phase continuous across confluences.
    const forward = dist[e.a] >= dist[e.b];
    const d0 = Math.max(dist[e.a], dist[e.b]);
    return { line: forward ? e.line : e.line.slice().reverse(), src: e.src, method, d0: Number.isFinite(d0) ? d0 : e.len };
  });
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, V = this.v;
    let i = K.length;
    K.push(k); V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= K[i]) break;
      [K[p], K[i]] = [K[i], K[p]]; [V[p], V[i]] = [V[i], V[p]];
      i = p;
    }
  }
  pop() {
    const K = this.k, V = this.v;
    const top = [K[0], V[0]];
    const lk = K.pop(), lv = V.pop();
    if (K.length) {
      K[0] = lk; V[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < K.length && K[l] < K[m]) m = l;
        if (r < K.length && K[r] < K[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [V[m], V[i]] = [V[i], V[m]];
        i = m;
      }
    }
    return top;
  }
}
