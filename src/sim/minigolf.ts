// =====================================================================
// minigolf.ts — ⛳ rooftop mini golf: nine holes, the ball physics, the
// cup, the computer player's putts and the scoring. Pure logic, no DOM;
// the course is drawn by ui/minigolf.ts.
//
// Units: one unit ≈ an inch of turf, y grows down the screen. The ball
// rolls with friction that is part constant, part speed based (a soft
// putt dies gently, a hard one carries), banks off walls with a little
// loss, and is moved in sub-steps short enough that it never tunnels.
//
// Surfaces: 🏖️ sand (heavy friction), 💦 water (a penalty stroke and the
// ball goes back to where it was hit from), ramps (a constant push one
// way), hills (a push outward from the top), 🚇 subway grates (in one,
// out of a manhole elsewhere). Obstacles: walls and blocks, bumpers
// that kick, a 🚕 cab that drives back and forth and a spinning
// turnstile. Moving things are a function of the hole's clock `t`, so a
// shot replays exactly from the same start time (the computer player
// plans with the same physics you putt with).
//
// The cup takes the ball only when it's slow enough (CUP_SPEED); faster
// and it lips out, kicked sideways by how far off-centre it rolled over.
//
// Max 8 strokes a hole (then you pick up and take an 8).
// Leaderboard score (higher is better):
//   score = max(0, (parTotal + 18) − strokes) × 10
// so a par round (27) scores 180, every stroke under par is +10, and
// nine holes-in-one would be 360.
// =====================================================================

import { addMoodlet, applyNeeds } from './needs.ts';
import type { GameState } from './types.ts';

export type Rand = () => number;
export type Pt = readonly [number, number];

/** A round costs $12 (cents), through sim/casino.ts → stake. */
export const MINIGOLF_COST = 1_200;
export const MAX_STROKES = 8;

export const BALL_R = 1.2;
export const CUP_R = 2.1;
/** Ball speed at full power (units/s). */
export const MAX_SPEED = 125;
/** Faster than this over the cup and it lips out. */
export const CUP_SPEED = 27;
/** Physics step the UI and the planner both use (seconds). */
export const STEP = 1 / 120;

const GREEN = { a: 14, k: 0.55 };
const SAND = { a: 75, k: 2.6 };
const E_WALL = 0.78; // wall restitution
const GRIP = 0.97; // tangential speed kept off a wall
const MAX_MOVE = 0.35; // longest move per sub-step
const PULL_R = 3.3; // the cup's gentle pull reaches this far (centre to centre)
const PULL_A = 26; // ...with this acceleration (beats green friction: a ball resting on the lip drops)
const SHOT_CAP = 25; // seconds: a shot that somehow never stops is stopped

// ------------------------------------------------------------------ holes

export interface Circle { x: number; y: number; r: number }
export type ZoneKind = 'sand' | 'water' | 'ramp' | 'hill' | 'street';
export interface Zone {
  kind: ZoneKind;
  poly?: Pt[];
  circle?: Circle;
  /** Ramp: the push (units/s², a vector). Must beat green friction so nothing rests on a ramp. */
  push?: Pt;
  /** Hill: outward push (units/s²). */
  lift?: number;
}
export interface Bumper extends Circle {
  /** 'bumper' kicks the ball away; the others are just solid. */
  kind: 'bumper' | 'hydrant' | 'post';
}
/** A 🚕 driving between two centre points (smooth ping-pong). */
export interface Cab { ax: number; ay: number; bx: number; by: number; w: number; h: number; period: number; phase: number }
/** A spinning turnstile: arms from a solid hub. */
export interface Spinner { x: number; y: number; hub: number; len: number; arms: number; omega: number; a0: number }
/** A 🚇 subway grate: falls in here, rolls out of the manhole at `to` heading `dir` (radians). */
export interface Grate { x: number; y: number; r: number; to: { x: number; y: number }; dir: number }

export interface Hole {
  n: number;
  id: string;
  name: string;
  emoji: string;
  par: number;
  /** One line under the hole's name. */
  tip: string;
  /** The playable area (the ball stays inside). */
  outer: Pt[];
  /** Solid blocks inside it. */
  blocks: Pt[][];
  zones: Zone[];
  bumpers: Bumper[];
  cabs: Cab[];
  spinners: Spinner[];
  grates: Grate[];
  tee: { x: number; y: number };
  cup: { x: number; y: number };
}

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** A rectangle with its corners cut (c units). */
const box = (x0: number, y0: number, x1: number, y1: number, c = 4): Pt[] => [
  [x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c],
];

const base = { blocks: [], zones: [], bumpers: [], cabs: [], spinners: [], grates: [] };

