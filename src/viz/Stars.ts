// Decorative starfield (not data). Deterministic so screenshots are reproducible.

import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from 'three';

export function createStars(count = 2600, seed = 7): Points {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pos = new Float32Array(count * 3), mag = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1, t = rand() * Math.PI * 2, r = 60;
    const c = Math.sqrt(1 - u * u);
    pos.set([r * c * Math.cos(t), r * u, r * c * Math.sin(t)], i * 3);
    mag[i] = Math.pow(rand(), 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aMag', new Float32BufferAttribute(mag, 1));
  const m = new ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aMag;
      uniform float uPixelRatio;
      varying float vMag;
      void main() {
        vMag = aMag;
        gl_PointSize = (0.8 + aMag * 2.2) * uPixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying float vMag;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, r) * (0.18 + vMag * 0.6) * uIntensity;
        gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * a, a);
      }`,
    uniforms: { uPixelRatio: { value: 1 }, uIntensity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const p = new Points(g, m);
  p.name = 'stars';
  return p;
}
