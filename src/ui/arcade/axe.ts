// =====================================================================
// 🪓 Axe Throwing — a plank target, ten axes.
//
// Swipe up from the bottom: the swipe's direction and length aim (a bent
// swipe hooks), and its speed sets the spin. One full turn and the blade
// bites; too slow or too fast and the handle hits first (clang, 0). Your
// aim sways a little (the reticle on the board shows it): let go when
// it's steady. Rings 1–5, bullseye 6, bulls in a row earn a bonus, and a
// called 🎯 kill shot (the top-corner dots) is 8, or 0 if you miss it.
// Keys: K calls the kill shot, Space throws a clean one at the bull.
// The rules (pure, tested): sim/axe.ts.
// =====================================================================

import { burst as hiss, note, sfx } from '../audio.ts';
import { Fx } from '../juice.ts';
import { emoji, H, W, type Run } from '../arcade-games.ts';
import { clamp, finisher, keys, label, pointers, prerender } from './kit.ts';
import {
  AXE_BOARD, AXE_CX, AXE_CY, AXE_GAIN, AXE_HAND, AXE_KILLS, AXE_KILL_R, AXE_RINGS, AXE_STICK_TOL, AXE_SWEET, AXE_THROWS,
  axeAim, axeScore, axeSpin, axeSpinVerdict, type AxeResult,
} from '../../sim/axe.ts';

type Phase = 'ready' | 'fly' | 'stuck' | 'bounce' | 'over';

const RING_FILL = ['#d7263d', '#1f4e9c', '#efe6cf', '#1f4e9c', '#efe6cf', '#1f4e9c'];
const RING_INK = ['#fff', '#fff', '#1f2a44', '#fff', '#1f2a44', '#fff'];
const PLANKS = ['#c99a62', '#bb8a52', '#d2a56d', '#b7844d', '#c6965d', '#cfa168'];
const CHIPS = ['#e8c08a', '#c8955a', '#8a5a2b', '#f3d9b1'];
const BTN = { x: 8, y: 380, w: 106, h: 44 };
const GAUGE = { x: 246, y: 398, w: 104 };
const SCORE_Y = 340;

/** A small seeded random (the plank grain looks the same every game). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The axe, head up, its balance point at the origin. The bite is at (0, -30). */
function drawAxe(g: CanvasRenderingContext2D, x: number, y: number, a: number, s: number, alpha = 1): void {
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.rotate(a);
  g.scale(s, s);
  // Handle.
  g.fillStyle = '#b97a3e';
  g.beginPath();
  g.moveTo(-3.5, -30);
  g.lineTo(3.5, -30);
  g.lineTo(4.5, 44);
  g.quadraticCurveTo(0, 49, -4.5, 44);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,230,190,.35)';
  g.fillRect(-2.5, -28, 1.6, 56);
  // Grip tape.
  g.fillStyle = '#26262b';
  g.fillRect(-4.6, 28, 9.2, 16);
  g.fillStyle = '#e0283f';
  g.fillRect(-4.6, 31, 9.2, 2);
  g.fillRect(-4.6, 38, 9.2, 2);
  // Head: the poll and the blade.
  g.fillStyle = '#4c5661';
  g.fillRect(-11, -39, 15, 15);
  g.fillStyle = '#6c7a86';
  g.beginPath();
  g.moveTo(3, -39);
  g.lineTo(15, -46);
  g.quadraticCurveTo(28, -31, 15, -15);
  g.lineTo(3, -24);
  g.closePath();
  g.fill();
  g.strokeStyle = '#eef4f7';
  g.lineWidth = 2.6;
  g.beginPath();
  g.moveTo(15, -46);
  g.quadraticCurveTo(28, -31, 15, -15);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.3)';
  g.fillRect(-9, -37, 10, 3);
  g.restore();
}

