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
import { doorOf, placesIn, type PlaceDef } from '../data/places.ts';
import type { AreaId } from '../sim/types.ts';
import { comingSoonTexture, facadeTextures, signTexture, type FacadeStyle } from '../render/textures.ts';
import { GeoBuilder } from './geo.ts';
import { avenueX, blockRect, districtBounds, DISTRICTS, SIDEWALK, streetZ, type DistrictDef, type Rect } from './layout.ts';
import { buildNavGrid, type NavGrid } from './nav.ts';

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
  /** Show/hide detail by distance from the camera's focus point. */
  updateLod: (focus: THREE.Vector3, radius: number) => void;
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

const STYLE_BY_ZONE: Record<string, FacadeStyle[]> = {
  tall: ['glass', 'limestone', 'modern', 'glass', 'limestone'],
  midrise: ['brick', 'limestone', 'brick', 'modern'],
  brownstone: ['brownstone', 'brick', 'brownstone'],
  waterfront: ['brick', 'modern', 'glass'],
};

/** Landmarks that occupy their whole block (no generated buildings there). */
const FULL_BLOCK_LANDMARKS = new Set(['empireState', 'atlanticArena']);

const HEIGHT_BY_ZONE: Record<string, [number, number]> = {
  tall: [34, 150],
  midrise: [14, 42],
  brownstone: [10, 17],
  waterfront: [9, 36],
};

// ---------------------------------------------------------------------

