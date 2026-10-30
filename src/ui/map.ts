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

import { doorOf, isOpen, placesIn, PLACE_BY_ID, type PlaceDef } from '../data/places.ts';
import { CITY_MAP, hasCityMap, placeOnMap } from '../sim/citymap.ts';
import { HOODS } from '../data/neighborhoods.ts';
import type { AreaId, GameState } from '../sim/types.ts';
import { SAFE_AREAS, turfMap } from '../sim/gangs.ts';
import { BOROUGHS, X_STRETCH, boroughAt, boroughBounds, outline, pointInRing, project, type BoroughId } from '../world/geo-proj.ts';
import { streetStubs, stubRect, blockRect, districtBounds, DISTRICTS, isPark, type DistrictDef } from '../world/layout.ts';
import { corridorsIn } from '../world/corridors.ts';
import { adBoardRect, adSplit, islandWeekly, plotsIn } from '../data/plots.ts';
import { lotsFor, shoreFeatures, shoreKinds, type ShoreKind } from '../world/coast.ts';
import { pondsFor } from '../data/parks.ts';
import { html, onAct, root } from './dom.ts';

/** Pin colours by kind of place (one colour per kind, light so the emoji reads). */
const PIN_COLOR: Partial<Record<PlaceDef['type'], string>> = {
  food: '#ffd6a5', cafe: '#e9d5c0', nightlife: '#e0c3fc', fitness: '#b9fbc0', work: '#bde0fe',
  shop: '#a0e7e5', fun: '#ffc8dd', park: '#caffbf', plaza: '#fdffb6', station: '#ffffff', home: '#ffffff',
};

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
  /** Tap an ad block, a home lot or an island for rent (data/plots.ts). */
  onPlot?: (plotId: string) => void;
  /** Open the 3D fly-over of the borough you're in. */
  onFlyover?: () => void;
  /** Buy the 🗺️ Full City Map (sim/citymap.ts). Returns true when bought. */
  onBuyMap?: () => boolean;
  onClose: () => void;
}

const AREA_OF: Partial<Record<BoroughId, AreaId>> = { manhattan: 'manhattan', brooklyn: 'brooklyn', bronx: 'bronx', queens: 'queens' };
const FONT = 'Nunito, system-ui, sans-serif';

