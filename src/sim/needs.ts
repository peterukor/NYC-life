// =====================================================================
// needs.ts — hunger, energy, fun, social, hygiene, bladder, and mood.
//
// Needs slowly drain in real time. Doing things (eating, sleeping,
// hanging out) fills them back up. Mood is worked out from the needs
// plus any temporary "moodlets" (a great night out, a stolen phone…).
// =====================================================================

import { NEED_DECAY_PER_HOUR, NEED_LOW } from '../core/constants.ts';
import { weatherNeedMultiplier, type Weather } from './weather.ts';
import { clamp } from '../core/format.ts';
import { nowMs } from '../core/clock.ts';
import { NEED_KEYS, type GameState, type Moodlet, type NeedKey } from './types.ts';

/** Need colours are New York subway line colours (each need is a "line bullet" in the HUD). */
export const NEED_INFO: Record<NeedKey, { label: string; emoji: string; color: string }> = {
  hunger: { label: 'Hunger', emoji: '🍕', color: '#ff6319' },
  energy: { label: 'Energy', emoji: '⚡', color: '#0039a6' },
  fun: { label: 'Fun', emoji: '🎉', color: '#fccc0a' },
  social: { label: 'Social', emoji: '💬', color: '#ee352e' },
  hygiene: { label: 'Hygiene', emoji: '🫧', color: '#00933c' },
  bladder: { label: 'Bladder', emoji: '🚽', color: '#b933ad' },
};

/**
 * Drain needs for `hours` of time passing.
 * `multiplier` lets offline time drain slower than active play.
 */
export function decayNeeds(state: GameState, hours: number, multiplier = 1, weather?: Weather): void {
  if (hours <= 0) return;
  for (const key of NEED_KEYS) {
    // Weather can speed up or slow down a need (heat makes you sweaty…).
    const w = weather ? weatherNeedMultiplier(weather, key) : 1;
    state.needs[key] = clamp(state.needs[key] - NEED_DECAY_PER_HOUR[key] * hours * multiplier * w, 0, 100);
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
