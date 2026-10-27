// =====================================================================
// home-yard.ts — the ground round a home (Peter, 2026-10-27: Lagos Life
// houses sit on a lawn, not in an empty void). A rounded lawn, a paved
// path round the house, a path to the front door, a driveway with a car
// (yours, if you own one), garden lamps that light up after dark, bushes
// and a couple of trees.
//
// Cheap: about eight draw calls (each kind of thing is one merged mesh).
// The house's own base plinth (home-interior.ts) sits on top of this.
// =====================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HomeLayout } from '../data/homes.ts';
import { VEHICLES } from '../data/vehicles.ts';
import { floorMaterial } from '../render/home-surfaces.ts';
import { vehicleGeometry } from './vehicle-models.ts';

export interface YardOptions {
  /** The car on the driveway (a vehicle id and paint), or none. */
  car?: { model: string; paint: string } | null;
  shadows?: boolean;
}

export interface Yard {
  group: THREE.Group;
  /** 0 day … 1 night: garden lamps glow. */
  setDark: (k: number) => void;
  dispose: () => void;
}

/** How far the lawn reaches past the house (metres): sides/back, and the front (driveway side). */
const SIDE = 3.2;
const FRONT = 6.0;
const LAWN_Y = -0.32;
const PAVE = 1.3;

/** A tiny seeded random, so a home's bushes don't move between visits. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function colored(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Plain geometries for merging: drop UVs/groups differences by keeping position, normal, color. */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', ng.getAttribute('position'));
  out.setAttribute('normal', ng.getAttribute('normal'));
  if (ng.getAttribute('color')) out.setAttribute('color', ng.getAttribute('color'));
  return out;
}

/** A soft, mown olive lawn (Lagos Life's is calm, not neon green): mottled, with faint mowing stripes. */
let lawnTex: THREE.CanvasTexture | null = null;
function lawnMaterial(): THREE.MeshLambertMaterial {
  if (!lawnTex) {
    const N = 128;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d')!;
    const img = g.createImageData(N, N);
    const r = rng(7);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const stripe = Math.floor(x / 32) % 2 ? 1.04 : 0.97;
      const n = (0.92 + r() * 0.12) * stripe;
      const k = (y * N + x) * 4;
      img.data[k] = 132 * n; img.data[k + 1] = 158 * n; img.data[k + 2] = 82 * n; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    lawnTex = new THREE.CanvasTexture(c);
    lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
    lawnTex.colorSpace = THREE.SRGBColorSpace;
    lawnTex.repeat.set(1 / 4, 1 / 4); // one tile every 4 m
  }
  return new THREE.MeshLambertMaterial({ map: lawnTex });
}