export function openMap(opts: MapOptions): () => void {
  const el = html(`
    <div class="map" role="dialog" aria-label="City map">
      <div class="map-top">
        <div class="map-title" data-title>New York City</div>
        <button class="btn" data-act="me" title="Centre on me" aria-label="Centre the map on me">📍</button>
        <button class="btn" data-act="city" title="Whole city">🗽</button>
        <button class="btn" data-act="gang" aria-pressed="false" title="Gang view">🧢</button>
        <button class="btn" data-act="fly" title="3D fly-over" hidden>🛰️</button>
        <button class="btn" data-act="close" aria-label="Close map">✕</button>
      </div>
      <canvas></canvas>
      <div class="map-filters" data-filters></div>
      <div class="map-legend" data-legend>Pinch or scroll to zoom · tap a borough</div>
    </div>`);
  root().appendChild(el);
  const canvas = el.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const s = opts.state;
  // 🗺️ Which places show (all with the Full City Map), and the kind filter.
  const FILTERS: [string, string][] = [['', 'All'], ['food', '🍕'], ['cafe', '☕'], ['nightlife', '🪩'], ['fun', '🎲'], ['shop', '🛍️'], ['fitness', '💪'], ['work', '💼'], ['park', '🌳']];
  let kind = '';
  const shown = (p: PlaceDef) => placeOnMap(s, p, opts.player) && (!kind || p.type === kind || p.type === 'home' || p.type === 'station');
  const drawFilters = () => {
    const box = el.querySelector<HTMLElement>('[data-filters]')!;
    box.innerHTML = hasCityMap(s)
      ? FILTERS.map(([k, label]) => `<button class="map-chip${k === kind ? ' on' : ''}" data-act="kind:${k}" aria-pressed="${k === kind}">${label}</button>`).join('')
      : opts.onBuyMap
        ? `<button class="map-chip buy" data-act="buymap">🗺️ Full City Map · $${CITY_MAP.price / 100}<small>see every place</small></button>`
        : '';
  };
  drawFilters();

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
    for (const p of area && id !== 'manhattan' ? placesIn(area) : []) {
      if (!p.model) continue;
      const m = project(p.model[0], p.model[1]);
      b.minX = Math.min(b.minX, m.x - 30);
      b.maxX = Math.max(b.maxX, m.x + 30);
      b.minZ = Math.min(b.minZ, m.z - 30);
      b.maxZ = Math.max(b.maxZ, m.z + 30);
    }
    return fitBox(b, id === 'manhattan' ? 6 : 24);
  };
  /**
   * Manhattan map view (Peter, 2026-10-12: "bring it closer, it's okay if
   * they have to scroll"): the island's width fills the screen, centred on
   * where you are; scroll up and down for the rest.
   */
  const closeView = () => {
    const b = boroughBounds('manhattan');
    // Same closeness as before the island was widened (X_STRETCH): scroll sideways for the rest.
    // …and up to 0.75 of the island's length on screen (Peter, 2026-10-15: "a bit further out", twice;
    // 0.5 → 0.6 → 0.75; 2026-10-30: back to 0.6 so the 📢 ad spaces read when the map opens).
    // The width fit gets a 60% margin so wide screens pull back too.
    const sc = Math.max((W() - 16) / ((1.6 * (b.maxX - b.minX)) / X_STRETCH), H() / (0.6 * (b.maxZ - b.minZ)));
    return clampView({ sc, ox: W() / 2 - s.location.x * sc, oy: H() / 2 + 20 - s.location.z * sc });
  };
  /** Keep Manhattan on screen: no scrolling off into the water. */
  const clampView = (v: { sc: number; ox: number; oy: number }) => {
    const b = boroughBounds('manhattan');
    const fit = (o: number, lo: number, hi: number, size: number, top: number, bottom: number) => {
      const span = (hi - lo) * v.sc;
      if (span <= size - top - bottom) return top + (size - top - bottom) / 2 - ((lo + hi) / 2) * v.sc;
      return Math.min(top + 8 - lo * v.sc, Math.max(size - bottom - 8 - hi * v.sc, o));
    };
    return { sc: v.sc, ox: fit(v.ox, b.minX, b.maxX, W(), 0, 0), oy: fit(v.oy, b.minZ, b.maxZ, H(), 64, 52) };
  };
  const isWhole = () => false; // no five-borough view any more: Manhattan is the city

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

  const lotsOf = (d: DistrictDef) => lotsFor(d);

  const ZONE_COLOR: Record<string, string> = { tall: '#a9c3e6', midrise: '#e3c6a0', brownstone: '#d9967a', waterfront: '#c8b398' };
  const ZONE_HEIGHT: Record<string, number> = { tall: 6, midrise: 3.5, brownstone: 2.5, waterfront: 2.5 };

  /** Seeded 0..1 numbers per block, so the drawing never flickers. */
  const seeded = (c: number, r: number, k: number) => {
    const v = Math.sin(c * 127.1 + r * 311.7 + k * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const shadeHex = (hex: string, f: number) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  };

  function drawStreets(d: DistrictDef): void {
    const ponds = pondsFor(d);
    // 1. The street network: a light pavement under every real block.
    g.fillStyle = '#f3efe6';
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        if (d.kind(c, r) === 'water') continue;
        const b = blockRect(d, c, r);
        g.fillRect(sx(b.minX - d.avenueW / 2), sy(b.minZ - d.streetW / 2), (b.maxX - b.minX + d.avenueW) * scale, (b.maxZ - b.minZ + d.streetW) * scale);
      }
    }
    // Streets running on to the ring highway (layout.ts streetStubs).
    for (const st of streetStubs(d)) {
      const b = stubRect(st);
      g.fillRect(sx(b.minX), sy(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
    }
    // 2. Blocks.
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        const kind = d.kind(c, r);
        if (kind === 'water') continue;
        const b = blockRect(d, c, r);
        if (kind === 'park') {
          // One green patch: grow into neighbouring park blocks (no streets inside parks).
          const W = isPark(d, c - 1, r) ? d.avenueW / 2 + 1 : 0;
          const E = isPark(d, c + 1, r) ? d.avenueW / 2 + 1 : 0;
          const N = isPark(d, c, r - 1) ? d.streetW / 2 + 1 : 0;
          const S = isPark(d, c, r + 1) ? d.streetW / 2 + 1 : 0;
          g.fillStyle = '#a9d98a';
          g.fillRect(sx(b.minX - W), sy(b.minZ - N), (b.maxX - b.minX + W + E) * scale, (b.maxZ - b.minZ + N + S) * scale);
          g.fillStyle = '#6fb257';
          for (let k = 0; k < 7; k++) {
            const tx = b.minX + seeded(c, r, k) * (b.maxX - b.minX);
            const tz = b.minZ + seeded(c, r, k + 20) * (b.maxZ - b.minZ);
            if (ponds.some((p) => ((tx - p.x) / (p.rx + 5)) ** 2 + ((tz - p.z) / (p.rz + 5)) ** 2 < 1)) continue;
            g.beginPath();
            g.arc(sx(tx), sy(tz), Math.max(1.4, (3 + seeded(c, r, k + 40) * 3) * scale), 0, Math.PI * 2);
            g.fill();
          }
          continue;
        }
        const x = sx(b.minX), y = sy(b.minZ), w = (b.maxX - b.minX) * scale, h = (b.maxZ - b.minZ) * scale;
        g.fillStyle = '#e8dfcf';
        rr(x, y, w, h, 3 * scale);
        g.fill();
        if (kind === 'plaza') {
          g.fillStyle = '#fbe3a0';
          rr(x + 2 * scale, y + 2 * scale, w - 4 * scale, h - 4 * scale, 3 * scale);
          g.fill();
        } else if (kind === 'lot') {
          // Empty land to rent for a house.
          g.fillStyle = '#cfe3a6';
          rr(x + 2 * scale, y + 2 * scale, w - 4 * scale, h - 4 * scale, 3 * scale);
          g.fill();
          g.setLineDash([4, 3]);
          g.strokeStyle = '#7aa04e';
          g.lineWidth = 1.2;
          g.stroke();
          g.setLineDash([]);
        } else if (kind === 'ads') {
          // Ad block: the block is the ad, two bright halves (split across the longer side).
          const cols = ['#ff4f8b', '#3b82f6'];
          const pad = 3 * scale;
          const alongX = adSplit(b) === 'x';
          for (let k = 0; k < 2; k++) {
            g.fillStyle = cols[k];
            const half = alongX
              ? { minX: b.minX + 3 + ((b.maxX - b.minX - 9) / 2 + 3) * k, minZ: b.minZ + 3, maxX: 0, maxZ: b.maxZ - 3 }
              : { minX: b.minX + 3, minZ: b.minZ + 3 + ((b.maxZ - b.minZ - 9) / 2 + 3) * k, maxX: b.maxX - 3, maxZ: 0 };
            if (alongX) half.maxX = half.minX + (b.maxX - b.minX - 9) / 2;
            else half.maxZ = half.minZ + (b.maxZ - b.minZ - 9) / 2;
            const q = adBoardRect(half); // square-ish, like the 3D boards
            rr(sx(q.minX), sy(q.minZ), (q.maxX - q.minX) * scale, (q.maxZ - q.minZ) * scale, 2 * scale);
            g.fill();
          }
          void pad;
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
          // A few buildings of different sizes, set back by different
          // amounts — never two identical rectangles.
          const zone = d.zone(c, r);
          const base = ZONE_COLOR[zone];
          const lift = ZONE_HEIGHT[zone] * scale;
          const pad = 4 * scale;
          const count = zone === 'tall' ? 2 + Math.floor(seeded(c, r, 1) * 2) : 2 + Math.floor(seeded(c, r, 1) * 3);
          // Random split points along the block.
          const cuts = [0, ...Array.from({ length: count - 1 }, (_, k) => (k + 0.6 + seeded(c, r, k + 5) * 0.8) / count), 1];
          for (let k = 0; k < count; k++) {
            const f0 = cuts[k], f1 = cuts[k + 1];
            const bx = x + pad + (w - pad * 2) * f0 + pad * 0.4;
            const bw = (w - pad * 2) * (f1 - f0) - pad * 0.8;
            const full = zone === 'tall' || seeded(c, r, k + 9) < 0.35;
            const north = seeded(c, r, k + 13) < 0.5;
            const dep = (h - pad * 2) * (full ? 0.8 + seeded(c, r, k + 17) * 0.2 : 0.4 + seeded(c, r, k + 17) * 0.15);
            const set = (h - pad * 2) * seeded(c, r, k + 23) * 0.08;
            const by = full ? y + pad + set : north ? y + pad + set : y + h - pad - dep - set;
            const color = shadeHex(base, 0.88 + seeded(c, r, k + 29) * 0.24);
            g.fillStyle = 'rgba(60,50,40,0.16)';
            rr(bx + lift * 0.6, by + lift, bw, dep, 2 * scale);
            g.fill();
            g.fillStyle = color;
            rr(bx, by, bw, dep, 2 * scale);
            g.fill();
            // Some half-depth blocks get a second building on the other side.
            if (!full && seeded(c, r, k + 33) < 0.7) {
              const dep2 = (h - pad * 2) * (0.35 + seeded(c, r, k + 37) * 0.15);
              const by2 = north ? y + h - pad - dep2 : y + pad;
              g.fillStyle = shadeHex(base, 0.85 + seeded(c, r, k + 41) * 0.25);
              rr(bx + bw * 0.08, by2, bw * (0.7 + seeded(c, r, k + 43) * 0.3), dep2, 2 * scale);
              g.fill();
            }
          }
        }
      }
    }
    // 2b. Off-grid roads on top (world/corridors.ts): Broadway as a street,
    // the ring highway in highway yellow with a dark edge.
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const c of corridorsIn(d.id)) {
      const path = () => {
        g.beginPath();
        c.pts.forEach((p, i) => (i ? g.lineTo(sx(p.x), sy(p.z)) : g.moveTo(sx(p.x), sy(p.z))));
        if (c.loop) g.closePath();
      };
      path();
      g.strokeStyle = c.highway ? '#c99a3c' : '#ddd3c0';
      g.lineWidth = Math.max(2.5, (c.width + (c.highway ? 3 : 9)) * scale);
      g.stroke();
      g.strokeStyle = c.highway ? '#ffd37a' : '#f3efe6';
      g.lineWidth = Math.max(1.5, (c.width - (c.highway ? 1 : -4)) * scale);
      g.stroke();
    }
    // 3. Lakes.
    for (const p of ponds) {
      g.fillStyle = '#6cc0ea';
      g.beginPath();
      g.ellipse(sx(p.x), sy(p.z), p.rx * scale, p.rz * scale, 0, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#e8dfcc';
      g.stroke();
    }
  }

  /** Waterfront: promenade along the shore, trees, piers and ferries. */
  function drawShore(d: DistrictDef): void {
    // The shore varies: promenade, dense bush, rocks, beach (world/coast.ts).
    const COLORS: Record<ShoreKind, string> = { beach: '#f1dfae', bush: '#5d9a49', rocks: '#b3aea5', promenade: '#ece3cf' };
    let ringNo = 0;
    for (const r of outline(d.borough)) {
      const kinds = shoreKinds(r, ++ringNo * 1.7);
      g.save();
      ring(r);
      g.clip();
      g.lineCap = 'round';
      g.lineWidth = Math.max(3, (kinds.length ? 14 : 12) * scale);
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        g.strokeStyle = COLORS[kinds[i]];
        g.beginPath();
        g.moveTo(sx(a.x), sy(a.z));
        g.lineTo(sx(b.x), sy(b.z));
        g.stroke();
      }
      g.restore();
    }
    const f = shoreFeatures(d);
    if (scale > 0.3) {
      g.fillStyle = '#3f7a34';
      for (const t of f.bushes) {
        const x = sx(t.x), y = sy(t.z);
        if (x < -10 || y < -10 || x > W() + 10 || y > H() + 10) continue;
        g.beginPath();
        g.arc(x, y, Math.max(1.2, 2.6 * t.s * scale), 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#5fa84d';
      for (const t of f.trees) {
        const x = sx(t.x), y = sy(t.z);
        if (x < -10 || y < -10 || x > W() + 10 || y > H() + 10) continue;
        g.beginPath();
        g.arc(x, y, Math.max(1.3, 3.2 * t.s * scale), 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const p of f.piers) {
      const ang = Math.atan2(p.oz, p.ox);
      g.save();
      g.translate(sx(p.x), sy(p.z));
      g.rotate(ang);
      g.fillStyle = '#d9d0c0';
      g.fillRect(-2 * scale, -5.5 * scale, p.L * scale, 11 * scale);
      g.strokeStyle = 'rgba(80,70,50,0.35)';
      g.lineWidth = 1;
      g.strokeRect(-2 * scale, -5.5 * scale, p.L * scale, 11 * scale);
      if (p.ferry) {
        g.fillStyle = '#ffffff';
        rr(p.L * 0.43 * scale, 7 * scale, 24 * scale, 8 * scale, 3 * scale);
        g.fill();
        g.fillStyle = '#2f6fb3';
        g.fillRect(p.L * 0.43 * scale + 6 * scale, 9 * scale, 12 * scale, 4 * scale);
      }
      g.restore();
    }
  }

  function draw(): void {
    const w = W();
    const h = H();
    const whole = isWhole();
    // Manhattan only (Peter, 2026-10-12): the map is the island, framed
    // tight, and never zooms out past it to the other boroughs.
    focus = 'manhattan';
    const d = Object.values(DISTRICTS).find((x) => x.borough === focus) ?? null;
    // Title, buttons, legend.
    el.querySelector('[data-title]')!.textContent = whole ? 'New York City' : BOROUGHS.find((b) => b.id === focus)!.name;
    (el.querySelector('[data-act="fly"]') as HTMLElement).hidden = whole || !opts.onFlyover || DISTRICTS[opts.area].borough !== focus;
    el.querySelector('[data-legend]')!.textContent = whole ? 'Tap a borough to explore it' : gangView ? (d && SAFE_AREAS.includes(d.id) ? `${BOROUGHS.find((b) => b.id === focus)!.name} is a SAFE ZONE — no crews here` : 'Coloured blocks are crew turf. ⭐ = their headquarters') : 'Tap a place to go there · pinch to zoom';

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
        g.fillStyle = dim ? '#e6e2da' : whole ? b.color : '#d6e8c3';
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
      drawShore(d);
      // Expandable land: faint lots.
      g.strokeStyle = 'rgba(120,140,90,0.3)';
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
        if (!inside) halo('LOTS FOR RENT', sx(p.x), sy(p.z) + size, `800 ${Math.max(8, size * 0.6)}px ${FONT}`, '#b04a2f', 3);
      }
      // Plots for rent: ad blocks and islands (data/plots.ts).
      g.textAlign = 'center';
      for (const pl of area ? plotsIn(area) : []) {
        if (pl.kind === 'island') {
          halo(`🏝️ ${pl.name}`, sx(pl.center.x), sy(pl.center.z) - 4, `900 ${Math.max(9, Math.min(13, 8 * scale + 5))}px ${FONT}`, '#0e7490', 4);
          halo(`FOR RENT · $${islandWeekly(pl.islandPrice ?? 0).toFixed(2)}/wk`, sx(pl.center.x), sy(pl.center.z) + 10, `800 9px ${FONT}`, '#b04a2f', 3);
        } else if (pl.kind === 'ad' && scale > 0.22) {
          halo('📢 AD SPACE', sx(pl.center.x), sy(pl.center.z) + 4, `900 ${Math.max(8, Math.min(12, 6 * scale + 5))}px ${FONT}`, '#be185d', 3);
        }
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
      // Places (homes and stations always; the rest when zoomed in). Pins are coloured by kind,
      // and places you can walk into get a gold ring (2026-10-30: easier to read next to the ads).
      const full = hasCityMap(s);
      for (const p of places) {
        if (p.landmark || p.type === 'landmark') continue;
        if (!shown(p)) continue;
        // With the Full City Map places show from further out (and a filter shows its kind at any zoom).
        const near = scale > (full ? (kind ? 0 : 0.42) : 0.9);
        if (!near && p.type !== 'home' && p.type !== 'station') continue;
        if (p.type === 'home' && p.id !== s.home.placeId && !near) continue;
        const door = doorOf(p);
        const x = sx(door.x), y = sy(door.z);
        const mine = p.id === s.home.placeId;
        const r = mine ? 14 : 12;
        const walkIn = p.interior !== 'none';
        if (walkIn && !mine) {
          g.beginPath();
          g.arc(x, y, r + 3, 0, Math.PI * 2);
          g.fillStyle = '#ffd23f';
          g.fill();
        }
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = mine ? '#3a86ff' : isOpen(p, opts.hour) ? PIN_COLOR[p.type] ?? '#ffffff' : '#d5d8e0';
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = '#1c2340';
        g.stroke();
        g.font = `${r + 1}px system-ui, "Apple Color Emoji", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(p.emoji, x, y + 1);
        g.textBaseline = 'alphabetic';
        if (scale > (full ? 0.7 : 1.6)) halo(p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name, x, y + r + 12, `800 10px ${FONT}`);
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
      ({ ox, oy } = clampView({ sc: scale, ox: ox + cur.x - prev.x, oy: oy + cur.y - prev.y }));
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
    // Plots for rent first (islands, ad blocks), then billboards, then places.
    if (opts.onPlot && AREA_OF[focus]) {
      const wx2 = (px - ox) / scale, wz2 = (py - oy) / scale;
      const hitPlot = plotsIn(AREA_OF[focus]!).find((pl) =>
        pl.kind === 'island' ? !!pl.ring && pointInRing(wx2, wz2, pl.ring) : pl.kind === 'ad' && !!pl.rect && wx2 > pl.rect.minX && wx2 < pl.rect.maxX && wz2 > pl.rect.minZ && wz2 < pl.rect.maxZ,
      );
      if (hitPlot) return opts.onPlot(hitPlot.id);
    }
    if (opts.billboards && opts.onBillboard && AREA_OF[focus] === opts.area) {
      const hit = opts.billboards.find((bb) => Math.hypot(sx(bb.x) - px, sy(bb.z) - py) < 14);
      if (hit) return opts.onBillboard(hit.id);
    }
    const area = AREA_OF[focus];
    if (!area) return;
    let best: { id: string; d: number } | null = null;
    for (const p of placesIn(area)) {
      if (!shown(p)) continue;
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
    const next = Math.min(wholeScale * 40, Math.max(wholeScale, scale * factor));
    const f = next / scale;
    ({ ox, oy } = clampView({ sc: next, ox: px - (px - ox) * f, oy: py - (py - oy) * f }));
    scale = next;
    draw();
  }

  onAct(el, (act) => {
    if (act === 'close') return void close();
    if (act === 'buymap') {
      if (opts.onBuyMap?.()) {
        drawFilters();
        draw();
      }
      return;
    }
    if (act.startsWith('kind:')) {
      kind = act.slice(5);
      drawFilters();
      return draw();
    }
    if (act === 'city') return flyTo(closeView());
    // 📍 You in the middle, at the zoom you're at (Peter, 2026-10-15).
    if (act === 'me') return flyTo(clampView({ sc: scale, ox: W() / 2 - opts.player.x * scale, oy: H() / 2 + 20 - opts.player.z * scale }));
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

  // Test hook: centre the map on a real lat/lon at a zoom (scripts/qa-north*.mjs).
  (window as unknown as Record<string, unknown>).__mapView = (lat: number, lon: number, sc: number) => {
    const p = project(lat, lon);
    setView({ sc, ox: W() / 2 - p.x * sc, oy: H() / 2 - p.z * sc });
    draw();
  };
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
    focus = 'manhattan';
    // Furthest zoom-out: the close view (no shrinking the island to a strip).
    wholeScale = closeView().sc;
    setView(closeView());
    resize();
  });

  function close(): void {
    window.removeEventListener('resize', resize);
    el.remove();
    opts.onClose();
  }
  return close;
}

