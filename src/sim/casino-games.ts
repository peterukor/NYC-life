// =====================================================================
// casino-games.ts — the second floor of the Empire Casino (Peter,
// 2026-10-28). In-game money only, like everything at the casino.
//
// ♠️ Hold'em: a cash game against the regulars, with blinds and a rake.
// 🎲 Craps: pass / don't pass, odds (true odds, up to 2×) and the field.
// 🀄 Baccarat: player, banker (5% commission) or tie (8 to 1).
// 🎡 Big Six: the money wheel (54 spots: 1, 2, 5, 10, 20, 🃏, 🗽).
// 🎟️ Scratchers: four tickets, match three amounts to win it.
// 🔢 Keno: pick 1 to 10 of 80, twenty balls drawn.
// 🔻 Plinko: twelve rows of pegs, three risk levels.
// 🃏 Video poker: Jacks or Better, 9/6 pay table.
//
// Pure rules (every random call takes `rand`, so tests can seed it).
// Money moves through sim/casino.ts → stake()/payout(); the tables are
// drawn by ui/casino-games.ts.
// =====================================================================

import { newShoe, type Card } from './casino.ts';

export type Rand = () => number;
export type { Card };

const RANK_VALUE: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
export const rankValue = (c: Card) => RANK_VALUE[c.rank];
const VALUE_NAME: Record<number, [string, string]> = {
  2: ['Two', 'Twos'], 3: ['Three', 'Threes'], 4: ['Four', 'Fours'], 5: ['Five', 'Fives'], 6: ['Six', 'Sixes'], 7: ['Seven', 'Sevens'],
  8: ['Eight', 'Eights'], 9: ['Nine', 'Nines'], 10: ['Ten', 'Tens'], 11: ['Jack', 'Jacks'], 12: ['Queen', 'Queens'], 13: ['King', 'Kings'], 14: ['Ace', 'Aces'],
};
const one = (v: number) => VALUE_NAME[v][0];
const many = (v: number) => VALUE_NAME[v][1];

/** One deck, shuffled. */
export const newDeck = (rand: Rand = Math.random) => newShoe(rand, 1);

// ============================================================ poker hands

export const HAND_CATS = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'] as const;
export type HandCat = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface HandRank {
  cat: HandCat;
  /** Tie-breaking ranks, most important first. */
  kick: number[];
  /** One number that orders hands (bigger wins). */
  score: number;
  name: string;
}

function scoreOf(cat: number, kick: number[]): number {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (kick[i] ?? 0);
  return s;
}

/** Top card of a straight in a rank bitmask (5 for the wheel A-2-3-4-5), 0 if none. */
function straightTop(mask: number): number {
  for (let top = 14; top >= 6; top--) {
    const need = 0b11111 << (top - 4);
    if ((mask & need) === need) return top;
  }
  // The wheel: A-2-3-4-5.
  const wheel = (1 << 14) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);
  return (mask & wheel) === wheel ? 5 : 0;
}

