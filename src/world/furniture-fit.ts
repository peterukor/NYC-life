// =====================================================================
// furniture-fit.ts — where a piece of furniture may stand in a home.
//
// Pure maths (no three.js scene), so it is easy to test:
//   • a piece must stay inside the outer walls,
//   • it can't cross an inside wall,
//   • it can't block a doorway (or the front door),
//   • it can't overlap another piece.
// Rugs and shoe piles ("flat") only need to be inside the home: they
// slide under things. Wall pieces (posters, a window AC) hang on the
// outer walls and only bump into other wall pieces.
// =====================================================================

import type { HomeItem, HomeLayout } from '../data/homes.ts';

export interface Rect { x0: number; z0: number; x1: number; z1: number }
/** A piece's footprint around its own centre, before turning (metres). */
export interface Footprint { minX: number; maxX: number; minZ: number; maxZ: number }
export type FitKind = 'floor' | 'flat' | 'wall';

export const WALL_T = 0.2;
/** How far into the room a doorway is kept clear, each side of the wall. */
const DOOR_CLEAR = 0.35;
/** Pieces may touch; tiny overlaps from rounding are forgiven. */
const SLACK = 0.03;
/** Pieces can tuck a few cm into a wall's thickness (they're pushed flat against it). */
const WALL_SLACK = 0.06;

const overlaps = (a: Rect, b: Rect, slack = SLACK) => a.x0 < b.x1 - slack && a.x1 > b.x0 + slack && a.z0 < b.z1 - slack && a.z1 > b.z0 + slack;

/** The footprint of a piece at (x, z) turned by `rot`, as a box on the floor. */
export function rectAt(fp: Footprint, x: number, z: number, rot: number): Rect {
  const c = Math.cos(rot), s = Math.sin(rot);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [px, pz] of [[fp.minX, fp.minZ], [fp.maxX, fp.minZ], [fp.minX, fp.maxZ], [fp.maxX, fp.maxZ]]) {
    // three.js turns +z towards +x for a positive angle about y.
    const wx = x + px * c + pz * s;
    const wz = z - px * s + pz * c;
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
  }
  return { x0, z0, x1, z1 };
}

/** The solid bits of every inside wall, and the keep-clear zones at doorways. */
export function wallRects(layout: HomeLayout): { solid: Rect[]; doors: Rect[] } {
  const solid: Rect[] = [];
  const doors: Rect[] = [];
  const hw = layout.width / 2, hd = layout.depth / 2;
  const t = WALL_T / 2;
  for (const w of layout.walls) {
    const [ax, az] = w.a, [bx, bz] = w.b;
    const alongX = Math.abs(bz - az) < 1e-3;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const seg = (s0: number, s1: number, pad: number, out: Rect[]) => {
      if (s1 - s0 < 1e-3) return;
      const p = [ax + dx * s0, az + dz * s0], q = [ax + dx * s1, az + dz * s1];
      out.push(alongX
        ? { x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), z0: az - pad, z1: az + pad }
        : { x0: ax - pad, x1: ax + pad, z0: Math.min(p[1], q[1]), z1: Math.max(p[1], q[1]) });
    };
    let s = 0;
    for (const [g0, g1] of [...(w.gaps ?? [])].sort((p, q) => p[0] - q[0])) {
      seg(s, g0, t, solid);
      seg(g0, g1, DOOR_CLEAR, doors);
      s = g1;
    }
    seg(s, len, t, solid);
  }
  // The front door: the middle of the front wall (see home-interior.ts).
  doors.push({ x0: -1.2, x1: 1.2, z0: hd - 1.0, z1: hd });
  void hw;
  return { solid, doors };
}

export interface FitWorld {
  layout: HomeLayout;
  items: HomeItem[];
  footprint: (item: string) => Footprint | null;
  kind: (item: string) => FitKind;
}

