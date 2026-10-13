// =====================================================================
// buildings.ts — the New York building generator.
//
// Instead of a handful of fixed models, every building is GENERATED from
// a few rules plus random choices (width, floors, colour, window style,
// fire escape, awning, water tower, roof garden…). That gives thousands
// of different buildings that still clearly belong to one city, at the
// cost of a few hundred lines of code and zero download.
//
// THE STYLES (what NYC actually looks like, cartoon-ified)
//   brownstone — 3–4 floors, narrow, stoop stairs up to the front door
//   walkup     — 4–6 floor brick tenement: shops below, zig-zag fire
//                escape on the front, wooden water tower on the roof
//   prewar     — 7–14 floor limestone apartment/office, ledges, cornice
//   modern     — 5–12 floor pastel block with ribbon windows
//   glass      — Midtown glass tower with setbacks, crown and antenna
//   deco       — stepped Art Deco tower with a spire
//
// TO ADD A STYLE: add it to Style, give it numbers in STYLE_RULES and a
// branch in emitDetailed() (and nothing else needs to change).
//
// Two levels of detail per building:
//   emitDetailed() — everything (used near the camera)
//   emitSimple()   — textured boxes + water tower (far away)
// =====================================================================

import type { Rng } from '../../core/rng.ts';
import type { Rect } from '../layout.ts';
import { TILE } from './atlas.ts';
import type { CityMeshBuilder } from './builder.ts';

export type Style = 'brownstone' | 'walkup' | 'prewar' | 'modern' | 'glass' | 'deco';
export type Face = 'n' | 's' | 'e' | 'w';
type RoofKind = 'tower' | 'garden' | 'plain' | 'solar' | 'ac' | 'bar';

export interface BuildingPlan {
  /** Fade id (see-through). 0 = never fades. */
  id: number;
  style: Style;
  rect: Rect;
  /** Which street the front faces ('e' / 'w' = an avenue, for the buildings along a block's avenue sides). */
  front: Face;
  /** An open side (corner lot: the side facing the other street), or null. */
  corner: Face | null;
  floors: number;
  floorH: number;
  /** Total height including setbacks/crowns (for see-through & billboards). */
  height: number;
  /** Setback tiers: inset from the lot edge (m) and floors in that tier. */
  tiers: { inset: number; floors: number }[];
  color: string;
  trim: string;
  roofColor: string;
  roof: RoofKind;
  shop: boolean;
  awning: string | null;
  fireEscape: boolean;
  seed: number;
}

// ---------------------------------------------------------------------
// Colours: bright cartoon versions of real NYC materials.
// ---------------------------------------------------------------------
const PAL: Record<Style, string[]> = {
  brownstone: ['#a0664c', '#8f5a45', '#b07457', '#c98b6b', '#e8a7a0', '#a9c8a1', '#f1d29a', '#9fc0de', '#d98f7a'],
  walkup: ['#d4593f', '#e07b4c', '#c44a3d', '#ea9d5d', '#d88f6b', '#b85a44', '#f0b47c', '#f3cfa3', '#e46a5e', '#9bc3a0'],
  prewar: ['#f2e8d3', '#eadcc0', '#f6ecda', '#e2cda8', '#f5dcc7', '#e9d6b9', '#d8e3ea'],
  modern: ['#ffffff', '#f8c4b0', '#b4e2d3', '#ffe39e', '#c4d7ff', '#f6b4c8', '#d9c8ff', '#a7e3f0'],
  glass: ['#eef3f8', '#c9d2dd', '#8fb7cc', '#e2c770', '#6f8296', '#b8e0ea'],
  deco: ['#f3e6c9', '#ead7b0', '#efe0d0', '#e5d3c0'],
};
const AWNINGS = ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#8338ec', '#06a77d', '#ff006e', '#ffbe0b', '#1d3557'];
const ROOFS = ['#7d828f', '#8f97a3', '#9b8f84', '#6f7684'];