export function buildYard(layout: HomeLayout, opts: YardOptions = {}): Yard {
  const group = new THREE.Group();
  group.name = 'yard';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const hw = layout.width / 2, hd = layout.depth / 2;
  const rand = rng(Math.round(layout.width * 131 + layout.depth * 17 + layout.id.length * 7));
  const x0 = -hw - SIDE, x1 = hw + SIDE, z0 = -hd - SIDE, z1 = hd + FRONT;

  // ---- the lawn: a rounded slab, grass on top, soil on the sides
  {
    const r = 2.4;
    const s = new THREE.Shape();
    s.moveTo(x0 + r, z0);
    s.lineTo(x1 - r, z0);
    s.quadraticCurveTo(x1, z0, x1, z0 + r);
    s.lineTo(x1, z1 - r);
    s.quadraticCurveTo(x1, z1, x1 - r, z1);
    s.lineTo(x0 + r, z1);
    s.quadraticCurveTo(x0, z1, x0, z1 - r);
    s.lineTo(x0, z0 + r);
    s.quadraticCurveTo(x0, z0, x0 + r, z0);
    const g = keep(new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: false, curveSegments: 6 }));
    // Shape is drawn in (x, z); extrude goes along +z: turn it so the slab lies flat, top at y = 0.
    g.rotateX(Math.PI / 2);
    g.translate(0, LAWN_Y, 0);
    // Top face UVs in metres (shape coords) already; the sides get soil.
    const soil = keep(new THREE.MeshLambertMaterial({ color: '#6b5236' }));
    const lawn = new THREE.Mesh(g, [keep(lawnMaterial()), soil]);
    lawn.receiveShadow = !!opts.shadows;
    lawn.name = 'yard-lawn';
    group.add(lawn);
  }

  // ---- paving: a ring round the house, a path to the door, the driveway
  const door = layout.door ?? { x: 0, z: hd };
  const carOn = !!opts.car && VEHICLES.get(opts.car.model);
  const driveX = door.x > 0 ? -hw + 2.4 : hw - 2.4;
  {
    const parts: THREE.BufferGeometry[] = [];
    const plane = (ax: number, az: number, bx: number, bz: number) => {
      const p = new THREE.PlaneGeometry(bx - ax, bz - az).rotateX(-Math.PI / 2).translate((ax + bx) / 2, LAWN_Y + 0.012, (az + bz) / 2);
      const uv = p.getAttribute('uv'), pos = p.getAttribute('position');
      for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k), -pos.getZ(k));
      parts.push(p);
    };
    plane(-hw - PAVE, -hd - PAVE, hw + PAVE, -hd); // back
    plane(-hw - PAVE, hd, hw + PAVE, hd + PAVE); // front
    plane(-hw - PAVE, -hd, -hw, hd); // left
    plane(hw, -hd, hw + PAVE, hd); // right
    plane(door.x - 0.8, hd + PAVE, door.x + 0.8, z1 - 0.2); // path to the gate
    if (carOn) plane(driveX - 1.6, hd + PAVE, driveX + 1.6, z1 - 0.2); // driveway
    const g = keep(mergeGeometries(parts)!);
    parts.forEach((p) => p.dispose());
    const m = new THREE.Mesh(g, floorMaterial('paving'));
    m.receiveShadow = !!opts.shadows;
    m.name = 'yard-paving';
    group.add(m);
  }

  // ---- bushes and trees round the edge (one merged mesh)
  {
    const parts: THREE.BufferGeometry[] = [];
    const greens = ['#5f7a3a', '#6d8a44', '#4e6a32', '#7a9a4c'];
    const bush = (x: number, z: number, s: number) => {
      const g = new THREE.IcosahedronGeometry(s, 0);
      g.scale(1, 0.75, 1).translate(x, LAWN_Y + s * 0.55, z);
      parts.push(clean(colored(g, greens[Math.floor(rand() * greens.length)])));
    };
    const tree = (x: number, z: number) => {
      parts.push(clean(colored(new THREE.CylinderGeometry(0.12, 0.16, 1.6, 6).translate(x, LAWN_Y + 0.8, z), '#6b4a2f')));
      for (let k = 0; k < 3; k++) {
        const g = new THREE.IcosahedronGeometry(0.85 - k * 0.15, 0);
        g.translate(x + (rand() - 0.5) * 0.4, LAWN_Y + 1.9 + k * 0.5, z + (rand() - 0.5) * 0.4);
        parts.push(clean(colored(g, greens[(k + 1) % greens.length])));
      }
    };
    // A hedge of bushes along the back and sides, a few in the front corners.
    for (let x = x0 + 1.0; x < x1 - 0.8; x += 1.1 + rand() * 0.5) bush(x, z0 + 0.7 + rand() * 0.3, 0.45 + rand() * 0.2);
    for (let z = z0 + 1.6; z < hd + 1.5; z += 1.2 + rand() * 0.5) {
      bush(x0 + 0.7 + rand() * 0.2, z, 0.4 + rand() * 0.2);
      bush(x1 - 0.7 - rand() * 0.2, z, 0.4 + rand() * 0.2);
    }
    tree(x0 + 1.1, z0 + 1.1);
    tree(x1 - 1.1, z0 + 1.1);
    if (!carOn || driveX < 0) tree(x1 - 1.3, z1 - 1.5);
    if (!carOn || driveX > 0) tree(x0 + 1.3, z1 - 1.5);
    // Flower beds by the door.
    for (const sx of [-1, 1]) {
      bush(door.x + sx * 1.4, hd + PAVE + 0.5, 0.32);
      for (let k = 0; k < 4; k++) {
        const g = new THREE.IcosahedronGeometry(0.07, 0).translate(door.x + sx * (1.2 + rand() * 0.5), LAWN_Y + 0.5, hd + PAVE + 0.3 + rand() * 0.5);
        parts.push(clean(colored(g, ['#ff5fa2', '#f2c12e', '#ffffff', '#e63946'][k])));
      }
    }
    const g = keep(mergeGeometries(parts)!);
    parts.forEach((p) => p.dispose());
    const m = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    m.castShadow = !!opts.shadows;
    m.name = 'yard-plants';
    group.add(m);
  }

  // ---- garden lamps: black posts with glowing heads, and pools of light on the ground after dark
  const lampSpots: [number, number][] = [
    [-hw - PAVE / 2, -hd - PAVE / 2], [hw + PAVE / 2, -hd - PAVE / 2], [-hw - PAVE / 2, hd + PAVE / 2], [hw + PAVE / 2, hd + PAVE / 2],
    [door.x - 1.1, z1 - 0.6], [door.x + 1.1, z1 - 0.6],
  ];
  const heads = keep(new THREE.MeshBasicMaterial({ color: '#fff1d6' }));
  const pools = keep(new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  {
    const posts: THREE.BufferGeometry[] = [], tops: THREE.BufferGeometry[] = [], glows: THREE.BufferGeometry[] = [];
    for (const [x, z] of lampSpots) {
      posts.push(clean(colored(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 8).translate(x, LAWN_Y + 0.375, z), '#1d1e22')));
      posts.push(clean(colored(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 8).translate(x, LAWN_Y + 0.95, z), '#1d1e22')));
      tops.push(clean(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8).translate(x, LAWN_Y + 0.84, z)));
      const c = new THREE.CircleGeometry(0.9, 20).rotateX(-Math.PI / 2).translate(x, LAWN_Y + 0.02, z);
      glows.push(clean(c));
    }
    const pm = new THREE.Mesh(keep(mergeGeometries(posts)!), keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
    const tm = new THREE.Mesh(keep(mergeGeometries(tops)!), heads);
    const gm = new THREE.Mesh(keep(mergeGeometries(glows)!), pools);
    gm.renderOrder = 2;
    [...posts, ...tops, ...glows].forEach((p) => p.dispose());
    pm.name = 'yard-lamps';
    group.add(pm, tm, gm);
  }

  // ---- the car on the driveway
  if (carOn && opts.car) {
    const v = VEHICLES.get(opts.car.model)!;
    const g = vehicleGeometry(v, opts.car.paint, 1);
    const m = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
    m.position.set(driveX, LAWN_Y + 0.02, hd + PAVE + 2.6);
    m.rotation.y = Math.PI; // nose to the house
    m.castShadow = !!opts.shadows;
    m.name = 'yard-car';
    group.add(m);
  }

  return {
    group,
    setDark: (k) => {
      heads.color.set(k > 0.4 ? '#ffe2a8' : '#e9e4d8');
      pools.opacity = Math.max(0, (k - 0.4) * 0.45);
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
