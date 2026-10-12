// =====================================================================
// people.ts — live 3D things on the 2.5D map: your avatar, a few
// people strolling the sidewalks and cars on the roads.
//
// They walk on a hidden map: a graph of sidewalk corners around every
// block, joined across the roads by the crosswalks. Tap somewhere and
// the avatar takes the shortest way there along that graph.
// =====================================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Look } from '../sim/types.ts';
import { outfitDefaults } from '../data/wardrobe.ts';
import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES, makeAvatar, type Avatar } from '../world/avatar.ts';
import { CELL_D, CELL_W, COLS, GRID_D, GRID_W, PITCH_X, PITCH_Z, ROAD, ROWS, cellX, cellZ, isPark } from './plan.ts';
import { KERB_H } from './ground.ts';

/** People are drawn a bit bigger than life so they read at map zoom (like Clash of Clans troops). */
export const PEOPLE_SCALE = 2.4;
// Walking line: on the road pictures' sidewalks, 2.2 m out from the block edge.
const INSET = -2.2;

// ---- the sidewalk graph
interface Node {
  x: number;
  z: number;
  next: number[];
}
const nodes: Node[] = [];
const id = (c: number, r: number, k: number) => (r * COLS + c) * 4 + k; // k: 0 NW, 1 NE, 2 SE, 3 SW
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x0 = cellX(c) + INSET;
    const x1 = cellX(c) + CELL_W - INSET;
    const z0 = cellZ(r) + INSET;
    const z1 = cellZ(r) + CELL_D - INSET;
    nodes.push({ x: x0, z: z0, next: [] }, { x: x1, z: z0, next: [] }, { x: x1, z: z1, next: [] }, { x: x0, z: z1, next: [] });
  }
}
function link(a: number, b: number): void {
  nodes[a].next.push(b);
  nodes[b].next.push(a);
}
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    for (let k = 0; k < 4; k++) link(id(c, r, k), id(c, r, (k + 1) % 4)); // around the block
    if (c + 1 < COLS) {
      link(id(c, r, 1), id(c + 1, r, 0)); // crosswalks to the east neighbour
      link(id(c, r, 2), id(c + 1, r, 3));
    }
    if (r + 1 < ROWS) {
      link(id(c, r, 3), id(c, r + 1, 0)); // crosswalks to the south neighbour
      link(id(c, r, 2), id(c, r + 1, 1));
    }
  }
}

const d2 = (ax: number, az: number, bx: number, bz: number) => (ax - bx) ** 2 + (az - bz) ** 2;

/** Closest point on any sidewalk edge to (x, z), with that edge's two ends. */
function snap(x: number, z: number): { x: number; z: number; a: number; b: number } {
  let best = { x, z, a: 0, b: 0 };
  let bd = Infinity;
  nodes.forEach((n, i) => {
    for (const j of n.next) {
      if (j < i) continue;
      const m = nodes[j];
      const ex = m.x - n.x;
      const ez = m.z - n.z;
      const t = Math.max(0, Math.min(1, ((x - n.x) * ex + (z - n.z) * ez) / (ex * ex + ez * ez)));
      const px = n.x + ex * t;
      const pz = n.z + ez * t;
      const dd = d2(x, z, px, pz);
      if (dd < bd) {
        bd = dd;
        best = { x: px, z: pz, a: i, b: j };
      }
    }
  });
  return best;
}

