// =====================================================================
// 🏀 Hoop Shot — a Pop-A-Shot lane, rebuilt (Peter, 2026-10-28: "rebuild
// all the games in the arcade, clean them up properly").
//
// Touch low on the glass and flick up at the hoop: the flick's speed is
// the power, its direction the aim. The ball flies a real arc (it shrinks
// down the lane), rattles on the rim, banks off the glass, drops through
// the net and rolls back down the ramp. Shoot as fast as you like (three
// in the air at once). 60 seconds:
//   • racks of five, the last ball of each is a 💰 money ball (×2);
//     a perfect rack adds +5 s (up to +15 s);
//   • three in a row and you're 🔥 ON FIRE (×2, a wider sweet spot)
//     until you miss;
//   • the hoop starts sliding at 0:20 and speeds up at 0:40: lead it;
//   • the last 10 seconds are BONUS TIME (×2); balls in the air at the
//     buzzer still count.
// Keys: ← → to shift, Space / ↑ to shoot. The physics and rules (pure,
// tested): sim/arcade-hoops.ts.
// =====================================================================

import { burst as hiss, note, sfx } from '../audio.ts';
import { Fx } from '../juice.ts';
import { emoji, H, secs, W, type Run } from '../arcade-games.ts';
import { clamp, finisher, keys, label, pointers, prerender } from './kit.ts';
import {
  BALL_R, BOARD, BONUS_LAST, CAGE, FIRE_AT, FLIGHT_T, HOOPS_TIME, LAUNCH, LAUNCH_SY, MAX_IN_AIR, POWER_TOL, POWER_TOL_FIRE,
  RACK, RACK_BONUS_MAX, RACK_BONUS_S, RELOAD, RIM, RIM_SY, SWEET, floorY, hoopRound, hoopX, hoopsLaunch, hoopsPoints, hoopsStep,
  isMoneyBall, missHint, newBall, outcome, project, scaleAt, type Ball, type HoopsEvent, type Shot,
} from '../../sim/arcade-hoops.ts';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const STEP = 1 / 240;
const TOP = 3.9; // the cabinet's canopy height
const NEAR = 0.25; // nearest z of the cabinet we draw
const BOARD_Z = RIM.Z + BOARD.DZ;
const GAUGE = { x: 238, y: 452, w: 108 };

interface Flight {
  b: Ball;
  shot: Shot;
  n: number;
  money: boolean;
  fire: boolean;
  rack: number;
  resolved: boolean;
  /** Launched before the buzzer? (a make after it is a buzzer beater) */
  late: boolean;
  trail: number[];
}

// ------------------------------------------------------------- drawing
function ballSprite(g: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, money: boolean, fire: boolean): void {
  if (fire) {
    const glow = g.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2);
    glow.addColorStop(0, 'rgba(255,140,0,.55)');
    glow.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = glow;
    g.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
  }
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  if (money) {
    // The ABA red-white-blue money ball.
    g.save();
    g.translate(x, y);
    g.rotate(spin * 0.5);
    const cols = ['#d62839', '#f4f1ea', '#1d4e9e', '#f4f1ea'];
    for (let i = -3; i < 3; i++) {
      g.fillStyle = cols[(i + 4) % 4];
      g.fillRect(-r * 1.5, i * r * 0.36, r * 3, r * 0.37);
    }
    g.restore();
  } else {
    g.fillStyle = fire ? '#ff7a12' : '#e8751f';
    g.fillRect(x - r, y - r, r * 2, r * 2);
    // Seams, turning with the spin.
    g.strokeStyle = 'rgba(40,16,4,.75)';
    g.lineWidth = Math.max(1, r * 0.09);
    const c = Math.cos(spin), s = Math.sin(spin);
    g.beginPath();
    g.moveTo(x - c * r, y - s * r);
    g.lineTo(x + c * r, y + s * r);
    const k = 0.55 + 0.35 * Math.sin(spin * 0.7);
    g.moveTo(x + s * r * 1.6 * k + r * 1.25 * k, y - c * r * 1.6 * k);
    g.arc(x + s * r * 1.6 * k, y - c * r * 1.6 * k, r * 1.25 * k, 0, Math.PI * 2);
    g.stroke();
  }
  // Light from above-left, shade below.
  const sh = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
  sh.addColorStop(0, 'rgba(255,255,255,.55)');
  sh.addColorStop(0.35, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = sh;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
  if (money) {
    g.strokeStyle = '#ffd23f';
    g.lineWidth = Math.max(1.2, r * 0.12);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
  }
}

