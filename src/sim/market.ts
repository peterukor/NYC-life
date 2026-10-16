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
import { BUSINESS_TYPES } from '../data/businesses.ts';

const BUSINESS_PRICE: Record<string, number> = Object.fromEntries(BUSINESS_TYPES.all().map((b) => [b.id, b.price]));
import { changeMoney } from './economy.ts';
import { addRep, tradeRep } from './rep.ts';
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

/** Game hour of the market (24 a game day; a game day is about 3 h 23 min real). */
export function marketTick(t = nycTime()): number {
  return marketDay(t.dateKey) * 24 + t.hour;
}

export type MarketEvent = { kind: 'squeeze' | 'rug' | 'earnings' | 'scandal'; day: number; move: number; label: string };

/**
 * What happens to a stock on a day beyond its usual wobble (seeded, so
 * everyone sees the same thing). Penny and meme stocks can squeeze (shoot
 * up during the day) or, for memes, rug-pull; big companies move on
 * earnings day (once a month); anyone can have a scandal.
 */
export function eventFor(st: StockDef, day: number): MarketEvent | null {
  if (st.risk === 'fund') return null;
  const r = new Rng(`evt-${st.id}-${day}`);
  const x = r.next();
  const size = r.next();
  if ((st.risk === 'meme' && x < 0.03) || (st.risk === 'penny' && x < 0.015)) {
    // ×2 to ×13 for a meme in a day (and 1 squeeze in 25 is a mega squeeze, ×20–40); ×1.5 to ×4 for a penny stock.
    const move = st.risk === 'meme' ? (size > 0.96 ? 3.0 + (size - 0.96) * 17 : 0.7 + size * 1.9) : 0.4 + size * 1.0;
    return { kind: 'squeeze', day, move, label: `${st.ticker} short squeeze` };
  }
  if (st.risk === 'meme' && x < 0.045) return { kind: 'rug', day, move: -(0.6 + size * 1.2), label: `${st.ticker} rug pull` };
  if ((st.risk === 'blue' || st.risk === 'growth') && (day + st.id.length * 7) % 30 === 0) {
    const move = (size - 0.42) * (st.risk === 'growth' ? 0.3 : 0.16);
    return { kind: 'earnings', day, move, label: `${st.ticker} earnings ${move >= 0 ? 'beat' : 'miss'}` };
  }
  if (x > 0.9985) return { kind: 'scandal', day, move: -(0.1 + size * 0.2), label: `${st.ticker} scandal` };
  return null;
}

const cache = new Map<string, number[]>();

/** Hourly price history in cents for a stock, from tick 0 up to `tick` (cached). */
function history(st: StockDef, tick: number): number[] {
  let h = cache.get(st.id);
  if (!h) cache.set(st.id, (h = [st.start]));
  while (h.length <= tick) {
    // One generator per stock per day, drawn hour by hour (fast, and the same for everyone).
    const day = Math.floor(h.length / 24);
    const r = new Rng(`mkt-${st.id}-${day}`);
    for (let k = 0; k < h.length - day * 24; k++) r.next(), r.next(), r.next(), r.next(); // (resume mid-day)
    const evt = eventFor(st, day);
    const hourVol = st.vol / Math.sqrt(24);
    const mood = marketMood(day) * (st.fund ? 1 : 1.6);
    while (h.length <= tick && Math.floor(h.length / 24) === day) {
      const hour = h.length % 24;
      let ret = (st.drift + mood) / 24 + hourVol * gauss(r);
      // Events play out over the trading hours (10 AM to 3 PM).
      if (evt && hour >= 10 && hour < 16) ret += evt.move / 6;
      // After a squeeze the air comes out over the next 3 days (most of it, not all).
      for (let back = 1; back <= 3; back++) {
        const past = day - back >= 0 ? eventFor(st, day - back) : null;
        if (past?.kind === 'squeeze' && hour >= 9 && hour < 17) ret -= (past.move * 0.27) / 8;
      }
      const prev = h[h.length - 1];
      // Penny and meme stocks can fall to a cent but not to zero.
      h.push(Math.max(1, Math.round(prev * Math.exp(ret))));
    }
  }
  return h;
}

/** Price (cents) at a market hour. */
export function priceAt(id: string, tick: number): number {
  const st = STOCKS.get(id);
  return st ? history(st, tick)[tick] : 0;
}

/** Price on a day: right now for today, the closing price for other days. */
export function priceOf(id: string, day = marketDay()): number {
  const now = marketTick();
  const tick = day === Math.floor(now / 24) ? now : day * 24 + 23;
  return priceAt(id, tick);
}

/** The last `n` daily prices, today's being the price right now (for the little charts). */
export function recentPrices(id: string, n = 14, day = marketDay()): number[] {
  const out: number[] = [];
  for (let d = Math.max(0, day - n + 1); d <= day; d++) out.push(priceOf(id, d));
  return out;
}

