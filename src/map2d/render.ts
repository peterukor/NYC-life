// =====================================================================
// map2d/render.ts — draws the 2D cartoon map on a <canvas>.
//
// Peter, 2026-10-12: no more 3D. The city is a flat, cartoon map seen
// from above at a slight tilt (three-quarter view): you see the roofs and
// the south-facing fronts of buildings, like a board game or Pokémon town.
//
// Layers (each from the map builders in scripts/map/):
//   land & water  → <borough>.json   (land, waterfront, islands)
//   roads, blocks → <borough>.json   (road surface, centre lines, blocks, plazas)
//   on the blocks → <borough>-city.json (buildings, lawns, trees, lamps, lakes)
//
// Cheap on purpose (Android phones from 2021): every shape is turned into
// a Path2D ONCE, in world metres; a frame only sets the camera transform
// and fills the paths whose box is on screen. Nothing is drawn twice and
// no frame is drawn unless the camera moved.
//
// World: x = east, z = south, metres. Screen y grows with z. A building
// of height h has its roof drawn TILT·h metres higher up the screen.
// =====================================================================

export interface BaseMap {
  land: number[][][];
  islands: { name: string; poly: number[][][] }[];
  waterfront: number[][][][];
  shoreRoad: { w: number; loops: number[][][] };
  roads: { id: string; name: string; kind: string; w: number; pts: number[][] }[];
  roadSurface: number[][][][];
  blocks: { id: string; kind: string; area: number; center: number[]; poly: number[][]; holes?: number[][][]; name?: string }[];
  plazas: { poly: number[][]; area: number }[];
}

export interface CityLayer {
  buildings: { p: number[][]; h: number; k: string; w: string; r: string; b: string }[];
  lawns: number[][][][];
  trees: number[][];
  lamps: number[][];
  lakes: number[][][];
  paths: number[][][];
  /** Zebra crossings: [x0, z0, x1, z1] across the road. */
  crossings: number[][];
}

export interface Label {
  text: string;
  x: number;
  z: number;
  size: number;
  /** Only shown when zoomed out further than this (px per metre). */
  maxScale: number;
}

/** How far up the screen one metre of height goes (the three-quarter tilt). */
export const TILT = 0.55;

const C = {
  water: '#7cc8ec',
  waterDeep: '#68b9e2',
  wave: 'rgba(255,255,255,0.55)',
  foam: '#e8f7fd',
  shore: '#a5dc7c',
  shoreEdge: '#7fbf5d',
  road: '#6f7585',
  roadEdge: '#5a6070',
  centre: '#f6d35b',
  sidewalk: '#ebe3d3',
  kerb: '#bfb4a0',
  lawn: '#97d56c',
  lawnEdge: '#78b552',
  park: '#8ed166',
  parkEdge: '#6fae4c',
  path: '#efe0bd',
  plaza: '#f1e2c6',
  plazaEdge: '#d6c39f',
  ink: '#2c2f3a',
  shadow: 'rgba(36, 48, 74, 0.20)',
};
const TREE = [
  ['#4fae4a', '#3b8f3a', '#7fd06b'],
  ['#3f9a4d', '#2f7a3c', '#68bf6a'],
  ['#f29bbd', '#d77aa0', '#ffc3d8'],
  ['#5bb552', '#44923f', '#8ad877'],
];

type Box = { x0: number; z0: number; x1: number; z1: number };
type Thing = { box: Box; z: number; draw: (g: CanvasRenderingContext2D, s: number) => void };

function polyPath(p: Path2D, pts: number[][], dz = 0): void {
  p.moveTo(pts[0][0], pts[0][1] - dz);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1] - dz);
  p.closePath();
}

