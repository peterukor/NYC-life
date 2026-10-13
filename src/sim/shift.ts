// =====================================================================
// shift.ts — a playable deli shift (the starter job).
//
// A shift is 4 game hours at the counter: 6 orders to build (tap the
// right ingredients before the customer gives up) and 2 choices along
// the way (cover a regular who's short? stay late?). At the end you get a
// payslip: the base wage for the 4 hours, tips for fast and correct
// orders, and anything your choices added.
//
// Getting paid twice is impossible: starting a shift saves a shift id in
// the game (state.shift). Collecting pay needs that exact id and clears
// it, so a double-tap, a second tab or a reload can't pay again. Closing
// the game mid-shift just ends it unpaid (you walked out).
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { CAREER_BY_ID } from '../data/careers.ts';
import { clamp } from '../core/format.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { completeShift, shiftBlocker } from './work.ts';
import type { GameState, NeedKey } from './types.ts';

// ------------------------------------------------------------------ menu

export interface Ingredient { id: string; emoji: string; label: string }

export const INGREDIENTS: Ingredient[] = [
  { id: 'roll', emoji: '🥖', label: 'Roll' },
  { id: 'bagel', emoji: '🥯', label: 'Bagel' },
  { id: 'hero', emoji: '🌭', label: 'Hero' },
  { id: 'beef', emoji: '🥩', label: 'Beef' },
  { id: 'bacon', emoji: '🥓', label: 'Bacon' },
  { id: 'egg', emoji: '🍳', label: 'Egg' },
  { id: 'turkey', emoji: '🦃', label: 'Turkey' },
  { id: 'cheese', emoji: '🧀', label: 'Cheese' },
  { id: 'onions', emoji: '🧅', label: 'Onions' },
  { id: 'lettuce', emoji: '🥬', label: 'Lettuce' },
  { id: 'hotSauce', emoji: '🌶️', label: 'Hot sauce' },
  { id: 'coffee', emoji: '☕', label: 'Coffee' },
  { id: 'milk', emoji: '🥛', label: 'Milk' },
  { id: 'sugar', emoji: '🍬', label: 'Sugar' },
  { id: 'juice', emoji: '🧃', label: 'Juice' },
];

interface Dish { name: string; items: string[]; extras?: [string, string][] }

/** What people order. `extras` are optional asks: [how they say it, ingredient]. */
const DISHES: Dish[] = [
  { name: 'a chopped cheese', items: ['roll', 'beef', 'cheese'], extras: [['with onions', 'onions'], ['with lettuce', 'lettuce'], ['spicy', 'hotSauce']] },
  { name: 'a bacon, egg and cheese on a roll', items: ['roll', 'bacon', 'egg', 'cheese'], extras: [['with hot sauce', 'hotSauce']] },
  { name: 'a BEC on a bagel', items: ['bagel', 'bacon', 'egg', 'cheese'] },
  { name: 'a turkey hero', items: ['hero', 'turkey', 'cheese'], extras: [['with lettuce', 'lettuce'], ['with onions', 'onions']] },
  { name: 'a coffee, light and sweet', items: ['coffee', 'milk', 'sugar'] },
  { name: 'a black coffee', items: ['coffee'] },
  { name: 'an egg and cheese on a bagel', items: ['bagel', 'egg', 'cheese'] },
];

export interface Order {
  /** What the customer says. */
  ask: string;
  /** The exact set of ingredients that makes it right. */
  items: string[];
  who: string;
}

const WHO = ['🧑🏽', '👩🏾', '👨🏻', '👵🏽', '🧑🏿‍🔧', '👮🏽‍♀️', '👷🏾', '👩🏻‍🎓'];

