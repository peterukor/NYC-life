// =====================================================================
// market.ts — the stock market: prices, buying, selling, net worth.
//
// PRICES are the same for every player: each game day, each stock moves
// by a random amount picked from the date with a seeded generator, plus
// its trend, plus the whole market's mood. The whole market's mood has
// slow booms and busts (a seam for the recession system: when the
// server exists, it can push the market mood down when too much money
// is in circulation).
//
// TRADING costs a small fee, and all money moves through economy.ts.
// =====================================================================

import { nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { STOCKS, type StockDef } from '../data/stocks.ts';
import { changeMoney } from './economy.ts';
import type { GameState } from './types.ts';

/** Trading fee per trade (cents) and as a share of the amount. */
export const TRADE_FEE = { flat: 100, rate: 0.005 } as const;

const DAY0 = Date.UTC(2026, 0, 1);

/** Game day number (days since Jan 1 2026 on the game calendar). */
export function marketDay(dateKey = nycTime().dateKey): number {
  const d = Date.UTC(+dateKey.slice(0, 4), +dateKey.slice(5, 7) - 1, +dateKey.slice(8, 10));
  return Math.max(0, Math.round((d - DAY0) / 86_400_000));
}

/** Standard-normal-ish random number from a seeded generator. */
function gauss(r: Rng): number {
  return (r.next() + r.next() + r.next() + r.next() - 2) * 1.73;
}

/**
 * Whole-market mood for a day: a slow wave of booms and busts, about
 * 1–2 cycles a game year. A recession is a stretch of negative mood.
 * (Server seam: replace or add to this when the economy goes online.)
 */
export function marketMood(day: number): number {
  return Math.sin(day / 58) * 0.0011 + Math.sin(day / 17 + 1.3) * 0.0004;
}

const cache = new Map<string, number[]>();

/** Price history in cents for a stock, from day 0 up to `day` (cached). */
function history(st: StockDef, day: number): number[] {
  let h = cache.get(st.id);
  if (!h) cache.set(st.id, (h = [st.start]));
  while (h.length <= day) {
    const d = h.length;
    const r = new Rng(`mkt-${st.id}-${d}`);
    const ret = st.drift + marketMood(d) * (st.fund ? 1 : 1.6) + st.vol * gauss(r);
    h.push(Math.max(1, Math.round(h[d - 1] * Math.exp(ret))));
  }
  return h;
}

export function priceOf(id: string, day = marketDay()): number {
  const st = STOCKS.get(id);
  return st ? history(st, day)[day] : 0;
}

/** The last `n` daily prices (for the little charts). */
export function recentPrices(id: string, n = 14, day = marketDay()): number[] {
  const st = STOCKS.get(id);
  if (!st) return [];
  return history(st, day).slice(Math.max(0, day - n + 1), day + 1);
}

/** Today's change in percent. */
export function dayChange(id: string, day = marketDay()): number {
  const p = recentPrices(id, 2, day);
  return p.length < 2 ? 0 : ((p[1] - p[0]) / p[0]) * 100;
}

export function tradeFee(cents: number): number {
  return TRADE_FEE.flat + Math.round(cents * TRADE_FEE.rate);
}

/** Buy about `cents` worth (fractional shares, like modern apps). */
export function buyStock(s: GameState, id: string, cents: number): string | null {
  const price = priceOf(id);
  if (!price) return 'Unknown stock.';
  const fee = tradeFee(cents);
  if (s.money < cents + fee) return 'Not enough cash on you (move money from the bank first).';
  const r = changeMoney(s, -(cents + fee), `Bought ${STOCKS.get(id)!.ticker}`);
  if (!r.ok) return r.why;
  const h = (s.portfolio[id] ??= { shares: 0, cost: 0 });
  h.shares += cents / price;
  h.cost += cents;
  return null;
}

/** Sell everything you hold in a stock. Returns the cash received, or an error. */
export function sellStock(s: GameState, id: string): { got: number } | { error: string } {
  const h = s.portfolio[id];
  if (!h || h.shares <= 0) return { error: 'You don’t own any.' };
  const value = Math.round(h.shares * priceOf(id));
  const got = Math.max(0, value - tradeFee(value));
  const r = changeMoney(s, got, `Sold ${STOCKS.get(id)!.ticker}`);
  if (!r.ok) return { error: r.why };
  delete s.portfolio[id];
  return { got };
}

export function portfolioValue(s: GameState): number {
  return Object.entries(s.portfolio).reduce((sum, [id, h]) => sum + Math.round(h.shares * priceOf(id)), 0);
}

/** Net worth = cash + bank + investments − debts. (Businesses and assets join later.) */
export function netWorth(s: GameState): number {
  return s.money + s.bank + portfolioValue(s) - (s.loan?.owed ?? 0);
}
