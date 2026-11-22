// Restrained HTML overlay: caption, provenance status, About (sources & limitations),
// Settings, and a detail card for a gauge, a volunteer report or an aquifer. All text is set
// with textContent or escaped.

import { SOURCES, PROVISIONAL_STATEMENT_URL } from '../data/registry.ts';
import type { GaugeReading, GaugeSnapshot, ParameterCode } from '../data/types.ts';
import { LAYERS, type SecondaryLayerId } from '../data/layers.ts';
import { siteUrl } from '../data/usgs.ts';
import { COCORAHS_DATA_POLICY, COCORAHS_HOME, COCORAHS_JOIN, hasPrecip } from '../data/cocorahs.ts';
import { ROCK_COLORS, rockCss, type AquiferHit } from '../geo/aquifers.ts';
import { openExternal } from '../platform/index.ts';
import { escapeHtml, formatValue, modeLabel, observedLabel, relative, utc, valueMeaning } from './format.ts';
import type { Settings } from './settings.ts';
import { contributionLine, panelHtml, type BoincStatus } from '../volunteer/boinc.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const n = (v: number) => v.toLocaleString('en-US');
const ext = (href: string, text: string) => `<a data-ext href="${escapeHtml(href)}">${escapeHtml(text)} ↗</a>`;

/** Which layer a reading belongs to, by what it measures. */
const LAYER_OF: Record<ParameterCode, keyof typeof LAYERS> = {
  '00060': 'discharge', '00045': 'precipitation', '62614': 'lake-level', '62615': 'lake-level',
  '72019': 'groundwater', 'CCR-PRCP24': 'cocorahs',
};

const SETTING_OF: Record<SecondaryLayerId, keyof Settings> = {
  precipitation: 'showRain', 'lake-level': 'showLakes', groundwater: 'showGroundwater', cocorahs: 'showCocorahs',
};

const COCORAHS_CREDIT = `Data: ${ext(COCORAHS_HOME, 'CoCoRaHS')} (Community Collaborative Rain, Hail and Snow Network), © Colorado Climate Center, ${ext('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0')}. Station locations rounded to about 1 km by this app.`;

/** One status-bar chip per secondary layer. */
function chipText(id: SecondaryLayerId, s: GaugeSnapshot): string {
  const total = n(s.readings.length);
  switch (id) {
    case 'precipitation': return `Rain in latest interval at ${n(s.readings.filter((r) => r.value > 0).length)} of ${total} rain gauges`;
    case 'lake-level': return `${total} lake & reservoir level gauges`;
    case 'groundwater': return `${total} groundwater wells`;
    case 'cocorahs': return `Volunteers reported rain at ${n(s.readings.filter(hasPrecip).length)} of ${total} stations (24 h)`;
  }
}

const DOT_CLASS: Record<SecondaryLayerId, string> = { precipitation: 'rain', 'lake-level': 'lake', groundwater: 'well', cocorahs: 'daily' };

export class Overlay {
  onSettings: (s: Settings) => void = () => {};
  onClearCache: () => void = () => {};
  onToggleMode: () => void = () => {};
  private snapshot: GaugeSnapshot | null = null;
  private notice: string | null = null;
  /** Secondary layers. null snapshot = nothing honest to show. */
  private layers: Partial<Record<SecondaryLayerId, { snapshot: GaugeSnapshot | null; notice: string | null }>> = {};
  private captionTimer = 0;
  private boinc: BoincStatus | null = null;
  private aquiferCount = 0;

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

  setLayer(id: SecondaryLayerId, snapshot: GaugeSnapshot | null, notice: string | null) {
    this.layers[id] = { snapshot, notice };
    this.renderStatus();
    this.renderAbout();
  }

  /** Number of principal aquifers bundled (0 = file missing); used in About. */
  setAquiferCount(count: number) {
    this.aquiferCount = count;
    this.renderAbout();
  }