export const axe: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  let raf = 0, over = false;
  let phase: Phase = 'ready';
  let score = 0, n = 1, streak = 0, called = false;
  const results: AxeResult[] = [];
  const stuck: { x: number; y: number; a: number }[] = [];
  let clock = 0, handIn = 1, waitT = 0;
  // Flight.
  let sx = 0, sy = 0, tx = 0, ty = 0, turns = 1, flyT = 0, flyDur = 0.45, lastTurns = -1;
  let res: AxeResult | null = null;
  let landX = 0, landY = 0;
  // Bounce off.
  let bx = 0, by = 0, bvx = 0, bvy = 0, ba = 0, bva = 0, bs = 0.6, bt = 0;
  // Ring flash.
  let litT = 0, litR = 0, litX = 0, litY = 0;
  // The swipe.
  let dragging = false, btnDown = false, dragDx = 0, dragDy = 0;
  const XS: number[] = [], YS: number[] = [], TS: number[] = [];

  const sway = (t: number) => {
    const amp = 1 + Math.min(3, streak) * 0.15; // a bit shakier on a hot streak
    return {
      x: (Math.sin(t * 1.9) * 8 + Math.sin(t * 4.7 + 0.6) * 3) * amp,
      y: (Math.sin(t * 2.6 + 1.3) * 6 + Math.sin(t * 5.3) * 2) * amp,
    };
  };

  // ------------------------------------------------------------ sounds
  const thunk = (hard: boolean) => {
    hiss(0, 0.16, { type: 'lowpass', freq: 700, gain: hard ? 0.5 : 0.38, brown: true, out: 'sfx' });
    note(92, 0, 0.18, 'sine', hard ? 0.4 : 0.3, 'sfx');
    note(230, 0, 0.05, 'triangle', 0.12, 'sfx');
  };
  const clang = () => {
    note(1180, 0, 0.32, 'square', 0.025, 'sfx');
    note(1790, 0, 0.28, 'triangle', 0.05, 'sfx');
    note(2630, 0.004, 0.2, 'sine', 0.04, 'sfx');
    hiss(0, 0.05, { type: 'highpass', freq: 3000, gain: 0.12, out: 'sfx' });
  };

  // ------------------------------------------------------------- throw
  const throwAxe = (dx: number, dy: number, curl: number, speed: number) => {
    const sw = sway(clock);
    const land = axeAim(dx, dy, curl, sw.x, sw.y);
    turns = axeSpin(speed);
    lastTurns = turns;
    res = axeScore(land.x, land.y, turns, called, streak);
    landX = land.x;
    landY = land.y;
    sx = AXE_HAND.x + sw.x * 0.4;
    sy = AXE_HAND.y;
    tx = clamp(land.x, -30, W + 30);
    ty = clamp(land.y, -20, H) + 30 * 0.6;
    flyT = 0;
    flyDur = clamp(0.46 - (speed - AXE_SWEET) / 6000, 0.32, 0.6);
    phase = 'fly';
    sfx.whoosh();
  };

  const impact = () => {
    const r = res!;
    score += r.pts;
    streak = r.streak;
    results.push(r);
    called = false;
    const x = landX, y = landY;
    if (r.stuck) {
      const tilt = clamp((turns - 1) * Math.PI * 2 * 0.35, -0.5, 0.5);
      stuck.push({ x, y, a: tilt });
      if (stuck.length > 3) stuck.shift();
      notch(x, y, tilt);
      thunk(r.pts >= 6);
      fx.shake(r.pts >= 6 ? 11 : 6, 0.2);
      fx.stop(r.pts >= 6 ? 0.09 : 0.05);
      fx.burst(x, y, { colors: CHIPS, n: 16, size: 4, speed: 220, life: 0.6 });
      fx.burst(x, y, { colors: CHIPS, n: 6, size: 7, speed: 120, life: 0.8, up: true });
      litT = 0.7;
      litX = AXE_CX;
      litY = AXE_CY;
      litR = 0;
      if (r.zone === 'bull') litR = AXE_RINGS[0];
      else if (r.zone === 'ring') litR = AXE_RINGS[6 - r.base];
      else if (r.zone === 'kill') {
        const k = AXE_KILLS[x < AXE_CX ? 0 : 1];
        litX = k.x;
        litY = k.y;
        litR = AXE_KILL_R;
      } else litT = 0;
      if (r.zone === 'kill' && r.pts) {
        fx.pop(x, y - 22, '+8', '#2ec4b6', 30);
        fx.stamp('🎯 KILL SHOT!', '#2ec4b6', 1.1);
        fx.flash('#2ec4b6', 0.25);
        fx.burst(x, y, { emoji: ['🎟️', '✨', '🪓'], n: 16, size: 18, speed: 240, up: true });
        sfx.jackpot();
      } else if (r.zone === 'bull') {
        fx.pop(x, y - 22, `+${r.base}`, '#ffd23f', 30);
        if (r.bonus) fx.pop(x, y + 18, `🔥 +${r.bonus}`, '#ff6a00', 20);
        fx.stamp(r.streak >= 2 ? `BULL ×${r.streak}!` : 'BULLSEYE!', '#ff2e63', 0.9);
        fx.burst(x, y, { emoji: ['✨', '🎟️'], n: 10, size: 16, speed: 200, up: true });
        sfx.win();
      } else if (r.pts) {
        fx.pop(x, y - 22, `+${r.pts}`, r.pts >= 4 ? '#ffd23f' : '#fff', 18 + r.pts * 2);
        sfx.note(400 + r.pts * 90);
      } else if (r.why === 'missedCall') {
        fx.pop(x, y - 22, 'MISSED THE CALL · 0', '#e0283f', 17);
        sfx.bad();
      } else if (r.why === 'uncalled') {
        fx.pop(x, y - 22, 'NOT CALLED · 0', '#e0283f', 17);
        sfx.bad();
      } else {
        fx.pop(x, y - 22, 'NO RING · 0', '#fff', 17);
      }
      phase = 'stuck';
      waitT = 0.75;
    } else {
      clang();
      fx.shake(4, 0.12);
      fx.burst(clamp(x, 10, W - 10), clamp(y, 10, H), { colors: ['#fff', '#ffd23f', '#cfd8dc'], n: 10, size: 3, speed: 260, life: 0.35 });
      const v = axeSpinVerdict(turns);
      const px = clamp(x, 70, W - 70), py = clamp(y - 22, 40, 300);
      if (r.why === 'off') fx.pop(px, py, 'OFF THE BOARD · 0', '#fff', 18);
      else fx.pop(px, py, 'CLANG! · 0', '#cfd8dc', 22);
      if (r.why !== 'off') fx.pop(px, py + 34, v === 'slow' ? 'handle first: throw faster' : 'over-spun: ease off', '#ffd23f', 14);
      sfx.bad();
      bx = clamp(x, -20, W + 20);
      by = clamp(y, 0, H);
      bvx = (Math.random() - 0.5) * 180;
      bvy = -140 - Math.random() * 60;
      ba = turns * Math.PI * 2;
      bva = (turns < 1 ? -1 : 1) * 13;
      bs = 0.6;
      bt = 0;
      phase = 'bounce';
    }
  };

  const nextThrow = () => {
    n++;
    if (n > AXE_THROWS) {
      phase = 'over';
      const great = score >= 70, good = score >= 45;
      fx.stamp(great ? 'LUMBERJACK LEGEND!' : good ? 'NICE ARM!' : 'GAME OVER', good ? '#ffd23f' : '#fff', 1.4);
      if (good) (sfx.cheer(), fx.burst(180, 140, { emoji: ['🎟️', '🪓', '✨'], n: 20, size: 18, speed: 260 }));
      fin.end(score, 1600);
      return;
    }
    phase = 'ready';
    handIn = 0;
    if (n === AXE_THROWS) fx.stamp('LAST AXE!', '#ff4fa3', 0.9);
  };

  // ------------------------------------------------------------- input
  const inBtn = (x: number, y: number) => x >= BTN.x && x <= BTN.x + BTN.w && y >= BTN.y && y <= BTN.y + BTN.h;
  const toggleCall = () => {
    if (phase === 'fly' || phase === 'over') return;
    called = !called;
    called ? sfx.good() : sfx.tap();
  };
  const offP = pointers(cv, {
    down: (t) => {
      if (inBtn(t.x, t.y)) {
        btnDown = true;
        return;
      }
      if (phase !== 'ready') return;
      dragging = true;
      XS.length = YS.length = TS.length = 0;
      XS.push(t.x);
      YS.push(t.y);
      TS.push(performance.now());
      dragDx = dragDy = 0;
    },
    move: (t) => {
      if (!dragging) return;
      if (XS.length < 200) (XS.push(t.x), YS.push(t.y), TS.push(performance.now()));
      dragDx = t.x - t.x0;
      dragDy = t.y - t.y0;
    },
    up: (t) => {
      if (btnDown) {
        btnDown = false;
        if (inBtn(t.x, t.y)) toggleCall();
        return;
      }
      if (!dragging) return;
      dragging = false;
      if (phase !== 'ready') return;
      const now = performance.now();
      XS.push(t.x);
      YS.push(t.y);
      TS.push(now);
      const dx = t.x - t.x0, dy = t.y - t.y0, len = Math.hypot(dx, dy);
      if (dy > -30 || len < 40) {
        fx.pop(180, 330, 'swipe up to throw ⬆️', '#fff', 16);
        return;
      }
      // Swipe speed: the last ~150 ms of movement before the finger lifted
      // (steadier than the final instant, which wobbles as a flick ends).
      // A lift that comes a beat after the last move reads as a pause.
      let last = XS.length - 1;
      if (last > 1 && Math.hypot(XS[last] - XS[last - 1], YS[last] - YS[last - 1]) < 1) last--;
      let speed = 0;
      if (now - TS[last] < 150 && last > 0) {
        let j = last - 1;
        while (j > 0 && TS[last] - TS[j - 1] <= 150) j--;
        const dtm = Math.max(16, TS[last] - TS[j]);
        speed = (Math.hypot(XS[last] - XS[j], YS[last] - YS[j]) / dtm) * 1000;
      }
      // How bent was the swipe? Signed sideways bow ÷ length.
      const ux = dx / len, uy = dy / len;
      let curl = 0;
      for (let i = 1; i < last; i++) {
        const d = (XS[i] - t.x0) * -uy + (YS[i] - t.y0) * ux;
        if (Math.abs(d) > Math.abs(curl)) curl = d;
      }
      throwAxe(dx, dy, curl / len, speed);
    },
  });
  const offK = keys((k) => {
    if (k === 'k' || k === 'K') toggleCall();
    if (k === ' ' && phase === 'ready') {
      const aim = called ? AXE_KILLS[0] : { x: AXE_CX, y: AXE_CY };
      throwAxe((aim.x - AXE_HAND.x) / AXE_GAIN, (aim.y - AXE_HAND.y) / AXE_GAIN, 0, AXE_SWEET * (0.9 + Math.random() * 0.2));
    }
  });

  // ---------------------------------------------------------- scenery
  const bg = prerender(W, H, (c) => {
    // A brick wall, lamp-lit.
    c.fillStyle = '#2a1714';
    c.fillRect(0, 0, W, H);
    for (let row = 0; row * 16 < 372; row++) {
      for (let col = -1; col * 34 < W; col++) {
        const x = col * 34 + (row % 2) * 17;
        c.fillStyle = (row * 7 + col * 3) % 5 === 0 ? '#4a2620' : (row + col) % 3 === 0 ? '#41221d' : '#3a1e19';
        c.fillRect(x + 1, row * 16 + 1, 32, 14);
      }
    }
    const lamp = c.createRadialGradient(AXE_CX, AXE_CY, 40, AXE_CX, AXE_CY, 300);
    lamp.addColorStop(0, 'rgba(255,190,110,.25)');
    lamp.addColorStop(1, 'rgba(0,0,0,.35)');
    c.fillStyle = lamp;
    c.fillRect(0, 0, W, 372);
    // Concrete floor and the throw line.
    const floor = c.createLinearGradient(0, 372, 0, H);
    floor.addColorStop(0, '#3d3d45');
    floor.addColorStop(1, '#1f1f25');
    c.fillStyle = floor;
    c.fillRect(0, 372, W, H - 372);
    c.fillStyle = '#c8202f';
    c.fillRect(0, 372, W, 4);
    // The lane cage, either side.
    c.strokeStyle = 'rgba(200,210,220,.18)';
    c.lineWidth = 1;
    for (const x0 of [0, W - 22]) {
      for (let k = -30; k < H; k += 9) {
        c.beginPath();
        c.moveTo(x0, k);
        c.lineTo(x0 + 22, k + 22);
        c.moveTo(x0 + 22, k);
        c.lineTo(x0, k + 22);
        c.stroke();
      }
    }
  });

  // The board (mutable: every axe that bites leaves a notch).
  const board = prerender(W, H, (c) => {
    const b = AXE_BOARD, r = rng(7);
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0, pw = bw / PLANKS.length;
    c.fillStyle = 'rgba(0,0,0,.5)';
    c.fillRect(b.x0 - 4, b.y0 + 6, bw + 14, bh + 6); // its shadow on the wall
    c.fillStyle = '#24160d';
    c.fillRect(b.x0 - 8, b.y0 - 8, bw + 16, bh + 16);
    for (let i = 0; i < PLANKS.length; i++) {
      c.fillStyle = PLANKS[i];
      c.fillRect(b.x0 + i * pw, b.y0, pw, bh);
    }
    // Paint.
    for (let i = AXE_RINGS.length - 1; i >= 0; i--) {
      c.globalAlpha = 0.82;
      c.fillStyle = RING_FILL[i];
      c.beginPath();
      c.arc(AXE_CX, AXE_CY, AXE_RINGS[i], 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    for (const k of AXE_KILLS) {
      c.fillStyle = '#2ec4b6';
      c.beginPath();
      c.arc(k.x, k.y, AXE_KILL_R, 0, Math.PI * 2);
      c.fill();
    }
    // Grain over the paint (the wood shows through), knots and old chops.
    for (let i = 0; i < PLANKS.length; i++) {
      const x0 = b.x0 + i * pw;
      for (let k = 0; k < 9; k++) {
        let x = x0 + 3 + r() * (pw - 6);
        c.strokeStyle = `rgba(80,40,12,${0.1 + r() * 0.14})`;
        c.lineWidth = 0.6 + r() * 1.1;
        c.beginPath();
        c.moveTo(x, b.y0);
        for (let y = b.y0; y < b.y1; y += 24) {
          const nx = clamp(x + (r() - 0.5) * 5, x0 + 2, x0 + pw - 2);
          c.quadraticCurveTo(x + (r() - 0.5) * 6, y + 12, nx, y + 24);
          x = nx;
        }
        c.stroke();
      }
      const ky = b.y0 + 20 + r() * (bh - 40), kx = x0 + 8 + r() * (pw - 16);
      c.fillStyle = 'rgba(70,35,10,.45)';
      c.beginPath();
      c.ellipse(kx, ky, 3 + r() * 2, 6 + r() * 3, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(70,35,10,.25)';
      c.beginPath();
      c.ellipse(kx, ky, 6, 11, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = 'rgba(40,20,5,.35)';
    c.lineWidth = 1.6;
    for (let i = 0; i < 26; i++) {
      const x = b.x0 + 10 + r() * (bw - 20), y = b.y0 + 10 + r() * (bh - 20), a = (r() - 0.5) * 0.6;
      c.beginPath();
      c.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5);
      c.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
      c.stroke();
    }
    // Plank gaps.
    c.fillStyle = 'rgba(30,15,5,.75)';
    for (let i = 1; i < PLANKS.length; i++) c.fillRect(b.x0 + i * pw - 1, b.y0, 2, bh);
    // Ring lines and numbers.
    c.strokeStyle = '#141414';
    c.lineWidth = 2;
    for (const rr of AXE_RINGS) {
      c.beginPath();
      c.arc(AXE_CX, AXE_CY, rr, 0, Math.PI * 2);
      c.stroke();
    }
    c.font = `900 11px "Arial Black", system-ui`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 1; i < AXE_RINGS.length; i++) {
      const mid = (AXE_RINGS[i] + AXE_RINGS[i - 1]) / 2;
      c.fillStyle = RING_INK[i];
      c.fillText(String(6 - i), AXE_CX, AXE_CY - mid);
      c.fillText(String(6 - i), AXE_CX, AXE_CY + mid);
    }
    c.fillStyle = '#fff';
    c.fillText('6', AXE_CX, AXE_CY + 0.5);
    for (const k of AXE_KILLS) {
      c.strokeStyle = '#141414';
      c.beginPath();
      c.arc(k.x, k.y, AXE_KILL_R, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#0b2a27';
      c.fillText('8', k.x, k.y + 0.5);
    }
    // Bolts.
    c.fillStyle = '#8a8f96';
    for (const [x, y] of [[b.x0 - 4, b.y0 - 4], [b.x1 + 4, b.y0 - 4], [b.x0 - 4, b.y1 + 4], [b.x1 + 4, b.y1 + 4]]) {
      c.beginPath();
      c.arc(x, y, 2.6, 0, Math.PI * 2);
      c.fill();
    }
  });
  const bctx = board.getContext('2d')!;
  const notch = (x: number, y: number, a: number) => {
    bctx.save();
    bctx.translate(x, y);
    bctx.rotate(a);
    bctx.strokeStyle = 'rgba(35,18,5,.8)';
    bctx.lineWidth = 2.4;
    bctx.beginPath();
    bctx.moveTo(-7, 0);
    bctx.lineTo(7, -1);
    bctx.stroke();
    bctx.strokeStyle = 'rgba(245,215,170,.7)';
    bctx.lineWidth = 1;
    bctx.beginPath();
    bctx.moveTo(-6, 2);
    bctx.lineTo(5, 1.5);
    bctx.stroke();
    bctx.restore();
  };

  // -------------------------------------------------------------- draw
  const reticle = (x: number, y: number, r: number, color: string, alpha: number) => {
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.moveTo(x - r - 5, y);
    g.lineTo(x - r + 3, y);
    g.moveTo(x + r + 5, y);
    g.lineTo(x + r - 3, y);
    g.moveTo(x, y - r - 5);
    g.lineTo(x, y - r + 3);
    g.moveTo(x, y + r + 5);
    g.lineTo(x, y + r - 3);
    g.stroke();
    g.globalAlpha = 1;
  };

  const draw = (now: number, dt: number) => {
    g.drawImage(bg, 0, 0);
    g.drawImage(board, 0, 0);
    // Called: the kill dots pulse.
    if (called) {
      const p = 0.5 + 0.5 * Math.sin(now / 120);
      g.strokeStyle = '#ff2e63';
      g.lineWidth = 3;
      g.shadowColor = '#ff2e63';
      g.shadowBlur = 10;
      for (const k of AXE_KILLS) {
        g.beginPath();
        g.arc(k.x, k.y, AXE_KILL_R + 4 + p * 4, 0, Math.PI * 2);
        g.stroke();
      }
      g.shadowBlur = 0;
    }
    // The ring that was hit blinks.
    if (litT > 0) {
      litT -= dt;
      if (Math.floor(litT * 12) % 2 === 0) {
        g.strokeStyle = '#fff';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(litX, litY, litR, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // Axes in the board (the last three).
    for (const a of stuck) {
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.beginPath();
      g.ellipse(a.x + 5, a.y + 22, 4, 18, a.a, 0, Math.PI * 2);
      g.fill();
      drawAxe(g, a.x - Math.sin(a.a) * 30 * 0.6, a.y + Math.cos(a.a) * 30 * 0.6, a.a, 0.6);
    }
    // Where your aim is (it sways); while you swipe, where this swipe goes.
    const sw = sway(clock);
    if (phase === 'ready') {
      if (dragging && dragDy < -10) {
        const p = axeAim(dragDx, dragDy, 0, sw.x, sw.y);
        reticle(p.x, p.y, 7, '#fff', 0.85);
      } else reticle(AXE_CX + sw.x, AXE_CY + sw.y, 7, '#fff', 0.55);
    }
    // The scorecard: ten boxes.
    for (let i = 0; i < AXE_THROWS; i++) {
      const x = 32 + i * 30, r = results[i];
      const cur = i === n - 1 && phase !== 'over';
      g.fillStyle = cur ? 'rgba(255,210,63,.9)' : 'rgba(0,0,0,.55)';
      g.fillRect(x - 13, SCORE_Y, 26, 24);
      if (r) {
        const col = r.zone === 'kill' && r.pts ? '#2ec4b6' : r.zone === 'bull' && r.pts ? '#ff2e63' : r.pts ? '#fff' : '#777';
        label(g, String(r.pts), x, SCORE_Y + 12.5, 14, col);
      } else {
        g.fillStyle = cur ? '#1c2340' : 'rgba(255,255,255,.35)';
        g.font = `900 10px "Arial Black", system-ui`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(i + 1), x, SCORE_Y + 12.5);
      }
    }
    // Call-the-kill-shot button.
    g.fillStyle = called ? '#e0283f' : 'rgba(0,0,0,.5)';
    g.strokeStyle = called ? '#ffd23f' : '#2ec4b6';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(BTN.x, BTN.y, BTN.w, BTN.h, 10);
    g.fill();
    g.stroke();
    emoji(g, '🎯', BTN.x + 18, BTN.y + BTN.h / 2, 18);
    label(g, called ? 'CALLED!' : 'CALL KILL', BTN.x + 66, BTN.y + 15, 12, called ? '#fff' : '#2ec4b6');
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.font = `700 9px system-ui`;
    g.fillText(called ? '8 or nothing' : 'top dots = 8', BTN.x + 66, BTN.y + 31);
    // Spin gauge: where your last throw landed vs the sweet spot.
    const gx = (t: number) => GAUGE.x + clamp(t / 2, 0, 1) * GAUGE.w;
    label(g, 'SPIN', GAUGE.x, GAUGE.y - 10, 11, '#cfd8dc', 'left');
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(GAUGE.x, GAUGE.y, GAUGE.w, 10);
    g.fillStyle = '#7bd88f';
    g.fillRect(gx(1 - AXE_STICK_TOL), GAUGE.y, gx(1 + AXE_STICK_TOL) - gx(1 - AXE_STICK_TOL), 10);
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.font = `700 9px system-ui`;
    g.textAlign = 'left';
    g.fillText('slow', GAUGE.x, GAUGE.y + 19);
    g.textAlign = 'right';
    g.fillText('fast', GAUGE.x + GAUGE.w, GAUGE.y + 19);
    if (lastTurns >= 0) {
      const mx = gx(lastTurns);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(mx, GAUGE.y + 2);
      g.lineTo(mx - 5, GAUGE.y - 6);
      g.lineTo(mx + 5, GAUGE.y - 6);
      g.closePath();
      g.fill();
    }
    // The axe: in your hand, in the air, or bouncing off.
    if (phase === 'ready') {
      const e = 1 - (1 - handIn) * (1 - handIn);
      const hx = AXE_HAND.x + sw.x * 0.4, hy = AXE_HAND.y + (1 - e) * 60;
      drawAxe(g, hx, hy, sw.x * 0.012, 1);
      if (n <= 2 && !dragging) {
        const bob = Math.sin(now / 200) * 4;
        g.globalAlpha = 0.8;
        emoji(g, '👆', hx + 34, hy + 18 + bob, 22);
        g.globalAlpha = 1;
        label(g, 'swipe up!', AXE_HAND.x, 392 + bob * 0.5, 15, '#fff');
      }
    } else if (phase === 'fly') {
      const f = Math.min(1, flyT / flyDur);
      const w = (turns * Math.PI * 2) / flyDur;
      const dist = Math.hypot(tx - sx, ty - sy);
      const pos = (ff: number) => ({
        x: sx + (tx - sx) * ff,
        y: sy + (ty - sy) * ff - Math.sin(ff * Math.PI) * 0.12 * dist,
        s: 1 - 0.4 * ff,
      });
      // Motion blur: ghosts trailing the spin, and a swoosh arc.
      for (let k = 4; k >= 1; k--) {
        const ff = Math.max(0, f - k * 0.025);
        const p = pos(ff);
        drawAxe(g, p.x, p.y, w * ff * flyDur - k * w * 0.012, p.s, 0.26 - k * 0.05);
      }
      const p = pos(f), a = w * f * flyDur;
      g.strokeStyle = 'rgba(238,244,247,.35)';
      g.lineWidth = 5 * p.s;
      g.beginPath();
      g.arc(p.x, p.y, 40 * p.s, a - Math.PI / 2 - Math.min(1.6, w * 0.06), a - Math.PI / 2);
      g.stroke();
      drawAxe(g, p.x, p.y, a, p.s);
    } else if (phase === 'bounce') {
      drawAxe(g, bx, by, ba, bs, clamp(1.4 - bt, 0, 1));
    }
    if (streak >= 2) label(g, `🔥 BULL ×${streak}`, 180, 30, 14, '#ff6a00');
  };

  // -------------------------------------------------------------- loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    if (!fx.frozen) {
      clock += dt;
      if (handIn < 1) handIn = Math.min(1, handIn + dt * 4);
      if (phase === 'fly') {
        flyT += dt;
        if (flyT >= flyDur) impact();
      } else if (phase === 'stuck') {
        waitT -= dt;
        if (waitT <= 0) nextThrow();
      } else if (phase === 'bounce') {
        bt += dt;
        bvy += 1300 * dt;
        bx += bvx * dt;
        by += bvy * dt;
        ba += bva * dt;
        bs += 0.5 * dt;
        if (by > H + 60 || bt > 1.2) nextThrow();
      }
    }
    draw(now, dt);
    fx.end(g);
    hud(`🪓 ${score} · axe ${Math.min(n, AXE_THROWS)}/${AXE_THROWS}${streak >= 2 ? ` · 🔥${streak}` : ''}${called ? ' · 🎯 called' : ''}`);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    fin.cancel();
    cancelAnimationFrame(raf);
    offP();
    offK();
  };
};
