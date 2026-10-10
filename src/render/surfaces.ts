// =====================================================================
// surfaces.ts — the "skin" of the city, all drawn in code.
//
// WHY DRAW IN CODE?
//   No image files to download: the whole city's look is a few KB of
//   JavaScript, and it can never fail to load.
//
// WHAT EACH SURFACE GETS
//   • map       — the colours you see (bricks, windows, curtains, AC units).
//   • emissive  — which windows glow at night (black = dark).
//   • rm        — "roughness + metalness" in one picture: the GREEN
//                 channel says how rough (matte) a spot is and the BLUE
//                 channel how metallic (mirror-like). Glass is smooth and
//                 a bit metallic, so it reflects the sky; brick is matte.
//                 Only used on medium/high quality (see usePbr()).
//
// Depth is faked by painting light and shadow into the texture (a dark
// line under each lintel, a highlight on each sill). That gives a 3D
// look for zero extra triangles.
//
// HOW TO ADD A NEW FACADE STYLE
//   1. Add its name to FacadeStyle.
//   2. Add a recipe to RECIPES (colours, window grid, which features).
//   3. Use the name in STYLE_BY_ZONE in world/city.ts.
//   That's it — the drawing code reads the recipe.
// =====================================================================

import * as THREE from 'three';
import { Rng } from '../core/rng.ts';
import type { QualityTier } from './quality.ts';

export type FacadeStyle = 'glass' | 'limestone' | 'brick' | 'brownstone' | 'modern';

export interface SurfaceTextures {
  map: THREE.CanvasTexture;
  emissive?: THREE.CanvasTexture;
  /** Green = roughness, blue = metalness. */
  rm?: THREE.CanvasTexture;
  /** Real-world size of one texture tile, in metres (width, height). */
  tile: [number, number];
}

// ---------------------------------------------------------------------
// Quality switch
// ---------------------------------------------------------------------

let RES = 512;
let PBR = true;

/** Call once before building a city. Low = smaller textures + cheaper materials. */
export function setSurfaceDetail(tier: QualityTier): void {
  const res = tier === 'low' ? 256 : 512;
  const pbr = tier !== 'low';
  if (res !== RES || pbr !== PBR) {
    for (const t of cache.values()) disposeSet(t);
    cache.clear();
  }
  RES = res;
  PBR = pbr;
}

/** True when materials should be physically based (reflections, roughness). */
export const usePbr = (): boolean => PBR;

const cache = new Map<string, SurfaceTextures>();
const disposeSet = (t: SurfaceTextures) => [t.map, t.emissive, t.rm].forEach((x) => x?.dispose());

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Shift a #rrggbb colour lighter (+) or darker (−). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Sprinkle tiny light and dark specks: turns flat colour into "material". */
function grit(g: CanvasRenderingContext2D, w: number, h: number, rng: Rng, count: number, alpha = 0.08): void {
  for (let i = 0; i < count; i++) {
    g.fillStyle = rng.chance(0.5) ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 0.7})`;
    const s = rng.chance(0.85) ? 1 : 2;
    g.fillRect(rng.int(0, w), rng.int(0, h), s, s);
  }
}

/** Soft stain blobs (water marks, soot) so walls aren't perfectly clean. */
function stains(g: CanvasRenderingContext2D, w: number, h: number, rng: Rng, count: number, color: string, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(w * 0.04, w * 0.14);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color.replace('A', String(alpha)));
    grad.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Fill a rectangle in the roughness/metalness canvas. r and m are 0…1. */
function rmRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rough: number, metal = 0): void {
  g.fillStyle = `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
  g.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------------
// Building facades
// ---------------------------------------------------------------------

interface FacadeRecipe {
  wall: string;
  /** Mortar (brick) or joint colour (stone). */
  joint: string;
  glass: string;
  frame: string;
  /** Sills, lintels and floor bands. */
  trim: string;
  cols: number;
  rows: number;
  tile: [number, number];
  winW: number;
  winH: number;
  kind: 'punched' | 'curtain' | 'ribbon';
  brick?: boolean;
  stoneBlocks?: boolean;
  floorBands?: boolean;
  fireEscape?: boolean;
  /** Chance a window has an air conditioner sticking out. */
  ac?: number;
  wallRough: number;
}

