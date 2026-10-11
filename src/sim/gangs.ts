// =====================================================================
// gangs.ts — five crews, their turf, and getting "caught lacking".
//
// THE CREWS (data in CREWS below — all fictional):
//   Each crew owns a few blocks of an area (its TURF). On the map, the
//   "Gang view" toggle paints every crew's turf in its colour.
//
// YOU AND THE CREWS
//   • Anyone can walk anywhere, but a crew's turf is THEIR street.
//   • `respect[crew]` (-100…100) is how a crew feels about you. Doing
//     jobs for a crew raises it; fighting them, or joining a rival,
//     drops it.
//   • You can JOIN one crew (needs some street rep from the Crime path).
//     Members rise through RANKS by doing crew jobs. Members are backed
//     up on their own turf — and hunted on rival turf.
//
// CAUGHT LACKING
//   Walking through turf where you're not liked rolls for trouble (see
//   sim/gang-events.ts): flashy clothes, a fancy car, cash on you, night
//   time and being in a rival crew all raise the odds. You choose:
//   hand it over, run, or fight. Nobody dies — losers go to the hospital
//   and get a bill.
//
// TO ADD A CREW: add to CREWS (id, name, colour, turf rectangles).
// TO TUNE: GANG numbers below.
// =====================================================================

import { Registry } from '../core/registry.ts';
import { blockAt, DISTRICTS } from '../world/layout.ts';
import type { AreaId, GameState } from './types.ts';

export interface CrewDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
  area: AreaId;
  blurb: string;
  /** Turf: block rectangles [colMin, colMax, rowMin, rowMax] (inclusive). */
  turf: [number, number, number, number][];
  /** 1–10: how hard their members hit. */
  muscle: number;
  /** Kind crews mostly warn you off; mean ones jump first and ask later. */
  temper: 'cool' | 'hot';
}

export const CREWS = new Registry<CrewDef>('crew');

CREWS.add(
  { id: 'kings', name: 'Ninth Ave Kings', emoji: '👑', color: '#8338ec', area: 'manhattan', blurb: 'Old-school Hell’s Kitchen crew. Loyal, proud, run the bodegas’ back rooms.', turf: [[0, 1, 4, 7]], muscle: 6, temper: 'cool' },
  { id: 'dragons', name: 'Canal St Dragons', emoji: '🐉', color: '#e63946', area: 'manhattan', blurb: 'Counterfeit bags, card games, and a long memory.', turf: [[0, 2, 9, 11]], muscle: 7, temper: 'hot' },
  { id: 'suits', name: 'Midtown Suits', emoji: '💼', color: '#457b9d', area: 'manhattan', blurb: 'They don’t carry knives. They carry lawyers. Worse.', turf: [[3, 5, 6, 9]], muscle: 4, temper: 'cool' },
  { id: 'lions', name: 'Fulton Lions', emoji: '🦁', color: '#f4a261', area: 'brooklyn', blurb: 'Downtown Brooklyn’s loudest crew. Sneaker deals and block parties.', turf: [[0, 2, 0, 3]], muscle: 6, temper: 'hot' },
  { id: 'dockers', name: 'Red Hook Dockers', emoji: '⚓', color: '#2a9d8f', area: 'brooklyn', blurb: 'Whatever comes off a ship, they had it first.', turf: [[3, 4, 3, 6]], muscle: 8, temper: 'cool' },
);

export const RANKS = ['Lookout', 'Runner', 'Soldier', 'Lieutenant', 'Boss'];

export const GANG = {
  /** Street (crime) rep you need before a crew will take you. */
  joinRep: 40,
  /** Respect you need with a crew to rank up, per rank. */
  rankRespect: [0, 25, 50, 75, 95],
  /** Base chance per check of trouble on unfriendly turf. */
  lackingBase: 0.18,
  /** Respect hit for joining a crew, with every OTHER crew. */
  joinRivalPenalty: 15,
};

export interface GangState {
  crew: string | null;
  rank: number;
  respect: Record<string, number>;
}

export const newGangState = (): GangState => ({ crew: null, rank: 0, respect: {} });

