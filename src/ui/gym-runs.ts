// =====================================================================
// gym-runs.ts — the seven gym mini-games, drawn on a canvas. The frame
// (intro, countdown, end card, fitness) is ui/gym-games.ts; the rules
// and seeded helpers are sim/gym-games.ts.
//
// Every game: GymRun(ctx) starts the round and returns stop(). It calls
// ctx.end(score, quality 0..1) once. Touch first; keys work too.
// Logical canvas is 360×480 (same as the arcade, so kit.pointers maps
// taps); it renders at device pixel ratio for crisp lines.
// =====================================================================

import {
  BENCH_REPS, PUNCHES, ROPE_AIR, ROPE_BIG_AIR, RUN_DRAG, YOGA_POSES, bagCombo, bagRingTime, benchJudge, benchQuality, benchZone, clamp01, fmtSplit, judgeOffset,
  ropeClears, ropePeriod, ropeQuality, rowPeriod, segAt, spinPlan, spinTarget, split500, treadmillPlan, yogaWobble, type GymGame, type Punch,
} from '../sim/gym-games.ts';
import { sfx } from './audio.ts';
import { H, W, emoji, secs } from './arcade-games.ts';
import { DISPLAY, clamp, keys, label, lerp, pointers } from './arcade/kit.ts';
import { Combo, Fx } from './juice.ts';

export interface GymCtx {
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  fx: Fx;
  game: GymGame;
  fitness: number;
  reduced: boolean;
  /** Short status text in the frame's top bar. */
  hud: (text: string) => void;
  /** The coach says something (throttled unless `force`). */
  coach: (line: string | string[], force?: boolean) => void;
  /** Round over: once. */
  end: (score: number, quality: number) => void;
}
export type GymRun = (c: GymCtx) => () => void;

const TAU = Math.PI * 2;
const INK = '#1c2340';

// ------------------------------------------------------------ drawing kit

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** A chunky pill (HUD chips): ink outline, colour fill, white text. */
function chip(g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, align: 'left' | 'right' | 'center' = 'left', size = 15): number {
  g.font = `900 ${size}px ${DISPLAY}`;
  const w = g.measureText(text).width + 18;
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  rr(g, x0, y, w, size + 12, (size + 12) / 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x0 + w / 2, y + (size + 12) / 2 + 1);
  return w;
}

/** A draining timer bar across the top. */
function timeBar(g: CanvasRenderingContext2D, f: number, color: string): void {
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fillRect(0, 0, W, 5);
  g.fillStyle = f < 0.15 ? '#ff4d4d' : color;
  g.fillRect(0, 0, W * clamp01(f), 5);
}

/** Static scene drawn once at device pixel ratio. */
function backdrop(draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = W * dpr;
  c.height = H * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  draw(g);
  return c;
}

/** Gym wall: a dark gradient in the game's colour, a window onto the city, a rubber floor. */
function gymRoom(g: CanvasRenderingContext2D, color: string, floorY: number, opts: { window?: boolean; night?: boolean } = {}): void {
  const bg = g.createLinearGradient(0, 0, 0, floorY);
  bg.addColorStop(0, '#141a33');
  bg.addColorStop(1, '#23294a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, floorY);
  // Colour wash from the theme.
  const wash = g.createRadialGradient(W / 2, floorY * 0.4, 10, W / 2, floorY * 0.4, W * 0.9);
  wash.addColorStop(0, color + '55');
  wash.addColorStop(1, color + '00');
  g.fillStyle = wash;
  g.fillRect(0, 0, W, floorY);
  if (opts.window !== false) {
    // A big window: the skyline, lit windows.
    const wx = 24, wy = 40, ww = W - 48, wh = floorY * 0.48;
    const sky = g.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, opts.night ? '#0d1336' : '#3a6fd8');
    sky.addColorStop(1, opts.night ? '#3b2a6b' : '#ffb27a');
    g.fillStyle = sky;
    g.fillRect(wx, wy, ww, wh);
    let x = wx;
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    while (x < wx + ww) {
      const bw = 16 + rnd() * 26, bh = wh * (0.25 + rnd() * 0.6);
      g.fillStyle = opts.night ? '#151b3d' : '#2b3566';
      g.fillRect(x, wy + wh - bh, bw, bh);
      g.fillStyle = opts.night ? '#ffd56b' : '#ffe9b5aa';
      for (let yy = wy + wh - bh + 5; yy < wy + wh - 4; yy += 8) for (let xx = x + 3; xx < x + bw - 3; xx += 6) if (rnd() < 0.35) g.fillRect(xx, yy, 2.5, 3.5);
      x += bw + 2;
    }
    // Mullions.
    g.strokeStyle = '#0b0f22';
    g.lineWidth = 6;
    g.strokeRect(wx, wy, ww, wh);
    g.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(wx + (ww / 4) * i, wy);
      g.lineTo(wx + (ww / 4) * i, wy + wh);
      g.stroke();
    }
  }
  // Rubber floor with speckles.
  g.fillStyle = '#1a1d27';
  g.fillRect(0, floorY, W, H - floorY);
  g.fillStyle = '#2a2f3d';
  for (let i = 0; i < 160; i++) g.fillRect((i * 97) % W, floorY + ((i * 53) % (H - floorY)), 2, 2);
  g.fillStyle = color;
  g.fillRect(0, floorY, W, 3);
}

/** Bind input and a frame loop; returns stop(). */
function run(c: GymCtx, step: (dt: number) => void, input: { down?: (x: number, y: number, id: number) => void; move?: (x: number, y: number, id: number, x0: number, y0: number) => void; up?: (x: number, y: number, id: number) => void; key?: (k: string) => void; keyUp?: (k: string) => void }): () => void {
  let raf = 0;
  let live = true;
  const unP = pointers(c.cv, {
    down: (t) => input.down?.(t.x, t.y, t.id),
    move: (t) => input.move?.(t.x, t.y, t.id, t.x0, t.y0),
    up: (t) => input.up?.(t.x, t.y, t.id),
  });
  const unK = keys((k) => input.key?.(k), (k) => input.keyUp?.(k));
  const frame = () => {
    if (!live) return;
    const dt = c.fx.begin(c.g);
    step(c.fx.frozen ? 0 : dt);
    c.fx.end(c.g);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    live = false;
    cancelAnimationFrame(raf);
    unP();
    unK();
  };
}

/** Clear to the backdrop (inside fx.begin's shake transform, so the room shakes too). */
function paint(g: CanvasRenderingContext2D, bg: HTMLCanvasElement): void {
  g.drawImage(bg, -8, -8, W + 16, H + 16);
}

