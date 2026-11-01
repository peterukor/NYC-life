// =====================================================================
// ped-walk.ts — where street pedestrians may walk, and their routes
// (no 3D here; world/crowd.ts moves and draws them).
//
// The player's nav grid (nav.ts) treats the whole road as walkable, so
// the crowd used to cut straight across avenues and stand about in the
// traffic. Pedestrians get their own view of the same grid:
//   • a cell is WALK if its centre is off the asphalt (sidewalks, plazas,
//     parks, promenades, Broadway's sidewalks);
//   • a cell on the asphalt is a CROSSING only inside the zebra band at a
//     signalled grid intersection (city.ts paints them 0.6–3.2 m off the
//     kerb), and there it can only be walked straight across the road;
//   • everything else on the road (mid-block, the box in the middle of an
//     intersection, Broadway's and the highway's asphalt, the street stubs
//     to the river) is closed.
// Routes are A* over that grid, smoothed only where the straight line
// stays on the sidewalk, and each road crossing becomes two points on the
// painted crosswalk: a kerb spot to wait at, and the far kerb, tagged with
// the signal group that has to be green to set off (traffic-flow.ts:
// crossing an avenue goes with the streets' green, crossing a street with
// the avenues').
// =====================================================================

import { blockRect, colAt, inParkGap, onRoad, rowAt, SIDEWALK, streetStubs, stubRect, type DistrictDef, type Rect } from './layout.ts';
import { corridorsIn, distToCorridor } from './corridors.ts';
import { CELL, type NavGrid } from './nav.ts';
import { onLand } from './geo-proj.ts';

export type SignalAxis = 'ave' | 'st';
export type Surface = 'walk' | 'road' | 'crosswalk';

export interface PedPoint {
  x: number;
  z: number;
  /** This point is the far kerb of a road crossing: the signal group that must be green to set off. */
  need?: SignalAxis;
}

/** Grid cell classes. */
export const PED = { blocked: 0, walk: 1, crossX: 2, crossZ: 3 } as const;

/** The painted zebra band, metres out from the kerb (city.ts). */
export const ZEBRA = { from: 0.6, to: 3.2, mid: 1.9 } as const;

// ---------------------------------------------------------------------
// The ground under a point
// ---------------------------------------------------------------------

const realCache = new Map<DistrictDef, Uint8Array>();
/** Does intersection (avenue i, street j) exist with asphalt and painted crosswalks? */
function realCrossing(d: DistrictDef, i: number, j: number): boolean {
  let m = realCache.get(d);
  if (!m) {
    m = new Uint8Array((d.cols + 1) * (d.rows + 1));
    for (let a = 0; a <= d.cols; a++) for (let b = 0; b <= d.rows; b++) {
      const x = d.xs[a], z = d.zs[b];
      m[a * (d.rows + 1) + b] = onRoad(d, x, z) && !inParkGap(d, x, z) ? 1 : 0;
    }
    realCache.set(d, m);
  }
  return i >= 0 && j >= 0 && i <= d.cols && j <= d.rows && m[i * (d.rows + 1) + j] === 1;
}

/** Index of the grid line nearest v. */
function nearestLine(lines: number[], v: number, cell: number): number {
  const c = Math.max(0, Math.min(lines.length - 2, cell));
  return Math.abs(v - lines[c]) <= Math.abs(v - lines[c + 1]) ? c : c + 1;
}

/** On the asphalt of Broadway, a highway or any other corridor? */
function onCorridorAsphalt(d: DistrictDef, x: number, z: number): boolean {
  for (const c of corridorsIn(d.id)) if (distToCorridor(c, x, z) < c.width / 2 + (c.highway ? 1 : 0)) return true;
  return false;
}

let stubRects: { d: DistrictDef; rects: Rect[] } | null = null;
function onStub(d: DistrictDef, x: number, z: number): boolean {
  if (!stubRects || stubRects.d !== d) stubRects = { d, rects: streetStubs(d).map(stubRect) };
  for (const r of stubRects.rects) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return true;
  return false;
}

