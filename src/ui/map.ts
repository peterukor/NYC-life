// =====================================================================
// map.ts — the flat map of New York, borough by borough.
//
//   • ZOOMED OUT: the whole city — all five boroughs in their real shapes
//     (world/geo-proj.ts), each in its own colour, separated by white
//     lines, with big names. Queens, the Bronx and Staten Island say
//     "coming soon · land for sale". Tap a borough to fly into it.
//   • ZOOMED IN: one borough at a time (the others fade). Its playable
//     streets are drawn as roomy blocks — a few big buildings each, so
//     it's easy to read — with parks, plazas, landmarks (by name),
//     billboards (📢, tap to rent), places, and the big neighbourhood
//     names. Everything outside the playable streets is expandable land:
//     faint lots marked "land for sale".
//   • 🧢 Gang view tints crew turf (Manhattan is a safe zone: no colour).
//   • 🛰️ flies over the borough you're in, in 3D (ui/map3d.ts).
// =====================================================================

import { doorOf, isOpen, placesIn, PLACE_BY_ID } from '../data/places.ts';
import { HOODS } from '../data/neighborhoods.ts';
import type { AreaId, GameState } from '../sim/types.ts';
import { SAFE_AREAS, turfMap } from '../sim/gangs.ts';
import { BOROUGHS, boroughAt, boroughBounds, onLand, outline, project, type BoroughId } from '../world/geo-proj.ts';
import { blockRect, districtBounds, DISTRICTS, type DistrictDef } from '../world/layout.ts';
import { html, onAct, root } from './dom.ts';

export interface MapOptions {
  /** The area you're in (its borough is focused first). */
  area: AreaId;
  /** Start zoomed out on the whole city. */
  whole?: boolean;
  player: { area: AreaId; x: number; z: number };
  hour: number;
  state: GameState;
  /** Billboards in the loaded area (tap to rent). */
  billboards?: { id: string; x: number; z: number; tier: string }[];
  onPick: (placeId: string) => void;
  onBillboard?: (slotId: string) => void;
  /** Open the 3D fly-over of the borough you're in. */
  onFlyover?: () => void;
  onClose: () => void;
}

const AREA_OF: Partial<Record<BoroughId, AreaId>> = { manhattan: 'manhattan', brooklyn: 'brooklyn' };
const FONT = 'Nunito, system-ui, sans-serif';

