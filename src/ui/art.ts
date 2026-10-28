// =====================================================================
// art.ts (ui) — the easel and the gallery wall at the Bowery Art Parlor.
//
// 🎨 Easel: a little paint app. Seven tools (✏️ pencil, 🖍️ marker,
// 💧 watercolour, 💨 spray can, 🧽 eraser, 🪣 fill, ⭐ stickers), a size
// slider, 16 colours plus a 🌈 picker and your recent colours, undo/redo,
// three surfaces (🖼️ canvas, 📜 paper, 🧱 brick wall) and 🪞 mirror.
// Strokes are smoothed (quadratic curves through midpoints) and get
// thinner when you move fast, fuller when you go slow; a pen's real
// pressure wins. Hold the spray can still and it drips.
// Then a title, today's 💡 prompt (tick it if you painted it), hang it.
//
// 🖼️ Gallery: the 🏆 Show of the week, collector offers (sell or pass),
// and the wall: most liked first, yours marked, likes ticking up live.
//
// Layers on the easel: surface (texture) → paint → the stroke in
// progress → grain (multiply), all 512×512, shown at the phone's width.
// Rules and likes: sim/art.ts.
// =====================================================================

import './art.css';
import { esc, money } from '../core/format.ts';
import { nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { ART, artOf, artPrompt, declineArt, floodMask, galleryWall, likesNow, mayReoffer, pickEncoding, pressureFeel, sellArt, showOfWeek, Smoother, submitArt, type Pt } from '../sim/art.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { onAct, openModal, openSheet, toast } from './dom.ts';
import { burstAt, buzz } from './juice.ts';

export interface ArtHost {
  state: GameState;
  saved: () => void;
  /** A painting went up (challenges). */
  onArt?: () => void;
  /** Sold to a collector (Artist path). */
  onSold?: () => void;
  /** 🌐 Signed in: also hang it on the players' wall. */
  onHang?: (title: string, img: string) => void;
  /** 🌐 Signed in: the players' wall (likes). */
  net?: { loadWall: () => Promise<{ id: number; title: string; img: string; likes: number; artist: string; liked: boolean; mine: boolean }[]>; like: (id: number) => Promise<number | null>; report: (kind: 'art', target: string, reason: string) => Promise<void> };
}

/** Canvas size (pixels). Shown at about 343 px wide on a phone. */
const N = 512;
const UNDO = 20;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Tool = 'pencil' | 'marker' | 'water' | 'spray' | 'eraser' | 'fill' | 'stamp';
const TOOLS: { id: Tool; emoji: string; name: string; short?: string }[] = [
  { id: 'pencil', emoji: '✏️', name: 'Pencil' },
  { id: 'marker', emoji: '🖍️', name: 'Marker' },
  { id: 'water', emoji: '💧', name: 'Watercolour', short: 'Water' },
  { id: 'spray', emoji: '💨', name: 'Spray can' },
  { id: 'eraser', emoji: '🧽', name: 'Eraser' },
  { id: 'fill', emoji: '🪣', name: 'Fill' },
  { id: 'stamp', emoji: '⭐', name: 'Stickers' },
];
/** How each tool looks while you paint (the in-progress stroke's opacity and blend). */
const LOOK: Partial<Record<Tool, { alpha: number; blend: GlobalCompositeOperation }>> = {
  pencil: { alpha: 0.88, blend: 'source-over' },
  marker: { alpha: 1, blend: 'source-over' },
  water: { alpha: 0.85, blend: 'multiply' },
  spray: { alpha: 1, blend: 'source-over' },
};

const PALETTE = ['#1c2340', '#111111', '#ffffff', '#8a90a8', '#e63946', '#ff6319', '#ffc629', '#80b918', '#00843d', '#2a9d8f', '#3a86ff', '#0039a6', '#9b5de5', '#ff8fab', '#8d5524', '#f1c27d'];
const STICKERS = ['🐦', '🍕', '🗽', '🌇', '🚕', '⭐', '💖', '🐀', '🌳', '☁️', '🐈', '🚇'];

type Surface = 'canvas' | 'paper' | 'brick';
const SURFACES: { id: Surface; emoji: string; name: string }[] = [
  { id: 'canvas', emoji: '🖼️', name: 'Canvas' },
  { id: 'paper', emoji: '📜', name: 'Paper' },
  { id: 'brick', emoji: '🧱', name: 'Brick wall' },
];

/** Your colours, most recent first (kept while the game is open). */
const recent: string[] = [];

/** A painting you walked away from: it's still on the easel when you come back. */
let draft: { data: ImageData; surface: Surface; used: string[]; tools: Tool[]; strokes: number; title: string } | null = null;

/** What the gallery's resident critic says about your piece (dark comedy, never mean to you). */
function critique(coverage: number, colors: number, strokes: number, tools: Set<Tool>, mirrored: boolean): string {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  if (coverage < 0.08) return pick(['“Minimalism. Or you ran out of time. Either way: brave.”', '“So much empty space. Like my apartment after the divorce.”']);
  if (mirrored) return pick(['“Symmetry. The comfort of order in a city with none.”', '“Perfectly balanced. Unlike my checkbook.”']);
  if (tools.has('spray') && tools.size <= 2) return pick(['“Very Bushwick. The landlord will hate it, which is the point.”', '“Straight off the side of a J train. Respect.”']);
  if (tools.has('water')) return pick(['“Soft. Wet. Like Midtown in April.”', '“Watercolour in this economy. Bold.”']);
  if (colors >= 6) return pick(['“A riot of colour. A riot, frankly.”', '“It screams. I, too, scream.”']);
  if (strokes > 40) return pick(['“The energy! The chaos! The rent increase!”', '“You can feel the deadline in every stroke.”']);
  if (colors <= 1) return pick(['“Monochrome. A bold statement about the MTA.”', '“One colour. Like the sky in February.”']);
  return pick(['“It speaks to me. It says ‘pay me’.”', '“I have no idea what this is. I love it.”', '“Derivative of Pigeon at Dawn, but in a good way.”', '“This will be worth something. Probably after you die. Sorry.”']);
}

const TITLE_IDEAS = ['Pigeon at Dawn', 'Rent Is Due', 'Thursday, Mostly', 'Bodega Light', 'The 4 Train Feeling', 'Still Life with MetroCard', 'Untitled (Hungry)', 'Brooklyn, Probably'];

// ===================================================================== surfaces

function mk(n = N): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/** Draw a surface into `base` and its grain (white = none) into `grain`. */
function paintSurface(kind: Surface, base: CanvasRenderingContext2D, grain: CanvasRenderingContext2D): void {
  const r = new Rng(`surface-${kind}`);
  const b = base.createImageData(N, N), g = grain.createImageData(N, N);
  const bd = b.data, gd = g.data;
  const set = (i: number, cr: number, cg: number, cb: number, gr: number) => {
    bd[i] = cr; bd[i + 1] = cg; bd[i + 2] = cb; bd[i + 3] = 255;
    gd[i] = gd[i + 1] = gd[i + 2] = gr; gd[i + 3] = 255;
  };
  if (kind === 'brick') {
    const BW = 64, BH = 26, M = 4;
    const tone: number[][] = [];
    for (let row = 0; row < N / BH + 1; row++) tone.push(Array.from({ length: 10 }, () => r.next()));
    for (let y = 0; y < N; y++) {
      const row = Math.floor(y / BH), off = row % 2 ? BW / 2 : 0;
      for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        const bx = (x + off) % BW, by = y % BH;
        const n = (r.next() - 0.5) * 22;
        if (bx < M || by < M) set(i, 178 + n, 172 + n, 162 + n, 168 + n * 0.5);
        else {
          const t = tone[row][Math.floor((x + off) / BW) % 10];
          set(i, 150 + t * 40 + n, 70 + t * 22 + n, 50 + t * 14 + n, 238 + n * 0.6);
        }
      }
    }
  } else {
    const [cr, cg, cb] = kind === 'canvas' ? [244, 237, 224] : [251, 248, 240];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        const n = (r.next() - 0.5) * (kind === 'canvas' ? 10 : 7);
        // Canvas: a woven over-under grid. Paper: soft fibres.
        const weave = kind === 'canvas' ? ((x % 4 < 2) !== (y % 4 < 2) ? -7 : 3) : 0;
        set(i, cr + n + weave, cg + n + weave, cb + n + weave, kind === 'canvas' ? 242 + weave * 2 + n : 248 + n);
      }
  }
  base.putImageData(b, 0, 0);
  grain.putImageData(g, 0, 0);
  if (kind === 'paper') {
    grain.strokeStyle = 'rgba(0,0,0,0.05)';
    base.strokeStyle = 'rgba(120,100,70,0.05)';
    for (let k = 0; k < 140; k++) {
      const x = r.next() * N, y = r.next() * N, a = r.next() * Math.PI, l = 6 + r.next() * 18;
      for (const c of [base, grain]) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        c.stroke();
      }
    }
  }
}