/** Is (x, z) on asphalt where cars drive (grid roads, street stubs, corridors)? */
export function asphaltAt(d: DistrictDef, x: number, z: number): boolean {
  if (onRoad(d, x, z) && !inParkGap(d, x, z)) return true;
  return onStub(d, x, z) || onCorridorAsphalt(d, x, z);
}

/**
 * Which road a crosswalk at (x, z) crosses: 'ave' = across an avenue
 * (walking along x), 'st' = across a street (walking along z), or null.
 * `from`/`to` = the band, in metres out from the kerb. Doesn't check
 * that (x, z) is asphalt.
 */
export function crosswalkAt(d: DistrictDef, x: number, z: number, from: number = ZEBRA.from, to: number = ZEBRA.to): SignalAxis | null {
  const i = nearestLine(d.xs, x, colAt(d, x));
  const j = nearestLine(d.zs, z, rowAt(d, z));
  const dx = Math.abs(x - d.xs[i]);
  const dz = Math.abs(z - d.zs[j]);
  if (!realCrossing(d, i, j)) return null;
  const outZ = dz - d.streetW / 2;
  const outX = dx - d.avenueW / 2;
  if (dx < d.avenueW / 2 + 0.5 && outZ >= from && outZ <= to) return 'ave';
  if (dz < d.streetW / 2 + 0.5 && outX >= from && outX <= to) return 'st';
  return null;
}

/** What a pedestrian stands on at (x, z). Corridor asphalt is never a crosswalk (no signals there). */
export function surfaceAt(d: DistrictDef, x: number, z: number): Surface {
  if (!asphaltAt(d, x, z)) return 'walk';
  if (onStub(d, x, z) || onCorridorAsphalt(d, x, z)) return 'road';
  // A little slack either side of the paint (people don't walk the exact stripes).
  return crosswalkAt(d, x, z, ZEBRA.from - 0.4, ZEBRA.to + 0.4) ? 'crosswalk' : 'road';
}

/** The signal group that must be green to cross the road `axis` names. */
export const needFor = (crosses: SignalAxis): SignalAxis => (crosses === 'ave' ? 'st' : 'ave');

// ---------------------------------------------------------------------
// The pedestrian grid
// ---------------------------------------------------------------------

export interface PedGrid {
  d: DistrictDef;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  /** PED.* per cell. */
  cls: Uint8Array;
  /** Which connected patch each open cell belongs to (-1 = blocked): no route between patches. */
  island: Int32Array;
}

/**
 * Build the pedestrian grid on top of the player's nav grid (same cells).
 * ~0.1 s for Manhattan in node.
 */