export const HOLES: Hole[] = [
  {
    ...base, n: 1, id: 'walkup', name: 'Walk-Up Warm-Up', emoji: '🏢', par: 2,
    tip: 'Straight shot. Stretch first.',
    outer: box(0, 0, 30, 90),
    tee: { x: 15, y: 80 }, cup: { x: 15, y: 14 },
  },
  {
    ...base, n: 2, id: 'dogleg', name: 'Dogleg on Delancey', emoji: '↪️', par: 3,
    tip: 'Turns right at the top. The cut corner banks.',
    outer: [[0, 12], [12, 0], [70, 0], [70, 30], [28, 30], [28, 100], [0, 100]],
    tee: { x: 14, y: 90 }, cup: { x: 60, y: 15 },
  },
  {
    ...base, n: 3, id: 'cab', name: 'Yellow Cab Crossing', emoji: '🚕', par: 3,
    tip: 'Wait for the cab. It will not wait for you.',
    outer: box(0, 0, 50, 110),
    zones: [{ kind: 'street', poly: rect(0, 47, 50, 63) }],
    bumpers: [{ x: 11, y: 32, r: 2, kind: 'hydrant' }, { x: 39, y: 32, r: 2, kind: 'hydrant' }],
    cabs: [{ ax: 12, ay: 55, bx: 38, by: 55, w: 16, h: 9, period: 3.2, phase: 0 }],
    tee: { x: 25, y: 100 }, cup: { x: 25, y: 14 },
  },
  {
    ...base, n: 4, id: 'turnstile', name: 'Turnstile Spin', emoji: '🎡', par: 3,
    tip: 'Time it through the turnstile. No MetroCard needed.',
    outer: box(0, 0, 54, 100),
    blocks: [rect(0, 48, 17, 53), rect(37, 48, 54, 53)],
    bumpers: [{ x: 27, y: 50.5, r: 2.5, kind: 'post' }],
    spinners: [{ x: 27, y: 50.5, hub: 2.5, len: 7, arms: 3, omega: 1.4, a0: 0 }],
    tee: { x: 27, y: 90 }, cup: { x: 27, y: 14 },
  },
  {
    ...base, n: 5, id: 'sand', name: 'Bodega Sand Traps', emoji: '🏖️', par: 3,
    tip: 'Around the bodega. Sand eats putts.',
    outer: box(0, 0, 60, 100),
    blocks: [rect(22, 44, 38, 58)],
    zones: [
      { kind: 'sand', circle: { x: 14, y: 20, r: 8 } },
      { kind: 'sand', circle: { x: 46, y: 20, r: 8 } },
      { kind: 'sand', poly: rect(20, 64, 40, 71) },
    ],
    tee: { x: 30, y: 90 }, cup: { x: 30, y: 14 },
  },
  {
    ...base, n: 6, id: 'water', name: 'Hudson Overflow', emoji: '💦', par: 3,
    tip: 'Take the bridge or the long way. The river takes a stroke.',
    outer: box(0, 0, 56, 105),
    zones: [
      { kind: 'water', poly: rect(8, 44, 22, 62) },
      { kind: 'water', poly: rect(28, 44, 56, 62) },
    ],
    tee: { x: 46, y: 94 }, cup: { x: 12, y: 14 },
  },
  {
    ...base, n: 7, id: 'ramp', name: 'Bridge Ramp', emoji: '🌉', par: 3,
    tip: 'Uphill. Too soft and it rolls right back to you.',
    outer: box(0, 0, 50, 112),
    zones: [{ kind: 'ramp', poly: rect(0, 42, 50, 72), push: [0, 38] }],
    blocks: [rect(19, 29, 31, 33)],
    bumpers: [{ x: 10, y: 26, r: 2.5, kind: 'bumper' }, { x: 40, y: 26, r: 2.5, kind: 'bumper' }],
    tee: { x: 25, y: 100 }, cup: { x: 25, y: 16 },
  },
  {
    ...base, n: 8, id: 'grate', name: 'Union Square Transfer', emoji: '🚇', par: 3,
    tip: 'Sink it in the subway grate to pop out up top. Or take the long way round.',
    outer: box(0, 0, 60, 104),
    blocks: [rect(0, 44, 48, 58)],
    bumpers: [{ x: 54, y: 72, r: 2.4, kind: 'bumper' }],
    grates: [{ x: 26, y: 78, r: 3.4, to: { x: 52, y: 12 }, dir: Math.PI }],
    tee: { x: 12, y: 94 }, cup: { x: 14, y: 16 },
  },
  {
    ...base, n: 9, id: 'rock', name: 'Top of the Rock', emoji: '🗽', par: 4,
    tip: 'Up the zigzag, past the river, over the hump. Finish strong.',
    outer: box(0, 0, 64, 124),
    blocks: [rect(0, 82, 42, 88), rect(22, 38, 64, 44)],
    zones: [
      { kind: 'water', poly: [[0, 60], [14, 60], [24, 82], [0, 82]] },
      { kind: 'hill', circle: { x: 30, y: 20, r: 8 }, lift: 30 },
      { kind: 'sand', circle: { x: 56, y: 30, r: 5 } },
    ],
    bumpers: [{ x: 36, y: 66, r: 2.5, kind: 'bumper' }, { x: 52, y: 54, r: 2.5, kind: 'bumper' }],
    tee: { x: 54, y: 112 }, cup: { x: 50, y: 14 },
  },
];

