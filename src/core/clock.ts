// =====================================================================
// clock.ts — the game clock.
//
// GAME TIME (the default): one in-game day lasts GAME_DAY_REAL_MINUTES
// real minutes (33), so a day in New York turns about 44 times in one
// real day. The game clock is worked out from the real time, so it
// is the same for every player, wherever they live: when it's 8:15 AM
// rush hour for you, it's rush hour for everyone.
//
// REAL TIME: `?clockmode=real` in the address bar runs the game on the
// actual New York clock instead (the original behaviour).
//
// For testing you can shift the clock with a URL like `?clock=+6h` or
// `?clock=-90m` (real hours/minutes). This only affects your browser.
//
// Everything that cares about "what time is it in the game" (the sun,
// opening hours, day/night, the hiring board, weather) calls nycTime().
//
// THE BALANCE CLOCK: balanceTime() / balanceDay() run the same way but at
// the OLD speed (BALANCE_DAY_REAL_MINUTES = 203, 3 h 23 min a day). Rent,
// loans, shift caps, business days, debt, crews, daily challenges, the
// stock market and other "per day" money and caps count balance days, so
// they keep the same pace per REAL hour whatever speed the visible clock
// runs at. Its date keys are the very keys saves held before the
// 2026-11-01 speed-up, so old saves carry straight on. Needs, moodlets
// and the season count plain real time.
// =====================================================================

import { BALANCE_DAY_REAL_MINUTES, GAME_DAY_REAL_MINUTES, GAME_TIME_ZONE } from './constants.ts';

export interface NycTime {
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** e.g. "2026-10-10": changes at midnight New York time. Used as the "game day". */
  dateKey: string;
  /** hour + minute/60, handy for smooth sky colours (e.g. 18.5 = 6:30 PM). */
  hourFloat: number;
}

let offsetMs = 0;
let realClock = false;

/** How much faster game time runs than real time (≈ 43.6: 43.6 game minutes per real minute). */
export const GAME_SPEED = 1440 / GAME_DAY_REAL_MINUTES;

/** How much faster the balance clock runs than real time (≈ 7.09, the old game speed). */
export const BALANCE_SPEED = 1440 / BALANCE_DAY_REAL_MINUTES;

/**
 * The real moment the game clock was set to midnight, Jan 1 2026 (NYC).
 * From then on, game time = that midnight + elapsed real time × GAME_SPEED.
 */
const REAL_EPOCH = Date.UTC(2026, 0, 1, 5, 0, 0);
const GAME_EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);

/** Use the real New York clock instead of game time (tests, or a settings toggle later). */
export function setRealClock(on: boolean): void {
  realClock = on;
}

/** Real milliseconds that pass during `gameMinutes` of game time. */
export function gameMinutesToRealMs(gameMinutes: number): number {
  return realClock ? gameMinutes * 60_000 : (gameMinutes * 60_000) / GAME_SPEED;
}

/**
 * Real milliseconds in `minutes` of BALANCE time (old game minutes: 1 440
 * a balance day, 3 h 23 min real). For cooldowns and sentences that should
 * keep their real-time length: jail, licence points, the cops' chase
 * cooldown, Rideshare Black rep.
 */
export function balanceMinutesToRealMs(minutes: number): number {
  return realClock ? minutes * 60_000 : (minutes * 60_000) / BALANCE_SPEED;
}

/** Read a test offset like ?clock=+6h from the page address. */
export function initClockFromUrl(search: string): void {
  const params = new URLSearchParams(search);
  if (params.get('clockmode') === 'real') realClock = true;
  // ?hour=11 jumps the game clock to 11 AM (handy for daytime screenshots).
  const hour = params.get('hour');
  if (hour !== null && !Number.isNaN(Number(hour))) {
    const now = nycTime(Date.now());
    const deltaGameH = (((Number(hour) - now.hourFloat) % 24) + 24) % 24;
    offsetMs = realClock ? deltaGameH * 3_600_000 : (deltaGameH * 3_600_000) / GAME_SPEED;
    return;
  }
  const raw = params.get('clock');
  if (!raw) return;
  const m = /^([+-]?\d+(?:\.\d+)?)([hm])$/.exec(raw.trim());
  if (!m) return;
  const amount = parseFloat(m[1]);
  offsetMs = amount * (m[2] === 'h' ? 3_600_000 : 60_000);
}

