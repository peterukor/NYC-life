// =====================================================================
// celebrate.ts — buying a bottle, and the people it brings over.
//
// buyBottle() charges the bottle (cash first, then the bank card) and
// returns its show (data/bottles.ts). Admirers who come over can be
// chatted with, or taken home: a fade to black at your place (all 21+,
// nothing shown) and a good mood. If you're dating someone or have a
// partner, word gets back to them.
// =====================================================================

import { BOTTLES, BOTTLE_BY_ID, type BottleDef } from '../data/bottles.ts';
import { addRep, BOTTLE_STREET_REP } from './rep.ts';
import { changeMoney } from './economy.ts';
import { addSectionSpend, noteBottle } from './section.ts';
import { addMoodlet } from './needs.ts';
import { CLUB_BY_PLACE } from '../data/clubs.ts';
import { addClubSpend } from './clubs.ts';
import type { GameState } from './types.ts';

/**
 * Staff discount on bottles (Peter, 2026-10-14): 🍸 bartenders 20% off,
 * 🌙 night dancers 25% off. Works at any bottle-service spot.
 */
export const BOTTLE_DISCOUNT: Record<string, number> = { bartender: 0.2, dancer: 0.25 };

export function bottleDiscount(s: GameState): number {
  return (s.job && BOTTLE_DISCOUNT[s.job.careerId]) || 0;
}

/** What a bottle costs you, after any staff discount (cents). */
export function bottlePrice(s: GameState, b: BottleDef): number {
  // Staff discount, and 🛥️ the heir's (data/clubs.ts): they stack.
  const heir = (s.connections ?? []).includes('heir') ? 0.1 : 0;
  return Math.round((b.price * (1 - bottleDiscount(s)) * (1 - heir)) / 100) * 100;
}

/** Buy a bottle. Paid from cash, then the bank. */
export function buyBottle(s: GameState, id: string): { ok: true; bottle: BottleDef; street: number; rankUp: string | null } | { ok: false; why: string } {
  const b = BOTTLE_BY_ID[id];
  if (!b) return { ok: false, why: 'That bottle isn’t on the menu' };
  const price = bottlePrice(s, b);
  if (s.money + s.bank < price) return { ok: false, why: 'Not enough money for that bottle' };
  const fromCash = Math.min(s.money, price);
  if (fromCash > 0) changeMoney(s, -fromCash, `Bottle service: ${b.name}`);
  const rest = price - fromCash;
  if (rest > 0) s.bank -= rest;
  addMoodlet(s, { id: 'bottle', label: `Popped a ${b.name}`, emoji: b.emoji, value: 4 + b.roomMood, minutes: 120 });
  s.stats.actionsDone['__bottles'] = (s.stats.actionsDone['__bottles'] ?? 0) + 1;
  // 🛋️ Bottles in your section make room for more friends.
  addSectionSpend(s, s.location.placeId ?? '', price);
  noteBottle(s, s.location.placeId ?? '');
  // 🔥 Street rep: more for bigger bottles, and more at bigger clubs (data/clubs.ts).
  const club = CLUB_BY_PLACE[s.location.placeId ?? ''];
  const street = Math.round((BOTTLE_STREET_REP[BOTTLES.indexOf(b)] ?? 0) * (club?.rep ?? 1));
  if (club) addClubSpend(s, club.placeId, price);
  const rankUp = addRep(s, 'street', street);
  return { ok: true, bottle: b, street, rankUp };
}

/** Someone who came over: chat a little. */
export function chatAdmirer(s: GameState): void {
  s.needs.social = Math.min(100, s.needs.social + 15);
  s.needs.fun = Math.min(100, s.needs.fun + 6);
}

/** Take someone home. Returns who heard about it (your partner), if anyone. */
export function goHomeWith(s: GameState, name: string): { jealous: string | null } {
  addMoodlet(s, { id: 'company', label: `Went home with ${name}`, emoji: '🌙', value: 12, minutes: 60 * 10 });
  s.needs.social = 100;
  s.needs.fun = Math.min(100, s.needs.fun + 20);
  // Dating or partnered (people.ts → level 4+): they find out.
  const partner = Object.entries(s.people ?? {}).find(([, m]) => (m as { level?: number }).level !== undefined && (m as { level: number }).level >= 4);
  if (!partner) return { jealous: null };
  const mem = partner[1] as { grudge?: number; likes?: number };
  mem.grudge = (mem.grudge ?? 0) + 3;
  mem.likes = Math.max(0, (mem.likes ?? 0) - 3);
  addMoodlet(s, { id: 'guilty', label: 'Word got back to your partner', emoji: '😬', value: -8, minutes: 60 * 12 });
  return { jealous: partner[0] };
}