export function buildCity(area: AreaId, opts: { trees: boolean }): BuiltCity {
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
  const asphalt = track(new THREE.MeshLambertMaterial({ color: '#3b3d42' }));
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(bounds.maxX - bounds.minX + 800, bounds.maxZ - bounds.minZ + 800)), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);
  walkSurfaces.push(ground);

  const waterMat = track(new THREE.MeshPhongMaterial({ color: '#2f6e8f', shininess: 90, specular: new THREE.Color('#9fd3ff') }));
  const water = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), waterMat);
  water.rotation.x = -Math.PI / 2;
  if (d.water.side === 'west') {
    const edge = avenueX(d, 0) - d.avenueW / 2 - 6;
    water.scale.set(900, bounds.maxZ - bounds.minZ + 900, 1);
    water.position.set(edge - 450, 0.05, (bounds.minZ + bounds.maxZ) / 2);
  } else {
    const edge = streetZ(d, 0) - d.streetW / 2 - 6;
    water.scale.set(bounds.maxX - bounds.minX + 900, 900, 1);
    water.position.set((bounds.minX + bounds.maxX) / 2, 0.05, edge - 450);
  }
  group.add(water);

  // --------------------------------------------------------- road markings
  const marks = new GeoBuilder();
  for (let i = 0; i <= d.cols; i++) {
    for (let j = 0; j <= d.rows; j++) {
      const ax = avenueX(d, i);
      const sz = streetZ(d, j);
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
  // Lane dashes down each avenue.
  for (let i = 0; i <= d.cols; i++) {
    const ax = avenueX(d, i);
    for (let z = streetZ(d, 0); z < streetZ(d, d.rows); z += 9) for (const off of [-3.4, 3.4]) marks.flat(ax + off - 0.15, ax + off + 0.15, z, z + 4, 0.04);
  }
  const markMesh = new THREE.Mesh(track(marks.build()), track(new THREE.MeshLambertMaterial({ color: '#e8e6df' })));
  markMesh.receiveShadow = true;
  group.add(markMesh);

  // --------------------------------------------------------- blocks
  const sidewalkGeo = new GeoBuilder();
  const grassGeo = new GeoBuilder();
  const plazaGeo = new GeoBuilder();
  const dirtGeo = new GeoBuilder();
  const roofGeo = new Map<number, GeoBuilder>();
  const wallGeo = new Map<string, GeoBuilder>(); // key `${chunk}|${style}`
  const trees: THREE.Vector3[] = [];
  const lamps: THREE.Vector3[] = [];
  const waterTowers: THREE.Vector3[] = [];
  const fencePosts: { p: THREE.Vector3; rotY: number }[] = [];
  const benches: { p: THREE.Vector3; rotY: number }[] = [];

  const places = placesIn(area);
  const doorSpots = places.map((p) => ({ p, door: doorOf(p) }));

  const wallsFor = (chunk: number, style: FacadeStyle) => {
    const key = `${chunk}|${style}`;
    let g = wallGeo.get(key);
    if (!g) wallGeo.set(key, (g = new GeoBuilder()));
    return g;
  };
  const roofFor = (chunk: number) => {
    let g = roofGeo.get(chunk);
    if (!g) roofGeo.set(chunk, (g = new GeoBuilder()));
    return g;
  };

  const hubRect = blockRect(d, d.hub.c, d.hub.r);

  for (let c = 0; c < d.cols; c++) {
    for (let r = 0; r < d.rows; r++) {
      const b = blockRect(d, c, r);
      const kind = d.kind(c, r);
      const zone = d.zone(c, r);
      const inner: Rect = { minX: b.minX + SIDEWALK, maxX: b.maxX - SIDEWALK, minZ: b.minZ + SIDEWALK, maxZ: b.maxZ - SIDEWALK };

      // Kerb + sidewalk slab under every block.
      sidewalkGeo.box(b.minX, b.maxX, 0, 0.18, b.minZ, b.maxZ);
      // Street lamps at the four corners.
      lamps.push(new THREE.Vector3(b.minX + 1, 0.18, b.minZ + 1), new THREE.Vector3(b.maxX - 1, 0.18, b.maxZ - 1), new THREE.Vector3(b.maxX - 1, 0.18, b.minZ + 1), new THREE.Vector3(b.minX + 1, 0.18, b.maxZ - 1));

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

      // ---- ordinary buildings: two rows of lots (north half, south half)
      const midZ = (inner.minZ + inner.maxZ) / 2;
      for (const [z0, z1] of [[inner.minZ, midZ], [midZ, inner.maxZ]] as const) {
        let x = inner.minX;
        while (x < inner.maxX - 4) {
          const width = Math.min(inner.maxX - x, zone === 'brownstone' ? rng.range(7, 10) : rng.range(12, 26));
          const x1 = x + width;
          const style = rng.pick(STYLE_BY_ZONE[zone]);
          let [hMin, hMax] = HEIGHT_BY_ZONE[zone];
          // Buildings next to the hub are taller: that's where the giant screens go.
          const nearHub = Math.abs((x + x1) / 2 - (hubRect.minX + hubRect.maxX) / 2) < d.blockW * 1.6 && Math.abs((z0 + z1) / 2 - (hubRect.minZ + hubRect.maxZ) / 2) < d.blockD * 2.2;
          if (nearHub) {
            hMin = Math.max(hMin, 62);
            hMax = Math.max(hMax, 110);
          }
          const h = Math.round(rng.range(hMin, hMax) * (rng.chance(0.08) ? 1.5 : 1));
          const chunk = chunkFor((x + x1) / 2, (z0 + z1) / 2);
          const inset = 0.3;
          const bx0 = x + inset;
          const bx1 = x1 - inset;
          const bz0 = z0 + inset;
          const bz1 = z1 - inset;
          const tile = facadeTextures(style).tile;
          // Ground floor in a darker "shopfront" band, then the tower.
          wallsFor(chunk, style).walls(bx0, bx1, bz0, bz1, 0, h, tile, rng.range(0, 3));
          roofFor(chunk).flat(bx0, bx1, bz0, bz1, h);
          // Tall towers get a setback (a narrower top), like real Midtown.
          if (h > 70 && rng.chance(0.6)) {
            const s = Math.min(bx1 - bx0, bz1 - bz0) * 0.18;
            const h2 = h + rng.range(12, 40);
            wallsFor(chunk, style).walls(bx0 + s, bx1 - s, bz0 + s, bz1 - s, h, h2, tile, rng.range(0, 3));
            roofFor(chunk).flat(bx0 + s, bx1 - s, bz0 + s, bz1 - s, h2);
          }
          // Classic wooden water tanks on mid-rise roofs.
          if ((style === 'brick' || style === 'brownstone' || style === 'limestone') && h < 60 && rng.chance(0.35)) {
            waterTowers.push(new THREE.Vector3(rng.range(bx0 + 2, bx1 - 2), h, rng.range(bz0 + 2, bz1 - 2)));
          }
          // Rooftop billboard on some mid-rises facing the avenue.
          if (zone !== 'brownstone' && h < 45 && h > 14 && rng.chance(0.12)) {
            const facingEast = rng.chance(0.5);
            const w = Math.min(14, (bz1 - bz0) * 0.9);
            addAdSlot(adSlots, group, area, 'L', 'avenue', w, w * 0.42, new THREE.Vector3(facingEast ? bx1 - 1 : bx0 + 1, h + 1.2 + (w * 0.42) / 2, (bz0 + bz1) / 2), new THREE.Vector3(facingEast ? 1 : -1, 0, 0), chunk, track, true);
          }
          // Street trees on brownstone blocks.
          if (zone === 'brownstone' && opts.trees && rng.chance(0.5)) {
            const tz = z0 === inner.minZ ? b.minZ + 1.6 : b.maxZ - 1.6;
            trees.push(new THREE.Vector3((x + x1) / 2, 0.18, tz));
          }
          x = x1;
        }
      }
    }
  }

  // --------------------------------------------------------- hub (Times Square / Atlantic Plaza)
  const solids: Rect[] = [];
  addHub(d, group, adSlots, track, chunkFor, rng, solids);

  // --------------------------------------------------------- merge static meshes
  const concrete = track(new THREE.MeshLambertMaterial({ color: '#a7a39b' }));
  const sidewalkMesh = new THREE.Mesh(track(sidewalkGeo.build()), concrete);
  sidewalkMesh.receiveShadow = true;
  sidewalkMesh.name = 'sidewalks';
  group.add(sidewalkMesh);
  walkSurfaces.push(sidewalkMesh);

  if (!grassGeo.empty) {
    const grass = new THREE.Mesh(track(grassGeo.build()), track(new THREE.MeshLambertMaterial({ color: '#5f9e4f' })));
    grass.receiveShadow = true;
    group.add(grass);
    walkSurfaces.push(grass);
  }
  if (!plazaGeo.empty) {
    const plaza = new THREE.Mesh(track(plazaGeo.build()), track(new THREE.MeshLambertMaterial({ color: '#c9b8a3' })));
    plaza.receiveShadow = true;
    group.add(plaza);
    walkSurfaces.push(plaza);
  }
  if (!dirtGeo.empty) group.add(new THREE.Mesh(track(dirtGeo.build()), track(new THREE.MeshLambertMaterial({ color: '#8a6f4e' }))));

  const roofMat = track(new THREE.MeshLambertMaterial({ color: '#55575c' }));
  for (const [chunk, g] of roofGeo) {
    const m = new THREE.Mesh(track(g.build()), roofMat);
    m.receiveShadow = true;
    m.userData.chunk = chunk;
    group.add(m);
  }
  for (const [key, g] of wallGeo) {
    const style = key.split('|')[1] as FacadeStyle;
    const m = new THREE.Mesh(track(g.build()), facadeMaterial(style));
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = `walls-${key}`;
    group.add(m);
  }

  // --------------------------------------------------------- instanced props
  const dummy = new THREE.Object3D();
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { p: THREE.Vector3; rotY?: number; s?: number }[], shadow = false) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(track(geo), mat, items.length);
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

  if (opts.trees) {
    const leaves = track(new THREE.MeshLambertMaterial({ color: '#3f7d3a' }));
    const trunk = track(new THREE.MeshLambertMaterial({ color: '#5b4331' }));
    const items = trees.map((p) => ({ p, s: rng.range(0.8, 1.3) }));
    instanced(new THREE.IcosahedronGeometry(2.4, 0).translate(0, 5.2, 0), leaves, items, true);
    instanced(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 5).translate(0, 1.7, 0), trunk, items);
  }

  const lampMat = track(new THREE.MeshLambertMaterial({ color: '#2f3b33' }));
  instanced(new THREE.CylinderGeometry(0.09, 0.12, 6, 5).translate(0, 3, 0), lampMat, lamps.map((p) => ({ p })));
  const lampHeads = track(new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
  lampHeads.userData.nightLamp = true;
  instanced(new THREE.SphereGeometry(0.32, 6, 4).translate(0, 6.1, 0), lampHeads, lamps.map((p) => ({ p })));

  const tankMat = track(new THREE.MeshLambertMaterial({ color: '#6e5136' }));
  instanced(new THREE.CylinderGeometry(1.5, 1.5, 3.2, 10).translate(0, 4.6, 0), tankMat, waterTowers.map((p) => ({ p })), true);
  instanced(new THREE.ConeGeometry(1.7, 1.2, 10).translate(0, 6.8, 0), tankMat, waterTowers.map((p) => ({ p })));
  instanced(new THREE.CylinderGeometry(0.08, 0.08, 3, 4).translate(1.1, 1.5, 1.1), lampMat, waterTowers.map((p) => ({ p })));
  instanced(new THREE.CylinderGeometry(0.08, 0.08, 3, 4).translate(-1.1, 1.5, -1.1), lampMat, waterTowers.map((p) => ({ p })));

  const fenceMat = track(new THREE.MeshLambertMaterial({ color: '#7d8a8f' }));
  instanced(new THREE.BoxGeometry(0.12, 2.2, 3).translate(0, 1.1, 0), fenceMat, fencePosts.map((f) => ({ p: f.p, rotY: f.rotY + Math.PI / 2 })));
  const benchMat = track(new THREE.MeshLambertMaterial({ color: '#4e6b3c' }));
  instanced(new THREE.BoxGeometry(2.2, 0.5, 0.7).translate(0, 0.45, 0), benchMat, benches);

  // --------------------------------------------------------- landmarks
  for (const p of places) addLandmark(p, d, group, track);

  // --------------------------------------------------------- storefronts & doors
  const awningMat = new Map<string, THREE.MeshLambertMaterial>();
  const markerMat = track(new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.85, depthWrite: false }));
  const hitMat = track(new THREE.MeshBasicMaterial({ visible: false }));
  for (const { p, door } of doorSpots) {
    const chunk = chunkFor(door.x, door.z);
    const detail = chunks[chunk].detail;
    const facing = Math.atan2(door.faceX, door.faceZ);
    // Storefront sign above the door (not for parks/plazas/landmarks).
    if (p.interior !== 'none' || p.type === 'station') {
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
    const hit = new THREE.Mesh(track(new THREE.CylinderGeometry(3, 3, 5, 8)), hitMat);
    hit.position.set(door.x, 2.5, door.z);
    hit.userData.placeId = p.id;
    group.add(hit);
    doors.push({ placeId: p.id, position: new THREE.Vector3(door.x, 0, door.z), hit });
  }

  // --------------------------------------------------------- avenue-level posters & bus shelters
  addStreetAds(d, group, adSlots, track, chunkFor, rng);

  const nav = buildNavGrid(d, solids);

  const updateLod = (focus: THREE.Vector3, radius: number) => {
    const r2 = radius * radius;
    for (const ch of chunks) {
      const dx = ch.center.x - focus.x;
      const dz = ch.center.y - focus.z;
      ch.detail.visible = dx * dx + dz * dz < r2;
    }
  };

  return {
    area,
    group,
    nav,
    adSlots,
    doors,
    walkSurfaces,
    updateLod,
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
  parent.add(mesh);
  if (withFrame) {
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.3)), track(new THREE.MeshLambertMaterial({ color: '#222' })));
    frame.position.copy(center).addScaledVector(normal, -0.05);
    frame.lookAt(frame.position.clone().add(normal));
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
  slots.push({ id, area, size, width: w, height: h, mesh, center: center.clone(), normal: normal.clone(), tier, chunk });
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
  const tower = new THREE.Mesh(track(new THREE.BoxGeometry(16, 70, 12)), facadeMaterial('limestone'));
  tower.position.set(cx, 35, towerZ);
  tower.castShadow = true;
  group.add(tower);
  solids.push({ minX: cx - 8, maxX: cx + 8, minZ: towerZ - 6, maxZ: towerZ + 6 });
  addAdSlot(slots, group, d.id, 'XL', 'hub', 15, 22, new THREE.Vector3(cx, 30, towerZ - 6.2), new THREE.Vector3(0, 0, -1), chunkFor(cx, towerZ), track);
  addAdSlot(slots, group, d.id, 'L', 'hub', 15, 9, new THREE.Vector3(cx, 52, towerZ - 6.2), new THREE.Vector3(0, 0, -1), chunkFor(cx, towerZ), track);

  if (d.id === 'manhattan') {
    // The red glass steps (simplified): a stair of glowing red slabs.
    const stepMat = track(new THREE.MeshBasicMaterial({ color: '#d7263d', toneMapped: false }));
    for (let i = 0; i < 9; i++) {
      const step = new THREE.Mesh(track(new THREE.BoxGeometry(16, 0.45, 1.6)), stepMat);
      step.position.set(cx, 0.4 + i * 0.45, cz - 4 + i * 1.6);
      group.add(step);
    }
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
function addStreetAds(d: DistrictDef, group: THREE.Group, slots: AdSlot[], track: Track, chunkFor: (x: number, z: number) => number, rng: Rng): void {
  const shelterMat = track(new THREE.MeshLambertMaterial({ color: '#2b3036' }));
  const glassMat = track(new THREE.MeshLambertMaterial({ color: '#a9c7d6', transparent: true, opacity: 0.35 }));
  for (let i = 0; i <= d.cols; i += 2) {
    for (let j = 1; j < d.rows; j += 2) {
      if (!rng.chance(0.55)) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      const x = avenueX(d, i) + side * (d.avenueW / 2 + 1.2);
      const z = streetZ(d, j) + d.streetW / 2 + 9;
      if (d.kind(Math.min(d.cols - 1, Math.max(0, i - (side < 0 ? 1 : 0))), j) === 'vacant') continue;
      // Shelter roof and back panel.
      const roof = new THREE.Mesh(track(new THREE.BoxGeometry(1.8, 0.12, 4.4)), shelterMat);
      roof.position.set(x, 2.6, z);
      group.add(roof);
      const back = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 2.4, 4.2)), glassMat);
      back.position.set(x + side * 0.85, 1.4, z);
      group.add(back);
      // The poster faces the street so drivers and walkers see it.
      addAdSlot(slots, group, d.id, 'S', 'street', 1.5, 2.1, new THREE.Vector3(x + side * 0.82, 1.4, z + 2.6), new THREE.Vector3(-side, 0, 0), chunkFor(x, z), track);
    }
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

