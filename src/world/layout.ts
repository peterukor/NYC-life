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

export type Zone = 'tall' | 'midrise' | 'brownstone' | 'waterfront';

/** What occupies a block, if it isn't ordinary buildings. */
export type BlockKind = 'buildings' | 'plaza' | 'park' | 'vacant';

export interface DistrictDef {
  id: AreaId;
  name: string;
  /** Short neighbourhood label shown on the map. */
  tagline: string;
  origin: { x: number; z: number };
  cols: number;
  rows: number;
  blockW: number;
  blockD: number;
  avenueW: number;
  streetW: number;
  avenueNames: string[];
  streetNames: string[];
  /** Which side has water (river) along it, drawn on the map and in 3D. */
  water: { side: 'west' | 'north'; label: string };
  zone: (c: number, r: number) => Zone;
  kind: (c: number, r: number) => BlockKind;
  /** The bright "Times Square" of this area: where the giant screens cluster. */
  hub: { c: number; r: number; name: string };
  /** Small seed so each area gets its own repeatable building heights. */
  seed: string;
}

export const SIDEWALK = 4;

const MANHATTAN: DistrictDef = {
  id: 'manhattan',
  name: 'Manhattan',
  tagline: 'Central Park · Midtown · Hell’s Kitchen',
  // Three rows were added north of the original map for Central Park.
  // The origin moved north by exactly those rows, so everything that was
  // already there keeps its world position (old row r is now r + 3).
  origin: { x: 0, z: -153 },
  cols: 6,
  rows: 12,
  blockW: 92,
  blockD: 38,
  avenueW: 20,
  streetW: 13,
  avenueNames: ['12th Ave', '10th Ave', '9th Ave', '8th Ave', '7th Ave', '6th Ave', '5th Ave'],
  streetNames: ['W 72nd St', 'W 65th St', 'Central Park S', 'W 50th St', 'W 48th St', 'W 46th St', 'W 44th St', 'W 42nd St', 'W 40th St', 'W 38th St', 'W 36th St', 'W 34th St', 'W 32nd St'],
  water: { side: 'west', label: 'Hudson River' },
  zone: (c, r) => {
    if (r <= 2) return c >= 5 ? 'tall' : 'brownstone'; // Upper West Side / Central Park South towers
    r -= 3;
    return c >= 3 ? 'tall' : c === 0 ? (r >= 5 ? 'waterfront' : 'midrise') : r <= 1 ? 'brownstone' : 'midrise';
  },
  kind: (c, r) => {
    if (r <= 1 && c >= 1 && c <= 4) return 'park'; // Central Park
    if (r <= 1 && c === 0) return 'plaza'; // Funland amusement park, west of the park
    r -= 3;
    if (c === 4 && r >= 1 && r <= 3) return 'plaza'; // Times Square
    if (c === 5 && r === 4) return 'park'; // Bryant Park
    if (c === 0 && r >= 6) return 'vacant'; // Hudson Yards expansion land
    return 'buildings';
  },
  hub: { c: 4, r: 5, name: 'Times Square' },
  seed: 'manhattan-midtown-v1',
};

const BROOKLYN: DistrictDef = {
  id: 'brooklyn',
  name: 'Brooklyn',
  tagline: 'Downtown · DUMBO · Fort Greene',
  // Far from Manhattan on purpose: the two areas are never loaded at once.
  origin: { x: 4000, z: 0 },
  cols: 5,
  rows: 7,
  blockW: 78,
  blockD: 42,
  avenueW: 18,
  streetW: 13,
  avenueNames: ['Court St', 'Smith St', 'Hoyt St', 'Flatbush Ave', 'Fort Greene Pl', 'Clermont Ave'],
  streetNames: ['Water St', 'Front St', 'Tillary St', 'Fulton St', 'Atlantic Ave', 'Pacific St', 'Dean St', 'Bergen St'],
  water: { side: 'north', label: 'East River' },
  zone: (c, r) => (r === 0 ? 'waterfront' : c >= 3 && r >= 2 && r <= 4 ? 'tall' : 'brownstone'),
  kind: (c, r) => {
    if (c === 3 && r === 3) return 'plaza'; // Atlantic Plaza, Brooklyn's bright hub
    if (c === 1 && r === 3) return 'park'; // Fort Greene Park
    if ((c === 4 && r >= 5) || (c === 0 && r === 6)) return 'vacant';
    return 'buildings';
  },
  hub: { c: 3, r: 3, name: 'Atlantic Plaza' },
  seed: 'brooklyn-downtown-v1',
};

export const DISTRICTS: Record<AreaId, DistrictDef> = { manhattan: MANHATTAN, brooklyn: BROOKLYN };

// ---------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------

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

/** Name of the nearest cross streets, e.g. "8th Ave & W 44th St". */
export function crossStreets(d: DistrictDef, x: number, z: number): string {
  let bestA = 0;
  let bestS = 0;
  for (let i = 0; i <= d.cols; i++) if (Math.abs(avenueX(d, i) - x) < Math.abs(avenueX(d, bestA) - x)) bestA = i;
  for (let j = 0; j <= d.rows; j++) if (Math.abs(streetZ(d, j) - z) < Math.abs(streetZ(d, bestS) - z)) bestS = j;
  return `${d.avenueNames[bestA]} & ${d.streetNames[bestS]}`;
}
