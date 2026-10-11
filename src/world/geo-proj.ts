// =====================================================================
// geo-proj.ts — real New York → game metres.
//
// Everything in the city (borough coastlines, landmarks, places,
// neighbourhood names) is positioned from REAL latitude/longitude with
// one projection, so the map and the 3D world look like the real city:
//
//   • Times Square is (0, 0).
//   • The map is turned 29° so Manhattan's avenues run straight up the
//     screen (the way New Yorkers draw it; "Manhattan north").
//   • Distances are compressed 5× (SCALE = 0.2): a 250 m avenue block is
//     50 game metres. Walkable, but still New York-shaped.
//   • x grows to the east, z to the south (north is −z).
//
// The borough outlines come from scripts/build-geo.mjs (same numbers —
// if you change ORIGIN/ROTATE/SCALE here, change them there and rebuild).
// =====================================================================

import { NYC_GEO } from '../data/geo/nyc-boroughs.ts';

export const ORIGIN = NYC_GEO.origin;
export const SCALE = NYC_GEO.scale;
const th = (NYC_GEO.rotateDeg * Math.PI) / 180;
const cosLat = Math.cos((ORIGIN.lat * Math.PI) / 180);

export interface XZ {
  x: number;
  z: number;
}

/** Real latitude/longitude → game x/z (metres). */
export function project(lat: number, lon: number): XZ {
  const E = (lon - ORIGIN.lon) * cosLat * 111320;
  const N = (lat - ORIGIN.lat) * 110540;
  return { x: (E * Math.cos(th) - N * Math.sin(th)) * SCALE, z: -(E * Math.sin(th) + N * Math.cos(th)) * SCALE };
}

export type BoroughId = 'manhattan' | 'brooklyn' | 'queens' | 'bronx' | 'statenIsland';

export interface BoroughInfo {
  id: BoroughId;
  name: string;
  /** Can you play there yet? The others are "coming soon" land for sale. */
  playable: boolean;
  /** Map colour (like the classic five-borough poster). */
  color: string;
  /** Where its name goes on the whole-city map (lat, lon). */
  label: [number, number];
}

export const BOROUGHS: BoroughInfo[] = [
  { id: 'manhattan', name: 'Manhattan', playable: true, color: '#e9a6c9', label: [40.781, -73.966] },
  { id: 'brooklyn', name: 'Brooklyn', playable: true, color: '#8fb6ea', label: [40.645, -73.945] },
  { id: 'queens', name: 'Queens', playable: true, color: '#f2d27a', label: [40.715, -73.82] },
  { id: 'bronx', name: 'The Bronx', playable: true, color: '#a8d8a0', label: [40.845, -73.865] },
  { id: 'statenIsland', name: 'Staten Island', playable: false, color: '#f3b27f', label: [40.58, -74.15] },
];

/** A borough's outline rings (biggest first) in game metres. */
export function outline(id: BoroughId): XZ[][] {
  return (NYC_GEO.boroughs[id] ?? []).map((ring) => ring.map(([x, z]) => ({ x, z })));
}

export function pointInRing(x: number, z: number, poly: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

const landCache = new Map<BoroughId, XZ[][]>();
/** Is (x, z) on this borough's land (any of its islands)? */
export function onLand(id: BoroughId, x: number, z: number): boolean {
  let rings = landCache.get(id);
  if (!rings) landCache.set(id, (rings = outline(id)));
  return rings.some((r) => pointInRing(x, z, r));
}

/** Which borough (if any) is at (x, z)? */
export function boroughAt(x: number, z: number): BoroughId | null {
  for (const b of BOROUGHS) if (onLand(b.id, x, z)) return b.id;
  return null;
}

/** Bounding box of a borough (all rings). */
export function boroughBounds(id: BoroughId): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const pts = outline(id).flat();
  return { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)) };
}

/** Game x/z → real latitude/longitude (inverse of project). */
export function unproject(x: number, z: number): { lat: number; lon: number } {
  const e = x / SCALE;
  const n = -z / SCALE;
  const E = e * Math.cos(th) + n * Math.sin(th);
  const N = -e * Math.sin(th) + n * Math.cos(th);
  return { lat: ORIGIN.lat + N / 110540, lon: ORIGIN.lon + E / (cosLat * 111320) };
}
