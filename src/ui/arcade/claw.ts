// =====================================================================
// 🧸 Claw Machine — a real UFO catcher, rebuilt (Peter, 2026-10-28:
// "rebuild all the games in the arcade, clean them up properly").
//
// A side view into the cabinet: a pile of plushies (each a little rigid
// body that tumbles and stacks), a claw on a gantry. Steer it (drag on
// the glass, hold ◀ ▶, or ← →), then DROP (the button, the red dome on
// the cabinet, Space / ↓). The claw falls until its palm lands, the
// fingers close, and the GRIP meter shows how well you did: a palm
// landed dead on a prize's middle, fingers under it, a calm (not
// swinging) claw, a light fuzzy prize. On the way up the claw loosens
// (they all do) and a weak grip sags and slips, keeping the swing. Drop
// it past the plexi wall into the chute to win it. Three tries a coin,
// 15 s to aim each; the pile stays as you left it, so a nudged prize
// can be next try's easy grab (or tumble in by itself: a LUCKY DROP).
// ✨ Shiny prizes are worth double.
// The physics and rules (pure, tested): sim/arcade-claw.ts.
//
// The frame (ui/arcade.ts) renders `.arc-pad.arc-claw` with
// [data-claw-l] [data-claw-drop] [data-claw-r]: hold ◀ ▶ to steer, tap
// DROP. Those still work; the cabinet's own red dome also drops, so the
// game is complete without them.
// =====================================================================

import { burst as hiss, note, sfx } from '../audio.ts';
import { Fx } from '../juice.ts';
import { emoji, H, W, type Run } from '../arcade-games.ts';
import { clamp, finisher, keys, label, pointers, prerender } from './kit.ts';
import {
  AIM_TIME, CAB, ClawGame, PLUSH, TRIES, bodyAngle, com, extent, type Body, type ClawInput, type PlushKind,
} from '../../sim/arcade-claw.ts';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const DOME = { x: 314, y: 455, r: 19, hit: 30 };
const DOOR = { x0: CAB.L, x1: CAB.WALL_X, y: 455 };
const TOP = 34;

/** Each plush drawn once into a sprite (with a soft drop shadow baked in): cheap to blit, rotated. */
function sprites(): Map<string, { c: HTMLCanvasElement; s: number }> {
  const m = new Map<string, { c: HTMLCanvasElement; s: number }>();
  for (const k of PLUSH) {
    let ext = 0;
    for (const p of k.parts) ext = Math.max(ext, Math.hypot(p.x, p.y) + p.r);
    const size = Math.round(k.parts.length > 1 ? ext * 1.95 : ext * 2.25);
    const S = size + 16;
    const c = prerender(S * 2, S * 2, (g) => {
      g.scale(2, 2);
      g.shadowColor = 'rgba(0,0,0,.45)';
      g.shadowBlur = 5;
      g.shadowOffsetY = 3;
      emoji(g, k.emoji, S / 2, S / 2 + 1, size);
    });
    m.set(k.id, { c, s: S });
  }
  return m;
}