/** The last `n` hourly prices (the trading floor's live chart). */
export function hourlyPrices(id: string, n = 24, tick = marketTick()): number[] {
  const st = STOCKS.get(id);
  if (!st) return [];
  return history(st, tick).slice(Math.max(0, tick - n + 1), tick + 1);
}

/** Today's change in percent (now vs yesterday's close). */
export function dayChange(id: string, day = marketDay()): number {
  const p = recentPrices(id, 2, day);
  return p.length < 2 ? 0 : ((p[1] - p[0]) / p[0]) * 100;
}

/**
 * The fee for a trade. 📈 Finance workers pay less (a job perk): half the
 * rate to start, less each raise, and no flat fee from Director up.
 */
/**
 * 📍 At the trading floor (Midtown Tower) in person: no fees, and profits
 * earn 50% more 💼 corporate rep (Peter, 2026-10-15: perks for going out).
 */
export function atTradingFloor(s?: GameState): boolean {
  return s?.location.placeId === 'midtownTower';
}
export const FLOOR_REP_BONUS = 1.5;

export function tradeFee(cents: number, s?: GameState): number {
  if (atTradingFloor(s)) return 0;
  const fin = s?.job?.careerId === 'finance' ? s.job.level : -1;
  if (fin < 0) return TRADE_FEE.flat + Math.round(cents * TRADE_FEE.rate);
  const rate = TRADE_FEE.rate * Math.max(0.1, 0.5 - 0.08 * fin);
  return (fin >= 3 ? 0 : TRADE_FEE.flat) + Math.round(cents * rate);
}

/**
 * 📈 Finance perk: desk chatter about tomorrow. Right about 3 times in 4
 * (the same tip all day). Null if you don't work in finance.
 */
export function deskTip(s: GameState, day = marketDay()): { id: string; up: boolean } | null {
  if (s.job?.careerId !== 'finance') return null;
  const ids = STOCKS.all().map((x) => x.id);
  if (!ids.length) return null;
  const move = (id: string) => (priceOf(id, day + 1) - priceOf(id, day)) / Math.max(1, priceOf(id, day));
  const best = ids.reduce((a, b) => (Math.abs(move(b)) > Math.abs(move(a)) ? b : a));
  // A seeded coin for the day: sometimes the desk is wrong.
  const r = ((day * 9301 + 49297) % 233280) / 233280;
  if (r < 0.75) return { id: best, up: move(best) >= 0 };
  const other = ids[(day * 7) % ids.length];
  return { id: other, up: move(other) < 0 };
}

/** Buy about `cents` worth (fractional shares, like modern apps). */
export function buyStock(s: GameState, id: string, cents: number): string | null {
  const price = priceOf(id);
  if (!price) return 'Unknown stock.';
  const fee = tradeFee(cents, s);
  if (s.money < cents + fee) return 'Not enough cash on you (move money from the bank first).';
  const r = changeMoney(s, -(cents + fee), `Bought ${STOCKS.get(id)!.ticker}`);
  if (!r.ok) return r.why;
  const h = (s.portfolio[id] ??= { shares: 0, cost: 0 });
  h.shares += cents / price;
  h.cost += cents;
  return null;
}

/** Sell everything you hold in a stock. Returns the cash received, or an error. */
export function sellStock(s: GameState, id: string): { got: number; mult: number; corp: number; rankUp: string | null } | { error: string } {
  const h = s.portfolio[id];
  if (!h || h.shares <= 0) return { error: 'You don’t own any.' };
  const value = Math.round(h.shares * priceOf(id));
  // How many times your money you made (10×, 30×… get a show at the trading floor).
  const mult = h.cost > 0 ? value / h.cost : 1;
  const got = Math.max(0, value - tradeFee(value, s));
  const r = changeMoney(s, got, `Sold ${STOCKS.get(id)!.ticker}`);
  if (!r.ok) return { error: r.why };
  delete s.portfolio[id];
  // 💼 Corporate rep for a profitable trade.
  const corp = Math.round(tradeRep(got - h.cost, mult) * (atTradingFloor(s) ? FLOOR_REP_BONUS : 1));
  const rankUp = addRep(s, 'corporate', corp);
  return { got, mult, corp, rankUp };
}

export function portfolioValue(s: GameState): number {
  return Object.entries(s.portfolio).reduce((sum, [id, h]) => sum + Math.round(h.shares * priceOf(id)), 0);
}

/** Net worth = cash + bank + investments + businesses − debts. */
export function netWorth(s: GameState): number {
  const biz = s.business?.owned.reduce((sum, b) => sum + Math.round((BUSINESS_PRICE[b.type] ?? 0) * 0.8), 0) ?? 0;
  return s.money + s.bank + portfolioValue(s) + biz - (s.loan?.owed ?? 0);
}
