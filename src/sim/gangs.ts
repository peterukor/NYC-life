// =====================================================================
// gangs.ts — five crews, their turf, taking blocks, ranks and rep.
//
// WHERE CREWS LIVE
//   • Manhattan is a SAFE ZONE: no crew turf, no gang trouble. (So are
//     DUMBO, Brooklyn Heights and Downtown Brooklyn.)
//   • All five crews are based in Brooklyn for now (Queens, the Bronx and
//     Staten Island will add turf when they open). Each crew owns a few
//     blocks around its BASE. On the map, "Gang view" colours only turf
//     blocks — safe areas stay uncoloured.
//
// TAKING BLOCKS
//   • Members (Soldier rank and up) can take a rival block they're
//     standing on: a fight against that crew. Win and the block is yours.
//   • A crew can NEVER lose its base block, so no crew ever drops to
//     zero. Crews also counter-raid on their own (once a game day).
//
// RANKS, REP AND THE NPC BOSSES
//   • Single-player, every crew is run by NPCs. (On the server: when all
//     human members leave a crew, NPCs fill it.) The NPC bosses expect
//     you to show up: go quiet for a few game days, or let your crew lose
//     ground, and they can BUMP YOU DOWN a rank — which costs a big chunk
//     (40%) of your street rep.
//   • Street rep (Life Path → Crime) sets your PERKS: how fast you get
//     away, what you can carry into a fight, and which missions you can
//     take (repPerks below).
//
// TO ADD A CREW: add to CREWS (name, colour, base and turf area in real
// lat/lon). TO TUNE: GANG numbers.
// =====================================================================

import { nycTime } from '../core/clock.ts';
import { Registry } from '../core/registry.ts';
import { blockAt, blockRect, DISTRICTS, type DistrictDef } from '../world/layout.ts';
import { project, unproject } from '../world/geo-proj.ts';
import type { AreaId, GameState } from './types.ts';

export interface CrewDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
  area: AreaId;
  blurb: string;
  /** Their headquarters (lat, lon): the block here can never be taken. */
  base: [number, number];
  /** Starting turf: a lat/lon box [south, west, north, east]. */
  turf: [number, number, number, number];
  /** 1–10: how hard their members hit. */
  muscle: number;
  /** Cool-headed crews warn you off; hot-headed ones jump first. */
  temper: 'cool' | 'hot';
}

export const CREWS = new Registry<CrewDef>('crew');

CREWS.add(
  { id: 'kings', name: 'Myrtle Ave Kings', emoji: '👑', color: '#8338ec', area: 'brooklyn', blurb: 'Old-school crew off Myrtle Avenue. Loyal, proud, run the corner stores’ back rooms.', base: [40.6952, -73.9805], turf: [40.6925, -73.9865, 40.6985, -73.9765], muscle: 6, temper: 'cool' },
  { id: 'dragons', name: 'Gowanus Dragons', emoji: '🐉', color: '#e63946', area: 'brooklyn', blurb: 'Counterfeit bags, card games, and a long memory.', base: [40.6830, -73.9875], turf: [40.6795, -73.9935, 40.6865, -73.9835], muscle: 7, temper: 'hot' },
  { id: 'suits', name: 'Atlantic Suits', emoji: '💼', color: '#457b9d', area: 'brooklyn', blurb: 'They don’t carry knives. They carry lawyers. Worse.', base: [40.6815, -73.9725], turf: [40.6790, -73.9790, 40.6855, -73.9680], muscle: 4, temper: 'cool' },
  { id: 'lions', name: 'Fulton Lions', emoji: '🦁', color: '#f4a261', area: 'brooklyn', blurb: 'Clinton Hill’s loudest crew. Sneaker deals and block parties.', base: [40.6885, -73.9660], turf: [40.6855, -73.9725, 40.6925, -73.9600], muscle: 6, temper: 'hot' },
  { id: 'dockers', name: 'Navy Yard Dockers', emoji: '⚓', color: '#2a9d8f', area: 'brooklyn', blurb: 'Whatever comes off a ship, they had it first.', base: [40.6992, -73.9745], turf: [40.6965, -73.9790, 40.7030, -73.9660], muscle: 8, temper: 'cool' },
);

