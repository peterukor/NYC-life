// =====================================================================
// goals.ts — the first-day tutorial, as a short list of goals.
//
// Each goal says what to do, how (a hint), what it pays, and how we
// know it's done. They teach the game one piece at a time: needs, a
// job, going out, the subway, and keeping money in the bank.
// =====================================================================

import { ACTIONS } from '../data/actions.ts';
import { changeMoney } from './economy.ts';
import type { GameState } from './types.ts';

export interface Goal {
  title: string;
  hint: string;
  reward: number;
  done: (s: GameState) => boolean;
}

const did = (s: GameState, tag: string) => Object.keys(s.stats.actionsDone).some((id) => ACTIONS[id]?.tags.includes(tag));

export const GOALS: Goal[] = [
  { title: 'Eat something', hint: 'Tap the fridge or the stove at home', reward: 500, done: (s) => did(s, 'eat') },
  { title: 'Freshen up', hint: 'Tap the shower', reward: 500, done: (s) => did(s, 'bathe') },
  { title: 'Get a job', hint: 'Phone → Jobs → Apply', reward: 1_000, done: (s) => !!s.job || s.stats.actionsDone['__shift'] > 0 },
  { title: 'Step outside', hint: 'Tap “Leave”, then tap the street to walk', reward: 500, done: (s) => s.location.placeId === null || s.stats.placesVisited.length > 1 },
  { title: 'Visit the bodega', hint: 'Map → Kings Deli & Grocery', reward: 1_000, done: (s) => s.stats.placesVisited.includes('bodegaHk') || s.stats.placesVisited.includes('bodegaBk') },
  { title: 'Work a shift', hint: 'Tap “Go to work” (6 AM – 11 PM)', reward: 1_500, done: (s) => (s.stats.actionsDone['__shift'] ?? 0) > 0 },
  { title: 'Ride the subway to Brooklyn', hint: 'Map → Brooklyn → pick a place → Subway', reward: 2_000, done: (s) => s.stats.placesVisited.some((p) => p === 'atlanticStation') || s.location.area === 'brooklyn' },
  { title: 'Bank your cash', hint: 'Phone → Bank → Deposit (cash can be pickpocketed)', reward: 1_000, done: (s) => s.bank > 0 },
];

/** The current goal, or null when the tutorial is finished. */
export function currentGoal(s: GameState): Goal | null {
  return GOALS[s.tutorialStep] ?? null;
}

/** Check the current goal; if done, pay the reward and move on. Returns the finished goal. */
export function checkGoal(s: GameState): Goal | null {
  const g = currentGoal(s);
  if (!g || !g.done(s)) return null;
  s.tutorialStep += 1;
  changeMoney(s, g.reward, `Goal: ${g.title}`);
  return g;
}