/** Height, width and look rules per style. */
// Lots are wide on purpose (Peter, 2026-10-11: "space out the houses or make them bigger"):
// fewer, chunkier buildings read better from the sky map and cost less on phones.
// Scaled up with the blocks (Peter, 2026-10-12: "make the blocks bigger"):
// footprints x1.3 and storeys x1.15 over the 2026-10-11 numbers.
const W = (a: number, b: number): [number, number] => [Math.round(a * 1.3), Math.round(b * 1.3)];
const FH = 1.15;
const STYLE_RULES: Record<Style, { floors: [number, number]; floorH: number; width: [number, number]; bay: number; tile: number; ground: number }> = {
  brownstone: { floors: [3, 4], floorH: 3.3 * FH, width: W(13, 17), bay: 2.4 * FH, tile: TILE.brownstoneWindow, ground: TILE.brownstoneWindow },
  walkup: { floors: [4, 6], floorH: 3.2 * FH, width: W(20, 28), bay: 2.6 * FH, tile: TILE.brickWindow, ground: TILE.storefront },
  prewar: { floors: [7, 14], floorH: 3.3 * FH, width: W(23, 32), bay: 3.0 * FH, tile: TILE.prewarWindow, ground: TILE.storefront },
  modern: { floors: [5, 12], floorH: 3.2 * FH, width: W(16, 22), bay: 3.4 * FH, tile: TILE.ribbon, ground: TILE.storefront },
  glass: { floors: [18, 40], floorH: 3.5 * FH, width: W(28, 42), bay: 3.0 * FH, tile: TILE.glass, ground: TILE.storefront },
  deco: { floors: [20, 34], floorH: 3.4 * FH, width: W(28, 38), bay: 3.0 * FH, tile: TILE.officeWindow, ground: TILE.storefront },
};

/** Which styles each neighbourhood type is made of (with weights). */
const ZONE_MIX: Record<string, [Style, number][]> = {
  brownstone: [['brownstone', 6], ['walkup', 2], ['modern', 0.5]],
  midrise: [['walkup', 5], ['prewar', 3], ['modern', 2], ['brownstone', 0.6]],
  tall: [['prewar', 3], ['glass', 3], ['deco', 1.2], ['modern', 1], ['walkup', 1]],
  waterfront: [['modern', 3], ['walkup', 2], ['glass', 1.5], ['prewar', 1]],
};

