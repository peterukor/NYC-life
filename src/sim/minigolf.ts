// =====================================================================
// minigolf.ts — ⛳ Central Park mini golf: the hole format, the ball
// physics, the cup, the computer player's putts, the hole solver and the
// scoring. Pure logic, no DOM; the course is drawn by ui/minigolf.ts and
// the holes themselves live in sim/minigolf-courses/ (seven courses of
// ten; the authoring guide is at the top of minigolf-courses/index.ts).
//
// Units: one unit ≈ an inch of turf, x right, y down the screen. The ball
// rolls with friction that is part constant, part speed based (a soft
// putt dies gently, a hard one carries), banks off walls with a little
// loss, and is moved in sub-steps short enough that it never tunnels.
//
// Everything that moves is a pure function of the hole clock `t` (in
// seconds), so a shot replays exactly from the same start time and the
// computer player plans with the same physics you putt with. The only
// other state a hole has is a HoleState: which 🔘 switches are on and how
// many cracks each crumbling wall has taken (shared by both players).
//
// The cup takes the ball only when it's slow enough (CUP_SPEED); faster
// and it lips out, kicked sideways by how far off-centre it rolled over.
//
// Max 8 strokes a hole (par + 4 on a par 5+), then you pick up.
//
// Leaderboard score per round (higher is better), see roundScore():
//   score = round(1000 × (0.4 × min(2, P/S) + 0.6 × min(2, T₀/T)))
// P = the course's par strokes, S = strokes taken, T₀ = the course's par
// time (sum of each hole's parTime), T = seconds of active play (only
// while it's your turn and you can putt). Par strokes in par time = 1000;
// time counts 60 %, strokes 40 %; each half caps at double (max 2000).
// A hole you pick up on is charged at least twice its par time (so
// slapping the ball around fast never pays).
// =====================================================================

import { addMoodlet, applyNeeds } from './needs.ts';
import type { GameState } from './types.ts';

export type Rand = () => number;
export type Pt = readonly [number, number];
export interface XY { x: number; y: number }

/** A round costs $12 (cents). */
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
const ICE = { a: 2.6, k: 0.12 };
const BELT = { a: 30, k: 1.2 };
const E_WALL = 0.78; // wall restitution
const GRIP = 0.97; // tangential speed kept off a wall
const MAX_MOVE = 0.35; // longest move per sub-step
const PULL_R = 3.3; // the cup's gentle pull reaches this far (centre to centre)
const PULL_A = 26; // ...with this acceleration (beats green friction: a ball resting on the lip drops)
const SHOT_CAP = 25; // seconds: a shot that somehow never stops is stopped
/** Static friction is this much stronger than rolling friction (a resting ball needs a real push to start). */
const STATIC_EXTRA = 0.6;
/** Gravity for a ball in the air (units/s²) and how much of its speed a jump turns into lift. */
export const GRAVITY = 150;
const JUMP_LIFT = 0.4;
const JUMP_PUSH = 28; // a jump ramp rolls a slow ball back like a ramp
/** Heights (units) of the things a jumping ball can clear. Blocks, the outer rail, gates, moving walls and trains are full height. */
export const HEIGHT = { low: 2.5, bumper: 3, spinner: 2.2, arm: 2.2, spring: 2, cab: 4 } as const;
/** Trampolines and springs never send the ball out faster than this (normal speed). */
export const SPRING_MAX = 105;
/** A crumbling wall only counts a knock this hard. */
export const CRACK_MIN = 9;
/** Gates slide shut / open over this long (s). */
export const GATE_SLIDE = 0.3;

// ------------------------------------------------------------------ the hole format
// Every field is documented for authors in minigolf-courses/index.ts.

/** Ties an obstacle to a 🔘 switch: it only works while the switch is `active` ('on' or 'off'). */
export interface SwitchLink { id: string; active: 'on' | 'off' }

export interface Circle { x: number; y: number; r: number }
export type ZoneKind = 'sand' | 'water' | 'ramp' | 'hill' | 'ice' | 'street' | 'path' | 'track';
export interface Zone {
  kind: ZoneKind;
  poly?: Pt[];
  circle?: Circle;
  /** Ramp: the push (units/s², a vector). Must beat green friction (14) so nothing rests on a ramp. */
  push?: Pt;
  /** Hill: outward push (units/s²). */
  lift?: number;
}
export interface Bumper extends Circle {
  /** 'bumper' kicks the ball away, 'trampoline' kicks harder (restitution e, capped); the others are just solid. */
  kind: 'bumper' | 'trampoline' | 'hydrant' | 'post' | 'cone';
  /** Restitution override (bumper 1.15, trampoline 1.45). */
  e?: number;
}
/** A 🚕 (or bus, train, beam) driving between two centre points. pingpong: smooth back and forth; loop: a → b at a steady speed, then again from a. */
export interface Cab {
  ax: number; ay: number; bx: number; by: number; w: number; h: number; period: number;
  /** Seconds added to the clock for this one. */
  phase: number;
  mode?: 'pingpong' | 'loop';
  kind?: 'cab' | 'bus' | 'train' | 'beam';
  /** Seconds of flashing warning lights before a loop vehicle enters the course (default 1.5). */
  warn?: number;
}
/** A spinning turnstile: arms from a solid hub. */
export interface Spinner { x: number; y: number; hub: number; len: number; arms: number; omega: number; a0: number }
/** A 🚇 subway grate: falls in here, rolls out of the manhole at `to` heading `dir` (radians). */
export interface Grate { x: number; y: number; r: number; to: XY; dir: number }
/** A conveyor belt: the surface moves at `speed` toward `dir` (radians); the ball's friction works relative to it. */
export interface Conveyor { poly: Pt[]; dir: number; speed: number; sw?: SwitchLink }
/** A wind gust: blows `force` (units/s²) toward `dir` for `on` seconds every `period`, with `warn` seconds of tell first. */
export interface Wind { poly: Pt[]; dir: number; force: number; period: number; on: number; warn?: number; phase?: number; sw?: SwitchLink }
/** A moving wall: the segment a–b (thickness w) slides by (dx, dy) and back, smoothly, every `period`. */
export interface Mover { a: XY; b: XY; dx: number; dy: number; period: number; phase?: number; w?: number; kind?: 'wall' | 'bus' | 'beam' | 'barrier'; sw?: SwitchLink }
/** A timed gate across a–b: open for `open` seconds of every `period`, then shut (slides from a to b). No period: shut (a door; pair it with a switch). */
export interface Gate { a: XY; b: XY; period?: number; open?: number; phase?: number; warn?: number; sw?: SwitchLink; kind?: 'gate' | 'door' | 'crosswalk' }
/** A trampoline rail: restitution e (> 1, capped at SPRING_MAX). */
export interface Spring { a: XY; b: XY; e?: number }
/** A magnet: pulls (strength > 0) or pushes (< 0) the ball within r, strongest halfway out. */
export interface Magnet { x: number; y: number; r: number; strength: number; sw?: SwitchLink }
/** A portal pair: in at a, out at b (and back, unless oneWay), same speed, direction turned by `turn` radians. */
export interface Portal { a: XY; b: XY; r?: number; turn?: number; oneWay?: boolean; sw?: SwitchLink }
/** A swinging arm on a pivot. flipper: snaps from a0 by amp, holds, falls back, every period. cable/boom: swings a0 ± amp like a pendulum. */
export interface Arm { x: number; y: number; len: number; a0: number; amp: number; period: number; phase?: number; kind: 'flipper' | 'cable' | 'boom'; hold?: number; w?: number; sw?: SwitchLink }
/** A crumbling wall: solid until it has been knocked `hits` times. */
export interface Crumble { poly: Pt[]; hits: number }
/** Rising and falling water over a rectangle, coming in `from` one side: covers lo…hi of it on a `period`. */
export interface Tide { x0: number; y0: number; x1: number; y1: number; from: 'top' | 'bottom' | 'left' | 'right'; lo: number; hi: number; period: number; phase?: number }
/** A turntable: spins a resting or rolling ball's position and velocity about its centre (omega rad/s). */
export interface Turntable { x: number; y: number; r: number; omega: number; sw?: SwitchLink }
/** A one-way gate across a–b: the ball passes heading `dir` (radians), bounces the other way. */
export interface OneWay { a: XY; b: XY; dir: number }
/** The cup slides between hole.cup and (x, y) and back every `period`. */
export interface CupTrack { x: number; y: number; period: number; phase?: number }
/** A jump: a ramp of length `len` and width `w` ending at the lip (x, y), launching toward `dir`. Faster than minSpeed at the lip and the ball flies. */
export interface Jump { x: number; y: number; dir: number; w: number; len: number; minSpeed?: number; lift?: number }
/** A 🔘 switch: rolling over it flips it (toggle) or turns it on for good (once). */
export interface Switch { id: string; x: number; y: number; r?: number; mode?: 'toggle' | 'once' }
/** Decoration, no physics: an emoji or a word painted at (x, y). */
export interface Deco { x: number; y: number; emoji?: string; text?: string; size?: number; rot?: number; color?: string }

/** What an author writes (only the essentials are required). */
export interface HoleDef {
  /** Unique within its course, kebab-case. The full id becomes `${course}-${id}`. */
  id: string;
  name: string;
  emoji: string;
  par: number;
  /** Seconds of active play (aiming time only) a good, not perfect, player needs. */
  parTime: number;
  /** One line under the hole's name. */
  tip: string;
  outer: Pt[];
  tee: XY;
  cup: XY;
  blocks?: Pt[][];
  low?: Pt[][];
  zones?: Zone[];
  bumpers?: Bumper[];
  cabs?: Cab[];
  spinners?: Spinner[];
  grates?: Grate[];
  conveyors?: Conveyor[];
  winds?: Wind[];
  movers?: Mover[];
  gates?: Gate[];
  springs?: Spring[];
  magnets?: Magnet[];
  portals?: Portal[];
  arms?: Arm[];
  crumbles?: Crumble[];
  tides?: Tide[];
  turntables?: Turntable[];
  oneways?: OneWay[];
  cupTrack?: CupTrack;
  jumps?: Jump[];
  switches?: Switch[];
  deco?: Deco[];
  /** Block colour and a sign painted on each block. */
  look?: { block?: string; label?: string };
}

