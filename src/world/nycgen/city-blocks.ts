// =====================================================================
// city-blocks.ts — runs the generator for a whole area and manages
// level of detail, so cheap phones only pay for what's on screen.
//
// HOW IT WORKS
//   1. At load, every block is PLANNED (which buildings go where). This
//      is just numbers: fast, and it never changes (same seed = same
//      city every time).
//   2. A cheap FAR version of the whole area (textured boxes, water
//      towers, one-ball trees) is built once, in a few big meshes.
//   3. Blocks near the camera get a DETAILED mesh (cornices, fire
//      escapes, stoops, awnings, rooftop gardens, parked cars, café
//      tables…). These are built a couple per frame as you move, kept in
//      a small cache, and the far version of that block is switched off.
//   4. Buildings between the camera and your character fade out.
//
// Each block's detailed mesh is ONE draw call; the far city is ~10.
// =====================================================================

import * as THREE from 'three';
import { rectOnCorridor } from '../corridors.ts';

/**
 * Where to build on a block a corridor touches: the biggest part left
 * after stepping its sides back (4 m at a time) from the road, or, when a
 * road cuts through the middle (Broadway), the parts west and east of it.
 * The per-building check below still drops anything left on the road.
 */
function offCorridor(area: Parameters<typeof rectOnCorridor>[0], r: { minX: number; maxX: number; minZ: number; maxZ: number }): { minX: number; maxX: number; minZ: number; maxZ: number }[] {
  if (!rectOnCorridor(area, r, 1.5)) return [r];
  let best = r;
  let bestArea = 0;
  const W = r.maxX - r.minX, D = r.maxZ - r.minZ;
  // Try trimming each side (and pairs of sides) by growing amounts.
  for (let k = 1; k <= 12; k++) {
    const t = k * 4;
    const tries = [
      { ...r, minX: r.minX + t }, { ...r, maxX: r.maxX - t }, { ...r, minZ: r.minZ + t }, { ...r, maxZ: r.maxZ - t },
      { ...r, minX: r.minX + t, minZ: r.minZ + t }, { ...r, maxX: r.maxX - t, minZ: r.minZ + t }, { ...r, minX: r.minX + t, maxZ: r.maxZ - t }, { ...r, maxX: r.maxX - t, maxZ: r.maxZ - t },
    ];
    for (const q of tries) {
      const w = q.maxX - q.minX, d = q.maxZ - q.minZ;
      if (w < 14 || d < 14 || w * d <= bestArea) continue;
      if (!rectOnCorridor(area, q, 1.5)) {
        best = q;
        bestArea = w * d;
      }
    }
  }
  if (bestArea >= W * D * 0.3) return [best];
  // A road through the middle (Broadway): split the block into the part
  // west of the road and the part east of it, and build on both.
  const xs: number[] = [];
  for (let x = r.minX; x <= r.maxX; x += 2) {
    for (let z = r.minZ; z <= r.maxZ; z += 4) if (rectOnCorridor(area, { minX: x, maxX: x, minZ: z, maxZ: z }, 1.5)) { xs.push(x); break; }
  }
  if (!xs.length) return [r];
  const out: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  const west = { ...r, maxX: Math.min(...xs) - 2 };
  const east = { ...r, minX: Math.max(...xs) + 2 };
  for (const q of [west, east]) if (q.maxX - q.minX >= 14) out.push(q);
  return out.length ? out : [r];
}
import { Rng } from '../../core/rng.ts';
import type { BlockKind, DistrictDef, Rect } from '../layout.ts';
import { blockRect, SIDEWALK } from '../layout.ts';
import { BuildingFades, cityMaterial } from './atlas.ts';
import { CityMeshBuilder } from './builder.ts';
import { emitDetailed, emitSimple, planNycBlock, type BuildingPlan } from './buildings.ts';
import { emitBlockProps, tree, treeSimple } from './props.ts';

interface BlockEntry {
  c: number;
  r: number;
  key: string;
  rect: Rect;
  inner: Rect;
  kind: Exclude<BlockKind, 'water'>;
  buildings: BuildingPlan[];
  yard: Rect | null;
  /** Id that switches this block's far stand-in on/off. */
  farId: number;
  near: THREE.Mesh | null;
  parkTrees: { x: number; z: number; y: number }[];
  lastUsed: number;
  seed: string;
}

export interface CityBlocksOptions {
  trees: boolean;
  shadows: boolean;
  /** Blocks to leave empty (landmarks that fill the whole block). */
  skip: (c: number, r: number) => boolean;
  nearHub: (c: number, r: number) => boolean;
  doors: { x: number; z: number }[];
  /** Trees inside parks (positions decided by city.ts). */
  parkTrees?: { x: number; z: number; y: number }[];
  /** How many detailed blocks to keep built (memory cap). */
  cache?: number;
}

