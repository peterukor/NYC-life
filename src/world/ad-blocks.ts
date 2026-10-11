// =====================================================================
// ad-blocks.ts — the rentable AD BLOCKS of data/plots.ts in 3D.
//
// An ad space is the BLOCK ITSELF, not a billboard (Peter, 2026-10-11):
// the whole block is a giant picture lying on the ground, split down the
// middle into a LEFT half and a RIGHT half. Seen from the sky map it's
// impossible to miss. An empty half says "YOUR AD HERE" and its weekly
// price; a rented half shows the renter's picture (paintCell).
//
// Islands for rent get the same treatment: a big flat "PRIVATE ISLAND ·
// FOR RENT" panel in the middle of the island.
//
// Cheap on purpose: every panel is one quad of ONE mesh using ONE canvas
// atlas (each panel is a cell). All ad blocks = 1 draw call.
// =====================================================================

import * as THREE from 'three';
import { AD_PRICES, AD_UNIT_NAMES, adUnitRects, islandWeekly, type Plot } from '../data/plots.ts';
import { SIDEWALK } from './layout.ts';

type Track = <T extends { dispose(): void }>(x: T) => T;

const CELL = 160; // square cells
const COLS = 8;
const Y = 0.32; // just above the sidewalk slab and the lawn

/** Bright colours so even empty halves read as "something's here". */
const EMPTY_COLORS = [
  ['#ff4f8b', '#ff9a3c'],
  ['#3b82f6', '#22d3ee'],
  ['#a855f7', '#ec4899'],
  ['#16a34a', '#a3e635'],
  ['#f59e0b', '#ef4444'],
];

export interface AdBoardHit {
  plotId: string;
  /** Half of the block (0 left, 1 right) for an ad panel, -1 for an island. */
  unit: number;
}

