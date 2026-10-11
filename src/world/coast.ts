// =====================================================================
// coast.ts — the REAL shape of New York around the streets you can walk.
//
//   • Water everywhere (the rivers, the harbour, the bay).
//   • Every borough's real coastline (world/geo-proj.ts). The borough
//     you're in is paved (its roads), the others are plain land you can
//     see across the water — Brooklyn from the Manhattan waterfront, etc.
//   • EXPANDABLE LAND: outside the playable street grid, the borough is
//     laid out in empty lots (same street pattern), with "FOR SALE"
//     signs. These are the plots players will buy and build on later.
//
// Cheap: one draw call per borough's land, one for all the lots, two for
// the signs.
// =====================================================================

import * as THREE from 'three';
import { Rng } from '../core/rng.ts';
import { BOROUGHS, onLand, outline, unproject, type XZ } from './geo-proj.ts';
import { colAt, districtBounds, rowAt, type DistrictDef } from './layout.ts';

type Track = <T extends { dispose(): void }>(x: T) => T;

/** The main outline of a district's borough (for the maps). */
export function landShape(d: DistrictDef): XZ[] {
  return outline(d.borough)[0] ?? [];
}

export { onLand };

function shapeGeo(rings: XZ[][], track: Track): THREE.BufferGeometry {
  const shapes = rings.map((ring) => new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, -p.z))));
  const geo = track(new THREE.ShapeGeometry(shapes, 1));
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export interface Coast {
  group: THREE.Group;
  /** This borough's land (you can tap it to walk). */
  ground: THREE.Mesh;
}

type LL = [number, number, number, number]; // south, west, north, east
const inLL = (x: number, z: number, b: LL) => {
  const { lat, lon } = unproject(x, z);
  return lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3];
};

/** Sandy beaches (everything else on the shore is a stone promenade). */
const BEACHES: LL[] = [
  [40.566, -74.015, 40.586, -73.93], // Coney Island, Brighton, Manhattan Beach
  [40.6995, -73.9995, 40.7045, -73.9925], // Brooklyn Bridge Park pebble beach
  [40.79, -73.99, 40.81, -73.965], // Riverside Park's grassy bank (soft sand-coloured path)
];

/**
 * What each stretch of shore is: a sandy BEACH (real beach spots), dense
 * BUSH (thick trees and shrubs right down to the water), ROCKS (a grey
 * riprap edge), or a PROMENADE (stone walkway, a few trees). Varies along
 * the coast with smooth seeded noise, so it's never one long green strip.
 */
export type ShoreKind = 'beach' | 'bush' | 'rocks' | 'promenade';
export function shoreKinds(ring: XZ[], seed: number): ShoreKind[] {
  let dist = 0;
  return ring.map((p, i) => {
    if (i > 0) dist += Math.hypot(p.x - ring[i - 1].x, p.z - ring[i - 1].z);
    if (BEACHES.some((b) => inLL(p.x, p.z, b))) return 'beach';
    const n = Math.sin(dist / 140 + seed) * 0.5 + Math.sin(dist / 57 + seed * 2.3) * 0.3 + Math.sin(dist / 23 + seed * 0.7) * 0.2;
    return n < -0.15 ? 'bush' : n < 0.2 ? 'promenade' : n < 0.45 ? 'rocks' : 'promenade';
  });
}
const SHORE_WIDTH: Record<ShoreKind, number> = { beach: 16, bush: 15, rocks: 5, promenade: 6 };
const SHORE_COLOR: Record<ShoreKind, string> = { beach: '#f1dfae', bush: '#4f8a3c', rocks: '#a8a49c', promenade: '#d9cfbd' };

/** Where piers stick out into the water: box, spacing and length (game m). */
const PIERS: { box: LL; every: number; length: number; ferries?: boolean }[] = [
  { box: [40.735, -74.03, 40.776, -73.99], every: 44, length: 52, ferries: true }, // Hudson River piers, Chelsea → Hell's Kitchen (Circle Line at 42nd)
  { box: [40.700, -73.995, 40.716, -73.97], every: 48, length: 34 }, // South Street Seaport
  { box: [40.690, -74.004, 40.7035, -73.995], every: 38, length: 44, ferries: true }, // Brooklyn Bridge Park piers
  { box: [40.575, -73.99, 40.58, -73.975], every: 120, length: 90 }, // Coney Island pier
];

