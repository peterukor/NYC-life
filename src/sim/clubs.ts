// =====================================================================
// clubs.ts (sim) — the door, the cover, mingling with people who matter,
// and tonight's top spenders (data/clubs.ts has the clubs).
//
//   doorCheck  in if your 🔥 rank or 😎 Cool is high enough (a promoter
//              you know counts as one level more). Members-only is strict.
//   tryBribe   slip the bouncer something: charisma helps; fail and you
//              lose the money and some pride.
//   mingle     a chance to meet a connection (richer ones at bigger
//              clubs); otherwise a funny moment with rich people.
//   spend      bottles and sections count towards tonight's top-spenders
//              board on the club screen (world/club-screen.ts).
// =====================================================================

import { nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { CLUB_BY_PLACE, CONNECTIONS, CONNECTION_BY_ID, type ClubDef, type ConnectionDef } from '../data/clubs.ts';
import { STOCKS } from '../data/stocks.ts';
import { changeMoney } from './economy.ts';
import { coolScore } from './garage.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { changeRep, repRank } from './rep.ts';
import type { GameState } from './types.ts';

export function clubOf(placeId: string | null | undefined): ClubDef | null {
  return placeId ? CLUB_BY_PLACE[placeId] ?? null : null;
}

export function knows(s: GameState, connectionId: string): boolean {
  return (s.connections ?? []).includes(connectionId);
}

export type DoorResult = { ok: true; how: 'rep' | 'cool' | 'promoter' | 'open' } | { ok: false; why: string; bribe: number | null };

/** Can you get in? (Doesn't charge anything.) */
export function doorCheck(s: GameState, c: ClubDef): DoorResult {
  if (c.tier === 1) return { ok: true, how: 'open' };
  const rank = repRank(s, 'street');
  const cool = coolScore(s).total;
  if (rank >= c.door.rank) return { ok: true, how: 'rep' };
  if (cool >= c.door.cool) return { ok: true, how: 'cool' };
  // A promoter gets you one level past your rep (not into members-only unless you're close).
  if (knows(s, 'promoter') && rank + 1 >= c.door.rank && c.tier < 4) return { ok: true, how: 'promoter' };
  if (knows(s, 'promoter') && knows(s, 'heir') && c.tier === 4) return { ok: true, how: 'promoter' };
  const why =
    c.tier === 4
      ? `“Members only.” You need 🔥 ${REP_NAMES[c.door.rank]} or 😎 ${c.door.cool} Cool. You have ${REP_NAMES[rank]} and ${cool} Cool.`
      : `“Not tonight.” You need 🔥 ${REP_NAMES[c.door.rank]} street rep or 😎 ${c.door.cool} Cool. You have ${REP_NAMES[rank]} and ${cool} Cool.`;
  return { ok: false, why, bribe: c.tier === 4 ? null : c.cover * 6 };
}

const REP_NAMES = ['Nobody', 'Seen Around', 'Known on the Block', 'Neighborhood Name', 'Club Royalty', 'Street Legend', 'City Icon'];

/** Slip the bouncer something. Returns whether it worked and what to say. */
export function tryBribe(s: GameState, c: ClubDef, rand = Math.random): { ok: boolean; text: string } {
  const cost = c.cover * 6;
  if (s.money < cost) return { ok: false, text: 'You don’t have that much cash on you.' };
  changeMoney(s, -cost, `Bouncer at ${c.placeId}`);
  const odds = 0.35 + (s.skills.charisma ?? 0) * 0.05 + (c.tier === 2 ? 0.15 : 0);
  if (rand() < odds) return { ok: true, text: 'He pockets it without looking at you and unclips the rope. Smooth.' };
  applyNeeds(s, { fun: -8 });
  addMoodlet(s, { id: 'bounced', label: 'Bounced at the door', emoji: '🚫', value: -10, minutes: 120 });
  return { ok: false, text: 'He takes the money, looks you up and down, and says “still no.” The line saw everything.' };
}

/** Pay the cover (cash). */
export function payCover(s: GameState, c: ClubDef): boolean {
  if (c.cover <= 0) return true;
  return changeMoney(s, -c.cover, `Cover charge`).ok;
}

export interface MingleResult {
  met: ConnectionDef | null;
  text: string;
  tip?: string;
}

/** Mingle: maybe meet a connection (richer at bigger clubs). */
export function mingle(s: GameState, c: ClubDef, rand = Math.random): MingleResult {
  applyNeeds(s, { social: 12, fun: 6, energy: -4 });
  const cool = coolScore(s).total;
  const odds = c.connectChance * (1 + (s.skills.charisma ?? 0) * 0.08 + cool / 200);
  const unmet = CONNECTIONS.filter((x) => x.minTier <= c.tier && !knows(s, x.id));
  if (unmet.length && rand() < odds) {
    // Rarer people at the top: prefer the richest you can meet here.
    const pick = unmet.sort((a, b) => b.minTier - a.minTier)[rand() < 0.6 ? 0 : Math.floor(rand() * unmet.length)];
    (s.connections ??= []).push(pick.id);
    addMoodlet(s, { id: 'connected', label: `Met ${pick.name.split(',')[0]}`, emoji: pick.emoji, value: 12, minutes: 60 * 6 });
    return { met: pick, text: `${pick.emoji} You met ${pick.name}. ${pick.hello}` };
  }
  // Already know the hedge fund guy and he's here: a tip.
  if (knows(s, 'hedgeFund') && c.tier >= 3 && rand() < 0.4) {
    const pick = STOCKS.all().filter((x) => x.risk !== 'fund')[Math.floor(rand() * STOCKS.all().filter((x) => x.risk !== 'fund').length)];
    changeRep(s, 'corporate', 6);
    return { met: null, text: `📈 Preston leans in: “${pick.ticker}. Trust me.” He has been wrong before. 💼 +6 corporate rep.`, tip: pick.id };
  }
  const lines = c.tier >= 3
    ? ['A man explains his boat to you for twenty minutes. It has a smaller boat inside it.', 'Someone asks what fund you’re with. You say “the fun fund.” They laugh. You’re in.', 'A woman shows you her dog’s Instagram. It has more followers than you.', 'You talk crypto with a guy until you realize he means the band.']
    : ['You meet a guy who knows a guy who knows the DJ. You don’t meet the DJ.', 'Someone says your outfit is “brave.” You take it.', 'You and a stranger agree this is the best song ever made. It’s the third time it’s played.', 'You get three Instagram handles and no last names.'];
  return { met: null, text: lines[Math.floor(rand() * lines.length)] };
}

// ---------------------------------------------------------------------
// Tonight's spending (the screen's top-spenders board)
// ---------------------------------------------------------------------

/** Count money spent at this club tonight (bottles, sections). */
export function addClubSpend(s: GameState, placeId: string, cents: number): void {
  const day = nycTime().dateKey;
  const n = (s.clubNight ??= { placeId, day, spent: 0 });
  if (n.placeId !== placeId || n.day !== day) Object.assign(n, { placeId, day, spent: 0 });
  n.spent += cents;
}

export function spentTonight(s: GameState, placeId: string): number {
  const n = s.clubNight;
  return n && n.placeId === placeId && n.day === nycTime().dateKey ? n.spent : 0;
}

/** Tonight's top spenders here: the regulars (fixed per night) and you. Biggest first. */
export function topSpenders(s: GameState, c: ClubDef, dayKey = nycTime().dateKey): { name: string; spent: number; you: boolean }[] {
  const r = new Rng(`${c.placeId}-${dayKey}`);
  const board = c.regulars
    .filter(() => r.next() < 0.75)
    .map((name) => ({ name, spent: Math.round((c.regularSpend[0] + r.next() * (c.regularSpend[1] - c.regularSpend[0])) / 10_000) * 10_000, you: false }));
  const mine = spentTonight(s, c.placeId);
  if (mine > 0) board.push({ name: s.profile.name, spent: mine, you: true });
  return board.sort((a, b) => b.spent - a.spent).slice(0, 5);
}

/** Bottles cost less if you know the heir (10%). */
export function connectionDiscount(s: GameState): number {
  return knows(s, 'heir') ? 0.1 : 0;
}

export { CONNECTION_BY_ID };
