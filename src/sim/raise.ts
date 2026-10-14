// =====================================================================
// raise.ts — asking for a raise (Peter, 2026-10-13).
//
// Working shifts trains your job's skill. Once you're good enough (skill,
// performance and shifts at your level), you can ask your boss for a
// raise. That's a mini-game: hold to lift a line and keep it inside the
// green zone while the zone wanders. Stay in it to fill the meter before
// time runs out. Each job has 5 raises; every one is harder than the last
// (a smaller zone that moves faster, a meter that drains quicker), and
// the last one is really hard.
//
// Win: next rung of the ladder (more pay, new title). Lose: work a couple
// more shifts before you can ask again.
// =====================================================================

import { PROMOTION } from '../core/constants.ts';
import { CAREER_BY_ID } from '../data/careers.ts';
import { addMoodlet } from './needs.ts';
import type { GameState } from './types.ts';

/** Shifts to work after a "not yet" before you can ask again. */
export const RAISE_RETRY_SHIFTS = 2;
/** Seconds in one try. */
export const RAISE_SECONDS = 20;

/** Why you can't ask for a raise yet (null = you can). */
export function raiseBlocker(s: GameState): string | null {
  const job = s.job;
  if (!job) return 'No job';
  const c = CAREER_BY_ID[job.careerId];
  if (job.level >= c.ladder.length - 1) return 'You’re at the top of the pay scale';
  if (Math.floor(s.skills[c.skill]) < job.level + 1) return `Needs ${c.skill} ${job.level + 1}`;
  if (job.performance < PROMOTION.minPerformance) return `Needs performance ${PROMOTION.minPerformance}+ (now ${Math.round(job.performance)})`;
  const left = PROMOTION.shiftsPerLevel - job.shiftsAtLevel;
  if (left > 0) return `${left} more shift${left === 1 ? '' : 's'} at this level`;
  return null;
}

export interface RaiseDifficulty {
  /** Height of the green zone (share of the bar). */
  zone: number;
  /** How fast the zone wanders (bar heights per second). */
  speed: number;
  /** Meter fill per second while you're in the zone, and drain while you're out. */
  fill: number;
  drain: number;
}

/** Raise number 1–5 (your current rung + 1): each one harder. */
export function raiseDifficulty(raise: number): RaiseDifficulty {
  const i = Math.min(4, Math.max(0, raise - 1));
  return {
    zone: [0.34, 0.31, 0.28, 0.26, 0.245][i],
    speed: [0.18, 0.22, 0.26, 0.3, 0.33][i],
    fill: [0.25, 0.23, 0.21, 0.2, 0.19][i],
    drain: [0.12, 0.15, 0.18, 0.21, 0.24][i],
  };
}

export interface RaiseGame {
  d: RaiseDifficulty;
  /** Your line (0 = bottom, 1 = top) and its speed. */
  y: number;
  vy: number;
  /** Centre of the green zone, and where it's heading. */
  zoneY: number;
  zoneTo: number;
  /** The meter: 1 = raise won, 0 = lost. */
  meter: number;
  time: number;
  done: 'won' | 'lost' | null;
}

export function newRaiseGame(raise: number): RaiseGame {
  return { d: raiseDifficulty(raise), y: 0.3, vy: 0, zoneY: 0.5, zoneTo: 0.5, meter: 0.3, time: RAISE_SECONDS, done: null };
}

/** Is the line inside the green zone? */
export const inZone = (g: RaiseGame) => Math.abs(g.y - g.zoneY) <= g.d.zone / 2;

/** One step (dt seconds). `holding`: the player is pressing (the line rises). */
export function stepRaiseGame(g: RaiseGame, dt: number, holding: boolean, rand = Math.random): RaiseGame {
  if (g.done) return g;
  // Your line: hold to rise, let go to fall. It bounces softly off the ends.
  g.vy += (holding ? 2.4 : -2.0) * dt;
  g.vy = Math.max(-1.3, Math.min(1.3, g.vy));
  g.y += g.vy * dt;
  if (g.y < 0) { g.y = 0; g.vy = Math.abs(g.vy) * 0.25; }
  if (g.y > 1) { g.y = 1; g.vy = -Math.abs(g.vy) * 0.25; }
  // The zone wanders between random targets.
  const half = g.d.zone / 2;
  if (Math.abs(g.zoneTo - g.zoneY) < 0.01) g.zoneTo = half + rand() * (1 - 2 * half);
  const step = g.d.speed * dt;
  g.zoneY += Math.max(-step, Math.min(step, g.zoneTo - g.zoneY));
  // The meter.
  g.meter += (inZone(g) ? g.d.fill : -g.d.drain) * dt;
  g.time -= dt;
  if (g.meter >= 1) g.done = 'won';
  else if (g.meter <= 0 || g.time <= 0) g.done = 'lost';
  g.meter = Math.max(0, Math.min(1, g.meter));
  return g;
}

/** The boss's answer. Returns the new title if you got it. */
export function resolveRaise(s: GameState, won: boolean): string | null {
  const job = s.job;
  if (!job || raiseBlocker(s)) return null;
  const c = CAREER_BY_ID[job.careerId];
  if (!won) {
    job.shiftsAtLevel = Math.max(0, PROMOTION.shiftsPerLevel - RAISE_RETRY_SHIFTS);
    addMoodlet(s, { id: 'raiseNo', label: 'Boss said “not right now”', emoji: '😐', value: -4, minutes: 90 });
    return null;
  }
  job.level += 1;
  job.shiftsAtLevel = 0;
  job.performance = 55;
  addMoodlet(s, { id: 'promoted', label: 'Got the raise!', emoji: '📈', value: 25, minutes: 60 * 12 });
  return c.ladder[job.level].title;
}