function weighted(rng: Rng, mix: [Style, number][]): Style {
  const total = mix.reduce((s, [, w]) => s + w, 0);
  let t = rng.range(0, total);
  for (const [s, w] of mix) if ((t -= w) <= 0) return s;
  return mix[0][0];
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------
// Planning: split a block into lots and pick a building for each.
// ---------------------------------------------------------------------

export interface BlockPlan {
  buildings: BuildingPlan[];
  /** Open back-yard strip in the middle of the block (grass + trees), if any. */
  yard: Rect | null;
}

/**
 * Lay out a city block: a row of buildings along the north street and
 * another along the south street, back to back, with a strip of back
 * yards between (like real Manhattan blocks). Big towers in tall zones
 * may take the whole depth of the block.
 */
export function planNycBlock(inner: Rect, zone: string, rng: Rng, nearHub: boolean, newId: () => number): BlockPlan {
  const D = inner.maxZ - inner.minZ;
  const mix = nearHub ? ZONE_MIX.tall.filter(([s]) => s !== 'walkup') : ZONE_MIX[zone] ?? ZONE_MIX.midrise;
  const rowD = Math.min(40, D * 0.4); // deep blocks (2026-10-12): deeper rows, smaller yard
  // A little randomness so blocks aren't perfectly straight rows: some
  // buildings sit back from the street, some are shallower, and now and
  // then a lot is left as a garden or a parking lot.
  const setback = (s: Style) => (s === 'brownstone' || s === 'walkup' ? rng.range(0, 1.8) : rng.range(0, 0.6));
  const depth = () => rowD * rng.range(0.7, 1);
  const gap = (i: number, n: number) => i > 0 && i < n - 1 && rng.chance(0.1);
  const buildings: BuildingPlan[] = [];

  // Towers that fill the full depth (tall zones only), left to right.
  type Lot = { x0: number; x1: number; style: Style; full: boolean };
  const lotsFor = (allowFull: boolean): Lot[] => {
    const lots: Lot[] = [];
    let x = inner.minX;
    while (x < inner.maxX - 4) {
      let style = weighted(rng, mix);
      const full = allowFull && (style === 'glass' || style === 'deco');
      if (!allowFull && (style === 'glass' || style === 'deco')) style = 'prewar';
      const [w0, w1] = STYLE_RULES[style].width;
      let w = rng.range(w0, w1);
      // Don't leave a sliver at the end of the row: stretch the last lot.
      if (inner.maxX - (x + w) < 8) w = inner.maxX - x;
      w = Math.min(w, inner.maxX - x);
      lots.push({ x0: x, x1: x + w, style, full });
      x += w;
    }
    return lots;
  };

  const makePlan = (lot: Lot, z0: number, z1: number, front: Face, corner: 'e' | 'w' | null): BuildingPlan => {
    const rule = STYLE_RULES[lot.style];
    let floors = Math.round(rng.range(rule.floors[0], rule.floors[1]));
    if (nearHub && (lot.style === 'glass' || lot.style === 'deco')) floors = Math.round(floors * rng.range(1.2, 1.5));
    const tiers: { inset: number; floors: number }[] = [{ inset: 0, floors }];
    if (lot.style === 'glass' && floors > 22 && rng.chance(0.7)) {
      const top = Math.round(floors * rng.range(0.2, 0.35));
      tiers[0].floors = floors - top;
      tiers.push({ inset: Math.min(4, (lot.x1 - lot.x0) * 0.14), floors: top });
    }
    if (lot.style === 'deco') {
      const a = Math.round(floors * 0.55);
      const b = Math.round(floors * 0.28);
      tiers.splice(0, 1, { inset: 0, floors: a }, { inset: 2.6, floors: b }, { inset: 5.4, floors: Math.max(3, floors - a - b) });
    }
    if (lot.style === 'prewar' && floors > 10 && rng.chance(0.5)) {
      tiers[0].floors = floors - 2;
      tiers.push({ inset: 2, floors: 2 });
    }
    const color = rng.pick(PAL[lot.style]);
    const shop = lot.style !== 'brownstone' && (lot.style === 'walkup' ? rng.chance(0.85) : rng.chance(0.6));
    const roof: RoofKind =
      lot.style === 'walkup' || lot.style === 'prewar'
        ? rng.pick(['tower', 'tower', 'garden', 'ac', 'plain', 'bar'] as RoofKind[])
        : lot.style === 'brownstone'
          ? rng.pick(['plain', 'garden', 'solar', 'plain', 'ac'] as RoofKind[])
          : rng.pick(['ac', 'ac', 'garden', 'solar', 'bar'] as RoofKind[]);
    const height = tiers.reduce((h, t) => h + t.floors * rule.floorH, 0) + (lot.style === 'brownstone' ? 1.2 : 0) + (lot.style === 'deco' ? 14 : lot.style === 'glass' ? 6 : 2);
    return {
      id: newId(),
      style: lot.style,
      rect: { minX: lot.x0 + 0.05, maxX: lot.x1 - 0.05, minZ: z0, maxZ: z1 },
      front,
      corner,
      floors,
      floorH: rule.floorH,
      height,
      tiers,
      color,
      trim: lot.style === 'prewar' || lot.style === 'deco' ? shade(color, 1.25) : lot.style === 'brownstone' ? shade(color, 0.7) : '#f4efe4',
      roofColor: rng.pick(ROOFS),
      roof,
      shop,
      awning: shop && rng.chance(0.75) ? rng.pick(AWNINGS) : null,
      fireEscape: lot.style === 'walkup' ? rng.chance(0.75) : false,
      seed: rng.int(0, 9999),
    };
  };

  const allowFull = D > 20 && mix.some(([s]) => s === 'glass' || s === 'deco');
  const north = lotsFor(allowFull);
  const fullLots = north.filter((l) => l.full);
  for (const [i, lot] of north.entries()) {
    const corner = i === 0 ? 'w' : i === north.length - 1 ? 'e' : null;
    if (lot.full) buildings.push(makePlan(lot, inner.minZ, inner.maxZ, rng.chance(0.5) ? 'n' : 's', corner));
    else if (!gap(i, north.length)) {
      const sb = setback(lot.style);
      buildings.push(makePlan(lot, inner.minZ + sb, inner.minZ + sb + depth(), 'n', corner));
    }
  }
  // The south row skips the x ranges a full-depth tower already took.
  let x = inner.minX;
  const southLots: Lot[] = [];
  const taken = (a: number, b: number) => fullLots.some((f) => a < f.x1 - 0.1 && b > f.x0 + 0.1);
  for (const lot of lotsFor(false)) {
    if (taken(lot.x0, lot.x1)) {
      // Trim the lot to the free part on either side of the tower.
      for (const f of fullLots) {
        if (lot.x0 < f.x0 && f.x0 - lot.x0 > 5) southLots.push({ ...lot, x1: f.x0 });
        if (lot.x1 > f.x1 && lot.x1 - f.x1 > 5) southLots.push({ ...lot, x0: f.x1 });
      }
      continue;
    }
    southLots.push(lot);
  }
  void x;
  for (const [i, lot] of southLots.entries()) {
    const corner = lot.x0 <= inner.minX + 0.1 ? 'w' : lot.x1 >= inner.maxX - 0.1 ? 'e' : i === southLots.length - 1 ? 'e' : null;
    if (gap(i, southLots.length)) continue;
    const sb = setback(lot.style);
    buildings.push(makePlan(lot, inner.maxZ - sb - depth(), inner.maxZ - sb, 's', corner));
  }
  x = 0;
  const yardDepth = D - rowD * 2;
  const yard = yardDepth > 2 ? { minX: inner.minX, maxX: inner.maxX, minZ: inner.minZ + rowD, maxZ: inner.maxZ - rowD } : null;
  return { buildings, yard };
}

// ---------------------------------------------------------------------
// Emitting geometry
// ---------------------------------------------------------------------

const DARK_METAL = '#2c3038';

// ---------------------------------------------------------------------
// The front of a building, in its own terms: 'a' runs along the front
// wall, 'o' goes out from it into the street. Lets the front details
// (awnings, stoops, ledges, fire escapes) work on any of the four sides.
// ---------------------------------------------------------------------
interface Front {
  axis: 'x' | 'z';
  /** The front wall's x (axis 'z') or z (axis 'x'). */
  wall: number;
  out: 1 | -1;
  a0: number;
  a1: number;
  /** Face letters (builder.box) for the front and for the two ends. */
  face: string;
  ends: string;
}
function frontOf(p: BuildingPlan, r: Rect): Front {
  switch (p.front) {
    case 'n': return { axis: 'x', wall: r.minZ, out: -1, a0: r.minX, a1: r.maxX, face: 'n', ends: 'ew' };
    case 's': return { axis: 'x', wall: r.maxZ, out: 1, a0: r.minX, a1: r.maxX, face: 's', ends: 'ew' };
    case 'w': return { axis: 'z', wall: r.minX, out: -1, a0: r.minZ, a1: r.maxZ, face: 'w', ends: 'ns' };
    default: return { axis: 'z', wall: r.maxX, out: 1, a0: r.minZ, a1: r.maxZ, face: 'e', ends: 'ns' };
  }
}
/** World point at (along a, height y, out o) from a front. */
function fp(f: Front, a: number, y: number, o: number): { x: number; y: number; z: number } {
  return f.axis === 'x' ? { x: a, y, z: f.wall + f.out * o } : { x: f.wall + f.out * o, y, z: a };
}
/** Does going from a0 to a1 run "rightwards" along the front (so quads face out)? */
function rightwards(f: Front): boolean {
  return f.axis === 'x' ? f.out > 0 : f.out < 0;
}
/** A quad standing on the front: a from s to e, bottom edge at (yb, ob), top edge at (yt, ot). Faces out. */
function frontQuad(b: CityMeshBuilder, f: Front, s: number, e: number, yb: number, ob: number, yt: number, ot: number, color: string, tile = 0, cu = 1, cv = 1): void {
  const [p, q] = rightwards(f) ? [s, e] : [e, s];
  b.quad(fp(f, p, yb, ob), fp(f, q, yb, ob), fp(f, q, yt, ot), fp(f, p, yt, ot), color, tile, cu, cv);
}
/** A box in front terms (a range, y range, o range); `faces` uses f = front, k = back, s = ends, t, b. */
function frontBox(b: CityMeshBuilder, f: Front, a0: number, a1: number, y0: number, y1: number, o0: number, o1: number, color: string, faces: string): void {
  const p0 = fp(f, a0, 0, o0), p1 = fp(f, a1, 0, o1);
  const back = { n: 's', s: 'n', e: 'w', w: 'e' }[f.face as 'n'];
  let fs = '';
  if (faces.includes('f')) fs += f.face;
  if (faces.includes('k')) fs += back;
  if (faces.includes('s')) fs += f.ends;
  if (faces.includes('t')) fs += 't';
  if (faces.includes('b')) fs += 'b';
  b.box(Math.min(p0.x, p1.x), Math.max(p0.x, p1.x), y0, y1, Math.min(p0.z, p1.z), Math.max(p0.z, p1.z), color, fs);
}

/** Walls of one tier: front/back/sides with the right tiles. */
function walls(b: CityMeshBuilder, p: BuildingPlan, r: Rect, y0: number, floors: number, groundTile: number | null, tile: number, simple: boolean): void {
  const rule = STYLE_RULES[p.style];
  const fh = p.floorH;
  const y1 = y0 + floors * fh;
  const wx = r.maxX - r.minX;
  const wz = r.maxZ - r.minZ;
  const baysX = Math.max(1, Math.round(wx / rule.bay));
  const baysZ = Math.max(1, Math.round(wz / rule.bay));
  const u0 = (p.seed % 7) * 0.0; // keep windows aligned to the wall edges
  const open = p.tiers.length > 1 || p.style === 'glass' || p.style === 'deco';
  const back = { n: 's', s: 'n', e: 'w', w: 'e' }[p.front];
  for (const dir of ['n', 's', 'e', 'w'] as const) {
    const bays = dir === 'n' || dir === 's' ? baysX : baysZ;
    if (dir === p.front) {
      if (groundTile !== null && !simple) {
        b.facade(dir, r.minX, r.maxX, r.minZ, r.maxZ, y0, y0 + fh, p.color, groundTile, bays, 1, u0, 0);
        b.facade(dir, r.minX, r.maxX, r.minZ, r.maxZ, y0 + fh, y1, p.color, tile, bays, floors - 1, u0, 1);
      } else b.facade(dir, r.minX, r.maxX, r.minZ, r.maxZ, y0, y1, p.color, tile, bays, floors, u0, 0);
    } else if (dir === back) {
      b.facade(dir, r.minX, r.maxX, r.minZ, r.maxZ, y0, y1, p.color, p.style !== 'walkup' ? tile : TILE.blankBrick, bays, floors, u0, 0);
    } else {
      // A side: windows if it's an open corner (or a tower), blank party wall otherwise.
      b.facade(dir, r.minX, r.maxX, r.minZ, r.maxZ, y0, y1, p.color, p.corner === dir || open ? tile : TILE.blankBrick, bays, floors);
    }
  }
}

/** Flat roof with a low parapet wall around it. */
function roofSlab(b: CityMeshBuilder, p: BuildingPlan, r: Rect, y: number, simple: boolean): void {
  b.flat(r.minX, r.maxX, r.minZ, r.maxZ, y, p.roofColor, TILE.roof, 4);
  if (simple) return;
  const t = 0.3;
  const h = 0.55;
  const c = p.style === 'glass' ? p.color : p.trim;
  b.box(r.minX, r.maxX, y, y + h, r.minZ, r.minZ + t, c, 'nst');
  b.box(r.minX, r.maxX, y, y + h, r.maxZ - t, r.maxZ, c, 'nst');
  b.box(r.minX, r.minX + t, y, y + h, r.minZ + t, r.maxZ - t, c, 'ewt');
  b.box(r.maxX - t, r.maxX, y, y + h, r.minZ + t, r.maxZ - t, c, 'ewt');
}

/** A classic wooden NYC water tower on stilts. */
export function waterTower(b: CityMeshBuilder, x: number, z: number, y: number, s = 1, simple = false): void {
  const legH = 2.2 * s;
  if (!simple) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam(x + dx * 1.1 * s, y, z + dz * 1.1 * s, x + dx * 1.0 * s, y + legH, z + dz * 1.0 * s, 0.16 * s, DARK_METAL);
    b.box(x - 1.7 * s, x + 1.7 * s, y + legH - 0.15, y + legH, z - 1.7 * s, z + 1.7 * s, DARK_METAL, 'nsewt');
  }
  b.cyl(x, z, y + legH, y + legH + 3.4 * s, 1.55 * s, 1.55 * s, '#9a6440', simple ? 6 : 10, false);
  if (!simple) {
    b.cyl(x, z, y + legH + 0.8 * s, y + legH + 0.95 * s, 1.6 * s, 1.6 * s, '#3b3f46', 10, false);
    b.cyl(x, z, y + legH + 2.4 * s, y + legH + 2.55 * s, 1.6 * s, 1.6 * s, '#3b3f46', 10, false);
  }
  b.cone(x, z, y + legH + 3.4 * s, y + legH + 4.8 * s, 1.75 * s, '#5e3a26', simple ? 6 : 10);
}

