// =====================================================================
// corridors.ts — roads that DON'T follow the grid: Broadway's diagonal,
// the highway that rings Manhattan (West Side Highway, FDR Drive, Harlem
// River Drive) and bridge approaches.
//
// A corridor is a polyline with a width. Everywhere that reads it:
//   • nycgen/city-blocks.ts drops buildings that would stand on it, which
//     cuts blocks into the triangles and wedges real Manhattan has
//     (Times Square, Herald Square, the Flatiron);
//   • city.ts paves it (sidewalks, asphalt, a double yellow line) on top
//     of the blocks;
//   • traffic drives along it; the nav grid lets you walk on it;
//   • the shore trees and the for-sale lots keep off it;
//   • the flat map draws it.
//
// TO ADD A ROAD: add a CorridorDef (real lat/lon points, or a function).
// =====================================================================

import type { AreaId } from '../sim/types.ts';
import { outline, project, type XZ } from './geo-proj.ts';

export interface Corridor {
  id: string;
  name: string;
  area: AreaId;
  /** Asphalt width (m); sidewalks add 4 m each side unless `highway`. */
  width: number;
  /** Highways have no sidewalks (and no walking). */
  highway?: boolean;
  /** A closed loop (the ring road). */
  loop?: boolean;
  pts: XZ[];
}

const ll = (pts: [number, number][]) => pts.map(([lat, lon]) => project(lat, lon));

/** Broadway, from 110th St down to Bowling Green (real points). */
const BROADWAY: [number, number][] = [
  [40.8045, -73.9667], [40.7937, -73.9723], [40.7832, -73.98], [40.7781, -73.9818], [40.7735, -73.9822], [40.7681, -73.9819],
  [40.7616, -73.9839], [40.758, -73.9855], [40.7559, -73.9866], [40.7497, -73.9877], [40.7411, -73.9897], [40.7355, -73.9908],
  [40.73, -73.9925], [40.7253, -73.9967], [40.7193, -74.0015], [40.714, -74.006], [40.7105, -74.009], [40.7075, -74.012], [40.7046, -74.0136],
];

