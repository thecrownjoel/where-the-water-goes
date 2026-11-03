// Restrained HTML overlay: caption, provenance status, About (sources & limitations),
// Settings, and a gauge detail card. All text is set with textContent or escaped.

import { SOURCES, PROVISIONAL_STATEMENT_URL } from '../data/registry.ts';
import type { GaugeReading, GaugeSnapshot } from '../data/types.ts';
import { LAYERS, type LayerId } from '../data/layers.ts';
import { siteUrl } from '../data/usgs.ts';
import { openExternal } from '../platform/index.ts';
import { escapeHtml, formatValue, modeLabel, observedLabel, relative, utc, valueMeaning } from './format.ts';
import type { Settings } from './settings.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export class Overlay {
  onSettings: (s: Settings) => void = () => {};
  onClearCache: () => void = () => {};
  onToggleMode: () => void = () => {};
  private snapshot: GaugeSnapshot | null = null;
  private notice: string | null = null;
  /** Secondary layers (rain, lake levels). null = nothing honest to show. */
  private layers: Partial<Record<LayerId, { snapshot: GaugeSnapshot | null; notice: string | null }>> = {};
  private captionTimer = 0;

  private settings: Settings;

  constructor(settings: Settings, saver: boolean) {
    this.settings = settings;
    document.body.classList.toggle('saver', saver);
    this.renderSettings();
    this.renderAbout();
    if (!saver) this.bindKeys();
    document.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a[data-ext]') as HTMLAnchorElement | null;
      if (a) { e.preventDefault(); void openExternal(a.href); }
      const close = (e.target as HTMLElement).closest('[data-close]');
      if (close) this.closePanels();
    });
    setTimeout(() => document.body.classList.add('settled'), 9000);
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'i') this.toggle('#about');
      else if (k === 's') this.toggle('#settings');
      else if (k === 't') this.onToggleMode();
      else if (k === 'escape') { this.closePanels(); this.showCard(null); }
    });
    $('#btn-about').addEventListener('click', () => this.toggle('#about'));
    $('#btn-settings').addEventListener('click', () => this.toggle('#settings'));
    $('#btn-mode').addEventListener('click', () => this.onToggleMode());
  }

  private toggle(sel: string) {
    const el = $(sel);
    const open = el.hidden;
    this.closePanels();
    el.hidden = !open;
    if (open) (el.querySelector('h2') as HTMLElement | null)?.focus();
  }

  openPanel(name: 'about' | 'settings') {
    this.closePanels();
    $(`#${name}`).hidden = false;
  }

  closePanels() {
    for (const p of document.querySelectorAll<HTMLElement>('.panel')) p.hidden = true;
  }

  setModeLabel(mode: 'tour' | 'explore') {
    const b = document.querySelector('#btn-mode');
    if (b) b.textContent = mode === 'tour' ? 'Explore' : 'Tour';
    document.body.classList.toggle('exploring', mode === 'explore');
  }

  caption(text: string) {
    const el = $('#caption');
    if (!this.settings.showCaptions) { el.classList.remove('show'); return; }
    el.classList.remove('show');
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => {
      el.textContent = text;
      el.classList.add('show');
    }, 600);
  }

  fade(opacity: number) {
    $('#fade').style.opacity = String(opacity);
  }

  setSnapshot(s: GaugeSnapshot, notice: string | null) {
    this.snapshot = s;
    this.notice = notice;
    this.renderStatus();
    this.renderAbout();
  }

  setLayer(id: Exclude<LayerId, 'discharge'>, snapshot: GaugeSnapshot | null, notice: string | null) {
    this.layers[id] = { snapshot, notice };
    this.renderStatus();
    this.renderAbout();
  }

  private renderLayerStatus() {
    const primaryMode = this.snapshot?.mode;
    const chip = (id: Exclude<LayerId, 'discharge'>, on: boolean) => {
      const l = this.layers[id];
      if (!on || !l?.snapshot) return '';
      const s = l.snapshot;
      // Only repeat the mode badge when it differs from the primary layer's.
      const badge = s.mode !== primaryMode
        ? `<span class="badge small ${s.mode}">${escapeHtml(modeLabel(s.mode))}</span> ` : '';
      const text = id === 'precipitation'
        ? `Rain in latest interval at ${s.readings.filter((r) => r.value > 0).length.toLocaleString('en-US')} of ${s.readings.length.toLocaleString('en-US')} rain gauges`
        : `${s.readings.length.toLocaleString('en-US')} lake & reservoir level gauges`;
      const obs = s.observedRange ? ` · ${escapeHtml(observedLabel(s).replace(/^observed /, 'obs. '))}` : '';
      return `<span>${badge}<span class="dot dot-${id === 'precipitation' ? 'rain' : 'lake'}"></span>${escapeHtml(text)}${obs}</span>`;
    };
    const parts = [chip('precipitation', this.settings.showRain), chip('lake-level', this.settings.showLakes)].filter(Boolean);
    $('#status-layers').innerHTML = parts.join('<span class="sep">·</span>');
  }

  renderStatus() {
    this.renderLayerStatus();
    const s = this.snapshot;
    const el = $('#status');
    if (!s) { el.textContent = 'Loading data…'; return; }
    el.dataset.mode = s.mode;
    const parts = [
      `<span class="badge">${escapeHtml(modeLabel(s.mode))}</span>`,
      `<span>USGS streamflow · ${s.readings.length.toLocaleString('en-US')} gauges</span>`,
      `<span>${escapeHtml(observedLabel(s))}</span>`,
      `<span>retrieved ${escapeHtml(s.mode === 'archived' ? utc(s.provenance.retrievedAt) : relative(s.provenance.retrievedAt))}</span>`,
    ];
    const provisional = s.readings.some((r) => r.approval === 'Provisional');
    if (provisional) parts.push('<span class="muted">mostly provisional</span>');
    el.innerHTML = parts.join('<span class="sep">·</span>');
    $('#notice').textContent = [this.notice, ...Object.values(this.layers).map((l) => l?.notice)].filter(Boolean).join(' ');
  }

  showCard(r: GaugeReading | null) {
    const el = $('#card');
    if (!r) { el.hidden = true; return; }
    const kind = r.kind === 'estimate' ? 'Estimate (flagged by USGS)' : 'Observation';
    const snap = r.param === '00060' ? this.snapshot
      : (r.param === '00045' ? this.layers.precipitation : this.layers['lake-level'])?.snapshot ?? null;
    el.innerHTML = `
      <button class="x" data-close-card aria-label="Close">×</button>
      <div class="k">${escapeHtml(r.id)}</div>
      <div class="v">${escapeHtml(formatValue(r))}</div>
      <dl>
        <dt>Measures</dt><dd>${escapeHtml(valueMeaning(r.param))} · USGS parameter ${escapeHtml(r.param)}</dd>
        <dt>Kind</dt><dd>${escapeHtml(kind)}</dd>
        <dt>Status</dt><dd>${escapeHtml(r.approval)}</dd>
        <dt>Observed</dt><dd>${escapeHtml(utc(r.observedAt))}</dd>
        <dt>Retrieved</dt><dd>${escapeHtml(snap ? `${utc(snap.provenance.retrievedAt)} (${modeLabel(snap.mode)})` : '—')}</dd>
        ${r.qualifiers.length ? `<dt>Qualifiers</dt><dd>${escapeHtml(r.qualifiers.join(', '))}</dd>` : ''}
      </dl>
      <a data-ext href="${escapeHtml(siteUrl(r.id))}">View at USGS ↗</a>`;
    el.hidden = false;
    el.querySelector('[data-close-card]')?.addEventListener('click', () => (el.hidden = true));
  }

  private renderAbout() {
    const statLine = (title: string, s: GaugeSnapshot | null | undefined) => s
      ? `<p class="small"><strong>${escapeHtml(title)}</strong> (${escapeHtml(modeLabel(s.mode))}, retrieved ${escapeHtml(utc(s.provenance.retrievedAt))}): ${s.stats.received.toLocaleString('en-US')} records received, ${s.stats.accepted.toLocaleString('en-US')} accepted. Not shown: ${
          Object.entries(s.stats.rejected).map(([k, v]) => `${escapeHtml(k)} (${v.toLocaleString('en-US')})`).join(', ') || 'none'
        }. <a data-ext href="${escapeHtml(s.provenance.requestUrl)}">Exact request ↗</a></p>`
      : '';
    const stats = statLine(LAYERS.discharge.title, this.snapshot)
      + statLine(LAYERS.precipitation.title, this.layers.precipitation?.snapshot)
      + statLine(LAYERS['lake-level'].title, this.layers['lake-level']?.snapshot);
    const rows = SOURCES.map((src) => `
      <details>
        <summary><span class="st st-${src.status}">${src.status}</span> ${escapeHtml(src.agency ?? 'Non-agency')} — ${escapeHtml(src.dataset)}</summary>
        <dl>
          <dt>Access</dt><dd>${escapeHtml(src.access)}</dd>
          <dt>Cadence</dt><dd>${escapeHtml(src.cadence)}</dd>
          <dt>Format</dt><dd>${escapeHtml(src.format)}</dd>
          <dt>Auth</dt><dd>${escapeHtml(src.auth)}</dd>
          <dt>Terms</dt><dd>${escapeHtml(src.terms)}</dd>
          <dt>Credit</dt><dd>${escapeHtml(src.attribution)}</dd>
          <dt>Limits</dt><dd><ul>${src.limitations.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul></dd>
          ${src.verify?.length ? `<dt>Unverified</dt><dd><ul>${src.verify.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul></dd>` : ''}
          <dt>Docs</dt><dd>${src.docs.map((d) => `<a data-ext href="${escapeHtml(d)}">${escapeHtml(d.replace(/^https:\/\//, ''))}</a>`).join('<br>')}</dd>
        </dl>
      </details>`).join('');
    $('#about-body').innerHTML = `
      <p><strong>Where the Water Goes</strong> is an independent open-source project. It is not affiliated with or endorsed by USGS, NASA, NOAA, or any agency, and it is <strong>not a forecast or warning service</strong>. For flood information, use your local National Weather Service office.</p>
      <h3>What you are seeing</h3>
      <ul class="legend-list">
        <li><span class="sw sw-gauge"></span><span><strong>Warm points</strong> are USGS stream gauges. Size ∝ log of discharge as published. A hollow ring means USGS flagged the value as estimated.</span></li>
        <li><span class="sw sw-rain"></span><span><strong>Blue ripples</strong> are USGS rain gauges whose most recent reporting interval (usually 5–15 minutes) recorded precipitation. Ripple size ∝ √(inches). Dry gauges are not drawn. This is point rainfall at gauges, not a radar map, and no rain is inferred between gauges.</span></li>
        <li><span class="sw sw-lakelevel"></span><span><strong>Teal markers</strong> are USGS lake and reservoir water-surface elevation gauges. All are the same size: elevation above a vertical datum (NGVD 29 or NAVD 88) is not depth and is not comparable between lakes. Click one in Explore mode for its value.</span></li>
        <li><span class="sw sw-river"></span><span><strong>Blue lines</strong> are a cartographic river network. Their brightness shows river size class; the moving glints show inferred downstream direction. <em>They do not show measured or modeled flow.</em></span></li>
        <li><span class="sw sw-lake"></span><span><strong>Lakes and reservoirs</strong> from Natural Earth. Terrain and sea floor from NOAA ETOPO1.</span></li>
      </ul>
      <p class="small">Most recent USGS data are provisional and may be revised. <a data-ext href="${PROVISIONAL_STATEMENT_URL}">USGS Provisional Data Statement ↗</a></p>
      ${stats}
      <h3>Data sources</h3>
      ${rows}
      <h3>Volunteer computing</h3>
      <p class="small">Not available in this version. We have not yet identified a research task that genuinely needs distributed volunteer computers and can be independently validated. Rather than invent one, this feature stays off. See docs/VOLUNTEER_COMPUTING.md.</p>`;
  }

  private renderSettings() {
    const s = this.settings;
    const form = $('#settings-form') as HTMLFormElement;
    const set = (name: string, value: string | boolean) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) return;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value);
      else el.value = String(value);
    };
    set('dataMode', s.dataMode);
    set('reducedMotion', s.reducedMotion);
    set('intensity', String(s.intensity));
    set('lighting', s.lighting);
    set('quality', s.quality);
    set('fpsCap', String(s.fpsCap));
    set('showGauges', s.showGauges);
    set('showRain', s.showRain);
    set('showLakes', s.showLakes);
    set('showCaptions', s.showCaptions);
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', () => {
      const fd = new FormData(form);
      const next: Settings = {
        dataMode: fd.get('dataMode') === 'demo' ? 'demo' : 'auto',
        reducedMotion: (fd.get('reducedMotion') as Settings['reducedMotion']) ?? 'system',
        intensity: Number(fd.get('intensity')),
        lighting: fd.get('lighting') === 'night' ? 'night' : 'sun',
        quality: (fd.get('quality') as Settings['quality']) ?? 'auto',
        fpsCap: fd.get('fpsCap') === '60' ? 60 : 30,
        showGauges: fd.get('showGauges') === 'on',
        showRain: fd.get('showRain') === 'on',
        showLakes: fd.get('showLakes') === 'on',
        showCaptions: fd.get('showCaptions') === 'on',
      };
      this.settings = next;
      this.onSettings(next);
      this.renderStatus();
    });
    $('#btn-clear-cache').addEventListener('click', () => this.onClearCache());
  }
}
