// =====================================================================
// houses.ts — HOME BLOCKS: streets of houses that are already built
// (Peter, 2026-10-12: "no empty plots, just build the houses already,
// players will buy them"). Four kinds, the same as data/plots.ts HOUSES:
//
//   tiny      — 1 space:  a one-floor cottage with a gable roof, porch,
//               picket fence and a tree in the yard
//   townhouse — 2 spaces: three floors of brownstone with a stoop, iron
//               railings and a little front garden
//   villa     — 4 spaces: two-floor modern house, roof overhang, a pool
//               out back, hedges and a driveway with a car
//   mansion   — 8 spaces: big three-floor house with a hipped roof and two
//               wings, a fountain in the front court, gate pillars, a
//               pool, hedge walls and lawns
//
// A home block is two rows of 8 spaces, back to back: the north row faces
// the north street, the south row the south street (16 spaces in all, as
// in data/plots.ts BLOCK_SPACES). The block's template (data/plot-picks.ts)
// says which houses fill the rows.
//
// Houses are BuildingPlans with a `house` field, so the see-through fade,
// the far stand-ins and tap-to-walk all work like any other building.
// =====================================================================

import type { Rng } from '../../core/rng.ts';
import type { Rect } from '../layout.ts';
import type { HomeTemplate } from '../../data/plot-picks.ts';
import { TILE } from './atlas.ts';
import type { CityMeshBuilder } from './builder.ts';
import type { BuildingPlan, Face } from './buildings.ts';
import { parkedCar, tree, treeSimple } from './props.ts';

export type HouseKind = 'tiny' | 'townhouse' | 'villa' | 'mansion';

export interface HouseSpec {
  kind: HouseKind;
  /** The whole lot (garden included). */
  lot: Rect;
  /** Swimming pool, if any. */
  pool: Rect | null;
  lawn: string;
}

const SPACES: Record<HouseKind, number> = { tiny: 1, townhouse: 2, villa: 4, mansion: 8 };
const KIND_OF: Record<number, HouseKind> = { 1: 'tiny', 2: 'townhouse', 4: 'villa', 8: 'mansion' };

/** Row patterns (spaces per house, adding up to 8). */
const ROWS: Record<HomeTemplate, number[][]> = {
  tiny: [[1, 1, 1, 1, 1, 1, 1, 1]],
  townhouse: [[2, 2, 2, 2]],
  villa: [[4, 4]],
  mansion: [[8]],
  mix: [[4, 2, 1, 1], [2, 2, 4], [1, 1, 2, 4], [2, 1, 1, 4], [1, 1, 2, 2, 1, 1]],
};

const WALLS: Record<HouseKind, string[]> = {
  tiny: ['#f6d7a7', '#bfe3d0', '#f7b9b0', '#cfe0f7', '#fff1b8', '#e7d1f5', '#ffffff'],
  townhouse: ['#a0664c', '#b07457', '#c98b6b', '#e8a7a0', '#a9c8a1', '#f1d29a', '#9fc0de'],
  villa: ['#ffffff', '#f4efe6', '#e9f3f6', '#fbe8d8'],
  mansion: ['#f3e6c9', '#f6efe2', '#e9dccb', '#f1e4d4'],
};
const ROOFS: Record<HouseKind, string[]> = {
  tiny: ['#d9534f', '#3a86ff', '#2a9d8f', '#8d5a97', '#e07a3f', '#4f5d75'],
  townhouse: ['#7d828f', '#6f7684'],
  villa: ['#f4f1ea', '#e9e4da', '#dfe6ea'],
  mansion: ['#4f5d75', '#5b6b8c', '#7a4e3a', '#3f5e5a'],
};
const LAWNS = ['#8fd27a', '#86cf73', '#97d683', '#7fc86c'];
const HEDGE = '#4e9b4a';
const PATH = '#e8dcc4';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}

