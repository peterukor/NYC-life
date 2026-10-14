// =====================================================================
// commute.ts — what getting around costs you (Peter, 2026-10-13).
//
// 🚶 Walk: free, but a long walk tires you and puts you in a mood.
// 🚇 Subway: $2.90. Mostly fine; now and then a fight breaks out or
//    someone spills on you. Turn up to work with a stain and the manager
//    rates you lower, unless you change first (the closet).
// 🚗 Rideshare: costs money (surge at rush hour), arrive fresh.
// 🚙 Drive: gas and tolls each trip (sim/garage.ts).
//
// Fights anywhere use one rule (fightLoseChance): fitter people lose less.
// =====================================================================

import { addMoodlet, applyNeeds } from './needs.ts';
import { changeMoney } from './economy.ts';
import type { GameState } from './types.ts';

/**
 * Chance you lose a fight, from fitness 0–10 (Peter's numbers):
 * fitness 0% → lose 90%, 50% → 65%, 100% → 5%. It drops faster the
 * fitter you get, so training keeps paying off.
 */
export function fightLoseChance(fitness: number): number {
  const f = Math.min(1, Math.max(0, fitness / 10));
  return Math.min(0.9, Math.max(0.05, 0.9 - 0.15 * f - 0.7 * f * f));
}

/** A walk across town: tired and a bit grumpy, more so the further it was. Distance in metres. */
export function afterWalk(s: GameState, metres: number): { energy: number; fun: number } | null {
  if (metres < 250) return null;
  const energy = -Math.min(15, Math.round(metres / 120));
  const fun = -Math.min(10, Math.round(metres / 200));
  applyNeeds(s, { energy, fun });
  if (metres > 900) addMoodlet(s, { id: 'longWalk', label: 'Walked mad blocks. Feet hurt.', emoji: '🦶', value: -3, minutes: 40 });
  return { energy, fun };
}

export const SUBWAY_SPILL_CHANCE = 0.08;
export const SUBWAY_FIGHT_CHANCE = 0.04;
export const FIGHT_HOSPITAL = 4_000;

export type SubwayIncident =
  | { kind: 'spill'; text: string }
  | { kind: 'fight'; won: boolean; text: string };

/** Something happening on the train (most rides: nothing). */
export function subwayIncident(s: GameState, rand = Math.random): SubwayIncident | null {
  const r = rand();
  if (r < SUBWAY_SPILL_CHANCE) {
    s.stained = true;
    addMoodlet(s, { id: 'spill', label: 'Someone’s coffee is on your shirt', emoji: '☕', value: -4, minutes: 120 });
    return { kind: 'spill', text: 'The train braked hard and a man’s whole iced coffee went on your shirt. He said sorry. You did not accept.' };
  }
  if (r < SUBWAY_SPILL_CHANCE + SUBWAY_FIGHT_CHANCE) {
    const won = rand() >= fightLoseChance(s.skills.fitness);
    if (won) {
      addMoodlet(s, { id: 'wonFight', label: 'Won a fight on the train', emoji: '💪', value: 4, minutes: 60 });
      s.skills.streetSmarts = Math.min(10, s.skills.streetSmarts + 0.1);
      return { kind: 'fight', won, text: 'A guy tried you over a seat. A cloud of dust later, he got off at the next stop.' };
    }
    applyNeeds(s, { energy: -15, fun: -10 });
    changeMoney(s, -FIGHT_HOSPITAL, 'Urgent care after a subway fight');
    addMoodlet(s, { id: 'lostFight', label: 'Got beat up on the train', emoji: '🤕', value: -6, minutes: 120 });
    return { kind: 'fight', won, text: 'A fight broke out over a seat and you lost. Urgent care: $40.' };
  }
  return null;
}

/** You changed clothes: the stain's gone. */
export function changedClothes(s: GameState): void {
  s.stained = false;
}

/** Starting a shift with a stain: the manager rates you lower. Returns the line to show, or null. */
export function stainAtWork(s: GameState): string | null {
  if (!s.stained || !s.job) return null;
  s.job.performance = Math.max(0, s.job.performance - 8);
  return 'Your manager saw the stain on your shirt. Performance −8. Change before your next shift.';
}