/** The point `dist` metres along the ring from vertex i (negative = backwards). */
function alongRing(ring: XZ[], i: number, dist: number): XZ {
  const n = ring.length;
  let k = ((i % n) + n) % n;
  let left = Math.abs(dist);
  const step = dist < 0 ? -1 : 1;
  while (left > 0) {
    const nk = (k + step + n) % n;
    const seg = Math.hypot(ring[nk].x - ring[k].x, ring[nk].z - ring[k].z);
    if (seg >= left) {
      const f = left / (seg || 1);
      return { x: ring[k].x + (ring[nk].x - ring[k].x) * f, z: ring[k].z + (ring[nk].z - ring[k].z) * f };
    }
    left -= seg;
    k = nk;
  }
  return ring[k];
}

/** Signed area > 0 means the ring winds so its inside is on the left. */
function ringSign(r: XZ[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.sign(a) || 1;
}

/**
 * Build the water, all five boroughs' land, this borough's waterfront
 * (promenade or beach along the whole shore, trees, piers and ferries)
 * and its expandable lots.
 */
export function buildCoast(d: DistrictDef, track: Track): Coast {
  const g = new THREE.Group();
  g.name = 'coast';

  const water = new THREE.Mesh(track(new THREE.PlaneGeometry(16000, 16000)), track(new THREE.MeshPhongMaterial({ color: '#2f7fa8', shininess: 90, specular: new THREE.Color('#9fd3ff') })));
  water.rotation.x = -Math.PI / 2;
  water.position.set(1500, -0.6, 1500);
  water.name = 'water';
  g.add(water);

  // This borough's land is green (parks, lawns, empty lots); the streets
  // are laid on top by city.ts. The other four boroughs: plain land.
  const ground = new THREE.Mesh(shapeGeo(outline(d.borough), track), track(new THREE.MeshLambertMaterial({ color: '#9fcf7c' })));
  ground.receiveShadow = true;
  ground.name = 'ground';
  g.add(ground);
  const others = new THREE.Mesh(shapeGeo(BOROUGHS.filter((b) => b.id !== d.borough).flatMap((b) => outline(b.id)), track), track(new THREE.MeshLambertMaterial({ color: '#b9cf9c' })));
  others.position.y = -0.05;
  others.name = 'land-other-boroughs';
  g.add(others);

  g.add(buildShore(d, track));
  g.add(buildLots(d, track));
  return { group: g, ground };
}

export interface ShoreFeatures {
  trees: { x: number; z: number; s: number; rot: number }[];
  /** Low, dense shrubs (the bush stretches). */
  bushes: { x: number; z: number; s: number; rot: number }[];
  /** Pier root on the shore, outward direction, length; `ferry` = a boat is tied up. */
  piers: { x: number; z: number; ox: number; oz: number; L: number; ferry: boolean }[];
}

const featureCache = new Map<string, ShoreFeatures>();

/** Where the shore trees, piers and ferries are (same for the 3D city and the map). */
export function shoreFeatures(d: DistrictDef): ShoreFeatures {
  const hit = featureCache.get(d.id);
  if (hit) return hit;
  const rng = new Rng(`shore-features-${d.id}`);
  const built = districtBounds(d, 0);
  const cx = (built.minX + built.maxX) / 2;
  const cz = (built.minZ + built.maxZ) / 2;
  const reach = Math.max(built.maxX - built.minX, built.maxZ - built.minZ) * 0.5 + 700;
  const onGrid = (x: number, z: number) => {
    const c = colAt(d, x);
    const r = rowAt(d, z);
    return c >= 0 && r >= 0 && c < d.cols && r < d.rows && d.kind(c, r) !== 'water';
  };
  const out: ShoreFeatures = { trees: [], bushes: [], piers: [] };
  let ringNo = 0;
  for (const ring of outline(d.borough)) {
    const sgn = ringSign(ring);
    const n = ring.length;
    const kinds = shoreKinds(ring, ++ringNo * 1.7);
    let carry = 0;
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.01) continue;
      // Inward = left of the walking direction (for this ring's winding).
      const ix = (-(b.z - a.z) / len) * sgn;
      const iz = ((b.x - a.x) / len) * sgn;
      const kind = kinds[i];
      const step = kind === 'bush' ? 7 : 22;
      for (let s = carry; s < len; s += step) {
        const x = a.x + ((b.x - a.x) * s) / len;
        const z = a.z + ((b.z - a.z) * s) / len;
        if (Math.hypot(x - cx, z - cz) > reach) continue;
        if (kind === 'rocks') continue;
        if (kind === 'bush') {
          // Thick: shrubs at the water, trees behind them.
          for (const inset of [3 + rng.range(0, 3), 9 + rng.range(0, 4), 16 + rng.range(0, 6)]) {
            const tx = x + ix * inset, tz = z + iz * inset;
            if (onGrid(tx, tz) || !onLand(d.borough, tx, tz)) continue;
            (inset < 8 ? out.bushes : out.trees).push({ x: tx, z: tz, s: rng.range(0.8, 1.3), rot: rng.range(0, 6.28) });
          }
          continue;
        }
        if (kind === 'promenade' && rng.chance(0.55)) continue; // a few trees, lots of open walkway
        const inset = SHORE_WIDTH[kind] + 6 + rng.range(0, 10);
        const tx = x + ix * inset, tz = z + iz * inset;
        if (onGrid(tx, tz) || !onLand(d.borough, tx, tz)) continue;
        out.trees.push({ x: tx, z: tz, s: rng.range(0.85, 1.25), rot: rng.range(0, 6.28) });
      }
      carry = (carry + step - (len % step)) % step;
      // Piers: square to the general line of the shore (measured over ~80 m
      // so the jagged real coastline doesn't twist them), well spaced, and
      // only where they point out to open water.
      const zone = PIERS.find((p) => inLL(a.x, a.z, p.box));
      if (!zone) continue;
      for (let s = 0; s < len; s += zone.every / 3) {
        const x = a.x + ((b.x - a.x) * s) / len;
        const z = a.z + ((b.z - a.z) * s) / len;
        if (out.piers.some((p) => Math.hypot(p.x - x, p.z - z) < zone.every)) continue;
        const back = alongRing(ring, i, -40);
        const ahead = alongRing(ring, i + 1, 40);
        let ox = (ahead.z - back.z) * sgn, oz = -(ahead.x - back.x) * sgn;
        const l = Math.hypot(ox, oz) || 1;
        ox /= l;
        oz /= l;
        if (!onLand(d.borough, x - ox * 8, z - oz * 8) || onLand(d.borough, x + ox * 14, z + oz * 14)) continue;
        out.piers.push({ x, z, ox, oz, L: zone.length * rng.range(0.85, 1.1), ferry: !!zone.ferries && rng.chance(0.45) });
      }
    }
  }
  featureCache.set(d.id, out);
  return out;
}

