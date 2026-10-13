// =====================================================================
// home-activity.ts — using things at home, over time.
//
// Sleeping, eating, showering, watching TV… An activity runs in real
// time: its needs fill in bit by bit while you do it, so stopping halfway
// keeps half of it. When it finishes you also get its other rewards
// (skill, pay, a mood). The furniture's quality scales what it gives back
// and how fast (a cheap mattress rests you slower than a nice bed). A few
// cheap pieces have an occasional small discomfort — a stiff back, the hot
// water running out (data/furniture.ts → FURNITURE_QUALITY, quirk).
// Cooking can go a little wrong too, less often the better you cook.
//
// The activity is part of the save (state.activity), so closing the game
// mid-nap and coming back carries on (or finishes it, if the time is up).
// =====================================================================

import { ACTIONS, type ActionDef } from '../data/actions.ts';
import { FURNITURE, FURNITURE_QUALITY, type Quality } from '../data/furniture.ts';
import { nowMs } from '../core/clock.ts';
import { finishAction, foodieBonus, startAction, type ActionOutcome } from './activity.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { BATHROOM_WAIT, bathroomTaken, nightNoise } from './home-conditions.ts';
import { mealOfAction } from '../data/groceries.ts';
import { returnIngredients, storePortions, takeIngredients, takePortion } from './kitchen.ts';
import type { GameState, NeedKey } from './types.ts';

export interface Activity {
  actionId: string;
  /** The piece of furniture you're using (its uid in the home), if any. */
  uid?: string;
  /** The furniture's item id (for its quality and quirk). */
  item?: string;
  /** Where (a place id), so a reload only resumes it there. */
  placeId?: string | null;
  startedAt: number;
  seconds: number;
  /** How much of the needs has been given so far (0–1). */
  done: number;
  /** Shared bathroom: the roommate who was in there first (you waited a moment). */
  waitedFor?: string;
  /** Cooking: the ingredients taken from the fridge (given back if you stop early). */
  took?: Record<string, number>;
}

/** What one go of an action gives, after the furniture's quality. */
export function scaledNeeds(s: GameState, a: ActionDef, item?: string): Partial<Record<NeedKey, number>> {
  const q: Quality = (item && FURNITURE.get(item)?.quality) || 'basic';
  const gain = FURNITURE_QUALITY[q].gain;
  const out: Partial<Record<NeedKey, number>> = {};
  for (const [k, v] of Object.entries(foodieBonus(s, a)) as [NeedKey, number][]) out[k] = v > 0 ? v * gain : v;
  return out;
}

/** How long one go takes on a piece (cheap is slower, nice is quicker). */
export function activitySeconds(a: ActionDef, item?: string): number {
  const q: Quality = (item && FURNITURE.get(item)?.quality) || 'basic';
  return Math.round((a.seconds / FURNITURE_QUALITY[q].speed) * 10) / 10;
}

/** Start using something. Charges the cost now (like any action). */
export function beginActivity(
  s: GameState,
  actionId: string,
  opts: { uid?: string; item?: string; placeId?: string | null; rand?: () => number } = {},
): { ok: true; action: ActionDef; waitedFor?: string } | { ok: false; why: string } {
  // Home cooking: check the fridge before anything is charged or started.
  const food = mealOfAction(actionId);
  if (food?.kind === 'cook' && !takeIngredients(s, food.meal.id, true)) return { ok: false, why: 'You’re missing ingredients' };
  if (food?.kind === 'eat' && !(s.kitchen?.leftovers[food.meal.id] ?? 0)) return { ok: false, why: 'None left in the fridge' };
  const r = startAction(s, actionId);
  if (!r.ok) return r;
  // Cooking takes the ingredients now; eating takes the portion now.
  const took = food?.kind === 'cook' ? takeIngredients(s, food.meal.id) ?? undefined : undefined;
  if (food?.kind === 'eat') takePortion(s, food.meal.id);
  // A shared bathroom is sometimes taken: it takes a few seconds longer.
  const waitedFor = bathroomTaken(opts.placeId, r.action, opts.rand) ?? undefined;
  const seconds = activitySeconds(r.action, opts.item) + (waitedFor ? BATHROOM_WAIT : 0);
  s.activity = { actionId, uid: opts.uid, item: opts.item, placeId: opts.placeId ?? null, startedAt: nowMs(), seconds, done: 0, waitedFor, took };
  return { ...r, waitedFor };
}

