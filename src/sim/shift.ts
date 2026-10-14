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

import { nowMs, nycTime } from '../core/clock.ts';
import { CAREER_BY_ID } from '../data/careers.ts';
import { clamp } from '../core/format.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { completeShift, shiftBlocker } from './work.ts';
import type { GameState, NeedKey } from './types.ts';

// ------------------------------------------------------------------ menus
//
// Each hands-on counter job has a menu: what you can grab, what people
// order, who orders, and what can come up mid-shift (Peter, 2026-10-14:
// "make the other jobs' shifts hands-on like the bodega's", bar first).

export interface Ingredient { id: string; emoji: string; label: string }

interface Dish { name: string; items: string[]; extras?: [string, string][] }

/** What a choice option does to the shift. All optional. */
export interface ChoiceFx {
  needs?: Partial<Record<NeedKey, number>>;
  perf?: number;
  /** A chance the boss notices (or it backfires): perf added only then. */
  risk?: { chance: number; perf?: number; money?: number };
  /** Money now: + overtime / tips, − out of your pocket (cents). */
  money?: number;
  /** Tips on the orders after this choice are multiplied. */
  tipsAfter?: number;
  moodlet?: { id: string; label: string; emoji: string; value: number; minutes: number };
}

export interface ShiftChoice {
  id: string;
  emoji: string;
  text: string;
  options: { id: string; label: string; hint: string; fx?: ChoiceFx }[];
}

export interface CounterMenu {
  careerId: string;
  emoji: string;
  /** "Clock in" button and the serve button. */
  clockIn: string;
  serve: string;
  trayHint: string;
  /** How people start an order ("Lemme get"). */
  ask: string;
  ingredients: Ingredient[];
  dishes: Dish[];
  /** Sometimes something on the side: [chance, how they say it, ingredient]. */
  side?: [number, string, string];
  who: string[];
  choices: ShiftChoice[];
}

