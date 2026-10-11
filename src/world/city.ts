// =====================================================================
// city.ts — builds one area (Manhattan or Brooklyn) in 3D from the plan
// in layout.ts and the places in data/places.ts.
//
// PERFORMANCE PLAN
//   • Buildings are merged per CHUNK and per facade style: one chunk of
//     ~6 blocks costs about 6 draw calls however many buildings it has.
//   • Repeated small things (trees, lamps, water towers, fence posts)
//     use InstancedMesh: one draw call for all of them.
//   • Each chunk has a "detail" layer (street furniture, signs, people
//     markers) that is hidden when the chunk is far from the camera.
//   • Night lights come from an emissive window texture, so the skyline
//     glows without any extra lights.
// =====================================================================

import * as THREE from 'three';
import { CHUNK_SIZE } from '../core/constants.ts';
import { Rng } from '../core/rng.ts';
import { doorOf, placesIn } from '../data/places.ts';
import type { AreaId } from '../sim/types.ts';
import { comingSoonTexture, facadeTextures, signTexture, type FacadeStyle } from '../render/textures.ts';
import { GeoBuilder } from './geo.ts';
import { avenueX, blockRect, districtBounds, DISTRICTS, SIDEWALK, streetZ, type DistrictDef, type Rect } from './layout.ts';
import { buildNavGrid, type NavGrid } from './nav.ts';
import { kitMaterial, type Kits } from '../assets/kit.ts';
import { CityBlocks } from './nycgen/city-blocks.ts';
import { groundTextures } from './nycgen/atlas.ts';
import { buildCoast, onLand } from './coast.ts';
import { LANDMARKS } from './landmarks/index.ts';
import { FULL_BLOCK_LANDMARKS } from '../data/places.ts';
import { Toy } from './landmarks/toy.ts';

export type AdSize = 'S' | 'M' | 'L' | 'XL';

/** A spot where an ad can show. The ad system fills these with creatives. */
export interface AdSlot {
  id: string;
  area: AreaId;
  size: AdSize;
  width: number;
  height: number;
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  /** Rough importance for pricing: hub screens > avenue billboards > posters. */
  tier: 'hub' | 'avenue' | 'street';
  chunk: number;
}

export interface DoorMarker {
  placeId: string;
  position: THREE.Vector3;
  /** Invisible tap target, bigger than the visible marker so it's easy to hit. */
  hit: THREE.Mesh;
}

interface Chunk {
  center: THREE.Vector2;
  detail: THREE.Group;
}

