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
import type { TreeKind } from '../central-park-plan.ts';

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

/** A park tree with a species and a crown colour (Central Park: world/central-park-plan.ts). */
export interface ParkTreeSpec {
  x: number;
  z: number;
  y: number;
  sp: TreeKind;
  s: number;
  c: string;
}

/**
 * Near version of a park tree: big, puffy, shaped by species. About 90
 * triangles (pines ~50), all merged into the block's one mesh.
 */
export function parkTree(b: CityMeshBuilder, t: ParkTreeSpec): void {
  const { x, z, y, s, c } = t;
  const bark = '#6e4a31';
  const hi = lighten(c, 1.16);
  switch (t.sp) {
    case 'pine':
      b.cyl(x, z, y, y + 1.4 * s, 0.24 * s, 0.18 * s, bark, 5, false);
      b.cone(x, z, y + 1.0 * s, y + 3.5 * s, 1.65 * s, c, 7);
      b.cone(x, z, y + 2.4 * s, y + 4.7 * s, 1.25 * s, lighten(c, 1.08), 7);
      b.cone(x, z, y + 3.6 * s, y + 5.9 * s, 0.85 * s, hi, 7);
      return;
    case 'elm': // vase-shaped: a tall trunk and a wide, flat-bottomed crown
      b.cyl(x, z, y, y + 3.0 * s, 0.3 * s, 0.2 * s, bark, 6, false);
      b.blob(x, y + 4.3 * s, z, 2.1 * s, 1.35 * s, 2.1 * s, c);
      b.blobLow(x + 0.35 * s, y + 5.15 * s, z - 0.25 * s, 1.35 * s, 0.85 * s, 1.35 * s, hi);
      return;
    case 'cherry': // short, spreading
      b.cyl(x, z, y, y + 1.5 * s, 0.22 * s, 0.15 * s, '#4a2c2a', 6, false);
      b.blob(x, y + 2.5 * s, z, 1.95 * s, 1.0 * s, 1.95 * s, c);
      b.blobLow(x - 0.4 * s, y + 3.2 * s, z + 0.3 * s, 1.15 * s, 0.7 * s, 1.15 * s, hi);
      return;
    case 'willow': // a crown with a drooping skirt (by the water)
      b.cyl(x, z, y, y + 2.6 * s, 0.3 * s, 0.22 * s, bark, 6, false);
      b.blob(x, y + 3.7 * s, z, 1.7 * s, 1.1 * s, 1.7 * s, hi);
      b.cyl(x, z, y + 1.1 * s, y + 3.6 * s, 2.05 * s, 1.45 * s, c, 8, false);
      return;
    case 'maple':
      b.cyl(x, z, y, y + 2.3 * s, 0.24 * s, 0.17 * s, bark, 6, false);
      b.blob(x, y + 3.6 * s, z, 1.6 * s, 1.75 * s, 1.6 * s, c);
      b.blobLow(x + 0.3 * s, y + 4.9 * s, z + 0.2 * s, 1.0 * s, 0.9 * s, 1.0 * s, hi);
      return;
    default: // oak: big and round
      b.cyl(x, z, y, y + 2.3 * s, 0.3 * s, 0.2 * s, bark, 6, false);
      b.blob(x, y + 3.6 * s, z, 1.95 * s, 1.55 * s, 1.95 * s, c);
      b.blobLow(x + 0.65 * s, y + 4.3 * s, z + 0.35 * s, 1.2 * s, 1.0 * s, 1.2 * s, hi);
  }
}

/** Far version of a park tree: one faceted ball (or one cone). ~20 triangles. */
export function parkTreeSimple(b: CityMeshBuilder, t: ParkTreeSpec): void {
  const { x, z, y, s, c } = t;
  switch (t.sp) {
    case 'pine': return b.cone(x, z, y + 1.0 * s, y + 5.9 * s, 1.55 * s, c, 6);
    case 'elm': return b.blobLow(x, y + 4.4 * s, z, 2.2 * s, 1.5 * s, 2.2 * s, c);
    case 'cherry': return b.blobLow(x, y + 2.6 * s, z, 2.0 * s, 1.1 * s, 2.0 * s, c);
    case 'willow': return b.blobLow(x, y + 3.0 * s, z, 2.0 * s, 1.8 * s, 2.0 * s, c);
    case 'maple': return b.blobLow(x, y + 3.8 * s, z, 1.7 * s, 1.9 * s, 1.7 * s, c);
    default: return b.blobLow(x, y + 3.7 * s, z, 2.0 * s, 1.7 * s, 2.0 * s, c);
  }
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
  const geo = vehicleGeometry(v, rng.pick(v.paints), 0, true); // baked: merged into the block's city mesh
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
  /** Pocket gardens (open lots, leftovers by Broadway). */
  greens?: Rect[];
  /** Don't plant here (on a road). */
  avoid?: (x: number, z: number) => boolean;
  kind: 'buildings' | 'park' | 'plaza' | 'vacant' | 'lot' | 'ads';
  /** Draw street trees (quality setting). */
  trees: boolean;
  /** Avenue sides get fewer trees and more stalls. */
  simple: boolean;
}

