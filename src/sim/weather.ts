// =====================================================================
// weather.ts — today's weather, the same for every player, as plug-in data.
//
// Weather is picked from the date with a seeded random number, so all
// players see the same rainy Tuesday without needing a server.
//
// EVERY WEATHER TYPE IS ONE ENTRY IN `WEATHER` BELOW. Each entry says:
//   • how likely it is (by month and hour)
//   • how it looks: sky greyness, sun strength, rain/snow particles,
//     wet streets, snow on roofs, flood water in the roads
//   • how it changes life: needs draining faster or slower, rideshare
//     surge, a news tip, and whether it counts as "wet" for events
//
// TO ADD A WEATHER: add an entry (e.g. 'fog', 'hail') — the sky, the
// weather effects system (world/weather-fx.ts), the needs and the news
// all read these fields, so nothing else needs to change.
// TO REMOVE ONE: delete it (or make its odds return 0).
// =====================================================================

import { Registry } from '../core/registry.ts';
import { Rng } from '../core/rng.ts';
import type { NeedKey } from './types.ts';

/** A weather id, e.g. 'sunny', 'snow', 'heatwave'. Any id in WEATHER is valid. */
export type Weather = string;

export interface WeatherDef {
  id: string;
  label: string;
  emoji: string;
  /** Relative chance on a given day (month 1–12, NYC hour 0–23). 0 = never. */
  odds: (month: number, hour: number) => number;
  /** Counts as "wet" for events (slippery streets, delayed trains…). */
  wet: boolean;
  /** 0 = clear blue sky, 1 = fully grey. */
  grey: number;
  /** Sunlight multiplier (1 = normal). */
  sun: number;
  /** Falling particles, if any. */
  precip?: { kind: 'rain' | 'snow'; density: number };
  /** Ground effects (0–1): wet sheen, snow cover on roofs/paths, flood water in the roads. */
  ground?: { wet?: number; snow?: number; flood?: number };
  /** Multiply how fast needs drain (e.g. heat makes you tired and sweaty). */
  needs?: Partial<Record<NeedKey, number>>;
  /** Extra rideshare surge (0.4 = +40%). */
  surge?: number;
  /** Short advice added to the morning news. */
  tip?: string;
}

export const WEATHER = new Registry<WeatherDef>('weather');

const summer = (m: number) => m >= 6 && m <= 8;
const winter = (m: number) => m === 12 || m <= 2;

WEATHER.add(
  { id: 'sunny', label: 'Sunny', emoji: '☀️', odds: (m) => (winter(m) ? 2.5 : 4.2), wet: false, grey: 0, sun: 1 },
  { id: 'cloudy', label: 'Cloudy', emoji: '⛅', odds: () => 3, wet: false, grey: 0.1, sun: 0.85 },
  {
    id: 'rain',
    label: 'Rain',
    emoji: '🌧️',
    odds: (m) => (winter(m) ? 1.2 : 2),
    wet: true,
    grey: 0.18,
    sun: 0.75,
    precip: { kind: 'rain', density: 0.6 },
    ground: { wet: 0.7 },
    surge: 0.4,
    tip: 'bring an umbrella, expect train delays',
  },
  {
    id: 'storm',
    label: 'Thunderstorms',
    emoji: '⛈️',
    odds: (m, h) => (summer(m) && h >= 15 && h < 19 ? 1.6 : 0.6),
    wet: true,
    grey: 0.3,
    sun: 0.6,
    precip: { kind: 'rain', density: 1 },
    ground: { wet: 1 },
    needs: { fun: 1.2 },
    surge: 0.6,
    tip: 'stay inside if you can',
  },
  { id: 'cold', label: 'Cold snap', emoji: '🥶', odds: (m) => (winter(m) ? 2.2 : 0), wet: false, grey: 0.08, sun: 0.9, needs: { energy: 1.25, hunger: 1.15 }, surge: 0.2, tip: 'wrap up warm' },
  {
    id: 'snow',
    label: 'Snow',
    emoji: '❄️',
    odds: (m) => (winter(m) ? 1.8 : m === 3 || m === 11 ? 0.3 : 0),
    wet: true,
    grey: 0.15,
    sun: 0.85,
    precip: { kind: 'snow', density: 0.7 },
    ground: { snow: 0.85 },
    needs: { energy: 1.3, fun: 0.85 },
    surge: 0.5,
    tip: 'snowball fights in the park, slow trains underground',
  },
  {
    id: 'heatwave',
    label: 'Heat wave',
    emoji: '🥵',
    odds: (m) => (summer(m) ? 1.4 : 0),
    wet: false,
    grey: 0,
    sun: 1.15,
    needs: { energy: 1.35, hygiene: 1.5, hunger: 0.85 },
    surge: 0.25,
    tip: 'drink water and find some AC',
  },
  {
    id: 'flood',
    label: 'Flash flood',
    emoji: '🌊',
    odds: (m) => (m >= 7 && m <= 9 ? 0.35 : 0.05),
    wet: true,
    grey: 0.35,
    sun: 0.55,
    precip: { kind: 'rain', density: 1 },
    ground: { wet: 1, flood: 1 },
    needs: { hygiene: 1.3, fun: 1.2 },
    surge: 0.9,
    tip: 'flooded streets, some subway lines suspended',
  },
);

/** The definition for a weather id (falls back to sunny for unknown ids). */
export function weatherDef(id: Weather): WeatherDef {
  return WEATHER.get(id) ?? WEATHER.require('sunny');
}

/** Old-style lookup kept for the UI: WEATHER_INFO[id].label / .emoji */
export const WEATHER_INFO: Record<string, { label: string; emoji: string }> = new Proxy({}, { get: (_t, id: string) => weatherDef(id) });

/** Testing aid: ?weather=snow in the address bar forces a weather. */
function forcedWeather(): string | null {
  if (typeof location === 'undefined') return null;
  const w = new URLSearchParams(location.search).get('weather');
  return w && WEATHER.has(w) ? w : null;
}

/** Weather for a New York day ("YYYY-MM-DD") at an hour. */
export function weatherFor(dateKey: string, hour: number): Weather {
  const forced = forcedWeather();
  if (forced) return forced;
  const rng = new Rng(`weather-${dateKey}`);
  const month = Number(dateKey.slice(5, 7));
  const base = rng.next();
  const late = rng.next(); // afternoon re-roll, so a day can change once
  const pick = (roll: number, h: number) => {
    const list = WEATHER.all().map((w) => [w, Math.max(0, w.odds(month, h))] as const).filter(([, o]) => o > 0);
    const total = list.reduce((s, [, o]) => s + o, 0);
    let t = roll * total;
    for (const [w, o] of list) if ((t -= o) <= 0) return w.id;
    return list[0][0].id;
  };
  const morning = pick(base, 9);
  // Afternoons can turn (summer storms); otherwise the day keeps its weather.
  return hour >= 15 && hour < 19 && late < 0.25 ? pick(late * 4, hour) : morning;
}

export function isWet(w: Weather): boolean {
  return weatherDef(w).wet;
}

/** How much faster (>1) or slower (<1) a need drains in this weather. */
export function weatherNeedMultiplier(w: Weather, need: NeedKey): number {
  return weatherDef(w).needs?.[need] ?? 1;
}