  private renderLayerStatus() {
    const primaryMode = this.snapshot?.mode;
    const chip = (id: SecondaryLayerId) => {
      const l = this.layers[id];
      if (!this.settings[SETTING_OF[id]] || !l?.snapshot) return '';
      const s = l.snapshot;
      // Only repeat the mode badge when it differs from the primary layer's.
      const badge = s.mode !== primaryMode
        ? `<span class="badge small ${s.mode}">${escapeHtml(modeLabel(s.mode))}</span> ` : '';
      const obs = s.observedRange ? ` · ${escapeHtml(observedLabel(s).replace(/^observed /, 'obs. '))}` : '';
      return `<span>${badge}<span class="dot dot-${DOT_CLASS[id]}"></span>${escapeHtml(chipText(id, s))}${obs}</span>`;
    };
    const parts = (['precipitation', 'cocorahs', 'lake-level', 'groundwater'] as const).map(chip).filter(Boolean);
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
      `<span>USGS streamflow · ${n(s.readings.length)} gauges</span>`,
      `<span>${escapeHtml(observedLabel(s))}</span>`,
      `<span>retrieved ${escapeHtml(s.mode === 'archived' ? utc(s.provenance.retrievedAt) : relative(s.provenance.retrievedAt))}</span>`,
    ];
    const provisional = s.readings.some((r) => r.approval === 'Provisional');
    if (provisional) parts.push('<span class="muted">mostly provisional</span>');
    el.innerHTML = parts.join('<span class="sep">·</span>');
    $('#notice').textContent = [this.notice, ...Object.values(this.layers).map((l) => l?.notice)].filter(Boolean).join(' ');
  }

  /** Volunteer computing: refresh the settings panel and the optional status-bar line. */
  setBoinc(s: BoincStatus) {
    const panelChanged = JSON.stringify(s) !== JSON.stringify(this.boinc);
    this.boinc = s;
    // Don't rebuild the panel while the user might be clicking a link in it.
    if (panelChanged) $('#boinc-panel').innerHTML = panelHtml(s);
    this.renderBoincLine();
  }

  private renderBoincLine() {
    const line = this.settings.showContribution && this.boinc ? contributionLine(this.boinc) : null;
    $('#status-boinc').innerHTML = line ? `<span class="dot dot-boinc"></span><span>${escapeHtml(line)}</span>` : '';
  }

  private openCard(html: string) {
    const el = $('#card');
    el.innerHTML = `<button class="x" data-close-card aria-label="Close">×</button>${html}`;
    el.hidden = false;
    el.querySelector('[data-close-card]')?.addEventListener('click', () => (el.hidden = true));
  }

  showCard(r: GaugeReading | null) {
    if (!r) { $('#card').hidden = true; return; }
    const layer = LAYER_OF[r.param];
    const snap = layer === 'discharge' ? this.snapshot : this.layers[layer]?.snapshot ?? null;
    const retrieved = `<dt>Retrieved</dt><dd>${escapeHtml(snap ? `${utc(snap.provenance.retrievedAt)} (${modeLabel(snap.mode)})` : '—')}</dd>`;
    if (r.param === 'CCR-PRCP24') {
      this.openCard(`
        <div class="k">CoCoRaHS ${escapeHtml(r.id)}${r.name ? ` · ${escapeHtml(r.name)}` : ''}</div>
        <div class="v">${escapeHtml(formatValue(r))}</div>
        <dl>
          <dt>Measures</dt><dd>${escapeHtml(valueMeaning(r.param))}</dd>
          <dt>Kind</dt><dd>Volunteer observation, as submitted (CoCoRaHS may correct reports later)</dd>
          <dt>Observed</dt><dd>${escapeHtml(utc(r.observedAt))} (end of the 24 hours)</dd>
          ${retrieved}
          <dt>Location</dt><dd>Rounded to about 1 km for the volunteer's privacy</dd>
        </dl>
        <p class="small">${COCORAHS_CREDIT}</p>`);
      return;
    }
    const kind = r.kind === 'estimate' ? 'Estimate (flagged by USGS)' : 'Observation';
    this.openCard(`
      <div class="k">${escapeHtml(r.id)}</div>
      <div class="v">${escapeHtml(formatValue(r))}</div>
      <dl>
        <dt>Measures</dt><dd>${escapeHtml(valueMeaning(r.param))} · USGS parameter ${escapeHtml(r.param)}</dd>
        <dt>Kind</dt><dd>${escapeHtml(kind)}</dd>
        <dt>Status</dt><dd>${escapeHtml(r.approval)}</dd>
        <dt>Observed</dt><dd>${escapeHtml(utc(r.observedAt))}</dd>
        ${retrieved}
        ${r.qualifiers.length ? `<dt>Qualifiers</dt><dd>${escapeHtml(r.qualifiers.join(', '))}</dd>` : ''}
      </dl>
      <a data-ext href="${escapeHtml(siteUrl(r.id))}">View at USGS ↗</a>`);
  }

  /** Card for a click on land with no gauge nearby: the principal aquifer there, if any. */
  showAquiferCard(hit: AquiferHit | null, lon: number, lat: number) {
    const where = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
    const credit = `<p class="small">USGS (2003), Principal Aquifers of the United States, ${ext('https://doi.org/10.5066/P9Y2HOUJ', 'doi:10.5066/P9Y2HOUJ')}. A national map at 1:2,500,000: it shows regional patterns and can't say what lies under a particular property.</p>`;
    if (!hit) {
      this.openCard(`<div class="k">${escapeHtml(where)}</div><div class="v small-v">No principal aquifer mapped here</div>
        <p class="small">Either outside the mapped area (the 48 states, Hawaii, Puerto Rico and the U.S. Virgin Islands) or in rocks USGS maps as "other rocks". Local aquifers can still exist.</p>${credit}`);
      return;
    }
    this.openCard(`
      <div class="k">${escapeHtml(where)}</div>
      <div class="v small-v">${escapeHtml(hit.name)}</div>
      <dl>
        <dt>Rock type</dt><dd><span class="sw-inline" style="background:${rockCss(hit.rockType)}"></span>${escapeHtml(hit.rockName)}</dd>
        <dt>What it is</dt><dd>A principal aquifer: rock or sediment that holds and yields usable amounts of groundwater, mapped where it is the uppermost principal aquifer.</dd>
        <dt>Kind</dt><dd>Map (2003), not a measurement</dd>
      </dl>
      ${credit}`);
  }

  private renderAbout() {
    const statLine = (title: string, s: GaugeSnapshot | null | undefined) => s
      ? `<p class="small"><strong>${escapeHtml(title)}</strong> (${escapeHtml(modeLabel(s.mode))}, retrieved ${escapeHtml(utc(s.provenance.retrievedAt))}): ${n(s.stats.received)} records received, ${n(s.stats.accepted)} accepted. Not shown: ${
          Object.entries(s.stats.rejected).map(([k, v]) => `${escapeHtml(k)} (${n(v)})`).join(', ') || 'none'
        }. ${(s.provenance.requestUrls ?? [s.provenance.requestUrl]).map((u, i, all) => `<a data-ext href="${escapeHtml(u)}">Exact request${all.length > 1 ? ` ${i + 1}` : ''} ↗</a>`).join(' ')}</p>`
      : '';
    const stats = statLine(LAYERS.discharge.title, this.snapshot)
      + (['precipitation', 'cocorahs', 'lake-level', 'groundwater'] as const).map((id) => statLine(LAYERS[id].title, this.layers[id]?.snapshot)).join('');
    const rocks = Object.keys(ROCK_COLORS).map(Number).map((r) => `<span class="rock"><span class="sw-inline" style="background:${rockCss(r)}"></span>${escapeHtml(ROCK_NAMES[r] ?? String(r))}</span>`).join('');
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
      <p><strong>Where the Water Goes</strong> is an independent open-source project. It is not affiliated with or endorsed by USGS, NASA, NOAA, CoCoRaHS, or any agency, and it is <strong>not a forecast or warning service</strong>. For flood information, use your local National Weather Service office.</p>
      <h3>What you are seeing</h3>
      <ul class="legend-list">
        <li><span class="sw sw-gauge"></span><span><strong>Warm points</strong> are USGS stream gauges. Size ∝ log of discharge as published. A hollow ring means USGS flagged the value as estimated.</span></li>
        <li><span class="sw sw-rain"></span><span><strong>Blue ripples</strong> are USGS rain gauges whose most recent reporting interval (usually 5–15 minutes) recorded precipitation. Ripple size ∝ √(inches). Dry gauges are not drawn. This is point rainfall at gauges, not a radar map, and no rain is inferred between gauges.</span></li>
        <li><span class="sw sw-daily"></span><span><strong>Soft blue discs</strong> are CoCoRaHS volunteers' daily rain reports: rain and melted snow in the 24 hours before each volunteer's morning reading. Disc size ∝ √(inches); a trace is drawn smallest; dry reports are not drawn. Not live: these are reported once a day. Locations rounded to about 1 km.</span></li>
        <li><span class="sw sw-lakelevel"></span><span><strong>Teal markers</strong> are USGS lake and reservoir water-surface elevation gauges. All are the same size: elevation above a vertical datum (NGVD 29 or NAVD 88) is not depth and is not comparable between lakes. Click one in Explore mode for its value.</span></li>
        <li><span class="sw sw-well"></span><span><strong>Violet diamonds</strong> are USGS groundwater wells, shaded by depth from land surface to the water in the well: pale = near the surface, deep violet = hundreds of feet down. Depth is comparable between wells, but one well is one point: it does not describe a whole aquifer.</span></li>
        <li><span class="sw sw-aquifer"></span><span><strong>Tinted land</strong> shows USGS principal aquifers by rock type${this.aquiferCount ? ` (${this.aquiferCount} aquifers)` : ''}, from a 2003 national map at 1:2,500,000. Click the land in Explore mode to name the aquifer. <span class="rocks">${rocks}</span></span></li>
        <li><span class="sw sw-river"></span><span><strong>Blue lines</strong> are a cartographic river network. Their brightness shows river size class; the moving glints show inferred downstream direction. <em>They do not show measured or modeled flow.</em></span></li>
        <li><span class="sw sw-lake"></span><span><strong>Lakes and reservoirs</strong> from Natural Earth. Terrain and sea floor from NOAA ETOPO1.</span></li>
      </ul>
      <p class="small">Most recent USGS data are provisional and may be revised. <a data-ext href="${PROVISIONAL_STATEMENT_URL}">USGS Provisional Data Statement ↗</a></p>
      <p class="small">${COCORAHS_CREDIT} ${ext(COCORAHS_DATA_POLICY, 'Data usage policy')}</p>
      ${stats}
      <h3>Data sources</h3>
      ${rows}
      <h3>Volunteering</h3>
      <p class="small">Two ways to take part. <strong>Measure rain:</strong> CoCoRaHS volunteers read a rain gauge every morning, and their reports appear here the same day (${ext(COCORAHS_JOIN, 'join CoCoRaHS')}). <strong>Donate computer time:</strong> this app runs no computations itself. We did not find a water-data task that genuinely needs thousands of volunteer computers (see docs/VOLUNTEER_COMPUTING.md), so rather than invent one we point to <strong>BOINC</strong>, the open-source platform behind SETI@home. BOINC computes while your computer is idle; Settings shows its status, read locally and never sent anywhere.</p>`;
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
    for (const k of ['showGauges', 'showRain', 'showLakes', 'showGroundwater', 'showCocorahs', 'showAquifers', 'showCaptions', 'showContribution'] as const) set(k, s[k]);
    $('#cocorahs-panel').innerHTML = `
      <p class="small">The soft blue discs are reports from CoCoRaHS volunteers, who read a standard rain gauge in their yard every morning. Anyone in the U.S., Canada or the Bahamas can join; your report shows up on this globe the same day.</p>
      <p class="small">${ext(COCORAHS_JOIN, 'Join CoCoRaHS')} · ${ext(COCORAHS_HOME, 'cocorahs.org')} (the network is a non-profit and accepts donations there).</p>`;
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', () => {
      const fd = new FormData(form);
      const on = (k: string) => fd.get(k) === 'on';
      const next: Settings = {
        dataMode: fd.get('dataMode') === 'demo' ? 'demo' : 'auto',
        reducedMotion: (fd.get('reducedMotion') as Settings['reducedMotion']) ?? 'system',
        intensity: Number(fd.get('intensity')),
        lighting: fd.get('lighting') === 'night' ? 'night' : 'sun',
        quality: (fd.get('quality') as Settings['quality']) ?? 'auto',
        fpsCap: fd.get('fpsCap') === '60' ? 60 : 30,
        showGauges: on('showGauges'),
        showRain: on('showRain'),
        showLakes: on('showLakes'),
        showGroundwater: on('showGroundwater'),
        showCocorahs: on('showCocorahs'),
        showAquifers: on('showAquifers'),
        showCaptions: on('showCaptions'),
        showContribution: on('showContribution'),
      };
      this.settings = next;
      this.onSettings(next);
      this.renderStatus();
      this.renderBoincLine();
    });
    $('#btn-clear-cache').addEventListener('click', () => this.onClearCache());
  }
}

/** Short legend names for the six USGS rock types. */
const ROCK_NAMES: Record<number, string> = {
  100: 'Sand & gravel', 200: 'Semiconsolidated sand', 300: 'Sandstone', 400: 'Carbonate rock',
  500: 'Sandstone & carbonate', 600: 'Igneous & metamorphic',
};
