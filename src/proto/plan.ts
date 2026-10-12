// =====================================================================
// plan.ts — the layout of Manhattan on the 2.5D map.
//
// Manhattan is one continuous street grid made of six neighbourhoods of
// 4 x 4 blocks, laid out 2 across x 3 down so the borough is a compact
// near-square (8 x 12 blocks): Harlem and Upper Manhattan & Central Park
// at the top, Midtown and Chelsea & the Village in the middle, SoHo &
// Tribeca and the Financial District at the bottom. Water on the west
// (Hudson), east (East River) and south (the harbour).
//
// Every block is the same size: 90 m east-west x 60 m north-south, with
// 16 m roads (Peter's road pictures, sidewalks included) between them.
// Pictures are photographed to fill their space EXACTLY:
//   • a full block picture fills 90 x 60;
//   • a square picture fills 60 x 60, beside a 30 m plaza strip on the
//     west (small plaza with trees, or a subway entrance);
//   • houses fill their plots: a home block is 8 spaces across x 2 rows,
//     a space is 11.25 x 30 m. Tiny home 1x1, townhouse 2x1, villa 4x1,
//     mansion 4x2 spaces. Home blocks are always full: players buy a
//     house that is already built.
// =====================================================================

import type { PriceTier } from '../data/plots.ts';

export const CELL_W = 90;
export const CELL_D = 60;
export const ROAD = 16;
export const COLS = 8;
export const PITCH_X = CELL_W + ROAD;
export const PITCH_Z = CELL_D + ROAD;
/** Waterfront walkway width beyond the outer roads. */
export const PROMENADE = 14;
/** Width of the plaza strip beside a square picture. */
export const STRIP = CELL_W - CELL_D;
/** Home spaces: 8 across, 2 rows deep. */
export const SPACE_W = CELL_W / 8;
export const SPACE_D = CELL_D / 2;

export type HouseKind = 'tiny' | 'townhouse' | 'villa' | 'mansion';
export type Use = 'Offices' | 'Shops' | 'Apartments';
export type Side = 'plaza' | 'subway';

/** A built house on a home block: column 0-7, row 0 (north) or 1 (south), size in spaces. */
export interface House {
  c: number;
  r: number;
  w: number;
  h: number;
  house: HouseKind;
  sprite: string;
}

export type Block =
  | { kind: 'rect'; sprite: string; name: string; use: Use }
  | { kind: 'square'; sprite: string; name: string; use: Use; side: Side }
  | { kind: 'homes'; name: string; houses: House[] }
  | { kind: 'ads'; name: string; rented: [string | null, string | null] }
  | { kind: 'gym'; name: string; side: Side }
  | { kind: 'playground'; name: string }
  | { kind: 'landmark'; name: string }
  | { kind: 'park'; name: string };

// ---- home block templates (all 16 spaces built)
const SIZE: Record<HouseKind, [number, number]> = { tiny: [1, 1], townhouse: [2, 1], villa: [4, 1], mansion: [4, 2] };
const H = (c: number, r: number, house: HouseKind): House => {
  const [w, h] = SIZE[house];
  // One-row houses face their street: the north row faces north, the south row south.
  let rot = r === 0 && h === 1 ? 180 : 0;
  if (house === 'villa') rot = r === 0 ? 270 : 90; // villas lie along the street
  return { c, r, w, h, house, sprite: `house-${house}-r${rot}` };
};
const row = (r: number, kinds: HouseKind[], c0 = 0): House[] => {
  const out: House[] = [];
  let c = c0;
  for (const k of kinds) {
    const h = H(c, r, k);
    out.push(h);
    c += h.w;
  }
  return out;
};
const TEMPLATES = {
  tiny: () => [...row(0, Array(8).fill('tiny')), ...row(1, Array(8).fill('tiny'))],
  town: () => [...row(0, Array(4).fill('townhouse')), ...row(1, Array(4).fill('townhouse'))],
  villa: () => [...row(0, ['villa', 'villa']), ...row(1, ['villa', 'villa'])],
  mansion: () => [H(0, 0, 'mansion'), H(4, 0, 'mansion')],
  mix1: () => [H(0, 0, 'mansion'), H(4, 0, 'villa'), ...row(1, ['townhouse', 'tiny', 'tiny'], 4)],
  mix2: () => [...row(0, ['tiny', 'tiny', 'tiny', 'tiny', 'townhouse', 'townhouse']), ...row(1, ['townhouse', 'townhouse', 'villa'])],
  mix3: () => [...row(0, ['villa', 'townhouse', 'townhouse']), ...row(1, ['tiny', 'tiny', 'townhouse', 'villa'])],
} satisfies Record<string, () => House[]>;
export type Template = keyof typeof TEMPLATES;

