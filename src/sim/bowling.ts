// =====================================================================
// bowling.ts — 🎳 ten-pin bowling (Peter: "a bowling alley"). The rules
// side, no DOM: scoring a real 10-frame game (strikes, spares, the 10th
// frame's bonus balls, max 300), a small top-down lane physics (ball,
// ten pins that tip, slide, spin and knock each other), the computer
// bowler, and what a game does to you. The lane is ui/bowling.ts.
//
// Units are inches, seconds. x runs across the lane (0 = the centre
// board, + = right), z runs down the lane (0 = foul line, the head pin
// sits at 720 = 60 ft). Everything random takes a `rand` so tests and
// replays are repeatable.
// =====================================================================

import { addMoodlet, applyNeeds } from './needs.ts';
import type { GameState } from './types.ts';

/** Saved on GameState (optional, so old saves load fine). */
export interface BowlingState {
  /** Personal best game. */
  best: number;
  /** Games finished. */
  games: number;
  /** Strikes ever (for flavour). */
  strikes: number;
}

declare module './types.ts' {
  interface GameState {
    bowling?: BowlingState;
  }
}

export type Rand = () => number;

/** One game, shoe rental included (cents). */
export const BOWLING_COST = 800;
export const FRAMES = 10;

// ================================================================ scoring

/** Split a list of rolls (pins per ball) into frames (the 10th holds up to 3). */
export function splitFrames(rolls: readonly number[]): number[][] {
  const out: number[][] = [];
  let i = 0;
  while (i < rolls.length && out.length < FRAMES) {
    if (out.length === FRAMES - 1) {
      out.push(rolls.slice(i, i + 3));
      break;
    }
    if (rolls[i] === 10) {
      out.push([10]);
      i += 1;
    } else {
      out.push(rolls.slice(i, i + 2));
      i += 2;
    }
  }
  return out;
}

/**
 * Running total after each frame (10 entries). null where it isn't known
 * yet (a strike or spare waiting for its bonus balls, or not bowled).
 */
export function scoreFrames(rolls: readonly number[]): (number | null)[] {
  const out: (number | null)[] = [];
  let total = 0;
  let i = 0;
  for (let f = 0; f < FRAMES; f++) {
    const a = rolls[i], b = rolls[i + 1], c = rolls[i + 2];
    let pts: number | undefined;
    if (a === undefined) pts = undefined;
    else if (f === FRAMES - 1) {
      // The 10th: two balls, or three after a strike or a spare.
      if (b === undefined) pts = undefined;
      else if (a === 10 || a + b === 10) pts = c === undefined ? undefined : a + b + c;
      else pts = a + b;
    } else if (a === 10) {
      pts = b === undefined || c === undefined ? undefined : 10 + b + c;
      i += 1;
    } else {
      if (b === undefined) pts = undefined;
      else if (a + b === 10) pts = c === undefined ? undefined : 10 + c;
      else pts = a + b;
      i += 2;
    }
    if (pts === undefined) {
      // Everything after an unknown frame is unknown too.
      while (out.length < FRAMES) out.push(null);
      return out;
    }
    total += pts;
    out.push(total);
  }
  return out;
}

/** The score so far (the last frame that is known). */
export function gameScore(rolls: readonly number[]): number {
  const s = scoreFrames(rolls);
  let t = 0;
  for (const v of s) if (v !== null) t = v;
  return t;
}

/**
 * The best score still possible: as if every ball from here is a strike
 * (handy for a "max possible" line and for tests).
 */
export function maxPossible(rolls: readonly number[]): number {
  const r = [...rolls];
  while (!gameOver(r)) r.push(nextBall(r).standing);
  return gameScore(r);
}