/** Plan every house on a home block. `inner` = the land inside the sidewalk. */
export function planHomeBlock(inner: Rect, template: HomeTemplate, rng: Rng, newId: () => number): BuildingPlan[] {
  const out: BuildingPlan[] = [];
  const midZ = (inner.minZ + inner.maxZ) / 2;
  const W = inner.maxX - inner.minX;
  const space = W / 8;
  for (const front of ['n', 's'] as Face[]) {
    const pattern = rng.pick(ROWS[template]);
    // Mirror the south row now and then so big houses aren't all stacked.
    const row = front === 's' && rng.chance(0.5) ? [...pattern].reverse() : pattern;
    let x = inner.minX;
    for (const n of row) {
      const kind = KIND_OF[n];
      const lot: Rect = { minX: x, maxX: x + n * space, minZ: front === 'n' ? inner.minZ : midZ, maxZ: front === 'n' ? midZ : inner.maxZ };
      x += n * space;
      out.push(planHouse(kind, lot, front, rng, newId()));
    }
  }
  return out;
}

function planHouse(kind: HouseKind, lot: Rect, front: Face, rng: Rng, id: number): BuildingPlan {
  const lw = lot.maxX - lot.minX;
  const ld = lot.maxZ - lot.minZ;
  // Footprint (w across, d deep), front setback and floors.
  // Big, chunky houses that fill their lot (cartoon scale, Peter 2026-10-12).
  const spec = {
    tiny: { w: Math.min(lw - 4, Math.max(11, lw * 0.68)), d: Math.min(ld * 0.42, 16), set: Math.min(ld * 0.2, 9), floors: 1, fh: 4.6 },
    // Townhouses stand wall to wall: a street of them reads as one terrace.
    townhouse: { w: lw - 0.3, d: Math.min(ld * 0.5, 24), set: Math.min(ld * 0.12, 5), floors: 3, fh: 4.0 },
    villa: { w: Math.min(lw * 0.58, 46), d: Math.min(ld * 0.48, 24), set: Math.min(ld * 0.18, 9), floors: 2, fh: 4.4 },
    mansion: { w: Math.min(lw * 0.36, 58), d: Math.min(ld * 0.5, 28), set: Math.min(ld * 0.24, 14), floors: 3, fh: 4.8 },
  }[kind];
  const cx = kind === 'villa' ? lot.minX + lw * (rng.chance(0.5) ? 0.4 : 0.6) : (lot.minX + lot.maxX) / 2;
  const z0 = front === 'n' ? lot.minZ + spec.set : lot.maxZ - spec.set - spec.d;
  const rect: Rect = { minX: cx - spec.w / 2, maxX: cx + spec.w / 2, minZ: z0, maxZ: z0 + spec.d };
  // Pools sit in the back garden.
  let pool: Rect | null = null;
  if (kind === 'villa' || kind === 'mansion') {
    const pw = kind === 'mansion' ? Math.min(22, spec.w * 0.55) : Math.min(13, spec.w * 0.55);
    const pd = kind === 'mansion' ? 8 : 6;
    const back = front === 'n' ? rect.maxZ : rect.minZ;
    const room = front === 'n' ? lot.maxZ - back : back - lot.minZ;
    if (room > pd + 5) {
      const pz = front === 'n' ? back + (room - pd) / 2 : back - (room - pd) / 2 - pd;
      pool = { minX: cx - pw / 2, maxX: cx + pw / 2, minZ: pz, maxZ: pz + pd };
    }
  }
  const roofH = kind === 'tiny' ? 3.6 : kind === 'mansion' ? 6 : 0;
  return {
    id,
    style: 'brownstone', // only used for far-away fallbacks; `house` drives the look
    rect,
    front,
    corner: null,
    floors: spec.floors,
    floorH: spec.fh,
    height: spec.floors * spec.fh + roofH + 0.6,
    tiers: [{ inset: 0, floors: spec.floors }],
    color: rng.pick(WALLS[kind]),
    trim: '#fbf7ee',
    roofColor: rng.pick(ROOFS[kind]),
    roof: 'plain',
    shop: false,
    awning: null,
    fireEscape: false,
    seed: rng.int(0, 9999),
    house: { kind, lot, pool, lawn: rng.pick(LAWNS) },
  };
}