// ---- block helpers
const rect = (sprite: string, name: string, use: Use): Block => ({ kind: 'rect', sprite, name, use });
const sq = (sprite: string, name: string, use: Use, side: Side = 'plaza'): Block => ({ kind: 'square', sprite, name, use, side });
const homes = (name: string, t: Template): Block => ({ kind: 'homes', name, houses: TEMPLATES[t]() });
const ads = (name: string, rented: [string | null, string | null] = [null, null]): Block => ({ kind: 'ads', name, rented });
const gym = (name: string, side: Side = 'plaza'): Block => ({ kind: 'gym', name, side });
const play = (name: string): Block => ({ kind: 'playground', name });
const mark = (name: string): Block => ({ kind: 'landmark', name });
const CP: Block = { kind: 'park', name: 'Central Park' };

export interface Hood {
  name: string;
  /** One line about the place, shown on its map label. */
  tagline: string;
  tier: PriceTier;
  /** First column (west) and row (north) of its 4 x 4 blocks. */
  col0: number;
  row0: number;
  blocks: Block[][];
}

export const HOODS: Hood[] = [
  {
    name: 'Harlem',
    tagline: 'Brownstones, soul food & the Apollo',
    tier: 'harlem',
    col0: 0,
    row0: 0,
    blocks: [
      [homes("Strivers' Row", 'town'), rect('block-harlem-r90', 'Lenox Avenue', 'Shops'), ads('Ad block · 125th St', ['SKYLINE SODA', null]), homes('Sugar Hill Cottages', 'tiny')],
      [mark('Apollo Theater'), rect('block-rowhouses-r90', 'Harlem Brownstones', 'Apartments'), homes('Mount Morris Homes', 'mix2'), rect('block-harlem-r270', '125th Street Shops', 'Shops')],
      [play('Marcus Garvey Playground'), homes('Hamilton Terrace', 'tiny'), sq('sq-walkups-r0', 'Convent Avenue Walk-ups', 'Apartments', 'subway'), ads('Ad block · Malcolm X Blvd')],
      [homes('Riverside Villas', 'villa'), gym('Harlem Gym & Pool'), homes('Lenox Townhouses', 'town'), ads('Ad block · 116th St', [null, 'METRO KICKS'])],
    ],
  },
  {
    name: 'Upper Manhattan & Central Park',
    tagline: 'Mansions, museums & the park',
    tier: 'uptown',
    col0: 4,
    row0: 0,
    blocks: [
      [homes('Riverside Mansions', 'mansion'), CP, CP, homes('Fifth Avenue Villas', 'villa')],
      [rect('block-rowhouses-r270', 'Upper West Side', 'Apartments'), CP, CP, sq('sq-midtown-r90', 'Museum Mile', 'Offices')],
      [ads('Ad block · Columbus Ave'), CP, CP, homes('Park Avenue Mansions', 'mansion')],
      [homes('West 72nd Street Homes', 'mix1'), CP, CP, ads('Ad block · Madison Ave', ['EMPIRE FITNESS', null])],
    ],
  },
  {
    name: 'Midtown',
    tagline: 'Times Square, towers & bright lights',
    tier: 'midtown',
    col0: 0,
    row0: 4,
    blocks: [
      [rect('block-midtown-r90', 'Rockefeller Plaza', 'Offices'), ads('Times Square Ads', ['BIG APPLE PIZZA', 'SKYLINE SODA']), mark('Times Square'), rect('block-mixed-r270', 'Broadway Shops', 'Shops')],
      [ads('Ad block · 42nd St'), mark('Empire State Building'), sq('sq-midtown-r0', 'Bryant Park Towers', 'Offices', 'subway'), homes('Sutton Place Mansions', 'mansion')],
      [rect('block-midtown-r270', "Hell's Kitchen Towers", 'Offices'), play('Bryant Park'), sq('sq-fidi-r90', 'Grand Central Offices', 'Offices'), ads('Ad block · Lexington Ave', [null, 'LIBERTY TAXI'])],
      [homes('Murray Hill Villas', 'villa'), gym('Midtown Gym & Pool'), rect('block-soho-r180', 'Herald Square Shops', 'Shops'), homes('Kips Bay Homes', 'mix1')],
    ],
  },
  {
    name: 'Chelsea & the Village',
    tagline: 'Townhouses, cafés & Washington Square',
    tier: 'downtown',
    col0: 4,
    row0: 4,
    blocks: [
      [rect('block-rowhouses-r90', 'Chelsea Rows', 'Apartments'), homes('West Chelsea Townhouses', 'town'), ads('Ad block · 23rd St'), rect('block-mixed-r90', 'Union Square Shops', 'Shops')],
      [play('High Line Playground'), mark('Washington Square Arch'), sq('sq-soho-r0', 'Bleecker Street', 'Shops', 'subway'), homes('East Village Cottages', 'tiny')],
      [homes('West Village Homes', 'mix2'), ads('Ad block · 14th St', ['BROOKLYN BEANS', null]), rect('block-harlem-r270', 'St Marks Place', 'Shops'), gym('Village Gym & Pool')],
      [sq('sq-walkups-r90', 'Greenwich Walk-ups', 'Apartments'), homes('Bedford Street Townhouses', 'town'), rect('block-soho-r0', 'Astor Place', 'Shops'), ads('Ad block · Houston St')],
    ],
  },
  {
    name: 'SoHo & Tribeca',
    tagline: 'Lofts, boutiques & Canal Street',
    tier: 'downtown',
    col0: 0,
    row0: 8,
    blocks: [
      [rect('block-soho-r0', 'SoHo Lofts', 'Shops'), homes('Tribeca Villas', 'villa'), ads('Ad block · Canal St', [null, 'METRO KICKS']), sq('sq-mixed-r0', 'Chinatown Market', 'Shops', 'subway')],
      [ads('Ad block · Spring St', ['BIG APPLE PIZZA', null]), rect('block-mixed-r270', 'Broadway Boutiques', 'Shops'), homes('Little Italy Homes', 'mix3'), rect('block-rowhouses-r270', 'Lower East Side', 'Apartments')],
      [homes('Tribeca Mansions', 'mansion'), play('Hudson Square Playground'), sq('sq-soho-r0', 'Mercer Street', 'Apartments'), homes('Orchard Street Townhouses', 'town')],
      [rect('block-harlem-r90', 'Canal Street Shops', 'Shops'), gym('SoHo Gym & Pool'), ads('Ad block · Lafayette St', ['LIBERTY TAXI', null]), homes('Mulberry Cottages', 'tiny')],
    ],
  },
  {
    name: 'Financial District',
    tagline: 'Wall Street, One WTC & the harbour',
    tier: 'downtown',
    col0: 4,
    row0: 8,
    blocks: [
      [sq('sq-fidi-r0', 'Liberty Street', 'Offices'), ads('Ad block · Cortlandt St', ['BROOKLYN BEANS', null]), homes('Greenwich Street Homes', 'mix1'), sq('sq-mixed-r0', 'Fulton Street', 'Shops', 'subway')],
      [mark('One World Trade Center'), rect('block-midtown-r270', 'Vesey Towers', 'Offices'), sq('sq-soho-r0', 'John Street Lofts', 'Apartments'), homes('Gold Street Townhouses', 'town')],
      [ads('Ad block · Rector St'), play('Zuccotti Playground'), gym('Downtown Gym & Pool'), homes('Pearl Street Villas', 'villa')],
      [mark('Wall Street · Stock Exchange'), sq('sq-walkups-r0', 'Stone Street Walk-ups', 'Apartments'), homes('Water Street Cottages', 'tiny'), ads('Ad block · Battery Pl')],
    ],
  },
];

