// =====================================================================
// 🐦 Pigeon Pop — whack-a-mole on a Brooklyn building front.
//
// Nine spots: three windows (they pop up from the flower boxes), three
// window AC units (from behind the unit) and three trash cans on the
// sidewalk (the lid flips). Tap a 🐦 to pop it before it ducks; quick
// hits chain a combo (×4), a pop within a blink of it showing is QUICK.
// 🕊️ golden pigeon = FRENZY (pigeons only, ×2 for 5 s), 🥖 the bread bag
// pops every pigeon that's up, and never tap the 🐀. The pace ramps for
// 45 seconds and the last 10 are RUSH HOUR.
// Keys (optional): Q W E / A S D / Z X C, or the number pad.
// The rules (pure, tested): sim/arcade-pigeons.ts.
// =====================================================================

import { burst as hiss, note, sfx } from '../audio.ts';
import { Fx, buzz } from '../juice.ts';
import { H, W, secs, type Run } from '../arcade-games.ts';
import { bar, clamp, finisher, keys, label, num, pointers, prerender } from './kit.ts';
import { PIGEON_ROUND, PIGEON_FRENZY, PigeonRound, pigeonRng, type PigeonEvent } from '../../sim/arcade-pigeons.ts';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type SpotKind = 'window' | 'ac' | 'can';
interface SpotGeo {
  kind: SpotKind;
  x: number;
  /** Where its feet are: it rises from below this line. */
  y: number;
  /** What it's seen through (things are clipped to this while up). */
  clip: { x: number; y: number; w: number; h: number };
}

const COLS = [62, 180, 298];
const ROW_Y: Record<SpotKind, number> = { window: 196, ac: 300, can: 404 };
const SPOTS: SpotGeo[] = (['window', 'ac', 'can'] as SpotKind[]).flatMap((kind) =>
  COLS.map((x) => {
    const y = ROW_Y[kind];
    const clip = kind === 'window' ? { x: x - 35, y: 110, w: 70, h: y - 110 } : { x: x - 58, y: y - 84, w: 116, h: 84 };
    return { kind, x, y, clip };
  }),
);
/** Generous touch targets: a circle around the middle of whatever's up. */
const HIT_R = 60;
const RISE = 58;
const KEYMAP: Record<string, number> = { q: 0, w: 1, e: 2, a: 3, s: 4, d: 5, z: 6, x: 7, c: 8, '7': 0, '8': 1, '9': 2, '4': 3, '5': 4, '6': 5, '1': 6, '2': 7, '3': 8 };

interface Pal {
  body: string;
  wing: string;
  head: string;
  neckA: string;
  neckB: string;
  bars: string;
}
const GREY: Pal = { body: '#9aa2ae', wing: '#7d8592', head: '#8a93a1', neckA: '#3fae7a', neckB: '#8c4fb0', bars: '#2b2e35' };
const GOLD: Pal = { body: '#ffd23f', wing: '#f4a300', head: '#ffe07a', neckA: '#fff3b0', neckB: '#ff9f1c', bars: '#b86e00' };

// ---------------------------------------------------------------- drawing

