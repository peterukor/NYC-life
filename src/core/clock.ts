// =====================================================================
// clock.ts — the game runs on REAL New York time.
//
// If it's 8:15 AM on a Tuesday in New York, it's 8:15 AM on Tuesday in
// the game, for every player, wherever they live. That's what makes
// rush hour feel like rush hour and nightlife happen at night.
//
// For testing you can shift the clock with a URL like `?clock=+6h` or
// `?clock=-90m`. This only affects your own browser.
// =====================================================================

import { GAME_TIME_ZONE } from './constants.ts';

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

/** Read a test offset like ?clock=+6h from the page address. */
export function initClockFromUrl(search: string): void {
  const raw = new URLSearchParams(search).get('clock');
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

/** Break a moment in time into New York hour/minute/day. */
export function nycTime(ms = nowMs()): NycTime {
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
