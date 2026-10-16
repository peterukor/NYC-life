// =====================================================================
// fishing.ts — Pier 84 on the Hudson (Peter, 2026-10-15: "add fishing
// competition").
//
// Cast, wait for a bite, then reel it in without snapping the line
// (ui/fishing.ts). What bites is rolled from FISH (rarer = bigger and
// harder to reel). The DERBY runs every morning 6–11 AM: your heaviest
// catch that morning against the regulars (seeded per day); at 11 AM
// the top three are paid. Fishing is in person only.
// =====================================================================

import { nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { changeRep } from './rep.ts';
import type { GameState } from './types.ts';

export interface FishDef {
  id: string;
  name: string;
  emoji: string;
  /** Weight range (lb). */
  lb: [number, number];
  /** How often it bites (relative). */
  odds: number;
  /** How hard it fights (1–5): pull strength and how jumpy. */
  fight: number;
  /** Market price per lb (cents); 0 = junk. */
  perLb: number;
  /** Funny line when you land it. */
  line: string;
}

export const FISH: FishDef[] = [
  { id: 'boot', name: 'An old boot', emoji: '👢', lb: [1, 2], odds: 7, fight: 1, perLb: 0, line: 'Size 11. No idea where the other one is.' },
  { id: 'cart', name: 'A shopping cart', emoji: '🛒', lb: [18, 25], odds: 1.5, fight: 2, perLb: 0, line: 'How. HOW.' },
  { id: 'porgy', name: 'Porgy', emoji: '🐟', lb: [0.5, 2], odds: 22, fight: 1, perLb: 400, line: 'Small, shiny, delicious. A classic.' },
  { id: 'fluke', name: 'Fluke', emoji: '🐠', lb: [1, 5], odds: 16, fight: 2, perLb: 900, line: 'Flat as a MetroCard. Tasty, though.' },
  { id: 'bluefish', name: 'Bluefish', emoji: '🐟', lb: [2, 12], odds: 12, fight: 3, perLb: 600, line: 'It bit the line, your hand, and your pride.' },
  { id: 'bass', name: 'Striped bass', emoji: '🐟', lb: [5, 35], odds: 8, fight: 4, perLb: 1_200, line: 'The fish of the Hudson. The pier applauds.' },
  { id: 'crab', name: 'Blue crab', emoji: '🦀', lb: [0.3, 1], odds: 9, fight: 1, perLb: 1_800, line: 'Sideways. Furious. Worth it.' },
  { id: 'eel', name: 'American eel', emoji: '🐍', lb: [1, 6], odds: 4, fight: 3, perLb: 1_000, line: 'It wrapped around your arm. You screamed. Everyone heard.' },
  { id: 'sturgeon', name: 'Atlantic sturgeon', emoji: '🐉', lb: [40, 120], odds: 0.7, fight: 5, perLb: 0, line: 'A living dinosaur. Protected, so it goes back in. The photo is legendary.' },
  { id: 'shark', name: 'Sand tiger shark (small)', emoji: '🦈', lb: [30, 80], odds: 0.5, fight: 5, perLb: 0, line: 'A SHARK. In the Hudson. You release it and tell everyone forever.' },
];
export const FISH_BY_ID: Record<string, FishDef> = Object.fromEntries(FISH.map((f) => [f.id, f]));

export interface FishingRecord {
  /** Biggest ever (lb) and what it was. */
  best: { id: string; lb: number } | null;
  caught: number;
  /** This morning's derby: date and your best (lb). */
  derby: { day: string; lb: number; paid: boolean } | null;
}

export function fishingOf(s: GameState): FishingRecord {
  return (s.fishing ??= { best: null, caught: 0, derby: null });
}

/** What's on the line this time. Morning and evening bite better; rain helps. */
export function rollBite(rand = Math.random): { fish: FishDef; lb: number } {
  const total = FISH.reduce((t, f) => t + f.odds, 0);
  let r = rand() * total;
  let fish = FISH[0];
  for (const f of FISH) {
    if (r < f.odds) {
      fish = f;
      break;
    }
    r -= f.odds;
  }
  const lb = Math.round((fish.lb[0] + rand() ** 1.6 * (fish.lb[1] - fish.lb[0])) * 10) / 10;
  return { fish, lb };
}

export const derbyOpen = (hour = nycTime().hour) => hour >= 6 && hour < 11;

/** You landed it: record, sell (unless protected or junk), derby. Returns the line. */
export function landFish(s: GameState, fish: FishDef, lb: number): string {
  const rec = fishingOf(s);
  rec.caught++;
  const newBest = !rec.best || lb > rec.best.lb;
  if (newBest && fish.perLb > 0) rec.best = { id: fish.id, lb };
  applyNeeds(s, { fun: 8 + fish.fight * 2 });
  const bits = [`${fish.emoji} ${fish.name}, ${lb} lb. ${fish.line}`];
  if (fish.perLb > 0) {
    const cents = Math.round((lb * fish.perLb) / 100) * 100;
    if (cents > 0) {
      changeMoney(s, cents, `🎣 Sold a ${fish.name}`);
      bits.push(`The fish guy pays $${Math.round(cents / 100)}.`);
    }
    // The derby: your heaviest fish this morning counts.
    const day = nycTime().dateKey;
    if (derbyOpen()) {
      if (!rec.derby || rec.derby.day !== day) rec.derby = { day, lb: 0, paid: false };
      if (lb > rec.derby.lb) {
        rec.derby.lb = lb;
        bits.push('🏆 New best for the derby!');
      }
    }
  }
  if (fish.fight >= 5) {
    changeRep(s, 'street', 10);
    addMoodlet(s, { id: 'legendCatch', label: `Caught a ${fish.name}`, emoji: fish.emoji, value: 20, minutes: 60 * 12 });
    bits.push('🔥 +10 street rep.');
  }
  return bits.join(' ');
}

/** Today's derby board: the regulars and you (heaviest first). */
export function derbyBoard(s: GameState, day = nycTime().dateKey): { name: string; lb: number; you: boolean }[] {
  const r = new Rng(`derby-${day}`);
  const regulars = ['Sal (since 1971)', 'Tina B.', 'Big Mike', 'Mr. Chen', 'The Kid with the Net'].map((name) => ({ name, lb: Math.round((3 + r.next() ** 1.4 * 24) * 10) / 10, you: false }));
  const rec = fishingOf(s);
  if (rec.derby && rec.derby.day === day && rec.derby.lb > 0) regulars.push({ name: s.profile.name, lb: rec.derby.lb, you: true });
  return regulars.sort((a, b) => b.lb - a.lb);
}

export const DERBY_PRIZES = [50_000, 20_000, 10_000];

/** After 11 AM: pay this morning's derby if you placed. Returns a line or null. */
export function settleDerby(s: GameState): string | null {
  const rec = fishingOf(s);
  const d = rec.derby;
  const t = nycTime();
  if (!d || d.paid || (d.day === t.dateKey && t.hour < 11)) return null;
  d.paid = true;
  const place = derbyBoard(s, d.day).findIndex((x) => x.you);
  if (place < 0 || place > 2) return `🎣 Derby result: you were ${place + 1}th. Sal won again.`;
  changeMoney(s, DERBY_PRIZES[place], `🎣 Pier 84 derby: ${['1st', '2nd', '3rd'][place]} place`);
  changeRep(s, 'street', [12, 6, 3][place]);
  return `🎣 Pier 84 derby: you came ${['1st 🥇', '2nd 🥈', '3rd 🥉'][place]}! +$${DERBY_PRIZES[place] / 100}.`;
}