/** Roof furniture: AC units, gardens, solar panels, rooftop bars. */
function roofProps(b: CityMeshBuilder, p: BuildingPlan, r: Rect, y: number, rng: Rng): void {
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const rand = (a: number, c: number) => rng.range(a, c);
  // A stair/elevator bulkhead on most roofs.
  if (w > 7 && d > 7 && p.roof !== 'garden') {
    const bx = rand(r.minX + 1.5, r.maxX - 4.5);
    const bz = rand(r.minZ + 1.5, r.maxZ - 4.5);
    b.box(bx, bx + 3, y, y + 2.6, bz, bz + 3, shade(p.color, 0.85));
    b.flat(bx - 0.15, bx + 3.15, bz - 0.15, bz + 3.15, y + 2.62, p.roofColor);
  }
  switch (p.roof) {
    case 'tower':
      waterTower(b, rand(r.minX + 2.2, r.maxX - 2.2), rand(r.minZ + 2.2, r.maxZ - 2.2), y, w < 10 ? 0.8 : 1);
      break;
    case 'garden': {
      b.flat(r.minX + 0.8, r.maxX - 0.8, r.minZ + 0.8, r.maxZ - 0.8, y + 0.04, '#7cc56b', TILE.solid);
      b.flat(cx - 0.7, cx + 0.7, r.minZ + 0.8, r.maxZ - 0.8, y + 0.07, '#e8dcc4');
      const n = Math.min(8, Math.max(3, Math.floor((w * d) / 25)));
      for (let i = 0; i < n; i++) {
        const x = rand(r.minX + 1.4, r.maxX - 1.4);
        const z = rand(r.minZ + 1.4, r.maxZ - 1.4);
        if (Math.abs(x - cx) < 1) continue;
        b.blob(x, y + 0.6, z, rand(0.6, 1), rand(0.5, 0.8), rand(0.6, 1), rng.pick(['#4fae5a', '#6cc46a', '#3f9a50', '#f28fb0', '#ffd166']));
      }
      b.cone(cx, cz, y + 2.1, y + 2.7, 1.5, rng.pick(['#ff6b6b', '#ffd166', '#4ecdc4']), 8);
      b.cyl(cx, cz, y, y + 2.1, 0.06, 0.06, '#eeeeee', 4, false);
      break;
    }
    case 'solar':
      for (let x = r.minX + 1.2; x < r.maxX - 3; x += 3.2) {
        for (let z = r.minZ + 1.2; z < r.maxZ - 2.6; z += 2.8) {
          b.quad({ x, y: y + 0.3, z: z + 2 }, { x: x + 2.8, y: y + 0.3, z: z + 2 }, { x: x + 2.8, y: y + 1.1, z }, { x, y: y + 1.1, z }, '#ffffff', TILE.solar);
        }
      }
      break;
    case 'bar':
      b.flat(r.minX + 0.8, r.maxX - 0.8, r.minZ + 0.8, r.maxZ - 0.8, y + 0.04, '#c9935b', TILE.paver, 2);
      for (let i = 0; i < 3; i++) {
        const x = rand(r.minX + 2, r.maxX - 2);
        const z = rand(r.minZ + 2, r.maxZ - 2);
        b.cyl(x, z, y, y + 2.3, 0.05, 0.05, '#dddddd', 4, false);
        b.cone(x, z, y + 2.0, y + 2.6, 1.3, rng.pick(['#ffffff', '#ff8fab', '#ffd166']), 8);
        b.cyl(x, z, y, y + 0.8, 0.5, 0.5, '#8a5a3b', 6);
      }
      // String lights posts at the corners.
      break;
    case 'ac':
    case 'plain': {
      const n = p.roof === 'ac' ? Math.min(6, Math.max(2, Math.floor(w / 4))) : 1;
      for (let i = 0; i < n; i++) {
        const x = rand(r.minX + 1.2, r.maxX - 2.4);
        const z = rand(r.minZ + 1.2, r.maxZ - 2.4);
        b.box(x, x + 1.3, y, y + 0.9, z, z + 1.3, '#d6dbe2');
        b.cyl(x + 0.65, z + 0.65, y + 0.9, y + 0.95, 0.45, 0.45, '#4a4f58', 8);
      }
      if (rng.chance(0.4)) b.cyl(rand(r.minX + 1, r.maxX - 1), rand(r.minZ + 1, r.maxZ - 1), y, y + 1.2, 0.25, 0.25, '#b9bec6', 6);
      break;
    }
  }
}

