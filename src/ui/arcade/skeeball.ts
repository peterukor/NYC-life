// =====================================================================
// 🎳 Coney Skee-Ball — the boardwalk classic.
//
// Touch the ball (it follows your finger left/right), then flick up:
// a faster flick rolls harder, the angle of the flick aims. The ball
// rolls up the lane, bounces off the side rails, hops the hump and
// lands in the rings (10–50) or a corner 💯. Too soft and it rolls
// back. Nine balls; 40+ in a row is a HOT STREAK bonus, and the last
// ball counts double. Keys: ← → to move, Space to roll (fixed power).
// =====================================================================

import { sfx } from '../audio.ts';
import { Fx } from '../juice.ts';
import { emoji, H, W, type Run } from '../arcade-games.ts';
import { clamp, finisher, keys, label, pointers, prerender, shinyBall } from './kit.ts';

const BALLS = 9;
const HUMP_Y = 250, NEAR_Y = 462;
const S1 = 1 / 2.2; // perspective scale at the far end of the lane
const persp = (z: number) => (1 / (1 + 1.2 * z) - S1) / (1 - S1); // 1 near … 0 at the hump
const laneY = (z: number) => HUMP_Y + (NEAR_Y - HUMP_Y) * persp(z);
const laneHW = (z: number) => 85 + 40 * persp(z);
const ballR = (z: number) => 8 + 7 * persp(z);
// The ring board: board px (bx -110…110, by 0…180 up from its foot).
const BOARD_Y = 232;
const boardX = (bpx: number) => 180 + bpx;
const boardY = (bpy: number) => BOARD_Y - bpy;
const RING_C = 100;
const RINGS = [
  { r: 16, v: 50, c: '#ff2e63' },
  { r: 32, v: 40, c: '#ff9f1c' },
  { r: 50, v: 30, c: '#ffd23f' },
  { r: 70, v: 20, c: '#2ec4b6' },
];
const POCKETS = [-84, 84];
const POCKET_Y = 160, POCKET_R = 15;

type Phase = 'aim' | 'roll' | 'back' | 'fly' | 'drop' | 'wait';

