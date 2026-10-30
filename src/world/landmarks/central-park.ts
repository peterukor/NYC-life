// =====================================================================
// Central Park — cartoon version of the real thing (rebuilt 2026-10-30,
// Peter: "fix the central park… take your time pls").
//
// WHERE things go is world/central-park-plan.ts (shared with the city's
// trees, the nav grid and the 2D map). This file BUILDS it:
//
//   • the ground: one painted texture on one plane (central-park-ground.ts)
//   • the water: the same texture on shiny meshes (one draw call)
//   • everything solid, merged per third of the park (south / middle /
//     north, so the off-screen thirds are skipped): the stone wall and
//     gates, Bethesda Terrace + the angel fountain, Bow Bridge, Gapstow
//     Bridge, the Loeb Boathouse, Belvedere Castle on Vista Rock, the
//     Carousel, the Bandshell, Wollman Rink, the Delacorte, gatehouses,
//     the Blockhouse, the mini golf, playgrounds, statues, carts,
//     carriages, backstops, schist outcrops… Several pieces are the walk-
//     in park's toy furniture scaled up (furniture-toys.ts), so outside
//     and inside match.
//   • lamp posts, lamp heads and benches: three instanced meshes
//   • rowboats on the Lake and sailboats on Conservatory Water: two
//     instanced meshes, drifting.
// The trees are planted by the city generator (city.ts → nycgen), so
// they cost no extra draw calls and get its near/far detail.
// About 12 draw calls in all (the old park was 4 + 8 for its ponds).
// =====================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { doorOf } from '../../data/places.ts';
import { signTexture } from '../../render/textures.ts';
import { centralParkPlan, type CentralParkPlan, type CPFeature } from '../central-park-plan.ts';
import { toyFurnitureModels } from '../furniture-toys.ts';
import { paintParkGround } from './central-park-ground.ts';
import { LANDMARKS } from './registry.ts';

const STONE = '#a39a8c';
const STONE_LT = '#c3bbae';
const STONE_DK = '#857d71';
const IRON = '#2b2d31';
const CREAM = '#efe6d2';

/** Merges flat-coloured shapes and ready-coloured toy pieces into one geometry. */
class Kit {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  get empty(): boolean {
    return !this.parts.length;
  }

  /** Any geometry in one colour, placed by position / turn (Y) / scale. */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rotY = 0, sx = 1, sy = sx, sz = sx): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const col = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.place(g, x, y, z, rotY, sx, sy, sz);
    return this;
  }

  /** A toy piece that already has its colours (furniture-toys.ts). */
  addToy(geo: THREE.BufferGeometry | undefined, x: number, y: number, z: number, rotY: number, s: number): this {
    if (!geo) return this;
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    this.place(g, x, y, z, rotY, s, s, s);
    return this;
  }

  private place(g: THREE.BufferGeometry, x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number): void {
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(this.m);
    this.parts.push(g);
  }

  /** A box sitting on y0, centred on x/z, turned by rotY. */
  box(w: number, h: number, d: number, x: number, y0: number, z: number, color: THREE.ColorRepresentation, rotY = 0): this {
    return this.add(BOX, color, x, y0 + h / 2, z, rotY, w, h, d);
  }

  /** A cylinder sitting on y0. */
  cyl(rTop: number, rBot: number, h: number, x: number, y0: number, z: number, color: THREE.ColorRepresentation, sides = 8): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, sides), color, x, y0 + h / 2, z);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts);
    this.parts = [];
    if (!g) return null;
    g.computeBoundingSphere();
    return g;
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1);

/** Local (lx, lz) turned by `rot` (canvas-style, as the ground painting does) around (x, z). */
const turn = (x: number, z: number, lx: number, lz: number, rot: number) => ({ x: x + lx * Math.cos(rot) - lz * Math.sin(rot), z: z + lx * Math.sin(rot) + lz * Math.cos(rot) });

