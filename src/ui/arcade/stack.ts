// =====================================================================
// 🥪 Bodega Stack — build the tallest hero on the counter.
//
// A layer slides across; tap anywhere (or Space) to drop it. What hangs
// over the edge is sliced off and tumbles away. Land within a few pixels
// for a PERFECT (it snaps on, keeps its width), and from the third
// perfect in a row each one grows the layer back a little. Every 10th
// layer is the top 🍞: ✨ ORDER UP, ×3 points and a bonus that rises
// with each order. Faster and tighter as it climbs; climb past the
// ceiling and you're out under the night sky. Miss the sandwich and it's
// over. The bodega cat watches everything.
// The rules (pure, tested): sim/arcade-stack.ts.
// =====================================================================

import { sfx } from '../audio.ts';
import { Fx } from '../juice.ts';
import { H, W, type Run } from '../arcade-games.ts';
import { clamp, finisher, keys, label, prerender } from './kit.ts';
import { blit, emojiSprite, hudOnce, qaExpose, REDUCED, rng } from './classic1-kit.ts';
import {
  createStack, stackIsOrder, stackPlace, stackSlide, STACK_BASE_W, STACK_FILLINGS, STACK_ORDER_EVERY, type StackEvent,
} from '../../sim/arcade-stack.ts';

const LH = 22, TD = 9, DRIP = 7;
const TEX_W = STACK_BASE_W + 10, TEX_H = TD + LH + DRIP;
const COUNTER_Y = 404;
/** Where the sliding layer sits on screen once the camera follows. */
const SLIDE_Y = 196;
const BG_H = 1100, PARALLAX = 0.6;
/** The ceiling, measured up from the bottom of the background. */
const CEIL_FROM_BOTTOM = 503;

interface Chunk {
  x: number;
  y: number;
  w: number;
  kind: number;
  gold: boolean;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  on: boolean;
}