/** Shortest walk from one point to another along the sidewalks and crosswalks. */
export function route(fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
  const s = snap(fx, fz);
  const e = snap(tx, tz);
  // Dijkstra from both ends of the start edge.
  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const open = new Set<number>();
  for (const k of [s.a, s.b]) {
    dist[k] = Math.sqrt(d2(s.x, s.z, nodes[k].x, nodes[k].z));
    open.add(k);
  }
  while (open.size) {
    let u = -1;
    for (const k of open) if (u < 0 || dist[k] < dist[u]) u = k;
    open.delete(u);
    for (const v of nodes[u].next) {
      const nd = dist[u] + Math.sqrt(d2(nodes[u].x, nodes[u].z, nodes[v].x, nodes[v].z));
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        open.add(v);
      }
    }
  }
  const sameEdge = (s.a === e.a && s.b === e.b) || (s.a === e.b && s.b === e.a);
  const out: { x: number; z: number }[] = [{ x: s.x, z: s.z }];
  if (!sameEdge) {
    const endA = dist[e.a] + Math.sqrt(d2(nodes[e.a].x, nodes[e.a].z, e.x, e.z));
    const endB = dist[e.b] + Math.sqrt(d2(nodes[e.b].x, nodes[e.b].z, e.x, e.z));
    let k = endA <= endB ? e.a : e.b;
    const path: number[] = [];
    while (k >= 0) {
      path.unshift(k);
      k = prev[k];
    }
    for (const n of path) out.push({ x: nodes[n].x, z: nodes[n].z });
  }
  out.push({ x: e.x, z: e.z });
  return out;
}

// ---- walkers (the avatar and the strolling people)
export class Walker {
  readonly avatar: Avatar;
  private path: { x: number; z: number }[] = [];
  speed: number;
  /** Called when the walker reaches the end of its path. */
  onArrive: (() => void) | null = null;

  constructor(look: Look, x: number, z: number, speed = 4.2) {
    this.avatar = makeAvatar(look);
    this.avatar.root.scale.setScalar(PEOPLE_SCALE);
    this.avatar.root.position.set(x, KERB_H, z);
    this.speed = speed;
  }

  get pos(): THREE.Vector3 {
    return this.avatar.root.position;
  }

  walkTo(x: number, z: number): void {
    this.path = route(this.pos.x, this.pos.z, x, z);
  }

  get walking(): boolean {
    return this.path.length > 0;
  }

  update(dt: number): void {
    const p = this.pos;
    let moved = 0;
    let budget = this.speed * dt;
    while (budget > 0 && this.path.length) {
      const t = this.path[0];
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) {
        this.path.shift();
        continue;
      }
      const step = Math.min(len, budget);
      p.x += (dx / len) * step;
      p.z += (dz / len) * step;
      budget -= step;
      moved += step;
      // Turn smoothly to face the way we walk.
      const want = Math.atan2(dx, dz);
      const r = this.avatar.root.rotation;
      let diff = want - r.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      r.y += diff * Math.min(1, dt * 12);
      if (step >= len) this.path.shift();
    }
    p.y = KERB_H; // sidewalk height (crosswalks are close enough to it)
    this.avatar.animate(moved / Math.max(dt, 1e-4) / PEOPLE_SCALE, dt);
    if (!this.path.length && moved > 0 && this.onArrive) this.onArrive();
  }
}

export function randomLook(seed: number): Look {
  const pick = <T>(a: readonly T[], k: number) => a[(seed * 7919 + k * 104729) % a.length];
  const body = seed % 2 ? 'm' : 'f';
  return { body, skin: pick(SKIN_TONES, 1), top: pick(OUTFIT_COLORS, 2), bottom: pick(OUTFIT_COLORS, 3), hair: pick(HAIR_COLORS, 4), ...outfitDefaults(body) };
}