/** A hole ready to play: every list present, numbered within its course. */
export interface Hole extends Required<Omit<HoleDef, 'cupTrack' | 'look'>> {
  n: number;
  course: string;
  cupTrack?: CupTrack;
  look?: { block?: string; label?: string };
}

export const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** A rectangle with its corners cut (c units). */
export const box = (x0: number, y0: number, x1: number, y1: number, c = 4): Pt[] => [
  [x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c],
];
/** A polygon approximating a circle (n sides). */
export const ngon = (cx: number, cy: number, r: number, n = 16, a0 = 0): Pt[] => Array.from({ length: n }, (_, i) => [cx + Math.cos(a0 + (i / n) * Math.PI * 2) * r, cy + Math.sin(a0 + (i / n) * Math.PI * 2) * r] as Pt);
/** Degrees → radians, for readable hole files (0 = right, 90 = down, -90 = up). */
export const deg = (d: number): number => (d * Math.PI) / 180;

/** Fill in the empty lists and number the hole. */
export function defineHole(d: HoleDef, n: number, course: string): Hole {
  return {
    blocks: [], low: [], zones: [], bumpers: [], cabs: [], spinners: [], grates: [], conveyors: [], winds: [], movers: [], gates: [], springs: [],
    magnets: [], portals: [], arms: [], crumbles: [], tides: [], turntables: [], oneways: [], jumps: [], switches: [], deco: [],
    ...d,
    id: `${course}-${d.id}`,
    n,
    course,
  } as Hole;
}

// --------------------------------------------------------------- geometry

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mod = (a: number, n: number) => ((a % n) + n) % n;
const TAU = Math.PI * 2;

export function pointInPoly(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inZone(z: Zone, x: number, y: number): boolean {
  if (z.circle) return (x - z.circle.x) ** 2 + (y - z.circle.y) ** 2 < z.circle.r ** 2;
  return !!z.poly && pointInPoly(x, y, z.poly);
}

/** The ball's centre is on the course: inside the outer wall, outside every block (and every standing crumbling wall, given the state). */
export function inBounds(h: Hole, x: number, y: number, st?: HoleState): boolean {
  if (!pointInPoly(x, y, h.outer)) return false;
  for (const b of h.blocks) if (pointInPoly(x, y, b)) return false;
  if (st) for (let i = 0; i < h.crumbles.length; i++) if (st.cracks[i] < h.crumbles[i].hits && pointInPoly(x, y, h.crumbles[i].poly)) return false;
  return true;
}

type Seg = [number, number, number, number];
const segsOf = (polys: readonly (readonly Pt[])[]): Seg[] => {
  const s: Seg[] = [];
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s.push([a[0], a[1], b[0], b[1]]);
  }
  return s;
};
interface Compiled {
  walls: Seg[]; low: Seg[]; crumbles: Seg[][]; bbox: [number, number, number, number]; dyn: boolean; mover: number; timed: boolean;
  /** Boxes [x0, y0, x1, y1] swept by everything that moves (sub-steps only shrink near them). */
  sweeps: [number, number, number, number][];
  /** Broad phase: the static wall and low-wall segments near each GRID-sized cell. */
  grid: { x0: number; y0: number; w: number; h: number; walls: Seg[][]; low: Seg[][] };
}
const GRID = 6;
function buildGrid(x0: number, y0: number, x1: number, y1: number, walls: Seg[], low: Seg[]): Compiled['grid'] {
  const w = Math.ceil((x1 - x0) / GRID) + 2, h = Math.ceil((y1 - y0) / GRID) + 2;
  const g = { x0: x0 - GRID, y0: y0 - GRID, w, h, walls: Array.from({ length: w * h }, () => [] as Seg[]), low: Array.from({ length: w * h }, () => [] as Seg[]) };
  const pad = BALL_R + MAX_MOVE + 0.5;
  for (const [list, out] of [[walls, g.walls], [low, g.low]] as const)
    for (const sg of list) {
      const i0 = Math.max(0, Math.floor((Math.min(sg[0], sg[2]) - pad - g.x0) / GRID)), i1 = Math.min(w - 1, Math.floor((Math.max(sg[0], sg[2]) + pad - g.x0) / GRID));
      const j0 = Math.max(0, Math.floor((Math.min(sg[1], sg[3]) - pad - g.y0) / GRID)), j1 = Math.min(h - 1, Math.floor((Math.max(sg[1], sg[3]) + pad - g.y0) / GRID));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out[j * w + i].push(sg);
    }
  return g;
}
const EMPTY: Seg[] = [];
const cellOf = (c: Compiled, x: number, y: number): number => {
  const g = c.grid;
  const i = Math.floor((x - g.x0) / GRID), j = Math.floor((y - g.y0) / GRID);
  return i >= 0 && j >= 0 && i < g.w && j < g.h ? j * g.w + i : -1;
};
const compiled = new WeakMap<Hole, Compiled>();
function comp(h: Hole): Compiled {
  let c = compiled.get(h);
  if (c) return c;
  const xs = h.outer.map((p) => p[0]), ys = h.outer.map((p) => p[1]);
  let mv = 0;
  for (const cb of h.cabs) mv = Math.max(mv, ((cb.mode === 'loop' ? 1 : Math.PI) * Math.hypot(cb.bx - cb.ax, cb.by - cb.ay)) / cb.period);
  for (const sp of h.spinners) mv = Math.max(mv, Math.abs(sp.omega) * sp.len);
  for (const m of h.movers) mv = Math.max(mv, (Math.PI * Math.hypot(m.dx, m.dy)) / m.period);
  for (const a of h.arms) mv = Math.max(mv, a.kind === 'flipper' ? (Math.abs(a.amp) / 0.09) * a.len : ((TAU * Math.abs(a.amp)) / a.period) * a.len);
  for (const tt of h.turntables) mv = Math.max(mv, Math.abs(tt.omega) * tt.r);
  if (h.cupTrack) mv = Math.max(mv, (Math.PI * Math.hypot(h.cupTrack.x - h.cup.x, h.cupTrack.y - h.cup.y)) / h.cupTrack.period);
  if (h.gates.length) mv = Math.max(mv, 20);
  const timed = h.cabs.length + h.spinners.length + h.movers.length + h.arms.length + h.gates.filter((g) => g.period).length + h.winds.length + h.tides.length + h.turntables.length > 0 || !!h.cupTrack;
  const dyn = timed || h.conveyors.length > 0 || h.magnets.length > 0;
  const walls = segsOf([h.outer, ...h.blocks]), low = segsOf(h.low);
  const bbox: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const sweeps: [number, number, number, number][] = [];
  const sw = (x0: number, y0: number, x1: number, y1: number, pad: number) => sweeps.push([Math.min(x0, x1) - pad, Math.min(y0, y1) - pad, Math.max(x0, x1) + pad, Math.max(y0, y1) + pad]);
  for (const cb of h.cabs) sw(cb.ax, cb.ay, cb.bx, cb.by, Math.max(cb.w, cb.h) / 2);
  for (const sp of h.spinners) sw(sp.x, sp.y, sp.x, sp.y, sp.len);
  for (const m of h.movers) sw(Math.min(m.a.x, m.b.x) + Math.min(0, m.dx), Math.min(m.a.y, m.b.y) + Math.min(0, m.dy), Math.max(m.a.x, m.b.x) + Math.max(0, m.dx), Math.max(m.a.y, m.b.y) + Math.max(0, m.dy), (m.w ?? 2) / 2);
  for (const a of h.arms) sw(a.x, a.y, a.x, a.y, a.len + (a.w ?? 1));
  for (const tt of h.turntables) sw(tt.x, tt.y, tt.x, tt.y, tt.r);
  for (const g of h.gates) sw(g.a.x, g.a.y, g.b.x, g.b.y, 1);
  if (h.cupTrack) sw(h.cup.x, h.cup.y, h.cupTrack.x, h.cupTrack.y, PULL_R);
  c = { walls, low, crumbles: h.crumbles.map((q) => segsOf([q.poly])), bbox, dyn, mover: mv, timed, sweeps, grid: buildGrid(bbox[0], bbox[1], bbox[2], bbox[3], walls, low) };
  compiled.set(h, c);
  return c;
}

/** Every static wall edge (outer outline and the blocks). */
export function wallSegments(h: Hole): Seg[] {
  return comp(h).walls;
}
/** The course's bounding box [x0, y0, x1, y1] (the outer rail). */
export const holeBox = (h: Hole): [number, number, number, number] => comp(h).bbox;
/** Something on this hole moves by the clock (so timing a putt matters). */
export const isTimed = (h: Hole): boolean => comp(h).timed;

function segDist(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const sx = x2 - x1, sy = y2 - y1;
  const l2 = sx * sx + sy * sy;
  const t = l2 > 0 ? clamp(((x - x1) * sx + (y - y1) * sy) / l2, 0, 1) : 0;
  return Math.hypot(x - (x1 + sx * t), y - (y1 + sy * t));
}

/** Distance from a point to the nearest static wall. */
export function wallDistance(h: Hole, x: number, y: number): number {
  let best = Infinity;
  for (const [x1, y1, x2, y2] of wallSegments(h)) best = Math.min(best, segDist(x, y, x1, y1, x2, y2));
  return best;
}

// --------------------------------------------------------------- the state of a hole

/** What a hole remembers besides the clock: switches and cracks (shared by everyone on the hole). */
export interface HoleState { sw: Record<string, boolean>; cracks: number[] }
export function newHoleState(h: Hole): HoleState {
  const sw: Record<string, boolean> = {};
  for (const s of h.switches) sw[s.id] = false;
  return { sw, cracks: h.crumbles.map(() => 0) };
}
export const cloneState = (st: HoleState): HoleState => ({ sw: { ...st.sw }, cracks: [...st.cracks] });
/** Is an obstacle tied to this switch link working right now? */
export const swActive = (link: SwitchLink | undefined, st: HoleState): boolean => !link || (!!st.sw[link.id] === (link.active === 'on'));
export const crumbleUp = (h: Hole, st: HoleState, i: number): boolean => st.cracks[i] < h.crumbles[i].hits;

// --------------------------------------------------------------- moving things (all f(t))

