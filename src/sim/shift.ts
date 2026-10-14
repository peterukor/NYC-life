// =====================================================================
// shift.ts — hands-on shifts for every job (Peter, 2026-10-14).
//
// Two ways to work a shift (up to 6 shifts per game day):
//  ⏩ Auto: 30 real seconds, and you have to stay in the game. Pays the
//     lowest wage (about $30 at the first rung). Never raises performance.
//  🎮 Play: about 6 real minutes at the counter (the clock in the corner
//     runs through the 4 game hours). Build each order from the job's
//     items before the customer gives up; 3 choices come up along the
//     way. Pays the base plus tips and overtime, up to about $90, and
//     adds 🔥 street or 💼 corporate rep depending on the job (🚓 cops
//     get both: bad cops more street, good cops more corporate).
// Pay differs by job (data/careers.ts → shift): tip jobs start lower with
// more upside; skilled jobs start higher. Raises scale both numbers.
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
import { MORE_MENUS } from '../data/shift-menus.ts';
import { addRep } from './rep.ts';
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
  /** What the extra money is called on the payslip (Tips, Bonus, Commission…). */
  tipWord?: string;
  /** 🍸 The bar: people order from tables and a waiter carries each drink over. */
  runner?: { emoji: string; names: string[]; tables: number; glass: Record<string, string>; defaultGlass: string };
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
  // Peter: bartenders stay behind the bar; a waiter takes the drinks to the tables.
  runner: { emoji: '🤵', names: ['Marco', 'Keisha', 'Tony', 'Priya'], tables: 12, glass: { beer: '🍺', wine: '🍷', whiskey: '🥃', tequila: '🥃' }, defaultGlass: '🍸' },
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
export const COUNTER_MENUS: Record<string, CounterMenu> = { deli: DELI, bartender: BAR, ...MORE_MENUS };
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
  /** 🍸 The table it goes to (menus with a runner). */
  table?: number;
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
  const table = menu.runner ? 1 + Math.floor(rand() * menu.runner.tables) : undefined;
  return { ask: `${menu.ask} ${ask}${/^can\b/i.test(menu.ask) ? '?' : '.'}`, items, who: menu.who[Math.floor(rand() * menu.who.length)], table };
}

/** Did the tray match the order exactly (any order of taps)? */
export function orderRight(order: Order, tray: string[]): boolean {
  if (tray.length !== order.items.length) return false;
  const a = [...tray].sort().join(), b = [...order.items].sort().join();
  return a === b;
}

// ------------------------------------------------------------ the shift

/** Orders in a reference shift (tests, and the old fixed-length shift). */
export const SHIFT_ORDERS = 6;
/** Seconds a customer waits per order: 16 at the start, down to 10 at the end of the rush. */
export const ORDER_SECONDS = 16;
export const ORDER_SECONDS_END = 10;
/** A played shift lasts this long in real seconds (Peter: 5–7 minutes). */
export const SHIFT_PLAY_SECONDS = 360;
/** Choices per shift (at a quarter, half and three quarters of the way). */
export const SHIFT_CHOICES_PER = 3;
/** Pay at the first rung when a career doesn't set its own (cents): auto, and the most a played shift can pay. */
export const SHIFT_PAY = { auto: 3_000, max: 9_000 } as const;
/** An auto shift takes this long in real seconds (you have to stay in the game). */
export const AUTO_SHIFT_SECONDS = 30;
/** Tips and overtime were designed for $250 of room; scale them to the job's room. */
const DESIGN_ROOM = 25_000;

/** How much the tips and overtime are scaled for this pay band. */
export function tipScale(band: { auto: number; max: number }): number {
  return (band.max - band.auto) / DESIGN_ROOM;
}
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
  /** choice id → orders served when it was picked (a tips boost applies after that). */
  choiceAt?: Record<string, number>;
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
  /** Hit the most a shift can pay. */
  capped: boolean;
  /** The night's twist changed the pay (fight, light tippers…): the multiplier. */
  mult: number;
  /** Rep a played shift earned (data/careers.ts → shift.rep). Empty for auto. */
  rep: { kind: 'street' | 'corporate'; points: number; rankUp: string | null }[];
}

/**
 * What a shift pays at your rung: `auto` (the lowest) and `max` (a great
 * played shift). Set per job (data/careers.ts → shift); raises scale both
 * by the career's ladder.
 */
export function payBand(s: GameState, level = s.job?.level ?? 0): { auto: number; max: number } {
  return careerBand(s.job?.careerId ?? '', level);
}

/** The pay band for any career and rung (job listings, raise offers). */
export function careerBand(careerId: string, level = 0): { auto: number; max: number } {
  const c = CAREER_BY_ID[careerId];
  const f = c ? c.ladder[Math.min(level, c.ladder.length - 1)].pay / c.ladder[0].pay : 1;
  const base = c?.shift ?? SHIFT_PAY;
  return { auto: Math.round((base.auto * f) / 100) * 100, max: Math.round((base.max * f) / 100) * 100 };
}