export const PAR_TOTAL = HOLES.reduce((a, h) => a + h.par, 0);

// --------------------------------------------------------------- geometry

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function pointInPoly(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inZone(z: Zone, x: number, y: number): boolean {
  if (z.circle) return (x - z.circle.x) ** 2 + (y - z.circle.y) ** 2 < z.circle.r ** 2;
  return !!z.poly && pointInPoly(x, y, z.poly);
}

/** The ball's centre is on the course: inside the outer wall and outside every block. */
export function inBounds(h: Hole, x: number, y: number): boolean {
  return pointInPoly(x, y, h.outer) && !h.blocks.some((b) => pointInPoly(x, y, b));
}

type Seg = [number, number, number, number];
const segCache = new WeakMap<Hole, Seg[]>();
/** Every static wall edge (outer outline and the blocks). */
export function wallSegments(h: Hole): Seg[] {
  let s = segCache.get(h);
  if (s) return s;
  s = [];
  for (const poly of [h.outer, ...h.blocks]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s.push([a[0], a[1], b[0], b[1]]);
  }
  segCache.set(h, s);
  return s;
}

/** Distance from a point to the nearest static wall. */
export function wallDistance(h: Hole, x: number, y: number): number {
  let best = Infinity;
  for (const [x1, y1, x2, y2] of wallSegments(h)) {
    const sx = x2 - x1, sy = y2 - y1;
    const t = clamp(((x - x1) * sx + (y - y1) * sy) / (sx * sx + sy * sy), 0, 1);
    best = Math.min(best, Math.hypot(x - (x1 + sx * t), y - (y1 + sy * t)));
  }
  return best;
}

/** Where a cab is at time t, and how fast it's going. */
export function cabAt(c: Cab, t: number): { x: number; y: number; vx: number; vy: number } {
  const w = (2 * Math.PI) / c.period;
  const k = (1 - Math.cos(w * t + c.phase)) / 2;
  const dk = (Math.sin(w * t + c.phase) * w) / 2;
  return { x: c.ax + (c.bx - c.ax) * k, y: c.ay + (c.by - c.ay) * k, vx: (c.bx - c.ax) * dk, vy: (c.by - c.ay) * dk };
}

export const spinnerAngle = (sp: Spinner, t: number): number => sp.a0 + sp.omega * t;

// ---------------------------------------------------------------- physics

export interface Ball { x: number; y: number; vx: number; vy: number; /** Over the cup right now (a lip-out fires once per pass). */ overCup?: boolean; inSand?: boolean }

export type MgEventType = 'wall' | 'bumper' | 'cab' | 'spin' | 'sand' | 'water' | 'grate' | 'lip' | 'cup';
export interface MgEvent { type: MgEventType; x: number; y: number; speed: number }

/** Friction on the surface under a point. */
function surface(h: Hole, x: number, y: number): { a: number; k: number; sand: boolean } {
  for (const z of h.zones) if (z.kind === 'sand' && inZone(z, x, y)) return { ...SAND, sand: true };
  return { ...GREEN, sand: false };
}

/** Ramps and hills: the push at a point. */
export function slopeAt(h: Hole, x: number, y: number): [number, number] {
  let gx = 0, gy = 0;
  for (const z of h.zones) {
    if (z.kind === 'ramp' && z.push && inZone(z, x, y)) (gx += z.push[0]), (gy += z.push[1]);
    if (z.kind === 'hill' && z.circle && z.lift && inZone(z, x, y)) {
      const dx = x - z.circle.x, dy = y - z.circle.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) (gx += (dx / d) * z.lift), (gy += (dy / d) * z.lift);
    }
  }
  return [gx, gy];
}

/** Could a ball rest here (no ramp or hill pushing harder than friction)? */
export function canRest(h: Hole, x: number, y: number): boolean {
  const [gx, gy] = slopeAt(h, x, y);
  return Math.hypot(gx, gy) <= surface(h, x, y).a;
}

