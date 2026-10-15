// =====================================================================
// rep.ts — street rep and corporate rep (Peter, 2026-10-14).
//
// 🔥 Street rep: what the city thinks of you after dark. Bottle service
//    earns it, more for bigger bottles.
// 💼 Corporate rep: what Wall Street thinks of you. Profitable trades
//    earn it (more for bigger profits, a lot for 10×–100× wins).
//
// Played shifts add rep too (data/careers.ts → shift.rep): tip and
// nightlife jobs give street rep, office jobs give corporate rep.
// 💪 Respect (respect()): street rep plus fitness. People think twice
// before messing with someone fit.
//
// Street rep can go down now: losing fights and some event choices (Peter, 2026-10-15).
// Before that it only went up. Planned uses (not wired yet): how often bad
// things happen to you (robbed, spilled on, pickpocketed), which
// properties you can buy and which places let you in.
// =====================================================================

import type { GameState } from './types.ts';

export type RepKind = 'street' | 'corporate';

/** Points needed for each rank. */
export const REP_RANKS = [0, 50, 150, 400, 1_000, 2_500, 6_000];
export const REP_TITLES: Record<RepKind, string[]> = {
  street: ['Nobody', 'Seen Around', 'Known on the Block', 'Neighborhood Name', 'Club Royalty', 'Street Legend', 'City Icon'],
  corporate: ['Nobody', 'Retail Trader', 'Sharp', 'Rainmaker', 'Wolf', 'Shark', 'Titan'],
};
export const REP_EMOJI: Record<RepKind, string> = { street: '🔥', corporate: '💼' };

/** Street rep for each bottle on the menu, smallest to biggest (data/bottles.ts order). */
export const BOTTLE_STREET_REP = [5, 10, 20, 35, 60, 100, 200];
/** Corporate rep bonus for big multiples (on top of the profit's share). */
const WIN_BONUS: [number, number][] = [[100, 200], [80, 120], [50, 70], [30, 40], [10, 20]];

export function repOf(s: GameState): Record<RepKind, number> {
  return (s.rep ??= { street: 0, corporate: 0 });
}

/** Rank 0–6 for a kind of rep. */
export function repRank(s: GameState, kind: RepKind): number {
  const v = repOf(s)[kind];
  let r = 0;
  while (r + 1 < REP_RANKS.length && v >= REP_RANKS[r + 1]) r++;
  return r;
}

export function repTitle(s: GameState, kind: RepKind): string {
  return REP_TITLES[kind][repRank(s, kind)];
}

/** Add rep. Returns the new title if you ranked up. */
export function addRep(s: GameState, kind: RepKind, points: number): string | null {
  if (points <= 0) return null;
  const before = repRank(s, kind);
  repOf(s)[kind] += Math.round(points);
  const after = repRank(s, kind);
  return after > before ? REP_TITLES[kind][after] : null;
}

/**
 * Change rep up OR down (fights, events). Never below 0. Returns the new
 * title if you ranked up, and whether you dropped a rank.
 */
export function changeRep(s: GameState, kind: RepKind, delta: number): { title: string | null; dropped: boolean } {
  const before = repRank(s, kind);
  const r = repOf(s);
  r[kind] = Math.max(0, r[kind] + Math.round(delta));
  const after = repRank(s, kind);
  return { title: after > before ? REP_TITLES[kind][after] : null, dropped: after < before };
}

/** "🔥 +6 street rep" / "🔥 −4 street rep" */
export function repLine(kind: RepKind, delta: number): string {
  return `${REP_EMOJI[kind]} ${delta >= 0 ? '+' : '−'}${Math.abs(Math.round(delta))} ${kind} rep`;
}

/** Corporate rep for a sale: 1 per $100 of profit (max 300), plus a bonus for 10×+. */
export function tradeRep(profitCents: number, mult: number): number {
  if (profitCents <= 0) return 0;
  const base = Math.min(300, profitCents / 10_000);
  const bonus = WIN_BONUS.find(([m]) => mult >= m)?.[1] ?? 0;
  return Math.round(base + bonus);
}

/**
 * 💪 Respect 0–100: street rep rank (up to 60) plus fitness (up to 40).
 * The hook for later: fewer robberies, pickpockets and spills.
 */
export function respect(s: GameState): number {
  const street = (repRank(s, 'street') / (REP_RANKS.length - 1)) * 60;
  const fit = Math.min(10, Math.max(0, s.skills.fitness)) * 4;
  return Math.round(street + fit);
}