/** Where a cab is at time t, and how fast it's going. */
export function cabAt(c: Cab, t: number): { x: number; y: number; vx: number; vy: number } {
  const tt = t + c.phase;
  if (c.mode === 'loop') {
    const k = mod(tt / c.period, 1);
    return { x: c.ax + (c.bx - c.ax) * k, y: c.ay + (c.by - c.ay) * k, vx: (c.bx - c.ax) / c.period, vy: (c.by - c.ay) / c.period };
  }
  const w = TAU / c.period;
  const k = (1 - Math.cos(w * tt)) / 2;
  const dk = (Math.sin(w * tt) * w) / 2;
  return { x: c.ax + (c.bx - c.ax) * k, y: c.ay + (c.by - c.ay) * k, vx: (c.bx - c.ax) * dk, vy: (c.by - c.ay) * dk };
}

export const spinnerAngle = (sp: Spinner, t: number): number => sp.a0 + sp.omega * t;

/** A moving wall's offset and velocity at time t. */
export function moverAt(m: Mover, t: number): { ox: number; oy: number; vx: number; vy: number } {
  const w = TAU / m.period, tt = t + (m.phase ?? 0);
  const k = (1 - Math.cos(w * tt)) / 2, dk = (Math.sin(w * tt) * w) / 2;
  return { ox: m.dx * k, oy: m.dy * k, vx: m.dx * dk, vy: m.dy * dk };
}

/** How shut a gate is (0 open … 1 shut), and seconds until it changes. */
export function gateAt(g: Gate, t: number, st?: HoleState): { shut: number; left: number; closing: boolean } {
  if (st && g.sw && !swActive(g.sw, st)) return { shut: 0, left: Infinity, closing: false };
  if (!g.period) return { shut: 1, left: Infinity, closing: false };
  const open = g.open ?? g.period / 2;
  const u = mod(t + (g.phase ?? 0), g.period);
  if (u < open) return { shut: 0, left: open - u, closing: true };
  if (u < open + GATE_SLIDE) return { shut: (u - open) / GATE_SLIDE, left: g.period - u, closing: false };
  if (u < g.period - GATE_SLIDE) return { shut: 1, left: g.period - u, closing: false };
  return { shut: (g.period - u) / GATE_SLIDE, left: g.period - u, closing: false };
}

/** An arm's angle at time t. */
export function armAngle(a: Arm, t: number): number {
  const tt = t + (a.phase ?? 0);
  if (a.kind !== 'flipper') return a.a0 + a.amp * Math.sin((TAU * tt) / a.period);
  const u = mod(tt, a.period), hold = a.hold ?? 0.25;
  const k = u < 0.09 ? u / 0.09 : u < 0.09 + hold ? 1 : u < 0.39 + hold ? 1 - (u - 0.09 - hold) / 0.3 : 0;
  return a.a0 + a.amp * k;
}
/** Seconds until a flipper next snaps up. */
export const flipperIn = (a: Arm, t: number): number => a.period - mod(t + (a.phase ?? 0), a.period);
const armOmega = (a: Arm, t: number) => (armAngle(a, t + 1e-3) - armAngle(a, t - 1e-3)) / 2e-3;

/** A gust: how hard it's blowing now (0…1), and whether the tell is showing. */
export function windAt(w: Wind, t: number): { k: number; warn: boolean; left: number } {
  const u = mod(t + (w.phase ?? 0), w.period);
  const warn = w.warn ?? 1.2;
  if (u < w.on) return { k: Math.min(1, u / 0.2, (w.on - u) / 0.2), warn: false, left: w.on - u };
  return { k: 0, warn: u >= w.period - warn, left: w.period - u };
}

/** How much of a tide's rectangle is under water (0…1). */
export function tideLevel(td: Tide, t: number): number {
  const k = (1 - Math.cos((TAU * (t + (td.phase ?? 0))) / td.period)) / 2;
  return td.lo + (td.hi - td.lo) * k;
}
/** The part of a tide's rectangle that's wet at time t: [x0, y0, x1, y1]. */
export function tideRect(td: Tide, t: number): [number, number, number, number] {
  const f = tideLevel(td, t);
  const w = td.x1 - td.x0, hh = td.y1 - td.y0;
  switch (td.from) {
    case 'top': return [td.x0, td.y0, td.x1, td.y0 + hh * f];
    case 'bottom': return [td.x0, td.y1 - hh * f, td.x1, td.y1];
    case 'left': return [td.x0, td.y0, td.x0 + w * f, td.y1];
    default: return [td.x1 - w * f, td.y0, td.x1, td.y1];
  }
}
const inTide = (td: Tide, t: number, x: number, y: number) => {
  const [x0, y0, x1, y1] = tideRect(td, t);
  return x > x0 && x < x1 && y > y0 && y < y1;
};

/** Where the cup is at time t (it may slide on a track), and how fast it's going. */
const fixedCup = new WeakMap<Hole, { x: number; y: number; vx: number; vy: number }>();
export function cupAt(h: Hole, t: number): { x: number; y: number; vx: number; vy: number } {
  const tr = h.cupTrack;
  if (!tr) {
    let c = fixedCup.get(h);
    if (!c) fixedCup.set(h, (c = { x: h.cup.x, y: h.cup.y, vx: 0, vy: 0 }));
    return c;
  }
  const w = TAU / tr.period, tt = t + (tr.phase ?? 0);
  const k = (1 - Math.cos(w * tt)) / 2, dk = (Math.sin(w * tt) * w) / 2;
  return { x: h.cup.x + (tr.x - h.cup.x) * k, y: h.cup.y + (tr.y - h.cup.y) * k, vx: (tr.x - h.cup.x) * dk, vy: (tr.y - h.cup.y) * dk };
}

// ---------------------------------------------------------------- physics

export interface Ball {
  x: number; y: number; vx: number; vy: number;
  /** Over the cup right now (a lip-out fires once per pass). */
  overCup?: boolean;
  inSand?: boolean;
  /** Height above the turf and its vertical speed (a jump). */
  z?: number;
  vz?: number;
  /** The switch it's sitting on (it flips once per visit). */
  onSw?: string | null;
  /** The portal end it just came out of (re-arms once it rolls clear). */
  lock?: string | null;
}

export type MgEventType =
  | 'wall' | 'bumper' | 'cab' | 'spin' | 'sand' | 'water' | 'grate' | 'lip' | 'cup'
  | 'spring' | 'portal' | 'switch' | 'crack' | 'break' | 'jump' | 'land' | 'gate' | 'flip' | 'thud' | 'tide';
export interface MgEvent { type: MgEventType; x: number; y: number; speed: number; /** Which obstacle (index in its list), when it matters. */ i?: number }

const surf = { a: 0, k: 0, sand: false, ice: false, bx: 0, by: 0 };
/** Friction under a point (into the shared `surf` scratch object). */
function surfaceAt(h: Hole, x: number, y: number, st: HoleState | null): typeof surf {
  surf.a = GREEN.a;
  surf.k = GREEN.k;
  surf.sand = surf.ice = false;
  surf.bx = surf.by = 0;
  for (const z of h.zones) {
    if (z.kind === 'sand' && inZone(z, x, y)) {
      surf.a = SAND.a;
      surf.k = SAND.k;
      surf.sand = true;
      return surf;
    }
    if (z.kind === 'ice' && inZone(z, x, y)) {
      surf.a = ICE.a;
      surf.k = ICE.k;
      surf.ice = true;
    }
  }
  for (const c of h.conveyors) if ((!st || swActive(c.sw, st)) && pointInPoly(x, y, c.poly)) {
    surf.a = BELT.a;
    surf.k = BELT.k;
    surf.bx = Math.cos(c.dir) * c.speed;
    surf.by = Math.sin(c.dir) * c.speed;
  }
  return surf;
}

/** Jump ramp coordinates of a point: along (≤ 0 on the ramp, 0 at the lip) and across. */
const jumpLocal = (j: Jump, x: number, y: number) => {
  const cx = Math.cos(j.dir), cy = Math.sin(j.dir);
  const dx = x - j.x, dy = y - j.y;
  return { along: dx * cx + dy * cy, across: -dx * cy + dy * cx };
};
const onJumpRamp = (j: Jump, x: number, y: number) => {
  const l = jumpLocal(j, x, y);
  return l.along <= 0 && l.along >= -j.len && Math.abs(l.across) <= j.w / 2;
};

/** Ramps, hills, jump ramps, magnets and wind: the push at a point (time t). */
export function slopeAt(h: Hole, x: number, y: number, t = 0, st: HoleState | null = null): [number, number] {
  let gx = 0, gy = 0;
  for (const z of h.zones) {
    if (z.kind === 'ramp' && z.push && inZone(z, x, y)) (gx += z.push[0]), (gy += z.push[1]);
    if (z.kind === 'hill' && z.circle && z.lift && inZone(z, x, y)) {
      const dx = x - z.circle.x, dy = y - z.circle.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) (gx += (dx / d) * z.lift), (gy += (dy / d) * z.lift);
    }
  }
  for (const j of h.jumps) if (onJumpRamp(j, x, y)) (gx -= Math.cos(j.dir) * JUMP_PUSH), (gy -= Math.sin(j.dir) * JUMP_PUSH);
  for (const m of h.magnets) {
    if (st && !swActive(m.sw, st)) continue;
    const dx = m.x - x, dy = m.y - y, d = Math.hypot(dx, dy);
    if (d >= m.r || d < 1e-6) continue;
    const f = m.strength * Math.sin((Math.PI * d) / m.r);
    gx += (dx / d) * f;
    gy += (dy / d) * f;
  }
  for (const w of h.winds) {
    if (st && !swActive(w.sw, st)) continue;
    const k = windAt(w, t).k;
    if (k > 0 && pointInPoly(x, y, w.poly)) (gx += Math.cos(w.dir) * w.force * k), (gy += Math.sin(w.dir) * w.force * k);
  }
  return [gx, gy];
}

/** Could a ball rest here (nothing pushing harder than friction, no belt moving)? Wind counts only while it blows. */
export function canRest(h: Hole, x: number, y: number, t = 0, st: HoleState | null = null): boolean {
  const [gx, gy] = slopeAt(h, x, y, t, st);
  const s = surfaceAt(h, x, y, st);
  return Math.hypot(gx, gy) <= s.a + STATIC_EXTRA && s.bx === 0 && s.by === 0;
}

