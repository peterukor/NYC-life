// =====================================================================
// 🗽 Liberty Pinball — a real little pinball table.
//
// Hold the plunger (press and hold anywhere, release to fire), then tap
// or hold the left / right half of the screen for the flippers (keys:
// ← → or Z / M, Space for the plunger).
//   🗽 Liberty bumper + 🍎 Big Apple bumpers pop the ball away.
//   🚕 T-A-X-I top lanes: light all four for a bigger multiplier
//      (the flippers shift the lit lanes, like a real table).
//   🚇 Subway ramp up the left side: a ride over the table, ramp
//      chains score more, and in multiball it's a JACKPOT.
//   🎯 Three drop targets on the right: drop them all for MULTIBALL.
// Three balls, a ball save for the first seconds of each.
// =====================================================================

import { sfx } from '../audio.ts';
import { Combo, Fx } from '../juice.ts';
import { emoji, H, W, type Run } from '../arcade-games.ts';
import { finisher, keys, label, num, pointers, prerender, shinyBall } from './kit.ts';

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** >0: a slingshot face that kicks the ball. */
  kick: number;
  e: number;
}
interface Bumper {
  x: number;
  y: number;
  r: number;
  pts: number;
  e: string;
  lit: number;
}
interface Flip {
  px: number;
  py: number;
  side: 1 | -1;
  ang: number;
  av: number;
  held: boolean;
}
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** -1, or 0..1 along the subway ramp. */
  ramp: number;
  saveUntil: number;
  still: number;
  tx: Float32Array;
  ty: Float32Array;
  ti: number;
}

const R = 7, GRAV = 950, SUB = 8, LEN = 50, REST = 0.52, TOP = -0.45, MAXV = 1500;
const LANE_X = 336, LANE_Y = 459;
const LANES = ['T', 'A', 'X', 'I'];
const laneX = (i: number) => 135 + i * 30;
const mx = (x: number) => 332 - x; // mirror across the playfield centre

// The subway ramp: a cubic bezier from the left lane over the table to the right inlane.
const RP = [29, 180, 18, 18, 322, 6, 300, 330];
function rampAt(t: number, out: { x: number; y: number }): void {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  out.x = a * RP[0] + b * RP[2] + c * RP[4] + d * RP[6];
  out.y = a * RP[1] + b * RP[3] + c * RP[5] + d * RP[7];
}