export function buildPedGrid(nav: NavGrid, d: DistrictDef): PedGrid {
  const { cols, rows, minX, minZ } = nav;
  const N = cols * rows;
  const cls = new Uint8Array(N);
  const at = (c: number, r: number) => ({ x: minX + (c + 0.5) * CELL, z: minZ + (r + 0.5) * CELL });
  // Rasterise the ground (the same rules as asphaltAt / crosswalkAt, but per
  // rectangle instead of per cell: ~10× quicker). 0 = off the road,
  // 1 = grid road, 2 = corridor or stub asphalt, 3 / 4 = crosswalk band
  // across an avenue / a street.
  const ground = new Uint8Array(N);
  const each = (r: Rect, fn: (i: number, x: number, z: number) => void) => {
    const c0 = Math.max(0, Math.ceil((r.minX - minX) / CELL - 0.5)), c1 = Math.min(cols - 1, Math.floor((r.maxX - minX) / CELL - 0.5));
    const r0 = Math.max(0, Math.ceil((r.minZ - minZ) / CELL - 0.5)), r1 = Math.min(rows - 1, Math.floor((r.maxZ - minZ) / CELL - 0.5));
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const x = minX + (cc + 0.5) * CELL, z = minZ + (rr + 0.5) * CELL;
      if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) fn(rr * cols + cc, x, z);
    }
  };
  const pad = (b: Rect): Rect => ({ minX: b.minX - d.avenueW / 2 - 0.5, maxX: b.maxX + d.avenueW / 2 + 0.5, minZ: b.minZ - d.streetW / 2 - 0.5, maxZ: b.maxZ + d.streetW / 2 + 0.5 });
  const blocks: { b: Rect; park: boolean }[] = [];
  for (let c = 0; c < d.cols; c++) for (let r = 0; r < d.rows; r++) {
    const kind = d.kind(c, r);
    if (kind !== 'water') blocks.push({ b: blockRect(d, c, r), park: kind === 'park' });
  }
  for (const { b } of blocks) each(pad(b), (i) => (ground[i] = 1));
  for (const { b } of blocks) each(b, (i) => (ground[i] = 0));
  for (const { b, park } of blocks) if (park) each(pad(b), (i, x, z) => {
    if (ground[i] === 1 && inParkGap(d, x, z)) ground[i] = 0;
  });
  // Crosswalk bands: as wide as the sidewalk they line up with, so there's
  // always a row of cells across; routes are put back on the paint later.
  for (let a = 0; a <= d.cols; a++) for (let s = 0; s <= d.rows; s++) {
    if (!realCrossing(d, a, s)) continue;
    const ax = d.xs[a], sz = d.zs[s];
    const hx = d.avenueW / 2, hz = d.streetW / 2;
    const band = (r: Rect, v: number) => each(r, (i) => {
      if (ground[i] === 1) ground[i] = v;
    });
    band({ minX: ax - hx - 0.5, maxX: ax + hx + 0.5, minZ: sz + hz - 1e-6, maxZ: sz + hz + SIDEWALK }, 3);
    band({ minX: ax - hx - 0.5, maxX: ax + hx + 0.5, minZ: sz - hz - SIDEWALK, maxZ: sz - hz + 1e-6 }, 3);
    band({ minX: ax + hx - 1e-6, maxX: ax + hx + SIDEWALK, minZ: sz - hz - 0.5, maxZ: sz + hz + 0.5 }, 4);
    band({ minX: ax - hx - SIDEWALK, maxX: ax - hx + 1e-6, minZ: sz - hz - 0.5, maxZ: sz + hz + 0.5 }, 4);
  }
  for (const st of streetStubs(d)) each(stubRect(st), (i) => (ground[i] = 2));
  for (const cor of corridorsIn(d.id)) {
    const hw = cor.width / 2 + (cor.highway ? 1 : 0);
    const n = cor.pts.length;
    for (let k = 0; k < (cor.loop ? n : n - 1); k++) {
      const p = cor.pts[k], q = cor.pts[(k + 1) % n];
      const ex = q.x - p.x, ez = q.z - p.z;
      const L2 = ex * ex + ez * ez || 1;
      each({ minX: Math.min(p.x, q.x) - hw, maxX: Math.max(p.x, q.x) + hw, minZ: Math.min(p.z, q.z) - hw, maxZ: Math.max(p.z, q.z) + hw }, (i, x, z) => {
        if (ground[i] === 2) return;
        const t = Math.max(0, Math.min(1, ((x - p.x) * ex + (z - p.z) * ez) / L2));
        if (Math.hypot(x - p.x - t * ex, z - p.z - t * ez) < hw) ground[i] = 2;
      });
    }
  }
  const CLS = [PED.walk, PED.blocked, PED.blocked, PED.crossX, PED.crossZ];
  for (let i = 0; i < N; i++) if (nav.walk[i]) cls[i] = CLS[ground[i]];
  // The nav grid blocks any cell that touches a block's building zone, which
  // on some rows leaves no cell of a 4 m sidewalk: open the cells whose
  // centre is on the sidewalk ring again (on land, off the asphalt).
  for (let bc = 0; bc < d.cols; bc++) for (let br = 0; br < d.rows; br++) {
    const kind = d.kind(bc, br);
    if (kind === 'plaza' || kind === 'park' || kind === 'water') continue;
    const b = blockRect(d, bc, br);
    const c0 = Math.max(0, Math.floor((b.minX - minX) / CELL)), c1 = Math.min(cols - 1, Math.floor((b.maxX - minX) / CELL));
    const r0 = Math.max(0, Math.floor((b.minZ - minZ) / CELL)), r1 = Math.min(rows - 1, Math.floor((b.maxZ - minZ) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * cols + c;
      if (cls[i] || nav.walk[i]) continue;
      const p = at(c, r);
      const inBlock = p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
      const inner = p.x > b.minX + SIDEWALK && p.x < b.maxX - SIDEWALK && p.z > b.minZ + SIDEWALK && p.z < b.maxZ - SIDEWALK;
      if (inBlock && !inner && ground[i] === 0 && onLand(d.borough, p.x, p.z)) cls[i] = PED.walk;
    }
  }
  return { d, cols, rows, minX, minZ, cls, island: islands(cls, cols) };
}