/** Marks for a frame on the score sheet: X, /, - or a number. */
export function frameMarks(frame: readonly number[], tenth: boolean): string[] {
  const out: string[] = [];
  let rackStart = 0; // index of the first ball on the current rack
  for (let k = 0; k < frame.length; k++) {
    const v = frame[k];
    const fresh = k === rackStart;
    if (fresh && v === 10) {
      out.push('X');
      rackStart = k + 1;
    } else if (!fresh && frame[rackStart] + v === 10) {
      out.push('/');
      rackStart = k + 1;
    } else {
      out.push(v === 0 ? '-' : String(v));
      if (!fresh) rackStart = k + 1;
    }
    if (!tenth && (out[0] === 'X' || k === 1)) break;
  }
  return out;
}

/** Where the game is: the frame (0..9) and ball (0..2) to bowl next, and whether a fresh rack is set for it. */
export interface NextBall {
  frame: number;
  ball: number;
  /** A full new rack of ten for this ball. */
  fresh: boolean;
  /** Pins standing for this ball. */
  standing: number;
}

export function nextBall(rolls: readonly number[]): NextBall {
  const frames = splitFrames(rolls);
  const last = frames[frames.length - 1];
  if (!last) return { frame: 0, ball: 0, fresh: true, standing: 10 };
  const f = frames.length - 1;
  if (f < FRAMES - 1) {
    const done = last[0] === 10 || last.length === 2;
    if (done) return { frame: f + 1, ball: 0, fresh: true, standing: 10 };
    return { frame: f, ball: 1, fresh: false, standing: 10 - last[0] };
  }
  // The 10th frame: the rack is reset after a strike or a spare.
  const k = last.length;
  if (k === 1) return last[0] === 10 ? { frame: f, ball: 1, fresh: true, standing: 10 } : { frame: f, ball: 1, fresh: false, standing: 10 - last[0] };
  // k === 2 (or 3: game over; callers check gameOver first)
  const [a, b] = last;
  if (a === 10) return b === 10 ? { frame: f, ball: 2, fresh: true, standing: 10 } : { frame: f, ball: 2, fresh: false, standing: 10 - b };
  return { frame: f, ball: 2, fresh: true, standing: 10 }; // a spare
}

export function gameOver(rolls: readonly number[]): boolean {
  const frames = splitFrames(rolls);
  if (frames.length < FRAMES) return false;
  const t = frames[FRAMES - 1];
  if (t.length === 3) return true;
  return t.length === 2 && t[0] !== 10 && t[0] + t[1] < 10;
}

/** Can this many pins fall on the next ball? (Guards the UI and the tests.) */
export function validRoll(rolls: readonly number[], pins: number): boolean {
  return !gameOver(rolls) && Number.isInteger(pins) && pins >= 0 && pins <= nextBall(rolls).standing;
}

/** Strikes and spares in a game (end card chips). */
export function tally(rolls: readonly number[]): { strikes: number; spares: number; opens: number } {
  let strikes = 0, spares = 0, opens = 0;
  splitFrames(rolls).forEach((fr, i) => {
    const marks = frameMarks(fr, i === FRAMES - 1);
    for (const m of marks) if (m === 'X') strikes++;
      else if (m === '/') spares++;
    if (i < FRAMES - 1 && fr.length === 2 && fr[0] + fr[1] < 10) opens++;
    if (i === FRAMES - 1 && fr.length === 2 && fr[0] + fr[1] < 10) opens++;
  });
  return { strikes, spares, opens };
}

/** Strikes in a row ending at the last roll (for DOUBLE / TURKEY calls). */
export function strikeRun(rolls: readonly number[]): number {
  // Walk the balls with rack awareness: only first balls on a fresh rack can be strikes.
  let run = 0;
  const seq: boolean[] = [];
  const r: number[] = [];
  for (const v of rolls) {
    const nb = nextBall(r);
    seq.push(nb.fresh && v === 10);
    r.push(v);
  }
  for (let i = seq.length - 1; i >= 0 && seq[i]; i--) run++;
  return run;
}

// ================================================================ the lane

export const LANE = {
  /** Half the lane's width (41.5 in: 39 boards). */
  half: 20.75,
  /** Gutter width. */
  gutter: 9.25,
  /** Kickback walls (side boards at the pin deck). */
  kick: 30,
  /** Foul line to the head pin. */
  head: 720,
  /** The end of the pin deck: past here it's the pit. */
  deck: 757,
  /** Where the ball (or a pin) is gone for good. */
  pit: 775,
  /** The arrows (about 15 ft). */
  arrows: 180,
  /** Board width. */
  board: 41.5 / 39,
} as const;

