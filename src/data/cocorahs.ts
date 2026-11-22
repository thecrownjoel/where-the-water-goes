// CoCoRaHS (Community Collaborative Rain, Hail and Snow Network) daily precipitation reports.
//
// Volunteers read a standard manual rain gauge once a day, usually around 7 AM local time. Each
// report is the 24-hour total ending at that reading, so unlike the USGS rain layer these totals
// are comparable between stations. They are not live: this is "rain in the 24 hours before this
// morning's reading".
//
// Access (checked 2026-11-22): the export behind CoCoRaHS's own Export Manager page. It is public
// and anonymous but not a documented API, so the app fetches politely: one report date per
// request, at most every 6 hours, cached locally (layers.ts).
//   https://data.cocorahs.org/export/exportreports.aspx?ReportType=Daily&dtf=3&TimesInGMT=True
//     &Format=CSV&ReportDateType=reportdate&Date=MM/DD/YYYY
// `Date` selects the observer's local report date. With TimesInGMT=True and dtf=3, the
// ObservationDate + ObservationTime columns are the observation instant in UTC (verified for
// evening reports that cross midnight UTC). A full national day is ~11,500 reports, ~620 KB
// gzipped. The server sends `access-control-allow-origin: *`.
//
// Terms: CC BY 4.0, © Colorado Climate Center (https://www.cocorahs.org/Content.aspx?page=datausagepolicy).
// Credit is shown in the About panel and NOTICE.
//
// Privacy: the published coordinates are volunteers' homes, to about a metre. CoCoRaHS tells
// volunteers their location is public, but this app rounds it to 0.01° (~1 km) while parsing and
// never stores the precise value.

import type { GaugeReading, ParseStats } from './types.ts';
import { PARAMETERS } from './usgs.ts';

export const COCORAHS_EXPORT_URL = 'https://data.cocorahs.org/export/exportreports.aspx';
export const COCORAHS_HOME = 'https://www.cocorahs.org/';
export const COCORAHS_JOIN = 'https://www.cocorahs.org/Content.aspx?page=application';
export const COCORAHS_DATA_POLICY = 'https://www.cocorahs.org/Content.aspx?page=datausagepolicy';

/** Coordinates are rounded to this many degrees (0.01° ≈ 1.1 km north–south). */
export const COORD_STEP = 0.01;

/**
 * Standard CoCoRaHS station numbers: state/province/country, county, sequence, e.g. MN-HN-635,
 * TX-BXR-15, CAN-ON-12, BHS-NP-5. The export also carries a few partner-network stations with
 * other ID formats (e.g. "lanc015"); their terms are not stated, so they are left out.
 */
const STATION_RE = /^[A-Z]{2,3}-[A-Z]{1,4}-\d{1,5}$/;

const REQUIRED = ['ObservationDate', 'ObservationTime', 'StationNumber', 'StationName', 'Latitude', 'Longitude', 'TotalPrecipAmt'] as const;

/** The export URL for one local report date. */
export function cocorahsUrl(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const params = new URLSearchParams({
    ReportType: 'Daily',
    dtf: '3',
    TimesInGMT: 'True',
    Format: 'CSV',
    ReportDateType: 'reportdate',
    Date: `${mm}/${dd}/${date.getUTCFullYear()}`,
  });
  return `${COCORAHS_EXPORT_URL}?${params.toString()}`;
}

/**
 * The two report dates that can hold each station's latest report: "today" and "yesterday" as
 * dated on the U.S. East Coast (UTC−5). Western and Hawaiian observers are behind that, so their
 * latest report is always within these two dates.
 */
export function reportDates(now: number): Date[] {
  const today = new Date(now - 5 * 3600_000);
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return [new Date(day), new Date(day - 86_400_000)];
}

/** Split one CSV line. The export does not quote fields today, but quoted fields are handled. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export interface CocorahsParseOptions {
  now: number;
  /** Reports observed longer ago than this are dropped. */
  maxAgeHours: number;
}

export interface CocorahsParseResult {
  readings: GaugeReading[];
  stats: ParseStats;
}

const round = (v: number) => Math.round(v / COORD_STEP) * COORD_STEP;

/**
 * Parse one or more daily-report CSV bodies into readings, keeping each station's most recent
 * report. Never throws on bad rows (they are counted and dropped); throws only if a body is not
 * the expected CSV at all.
 */
export function parseCocorahs(bodies: string[], opts: CocorahsParseOptions): CocorahsParseResult {
  const stats: ParseStats = { received: 0, accepted: 0, rejected: {} };
  const reject = (reason: string) => { stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1; };
  const spec = PARAMETERS['CCR-PRCP24'];
  const maxAgeMs = opts.maxAgeHours * 3600_000;
  const byStation = new Map<string, GaugeReading>();

  for (const body of bodies) {
    const lines = body.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!lines.length) throw new Error('CoCoRaHS response is empty');
    const header = splitCsvLine(lines[0]);
    const col = Object.fromEntries(REQUIRED.map((k) => [k, header.indexOf(k)])) as Record<(typeof REQUIRED)[number], number>;
    if (Object.values(col).some((i) => i < 0)) throw new Error('CoCoRaHS response is not the expected CSV');

    for (const line of lines.slice(1)) {
      stats.received++;
      const f = splitCsvLine(line);
      if (f.length < header.length) { reject('malformed row'); continue; }
      const id = f[col.StationNumber];
      if (!STATION_RE.test(id)) { reject('partner-network station (terms not stated)'); continue; }
      const lat = Number(f[col.Latitude]), lon = Number(f[col.Longitude]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) {
        reject('invalid coordinates'); continue;
      }
      const raw = f[col.TotalPrecipAmt].toUpperCase();
      let value: number;
      const qualifiers: string[] = [];
      if (raw === 'T') { value = 0; qualifiers.push('TRACE'); }
      else if (raw === '' || raw === 'NA') { reject('missing value'); continue; }
      else {
        value = Number(raw);
        if (!Number.isFinite(value)) { reject('non-numeric value'); continue; }
        if (value < (spec.min ?? 0) || value > (spec.max ?? Infinity)) { reject('physically impossible value'); continue; }
      }
      const t = Date.parse(`${f[col.ObservationDate]}T${f[col.ObservationTime]}Z`);
      if (!Number.isFinite(t)) { reject('invalid time'); continue; }
      if (t > opts.now + 3600_000) { reject('time in future'); continue; }
      if (opts.now - t > maxAgeMs) { reject('older than the latest report window'); continue; }

      const reading: GaugeReading = {
        id,
        name: f[col.StationName].slice(0, 80) || undefined,
        lon: round(lon),
        lat: round(lat),
        param: 'CCR-PRCP24',
        value,
        unit: 'in',
        observedAt: new Date(t).toISOString(),
        approval: 'Unknown',
        qualifiers,
        kind: 'observation',
      };
      const prev = byStation.get(id);
      if (prev) {
        reject('superseded by a newer report');
        if (Date.parse(prev.observedAt) >= t) continue;
      }
      byStation.set(id, reading);
    }
  }

  const readings = [...byStation.values()].sort((a, b) => a.id.localeCompare(b.id));
  stats.accepted = readings.length;
  return { readings, stats };
}

/** True when a report recorded any precipitation, including a trace. */
export function hasPrecip(r: Pick<GaugeReading, 'value' | 'qualifiers'>): boolean {
  return r.value > 0 || r.qualifiers.includes('TRACE');
}