/** Label the connected patches (the same moves canStep allows: crossings straight across only). */
function islands(cls: Uint8Array, cols: number): Int32Array {
  const id = new Int32Array(cls.length).fill(-1);
  const stack: number[] = [];
  let next = 0;
  for (let s = 0; s < cls.length; s++) {
    if (!cls[s] || id[s] >= 0) continue;
    id[s] = next;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      const cc = c % cols;
      const a = cls[c];
      for (let k = 0; k < 4; k++) {
        const dc = k === 0 ? 1 : k === 1 ? -1 : 0, dr = k === 2 ? 1 : k === 3 ? -1 : 0;
        if (cc + dc < 0 || cc + dc >= cols) continue;
        const n = c + dc + dr * cols;
        if (n < 0 || n >= cls.length || id[n] >= 0) continue;
        const b = cls[n];
        if (!b || ((a === PED.crossX || b === PED.crossX) && (dr || a === PED.crossZ || b === PED.crossZ)) || ((a === PED.crossZ || b === PED.crossZ) && dc)) continue;
        id[n] = next;
        stack.push(n);
      }
    }
    next++;
  }
  return id;
}

/** Can a pedestrian at (x1, z1) walk to (x2, z2) at all? (both snapped to the sidewalk) */
export function sameIsland(g: PedGrid, x1: number, z1: number, x2: number, z2: number): boolean {
  const a = cellOf(g, x1, z1), b = cellOf(g, x2, z2);
  return a >= 0 && b >= 0 && g.island[a] >= 0 && g.island[a] === g.island[b];
}

function cellOf(g: PedGrid, x: number, z: number): number {
  const c = Math.floor((x - g.minX) / CELL);
  const r = Math.floor((z - g.minZ) / CELL);
  return c < 0 || r < 0 || c >= g.cols || r >= g.rows ? -1 : r * g.cols + c;
}

const centre = (g: PedGrid, i: number) => ({ x: g.minX + ((i % g.cols) + 0.5) * CELL, z: g.minZ + (Math.floor(i / g.cols) + 0.5) * CELL });

/** Can a pedestrian stand at (x, z)? (a walk cell, and off the asphalt) */
export function pedStandable(g: PedGrid, x: number, z: number): boolean {
  const i = cellOf(g, x, z);
  return i >= 0 && g.cls[i] === PED.walk && !asphaltAt(g.d, x, z);
}

/** Nearest place a pedestrian can stand: (x, z) itself, else the nearest walk cell's centre; null if none within ~60 m. */
export function nearestStand(g: PedGrid, x: number, z: number): { x: number; z: number } | null {
  if (pedStandable(g, x, z)) return { x, z };
  const c0 = Math.floor((x - g.minX) / CELL), r0 = Math.floor((z - g.minZ) / CELL);
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (let rad = 0; rad < 20; rad++) {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
      const c = c0 + dc, r = r0 + dr;
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || g.cls[r * g.cols + c] !== PED.walk) continue;
      const p = centre(g, r * g.cols + c);
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    if (best && rad * CELL > Math.sqrt(bestD) + CELL) break; // nothing nearer in further rings
  }
  return best;
}

