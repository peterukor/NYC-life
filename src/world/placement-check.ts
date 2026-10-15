// =====================================================================
// placement-check.ts — keeps props off the roads and ads out of the
// buildings, across the whole map (Peter, 2026-10-15: "some ads are still
// entering the building… that red thing on the road… scan the whole map").
//
// Two questions, answered from the same data the city is built from:
//   • isRoad(x, z): is this point on a roadway? (between the blocks, or on
//     a diagonal corridor such as Broadway)
//   • BuildingIndex.inside(x, y, z): is this point inside a generated
//     building? (its footprint, shrunk by each setback tier, up to its
//     height) or inside a landmark's block?
// city.ts uses them while placing things, then settleAds() moves or drops
// any ad that still pokes into a building, and scanPlacement() reports
// whatever is left, so QA can insist on zero.
// =====================================================================

import * as THREE from 'three';
import { blockRect, colAt, rowAt, type DistrictDef, type Rect } from './layout.ts';
import { onCorridor } from './corridors.ts';
import type { AreaId } from '../sim/types.ts';

/** Is (x, z) on a roadway (not inside any block, or on a corridor's carriageway)? */
export function isRoad(d: DistrictDef, x: number, z: number): boolean {
  const c = colAt(d, x);
  const r = rowAt(d, z);
  if (c < 0 || r < 0 || c >= d.cols || r >= d.rows) return true;
  const b = blockRect(d, c, r);
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
  // The corridor test pads in its sidewalks; -3.5 keeps it to the carriageway.
  return !!onCorridor(d.id as AreaId, x, z, -3.5);
}

/** Like isRoad, but off the street grid (the shore, the parks by the water) only counts the highways. */
export function isRoadStrict(d: DistrictDef, x: number, z: number): boolean {
  const c = colAt(d, x);
  const r = rowAt(d, z);
  if (c < 0 || r < 0 || c >= d.cols || r >= d.rows) return !!onCorridor(d.id as AreaId, x, z, -3.5);
  return isRoad(d, x, z);
}

/** Is the whole rectangle off the roads (sampled every ~2 m)? */
export function rectClear(d: DistrictDef, r: Rect): boolean {
  const nx = Math.max(2, Math.ceil((r.maxX - r.minX) / 2) + 1);
  const nz = Math.max(2, Math.ceil((r.maxZ - r.minZ) / 2) + 1);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = r.minX + ((r.maxX - r.minX) * i) / (nx - 1);
      const z = r.minZ + ((r.maxZ - r.minZ) * j) / (nz - 1);
      if (isRoad(d, x, z)) return false;
    }
  return true;
}

export interface Volume {
  rect: Rect;
  /** Setback tiers from the ground up: inset from the lot edge and the height where the tier ends. */
  tiers: { inset: number; top: number }[];
}

/** A quick lookup of building volumes by 32 m grid cell. */
export class BuildingIndex {
  private cells = new Map<string, Volume[]>();
  private static S = 32;

  add(v: Volume): void {
    const S = BuildingIndex.S;
    for (let cx = Math.floor(v.rect.minX / S); cx <= Math.floor(v.rect.maxX / S); cx++)
      for (let cz = Math.floor(v.rect.minZ / S); cz <= Math.floor(v.rect.maxZ / S); cz++) {
        const k = `${cx},${cz}`;
        const list = this.cells.get(k);
        if (list) list.push(v);
        else this.cells.set(k, [v]);
      }
  }

  /** Is the point inside any building (with `margin` m of skin)? */
  inside(x: number, y: number, z: number, margin = 0): boolean {
    const S = BuildingIndex.S;
    const list = this.cells.get(`${Math.floor(x / S)},${Math.floor(z / S)}`);
    if (!list) return false;
    for (const v of list) {
      for (const t of v.tiers) {
        if (y > t.top) continue;
        const r = v.rect;
        if (x > r.minX + t.inset - margin && x < r.maxX - t.inset + margin && z > r.minZ + t.inset - margin && z < r.maxZ - t.inset + margin) return true;
        break;
      }
    }
    return false;
  }
}