export interface BuiltCity {
  area: AreaId;
  group: THREE.Group;
  nav: NavGrid;
  adSlots: AdSlot[];
  doors: DoorMarker[];
  /** Meshes you can tap to walk to (ground, sidewalks, plazas). */
  walkSurfaces: THREE.Object3D[];
  /** Building walls: a tap that hits one walks you to the sidewalk in front of it. */
  solids: THREE.Object3D[];
  /** Show/hide detail by distance from the camera's focus point. */
  updateLod: (focus: THREE.Vector3, radius: number, cameraDistance?: number) => void;
  /** Per-frame animation (Ferris wheels, carousels…). */
  tick: (dt: number) => void;
  /** Fade out buildings standing between the camera and the player. */
  updateSeeThrough: (camera: THREE.Vector3, player: THREE.Vector3, dt: number) => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------
// Shared materials (created once per area; disposed with it)
// ---------------------------------------------------------------------

/** All facade materials share one night-glow strength we update every frame. */
export const nightGlow = { value: 0 };
const facadeMats = new Map<FacadeStyle, THREE.MeshLambertMaterial>();

export function facadeMaterial(style: FacadeStyle): THREE.MeshLambertMaterial {
  let m = facadeMats.get(style);
  if (!m) {
    const t = facadeTextures(style);
    m = new THREE.MeshLambertMaterial({ map: t.map, emissiveMap: t.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
    facadeMats.set(style, m);
  }
  return m;
}

/** Called by the sky system each frame: windows light up after sunset. */
export function setNightGlow(v: number): void {
  nightGlow.value = v;
  for (const m of facadeMats.values()) m.emissiveIntensity = v;
}

/** Landmarks that occupy their whole block (no generated buildings there). */

// ---------------------------------------------------------------------

export function buildCity(area: AreaId, opts: { trees: boolean; shadows?: boolean; kits?: Kits; /** Shrinks the detailed area on weak phones (1 = normal). */ detailScale?: number }): BuiltCity {
  const detailScale = opts.detailScale ?? 1;
  const kitProps = opts.kits?.props;
  const d = DISTRICTS[area];
  const rng = new Rng(d.seed);
  const group = new THREE.Group();
  group.name = `city-${area}`;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const bounds = districtBounds(d, 60);
  const walkSurfaces: THREE.Object3D[] = [];
  const solidMeshes: THREE.Object3D[] = [];
  const adSlots: AdSlot[] = [];
  const doors: DoorMarker[] = [];

  // --------------------------------------------------------- chunks
  const chunks: Chunk[] = [];
  const chunkIndex = new Map<string, number>();
  const chunkFor = (x: number, z: number): number => {
    const cx = Math.floor((x - bounds.minX) / CHUNK_SIZE);
    const cz = Math.floor((z - bounds.minZ) / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    let i = chunkIndex.get(key);
    if (i === undefined) {
      i = chunks.length;
      chunkIndex.set(key, i);
      const detail = new THREE.Group();
      detail.name = `detail-${key}`;
      group.add(detail);
      chunks.push({ center: new THREE.Vector2(bounds.minX + (cx + 0.5) * CHUNK_SIZE, bounds.minZ + (cz + 0.5) * CHUNK_SIZE), detail });
    }
    return i;
  };

  // --------------------------------------------------------- ground & water
  const gt = groundTextures();
  // The borough's real coastline, paved, with water all around and the
  // other boroughs across the rivers (world/coast.ts). Roads are the
  // paved land between the blocks.
  const asphaltTex = track(gt.asphalt.clone());
  asphaltTex.repeat.set(1 / 7, 1 / 7);
  const asphalt = track(new THREE.MeshLambertMaterial({ map: asphaltTex }));
  const coast = buildCoast(d, asphalt, track);
  group.add(coast.group);
  walkSurfaces.push(coast.ground);

  // --------------------------------------------------------- road markings
  const marks = new GeoBuilder();
  for (let i = 0; i <= d.cols; i++) {
    for (let j = 0; j <= d.rows; j++) {
      const ax = avenueX(d, i);
      const sz = streetZ(d, j);
      if (!onLand(d.borough, ax, sz)) continue; // in the river
      // Zebra crosswalks on all four sides of every intersection.
      for (let k = -4; k <= 4; k++) {
        const ox = ax + k * (d.avenueW / 9);
        marks.flat(ox - 0.5, ox + 0.5, sz - d.streetW / 2 - 3.2, sz - d.streetW / 2 - 0.6, 0.04);
        marks.flat(ox - 0.5, ox + 0.5, sz + d.streetW / 2 + 0.6, sz + d.streetW / 2 + 3.2, 0.04);
        const oz = sz + k * (d.streetW / 9);
        marks.flat(ax - d.avenueW / 2 - 3.2, ax - d.avenueW / 2 - 0.6, oz - 0.45, oz + 0.45, 0.04);
        marks.flat(ax + d.avenueW / 2 + 0.6, ax + d.avenueW / 2 + 3.2, oz - 0.45, oz + 0.45, 0.04);
      }
    }
  }
  // Two-lane roads: a double yellow line down the middle of every
  // avenue and street, broken at the crossings.
  const yellow = new GeoBuilder();
  for (let i = 0; i <= d.cols; i++) {
    const ax = avenueX(d, i);
    for (let j = 0; j < d.rows; j++) {
      const z0 = streetZ(d, j) + d.streetW / 2 + 3.6;
      const z1 = streetZ(d, j + 1) - d.streetW / 2 - 3.6;
      if (!onLand(d.borough, ax, z0) || !onLand(d.borough, ax, z1)) continue;
      for (const off of [-0.22, 0.22]) yellow.flat(ax + off - 0.09, ax + off + 0.09, z0, z1, 0.045);
    }
  }
  for (let j = 0; j <= d.rows; j++) {
    const sz = streetZ(d, j);
    for (let i = 0; i < d.cols; i++) {
      const x0 = avenueX(d, i) + d.avenueW / 2 + 3.6;
      const x1 = avenueX(d, i + 1) - d.avenueW / 2 - 3.6;
      if (!onLand(d.borough, x0, sz) || !onLand(d.borough, x1, sz)) continue;
      for (const off of [-0.22, 0.22]) yellow.flat(x0, x1, sz + off - 0.09, sz + off + 0.09, 0.045);
    }
  }
  const markMesh = new THREE.Mesh(track(marks.build()), track(new THREE.MeshLambertMaterial({ color: '#f4f2ea' })));
  markMesh.receiveShadow = true;
  group.add(markMesh);
  const yellowMesh = new THREE.Mesh(track(yellow.build()), track(new THREE.MeshLambertMaterial({ color: '#ffcc33' })));
  yellowMesh.receiveShadow = true;
  group.add(yellowMesh);

  // --------------------------------------------------------- blocks
  const sidewalkGeo = new GeoBuilder();
  const grassGeo = new GeoBuilder();
  const plazaGeo = new GeoBuilder();
  const dirtGeo = new GeoBuilder();
  const trees: THREE.Vector3[] = [];
  const lamps: THREE.Vector3[] = [];
  const fencePosts: { p: THREE.Vector3; rotY: number }[] = [];
  const benches: { p: THREE.Vector3; rotY: number }[] = [];

  const places = placesIn(area);
  const doorSpots = places.map((p) => ({ p, door: doorOf(p) }));

  const hubRect = blockRect(d, d.hub.c, d.hub.r);

  for (let c = 0; c < d.cols; c++) {
    for (let r = 0; r < d.rows; r++) {
      const b = blockRect(d, c, r);
      const kind = d.kind(c, r);
      if (kind === 'water') continue; // in the river
      const zone = d.zone(c, r);
      const inner: Rect = { minX: b.minX + SIDEWALK, maxX: b.maxX - SIDEWALK, minZ: b.minZ + SIDEWALK, maxZ: b.maxZ - SIDEWALK };

      // Kerb + sidewalk slab under every block. (Street lamps, trees and
      // all the other street life come from the generator: nycgen/props.ts.)
      sidewalkGeo.box(b.minX, b.maxX, 0, 0.18, b.minZ, b.maxZ);
      void zone;

      if (kind === 'park') {
        grassGeo.flat(inner.minX, inner.maxX, inner.minZ, inner.maxZ, 0.2, 4);
        // Paths in a cross.
        plazaGeo.flat((inner.minX + inner.maxX) / 2 - 2.5, (inner.minX + inner.maxX) / 2 + 2.5, inner.minZ, inner.maxZ, 0.22);
        plazaGeo.flat(inner.minX, inner.maxX, (inner.minZ + inner.maxZ) / 2 - 2, (inner.minZ + inner.maxZ) / 2 + 2, 0.22);
        for (let i = 0; i < 26; i++) {
          const x = rng.range(inner.minX + 3, inner.maxX - 3);
          const z = rng.range(inner.minZ + 3, inner.maxZ - 3);
          if (Math.abs(x - (inner.minX + inner.maxX) / 2) < 4 || Math.abs(z - (inner.minZ + inner.maxZ) / 2) < 4) continue;
          trees.push(new THREE.Vector3(x, 0.2, z));
        }
        for (let i = 0; i < 6; i++) benches.push({ p: new THREE.Vector3((inner.minX + inner.maxX) / 2 + (i % 2 ? 4 : -4), 0.2, inner.minZ + 6 + i * ((inner.maxZ - inner.minZ - 12) / 6)), rotY: i % 2 ? -Math.PI / 2 : Math.PI / 2 });
        continue;
      }

      if (kind === 'plaza') {
        plazaGeo.flat(b.minX + 0.5, b.maxX - 0.5, b.minZ + 0.5, b.maxZ - 0.5, 0.2, 3);
        continue; // the hub's screens and steps are added below
      }

      if (kind === 'vacant') {
        dirtGeo.flat(inner.minX, inner.maxX, inner.minZ, inner.maxZ, 0.19, 6);
        // Fence posts all round.
        for (let x = inner.minX; x <= inner.maxX; x += 3) {
          fencePosts.push({ p: new THREE.Vector3(x, 0.18, inner.minZ), rotY: 0 }, { p: new THREE.Vector3(x, 0.18, inner.maxZ), rotY: 0 });
        }
        for (let z = inner.minZ; z <= inner.maxZ; z += 3) {
          fencePosts.push({ p: new THREE.Vector3(inner.minX, 0.18, z), rotY: Math.PI / 2 }, { p: new THREE.Vector3(inner.maxX, 0.18, z), rotY: Math.PI / 2 });
        }
        addComingSoon(group, track, inner, chunks[chunkFor((inner.minX + inner.maxX) / 2, (inner.minZ + inner.maxZ) / 2)].detail);
        continue;
      }

      // ---- blocks fully taken by a landmark get no ordinary buildings
      if (places.some((p) => FULL_BLOCK_LANDMARKS.has(p.id) && p.block[0] === c && p.block[1] === r)) continue;

      // ---- ordinary buildings come from the NYC generator (nycgen/), below.
    }
  }

  // --------------------------------------------------------- hub (Times Square / Atlantic Plaza)
  const solids: Rect[] = [];
  addHub(d, group, adSlots, track, chunkFor, rng, solids);

  // --------------------------------------------------------- merge static meshes
  const paverTex = track(gt.paver.clone());
  paverTex.repeat.set(1 / 1.8, 1 / 1.8);
  const concrete = track(new THREE.MeshLambertMaterial({ map: paverTex }));
  const sidewalkMesh = new THREE.Mesh(track(sidewalkGeo.build()), concrete);
  sidewalkMesh.receiveShadow = true;
  sidewalkMesh.name = 'sidewalks';
  group.add(sidewalkMesh);
  walkSurfaces.push(sidewalkMesh);

  if (!grassGeo.empty) {
    const grass = new THREE.Mesh(track(grassGeo.build()), track(new THREE.MeshLambertMaterial({ color: '#7ed37a' })));
    grass.receiveShadow = true;
    group.add(grass);
    walkSurfaces.push(grass);
  }
  if (!plazaGeo.empty) {
    const plaza = new THREE.Mesh(track(plazaGeo.build()), track(new THREE.MeshLambertMaterial({ color: '#f0dfc8' })));
    plaza.receiveShadow = true;
    group.add(plaza);
    walkSurfaces.push(plaza);
  }
  if (!dirtGeo.empty) group.add(new THREE.Mesh(track(dirtGeo.build()), track(new THREE.MeshLambertMaterial({ color: '#8a6f4e' }))));

  // --------------------------------------------------------- generated NYC buildings + street life
  const nearHub = (c: number, r: number) => {
    const br = blockRect(d, c, r);
    const bc = { x: (br.minX + br.maxX) / 2, z: (br.minZ + br.maxZ) / 2 };
    return Math.abs(bc.x - (hubRect.minX + hubRect.maxX) / 2) < d.blockW * 1.6 && Math.abs(bc.z - (hubRect.minZ + hubRect.maxZ) / 2) < d.blockD * 2.2;
  };
  const nyc = new CityBlocks(d, {
    trees: opts.trees,
    shadows: !!opts.shadows,
    skip: (c, r) => places.some((p) => FULL_BLOCK_LANDMARKS.has(p.id) && p.block[0] === c && p.block[1] === r),
    nearHub,
    doors: doorSpots.map((x) => ({ x: x.door.x, z: x.door.z })),
    parkTrees: trees.map((t) => ({ x: t.x, z: t.z, y: t.y })),
    cache: opts.shadows ? 40 : 30,
  });
  group.add(nyc.group);
  disposables.push(nyc);
  // Rooftop billboards on some mid-rise roofs, facing the avenue.
  for (const p of nyc.plans) {
    if (p.style === 'brownstone' || p.style === 'glass' || p.style === 'deco' || p.height < 14 || p.height > 45 || !rng.chance(0.1)) continue;
    const facingEast = rng.chance(0.5);
    const w = Math.min(12, (p.rect.maxZ - p.rect.minZ) * 0.8);
    const roofY = p.tiers.reduce((h, t) => h + t.floors * p.floorH, 0);
    addAdSlot(adSlots, chunks[chunkFor(p.rect.minX, p.rect.minZ)].detail, area, 'L', 'avenue', w, w * 0.42, new THREE.Vector3(facingEast ? p.rect.maxX - 1.5 : p.rect.minX + 1.5, roofY + 1.4 + (w * 0.42) / 2, (p.rect.minZ + p.rect.maxZ) / 2), new THREE.Vector3(facingEast ? 1 : -1, 0, 0), chunkFor(p.rect.minX, p.rect.minZ), track, true);
  }

  // --------------------------------------------------------- instanced props
  const dummy = new THREE.Object3D();
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { p: THREE.Vector3; rotY?: number; s?: number }[], shadow = false) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(track(geo), mat, items.length);
    mesh.name = 'props-instanced';
    items.forEach((it, i) => {
      dummy.position.copy(it.p);
      dummy.rotation.set(0, it.rotY ?? 0, 0);
      dummy.scale.setScalar(it.s ?? 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = shadow;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };

  // Cartoon kit props (trees, lamps, traffic lights) when the pack loaded.
  const kp = (name: string) => kitProps?.get(name);
  const kitInstanced = (name: string, scale: number, items: { p: THREE.Vector3; rotY?: number; s?: number }[], shadow = false) => {
    const m = kp(name);
    if (!m || !items.length) return false;
    instanced(m.geometry.clone().scale(scale, scale, scale), kitMaterial(m.map), items, shadow);
    return true;
  };
  const treeItems = trees.map((p) => ({ p, rotY: rng.range(0, 6.28), s: rng.range(0.8, 1.25) }));
  // Park trees are drawn by the generator (puffy near, simple far: see nycgen).
  const kitTrees = true;
  void treeItems;
  const kitLamps = lamps.length > 0 && kitInstanced('light-curved', 9, lamps.map((p) => ({ p, rotY: Math.atan2(p.x - Math.round(p.x / 10) * 10, 1) })));
  if (kitProps) {
    // Traffic lights on one corner of every intersection.
    const lights: { p: THREE.Vector3; rotY: number }[] = [];
    for (let i = 0; i <= d.cols; i++) for (let j = 0; j <= d.rows; j++) if (onLand(d.borough, avenueX(d, i), streetZ(d, j))) lights.push({ p: new THREE.Vector3(avenueX(d, i) + d.avenueW / 2 + 1, 0.18, streetZ(d, j) + d.streetW / 2 + 1), rotY: Math.PI });
    kitInstanced('traffic-light', 9, lights);
  }

  if (opts.trees && !kitTrees) {
    const leaves = track(new THREE.MeshLambertMaterial({ color: '#3f7d3a' }));
    const trunk = track(new THREE.MeshLambertMaterial({ color: '#5b4331' }));
    const items = trees.map((p) => ({ p, s: rng.range(0.8, 1.3) }));
    instanced(new THREE.IcosahedronGeometry(2.4, 0).translate(0, 5.2, 0), leaves, items, true);
    instanced(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 5).translate(0, 1.7, 0), trunk, items);
  }

  const lampMat = track(new THREE.MeshLambertMaterial({ color: '#2f3b33' }));
  if (!kitLamps) instanced(new THREE.CylinderGeometry(0.09, 0.12, 6, 5).translate(0, 3, 0), lampMat, lamps.map((p) => ({ p })));
  const lampHeads = track(new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
  lampHeads.userData.nightLamp = true;
  if (!kitLamps) instanced(new THREE.SphereGeometry(0.32, 6, 4).translate(0, 6.1, 0), lampHeads, lamps.map((p) => ({ p })));

  const fenceMat = track(new THREE.MeshLambertMaterial({ color: '#7d8a8f' }));
  instanced(new THREE.BoxGeometry(0.12, 2.2, 3).translate(0, 1.1, 0), fenceMat, fencePosts.map((f) => ({ p: f.p, rotY: f.rotY + Math.PI / 2 })));
  const benchMat = track(new THREE.MeshLambertMaterial({ color: '#4e6b3c' }));
  instanced(new THREE.BoxGeometry(2.2, 0.5, 0.7).translate(0, 0.45, 0), benchMat, benches);

  // --------------------------------------------------------- landmarks
  // Cartoon landmarks come from their own registry (world/landmarks/).
  const animators: ((dt: number) => void)[] = [];
  for (const p of places) {
    const lm = LANDMARKS.get(p.id);
    if (!lm) continue;
    const bl = blockRect(d, p.block[0], p.block[1]);
    lm.build({ place: p, district: d, block: bl, inner: { minX: bl.minX + SIDEWALK, maxX: bl.maxX - SIDEWALK, minZ: bl.minZ + SIDEWALK, maxZ: bl.maxZ - SIDEWALK }, group, track, animate: (fn) => animators.push(fn) });
  }

  // --------------------------------------------------------- storefronts & doors
  const awningMat = new Map<string, THREE.MeshLambertMaterial>();
  const markerMat = track(new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.85, depthWrite: false }));
  const hitMat = track(new THREE.MeshBasicMaterial({ visible: false }));
  for (const { p, door } of doorSpots) {
    const chunk = chunkFor(door.x, door.z);
    const detail = chunks[chunk].detail;
    const facing = Math.atan2(door.faceX, door.faceZ);
    // Storefront sign above the door (not for parks/plazas/landmarks).
    if (p.interior !== 'none' || p.type === 'station' || p.type === 'shop') {
      const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(7, 1.3)), track(new THREE.MeshBasicMaterial({ map: track(signTexture(p.name, p.color)) })));
      sign.position.set(door.x + door.faceX * -SIDEWALK * 0.42, 4.2, door.z + door.faceZ * -SIDEWALK * 0.42);
      sign.rotation.y = facing;
      detail.add(sign);
      if (p.type !== 'station') {
        let am = awningMat.get(p.color);
        if (!am) awningMat.set(p.color, (am = track(new THREE.MeshLambertMaterial({ color: p.color }))));
        const awning = new THREE.Mesh(track(new THREE.BoxGeometry(7.4, 0.25, 1.8)), am);
        awning.position.set(door.x + door.faceX * -SIDEWALK * 0.15, 3.3, door.z + door.faceZ * -SIDEWALK * 0.15);
        awning.rotation.y = facing;
        awning.rotation.x = 0;
        detail.add(awning);
      }
    }
    if (p.type === 'station') addSubwayEntrance(detail, track, door.x, door.z, facing);

    // A soft glowing ring on the pavement marks every door you can use.
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(1.0, 1.35, 24)), markerMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(door.x, 0.24, door.z);
    ring.userData.pulse = true;
    detail.add(ring);
    const hit = new THREE.Mesh(track(new THREE.CylinderGeometry(2.4, 2.4, 4.4, 8)), hitMat);
    hit.position.set(door.x, 2.2, door.z);
    hit.userData.placeId = p.id;
    group.add(hit);
    doors.push({ placeId: p.id, position: new THREE.Vector3(door.x, 0, door.z), hit });
  }