export const claw: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const game = new ClawGame();
  const SPR = sprites();
  let raf = 0, over = false;
  const input: ClawInput = { dir: 0, target: null, drop: false };
  let gripShown = 0, gripT = 0, sagWarn = 0, lightPulse = 0, domeDown = 0;
  const won: { kind: PlushKind; shiny: boolean; t: number }[] = [];
  const fallers: { kind: PlushKind; shiny: boolean; x: number; y: number; vy: number; a: number }[] = [];

  // ------------------------------------------------------------- input
  const drop = () => {
    if (game.phase !== 'aim') return;
    input.drop = true;
    domeDown = 0.25;
  };
  let dragId = -1;
  const offP = pointers(cv, {
    down: (t) => {
      if (Math.hypot(t.x - DOME.x, t.y - DOME.y) < DOME.hit) return drop();
      dragId = t.id;
      input.target = clamp(t.x, CAB.L + 30, CAB.R - 24);
    },
    move: (t) => {
      if (t.id === dragId) input.target = clamp(t.x, CAB.L + 30, CAB.R - 24);
    },
    up: (t) => {
      // The claw keeps going to where you let go (a tap on the glass sends it there).
      if (t.id === dragId) dragId = -1;
    },
  });
  // The frame's pad: hold ◀ ▶, tap DROP.
  const pad = cv.parentElement?.parentElement ?? null;
  const btnL = pad?.querySelector<HTMLElement>('[data-claw-l]') ?? null;
  const btnR = pad?.querySelector<HTMLElement>('[data-claw-r]') ?? null;
  const btnD = pad?.querySelector<HTMLElement>('[data-claw-drop]') ?? null;
  const holdL = (e: Event) => (e.preventDefault(), (input.dir = -1), (input.target = null));
  const holdR = (e: Event) => (e.preventDefault(), (input.dir = 1), (input.target = null));
  const release = () => (input.dir = 0);
  const onDrop = (e: Event) => (e.preventDefault(), drop());
  btnL?.addEventListener('pointerdown', holdL);
  btnR?.addEventListener('pointerdown', holdR);
  btnD?.addEventListener('click', onDrop);
  for (const b of [btnL, btnR]) {
    b?.addEventListener('pointerup', release);
    b?.addEventListener('pointerleave', release);
    b?.addEventListener('pointercancel', release);
  }
  window.addEventListener('pointerup', release);
  const offK = keys(
    (k) => {
      if (k === 'ArrowLeft') (input.dir = -1), (input.target = null);
      if (k === 'ArrowRight') (input.dir = 1), (input.target = null);
      if (k === ' ' || k === 'ArrowDown' || k === 'Enter') drop();
    },
    (k) => {
      if ((k === 'ArrowLeft' && input.dir < 0) || (k === 'ArrowRight' && input.dir > 0)) input.dir = 0;
    },
  );

  // ------------------------------------------------------------ sounds
  const motor = (up: boolean) => hiss(0, 0.5, { type: 'bandpass', freq: up ? 260 : 420, sweepTo: up ? 420 : 240, q: 3, gain: 0.05, attack: 0.05, out: 'sfx' });
  const clunk = () => {
    note(110, 0, 0.12, 'square', 0.04, 'sfx');
    hiss(0, 0.06, { type: 'lowpass', freq: 800, gain: 0.1, out: 'sfx' });
  };
  const thud = () => {
    hiss(0, 0.1, { type: 'lowpass', freq: 400, gain: 0.18, brown: true, out: 'sfx' });
    note(80, 0, 0.12, 'sine', 0.12, 'sfx');
  };

  // ------------------------------------------------------------ events
  const handle = () => {
    for (const e of game.events) {
      const h = game.hub();
      switch (e.kind) {
        case 'drop':
          motor(false);
          break;
        case 'land':
          thud();
          fx.burst(e.x, e.y + 26, { colors: ['#fff', '#ffd6f0'], n: 6, size: 3, speed: 70, life: 0.35 });
          break;
        case 'grab': {
          gripShown = e.grip;
          gripT = 9;
          const pct = Math.round(e.grip * 100);
          fx.pop(h.x, h.y - 26, `GRIP ${pct}%`, e.grip >= 0.62 ? '#7bd88f' : e.grip >= 0.45 ? '#ffd23f' : '#ff6b6b', 18);
          sfx.close();
          fx.shake(2, 0.08);
          motor(true);
          break;
        }
        case 'whiff':
          fx.pop(h.x, h.y - 20, game.target ? 'just fluff…' : 'nothing there', '#cfd8dc', 16);
          sfx.tap();
          gripShown = 0;
          gripT = 0;
          motor(true);
          break;
        case 'top':
          clunk();
          if (game.held) fx.shake(2.5, 0.1);
          break;
        case 'sag':
          sagWarn = 1.2;
          fx.pop(h.x + 34, h.y + 10, 'slipping…', '#ff9f1c', 14);
          note(220, 0, 0.18, 'triangle', 0.05, 'sfx');
          break;
        case 'slip':
          fx.pop(e.x, e.y - 24, 'SLIPPED!', '#e0283f', 22);
          fx.shake(6, 0.2);
          fx.burst(e.x, e.y, { colors: ['#fff', '#ffd6f0', '#c9b6ff'], n: 10, size: 3, speed: 120, life: 0.5 });
          sfx.bad();
          gripT = 0;
          break;
        case 'release':
          sfx.open();
          break;
        case 'win': {
          const c = com(e.body);
          fallers.push({ kind: e.body.kind, shiny: e.body.shiny, x: c.x, y: c.y, vy: 120, a: bodyAngle(e.body) });
          const big = e.body.shiny || e.value >= 30;
          fx.stamp(e.body.shiny ? '✨ SHINY! ✨' : e.lucky ? 'LUCKY DROP!' : big ? 'JACKPOT!' : 'GOT IT!', e.body.shiny ? '#ffd23f' : '#fff', 1.2);
          fx.pop(54, 300, `+${e.value}`, '#ffd23f', 26);
          fx.burst(54, DOOR.y - 10, { emoji: e.body.shiny ? ['✨', '🎟️', e.body.kind.emoji] : ['🎟️', '✨'], n: REDUCED ? 6 : 16, size: 18, up: true, speed: 280 });
          if (!REDUCED) fx.flash('#ffd23f', 0.25);
          fx.shake(big ? 8 : 5, 0.25);
          lightPulse = 1.5;
          big ? sfx.jackpot() : sfx.win();
          break;
        }
        case 'tryEnd':
          if (!e.won && game.phase !== 'over') fx.pop(180, 200, 'so close… 😩', '#cfd8dc', 18);
          if (game.phase !== 'over') {
            fx.pop(180, 236, `try ${game.try} of ${TRIES}`, '#fff', 16);
            sfx.coin();
          }
          gripT = 0;
          break;
        case 'over': {
          const n = won.length;
          fx.stamp(n >= 3 ? 'CLAW MASTER!' : n >= 1 ? `${n} PRIZE${n > 1 ? 'S' : ''}!` : 'THE HOUSE WINS 😤', n ? '#ffd23f' : '#fff', 1.5);
          if (n >= 2) sfx.cheer();
          fin.end(game.score, 1800);
          break;
        }
      }
    }
    game.events.length = 0;
  };

  // ---------------------------------------------------------- scenery
  const cabinet = prerender(W, H, (c) => {
    // The cabinet's body.
    const body = c.createLinearGradient(0, 0, W, 0);
    body.addColorStop(0, '#3a1460');
    body.addColorStop(0.5, '#5a2391');
    body.addColorStop(1, '#3a1460');
    c.fillStyle = body;
    c.fillRect(0, 0, W, H);
    // Inside: a pink-to-violet back wall with a quilted pattern.
    const back = c.createLinearGradient(0, TOP, 0, CAB.FLOOR);
    back.addColorStop(0, '#2b1050');
    back.addColorStop(0.55, '#7a2a7a');
    back.addColorStop(1, '#ff6fae');
    c.fillStyle = back;
    c.fillRect(CAB.L, TOP, CAB.R - CAB.L, CAB.FLOOR - TOP);
    c.strokeStyle = 'rgba(255,255,255,.06)';
    c.lineWidth = 1;
    for (let k = -20; k < 40; k++) {
      c.beginPath();
      c.moveTo(CAB.L + k * 22, TOP);
      c.lineTo(CAB.L + k * 22 + 400, TOP + 400);
      c.moveTo(CAB.L + k * 22, TOP);
      c.lineTo(CAB.L + k * 22 - 400, TOP + 400);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.12)';
    for (let i = 0; i < 40; i++) {
      const x = CAB.L + 11 + (i % 14) * 22 + (Math.floor(i / 14) % 2) * 11, y = TOP + 40 + Math.floor(i / 14) * 70;
      c.beginPath();
      c.arc(x, y, 1.6, 0, Math.PI * 2);
      c.fill();
    }
    // The LED strip's light falling down the box.
    const led = c.createLinearGradient(0, TOP, 0, TOP + 160);
    led.addColorStop(0, 'rgba(255,240,220,.35)');
    led.addColorStop(1, 'rgba(255,240,220,0)');
    c.fillStyle = led;
    c.fillRect(CAB.L, TOP, CAB.R - CAB.L, 160);
    // The chute: a dark mouth behind the plexi wall, with a sign.
    const ch = c.createLinearGradient(0, CAB.WALL_TOP - 40, 0, CAB.FLOOR);
    ch.addColorStop(0, 'rgba(10,0,20,0)');
    ch.addColorStop(1, 'rgba(10,0,20,.85)');
    c.fillStyle = ch;
    c.fillRect(CAB.L, CAB.WALL_TOP - 40, CAB.WALL_X - CAB.L, CAB.FLOOR - CAB.WALL_TOP + 40);
    c.fillStyle = '#ffd23f';
    c.font = '900 11px "Lilita One", "Arial Black", system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('PRIZE', (CAB.L + CAB.WALL_X) / 2, CAB.WALL_TOP - 58);
    c.font = '18px system-ui';
    c.fillText('⬇️', (CAB.L + CAB.WALL_X) / 2, CAB.WALL_TOP - 38);
    // The prize bed's edge.
    c.fillStyle = '#26103d';
    c.fillRect(CAB.WALL_X, CAB.FLOOR, CAB.R - CAB.WALL_X, 6);
    // Chrome rail.
    const rail = c.createLinearGradient(0, CAB.RAIL - 4, 0, CAB.RAIL + 4);
    rail.addColorStop(0, '#f2f4f7');
    rail.addColorStop(0.5, '#8d96a3');
    rail.addColorStop(1, '#4b525c');
    c.fillStyle = rail;
    c.fillRect(CAB.L, CAB.RAIL - 4, CAB.R - CAB.L, 8);
    // The marquee.
    const mq = c.createLinearGradient(0, 0, 0, TOP);
    mq.addColorStop(0, '#1b0930');
    mq.addColorStop(1, '#2d1150');
    c.fillStyle = mq;
    c.fillRect(0, 0, W, TOP);
    // The front panel: the prize door, the coin lights, the dome.
    const fp = c.createLinearGradient(0, CAB.FLOOR + 6, 0, H);
    fp.addColorStop(0, '#4a1a78');
    fp.addColorStop(1, '#25093f');
    c.fillStyle = fp;
    c.fillRect(0, CAB.FLOOR + 6, W, H - CAB.FLOOR - 6);
    c.fillStyle = '#0b0414';
    c.beginPath();
    c.roundRect(DOOR.x0 + 4, CAB.FLOOR + 12, DOOR.x1 - DOOR.x0 - 8, 38, 6);
    c.fill();
    c.strokeStyle = '#ffd23f';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = '#ffd23f';
    c.font = '900 8px "Arial Black", system-ui';
    c.fillText('PUSH', (DOOR.x0 + DOOR.x1) / 2, CAB.FLOOR + 46);
    // The cabinet's sides (over the interior's edges).
    c.fillStyle = '#4a1a78';
    c.fillRect(0, TOP, CAB.L, CAB.FLOOR - TOP + 6);
    c.fillRect(CAB.R, TOP, W - CAB.R, CAB.FLOOR - TOP + 6);
  });

  // The glass: a slight tint, two long reflections, a darker frame edge.
  const glass = prerender(W, H, (c) => {
    c.save();
    c.beginPath();
    c.rect(CAB.L, TOP, CAB.R - CAB.L, CAB.FLOOR - TOP);
    c.clip();
    c.fillStyle = 'rgba(180,220,255,.04)';
    c.fillRect(0, 0, W, H);
    for (const [x, w, a] of [[40, 46, 0.09], [104, 12, 0.07], [250, 70, 0.05]] as const) {
      const gr = c.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(x + 120, TOP);
      c.lineTo(x + 120 + w, TOP);
      c.lineTo(x + w - 60, CAB.FLOOR);
      c.lineTo(x - 60, CAB.FLOOR);
      c.closePath();
      c.fill();
    }
    const v = c.createRadialGradient(180, 240, 120, 180, 240, 300);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.35)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.25)';
    c.lineWidth = 1.5;
    c.strokeRect(CAB.L + 0.5, TOP + 0.5, CAB.R - CAB.L - 1, CAB.FLOOR - TOP - 1);
  });

  // -------------------------------------------------------------- draw
  const drawBody = (b: Body, now: number, dy = 0) => {
    const c = com(b);
    const sp = SPR.get(b.kind.id)!;
    if (b.shiny) {
      const e = extent(b);
      const r = Math.max(e.hw, e.hh) + 8;
      const pulse = REDUCED ? 0.6 : 0.5 + 0.3 * Math.sin(now / 160 + b.id);
      const gl = g.createRadialGradient(c.x, c.y + dy, r * 0.3, c.x, c.y + dy, r);
      gl.addColorStop(0, `rgba(255,215,64,${0.45 * pulse})`);
      gl.addColorStop(1, 'rgba(255,215,64,0)');
      g.fillStyle = gl;
      g.fillRect(c.x - r, c.y + dy - r, r * 2, r * 2);
    }
    g.save();
    g.translate(c.x, c.y + dy);
    g.rotate(bodyAngle(b));
    g.drawImage(sp.c, -sp.s / 2, -sp.s / 2, sp.s, sp.s);
    g.restore();
    if (b.shiny && !REDUCED) {
      // A glint that travels round it.
      const a = now / 500 + b.id;
      const e = extent(b);
      const gx = c.x + Math.cos(a) * e.hw * 0.7, gy = c.y + dy + Math.sin(a * 1.3) * e.hh * 0.7;
      const s = 3 + 2 * Math.abs(Math.sin(now / 120 + b.id));
      g.fillStyle = '#fff8d0';
      g.beginPath();
      g.moveTo(gx, gy - s * 1.6);
      g.lineTo(gx + s * 0.35, gy);
      g.lineTo(gx, gy + s * 1.6);
      g.lineTo(gx - s * 0.35, gy);
      g.closePath();
      g.moveTo(gx - s * 1.6, gy);
      g.lineTo(gx, gy + s * 0.35);
      g.lineTo(gx + s * 1.6, gy);
      g.lineTo(gx, gy - s * 0.35);
      g.closePath();
      g.fill();
    }
  };

  const drawClaw = (now: number) => {
    const h = game.hub();
    const gy = CAB.RAIL;
    // Carriage.
    const cg = g.createLinearGradient(0, gy - 9, 0, gy + 9);
    cg.addColorStop(0, '#f5f7fa');
    cg.addColorStop(1, '#6d7682');
    g.fillStyle = cg;
    g.beginPath();
    g.roundRect(game.gx - 18, gy - 9, 36, 18, 4);
    g.fill();
    g.fillStyle = game.phase === 'aim' ? (Math.floor(now / 300) % 2 && !REDUCED ? '#7bd88f' : '#2f9e55') : '#ff4fa3';
    g.beginPath();
    g.arc(game.gx, gy, 3, 0, Math.PI * 2);
    g.fill();
    // Cable.
    g.strokeStyle = '#d9dee5';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(game.gx, gy + 8);
    g.lineTo(h.x, h.y - 8);
    g.stroke();
    // Fingers: thick chrome strokes with a highlight.
    const segs = game.fingers();
    const wob = game.held && game.sag > 3 && !REDUCED ? Math.sin(now / 40) * 0.8 : 0;
    for (const [w, col] of [[6.5, '#59616c'], [3.5, '#e6eaef']] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let s = 0; s < 4; s += 2) {
        const a = segs[s], b = segs[s + 1];
        g.beginPath();
        g.moveTo(a.x0, a.y0);
        g.lineTo(a.x1 + wob, a.y1);
        g.lineTo(b.x1 + wob, b.y1);
        g.stroke();
      }
    }
    // The palm: a chrome dome.
    const dg = g.createRadialGradient(h.x - 4, h.y - 6, 2, h.x, h.y, 16);
    dg.addColorStop(0, '#ffffff');
    dg.addColorStop(0.45, '#b9c1cc');
    dg.addColorStop(1, '#4b525c');
    g.fillStyle = dg;
    g.beginPath();
    g.ellipse(h.x, h.y, 15, 11, -game.th, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff4fa3';
    g.beginPath();
    g.arc(h.x, h.y + 2, 2.4, 0, Math.PI * 2);
    g.fill();
  };

  const draw = (now: number, dt: number) => {
    g.lineJoin = 'round';
    g.drawImage(cabinet, 0, 0);
    // Marquee: chasing bulbs and the name.
    for (let k = 0; k < 24; k++) {
      const on = REDUCED ? k % 2 === 0 : (Math.floor(now / (lightPulse > 0 ? 60 : 150)) + k) % 3 === 0;
      g.fillStyle = on ? '#ffd23f' : 'rgba(255,79,163,.5)';
      g.beginPath();
      g.arc(10 + k * 14.8, 5, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    label(g, 'CLAW MACHINE', 180, 21, 17, lightPulse > 0 && !REDUCED && Math.floor(now / 100) % 2 ? '#fff' : '#ff9ad5');
    // LED glow pulses on a win.
    if (lightPulse > 0) {
      g.fillStyle = `rgba(255,230,140,${Math.min(0.25, lightPulse * 0.15)})`;
      g.fillRect(CAB.L, TOP, CAB.R - CAB.L, CAB.FLOOR - TOP);
    }
    // Where the claw will land: a faint plumb line and spot (fair on phones).
    if (game.phase === 'aim') {
      const h = game.hub();
      g.strokeStyle = 'rgba(255,255,255,.18)';
      g.setLineDash([3, 5]);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(h.x, h.y + 40);
      g.lineTo(h.x, CAB.FLOOR);
      g.stroke();
      g.setLineDash([]);
    }
    // The pile.
    for (const b of game.bodies) if (b !== game.held) drawBody(b, now);
    // The plexi wall in front of the chute.
    const pw = g.createLinearGradient(CAB.WALL_X - 4, 0, CAB.WALL_X + 4, 0);
    pw.addColorStop(0, 'rgba(200,230,255,.15)');
    pw.addColorStop(0.5, 'rgba(255,255,255,.55)');
    pw.addColorStop(1, 'rgba(200,230,255,.15)');
    g.fillStyle = pw;
    g.fillRect(CAB.WALL_X - 3, CAB.WALL_TOP, 6, CAB.FLOOR - CAB.WALL_TOP);
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.fillRect(CAB.WALL_X - 3, CAB.WALL_TOP, 6, 2);
    // The claw and what it holds (drawn with it, so it hangs in the fingers).
    if (game.held) drawBody(game.held, now, 0);
    drawClaw(now);
    // Prizes dropping down the chute to the door.
    for (let i = fallers.length - 1; i >= 0; i--) {
      const f = fallers[i];
      f.vy += 1400 * dt;
      f.y += f.vy * dt;
      f.a += dt * 4;
      if (f.y > DOOR.y) {
        won.push({ kind: f.kind, shiny: f.shiny, t: 0 });
        fallers.splice(i, 1);
        thud();
        continue;
      }
      const sp = SPR.get(f.kind.id)!;
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.a);
      g.drawImage(sp.c, -sp.s / 2, -sp.s / 2, sp.s, sp.s);
      g.restore();
    }
    g.drawImage(glass, 0, 0);

    // ------- front panel: the door shows your latest prize, coins = tries left, the dome
    const last = won[won.length - 1];
    if (last) {
      last.t += dt;
      const bounce = REDUCED ? 0 : Math.max(0, 1 - last.t * 2) * Math.abs(Math.sin(last.t * 14)) * 8;
      if (last.shiny) {
        g.fillStyle = 'rgba(255,215,64,.35)';
        g.beginPath();
        g.arc((DOOR.x0 + DOOR.x1) / 2, DOOR.y - 6, 18, 0, Math.PI * 2);
        g.fill();
      }
      emoji(g, last.kind.emoji, (DOOR.x0 + DOOR.x1) / 2, DOOR.y - 6 - bounce, 26);
    }
    for (let i = 0; i < TRIES; i++) {
      const used = i < game.try - 1 || (i === game.try - 1 && game.phase !== 'aim') || game.phase === 'over';
      g.fillStyle = used ? 'rgba(255,255,255,.15)' : '#ffd23f';
      g.beginPath();
      g.arc(112 + i * 18, 446, 6, 0, Math.PI * 2);
      g.fill();
      if (!used) {
        g.strokeStyle = '#a87b00';
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
    label(g, 'TRIES', 130, 466, 9, '#cfb8f0');
    label(g, String(game.score), 214, 448, 20, '#ffd23f');
    label(g, 'SCORE', 214, 466, 9, '#cfb8f0');
    // Won so far (small).
    for (let i = 0; i < Math.min(5, won.length - 1); i++) emoji(g, won[won.length - 2 - i].kind.emoji, 252 + (i % 2) * 14, 442 + Math.floor(i / 2) * 12, 11);
    // The red dome.
    const pressed = domeDown > 0 || game.phase !== 'aim';
    const dg = g.createRadialGradient(DOME.x - 6, DOME.y - 8 + (pressed ? 2 : 0), 2, DOME.x, DOME.y + (pressed ? 2 : 0), DOME.r);
    dg.addColorStop(0, pressed ? '#ff8a8a' : '#ffb3b3');
    dg.addColorStop(0.5, pressed ? '#a3141f' : '#e0283f');
    dg.addColorStop(1, '#5c0a10');
    g.fillStyle = '#1a0610';
    g.beginPath();
    g.ellipse(DOME.x, DOME.y + 6, DOME.r + 4, DOME.r * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    if (game.phase === 'aim' && !REDUCED) {
      g.shadowColor = '#ff2e63';
      g.shadowBlur = 8 + 6 * Math.sin(now / 200);
    }
    g.fillStyle = dg;
    g.beginPath();
    g.arc(DOME.x, DOME.y + (pressed ? 2 : 0), DOME.r, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    label(g, 'DROP', DOME.x, DOME.y + (pressed ? 2 : 0), 10, '#fff');

    // ------- aim timer and the grip meter
    if (game.phase === 'aim') {
      const f = game.aimLeft / AIM_TIME;
      const low = game.aimLeft < 4;
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(CAB.L + 8, TOP + 20, CAB.R - CAB.L - 16, 5);
      g.fillStyle = low ? '#e0283f' : '#7bd88f';
      g.fillRect(CAB.L + 8, TOP + 20, (CAB.R - CAB.L - 16) * clamp(f, 0, 1), 5);
      label(g, `${Math.ceil(game.aimLeft)}`, CAB.R - 18, TOP + 38, 16, low ? '#ff6b6b' : '#fff');
      if (game.try === 1 && game.aimLeft > AIM_TIME - 6) {
        const bob = REDUCED ? 0 : Math.sin(now / 220) * 4;
        label(g, 'drag or tap the glass to steer · DROP', 180, TOP + 52 + bob, 13, '#fff');
      }
    }
    if (gripT > 0 && (game.held || game.phase === 'close')) {
      const h = game.hub();
      const x = clamp(h.x + 28, CAB.L + 6, CAB.R - 56), y = clamp(h.y - 18, TOP + 30, CAB.FLOOR - 20);
      const warn = sagWarn > 0 && Math.floor(now / 120) % 2 === 0;
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(x, y, 48, 14);
      g.fillStyle = warn ? '#e0283f' : gripShown >= 0.62 ? '#7bd88f' : gripShown >= 0.45 ? '#ffd23f' : '#ff6b6b';
      g.fillRect(x + 2, y + 2, 44 * clamp(gripShown - game.sag / 40, 0, 1), 10);
      g.fillStyle = '#fff';
      g.font = '800 8px system-ui';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('GRIP', x + 3, y + 7.5);
    }
  };

  // -------------------------------------------------------------- loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    if (!fx.frozen) {
      if (game.phase !== 'over') game.step(dt, input);
      input.drop = false;
      // Arrived (and not being dragged): stop steering; a new try starts from the chute.
      if (input.target !== null && dragId < 0 && (game.phase !== 'aim' || (Math.abs(game.gx - input.target) < 1 && Math.abs(game.gv) < 4))) input.target = null;
      handle();
      gripT = Math.max(0, gripT - dt);
      sagWarn = Math.max(0, sagWarn - dt);
      lightPulse = Math.max(0, lightPulse - dt);
      domeDown = Math.max(0, domeDown - dt);
    }
    draw(now, dt);
    fx.end(g);
    const cents = game.phase === 'aim' ? ` · ⏱ ${Math.ceil(game.aimLeft)}s` : '';
    hud(`🧸 ${game.score} · try ${Math.min(game.try, TRIES)}/${TRIES}${cents}`);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    fin.cancel();
    cancelAnimationFrame(raf);
    offP();
    offK();
    btnL?.removeEventListener('pointerdown', holdL);
    btnR?.removeEventListener('pointerdown', holdR);
    btnD?.removeEventListener('click', onDrop);
    for (const b of [btnL, btnR]) {
      b?.removeEventListener('pointerup', release);
      b?.removeEventListener('pointerleave', release);
      b?.removeEventListener('pointercancel', release);
    }
    window.removeEventListener('pointerup', release);
  };
};
