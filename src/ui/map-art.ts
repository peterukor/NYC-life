// =====================================================================
// map-art.ts — paints the 2D map like an illustrated city map instead of
// a grid: wobbly coastline with sand and waves, piers and boats, little
// buildings with roofs, walls and shadows (taller downtown), parks with
// winding paths, trees and a pond, plazas, dashed road lines, big
// neighbourhood names, and a compass. All seeded, so it never flickers.
//
// Used by ui/map.ts. Everything is drawn from layout.ts, so it always
// matches the 3D city. Pure drawing: no state.
// =====================================================================

import { Rng } from '../core/rng.ts';
import { avenueX, blockRect, districtBounds, streetZ, type DistrictDef } from '../world/layout.ts';
import type { AreaId } from '../sim/types.ts';
import { landShape, pointInPoly } from '../world/coast.ts';

export interface View {
  sx: (x: number) => number;
  sy: (z: number) => number;
  scale: number;
  w: number;
  h: number;
}

/** Big, airy neighbourhood names (block coordinates; fractions allowed). */
const HOODS: Record<AreaId, { text: string; c: number; r: number }[]> = {
  manhattan: [
    { text: 'CENTRAL PARK', c: 2.5, r: 0.55 },
    { text: 'UPPER WEST SIDE', c: 2.6, r: 2.05 },
    { text: 'HELL’S KITCHEN', c: 1.0, r: 5.2 },
    { text: 'MIDTOWN', c: 4.4, r: 7.6 },
    { text: 'GARMENT DISTRICT', c: 3.2, r: 10.4 },
    { text: 'HUDSON YARDS', c: 0.5, r: 10.0 },
  ],
  brooklyn: [
    { text: 'DUMBO', c: 1.5, r: 0.5 },
    { text: 'DOWNTOWN', c: 2.4, r: 2.2 },
    { text: 'FORT GREENE', c: 3.6, r: 4.6 },
    { text: 'BOERUM HILL', c: 1.2, r: 5.6 },
  ],
};

const ROOFS = {
  brownstone: ['#d98c6c', '#c9735a', '#e0a37e', '#b8644e', '#e6b48f'],
  midrise: ['#e8c9a0', '#d6b38a', '#cdb9a2', '#e3d3bb', '#c99f7a'],
  tall: ['#a9c6e8', '#c3d3e6', '#9fb4cf', '#d7dde6', '#b7c2d6', '#e3e7ee'],
  waterfront: ['#c9b79c', '#bfae94', '#d8c8ab'],
};

/** Darken a #rrggbb colour by k (0–1). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + q, y);
  g.arcTo(x + w, y, x + w, y + h, q);
  g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q);
  g.arcTo(x, y, x + w, y, q);
  g.closePath();
}

/** The coastline wobble (metres) at position t along the shore. */
const wobble = (t: number) => Math.sin(t * 0.021) * 7 + Math.sin(t * 0.063 + 1.3) * 3.5 + Math.sin(t * 0.17) * 1.2;

