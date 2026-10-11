// =====================================================================
// jail.ts — getting arrested, bail, lawyers, and doing your time.
//
// HOW IT WORKS
//   • Something calls arrest(s, …): a crime that went wrong, driving on
//     a suspended licence, a gang fight the cops broke up…
//   • You're in a cell until `jail.until` (REAL time, so a 12-game-hour
//     sentence is about 1h40m of real time with the default clock).
//   • While inside you can:
//       – Post bail (pay `bail`, walk out now),
//       – Call a lawyer (pay a fee, coin-flip-ish chance to halve the time,
//         better odds with Charisma),
//       – Do jail things: work out, read, or "network" (crime rep — and
//         the chance of a fight).
//   • Your permanent record counts arrests. Repeat offenders get longer
//     sentences and higher bail.
//
// TO TUNE: change JAIL below. To add a jail activity, add to JAIL_ACTIVITIES.
// =====================================================================

import { gameMinutesToRealMs, nowMs } from '../core/clock.ts';
import { chargeBill } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { postNews } from './news.ts';
import type { GameState, NeedKey } from './types.ts';

export const JAIL = {
  /** Each previous arrest makes the next sentence this much longer (0.25 = +25%). */
  repeatPenalty: 0.25,
  /** Lawyer fee as a share of bail. */
  lawyerFee: 0.35,
  /** Base chance a lawyer gets your time halved (Charisma adds 4% per level). */
  lawyerOdds: 0.45,
};

export interface JailState {
  /** Real ms when you walk free. */
  until: number;
  reason: string;
  /** Cents to walk out now. */
  bail: number;
  /** Already tried a lawyer this stay. */
  lawyered?: boolean;
}

export interface JailActivity {
  id: string;
  label: string;
  emoji: string;
  needs: Partial<Record<NeedKey, number>>;
  /** Runs after the needs change; returns a line for the toast. */
  run: (s: GameState) => string;
}

export const JAIL_ACTIVITIES: JailActivity[] = [
  {
    id: 'pushups', label: 'Work out in the yard', emoji: '💪', needs: { energy: -15, fun: 5, hygiene: -10 },
    run: (s) => { s.skills.fitness = Math.min(10, s.skills.fitness + 0.15); return 'You did 200 push-ups. Respect.'; },
  },
  {
    id: 'read', label: 'Read in the library', emoji: '📚', needs: { fun: 5, energy: -5 },
    run: (s) => { s.skills.streetSmarts = Math.min(10, s.skills.streetSmarts + 0.15); return 'You read a law book. Interesting.'; },
  },
  {
    id: 'network', label: 'Make connections', emoji: '🤝', needs: { social: 15, energy: -5 },
    run: (s) => {
      if (Math.random() < 0.2) {
        applyNeeds(s, { energy: -20, fun: -15 });
        addMoodlet(s, { id: 'jailFight', label: 'Got jumped in the yard', emoji: '🤕', value: -15, minutes: 60 * 12 });
        return 'Wrong person to talk to. You got jumped. 🤕';
      }
      s.paths.rep.crime = (s.paths.rep.crime ?? 0) + 6;
      return 'You met someone who knows someone. +6 street rep.';
    },
  },
  { id: 'sleep', label: 'Sleep on the bunk', emoji: '🛏️', needs: { energy: 30, fun: -5 }, run: () => 'Not the best sleep of your life.' },
  { id: 'eat', label: 'Eat jail food', emoji: '🥣', needs: { hunger: 35, fun: -5 }, run: () => 'Grey. Edible. Barely.' },
];

export function inJail(s: GameState): boolean {
  if (!s.jail) return false;
  if (nowMs() >= s.jail.until) {
    s.jail = null;
    return false;
  }
  return true;
}

/** Real ms left inside (0 if free). */
export function jailLeftMs(s: GameState): number {
  return s.jail ? Math.max(0, s.jail.until - nowMs()) : 0;
}

/**
 * Lock the player up.
 * @param gameHours sentence length in GAME hours (before the repeat-offender penalty)
 * @param bail cents to walk out
 */
export function arrest(s: GameState, reason: string, gameHours: number, bail: number): string {
  s.record.arrests = (s.record.arrests ?? 0) + 1;
  const mult = 1 + JAIL.repeatPenalty * (s.record.arrests - 1);
  const hours = Math.round(gameHours * mult);
  const bailNow = Math.round((bail * mult) / 100) * 100;
  const until = nowMs() + gameMinutesToRealMs(hours * 60);
  s.jail = { until: Math.max(until, s.jail?.until ?? 0), reason, bail: bailNow };
  s.record.jailDays = (s.record.jailDays ?? 0) + hours / 24;
  if (s.garage) s.garage.driving = null;
  addMoodlet(s, { id: 'jailed', label: 'Locked up', emoji: '🔒', value: -25, minutes: hours * 60 });
  if (s.record.arrests >= 3) postNews(s, { scope: s.location.area, emoji: '🚔', headline: `Repeat offender ${s.profile.name} back in a cell`, personal: true });
  return `🚔 Arrested: ${reason}. ${hours} hours inside, or bail.`;
}

export function postBail(s: GameState): string | null {
  if (!s.jail) return 'You are not in jail.';
  if (s.money + s.bank < s.jail.bail) return 'Not enough money for bail.';
  chargeBill(s, s.jail.bail, 'Bail');
  s.jail = null;
  return null;
}

export function lawyerFee(s: GameState): number {
  return s.jail ? Math.round((s.jail.bail * JAIL.lawyerFee) / 100) * 100 : 0;
}

/** Hire a lawyer once per stay. Returns the outcome text. */
export function callLawyer(s: GameState): string {
  if (!s.jail) return 'You are free.';
  if (s.jail.lawyered) return 'You already used your call.';
  const fee = lawyerFee(s);
  if (s.money + s.bank < fee) return 'You can’t afford a lawyer.';
  chargeBill(s, fee, 'Lawyer');
  s.jail.lawyered = true;
  const odds = JAIL.lawyerOdds + (s.skills.charisma ?? 0) * 0.04;
  if (Math.random() < odds) {
    const left = s.jail.until - nowMs();
    s.jail.until = nowMs() + left / 2;
    s.jail.bail = Math.round(s.jail.bail / 2 / 100) * 100;
    return '⚖️ Your lawyer found a loophole. Time and bail halved!';
  }
  return '⚖️ Your lawyer shrugged. Nothing changed.';
}

export function doJailActivity(s: GameState, id: string): string {
  const a = JAIL_ACTIVITIES.find((x) => x.id === id);
  if (!a || !inJail(s)) return '';
  applyNeeds(s, a.needs);
  return a.run(s);
}
