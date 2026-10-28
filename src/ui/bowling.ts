// =====================================================================
// bowling.ts (ui) — 🎳 a lane you bowl on: ten frames, solo or against
// a friend. The rules, scoring, pin physics and the computer bowler are
// sim/bowling.ts; this file draws the lane (from behind the bowler, in
// perspective, the camera riding down with the ball) and handles touch.
//
// Controls (touch first; keys work too):
//   • Drag the ball left/right to line up.
//   • Swipe up to bowl: the swipe's direction aims, its speed is the
//     ball speed, and curving the end of the swipe hooks the ball.
//   • ← → move, Space / ↑ bowls a straight ball.
// A game costs $8 with shoes (sim/casino.ts stake: in-game money only).
//
// openBowling(host, { opponent?: { name, skill 0..1 } })
// =====================================================================

import './bowling.css';
import { esc, money } from '../core/format.ts';
import {
  BALL_R, BOWLING_COST, FRAMES, LANE, RACK, SPEED, bowlingBest, clearDeadwood, finishBowling, frameMarks, gameOver, gameScore, isSplit, mph, newLane, newRack,
  nextBall, npcThrow, release, scoreFrames, settle, settled, splitFrames, standing, stepLane, strikeRun, tally, type Lane, type Pin, type Throw,
} from '../sim/bowling.ts';
import { stake } from '../sim/casino.ts';
import { fetchBoard, postScore } from '../net/scores.ts';
import { burst as noiseBurst, drum, sfx } from './audio.ts';
import { rain, type CasinoHost } from './casino.ts';
import { openModal, toast } from './dom.ts';
import { DISPLAY, label, shinyBall } from './arcade/kit.ts';
import { Fx, buzz } from './juice.ts';
import { boardHtml } from './scoreboard.ts';

export interface BowlingOpts {
  /** Bowl against a friend (or a regular): they take their frames in turn. */
  opponent?: { name: string; skill: number };
}

/** Logical canvas size (portrait); it renders at device pixel ratio. */
const W = 360, H = 540;
const TAU = Math.PI * 2;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const ease = (k: number): number => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

/** If nobody was named: one of the lane's regulars. */
const REGULAR = { name: 'Big Steve', skill: 0.5 };
let lastMode: 'solo' | 'vs' | null = null;

// ---- camera ------------------------------------------------------------
// Behind and above the bowler, a long lens (so the far pins aren't specks).
// camZ dollies down the lane with the ball, and the camera drops lower
// as it nears the pins for the crash.
const F = 2410, HC = 71, HC_LOW = 44, D0 = 400, HY = 40, CX = W / 2;
const AIM_Z = -14;
const CAM_MAX = 560;

interface P2 { x: number; y: number; s: number }

// The pin's outline: [inches up the pin, radius].
const PROFILE: [number, number][] = [[0, 1.0], [1.5, 1.6], [3, 2.15], [4.5, 2.39], [6, 2.25], [7.5, 1.8], [9, 1.22], [10, 0.92], [11, 0.95], [12, 1.15], [12.8, 1.25], [13.8, 1.15], [14.5, 0.82], [15, 0.2]];

interface Player {
  name: string;
  you: boolean;
  skill: number;
  rolls: number[];
  /** Ball colours: base, highlight. */
  ball: [string, string];
}

type Phase = 'intro' | 'count' | 'wait' | 'setter' | 'aim' | 'npc' | 'roll' | 'over';

interface Setter {
  kind: 'set' | 'sweep' | 'reset';
  t: number;
  dur: number;
  done: () => void;
  swept: boolean;
  racked: boolean;
}