// ---------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------

const V = (x: number, y: number, z: number) => ({ x, y, z });

/** Gable roof, ridge running east–west. */
function gableRoof(b: CityMeshBuilder, r: Rect, y: number, h: number, color: string, gableColor: string): void {
  const oh = 0.7; // overhang
  const x0 = r.minX - oh, x1 = r.maxX + oh, z0 = r.minZ - oh, z1 = r.maxZ + oh;
  const cz = (r.minZ + r.maxZ) / 2;
  const yr = y + h;
  b.quad(V(x1, y, z0), V(x0, y, z0), V(x0, yr, cz), V(x1, yr, cz), color);
  b.quad(V(x0, y, z1), V(x1, y, z1), V(x1, yr, cz), V(x0, yr, cz), color);
  // Underside of the overhang (seen from below, keeps the roof from looking paper-thin).
  b.quad(V(x0, y - 0.25, z0), V(x1, y - 0.25, z0), V(x1, y, z0), V(x0, y, z0), shade(color, 0.7));
  b.quad(V(x1, y - 0.25, z1), V(x0, y - 0.25, z1), V(x0, y, z1), V(x1, y, z1), shade(color, 0.7));
  // Gable ends (the wall triangles).
  b.quad(V(r.maxX, y, r.maxZ), V(r.maxX, y, r.minZ), V(r.maxX, yr - 0.4, cz), V(r.maxX, yr - 0.4, cz), gableColor);
  b.quad(V(r.minX, y, r.minZ), V(r.minX, y, r.maxZ), V(r.minX, yr - 0.4, cz), V(r.minX, yr - 0.4, cz), gableColor);
}

/** Hipped roof: four slopes up to a short ridge. */
function hipRoof(b: CityMeshBuilder, r: Rect, y: number, h: number, color: string): void {
  const oh = 0.8;
  const x0 = r.minX - oh, x1 = r.maxX + oh, z0 = r.minZ - oh, z1 = r.maxZ + oh;
  const cz = (z0 + z1) / 2;
  const inset = Math.min((x1 - x0) / 2 - 0.5, (z1 - z0) / 2);
  const yr = y + h;
  b.quad(V(x1, y, z0), V(x0, y, z0), V(x0 + inset, yr, cz), V(x1 - inset, yr, cz), color);
  b.quad(V(x0, y, z1), V(x1, y, z1), V(x1 - inset, yr, cz), V(x0 + inset, yr, cz), color);
  b.quad(V(x1, y, z1), V(x1, y, z0), V(x1 - inset, yr, cz), V(x1 - inset, yr, cz), shade(color, 0.9));
  b.quad(V(x0, y, z0), V(x0, y, z1), V(x0 + inset, yr, cz), V(x0 + inset, yr, cz), shade(color, 0.9));
}

/** Walls of a box house, windows all round, a door on the front. */
function houseWalls(b: CityMeshBuilder, r: Rect, y0: number, floors: number, fh: number, color: string, tile: number, bay: number, front: Face, simple: boolean): void {
  const y1 = y0 + floors * fh;
  const bx = Math.max(1, Math.round((r.maxX - r.minX) / bay));
  const bz = Math.max(1, Math.round((r.maxZ - r.minZ) / bay));
  for (const dir of ['n', 's'] as const) b.facade(dir, r.minX, r.maxX, r.minZ, r.maxZ, y0, y1, color, simple ? TILE.solid : tile, bx, floors);
  b.facade('e', r.minX, r.maxX, r.minZ, r.maxZ, y0, y1, color, simple ? TILE.solid : tile, bz, floors);
  b.facade('w', r.minX, r.maxX, r.minZ, r.maxZ, y0, y1, color, simple ? TILE.solid : tile, bz, floors);
  if (simple) return;
  void front;
}