/** A pigeon, feet at (0,0), facing right; ~50 px tall. */
function drawPigeon(g: CanvasRenderingContext2D, p: Pal, bob: number, blink: boolean, flap = 0): void {
  // Tail.
  g.fillStyle = p.wing;
  g.beginPath();
  g.moveTo(-12, -12);
  g.lineTo(-31, -6);
  g.lineTo(-29, -17);
  g.closePath();
  g.fill();
  // Body.
  g.fillStyle = p.body;
  g.beginPath();
  g.ellipse(0, -17, 20, 15, 0, 0, Math.PI * 2);
  g.fill();
  // Neck: the shimmer.
  const ng = g.createLinearGradient(4, -36, 14, -20);
  ng.addColorStop(0, p.neckA);
  ng.addColorStop(1, p.neckB);
  g.fillStyle = ng;
  g.beginPath();
  g.ellipse(9 + bob * 0.5, -28, 9, 10, 0.3, 0, Math.PI * 2);
  g.fill();
  // Wing (lifts when it flaps off).
  g.save();
  g.translate(-2, -20);
  g.rotate(-0.15 - flap * 1.1);
  g.fillStyle = p.wing;
  g.beginPath();
  g.ellipse(-3, 2, 15, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = p.bars;
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(-10, 0);
  g.lineTo(2, 3);
  g.moveTo(-12, 5);
  g.lineTo(0, 8);
  g.stroke();
  g.restore();
  // Head.
  const hx = 13 + bob;
  g.fillStyle = p.head;
  g.beginPath();
  g.arc(hx, -40, 9, 0, Math.PI * 2);
  g.fill();
  // Beak with its little white cere.
  g.fillStyle = '#2b2e35';
  g.beginPath();
  g.moveTo(hx + 7, -42);
  g.lineTo(hx + 15, -39);
  g.lineTo(hx + 7, -36.5);
  g.closePath();
  g.fill();
  g.fillStyle = '#f1f1f1';
  g.beginPath();
  g.ellipse(hx + 8, -42, 2.6, 1.5, 0, 0, Math.PI * 2);
  g.fill();
  // Orange eye.
  if (blink) {
    g.strokeStyle = '#2b2e35';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(hx + 1, -43);
    g.lineTo(hx + 6, -43);
    g.stroke();
  } else {
    g.fillStyle = '#ff8c1a';
    g.beginPath();
    g.arc(hx + 3.5, -43, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(hx + 4.2, -43, 1.4, 0, Math.PI * 2);
    g.fill();
  }
}

/** The rat: darker, big pink ears, a tail. Feet at (0,0), facing right. */
function drawRat(g: CanvasRenderingContext2D, wig: number, bit: boolean): void {
  // Tail curling up behind.
  g.strokeStyle = '#e59aa6';
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-18, -10);
  g.bezierCurveTo(-36, -8, -40 + wig * 3, -30, -28, -40);
  g.stroke();
  g.lineCap = 'butt';
  // Body and head.
  g.fillStyle = '#5c5662';
  g.beginPath();
  g.ellipse(-2, -16, 22, 15, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(16, -26, 13, 11, -0.25, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(22, -32);
  g.lineTo(34, -23);
  g.lineTo(22, -18);
  g.closePath();
  g.fill();
  // Ears.
  for (const [ex, ey, r] of [[9, -38, 7.5], [19, -39, 6.5]] as const) {
    g.fillStyle = '#4a4550';
    g.beginPath();
    g.arc(ex, ey, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2a7b5';
    g.beginPath();
    g.arc(ex, ey, r - 2.6, 0, Math.PI * 2);
    g.fill();
  }
  // Eye (beady red), nose, whiskers, teeth.
  g.fillStyle = '#ff3b3b';
  g.beginPath();
  g.arc(21, -29, 2.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.fillRect(21.5, -30.5, 1.2, 1.2);
  g.fillStyle = '#ff9fb0';
  g.beginPath();
  g.arc(34, -23, 2.6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(30, -22);
  g.lineTo(42, -26 + wig);
  g.moveTo(30, -21);
  g.lineTo(42, -19 - wig);
  g.stroke();
  g.fillStyle = '#fffbe6';
  g.fillRect(27, -18, 3, bit ? 6 : 4);
  g.fillRect(30.5, -18, 3, bit ? 6 : 4);
}

/** The 🥖 bread bag: a paper bag, a baguette poking out. */
function drawBread(g: CanvasRenderingContext2D): void {
  g.save();
  g.rotate(-0.5);
  g.fillStyle = '#e1a95f';
  g.beginPath();
  g.roundRect(-5, -66, 12, 44, 6);
  g.fill();
  g.strokeStyle = '#a8692b';
  g.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.moveTo(-3, -58 + k * 10);
    g.lineTo(5, -62 + k * 10);
    g.stroke();
  }
  g.restore();
  g.fillStyle = '#c99b63';
  g.beginPath();
  g.moveTo(-19, 0);
  g.lineTo(-17, -40);
  for (let k = 0; k < 6; k++) g.lineTo(-17 + k * 6.8 + 3.4, k % 2 ? -40 : -44);
  g.lineTo(17, -40);
  g.lineTo(19, 0);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,.12)';
  g.fillRect(-19, -14, 38, 3);
  g.fillStyle = '#7a4f24';
  g.font = '900 11px "Lilita One", "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BREAD', 0, -24);
}

/** The building, the sky and everything that doesn't move. */
function drawScene(g: CanvasRenderingContext2D): void {
  const rnd = pigeonRng(42);
  const sky = g.createLinearGradient(0, 0, 0, 110);
  sky.addColorStop(0, '#2b3a67');
  sky.addColorStop(0.6, '#ff8a5b');
  sky.addColorStop(1, '#ffc078');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, 110);
  // A skyline behind, with a water tower.
  g.fillStyle = '#4b3a5a';
  let x = 0;
  while (x < W) {
    const w = 22 + rnd() * 30, h = 18 + rnd() * 34;
    g.fillRect(x, 96 - h, w, h + 4);
    x += w;
  }
  g.fillStyle = '#3c2e49';
  g.fillRect(268, 44, 30, 26);
  g.beginPath();
  g.moveTo(264, 46);
  g.lineTo(283, 32);
  g.lineTo(302, 46);
  g.fill();
  g.fillRect(272, 70, 3, 22);
  g.fillRect(291, 70, 3, 22);
  // Brick face.
  g.fillStyle = '#9c4a35';
  g.fillRect(0, 96, W, 270);
  for (let y = 100; y < 366; y += 9) {
    const off = ((y - 100) / 9) % 2 ? 0 : 11;
    for (let bx = -off; bx < W; bx += 22) {
      const v = rnd();
      g.fillStyle = v < 0.33 ? '#a9543d' : v < 0.66 ? '#93432f' : '#a24d38';
      g.fillRect(bx + 1, y, 20, 7);
    }
  }
  // Cornice.
  g.fillStyle = '#5d3a2e';
  g.fillRect(0, 92, W, 12);
  g.fillStyle = '#734a3b';
  for (let k = 0; k < W; k += 16) g.fillRect(k + 2, 104, 10, 6);
  // Windows (top row) and the AC row's windows.
  for (const s of SPOTS) {
    if (s.kind === 'can') continue;
    const top = s.kind === 'window' ? 110 : 228;
    const bot = s.kind === 'window' ? s.y : 330;
    g.fillStyle = '#e8dcc6';
    g.fillRect(s.x - 41, top - 8, 82, 8); // lintel
    g.fillStyle = '#3e2a22';
    g.fillRect(s.x - 38, top - 2, 76, bot - top + 4);
    const inside = g.createLinearGradient(0, top, 0, bot);
    inside.addColorStop(0, '#ffe2a1');
    inside.addColorStop(1, '#e09f52');
    g.fillStyle = inside;
    g.fillRect(s.x - 35, top, 70, bot - top);
    // A curtain each side.
    g.fillStyle = 'rgba(214,72,90,.85)';
    g.fillRect(s.x - 35, top, 10, bot - top);
    g.fillRect(s.x + 25, top, 10, bot - top);
    g.fillStyle = 'rgba(0,0,0,.14)';
    g.fillRect(s.x - 35, top, 70, 6);
  }
  // Stoop shadow and sidewalk.
  g.fillStyle = '#5d3a2e';
  g.fillRect(0, 360, W, 8);
  const walk = g.createLinearGradient(0, 368, 0, H);
  walk.addColorStop(0, '#9aa0a6');
  walk.addColorStop(1, '#7c8288');
  g.fillStyle = walk;
  g.fillRect(0, 368, W, H - 368);
  g.strokeStyle = 'rgba(0,0,0,.15)';
  g.lineWidth = 1;
  for (let k = 0; k < W; k += 60) {
    g.beginPath();
    g.moveTo(k, 368);
    g.lineTo(k - 20, H);
    g.stroke();
  }
  g.fillStyle = '#5f646a';
  g.fillRect(0, 462, W, 18); // the curb
  g.fillStyle = '#c9ccd0';
  g.fillRect(0, 460, W, 3);
}

/** What's in front of each spot (flower box, AC unit, can body): drawn over whatever's popping out. */
function drawFronts(g: CanvasRenderingContext2D): void {
  for (const s of SPOTS) {
    if (s.kind === 'window') {
      g.fillStyle = '#e8dcc6';
      g.fillRect(s.x - 44, s.y, 88, 6); // the sill
      g.fillStyle = '#6b8f3a';
      g.fillRect(s.x - 38, s.y + 6, 76, 16);
      g.fillStyle = '#557a2a';
      g.fillRect(s.x - 38, s.y + 18, 76, 4);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = ['#ff5d8f', '#ffd23f', '#ffffff'][k % 3];
        g.beginPath();
        g.arc(s.x - 30 + k * 12, s.y + 2, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    } else if (s.kind === 'ac') {
      g.fillStyle = '#c8ccd2';
      g.fillRect(s.x - 33, s.y, 66, 38);
      g.fillStyle = '#e8ebef';
      g.fillRect(s.x - 33, s.y, 66, 5);
      g.strokeStyle = '#9399a1';
      g.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.moveTo(s.x - 26, s.y + 11 + k * 4.4);
        g.lineTo(s.x + 6, s.y + 11 + k * 4.4);
        g.stroke();
      }
      g.fillStyle = '#7b8189';
      g.beginPath();
      g.arc(s.x + 19, s.y + 21, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5e646b';
      g.fillRect(s.x - 30, s.y + 38, 4, 6);
      g.fillRect(s.x + 26, s.y + 38, 4, 6);
    } else {
      // The trash can (the lid is drawn live).
      const cg = g.createLinearGradient(s.x - 28, 0, s.x + 28, 0);
      cg.addColorStop(0, '#4f5a63');
      cg.addColorStop(0.45, '#8f9ba5');
      cg.addColorStop(1, '#4a545c');
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(s.x - 29, s.y);
      g.lineTo(s.x + 29, s.y);
      g.lineTo(s.x + 24, s.y + 50);
      g.lineTo(s.x - 24, s.y + 50);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.25)';
      g.lineWidth = 2;
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.moveTo(s.x + k * 10, s.y + 6);
        g.lineTo(s.x + k * 8.5, s.y + 46);
        g.stroke();
      }
      g.fillStyle = '#3c454d';
      g.fillRect(s.x - 31, s.y - 2, 62, 6); // the rim
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.ellipse(s.x, s.y + 52, 30, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// ---------------------------------------------------------------- sounds

const coo = () => {
  note(330, 0, 0.12, 'sine', 0.08, 'sfx');
  note(262, 0.1, 0.16, 'sine', 0.07, 'sfx');
};
const flap = () => {
  for (let k = 0; k < 3; k++) hiss(k * 0.055, 0.05, { type: 'bandpass', freq: 900 + k * 200, q: 1.4, gain: 0.12, out: 'sfx' });
};
const squeak = (loud = false) => {
  note(2300, 0, 0.06, 'square', loud ? 0.03 : 0.012, 'sfx');
  note(2900, 0.07, 0.05, 'square', loud ? 0.03 : 0.012, 'sfx');
};
const crinkle = () => {
  for (let k = 0; k < 5; k++) hiss(k * 0.03, 0.04, { type: 'highpass', freq: 3500 + k * 400, gain: 0.1, out: 'sfx' });
};
const shimmer = () => [1568, 2093, 2637].forEach((f, i) => note(f, i * 0.05, 0.18, 'sine', 0.025, 'sfx'));
const whiffSnd = () => hiss(0, 0.06, { type: 'lowpass', freq: 400, gain: 0.12, brown: true, out: 'sfx' });

// ---------------------------------------------------------------- the game

/** Ease out with a little overshoot (the pop). */
const backOut = (x: number): number => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

interface Fly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  gold: boolean;
  t: number;
}

export const pigeons: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const length = secs(PIGEON_ROUND);
  const round = new PigeonRound(Math.floor(Math.random() * 2 ** 31), length);
  const scene = prerender(W, H, drawScene);
  const fronts = prerender(W, H, drawFronts);
  const face: number[] = SPOTS.map((_, i) => (i % 2 ? -1 : 1));
  const flies: Fly[] = [];
  let raf = 0, over = false;
  let intro = 1.1; // READY… GO!
  let clock = 0;
  let shownScore = 0;
  let ended = false;
  let goSaid = false;

  // ------------------------------------------------------------ input
  const tapAt = (x: number, y: number) => {
    if (ended || intro > 0) return;
    // The nearest spot whose hit circle the tap is in (live ones first).
    let best = -1, bd = Infinity;
    for (let i = 0; i < SPOTS.length; i++) {
      const s = SPOTS[i];
      const d = Math.hypot(x - s.x, y - (s.y - 28));
      if (d > HIT_R) continue;
      const score = d - (round.live(i) ? 1000 : 0);
      if (score < bd) (bd = score), (best = i);
    }
    if (best < 0) return; // the sky or the curb: nothing happens
    const ev = round.tap(best);
    if (ev?.type === 'whiff') {
      whiffSnd();
      if (ev.lostCombo >= 3) fx.pop(x, y - 10, 'whiff', '#d0d4da', 16);
    }
  };
  const offP = pointers(cv, { down: (t) => tapAt(t.x, t.y) });
  const offK = keys((k) => {
    const i = KEYMAP[k.toLowerCase()];
    if (i === undefined) return;
    tapAt(SPOTS[i].x, SPOTS[i].y - 28);
  });

  // ------------------------------------------------------------ events → juice
  const head = (i: number) => ({ x: SPOTS[i].x, y: SPOTS[i].y - 30 });
  const react = (ev: PigeonEvent) => {
    switch (ev.type) {
      case 'spawn':
        face[ev.spot] = Math.random() < 0.5 ? -1 : 1;
        if (ev.kind === 'golden') shimmer();
        else if (ev.kind === 'rat') squeak();
        else if (ev.kind === 'bread') crinkle();
        break;
      case 'hit': {
        const p = head(ev.spot);
        flies.push({ x: SPOTS[ev.spot].x, y: SPOTS[ev.spot].y, vx: face[ev.spot] * (60 + Math.random() * 60), vy: -260, face: face[ev.spot], gold: ev.kind === 'golden', t: 0 });
        fx.burst(p.x, p.y, { emoji: '🪶', n: REDUCED ? 3 : ev.kind === 'golden' ? 10 : 5, size: 14, speed: 150, gravity: 140, life: 0.9 });
        fx.burst(p.x, p.y, { colors: ev.kind === 'golden' ? ['#ffd23f', '#fff3b0', '#fff'] : ['#c9ced6', '#fff', '#8e96a3'], n: REDUCED ? 6 : 12, size: 4, speed: 200 });
        const col = ev.kind === 'golden' ? '#ffd23f' : ev.mult >= 4 ? '#ff4fa3' : ev.mult >= 2 ? '#7bd88f' : '#fff';
        fx.pop(p.x, p.y - 18, `+${ev.pts}`, col, ev.kind === 'golden' ? 30 : 20 + Math.min(8, ev.mult * 2));
        if (ev.quick) fx.pop(p.x, p.y + 8, 'QUICK!', '#36c5f0', 13);
        if (ev.kind === 'golden') {
          fx.stamp('🕊️ FRENZY ×2', '#ffd23f', 1);
          if (!REDUCED) fx.flash('#ffd23f', 0.25);
          fx.shake(8, 0.25);
          fx.stop(0.06);
          sfx.jackpot();
          buzz([20, 30, 20]);
        } else {
          // Each hit in a chain rings a step higher.
          const step = Math.min(ev.combo - 1, 12);
          note(523 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21][step] / 12), 0, 0.12, 'triangle', 0.07, 'sfx');
          if (!ev.bread) flap();
          if (ev.combo === 5 || ev.combo === 10 || ev.combo === 15) fx.stamp(`COMBO ×${ev.mult}`, '#7bd88f', 0.7);
          else if (ev.combo > 15 && ev.combo % 10 === 0) fx.stamp(`${ev.combo} IN A ROW!`, '#ff4fa3', 0.7);
        }
        break;
      }
      case 'bread': {
        const p = head(ev.spot);
        fx.burst(p.x, p.y, { emoji: ['🍞', '🥖'], n: REDUCED ? 5 : 12, size: 16, speed: 220, up: true });
        fx.stamp(ev.popped.length ? `🥖 BREAD! ×${ev.popped.length}` : '🥖 BREAD!', '#ffd166', 0.9);
        if (!REDUCED) fx.flash('#ffd166', 0.15);
        fx.shake(6, 0.2);
        crinkle();
        sfx.cheer();
        coo();
        break;
      }
      case 'rat': {
        const p = head(ev.spot);
        fx.pop(p.x, p.y - 16, ev.pts ? `${ev.pts} 🐀` : '🐀!', '#ff4d5e', 26);
        if (ev.lostCombo >= 3) fx.pop(p.x, p.y + 10, 'combo lost', '#ffb3bb', 14);
        fx.stamp('NOT THE RAT!', '#ff4d5e', 0.8);
        fx.shake(12, 0.35);
        if (!REDUCED) fx.flash('#e0283f', 0.22);
        squeak(true);
        sfx.bad();
        break;
      }
      case 'frenzy':
        if (!ev.on) fx.pop(W / 2, 120, 'frenzy over', '#fff3b0', 16);
        break;
      case 'rush':
        fx.stamp('🚕 RUSH HOUR!', '#ff6a00', 1);
        sfx.honk();
        break;
      case 'end': {
        ended = true;
        const st = round.stats;
        fx.stamp(round.score >= 3600 ? 'PIGEON PRO!' : round.score >= 2000 ? 'NICE POPPING!' : 'TIME!', '#ffd23f', 1.6);
        if (round.score >= 2000) (sfx.cheer(), fx.burst(W / 2, 160, { emoji: ['🐦', '🪶', '🎟️'], n: REDUCED ? 8 : 18, size: 18, speed: 240 }));
        else sfx.done();
        fx.pop(W / 2, 240, `${st.pigeons + st.golden} popped · best combo ${round.bestCombo}`, '#fff', 16);
        fin.end(round.score, 1800);
        break;
      }
      default:
        break;
    }
  };

  // ------------------------------------------------------------ draw one spot
  const drawThing = (i: number, now: number) => {
    const s = round.spots[i];
    const geo = SPOTS[i];
    if (s.kind === null) return;
    const t = round.t;
    // Pop up fast (with a little overshoot), duck at the end. Hit ones are drawn as flyers.
    if (s.hitAt >= 0 && s.kind !== 'rat') return;
    const rise = clamp((t - s.up) / 0.12, 0, 1);
    const sink = s.hitAt >= 0 ? clamp(1 - (t - s.hitAt) / 0.3, 0, 1) : clamp((s.until + 0.12 - t) / 0.16, 0, 1);
    const k = Math.min(REDUCED ? rise : backOut(rise), sink);
    const yy = geo.y + (1 - k) * RISE;
    g.save();
    g.beginPath();
    g.rect(geo.clip.x, geo.clip.y, geo.clip.w, geo.clip.h);
    g.clip();
    const f = face[i];
    const bob = REDUCED ? 0 : Math.sin(now / 90 + i) * 1.6;
    if (s.kind === 'golden') {
      g.save();
      g.globalAlpha = 0.55 + 0.25 * Math.sin(now / 90);
      const gl = g.createRadialGradient(geo.x, yy - 26, 4, geo.x, yy - 26, 44);
      gl.addColorStop(0, 'rgba(255,240,150,.95)');
      gl.addColorStop(1, 'rgba(255,210,63,0)');
      g.fillStyle = gl;
      g.fillRect(geo.x - 50, yy - 76, 100, 100);
      g.restore();
    }
    if (s.kind === 'bread') {
      const pul = REDUCED ? 0.5 : 0.5 + 0.5 * Math.sin(now / 110);
      g.strokeStyle = `rgba(255,209,102,${0.5 + pul * 0.5})`;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(geo.x, yy - 26, 30 + pul * 4, 0, Math.PI * 2);
      g.stroke();
    }
    g.translate(geo.x, yy);
    if (s.kind === 'pigeon' || s.kind === 'golden') {
      g.scale(f, 1);
      const blink = Math.floor(now / 140 + i * 7) % 23 === 0;
      drawPigeon(g, s.kind === 'golden' ? GOLD : GREY, bob, blink);
    } else if (s.kind === 'rat') {
      const bit = s.hitAt >= 0;
      const jig = bit ? Math.sin(now / 25) * 3 : REDUCED ? 0 : Math.sin(now / 45) * 1.5;
      g.translate(jig, 0);
      g.scale(f, 1);
      drawRat(g, REDUCED ? 0 : Math.sin(now / 70), bit);
    } else drawBread(g);
    g.restore();
    // Golden sparkles poke out past the frame.
    if (s.kind === 'golden' && !REDUCED) {
      for (let k2 = 0; k2 < 3; k2++) {
        const a = now / 400 + (k2 * Math.PI * 2) / 3;
        star(g, geo.x + Math.cos(a) * 34, yy - 30 + Math.sin(a) * 26, 4 + Math.sin(now / 80 + k2) * 1.5);
      }
    }
  };

  const star = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    c.fillStyle = '#fff6c2';
    c.beginPath();
    c.moveTo(x, y - r * 2);
    c.lineTo(x + r * 0.5, y - r * 0.5);
    c.lineTo(x + r * 2, y);
    c.lineTo(x + r * 0.5, y + r * 0.5);
    c.lineTo(x, y + r * 2);
    c.lineTo(x - r * 0.5, y + r * 0.5);
    c.lineTo(x - r * 2, y);
    c.lineTo(x - r * 0.5, y - r * 0.5);
    c.closePath();
    c.fill();
  };

  /** Trash-can lids flip open while something's in there. */
  const drawLids = () => {
    for (let i = 6; i < 9; i++) {
      const s = round.spots[i];
      const geo = SPOTS[i];
      const open = s.kind !== null ? clamp((round.t - s.up) / 0.1, 0, 1) * clamp((s.until + 0.25 - round.t) / 0.15, 0, 1) : 0;
      const openK = s.kind !== null && s.hitAt >= 0 ? 1 : open;
      g.save();
      g.translate(geo.x + 30, geo.y - 2);
      g.rotate(-openK * 1.9);
      g.fillStyle = '#56616a';
      g.beginPath();
      g.moveTo(-62, 0);
      g.quadraticCurveTo(-31, -16, 0, 0);
      g.closePath();
      g.fill();
      g.fillStyle = '#3c454d';
      g.fillRect(-62, -2, 62, 4);
      g.fillRect(-36, -14, 10, 5);
      g.restore();
    }
  };

  const drawFlies = (dt: number) => {
    for (let i = flies.length - 1; i >= 0; i--) {
      const p = flies[i];
      p.t += dt;
      p.vy += 160 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.t > 0.8 || p.y < -60) {
        flies.splice(i, 1);
        continue;
      }
      // A squash on the hit, then it flaps away, shrinking.
      const squash = p.t < 0.07 ? 1 - p.t / 0.07 : 0;
      const sc = 1 - p.t * 0.6;
      g.save();
      g.globalAlpha = clamp(1.2 - p.t * 1.5, 0, 1);
      g.translate(p.x, p.y);
      g.scale(p.face * sc * (1 + squash * 0.3), sc * (1 - squash * 0.3));
      drawPigeon(g, p.gold ? GOLD : GREY, 0, true, REDUCED ? 0.6 : Math.abs(Math.sin(p.t * 30)));
      g.restore();
    }
  };

  // ------------------------------------------------------------ loop
  const loop = () => {
    if (over) return;
    const dt = fx.begin(g);
    const now = performance.now();
    clock += dt;
    if (intro > 0) {
      intro -= dt;
      if (intro <= 0.35 && !goSaid) {
        goSaid = true;
        fx.stamp('GO!', '#7bd88f', 0.6);
        sfx.good();
      }
    } else if (!fx.frozen) {
      round.update(dt);
      for (const ev of round.events) react(ev);
      round.events.length = 0;
    }
    const frenzy = round.frenzy;
    g.drawImage(scene, 0, 0);
    // Frenzy: the windows glow gold.
    if (frenzy) {
      g.save();
      g.globalAlpha = 0.2 + (REDUCED ? 0 : 0.1 * Math.sin(now / 80));
      g.fillStyle = '#ffd23f';
      g.fillRect(0, 96, W, 270);
      g.restore();
    } else if (round.rush) {
      g.fillStyle = 'rgba(255,90,40,.10)';
      g.fillRect(0, 0, W, H);
    }
    // Clouds drift by (still for reduced motion).
    g.fillStyle = 'rgba(255,255,255,.35)';
    for (let k = 0; k < 3; k++) {
      const cx = (((REDUCED ? 0 : clock * 8) + k * 140) % (W + 120)) - 60;
      g.beginPath();
      g.ellipse(cx, 30 + k * 14, 28, 7, 0, 0, Math.PI * 2);
      g.ellipse(cx + 20, 27 + k * 14, 18, 7, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < SPOTS.length; i++) drawThing(i, now);
    g.drawImage(fronts, 0, 0);
    drawLids();
    drawFlies(dt);
    // ---- the top strip: time, combo, score
    const left = intro > 0 ? length : round.left;
    const urgent = left <= 10;
    g.fillStyle = 'rgba(15,18,35,.55)';
    g.beginPath();
    g.roundRect(8, 8, 74, 30, 15);
    g.fill();
    label(g, `⏱ ${Math.ceil(left)}`, 45, 24, 18, urgent ? (Math.floor(now / 250) % 2 ? '#ff6a6a' : '#fff') : '#fff');
    shownScore += (round.score - shownScore) * Math.min(1, dt * 12);
    label(g, num(Math.abs(round.score - shownScore) < 1 ? round.score : shownScore), W - 12, 24, 24, '#ffd23f', 'right');
    if (round.combo >= 2) {
      const m = round.mult * (frenzy ? 2 : 1);
      label(g, `${round.combo} combo${m > 1 ? ` ×${m}` : ''}`, W / 2, 20, 17, m >= 4 ? '#ff4fa3' : '#7bd88f');
      bar(g, W / 2 - 50, 32, 100, round.comboLeft(), m >= 4 ? '#ff4fa3' : '#7bd88f');
    } else if (frenzy) {
      label(g, 'FRENZY ×2', W / 2, 20, 17, '#ffd23f');
    }
    if (frenzy) bar(g, W / 2 - 50, 42, 100, (round.frenzyUntil - round.t) / PIGEON_FRENZY, '#ffd23f');
    if (intro > 0.35) label(g, 'READY…', W / 2, H * 0.32, 34, '#fff');
    fx.end(g);
    hud(`🐦 ${num(round.score)} · ⏱ ${Math.ceil(left)}s${round.combo >= 5 ? ` · 🔥×${round.mult * (frenzy ? 2 : 1)}` : ''}`);
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
