// =====================================================================
// map.ts — the 2D city map, in an Apple-Maps "transit" style: soft
// neutral blocks and white streets, green parks, blue water, subway
// lines in MTA colours with station dots, teardrop pins for landmarks
// and a blue "you are here" dot. Shops only appear when you zoom in,
// so the map is never cluttered.
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
    // Show a good strip of the river too.
    if (d.water.side === 'west') b.minX -= 60;
    else b.minZ -= 60;
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

  /**
   * Subway lines drawn on the map, Apple-Maps-transit style: thick lines
   * in the real MTA colours along avenues/streets, with white station
   * dots. (Line positions are chosen to suit our compressed map.)
   */
  const LINES: Record<AreaId, { bullet: string; color: string; avenue?: number; street?: number; stations: number[] }[]> = {
    manhattan: [
      { bullet: 'A', color: '#0039a6', avenue: 3, stations: [3, 6, 8, 11] },
      { bullet: '1', color: '#ee352e', avenue: 4, stations: [2, 6, 9, 11] },
      { bullet: 'B', color: '#ff6319', avenue: 5, stations: [3, 7, 10] },
      { bullet: '7', color: '#b933ad', street: 7, stations: [2, 4, 6] },
    ],
    brooklyn: [
      { bullet: '2', color: '#ee352e', avenue: 1, stations: [1, 3, 5] },
      { bullet: 'Q', color: '#fccc0a', avenue: 3, stations: [1, 4, 6] },
      { bullet: 'G', color: '#6cbe45', street: 4, stations: [1, 3, 5] },
    ],
  };

  /** Text with a white halo, like Apple Maps labels. */
  const halo = (text: string, x: number, y: number, font: string, color = '#3c4257') => {
    g.font = font;
    g.lineJoin = 'round';
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  };

  /** Teardrop pin (same shape as the 3D city pins). */
  const pin = (x: number, y: number, color: string, emoji: string, size = 1) => {
    g.save();
    g.translate(x, y);
    g.scale(size, size);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-4, -8, -13, -14, -13, -24);
    g.arc(0, -24, 13, Math.PI, 0);
    g.bezierCurveTo(13, -14, 4, -8, 0, 0);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.lineWidth = 2.2;
    g.strokeStyle = '#1c2340';
    g.stroke();
    g.beginPath();
    g.arc(0, -24, 9, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.font = '12px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, 0, -23);
    g.restore();
  };

  function draw(): void {
    const d = DISTRICTS[area];
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // Land and streets: soft Apple-Maps neutrals.
    g.fillStyle = '#f3f0ea';
    g.fillRect(0, 0, w, h);
    // Water.
    g.fillStyle = '#a7d8f5';
    if (d.water.side === 'west') g.fillRect(0, 0, sx(avenueX(d, 0) - d.avenueW / 2 - 6), h);
    else g.fillRect(0, 0, w, sy(streetZ(d, 0) - d.streetW / 2 - 6));
    // Roads: white with a soft edge (avenues wider than streets).
    const b0 = districtBounds(d, 0);
    g.strokeStyle = '#dcd7cd';
    g.lineCap = 'butt';
    for (let i = 0; i <= d.cols; i++) {
      g.lineWidth = d.avenueW * scale + 2;
      g.beginPath();
      g.moveTo(sx(avenueX(d, i)), sy(b0.minZ));
      g.lineTo(sx(avenueX(d, i)), sy(b0.maxZ));
      g.stroke();
    }
    for (let j = 0; j <= d.rows; j++) {
      g.lineWidth = d.streetW * scale + 2;
      g.beginPath();
      g.moveTo(sx(b0.minX), sy(streetZ(d, j)));
      g.lineTo(sx(b0.maxX), sy(streetZ(d, j)));
      g.stroke();
    }
    // Blocks: light warm grey; parks green; plazas a soft yellow; empty land hatched.
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        const b = blockRect(d, c, r);
        const kind = d.kind(c, r);
        g.fillStyle = kind === 'park' ? '#bfe3a5' : kind === 'plaza' ? '#fbe7a1' : kind === 'vacant' ? '#ece4d4' : d.zone(c, r) === 'tall' ? '#e4e1ea' : '#ebe5dc';
        roundRect(g, sx(b.minX), sy(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale, Math.min(5, 2 * scale));
        if (kind === 'vacant') {
          g.save();
          g.clip();
          g.strokeStyle = 'rgba(120,105,80,0.18)';
          g.lineWidth = 2;
          for (let k = -200; k < 400; k += 10) {
            g.beginPath();
            g.moveTo(sx(b.minX) + k, sy(b.minZ));
            g.lineTo(sx(b.minX) + k + 60, sy(b.maxZ));
            g.stroke();
          }
          g.restore();
        }
        // A few soft building footprints when zoomed in, so blocks don't look empty.
        if (kind === 'buildings' && scale > 1.6) {
          g.fillStyle = 'rgba(160,150,135,0.18)';
          const n = 4;
          for (let k = 0; k < n; k++) {
            const bx = b.minX + 5 + k * ((b.maxX - b.minX - 10) / n);
            roundRect(g, sx(bx), sy(b.minZ + 5), ((b.maxX - b.minX - 10) / n - 2) * scale, (b.maxZ - b.minZ - 10) * 0.42 * scale, 2);
            roundRect(g, sx(bx), sy(b.maxZ - 5 - (b.maxZ - b.minZ - 10) * 0.42), ((b.maxX - b.minX - 10) / n - 2) * scale, (b.maxZ - b.minZ - 10) * 0.42 * scale, 2);
          }
        }
      }
    }
    // Subway lines and stations.
    const lw = Math.max(3, Math.min(7, 3 * scale));
    for (const line of LINES[area]) {
      g.strokeStyle = line.color;
      g.lineWidth = lw;
      g.lineCap = 'round';
      g.beginPath();
      if (line.avenue !== undefined) {
        const x = sx(avenueX(d, line.avenue)) + (line.bullet.charCodeAt(0) % 3) * 0.5;
        g.moveTo(x, sy(streetZ(d, 0)));
        g.lineTo(x, sy(streetZ(d, d.rows)));
      } else if (line.street !== undefined) {
        const y = sy(streetZ(d, line.street));
        g.moveTo(sx(avenueX(d, 0)), y);
        g.lineTo(sx(avenueX(d, d.cols)), y);
      }
      g.stroke();
      for (const st of line.stations) {
        const x = line.avenue !== undefined ? sx(avenueX(d, line.avenue)) : sx(avenueX(d, st));
        const y = line.avenue !== undefined ? sy(streetZ(d, st)) : sy(streetZ(d, line.street!));
        g.beginPath();
        g.arc(x, y, lw * 0.9, 0, Math.PI * 2);
        g.fillStyle = '#fff';
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = '#1c2340';
        g.stroke();
      }
      // Line bullet at the top end.
      const bx = line.avenue !== undefined ? sx(avenueX(d, line.avenue)) : sx(avenueX(d, 0)) - 14;
      const by = line.avenue !== undefined ? sy(streetZ(d, 0)) - 14 : sy(streetZ(d, line.street!));
      g.beginPath();
      g.arc(bx, by, 10, 0, Math.PI * 2);
      g.fillStyle = line.color;
      g.fill();
      g.font = '800 12px Nunito, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = line.color === '#fccc0a' ? '#1c2340' : '#fff';
      g.fillText(line.bullet, bx, by + 0.5);
      g.textBaseline = 'alphabetic';
    }
    // Street names when zoomed in (halo labels along the roads).
    if (scale > 1.2) {
      // Labels sit where you're looking: avenue names across the middle of
      // the screen, street names a little in from the left edge.
      g.textAlign = 'center';
      const midZ = (h * 0.55 - oy) / scale;
      d.avenueNames.forEach((n, i) => {
        g.save();
        g.translate(sx(avenueX(d, i)), sy(midZ));
        g.rotate(-Math.PI / 2);
        halo(n, 0, 4, '700 11px Nunito, system-ui, sans-serif', '#6b7088');
        g.restore();
      });
      const leftX = Math.max(sx(avenueX(d, 0)) + 60, 90);
      d.streetNames.forEach((n, j) => halo(n, leftX, sy(streetZ(d, j)) + 4, '700 11px Nunito, system-ui, sans-serif', '#6b7088'));
    }
    // Area title + water label.
    g.textAlign = 'left';
    halo(d.name, 14, 30, '400 24px "Lilita One", system-ui, sans-serif', '#1c2340');
    halo(d.tagline, 14, 48, '700 12px Nunito, system-ui, sans-serif', '#545c7a');
    g.font = 'italic 800 13px Nunito, system-ui, sans-serif';
    g.fillStyle = '#3d7fb0';
    if (d.water.side === 'west') g.fillText(d.water.label, 12, h - 60);
    else g.fillText(d.water.label, w / 2 - 40, Math.max(64, sy(streetZ(d, 0)) - 30));

    // Places: landmarks as big teardrop pins (always); everything else as
    // small round icons that appear only when you zoom in (no clutter).
    const near = scale > 0.95;
    const list = placesIn(area).sort((a, b) => (a.landmark ? 1 : 0) - (b.landmark ? 1 : 0));
    for (const p of list) {
      const door = doorOf(p);
      const x = sx(door.x);
      const y = sy(door.z);
      const open = isOpen(p, opts.hour);
      if (p.landmark || p.type === 'landmark') {
        pin(x, y, '#ff8a00', p.emoji, near ? 1 : 0.85);
        if (near) {
          g.textAlign = 'center';
          halo(p.name.length > 24 ? `${p.name.slice(0, 23)}…` : p.name, x, y + 14, '800 11px Nunito, system-ui, sans-serif', '#1c2340');
        }
        continue;
      }
      if (!near && p.type !== 'home' && p.type !== 'station') continue;
      const r = p.type === 'home' ? 13 : 11;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = p.type === 'home' ? '#3a86ff' : p.type === 'station' ? '#ffffff' : open ? '#ffffff' : '#e3e5ec';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#1c2340';
      g.stroke();
      g.font = `${r + 2}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(p.emoji, x, y + 1);
      g.textBaseline = 'alphabetic';
      if (scale > 1.5) halo(p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name, x, y + r + 12, '700 10.5px Nunito, system-ui, sans-serif', open ? '#3c4257' : '#9aa0b4');
    }

    // You are here: the blue dot with a soft halo.
    if (opts.player.area === area) {
      const x = sx(opts.player.x);
      const y = sy(opts.player.z);
      g.fillStyle = 'rgba(0,122,255,0.18)';
      g.beginPath();
      g.arc(x, y, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#007aff';
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3.5;
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
