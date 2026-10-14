// =====================================================================
// casino.ts — the games at the Empire Casino (Peter, 2026-10-14).
// In-game money only: there is no way to buy game money with real money.
//
// 🎰 Slots: three reels of NYC symbols. Pays back about 94% over time.
// 🃏 Blackjack: six decks, dealer stands on 17, blackjack pays 3 to 2,
//    double on your first two cards.
// 🎡 Roulette: European wheel (one green zero). Colours, odd/even,
//    halves, dozens or a single number (35 to 1).
// 🚀 Rocket: a multiplier climbs until the rocket blows up. Cash out
//    before it does. About a 3% house edge.
//
// Pure rules here (seedable for tests); the tables are ui/casino.ts.
// =====================================================================

import { changeMoney } from './economy.ts';
import type { GameState } from './types.ts';

export const BET = { min: 500, max: 500_000 } as const;

function funOf(s: GameState) {
  return (s.fun ??= { tickets: 0, best: {}, bets: [], casinoNet: 0 });
}

/** Take a bet from your cash. Null if OK, else why not. */
export function stake(s: GameState, cents: number, game: string): string | null {
  if (cents < BET.min) return `Minimum bet is $${BET.min / 100}`;
  if (cents > BET.max) return `Table limit is $${(BET.max / 100).toLocaleString('en-US')}`;
  if (s.money < cents) return 'Not enough cash on you (the cage takes cash only)';
  changeMoney(s, -cents, `🎰 ${game}`);
  funOf(s).casinoNet -= cents;
  return null;
}

/** Pay out winnings (the whole amount returned, stake included). */
export function payout(s: GameState, cents: number, game: string): void {
  if (cents <= 0) return;
  changeMoney(s, Math.round(cents), `🎰 ${game} win`);
  funOf(s).casinoNet += Math.round(cents);
}

// ------------------------------------------------------------------ 🎰 slots

export const REEL: { sym: string; weight: number; three: number; two: number }[] = [
  { sym: '🍕', weight: 7, three: 8, two: 1 },
  { sym: '🌭', weight: 6, three: 10, two: 1 },
  { sym: '🚕', weight: 5, three: 12, two: 1 },
  { sym: '🍎', weight: 4, three: 20, two: 1 },
  { sym: '🗽', weight: 3, three: 40, two: 2 },
  { sym: '💎', weight: 2, three: 80, two: 3 },
  { sym: '7️⃣', weight: 1, three: 250, two: 5 },
];
const REEL_TOTAL = REEL.reduce((a, r) => a + r.weight, 0);

export function spinReel(rand = Math.random): number {
  let x = rand() * REEL_TOTAL;
  for (let i = 0; i < REEL.length; i++) if ((x -= REEL[i].weight) < 0) return i;
  return 0;
}

/** What a spin pays as a multiple of the bet (0 = nothing). */
export function slotMultiplier(reels: number[]): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return REEL[a].three;
  const pair = a === b || a === c ? a : b === c ? b : -1;
  return pair >= 0 ? REEL[pair].two : 0;
}

/** Exact long-run payback of the slot (for tests and tuning). */
export function slotReturn(): number {
  let rtp = 0;
  for (let a = 0; a < REEL.length; a++)
    for (let b = 0; b < REEL.length; b++)
      for (let c = 0; c < REEL.length; c++) rtp += (REEL[a].weight * REEL[b].weight * REEL[c].weight) / REEL_TOTAL ** 3 * slotMultiplier([a, b, c]);
  return rtp;
}

// -------------------------------------------------------------- 🃏 blackjack

export interface Card { rank: string; suit: string }
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

export function newShoe(rand = Math.random, decks = 6): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (const rank of RANKS) shoe.push({ rank, suit });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/** Best total for a hand, and whether an ace is still counting as 11. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') (aces++, (total += 11));
    else total += ['J', 'Q', 'K'].includes(c.rank) ? 10 : Number(c.rank);
  }
  while (total > 21 && aces) (total -= 10), aces--;
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;

export type BjOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BjHand {
  shoe: Card[];
  player: Card[];
  dealer: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  outcome: BjOutcome | null;
  /** Total returned to you, stake included (0 if you lost). */
  returned: number;
}

