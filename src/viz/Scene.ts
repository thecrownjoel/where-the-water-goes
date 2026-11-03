// Renderer, post-processing, frame pacing. Owns the layers; knows nothing about data sources.

import {
  ACESFilmicToneMapping, LineBasicMaterial, LineSegments, Color, PerspectiveCamera, Scene as ThreeScene, SRGBColorSpace, Vector2, Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Basemap } from './assets.ts';
import { Globe } from './Globe.ts';
import { Rivers } from './Rivers.ts';
import { Gauges } from './Gauges.ts';
import { createStars } from './Stars.ts';
import { createCoastlines } from './Coastlines.ts';
import { Director, applyCameraState } from './Director.ts';
import { lonLatToVec3, subsolarPoint } from './coords.ts';

export type Quality = 'high' | 'low';

export interface VisualSettings {
  intensity: number; // 0.3 .. 1
  reducedMotion: boolean;
  lighting: 'sun' | 'night';
  quality: Quality;
  fpsCap: number;
  showGauges: boolean;
  showRain: boolean;
  showLakes: boolean;
}

/** Detect software rendering (llvmpipe, SwiftShader…) and recommend low quality. */
export function rendererName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

export function detectQuality(renderer: WebGLRenderer): Quality {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|software|basic render/i.test(name) ? 'low' : 'high';
}

export class Scene {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly globe: Globe;
  readonly rivers: Rivers;
  readonly gauges: Gauges;
  readonly rain: Gauges;
  readonly lakes: Gauges;
  readonly director: Director;
  controls: OrbitControls | null = null;
  private scene = new ThreeScene();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private stars = createStars();
  private coast: LineSegments;
  private settings: VisualSettings;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private running = false;
  private mode: 'tour' | 'explore' = 'tour';
  /** Frames rendered since start; used for diagnostics. */
  frames = 0;
  /** requestAnimationFrame callbacks received (0 while the display is asleep or the window occluded). */
  ticks = 0;

  constructor(canvas: HTMLCanvasElement, base: Basemap, settings: VisualSettings) {
    this.settings = settings;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.scene.background = new Color(0x02040a);

    this.camera = new PerspectiveCamera(38, 1, 0.005, 200);
    this.globe = new Globe(base);
    this.rivers = new Rivers(base);
    this.gauges = new Gauges('discharge');
    this.rain = new Gauges('rain');
    this.lakes = new Gauges('lake');
    this.coast = createCoastlines(base);
    this.scene.add(this.stars, this.globe.mesh, this.globe.atmosphere, this.coast, this.rivers.mesh,
      this.gauges.mesh, this.lakes.mesh, this.rain.mesh);

    this.director = new Director();
    applyCameraState(this.camera, this.director.state);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.5, 0.45, 0.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.applySettings(settings);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.pauseLoop() : this.startLoop()));
  }

  applySettings(s: VisualSettings) {
    this.settings = s;
    const k = s.intensity;
    this.globe.intensity = k;
    (this.coast.material as LineBasicMaterial).opacity = 0.16 + 0.2 * k;
    this.rivers.intensity = 0.55 + 0.45 * k;
    const motion = s.reducedMotion ? 0 : 1;
    this.rivers.motion = motion;
    for (const g of this.markLayers) {
      g.intensity = 0.5 + 0.5 * k;
      g.motion = motion;
    }
    this.gauges.visible = s.showGauges;
    this.rain.visible = s.showRain;
    this.lakes.visible = s.showLakes;
    this.bloom.enabled = s.quality === 'high';
    this.bloom.strength = 0.2 + 0.35 * k;
    this.resize();
  }

  get markLayers(): Gauges[] {
    return [this.gauges, this.rain, this.lakes];
  }

  /** Nearest visible mark of any layer under a screen point. */
  pick(x: number, y: number) {
    let best: ReturnType<Gauges['pick']> = null;
    for (const g of this.markLayers) {
      if (!g.visible) continue;
      const hit = g.pick(x, y, innerWidth, innerHeight, this.camera);
      if (hit && (!best || hit.d2 < best.d2)) best = hit;
    }
    return best?.reading ?? null;
  }

  setMode(mode: 'tour' | 'explore') {
    this.mode = mode;
    if (mode === 'explore') {
      this.director.stop();
      if (!this.controls) {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = !this.settings.reducedMotion;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = 1.08;
        this.controls.maxDistance = 6;
        this.controls.rotateSpeed = 0.45;
        this.controls.zoomSpeed = 0.6;
      }
      this.controls.target.set(0, 0, 0);
      this.camera.up.set(0, 1, 0);
      this.controls.enabled = true;
      this.controls.update();
    } else {
      if (this.controls) this.controls.enabled = false;
      this.director.start(this.settings.reducedMotion);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality === 'high' ? 1.5 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.rivers.setResolution(w, h, dpr);
    (this.stars.material as unknown as { uniforms: Record<string, { value: number }> }).uniforms.uPixelRatio.value = dpr;
  }

  startLoop() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.ticks++;
      this.raf = requestAnimationFrame(tick);
      const minDt = 1000 / this.settings.fpsCap;
      const dt = now - this.last;
      if (dt < minDt - 1) return;
      this.last = now - (dt % minDt);
      this.clock += Math.min(dt, 100) / 1000;
      this.frame();
    };
    this.raf = requestAnimationFrame(tick);
  }

  pauseLoop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame() {
    this.frames++;
    const t = this.clock;
    // Real sun position; night palette blends it out.
    const sp = subsolarPoint(new Date());
    this.globe.sun = lonLatToVec3(sp.lon, sp.lat, 1, new Vector3());
    const night = this.settings.lighting === 'night' ? 1 : 0;
    this.globe.night = night;
    this.rivers.night = night;

    if (this.mode === 'tour') applyCameraState(this.camera, this.director.state);
    else this.controls?.update();

    const alt = this.camera.position.length() - 1;
    const scale = Math.min(1, Math.max(0.3, alt / 1.2));
    this.globe.update(t);
    this.rivers.update(t);
    for (const g of this.markLayers) {
      g.scale = scale;
      g.update(t);
    }
    if (this.bloom.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