/** A front door on the wall (just in front of it so it doesn't flicker). */
function door(b: CityMeshBuilder, x: number, wallZ: number, out: number, y: number, w = 1.5, h = 2.6): void {
  const dz = wallZ + out * 0.05;
  if (out > 0) b.quad(V(x - w / 2, y, dz), V(x + w / 2, y, dz), V(x + w / 2, y + h, dz), V(x - w / 2, y + h, dz), '#ffffff', TILE.door);
  else b.quad(V(x + w / 2, y, dz), V(x - w / 2, y, dz), V(x - w / 2, y + h, dz), V(x + w / 2, y + h, dz), '#ffffff', TILE.door);
}

/** A straight hedge or fence along x (z fixed) or along z (x fixed). */
function hedgeX(b: CityMeshBuilder, x0: number, x1: number, z: number, h: number, color = HEDGE, t = 0.9): void {
  if (x1 - x0 < 0.5) return;
  b.box(x0, x1, 0.2, 0.2 + h, z - t / 2, z + t / 2, color, 'nsewt');
}
function hedgeZ(b: CityMeshBuilder, z0: number, z1: number, x: number, h: number, color = HEDGE, t = 0.9): void {
  if (z1 - z0 < 0.5) return;
  b.box(x - t / 2, x + t / 2, 0.2, 0.2 + h, z0, z1, color, 'nsewt');
}

/** White picket fence along x, with a gap for the gate. */
function picketX(b: CityMeshBuilder, x0: number, x1: number, z: number, gapX: number): void {
  for (const [a, c] of [[x0, gapX - 0.9], [gapX + 0.9, x1]]) {
    if (c - a < 0.4) continue;
    b.box(a, c, 0.75, 0.9, z - 0.06, z + 0.06, '#ffffff', 'nst');
    b.box(a, c, 0.4, 0.52, z - 0.06, z + 0.06, '#ffffff', 'ns');
    for (let x = a + 0.15; x < c; x += 0.55) b.box(x - 0.07, x + 0.07, 0.2, 1.1, z - 0.07, z + 0.07, '#ffffff', 'nsewt');
  }
}

function pool(b: CityMeshBuilder, p: Rect): void {
  b.box(p.minX - 0.8, p.maxX + 0.8, 0.2, 0.42, p.minZ - 0.8, p.maxZ + 0.8, '#f2efe8', 'nsewt');
  b.flat(p.minX, p.maxX, p.minZ, p.maxZ, 0.44, '#4cc3e8');
  b.flat(p.minX + 0.6, p.maxX - 0.6, p.minZ + 0.6, p.maxZ - 0.6, 0.45, '#7fd8f2');
  // Two loungers.
  for (const k of [0.25, 0.55]) {
    const x = p.minX + (p.maxX - p.minX) * k;
    b.box(x, x + 0.8, 0.2, 0.55, p.maxZ + 1.4, p.maxZ + 3.2, '#ffffff', 'nsewt');
  }
}