/** The best five-card poker hand from 5 to 7 cards. */
export function bestHand(cards: Card[]): HandRank {
  const count = new Array<number>(15).fill(0);
  const bySuit: Record<string, number[]> = {};
  let mask = 0;
  for (const c of cards) {
    const v = rankValue(c);
    count[v]++;
    mask |= 1 << v;
    (bySuit[c.suit] ??= []).push(v);
  }
  const flushVals = Object.values(bySuit).find((l) => l.length >= 5);
  if (flushVals) {
    let fm = 0;
    for (const v of flushVals) fm |= 1 << v;
    const top = straightTop(fm);
    if (top) return make(8, [top]);
  }
  const quads: number[] = [], trips: number[] = [], pairs: number[] = [], singles: number[] = [];
  for (let v = 14; v >= 2; v--) {
    if (count[v] === 4) quads.push(v);
    else if (count[v] === 3) trips.push(v);
    else if (count[v] === 2) pairs.push(v);
    else if (count[v] === 1) singles.push(v);
  }
  const highest = (exclude: number[], n: number) => {
    const out: number[] = [];
    for (let v = 14; v >= 2 && out.length < n; v--) if (count[v] && !exclude.includes(v)) out.push(v);
    return out;
  };
  if (quads.length) return make(7, [quads[0], ...highest([quads[0]], 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pairPart = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return make(6, [trips[0], pairPart]);
  }
  if (flushVals) return make(5, [...flushVals].sort((a, b) => b - a).slice(0, 5));
  const st = straightTop(mask);
  if (st) return make(4, [st]);
  if (trips.length) return make(3, [trips[0], ...highest([trips[0]], 2)]);
  if (pairs.length >= 2) return make(2, [pairs[0], pairs[1], ...highest([pairs[0], pairs[1]], 1)]);
  if (pairs.length) return make(1, [pairs[0], ...highest([pairs[0]], 3)]);
  return make(0, highest([], 5));
}

function make(cat: HandCat, kick: number[]): HandRank {
  return { cat, kick, score: scoreOf(cat, kick), name: handName(cat, kick) };
}

function handName(cat: HandCat, k: number[]): string {
  switch (cat) {
    case 8: return k[0] === 14 ? 'Royal flush' : `Straight flush, ${one(k[0])} high`;
    case 7: return `Four ${many(k[0])}`;
    case 6: return `Full house, ${many(k[0])} full of ${many(k[1])}`;
    case 5: return `Flush, ${one(k[0])} high`;
    case 4: return `Straight, ${one(k[0])} high`;
    case 3: return `Three ${many(k[0])}`;
    case 2: return `Two pair, ${many(k[0])} and ${many(k[1])}`;
    case 1: return `Pair of ${many(k[0])}`;
    default: return `${one(k[0])} high`;
  }
}

/** -1, 0 or 1: does hand a beat hand b? */
export const compareHands = (a: HandRank, b: HandRank) => Math.sign(a.score - b.score);

// ======================================================= ♠️ Texas Hold'em

export interface PokerStyle {
  /** 0 loose … 1 tight: how good a hand must be to play on. */
  tight: number;
  /** 0 passive … 1 aggressive: bets and raises instead of calling. */
  aggro: number;
  /** Chance to fire a bluff when a spot looks right. */
  bluff: number;
}

export interface PokerRegular { name: string; emoji: string; style: PokerStyle; line: string }

/** The regulars (all made up). */
export const POKER_REGULARS: PokerRegular[] = [
  { name: 'Sal Bagels', emoji: '🥯', style: { tight: 0.55, aggro: 0.35, bluff: 0.05 }, line: 'Been playing here since it was a laundromat.' },
  { name: 'Lucky Lorraine', emoji: '💅', style: { tight: 0.35, aggro: 0.7, bluff: 0.16 }, line: 'Honey, I raise on vibes.' },
  { name: 'Dmitri', emoji: '🧔', style: { tight: 0.8, aggro: 0.55, bluff: 0.04 }, line: 'Folds for forty minutes, then takes your whole stack.' },
  { name: 'Chad from Finance', emoji: '👔', style: { tight: 0.2, aggro: 0.85, bluff: 0.22 }, line: 'Calls it "position sizing".' },
  { name: 'Nana Rosa', emoji: '👵', style: { tight: 0.65, aggro: 0.25, bluff: 0.08 }, line: 'Sweetest lady at the table. Never believe her.' },
  { name: 'Kofi', emoji: '🎧', style: { tight: 0.5, aggro: 0.5, bluff: 0.1 }, line: 'Headphones on, reads you anyway.' },
  { name: 'Benny Knuckles', emoji: '🥊', style: { tight: 0.3, aggro: 0.45, bluff: 0.06 }, line: 'Calls everything. Everything.' },
  { name: 'Tina Wu', emoji: '🕶️', style: { tight: 0.6, aggro: 0.7, bluff: 0.12 }, line: 'Sunglasses indoors. It works.' },
];

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PokerSeat {
  name: string;
  emoji: string;
  human: boolean;
  style: PokerStyle;
  stack: number;
  hole: Card[];
  /** Put in on this street. */
  bet: number;
  /** Put in this hand. */
  totalIn: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last raise this street. */
  acted: boolean;
  /** Sitting out (busted). */
  out: boolean;
  last: string;
}

export interface PokerWin { seat: number; amount: number; hand: string | null }

export interface PokerTable {
  seats: PokerSeat[];
  button: number;
  sb: number;
  bb: number;
  deck: Card[];
  board: Card[];
  street: Street;
  /** Seat to act, -1 when nobody (hand over or running it out). */
  toAct: number;
  currentBet: number;
  /** The last full raise size (the next raise must be at least this). */
  minRaise: number;
  handOver: boolean;
  /** The house's cut of this hand. */
  rake: number;
  /** Rake taken over the session (for the stats). */
  rakeTotal: number;
  winners: PokerWin[];
  log: string[];
  hands: number;
}

/** 5% of every pot that sees a flop, at most two big blinds. */
export const RAKE = { rate: 0.05, capBB: 2 } as const;

/** Blinds for a buy-in: the big blind is 1/50 of it (always even, at least 2¢). */
export function blindsFor(buyIn: number): { sb: number; bb: number } {
  const bb = Math.max(2, Math.round(buyIn / 100) * 2);
  return { sb: bb / 2, bb };
}

export function newPokerTable(buyIn: number, npcs: number, rand: Rand = Math.random): PokerTable {
  const { sb, bb } = blindsFor(buyIn);
  const pool = [...POKER_REGULARS];
  const seats: PokerSeat[] = [seat('You', '🙂', true, { tight: 0.5, aggro: 0.5, bluff: 0 }, buyIn)];
  const n = Math.max(1, Math.min(5, npcs));
  for (let i = 0; i < n; i++) {
    const r = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    seats.push(seat(r.name, r.emoji, false, r.style, npcStack(buyIn, rand)));
  }
  return { seats, button: Math.floor(rand() * seats.length), sb, bb, deck: [], board: [], street: 'preflop', toAct: -1, currentBet: 0, minRaise: bb, handOver: true, rake: 0, rakeTotal: 0, winners: [], log: [], hands: 0 };
}

const npcStack = (buyIn: number, rand: Rand) => Math.round((buyIn * (0.7 + rand() * 0.9)) / 2) * 2;

function seat(name: string, emoji: string, human: boolean, style: PokerStyle, stack: number): PokerSeat {
  return { name, emoji, human, style, stack, hole: [], bet: 0, totalIn: 0, folded: false, allIn: false, acted: false, out: false, last: '' };
}

const live = (t: PokerTable) => t.seats.filter((s) => !s.folded && !s.out);
const canAct = (s: PokerSeat) => !s.folded && !s.out && !s.allIn;
export const potOf = (t: PokerTable) => t.seats.reduce((a, s) => a + s.totalIn, 0);

function nextSeat(t: PokerTable, from: number, ok: (s: PokerSeat) => boolean): number {
  for (let k = 1; k <= t.seats.length; k++) {
    const i = (from + k) % t.seats.length;
    if (ok(t.seats[i])) return i;
  }
  return -1;
}

/** Busted regulars leave and someone new sits down. */
function refillTable(t: PokerTable, rand: Rand): void {
  const buyIn = t.bb * 50;
  t.seats.forEach((s, i) => {
    if (s.human || s.stack > 0) return;
    const taken = new Set(t.seats.map((x) => x.name));
    const free = POKER_REGULARS.filter((r) => !taken.has(r.name));
    const r = free.length ? free[Math.floor(rand() * free.length)] : POKER_REGULARS[i % POKER_REGULARS.length];
    t.seats[i] = seat(r.name, r.emoji, false, r.style, npcStack(buyIn, rand));
    t.seats[i].last = 'Sits down';
  });
}

/** Shuffle up and deal: move the button, post the blinds, deal two each. */
export function startHand(t: PokerTable, rand: Rand = Math.random): PokerTable {
  refillTable(t, rand);
  for (const s of t.seats) Object.assign(s, { hole: [], bet: 0, totalIn: 0, folded: false, allIn: false, acted: false, out: s.stack <= 0, last: s.stack <= 0 ? 'Sitting out' : '' });
  t.deck = newDeck(rand);
  t.board = [];
  t.street = 'preflop';
  t.handOver = false;
  t.rake = 0;
  t.winners = [];
  t.log = [];
  t.hands++;
  t.button = nextSeat(t, t.button, (s) => !s.out);
  const players = t.seats.filter((s) => !s.out).length;
  // Heads-up the button posts the small blind.
  const sbSeat = players === 2 ? t.button : nextSeat(t, t.button, (s) => !s.out);
  const bbSeat = nextSeat(t, sbSeat, (s) => !s.out);
  post(t, sbSeat, t.sb, 'Small blind');
  post(t, bbSeat, t.bb, 'Big blind');
  t.currentBet = t.bb;
  t.minRaise = t.bb;
  for (let r = 0; r < 2; r++) for (const s of t.seats) if (!s.out) s.hole.push(t.deck.pop()!);
  t.toAct = nextSeat(t, bbSeat, canAct);
  settleIfDone(t);
  return t;
}

function post(t: PokerTable, i: number, amt: number, what: string): void {
  const s = t.seats[i];
  const a = Math.min(amt, s.stack);
  s.stack -= a;
  s.bet += a;
  s.totalIn += a;
  if (s.stack === 0) s.allIn = true;
  s.last = what;
}

export interface PokerOptions {
  toCall: number;
  canCheck: boolean;
  /** Smallest legal raise, as a total bet for the street (0 if no raise is possible). */
  minRaiseTo: number;
  /** All-in, as a total bet for the street. */
  maxRaiseTo: number;
}

export function pokerOptions(t: PokerTable, i = t.toAct): PokerOptions {
  const s = t.seats[i];
  const toCall = Math.max(0, Math.min(t.currentBet - s.bet, s.stack));
  const maxRaiseTo = s.bet + s.stack;
  const othersCanAct = t.seats.some((o, j) => j !== i && canAct(o));
  let minRaiseTo = t.currentBet + t.minRaise;
  if (maxRaiseTo <= t.currentBet || !othersCanAct) minRaiseTo = 0;
  else minRaiseTo = Math.min(minRaiseTo, maxRaiseTo);
  return { toCall, canCheck: toCall === 0, minRaiseTo, maxRaiseTo };
}

/** Handy raise sizes: min, half pot, pot, all-in (as totals for the street). */
export function raiseSizes(t: PokerTable, i = t.toAct): { label: string; to: number }[] {
  const o = pokerOptions(t, i);
  if (!o.minRaiseTo) return [];
  const pot = potOf(t) + o.toCall;
  const s = t.seats[i];
  const raw = [
    { label: 'Min', to: o.minRaiseTo },
    { label: '½ pot', to: t.currentBet + Math.round(pot / 2) },
    { label: 'Pot', to: t.currentBet + pot },
    { label: 'All-in', to: o.maxRaiseTo },
  ];
  const out: { label: string; to: number }[] = [];
  for (const r of raw) {
    const to = Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, r.to));
    if (out.some((x) => x.to === to)) continue;
    out.push({ label: to === o.maxRaiseTo && to !== s.bet ? 'All-in' : r.label, to });
  }
  return out;
}

