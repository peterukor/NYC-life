// =====================================================================
// phone.ts — losing your phone, and getting it back.
//
// Some events (phone swaps, snatchings) take your phone. Without it,
// phone apps like Jobs, Rideshare and the Bank are locked. The recovery
// options mirror what you'd really do, which is the point: the game
// quietly teaches what to do when it happens for real.
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet } from './needs.ts';
import type { GameState } from './types.ts';

export const PREPAID_PHONE_PRICE = 12_000; // $120 at any bodega

/** Report to the police: a chance it turns up a few minutes later. */
const pendingReturn = { at: 0 };

export function trackWithFindMy(s: GameState): { found: boolean; text: string } {
  const p = 0.35 + s.skills.streetSmarts * 0.1;
  if (Math.random() < p) {
    s.phone = { ok: true };
    addMoodlet(s, { id: 'phoneBack', label: 'Phone recovered', emoji: '📱', value: 14, minutes: 120 });
    return { found: true, text: 'Find My shows it in a lost-and-found two blocks away. You get it back!' };
  }
  return { found: false, text: 'The phone is switched off. Try reporting it, or get a prepaid phone at any bodega.' };
}

export function reportToPolice(s: GameState): string {
  if (Math.random() < 0.45) pendingReturn.at = nowMs() + 3 * 60_000;
  s.skills.streetSmarts += 0.2;
  return 'Report filed with the precinct (non-emergency). If it’s handed in, you’ll hear back soon.';
}

/** Called by the game loop; returns a message if the police found it. */
export function checkPoliceReturn(s: GameState): string | null {
  if (s.phone.ok || !pendingReturn.at || nowMs() < pendingReturn.at) return null;
  pendingReturn.at = 0;
  s.phone = { ok: true };
  addMoodlet(s, { id: 'phoneBack', label: 'Phone recovered', emoji: '📱', value: 14, minutes: 120 });
  return 'The precinct called: someone handed in your phone! 🚓';
}

export function buyPrepaidPhone(s: GameState): string | null {
  const r = changeMoney(s, -PREPAID_PHONE_PRICE, 'Prepaid phone');
  if (!r.ok) return r.why;
  s.phone = { ok: true };
  return null;
}