export const skeeball: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  let raf = 0, over = false, score = 0, ball = 1, streak = 0;
  let phase: Phase = 'aim';
  // Ball state.
  let u = 0, z = 0, vu = 0, vz = 0, hop = 0;
  let aimU = 0, holding = false, lastPower = -1, lastPowerAt = 0;
  // Flight: from (fx0, fy0) to (fx1, fy1) over flyT; then maybe a backstop bounce.
  let fx0 = 0, fy0 = 0, fx1 = 0, fy1 = 0, flyT = 0, flyDur = 0.42, flyH = 70;
  let bounceTo: { bpx: number; bpy: number } | null = null;
  let landBpx = 0, landBpy = 0, dropT = 0, dropV = 0, waitT = 0;
  const ringLit = [0, 0, 0, 0, 0, 0]; // 50,40,30,20,10,100
  // Flick samples (a small ring buffer, no per-move allocations).
  const SX = new Float32Array(8), SY = new Float32Array(8), ST = new Float64Array(8);
  let si = 0;
  const sample = (x: number, y: number) => {
    si = (si + 1) % 8;
    SX[si] = x;
    SY[si] = y;
    ST[si] = performance.now();
  };

  const roll = (power: number, ratio: number) => {
    phase = 'roll';
    u = aimU;
    z = 0;
    vz = 0.5 + power * 1.0;
    vu = vz * 1.7 * clamp(ratio, -0.9, 0.9) * 0.8;
    lastPower = power;
    lastPowerAt = performance.now();
    sfx.whoosh();
  };
  const offP = pointers(cv, {
    down: (t) => {
      if (phase !== 'aim') return;
      holding = true;
      si = 0;
      SX.fill(t.x);
      SY.fill(t.y);
      ST.fill(performance.now());
      aimU = clamp((t.x - 180) / 125, -0.8, 0.8);
    },
    move: (t) => {
      if (!holding || phase !== 'aim') return;
      sample(t.x, t.y);
      // Only follow the finger sideways while it's low on the lane.
      if (t.y > 360) aimU = clamp((t.x - 180) / 125, -0.8, 0.8);
    },
    up: (t) => {
      if (!holding || phase !== 'aim') return;
      holding = false;
      sample(t.x, t.y);
      // Velocity over the last ~90 ms.
      const now = performance.now();
      let j = si;
      for (let k = 0; k < 7; k++) {
        const p = (j + 7) % 8;
        if (now - ST[p] > 90) break;
        j = p;
      }
      const dtm = Math.max(16, now - ST[j]);
      const vx = ((SX[si] - SX[j]) / dtm) * 1000, vy = ((SY[si] - SY[j]) / dtm) * 1000;
      if (vy > -280 || t.y0 - t.y < 25) return; // not a flick up
      roll(clamp(-vy / 2000, 0.25, 1.3), vx / -vy);
    },
  });
  let keyHold = 0;
  const offK = keys(
    (k) => {
      if (k === 'ArrowLeft') keyHold = -1;
      if (k === 'ArrowRight') keyHold = 1;
      if ((k === ' ' || k === 'ArrowUp') && phase === 'aim') roll(0.7, 0);
    },
    (k) => (k === 'ArrowLeft' || k === 'ArrowRight') && (keyHold = 0),
  );

  const resolve = (bpx: number, bpy: number): { v: number; idx: number } => {
    for (const px of POCKETS) if (Math.hypot(bpx - px, bpy - POCKET_Y) < POCKET_R + 4) return { v: 100, idx: 5 };
    if (bpy < 0) return { v: 10, idx: 4 };
    const d = Math.hypot(bpx, bpy - RING_C);
    for (let i = 0; i < RINGS.length; i++) if (d < RINGS[i].r) return { v: RINGS[i].v, idx: i };
    return { v: 10, idx: 4 };
  };
  const scoreBall = (bpx: number, bpy: number) => {
    const { v, idx } = resolve(bpx, bpy);
    ringLit[idx] = 0.9;
    const last = ball === BALLS;
    if (v >= 40) streak++;
    else streak = 0;
    const bonus = streak >= 2 ? (streak - 1) * 10 : 0;
    const pts = (v + bonus) * (last ? 2 : 1);
    score += pts;
    const x = boardX(bpx), y = boardY(bpy);
    fx.pop(x, y - 16, `+${pts}`, v >= 100 ? '#ffd23f' : v >= 40 ? '#ff9f1c' : '#fff', v >= 100 ? 30 : v >= 40 ? 26 : 20);
    if (v === 100) {
      fx.stamp('💯 CORNER POCKET!', '#ffd23f', 1.1);
      fx.flash('#ffd23f', 0.3);
      fx.shake(10, 0.3);
      fx.stop(0.1);
      fx.burst(x, y, { emoji: ['🎟️', '✨', '💯'], n: 18, size: 18, speed: 260, up: true });
      sfx.jackpot();
    } else if (v === 50) {
      fx.stamp('BULLSEYE!', '#ff2e63', 0.9);
      fx.shake(7, 0.2);
      fx.burst(x, y, { emoji: ['✨', '🎟️'], n: 12, size: 16, speed: 220, up: true });
      sfx.win();
    } else if (v >= 30) {
      fx.burst(x, y, { colors: ['#ffd23f', '#fff', '#ff9f1c'], n: 12, size: 4, speed: 160 });
      sfx.note(523 + v * 6);
    } else {
      fx.burst(x, y, { colors: ['#aaa', '#fff'], n: 6, size: 3, speed: 90 });
      sfx.tap();
    }
    if (streak >= 2) fx.pop(180, 250, `🔥 HOT STREAK ×${streak}`, '#ff6a00', 18);
  };
  const nextBall = () => {
    ball++;
    if (ball > BALLS) {
      phase = 'wait';
      fx.stamp(score >= 400 ? 'BOARDWALK LEGEND!' : score >= 250 ? 'NICE ROLLING!' : 'GAME OVER', score >= 250 ? '#ffd23f' : '#fff', 1.4);
      if (score >= 250) (sfx.cheer(), fx.burst(180, 140, { emoji: ['🎟️', '🎡', '✨'], n: 20, size: 18, speed: 260 }));
      fin.end(score, 1600);
      return;
    }
    phase = 'aim';
    u = aimU = 0;
    z = 0;
    hop = 0;
    if (ball === BALLS) fx.stamp('LAST BALL ×2!', '#ff4fa3', 1);
  };

  // ---------------------------------------------------- static scenery
  const scene = prerender(W, H, (c) => {
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1d1145');
    sky.addColorStop(0.35, '#7a2b6e');
    sky.addColorStop(0.55, '#ff7b54');
    sky.addColorStop(1, '#ffb26b');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    // The sea and the boardwalk.
    c.fillStyle = '#2a4a7a';
    c.fillRect(0, 236, W, 30);
    c.fillStyle = 'rgba(255,255,255,.25)';
    for (let i = 0; i < 12; i++) c.fillRect(i * 32 + (i % 2) * 10, 244 + (i % 3) * 6, 14, 2);
    c.fillStyle = '#6b4226';
    c.fillRect(0, 262, W, H - 262);
    // The lane: wooden planks in perspective.
    const lane = c.createLinearGradient(0, HUMP_Y, 0, NEAR_Y);
    lane.addColorStop(0, '#b77b44');
    lane.addColorStop(1, '#e3a964');
    c.fillStyle = lane;
    c.beginPath();
    c.moveTo(180 - laneHW(1), HUMP_Y);
    c.lineTo(180 + laneHW(1), HUMP_Y);
    c.lineTo(180 + laneHW(0), NEAR_Y + 18);
    c.lineTo(180 - laneHW(0), NEAR_Y + 18);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(80,40,10,.35)';
    c.lineWidth = 1;
    for (let k = -4; k <= 4; k++) {
      c.beginPath();
      c.moveTo(180 + (k / 5) * laneHW(1), HUMP_Y);
      c.lineTo(180 + (k / 5) * laneHW(0), NEAR_Y + 18);
      c.stroke();
    }
    for (let z = 0.1; z < 1; z += 0.15) {
      c.beginPath();
      c.moveTo(180 - laneHW(z), laneY(z));
      c.lineTo(180 + laneHW(z), laneY(z));
      c.stroke();
    }
    // The hump.
    const hump = c.createLinearGradient(0, HUMP_Y - 4, 0, HUMP_Y + 16);
    hump.addColorStop(0, '#fff3');
    hump.addColorStop(0.5, '#8a5a2b');
    hump.addColorStop(1, '#c48a50');
    c.fillStyle = hump;
    c.beginPath();
    c.moveTo(180 - laneHW(0.96), laneY(0.96));
    c.quadraticCurveTo(180, HUMP_Y - 10, 180 + laneHW(0.96), laneY(0.96));
    c.lineTo(180 + laneHW(1), HUMP_Y);
    c.lineTo(180 - laneHW(1), HUMP_Y);
    c.closePath();
    c.fill();
    // Side rails.
    c.strokeStyle = '#3b1e0c';
    c.lineWidth = 8;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(180 + s * (laneHW(1) + 4), HUMP_Y - 4);
      c.lineTo(180 + s * (laneHW(0) + 6), NEAR_Y + 18);
      c.stroke();
    }
    // The ring board.
    c.fillStyle = '#123524';
    c.beginPath();
    c.moveTo(boardX(-118), boardY(-6));
    c.lineTo(boardX(118), boardY(-6));
    c.lineTo(boardX(110), boardY(186));
    c.lineTo(boardX(-110), boardY(186));
    c.closePath();
    c.fill();
    c.strokeStyle = '#ffd23f';
    c.lineWidth = 3;
    c.stroke();
    for (let i = RINGS.length - 1; i >= 0; i--) {
      const r = RINGS[i];
      c.fillStyle = i % 2 ? '#1c4a33' : '#0d2a1c';
      c.beginPath();
      c.arc(boardX(0), boardY(RING_C), r.r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = r.c;
      c.lineWidth = 3;
      c.shadowColor = r.c;
      c.shadowBlur = 8;
      c.stroke();
      c.shadowBlur = 0;
    }
    c.fillStyle = '#000';
    c.beginPath();
    c.arc(boardX(0), boardY(RING_C), 9, 0, Math.PI * 2);
    c.fill();
    c.font = `900 11px "Arial Black", system-ui`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 1; i < RINGS.length; i++) {
      c.fillStyle = RINGS[i].c;
      c.fillText(String(RINGS[i].v), boardX(0), boardY(RING_C) - (RINGS[i].r + RINGS[i - 1].r) / 2);
    }
    c.fillStyle = '#ff2e63';
    c.fillText('50', boardX(0), boardY(RING_C) + 0.5);
    c.fillStyle = '#fff';
    c.fillText('10', boardX(0), boardY(12));
    for (const px of POCKETS) {
      c.fillStyle = '#000';
      c.beginPath();
      c.arc(boardX(px), boardY(POCKET_Y), POCKET_R, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#ffd23f';
      c.lineWidth = 3;
      c.shadowColor = '#ffd23f';
      c.shadowBlur = 10;
      c.stroke();
      c.shadowBlur = 0;
      c.fillStyle = '#ffd23f';
      c.fillText('100', boardX(px), boardY(POCKET_Y) + 24);
    }
    // The 10 trough.
    c.fillStyle = '#05140c';
    c.fillRect(boardX(-110), boardY(4), 220, 8);
  });

  // Wonder Wheel spokes (rotating), computed per frame without allocation.
  const wheel = (now: number) => {
    const cx = 34, cy = 120, r = 44, a0 = now / 4000;
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = a0 + (i / 12) * Math.PI * 2;
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = a0 + (i / 12) * Math.PI * 2;
      g.fillStyle = i % 3 === 0 ? '#ff4fa3' : i % 3 === 1 ? '#ffd23f' : '#36c5f0';
      g.fillRect(cx + Math.cos(a) * r - 3, cy + Math.sin(a) * r, 6, 6);
    }
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.beginPath();
    g.moveTo(cx - 20, 236);
    g.lineTo(cx, cy);
    g.lineTo(cx + 20, 236);
    g.stroke();
  };

  const draw = (now: number, dt: number) => {
    g.drawImage(scene, 0, 0);
    wheel(now);
    // The Cyclone on the right.
    g.strokeStyle = 'rgba(255,255,255,.3)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(300, 236);
    g.quadraticCurveTo(320, 60, 345, 150);
    g.quadraticCurveTo(352, 190, 360, 120);
    g.stroke();
    // Marquee.
    for (let k = 0; k < 24; k++) {
      g.fillStyle = (Math.floor(now / 110) + k) % 3 === 0 ? '#ffd23f' : 'rgba(255,79,163,.6)';
      g.beginPath();
      g.arc(12 + k * 14.5, 8, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    label(g, 'CONEY SKEE-BALL', 180, 28, 20, '#ffd23f');
    // Ring flashes.
    for (let i = 0; i < 6; i++) {
      if (ringLit[i] <= 0) continue;
      ringLit[i] -= dt;
      const on = Math.floor(ringLit[i] * 12) % 2 === 0;
      if (!on) continue;
      g.strokeStyle = '#fff';
      g.lineWidth = 5;
      g.beginPath();
      if (i === 5) for (const px of POCKETS) (g.moveTo(boardX(px) + POCKET_R + 2, boardY(POCKET_Y)), g.arc(boardX(px), boardY(POCKET_Y), POCKET_R + 2, 0, Math.PI * 2));
      else if (i === 4) g.rect(boardX(-110), boardY(4), 220, 8);
      else g.arc(boardX(0), boardY(RING_C), RINGS[i].r, 0, Math.PI * 2);
      g.stroke();
    }
    // Rail lights chase up the lane.
    for (let k = 0; k < 10; k++) {
      const zz = ((k / 10 + now / 1500) % 1);
      const y = laneY(zz);
      g.fillStyle = k % 2 ? '#ffd23f' : '#ff4fa3';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(180 + s * (laneHW(zz) + 5), y, 2 + persp(zz) * 1.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    // The ball.
    if (phase === 'aim' || phase === 'roll' || phase === 'back') {
      const x = 180 + u * laneHW(z), y = laneY(z) - hop, r = ballR(z);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.ellipse(x, laneY(z) + r * 0.7, r, r * 0.35, 0, 0, Math.PI * 2);
      g.fill();
      shinyBall(g, x, y - r * 0.4, r, '#3a7bd5');
      if (phase === 'aim') {
        const bob = Math.sin(now / 200) * 4;
        g.globalAlpha = 0.75;
        emoji(g, '👆', x, y + 26 + bob, 22);
        g.globalAlpha = 1;
        if (!holding) label(g, 'flick up!', x, y - 40 + bob * 0.5, 16, '#fff');
      }
    } else if (phase === 'fly' || phase === 'drop') {
      let x: number, y: number, r: number;
      if (phase === 'fly') {
        const f = Math.min(1, flyT / flyDur);
        x = fx0 + (fx1 - fx0) * f;
        y = fy0 + (fy1 - fy0) * f - Math.sin(f * Math.PI) * flyH;
        r = 8 - f * 1.5;
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.beginPath();
        g.ellipse(x, fy0 + (fy1 - fy0) * f + 4, r, r * 0.35, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        x = boardX(landBpx);
        y = boardY(landBpy) + dropV;
        r = 6.5 * Math.max(0, 1 - dropT / 0.35);
      }
      if (r > 0.5) shinyBall(g, x, y, r, '#3a7bd5');
    }
    // Balls left on the return.
    for (let i = 0; i < BALLS - ball; i++) shinyBall(g, 342, 470 - i * 13, 5.5, '#3a7bd5');
    // The last flick's power (so you can learn the lane).
    if (lastPower >= 0 && now - lastPowerAt < 2500) {
      const a = Math.min(1, (2500 - (now - lastPowerAt)) / 500);
      g.globalAlpha = a;
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(12, 300, 14, 130);
      const f = clamp(lastPower / 1.3, 0, 1);
      g.fillStyle = f > 0.85 ? '#e0283f' : f > 0.45 ? '#7bd88f' : '#ffd23f';
      g.fillRect(12, 430 - f * 130, 14, f * 130);
      g.fillStyle = '#fff';
      g.fillRect(8, 430 - (0.7 / 1.3) * 130, 22, 2); // the bullseye flick
      g.globalAlpha = 1;
    }
    if (streak >= 2) label(g, `🔥×${streak}`, 330, 260, 16, '#ff6a00');
  };

  // -------------------------------------------------------------- loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    if (!fx.frozen) {
      if (phase === 'aim' && keyHold) aimU = clamp(aimU + keyHold * dt * 1.4, -0.8, 0.8);
      if (phase === 'aim') u += (aimU - u) * Math.min(1, dt * 18);
      if (phase === 'roll') {
        z += vz * dt;
        vz -= 0.18 * dt;
        u += vu * dt;
        if (Math.abs(u) > 0.93) {
          u = Math.sign(u) * 0.93;
          vu = -vu * 0.55;
          vz *= 0.94;
          sfx.tick();
          fx.burst(180 + u * laneHW(z), laneY(z), { colors: ['#ffd23f', '#fff'], n: 5, size: 3, speed: 90, life: 0.3 });
          fx.shake(2, 0.08);
        }
        hop = z > 0.88 ? Math.sin(((z - 0.88) / 0.12) * Math.PI) * 10 : 0;
        if (vz <= 0) {
          phase = 'back';
          fx.pop(180, laneY(z) - 20, 'TOO SOFT!', '#e0283f', 20);
          sfx.bad();
        } else if (z >= 1) {
          // Off the hump and into the air.
          const s = vz;
          const bpx = clamp(u * 1.05, -1, 1) * 110;
          const bpy = (s - 0.45) * 0.95 * 180 + (Math.random() - 0.5) * 5;
          fx0 = 180 + u * laneHW(1);
          fy0 = HUMP_Y - 8;
          flyT = 0;
          fx.burst(fx0, fy0 + 6, { colors: ['#fff'], n: 4, size: 2, speed: 60, life: 0.25 });
          sfx.tick();
          if (bpy > 180) {
            // Over the top: off the backstop and down.
            fx1 = boardX(bpx);
            fy1 = boardY(184);
            bounceTo = { bpx: clamp(bpx + (Math.random() - 0.5) * 20, -105, 105), bpy: 168 - Math.random() * 30 };
            flyDur = 0.42;
            flyH = 50;
          } else {
            const by = Math.max(-8, bpy);
            fx1 = boardX(bpx);
            fy1 = boardY(by);
            bounceTo = null;
            landBpx = bpx;
            landBpy = by;
            flyDur = 0.3 + clamp(by / 180, 0, 1) * 0.16;
            flyH = 30 + clamp(by / 180, 0, 1) * 50;
          }
          phase = 'fly';
        }
      } else if (phase === 'back') {
        z += vz * dt;
        vz -= 0.6 * dt;
        u += vu * dt * 0.3;
        if (z <= 0) {
          streak = 0;
          nextBall();
        }
      } else if (phase === 'fly') {
        flyT += dt;
        if (flyT >= flyDur) {
          if (bounceTo) {
            sfx.punch();
            fx.shake(4, 0.12);
            fx.pop(fx1, fy1 - 6, 'BONK', '#fff', 14);
            fx0 = fx1;
            fy0 = fy1;
            landBpx = bounceTo.bpx;
            landBpy = bounceTo.bpy;
            fx1 = boardX(landBpx);
            fy1 = boardY(landBpy);
            flyT = 0;
            flyDur = 0.22;
            flyH = 10;
            bounceTo = null;
          } else {
            phase = 'drop';
            dropT = 0;
            dropV = 0;
            const r = resolve(landBpx, landBpy);
            // A ball that lands in no ring rolls down into the 10 trough.
            if (r.v === 10) landBpy = Math.max(landBpy, 6);
            scoreBall(landBpx, landBpy);
          }
        }
      } else if (phase === 'drop') {
        dropT += dt;
        const r = resolve(landBpx, landBpy);
        if (r.v === 10 && landBpy > 6) {
          landBpy = Math.max(6, landBpy - 220 * dt);
          dropT = Math.min(dropT, 0.05);
        }
        if (dropT > 0.55) {
          phase = 'wait';
          waitT = 0.25;
        }
      } else if (phase === 'wait' && !fin.ended) {
        waitT -= dt;
        if (waitT <= 0) nextBall();
      }
    }
    draw(now, dt);
    fx.end(g);
    hud(`🎳 ${score} · ball ${Math.min(ball, BALLS)}/${BALLS}${streak >= 2 ? ` · 🔥${streak}` : ''}`);
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