/** Bounce the ball off a segment that may be moving (contact point velocity ox, oy). Returns impact speed (0 = no contact). */
function hitSeg(b: Ball, x1: number, y1: number, x2: number, y2: number, ox: number, oy: number, e: number, grip: number): number {
  const sx = x2 - x1, sy = y2 - y1;
  const len2 = sx * sx + sy * sy;
  const t = len2 > 0 ? clamp(((b.x - x1) * sx + (b.y - y1) * sy) / len2, 0, 1) : 0;
  const cx = x1 + sx * t, cy = y1 + sy * t;
  let dx = b.x - cx, dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= BALL_R * BALL_R) return 0;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Dead on the line: push out against the way it was going.
    const l = Math.sqrt(len2) || 1;
    dx = -sy / l;
    dy = sx / l;
    if (dx * (b.vx - ox) + dy * (b.vy - oy) > 0) (dx = -dx), (dy = -dy);
    d = 1;
  }
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * BALL_R;
  b.y = cy + ny * BALL_R;
  const rvx = b.vx - ox, rvy = b.vy - oy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0.0001; // touching, already leaving
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  b.vx = ox - e * vn * nx + grip * vt * tx;
  b.vy = oy - e * vn * ny + grip * vt * ty;
  return -vn;
}

function hitCircle(b: Ball, c: Circle, e: number, kickMin: number): number {
  const dx = b.x - c.x, dy = b.y - c.y;
  const rr = c.r + BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = d2 ? dx / d : 0, ny = d2 ? dy / d : 1;
  b.x = c.x + nx * rr;
  b.y = c.y + ny * rr;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0.0001;
  const out = Math.max(-vn * e, kickMin);
  b.vx += (-vn + out) * nx;
  b.vy += (-vn + out) * ny;
  return -vn;
}

function substep(h: Hole, b: Ball, t: number, dt: number, ev: MgEvent[]): 'water' | 'cup' | null {
  const px = b.x, py = b.y;
  // Pushes: ramps, hills and the cup's pull on a slow ball.
  let [ax, ay] = slopeAt(h, b.x, b.y);
  let v = Math.hypot(b.vx, b.vy);
  const cdx = h.cup.x - b.x, cdy = h.cup.y - b.y, cd = Math.hypot(cdx, cdy);
  if (cd < PULL_R && cd > 1e-6 && v < CUP_SPEED) (ax += (cdx / cd) * PULL_A), (ay += (cdy / cd) * PULL_A);
  b.vx += ax * dt;
  b.vy += ay * dt;
  // Friction.
  const sf = surface(h, b.x, b.y);
  v = Math.hypot(b.vx, b.vy);
  if (v > 0) {
    const nv = v - (sf.a + sf.k * v) * dt;
    if (nv <= 0) b.vx = b.vy = 0;
    else (b.vx *= nv / v), (b.vy *= nv / v);
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // Walls.
  for (const [x1, y1, x2, y2] of wallSegments(h)) {
    const s = hitSeg(b, x1, y1, x2, y2, 0, 0, E_WALL, GRIP);
    if (s > 2) ev.push({ type: 'wall', x: b.x, y: b.y, speed: s });
  }
  // Bumpers, hydrants and posts.
  for (const c of h.bumpers) {
    const kick = c.kind === 'bumper';
    const s = hitCircle(b, c, kick ? 1.15 : 0.6, kick ? 42 : 0);
    if (s > (kick ? 0.5 : 2)) ev.push({ type: kick ? 'bumper' : 'wall', x: b.x, y: b.y, speed: s });
  }
  // Cabs (moving boxes).
  for (const c of h.cabs) {
    const p = cabAt(c, t);
    const x0 = p.x - c.w / 2, x1 = p.x + c.w / 2, y0 = p.y - c.h / 2, y1 = p.y + c.h / 2;
    let hit = 0;
    for (const [a, bb, cc, dd] of [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]] as Seg[]) hit = Math.max(hit, hitSeg(b, a, bb, cc, dd, p.vx, p.vy, 0.85, 0.9));
    if (hit > 3) ev.push({ type: 'cab', x: b.x, y: b.y, speed: hit });
  }
  // Turnstile arms.
  for (const sp of h.spinners) {
    const a0 = spinnerAngle(sp, t);
    for (let i = 0; i < sp.arms; i++) {
      const a = a0 + (i * 2 * Math.PI) / sp.arms;
      const cx = Math.cos(a), cy = Math.sin(a);
      const x1 = sp.x + cx * sp.hub, y1 = sp.y + cy * sp.hub, x2 = sp.x + cx * sp.len, y2 = sp.y + cy * sp.len;
      // Contact velocity: ω × r at the nearest point on the arm.
      const sx = x2 - x1, sy = y2 - y1;
      const k = clamp(((b.x - x1) * sx + (b.y - y1) * sy) / (sx * sx + sy * sy), 0, 1);
      const qx = x1 + sx * k - sp.x, qy = y1 + sy * k - sp.y;
      const s = hitSeg(b, x1, y1, x2, y2, -sp.omega * qy, sp.omega * qx, 0.6, 0.9);
      if (s > 3) ev.push({ type: 'spin', x: b.x, y: b.y, speed: s });
    }
  }
  // Never out of the course: if anything shoved the centre through a wall, put it back.
  if (!inBounds(h, b.x, b.y)) {
    b.x = px;
    b.y = py;
    b.vx *= -0.5;
    b.vy *= -0.5;
  }
  // Surfaces.
  const sand = surface(h, b.x, b.y).sand;
  if (sand && !b.inSand && Math.hypot(b.vx, b.vy) > 3) ev.push({ type: 'sand', x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) });
  b.inSand = sand;
  for (const z of h.zones) if (z.kind === 'water' && inZone(z, b.x, b.y)) {
    ev.push({ type: 'water', x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) });
    b.vx = b.vy = 0;
    return 'water';
  }
  for (const g of h.grates) if (Math.hypot(b.x - g.x, b.y - g.y) < g.r - 0.3) {
    const sp = Math.max(Math.hypot(b.vx, b.vy) * 0.85, 18);
    ev.push({ type: 'grate', x: g.x, y: g.y, speed: sp });
    b.x = g.to.x;
    b.y = g.to.y;
    b.vx = Math.cos(g.dir) * sp;
    b.vy = Math.sin(g.dir) * sp;
    b.overCup = false;
    return null;
  }
  // The cup.
  const dx = b.x - h.cup.x, dy = b.y - h.cup.y, d = Math.hypot(dx, dy);
  const speed = Math.hypot(b.vx, b.vy);
  if (d < CUP_R) {
    if (speed <= CUP_SPEED) {
      ev.push({ type: 'cup', x: h.cup.x, y: h.cup.y, speed });
      b.x = h.cup.x;
      b.y = h.cup.y;
      b.vx = b.vy = 0;
      return 'cup';
    }
    if (!b.overCup) {
      // Lip out: kicked sideways by how far off-centre it came over, and slowed.
      b.overCup = true;
      const side = speed > 0 ? (dx * b.vy - dy * b.vx) / speed : 0; // signed offset from the line through the centre
      const turn = clamp(-side / CUP_R, -1, 1) * 0.7;
      const c = Math.cos(turn), s = Math.sin(turn);
      const vx = b.vx * c - b.vy * s, vy = b.vx * s + b.vy * c;
      b.vx = vx * 0.82;
      b.vy = vy * 0.82;
      ev.push({ type: 'lip', x: h.cup.x, y: h.cup.y, speed });
    }
  } else if (d > CUP_R + 0.4) b.overCup = false;
  return null;
}

