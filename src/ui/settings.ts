// User settings. Stored locally only (localStorage), never transmitted.

export interface Settings {
  dataMode: 'auto' | 'demo';
  reducedMotion: 'system' | 'on' | 'off';
  intensity: number;
  lighting: 'sun' | 'night';
  quality: 'auto' | 'high' | 'low';
  fpsCap: 30 | 60;
  showGauges: boolean;
  showRain: boolean;
  showLakes: boolean;
  /** USGS groundwater wells (depth to water). */
  showGroundwater: boolean;
  /** CoCoRaHS volunteer 24-hour rain reports. */
  showCocorahs: boolean;
  /** USGS principal aquifers, tinted on the land. */
  showAquifers: boolean;
  showCaptions: boolean;
  /** Show this computer's BOINC contribution in the status bar (only when BOINC is running). */
  showContribution: boolean;
}

export const DEFAULTS: Settings = {
  dataMode: 'auto',
  reducedMotion: 'system',
  intensity: 0.85,
  lighting: 'sun',
  quality: 'auto',
  fpsCap: 30,
  showGauges: true,
  showRain: true,
  showLakes: true,
  showGroundwater: true,
  showCocorahs: true,
  showAquifers: true,
  showCaptions: true,
  showContribution: true,
};

const KEY = 'wtrshd.settings.v1';

/** Validate untrusted stored settings field-by-field, falling back to defaults. */
export function sanitize(raw: unknown): Settings {
  const s = { ...DEFAULTS };
  if (typeof raw !== 'object' || raw === null) return s;
  const r = raw as Record<string, unknown>;
  if (r.dataMode === 'auto' || r.dataMode === 'demo') s.dataMode = r.dataMode;
  if (r.reducedMotion === 'system' || r.reducedMotion === 'on' || r.reducedMotion === 'off') s.reducedMotion = r.reducedMotion;
  if (typeof r.intensity === 'number' && Number.isFinite(r.intensity)) s.intensity = Math.min(1, Math.max(0.3, r.intensity));
  if (r.lighting === 'sun' || r.lighting === 'night') s.lighting = r.lighting;
  if (r.quality === 'auto' || r.quality === 'high' || r.quality === 'low') s.quality = r.quality;
  if (r.fpsCap === 30 || r.fpsCap === 60) s.fpsCap = r.fpsCap;
  if (typeof r.showGauges === 'boolean') s.showGauges = r.showGauges;
  if (typeof r.showRain === 'boolean') s.showRain = r.showRain;
  if (typeof r.showLakes === 'boolean') s.showLakes = r.showLakes;
  if (typeof r.showGroundwater === 'boolean') s.showGroundwater = r.showGroundwater;
  if (typeof r.showCocorahs === 'boolean') s.showCocorahs = r.showCocorahs;
  if (typeof r.showAquifers === 'boolean') s.showAquifers = r.showAquifers;
  if (typeof r.showCaptions === 'boolean') s.showCaptions = r.showCaptions;
  if (typeof r.showContribution === 'boolean') s.showContribution = r.showContribution;
  return s;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

export function prefersReducedMotion(s: Settings): boolean {
  if (s.reducedMotion === 'on') return true;
  if (s.reducedMotion === 'off') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
