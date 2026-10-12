// =====================================================================
// plan.ts — the layout of Manhattan on the 2.5D map.
//
// Manhattan is one continuous street grid, 4 blocks wide, made of six
// neighbourhoods of 4 x 4 blocks stacked north to south (Harlem at the
// top, the Financial District at the southern tip). Water on the west
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
export const COLS = 4;
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
  tier: PriceTier;
  /** First row (north) of its 4 rows. */
  row0: number;
  blocks: Block[][];
}

export const HOODS: Hood[] = [
  {
    name: 'Harlem',
    tier: 'harlem',
    row0: 0,
    blocks: [
      [homes("Strivers' Row", 'town'), rect('block-harlem-r90', 'Lenox Avenue', 'Shops'), ads('Ad block · 125th St'), homes('Sugar Hill Cottages', 'tiny')],
      [mark('Apollo Theater'), rect('block-rowhouses-r90', 'Harlem Brownstones', 'Apartments'), homes('Mount Morris Homes', 'mix2'), rect('block-harlem-r270', '125th Street Shops', 'Shops')],
      [play('Marcus Garvey Playground'), homes('Hamilton Terrace', 'tiny'), sq('sq-walkups-r0', 'Convent Avenue Walk-ups', 'Apartments', 'subway'), ads('Ad block · Malcolm X Blvd')],
      [homes('Riverside Villas', 'villa'), gym('Harlem Gym & Pool'), homes('Lenox Townhouses', 'town'), ads('Ad block · 116th St')],
    ],
  },
  {
    name: 'Upper Manhattan & Central Park',
    tier: 'uptown',
    row0: 4,
    blocks: [
      [homes('Riverside Mansions', 'mansion'), CP, CP, homes('Fifth Avenue Villas', 'villa')],
      [rect('block-rowhouses-r270', 'Upper West Side', 'Apartments'), CP, CP, sq('sq-midtown-r90', 'Museum Mile', 'Offices')],
      [ads('Ad block · Columbus Ave'), CP, CP, homes('Park Avenue Mansions', 'mansion')],
      [homes('West 72nd Street Homes', 'mix1'), CP, CP, ads('Ad block · Madison Ave')],
    ],
  },
  {
    name: 'Midtown',
    tier: 'midtown',
    row0: 8,
    blocks: [
      [rect('block-midtown-r90', 'Rockefeller Plaza', 'Offices'), ads('Times Square Ads'), mark('Times Square'), rect('block-mixed-r270', 'Broadway Shops', 'Shops')],
      [ads('Ad block · 42nd St'), mark('Empire State Building'), sq('sq-midtown-r0', 'Bryant Park Towers', 'Offices', 'subway'), homes('Sutton Place Mansions', 'mansion')],
      [rect('block-midtown-r270', "Hell's Kitchen Towers", 'Offices'), play('Bryant Park'), sq('sq-fidi-r90', 'Grand Central Offices', 'Offices'), ads('Ad block · Lexington Ave')],
      [homes('Murray Hill Villas', 'villa'), gym('Midtown Gym & Pool'), rect('block-soho-r180', 'Herald Square Shops', 'Shops'), homes('Kips Bay Homes', 'mix1')],
    ],
  },
  {
    name: 'Chelsea & the Village',
    tier: 'downtown',
    row0: 12,
    blocks: [
      [rect('block-rowhouses-r90', 'Chelsea Rows', 'Apartments'), homes('West Chelsea Townhouses', 'town'), ads('Ad block · 23rd St'), rect('block-mixed-r90', 'Union Square Shops', 'Shops')],
      [play('High Line Playground'), mark('Washington Square Arch'), sq('sq-soho-r0', 'Bleecker Street', 'Shops', 'subway'), homes('East Village Cottages', 'tiny')],
      [homes('West Village Homes', 'mix2'), ads('Ad block · 14th St'), rect('block-harlem-r270', 'St Marks Place', 'Shops'), gym('Village Gym & Pool')],
      [sq('sq-walkups-r90', 'Greenwich Walk-ups', 'Apartments'), homes('Bedford Street Townhouses', 'town'), rect('block-soho-r0', 'Astor Place', 'Shops'), ads('Ad block · Houston St')],
    ],
  },
  {
    name: 'SoHo & Tribeca',
    tier: 'downtown',
    row0: 16,
    blocks: [
      [rect('block-soho-r0', 'SoHo Lofts', 'Shops'), homes('Tribeca Villas', 'villa'), ads('Ad block · Canal St'), sq('sq-mixed-r0', 'Chinatown Market', 'Shops', 'subway')],
      [ads('Ad block · Spring St', ['BIG APPLE PIZZA', null]), rect('block-mixed-r270', 'Broadway Boutiques', 'Shops'), homes('Little Italy Homes', 'mix3'), rect('block-rowhouses-r270', 'Lower East Side', 'Apartments')],
      [homes('Tribeca Mansions', 'mansion'), play('Hudson Square Playground'), sq('sq-soho-r0', 'Mercer Street', 'Apartments'), homes('Orchard Street Townhouses', 'town')],
      [rect('block-harlem-r90', 'Canal Street Shops', 'Shops'), gym('SoHo Gym & Pool'), ads('Ad block · Lafayette St'), homes('Mulberry Cottages', 'tiny')],
    ],
  },
  {
    name: 'Financial District',
    tier: 'downtown',
    row0: 20,
    blocks: [
      [sq('sq-fidi-r0', 'Liberty Street', 'Offices'), ads('Ad block · Cortlandt St'), homes('Greenwich Street Homes', 'mix1'), sq('sq-mixed-r0', 'Fulton Street', 'Shops', 'subway')],
      [mark('One World Trade Center'), rect('block-midtown-r270', 'Vesey Towers', 'Offices'), sq('sq-soho-r0', 'John Street Lofts', 'Apartments'), homes('Gold Street Townhouses', 'town')],
      [ads('Ad block · Rector St'), play('Zuccotti Playground'), gym('Downtown Gym & Pool'), homes('Pearl Street Villas', 'villa')],
      [mark('Wall Street · Stock Exchange'), sq('sq-walkups-r0', 'Stone Street Walk-ups', 'Apartments'), homes('Water Street Cottages', 'tiny'), ads('Ad block · Battery Pl')],
    ],
  },
];

export const ROWS = HOODS.length * 4;
/** The whole street grid, outer roads included. */
export const GRID_W = COLS * PITCH_X + ROAD;
export const GRID_D = ROWS * PITCH_Z + ROAD;

/** West/north corner of block (c, r). */
export const cellX = (c: number) => ROAD + c * PITCH_X;
export const cellZ = (r: number) => ROAD + r * PITCH_Z;

export function blockAt(c: number, r: number): Block {
  const h = HOODS[Math.floor(r / 4)];
  return h.blocks[r - h.row0][c];
}
export const hoodOfRow = (r: number): Hood => HOODS[Math.max(0, Math.min(HOODS.length - 1, Math.floor(r / 4)))];
export const hoodAtZ = (z: number): Hood => hoodOfRow(Math.floor((z - ROAD / 2) / PITCH_Z));

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