  // --------------------------------------------------------- avenue-level posters & bus shelters
  addStreetAds(d, group, adSlots, track, chunkFor, rng, (x, z) => chunks[chunkFor(x, z)].detail);

  const nav = buildNavGrid(d, solids);

  const updateLod = (focus: THREE.Vector3, radius: number, cameraDistance = 40) => {
    const r2 = radius * radius;
    for (const ch of chunks) {
      const dx = ch.center.x - focus.x;
      const dz = ch.center.y - focus.z;
      ch.detail.visible = dx * dx + dz * dz < r2;
    }
    // Detailed blocks around the camera's focus; far stand-ins elsewhere.
    // Zoomed far out everything is small on screen, so the detailed
    // circle shrinks (cheap phones stay smooth).
    nyc.update(focus, (cameraDistance > 220 ? 110 : cameraDistance > 120 ? 140 : cameraDistance > 50 ? 115 : 90) * detailScale);
  };

  return {
    area,
    group,
    nav,
    adSlots,
    doors,
    walkSurfaces,
    get solids() {
      return [...solidMeshes, ...nyc.pickables];
    },
    updateLod,
    tick: (dt) => {
      for (const fn of animators) fn(dt);
    },
    updateSeeThrough: (camera, player, dt) => nyc.updateSeeThrough(camera, player, dt),
    dispose() {
      group.removeFromParent();
      for (const x of disposables) x.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry) m.geometry.dispose();
      });
    },
  };
}

