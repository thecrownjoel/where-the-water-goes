// The globe: relief-shaded terrain and bathymetry from NOAA ETOPO1, land/lake masks from
// Natural Earth, lit by the real sun position (or a night palette). Plus an atmosphere shell.

import {
  AdditiveBlending, BackSide, CanvasTexture, ClampToEdgeWrapping, DataTexture, DataUtils, FrontSide,
  HalfFloatType, LinearFilter, Mesh, RedFormat, RepeatWrapping, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import type { Basemap } from './assets.ts';

const MASK_W = 4096, MASK_H = 2048;

function buildMaskTexture(base: Basemap): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = MASK_W; canvas.height = MASK_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MASK_W, MASK_H);
  ctx.globalCompositeOperation = 'lighter';
  const trace = (rings: number[][], q: number) => {
    ctx.beginPath();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const x = ((ring[i] / q + 180) / 360) * MASK_W;
        const y = ((90 - ring[i + 1] / q) / 180) * MASK_H;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
  };
  ctx.fillStyle = '#ff0000';
  for (const poly of base.land.polygons) trace(poly, base.land.q);
  for (const lake of base.lakes.lakes) {
    ctx.fillStyle = lake.k === 'reservoir' ? '#00ffff' : '#00ff00';
    trace(lake.g, base.lakes.q);
  }
  const tex = new CanvasTexture(canvas);
  tex.flipY = false;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.minFilter = LinearFilter; // no mipmaps: avoids a seam where atan() wraps
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function buildElevationTexture(base: Basemap): DataTexture {
  const { width, height, data } = base.elevation;
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = DataUtils.toHalfFloat(data[i]);
  const tex = new DataTexture(half, width, height, RedFormat, HalfFloatType);
  tex.flipY = false;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const globeVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    vN = normalize(position);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const globeFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uElev;
  uniform sampler2D uMask;
  uniform vec2 uElevSize;
  uniform vec3 uSun;
  uniform float uNight;      // 0 = follow sun, 1 = full night palette
  uniform float uIntensity;  // overall visual intensity 0..1
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vWorld;

  const float PI = 3.141592653589793;

  vec2 elevUv(float lon, float lat) {
    // node-registered grid: row 0 = 90N, col 0 = 180W
    float cell = 360.0 / uElevSize.x;
    return vec2(((lon + 180.0) / cell + 0.5) / uElevSize.x, ((90.0 - lat) / cell + 0.5) / uElevSize.y);
  }

  void main() {
    vec3 n = normalize(vN);
    float lat = degrees(asin(clamp(n.y, -1.0, 1.0)));
    float lon = degrees(atan(n.x, n.z));
    vec2 uvE = elevUv(lon, lat);
    vec2 uvM = vec2((lon + 180.0) / 360.0, (90.0 - lat) / 180.0);
    vec2 tx = 1.0 / uElevSize;

    float h  = texture2D(uElev, uvE).r;
    float hE = texture2D(uElev, uvE + vec2(tx.x, 0.0)).r;
    float hW = texture2D(uElev, uvE - vec2(tx.x, 0.0)).r;
    float hN = texture2D(uElev, uvE - vec2(0.0, tx.y)).r;
    float hS = texture2D(uElev, uvE + vec2(0.0, tx.y)).r;
    vec4 mask = texture2D(uMask, uvM);
    // Sharpen the bilinear mask edge; crisp vector coastlines are drawn on top (Coastlines.ts).
    float land = smoothstep(0.25, 0.75, mask.r);
    float lake = smoothstep(0.25, 0.75, max(mask.g, mask.b));

    // Relief normal in the local east/north/up frame. Grid spacing ~18.5 km * cos(lat) east-west.
    float spacing = 18500.0;
    float cl = max(cos(radians(lat)), 0.05);
    float exag = mix(10.0, 14.0, land);
    vec3 grad = vec3(-(hE - hW) / (2.0 * spacing * cl), -(hN - hS) / (2.0 * spacing), 1.0 / exag);
    vec3 up = n;
    vec3 east = normalize(vec3(cos(radians(lon)), 0.0, -sin(radians(lon))));
    vec3 north = cross(up, east);
    vec3 N = normalize(east * grad.x + north * grad.y + up * grad.z);

    // Palette
    float depth = clamp(-h / 6000.0, 0.0, 1.0);
    vec3 ocean = mix(vec3(0.035, 0.12, 0.17), vec3(0.008, 0.025, 0.055), pow(depth, 0.6));
    float e = clamp(h / 4000.0, 0.0, 1.0);
    vec3 lowland = vec3(0.10, 0.125, 0.11);
    vec3 upland = vec3(0.19, 0.175, 0.15);
    vec3 alpine = vec3(0.42, 0.41, 0.40);
    vec3 terrain = mix(lowland, upland, smoothstep(0.0, 0.45, e));
    terrain = mix(terrain, alpine, smoothstep(0.55, 1.0, e));
    vec3 water = vec3(0.04, 0.20, 0.27);
    vec3 albedo = mix(ocean, terrain, land);
    albedo = mix(albedo, water, lake * land);

    // Lighting
    vec3 sun = normalize(uSun);
    float dayRaw = smoothstep(-0.12, 0.22, dot(up, sun));
    float day = mix(dayRaw, 0.0, uNight);
    float diffuse = max(dot(N, sun), 0.0);
    float moon = 0.16 + 0.22 * max(dot(N, normalize(vec3(-0.4, 0.7, 0.6))), 0.0);
    vec3 nightTint = vec3(0.55, 0.68, 1.0);
    vec3 lit = albedo * (diffuse * 1.05 * day + (1.0 - day) * moon * nightTint * 0.9 + 0.035);

    // Ocean sun glint (day side only)
    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 hv = normalize(sun + viewDir);
    // Broad, soft sheen rather than a hot spot (a hot spot blooms into a blob).
    float spec = pow(max(dot(up, hv), 0.0), 40.0) * (1.0 - land + lake * land) * day;
    lit += vec3(0.75, 0.82, 0.85) * spec * 0.06;

    // Lakes and reservoirs glow softly at night — water is the subject.
    float shimmer = 0.85 + 0.15 * sin(uTime * 0.6 + lon * 3.0 + lat * 2.0);
    lit += vec3(0.08, 0.42, 0.55) * lake * land * (1.0 - day * 0.8) * 0.55 * shimmer * uIntensity;

    // Rim
    float fres = pow(1.0 - max(dot(up, viewDir), 0.0), 5.0);
    lit += vec3(0.20, 0.45, 0.75) * fres * (0.12 + 0.3 * day);

    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
  }
`;

const atmoFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform float uNight;
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    // Closest approach of the view ray to the globe centre: 1.0 at the limb, 1.045 at the
    // shell's edge. Glow is brightest hugging the limb and fades smoothly to nothing.
    vec3 rd = normalize(vWorld - cameraPosition);
    float tc = -dot(cameraPosition, rd);
    float d = length(cameraPosition + rd * max(tc, 0.0));
    float a = pow(smoothstep(1.045, 1.0, d), 2.2);
    float day = mix(smoothstep(-0.3, 0.4, dot(normalize(vN), normalize(uSun))), 0.0, uNight);
    vec3 col = mix(vec3(0.10, 0.22, 0.45), vec3(0.35, 0.65, 1.0), day);
    gl_FragColor = vec4(col * a * (0.35 + 0.4 * day), a);
  }
`;

export class Globe {
  readonly mesh: Mesh;
  readonly atmosphere: Mesh;
  private material: ShaderMaterial;
  private atmoMaterial: ShaderMaterial;

  constructor(base: Basemap) {
    this.material = new ShaderMaterial({
      vertexShader: globeVertex,
      fragmentShader: globeFragment,
      uniforms: {
        uElev: { value: buildElevationTexture(base) },
        uMask: { value: buildMaskTexture(base) },
        uElevSize: { value: [base.elevation.width, base.elevation.height] },
        uSun: { value: new Vector3(1, 0, 0) },
        uNight: { value: 0 },
        uIntensity: { value: 1 },
        uTime: { value: 0 },
      },
      side: FrontSide,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 256, 128), this.material);
    this.mesh.name = 'globe';

    this.atmoMaterial = new ShaderMaterial({
      vertexShader: globeVertex,
      fragmentShader: atmoFragment,
      uniforms: { uSun: this.material.uniforms.uSun, uNight: this.material.uniforms.uNight },
      side: BackSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.atmosphere = new Mesh(new SphereGeometry(1.045, 96, 48), this.atmoMaterial);
    this.atmosphere.renderOrder = 1;
    this.atmosphere.name = 'atmosphere';
  }

  set sun(v: Vector3) { (this.material.uniforms.uSun.value as Vector3).copy(v); }
  set night(v: number) { this.material.uniforms.uNight.value = v; }
  get night() { return this.material.uniforms.uNight.value as number; }
  set intensity(v: number) { this.material.uniforms.uIntensity.value = v; }
  update(t: number) { this.material.uniforms.uTime.value = t; }
}