LANDMARKS.add({
  id: 'centralPark',
  build({ district, group, track, animate, place, tier }) {
    const plan = centralParkPlan(district);
    if (!plan) return;
    const g = plan.grass;
    const GW = g.maxX - g.minX, GL = g.maxZ - g.minZ;
    const door = doorOf(place);
    const nearDoor = (x: number, z: number, r: number) => Math.hypot(x - door.x, z - door.z) < r;

    // ---------------------------------------------------------------- ground + water
    const tex = track(paintParkGround(plan, tier === 'low' ? 640 : 1024));
    const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(GW, GL).rotateX(-Math.PI / 2)), track(new THREE.MeshLambertMaterial({ map: tex })));
    ground.position.set((g.minX + g.maxX) / 2, 0.3, (g.minZ + g.maxZ) / 2);
    ground.receiveShadow = true;
    ground.name = 'central-park-ground';
    group.add(ground);

    const water = new THREE.Mesh(track(waterGeometry(plan)), track(new THREE.MeshPhongMaterial({ map: tex, shininess: 45, specular: new THREE.Color('#6f93ad') })));
    water.position.y = 0.34;
    water.receiveShadow = true;
    water.name = 'central-park-water';
    group.add(water);

    // ---------------------------------------------------------------- solid things, by third
    const zA = g.maxZ - GL * 0.36, zB = g.maxZ - GL * 0.7;
    const kits = [new Kit(), new Kit(), new Kit()];
    const kitAt = (z: number) => kits[z > zA ? 0 : z > zB ? 1 : 2];
    const toys = toyFurnitureModels();
    const lite = tier === 'low';

    // The stone wall and gate pillars.
    for (const w of plan.wall) {
      const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
      const alongX = Math.abs(w.b.x - w.a.x) > Math.abs(w.b.z - w.a.z);
      const n = Math.max(1, Math.ceil(len / 60));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const x = w.a.x + (w.b.x - w.a.x) * (t0 + t1) / 2, z = w.a.z + (w.b.z - w.a.z) * (t0 + t1) / 2;
        const l = len / n;
        const k = kitAt(z);
        k.box(alongX ? l : 0.7, 1.0, alongX ? 0.7 : l, x, 0.18, z, STONE);
        k.box(alongX ? l : 0.95, 0.16, alongX ? 0.95 : l, x, 1.18, z, STONE_LT);
      }
    }
    for (const p of plan.pillars) {
      const k = kitAt(p.z);
      k.box(1.3, 1.9, 1.3, p.x, 0.18, p.z, STONE_DK).box(1.55, 0.2, 1.55, p.x, 2.08, p.z, STONE_LT);
      k.add(new THREE.OctahedronGeometry(0.45, 0), STONE_LT, p.x, 2.7, p.z);
    }

    // Every feature in the plan.
    let golfSign: CPFeature | null = null;
    for (const f of plan.features) {
      const k = kitAt(f.z);
      const toy = (name: string, y = 0.3) => k.addToy(toys.get(name), f.x, y, f.z, f.rot, f.s);
      switch (f.kind) {
        case 'bethesda': toy('toyBethesdaFountain'); break;
        case 'terrace': terrace(k, f); break;
        case 'carousel': toy('toyCarousel'); break;
        case 'bandshell': toy('toyBandshell'); break;
        case 'playground': if (!lite || f.z > zA) toy('toyPlayground'); break;
        case 'statue': toy('toyStatue'); break;
        case 'pretzel': if (!nearDoor(f.x, f.z, 4)) toy('toyPretzelCart', f.z > g.maxZ ? 0.18 : 0.3); break;
        case 'carriage': toy('toyCarriage', 0.18); break;
        case 'golfStarter': toy('toyGolfStarter'); break;
        case 'golfHole': toy('toyGolfHole'); break;
        case 'golfBridge': toy('toyGolfBridge'); break;
        case 'golfTower': toy('toyGolfTower'); break;
        case 'golfFence': golfFence(k, plan); break;
        case 'golfSign': golfSign = f; signPosts(k, f); break;
        case 'dock': toy('toyBoatDock', 0.05); break;
        case 'castle': toy('toyCastle', 1.2); break;
        case 'vistaRock': rocks(k, f.x, f.z, [[0, 0, 6.5], [-5, 3, 4.2], [5, 2.5, 4.6], [-2, -5, 4], [4, -4, 3.5]], 0.55); break;
        case 'rocks': if (!lite || f.s > 1) rocks(k, f.x, f.z, [[0, 0, 2.3 * f.s], [1.8 * f.s, 0.9 * f.s, 1.5 * f.s], [-1.4 * f.s, 1.2 * f.s, 1.2 * f.s]], 0.62, f.rot); break;
        case 'backstop': backstop(k, f); break;
        case 'bowBridge': bowBridge(k, f); break;
        case 'gapstow': gapstow(k, f); break;
        case 'boathouse': boathouse(k, f); break;
        case 'rink': rinkBoards(k, f, 14, 8, true); break;
        case 'lasker': rinkBoards(k, f, 18, 8, false); break;
        case 'delacorte': delacorte(k, f); break;
        case 'gatehouse': house(k, f.x, f.z, 8, 3.6, 5.5, '#b3a690', '#5c6470', f.rot); break;
        case 'dana': house(k, f.x, f.z, 11, 3.8, 5, '#e9dcc0', '#7a5a43', 0); break;
        case 'dairy': dairy(k, f); break;
        case 'tennis': tennis(k, plan, f); break;
        case 'blockhouse': blockhouse(k, f); break;
        case 'cherryFountain':
          k.cyl(2.4, 2.6, 0.5, f.x, 0.3, f.z, STONE_LT, 14).cyl(2.1, 2.1, 0.06, f.x, 0.75, f.z, '#6cc0ef', 14).cyl(0.3, 0.45, 2.2, f.x, 0.3, f.z, '#c9a227', 8).add(new THREE.SphereGeometry(0.5, 8, 6), '#c9a227', f.x, 2.7, f.z);
          break;
        case 'consGarden': consGarden(k, f, toys); break;
      }
    }

    // ---------------------------------------------------------------- merge the thirds
    const solidMat = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    kits.forEach((k, i) => {
      const geo = k.build();
      if (!geo) return;
      const mesh = new THREE.Mesh(track(geo), solidMat);
      mesh.name = `landmark-central-park-${['south', 'mid', 'north'][i]}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    // The mini golf sign (its own little texture).
    if (golfSign) {
      const gs = golfSign as CPFeature;
      const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(7.5, 1.4)), track(new THREE.MeshBasicMaterial({ map: track(signTexture('⛳ MINI GOLF', '#2a9d8f')), side: THREE.DoubleSide })));
      sign.position.set(gs.x - 0.2, 3.3, gs.z);
      sign.rotation.y = gs.rot;
      sign.name = 'central-park-golf-sign';
      group.add(sign);
    }

    // ---------------------------------------------------------------- lamps & benches (instanced)
    const lamps = plan.lamps.filter((p) => !nearDoor(p.x, p.z, 3));
    const benches = plan.benches.filter((b, i) => !nearDoor(b.x, b.z, 4) && (!lite || i % 2 === 0));
    const dummy = new THREE.Object3D();
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; z: number; rot?: number }[], y: number, name: string) => {
      if (!items.length) return null;
      const m = new THREE.InstancedMesh(track(geo), mat, items.length);
      items.forEach((it, i) => {
        dummy.position.set(it.x, y, it.z);
        dummy.rotation.set(0, it.rot ?? 0, 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.computeBoundingSphere();
      m.name = name;
      // From the satellite map they're specks: don't draw them at all up there.
      const n = items.length;
      m.onBeforeRender = (_r, _s, cam) => {
        m.count = cam.position.y > 230 ? 0 : n;
      };
      group.add(m);
      return m;
    };
    // Lamp posts: open-ended low-poly cylinders (~40 triangles with the head).
    const open = (rt: number, rb: number, h: number, sides: number) => new THREE.CylinderGeometry(rt, rb, h, sides, 1, true);
    const pole = new Kit()
      .add(open(0.17, 0.26, 0.7, 6), '#26302a', 0, 0.35, 0)
      .add(open(0.07, 0.09, 3.3, 5), '#2f3b33', 0, 2.3, 0)
      .build()!;
    inst(pole, solidMat, lamps, 0.2, 'central-park-lamps');
    const head = new Kit()
      .add(open(0.28, 0.17, 0.6, 6), '#fff1c4', 0, 4.25, 0)
      .add(new THREE.ConeGeometry(0.32, 0.34, 6, 1, true), '#2f3b33', 0, 4.72, 0)
      .build()!;
    const headMat = track(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 0.55 }));
    inst(head, headMat, lamps, 0.2, 'central-park-lamp-heads');
    const bench = new Kit()
      .box(1.9, 0.1, 0.5, 0, 0.42, 0.02, '#a0703f')
      .box(1.9, 0.42, 0.08, 0, 0.58, -0.24, '#a0703f')
      .box(0.08, 0.95, 0.55, -0.82, 0, -0.02, IRON)
      .box(0.08, 0.95, 0.55, 0.82, 0, -0.02, IRON)
      .build()!;
    inst(bench, solidMat, benches, 0.2, 'central-park-benches');

    // ---------------------------------------------------------------- boats
    const boats: { mesh: THREE.InstancedMesh; loops: { x: number; z: number; r: number }[]; speed: number[]; phase: number[] }[] = [];
    const boatSet = (geo: THREE.BufferGeometry, loops: { x: number; z: number; r: number }[], colors: string[], name: string) => {
      if (!loops.length) return;
      const mesh = new THREE.InstancedMesh(track(geo), track(new THREE.MeshLambertMaterial({ vertexColors: true })), loops.length);
      loops.forEach((_, i) => mesh.setColorAt(i, new THREE.Color(colors[i % colors.length])));
      mesh.name = name;
      mesh.frustumCulled = false; // they move; tiny anyway
      group.add(mesh);
      boats.push({ mesh, loops, speed: loops.map((l, i) => (i % 2 ? 1 : -1) * (0.9 / Math.max(2, l.r)) * (0.8 + ((i * 37) % 10) / 25)), phase: loops.map((_, i) => i * 1.7) });
    };
    const rowboat = new Kit()
      .add(new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#ffffff', 0, 0.42, 0, 0, 0.75, 0.42, 1.65)
      .box(1.3, 0.06, 0.3, 0, 0.36, 0.3, '#d9c3a0')
      .box(1.3, 0.06, 0.3, 0, 0.36, -0.6, '#d9c3a0')
      .add(BOX, '#5c3a21', -1.0, 0.45, 0.25, 0.5, 1.3, 0.06, 0.12)
      .add(BOX, '#5c3a21', 1.0, 0.45, 0.25, -0.5, 1.3, 0.06, 0.12)
      .build()!;
    boatSet(rowboat, plan.rowboats, ['#e63946', '#ffbe0b', '#3a86ff', '#2a9d8f', '#ff006e', '#f4a261', '#06d6a0', '#8338ec', '#ffffff'], 'central-park-rowboats');
    const sailboat = new Kit()
      .add(new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#ffffff', 0, 0.2, 0, 0, 0.28, 0.2, 0.7)
      .cyl(0.03, 0.03, 1.3, 0, 0.2, 0, '#5c3a21', 4)
      .add(new THREE.ConeGeometry(0.42, 1.1, 3), '#ffffff', 0, 0.95, 0.05, 0, 0.12, 1, 1)
      .build()!;
    boatSet(sailboat, plan.sailboats, ['#ffffff', '#ff006e', '#ffbe0b', '#3a86ff'], 'central-park-sailboats');
    let time = 0;
    animate((dt) => {
      time += dt;
      for (const b of boats) {
        b.loops.forEach((l, i) => {
          const a = b.phase[i] + time * b.speed[i];
          const dir = Math.sign(b.speed[i]);
          dummy.position.set(l.x + Math.cos(a) * l.r, 0.3 + Math.sin(time * 1.6 + i) * 0.04, l.z + Math.sin(a) * l.r);
          dummy.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), Math.sin(time * 1.2 + i * 2) * 0.04);
          dummy.updateMatrix();
          b.mesh.setMatrixAt(i, dummy.matrix);
        });
        b.mesh.instanceMatrix.needsUpdate = true;
      }
    });
  },
});

// =================================================================== the pieces

/** One shiny mesh for all the water, mapped onto the ground painting. */
function waterGeometry(plan: CentralParkPlan): THREE.BufferGeometry {
  const g = plan.grass;
  const GW = g.maxX - g.minX, GL = g.maxZ - g.minZ;
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  for (const w of plan.waters) {
    const contour = w.pts.map((p) => new THREE.Vector2(p.x, p.z));
    // Grow the water a little under the painted stone rim (no gap at the shore).
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const base = pos.length / 3;
    for (const p of contour) {
      pos.push(p.x, 0, p.y);
      nor.push(0, 1, 0);
      uv.push((p.x - g.minX) / GW, 1 - (p.y - g.minZ) / GL);
    }
    for (const [a, b, c] of tris) {
      // Facing up (+y): counter-clockwise seen from above.
      const A = contour[a], B = contour[b], C = contour[c];
      const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
      if (cross > 0) idx.push(base + a, base + c, base + b);
      else idx.push(base + a, base + b, base + c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/** A cluster of schist boulders: [dx, dz, size] each, squashed by `flat`. */
function rocks(k: Kit, x: number, z: number, list: number[][], flat: number, rot = 0): void {
  const shades = ['#8d8a85', '#a19d97', '#77736e', '#9a958f'];
  list.forEach(([dx, dz, s], i) => {
    const p = turn(x, z, dx, dz, rot);
    k.add(new THREE.DodecahedronGeometry(1, 0), shades[i % shades.length], p.x, 0.3 + s * flat * 0.35, p.z, rot + i * 1.3, s, s * flat, s * 0.85);
  });
}

/** Bethesda Terrace: balustrades round the lower terrace, stairs in the middle, lamp pillars. */
function terrace(k: Kit, f: CPFeature): void {
  const y = 0.3;
  // South edge (towards the Mall), with the grand stair in the middle.
  for (const sx of [-1, 1]) {
    k.box(16, 1.0, 0.6, f.x + sx * 15, y, f.z, '#e6dcc6').box(16.4, 0.18, 0.85, f.x + sx * 15, y + 1.0, f.z, '#f4eddc');
    k.box(1.2, 2.2, 1.2, f.x + sx * 7, y, f.z, '#d8ccb2').box(1.4, 0.2, 1.4, f.x + sx * 7, y + 2.2, f.z, '#f4eddc');
    k.cyl(0.25, 0.3, 0.6, f.x + sx * 7, y + 2.4, f.z, '#3f4a42', 6);
  }
  for (let i = 0; i < 4; i++) k.box(12, 0.18 * (4 - i), 0.9, f.x, y, f.z - 0.2 - i * 0.9, '#e9e0cc');
  // North edge, along the Lake.
  for (const sx of [-1, 1]) k.box(14, 0.9, 0.5, f.x + sx * 13, y, f.z - 23.5, '#e6dcc6').box(14.3, 0.16, 0.7, f.x + sx * 13, y + 0.9, f.z - 23.5, '#f4eddc');
  // Side planters with clipped shrubs.
  for (const sx of [-1, 1]) for (const dz of [-6, -16]) k.box(2.4, 0.7, 2.4, f.x + sx * 21, y, f.z + dz, '#d8ccb2').add(new THREE.SphereGeometry(1.1, 8, 6), '#3f8f45', f.x + sx * 21, y + 1.4, f.z + dz);
}

/** Bow Bridge: a shallow cream cast-iron arch with planters at the ends (runs north–south). */
function bowBridge(k: Kit, f: CPFeature): void {
  const L = 30, W = 3.8, rise = 2.0;
  const n = 18;
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n, um = (u0 + u1) / 2;
    const z = f.z - L / 2 + um * L;
    const yy = 0.3 + Math.sin(um * Math.PI) * rise;
    const slope = Math.atan2((Math.sin(u1 * Math.PI) - Math.sin(u0 * Math.PI)) * rise, L / n);
    const seg = new THREE.BoxGeometry(W, 0.25, L / n + 0.08).rotateX(slope);
    k.add(seg, '#d9cbb0', f.x, yy, z);
    for (const sx of [-1, 1]) {
      k.add(new THREE.BoxGeometry(0.14, 0.9, L / n + 0.08).rotateX(slope), i % 2 ? '#e8dcc3' : CREAM, f.x + sx * (W / 2 - 0.07), yy + 0.55, z);
      k.add(new THREE.BoxGeometry(0.22, 0.1, L / n + 0.1).rotateX(slope), '#f6f0e2', f.x + sx * (W / 2 - 0.07), yy + 1.02, z);
    }
  }
  // The decorated arch under the deck.
  k.add(new THREE.TorusGeometry(L / 2, 0.28, 5, 22, Math.PI).rotateY(Math.PI / 2), '#cdbd9e', f.x - W / 2, 0.25, f.z, 0, 1, rise / (L / 2), 1);
  k.add(new THREE.TorusGeometry(L / 2, 0.28, 5, 22, Math.PI).rotateY(Math.PI / 2), '#cdbd9e', f.x + W / 2, 0.25, f.z, 0, 1, rise / (L / 2), 1);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const x = f.x + sx * (W / 2 + 0.3), z = f.z + sz * (L / 2 + 0.4);
    k.cyl(0.45, 0.55, 0.9, x, 0.3, z, '#d9cbb0', 8).cyl(0.6, 0.4, 0.5, x, 1.2, z, '#cdbd9e', 8).add(new THREE.SphereGeometry(0.55, 8, 5), '#4a9a4c', x, 1.95, z);
  }
}

/** Gapstow Bridge: a rough stone arch over the Pond's arm (runs east–west). */
function gapstow(k: Kit, f: CPFeature): void {
  const L = 22, W = 4, rise = 2.2, n = 12;
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n, um = (u0 + u1) / 2;
    const x = f.x - L / 2 + um * L;
    const yy = 0.3 + Math.sin(um * Math.PI) * rise;
    const slope = Math.atan2((Math.sin(u1 * Math.PI) - Math.sin(u0 * Math.PI)) * rise, L / n);
    k.add(new THREE.BoxGeometry(L / n + 0.1, 0.5, W).rotateZ(slope), '#8f8577', x, yy, f.z);
    for (const sz of [-1, 1]) k.add(new THREE.BoxGeometry(L / n + 0.1, 0.8, 0.45).rotateZ(slope), i % 2 ? '#9c9284' : '#867c6f', x, yy + 0.6, f.z + sz * (W / 2 - 0.2));
  }
  k.add(new THREE.TorusGeometry(L / 2 - 1, 0.7, 5, 16, Math.PI), '#7d7366', f.x, 0.2, f.z, 0, 1, rise / (L / 2 - 1), 3.2);
}

/** The Loeb Boathouse: cream walls, a green roof, an awning onto the Lake. */
function boathouse(k: Kit, f: CPFeature): void {
  k.box(9, 3.8, 14, f.x, 0.3, f.z, '#efe4cc');
  k.box(10, 0.4, 15, f.x, 4.1, f.z, '#5f8f7a');
  k.add(new THREE.CylinderGeometry(0.01, 6.2, 2.2, 4).rotateY(Math.PI / 4), '#4f7d69', f.x, 5.6, f.z, 0, 1.15, 1, 1.6);
  k.box(1.6, 2.6, 13, f.x - 5.3, 0.3, f.z, '#e7dcc0');
  k.box(3, 0.15, 13.5, f.x - 6, 3.1, f.z, '#2f6b4f');
  for (let i = 0; i < 5; i++) k.box(0.05, 1.6, 1.8, f.x - 4.55, 1.0, f.z - 5.2 + i * 2.6, '#5d7c96');
}

/** Rink boards (Wollman) or a pool edge (Lasker), plus a low rink house. */
function rinkBoards(k: Kit, f: CPFeature, hw: number, hd: number, ice: boolean): void {
  const col = ice ? '#ffffff' : '#e6e0d2', top = ice ? '#2a7fd4' : '#bfb8a6';
  for (const [w, d, x, z] of [[hw * 2, 0.25, 0, -hd], [hw * 2, 0.25, 0, hd], [0.25, hd * 2, -hw, 0], [0.25, hd * 2, hw, 0]] as const) {
    k.box(w, 0.9, d, f.x + x, 0.3, f.z + z, col).box(w + 0.05, 0.1, d + 0.1, f.x + x, 1.2, f.z + z, top);
  }
  k.box(hw * 1.2, 3.0, 4, f.x, 0.3, f.z + hd + 4.2, ice ? '#d9d4c7' : '#cfc6b3').box(hw * 1.25, 0.3, 4.4, f.x, 3.3, f.z + hd + 4.2, ice ? '#2a7fd4' : '#7a6a58');
}

/** The Delacorte: a half-ring of seats facing east to its stage (and Turtle Pond). */
function delacorte(k: Kit, f: CPFeature): void {
  const tiers = [[6.5, 0.5], [8.2, 1.0], [9.9, 1.5], [11.6, 2.0]];
  const n = 12;
  for (const [r, h] of tiers) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.62 + (i + 0.5) * ((Math.PI * 0.76) / n);
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      k.box(1.8, h, (r * Math.PI * 0.76) / n + 0.1, x, 0.3, z, h > 1.2 ? '#7f6b55' : '#94806a', -a);
    }
  }
  k.box(7, 0.7, 9, f.x + 2.5, 0.3, f.z, '#6f5b47').box(0.5, 4, 0.5, f.x + 5.8, 0.3, f.z - 4.3, IRON).box(0.5, 4, 0.5, f.x + 5.8, 0.3, f.z + 4.3, IRON);
}

/** A small stone house with a pyramid roof (gatehouses, Dana Center). */
function house(k: Kit, x: number, z: number, w: number, h: number, d: number, wall: string, roof: string, rot: number): void {
  k.box(w, h, d, x, 0.3, z, wall, rot);
  k.add(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.4, 2.4, 4).rotateY(Math.PI / 4), roof, x, 0.3 + h + 1.2, z, rot, 1, 1, d / w);
  for (const s of [-1, 1]) {
    const p = turn(x, z, 0, s * (d / 2 + 0.02), -rot);
    k.box(1.2, 1.9, 0.08, p.x, 0.3, p.z, '#3d4a57', rot);
  }
}

/** The Dairy: a little Victorian Gothic cottage. */
function dairy(k: Kit, f: CPFeature): void {
  k.box(8, 3.4, 5, f.x, 0.3, f.z, '#e8dcc2', f.rot);
  k.add(new THREE.CylinderGeometry(3.3, 3.3, 8.6, 3).rotateZ(Math.PI / 2).rotateX(Math.PI / 6), '#a8473a', f.x, 4.9, f.z, f.rot, 1, 0.7, 0.9);
  k.cyl(0.01, 0.9, 3.2, f.x + 2.6, 4.2, f.z, '#a8473a', 6);
}

/** Two rows of nets and a tennis house. */
function tennis(k: Kit, plan: CentralParkPlan, f: CPFeature): void {
  for (const op of plan.paint) {
    if (op.t !== 'tennis') continue;
    k.box(op.w + 0.4, 0.9, 0.08, op.x, 0.3, op.z, '#2b2d31').box(op.w + 0.4, 0.08, 0.1, op.x, 1.2, op.z, '#ffffff');
  }
  const p = { x: f.x + 35, z: f.z };
  k.box(9, 3, 6, p.x, 0.3, p.z, '#e7dcc4').box(9.6, 0.4, 6.6, p.x, 3.3, p.z, '#2f6b4f');
}

/** The Blockhouse: a little 1814 stone fort on its rock, crenellated. */
function blockhouse(k: Kit, f: CPFeature): void {
  rocks(k, f.x, f.z, [[0, 0, 4.5], [3, 2, 2.6], [-3, -2, 2.4]], 0.45, f.rot);
  const y = 1.6;
  k.box(6, 3.2, 6, f.x, y, f.z, '#8a8173', f.rot);
  for (let i = 0; i < 4; i++) {
    const a = f.rot + (i * Math.PI) / 2;
    for (const t of [-2.2, 0, 2.2]) {
      const p = turn(f.x, f.z, t, 3.0, -a);
      k.box(1.1, 0.7, 0.6, p.x, y + 3.2, p.z, '#968d7f', a);
    }
    const w = turn(f.x, f.z, 0, 3.02, -a);
    k.box(0.9, 1.0, 0.06, w.x, y + 1.4, w.z, '#2b2d31', a);
  }
}

/** A chain-link backstop behind home plate (same turn as the painted diamond). */
function backstop(k: Kit, f: CPFeature): void {
  const s = f.s;
  for (const [lx, lz, w, a] of [[0, 2.4, 5, 0], [-3.1, 1.2, 3.2, -Math.PI / 4], [3.1, 1.2, 3.2, Math.PI / 4]] as const) {
    const p = turn(f.x, f.z, lx * s, lz * s, f.rot);
    k.box(w * s, 3.2, 0.08, p.x, 0.3, p.z, '#a7aeb5', -(f.rot + a));
    k.box(w * s + 0.1, 0.12, 0.14, p.x, 3.5, p.z, '#5c636b', -(f.rot + a));
  }
  for (const sx of [-1, 1]) {
    const p = turn(f.x, f.z, sx * 4.5 * s, -2.4 * s, f.rot);
    k.box(3.2 * s, 0.5, 0.9, p.x, 0.3, p.z, '#7a5a3a', -(f.rot + (sx * Math.PI) / 4)); // player benches
  }
}

/** Low white rail round the mini golf, open on the west. */
function golfFence(k: Kit, plan: CentralParkPlan): void {
  const golf = plan.features.filter((f) => f.kind.startsWith('golf') && f.kind !== 'golfFence' && f.kind !== 'golfSign');
  if (!golf.length) return;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const f of golf) {
    x0 = Math.min(x0, f.x - 9); x1 = Math.max(x1, f.x + 9);
    z0 = Math.min(z0, f.z - 5); z1 = Math.max(z1, f.z + 5);
  }
  const zm = (z0 + z1) / 2;
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    k.box(alongX ? len : 0.12, 0.08, alongX ? 0.12 : len, (ax + bx) / 2, 1.0, (az + bz) / 2, '#ffffff');
    for (let t = 0; t <= len; t += 3) k.box(0.14, 1.05, 0.14, ax + ((bx - ax) * t) / len, 0.3, az + ((bz - az) * t) / len, '#ffffff');
  };
  rail(x0, z0, x1, z0);
  rail(x0, z1, x1, z1);
  rail(x1, z0, x1, z1);
  rail(x0, z0, x0, zm - 4);
  rail(x0, zm + 4, x0, z1);
}

/** Posts for the mini golf sign. */
function signPosts(k: Kit, f: CPFeature): void {
  for (const s of [-1, 1]) {
    const p = turn(f.x, f.z, 0, s * 3.6, 0);
    k.cyl(0.14, 0.16, 4.1, p.x, 0.3, p.z, '#1f6f66', 6).add(new THREE.SphereGeometry(0.28, 8, 5), '#ffbe0b', p.x, 4.5, p.z);
  }
}

/** The Conservatory Garden: clipped hedges round the lawn, fountains, the Vanderbilt Gate. */
function consGarden(k: Kit, f: CPFeature, toys: Map<string, THREE.BufferGeometry>): void {
  void toys;
  const hedge = (x: number, z: number, w: number, d: number) => {
    k.box(w, 1.5, d, x, 0.3, z, '#2d6a4f');
    const n = Math.round(Math.max(w, d) / 2.2);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      k.add(new THREE.IcosahedronGeometry(0.75, 0), i % 2 ? '#40916c' : '#2d6a4f', x + (w > d ? t * w : 0), 1.85, z + (w > d ? 0 : t * d));
    }
  };
  for (const sz of [-1, 1]) hedge(f.x, f.z + sz * 11.2, 26, 1.3);
  for (const sx of [-1, 1]) hedge(f.x + sx * 14, f.z, 1.3, 19);
  for (const dz of [-18, 18]) k.cyl(0.25, 0.35, 1.8, f.x, 0.3, f.z + dz, '#5f8f7a', 8).add(new THREE.SphereGeometry(0.45, 8, 5), '#5f8f7a', f.x, 2.3, f.z + dz);
  // Vanderbilt Gate: tall iron gates between stone piers on 5th Ave.
  const gx = f.x + 18.5;
  for (const s of [-1, 1]) k.box(1.4, 4.2, 1.4, gx, 0.18, f.z + s * 4.6, STONE_DK).box(1.7, 0.3, 1.7, gx, 4.38, f.z + s * 4.6, STONE_LT);
  k.add(new THREE.TorusGeometry(3.9, 0.12, 4, 16, Math.PI).rotateY(Math.PI / 2), IRON, gx, 4.3, f.z);
  for (let i = -6; i <= 6; i++) k.box(0.06, 3.8, 0.06, gx, 0.3, f.z + i * 0.6, IRON);
}
