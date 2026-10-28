// =====================================================================
// arcade/classic1-kit.ts — small helpers shared by 🐍 Subway Snake,
// 🥪 Bodega Stack and 🛵 Delivery Dash (on top of arcade/kit.ts):
// emoji sprites (drawn once, blitted every frame), a seeded random,
// reduced motion, a HUD that only touches the DOM when its text changes,
// and swipe/tap input.
// =====================================================================

import { at } from '../arcade-games.ts';

/** People who asked for less motion: gentler camera moves, no speed lines. */
export const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A small seeded random (scenery looks the same every game). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const SPRITES = new Map<string, HTMLCanvasElement>();

/** An emoji drawn once into a canvas (fillText every frame is slow on phones). */
export function emojiSprite(e: string, px = 48): HTMLCanvasElement {
  const key = `${e}|${px}`;
  let c = SPRITES.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const s = Math.ceil(px * 1.3);
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.font = `${px}px ${EMOJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#000';
  g.fillText(e, s / 2, s / 2 + px * 0.06);
  SPRITES.set(key, c);
  return c;
}

/** Blit a sprite centred at (x, y), `size` px across. */
export function blit(g: CanvasRenderingContext2D, spr: HTMLCanvasElement, x: number, y: number, size: number): void {
  const k = size / (spr.width / 1.3);
  const w = spr.width * k, h = spr.height * k;
  g.drawImage(spr, x - w / 2, y - h / 2, w, h);
}

/** A soft round light (radial gradient), drawn once. Use with 'lighter'. */
export function glowSprite(r: number, color: string, alpha = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = r * 2;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = alpha;
  g.fillStyle = gr;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

/** hud() only when the text changed (no DOM write every frame). */
export function hudOnce(hud: (t: string) => void): (t: string) => void {
  let last = '';
  return (t) => {
    if (t === last) return;
    last = t;
    hud(t);
  };
}

export interface SwipeHandlers {
  /** A swipe: unit direction on its main axis. Fires mid-drag (no waiting for the finger to lift). */
  swipe: (dx: number, dy: number) => void;
  /** A short tap (canvas coordinates). */
  tap?: (x: number, y: number) => void;
}

/**
 * Swipes fire as soon as the finger has moved `dist` px (canvas units) and
 * the origin resets, so one long zig-zag drag can turn twice. A touch
 * that didn't swipe and lifted quickly is a tap.
 */
export function swipes(cv: HTMLCanvasElement, h: SwipeHandlers, dist = 18): () => void {
  let id = -1, sx = 0, sy = 0, t0 = 0, moved = false;
  const down = (e: PointerEvent) => {
    e.preventDefault();
    const p = at(cv, e);
    id = e.pointerId;
    sx = p.x;
    sy = p.y;
    t0 = performance.now();
    moved = false;
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events can't be captured: fine.
    }
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const p = at(cv, e);
    const dx = p.x - sx, dy = p.y - sy;
    if (dx * dx + dy * dy < dist * dist) return;
    if (Math.abs(dx) > Math.abs(dy)) h.swipe(Math.sign(dx), 0);
    else h.swipe(0, Math.sign(dy));
    moved = true;
    sx = p.x;
    sy = p.y;
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    if (moved) return;
    const p = at(cv, e);
    const dx = p.x - sx, dy = p.y - sy;
    // A quick flick that never crossed the threshold mid-move still counts.
    if (dx * dx + dy * dy >= (dist * 0.6) ** 2) {
      if (Math.abs(dx) > Math.abs(dy)) h.swipe(Math.sign(dx), 0);
      else h.swipe(0, Math.sign(dy));
      return;
    }
    if (performance.now() - t0 < 450) h.tap?.(p.x, p.y);
  };
  const cancel = (e: PointerEvent) => e.pointerId === id && (id = -1);
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', cancel);
  return () => {
    cv.removeEventListener('pointerdown', down);
    cv.removeEventListener('pointermove', move);
    cv.removeEventListener('pointerup', up);
    cv.removeEventListener('pointercancel', cancel);
  };
}

/** Rounded-rect path (no fill), for chunky shapes. */
export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** QA only (?qa=1): expose a game's state so a test driver can play it with real input. */
export function qaExpose(name: string, state: unknown): void {
  if (typeof location === 'undefined' || new URLSearchParams(location.search).get('qa') !== '1') return;
  const w = window as unknown as { __arcadeQa?: Record<string, unknown> };
  (w.__arcadeQa ??= {})[name] = state;
}