/** A stable 0..1 from a position (same answer for the near and far block). */
function spot(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

type Yard = 'garden' | 'court' | 'parking' | 'playground' | 'pool';

/** Basketball hoop on a pole, facing +x (dir 1) or -x (dir -1). */
function hoop(b: CityMeshBuilder, x: number, z: number, dir: number): void {
  b.cyl(x, z, 0.2, 3.4, 0.09, 0.09, METAL, 6, false);
  b.box(x + dir * 0.05 - 0.05, x + dir * 0.05 + 0.05, 2.9, 4.0, z - 0.9, z + 0.9, '#ffffff');
  b.cyl(x + dir * 0.55, z, 3.0, 3.06, 0.3, 0.3, '#ff6b1a', 8, false);
}

function courtyard(bld: CityMeshBuilder, y: Rect, o: PropOptions, rng: Rng): void {
  const w = y.maxX - y.minX, d = y.maxZ - y.minZ;
  const cx = (y.minX + y.maxX) / 2, cz = (y.minZ + y.maxZ) / 2;
  const roll = spot(y.minX, y.minZ);
  const big = w > 34 && d > 18;
  const kind: Yard = !big ? (roll < 0.75 ? 'garden' : 'parking') : roll < 0.38 ? 'garden' : roll < 0.56 ? 'court' : roll < 0.72 ? 'parking' : roll < 0.88 ? 'playground' : 'pool';
  const T = (x: number, z: number, s = 1) => {
    if (o.trees) (o.simple ? treeSimple : tree)(bld, x, z, 0.2, s * rng.range(0.85, 1.15), rng);
    else bld.blob(x, 0.9, z, 1, 0.7, 1, '#5cb85c');
  };
  // Lawn everywhere first; each design lays its own ground on top.
  bld.flat(y.minX, y.maxX, y.minZ, y.maxZ, 0.2, '#86cf73', TILE.solid);
  // Trees round the edge (fewer when far away).
  const ring = (step: number, inset: number) => {
    for (let x = y.minX + inset; x <= y.maxX - inset + 0.1; x += step) {
      T(x, y.minZ + inset);
      if (d > inset * 2 + 4) T(x, y.maxZ - inset);
    }
  };
  switch (kind) {
    case 'garden': {
      // A paved path in a loop, trees and benches.
      const pi = Math.min(3.5, d * 0.2);
      if (w > 14 && d > 10) {
        bld.flat(y.minX + pi, y.maxX - pi, y.minZ + pi, y.minZ + pi + 1.6, 0.23, '#e9dcc0', TILE.paver, 2);
        bld.flat(y.minX + pi, y.maxX - pi, y.maxZ - pi - 1.6, y.maxZ - pi, 0.23, '#e9dcc0', TILE.paver, 2);
        bld.flat(y.minX + pi, y.minX + pi + 1.6, y.minZ + pi, y.maxZ - pi, 0.23, '#e9dcc0', TILE.paver, 2);
        bld.flat(y.maxX - pi - 1.6, y.maxX - pi, y.minZ + pi, y.maxZ - pi, 0.23, '#e9dcc0', TILE.paver, 2);
      }
      for (let x = y.minX + 4; x < y.maxX - 3; x += rng.range(7, 11)) T(x, cz + rng.range(-1, 1), 1.1);
      if (!o.simple && w > 14) {
        bench(bld, cx - w * 0.2, y.minZ + pi + 0.8, 'x');
        bench(bld, cx + w * 0.2, y.maxZ - pi - 0.8, 'x');
        planter(bld, cx, cz, rng);
      }
      break;
    }
    case 'court': {
      // Basketball court: blue court, orange key, white lines, two hoops.
      const cw = Math.min(28, w - 6), cd = Math.min(15, d - 4);
      const x0 = cx - cw / 2, x1 = cx + cw / 2, z0 = cz - cd / 2, z1 = cz + cd / 2;
      bld.flat(x0 - 1.5, x1 + 1.5, z0 - 1.5, z1 + 1.5, 0.22, '#7d8597', TILE.solid);
      bld.flat(x0, x1, z0, z1, 0.24, '#3a7bd5', TILE.solid);
      bld.flat(x0, x0 + cw * 0.18, cz - cd * 0.18, cz + cd * 0.18, 0.25, '#ff8c42', TILE.solid);
      bld.flat(x1 - cw * 0.18, x1, cz - cd * 0.18, cz + cd * 0.18, 0.25, '#ff8c42', TILE.solid);
      bld.flat(cx - 0.12, cx + 0.12, z0, z1, 0.26, '#ffffff', TILE.solid);
      for (const [a, b2, c, e] of [[x0, x1, z0, z0 + 0.25], [x0, x1, z1 - 0.25, z1], [x0, x0 + 0.25, z0, z1], [x1 - 0.25, x1, z0, z1]]) bld.flat(a, b2, c, e, 0.26, '#ffffff', TILE.solid);
      if (!o.simple) {
        hoop(bld, x0 - 0.6, cz, 1);
        hoop(bld, x1 + 0.6, cz, -1);
        // A chain-link fence: posts round the court.
        for (let x = x0 - 1.5; x <= x1 + 1.6; x += 3) for (const z of [z0 - 1.5, z1 + 1.5]) bld.cyl(x, z, 0.2, 2.4, 0.06, 0.06, METAL, 4, false);
      }
      if (w > cw + 14) { T(y.minX + 3, cz); T(y.maxX - 3, cz); }
      break;
    }
    case 'parking': {
      // A small car park: asphalt, white bays, a row of cars.
      bld.flat(y.minX + 1, y.maxX - 1, y.minZ + 1, y.maxZ - 1, 0.22, '#5d6371', TILE.solid);
      const rows = d > 16 ? [y.minZ + 4.2, y.maxZ - 4.2] : [cz];
      for (const rz of rows) {
        for (let x = y.minX + 3; x < y.maxX - 3; x += 3.4) {
          bld.flat(x - 0.08, x + 0.08, rz - 2.4, rz + 2.4, 0.24, '#e9e9e2', TILE.solid);
          if (!o.simple && rng.chance(0.6) && x + 3.4 < y.maxX - 3) parkedCar(bld, x + 1.7, rz, 'z', rng);
        }
      }
      if (o.simple) for (let x = y.minX + 5; x < y.maxX - 4; x += 9) bld.box(x - 1, x + 1, 0.2, 1.4, cz - 2, cz + 2, rng.pick(['#e63946', '#3a86ff', '#f1f1f1', '#2b2d42']));
      break;
    }
    case 'playground': {
      // Rubber play surface, a swing frame, a slide, sandbox, trees round it.
      const pw = Math.min(24, w - 8), pd = Math.min(14, d - 6);
      const x0 = cx - pw / 2, x1 = cx + pw / 2, z0 = cz - pd / 2, z1 = cz + pd / 2;
      bld.flat(x0, x1, z0, z1, 0.23, '#e76f51', TILE.solid);
      bld.flat(x0 + 1, x0 + 7, z0 + 1, z0 + 6, 0.25, '#f4d58d', TILE.solid);
      if (!o.simple) {
        // Swings: an A-frame bar with two seats.
        const sx = x1 - 6;
        for (const [px, pz] of [[sx - 3, z0 + 2], [sx + 3, z0 + 2]]) {
          bld.beam(px, 0.2, pz - 1, px, 3, pz, 0.1, '#2a9d8f');
          bld.beam(px, 0.2, pz + 1, px, 3, pz, 0.1, '#2a9d8f');
        }
        bld.beam(sx - 3, 3, z0 + 2, sx + 3, 3, z0 + 2, 0.12, '#2a9d8f');
        for (const ox of [-1.4, 1.4]) bld.box(sx + ox - 0.4, sx + ox + 0.4, 0.9, 1.0, z0 + 1.8, z0 + 2.2, '#ffbe0b');
        // Slide: a tower and a ramp.
        const tx = cx - 2, tz = z1 - 3;
        bld.box(tx - 1, tx + 1, 0.2, 2.2, tz - 1, tz + 1, '#ff006e');
        bld.quad({ x: tx + 1, y: 2.2, z: tz + 0.6 }, { x: tx + 1, y: 2.2, z: tz - 0.6 }, { x: tx + 4.5, y: 0.3, z: tz - 0.6 }, { x: tx + 4.5, y: 0.3, z: tz + 0.6 }, '#ffbe0b');
      }
      ring(9, 2.5);
      break;
    }
    case 'pool': {
      // A shared pool: paving, blue water, loungers and umbrellas.
      const pw = Math.min(22, w - 10), pd = Math.min(9, d - 8);
      bld.flat(cx - pw / 2 - 2.5, cx + pw / 2 + 2.5, cz - pd / 2 - 2.5, cz + pd / 2 + 2.5, 0.22, '#f1e3c8', TILE.paver, 2);
      bld.flat(cx - pw / 2, cx + pw / 2, cz - pd / 2, cz + pd / 2, 0.24, '#4cc9f0', TILE.solid);
      bld.flat(cx - pw / 2 + 0.6, cx + pw / 2 - 0.6, cz - pd / 2 + 0.6, cz + pd / 2 - 0.6, 0.25, '#7ad7f0', TILE.solid);
      if (!o.simple) {
        for (let x = cx - pw / 2 + 1.5; x < cx + pw / 2 - 1; x += 4) {
          bld.box(x - 0.5, x + 0.5, 0.2, 0.55, cz + pd / 2 + 0.6, cz + pd / 2 + 2.3, '#ffffff');
          if (rng.chance(0.5)) {
            bld.cyl(x, cz + pd / 2 + 1.5, 0.2, 2.4, 0.05, 0.05, '#dddddd', 4, false);
            bld.cone(x, cz + pd / 2 + 1.5, 2.1, 2.7, 1.3, rng.pick(['#ff6b6b', '#ffd166', '#ffffff', '#06d6a0']), 8);
          }
        }
      }
      ring(10, 2.5);
      break;
    }
  }
}

/** Everything on the sidewalks and kerbs around one block, plus back yards. */
export function emitBlockProps(bld: CityMeshBuilder, o: PropOptions, rng: Rng): void {
  bld.bid = 0;
  // Parks are one big green patch (city.ts): no kerbside clutter or parked cars inside them.
  if (o.kind === 'park') return;
  const { b, sidewalk } = o;
  const near = (x: number, z: number, r: number) => o.doors.some((d) => Math.abs(d.x - x) < r && Math.abs(d.z - z) < r);

  // ---- the courtyard in the middle of the block (2026-10-12 clean-up):
  // one of a few designs, picked from the yard's position so the near and
  // far versions always agree.
  if (o.yard && o.kind === 'buildings') courtyard(bld, o.yard, o, rng);

  // ---- pocket gardens: grass, a few trees and a bench where a lot is open
  const inBuilding = (x: number, z: number) => o.buildings.some((p) => x > p.rect.minX - 1.6 && x < p.rect.maxX + 1.6 && z > p.rect.minZ - 1.6 && z < p.rect.maxZ + 1.6);
  if (o.kind === 'buildings') {
    for (const g of o.greens ?? []) {
      const w = g.maxX - g.minX, d = g.maxZ - g.minZ;
      if (w < 3 || d < 3) continue;
      bld.flat(g.minX + 0.4, g.maxX - 0.4, g.minZ + 0.4, g.maxZ - 0.4, 0.2, '#8fd27a', TILE.solid);
      const n = Math.min(7, Math.max(1, Math.round((w * d) / 110)));
      for (let i = 0; i < n; i++) {
        const x = rng.range(g.minX + 2.2, g.maxX - 2.2), z = rng.range(g.minZ + 2.2, g.maxZ - 2.2);
        if (o.avoid?.(x, z) || near(x, z, 3) || inBuilding(x, z)) continue;
        if (o.trees) (o.simple ? treeSimple : tree)(bld, x, z, 0.2, rng.range(0.85, 1.2), rng);
        else bld.blob(x, 0.9, z, 1, 0.7, 1, '#5cb85c');
      }
      if (!o.simple && w > 8 && d > 6) {
        const bx = (g.minX + g.maxX) / 2, bz = (g.minZ + g.maxZ) / 2;
        if (!o.avoid?.(bx, bz) && !inBuilding(bx, bz)) bench(bld, bx, bz, w > d ? 'x' : 'z');
      }
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
    const out = p.front === 's' || p.front === 'e' ? 1 : -1;
    if (p.front === 'e' || p.front === 'w') {
      // Avenue-side buildings: a café or fruit stand on the avenue sidewalk now and then.
      const wallX = p.front === 'e' ? p.rect.maxX : p.rect.minX;
      const cz = (p.rect.minZ + p.rect.maxZ) / 2;
      if (near(wallX + out * sidewalk * 0.42, cz, 4.5)) continue;
      if (p.shop && rng.chance(0.2)) cafe(bld, wallX + out * 2.0, cz, 'z', rng);
      else if (p.shop && rng.chance(0.15)) fruitStand(bld, wallX + out * 1.0, cz, 'z', rng);
      continue;
    }
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
