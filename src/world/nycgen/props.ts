// =====================================================================
// props.ts — street life: trees, lamps, hydrants, parked cars, café
// tables, fruit stands, food carts, newspaper boxes, scaffolding…
//
// This is what makes a city look LIVED IN rather than empty. Everything
// is written into the block's single mesh (see builder.ts), so a block
// with 30 trees and 20 parked cars still costs one draw call.
//
// All shapes are soft and rounded on purpose (cartoon style, not boxy).
// =====================================================================

import type { Rng } from '../../core/rng.ts';
import type { Rect } from '../layout.ts';
import { TILE } from './atlas.ts';
import type { CityMeshBuilder } from './builder.ts';
import type { BuildingPlan } from './buildings.ts';
import { pickVehicle } from '../../data/vehicles.ts';
import { vehicleGeometry } from '../vehicle-models.ts';

const GREENS = ['#5cb85c', '#6cc66a', '#4fa857', '#7fd36d', '#3f9d52'];
// It's autumn in New York for part of the year: a few trees turn.
const AUTUMN = ['#f2a541', '#e8743b', '#f6c453'];
const METAL = '#3a3f47';

/** A puffy cartoon tree: trunk + a cluster of soft balls, lighter on top. */
export function tree(b: CityMeshBuilder, x: number, z: number, y: number, s: number, rng: Rng, autumn = 0.12): void {
  const leaf = rng.chance(autumn) ? rng.pick(AUTUMN) : rng.pick(GREENS);
  const light = lighten(leaf, 1.18);
  b.cyl(x, z, y, y + 2.4 * s, 0.22 * s, 0.16 * s, '#7a5236', 6, false);
  b.blob(x, y + 3.3 * s, z, 1.55 * s, 1.25 * s, 1.55 * s, leaf);
  b.blob(x + 0.75 * s, y + 3.0 * s, z + 0.35 * s, 1.0 * s, 0.9 * s, 1.0 * s, leaf);
  b.blob(x - 0.2 * s, y + 4.1 * s, z - 0.2 * s, 1.05 * s, 0.85 * s, 1.05 * s, light);
}

/** A cheap one-ball tree for far away. */
export function treeSimple(b: CityMeshBuilder, x: number, z: number, y: number, s: number, rng: Rng): void {
  b.blobLow(x, y + 3.3 * s, z, 1.7 * s, 1.5 * s, 1.7 * s, rng.chance(0.12) ? rng.pick(AUTUMN) : rng.pick(GREENS));
}

function lighten(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * (k - 1)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}

/**
 * A parked car at the kerb, picked from the vehicle list (data/vehicles.ts)
 * by its parkWeight. `along` = 'x' means the car points east–west.
 */
export function parkedCar(b: CityMeshBuilder, x: number, z: number, along: 'x' | 'z', rng: Rng): void {
  const v = pickVehicle(() => rng.next(), 'parkWeight');
  const geo = vehicleGeometry(v, rng.pick(v.paints), 0);
  const facing = rng.chance(0.5) ? 0 : Math.PI;
  b.addBuilt(geo, x, 0, z, (along === 'x' ? Math.PI / 2 : 0) + facing);
}

/** NYC "cobra head" street light leaning over the road. */
function streetLamp(b: CityMeshBuilder, x: number, z: number, dx: number, dz: number): void {
  b.cyl(x, z, 0.18, 7.2, 0.13, 0.09, '#2f4a3a', 6, false);
  b.beam(x, 7.0, z, x + dx * 1.8, 7.5, z + dz * 1.8, 0.12, '#2f4a3a');
  b.rounded(x + dx * 2.1, z + dz * 2.1, 7.25, Math.abs(dx) > 0 ? 1.0 : 0.5, 0.3, Math.abs(dz) > 0 ? 1.0 : 0.5, '#e9edf2');
}

function hydrant(b: CityMeshBuilder, x: number, z: number): void {
  b.cyl(x, z, 0.18, 0.85, 0.2, 0.2, '#e23b3b', 8, false);
  b.blob(x, 0.88, z, 0.22, 0.16, 0.22, '#e23b3b');
  b.cyl(x, z, 0.5, 0.62, 0.3, 0.3, '#c92f2f', 8);
}

