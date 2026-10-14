// =====================================================================
// sports.ts — the stadium sportsbook (Peter, 2026-10-14).
// In-game money only. Bet on who wins; a draw gives your stake back.
//
// FEED SEAM: everything reads games through a SportsFeed. For now it's
// SimFeed: made-up teams, a new game every 5 real minutes across five
// sports, each lasting 12 minutes, results seeded so everyone sees the
// same scores. To wire real games later, implement SportsFeed (fixtures,
// one fixture by id, and its result once final) and call setSportsFeed().
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { changeMoney } from './economy.ts';
import type { GameState } from './types.ts';

export type Sport = 'baseball' | 'basketball' | 'football' | 'soccer' | 'hockey';
export const SPORT_EMOJI: Record<Sport, string> = { baseball: '⚾', basketball: '🏀', football: '🏈', soccer: '⚽', hockey: '🏒' };

export interface Fixture {
  id: string;
  sport: Sport;
  home: string;
  away: string;
  /** Real time (ms). */
  startsAt: number;
  endsAt: number;
  /** Decimal odds: a $10 bet at 1.80 returns $18. */
  odds: { home: number; away: number };
}

export interface Score { home: number; away: number }
export interface Result extends Score { winner: 'home' | 'away' | 'draw' }

export interface SportsFeed {
  /** Games starting between `from` and `to` (and any still being played). */
  fixtures(from: number, to: number): Fixture[];
  fixture(id: string): Fixture | null;
  /** The final result, once the game is over (null before). */
  result(f: Fixture, now: number): Result | null;
  /** The score right now (live games), if the feed has it. */
  live?(f: Fixture, now: number): Score | null;
}

// ---------------------------------------------------------- the sim feed

const TEAMS: Record<Sport, string[]> = {
  baseball: ['New York Empires', 'Boston Harbors', 'Chicago Gusts', 'LA Sunsets', 'Philly Bells', 'Toronto Moose'],
  basketball: ['Brooklyn Bridges', 'Miami Waves', 'Denver Peaks', 'Golden Gates', 'Atlanta Peaches', 'Detroit Motors'],
  football: ['Jersey Turnpikes', 'Dallas Lone Stars', 'Green Bay Cheese', 'Buffalo Blizzard', 'Vegas High Rollers', 'Seattle Rain'],
  soccer: ['Queens United', 'Bronx FC', 'Harlem City', 'Staten Island Ferry FC', 'Long Island Sound', 'Hudson Rovers'],
  hockey: ['Manhattan Ice', 'Montreal Frost', 'Pittsburgh Ironworks', 'Minnesota Loons', 'Buffalo Snowplows', 'Tampa Gators'],
};
const SPORTS: Sport[] = ['baseball', 'basketball', 'football', 'soccer', 'hockey'];
/** A new game every 5 minutes; each lasts 12. */
export const SIM_EVERY = 5 * 60_000;
export const SIM_LENGTH = 12 * 60_000;

function simFixture(slot: number): Fixture {
  const r = new Rng(`fx-${slot}`);
  const sport = SPORTS[((slot % SPORTS.length) + SPORTS.length) % SPORTS.length];
  const teams = TEAMS[sport];
  const hi = Math.floor(r.next() * teams.length);
  let ai = Math.floor(r.next() * (teams.length - 1));
  if (ai >= hi) ai++;
  const pHome = homeChance(slot);
  // 5% margin (the book's cut).
  const price = (p: number) => Math.max(1.05, Math.round((0.95 / p) * 100) / 100);
  return {
    id: `sim-${slot}`,
    sport,
    home: teams[hi],
    away: teams[ai],
    startsAt: slot * SIM_EVERY,
    endsAt: slot * SIM_EVERY + SIM_LENGTH,
    odds: { home: price(pHome), away: price(1 - pHome) },
  };
}

/** The home side's real chance in a sim game (strength + home edge). */
function homeChance(slot: number): number {
  const r = new Rng(`fx-str-${slot}`);
  return Math.min(0.85, Math.max(0.15, 0.53 + (r.next() - 0.5) * 0.6));
}