const RECIPES: Record<FacadeStyle, FacadeRecipe> = {
  glass: { wall: '#4f6f86', joint: '#2b3a45', glass: '#3f6f92', frame: '#26323b', trim: '#8fa3b1', cols: 4, rows: 4, tile: [12, 14], winW: 1, winH: 1, kind: 'curtain', wallRough: 0.4 },
  limestone: { wall: '#d6cab0', joint: '#b9ab8f', glass: '#2c3a47', frame: '#f1e9d7', trim: '#ece3cd', cols: 4, rows: 4, tile: [12, 14], winW: 0.48, winH: 0.58, kind: 'punched', stoneBlocks: true, floorBands: true, ac: 0.12, wallRough: 0.9 },
  brick: { wall: '#9a4a36', joint: '#c9b8a4', glass: '#26303a', frame: '#efe8dc', trim: '#d9cfbf', cols: 3, rows: 3, tile: [9, 10.5], winW: 0.42, winH: 0.6, kind: 'punched', brick: true, fireEscape: true, ac: 0.28, wallRough: 0.95 },
  brownstone: { wall: '#76503c', joint: '#5f3f30', glass: '#22262d', frame: '#2a1e18', trim: '#8f6a55', cols: 3, rows: 3, tile: [9, 11], winW: 0.4, winH: 0.66, kind: 'punched', stoneBlocks: true, ac: 0.15, wallRough: 0.92 },
  modern: { wall: '#3b3f46', joint: '#2a2d33', glass: '#3c5266', frame: '#16181b', trim: '#5a606a', cols: 5, rows: 4, tile: [12, 14], winW: 1, winH: 0.62, kind: 'ribbon', wallRough: 0.55 },
};

/** Real-world tile size of a facade style (needed to lay out UVs). */
export const facadeTile = (style: FacadeStyle): [number, number] => RECIPES[style].tile;