/** Current time in milliseconds, including any test offset. */
export function nowMs(): number {
  return Date.now() + offsetMs;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Building an Intl formatter is slow, so we make it once and reuse it.
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: GAME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const WEEKDAY_BY_UTC = [0, 1, 2, 3, 4, 5, 6];

/** Break a moment in time into the game's New York hour/minute/day. */
/** A clock running `speed` times faster than real time from the shared epoch. */
function clockAt(ms: number, speed: number): NycTime {
  // Game time is kept as a "wall clock" in UTC fields: no daylight-saving jumps.
  const g = new Date(GAME_EPOCH + (ms - REAL_EPOCH) * speed);
  const hour = g.getUTCHours();
  const minute = g.getUTCMinutes();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    hour,
    minute,
    weekday: WEEKDAY_BY_UTC[g.getUTCDay()],
    dateKey: `${g.getUTCFullYear()}-${pad(g.getUTCMonth() + 1)}-${pad(g.getUTCDate())}`,
    hourFloat: hour + minute / 60 + g.getUTCSeconds() / 3600,
  };
}

export function nycTime(ms = nowMs()): NycTime {
  if (!realClock) return clockAt(ms, GAME_SPEED);
  const parts: Record<string, string> = {};
  for (const p of formatter.formatToParts(new Date(ms))) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    hour,
    minute,
    weekday: WEEKDAYS[parts.weekday] ?? 0,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hourFloat: hour + minute / 60,
  };
}

/**
 * The BALANCE clock (see the top of this file): the old 3 h 23 min day.
 * Use it for anything that should keep its pace per real hour.
 * With `?clockmode=real` it is the real New York clock, like nycTime().
 */
export function balanceTime(ms = nowMs()): NycTime {
  return realClock ? nycTime(ms) : clockAt(ms, BALANCE_SPEED);
}

/** Today's balance-day key ("YYYY-MM-DD" on the balance calendar). */
export function balanceDay(ms = nowMs()): string {
  return balanceTime(ms).dateKey;
}

/** Real milliseconds until the next balance day starts (for "come back in …" text). */
export function msToNextBalanceDay(ms = nowMs()): number {
  const t = balanceTime(ms);
  return Math.max(0, balanceMinutesToRealMs((24 - t.hourFloat) * 60));
}

/** "8:05 PM" style label for the HUD. */
export function clockLabel(t: NycTime): string {
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  const ampm = t.hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(t.minute).padStart(2, '0')} ${ampm}`;
}

/** Rough time-of-day bucket used by events, NPCs and lighting. */
export type DayPart = 'lateNight' | 'morning' | 'rushAM' | 'midday' | 'afternoon' | 'rushPM' | 'evening' | 'night';

export function dayPart(hour: number): DayPart {
  if (hour < 5) return 'lateNight';
  if (hour < 7) return 'morning';
  if (hour < 10) return 'rushAM';
  if (hour < 13) return 'midday';
  if (hour < 16) return 'afternoon';
  if (hour < 19) return 'rushPM';
  if (hour < 22) return 'evening';
  return 'night';
}

/** Is it a weekday rush hour? (more crowds, more train trouble, surge pricing) */
export function isRushHour(t: NycTime): boolean {
  const weekend = t.weekday === 0 || t.weekday === 6;
  return !weekend && (t.hourFloat >= 7.5 && t.hourFloat < 9.75 || t.hourFloat >= 16.75 && t.hourFloat < 19);
}

/** Number of whole days between two date keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}
