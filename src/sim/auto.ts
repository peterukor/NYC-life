// =====================================================================
// auto.ts — AUTO MODE: your character keeps living while you're away.
//
// You pick a short routine (sleep, eat, shower, freelance…). While the
// game is closed, every AUTO.cycleHours real hours the routine runs once:
// needs go up, costs are paid, earnings come in. When you come back, you
// get a summary.
//
// THE RULES (from the owner's spec):
//   • Auto mode can NEVER fill every bar: needs are capped, and at least
//     one need always stays noticeably low — a routine is not a life.
//   • Leaving auto mode on for ~6 real days straight makes your
//     character depressed ("Stuck in a rut", a heavy mood penalty).
//   • To recover you have to actually live: 2 in-game days with a varied
//     mix of things you chose yourself (different activities, not the
//     routine).
// Every number is in AUTO below, so balancing is one place.
// =====================================================================

import { nowMs, nycTime } from '../core/clock.ts';
import { money } from '../core/format.ts';
import { ACTIONS } from '../data/actions.ts';
import { finishAction } from './activity.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet } from './needs.ts';
import { NEED_KEYS, type GameState } from './types.ts';

export const AUTO = {
  /** Real hours between routine runs while you're away. */
  cycleHours: 2,
  /** Most routine runs counted in one absence (stops idle farming). */
  maxCycles: 8,
  /** Most tasks in a routine. */
  maxRoutine: 5,
  /** No need can go above this from auto mode. */
  needCap: 85,
  /** At least one need is pulled down to this after a routine run. */
  lowNeed: 60,
  /** Real days of continuous auto mode before the blues hit. */
  bluesAfterDays: 6,
  /** In-game days of varied living needed to recover. */
  recoveryDays: 2,
  /** Distinct self-chosen activities that make a day count as "varied". */
  varietyPerDay: 4,
} as const;

/** Things auto mode can do (home activities only: no travelling while you're away). */
export const ROUTINE_CHOICES = ['sleep', 'snack', 'shower', 'toilet', 'watchTv', 'workout', 'freelance', 'codePractice', 'callMom'].filter((id) => ACTIONS[id]);

export interface AutoState {
  on: boolean;
  routine: string[];
  /** When auto mode was switched on (ms). */
  since: number;
  /** Set while the character has the auto-mode blues. */
  blues?: { dayKey: string; today: string[]; variedDays: number };
}

export function setAuto(s: GameState, on: boolean, routine: string[]): void {
  const clean = routine.filter((id) => ROUTINE_CHOICES.includes(id)).slice(0, AUTO.maxRoutine);
  if (on && !s.auto.on) s.auto.since = nowMs();
  s.auto.on = on && clean.length > 0;
  s.auto.routine = clean;
}

/**
 * Run the routine for an absence of `hours` real hours. Returns a short
 * summary for the "while you were away" message (or null).
 */
export function runAuto(s: GameState, hours: number): string | null {
  if (!s.auto.on || !s.auto.routine.length) return null;
  const cycles = Math.min(AUTO.maxCycles, Math.floor(hours / AUTO.cycleHours));
  let spent = 0;
  let earned = 0;
  const done = new Map<string, number>();
  for (let c = 0; c < cycles; c++) {
    for (const id of s.auto.routine) {
      const a = ACTIONS[id];
      if (!a) continue;
      if (a.cost) {
        if (s.money < a.cost) continue; // can't afford it: skip, don't go into debt
        changeMoney(s, -a.cost, `${a.label} (auto)`);
        spent += a.cost;
      }
      earned += finishAction(s, a).earned;
      done.set(a.label, (done.get(a.label) ?? 0) + 1);
    }
    capNeeds(s);
  }
  checkBlues(s);
  if (!cycles) return null;
  const list = [...done.entries()].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)).join(', ');
  const money$ = [earned ? `earned ${money(earned)}` : '', spent ? `spent ${money(spent)}` : ''].filter(Boolean).join(', ');
  return `🤖 Auto mode ran your routine ${cycles} time${cycles === 1 ? '' : 's'}: ${list}${money$ ? ` (${money$})` : ''}.`;
}

/** The "never fill every bar" rule. */
function capNeeds(s: GameState): void {
  for (const k of NEED_KEYS) s.needs[k] = Math.min(s.needs[k], AUTO.needCap);
  if (NEED_KEYS.every((k) => s.needs[k] > AUTO.lowNeed)) {
    // Pull down the need the routine cares least about (the lowest one).
    const lowest = NEED_KEYS.reduce((a, b) => (s.needs[a] <= s.needs[b] ? a : b));
    s.needs[lowest] = AUTO.lowNeed;
  }
}

/** Too long on autopilot → the blues. */
export function checkBlues(s: GameState, now = nowMs()): boolean {
  if (!s.auto.on || s.auto.blues) return false;
  if (now - s.auto.since < AUTO.bluesAfterDays * 86_400_000) return false;
  s.auto.blues = { dayKey: nycTime(now).dateKey, today: [], variedDays: 0 };
  addMoodlet(s, { id: 'autoBlues', label: 'Stuck in a rut', emoji: '🌧️', value: -25, minutes: 60 * 24 * 60 });
  return true;
}

/**
 * Call when the player does an activity themselves. Counts towards
 * recovering from the blues. Returns a message when they recover.
 */
export function recordVariety(s: GameState, actionId: string): string | null {
  const b = s.auto.blues;
  if (!b || s.auto.routine.includes(actionId)) return null;
  const today = nycTime().dateKey;
  if (b.dayKey !== today) {
    if (b.today.length >= AUTO.varietyPerDay) b.variedDays++;
    b.dayKey = today;
    b.today = [];
  }
  if (!b.today.includes(actionId)) b.today.push(actionId);
  const varied = b.variedDays + (b.today.length >= AUTO.varietyPerDay ? 1 : 0);
  if (varied >= AUTO.recoveryDays) {
    s.auto.blues = undefined;
    s.auto.since = nowMs(); // the clock restarts
    s.moodlets = s.moodlets.filter((m) => m.id !== 'autoBlues');
    addMoodlet(s, { id: 'backToLife', label: 'Back to living', emoji: '🌤️', value: 15, minutes: 60 * 12 });
    return 'You shook off the rut. Living your own life again feels good.';
  }
  return null;
}