// ================================================================ 🏋️ bench
const bench: GymRun = (c) => {
  const { g, fx, game } = c;
  const bg = backdrop((b) => gymRoom(b, game.color, 360, { night: true }));
  const BX = 296, BY0 = 70, BY1 = 410; // timing bar
  let rep = 0, clean = 0, perfect = 0, streak = 0, score = 0;
  let zoneAt = 0.4, size = benchZone(0, c.fitness);
  let phase = Math.random() * TAU;
  let repT = 0; // time on this rep
  let press = 0; // 0..1 press animation
  let pressOk = true;
  let over = false;
  const results: ('perfect' | 'clean' | 'miss')[] = [];
  const pos = () => 0.5 + 0.5 * Math.sin(phase);
  const place = () => {
    size = benchZone(rep, c.fitness);
    zoneAt = 0.06 + Math.random() * (0.88 - size);
  };
  place();
  const lift = (late = false) => {
    if (over || (!late && press > 0.55)) return;
    const p = pos();
    const r = late ? 'miss' : benchJudge(p, zoneAt, size);
    results.push(r);
    rep++;
    repT = 0;
    press = 1;
    pressOk = r !== 'miss';
    const my = lerp(BY1, BY0, p);
    if (r === 'miss') {
      streak = 0;
      sfx.bad();
      fx.shake(10);
      fx.burst(96, 290, { emoji: '💦', n: 6, speed: 160 });
      fx.pop(BX - 20, my, late ? 'TOO SLOW' : 'MISS', '#ff6b6b', 20);
      c.coach(late ? ['Don’t think, press!', 'The bar’s getting heavy, champ.'] : ['Shake it off.', 'Breathe. Reset. Go.', 'That one was for the ego.', 'Spot’s got you. Again.']);
    } else {
      clean++;
      streak++;
      const pts = (r === 'perfect' ? 150 : 100) + Math.max(0, streak - 1) * 20;
      score += pts;
      sfx.note(330 + clean * 45);
      if (r === 'perfect') {
        perfect++;
        fx.stop(0.07);
        fx.shake(6);
        fx.burst(150, 190, { colors: ['#ffd23f', '#fff1a8', game.color], n: 18, speed: 240 });
        fx.pop(BX - 30, my, `PERFECT +${pts}`, '#ffd23f', 22);
        if (streak >= 3) fx.stamp(`${streak} IN A ROW`, '#ffd23f', 0.7);
      } else {
        fx.burst(150, 190, { colors: [game.color, '#ffffff'], n: 10, speed: 170 });
        fx.pop(BX - 30, my, `CLEAN +${pts}`, '#7bd88f', 19);
      }
      c.coach(streak >= 5 ? ['LIGHT WEIGHT!', 'Who IS this?', 'Somebody film this.'] : rep === BENCH_REPS - 1 ? ['LAST ONE. ALL YOU.'] : ['Good rep!', 'Squeeze!', 'Yeah buddy!', 'Smooth.', 'Control it down.']);
    }
    if (rep >= BENCH_REPS) {
      over = true;
      const q = benchQuality(clean, perfect);
      fx.stamp(clean === BENCH_REPS ? 'FLAWLESS SET' : 'SET DONE', clean === BENCH_REPS ? '#ffd23f' : '#ffffff', 1.4);
      if (clean === BENCH_REPS) fx.burst(W / 2, 160, { emoji: ['💪', '✨'], n: 16, speed: 260 });
      c.coach(clean === BENCH_REPS ? 'Flawless. I’m telling the whole gym.' : clean >= 6 ? 'That’s a set. Go eat something.' : 'We build from here. Same time tomorrow.', true);
      c.end(score, q);
    } else place();
  };
  const step = (dt: number) => {
    // Speeds up each rep; a tired wobble on top.
    const speed = 2.2 + rep * 0.2;
    phase += dt * speed * (1 + 0.12 * Math.sin(phase * 3.7) * (rep / BENCH_REPS));
    repT += dt;
    press = Math.max(0, press - dt * 1.7);
    if (!over && repT > 4.5) {
      // Hesitated too long: the bar comes down.
      lift(true);
    }
    paint(g, bg);
    // Bench + lifter (side view).
    const floor = 360;
    g.fillStyle = '#0e1120';
    g.fillRect(40, floor - 46, 170, 14); // pad
    g.fillStyle = '#d23c3c';
    rr(g, 40, floor - 56, 170, 14, 6);
    g.fill();
    g.fillStyle = '#777d92';
    g.fillRect(60, floor - 42, 8, 42);
    g.fillRect(186, floor - 42, 8, 42);
    // Rack uprights.
    g.fillStyle = '#4a5068';
    g.fillRect(78, floor - 190, 8, 190);
    g.fillRect(70, floor - 160, 24, 6);
    // Lift height: down at the chest, up on a press (a miss only half-lifts and sags).
    const k = press > 0 ? Math.sin(Math.PI * (1 - press)) : 0;
    const up = pressOk ? k : k * 0.35;
    const barY = floor - 92 - up * 78 + (!pressOk && press > 0 ? Math.sin(press * 40) * 3 : 0);
    const shoulder = { x: 116, y: floor - 64 };
    // Body.
    g.lineCap = 'round';
    g.strokeStyle = '#ffcf9e';
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(shoulder.x, shoulder.y);
    g.lineTo(196, floor - 64);
    g.stroke();
    g.strokeStyle = '#2e3a6e';
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(196, floor - 64);
    g.lineTo(228, floor - 30);
    g.lineTo(232, floor);
    g.stroke();
    g.strokeStyle = game.color;
    g.lineWidth = 20;
    g.beginPath();
    g.moveTo(shoulder.x + 8, floor - 64);
    g.lineTo(178, floor - 64);
    g.stroke();
    // Head.
    g.fillStyle = '#ffcf9e';
    g.beginPath();
    g.arc(96, floor - 70, 14, 0, TAU);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(94, floor - 76, 14, Math.PI, TAU * 0.98);
    g.fill();
    // Arms to the bar.
    g.strokeStyle = '#ffcf9e';
    g.lineWidth = 9;
    const bx = 150;
    const elbow = { x: shoulder.x + 6, y: (shoulder.y + barY) / 2 + 10 * (1 - up) };
    g.beginPath();
    g.moveTo(shoulder.x, shoulder.y);
    g.lineTo(elbow.x, elbow.y);
    g.lineTo(bx, barY + 6);
    g.stroke();
    // Plate (end-on).
    g.fillStyle = INK;
    g.beginPath();
    g.arc(bx, barY, 40, 0, TAU);
    g.fill();
    g.fillStyle = game.color;
    g.beginPath();
    g.arc(bx, barY, 36, 0, TAU);
    g.fill();
    g.strokeStyle = '#00000044';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(bx, barY, 26, 0, TAU);
    g.stroke();
    g.fillStyle = '#ccd2e0';
    g.beginPath();
    g.arc(bx, barY, 8, 0, TAU);
    g.fill();
    label(g, '45', bx, barY - 18, 12, '#ffffffcc');
    // Rep pips.
    for (let i = 0; i < BENCH_REPS; i++) {
      const r = results[i];
      const x = 26 + i * 30, y = 22;
      g.fillStyle = r === 'perfect' ? '#ffd23f' : r === 'clean' ? '#43c46b' : r === 'miss' ? '#ff5a5a' : 'rgba(255,255,255,.15)';
      g.beginPath();
      g.arc(x, y, 10, 0, TAU);
      g.fill();
      g.strokeStyle = i === rep && !over ? '#fff' : INK;
      g.lineWidth = 2.5;
      g.stroke();
    }
    label(g, `${Math.min(rep + (over ? 0 : 1), BENCH_REPS)}/${BENCH_REPS}`, 26 + BENCH_REPS * 30 - 4, 22, 16, '#fff', 'left');
    // Timing bar.
    rr(g, BX - 22, BY0 - 6, 44, BY1 - BY0 + 12, 14);
    g.fillStyle = '#0b0e1c';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    const zy0 = lerp(BY1, BY0, zoneAt + size), zy1 = lerp(BY1, BY0, zoneAt);
    const zg = g.createLinearGradient(0, zy0, 0, zy1);
    zg.addColorStop(0, '#2fbf5b');
    zg.addColorStop(0.5, '#62e38a');
    zg.addColorStop(1, '#2fbf5b');
    g.fillStyle = zg;
    rr(g, BX - 16, zy0, 32, zy1 - zy0, 8);
    g.fill();
    const mid = (zy0 + zy1) / 2, ph = (zy1 - zy0) * 0.18;
    g.fillStyle = '#ffd23f';
    rr(g, BX - 16, mid - ph, 32, ph * 2, 4);
    g.fill();
    // Marker with a short trail.
    const my = lerp(BY1, BY0, pos());
    const inZone = !over && benchJudge(pos(), zoneAt, size) !== 'miss';
    g.fillStyle = inZone ? '#ffffff' : '#ff9f9f';
    g.shadowColor = inZone ? '#7dffb0' : 'transparent';
    g.shadowBlur = inZone ? 14 : 0;
    rr(g, BX - 28, my - 5, 56, 10, 5);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    // Rep clock.
    if (!over) {
      const f = 1 - repT / 4.5;
      g.strokeStyle = f < 0.3 ? '#ff6b6b' : '#ffffff55';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(BX, BY1 + 32, 11, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      g.stroke();
    }
    label(g, 'TAP TO PRESS', 150, 440, 18, '#ffffffcc');
    c.hud(`${score} pts · ${clean} clean`);
  };
  return run(c, step, { down: () => lift(), key: (k) => (k === ' ' || k === 'Enter' || k === 'ArrowUp') && lift() });
};

// ============================================================ 🏃 treadmill
const treadmill: GymRun = (c) => {
  const { g, fx, game } = c;
  const total = secs(40);
  const plan = treadmillPlan(Math.random, total);
  const bg = backdrop((b) => gymRoom(b, game.color, 330));
  let t = 0, v = 4, last: 'L' | 'R' | null = null, inBand = 0, streak = 0, score = 0, belt = 0, bob = 0, over = false;
  let segIdx = -1;
  const flash: Record<'L' | 'R', number> = { L: 0, R: 0 };
  const KIND = { jog: { name: 'JOG', col: '#36c5f0' }, sprint: { name: 'SPRINT', col: '#ff4d6d' }, hill: { name: 'HILL', col: '#ffb703' } } as const;
  const step1 = (foot: 'L' | 'R') => {
    if (over) return;
    flash[foot] = 1;
    const seg = segAt(plan, t);
    if (foot === last) {
      v = Math.max(0, v - 1.6);
      sfx.bad();
      fx.shake(6);
      fx.pop(foot === 'L' ? 90 : 270, 380, 'STUMBLE', '#ff6b6b', 18);
      streak = 0;
      c.coach(['Left, right. Left, right.', 'Other foot, champ.', 'You good? Alternate!']);
    } else {
      v = Math.min(20, v + (seg.kind === 'hill' ? 1.0 : 1.15));
      sfx.step(seg.kind === 'sprint');
      bob = 1;
    }
    last = foot;
  };
  const step = (dt: number) => {
    if (!over) t += dt;
    const seg = segAt(plan, t);
    const idx = plan.indexOf(seg);
    if (idx !== segIdx && !over) {
      segIdx = idx;
      if (idx > 0) {
        fx.stamp(KIND[seg.kind].name + '!', KIND[seg.kind].col, 0.9);
        sfx.notify();
      }
      c.coach(seg.kind === 'sprint' ? ['Sprint! Like you’re catching the last train.', 'SPRINT! The doors are closing!'] : seg.kind === 'hill' ? ['Hill! Lean in, short steps.', 'Hill! This is the Brooklyn Bridge.'] : ['Jog it out. Breathe.', 'Easy pace. Find your rhythm.'], true);
    }
    v = Math.max(0, v - RUN_DRAG[seg.kind] * v * dt);
    const ok = v >= seg.lo && v <= seg.hi;
    if (!over && dt > 0) {
      if (ok) {
        inBand += dt;
        const before = streak;
        streak += dt;
        const mult = Math.min(3, 1 + Math.floor(streak / 3));
        score += dt * 10 * mult;
        if (Math.floor(before / 3) !== Math.floor(streak / 3) && mult > 1) {
          fx.pop(180, 200, `×${mult} IN THE ZONE`, '#7bd88f', 20);
          sfx.note(520 + mult * 80);
        }
      } else streak = 0;
    }
    belt += v * dt * 22;
    bob = Math.max(0, bob - dt * 6);
    flash.L = Math.max(0, flash.L - dt * 5);
    flash.R = Math.max(0, flash.R - dt * 5);
    paint(g, bg);
    // Treadmill (tilts on a hill).
    g.save();
    g.translate(170, 330);
    if (seg.kind === 'hill') g.rotate(-0.09);
    g.fillStyle = '#353b52';
    rr(g, -140, -14, 280, 26, 10);
    g.fill();
    g.fillStyle = '#0c0e16';
    rr(g, -132, -10, 264, 14, 6);
    g.fill();
    g.strokeStyle = '#2a2f40';
    g.lineWidth = 3;
    for (let x = -132 + (belt % 22); x < 132; x += 22) {
      g.beginPath();
      g.moveTo(x, -10);
      g.lineTo(x, 4);
      g.stroke();
    }
    // Console arm + screen.
    g.strokeStyle = '#4a5068';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(-122, -10);
    g.lineTo(-104, -120);
    g.stroke();
    g.fillStyle = '#0b0e1c';
    rr(g, -134, -150, 66, 36, 8);
    g.fill();
    g.fillStyle = ok ? '#62e38a' : '#ff9f9f';
    g.font = `900 16px ${DISPLAY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(v.toFixed(1), -101, -132);
    // Runner (emoji faces left; the belt runs right).
    const by = -50 - Math.abs(Math.sin(belt * 0.12)) * 6 * Math.min(1, v / 8) - bob * 3;
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    g.ellipse(0, -8, 28, 5, 0, 0, TAU);
    g.fill();
    emoji(g, '🏃', 0, by, 74);
    // Speed lines when fast.
    if (v > 11) {
      g.strokeStyle = `rgba(255,255,255,${Math.min(0.5, (v - 11) / 10)})`;
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const y = -90 + i * 16, x = 40 + ((belt * 2 + i * 37) % 60);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 24, y);
        g.stroke();
      }
    }
    g.restore();
    // Speed gauge on the right.
    const GX = 334, GY0 = 74, GY1 = 300, MAX = 20;
    const yOf = (s: number) => lerp(GY1, GY0, s / MAX);
    rr(g, GX - 14, GY0 - 6, 28, GY1 - GY0 + 12, 10);
    g.fillStyle = '#0b0e1c';
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = ok ? '#43d17a' : KIND[seg.kind].col + 'aa';
    rr(g, GX - 10, yOf(seg.hi), 20, yOf(seg.lo) - yOf(seg.hi), 5);
    g.fill();
    const ny = yOf(Math.min(MAX, v));
    g.fillStyle = '#fff';
    g.shadowColor = ok ? '#7dffb0' : '#ff7a7a';
    g.shadowBlur = 12;
    g.beginPath();
    g.moveTo(GX - 22, ny);
    g.lineTo(GX - 12, ny - 7);
    g.lineTo(GX - 12, ny + 7);
    g.closePath();
    g.fill();
    g.fillRect(GX - 12, ny - 2, 24, 4);
    g.shadowBlur = 0;
    // Header: interval, big speed, next.
    timeBar(g, 1 - t / total, game.color);
    chip(g, KIND[seg.kind].name, 14, 14, KIND[seg.kind].col, 'left', 16);
    const left = Math.max(0, seg.to - t);
    label(g, `${left.toFixed(0)}s`, 14 + 96, 28, 16, '#fff', 'left');
    const nxt = plan[idx + 1];
    if (nxt) label(g, `next: ${KIND[nxt.kind].name.toLowerCase()}`, W - 50, 28, 13, '#ffffffaa', 'right');
    label(g, `${v.toFixed(1)}`, 60, 72, 34, ok ? '#7dffb0' : '#ffffff', 'left');
    label(g, 'mph', 60 + g.measureText(v.toFixed(1)).width + 6, 76, 14, '#ffffffaa', 'left');
    label(g, ok ? 'IN THE BAND' : v < seg.lo ? 'FASTER' : 'EASE OFF', 60, 102, 14, ok ? '#7dffb0' : '#ffd23f', 'left');
    if (streak >= 3) label(g, `🔥 ×${Math.min(3, 1 + Math.floor(streak / 3))}`, 300 - 30, 100, 16, '#ffd23f', 'right');
    // Foot pads.
    const want: 'L' | 'R' = last === 'L' ? 'R' : 'L';
    for (const f of ['L', 'R'] as const) {
      const x = f === 'L' ? 14 : W / 2 + 6;
      const y = 380, w = W / 2 - 20, h = 86;
      rr(g, x, y + flash[f] * 4, w, h, 18);
      g.fillStyle = flash[f] > 0 ? '#ffffff' : f === want ? game.color : '#3a4060';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.stroke();
      label(g, f === 'L' ? '👟 LEFT' : 'RIGHT 👟', x + w / 2, y + h / 2 + flash[f] * 4, 20, f === want ? '#1c2340' : '#ffffffaa');
    }
    c.hud(`${Math.round(score)} pts · ${Math.round((inBand / Math.max(1, t)) * 100)}% in band`);
    if (!over && t >= total) {
      over = true;
      const q = clamp01(inBand / total / 0.8);
      fx.stamp('TIME!', '#ffffff', 1.3);
      c.coach(q > 0.8 ? 'Marathon energy. Respect.' : q > 0.5 ? 'Solid run. Hydrate.' : 'The treadmill won today. Rematch tomorrow.', true);
      c.end(score, q);
    }
  };
  return run(c, step, {
    down: (x) => step1(x < W / 2 ? 'L' : 'R'),
    key: (k) => {
      if (k === 'ArrowLeft' || k === 'a' || k === 'f') step1('L');
      if (k === 'ArrowRight' || k === 'd' || k === 'j') step1('R');
    },
  });
};

// ================================================================ 🥊 bag
const PUNCH_INFO: Record<Punch, { name: string; col: string; key: string }> = {
  jab: { name: 'JAB', col: '#36c5f0', key: '←' },
  cross: { name: 'CROSS', col: '#ff8c1a', key: '→' },
  hook: { name: 'HOOK', col: '#b06cff', key: '↓' },
  upper: { name: 'UPPER', col: '#43d17a', key: '↑' },
};
const bag: GymRun = (c) => {
  const { g, fx, game } = c;
  const total = secs(40);
  const bg = backdrop((b) => gymRoom(b, game.color, 300, { window: false }));
  let t = 0, level = 0, score = 0, meter = 0, fury = 0, over = false;
  let combo: Punch[] = [], idx = 0, beats: number[] = [], comboClean = true, gapUntil = 0.6;
  let hits = 0, perfects = 0, thrown = 0;
  const run1 = new Combo(3);
  // Bag swing (spring) and glove animation.
  let ang = 0, angV = 0, squash = 0, glove: { side: -1 | 1; t: number; kind: Punch } | null = null;
  const pad: Record<Punch, number> = { jab: 0, cross: 0, hook: 0, upper: 0 };
  const CX = 180, CY = 190;
  const newCombo = () => {
    combo = bagCombo(Math.random, level);
    idx = 0;
    comboClean = true;
    const ring = bagRingTime(level);
    const gap = ring * 0.62;
    beats = combo.map((_, i) => t + ring + i * gap);
  };
  const resolve = (r: 'perfect' | 'good' | 'miss', p: Punch) => {
    thrown++;
    if (r === 'miss') {
      comboClean = false;
      run1.break();
      meter = Math.max(0, meter - 0.25);
      sfx.bad();
      fx.pop(CX, CY - 40, 'MISS', '#ff6b6b', 20);
      c.coach(['Hands up!', 'Breathe, then throw.', 'Chin down, eyes up.']);
    } else {
      hits++;
      const n = run1.hit();
      if (r === 'perfect') perfects++;
      const pts = Math.round((r === 'perfect' ? 100 : 60) * Math.min(4, 1 + Math.floor(n / 4) * 0.5) * (fury > 0 ? 2 : 1));
      score += pts;
      meter = Math.min(1, meter + (r === 'perfect' ? 0.12 : 0.07));
      if (meter >= 1 && fury <= 0) {
        fury = 6;
        meter = 0;
        fx.stamp('FURY ×2', '#ff4d4d', 1);
        fx.flash('#ff3b3b', 0.25);
        sfx.jackpot();
        c.coach(['FURY! Let it fly!', 'Now we’re cooking!'], true);
      }
      // Hit feel: heavier for hooks and uppercuts.
      const heavy = p === 'hook' || p === 'upper';
      const side = p === 'jab' || p === 'hook' ? -1 : 1;
      angV += (p === 'upper' ? 0.6 : heavy ? 2.6 : 1.4) * -side * (r === 'perfect' ? 1.3 : 1);
      squash = heavy ? 1 : 0.6;
      fx.shake(r === 'perfect' ? (heavy ? 12 : 8) : 5, 0.2);
      if (r === 'perfect') fx.stop(heavy ? 0.09 : 0.05);
      fx.burst(CX + side * 30, CY, { colors: ['#ffffff', PUNCH_INFO[p].col, '#ffd23f'], n: r === 'perfect' ? 16 : 8, speed: 260, gravity: 200, life: 0.4 });
      fx.pop(CX, CY - 60, `${r === 'perfect' ? 'PERFECT' : 'GOOD'} +${pts}`, r === 'perfect' ? '#ffd23f' : '#ffffff', r === 'perfect' ? 22 : 18);
      sfx.step(true);
      if (r === 'perfect') sfx.note(440 + Math.min(12, n) * 40);
    }
    idx++;
    if (idx >= combo.length) {
      if (comboClean) {
        level++;
        const bonus = 50 * combo.length * (fury > 0 ? 2 : 1);
        score += bonus;
        fx.pop(CX, 90, `COMBO +${bonus}`, '#7bd88f', 22);
        sfx.win();
        if (level % 3 === 0) c.coach(['That’s a combo!', 'Float like a pigeon, sting like a cab door.', 'Mike would nod. Maybe.'], true);
      } else level = Math.max(0, level - 1);
      gapUntil = t + 0.55;
      combo = [];
    }
  };
  const punch = (p: Punch) => {
    if (over) return;
    pad[p] = 1;
    glove = { side: p === 'jab' || p === 'hook' ? -1 : 1, t: 0, kind: p };
    if (!combo.length || idx >= beats.length) return; // shadowboxing between combos: free
    const dt = t - beats[idx];
    if (dt < -0.35) {
      // Way early: a whiff, doesn't use up the punch.
      meter = Math.max(0, meter - 0.05);
      fx.pop(CX, CY - 40, 'EARLY', '#ffd23f', 16);
      return;
    }
    resolve(p === combo[idx] ? judgeOffset(dt, 0.09, 0.22) : 'miss', p);
  };
  const step = (dt: number) => {
    if (!over) t += dt;
    if (!over && !combo.length && t >= gapUntil && t < total - 0.8) newCombo();
    if (!over && combo.length && idx < beats.length && t - beats[idx] > 0.22) resolve('miss', combo[idx]);
    fury = Math.max(0, fury - dt);
    // Bag physics.
    angV += (-ang * 18 - angV * 2.6) * dt;
    ang += angV * dt;
    squash = Math.max(0, squash - dt * 5);
    for (const k of PUNCHES) pad[k] = Math.max(0, pad[k] - dt * 6);
    if (glove) glove.t += dt;
    if (glove && glove.t > 0.25) glove = null;
    paint(g, bg);
    // Fury: red glow behind the bag.
    if (fury > 0) {
      const fg = g.createRadialGradient(CX, CY, 20, CX, CY, 200);
      fg.addColorStop(0, `rgba(255,60,60,${0.35 + 0.15 * Math.sin(t * 20)})`);
      fg.addColorStop(1, 'rgba(255,60,60,0)');
      g.fillStyle = fg;
      g.fillRect(0, 0, W, 320);
    }
    // Chain + bag.
    g.save();
    g.translate(CX, 34);
    g.rotate(ang * 0.12);
    g.strokeStyle = '#9aa1b5';
    g.lineWidth = 4;
    g.setLineDash([6, 4]);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, 60);
    g.stroke();
    g.setLineDash([]);
    const bw = 92 * (1 + squash * 0.08), bh = 200 * (1 - squash * 0.04);
    const lg = g.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    lg.addColorStop(0, '#7a1018');
    lg.addColorStop(0.35, game.color);
    lg.addColorStop(0.6, '#ff6b74');
    lg.addColorStop(1, '#7a1018');
    rr(g, -bw / 2, 60, bw, bh, 26);
    g.fillStyle = lg;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = '#1c2340cc';
    g.fillRect(-bw / 2, 92, bw, 12);
    g.fillRect(-bw / 2, 60 + bh - 44, bw, 12);
    label(g, 'NYC', 0, 60 + bh / 2, 22, '#ffffffcc');
    g.restore();
    // The timing ring for the next punch.
    if (combo.length && idx < beats.length) {
      const p = combo[idx];
      const ring = bagRingTime(level);
      const k = clamp01((beats[idx] - t) / ring);
      const r = 52 + k * 120;
      g.strokeStyle = PUNCH_INFO[p].col;
      g.globalAlpha = 0.35 + 0.65 * (1 - k);
      g.lineWidth = 6 + (1 - k) * 4;
      g.beginPath();
      g.arc(CX, CY, r, 0, TAU);
      g.stroke();
      g.globalAlpha = 1;
      // Target ring.
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.setLineDash([5, 5]);
      g.beginPath();
      g.arc(CX, CY, 52, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      label(g, PUNCH_INFO[p].name, CX, CY, 24, PUNCH_INFO[p].col);
    }
    // Gloves.
    const gl = (side: -1 | 1) => {
      const active = glove && glove.side === side;
      const k = active ? Math.sin(Math.min(1, glove!.t / 0.25) * Math.PI) : 0;
      const kind = active ? glove!.kind : 'jab';
      const x = CX + side * (110 - k * (kind === 'hook' ? 50 : 62));
      const y = 296 - k * (kind === 'upper' ? 120 : 84) + Math.sin(t * 3 + side) * 3;
      g.save();
      g.translate(x, y);
      if (side === 1) g.scale(-1, 1); // the emoji points one way: mirror the right glove
      if (kind === 'hook' && active) g.rotate(-0.5 * k);
      emoji(g, '🥊', 0, 0, 52 + k * 10);
      g.restore();
    };
    gl(-1);
    gl(1);
    // Combo chips + meter.
    timeBar(g, 1 - t / total, game.color);
    if (combo.length) {
      let x = 14;
      combo.forEach((p, i) => {
        const done = i < idx;
        g.globalAlpha = done ? 0.4 : 1;
        x += chip(g, PUNCH_INFO[p].name, x, 16, i === idx ? PUNCH_INFO[p].col : '#3a4060', 'left', 13) + 5;
        g.globalAlpha = 1;
      });
    } else label(g, combo.length === 0 && t < 0.6 ? 'GET READY' : 'NEXT COMBO…', 14, 30, 15, '#ffffffaa', 'left');
    // Meter (right side, vertical).
    const MX = 338, MY0 = 60, MY1 = 270;
    rr(g, MX - 10, MY0, 20, MY1 - MY0, 8);
    g.fillStyle = '#0b0e1c';
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.stroke();
    const mf = fury > 0 ? fury / 6 : meter;
    g.fillStyle = fury > 0 ? '#ff4d4d' : '#ffd23f';
    rr(g, MX - 7, lerp(MY1 - 3, MY0 + 3, mf), 14, (MY1 - MY0 - 6) * mf, 6);
    g.fill();
    label(g, fury > 0 ? '🔥' : '⚡', MX, MY1 + 16, 14, '#fff');
    if (run1.n >= 3) label(g, `${run1.n} hits`, 18, 270, 18, '#ffd23f', 'left');
    // Pads.
    const order: Punch[] = ['jab', 'cross', 'hook', 'upper'];
    order.forEach((p, i) => {
      const x = i % 2 ? W / 2 + 4 : 12, y = 326 + Math.floor(i / 2) * 76, w = W / 2 - 16, h = 68;
      const want = combo.length && combo[idx] === p;
      rr(g, x, y + pad[p] * 3, w, h, 16);
      g.fillStyle = pad[p] > 0 ? '#ffffff' : want ? PUNCH_INFO[p].col : '#30364f';
      g.fill();
      g.strokeStyle = want ? '#ffffff' : INK;
      g.lineWidth = 3;
      g.stroke();
      label(g, `${PUNCH_INFO[p].name} ${PUNCH_INFO[p].key}`, x + w / 2, y + h / 2 + pad[p] * 3, 20, want ? INK : '#ffffffcc');
    });
    c.hud(`${score} pts${fury > 0 ? ' · 🔥 FURY' : ''}`);
    if (!over && t >= total) {
      over = true;
      const q = clamp01(thrown ? (hits - (hits - perfects) * 0.3) / Math.max(thrown, 12) : 0);
      fx.stamp('DING DING!', '#ffd23f', 1.3);
      sfx.chime();
      c.coach(q > 0.8 ? 'That bag owes you money now.' : q > 0.5 ? 'Good rounds. Ice those knuckles.' : 'Footwork first. We’ll get there.', true);
      c.end(score, q);
    }
  };
  const padAt = (x: number, y: number): Punch | null => {
    if (y < 320) return null;
    const row = y < 326 + 72 ? 0 : 1;
    return (['jab', 'cross', 'hook', 'upper'] as Punch[])[row * 2 + (x < W / 2 ? 0 : 1)];
  };
  return run(c, step, {
    down: (x, y) => {
      const p = padAt(x, y);
      if (p) punch(p);
    },
    key: (k) => {
      const map: Record<string, Punch> = { ArrowLeft: 'jab', ArrowRight: 'cross', ArrowDown: 'hook', ArrowUp: 'upper', '1': 'jab', '2': 'cross', '3': 'hook', '4': 'upper' };
      if (map[k]) punch(map[k]);
    },
  });
};

// ================================================================ 🪢 rope
const rope: GymRun = (c) => {
  const { g, fx, game } = c;
  const total = secs(45);
  const bg = backdrop((b) => gymRoom(b, game.color, 410, { night: false }));
  let t = 0, phi = -0.9 * Math.PI, passes = 0, misses = 0, jumps = 0, doubles = 0, streak = 0, score = 0, over = false, stall = 0, unlocked = false;
  let jump: { t0: number; air: number; big: boolean; cleared: number } | null = null;
  let buffered = -1;
  const FLOOR = 410;
  const tap = () => {
    if (over) return;
    if (!jump) {
      jump = { t0: t, air: ROPE_AIR, big: false, cleared: 0 };
      sfx.tap();
      return;
    }
    const f = (t - jump.t0) / jump.air;
    if (!jump.big && f < 0.5) {
      // Big jump (double-under attempt).
      jump.big = true;
      jump.air = ROPE_BIG_AIR;
      sfx.note(660);
    } else if (f > 0.7) buffered = t; // land and go again
  };
  const step = (dt: number) => {
    if (!over) t += dt;
    const P = ropePeriod(t);
    if (!unlocked && P < 0.6 && !over) {
      unlocked = true;
      fx.stamp('DOUBLE-UNDERS!', '#06d6a0', 1.1);
      c.coach('Speed’s up. Tap twice for a double-under.', true);
    }
    if (stall > 0) stall = Math.max(0, stall - dt);
    else if (!over) phi += (TAU / P) * dt;
    // Rope at the feet each time phi crosses π (mod 2π).
    const n = Math.floor((phi + Math.PI) / TAU);
    if (n > passes && !over) {
      passes = n;
      const f = jump ? (t - jump.t0) / jump.air : -1;
      if (jump && ropeClears(f)) {
        jump.cleared++;
        jumps++;
        streak++;
        const mult = 1 + Math.floor(streak / 10);
        score += 10 * mult;
        sfx.tick();
        if (jump.cleared === 2) {
          doubles++;
          score += 50;
          fx.stamp('DOUBLE-UNDER', '#06d6a0', 0.8);
          fx.burst(180, FLOOR - 20, { colors: ['#06d6a0', '#ffffff', '#ffd23f'], n: 20, speed: 260 });
          fx.shake(5);
          sfx.win();
          c.coach(['Double-under! Look at you.', 'Okay, Rocky.', 'Double dutch champ energy.']);
        } else if (streak % 10 === 0) {
          fx.pop(180, 150, `${streak} STREAK ×${mult}`, '#ffd23f', 20);
          sfx.note(520 + streak * 4);
        }
      } else {
        misses++;
        streak = 0;
        stall = 0.7;
        phi = Math.floor(phi / TAU) * TAU + Math.PI * 1.02; // rope rests on the floor
        fx.shake(12);
        fx.flash('#ff5a5a', 0.18);
        fx.pop(180, 300, 'TRIPPED', '#ff6b6b', 22);
        sfx.bad();
        c.coach(misses >= 3 ? 'Rope 3, you 0. Shake it out.' : ['Shake it off. Find the rhythm.', 'Eyes forward. Tap on the swoosh.', 'Light on your toes.'], true);
        jump = null;
        if (misses >= 3) {
          over = true;
          fx.stamp('OUT!', '#ff6b6b', 1.3);
          c.end(score, ropeQuality(t, total, doubles, misses));
        }
      }
    }
    if (jump && t - jump.t0 >= jump.air) {
      jump = null;
      if (buffered >= 0 && t - buffered < 0.25) {
        jump = { t0: t, air: ROPE_AIR, big: false, cleared: 0 };
        sfx.tap();
      }
      buffered = -1;
    }
    if (!over && t >= total) {
      over = true;
      fx.stamp('TIME!', '#ffffff', 1.3);
      c.coach(doubles >= 5 ? 'Double-unders on demand. Who taught you?' : misses === 0 ? 'Not one trip. Clean.' : 'Good rope. Calves will remember this.', true);
      c.end(score, ropeQuality(total, total, doubles, misses));
    }
    // ---- draw
    paint(g, bg);
    const f = jump ? clamp01((t - jump.t0) / jump.air) : 0;
    const h = jump ? Math.sin(Math.PI * f) * (jump.big ? 74 : 44) : 0;
    const cx = 180, feet = FLOOR - 6 - h;
    // Mat + shadow.
    g.fillStyle = game.color + '55';
    rr(g, 70, FLOOR - 4, 220, 16, 8);
    g.fill();
    g.fillStyle = `rgba(0,0,0,${0.4 - h / 300})`;
    g.beginPath();
    g.ellipse(cx, FLOOR + 2, 34 - h / 6, 6, 0, 0, TAU);
    g.fill();
    const hands = { y: feet - 92, lx: cx - 48, rx: cx + 48 };
    const ropeAt = (a: number) => {
      // The loop's middle: floor at π, overhead at 0.
      const top = hands.y - 150, bottom = FLOOR + 2;
      const mid = (top + bottom) / 2 + ((bottom - top) / 2) * -Math.cos(a);
      const cpY = 2 * mid - hands.y;
      return { cpY, front: Math.sin(a) < 0 };
    };
    const drawRope = (a: number, alpha: number) => {
      const r = ropeAt(a);
      g.strokeStyle = game.color;
      g.globalAlpha = alpha;
      g.lineWidth = r.front ? 4.5 : 3;
      g.beginPath();
      g.moveTo(hands.lx, hands.y);
      g.quadraticCurveTo(cx, r.cpY, hands.rx, hands.y);
      g.stroke();
      g.globalAlpha = 1;
    };
    const ra = ropeAt(phi);
    const ghosts = c.reduced ? 0 : 2;
    if (!ra.front) for (let i = ghosts; i >= 0; i--) drawRope(phi - i * 0.18, i ? 0.18 : 1);
    // Jumper.
    g.lineCap = 'round';
    g.strokeStyle = '#2e3a6e';
    g.lineWidth = 12;
    const tuck = jump?.big ? Math.sin(Math.PI * f) * 14 : 0;
    g.beginPath();
    g.moveTo(cx - 10, feet - 46);
    g.lineTo(cx - 12 + tuck * 0.3, feet - 20 - tuck);
    g.lineTo(cx - 10, feet);
    g.moveTo(cx + 10, feet - 46);
    g.lineTo(cx + 12 - tuck * 0.3, feet - 20 - tuck);
    g.lineTo(cx + 10, feet);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(cx - 18, feet - 4, 14, 6);
    g.fillRect(cx + 4, feet - 4, 14, 6);
    g.fillStyle = game.color;
    rr(g, cx - 22, feet - 106, 44, 64, 14);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.stroke();
    g.strokeStyle = '#ffcf9e';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(cx - 18, feet - 98);
    g.lineTo(cx - 34, feet - 80);
    g.lineTo(hands.lx, hands.y);
    g.moveTo(cx + 18, feet - 98);
    g.lineTo(cx + 34, feet - 80);
    g.lineTo(hands.rx, hands.y);
    g.stroke();
    g.fillStyle = '#ffcf9e';
    g.beginPath();
    g.arc(cx, feet - 124, 18, 0, TAU);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(cx, feet - 130, 18, Math.PI * 1.05, TAU * 0.98);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.fillRect(cx - 18, feet - 133, 36, 5); // headband
    g.fillStyle = INK;
    g.fillRect(cx - 8, feet - 124, 3, 4);
    g.fillRect(cx + 5, feet - 124, 3, 4);
    if (ra.front) for (let i = ghosts; i >= 0; i--) drawRope(phi - i * 0.18, i ? 0.18 : 1);
    // Handles.
    g.fillStyle = '#0b0e1c';
    rr(g, hands.lx - 5, hands.y - 12, 10, 22, 4);
    g.fill();
    rr(g, hands.rx - 5, hands.y - 12, 10, 22, 4);
    g.fill();
    // Floor cue: glows as the rope comes down.
    const toFeet = ((Math.PI - (phi % TAU)) + TAU) % TAU / (TAU / P);
    const glow = toFeet < 0.3 ? 1 - toFeet / 0.3 : 0;
    if (glow > 0 && !over) {
      g.strokeStyle = `rgba(255,255,255,${glow * 0.8})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(cx, FLOOR + 2, 40 + glow * 14, 8 + glow * 2, 0, 0, TAU);
      g.stroke();
    }
    // HUD.
    timeBar(g, 1 - t / total, game.color);
    label(g, `${jumps}`, 180, 66, 46, '#ffffff');
    label(g, 'jumps', 180, 96, 14, '#ffffffaa');
    label(g, `${Math.round(60 / P)} rpm`, 16, 26, 15, '#ffffffcc', 'left');
    label(g, ['❤️', '❤️', '❤️'].map((x, i) => (i < 3 - misses ? x : '🖤')).join(''), W - 14, 26, 16, '#fff', 'right');
    if (doubles) label(g, `${doubles} double${doubles > 1 ? 's' : ''}`, W - 14, 50, 14, '#06d6a0', 'right');
    if (!over && t < 3) label(g, 'TAP AS THE ROPE HITS THE FLOOR', 180, 452, 15, '#ffffffcc');
    c.hud(`${score} pts · ${streak} streak`);
  };
  return run(c, step, { down: tap, key: (k) => (k === ' ' || k === 'ArrowUp' || k === 'Enter') && tap() });
};

