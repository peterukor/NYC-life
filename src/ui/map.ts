// =====================================================================
// map.ts — the 2D city map.
//
// Drawn on a canvas straight from layout.ts and places.ts, so it always
// matches the 3D city. Drag to pan, pinch or scroll to zoom (from the
// whole area down to single blocks). Tap a place to see travel options.
// Boroughs that aren't built yet show as "coming soon" — that's the
// expansion space.
// =====================================================================

import { doorOf, placesIn, isOpen } from '../data/places.ts';
import type { AreaId } from '../sim/types.ts';
import { avenueX, blockRect, districtBounds, DISTRICTS, streetZ } from '../world/layout.ts';
import { html, onAct, root } from './dom.ts';

const BOROUGHS: { id: AreaId | 'queens' | 'bronx' | 'si'; label: string; ready: boolean }[] = [
  { id: 'manhattan', label: 'Manhattan', ready: true },
  { id: 'brooklyn', label: 'Brooklyn', ready: true },
  { id: 'queens', label: 'Queens', ready: false },
  { id: 'bronx', label: 'Bronx', ready: false },
  { id: 'si', label: 'Staten Is.', ready: false },
];

export interface MapOptions {
  area: AreaId;
  player: { area: AreaId; x: number; z: number };
  hour: number;
  onPick: (placeId: string) => void;
  onClose: () => void;
}

