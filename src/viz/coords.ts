// Geographic ↔ world-space conventions shared by every layer.
// Globe is a unit sphere, never rotated: +Y = north pole, lon 0 on +Z, lon +90 on +X.

import { Vector3 } from 'three';

const D2R = Math.PI / 180;

export function lonLatToVec3(lon: number, lat: number, r = 1, out = new Vector3()): Vector3 {
  const phi = lat * D2R, lam = lon * D2R;
  const c = Math.cos(phi);
  return out.set(r * c * Math.sin(lam), r * Math.sin(phi), r * c * Math.cos(lam));
}

/** Local tangent frame at a surface point: east, north, up (all unit vectors). */
export function tangentFrame(lon: number, lat: number) {
  const phi = lat * D2R, lam = lon * D2R;
  const up = new Vector3(Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam));
  const east = new Vector3(Math.cos(lam), 0, -Math.sin(lam));
  const north = new Vector3().crossVectors(up, east);
  return { east, north, up };
}

/**
 * Approximate subsolar point (lat/lon in degrees) for a UTC date. NOAA-style low-precision
 * solar position; accurate to well under a degree, which is all the lighting needs.
 */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const ms = date.getTime();
  const jd = ms / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * n) * D2R;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  // Greenwich mean sidereal time (degrees)
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  let lon = (ra / D2R - gmst) % 360;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: decl / D2R, lon };
}