/** Can you step from cell a to its neighbour b (dc, dr)? Crossings only straight across the road. */
function canStep(g: PedGrid, a: number, b: number, dc: number, dr: number): boolean {
  const cb = g.cls[b];
  if (cb === PED.blocked) return false;
  const ca = g.cls[a];
  if (dc && dr) {
    if (ca !== PED.walk || cb !== PED.walk) return false;
    // Don't cut a corner (a building's or the road's).
    return g.cls[a + dc] === PED.walk && g.cls[a + dr * g.cols] === PED.walk;
  }
  if (ca === PED.crossX || cb === PED.crossX) return dr === 0 && (ca !== PED.crossZ && cb !== PED.crossZ);
  if (ca === PED.crossZ || cb === PED.crossZ) return dc === 0;
  return true;
}

/** Straight line a→b stays on walk cells and off the asphalt (sampled every ~0.75 m). */
function walkClear(g: PedGrid, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(dist / 0.75));
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const i = cellOf(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    if (i < 0 || g.cls[i] !== PED.walk) return false;
  }
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    if (asphaltAt(g.d, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

/** String-pull a run of sidewalk points (keeps the first, returns the rest). */
function smoothLeg(g: PedGrid, pts: { x: number; z: number }[]): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  let anchor = 0;
  while (anchor < pts.length - 1) {
    let far = anchor + 1;
    for (let j = Math.min(pts.length - 1, anchor + 48); j > anchor + 1; j--) {
      if (walkClear(g, pts[anchor], pts[j])) {
        far = j;
        break;
      }
    }
    out.push(pts[far]);
    anchor = far;
  }
  return out;
}

/**
 * The two kerb points of a crossing, from the sidewalk cell before it (p)
 * to the one after (n): straight across the road, on the painted
 * crosswalk (`lat` shifts the line sideways inside the paint, per person,
 * so a crowd doesn't stack on one spot). Null if that line isn't clean
 * (it must be sidewalk, then crosswalk, then sidewalk all the way).
 */
function crossingEnds(d: DistrictDef, kind: number, p: { x: number; z: number }, n: { x: number; z: number }, lat: number): { a: PedPoint; b: PedPoint } | null {
  const mx = (p.x + n.x) / 2, mz = (p.z + n.z) / 2;
  let a: PedPoint, b: PedPoint;
  if (kind === PED.crossX) {
    // Across an avenue: the line runs along x at a z inside the paint.
    const j = nearestLine(d.zs, mz, rowAt(d, mz));
    const side = Math.sign(mz - d.zs[j]) || 1;
    const out = Math.max(ZEBRA.from + 0.3, Math.min(ZEBRA.to - 0.3, ZEBRA.mid + lat));
    const zc = d.zs[j] + side * (d.streetW / 2 + out);
    a = { x: p.x, z: zc };
    b = { x: n.x, z: zc, need: needFor('ave') };
  } else {
    const i = nearestLine(d.xs, mx, colAt(d, mx));
    const side = Math.sign(mx - d.xs[i]) || 1;
    const out = Math.max(ZEBRA.from + 0.3, Math.min(ZEBRA.to - 0.3, ZEBRA.mid + lat));
    const xc = d.xs[i] + side * (d.avenueW / 2 + out);
    a = { x: xc, z: p.z };
    b = { x: xc, z: n.z, need: needFor('st') };
  }
  return crossingClean(d, a, b) ? { a, b } : null;
}

/** a and b on the sidewalk, and every step between them on sidewalk or crosswalk (never mid-road). */
function crossingClean(d: DistrictDef, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  if (asphaltAt(d, a.x, a.z) || asphaltAt(d, b.x, b.z)) return false;
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  if (L > 40) return false;
  const steps = Math.ceil(L / 0.5);
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    if (surfaceAt(d, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) === 'road') return false;
  }
  return true;
}