/** Build the index from the generated buildings (city-blocks plans) and landmark blocks. */
export function buildingIndex(plans: { rect: Rect; floorH: number; height: number; tiers: { inset: number; floors: number }[] }[], landmarkRects: Rect[]): BuildingIndex {
  const idx = new BuildingIndex();
  for (const p of plans) {
    let base = 0;
    const tiers = p.tiers.map((t) => {
      base += t.floors * p.floorH;
      return { inset: t.inset, top: base };
    });
    // Crowns and roof boxes above the last tier, a little inside it.
    const last = tiers[tiers.length - 1];
    if (last && p.height > last.top) tiers.push({ inset: last.inset + 1, top: p.height });
    idx.add({ rect: p.rect, tiers });
  }
  // Landmark blocks: treat the whole block as a tall building.
  for (const r of landmarkRects) idx.add({ rect: r, tiers: [{ inset: 2, top: 400 }] });
  return idx;
}

/** Points across an ad's face, nudged `out` metres in front of it (world space). */
function facePoints(mesh: THREE.Mesh, w: number, h: number, out: number): THREE.Vector3[] {
  mesh.updateMatrixWorld(true);
  const n = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
  const pts: THREE.Vector3[] = [];
  for (const fx of [-0.48, 0, 0.48])
    for (const fy of [-0.48, 0, 0.48]) pts.push(new THREE.Vector3(fx * w, fy * h, 0).applyMatrix4(mesh.matrixWorld).addScaledVector(n, out));
  return pts;
}

/** Does the ad's face (or the air just in front of it) sit inside a building? */
export function adBuried(idx: BuildingIndex, mesh: THREE.Mesh, w: number, h: number): boolean {
  return facePoints(mesh, w, h, 0.25).some((p) => idx.inside(p.x, p.y, p.z)) || facePoints(mesh, w, h, -0.02).some((p) => p.y < 0.3);
}

/** Is there a wall right behind the ad all the way across (5 points along its width, within `reach` m)? */
function backedAcross(idx: BuildingIndex, s: SlotLike, reach = 2.5): boolean {
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), s.normal).normalize();
  for (const f of [-0.45, -0.22, 0, 0.22, 0.45]) {
    let wall = false;
    for (let k = 0.25; k <= reach && !wall; k += 0.25) {
      const p = s.mesh.position.clone().addScaledVector(right, f * s.width).addScaledVector(s.normal, -k);
      wall = idx.inside(p.x, p.y, p.z);
    }
    if (!wall) return false;
  }
  return true;
}

interface SlotLike {
  id: string;
  width: number;
  height: number;
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  tier: 'hub' | 'avenue' | 'street';
  parts?: THREE.Object3D[];
}

/**
 * Fix every ad on the map: one poking into a building is moved out along
 * its facing (up to 6 m) if it can be; one still buried is removed. Ads
 * that overlap another ad (same wall, crossing) lose the smaller one.
 * Returns how many were moved and removed.
 */