/** Which crew's turf is at (x, z), if any. */
export function turfAt(area: AreaId, x: number, z: number): CrewDef | null {
  const d = DISTRICTS[area];
  const b = d ? blockAt(d, x, z) : null;
  if (!b) return null;
  return CREWS.all().find((c) => c.area === area && c.turf.some(([c0, c1, r0, r1]) => b.c >= c0 && b.c <= c1 && b.r >= r0 && b.r <= r1)) ?? null;
}

/** Is the block (c, r) part of a crew's turf? (used by the map overlay) */
export function crewOfBlock(area: AreaId, c: number, r: number): CrewDef | null {
  return CREWS.all().find((cr) => cr.area === area && cr.turf.some(([c0, c1, r0, r1]) => c >= c0 && c <= c1 && r >= r0 && r <= r1)) ?? null;
}

export function respectOf(s: GameState, crewId: string): number {
  return s.gang.respect[crewId] ?? 0;
}

export function changeRespect(s: GameState, crewId: string, delta: number): void {
  s.gang.respect[crewId] = Math.max(-100, Math.min(100, respectOf(s, crewId) + delta));
}

/** How a crew sees you: 'family', 'friendly', 'neutral', 'rival' or 'enemy'. */
export function standing(s: GameState, crewId: string): 'family' | 'friendly' | 'neutral' | 'rival' | 'enemy' {
  if (s.gang.crew === crewId) return 'family';
  const r = respectOf(s, crewId);
  if (r <= -40) return 'enemy';
  if (s.gang.crew) return r >= 30 ? 'neutral' : 'rival';
  if (r >= 30) return 'friendly';
  return 'neutral';
}

export function joinBlocker(s: GameState, crewId: string): string | null {
  if (s.gang.crew === crewId) return 'You’re already in.';
  if ((s.paths.rep.crime ?? 0) < GANG.joinRep) return `They don’t know you. Get ${GANG.joinRep} street rep first (Life Path → Crime).`;
  if (respectOf(s, crewId) <= -40) return 'They want you gone, not in.';
  return null;
}

export function joinCrew(s: GameState, crewId: string): string | null {
  const why = joinBlocker(s, crewId);
  if (why) return why;
  if (s.gang.crew) changeRespect(s, s.gang.crew, -50); // leaving burns bridges
  s.gang.crew = crewId;
  s.gang.rank = 0;
  for (const c of CREWS.all()) if (c.id !== crewId) changeRespect(s, c.id, -GANG.joinRivalPenalty);
  changeRespect(s, crewId, 20);
  return null;
}

export function leaveCrew(s: GameState): void {
  if (!s.gang.crew) return;
  changeRespect(s, s.gang.crew, -40);
  s.gang.crew = null;
  s.gang.rank = 0;
}

/** Rank up if respect allows. Returns the new rank title or null. */
export function tryRankUp(s: GameState): string | null {
  if (!s.gang.crew) return null;
  const next = s.gang.rank + 1;
  if (next >= RANKS.length) return null;
  if (respectOf(s, s.gang.crew) < GANG.rankRespect[next]) return null;
  s.gang.rank = next;
  return RANKS[next];
}

/**
 * How likely trouble is right now (0–1) on this turf. Used as the gang
 * event weight. Flashy + cash + night + rival = danger.
 */
export function lackingRisk(s: GameState, crew: CrewDef, hour: number, cool: number): number {
  const st = standing(s, crew.id);
  if (st === 'family' || st === 'friendly') return 0;
  let r = GANG.lackingBase;
  if (st === 'rival') r *= 2.2;
  if (st === 'enemy') r *= 3.5;
  if (hour >= 21 || hour < 5) r *= 1.8;
  if (s.money > 50_000) r *= 1.4;
  r *= 1 + cool / 100;
  if (crew.temper === 'hot') r *= 1.3;
  return Math.min(0.9, r);
}

/**
 * A street fight: your fitness + street smarts (+ crew backup) against
 * their muscle. Returns true if you win. Some randomness so it's never
 * a sure thing — and NPCs fight back.
 */
export function fight(s: GameState, crew: CrewDef): boolean {
  const you = (s.skills.fitness ?? 0) * 1.2 + (s.skills.streetSmarts ?? 0) * 0.8 + (s.gang.crew ? 1 + s.gang.rank : 0);
  const them = crew.muscle + Math.random() * 6;
  return you + Math.random() * 6 > them;
}