// =====================================================================
// Pieces
// =====================================================================

type Track = <T extends { dispose(): void }>(x: T) => T;

function addAdSlot(slots: AdSlot[], parent: THREE.Object3D, area: AreaId, size: AdSize, tier: AdSlot['tier'], w: number, h: number, center: THREE.Vector3, normal: THREE.Vector3, chunk: number, track: Track, withFrame = false): void {
  const mat = track(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), mat);
  mesh.position.copy(center).addScaledVector(normal, 0.15);
  mesh.lookAt(mesh.position.clone().add(normal));
  // Lean ads back toward the sky so the slanted top-down camera sees
  // them nearly face-on: rooftop boards a lot, building screens a bit.
  const lean = withFrame ? 0.5 : tier === 'hub' ? 0.18 : 0;
  mesh.rotateX(-lean);
  parent.add(mesh);
  if (withFrame) {
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.3)), track(new THREE.MeshLambertMaterial({ color: '#222' })));
    frame.position.copy(center).addScaledVector(normal, -0.05);
    frame.lookAt(frame.position.clone().add(normal));
    frame.rotateX(-lean);
    parent.add(frame);
    // Two legs so rooftop billboards look mounted, not floating.
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(track(new THREE.BoxGeometry(0.3, h / 2 + 1.4, 0.3)), track(new THREE.MeshLambertMaterial({ color: '#333' })));
      const right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
      leg.position.copy(center).addScaledVector(right, side * w * 0.35).addScaledVector(normal, -0.4);
      leg.position.y = center.y - h / 2 - (h / 2 + 1.4) / 2 + h / 2;
      parent.add(leg);
    }
  }
  const id = `${area}-${size}-${slots.length}`;
  mesh.userData.adSlotId = id;
  slots.push({ id, area, size, width: w, height: h, mesh, center: center.clone(), normal: new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion), tier, chunk });
}