function trashCan(b: CityMeshBuilder, x: number, z: number): void {
  b.cyl(x, z, 0.18, 1.1, 0.34, 0.4, '#2f7d4a', 8);
}

function newsBoxes(b: CityMeshBuilder, x: number, z: number, along: 'x' | 'z', rng: Rng): void {
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 0.65;
    b.rounded(along === 'x' ? x + o : x, along === 'x' ? z : z + o, 0.18, 0.55, 1.05, 0.5, rng.pick(['#e63946', '#3a86ff', '#ffbe0b', '#2a9d8f', '#ffffff']));
  }
}

function planter(b: CityMeshBuilder, x: number, z: number, rng: Rng): void {
  b.rounded(x, z, 0.18, 1.3, 0.6, 1.3, '#c98a5a');
  for (let i = 0; i < 4; i++) b.blob(x + rng.range(-0.4, 0.4), 0.9, z + rng.range(-0.4, 0.4), 0.32, 0.28, 0.32, rng.pick(['#ff6b9a', '#ffd166', '#f77f00', '#c77dff', '#5cb85c']));
}

/** Two little café tables with umbrellas in front of a shop. */
function cafe(b: CityMeshBuilder, x: number, z: number, along: 'x' | 'z', rng: Rng): void {
  const color = rng.pick(['#e63946', '#2a9d8f', '#ffbe0b', '#ffffff', '#3a86ff']);
  for (const o of [-1.4, 1.4]) {
    const tx = along === 'x' ? x + o : x;
    const tz = along === 'x' ? z : z + o;
    b.cyl(tx, tz, 0.18, 0.95, 0.42, 0.42, '#f1f1f1', 8);
    b.cyl(tx, tz, 0.18, 2.5, 0.05, 0.05, '#dddddd', 4, false);
    b.cone(tx, tz, 2.2, 2.85, 1.25, color, 8);
    for (const c of [-0.75, 0.75]) b.rounded(along === 'x' ? tx + c : tx, along === 'x' ? tz : tz + c, 0.18, 0.4, 0.55, 0.4, '#5a3d2b');
  }
}

/** A sloped corner-store fruit stand: bright colour right on the sidewalk. */
function fruitStand(b: CityMeshBuilder, x: number, z: number, along: 'x' | 'z', rng: Rng): void {
  const w = 3.2;
  b.rounded(x, z, 0.18, along === 'x' ? w : 1.2, 0.8, along === 'x' ? 1.2 : w, '#a47148');
  const fruits = ['#ff6b35', '#e63946', '#ffd23f', '#7bc950', '#9b5de5'];
  for (let i = 0; i < 4; i++) {
    const o = (i - 1.5) * 0.78;
    const c = fruits[(i + rng.int(0, 4)) % fruits.length];
    for (let k = 0; k < 3; k++) {
      const jx = rng.range(-0.22, 0.22);
      const jz = rng.range(-0.3, 0.3);
      b.blob(along === 'x' ? x + o + jx : x + jz, 1.08, along === 'x' ? z + jz : z + o + jx, 0.24, 0.2, 0.24, c);
    }
  }
}

/** A halal/hot-dog style food cart with a big umbrella. */
function foodCart(b: CityMeshBuilder, x: number, z: number, rng: Rng): void {
  b.rounded(x, z, 0.35, 2.2, 1.2, 1.3, '#d9dee5');
  b.rounded(x, z, 1.55, 2.3, 0.18, 1.4, '#f4a261');
  for (const o of [-0.8, 0.8]) b.cyl(x + o, z, 0.18, 0.5, 0.25, 0.25, '#2a2d33', 6);
  b.cyl(x, z, 1.7, 3.0, 0.05, 0.05, '#cccccc', 4, false);
  b.cone(x, z, 2.7, 3.4, 1.7, rng.pick(['#ffbe0b', '#e63946', '#2a9d8f']), 8);
}

