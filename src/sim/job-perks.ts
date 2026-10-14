// =====================================================================
// job-perks.ts — what makes each job its own (Peter, 2026-10-13).
//
// Before a shift is paid, shiftTwist() can change it:
// 🍸 Bartending: late-night tips (10 PM–4 AM) pay half again as much.
// 🌙 Night Dancer: 1 show in 4 a rowdy customer starts a fight. You win
//    or lose by fitness (sim/commute.ts → fightLoseChance). Losing hurts
//    and shrinks that show's tips. Very strong dancers (80%+ fitness)
//    scare tippers: down to ×0.7 tips at 100%.
// 💊 Alley Pharmacist: every shift raises your heat (less with street
//    smarts); heat cools off over time. High heat means the "customer"
//    might be undercover: busted, no pay, a night inside or bail.
// 🚓 Cop: about every other shift someone offers an envelope. Taking it
//    pays extra and raises exposure; at 100 exposure Internal Affairs
//    fires and arrests you. Refusing keeps you clean (and exposure fades).
//
// Fights are never graphic: the screen shows a cartoon dust cloud.
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { fightLoseChance } from './commute.ts';
import { arrest } from './jail.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import type { GameState } from './types.ts';

export const DANCER_FIGHT_CHANCE = 0.25;
export const HEAT = { perShift: 14, coolPerHour: 30, arrestAt: 40 } as const;
export const EXPOSURE = { perBribe: 22, fadePerShift: 4, caughtAt: 100, bribeChance: 0.5 } as const;

export type ShiftTwist =
  | { kind: 'fight'; won: boolean; payMult: number; text: string }
  | { kind: 'busted'; payMult: 0; text: string }
  | { kind: 'bribe'; amount: number; text: string }
  | { kind: 'late'; payMult: number; text: string };

/** Tips a dancer loses for being scary-strong (1 = none lost). */
export function intimidation(fitness: number): number {
  const f = Math.min(1, Math.max(0, fitness / 10));
  return f <= 0.8 ? 1 : 1 - (f - 0.8) * 1.5;
}

/** Heat now (it cools off while you're not selling). */
export function heatNow(s: GameState, now = nowMs()): number {
  const h = s.heat;
  if (!h) return 0;
  return Math.max(0, h.value - ((now - h.at) / 3_600_000) * HEAT.coolPerHour);
}

/** Chance the next sale is to an undercover cop. */
export function bustChance(heat: number): number {
  return heat < HEAT.arrestAt ? 0 : Math.min(0.5, (heat - HEAT.arrestAt) / 120);
}

/** What happens on this shift beyond the usual (null = a normal shift). */
export function shiftTwist(s: GameState, hour: number, rand = Math.random, now = nowMs()): ShiftTwist | null {
  const job = s.job;
  if (!job) return null;
  switch (job.careerId) {
    case 'bartender':
      return hour >= 22 || hour < 4 ? { kind: 'late', payMult: 1.5, text: 'Late-night crowd: tips ×1.5.' } : null;
    case 'dancer': {
      const scare = intimidation(s.skills.fitness);
      if (rand() >= DANCER_FIGHT_CHANCE) return scare < 1 ? { kind: 'late', payMult: scare, text: 'Customers tipped light. You look like you could bench the DJ.' } : null;
      const won = rand() >= fightLoseChance(s.skills.fitness);
      if (won) {
        addMoodlet(s, { id: 'wonFight', label: 'Handled a rowdy customer', emoji: '💪', value: 4, minutes: 60 });
        return { kind: 'fight', won, payMult: scare, text: 'A rowdy customer wouldn’t take no for an answer. One dust cloud later, security walked him out and the room cheered.' };
      }
      applyNeeds(s, { energy: -15, fun: -8 });
      addMoodlet(s, { id: 'lostFight', label: 'Got roughed up at work', emoji: '🤕', value: -6, minutes: 120 });
      return { kind: 'fight', won, payMult: 0.6 * scare, text: 'A rowdy customer started a fight and you came off worse. Security stepped in, but the night’s tips took a hit.' };
    }
    case 'pharmacist': {
      const heat = heatNow(s, now);
      if (rand() < bustChance(heat)) {
        s.heat = { value: 30, at: now };
        arrest(s, 'Selling on Orchard Street to an undercover cop', 24, 50_000);
        return { kind: 'busted', payMult: 0, text: 'Your last customer flashed a badge. Busted.' };
      }
      const gain = HEAT.perShift * (1 - Math.min(0.5, s.skills.streetSmarts / 20));
      s.heat = { value: Math.min(100, heat + gain), at: now };
      return null;
    }
    case 'cop':
      s.exposure = Math.max(0, (s.exposure ?? 0) - EXPOSURE.fadePerShift);
      if (rand() < EXPOSURE.bribeChance) return { kind: 'bribe', amount: Math.round((6_000 + job.level * 3_000) / 100) * 100, text: 'A guy you just pulled over slides an envelope across the seat. “For your trouble, officer.”' };
      return null;
  }
  return null;
}

/** The cop's choice. Taking it pays now and raises exposure; Internal Affairs may follow. */
export function resolveBribe(s: GameState, take: boolean, amount: number): { caught: boolean; text: string } {
  if (!take) {
    addMoodlet(s, { id: 'cleanCop', label: 'Kept it clean', emoji: '😇', value: 3, minutes: 90 });
    return { caught: false, text: 'You handed it back and wrote the ticket. Clean.' };
  }
  s.money += amount;
  s.exposure = (s.exposure ?? 0) + EXPOSURE.perBribe;
  if (s.exposure < EXPOSURE.caughtAt) return { caught: false, text: `You pocketed it. Exposure ${Math.round(s.exposure)}/100.` };
  s.exposure = 0;
  s.job = null;
  arrest(s, 'Taking bribes (Internal Affairs)', 48, 150_000);
  return { caught: true, text: 'Internal Affairs wanted a “quick chat.” It was not quick. Badge, gun, and freedom: gone.' };
}