/** How far along it is (0–1) at a moment. */
export function activityProgress(act: Activity, now = nowMs()): number {
  return Math.min(1, Math.max(0, (now - act.startedAt) / (act.seconds * 1000)));
}

/** Give the needs earned since last time. Returns the progress (0–1). */
export function tickActivity(s: GameState, now = nowMs()): number {
  const act = s.activity;
  if (!act) return 0;
  const a = ACTIONS[act.actionId];
  if (!a) {
    s.activity = null;
    return 0;
  }
  const f = activityProgress(act, now);
  const step = f - act.done;
  if (step > 0) {
    const n = scaledNeeds(s, a, act.item);
    const part: Partial<Record<NeedKey, number>> = {};
    for (const [k, v] of Object.entries(n) as [NeedKey, number][]) part[k] = v * step;
    applyNeeds(s, part);
    act.done = f;
  }
  return f;
}

export interface ActivityResult extends ActionOutcome {
  action: ActionDef;
  /** A downside from cheap furniture, or a treat from luxury (shown as a toast). */
  quirk: { id: string; label: string; emoji: string; value: number } | null;
}

/** Finish: the rest of the needs, then the action's other rewards and any quirk. */
export function completeActivity(s: GameState, rand = Math.random): ActivityResult | null {
  const act = s.activity;
  if (!act) return null;
  const a = ACTIONS[act.actionId];
  tickActivity(s, act.startedAt + act.seconds * 1000);
  s.activity = null;
  if (!a) return null;
  const out = finishAction(s, a, { needsDone: true });
  // A cooked meal: every portion goes in the fridge (eat one now, or later).
  const food = mealOfAction(a.id);
  if (food?.kind === 'cook' && act.took) storePortions(s, food.meal.id, food.meal.portions);
  // (For the first-upgrade goal: a full rest on something better than cheap.)
  const q = act.item ? FURNITURE.get(act.item)?.quality : undefined;
  if (a.tags.includes('rest') && q && q !== 'cheap') s.stats.actionsDone['__betterSleep'] = (s.stats.actionsDone['__betterSleep'] ?? 0) + 1;
  let quirk: ActivityResult['quirk'] = null;
  const def = act.item ? FURNITURE.get(act.item) : undefined;
  if (def?.quirk && rand() < def.quirk.chance) {
    addMoodlet(s, def.quirk.moodlet);
    quirk = def.quirk.moodlet;
  } else if ((quirk = nightNoise(s, act.placeId, a, rand))) {
    // Street noise at night (the studio): woke you once.
  } else if (a.tags.includes('cook') && rand() < burnChance(s, def?.quality)) {
    // Cooking can go a little wrong, less often as you get better at it.
    const m = { id: 'smokeAlarm', label: 'Burnt it a little and set off the smoke alarm', emoji: '🚨', value: -3, minutes: 30 };
    addMoodlet(s, m);
    quirk = m;
  } else if (def?.quality && FURNITURE_QUALITY[def.quality].treat) {
    const t = FURNITURE_QUALITY[def.quality].treat!;
    addMoodlet(s, t);
    quirk = t;
  }
  return { ...out, action: a, quirk };
}

/** Stop early: you keep the needs so far, nothing else (and the cost isn't refunded). */
export function stopActivity(s: GameState): ActionDef | null {
  const act = s.activity;
  if (!act) return null;
  tickActivity(s);
  s.activity = null;
  // Stopped cooking before it was done: the ingredients go back in the fridge.
  if (act.took) returnIngredients(s, act.took);
  return ACTIONS[act.actionId] ?? null;
}

/**
 * Chance cooking goes a little wrong: less the better you cook, and half
 * as likely on a nice or luxury stove.
 */
export function burnChance(s: GameState, quality?: Quality): number {
  const base = Math.max(0.03, 0.18 - 0.04 * Math.floor(s.skills.cooking));
  return quality === 'nice' || quality === 'luxury' ? base / 2 : base;
}
