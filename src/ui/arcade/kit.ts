// =====================================================================
// arcade/kit.ts — small shared helpers for the second row of cabinets
// (pinball, skee-ball, breakout, rooftop, air hockey). Same look as
// arcade-games.ts: chunky outlined labels, thin draining bars.
// =====================================================================

import { at } from '../arcade-games.ts';

export const DISPLAY = '"Lilita One", "Arial Black", system-ui, sans-serif';

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Chunky outlined text (scores, signs). */
export function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
  g.font = `900 ${size}px ${DISPLAY}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,.6)';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

/** A thin draining bar (power-ups, timers). */
export function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, f: number, color: string): void {
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(x, y, w, 6);
  g.fillStyle = color;
  g.fillRect(x, y, w * clamp(f, 0, 1), 6);
}

/** Draw something once into an offscreen canvas (static backgrounds: cheap to blit every frame). */
export function prerender(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

export interface Touch {
  id: number;
  x: number;
  y: number;
  /** Where it started and when. */
  x0: number;
  y0: number;
  t0: number;
}

/**
 * Pointer input on the canvas, multi-touch aware. Returns an unbind
 * function (call it from the game's stop()).
 */
export function pointers(
  cv: HTMLCanvasElement,
  h: { down?: (t: Touch) => void; move?: (t: Touch) => void; up?: (t: Touch) => void },
): () => void {
  const live = new Map<number, Touch>();
  const down = (e: PointerEvent) => {
    e.preventDefault();
    const p = at(cv, e);
    const t: Touch = { id: e.pointerId, x: p.x, y: p.y, x0: p.x, y0: p.y, t0: performance.now() };
    live.set(e.pointerId, t);
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      // Not capturable (synthetic event): fine.
    }
    h.down?.(t);
  };
  const move = (e: PointerEvent) => {
    const t = live.get(e.pointerId);
    if (!t) return;
    const p = at(cv, e);
    t.x = p.x;
    t.y = p.y;
    h.move?.(t);
  };
  const up = (e: PointerEvent) => {
    const t = live.get(e.pointerId);
    if (!t) return;
    const p = at(cv, e);
    t.x = p.x;
    t.y = p.y;
    live.delete(e.pointerId);
    h.up?.(t);
  };
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  return () => {
    cv.removeEventListener('pointerdown', down);
    cv.removeEventListener('pointermove', move);
    cv.removeEventListener('pointerup', up);
    cv.removeEventListener('pointercancel', up);
    live.clear();
  };
}

/** Keyboard (optional on phones). Returns an unbind function. */
export function keys(down: (k: string, e: KeyboardEvent) => void, up?: (k: string, e: KeyboardEvent) => void): () => void {
  const d = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
    down(e.key, e);
  };
  const u = (e: KeyboardEvent) => up?.(e.key, e);
  window.addEventListener('keydown', d);
  window.addEventListener('keyup', u);
  return () => {
    window.removeEventListener('keydown', d);
    window.removeEventListener('keyup', u);
  };
}

/** done() exactly once, after a beat so the end stamp can land, and never after stop(). */
export function finisher(done: (score: number) => void): { end: (score: number, ms?: number) => void; cancel: () => void; readonly ended: boolean } {
  let timer = 0;
  let ended = false;
  return {
    end(score: number, ms = 1300) {
      if (ended) return;
      ended = true;
      timer = window.setTimeout(() => done(Math.max(0, Math.round(score))), ms);
    },
    cancel() {
      ended = true;
      window.clearTimeout(timer);
    },
    get ended() {
      return ended;
    },
  };
}

/** Format big scores 12,340. */
export const num = (n: number): string => Math.round(n).toLocaleString('en-US');

/** A glowing filled circle (shadowBlur is costly: only a few per frame). */
export function glowDot(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, blur = 12): void {
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
}

/** A shiny ball (pinball, skee-ball): a radial highlight. */
export function shinyBall(g: CanvasRenderingContext2D, x: number, y: number, r: number, base: string, hi = '#ffffff'): void {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, hi);
  gr.addColorStop(0.35, base);
  gr.addColorStop(1, '#1b1b22');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
