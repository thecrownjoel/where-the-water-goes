// Cinematic camera. The camera is described by a focus point on the globe (lat, lon), an
// altitude above it (globe radii) and a tilt toward the horizon. GSAP tweens these values.
//
// Reduced motion: no flights. Each stop is reached by a fade-through-black cut and the
// camera holds still, with only a very slow drift disabled entirely.

import gsap from 'gsap';
import { PerspectiveCamera, Vector3 } from 'three';
import { tangentFrame, lonLatToVec3 } from './coords.ts';

export interface CameraState { lat: number; lon: number; alt: number; tilt: number }

export interface Stop extends CameraState {
  title: string;
  /** Seconds to hold once arrived. */
  hold: number;
}

// Captions are place names only; no statistics that could go stale or be wrong.
export const TOUR: Stop[] = [
  { title: 'The contiguous United States', lat: 38.5, lon: -97, alt: 1.55, tilt: 0.15, hold: 16 },
  { title: 'Mississippi River Basin', lat: 37.5, lon: -91, alt: 0.62, tilt: 0.55, hold: 18 },
  { title: 'The Great Lakes', lat: 44.5, lon: -84.5, alt: 0.42, tilt: 0.6, hold: 16 },
  { title: 'Chesapeake Bay watershed', lat: 39.2, lon: -77.2, alt: 0.24, tilt: 0.65, hold: 14 },
  { title: 'Rio Grande', lat: 31.5, lon: -104.5, alt: 0.42, tilt: 0.55, hold: 14 },
  { title: 'Colorado River Basin', lat: 37, lon: -111.5, alt: 0.38, tilt: 0.62, hold: 16 },
  { title: 'Columbia River Basin', lat: 46, lon: -119, alt: 0.4, tilt: 0.58, hold: 16 },
  { title: 'Yukon River, Alaska', lat: 64, lon: -153, alt: 0.6, tilt: 0.45, hold: 14 },
  { title: 'Earth', lat: 22, lon: -75, alt: 2.4, tilt: 0.0, hold: 20 },
];

export function applyCameraState(camera: PerspectiveCamera, s: CameraState) {
  const f = tangentFrame(s.lon, s.lat);
  const focus = lonLatToVec3(s.lon, s.lat, 1);
  const offset = new Vector3()
    .addScaledVector(f.up, Math.cos(s.tilt))
    .addScaledVector(f.north, -Math.sin(s.tilt))
    .multiplyScalar(s.alt);
  camera.position.copy(focus).add(offset);
  camera.up.copy(f.north).addScaledVector(f.up, Math.sin(s.tilt)).normalize();
  camera.lookAt(focus);
}

/** Shortest-path longitude target relative to the current value (for tweening). */
export function unwrapLon(from: number, to: number): number {
  let d = ((to - from + 540) % 360) - 180;
  if (d === -180) d = 180;
  return from + d;
}

export class Director {
  readonly state: CameraState;
  private tl: gsap.core.Timeline | null = null;
  private index = 0;
  private reduced = false;
  /** Stops derived from current data (e.g. where rain is falling), inserted after the first stop. */
  private dynamic: Stop[] = [];
  onStop: (stop: Stop) => void = () => {};
  onFade: (opacity: number) => void = () => {};

  constructor(initial: CameraState = TOUR[0]) {
    this.state = { lat: initial.lat, lon: initial.lon, alt: initial.alt, tilt: initial.tilt };
  }

  get tour(): Stop[] {
    return [TOUR[0], ...this.dynamic, ...TOUR.slice(1)];
  }

  /** Replace the data-driven stops. Takes effect from the next flight; never interrupts one. */
  setDynamicStops(stops: Stop[]) {
    const before = this.tour.length;
    this.dynamic = stops;
    // Keep the index pointing at the same fixed stop when the list length changes.
    if (this.index > 0) this.index = Math.max(0, this.index + this.tour.length - before);
  }

  start(reducedMotion: boolean, startIndex = 0) {
    this.stop();
    this.reduced = reducedMotion;
    this.index = startIndex % this.tour.length;
    const first = this.tour[this.index];
    Object.assign(this.state, { lat: first.lat, lon: first.lon, alt: first.alt, tilt: first.tilt });
    this.onStop(first);
    this.scheduleNext(first.hold);
  }

  stop() {
    this.tl?.kill();
    this.tl = null;
  }

  pause() { this.tl?.pause(); }
  resume() { this.tl?.resume(); }
  get paused() { return this.tl?.paused() ?? true; }

  private scheduleNext(hold: number) {
    const tl = gsap.timeline();
    this.tl = tl;
    if (!this.reduced) {
      // Gentle drift while holding: a slow eastward glide and a breath of altitude.
      tl.to(this.state, { lon: this.state.lon + 3, alt: this.state.alt * 0.94, duration: hold, ease: 'sine.inOut' });
    } else {
      tl.to({}, { duration: hold });
    }
    tl.call(() => this.advance());
  }

  private advance() {
    const tour = this.tour;
    this.index = (this.index + 1) % tour.length;
    const next = tour[this.index];
    const tl = gsap.timeline();
    this.tl = tl;
    if (this.reduced) {
      const fade = { o: 0 };
      tl.to(fade, { o: 1, duration: 1.2, ease: 'power1.in', onUpdate: () => this.onFade(fade.o) });
      tl.call(() => {
        Object.assign(this.state, { lat: next.lat, lon: next.lon, alt: next.alt, tilt: next.tilt });
        this.onStop(next);
      });
      tl.to(fade, { o: 0, duration: 1.2, ease: 'power1.out', onUpdate: () => this.onFade(fade.o) });
    } else {
      const lon = unwrapLon(this.state.lon, next.lon);
      const dist = Math.hypot(lon - this.state.lon, next.lat - this.state.lat);
      const duration = Math.min(14, 6 + dist * 0.12);
      // Rise up and out during long flights, then settle in: reads as a single breath.
      const peak = Math.max(this.state.alt, next.alt, Math.min(2.2, 0.5 + dist * 0.025));
      tl.to(this.state, { lat: next.lat, lon, duration, ease: 'sine.inOut' }, 0);
      tl.to(this.state, { tilt: 0.1, duration: duration * 0.4, ease: 'sine.inOut' }, 0);
      tl.to(this.state, { tilt: next.tilt, duration: duration * 0.6, ease: 'sine.inOut' }, duration * 0.4);
      tl.to(this.state, { alt: peak, duration: duration * 0.45, ease: 'sine.inOut' }, 0);
      tl.to(this.state, { alt: next.alt, duration: duration * 0.55, ease: 'sine.inOut' }, duration * 0.45);
      tl.call(() => this.onStop(next), [], duration * 0.7);
    }
    tl.call(() => {
      this.state.lon = ((this.state.lon + 540) % 360) - 180;
      this.scheduleNext(next.hold);
    });
  }
}