/** Everything for one house (near the camera). */
export function emitHouseDetailed(b: CityMeshBuilder, p: BuildingPlan, rng: Rng): void {
  const h = p.house!;
  const L = h.lot;
  const r = p.rect;
  const out = p.front === 's' ? 1 : -1;
  const wallZ = p.front === 's' ? r.maxZ : r.minZ;
  const streetZ = p.front === 's' ? L.maxZ : L.minZ;
  const cx = (r.minX + r.maxX) / 2;
  // ---- the garden (not part of the fade: stays when the house goes see-through)
  b.bid = 0;
  b.flat(L.minX + 0.05, L.maxX - 0.05, L.minZ + 0.05, L.maxZ - 0.05, 0.21, h.lawn, TILE.solid);
  // Path from the street to the door.
  const [pz0, pz1] = out > 0 ? [wallZ, streetZ] : [streetZ, wallZ];
  const px = h.kind === 'townhouse' ? r.minX + 3.4 : cx; // townhouse stoops are at the side
  b.flat(px - 0.9, px + 0.9, pz0, pz1, 0.23, PATH, TILE.paver, 2);

  b.bid = p.id;
  const top = p.floors * p.floorH;
  switch (h.kind) {
    case 'tiny': {
      // Little foundation, walls, gable roof, porch with two posts.
      b.box(r.minX - 0.2, r.maxX + 0.2, 0.2, 0.6, r.minZ - 0.2, r.maxZ + 0.2, '#d8d2c4', 'nsewt');
      houseWalls(b, r, 0.6, 1, p.floorH, p.color, TILE.prewarWindow, 5.5, p.front, false);
      gableRoof(b, r, 0.6 + top, 3.6, p.roofColor, p.color);
      const pz0 = out > 0 ? wallZ : wallZ - 2.4, pz1 = out > 0 ? wallZ + 2.4 : wallZ;
      b.box(cx - 2.6, cx + 2.6, 0.2, 0.75, pz0, pz1, '#c99b6d', 'nsewt');
      for (const x of [cx - 2.3, cx + 2.3]) b.cyl(x, wallZ + out * 2.1, 0.75, 3.6, 0.13, 0.13, '#ffffff', 6, false);
      b.box(cx - 2.8, cx + 2.8, 3.6, 3.85, out > 0 ? wallZ : wallZ - 2.6, out > 0 ? wallZ + 2.6 : wallZ, p.roofColor, 'nsewt');
      door(b, cx, wallZ, out, 0.75);
      // Chimney.
      b.box(r.maxX - 2.4, r.maxX - 1.4, 0.6 + top + 1, 0.6 + top + 4.2, r.minZ + 1.5, r.minZ + 2.5, '#b5654a', 'nsewt');
      break;
    }
    case 'townhouse': {
      houseWalls(b, r, 0, p.floors, p.floorH, p.color, TILE.brownstoneWindow, 3, p.front, false);
      b.flat(r.minX, r.maxX, r.minZ, r.maxZ, top, p.roofColor, TILE.roof, 4);
      // Chunky cornice.
      b.box(r.minX - 0.5, r.maxX + 0.5, top - 0.9, top - 0.1, r.minZ - 0.5, r.maxZ + 0.5, shade(p.color, 0.72), 'nsewt');
      b.box(r.minX - 0.2, r.maxX + 0.2, top - 0.1, top + 0.5, r.minZ - 0.2, r.maxZ + 0.2, shade(p.color, 0.85), 'nsewt');
      // Stoop up to the door.
      const sx = r.minX + 2.2;
      const steps = 6, stepH = 0.3, run = 0.36;
      for (let i = 0; i < steps; i++) {
        const zA = wallZ + out * (run * (steps - i));
        const [a, c] = out > 0 ? [wallZ, zA] : [zA, wallZ];
        b.box(sx, sx + 2.4, 0.2, 0.2 + (i + 1) * stepH, a, c, shade(p.color, 0.8), 'nsewt');
      }
      door(b, sx + 1.2, wallZ, out, 0.2 + steps * stepH, 1.6, 2.8);
      // Front garden fence (iron) and a bush.
      const fz = wallZ + out * (Math.abs(streetZ - wallZ) - 0.6);
      b.box(r.minX, sx - 0.3, 0.2, 1.1, Math.min(fz, fz + out * 0.1), Math.max(fz, fz + out * 0.1), '#2c3038', 'nsewt');
      b.blob(r.maxX - 3, 1.0, wallZ + out * 1.6, 1.2, 0.9, 1.0, '#5cb85c');
      // Roof bits: a hatch and AC.
      b.box(cx, cx + 2.2, top, top + 1.2, r.minZ + 3, r.minZ + 5, '#d6dbe2', 'nsewt');
      break;
    }
    case 'villa': {
      houseWalls(b, r, 0.2, 1, p.floorH, p.color, TILE.officeWindow, 4, p.front, false);
      // The upper floor slides out a little: modern villa.
      const up: Rect = { minX: r.minX + (p.seed % 2 ? 0 : 4), maxX: r.maxX - (p.seed % 2 ? 4 : 0), minZ: r.minZ - (out < 0 ? 1.5 : 0), maxZ: r.maxZ + (out > 0 ? 1.5 : 0) };
      houseWalls(b, up, 0.2 + p.floorH, 1, p.floorH, shade(p.color, 0.97), TILE.ribbon, 4, p.front, false);
      const yt = 0.2 + top;
      b.box(Math.min(r.minX, up.minX) - 1, Math.max(r.maxX, up.maxX) + 1, yt, yt + 0.5, Math.min(r.minZ, up.minZ) - 1, Math.max(r.maxZ, up.maxZ) + 1, p.roofColor, 'nsewtb');
      // Wood cladding panel by the door.
      const wz = out > 0 ? r.maxZ + 0.04 : r.minZ - 0.04;
      b.box(cx - 3.2, cx + 3.2, 0.2, 0.2 + p.floorH, Math.min(wz, wz + out * 0.08), Math.max(wz, wz + out * 0.08), '#b07a4c', 'nsewt');
      door(b, cx, wz + out * 0.08, out, 0.2, 1.8, 2.8);
      // Roof terrace: wood deck, plants and a sun shade.
      const dk: Rect = { minX: up.minX + 1.5, maxX: (up.minX + up.maxX) / 2, minZ: up.minZ + 1.5, maxZ: up.maxZ - 1.5 };
      b.flat(dk.minX, dk.maxX, dk.minZ, dk.maxZ, yt + 0.52, '#c9935b', TILE.paver, 1.5);
      for (let i = 0; i < 4; i++) b.blob(rng.range(up.minX + 2, up.maxX - 2), yt + 1.1, rng.range(up.minZ + 2, up.maxZ - 2), 1.0, 0.8, 1.0, rng.pick(['#5cb85c', '#4fae5a', '#f28fb0']));
      b.cyl((dk.minX + dk.maxX) / 2, (dk.minZ + dk.maxZ) / 2, yt + 0.5, yt + 2.6, 0.06, 0.06, '#dddddd', 4, false);
      b.cone((dk.minX + dk.maxX) / 2, (dk.minZ + dk.maxZ) / 2, yt + 2.3, yt + 3.0, 1.8, rng.pick(['#ff8fab', '#ffd166', '#4ecdc4']), 8);
      if (h.pool) pool(b, h.pool);
      // Driveway and a car.
      const dx = cx < (L.minX + L.maxX) / 2 ? r.maxX + 5 : r.minX - 5;
      b.flat(dx - 2.4, dx + 2.4, Math.min(streetZ, wallZ), Math.max(streetZ, wallZ), 0.23, '#b9b3a8', TILE.paver, 3);
      parkedCar(b, dx, wallZ + out * 4, 'z', rng);
      b.bid = 0;
      // Hedges around the garden (gap for path and driveway).
      hedgeZ(b, L.minZ + 0.5, L.maxZ - 0.5, L.minX + 0.6, 1.4);
      hedgeZ(b, L.minZ + 0.5, L.maxZ - 0.5, L.maxX - 0.6, 1.4);
      const hz = streetZ - out * 0.6;
      hedgeX(b, L.minX + 0.6, Math.min(cx, dx) - 3, hz, 1.0);
      hedgeX(b, Math.max(cx, dx) + 3, L.maxX - 0.6, hz, 1.0);
      break;
    }
    case 'mansion': {
      // Main house, two lower wings, hipped roofs.
      houseWalls(b, r, 0.2, p.floors, p.floorH, p.color, TILE.prewarWindow, 4, p.front, false);
      hipRoof(b, r, 0.2 + top, 6, p.roofColor);
      const ww = Math.min(14, (L.maxX - L.minX - (r.maxX - r.minX)) / 2 - 6);
      if (ww > 6) {
        for (const side of [-1, 1]) {
          const wx0 = side < 0 ? r.minX - ww : r.maxX, wx1 = side < 0 ? r.minX : r.maxX + ww;
          const wr: Rect = { minX: wx0, maxX: wx1, minZ: r.minZ + 3, maxZ: r.maxZ - 3 };
          houseWalls(b, wr, 0.2, 2, p.floorH, shade(p.color, 0.96), TILE.prewarWindow, 4, p.front, false);
          hipRoof(b, wr, 0.2 + 2 * p.floorH, 4, p.roofColor);
        }
      }
      // Columned porch and a big door.
      const pz = wallZ + out * 3.2;
      for (const k of [-1.5, -0.5, 0.5, 1.5]) b.cyl(cx + k * 2.6, pz, 0.2, 0.2 + p.floorH * 2, 0.4, 0.4, '#ffffff', 8, false);
      const [a, c] = out > 0 ? [wallZ, wallZ + 4] : [wallZ - 4, wallZ];
      b.box(cx - 5.4, cx + 5.4, 0.2 + p.floorH * 2, 0.2 + p.floorH * 2 + 0.7, a, c, '#ffffff', 'nsewt');
      b.box(cx - 5.6, cx + 5.6, 0.2, 0.6, a, c, '#e7e1d3', 'nsewt');
      door(b, cx, wallZ, out, 0.6, 2.6, 3.4);
      // Front court: round fountain on a gravel circle.
      const fz = (wallZ + out * 4 + streetZ) / 2;
      b.bid = 0;
      b.cyl(cx, fz, 0.21, 0.24, 7.5, 7.5, '#e5dccb', 16);
      b.cyl(cx, fz, 0.24, 0.9, 3.2, 3.2, '#f4f1ea', 14);
      b.cyl(cx, fz, 0.9, 0.95, 2.8, 2.8, '#7fd8f2', 14);
      b.cyl(cx, fz, 0.9, 2.6, 0.35, 0.3, '#f4f1ea', 8);
      b.cyl(cx, fz, 2.6, 2.9, 1.2, 1.2, '#f4f1ea', 10);
      if (h.pool) pool(b, h.pool);
      // Hedge wall all round with gate pillars, and tall trees.
      const hz = streetZ - out * 0.7;
      hedgeX(b, L.minX + 0.7, cx - 3.5, hz, 1.6);
      hedgeX(b, cx + 3.5, L.maxX - 0.7, hz, 1.6);
      hedgeX(b, L.minX + 0.7, L.maxX - 0.7, (out > 0 ? L.minZ : L.maxZ) + out * 0.7, 1.6);
      hedgeZ(b, L.minZ + 0.7, L.maxZ - 0.7, L.minX + 0.7, 1.6);
      hedgeZ(b, L.minZ + 0.7, L.maxZ - 0.7, L.maxX - 0.7, 1.6);
      for (const x of [cx - 3.5, cx + 3.5]) {
        b.box(x - 0.7, x + 0.7, 0.2, 3.2, hz - 0.7, hz + 0.7, '#e7e1d3', 'nsewt');
        b.cone(x, hz, 3.2, 4.2, 0.9, '#c9b98f', 6);
      }
      break;
    }
  }

  // ---- garden extras: trees, and a picket fence for cottages
  b.bid = 0;
  if (h.kind === 'tiny') {
    picketX(b, L.minX + 0.4, L.maxX - 0.4, streetZ - out * 0.5, cx);
    const ty = (wallZ + streetZ) / 2;
    tree(b, r.minX + 1.2, ty, 0.2, rng.range(0.8, 1.05), rng);
  }
  const back = p.front === 's' ? r.minZ : r.maxZ;
  const backEnd = p.front === 's' ? L.minZ : L.maxZ;
  const room = Math.abs(backEnd - back);
  if (room > 6) {
    // Cottages and townhouses: a vegetable patch or a shed out back.
    if (h.kind === 'tiny' || h.kind === 'townhouse') {
      const dir = Math.sign(backEnd - back);
      const gz = back + dir * Math.min(room - 3, 5);
      if (rng.chance(0.5)) {
        const [a, c] = dir > 0 ? [gz, gz + 3] : [gz - 3, gz];
        b.box(r.maxX - 4, r.maxX - 0.5, 0.2, 2.4, a, c, rng.pick(['#c96f4a', '#7aa6c2', '#e3c16f']), 'nsewt');
        b.box(r.maxX - 4.3, r.maxX - 0.2, 2.4, 2.7, a - 0.3, c + 0.3, '#6b4f3a', 'nsewt');
      } else {
        for (let k = 0; k < 3; k++) {
          const x = r.minX + 1 + k * 1.8;
          b.box(x, x + 1.3, 0.2, 0.45, Math.min(gz, gz + dir * 4), Math.max(gz, gz + dir * 4), '#7a5a3a', 'nsewt');
          for (let j = 0; j < 3; j++) b.blob(x + 0.65, 0.75, gz + dir * (0.8 + j * 1.3), 0.45, 0.4, 0.45, rng.pick(['#5cb85c', '#e63946', '#f4a261']));
        }
      }
    }
    // Low wooden fences between back gardens.
    if (h.kind === 'tiny' || h.kind === 'townhouse') {
      const [a, c] = back < backEnd ? [back, backEnd - 0.3] : [backEnd + 0.3, back];
      for (const x of [L.minX + 0.15, L.maxX - 0.15]) b.box(x - 0.08, x + 0.08, 0.2, 1.3, a, c, '#a77b52', 'nsewt');
      hedgeX(b, L.minX, L.maxX, backEnd - Math.sign(backEnd - back) * 0.2, 1.3, '#a77b52', 0.16);
    }
    const n = h.kind === 'mansion' ? 8 : h.kind === 'villa' ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const x = rng.range(L.minX + 2.5, L.maxX - 2.5);
      const z = back + Math.sign(backEnd - back) * rng.range(2.5, room - 2);
      if (h.pool && x > h.pool.minX - 3 && x < h.pool.maxX + 3 && z > h.pool.minZ - 4 && z < h.pool.maxZ + 4) continue;
      tree(b, x, z, 0.2, rng.range(1.0, 1.4), rng);
    }
  }
}

