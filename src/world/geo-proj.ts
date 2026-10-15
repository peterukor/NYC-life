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
import { MANHATTAN_SHORE } from '../data/geo/manhattan-shore.ts';

export const ORIGIN = NYC_GEO.origin;
/**
 * East–west stretch on top of the real projection (Peter, 2026-10-12: a
 * wider island with more land across, same-size blocks and roads). Set by
 * scripts/build-manhattan-shore.py [stretch]; 1 = true proportions.
 */
export const X_STRETCH = MANHATTAN_SHORE.xStretch ?? 1;
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
  return { x: (E * Math.cos(th) - N * Math.sin(th)) * SCALE * X_STRETCH, z: -(E * Math.sin(th) + N * Math.cos(th)) * SCALE };
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
  // Manhattan uses the smoothed cartoon coast (scripts/build-manhattan-shore.py):
  // no piers or inlets, so the shore, the ring highway and the grid fit together.
  if (id === 'manhattan') return MANHATTAN_SHORE.land.map((ring) => ring.map(([x, z]) => ({ x, z })));
  return (NYC_GEO.boroughs[id] ?? []).map((ring) => ring.map(([x, z]) => ({ x: x * X_STRETCH, z })));
}

export function pointInRing(x: number, z: number, poly: XZ[]): boolean {
  // Big outlines (coastlines: thousands of points) get an index of their
  // edges by height, so a test only looks at the few edges crossing z.
  // Same answer as checking every edge; the start-up layout asks millions of times.
  if (poly.length > 48) return pointInRingIndexed(x, z, poly);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

type RingIndex = { zMin: number; zMax: number; h: number; buckets: Int32Array[] };
const ringIndexes = new WeakMap<XZ[], RingIndex>();
function ringIndex(poly: XZ[]): RingIndex {
  let ix = ringIndexes.get(poly);
  if (ix) return ix;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const p of poly) {
    zMin = Math.min(zMin, p.z);
    zMax = Math.max(zMax, p.z);
  }
  const n = Math.max(1, Math.ceil(poly.length / 4));
  const h = Math.max(1e-6, (zMax - zMin) / n);
  const lists: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const lo = Math.min(poly[i].z, poly[j].z);
    const hi = Math.max(poly[i].z, poly[j].z);
    const b0 = Math.max(0, Math.floor((lo - zMin) / h));
    const b1 = Math.min(n - 1, Math.floor((hi - zMin) / h));
    for (let b = b0; b <= b1; b++) lists[b].push(i);
  }
  ix = { zMin, zMax, h, buckets: lists.map((l) => Int32Array.from(l)) };
  ringIndexes.set(poly, ix);
  return ix;
}
function pointInRingIndexed(x: number, z: number, poly: XZ[]): boolean {
  const ix = ringIndex(poly);
  if (!(z >= ix.zMin && z <= ix.zMax)) return false;
  const edges = ix.buckets[Math.min(ix.buckets.length - 1, Math.floor((z - ix.zMin) / ix.h))];
  const n = poly.length;
  let inside = false;
  for (let k = 0; k < edges.length; k++) {
    const i = edges[k];
    const a = poly[i];
    const b = poly[i === 0 ? n - 1 : i - 1];
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

/**
 * Land mask for a whole grid at once (cell centres), the same answer as
 * calling onLand() per cell but scanline-fast: each row crosses each ring
 * edge once instead of every cell testing every edge. Building the street
 * nav grid went from ~80% of the city build to almost nothing (2026-10-15).
 */
export function landMask(id: BoroughId, minX: number, minZ: number, cols: number, rows: number, cell: number): Uint8Array {
  let rings = landCache.get(id);
  if (!rings) landCache.set(id, (rings = outline(id)));
  const mask = new Uint8Array(cols * rows);
  const xs: number[] = [];
  for (let rr = 0; rr < rows; rr++) {
    const z = minZ + (rr + 0.5) * cell;
    for (const poly of rings) {
      xs.length = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if (a.z > z !== b.z > z) xs.push(((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x);
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      // pointInRing: inside when an odd number of crossings lie strictly right of x,
      // i.e. xs[2k] <= x < xs[2k+1].
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - minX) / cell - 0.5));
        const c1 = Math.min(cols - 1, Math.ceil((xs[k + 1] - minX) / cell - 0.5) - 1);
        for (let cc = c0; cc <= c1; cc++) mask[rr * cols + cc] = 1;
      }
    }
  }
  return mask;
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
  const e = x / X_STRETCH / SCALE;
  const n = -z / SCALE;
  const E = e * Math.cos(th) + n * Math.sin(th);
  const N = -e * Math.sin(th) + n * Math.cos(th);
  return { lat: ORIGIN.lat + N / 110540, lon: ORIGIN.lon + E / (cosLat * 111320) };
}
