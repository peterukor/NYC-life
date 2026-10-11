// =====================================================================
// life.ts — what happens as time passes: needs drain, moods wear off,
// a new day starts at New York midnight, and weekly bills come due.
// =====================================================================

import { bus } from '../core/bus.ts';
import { daysBetween, nowMs, nycTime } from '../core/clock.ts';
import { OFFLINE_CATCHUP_MAX_HOURS, OFFLINE_DECAY_MULTIPLIER } from '../core/constants.ts';
import { money } from '../core/format.ts';
import { chargeBill } from './economy.ts';
import { decayNeeds, expireMoodlets, addMoodlet } from './needs.ts';
import { postDailyNews } from './news.ts';
import type { GameState } from './types.ts';
import { weatherFor } from './weather.ts';
import { checkBlues, runAuto } from './auto.ts';

/**
 * Advance the simulation to "now". Call it every frame (cheap) or after
 * loading a save (which may cover hours of time away).
 * Returns a short summary when catching up after a long absence.
 */
export function advanceTo(state: GameState, now = nowMs()): string | null {
  const elapsedMs = Math.max(0, now - state.lastTick);
  state.lastTick = now;

  const hours = elapsedMs / 3_600_000;
  let summary: string | null = null;

  // Note: even when no time has passed we still fall through to rollDays(),
  // so a save from yesterday always gets its new day, rent and loan handled.
  if (hours > 0.25) {
    // Long absence: drain slower (you were "asleep") and cap the total.
    const capped = Math.min(hours, OFFLINE_CATCHUP_MAX_HOURS);
    decayNeeds(state, capped, OFFLINE_DECAY_MULTIPLIER);
    const h = Math.round(hours);
    summary = h >= 1 ? `You were away ${h} hour${h === 1 ? '' : 's'}. Life went on without you.` : null;
    // Auto mode: your routine ran while you were gone.
    const auto = runAuto(state, hours);
    if (auto) summary = summary ? `${summary} ${auto}` : auto;
  } else {
    const t = nycTime(now);
    decayNeeds(state, hours, 1, weatherFor(t.dateKey, t.hour));
  }

  expireMoodlets(state);
  if (checkBlues(state, now)) summary = `${summary ? `${summary} ` : ''}🌧️ Too long on autopilot: you feel stuck in a rut. Get out and do different things for a couple of days.`;
  const dayNote = rollDays(state);
  if (dayNote) summary = summary ? `${summary} ${dayNote}` : dayNote;
  return summary;
}

/** Handle every New York midnight that has passed since the last check. */
function rollDays(state: GameState): string | null {
  const today = nycTime().dateKey;
  if (state.stats.dayKey === today) return null;

  const notes: string[] = [];
  state.stats.dayKey = today;
  state.stats.earnedToday = 0;
  if (state.job) {
    state.job.shiftsToday = 0;
    state.job.dayKey = today;
  }
  postDailyNews(state, today);

  // ----- Rent: every 7 days from the move-in day -----
  if (state.home.weeklyRent > 0) {
    let weeks = Math.floor(daysBetween(state.home.rentDueDay, today) / 7);
    while (weeks-- > 0) {
      const { short } = chargeBill(state, state.home.weeklyRent, 'Weekly rent');
      advanceKey(state.home, 'rentDueDay', 7);
      if (short > 0) {
        notes.push(`Rent was ${money(short)} short. Your landlord is not amused.`);
        addMoodlet(state, { id: 'rentStress', label: 'Behind on rent', emoji: '🏚️', value: -20, minutes: 60 * 24 });
      } else notes.push(`Paid ${money(state.home.weeklyRent)} rent.`);
    }
  }

  // ----- Hustler's student loan -----
  if (state.loan && state.loan.owed > 0) {
    let weeks = Math.floor(daysBetween(state.loan.lastPaidDay, today) / 7);
    while (weeks-- > 0 && state.loan.owed > 0) {
      const due = Math.min(state.loan.weekly, state.loan.owed);
      const { paid } = chargeBill(state, due, 'Student loan payment');
      state.loan.owed -= paid;
      advanceKey(state.loan, 'lastPaidDay', 7);
      if (paid < due) notes.push('Missed part of a loan payment.');
    }
    if (state.loan.owed <= 0) {
      state.loan = null;
      notes.push('Student loan paid off! 🎓');
      addMoodlet(state, { id: 'debtFree', label: 'Debt free!', emoji: '🎓', value: 25, minutes: 60 * 24 });
    }
  }

  bus.emit('ui:refresh', {});
  return notes.length ? notes.join(' ') : null;
}

/** Move a "YYYY-MM-DD" date key forward by n days. */
function advanceKey<T extends Record<K, string>, K extends string>(obj: T, key: K, days: number): void {
  const k = obj[key];
  const d = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + days));
  (obj as Record<K, string>)[key] = d.toISOString().slice(0, 10);
}