export const BALL_R = 4.3, BALL_M = 15;
export const PIN_R = 2.4, PIN_L = 15, PIN_M = 3.5;
/** Pin centre of mass, inches up from its base (a lying pin is drawn around it). */
const PIN_COM = 5.5;
const PIN_I = (PIN_M * PIN_L * PIN_L) / 12;

/** Pin spots: 1 at the front, 7-8-9-10 at the back, 12 in apart. */
export const RACK: readonly { n: number; x: number; z: number }[] = (() => {
  const rows = [[1], [2, 3], [4, 5, 6], [7, 8, 9, 10]];
  const out: { n: number; x: number; z: number }[] = [];
  rows.forEach((row, r) => row.forEach((n, k) => out.push({ n, x: (k - (row.length - 1) / 2) * 12, z: LANE.head + r * 10.392 })));
  return out;
})();

export type PinState = 'up' | 'tip' | 'down' | 'out';

export interface Pin {
  n: number;
  /** Base (standing or tipping) or centre of mass (lying down). */
  x: number;
  z: number;
  vx: number;
  vz: number;
  state: PinState;
  /** 0 standing … 1 flat. */
  tilt: number;
  tiltV: number;
  /** Which way it tips / lies: 0 = down the lane, + = to the right. */
  a: number;
  /** Spin of a lying pin (rad/s). */
  w: number;
  /** A nudged pin wobbles (visual only, 0..1). */
  wob: number;
}

export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Hook: + curves right, − curves left (−1..1). */
  spin: number;
  /** Fell in a gutter (-1 left, 1 right, 0 no). */
  gutter: number;
  /** Rolled into the pit. */
  out: boolean;
  /** Rolled distance (for drawing the finger holes going round). */
  roll: number;
}

export interface Throw {
  /** Release spot across the lane (inches from centre). */
  x: number;
  /** Aim off straight (radians, + = to the right). */
  angle: number;
  /** Ball speed (inches per second: 300 ≈ 17 mph). */
  speed: number;
  /** Hook (−1..1): + hooks right, − hooks left. */
  spin: number;
}

export type LaneEventKind = 'hit' | 'pin' | 'gutter' | 'kick' | 'pit' | 'fall';
export interface LaneEvent {
  k: LaneEventKind;
  /** How hard (inches per second of impact). */
  s: number;
  x: number;
  z: number;
}

export interface Lane {
  ball: Ball | null;
  pins: Pin[];
  /** Seconds since the throw. */
  t: number;
  /** When the ball first reached the pins (−1 until then). */
  hitAt: number;
  /** New since the UI last drained them. */
  events: LaneEvent[];
}

export const SPEED = { min: 190, max: 400 } as const;
/** in/s → mph (for the HUD). */
export const mph = (v: number): number => (v * 3600) / 63360;

export function newPin(n: number, x: number, z: number): Pin {
  return { n, x, z, vx: 0, vz: 0, state: 'up', tilt: 0, tiltV: 0, a: 0, w: 0, wob: 0 };
}

/** A fresh rack of ten. `jitter` nudges spots a hair (real pinsetters aren't perfect). */
export function newRack(rand: Rand = Math.random, jitter = 0.15): Pin[] {
  return RACK.map((p) => newPin(p.n, p.x + (rand() - 0.5) * jitter, p.z + (rand() - 0.5) * jitter));
}

/** Only these pin numbers, on their spots (tests, spare drills). */
export function rackOf(nums: readonly number[]): Pin[] {
  return RACK.filter((p) => nums.includes(p.n)).map((p) => newPin(p.n, p.x, p.z));
}

export function newLane(pins: Pin[]): Lane {
  return { ball: null, pins, t: 0, hitAt: -1, events: [] };
}

