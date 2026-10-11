// =====================================================================
// ai-city.ts — puts the AI-made models (assets/ai-models.ts) into the
// city:
//
//   • HOME BLOCKS (block kind 'lot', data/plots.ts): the block is split
//     into 16 plots, 8 along each street, back to back. Houses take
//     plots: tiny home 1, townhouse 2 (side by side), villa 4 (2 wide,
//     through the block), mansion 8 (half the block). Some plots are
//     already lived in (NPC neighbours, seeded so it's the same every
//     time); empty plots get a fence and a path, ready to rent.
//   • STREET BLOCKS: some brownstone / mid-rise blocks use a whole AI
//     block model (tiled 1–3 times along the block) instead of the
//     generated buildings.
//
// Phones: every model is drawn with InstancedMesh, near copies (full
// model) inside the detail circle and far copies (~1/7 of the triangles)
// outside it — at most 2 draw calls per model for the whole city.
// =====================================================================

import * as THREE from 'three';
import type { AiModel, AiModelName } from '../assets/ai-models.ts';
import { Rng } from '../core/rng.ts';
import { blockRect, SIDEWALK, type DistrictDef, type Rect } from './layout.ts';
import { rectOnCorridor } from './corridors.ts';
import { GeoBuilder } from './geo.ts';

type Track = <T extends { dispose(): void }>(x: T) => T;
type Models = Map<AiModelName, AiModel>;

/** Plots along each street of a home block, and rows (one per street). */
export const PLOT_COLS = 8;
export const PLOT_ROWS = 2;
/** What a house takes on the plot grid: cols × rows. */
export const HOUSE_FOOTPRINT: Record<string, [number, number]> = {
  'house-tiny': [1, 1],
  'house-townhouse': [2, 1],
  'house-villa': [2, 2],
  'house-mansion': [4, 2],
};

const TILE_MODELS: AiModelName[] = ['block-walkups-a'];
/** Share of eligible street blocks that get an AI block model. */
const TILE_SHARE = 0.32;

export interface AiPlan {
  /** Street blocks drawn with AI block models ("c,r"): the generator skips them. */
  tileBlocks: Set<string>;
}

const hash01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

/** Which street blocks get AI block models (decided before the generator plans its buildings). */
export function planAiCity(d: DistrictDef, models: Models | undefined, busy: Set<string>): AiPlan {
  const tileBlocks = new Set<string>();
  if (!models || !TILE_MODELS.some((m) => models.has(m))) return { tileBlocks };
  for (let c = 0; c < d.cols; c++) {
    for (let r = 0; r < d.rows; r++) {
      if (d.kind(c, r) !== 'buildings' || d.trimmed(c, r) || busy.has(`${c},${r}`)) continue;
      const z = d.zone(c, r);
      if (z !== 'brownstone' && z !== 'midrise') continue;
      if (Math.abs(c - d.hub.c) <= 1 && Math.abs(r - d.hub.r) <= 1) continue;
      const b = blockRect(d, c, r);
      const inner = { minX: b.minX + SIDEWALK, maxX: b.maxX - SIDEWALK, minZ: b.minZ + SIDEWALK, maxZ: b.maxZ - SIDEWALK };
      if (rectOnCorridor(d.id, inner, 1)) continue;
      if (hash01(`${d.id}-ai-tile-${b.minX | 0},${b.minZ | 0}`) < TILE_SHARE) tileBlocks.add(`${c},${r}`);
    }
  }
  return { tileBlocks };
}

interface Placement {
  model: AiModelName;
  x: number;
  z: number;
  rotY: number;
  s: number;
}

export interface AiCity {
  group: THREE.Group;
  /** Near models inside `radius` of `focus`, far models elsewhere. */
  update: (focus: THREE.Vector3, radius: number) => void;
  /** How many houses / tiles were placed (QA). */
  counts: Record<string, number>;
  /** Where each AI model was placed (QA). */
  spots: { model: string; x: number; z: number }[];
}

