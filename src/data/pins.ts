// =====================================================================
// pins.ts — the teardrop map pins floating over the city, as plug-in data.
//
// A PIN KIND says how a type of pin looks and how important it is.
// A PIN SOURCE is a small function that returns the pins of one kind
// right now (your home, today's sales, landmarks, friends…).
//
// RULE NUMBER ONE: PINS MUST NEVER BE OVERWHELMING. The pin system
// (systems/pins.ts) only ever shows the few most important pins on
// screen (MAX_PINS), merges pins that overlap, keeps them small and
// quiet, and lets only ONE pin bounce for attention at a time.
//
// TO ADD A KIND OF PIN (e.g. 'party', 'breakingNews'): add a PIN_KINDS
// entry and a PIN_SOURCES entry. Nothing else needs to change.
// =====================================================================

import { Registry } from '../core/registry.ts';
import { Rng } from '../core/rng.ts';
import type { NycTime } from '../core/clock.ts';
import type { AreaId, GameState } from '../sim/types.ts';
import { CAREERS } from './careers.ts';
import { doorOf, isOpen, placesIn, PLACE_BY_ID } from './places.ts';

/** Most pins ever on screen at once. */
export const MAX_PINS = 4;

export interface PinKind {
  id: string;
  /** Pin colour. */
  color: string;
  /** Higher = more important (wins when space is short). */
  priority: number;
  /** May this kind bounce to get attention (only the top one ever does)? */
  loud?: boolean;
  /** Only show when zoomed out past this camera distance, or when close (see nearShow). */
  minZoom?: number;
  /** ...or when the player is within this many metres. */
  nearShow?: number;
}

export interface Pin {
  id: string;
  kind: string;
  x: number;
  z: number;
  /** Emoji shown inside the pin. */
  icon: string;
  /** Short label shown when tapped / big. */
  label: string;
  /** Tapping opens this place's card. */
  placeId?: string;
}

export interface PinSourceContext {
  area: AreaId;
  state: GameState;
  time: NycTime;
}

export interface PinSource {
  id: string;
  pins: (ctx: PinSourceContext) => Pin[];
}

export const PIN_KINDS = new Registry<PinKind>('pin kind');
PIN_KINDS.add(
  { id: 'home', color: '#3a86ff', priority: 5 },
  { id: 'work', color: '#8338ec', priority: 4 },
  { id: 'sale', color: '#ff006e', priority: 3, loud: true },
  { id: 'event', color: '#fb5607', priority: 3, loud: true },
  { id: 'friend', color: '#06a77d', priority: 3 },
  { id: 'landmark', color: '#ffbe0b', priority: 1, minZoom: 150, nearShow: 70 },
);

export const PIN_SOURCES = new Registry<PinSource>('pin source');

PIN_SOURCES.add(
  {
    id: 'home',
    pins: ({ area, state }) => {
      const p = PLACE_BY_ID[state.home.placeId];
      if (!p || p.area !== area) return [];
      const d = doorOf(p);
      return [{ id: 'home', kind: 'home', x: d.x, z: d.z, icon: '🏠', label: 'Home', placeId: p.id }];
    },
  },
  {
    id: 'work',
    pins: ({ area, state }) => {
      const c = state.job ? CAREERS.find((k) => k.id === state.job!.careerId) : undefined;
      const p = c ? PLACE_BY_ID[c.placeId] : undefined;
      if (!p || p.area !== area) return [];
      const d = doorOf(p);
      return [{ id: 'work', kind: 'work', x: d.x, z: d.z, icon: '💼', label: `Work: ${p.name}`, placeId: p.id }];
    },
  },
  {
    // Daily mini events: one or two shops run a sale for a few hours.
    // Seeded by the date, so every player sees the same sales.
    id: 'daily-sales',
    pins: ({ area, time }) => {
      const rng = new Rng(`sales-${area}-${time.dateKey}`);
      const shops = placesIn(area).filter((p) => p.type === 'food' || p.type === 'cafe' || p.type === 'nightlife' || p.type === 'fitness');
      if (!shops.length) return [];
      const out: Pin[] = [];
      const deals = ['2-for-1 deal', 'Happy hour', '20% off', 'Free refill', 'Flash sale'];
      for (let i = 0; i < 2; i++) {
        const p = rng.pick(shops);
        const start = rng.int(8, 19);
        const len = rng.int(2, 4);
        const deal = rng.pick(deals);
        if (time.hour < start || time.hour >= start + len || !isOpen(p, time.hour) || out.some((o) => o.placeId === p.id)) continue;
        const d = doorOf(p);
        const end = start + len;
        out.push({ id: `sale-${p.id}`, kind: 'sale', x: d.x, z: d.z, icon: '🏷️', label: `${deal} at ${p.name} until ${end > 12 ? end - 12 : end} ${end >= 12 ? 'PM' : 'AM'}`, placeId: p.id });
      }
      return out;
    },
  },
  {
    id: 'landmarks',
    pins: ({ area }) =>
      placesIn(area)
        .filter((p) => p.landmark)
        .map((p) => {
          const d = doorOf(p);
          return { id: `lm-${p.id}`, kind: 'landmark', x: d.x, z: d.z, icon: p.emoji, label: p.name, placeId: p.id };
        }),
  },
);