/** A person who wanders from corner to corner forever. */
/** The sidewalk corner nearest to a point. */
function nearestNode(x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  nodes.forEach((n, i) => {
    const d = d2(x, z, n.x, n.z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export interface Stroller extends Walker {
  respawnNear: (x: number, z: number) => void;
}

/** A person who strolls from corner to neighbouring corner, around (x, z). */
export function makeStroller(seed: number, x: number, z: number): Stroller {
  let k = seed * 7919 + 13;
  const rnd = () => ((k = (k * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pickNear = (px: number, pz: number) => nearestNode(px + (rnd() - 0.5) * 300, pz + (rnd() - 0.5) * 300);
  let at = pickNear(x, z);
  const w = new Walker(randomLook(seed), nodes[at].x, nodes[at].z, 2.6 + (seed % 3) * 0.4) as Stroller;
  const wander = () => {
    const next = nodes[at].next;
    at = next[Math.floor(rnd() * next.length)];
    w.walkTo(nodes[at].x, nodes[at].z);
  };
  w.onArrive = wander;
  w.respawnNear = (px, pz) => {
    at = pickNear(px, pz);
    w.pos.set(nodes[at].x, KERB_H, nodes[at].z);
    wander();
  };
  wander();
  return w;
}

// ---- cars
const CAR_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#3a86ff', '#ffbe0b', '#ffffff', '#8338ec', '#ef476f'];

function carGeometry(): THREE.BufferGeometry {
  const body = new RoundedBoxGeometry(4.4, 1.1, 2.1, 2, 0.35).translate(0, 0.95, 0);
  const cabin = new RoundedBoxGeometry(2.5, 0.9, 1.8, 2, 0.3).translate(-0.2, 1.85, 0);
  const wheels = [-1.4, 1.4].flatMap((x) =>
    [-1, 1].map((s) => new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10).rotateX(Math.PI / 2).translate(x, 0.45, s * 0.95)),
  );
  const paint = (g: THREE.BufferGeometry, c: string) => {
    const k = new THREE.Color(c);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([k.r, k.g, k.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
    return g.index ? g.toNonIndexed() : g;
  };
  return mergeGeometries([paint(body, '#ffffff'), paint(cabin, '#bfe3ff'), ...wheels.map((w) => paint(w, '#2b2b2b'))])!;
}

interface Car {
  mesh: THREE.Mesh;
  axis: 'x' | 'z';
  dir: 1 | -1;
  lane: number;
  at: number;
  speed: number;
}

/** Cars drive straight along the roads, in the right-hand lane, and loop around. */
export function makeTraffic(count: number): { group: THREE.Group; update: (dt: number) => void } {
  const group = new THREE.Group();
  const geo = carGeometry();
  const cars: Car[] = [];
  for (let i = 0; i < count; i++) {
    const axis: 'x' | 'z' = i % 2 ? 'x' : 'z';
    const dir: 1 | -1 = i % 4 < 2 ? 1 : -1;
    // Roads that run the whole way (not through Central Park).
    const roads = axis === 'x' ? [...Array(ROWS + 1).keys()].filter((r) => !(isPark(1, r - 1) && isPark(1, r))) : [0, 1, 3, 4];
    const road = roads[(i * 7 + 1) % roads.length];
    const centre = road * (axis === 'x' ? PITCH_Z : PITCH_X) + ROAD / 2;
    // Right-hand traffic: eastbound (+x) keeps to the south side (+z), etc.
    const lane = axis === 'x' ? centre + dir * 2.1 : centre - dir * 2.1;
    const tint = new THREE.Color(CAR_COLORS[i % CAR_COLORS.length]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: tint });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(0.95);
    group.add(mesh);
    cars.push({ mesh, axis, dir, lane, at: ((i * 97) % 400) - 20, speed: 9 + (i % 3) * 2 });
  }
  const span = (a: 'x' | 'z') => (a === 'x' ? GRID_W : GRID_D);
  const update = (dt: number) => {
    for (const c of cars) {
      c.at += c.speed * dt;
      const L = span(c.axis) + 40;
      if (c.at > L) c.at -= L;
      const s = c.dir > 0 ? c.at - 20 : span(c.axis) + 20 - c.at;
      if (c.axis === 'x') {
        c.mesh.position.set(s, 0, c.lane);
        c.mesh.rotation.y = c.dir > 0 ? 0 : Math.PI;
      } else {
        c.mesh.position.set(c.lane, 0, s);
        c.mesh.rotation.y = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      // Fade out where the map ends (they drive off under the clouds).
      c.mesh.visible = s > -6 && s < span(c.axis) + 6;
    }
  };
  return { group, update };
}