/** Why a piece can't stand there (null = it fits). */
export function whyNot(w: FitWorld, uid: string, x: number, z: number, rot: number): string | null {
  const it = w.items.find((i) => i.uid === uid);
  if (!it) return 'missing';
  const fp = w.footprint(it.item);
  if (!fp) return null;
  const r = rectAt(fp, x, z, rot);
  const hw = w.layout.width / 2, hd = w.layout.depth / 2;
  const inner = WALL_T / 2 - WALL_SLACK;
  if (r.x0 < -hw + inner || r.x1 > hw - inner || r.z0 < -hd + inner || r.z1 > hd - inner) return 'Too close to the wall';
  const kind = w.kind(it.item);
  if (kind === 'flat') return null;
  if (kind === 'floor') {
    const { solid, doors } = wallRects(w.layout);
    if (solid.some((s) => overlaps(r, s, WALL_SLACK))) return 'That goes through a wall';
    if (doors.some((d) => overlaps(r, d, SLACK))) return 'That blocks a doorway';
  }
  for (const o of w.items) {
    if (o.uid === uid) continue;
    const ok = w.kind(o.item);
    // Floor pieces bump into floor pieces; wall pieces into wall pieces.
    if (ok === 'flat' || ok !== kind) continue;
    const ofp = w.footprint(o.item);
    if (ofp && overlaps(r, rectAt(ofp, o.x, o.z, o.rot))) return 'Something’s already there';
  }
  return null;
}

/**
 * Wall pieces snap to the nearest outer wall (left, right or back) and
 * face into the room. Returns the snapped spot.
 */
export function snapToWall(w: FitWorld, item: string, x: number, z: number): { x: number; z: number; rot: number } {
  const fp = w.footprint(item) ?? { minX: -0.2, maxX: 0.2, minZ: -0.05, maxZ: 0.05 };
  const depth = fp.maxZ - fp.minZ, half = (fp.maxX - fp.minX) / 2;
  const hw = w.layout.width / 2, hd = w.layout.depth / 2;
  const inset = WALL_T / 2 + depth / 2 + 0.005;
  const dl = x + hw, dr = hw - x, db = z + hd;
  const clampX = (v: number) => Math.min(hw - WALL_T / 2 - half, Math.max(-hw + WALL_T / 2 + half, v));
  const clampZ = (v: number) => Math.min(hd - 0.6 - half, Math.max(-hd + WALL_T / 2 + half, v));
  if (db <= dl && db <= dr) return { x: clampX(x), z: -hd + inset, rot: 0 };
  if (dl <= dr) return { x: -hw + inset, z: clampZ(z), rot: Math.PI / 2 };
  return { x: hw - inset, z: clampZ(z), rot: -Math.PI / 2 };
}

/** Is a standing spot (a circle of radius r) clear of walls and furniture? */
export function spotFree(w: FitWorld, x: number, z: number, r = 0.22): boolean {
  const hw = w.layout.width / 2, hd = w.layout.depth / 2;
  if (x - r < -hw + WALL_T / 2 || x + r > hw - WALL_T / 2 || z - r < -hd + WALL_T / 2 || z + r > hd - WALL_T / 2) return false;
  const me: Rect = { x0: x - r, x1: x + r, z0: z - r, z1: z + r };
  if (wallRects(w.layout).solid.some((s) => overlaps(me, s, 0))) return false;
  for (const o of w.items) {
    if (w.kind(o.item) !== 'floor') continue;
    const fp = w.footprint(o.item);
    if (fp && overlaps(me, rectAt(fp, o.x, o.z, o.rot), 0)) return false;
  }
  return true;
}

/**
 * Walking indoors: a grid of standing spots (20 cm squares) that are clear
 * of walls and furniture, and a shortest path across it (A*, 8 directions,
 * no cutting corners). Rebuild the grid after furniture moves.
 */