export const ROWS = 12;
/** The whole street grid, outer roads included. */
export const GRID_W = COLS * PITCH_X + ROAD;
export const GRID_D = ROWS * PITCH_Z + ROAD;

/** West/north corner of block (c, r). */
export const cellX = (c: number) => ROAD + c * PITCH_X;
export const cellZ = (r: number) => ROAD + r * PITCH_Z;

/** The neighbourhood a block belongs to. */
export const hoodOf = (c: number, r: number): Hood =>
  HOODS.find((h) => c >= h.col0 && c < h.col0 + 4 && r >= h.row0 && r < h.row0 + 4) ?? HOODS[0];
export function blockAt(c: number, r: number): Block {
  const h = hoodOf(c, r);
  return h.blocks[r - h.row0][c - h.col0];
}
/** The neighbourhood under a ground point (nearest one if on a road or the water). */
export const hoodAt = (x: number, z: number): Hood => {
  const c = Math.max(0, Math.min(COLS - 1, Math.floor((x - ROAD / 2) / PITCH_X)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((z - ROAD / 2) / PITCH_Z)));
  return hoodOf(c, r);
};

/** Central Park's outline (its blocks plus the roads between them). */
export function parkBounds(): { x0: number; z0: number; x1: number; z1: number } | null {
  let c0 = COLS, c1 = -1, r0 = ROWS, r1 = -1;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (isPark(c, r)) {
        c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
      }
  if (c1 < 0) return null;
  return { x0: cellX(c0), z0: cellZ(r0), x1: cellX(c1) + CELL_W, z1: cellZ(r1) + CELL_D };
}

/** Is this block part of Central Park (one big park with no roads inside)? */
export const isPark = (c: number, r: number) => c >= 0 && r >= 0 && c < COLS && r < ROWS && blockAt(c, r).kind === 'park';

/** Which block a ground point is on (roads inside the park count as park), if any. */
export function cellAt(x: number, z: number): { c: number; r: number } | null {
  const c = Math.floor((x - ROAD) / PITCH_X);
  const r = Math.floor((z - ROAD) / PITCH_Z);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
  if (isPark(c, r)) return { c, r };
  if (x - cellX(c) > CELL_W || z - cellZ(r) > CELL_D) return null;
  return { c, r };
}

/** The house at a point inside a home block (local metres from its north-west corner). */
export function houseAt(houses: House[], lx: number, lz: number): House | undefined {
  const c = Math.floor(lx / SPACE_W);
  const r = Math.floor(lz / SPACE_D);
  return houses.find((p) => c >= p.c && c < p.c + p.w && r >= p.r && r < p.r + p.h);
}
