// =====================================================================
// season.ts — the 🏆 leaderboard, daily challenges and your streak
// (Peter, 2026-10-15: "a leader board that shows highscores, and every 3
// days the highest score wins some money, like 2k in game money… think
// of genius ideas to keep people hooked").
//
// SEASON POINTS: almost everything fun earns them (fights won, chases
// escaped, chess wins, fish, races, arcade scores, art, bottles, shifts,
// daily challenges). A season lasts 3 real days. You're ranked against
// the city's regulars (seeded per season; with multiplayer, real
// players). When a season ends the top 3 are paid: $2,000 / $1,000 / $500.
//
// DAILY CHALLENGES: three per game day (≈ every 3.4 real hours), each with
// cash + points; all three = a bonus. STREAK: come back on consecutive
// REAL days and the welcome-back gift grows (up to 7 days).
// =====================================================================

import { nowMs, nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet } from './needs.ts';
import { postNews } from './news.ts';
import type { GameState } from './types.ts';

export const SEASON = {
  /** Real days per season. */
  days: 3,
  prizes: [200_000, 100_000, 50_000],
  /** 2026-10-01 00:00 UTC: seasons count from here. */
  epoch: Date.UTC(2026, 9, 1),
};

/** Ways to earn points (what each is worth). */
export const POINTS = {
  fightWon: 20,
  chaseEscaped: 25,
  chessWin: 15,
  fishPerLb: 1,
  raceWin: 30,
  racePlace: 10,
  arcadePer100: 4,
  artMilestone: 10,
  bottle: 8,
  shift: 6,
  /** A played shift (Peter, 2026-10-16: more for a full shift), plus a bonus for every order right. */
  shiftPlayed: 25,
  perfectShift: 15,
  /** Something odd at an uptown spot (data/uptown.ts). */
  oddity: 6,
  challenge: 40,
  allChallenges: 80,
  newPlace: 5,
};

export interface SeasonState {
  id: number;
  points: number;
  /** Seasons already paid (so a result is paid once). */
  paid: number[];
  /** Your best season ever (points). */
  best: number;
  /** What earned points this season (for the breakdown). */
  from: Record<string, number>;
}

export const seasonId = (now = nowMs()) => Math.floor((now - SEASON.epoch) / (SEASON.days * 86_400_000));
export const seasonEnds = (id = seasonId()) => SEASON.epoch + (id + 1) * SEASON.days * 86_400_000;

export function seasonOf(s: GameState): SeasonState {
  const id = seasonId();
  const st = (s.season ??= { id, points: 0, paid: [], best: 0, from: {} });
  return st;
}

/** Earn season points (and roll into a new season first if one ended). */
export function addPoints(s: GameState, what: string, pts: number): void {
  if (pts <= 0) return;
  rollSeason(s);
  const st = seasonOf(s);
  st.points += Math.round(pts);
  st.from[what] = (st.from[what] ?? 0) + Math.round(pts);
  st.best = Math.max(st.best, st.points);
}

const RIVALS = ['Tasha "Two Trains" Reed', 'Big Sal', 'Kenji M.', 'Marisol Vega', 'DJ Leftover Pizza', 'Coach Bev', 'Fast Eddie', 'Priya K.', 'The Bodega Cat (account)', 'Lil Brooklyn'];

/** The city's regulars this season: their totals so far (they climb through the season). */
export function rivals(id = seasonId(), now = nowMs()): { name: string; points: number }[] {
  const r = new Rng(`season-${id}`);
  const start = SEASON.epoch + id * SEASON.days * 86_400_000;
  const f = Math.max(0, Math.min(1, (now - start) / (SEASON.days * 86_400_000)));
  return RIVALS.map((name, i) => {
    // A couple of grinders, a pack in the middle, some casuals.
    const total = Math.round((i < 2 ? 900 : i < 6 ? 450 : 180) * (0.7 + r.next() * 0.7));
    return { name, points: Math.round(total * (0.15 + 0.85 * f)) };
  });
}

/** The board right now: rivals + you, biggest first. */
export function board(s: GameState, now = nowMs()): { name: string; points: number; you: boolean }[] {
  const st = seasonOf(s);
  const id = seasonId(now);
  const mine = st.id === id ? st.points : 0;
  return [...rivals(id, now).map((r) => ({ ...r, you: false })), { name: s.profile.name, points: mine, you: true }].sort((a, b) => b.points - a.points);
}

/** A season ended: pay your place (once), start the new one. Returns a line to show. */
export function rollSeason(s: GameState, now = nowMs()): string | null {
  const st = seasonOf(s);
  const id = seasonId(now);
  if (st.id === id) return null;
  let line: string | null = null;
  if (!st.paid.includes(st.id) && st.points > 0) {
    st.paid.push(st.id);
    const final = [...rivals(st.id, seasonEnds(st.id) - 1).map((r) => ({ ...r, you: false })), { name: s.profile.name, points: st.points, you: true }].sort((a, b) => b.points - a.points);
    const place = final.findIndex((x) => x.you);
    const prize = SEASON.prizes[place] ?? 0;
    if (prize) {
      changeMoney(s, prize, `🏆 Season ${st.id}: ${['1st', '2nd', '3rd'][place]} place`);
      addMoodlet(s, { id: 'seasonWin', label: `Season ${['champion', 'runner-up', 'podium'][place]}`, emoji: '🏆', value: 20, minutes: 60 * 24 });
      if (place === 0) postNews(s, { scope: 'city', emoji: '🏆', headline: `${s.profile.name} won the season with ${st.points} points`, personal: true });
      line = `🏆 Last season you came ${['1st 🥇', '2nd 🥈', '3rd 🥉'][place]} with ${st.points} points: +$${prize / 100}!`;
    } else line = `🏆 Last season you finished ${place + 1}th with ${st.points} points. New season, new shot.`;
  }
  Object.assign(st, { id, points: 0, from: {} });
  return line;
}