/** Promenade / beach ribbon along the coast, shore trees, piers and ferries. */
function buildShore(d: DistrictDef, track: Track): THREE.Group {
  const out = new THREE.Group();
  out.name = 'waterfront';

  const pos: number[] = [];
  const col: number[] = [];
  const shoreColor = Object.fromEntries(Object.entries(SHORE_COLOR).map(([k, v]) => [k, new THREE.Color(v)])) as Record<ShoreKind, THREE.Color>;
  let ringNo = 0;
  const cEdge = new THREE.Color('#bfb4a0');
  const trees: THREE.Matrix4[] = [];
  const piers: THREE.Matrix4[] = [];
  const hulls: THREE.Matrix4[] = [];
  const cabins: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  for (const ring of outline(d.borough)) {
    const sgn = ringSign(ring);
    const n = ring.length;
    // Inward normal at each vertex (average of its two edges).
    const inward = ring.map((p, i) => {
      const a = ring[(i - 1 + n) % n];
      const b = ring[(i + 1) % n];
      let nx = 0, nz = 0;
      for (const [u, v] of [[a, p], [p, b]] as const) {
        const dx = v.x - u.x, dz = v.z - u.z;
        const l = Math.hypot(dx, dz) || 1;
        nx += (-dz / l) * sgn;
        nz += (dx / l) * sgn;
      }
      const l = Math.hypot(nx, nz) || 1;
      return { x: nx / l, z: nz / l };
    });
    const kinds = shoreKinds(ring, ++ringNo * 1.7);
    const width = (i: number) => SHORE_WIDTH[kinds[i]];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = ring[i], b = ring[j];
      const ai = { x: a.x + inward[i].x * width(i), z: a.z + inward[i].z * width(i) };
      const bi = { x: b.x + inward[j].x * width(j), z: b.z + inward[j].z * width(j) };
      const y = 0.04;
      pos.push(a.x, y, a.z, b.x, y, b.z, bi.x, y, bi.z, a.x, y, a.z, bi.x, y, bi.z, ai.x, y, ai.z);
      const ca = shoreColor[kinds[i]];
      const cb = shoreColor[kinds[j]];
      for (const c of [ca, cb, cb, ca, cb, ca]) col.push(c.r, c.g, c.b);
      // A darker sea-wall edge on promenades.
      if (kinds[i] === 'promenade') {
        const a2 = { x: a.x + inward[i].x * 0.8, z: a.z + inward[i].z * 0.8 };
        const b2 = { x: b.x + inward[j].x * 0.8, z: b.z + inward[j].z * 0.8 };
        pos.push(a.x, 0.06, a.z, b.x, 0.06, b.z, b2.x, 0.06, b2.z, a.x, 0.06, a.z, b2.x, 0.06, b2.z, a2.x, 0.06, a2.z);
        for (let k = 0; k < 6; k++) col.push(cEdge.r, cEdge.g, cEdge.b);
      }
    }
  }

  // Trees, piers and ferries (positions shared with the flat map).
  const f = shoreFeatures(d);
  const bushes: THREE.Matrix4[] = [];
  for (const tr of f.bushes) bushes.push(new THREE.Matrix4().compose(new THREE.Vector3(tr.x, 0, tr.z), q.setFromAxisAngle(up, tr.rot), new THREE.Vector3(tr.s * 1.2, tr.s * 0.8, tr.s * 1.2)));
  for (const tr of f.trees) trees.push(new THREE.Matrix4().compose(new THREE.Vector3(tr.x, 0, tr.z), q.setFromAxisAngle(up, tr.rot), new THREE.Vector3(tr.s, tr.s, tr.s)));
  for (const p of f.piers) {
    q.setFromAxisAngle(up, Math.atan2(p.ox, p.oz));
    piers.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + p.ox * (p.L / 2 - 3), 0, p.z + p.oz * (p.L / 2 - 3)), q.clone(), new THREE.Vector3(11, 1, p.L)));
    if (!p.ferry) continue;
    const fx = p.x + p.ox * (p.L * 0.55) + p.oz * 11;
    const fz = p.z + p.oz * (p.L * 0.55) - p.ox * 11;
    hulls.push(new THREE.Matrix4().compose(new THREE.Vector3(fx, -0.2, fz), q.clone(), new THREE.Vector3(8, 2.6, 24)));
    cabins.push(new THREE.Matrix4().compose(new THREE.Vector3(fx, 2.2, fz), q.clone(), new THREE.Vector3(6, 3, 13)));
  }

  if (pos.length) {
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const mesh = new THREE.Mesh(geo, track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    mesh.receiveShadow = true;
    mesh.name = 'shore';
    out.add(mesh);
  }
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], name: string) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(track(geo), mat, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.name = name;
    out.add(im);
  };
  // Shore trees: a puffy crown on a short trunk.
  const crown = new THREE.IcosahedronGeometry(3.2, 0).scale(1, 0.9, 1).translate(0, 6, 0);
  const trunk = new THREE.CylinderGeometry(0.35, 0.45, 4, 5).translate(0, 2, 0);
  inst(crown, track(new THREE.MeshLambertMaterial({ color: '#5fae4f', flatShading: true })), trees, 'shore-trees');
  inst(trunk, track(new THREE.MeshLambertMaterial({ color: '#6b4f3a' })), trees, 'shore-trunks');
  inst(new THREE.IcosahedronGeometry(2.6, 0).translate(0, 1.6, 0), track(new THREE.MeshLambertMaterial({ color: '#3f7a34', flatShading: true })), bushes, 'shore-bushes');
  inst(new THREE.BoxGeometry(1, 1.4, 1).translate(0, 0.1, 0), track(new THREE.MeshLambertMaterial({ color: '#cfc6b6' })), piers, 'piers');
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), track(new THREE.MeshLambertMaterial({ color: '#f4f6f8' })), hulls, 'ferries');
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), track(new THREE.MeshLambertMaterial({ color: '#2f6fb3' })), cabins, 'ferry-cabins');
  void m;
  return out;
}

