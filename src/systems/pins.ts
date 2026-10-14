// =====================================================================
// pins.ts (system) — draws the teardrop pins over the 3D city.
//
// Pins are small HTML elements placed over the 3D view each frame (crisp
// at any size, easy to tap, and free for the graphics card). The data —
// which pins exist and how they look — is in data/pins.ts.
//
// HOW WE KEEP IT CALM (never overwhelming):
//   • only the MAX_PINS most important pins are shown (importance first,
//     then distance from you)
//   • pins that would overlap on screen merge into one, with a "+N"
//   • landmarks only appear when you zoom out or walk close to them
//   • pins are small and slightly see-through; only ONE pin (the most
//     important "loud" one, like a sale) gently bounces
//   • off-screen pins simply aren't drawn
// Tapping a pin opens that place's card.
// =====================================================================

import * as THREE from 'three';
import { bus } from '../core/bus.ts';
import { SYSTEMS, type SystemContext } from '../core/systems.ts';
import { MAX_PINS, PIN_KINDS, PIN_SOURCES, type Pin } from '../data/pins.ts';
import { root } from '../ui/dom.ts';

let layer: HTMLDivElement | null = null;
const els = new Map<string, HTMLButtonElement>();
let pins: Pin[] = [];
let refresh = 0;
let hiddenInside = false;
let listening = false;
const v = new THREE.Vector3();

/** The teardrop shape (SVG), filled with the pin's colour, outlined in ink. */
function pinSvg(color: string): string {
  return `<svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 41C16 41 3 26.5 3 16a13 13 0 0 1 26 0C29 26.5 16 41 16 41Z" fill="${color}" stroke="#1c2340" stroke-width="2.5"/><circle cx="16" cy="16" r="9.5" fill="#fff"/></svg>`;
}

function element(p: Pin): HTMLButtonElement {
  let el = els.get(p.id);
  if (!el) {
    const kind = PIN_KINDS.get(p.kind);
    el = document.createElement('button');
    el.className = 'map-pin';
    el.type = 'button';
    el.innerHTML = `${pinSvg(kind?.color ?? '#3a86ff')}<span class="pin-ico">${p.icon}</span><span class="pin-more" hidden></span><span class="pin-label">${p.label.replace(/[<>&]/g, '')}</span>`;
    el.setAttribute('aria-label', p.label);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      // First tap shows the label; a tap while the label shows opens the place.
      if (el!.classList.contains('open') && p.placeId) bus.emit('pin:tap', { placeId: p.placeId });
      for (const other of els.values()) if (other !== el) other.classList.remove('open');
      el!.classList.toggle('open');
    });
    els.set(p.id, el);
    layer!.appendChild(el);
  }
  return el;
}

SYSTEMS.add({
  id: 'pins',
  order: 200,
  areaLoaded() {
    layer = document.createElement('div');
    layer.className = 'pin-layer';
    root().prepend(layer);
    refresh = 0;
    if (!listening) {
      listening = true;
      // Pins belong to the street view: hide them inside places and on the subway.
      bus.on('view:mode', (e) => (hiddenInside = e.mode !== 'city'));
    }
  },
  update(dt: number, ctx: SystemContext) {
    if (!layer) return;
    layer.hidden = hiddenInside;
    if (hiddenInside || !ctx.state) return;
    refresh -= dt;
    if (refresh <= 0) {
      // Ask every source for its pins (cheap, but no need every frame).
      refresh = 2;
      pins = PIN_SOURCES.all().flatMap((s) => {
        try {
          return s.pins({ area: ctx.district.id, state: ctx.state, time: ctx.time });
        } catch {
          return [];
        }
      });
    }
    const camDist = ctx.camera.position.distanceTo(ctx.player);
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Score, filter, and project to the screen.
    const shown: { p: Pin; sx: number; sy: number; score: number; merged: number }[] = [];
    const candidates = pins
      .map((p) => {
        const kind = PIN_KINDS.get(p.kind);
        const dist = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z);
        if (kind?.minZoom && camDist < kind.minZoom && dist > (kind.nearShow ?? 0)) return null;
        return { p, score: (kind?.priority ?? 1) * 1000 - dist };
      })
      .filter((c): c is { p: Pin; score: number } => !!c)
      .sort((a, b) => b.score - a.score);
    for (const c of candidates) {
      v.set(c.p.x, 7, c.p.z).project(ctx.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      // Merge with a more important pin already close by on screen.
      const near = shown.find((s) => Math.hypot(s.sx - sx, s.sy - sy) < 40);
      if (near) {
        near.merged++;
        continue;
      }
      if (shown.length >= MAX_PINS) break;
      shown.push({ p: c.p, sx, sy, score: c.score, merged: 0 });
    }
    // Only the top "loud" pin bounces.
    const loud = shown.find((s) => PIN_KINDS.get(s.p.kind)?.loud);
    const visible = new Set(shown.map((s) => s.p.id));
    for (const [id, el] of els) if (!visible.has(id)) el.hidden = true;
    for (const s of shown) {
      const el = element(s.p);
      el.hidden = false;
      el.style.transform = `translate(${Math.round(s.sx)}px, ${Math.round(s.sy)}px)`;
      el.classList.toggle('loud', s === loud);
      const more = el.querySelector<HTMLElement>('.pin-more')!;
      more.hidden = s.merged === 0;
      more.textContent = `+${s.merged}`;
    }
  },
  areaUnloaded() {
    layer?.remove();
    layer = null;
    els.clear();
    pins = [];
  },
});
