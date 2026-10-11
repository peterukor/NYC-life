// =====================================================================
// nav.ts — where people can walk, and how they find a route.
//
// We lay a grid of 3 m cells over the area. A cell is walkable if it's
// street, sidewalk, plaza or park; it's blocked if it's inside a building
// footprint, a fenced lot, or the river. Routes are found with A* (the
// classic game pathfinding algorithm) and then "smoothed" so people walk
// in straight lines instead of grid zig-zags.
// =====================================================================

import { blockRect, districtBounds, SIDEWALK, type DistrictDef, type Rect } from './layout.ts';
import { onLand } from './geo-proj.ts';
import { onCorridor } from './corridors.ts';

export const CELL = 3;

export interface NavGrid {
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  /** 1 = walkable, 0 = blocked. */
  walk: Uint8Array;
}

/** `solids` are extra no-walk rectangles (e.g. a screen tower inside a plaza). */
export function buildNavGrid(d: DistrictDef, solids: Rect[] = []): NavGrid {
  const b = districtBounds(d, 30);
  const cols = Math.ceil((b.maxX - b.minX) / CELL);
  const rows = Math.ceil((b.maxZ - b.minZ) / CELL);
  const walk = new Uint8Array(cols * rows).fill(1);
  const grid: NavGrid = { cols, rows, minX: b.minX, minZ: b.minZ, walk };

  const block = (r: Rect) => {
    const c0 = Math.max(0, Math.floor((r.minX - b.minX) / CELL));
    const c1 = Math.min(cols - 1, Math.floor((r.maxX - b.minX) / CELL));
    const r0 = Math.max(0, Math.floor((r.minZ - b.minZ) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((r.maxZ - b.minZ) / CELL));
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) walk[rr * cols + cc] = 0;
  };

  for (let c = 0; c < d.cols; c++) {
    for (let r = 0; r < d.rows; r++) {
      const kind = d.kind(c, r);
      if (kind === 'plaza' || kind === 'park') continue;
      const br = blockRect(d, c, r);
      // Keep the sidewalk ring walkable; block what's inside it.
      block({ minX: br.minX + SIDEWALK, maxX: br.maxX - SIDEWALK, minZ: br.minZ + SIDEWALK, maxZ: br.maxZ - SIDEWALK });
    }
  }

  // Broadway and the ring road cut through blocks: walkable again there.
  for (let rr = 0; rr < rows; rr++) {
    for (let cc = 0; cc < cols; cc++) {
      if (!walk[rr * cols + cc] && onCorridor(d.id, b.minX + (cc + 0.5) * CELL, b.minZ + (rr + 0.5) * CELL)) walk[rr * cols + cc] = 1;
    }
  }

  for (const r of solids) block(r);

  // The river: anything off the borough's real coastline is water.
  for (let rr = 0; rr < rows; rr++) {
    for (let cc = 0; cc < cols; cc++) {
      if (!onLand(d.borough, b.minX + (cc + 0.5) * CELL, b.minZ + (rr + 0.5) * CELL)) walk[rr * cols + cc] = 0;
    }
  }
  return grid;
}

function cellOf(g: NavGrid, x: number, z: number): [number, number] {
  return [Math.floor((x - g.minX) / CELL), Math.floor((z - g.minZ) / CELL)];
}

export function isWalkable(g: NavGrid, x: number, z: number): boolean {
  const [c, r] = cellOf(g, x, z);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return false;
  return g.walk[r * g.cols + c] === 1;
}

/** Nearest walkable point to (x, z), searching outward in rings. */
export function nearestWalkable(g: NavGrid, x: number, z: number): { x: number; z: number } {
  if (isWalkable(g, x, z)) return { x, z };
  const [c0, r0] = cellOf(g, x, z);
  for (let rad = 1; rad < 40; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue;
        if (g.walk[r * g.cols + c]) return { x: g.minX + (c + 0.5) * CELL, z: g.minZ + (r + 0.5) * CELL };
      }
    }
  }
  return { x, z };
}

/**
 * A* route from one point to another. Returns a list of waypoints
 * (already smoothed), or an empty list if there's no way through.
 */
export function findPath(g: NavGrid, fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
  const s = nearestWalkable(g, fx, fz);
  const t = nearestWalkable(g, tx, tz);
  const [sc, sr] = cellOf(g, s.x, s.z);
  const [tc, tr] = cellOf(g, t.x, t.z);
  const N = g.cols * g.rows;
  const start = sr * g.cols + sc;
  const goal = tr * g.cols + tc;
  if (start === goal) return [{ x: tx, z: tz }];

  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  gScore[start] = 0;
  heap.push(start, 0);

  const h = (i: number) => {
    const dx = Math.abs((i % g.cols) - tc);
    const dz = Math.abs(Math.floor(i / g.cols) - tr);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); // octile distance
  };

  let found = false;
  let guard = 0;
  while (heap.size > 0 && guard++ < 60_000) {
    const cur = heap.pop();
    if (cur === goal) {
      found = true;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % g.cols;
    const cr = Math.floor(cur / g.cols);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nc = cc + dx;
        const nr = cr + dz;
        if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
        const ni = nr * g.cols + nc;
        if (!g.walk[ni] || closed[ni]) continue;
        // Don't cut diagonally through building corners.
        if (dx && dz && (!g.walk[cr * g.cols + nc] || !g.walk[nr * g.cols + cc])) continue;
        const cost = gScore[cur] + (dx && dz ? 1.414 : 1);
        if (cost < gScore[ni]) {
          gScore[ni] = cost;
          came[ni] = cur;
          heap.push(ni, cost + h(ni));
        }
      }
    }
  }
  if (!found) return [];

  const cells: number[] = [];
  for (let i = goal; i !== -1; i = came[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => ({ x: g.minX + ((i % g.cols) + 0.5) * CELL, z: g.minZ + (Math.floor(i / g.cols) + 0.5) * CELL }));
  pts[pts.length - 1] = { x: tx, z: tz };
  return smooth(g, [{ x: s.x, z: s.z }, ...pts]);
}

/** Remove waypoints you can skip by walking in a straight line ("string pulling"). */
function smooth(g: NavGrid, pts: { x: number; z: number }[]): { x: number; z: number }[] {
  if (pts.length <= 2) return pts.slice(1);
  const out: { x: number; z: number }[] = [];
  let anchor = 0;
  while (anchor < pts.length - 1) {
    let far = anchor + 1;
    for (let j = pts.length - 1; j > anchor + 1; j--) {
      if (lineClear(g, pts[anchor], pts[j])) {
        far = j;
        break;
      }
    }
    out.push(pts[far]);
    anchor = far;
  }
  return out;
}

function lineClear(g: NavGrid, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(dist / (CELL * 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isWalkable(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

/** Small binary heap for A*'s open list. */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
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
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