const LOT_COLORS = ['#b9cf8f', '#c8d69a', '#d6c9a2', '#c2c79a', '#cfd8a4'];

const lotCache = new Map<string, { x0: number; z0: number; x1: number; z1: number }[]>();

/**
 * The expandable lots: the playable grid's uneven street pattern carried
 * on across the rest of the borough (blocks fully on land, outside the
 * playable streets). Shared by the 3D city and the map.
 */
export function lotsFor(d: DistrictDef): { x0: number; z0: number; x1: number; z1: number }[] {
  const hit = lotCache.get(d.id);
  if (hit) return hit;
  const built = districtBounds(d, 8);
  const out: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const xs = d.allXs;
  const zs = d.allZs;
  for (let ci = 0; ci < xs.length - 1; ci++) {
    for (let ri = 0; ri < zs.length - 1; ri++) {
      const x0 = xs[ci] + d.avenueW / 2 + 2;
      const x1 = xs[ci + 1] - d.avenueW / 2 - 2;
      const z0 = zs[ri] + d.streetW / 2 + 2;
      const z1 = zs[ri + 1] - d.streetW / 2 - 2;
      if (x1 > built.minX && x0 < built.maxX && z1 > built.minZ && z0 < built.maxZ) continue; // the playable streets
      if (![[x0, z0], [x1, z0], [x0, z1], [x1, z1]].every(([x, z]) => onLand(d.borough, x, z))) continue;
      out.push({ x0, z0, x1, z1 });
    }
  }
  lotCache.set(d.id, out);
  return out;
}

