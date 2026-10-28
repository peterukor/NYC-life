// =====================================================================
// home-surfaces.ts — floors and wall finishes for homes, DRAWN IN CODE
// (no image files): planks, chevron parquet, marble, terrazzo, tiles,
// exposed brick, wallpapers, wainscot panels… (data/home-style.ts lists
// them; the ids here match).
//
// Each texture is one repeating tile of a known size in METRES, and the
// floors and walls of a home have UVs in metres (home-interior.ts), so
// a plank is the same size in a closet and in a ballroom.
//
// Colours are drawn into the texture (not multiplied afterwards), so a
// gold line on an art deco paper stays gold whatever the base colour.
// Textures and materials are cached: built once, shared by every home.
// =====================================================================

import * as THREE from 'three';
import { floorStyle, parseStyle, wallStyle } from '../data/home-style.ts';

let RES = 512;
/** Cheap phones get smaller textures (set from the quality tier). */
export function setHomeSurfaceDetail(low: boolean): void {
  RES = low ? 256 : 512;
}

// ---- small helpers -------------------------------------------------

/** A repeatable pseudo-random number in 0..1 for integer coordinates. */
function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth value noise that wraps every `period` cells (so tiles repeat seamlessly). */
function noise(x: number, y: number, period: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const w = (a: number) => ((a % period) + period) % period;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Layered noise (0..1), tileable. */
function fbm(x: number, y: number, period: number, octaves = 4, s = 0): number {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    v += noise(x * f, y * f, period * f, s + o) * amp;
    tot += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / tot;
}

type RGB = [number, number, number];
const rgb = (hex: string): RGB => {
  const c = parseInt(hex.replace('#', ''), 16);
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/** Fill a canvas pixel by pixel: f(u, v) gets coordinates in 0..1 across the tile. */
function pixels(w: number, h: number, f: (u: number, v: number, x: number, y: number) => RGB): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = f(x / w, y / h, x, y);
    const i = (y * w + x) * 4;
    d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** A grout/mortar line mask: 1 inside a tile, 0 on the line (soft edge). */
function inTile(fx: number, fy: number, line: number): number {
  const ex = Math.min(fx, 1 - fx), ey = Math.min(fy, 1 - fy);
  const e = Math.min(ex, ey);
  return Math.min(1, Math.max(0, (e - line) / (line * 0.6 + 1e-4)));
}

// ---- floors ---------------------------------------------------------

interface Drawn {
  canvas: HTMLCanvasElement;
  /** The tile's size in metres [across, along/up]. */
  size: [number, number];
}

const WOODS: Record<string, [string, string]> = {
  oak: ['#b4824f', '#8f6238'],
  ash: ['#dcc6a2', '#b99d78'],
  walnut: ['#6e4a33', '#4d3121'],
};

/** Planks 18 cm wide running along x, joints staggered, with grain. */
function planks(base: string, dark: string): Drawn {
  const N = RES, rows = 11; // 11 planks in a 2 m tile
  const a = rgb(base), b = rgb(dark);
  return {
    size: [2, 2],
    canvas: pixels(N, N, (u, v) => {
      const row = Math.floor(v * rows);
      const fy = v * rows - row;
      // Each row's planks are 1 m long (2 per tile), the joint shifted per row.
      const off = hash(row, 7) ;
      const pu = (u * 2 + off) % 1;
      const plank = Math.floor(u * 2 + off);
      const tone = hash(plank, row, 3);
      let c = mix(a, b, 0.15 + tone * 0.45);
      const grain = fbm(u * 2 * 40 + row * 3.1, fy * 3, 1e9, 3, row);
      c = scale(c, 0.88 + grain * 0.24);
      // Fine streaks along the plank.
      c = scale(c, 1 - Math.pow(Math.abs(Math.sin((fy * 9 + grain * 4) * Math.PI)), 18) * 0.12);
      const edge = Math.min(inTile(pu, fy, 0.006), inTile(0.5, fy, 0.025));
      return mix(scale(c, 0.55), c, edge);
    }),
  };
}

/** Chevron parquet: strips of slanted blocks meeting in a point. */
function chevron(): Drawn {
  const N = RES;
  const a = rgb('#b98a5a'), b = rgb('#8a5d36');
  const strips = 4; // per tile (1.2 m)
  return {
    size: [1.2, 1.2],
    canvas: pixels(N, N, (u, v) => {
      const s = Math.floor(u * strips);
      const fu = u * strips - s;
      const dir = s % 2 ? 1 : -1;
      const t = v * 8 + dir * fu * 1.0; // slant
      const blk = Math.floor(t);
      const ft = t - blk;
      const tone = hash(blk, s, 5);
      let c = mix(a, b, 0.1 + tone * 0.5);
      c = scale(c, 0.9 + fbm(fu * 6, t * 2, 1e9, 3, s) * 0.2);
      const edge = Math.min(inTile(ft, 0.5, 0.035), inTile(fu, 0.5, 0.012));
      return mix(scale(c, 0.6), c, edge);
    }),
  };
}

/** Parquet squares: basket weave, slats turning every square. */
function parquet(): Drawn {
  const N = RES;
  const a = rgb('#a97947'), b = rgb('#7f552f');
  const cells = 4;
  return {
    size: [1.2, 1.2],
    canvas: pixels(N, N, (u, v) => {
      const cx = Math.floor(u * cells), cy = Math.floor(v * cells);
      const fx = u * cells - cx, fy = v * cells - cy;
      const across = (cx + cy) % 2 === 0;
      const t = across ? fy : fx;
      const slat = Math.floor(t * 4);
      const ft = t * 4 - slat;
      const tone = hash(cx * 7 + slat, cy, 9);
      let c = mix(a, b, 0.1 + tone * 0.5);
      c = scale(c, 0.9 + fbm((across ? fx : fy) * 8, ft * 2, 1e9, 3, slat + cx) * 0.2);
      const edge = Math.min(inTile(ft, 0.5, 0.04), inTile(fx, fy, 0.01));
      return mix(scale(c, 0.6), c, edge);
    }),
  };
}

/** Marble slabs: soft clouds and winding veins, thin seams. */
function marble(base: string, vein: string, seam: string, slabs = 2): Drawn {
  const N = RES;
  const a = rgb(base), vv = rgb(vein), sm = rgb(seam);
  return {
    size: [1.6, 1.6],
    canvas: pixels(N, N, (u, v) => {
      const P = 4;
      const n = fbm(u * P, v * P, P, 5, 11);
      const w = Math.sin((u + v * 0.6) * Math.PI * 4 + n * 7);
      const veinA = Math.pow(1 - Math.abs(w), 22);
      const w2 = Math.sin((u * 0.4 - v) * Math.PI * 6 + fbm(u * 8, v * 8, 8, 4, 3) * 6);
      const veinB = Math.pow(1 - Math.abs(w2), 40) * 0.6;
      let c = scale(a, 0.94 + fbm(u * 8, v * 8, 8, 4, 21) * 0.1);
      c = mix(c, vv, Math.min(1, veinA * 0.75 + veinB));
      const fx = (u * slabs) % 1, fy = (v * slabs) % 1;
      return mix(sm, c, inTile(fx, fy, 0.004));
    }),
  };
}

function terrazzo(): Drawn {
  const N = RES;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ece4d6';
  g.fillRect(0, 0, N, N);
  const chips = ['#c8553d', '#e9b44c', '#588157', '#6f6a63', '#1d1f24', '#d9c7b0', '#e7a8a0', '#8ecae6'];
  for (let i = 0; i < 520; i++) {
    const x = hash(i, 1) * N, y = hash(i, 2) * N;
    const r = (1.5 + hash(i, 3) * 5.5) * (N / 512);
    g.fillStyle = chips[Math.floor(hash(i, 4) * chips.length)];
    g.beginPath();
    const k = 5 + Math.floor(hash(i, 5) * 3);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2 + hash(i, j + 9);
      const rr = r * (0.6 + hash(i, j + 20) * 0.6);
      // Draw on all four wraps so the tile repeats seamlessly.
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (j === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    for (const [dx, dy] of [[N, 0], [-N, 0], [0, N], [0, -N]]) {
      if (x + dx < -10 || x + dx > N + 10 || y + dy < -10 || y + dy > N + 10) continue;
      g.save();
      g.translate(dx, dy);
      g.fill();
      g.restore();
    }
  }
  return { size: [1.2, 1.2], canvas: c };
}

/** Square tiles with grout. `checker` alternates two colours. */
function tiles(colA: string, colB: string | null, per: number, size: number, grout = '#b8b2a7'): Drawn {
  const N = RES;
  const a = rgb(colA), b = rgb(colB ?? colA), gr = rgb(grout);
  return {
    size: [size, size],
    canvas: pixels(N, N, (u, v) => {
      const cx = Math.floor(u * per), cy = Math.floor(v * per);
      const fx = u * per - cx, fy = v * per - cy;
      let c = colB && (cx + cy) % 2 ? b : a;
      c = scale(c, 0.96 + hash(cx, cy, 31) * 0.06 + (fbm(u * 6, v * 6, 6, 3, 2) - 0.5) * 0.06);
      // A soft sheen towards one corner of each tile.
      c = scale(c, 1 + (1 - fx - fy) * 0.025);
      return mix(gr, c, inTile(fx, fy, 0.03));
    }),
  };
}

function hexTiles(col: string): Drawn {
  const N = RES;
  const a = rgb(col), gr = rgb('#a9a49a');
  // A hex grid that repeats: 6 hexes across, rows of √3/2.
  const across = 6;
  const s = 1 / across; // hex width (flat to flat) in tile units
  return {
    size: [0.9, 0.9 * Math.sqrt(3)],
    canvas: pixels(N, Math.round(N * Math.sqrt(3)), (u, v) => {
      const x = u, y = v * Math.sqrt(3);
      // Axial coordinates of the nearest hex centre (pointy side up).
      const q = (x * Math.sqrt(3) / 3 - y / 3) / (s / Math.sqrt(3));
      const r = (y * 2 / 3) / (s / Math.sqrt(3));
      let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
      const dx = Math.abs(rx - q), dy = Math.abs(ry - (-q - r)), dz = Math.abs(rz - r);
      if (dx > dy && dx > dz) rx = -ry - rz;
      else if (dy <= dz) rz = -rx - ry;
      const fq = q - rx, fr = r - rz;
      const d = Math.max(Math.abs(fq), Math.abs(fr), Math.abs(fq + fr));
      const c = scale(a, 0.95 + hash(rx, rz, 4) * 0.08);
      return mix(gr, c, Math.min(1, Math.max(0, (0.5 - d - 0.04) / 0.03)));
    }),
  };
}

function concrete(seam: boolean, wall = false): Drawn {
  const N = RES;
  const a = rgb(wall ? '#a9a6a0' : '#9c9a96');
  return {
    size: [1.5, 1.5],
    canvas: pixels(N, N, (u, v) => {
      let c = scale(a, 0.86 + fbm(u * 6, v * 6, 6, 5, 7) * 0.26);
      c = scale(c, 1 - Math.pow(fbm(u * 24, v * 24, 24, 2, 9), 6) * 0.25);
      if (seam) c = mix(scale(c, 0.75), c, inTile(u, v, 0.003));
      if (wall) {
        // Form-tie holes: a grid of little dark dots, very New York loft.
        for (const [hx, hy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const d = Math.hypot(u - hx, v - hy);
          if (d < 0.012) c = scale(c, 0.55 + d * 20);
        }
      }
      return c;
    }),
  };
}

function carpet(col: string): Drawn {
  const N = Math.min(RES, 256);
  const a = rgb(col);
  return {
    size: [0.8, 0.8],
    canvas: pixels(N, N, (_u, _v, x, y) => scale(a, 0.9 + hash(x, y, 77) * 0.12 + (noise(x / 9, y / 9, N / 9, 4) - 0.5) * 0.1)),
  };
}

function linoleum(): Drawn {
  const t = tiles('#d8cba0', '#c9b98a', 4, 1.2, '#b5a77d');
  const g = t.canvas.getContext('2d')!;
  // Speckles.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = hash(i, 5) > 0.5 ? '#8f8466' : '#efe6c8';
    g.fillRect(hash(i, 1) * t.canvas.width, hash(i, 2) * t.canvas.height, 1.5, 1.5);
  }
  return t;
}


/** The classic 90s arcade/bowling-alley carpet: neon squiggles and stars on black. */
function cosmicCarpet(): Drawn {
  const N = RES;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d0b1e';
  g.fillRect(0, 0, N, N);
  const cols = ['#ff2bd6', '#22d3ee', '#facc15', '#a3e635', '#8b5cf6', '#fb7185'];
  const k = N / 512;
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = hash(i, 1) * N, y = hash(i, 2) * N, kind = Math.floor(hash(i, 3) * 4);
    const col = cols[Math.floor(hash(i, 4) * cols.length)];
    g.save();
    for (const [dx, dy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
      g.setTransform(1, 0, 0, 1, x + dx, y + dy);
      g.rotate(hash(i, 5) * 6.28);
      g.strokeStyle = g.fillStyle = col;
      g.lineWidth = 4 * k;
      g.beginPath();
      if (kind === 0) { // squiggle
        g.moveTo(-18 * k, 0);
        g.bezierCurveTo(-8 * k, -14 * k, 0, 14 * k, 10 * k, 0);
        g.bezierCurveTo(14 * k, -6 * k, 18 * k, -6 * k, 22 * k, 0);
        g.stroke();
      } else if (kind === 1) { // ring
        g.arc(0, 0, 9 * k, 0, Math.PI * 2);
        g.stroke();
      } else if (kind === 2) { // star
        for (let p = 0; p < 10; p++) {
          const r = (p % 2 ? 4 : 11) * k, a = (p / 10) * Math.PI * 2;
          if (p) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.fill();
      } else { // zigzag bolt
        g.moveTo(-12 * k, -8 * k);
        g.lineTo(0, -2 * k);
        g.lineTo(-4 * k, 4 * k);
        g.lineTo(12 * k, 10 * k);
        g.stroke();
      }
    }
    g.restore();
  }
  return { size: [1.6, 1.6], canvas: c };
}

/** Casino carpet: a busy repeat of medallions and scrolls on a rich ground. */
function casinoCarpet(col: string): Drawn {
  const N = RES;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = col;
  g.fillRect(0, 0, N, N);
  const gold = '#d4a84b', dark = '#' + rgb(col).map((v) => Math.round(v * 0.55).toString(16).padStart(2, '0')).join('');
  const cell = N / 4;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const cx = (x + 0.5) * cell, cy = (y + 0.5) * cell;
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(cx, cy - cell * 0.45);
    g.lineTo(cx + cell * 0.45, cy);
    g.lineTo(cx, cy + cell * 0.45);
    g.lineTo(cx - cell * 0.45, cy);
    g.fill();
    g.strokeStyle = gold;
    g.lineWidth = Math.max(1.5, N / 240);
    g.beginPath();
    g.arc(cx, cy, cell * 0.2, 0, Math.PI * 2);
    g.stroke();
    for (let p = 0; p < 8; p++) {
      const a = (p / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * cell * 0.3, cy + Math.sin(a) * cell * 0.3, cell * 0.05, 0, Math.PI * 2);
      g.fillStyle = (x + y + p) % 2 ? gold : '#1f3b4d';
      g.fill();
    }
  }
  return { size: [1.2, 1.2], canvas: c };
}

function glossBlack(): Drawn {
  const N = RES;
  return {
    size: [1.2, 1.2],
    canvas: pixels(N, N, (u, v) => {
      const sheen = Math.pow(Math.max(0, 1 - Math.abs(u - v) * 2.2), 6) * 0.25;
      const c: RGB = [22 + sheen * 120, 22 + sheen * 120, 28 + sheen * 130];
      return mix(scale(c, 0.6), c, inTile(u * 2 % 1, v * 2 % 1, 0.004));
    }),
  };
}

/**
 * Big glossy floor tiles, 1 m square, with clear grout lines (the Lagos
 * Life look: black or cream tiles you can count). Any colour. A soft
 * diagonal sheen on each tile fakes a polished finish.
 */
function bigTile(col: string): Drawn {
  const N = RES;
  const a = rgb(col);
  const lum = (a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11) / 255;
  const gr = lum < 0.35 ? scale(a, 1.0).map((v) => Math.min(255, v + 70)) as RGB : scale(a, 0.72);
  return {
    size: [2, 2],
    canvas: pixels(N, N, (u, v) => {
      const cx = Math.floor(u * 2), cy = Math.floor(v * 2);
      const fx = u * 2 - cx, fy = v * 2 - cy;
      let c = scale(a, 0.97 + hash(cx, cy, 41) * 0.06 + (fbm(u * 5, v * 5, 5, 3, 7) - 0.5) * 0.05);
      const sheen = Math.pow(Math.max(0, 1 - Math.abs(fx - fy - 0.1) * 3.2), 4) * (lum < 0.35 ? 0.35 : 0.12);
      c = c.map((v0) => Math.min(255, v0 + sheen * 120)) as RGB;
      return mix(gr, c, inTile(fx, fy, 0.012));
    }),
  };
}

/** Garden paving: grey-beige stones in a running bond (the path round the house). */
function paving(): Drawn {
  const N = RES;
  const cols: RGB[] = [rgb('#b8b0a2'), rgb('#a99f90'), rgb('#c4bcae'), rgb('#9d9486')];
  return {
    size: [1.6, 1.6],
    canvas: pixels(N, N, (u, v) => {
      const rows = 4, row = Math.floor(v * rows), fy = v * rows - row;
      const x = u * 3 + (row % 2) * 0.5, col = Math.floor(x), fx = x - col;
      let c = cols[Math.floor(hash(((col % 3) + 3) % 3, row, 5) * cols.length)];
      c = scale(c, 0.9 + fbm(u * 12, v * 12, 12, 3, row) * 0.2);
      return mix(rgb('#6f685d'), c, inTile(fx, fy, 0.05));
    }),
  };
}

function rubber(): Drawn {
  const N = Math.min(RES, 256);
  return {
    size: [1, 1],
    canvas: pixels(N, N, (u, v, x, y) => {
      const fleck = hash(x, y, 9) > 0.93 ? (hash(x, y, 10) > 0.5 ? 60 : 30) : 0;
      const b = 72 + fleck + (noise(u * 30, v * 30, 30, 2) - 0.5) * 12;
      const c: RGB = [b, b + 2, b + 10]; // slate, not black (Peter: "not dark and dead")
      return mix(scale(c, 0.55), c, inTile(u, v, 0.006));
    }),
  };
}

function grass(): Drawn {
  const N = RES;
  return {
    size: [2, 2],
    canvas: pixels(N, N, (u, v, x, y) => {
      const n = fbm(u * 6, v * 6, 6, 4, 3);
      let c = mix(rgb('#4f9447'), rgb('#7cba5c'), n);
      c = scale(c, 0.88 + hash(x, y, 2) * 0.2);
      // Mowing stripes.
      return scale(c, Math.floor(u * 4) % 2 ? 1.05 : 0.95);
    }),
  };
}

function asphalt(): Drawn {
  const N = RES;
  return {
    size: [2, 2],
    canvas: pixels(N, N, (u, v, x, y) => {
      const b = 62 + (hash(x, y, 4) - 0.5) * 30 + (fbm(u * 5, v * 5, 5, 3, 1) - 0.5) * 30;
      let c: RGB = [b, b, b + 3];
      // A tar crack or two.
      const crack = Math.abs(Math.sin(u * 9 + fbm(u * 4, v * 4, 4, 3, 8) * 5) - v * 0.3);
      if (crack < 0.012) c = scale(c, 0.55);
      return c;
    }),
  };
}

function drawFloor(id: string, color?: string): Drawn {
  switch (id) {
    case 'oak': case 'ash': case 'walnut': return planks(...WOODS[id]);
    case 'herringbone': return chevron();
    case 'parquet': return parquet();
    case 'marble': return marble('#f1eee9', '#9a9a9f', '#d8d4cc');
    case 'marbleBlack': return marble('#1c1c20', '#c9a55c', '#0d0d0f');
    case 'terrazzo': return terrazzo();
    case 'checker': return tiles('#f1efe9', '#1f2024', 2, 0.6, '#77746e');
    case 'tile': return tiles(color ?? '#e9ecef', null, 2, 0.6);
    case 'hex': return hexTiles(color ?? '#dfe7e6');
    case 'terracotta': return tiles('#b8603e', '#a9573a', 2, 0.6, '#d9c3a5');
    case 'concrete': return concrete(true);
    case 'carpet': return carpet(color ?? '#8d7b6a');
    case 'vinyl': return linoleum();
    case 'cosmic': return cosmicCarpet();
    case 'casinoCarpet': return casinoCarpet(color ?? '#7a1430');
    case 'glossBlack': return glossBlack();
    case 'bigTile': return bigTile(color ?? '#1e1e24');
    case 'paving': return paving();
    case 'rubber': return rubber();
    case 'grass': return grass();
    case 'asphalt': return asphalt();
    default: return planks(...WOODS.oak);
  }
}

// ---- walls ----------------------------------------------------------

/** Brick, running bond, 21 × 6.5 cm, a little rough. */
function brick(white: boolean, black = false): Drawn {
  const N = RES;
  const rows = 15, per = 5; // bricks in a 1 m tile
  const reds: RGB[] = black ? [rgb('#26262b'), rgb('#1e1e22'), rgb('#2e2d33')] : white ? [rgb('#ecebe6'), rgb('#e2e0d9'), rgb('#f3f2ee')] : [rgb('#9b4a33'), rgb('#86402d'), rgb('#a85a3c'), rgb('#7a3b2a')];
  const mortar = rgb(black ? '#121214' : white ? '#d6d3cb' : '#b9ad9c');
  return {
    size: [1, 1],
    canvas: pixels(N, N, (u, v) => {
      const row = Math.floor(v * rows);
      const fy = v * rows - row;
      const x = u * per + (row % 2) * 0.5;
      const col = Math.floor(x);
      const fx = x - col;
      let c = reds[Math.floor(hash(((col % per) + per) % per, row, 13) * reds.length)];
      c = scale(c, 0.85 + fbm(u * 30, v * 30, 30, 3, row) * 0.3);
      return mix(mortar, c, inTile(fx, fy, 0.045));
    }),
  };
}

function stripes(col: string): Drawn {
  const N = RES;
  const a = rgb(col), b = mix(rgb(col), [255, 255, 255], 0.55);
  return {
    size: [0.6, 1],
    canvas: pixels(N, 8, (u) => {
      const k = (u * 4) % 1;
      if (Math.abs(k - 0.5) < 0.012) return mix(a, [255, 255, 255], 0.2);
      return k < 0.5 ? a : b;
    }),
  };
}

/** A classic damask motif, drawn with curves, on a tone-on-tone ground. */
function damask(col: string): Drawn {
  const N = RES;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = col;
  g.fillRect(0, 0, N, N);
  const light = '#' + mix(rgb(col), [255, 255, 255], 0.28).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  g.fillStyle = light;
  const motif = (cx: number, cy: number, s: number) => {
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.beginPath();
    // A teardrop flower with leaves either side (mirrored).
    for (const m of [1, -1]) {
      g.moveTo(0, -40);
      g.bezierCurveTo(m * 26, -30, m * 30, 4, 0, 40);
      g.moveTo(0, 6);
      g.bezierCurveTo(m * 22, -2, m * 44, 10, m * 38, 30);
      g.bezierCurveTo(m * 26, 22, m * 14, 18, 0, 22);
    }
    g.fill();
    g.beginPath();
    g.arc(0, -50, 6, 0, Math.PI * 2);
    g.arc(0, 52, 5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  const s = N / 512;
  for (const [x, y] of [[0, 0], [N, 0], [0, N], [N, N], [N / 2, N / 2]]) motif(x, y, 1.6 * s);
  return { size: [0.7, 0.7], canvas: c };
}

/** Art deco fans in gold lines. */
function decoFans(col: string): Drawn {
  const N = RES;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = col;
  g.fillRect(0, 0, N, N);
  g.strokeStyle = '#c9a55c';
  g.lineWidth = Math.max(1.5, N / 220);
  const r = N / 4;
  for (let row = -1; row <= 4; row++) for (let k = -1; k <= 2; k++) {
    const cx = k * 2 * r + (row % 2 ? r : 0), cy = row * r;
    for (let ring = 1; ring <= 4; ring++) {
      g.beginPath();
      g.arc(cx, cy, (r * ring) / 4, Math.PI, Math.PI * 2);
      g.stroke();
    }
    for (let ray = 1; ray < 6; ray++) {
      const a = Math.PI + (ray / 6) * Math.PI;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.stroke();
    }
  }
  return { size: [0.8, 0.8], canvas: c };
}

/** Wainscot: framed panels up to a chair rail at 95 cm, paint above. Covers the whole height once. */
function panel(col: string): Drawn {
  const W = Math.min(RES, 256), H = Math.round(W * (2.9 / 1.2));
  const a = rgb(col);
  const rail = 1 - 0.95 / 2.9; // canvas y of the rail (y grows downwards)
  return {
    size: [1.2, 2.9],
    canvas: pixels(W, H, (u, v) => {
      if (v < rail - 0.012) return scale(a, 1.02);
      if (v < rail + 0.008) return scale(a, 1.18); // the rail catches the light
      // Below: one framed panel per tile.
      const fx = u, fy = (v - rail) / (1 - rail - 0.04);
      if (fy > 1) return scale(a, 0.85); // skirting shadow
      const outer = inTile(fx, fy, 0.09), inner = inTile(fx, fy, 0.12);
      const k = outer < 1 ? 0.93 : inner < 1 ? 1.12 : 0.97;
      return scale(a, k);
    }),
  };
}

function slats(col: string): Drawn {
  const N = RES;
  const a = rgb(col);
  return {
    size: [0.6, 1],
    canvas: pixels(N, 64, (u, v) => {
      const k = (u * 8) % 1;
      const c = scale(a, 0.92 + fbm(u * 40, v * 3, 1e9, 3, Math.floor(u * 8)) * 0.16);
      return k > 0.82 ? scale(c, 0.45) : c;
    }),
  };
}

function subway(col: string): Drawn {
  const N = RES;
  const a = rgb(col), gr = mix(rgb(col), [120, 118, 112], 0.45);
  const rows = 8, per = 4; // 15 × 7.5 cm in a 60 cm tile
  return {
    size: [0.6, 0.6],
    canvas: pixels(N, N, (u, v) => {
      const row = Math.floor(v * rows);
      const x = u * per + (row % 2) * 0.5;
      const fx = x - Math.floor(x), fy = v * rows - row;
      let c = scale(a, 0.97 + hash(Math.floor(x) % per, row, 3) * 0.05);
      c = scale(c, 1 + (0.5 - fy) * 0.06); // glazed bevel
      return mix(gr, c, inTile(fx, fy, 0.05));
    }),
  };
}

/** Plain paint: a whisper of roller texture so it doesn't read as flat plastic. */
function paint(col: string): Drawn {
  const N = 128;
  const a = rgb(col);
  return { size: [1, 1], canvas: pixels(N, N, (u, v) => scale(a, 0.975 + fbm(u * 8, v * 8, 8, 3, 5) * 0.05)) };
}


/** Dark wood panelling: tall raised panels with a moulding. */
function woodPanel(): Drawn {
  const W = Math.min(RES, 256), H = Math.round(W * (2.9 / 1.2));
  const a = rgb('#4a2f1f'), b = rgb('#2f1d13');
  return {
    size: [1.2, 2.9],
    canvas: pixels(W, H, (u, v) => {
      const grain = fbm(u * 8, v * 30, 1e9, 3, 4);
      let c = mix(a, b, 0.3 + grain * 0.4);
      const top = v < 0.08, rail = Math.abs(v - 0.62) < 0.015;
      if (top || rail) return scale(c, 1.25);
      const fy = v < 0.62 ? (v - 0.08) / 0.54 : (v - 0.64) / 0.33;
      const o = inTile(u, fy, 0.08), i = inTile(u, fy, 0.11);
      c = scale(c, o < 1 ? 0.8 : i < 1 ? 1.2 : 1);
      return c;
    }),
  };
}

/** Tufted velvet: buttoned diamonds. */
function velvet(col: string): Drawn {
  const N = Math.min(RES, 256);
  const a = rgb(col);
  return {
    size: [0.5, 0.5],
    canvas: pixels(N, N, (u, v) => {
      const x = u + v, y = u - v + 1;
      const fx = (x * 1) % 1, fy = (y * 1) % 1;
      const d = Math.hypot(fx - 0.5, fy - 0.5);
      let c = scale(a, 0.75 + (1 - d) * 0.45);
      if (Math.min(fx, 1 - fx, fy, 1 - fy) < 0.02) c = scale(a, 0.55);
      if (Math.hypot(u - 0.5, v) < 0.04 || Math.hypot(u, v - 0.5) < 0.04 || Math.hypot(u - 1, v - 0.5) < 0.04 || Math.hypot(u - 0.5, v - 1) < 0.04) c = scale(a, 0.4);
      return c;
    }),
  };
}

function acoustic(col: string): Drawn {
  const N = Math.min(RES, 256);
  const a = rgb(col);
  return {
    size: [0.6, 0.6],
    canvas: pixels(N, N, (u, v) => {
      const cx = Math.floor(u * 2), cy = Math.floor(v * 2);
      const f = (cx + cy) % 2 ? (u * 2) % 1 : (v * 2) % 1;
      const wedge = Math.abs(((f * 4) % 1) - 0.5) * 2;
      return scale(a, 0.65 + wedge * 0.5);
    }),
  };
}

function hedge(): Drawn {
  const N = RES;
  return {
    size: [1.2, 1.2],
    canvas: pixels(N, N, (u, v, x, y) => {
      const n = fbm(u * 10, v * 10, 10, 4, 6);
      const leaf = hash(x >> 2, y >> 2, 3);
      return scale(mix(rgb('#2f5e2e'), rgb('#5c9a45'), n), 0.8 + leaf * 0.35);
    }),
  };
}

/** A rooftop's glass railing: pale glass panels between steel posts, a steel cap on top. */
function glassRail(): Drawn {
  const N = Math.min(RES, 256);
  const glass = rgb('#cfe3ee'), post = rgb('#8a939e');
  return {
    size: [1.2, 1.2],
    canvas: pixels(N, N, (u, v) => {
      if (u < 0.04) return post;
      if (v < 0.06) return scale(post, 1.1);
      const sheen = Math.pow(Math.max(0, 1 - Math.abs(u - v * 0.6 - 0.3) * 4), 3) * 0.25;
      return scale(glass, 0.92 + sheen);
    }),
  };
}

function drawWall(id: string, color?: string): Drawn {
  switch (id) {
    case 'brick': return brick(false);
    case 'whiteBrick': return brick(true);
    case 'stripes': return stripes(color ?? '#3f6f5e');
    case 'damask': return damask(color ?? '#7c3b4e');
    case 'geo': return decoFans(color ?? '#1f3b4d');
    case 'panel': return panel(color ?? '#2f4858');
    case 'slats': return slats(color ?? '#b07d4f');
    case 'subway': return subway(color ?? '#f4f4f2');
    case 'marbleWall': return marble('#efebe4', '#a39f97', '#d6d1c8', 1);
    case 'concreteWall': return concrete(true, true);
    case 'glassRail': return glassRail();
    case 'woodPanel': return woodPanel();
    case 'velvet': return velvet(color ?? '#5b2a86');
    case 'darkBrick': return brick(false, true);
    case 'acoustic': return acoustic(color ?? '#2b2d42');
    case 'hedge': return hedge();
    default: return paint(color ?? '#efe6da');
  }
}

// ---- materials (cached) ---------------------------------------------

const cache = new Map<string, THREE.MeshLambertMaterial>();
let anisotropy = 4;
export function setHomeAnisotropy(n: number): void {
  anisotropy = n;
}

function material(key: string, draw: () => Drawn): THREE.MeshLambertMaterial {
  let m = cache.get(key);
  if (m) return m;
  const d = draw();
  const tex = new THREE.CanvasTexture(d.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  // UVs are in metres: one texture tile per `size` metres.
  tex.repeat.set(1 / d.size[0], 1 / d.size[1]);
  m = new THREE.MeshLambertMaterial({ map: tex });
  m.name = key;
  cache.set(key, m);
  return m;
}

/** The material for a floor style string ('oak', 'carpet:#7b5ea7'). */
export function floorMaterial(style: string): THREE.MeshLambertMaterial {
  const { id, color } = parseStyle(style);
  const def = floorStyle(id);
  const col = def?.tint ? color ?? def.color : undefined;
  return material(`floor:${def ? id : 'oak'}:${col ?? ''}`, () => drawFloor(def ? id : 'oak', col));
}

/** The material for a wall style string ('paint:#f3e3d0', 'brick'). */
export function wallMaterial(style: string): THREE.MeshLambertMaterial {
  const { id, color } = parseStyle(style);
  const def = wallStyle(id);
  const col = def?.tint ? color ?? def.color : undefined;
  return material(`wall:${def ? id : 'paint'}:${col ?? ''}`, () => drawWall(def ? id : 'paint', col));
}

/** A small swatch image of a style, for the design menu (data URL). */
export function swatchURL(kind: 'floor' | 'wall', style: string, px = 72): string {
  const m = kind === 'floor' ? floorMaterial(style) : wallMaterial(style);
  const src = (m.map as THREE.CanvasTexture).image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const pat = g.createPattern(src, 'repeat')!;
  // Show about 0.8 m of the surface.
  const k = px / (0.8 * src.width * (m.map!.repeat.x));
  pat.setTransform(new DOMMatrix().scale(k, k));
  g.fillStyle = pat;
  g.fillRect(0, 0, px, px);
  return c.toDataURL();
}