export function openBowling(host: CasinoHost, opts: BowlingOpts = {}): void {
  const s = host.state;
  const foe = opts.opponent ? { name: opts.opponent.name || 'Your friend', skill: clamp(Number(opts.opponent.skill) || 0, 0, 1) } : REGULAR;
  let mode: 'solo' | 'vs' = opts.opponent ? 'vs' : lastMode ?? 'solo';

  const m = openModal(`<div class="bw">
    <div class="bw-top"><b><span aria-hidden="true">🎳</span> Bowling</b><span class="bw-hud" aria-live="off"></span><button class="bw-x" data-close aria-label="Leave the lane">✕</button></div>
    <div class="bw-sheet" role="table" aria-label="Score sheet"></div>
    <div class="bw-screen"><canvas aria-label="Bowling lane. Drag to line up, swipe up to bowl."></canvas>
      <div class="bw-over"></div>
      <div class="bw-count" aria-live="assertive" hidden></div>
    </div>
  </div>`);
  m.el.classList.add('bw-modal');
  m.el.parentElement?.classList.add('bw-wrap');
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => m.el.querySelector<T>(sel)!;
  const cv = q<HTMLCanvasElement>('canvas');
  const g = cv.getContext('2d')!;
  const screen = q('.bw-screen');
  const over = q('.bw-over');
  const count = q('.bw-count');
  const hudEl = q('.bw-hud');
  const sheetEl = q('.bw-sheet');

  // ---------------------------------------------------------- state
  let players: Player[] = [];
  let turn = 0;
  let phase: Phase = 'intro';
  let pins: Pin[] = newRack();
  let lane: Lane = newLane(pins);
  let camZ = 0;
  let aimX = 0, ballShownX = 0, yourX = 0;
  let rollIn = 0; // 0..1: the next ball rolling in from the return
  let setter: Setter | null = null;
  let lift = 0; // standing pins lifted by the pinsetter (inches)
  let sweepZ = 704, sweepH = 44;
  let fx = new Fx(W, H);
  let raf = 0, live = true, last = performance.now();
  let timers: number[] = [];
  let ballNo: { frame: number; ball: number; fresh: boolean; standing: number } = { frame: 0, ball: 0, fresh: true, standing: 10 };
  let standingBefore = 10;
  let hitDone = false, pinSounds = 0, lastPinSound = 0, slow = 1, restT = 0;
  let throwInfo: { mph: number; hook: number; t: number } | null = null;
  let throwsByYou = 0;
  let npcPlan: { th: Throw; t: number } | null = null;
  let sheetMarks = 0;
  const trail: { x: number; y: number; t: number }[] = [];

  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => live && fn(), ms));
  const cur = () => players[turn];

  // ---------------------------------------------------------- layout
  let dpr = 1;
  const fit = () => {
    cv.style.width = '10px';
    cv.style.height = '15px';
    const overhead = m.el.offsetHeight - screen.offsetHeight;
    const availH = Math.max(300, window.innerHeight - 26 - overhead);
    const availW = Math.max(200, m.el.clientWidth - 24);
    const w = Math.floor(Math.min(availW, (availH * W) / H));
    const h = Math.round((w * H) / W);
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    screen.style.width = `${w + 8}px`;
  };
  const toCanvas = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  // ---------------------------------------------------------- the score sheet
  const sheet = () => {
    const rows = players.map((p, pi) => {
      const frames = splitFrames(p.rolls);
      const cum = scoreFrames(p.rolls);
      const nb = gameOver(p.rolls) ? null : nextBall(p.rolls);
      const cells = Array.from({ length: FRAMES }, (_, f) => {
        const fr = frames[f] ?? [];
        const marks = frameMarks(fr, f === FRAMES - 1);
        let boxes: string[];
        if (f < FRAMES - 1) boxes = marks[0] === 'X' ? ['', 'X'] : [marks[0] ?? '', marks[1] ?? ''];
        else boxes = [marks[0] ?? '', marks[1] ?? '', marks[2] ?? ''];
        const on = pi === turn && phase !== 'over' && phase !== 'intro' && nb?.frame === f;
        return `<div class="bw-f${f === FRAMES - 1 ? ' t' : ''}${on ? ' on' : ''}" role="cell"><div class="bw-b">${boxes.map((b) => `<i class="${b === 'X' ? 'x' : b === '/' ? 'sp' : ''}">${b}</i>`).join('')}</div><b>${cum[f] ?? ''}</b></div>`;
      }).join('');
      return `<div class="bw-row${pi === turn && phase !== 'over' ? ' on' : ''}${p.you ? ' you' : ''}" role="row">${cells}<div class="bw-tot" role="cell"><small>${esc(p.name)}</small><b>${gameScore(p.rolls)}</b></div></div>`;
    });
    sheetEl.innerHTML = rows.join('') || '<div class="bw-row ghost"></div>';
    // The newest mark pops in.
    const n = players.reduce((a, p) => a + p.rolls.length, 0);
    if (n > sheetMarks) {
      const row = sheetEl.querySelectorAll('.bw-row')[turn];
      const filled = row ? [...row.querySelectorAll<HTMLElement>('.bw-b i')].filter((i) => i.textContent) : [];
      filled[filled.length - 1]?.classList.add('new');
    }
    sheetMarks = n;
  };

  const hud = () => {
    if (screen.dataset.phase !== phase) screen.dataset.phase = phase; // QA hook
    const p = cur();
    if (!p || phase === 'over' || phase === 'intro') return void (hudEl.textContent = '');
    const nb = gameOver(p.rolls) ? ballNo : nextBall(p.rolls);
    const who = players.length > 1 ? (p.you ? 'You · ' : `${p.name} · `) : '';
    const t = `${who}Frame ${nb.frame + 1} · Ball ${nb.ball + 1}`;
    if (hudEl.textContent !== t) hudEl.textContent = t;
  };

  // ---------------------------------------------------------- projection
  let hc = HC;
  const proj = (x: number, z: number, h: number): P2 => {
    const depth = Math.max(20, z - camZ + D0);
    const k = F / depth;
    return { x: CX + x * k, y: HY + (hc - h) * k, s: k };
  };
  /** The nearest lane distance still on screen (nothing nearer is drawn). */
  const zNear = () => camZ - D0 + (hc * F) / (H + 60 - HY);
  const quad = (x0: number, z0: number, x1: number, z1: number, h = 0) => {
    const a = proj(x0, z0, h), b = proj(x1, z0, h), c = proj(x1, z1, h), d = proj(x0, z1, h);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.lineTo(c.x, c.y);
    g.lineTo(d.x, d.y);
    g.closePath();
  };
  /** A vertical wall across the lane at z (x0..x1, h0..h1). */
  const wallZ = (x0: number, x1: number, z: number, h0: number, h1: number) => {
    const a = proj(x0, z, h0), b = proj(x1, z, h0), c = proj(x1, z, h1), d = proj(x0, z, h1);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.lineTo(c.x, c.y);
    g.lineTo(d.x, d.y);
    g.closePath();
  };
  /** A vertical wall along the lane at x (z0..z1, h0..h1). */
  const wallX = (x: number, z0: number, z1: number, h0: number, h1: number) => {
    const a = proj(x, z0, h0), b = proj(x, z1, h0), c = proj(x, z1, h1), d = proj(x, z0, h1);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.lineTo(c.x, c.y);
    g.lineTo(d.x, d.y);
    g.closePath();
  };

  // ---------------------------------------------------------- drawing: the room
  const drawRoom = (now: number) => {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0820');
    bg.addColorStop(0.35, '#1b1240');
    bg.addColorStop(1, '#120c26');
    g.fillStyle = bg;
    g.fillRect(-10, -10, W + 20, H + 20);
    // Back wall above the pinsetters: a neon strip and a skyline mural.
    const wall = proj(0, 800, 0);
    const top = proj(0, 800, 140).y;
    g.fillStyle = '#160f33';
    g.fillRect(-10, top, W + 20, wall.y - top);
    const k = wall.s;
    g.fillStyle = '#21184a';
    let x = -260;
    let seed = 11;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    while (x < 260) {
      const bw = 12 + rnd() * 22, bh = 20 + rnd() * 50;
      const a = proj(x, 800, 70), b = proj(x + bw, 800, 70 + bh);
      g.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
      x += bw + 3;
    }
    // Neon line (it breathes).
    const glow = 0.65 + 0.35 * Math.sin(now / 900);
    g.globalAlpha = glow;
    g.fillStyle = '#ff4fa3';
    const n1 = proj(0, 800, 72);
    g.fillRect(-10, n1.y - 1.5 * k * 0.5, W + 20, Math.max(1.5, 1.6 * k));
    g.globalAlpha = 1;
    // The floor around the lanes.
    g.fillStyle = '#1a1330';
    quad(-260, zNear(), 260, 800);
    g.fill();
  };

  /** One lane (ours or a neighbour's), boards and gutters. */
  const drawLaneBed = (cx: number, mine: boolean) => {
    const z0 = Math.max(-120, zNear()), z1 = LANE.deck;
    // Caps and gutters.
    g.fillStyle = mine ? '#2b2440' : '#221c36';
    quad(cx - LANE.kick - 4, z0, cx + LANE.kick + 4, z1);
    g.fill();
    for (const side of [-1, 1]) {
      const a = cx + side * LANE.half, b = cx + side * (LANE.half + LANE.gutter);
      const p0 = proj(a, z0, 0), p1 = proj(b, z0, 0);
      const gr = g.createLinearGradient(p0.x, 0, p1.x, 0);
      gr.addColorStop(0, '#0e0b17');
      gr.addColorStop(0.5, mine ? '#4a4560' : '#2e2a40');
      gr.addColorStop(1, '#16121f');
      g.fillStyle = gr;
      quad(Math.min(a, b), z0, Math.max(a, b), z1);
      g.fill();
    }
    // The wood.
    const near = proj(cx, z0, 0), far = proj(cx, z1, 0);
    const wood = g.createLinearGradient(0, far.y, 0, near.y);
    wood.addColorStop(0, mine ? '#c9925a' : '#7a5a3f');
    wood.addColorStop(0.55, mine ? '#e2b47a' : '#8d6a4a');
    wood.addColorStop(1, mine ? '#f0c88f' : '#9a7656');
    g.fillStyle = wood;
    quad(cx - LANE.half, z0, cx + LANE.half, z1);
    g.fill();
    if (!mine) {
      g.fillStyle = 'rgba(12,8,24,.45)';
      quad(cx - LANE.half, z0, cx + LANE.half, z1);
      g.fill();
      return;
    }
    // Boards: every other one a shade darker, then the seams.
    const bd = LANE.board;
    g.fillStyle = 'rgba(120,70,20,.10)';
    for (let i = 0; i < 39; i += 2) {
      quad(cx - LANE.half + i * bd, z0, cx - LANE.half + (i + 1) * bd, z1);
      g.fill();
    }
    g.strokeStyle = 'rgba(90,50,15,.22)';
    g.lineWidth = 0.6;
    g.beginPath();
    for (let i = 1; i < 39; i++) {
      const a = proj(cx - LANE.half + i * bd, z0, 0), b = proj(cx - LANE.half + i * bd, z1, 0);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.stroke();
    // The approach (lighter maple) and the foul line.
    if (z0 < 0) {
      g.fillStyle = 'rgba(255,240,215,.22)';
      quad(cx - LANE.half - LANE.gutter, z0, cx + LANE.half + LANE.gutter, 0);
      g.fill();
      g.fillStyle = '#2a1c33';
      quad(cx - LANE.half - LANE.gutter, -0.6, cx + LANE.half + LANE.gutter, 0.6);
      g.fill();
      // Approach dots.
      g.fillStyle = '#3b2412';
      for (let b = 5; b <= 35; b += 5) dot(cx + (20 - b) * bd, -26, 0.7);
    }
    // Guide dots at 7 ft, arrows at 12–16 ft.
    g.fillStyle = '#3b2412';
    for (const b of [3, 5, 8, 11, 14]) for (const sd of [-1, 1]) dot(cx + sd * (20 - b) * bd, 84, 0.55);
    for (let i = -3; i <= 3; i++) {
      const ax = cx + i * 5 * bd, az = 144 + (3 - Math.abs(i)) * 16;
      const tip = proj(ax, az + 9, 0), l = proj(ax - bd * 0.9, az - 4, 0), r = proj(ax + bd * 0.9, az - 4, 0);
      g.beginPath();
      g.moveTo(tip.x, tip.y);
      g.lineTo(r.x, r.y);
      g.lineTo(l.x, l.y);
      g.closePath();
      g.fill();
    }
    // Pin spots.
    g.fillStyle = 'rgba(60,30,10,.45)';
    for (const p of RACK) dot(cx + p.x, p.z, 0.9);
    // Gloss: the ceiling lights mirrored in the oil.
    for (const zz of [90, 260, 430, 600]) {
      if (zz < z0 + 10) continue;
      const c = proj(cx, zz, 0);
      const len = 70 * c.s, wid = 10 * c.s;
      const gl = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, len);
      gl.addColorStop(0, 'rgba(255,255,255,.28)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.save();
      g.translate(c.x, c.y);
      g.scale(wid / len, 0.5);
      g.translate(-c.x, -c.y);
      g.fillStyle = gl;
      g.beginPath();
      g.arc(c.x, c.y, len, 0, TAU);
      g.fill();
      g.restore();
    }
  };
  const dot = (x: number, z: number, r: number) => {
    const c = proj(x, z, 0);
    g.beginPath();
    g.ellipse(c.x, c.y, r * c.s, r * c.s * 0.45, 0, 0, TAU);
    g.fill();
  };

  const drawDeckEnd = () => {
    // The pit and its curtain.
    g.fillStyle = '#07050d';
    quad(-LANE.kick, LANE.deck, LANE.kick, 800);
    g.fill();
    g.fillStyle = '#0d0a1c';
    wallZ(-LANE.kick, LANE.kick, 800, 0, 44);
    g.fill();
    // Neighbours' pits.
    for (const cx of [-64, 64]) {
      g.fillStyle = '#07050d';
      quad(cx - LANE.kick, LANE.deck, cx + LANE.kick, 800);
      g.fill();
    }
  };

  const drawKickbacks = () => {
    for (const sd of [-1, 1]) {
      const x = sd * (LANE.kick + 1);
      g.fillStyle = '#231a3d';
      wallX(x, 690, 800, 0, 34);
      g.fill();
      g.fillStyle = sd < 0 ? '#36c5f0' : '#ff4fa3';
      wallX(x, 690, 800, 30, 34);
      g.fill();
    }
  };

  const drawMasking = (now: number) => {
    // The masking unit hangs in front of the pinsetters, across all three lanes.
    const z = 698;
    const a = proj(-200, z, 26), b = proj(200, z, 58);
    const gr = g.createLinearGradient(0, b.y, 0, a.y);
    gr.addColorStop(0, '#2a1f5c');
    gr.addColorStop(1, '#130d2e');
    g.fillStyle = gr;
    g.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
    g.fillStyle = '#ff4fa3';
    g.fillRect(a.x, a.y - Math.max(1, a.s * 0.8), b.x - a.x, Math.max(1, a.s * 0.8));
    const mid = proj(0, z, 43);
    const pulse = 0.85 + 0.15 * Math.sin(now / 500);
    g.save();
    g.shadowColor = '#ff4fa3';
    g.shadowBlur = REDUCED ? 0 : 10 * pulse;
    g.font = `400 ${Math.round(Math.min(26, 11 * mid.s))}px ${DISPLAY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd6ee';
    g.fillText('NYC LANES', mid.x, mid.y);
    g.restore();
    // Lane numbers.
    g.font = `900 ${Math.round(Math.min(18, 7 * mid.s))}px ${DISPLAY}`;
    g.fillStyle = '#36c5f0';
    for (const [cx, n] of [[-64, '6'], [64, '8']] as const) {
      const p = proj(cx, z, 43);
      g.fillText(n, p.x, p.y);
    }
  };

  // ---------------------------------------------------------- drawing: pins and ball
  /** Draw a pin from its base along a 3D axis (ux, uz, uh). `mirror` draws its reflection in the lane. */
  const drawPin = (bx: number, bz: number, bh: number, ux: number, uz: number, uh: number, mirror: boolean) => {
    const sg = mirror ? -1 : 1;
    const pts: { x: number; y: number; w: number }[] = [];
    for (const [d, r] of PROFILE) {
      const p = proj(bx + ux * d, bz + uz * d, sg * (bh + uh * d));
      pts.push({ x: p.x, y: p.y, w: r * p.s });
    }
    const n = pts.length;
    const ax = pts[n - 1].x - pts[0].x, ay = pts[n - 1].y - pts[0].y;
    const al = Math.hypot(ax, ay);
    if (al < 1.5) {
      // Pointing at the camera: a disc.
      g.fillStyle = mirror ? 'rgba(255,255,255,.12)' : '#f4f2ee';
      g.beginPath();
      g.arc(pts[0].x, pts[0].y, pts[3].w, 0, TAU);
      g.fill();
      return;
    }
    const nx = -ay / al, ny = ax / al;
    const outline = () => {
      g.beginPath();
      for (let i = 0; i < n; i++) g.lineTo(pts[i].x + nx * pts[i].w, pts[i].y + ny * pts[i].w);
      for (let i = n - 1; i >= 0; i--) g.lineTo(pts[i].x - nx * pts[i].w, pts[i].y - ny * pts[i].w);
      g.closePath();
    };
    if (mirror) {
      g.fillStyle = 'rgba(255,250,240,.16)';
      outline();
      g.fill();
      return;
    }
    const mid = pts[3];
    const gr = g.createLinearGradient(mid.x + nx * mid.w, mid.y + ny * mid.w, mid.x - nx * mid.w, mid.y - ny * mid.w);
    gr.addColorStop(0, '#b9bcc8');
    gr.addColorStop(0.45, '#ffffff');
    gr.addColorStop(1, '#a4a8b6');
    g.fillStyle = gr;
    outline();
    g.fill();
    g.strokeStyle = 'rgba(30,25,50,.35)';
    g.lineWidth = 0.6;
    g.stroke();
    // Two red neck stripes.
    g.fillStyle = '#d7263d';
    for (const [d0, d1] of [[9.4, 9.95], [10.45, 11.0]]) {
      const seg = (d: number) => {
        let i = 0;
        while (i < n - 2 && PROFILE[i + 1][0] < d) i++;
        const t = (d - PROFILE[i][0]) / (PROFILE[i + 1][0] - PROFILE[i][0]);
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, w: (pts[i].w + (pts[i + 1].w - pts[i].w) * t) * 1.02 };
      };
      const a = seg(d0), b = seg(d1);
      g.beginPath();
      g.moveTo(a.x + nx * a.w, a.y + ny * a.w);
      g.lineTo(b.x + nx * b.w, b.y + ny * b.w);
      g.lineTo(b.x - nx * b.w, b.y - ny * b.w);
      g.lineTo(a.x - nx * a.w, a.y - ny * a.w);
      g.closePath();
      g.fill();
    }
  };

  /** A pin's base and axis for drawing. */
  const pinPose = (p: Pin, now: number) => {
    if (p.state === 'down') {
      const dx = Math.sin(p.a), dz = Math.cos(p.a);
      return { bx: p.x - dx * 5.5, bz: p.z - dz * 5.5, bh: 2.2, ux: dx, uz: dz, uh: 0 };
    }
    let tilt = p.state === 'tip' ? p.tilt : 0;
    let a = p.a;
    if (p.state === 'up' && p.wob > 0) {
      tilt = p.wob * 0.07 * Math.sin(now / 45 + p.n);
      a = p.n;
    }
    const t = (tilt * Math.PI) / 2;
    return { bx: p.x, bz: p.z, bh: p.state === 'up' ? lift : 0, ux: Math.sin(a) * Math.sin(t), uz: Math.cos(a) * Math.sin(t), uh: Math.cos(t) };
  };

  const drawBall = (x: number, z: number, h: number, base: string, hi: string, roll: number, mirror: boolean) => {
    const c = proj(x, z, mirror ? -(h + BALL_R) : h + BALL_R);
    const r = BALL_R * c.s;
    if (mirror) {
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.beginPath();
      g.arc(c.x, c.y, r, 0, TAU);
      g.fill();
      return;
    }
    // Shadow.
    const sh = proj(x, z, 0);
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath();
    g.ellipse(sh.x, sh.y, r * 1.05, r * 0.32, 0, 0, TAU);
    g.fill();
    shinyBall(g, c.x, c.y, r, base, hi);
    // Finger holes coming round as it rolls.
    const phi = roll / BALL_R;
    for (const [ox, off] of [[-0.22, 0], [0.22, 0], [0, 0.95]] as const) {
      const a = phi + off;
      const vz = Math.sin(a), vy = Math.cos(a);
      if (vz < 0.15) continue;
      g.fillStyle = `rgba(10,10,20,${0.55 * vz})`;
      g.beginPath();
      g.ellipse(c.x + ox * r, c.y - vy * r * 0.7, r * 0.12, r * 0.12 * vz, 0, 0, TAU);
      g.fill();
    }
  };

  const drawSweep = () => {
    if (sweepH >= 40) return;
    const a = proj(-LANE.half - 2, sweepZ, sweepH), b = proj(LANE.half + 2, sweepZ, sweepH + 9);
    const gr = g.createLinearGradient(0, b.y, 0, a.y);
    gr.addColorStop(0, '#e9ecf2');
    gr.addColorStop(0.5, '#9aa0ae');
    gr.addColorStop(1, '#5d6272');
    g.fillStyle = gr;
    g.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
    g.strokeStyle = '#1c2340';
    g.lineWidth = 1;
    g.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
    g.fillStyle = '#ffd23f';
    for (let i = 0; i < 8; i++) g.fillRect(a.x + ((b.x - a.x) * (i + 0.25)) / 8, b.y + (a.y - b.y) * 0.4, ((b.x - a.x) / 8) * 0.5, (a.y - b.y) * 0.25);
  };

  // ---------------------------------------------------------- frame
  const draw = (now: number) => {
    const k = cv.width / W;
    g.setTransform(k, 0, 0, k, 0, 0);
    hc = HC + (HC_LOW - HC) * ease(camZ / CAM_MAX);
    const dt = fx.begin(g);
    drawRoom(now);
    for (const cx of [-64, 64]) drawLaneBed(cx, false);
    drawLaneBed(0, true);
    drawDeckEnd();
    // Reflections in the oil.
    for (const p of pins) {
      if (p.state !== 'up' && p.state !== 'tip') continue;
      const ps = pinPose(p, now);
      drawPin(ps.bx, ps.bz, ps.bh, ps.ux, ps.uz, ps.uh, true);
    }
    drawKickbacks();
    // Far to near.
    const items: { z: number; d: () => void }[] = [];
    for (const p of pins) {
      if (p.state === 'out') continue;
      items.push({
        z: p.z,
        d: () => {
          const ps = pinPose(p, now);
          if (p.state === 'up') {
            const sh = proj(p.x, p.z, 0);
            g.fillStyle = 'rgba(0,0,0,.25)';
            g.beginPath();
            g.ellipse(sh.x, sh.y, 2.6 * sh.s, 0.9 * sh.s, 0, 0, TAU);
            g.fill();
          }
          drawPin(ps.bx, ps.bz, ps.bh, ps.ux, ps.uz, ps.uh, false);
        },
      });
    }
    const p = cur();
    const colors = p?.ball ?? (['#2b59c3', '#9cc3ff'] as [string, string]);
    const b = lane.ball;
    if (b && !b.out && phase === 'roll') items.push({ z: b.z, d: () => drawBall(b.x, b.z, 0, colors[0], colors[1], b.roll, false) });
    else if (phase === 'aim' || phase === 'npc' || (phase === 'setter' && rollIn > 0)) {
      items.push({ z: AIM_Z, d: () => drawBall(ballShownX, AIM_Z, 0, colors[0], colors[1], 0, false) });
    }
    items.push({ z: sweepZ, d: drawSweep });
    items.sort((a, c) => c.z - a.z);
    if (b && !b.out && phase === 'roll' && !b.gutter) drawBall(b.x, b.z, 0, colors[0], colors[1], b.roll, true);
    for (const it of items) it.d();
    drawMasking(now);
    drawOverlay(now);
    fx.end(g);
    return dt;
  };

  const drawOverlay = (now: number) => {
    const p = cur();
    if (phase === 'aim' && p?.you) {
      // Guide dots straight ahead to the arrows.
      g.fillStyle = '#ffffff';
      g.strokeStyle = 'rgba(28,35,64,.6)';
      g.lineWidth = 1;
      for (let z = 24; z <= 200; z += 22) {
        const c = proj(ballShownX, z, 0.3);
        g.globalAlpha = 0.9 * (1 - z / 260);
        g.beginPath();
        g.ellipse(c.x, c.y, Math.max(1.2, 0.75 * c.s), Math.max(0.8, 0.4 * c.s), 0, 0, TAU);
        g.fill();
        g.stroke();
      }
      g.globalAlpha = 1;
      // The swipe trail.
      if (trail.length > 1) {
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = 'rgba(255,210,63,.75)';
        g.lineWidth = 6;
        g.beginPath();
        trail.forEach((t, i) => (i ? g.lineTo(t.x, t.y) : g.moveTo(t.x, t.y)));
        g.stroke();
      } else {
        const c = proj(ballShownX, AIM_Z, BALL_R);
        const bob = REDUCED ? 0 : Math.sin(now / 220) * 5;
        g.font = `26px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.globalAlpha = 0.85;
        g.fillText('👆', c.x + 2, c.y + 46 + bob);
        g.globalAlpha = 1;
        const ty = c.y - c.s * BALL_R - 40;
        label(g, throwsByYou < 2 ? '↔ line up · swipe ↑ to bowl' : 'swipe ↑', W / 2, ty, 15, '#fff');
        if (throwsByYou >= 1 && throwsByYou < 4) label(g, 'curve the end of your swipe to hook', W / 2, ty - 22, 12, '#ffd23f');
      }
    }
    if (phase === 'npc' || (phase === 'roll' && p && !p.you)) {
      label(g, `${p?.name ?? ''} is up`, W / 2, H - 44, 16, '#fff');
      label(g, 'tap to skip', W / 2, H - 22, 12, 'rgba(255,255,255,.7)');
    }
    // The last ball's speed and hook.
    if (throwInfo && now - throwInfo.t < 3200) {
      g.globalAlpha = clamp((3200 - (now - throwInfo.t)) / 500, 0, 1);
      const hook = Math.abs(throwInfo.hook) < 0.05 ? 'straight' : `hook ${throwInfo.hook < 0 ? '↶' : '↷'} ${Math.round(Math.abs(throwInfo.hook) * 100)}%`;
      label(g, `${throwInfo.mph.toFixed(1)} mph`, 12, H - 74, 14, '#7bd88f', 'left');
      label(g, hook, 12, H - 56, 12, '#fff', 'left');
      g.globalAlpha = 1;
    }
  };

  // ---------------------------------------------------------- input
  let drag: { id: number; x0: number; lastX: number; ballX0: number; swipe: number; maxY: number; samples: { x: number; y: number; t: number; bx: number }[] } | null = null;
  const pxPerInch = () => proj(0, AIM_Z, 0).s;

  const onDown = (e: PointerEvent) => {
    if (!live) return;
    e.preventDefault();
    if ((phase === 'npc' || phase === 'roll') && cur() && !cur().you) return skipNpc();
    if (phase !== 'aim' || !cur()?.you || drag) return;
    const p = toCanvas(e);
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic event: fine.
    }
    drag = { id: e.pointerId, x0: p.x, lastX: p.x, ballX0: aimX, swipe: -1, maxY: p.y, samples: [{ x: p.x, y: p.y, t: performance.now(), bx: aimX }] };
    trail.length = 0;
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id || phase !== 'aim') return;
    const p = toCanvas(e);
    const now = performance.now();
    drag.samples.push({ x: p.x, y: p.y, t: now, bx: aimX });
    if (drag.samples.length > 90) drag.samples.splice(0, drag.samples.length - 90);
    if (drag.swipe < 0) {
      // Line up: the ball follows the finger sideways…
      if (p.y > drag.maxY) drag.maxY = p.y;
      aimX = clamp(drag.ballX0 + (p.x - drag.x0) / pxPerInch(), -LANE.half + BALL_R + 0.5, LANE.half - BALL_R - 0.5);
      // …until it heads up the lane: that's the swipe.
      if (drag.maxY - p.y > 22) {
        // Start the swipe where the finger turned up (its lowest point); undo the sideways drift from there.
        let i = 0;
        drag.samples.forEach((sm, k) => sm.y >= drag!.samples[i].y && (i = k));
        drag.swipe = i;
        aimX = drag.samples[i].bx;
        trail.push(...drag.samples.slice(i).map((sm) => ({ x: sm.x, y: sm.y, t: sm.t })));
      }
    } else trail.push({ x: p.x, y: p.y, t: now });
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (phase !== 'aim') return void (trail.length = 0);
    const p = toCanvas(e);
    d.samples.push({ x: p.x, y: p.y, t: performance.now(), bx: aimX });
    if (d.swipe < 0) return void (trail.length = 0);
    const sw = d.samples.slice(d.swipe);
    const th = readSwipe(sw);
    trail.length = 0;
    if (!th) {
      fx.pop(W / 2, H - 90, 'swipe faster ↑', '#fff', 16);
      sfx.tap();
      return;
    }
    bowl(th);
  };

  /** Turn a swipe into a throw: direction aims, speed is speed, the curve at the end hooks. */
  const readSwipe = (sw: { x: number; y: number; t: number }[]): Throw | null => {
    if (sw.length < 2) return null;
    const a = sw[0], z = sw[sw.length - 1];
    const up = a.y - z.y;
    if (up < 40) return null;
    // Speed over the last ~100 ms.
    let j = sw.length - 1;
    while (j > 0 && z.t - sw[j - 1].t < 100) j--;
    const dtm = Math.max(16, z.t - sw[j].t);
    const vUp = ((sw[j].y - z.y) / dtm) * 1000;
    const avgUp = (up / Math.max(16, z.t - a.t)) * 1000;
    const v = Math.max(vUp, avgUp * 0.9);
    if (v < 260) return null;
    // Path length → the 60% point for the main direction.
    let len = 0;
    const cum = [0];
    for (let i = 1; i < sw.length; i++) cum.push((len += Math.hypot(sw[i].x - sw[i - 1].x, sw[i].y - sw[i - 1].y)));
    const at = (f: number) => {
      const L = len * f;
      let i = 1;
      while (i < sw.length - 1 && cum[i] < L) i++;
      return sw[i];
    };
    const m6 = at(0.62);
    const th1 = Math.atan2(m6.x - a.x, a.y - m6.y);
    if (Math.abs(th1) > 1.1) return null; // mostly sideways
    const tail = at(0.7);
    const th2 = z === tail ? th1 : Math.atan2(z.x - tail.x, tail.y - z.y);
    let curve = th2 - th1;
    if (Math.hypot(z.x - tail.x, z.y - tail.y) < 10) curve = 0;
    const spin = Math.sign(curve) * clamp((Math.abs(curve) - 0.14) / 0.75, 0, 1);
    const speed = SPEED.min + (SPEED.max - SPEED.min) * clamp((v - 450) / 2600, 0, 1);
    return { x: aimX, angle: clamp(th1 * 0.03, -0.04, 0.04), speed, spin };
  };

  const keyHeld = { l: false, r: false };
  const onKey = (e: KeyboardEvent) => {
    if (!live || e.repeat) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a') keyHeld.l = true;
    else if (k === 'ArrowRight' || k === 'd') keyHeld.r = true;
    else if (k === ' ' || k === 'ArrowUp' || k === 'Enter') {
      if (phase === 'aim' && cur()?.you) {
        e.preventDefault();
        bowl({ x: aimX, angle: 0, speed: 300, spin: 0 });
      } else if ((phase === 'npc' || phase === 'roll') && !cur()?.you) {
        e.preventDefault();
        skipNpc();
      }
      return;
    } else return;
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keyHeld.l = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keyHeld.r = false;
  };
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', fit);

  // ---------------------------------------------------------- the turns
  const bowl = (th: Throw) => {
    const p = cur();
    if (!p) return;
    standingBefore = standing(pins).length;
    ballNo = nextBall(p.rolls);
    lane = newLane(pins);
    release(lane, th);
    phase = 'roll';
    hitDone = false;
    pinSounds = 0;
    slow = 1;
    restT = 0;
    if (p.you) (throwsByYou++, (yourX = th.x));
    throwInfo = { mph: mph(th.speed), hook: th.spin, t: performance.now() + 400 };
    sfx.whoosh();
    // The roll: a low rumble for the trip down the lane.
    const trip = (LANE.head + 10) / Math.max(120, th.speed);
    noiseBurst(0.05, trip, { type: 'lowpass', freq: 140, sweepTo: 320, brown: true, gain: 0.32, attack: 0.25 });
    buzz(12);
  };

  const beginBall = () => {
    const p = cur();
    if (!p) return;
    sheet();
    ballNo = nextBall(p.rolls);
    if (p.you) {
      phase = 'aim';
      aimX = ballShownX;
      rollIn = 0;
    } else {
      phase = 'npc';
      const th = npcThrow(p.skill, pins, Math.random);
      npcPlan = { th, t: 0 };
    }
    hud();
  };

  const skipNpc = () => {
    const p = cur();
    if (!p || p.you) return;
    if (phase === 'npc' && npcPlan) {
      bowl(npcPlan.th);
      npcPlan = null;
    }
    if (phase !== 'roll') return;
    settle(lane, Math.random);
    lane.ball!.out = true;
    hitDone = true;
    restT = 1;
  };

  /** The ball is done and the pins are still: score it, call it, set up the next ball. */
  const resolveBall = () => {
    const p = cur();
    const nb = ballNo;
    const left = standing(lane.pins);
    const down = clamp(standingBefore - left.length, 0, nb.standing);
    p.rolls.push(down);
    const gutter = !!lane.ball?.gutter;
    callIt(p, nb, down, left.map((x) => x.n), gutter);
    sheet();
    // Who's next, and what the pinsetter does.
    const after = gameOver(p.rolls) ? null : nextBall(p.rolls);
    const frameDone = !after || after.frame !== nb.frame;
    if (frameDone) {
      const n = players.length;
      let nextTurn = -1;
      for (let i = 1; i <= n; i++) {
        const c = (turn + i) % n;
        if (!gameOver(players[c].rolls)) {
          nextTurn = c;
          break;
        }
      }
      if (nextTurn < 0) {
        phase = 'over';
        later(1400, finish);
        return;
      }
      turn = nextTurn;
    }
    const nn = nextBall(cur().rolls);
    phase = 'wait';
    later(frameDone ? 900 : 650, () => runSetter(nn.fresh ? 'reset' : 'sweep', () => beginBall()));
  };

  const callIt = (p: Player, nb: typeof ballNo, down: number, leftNums: number[], gutter: boolean) => {
    const mine = p.you;
    const big = mine ? 1 : 0.6;
    if (nb.fresh && down === 10) {
      const run = strikeRun(p.rolls);
      const word = p.rolls.length === 12 && gameScore(p.rolls) === 300 ? 'PERFECT GAME!' : run >= 4 ? `${run}-BAGGER!` : run === 3 ? 'TURKEY! 🦃' : run === 2 ? 'DOUBLE!' : 'STRIKE!';
      fx.stamp(mine ? word : `${p.name.toUpperCase()}: ${word}`, '#ffd23f', 1.3);
      fx.flash('#ffffff', 0.22);
      fx.shake(14 * big, 0.45);
      confetti(mine ? 46 : 18);
      sfx.win();
      if (mine) later(150, () => sfx.cheer());
      buzz([30, 40, 60]);
    } else if (!nb.fresh && down === nb.standing && nb.standing > 0) {
      fx.stamp(mine ? 'SPARE!' : `${p.name.toUpperCase()}: SPARE`, '#36c5f0', 1.1);
      fx.shake(6 * big, 0.25);
      fx.burst(W / 2, 170, { emoji: ['✨', '🎳'], n: mine ? 14 : 6, size: 18, speed: 220, up: true });
      sfx.good();
      if (mine) later(160, () => sfx.chime());
    } else if (down === 0 && gutter) {
      fx.stamp('GUTTER', '#9aa0ae', 0.9);
      sfx.bad();
    } else if (nb.fresh && isSplit(leftNums)) {
      fx.stamp('SPLIT', '#ff4fa3', 1);
      fx.pop(W / 2, 220, `${down}`, '#fff', 26);
      sfx.bad();
    } else {
      fx.pop(W / 2, 200, down === 0 ? '-' : `${down}`, down >= 8 ? '#ffd23f' : '#fff', down >= 8 ? 32 : 26);
      down >= 7 ? sfx.good() : sfx.tap();
    }
  };

  const confetti = (n: number) => {
    const cols = ['#ffd23f', '#ff4fa3', '#36c5f0', '#7bd88f', '#ffffff'];
    for (let i = 0; i < 4; i++) fx.burst((W * (i + 0.5)) / 4, -6, { n: Math.ceil(n / 4), colors: cols, size: 6, speed: 200, gravity: 260, life: 1.8 });
    fx.burst(W / 2, 190, { emoji: ['🎉', '✨', '🎳'], n: Math.ceil(n / 5), size: 20, speed: 260, up: true, life: 1.2 });
  };

  /** The pinsetter: sweep the deadwood (standing pins lifted, then set back) or a full reset. */
  const runSetter = (kind: Setter['kind'], done: () => void) => {
    setter = { kind, t: 0, dur: kind === 'set' ? 0.9 : kind === 'reset' ? 2.0 : 1.7, done, swept: false, racked: false };
    phase = 'setter';
    noiseBurst(0, 0.5, { type: 'bandpass', freq: 380, sweepTo: 180, q: 0.8, brown: true, gain: 0.1 });
    sfx.tick();
  };
  const stepSetter = (dt: number) => {
    const st = setter;
    if (!st) return;
    st.t += dt;
    const t = st.t;
    // The camera comes back to the bowler near the end; the next ball rolls in from the return.
    if (st.kind === 'set') {
      if (!st.racked) {
        pins = newRack();
        lane = newLane(pins);
        st.racked = true;
      }
      lift = 30 * (1 - ease(t / 0.8));
      sweepH = 44;
    } else {
      const reset = st.kind === 'reset';
      // Standing pins go up (sweep only), the sweep comes down and clears, goes up, pins come down.
      if (!reset) lift = t < 0.15 ? 0 : t < 0.45 ? 28 * ease((t - 0.15) / 0.3) : t < 1.2 ? 28 : 28 * (1 - ease((t - 1.2) / 0.4));
      sweepH = t < 0.3 ? 44 - 44 * ease(t / 0.3) : t < 1.0 ? 0 : t < 1.2 ? 44 * ease((t - 1.0) / 0.2) : 44;
      sweepZ = t < 0.35 ? 704 : t < 0.95 ? 704 + 70 * ease((t - 0.35) / 0.6) : 704;
      if (t >= 0.35 && t < 1.0) {
        for (const p of pins) {
          if (p.state === 'out' || (!reset && p.state === 'up')) continue;
          if (p.z < sweepZ + 4) p.z = sweepZ + 4;
          if (p.z > LANE.deck + 2) p.state = 'out';
        }
      }
      if (t >= 1.0 && !st.swept) {
        st.swept = true;
        pins = reset ? [] : clearDeadwood(pins);
        lane = newLane(pins);
        if (reset) sfx.tick();
      }
      if (reset && t >= 1.15) {
        if (!st.racked) {
          st.racked = true;
          pins = newRack();
          lane = newLane(pins);
          noiseBurst(0, 0.35, { type: 'lowpass', freq: 600, gain: 0.12, brown: true });
        }
        lift = 30 * (1 - ease((t - 1.15) / 0.75));
      }
    }
    if (t >= st.dur) {
      lift = 0;
      sweepH = 44;
      sweepZ = 704;
      setter = null;
      st.done();
    }
  };

  // ---------------------------------------------------------- loop
  const frame = (now: number) => {
    if (!live) return;
    if (!m.el.isConnected) return void destroy();
    const realDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dt = fx.frozen ? 0 : realDt;
    // Camera.
    let camTarget = 0;
    if (phase === 'roll' && lane.ball) camTarget = clamp(lane.ball.z - 170, 0, CAM_MAX);
    else if (phase === 'roll') camTarget = CAM_MAX;
    else if (phase === 'wait') camTarget = camZ;
    else if (phase === 'setter') camTarget = setter && setter.t < setter.dur - 0.55 ? camZ : 0;
    if (phase === 'roll' && lane.ball?.out) camTarget = CAM_MAX;
    camZ += (camTarget - camZ) * Math.min(1, dt * (phase === 'roll' ? 5 : 4.5));
    if (Math.abs(camTarget - camZ) < 0.05) camZ = camTarget;
    // Ball on the return / in hand.
    if (phase === 'setter' && setter && setter.t > setter.dur - 0.5 && cur()) {
      rollIn = clamp(rollIn + dt * 2.4, 0, 1);
      const home = cur().you ? yourX : 0;
      ballShownX = LANE.half + 14 - (LANE.half + 14 - home) * ease(rollIn);
    }
    if (phase === 'aim') {
      if (keyHeld.l) aimX = clamp(aimX - dt * 18, -LANE.half + BALL_R + 0.5, LANE.half - BALL_R - 0.5);
      if (keyHeld.r) aimX = clamp(aimX + dt * 18, -LANE.half + BALL_R + 0.5, LANE.half - BALL_R - 0.5);
      ballShownX += (aimX - ballShownX) * Math.min(1, dt * 20);
    }
    if (phase === 'npc' && npcPlan) {
      npcPlan.t += dt;
      ballShownX += (npcPlan.th.x - ballShownX) * Math.min(1, dt * 4);
      if (npcPlan.t > 1.1) {
        const th = npcPlan.th;
        npcPlan = null;
        bowl(th);
      }
    }
    if (phase === 'roll') {
      slow = Math.min(1, slow + dt * 1.4);
      stepLane(lane, dt * slow, Math.random);
      drainEvents();
      const b = lane.ball!;
      if (settled(lane) && (b.out || b.vz <= 0)) {
        restT += dt;
        if (restT > 0.45) resolveBall();
      }
    }
    if (phase === 'setter') stepSetter(dt);
    for (const p of pins) if (p.state === 'up' && p.wob > 0 && phase !== 'roll') p.wob = Math.max(0, p.wob - dt * 1.6);
    draw(now);
    hud();
    raf = requestAnimationFrame(frame);
  };

  const drainEvents = () => {
    const now = performance.now();
    for (const e of lane.events) {
      if (e.k === 'hit' && !hitDone) {
        hitDone = true;
        const sp = lane.ball ? Math.hypot(lane.ball.vx, lane.ball.vz) : 250;
        drum('kick', 0, 1.2, 'sfx');
        sfx.punch();
        noiseBurst(0.02, 0.55, { type: 'bandpass', freq: 1700, sweepTo: 900, q: 0.7, gain: 0.3 });
        fx.shake(4 + sp / 55, 0.3);
        if (!REDUCED) slow = 0.45;
        const c = proj(e.x, e.z, 8);
        fx.burst(c.x, c.y, { colors: ['#ffffff', '#ffd23f'], n: 10, size: 3, speed: 160, life: 0.4 });
      } else if ((e.k === 'pin' || e.k === 'fall' || e.k === 'kick') && e.s > 20) {
        if (pinSounds < 18 && now - lastPinSound > 28) {
          pinSounds++;
          lastPinSound = now;
          const gain = clamp(e.s / 260, 0.25, 1);
          drum(e.k === 'kick' ? 'clap' : Math.random() < 0.5 ? 'snare' : 'clap', 0, gain, 'sfx');
        }
      } else if (e.k === 'gutter') {
        drum('kick', 0, 0.45, 'sfx');
        noiseBurst(0, 0.8, { type: 'lowpass', freq: 220, brown: true, gain: 0.18 });
      } else if (e.k === 'pit' && lane.ball && lane.ball.out && Math.abs(e.z - lane.ball.z) < 1) {
        drum('kick', 0, 0.6, 'sfx');
      }
    }
    lane.events.length = 0;
  };

  // ---------------------------------------------------------- screens
  const attract = () => {
    camZ = 0;
    draw(performance.now());
  };

  const intro = () => {
    phase = 'intro';
    players = [];
    sheet();
    hud();
    const best = bowlingBest(s);
    over.className = 'bw-over';
    over.innerHTML = `<div class="bw-card">
      <div class="bw-emoji" aria-hidden="true">🎳</div>
      <h3>Bowling</h3>
      <p>Drag the ball to line up, then swipe up to bowl. A faster swipe throws harder; curve the end of the swipe to hook it.</p>
      <div class="bw-modes" role="radiogroup" aria-label="Who's bowling">
        <button class="bw-mode${mode === 'solo' ? ' on' : ''}" role="radio" aria-checked="${mode === 'solo'}" data-mode="solo"><span aria-hidden="true">🙋</span><b>Solo</b><small>Just you</small></button>
        <button class="bw-mode${mode === 'vs' ? ' on' : ''}" role="radio" aria-checked="${mode === 'vs'}" data-mode="vs"><span aria-hidden="true">🤝</span><b>vs ${esc(foe.name)}</b><small>${skillWord(foe.skill)}</small></button>
      </div>
      <div class="bw-chips"><span>🏆 Best ${best}</span><span>👟 Shoes included</span><span>💵 ${money(s.money)}</span></div>
      <button class="btn primary block" data-go>🎳 Bowl · ${money(BOWLING_COST)}</button>
    </div>`;
    over.hidden = false;
    attract();
  };

  const start = () => {
    const why = stake(s, BOWLING_COST, 'Bowling');
    if (why) return void toast(why, { icon: '🎳', tone: 'bad' });
    sfx.coin();
    host.saved();
    lastMode = mode;
    players = [{ name: 'You', you: true, skill: 1, rolls: [], ball: ['#2b59c3', '#a9c8ff'] }];
    if (mode === 'vs') players.push({ name: foe.name, you: false, skill: foe.skill, rolls: [], ball: ['#c1272d', '#ffb3b3'] });
    turn = 0;
    throwsByYou = 0;
    sheetMarks = 0;
    pins = [];
    lane = newLane(pins);
    ballShownX = LANE.half + 14;
    over.hidden = true;
    fit();
    sheet();
    // Count in while the first rack comes down.
    phase = 'count';
    count.hidden = false;
    const steps = ['3', '2', '1', 'BOWL!'];
    steps.forEach((txt, i) =>
      later(i * 480, () => {
        count.innerHTML = `<span class="${i === steps.length - 1 ? 'go' : ''}">${txt}</span>`;
        i === steps.length - 1 ? (sfx.notify(), buzz(20)) : sfx.tick();
      }),
    );
    later(250, () => runSetter('set', () => {}));
    later(steps.length * 480 - 80, () => {
      count.hidden = true;
      rollIn = 0;
      phase = 'setter';
      setter = { kind: 'set', t: 0.5, dur: 1.0, done: () => beginBall(), swept: true, racked: true };
    });
  };

  const finish = () => {
    const me = players[0];
    const score = gameScore(me.rolls);
    const vs = players[1];
    const theirs = vs ? gameScore(vs.rolls) : 0;
    const won = !!vs && score > theirs;
    const t = tally(me.rolls);
    const r = finishBowling(s, score, { versus: !!vs, won, strikes: t.strikes });
    host.onScore?.('bowling', score);
    postScore('bowling', score);
    host.saved();
    phase = 'over';
    sheet();
    hud();
    const head = vs ? (score > theirs ? 'You win!' : score < theirs ? `${esc(vs.name)} wins` : 'A tie') : r.best ? 'New best!' : score >= 200 ? 'What a game!' : score >= 130 ? 'Nice game' : 'Game over';
    const icon = r.best ? '🏆' : vs ? (score > theirs ? '🏆' : score < theirs ? '😤' : '🤝') : '🎳';
    over.className = 'bw-over end';
    over.innerHTML = `<div class="bw-card">
      <div class="bw-emoji" aria-hidden="true">${icon}</div>
      <h3>${head}</h3>
      <p class="bw-score">${score}</p>
      ${vs ? `<p class="bw-vs"><span>You <b>${score}</b></span><span>${esc(vs.name)} <b>${theirs}</b></span></p>` : ''}
      <div class="bw-chips"><span><b class="bw-x-mark">X</b> ${t.strikes} strike${t.strikes === 1 ? '' : 's'}</span><span><b class="bw-sp-mark">/</b> ${t.spares} spare${t.spares === 1 ? '' : 's'}</span><span>🏆 Best ${bowlingBest(s)}</span></div>
      <div class="bw-gains"><span class="bw-gain">+${r.fun} 🎉 fun</span>${r.social ? `<span class="bw-gain soc">+${r.social} 🤝 social</span>` : ''}${r.twoHundred ? '<span class="bw-gain hot">🎳 200 club</span>' : ''}</div>
      <div class="bw-btns"><button class="btn primary" data-again>🔁 Again · ${money(BOWLING_COST)}</button><button class="btn ghost" data-close>Done</button></div>
      <button class="btn ghost block bw-lb" data-board>🏆 Leaderboard</button>
    </div>`;
    over.hidden = false;
    if (r.best && score > 0) (rain(m.el, '🎳', 16), sfx.levelUp());
    else if (won || score >= 150) sfx.win();
    else sfx.chime();
  };

  // ---------------------------------------------------------- clicks
  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) {
      sfx.close();
      destroy();
      return m.close();
    }
    const md = t.closest<HTMLElement>('[data-mode]');
    if (md) {
      mode = md.dataset.mode === 'vs' ? 'vs' : 'solo';
      over.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => (b.classList.toggle('on', b === md), b.setAttribute('aria-checked', String(b === md))));
      return;
    }
    if (t.closest('[data-board]')) {
      const btn = t.closest<HTMLElement>('[data-board]')!;
      btn.setAttribute('disabled', '');
      void fetchBoard(s, 'bowling').then((b) => {
        if (!live) return;
        btn.insertAdjacentHTML('afterend', boardHtml('bowling', b).replace('🏆 Leaderboard', '🏆 🎳 Bowling'));
        btn.remove();
      });
      return;
    }
    if (t.closest('[data-go]') || t.closest('[data-again]')) start();
  });

  const destroy = () => {
    if (!live) return;
    live = false;
    cancelAnimationFrame(raf);
    timers.forEach((x) => window.clearTimeout(x));
    timers = [];
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerup', onUp);
    cv.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', fit);
  };

  intro();
  fit();
  attract();
  fx = new Fx(W, H);
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function skillWord(k: number): string {
  return k >= 0.85 ? 'League bowler' : k >= 0.6 ? 'Pretty good' : k >= 0.35 ? 'Weekend bowler' : 'Bumpers energy';
}
