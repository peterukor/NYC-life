// =====================================================================
// business.ts — owning businesses, hiring staff, taxes and audits.
//
// EACH GAME DAY (handled in life.ts → rollDays):
//   revenue = type.revenue × staff quality × market mood × a little luck
//   profit  = revenue − upkeep − wages
//   tax     = TAX.rate of profit (heavy, like the real thing)
// Understaffed businesses limp along. Staff quality is the average skill
// of your hires (1–10): smart hires cost more and earn more.
//
// "CREATIVE ACCOUNTING" (tax fraud) is a choice with consequences: you
// report only part of your profit and pay less tax, but each day there's
// a chance of an AUDIT. Get audited and you're cooked: back taxes ×3 and
// a heavy mood hit (jail time joins when the jail system exists).
// All numbers are in TAX / HIRING below.
// =====================================================================

import { money } from '../core/format.ts';
import { Rng } from '../core/rng.ts';
import { BUSINESS_TYPES } from '../data/businesses.ts';
import { changeMoney, withdraw } from './economy.ts';
import { marketDay, marketMood } from './market.ts';
import { addMoodlet } from './needs.ts';
import { postNews } from './news.ts';
import type { GameState } from './types.ts';

export const TAX = {
  /** Share of daily profit taken as tax. */
  rate: 0.32,
  /** With creative accounting, you only report this share of profit. */
  fraudReports: 0.25,
  /** Daily audit chance while cooking the books. */
  auditChance: 0.035,
  /** Back taxes are multiplied by this when caught. */
  penalty: 3,
} as const;

export const HIRING = {
  /** Candidates on the job board each game day. */
  candidates: 4,
  /** Daily wage = base + perSkill × skill (cents). */
  base: 6_000,
  perSkill: 4_500,
} as const;

export interface Staff {
  name: string;
  skill: number;
  wage: number;
}

export interface OwnedBusiness {
  uid: string;
  type: string;
  name: string;
  staff: Staff[];
  /** Last day's result, for the report. */
  last?: { revenue: number; profit: number; tax: number; day: string };
}

export interface BusinessState {
  owned: OwnedBusiness[];
  /** Creative accounting (tax fraud) switched on. */
  fraud: boolean;
  /** Tax you dodged while cooking the books (what an audit claws back). */
  dodged: number;
}

export const newBusinessState = (): BusinessState => ({ owned: [], fraud: false, dodged: 0 });

const FIRST = ['Maria', 'Jamal', 'Wei', 'Priya', 'Luis', 'Aisha', 'Tom', 'Keisha', 'Dmitri', 'Sofia', 'Kwame', 'Hana', 'Diego', 'Nora', 'Malik', 'Yuki'];
const LAST = ['Rivera', 'Chen', 'Okafor', 'Shapiro', 'Patel', 'Kim', 'Johnson', 'Haddad', 'Novak', 'García', 'Brown', 'Mensah'];

/** Today's job board (same for everyone on the same game day). */
export function candidates(dateKey: string): Staff[] {
  const r = new Rng(`hire-${dateKey}`);
  return Array.from({ length: HIRING.candidates }, () => {
    const skill = Math.max(1, Math.min(10, Math.round(r.range(1, 10.4))));
    return { name: `${r.pick(FIRST)} ${r.pick(LAST)}`, skill, wage: HIRING.base + HIRING.perSkill * skill };
  });
}

export function buyBusiness(s: GameState, typeId: string): string | null {
  const t = BUSINESS_TYPES.get(typeId);
  if (!t) return 'Unknown business.';
  if (s.money + s.bank < t.price) return `You need ${money(t.price)} (cash + bank).`;
  // Pay from the bank first, then cash.
  const fromBank = Math.min(s.bank, Math.max(0, t.price - s.money));
  if (fromBank > 0) withdraw(s, fromBank);
  const r = changeMoney(s, -t.price, `Bought a ${t.name}`);
  if (!r.ok) return r.why;
  s.business.owned.push({ uid: `b${Date.now().toString(36)}`, type: t.id, name: `${s.profile.name}’s ${t.name}`, staff: [] });
  return null;
}

