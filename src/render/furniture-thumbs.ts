// =====================================================================
// furniture-thumbs.ts — little 3D pictures of furniture for the buy menu.
//
// Each piece is rendered once, the first time the menu shows it, into a
// small off-screen picture with the game's own renderer (a second WebGL
// context would be too much for older phones), then kept as an image URL.
// A few per frame, so opening a tab never stutters.
// =====================================================================

import * as THREE from 'three';
import { FURNITURE } from '../data/furniture.ts';
import { MODELS_INFO, type FurnitureKit } from '../assets/furniture-kit.ts';

const SIZE = 128;
const cache = new Map<string, string>();
const waiting = new Map<string, ((url: string) => void)[]>();
let queue: string[] = [];
let running = false;

let renderer: THREE.WebGLRenderer | null = null;
let kit: FurnitureKit | null = null;
let target: THREE.WebGLRenderTarget | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

/** Hook up the game's renderer and furniture (once both exist). */
export function initThumbs(r: THREE.WebGLRenderer, k: FurnitureKit): void {
  renderer = r;
  kit = k;
}

/** A picture of a piece (resolves when it's drawn). `finish` = colours to show. */
export function furnitureThumb(item: string): Promise<string> {
  const hit = cache.get(item);
  if (hit) return Promise.resolve(hit);
  return new Promise((res) => {
    const list = waiting.get(item);
    if (list) return list.push(res);
    waiting.set(item, [res]);
    queue.push(item);
    if (!running) {
      running = true;
      requestAnimationFrame(pump);
    }
  });
}

/** Stop drawing (the menu closed): drop whatever is still waiting. */
export function cancelThumbs(): void {
  queue = [];
  waiting.clear();
}

function pump(): void {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 8) {
    const item = queue.shift()!;
    const url = draw(item);
    cache.set(item, url);
    waiting.get(item)?.forEach((f) => f(url));
    waiting.delete(item);
  }
  if (queue.length) requestAnimationFrame(pump);
  else running = false;
}

function draw(item: string): string {
  const def = FURNITURE.get(item);
  if (!renderer || !kit || !def) return '';
  if (!target) {
    target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a7f74', 2.4));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(-2, 5, 4);
    scene.add(sun);
    camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  }
  const g = new THREE.Group();
  for (const p of def.parts) {
    const geo = kit.models.get(p.model);
    if (!geo) continue;
    const info = MODELS_INFO[p.model];
    const m = new THREE.Mesh(geo, kit.materialFor({ a: def.colors?.a ?? info?.a, b: def.colors?.b ?? info?.b, glow: def.light ? 0.9 : 0, glowColor: def.light?.color }));
    m.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    m.rotation.y = p.rot ?? 0;
    g.add(m);
  }
  scene!.add(g);
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(0.25, box.getSize(new THREE.Vector3()).length() / 2);
  const flat = def.flat || box.max.y - box.min.y < 0.1;
  const dir = flat ? new THREE.Vector3(0.35, 1, 0.75) : new THREE.Vector3(0.75, 0.55, 1);
  camera!.position.copy(c).addScaledVector(dir.normalize(), r / Math.sin(THREE.MathUtils.degToRad(15)) * 0.95);
  camera!.lookAt(c);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene!, camera!);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  scene!.remove(g);
  // WebGL reads bottom-up: flip into a canvas.
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}
