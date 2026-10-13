// =====================================================================
// home-activity.ts — using things at home, over time.
//
// Sleeping, eating, showering, watching TV… An activity runs in real
// time: its needs fill in bit by bit while you do it, so stopping halfway
// keeps half of it. When it finishes you also get its other rewards
// (skill, pay, a mood). The furniture's quality scales what it gives back
// (a cheap mattress restores less energy than a nice bed) and a cheap
// piece can leave you with a small downside afterwards — a stiff back, a
// cold shower (data/furniture.ts → FURNITURE_QUALITY, quirk).
//
// The activity is part of the save (state.activity), so closing the game
// mid-nap and coming back carries on (or finishes it, if the time is up).
// =====================================================================

import { ACTIONS, type ActionDef } from '../data/actions.ts';
import { FURNITURE, FURNITURE_QUALITY, type Quality } from '../data/furniture.ts';
import { nowMs } from '../core/clock.ts';
import { finishAction, foodieBonus, startAction, type ActionOutcome } from './activity.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
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
}

/** What one go of an action gives, after the furniture's quality. */
export function scaledNeeds(s: GameState, a: ActionDef, item?: string): Partial<Record<NeedKey, number>> {
  const q: Quality = (item && FURNITURE.get(item)?.quality) || 'basic';
  const gain = FURNITURE_QUALITY[q].gain;
  const out: Partial<Record<NeedKey, number>> = {};
  for (const [k, v] of Object.entries(foodieBonus(s, a)) as [NeedKey, number][]) out[k] = v > 0 ? v * gain : v;
  return out;
}

/** Start using something. Charges the cost now (like any action). */
export function beginActivity(s: GameState, actionId: string, opts: { uid?: string; item?: string; placeId?: string | null } = {}): { ok: true; action: ActionDef } | { ok: false; why: string } {
  const r = startAction(s, actionId);
  if (!r.ok) return r;
  s.activity = { actionId, uid: opts.uid, item: opts.item, placeId: opts.placeId ?? null, startedAt: nowMs(), seconds: r.action.seconds, done: 0 };
  return r;
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
  quirk: { label: string; emoji: string; value: number } | null;
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
  let quirk: ActivityResult['quirk'] = null;
  const def = act.item ? FURNITURE.get(act.item) : undefined;
  if (def?.quirk && rand() < def.quirk.chance) {
    addMoodlet(s, def.quirk.moodlet);
    quirk = def.quirk.moodlet;
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
  return ACTIONS[act.actionId] ?? null;
}