export type PokerAction = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number };

/** The seat to act does something. Illegal moves are bent into the nearest legal one. */
export function pokerAct(t: PokerTable, a: PokerAction): PokerTable {
  if (t.handOver || t.toAct < 0) return t;
  const i = t.toAct;
  const s = t.seats[i];
  const o = pokerOptions(t, i);
  if (a.type === 'check' && !o.canCheck) a = { type: 'call' };
  if (a.type === 'raise' && !o.minRaiseTo) a = { type: 'call' };
  if (a.type === 'call' && o.toCall === 0) a = { type: 'check' };
  switch (a.type) {
    case 'fold':
      s.folded = true;
      s.last = 'Fold';
      break;
    case 'check':
      s.last = 'Check';
      break;
    case 'call':
      put(s, o.toCall);
      s.last = s.allIn ? 'All-in' : 'Call';
      break;
    case 'raise': {
      const to = Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, Math.round(a.to)));
      const raiseBy = to - t.currentBet;
      put(s, to - s.bet);
      // Only a full raise reopens the betting.
      if (raiseBy >= t.minRaise) {
        t.minRaise = raiseBy;
        for (const x of t.seats) if (x !== s) x.acted = false;
      }
      const wasBet = t.currentBet === 0;
      t.currentBet = Math.max(t.currentBet, to);
      s.last = s.allIn ? 'All-in' : wasBet ? 'Bet' : 'Raise';
      break;
    }
  }
  s.acted = true;
  t.log.push(`${s.name}: ${s.last}`);
  t.toAct = nextSeat(t, i, (x) => canAct(x) && (!x.acted || x.bet < t.currentBet));
  settleIfDone(t);
  return t;
}

