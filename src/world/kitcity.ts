// =====================================================================
// kitcity.ts — fills city blocks with cartoon buildings from the kit.
//
// For each block we line up buildings along the street, choosing models
// by neighbourhood ("zone"): towers in Midtown, colourful mid-rises
// elsewhere, brick-and-brownstone tones in Brooklyn. Each building gets
// a wall colour from the zone's palette, so the same model looks
// different down the street.
//
// Nothing is drawn here: we only collect "placements". KitInstancer then
// draws every copy of a model with ONE InstancedMesh.
//
// HOW TO TUNE THE LOOK
//   • Add/remove models in ZONE_MODELS (names from kit-buildings.glb).
//   • Change the colours in PALETTES.
//   • SCALE is metres per kit unit (14 ≈ a 4–5 storey building).
// =====================================================================

import * as THREE from 'three';
import type { Rng } from '../core/rng.ts';
import { kitMaterial, type KitModel } from '../assets/kit.ts';
import type { Rect } from './layout.ts';

export interface Placement {
  model: string;
  x: number;
  z: number;
  rotY: number;
  scale: THREE.Vector3;
  color: THREE.Color;
  /** Height of the roof in metres (for water towers and billboards). */
  roof: number;
  /** Footprint on the ground. */
  rect: Rect;
}

/** Metres per kit unit for ordinary buildings. */
const SCALE = 14;

const ZONE_MODELS: Record<string, string[]> = {
  tall: ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e', 'building-m', 'building-l', 'building-n'],
  midrise: ['building-a', 'building-b', 'building-d', 'building-f', 'building-g', 'building-h', 'building-i', 'building-k', 'building-c', 'building-e'],
  brownstone: ['building-a', 'building-b', 'building-c', 'building-d', 'building-h', 'building-e'],
  waterfront: ['building-j', 'building-k', 'building-i', 'building-e', 'building-c'],
};

/** Wall colours per zone: bright and cheerful, Township-style. */
export const PALETTES: Record<string, string[]> = {
  tall: ['#ffffff', '#dcecff', '#fff1cc', '#ffd9e6', '#d6fbe8', '#e8dcff', '#cde7ff'],
  midrise: ['#ff9eb8', '#ffcf8a', '#fff08a', '#a6eebf', '#94d4ff', '#cdb6ff', '#ffb894', '#ffffff', '#ff8a80', '#8ee6e0'],
  brownstone: ['#c98b5f', '#b5694a', '#d99a5c', '#e07a5f', '#a8714f', '#f2c48d', '#d46a6a'],
  waterfront: ['#94d4ff', '#a6eebf', '#fff08a', '#ffffff', '#ffb894'],
};

/**
 * Lay out buildings inside one block. Tall zones get one row of towers
 * that fill the block's depth; other zones get two rows back to back,
 * the north row facing north and the south row facing south.
 */
