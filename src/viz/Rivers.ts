// River network as screen-space ribbons with a downstream-moving glint.
//
// IMPORTANT (scientific integrity): the animation is cartographic. Its speed and brightness
// encode river size class from the basemap, NOT measured or modeled discharge. Flow direction
// is inferred (see scripts/build-basemap.mjs). The legend says so.

import {
  AdditiveBlending, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, Mesh,
  ShaderMaterial, Vector2, Vector3,
} from 'three';
import type { Basemap } from './assets.ts';
import { lonLatToVec3 } from './coords.ts';

const R = 1.0015;

const vertex = /* glsl */ `
  attribute vec3 iStart;
  attribute vec3 iEnd;
  attribute vec2 iFlow;
  attribute float iWeight;
  uniform vec2 uResolution;
  uniform float uWidth;
  varying float vFlow;
  varying float vWeight;
  varying float vSide;
  varying float vFacing;
  void main() {
    vec4 cs = projectionMatrix * modelViewMatrix * vec4(iStart, 1.0);
    vec4 ce = projectionMatrix * modelViewMatrix * vec4(iEnd, 1.0);
    vec2 ss = cs.xy / cs.w * uResolution;
    vec2 se = ce.xy / ce.w * uResolution;
    vec2 d = se - ss;
    float len = length(d);
    vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    vec4 c = mix(cs, ce, position.x);
    float w = uWidth * (0.45 + 1.6 * iWeight * iWeight);
    // Offset in pixels (half-width), plus a small extension along the segment to close joints.
    vec2 off = nrm * position.y * w + dir * (position.x * 2.0 - 1.0) * w * 0.5;
    c.xy += off / uResolution * c.w;
    gl_Position = c;
    vFlow = mix(iFlow.x, iFlow.y, position.x);
    vWeight = iWeight;
    vSide = position.y;
    vec3 wp = mix(iStart, iEnd, position.x);
    vFacing = dot(normalize(wp), normalize(cameraPosition - wp));
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uMotion;   // 0 = static (reduced motion), 1 = animated
  uniform float uNight;
  varying float vFlow;
  varying float vWeight;
  varying float vSide;
  varying float vFacing;
  void main() {
    float vis = smoothstep(-0.02, 0.18, vFacing);
    if (vis <= 0.0) discard;
    float core = 1.0 - abs(vSide);
    core = core * core * (3.0 - 2.0 * core);
    // Glints: pattern f(flow + t) travels toward decreasing flow coordinate = downstream.
    float freq = mix(0.9, 0.35, vWeight);
    float p = fract(vFlow * freq + uTime * 0.11 * uMotion);
    float glint = smoothstep(0.0, 0.025, p) * exp(-p * 9.0) * uMotion;
    vec3 base = mix(vec3(0.05, 0.36, 0.48), vec3(0.12, 0.62, 0.78), vWeight);
    vec3 hot = vec3(0.62, 0.95, 1.0);
    float b = mix(0.35, 0.75, vWeight) * mix(0.75, 1.0, uNight);
    vec3 col = base * b + hot * glint * (0.6 + 0.8 * vWeight);
    float a = core * vis * uIntensity;
    gl_FragColor = vec4(col * a, a);
  }
`;

export class Rivers {
  readonly mesh: Mesh;
  private material: ShaderMaterial;
  readonly segmentCount: number;

  constructor(base: Basemap) {
    const { q, rivers } = base.rivers;
    const starts: number[] = [], ends: number[] = [], flows: number[] = [], weights: number[] = [];
    const a = new Vector3(), b = new Vector3();
    for (const r of rivers) {
      // Size class: Natural Earth scalerank 0 (largest) .. ~12 (smallest).
      const weight = Math.max(0, Math.min(1, (11 - r.r) / 11));
      const c = r.c;
      let flow = r.d; // network distance to outlet at upstream end (degrees)
      let lon0 = c[0] / q, lat0 = c[1] / q;
      lonLatToVec3(lon0, lat0, R, a);
      for (let i = 2; i < c.length; i += 2) {
        const lon1 = c[i] / q, lat1 = c[i + 1] / q;
        lonLatToVec3(lon1, lat1, R, b);
        const step = Math.hypot(lon1 - lon0, lat1 - lat0);
        starts.push(a.x, a.y, a.z);
        ends.push(b.x, b.y, b.z);
        flows.push(flow, flow - step);
        weights.push(weight);
        flow -= step;
        a.copy(b); lon0 = lon1; lat0 = lat1;
      }
    }
    this.segmentCount = weights.length;

    const g = new InstancedBufferGeometry();
    // Quad: x in {0,1} along the segment, y in {-1,1} across it.
    g.setAttribute('position', new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    g.setAttribute('iStart', new InstancedBufferAttribute(new Float32Array(starts), 3));
    g.setAttribute('iEnd', new InstancedBufferAttribute(new Float32Array(ends), 3));
    g.setAttribute('iFlow', new InstancedBufferAttribute(new Float32Array(flows), 2));
    g.setAttribute('iWeight', new InstancedBufferAttribute(new Float32Array(weights), 1));
    g.instanceCount = this.segmentCount;

    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uResolution: { value: new Vector2(1, 1) },
        uWidth: { value: 1.2 },
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uMotion: { value: 1 },
        uNight: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Half-resolution in device pixels (NDC → pixel factor). */
  setResolution(w: number, h: number, pixelRatio: number) {
    (this.material.uniforms.uResolution.value as Vector2).set((w * pixelRatio) / 2, (h * pixelRatio) / 2);
    this.material.uniforms.uWidth.value = 1.1 * pixelRatio;
  }
  set widthScale(s: number) { this.material.uniforms.uWidth.value = s; }
  set intensity(v: number) { this.material.uniforms.uIntensity.value = v; }
  set motion(v: number) { this.material.uniforms.uMotion.value = v; }
  set night(v: number) { this.material.uniforms.uNight.value = v; }
  update(t: number) { this.material.uniforms.uTime.value = t; }
}
