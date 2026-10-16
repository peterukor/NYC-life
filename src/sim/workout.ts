// =====================================================================
// workout.ts — "Train hard" at the gym (Peter, 2026-10-14: a gym to
// work out). A set of 12 reps: tap when the bar is in the green. Clean
// reps build fitness (more than the plain timed workout); the green zone
// shrinks as you tire. The game itself is ui/workout.ts.
// =====================================================================

import { addMoodlet, applyNeeds } from './needs.ts';
import { skillGainMultiplier } from './state.ts';
import type { GameState } from './types.ts';

export const WORKOUT_REPS = 12;
/** Fitness per clean rep (a perfect set ≈ 1.4, vs 1.1 for a plain "Lift weights"). */
export const PER_REP = 0.12;

/** Perfect-form reps (dead centre) count a quarter extra. */
export function finishWorkout(s: GameState, clean: number, perfect = 0): { gain: number; pump: boolean } {
  const reps = Math.max(0, Math.min(WORKOUT_REPS, clean));
  const perf = Math.max(0, Math.min(reps, perfect));
  const gain = (reps + perf * 0.25) * PER_REP * skillGainMultiplier(s, 'fitness');
  s.skills.fitness = Math.min(10, s.skills.fitness + gain);
  applyNeeds(s, { energy: -14, hygiene: -14, hunger: -6, fun: 6 });
  const pump = reps >= 10;
  if (pump) addMoodlet(s, { id: 'pump', label: 'The pump is real', emoji: '💪', value: 6, minutes: 120 });
  return { gain, pump };
}

/** The green zone's size for rep i (0–1 of the bar): it shrinks as you tire, less if you're fit. */
export function zoneFor(rep: number, fitness: number): number {
  return Math.max(0.12, 0.34 - rep * 0.016 + Math.min(10, fitness) * 0.008);
}