/** A soft watercolour dab in this colour (darker rim, like paint drying). */
function waterSprite(color: string): HTMLCanvasElement {
  const [c, g] = mk(64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hexA(color, 0.1));
  gr.addColorStop(0.72, hexA(color, 0.16));
  gr.addColorStop(0.88, hexA(color, 0.22));
  gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ===================================================================== easel

export function openEasel(host: ArtHost): void {
  const day = nycTime().dateKey;
  const prompt = artPrompt(day);
  const m = openModal(`<div class="ae">
    <div class="ae-paint">
      <div class="ae-top">
        <button class="ae-ic" data-act="close" aria-label="Close">✕</button>
        <b>🎨 Easel</b>
        <span class="ae-sp"></span>
        <button class="ae-ic" data-act="undo" aria-label="Undo" disabled>↩️</button>
        <button class="ae-ic" data-act="redo" aria-label="Redo" disabled>↪️</button>
        <button class="btn primary ae-done" data-act="done">✅ Done</button>
      </div>
      <p class="ae-prompt" title="Today’s prompt">💡 Today: <b>${esc(prompt)}</b></p>
      <div class="ae-stage" aria-label="Canvas: paint with your finger" role="img">
        <canvas class="ae-tex"></canvas><canvas class="ae-layer"></canvas><canvas class="ae-stroke"></canvas><canvas class="ae-grain"></canvas>
      </div>
      <div class="ae-tools" role="toolbar" aria-label="Brushes">${TOOLS.map((t) => `<button class="ae-tool" data-tool="${t.id}" aria-label="${t.name}" aria-pressed="false"><span aria-hidden="true">${t.emoji}</span><small>${t.short ?? t.name.split(' ')[0]}</small></button>`).join('')}</div>
      <div class="ae-row">
        <span class="ae-dot" aria-hidden="true"><i></i></span>
        <input class="ae-size" type="range" min="2" max="60" value="14" aria-label="Brush size">
        <button class="ae-ic ae-tog" data-act="mirror" aria-label="Mirror" aria-pressed="false">🪞</button>
        <button class="ae-ic ae-tog" data-act="surface" aria-label="Surface"></button>
      </div>
      <div class="ae-palette" aria-label="Colours"></div>
      <div class="ae-stickers" aria-label="Stickers" hidden>${STICKERS.map((e) => `<button class="ae-stk" data-sticker="${e}" aria-label="Sticker ${e}">${e}</button>`).join('')}</div>
    </div>
    <div class="ae-finish" hidden></div>
  </div>`);
  const wrap = m.el.parentElement!;
  wrap.classList.add('ae-wrap');
  m.el.classList.add('ae-modal');
  sfx.open();
  const el = m.el;
  const paintView = el.querySelector<HTMLElement>('.ae-paint')!;
  const finishView = el.querySelector<HTMLElement>('.ae-finish')!;
  const stage = el.querySelector<HTMLElement>('.ae-stage')!;
  const [texC, layC, strC, grnC] = Array.from(stage.querySelectorAll('canvas'));
  for (const c of [texC, layC, strC, grnC]) c.width = c.height = N;
  const tex = texC.getContext('2d')!;
  const grain = grnC.getContext('2d')!;
  const paint = layC.getContext('2d', { willReadFrequently: true })!;
  const stroke = strC.getContext('2d')!;

  // ---- state
  let tool: Tool = 'marker';
  let color = recent[0] ?? PALETTE[0];
  let size = 14;
  let mirror = false;
  let surface: Surface = 'canvas';
  let sticker = STICKERS[0];
  let strokes = 0;
  let dirty = false;
  let hung = false;
  const used = new Set<string>();
  const toolsUsed = new Set<Tool>();
  const undo: ImageData[] = [];
  const redo: ImageData[] = [];
  let title = '';

  if (draft) {
    paint.putImageData(draft.data, 0, 0);
    surface = draft.surface;
    draft.used.forEach((c) => used.add(c));
    draft.tools.forEach((t) => toolsUsed.add(t));
    strokes = draft.strokes;
    title = draft.title;
    dirty = true;
    draft = null;
    window.setTimeout(() => toast('Picked up where you left off.', { icon: '🎨' }), 300);
  }

  const setSurface = (s: Surface) => {
    surface = s;
    paintSurface(s, tex, grain);
    const b = el.querySelector<HTMLElement>('[data-act="surface"]')!;
    const meta = SURFACES.find((x) => x.id === s)!;
    b.textContent = meta.emoji;
    b.setAttribute('aria-label', `Surface: ${meta.name}`);
    stage.dataset.surface = s;
  };
  setSurface(surface);

  // ---- toolbar
  const btnUndo = el.querySelector<HTMLButtonElement>('[data-act="undo"]')!;
  const btnRedo = el.querySelector<HTMLButtonElement>('[data-act="redo"]')!;
  const syncUndo = () => {
    btnUndo.disabled = !undo.length;
    btnRedo.disabled = !redo.length;
  };
  const dot = el.querySelector<HTMLElement>('.ae-dot i')!;
  const sizeIn = el.querySelector<HTMLInputElement>('.ae-size')!;
  const syncDot = () => {
    const px = Math.max(3, Math.min(30, brushW() * (stage.clientWidth / N || 0.67)));
    dot.style.width = dot.style.height = `${px}px`;
    dot.style.background = tool === 'eraser' ? 'transparent' : color;
    dot.classList.toggle('erase', tool === 'eraser');
  };
  const palette = el.querySelector<HTMLElement>('.ae-palette')!;
  const drawPalette = () => {
    const rec = recent.filter((c) => !PALETTE.includes(c)).slice(0, 7);
    palette.innerHTML = `${PALETTE.map((c) => sw(c)).join('')}
      <label class="ae-pick" aria-label="Pick any colour"><input type="color" value="${color}"><span aria-hidden="true">🌈</span></label>
      ${rec.map((c) => sw(c, true)).join('')}${Array.from({ length: 7 - rec.length }, () => '<span class="ae-sw empty" aria-hidden="true"></span>').join('')}`;
    palette.querySelector<HTMLInputElement>('input[type=color]')!.addEventListener('input', (e) => pickColor((e.target as HTMLInputElement).value, false));
    palette.querySelector<HTMLInputElement>('input[type=color]')!.addEventListener('change', (e) => pickColor((e.target as HTMLInputElement).value, true));
  };
  const sw = (c: string, rec = false) => `<button class="ae-sw${rec ? ' rec' : ''}${c === color ? ' on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${rec ? 'Recent colour' : 'Colour'} ${c}"></button>`;
  const pickColor = (c: string, redraw = true) => {
    color = c;
    if (tool === 'eraser' || tool === 'stamp') setTool('marker');
    if (redraw) drawPalette();
    else palette.querySelectorAll('.ae-sw').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.color === c));
    syncDot();
  };
  const remember = (c: string) => {
    const i = recent.indexOf(c);
    if (i === 0) return;
    if (i > 0) recent.splice(i, 1);
    recent.unshift(c);
    if (recent.length > 12) recent.length = 12;
    if (!PALETTE.includes(c)) drawPalette();
  };
  palette.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-color]');
    if (!b) return;
    sfx.tap();
    pickColor(b.dataset.color!, false);
  });
  const stickerRow = el.querySelector<HTMLElement>('.ae-stickers')!;
  const setTool = (t: Tool) => {
    tool = t;
    el.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => {
      const on = b.dataset.tool === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    stickerRow.hidden = t !== 'stamp';
    palette.hidden = t === 'stamp';
    stage.dataset.tool = t;
    syncDot();
  };
  el.querySelector('.ae-tools')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]');
    if (!b) return;
    sfx.tap();
    buzz(8);
    setTool(b.dataset.tool as Tool);
  });
  stickerRow.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sticker]');
    if (!b) return;
    sfx.tap();
    sticker = b.dataset.sticker!;
    stickerRow.querySelectorAll('.ae-stk').forEach((x) => x.classList.toggle('on', x === b));
  });
  stickerRow.querySelector('.ae-stk')!.classList.add('on');
  sizeIn.addEventListener('input', () => {
    size = Number(sizeIn.value);
    syncDot();
  });

  /** Brush width (canvas px) for the current tool at full pressure. */
  function brushW(): number {
    if (tool === 'pencil') return Math.max(1.5, size * 0.3);
    if (tool === 'water') return size * 1.7;
    if (tool === 'spray') return size * 2;
    if (tool === 'eraser') return size * 1.3;
    return size;
  }

  // ---- history
  const snapshot = () => paint.getImageData(0, 0, N, N);
  const pushUndo = () => {
    undo.push(snapshot());
    if (undo.length > UNDO) undo.shift();
    redo.length = 0;
    syncUndo();
  };
  const doUndo = () => {
    if (!undo.length) return;
    redo.push(snapshot());
    paint.putImageData(undo.pop()!, 0, 0);
    sfx.card();
    syncUndo();
  };
  const doRedo = () => {
    if (!redo.length) return;
    undo.push(snapshot());
    paint.putImageData(redo.pop()!, 0, 0);
    sfx.card();
    syncUndo();
  };

  // ---- painting
  const smoother = new Smoother((w) => (tool === 'water' ? w * 0.18 : tool === 'spray' ? w * 0.12 : Math.max(0.75, w * 0.12)));
  let active: number | null = null;
  let lastRaw: { x: number; y: number; t: number } | null = null;
  let lastSample: Pt | null = null;
  let feel = 0.75;
  let sprite: HTMLCanvasElement | null = null;
  let stampN = 0;
  let still = 0;
  let raf = 0;
  const drips: { x: number; y: number; left: number; w: number }[] = [];
  let cur: Pt | null = null;

  const toCanvas = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * N, y: ((e.clientY - r.top) / r.height) * N, cssScale: r.width / N };
  };
  const flip = (p: Pt): Pt => ({ x: N - p.x, y: p.y, w: p.w });
  const both = (p: Pt, fn: (q: Pt, prev: Pt) => void) => {
    const prev = lastSample ?? p;
    fn(p, prev);
    if (mirror) fn(flip(p), flip(prev));
  };
  const seg = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt) => {
    ctx.lineWidth = Math.max(0.6, (a.w + b.w) / 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + 0.01, b.y);
    ctx.stroke();
  };
  const sprayAt = (q: Pt, amount = 1) => {
    stroke.fillStyle = color;
    const r = q.w / 2;
    const n = Math.ceil(r * 0.9 * amount);
    for (let k = 0; k < n; k++) {
      const d = r * (Math.random() + Math.random()) * 0.5 * (Math.random() < 0.15 ? 1.6 : 1);
      const a = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 1.4;
      stroke.fillRect(q.x + Math.cos(a) * d, q.y + Math.sin(a) * d, s, s);
    }
  };
  const render = (samples: Pt[]) => {
    for (const p of samples) {
      if (tool === 'eraser') {
        paint.globalCompositeOperation = 'destination-out';
        paint.strokeStyle = '#000';
        paint.lineCap = paint.lineJoin = 'round';
        both(p, (q, prev) => seg(paint, prev, q));
        paint.globalCompositeOperation = 'source-over';
      } else if (tool === 'marker' || tool === 'pencil') {
        stroke.strokeStyle = color;
        stroke.lineCap = stroke.lineJoin = 'round';
        both(p, (q, prev) => {
          seg(stroke, prev, q);
          if (tool === 'pencil') {
            // Graphite grain: nick out a few specks.
            stroke.globalCompositeOperation = 'destination-out';
            stroke.fillStyle = 'rgba(0,0,0,0.55)';
            for (let k = 0; k < 3; k++) stroke.fillRect(q.x + (Math.random() - 0.5) * q.w * 1.2, q.y + (Math.random() - 0.5) * q.w * 1.2, 1, 1);
            stroke.globalCompositeOperation = 'source-over';
          }
        });
      } else if (tool === 'water' && sprite) {
        both(p, (q) => {
          const r = (q.w / 2) * (0.9 + Math.random() * 0.2);
          stroke.drawImage(sprite!, q.x - r, q.y - r, r * 2, r * 2);
          // Bleed: now and then a fainter, bigger bloom drifts off the edge.
          if (++stampN % 7 === 0) {
            const a = Math.random() * Math.PI * 2, d = r * 0.5, R = r * (1.3 + Math.random() * 0.5);
            stroke.globalAlpha = 0.45;
            stroke.drawImage(sprite!, q.x + Math.cos(a) * d - R, q.y + Math.sin(a) * d - R, R * 2, R * 2);
            stroke.globalAlpha = 1;
          }
        });
      } else if (tool === 'spray') {
        both(p, (q) => sprayAt(q));
      }
      lastSample = p;
    }
  };
  const commit = () => {
    const look = LOOK[tool];
    if (!look) return;
    paint.globalAlpha = look.alpha;
    paint.globalCompositeOperation = look.blend;
    paint.drawImage(strC, 0, 0);
    paint.globalAlpha = 1;
    paint.globalCompositeOperation = 'source-over';
    stroke.clearRect(0, 0, N, N);
  };
  const styleStroke = () => {
    const look = LOOK[tool];
    strC.style.opacity = String(look?.alpha ?? 1);
    strC.style.mixBlendMode = look?.blend === 'multiply' ? 'multiply' : 'normal';
  };

  // 💨 Held still, the spray can keeps going and starts to drip.
  const sprayLoop = () => {
    raf = 0;
    if (active === null || tool !== 'spray' || !cur) return;
    both(cur, (q) => sprayAt(q, 0.5));
    still++;
    if (still === 28 && drips.length < 12) both(cur, (q) => drips.push({ x: q.x + (Math.random() - 0.5) * q.w * 0.3, y: q.y + q.w * 0.2, left: 30 + Math.random() * 70, w: Math.max(1.5, q.w * 0.09) }));
    dripStep();
    raf = requestAnimationFrame(sprayLoop);
  };
  const dripStep = () => {
    stroke.fillStyle = color;
    for (const d of drips) {
      if (d.left <= 0) continue;
      const step = Math.min(d.left, 1.6);
      stroke.beginPath();
      stroke.arc(d.x, d.y, d.w, 0, Math.PI * 2);
      stroke.fill();
      d.y += step;
      d.left -= step;
      if (d.left <= 0) {
        stroke.beginPath();
        stroke.arc(d.x, d.y, d.w * 1.5, 0, Math.PI * 2);
        stroke.fill();
      }
    }
  };
  const dripsRunning = () => drips.some((d) => d.left > 0);
  const finishDrips = () => {
    // Drips already falling finish (quickly) before the stroke lands.
    let guard = 200;
    while (dripsRunning() && guard--) dripStep();
    drips.length = 0;
  };

  const fillAt = (x: number, y: number) => {
    const img = paint.getImageData(0, 0, N, N);
    const n = parseInt(color.slice(1), 16);
    const fr = (n >> 16) & 255, fg = (n >> 8) & 255, fb = n & 255;
    const pts = mirror ? [[x, y], [N - x, y]] : [[x, y]];
    for (const [px, py] of pts) {
      const mask = floodMask(img.data, N, N, px, py);
      const d = img.data;
      for (let p = 0; p < mask.length; p++) {
        if (!mask[p]) continue;
        const i = p * 4;
        if (mask[p] === 1) {
          d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
        } else {
          // Edge: tuck the fill under what's there.
          const a = d[i + 3] / 255;
          d[i] = d[i] * a + fr * (1 - a); d[i + 1] = d[i + 1] * a + fg * (1 - a); d[i + 2] = d[i + 2] * a + fb * (1 - a); d[i + 3] = 255;
        }
      }
    }
    paint.putImageData(img, 0, 0);
    sfx.whoosh();
  };
  const stampAt = (x: number, y: number) => {
    paint.font = `${Math.round(size * 2.4 + 22)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    paint.textAlign = 'center';
    paint.textBaseline = 'middle';
    paint.fillStyle = '#000';
    paint.fillText(sticker, x, y);
    if (mirror) paint.fillText(sticker, N - x, y);
    sfx.tap();
    buzz(10);
  };

  const onDown = (e: PointerEvent) => {
    if (active !== null || hung) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    active = e.pointerId;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers in tests can't be captured: fine.
    }
    const c = toCanvas(e);
    pushUndo();
    dirty = true;
    strokes++;
    toolsUsed.add(tool);
    if (tool !== 'eraser') {
      used.add(tool === 'stamp' ? sticker : color);
      if (tool !== 'stamp') remember(color);
    }
    if (tool === 'fill') {
      fillAt(c.x, c.y);
      active = null;
      return;
    }
    if (tool === 'stamp') {
      stampAt(c.x, c.y);
      active = null;
      return;
    }
    styleStroke();
    if (tool === 'water') sprite = waterSprite(color);
    feel = 0.7;
    lastRaw = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    lastSample = null;
    still = 0;
    const p: Pt = { x: c.x, y: c.y, w: brushW() * pressureFeel(0, e.pressure, e.pointerType === 'pen') * (e.pointerType === 'pen' ? 1 : 0.85) };
    cur = p;
    render(smoother.start(p));
    if (tool === 'spray' && !raf) raf = requestAnimationFrame(sprayLoop);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    e.preventDefault();
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) {
      const c = toCanvas(ev);
      const dt = Math.max(1, ev.timeStamp - (lastRaw?.t ?? ev.timeStamp - 16));
      const dist = lastRaw ? Math.hypot(ev.clientX - lastRaw.x, ev.clientY - lastRaw.y) : 0;
      if (dist < 0.4) continue;
      const target = pressureFeel(dist / dt, ev.pressure, ev.pointerType === 'pen');
      feel += (target - feel) * 0.25;
      lastRaw = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
      const f = tool === 'pencil' ? 0.8 + feel * 0.2 : tool === 'eraser' ? 1 : feel;
      const p: Pt = { x: c.x, y: c.y, w: brushW() * f };
      if (cur && Math.hypot(p.x - cur.x, p.y - cur.y) > 3) still = 0;
      cur = p;
      render(smoother.move(p));
    }
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    render(smoother.end());
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (tool === 'spray') finishDrips();
    commit();
    lastSample = null;
    cur = null;
    // A short tick so it feels like the brush left the canvas.
    if (tool !== 'eraser') buzz(4);
  };
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('lostpointercapture', onUp);
  // iOS: no scrolling, zooming, magnifier or callout while you paint.
  const block = (e: Event) => e.cancelable && e.preventDefault();
  for (const t of ['touchstart', 'touchmove', 'gesturestart', 'dblclick', 'contextmenu']) stage.addEventListener(t, block, { passive: false });

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
    }
  };
  window.addEventListener('keydown', onKey);

  // ---- finish: title, prompt, hang
  const flatten = (): HTMLCanvasElement => {
    const [c, g] = mk();
    g.drawImage(texC, 0, 0);
    g.drawImage(layC, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.55;
    g.drawImage(grnC, 0, 0);
    return c;
  };
  const coverage = () => {
    const d = paint.getImageData(0, 0, N, N).data;
    let painted = 0, n = 0;
    for (let i = 3; i < d.length; i += 4 * 7) {
      n++;
      if (d[i] > 24) painted++;
    }
    return painted / n;
  };
  let followed = false;
  const showFinish = () => {
    const cov = coverage();
    if (cov < 0.02) {
      sfx.bad();
      return toast('Paint something first!', { icon: '🎨', tone: 'bad' });
    }
    const preview = flatten().toDataURL('image/jpeg', 0.85);
    const idea = TITLE_IDEAS[Math.floor(Math.random() * TITLE_IDEAS.length)];
    finishView.innerHTML = `<div class="ae-fin">
      <h3>🖼️ Ready to hang?</h3>
      <div class="ae-frame"><img src="${preview}" alt="Your painting"></div>
      <label class="ae-lbl" for="ae-title">Title</label>
      <input id="ae-title" class="input ae-title" maxlength="40" placeholder="e.g. “${esc(idea)}”" value="${esc(title)}" autocomplete="off" enterkeyhint="done">
      <button class="ae-promptbox${followed ? ' on' : ''}" data-act="prompt" aria-pressed="${followed}">
        <span class="ae-check" aria-hidden="true">${followed ? '✔' : ''}</span>
        <span><small>💡 Today’s prompt</small><b>${esc(prompt)}</b><em>I painted this (more people stop and look)</em></span>
      </button>
      <div class="ae-btns"><button class="btn ghost" data-act="back">← Keep painting</button><button class="btn primary" data-act="hang">🖼️ Hang it</button></div>
    </div>`;
    paintView.hidden = true;
    finishView.hidden = false;
    sfx.chime();
    const t = finishView.querySelector<HTMLInputElement>('.ae-title')!;
    t.addEventListener('input', () => (title = t.value));
    t.addEventListener('keydown', (e) => e.key === 'Enter' && t.blur());
  };
  const hang = () => {
    if (hung) return;
    const cov = coverage();
    const full = flatten();
    const small = document.createElement('canvas');
    const sg = small.getContext('2d')!;
    const img = pickEncoding((px, q) => {
      small.width = small.height = px;
      sg.imageSmoothingEnabled = true;
      sg.imageSmoothingQuality = 'high';
      sg.drawImage(full, 0, 0, px, px);
      const webp = small.toDataURL('image/webp', q);
      // Older Safari can't write WebP (it hands back PNG): use JPEG there.
      return webp.startsWith('data:image/webp') ? webp : small.toDataURL('image/jpeg', q);
    });
    hung = true;
    const a = submitArt(host.state, title, img, { coverage: cov, colors: used.size, strokes, tools: toolsUsed.size, prompt: followed });
    host.onArt?.();
    host.onHang?.(a.title, img);
    host.saved();
    draft = null;
    sfx.cheer();
    buzz([20, 40, 20]);
    const frame = finishView.querySelector<HTMLElement>('.ae-frame');
    if (frame) {
      frame.classList.add('hung');
      if (!REDUCED) burstAt(frame, ['❤️', '✨', '🎨'], 14);
    }
    window.setTimeout(() => close(), REDUCED ? 300 : 900);
    toast(`🖼️ “${a.title}” is on the wall. Likes come in over the next few hours.`, { icon: '🎨', tone: 'good', ms: 4500 });
    window.setTimeout(() => toast(`🧐 The critic: ${critique(cov, used.size, strokes, toolsUsed, mirror)}`, { icon: '🎨', ms: 6000 }), 1400);
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    if (dirty && !hung) draft = { data: snapshot(), surface, used: [...used], tools: [...toolsUsed], strokes, title };
    sfx.close();
    m.close();
  };

  onAct(el, (act, btn) => {
    if (act === 'close') return close();
    if (act === 'undo') return doUndo();
    if (act === 'redo') return doRedo();
    if (act === 'done') return showFinish();
    if (act === 'mirror') {
      mirror = !mirror;
      btn.setAttribute('aria-pressed', String(mirror));
      btn.classList.toggle('on', mirror);
      stage.classList.toggle('mirror', mirror);
      return sfx.tap();
    }
    if (act === 'surface') {
      const i = SURFACES.findIndex((x) => x.id === surface);
      const next = SURFACES[(i + 1) % SURFACES.length];
      setSurface(next.id);
      sfx.tap();
      return toast(`${next.emoji} ${next.name}`, { ms: 1200 });
    }
    if (act === 'back') {
      finishView.hidden = true;
      paintView.hidden = false;
      return sfx.tap();
    }
    if (act === 'prompt') {
      followed = !followed;
      btn.classList.toggle('on', followed);
      btn.setAttribute('aria-pressed', String(followed));
      btn.querySelector('.ae-check')!.textContent = followed ? '✔' : '';
      return sfx.tap();
    }
    if (act === 'hang') return hang();
  });

  drawPalette();
  setTool(tool);
  syncUndo();
  requestAnimationFrame(syncDot);
}

// ===================================================================== gallery

/** Today's gallery: the Show of the week, collector offers, and the wall (most liked first). */
export function openGallery(host: ArtHost): void {
  const s = host.state;
  const day = nycTime().dateKey;
  const prompt = artPrompt(day);
  const frame = (img: string | undefined, seed: string, alt: string) => `<div class="ag-canvas"><img src="${img ?? genArt(seed)}" alt="${esc(alt)}" loading="lazy"></div>`;
  let offerSig = '';
  const sigNow = () => artOf(s).map((a) => `${a.id}:${a.offer ?? ''}:${a.sold ?? ''}:${a.featured ?? ''}`).join('|');

  const render = () => {
    offerSig = sigNow();
    const show = showOfWeek(s, day);
    const wall = galleryWall(s, day);
    const offers = artOf(s).filter((a) => a.offer && !a.sold);
    const medal = ['🥇', '🥈', '🥉'];
    return `<div class="ag">
      <section class="ag-show${show.mine ? ' mine' : ''}" aria-label="Show of the week">
        <div class="ag-light" aria-hidden="true"></div>
        <div class="ag-frame big">${frame(show.img, show.seed ?? 'show', show.title)}</div>
        <div class="ag-plaque"><small>🏆 Show of the week</small><b>${esc(show.title)}</b><span>${esc(show.artist)} · ❤️ <span class="ag-lk" ${show.id ? `data-lk="${show.id}"` : ''}>${show.likes}</span></span>${show.mine ? '<em>That’s you. The Bowery is talking.</em>' : '<em>Beat it with something you hang this week.</em>'}</div>
      </section>
      ${offers
        .map(
          (a) => `<section class="ag-offer" aria-label="Offer">
        <img src="${a.img}" alt="${esc(a.title)}">
        <div><small>💌 ${esc(a.buyer ?? 'A collector')} wants</small><b>“${esc(a.title)}”</b><span class="ag-price">${money(a.offer!)}</span></div>
        <div class="ag-offer-btns"><button class="btn primary" data-act="sell:${a.id}">💰 Sell</button><button class="btn ghost" data-act="pass:${a.id}">🙅 Pass</button></div>
      </section>`,
        )
        .join('')}
      <div class="ag-bar"><p>💡 Today’s prompt: <b>${esc(prompt)}</b></p><button class="btn primary" data-act="paint">🎨 Paint</button></div>
      <h3 class="ag-h">The wall today</h3>
      <p class="ag-sub">Most liked first. Likes keep coming in for a few hours after you hang a piece.</p>
      <div class="ag-wall">${wall
        .map((w, i) => {
          const a = w.id ? artOf(s).find((x) => x.id === w.id) : undefined;
          return `<figure class="ag-piece${w.mine ? ' mine' : ''}">
          <div class="ag-light" aria-hidden="true"></div>
          <div class="ag-frame">${frame(w.img, w.seed ?? String(i), w.title)}${a?.sold ? '<span class="ag-dot" title="Sold" aria-label="Sold"></span>' : ''}${i < 3 ? `<span class="ag-medal" aria-hidden="true">${medal[i]}</span>` : ''}</div>
          <figcaption><b>${esc(w.title)}</b><small>${w.mine ? '<span class="ag-you">YOU</span>' : esc(w.artist)} · ❤️ <span class="ag-lk" ${w.id ? `data-lk="${w.id}"` : ''}>${w.likes}</span>${a?.sold ? ' · Sold' : a?.offer ? ' · 💌' : ''}</small></figcaption>
        </figure>`;
        })
        .join('')}</div>
    </div>`;
  };
  const sheet = openSheet({ emoji: '🖼️', title: 'The gallery wall', sub: 'Bowery Art Parlor', body: render(), className: 'ag-sheet' });

  // ❤️ Likes tick up while you watch.
  const timer = window.setInterval(() => {
    if (!sheet.el.isConnected) return window.clearInterval(timer);
    if (sigNow() !== offerSig) {
      sheet.body.innerHTML = render();
      return void drawNet();
    }
    for (const a of artOf(s)) {
      const n = likesNow(a);
      sheet.body.querySelectorAll<HTMLElement>(`[data-lk="${a.id}"]`).forEach((i) => {
        if (i.textContent === String(n)) return;
        i.textContent = String(n);
        i.classList.remove('tick');
        void i.offsetWidth;
        i.classList.add('tick');
      });
    }
  }, 1000);

  // 🌐 Real players' paintings, with likes.
  const net = host.net;
  const drawNet = async () => {
    if (!net || !sheet.body.isConnected) return;
    const wall = await net.loadWall();
    const box = sheet.body.querySelector<HTMLElement>('[data-netwall]') ?? (sheet.body.querySelector('.ag')!.appendChild(Object.assign(document.createElement('section'), { className: 'netwall' })) as HTMLElement);
    box.dataset.netwall = '1';
    box.innerHTML = `<h3 class="ag-h">🌐 Players’ wall</h3>${wall.length ? `<div class="ag-wall">${wall.map((w) => `<figure class="ag-piece${w.mine ? ' mine' : ''}"><div class="ag-light" aria-hidden="true"></div><div class="ag-frame"><div class="ag-canvas"><img src="${w.img}" alt="${esc(w.title)}" loading="lazy"></div></div><figcaption><b>${esc(w.title)}</b><small>${esc(w.artist)} · ❤️ ${w.likes}</small>${w.mine ? '' : `<span class="ag-net"><button class="btn" data-act="nlike:${w.id}" ${w.liked ? 'disabled' : ''}>${w.liked ? '❤️ Liked' : '🤍 Like'}</button><button class="btn ghost" data-act="nrep:${w.id}" aria-label="Report">🚩</button></span>`}</figcaption></figure>`).join('')}</div>` : '<p class="ag-sub">Nobody’s hung anything in the last few days. Be the first!</p>'}`;
  };
  void drawNet();

  onAct(sheet.body, async (act, btn) => {
    if (net && act.startsWith('nlike:')) {
      const n = await net.like(Number(act.slice(6)));
      if (n !== null) sfx.tap();
      return void drawNet();
    }
    if (net && act.startsWith('nrep:')) return void net.report('art', act.slice(5), 'From the gallery');
    if (act === 'paint') {
      sheet.close();
      return openEasel(host);
    }
    if (act.startsWith('pass:')) {
      const id = act.slice(5);
      const a = artOf(s).find((x) => x.id === id);
      if (declineArt(s, id)) return;
      sfx.close();
      toast(a && mayReoffer(a) ? 'You passed. If the likes keep climbing, someone may come back with more.' : 'You passed. It stays on your wall.', { icon: '🙅', ms: 3500 });
      host.saved();
      sheet.body.innerHTML = render();
      return void drawNet();
    }
    if (!act.startsWith('sell:')) return;
    const why = sellArt(s, act.slice(5));
    if (why) return toast(why, { icon: '🎨', tone: 'bad' });
    sfx.cash();
    buzz([15, 30, 15]);
    if (!REDUCED) burstAt(btn, ['💵', '💰'], 12);
    host.onSold?.();
    toast('Sold! Your art is in a collection now.', { icon: '💰', tone: 'good', ms: 4000 });
    host.saved();
    sheet.body.innerHTML = render();
    void drawNet();
  });
}

// ===================================================================== other artists

const genCache = new Map<string, string>();

/** Other artists' work: a small seeded painting (skyline, sunset, cat, tag or abstract). */
function genArt(seed: string): string {
  const hit = genCache.get(seed);
  if (hit) return hit;
  const S = 160;
  const [c, g] = mk(S);
  const r = new Rng(seed);
  const col = () => r.pick(PALETTE.slice(4));
  const grad = (a: string, b: string) => {
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  };
  const style = r.int(0, 4);
  if (style === 0) {
    // 🌃 Skyline at night.
    grad(r.pick(['#0b1033', '#1c2340', '#2b1450']), r.pick(['#5a2a7a', '#9b5de5', '#ff6319']));
    g.fillStyle = '#fff6c8';
    g.beginPath();
    g.arc(r.range(20, 140), r.range(18, 50), r.range(8, 16), 0, Math.PI * 2);
    g.fill();
    for (let x = -4; x < S; ) {
      const w = r.int(14, 30), h = r.int(40, 110);
      g.fillStyle = r.pick(['#111522', '#1a1f33', '#232a44']);
      g.fillRect(x, S - h, w, h);
      g.fillStyle = '#ffd166';
      for (let wy = S - h + 6; wy < S - 6; wy += 8) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (r.chance(0.35)) g.fillRect(wx, wy, 2.5, 3.5);
      x += w + r.int(0, 3);
    }
  } else if (style === 1) {
    // 🌉 Sunset on the river.
    grad(r.pick(['#ff8fab', '#ffc629', '#ff6319']), r.pick(['#9b5de5', '#e63946']));
    g.fillStyle = '#fff3b0';
    g.beginPath();
    g.arc(S / 2 + r.range(-30, 30), S * 0.58, r.range(18, 28), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a3a6b';
    g.fillRect(0, S * 0.62, S, S);
    g.strokeStyle = '#ffffff66';
    for (let k = 0; k < 9; k++) {
      const y = S * 0.66 + k * 6;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(r.range(20, 70), y);
      g.lineTo(r.range(90, 140), y);
      g.stroke();
    }
    g.strokeStyle = '#1c2340';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, S * 0.5);
    g.quadraticCurveTo(S / 2, S * 0.3, S, S * 0.5);
    g.stroke();
  } else if (style === 2) {
    // 🐈 Bodega cat.
    g.fillStyle = col();
    g.fillRect(0, 0, S, S);
    g.fillStyle = r.pick(['#1c2340', '#111111', '#8d5524', '#ff6319']);
    g.beginPath();
    g.ellipse(80, 118, 40, 30, 0, 0, Math.PI * 2);
    g.arc(80, 72, 26, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(58, 60); g.lineTo(62, 34); g.lineTo(76, 50);
    g.moveTo(102, 60); g.lineTo(98, 34); g.lineTo(84, 50);
    g.fill();
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.strokeStyle = g.fillStyle;
    g.beginPath();
    g.moveTo(118, 128);
    g.quadraticCurveTo(150, 120, 140, 90);
    g.stroke();
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.ellipse(70, 72, 4, 6, 0, 0, Math.PI * 2);
    g.ellipse(90, 72, 4, 6, 0, 0, Math.PI * 2);
    g.fill();
  } else if (style === 3) {
    // 💨 A tag on the brick.
    g.fillStyle = '#9c4a32';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#b9b2a6';
    for (let y = 0; y < S; y += 14) {
      g.fillRect(0, y, S, 2);
      for (let x = (y / 14) % 2 ? 0 : 16; x < S; x += 32) g.fillRect(x, y, 2, 14);
    }
    g.font = `900 ${r.int(44, 56)}px "Arial Black", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.lineJoin = 'round';
    g.strokeStyle = '#111';
    const word = r.pick(['NYC', 'WOW', 'YO!', 'BX', 'LES', 'QNS']);
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(r.range(-0.25, 0.1));
    g.strokeText(word, 0, 0);
    g.fillStyle = col();
    g.fillText(word, 0, 0);
    g.restore();
  } else {
    // Abstract: big soft shapes and a few brave strokes.
    grad(col(), col());
    for (let k = 0; k < 5; k++) {
      g.globalAlpha = 0.75;
      g.fillStyle = col();
      g.beginPath();
      g.arc(r.range(0, S), r.range(0, S), r.range(14, 50), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = col();
      g.lineWidth = r.range(4, 12);
      g.beginPath();
      g.moveTo(r.range(0, S), r.range(0, S));
      g.bezierCurveTo(r.range(0, S), r.range(0, S), r.range(0, S), r.range(0, S), r.range(0, S), r.range(0, S));
      g.stroke();
    }
  }
  const url = c.toDataURL('image/jpeg', 0.8);
  genCache.set(seed, url);
  return url;
}

export { likesNow, ART };