// ================================================================ 🚴 spin
const spin: GymRun = (c) => {
  const { g, fx, game } = c;
  const total = secs(45);
  const plan = spinPlan(Math.random, total);
  const bg = backdrop((b) => {
    gymRoom(b, game.color, 430, { window: false });
    // A studio: neon stripe along the wall.
    b.fillStyle = game.color;
    b.fillRect(0, 54, W, 3);
    b.fillStyle = '#ff4fa3';
    b.fillRect(0, 60, W, 2);
  });
  let t = 0, cad = 60, hold = false, inBand = 0, locked = 0, streak = 0, score = 0, over = false, wheel = 0, segIdx = -1, beat = 0;
  const trail: { t: number; c: number }[] = [];
  const PX = 110, PPS = 46; // player x and pixels per second on the graph
  const yOf = (rpm: number) => lerp(390, 110, (rpm - 30) / 110);
  const CALL = { warm: { name: 'WARM UP', col: '#36c5f0' }, climb: { name: 'CLIMB!', col: '#ffb703' }, sprint: { name: 'SPRINT!', col: '#ff4d6d' }, recover: { name: 'RECOVER', col: '#43d17a' } } as const;
  const step = (dt: number) => {
    if (!over) t += dt;
    const seg = segAt(plan, t);
    const idx = plan.indexOf(seg);
    if (idx !== segIdx && !over) {
      segIdx = idx;
      if (idx > 0) {
        fx.stamp(CALL[seg.call].name, CALL[seg.call].col, 0.9);
        sfx.notify();
      }
      c.coach(
        seg.call === 'climb' ? ['Climb! Heavy legs, slow and strong.', 'Climb! This is the Williamsburg Bridge.'] : seg.call === 'sprint' ? ['SPRINT! Spin it out!', 'Sprint! Faster than the F train!'] : seg.call === 'recover' ? ['Recover. Shake out the arms.', 'Easy spin. Sip some water.'] : ['Warm up. Ride the line.', 'Find the beat, ride the line.'],
        true,
      );
    }
    const climb = seg.call === 'climb';
    if (dt > 0) {
      cad += hold ? (climb ? 0.55 : 1.1) * (135 - cad) * dt : -(climb ? 1.4 : 0.9) * (cad - 35) * dt;
      cad = clamp(cad, 30, 140);
    }
    const target = spinTarget(plan, t) + Math.sin(t * Math.PI * 2) * 1.5; // a little pulse on the beat
    const off = Math.abs(cad - target);
    const ok = off <= 8, lock = off <= 3;
    if (!over && dt > 0) {
      if (ok) {
        inBand += dt;
        streak += dt;
        if (lock) locked += dt;
        const mult = Math.min(3, 1 + Math.floor(streak / 4));
        score += dt * (lock ? 20 : 10) * mult;
      } else streak = 0;
      trail.push({ t, c: cad });
      while (trail.length && t - trail[0].t > 2.6) trail.shift();
    }
    wheel += (cad / 60) * TAU * dt;
    const b = Math.floor(t * 2);
    if (b !== beat && !over) {
      beat = b;
      if (b % 2 === 0) sfx.tick();
    }
    const pulse = 1 - ((t * 2) % 1);
    // ---- draw
    paint(g, bg);
    // Disco beams.
    if (!c.reduced) {
      for (let i = 0; i < 3; i++) {
        const a = Math.sin(t * 0.7 + i * 2.1) * 0.5;
        g.save();
        g.translate(60 + i * 120, 0);
        g.rotate(a);
        const lg = g.createLinearGradient(0, 0, 0, 420);
        lg.addColorStop(0, ['#ff4fa3', game.color, '#36c5f0'][i] + '55');
        lg.addColorStop(1, '#00000000');
        g.fillStyle = lg;
        g.beginPath();
        g.moveTo(-6, 0);
        g.lineTo(6, 0);
        g.lineTo(60, 420);
        g.lineTo(-60, 420);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
    // Grid lines.
    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.lineWidth = 1;
    for (let r = 40; r <= 130; r += 20) {
      g.beginPath();
      g.moveTo(0, yOf(r));
      g.lineTo(W, yOf(r));
      g.stroke();
    }
    // Beat ticks scrolling.
    for (let k = Math.ceil((t - 2.4) * 2); k <= (t + 5.5) * 2; k++) {
      const x = PX + (k / 2 - t) * PPS;
      g.fillStyle = k % 2 ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.18)';
      g.fillRect(x, 104, 1.5, 292);
    }
    // Target ribbon (past and future).
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const tgt = (tt: number) => spinTarget(plan, clamp(tt, 0, total - 0.001)) + Math.sin(tt * Math.PI * 2) * 1.5;
    for (const pass of [0, 1]) {
      g.strokeStyle = pass ? '#ffffff' : (ok ? '#43d17a' : CALL[seg.call].col) + '66';
      g.lineWidth = pass ? 2 : ((yOf(30) - yOf(46)) * 1);
      g.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const tt = t + (x - PX) / PPS;
        const y = yOf(tgt(tt));
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    // Segment labels on the future line.
    for (const s of plan) {
      const x = PX + (s.from - t) * PPS;
      if (x > PX + 10 && x < W - 30) {
        g.globalAlpha = 0.85;
        chip(g, CALL[s.call].name, x, yOf(s.rpm) - 38, CALL[s.call].col, 'center', 11);
        g.globalAlpha = 1;
      }
    }
    // Player trail and dot.
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 4;
    g.beginPath();
    trail.forEach((p, i) => {
      const x = PX + (p.t - t) * PPS, y = yOf(p.c);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
    const py = yOf(cad);
    g.shadowColor = lock ? '#7dffb0' : ok ? '#ffd23f' : '#ff7a7a';
    g.shadowBlur = 16 + (ok ? pulse * 10 : 0);
    g.fillStyle = lock ? '#7dffb0' : ok ? '#ffd23f' : '#ff7a7a';
    g.beginPath();
    g.arc(PX, py, 11 + (ok ? pulse * 3 : 0), 0, TAU);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.stroke();
    // Bike at the bottom: flywheel spins with cadence.
    const fxX = 300, fyY = 438;
    g.save();
    g.translate(fxX, fyY);
    g.fillStyle = '#0b0e1c';
    g.beginPath();
    g.arc(0, 0, 26, 0, TAU);
    g.fill();
    g.strokeStyle = game.color;
    g.lineWidth = 4;
    g.stroke();
    g.rotate(wheel);
    g.strokeStyle = '#ffffffaa';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.rotate(TAU / 6);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, 22);
      g.stroke();
    }
    g.restore();
    emoji(g, '🚴', 240, 432, 48);
    // HOLD hint.
    rr(g, 14, 412, 180, 52, 16);
    g.fillStyle = hold ? '#ffffff' : game.color;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.stroke();
    label(g, hold ? 'PEDALING…' : 'HOLD TO PEDAL', 104, 439, 18, hold ? INK : '#ffffff');
    // Header.
    timeBar(g, 1 - t / total, game.color);
    chip(g, CALL[seg.call].name, 14, 14, CALL[seg.call].col, 'left', 15);
    label(g, `${Math.round(cad)}`, W - 64, 34, 30, ok ? '#7dffb0' : '#ffffff', 'right');
    label(g, 'rpm', W - 58, 38, 13, '#ffffffaa', 'left');
    label(g, lock ? 'LOCKED IN' : ok ? 'ON THE LINE' : cad < target ? 'PUSH' : 'EASE UP', 14, 66, 14, lock ? '#7dffb0' : ok ? '#ffd23f' : '#ffffffaa', 'left');
    if (streak >= 4) label(g, `🔥 ×${Math.min(3, 1 + Math.floor(streak / 4))}`, W - 14, 66, 15, '#ffd23f', 'right');
    c.hud(`${Math.round(score)} pts · ${Math.round((inBand / Math.max(1, t)) * 100)}% on the line`);
    if (!over && t >= total) {
      over = true;
      hold = false;
      const q = clamp01((inBand / total) * 0.85 + (locked / total) * 0.3);
      fx.stamp('CLASS DONE', '#ffffff', 1.3);
      sfx.cheer();
      c.coach(q > 0.8 ? 'Front row next class. You earned it.' : q > 0.5 ? 'Strong ride! Wipe down the bike.' : 'Everybody starts in the back row.', true);
      c.end(score, q);
    }
  };
  return run(c, step, {
    down: () => (hold = !over),
    up: () => (hold = false),
    key: (k) => (k === ' ' || k === 'ArrowUp') && (hold = !over),
    keyUp: (k) => (k === ' ' || k === 'ArrowUp') && (hold = false),
  });
};

// ================================================================ 🚣 row
const row: GymRun = (c) => {
  const { g, fx, game } = c;
  const total = secs(40);
  const bg = backdrop((b) => {
    // River at dawn, Manhattan across the water.
    const sky = b.createLinearGradient(0, 0, 0, 200);
    sky.addColorStop(0, '#2a4c9a');
    sky.addColorStop(1, '#ffb27a');
    b.fillStyle = sky;
    b.fillRect(0, 0, W, 200);
    let x = 0, seed = 3;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    while (x < W) {
      const bw = 14 + rnd() * 24, bh = 30 + rnd() * 80;
      b.fillStyle = '#2b3566';
      b.fillRect(x, 140 - bh, bw, bh);
      if (rnd() < 0.15) b.fillRect(x + bw / 2 - 1, 140 - bh - 18, 2, 18);
      x += bw + 1;
    }
    const water = b.createLinearGradient(0, 140, 0, 250);
    water.addColorStop(0, '#2f6fa3');
    water.addColorStop(1, '#174a75');
    b.fillStyle = water;
    b.fillRect(0, 140, W, 110);
    // The erg room below.
    b.fillStyle = '#141a33';
    b.fillRect(0, 250, W, H - 250);
    b.fillStyle = game.color;
    b.fillRect(0, 250, W, 3);
  });
  let t = 0, v = 0, smooth = 0, dist = 0, ghost = 0, score = 0, over = false;
  let lastCatch = -1; // index of the catch already used
  let strokes = 0, quality = 0, catches = 0, streak = 0;
  let drive = 0; // 0..1 seat/handle animation
  let drag: { y0: number; y: number; at: number; judged: 'perfect' | 'good' | 'miss' | null; id: number } | null = null;
  const start = 0.8; // first catch
  const GHOST = 500 / 140; // 2:20 pace boat
  const catchTime = (i: number) => {
    // Catches follow the climbing stroke rate.
    let tt = start;
    for (let k = 0; k < i; k++) tt += rowPeriod(tt);
    return tt;
  };
  let nextIdx = 0, nextAt = start, prevAt = start - rowPeriod(0);
  const advance = () => {
    prevAt = nextAt;
    nextIdx++;
    nextAt = catchTime(nextIdx);
  };
  const finishStroke = (power: number) => {
    if (!drag) return;
    const r = drag.judged ?? 'miss';
    const p = clamp01(power);
    if (r !== 'miss') {
      const rate = (r === 'perfect' ? 1 : 0.65) * (0.4 + 0.6 * p);
      v += 5.2 * rate;
      quality += rate;
      strokes++;
      streak++;
      score += Math.round(rate * 20);
      fx.burst(70, 212, { colors: ['#ffffff', '#9ad7ff'], n: r === 'perfect' ? 14 : 7, speed: 140, gravity: 260, life: 0.5, up: true });
      fx.pop(180, 300, r === 'perfect' ? (p > 0.8 ? 'PERFECT POWER' : 'PERFECT') : 'GOOD', r === 'perfect' ? '#ffd23f' : '#ffffff', r === 'perfect' ? 20 : 17);
      if (r === 'perfect' && p > 0.8) (fx.shake(5), fx.stop(0.05));
      sfx.note(300 + Math.min(10, streak) * 30);
      if (streak > 0 && streak % 5 === 0) c.coach(['Long and strong!', 'Legs, back, arms. Beautiful.', 'You’re walking that pace boat.'], true);
    } else {
      v = Math.max(0, v - 0.4);
      streak = 0;
      sfx.bad();
      fx.pop(180, 300, 'RUSHED', '#ff6b6b', 18);
      c.coach(['Wait for the catch.', 'Patience on the slide.', 'Don’t rush the recovery.']);
    }
    drag = null;
  };
  const pullStart = (y: number, id = -1) => {
    if (over || drag) return;
    drag = { y0: y, y, at: t, judged: null, id };
  };
  const pullMove = (y: number) => {
    if (!drag) return;
    drag.y = y;
    if (!drag.judged && y - drag.y0 > 30) {
      // The pull starts now: judge it against the nearest catch.
      const near = Math.abs(t - nextAt) < Math.abs(t - prevAt) ? nextIdx : nextIdx - 1;
      const at = near === nextIdx ? nextAt : prevAt;
      if (near <= lastCatch) drag.judged = 'miss';
      else {
        drag.judged = judgeOffset(t - at, 0.12, 0.3);
        if (drag.judged !== 'miss') lastCatch = near;
      }
      drive = 1;
    }
  };
  const pullEnd = () => {
    if (!drag) return;
    if (!drag.judged) return void (drag = null); // a tap: nothing
    finishStroke((drag.y - drag.y0) / 150);
  };
  const step = (dt: number) => {
    if (!over) t += dt;
    if (t > nextAt + 0.32 && !over) {
      catches++;
      if (lastCatch < nextIdx) {
        streak = 0;
        fx.pop(180, 280, 'MISSED THE CATCH', '#ffb3b3', 15);
      }
      advance();
    }
    // A long-held pull counts after 0.6 s.
    if (drag && drag.judged && t - drag.at > 0.8) finishStroke((drag.y - drag.y0) / 150);
    v = Math.max(0, v - v * 0.45 * dt);
    smooth = lerp(smooth, v, Math.min(1, dt * 2));
    dist += v * dt;
    if (!over) ghost += GHOST * dt * (t > start ? 1 : 0);
    drive = Math.max(0, drive - dt * 1.6);
    // ---- draw
    paint(g, bg);
    // Water stripes move with your speed.
    g.strokeStyle = 'rgba(255,255,255,.25)';
    g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = 152 + (i % 7) * 13;
      const x = ((i * 71 - dist * 18) % (W + 60) + W + 60) % (W + 60) - 30;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 22 + (i % 3) * 8, y);
      g.stroke();
    }
    // Boats: you and the 2:00 pace boat (relative).
    const boat = (x: number, y: number, col: string, oar: number, name: string) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x - 60, y);
      g.quadraticCurveTo(x, y + 10, x + 64, y - 2);
      g.lineTo(x - 60, y - 4);
      g.closePath();
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#ffcf9e';
      g.beginPath();
      g.arc(x - 4 - oar * 8, y - 18, 6, 0, TAU);
      g.fill();
      g.strokeStyle = '#f2f2f2';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(x - 2 - oar * 6, y - 8);
      g.lineTo(x - 22 + oar * 30, y + 10);
      g.stroke();
      label(g, name, x + 70, y - 4, 11, '#ffffffcc', 'left');
    };
    const gap = clamp((dist - ghost) * 3, -140, 140);
    boat(150 - gap * 0.5, 186, '#c9ced9', Math.sin(t * TAU / 2.2) * 0.5 + 0.5, 'PACE 2:20');
    boat(150 + gap * 0.5, 222, game.color, drive, 'YOU');
    // Split + distance.
    timeBar(g, 1 - t / total, game.color);
    label(g, fmtSplit(split500(smooth)), 16, 32, 28, '#ffffff', 'left');
    label(g, '/500m', 22 + g.measureText(fmtSplit(split500(smooth))).width, 36, 13, '#ffffffcc', 'left');
    label(g, `${Math.round(dist)} m`, W - 16, 32, 22, '#ffffff', 'right');
    label(g, gap >= 0 ? `+${Math.round(dist - ghost)} m on pace` : `${Math.round(dist - ghost)} m`, W - 16, 56, 12, gap >= 0 ? '#7dffb0' : '#ffb3b3', 'right');
    // Catch dial.
    const DX = 180, DY = 350, R = 62;
    const u = clamp01((t - prevAt) / (nextAt - prevAt)); // 0 at last catch, 1 at next
    g.fillStyle = '#0b0e1c';
    g.beginPath();
    g.arc(DX, DY, R + 8, 0, TAU);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.stroke();
    const win = (0.3 / (nextAt - prevAt)) * TAU, pw = (0.12 / (nextAt - prevAt)) * TAU;
    g.lineWidth = 12;
    g.strokeStyle = '#2fbf5b';
    g.beginPath();
    g.arc(DX, DY, R - 6, -Math.PI / 2 - win, -Math.PI / 2 + win);
    g.stroke();
    g.strokeStyle = '#ffd23f';
    g.beginPath();
    g.arc(DX, DY, R - 6, -Math.PI / 2 - pw, -Math.PI / 2 + pw);
    g.stroke();
    const na = -Math.PI / 2 + u * TAU;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(DX, DY);
    g.lineTo(DX + Math.cos(na) * (R - 4), DY + Math.sin(na) * (R - 4));
    g.stroke();
    g.fillStyle = game.color;
    g.beginPath();
    g.arc(DX, DY, 9, 0, TAU);
    g.fill();
    const near = u > 0.88 || u < 0.06;
    label(g, 'CATCH', DX, DY - R - 18, 15, near ? '#ffd23f' : '#ffffff88');
    // Handle: follows your pull.
    const pull = drag ? clamp(drag.y - drag.y0, 0, 150) : 0;
    const hy = 432 + pull * 0.2;
    g.strokeStyle = '#9aa1b5';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(DX, DY + R + 8);
    g.lineTo(DX, hy);
    g.stroke();
    rr(g, DX - 70, hy - 7, 140, 14, 7);
    g.fillStyle = drag?.judged ? '#ffd23f' : '#3a4060';
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.stroke();
    if (drag?.judged) {
      // Power meter beside the dial.
      const pf = clamp01(pull / 150);
      rr(g, 296, 300, 18, 110, 8);
      g.fillStyle = '#0b0e1c';
      g.fill();
      g.fillStyle = pf > 0.8 ? '#ffd23f' : '#43d17a';
      rr(g, 299, 407 - 104 * pf, 12, 104 * pf, 6);
      g.fill();
    }
    label(g, 'DRAG DOWN ON THE CATCH', DX, 466, 14, '#ffffffaa');
    if (streak >= 3) label(g, `🔥 ${streak}`, 24, 300, 18, '#ffd23f', 'left');
    c.hud(`${Math.round(dist)} m · ${fmtSplit(split500(smooth))}`);
    if (!over && t >= total) {
      over = true;
      drag = null;
      const q = clamp01(catches ? quality / Math.max(catches, 8) : 0);
      fx.stamp(`${Math.round(dist)} m`, '#ffffff', 1.3);
      c.coach(dist > ghost + 10 ? 'You walked the pace boat. Hudson’s yours.' : q > 0.5 ? 'Good rhythm. Legs first, always.' : 'Rowing is hard. Rhythm comes with reps.', true);
      score = Math.round(dist);
      c.end(score, q);
    }
  };
  return run(c, step, {
    down: (_x, y, id) => pullStart(y, id),
    move: (_x, y) => pullMove(y),
    up: () => pullEnd(),
    key: (k) => {
      if (k === ' ' || k === 'ArrowDown') {
        pullStart(0);
        pullMove(130);
      }
    },
    keyUp: (k) => (k === ' ' || k === 'ArrowDown') && pullEnd(),
  });
};