function simResult(f: Fixture): Result {
  const slot = Number(f.id.slice(4));
  const r = new Rng(`fx-res-${slot}`);
  const p = homeChance(slot);
  const roll = r.next();
  // Soccer can end level (about 1 in 4); the stake comes back.
  const draw = f.sport === 'soccer' && r.next() < 0.25;
  const winner: Result['winner'] = draw ? 'draw' : roll < p ? 'home' : 'away';
  const [lo, hi, step] = ({ baseball: [0, 9, 1], basketball: [88, 128, 1], football: [3, 38, 1], soccer: [0, 4, 1], hockey: [0, 6, 1] } as const)[f.sport];
  let a = lo + Math.floor(r.next() * (hi - lo + 1)) * step;
  let b = lo + Math.floor(r.next() * (hi - lo + 1)) * step;
  if (winner === 'draw') b = a;
  else {
    if (a === b) a += f.sport === 'basketball' ? 3 : 1;
    if (a < b) [a, b] = [b, a];
  }
  return winner === 'away' ? { home: b, away: a, winner } : { home: a, away: b, winner };
}

export const SimFeed: SportsFeed = {
  fixtures(from, to) {
    const out: Fixture[] = [];
    for (let slot = Math.floor((from - SIM_LENGTH) / SIM_EVERY); slot * SIM_EVERY <= to; slot++) {
      const f = simFixture(slot);
      if (f.endsAt > from) out.push(f);
    }
    return out;
  },
  fixture(id) {
    return id.startsWith('sim-') ? simFixture(Number(id.slice(4))) : null;
  },
  result(f, now) {
    return now >= f.endsAt ? simResult(f) : null;
  },
  live(f, now) {
    if (now < f.startsAt) return null;
    const end = simResult(f);
    const t = Math.min(1, (now - f.startsAt) / (f.endsAt - f.startsAt));
    // The score builds up over the game (never past the final).
    const part = (n: number, salt: number) => Math.min(n, Math.floor(n * Math.min(1, t * (0.8 + 0.4 * new Rng(`fx-live-${f.id}-${salt}`).next()))));
    return t >= 1 ? { home: end.home, away: end.away } : { home: part(end.home, 1), away: part(end.away, 2) };
  },
};

let feed: SportsFeed = SimFeed;
/** Plug in real games (later). */
export function setSportsFeed(f: SportsFeed): void {
  feed = f;
}
export const sportsFeed = () => feed;

// ------------------------------------------------------------------ betting

export const SPORTS_BET = { min: 500, max: 500_000 } as const;

export interface Bet {
  id: string;
  fixtureId: string;
  /** "Home vs Away" and the sport, for the slip. */
  label: string;
  emoji: string;
  pick: 'home' | 'away';
  team: string;
  stake: number;
  odds: number;
  placedAt: number;
  settled?: 'won' | 'lost' | 'push';
  /** What came back (cents). */
  paid?: number;
}

function betsOf(s: GameState): Bet[] {
  return (s.fun ??= { tickets: 0, best: {}, bets: [], casinoNet: 0 }).bets;
}

export function placeBet(s: GameState, fixtureId: string, pick: 'home' | 'away', stake: number, now = nowMs()): string | null {
  const f = feed.fixture(fixtureId);
  if (!f) return 'That game isn’t on the board';
  if (now >= f.startsAt) return 'Betting closed: the game has started';
  if (stake < SPORTS_BET.min) return 'Minimum bet is $5';
  if (stake > SPORTS_BET.max) return 'Maximum bet is $5,000';
  if (s.money < stake) return 'Not enough cash on you';
  changeMoney(s, -stake, `🏟️ Bet: ${f[pick]}`);
  betsOf(s).unshift({ id: `bet-${now}-${Math.floor(Math.random() * 1e6)}`, fixtureId, label: `${f.home} vs ${f.away}`, emoji: SPORT_EMOJI[f.sport], pick, team: f[pick], stake, odds: f.odds[pick], placedAt: now });
  // Keep the slip short.
  const bets = betsOf(s);
  if (bets.length > 40) bets.splice(40);
  return null;
}

/** Pay out every bet whose game is over. Returns the ones settled now. */
export function settleBets(s: GameState, now = nowMs()): Bet[] {
  const done: Bet[] = [];
  for (const b of betsOf(s)) {
    if (b.settled) continue;
    const f = feed.fixture(b.fixtureId);
    const r = f && feed.result(f, now);
    if (!r) continue;
    b.settled = r.winner === 'draw' ? 'push' : r.winner === b.pick ? 'won' : 'lost';
    b.paid = b.settled === 'won' ? Math.round(b.stake * b.odds) : b.settled === 'push' ? b.stake : 0;
    if (b.paid) changeMoney(s, b.paid, `🏟️ ${b.settled === 'won' ? 'Won' : 'Refund'}: ${b.team}`);
    done.push(b);
  }
  return done;
}