export interface AdBoards {
  group: THREE.Group;
  /** The panels mesh (for tap picking). */
  faces: THREE.Mesh;
  /** Which panel a raycast hit on `faces` is. */
  boardAt: (faceIndex: number) => AdBoardHit | null;
  /** Centre of every panel (map chips, QA). */
  boards: { plotId: string; unit: number; x: number; y: number; z: number }[];
  /** Redraw one panel's picture (e.g. a renter's ad). */
  paintCell: (plotId: string, unit: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => void;
}

export function buildAdBoards(plots: Plot[], track: Track): AdBoards {
  const group = new THREE.Group();
  group.name = 'ad-blocks';
  type Panel = { plot: Plot; unit: number; minX: number; maxX: number; minZ: number; maxZ: number };
  const list: Panel[] = [];

  for (const p of plots) {
    if (p.kind === 'ad' && p.rect) {
      adUnitRects(p).forEach((u, unit) => {
        // Inside the sidewalk, with a 1 m gap down the middle between the halves.
        list.push({ plot: p, unit, minX: u.minX + (unit === 0 ? SIDEWALK : 0.5), maxX: u.maxX - (unit === 1 ? SIDEWALK : 0.5), minZ: u.minZ + SIDEWALK, maxZ: u.maxZ - SIDEWALK });
      });
    } else if (p.kind === 'island') {
      const w = 60, h = 40;
      list.push({ plot: p, unit: -1, minX: p.center.x - w / 2, maxX: p.center.x + w / 2, minZ: p.center.z - h / 2, maxZ: p.center.z + h / 2 });
    }
  }

  // ---- the atlas
  const rows = Math.max(1, Math.ceil(list.length / COLS));
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const g = canvas?.getContext('2d') ?? null;
  if (canvas) {
    canvas.width = CELL * COLS;
    canvas.height = CELL * rows;
  }
  const tex = canvas ? track(new THREE.CanvasTexture(canvas)) : null;
  if (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  const cellXY = (i: number) => ({ x: (i % COLS) * CELL, y: Math.floor(i / COLS) * CELL });
  const paintDefault = (i: number) => {
    if (!g) return;
    const b = list[i];
    const { x, y } = cellXY(i);
    g.save();
    g.translate(x, y);
    const island = b.unit < 0;
    const [c0, c1] = island ? ['#0ea5a4', '#2563eb'] : EMPTY_COLORS[(i >> 1) % EMPTY_COLORS.length];
    const grad = g.createLinearGradient(0, 0, CELL, CELL);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    g.fillStyle = grad;
    g.fillRect(0, 0, CELL, CELL);
    // Diagonal stripes: "available" at a glance.
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (let k = -CELL; k < CELL; k += 26) {
      g.beginPath();
      g.moveTo(k, CELL);
      g.lineTo(k + 12, CELL);
      g.lineTo(k + 12 + CELL, 0);
      g.lineTo(k + CELL, 0);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 4;
    const line = (t: string, font: string, yy: number) => {
      g.font = font;
      g.strokeText(t, CELL / 2, yy);
      g.fillText(t, CELL / 2, yy);
    };
    if (island) {
      line('🏝️ PRIVATE', '900 20px sans-serif', 42);
      line('ISLAND', '900 30px sans-serif', 78);
      line('FOR RENT', '900 22px sans-serif', 108);
      line(`$${islandWeekly(b.plot.islandPrice ?? 0).toFixed(2)}/wk`, '800 16px sans-serif', 136);
    } else {
      line(`📢 ${AD_UNIT_NAMES[b.unit].toUpperCase()}`, '900 15px sans-serif', 30);
      line('YOUR', '900 30px sans-serif', 68);
      line('AD HERE', '900 30px sans-serif', 100);
      line(`$${AD_PRICES[b.plot.tier].unit}/week`, '800 16px sans-serif', 132);
    }
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, CELL - 6, CELL - 6);
    g.restore();
  };
  list.forEach((_, i) => paintDefault(i));
  if (tex) tex.needsUpdate = true;

  // ---- one flat quad per panel (north of the panel = top of its picture)
  const pos: number[] = [];
  const uv: number[] = [];
  const W = CELL * COLS, H = CELL * rows;
  list.forEach((b, i) => {
    const { x: cx, y: cy } = cellXY(i);
    const u0 = (cx + 1) / W, u1 = (cx + CELL - 1) / W;
    const vTop = 1 - (cy + 1) / H, vBot = 1 - (cy + CELL - 1) / H;
    // Counter-clockwise seen from above, so the face points up.
    pos.push(b.minX, Y, b.maxZ, b.maxX, Y, b.maxZ, b.maxX, Y, b.minZ, b.minX, Y, b.maxZ, b.maxX, Y, b.minZ, b.minX, Y, b.minZ);
    uv.push(u0, vBot, u1, vBot, u1, vTop, u0, vBot, u1, vTop, u0, vTop);
  });
  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const faces = new THREE.Mesh(geo, track(new THREE.MeshBasicMaterial({ map: tex ?? undefined, color: tex ? '#ffffff' : '#ff4f8b', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 })));
  faces.name = 'ad-block-panels';
  faces.renderOrder = 1;
  group.add(faces);

  return {
    group,
    faces,
    boardAt: (faceIndex) => {
      const b = list[Math.floor(faceIndex / 2)];
      return b ? { plotId: b.plot.id, unit: b.unit } : null;
    },
    boards: list.map((b) => ({ plotId: b.plot.id, unit: b.unit, x: (b.minX + b.maxX) / 2, y: Y, z: (b.minZ + b.maxZ) / 2 })),
    paintCell: (plotId, unit, draw) => {
      const i = list.findIndex((b) => b.plot.id === plotId && b.unit === unit);
      if (i < 0 || !g || !tex) return;
      const { x, y } = cellXY(i);
      g.save();
      g.translate(x, y);
      g.beginPath();
      g.rect(0, 0, CELL, CELL);
      g.clip();
      draw(g, CELL, CELL);
      g.restore();
      tex.needsUpdate = true;
    },
  };
}
