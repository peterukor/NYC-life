// =====================================================================
// gym-games.ts — seven short gym mini-games (Peter: "Gym will be mini
// games, not too long"). Each is 30–60 seconds. This file is the rules
// side (no DOM): the list, what a session does to you, personal bests,
// and the pure helpers the games use (zones, interval plans, combos).
// The games themselves: ui/gym-games.ts + ui/gym-runs.ts.
//
// 🏋️ bench     8 reps on a timing bar; the green shrinks as you tire.
// 🏃 treadmill  alternate taps to hold your speed in the band.
// 🥊 bag        hit the combo prompts on the beat.
// 🪢 rope       jump as the rope passes; double-unders at speed.
// 🚴 spin       hold to ride the instructor's cadence line.
// 🚣 row        pull on the catch; split time per 500 m.
// 🧘 yoga       keep the balance dot centred through three poses.
//
// A session builds fitness by how well it went (quality 0..1). After
// four sessions in one in-game day the gains shrink: your legs are cooked.
// =====================================================================

import { nowMs, nycTime } from '../core/clock.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { skillGainMultiplier } from './state.ts';
import type { GameState } from './types.ts';

/** Saved on GameState (optional, so old saves load fine). */
export interface GymState {
  /** In-game day (NYC date key) the count below belongs to. */
  day: string;
  /** Sessions finished that day. */
  today: number;
  /** Personal best score per game id. */
  best: Record<string, number>;
  /** Sessions ever (for flavour). */
  total: number;
}

declare module './types.ts' {
  interface GameState {
    gym?: GymState;
  }
}

export interface GymGame {
  id: string;
  name: string;
  emoji: string;
  howTo: string;
  /** Roughly how long a round lasts. */
  seconds: number;
  /** Theme colour (HUD, frame, furniture accents). */
  color: string;
}

export const GYM_GAMES: GymGame[] = [
  { id: 'bench', name: 'Bench Press', emoji: '🏋️', seconds: 30, color: '#ffb703', howTo: 'Tap when the marker is in the green to press the rep. Dead centre is perfect form. 8 reps, and the green shrinks as you tire (fitter = bigger green).' },
  { id: 'treadmill', name: 'Treadmill Sprint', emoji: '🏃', seconds: 40, color: '#ff8c1a', howTo: 'Tap left, right, left, right to run. Keep your speed inside the green band as it changes: jog, sprint, hill. Same foot twice and you stumble.' },
  { id: 'bag', name: 'Heavy Bag Combos', emoji: '🥊', seconds: 40, color: '#e63946', howTo: 'Hit the punch shown when its ring closes on the bag: JAB, CROSS, HOOK, UPPER. Clean combos fill the meter; full meter = fury, double points.' },
  { id: 'rope', name: 'Jump Rope', emoji: '🪢', seconds: 45, color: '#06d6a0', howTo: 'Tap to jump as the rope reaches your feet. It speeds up. Tap again while in the air for a big jump: clear the rope twice for a double-under. 3 misses and you’re done.' },
  { id: 'spin', name: 'Spin Class', emoji: '🚴', seconds: 45, color: '#9b5de5', howTo: 'Hold to pedal harder, let go to ease off. Keep your cadence on the instructor’s line. Climbs are heavy, sprints are fast.' },
  { id: 'row', name: 'Rowing Machine', emoji: '🚣', seconds: 40, color: '#118ab2', howTo: 'When the pacer hits CATCH, drag down to pull. Good timing plus a long pull = a fast boat. Watch your split per 500 m.' },
  { id: 'yoga', name: 'Yoga Flow', emoji: '🧘', seconds: 36, color: '#5fb49c', howTo: 'Drag to lean against the wobble and keep the dot in the centre ring. Three poses, about 12 seconds each. Slow and steady wins.' },
];

export const GYM_BY_ID: Record<string, GymGame> = Object.fromEntries(GYM_GAMES.map((g) => [g.id, g]));

/** Sessions per day before gains start to shrink. */
export const GYM_FRESH_SESSIONS = 4;

function gymOf(s: GameState): GymState {
  const g = (s.gym ??= { day: '', today: 0, best: {}, total: 0 });
  g.best ??= {};
  g.today ??= 0;
  g.total ??= 0;
  return g;
}

/** Sessions already done on the in-game day of `now`. */
export function gymSessionsToday(s: GameState, now = nowMs()): number {
  const g = s.gym;
  return g && g.day === nycTime(now).dateKey ? g.today : 0;
}

export const gymBest = (s: GameState, id: string): number => s.gym?.best?.[id] ?? 0;

/** Gain factor for the n-th session of the day (0-based): full for the first four, then it fades. */
export function gymFatigue(done: number): number {
  if (done < GYM_FRESH_SESSIONS) return 1;
  return Math.max(0.1, Math.pow(0.6, done - GYM_FRESH_SESSIONS + 1));
}