/**
 * A pedestrian's route from (fx, fz) to (tx, tz): sidewalk legs, and road
 * crossings as [kerb, far kerb (need = signal)] pairs on the crosswalks.
 * Both ends are moved onto the sidewalk if they aren't. Empty if there's no way.
 */
export function pedPath(g: PedGrid, fx: number, fz: number, tx: number, tz: number, rand: () => number = Math.random): PedPoint[] {
  const s = nearestStand(g, fx, fz);
  const t = nearestStand(g, tx, tz);
  if (!s || !t) return [];
  const start = cellOf(g, s.x, s.z);
  const goal = cellOf(g, t.x, t.z);
  if (start === goal) return [{ x: t.x, z: t.z }];
  if (g.island[start] !== g.island[goal]) return []; // can't get there: don't search the whole island
  const tc = goal % g.cols, tr = Math.floor(goal / g.cols);
  // Scratch arrays live with the grid; a stamp per search marks what's
  // been touched, so nothing is cleared or allocated per route.
  const sc = scratch(g);
  const gen = ++sc.gen;
  const { gScore, came, seen, heap } = sc;
  heap.clear();
  const open = (i: number) => seen[i] === gen;
  seen[start] = gen;
  gScore[start] = 0;
  came[start] = -1;
  heap.push(start, 0);
  const h = (i: number) => {
    const dx = Math.abs((i % g.cols) - tc), dz = Math.abs(Math.floor(i / g.cols) - tr);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  let found = false;
  let guard = 0;
  while (heap.size > 0 && guard++ < 60_000) {
    const cur = heap.pop();
    if (cur === goal) {
      found = true;
      break;
    }
    if (closedAt(sc, cur, gen)) continue;
    closeAt(sc, cur, gen);
    const cc = cur % g.cols, cr = Math.floor(cur / g.cols);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue;
      const nc = cc + dc, nr = cr + dr;
      if (nc < 1 || nr < 1 || nc >= g.cols - 1 || nr >= g.rows - 1) continue;
      const ni = nr * g.cols + nc;
      if (closedAt(sc, ni, gen) || !canStep(g, cur, ni, dc, dr)) continue;
      // Crossing costs a little extra: people stay on their side unless the route needs it.
      const cost = gScore[cur] + (dc && dr ? 1.414 : 1) + (g.cls[ni] !== PED.walk && g.cls[cur] === PED.walk ? 3 : 0);
      if (!open(ni) || cost < gScore[ni]) {
        if (!open(ni)) seen[ni] = gen;
        gScore[ni] = cost;
        came[ni] = cur;
        heap.push(ni, cost + h(ni));
      }
    }
  }
  if (!found) return [];
  const cells: number[] = [];
  for (let i = goal; i !== -1; i = came[i]) cells.push(i);
  cells.reverse();

  // Split into sidewalk legs and crossings.
  const out: PedPoint[] = [];
  let leg: { x: number; z: number }[] = [s];
  const flush = (end: { x: number; z: number }) => {
    leg.push(end);
    out.push(...smoothLeg(g, leg));
  };
  for (let k = 1; k < cells.length; k++) {
    const cl = g.cls[cells[k]];
    if (cl === PED.walk) {
      leg.push(k === cells.length - 1 ? t : centre(g, cells[k]));
      continue;
    }
    // A run of crossing cells: k..e-1.
    let e = k;
    while (e < cells.length && g.cls[cells[e]] !== PED.walk) e++;
    const p = leg[leg.length - 1];
    const n = e < cells.length ? (e === cells.length - 1 ? t : centre(g, cells[e])) : t;
    // On the paint if it's clean, else straight across between the two sidewalk cells.
    const ends = crossingEnds(g.d, cl, p, n, (rand() - 0.5) * 1.6) ?? (crossingClean(g.d, p, n) ? { a: { ...p }, b: { ...n, need: needFor(cl === PED.crossX ? 'ave' : 'st') } } : null);
    if (!ends) return []; // an odd corner of the map: better no walk than one through traffic
    flush(ends.a);
    out.push(ends.b);
    leg = [ends.b];
    k = e - 1;
  }
  if (leg.length > 1) out.push(...smoothLeg(g, leg));
  return out;
}

