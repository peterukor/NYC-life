// =====================================================================
// layout.ts — the city plan, as plain data (no 3D code in here).
//
// The 3D renderer, the 2D map, NPC pathfinding and the simulation all
// read this same plan, so they always agree on where things are.
//
// HOW THE GRID WORKS
//   • x grows to the EAST, z grows to the SOUTH (north is −z), metres.
//   • Avenues run north–south. Avenue i sits at x = origin.x + i·(blockW + avenueW).
//   • Streets run east–west.  Street j sits at z = origin.z + j·(blockD + streetW).
//   • Block (c, r) is the land between avenues c and c+1 and streets r and r+1.
//   • Every block has a 4 m sidewalk ring; buildings sit inside it.
//
// This hand-made plan is COMPRESSED New York: real street names and
// neighbourhood character, but distances squeezed so every short walk
// reaches something to do. Later, scripts/osm-to-layout.ts (planned)
// will generate plans in this same format from OpenStreetMap data.
//
// EMPTY LAND: blocks marked 'vacant' are fenced "Coming soon" lots
// reserved for future venues or player-owned plots. Each area also
// keeps unused space around its edges for whole new neighbourhoods.
// =====================================================================

import type { AreaId } from '../sim/types.ts';
import { onLand, project, type BoroughId } from './geo-proj.ts';

export type Zone = 'tall' | 'midrise' | 'brownstone' | 'waterfront';

/** What occupies a block, if it isn't ordinary buildings. 'water' = the block is in the river. */
export type BlockKind = 'buildings' | 'plaza' | 'park' | 'vacant' | 'water';

export interface DistrictDef {
  id: AreaId;
  name: string;
  /** Short neighbourhood label shown on the map. */
  tagline: string;
  /** Which real borough this is (world/geo-proj.ts outlines). */
  borough: BoroughId;
  origin: { x: number; z: number };
  cols: number;
  rows: number;
  blockW: number;
  blockD: number;
  avenueW: number;
  streetW: number;
  /** Street names along each grid avenue line / street line (for map labels). */
  avenueNames: string[];
  streetNames: string[];
  /** Real cross-street names at any point (HUD signposts). */
  names: (x: number, z: number) => [string, string];
  /** Water label for the maps. */
  water: { side: 'west' | 'north'; label: string };
  zone: (c: number, r: number) => Zone;
  kind: (c: number, r: number) => BlockKind;
  /** The bright "Times Square" of this area: where the giant screens cluster. */
  hub: { c: number; r: number; name: string };
  /** Small seed so each area gets its own repeatable building heights. */
  seed: string;
}

export const SIDEWALK = 4;

// ---------------------------------------------------------------------
// The playable street grids are laid over the REAL borough shapes
// (world/geo-proj.ts: Times Square = 0,0; 1 game metre = 5 real metres;
// turned 29° so avenues run up the screen). Grid lines were chosen to
// line up with real streets: Central Park runs from Central Park South
// to 110th St between 8th and 5th Avenue, Times Square sits at 7th Ave
// and 42nd–47th, and so on. Blocks that fall in the river are 'water'.
// The rest of each borough (outside the grid) is "expandable" land for
// sale (world/coast.ts), ready for future neighbourhoods.
// ---------------------------------------------------------------------

const PITCH_X = 92 + 14;
const PITCH_Z = 38 + 13;

/** Is the whole block (shrunk a little) on the borough's land? */
function blockOnLand(borough: BoroughId, origin: { x: number; z: number }, c: number, r: number): boolean {
  const x0 = origin.x + c * PITCH_X + 7 + 2;
  const x1 = origin.x + (c + 1) * PITCH_X - 7 - 2;
  const z0 = origin.z + r * PITCH_Z + 6.5 + 2;
  const z1 = origin.z + (r + 1) * PITCH_Z - 6.5 - 2;
  return [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]].every(([x, z]) => onLand(borough, x, z));
}

/** Which block a real lat/lon falls in (for parks, plazas and lots tied to real places). */
function blockOfLL(origin: { x: number; z: number }, lat: number, lon: number): string {
  const p = project(lat, lon);
  return `${Math.floor((p.x - origin.x) / PITCH_X)},${Math.floor((p.z - origin.z) / PITCH_Z)}`;
}

// ---- Manhattan: real street numbers and avenues from x/z ----
/** Real street number at z (14th St … 110th St, linear: 15.87 game m per street). */
export const manhattanStreetAt = (z: number) => 14 + (488 - z) / 15.87;
/** Real avenues by x (measured at the projected intersections). West → east. */
const M_AVES: [string, number][] = [['12th Ave', -287], ['11th Ave', -230], ['10th Ave', -172], ['9th Ave', -114], ['8th Ave', -56], ['7th Ave', -4], ['6th Ave', 56], ['5th Ave', 116], ['Madison Ave', 146], ['Park Ave', 176], ['Lexington Ave', 206], ['3rd Ave', 246], ['2nd Ave', 290], ['1st Ave', 335], ['York Ave', 380]];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
function manhattanAvenue(x: number): string {
  let best = M_AVES[0];
  for (const a of M_AVES) if (Math.abs(a[1] - x) < Math.abs(best[1] - x)) best = a;
  // Central Park West is 8th Ave above 59th St.
  return best[0];
}
function manhattanStreet(x: number, z: number): string {
  const n = Math.round(manhattanStreetAt(z));
  const inPark = x > -56 && x < 116;
  if (n === 59 && inPark) return 'Central Park S';
  if (n === 110 && inPark) return 'Central Park N';
  return `${x < 116 ? 'W' : 'E'} ${ordinal(n)} St`;
}