/** Fastest any moving obstacle goes (sub-steps keep up with it). */
function moverSpeed(h: Hole): number {
  let m = 0;
  for (const c of h.cabs) m = Math.max(m, (Math.PI * Math.hypot(c.bx - c.ax, c.by - c.ay)) / c.period);
  for (const sp of h.spinners) m = Math.max(m, Math.abs(sp.omega) * sp.len);
  return m;
}

/**
 * Advance the ball by dt seconds starting at hole time t. Resting balls
 * are only touched when something moving can hit them.
 */
export function stepBall(h: Hole, b: Ball, t: number, dt: number): { events: MgEvent[]; result: 'water' | 'cup' | null } {
  const events: MgEvent[] = [];
  const v = Math.hypot(b.vx, b.vy);
  const mv = moverSpeed(h);
  if (v === 0 && mv === 0 && canRest(h, b.x, b.y) && Math.hypot(b.x - h.cup.x, b.y - h.cup.y) >= PULL_R) return { events, result: null };
  const n = Math.min(400, Math.max(1, Math.ceil(((v + mv) * dt) / MAX_MOVE)));
  const sub = dt / n;
  for (let i = 0; i < n; i++) {
    const r = substep(h, b, t + i * sub, sub, events);
    if (r) return { events, result: r };
  }
  return { events, result: null };
}

// ------------------------------------------------------------- one player

export interface Shot { /** Radians (x right, y down). */ angle: number; /** 0..1 of MAX_SPEED. */ power: number }

/** One player's ball on one hole. */
export interface Putter {
  ball: Ball;
  strokes: number;
  /** Where the last putt was hit from (water sends you back here). */
  from: { x: number; y: number };
  rolling: boolean;
  rollT: number;
  done: boolean;
  sunk: boolean;
  pickedUp: boolean;
}

export function newPutter(h: Hole): Putter {
  return { ball: { x: h.tee.x, y: h.tee.y, vx: 0, vy: 0 }, strokes: 0, from: { ...h.tee }, rolling: false, rollT: 0, done: false, sunk: false, pickedUp: false };
}

export const atRest = (p: Putter): boolean => !p.done && !p.rolling && p.ball.vx === 0 && p.ball.vy === 0;