/**
 * The hub: a paved plaza ringed by giant screens on the surrounding
 * buildings, plus Times Square's famous red steps in Manhattan.
 * Screens are big, unlit-by-shadow ("glow") and face the plaza so
 * players actually see them.
 */
function addHub(d: DistrictDef, group: THREE.Group, slots: AdSlot[], track: Track, chunkFor: (x: number, z: number) => number, rng: Rng, solids: Rect[]): void {
  const b = blockRect(d, d.hub.c, d.hub.r);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  // How far the plaza extends (Times Square covers three blocks north–south).
  let zMin = b.minZ;
  let zMax = b.maxZ;
  for (let r = d.hub.r - 1; r >= 0 && d.kind(d.hub.c, r) === 'plaza'; r--) zMin = blockRect(d, d.hub.c, r).minZ;
  for (let r = d.hub.r + 1; r < d.rows && d.kind(d.hub.c, r) === 'plaza'; r++) zMax = blockRect(d, d.hub.c, r).maxZ;

  // Screens on the buildings across the avenues, facing the plaza.
  const westFace = avenueX(d, d.hub.c) - d.avenueW / 2 - SIDEWALK - 0.4;
  const eastFace = avenueX(d, d.hub.c + 1) + d.avenueW / 2 + SIDEWALK + 0.4;
  for (let z = zMin + 10; z < zMax - 6; z += rng.range(16, 24)) {
    for (const [x, nx] of [[westFace, 1], [eastFace, -1]] as const) {
      const xl = rng.chance(0.5);
      const w = xl ? rng.range(14, 20) : rng.range(9, 13);
      const h = xl ? w * rng.range(0.55, 1.2) : w * rng.range(0.5, 0.7);
      const y = rng.range(9, 26) + h / 2;
      addAdSlot(slots, group, d.id, xl ? 'XL' : 'L', 'hub', w, h, new THREE.Vector3(x, y, z), new THREE.Vector3(nx, 0, 0), chunkFor(x, z), track);
      // A second screen stacked above on some buildings: the "wall of screens" look.
      if (rng.chance(0.55)) {
        const h2 = w * 0.45;
        addAdSlot(slots, group, d.id, 'L', 'hub', w, h2, new THREE.Vector3(x, y + h / 2 + h2 / 2 + 2, z), new THREE.Vector3(nx, 0, 0), chunkFor(x, z), track);
      }
    }
  }
  // A tall screen tower at the north end, like One Times Square.
  // It stands at the south end of the plaza and faces north up the square.
  const towerZ = zMax - 9;
  {
    // Cartoon One Times Square: a slim tower wrapped in screen frames,
    // with the New Year's Eve ball on a pole at the top.
    const toy = new Toy();
    toy.block(16, 70, 12, cx, 0, towerZ, '#3b3f4a', 0.04);
    for (let y = 8; y < 66; y += 12) toy.block(16.8, 1.1, 12.8, cx, y, towerZ, '#ffd23f', 0.4); // lit frame bands
    toy.block(17, 2, 13, cx, 70, towerZ, '#e9ecf2', 0.3);
    toy.cyl(0.35, 0.45, 12, cx, 72, towerZ, '#c9ced6', 8);
    toy.sphere(2.6, cx, 85.5, towerZ, '#d9f1ff');
    // Little coloured dots on the ball (its famous crystal panels).
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      toy.sphere(0.55, cx + Math.cos(a) * 2.5, 85.5 + Math.sin(i * 1.7) * 1.2, towerZ + Math.sin(a) * 2.5, ['#ff5fa2', '#4ecdc4', '#ffd23f', '#9b5de5'][i % 4]);
    }
    const mesh = toy.build('landmark-one-times-square');
    group.add(mesh);
  }
  solids.push({ minX: cx - 8, maxX: cx + 8, minZ: towerZ - 6, maxZ: towerZ + 6 });
  addAdSlot(slots, group, d.id, 'XL', 'hub', 15, 22, new THREE.Vector3(cx, 30, towerZ - 6.2), new THREE.Vector3(0, 0, -1), chunkFor(cx, towerZ), track);
  addAdSlot(slots, group, d.id, 'L', 'hub', 15, 9, new THREE.Vector3(cx, 52, towerZ - 6.2), new THREE.Vector3(0, 0, -1), chunkFor(cx, towerZ), track);

  if (d.id === 'manhattan') {
    // The TKTS red steps: a glowing red grandstand with white step edges,
    // the ticket booth tucked underneath, and a few seats on top.
    const stepMat = track(new THREE.MeshBasicMaterial({ color: '#e0283f', toneMapped: false }));
    const edgeMat = track(new THREE.MeshBasicMaterial({ color: '#ffe3e7', toneMapped: false }));
    for (let i = 0; i < 10; i++) {
      const step = new THREE.Mesh(track(new THREE.BoxGeometry(18, 0.5, 1.6)), stepMat);
      step.position.set(cx, 0.45 + i * 0.5, cz - 4 + i * 1.6);
      const edge = new THREE.Mesh(track(new THREE.BoxGeometry(18.1, 0.08, 0.12)), edgeMat);
      edge.position.set(cx, 0.72 + i * 0.5, cz - 4.78 + i * 1.6);
      group.add(step, edge);
    }
    // The pedestrian plaza: bright red-and-blue painted zones, café
    // seating with umbrellas and flower planters, so it feels busy.
    const plaza = new Toy();
    for (let z = zMin + 14; z < zMax - 22; z += 26) {
      plaza.block(22, 0.06, 10, cx, 0.2, z, '#3b5bdb', 0.02);
      plaza.block(10, 0.07, 6, cx - 9, 0.2, z + 9, '#e0283f', 0.02);
      for (let k = 0; k < 4; k++) {
        const tx = cx - 7 + k * 4.6;
        plaza.cyl(0.6, 0.6, 0.9, tx, 0.26, z, '#f4f1ea', 10);
        plaza.cyl(0.06, 0.06, 2.3, tx, 0.26, z, '#cccccc', 4);
        plaza.add(new THREE.ConeGeometry(1.6, 0.7, 8).translate(tx, 2.6, z), ['#e0283f', '#ffd23f', '#ffffff', '#3b5bdb'][k]);
      }
      for (const px of [b.minX + 6, b.maxX - 6]) {
        plaza.block(2.4, 0.9, 2.4, px, 0.2, z + 4, '#8a5a3b', 0.25);
        for (let k = 0; k < 4; k++) plaza.sphere(0.55, px + (k % 2 ? 0.5 : -0.5), 1.4, z + 4 + (k < 2 ? 0.5 : -0.5), ['#ff6b9a', '#ffd166', '#5cb85c', '#c77dff'][k]);
      }
    }
    group.add(plaza.build('times-square-plaza'));
    const booth = new Toy();
    booth.block(8, 3, 4, cx, 0.2, cz + 13, '#f4f1ea', 0.2);
    booth.block(8.6, 0.6, 4.6, cx, 3.2, cz + 13, '#e0283f', 0.3);
    booth.block(6, 1.4, 0.3, cx, 1.2, cz + 15.05, '#7fb3e6', 0.2);
    group.add(booth.build('tkts-booth'));
  }
  // Light poles with banners give the plaza its own skyline.
  const poleMat = track(new THREE.MeshLambertMaterial({ color: '#30343b' }));
  for (let z = zMin + 6; z < zMax; z += 20) {
    for (const x of [b.minX + 3, b.maxX - 3]) {
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.15, 0.2, 9, 6)), poleMat);
      pole.position.set(x, 4.5, z);
      group.add(pole);
    }
  }
}