export class CityBlocks {
  readonly group = new THREE.Group();
  /** Meshes a tap can hit (to walk to the sidewalk in front of a building). */
  readonly pickables: THREE.Object3D[] = [];
  readonly fades = new BuildingFades();
  readonly material: THREE.MeshLambertMaterial;
  private blocks: BlockEntry[] = [];
  private farMeshes: THREE.Mesh[] = [];
  private fadeState = new Map<number, { fade: number; target: number; p: BuildingPlan }>();
  private fadeTimer = 0;
  private frame = 0;
  private firstUpdate = true;

  constructor(
    d: DistrictDef,
    private opts: CityBlocksOptions,
  ) {
    this.group.name = 'nyc-blocks';
    this.material = cityMaterial(this.fades);
    // 1. Plan every block.
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        const rect = blockRect(d, c, r);
        const inner = { minX: rect.minX + SIDEWALK, maxX: rect.maxX - SIDEWALK, minZ: rect.minZ + SIDEWALK, maxZ: rect.maxZ - SIDEWALK };
        const kind = d.kind(c, r);
        if (kind === 'water') continue; // in the river: nothing to build
        const seed = `${d.seed}-nyc-${c}-${r}`;
        // Where the ring highway clips the edge of a block, pull the block's
        // building area back from the road instead of losing whole towers.
        const parts = kind === 'buildings' ? offCorridor(d.id, inner) : [inner];
        const plan: ReturnType<typeof planNycBlock> = { buildings: [], yard: null };
        if (kind === 'buildings' && !opts.skip(c, r)) {
          const prng = new Rng(seed);
          for (const part of parts) {
            const one = planNycBlock(part, d.zone(c, r), prng, opts.nearHub(c, r), () => this.fades.allocate());
            plan.buildings.push(...one.buildings);
            plan.yard ??= one.yard;
          }
        }
        // Nothing stands on Broadway or the ring highway (world/corridors.ts):
        // the road cuts the block into the wedges real Manhattan has.
        plan.buildings = plan.buildings.filter((p) => !rectOnCorridor(d.id, p.rect, 1.5));
        this.blocks.push({ c, r, key: `${c},${r}`, rect, inner, kind, buildings: plan.buildings, yard: plan.yard, farId: this.fades.allocate(), near: null, parkTrees: (opts.parkTrees ?? []).filter((t) => t.x >= rect.minX - d.avenueW / 2 - 1 && t.x < rect.maxX + d.avenueW / 2 + 1 && t.z >= rect.minZ - d.streetW / 2 - 1 && t.z < rect.maxZ + d.streetW / 2 + 1), lastUsed: 0, seed });
      }
    }
    // 2. Far stand-ins, grouped 4×5 blocks per mesh so off-screen groups are skipped.
    const groups = new Map<string, BlockEntry[]>();
    for (const b of this.blocks) {
      const k = `${Math.floor(b.c / 4)},${Math.floor(b.r / 5)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(b);
    }
    for (const list of groups.values()) {
      const bld = new CityMeshBuilder();
      for (const b of list) {
        const rng = new Rng(`${b.seed}-far`);
        bld.lockBid = b.farId;
        for (const p of b.buildings) emitSimple(bld, p, rng);
        for (const t of b.parkTrees) treeSimple(bld, t.x, t.z, t.y, 1.3, rng);
        emitBlockProps(bld, this.propOptions(b, true), rng);
      }
      const geo = bld.build();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.name = 'nyc-far';
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.farMeshes.push(mesh);
      this.pickables.push(mesh);
    }
  }

  private propOptions(b: BlockEntry, simple: boolean) {
    return { b: b.rect, sidewalk: SIDEWALK, doors: this.opts.doors, buildings: b.buildings, yard: b.yard, kind: b.kind, trees: this.opts.trees, simple };
  }

  /** All planned buildings (for rooftop billboards etc.). */
  get plans(): BuildingPlan[] {
    return this.blocks.flatMap((b) => b.buildings);
  }

  private buildNear(b: BlockEntry): void {
    const bld = new CityMeshBuilder();
    const rng = new Rng(`${b.seed}-near`);
    for (const p of b.buildings) emitDetailed(bld, p, rng);
    for (const t of b.parkTrees) tree(bld, t.x, t.z, t.y, rng.range(1.1, 1.5), rng);
    emitBlockProps(bld, this.propOptions(b, false), rng);
    const geo = bld.build();
    const mesh = new THREE.Mesh(geo ?? new THREE.BufferGeometry(), this.material);
    mesh.name = `nyc-block-${b.key}`;
    mesh.castShadow = this.opts.shadows;
    mesh.receiveShadow = true;
    mesh.visible = false;
    b.near = mesh;
    this.group.add(mesh);
    this.pickables.push(mesh);
  }

  private dropNear(b: BlockEntry): void {
    if (!b.near) return;
    b.near.geometry.dispose();
    b.near.removeFromParent();
    const i = this.pickables.indexOf(b.near);
    if (i >= 0) this.pickables.splice(i, 1);
    b.near = null;
  }

  /**
   * Show detailed blocks within `radius` of `focus`. Builds at most a
   * couple of new blocks per call (except the very first call, which
   * builds everything needed so the first frame already looks right).
   */
  update(focus: THREE.Vector3, radius: number): void {
    this.frame++;
    const r2 = radius * radius;
    let budget = this.firstUpdate ? Infinity : 2;
    this.firstUpdate = false;
    const want: BlockEntry[] = [];
    for (const b of this.blocks) {
      const cx = (b.rect.minX + b.rect.maxX) / 2;
      const cz = (b.rect.minZ + b.rect.maxZ) / 2;
      // Distance to the block's nearest edge, so big blocks count as near sooner.
      const dx = Math.max(0, Math.abs(focus.x - cx) - (b.rect.maxX - b.rect.minX) / 2);
      const dz = Math.max(0, Math.abs(focus.z - cz) - (b.rect.maxZ - b.rect.minZ) / 2);
      if (dx * dx + dz * dz < r2) want.push(b);
    }
    // Nearest first.
    want.sort((a, b) => dist(a, focus) - dist(b, focus));
    const wanted = new Set(want);
    for (const b of want) {
      if (!b.near && budget > 0) {
        this.buildNear(b);
        budget--;
      }
      if (b.near) {
        b.near.visible = true;
        b.lastUsed = this.frame;
        this.fades.set(b.farId, 1);
      }
    }
    for (const b of this.blocks) {
      if (wanted.has(b)) continue;
      if (b.near) b.near.visible = false;
      this.fades.set(b.farId, 0);
    }
    // Memory cap: forget the least recently used detailed blocks.
    const built = this.blocks.filter((b) => b.near && !wanted.has(b));
    const cap = this.opts.cache ?? 36;
    if (built.length + want.length > cap) {
      built.sort((a, b) => a.lastUsed - b.lastUsed);
      for (const b of built.slice(0, built.length + want.length - cap)) this.dropNear(b);
    }
  }

  /**
   * See-through: every ~0.15 s, find detailed buildings standing between
   * the camera and the player (cheap box test), then fade them smoothly.
   */
  updateSeeThrough(camera: THREE.Vector3, player: THREE.Vector3, dt: number): void {
    this.fadeTimer -= dt;
    if (this.fadeTimer <= 0) {
      this.fadeTimer = 0.15;
      for (const s of this.fadeState.values()) s.target = 0;
      const targets = [new THREE.Vector3(player.x, player.y + 0.4, player.z), new THREE.Vector3(player.x, player.y + 1.7, player.z)];
      const box = new THREE.Box3();
      const ray = new THREE.Ray();
      const hit = new THREE.Vector3();
      for (const b of this.blocks) {
        if (!b.near?.visible) continue;
        if (Math.abs((b.rect.minX + b.rect.maxX) / 2 - player.x) > 140 || Math.abs((b.rect.minZ + b.rect.maxZ) / 2 - player.z) > 140) continue;
        for (const p of b.buildings) {
          const r = p.rect;
          box.min.set(r.minX - 1.2, 0, r.minZ - 1.2);
          box.max.set(r.maxX + 1.2, p.height + 1, r.maxZ + 1.2);
          if (box.containsPoint(targets[0])) continue;
          for (const t of targets) {
            ray.origin.copy(camera);
            ray.direction.copy(t).sub(camera).normalize();
            if (ray.intersectBox(box, hit) && hit.distanceTo(camera) < t.distanceTo(camera) - 0.5) {
              let s = this.fadeState.get(p.id);
              if (!s) this.fadeState.set(p.id, (s = { fade: 0, target: 0, p }));
              s.target = 1;
              break;
            }
          }
        }
      }
    }
    const k = Math.min(1, dt * 6);
    for (const [id, s] of this.fadeState) {
      s.fade += (s.target - s.fade) * k;
      if (s.target === 0 && s.fade < 0.01) {
        this.fades.set(id, 0);
        this.fadeState.delete(id);
        continue;
      }
      this.fades.set(id, s.fade * 0.9);
    }
  }

  dispose(): void {
    for (const b of this.blocks) this.dropNear(b);
    for (const m of this.farMeshes) m.geometry.dispose();
    this.material.dispose();
    this.fades.texture.dispose();
    this.group.removeFromParent();
  }
}

function dist(b: BlockEntry, f: THREE.Vector3): number {
  return Math.hypot((b.rect.minX + b.rect.maxX) / 2 - f.x, (b.rect.minZ + b.rect.maxZ) / 2 - f.z);
}