/** Hit the ball. False if it isn't your moment (still rolling, hole over). */
export function putt(p: Putter, shot: Shot): boolean {
  if (!atRest(p)) return false;
  const sp = clamp(shot.power, 0, 1) * MAX_SPEED;
  if (!(sp > 0) || !Number.isFinite(shot.angle)) return false;
  p.strokes++;
  p.from = { x: p.ball.x, y: p.ball.y };
  p.ball.vx = Math.cos(shot.angle) * sp;
  p.ball.vy = Math.sin(shot.angle) * sp;
  p.rolling = true;
  p.rollT = 0;
  return true;
}

export type PlayEvent = MgEvent | { type: 'stop' | 'pickup' | 'penalty'; x: number; y: number; speed: number };

/** Advance one player's ball (hole time t → t + dt): water penalties, the cup, stopping, picking up. */
export function advance(h: Hole, p: Putter, t: number, dt: number): PlayEvent[] {
  if (p.done) return [];
  const b = p.ball;
  const { events, result } = stepBall(h, b, t, dt);
  const out: PlayEvent[] = events;
  if (p.rolling) p.rollT += dt;
  if (result === 'cup') {
    p.done = p.sunk = true;
    p.rolling = false;
    return out;
  }
  if (result === 'water') {
    p.strokes++;
    out.push({ type: 'penalty', x: p.from.x, y: p.from.y, speed: 0 });
    b.x = p.from.x;
    b.y = p.from.y;
    b.vx = b.vy = 0;
    b.overCup = b.inSand = false;
    p.rolling = false;
  } else if (p.rolling && ((b.vx === 0 && b.vy === 0 && canRest(h, b.x, b.y) && Math.hypot(b.x - h.cup.x, b.y - h.cup.y) >= PULL_R) || p.rollT > SHOT_CAP)) {
    b.vx = b.vy = 0;
    p.rolling = false;
    out.push({ type: 'stop', x: b.x, y: b.y, speed: 0 });
  }
  if (!p.rolling && p.strokes >= MAX_STROKES) {
    p.strokes = MAX_STROKES;
    p.done = p.pickedUp = true;
    out.push({ type: 'pickup', x: b.x, y: b.y, speed: 0 });
  }
  return out;
}

/** Play a shot out with no one watching: where it ends up. */
export function simulate(h: Hole, from: { x: number; y: number }, t0: number, shot: Shot): { x: number; y: number; sunk: boolean; water: boolean; time: number } {
  const p = newPutter(h);
  p.ball.x = p.from.x = from.x;
  p.ball.y = p.from.y = from.y;
  if (!putt(p, shot)) return { x: from.x, y: from.y, sunk: false, water: false, time: 0 };
  let t = t0, time = 0;
  for (let i = 0; i < SHOT_CAP / STEP + 2; i++) {
    const ev = advance(h, p, t, STEP);
    t += STEP;
    time += STEP;
    if (p.sunk) return { x: h.cup.x, y: h.cup.y, sunk: true, water: false, time };
    if (ev.some((e) => e.type === 'penalty')) return { x: from.x, y: from.y, sunk: false, water: true, time };
    if (!p.rolling) break;
  }
  return { x: p.ball.x, y: p.ball.y, sunk: false, water: false, time };
}

// --------------------------------------------------- distance to the cup

/** Walking distance to the cup over the turf (around walls and water, through grates). */
interface Field { x0: number; y0: number; w: number; h: number; d: Float64Array }
const fieldCache = new WeakMap<Hole, Field>();
const CELL = 1;