/**
 * Bounce the ball off a segment that may be moving (contact point velocity
 * ox, oy), with contact radius rad. Restitution e (out normal speed capped at
 * cap). Returns impact speed (0 = no contact).
 */
function hitSeg(b: Ball, x1: number, y1: number, x2: number, y2: number, ox: number, oy: number, e: number, grip: number, rad = BALL_R, cap = Infinity): number {
  const sx = x2 - x1, sy = y2 - y1;
  const len2 = sx * sx + sy * sy;
  const t = len2 > 0 ? clamp(((b.x - x1) * sx + (b.y - y1) * sy) / len2, 0, 1) : 0;
  const cx = x1 + sx * t, cy = y1 + sy * t;
  let dx = b.x - cx, dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rad * rad) return 0;
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
  b.x = cx + nx * rad;
  b.y = cy + ny * rad;
  const rvx = b.vx - ox, rvy = b.vy - oy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0.0001; // touching, already leaving
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  const out = Math.min(cap, -e * vn);
  b.vx = ox + out * nx + grip * vt * tx;
  b.vy = oy + out * ny + grip * vt * ty;
  return -vn;
}

function hitCircle(b: Ball, c: Circle, e: number, kickMin: number, cap = Infinity): number {
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
  const out = Math.min(cap, Math.max(-vn * e, kickMin));
  b.vx += (-vn + out) * nx;
  b.vy += (-vn + out) * ny;
  return -vn;
}

/** A segment the ball only crosses heading `dir`: bounces off its far side. */
function hitOneWay(b: Ball, o: OneWay): number {
  const sx = o.b.x - o.a.x, sy = o.b.y - o.a.y, l = Math.hypot(sx, sy) || 1;
  let nx = -sy / l, ny = sx / l;
  if (nx * Math.cos(o.dir) + ny * Math.sin(o.dir) < 0) (nx = -nx), (ny = -ny);
  // n points the way you may go. The blocking face is the +n side.
  const s = (b.x - o.a.x) * nx + (b.y - o.a.y) * ny;
  if (s <= 0 || s >= BALL_R) return 0;
  const k = ((b.x - o.a.x) * sx + (b.y - o.a.y) * sy) / (l * l);
  if (k < 0 || k > 1) return 0;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  b.x += nx * (BALL_R - s);
  b.y += ny * (BALL_R - s);
  b.vx -= (1 + E_WALL) * vn * nx;
  b.vy -= (1 + E_WALL) * vn * ny;
  return -vn;
}

const segsBox: Seg[] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];

