// =====================================================================
// arcade.ts — Pixel Palace, the arcade (Peter, 2026-10-14).
//
// Five cabinets, $2 a play. Your score turns into 🎟️ tickets; trade
// tickets at the prize counter. Each game keeps your best score (the
// leaderboard is just you for now; players later).
// The games themselves are ui/arcade.ts.
// =====================================================================

import { snakeTickets } from './arcade-snake.ts';
import { stackTickets } from './arcade-stack.ts';
import { dashTickets } from './arcade-dash.ts';
import { pigeonTickets } from './arcade-pigeons.ts';
import { beatTickets } from './arcade-beats.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet } from './needs.ts';
import type { GameState } from './types.ts';
import { axeTickets } from './axe.ts';

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
  { id: 'snake', name: 'Subway Snake', emoji: '🐍', color: '#2ec4b6', howTo: 'Swipe or use the arrows to steer the train. Eat 🍕 quickly to build a combo (up to ×5); every five is a new stop and a 🚧 goes up. ✨ Golden slices pay big, 🥤 is slow-mo. The brakes screech before a crash, so turn! 90 seconds.', tickets: snakeTickets },
  { id: 'hoops', name: 'Hoop Shot', emoji: '🏀', color: '#ff7f11', howTo: 'Tap when the bar is in the green (yellow = swish). Three in a row and you’re ON FIRE: ×2 and a wider green. 🟡 money balls score double, and the last 10 seconds are bonus time.', tickets: (s) => Math.floor(s * 1.2) },
  { id: 'pigeons', name: 'Pigeon Pop', emoji: '🐦', color: '#8d99ae', howTo: 'Tap 🐦 pigeons before they duck back in. Quick pops chain a combo (×4). 🕊️ golden pigeon = FRENZY ×2, 🥖 bread pops every pigeon that’s up. Never tap the 🐀. 45 seconds; the last 10 are rush hour.', tickets: pigeonTickets },
  { id: 'beats', name: 'Beat Street', emoji: '🎵', color: '#ff4fa3', howTo: 'Pick a track and a difficulty, then tap each lane as its note hits the line (hold the long ones): your notes play the tune. Combos build to ×4, a full 🔥 hype meter doubles everything, misses drain the crowd 😃 (empty = booed off). Graded S–D. Off-beat? Use 🎧 Sync.', tickets: beatTickets },
  { id: 'stack', name: 'Bodega Stack', emoji: '🥪', color: '#e9c46a', howTo: 'Tap to drop each layer. What hangs over gets sliced off; land it just right for a PERFECT, and three in a row grow it back. Every 10th layer is the top 🍞: ORDER UP, ×3.', tickets: stackTickets },
  { id: 'dash', name: 'Delivery Dash', emoji: '🛵', color: '#2a9d8f', howTo: 'Tap or swipe left and right to change lanes, swipe up to hop. Hop potholes and sawhorses, steer round cabs, buses, trucks, steam stacks, people and opening doors. 💵 streaks up to ×5, 🥡 pays big, plus 🧲 🪖 ⚡. Close calls score. 90-second shift, three hits and you’re out.', tickets: dashTickets },
  { id: 'claw', name: 'Claw Machine', emoji: '🧸', color: '#9b5de5', howTo: 'Drag on the glass (or hold ◀ ▶) to steer, then DROP. Centre it and let the swing settle for a strong grip. ✨ Shiny prizes are worth double. 15 seconds.', tickets: (s) => s },
];
/** Five more (2026-10-27): Pinball, Skee-Ball, Breakout, Rooftop Jump, Air Hockey; + Axe Throwing (2026-10-28) (ui/arcade-games-2.ts). */
const ARCADE_GAMES_2: ArcadeGame[] = [
  {
    id: 'pinball',
    name: 'Liberty Pinball',
    emoji: '🗽',
    color: '#1fa2ff',
    howTo: 'Hold anywhere and let go to launch. Tap the left or right side for the flippers. Light 🚕 T-A-X-I for a bigger multiplier, ride the 🚇 ramp, and drop all three 🎯 targets for multiball. 3 balls.',
    tickets: (s) => Math.floor(s / 800),
  },
  {
    id: 'skeeball',
    name: 'Coney Skee-Ball',
    emoji: '🎡',
    color: '#ff6f59',
    howTo: 'Touch the ball, then flick up: a faster flick rolls harder and the angle aims. Land in the rings for 10–50 or a corner 💯. Nine balls, and the last one counts double.',
    tickets: (s) => Math.floor(s / 8),
  },
  {
    id: 'breakout',
    name: 'Brooklyn Breakout',
    emoji: '🧱',
    color: '#c0623a',
    howTo: 'Drag to slide the 🚕 paddle and lift your finger to launch. Bricks broken in a row build a chain (×5). Catch 🎱 multi-ball, ↔️ wide cab, 🔥 fireball and ❤️. 90 seconds.',
    tickets: (s) => Math.floor(s / 25),
  },
  {
    id: 'rooftop',
    name: 'Rooftop Jump',
    emoji: '🏙️',
    color: '#5b8def',
    howTo: 'You bounce on your own: hold the left or right side to steer. Springs launch you, 🍕 boxes fold after one bounce, stomp 🐦 pigeons from above and grab 🪙. Don’t fall!',
    tickets: (s) => Math.floor(s / 25),
  },
  {
    id: 'airhockey',
    name: 'Air Hockey',
    emoji: '🏒',
    color: '#00d1ff',
    howTo: 'Drag your mallet in your half and smack the puck into the house’s goal. Swing fast for a slapshot. First to 7, or whoever leads at 90 seconds. The house speeds up as you score.',
    tickets: (s) => Math.floor(s / 30),
  },
  {
    id: 'axe',
    name: 'Axe Throwing',
    emoji: '🪓',
    color: '#b5562c',
    howTo: 'Swipe up to throw: the swipe aims, its speed sets the spin. One clean turn and it sticks; too slow or too fast and it bounces off. Rings 1–5, bullseye 6, bulls in a row earn a bonus. Tap 🎯 to call a kill shot (top dots): 8, or 0 if you miss. Ten axes.',
    tickets: axeTickets,
  },
];
ARCADE_GAMES.push(...ARCADE_GAMES_2);
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