const DELI: CounterMenu = {
  careerId: 'deli',
  emoji: '🥪',
  clockIn: 'Work the counter yourself',
  serve: 'Serve ✓',
  trayHint: 'Tap ingredients to build the order',
  ask: 'Lemme get',
  ingredients: [
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
  ],
  dishes: [
    { name: 'a chopped cheese', items: ['roll', 'beef', 'cheese'], extras: [['with onions', 'onions'], ['with lettuce', 'lettuce'], ['spicy', 'hotSauce']] },
    { name: 'a bacon, egg and cheese on a roll', items: ['roll', 'bacon', 'egg', 'cheese'], extras: [['with hot sauce', 'hotSauce']] },
    { name: 'a BEC on a bagel', items: ['bagel', 'bacon', 'egg', 'cheese'] },
    { name: 'a turkey hero', items: ['hero', 'turkey', 'cheese'], extras: [['with lettuce', 'lettuce'], ['with onions', 'onions']] },
    { name: 'a coffee, light and sweet', items: ['coffee', 'milk', 'sugar'] },
    { name: 'a black coffee', items: ['coffee'] },
    { name: 'an egg and cheese on a bagel', items: ['bagel', 'egg', 'cheese'] },
  ],
  side: [0.3, ', and a juice', 'juice'],
  who: ['🧑🏽', '👩🏾', '👨🏻', '👵🏽', '🧑🏿‍🔧', '👮🏽‍♀️', '👷🏾', '👩🏻‍🎓'],
  choices: [
    {
      id: 'short', emoji: '🪙', text: 'Ms. Rosa, a regular, is 75¢ short for her coffee.',
      options: [
        { id: 'cover', label: 'Cover it yourself', hint: '−75¢ · she’ll remember (+mood)', fx: { money: -75, moodlet: { id: 'kindness', label: 'Helped out Ms. Rosa', emoji: '🥹', value: 6, minutes: 120 } } },
        { id: 'slide', label: 'Let it slide', hint: 'The boss might notice', fx: { risk: { chance: 0.4, perf: -4 } } },
        { id: 'no', label: 'Sorry, can’t', hint: 'Nothing happens' },
      ],
    },
    {
      id: 'rush', emoji: '🏃', text: 'Lunch rush! The line is out the door.',
      options: [
        { id: 'hustle', label: 'Hustle', hint: 'Bigger tips for the rest of the shift · more tiring', fx: { tipsAfter: 1.5, needs: { energy: -6 } } },
        { id: 'steady', label: 'Keep your pace', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'late', emoji: '🕐', text: 'The boss asks if you can stay 30 minutes to mop up.',
      options: [
        { id: 'stay', label: 'Stay late', hint: '+$12 overtime · more tiring', fx: { money: 1_200, needs: { energy: -5 }, perf: 2 } },
        { id: 'go', label: 'Head out on time', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'sandwich', emoji: '🥪', text: 'Break time. There’s a spare chopped cheese in the back.',
      options: [
        { id: 'eat', label: 'Eat it', hint: '+hunger', fx: { needs: { hunger: 30 } } },
        { id: 'skip', label: 'Skip it', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'cover', emoji: '🤝', text: 'Your coworker Danny asks you to cover his break.',
      options: [
        { id: 'yes', label: 'Cover for him', hint: '+social · boss likes it · a bit tiring', fx: { needs: { social: 10, energy: -3 }, perf: 2 } },
        { id: 'no', label: 'Not today', hint: 'Nothing changes' },
      ],
    },
  ],
};

const BAR: CounterMenu = {
  careerId: 'bartender',
  emoji: '🍸',
  clockIn: 'Work the bar yourself',
  serve: 'Pour ✓',
  trayHint: 'Tap bottles and mixers to make the drink',
  ask: 'Can I get',
  ingredients: [
    { id: 'beer', emoji: '🍺', label: 'Beer' },
    { id: 'wine', emoji: '🍷', label: 'Red wine' },
    { id: 'whiskey', emoji: '🥃', label: 'Whiskey' },
    { id: 'vodka', emoji: '🍶', label: 'Vodka' },
    { id: 'gin', emoji: '🍸', label: 'Gin' },
    { id: 'rum', emoji: '🏴‍☠️', label: 'Rum' },
    { id: 'tequila', emoji: '🌵', label: 'Tequila' },
    { id: 'tonic', emoji: '🫧', label: 'Tonic' },
    { id: 'soda', emoji: '💧', label: 'Soda' },
    { id: 'cola', emoji: '🥤', label: 'Cola' },
    { id: 'ice', emoji: '🧊', label: 'Ice' },
    { id: 'lime', emoji: '🍋', label: 'Lime' },
    { id: 'mint', emoji: '🌿', label: 'Mint' },
    { id: 'sugar', emoji: '🍬', label: 'Sugar' },
    { id: 'olive', emoji: '🫒', label: 'Olive' },
  ],
  dishes: [
    { name: 'a pint', items: ['beer'] },
    { name: 'a glass of red', items: ['wine'] },
    { name: 'a whiskey on the rocks', items: ['whiskey', 'ice'] },
    { name: 'a gin and tonic', items: ['gin', 'tonic', 'ice'], extras: [['with a lime', 'lime']] },
    { name: 'a vodka soda', items: ['vodka', 'soda', 'ice'], extras: [['with a lime', 'lime']] },
    { name: 'a rum and coke', items: ['rum', 'cola', 'ice'], extras: [['with a lime', 'lime']] },
    { name: 'a margarita', items: ['tequila', 'lime', 'sugar', 'ice'] },
    { name: 'a mojito', items: ['rum', 'mint', 'lime', 'sugar', 'soda'] },
    { name: 'a dirty martini', items: ['gin', 'olive'] },
    { name: 'a shot of tequila', items: ['tequila'], extras: [['with lime', 'lime']] },
  ],
  side: [0.2, ', and a beer back', 'beer'],
  who: ['🧔🏻', '👩🏽‍🦱', '🧑🏾‍💼', '👱🏻‍♀️', '🧑🏻‍🎤', '👩🏿', '🕺🏽', '💃🏻'],
  choices: [
    {
      id: 'tab', emoji: '💳', text: 'A regular wants to start a tab. He left his card at home.',
      options: [
        { id: 'trust', label: 'Trust him', hint: 'Usually fine · he might never pay', fx: { moodlet: { id: 'trust', label: 'Looked out for a regular', emoji: '🤝', value: 3, minutes: 90 }, risk: { chance: 0.35, money: -1_500 } } },
        { id: 'cash', label: 'Cash only tonight', hint: 'Nothing happens' },
      ],
    },
    {
      id: 'rush', emoji: '🍻', text: 'Happy hour rush. Three deep at the bar.',
      options: [
        { id: 'hustle', label: 'Pour faster', hint: 'Bigger tips for the rest of the shift · more tiring', fx: { tipsAfter: 1.5, needs: { energy: -6 } } },
        { id: 'steady', label: 'Keep your pace', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'cutoff', emoji: '🥴', text: 'A guy has had way too many and wants another.',
      options: [
        { id: 'cut', label: 'Cut him off', hint: 'The boss likes it · he might get loud', fx: { perf: 3, risk: { chance: 0.4, perf: 0 }, needs: { fun: -3 } } },
        { id: 'pour', label: 'Pour one more', hint: '+$5 tip · the boss might notice', fx: { money: 500, risk: { chance: 0.35, perf: -5 } } },
      ],
    },
    {
      id: 'shot', emoji: '🥃', text: 'The regulars buy you a shot.',
      options: [
        { id: 'take', label: 'Take it', hint: '+fun · a little sloppier after', fx: { needs: { fun: 10, energy: -3 }, risk: { chance: 0.3, perf: -2 } } },
        { id: 'pass', label: 'Pass, you’re working', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'close', emoji: '🧹', text: 'The manager asks you to stay and close.',
      options: [
        { id: 'stay', label: 'Close up', hint: '+$15 overtime · more tiring', fx: { money: 1_500, needs: { energy: -5 }, perf: 2 } },
        { id: 'go', label: 'Head home', hint: 'Nothing changes' },
      ],
    },
  ],
};

/** Hands-on counter menus by career. */
export const COUNTER_MENUS: Record<string, CounterMenu> = { deli: DELI, bartender: BAR };
export const menuFor = (careerId: string): CounterMenu => COUNTER_MENUS[careerId] ?? DELI;

/** The deli menu's lists (kept for older code and tests). */
export const INGREDIENTS = DELI.ingredients;
export const SHIFT_CHOICES = DELI.choices;

export interface Order {
  /** What the customer says. */
  ask: string;
  /** The exact set of ingredients that makes it right. */
  items: string[];
  who: string;
}

/** A random order, sometimes with an extra ask or something on the side. */
export function makeOrder(rand = Math.random, menu: CounterMenu = DELI): Order {
  const d = menu.dishes[Math.floor(rand() * menu.dishes.length)];
  const items = [...d.items];
  let ask = d.name;
  if (d.extras && rand() < 0.55) {
    const [say, id] = d.extras[Math.floor(rand() * d.extras.length)];
    ask += ` ${say}`;
    items.push(id);
  }
  if (menu.side && !items.includes(menu.side[2]) && !items.includes('coffee') && rand() < menu.side[0]) {
    ask += menu.side[1];
    items.push(menu.side[2]);
  }
  // "Can I get…" is a question; "Lemme get…" isn't.
  return { ask: `${menu.ask} ${ask}${/^can\b/i.test(menu.ask) ? '?' : '.'}`, items, who: menu.who[Math.floor(rand() * menu.who.length)] };
}

/** Did the tray match the order exactly (any order of taps)? */
export function orderRight(order: Order, tray: string[]): boolean {
  if (tray.length !== order.items.length) return false;
  const a = [...tray].sort().join(), b = [...order.items].sort().join();
  return a === b;
}

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
  /** The two choices this shift will offer (ids from the menu's choices). */
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
  const pool = [...menuFor(s.job!.careerId).choices];
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
export function finishDeliShift(s: GameState, shiftId: string, play: ShiftPlay, rand = Math.random): Payslip | null {
  if (!s.shift || s.shift.id !== shiftId || !s.job) return null;
  const session = s.shift;
  s.shift = null; // first thing: this id can never pay again
  const picks = play.picks;
  const menu = menuFor(session.careerId);
  const right = play.orders.filter((o) => o.right).length;
  const of = play.orders.length || SHIFT_ORDERS;
  // What the choices did (menu data: ChoiceFx).
  const needs: Partial<Record<NeedKey, number>> = { ...SHIFT_COST };
  const add = (k: NeedKey, v: number) => (needs[k] = (needs[k] ?? 0) + v);
  let perf = Math.round((right / of - 0.6) * 15);
  if (play.skipped) perf = -2;
  let overtime = 0, covered = 0;
  // Tips multiplier from a choice applies to the orders after it (the 2nd choice
  // comes after order 4, the 1st after order 2).
  let tipsAfter: { from: number; mult: number } | null = null;
  menu.choices.forEach((c) => {
    const pick = picks[c.id];
    const fx = c.options.find((o) => o.id === pick)?.fx;
    if (!fx) return;
    for (const [k, v] of Object.entries(fx.needs ?? {}) as [NeedKey, number][]) add(k, v);
    perf += fx.perf ?? 0;
    if (fx.money) fx.money > 0 ? (overtime += fx.money) : (covered += fx.money);
    if (fx.risk && rand() < fx.risk.chance) {
      perf += fx.risk.perf ?? 0;
      if (fx.risk.money) covered += fx.risk.money;
    }
    if (fx.tipsAfter) tipsAfter = { from: session.choices.indexOf(c.id) === 1 ? 4 : 2, mult: fx.tipsAfter };
    if (fx.moodlet) addMoodlet(s, fx.moodlet);
  });
  // Bartending: the late crowd tips half again as much (10 PM–4 AM).
  const h = nycTime().hour;
  const late = menu.careerId === 'bartender' && (h >= 22 || h < 4) ? 1.5 : 1;
  const ta = tipsAfter as { from: number; mult: number } | null;
  const tips = play.skipped ? 0 : Math.round(play.orders.reduce((sum, o, i) => sum + orderTip(o) * (ta && i >= ta.from ? ta.mult : 1), 0) * late / 25) * 25;
  applyNeeds(s, needs);
  // Base wage and promotion through the shared work rules (pay multiplier 1:
  // the base wage is the ladder pay; tips and overtime are added on top).
  const r = completeShift(s, 'chill', { perf, pay: 1, needsDone: true, flat: true });
  const extra = tips + overtime + covered;
  if (extra > 0) changeMoney(s, extra, 'Tips and overtime');
  else if (extra < 0) changeMoney(s, extra, 'Out of your pocket');
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