/** Hand-modelled (but very light) landmarks. */
function addLandmark(p: PlaceDef, d: DistrictDef, group: THREE.Group, track: Track): void {
  const b = blockRect(d, p.block[0], p.block[1]);
  const inner = { minX: b.minX + SIDEWALK, maxX: b.maxX - SIDEWALK, minZ: b.minZ + SIDEWALK, maxZ: b.maxZ - SIDEWALK };
  const cx = (inner.minX + inner.maxX) / 2;
  const cz = (inner.minZ + inner.maxZ) / 2;

  if (p.id === 'empireState') {
    // Stepped Art Deco tower with a spire, sitting on its own block.
    const mat = facadeMaterial('limestone');
    const tiers: [number, number, number, number][] = [
      // width, depth, y0, y1
      [inner.maxX - inner.minX - 2, inner.maxZ - inner.minZ - 2, 0, 24],
      [42, 26, 24, 150],
      [30, 20, 150, 200],
      [18, 14, 200, 222],
      [9, 8, 222, 236],
    ];
    const geo = new GeoBuilder();
    const tile = facadeTextures('limestone').tile;
    for (const [w, dd, y0, y1] of tiers) geo.walls(cx - w / 2, cx + w / 2, cz - dd / 2, cz + dd / 2, y0, y1, tile);
    const tower = new THREE.Mesh(track(geo.build()), mat);
    tower.castShadow = true;
    group.add(tower);
    const roofs = new GeoBuilder();
    for (const [w, dd, , y1] of tiers) roofs.flat(cx - w / 2, cx + w / 2, cz - dd / 2, cz + dd / 2, y1);
    group.add(new THREE.Mesh(track(roofs.build()), track(new THREE.MeshLambertMaterial({ color: '#8f8a7e' }))));
    const spire = new THREE.Mesh(track(new THREE.CylinderGeometry(0.4, 2.2, 40, 8)), track(new THREE.MeshLambertMaterial({ color: '#c9c3b5' })));
    spire.position.set(cx, 256, cz);
    group.add(spire);
    // The famous coloured lights at the top.
    const crown = new THREE.Mesh(track(new THREE.CylinderGeometry(4.6, 4.6, 12, 8, 1, true)), track(new THREE.MeshBasicMaterial({ color: '#ffcf56', toneMapped: false, side: THREE.DoubleSide })));
    crown.position.set(cx, 230, cz);
    crown.userData.landmarkLight = true;
    group.add(crown);
  }

  if (p.id === 'brooklynBridge') {
    // Two stone towers with twin gothic arches, a deck over the river and cable fans.
    const stone = track(new THREE.MeshLambertMaterial({ color: '#b29f86' }));
    const deckMat = track(new THREE.MeshLambertMaterial({ color: '#6d6a65' }));
    const cable = track(new THREE.LineBasicMaterial({ color: '#d8d2c4' }));
    const x = (b.minX + b.maxX) / 2;
    const shore = streetZ(d, 0) - d.streetW / 2;
    const span = 420;
    const deck = new THREE.Mesh(track(new THREE.BoxGeometry(14, 1.2, span)), deckMat);
    deck.position.set(x, 12, shore - span / 2 + 20);
    group.add(deck);
    const ramp = new THREE.Mesh(track(new THREE.BoxGeometry(14, 1.2, 60)), deckMat);
    ramp.position.set(x, 6, shore + 18);
    ramp.rotation.x = Math.atan2(12, 60);
    group.add(ramp);
    const towerZs = [shore - 60, shore - 330];
    for (const tz of towerZs) {
      const geo = new GeoBuilder();
      geo.box(x - 11, x - 3.5, 0, 82, tz - 5, tz + 5);
      geo.box(x + 3.5, x + 11, 0, 82, tz - 5, tz + 5);
      geo.box(x - 11, x + 11, 50, 82, tz - 5, tz + 5);
      geo.box(x - 11, x + 11, 0, 8, tz - 5, tz + 5);
      const t = new THREE.Mesh(track(geo.build()), stone);
      t.castShadow = true;
      group.add(t);
    }
    // Main cables as gentle curves between the towers, plus suspenders.
    const pts: THREE.Vector3[] = [];
    for (const side of [-6.5, 6.5]) {
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const z = towerZs[0] + (towerZs[1] - towerZs[0]) * t;
        const y = 80 - 64 * 4 * t * (1 - t);
        pts.push(new THREE.Vector3(x + side, y, z));
        if (i > 0) pts.push(new THREE.Vector3(x + side, y, z));
        if (i % 2 === 0) pts.push(new THREE.Vector3(x + side, y, z), new THREE.Vector3(x + side, 12.6, z));
      }
    }
    const lineGeo = track(new THREE.BufferGeometry().setFromPoints(pts));
    group.add(new THREE.LineSegments(lineGeo, cable));
  }

  if (p.id === 'atlanticArena') {
    // A low rust-coloured arena with a sweeping canopy and a big screen.
    const rust = track(new THREE.MeshLambertMaterial({ color: '#7a4a2e' }));
    const body = new THREE.Mesh(track(new THREE.CylinderGeometry((inner.maxX - inner.minX) / 2, (inner.maxX - inner.minX) / 2 + 2, 26, 24)), rust);
    body.scale.z = (inner.maxZ - inner.minZ) / (inner.maxX - inner.minX);
    body.position.set(cx, 13, cz);
    body.castShadow = true;
    group.add(body);
    const canopy = new THREE.Mesh(track(new THREE.CylinderGeometry(16, 16, 1.5, 20, 1, false, 0, Math.PI)), rust);
    canopy.position.set(inner.minX - 2, 12, cz);
    canopy.rotation.y = Math.PI / 2;
    group.add(canopy);
  }
}