/** Cheap version for far away: lawn, box, roof. */
export function emitHouseSimple(b: CityMeshBuilder, p: BuildingPlan, rng: Rng): void {
  const h = p.house!;
  const L = h.lot;
  const r = p.rect;
  b.flat(L.minX + 0.05, L.maxX - 0.05, L.minZ + 0.05, L.maxZ - 0.05, 0.21, h.lawn, TILE.solid);
  if (h.pool) b.flat(h.pool.minX, h.pool.maxX, h.pool.minZ, h.pool.maxZ, 0.3, '#4cc3e8');
  const top = p.floors * p.floorH;
  const y0 = h.kind === 'tiny' ? 0.6 : 0.2;
  houseWalls(b, r, y0, p.floors, p.floorH, p.color, TILE.solid, 4, p.front, true);
  if (h.kind === 'tiny') gableRoof(b, r, y0 + top, 3.6, p.roofColor, p.color);
  else if (h.kind === 'mansion') hipRoof(b, r, y0 + top, 6, p.roofColor);
  else b.flat(r.minX - 0.4, r.maxX + 0.4, r.minZ - 0.4, r.maxZ + 0.4, y0 + top, p.roofColor);
  if (h.kind !== 'tiny') treeSimple(b, rng.range(L.minX + 3, L.maxX - 3), p.front === 's' ? L.minZ + 4 : L.maxZ - 4, 0.2, 1.2, rng);
}

export const HOUSE_SPACES = SPACES;