function put(s: PokerSeat, amt: number): void {
  const a = Math.min(amt, s.stack);
  s.stack -= a;
  s.bet += a;
  s.totalIn += a;
  if (s.stack === 0) s.allIn = true;
}

function roundDone(t: PokerTable): boolean {
  const actors = t.seats.filter(canAct);
  if (actors.every((s) => s.acted && s.bet === t.currentBet)) return true;
  // One player left who can act, and they've matched (or nobody else can).
  if (actors.length === 1 && actors[0].bet >= t.currentBet && t.seats.filter((s) => !s.folded && !s.out).length > 1) return actors[0].acted || t.currentBet === actors[0].bet;
  return actors.length === 0;
}

/** Close streets, deal cards and run out the board as needed. */
function settleIfDone(t: PokerTable): void {
  for (;;) {
    if (live(t).length === 1) return awardPots(t);
    if (!roundDone(t)) return;
    // Next street.
    for (const s of t.seats) (s.bet = 0), (s.acted = false);
    t.currentBet = 0;
    t.minRaise = t.bb;
    if (t.street === 'river') return awardPots(t);
    t.deck.pop(); // burn
    if (t.street === 'preflop') (t.board.push(t.deck.pop()!, t.deck.pop()!, t.deck.pop()!), (t.street = 'flop'));
    else if (t.street === 'flop') (t.board.push(t.deck.pop()!), (t.street = 'turn'));
    else (t.board.push(t.deck.pop()!), (t.street = 'river'));
    const actors = t.seats.filter(canAct);
    if (actors.length < 2) {
      t.toAct = -1;
      continue; // everyone's all-in: run it out
    }
    t.toAct = nextSeat(t, t.button, canAct);
    return;
  }
}

/** Split the pot (and side pots) and take the rake. */
function awardPots(t: PokerTable): void {
  t.handOver = true;
  t.toAct = -1;
  const contenders = live(t);
  const pot = potOf(t);
  const sawFlop = t.board.length >= 3;
  t.rake = sawFlop ? Math.min(Math.floor(pot * RAKE.rate), RAKE.capBB * t.bb) : 0;
  t.rakeTotal += t.rake;
  const wins = new Map<number, number>();
  if (contenders.length === 1) {
    const i = t.seats.indexOf(contenders[0]);
    wins.set(i, pot - t.rake);
    t.street = t.board.length === 5 ? 'showdown' : t.street;
  } else {
    t.street = 'showdown';
    const ranks = new Map<number, HandRank>();
    t.seats.forEach((s, i) => !s.folded && !s.out && ranks.set(i, bestHand([...s.hole, ...t.board])));
    // Side pots by how much each player put in.
    const levels = [...new Set(t.seats.filter((s) => s.totalIn > 0).map((s) => s.totalIn))].sort((a, b) => a - b);
    let prev = 0;
    let rakeLeft = t.rake;
    for (const lvl of levels) {
      let amount = 0;
      for (const s of t.seats) amount += Math.max(0, Math.min(s.totalIn, lvl) - prev);
      const eligible = [...ranks.keys()].filter((i) => t.seats[i].totalIn >= lvl);
      prev = lvl;
      if (!amount) continue;
      const cut = Math.min(rakeLeft, amount);
      rakeLeft -= cut;
      amount -= cut;
      if (!eligible.length) {
        // Nobody left in contention at this level (folded money): give it to the best live hand.
        eligible.push(...ranks.keys());
      }
      const best = Math.max(...eligible.map((i) => ranks.get(i)!.score));
      const winners = eligible.filter((i) => ranks.get(i)!.score === best);
      // Odd chips go to the first winner left of the button.
      const order = winners.sort((a, b) => ((a - t.button + t.seats.length) % t.seats.length) - ((b - t.button + t.seats.length) % t.seats.length));
      const share = Math.floor(amount / order.length);
      order.forEach((i, k) => wins.set(i, (wins.get(i) ?? 0) + share + (k < amount - share * order.length ? 1 : 0)));
    }
    for (const [i, r] of ranks) if (!wins.has(i)) t.seats[i].last = r.name;
  }
  t.winners = [...wins].map(([seat, amount]) => {
    t.seats[seat].stack += amount;
    const hand = t.street === 'showdown' && contenders.length > 1 ? bestHand([...t.seats[seat].hole, ...t.board]).name : null;
    t.seats[seat].last = `Wins ${hand ?? 'the pot'}`;
    return { seat, amount, hand };
  });
  for (const s of t.seats) s.bet = 0;
}

/** Chance your hand wins against `opponents` random hands (Monte Carlo, ties split). */
export function equity(hole: Card[], board: Card[], opponents: number, rand: Rand = Math.random, samples = 120): number {
  const known = new Set([...hole, ...board].map((c) => c.rank + c.suit));
  const rest = newDeck(rand).filter((c) => !known.has(c.rank + c.suit));
  const opp = Math.max(1, Math.min(5, opponents));
  let score = 0;
  for (let n = 0; n < samples; n++) {
    // Partial shuffle of just what we need.
    const need = 5 - board.length + opp * 2;
    for (let k = 0; k < need; k++) {
      const j = k + Math.floor(rand() * (rest.length - k));
      [rest[k], rest[j]] = [rest[j], rest[k]];
    }
    const full = [...board, ...rest.slice(0, 5 - board.length)];
    const me = bestHand([...hole, ...full]).score;
    let best = 0, ties = 0, lost = false;
    for (let o = 0; o < opp; o++) {
      const off = 5 - board.length + o * 2;
      const sc = bestHand([rest[off], rest[off + 1], ...full]).score;
      if (sc > me) (lost = true);
      else if (sc === me) ties++;
      best = Math.max(best, sc);
    }
    if (!lost) score += ties ? 1 / (ties + 1) : 1;
  }
  return score / samples;
}