function substep(h: Hole, b: Ball, t: number, dt: number, ev: MgEvent[], st: HoleState): 'water' | 'cup' | null {
  const c = comp(h);
  const px = b.x, py = b.y;
  const z0 = b.z ?? 0;
  const air = z0 > 0 || (b.vz ?? 0) > 0;
  const cup = cupAt(h, t);
  if (air) {
    // Flying: gravity on the height, wind on the rest, nothing else.
    for (const w of h.winds) {
      if (!swActive(w.sw, st)) continue;
      const k = windAt(w, t).k;
      if (k > 0 && pointInPoly(b.x, b.y, w.poly)) (b.vx += Math.cos(w.dir) * w.force * k * dt), (b.vy += Math.sin(w.dir) * w.force * k * dt);
    }
    b.vz = (b.vz ?? 0) - GRAVITY * dt;
    b.z = z0 + b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      b.vz = 0;
      b.vx *= 0.88;
      b.vy *= 0.88;
      ev.push({ type: 'land', x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) });
    }
  } else {
    // Pushes: ramps, hills, magnets, wind and the cup's pull on a slow ball.
    const sl = slopeAt(h, b.x, b.y, t, st);
    let ax = sl[0], ay = sl[1];
    let v = Math.hypot(b.vx - cup.vx, b.vy - cup.vy);
    const cdx = cup.x - b.x, cdy = cup.y - b.y, cd = Math.hypot(cdx, cdy);
    if (cd < PULL_R && cd > 1e-6 && v < CUP_SPEED) (ax += (cdx / cd) * PULL_A), (ay += (cdy / cd) * PULL_A);
    const sf = surfaceAt(h, b.x, b.y, st);
    // Static friction: a resting ball stays put unless the push beats it (the same test as canRest).
    if (!(b.vx === 0 && b.vy === 0 && sf.bx === 0 && sf.by === 0 && Math.hypot(ax, ay) <= sf.a + STATIC_EXTRA)) {
      b.vx += ax * dt;
      b.vy += ay * dt;
    }
    // Friction (relative to a moving belt).
    const rvx = b.vx - sf.bx, rvy = b.vy - sf.by;
    v = Math.hypot(rvx, rvy);
    if (v > 0) {
      const nv = v - (sf.a + sf.k * v) * dt;
      if (nv <= 0) (b.vx = sf.bx), (b.vy = sf.by);
      else (b.vx = sf.bx + (rvx * nv) / v), (b.vy = sf.by + (rvy * nv) / v);
    }
    // Turntables carry the ball round.
    for (const tt of h.turntables) {
      if (!swActive(tt.sw, st)) continue;
      const dx = b.x - tt.x, dy = b.y - tt.y;
      if (dx * dx + dy * dy >= tt.r * tt.r) continue;
      const a = tt.omega * dt, ca = Math.cos(a), sa = Math.sin(a);
      b.x = tt.x + dx * ca - dy * sa;
      b.y = tt.y + dx * sa + dy * ca;
      const vx = b.vx * ca - b.vy * sa;
      b.vy = b.vx * sa + b.vy * ca;
      b.vx = vx;
    }
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  const z = b.z ?? 0;
  // Walls (only the ones near the ball). `touch` notes any contact at all.
  let touch = 0;
  const cell = cellOf(c, b.x, b.y);
  for (const s of cell < 0 ? c.walls : c.grid.walls[cell]) {
    const sp = hitSeg(b, s[0], s[1], s[2], s[3], 0, 0, E_WALL, GRIP);
    touch += sp;
    if (sp > 2) ev.push({ type: 'wall', x: b.x, y: b.y, speed: sp });
  }
  if (z < HEIGHT.low) for (const s of cell < 0 ? c.low : c.grid.low[cell] ?? EMPTY) {
    const sp = hitSeg(b, s[0], s[1], s[2], s[3], 0, 0, E_WALL, GRIP);
    touch += sp;
    if (sp > 2) ev.push({ type: 'wall', x: b.x, y: b.y, speed: sp });
  }
  // Crumbling walls: count the knocks.
  for (let i = 0; i < c.crumbles.length; i++) {
    if (!crumbleUp(h, st, i)) continue;
    let hit = 0;
    for (const s of c.crumbles[i]) hit = Math.max(hit, hitSeg(b, s[0], s[1], s[2], s[3], 0, 0, 0.7, GRIP));
    touch += hit;
    if (hit > CRACK_MIN) {
      st.cracks[i]++;
      ev.push({ type: st.cracks[i] >= h.crumbles[i].hits ? 'break' : 'crack', x: b.x, y: b.y, speed: hit, i });
    } else if (hit > 2) ev.push({ type: 'wall', x: b.x, y: b.y, speed: hit });
  }
  // Bumpers, trampolines, hydrants and posts.
  if (z < HEIGHT.bumper) for (let i = 0; i < h.bumpers.length; i++) {
    const bp = h.bumpers[i];
    const kick = bp.kind === 'bumper', tramp = bp.kind === 'trampoline';
    const s = hitCircle(b, bp, bp.e ?? (tramp ? 1.45 : kick ? 1.15 : 0.6), tramp ? 30 : kick ? 42 : 0, tramp ? SPRING_MAX : Infinity);
    touch += s;
    if (s > (kick || tramp ? 0.5 : 2)) ev.push({ type: kick || tramp ? 'bumper' : 'wall', x: b.x, y: b.y, speed: s, i });
  }
  if (z < HEIGHT.spring) for (let i = 0; i < h.springs.length; i++) {
    const sp = h.springs[i];
    const s = hitSeg(b, sp.a.x, sp.a.y, sp.b.x, sp.b.y, 0, 0, sp.e ?? 1.35, 1, BALL_R + 0.5, SPRING_MAX);
    touch += s;
    if (s > 1) ev.push({ type: 'spring', x: b.x, y: b.y, speed: s, i });
  }
  // Cabs, buses, trains and beams (moving boxes).
  for (const cb of h.cabs) {
    if (z >= HEIGHT.cab && cb.kind !== 'train' && cb.kind !== 'beam') continue;
    const p = cabAt(cb, t);
    const x0 = p.x - cb.w / 2, x1 = p.x + cb.w / 2, y0 = p.y - cb.h / 2, y1 = p.y + cb.h / 2;
    if (b.x < x0 - BALL_R || b.x > x1 + BALL_R || b.y < y0 - BALL_R || b.y > y1 + BALL_R) continue;
    segsBox[0] = [x0, y0, x1, y0];
    segsBox[1] = [x1, y0, x1, y1];
    segsBox[2] = [x1, y1, x0, y1];
    segsBox[3] = [x0, y1, x0, y0];
    let hit = 0;
    for (const s of segsBox) hit = Math.max(hit, hitSeg(b, s[0], s[1], s[2], s[3], p.vx, p.vy, 0.85, 0.9));
    touch += hit;
    if (hit > 3) ev.push({ type: 'cab', x: b.x, y: b.y, speed: hit });
  }
  // Turnstile arms.
  if (z < HEIGHT.spinner) for (const sp of h.spinners) {
    const ddx = b.x - sp.x, ddy = b.y - sp.y;
    if (ddx * ddx + ddy * ddy > (sp.len + BALL_R + 0.5) ** 2) continue;
    const a0 = spinnerAngle(sp, t);
    for (let i = 0; i < sp.arms; i++) {
      const a = a0 + (i * TAU) / sp.arms;
      const cx = Math.cos(a), cy = Math.sin(a);
      const x1 = sp.x + cx * sp.hub, y1 = sp.y + cy * sp.hub, x2 = sp.x + cx * sp.len, y2 = sp.y + cy * sp.len;
      const sx = x2 - x1, sy = y2 - y1;
      const k = clamp(((b.x - x1) * sx + (b.y - y1) * sy) / (sx * sx + sy * sy), 0, 1);
      const qx = x1 + sx * k - sp.x, qy = y1 + sy * k - sp.y;
      const s = hitSeg(b, x1, y1, x2, y2, -sp.omega * qy, sp.omega * qx, 0.6, 0.9);
      touch += s;
      if (s > 3) ev.push({ type: 'spin', x: b.x, y: b.y, speed: s });
    }
  }
  // Flippers, swinging cables, crane booms.
  if (z < HEIGHT.arm) for (let i = 0; i < h.arms.length; i++) {
    const am = h.arms[i];
    if (!swActive(am.sw, st)) continue;
    const ddx = b.x - am.x, ddy = b.y - am.y;
    if (ddx * ddx + ddy * ddy > (am.len + BALL_R + (am.w ?? 1)) ** 2) continue;
    const a = armAngle(am, t), w = armOmega(am, t);
    const x2 = am.x + Math.cos(a) * am.len, y2 = am.y + Math.sin(a) * am.len;
    const sx = x2 - am.x, sy = y2 - am.y;
    const k = clamp(((b.x - am.x) * sx + (b.y - am.y) * sy) / (sx * sx + sy * sy), 0, 1);
    const qx = sx * k, qy = sy * k;
    const flip = am.kind === 'flipper';
    const s = hitSeg(b, am.x, am.y, x2, y2, -w * qy, w * qx, flip ? 0.55 : 0.7, 0.92, BALL_R + (am.w ?? 1) / 2, flip ? SPRING_MAX : Infinity);
    touch += s;
    if (s > 3) ev.push({ type: flip && Math.abs(w) > 1 ? 'flip' : 'thud', x: b.x, y: b.y, speed: s, i });
  }
  // Moving walls.
  for (const m of h.movers) {
    if (!swActive(m.sw, st)) continue;
    const p = moverAt(m, t);
    const s = hitSeg(b, m.a.x + p.ox, m.a.y + p.oy, m.b.x + p.ox, m.b.y + p.oy, p.vx, p.vy, 0.8, 0.92, BALL_R + (m.w ?? 2) / 2);
    touch += s;
    if (s > 3) ev.push({ type: 'thud', x: b.x, y: b.y, speed: s });
  }
  // Gates (the shut part, sliding from a toward b).
  for (let i = 0; i < h.gates.length; i++) {
    const g = h.gates[i];
    const sh = gateAt(g, t, st).shut;
    if (sh <= 0) continue;
    const ex = g.a.x + (g.b.x - g.a.x) * sh, ey = g.a.y + (g.b.y - g.a.y) * sh;
    const s = hitSeg(b, g.a.x, g.a.y, ex, ey, 0, 0, 0.6, 0.92, BALL_R + 0.5);
    touch += s;
    if (s > 3) ev.push({ type: 'gate', x: b.x, y: b.y, speed: s, i });
  }
  for (const o of h.oneways) {
    const s = hitOneWay(b, o);
    touch += s;
    if (s > 3) ev.push({ type: 'gate', x: b.x, y: b.y, speed: s });
  }
  // Never out of the course: if anything shoved the centre through a wall, put it back.
  // (A ball nothing touched moved less than its radius from a legal spot, so it's still legal.)
  if ((touch > 0 || h.turntables.length > 0) && !inBounds(h, b.x, b.y, st)) {
    b.x = px;
    b.y = py;
    b.vx *= -0.5;
    b.vy *= -0.5;
  }
  if ((b.z ?? 0) > 0) return null;
  // Jumps: over the lip fast enough and it flies.
  for (const j of h.jumps) {
    const l0 = jumpLocal(j, px, py), l1 = jumpLocal(j, b.x, b.y);
    if (l0.along < 0 && l1.along >= 0 && Math.abs(l1.across) <= j.w / 2) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp >= (j.minSpeed ?? 38) && b.vx * Math.cos(j.dir) + b.vy * Math.sin(j.dir) > sp * 0.5) {
        b.vz = sp * (j.lift ?? JUMP_LIFT);
        b.z = 1e-3;
        b.overCup = false;
        ev.push({ type: 'jump', x: b.x, y: b.y, speed: sp });
        return null;
      }
    }
  }
  // Surfaces.
  const sand = surfaceAt(h, b.x, b.y, st).sand;
  if (sand && !b.inSand && Math.hypot(b.vx, b.vy) > 3) ev.push({ type: 'sand', x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) });
  b.inSand = sand;
  for (const zn of h.zones) if (zn.kind === 'water' && inZone(zn, b.x, b.y)) {
    ev.push({ type: 'water', x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) });
    b.vx = b.vy = 0;
    return 'water';
  }
  for (const td of h.tides) if (inTide(td, t, b.x, b.y)) {
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
  // Portals: same speed out, turned.
  if (b.lock) {
    const [pi, end] = [Number(b.lock.slice(1)), b.lock[0]];
    const po = h.portals[pi];
    const q = po && (end === 'a' ? po.a : po.b);
    if (!q || Math.hypot(b.x - q.x, b.y - q.y) > (po.r ?? 2.6) + BALL_R + 0.3) b.lock = null;
  }
  for (let i = 0; i < h.portals.length; i++) {
    const po = h.portals[i];
    if (!swActive(po.sw, st)) continue;
    const r = po.r ?? 2.6;
    for (const end of po.oneWay ? ['a'] : ['a', 'b']) {
      const q = end === 'a' ? po.a : po.b, out = end === 'a' ? po.b : po.a;
      if (b.lock === `${end}${i}` || Math.hypot(b.x - q.x, b.y - q.y) >= r - 0.4) continue;
      const sp = Math.max(Math.hypot(b.vx, b.vy), 12);
      const turn = (po.turn ?? 0) * (end === 'a' ? 1 : -1);
      const a = Math.atan2(b.vy, b.vx) + turn;
      ev.push({ type: 'portal', x: q.x, y: q.y, speed: sp, i });
      b.x = out.x;
      b.y = out.y;
      b.vx = Math.cos(a) * sp;
      b.vy = Math.sin(a) * sp;
      b.lock = `${end === 'a' ? 'b' : 'a'}${i}`;
      b.overCup = false;
      return null;
    }
  }
  // Switches: flip once per visit.
  let on: string | null = null;
  for (const s of h.switches) {
    const d = Math.hypot(b.x - s.x, b.y - s.y);
    if (d < (s.r ?? 2.4)) on = s.id;
    if (d < (s.r ?? 2.4) && b.onSw !== s.id) {
      st.sw[s.id] = s.mode === 'once' ? true : !st.sw[s.id];
      ev.push({ type: 'switch', x: s.x, y: s.y, speed: Math.hypot(b.vx, b.vy) });
    }
  }
  b.onSw = on;
  // The cup.
  const dx = b.x - cup.x, dy = b.y - cup.y, d = Math.hypot(dx, dy);
  const rvx = b.vx - cup.vx, rvy = b.vy - cup.vy;
  const speed = Math.hypot(rvx, rvy);
  if (d < CUP_R) {
    if (speed <= CUP_SPEED) {
      ev.push({ type: 'cup', x: cup.x, y: cup.y, speed });
      b.x = cup.x;
      b.y = cup.y;
      b.vx = b.vy = 0;
      return 'cup';
    }
    if (!b.overCup) {
      // Lip out: kicked sideways by how far off-centre it came over, and slowed.
      b.overCup = true;
      const side = speed > 0 ? (dx * rvy - dy * rvx) / speed : 0;
      const turn = clamp(-side / CUP_R, -1, 1) * 0.7;
      const cs = Math.cos(turn), sn = Math.sin(turn);
      const vx = b.vx * cs - b.vy * sn, vy = b.vx * sn + b.vy * cs;
      b.vx = vx * 0.82;
      b.vy = vy * 0.82;
      ev.push({ type: 'lip', x: cup.x, y: cup.y, speed });
    }
  } else if (d > CUP_R + 0.4) b.overCup = false;
  return null;
}

/**
 * Advance the ball by dt seconds starting at hole time t. Resting balls
 * on a hole where nothing moves are left alone.
 */
