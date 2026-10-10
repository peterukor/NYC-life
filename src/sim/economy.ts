// =====================================================================
// economy.ts — the ONLY place in the game allowed to change money.
//
// Why so strict? Lagos Life let players' phones decide their own
// balances, and hackers gave themselves trillions. Funnelling every
// change through one function means:
//   1. every change is checked (no NaN, no huge jumps, no going below zero),
//   2. every change is written to a ledger with a reason, and
//   3. when we add the server, we swap this file's insides for
//      "ask the server" and nothing else in the game has to change.
// =====================================================================

import { bus } from '../core/bus.ts';
import { LEDGER_KEEP, MAX_SINGLE_TRANSACTION } from '../core/constants.ts';
import { nowMs } from '../core/clock.ts';
import type { GameState } from './types.ts';

export type MoneyResult = { ok: true } | { ok: false; why: string };

/**
 * Add (positive) or take away (negative) cash.
 * Spending more than you have is refused rather than going negative.
 */
export function changeMoney(state: GameState, deltaCents: number, reason: string): MoneyResult {
  if (!Number.isFinite(deltaCents) || !Number.isInteger(deltaCents)) {
    console.warn('[economy] refused non-integer amount', deltaCents, reason);
    return { ok: false, why: 'Invalid amount' };
  }
  if (Math.abs(deltaCents) > MAX_SINGLE_TRANSACTION) {
    console.warn('[economy] refused oversized amount', deltaCents, reason);
    return { ok: false, why: 'Amount too large' };
  }
  if (deltaCents === 0) return { ok: true };
  if (state.money + deltaCents < 0) return { ok: false, why: 'Not enough cash' };

  state.money += deltaCents;
  if (deltaCents > 0) state.stats.earnedToday += deltaCents;
  state.ledger.unshift({ at: nowMs(), delta: deltaCents, balance: state.money, reason });
  if (state.ledger.length > LEDGER_KEEP) state.ledger.length = LEDGER_KEEP;
  bus.emit('money:changed', { balance: state.money, delta: deltaCents, reason });
  return { ok: true };
}

/** Can the player pay this much right now? */
export function canAfford(state: GameState, cents: number): boolean {
  return state.money >= cents;
}

/** Move cash into the bank, where robbers and scammers can't reach it. */
export function deposit(state: GameState, cents: number): MoneyResult {
  if (cents <= 0 || !Number.isInteger(cents)) return { ok: false, why: 'Invalid amount' };
  const r = changeMoney(state, -cents, 'Bank deposit');
  if (r.ok) state.bank += cents;
  return r;
}

/** Take cash out of the bank. */
export function withdraw(state: GameState, cents: number): MoneyResult {
  if (cents <= 0 || !Number.isInteger(cents)) return { ok: false, why: 'Invalid amount' };
  if (state.bank < cents) return { ok: false, why: 'Not enough in the bank' };
  state.bank -= cents;
  return changeMoney(state, cents, 'Bank withdrawal');
}

/**
 * Charge a bill that MUST be paid (rent, loan). If cash is short, the bank
 * pays the rest; if both are short, we take what we can and report the gap.
 */
export function chargeBill(state: GameState, cents: number, reason: string): { paid: number; short: number } {
  const fromCash = Math.min(state.money, cents);
  if (fromCash > 0) changeMoney(state, -fromCash, reason);
  let remaining = cents - fromCash;
  const fromBank = Math.min(state.bank, remaining);
  if (fromBank > 0) {
    state.bank -= fromBank;
    state.ledger.unshift({ at: nowMs(), delta: -fromBank, balance: state.money, reason: `${reason} (from bank)` });
    remaining -= fromBank;
  }
  return { paid: cents - remaining, short: remaining };
}
