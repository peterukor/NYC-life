// =====================================================================
// ad-blocks.ts — the rentable billboards of data/plots.ts in 3D.
//
// Every AD BLOCK gets four big billboards, one per unit (NW, NE, SW, SE),
// each standing in its quarter of the block and facing its street. Every
// ISLAND for rent gets one giant "PRIVATE ISLAND · FOR RENT" board.
//
// Cheap on purpose: ALL faces are one mesh using one canvas "atlas"
// texture (each board is a cell of it), and ALL steel (legs, frames) is
// one InstancedMesh of a unit box. 80+ billboards = 2 draw calls.
//
// Boards are double-sided and all lean back toward the north, so the map
// camera (which looks north) reads both rows of a block.
//
// An empty unit shows "YOUR AD HERE" and its weekly price. When a unit is
// rented, paintCell() draws the renter's image into its cell.
// =====================================================================

import * as THREE from 'three';
import { AD_PRICES, adUnitRects, type Plot } from '../data/plots.ts';
import { SIDEWALK } from './layout.ts';

type Track = <T extends { dispose(): void }>(x: T) => T;

const CELL_W = 192;
const CELL_H = 96;
const COLS = 8;
const LEAN = 0.35;

/** Bright colours per board so a row of empty boards still looks like a city of ads. */
const EMPTY_COLORS = [
  ['#ff4f8b', '#ff9a3c'],
  ['#3b82f6', '#22d3ee'],
  ['#a855f7', '#ec4899'],
  ['#16a34a', '#a3e635'],
  ['#f59e0b', '#ef4444'],
];

export interface AdBoardHit {
  plotId: string;
  /** 0..3 for an ad unit, -1 for an island board. */
  unit: number;
}

export interface AdBoards {
  group: THREE.Group;
  /** The faces mesh (for tap picking). */
  faces: THREE.Mesh;
  /** Which board a raycast hit on `faces` is. */
  boardAt: (faceIndex: number) => AdBoardHit | null;
  /** Centre of every board (map chips, QA). */
  boards: { plotId: string; unit: number; x: number; y: number; z: number }[];
  /** Redraw one board's picture (e.g. a renter's ad). */
  paintCell: (plotId: string, unit: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => void;
}

export function buildAdBoards(plots: Plot[], track: Track): AdBoards {
  const group = new THREE.Group();
  group.name = 'ad-boards';
  type Board = { plot: Plot; unit: number; x: number; y: number; z: number; w: number; h: number; faceSouth: boolean; legH: number };
  const list: Board[] = [];

  for (const p of plots) {
    if (p.kind === 'ad' && p.rect) {
      adUnitRects(p).forEach((u, unit) => {
        const north = unit < 2;
        const uw = u.maxX - u.minX;
        const w = Math.max(14, Math.min(30, uw - 10));
        const h = w * 0.42;
        // Near the unit's street edge, facing that street.
        const z = north ? u.minZ + SIDEWALK + 7 : u.maxZ - SIDEWALK - 7;
        list.push({ plot: p, unit, x: (u.minX + u.maxX) / 2, y: 6 + h / 2, z, w, h, faceSouth: !north, legH: 6 });
      });
    } else if (p.kind === 'island') {
      const w = 44, h = 18;
      list.push({ plot: p, unit: -1, x: p.center.x, y: 12 + h / 2, z: p.center.z, w, h, faceSouth: true, legH: 12 });
    }
  }

  // ---- the atlas
  const rows = Math.max(1, Math.ceil(list.length / COLS));
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const g = canvas?.getContext('2d') ?? null;
  if (canvas) {
    canvas.width = CELL_W * COLS;
    canvas.height = CELL_H * rows;
  }
  const tex = canvas ? track(new THREE.CanvasTexture(canvas)) : null;
  if (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
  }
  const cellXY = (i: number) => ({ x: (i % COLS) * CELL_W, y: Math.floor(i / COLS) * CELL_H });
  const paintDefault = (i: number) => {
    if (!g) return;
    const b = list[i];
    const { x, y } = cellXY(i);
    g.save();
    g.translate(x, y);
    if (b.unit < 0) {
      // Island board.
      const grad = g.createLinearGradient(0, 0, CELL_W, CELL_H);
      grad.addColorStop(0, '#0ea5a4');
      grad.addColorStop(1, '#2563eb');
      g.fillStyle = grad;
      g.fillRect(0, 0, CELL_W, CELL_H);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.font = '900 15px sans-serif';
      g.fillText('🏝️ PRIVATE ISLAND', CELL_W / 2, 26);
      g.font = '900 26px sans-serif';
      g.fillText('FOR RENT', CELL_W / 2, 56);
      g.font = '800 14px sans-serif';
      g.fillText(`$${b.plot.islandPrice?.toFixed(2)} · 6 months`, CELL_W / 2, 80);
    } else {
      const [c0, c1] = EMPTY_COLORS[i % EMPTY_COLORS.length];
      const grad = g.createLinearGradient(0, 0, CELL_W, CELL_H);
      grad.addColorStop(0, c0);
      grad.addColorStop(1, c1);
      g.fillStyle = grad;
      g.fillRect(0, 0, CELL_W, CELL_H);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let k = -CELL_H; k < CELL_W; k += 22) {
        g.beginPath();
        g.moveTo(k, CELL_H);
        g.lineTo(k + 10, CELL_H);
        g.lineTo(k + 10 + CELL_H, 0);
        g.lineTo(k + CELL_H, 0);
        g.fill();
      }
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.font = '900 13px sans-serif';
      g.fillText('📢 AD SPACE', CELL_W / 2, 22);
      g.font = '900 25px sans-serif';
      g.fillText('YOUR AD HERE', CELL_W / 2, 54);
      g.font = '800 14px sans-serif';
      g.fillText(`$${AD_PRICES[b.plot.tier].unit}/week · tap to rent`, CELL_W / 2, 80);
    }
    // Frame line so neighbouring cells never bleed.
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 4;
    g.strokeRect(2, 2, CELL_W - 4, CELL_H - 4);
    g.restore();
  };
  list.forEach((_, i) => paintDefault(i));
  if (tex) tex.needsUpdate = true;