const M_ORIGIN = { x: -378, z: -1042 };
const M_COLS = 8;
const M_ROWS = 31;
const M_SPECIAL: Record<string, BlockKind> = {
  [blockOfLL(M_ORIGIN, 40.7536, -73.9832)]: 'park', // Bryant Park
  [blockOfLL(M_ORIGIN, 40.7540, -74.0020)]: 'vacant', // Hudson Yards lots
  [blockOfLL(M_ORIGIN, 40.7525, -74.0005)]: 'vacant',
  '1,11': 'plaza', // Funland, the Upper West Side waterfront
};
const M_LAND: boolean[][] = Array.from({ length: M_COLS }, (_, c) => Array.from({ length: M_ROWS }, (_, r) => blockOnLand('manhattan', M_ORIGIN, c, r)));

const MANHATTAN: DistrictDef = {
  id: 'manhattan',
  name: 'Manhattan',
  tagline: 'Central Park · Midtown · Hell’s Kitchen',
  borough: 'manhattan',
  origin: M_ORIGIN,
  cols: M_COLS,
  rows: M_ROWS,
  blockW: 92,
  blockD: 38,
  // Two-lane roads (one lane each way) plus a parking lane on each kerb.
  avenueW: 14,
  streetW: 13,
  avenueNames: Array.from({ length: M_COLS + 1 }, (_, i) => manhattanAvenue(M_ORIGIN.x + i * PITCH_X)),
  streetNames: Array.from({ length: M_ROWS + 1 }, (_, j) => manhattanStreet(0, M_ORIGIN.z + j * PITCH_Z)),
  names: (x, z) => [manhattanAvenue(x), manhattanStreet(x, z)],
  water: { side: 'west', label: 'Hudson River' },
  zone: (c, r) => {
    const x = M_ORIGIN.x + (c + 0.5) * PITCH_X;
    const n = manhattanStreetAt(M_ORIGIN.z + (r + 0.5) * PITCH_Z);
    if (x < -240) return 'waterfront';
    if (n >= 30 && n <= 59 && x > -60) return 'tall'; // Midtown
    if (n > 59) return x > 150 ? 'midrise' : 'brownstone'; // Upper West / Upper East Side
    if (n < 30) return x < -60 ? 'brownstone' : 'midrise'; // Chelsea / Flatiron & Gramercy
    return x < -60 ? 'midrise' : 'tall'; // Hell's Kitchen / Murray Hill
  },
  kind: (c, r) => {
    if (!M_LAND[c]?.[r]) return 'water';
    const special = M_SPECIAL[`${c},${r}`];
    if (special) return special;
    const x = M_ORIGIN.x + (c + 0.5) * PITCH_X;
    const n = manhattanStreetAt(M_ORIGIN.z + (r + 0.5) * PITCH_Z);
    if (n > 59 && n < 111 && x > -60 && x < 152) return 'park'; // Central Park, 59th → 110th, 8th → 5th Ave
    if (c === 3 && (r === 19 || r === 20)) return 'plaza'; // Times Square, 7th Ave & Broadway, 42nd–47th
    return 'buildings';
  },
  hub: { c: 3, r: 20, name: 'Times Square' },
  seed: 'manhattan-real-v2',
};