function buildLots(d: DistrictDef, track: Track): THREE.Group {
  const out = new THREE.Group();
  out.name = 'expandable-lots';
  const rng = new Rng(`lots-${d.id}`);
  const pos: number[] = [];
  const col: number[] = [];
  const signs: THREE.Matrix4[] = [];
  const c = new THREE.Color();
  for (const { x0, z0, x1, z1 } of lotsFor(d)) {
    c.set(rng.pick(LOT_COLORS));
    const y = 0.08;
    pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    if (rng.chance(0.18)) signs.push(new THREE.Matrix4().makeTranslation(x0 + 6, 0, z1 - 4));
  }
  if (pos.length) {
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, track(new THREE.MeshLambertMaterial({ vertexColors: true })));
    mesh.receiveShadow = true;
    mesh.name = 'lots';
    out.add(mesh);
  }
  if (signs.length && typeof document !== 'undefined') {
    // A little "LAND FOR SALE" board on a post (instanced).
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const g2 = canvas.getContext('2d');
    if (g2) {
      g2.fillStyle = '#ffffff';
      g2.fillRect(0, 0, 128, 64);
      g2.fillStyle = '#e63946';
      g2.fillRect(0, 0, 128, 18);
      g2.fillStyle = '#ffffff';
      g2.font = 'bold 13px sans-serif';
      g2.textAlign = 'center';
      g2.fillText('LAND', 64, 14);
      g2.fillStyle = '#1c2340';
      g2.font = 'bold 22px sans-serif';
      g2.fillText('FOR SALE', 64, 46);
    }
    const tex = track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const boards = new THREE.InstancedMesh(track(new THREE.BoxGeometry(6, 3, 0.3).translate(0, 4.5, 0)), track(new THREE.MeshLambertMaterial({ map: tex })), signs.length);
    const posts = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.4, 4, 0.4).translate(0, 2, 0)), track(new THREE.MeshLambertMaterial({ color: '#6b4f3a' })), signs.length);
    signs.forEach((m, i) => {
      boards.setMatrixAt(i, m);
      posts.setMatrixAt(i, m);
    });
    boards.name = 'for-sale-signs';
    out.add(boards, posts);
  }
  return out;
}