export const pinball: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const bumperChain = new Combo(1.4);
  const walls: Seg[] = [];
  const seg = (ax: number, ay: number, bx: number, by: number, kick = 0, e = 0.45) => walls.push({ ax, ay, bx, by, kick, e });
  // The top arch.
  const arch: number[] = [10, 130];
  for (let i = 1; i <= 28; i++) {
    const a = Math.PI * (1 - i / 28);
    arch.push(180 + 170 * Math.cos(a), 130 - 110 * Math.sin(a));
  }
  for (let i = 0; i < arch.length - 2; i += 2) seg(arch[i], arch[i + 1], arch[i + 2], arch[i + 3], 0, 0.35);
  seg(10, 130, 10, 350); // left wall
  seg(10, 350, 100, 425); // left inlane guide
  seg(322, 140, 322, 480); // plunger lane separator
  seg(322, 350, 232, 425); // right inlane guide
  seg(350, 130, 350, 480); // outer wall
  seg(322, 466, 350, 466, 0, 0.15); // plunger tip
  seg(48, 170, 48, 260); // subway lane divider
  for (let i = 0; i < 5; i++) seg(120 + i * 30, 60, 120 + i * 30, 88, 0, 0.3); // top lane posts
  // Slingshots (the long face kicks).
  const slings: Seg[] = [];
  for (const s of [1, -1]) {
    const X = (x: number) => (s === 1 ? x : mx(x));
    seg(X(42), 290, X(42), 352);
    seg(X(42), 352, X(74), 378);
    seg(X(42), 290, X(74), 378, 1, 0.5);
    slings.push(walls[walls.length - 1]);
  }
  const slingLit = [0, 0];
  // One-way gate at the top of the plunger lane (lets balls out, not back in).
  const GATE = { ax: 322, ay: 140, bx: 350, by: 118, kick: 0, e: 0.2 };

  const bumpers: Bumper[] = [
    { x: 120, y: 152, r: 16, pts: 100, e: '🍎', lit: 0 },
    { x: 212, y: 152, r: 16, pts: 100, e: '🍎', lit: 0 },
    { x: 166, y: 218, r: 23, pts: 300, e: '🗽', lit: 0 },
  ];
  const targets = [190, 218, 246].map((y) => ({ y, down: false, lit: 0 }));
  let targetsResetAt = 0;
  const flips: Flip[] = [
    { px: 100, py: 425, side: 1, ang: REST, av: 0, held: false },
    { px: 232, py: 425, side: -1, ang: REST, av: 0, held: false },
  ];
  const lit = [false, false, false, false];

  const balls: Ball[] = [];
  const newBall = (x: number, y: number, vy = 0): Ball => {
    const b: Ball = { x, y, vx: 0, vy, ramp: -1, saveUntil: 0, still: 0, tx: new Float32Array(6).fill(x), ty: new Float32Array(6).fill(y), ti: 0 };
    balls.push(b);
    return b;
  };
  newBall(LANE_X, LANE_Y);

  let score = 0, mult = 1, ballNo = 1, rampChain = 0, lastRamp = 0, raf = 0, over = false;
  let charge = 0, charging = false;
  let pendingMulti = 0, nextMultiAt = 0;
  let left = 0, right = 0; // how many touches hold each side
  const sides = new Map<number, 0 | 1>();
  const tmp = { x: 0, y: 0 };

  const add = (pts: number, x: number, y: number, color = '#fff', size = 18) => {
    const p = pts * mult;
    score += p;
    fx.pop(x, y, `+${num(p)}`, color, size);
  };
  const inLane = (b: Ball) => b.x > 322 && b.y > 420;
  const flipPress = (i: 0 | 1, on: boolean) => {
    const f = flips[i];
    if (on && !f.held) {
      sfx.tick();
      // Lane change: the lit top lanes shift with the flipper.
      if (i === 0) lit.push(lit.shift()!);
      else lit.unshift(lit.pop()!);
    }
    f.held = on;
  };
  const startCharge = () => {
    if (balls.some((b) => inLane(b) && b.ramp < 0)) charging = true;
  };
  const launch = () => {
    if (!charging) return;
    charging = false;
    const b = balls.find((x) => inLane(x));
    if (!b) return (charge = 0);
    b.vy = -(950 + 560 * charge);
    b.saveUntil = performance.now() + 8000;
    sfx.whoosh();
    if (charge > 0.92) {
      fx.pop(LANE_X - 20, 400, 'FULL SEND', '#ffd23f', 16);
      score += 500;
    }
    charge = 0;
  };

  const offP = pointers(cv, {
    down: (t) => {
      const s: 0 | 1 = t.x < W / 2 ? 0 : 1;
      sides.set(t.id, s);
      if (s === 0) left++;
      else right++;
      flipPress(s, true);
      startCharge();
    },
    up: (t) => {
      const s = sides.get(t.id);
      sides.delete(t.id);
      if (s === 0) left = Math.max(0, left - 1);
      if (s === 1) right = Math.max(0, right - 1);
      if (s === 0 && !left) flipPress(0, false);
      if (s === 1 && !right) flipPress(1, false);
      if (!sides.size) launch();
    },
  });
  const offK = keys(
    (k) => {
      if (k === 'ArrowLeft' || k === 'z' || k === 'Z' || k === 'Shift') flipPress(0, true);
      if (k === 'ArrowRight' || k === 'm' || k === 'M' || k === '/') flipPress(1, true);
      if (k === ' ' || k === 'ArrowDown') startCharge();
    },
    (k) => {
      if (k === 'ArrowLeft' || k === 'z' || k === 'Z' || k === 'Shift') flipPress(0, false);
      if (k === 'ArrowRight' || k === 'm' || k === 'M' || k === '/') flipPress(1, false);
      if (k === ' ' || k === 'ArrowDown') launch();
    },
  );

  // ------------------------------------------------------------ physics
  /** Ball vs a wall segment (a capsule of the ball's radius). Returns the impact speed, or -1. */
  const hitSeg = (b: Ball, s: Seg): number => {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    let t = ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / (dx * dx + dy * dy);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.ax + dx * t, py = s.ay + dy * t;
    let nx = b.x - px, ny = b.y - py;
    const d2 = nx * nx + ny * ny;
    if (d2 >= R * R || d2 === 0) return -1;
    const d = Math.sqrt(d2);
    nx /= d;
    ny /= d;
    b.x = px + nx * R;
    b.y = py + ny * R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return 0;
    b.vx -= (1 + s.e) * vn * nx;
    b.vy -= (1 + s.e) * vn * ny;
    if (s.kick && -vn > 60) {
      b.vx += nx * 380;
      b.vy += ny * 380;
    }
    return -vn;
  };
  const hitFlip = (b: Ball, f: Flip): void => {
    const c = Math.cos(f.ang), sn = Math.sin(f.ang);
    const tx = f.px + f.side * c * LEN, ty = f.py + sn * LEN;
    const dx = tx - f.px, dy = ty - f.py;
    let t = ((b.x - f.px) * dx + (b.y - f.py) * dy) / (LEN * LEN);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = f.px + dx * t, py = f.py + dy * t;
    const rad = R + 7 - t * 3; // tapers toward the tip
    let nx = b.x - px, ny = b.y - py;
    const d2 = nx * nx + ny * ny;
    if (d2 >= rad * rad || d2 === 0) return;
    const d = Math.sqrt(d2);
    nx /= d;
    ny /= d;
    b.x = px + nx * rad;
    b.y = py + ny * rad;
    const om = f.side === 1 ? f.av : -f.av;
    const rx = px - f.px, ry = py - f.py;
    const svx = -om * ry, svy = om * rx;
    const rel = (b.vx - svx) * nx + (b.vy - svy) * ny;
    if (rel < 0) {
      b.vx -= 1.3 * rel * nx;
      b.vy -= 1.3 * rel * ny;
      if (-rel > 500) sfx.tick();
    }
  };

  const step = (h: number, now: number) => {
    for (const f of flips) {
      const target = f.held ? TOP : REST;
      const prev = f.ang;
      if (f.ang > target) f.ang = Math.max(target, f.ang - 32 * h);
      else f.ang = Math.min(target, f.ang + 16 * h);
      f.av = (f.ang - prev) / h;
    }
    for (const b of balls) {
      if (b.ramp >= 0) continue;
      const py = b.y;
      b.vy += GRAV * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      for (let i = 0; i < walls.length; i++) {
        const s = walls[i];
        const v = hitSeg(b, s);
        if (v > 0 && s.kick) {
          const k = s === slings[0] ? 0 : 1;
          if (v > 60) {
            slingLit[k] = 0.15;
            add(50, b.x, b.y - 12, '#7bd88f', 14);
            sfx.punch();
          }
        } else if (v > 260) fx.burst(b.x, b.y, { colors: ['#9ef'], n: 2, size: 2, speed: 60, life: 0.25 });
      }
      if (b.vy > 0 && b.y < 150 && b.x > 318) hitSeg(b, GATE);
      for (const bp of bumpers) {
        const dx = b.x - bp.x, dy = b.y - bp.y;
        const rr = bp.r + R;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0) {
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          b.x = bp.x + nx * rr;
          b.y = bp.y + ny * rr;
          const vn = b.vx * nx + b.vy * ny;
          b.vx -= vn * nx;
          b.vy -= vn * ny;
          const kick = Math.max(560, Math.abs(vn) * 0.9);
          b.vx += nx * kick;
          b.vy += ny * kick;
          if (bp.lit < 0.06) {
            bp.lit = 0.18;
            const n = bumperChain.hit(now);
            add(bp.pts, bp.x, bp.y - bp.r - 8, bp.e === '🗽' ? '#7bd88f' : '#ff6b6b', bp.e === '🗽' ? 22 : 18);
            fx.burst(b.x, b.y, { colors: bp.e === '🗽' ? ['#7bd88f', '#c8ffd4', '#fff'] : ['#ff4d4d', '#ffd23f', '#fff'], n: 10, size: 4, speed: 220, life: 0.4 });
            fx.shake(bp.e === '🗽' ? 4 : 2.5, 0.1);
            sfx.note(bp.e === '🗽' ? 392 : 523 + Math.min(n, 10) * 40);
            if (n > 0 && n % 6 === 0) {
              score += 2000 * mult;
              fx.stamp(`POP POP ×${n}!`, '#ff4fa3', 0.7);
            }
          }
        }
      }
      for (const t of targets) {
        if (t.down) continue;
        if (b.x + R > 314 && b.x < 322 && b.y > t.y - 4 && b.y < t.y + 24) {
          b.x = 314 - R;
          if (b.vx > 0) b.vx = -b.vx * 0.6;
          t.down = true;
          t.lit = 0.3;
          add(750, 300, t.y, '#36c5f0', 16);
          sfx.punch();
          fx.shake(4, 0.12);
          if (targets.every((x) => x.down)) {
            targetsResetAt = now + 2500;
            if (balls.length === 1) {
              fx.stamp('🎯 MULTIBALL! 🎯', '#36c5f0', 1.3);
              fx.flash('#36c5f0', 0.35);
              fx.stop(0.12);
              sfx.jackpot();
              pendingMulti = 2;
              nextMultiAt = now + 400;
              add(5000, 166, 280, '#36c5f0', 26);
            } else {
              add(10000, 166, 280, '#ffd23f', 26);
              fx.stamp('SUPER JACKPOT', '#ffd23f', 1);
              sfx.jackpot();
            }
          }
        }
      }
      for (const f of flips) hitFlip(b, f);
      // Top lanes: crossing y=74 inside a lane lights it.
      if ((py < 74) !== (b.y < 74) && b.y < 100) {
        for (let i = 0; i < 4; i++) {
          if (Math.abs(b.x - laneX(i)) < 13 && !lit[i]) {
            lit[i] = true;
            add(500, laneX(i), 100, '#ffd23f', 16);
            sfx.chime();
            if (lit.every(Boolean)) {
              lit.fill(false);
              mult = Math.min(5, mult + 1);
              fx.stamp(`🚕 TAXI! ×${mult}`, '#ffd23f', 1.1);
              fx.flash('#ffd23f', 0.25);
              sfx.levelUp();
            }
          }
        }
      }
      // The subway ramp: a ball heading up the left lane gets taken for a ride.
      if (b.x < 46 && b.y < 186 && b.y > 150 && b.vy < -150) {
        b.ramp = 0;
        const chain = now - lastRamp < 8000 ? Math.min(4, rampChain + 1) : 1;
        rampChain = chain;
        lastRamp = now;
        sfx.whoosh();
      }
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > MAXV * MAXV) {
        const k = MAXV / Math.sqrt(sp2);
        b.vx *= k;
        b.vy *= k;
      }
    }
  };

  const rampEnd = (b: Ball) => {
    b.ramp = -1;
    b.x = RP[6];
    b.y = RP[7];
    b.vx = -90;
    b.vy = 140;
    const multi = balls.length > 1;
    const pts = (multi ? 10000 : 2500) * rampChain;
    add(pts, 260, 300, multi ? '#ffd23f' : '#ff9f1c', 24);
    fx.stamp(multi ? '🚇 JACKPOT! 🚇' : rampChain > 1 ? `🚇 EXPRESS ×${rampChain}!` : '🚇 SUBWAY RAMP!', multi ? '#ffd23f' : '#ff9f1c', 0.9);
    fx.burst(b.x, b.y, { emoji: ['✨', '🚇'], n: 8, size: 14, speed: 160 });
    fx.shake(6, 0.2);
    if (multi) (fx.flash('#ffd23f', 0.3), sfx.jackpot());
    else sfx.win();
  };

  // ----------------------------------------------------------- drawing
  const table = prerender(W, H, (c) => {
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b0730');
    bg.addColorStop(0.55, '#1a0f4a');
    bg.addColorStop(1, '#2a0e3d');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    // The skyline inside the arch, lit windows.
    c.save();
    c.beginPath();
    c.moveTo(arch[0], arch[1]);
    for (let i = 2; i < arch.length; i += 2) c.lineTo(arch[i], arch[i + 1]);
    c.closePath();
    c.clip();
    const sky = c.createLinearGradient(0, 20, 0, 140);
    sky.addColorStop(0, '#2b1b6b');
    sky.addColorStop(1, '#ff4fa355');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, 140);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let x = 14; x < 350; ) {
      const w = 14 + rnd() * 22, h = 20 + rnd() * 70;
      c.fillStyle = '#120a33';
      c.fillRect(x, 140 - h, w, h);
      c.fillStyle = 'rgba(255,214,90,.55)';
      for (let wy = 140 - h + 5; wy < 136; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (rnd() < 0.35) c.fillRect(wx, wy, 2, 3);
      x += w + 1;
    }
    // Empire State spire.
    c.fillStyle = '#120a33';
    c.fillRect(250, 40, 18, 100);
    c.fillRect(255, 22, 8, 20);
    c.fillRect(258, 8, 2, 16);
    c.restore();
    // The Liberty glow and a starburst under the bumpers.
    const glow = c.createRadialGradient(166, 218, 10, 166, 218, 120);
    glow.addColorStop(0, 'rgba(123,216,143,.35)');
    glow.addColorStop(1, 'rgba(123,216,143,0)');
    c.fillStyle = glow;
    c.fillRect(40, 100, 260, 240);
    c.strokeStyle = 'rgba(255,255,255,.05)';
    c.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      c.beginPath();
      c.moveTo(166, 218);
      c.lineTo(166 + Math.cos(a) * 140, 218 + Math.sin(a) * 140);
      c.stroke();
    }
    // Inlane arrows.
    c.fillStyle = 'rgba(255,210,63,.35)';
    for (const [x, y] of [[70, 300], [262, 300], [29, 230]] as const) {
      c.beginPath();
      c.moveTo(x, y - 12);
      c.lineTo(x + 7, y);
      c.lineTo(x - 7, y);
      c.closePath();
      c.fill();
    }
    // Plunger lane.
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.fillRect(322, 140, 28, 340);
    // Aprons below the guides.
    c.fillStyle = '#16102e';
    c.beginPath();
    c.moveTo(10, 350);
    c.lineTo(100, 425);
    c.lineTo(100, 480);
    c.lineTo(0, 480);
    c.lineTo(0, 350);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(322, 350);
    c.lineTo(232, 425);
    c.lineTo(232, 480);
    c.lineTo(322, 480);
    c.closePath();
    c.fill();
    // Neon walls.
    c.lineCap = 'round';
    c.shadowColor = '#36c5f0';
    c.shadowBlur = 10;
    c.strokeStyle = '#36c5f0';
    c.lineWidth = 3;
    for (const s of walls) {
      if (s.kick) continue;
      c.beginPath();
      c.moveTo(s.ax, s.ay);
      c.lineTo(s.bx, s.by);
      c.stroke();
    }
    c.shadowBlur = 0;
    // Sling bodies.
    c.fillStyle = 'rgba(255,79,163,.18)';
    for (const s of [1, -1]) {
      const X = (x: number) => (s === 1 ? x : mx(x));
      c.beginPath();
      c.moveTo(X(42), 290);
      c.lineTo(X(42), 352);
      c.lineTo(X(74), 378);
      c.closePath();
      c.fill();
    }
    // The ramp entrance sign.
    c.font = '13px system-ui, "Apple Color Emoji", sans-serif';
    c.textAlign = 'center';
    c.fillText('🚇', 29, 272);
  });
  // Ramp points, computed once.
  const rampPts: number[] = [];
  for (let i = 0; i <= 40; i++) (rampAt(i / 40, tmp), rampPts.push(tmp.x, tmp.y));

  const drawFlip = (f: Flip) => {
    const c = Math.cos(f.ang), sn = Math.sin(f.ang);
    const tx = f.px + f.side * c * LEN, ty = f.py + sn * LEN;
    g.lineCap = 'round';
    g.strokeStyle = f.held ? '#ffd23f' : '#ff4fa3';
    g.shadowColor = g.strokeStyle;
    g.shadowBlur = 12;
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(f.px, f.py);
    g.lineTo(tx, ty);
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(f.px, f.py);
    g.lineTo(f.px + (tx - f.px) * 0.85, f.py + (ty - f.py) * 0.85);
    g.stroke();
    g.fillStyle = '#222';
    g.beginPath();
    g.arc(f.px, f.py, 3, 0, Math.PI * 2);
    g.fill();
  };
  const drawBall = (b: Ball, big = 1) => {
    for (let k = 0; k < 6; k++) {
      const i = (b.ti + k) % 6;
      g.globalAlpha = 0.06 + k * 0.04;
      g.fillStyle = '#bfe8ff';
      g.beginPath();
      g.arc(b.tx[i], b.ty[i], R * big * (0.5 + k * 0.08), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    shinyBall(g, b.x, b.y, R * big, '#c9d3dd');
  };

  const draw = (now: number, dt: number) => {
    g.drawImage(table, 0, 0);
    // Chasing lights along the arch.
    for (let i = 2; i < arch.length - 2; i += 4) {
      const on = (Math.floor(now / 90) + i / 4) % 4 === 0;
      g.fillStyle = on ? '#ffd23f' : 'rgba(255,210,63,.18)';
      g.beginPath();
      g.arc(arch[i], arch[i + 1] + 6, on ? 2.6 : 1.8, 0, Math.PI * 2);
      g.fill();
    }
    // T-A-X-I lanes.
    for (let i = 0; i < 4; i++) {
      const x = laneX(i);
      g.fillStyle = lit[i] ? '#ffd23f' : 'rgba(255,210,63,.15)';
      if (lit[i]) (g.shadowColor = '#ffd23f'), (g.shadowBlur = 10);
      g.beginPath();
      g.roundRect(x - 9, 96, 18, 18, 4);
      g.fill();
      g.shadowBlur = 0;
      g.font = `900 12px "Arial Black", system-ui`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = lit[i] ? '#1a1036' : 'rgba(255,255,255,.45)';
      g.fillText(LANES[i], x, 106);
    }
    // Multiplier lights.
    for (let i = 2; i <= 5; i++) {
      const on = mult >= i;
      g.fillStyle = on ? '#ff9f1c' : 'rgba(255,159,28,.15)';
      g.font = `900 11px "Arial Black", system-ui`;
      g.fillText(`${i}×`, 128 + (i - 2) * 25, 290);
    }
    // Slings.
    for (let k = 0; k < 2; k++) {
      slingLit[k] = Math.max(0, slingLit[k] - dt);
      const s = slings[k];
      g.strokeStyle = slingLit[k] > 0 ? '#fff' : '#ff4fa3';
      g.lineWidth = slingLit[k] > 0 ? 5 : 3;
      g.shadowColor = '#ff4fa3';
      g.shadowBlur = slingLit[k] > 0 ? 16 : 6;
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.lineTo(s.bx, s.by);
      g.stroke();
    }
    g.shadowBlur = 0;
    // Bumpers.
    for (const b of bumpers) {
      b.lit = Math.max(0, b.lit - dt);
      const k = 1 + b.lit * 1.2;
      const isLib = b.e === '🗽';
      g.fillStyle = b.lit > 0 ? '#fff' : isLib ? '#1f7a4d' : '#a3122a';
      g.shadowColor = isLib ? '#7bd88f' : '#ff4d4d';
      g.shadowBlur = b.lit > 0 ? 24 : 10;
      g.beginPath();
      g.arc(b.x, b.y, b.r * k, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = isLib ? '#7bd88f' : '#ffd23f';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(b.x, b.y, b.r * k - 3, 0, Math.PI * 2);
      g.stroke();
      emoji(g, b.e, b.x, b.y + 1, b.r * 1.25 * k);
    }
    // Drop targets.
    for (const t of targets) {
      t.lit = Math.max(0, t.lit - dt);
      g.fillStyle = t.down ? 'rgba(54,197,240,.15)' : t.lit > 0 ? '#fff' : '#36c5f0';
      if (!t.down) (g.shadowColor = '#36c5f0'), (g.shadowBlur = 8);
      g.fillRect(314, t.y, 7, 20);
      g.shadowBlur = 0;
      if (!t.down) emoji(g, '🎯', 304, t.y + 10, 10);
    }
    // Plunger spring.
    const pull = charging ? charge * 14 : 0;
    g.strokeStyle = '#aaa';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 8; i++) g.lineTo(LANE_X + (i % 2 ? 6 : -6), 468 + pull + (i / 8) * (10 - pull * 0.5));
    g.stroke();
    g.fillStyle = '#e0283f';
    g.fillRect(324, 466 + pull, 24, 4);
    if (charging) {
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(326, 300, 20, 100);
      g.fillStyle = charge > 0.92 ? '#ffd23f' : '#7bd88f';
      g.fillRect(326, 400 - charge * 100, 20, charge * 100);
    }
    // Balls on the table.
    for (const b of balls) if (b.ramp < 0) drawBall(b);
    flips.forEach(drawFlip);
    // The elevated subway ramp (over everything).
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,147,60,.35)';
    g.lineWidth = 16;
    g.beginPath();
    for (let i = 0; i < rampPts.length; i += 2) g.lineTo(rampPts[i], rampPts[i + 1]);
    g.stroke();
    g.strokeStyle = 'rgba(160,255,190,.55)';
    g.lineWidth = 1.5;
    for (const off of [-6, 6]) {
      g.beginPath();
      for (let i = 0; i < rampPts.length; i += 2) g.lineTo(rampPts[i] + off * 0.7, rampPts[i + 1] + off * 0.7);
      g.stroke();
    }
    // Ramp lights chase toward the exit.
    for (let i = 4; i < 40; i += 4) {
      const on = (i / 4 + Math.floor(now / 70)) % 3 === 0;
      if (!on) continue;
      g.fillStyle = '#7bd88f';
      g.beginPath();
      g.arc(rampPts[i * 2], rampPts[i * 2 + 1], 2.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const b of balls) if (b.ramp >= 0) drawBall(b, 1.25);
    // Apron: balls left and multiplier.
    g.font = `900 12px "Arial Black", system-ui`;
    g.textAlign = 'center';
    g.fillStyle = '#ffd23f';
    g.fillText(`BALL ${ballNo}/3`, 52, 466);
    g.fillStyle = mult > 1 ? '#ff9f1c' : 'rgba(255,255,255,.4)';
    g.fillText(`×${mult}`, 280, 466);
    if (rampChain > 1 && now - lastRamp < 8000) g.fillText(`🚇×${rampChain}`, 280, 446);
    const saving = balls.some((b) => b.saveUntil > now);
    if (saving && Math.floor(now / 250) % 2) (g.fillStyle = '#7bd88f'), g.fillText('SAVE', 52, 446);
    label(g, num(score), 166, 136, 20, '#fff');
  };

  // ---------------------------------------------------------- the loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    if (!fx.frozen && !fin.ended) {
      if (charging) charge = Math.min(1, charge + dt / 0.85);
      const h = dt / SUB;
      for (let s = 0; s < SUB; s++) step(h, now);
      // Trails, ramp rides, drains, stuck balls.
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (b.ramp >= 0) {
          b.ramp += dt / 0.95;
          if (b.ramp >= 1) rampEnd(b);
          else {
            rampAt(b.ramp, tmp);
            b.x = tmp.x;
            b.y = tmp.y;
            if (Math.random() < 0.5) fx.burst(b.x, b.y, { colors: ['#7bd88f', '#fff'], n: 1, size: 3, speed: 30, gravity: 0, life: 0.3 });
          }
        }
        b.ti = (b.ti + 1) % 6;
        b.tx[b.ti] = b.x;
        b.ty[b.ti] = b.y;
        const slow = b.ramp < 0 && !inLane(b) && b.vx * b.vx + b.vy * b.vy < 400;
        b.still = slow ? b.still + dt : 0;
        if (b.still > 2) {
          b.still = 0;
          b.vx = (Math.random() - 0.5) * 300;
          b.vy = -400;
          fx.pop(b.x, b.y - 14, 'NUDGE', '#aaa', 14);
          fx.shake(5, 0.15);
        }
        if (b.ramp < 0 && (b.x < 0 || b.x > W || b.y < 0)) {
          b.x = LANE_X;
          b.y = LANE_Y;
          b.vx = b.vy = 0;
        }
        if (b.y > H + 16) {
          if (b.saveUntil > now && balls.length === 1) {
            b.x = LANE_X;
            b.y = 300;
            b.vx = 0;
            b.vy = -1200;
            b.saveUntil = 0;
            fx.stamp('BALL SAVED!', '#7bd88f', 0.9);
            sfx.chime();
            continue;
          }
          balls.splice(i, 1);
          sfx.bad();
          fx.shake(8, 0.25);
        }
      }
      if (pendingMulti && now > nextMultiAt) {
        newBall(LANE_X, 300, -1250).saveUntil = now + 4000;
        pendingMulti--;
        nextMultiAt = now + 700;
        sfx.whoosh();
      }
      if (targetsResetAt && now > targetsResetAt) {
        targetsResetAt = 0;
        for (const t of targets) (t.down = false), (t.lit = 0.3);
      }
      if (!balls.length && !pendingMulti) {
        // Ball lost.
        rampChain = 0;
        if (ballNo >= 3) {
          fx.stamp('GAME OVER', '#e0283f', 1.4);
          fx.flash('#e0283f', 0.3);
          fx.shake(12, 0.4);
          sfx.punch();
          fin.end(score, 1500);
        } else {
          ballNo++;
          mult = Math.max(1, mult - 1);
          fx.stamp(`BALL ${ballNo}`, '#ffd23f', 1);
          newBall(LANE_X, LANE_Y);
        }
      }
    }
    draw(now, dt);
    fx.end(g);
    const ready = balls.some((b) => inLane(b) && b.y > 445 && Math.abs(b.vy) < 40 && b.ramp < 0);
    hud(`🗽 ${num(score)} · ⚪ ${3 - ballNo + 1}${mult > 1 ? ` · ×${mult}` : ''}${ready && !charging ? ' · hold to launch' : ''}`);
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
