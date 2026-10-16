// =====================================================================
// cycling.ts — the Central Park bike loop (Peter, 2026-10-15: "cycling").
//
// Rent a Citi Bike ($5) and race three regulars round the loop
// (ui/cycling.ts): tap left-right-left-right to pedal, ease off in the
// corners or you wipe out. The regulars' times are seeded per hour, so
// everyone racing the same hour faces the same field. Fitness makes you
// faster (and racing trains it). Win: prize money and street rep.
// =====================================================================

import { nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { changeRep } from './rep.ts';
import type { GameState } from './types.ts';

export const BIKE = {
  rent: 500,
  /** Loop length in game units (the UI's track). */
  length: 1000,
  /** Prize for 1st / 2nd / 3rd. */
  prizes: [6_000, 2_500, 1_000],
};

export interface Racer {
  name: string;
  emoji: string;
  /** Seconds they take for the loop. */
  time: number;
}

/** This hour's field (seeded): three regulars, one fast. */
export function field(day = nycTime().dateKey, hour = nycTime().hour): Racer[] {
  const r = new Rng(`bike-${day}-${hour}`);
  const names: [string, string][] = [['Lycra Larry', '🚴'], ['Delivery Dave', '🛵'], ['Marathon Maya', '🚴‍♀️'], ['Tourist on a Citi Bike', '🚲'], ['Coach Bev', '🚴‍♀️'], ['Kid on a BMX', '🚲']];
  const picks = names.sort(() => r.next() - 0.5).slice(0, 3);
  return picks.map(([name, emoji], i) => ({ name, emoji, time: Math.round((i === 0 ? 30 : 34 + i * 3) + r.next() * 6) }));
}

/** Your top speed and acceleration from fitness (used by the UI). */
export function riderStats(s: GameState): { top: number; accel: number } {
  const fit = Math.max(0, Math.min(10, s.skills.fitness ?? 0));
  return { top: 32 + fit * 2.2, accel: 1 + fit * 0.06 };
}

export function rentBike(s: GameState): string | null {
  if (s.money < BIKE.rent) return 'A Citi Bike is $5.';
  changeMoney(s, -BIKE.rent, '🚴 Citi Bike');
  return null;
}

/** Finish: place against the field, prize, rep, fitness. `time` = your seconds (Infinity = crashed out). */
export function finishRace(s: GameState, time: number, racers: Racer[]): { place: number; text: string } {
  const rec = (s.bike ??= { best: 0, wins: 0 });
  const place = racers.filter((x) => x.time < time).length; // 0 = first
  s.skills.fitness = Math.min(10, (s.skills.fitness ?? 0) + 0.25);
  applyNeeds(s, { energy: -18, fun: 14, hygiene: -10 });
  if (!Number.isFinite(time)) return { place: racers.length, text: 'You wiped out in a corner. A horse carriage driver asks if you’re okay. You are not.' };
  if (!rec.best || time < rec.best) rec.best = Math.round(time * 10) / 10;
  const prize = BIKE.prizes[place] ?? 0;
  if (prize) changeMoney(s, prize, `🚴 Bike loop: ${['1st', '2nd', '3rd'][place]}`);
  if (place === 0) {
    rec.wins++;
    changeRep(s, 'street', 6);
    addMoodlet(s, { id: 'bikeWin', label: 'Won the bike loop', emoji: '🚴', value: 14, minutes: 60 * 6 });
  }
  const pos = ['1st 🥇', '2nd 🥈', '3rd 🥉', '4th'][place];
  return { place, text: `${pos} in ${time.toFixed(1)} s${prize ? `: +$${prize / 100}` : ''}.${place === 0 ? ' 🔥 +6 street rep.' : ''}` };
}
