// =====================================================================
// goals.ts — the first-day tutorial, as a short list of goals.
//
// Each goal says what to do, how (a hint), what it pays, and how we
// know it's done. They teach the game one piece at a time: needs, a
// job, a first furniture upgrade, going out, and keeping money in the bank.
// =====================================================================

import { ACTIONS } from '../data/actions.ts';
import { FURNITURE } from '../data/furniture.ts';
import { changeMoney } from './economy.ts';
import type { GameState } from './types.ts';
import { layoutForPlace } from '../data/homes.ts';

export interface Goal {
  title: string;
  hint: string;
  reward: number;
  done: (s: GameState) => boolean;
}

const did = (s: GameState, tag: string) => Object.keys(s.stats.actionsDone).some((id) => ACTIONS[id]?.tags.includes(tag));

// The first loop (Peter, 2026-10-13): leave home → work → get paid → buy a
// better bed → place it → feel the better sleep. Then the wider city.
// (A home never rearranged has no saved layout yet: use its starting furniture.)
const placedBetterBed = (s: GameState) => (s.homes[s.home.placeId] ?? layoutForPlace(s.home.placeId).furniture).some((i) => FURNITURE.get(i.item)?.kind === 'bed' && FURNITURE.get(i.item)?.quality !== 'cheap');
const ownsBetterBed = (s: GameState) => placedBetterBed(s) || (s.storage ?? []).some((id) => FURNITURE.get(id)?.kind === 'bed' && FURNITURE.get(id)?.quality !== 'cheap');

export const GOALS: Goal[] = [
  { title: 'Eat something', hint: 'Tap the fridge or the stove at home', reward: 500, done: (s) => did(s, 'eat') },
  { title: 'Freshen up', hint: 'Tap the shower', reward: 500, done: (s) => did(s, 'bathe') },
  { title: 'Get a job', hint: 'Tap 💼 Find a job (or the counter at El Barrio Deli, round the corner)', reward: 1_000, done: (s) => !!s.job || (s.stats.actionsDone['__shift'] ?? 0) > 0 },
  { title: 'Work a shift', hint: 'Tap 💼 Go to work and pick how to get there', reward: 1_500, done: (s) => (s.stats.actionsDone['__shift'] ?? 0) > 0 },
  { title: 'Buy a better bed', hint: 'Lexington Home Goods, a few blocks south → a Single bed', reward: 1_000, done: ownsBetterBed },
  { title: 'Put your new bed in', hint: 'At home: 📦 Storage → Swap for the twin bed', reward: 1_000, done: placedBetterBed },
  { title: 'Sleep in your new bed', hint: 'Tap the bed → Sleep it off', reward: 1_500, done: (s) => (s.stats.actionsDone['__betterSleep'] ?? 0) > 0 },
  // Was "Ride the subway to Brooklyn" until Manhattan became the whole game (2026-10-12).
  { title: 'See Times Square', hint: 'Map → Times Square', reward: 2_000, done: (s) => s.stats.placesVisited.includes('timesSquare') || s.stats.placesVisited.includes('atlanticStation') },
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