/** Average neighbouring points so a jagged line becomes a smooth road. */
function chaikin(pts: XZ[], loop: boolean, passes: number): XZ[] {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const out: XZ[] = loop ? [] : [p[0]];
    const n = p.length;
    for (let i = 0; i < (loop ? n : n - 1); i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    if (!loop) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

/** Evenly spaced points every `step` m along a polyline. */
function resample(pts: XZ[], step: number, loop: boolean): XZ[] {
  const out: XZ[] = [pts[0]];
  let carry = 0;
  const n = pts.length;
  for (let i = 0; i < (loop ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let s = step - carry;
    while (s < len) {
      out.push({ x: a.x + ((b.x - a.x) * s) / len, z: a.z + ((b.z - a.z) * s) / len });
      s += step;
    }
    carry = (carry + len) % step;
  }
  if (!loop) out.push(pts[n - 1]);
  return out;
}

/**
 * The ring road: the island's coastline pulled `inset` metres inland and
 * smoothed hard (the real coastline is full of piers).
 */
/** The smoothed shore line of a ring (no piers), for the shallow-water band too. */
export function smoothShore(ring: XZ[], step = 40): XZ[] {
  return chaikin(resample(ring, step, true), true, 3);
}

function ringRoad(inset: number): XZ[] {
  const ring = outline('manhattan')[0];
  // Coarse, smoothed copy of the shore first, so the offset doesn't follow every pier.
  // Very coarse (one point every 130 m) and smoothed hard, so the road
  // sweeps along the shore instead of zigzagging round every pier.
  const coarse = chaikin(resample(ring, 130, true), true, 4);
  let area = 0;
  for (let i = 0; i < coarse.length; i++) {
    const a = coarse[i], b = coarse[(i + 1) % coarse.length];
    area += a.x * b.z - b.x * a.z;
  }
  const sgn = Math.sign(area) || 1;
  const n = coarse.length;
  // Normals from a wide window (±6 points) so tight notches can't fold the road.
  const off = coarse.map((p, i) => {
    const a = coarse[(i - 6 + n) % n], b = coarse[(i + 6) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: p.x + (-dz / l) * sgn * inset, z: p.z + (dx / l) * sgn * inset };
  });
  // Relax: pull each point toward its neighbours' average (irons out kinks).
  let relaxed = off;
  for (let k = 0; k < 6; k++) relaxed = relaxed.map((p, i) => {
    const a = relaxed[(i - 1 + n) % n], b = relaxed[(i + 1) % n];
    return { x: p.x * 0.5 + (a.x + b.x) * 0.25, z: p.z * 0.5 + (a.z + b.z) * 0.25 };
  });
  return resample(chaikin(relaxed, true, 3), 18, true);
}

/** Brooklyn's diagonal avenues and the BQE (real points). */
const BK: { id: string; name: string; width: number; highway?: boolean; pts: [number, number][] }[] = [
  { id: 'flatbush', name: 'Flatbush Ave', width: 15, pts: [[40.699, -73.987], [40.6905, -73.9825], [40.6846, -73.9776], [40.6795, -73.9745], [40.674, -73.9705], [40.663, -73.9625]] },
  { id: 'atlantic', name: 'Atlantic Ave', width: 15, pts: [[40.6905, -73.9985], [40.6868, -73.9905], [40.6838, -73.9778], [40.682, -73.96], [40.679, -73.94]] },
  { id: 'fulton', name: 'Fulton St', width: 13, pts: [[40.6927, -73.9897], [40.688, -73.98], [40.684, -73.97], [40.681, -73.955], [40.68, -73.94]] },
  { id: 'bkBroadway', name: 'Broadway', width: 14, pts: [[40.7105, -73.9655], [40.704, -73.95], [40.6965, -73.935], [40.693, -73.928]] },
  { id: 'myrtle', name: 'Myrtle Ave', width: 13, pts: [[40.6935, -73.985], [40.6935, -73.97], [40.6945, -73.955], [40.6965, -73.935]] },
  { id: 'bedford', name: 'Bedford Ave', width: 13, pts: [[40.722, -73.955], [40.71, -73.9615], [40.695, -73.956], [40.68, -73.953]] },
  { id: 'easternPkwy', name: 'Eastern Pkwy', width: 16, pts: [[40.6735, -73.97], [40.671, -73.96], [40.669, -73.945], [40.668, -73.93]] },
  { id: 'bqe', name: 'BQE', width: 18, highway: true, pts: [[40.7035, -73.993], [40.699, -73.984], [40.6985, -73.97], [40.701, -73.956], [40.708, -73.951], [40.717, -73.948], [40.725, -73.945]] },
];

/** The Bronx: the Concourse, its big avenues and two expressways (real points). */
const BX: typeof BK = [
  { id: 'concourse', name: 'Grand Concourse', width: 18, pts: [[40.8135, -73.93], [40.8277, -73.9228], [40.8443, -73.9137], [40.862, -73.901], [40.873, -73.89]] },
  { id: 'fordhamRd', name: 'Fordham Rd', width: 15, pts: [[40.861, -73.912], [40.862, -73.898], [40.861, -73.888], [40.858, -73.875]] },
  { id: 'southernBlvd', name: 'Southern Blvd', width: 14, pts: [[40.807, -73.915], [40.82, -73.9], [40.838, -73.888], [40.854, -73.878]] },
  { id: 'bxThirdAve', name: '3rd Ave', width: 13, pts: [[40.807, -73.927], [40.817, -73.918], [40.836, -73.904], [40.855, -73.892]] },
  { id: 'e149', name: 'E 149th St', width: 13, pts: [[40.818, -73.93], [40.816, -73.917], [40.813, -73.903]] },
  { id: 'deegan', name: 'Major Deegan Expwy', width: 18, highway: true, pts: [[40.805, -73.93], [40.829, -73.933], [40.845, -73.928], [40.865, -73.92]] },
  { id: 'crossBronx', name: 'Cross Bronx Expwy', width: 18, highway: true, pts: [[40.844, -73.925], [40.842, -73.905], [40.838, -73.885], [40.835, -73.865]] },
];

/** Queens: the big boulevards and two expressways (real points). */
const QN: typeof BK = [
  { id: 'queensBlvd', name: 'Queens Blvd', width: 20, pts: [[40.7437, -73.9535], [40.743, -73.925], [40.741, -73.9], [40.738, -73.878]] },
  { id: 'northernBlvd', name: 'Northern Blvd', width: 15, pts: [[40.752, -73.933], [40.753, -73.91], [40.756, -73.885], [40.759, -73.86]] },
  { id: 'astoriaBlvd', name: 'Astoria Blvd', width: 14, pts: [[40.77, -73.928], [40.769, -73.905], [40.767, -73.885]] },
  { id: 'qnBroadway', name: 'Broadway', width: 13, pts: [[40.762, -73.932], [40.756, -73.918], [40.748, -73.905]] },
  { id: 'steinway', name: 'Steinway St', width: 12, pts: [[40.757, -73.921], [40.765, -73.914], [40.773, -73.907]] },
  { id: 'qnBqe', name: 'BQE', width: 18, highway: true, pts: [[40.735, -73.92], [40.75, -73.907], [40.76, -73.898], [40.77, -73.893]] },
  { id: 'lie', name: 'Long Island Expwy', width: 18, highway: true, pts: [[40.74, -73.945], [40.737, -73.92], [40.735, -73.89]] },
];

let cache: Corridor[] | null = null;

export function corridors(): Corridor[] {
  if (cache) return cache;
  cache = [
    { id: 'broadway', name: 'Broadway', area: 'manhattan', width: 14, pts: resample(chaikin(ll(BROADWAY), false, 2), 14, false) },
    { id: 'manhattanRing', name: 'West Side Hwy · FDR Drive', area: 'manhattan', width: 18, highway: true, loop: true, pts: ringRoad(42) },
    // Brooklyn Bridge approach on the Manhattan side (City Hall).
    { id: 'bbApproach', name: 'Brooklyn Bridge', area: 'manhattan', width: 16, highway: true, pts: ll([[40.7123, -74.0052], [40.7095, -74.001]]) },
    ...BK.map((c) => ({ id: c.id, name: c.name, area: 'brooklyn' as AreaId, width: c.width, highway: c.highway, pts: resample(chaikin(ll(c.pts), false, 2), 14, false) })),
    ...QN.map((c) => ({ id: c.id, name: c.name, area: 'queens' as AreaId, width: c.width, highway: c.highway, pts: resample(chaikin(ll(c.pts), false, 2), 14, false) })),
    ...BX.map((c) => ({ id: c.id, name: c.name, area: 'bronx' as AreaId, width: c.width, highway: c.highway, pts: resample(chaikin(ll(c.pts), false, 2), 14, false) })),
  ];
  return cache;
}

export function corridorsIn(area: AreaId): Corridor[] {
  return corridors().filter((c) => c.area === area);
}

// Segment buckets (40 m cells) so "is this point on a road?" stays cheap
// even when thousands of buildings ask it.
const CELL = 40;
const buckets = new Map<Corridor, Map<string, number[]>>();
function bucketsOf(c: Corridor): Map<string, number[]> {
  let m = buckets.get(c);
  if (m) return m;
  m = new Map();
  const n = c.pts.length;
  for (let i = 0; i < (c.loop ? n : n - 1); i++) {
    const a = c.pts[i], b = c.pts[(i + 1) % n];
    const x0 = Math.floor((Math.min(a.x, b.x) - 30) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + 30) / CELL);
    const z0 = Math.floor((Math.min(a.z, b.z) - 30) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + 30) / CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = `${gx},${gz}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
  }
  buckets.set(c, m);
  return m;
}

/** Distance from (x, z) to a corridor's centre line (Infinity if more than ~30 m away). */
export function distToCorridor(c: Corridor, x: number, z: number): number {
  const segs = bucketsOf(c).get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  if (!segs) return Infinity;
  let best = Infinity;
  const n = c.pts.length;
  for (const i of segs) {
    const a = c.pts[i], b = c.pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)));
  }
  return best;
}

/** Is (x, z) on any corridor in the area (plus `pad` metres)? */
export function onCorridor(area: AreaId, x: number, z: number, pad = 0): Corridor | null {
  for (const c of corridorsIn(area)) {
    const half = c.width / 2 + (c.highway ? 1 : 4) + pad;
    if (distToCorridor(c, x, z) < half) return c;
  }
  return null;
}

/** Does a rectangle touch a corridor? (sampled every ~8 m over the rect) */
export function rectOnCorridor(area: AreaId, r: { minX: number; maxX: number; minZ: number; maxZ: number }, pad = 0): boolean {
  const nx = Math.max(2, Math.ceil((r.maxX - r.minX) / 8) + 1);
  const nz = Math.max(2, Math.ceil((r.maxZ - r.minZ) / 8) + 1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (onCorridor(area, r.minX + ((r.maxX - r.minX) * i) / (nx - 1), r.minZ + ((r.maxZ - r.minZ) * j) / (nz - 1), pad)) return true;
    }
  }
  return false;
}