/** What a regular does: hand strength (vs how many are left), pot odds, position, a dash of bluff. */
export function npcDecide(t: PokerTable, i: number, rand: Rand = Math.random, samples = 90): PokerAction {
  const s = t.seats[i];
  const o = pokerOptions(t, i);
  const opponents = live(t).length - 1;
  const eq = equity(s.hole, t.board, opponents, rand, samples);
  // A "fair share" of the pot is 1/(players): judge the hand against that.
  const fair = 1 / (opponents + 1);
  const rel = eq / fair; // 1 = average, 2 = twice as good as average
  const pot = potOf(t);
  const potOdds = o.toCall / Math.max(1, pot + o.toCall);
  // Acting last (on the button or close to it) is worth a little.
  const n = t.seats.length;
  const fromButton = (i - t.button + n) % n;
  const late = fromButton === 0 || fromButton === n - 1 ? 0.12 : 0;
  const st = s.style;
  const strength = rel + late - (st.tight - 0.5) * 0.5;
  const sizeTo = (frac: number) => t.currentBet + Math.round((pot + o.toCall) * frac);
  const bluffing = rand() < st.bluff * (t.street === 'preflop' ? 0.4 : 1) * (opponents <= 2 ? 1.5 : 0.7);

  if (o.canCheck) {
    if (o.minRaiseTo && (strength > 1.6 + (1 - st.aggro) * 0.4 || eq > 0.8)) return { type: 'raise', to: sizeTo(eq > 0.85 && rand() < 0.4 ? 1 : 0.6) };
    if (o.minRaiseTo && bluffing) return { type: 'raise', to: sizeTo(0.5) };
    return { type: 'check' };
  }
  // Facing a bet.
  const big = o.toCall > s.stack * 0.5;
  if (o.minRaiseTo && (eq > 0.82 || strength > 2.1 + (1 - st.aggro) * 0.5) && !(big && eq < 0.7)) return { type: 'raise', to: sizeTo(rand() < st.aggro ? 1 : 0.6) };
  if (o.minRaiseTo && bluffing && !big && t.street !== 'river') return { type: 'raise', to: sizeTo(0.7) };
  const margin = 0.03 + (st.tight - 0.5) * 0.08 + (big ? 0.08 : 0);
  if (eq >= potOdds + margin) return { type: 'call' };
  // Cheap to see a flop with something playable.
  if (t.street === 'preflop' && o.toCall <= t.bb && strength > 0.85) return { type: 'call' };
  return { type: 'fold' };
}

// ================================================================= 🎲 craps

export type CrapsBet = 'pass' | 'dontPass' | 'passOdds' | 'dontOdds' | 'field';
export type CrapsBets = Partial<Record<CrapsBet, number>>;

export interface CrapsTable { point: number | null; bets: CrapsBets }

export const rollDice = (rand: Rand = Math.random): [number, number] => [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)];

/** Odds bets can be up to this many times the line bet. */
export const CRAPS_ODDS_MAX = 2;

/** True odds paid on a pass-line odds bet (win per $1), by point. */
export const PASS_ODDS: Record<number, number> = { 4: 2, 10: 2, 5: 1.5, 9: 1.5, 6: 1.2, 8: 1.2 };
/** Laying odds on don't pass (win per $1). */
export const DONT_ODDS: Record<number, number> = { 4: 0.5, 10: 0.5, 5: 2 / 3, 9: 2 / 3, 6: 5 / 6, 8: 5 / 6 };

export interface CrapsResult {
  /** Total returned per bet (stake included). Present only for bets that were settled. */
  returned: CrapsBets;
  /** Bets that lost. */
  lost: CrapsBet[];
  /** The point after this roll. */
  point: number | null;
  /** What happened, in a few words. */
  call: string;
}

/** Settle one roll. Returns what each settled bet pays back; the table keeps unsettled bets. */
export function crapsRoll(t: CrapsTable, dice: [number, number]): CrapsResult {
  const sum = dice[0] + dice[1];
  const returned: CrapsBets = {};
  const lost: CrapsBet[] = [];
  const b = t.bets;
  const settle = (k: CrapsBet, ret: number) => {
    const amt = b[k];
    if (!amt) return;
    // Whole cents; the house keeps the breakage (like real tables).
    if (ret > 0) returned[k] = Math.floor(amt * ret + 1e-6);
    else lost.push(k);
    delete b[k];
  };
  // The field: one roll.
  if (b.field) settle('field', sum === 12 ? 4 : sum === 2 ? 3 : [3, 4, 9, 10, 11].includes(sum) ? 2 : 0);
  let call = '';
  if (t.point === null) {
    if (sum === 7 || sum === 11) (settle('pass', 2), settle('dontPass', 0), (call = `${sum}! Front line winner`));
    else if (sum === 2 || sum === 3) (settle('pass', 0), settle('dontPass', 2), (call = `${sum}, craps`));
    else if (sum === 12) (settle('pass', 0), settle('dontPass', 1), (call = '12, craps (don’t pass pushes)'));
    else (t.point = sum), (call = `Point is ${sum}`);
  } else if (sum === t.point) {
    settle('passOdds', 1 + PASS_ODDS[t.point]);
    settle('dontOdds', 0);
    settle('pass', 2);
    settle('dontPass', 0);
    call = `${sum}! Hit the point`;
    t.point = null;
  } else if (sum === 7) {
    settle('dontOdds', 1 + DONT_ODDS[t.point]);
    settle('passOdds', 0);
    settle('pass', 0);
    settle('dontPass', 2);
    call = 'Seven out';
    t.point = null;
  } else call = `${sum}, no decision (point ${t.point})`;
  return { returned, lost, point: t.point, call };
}