export function openMap(opts: MapOptions): () => void {
  const el = html(`
    <div class="map" role="dialog" aria-label="City map">
      <div class="map-top">
        <div class="map-title" data-title>New York City</div>
        <button class="btn" data-act="city" title="Whole city">🗽</button>
        <button class="btn" data-act="gang" aria-pressed="false" title="Gang view">🧢</button>
        <button class="btn" data-act="fly" title="3D fly-over" hidden>🛰️</button>
        <button class="btn" data-act="close" aria-label="Close map">✕</button>
      </div>
      <canvas></canvas>
      <div class="map-legend" data-legend>Pinch or scroll to zoom · tap a borough</div>
    </div>`);
  root().appendChild(el);
  const canvas = el.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const s = opts.state;

  let scale = 1;
  let ox = 0;
  let oy = 0;
  let wholeScale = 1;
  let gangView = false;
  let focus: BoroughId = DISTRICTS[opts.area].borough;
  const sx = (x: number) => x * scale + ox;
  const sy = (z: number) => z * scale + oy;
  const W = () => canvas.clientWidth;
  const H = () => canvas.clientHeight;

  const fitBox = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, pad = 30) => {
    const sc = Math.min((W() - pad * 2) / (b.maxX - b.minX), (H() - pad * 2 - 60) / (b.maxZ - b.minZ));
    return { sc, ox: W() / 2 - ((b.minX + b.maxX) / 2) * sc, oy: H() / 2 + 20 - ((b.minZ + b.maxZ) / 2) * sc };
  };
  const cityBox = () => {
    const bs = BOROUGHS.map((b) => boroughBounds(b.id));
    return { minX: Math.min(...bs.map((b) => b.minX)), maxX: Math.max(...bs.map((b) => b.maxX)), minZ: Math.min(...bs.map((b) => b.minZ)), maxZ: Math.max(...bs.map((b) => b.maxZ)) };
  };
  const setView = (v: { sc: number; ox: number; oy: number }) => {
    scale = v.sc;
    ox = v.ox;
    oy = v.oy;
  };
  /** Smoothly fly the view to a box. */
  let anim = 0;
  const flyTo = (target: { sc: number; ox: number; oy: number }) => {
    const from = { sc: scale, ox, oy };
    const t0 = performance.now();
    const id = ++anim;
    const step = () => {
      if (id !== anim) return;
      const f = Math.min(1, (performance.now() - t0) / 450);
      const e = 1 - (1 - f) ** 3;
      // Interpolate in log-scale so zooms feel even.
      const sc = Math.exp(Math.log(from.sc) + (Math.log(target.sc) - Math.log(from.sc)) * e);
      setView({ sc, ox: from.ox + (target.ox - from.ox) * e, oy: from.oy + (target.oy - from.oy) * e });
      draw();
      if (f < 1) requestAnimationFrame(step);
    };
    step();
  };
  const boroughView = (id: BoroughId) => {
    // Include landmarks standing off the coast (the Statue of Liberty).
    const b = { ...boroughBounds(id) };
    const area = AREA_OF[id];
    for (const p of area ? placesIn(area) : []) {
      if (!p.model) continue;
      const m = project(p.model[0], p.model[1]);
      b.minX = Math.min(b.minX, m.x - 30);
      b.maxX = Math.max(b.maxX, m.x + 30);
      b.minZ = Math.min(b.minZ, m.z - 30);
      b.maxZ = Math.max(b.maxZ, m.z + 30);
    }
    return fitBox(b, 24);
  };
  const isWhole = () => scale < wholeScale * 1.9;

  // ---------- drawing helpers ----------
  const ring = (pts: { x: number; z: number }[]) => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(sx(p.x), sy(p.z)) : g.moveTo(sx(p.x), sy(p.z))));
    g.closePath();
  };
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + q, y);
    g.arcTo(x + w, y, x + w, y + h, q);
    g.arcTo(x + w, y + h, x, y + h, q);
    g.arcTo(x, y + h, x, y, q);
    g.arcTo(x, y, x + w, y, q);
    g.closePath();
  };
  const halo = (text: string, x: number, y: number, font: string, color = '#3c4257', lw = 4) => {
    g.font = font;
    g.lineJoin = 'round';
    g.lineWidth = lw;
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  };
  const spaced = (t: string) => t.toUpperCase().split('').join(' ');

  // Expandable lots per borough (computed once).
  const lotCache = new Map<AreaId, { x0: number; z0: number; x1: number; z1: number }[]>();
  const lotsOf = (d: DistrictDef) => {
    let lots = lotCache.get(d.id);
    if (lots) return lots;
    lots = [];
    const bb = boroughBounds(d.borough);
    const built = districtBounds(d, 8);
    const px = d.blockW + d.avenueW;
    const pz = d.blockD + d.streetW;
    for (let c = Math.floor((bb.minX - d.origin.x) / px); c < Math.ceil((bb.maxX - d.origin.x) / px); c++) {
      for (let r = Math.floor((bb.minZ - d.origin.z) / pz); r < Math.ceil((bb.maxZ - d.origin.z) / pz); r++) {
        const x0 = d.origin.x + c * px + 9, x1 = d.origin.x + (c + 1) * px - 9;
        const z0 = d.origin.z + r * pz + 8.5, z1 = d.origin.z + (r + 1) * pz - 8.5;
        if (x1 > built.minX && x0 < built.maxX && z1 > built.minZ && z0 < built.maxZ) continue;
        if (onLand(d.borough, (x0 + x1) / 2, (z0 + z1) / 2)) lots.push({ x0, z0, x1, z1 });
      }
    }
    lotCache.set(d.id, lots);
    return lots;
  };

  const ZONE_COLOR: Record<string, string> = { tall: '#a9c3e6', midrise: '#e3c6a0', brownstone: '#d9967a', waterfront: '#c8b398' };
  const ZONE_HEIGHT: Record<string, number> = { tall: 6, midrise: 3.5, brownstone: 2.5, waterfront: 2.5 };

  function drawStreets(d: DistrictDef): void {
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        const kind = d.kind(c, r);
        if (kind === 'water') continue;
        const b = blockRect(d, c, r);
        const x = sx(b.minX), y = sy(b.minZ), w = (b.maxX - b.minX) * scale, h = (b.maxZ - b.minZ) * scale;
        g.fillStyle = kind === 'park' ? '#bfe3a5' : '#efe6d6';
        rr(x, y, w, h, 3 * scale);
        g.fill();
        if (kind === 'park') {
          g.fillStyle = '#7fbf63';
          for (const [fx, fz] of [[0.25, 0.35], [0.6, 0.6], [0.8, 0.3]]) {
            g.beginPath();
            g.arc(x + w * fx, y + h * fz, Math.max(1.5, 5 * scale), 0, Math.PI * 2);
            g.fill();
          }
        } else if (kind === 'plaza') {
          g.fillStyle = '#fbe3a0';
          rr(x + 2 * scale, y + 2 * scale, w - 4 * scale, h - 4 * scale, 3 * scale);
          g.fill();
        } else if (kind === 'vacant') {
          g.save();
          rr(x, y, w, h, 3 * scale);
          g.clip();
          g.strokeStyle = 'rgba(140,110,70,0.25)';
          g.lineWidth = 1.5;
          for (let k = -h; k < w; k += 7) {
            g.beginPath();
            g.moveTo(x + k, y);
            g.lineTo(x + k + h, y + h);
            g.stroke();
          }
          g.restore();
        } else {
          // Two big buildings per block (roomy on purpose), with a little height.
          const zone = d.zone(c, r);
          const col = ZONE_COLOR[zone];
          const lift = ZONE_HEIGHT[zone] * scale;
          const pad = 5 * scale;
          const bw = (w - pad * 3) / 2;
          for (let k = 0; k < 2; k++) {
            const bx = x + pad + k * (bw + pad);
            g.fillStyle = 'rgba(60,50,40,0.16)';
            rr(bx + lift * 0.6, y + pad + lift, bw, h - pad * 2, 2 * scale);
            g.fill();
            g.fillStyle = col;
            rr(bx, y + pad, bw, h - pad * 2, 2 * scale);
            g.fill();
          }
        }
      }
    }
  }

  function draw(): void {
    const w = W();
    const h = H();
    const whole = isWhole();
    if (!whole) {
      const c = boroughAt((w / 2 - ox) / scale, (h / 2 - oy) / scale);
      if (c) focus = c;
    }
    const d = Object.values(DISTRICTS).find((x) => x.borough === focus) ?? null;
    // Title, buttons, legend.
    el.querySelector('[data-title]')!.textContent = whole ? 'New York City' : BOROUGHS.find((b) => b.id === focus)!.name;
    (el.querySelector('[data-act="fly"]') as HTMLElement).hidden = whole || !opts.onFlyover || DISTRICTS[opts.area].borough !== focus;
    el.querySelector('[data-legend]')!.textContent = whole ? 'Tap a borough to explore it' : gangView ? (d && SAFE_AREAS.includes(d.id) ? `${BOROUGHS.find((b) => b.id === focus)!.name} is a SAFE ZONE — no crews here` : 'Coloured blocks are crew turf. ⭐ = their headquarters') : 'Tap a place to go there · pinch out for the whole city';

    // Water with a few waves.
    g.fillStyle = '#8fd0f0';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 40; i++) {
      const wx = ((i * 97) % 100) / 100 * w;
      const wy = ((i * 61) % 100) / 100 * h;
      g.beginPath();
      g.arc(wx, wy, 6, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
    }

    // Boroughs: filled shapes separated by white lines.
    for (const b of BOROUGHS) {
      const dim = !whole && b.id !== focus;
      for (const r of outline(b.id)) {
        ring(r);
        g.fillStyle = dim ? '#e6e2da' : whole ? b.color : '#f4ede0';
        g.fill();
        g.lineWidth = whole ? 3 : 2.5;
        g.strokeStyle = '#ffffff';
        g.stroke();
      }
    }

    if (whole) {
      for (const b of BOROUGHS) {
        const p = project(b.label[0], b.label[1]);
        g.textAlign = 'center';
        halo(b.name, sx(p.x), sy(p.z), `400 ${b.id === 'manhattan' ? 15 : 19}px "Lilita One", system-ui, sans-serif`, '#1c2340', 5);
        halo(b.playable ? 'TAP TO EXPLORE' : 'COMING SOON · LAND FOR SALE', sx(p.x), sy(p.z) + 15, `800 9px ${FONT}`, b.playable ? '#2a6f3a' : '#9a3c2a', 4);
      }
    } else if (d) {
      // Expandable land: faint lots.
      g.strokeStyle = 'rgba(150,130,100,0.25)';
      g.lineWidth = 1;
      if (scale > 0.25) for (const l of lotsOf(d)) g.strokeRect(sx(l.x0), sy(l.z0), (l.x1 - l.x0) * scale, (l.z1 - l.z0) * scale);
      drawStreets(d);
      // Gang view.
      if (gangView && !SAFE_AREAS.includes(d.id)) {
        for (const t of turfMap(s, d.id)) {
          const b = blockRect(d, t.c, t.r);
          g.fillStyle = `${t.crew.color}88`;
          rr(sx(b.minX), sy(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale, 3 * scale);
          g.fill();
          if (t.base) {
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.font = '16px system-ui, "Apple Color Emoji", sans-serif';
            g.fillText(`⭐${t.crew.emoji}`, sx((b.minX + b.maxX) / 2), sy((b.minZ + b.maxZ) / 2));
            g.textBaseline = 'alphabetic';
          }
        }
      }
      // Labels never pile up: landmark names claim their space first, then
      // neighbourhood names only go where there's room.
      const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const free = (x: number, y: number, bw: number, bh: number) => {
        const b = { x0: x - bw / 2, y0: y - bh / 2, x1: x + bw / 2, y1: y + bh / 2 };
        if (boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)) return false;
        boxes.push(b);
        return true;
      };
      const area = AREA_OF[focus];
      const places = area ? placesIn(area) : [];
      const marks = places
        .filter((x) => x.landmark || x.type === 'landmark')
        .map((p) => ({ p, at: p.model ? project(p.model[0], p.model[1]) : project(p.at[0], p.at[1]) }))
        .filter(({ p, at }) => {
          g.font = `900 11px ${FONT}`;
          return free(sx(at.x), sy(at.z) + 6, Math.max(26, g.measureText(p.name).width + 6), 34);
        });
      // Neighbourhood names (spaced capitals); the ones outside the
      // playable streets are land for sale.
      const built = districtBounds(d, 0);
      g.textAlign = 'center';
      const size = Math.max(10, Math.min(17, 10 * scale + 6));
      for (const hd of HOODS.filter((x) => x.borough === focus)) {
        const p = project(hd.at[0], hd.at[1]);
        const inside = p.x > built.minX && p.x < built.maxX && p.z > built.minZ && p.z < built.maxZ;
        g.font = `900 ${size}px ${FONT}`;
        const label = spaced(hd.name);
        if (!free(sx(p.x), sy(p.z) + (inside ? 0 : size * 0.4), g.measureText(label).width + 4, inside ? size + 2 : size * 1.9)) continue;
        halo(label, sx(p.x), sy(p.z), `900 ${size}px ${FONT}`, 'rgba(70,64,90,0.75)', 4);
        if (!inside) halo('LAND FOR SALE', sx(p.x), sy(p.z) + size, `800 ${Math.max(8, size * 0.6)}px ${FONT}`, '#b04a2f', 3);
      }
      // Landmarks: their names where they stand.
      for (const { p, at } of marks) {
        const x = sx(at.x), y = sy(at.z);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '18px system-ui, "Apple Color Emoji", sans-serif';
        g.fillText(p.emoji, x, y - 4);
        g.textBaseline = 'alphabetic';
        halo(p.name, x, y + 16, `900 11px ${FONT}`, '#c4410c', 4);
      }
      // Billboards: bright and easy to spot.
      if (area === opts.area && opts.billboards && scale > 0.45) {
        const used: { x: number; y: number }[] = [];
        for (const bb of opts.billboards) {
          const x = sx(bb.x), y = sy(bb.z);
          if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
          if (used.some((u) => Math.abs(u.x - x) < 30 && Math.abs(u.y - y) < 30)) continue;
          used.push({ x, y });
          g.fillStyle = bb.tier === 'hub' ? '#ff4fa3' : '#ffd23f';
          rr(x - 11, y - 11, 22, 22, 6);
          g.fill();
          g.lineWidth = 2;
          g.strokeStyle = '#1c2340';
          g.stroke();
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = '12px system-ui, "Apple Color Emoji", sans-serif';
          g.fillText('📢', x, y + 1);
          g.textBaseline = 'alphabetic';
        }
      }
      // Places (homes and stations always; the rest when zoomed in).
      for (const p of places) {
        if (p.landmark || p.type === 'landmark') continue;
        const near = scale > 0.9;
        if (!near && p.type !== 'home' && p.type !== 'station') continue;
        if (p.type === 'home' && p.id !== s.home.placeId && !near) continue;
        const door = doorOf(p);
        const x = sx(door.x), y = sy(door.z);
        const r = p.id === s.home.placeId ? 12 : 10;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = p.id === s.home.placeId ? '#3a86ff' : isOpen(p, opts.hour) ? '#ffffff' : '#e3e5ec';
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = '#1c2340';
        g.stroke();
        g.font = `${r + 1}px system-ui, "Apple Color Emoji", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(p.emoji, x, y + 1);
        g.textBaseline = 'alphabetic';
        if (scale > 1.6) halo(p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name, x, y + r + 11, `700 10px ${FONT}`);
      }
    }

    // You are here.
    const me = { x: sx(opts.player.x), y: sy(opts.player.z) };
    g.fillStyle = 'rgba(0,122,255,0.2)';
    g.beginPath();
    g.arc(me.x, me.y, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#007aff';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(me.x, me.y, 6.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  // ---------- pan / zoom / tap ----------
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let moved = false;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    anim++;
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
      ox += cur.x - prev.x;
      oy += cur.y - prev.y;
      if (Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) > 2) moved = true;
      draw();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = canvas.getBoundingClientRect();
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, dist / (pinchDist || dist));
      pinchDist = dist;
      moved = true;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const wasTap = pointers.size === 1 && !moved;
    pointers.delete(e.pointerId);
    if (!wasTap) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const wx = (px - ox) / scale;
    const wz = (py - oy) / scale;
    if (isWhole()) {
      const b = boroughAt(wx, wz);
      if (b) {
        focus = b;
        flyTo(boroughView(b));
      }
      return;
    }
    // Billboards first, then places.
    if (opts.billboards && opts.onBillboard && AREA_OF[focus] === opts.area) {
      const hit = opts.billboards.find((bb) => Math.hypot(sx(bb.x) - px, sy(bb.z) - py) < 14);
      if (hit) return opts.onBillboard(hit.id);
    }
    const area = AREA_OF[focus];
    if (!area) return;
    let best: { id: string; d: number } | null = null;
    for (const p of placesIn(area)) {
      const at = p.landmark || p.type === 'landmark' ? (p.model ? project(p.model[0], p.model[1]) : project(p.at[0], p.at[1])) : doorOf(p);
      const dd = Math.hypot(sx(at.x) - px, sy(at.z) - py);
      if (dd < 26 && (!best || dd < best.d)) best = { id: p.id, d: dd };
    }
    if (best && PLACE_BY_ID[best.id]) opts.onPick(best.id);
  });
  canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    anim++;
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  function zoomAt(px: number, py: number, factor: number): void {
    const next = Math.min(wholeScale * 40, Math.max(wholeScale * 0.8, scale * factor));
    const f = next / scale;
    ox = px - (px - ox) * f;
    oy = py - (py - oy) * f;
    scale = next;
    draw();
  }

  onAct(el, (act) => {
    if (act === 'close') return void close();
    if (act === 'city') return flyTo(fitBox(cityBox(), 14));
    if (act === 'fly') {
      close();
      return opts.onFlyover?.();
    }
    if (act === 'gang') {
      gangView = !gangView;
      el.querySelector('[data-act="gang"]')!.setAttribute('aria-pressed', String(gangView));
      el.querySelector<HTMLElement>('[data-act="gang"]')!.classList.toggle('primary', gangView);
      return draw();
    }
  });

  // Test hook (scripts/qa-map3d.mjs): where a real lat/lon is on screen.
  (window as unknown as Record<string, unknown>).__mapPoint = (lat: number, lon: number) => {
    const p = project(lat, lon);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + sx(p.x), y: r.top + sy(p.z) };
  };

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };
  window.addEventListener('resize', resize);
  requestAnimationFrame(() => {
    wholeScale = fitBox(cityBox(), 14).sc;
    setView(opts.whole ? fitBox(cityBox(), 14) : boroughView(focus));
    resize();
  });

  function close(): void {
    window.removeEventListener('resize', resize);
    el.remove();
    opts.onClose();
  }
  return close;
}