export function dealBlackjack(bet: number, rand = Math.random): BjHand {
  const shoe = newShoe(rand);
  const h: BjHand = { shoe, player: [shoe.pop()!, shoe.pop()!], dealer: [shoe.pop()!, shoe.pop()!], bet, doubled: false, done: false, outcome: null, returned: 0 };
  if (isBlackjack(h.player) || isBlackjack(h.dealer)) finish(h);
  return h;
}

export function hit(h: BjHand): BjHand {
  if (h.done) return h;
  h.player.push(h.shoe.pop()!);
  if (handValue(h.player).total > 21) finish(h);
  return h;
}

export function stand(h: BjHand): BjHand {
  if (!h.done) finish(h);
  return h;
}

/** Double the bet, take exactly one card, then the dealer plays. The extra stake must already be paid. */
export function doubleDown(h: BjHand): BjHand {
  if (h.done || h.player.length !== 2) return h;
  h.bet *= 2;
  h.doubled = true;
  h.player.push(h.shoe.pop()!);
  finish(h);
  return h;
}

function finish(h: BjHand): void {
  h.done = true;
  const p = handValue(h.player).total;
  if (p > 21) return void ((h.outcome = 'bust'), (h.returned = 0));
  const pBj = isBlackjack(h.player), dBj = isBlackjack(h.dealer);
  if (pBj || dBj) {
    h.outcome = pBj && dBj ? 'push' : pBj ? 'blackjack' : 'lose';
    h.returned = h.outcome === 'push' ? h.bet : h.outcome === 'blackjack' ? h.bet * 2.5 : 0;
    return;
  }
  // Dealer draws to 17 (stands on all 17s).
  while (handValue(h.dealer).total < 17) h.dealer.push(h.shoe.pop()!);
  const d = handValue(h.dealer).total;
  h.outcome = d > 21 || p > d ? 'win' : p === d ? 'push' : 'lose';
  h.returned = h.outcome === 'win' ? h.bet * 2 : h.outcome === 'push' ? h.bet : 0;
}

// ---------------------------------------------------------------- 🎡 roulette

/** The European wheel's numbers in order around the wheel. */
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colourOf = (n: number): 'green' | 'red' | 'black' => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

export type RouletteBet = 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen1' | 'dozen2' | 'dozen3' | `n${number}`;

export const spinRoulette = (rand = Math.random) => Math.floor(rand() * 37);

/** Total returned per $1 bet (stake included), 0 if it lost. */
export function rouletteReturn(bet: RouletteBet, n: number): number {
  if (bet.startsWith('n')) return Number(bet.slice(1)) === n ? 36 : 0;
  if (n === 0) return 0;
  switch (bet) {
    case 'red': return REDS.has(n) ? 2 : 0;
    case 'black': return REDS.has(n) ? 0 : 2;
    case 'odd': return n % 2 ? 2 : 0;
    case 'even': return n % 2 ? 0 : 2;
    case 'low': return n <= 18 ? 2 : 0;
    case 'high': return n >= 19 ? 2 : 0;
    case 'dozen1': return n <= 12 ? 3 : 0;
    case 'dozen2': return n >= 13 && n <= 24 ? 3 : 0;
    case 'dozen3': return n >= 25 ? 3 : 0;
  }
  return 0;
}

// ------------------------------------------------------------------ 🚀 rocket

export const ROCKET_EDGE = 0.03;

/** Where this rocket blows up (1.00× = straight away). */
export function crashPoint(rand = Math.random): number {
  const u = rand();
  const m = (1 - ROCKET_EDGE) / Math.max(1e-9, 1 - u);
  return Math.min(1000, Math.max(1, Math.floor(m * 100) / 100));
}

/** The multiplier after `t` seconds of flight. */
export const rocketAt = (t: number) => Math.floor(Math.exp(0.11 * t) * 100) / 100;
/** Seconds of flight until it reaches a multiplier. */
export const rocketTime = (m: number) => Math.log(m) / 0.11;
