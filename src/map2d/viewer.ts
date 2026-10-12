// =====================================================================
// map2d/viewer.ts — a stand-alone page to look around the 2D cartoon map
// (map2d.html). Drag to move, pinch or scroll to zoom, tap a block to see
// its number (handy for saying "change block m23").
// =====================================================================

import base from '../data/map/manhattan.json';
import city from '../data/map/manhattan-city.json';
import { HOODS } from '../data/neighborhoods.ts';
import { MapRenderer, type BaseMap, type CityLayer, type Label } from './render.ts';
import { Life } from './life.ts';

// Same projection as world/geo-proj.ts (kept local so this page stays small).
function project(lat: number, lon: number): { x: number; z: number } {
  const th = (29 * Math.PI) / 180;
  const E = (lon + 73.9855) * Math.cos((40.758 * Math.PI) / 180) * 111320;
  const N = (lat - 40.758) * 110540;
  return { x: (E * Math.cos(th) - N * Math.sin(th)) * 0.2, z: -(E * Math.sin(th) + N * Math.cos(th)) * 0.2 };
}

const B = base as unknown as BaseMap;
const labels: Label[] = [];
for (const h of HOODS.filter((h) => h.borough === 'manhattan')) {
  const p = project(h.at[0], h.at[1]);
  labels.push({ text: h.name.toUpperCase(), x: p.x, z: p.z, size: 15, maxScale: 1.1 });
}
// Park names: once each, on the biggest piece of that park.
const parks = new Map<string, BaseMap['blocks'][number]>();
for (const b of B.blocks) if (b.name && (!parks.has(b.name) || parks.get(b.name)!.area < b.area)) parks.set(b.name, b);
for (const b of parks.values()) labels.unshift({ text: b.name!, x: b.center[0], z: b.center[1], size: 13, maxScale: 2.2 });

const map = new MapRenderer(B, city as unknown as CityLayer, labels);
const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const g = canvas.getContext('2d', { alpha: false })!;
const info = document.querySelector<HTMLDivElement>('#info')!;

// Camera: start over Midtown and Central Park.
let camX = 40;
let camZ = -260;
let scale = 0.7;
const MIN = 0.3; // about two neighbourhoods on a phone (Peter, 2026-10-12)
const MAX = 4;
let W = 0, H = 0, dpr = 1;

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}
window.addEventListener('resize', resize);
resize();

// ---- drawing: two cached layers with the moving city in between.
// The still map (ground, then buildings and trees) is drawn into two
// offscreen canvases a bit bigger than the screen. Every frame we just
// copy those, with cars, people and boats between them and clouds on top.
// The caches are redrawn only when you zoom (after the gesture settles)
// or pan past their edge, so the moving bits stay smooth on phones.
const life = new Life(B, city as never);
const MARGIN = 0.35; // extra cache around the screen, per side
const groundC = document.createElement('canvas');
const upperC = document.createElement('canvas');
const gg = groundC.getContext('2d', { alpha: false })!;
const ug = upperC.getContext('2d')!;
let cache = { x: 0, z: 0, s: 0, W: 0, H: 0, dpr: 0 };
let lastZoomAt = 0;
let stats = { frames: 0, rebuilds: 0, lastRebuildMs: 0, frameMs: 0 };

function rebuild(): void {
  const t0 = performance.now();
  const CW = Math.round(W * (1 + 2 * MARGIN)), CH = Math.round(H * (1 + 2 * MARGIN));
  for (const c of [groundC, upperC]) {
    c.width = Math.round(CW * dpr);
    c.height = Math.round(CH * dpr);
  }
  map.drawLayer(gg, 'ground', CW, CH, camX, camZ, scale, dpr);
  map.drawLayer(ug, 'upper', CW, CH, camX, camZ, scale, dpr);
  cache = { x: camX, z: camZ, s: scale, W: CW, H: CH, dpr };
  stats.rebuilds++;
  stats.lastRebuildMs = performance.now() - t0;
}

/** Where the cache sits on screen right now (CSS px). */
function cachePlace() {
  const k = scale / cache.s;
  return { k, ox: W / 2 + (cache.x - camX) * scale - (cache.W / 2) * k, oy: H / 2 + (cache.z - camZ) * scale - (cache.H / 2) * k };
}