/** Window-grid facade: colour, night-lights, and roughness/metalness. Cached per style. */
export function facadeTextures(style: FacadeStyle): SurfaceTextures {
  const key = `facade:${style}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = RECIPES[style];
  const S = RES;
  const k = S / 512; // scale for pixel sizes written for 512 px
  const [c, g] = canvas(S, S);
  const [ce, ge] = canvas(S, S);
  const [cr, gr] = canvas(S, S);
  const rng = new Rng(`facade-${style}`);

  // ---- 1. The wall itself
  g.fillStyle = r.wall;
  g.fillRect(0, 0, S, S);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, S, S);
  rmRect(gr, 0, 0, S, S, r.wallRough, r.kind === 'curtain' ? 0.2 : 0);

  if (r.brick) drawBricks(g, S, r, rng, k);
  if (r.stoneBlocks) drawStoneBlocks(g, S, r, rng, k, style === 'brownstone');
  if (r.kind !== 'curtain') {
    grit(g, S, S, rng, 2600 * k * k, 0.07);
    stains(g, S, S, rng, 6, 'rgba(30,25,20,A)', 0.1);
  }

  const cw = S / r.cols;
  const ch = S / r.rows;

  // ---- 2. Windows
  if (r.kind === 'curtain') drawCurtainWall(g, ge, gr, S, r, rng, k);
  else if (r.kind === 'ribbon') drawRibbon(g, ge, gr, S, r, rng, k);
  else {
    for (let row = 0; row < r.rows; row++) {
      if (r.floorBands) {
        // A stone band at each floor line: light on top, shadow beneath.
        const y = row * ch + ch * 0.93;
        g.fillStyle = r.trim;
        g.fillRect(0, y, S, 6 * k);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(0, y + 6 * k, S, 3 * k);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(0, y, S, 1.5 * k);
      }
      for (let col = 0; col < r.cols; col++) {
        const w = cw * r.winW;
        const h = ch * r.winH;
        const x = col * cw + (cw - w) / 2;
        const y = row * ch + (ch - h) / 2 - ch * 0.03;
        drawPunchedWindow(g, ge, gr, x, y, w, h, r, rng, k);
      }
    }
  }

  if (r.fireEscape) drawFireEscape(g, gr, S, cw, ch, r.rows, k);

  const tex: SurfaceTextures = { map: finish(c), emissive: finish(ce), rm: finish(cr, false), tile: r.tile };
  cache.set(key, tex);
  return tex;
}

function drawBricks(g: CanvasRenderingContext2D, S: number, r: FacadeRecipe, rng: Rng, k: number): void {
  // Mortar first, then each brick on top with a little colour variety.
  g.fillStyle = r.joint;
  g.fillRect(0, 0, S, S);
  const bh = Math.max(3, Math.round(5 * k));
  const bw = bh * 2.7;
  for (let y = 0, row = 0; y < S; y += bh, row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < S; x += bw) {
      const v = rng.range(-16, 12) + (rng.chance(0.05) ? -28 : 0);
      g.fillStyle = shade(r.wall, v);
      g.fillRect(x + 0.6, y + 0.6, bw - 1.2, bh - 1.2);
    }
  }
}

function drawStoneBlocks(g: CanvasRenderingContext2D, S: number, r: FacadeRecipe, rng: Rng, k: number, rusticated: boolean): void {
  // Big cut-stone blocks: faint joints, slightly different shades.
  const bh = Math.round((rusticated ? 18 : 26) * k);
  const bw = bh * 2.4;
  for (let y = 0, row = 0; y < S; y += bh, row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < S; x += bw) {
      g.fillStyle = shade(r.wall, rng.range(-7, 7));
      g.fillRect(x, y, bw, bh);
    }
    g.fillStyle = `rgba(0,0,0,${rusticated ? 0.22 : 0.1})`;
    g.fillRect(0, y + bh - 1.5 * k, S, 1.5 * k);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, y, S, 1 * k);
  }
}

/** One classic New York window: lintel, recessed frame, two sashes, sill, maybe an AC. */
function drawPunchedWindow(g: CanvasRenderingContext2D, ge: CanvasRenderingContext2D, gr: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: FacadeRecipe, rng: Rng, k: number): void {
  const ft = Math.max(2, w * 0.07); // frame thickness
  // Lintel above (stone strip) with a shadow under it.
  g.fillStyle = r.trim;
  g.fillRect(x - 5 * k, y - 9 * k, w + 10 * k, 8 * k);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(x - 5 * k, y - 9 * k, w + 10 * k, 1.5 * k);
  // Recess: the window sits back in the wall, so its edge is dark.
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(x - 2 * k, y - 1 * k, w + 4 * k, h + 2 * k);
  // Frame and glass.
  g.fillStyle = r.frame;
  g.fillRect(x, y, w, h);
  const gx = x + ft;
  const gy = y + ft;
  const gw = w - ft * 2;
  const gh = h - ft * 2;
  const glassGrad = g.createLinearGradient(gx, gy, gx + gw * 0.4, gy + gh);
  glassGrad.addColorStop(0, shade(r.glass, 55));
  glassGrad.addColorStop(0.45, shade(r.glass, 8));
  glassGrad.addColorStop(1, shade(r.glass, -10));
  g.fillStyle = glassGrad;
  g.fillRect(gx, gy, gw, gh);
  rmRect(gr, gx, gy, gw, gh, 0.12, 0.35);
  rmRect(gr, x, y, w, ft, 0.5);

  // What's behind the glass: blinds, curtains, or nothing.
  const inside = rng.next();
  if (inside < 0.32) {
    const bh = gh * rng.range(0.2, 0.6);
    g.fillStyle = rng.pick(['#e8dfcc', '#d9d4c9', '#f3efe6']);
    g.fillRect(gx, gy, gw, bh);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    for (let yy = gy + 2 * k; yy < gy + bh; yy += 3 * k) g.fillRect(gx, yy, gw, 1);
  } else if (inside < 0.5) {
    g.fillStyle = rng.pick(['#7d2e2e', '#2e4a7d', '#c9a96e', '#5b6e4a', '#ede4d3']);
    g.globalAlpha = 0.85;
    g.fillRect(gx, gy, gw * 0.28, gh);
    g.fillRect(gx + gw * 0.72, gy, gw * 0.28, gh);
    g.globalAlpha = 1;
  }
  // Reflection streak.
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.moveTo(gx + gw * 0.15, gy);
  g.lineTo(gx + gw * 0.45, gy);
  g.lineTo(gx + gw * 0.05, gy + gh);
  g.lineTo(gx, gy + gh * 0.75);
  g.closePath();
  g.fill();
  // Meeting rail between the two sashes (double-hung window).
  g.fillStyle = r.frame;
  g.fillRect(gx, gy + gh * 0.5 - ft * 0.35, gw, ft * 0.7);
  // Shadow from the lintel falling on the top of the glass.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x, y, w, 3 * k);
  g.fillRect(x, y, 2 * k, h);

  // Night lights: about 45% of windows, warm or cool, with a lamp glow.
  if (rng.chance(0.45)) {
    const warm = rng.chance(0.75);
    const lg = ge.createRadialGradient(gx + gw * rng.range(0.3, 0.7), gy + gh * 0.4, 1, gx + gw / 2, gy + gh / 2, Math.max(gw, gh));
    lg.addColorStop(0, warm ? '#ffe2a8' : '#e2f0ff');
    lg.addColorStop(1, warm ? '#c98a3a' : '#7d9cc0');
    ge.globalAlpha = rng.range(0.6, 1);
    ge.fillStyle = lg;
    ge.fillRect(gx, gy, gw, gh);
    ge.globalAlpha = 1;
    ge.fillStyle = '#000';
    ge.fillRect(gx, gy + gh * 0.5 - ft * 0.35, gw, ft * 0.7);
  }

  // Sill below with a highlight and a drip shadow.
  g.fillStyle = r.trim;
  g.fillRect(x - 4 * k, y + h, w + 8 * k, 5 * k);
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fillRect(x - 4 * k, y + h, w + 8 * k, 1.5 * k);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x - 3 * k, y + h + 5 * k, w + 6 * k, 4 * k);

  // Window air conditioner: a very New York detail.
  if (r.ac && rng.chance(r.ac)) {
    const aw = gw * 0.62;
    const ah = gh * 0.24;
    const ax = gx + (gw - aw) / 2;
    const ay = gy + gh - ah;
    g.fillStyle = '#c9c9c4';
    g.fillRect(ax, ay, aw, ah);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let xx = ax + 2 * k; xx < ax + aw - 1; xx += 3 * k) g.fillRect(xx, ay + ah * 0.25, 1, ah * 0.6);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(ax, ay + ah, aw, 4 * k);
    ge.fillStyle = '#000';
    ge.fillRect(ax, ay, aw, ah);
    rmRect(gr, ax, ay, aw, ah, 0.5, 0.2);
  }
}

/** Glass office tower: big panes, thin mullions, dark spandrels at each floor. */
function drawCurtainWall(g: CanvasRenderingContext2D, ge: CanvasRenderingContext2D, gr: CanvasRenderingContext2D, S: number, r: FacadeRecipe, rng: Rng, k: number): void {
  const cw = S / r.cols;
  const ch = S / r.rows;
  // Sky reflection: lighter at the top of each pane, with a soft cloud band.
  for (let col = 0; col < r.cols; col++) {
    for (let row = 0; row < r.rows; row++) {
      const x = col * cw;
      const y = row * ch;
      const bright = rng.range(-10, 22);
      const grad = g.createLinearGradient(x, y, x + cw * 0.3, y + ch);
      grad.addColorStop(0, shade(r.glass, 60 + bright));
      grad.addColorStop(0.55, shade(r.glass, 15 + bright));
      grad.addColorStop(1, shade(r.glass, -15 + bright));
      g.fillStyle = grad;
      g.fillRect(x, y, cw, ch);
    }
  }
  stains(g, S, S, rng, 5, 'rgba(255,255,255,A)', 0.12);
  rmRect(gr, 0, 0, S, S, 0.08, 0.6);
  for (let row = 0; row < r.rows; row++) {
    // Spandrel (the opaque band hiding the floor slab).
    const sy = row * ch + ch * 0.8;
    g.fillStyle = shade(r.frame, 18);
    g.fillRect(0, sy, S, ch * 0.2);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(0, sy, S, 1.5 * k);
    rmRect(gr, 0, sy, S, ch * 0.2, 0.45, 0.3);
    for (let col = 0; col < r.cols; col++) {
      // Office lights at night: ceiling light strips.
      if (rng.chance(0.42)) {
        const x = col * cw;
        ge.fillStyle = rng.chance(0.8) ? '#e6f0ff' : '#ffe0a8';
        ge.globalAlpha = rng.range(0.55, 0.95);
        ge.fillRect(x + 2, row * ch + 2, cw - 4, ch * 0.78 - 2);
        ge.globalAlpha = 0.4;
        ge.fillStyle = '#ffffff';
        for (let yy = row * ch + 6 * k; yy < row * ch + ch * 0.3; yy += 8 * k) ge.fillRect(x + 2, yy, cw - 4, 2 * k);
        ge.globalAlpha = 1;
      }
    }
  }
  // Mullions.
  g.fillStyle = r.frame;
  for (let col = 0; col <= r.cols * 2; col++) {
    const x = (col * cw) / 2;
    const w = (col % 2 ? 1.5 : 3) * k;
    g.fillRect(x - w / 2, 0, w, S);
    rmRect(gr, x - w / 2, 0, w, S, 0.35, 0.7);
  }
}

/** Modern block: dark panels with long horizontal ribbon windows. */
function drawRibbon(g: CanvasRenderingContext2D, ge: CanvasRenderingContext2D, gr: CanvasRenderingContext2D, S: number, r: FacadeRecipe, rng: Rng, k: number): void {
  const ch = S / r.rows;
  const cw = S / r.cols;
  // Panel seams.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < S; x += cw / 2) g.fillRect(x, 0, 1.5 * k, S);
  for (let row = 0; row < r.rows; row++) {
    const h = ch * r.winH;
    const y = row * ch + (ch - h) / 2;
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, shade(r.glass, 50));
    grad.addColorStop(1, shade(r.glass, -10));
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, y - 2 * k, S, h + 4 * k);
    g.fillStyle = grad;
    g.fillRect(0, y, S, h);
    rmRect(gr, 0, y, S, h, 0.1, 0.5);
    for (let col = 0; col < r.cols; col++) {
      if (rng.chance(0.45)) {
        ge.fillStyle = rng.chance(0.7) ? '#ffe7b8' : '#dfeeff';
        ge.globalAlpha = rng.range(0.5, 0.95);
        ge.fillRect(col * cw + 2, y, cw - 4, h);
        ge.globalAlpha = 1;
      }
      g.fillStyle = r.frame;
      g.fillRect(col * cw - 1.5 * k, y, 3 * k, h);
    }
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, y + h + 2 * k, S, 1.5 * k);
  }
}

function drawFireEscape(g: CanvasRenderingContext2D, gr: CanvasRenderingContext2D, S: number, cw: number, ch: number, rows: number, k: number): void {
  // The black zig-zag fire escapes every walk-up has: landings, rails, ladders.
  const fx = cw * 1 + cw * 0.06;
  const fw = cw * 0.88;
  g.strokeStyle = 'rgba(18,18,20,0.92)';
  for (let row = 0; row < rows; row++) {
    const y = row * ch + ch * 0.86;
    // Landing (platform) with its shadow on the wall below.
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(fx, y + 4 * k, fw, 10 * k);
    g.fillStyle = '#17171a';
    g.fillRect(fx, y, fw, 3.5 * k);
    // Railing.
    g.lineWidth = 1.5 * k;
    g.strokeRect(fx, y - ch * 0.16, fw, ch * 0.16);
    for (let x = fx; x < fx + fw; x += 6 * k) {
      g.beginPath();
      g.moveTo(x, y - ch * 0.16);
      g.lineTo(x, y);
      g.stroke();
    }
    // Stair down to the next landing.
    g.lineWidth = 3 * k;
    g.beginPath();
    g.moveTo(fx + (row % 2 ? fw * 0.9 : fw * 0.1), y);
    g.lineTo(fx + (row % 2 ? fw * 0.1 : fw * 0.9), y + ch * 0.9 > S ? S : y + ch * 0.9 - ch * 0.03);
    g.stroke();
    rmRect(gr, fx, y - ch * 0.16, fw, ch * 0.2, 0.6, 0.6);
  }
}

// ---------------------------------------------------------------------
// Shopfronts (ground floor of every building)
// ---------------------------------------------------------------------

/**
 * An atlas of four different shopfronts side by side. Each one is 8 m
 * wide and 4.5 m tall; as a building's wall runs along, the UVs walk
 * through the atlas, so neighbouring shops look different.
 */
export function shopfrontTextures(): SurfaceTextures {
  const hit = cache.get('shopfront');
  if (hit) return hit;
  const W = RES * 2;
  const H = RES / 2;
  const k = H / 256;
  const [c, g] = canvas(W, H);
  const [ce, ge] = canvas(W, H);
  const [cr, gr] = canvas(W, H);
  const rng = new Rng('shopfronts');
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  const SIGN = ['#1d3557', '#9b2226', '#2d6a4f', '#3a0ca3', '#bb3e03', '#222222', '#005f73', '#7b2cbf'];
  const variants = 4;
  const vw = W / variants;
  for (let v = 0; v < variants; v++) {
    const x0 = v * vw;
    // Stone surround.
    const stone = rng.pick(['#8c8378', '#5d5650', '#b5aa98', '#3e3a37']);
    g.fillStyle = stone;
    g.fillRect(x0, 0, vw, H);
    grit(g, vw, H, rng, 500 * k, 0.08);
    rmRect(gr, x0, 0, vw, H, 0.85);
    // Sign band across the top.
    const signY = H * 0.08;
    const signH = H * 0.18;
    const sc = rng.pick(SIGN);
    g.fillStyle = sc;
    g.fillRect(x0 + vw * 0.04, signY, vw * 0.92, signH);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    // Faux lettering: blocks that read as a shop name from a distance.
    let lx = x0 + vw * 0.12;
    while (lx < x0 + vw * 0.84) {
      const lw = rng.range(8, 20) * k;
      g.fillRect(lx, signY + signH * 0.3, lw, signH * 0.4);
      lx += lw + rng.range(3, 6) * k + (rng.chance(0.18) ? 10 * k : 0);
    }
    ge.fillStyle = sc;
    ge.fillRect(x0 + vw * 0.04, signY, vw * 0.92, signH);
    // Big display window, door, and a low stone base (bulkhead).
    const wy = H * 0.32;
    const wh = H * 0.56;
    const doorX = x0 + vw * rng.range(0.1, 0.7);
    const doorW = vw * 0.16;
    const glassGrad = g.createLinearGradient(0, wy, 0, wy + wh);
    glassGrad.addColorStop(0, '#5f7180');
    glassGrad.addColorStop(1, '#2a323a');
    g.fillStyle = '#1b1d20';
    g.fillRect(x0 + vw * 0.04, wy - 3 * k, vw * 0.92, wh + 6 * k);
    g.fillStyle = glassGrad;
    g.fillRect(x0 + vw * 0.05, wy, vw * 0.9, wh);
    rmRect(gr, x0 + vw * 0.05, wy, vw * 0.9, wh, 0.1, 0.4);
    // Shelves and goods inside (little coloured dots).
    for (let sy = wy + wh * 0.25; sy < wy + wh * 0.9; sy += wh * 0.22) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x0 + vw * 0.05, sy, vw * 0.9, 2 * k);
      for (let gx = x0 + vw * 0.07; gx < x0 + vw * 0.93; gx += rng.range(5, 10) * k) {
        g.fillStyle = `hsl(${rng.int(0, 360)},45%,${rng.int(40, 65)}%)`;
        g.fillRect(gx, sy - 6 * k, 4 * k, 6 * k);
      }
    }
    // Night: the shop is lit from inside.
    const lit = ge.createLinearGradient(0, wy, 0, wy + wh);
    lit.addColorStop(0, '#fff2cf');
    lit.addColorStop(1, '#d9a45a');
    ge.fillStyle = lit;
    ge.globalAlpha = 0.9;
    ge.fillRect(x0 + vw * 0.05, wy, vw * 0.9, wh);
    ge.globalAlpha = 1;
    // Door.
    g.fillStyle = '#121416';
    g.fillRect(doorX, wy - 2 * k, doorW, H - wy);
    g.fillStyle = '#3d4a55';
    g.fillRect(doorX + 3 * k, wy + 3 * k, doorW - 6 * k, (H - wy) * 0.7);
    // Window mullions and reflection.
    g.fillStyle = '#1b1d20';
    for (let mx = x0 + vw * 0.05; mx < x0 + vw * 0.95; mx += vw * 0.225) g.fillRect(mx, wy, 3 * k, wh);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(x0 + vw * 0.05, wy, vw * 0.9, wh * 0.18);
    // Bulkhead.
    g.fillStyle = shade('#6d655d', rng.range(-15, 15));
    g.fillRect(x0 + vw * 0.04, wy + wh, vw * 0.92, H - wy - wh);
    // Optional rolled-up security gate box: another NYC signature.
    if (rng.chance(0.6)) {
      g.fillStyle = '#7d8187';
      g.fillRect(x0 + vw * 0.04, wy - 10 * k, vw * 0.92, 8 * k);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x0 + vw * 0.04, wy - 2 * k, vw * 0.92, 2 * k);
    }
  }
  const tex: SurfaceTextures = { map: finish(c), emissive: finish(ce), rm: finish(cr, false), tile: [32, 4.5] };
  cache.set('shopfront', tex);
  return tex;
}

// ---------------------------------------------------------------------
// Ground surfaces
// ---------------------------------------------------------------------

export type GroundKind = 'asphalt' | 'sidewalk' | 'roof' | 'grass' | 'plaza' | 'dirt' | 'trim';

/** Tile size in metres for each ground surface. */
const GROUND_TILE: Record<GroundKind, number> = { asphalt: 8, sidewalk: 3, roof: 6, grass: 5, plaza: 2.4, dirt: 6, trim: 2 };

/** Textures for roads, pavements, roofs, grass, plazas. `tile` = metres per repeat. */
export function groundTextures(kind: GroundKind): SurfaceTextures {
  const key = `ground:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = RES / 2;
  const k = S / 256;
  const [c, g] = canvas(S, S);
  const [cr, gr] = canvas(S, S);
  const rng = new Rng(`ground-${kind}`);
  const t = GROUND_TILE[kind];

  if (kind === 'asphalt') {
    g.fillStyle = '#3a3c40';
    g.fillRect(0, 0, S, S);
    grit(g, S, S, rng, 9000 * k * k, 0.12);
    // Patches where the road was dug up and re-paved.
    for (let i = 0; i < 3; i++) {
      g.fillStyle = shade('#3a3c40', rng.range(-8, 8));
      g.fillRect(rng.range(0, S), rng.range(0, S), rng.range(30, 90) * k, rng.range(20, 60) * k);
    }
    stains(g, S, S, rng, 4, 'rgba(10,10,12,A)', 0.25);
    // Hairline cracks.
    g.strokeStyle = 'rgba(15,15,15,0.5)';
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = rng.range(0, S);
      let y = rng.range(0, S);
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += rng.range(-14, 14) * k;
        y += rng.range(-14, 14) * k;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    rmRect(gr, 0, 0, S, S, 0.85);
  } else if (kind === 'sidewalk') {
    // NYC sidewalk "flags": 1.5 m concrete squares with dark seams.
    g.fillStyle = '#a9a59d';
    g.fillRect(0, 0, S, S);
    const f = S / 2;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = shade('#a9a59d', rng.range(-10, 8));
        g.fillRect(i * f, j * f, f, f);
      }
    }
    grit(g, S, S, rng, 5000 * k * k, 0.1);
    stains(g, S, S, rng, 4, 'rgba(60,55,50,A)', 0.14);
    // Old chewing gum spots, a real New York sight.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(40,40,40,0.35)';
      g.beginPath();
      g.arc(rng.range(0, S), rng.range(0, S), rng.range(1, 2.2) * k, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(40,38,35,0.55)';
    for (let i = 0; i <= 2; i++) {
      g.fillRect(i * f - 1, 0, 2, S);
      g.fillRect(0, i * f - 1, S, 2);
    }
    rmRect(gr, 0, 0, S, S, 0.9);
  } else if (kind === 'roof') {
    g.fillStyle = '#5a5c60';
    g.fillRect(0, 0, S, S);
    grit(g, S, S, rng, 7000 * k * k, 0.14);
    stains(g, S, S, rng, 5, 'rgba(25,25,28,A)', 0.2);
    // Membrane seams.
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 0; y < S; y += S / 4) g.fillRect(0, y, S, 1.5 * k);
    rmRect(gr, 0, 0, S, S, 0.95);
  } else if (kind === 'grass') {
    g.fillStyle = '#5a9447';
    g.fillRect(0, 0, S, S);
    stains(g, S, S, rng, 10, 'rgba(40,80,30,A)', 0.35);
    stains(g, S, S, rng, 6, 'rgba(150,170,80,A)', 0.2);
    for (let i = 0; i < 5000 * k * k; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(30,70,25,0.3)' : 'rgba(150,200,100,0.25)';
      g.fillRect(rng.int(0, S), rng.int(0, S), 1, 2 * k);
    }
    rmRect(gr, 0, 0, S, S, 0.95);
  } else if (kind === 'plaza') {
    // Square granite pavers in two tones.
    const n = 6;
    const p = S / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        g.fillStyle = shade((i + j) % 2 ? '#bdb3a6' : '#a59c90', rng.range(-6, 6));
        g.fillRect(i * p, j * p, p, p);
      }
    }
    grit(g, S, S, rng, 3500 * k * k, 0.08);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i <= n; i++) {
      g.fillRect(i * p - 0.5, 0, 1, S);
      g.fillRect(0, i * p - 0.5, S, 1);
    }
    rmRect(gr, 0, 0, S, S, 0.7);
  } else if (kind === 'dirt') {
    g.fillStyle = '#86694a';
    g.fillRect(0, 0, S, S);
    grit(g, S, S, rng, 8000 * k * k, 0.18);
    stains(g, S, S, rng, 8, 'rgba(70,50,30,A)', 0.3);
    rmRect(gr, 0, 0, S, S, 1);
  } else {
    // trim: pale cut stone for cornices and ledges.
    g.fillStyle = '#cfc5b2';
    g.fillRect(0, 0, S, S);
    grit(g, S, S, rng, 3000 * k * k, 0.08);
    stains(g, S, S, rng, 4, 'rgba(60,55,45,A)', 0.15);
    rmRect(gr, 0, 0, S, S, 0.85);
  }

  const map = finish(c);
  const rm = finish(cr, false);
  map.repeat.set(1 / t, 1 / t);
  rm.repeat.set(1 / t, 1 / t);
  const tex: SurfaceTextures = { map, rm, tile: [t, t] };
  cache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------

/**
 * Make a material for a surface. On medium/high quality it's a
 * physically based material (reacts to the sky reflection and has
 * shiny glass); on low quality it's the cheap Lambert material.
 */
export function surfaceMaterial(tex: SurfaceTextures, opts: { color?: string; glow?: boolean } = {}): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  const common = {
    map: tex.map,
    color: opts.color ?? '#ffffff',
    ...(opts.glow && tex.emissive ? { emissiveMap: tex.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 } : {}),
  };
  if (!PBR) return new THREE.MeshLambertMaterial(common);
  return new THREE.MeshStandardMaterial({ ...common, roughnessMap: tex.rm, metalnessMap: tex.rm, roughness: 1, metalness: 1 });
}
