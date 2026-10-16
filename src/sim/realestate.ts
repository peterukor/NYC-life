// =====================================================================
// realestate.ts — buying homes (Peter, 2026-10-15: "make it possible to
// buy properties").
//
// Any home can be bought (except the shelter): about five years of its
// rent. Live in a home you own and you pay no rent. Own one you don't
// live in and it's rented out: tenants pay you its rent every week, less
// a management cut, and now and then the boiler breaks. Sell any time
// for 90% back (not the one you live in: move out first).
// Phone → 🏠 Homes has the buttons. Rent comes in with each new day
// (sim/life.ts → rollDays).
// =====================================================================

import { money } from '../core/format.ts';
import { nycTime } from '../core/clock.ts';
import { PLACE_BY_ID, type PlaceDef } from '../data/places.ts';
import { chargeBill, changeMoney } from './economy.ts';
import type { GameState } from './types.ts';

export const REAL_ESTATE = {
  /** Price = this many weeks of rent. */
  weeksOfRent: 260,
  /** Share of rent you keep after the management company. */
  keep: 0.8,
  /** Weekly chance something breaks, and what it costs (× weekly rent). */
  repairOdds: 0.12,
  repairCost: 0.5,
  /** Selling gets you this share of the price. */
  sellBack: 0.9,
};

export interface OwnedHome {
  placeId: string;
  price: number;
  /** NYC date rent was last collected (for tenants). */
  lastRent: string;
}

export const ownedOf = (s: GameState): OwnedHome[] => (s.owned ??= []);
export const owns = (s: GameState, placeId: string) => ownedOf(s).some((o) => o.placeId === placeId);

/** What a home costs to buy (cents), or 0 if it isn't for sale. */
export function homePrice(p: PlaceDef): number {
  if (p.type !== 'home' || !p.rent) return 0;
  return Math.round((p.rent * REAL_ESTATE.weeksOfRent) / 10_000) * 10_000;
}

export function buyHome(s: GameState, placeId: string): string | null {
  const p = PLACE_BY_ID[placeId];
  const price = p ? homePrice(p) : 0;
  if (!price) return 'That one isn’t for sale.';
  if (owns(s, placeId)) return 'You already own it.';
  if (s.money + s.bank < price) return `It’s ${money(price)}. You have ${money(s.money + s.bank)}.`;
  const { short } = chargeBill(s, price, `🔑 Bought ${p.name.replace(/^Your\s+/i, '')}`);
  if (short) return 'The payment didn’t go through.';
  ownedOf(s).push({ placeId, price, lastRent: nycTime().dateKey });
  // Live there? No more rent.
  if (s.home.placeId === placeId) s.home.weeklyRent = 0;
  return null;
}

export function sellHome(s: GameState, placeId: string): { got: number } | { error: string } {
  const i = ownedOf(s).findIndex((o) => o.placeId === placeId);
  if (i < 0) return { error: 'You don’t own it.' };
  if (s.home.placeId === placeId) return { error: 'You live here. Move out first.' };
  const got = Math.round((ownedOf(s)[i].price * REAL_ESTATE.sellBack) / 100) * 100;
  ownedOf(s).splice(i, 1);
  changeMoney(s, got, `🔑 Sold ${PLACE_BY_ID[placeId]?.name.replace(/^Your\s+/i, '') ?? 'a home'}`);
  return { got };
}

/** Weekly rent from tenants (homes you own but don't live in). Returns notes for the day. */
export function collectRents(s: GameState, today: string, rand = Math.random): string[] {
  const out: string[] = [];
  for (const o of ownedOf(s)) {
    if (o.placeId === s.home.placeId) {
      o.lastRent = today; // no tenants while you live there
      continue;
    }
    const p = PLACE_BY_ID[o.placeId];
    const days = Math.floor((Date.parse(today) - Date.parse(o.lastRent)) / 86_400_000);
    let weeks = Math.min(4, Math.floor(days / 7)); // a long absence pays up to a month
    if (weeks <= 0 || !p?.rent) continue;
    o.lastRent = new Date(Date.parse(o.lastRent) + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
    while (weeks-- > 0) {
      const rent = Math.round((p.rent * REAL_ESTATE.keep) / 100) * 100;
      changeMoney(s, rent, `🏠 Rent from tenants (${p.name.replace(/^Your\s+/i, '')})`);
      out.push(`🏠 Your tenants paid ${money(rent)}.`);
      if (rand() < REAL_ESTATE.repairOdds) {
        const fix = Math.round((p.rent * REAL_ESTATE.repairCost) / 100) * 100;
        chargeBill(s, fix, '🔧 Repairs for your tenants');
        out.push(`🔧 The boiler broke at your place. Repairs: ${money(fix)}.`);
      }
    }
  }
  return out;
}