// -------------------------------------------------------------- textures
type Paint = (c: CanvasRenderingContext2D, r: () => number) => void;
const wave = (c: CanvasRenderingContext2D, y: number, amp: number, len: number, phase: number) => {
  c.moveTo(0, y);
  for (let x = 0; x <= TEX_W; x += 3) c.lineTo(x, y + Math.sin(x / len + phase) * amp);
};
const dots = (c: CanvasRenderingContext2D, r: () => number, n: number, y0: number, y1: number, rad: number, color: string) => {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.ellipse(r() * TEX_W, y0 + r() * (y1 - y0), rad * (0.6 + r() * 0.6), rad * 0.5 * (0.6 + r() * 0.6), 0, 0, Math.PI * 2);
    c.fill();
  }
};
const front = (c: CanvasRenderingContext2D, top: string, bottom: string) => {
  const gr = c.createLinearGradient(0, TD, 0, TD + LH);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  c.fillStyle = gr;
  c.fillRect(0, TD, TEX_W, LH);
};
const PAINT: Record<(typeof STACK_FILLINGS)[number], Paint> = {
  bread: (c, r) => {
    c.fillStyle = '#f2d6a0';
    c.fillRect(0, 0, TEX_W, TD + 2);
    dots(c, r, 70, 1, TD, 1.6, 'rgba(170,110,50,.5)');
    dots(c, r, 18, 1, TD - 1, 1.8, '#fff6dd');
    front(c, '#c47a35', '#86461b');
    c.fillStyle = 'rgba(255,220,150,.55)';
    c.fillRect(0, TD, TEX_W, 2);
    dots(c, r, 30, TD + 3, TD + LH - 3, 1.4, 'rgba(120,60,20,.35)');
  },
  bacon: (c) => {
    c.fillStyle = '#c0392b';
    c.fillRect(0, 0, TEX_W, TD + 2);
    c.strokeStyle = '#f6b8a6';
    c.lineWidth = 2;
    for (const y of [2.5, 6.5]) (c.beginPath(), wave(c, y, 1.2, 5, y), c.stroke());
    front(c, '#b33024', '#7d1d14');
    c.strokeStyle = '#f2a493';
    c.lineWidth = 3;
    for (const y of [TD + 6, TD + 14]) (c.beginPath(), wave(c, y, 2.2, 6, y), c.stroke());
  },
  cheese: (c, r) => {
    c.fillStyle = '#ffd43b';
    c.fillRect(0, 0, TEX_W, TD + 2);
    dots(c, r, 16, 1, TD, 2.2, '#e9b519');
    front(c, '#ffcf2e', '#f0a909');
    // Melty drips over the edge.
    c.fillStyle = '#f5b812';
    for (let x = 6; x < TEX_W; x += 14 + r() * 18) {
      const d = 3 + r() * DRIP;
      c.beginPath();
      c.moveTo(x - 4, TD + LH - 1);
      c.lineTo(x - 2, TD + LH + d - 2);
      c.quadraticCurveTo(x, TD + LH + d + 1, x + 2, TD + LH + d - 2);
      c.lineTo(x + 4, TD + LH - 1);
      c.fill();
    }
  },
  lettuce: (c, r) => {
    c.fillStyle = '#7cc04f';
    c.fillRect(0, 0, TEX_W, TD + 2);
    c.strokeStyle = 'rgba(220,255,180,.6)';
    c.lineWidth = 1;
    for (let x = 4; x < TEX_W; x += 11) (c.beginPath(), c.moveTo(x, 1), c.lineTo(x + 6, TD), c.stroke());
    c.fillStyle = '#4f9a2b';
    c.beginPath();
    c.moveTo(0, TD);
    c.lineTo(TEX_W, TD);
    for (let x = TEX_W; x >= 0; x -= 4) c.lineTo(x, TD + LH - 2 + Math.sin(x / 3.2) * 3 + r() * 2);
    c.closePath();
    c.fill();
    c.strokeStyle = '#a6db74';
    c.lineWidth = 2;
    c.beginPath();
    wave(c, TD + 3, 1.8, 3.5, 0);
    c.stroke();
  },
  tomato: (c, r) => {
    c.fillStyle = '#e74c3c';
    c.fillRect(0, 0, TEX_W, TD + 2);
    dots(c, r, 26, 2, TD - 1, 1.3, '#ffd8a8');
    front(c, '#e0473a', '#a92a1f');
    c.fillStyle = '#ff8574';
    for (let x = 10; x < TEX_W; x += 26) {
      c.beginPath();
      c.ellipse(x, TD + LH / 2, 9, 6, 0, 0, Math.PI * 2);
      c.fill();
    }
    dots(c, r, 30, TD + 6, TD + LH - 6, 1.1, '#ffe2b8');
  },
  egg: (c) => {
    c.fillStyle = '#fbf6ea';
    c.fillRect(0, 0, TEX_W, TD + 2);
    c.fillStyle = '#ffc312';
    for (let x = 20; x < TEX_W; x += 46) (c.beginPath(), c.ellipse(x, TD / 2 + 1, 9, 3.5, 0, 0, Math.PI * 2), c.fill());
    front(c, '#fffaf0', '#e6dcc5');
    c.fillStyle = '#ffb703';
    c.fillRect(0, TD + 8, TEX_W, 6);
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.fillRect(0, TD + 1, TEX_W, 2);
  },
  turkey: (c, r) => {
    c.fillStyle = '#f4c2ad';
    c.fillRect(0, 0, TEX_W, TD + 2);
    dots(c, r, 20, 1, TD, 3, 'rgba(255,230,220,.6)');
    front(c, '#efae94', '#c97d62');
    c.strokeStyle = 'rgba(160,80,60,.45)';
    c.lineWidth = 1.5;
    for (const y of [TD + 7, TD + 15]) (c.beginPath(), wave(c, y, 2.5, 9, y), c.stroke());
  },
  onion: (c) => {
    c.fillStyle = '#f4e8f5';
    c.fillRect(0, 0, TEX_W, TD + 2);
    c.strokeStyle = '#a05cb4';
    c.lineWidth = 1.5;
    for (let x = 14; x < TEX_W; x += 30) for (const rr of [4, 8]) (c.beginPath(), c.ellipse(x, TD / 2 + 1, rr * 1.4, rr * 0.45, 0, 0, Math.PI * 2), c.stroke());
    front(c, '#efe0f2', '#cdb3d6');
    c.fillStyle = '#8e44ad';
    for (const y of [TD + 4, TD + 11, TD + 18]) c.fillRect(0, y, TEX_W, 2);
  },
  pickle: (c, r) => {
    c.fillStyle = '#8bc34a';
    c.fillRect(0, 0, TEX_W, TD + 2);
    c.fillStyle = '#d6efb0';
    for (let x = 12; x < TEX_W; x += 22) (c.beginPath(), c.ellipse(x, TD / 2 + 1, 8, 3.2, 0, 0, Math.PI * 2), c.fill());
    dots(c, r, 24, 2, TD - 1, 0.9, '#8bc34a');
    front(c, '#5f9a2c', '#3b6b17');
    dots(c, r, 40, TD + 2, TD + LH - 2, 1.4, 'rgba(160,220,110,.6)');
  },
  pastrami: (c, r) => {
    c.fillStyle = '#9b2f2f';
    c.fillRect(0, 0, TEX_W, TD + 2);
    c.fillStyle = 'rgba(255,190,190,.5)';
    c.fillRect(0, 1, TEX_W, 2);
    dots(c, r, 50, 1, TD, 0.8, '#1d0d0d');
    front(c, '#7d2323', '#4f1414');
    c.fillStyle = 'rgba(255,170,170,.45)';
    c.fillRect(0, TD + 2, TEX_W, 2);
    c.fillRect(0, TD + 12, TEX_W, 1.5);
    dots(c, r, 90, TD + 2, TD + LH - 2, 0.9, '#140808');
  },
  peppers: (c, r) => {
    c.fillStyle = '#3cb44b';
    c.fillRect(0, 0, TEX_W, TD + 2);
    c.strokeStyle = '#1e7a2c';
    c.lineWidth = 1.6;
    for (let x = 10; x < TEX_W; x += 18) (c.beginPath(), c.ellipse(x + r() * 4, TD / 2 + 1, 6, 2.4, 0, 0, Math.PI * 2), c.stroke());
    front(c, '#2f9c3d', '#1b6b27');
    c.fillStyle = '#e63946';
    for (let x = 7; x < TEX_W; x += 23) c.fillRect(x, TD + 6 + r() * 8, 7, 4);
  },
};