function boxOf(pts: number[][], pad = 0, up = 0): Box {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0: x0 - pad, z0: z0 - pad - up, x1: x1 + pad, z1: z1 + pad };
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** A stable 0..1 number from a seed (decoration that never flickers). */
function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class MapRenderer {
  /** Colours that change with the time of day (map2d/daylight.ts). */
  palette = { water: C.water };
  private ground: { path: Path2D; fill?: string; stroke?: string; width?: number; rule?: CanvasFillRule; box: Box; dash?: number[]; cap?: CanvasLineCap }[] = [];
  private things: Thing[] = [];
  readonly bounds: Box;

  constructor(
    readonly base: BaseMap,
    readonly city: CityLayer,
    readonly labels: Label[] = [],
  ) {
    const all = base.land.flat();
    this.bounds = boxOf(all, 60);
    this.buildGround();
    this.buildThings();
  }

  // ------------------------------------------------------------ setup
  private add(path: Path2D, pts: number[][], o: { fill?: string; stroke?: string; width?: number; rule?: CanvasFillRule; dash?: number[]; cap?: CanvasLineCap }): void {
    this.ground.push({ path, box: boxOf(pts, (o.width ?? 0) + 2), ...o });
  }

  private buildGround(): void {
    const b = this.base;
    // Foam line round every shore, then the land itself.
    for (const ring of [...b.land, ...b.islands.flatMap((i) => i.poly)]) {
      const p = new Path2D();
      polyPath(p, ring);
      this.add(p, ring, { stroke: C.foam, width: 7 });
      this.add(p, ring, { fill: C.shore, stroke: C.shoreEdge, width: 1.2 });
    }
    // Road surface (one shape full of holes where the blocks are).
    for (const rings of b.roadSurface) {
      const p = new Path2D();
      for (const r of rings) polyPath(p, r);
      this.add(p, rings[0], { fill: C.road, rule: 'evenodd' });
    }
    // Lane markings: dashed yellow on avenues and streets, white on the shore road.
    for (const r of b.roads) {
      const p = new Path2D();
      p.moveTo(r.pts[0][0], r.pts[0][1]);
      for (const q of r.pts.slice(1)) p.lineTo(q[0], q[1]);
      this.add(p, r.pts, { stroke: C.centre, width: 0.8, dash: [5, 5] });
    }
    for (const loop of b.shoreRoad.loops) {
      const p = new Path2D();
      p.moveTo(loop[0][0], loop[0][1]);
      for (const q of loop.slice(1)) p.lineTo(q[0], q[1]);
      this.add(p, loop, { stroke: '#f4f4f0', width: 0.7, dash: [6, 6] });
    }
    // Blocks: sidewalk colour (lawns and buildings go on top), parks green.
    for (const bl of b.blocks) {
      const p = new Path2D();
      polyPath(p, bl.poly);
      for (const h of bl.holes ?? []) polyPath(p, h);
      const park = bl.kind === 'park';
      this.add(p, bl.poly, { fill: park ? C.park : C.sidewalk, stroke: park ? C.parkEdge : C.kerb, width: park ? 1.5 : 1.2, rule: 'evenodd' });
    }
    for (const pz of b.plazas) {
      const p = new Path2D();
      polyPath(p, pz.poly);
      this.add(p, pz.poly, { fill: C.plaza, stroke: C.plazaEdge, width: 1 });
    }
    const c = this.city;
    for (const rings of c.lawns) {
      const p = new Path2D();
      for (const r of rings) polyPath(p, r);
      this.add(p, rings[0], { fill: C.lawn, stroke: C.lawnEdge, width: 0.8, rule: 'evenodd' });
    }
    // Zebra crossings: a thick white line across the road, dashed into stripes.
    {
      const p = new Path2D();
      const pts: number[][] = [];
      for (const [x0, z0, x1, z1] of c.crossings ?? []) {
        p.moveTo(x0, z0);
        p.lineTo(x1, z1);
        pts.push([x0, z0], [x1, z1]);
      }
      if (pts.length) {
        // One path for all of them is fast but has a huge box; split into a grid of chunks instead.
        const chunks = new Map<string, { p: Path2D; pts: number[][] }>();
        for (const [x0, z0, x1, z1] of c.crossings ?? []) {
          const k = `${Math.floor(x0 / 300)},${Math.floor(z0 / 300)}`;
          let ch = chunks.get(k);
          if (!ch) chunks.set(k, (ch = { p: new Path2D(), pts: [] }));
          ch.p.moveTo(x0, z0);
          ch.p.lineTo(x1, z1);
          ch.pts.push([x0, z0], [x1, z1]);
        }
        for (const ch of chunks.values()) this.add(ch.p, ch.pts, { stroke: '#f7f7f2', width: 3.2, dash: [0.9, 0.9], cap: 'butt' });
      }
    }
    for (const loop of c.paths) {
      const p = new Path2D();
      polyPath(p, loop);
      this.add(p, loop, { stroke: C.path, width: 3.2 });
    }
    for (const lake of c.lakes) {
      const p = new Path2D();
      polyPath(p, lake);
      this.add(p, lake, { stroke: '#d9cfa8', width: 3 });
      this.add(p, lake, { fill: C.water, stroke: '#5aa9d1', width: 1 });
    }
  }

  private buildThings(): void {
    const c = this.city;
    // ---- buildings: shadow, visible walls, roof, windows, all as world-space paths
    for (const bd of c.buildings) {
      const pts = bd.p;
      const h = bd.h;
      const up = h * TILT;
      const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
      const cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      // Shadow on the ground (sun from the north-west): footprint swept south-east.
      const sh = new Path2D();
      const off = [h * 0.32, h * 0.12];
      const hull = convexHull([...pts, ...pts.map(([x, z]) => [x + off[0], z + off[1]])]);
      polyPath(sh, hull);
      // Walls that face the viewer (south-ish).
      const walls: { path: Path2D; color: string }[] = [];
      const win = new Path2D();
      const floors = Math.max(1, Math.round(h / 4.2));
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        let nx = b[1] - a[1], nz = -(b[0] - a[0]);
        const L = Math.hypot(nx, nz) || 1;
        nx /= L;
        nz /= L;
        if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0) {
          nx = -nx;
          nz = -nz;
        }
        if (nz <= 0.02) continue; // faces away from us
        const w = new Path2D();
        w.moveTo(a[0], a[1]);
        w.lineTo(b[0], b[1]);
        w.lineTo(b[0], b[1] - up);
        w.lineTo(a[0], a[1] - up);
        w.closePath();
        walls.push({ path: w, color: shade(bd.w, 0.78 + 0.2 * nz - 0.12 * Math.abs(nx)) });
        // Windows: a grid on the wall (skipped when zoomed far out).
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const cols = Math.max(1, Math.floor(len / (bd.k === 'brownstone' ? 3.6 : 4.4)));
        const fH = up / floors;
        const glassy = bd.k === 'glass';
        for (let f = 0; f < floors; f++) {
          const y0 = f * fH + fH * (glassy ? 0.12 : 0.3);
          const y1 = (f + 1) * fH - fH * (glassy ? 0.12 : 0.25);
          if (glassy) {
            // Glass towers: one long band per floor.
            const t0 = 0.06, t1 = 0.94;
            win.moveTo(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 - y0);
            win.lineTo(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1 - y0);
            win.lineTo(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1 - y1);
            win.lineTo(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 - y1);
            win.closePath();
            continue;
          }
          for (let k = 0; k < cols; k++) {
            const t0 = (k + 0.28) / cols, t1 = (k + 0.72) / cols;
            win.moveTo(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 - y0);
            win.lineTo(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1 - y0);
            win.lineTo(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1 - y1);
            win.lineTo(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 - y1);
            win.closePath();
          }
        }
      }
      const roof = new Path2D();
      polyPath(roof, pts, up);
      // Parapet: a ring just inside the roof edge.
      const inset = new Path2D();
      const k = 0.86;
      polyPath(inset, pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]), up);
      // Roof bits: an AC box on big roofs, a water tower on walk-ups.
      const bits = new Path2D();
      const bitFill: string[] = [];
      const tall = bd.k === 'glass' || bd.k === 'office' || bd.k === 'deco';
      if (bd.k === 'walkup' || bd.k === 'prewar') {
        const r = 1.6;
        bits.ellipse(cx + 2, cz - up - 3.2, r, r * 0.8, 0, 0, Math.PI * 2);
        bitFill.push('#9a6440');
      } else if (tall) {
        bits.rect(cx - 3, cz - up - 3.5, 6, 4);
        bitFill.push('#d7dbe2');
      }
      const winColor = bd.k === 'glass' ? 'rgba(220,240,255,0.55)' : bd.k === 'office' || bd.k === 'deco' ? '#9fc6df' : '#bfe0f2';
      const edge = shade(bd.w, 0.45);
      const box = boxOf(pts, 2, up + 6);
      box.x1 = Math.max(box.x1, Math.max(...hull.map((q) => q[0])));
      box.z1 = Math.max(box.z1, Math.max(...hull.map((q) => q[1])));
      this.things.push({
        box,
        z: Math.max(...pts.map((q) => q[1])),
        draw: (g, s) => {
          g.fillStyle = C.shadow;
          g.fill(sh);
          g.lineJoin = 'round';
          for (const w of walls) {
            g.fillStyle = w.color;
            g.fill(w.path);
          }
          if (s > 0.55) {
            g.fillStyle = winColor;
            g.fill(win);
          }
          for (const w of walls) {
            g.strokeStyle = edge;
            g.lineWidth = 1.1 / s;
            g.stroke(w.path);
          }
          g.fillStyle = bd.r;
          g.fill(roof);
          g.strokeStyle = edge;
          g.lineWidth = 1.3 / s;
          g.stroke(roof);
          if (s > 0.35) {
            g.strokeStyle = shade(bd.r, 1.25);
            g.lineWidth = 1 / s;
            g.stroke(inset);
            if (bitFill.length) {
              g.fillStyle = bitFill[0];
              g.fill(bits);
              g.strokeStyle = C.ink;
              g.lineWidth = 0.8 / s;
              g.stroke(bits);
            }
          }
        },
      });
    }
    // ---- trees (round cartoon canopies with a highlight)
    for (const [x, z, r, kind] of c.trees) {
      const pal = TREE[kind] ?? TREE[0];
      const lift = r * 0.9;
      const jitter = hash(x, z);
      this.things.push({
        box: { x0: x - r - 1, z0: z - lift - r - 1, x1: x + r + 3, z1: z + r * 0.6 + 1 },
        z,
        draw: (g, s) => {
          g.fillStyle = C.shadow;
          g.beginPath();
          g.ellipse(x + r * 0.45, z + r * 0.2, r * 0.95, r * 0.5, 0, 0, Math.PI * 2);
          g.fill();
          if (s > 0.6) {
            g.fillStyle = '#7a5434';
            g.fillRect(x - r * 0.12, z - lift * 0.6, r * 0.24, lift * 0.6);
          }
          g.fillStyle = pal[0];
          g.strokeStyle = pal[1];
          g.lineWidth = 1 / s;
          g.beginPath();
          g.arc(x, z - lift, r, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          if (s > 0.4) {
            g.fillStyle = pal[2];
            g.beginPath();
            g.arc(x - r * (0.3 + jitter * 0.1), z - lift - r * 0.32, r * 0.42, 0, Math.PI * 2);
            g.fill();
          }
        },
      });
    }
    // ---- street lamps
    for (const [x, z] of c.lamps) {
      this.things.push({
        box: { x0: x - 2, z0: z - 7, x1: x + 2, z1: z + 1 },
        z,
        draw: (g, s) => {
          if (s < 0.7) return;
          g.strokeStyle = '#3c4150';
          g.lineWidth = 0.45;
          g.beginPath();
          g.moveTo(x, z);
          g.lineTo(x, z - 5.2);
          g.stroke();
          g.fillStyle = '#ffe28a';
          g.beginPath();
          g.arc(x, z - 5.4, 0.75, 0, Math.PI * 2);
          g.fill();
        },
      });
    }
    // Back to front: things further south are drawn later (on top).
    this.things.sort((a, b) => a.z - b.z);
  }

  // ------------------------------------------------------------ drawing
  /**
   * Draw one layer of the map with the camera centred on (camX, camZ) at
   * `s` pixels per metre (dpr = device pixel ratio of the canvas).
   *   'ground' — water, land, roads, blocks, lawns (opaque);
   *   'upper'  — buildings, trees, lamps, back to front (transparent).
   * Moving things (cars, people) are drawn between the two, so they slip
   * behind tall buildings the way they should.
   */
  drawLayer(g: CanvasRenderingContext2D, layer: 'ground' | 'upper', W: number, H: number, camX: number, camZ: number, s: number, dpr: number): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (layer === 'ground') {
      g.fillStyle = this.palette.water;
      g.fillRect(0, 0, W, H);
    } else {
      g.clearRect(0, 0, W, H);
    }
    const view: Box = { x0: camX - W / 2 / s, z0: camZ - H / 2 / s, x1: camX + W / 2 / s, z1: camZ + H / 2 / s };
    const on = (b: Box) => b.x1 >= view.x0 && b.x0 <= view.x1 && b.z1 >= view.z0 && b.z0 <= view.z1;
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - camX * s), dpr * (H / 2 - camZ * s));
    if (layer === 'upper') {
      for (const t of this.things) if (on(t.box)) t.draw(g, s);
      return;
    }
    // Little waves on the water (fixed to the world, so they pan with it).
    if (s > 0.25) {
      g.strokeStyle = C.wave;
      g.lineWidth = 1.2 / s;
      const step = 46;
      g.beginPath();
      for (let gx = Math.floor(view.x0 / step) * step; gx < view.x1; gx += step) {
        for (let gz = Math.floor(view.z0 / step) * step; gz < view.z1; gz += step) {
          const j = hash(gx, gz);
          if (j > 0.55) continue;
          const x = gx + j * 30, z = gz + hash(gz, gx) * 30;
          g.moveTo(x, z);
          g.quadraticCurveTo(x + 4, z - 3, x + 8, z);
          g.quadraticCurveTo(x + 12, z + 3, x + 16, z);
        }
      }
      g.stroke();
    }
    for (const it of this.ground) {
      if (!on(it.box)) continue;
      if (it.fill) {
        g.fillStyle = it.fill;
        g.fill(it.path, it.rule ?? 'nonzero');
      }
      if (it.stroke) {
        g.strokeStyle = it.stroke;
        g.setLineDash(it.dash ?? []);
        g.lineJoin = 'round';
        g.lineCap = it.cap ?? 'round';
        // Thin lines stay at least one screen pixel wide.
        g.lineWidth = Math.max(it.width ?? 1, 0.9 / s);
        g.stroke(it.path);
      }
    }
    g.setLineDash([]);
  }

  /** Both layers in one go (for screenshots and simple pages). */
  draw(g: CanvasRenderingContext2D, W: number, H: number, camX: number, camZ: number, s: number, dpr: number): void {
    this.drawLayer(g, 'ground', W, H, camX, camZ, s, dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const view: Box = { x0: camX - W / 2 / s, z0: camZ - H / 2 / s, x1: camX + W / 2 / s, z1: camZ + H / 2 / s };
    const on = (b: Box) => b.x1 >= view.x0 && b.x0 <= view.x1 && b.z1 >= view.z0 && b.z0 <= view.z1;
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - camX * s), dpr * (H / 2 - camZ * s));
    for (const t of this.things) if (on(t.box)) t.draw(g, s);
    this.drawLabels(g, W, H, camX, camZ, s, dpr);
  }

  /** Neighbourhood and park names, outlined so they read on anything; never two on top of each other. */
  drawLabels(g: CanvasRenderingContext2D, W: number, H: number, camX: number, camZ: number, s: number, dpr: number): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const placed: Box[] = [];
    for (const l of this.labels) {
      if (s > l.maxScale) continue;
      const sx = (l.x - camX) * s + W / 2;
      const sy = (l.z - camZ) * s + H / 2;
      if (sx < -200 || sx > W + 200 || sy < -40 || sy > H + 40) continue;
      g.font = `800 ${l.size}px "Baloo 2", "Trebuchet MS", system-ui, sans-serif`;
      const tw = g.measureText(l.text).width / 2 + 6;
      const r = { x0: sx - tw, z0: sy - l.size * 0.7, x1: sx + tw, z1: sy + l.size * 0.7 };
      if (placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.z0 < q.z1 && r.z1 > q.z0)) continue;
      placed.push(r);
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(255,255,255,0.92)';
      g.lineJoin = 'round';
      g.strokeText(l.text, sx, sy);
      g.fillStyle = '#34405a';
      g.fillText(l.text, sx, sy);
    }
  }

  /** The block under a world point, if any. */
  blockAt(x: number, z: number): BaseMap['blocks'][number] | null {
    for (const b of this.base.blocks) if (pointIn(b.poly, x, z) && !(b.holes ?? []).some((h) => pointIn(h, x, z))) return b;
    return null;
  }
}

function pointIn(poly: number[][], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

function convexHull(pts: number[][]): number[][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const hi: number[][] = [];
  for (const q of p.reverse()) {
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
