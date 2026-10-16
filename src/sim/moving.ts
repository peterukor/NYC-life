// =====================================================================
// moving.ts — moving house (Peter, 2026-10-15: "add it that you can move
// houses").
//
// Phone → 🏠 Homes lists every home in the open areas. Moving costs the
// movers' fee plus the first week's rent up front, and the landlord wants
// to see you could cover a few weeks (cash + bank) before handing over
// the keys. Your furniture in each home stays arranged the way you left
// it (state.homes), and anything you bought sits in Storage.
//
// TO TUNE: MOVING.
// =====================================================================

import { nowMs, nycTime } from '../core/clock.ts';
import { PLACE_BY_ID, type PlaceDef } from '../data/places.ts';
import { chargeBill } from './economy.ts';
import { isOpenArea, type GameState } from './types.ts';

export const MOVING = {
  /** Movers (cents). */
  fee: 15_000,
  /** The landlord wants cash + bank to cover this many weeks of rent. */
  proofWeeks: 4,
};

/** Every home you could live in (open areas only), cheapest first. */
export function homesForRent(): PlaceDef[] {
  return Object.values(PLACE_BY_ID)
    .filter((p) => p.type === 'home' && isOpenArea(p.area))
    .sort((a, b) => (a.rent ?? 0) - (b.rent ?? 0));
}

/** A home's name as a listing: "Your Hell's Kitchen studio" → "Hell's Kitchen studio" unless it's yours. */
export function listingName(s: GameState, p: PlaceDef): string {
  if (p.id === s.home.placeId) return p.name;
  return p.name.replace(/^Your\s+/i, '').replace(/\s*\(for rent\)$/i, '').replace(/^./, (c) => c.toUpperCase());
}

/** What moving in costs today: movers + the first week. */
export function moveCost(p: PlaceDef, s?: GameState): number {
  // 🔑 Know Bianca the realtor (data/clubs.ts): the movers are on her.
  const fee = s && (s.connections ?? []).includes('realtor') ? 0 : MOVING.fee;
  // Moving into a home you own: just the movers.
  const mine = !!s && (s.owned ?? []).some((o) => o.placeId === p.id);
  return fee + (mine ? 0 : p.rent ?? 0);
}

/** Why you can't move there (null = you can). */
export function moveBlocker(s: GameState, p: PlaceDef): string | null {
  if (p.type !== 'home') return 'That isn’t a home.';
  if (p.id === s.home.placeId) return 'You already live here.';
  if (s.jail && s.jail.until > nowMs()) return 'Hard to sign a lease from a cell.';
  const rent = p.rent ?? 0;
  const have = s.money + s.bank;
  if (have < moveCost(p, s)) return 'You can’t cover the movers and the first week.';
  const mine = (s.owned ?? []).some((o) => o.placeId === p.id);
  if (!mine && rent > 0 && have < rent * MOVING.proofWeeks) return `The landlord wants to see ${MOVING.proofWeeks} weeks of rent in the bank first.`;
  return null;
}

/** Move. Returns an error, or null when you've got the keys. */
export function moveTo(s: GameState, p: PlaceDef): string | null {
  const why = moveBlocker(s, p);
  if (why) return why;
  const { short } = chargeBill(s, moveCost(p, s), `Moved to ${listingName(s, p)} (movers + first week)`);
  if (short > 0) return 'The payment didn’t go through.';
  // Rent is paid for this week; the next one is due in 7 days.
  const mine = (s.owned ?? []).some((o) => o.placeId === p.id);
  s.home = { area: p.area, placeId: p.id, weeklyRent: mine ? 0 : p.rent ?? 0, rentDueDay: nycTime().dateKey };
  return null;
}