export const standing = (pins: readonly Pin[]): Pin[] => pins.filter((p) => p.state === 'up');

/** The sweep: deadwood goes, standing pins stay where they are (re-spotted, still). */
export function clearDeadwood(pins: readonly Pin[]): Pin[] {
  return pins.filter((p) => p.state === 'up').map((p) => ({ ...p, vx: 0, vz: 0, wob: 0, tilt: 0, tiltV: 0 }));
}

/** Roll the ball. */
export function release(lane: Lane, th: Throw): void {
  const speed = clamp(th.speed, SPEED.min * 0.5, SPEED.max * 1.1);
  const a = clamp(th.angle, -0.2, 0.2);
  lane.ball = { x: clamp(th.x, -LANE.half + BALL_R, LANE.half - BALL_R), z: -8, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, spin: clamp(th.spin, -1, 1), gutter: 0, out: false, roll: 0 };
  lane.t = 0;
  lane.hitAt = -1;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number): number => {
  const k = clamp((v - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/** Hook strength: lateral in/s² at full spin on the dry back end. */
export const HOOK = 46;
/** The oil runs out here (the ball skids before, hooks after). */
const OIL_FROM = 360, OIL_TO = 620;

/** Advance the ball alone (no pins): the hook on the back end, a little drag. */
function moveBall(b: Ball, dt: number): void {
  if (b.out) return;
  if (b.gutter) {
    const gx = b.gutter * (LANE.half + LANE.gutter / 2);
    b.x += (gx - b.x) * Math.min(1, dt * 14);
    b.vx = 0;
    b.vz = Math.max(60, b.vz - 10 * dt);
  } else {
    const sp = Math.hypot(b.vx, b.vz);
    const hook = b.spin * HOOK * smooth(OIL_FROM, OIL_TO, b.z);
    b.vx += hook * dt;
    // Keep the speed (the hook turns the ball, it doesn't push it), minus a little drag.
    const k = Math.max(0, sp - 5 * dt) / Math.max(1e-6, Math.hypot(b.vx, b.vz));
    b.vx *= k;
    b.vz *= k;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.roll += Math.hypot(b.vx, b.vz) * dt;
  if (!b.gutter && b.z < LANE.deck && Math.abs(b.x) > LANE.half) b.gutter = Math.sign(b.x);
  if (b.z > LANE.pit || b.vz <= 0) b.out = true;
}

/** Where the ball (alone) crosses `z`: its x. Used to aim (the computer bowler, tests). */
export function ballXAt(th: Throw, z: number): number {
  const lane = newLane([]);
  release(lane, th);
  const b = lane.ball!;
  const dt = 1 / 240;
  for (let i = 0; i < 4000 && b.z < z && !b.out; i++) moveBall(b, dt);
  return b.gutter ? b.gutter * (LANE.half + LANE.gutter / 2) : b.x;
}

/** The angle that sends a throw through (tx, tz). */
export function aimAngle(th: Omit<Throw, 'angle'>, tx: number, tz: number): number {
  let lo = -0.12, hi = 0.12;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2;
    const x = ballXAt({ ...th, angle: mid }, tz);
    if (x < tx) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---- collisions --------------------------------------------------------

/** Collision circles of a pin: [x, z, r, offset along the axis from the body's reference]. */
interface Circ {
  x: number;
  z: number;
  r: number;
  /** Offset from the body's reference point (for spin). */
  ox: number;
  oz: number;
  /** Velocity of this point. */
  vx: number;
  vz: number;
}

const CIRC_POOL: Circ[][] = Array.from({ length: 12 }, () => Array.from({ length: 3 }, () => ({ x: 0, z: 0, r: 0, ox: 0, oz: 0, vx: 0, vz: 0 })));

function circles(p: Pin, into: Circ[]): number {
  const dx = Math.sin(p.a), dz = Math.cos(p.a);
  const set = (c: Circ, off: number, r: number, swing: number) => {
    c.ox = dx * off;
    c.oz = dz * off;
    c.x = p.x + c.ox;
    c.z = p.z + c.oz;
    c.r = r;
    c.vx = p.vx + dx * swing;
    c.vz = p.vz + dz * swing;
  };
  if (p.state === 'up') {
    set(into[0], 0, PIN_R, 0);
    return 1;
  }
  if (p.state === 'tip') {
    const s = Math.sin((p.tilt * Math.PI) / 2);
    const swing = p.tiltV * Math.cos((p.tilt * Math.PI) / 2) * (Math.PI / 2);
    set(into[0], 4.5 * s, PIN_R, 4.5 * swing);
    if (p.tilt < 0.2) return 1;
    set(into[1], 12.5 * s, 1.6, 12.5 * swing);
    return 2;
  }
  // Lying down: the belly, the head, the base (spin adds w × r to each).
  const pts: [number, number][] = [[4.5 - PIN_COM, PIN_R], [12.5 - PIN_COM, 1.6], [0.6 - PIN_COM, 1.7]];
  pts.forEach(([off, r], i) => {
    set(into[i], off, r, 0);
    into[i].vx += -p.w * into[i].oz;
    into[i].vz += p.w * into[i].ox;
  });
  return 3;
}

/** A standing pin got hit: over it goes, or it just wobbles. */
function knock(lane: Lane, p: Pin, dv: number, rand: Rand): void {
  if (p.state !== 'up') return;
  if (dv > 16) {
    p.state = 'tip';
    p.a = Math.atan2(p.vx, p.vz) + (rand() - 0.5) * 1.2;
    p.tilt = 0.02;
    p.tiltV = clamp(dv / 70, 1.6, 7);
    lane.events.push({ k: 'fall', s: dv, x: p.x, z: p.z });
  } else p.wob = Math.min(1, p.wob + dv / 14);
}

/** Resolve two circles of two bodies. Returns the impulse (0 if none). */
function resolve(
  a: Circ, ma: number, b: Circ, mb: number, e: number,
  applyA: (jx: number, jz: number, c: Circ, px: number, pz: number) => void,
  applyB: (jx: number, jz: number, c: Circ, px: number, pz: number) => void,
): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const rr = a.r + b.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr || d2 < 1e-9) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d, nz = dz / d;
  const pen = rr - d;
  const ia = 1 / ma, ib = 1 / mb;
  // Push apart by inverse mass.
  const pa = (pen * ia) / (ia + ib), pb = (pen * ib) / (ia + ib);
  const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  let j = 0;
  if (vn < 0) j = (-(1 + e) * vn) / (ia + ib);
  applyA(-j * nx, -j * nz, a, -pa * nx, -pa * nz);
  applyB(j * nx, j * nz, b, pb * nx, pb * nz);
  return j;
}

const STEP = 1 / 240;
const pinTmp: Circ[][] = CIRC_POOL;
const ballC: Circ = { x: 0, z: 0, r: BALL_R, ox: 0, oz: 0, vx: 0, vz: 0 };

/** Advance the lane by dt seconds (fixed 1/240 s steps inside). */
export function stepLane(lane: Lane, dt: number, rand: Rand = Math.random): void {
  let left = Math.min(dt, 0.1);
  while (left > 1e-9) {
    const h = Math.min(STEP, left);
    left -= h;
    tick(lane, h, rand);
  }
}

function tick(lane: Lane, dt: number, rand: Rand): void {
  lane.t += dt;
  const b = lane.ball;
  if (b && !b.out) {
    const wasGutter = b.gutter;
    moveBall(b, dt);
    if (!wasGutter && b.gutter) lane.events.push({ k: 'gutter', s: Math.abs(b.vz), x: b.x, z: b.z });
    if (b.out) lane.events.push({ k: 'pit', s: Math.abs(b.vz), x: b.x, z: b.z });
  }
  const pins = lane.pins;
  // Pins move.
  for (const p of pins) {
    if (p.state === 'out') continue;
    p.wob = Math.max(0, p.wob - dt * 1.6);
    if (p.state === 'up') {
      const f = Math.exp(-7 * dt);
      p.vx *= f;
      p.vz *= f;
    } else if (p.state === 'tip') {
      p.tiltV += 9 * dt;
      p.tilt += p.tiltV * dt;
      const f = Math.exp(-2.2 * dt);
      p.vx *= f;
      p.vz *= f;
      if (p.tilt >= 1) {
        // Flat: switch to the lying body (centre of mass up the axis).
        p.tilt = 1;
        p.state = 'down';
        const swing = p.tiltV * PIN_COM * 0.35;
        p.x += Math.sin(p.a) * PIN_COM;
        p.z += Math.cos(p.a) * PIN_COM;
        p.vx += Math.sin(p.a) * swing;
        p.vz += Math.cos(p.a) * swing;
        p.w = (rand() - 0.5) * 2;
        lane.events.push({ k: 'pin', s: 30 + p.tiltV * 8, x: p.x, z: p.z });
      }
    } else {
      const f = Math.exp(-2.4 * dt);
      p.vx *= f;
      p.vz *= f;
      p.w *= Math.exp(-2.2 * dt);
      p.a += p.w * dt;
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    // Off the deck.
    const sp = Math.hypot(p.vx, p.vz);
    if (p.z > LANE.deck) {
      p.state = 'out';
      lane.events.push({ k: 'pit', s: sp, x: p.x, z: p.z });
      continue;
    }
    if (Math.abs(p.x) > LANE.kick - 2) {
      p.x = Math.sign(p.x) * (LANE.kick - 2);
      p.vx = -p.vx * 0.5;
      p.w = -p.w;
      lane.events.push({ k: 'kick', s: sp, x: p.x, z: p.z });
    }
    if (Math.abs(p.x) > LANE.half + 1 && sp < 70) {
      // Into the gutter.
      if (p.state === 'up') lane.events.push({ k: 'fall', s: sp, x: p.x, z: p.z });
      p.state = 'out';
    }
  }
  // Ball against pins.
  if (b && !b.out && !b.gutter && b.z > LANE.head - 30) {
    ballC.x = b.x;
    ballC.z = b.z;
    ballC.vx = b.vx;
    ballC.vz = b.vz;
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      if (p.state === 'out' || Math.abs(p.x - b.x) > 24 || Math.abs(p.z - b.z) > 24) continue;
      const cs = pinTmp[i];
      const n = circles(p, cs);
      for (let k = 0; k < n; k++) {
        const bvx = p.vx, bvz = p.vz;
        const j = resolve(ballC, BALL_M, cs[k], PIN_M, 0.72,
          (jx, jz, _c, px, pz) => {
            b.vx += jx / BALL_M;
            b.vz += jz / BALL_M;
            b.x += px;
            b.z += pz;
            ballC.x = b.x;
            ballC.z = b.z;
            ballC.vx = b.vx;
            ballC.vz = b.vz;
          },
          (jx, jz, c, px, pz) => applyPin(p, jx, jz, c, px, pz),
        );
        if (j > 0) {
          const dv = Math.hypot(p.vx - bvx, p.vz - bvz);
          if (lane.hitAt < 0) lane.hitAt = lane.t;
          lane.events.push({ k: 'hit', s: dv, x: p.x, z: p.z });
          knock(lane, p, dv, rand);
          if (p.state !== 'up') break;
        }
      }
    }
  }
  // Pins against pins.
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i];
    if (p.state === 'out') continue;
    for (let j = i + 1; j < pins.length; j++) {
      const q = pins[j];
      if (q.state === 'out') continue;
      if (p.state === 'up' && q.state === 'up' && p.vx * p.vx + p.vz * p.vz + q.vx * q.vx + q.vz * q.vz < 4) continue;
      if (Math.abs(p.x - q.x) > 32 || Math.abs(p.z - q.z) > 32) continue;
      const cp = pinTmp[i], cq = pinTmp[j];
      const np = circles(p, cp);
      const nq = circles(q, cq);
      for (let a = 0; a < np; a++)
        for (let c = 0; c < nq; c++) {
          const pvx = p.vx, pvz = p.vz, qvx = q.vx, qvz = q.vz;
          const jj = resolve(cp[a], PIN_M, cq[c], PIN_M, 0.45, (jx, jz, cc, px, pz) => applyPin(p, jx, jz, cc, px, pz), (jx, jz, cc, px, pz) => applyPin(q, jx, jz, cc, px, pz));
          if (jj > 0) {
            const dvp = Math.hypot(p.vx - pvx, p.vz - pvz), dvq = Math.hypot(q.vx - qvx, q.vz - qvz);
            if (jj / PIN_M > 25) lane.events.push({ k: 'pin', s: jj / PIN_M, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
            knock(lane, p, dvp, rand);
            knock(lane, q, dvq, rand);
            // Circles moved: refresh them for the next pair.
            circles(p, cp);
            circles(q, cq);
          }
        }
    }
  }
}

function applyPin(p: Pin, jx: number, jz: number, c: Circ, px: number, pz: number): void {
  p.vx += jx / PIN_M;
  p.vz += jz / PIN_M;
  p.x += px;
  p.z += pz;
  if (p.state === 'down') p.w += (c.ox * jz - c.oz * jx) / PIN_I;
}

/** Done rolling: the ball is gone and every pin has come to rest. */
export function settled(lane: Lane): boolean {
  const b = lane.ball;
  if (b && !b.out) return false;
  if (lane.t > 12) return true;
  if (lane.hitAt >= 0 && lane.t - lane.hitAt > 5) return true;
  for (const p of lane.pins) {
    if (p.state === 'out') continue;
    if (p.state === 'tip') return false;
    const sp = Math.hypot(p.vx, p.vz);
    if (p.state === 'up' && (sp > 3 || p.wob > 0.15)) return false;
    if (p.state === 'down' && (sp > 4 || Math.abs(p.w) > 0.5)) return false;
  }
  return true;
}

/** Run the lane to rest (headless: the computer's balls when skipped, tests). Returns seconds simulated. */
export function settle(lane: Lane, rand: Rand = Math.random, maxSeconds = 14): number {
  const t0 = lane.t;
  while (!settled(lane) && lane.t - t0 < maxSeconds) stepLane(lane, 0.05, rand);
  lane.events.length = 0;
  return lane.t - t0;
}

/** Throw at a rack and let it all fall: how many pins went down. */
export function bowlBall(pins: Pin[], th: Throw, rand: Rand = Math.random): { down: number; lane: Lane } {
  const before = standing(pins).length;
  const lane = newLane(pins);
  release(lane, th);
  settle(lane, rand);
  return { down: before - standing(lane.pins).length, lane };
}

/** Pin numbers left after a first ball make a split? (Head pin gone, standing pins not touching.) */
export function isSplit(nums: readonly number[]): boolean {
  if (nums.length < 2 || nums.includes(1)) return false;
  const pos = RACK.filter((p) => nums.includes(p.n));
  const seen = new Set<number>([pos[0].n]);
  const queue = [pos[0]];
  while (queue.length) {
    const c = queue.pop()!;
    for (const o of pos) if (!seen.has(o.n) && Math.hypot(o.x - c.x, o.z - c.z) < 12.5) (seen.add(o.n), queue.push(o));
  }
  return seen.size < pos.length;
}

// ======================================================== the computer bowler

/** A normal-ish random number (mean 0, sd 1). */
function gauss(rand: Rand): number {
  return (rand() + rand() + rand() + rand() - 2) * 1.732;
}

/**
 * The computer's ball for these pins at skill 0..1. A good bowler hooks
 * into the pocket on a full rack and shoots spares straight; everyone
 * misses a bit, the casuals more (and now and then one finds the gutter).
 */
export function npcThrow(skill: number, pins: readonly Pin[], rand: Rand = Math.random): Throw {
  const k = clamp(Number.isFinite(skill) ? skill : 0.5, 0, 1);
  const up = standing(pins);
  let th: Omit<Throw, 'angle'>;
  let tx: number, tz: number;
  if (up.length === 10 || up.length === 0) {
    const hooks = k > 0.4;
    th = hooks ? { x: 8 + rand() * 4, speed: 285 + k * 45, spin: -(0.35 + 0.45 * k) } : { x: 4 + rand() * 4, speed: 250 + k * 50, spin: 0 };
    tx = 2.6;
    tz = LANE.head;
  } else {
    // Aim at the front pin, leaning toward the middle of what's left.
    const front = up.reduce((a, p) => (p.z < a.z ? p : a), up[0]);
    const mid = up.reduce((a, p) => a + p.x, 0) / up.length;
    tx = up.length === 1 ? front.x : front.x * 0.55 + mid * 0.45;
    tz = front.z;
    th = { x: clamp(-tx * 0.6, -14, 14), speed: 270 + k * 50, spin: 0 };
  }
  // The miss, by skill.
  const sdA = 0.0012 + (1 - k) * 0.013;
  const out: Throw = {
    x: th.x + gauss(rand) * (0.6 + (1 - k) * 2.5),
    angle: 0,
    speed: th.speed * (1 + gauss(rand) * (0.02 + (1 - k) * 0.06)),
    spin: clamp(th.spin + gauss(rand) * (0.05 + (1 - k) * 0.18), -1, 1),
  };
  out.angle = aimAngle(out, tx, tz) + gauss(rand) * sdA;
  // Now and then a casual one slips.
  if (rand() < 0.07 * (1 - k)) out.angle += (rand() < 0.5 ? -1 : 1) * (0.025 + rand() * 0.02);
  return out;
}

/** A whole game by the computer (headless). */
export function npcGame(skill: number, rand: Rand = Math.random): number[] {
  const rolls: number[] = [];
  let pins = newRack(rand);
  while (!gameOver(rolls)) {
    const nb = nextBall(rolls);
    if (nb.fresh) pins = newRack(rand);
    const r = bowlBall(pins, npcThrow(skill, pins, rand), rand);
    rolls.push(Math.min(nb.standing, r.down));
    pins = clearDeadwood(r.lane.pins);
  }
  return rolls;
}

// ================================================================ you

export interface BowlingResult {
  best: boolean;
  /** Bowled 200 or more (a moodlet). */
  twoHundred: boolean;
  fun: number;
  social: number;
}

/** A finished game: fun (and social with company), a personal best, a moodlet for 200+. */
export function finishBowling(s: GameState, score: number, opts: { versus?: boolean; won?: boolean; strikes?: number } = {}): BowlingResult {
  const sc = clamp(Math.round(Number.isFinite(score) ? score : 0), 0, 300);
  const b = (s.bowling ??= { best: 0, games: 0, strikes: 0 });
  b.best ??= 0;
  b.games = (b.games ?? 0) + 1;
  b.strikes = (b.strikes ?? 0) + Math.max(0, Math.round(opts.strikes ?? 0));
  const best = sc > b.best;
  if (best) b.best = sc;
  // The arcade's 🏆 board reads its bests from here.
  const f = (s.fun ??= { tickets: 0, best: {}, bets: [], casinoNet: 0 });
  f.best ??= {};
  if (sc > (f.best.bowling ?? 0)) f.best.bowling = sc;
  const fun = Math.round(10 + Math.min(12, sc / 20) + (opts.won ? 3 : 0));
  const social = opts.versus ? 10 : 0;
  applyNeeds(s, { fun, social, energy: -5 });
  const twoHundred = sc >= 200;
  if (twoHundred) addMoodlet(s, { id: 'bowl200', label: sc === 300 ? 'Bowled a perfect game' : 'Bowled a 200', emoji: '🎳', value: sc === 300 ? 14 : 8, minutes: 240 });
  else if (opts.won) addMoodlet(s, { id: 'bowlwin', label: 'Won at bowling', emoji: '🎳', value: 4, minutes: 120 });
  return { best, twoHundred, fun, social };
}

export const bowlingBest = (s: GameState): number => s.bowling?.best ?? 0;

/** A small seeded generator (mulberry32) for tests and replays. */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