// ---------------------------------------------------------------------
// Walking a route
// ---------------------------------------------------------------------

/**
 * The traffic signals, as pedestrians see them (traffic-flow.ts
 * TrafficFlow.greenLeft): seconds of green left for a group (0 = red).
 */
export interface PedSignals {
  greenLeft(axis: SignalAxis): number;
}

export interface Walker {
  x: number;
  z: number;
  heading: number;
  /** Walking speed (m/s, before the crowd's 1.4× stride). */
  speed: number;
  path: PedPoint[];
  /** On the road, crossing to path[0]: keeps going until the far kerb. */
  crossing: boolean;
  /** At the kerb, waiting for the walk phase. */
  waiting: boolean;
}

/** The crowd walks at 1.4× the personality speed (crowd.ts, crowd-brain.ts). */
export const STRIDE = 1.4;

/**
 * One step along a route. At a kerb (the next point needs a signal) the
 * walker sets off only if the green has time left to get all the way
 * over (+0.5 s); otherwise it waits there, facing the road. Once on the
 * road it never stops before the far kerb. Returns what it did:
 * 'moving', 'waiting', 'reached' (got to a point: shifted off the path).
 * No signals = no traffic: cross any time.
 */
export function stepWalker(w: Walker, dt: number, signals?: PedSignals | null): 'moving' | 'waiting' | 'reached' {
  const wp = w.path[0];
  const dx = wp.x - w.x, dz = wp.z - w.z;
  const dist = Math.hypot(dx, dz);
  const pace = w.speed * STRIDE;
  w.waiting = false;
  if (wp.need && !w.crossing) {
    const left = signals ? signals.greenLeft(wp.need) : Infinity;
    if (left >= dist / pace + 0.5) w.crossing = true;
    else {
      w.waiting = true;
      let diff = Math.atan2(dx, dz) - w.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      w.heading += diff * Math.min(1, dt * 4);
      return 'waiting';
    }
  }
  // The far kerb counts only once actually there (it's close to the asphalt).
  if (dist < (wp.need ? 1e-3 : 0.6)) {
    w.path.shift();
    w.crossing = false;
    return 'reached';
  }
  const step = Math.min(dist, pace * dt);
  w.x += (dx / dist) * step;
  w.z += (dz / dist) * step;
  let diff = Math.atan2(dx, dz) - w.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  w.heading += diff * Math.min(1, dt * 8);
  return 'moving';
}

interface Scratch {
  gen: number;
  gScore: Float32Array;
  came: Int32Array;
  /** Search stamp per cell: gen = opened this search; closed = in `shut`. */
  seen: Uint32Array;
  shut: Uint32Array;
  heap: MinHeap;
}
const scratches = new WeakMap<PedGrid, Scratch>();
function scratch(g: PedGrid): Scratch {
  let s = scratches.get(g);
  if (!s) {
    const N = g.cols * g.rows;
    s = { gen: 0, gScore: new Float32Array(N), came: new Int32Array(N), seen: new Uint32Array(N), shut: new Uint32Array(N), heap: new MinHeap() };
    scratches.set(g, s);
  }
  return s;
}
const closedAt = (s: Scratch, i: number, gen: number) => s.shut[i] === gen;
const closeAt = (s: Scratch, i: number, gen: number) => void (s.shut[i] = gen);

/** Small binary heap for A*'s open list. */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  clear(): void {
    this.ids.length = 0;
    this.keys.length = 0;
  }
  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      [this.ids[i], this.ids[p]] = [this.ids[p], this.ids[i]];
      [this.keys[i], this.keys[p]] = [this.keys[p], this.keys[i]];
      i = p;
    }
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        [this.ids[i], this.ids[m]] = [this.ids[m], this.ids[i]];
        [this.keys[i], this.keys[m]] = [this.keys[m], this.keys[i]];
        i = m;
      }
    }
    return top;
  }
}
