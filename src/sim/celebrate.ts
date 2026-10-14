// =====================================================================
// celebrate.ts — buying a bottle, and the people it brings over.
//
// buyBottle() charges the bottle (cash first, then the bank card) and
// returns its show (data/bottles.ts). Admirers who come over can be
// chatted with, or taken home: a fade to black at your place (all 21+,
// nothing shown) and a good mood. If you're dating someone or have a
// partner, word gets back to them.
// =====================================================================

import { BOTTLE_BY_ID, type BottleDef } from '../data/bottles.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet } from './needs.ts';
import type { GameState } from './types.ts';

/** Buy a bottle. Paid from cash, then the bank. */
export function buyBottle(s: GameState, id: string): { ok: true; bottle: BottleDef } | { ok: false; why: string } {
  const b = BOTTLE_BY_ID[id];
  if (!b) return { ok: false, why: 'That bottle isn’t on the menu' };
  if (s.money + s.bank < b.price) return { ok: false, why: 'Not enough money for that bottle' };
  const fromCash = Math.min(s.money, b.price);
  if (fromCash > 0) changeMoney(s, -fromCash, `Bottle service: ${b.name}`);
  const rest = b.price - fromCash;
  if (rest > 0) s.bank -= rest;
  addMoodlet(s, { id: 'bottle', label: `Popped a ${b.name}`, emoji: b.emoji, value: 4 + b.roomMood, minutes: 120 });
  s.stats.actionsDone['__bottles'] = (s.stats.actionsDone['__bottles'] ?? 0) + 1;
  return { ok: true, bottle: b };
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