export function stepBall(h: Hole, b: Ball, t: number, dt: number, st: HoleState = newHoleState(h)): { events: MgEvent[]; result: 'water' | 'cup' | null } {
  const events: MgEvent[] = [];
  const c = comp(h);
  const v = Math.hypot(b.vx, b.vy);
  if (v === 0 && !b.z && !c.dyn && canRest(h, b.x, b.y, t, st) && Math.hypot(b.x - h.cup.x, b.y - h.cup.y) >= PULL_R) return { events, result: null };
  // Something moving within reach this step? Then sub-step for its speed too.
  let mv = 0;
  if (c.mover > 0) {
    const pad = (v + c.mover) * dt + BALL_R + 1;
    for (const q of c.sweeps) if (b.x > q[0] - pad && b.x < q[2] + pad && b.y > q[1] - pad && b.y < q[3] + pad) {
      mv = c.mover;
      break;
    }
  }
  const n = Math.min(400, Math.max(1, Math.ceil(((v + mv) * dt) / MAX_MOVE)));
  const sub = dt / n;
  for (let i = 0; i < n; i++) {
    const r = substep(h, b, t + i * sub, sub, events, st);
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

/** Strokes before you pick up on this hole. */
export const maxStrokes = (h: Hole): number => Math.max(MAX_STROKES, h.par + 4);

export function newPutter(h: Hole): Putter {
  return { ball: { x: h.tee.x, y: h.tee.y, vx: 0, vy: 0, z: 0, vz: 0 }, strokes: 0, from: { ...h.tee }, rolling: false, rollT: 0, done: false, sunk: false, pickedUp: false };
}

export const atRest = (p: Putter): boolean => !p.done && !p.rolling && p.ball.vx === 0 && p.ball.vy === 0 && !p.ball.z;

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

export type PlayEvent = MgEvent | { type: 'stop' | 'pickup' | 'penalty'; x: number; y: number; speed: number; i?: number };

/** Where a penalty drops you: where you hit from, unless the tide has it (then the tee). */
function dropSpot(h: Hole, p: Putter): { x: number; y: number } {
  for (const td of h.tides) if (p.from.x > td.x0 && p.from.x < td.x1 && p.from.y > td.y0 && p.from.y < td.y1) return { ...h.tee };
  return p.from;
}

/** Advance one player's ball (hole time t → t + dt): water penalties, the cup, stopping, picking up. */
export function advance(h: Hole, p: Putter, t: number, dt: number, st: HoleState = newHoleState(h)): PlayEvent[] {
  if (p.done) return [];
  const b = p.ball;
  const { events, result } = stepBall(h, b, t, dt, st);
  const out: PlayEvent[] = events;
  if (p.rolling) p.rollT += dt;
  if (result === 'cup') {
    p.done = p.sunk = true;
    p.rolling = false;
    return out;
  }
  if (result === 'water') {
    p.strokes++;
    const at = dropSpot(h, p);
    out.push({ type: 'penalty', x: at.x, y: at.y, speed: 0 });
    b.x = at.x;
    b.y = at.y;
    b.vx = b.vy = 0;
    b.z = b.vz = 0;
    b.overCup = b.inSand = false;
    b.lock = null;
    p.rolling = false;
  } else if (p.rolling && ((b.vx === 0 && b.vy === 0 && !b.z && canRest(h, b.x, b.y, t, st) && Math.hypot(b.x - cupAt(h, t).x, b.y - cupAt(h, t).y) >= PULL_R) || p.rollT > SHOT_CAP)) {
    b.vx = b.vy = 0;
    b.z = b.vz = 0;
    p.rolling = false;
    out.push({ type: 'stop', x: b.x, y: b.y, speed: 0 });
  }
  if (!p.rolling && p.strokes >= maxStrokes(h)) {
    p.strokes = maxStrokes(h);
    p.done = p.pickedUp = true;
    out.push({ type: 'pickup', x: b.x, y: b.y, speed: 0 });
  }
  return out;
}

export interface SimResult { x: number; y: number; sunk: boolean; water: boolean; time: number; t: number; /** The hole's state after the shot (switches it flipped, walls it cracked). */ st: HoleState }

/** Play a shot out with no one watching: where it ends up (the state is copied, never changed). */
export function simulate(h: Hole, from: { x: number; y: number }, t0: number, shot: Shot, st?: HoleState, cap = SHOT_CAP): SimResult {
  const s = st ? cloneState(st) : newHoleState(h);
  const p = newPutter(h);
  p.ball.x = p.from.x = from.x;
  p.ball.y = p.from.y = from.y;
  if (!putt(p, shot)) return { x: from.x, y: from.y, sunk: false, water: false, time: 0, t: t0, st: s };
  let t = t0, time = 0;
  const n = cap / STEP + 2;
  for (let i = 0; i < n; i++) {
    const ev = advance(h, p, t, STEP, s);
    t += STEP;
    time += STEP;
    if (p.sunk) return { x: p.ball.x, y: p.ball.y, sunk: true, water: false, time, t, st: s };
    if (ev.some((e) => e.type === 'penalty')) return { x: from.x, y: from.y, sunk: false, water: true, time, t, st: s };
    if (!p.rolling) break;
  }
  return { x: p.ball.x, y: p.ball.y, sunk: false, water: false, time, t, st: s };
}

/**
 * A resting ball left alone from t0 to t1 (turntables carry it, gusts and
 * cabs shove it): where it is then. `steps` is how many STEP ticks.
 */
export function idle(h: Hole, from: { x: number; y: number }, t0: number, steps: number, st?: HoleState): { x: number; y: number; ok: boolean; atRest: boolean; st: HoleState } {
  const s = st ? cloneState(st) : newHoleState(h);
  if (!comp(h).dyn || steps <= 0) return { x: from.x, y: from.y, ok: true, atRest: true, st: s };
  const b: Ball = { x: from.x, y: from.y, vx: 0, vy: 0, z: 0, vz: 0 };
  let t = t0;
  for (let i = 0; i < steps; i++) {
    const r = stepBall(h, b, t, STEP, s);
    t += STEP;
    if (r.result) return { x: b.x, y: b.y, ok: false, atRest: false, st: s };
  }
  return { x: b.x, y: b.y, ok: true, atRest: b.vx === 0 && b.vy === 0, st: s };
}

// --------------------------------------------------- distance to the cup

/** Travel distance to the cup over the turf (around walls, through grates, portals and jumps). */
interface Field { x0: number; y0: number; w: number; h: number; d: Float64Array }
const fieldCache = new WeakMap<Hole, Map<string, Field>>();
const CELL = 1;
/** Field cost per cell of a standing crumbling wall, per knock it still needs (so the planner sees each knock as progress). */
const CRUMBLE_COST = 7;

const segsCross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/** Doors (gates with no cycle) that are shut in this state: the field routes round them. */
const shutDoors = (h: Hole, st?: HoleState): Gate[] => h.gates.filter((g) => !g.period && (!st || gateAt(g, 0, st).shut >= 1));

/** The field to a cup position (cached; a sliding cup gets a few, every switch setting its own). */
export function cupField(h: Hole, cx = h.cup.x, cy = h.cup.y, st?: HoleState): Field {
  const doors = shutDoors(h, st);
  // Knocks each crumbling wall still needs (a fresh hole if no state): every knock left makes going through dearer.
  const left = h.crumbles.map((q, i) => Math.max(0, q.hits - (st?.cracks[i] ?? 0)));
  const key = `${Math.round(cx)},${Math.round(cy)},${h.gates.map((g) => (doors.includes(g) ? 1 : 0)).join('')},${left.join('.')}`;
  let m = fieldCache.get(h);
  if (!m) fieldCache.set(h, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  const [bx0, by0, bx1, by1] = comp(h).bbox;
  const x0 = bx0, y0 = by0;
  const w = Math.ceil((bx1 - x0) / CELL) + 1, hh = Math.ceil((by1 - y0) / CELL) + 1;
  const free = new Uint8Array(w * hh);
  const cost = new Float32Array(w * hh);
  const px = (i: number) => x0 + (i % w) * CELL, py = (i: number) => y0 + Math.floor(i / w) * CELL;
  const lowSegs = comp(h).low;
  for (let i = 0; i < w * hh; i++) {
    const x = px(i), y = py(i);
    if (!inBounds(h, x, y) || wallDistance(h, x, y) < BALL_R * 0.9) continue;
    if (h.bumpers.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + BALL_R)) continue;
    if (doors.some((g) => segDist(x, y, g.a.x, g.a.y, g.b.x, g.b.y) < BALL_R + 0.6)) continue;
    free[i] = 1;
    let k = 1;
    if (surfaceAt(h, x, y, null).sand) k = 3;
    if (h.zones.some((z) => z.kind === 'water' && inZone(z, x, y))) k = 12;
    if (h.tides.some((td) => x > td.x0 && x < td.x1 && y > td.y0 && y < td.y1)) k = Math.max(k, 2);
    for (let ci = 0; ci < h.crumbles.length; ci++) if (left[ci] > 0 && pointInPoly(x, y, h.crumbles[ci].poly)) k = Math.max(k, 1 + CRUMBLE_COST * left[ci]);
    if (h.low.some((q) => pointInPoly(x, y, q)) || lowSegs.some((s) => segDist(x, y, s[0], s[1], s[2], s[3]) < BALL_R)) k = Math.max(k, 5);
    cost[i] = k;
  }
  const idx = (x: number, y: number) => {
    const i = Math.round((x - x0) / CELL), j = Math.round((y - y0) / CELL);
    return i >= 0 && j >= 0 && i < w && j < hh ? j * w + i : -1;
  };
  const d = new Float64Array(w * hh).fill(Infinity);
  // Teleports: reaching the exit counts as reaching every entry cell.
  const links: { exit: number; cells: number[]; add: number }[] = [];
  const cellsNear = (x: number, y: number, r: number) => {
    const out: number[] = [];
    for (let i = 0; i < w * hh; i++) if (free[i] && Math.hypot(px(i) - x, py(i) - y) < r) out.push(i);
    return out;
  };
  for (const g of h.grates) links.push({ exit: idx(g.to.x + Math.cos(g.dir) * 3, g.to.y + Math.sin(g.dir) * 3), cells: cellsNear(g.x, g.y, g.r), add: 2 });
  for (const po of h.portals) {
    const r = po.r ?? 2.6;
    links.push({ exit: idx(po.b.x, po.b.y), cells: cellsNear(po.a.x, po.a.y, r), add: 2 });
    if (!po.oneWay) links.push({ exit: idx(po.a.x, po.a.y), cells: cellsNear(po.b.x, po.b.y, r), add: 2 });
  }
  for (const j of h.jumps) {
    const fly = Math.max(20, (j.minSpeed ?? 38) * 1.3 * 2 * (j.lift ?? JUMP_LIFT) * (j.minSpeed ?? 38) * 1.3 / GRAVITY);
    const cells: number[] = [];
    for (let i = 0; i < w * hh; i++) if (free[i] && onJumpRamp(j, px(i), py(i))) cells.push(i);
    links.push({ exit: idx(j.x + Math.cos(j.dir) * fly, j.y + Math.sin(j.dir) * fly), cells, add: 4 });
  }
  // Dijkstra from the cup with a small binary heap.
  const heap: number[] = [], key2: number[] = [];
  const push = (i: number, k: number) => {
    heap.push(i);
    key2.push(k);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (key2[p] <= key2[c]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      [key2[p], key2[c]] = [key2[c], key2[p]];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0], key2[0]];
    const li = heap.pop()!, lk = key2.pop()!;
    if (heap.length) {
      heap[0] = li;
      key2[0] = lk;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let mm = c;
        if (l < heap.length && key2[l] < key2[mm]) mm = l;
        if (r < heap.length && key2[r] < key2[mm]) mm = r;
        if (mm === c) break;
        [heap[mm], heap[c]] = [heap[c], heap[mm]];
        [key2[mm], key2[c]] = [key2[c], key2[mm]];
        c = mm;
      }
    }
    return top;
  };
  let start = idx(cx, cy);
  if (start < 0 || !free[start]) {
    // A sliding cup sample next to a wall: start from the nearest open cell.
    let best = Infinity;
    for (let i = 0; i < w * hh; i++) if (free[i]) {
      const dd = Math.hypot(px(i) - cx, py(i) - cy);
      if (dd < best) (best = dd), (start = i);
    }
  }
  d[start] = 0;
  push(start, 0);
  const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  const ow = h.oneways;
  while (heap.length) {
    const [i, k] = pop();
    if (k > d[i]) continue;
    for (const ln of links) if (ln.exit === i) for (const c of ln.cells) if (k + ln.add < d[c]) (d[c] = k + ln.add), push(c, k + ln.add);
    const x = i % w, y = Math.floor(i / w);
    for (const [ox, oy, l] of N8) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue;
      const j = ny * w + nx;
      if (!free[j]) continue;
      if (ow.length) {
        // The ball travels j → i: a one-way gate only allows that heading its way.
        const ax = px(j), ay = py(j), bx = px(i), by = py(i);
        let ok = true;
        for (const o of ow) if (segsCross(ax, ay, bx, by, o.a.x, o.a.y, o.b.x, o.b.y) && (bx - ax) * Math.cos(o.dir) + (by - ay) * Math.sin(o.dir) <= 0) ok = false;
        if (!ok) continue;
      }
      const nk = k + (l * CELL * (cost[i] + cost[j])) / 2;
      if (nk < d[j]) (d[j] = nk), push(j, nk);
    }
  }
  const f = { x0, y0, w, h: hh, d };
  m.set(key, f);
  return f;
}