// ---------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------

export interface ChallengeDef {
  id: string;
  label: string;
  emoji: string;
  /** How many times. */
  need: number;
  /** Cash reward (cents). */
  cash: number;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'fightWon', label: 'Win a fight', emoji: '🥊', need: 1, cash: 30_000 },
  { id: 'fish', label: 'Land 2 fish at Pier 84', emoji: '🎣', need: 2, cash: 20_000 },
  { id: 'art', label: 'Hang a painting', emoji: '🎨', need: 1, cash: 15_000 },
  { id: 'chessWin', label: 'Win a game of chess', emoji: '♟️', need: 1, cash: 25_000 },
  { id: 'places', label: 'Visit 3 different places', emoji: '🗺️', need: 3, cash: 15_000 },
  { id: 'bottle', label: 'Buy a bottle at a club', emoji: '🍾', need: 1, cash: 20_000 },
  { id: 'subway', label: 'Ride the subway', emoji: '🚇', need: 1, cash: 8_000 },
  { id: 'shift', label: 'Work a shift', emoji: '💼', need: 1, cash: 15_000 },
  { id: 'race', label: 'Race the bike loop', emoji: '🚴', need: 1, cash: 15_000 },
  { id: 'arcade', label: 'Play 3 arcade or phone games', emoji: '🕹️', need: 3, cash: 10_000 },
  { id: 'mingle', label: 'Mingle at a club', emoji: '🍸', need: 1, cash: 12_000 },
  { id: 'weird', label: 'Live through something weird', emoji: '🐦', need: 1, cash: 10_000 },
];
const CH_BY_ID: Record<string, ChallengeDef> = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

export interface DailyState {
  day: string;
  picks: string[];
  progress: Record<string, number>;
  done: string[];
  bonus: boolean;
  /** Places counted today (for "visit 3"). */
  seen: string[];
}

/** Today's three challenges (seeded by the date: everyone gets the same three). */
export function daily(s: GameState, day = nycTime().dateKey): DailyState {
  const d = s.daily;
  if (d && d.day === day) return d;
  const r = new Rng(`daily-${day}`);
  const pool = CHALLENGES.map((c) => ({ c, k: r.next() })).sort((a, b) => a.k - b.k).slice(0, 3).map((x) => x.c.id);
  s.daily = { day, picks: pool, progress: {}, done: [], bonus: false, seen: [] };
  return s.daily;
}

/**
 * Something happened that a challenge might count. Returns lines to show
 * (a challenge done, all three done).
 */
export function progress(s: GameState, id: string, n = 1, placeId?: string): string[] {
  const d = daily(s);
  if (id === 'places') {
    if (!placeId || d.seen.includes(placeId)) return [];
    d.seen.push(placeId);
  }
  const out: string[] = [];
  if (!d.picks.includes(id) || d.done.includes(id)) return out;
  d.progress[id] = (d.progress[id] ?? 0) + n;
  const c = CH_BY_ID[id];
  if (d.progress[id] >= c.need) {
    d.done.push(id);
    changeMoney(s, c.cash, `✅ Daily: ${c.label}`);
    addPoints(s, 'challenges', POINTS.challenge);
    out.push(`✅ Daily challenge: ${c.emoji} ${c.label}! +$${c.cash / 100} · +${POINTS.challenge} 🏆`);
    if (d.done.length === d.picks.length && !d.bonus) {
      d.bonus = true;
      changeMoney(s, 50_000, '✅ All three daily challenges');
      addPoints(s, 'challenges', POINTS.allChallenges);
      out.push(`🎉 All three done today! Bonus +$500 · +${POINTS.allChallenges} 🏆`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------

/** Today's real date (the streak counts real days, not game days). */
export const realDate = (now = nowMs()) => new Date(now).toISOString().slice(0, 10);

/** Call when you open the game. Returns a welcome-back line the first time each real day. */
export function checkStreak(s: GameState, day = realDate()): string | null {
  const st = (s.streak ??= { last: '', days: 0 });
  if (st.last === day) return null;
  const yesterday = new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10);
  st.days = st.last === yesterday ? st.days + 1 : 1;
  st.last = day;
  const n = Math.min(7, st.days);
  const cash = 5_000 * n;
  changeMoney(s, cash, `🔥 Day ${st.days} streak`);
  addPoints(s, 'streak', 5 * n);
  return st.days > 1 ? `🔥 ${st.days}-day streak! +$${cash / 100} for coming back${st.days >= 7 ? ' (max bonus)' : ''}.` : `👋 Welcome back! +$${cash / 100}. Come back tomorrow to start a streak.`;
}
