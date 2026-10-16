// =====================================================================
// citymap.ts — the 🗺️ Full City Map (Peter, 2026-10-16: "add a way for
// people to buy a map where they can see all locations they can go to").
//
// Without it, the city map shows what you'd know anyway: homes, stations,
// landmarks, places you've been, and whatever's around you. Buy the Full
// City Map once ($250) and every place shows, with names from further
// out and filters by kind (🍕 food, 🪩 nightlife, 🎲 fun…).
// =====================================================================

import { doorOf, type PlaceDef } from '../data/places.ts';
import { chargeBill } from './economy.ts';
import type { GameState } from './types.ts';

export const CITY_MAP = {
  price: 25_000,
  /** Without the map, places this close to you (metres) still show. */
  nearMetres: 350,
};

export const hasCityMap = (s: GameState) => !!s.cityMap;

/** Buy it. Returns why not, or null. */
export function buyCityMap(s: GameState): string | null {
  if (hasCityMap(s)) return 'You already have it.';
  if (s.money + s.bank < CITY_MAP.price) return `The Full City Map is $${CITY_MAP.price / 100}.`;
  const { short } = chargeBill(s, CITY_MAP.price, '🗺️ Full City Map');
  if (short) return 'The payment didn’t go through.';
  s.cityMap = true;
  return null;
}

/** Does this place show on the city map for you? */
export function placeOnMap(s: GameState, p: PlaceDef, me: { x: number; z: number }): boolean {
  if (hasCityMap(s)) return true;
  if (p.type === 'home' || p.type === 'station' || p.type === 'landmark' || p.landmark) return true;
  if (s.stats.placesVisited.includes(p.id) || p.id === s.home.placeId) return true;
  const d = doorOf(p);
  return Math.hypot(d.x - me.x, d.z - me.z) < CITY_MAP.nearMetres;
}
