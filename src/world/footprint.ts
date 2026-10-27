// =====================================================================
// footprint.ts — homes and venues that aren't rectangles (Peter,
// 2026-10-27: "I don't like the way that it's rectangular").
//
// A SHAPED layout (HomeLayout.shaped) is the union of its rooms: an L,
// a T, wings round a courtyard… Its outer walls are traced round the
// edge of that union (outline), and furniture must stay inside it.
// Old layouts (not shaped) keep their plain outer box.
//
// Pure maths, no three.js, so it's easy to test.
// =====================================================================

import type { HomeLayout } from '../data/homes.ts';

/** A stretch of outer wall: from a to b, with the normal pointing OUT of the home. */
export interface Edge { ax: number; az: number; bx: number; bz: number; nx: number; nz: number }

const EPS = 1e-6;

/** Is the point inside one of the rooms? */
export function insideRooms(layout: HomeLayout, x: number, z: number): boolean {
  for (const r of layout.rooms) if (x >= r.rect[0] - EPS && x <= r.rect[2] + EPS && z >= r.rect[1] - EPS && z <= r.rect[3] + EPS) return true;
  return false;
}

/** Is the whole rectangle inside the home (every bit of it on some room's floor)? */
export function rectInsideRooms(layout: HomeLayout, x0: number, z0: number, x1: number, z1: number): boolean {
  if (x1 < x0 || z1 < z0) return insideRooms(layout, (x0 + x1) / 2, (z0 + z1) / 2);
  const nx = Math.max(1, Math.ceil((x1 - x0) / 0.25)), nz = Math.max(1, Math.ceil((z1 - z0) / 0.25));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    if (!insideRooms(layout, x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz)) return false;
  }
  return true;
}

const outlineCache = new WeakMap<HomeLayout, Edge[]>();

/** The outer walls of a shaped home: the edge of the union of its rooms, merged into long straight runs. */
export function outline(layout: HomeLayout): Edge[] {
  const hit = outlineCache.get(layout);
  if (hit) return hit;
  const xs = [...new Set(layout.rooms.flatMap((r) => [r.rect[0], r.rect[2]]))].sort((a, b) => a - b);
  const zs = [...new Set(layout.rooms.flatMap((r) => [r.rect[1], r.rect[3]]))].sort((a, b) => a - b);
  const W = xs.length - 1, D = zs.length - 1;
  const cell = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < D && insideRooms(layout, (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
  const raw: Edge[] = [];
  for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) {
    if (!cell(i, j)) continue;
    const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
    if (!cell(i, j - 1)) raw.push({ ax: x0, az: z0, bx: x1, bz: z0, nx: 0, nz: -1 });
    if (!cell(i, j + 1)) raw.push({ ax: x0, az: z1, bx: x1, bz: z1, nx: 0, nz: 1 });
    if (!cell(i - 1, j)) raw.push({ ax: x0, az: z0, bx: x0, bz: z1, nx: -1, nz: 0 });
    if (!cell(i + 1, j)) raw.push({ ax: x1, az: z0, bx: x1, bz: z1, nx: 1, nz: 0 });
  }
  // Merge touching pieces on the same line facing the same way.
  const key = (e: Edge) => (e.nz ? `z${e.az}:${e.nz}` : `x${e.ax}:${e.nx}`);
  const groups = new Map<string, Edge[]>();
  for (const e of raw) (groups.get(key(e)) ?? groups.set(key(e), []).get(key(e))!).push(e);
  const out: Edge[] = [];
  for (const list of groups.values()) {
    const alongX = list[0].nz !== 0;
    list.sort((a, b) => (alongX ? a.ax - b.ax : a.az - b.az));
    let cur = { ...list[0] };
    for (let k = 1; k < list.length; k++) {
      const e = list[k];
      if (alongX ? Math.abs(e.ax - cur.bx) < EPS : Math.abs(e.az - cur.bz) < EPS) {
        cur.bx = e.bx;
        cur.bz = e.bz;
      } else {
        out.push(cur);
        cur = { ...e };
      }
    }
    out.push(cur);
  }
  outlineCache.set(layout, out);
  return out;
}

/** The front door: where you come in (shaped layouts say; old ones use the middle of the front wall). */
export function doorOfLayout(layout: HomeLayout): { x: number; z: number; nx: number; nz: number } {
  if (layout.door) {
    const e = nearestEdge(layout, layout.door.x, layout.door.z);
    return { x: layout.door.x, z: layout.door.z, nx: e?.nx ?? 0, nz: e?.nz ?? 1 };
  }
  return { x: 0, z: layout.depth / 2, nx: 0, nz: 1 };
}

/** The outer wall nearest a point, and where on it the point lands. */
export function nearestEdge(layout: HomeLayout, x: number, z: number): (Edge & { px: number; pz: number; d: number }) | null {
  let best: (Edge & { px: number; pz: number; d: number }) | null = null;
  for (const e of outline(layout)) {
    const px = Math.min(Math.max(x, Math.min(e.ax, e.bx)), Math.max(e.ax, e.bx));
    const pz = Math.min(Math.max(z, Math.min(e.az, e.bz)), Math.max(e.az, e.bz));
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { ...e, px, pz, d };
  }
  return best;
}
