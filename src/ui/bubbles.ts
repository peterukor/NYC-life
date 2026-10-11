// =====================================================================
// bubbles.ts — comic speech bubbles that float over people's heads.
//
// Used for "Speak loud" (your words over your head, so everyone nearby
// can see), NPC replies, and what people say when you talk to them.
// Bubbles are plain HTML positioned over the 3D view each frame — crisp
// text at any size, almost no cost. At most MAX_BUBBLES at once (oldest
// goes first) so the screen never gets crowded.
// =====================================================================

import * as THREE from 'three';
import { esc } from '../core/format.ts';
import { html, root } from './dom.ts';

const MAX_BUBBLES = 4;

interface Bubble {
  el: HTMLElement;
  anchor: () => { x: number; z: number } | null;
  until: number;
  height: number;
}

let layer: HTMLElement | null = null;
const live: Bubble[] = [];
const v = new THREE.Vector3();

/**
 * Show a bubble over whatever `anchor` returns (world x/z; null = gone).
 * `loud` = your Speak-loud bubble (bigger, bolder). `who` = optional name.
 */
export function say(anchor: () => { x: number; z: number } | null, text: string, opts: { ms?: number; loud?: boolean; who?: string; tone?: 'nice' | 'rude' } = {}): void {
  if (!layer) {
    layer = html('<div class="bubbles" aria-live="polite"></div>');
    root().appendChild(layer);
  }
  while (live.length >= MAX_BUBBLES) remove(live[0]);
  const el = html(`<div class="bubble${opts.loud ? ' loud' : ''}${opts.tone ? ` ${opts.tone}` : ''}">${opts.who ? `<b>${esc(opts.who)}</b>` : ''}${esc(text)}</div>`);
  layer.appendChild(el);
  live.push({ el, anchor, until: performance.now() + (opts.ms ?? 4500), height: opts.loud ? 2.6 : 2.3 });
}

function remove(b: Bubble): void {
  b.el.remove();
  live.splice(live.indexOf(b), 1);
}

/** Call every frame: moves bubbles with their people, fades old ones. */
export function updateBubbles(camera: THREE.Camera, width: number, height: number, visible: boolean): void {
  if (!layer) return;
  layer.hidden = !visible;
  const now = performance.now();
  for (const b of [...live]) {
    const p = b.anchor();
    if (!p || now > b.until) {
      remove(b);
      continue;
    }
    v.set(p.x, b.height, p.z).project(camera);
    const off = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2;
    b.el.style.display = off ? 'none' : '';
    b.el.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * width}px, ${(-v.y * 0.5 + 0.5) * height}px)`;
    b.el.style.opacity = String(Math.min(1, (b.until - now) / 400));
  }
}

export function clearBubbles(): void {
  for (const b of [...live]) remove(b);
}
