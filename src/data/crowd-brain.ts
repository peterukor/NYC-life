// =====================================================================
// crowd-brain.ts — how the New Yorkers on the street decide where to go.
//
// This is the NPCs' whole "brain", as editable data. No AI model: it's
// the weighted-dice approach classic life-sims use (a Markov chain with
// nudges), which costs nothing per player.
//
//   1. NEXT_STOP: after visiting X, how likely is each next stop?
//   2. timeBias: nudges by hour (bars at night, cafés in the morning).
//   3. PERSONALITIES: each NPC type loves or avoids some stops, has its
//      own walking speed, and makes up a share of the crowd.
//   4. CROWD_DENSITY: how busy the streets are at each hour.
//
// TO CHANGE HOW NPCs BEHAVE, edit the numbers here. TO ADD A TYPE of
// person (e.g. 'jogger', 'shopper'), add an entry to PERSONALITIES —
// world/crowd.ts picks it up automatically.
// =====================================================================

import { Registry } from '../core/registry.ts';
import type { PlaceType } from './places.ts';

export type Stop = PlaceType | 'wander';

/** After visiting X, how likely is each next stop (before nudges)? */
export const NEXT_STOP: Record<Stop, Partial<Record<Stop, number>>> = {
  home: { work: 3, cafe: 2, food: 2, wander: 2, station: 2 },
  work: { food: 3, cafe: 2, nightlife: 2, station: 3, wander: 1 },
  cafe: { work: 3, wander: 2, park: 2, plaza: 1 },
  food: { wander: 3, park: 2, home: 2, work: 1, plaza: 1 },
  nightlife: { nightlife: 1, food: 3, station: 2, home: 3 },
  fitness: { cafe: 2, home: 2, food: 2 },
  park: { wander: 2, cafe: 2, food: 2, plaza: 1 },
  plaza: { plaza: 2, food: 2, landmark: 2, station: 2, wander: 2 },
  landmark: { plaza: 2, food: 2, station: 2, park: 1 },
  station: { wander: 3, work: 2, plaza: 2, home: 2 },
  wander: { wander: 2, food: 2, cafe: 1, plaza: 2, park: 1, station: 1, nightlife: 1 },
};

/** Time-of-day nudge for a stop (1 = no change). */
export function timeBias(stop: Stop, hour: number): number {
  const night = hour >= 21 || hour < 4;
  const morning = hour >= 6 && hour < 10;
  switch (stop) {
    case 'nightlife': return night ? 3 : hour >= 17 ? 1.5 : 0.15;
    case 'work': return morning ? 2.5 : hour >= 10 && hour < 17 ? 1 : 0.1;
    case 'cafe': return morning ? 2.2 : hour < 18 ? 1 : 0.2;
    case 'park': return hour >= 7 && hour < 20 ? 1 : 0.1;
    case 'station': return morning || (hour >= 16 && hour < 19) ? 2 : 1;
    case 'home': return night ? 2 : 0.6;
    default: return 1;
  }
}

export interface PersonalityDef {
  id: string;
  /** Share of the crowd (relative weight). */
  share: number;
  /** Multipliers on stops this type loves (>1) or avoids (<1). */
  bias: Partial<Record<Stop, number>>;
  /** Walking speed range in metres per second. */
  speed: [number, number];
  /** Seconds they linger when they arrive somewhere. */
  linger: [number, number];
}

export const PERSONALITIES = new Registry<PersonalityDef>('personality');
PERSONALITIES.add(
  { id: 'commuter', share: 2, bias: { work: 2, station: 1.8, cafe: 1.4 }, speed: [1.5, 1.9], linger: [1, 4] },
  { id: 'local', share: 2, bias: { food: 1.5, park: 1.5, cafe: 1.3 }, speed: [1.2, 1.6], linger: [2, 8] },
  { id: 'partier', share: 1, bias: { nightlife: 2.5, food: 1.3 }, speed: [1.2, 1.7], linger: [2, 6] },
  { id: 'tourist', share: 1, bias: { plaza: 3, landmark: 3, station: 1.2, work: 0.1 }, speed: [1.0, 1.4], linger: [4, 12] },
);

/** How busy the streets are by hour (1 = rush hour peak). */
export const CROWD_DENSITY = [0.25, 0.18, 0.12, 0.1, 0.1, 0.18, 0.45, 0.8, 1, 0.85, 0.7, 0.75, 0.9, 0.85, 0.75, 0.8, 0.9, 1, 0.95, 0.85, 0.75, 0.65, 0.55, 0.4];
