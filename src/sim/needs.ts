// =====================================================================
// needs.ts — hunger, energy, fun, social, hygiene, bladder, and mood.
//
// Needs slowly drain in real time. Doing things (eating, sleeping,
// hanging out) fills them back up. Mood is worked out from the needs
// plus any temporary "moodlets" (a great night out, a stolen phone…).
// =====================================================================

import { NEED_DECAY_PER_HOUR, NEED_LOW } from '../core/constants.ts';
import { clamp } from '../core/format.ts';
import { nowMs } from '../core/clock.ts';
import { NEED_KEYS, type GameState, type Moodlet, type NeedKey } from './types.ts';

export const NEED_INFO: Record<NeedKey, { label: string; emoji: string; color: string }> = {
  hunger: { label: 'Hunger', emoji: '🍕', color: '#f08a24' },
  energy: { label: 'Energy', emoji: '⚡', color: '#2f80ed' },
  fun: { label: 'Fun', emoji: '🎉', color: '#e2b007' },
  social: { label: 'Social', emoji: '💬', color: '#e0457b' },
  hygiene: { label: 'Hygiene', emoji: '🫧', color: '#14a3a3' },
  bladder: { label: 'Bladder', emoji: '🚽', color: '#8a5cf6' },
};

/**
 * Drain needs for `hours` of time passing.
 * `multiplier` lets offline time drain slower than active play.
 */
export function decayNeeds(state: GameState, hours: number, multiplier = 1): void {
  if (hours <= 0) return;
  for (const key of NEED_KEYS) {
    state.needs[key] = clamp(state.needs[key] - NEED_DECAY_PER_HOUR[key] * hours * multiplier, 0, 100);
  }
}

/** Add or remove need points, e.g. { hunger: +30, fun: -5 }. */
export function applyNeeds(state: GameState, changes: Partial<Record<NeedKey, number>>): void {
  for (const [key, delta] of Object.entries(changes) as [NeedKey, number][]) {
    state.needs[key] = clamp(state.needs[key] + delta, 0, 100);
  }
}

/** Add a temporary mood effect. Re-adding the same id refreshes it instead of stacking. */
export function addMoodlet(state: GameState, m: Omit<Moodlet, 'expiresAt'> & { minutes: number }): void {
  state.moodlets = state.moodlets.filter((x) => x.id !== m.id);
  state.moodlets.push({ id: m.id, label: m.label, emoji: m.emoji, value: m.value, expiresAt: nowMs() + m.minutes * 60_000 });
}

/** Drop moodlets that have worn off. */
export function expireMoodlets(state: GameState): void {
  const t = nowMs();
  state.moodlets = state.moodlets.filter((m) => m.expiresAt > t);
}

export interface Mood {
  /** -100 (awful) … +100 (amazing) */
  score: number;
  label: string;
  emoji: string;
  tone: 'good' | 'ok' | 'bad';
}

/**
 * Mood = average of the needs (centred around 50) + every moodlet.
 * Low needs pull extra hard, because being starving ruins a good day.
 */
export function computeMood(state: GameState): Mood {
  let total = 0;
  let lowPenalty = 0;
  for (const key of NEED_KEYS) {
    const v = state.needs[key];
    total += v;
    if (v < NEED_LOW) lowPenalty += (NEED_LOW - v) * 0.9;
  }
  const avg = total / NEED_KEYS.length;
  let score = (avg - 50) * 1.4 - lowPenalty;
  for (const m of state.moodlets) score += m.value;
  score = clamp(Math.round(score), -100, 100);

  if (score >= 55) return { score, label: 'Thriving', emoji: '🤩', tone: 'good' };
  if (score >= 25) return { score, label: 'Happy', emoji: '😄', tone: 'good' };
  if (score >= 0) return { score, label: 'Fine', emoji: '🙂', tone: 'ok' };
  if (score >= -30) return { score, label: 'Meh', emoji: '😐', tone: 'ok' };
  if (score >= -60) return { score, label: 'Stressed', emoji: '😣', tone: 'bad' };
  return { score, label: 'Miserable', emoji: '😫', tone: 'bad' };
}

/** The need that most needs attention, if any is low. Used for hints. */
export function lowestNeed(state: GameState): NeedKey | null {
  let worst: NeedKey | null = null;
  let worstVal = NEED_LOW;
  for (const key of NEED_KEYS) {
    if (state.needs[key] < worstVal) {
      worst = key;
      worstVal = state.needs[key];
    }
  }
  return worst;
}

/** Mood also changes how well you work: from 0.6x when miserable to 1.25x when thriving. */
export function moodWorkMultiplier(state: GameState): number {
  return 0.925 + computeMood(state).score / 320;
}