/** Can this bet be placed right now? */
export function crapsCanBet(t: CrapsTable, bet: CrapsBet): string | null {
  if ((bet === 'pass' || bet === 'dontPass') && t.point !== null) return 'Line bets go down on the come-out roll';
  if (bet === 'passOdds' && (t.point === null || !t.bets.pass)) return 'Odds go behind a pass bet once there’s a point';
  if (bet === 'dontOdds' && (t.point === null || !t.bets.dontPass)) return 'Lay odds behind a don’t pass bet once there’s a point';
  return null;
}

/** The most odds you can add right now. */
export function crapsOddsRoom(t: CrapsTable, bet: 'passOdds' | 'dontOdds'): number {
  const line = bet === 'passOdds' ? t.bets.pass : t.bets.dontPass;
  return Math.max(0, (line ?? 0) * CRAPS_ODDS_MAX - (t.bets[bet] ?? 0));
}

// ============================================================== 🀄 baccarat

export const bacValue = (c: Card) => (['10', 'J', 'Q', 'K'].includes(c.rank) ? 0 : c.rank === 'A' ? 1 : Number(c.rank));
export const bacTotal = (cards: Card[]) => cards.reduce((a, c) => a + bacValue(c), 0) % 10;

/** Does the banker draw? `p3` is the value of the player's third card, or null if the player stood. */
export function bankerDraws(bankerTotal: number, p3: number | null): boolean {
  if (p3 === null) return bankerTotal <= 5;
  switch (bankerTotal) {
    case 0: case 1: case 2: return true;
    case 3: return p3 !== 8;
    case 4: return p3 >= 2 && p3 <= 7;
    case 5: return p3 >= 4 && p3 <= 7;
    case 6: return p3 === 6 || p3 === 7;
    default: return false;
  }
}

export type BacBet = 'player' | 'banker' | 'tie';

export interface BacCoup {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  natural: boolean;
  winner: BacBet;
}