// ---- Brooklyn: Downtown, DUMBO, Fort Greene, Boerum Hill ----
/** Real Brooklyn streets near the grid, as straight lines (lat/lon ends). */
const BK_STREETS: [string, [number, number], [number, number]][] = [
  ['Atlantic Ave', [40.6915, -74.0], [40.681, -73.96]],
  ['Flatbush Ave', [40.699, -73.987], [40.6805, -73.9745]],
  ['Fulton St', [40.7027, -73.994], [40.6845, -73.97]],
  ['Court St', [40.695, -73.9905], [40.68, -73.996]],
  ['Myrtle Ave', [40.6935, -73.985], [40.6955, -73.96]],
  ['DeKalb Ave', [40.6905, -73.984], [40.6895, -73.96]],
  ['Tillary St', [40.6965, -73.991], [40.6985, -73.98]],
  ['Water St', [40.7035, -73.993], [40.703, -73.98]],
  ['Washington Ave', [40.696, -73.967], [40.68, -73.964]],
  ['Smith St', [40.6895, -73.9895], [40.678, -73.9945]],
];
const BK_LINES = BK_STREETS.map(([n, a, b]) => ({ n, a: project(a[0], a[1]), b: project(b[0], b[1]) }));
function bkNames(x: number, z: number): [string, string] {
  const dist = (l: (typeof BK_LINES)[number]) => {
    const dx = l.b.x - l.a.x, dz = l.b.z - l.a.z;
    const t = Math.max(0, Math.min(1, ((x - l.a.x) * dx + (z - l.a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (l.a.x + t * dx), z - (l.a.z + t * dz));
  };
  const sorted = [...BK_LINES].sort((p, q) => dist(p) - dist(q));
  return [sorted[0].n, sorted[1].n];
}

const B_ORIGIN = { x: 480, z: 980 };
const B_COLS = 6;
const B_ROWS = 11;
const B_SPECIAL: Record<string, BlockKind> = {
  [blockOfLL(B_ORIGIN, 40.6913, -73.9757)]: 'park', // Fort Greene Park
  [blockOfLL(B_ORIGIN, 40.6845, -73.978)]: 'plaza', // Atlantic Plaza (by the arena)
};
const B_LAND: boolean[][] = Array.from({ length: B_COLS }, (_, c) => Array.from({ length: B_ROWS }, (_, r) => blockOnLand('brooklyn', B_ORIGIN, c, r)));
const B_HUB = blockOfLL(B_ORIGIN, 40.6845, -73.978).split(',').map(Number);

const BROOKLYN: DistrictDef = {
  id: 'brooklyn',
  name: 'Brooklyn',
  tagline: 'DUMBO · Downtown · Fort Greene',
  borough: 'brooklyn',
  origin: B_ORIGIN,
  cols: B_COLS,
  rows: B_ROWS,
  blockW: 92,
  blockD: 38,
  avenueW: 14,
  streetW: 13,
  avenueNames: Array.from({ length: B_COLS + 1 }, (_, i) => bkNames(B_ORIGIN.x + i * PITCH_X, B_ORIGIN.z + (B_ROWS / 2) * PITCH_Z)[0]),
  streetNames: Array.from({ length: B_ROWS + 1 }, (_, j) => bkNames(B_ORIGIN.x + (B_COLS / 2) * PITCH_X, B_ORIGIN.z + j * PITCH_Z)[0]),
  names: bkNames,
  water: { side: 'north', label: 'East River' },
  zone: (c, r) => {
    const x = B_ORIGIN.x + (c + 0.5) * PITCH_X;
    const z = B_ORIGIN.z + (r + 0.5) * PITCH_Z;
    if (z < 1110) return 'waterfront'; // DUMBO / Vinegar Hill warehouses
    if (x > 560 && x < 760 && z > 1200 && z < 1380) return 'tall'; // Downtown Brooklyn
    return 'brownstone'; // Brooklyn Heights, Fort Greene, Boerum Hill, Clinton Hill
  },
  kind: (c, r) => {
    if (!B_LAND[c]?.[r]) return 'water';
    return B_SPECIAL[`${c},${r}`] ?? 'buildings';
  },
  hub: { c: B_HUB[0], r: B_HUB[1], name: 'Atlantic Plaza' },
  seed: 'brooklyn-real-v2',
};

export const DISTRICTS: Record<AreaId, DistrictDef> = { manhattan: MANHATTAN, brooklyn: BROOKLYN };

export function avenueX(d: DistrictDef, i: number): number {
  return d.origin.x + i * (d.blockW + d.avenueW);
}

export function streetZ(d: DistrictDef, j: number): number {
  return d.origin.z + j * (d.blockD + d.streetW);
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The land of block (c, r), sidewalks included. */
export function blockRect(d: DistrictDef, c: number, r: number): Rect {
  return {
    minX: avenueX(d, c) + d.avenueW / 2,
    maxX: avenueX(d, c + 1) - d.avenueW / 2,
    minZ: streetZ(d, r) + d.streetW / 2,
    maxZ: streetZ(d, r + 1) - d.streetW / 2,
  };
}

/** The whole area including a margin of empty land around it. */
export function districtBounds(d: DistrictDef, margin = 60): Rect {
  return {
    minX: avenueX(d, 0) - margin,
    maxX: avenueX(d, d.cols) + margin,
    minZ: streetZ(d, 0) - margin,
    maxZ: streetZ(d, d.rows) + margin,
  };
}

export function districtCenter(d: DistrictDef): { x: number; z: number } {
  const b = districtBounds(d, 0);
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
}

/** Which block (if any) a world point is inside. */
export function blockAt(d: DistrictDef, x: number, z: number): { c: number; r: number } | null {
  for (let c = 0; c < d.cols; c++) {
    for (let r = 0; r < d.rows; r++) {
      const b = blockRect(d, c, r);
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return { c, r };
    }
  }
  return null;
}

/** Name of the nearest cross streets, e.g. "8th Ave & W 44th St" (real names). */
export function crossStreets(d: DistrictDef, x: number, z: number): string {
  const [a, b] = d.names(x, z);
  return `${a} & ${b}`;
}