export class WalkGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private x0: number;
  private z0: number;
  private free: Uint8Array;

  constructor(w: FitWorld, cell = 0.2, radius = 0.2) {
    this.cell = cell;
    const hw = w.layout.width / 2, hd = w.layout.depth / 2;
    this.x0 = -hw;
    this.z0 = -hd;
    this.cols = Math.ceil(w.layout.width / cell);
    this.rows = Math.ceil(w.layout.depth / cell);
    this.free = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const p = this.centre(c, r);
      this.free[r * this.cols + c] = spotFree(w, p.x, p.z, radius) ? 1 : 0;
    }
  }

  centre(c: number, r: number): { x: number; z: number } {
    return { x: this.x0 + (c + 0.5) * this.cell, z: this.z0 + (r + 0.5) * this.cell };
  }

  private at(x: number, z: number): [number, number] {
    return [Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cell))), Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.z0) / this.cell)))];
  }

  isFree(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.free[r * this.cols + c] === 1;
  }

  /** The free cell nearest a spot (searching outwards), or null if the home is full. */
  nearestFree(x: number, z: number): [number, number] | null {
    const [c0, r0] = this.at(x, z);
    if (this.isFree(c0, r0)) return [c0, r0];
    let best: [number, number] | null = null, bd = Infinity;
    for (let ring = 1; ring < Math.max(this.cols, this.rows); ring++) {
      for (let r = r0 - ring; r <= r0 + ring; r++) for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== ring || !this.isFree(c, r)) continue;
        const p = this.centre(c, r);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = [c, r]; }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Shortest walk from one spot to another, as waypoints (the last is the
   * goal, or the nearest reachable free spot to it). Null if there's no way.
   */
  path(fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] | null {
    const s = this.nearestFree(fx, fz), g = this.nearestFree(tx, tz);
    if (!s || !g) return null;
    const n = this.cols * this.rows;
    const id = (c: number, r: number) => r * this.cols + c;
    const gs = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [id(s[0], s[1])];
    gs[open[0]] = 0;
    const h = (i: number) => Math.hypot((i % this.cols) - g[0], Math.floor(i / this.cols) - g[1]);
    const goal = id(g[0], g[1]);
    while (open.length) {
      // Small grids (a few thousand cells): a linear scan for the best is fine.
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (gs[open[k]] + h(open[k]) < gs[open[bi]] + h(open[bi])) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const c = cur % this.cols, r = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc, nr = r + dr;
        if (!this.isFree(nc, nr)) continue;
        if (dc && dr && (!this.isFree(c + dc, r) || !this.isFree(c, r + dr))) continue; // no corner cutting
        const ni = id(nc, nr);
        const ng = gs[cur] + (dc && dr ? Math.SQRT2 : 1);
        if (ng < gs[ni]) {
          gs[ni] = ng;
          from[ni] = cur;
          open.push(ni);
        }
      }
    }
    if (gs[goal] === Infinity) return null;
    const cells: number[] = [];
    for (let i = goal; i !== -1; i = from[i]) cells.unshift(i);
    // Keep only the corners: drop cells you can walk straight past.
    const pts = cells.map((i) => this.centre(i % this.cols, Math.floor(i / this.cols)));
    const out: { x: number; z: number }[] = [];
    let anchor = { x: fx, z: fz };
    for (let k = 1; k < pts.length; k++) {
      if (!this.clearLine(anchor, pts[k])) {
        out.push(pts[k - 1]);
        anchor = pts[k - 1];
      }
    }
    // End exactly on the goal when it's free, else on the nearest free spot.
    const [gc, gr] = this.at(tx, tz);
    out.push(gc === g[0] && gr === g[1] ? { x: tx, z: tz } : pts[pts.length - 1]);
    return out;
  }

  /** Can you walk in a straight line between two spots? (Samples every half cell.) */
  clearLine(a: { x: number; z: number }, b: { x: number; z: number }): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let k = 0; k <= steps; k++) {
      const [c, r] = this.at(a.x + ((b.x - a.x) * k) / steps, a.z + ((b.z - a.z) * k) / steps);
      if (!this.isFree(c, r)) return false;
    }
    return true;
  }
}