/** Distance to the cup from a point (the nearest open cell if it's tight against a wall). t picks a sliding cup's spot. */
export function cupDistance(h: Hole, x: number, y: number, t?: number, st?: HoleState): number {
  let cx = h.cup.x, cy = h.cup.y;
  if (h.cupTrack && t !== undefined) {
    // Snap a sliding cup to one of five spots on its track (a field each).
    const c = cupAt(h, t);
    const tr = h.cupTrack;
    const L = Math.hypot(tr.x - h.cup.x, tr.y - h.cup.y) || 1;
    const k = Math.round((Math.hypot(c.x - h.cup.x, c.y - h.cup.y) / L) * 4) / 4;
    cx = h.cup.x + (tr.x - h.cup.x) * k;
    cy = h.cup.y + (tr.y - h.cup.y) * k;
  }
  const f = cupField(h, cx, cy, st);
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
function value(h: Hole, r: SimResult, from: { x: number; y: number }, t: number): number {
  if (r.sunk) return -100 + r.time * 4;
  if (r.water) return cupDistance(h, from.x, from.y, t, r.st) + 45;
  return cupDistance(h, r.x, r.y, r.t, r.st);
}

/** How far off this player's putts go (radians; a fraction of the power). */
export function shotNoise(skill: number): { angle: number; power: number } {
  const k = clamp(skill, 0, 1);
  return { angle: 0.004 + (1 - k) * 0.12, power: 0.015 + (1 - k) * 0.26 };
}

/** A planned putt: the shot, and how many seconds to wait (after the planned moment) before hitting it. */
export interface PlannedShot extends Shot { wait: number }

/** Planner sims stop a shot after this long (s): a ball still going is a bad shot anyway. */
const PLAN_CAP = 12;

/**
 * The computer player's putt, a little at a time (the UI runs a slice of
 * it each frame while they line it up). The ball is at `from` at hole time
 * `t`; the putt goes `delay` seconds later (plus any wait the plan picks).
 * It searches the shots that work from there with the real physics at the
 * real time (so cabs, gates and flippers are where they'll be; a resting
 * ball on a turntable is where it will have been carried), tries a few
 * waits on holes where timing matters, prefers shots that still work when
 * the hand shakes as much as this player's does, then misses by an amount
 * set by skill (0 = first time holding a putter … 1 = never misses a read).
 * Yields after every few simulated shots; returns the shot.
 */
export function* planSteps(h: Hole, from: { x: number; y: number }, t: number, skill: number, rand: Rand = Math.random, st: HoleState = newHoleState(h), delay = 0): Generator<void, PlannedShot, void> {
  const noise = shotNoise(skill);
  const timed = isTimed(h);
  const waits = timed ? [0, 0.6, 1.2, 1.8, 2.5] : [0];
  const delaySteps = Math.round(delay / STEP);
  type Start = { w: number; x: number; y: number; t: number; st: HoleState };
  const starts: Start[] = [];
  for (const w of waits) {
    const steps = delaySteps + Math.round(w / STEP);
    const s = idle(h, from, t, steps, st);
    if (!s.ok || !s.atRest) continue;
    let tt = t;
    for (let i = 0; i < steps; i++) tt += STEP;
    starts.push({ w, x: s.x, y: s.y, t: tt, st: s.st });
  }
  if (!starts.length) starts.push({ w: 0, x: from.x, y: from.y, t: t + delay, st });
  const cands: { shot: Shot; v: number; s: Start }[] = [];
  const run = (s: Start, shot: Shot) => value(h, simulate(h, s, s.t, { angle: shot.angle, power: clamp(shot.power, 0.04, 1) }, s.st, PLAN_CAP), s, s.t) + s.w * 3;
  const tryShot = (s: Start, angle: number, power: number) => {
    const shot = { angle, power: clamp(power, 0.04, 1) };
    cands.push({ shot, v: run(s, shot), s });
  };
  let n = 0;
  for (const s of starts) {
    // Later waits only when hitting now doesn't already hole it.
    if (s !== starts[0] && cands.some((c) => c.v < -80)) break;
    const direct = Math.atan2(h.cup.y - s.y, h.cup.x - s.x);
    // Coarse: every 10° (every 20° for later waits), plus a fan round the straight line.
    const first = s === starts[0];
    const angles: number[] = [];
    const na = first ? 36 : 18;
    for (let i = 0; i < na; i++) angles.push((i / na) * Math.PI * 2);
    for (let i = -4; i <= 4; i++) angles.push(direct + i * 0.03);
    const powers = first ? [0.08, 0.15, 0.25, 0.36, 0.5, 0.66, 0.83, 1] : [0.12, 0.25, 0.4, 0.58, 0.78, 1];
    for (const a of angles) {
      for (const pw of powers) tryShot(s, a, pw);
      if (++n % 2 === 0) yield;
    }
  }
  // Fine: around the best few.
  const top = [...cands].sort((a, b) => a.v - b.v).slice(0, 3);
  for (const c of top) {
    for (let da = -3; da <= 3; da++) for (let dp = -2; dp <= 2; dp++) if (da || dp) tryShot(c.s, c.shot.angle + da * 0.015, c.shot.power * (1 + dp * 0.06));
    yield;
  }
  cands.sort((a, b) => a.v - b.v);
  // Among the near-best, the one that holds up when it's off by this player's usual miss.
  const da = Math.max(0.012, noise.angle), dp = Math.max(0.03, noise.power);
  let pick = cands[0], best = Infinity;
  // A spread of different ideas, not twelve copies of the same risky bank.
  const pool: typeof cands = [];
  const same = (q: (typeof cands)[number], c: (typeof cands)[number]) => q.s === c.s && Math.abs(Math.atan2(Math.sin(q.shot.angle - c.shot.angle), Math.cos(q.shot.angle - c.shot.angle))) < 0.06 && Math.abs(q.shot.power - c.shot.power) < 0.12;
  for (const c of cands) {
    if (pool.length >= 9) break;
    if (!pool.some((q) => same(q, c))) pool.push(c);
  }
  // ...plus a few soft lay-ups, so a shaky hand has a safe idea to fall back on.
  for (const c of cands) {
    if (pool.length >= 13) break;
    if (c.shot.power <= 0.45 && !pool.some((q) => same(q, c))) pool.push(c);
  }
  for (const c of pool) {
    let sum = c.v;
    for (const [a, p] of [[da, 0], [-da, 0], [0, dp], [0, -dp], [da * 0.7, dp * 0.7], [-da * 0.7, -dp * 0.7]]) sum += run(c.s, { angle: c.shot.angle + a, power: c.shot.power * (1 + p) });
    // People aim at the cup when that works: a bank off the back wall only wins by a clear margin.
    const direct = Math.atan2(h.cup.y - c.s.y, h.cup.x - c.s.x);
    const off = 1 - Math.cos(c.shot.angle - direct);
    const score = sum / 7 + off * 10;
    if (score < best) (best = score), (pick = c);
    yield;
  }
  return { angle: pick.shot.angle + gauss(rand) * noise.angle, power: clamp(pick.shot.power * (1 + gauss(rand) * noise.power), 0.04, 1), wait: pick.s.w };
}

/** The computer player's putt, all at once. */
export function planShot(h: Hole, from: { x: number; y: number }, t: number, skill: number, rand: Rand = Math.random, st?: HoleState, delay = 0): PlannedShot {
  const it = planSteps(h, from, t, skill, rand, st, delay);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

export interface Solve { strokes: number; sunk: boolean; pickedUp: boolean; /** Hole clock at the end (s): thinking, waiting and rolling. */ clock: number; /** Seconds spent waiting for a moment (gates, cabs…). */ waited: number; shots: PlannedShot[] }

/**
 * Play a hole out solo with the planner (pure; for tests and hole authors):
 * think `think` seconds before each putt, wait as planned, roll it out.
 * Proves a hole is beatable: solveHole(h, 1, seeded(1)).strokes ≤ par + 2.
 */
export function solveHole(h: Hole, skill = 1, rand: Rand = seeded(1), opts: { think?: number } = {}): Solve {
  const think = opts.think ?? 0.5;
  const st = newHoleState(h);
  const p = newPutter(h);
  const shots: PlannedShot[] = [];
  let t = 0, waited = 0;
  const tick = () => {
    advance(h, p, t, STEP, st);
    t += STEP;
  };
  for (let guard = 0; !p.done && guard < 40; guard++) {
    // Let a drifting ball settle.
    for (let i = 0; i < 15 / STEP && !p.done && !atRest(p); i++) tick();
    if (p.done) break;
    if (!atRest(p)) {
      p.done = p.pickedUp = true;
      break;
    }
    const shot = planShot(h, p.ball, t, skill, rand, st, think);
    const steps = Math.round(think / STEP) + Math.round(shot.wait / STEP);
    for (let i = 0; i < steps && !p.done; i++) tick();
    waited += shot.wait;
    if (p.done || !atRest(p)) continue; // knocked about while waiting: look again
    putt(p, shot);
    shots.push(shot);
    for (let i = 0; i < SHOT_CAP / STEP + 2 && p.rolling && !p.done; i++) tick();
  }
  return { strokes: p.strokes, sunk: p.sunk, pickedUp: p.pickedUp, clock: t, waited, shots };
}

// ------------------------------------------------------------- checking a hole

/** Everything wrong with a hole (empty = fine). For authors and tests. */
export function validateHole(h: Hole): string[] {
  const bad: string[] = [];
  const st = newHoleState(h);
  if (!h.name || !h.emoji || !h.tip) bad.push('needs a name, emoji and tip');
  if (!(h.par >= 2 && h.par <= 6)) bad.push(`par ${h.par} outside 2…6`);
  if (!(h.parTime >= 3 && h.parTime <= 90)) bad.push(`parTime ${h.parTime} outside 3…90 s`);
  const [x0, y0, x1, y1] = holeBox(h);
  if (x1 - x0 > 90 || y1 - y0 > 140 || x1 - x0 < 20 || y1 - y0 < 40) bad.push(`size ${x1 - x0}×${y1 - y0} outside 20…90 × 40…140`);
  const hazard = (x: number, y: number) =>
    h.zones.some((z) => (z.kind === 'water' || z.kind === 'sand' || z.kind === 'ramp' || z.kind === 'hill' || z.kind === 'ice') && inZone(z, x, y)) ||
    h.tides.some((td) => x > td.x0 && x < td.x1 && y > td.y0 && y < td.y1) ||
    h.conveyors.some((c) => pointInPoly(x, y, c.poly)) || h.turntables.some((tt) => Math.hypot(x - tt.x, y - tt.y) < tt.r + BALL_R) ||
    h.jumps.some((j) => onJumpRamp(j, x, y)) || h.winds.some((w) => pointInPoly(x, y, w.poly)) || h.magnets.some((m) => Math.hypot(x - m.x, y - m.y) < m.r && !(m.x === h.cup.x && m.y === h.cup.y));
  const spots: [string, XY][] = [['tee', h.tee], ['cup', h.cup]];
  if (h.cupTrack) spots.push(['cup track end', h.cupTrack]);
  for (const [name, p] of spots) {
    if (!inBounds(h, p.x, p.y, st)) bad.push(`${name} off the course`);
    else if (wallDistance(h, p.x, p.y) < BALL_R + 2) bad.push(`${name} too close to a wall`);
    if (name === 'tee' && hazard(p.x, p.y)) bad.push('tee on a hazard or moving surface');
    if (name !== 'tee' && h.zones.some((z) => (z.kind === 'water' || z.kind === 'sand') && inZone(z, p.x, p.y))) bad.push(`${name} in sand or water`);
  }
  for (const g of h.grates) if (!inBounds(h, g.to.x, g.to.y) || wallDistance(h, g.to.x, g.to.y) < BALL_R + 0.5) bad.push('grate exit off the course or in a wall');
  for (const po of h.portals) for (const q of [po.a, po.b]) if (!inBounds(h, q.x, q.y) || wallDistance(h, q.x, q.y) < (po.r ?? 2.6)) bad.push('portal off the course or in a wall');
  const ids = new Set(h.switches.map((s) => s.id));
  const links = [...h.conveyors, ...h.winds, ...h.movers, ...h.gates, ...h.magnets, ...h.portals, ...h.arms, ...h.turntables].map((o) => o.sw).filter(Boolean) as SwitchLink[];
  for (const l of links) if (!ids.has(l.id)) bad.push(`switch '${l.id}' is linked but not on the hole`);
  for (const s of h.switches) if (!inBounds(h, s.x, s.y)) bad.push(`switch '${s.id}' off the course`);
  for (const b of h.springs) if ((b.e ?? 1.35) < 1 || (b.e ?? 1.35) > 1.8) bad.push('spring restitution outside 1…1.8');
  for (const w of h.winds) if (w.on >= w.period - (w.warn ?? 1.2)) bad.push('wind blows too long: on + warn must be under the period');
  for (const g of h.gates) if (g.period && ((g.open ?? g.period / 2) < 0.8 || g.period - (g.open ?? g.period / 2) < 0.8)) bad.push('gate opens or shuts for under 0.8 s');
  for (const tr of h.tides) if (tr.hi > 1 || tr.lo < 0 || tr.lo > tr.hi) bad.push('tide lo/hi outside 0…1');
  // Nothing that pushes may trap a ball: drop one on every pushy cell, it must settle within 12 s.
  const pushy = (x: number, y: number) => !canRest(h, x, y, 0, st) || h.conveyors.some((c) => pointInPoly(x, y, c.poly));
  let trapped = 0;
  for (let y = y0 + 1; y < y1 && trapped < 1; y += 3) for (let x = x0 + 1; x < x1 && trapped < 1; x += 3) {
    if (!inBounds(h, x, y, st) || wallDistance(h, x, y) < BALL_R || !pushy(x, y)) continue;
    const p = newPutter(h);
    p.ball.x = p.from.x = x;
    p.ball.y = p.from.y = y;
    p.rolling = true;
    const s2 = cloneState(st);
    let t = 0;
    for (let i = 0; i < 12 / STEP && p.rolling && !p.done; i++) (advance(h, p, t, STEP, s2), (t += STEP));
    if (p.rolling && !p.done) {
      trapped++;
      bad.push(`a ball dropped at ${x.toFixed(0)},${y.toFixed(0)} never settles (a belt or ramp runs into a wall?)`);
    }
  }
  return bad;
}

// ---------------------------------------------------------------- scoring

export interface ScoreParts { strokePart: number; timePart: number; score: number }

/**
 * The round's 🏆 score (higher is better):
 *   score = round(1000 × (0.4 × min(2, P/S) + 0.6 × min(2, T₀/T)))
 * P par strokes, S strokes, T₀ par time (s), T active play time (s).
 * Par strokes in par time = 1000; half the strokes or half the time
 * doubles that part (each capped at 2×, so 2000 is the ceiling).
 */
export function scoreParts(par: number, strokes: number, parTime: number, time: number): ScoreParts {
  const S = Math.max(1, strokes), T = Math.max(0.5, time);
  const strokePart = 400 * Math.min(2, par / S);
  const timePart = 600 * Math.min(2, parTime / T);
  return { strokePart: Math.round(strokePart), timePart: Math.round(timePart), score: Math.round(strokePart + timePart) };
}
export const roundScore = (par: number, strokes: number, parTime: number, time: number): number => scoreParts(par, strokes, parTime, time).score;
/** The most a round can score (the leaderboard cap). */
export const SCORE_MAX = 2000;

/** The time a hole counts for: what you took, but a picked-up hole costs at least twice its par time. */
export const holeTime = (seconds: number, parTime: number, pickedUp: boolean): number => (pickedUp ? Math.max(seconds, parTime * 2) : seconds);

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

/** "1:07" or "42.3s". */
export function clockText(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- the save

/** Your best round on a course: its score, and the strokes and time it took. */
export interface CourseRecord { best: number; strokes: number; time: number; rounds: number }
/**
 * On GameState as `s.minigolf` (optional). The first four fields are the
 * old nine-hole record (2026-10-28) and still load; `courses` is new.
 */
export interface MinigolfRecord { best: number; bestScore: number; rounds: number; aces: number; courses?: Record<string, CourseRecord> }

type WithGolf = GameState & { minigolf?: MinigolfRecord };

export function minigolfOf(s: GameState): MinigolfRecord | undefined {
  return (s as WithGolf).minigolf;
}
export const courseRecord = (s: GameState, course: string): CourseRecord | undefined => minigolfOf(s)?.courses?.[course];

/**
 * Course i (0-based, ids c1…c7) is open once course i−1 has a finished
 * round. Anyone who finished a round of the old nine holes has played
 * Midtown's holes already, so course 2 is open for them too.
 */
export function courseUnlocked(s: GameState, i: number): boolean {
  if (i <= 0) return true;
  const r = minigolfOf(s);
  if (!r) return false;
  if ((r.courses?.[`c${i}`]?.rounds ?? 0) > 0) return true;
  return i === 1 && r.rounds > 0 && !r.courses;
}

/** The leaderboard game id for a course ('golf1'…'golf7'). */
export const boardId = (course: string): string => `golf${course.replace(/\D/g, '')}`;

export interface RoundResult { course: string; strokes: number; par: number; time: number; parTime: number; aces?: number; versus?: boolean }

/** A round is over: record it, cheer you up a bit. Returns the leaderboard score and its parts. */
export function finishMinigolf(s: GameState, r: RoundResult): ScoreParts & { best: boolean; underPar: boolean } {
  const st = Math.max(1, Math.round(r.strokes));
  const parts = scoreParts(r.par, st, r.parTime, r.time);
  const g = ((s as WithGolf).minigolf ??= { best: 0, bestScore: 0, rounds: 0, aces: 0 });
  const courses = (g.courses ??= {});
  const c = (courses[r.course] ??= { best: 0, strokes: 0, time: 0, rounds: 0 });
  const best = parts.score > c.best;
  if (best) Object.assign(c, { best: parts.score, strokes: st, time: Math.round(r.time * 10) / 10 });
  c.rounds++;
  g.bestScore = Math.max(g.bestScore, parts.score);
  g.rounds++;
  g.aces += Math.max(0, r.aces ?? 0);
  // The 🏆 board's offline view reads your best from here.
  const fun = (s.fun ??= { tickets: 0, best: {}, bets: [], casinoNet: 0 });
  const id = boardId(r.course);
  fun.best[id] = Math.max(fun.best[id] ?? 0, parts.score);
  applyNeeds(s, { fun: 14, social: r.versus ? 10 : 4, energy: -3 });
  const underPar = st < r.par;
  if (underPar) addMoodlet(s, { id: 'minigolf', label: 'Under par in the park', emoji: '⛳', value: 5, minutes: 180 });
  return { ...parts, best, underPar };
}