/** Zig-zag fire escape on the front of a walk-up. */
function fireEscape(b: CityMeshBuilder, p: BuildingPlan, r: Rect): void {
  const f = frontOf(p, r);
  const width = Math.min(5, (f.a1 - f.a0) * 0.55);
  const ca = (f.a0 + f.a1) / 2;
  const a0 = ca - width / 2;
  const a1 = ca + width / 2;
  const depth = 1.1;
  const B = (pa: number, ya: number, oa: number, pb: number, yb: number, ob: number) => {
    const u = fp(f, pa, ya, oa), v = fp(f, pb, yb, ob);
    b.beam(u.x, u.y, u.z, v.x, v.y, v.z, 0.07, DARK_METAL);
  };
  for (let fl = 1; fl < p.floors; fl++) {
    const y = fl * p.floorH + 0.1;
    frontBox(b, f, a0, a1, y - 0.12, y, 0, depth, DARK_METAL, 'fkstb');
    // Railing: top bar along the front and the two ends, plus corner posts.
    B(a0, y + 1.0, depth, a1, y + 1.0, depth);
    B(a0, y, depth, a0, y + 1.0, depth);
    B(a1, y, depth, a1, y + 1.0, depth);
    B(a0, y + 1.0, 0, a0, y + 1.0, depth);
    B(a1, y + 1.0, 0, a1, y + 1.0, depth);
    // Ladder down to the floor below, alternating ends.
    if (fl > 1) {
      const left = fl % 2 === 0;
      const la = left ? a0 + 0.4 : a1 - 0.4;
      const lb = left ? a0 + 1.8 : a1 - 1.8;
      const u = fp(f, la, y, depth / 2), v = fp(f, lb, y - p.floorH, depth / 2);
      b.beam(u.x, u.y, u.z, v.x, v.y, v.z, 0.12, DARK_METAL);
    }
  }
}