/** Fitness for a session before trait/fatigue multipliers: 0.15 for a bad run up to 1.4 for a flawless one. */
export function baseGain(quality: number): number {
  const q = Math.max(0, Math.min(1, quality || 0));
  return 0.15 + 1.25 * q;
}

/** 0..3 stars for a quality. */
export function stars(quality: number): number {
  return quality >= 0.85 ? 3 : quality >= 0.6 ? 2 : quality >= 0.3 ? 1 : 0;
}

export interface GymResult {
  gain: number;
  pump: boolean;
  best: boolean;
  /** Past the fresh sessions for today (gains were reduced). */
  tired: boolean;
}

/** A finished round: fitness, needs, the pump, and a personal best. */
export function finishGymGame(s: GameState, id: string, score: number, quality: number, now = nowMs()): GymResult {
  const g = gymOf(s);
  const day = nycTime(now).dateKey;
  if (g.day !== day) {
    g.day = day;
    g.today = 0;
  }
  const q = Math.max(0, Math.min(1, Number.isFinite(quality) ? quality : 0));
  const factor = gymFatigue(g.today);
  const tired = factor < 1;
  const gain = Math.min(10 - s.skills.fitness, baseGain(q) * factor * skillGainMultiplier(s, 'fitness'));
  const realGain = Math.max(0, gain);
  s.skills.fitness = Math.min(10, s.skills.fitness + realGain);
  g.today++;
  g.total++;
  const sc = Math.max(0, Math.round(Number.isFinite(score) ? score : 0));
  const best = sc > (g.best[id] ?? 0);
  if (best) g.best[id] = sc;
  // Short rounds: less draining than a full "Train hard" set.
  applyNeeds(s, { energy: -(6 + 6 * q), hygiene: -(7 + 5 * q), hunger: -3, fun: tired ? 2 : 5 });
  const pump = q >= 0.75 && !tired;
  if (pump) addMoodlet(s, { id: 'pump', label: 'The pump is real', emoji: '💪', value: 6, minutes: 120 });
  return { gain: realGain, pump, best, tired };
}

// ------------------------------------------------------------ helpers

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A small seeded generator (mulberry32) for tests and replays. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 🏋️ bench ------------------------------------------------------------
export const BENCH_REPS = 8;

/** Green zone size (0..1 of the bar) for rep i: shrinks as you tire, bigger when fit. */
export function benchZone(rep: number, fitness: number): number {
  return Math.max(0.1, 0.34 - rep * 0.022 + Math.min(10, Math.max(0, fitness)) * 0.009);
}

/** Judge a tap at bar position p against a zone starting at `at` of size `size`. */
export function benchJudge(p: number, at: number, size: number): 'perfect' | 'clean' | 'miss' {
  if (p < at || p > at + size) return 'miss';
  return Math.abs(p - (at + size / 2)) <= size * 0.18 ? 'perfect' : 'clean';
}

export function benchQuality(clean: number, perfect: number): number {
  return clamp01((clean * 0.8 + perfect * 0.2) / BENCH_REPS);
}

// 🏃 treadmill ---------------------------------------------------------
export type RunKind = 'jog' | 'sprint' | 'hill';
export interface RunSeg {
  kind: RunKind;
  from: number;
  to: number;
  /** Speed band (mph). */
  lo: number;
  hi: number;
}
const RUN_BANDS: Record<RunKind, [number, number, number]> = {
  // lo, hi, seconds
  jog: [6, 9, 7],
  sprint: [12.5, 16, 6],
  hill: [7, 10, 7],
};
/** Belt drag per kind (hills are heavy: more taps for less speed). */
export const RUN_DRAG: Record<RunKind, number> = { jog: 0.35, sprint: 0.35, hill: 0.6 };

/** Interval plan: a jog warm-up, then sprint/hill/jog in a shuffled order, never the same twice in a row. */
export function treadmillPlan(rand: () => number, seconds = 40): RunSeg[] {
  const out: RunSeg[] = [];
  let t = 0;
  let kind: RunKind = 'jog';
  while (t < seconds) {
    const [lo, hi, len] = RUN_BANDS[kind];
    const to = Math.min(seconds, t + len + Math.round(rand() * 2));
    out.push({ kind, from: t, to, lo, hi });
    t = to;
    const next = (['jog', 'sprint', 'hill'] as RunKind[]).filter((k) => k !== kind);
    // Lean towards sprints after a jog, so the round has punch.
    kind = kind === 'jog' ? (rand() < 0.6 ? 'sprint' : 'hill') : next[Math.floor(rand() * next.length)];
  }
  return out;
}

export function segAt<T extends { from: number; to: number }>(plan: T[], t: number): T {
  return plan.find((p) => t >= p.from && t < p.to) ?? plan[plan.length - 1];
}

// 🥊 bag -------------------------------------------------------------------
export const PUNCHES = ['jab', 'cross', 'hook', 'upper'] as const;
export type Punch = (typeof PUNCHES)[number];