/** A random order, sometimes with an extra ask or a juice on the side. */
export function makeOrder(rand = Math.random): Order {
  const d = DISHES[Math.floor(rand() * DISHES.length)];
  const items = [...d.items];
  let ask = d.name;
  if (d.extras && rand() < 0.55) {
    const [say, id] = d.extras[Math.floor(rand() * d.extras.length)];
    ask += ` ${say}`;
    items.push(id);
  }
  if (!items.includes('coffee') && rand() < 0.3) {
    ask += ', and a juice';
    items.push('juice');
  }
  return { ask: `Lemme get ${ask}.`, items, who: WHO[Math.floor(rand() * WHO.length)] };
}

/** Did the tray match the order exactly (any order of taps)? */
export function orderRight(order: Order, tray: string[]): boolean {
  if (tray.length !== order.items.length) return false;
  const a = [...tray].sort().join(), b = [...order.items].sort().join();
  return a === b;
}

// --------------------------------------------------------------- choices

export interface ShiftChoice {
  id: string;
  emoji: string;
  text: string;
  options: { id: string; label: string; hint: string }[];
}

export const SHIFT_CHOICES: ShiftChoice[] = [
  {
    id: 'short', emoji: '🪙', text: 'Ms. Rosa, a regular, is 75¢ short for her coffee.',
    options: [
      { id: 'cover', label: 'Cover it yourself', hint: '−75¢ · she’ll remember (+mood)' },
      { id: 'slide', label: 'Let it slide', hint: 'The boss might notice' },
      { id: 'no', label: 'Sorry, can’t', hint: 'Nothing happens' },
    ],
  },
  {
    id: 'rush', emoji: '🏃', text: 'Lunch rush! The line is out the door.',
    options: [
      { id: 'hustle', label: 'Hustle', hint: 'Bigger tips for the rest of the shift · more tiring' },
      { id: 'steady', label: 'Keep your pace', hint: 'Nothing changes' },
    ],
  },
  {
    id: 'late', emoji: '🕐', text: 'The boss asks if you can stay 30 minutes to mop up.',
    options: [
      { id: 'stay', label: 'Stay late', hint: '+$12 overtime · more tiring' },
      { id: 'go', label: 'Head out on time', hint: 'Nothing changes' },
    ],
  },
  {
    id: 'sandwich', emoji: '🥪', text: 'Break time. There’s a spare chopped cheese in the back.',
    options: [
      { id: 'eat', label: 'Eat it', hint: '+hunger' },
      { id: 'skip', label: 'Skip it', hint: 'Nothing changes' },
    ],
  },
  {
    id: 'cover', emoji: '🤝', text: 'Your coworker Danny asks you to cover his break.',
    options: [
      { id: 'yes', label: 'Cover for him', hint: '+social · boss likes it · a bit tiring' },
      { id: 'no', label: 'Not today', hint: 'Nothing changes' },
    ],
  },
];

// ------------------------------------------------------------ the shift

export const SHIFT_ORDERS = 6;
/** Seconds a customer waits per order before giving up. */
export const ORDER_SECONDS = 16;
/** What a shift takes out of you, before choices. */
export const SHIFT_COST: Partial<Record<NeedKey, number>> = { energy: -14, hunger: -12, hygiene: -6, fun: -4 };

export interface ShiftSession {
  id: string;
  careerId: string;
  startedAt: number;
  /** The two choices this shift will offer (ids from SHIFT_CHOICES). */
  choices: string[];
}

/** One served order: right or wrong, and the fraction of the wait left (0–1). */
export interface ServedOrder { right: boolean; timeLeft: number }

export interface ShiftPlay {
  orders: ServedOrder[];
  /** choice id → option id */
  picks: Record<string, string>;
  /** Auto-pilot: skipped the counter, base wage only. */
  skipped?: boolean;
}

export interface Payslip {
  base: number;
  tips: number;
  overtime: number;
  covered: number;
  total: number;
  right: number;
  of: number;
  promoted: string | null;
  needs: Partial<Record<NeedKey, number>>;
}

