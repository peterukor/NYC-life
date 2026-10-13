// =====================================================================
// home-conditions.ts — what it's like to live where you live.
//
// Each starter home has a few conditions beyond its furniture
// (data/homes.ts → HomeConditions). They add texture, not punishment:
//
// - Shared bathroom (walk-up): now and then a roommate's in there and the
//   shower or toilet takes a few seconds longer.
// - Street noise (studio): an occasional broken night (a small bad mood).
// - Housekeeper (penthouse): coming home to a spotless place, once a day.
// - Doorman (UES, penthouse): signs for your deliveries.
// =====================================================================

import { layoutForPlace } from '../data/homes.ts';
import { PLACE_BY_ID } from '../data/places.ts';
import type { ActionDef } from '../data/actions.ts';
import { nycTime } from '../core/clock.ts';
import { addMoodlet } from './needs.ts';
import type { GameState } from './types.ts';

/** Seconds added when the shared bathroom is taken. */
export const BATHROOM_WAIT = 5;
export const BATHROOM_BUSY_CHANCE = 0.2;

function conditionsAt(placeId: string | null | undefined) {
  if (!placeId || PLACE_BY_ID[placeId]?.interior !== 'apartment') return undefined;
  return layoutForPlace(placeId).conditions;
}

/**
 * Starting a shower or the toilet in a shared bathroom: sometimes a
 * roommate's in there. Returns who (you wait BATHROOM_WAIT seconds), or null.
 */
export function bathroomTaken(placeId: string | null | undefined, a: ActionDef, rand = Math.random): string | null {
  const c = conditionsAt(placeId);
  if (!c?.sharedBathroom || !c.roommates?.length) return null;
  if (!a.tags.includes('bathe') && !a.tags.includes('toilet')) return null;
  if (rand() >= BATHROOM_BUSY_CHANCE) return null;
  return c.roommates[Math.floor(rand() * c.roommates.length)].name;
}

/** After a full sleep: street noise may have woken you once. Returns the moodlet, or null. */
export function nightNoise(s: GameState, placeId: string | null | undefined, a: ActionDef, rand = Math.random) {
  const c = conditionsAt(placeId);
  if (!c?.noise || !a.tags.includes('rest')) return null;
  if (rand() >= c.noise.chance) return null;
  const m = { id: 'streetNoise', label: c.noise.label, emoji: '🚨', value: -3, minutes: 45 };
  addMoodlet(s, m);
  return m;
}

/** Walking into your home: the housekeeper's been (once a day). Returns the moodlet, or null. */
export function arriveHome(s: GameState, placeId: string): { id: string; label: string; emoji: string; value: number } | null {
  if (placeId !== s.home.placeId) return null;
  const c = conditionsAt(placeId);
  if (!c?.housekeeper) return null;
  const day = nycTime().dateKey;
  if (s.home.cleanedDay === day) return null;
  s.home.cleanedDay = day;
  const m = { id: 'spotless', label: 'The housekeeper’s been. Spotless.', emoji: '✨', value: 4, minutes: 120 };
  addMoodlet(s, m);
  return m;
}

/** Does your building have a doorman (who signs for deliveries)? */
export function hasDoorman(s: GameState): boolean {
  return !!conditionsAt(s.home.placeId)?.doorman;
}