/** Striped shop awning over the ground floor, from a0 to a1 along the front. */
function awning(b: CityMeshBuilder, f: Front, a0: number, a1: number, y: number, color: string): void {
  const lo = y - 0.9;
  const cu = Math.max(1, Math.round((a1 - a0) / 2));
  frontQuad(b, f, a0, a1, lo, 1.6, y, 0, color, TILE.stripes, cu, 1);
  frontQuad(b, f, a0, a1, lo - 0.35, 1.6, lo, 1.6, color, TILE.stripes, cu, 0.3);
}

/** Front stoop + door of a brownstone. */
function stoop(b: CityMeshBuilder, p: BuildingPlan, r: Rect): void {
  const f = frontOf(p, r);
  const sa = p.seed % 2 ? f.a0 + 1.1 : f.a1 - 3.1;
  const steps = 6;
  const stepH = 0.26;
  const run = 0.32;
  const stone = shade(p.color, 0.85);
  for (let i = 0; i < steps; i++) frontBox(b, f, sa, sa + 2, 0, (i + 1) * stepH, 0, run * (steps - i), stone, 'fst');
  const top = steps * stepH;
  for (const a of [sa + 0.05, sa + 1.95]) {
    const u = fp(f, a, top + 0.9, 0), v = fp(f, a, 0.9, run * steps);
    b.beam(u.x, u.y, u.z, v.x, v.y, v.z, 0.08, DARK_METAL);
  }
  // Door on the wall, just in front of it so it doesn't flicker.
  frontQuad(b, f, sa + 0.3, sa + 1.7, top, 0.04, top + 2.6, 0.04, '#ffffff', TILE.door);
}