export const stack: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const say = hudOnce(hud);
  const rand = rng((Math.random() * 2 ** 31) | 0);
  const s = createStack(rand);
  qaExpose('stack', s);
  const events: StackEvent[] = [];
  const chunks: Chunk[] = [];
  for (let i = 0; i < 12; i++) chunks.push({ x: 0, y: 0, w: 0, kind: 0, gold: false, vx: 0, vy: 0, rot: 0, spin: 0, on: false });
  let raf = 0, over = false, camY = 0, land = 0, sway = 0, swayT = 0, lastDrop = 0, ripple = 0, rippleX = 0, rippleW = 0, rippleY = 0;
  let catHop = 0, catLook = 0, roofDone = false, endAt = 0, started = false;

  // ------------------------------------------------------------ art
  const TEX = STACK_FILLINGS.map((f, i) => prerender(TEX_W, TEX_H, (c) => PAINT[f](c, rng(31 + i * 7))));
  const shine = prerender(40, TEX_H, (c) => {
    const gr = c.createLinearGradient(0, 0, 40, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,250,210,.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 40, TEX_H);
  });
  const bg = prerender(W, BG_H, (c) => {
    const r = rng(5);
    const ceil = BG_H - CEIL_FROM_BOTTOM; // top of the ceiling band
    // Night sky above the roof, with the skyline.
    const sky = c.createLinearGradient(0, 0, 0, ceil);
    sky.addColorStop(0, '#070b1f');
    sky.addColorStop(0.6, '#1d1650');
    sky.addColorStop(1, '#4a2470');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, ceil);
    c.fillStyle = '#fff';
    for (let i = 0; i < 90; i++) c.fillRect(r() * W, r() * (ceil - 160), r() < 0.2 ? 2 : 1, r() < 0.2 ? 2 : 1);
    c.fillStyle = '#fdf3c4';
    c.beginPath();
    c.arc(290, 120, 22, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#070b1f';
    c.beginPath();
    c.arc(300, 112, 20, 0, Math.PI * 2);
    c.fill();
    for (let layer = 0; layer < 2; layer++) {
      c.fillStyle = layer ? '#120c2c' : '#241a4a';
      for (let x = -10; x < W; ) {
        const w = 18 + r() * 34, h = (layer ? 60 : 110) + r() * (layer ? 90 : 140);
        c.fillRect(x, ceil - h, w, h);
        if (layer) {
          c.fillStyle = 'rgba(255,214,120,.7)';
          for (let wy = ceil - h + 6; wy < ceil - 6; wy += 9) for (let wx = x + 3; wx < x + w - 4; wx += 6) if (r() < 0.28) c.fillRect(wx, wy, 2.5, 4);
          c.fillStyle = '#120c2c';
        }
        x += w + (layer ? 1 : -4);
      }
    }
    // The Empire State, lit up.
    c.fillStyle = '#120c2c';
    c.fillRect(60, ceil - 260, 34, 260);
    c.fillRect(68, ceil - 300, 18, 40);
    c.fillRect(75, ceil - 330, 4, 30);
    c.fillStyle = 'rgba(255,90,140,.8)';
    c.fillRect(68, ceil - 300, 18, 3);
    // The ceiling: drop tiles and a fluorescent strip.
    c.fillStyle = '#d9d6cc';
    c.fillRect(0, ceil, W, 40);
    c.fillStyle = '#b9b5a8';
    for (let x = 0; x < W; x += 40) c.fillRect(x, ceil, 2, 40);
    c.fillRect(0, ceil + 19, W, 2);
    c.fillStyle = '#9f9a8c';
    c.fillRect(0, ceil + 38, W, 2);
    c.fillStyle = '#fbfff8';
    c.fillRect(70, ceil + 40, 90, 6);
    c.fillRect(210, ceil + 40, 90, 6);
    // The store: cream wall, shelves stuffed with everything.
    const top = ceil + 46;
    c.fillStyle = '#efe2c4';
    c.fillRect(0, top, W, BG_H - top);
    const lights = c.createLinearGradient(0, top, 0, BG_H);
    lights.addColorStop(0, 'rgba(255,255,240,.35)');
    lights.addColorStop(1, 'rgba(120,90,50,.25)');
    c.fillStyle = lights;
    c.fillRect(0, top, W, BG_H - top);
    // Menu board.
    c.fillStyle = '#1b1b1f';
    c.fillRect(30, top + 14, 300, 74);
    c.strokeStyle = '#c9a227';
    c.lineWidth = 3;
    c.strokeRect(30, top + 14, 300, 74);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = '900 13px "Arial Black", system-ui, sans-serif';
    c.fillStyle = '#ffd43b';
    c.fillText('BACON EGG & CHEESE', 42, top + 32);
    c.fillText('CHOPPED CHEESE', 42, top + 52);
    c.fillText('TURKEY HERO', 42, top + 72);
    c.textAlign = 'right';
    c.fillStyle = '#fff';
    c.fillText('$5.50', 318, top + 32);
    c.fillText('$9.99', 318, top + 52);
    c.fillText('$11.25', 318, top + 72);
    // Shelves.
    const COLORS = ['#e63946', '#f1c40f', '#2e86de', '#27ae60', '#ff7f11', '#8e44ad', '#ff4fa3', '#16a085', '#f5f5f5', '#c0392b'];
    for (let sy = top + 140; sy < BG_H - 60; sy += 66) {
      let x = 6;
      while (x < W - 14) {
        const kind = r();
        const w = kind < 0.35 ? 10 : kind < 0.7 ? 18 : 24;
        const h = kind < 0.35 ? 18 : kind < 0.7 ? 34 : 44;
        const col = COLORS[Math.floor(r() * COLORS.length)];
        const n = 1 + Math.floor(r() * 4);
        for (let k = 0; k < n && x < W - 14; k++) {
          c.fillStyle = col;
          if (kind < 0.35) {
            c.beginPath();
            c.roundRect(x, sy - h, w, h, 3);
            c.fill();
            c.fillStyle = 'rgba(255,255,255,.55)';
            c.fillRect(x + 1, sy - h + 4, w - 2, 3);
          } else if (kind < 0.7) {
            // Chip bags.
            c.beginPath();
            c.moveTo(x, sy);
            c.lineTo(x + 1, sy - h);
            c.lineTo(x + w - 1, sy - h);
            c.lineTo(x + w, sy);
            c.fill();
            c.fillStyle = 'rgba(255,255,255,.5)';
            c.beginPath();
            c.arc(x + w / 2, sy - h / 2, 4, 0, Math.PI * 2);
            c.fill();
          } else {
            c.fillRect(x, sy - h, w, h);
            c.fillStyle = 'rgba(0,0,0,.18)';
            c.fillRect(x + w - 4, sy - h, 4, h);
            c.fillStyle = 'rgba(255,255,255,.75)';
            c.fillRect(x + 3, sy - h + 6, w - 9, 6);
          }
          x += w + 1;
        }
        x += 3 + r() * 6;
      }
      c.fillStyle = '#8a8f96';
      c.fillRect(0, sy, W, 5);
      c.fillStyle = '#5d6168';
      c.fillRect(0, sy + 5, W, 2);
      c.fillStyle = '#fff36b';
      for (let x = 18; x < W; x += 54) c.fillRect(x, sy + 1, 12, 4);
    }
    // A few signs.
    c.fillStyle = '#e63946';
    c.fillRect(250, BG_H - 230, 86, 26);
    c.fillStyle = '#fff';
    c.font = '900 13px "Arial Black", system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('LOTTO', 293, BG_H - 216);
    c.fillStyle = '#ff2d55';
    c.font = '900 16px "Arial Black", system-ui, sans-serif';
    c.fillText('OPEN 24 HRS', 90, BG_H - 214);
    // Push the store back (so the sandwich pops): a warm dim, darker toward the edges.
    c.fillStyle = 'rgba(40,24,12,.38)';
    c.fillRect(0, top, W, BG_H - top);
    const side = c.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(20,10,5,.35)');
    side.addColorStop(0.3, 'rgba(20,10,5,0)');
    side.addColorStop(0.7, 'rgba(20,10,5,0)');
    side.addColorStop(1, 'rgba(20,10,5,.35)');
    c.fillStyle = side;
    c.fillRect(0, top, W, BG_H - top);
  });
  const panel = prerender(130, 84, (c) => {
    c.fillStyle = 'rgba(12,10,20,.62)';
    c.beginPath();
    c.roundRect(0, 0, 130, 84, 14);
    c.fill();
  });
  const counter = prerender(W, 100, (c) => {
    const r = rng(9);
    // Counter top (speckled formica), then the front with stickers.
    c.fillStyle = '#d5d9dd';
    c.fillRect(0, 0, W, 10);
    for (let i = 0; i < 120; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.6)';
      c.fillRect(r() * W, r() * 9, 1.5, 1.5);
    }
    c.fillStyle = '#9aa1a8';
    c.fillRect(0, 10, W, 3);
    const fr = c.createLinearGradient(0, 13, 0, 100);
    fr.addColorStop(0, '#7b4a2a');
    fr.addColorStop(1, '#4d2c17');
    c.fillStyle = fr;
    c.fillRect(0, 13, W, 87);
    c.fillStyle = 'rgba(0,0,0,.18)';
    for (let x = 0; x < W; x += 30) c.fillRect(x, 13, 2, 87);
    const sticker = (x: number, y: number, w: number, bgc: string, text: string, fg: string) => {
      c.fillStyle = bgc;
      c.beginPath();
      c.roundRect(x, y, w, 18, 3);
      c.fill();
      c.fillStyle = fg;
      c.font = '900 9px "Arial Black", system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, x + w / 2, y + 9.5);
    };
    sticker(16, 34, 78, '#1d4ed8', 'WE ACCEPT EBT', '#fff');
    sticker(130, 52, 64, '#ffd43b', 'ATM INSIDE', '#111');
    sticker(240, 30, 96, '#fff', 'NO LOITERING 🙏', '#e11d48');
  });
  const CAT = emojiSprite('🐈', 40), CUP = emojiSprite('☕', 32), BAG = emojiSprite('🛍️', 32);
  const stars = new Float32Array(60);
  for (let i = 0; i < 60; i += 2) (stars[i] = Math.random() * W), (stars[i + 1] = Math.random() * 600);

  // ------------------------------------------------------------ helpers
  /** Screen y of the top of layer i's front face. */
  const layerY = (i: number) => COUNTER_Y - (i + 1) * LH + camY;
  const drawSlab = (x: number, y: number, w: number, kind: number, gold: boolean, now: number, sq = 0) => {
    if (w <= 0.5) return;
    const hh = TEX_H * (1 - sq * 0.16);
    const ww = w + sq * 6;
    const xx = x - sq * 3;
    const yy = y - TD + (TEX_H - hh) - 0;
    g.drawImage(TEX[kind], 0, 0, Math.min(TEX_W, w), TEX_H, xx, yy, ww, hh);
    // Cut ends a touch darker (the slice faces).
    g.fillStyle = 'rgba(0,0,0,.16)';
    g.fillRect(xx, yy + TD * (1 - sq * 0.16), 2, LH * (1 - sq * 0.16));
    g.fillRect(xx + ww - 2, yy + TD * (1 - sq * 0.16), 2, LH * (1 - sq * 0.16));
    if (gold) {
      g.save();
      g.beginPath();
      g.rect(xx, yy, ww, hh - DRIP);
      g.clip();
      g.fillStyle = 'rgba(255,215,60,.22)';
      g.fillRect(xx, yy, ww, hh);
      if (!REDUCED) g.drawImage(shine, xx - 40 + ((now / 4) % (ww + 80)), yy);
      g.restore();
    }
  };
  const spawnChunk = (x: number, y: number, w: number, kind: number, gold: boolean, dir: number, big: boolean) => {
    let c = chunks[0];
    for (const k of chunks) if (!k.on) (c = k);
    c.on = true;
    c.x = x;
    c.y = y;
    c.w = w;
    c.kind = kind;
    c.gold = gold;
    c.vx = dir * (big ? 60 : 50 + Math.random() * 70);
    c.vy = big ? -40 : -60 - Math.random() * 40;
    c.rot = 0;
    c.spin = dir * (big ? 1.5 : 2 + Math.random() * 3);
  };

  // ------------------------------------------------------------ input
  const drop = () => {
    if (fin.ended || s.dead) return;
    const now = performance.now();
    // A double-tap shouldn't throw the next layer from off the edge.
    if (now - lastDrop < 110) return;
    lastDrop = now;
    started = true;
    events.length = 0;
    const prevCur = { ...s.cur };
    stackPlace(s, rand, events);
    for (const e of events) handle(e, prevCur, now);
  };
  const down = (e: PointerEvent) => {
    e.preventDefault();
    drop();
  };
  cv.addEventListener('pointerdown', down);
  const offK = keys((k) => (k === ' ' || k === 'Enter' || k === 'ArrowDown') && drop());

  // ------------------------------------------------------------ events
  const handle = (e: StackEvent, cur: { x: number; w: number; kind: number; gold: boolean; dir: number }, now: number) => {
    const n = s.layers.length - 1; // the layer just placed
    const y = layerY(n);
    if (e.type === 'place') {
      land = 1;
      const d = e.drop;
      if (d.kind === 'perfect') {
        ripple = 1;
        rippleX = d.x;
        rippleW = d.w;
        rippleY = y;
        fx.burst(d.x + d.w / 2, y + 4, { colors: ['#fff', '#ffe08a', '#ffd43b'], n: 10 + Math.min(10, e.streak * 2), size: 3, speed: 160, life: 0.45, up: true });
        fx.pop(W / 2, y - 26, e.streak > 1 ? `PERFECT ×${e.streak}` : 'PERFECT', '#ffe08a', 18 + Math.min(6, e.streak));
        if (d.grow > 0) fx.pop(W / 2, y - 6, 'GROW!', '#7bd88f', 15);
        sfx.note(523 * Math.pow(2, Math.min(12, e.streak - 1) / 12));
        if (d.grow > 0) sfx.good();
        fx.shake(1.5, 0.08);
        catLook = 1;
      } else if (d.kind === 'cut') {
        spawnChunk(d.cutX, y, d.cutW, cur.kind, cur.gold, d.cutX < d.x ? -1 : 1, false);
        const big = d.cutW / Math.max(1, cur.w);
        sway = Math.min(1, big * 2.2);
        swayT = 0;
        fx.shake(2 + big * 8, 0.15);
        fx.burst(d.cutX < d.x ? d.x : d.x + d.w, y + LH / 2, { colors: ['#fff', '#d9c9a0'], n: 5, size: 3, speed: 90, life: 0.3 });
        sfx.tap();
        if (big > 0.3) sfx.punch();
      }
      fx.pop(d.x + d.w + 8 > W - 30 ? d.x - 18 : d.x + d.w + 18, y + 10, `+${e.pts}`, e.gold ? '#ffd43b' : '#fff', 14);
    } else if (e.type === 'order') {
      fx.stamp('ORDER UP! 🥪', '#ffd43b', 1);
      fx.pop(W / 2, y - 48, `+${e.bonus}`, '#ffd43b', 26);
      fx.flash('#ffd43b', 0.2);
      fx.burst(W / 2, y, { emoji: ['✨', '🧾'], n: 10, size: 16, speed: 200, up: true });
      sfx.cash();
      catHop = 1;
    } else {
      // Missed the whole thing.
      spawnChunk(cur.x, layerY(n + 1), cur.w, cur.kind, cur.gold, cur.dir, true);
      sway = 1;
      swayT = 0;
      fx.shake(12, 0.4);
      fx.flash('#e0283f', 0.2);
      fx.stamp('IT FELL! 🥪', '#e0283f', 1.3);
      sfx.bad();
      catHop = 1;
      endAt = now + 1500;
    }
  };

  // ------------------------------------------------------------ drawing
  const draw = (now: number) => {
    // Background (parallax), with the sky going on forever above it.
    const bgY = H - BG_H + camY * PARALLAX;
    if (bgY > 0) {
      g.fillStyle = '#070b1f';
      g.fillRect(-20, -20, W + 40, bgY + 22);
      g.fillStyle = '#fff';
      for (let i = 0; i < 60; i += 2) {
        let sy = (stars[i + 1] + camY * 0.3) % 600;
        sy = sy - 600 + bgY;
        if (sy > -4 && sy < bgY) g.fillRect(stars[i], sy, 1.5, 1.5);
      }
    }
    g.drawImage(bg, 0, bgY);
    if (bgY + BG_H < H + 20) {
      g.fillStyle = '#efe2c4';
      g.fillRect(-20, bgY + BG_H, W + 40, H + 40);
    }
    // The counter, the cat, the props (they move with the tower).
    const cy = COUNTER_Y + camY;
    if (cy < H + 10) {
      g.drawImage(counter, 0, cy);
      g.fillStyle = '#e6e8ea';
      g.fillRect(-20, cy, 20, 100);
      g.fillRect(W, cy, 20, 100);
      blit(g, CUP, 28, cy - 12, 22);
      blit(g, BAG, 58, cy - 14, 24);
      const hop = catHop > 0 ? Math.sin(catHop * Math.PI) * 18 : 0;
      const breathe = REDUCED ? 0 : Math.sin(now / 600) * 0.8;
      g.save();
      g.translate(326, cy - 15 - hop + breathe);
      // The cat faces where the action is.
      const faceLeft = s.cur.x + s.cur.w / 2 < 300 || catLook > 0;
      g.scale(faceLeft ? 1 : -1, 1);
      blit(g, CAT, 0, 0, 30);
      g.restore();
    }
    // Tower (only what's on screen), with a sway after big cuts.
    const n = s.layers.length;
    const sq = land;
    const lift = sq * 2; // the tower settles a touch under a landing
    for (let i = 0; i < n; i++) {
      const y = layerY(i) + lift * (i / n);
      if (y > H + 10 || y < -LH - 20) continue;
      const L = s.layers[i];
      const off = REDUCED ? 0 : Math.sin(swayT * 14) * sway * 7 * Math.pow(i / Math.max(1, n - 1), 1.6);
      drawSlab(L.x + off, y, L.w, L.kind, L.gold, now, i === n - 1 ? sq : 0);
    }
    // Ripple on a perfect.
    if (ripple > 0) {
      const k = 1 - ripple;
      g.globalAlpha = ripple;
      g.strokeStyle = '#fff0aa';
      g.lineWidth = 2;
      g.strokeRect(rippleX - k * 18, rippleY - TD - k * 10, rippleW + k * 36, LH + TD + k * 20);
      g.globalAlpha = 1;
    }
    // The sliding layer, with guides down to the top of the sandwich.
    if (!s.dead) {
      const top = s.layers[n - 1];
      const y = layerY(n);
      g.fillStyle = 'rgba(255,255,255,.18)';
      for (let gy = y + LH; gy < layerY(n - 1); gy += 4) (g.fillRect(top.x, gy, 1, 2), g.fillRect(top.x + top.w - 1, gy, 1, 2));
      g.fillStyle = 'rgba(0,0,0,.18)';
      const ox = clamp(s.cur.x, top.x, top.x + top.w), ow = clamp(s.cur.x + s.cur.w, top.x, top.x + top.w) - ox;
      if (ow > 0) g.fillRect(ox, layerY(n - 1) - TD, ow, TD);
      drawSlab(s.cur.x, y - (REDUCED ? 0 : Math.sin(now / 160) * 1), s.cur.w, s.cur.kind, s.cur.gold, now);
    }
    // Falling slices.
    for (const c of chunks) {
      if (!c.on) continue;
      g.save();
      g.translate(c.x + c.w / 2, c.y + LH / 2);
      g.rotate(c.rot);
      drawSlab(-c.w / 2, -LH / 2, c.w, c.kind, c.gold, now);
      g.restore();
    }
    // Height and the next order.
    const layers = n - 1;
    const orderNext = stackIsOrder(n) && !s.dead;
    g.drawImage(panel, W / 2 - 65, 4, 130, s.streak >= 2 || orderNext ? 80 : 60);
    label(g, `${layers}`, W / 2, 30, 30, '#fff');
    const got = layers % STACK_ORDER_EVERY;
    for (let i = 0; i < STACK_ORDER_EVERY; i++) {
      g.fillStyle = i < got ? '#ffd43b' : 'rgba(0,0,0,.35)';
      g.fillRect(W / 2 - 49 + i * 10, 52, 8, 4);
    }
    if (orderNext) label(g, '✨ top bread next', W / 2, 72, 14, '#ffd43b');
    else if (s.streak >= 2) label(g, `🔥 ${s.streak} perfect`, W / 2, 72, 15, '#ffe08a');
    if (!started) label(g, 'TAP TO DROP', W / 2, layerY(n) - 30, 22, '#fff');
  };

  // ------------------------------------------------------------ loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    if (!fx.frozen) {
      stackSlide(s, dt);
      land = Math.max(0, land - dt * 7);
      ripple = Math.max(0, ripple - dt * 2.5);
      catHop = Math.max(0, catHop - dt * 2.2);
      catLook = Math.max(0, catLook - dt * 1.5);
      swayT += dt;
      sway = Math.max(0, sway - dt * 1.2);
      for (const c of chunks) {
        if (!c.on) continue;
        c.vy += 1100 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += c.spin * dt;
        if (c.y > H + 60) c.on = false;
      }
    }
    // Camera: keep the slider at SLIDE_Y.
    const want = Math.max(0, (s.layers.length + 1) * LH - (COUNTER_Y - SLIDE_Y));
    camY += (want - camY) * Math.min(1, dt * (REDUCED ? 4 : 7));
    // Through the roof.
    if (!roofDone) {
      const ceilY = H - BG_H + camY * PARALLAX + (BG_H - CEIL_FROM_BOTTOM) + 40;
      if (layerY(s.layers.length - 1) < ceilY && s.layers.length > 5) {
        roofDone = true;
        fx.stamp('THROUGH THE ROOF!', '#7bd88f', 1.2);
        fx.burst(W / 2, ceilY, { colors: ['#d9d6cc', '#b9b5a8', '#fbfff8'], n: 24, size: 5, speed: 220 });
        fx.shake(8, 0.3);
        sfx.cheer();
      }
    }
    draw(now);
    fx.end(g);
    say(`🥪 ${s.score} · ${s.layers.length - 1} layers${s.streak >= 2 ? ` · 🔥${s.streak}` : ''}`);
    if (endAt && now >= endAt && !fin.ended) {
      fx.pop(W / 2, H / 2, `${s.layers.length - 1} layers`, '#fff', 22);
      fin.end(s.score, 200);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    fin.cancel();
    cancelAnimationFrame(raf);
    cv.removeEventListener('pointerdown', down);
    offK();
  };
};