/** Clock in: checks you can work, then records the shift (save after this). */
export function startDeliShift(s: GameState, rand = Math.random): { ok: true; session: ShiftSession } | { ok: false; why: string } {
  const block = shiftBlocker(s);
  if (block) return { ok: false, why: block };
  const pool = [...SHIFT_CHOICES];
  const pick = () => pool.splice(Math.floor(rand() * pool.length), 1)[0].id;
  const session: ShiftSession = { id: `sh-${nowMs()}-${Math.floor(rand() * 1e6)}`, careerId: s.job!.careerId, startedAt: nowMs(), choices: [pick(), pick()] };
  s.shift = session;
  return { ok: true, session };
}

/** Tips for one order: up to $6 for a fast, right one; nothing for a wrong one. */
export function orderTip(o: ServedOrder, hustle = false): number {
  if (!o.right) return 0;
  const base = 150 + Math.round(450 * clamp(o.timeLeft, 0, 1));
  return Math.round((hustle ? base * 1.5 : base) / 25) * 25;
}

/**
 * Clock out and get paid — once. Returns null if this shift was already
 * paid (or never started), so pressing "Collect" twice pays once.
 */
export function finishDeliShift(s: GameState, shiftId: string, play: ShiftPlay): Payslip | null {
  if (!s.shift || s.shift.id !== shiftId || !s.job) return null;
  s.shift = null; // first thing: this id can never pay again
  const picks = play.picks;
  const right = play.orders.filter((o) => o.right).length;
  const of = play.orders.length || SHIFT_ORDERS;
  // Hustle (from the rush) only boosts orders after it was chosen; we
  // apply it to the second half of the shift, where the rush sits.
  const hustle = picks.rush === 'hustle';
  const tips = play.skipped ? 0 : play.orders.reduce((sum, o, i) => sum + orderTip(o, hustle && i >= 2), 0);
  const overtime = picks.late === 'stay' ? 1_200 : 0;
  const covered = picks.short === 'cover' ? -75 : 0;

  const needs: Partial<Record<NeedKey, number>> = { ...SHIFT_COST };
  const add = (k: NeedKey, v: number) => (needs[k] = (needs[k] ?? 0) + v);
  if (hustle) add('energy', -6);
  if (overtime) add('energy', -5);
  if (picks.sandwich === 'eat') add('hunger', 30);
  if (picks.cover === 'yes') { add('social', 10); add('energy', -3); }
  applyNeeds(s, needs);
  if (picks.short === 'cover') addMoodlet(s, { id: 'kindness', label: 'Helped out Ms. Rosa', emoji: '🥹', value: 6, minutes: 120 });

  // Performance: accuracy, plus the boss noticing your choices.
  let perf = Math.round((right / of - 0.6) * 15);
  if (play.skipped) perf = -2;
  if (picks.short === 'slide' && Math.random() < 0.4) perf -= 4;
  if (picks.cover === 'yes') perf += 2;
  if (overtime) perf += 2;
  // Base wage and promotion through the shared work rules (pay multiplier 1:
  // the base wage is the ladder pay; tips and overtime are added on top).
  const r = completeShift(s, 'chill', { perf, pay: 1, needsDone: true, flat: true });
  const extra = tips + overtime + covered;
  if (extra > 0) changeMoney(s, extra, 'Tips and overtime');
  else if (extra < 0) changeMoney(s, extra, 'Covered a regular');
  s.stats.actionsDone['__shift'] = (s.stats.actionsDone['__shift'] ?? 0) + 1;
  const base = r.pay;
  return { base, tips, overtime, covered, total: base + extra, right, of, promoted: r.promoted, needs };
}

/** Closing the game mid-shift: the shift ends, unpaid. */
export function abandonShift(s: GameState): boolean {
  if (!s.shift) return false;
  s.shift = null;
  return true;
}

/** The career's base wage for a shift (for the "what you'll earn" line). */
export function baseWage(s: GameState): number {
  if (!s.job) return 0;
  const c = CAREER_BY_ID[s.job.careerId];
  return c.ladder[Math.min(s.job.level, c.ladder.length - 1)].pay;
}