function bench(b: CityMeshBuilder, x: number, z: number, along: 'x' | 'z'): void {
  b.rounded(x, z, 0.5, along === 'x' ? 2.2 : 0.6, 0.14, along === 'x' ? 0.6 : 2.2, '#7a5236');
  b.rounded(along === 'x' ? x : x + 0.28, along === 'x' ? z + 0.28 : z, 0.7, along === 'x' ? 2.2 : 0.1, 0.55, along === 'x' ? 0.1 : 2.2, '#7a5236');
  b.rounded(x, z, 0.18, along === 'x' ? 1.9 : 0.5, 0.34, along === 'x' ? 0.5 : 1.9, METAL);
}

/** Green sidewalk shed + scaffolding: you see one on every NYC block. */
function scaffold(b: CityMeshBuilder, x0: number, x1: number, wallZ: number, out: number): void {
  const z1 = wallZ + out * 3.2;
  const [za, zb] = out > 0 ? [wallZ, z1] : [z1, wallZ];
  b.box(x0, x1, 3.3, 3.6, za, zb, '#3f7a4f', 'nsewt');
  b.box(x0, x1, 3.6, 4.4, out > 0 ? zb - 0.12 : za, out > 0 ? zb : za + 0.12, '#3f7a4f', 'nsewt');
  for (let x = x0 + 0.2; x <= x1; x += 2.6) b.cyl(x, z1 - out * 0.15, 0.18, 3.3, 0.08, 0.08, '#c7ccd3', 4, false);
}

export interface PropOptions {
  /** Block land incl. sidewalk. */
  b: Rect;
  sidewalk: number;
  /** Door spots of real places (keep these clear). */
  doors: { x: number; z: number }[];
  buildings: BuildingPlan[];
  yard: Rect | null;
  kind: 'buildings' | 'park' | 'plaza' | 'vacant' | 'lot' | 'ads';
  /** Draw street trees (quality setting). */
  trees: boolean;
  /** Avenue sides get fewer trees and more stalls. */
  simple: boolean;
}