export function openMap(opts: MapOptions): () => void {
  let area: AreaId = opts.area;
  const el = html(`
    <div class="map" role="dialog" aria-label="City map">
      <div class="map-top">
        <div class="seg" data-tabs>${BOROUGHS.map((b) => `<button data-act="tab:${b.id}" class="${b.id === area ? 'on' : ''}" ${b.ready ? '' : 'aria-disabled="true" title="Coming soon"'}>${b.label}${b.ready ? '' : ' 🚧'}</button>`).join('')}</div>
        <button class="btn" data-act="close" aria-label="Close map">✕</button>
      </div>
      <canvas></canvas>
      <div class="map-legend">Tap a place to go there · pinch to zoom</div>
    </div>`);
  root().appendChild(el);
  const canvas = el.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;

  // View transform: world (x, z) → screen pixels.
  let scale = 1;
  let ox = 0;
  let oy = 0;

  const fit = () => {
    const d = DISTRICTS[area];
    const b = districtBounds(d, 30);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    scale = Math.min(w / (b.maxX - b.minX), h / (b.maxZ - b.minZ));
    ox = w / 2 - ((b.minX + b.maxX) / 2) * scale;
    oy = h / 2 - ((b.minZ + b.maxZ) / 2) * scale;
  };

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };

  const sx = (x: number) => x * scale + ox;
  const sy = (z: number) => z * scale + oy;

  function draw(): void {
    const d = DISTRICTS[area];
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    g.fillStyle = '#e8eefc'; // streets
    g.fillRect(0, 0, w, h);
    // Water.
    g.fillStyle = '#7fd0ff';
    if (d.water.side === 'west') g.fillRect(0, 0, sx(avenueX(d, 0) - d.avenueW / 2 - 6), h);
    else g.fillRect(0, 0, w, sy(streetZ(d, 0) - d.streetW / 2 - 6));
    // Blocks.
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        const b = blockRect(d, c, r);
        const kind = d.kind(c, r);
        g.fillStyle = kind === 'park' ? '#7ed37a' : kind === 'plaza' ? '#ffc629' : kind === 'vacant' ? '#f4d29c' : d.zone(c, r) === 'tall' ? '#cdc4ff' : d.zone(c, r) === 'brownstone' ? '#f6c3a4' : '#ffd3e2';
        g.strokeStyle = '#1c2340';
        g.lineWidth = 2;
        roundRect(g, sx(b.minX), sy(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale, Math.min(6, 2 * scale));
        g.stroke();
        if (kind === 'vacant') {
          g.save();
          g.clip();
          g.strokeStyle = 'rgba(28,35,64,0.25)';
          g.lineWidth = 2;
          for (let k = -200; k < 400; k += 10) {
            g.beginPath();
            g.moveTo(sx(b.minX) + k, sy(b.minZ));
            g.lineTo(sx(b.minX) + k + 60, sy(b.maxZ));
            g.stroke();
          }
          g.restore();
        }
      }
    }
    // Street names when zoomed in.
    if (scale > 1.4) {
      g.fillStyle = 'rgba(28,35,64,0.55)';
      g.font = '800 11px Nunito, system-ui, sans-serif';
      g.textAlign = 'center';
      d.avenueNames.forEach((n, i) => {
        g.save();
        g.translate(sx(avenueX(d, i)), sy(streetZ(d, 0)) + 40);
        g.rotate(-Math.PI / 2);
        g.fillText(n, 0, 4);
        g.restore();
      });
      g.textAlign = 'left';
      d.streetNames.forEach((n, j) => g.fillText(n, sx(avenueX(d, 0)) + 6, sy(streetZ(d, j)) + 4));
    }
    // Area title + water label.
    g.fillStyle = '#1c2340';
    g.font = '400 24px "Lilita One", system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText(d.name, 14, 30);
    g.font = '700 12px Nunito, system-ui, sans-serif';
    g.fillStyle = '#545c7a';
    g.fillText(d.tagline, 14, 48);
    g.fillStyle = '#0b5f8a';
    g.font = '800 13px Nunito, system-ui, sans-serif';
    if (d.water.side === 'west') g.fillText(d.water.label, 12, h - 60);
    else g.fillText(d.water.label, w / 2 - 40, Math.max(64, sy(streetZ(d, 0)) - 30));

    // Places.
    const showLabels = scale > 0.6;
    for (const p of placesIn(area)) {
      const door = doorOf(p);
      const x = sx(door.x);
      const y = sy(door.z);
      const open = isOpen(p, opts.hour);
      g.fillStyle = open ? '#ffffff' : '#c9cfe0';
      g.strokeStyle = '#1c2340';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(x, y, 15, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.font = '18px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(p.emoji, x, y + 1);
      if (showLabels) {
        g.font = '800 11px Nunito, system-ui, sans-serif';
        const label = p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name;
        const tw = g.measureText(label).width + 10;
        g.fillStyle = '#1c2340';
        roundRect(g, x - tw / 2, y + 18, tw, 17, 6);
        g.fillStyle = open ? '#fff' : '#c9cfe0';
        g.fillText(label, x, y + 27);
      }
      g.textBaseline = 'alphabetic';
    }

    // You are here.
    if (opts.player.area === area) {
      const x = sx(opts.player.x);
      const y = sy(opts.player.z);
      g.fillStyle = 'rgba(255,198,41,0.45)';
      g.beginPath();
      g.arc(x, y, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffc629';
      g.strokeStyle = '#1c2340';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  // ---- pan / zoom / tap
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let moved = false;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > 0.5) {
        ox += cur.x - prev.x;
        oy += cur.y - prev.y;
        if (Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) > 2) moved = true;
        draw();
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = canvas.getBoundingClientRect();
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, dist / (pinchDist || dist));
      pinchDist = dist;
      moved = true;
    }
  });
  const up = (e: PointerEvent) => {
    const wasTap = pointers.size === 1 && !moved;
    pointers.delete(e.pointerId);
    if (!wasTap) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let best: { id: string; d: number } | null = null;
    for (const p of placesIn(area)) {
      const door = doorOf(p);
      const dd = Math.hypot(sx(door.x) - px, sy(door.z) - py);
      if (dd < 28 && (!best || dd < best.d)) best = { id: p.id, d: dd };
    }
    if (best) opts.onPick(best.id);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  function zoomAt(px: number, py: number, factor: number): void {
    const next = Math.min(6, Math.max(0.3, scale * factor));
    const f = next / scale;
    ox = px - (px - ox) * f;
    oy = py - (py - oy) * f;
    scale = next;
    draw();
  }

  onAct(el, (act) => {
    if (act === 'close') return void close();
    if (act.startsWith('tab:')) {
      const id = act.slice(4) as AreaId;
      if (id !== 'manhattan' && id !== 'brooklyn') return;
      area = id;
      el.querySelectorAll<HTMLElement>('[data-tabs] button').forEach((b) => b.classList.toggle('on', b.dataset.act === act));
      fit();
      draw();
    }
  });

  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => {
    fit();
    resize();
  });

  function close(): void {
    window.removeEventListener('resize', onResize);
    el.remove();
    opts.onClose();
  }
  return close;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}
