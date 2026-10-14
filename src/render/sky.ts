// =====================================================================
// sky.ts — real-time day and night.
//
// The sky colour, sunlight, fog and window lights follow the actual time
// in New York and today's weather. At 7 PM in winter it's dark and the
// skyline glows; on a rainy afternoon everything goes grey and moody.
// =====================================================================

import * as THREE from 'three';
import { weatherDef, type Weather } from '../sim/weather.ts';

interface Key {
  h: number;
  sky: string;
  fog: string;
  sun: number;
  hemi: number;
  sunColor: string;
  glow: number;
}

// Colour "keyframes" through the day; we blend between neighbours.
const KEYS: Key[] = [
  { h: 0, sky: '#0b1026', fog: '#141a33', sun: 0.05, hemi: 0.35, sunColor: '#9fb3ff', glow: 1 },
  { h: 5, sky: '#141b3a', fog: '#1d2445', sun: 0.08, hemi: 0.4, sunColor: '#a9b6ff', glow: 0.95 },
  { h: 6.5, sky: '#f2a07b', fog: '#e8b39a', sun: 0.6, hemi: 0.6, sunColor: '#ffb27a', glow: 0.5 },
  { h: 8, sky: '#9fd0f0', fog: '#c7e0ef', sun: 1.15, hemi: 0.85, sunColor: '#fff1d6', glow: 0.05 },
  { h: 13, sky: '#7fc1ea', fog: '#bfdcee', sun: 1.35, hemi: 0.95, sunColor: '#ffffff', glow: 0 },
  { h: 17.5, sky: '#9cc6e6', fog: '#cfdde8', sun: 1.1, hemi: 0.85, sunColor: '#fff0d4', glow: 0.1 },
  { h: 19, sky: '#f08a5d', fog: '#e3a184', sun: 0.6, hemi: 0.6, sunColor: '#ff9a62', glow: 0.55 },
  { h: 20.2, sky: '#3b2f5c', fog: '#3f3a5e', sun: 0.18, hemi: 0.45, sunColor: '#c39bff', glow: 0.9 },
  { h: 24, sky: '#0b1026', fog: '#141a33', sun: 0.05, hemi: 0.35, sunColor: '#9fb3ff', glow: 1 },
];

export interface SkyState {
  sky: THREE.Color;
  fog: THREE.Color;
  sun: number;
  hemi: number;
  sunColor: THREE.Color;
  /** 0 (day) … 1 (night): drives window lights and street lamps. */
  glow: number;
  /** Direction the sunlight comes from. */
  sunDir: THREE.Vector3;
}

const out: SkyState = { sky: new THREE.Color(), fog: new THREE.Color(), sun: 1, hemi: 1, sunColor: new THREE.Color(), glow: 0, sunDir: new THREE.Vector3() };
const ca = new THREE.Color();
const cb = new THREE.Color();
const grey = new THREE.Color('#8e979f');

export function skyAt(hourFloat: number, weather: Weather): SkyState {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hourFloat) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (hourFloat - a.h) / (b.h - a.h || 1);
  out.sky.copy(ca.set(a.sky)).lerp(cb.set(b.sky), t);
  out.fog.copy(ca.set(a.fog)).lerp(cb.set(b.fog), t);
  out.sunColor.copy(ca.set(a.sunColor)).lerp(cb.set(b.sunColor), t);
  out.sun = a.sun + (b.sun - a.sun) * t;
  out.hemi = a.hemi + (b.hemi - a.hemi) * t;
  out.glow = a.glow + (b.glow - a.glow) * t;

  // Bad weather: greyer, darker, and the lights come on earlier.
  const wd = weatherDef(weather);
  out.sun *= wd.sun;
  if (wd.grey > 0) {
    // Cartoon city: bad weather is moodier but never drab grey.
    const k = wd.grey;
    const lum = out.sky.getHSL({ h: 0, s: 0, l: 0 }).l;
    out.sky.lerp(grey.clone().multiplyScalar(Math.max(0.25, lum * 1.2)), k);
    out.fog.lerp(grey.clone().multiplyScalar(Math.max(0.3, lum * 1.25)), k);
    out.glow = Math.min(1, out.glow + k * 0.25);
  }

  // The sun swings east (morning) to west (evening), low at the ends.
  const dayT = Math.min(1, Math.max(0, (hourFloat - 6) / 14));
  const elev = Math.sin(dayT * Math.PI) * 0.9 + 0.2;
  out.sunDir.set(Math.cos(dayT * Math.PI) * 1.2, elev, 0.45).normalize();
  return out;
}