/** Boroughs/areas with no crews at all. */
export const SAFE_AREAS: AreaId[] = ['manhattan'];

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
  /** Rank you need to take blocks. */
  takeRank: 2,
  /** Game days without crew activity before the NPC bosses may demote you. */
  idleDays: 3,
  /** Share of street rep lost when demoted. */
  demotionRepLoss: 0.4,
  /** Daily chance each crew raids a neighbour's block. */
  raidChance: 0.25,
};

export interface GangState {
  crew: string | null;
  rank: number;
  respect: Record<string, number>;
  /** Blocks that changed hands: "area:c,r" → crew id. */
  turf?: Record<string, string>;
  /** Last game day you did something for your crew. */
  lastActive?: string;
}

export const newGangState = (): GangState => ({ crew: null, rank: 0, respect: {}, turf: {} });

// ---------------------------------------------------------------------
// Turf
// ---------------------------------------------------------------------

const inBox = (lat: number, lon: number, b: [number, number, number, number]) => lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3];

function blockCenter(d: DistrictDef, c: number, r: number): { lat: number; lon: number } {
  const b = blockRect(d, c, r);
  return unproject((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
}

/** Starting owner of a block (from the crews' turf boxes), or null for neutral/safe. */
export function defaultOwner(area: AreaId, c: number, r: number): CrewDef | null {
  if (SAFE_AREAS.includes(area)) return null;
  const d = DISTRICTS[area];
  if (d.kind(c, r) === 'water') return null;
  const { lat, lon } = blockCenter(d, c, r);
  return CREWS.all().find((cr) => cr.area === area && inBox(lat, lon, cr.turf)) ?? null;
}

/** The block a crew's base is on. */
export function baseBlock(crew: CrewDef): { c: number; r: number } | null {
  const p = project(crew.base[0], crew.base[1]);
  const d = DISTRICTS[crew.area];
  const c = Math.floor((p.x - d.origin.x) / (d.blockW + d.avenueW));
  const r = Math.floor((p.z - d.origin.z) / (d.blockD + d.streetW));
  return c >= 0 && r >= 0 && c < d.cols && r < d.rows ? { c, r } : null;
}

/** Who owns block (c, r) right now (taking blocks changes this). */
export function ownerOf(s: GameState, area: AreaId, c: number, r: number): CrewDef | null {
  if (SAFE_AREAS.includes(area)) return null;
  const id = s.gang.turf?.[`${area}:${c},${r}`];
  if (id) return CREWS.get(id) ?? null;
  return defaultOwner(area, c, r);
}

/** Which crew's turf is at (x, z), if any. */
export function turfAt(s: GameState, area: AreaId, x: number, z: number): CrewDef | null {
  if (SAFE_AREAS.includes(area)) return null;
  const b = blockAt(DISTRICTS[area], x, z);
  return b ? ownerOf(s, area, b.c, b.r) : null;
}

/** Every crew's blocks in an area (for the maps). */
export function turfMap(s: GameState, area: AreaId): { c: number; r: number; crew: CrewDef; base: boolean }[] {
  const d = DISTRICTS[area];
  const out: { c: number; r: number; crew: CrewDef; base: boolean }[] = [];
  for (let c = 0; c < d.cols; c++) {
    for (let r = 0; r < d.rows; r++) {
      const crew = ownerOf(s, area, c, r);
      if (!crew) continue;
      const b = baseBlock(crew);
      out.push({ c, r, crew, base: !!b && b.c === c && b.r === r });
    }
  }
  return out;
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

export function markActive(s: GameState): void {
  s.gang.lastActive = nycTime().dateKey;
}

export function joinCrew(s: GameState, crewId: string): string | null {
  const why = joinBlocker(s, crewId);
  if (why) return why;
  if (s.gang.crew) changeRespect(s, s.gang.crew, -50); // leaving burns bridges
  s.gang.crew = crewId;
  s.gang.rank = 0;
  for (const c of CREWS.all()) if (c.id !== crewId) changeRespect(s, c.id, -GANG.joinRivalPenalty);
  changeRespect(s, crewId, 20);
  markActive(s);
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

// ---------------------------------------------------------------------
// Rep perks: getaway, weapon, missions
// ---------------------------------------------------------------------

export const WEAPONS: { name: string; emoji: string; rep: number; bonus: number }[] = [
  { name: 'Bare fists', emoji: '✊', rep: 0, bonus: 0 },
  { name: 'Pool cue', emoji: '🎱', rep: 60, bonus: 1.5 },
  { name: 'Baseball bat', emoji: '🏏', rep: 150, bonus: 3 },
  { name: 'Brass knuckles', emoji: '🥊', rep: 300, bonus: 4.5 },
  { name: 'Taser', emoji: '⚡', rep: 600, bonus: 6 },
];

export const MISSIONS: { id: string; name: string; emoji: string; rep: number; rank?: number; blurb: string }[] = [
  { id: 'favour', name: 'Run a favour', emoji: '🎒', rep: 0, blurb: 'Deliveries and messages for your crew (they find you on your turf).' },
  { id: 'tag', name: 'Tag rival turf', emoji: '🎨', rep: 40, blurb: 'Put your crew’s mark on a rival block. Quick respect.' },
  { id: 'corner', name: 'Hold the corner', emoji: '🧍', rep: 90, blurb: 'Stand watch on your own turf. Pays, if nobody tests you.' },
  { id: 'take', name: 'Take a block', emoji: '🚩', rep: 150, rank: 2, blurb: 'Fight a rival crew for the block you’re standing on.' },
  { id: 'score', name: 'The big score', emoji: '💰', rep: 400, rank: 3, blurb: 'A heist with your crew. (Coming with multiplayer.)' },
];

/** What your street rep gets you. */
export function repPerks(s: GameState): { rep: number; getaway: number; weapon: (typeof WEAPONS)[number]; missions: typeof MISSIONS } {
  const rep = s.paths.rep.crime ?? 0;
  const weapon = [...WEAPONS].reverse().find((w) => rep >= w.rep) ?? WEAPONS[0];
  return { rep, getaway: Math.min(0.3, rep / 2000), weapon, missions: MISSIONS.filter((m) => rep >= m.rep && (m.rank === undefined || (s.gang.crew && s.gang.rank >= m.rank))) };
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
 * A street fight: your fitness + street smarts + what you carry (+ crew
 * backup) against their muscle. Never a sure thing — and they fight back.
 */
export function fight(s: GameState, crew: CrewDef): boolean {
  const you = (s.skills.fitness ?? 0) * 1.2 + (s.skills.streetSmarts ?? 0) * 0.8 + repPerks(s).weapon.bonus + (s.gang.crew ? 1 + s.gang.rank : 0);
  const them = crew.muscle + Math.random() * 6;
  return you + Math.random() * 6 > them;
}

// ---------------------------------------------------------------------
// Missions you do where you stand
// ---------------------------------------------------------------------

export interface MissionResult {
  text: string;
  tone: 'good' | 'bad' | 'info';
  /** Arrest the player (handled by the caller: sim/jail.ts). */
  arrest?: { reason: string; hours: number; bail: number };
  /** Hospital bill (cents). */
  hospital?: number;
}

/** Can you do this mission here? Returns the reason if not. */
export function missionBlocker(s: GameState, id: string, area: AreaId, x: number, z: number): string | null {
  const m = MISSIONS.find((k) => k.id === id);
  if (!m) return 'Unknown mission.';
  if (!s.gang.crew) return 'Join a crew first.';
  if (!repPerks(s).missions.includes(m)) return `Needs ${m.rep} street rep${m.rank ? ` and ${RANKS[m.rank]} rank` : ''}.`;
  if (id === 'score') return 'Coming with multiplayer.';
  if (id === 'favour') return 'Favours find you: walk around your turf.';
  if (SAFE_AREAS.includes(area)) return 'This is a safe zone. No crew business here.';
  const owner = turfAt(s, area, x, z);
  if (id === 'corner') return owner?.id === s.gang.crew ? null : 'Stand on your own crew’s turf.';
  if (!owner || owner.id === s.gang.crew) return 'Stand on a RIVAL crew’s block.';
  if (id === 'take') {
    const b = blockAt(DISTRICTS[area], x, z)!;
    const base = baseBlock(owner);
    if (base && base.c === b.c && base.r === b.r) return `That’s the ${owner.name} headquarters. It can’t be taken.`;
  }
  return null;
}

export function doMission(s: GameState, id: string, area: AreaId, x: number, z: number): MissionResult {
  const why = missionBlocker(s, id, area, x, z);
  if (why) return { text: why, tone: 'info' };
  markActive(s);
  const mine = CREWS.require(s.gang.crew!);
  const owner = turfAt(s, area, x, z);
  if (id === 'tag') {
    changeRespect(s, owner!.id, -6);
    changeRespect(s, mine.id, 4);
    s.paths.rep.crime = (s.paths.rep.crime ?? 0) + 4;
    if (Math.random() < 0.12) return { text: 'A patrol car rolled up mid-tag.', tone: 'bad', arrest: { reason: 'vandalism', hours: 4, bail: 15_000 } };
    return { text: `${mine.emoji} tag up on ${owner!.name} turf. They’ll see it in the morning.`, tone: 'good' };
  }
  if (id === 'corner') {
    if (Math.random() < 0.2) {
      const rival = CREWS.all().find((c) => c.id !== mine.id && c.area === area) ?? mine;
      if (fight(s, rival)) {
        changeRespect(s, mine.id, 6);
        return { text: `${rival.name} tested the corner. You held it.`, tone: 'good' };
      }
      return { text: `${rival.name} ran you off the corner.`, tone: 'bad', hospital: 50_000 };
    }
    changeRespect(s, mine.id, 3);
    return { text: 'Quiet shift on the corner. The crew noticed you showed up.', tone: 'good' };
  }
  // Take a block.
  const b = blockAt(DISTRICTS[area], x, z)!;
  if (fight(s, owner!)) {
    (s.gang.turf ??= {})[`${area}:${b.c},${b.r}`] = mine.id;
    changeRespect(s, owner!.id, -25);
    changeRespect(s, mine.id, 12);
    s.paths.rep.crime = (s.paths.rep.crime ?? 0) + 15;
    if (Math.random() < 0.2) return { text: `The block is ${mine.name} turf now — but the sirens were close.`, tone: 'bad', arrest: { reason: 'gang fight', hours: 8, bail: 50_000 } };
    return { text: `🚩 This block belongs to ${mine.name} now.`, tone: 'good' };
  }
  changeRespect(s, owner!.id, -10);
  return { text: `${owner!.name} held their ground. You got hurt.`, tone: 'bad', hospital: 90_000 };
}

// ---------------------------------------------------------------------
// Once per game day: NPC crews raid, NPC bosses judge you
// ---------------------------------------------------------------------

export function runGangDay(s: GameState, today: string): string | null {
  const notes: string[] = [];
  // Crews take blocks back from each other (never a base).
  for (const crew of CREWS.all()) {
    if (Math.random() > GANG.raidChance) continue;
    const blocks = turfMap(s, crew.area).filter((t) => t.crew.id !== crew.id && !t.base);
    if (!blocks.length) continue;
    // Prefer blocks this crew lost.
    const lost = blocks.filter((t) => defaultOwner(crew.area, t.c, t.r)?.id === crew.id);
    const target = (lost.length ? lost : blocks)[Math.floor(Math.random() * (lost.length || blocks.length))];
    if (lost.length || Math.random() < 0.3) {
      (s.gang.turf ??= {})[`${crew.area}:${target.c},${target.r}`] = crew.id;
      if (target.crew.id === s.gang.crew) notes.push(`${crew.emoji} ${crew.name} took one of your crew’s blocks.`);
    }
  }
  // The NPC bosses expect you to show up.
  if (s.gang.crew && s.gang.rank > 0) {
    const idle = s.gang.lastActive ? (Date.parse(today) - Date.parse(s.gang.lastActive)) / 86_400_000 : 99;
    if (idle >= GANG.idleDays && Math.random() < 0.5) {
      s.gang.rank--;
      s.paths.rep.crime = Math.floor((s.paths.rep.crime ?? 0) * (1 - GANG.demotionRepLoss));
      notes.push(`The ${CREWS.get(s.gang.crew)?.name} bosses bumped you down to ${RANKS[s.gang.rank]} for going quiet. You lost ${Math.round(GANG.demotionRepLoss * 100)}% of your street rep.`);
    }
  }
  return notes.length ? notes.join(' ') : null;
}