export function hire(s: GameState, uid: string, who: Staff): string | null {
  const b = s.business.owned.find((x) => x.uid === uid);
  const t = b && BUSINESS_TYPES.get(b.type);
  if (!b || !t) return 'No such business.';
  if (b.staff.length >= t.staff) return 'Fully staffed.';
  if (b.staff.some((x) => x.name === who.name)) return 'Already works there.';
  b.staff.push({ ...who });
  return null;
}

export function fire(s: GameState, uid: string, name: string): void {
  const b = s.business.owned.find((x) => x.uid === uid);
  if (b) b.staff = b.staff.filter((x) => x.name !== name);
}

/** What all your businesses are worth (for net worth): 80% of purchase price. */
export function businessValue(s: GameState): number {
  return s.business.owned.reduce((sum, b) => sum + Math.round((BUSINESS_TYPES.get(b.type)?.price ?? 0) * 0.8), 0);
}

/** Run one game day for every business. Returns a short note (or null). */
export function runBusinessDay(s: GameState, dateKey: string): string | null {
  if (!s.business.owned.length) return null;
  const r = new Rng(`biz-${dateKey}-${s.createdAt}`);
  const mood = 1 + marketMood(marketDay(dateKey)) * 120; // booms and busts swing sales ±15%
  let totalProfit = 0;
  let totalTax = 0;
  for (const b of s.business.owned) {
    const t = BUSINESS_TYPES.get(b.type);
    if (!t) continue;
    const staffed = Math.min(1, b.staff.length / t.staff);
    const quality = b.staff.length ? b.staff.reduce((a, x) => a + x.skill, 0) / b.staff.length : 0;
    const wages = b.staff.reduce((a, x) => a + x.wage, 0);
    // No staff: you're barely open. Great staff: up to ~1.5× the average.
    const revenue = Math.round(t.revenue * (0.25 + 0.75 * staffed) * (0.6 + quality / 11) * mood * r.range(0.85, 1.15));
    const profit = revenue - t.upkeep - wages;
    const reported = s.business.fraud ? profit * TAX.fraudReports : profit;
    const tax = profit > 0 ? Math.round(reported * TAX.rate) : 0;
    if (s.business.fraud && profit > 0) s.business.dodged += Math.round(profit * TAX.rate) - tax;
    b.last = { revenue, profit, tax, day: dateKey };
    totalProfit += profit;
    totalTax += tax;
  }
  const net = totalProfit - totalTax;
  if (net > 0) changeMoney(s, net, 'Business income (after tax)');
  else if (net < 0) {
    const pay = Math.min(-net, s.money);
    if (pay > 0) changeMoney(s, -pay, 'Business losses');
  }
  let note = `🏪 Your businesses ${net >= 0 ? 'made' : 'lost'} ${money(Math.abs(net))} yesterday (tax ${money(totalTax)}).`;
  // The audit.
  if (s.business.fraud && s.business.dodged > 0 && r.next() < TAX.auditChance) {
    const bill = s.business.dodged * TAX.penalty;
    const paid = Math.min(bill, s.money + s.bank);
    const fromBank = Math.min(s.bank, Math.max(0, paid - s.money));
    if (fromBank > 0) withdraw(s, fromBank);
    if (paid > 0) changeMoney(s, -paid, 'IRS audit: back taxes and penalties');
    s.business.dodged = 0;
    s.business.fraud = false;
    addMoodlet(s, { id: 'audited', label: 'Audited. Cooked.', emoji: '🧾', value: -30, minutes: 60 * 48 });
    postNews(s, { scope: 'city', emoji: '🧾', headline: `${s.profile.name}'s businesses hit with a tax fraud penalty`, personal: true });
    note += ` 🧾 AUDIT! You owed ${money(bill)} in back taxes and penalties.`;
  }
  return note;
}
