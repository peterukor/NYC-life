// =====================================================================
// plan.ts — the layout of one neighbourhood: Downtown, 4 x 4 blocks.
//
// Every block is the same size (90 m east-west x 60 m north-south) with
// 16 m roads between and around them, so any block picture fits any
// block. The recipe for Downtown (agreed with Peter): 2 landmarks,
// 3 ad blocks, 4 home blocks, 3 shops/offices, 2 empty lots, 1 gym,
// 1 park. Water on the west and south sides.
// =====================================================================

export const CELL_W = 90;
export const CELL_D = 60;
export const ROAD = 16;
export const COLS = 4;
export const ROWS = 4;
export const PITCH_X = CELL_W + ROAD;
export const PITCH_Z = CELL_D + ROAD;
/** The whole street grid, outer roads included. */
export const GRID_W = COLS * PITCH_X + ROAD;
export const GRID_D = ROWS * PITCH_Z + ROAD;
/** Waterfront walkway width beyond the outer road (west and south). */
export const PROMENADE = 14;

export type HouseKind = 'tiny' | 'townhouse' | 'villa' | 'mansion';
/**
 * A plot on a home block: 8 spaces across (c 0-7) and 2 rows deep
 * (r 0 = north row, 1 = south row). house null = empty, for rent.
 */
export interface HomePlot {
  c: number;
  r: number;
  w: number;
  h: number;
  house: HouseKind | null;
}
/** Spaces a house takes: across x deep. Villas and mansions use both rows. */
export const HOUSE_SIZE: Record<HouseKind, [number, number]> = { tiny: [1, 1], townhouse: [2, 1], villa: [2, 2], mansion: [4, 2] };

export type Block =
  | { kind: 'model'; sprite: string; name: string; use: 'Offices' | 'Shops' | 'Apartments' }
  | { kind: 'homes'; name: string; plots: HomePlot[] }
  | { kind: 'ads'; name: string; rented: [string | null, string | null] }
  | { kind: 'lot'; name: string }
  | { kind: 'park'; name: string }
  | { kind: 'gym'; name: string }
  | { kind: 'landmark'; name: string };

/** A home block: the houses at (column, row); every other space is an empty plot. */
function homes(name: string, houses: [number, number, HouseKind][]): Block {
  const used = new Set<string>();
  const plots: HomePlot[] = houses.map(([c, r, house]) => {
    const [w, h] = HOUSE_SIZE[house];
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) used.add(`${c + i},${r + j}`);
    return { c, r, w, h, house };
  });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) if (!used.has(`${c},${r}`)) plots.push({ c, r, w: 1, h: 1, house: null });
  return { kind: 'homes', name, plots };
}

/** Row 0 is the north (inland) edge, column 0 the west (water) edge. */
export const DOWNTOWN: Block[][] = [
  [
    { kind: 'model', sprite: 'block-fidi-r90', name: 'Liberty Street', use: 'Offices' },
    { kind: 'ads', name: 'Ad block · Cortlandt St', rented: [null, null] },
    homes('Greenwich Homes', [[0, 0, 'mansion'], [4, 0, 'villa'], [6, 0, 'townhouse'], [6, 1, 'tiny'], [7, 1, 'tiny']]),
    { kind: 'model', sprite: 'block-mixed-r270', name: 'Fulton Shops', use: 'Shops' },
  ],
  [
    { kind: 'landmark', name: 'One World Trade Center' },
    { kind: 'model', sprite: 'block-midtown-r270', name: 'Vesey Towers', use: 'Offices' },
    { kind: 'model', sprite: 'block-rowhouses-r90', name: 'John Street Rows', use: 'Apartments' },
    { kind: 'lot', name: 'Empty lot · Gold St' },
  ],
  [
    { kind: 'ads', name: 'Ad block · Rector St', rented: ['BIG APPLE PIZZA', null] },
    { kind: 'park', name: 'Zuccotti Park' },
    { kind: 'gym', name: 'Downtown Gym & Pool' },
    homes('Pearl Street Homes', [[0, 0, 'villa'], [2, 0, 'tiny'], [4, 0, 'tiny'], [5, 0, 'tiny'], [2, 1, 'townhouse'], [4, 1, 'tiny'], [6, 1, 'townhouse']]),
  ],
  [
    { kind: 'landmark', name: 'Wall Street · Stock Exchange' },
    { kind: 'model', sprite: 'block-walkups-r90', name: 'Stone Street Walk-ups', use: 'Apartments' },
    { kind: 'lot', name: 'Empty lot · Water St' },
    { kind: 'ads', name: 'Ad block · Battery Pl', rented: [null, null] },
  ],
];

/** West/north corner of block (c, r). */
export const cellX = (c: number) => ROAD + c * PITCH_X;
export const cellZ = (r: number) => ROAD + r * PITCH_Z;

/** Which block a ground point is on, if any. */
export function cellAt(x: number, z: number): { c: number; r: number } | null {
  const c = Math.floor((x - ROAD) / PITCH_X);
  const r = Math.floor((z - ROAD) / PITCH_Z);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
  if (x - cellX(c) > CELL_W || z - cellZ(r) > CELL_D) return null;
  return { c, r };
}

/** Size of one home space (8 across, 2 rows deep, inside a 3 m sidewalk). */
export const SPACE_W = (CELL_W - 6) / 8;
export const SPACE_D = (CELL_D - 6) / 2;

/** The home plot at a point inside a home block (local metres from its NW corner). */
export function plotAt(plots: HomePlot[], lx: number, lz: number): HomePlot | undefined {
  const c = Math.floor((lx - 3) / SPACE_W);
  const r = Math.floor((lz - 3) / SPACE_D);
  return plots.find((p) => c >= p.c && c < p.c + p.w && r >= p.r && r < p.r + p.h);
}