/** Bus-shelter posters and scaffolding wraps along the avenues: small, frequent, cheap. */
function addStreetAds(d: DistrictDef, group: THREE.Group, slots: AdSlot[], track: Track, chunkFor: (x: number, z: number) => number, rng: Rng, detailAt: (x: number, z: number) => THREE.Object3D): void {
  const shelterMat = track(new THREE.MeshLambertMaterial({ color: '#2b3036' }));
  const glassMat = track(new THREE.MeshLambertMaterial({ color: '#a9c7d6', transparent: true, opacity: 0.35 }));
  const roofs: THREE.Matrix4[] = [];
  const backs: THREE.Matrix4[] = [];
  for (let i = 0; i <= d.cols; i += 2) {
    for (let j = 1; j < d.rows; j += 2) {
      if (!rng.chance(0.55)) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      const x = avenueX(d, i) + side * (d.avenueW / 2 + 1.2);
      const z = streetZ(d, j) + d.streetW / 2 + 9;
      const k = d.kind(Math.min(d.cols - 1, Math.max(0, i - (side < 0 ? 1 : 0))), j);
      if (k === 'vacant' || k === 'water' || !onLand(d.borough, x, z)) continue;
      // Shelter roof and back panel (instanced below: 2 draw calls for all of them).
      roofs.push(new THREE.Matrix4().makeTranslation(x, 2.6, z));
      backs.push(new THREE.Matrix4().makeTranslation(x + side * 0.85, 1.4, z));
      // The poster faces the street so drivers and walkers see it.
      addAdSlot(slots, detailAt(x, z), d.id, 'S', 'street', 1.5, 2.1, new THREE.Vector3(x + side * 0.82, 1.4, z + 2.6), new THREE.Vector3(-side, 0, 0), chunkFor(x, z), track);
    }
  }
  if (roofs.length) {
    const r = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1.8, 0.12, 4.4)), shelterMat, roofs.length);
    const b = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.06, 2.4, 4.2)), glassMat, backs.length);
    roofs.forEach((m, i) => r.setMatrixAt(i, m));
    backs.forEach((m, i) => b.setMatrixAt(i, m));
    r.name = 'bus-shelters';
    b.name = 'bus-shelter-glass';
    group.add(r, b);
  }
}