/** A combo to throw: 2 punches early, up to 5 later. Jab openers are common (like a real coach calls). */
export function bagCombo(rand: () => number, level: number): Punch[] {
  const n = Math.min(5, 2 + Math.floor(level / 2) + (rand() < 0.3 ? 1 : 0));
  const out: Punch[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 && rand() < 0.55) out.push('jab');
    else out.push(PUNCHES[Math.floor(rand() * PUNCHES.length)]);
  }
  return out;
}

/** Seconds for the timing ring to close, by combo level (it tightens as you go). */
export function bagRingTime(level: number): number {
  return Math.max(0.5, 0.95 - level * 0.05);
}

/** Judge an offset (s) from the beat. */
export function judgeOffset(dt: number, perfect = 0.09, good = 0.2): 'perfect' | 'good' | 'miss' {
  const a = Math.abs(dt);
  return a <= perfect ? 'perfect' : a <= good ? 'good' : 'miss';
}

// 🪢 rope ------------------------------------------------------------------
/** Seconds per rope turn at time t (speeds up to ~0.42 s). */
export function ropePeriod(t: number): number {
  return Math.max(0.42, 0.95 - t * 0.012);
}
export const ROPE_AIR = 0.36;
export const ROPE_BIG_AIR = 0.66;

/** Did the jumper clear the rope at fraction f (0..1) of a jump? (Feet are low at take-off and landing.) */
export function ropeClears(f: number): boolean {
  return f > 0.07 && f < 0.93;
}

export function ropeQuality(seconds: number, total: number, doubles: number, misses: number): number {
  return clamp01((seconds / total) * 0.75 + Math.min(1, doubles / 5) * 0.25 - misses * 0.04);
}

// 🚴 spin ------------------------------------------------------------------
export type SpinCall = 'warm' | 'climb' | 'sprint' | 'recover';
export interface SpinSeg {
  call: SpinCall;
  from: number;
  to: number;
  /** Target cadence (rpm). */
  rpm: number;
}
/** Class plan: warm-up, then climbs and sprints with a short recovery, ending on a sprint. */
export function spinPlan(rand: () => number, seconds = 45): SpinSeg[] {
  const out: SpinSeg[] = [{ call: 'warm', from: 0, to: 6, rpm: 70 }];
  let t = 6;
  let i = 0;
  while (t < seconds) {
    const left = seconds - t;
    const call: SpinCall = left <= 9 ? 'sprint' : i % 3 === 2 ? 'recover' : rand() < 0.5 ? 'climb' : 'sprint';
    const len = left <= 9 ? left : call === 'recover' ? 4 : 7 + Math.round(rand() * 2);
    const rpm = call === 'climb' ? 58 + Math.round(rand() * 8) : call === 'sprint' ? 100 + Math.round(rand() * 12) : 72;
    out.push({ call, from: t, to: Math.min(seconds, t + len), rpm });
    t += len;
    i++;
  }
  return out;
}

/** Smooth target cadence at time t (eases between segments). */
export function spinTarget(plan: SpinSeg[], t: number): number {
  const seg = segAt(plan, t);
  const idx = plan.indexOf(seg);
  const prev = idx > 0 ? plan[idx - 1].rpm : seg.rpm;
  const k = clamp01((t - seg.from) / 1.2);
  const ease = k * k * (3 - 2 * k);
  return prev + (seg.rpm - prev) * ease;
}

// 🚣 row -------------------------------------------------------------------
/** Seconds per stroke at time t (24 → 30 strokes a minute). */
export function rowPeriod(t: number): number {
  return 60 / Math.min(30, 24 + t * 0.15);
}
/** Split per 500 m (seconds) at a speed in m/s. */
export function split500(speed: number): number {
  return speed > 0.2 ? 500 / speed : 0;
}
/** 1:52.3 */
export function fmtSplit(sec: number): string {
  if (!sec || !Number.isFinite(sec) || sec > 599) return '-:--.-';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

// 🧘 yoga ------------------------------------------------------------------
export const YOGA_POSES = [
  { name: 'Tree', wobble: 0.8 },
  { name: 'Warrior III', wobble: 1.1 },
  { name: 'Crow', wobble: 1.4 },
];
/** A smooth wobble force (sum of sines with seeded phases), roughly -1..1 per axis. */
export function yogaWobble(rand: () => number): (t: number) => { x: number; y: number } {
  const w = Array.from({ length: 6 }, () => ({ f: 0.25 + rand() * 0.9, p: rand() * Math.PI * 2 }));
  return (t) => ({
    x: (Math.sin(t * w[0].f * 2 + w[0].p) + Math.sin(t * w[1].f * 3.1 + w[1].p) * 0.6 + Math.sin(t * w[2].f * 5.3 + w[2].p) * 0.3) / 1.9,
    y: (Math.sin(t * w[3].f * 2 + w[3].p) + Math.sin(t * w[4].f * 3.3 + w[4].p) * 0.6 + Math.sin(t * w[5].f * 4.9 + w[5].p) * 0.3) / 1.9,
  });
}