export function planBlock(models: Map<string, KitModel>, inner: Rect, zone: string, rng: Rng, nearHub: boolean): Placement[] {
  const out: Placement[] = [];
  const tall = zone === 'tall' || nearHub;
  const list = (ZONE_MODELS[tall ? 'tall' : zone] ?? ZONE_MODELS.midrise).filter((n) => models.has(n));
  if (!list.length) return out;
  const palette = PALETTES[tall ? 'tall' : zone] ?? PALETTES.midrise;
  const depth = inner.maxZ - inner.minZ;

  const rows: { z0: number; z1: number; facing: 1 | -1 }[] = tall
    ? [{ z0: inner.minZ, z1: inner.maxZ, facing: 1 }]
    : [
        { z0: inner.minZ, z1: inner.minZ + depth / 2, facing: -1 },
        { z0: inner.minZ + depth / 2, z1: inner.maxZ, facing: 1 },
      ];

  for (const row of rows) {
    const rowDepth = row.z1 - row.z0 - 0.6;
    let x = inner.minX + 0.3;
    let guard = 0;
    while (x < inner.maxX - 4 && guard++ < 40) {
      const name = rng.pick(list);
      const m = models.get(name)!;
      // Fit the model's depth to the row; towers may be a bit larger.
      const s = Math.min(tall ? 30 : SCALE * 1.15, rowDepth / m.size.z);
      let w = m.size.x * s;
      const room = inner.maxX - 0.3 - x;
      let sx = s;
      if (w > room) {
        if (room < 5) break;
        sx = s * (room / w); // squeeze the last building to fit the block end
        w = room;
      }
      // Towers grow taller in Midtown; near the hub they're tallest of all.
      const sy = tall ? s * rng.range(nearHub ? 1.3 : 1.0, nearHub ? 1.9 : 1.6) : s * rng.range(0.95, 1.25);
      const cx = x + w / 2;
      const cz = (row.z0 + row.z1) / 2;
      // Sit the model so its footprint is centred on the lot.
      const centreX = -(m.min.x + m.size.x / 2) * sx;
      const centreZ = -(m.min.z + m.size.z / 2) * s * row.facing;
      out.push({
        model: name,
        x: cx + centreX * (row.facing === 1 ? 1 : -1),
        z: cz + centreZ,
        rotY: row.facing === 1 ? 0 : Math.PI,
        scale: new THREE.Vector3(sx, sy, s),
        color: new THREE.Color(rng.pick(palette)),
        roof: m.size.y * sy,
        rect: { minX: x, maxX: x + w, minZ: cz - (m.size.z * s) / 2, maxZ: cz + (m.size.z * s) / 2 },
      });
      x += w + rng.range(0.2, 1.2);
    }
  }
  return out;
}

/**
 * Far-away stand-in for each detailed model: a simple box-like building
 * from the kit with the same colour, stretched to the same size. Shown
 * for blocks away from the camera, so the whole skyline costs very few
 * triangles on cheap phones.
 */
const FAR_MODEL: Record<string, string> = {
  'building-a': 'low-detail-building-a', 'building-b': 'low-detail-building-b', 'building-c': 'low-detail-building-c',
  'building-d': 'low-detail-building-d', 'building-e': 'low-detail-building-wide-a', 'building-f': 'low-detail-building-f',
  'building-g': 'low-detail-building-g', 'building-h': 'low-detail-building-h', 'building-i': 'low-detail-building-i',
  'building-j': 'low-detail-building-wide-b', 'building-k': 'low-detail-building-wide-a', 'building-l': 'low-detail-building-l',
  'building-m': 'low-detail-building-m', 'building-n': 'low-detail-building-wide-b',
  'building-skyscraper-a': 'low-detail-building-a', 'building-skyscraper-b': 'low-detail-building-b', 'building-skyscraper-c': 'low-detail-building-c',
  'building-skyscraper-d': 'low-detail-building-m', 'building-skyscraper-e': 'low-detail-building-g',
};

/**
 * All kit buildings of an area, with two levels of detail:
 *   • NEAR: full models, grouped by chunk (shown around the camera).
 *   • FAR: simple stand-ins in one instanced mesh per stand-in model.
 * update() swaps which chunks are near; far meshes are rebuilt only when
 * that set changes (not every frame).
 */
export class KitBuildings {
  readonly group = new THREE.Group();
  /** Everything a tap can hit (for "walk to the sidewalk in front"). */
  readonly pickables: THREE.Object3D[] = [];
  private chunks = new Map<string, { group: THREE.Group; items: Placement[]; cx: number; cz: number }>();
  private far = new Map<string, THREE.InstancedMesh>();
  private nearKey = '';
  private dummy = new THREE.Object3D();
  private disposables: { dispose(): void }[] = [];