/** Clock in: checks you can work, then records the shift (save after this). */
export function startDeliShift(s: GameState, rand = Math.random): { ok: true; session: ShiftSession } | { ok: false; why: string } {
  const block = shiftBlocker(s);
  if (block) return { ok: false, why: block };
  const pool = [...menuFor(s.job!.careerId).choices];
  const pick = () => pool.splice(Math.floor(rand() * pool.length), 1)[0].id;
  const choices = Array.from({ length: Math.min(SHIFT_CHOICES_PER, pool.length) }, pick);
  const session: ShiftSession = { id: `sh-${nowMs()}-${Math.floor(rand() * 1e6)}`, careerId: s.job!.careerId, startedAt: nowMs(), choices };
  s.shift = session;
  return { ok: true, session };
}

/** Tips for one order at the first rung: $2 to $7 for a right one (faster is more); nothing for a wrong one. */
export function orderTip(o: ServedOrder, hustle = false): number {
  if (!o.right) return 0;
  const base = 200 + Math.round(500 * clamp(o.timeLeft, 0, 1));
  return Math.round((hustle ? base * 1.5 : base) / 25) * 25;
}

/**
 * Clock out and get paid — once. Returns null if this shift was already
 * paid (or never started), so pressing "Collect" twice pays once.
 * `mult` is the night's twist (sim/job-perks.ts): a lost fight, light
 * tippers, or 0 when you got busted.
 */
export function finishDeliShift(s: GameState, shiftId: string, play: ShiftPlay, rand = Math.random, mult = 1): Payslip | null {
  if (!s.shift || s.shift.id !== shiftId || !s.job) return null;
  const session = s.shift;
  s.shift = null; // first thing: this id can never pay again
  const picks = play.picks;
  const menu = menuFor(session.careerId);
  const band = payBand(s);
  const scale = tipScale(band);
  const right = play.orders.filter((o) => o.right).length;
  const of = play.orders.length;
  // What the choices did (menu data: ChoiceFx).
  const needs: Partial<Record<NeedKey, number>> = { ...SHIFT_COST };
  const add = (k: NeedKey, v: number) => (needs[k] = (needs[k] ?? 0) + v);
  // Auto-pilot: you showed up and did the minimum (no change). Played: how many you got right.
  let perf = play.skipped ? 0 : of ? Math.round((right / of - 0.6) * 15) : -2;
  let overtime = 0, covered = 0;
  // A tips boost from a choice applies to the orders after it.
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
    if (fx.tipsAfter) tipsAfter = { from: play.choiceAt?.[c.id] ?? (session.choices.indexOf(c.id) === 1 ? 4 : 2), mult: fx.tipsAfter };
    if (fx.moodlet) addMoodlet(s, fx.moodlet);
  });
  // Bartending: the late crowd tips half again as much (10 PM–4 AM).
  const h = nycTime().hour;
  const late = menu.careerId === 'bartender' && (h >= 22 || h < 4) ? 1.5 : 1;
  const ta = tipsAfter as { from: number; mult: number } | null;
  let tips = play.skipped ? 0 : play.orders.reduce((sum, o, i) => sum + orderTip(o) * (ta && i >= ta.from ? ta.mult : 1), 0) * late * scale;
  overtime = play.skipped ? 0 : overtime * scale;
  covered = Math.round(covered * scale);
  // A played shift pays at most band.max: the base plus tips and overtime.
  const room = band.max - band.auto;
  const capped = tips + overtime >= room;
  overtime = Math.min(overtime, room);
  tips = Math.min(tips, room - overtime);
  // The night's twist.
  const base = Math.round((band.auto * mult) / 25) * 25;
  tips = Math.round((tips * mult) / 25) * 25;
  overtime = Math.round(overtime / 25) * 25;
  applyNeeds(s, needs);
  // Performance, skill and the shift count through the shared work rules.
  completeShift(s, 'chill', { perf, needsDone: true, payCents: base });
  const extra = tips + overtime + covered;
  if (extra > 0) changeMoney(s, extra, 'Tips and overtime');
  else if (extra < 0) changeMoney(s, extra, 'Out of your pocket');
  s.stats.actionsDone['__shift'] = (s.stats.actionsDone['__shift'] ?? 0) + 1;
  // 🔥/💼 Rep for a played shift: the job's most for getting every order right (needs a real shift: 5+ orders).
  const rep: Payslip['rep'] = [];
  if (!play.skipped && of >= 5 && mult > 0) {
    // 🚓 Cops earn both: taking envelopes (exposure) leans street, staying clean leans corporate.
    const dirty = session.careerId === 'cop' && (s.exposure ?? 0) > 0;
    for (const d of CAREER_BY_ID[session.careerId]?.shift?.rep ?? []) {
      const lean = session.careerId === 'cop' && (d.kind === 'street') === dirty ? 1 : 0;
      const points = Math.round((d.max + lean) * (right / of));
      if (points > 0) rep.push({ kind: d.kind, points, rankUp: addRep(s, d.kind, points) });
    }
  }
  return { base, tips, overtime, covered, total: base + extra, right, of, promoted: null, needs, capped, mult, rep };
}

/** Closing the game mid-shift: the shift ends, unpaid. */
export function abandonShift(s: GameState): boolean {
  if (!s.shift) return false;
  s.shift = null;
  return true;
}

/** The base wage for a shift (what auto-pilot pays). */
export function baseWage(s: GameState): number {
  return s.job ? payBand(s).auto : 0;
}
