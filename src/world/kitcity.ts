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
//   • planBlock decides how many buildings per block (2–3 per row).
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
    // Summarised blocks: only a few big buildings per row (2 towers, or
    // 2–3 mid-rises) instead of a long row of small ones. Reads better
    // from the top-down camera and is much cheaper to draw.
    const n = tall ? 2 : rng.chance(0.5) ? 2 : 3;
    const gap = 1.2;
    const lotW = (inner.maxX - inner.minX - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      // Prefer models whose footprint shape suits the lot.
      const want = lotW / rowDepth;
      const ranked = [...list].sort((p, q) => {
        const mp = models.get(p)!;
        const mq = models.get(q)!;
        return Math.abs(Math.log(mp.size.x / mp.size.z / want)) - Math.abs(Math.log(mq.size.x / mq.size.z / want));
      });
      const name = rng.pick(ranked.slice(0, Math.min(3, ranked.length)));
      const m = models.get(name)!;
      const s = rowDepth / m.size.z;
      // Stretch sideways to fill the lot, within cartoon-friendly limits.
      const sx = THREE.MathUtils.clamp(lotW / m.size.x, s * 0.75, s * 1.6);
      const w = m.size.x * sx;
      const sy = tall ? s * rng.range(nearHub ? 1.2 : 0.9, nearHub ? 1.7 : 1.4) : s * rng.range(0.9, 1.2);
      const cx = inner.minX + gap + i * (lotW + gap) + lotW / 2;
      const cz = (row.z0 + row.z1) / 2;
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
        rect: { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - (m.size.z * s) / 2, maxZ: cz + (m.size.z * s) / 2 },
      });
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
const tmp = new THREE.Vector3();

export class KitBuildings {
  readonly group = new THREE.Group();
  /** Everything a tap can hit (for "walk to the sidewalk in front"). */
  readonly pickables: THREE.Object3D[] = [];
  private chunks = new Map<string, { group: THREE.Group; items: Placement[]; cx: number; cz: number }>();
  private far = new Map<string, THREE.InstancedMesh>();
  private nearKey = '';
  private dummy = new THREE.Object3D();
  private disposables: { dispose(): void }[] = [];
  /** For see-through: where each near placement is drawn, and its fade. */
  private slots: { p: Placement; mesh: THREE.InstancedMesh; index: number; fade: number; target: number; chunkVisible: () => boolean }[] = [];
  private fadeTimer = 0;
  private materials = new Map<THREE.Texture | null, THREE.Material>();

  /** One building material per palette texture (shared by every mesh). */
  private material(map: THREE.Texture | null): THREE.Material {
    let m = this.materials.get(map);
    if (!m) this.materials.set(map, (m = kitMaterial(map, { tintWalls: true, nightWindows: true })));
    return m;
  }

  /** A per-mesh geometry that shares the model's vertices but has its own fade list. */
  private withFade(src: THREE.BufferGeometry, count: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.getAttribute(k));
    g.setIndex(src.getIndex());
    g.boundingBox = src.boundingBox;
    g.boundingSphere = src.boundingSphere;
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    fade.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('instanceFade', fade);
    return g;
  }

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
      const mesh = new THREE.InstancedMesh(this.withFade(m.geometry, n), this.material(m.map), n);
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
      const mesh = new THREE.InstancedMesh(this.withFade(m.geometry, list.length), this.material(m.map), list.length);
      list.forEach((p, i) => {
        this.slots.push({ p, mesh, index: i, fade: 0, target: 0, chunkVisible: () => mesh.parent?.visible ?? false });
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

  /**
   * See-through: every ~0.15 s, test which nearby buildings block the
   * line from the camera to the player (a cheap box test, no triangle
   * ray casting), then fade those out smoothly and the rest back in.
   */
  updateSeeThrough(camera: THREE.Vector3, player: THREE.Vector3, dt: number): void {
    this.fadeTimer -= dt;
    if (this.fadeTimer <= 0) {
      this.fadeTimer = 0.15;
      const targets = [new THREE.Vector3(player.x, player.y + 0.4, player.z), new THREE.Vector3(player.x, player.y + 1.6, player.z)];
      for (const s of this.slots) {
        s.target = 0;
        if (!s.chunkVisible()) continue;
        const r = s.p.rect;
        const box = new THREE.Box3(new THREE.Vector3(r.minX - 0.5, 0, r.minZ - 0.5), new THREE.Vector3(r.maxX + 0.5, s.p.roof + 1, r.maxZ + 0.5));
        if (box.containsPoint(targets[0])) continue;
        for (const t of targets) {
          const ray = new THREE.Ray(camera.clone(), t.clone().sub(camera).normalize());
          const hit = ray.intersectBox(box, tmp);
          if (hit && hit.distanceTo(camera) < t.distanceTo(camera) - 0.5) {
            s.target = 1;
            break;
          }
        }
      }
    }
    const k = Math.min(1, dt * 6);
    const dirty = new Set<THREE.InstancedMesh>();
    for (const s of this.slots) {
      if (Math.abs(s.fade - s.target) < 0.01) continue;
      s.fade += (s.target - s.fade) * k;
      if (Math.abs(s.fade - s.target) < 0.01) s.fade = s.target;
      (s.mesh.geometry.getAttribute('instanceFade') as THREE.InstancedBufferAttribute).setX(s.index, s.fade);
      dirty.add(s.mesh);
    }
    for (const m of dirty) m.geometry.getAttribute('instanceFade').needsUpdate = true;
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