  // ---- faces: front + back quad per board, merged into one geometry
  const pos: number[] = [];
  const uv: number[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const W = CELL_W * COLS, H = CELL_H * rows;
  list.forEach((b, i) => {
    const { x: cx, y: cy } = cellXY(i);
    // Inset UVs half a pixel so the next cell doesn't bleed in.
    const u0 = (cx + 1) / W, u1 = (cx + CELL_W - 1) / W;
    const v1 = 1 - (cy + 1) / H, v0 = 1 - (cy + CELL_H - 1) / H;
    // Face south (+z) or north; lean the top toward the north either way.
    e.set(b.faceSouth ? -LEAN : LEAN, b.faceSouth ? 0 : Math.PI, 0, 'YXZ');
    q.setFromEuler(e);
    for (const side of [0, 1]) {
      // side 1 = the back, turned around so its picture reads the right way.
      const flip = side ? Math.PI : 0;
      const qs = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), flip));
      m.compose(new THREE.Vector3(b.x, b.y, b.z), qs, new THREE.Vector3(1, 1, 1));
      const off = side ? -0.06 : 0.06;
      const corner = (lx: number, ly: number) => v.set(lx, ly, Math.abs(off)).applyMatrix4(m).toArray();
      const a = corner(-b.w / 2, -b.h / 2), bb = corner(b.w / 2, -b.h / 2), c = corner(b.w / 2, b.h / 2), d = corner(-b.w / 2, b.h / 2);
      pos.push(...a, ...bb, ...c, ...a, ...c, ...d);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
  });
  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const faces = new THREE.Mesh(geo, track(new THREE.MeshBasicMaterial({ map: tex ?? undefined, color: tex ? '#ffffff' : '#ff4f8b', toneMapped: false })));
  faces.name = 'ad-board-faces';
  group.add(faces);

  // ---- steel: frame between the two faces, two legs, a catwalk
  const parts: THREE.Matrix4[] = [];
  const part = (px: number, py: number, pz: number, sx: number, sy: number, sz: number, rx: number, ry: number) => {
    parts.push(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')), new THREE.Vector3(sx, sy, sz)));
  };
  for (const b of list) {
    const ry = b.faceSouth ? 0 : Math.PI;
    const rx = b.faceSouth ? -LEAN : LEAN;
    part(b.x, b.y, b.z, b.w + 0.8, b.h + 0.8, 0.1, rx, ry);
    const bottom = b.y - (b.h / 2) * Math.cos(LEAN);
    for (const s of [-1, 1]) part(b.x + s * b.w * 0.3, bottom / 2, b.z, 0.8, bottom, 0.8, 0, 0);
    part(b.x, bottom - 0.2, b.z, b.w, 0.3, 1.6, 0, 0);
  }
  if (parts.length) {
    const steel = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), track(new THREE.MeshLambertMaterial({ color: '#2f343c' })), parts.length);
    parts.forEach((mx, i) => steel.setMatrixAt(i, mx));
    steel.computeBoundingSphere();
    steel.castShadow = true;
    steel.name = 'ad-board-steel';
    group.add(steel);
  }

  return {
    group,
    faces,
    boardAt: (faceIndex) => {
      const b = list[Math.floor(faceIndex / 4)];
      return b ? { plotId: b.plot.id, unit: b.unit } : null;
    },
    boards: list.map((b) => ({ plotId: b.plot.id, unit: b.unit, x: b.x, y: b.y, z: b.z })),
    paintCell: (plotId, unit, draw) => {
      const i = list.findIndex((b) => b.plot.id === plotId && b.unit === unit);
      if (i < 0 || !g || !tex) return;
      const { x, y } = cellXY(i);
      g.save();
      g.translate(x, y);
      g.beginPath();
      g.rect(0, 0, CELL_W, CELL_H);
      g.clip();
      draw(g, CELL_W, CELL_H);
      g.restore();
      tex.needsUpdate = true;
    },
  };
}