export const hoops: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  let raf = 0, over = false;

  // ------------------------------------------------------------- state
  let t = 0, end = secs(HOOPS_TIME), added = 0, score = 0, streak = 0, fire = false, best = 0;
  let n = 0; // balls shot
  let makes = 0, buzzer = false, ended = false;
  const flights: Flight[] = [];
  const rackMade: number[] = [], rackDone: number[] = [];
  let reload = 0, holdX = 0, handX = 0;
  let holding = false, hint = '', hintT = 0, lastPower = -1, lastPowerT = 0;
  let rimFlash = 0, boardFlash = 0, netKick = 0, rimJolt = 0, round = 1, bonusOn = false, cheerT = 0;
  const events: HoopsEvent[] = [];

  // Flick samples (a small ring buffer: no allocation per move).
  const SX = new Float32Array(8), SY = new Float32Array(8), ST = new Float64Array(8);
  let si = 0;
  const sample = (x: number, y: number) => {
    si = (si + 1) % 8;
    SX[si] = x;
    SY[si] = y;
    ST[si] = performance.now();
  };

  const left = () => Math.max(0, end - t);
  const bonusTime = () => left() <= BONUS_LAST;
  const canShoot = () => !ended && reload <= 0 && flights.filter((f) => !f.resolved).length < MAX_IN_AIR;

  // ------------------------------------------------------------ sounds
  const rimSound = (p: number) => {
    note(620 + Math.random() * 60, 0, 0.12, 'square', Math.min(0.05, 0.015 + p * 0.008), 'sfx');
    note(1240, 0, 0.08, 'triangle', 0.03, 'sfx');
  };
  const boardSound = (p: number) => {
    hiss(0, 0.09, { type: 'lowpass', freq: 900, gain: Math.min(0.35, 0.12 + p * 0.06), brown: true, out: 'sfx' });
    note(140, 0, 0.1, 'sine', 0.18, 'sfx');
  };
  const swishSound = () => hiss(0, 0.22, { type: 'bandpass', freq: 3200, sweepTo: 1500, q: 0.8, gain: 0.16, attack: 0.02, out: 'sfx' });
  const horn = () => {
    note(220, 0, 0.7, 'square', 0.05, 'sfx');
    note(277, 0, 0.7, 'square', 0.04, 'sfx');
  };

  // ------------------------------------------------------------- shoot
  const shoot = (x0: number, slope: number, speed: number) => {
    if (!canShoot()) return;
    n++;
    const lead = hoopX(t + FLIGHT_T);
    const shot = hoopsLaunch({ x0, slope, speed }, lead, { fire });
    const rack = Math.floor((n - 1) / RACK);
    flights.push({ b: newBall(shot), shot, n, money: isMoneyBall(n), fire, rack, resolved: false, late: t < end, trail: [] });
    reload = RELOAD;
    lastPower = speed / SWEET;
    lastPowerT = 2.5;
    sfx.whoosh();
  };

  const resolve = (f: Flight) => {
    f.resolved = true;
    const o = outcome(f.b);
    rackDone[f.rack] = (rackDone[f.rack] ?? 0) + 1;
    const p = project(hoopX(t), RIM.Y, RIM.Z);
    if (o.made) {
      makes++;
      rackMade[f.rack] = (rackMade[f.rack] ?? 0) + 1;
      const lateMake = f.late && t >= end;
      const pts = hoopsPoints({ swish: o.swish, money: f.money, fire: f.fire || fire, bonus: bonusTime() || lateMake });
      score += pts;
      streak++;
      best = Math.max(best, streak);
      netKick = 1;
      const col = f.money ? '#ffd23f' : o.swish ? '#7bd88f' : '#fff';
      fx.pop(p.x, p.y - 34, `+${pts}`, col, 22 + Math.min(14, pts));
      const tag = o.swish ? 'SWISH' : o.bank ? 'BANK!' : f.b.rim >= 2 ? 'RATTLED IN' : '';
      if (tag) fx.pop(p.x, p.y - 4, tag, o.swish ? '#7bd88f' : '#36c5f0', 15);
      fx.burst(p.x, p.y + 26, { colors: f.money ? ['#ffd23f', '#fff', '#d62839'] : ['#fff', '#ffd23f'], n: o.swish ? 14 : 8, size: 3, speed: 140, life: 0.5 });
      if (o.swish) swishSound();
      if (lateMake && !buzzer) {
        buzzer = true;
        fx.stamp('BUZZER BEATER!', '#ffd23f', 1.2);
        sfx.cheer();
      } else if (f.money) {
        fx.stamp('💰 MONEY!', '#ffd23f', 0.8);
        fx.burst(p.x, p.y, { emoji: ['💰', '✨'], n: 10, size: 16, speed: 220, up: true });
        sfx.jackpot();
      } else {
        o.swish ? sfx.win() : sfx.good();
      }
      fx.shake(o.swish ? 4 : 2, 0.12);
      if (o.swish) fx.stop(0.04);
      if (streak === FIRE_AT && !fire) {
        fire = true;
        fx.stamp('🔥 ON FIRE! 🔥', '#ff6a00', 1.2);
        if (!REDUCED) fx.flash('#ff6a00', 0.3);
        fx.shake(9, 0.3);
        sfx.cheer();
        cheerT = 2;
      } else if (streak === FIRE_AT - 1 && !fire) fx.pop(180, 300, 'heating up…', '#ff9f1c', 15);
    } else {
      if (fire) {
        fx.stamp('fire’s out 💨', '#aab', 0.8);
        sfx.bad();
      } else sfx.tick();
      fire = false;
      streak = 0;
      const h = missHint(f.shot, f.fire);
      const moving = hoopX(t) !== 0 || hoopX(t + 0.5) !== 0;
      hint = h === 'short' ? 'a bit soft: flick faster' : h === 'long' ? 'too hard: ease off' : h ? (moving ? 'lead the hoop' : `pulled ${h}: aim at the rim`) : 'unlucky bounce';
      hintT = 2.2;
      fx.pop(clamp(project(f.b.x, Math.max(f.b.y, RIM.Y), f.b.z).x, 60, 300), p.y - 30, f.b.rim ? 'CLANK' : f.b.board ? 'OFF THE GLASS' : 'AIRBALL', '#e0283f', 16);
    }
    // A full rack: perfect = more time.
    if (rackDone[f.rack] === RACK) {
      if (rackMade[f.rack] === RACK && added < RACK_BONUS_MAX && t < end) {
        end += RACK_BONUS_S;
        added += RACK_BONUS_S;
        fx.stamp(`PERFECT RACK +${RACK_BONUS_S}s`, '#36c5f0', 1);
        sfx.levelUp();
      }
    }
  };

  // ------------------------------------------------------------- input
  const offP = pointers(cv, {
    down: (tc) => {
      if (ended || tc.y < 150) return;
      holding = true;
      SX.fill(tc.x);
      SY.fill(tc.y);
      ST.fill(performance.now());
      si = 0;
      if (tc.y > 290) holdX = clamp((tc.x - 180) / scaleAt(LAUNCH.Z), -LAUNCH.XMAX, LAUNCH.XMAX);
    },
    move: (tc) => {
      if (!holding) return;
      sample(tc.x, tc.y);
      if (tc.y > 300 && tc.y0 - tc.y < 30) holdX = clamp((tc.x - 180) / scaleAt(LAUNCH.Z), -LAUNCH.XMAX, LAUNCH.XMAX);
    },
    up: (tc) => {
      if (!holding) return;
      holding = false;
      sample(tc.x, tc.y);
      const now = performance.now();
      let j = si;
      for (let k = 0; k < 7; k++) {
        const pj = (j + 7) % 8;
        if (now - ST[pj] > 90) break;
        j = pj;
      }
      const dtm = Math.max(16, now - ST[j]);
      const vx = ((SX[si] - SX[j]) / dtm) * 1000, vy = ((SY[si] - SY[j]) / dtm) * 1000;
      const dx = tc.x - tc.x0, dy = tc.y - tc.y0;
      if (dy > -30 || vy > -250) {
        if (!ended) fx.pop(180, 300, 'flick up at the hoop ⬆️', '#fff', 15);
        return;
      }
      if (!canShoot()) return;
      shoot(holdX, dx / -dy, Math.hypot(vx, vy));
    },
  });
  let keyHold = 0;
  const offK = keys(
    (k) => {
      if (k === 'ArrowLeft') keyHold = -1;
      if (k === 'ArrowRight') keyHold = 1;
      if (k === ' ' || k === 'ArrowUp') {
        // A decent set shot at where the hoop will be, never perfect.
        const target = hoopX(t + FLIGHT_T);
        const slope = ((target * scaleAt(RIM.Z) - holdX * scaleAt(LAUNCH.Z)) / (LAUNCH_SY - RIM_SY)) + (Math.random() - 0.5) * 0.06;
        shoot(holdX, slope, SWEET * (0.84 + Math.random() * 0.32));
      }
    },
    (k) => (k === 'ArrowLeft' || k === 'ArrowRight') && (keyHold = 0),
  );

  // ---------------------------------------------------------- scenery
  const P = (x: number, y: number, z: number) => project(x, y, z);
  const bg = prerender(W, H, (c) => {
    // The arena: dark, a haze of lights, the crowd up in the stands.
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d0a24');
    sky.addColorStop(0.5, '#231043');
    sky.addColorStop(1, '#120a1f');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      const x = 20 + i * 55, y = 70;
      const l = c.createRadialGradient(x, y, 0, x, y, 70);
      l.addColorStop(0, 'rgba(255,220,170,.16)');
      l.addColorStop(1, 'rgba(255,220,170,0)');
      c.fillStyle = l;
      c.fillRect(x - 70, y - 70, 140, 140);
    }
    // The floor ramp, between the side nets.
    const z0 = NEAR, z1 = CAGE.BACK;
    const a = P(-CAGE.X, floorY(z1), z1), b = P(CAGE.X, floorY(z1), z1), d = P(CAGE.X, floorY(z0), z0), e = P(-CAGE.X, floorY(z0), z0);
    const fl = c.createLinearGradient(0, a.y, 0, H);
    fl.addColorStop(0, '#5b2d14');
    fl.addColorStop(1, '#2a1309');
    c.fillStyle = fl;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.lineTo(d.x, d.y);
    c.lineTo(e.x, e.y);
    c.closePath();
    c.fill();
    // Rubber ribs on the ramp.
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = 1;
    for (let z = z1; z > z0; z -= 0.22) {
      const p1 = P(-CAGE.X, floorY(z), z), p2 = P(CAGE.X, floorY(z), z);
      c.beginPath();
      c.moveTo(p1.x, p1.y);
      c.lineTo(p2.x, p2.y);
      c.stroke();
    }
    // A lane stripe down the middle.
    c.fillStyle = 'rgba(255,127,17,.35)';
    const s1 = P(-0.08, floorY(z1), z1), s2 = P(0.08, floorY(z1), z1), s3 = P(0.08, floorY(z0), z0), s4 = P(-0.08, floorY(z0), z0);
    c.beginPath();
    c.moveTo(s1.x, s1.y);
    c.lineTo(s2.x, s2.y);
    c.lineTo(s3.x, s3.y);
    c.lineTo(s4.x, s4.y);
    c.fill();
    // The back wall: a skyline at dusk, under a neon sign.
    const w0 = P(-CAGE.X, TOP, z1), w1 = P(CAGE.X, floorY(z1), z1);
    const wall = c.createLinearGradient(0, w0.y, 0, w1.y);
    wall.addColorStop(0, '#1b2a6b');
    wall.addColorStop(0.6, '#53307a');
    wall.addColorStop(1, '#ff7f50');
    c.fillStyle = wall;
    c.fillRect(w0.x, w0.y, w1.x - w0.x, w1.y - w0.y);
    c.fillStyle = 'rgba(10,8,30,.85)';
    let x = w0.x;
    const rnd = (k: number) => (Math.sin(k * 12.9898) * 43758.5453) % 1;
    for (let k = 0; x < w1.x; k++) {
      const bw = 8 + Math.abs(rnd(k)) * 14, bh = 20 + Math.abs(rnd(k + 9)) * 60;
      c.fillRect(x, w1.y - bh, bw, bh);
      x += bw + 1;
    }
    c.fillStyle = 'rgba(255,214,120,.55)';
    for (let k = 0; k < 60; k++) c.fillRect(w0.x + Math.abs(rnd(k + 40)) * (w1.x - w0.x), w1.y - 6 - Math.abs(rnd(k + 90)) * 60, 1.5, 1.5);
    // The canopy and its strip lights.
    const c0 = P(-CAGE.X, TOP, z0), c1 = P(CAGE.X, TOP, z0);
    c.fillStyle = '#0b0a14';
    c.beginPath();
    c.moveTo(c0.x, c0.y);
    c.lineTo(c1.x, c1.y);
    c.lineTo(P(CAGE.X, TOP, z1).x, w0.y);
    c.lineTo(w0.x, w0.y);
    c.closePath();
    c.fill();
    // Light pools from the canopy onto the ramp.
    for (const lz of [1.2, 2.4]) {
      const p = P(0, floorY(lz), lz);
      const l = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 90 * (p.s / 100));
      l.addColorStop(0, 'rgba(255,230,190,.18)');
      l.addColorStop(1, 'rgba(255,230,190,0)');
      c.fillStyle = l;
      c.fillRect(p.x - 160, p.y - 80, 320, 160);
    }
    // Side nets: a see-through mesh.
    c.strokeStyle = 'rgba(255,255,255,.13)';
    c.lineWidth = 1;
    for (const sx of [-CAGE.X, CAGE.X]) {
      for (let z = z0; z <= z1 + 0.01; z += 0.16) {
        const p1 = P(sx, floorY(z), z), p2 = P(sx, TOP, z);
        c.beginPath();
        c.moveTo(p1.x, p1.y);
        c.lineTo(p2.x, p2.y);
        c.stroke();
      }
      for (let y = 0.8; y <= TOP; y += 0.18) {
        const p1 = P(sx, Math.max(y, floorY(z0)), z0), p2 = P(sx, Math.max(y, floorY(z1)), z1);
        c.beginPath();
        c.moveTo(p1.x, p1.y);
        c.lineTo(p2.x, p2.y);
        c.stroke();
      }
      // The frame posts.
      c.strokeStyle = '#ff7f11';
      c.lineWidth = 3;
      const q1 = P(sx, floorY(z1), z1), q2 = P(sx, TOP, z1);
      c.beginPath();
      c.moveTo(q1.x, q1.y);
      c.lineTo(q2.x, q2.y);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.13)';
      c.lineWidth = 1;
    }
    // The scoreboard panel.
    const sb = c.createLinearGradient(0, 0, 0, 56);
    sb.addColorStop(0, '#16161f');
    sb.addColorStop(1, '#08080d');
    c.fillStyle = sb;
    c.fillRect(0, 0, W, 56);
    c.fillStyle = '#ff7f11';
    c.fillRect(0, 54, W, 2);
    c.fillStyle = 'rgba(255,255,255,.05)';
    c.fillRect(0, 0, W, 20);
    // The bottom rail (rack and gauge sit on it).
    const rail = c.createLinearGradient(0, 432, 0, H);
    rail.addColorStop(0, 'rgba(10,8,18,.0)');
    rail.addColorStop(0.35, 'rgba(10,8,18,.85)');
    rail.addColorStop(1, '#07060c');
    c.fillStyle = rail;
    c.fillRect(0, 420, W, 60);
  });

  // The crowd's heads, through the side nets (bounce harder when you're hot).
  const crowd = Array.from({ length: 34 }, (_, i) => ({
    x: (i % 17) * 22 + (i >= 17 ? 11 : 0) - 6,
    y: i >= 17 ? 96 : 76,
    c: ['#3a2a55', '#2d2346', '#4a3060', '#352a4f'][i % 4],
    p: i * 1.7,
  }));

  // -------------------------------------------------------------- draw
  const ringPts = (hx: number, from: number, to: number, y: number = RIM.Y, r: number = RIM.R, yJ = 0) => {
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = from + ((to - from) * k) / 16;
      const p = P(hx + Math.cos(a) * r, y + yJ, RIM.Z + Math.sin(a) * r);
      k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y);
    }
  };

  const drawBoard = (hx: number, now: number) => {
    const tl = P(hx - BOARD.HW, BOARD.Y1, BOARD_Z), br = P(hx + BOARD.HW, BOARD.Y0, BOARD_Z);
    const bw = br.x - tl.x, bh = br.y - tl.y;
    // The support pole behind.
    g.fillStyle = '#2b2b33';
    const pole = P(hx, BOARD.Y0, BOARD_Z + 0.1);
    g.fillRect(pole.x - 3, pole.y, 6, P(hx, floorY(BOARD_Z), BOARD_Z).y - pole.y);
    // Glass: tinted, with the rim of LEDs that light up on a make.
    g.fillStyle = 'rgba(190,220,255,.16)';
    g.fillRect(tl.x, tl.y, bw, bh);
    g.save();
    g.beginPath();
    g.rect(tl.x, tl.y, bw, bh);
    g.clip();
    // Reflections: two slanted streaks that drift with the hoop.
    g.fillStyle = 'rgba(255,255,255,.14)';
    for (const [o, w] of [[0.15, 0.12], [0.42, 0.05]] as const) {
      const x0 = tl.x + bw * o + hx * 20;
      g.beginPath();
      g.moveTo(x0, tl.y);
      g.lineTo(x0 + bw * w, tl.y);
      g.lineTo(x0 + bw * w - bh * 0.6, br.y);
      g.lineTo(x0 - bh * 0.6, br.y);
      g.closePath();
      g.fill();
    }
    if (boardFlash > 0) {
      g.fillStyle = `rgba(120,200,255,${boardFlash * 0.35})`;
      g.fillRect(tl.x, tl.y, bw, bh);
    }
    g.restore();
    const lit = netKick > 0.2 || fire;
    g.strokeStyle = lit ? (fire ? '#ff7a12' : '#7bd88f') : '#f4f4f4';
    g.lineWidth = 3;
    if (lit && !REDUCED) {
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = 12;
    }
    g.strokeRect(tl.x, tl.y, bw, bh);
    g.shadowBlur = 0;
    // The shooter's square.
    const q1 = P(hx - 0.3, RIM.Y + 0.45, BOARD_Z), q2 = P(hx + 0.3, RIM.Y + 0.05, BOARD_Z);
    g.strokeStyle = fire ? '#ffd23f' : '#ff4d2e';
    g.lineWidth = 2.5;
    g.strokeRect(q1.x, q1.y, q2.x - q1.x, q2.y - q1.y);
    // The bracket from the glass to the rim.
    const k1 = P(hx, RIM.Y - 0.04, BOARD_Z), k2 = P(hx, RIM.Y, RIM.Z + RIM.R);
    g.fillStyle = '#9aa0a8';
    g.fillRect(k2.x - 5, k2.y - 1, 10, k1.y - k2.y + 4);
    // A logo on the glass.
    const lg = P(hx, BOARD.Y1 - 0.12, BOARD_Z);
    g.globalAlpha = REDUCED ? 0.6 : 0.5 + 0.2 * Math.sin(now / 400);
    label(g, 'NYC', lg.x, lg.y, 11, '#ffd23f');
    g.globalAlpha = 1;
  };

  const drawNet = (hx: number, now: number) => {
    const sway = Math.sin(now / 70) * netKick * 0.05;
    const drop = netKick * 0.1;
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = 1.1;
    const N = 12;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const top = P(hx + Math.cos(a) * RIM.R, RIM.Y, RIM.Z + Math.sin(a) * RIM.R);
      const mid = P(hx + Math.cos(a + 0.26) * RIM.R * 0.8 + sway, RIM.Y - 0.22 - drop * 0.5, RIM.Z + Math.sin(a + 0.26) * RIM.R * 0.8);
      const bot = P(hx + Math.cos(a) * RIM.R * 0.55 + sway * 1.6, RIM.Y - 0.42 - drop, RIM.Z + Math.sin(a) * RIM.R * 0.55);
      const mid2 = P(hx + Math.cos(a - 0.26) * RIM.R * 0.8 + sway, RIM.Y - 0.22 - drop * 0.5, RIM.Z + Math.sin(a - 0.26) * RIM.R * 0.8);
      g.beginPath();
      g.moveTo(top.x, top.y);
      g.lineTo(mid.x, mid.y);
      g.lineTo(bot.x, bot.y);
      g.moveTo(top.x, top.y);
      g.lineTo(mid2.x, mid2.y);
      g.lineTo(bot.x, bot.y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,.5)';
    ringPts(hx + sway, 0, Math.PI * 2, RIM.Y - 0.22 - drop * 0.5, RIM.R * 0.8);
    g.stroke();
  };

  const rimColor = () => (rimFlash > 0 ? '#fff4d6' : fire ? '#ffb000' : '#ff5a1f');
  const drawRim = (hx: number, back: boolean) => {
    const j = rimJolt * Math.sin(t * 90) * 0.012;
    g.strokeStyle = rimColor();
    g.lineWidth = back ? 3 : 4.5;
    ringPts(hx, back ? 0 : Math.PI, back ? Math.PI : Math.PI * 2, RIM.Y, RIM.R, j);
    g.stroke();
    if (!back) {
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 1.2;
      ringPts(hx, Math.PI * 1.15, Math.PI * 1.6, RIM.Y + 0.008, RIM.R, j);
      g.stroke();
    }
  };

  const drawFlightBall = (f: Flight) => {
    const b = f.b;
    const p = P(b.x, b.y, b.z);
    // Fire trail.
    if (f.fire && f.trail.length > 2) {
      for (let i = 0; i + 1 < f.trail.length; i += 2) {
        const a = i / f.trail.length;
        g.fillStyle = `rgba(255,${120 + a * 100},0,${a * 0.35})`;
        g.beginPath();
        g.arc(f.trail[i], f.trail[i + 1], BALL_R * p.s * (0.3 + a * 0.6), 0, Math.PI * 2);
        g.fill();
      }
    }
    ballSprite(g, p.x, p.y, BALL_R * p.s, b.spin, f.money, f.fire);
  };

  const shadow = (x: number, y: number, z: number) => {
    const p = P(x, floorY(z), z);
    const hgt = Math.max(0, y - floorY(z));
    const r = BALL_R * p.s * (1 + hgt * 0.25);
    g.fillStyle = `rgba(0,0,0,${0.35 / (1 + hgt)})`;
    g.beginPath();
    g.ellipse(p.x, p.y, r, r * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  };

  const draw = (now: number, dt: number) => {
    g.drawImage(bg, 0, 0);
    // The crowd above, through the nets.
    for (const h of crowd) {
      const hop = REDUCED ? 0 : Math.abs(Math.sin(now / (fire || cheerT > 0 ? 110 : 380) + h.p)) * (fire || cheerT > 0 ? 6 : 1.5);
      g.fillStyle = h.c;
      g.beginPath();
      g.arc(h.x, h.y - hop, 8, 0, Math.PI * 2);
      g.fill();
      g.fillRect(h.x - 9, h.y - hop + 6, 18, 14);
    }
    // Marquee bulbs on the canopy edge.
    for (let k = 0; k < 24; k++) {
      const on = REDUCED ? k % 2 === 0 : (Math.floor(now / (fire ? 70 : 140)) + k) % 3 === 0;
      g.fillStyle = on ? (fire ? '#ff7a12' : '#ffd23f') : 'rgba(255,79,163,.45)';
      g.beginPath();
      g.arc(10 + k * 14.8, 60, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    const hx = hoopX(t);
    // Shadows of the balls on the ramp.
    for (const f of flights) shadow(f.b.x, f.b.y, f.b.z);
    // Balls that went over the glass (behind it).
    for (const f of flights) if (f.b.z > BOARD_Z) drawFlightBall(f);
    drawBoard(hx, now);
    drawRim(hx, true);
    // Inside the hoop / behind the front rim: drawn before the net and the front rim.
    const inside = (b: Ball) => b.z <= BOARD_Z && (b.inNet || (b.z > RIM.Z - RIM.R * 0.4 && b.y < RIM.Y + BALL_R * 1.3 && Math.abs(b.x - hx) < RIM.R + BALL_R));
    for (const f of flights) if (inside(f.b)) drawFlightBall(f);
    drawNet(hx, now);
    drawRim(hx, false);
    // Everything in front, far to near.
    const front = flights.filter((f) => f.b.z <= BOARD_Z && !inside(f.b)).sort((a, b) => b.b.z - a.b.z);
    for (const f of front) drawFlightBall(f);

    // The ball in your hands (rises from the rack on reload).
    if (!ended) {
      const ready = canShoot();
      const lift = ready ? 0 : clamp(reload / RELOAD, 0, 1) * 70;
      const p = P(handX, LAUNCH.Y, LAUNCH.Z);
      const money = isMoneyBall(n + 1);
      g.globalAlpha = ready ? 1 : 0.6;
      ballSprite(g, p.x, p.y + lift, BALL_R * p.s, 0.4, money, fire);
      g.globalAlpha = 1;
      if (n < 2 && ready && !holding) {
        const bob = REDUCED ? 0 : Math.sin(now / 200) * 5;
        g.globalAlpha = 0.85;
        emoji(g, '👆', p.x + 4, p.y + 44 + bob, 24);
        g.globalAlpha = 1;
        label(g, 'flick up at the hoop!', 180, 400 + bob * 0.4, 15, '#fff');
      }
    }

    // ------- scoreboard
    label(g, 'SCORE', 46, 14, 10, '#9aa0b8');
    label(g, String(score), 46, 36, 24, '#ffd23f');
    const l = left();
    const secsLeft = Math.ceil(l);
    const timeCol = ended ? '#9aa0b8' : bonusTime() ? (Math.floor(now / 250) % 2 && !REDUCED ? '#fff' : '#ff4fa3') : l < 15 ? '#ff9f1c' : '#7bd88f';
    label(g, `0:${String(Math.min(99, secsLeft)).padStart(2, '0')}`, 180, 28, 30, timeCol);
    if (bonusTime() && !ended) label(g, 'BONUS ×2', 180, 49, 10, '#ff4fa3');
    else label(g, `ROUND ${round}`, 180, 49, 10, '#9aa0b8');
    label(g, fire ? '🔥 ×2' : streak > 0 ? `${streak} IN A ROW` : 'STREAK', 314, 14, 10, fire ? '#ff7a12' : '#9aa0b8');
    for (let k = 0; k < FIRE_AT; k++) {
      g.fillStyle = fire ? '#ff7a12' : k < streak ? '#ffd23f' : 'rgba(255,255,255,.15)';
      g.beginPath();
      g.arc(296 + k * 18, 36, 6, 0, Math.PI * 2);
      g.fill();
    }

    // ------- the rack: this rack's five, used ones dim; the 💰 money ball last
    const rackStart = Math.floor(n / RACK) * RACK;
    for (let i = 0; i < RACK; i++) {
      const used = rackStart + i < n;
      g.globalAlpha = used ? 0.25 : 1;
      ballSprite(g, 22 + i * 25, 458, 10, 0.4, i === RACK - 1, false);
      g.globalAlpha = 1;
    }
    // ------- power gauge: where your last flick landed vs the sweet spot
    const tol = fire ? POWER_TOL_FIRE : POWER_TOL;
    const gx = (p: number) => GAUGE.x + clamp((p - 0.4) / 1.2, 0, 1) * GAUGE.w;
    label(g, 'POWER', GAUGE.x, GAUGE.y - 12, 10, '#cfd8dc', 'left');
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.fillRect(GAUGE.x, GAUGE.y, GAUGE.w, 9);
    g.fillStyle = fire ? '#ff9f1c' : '#7bd88f';
    g.fillRect(gx(1 - tol), GAUGE.y, gx(1 + tol) - gx(1 - tol), 9);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.font = '700 9px system-ui';
    g.textAlign = 'left';
    g.fillText('soft', GAUGE.x, GAUGE.y + 19);
    g.textAlign = 'right';
    g.fillText('hard', GAUGE.x + GAUGE.w, GAUGE.y + 19);
    if (lastPower >= 0) {
      g.globalAlpha = clamp(lastPowerT, 0.35, 1);
      const mx = gx(lastPower);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(mx, GAUGE.y + 2);
      g.lineTo(mx - 5, GAUGE.y - 6);
      g.lineTo(mx + 5, GAUGE.y - 6);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    }
    // ------- coaching after a miss
    if (hintT > 0 && !ended) {
      g.globalAlpha = clamp(hintT, 0, 1);
      label(g, hint, 180, 424, 13, '#ffd23f');
      g.globalAlpha = 1;
    }
    void dt;
  };

  // -------------------------------------------------------------- loop
  const step = (dt: number) => {
    const wasBonus = bonusOn;
    t += dt;
    reload = Math.max(0, reload - dt);
    hintT = Math.max(0, hintT - dt);
    lastPowerT = Math.max(0, lastPowerT - dt);
    rimFlash = Math.max(0, rimFlash - dt * 6);
    boardFlash = Math.max(0, boardFlash - dt * 3);
    netKick = Math.max(0, netKick - dt * 2.2);
    rimJolt = Math.max(0, rimJolt - dt * 5);
    cheerT = Math.max(0, cheerT - dt);
    if (keyHold) holdX = clamp(holdX + keyHold * dt * 0.8, -LAUNCH.XMAX, LAUNCH.XMAX);
    handX += (holdX - handX) * Math.min(1, dt * 20);
    // Rounds and bonus time.
    const r = hoopRound(t);
    if (r !== round && !ended) {
      round = r;
      fx.stamp(r === 2 ? 'ROUND 2 · MOVING HOOP' : 'ROUND 3 · FASTER!', '#36c5f0', 1.1);
      sfx.levelUp();
    }
    bonusOn = bonusTime() && t < end;
    if (bonusOn && !wasBonus && !ended) {
      fx.stamp('BONUS TIME ×2', '#ff4fa3', 1.1);
      sfx.chime();
    }
    // Physics.
    const subs = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / subs;
    for (const f of flights) {
      if (f.b.done) continue;
      for (let k = 0; k < subs; k++) hoopsStep(f.b, hoopX(t - dt + h * (k + 1)), h, events);
      if (f.fire) {
        const p = P(f.b.x, f.b.y, f.b.z);
        f.trail.push(p.x, p.y);
        if (f.trail.length > 24) f.trail.splice(0, 2);
      }
      for (const e of events) {
        const p = P(e.x, e.y, e.z);
        if (e.kind === 'rim') {
          rimFlash = 1;
          rimJolt = Math.min(1, e.power / 2);
          rimSound(e.power);
          fx.burst(p.x, p.y, { colors: ['#ffd23f', '#fff'], n: 4, size: 2, speed: 80, life: 0.25 });
          if (e.power > 2) fx.shake(2, 0.08);
        } else if (e.kind === 'board') {
          boardFlash = 1;
          boardSound(e.power);
          fx.shake(2.5, 0.08);
        } else if (e.kind === 'floor' && e.power > 1.5) {
          note(90, 0, 0.08, 'sine', Math.min(0.15, e.power * 0.03), 'sfx');
        }
      }
      events.length = 0;
      // Settled: through the net, or fallen well below the rim.
      if (!f.resolved && ((f.b.scored && f.b.y < RIM.Y - 0.25) || (!f.b.scored && f.b.vy < 0 && f.b.y < RIM.Y - 0.4) || f.b.done)) resolve(f);
    }
    for (let i = flights.length - 1; i >= 0; i--) if (flights[i].b.done && flights[i].resolved) flights.splice(i, 1);
    // The buzzer, and the end once the last ball lands.
    if (!ended && t >= end) {
      ended = true;
      holding = false;
      horn();
      fx.shake(4, 0.2);
      if (flights.some((f) => !f.resolved)) fx.pop(180, 300, 'still in the air…', '#fff', 16);
    }
    if (ended && !fin.ended && flights.every((f) => f.resolved)) {
      const pct = n ? Math.round((makes / n) * 100) : 0;
      const great = score >= 250, good = score >= 120;
      fx.stamp(great ? 'HALL OF FAME!' : good ? 'NICE SHOOTING!' : 'FINAL BUZZER', good ? '#ffd23f' : '#fff', 1.6);
      fx.pop(180, 330, `${makes}/${n} · ${pct}% · best streak ${best}`, '#fff', 15);
      if (good) {
        sfx.cheer();
        fx.burst(180, 160, { emoji: ['🎟️', '🏀', '✨'], n: REDUCED ? 8 : 20, size: 18, speed: 260 });
      }
      fin.end(score, 1900);
    }
  };

  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    if (!fx.frozen) step(dt);
    draw(now, dt);
    fx.end(g);
    hud(`🏀 ${score} · ⏱ ${Math.ceil(left())}s${fire ? ' · 🔥 on fire' : streak >= 2 ? ` · ${streak} in a row` : ''}`);
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