/** Deal one coup from a shoe (cards are taken off the end): P, B, P, B, then the third cards. */
export function dealBaccarat(shoe: Card[]): BacCoup {
  const player = [shoe.pop()!], banker = [shoe.pop()!];
  player.push(shoe.pop()!);
  banker.push(shoe.pop()!);
  let pt = bacTotal(player), bt = bacTotal(banker);
  const natural = pt >= 8 || bt >= 8;
  if (!natural) {
    let p3: number | null = null;
    if (pt <= 5) {
      const c = shoe.pop()!;
      player.push(c);
      p3 = bacValue(c);
    }
    if (bankerDraws(bt, p3)) banker.push(shoe.pop()!);
    pt = bacTotal(player);
    bt = bacTotal(banker);
  }
  return { player, banker, playerTotal: pt, bankerTotal: bt, natural, winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie' };
}

export const newBaccaratShoe = (rand: Rand = Math.random) => newShoe(rand, 8);

/** Total returned per $1 (stake included). Player and banker push on a tie. */
export function baccaratReturn(bet: BacBet, winner: BacBet): number {
  if (bet === 'tie') return winner === 'tie' ? 9 : 0;
  if (winner === 'tie') return 1;
  if (bet !== winner) return 0;
  return bet === 'banker' ? 1.95 : 2;
}

// ============================================================ 🎡 Big Six

export type SixSym = '1' | '2' | '5' | '10' | '20' | 'joker' | 'logo';
export const SIX: { sym: SixSym; label: string; count: number; pays: number; color: string }[] = [
  { sym: '1', label: '$1', count: 24, pays: 1, color: '#f4efe1' },
  { sym: '2', label: '$2', count: 15, pays: 2, color: '#5bb5f0' },
  { sym: '5', label: '$5', count: 7, pays: 5, color: '#ff8fb8' },
  { sym: '10', label: '$10', count: 4, pays: 10, color: '#ffd23f' },
  { sym: '20', label: '$20', count: 2, pays: 20, color: '#b07cff' },
  { sym: 'joker', label: '🃏', count: 1, pays: 40, color: '#ff4d5e' },
  { sym: 'logo', label: '🗽', count: 1, pays: 40, color: '#36c46b' },
];
export const SIX_BY: Record<SixSym, (typeof SIX)[number]> = Object.fromEntries(SIX.map((x) => [x.sym, x])) as never;

/** The 54 spots around the wheel, spread out like a real one. */
export const SIX_WHEEL: SixSym[] = (() => {
  const n = 54;
  const w: (SixSym | null)[] = new Array(n).fill(null);
  const place = (sym: SixSym, at: number) => {
    let i = ((Math.round(at) % n) + n) % n;
    while (w[i]) i = (i + 1) % n;
    w[i] = sym;
  };
  place('joker', 0);
  place('logo', 27);
  for (const s of ['20', '10', '5'] as SixSym[]) {
    const c = SIX_BY[s].count;
    const off = s === '20' ? 13 : s === '10' ? 7 : 4;
    for (let k = 0; k < c; k++) place(s, off + (k * n) / c);
  }
  // Fill the rest with 1s and 2s, spreading the 2s evenly.
  const free = w.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  let acc = 0;
  for (const i of free) {
    acc += 15 / free.length;
    if (acc >= 1) (w[i] = '2'), (acc -= 1);
    else w[i] = '1';
  }
  return w as SixSym[];
})();

export const spinBigSix = (rand: Rand = Math.random) => Math.floor(rand() * SIX_WHEEL.length);

/** Total returned per $1 on `bet` if the wheel stops on `sym`. */
export const bigSixReturn = (bet: SixSym, sym: SixSym) => (bet === sym ? SIX_BY[bet].pays + 1 : 0);

/** Exact long-run return of each bet. */
export const bigSixRtp = (bet: SixSym) => (SIX_BY[bet].count * (SIX_BY[bet].pays + 1)) / SIX_WHEEL.length;

// ========================================================== 🎟️ scratchers

export interface ScratchTicket {
  id: string;
  name: string;
  emoji: string;
  price: number;
  /** Prize as a multiple of the price → chance per ticket. */
  prizes: { mult: number; p: number }[];
  /** Foil and card colours. */
  colors: [string, string];
}

const PRIZES: { mult: number; p: number }[] = [
  { mult: 1, p: 0.13 },
  { mult: 2, p: 0.075 },
  { mult: 5, p: 0.026 },
  { mult: 10, p: 0.009 },
  { mult: 25, p: 0.0028 },
  { mult: 100, p: 0.0005 },
  { mult: 500, p: 0.00008 },
];

export const SCRATCHERS: ScratchTicket[] = [
  { id: 'subway', name: 'Subway Fortune', emoji: '🚇', price: 500, prizes: PRIZES, colors: ['#00843d', '#e9f7ee'] },
  { id: 'cab', name: 'Yellow Cab Cash', emoji: '🚕', price: 2_000, prizes: PRIZES, colors: ['#e0a800', '#fff7d6'] },
  { id: 'apple', name: 'Big Apple Bucks', emoji: '🍎', price: 10_000, prizes: PRIZES, colors: ['#c1272d', '#ffe9e9'] },
  { id: 'penthouse', name: 'Penthouse Millions', emoji: '🏙️', price: 50_000, prizes: PRIZES, colors: ['#1c2340', '#e8eaf6'] },
];

export const scratchRtp = (t: ScratchTicket) => t.prizes.reduce((a, x) => a + x.mult * x.p, 0);

export interface ScratchCard {
  ticket: string;
  /** Nine amounts (cents), left to right, top to bottom. */
  cells: number[];
  /** The prize (0 if none). */
  prize: number;
  /** Which cells make the win. */
  winCells: number[];
}

/** Print a ticket: decide the prize, then lay out nine amounts (exactly three match if it wins). */
export function printScratch(t: ScratchTicket, rand: Rand = Math.random): ScratchCard {
  let x = rand();
  let mult = 0;
  for (const p of t.prizes) {
    if ((x -= p.p) < 0) {
      mult = p.mult;
      break;
    }
  }
  const values = t.prizes.map((p) => p.mult * t.price);
  const prize = mult * t.price;
  const cells: number[] = [];
  const counts = new Map<number, number>();
  if (prize) for (let k = 0; k < 3; k++) cells.push(prize), counts.set(prize, 3);
  // Losing cards love a near miss: two of the top prize.
  const decoys = values.filter((v) => v !== prize);
  if (!prize && rand() < 0.35) for (let k = 0; k < 2; k++) cells.push(values[values.length - 1 - Math.floor(rand() * 2)]);
  for (const c of cells) if (c !== prize) counts.set(c, (counts.get(c) ?? 0) + 1);
  while (cells.length < 9) {
    const v = decoys[Math.floor(rand() * decoys.length)];
    if ((counts.get(v) ?? 0) >= 2) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
    cells.push(v);
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return { ticket: t.id, cells, prize, winCells: prize ? cells.map((c, i) => (c === prize ? i : -1)).filter((i) => i >= 0) : [] };
}

/** What a laid-out card pays: the amount shown three times (or 0). */
export function scratchPrize(cells: number[]): number {
  const counts = new Map<number, number>();
  for (const c of cells) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = 0;
  for (const [v, n] of counts) if (n >= 3) best = Math.max(best, v);
  return best;
}

// ================================================================ 🔢 keno

export const KENO = { numbers: 80, drawn: 20, maxSpots: 10 } as const;

/** Paid per $1 (stake included) for catching k of n spots. */
export const KENO_PAY: Record<number, Record<number, number>> = {
  1: { 1: 3.5 },
  2: { 2: 14.5 },
  3: { 2: 2, 3: 42 },
  4: { 2: 1, 3: 5, 4: 135 },
  5: { 3: 3, 4: 15, 5: 700 },
  6: { 3: 1, 4: 6, 5: 100, 6: 2000 },
  7: { 3: 1, 4: 4, 5: 20, 6: 300, 7: 4000 },
  8: { 4: 1, 5: 14, 6: 100, 7: 1500, 8: 10000 },
  9: { 4: 1, 5: 5, 6: 45, 7: 350, 8: 3000, 9: 10000 },
  10: { 0: 3, 5: 2, 6: 22, 7: 140, 8: 1000, 9: 5000, 10: 10000 },
};

export const kenoReturn = (spots: number, catches: number) => KENO_PAY[spots]?.[catches] ?? 0;

/** Twenty different numbers from 1 to 80, in the order they're drawn. */
export function drawKeno(rand: Rand = Math.random): number[] {
  const all = Array.from({ length: KENO.numbers }, (_, i) => i + 1);
  for (let k = 0; k < KENO.drawn; k++) {
    const j = k + Math.floor(rand() * (all.length - k));
    [all[k], all[j]] = [all[j], all[k]];
  }
  return all.slice(0, KENO.drawn);
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Chance of catching exactly k when you pick n. */
export const kenoChance = (n: number, k: number) => (choose(n, k) * choose(KENO.numbers - n, KENO.drawn - k)) / choose(KENO.numbers, KENO.drawn);

/** Exact long-run return for an n-spot ticket. */
export function kenoRtp(n: number): number {
  let r = 0;
  for (let k = 0; k <= n; k++) r += kenoChance(n, k) * kenoReturn(n, k);
  return r;
}

// ============================================================== 🔻 plinko

export type PlinkoRisk = 'low' | 'medium' | 'high';
export const PLINKO_ROWS = 12;

/** Multipliers for the 13 slots, left to right (symmetric). */
export const PLINKO: Record<PlinkoRisk, number[]> = {
  low: [9, 3, 1.6, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.6, 3, 9],
  medium: [30, 10, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 10, 30],
  high: [160, 24, 8, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8, 24, 160],
};

/** The bounces: one left (0) or right (1) per row. The slot is how many went right. */
export function plinkoDrop(rand: Rand = Math.random, rows = PLINKO_ROWS): { path: (0 | 1)[]; slot: number } {
  const path: (0 | 1)[] = [];
  for (let r = 0; r < rows; r++) path.push(rand() < 0.5 ? 0 : 1);
  return { path, slot: path.reduce<number>((a, b) => a + b, 0) };
}

export const plinkoChance = (slot: number, rows = PLINKO_ROWS) => choose(rows, slot) / 2 ** rows;
export const plinkoRtp = (risk: PlinkoRisk) => PLINKO[risk].reduce((a, m, k) => a + m * plinkoChance(k), 0);

// ===================================================== 🃏 video poker (JoB)

export const VP_PAYS: { key: string; name: string; pays: number }[] = [
  { key: 'royal', name: 'Royal flush', pays: 800 },
  { key: 'sf', name: 'Straight flush', pays: 50 },
  { key: 'quads', name: 'Four of a kind', pays: 25 },
  { key: 'full', name: 'Full house', pays: 9 },
  { key: 'flush', name: 'Flush', pays: 6 },
  { key: 'straight', name: 'Straight', pays: 4 },
  { key: 'trips', name: 'Three of a kind', pays: 3 },
  { key: 'twopair', name: 'Two pair', pays: 2 },
  { key: 'jacks', name: 'Jacks or better', pays: 1 },
];

/** What a five-card hand pays (won per $1, stake not included: total returned is pays × bet). */
export function vpEvaluate(hand: Card[]): { key: string; name: string; pays: number } | null {
  const r = bestHand(hand);
  const row = (k: string) => VP_PAYS.find((p) => p.key === k)!;
  switch (r.cat) {
    case 8: return row(r.kick[0] === 14 ? 'royal' : 'sf');
    case 7: return row('quads');
    case 6: return row('full');
    case 5: return row('flush');
    case 4: return row('straight');
    case 3: return row('trips');
    case 2: return row('twopair');
    case 1: return r.kick[0] >= 11 ? row('jacks') : null;
    default: return null;
  }
}

export interface VpRound { deck: Card[]; hand: Card[]; held: boolean[]; drawn: boolean }

export function vpDeal(rand: Rand = Math.random): VpRound {
  const deck = newDeck(rand);
  return { deck, hand: deck.splice(-5), held: [false, false, false, false, false], drawn: false };
}

export function vpDraw(r: VpRound): VpRound {
  if (r.drawn) return r;
  r.hand = r.hand.map((c, i) => (r.held[i] ? c : r.deck.pop()!));
  r.drawn = true;
  return r;
}

/**
 * A simple, decent hold strategy (what the "Hint" button suggests and what
 * the simulation plays). Not perfect play: it gives up a percent or two.
 */
export function vpSuggest(hand: Card[]): boolean[] {
  const v = hand.map(rankValue);
  const keep = (pred: (i: number) => boolean) => hand.map((_, i) => pred(i));
  const made = vpEvaluate(hand);
  const counts = new Map<number, number>();
  for (const x of v) counts.set(x, (counts.get(x) ?? 0) + 1);
  if (made && ['royal', 'sf', 'quads', 'full', 'flush', 'straight'].includes(made.key)) return keep(() => true);
  // Four to a royal.
  const bySuit = new Map<string, number[]>();
  hand.forEach((c, i) => bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), i]));
  for (const idx of bySuit.values()) {
    const royal = idx.filter((i) => v[i] >= 10);
    if (royal.length === 4) return keep((i) => royal.includes(i));
  }
  if (made && (made.key === 'trips' || made.key === 'twopair')) return keep((i) => (counts.get(v[i]) ?? 0) >= 2);
  if (made) return keep((i) => counts.get(v[i]) === 2);
  // Four to a flush.
  for (const idx of bySuit.values()) if (idx.length === 4) return keep((i) => idx.includes(i));
  // Low pair.
  const pair = [...counts].find(([, n]) => n === 2);
  if (pair) return keep((i) => v[i] === pair[0]);
  // Three to a royal.
  for (const idx of bySuit.values()) {
    const royal = idx.filter((i) => v[i] >= 10);
    if (royal.length === 3) return keep((i) => royal.includes(i));
  }
  // Four to an open straight.
  const uniq = [...new Set(v)].sort((a, b) => a - b);
  for (let lo = 2; lo <= 10; lo++) {
    const run = [lo, lo + 1, lo + 2, lo + 3];
    if (run.every((x) => uniq.includes(x)) && lo + 3 < 14) {
      const used = new Set<number>();
      return keep((i) => run.includes(v[i]) && !used.has(v[i]) && !!used.add(v[i]));
    }
  }
  // High cards (up to two, preferring suited).
  const highs = hand.map((_, i) => i).filter((i) => v[i] >= 11);
  if (highs.length) {
    const sorted = highs.sort((a, b) => v[a] - v[b]).slice(0, 2);
    return keep((i) => sorted.includes(i));
  }
  return keep(() => false);
}

// =============================================================== helpers

/** A small seedable RNG (for tests and replays). */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