export function cupField(h: Hole): Field {
  const hit = fieldCache.get(h);
  if (hit) return hit;
  const xs = h.outer.map((p) => p[0]), ys = h.outer.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.ceil((Math.max(...xs) - x0) / CELL) + 1, hh = Math.ceil((Math.max(...ys) - y0) / CELL) + 1;
  const free = new Uint8Array(w * hh);
  const cost = new Float32Array(w * hh);
  const cx = (i: number) => x0 + (i % w) * CELL, cy = (i: number) => y0 + Math.floor(i / w) * CELL;
  for (let i = 0; i < w * hh; i++) {
    const x = cx(i), y = cy(i);
    if (!inBounds(h, x, y) || wallDistance(h, x, y) < BALL_R * 0.9) continue;
    if (h.bumpers.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + BALL_R)) continue;
    if (h.zones.some((z) => z.kind === 'water' && inZone(z, x, y))) continue;
    free[i] = 1;
    cost[i] = surface(h, x, y).sand ? 3 : 1;
  }
  const idx = (x: number, y: number) => {
    const i = Math.round((x - x0) / CELL), j = Math.round((y - y0) / CELL);
    return i >= 0 && j >= 0 && i < w && j < hh ? j * w + i : -1;
  };
  const d = new Float64Array(w * hh).fill(Infinity);
  // Grates: reaching the exit counts as reaching every grate cell.
  const exits = h.grates.map((g) => ({ exit: idx(g.to.x, g.to.y), cells: [] as number[] }));
  h.grates.forEach((g, k) => {
    for (let i = 0; i < w * hh; i++) if (Math.hypot(cx(i) - g.x, cy(i) - g.y) < g.r && free[i]) exits[k].cells.push(i);
  });
  // Dijkstra from the cup with a small binary heap.
  const heap: number[] = [], key: number[] = [];
  const push = (i: number, k: number) => {
    heap.push(i);
    key.push(k);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (key[p] <= key[c]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      [key[p], key[c]] = [key[c], key[p]];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0], key[0]];
    const li = heap.pop()!, lk = key.pop()!;
    if (heap.length) {
      heap[0] = li;
      key[0] = lk;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let m = c;
        if (l < heap.length && key[l] < key[m]) m = l;
        if (r < heap.length && key[r] < key[m]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        [key[m], key[c]] = [key[c], key[m]];
        c = m;
      }
    }
    return top;
  };
  const start = idx(h.cup.x, h.cup.y);
  d[start] = 0;
  push(start, 0);
  const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [i, k] = pop();
    if (k > d[i]) continue;
    for (const ex of exits) if (ex.exit === i) for (const c of ex.cells) if (k + 2 < d[c]) (d[c] = k + 2), push(c, k + 2);
    const x = i % w, y = Math.floor(i / w);
    for (const [ox, oy, l] of N8) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue;
      const j = ny * w + nx;
      if (!free[j]) continue;
      const nk = k + l * CELL * (cost[i] + cost[j]) / 2;
      if (nk < d[j]) (d[j] = nk), push(j, nk);
    }
  }
  const f = { x0, y0, w, h: hh, d };
  fieldCache.set(h, f);
  return f;
}

/** Distance to the cup from a point (the nearest open cell if it's tight against a wall). */
export function cupDistance(h: Hole, x: number, y: number): number {
  const f = cupField(h);
  const i0 = Math.round((x - f.x0) / CELL), j0 = Math.round((y - f.y0) / CELL);
  let best = Infinity;
  for (let r = 0; r <= 3 && best === Infinity; r++)
    for (let j = j0 - r; j <= j0 + r; j++)
      for (let i = i0 - r; i <= i0 + r; i++) {
        if (i < 0 || j < 0 || i >= f.w || j >= f.h) continue;
        const v = f.d[j * f.w + i];
        if (v < Infinity) best = Math.min(best, v + Math.hypot(i - i0, j - j0) * CELL);
      }
  return best === Infinity ? 999 : best;
}

// ------------------------------------------------------ the other player

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

function gauss(rand: Rand): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** How good a shot's finish is (lower is better). */
function value(h: Hole, r: ReturnType<typeof simulate>, from: { x: number; y: number }): number {
  if (r.sunk) return -100 + r.time * 4;
  if (r.water) return cupDistance(h, from.x, from.y) + 45;
  return cupDistance(h, r.x, r.y);
}

/** How far off this player's putts go (radians; a fraction of the power). */
export function shotNoise(skill: number): { angle: number; power: number } {
  const k = clamp(skill, 0, 1);
  return { angle: 0.004 + (1 - k) * 0.12, power: 0.015 + (1 - k) * 0.26 };
}

/**
 * The computer player's putt, a little at a time (the UI runs a slice of
 * it each frame while they line it up): search the shots that work from
 * here with the real physics from time t (so cabs and turnstiles are
 * where they'll be), prefer ones that still work when the hand shakes as
 * much as this player's does, then miss by an amount set by skill
 * (0 = first time holding a putter … 1 = never misses a read).
 * Yields after every few simulated shots; returns the shot.
 */
