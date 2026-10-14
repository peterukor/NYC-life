// =====================================================================
// debt.ts — bills you couldn't pay, collections, and bankruptcy.
//
// Players never die in NYC Life. The worst that happens is a stay in the
// hospital, and hospitals send bills. If cash + bank can't cover a bill,
// whatever is left over goes to COLLECTIONS (state.debt). From then on:
//
//   • every new game day, collections grab up to DEBT.dailyGrab of what
//     you owe from your cash, then your bank (so debt slowly pays itself
//     off if you keep earning), plus a little interest if you can't pay;
//   • you can pay it off yourself any time (Phone → Bank);
//   • or you can FILE FOR BANKRUPTCY: the debt is wiped, but so is almost
//     everything else — cash, bank, stocks, businesses, your lease — and
//     you start again in the city shelter with $20 and the clothes on
//     your back. Your skills, friends, rep and clothes stay (they're you).
//
// TO TUNE: change the numbers in DEBT. Nothing else needs editing.
// =====================================================================

import { nycTime } from '../core/clock.ts';
import { PLACE_BY_ID } from '../data/places.ts';
import { chargeBill, changeMoney } from './economy.ts';
import { newBusinessState } from './business.ts';
import { addMoodlet } from './needs.ts';
import { postNews } from './news.ts';
import type { GameState } from './types.ts';

export const DEBT = {
  /** Share of what you owe that collections try to take each game day. */
  dailyGrab: 0.15,
  /** Interest added each day you can't pay anything (0.01 = 1%). */
  dailyInterest: 0.01,
  /** Cash you walk out of bankruptcy court with (cents). */
  freshStartCash: 2_000,
  /** The home you're sent to (a place id in data/places.ts). */
  shelterId: 'shelter',
  /** Days you must wait between bankruptcies (stops it being a free reset button). */
  cooldownDays: 30,
};

export interface DebtState {
  owed: number;
  /** Game day the debt started (YYYY-MM-DD). */
  since: string;
}

/** Put an unpaid amount into collections. */
export function addDebt(s: GameState, cents: number): void {
  if (cents <= 0) return;
  if (s.debt) s.debt.owed += cents;
  else s.debt = { owed: cents, since: nycTime().dateKey };
}

/** Called once per new game day from life.ts. Returns a note for the morning summary. */
export function runCollections(s: GameState): string | null {
  if (!s.debt || s.debt.owed <= 0) return null;
  const want = Math.max(100, Math.round(s.debt.owed * DEBT.dailyGrab));
  const { paid } = chargeBill(s, Math.min(want, s.debt.owed), 'Collections agency');
  s.debt.owed -= paid;
  if (s.debt.owed <= 0) {
    s.debt = null;
    return 'Your debt is fully paid off. The collectors finally stop calling. 🎉';
  }
  if (paid === 0) {
    s.debt.owed = Math.round(s.debt.owed * (1 + DEBT.dailyInterest));
    addMoodlet(s, { id: 'debtStress', label: 'Debt collectors calling', emoji: '📞', value: -15, minutes: 60 * 24 });
    return `Collections couldn't take anything today. You now owe ${(s.debt.owed / 100).toFixed(0)} dollars.`;
  }
  return null;
}

/** Pay off as much debt as you can right now (cash, then bank). */
export function payDebt(s: GameState): number {
  if (!s.debt) return 0;
  const { paid } = chargeBill(s, s.debt.owed, 'Paid off debt');
  s.debt.owed -= paid;
  if (s.debt.owed <= 0) s.debt = null;
  return paid;
}

/** Why you can't file right now, or null if you can. */
export function bankruptcyBlocker(s: GameState): string | null {
  if (!s.debt || s.debt.owed <= 0) return 'You have no debt to wipe.';
  const last = s.record?.lastBankruptcy;
  if (last) {
    const days = (Date.parse(nycTime().dateKey) - Date.parse(last)) / 86_400_000;
    if (days < DEBT.cooldownDays) return `You filed recently. Wait ${Math.ceil(DEBT.cooldownDays - days)} more days.`;
  }
  return null;
}

/**
 * File for bankruptcy: wipe the debt and almost everything you own,
 * then start again in the shelter. Returns an error message or null.
 */
export function fileBankruptcy(s: GameState): string | null {
  const why = bankruptcyBlocker(s);
  if (why) return why;
  const shelter = PLACE_BY_ID[DEBT.shelterId];
  if (!shelter) return 'The shelter is missing from the map.';

  // Seize everything. Cash goes through economy.ts so it's in the ledger.
  if (s.money > 0) changeMoney(s, -s.money, 'Seized in bankruptcy');
  s.bank = 0;
  s.portfolio = {};
  s.business = newBusinessState();
  s.loan = null;
  s.debt = null;
  if (s.garage) s.garage.cars = [];
  if (s.garage) s.garage.driving = null;
  changeMoney(s, DEBT.freshStartCash, 'Fresh start');

  const today = nycTime().dateKey;
  s.home = { area: shelter.area, placeId: shelter.id, weeklyRent: 0, rentDueDay: today };
  s.record = { ...(s.record ?? { bankruptcies: 0 }), bankruptcies: (s.record?.bankruptcies ?? 0) + 1, lastBankruptcy: today };
  addMoodlet(s, { id: 'freshStart', label: 'Starting over', emoji: '🌱', value: -10, minutes: 60 * 48 });
  postNews(s, { scope: 'city', emoji: '⚖️', headline: 'You filed for bankruptcy', body: 'Debt wiped. Everything else too. You have a bunk at the shelter and $20. Up from here.', personal: true });
  return null;
}