function needRebuild(now: number): boolean {
  if (!cache.s || cache.dpr !== dpr || cache.W !== Math.round(W * (1 + 2 * MARGIN)) || cache.H !== Math.round(H * (1 + 2 * MARGIN))) return true;
  const { k, ox, oy } = cachePlace();
  // Screen no longer covered: must redraw now.
  if (ox > 0.5 || oy > 0.5 || ox + cache.W * k < W - 0.5 || oy + cache.H * k < H - 0.5) return true;
  // Zoomed: redraw sharp once the fingers rest (or straight away if way off).
  if (Math.abs(k - 1) > 0.001 && (now - lastZoomAt > 160 || k > 1.8 || k < 0.55)) return true;
  return false;
}

let lastT = performance.now();
function frame(now: number): void {
  const dt = (now - lastT) / 1000;
  lastT = now;
  life.update(dt);
  if (needRebuild(now)) rebuild();
  const t0 = performance.now();
  const { k, ox, oy } = cachePlace();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = k !== 1;
  g.drawImage(groundC, ox, oy, cache.W * k, cache.H * k);
  const view = { x0: camX - W / 2 / scale, z0: camZ - H / 2 / scale, x1: camX + W / 2 / scale, z1: camZ + H / 2 / scale };
  g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (W / 2 - camX * scale), dpr * (H / 2 - camZ * scale));
  life.drawStreet(g, view, scale, now / 1000);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.drawImage(upperC, ox, oy, cache.W * k, cache.H * k);
  g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (W / 2 - camX * scale), dpr * (H / 2 - camZ * scale));
  life.drawSky(g, view, scale);
  map.drawLabels(g, W, H, camX, camZ, scale, dpr);
  stats.frames++;
  stats.frameMs = stats.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const clampCam = () => {
  const b = map.bounds;
  camX = Math.max(b.x0, Math.min(b.x1, camX));
  camZ = Math.max(b.z0, Math.min(b.z1, camZ));
};

function zoomAt(sx: number, sy: number, k: number): void {
  const wx = camX + (sx - W / 2) / scale;
  const wz = camZ + (sy - H / 2) / scale;
  const ns = Math.max(MIN, Math.min(MAX, scale * k));
  camX = wx - (sx - W / 2) / ns;
  camZ = wz - (sy - H / 2) / ns;
  scale = ns;
  lastZoomAt = performance.now();
  clampCam();
}

// ---- touch / mouse: one finger pans, two pinch
const pts = new Map<number, { x: number; y: number }>();
let moved = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = 0;
});
canvas.addEventListener('pointermove', (e) => {
  const p = pts.get(e.pointerId);
  if (!p) return;
  if (pts.size === 1) {
    camX -= (e.clientX - p.x) / scale;
    camZ -= (e.clientY - p.y) / scale;
    moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
    clampCam();
  } else if (pts.size === 2) {
    const [a, b] = [...pts.entries()];
    const other = a[0] === e.pointerId ? b[1] : a[1];
    const d0 = Math.hypot(p.x - other.x, p.y - other.y);
    const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    const r = canvas.getBoundingClientRect();
    if (d0 > 0) zoomAt((e.clientX + other.x) / 2 - r.left, (e.clientY + other.y) / 2 - r.top, d1 / d0);
    moved += 10;
  }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
const up = (e: PointerEvent) => {
  const wasTap = pts.size === 1 && moved < 6;
  pts.delete(e.pointerId);
  if (wasTap && e.type === 'pointerup') {
    const r = canvas.getBoundingClientRect();
    const wx = camX + (e.clientX - r.left - W / 2) / scale;
    const wz = camZ + (e.clientY - r.top - H / 2) / scale;
    showBlock(wx, wz);
  }
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('lostpointercapture', (e) => pts.delete(e.pointerId));
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  },
  { passive: false },
);
document.querySelector('#zin')!.addEventListener('click', () => zoomAt(W / 2, H / 2, 1.5));
document.querySelector('#zout')!.addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.5));

const buildingsIn = new Map<string, number>();
for (const b of (city as unknown as CityLayer).buildings) buildingsIn.set(b.b, (buildingsIn.get(b.b) ?? 0) + 1);

function showBlock(x: number, z: number): void {
  const b = map.blockAt(x, z);
  if (!b) {
    info.hidden = true;
    return;
  }
  const what = b.kind === 'park' ? b.name ?? 'Park' : `${buildingsIn.get(b.id) ?? 0} buildings`;
  info.innerHTML = `<b>Block ${b.id}</b><span>${what} · ${Math.round(b.area / 100) / 10}k m²</span>`;
  info.hidden = false;
}

/** For screenshots (scripts/qa-map2d.mjs): put the camera somewhere. */
(window as unknown as Record<string, unknown>).__map2d = {
  view: (x: number, z: number, s: number) => {
    camX = x;
    camZ = z;
    scale = s;
  },
  stats: () => stats,
  tap: (x: number, z: number) => showBlock(x, z),
};
