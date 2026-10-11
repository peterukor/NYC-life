// =====================================================================
// neighborhoods.ts — the big neighbourhood names written on the maps
// (flat map and the sky view). A handful per borough on purpose, so the
// map never gets crowded. Real coordinates (world/geo-proj.ts places them).
// =====================================================================

import type { BoroughId } from '../world/geo-proj.ts';

export interface Hood {
  borough: BoroughId;
  name: string;
  at: [number, number];
}

export const HOODS: Hood[] = [
  // Manhattan
  { borough: 'manhattan', name: 'Harlem', at: [40.8116, -73.9465] },
  { borough: 'manhattan', name: 'Upper West Side', at: [40.787, -73.9754] },
  { borough: 'manhattan', name: 'Upper East Side', at: [40.7736, -73.9566] },
  { borough: 'manhattan', name: 'Hell’s Kitchen', at: [40.7638, -73.9918] },
  { borough: 'manhattan', name: 'Midtown', at: [40.7549, -73.984] },
  { borough: 'manhattan', name: 'Hudson Yards', at: [40.7536, -74.001] },
  { borough: 'manhattan', name: 'Chelsea', at: [40.7465, -74.0014] },
  { borough: 'manhattan', name: 'Greenwich Village', at: [40.7336, -74.0027] },
  { borough: 'manhattan', name: 'Financial District', at: [40.7075, -74.0113] },
  // Brooklyn
  { borough: 'brooklyn', name: 'DUMBO', at: [40.7033, -73.9881] },
  { borough: 'brooklyn', name: 'Brooklyn Heights', at: [40.696, -73.9936] },
  { borough: 'brooklyn', name: 'Downtown Brooklyn', at: [40.6928, -73.9875] },
  { borough: 'brooklyn', name: 'Fort Greene', at: [40.6892, -73.9742] },
  { borough: 'brooklyn', name: 'Williamsburg', at: [40.7081, -73.9571] },
  { borough: 'brooklyn', name: 'Bed-Stuy', at: [40.6872, -73.9418] },
  { borough: 'brooklyn', name: 'Park Slope', at: [40.671, -73.9814] },
  { borough: 'brooklyn', name: 'Red Hook', at: [40.6755, -74.011] },
  { borough: 'brooklyn', name: 'Coney Island', at: [40.5755, -73.9707] },
];
