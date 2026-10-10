// =====================================================================
// weather.ts — today's weather, the same for every player.
//
// Weather is picked from the date with a seeded random number, so all
// players see the same rainy Tuesday without needing a server.
// Rain makes some events likelier (soaked shoes, delayed trains) and
// changes the sky and street colours.
// =====================================================================

import { Rng } from '../core/rng.ts';

export type Weather = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'cold';

export const WEATHER_INFO: Record<Weather, { label: string; emoji: string }> = {
  sunny: { label: 'Sunny', emoji: '☀️' },
  cloudy: { label: 'Cloudy', emoji: '⛅' },
  rain: { label: 'Rain', emoji: '🌧️' },
  storm: { label: 'Thunderstorms', emoji: '⛈️' },
  cold: { label: 'Cold snap', emoji: '🥶' },
};

/** Weather for a New York day ("YYYY-MM-DD"). Afternoons can turn stormy. */
export function weatherFor(dateKey: string, hour: number): Weather {
  const rng = new Rng(`weather-${dateKey}`);
  const month = Number(dateKey.slice(5, 7));
  const winter = month === 12 || month <= 2;
  const roll = rng.next();
  let w: Weather = roll < 0.42 ? 'sunny' : roll < 0.72 ? 'cloudy' : roll < 0.92 ? 'rain' : 'storm';
  if (winter && rng.chance(0.45)) w = 'cold';
  // Summer storms roll in during the afternoon.
  if (w === 'cloudy' && month >= 6 && month <= 8 && hour >= 15 && hour < 19 && rng.chance(0.35)) w = 'storm';
  return w;
}

export function isWet(w: Weather): boolean {
  return w === 'rain' || w === 'storm';
}