function addComingSoon(group: THREE.Group, track: Track, r: Rect, detail: THREE.Group): void {
  const tex = track(comingSoonTexture());
  const mat = track(new THREE.MeshBasicMaterial({ map: tex }));
  const cx = (r.minX + r.maxX) / 2;
  for (const z of [r.maxZ + 0.1, r.minZ - 0.1]) {
    const banner = new THREE.Mesh(track(new THREE.PlaneGeometry(14, 3.5)), mat);
    banner.position.set(cx, 1.8, z);
    if (z < r.minZ) banner.rotation.y = Math.PI;
    group.add(banner);
  }
  // A construction crane: tells the story "this area is being built".
  const crane = new THREE.Group();
  const yellow = track(new THREE.MeshLambertMaterial({ color: '#f2b705' }));
  const mast = new THREE.Mesh(track(new THREE.BoxGeometry(1.4, 46, 1.4)), yellow);
  mast.position.y = 23;
  const jib = new THREE.Mesh(track(new THREE.BoxGeometry(34, 1.1, 1.1)), yellow);
  jib.position.set(10, 45, 0);
  crane.add(mast, jib);
  crane.position.set(cx - 6, 0, (r.minZ + r.maxZ) / 2);
  detail.add(crane);
}

/** The green globes every New Yorker knows mean "subway here". */
function addSubwayEntrance(parent: THREE.Group, track: Track, x: number, z: number, facing: number): void {
  const g = new THREE.Group();
  const rail = track(new THREE.MeshLambertMaterial({ color: '#1f5f3b' }));
  const glow = track(new THREE.MeshBasicMaterial({ color: '#4cd964', toneMapped: false }));
  for (const side of [-1.6, 1.6]) {
    const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6)), rail);
    post.position.set(side, 1.3, 0);
    const globe = new THREE.Mesh(track(new THREE.SphereGeometry(0.3, 10, 8)), glow);
    globe.position.set(side, 2.75, 0);
    g.add(post, globe);
  }
  const railBar = new THREE.Mesh(track(new THREE.BoxGeometry(3.2, 0.1, 0.1)), rail);
  railBar.position.y = 1.1;
  g.add(railBar);
  g.position.set(x, 0.18, z);
  g.rotation.y = facing;
  parent.add(g);
}
