// =====================================================================
// activity.ts — doing things: eating, sleeping, partying, gigs.
//
// Starting an action checks it's allowed and charges its cost straight
// away (so you can't start a $25 dinner with $10). When the real-time
// timer runs out, `finishAction` applies the effects.
// =====================================================================

import { nycTime } from '../core/clock.ts';
import { ACTIONS, actionLock, type ActionDef } from '../data/actions.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { skillGainMultiplier } from './state.ts';
import type { GameState } from './types.ts';

export interface ActionOutcome {
  earned: number;
  skillUp: string | null;
}

export function startAction(s: GameState, actionId: string): { ok: true; action: ActionDef } | { ok: false; why: string } {
  const a = ACTIONS[actionId];
  if (!a) return { ok: false, why: 'Unknown action' };
  const lock = actionLock(a, s, nycTime().hour);
  if (lock) return { ok: false, why: lock };
  if (a.cost) {
    const r = changeMoney(s, -a.cost, a.label);
    if (!r.ok) return { ok: false, why: r.why };
  }
  return { ok: true, action: a };
}

export function finishAction(s: GameState, a: ActionDef, opts: { needsDone?: boolean } = {}): ActionOutcome {
  let earned = 0;
  if (a.needs && !opts.needsDone) applyNeeds(s, foodieBonus(s, a));
  if (a.moodlet) addMoodlet(s, a.moodlet);

  let skillUp: string | null = null;
  if (a.skill) {
    const before = Math.floor(s.skills[a.skill.key]);
    s.skills[a.skill.key] += a.skill.gain * skillGainMultiplier(s, a.skill.key);
    const after = Math.floor(s.skills[a.skill.key]);
    if (after > before) skillUp = `${a.skill.key} ${after}`;
  }
  if (a.pay) {
    earned = typeof a.pay === 'function' ? a.pay(s) : a.pay;
    if (earned > 0) changeMoney(s, earned, a.label);
  }
  s.stats.actionsDone[a.id] = (s.stats.actionsDone[a.id] ?? 0) + 1;
  return { earned, skillUp };
}

/** Foodies get extra fun from eating; night owls get extra fun from nightlife. */
export function foodieBonus(s: GameState, a: ActionDef): NonNullable<ActionDef['needs']> {
  const needs = { ...a.needs };
  if (s.profile.traits.includes('foodie') && a.tags.includes('eat')) needs.fun = (needs.fun ?? 0) + 10;
  if (s.profile.traits.includes('nightOwl') && a.tags.includes('nightlife')) needs.fun = (needs.fun ?? 0) + 10;
  return needs;
}