export function drawBase(g: CanvasRenderingContext2D, d: DistrictDef, v: View): void {
  const { sx, sy, scale, w, h } = v;
  const b0 = districtBounds(d, 0);
  const rng = new Rng(`map-${d.id}`);

  // ---- Water with an organic shoreline ----
  g.fillStyle = '#8fd0f0';
  g.fillRect(0, 0, w, h);
  // The borough's real-ish outline (world/coast.ts), same as the 3D city.
  const poly = landShape(d);
  const land = () => {
    g.beginPath();
    poly.forEach((p, i) => (i ? g.lineTo(sx(p.x), sy(p.z)) : g.moveTo(sx(p.x), sy(p.z))));
    g.closePath();
  };
  // Shallow-water glow, sand, then land.
  land();
  g.lineJoin = 'round';
  g.strokeStyle = '#b8e4f7';
  g.lineWidth = Math.max(10, 22 * scale);
  g.stroke();
  g.strokeStyle = '#f3e3b5';
  g.lineWidth = Math.max(4, 7 * scale);
  g.stroke();
  g.fillStyle = '#f2ebdd';
  g.fill();
  // Beyond the playable streets: a soft field of far-off blocks.
  g.save();
  land();
  g.clip();
  g.fillStyle = 'rgba(190,175,150,0.22)';
  const fr = new Rng(`far-${d.id}`);
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  for (let x = Math.min(...xs); x < Math.max(...xs); x += 46) {
    for (let z = Math.min(...zs); z < Math.max(...zs); z += 30) {
      if (x > b0.minX - 30 && x < b0.maxX + 30 && z > b0.minZ - 30 && z < b0.maxZ + 30) continue;
      if (fr.chance(0.1)) continue;
      rr(g, sx(x), sy(z), 34 * scale, 20 * scale, 3 * scale);
      g.fill();
    }
  }
  g.restore();

  // Waves: little white "smiles" scattered on the water.
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = Math.max(1.2, 1.6 * Math.min(2, scale));
  g.lineCap = 'round';
  const wr = new Rng(`waves-${d.id}`);
  for (let i = 0; i < 70; i++) {
    const along = wr.range(-300, 300) + (d.water.side === 'west' ? (b0.minZ + b0.maxZ) / 2 : (b0.minX + b0.maxX) / 2);
    const off = wr.range(25, 260);
    const [wx, wz] = d.water.side === 'west' ? [avenueX(d, 0) - off + wobble(along), along] : [along, streetZ(d, 0) - off + wobble(along)];
    if (pointInPoly(wx, wz, poly)) continue;
    const r = 5 * scale;
    g.beginPath();
    g.arc(sx(wx), sy(wz), r, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  }
  // Piers along the shore, and a couple of boats.
  for (let k = 0; k < 7; k++) {
    if (d.water.side === 'west') {
      const z = b0.minZ + 120 + k * ((b0.maxZ - b0.minZ - 160) / 6);
      const x = avenueX(d, 0) - d.avenueW / 2 - 6 + wobble(z);
      g.fillStyle = '#d8cdb8';
      rr(g, sx(x - 46), sy(z - 5), 46 * scale, 10 * scale, 2 * scale);
      g.fill();
      g.strokeStyle = 'rgba(80,70,50,0.25)';
      g.lineWidth = 1;
      g.stroke();
    }
  }
  for (let k = 0; k < 3; k++) {
    const along = (d.water.side === 'west' ? b0.minZ : b0.minX) + 200 + k * 380;
    const off = 90 + k * 40;
    const [bx, bz] = d.water.side === 'west' ? [avenueX(d, 0) - off, along] : [along, streetZ(d, 0) - off];
    boat(g, sx(bx), sy(bz), scale, d.water.side === 'west' ? Math.PI / 2 : 0);
  }

  // ---- Roads: the land between blocks ----
  g.fillStyle = '#fffdf8';
  rr(g, sx(b0.minX - 2), sy(b0.minZ - 2), (b0.maxX - b0.minX + 4) * scale, (b0.maxZ - b0.minZ + 4) * scale, 6 * scale);
  g.fill();
  // Avenue centre lines when zoomed in.
  if (scale > 1.1) {
    g.strokeStyle = 'rgba(240,190,60,0.55)';
    g.lineWidth = Math.max(1, 0.5 * scale);
    g.setLineDash([6 * scale, 5 * scale]);
    for (let i = 0; i <= d.cols; i++) {
      g.beginPath();
      g.moveTo(sx(avenueX(d, i)), sy(b0.minZ));
      g.lineTo(sx(avenueX(d, i)), sy(b0.maxZ));
      g.stroke();
    }
    g.setLineDash([]);
  }

  // ---- Blocks ----
  for (let c = 0; c < d.cols; c++) {
    for (let r = 0; r < d.rows; r++) {
      const b = blockRect(d, c, r);
      const kind = d.kind(c, r);
      const zone = d.zone(c, r);
      const x = sx(b.minX);
      const y = sy(b.minZ);
      const bw = (b.maxX - b.minX) * scale;
      const bh = (b.maxZ - b.minZ) * scale;
      // Sidewalk slab.
      g.fillStyle = kind === 'park' ? '#d9ecc6' : '#e9e1d2';
      rr(g, x, y, bw, bh, Math.min(6, 3 * scale));
      g.fill();
      const inset = 3 * scale;
      if (kind === 'park') park(g, b, sx, sy, scale, new Rng(`park-${d.id}-${c}-${r}`), inset);
      else if (kind === 'plaza') plaza(g, b, sx, sy, scale, new Rng(`plaza-${d.id}-${c}-${r}`), inset);
      else if (kind === 'vacant') {
        g.fillStyle = '#e8d6b6';
        rr(g, x + inset, y + inset, bw - inset * 2, bh - inset * 2, 3 * scale);
        g.fill();
        g.save();
        g.clip();
        g.strokeStyle = 'rgba(140,110,70,0.2)';
        g.lineWidth = 2;
        for (let k = -bh; k < bw; k += 9) {
          g.beginPath();
          g.moveTo(x + k, y);
          g.lineTo(x + k + bh, y + bh);
          g.stroke();
        }
        g.restore();
        crane(g, x + bw * 0.6, y + bh * 0.5, scale);
      } else buildings(g, b, sx, sy, scale, zone, new Rng(`bld-${d.id}-${c}-${r}`));
    }
  }
  void rng;
}

/** Little buildings with a roof, a sunny south wall and a soft shadow. */
function buildings(g: CanvasRenderingContext2D, b: { minX: number; maxX: number; minZ: number; maxZ: number }, sx: (x: number) => number, sy: (z: number) => number, s: number, zone: keyof typeof ROOFS, rng: Rng): void {
  const pal = ROOFS[zone];
  const tallK = zone === 'tall' ? 1 : zone === 'midrise' ? 0.55 : 0.35;
  const pad = 4;
  const midZ = (b.minZ + b.maxZ) / 2;
  const rows: [number, number][] = [[b.minZ + pad, midZ - 1], [midZ + 1, b.maxZ - pad]];
  const lots: { x0: number; x1: number; z0: number; z1: number; hgt: number; color: string }[] = [];
  for (const [z0, z1] of rows) {
    let x = b.minX + pad;
    while (x < b.maxX - pad - 4) {
      const wdt = Math.min(b.maxX - pad - x, rng.range(zone === 'tall' ? 14 : 8, zone === 'tall' ? 26 : 15));
      const hgt = (rng.range(2.5, 5) + (zone === 'tall' ? rng.range(3, 9) : 0)) * tallK * 1.6;
      lots.push({ x0: x, x1: x + wdt - 0.8, z0, z1, hgt, color: rng.pick(pal) });
      x += wdt;
    }
  }
  // Shadows first (down-right), then walls, then roofs.
  g.fillStyle = 'rgba(60,50,40,0.13)';
  for (const l of lots) {
    const o = l.hgt * s * 0.9;
    rr(g, sx(l.x0) + o * 0.6, sy(l.z0) + o, (l.x1 - l.x0) * s, (l.z1 - l.z0) * s, 2 * s);
    g.fill();
  }
  for (const l of lots) {
    const o = l.hgt * s;
    const x = sx(l.x0);
    const wdt = (l.x1 - l.x0) * s;
    const top = sy(l.z0) - o;
    const dep = (l.z1 - l.z0) * s;
    // South wall (the side facing you).
    g.fillStyle = shade(l.color, 0.28);
    rr(g, x, top + dep * 0.5, wdt, dep * 0.5 + o, 1.5 * s);
    g.fill();
    // Windows on the wall when zoomed in.
    if (s > 1.4 && o > 4) {
      g.fillStyle = 'rgba(255,255,255,0.45)';
      for (let wy = top + dep + 2 * s; wy < top + dep + o - 2 * s; wy += 3 * s) for (let wx = x + 1.5 * s; wx < x + wdt - 1.5 * s; wx += 3 * s) g.fillRect(wx, wy, 1.4 * s, 1.4 * s);
    }
    // Roof.
    g.fillStyle = l.color;
    rr(g, x, top, wdt, dep, 1.5 * s);
    g.fill();
    g.strokeStyle = 'rgba(60,50,40,0.18)';
    g.lineWidth = 1;
    g.stroke();
    // Rooftop bits: water tower or AC box.
    if (s > 0.8 && rng.chance(0.35)) {
      g.fillStyle = shade(l.color, 0.15);
      rr(g, x + wdt * 0.3, top + dep * 0.25, Math.max(2, wdt * 0.25), Math.max(2, dep * 0.3), 1);
      g.fill();
    }
  }
}

function park(g: CanvasRenderingContext2D, b: { minX: number; maxX: number; minZ: number; maxZ: number }, sx: (x: number) => number, sy: (z: number) => number, s: number, rng: Rng, inset: number): void {
  const x = sx(b.minX) + inset;
  const y = sy(b.minZ) + inset;
  const w = (b.maxX - b.minX) * s - inset * 2;
  const h = (b.maxZ - b.minZ) * s - inset * 2;
  g.fillStyle = '#a6d982';
  rr(g, x, y, w, h, 5 * s);
  g.fill();
  g.save();
  g.clip();
  // Winding paths.
  g.strokeStyle = '#f3ead2';
  g.lineWidth = Math.max(1.5, 2.2 * s);
  g.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    g.moveTo(x - 4, y + h * rng.range(0.2, 0.8));
    g.bezierCurveTo(x + w * 0.3, y + h * rng.range(-0.2, 1.2), x + w * 0.7, y + h * rng.range(-0.2, 1.2), x + w + 4, y + h * rng.range(0.2, 0.8));
    g.stroke();
  }
  // A pond in bigger parks.
  if (w > 120 * s * 0.5 && rng.chance(0.6)) {
    g.fillStyle = '#8fd0f0';
    g.beginPath();
    g.ellipse(x + w * rng.range(0.3, 0.7), y + h * 0.5, w * 0.12, h * 0.22, rng.range(-0.4, 0.4), 0, Math.PI * 2);
    g.fill();
  }
  // Trees: shadow + crown + highlight.
  const n = Math.round((w * h) / (s * s * 55));
  for (let i = 0; i < Math.min(n, 60); i++) {
    const tx = x + rng.range(0.04, 0.96) * w;
    const ty = y + rng.range(0.06, 0.94) * h;
    const r = rng.range(2.4, 4.2) * s;
    g.fillStyle = 'rgba(40,80,30,0.2)';
    g.beginPath();
    g.arc(tx + r * 0.35, ty + r * 0.4, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rng.pick(['#5fae4f', '#6dbb57', '#4f9e45', '#79c25f']);
    g.beginPath();
    g.arc(tx, ty, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.arc(tx - r * 0.3, ty - r * 0.3, r * 0.45, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function plaza(g: CanvasRenderingContext2D, b: { minX: number; maxX: number; minZ: number; maxZ: number }, sx: (x: number) => number, sy: (z: number) => number, s: number, rng: Rng, inset: number): void {
  const x = sx(b.minX) + inset;
  const y = sy(b.minZ) + inset;
  const w = (b.maxX - b.minX) * s - inset * 2;
  const h = (b.maxZ - b.minZ) * s - inset * 2;
  g.fillStyle = '#fbe3a0';
  rr(g, x, y, w, h, 4 * s);
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(200,150,60,0.18)';
  g.lineWidth = 1;
  for (let k = 0; k < w; k += 6 * s) {
    g.beginPath();
    g.moveTo(x + k, y);
    g.lineTo(x + k, y + h);
    g.stroke();
  }
  // Bright dots: umbrellas, food carts, screens.
  for (let i = 0; i < 14; i++) {
    g.fillStyle = rng.pick(['#ff5d8f', '#3a86ff', '#ffbe0b', '#06d6a0', '#ff006e']);
    g.beginPath();
    g.arc(x + rng.range(0.05, 0.95) * w, y + rng.range(0.1, 0.9) * h, rng.range(1.2, 2.4) * s, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function boat(g: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.moveTo(-26, 0);
  g.lineTo(-12, -3);
  g.lineTo(-12, 3);
  g.fill(); // wake
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#41506b';
  g.lineWidth = 1.2 / s;
  g.beginPath();
  g.moveTo(-10, -4);
  g.lineTo(8, -4);
  g.quadraticCurveTo(14, 0, 8, 4);
  g.lineTo(-10, 4);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#ff7b54';
  g.fillRect(-5, -2.2, 7, 4.4);
  g.restore();
}

function crane(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.save();
  g.strokeStyle = '#f2b705';
  g.lineWidth = Math.max(1.5, 1.6 * s);
  g.beginPath();
  g.moveTo(x, y + 10 * s);
  g.lineTo(x, y - 14 * s);
  g.lineTo(x + 18 * s, y - 14 * s);
  g.moveTo(x - 6 * s, y - 14 * s);
  g.lineTo(x, y - 14 * s);
  g.moveTo(x + 14 * s, y - 14 * s);
  g.lineTo(x + 14 * s, y - 6 * s);
  g.stroke();
  g.restore();
}

/** Big, spaced-out neighbourhood names. */
export function drawHoods(g: CanvasRenderingContext2D, d: DistrictDef, v: View): void {
  if (v.scale > 2.4) return;
  const size = Math.max(10, Math.min(18, 9 * v.scale));
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${size}px Nunito, system-ui, sans-serif`;
  for (const hd of HOODS[d.id] ?? []) {
    const x = v.sx(avenueX(d, 0) + (hd.c + 0.5) * (d.blockW + d.avenueW));
    const y = v.sy(streetZ(d, 0) + (hd.r + 0.5) * (d.blockD + d.streetW));
    const spaced = hd.text.split('').join(' ');
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,253,248,0.85)';
    g.strokeText(spaced, x, y);
    g.fillStyle = 'rgba(70,64,90,0.55)';
    g.fillText(spaced, x, y);
  }
  g.restore();
}

/** A small compass rose in the corner. */
export function drawCompass(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.strokeStyle = '#1c2340';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 17, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#e63946';
  g.beginPath();
  g.moveTo(0, -13);
  g.lineTo(5, 0);
  g.lineTo(-5, 0);
  g.fill();
  g.fillStyle = '#9aa3b5';
  g.beginPath();
  g.moveTo(0, 13);
  g.lineTo(5, 0);
  g.lineTo(-5, 0);
  g.fill();
  g.fillStyle = '#1c2340';
  g.font = '900 9px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('N', 0, -20);
  g.restore();
}