export function buildAiCity(d: DistrictDef, models: Models | undefined, plan: AiPlan, track: Track, opts: { shadows: boolean }): AiCity {
  const group = new THREE.Group();
  group.name = 'ai-city';
  const placements: Placement[] = [];
  const counts: Record<string, number> = {};
  if (!models || !models.size) return { group, update: () => undefined, counts, spots: [] };

  /** Fit a model into a rect (facing +z when rotY = 0), uniformly scaled. */
  const fit = (name: AiModelName, r: Rect, rotY: number, pad = 0.96) => {
    const m = models.get(name);
    if (!m) return;
    const quarter = Math.round(rotY / (Math.PI / 2)) % 2 !== 0;
    const sx = quarter ? m.size.z : m.size.x;
    const sz = quarter ? m.size.x : m.size.z;
    const s = Math.min((r.maxX - r.minX) / sx, (r.maxZ - r.minZ) / sz) * pad;
    placements.push({ model: name, x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, rotY, s });
    counts[name] = (counts[name] ?? 0) + 1;
  };

  // ---- street blocks with AI block models
  for (const key of plan.tileBlocks) {
    const [c, r] = key.split(',').map(Number);
    const b = blockRect(d, c, r);
    const inner = { minX: b.minX + SIDEWALK, maxX: b.maxX - SIDEWALK, minZ: b.minZ + SIDEWALK, maxZ: b.maxZ - SIDEWALK };
    const W = inner.maxX - inner.minX, D = inner.maxZ - inner.minZ;
    const alongX = W >= D;
    const n = Math.max(1, Math.min(3, Math.round((alongX ? W : D) / (alongX ? D : W))));
    const rng = new Rng(`${d.seed}-ai-tile-${key}`);
    for (let i = 0; i < n; i++) {
      const cell = alongX
        ? { minX: inner.minX + (W * i) / n, maxX: inner.minX + (W * (i + 1)) / n, minZ: inner.minZ, maxZ: inner.maxZ }
        : { minX: inner.minX, maxX: inner.maxX, minZ: inner.minZ + (D * i) / n, maxZ: inner.minZ + (D * (i + 1)) / n };
      const model = TILE_MODELS.filter((t) => models.has(t))[rng.int(0, TILE_MODELS.length - 1)] ?? TILE_MODELS[0];
      fit(model, cell, rng.int(0, 3) * (Math.PI / 2), 0.98);
    }
  }

  // ---- home blocks: plots, neighbours' houses, fences and paths
  const fences: THREE.Matrix4[] = [];
  const paths = new GeoBuilder();
  const hasHouses = Object.keys(HOUSE_FOOTPRINT).some((h) => models.has(h as AiModelName));
  for (let c = 0; c < d.cols && hasHouses; c++) {
    for (let r = 0; r < d.rows; r++) {
      if (d.kind(c, r) !== 'lot') continue;
      const b = blockRect(d, c, r);
      const inner = { minX: b.minX + SIDEWALK + 0.5, maxX: b.maxX - SIDEWALK - 0.5, minZ: b.minZ + SIDEWALK + 0.5, maxZ: b.maxZ - SIDEWALK - 0.5 };
      // Plots run along the long side of the block (that's where the streets are).
      const alongX = inner.maxX - inner.minX >= inner.maxZ - inner.minZ;
      const L = alongX ? inner.maxX - inner.minX : inner.maxZ - inner.minZ;
      const Dp = alongX ? inner.maxZ - inner.minZ : inner.maxX - inner.minX;
      const cw = L / PLOT_COLS, rd = Dp / PLOT_ROWS;
      /** Rect of plots [col0, col0+cols) × [row0, row0+rows) in world space. */
      const plotRect = (col0: number, cols: number, row0: number, rows: number): Rect =>
        alongX
          ? { minX: inner.minX + col0 * cw, maxX: inner.minX + (col0 + cols) * cw, minZ: inner.minZ + row0 * rd, maxZ: inner.minZ + (row0 + rows) * rd }
          : { minX: inner.minX + row0 * rd, maxX: inner.minX + (row0 + rows) * rd, minZ: inner.minZ + col0 * cw, maxZ: inner.minZ + (col0 + cols) * cw };
      // Row 0 faces the first street (−z or −x), row 1 the other (+z or +x).
      const facing = (row: number) => (alongX ? (row === 0 ? Math.PI : 0) : row === 0 ? -Math.PI / 2 : Math.PI / 2);
      const taken: boolean[][] = Array.from({ length: PLOT_ROWS }, () => Array(PLOT_COLS).fill(false));
      const take = (col: number, cols: number, row: number, rows: number) => {
        for (let i = col; i < col + cols; i++) for (let j = row; j < row + rows; j++) taken[j][i] = true;
      };
      const free = (col: number, cols: number, row: number, rows: number) => {
        if (col + cols > PLOT_COLS || row + rows > PLOT_ROWS) return false;
        for (let i = col; i < col + cols; i++) for (let j = row; j < row + rows; j++) if (taken[j][i]) return false;
        return true;
      };
      const rng = new Rng(`${d.seed}-homes-${c},${r}`);
      // NPC neighbours (seeded): big houses first, then the small ones.
      for (let col = 0; col < PLOT_COLS; col += 2) {
        const roll = rng.next();
        if (col % 4 === 0 && roll < 0.14 && models.has('house-mansion') && free(col, 4, 0, 2)) {
          take(col, 4, 0, 2);
          fit('house-mansion', plotRect(col, 4, 0, 2), facing(rng.chance(0.5) ? 0 : 1));
        } else if (roll < 0.36 && models.has('house-villa') && free(col, 2, 0, 2)) {
          take(col, 2, 0, 2);
          fit('house-villa', plotRect(col, 2, 0, 2), facing(rng.chance(0.5) ? 0 : 1));
        }
      }
      for (let row = 0; row < PLOT_ROWS; row++) {
        for (let col = 0; col < PLOT_COLS; col++) {
          if (!free(col, 1, row, 1)) continue;
          const roll = rng.next();
          if (col % 2 === 0 && roll < 0.3 && models.has('house-townhouse') && free(col, 2, row, 1)) {
            take(col, 2, row, 1);
            fit('house-townhouse', plotRect(col, 2, row, 1), facing(row));
          } else if (roll < 0.62 && models.has('house-tiny')) {
            take(col, 1, row, 1);
            fit('house-tiny', plotRect(col, 1, row, 1), facing(row));
          }
        }
      }
      // Empty plots: low iron fence round the plot, and a stone path in from the street.
      for (let row = 0; row < PLOT_ROWS; row++) {
        for (let col = 0; col < PLOT_COLS; col++) {
          if (taken[row][col]) continue;
          const p = plotRect(col, 1, row, 1);
          const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
          const w = p.maxX - p.minX, dd = p.maxZ - p.minZ;
          for (const [x, z, sx, sz] of [[cx, p.minZ, w, 0.14], [cx, p.maxZ, w, 0.14], [p.minX, cz, 0.14, dd], [p.maxX, cz, 0.14, dd]] as const) {
            fences.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.62, z), new THREE.Quaternion(), new THREE.Vector3(sx, 0.9, sz)));
          }
          // Path from the plot's street side to its middle.
          const pw = Math.min(1.4, (alongX ? w : dd) * 0.25);
          if (alongX) {
            const z0 = row === 0 ? p.minZ : cz, z1 = row === 0 ? cz : p.maxZ;
            paths.flat(cx - pw / 2, cx + pw / 2, z0, z1, 0.24, 2);
          } else {
            const x0 = row === 0 ? p.minX : cx, x1 = row === 0 ? cx : p.maxX;
            paths.flat(x0, x1, cz - pw / 2, cz + pw / 2, 0.24, 2);
          }
        }
      }
    }
  }
  if (fences.length) {
    const f = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), track(new THREE.MeshLambertMaterial({ color: '#2b2f36' })), fences.length);
    fences.forEach((m, i) => f.setMatrixAt(i, m));
    f.computeBoundingSphere();
    f.name = 'plot-fences';
    group.add(f);
  }
  if (!paths.empty) {
    const p = new THREE.Mesh(track(paths.build()), track(new THREE.MeshLambertMaterial({ color: '#e7d6b8' })));
    p.name = 'plot-paths';
    p.receiveShadow = true;
    group.add(p);
  }

  // ---- instanced near / far meshes per model
  type Slot = { m: AiModel; near: THREE.InstancedMesh; far: THREE.InstancedMesh; items: { p: Placement; matrix: THREE.Matrix4 }[] };
  const slots: Slot[] = [];
  for (const [name, m] of models) {
    const items = placements.filter((p) => p.model === name).map((p) => ({ p, matrix: new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.2, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY), new THREE.Vector3(p.s, p.s, p.s)) }));
    if (!items.length) continue;
    const near = new THREE.InstancedMesh(m.near, m.material, items.length);
    const far = new THREE.InstancedMesh(m.far, m.farMaterial, items.length);
    near.name = `ai-${name}`;
    far.name = `ai-${name}-far`;
    near.castShadow = opts.shadows;
    near.receiveShadow = far.receiveShadow = true;
    near.frustumCulled = far.frustumCulled = false; // copies spread over the whole area
    near.count = 0;
    far.count = 0;
    group.add(near, far);
    slots.push({ m, near, far, items });
  }

  let lastX = Infinity, lastZ = Infinity, lastR = -1;
  return {
    group,
    counts,
    spots: placements.map((p) => ({ model: p.model, x: p.x, z: p.z })),
    update(focus, radius) {
      if (Math.abs(focus.x - lastX) < 4 && Math.abs(focus.z - lastZ) < 4 && Math.abs(radius - lastR) < 4) return;
      lastX = focus.x;
      lastZ = focus.z;
      lastR = radius;
      for (const s of slots) {
        let n = 0, f = 0;
        for (const it of s.items) {
          if (Math.hypot(it.p.x - focus.x, it.p.z - focus.z) < radius) s.near.setMatrixAt(n++, it.matrix);
          else s.far.setMatrixAt(f++, it.matrix);
        }
        s.near.count = n;
        s.far.count = f;
        s.near.instanceMatrix.needsUpdate = true;
        s.far.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
