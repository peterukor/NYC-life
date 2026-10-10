// =====================================================================
// work.ts — getting hired, working shifts, and getting promoted.
//
// A shift is a short real-time task at your workplace. Halfway through
// you pick how to work (grind / chill / network), which trades pay and
// performance against needs. Good performance over enough shifts earns
// a promotion if your career's skill is high enough.
// =====================================================================

import { nycTime } from '../core/clock.ts';
import { MAX_SHIFTS_PER_DAY, PROMOTION, WORK_HOURS } from '../core/constants.ts';
import { clamp } from '../core/format.ts';
import { CAREER_BY_ID, type CareerDef } from '../data/careers.ts';
import { changeMoney } from './economy.ts';
import { applyNeeds, moodWorkMultiplier, addMoodlet } from './needs.ts';
import { skillGainMultiplier } from './state.ts';
import type { GameState } from './types.ts';

export type WorkStyle = 'grind' | 'chill' | 'network';

export const WORK_STYLES: Record<WorkStyle, { label: string; emoji: string; hint: string }> = {
  grind: { label: 'Grind hard', emoji: '🔥', hint: 'Best performance, drains energy and fun' },
  chill: { label: 'Take it easy', emoji: '😌', hint: 'Saves energy, boss notices' },
  network: { label: 'Network', emoji: '🤝', hint: 'Social + charisma, some performance' },
};

/** Why the player can't take this job, or null if they can. */
export function hireBlocker(s: GameState, c: CareerDef): string | null {
  if (c.requires && Math.floor(s.skills[c.requires.skill]) < c.requires.level) {
    return `Needs ${c.requires.skill} ${c.requires.level}`;
  }
  return null;
}

export function applyForJob(s: GameState, careerId: string): string | null {
  const c = CAREER_BY_ID[careerId];
  if (!c) return 'Unknown job';
  const block = hireBlocker(s, c);
  if (block) return block;
  s.job = { careerId, level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: nycTime().dateKey };
  return null;
}

export function quitJob(s: GameState): void {
  s.job = null;
}

/** Why a shift can't start right now, or null if it can. */
export function shiftBlocker(s: GameState): string | null {
  if (!s.job) return 'No job yet';
  const t = nycTime();
  if (t.hour < WORK_HOURS.start || t.hour >= WORK_HOURS.end) return 'Office closed — shifts run 6 AM to 11 PM';
  if (s.job.dayKey !== t.dateKey) {
    s.job.dayKey = t.dateKey;
    s.job.shiftsToday = 0;
  }
  if (s.job.shiftsToday >= MAX_SHIFTS_PER_DAY) return `Done for today (${MAX_SHIFTS_PER_DAY} shifts max)`;
  if (s.needs.energy < 12) return 'Too tired to work — get some sleep';
  return null;
}

export function jobTitle(s: GameState): string {
  if (!s.job) return 'Unemployed';
  const c = CAREER_BY_ID[s.job.careerId];
  return c.ladder[Math.min(s.job.level, c.ladder.length - 1)].title;
}

export function shiftPay(s: GameState): number {
  if (!s.job) return 0;
  const c = CAREER_BY_ID[s.job.careerId];
  return c.ladder[Math.min(s.job.level, c.ladder.length - 1)].pay;
}

export interface ShiftResult {
  pay: number;
  performanceDelta: number;
  promoted: string | null;
}

/** Finish a shift worked in the given style. Pays, updates performance, maybe promotes. */
export function completeShift(s: GameState, style: WorkStyle): ShiftResult {
  const job = s.job!;
  const c = CAREER_BY_ID[job.careerId];
  const mood = moodWorkMultiplier(s);

  let perf = 0;
  let payMult = 1;
  switch (style) {
    case 'grind':
      perf = 9 * mood;
      payMult = 1.1;
      applyNeeds(s, { energy: -16, fun: -12, hunger: -8, hygiene: -6 });
      break;
    case 'chill':
      perf = (Math.random() < 0.3 ? -6 : 2) * mood;
      applyNeeds(s, { energy: -6, fun: -2, hunger: -6 });
      break;
    case 'network':
      perf = 5 * mood;
      applyNeeds(s, { energy: -10, social: 18, hunger: -6 });
      s.skills.charisma += 0.35 * skillGainMultiplier(s, 'charisma');
      break;
  }
  s.skills[c.skill] += 0.4 * skillGainMultiplier(s, c.skill);

  job.performance = clamp(job.performance + perf, 0, 100);
  job.shiftsToday += 1;
  job.shiftsAtLevel += 1;
  job.shiftsTotal += 1;

  const pay = Math.round((shiftPay(s) * payMult * (0.85 + job.performance / 333)) / 25) * 25;
  changeMoney(s, pay, `${c.name} shift`);

  let promoted: string | null = null;
  const canRise = job.level < c.ladder.length - 1;
  const skillOk = Math.floor(s.skills[c.skill]) >= job.level + 1;
  if (canRise && skillOk && job.performance >= PROMOTION.minPerformance && job.shiftsAtLevel >= PROMOTION.shiftsPerLevel) {
    job.level += 1;
    job.shiftsAtLevel = 0;
    job.performance = 55;
    promoted = c.ladder[job.level].title;
    addMoodlet(s, { id: 'promoted', label: 'Promoted!', emoji: '📈', value: 25, minutes: 60 * 12 });
  }
  return { pay, performanceDelta: perf, promoted };
}