/** Everything on the sidewalks and kerbs around one block, plus back yards. */
export function emitBlockProps(bld: CityMeshBuilder, o: PropOptions, rng: Rng): void {
  bld.bid = 0;
  // Parks are one big green patch (city.ts): no kerbside clutter or parked cars inside them.
  if (o.kind === 'park') return;
  const { b, sidewalk } = o;
  const near = (x: number, z: number, r: number) => o.doors.some((d) => Math.abs(d.x - x) < r && Math.abs(d.z - z) < r);

  // ---- back yards (green strip in the middle of the block)
  if (o.yard && o.kind === 'buildings') {
    const y = o.yard;
    bld.flat(y.minX, y.maxX, y.minZ, y.maxZ, 0.2, '#86cf73', TILE.solid);
    for (let x = y.minX + 3; x < y.maxX - 2; x += rng.range(5, 9)) {
      if (o.trees) (o.simple ? treeSimple : tree)(bld, x, (y.minZ + y.maxZ) / 2 + rng.range(-0.6, 0.6), 0.2, rng.range(0.8, 1.15), rng);
      else bld.blob(x, 0.9, (y.minZ + y.maxZ) / 2, 1, 0.7, 1, '#5cb85c');
    }
  }

  if (o.simple) {
    // Far away: only the street trees (they matter from above).
    if (o.trees && o.kind === 'buildings') {
      for (const z of [b.minZ + 1.3, b.maxZ - 1.3]) for (let x = b.minX + 7; x < b.maxX - 5; x += 11) treeSimple(bld, x, z, 0.18, 1, rng);
    }
    return;
  }

  // ---- the four kerbs: trees, lamps, hydrants, bins, cars
  type Side = { along: 'x' | 'z'; fixed: number; from: number; to: number; out: number; road: number };
  const sides: Side[] = [
    { along: 'x', fixed: b.minZ + 1.15, from: b.minX, to: b.maxX, out: -1, road: b.minZ - 1.3 },
    { along: 'x', fixed: b.maxZ - 1.15, from: b.minX, to: b.maxX, out: 1, road: b.maxZ + 1.3 },
    { along: 'z', fixed: b.minX + 1.15, from: b.minZ, to: b.maxZ, out: -1, road: b.minX - 1.3 },
    { along: 'z', fixed: b.maxX - 1.15, from: b.minZ, to: b.maxZ, out: 1, road: b.maxX + 1.3 },
  ];
  const P = (s: Side, t: number) => (s.along === 'x' ? { x: t, z: s.fixed } : { x: s.fixed, z: t });
  for (const s of sides) {
    const len = s.to - s.from;
    const street = s.along === 'x'; // streets run east–west; avenues north–south
    // Street trees, in little soil pits.
    if (o.trees && o.kind !== 'plaza') {
      const step = street ? rng.range(8, 10) : rng.range(13, 17);
      for (let t = s.from + 6; t < s.to - 5; t += step) {
        const p = P(s, t);
        if (near(p.x, p.z, 2.6)) continue;
        bld.flat(p.x - 0.75, p.x + 0.75, p.z - 0.75, p.z + 0.75, 0.2, '#6b4a2f');
        tree(bld, p.x, p.z, 0.18, rng.range(0.85, 1.15), rng);
      }
    }
    // Street lights.
    for (let t = s.from + 3; t < s.to - 1; t += street ? 26 : 22) {
      const p = P(s, t + 2);
      streetLamp(bld, s.along === 'x' ? p.x : s.fixed + s.out * 0.6, s.along === 'x' ? s.fixed + s.out * 0.6 : p.z, s.along === 'z' ? s.out : 0, s.along === 'x' ? s.out : 0);
    }
    if (o.kind !== 'buildings') continue;
    // Hydrant, bins, newspaper boxes near the corners.
    const h = P(s, s.from + len * rng.range(0.3, 0.7));
    if (!near(h.x, h.z, 2)) hydrant(bld, s.along === 'x' ? h.x : s.fixed + s.out * 0.5, s.along === 'x' ? s.fixed + s.out * 0.5 : h.z);
    const c0 = P(s, s.from + 2.2);
    trashCan(bld, c0.x, c0.z);
    if (rng.chance(0.45)) {
      const nb = P(s, s.to - 3.2);
      newsBoxes(bld, nb.x, nb.z, s.along, rng);
    }
    if (rng.chance(0.35)) {
      const pl = P(s, s.from + len * rng.range(0.2, 0.8));
      if (!near(pl.x, pl.z, 2.5)) planter(bld, pl.x, pl.z, rng);
    }
    if (!street && rng.chance(0.35)) {
      const fc = P(s, s.from + len * rng.range(0.25, 0.75));
      if (!near(fc.x, fc.z, 3)) foodCart(bld, fc.x, fc.z, rng);
    }
    if (!street && rng.chance(0.3)) {
      const bn = P(s, s.from + len * 0.5);
      if (!near(bn.x, bn.z, 2.5)) bench(bld, bn.x - (s.along === 'z' ? s.out * 0.6 : 0), bn.z, s.along);
    }
    // Parked cars along the kerb, leaving the corners and hydrants clear.
    for (let t = s.from + 6; t < s.to - 6; t += rng.range(5.4, 6.4)) {
      if (!rng.chance(0.55)) continue;
      if (Math.abs(t - (s.along === 'x' ? h.x : h.z)) < 3) continue;
      if (s.along === 'x') parkedCar(bld, t, s.road, 'x', rng);
      else parkedCar(bld, s.road, t, 'z', rng);
    }
  }

  // ---- shopfront life: café tables, fruit stands, scaffolding
  let scaffolds = rng.chance(0.4) ? 1 : 0;
  for (const p of o.buildings) {
    const out = p.front === 's' ? 1 : -1;
    const wallZ = p.front === 's' ? p.rect.maxZ : p.rect.minZ;
    const cx = (p.rect.minX + p.rect.maxX) / 2;
    const sz = wallZ + out * (sidewalk * 0.42);
    if (near(cx, sz, 4.5)) continue;
    if (p.shop && rng.chance(0.22)) cafe(bld, cx, wallZ + out * 2.0, 'x', rng);
    else if (p.shop && rng.chance(0.18)) fruitStand(bld, cx, wallZ + out * 1.0, 'x', rng);
    else if (scaffolds && p.style !== 'brownstone' && !p.awning && !p.fireEscape) {
      scaffold(bld, p.rect.minX + 0.3, p.rect.maxX - 0.3, wallZ, out);
      scaffolds--;
    }
  }
}
