// =====================================================================
// oddities.ts — what happened at the darkly funny places (data/uptown.ts).
// When one of their activities finishes, roll one twist and apply it.
// =====================================================================

import { ODD_ACTIVITIES, type Twist } from '../data/uptown.ts';
import { changeMoney, chargeBill } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { changeRep } from './rep.ts';
import type { GameState } from './types.ts';

const BY_ID = Object.fromEntries(ODD_ACTIVITIES.map((o) => [o.action.id, o]));

export const isOdd = (actionId: string) => !!BY_ID[actionId];

export function pickTwist(actionId: string, rand = Math.random): Twist | null {
  const o = BY_ID[actionId];
  if (!o) return null;
  let r = rand() * o.twists.reduce((a, t) => a + t.w, 0);
  for (const t of o.twists) if ((r -= t.w) < 0) return t;
  return o.twists[o.twists.length - 1];
}

/** Roll and apply the twist for a finished odd activity. Null for any other action. */
export function oddTwist(s: GameState, actionId: string, rand = Math.random): { emoji: string; title: string; twist: Twist } | null {
  const t = pickTwist(actionId, rand);
  if (!t) return null;
  const a = BY_ID[actionId].action;
  if (t.money && t.money > 0) changeMoney(s, t.money, `${a.emoji} ${a.label}`);
  else if (t.money && t.money < 0) chargeBill(s, -t.money, `${a.emoji} ${a.label}`);
  if (t.needs) applyNeeds(s, t.needs);
  if (t.mood) addMoodlet(s, { id: `odd-${actionId}`, label: t.mood.label, emoji: t.mood.emoji, value: t.mood.value, minutes: 180 });
  if (t.rep) changeRep(s, 'street', t.rep);
  return { emoji: a.emoji, title: a.label, twist: t };
}