/** Horizontal stone ledge across the front (gives depth to tall walls). */
function ledge(b: CityMeshBuilder, p: BuildingPlan, r: Rect, y: number, depth: number, h: number, color: string): void {
  const f = frontOf(p, r);
  frontBox(b, f, f.a0 - 0.12, f.a1 + 0.12, y, y + h, -0.05, depth, color, 'fstb');
}

/** Full detail (near the camera). */
export function emitDetailed(b: CityMeshBuilder, p: BuildingPlan, rng: Rng): void {
  b.bid = p.id;
  const rule = STYLE_RULES[p.style];
  let y = p.style === 'brownstone' ? 0.0 : 0;
  let r = p.rect;
  for (const [ti, t] of p.tiers.entries()) {
    r = { minX: p.rect.minX + t.inset, maxX: p.rect.maxX - t.inset, minZ: p.rect.minZ + t.inset, maxZ: p.rect.maxZ - t.inset };
    const ground = ti === 0 ? (p.shop ? rule.ground : p.style === 'brownstone' ? rule.tile : rule.tile) : null;
    walls(b, p, r, y, t.floors, ground, rule.tile, false);
    const yTop = y + t.floors * p.floorH;
    // Soft rounded corners: a column on each corner takes the hard edge
    // off the silhouette (the chunky, toy-like Supercell look).
    if (p.style !== 'glass') {
      const cr = p.style === 'brownstone' ? 0.28 : 0.42;
      const cc = p.style === 'modern' ? shade(p.color, 0.93) : p.trim;
      for (const [cx, cz] of [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]]) b.cyl(cx, cz, y, yTop, cr, cr, cc, 8, false);
    }
    y = yTop;
    // Chunky two-step cornice at the top of each tier.
    if (p.style !== 'glass') {
      const deep = p.style === 'modern' ? 0.35 : 0.85;
      ledge(b, p, r, y - 0.95, deep * 0.45, 0.35, shade(p.trim, 0.9));
      ledge(b, p, r, y - 0.6, deep, 0.6, p.trim);
    }
    else b.box(r.minX - 0.15, r.maxX + 0.15, y - 0.4, y, r.minZ - 0.15, r.maxZ + 0.15, shade(p.color, 0.8), 'nsewt');
    roofSlab(b, p, r, y, false);
  }
  const top = p.tiers[p.tiers.length - 1];
  // Ledges on taller stone buildings, above the shop floor and every few floors.
  if (p.style === 'prewar' || p.style === 'deco') {
    const r0 = p.rect;
    ledge(b, p, r0, p.floorH - 0.25, 0.35, 0.35, p.trim);
    for (let f = 4; f < p.tiers[0].floors - 1; f += 4) ledge(b, p, r0, f * p.floorH - 0.2, 0.2, 0.25, p.trim);
  }
  // Crown and spire on towers.
  if (p.style === 'deco') {
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    b.box(cx - 2.5, cx + 2.5, y, y + 5, cz - 2.5, cz + 2.5, p.trim);
    b.cone(cx, cz, y + 5, y + 14, 1.6, '#c9d1da', 8);
  } else if (p.style === 'glass') {
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    const s = Math.min(r.maxX - r.minX, r.maxZ - r.minZ) * 0.3;
    b.box(cx - s, cx + s, y, y + 3.2, cz - s, cz + s, '#d5dbe3');
    b.cyl(cx, cz, y + 3.2, y + 9, 0.12, 0.08, '#e9eef3', 5, false);
  } else {
    roofProps(b, p, r, y, rng);
  }
  void top;

  const f = frontOf(p, p.rect);
  if (p.style === 'brownstone') stoop(b, p, p.rect);
  if (p.awning) awning(b, f, f.a0 + 0.4, f.a1 - 0.4, p.floorH - 0.2, p.awning);
  if (p.fireEscape) fireEscape(b, p, p.rect);
}

/** Cheap version for far away: textured boxes + water tower silhouette. */
export function emitSimple(b: CityMeshBuilder, p: BuildingPlan, rng: Rng): void {
  b.bid = p.id;
  const rule = STYLE_RULES[p.style];
  let y = 0;
  let r = p.rect;
  for (const [ti, t] of p.tiers.entries()) {
    r = { minX: p.rect.minX + t.inset, maxX: p.rect.maxX - t.inset, minZ: p.rect.minZ + t.inset, maxZ: p.rect.maxZ - t.inset };
    walls(b, p, r, y, t.floors, ti === 0 && p.shop ? rule.ground : null, rule.tile, true);
    y += t.floors * p.floorH;
    roofSlab(b, p, r, y, true);
  }
  if (p.roof === 'tower' && p.style !== 'glass' && p.style !== 'deco') waterTower(b, (r.minX + r.maxX) / 2 + rng.range(-1, 1), (r.minZ + r.maxZ) / 2, y, 1, true);
  if (p.style === 'deco') {
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    b.cone(cx, cz, y, y + 12, 2.2, '#c9d1da', 6);
  }
}
