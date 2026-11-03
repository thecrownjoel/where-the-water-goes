// Entry point: wires settings, data, visualization, overlay and platform together.

import './styles.css';
import { loadBasemap } from './viz/assets.ts';
import { Scene, detectQuality, rendererName, type VisualSettings } from './viz/Scene.ts';
import { Overlay } from './ui/Overlay.ts';
import { loadSettings, saveSettings, prefersReducedMotion, type Settings } from './ui/settings.ts';
import { createCache, purgeExpired } from './data/cache.ts';
import { loadLayer } from './data/provider.ts';
import { decodeSnapshot } from './data/archive.ts';
import { LAYERS, type LayerSpec } from './data/layers.ts';
import type { GaugeSnapshot } from './data/types.ts';
import { rainFocus } from './viz/focus.ts';
import { armSaverExit, diag, embeddedHost, exitSaver, isPreviewPane, launchMode, powerState } from './platform/index.ts';

async function loadArchived(layer: LayerSpec = LAYERS.discharge) {
  const res = await fetch(`${import.meta.env.BASE_URL}${layer.archivePath}`);
  if (!res.ok) throw new Error(`archived snapshot missing: ${layer.archivePath}`);
  return decodeSnapshot(await res.json());
}

async function boot() {
  const launch = launchMode();
  const saver = launch === 'saver';
  // The System Settings preview pane is a ~300 px thumbnail: text there is unreadable, so it
  // shows only the globe and its marks, with no text; the full-size saver carries the status line.
  const previewPane = isPreviewPane();
  if (previewPane) document.documentElement.classList.add('preview-pane');
  let settings = loadSettings();
  const overlay = new Overlay(settings, saver);
  const canvas = document.querySelector('#globe') as HTMLCanvasElement;

  const base = await loadBasemap();
  let autoQuality: 'high' | 'low' = 'high';
  let onBattery = false;
  const visual = (s: Settings): VisualSettings => ({
    intensity: s.intensity,
    reducedMotion: prefersReducedMotion(s),
    lighting: s.lighting,
    // On battery, "auto" quality drops to low and the frame rate to 30 fps.
    quality: previewPane ? 'low' : s.quality === 'auto' ? (onBattery ? 'low' : autoQuality) : s.quality,
    fpsCap: onBattery && s.quality === 'auto' ? 30 : s.fpsCap,
    showGauges: s.showGauges,
    showRain: s.showRain,
    showLakes: s.showLakes,
  });
  const scene = new Scene(canvas, base, visual(settings));
  autoQuality = detectQuality(scene.renderer);
  scene.applySettings(visual(settings));

  let mode: 'tour' | 'explore' = 'tour';
  scene.director.onStop = (stop) => overlay.caption(stop.title);
  scene.director.onFade = (o) => overlay.fade(o);
  scene.setMode(mode);
  overlay.setModeLabel(mode);
  // Dev builds only: expose the scene for headless visual checks (scripts/screenshot.mjs).
  if (import.meta.env.DEV) (window as unknown as { __wtrshd: unknown }).__wtrshd = { scene };
  scene.startLoop();
  document.body.classList.add('ready');

  overlay.onToggleMode = () => {
    mode = mode === 'tour' ? 'explore' : 'tour';
    scene.setMode(mode);
    overlay.setModeLabel(mode);
    if (mode === 'explore') overlay.caption('Explore · drag to rotate · scroll to zoom · click a gauge');
  };
  canvas.addEventListener('click', (e) => {
    if (mode !== 'explore') return;
    overlay.showCard(scene.pick(e.clientX, e.clientY));
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    scene.applySettings(visual(settings));
    if (mode === 'tour') scene.setMode('tour');
  });

  // Data
  const cache = createCache();
  await purgeExpired(cache, LAYERS.discharge.maxCacheAgeMs).catch(() => 0);
  const providerOpts = { cache, loadArchived };
  // A tour stop over the largest cluster of gauges currently recording rain, if any.
  const updateRainStop = (snap: GaugeSnapshot | null) => {
    const f = snap && settings.showRain ? rainFocus(snap.readings) : null;
    scene.director.setDynamicStops(f ? [{
      title: snap!.mode === 'archived' ? 'Rain at USGS gauges · archived snapshot' : 'Rain recorded at USGS gauges',
      lat: f.lat, lon: f.lon, alt: 0.32, tilt: 0.6, hold: 14,
    }] : []);
  };
  const refreshDischarge = async () => {
    const { snapshot, notice } = await loadLayer(LAYERS.discharge, settings.dataMode, providerOpts);
    // The discharge layer always falls back to the archive, so a snapshot is always present.
    if (!snapshot) return;
    scene.gauges.setReadings(snapshot.readings);
    overlay.setSnapshot(snapshot, notice);
  };
  const refreshSecondary = async (id: 'precipitation' | 'lake-level') => {
    const { snapshot, notice } = await loadLayer(LAYERS[id], settings.dataMode, providerOpts);
    (id === 'precipitation' ? scene.rain : scene.lakes).setReadings(snapshot?.readings ?? []);
    overlay.setLayer(id, snapshot, notice);
    if (id === 'precipitation') updateRainStop(snapshot);
  };
  const report = (what: string) => (e: unknown) => {
    console.error(`[wtrshd] ${what} load failed`, e);
    void diag(`${what} load failed: ${e instanceof Error ? e.message : String(e)}`);
  };
  const refresh = () => Promise.all([
    refreshDischarge().catch(report('discharge')),
    refreshSecondary('precipitation').catch(report('precipitation')),
    refreshSecondary('lake-level').catch(report('lake-level')),
  ]);
  await refresh();
  const f0 = scene.frames, t0 = scene.ticks;
  setTimeout(() => {
    void diag(`mode=${launch} renderer="${rendererName(scene.renderer)}" quality=${visual(settings).quality} ` +
      `fps≈${((scene.frames - f0) / 5).toFixed(1)} raf/s≈${((scene.ticks - t0) / 5).toFixed(1)} hidden=${document.hidden} rivers=${scene.rivers.segmentCount} rain=${scene.rain.count} lakes=${scene.lakes.count} ${document.querySelector('#status')?.textContent ?? ''}`);
  }, 5000);
  // Each layer refreshes on its own cadence; the provider serves cache until refetchMs passes.
  setInterval(() => void refreshDischarge().catch(report('discharge')), LAYERS.discharge.refetchMs);
  setInterval(() => void refreshSecondary('precipitation').catch(report('precipitation')), LAYERS.precipitation.refetchMs);
  setInterval(() => void refreshSecondary('lake-level').catch(report('lake-level')), LAYERS['lake-level'].refetchMs);
  setInterval(() => overlay.renderStatus(), 60_000);

  overlay.onSettings = (s) => {
    const dataChanged = s.dataMode !== settings.dataMode;
    const rainToggled = s.showRain !== settings.showRain;
    const motionChanged = prefersReducedMotion(s) !== prefersReducedMotion(settings);
    settings = s;
    saveSettings(s);
    scene.applySettings(visual(s));
    if (motionChanged && mode === 'tour') scene.setMode('tour');
    if (dataChanged) void refresh();
    else if (rainToggled) void refreshSecondary('precipitation').catch(report('precipitation'));
  };
  overlay.onClearCache = async () => {
    await cache.clear();
    const archived = await loadArchived();
    overlay.setSnapshot(archived, 'Cache cleared. Showing archived snapshot until the next refresh.');
    scene.gauges.setReadings(archived.readings);
    // Secondary layers have no archive fallback in live mode; hide them until the next refresh.
    for (const id of ['precipitation', 'lake-level'] as const) {
      if (settings.dataMode === 'demo') { void refreshSecondary(id); continue; }
      (id === 'precipitation' ? scene.rain : scene.lakes).setReadings([]);
      overlay.setLayer(id, null, null);
    }
  };

  if (new URLSearchParams(location.search).get('panel') === 'settings') overlay.openPanel('settings');

  // Battery awareness (native only; the browser build reports unknown).
  const checkPower = async () => {
    const p = await powerState().catch(() => ({ onBattery: null }));
    const next = p.onBattery === true;
    if (next !== onBattery) {
      onBattery = next;
      scene.applySettings(visual(settings));
    }
  };
  void checkPower();
  setInterval(() => void checkPower(), 60_000);

  // Inside the native macOS .saver the system host dismisses the screensaver itself.
  if (saver && !embeddedHost()) armSaverExit(() => void exitSaver());
}

boot().catch((e) => {
  console.error('[wtrshd] failed to start', e);
  void diag(`failed to start: ${e instanceof Error ? e.message : String(e)}`);
  const el = document.querySelector('#fatal');
  if (el) {
    el.textContent = `Could not start the visualization: ${e instanceof Error ? e.message : String(e)}. WebGL 2 is required.`;
    (el as HTMLElement).hidden = false;
  }
});
