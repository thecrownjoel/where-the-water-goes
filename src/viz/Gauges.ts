// Gauge marks: one luminous mark per USGS site and parameter, lying flat on the globe.
// One class, three styles:
//   discharge  warm point, size ∝ log10(discharge) as published, slow pulse
//   rain       cool ripples where the latest reported interval had precipitation > 0
//   lake       small teal level marker of constant size (elevation is not a magnitude)
// Estimated values (agency-flagged) are drawn as rings without a core. Nothing is
// interpolated between gauges.

import {
  AdditiveBlending, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, Mesh,
  ShaderMaterial, Vector3, type Camera,
} from 'three';
import type { GaugeReading } from '../data/types.ts';
import { lonLatToVec3, tangentFrame } from './coords.ts';

const R = 1.0022;

const vertex = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iEast;
  attribute vec3 iNorth;
  attribute float iSize;
  attribute float iKind;   // 0 observation, 1 estimate
  attribute float iPhase;
  uniform float uScale;
  varying vec2 vUv;
  varying float vKind;
  varying float vPhase;
  varying float vFacing;
  void main() {
    vec3 p = iPos + (iEast * position.x + iNorth * position.y) * iSize * uScale;
    vUv = position.xy;
    vKind = iKind;
    vPhase = iPhase;
    vFacing = dot(normalize(iPos), normalize(cameraPosition - iPos));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  uniform float uIntensity;
  uniform vec3 uColor;
  uniform float uStyle;    // 0 discharge, 1 rain, 2 lake
  varying vec2 vUv;
  varying float vKind;
  varying float vPhase;
  varying float vFacing;
  void main() {
    float vis = smoothstep(0.0, 0.2, vFacing);
    float r = length(vUv);
    if (r > 1.0 || vis <= 0.0) discard;
    float core = (1.0 - vKind) * exp(-r * r * 26.0);
    float halo = exp(-r * r * 5.0) * 0.22;
    float staticRing = vKind * smoothstep(0.08, 0.0, abs(r - 0.45)) * 0.8;
    float a;
    if (uStyle < 0.5) {
      float rr = fract(uTime * 0.07 + vPhase);
      float ring = smoothstep(0.06, 0.0, abs(r - rr)) * (1.0 - rr) * 0.55 * uMotion;
      a = core * 0.8 + halo * 0.5 + ring * 0.6 + staticRing * 0.7;
    } else if (uStyle < 1.5) {
      // Raindrop ripples: two staggered rings expanding outward. Static ring when motion is off.
      float r1 = fract(uTime * 0.32 + vPhase);
      float r2 = fract(uTime * 0.32 + vPhase + 0.5);
      float rip = smoothstep(0.07, 0.0, abs(r - r1)) * (1.0 - r1) + smoothstep(0.07, 0.0, abs(r - r2)) * (1.0 - r2);
      float still = smoothstep(0.07, 0.0, abs(r - 0.55)) * 0.9;
      float dot = exp(-r * r * 120.0);
      a = dot * 1.1 + halo * 0.45 + mix(still, rip * 1.3, uMotion);
    } else {
      float ring = smoothstep(0.08, 0.0, abs(r - 0.6)) * 0.5;
      a = exp(-r * r * 40.0) * 0.5 + ring + staticRing * 0.4;
    }
    a *= vis * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function gaugeSize(value: number): number {
  return 0.0012 + 0.0011 * Math.log10(1 + Math.abs(value));
}

export function rainSize(inches: number): number {
  return 0.009 + 0.02 * Math.sqrt(Math.max(0, inches));
}

export type GaugeStyle = 'discharge' | 'rain' | 'lake';

const STYLES: Record<GaugeStyle, { color: [number, number, number]; style: number; size: (v: number) => number; show: (r: GaugeReading) => boolean; order: number }> = {
  discharge: { color: [1.0, 0.82, 0.55], style: 0, size: gaugeSize, show: () => true, order: 3 },
  // Only gauges that recorded precipitation in their latest interval are drawn; a zero is
  // shown as nothing rather than as a mark, so "dry" never looks like "missing".
  rain: { color: [0.32, 0.68, 1.0], style: 1, size: rainSize, show: (r) => r.value > 0, order: 4 },
  lake: { color: [0.18, 0.95, 0.72], style: 2, size: () => 0.0042, show: () => true, order: 4 },
};

export class Gauges {
  readonly mesh: Mesh;
  private material: ShaderMaterial;
  private readings: GaugeReading[] = [];
  private positions: Vector3[] = [];

  readonly style: GaugeStyle;

  constructor(style: GaugeStyle = 'discharge') {
    this.style = style;
    const st = STYLES[style];
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    g.instanceCount = 0;
    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 }, uScale: { value: 1 }, uMotion: { value: 1 }, uIntensity: { value: 1 },
        uColor: { value: st.color }, uStyle: { value: st.style },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = st.order;
  }

  /** Number of marks currently drawn. */
  get count() { return this.readings.length; }

  setReadings(all: GaugeReading[]) {
    const st = STYLES[this.style];
    const readings = all.filter(st.show);
    this.readings = readings;
    const n = readings.length;
    const pos = new Float32Array(n * 3), east = new Float32Array(n * 3), north = new Float32Array(n * 3);
    const size = new Float32Array(n), kind = new Float32Array(n), phase = new Float32Array(n);
    this.positions = [];
    readings.forEach((r, i) => {
      const p = lonLatToVec3(r.lon, r.lat, R);
      const f = tangentFrame(r.lon, r.lat);
      this.positions.push(p);
      pos.set([p.x, p.y, p.z], i * 3);
      east.set([f.east.x, f.east.y, f.east.z], i * 3);
      north.set([f.north.x, f.north.y, f.north.z], i * 3);
      size[i] = st.size(r.value);
      kind[i] = r.kind === 'estimate' ? 1 : 0;
      // Deterministic per-site phase so rings don't pulse in unison.
      let h = 0;
      for (let k = 0; k < r.id.length; k++) h = (h * 31 + r.id.charCodeAt(k)) >>> 0;
      phase[i] = (h % 1000) / 1000;
    });
    const g = this.mesh.geometry as InstancedBufferGeometry;
    g.setAttribute('iPos', new InstancedBufferAttribute(pos, 3));
    g.setAttribute('iEast', new InstancedBufferAttribute(east, 3));
    g.setAttribute('iNorth', new InstancedBufferAttribute(north, 3));
    g.setAttribute('iSize', new InstancedBufferAttribute(size, 1));
    g.setAttribute('iKind', new InstancedBufferAttribute(kind, 1));
    g.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1));
    g.instanceCount = n;
  }

  /** Find the front-facing gauge nearest to a screen point (CSS px), within maxPx. */
  pick(x: number, y: number, width: number, height: number, camera: Camera, maxPx = 14): { reading: GaugeReading; d2: number } | null {
    const v = new Vector3();
    const camPos = new Vector3();
    camera.getWorldPosition(camPos);
    let best: GaugeReading | null = null;
    let bestD = maxPx * maxPx;
    for (let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i];
      if (p.dot(v.copy(camPos).sub(p)) <= 0) continue; // back side
      v.copy(p).project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * width, sy = (-v.y * 0.5 + 0.5) * height;
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < bestD) { bestD = d; best = this.readings[i]; }
    }
    return best ? { reading: best, d2: bestD } : null;
  }

  set scale(s: number) { this.material.uniforms.uScale.value = s; }
  set motion(v: number) { this.material.uniforms.uMotion.value = v; }
  set intensity(v: number) { this.material.uniforms.uIntensity.value = v; }
  set visible(v: boolean) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
  update(t: number) { this.material.uniforms.uTime.value = t; }
}