export function settleAds<T extends SlotLike>(slots: T[], idx: BuildingIndex): { moved: number; removed: number; buried: number; overlap: number; floating: number; snapped: number } {
  let moved = 0;
  let removed = 0;
  let buried = 0;
  let overlap = 0;
  let floating = 0;
  let snapped = 0;
  const drop = (s: T) => {
    s.mesh.removeFromParent();
    for (const p of s.parts ?? []) p.removeFromParent();
    removed++;
  };
  const keep: T[] = [];
  for (const s of slots) {
    // Wall screens (hub) sit flush on their wall: pull a floating one back
    // onto the nearest wall behind it; with no wall within 12 m, drop it.
    if (s.tier === 'hub' && !s.parts?.length) {
      let back = -1;
      for (let k = 0.25; k <= 12; k += 0.25) {
        const p = s.mesh.position.clone().addScaledVector(s.normal, -k);
        if (idx.inside(p.x, p.y, p.z)) {
          back = k;
          break;
        }
      }
      if (back < 0) {
        drop(s);
        floating++;
        continue;
      }
      if (back > 0.6) {
        const by = back - 0.4;
        s.mesh.position.addScaledVector(s.normal, -by);
        s.center.addScaledVector(s.normal, -by);
        snapped++;
      }      // Hanging off the building's edge? Slide it along the wall to fit, or drop it.
      if (!backedAcross(idx, s)) {
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), s.normal).normalize();
        const start = s.mesh.position.clone();
        let fit = false;
        for (let k = 1; k <= 10 && !fit; k++)
          for (const dir of [1, -1]) {
            s.mesh.position.copy(start).addScaledVector(right, dir * k);
            if (backedAcross(idx, s)) {
              fit = true;
              s.center.addScaledVector(right, dir * k);
              break;
            }
          }
        if (!fit) {
          drop(s);
          floating++;
          continue;
        }
        snapped++;
      }
    }
    if (adBuried(idx, s.mesh, s.width, s.height)) {
      const start = s.mesh.position.clone();
      let ok = false;
      for (let step = 0.5; step <= 6 && !ok; step += 0.5) {
        s.mesh.position.copy(start).addScaledVector(s.normal, step);
        for (const p of s.parts ?? []) p.position.addScaledVector(s.normal, 0.5);
        ok = !adBuried(idx, s.mesh, s.width, s.height);
      }
      if (!ok) {
        drop(s);
        buried++;
        continue;
      }
      s.center.addScaledVector(s.normal, s.mesh.position.distanceTo(start));
      moved++;
    }
    keep.push(s);
  }
  // Two ads crossing each other (or sharing a wall and overlapping): keep the bigger.
  const box = (s: T) => new THREE.Box3().setFromObject(s.mesh).expandByScalar(0.05);
  const out: T[] = [];
  const order = [...keep].sort((a, b) => b.width * b.height - a.width * a.height);
  const boxes: THREE.Box3[] = [];
  for (const s of order) {
    const b = box(s);
    if (boxes.some((o) => o.intersectsBox(b))) {
      drop(s);
      overlap++;
      continue;
    }
    boxes.push(b);
    out.push(s);
  }
  slots.length = 0;
  for (const s of keep) if (out.includes(s)) slots.push(s);
  return { moved, removed, buried, overlap, floating, snapped };
}

export interface PlacementIssue {
  kind: 'ad-in-building' | 'ad-overlap' | 'prop-on-road' | 'ad-floating';
  id: string;
  x: number;
  z: number;
}

/** What's still wrong after placement (QA expects an empty list). */
export function scanPlacement(d: DistrictDef, slots: SlotLike[], idx: BuildingIndex, props: { name: string; rect: Rect }[]): PlacementIssue[] {
  const issues: PlacementIssue[] = [];
  for (const s of slots) if (s.mesh.parent && adBuried(idx, s.mesh, s.width, s.height)) issues.push({ kind: 'ad-in-building', id: s.id, x: Math.round(s.center.x), z: Math.round(s.center.z) });
  for (const s of slots) {
    if (!s.mesh.parent || s.tier !== 'hub' || s.parts?.length) continue;
    if (!backedAcross(idx, s)) issues.push({ kind: 'ad-floating', id: s.id, x: Math.round(s.center.x), z: Math.round(s.center.z) });
  }
  const live = slots.filter((s) => s.mesh.parent);
  for (let i = 0; i < live.length; i++) {
    const a = new THREE.Box3().setFromObject(live[i].mesh);
    for (let j = i + 1; j < live.length; j++)
      if (a.intersectsBox(new THREE.Box3().setFromObject(live[j].mesh))) issues.push({ kind: 'ad-overlap', id: `${live[i].id}+${live[j].id}`, x: Math.round(live[i].center.x), z: Math.round(live[i].center.z) });
  }
  for (const p of props) if (!rectClear(d, p.rect)) issues.push({ kind: 'prop-on-road', id: p.name, x: Math.round((p.rect.minX + p.rect.maxX) / 2), z: Math.round((p.rect.minZ + p.rect.maxZ) / 2) });
  return issues;
}
