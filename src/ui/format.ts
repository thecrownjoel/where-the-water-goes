// Formatting helpers for provenance labels. Times are always shown in UTC with the zone
// stated, so screenshots are unambiguous.

import type { GaugeReading, GaugeSnapshot } from '../data/types.ts';

export function utc(iso: string, withDate = true): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'unknown time';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  if (!withDate) return `${hh}:${mm} UTC`;
  const date = d.toISOString().slice(0, 10);
  return `${date} ${hh}:${mm} UTC`;
}

export function relative(iso: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function modeLabel(mode: GaugeSnapshot['mode']): string {
  switch (mode) {
    case 'live': return 'Live';
    case 'cached': return 'Cached';
    case 'archived': return 'Archived snapshot · not live';
  }
}

export function observedLabel(s: GaugeSnapshot): string {
  if (!s.observedRange) return 'no observations';
  const [a, b] = s.observedRange;
  const sameDay = a.slice(0, 10) === b.slice(0, 10);
  return sameDay && s.mode !== 'archived'
    ? `observed ${utc(a, false)}–${utc(b, false)}`
    : `observed ${utc(a)} – ${utc(b)}`;
}

export function formatDischarge(v: number): string {
  const abs = Math.abs(v);
  const s = abs >= 1000 ? Math.round(v).toLocaleString('en-US') : abs >= 10 ? v.toFixed(0) : v.toPrecision(2);
  return `${s} ft³/s`;
}

/** A reading's value with its unit and, for elevations, its vertical datum. */
export function formatValue(r: Pick<GaugeReading, 'param' | 'value'>): string {
  switch (r.param) {
    case '00060': return formatDischarge(r.value);
    case '00045': return `${r.value.toFixed(2)} in`;
    case '62614': return `${r.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft (NGVD 29)`;
    case '62615': return `${r.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft (NAVD 88)`;
  }
}

/** What the number on a gauge card means, in words. */
export function valueMeaning(param: GaugeReading['param']): string {
  switch (param) {
    case '00060': return 'Discharge (streamflow)';
    case '00045': return 'Precipitation total for the gauge\'s latest reporting interval (interval length varies by gauge; most report every 5–15 min)';
    case '62614':
    case '62615': return 'Water-surface elevation above the stated vertical datum — not depth, and not comparable between lakes';
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
