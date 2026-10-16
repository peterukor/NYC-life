// =====================================================================
// arcade.ts — Pixel Palace, the arcade (Peter, 2026-10-14).
//
// Five cabinets, $2 a play. Your score turns into 🎟️ tickets; trade
// tickets at the prize counter. Each game keeps your best score (the
// leaderboard is just you for now; players later).
// The games themselves are ui/arcade.ts.
// =====================================================================

import { changeMoney } from './economy.ts';
import { addMoodlet } from './needs.ts';
import type { GameState } from './types.ts';

export const PLAY_COST = 200;

export interface ArcadeGame {
  id: string;
  name: string;
  emoji: string;
  howTo: string;
  /** Tickets for a score. */
  tickets: (score: number) => number;
  /** Cabinet colour in the room. */
  color: string;
}

export const ARCADE_GAMES: ArcadeGame[] = [
  { id: 'snake', name: 'Subway Snake', emoji: '🐍', color: '#2ec4b6', howTo: 'Swipe or use the arrows. Eat 🍕 fast for combos (×5), grab the golden slice, sip 🥤 for slow-mo. Don’t crash into walls, 🚧 or yourself.', tickets: (s) => Math.floor(s / 3) },
  { id: 'hoops', name: 'Hoop Shot', emoji: '🏀', color: '#ff7f11', howTo: 'Tap when the bar is in the green (yellow = swish). Three in a row and you’re ON FIRE: ×2 and a wider green. 🟡 money balls score double, and the last 10 seconds are bonus time.', tickets: (s) => Math.floor(s * 1.2) },
  { id: 'pigeons', name: 'Pigeon Pop', emoji: '🐦', color: '#8d99ae', howTo: 'Tap pigeons before they duck. Quick hits build a combo (×4). 🕊️ golden pigeon = FRENZY, 🥖 bread pops them all. Never tap the 🐀.', tickets: (s) => Math.floor(s / 5) },
  { id: 'beats', name: 'Beat Street', emoji: '🎵', color: '#ff4fa3', howTo: 'Tap each lane as its note hits the line. PERFECT timing scores most. Misses drain the crowd 😃 (empty = booed off); combos fill 🔥 hype for ×2. Grade at the end.', tickets: (s) => Math.floor(s / 6) },
  { id: 'stack', name: 'Bodega Stack', emoji: '🥪', color: '#e9c46a', howTo: 'Tap to drop each layer. What hangs over breaks off. Perfect drops keep it wide, and three in a row grow it back. ✨ Golden layers are worth ×3.', tickets: (s) => s * 2 },
  { id: 'dash', name: 'Delivery Dash', emoji: '🛵', color: '#2a9d8f', howTo: 'Tap or swipe to switch lanes. Sweep up 💵 for a streak bonus, grab 🧲 magnet, 🪖 helmet and ⚡ turbo, and dodge doors, potholes and people. Close calls score. Three hits and you’re out.', tickets: (s) => Math.floor(s / 7) },
  { id: 'claw', name: 'Claw Machine', emoji: '🧸', color: '#9b5de5', howTo: 'Drag on the glass (or hold ◀ ▶) to steer, then DROP. Centre it and let the swing settle for a strong grip. ✨ Shiny prizes are worth double. 15 seconds.', tickets: (s) => s },
];
export const ARCADE_BY_ID = Object.fromEntries(ARCADE_GAMES.map((g) => [g.id, g]));

function funOf(s: GameState) {
  return (s.fun ??= { tickets: 0, best: {}, bets: [], casinoNet: 0 });
}

export const tickets = (s: GameState) => funOf(s).tickets;
export const bestScore = (s: GameState, game: string) => funOf(s).best[game] ?? 0;

/** Pay for a play. */
export function payToPlay(s: GameState): string | null {
  if (s.money < PLAY_COST) return 'A play is $2';
  changeMoney(s, -PLAY_COST, '🕹️ Arcade');
  return null;
}

/** After a game: tickets and a new best? */
export function recordScore(s: GameState, game: string, score: number, opts: { phone?: boolean } = {}): { tickets: number; best: boolean } {
  const g = ARCADE_BY_ID[game];
  const f = funOf(s);
  // On your phone you play for the high score; 🎟️ tickets only at the arcade (go outside!).
  const t = opts.phone ? 0 : Math.max(0, Math.floor(g?.tickets(score) ?? 0));
  f.tickets += t;
  const best = score > (f.best[game] ?? 0);
  if (best) f.best[game] = score;
  s.needs.fun = Math.min(100, s.needs.fun + 6);
  return { tickets: t, best };
}

export interface Prize {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  give: (s: GameState) => void;
}

export const PRIZES: Prize[] = [
  { id: 'candy', name: 'Rope candy', emoji: '🍬', cost: 15, give: (s) => (s.needs.hunger = Math.min(100, s.needs.hunger + 10)) },
  { id: 'sticker', name: 'Holo sticker', emoji: '✨', cost: 40, give: (s) => addMoodlet(s, { id: 'sticker', label: 'Shiny sticker on my phone', emoji: '✨', value: 3, minutes: 90 }) },
  { id: 'plush', name: 'Pigeon plush', emoji: '🐦', cost: 120, give: (s) => addMoodlet(s, { id: 'plush', label: 'Won a pigeon plush', emoji: '🐦', value: 6, minutes: 180 }) },
  { id: 'shades', name: 'Neon shades', emoji: '🕶️', cost: 250, give: (s) => addMoodlet(s, { id: 'shades', label: 'Neon shades on', emoji: '🕶️', value: 8, minutes: 240 }) },
  { id: 'liberty', name: 'Glow-up Lady Liberty', emoji: '🗽', cost: 600, give: (s) => addMoodlet(s, { id: 'liberty', label: 'Arcade legend', emoji: '🏆', value: 12, minutes: 480 }) },
];

export function redeem(s: GameState, prizeId: string): string | null {
  const p = PRIZES.find((x) => x.id === prizeId);
  if (!p) return 'Not on the shelf';
  const f = funOf(s);
  if (f.tickets < p.cost) return `Needs ${p.cost} 🎟️`;
  f.tickets -= p.cost;
  p.give(s);
  return null;
}