  constructor(
    private models: Map<string, KitModel>,
    placements: Placement[],
    chunkSize: number,
    shadows: boolean,
  ) {
    // NEAR: per chunk, one InstancedMesh per model.
    for (const p of placements) {
      const key = `${Math.floor(p.x / chunkSize)},${Math.floor(p.z / chunkSize)}`;
      let c = this.chunks.get(key);
      if (!c) {
        c = { group: new THREE.Group(), items: [], cx: (Math.floor(p.x / chunkSize) + 0.5) * chunkSize, cz: (Math.floor(p.z / chunkSize) + 0.5) * chunkSize };
        c.group.visible = false;
        this.chunks.set(key, c);
        this.group.add(c.group);
      }
      c.items.push(p);
    }
    for (const c of this.chunks.values()) {
      for (const mesh of this.instance(c.items, (p) => p.model, shadows)) {
        c.group.add(mesh);
        this.pickables.push(mesh);
      }
    }
    // FAR: one mesh per stand-in model, sized for every placement.
    const farCounts = new Map<string, number>();
    for (const p of placements) {
      const f = this.farOf(p.model);
      if (f) farCounts.set(f, (farCounts.get(f) ?? 0) + 1);
    }
    for (const [name, n] of farCounts) {
      const m = models.get(name)!;
      const mesh = new THREE.InstancedMesh(m.geometry, kitMaterial(m.map, { tintWalls: true, nightWindows: true }), n);
      mesh.receiveShadow = true;
      mesh.name = `kit-far-${name}`;
      this.far.set(name, mesh);
      this.group.add(mesh);
      this.pickables.push(mesh);
      this.disposables.push(mesh);
    }
  }

  private farOf(model: string): string | null {
    const f = FAR_MODEL[model];
    return f && this.models.has(f) ? f : null;
  }

  /** Build instanced meshes for a list of placements, grouped by `pick(p)`. */
  private instance(items: Placement[], pick: (p: Placement) => string, shadows: boolean): THREE.InstancedMesh[] {
    const by = new Map<string, Placement[]>();
    for (const p of items) {
      const k = pick(p);
      let l = by.get(k);
      if (!l) by.set(k, (l = []));
      l.push(p);
    }
    const out: THREE.InstancedMesh[] = [];
    for (const [name, list] of by) {
      const m = this.models.get(name)!;
      const mesh = new THREE.InstancedMesh(m.geometry, kitMaterial(m.map, { tintWalls: true, nightWindows: true }), list.length);
      list.forEach((p, i) => {
        this.dummy.position.set(p.x, 0.18, p.z);
        this.dummy.rotation.set(0, p.rotY, 0);
        this.dummy.scale.copy(p.scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        mesh.setColorAt(i, p.color);
      });
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.name = `kit-${name}`;
      this.disposables.push(mesh);
      out.push(mesh);
    }
    return out;
  }

  /** Show full detail for chunks within `radius` of `focus`; stand-ins elsewhere. */
  update(focus: THREE.Vector3, radius: number): void {
    const r2 = radius * radius;
    const near: string[] = [];
    for (const [key, c] of this.chunks) {
      const isNear = (c.cx - focus.x) ** 2 + (c.cz - focus.z) ** 2 < r2;
      c.group.visible = isNear;
      if (isNear) near.push(key);
    }
    const nearKey = near.sort().join('|');
    if (nearKey === this.nearKey) return;
    this.nearKey = nearKey;
    // Rebuild the far stand-ins for every chunk that isn't near.
    const counts = new Map<string, number>();
    for (const [key, c] of this.chunks) {
      if (c.group.visible) continue;
      for (const p of c.items) {
        const f = this.farOf(p.model);
        if (!f) continue;
        const mesh = this.far.get(f)!;
        const i = counts.get(f) ?? 0;
        counts.set(f, i + 1);
        const src = this.models.get(p.model)!;
        const dst = this.models.get(f)!;
        // Stretch the stand-in to the real building's footprint and height.
        this.dummy.position.set((p.rect.minX + p.rect.maxX) / 2, 0.18, (p.rect.minZ + p.rect.maxZ) / 2);
        this.dummy.rotation.set(0, p.rotY, 0);
        this.dummy.scale.set((src.size.x * p.scale.x) / dst.size.x, (src.size.y * p.scale.y) / dst.size.y, (src.size.z * p.scale.z) / dst.size.z);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        mesh.setColorAt(i, p.color);
      }
      void key;
    }
    for (const [name, mesh] of this.far) {
      mesh.count = counts.get(name) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