// ================================================================ 🧘 yoga
const POSES: Record<string, [number, number, number, number][]> = {
  // Line segments (x0,y0,x1,y1) of a simple figure, feet at 0,0, up is -y.
  Tree: [[0, 0, 0, -60], [0, -60, 0, -110], [0, -60, -18, -40], [-18, -40, 0, -30], [0, -100, -14, -140], [0, -100, 14, -140], [-14, -140, 14, -140]],
  'Warrior III': [[0, 0, 0, -60], [0, -60, -60, -66], [0, -60, 50, -70], [50, -70, 92, -70], [36, -70, 56, -58]],
  Crow: [[-14, 0, -6, -34], [14, 0, 6, -34], [-6, -34, -24, -46], [6, -34, 24, -46], [-24, -46, 24, -46], [0, -46, 4, -84], [-20, -42, -8, -60], [20, -42, 8, -60]],
};
const POSE_HEAD: Record<string, [number, number]> = { Tree: [0, -126], 'Warrior III': [-72, -68], Crow: [8, -98] };
const yoga: GymRun = (c) => {
  const { g, fx, game } = c;
  const each = secs(12);
  const total = each * 3;
  const wob = yogaWobble(Math.random);
  const bg = backdrop((b) => {
    const sky = b.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1f3f5b');
    sky.addColorStop(0.55, '#5fb49c');
    sky.addColorStop(1, '#f6c89f');
    b.fillStyle = sky;
    b.fillRect(0, 0, W, H);
    b.fillStyle = '#fff3d6';
    b.globalAlpha = 0.5;
    b.beginPath();
    b.arc(W / 2, 420, 96, 0, TAU);
    b.fill();
    b.globalAlpha = 1;
    b.fillStyle = '#2d5b55';
    b.fillRect(0, 420, W, 60);
    b.fillStyle = '#c86b85';
    rr(b, 90, 414, 180, 10, 5);
    b.fill();
  });
  let t = 0, px = 0, py = 0, vx = 0, vy = 0, score = 0, calm = 0, inner = 0, mid = 0, over = false, pose = -1, falls = 0;
  let push: { x0: number; y0: number; x: number; y: number } | null = null;
  const keyPush = { x: 0, y: 0 };
  const motes = Array.from({ length: 18 }, (_, i) => ({ x: (i * 53) % W, y: (i * 97) % 400, s: 1 + (i % 3), v: 6 + (i % 5) * 3 }));
  const CX = 180, CY = 210, R = 110;
  const step = (dt: number) => {
    if (!over) t += dt;
    const pi = Math.min(2, Math.floor(t / each));
    if (pi !== pose && !over) {
      pose = pi;
      px *= 0.3;
      py *= 0.3;
      if (pi > 0) {
        fx.stamp(YOGA_POSES[pi].name, '#ffffff', 1.1);
        sfx.chime();
      }
      c.coach(pi === 0 ? ['Breathe. The rent is due either way.', 'Find your centre. Ignore the sirens.'] : pi === 1 ? ['Warrior Three. Strong and soft.', 'Long line, heel to fingertips.'] : ['Crow. Lean, trust your hands.', 'Last pose. You’ve got this.'], true);
    }
    const P = YOGA_POSES[Math.max(0, pose)];
    if (dt > 0 && !over) {
      const w = wob(t * (0.8 + pose * 0.15));
      let fx_ = 0, fy_ = 0;
      if (push) {
        fx_ = clamp((push.x - push.x0) / 70, -1.4, 1.4);
        fy_ = clamp((push.y - push.y0) / 70, -1.4, 1.4);
      }
      fx_ += keyPush.x;
      fy_ += keyPush.y;
      const ax = w.x * 1.5 * P.wobble + px * 0.9 + fx_ * 2.4 - vx * 2.0;
      const ay = w.y * 1.5 * P.wobble + py * 0.9 + fy_ * 2.4 - vy * 2.0;
      vx += ax * dt;
      vy += ay * dt;
      px += vx * dt;
      py += vy * dt;
      const r = Math.hypot(px, py);
      if (r < 0.25) {
        inner += dt;
        calm += dt;
        score += 20 * dt;
      } else if (r < 0.55) {
        mid += dt;
        score += 8 * dt;
        calm = Math.max(0, calm - dt * 0.5);
      } else calm = 0;
      if (Math.floor(calm / 3) !== Math.floor((calm - dt) / 3) && calm >= 3) {
        fx.pop(CX, CY - 70, 'ZEN +20', '#ffffff', 18);
        score += 20;
        sfx.note(523 + Math.min(4, Math.floor(calm / 3)) * 98);
      }
      if (r > 1) {
        // Lost it: a wobble, then reset.
        falls++;
        px = py = vx = vy = 0;
        fx.shake(6);
        fx.pop(CX, CY, 'WOBBLE', '#ffb3b3', 20);
        sfx.bad();
        c.coach(['All good. Breathe back in.', 'Falling is part of it.', 'Reset. Soft knees.']);
      }
    }
    // ---- draw
    paint(g, bg);
    for (const m of motes) {
      if (!c.reduced) m.y -= m.v * dt;
      if (m.y < -4) m.y = 420;
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath();
      g.arc(m.x + Math.sin(t * 0.5 + m.y * 0.03) * 8, m.y, m.s, 0, TAU);
      g.fill();
    }
    // Breathing guide: 4 s in, 4 s out.
    const br = (Math.sin((t / 8) * TAU - Math.PI / 2) + 1) / 2;
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(CX, CY, R * (0.7 + br * 0.35), 0, TAU);
    g.stroke();
    label(g, Math.cos((t / 8) * TAU - Math.PI / 2) > 0 ? 'breathe in' : 'breathe out', CX, CY - R - 16, 14, '#ffffffbb');
    // Rings.
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.beginPath();
    g.arc(CX, CY, R, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(CX, CY, R, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.beginPath();
    g.arc(CX, CY, R * 0.55, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(126,255,214,.22)';
    g.beginPath();
    g.arc(CX, CY, R * 0.25, 0, TAU);
    g.fill();
    // The dot.
    const r = Math.hypot(px, py);
    const dx = CX + px * R, dy = CY + py * R;
    const col = r < 0.25 ? '#7effd6' : r < 0.55 ? '#fff3b0' : '#ffb3b3';
    g.shadowColor = col;
    g.shadowBlur = 18;
    g.fillStyle = col;
    g.beginPath();
    g.arc(dx, dy, 13, 0, TAU);
    g.fill();
    g.shadowBlur = 0;
    // Push arrow from the finger.
    if (push) {
      g.strokeStyle = 'rgba(255,255,255,.6)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(dx, dy);
      g.lineTo(dx + clamp(push.x - push.x0, -70, 70) * 0.5, dy + clamp(push.y - push.y0, -70, 70) * 0.5);
      g.stroke();
    }
    // Pose figure on the mat: leans with the dot.
    const name = YOGA_POSES[Math.max(0, pose)].name;
    g.save();
    g.translate(180, 414);
    g.rotate(px * 0.18);
    g.strokeStyle = '#ffffff';
    g.lineCap = 'round';
    g.lineWidth = 8;
    g.beginPath();
    for (const [a, b2, c2, d] of POSES[name]) {
      g.moveTo(a * 0.7, b2 * 0.7);
      g.lineTo(c2 * 0.7, d * 0.7);
    }
    g.stroke();
    const [hx, hy] = POSE_HEAD[name];
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(hx * 0.7, hy * 0.7, 9, 0, TAU);
    g.fill();
    g.restore();
    // Header.
    timeBar(g, 1 - t / total, '#ffffff');
    chip(g, `${Math.max(0, pose) + 1}/3 ${name}`, 14, 14, game.color, 'left', 15);
    const pl = Math.max(0, each * (Math.max(0, pose) + 1) - t);
    label(g, `${Math.ceil(pl)}s`, W - 16, 28, 18, '#ffffff', 'right');
    if (calm >= 3) label(g, `🍃 ${Math.floor(calm)}s calm`, CX, CY + R + 22, 15, '#e9fff7');
    if (t < 3 && !over) label(g, 'DRAG TO LEAN AGAINST THE WOBBLE', CX, 466, 13, '#ffffffcc');
    c.hud(`${Math.round(score)} pts`);
    if (!over && t >= total) {
      over = true;
      const q = clamp01((inner + mid * 0.6) / total / 0.85 - falls * 0.05);
      fx.stamp('NAMASTE', '#ffffff', 1.4);
      sfx.chime();
      c.coach(q > 0.8 ? 'Calmest person in Manhattan right now.' : q > 0.5 ? 'Nice flow. Carry that into the subway.' : 'Balance is a practice. Come back tomorrow.', true);
      c.end(score, q);
    }
  };
  const kmap: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  return run(c, step, {
    down: (x, y) => (push = { x0: x, y0: y, x, y }),
    move: (x, y) => push && ((push.x = x), (push.y = y)),
    up: () => (push = null),
    key: (k) => kmap[k] && ((keyPush.x += kmap[k][0]), (keyPush.y += kmap[k][1])),
    keyUp: (k) => kmap[k] && ((keyPush.x -= kmap[k][0]), (keyPush.y -= kmap[k][1])),
  });
};

export const GYM_RUNS: Record<string, GymRun> = { bench, treadmill, bag, rope, spin, row, yoga };