export function* planSteps(h: Hole, from: { x: number; y: number }, t: number, skill: number, rand: Rand = Math.random): Generator<void, Shot, void> {
  const noise = shotNoise(skill);
  const cands: { shot: Shot; v: number }[] = [];
  let n = 0;
  const run = (shot: Shot) => value(h, simulate(h, from, t, { angle: shot.angle, power: clamp(shot.power, 0.04, 1) }), from);
  const tryShot = (angle: number, power: number) => {
    const shot = { angle, power: clamp(power, 0.04, 1) };
    cands.push({ shot, v: run(shot) });
  };
  const direct = Math.atan2(h.cup.y - from.y, h.cup.x - from.x);
  // Coarse: every 10°, plus a fan around the straight line.
  const angles: number[] = [];
  for (let i = 0; i < 36; i++) angles.push((i / 36) * Math.PI * 2);
  for (let i = -4; i <= 4; i++) angles.push(direct + i * 0.03);
  const powers = [0.08, 0.15, 0.25, 0.36, 0.5, 0.66, 0.83, 1];
  for (const a of angles) {
    for (const pw of powers) tryShot(a, pw);
    if (++n % 2 === 0) yield;
  }
  // Fine: around the best few.
  const top = [...cands].sort((a, b) => a.v - b.v).slice(0, 3);
  for (const c of top) {
    for (let da = -3; da <= 3; da++) for (let dp = -2; dp <= 2; dp++) if (da || dp) tryShot(c.shot.angle + da * 0.015, c.shot.power * (1 + dp * 0.06));
    yield;
  }
  cands.sort((a, b) => a.v - b.v);
  // Among the near-best, the one that holds up when it's off by this player's usual miss.
  const da = Math.max(0.012, noise.angle), dp = Math.max(0.03, noise.power);
  let pick = cands[0].shot, best = Infinity;
  // A spread of different ideas, not eight copies of the same risky bank.
  const pool: typeof cands = [];
  for (const c of cands) {
    if (pool.length >= 12) break;
    if (pool.some((q) => Math.abs(Math.atan2(Math.sin(q.shot.angle - c.shot.angle), Math.cos(q.shot.angle - c.shot.angle))) < 0.06 && Math.abs(q.shot.power - c.shot.power) < 0.12)) continue;
    pool.push(c);
  }
  for (const c of pool) {
    let sum = c.v;
    for (const [a, p] of [[da, 0], [-da, 0], [0, dp], [0, -dp], [da * 0.7, dp * 0.7], [-da * 0.7, -dp * 0.7]]) sum += run({ angle: c.shot.angle + a, power: c.shot.power * (1 + p) });
    const score = sum / 7;
    if (score < best) (best = score), (pick = c.shot);
    yield;
  }
  return { angle: pick.angle + gauss(rand) * noise.angle, power: clamp(pick.power * (1 + gauss(rand) * noise.power), 0.04, 1) };
}

/** The computer player's putt, all at once. */
export function planShot(h: Hole, from: { x: number; y: number }, t: number, skill: number, rand: Rand = Math.random): Shot {
  const it = planSteps(h, from, t, skill, rand);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

// ---------------------------------------------------------------- scoring

/** Leaderboard score for a whole round (higher is better). */
export function roundScore(strokes: number, parTotal = PAR_TOTAL): number {
  return Math.max(0, parTotal + 18 - Math.round(strokes)) * 10;
}

export type Stamp = 'ace' | 'albatross' | 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'worse' | 'pickup';

export function stampFor(strokes: number, par: number, pickedUp = false): Stamp {
  if (pickedUp) return 'pickup';
  if (strokes === 1) return 'ace';
  const d = strokes - par;
  return d <= -3 ? 'albatross' : d === -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : d === 2 ? 'double' : 'worse';
}

export const STAMP_WORD: Record<Stamp, string> = {
  ace: 'HOLE IN ONE!', albatross: 'ALBATROSS!', eagle: 'EAGLE!', birdie: 'BIRDIE!', par: 'PAR', bogey: 'BOGEY', double: 'DOUBLE BOGEY', worse: 'ROUGH ONE', pickup: 'PICKED UP',
};

/** "+3", "−2" or "E" (even). */
export function toPar(strokes: number, par: number): string {
  const d = strokes - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`;
}

export interface MinigolfRecord { best: number; bestScore: number; rounds: number; aces: number }

type WithGolf = GameState & { minigolf?: MinigolfRecord };

export function minigolfOf(s: GameState): MinigolfRecord | undefined {
  return (s as WithGolf).minigolf;
}

/**
 * A round is over: record it, cheer you up a bit. `strokes` and `par`
 * are the round's totals. Returns the leaderboard score.
 */
export function finishMinigolf(s: GameState, strokes: number, par: number = PAR_TOTAL, opts: { versus?: boolean; aces?: number } = {}): { score: number; best: boolean; underPar: boolean } {
  const st = Math.max(1, Math.round(strokes));
  const score = roundScore(st, par);
  const g = ((s as WithGolf).minigolf ??= { best: 0, bestScore: 0, rounds: 0, aces: 0 });
  const best = g.best === 0 || st < g.best;
  if (best) g.best = st;
  g.bestScore = Math.max(g.bestScore, score);
  g.rounds++;
  g.aces += Math.max(0, opts.aces ?? 0);
  // The 🏆 board's offline view reads your best from here.
  const fun = (s.fun ??= { tickets: 0, best: {}, bets: [], casinoNet: 0 });
  fun.best.minigolf = Math.max(fun.best.minigolf ?? 0, score);
  applyNeeds(s, { fun: 14, social: opts.versus ? 10 : 4, energy: -3 });
  const underPar = st < par;
  if (underPar) addMoodlet(s, { id: 'minigolf', label: 'Under par on the roof', emoji: '⛳', value: 5, minutes: 180 });
  return { score, best, underPar };
}
