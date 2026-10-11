// =====================================================================
// plots.ts — land players can RENT with real money (Peter, 2026-10-11).
//
// Three kinds of plot:
//   • AD BLOCK  — a street block split into 4 billboard units. Rent 1 to
//                 4 units, 1 to 26 weeks. No limit per player.
//   • HOME LOT  — empty land. Pick a house type from HOUSES and rent the
//                 lot with it, up to 6 months. 3 per borough per player.
//   • ISLAND    — a whole island. The renter writes to the admin team
//                 saying what they want there (a house, a giant ad…).
//
// Nothing is ever owned forever: the longest rental is 6 months, so no
// one can buy everything and sit on it. Ads and homes never share land.
//
// Prices are REAL MONEY in US dollars (not in-game cents). Payments need
// the server (later phase): until then the rent screens save a request.
//
// HOW TO CHANGE THINGS (admin):
//   • Prices: AD_PRICES, HOUSES, TIER_MULT, ISLANDS below.
//   • Turn any block into an ad block / home lot / back to buildings, or
//     mark it for auction: add its id to PLOT_OVERRIDES. Block ids look
//     like "manhattan:-56,-226" (the block's west avenue line and north
//     street line); the map's plot panel shows the id of every plot.
//   • Auctions are started by hand: set `auction: true` on the plot.
// =====================================================================

import type { AreaId } from '../sim/types.ts';
import { blockRect, crossStreets, DISTRICTS, manhattanStreetAt, type BlockKind, type DistrictDef } from '../world/layout.ts';
import { outline, pointInRing, project, type BoroughId, type XZ } from '../world/geo-proj.ts';
import { FULL_BLOCK_LANDMARKS, PLACES } from './places.ts';
import { lotsFor } from '../world/coast.ts';
import { rectOnCorridor } from '../world/corridors.ts';

export type PlotKind = 'ad' | 'home' | 'island';
/** Location decides the price. */
export type PriceTier = 'harlem' | 'uptown' | 'midtown' | 'downtown' | 'brooklyn';

export interface Plot {
  id: string;
  kind: PlotKind;
  area: AreaId;
  borough: BoroughId;
  /** "Malcolm X Blvd & W 128th St", or the island's name. */
  name: string;
  /** Grid block (ad blocks and grid home lots). */
  block?: [number, number];
  /** Land rect (blocks and lots) — islands use `ring`. */
  rect?: { minX: number; maxX: number; minZ: number; maxZ: number };
  ring?: XZ[];
  center: { x: number; z: number };
  tier: PriceTier;
  /** Island price for the full 6 months (USD). */
  islandPrice?: number;
  /** The admin has put this plot up for auction (started by hand). */
  auction?: boolean;
}

// ---------------------------------------------------------------- prices (USD)
/** Ad units: price per WEEK for one unit, and for the whole block (all 4). */
export const AD_PRICES: Record<PriceTier, { unit: number; block: number }> = {
  // Peter, 2026-10-11: one unit $59.99 a week, a whole block $219.99 a week,
  // everywhere for now. Change a tier here to price an area differently.
  harlem: { unit: 59.99, block: 219.99 },
  uptown: { unit: 59.99, block: 219.99 },
  downtown: { unit: 59.99, block: 219.99 },
  brooklyn: { unit: 59.99, block: 219.99 },
  midtown: { unit: 59.99, block: 219.99 },
};
export const AD_MAX_WEEKS = 26; // 6 months
export const AD_UNITS = 4;

/** House types you can put on a lot: the 6-month price in the cheapest area. */
export const HOUSES = [
  { id: 'tiny', name: 'Tiny home', emoji: '🛖', blurb: 'One room, big windows, a porch.', price6mo: 199.99 },
  { id: 'townhouse', name: 'Townhouse', emoji: '🏘️', blurb: 'Classic stoop, three floors.', price6mo: 249.99 },
  { id: 'modern', name: 'Modern villa', emoji: '🏡', blurb: 'Glass, a roof deck and a garden.', price6mo: 329.99 },
  { id: 'mansion', name: 'Mansion', emoji: '🏰', blurb: 'Pool, gates, the works.', price6mo: 499.99 },
] as const;
export type HouseId = (typeof HOUSES)[number]['id'];
/** Rental lengths (months) and the share of the 6-month price each costs. */
export const HOME_TERMS: { months: number; share: number }[] = [
  { months: 1, share: 0.22 },
  { months: 3, share: 0.58 },
  { months: 6, share: 1 },
];
/** Location multiplier for houses. */
export const TIER_MULT: Record<PriceTier, number> = { harlem: 1, brooklyn: 1.1, uptown: 1.15, downtown: 1.3, midtown: 1.4 };
/** Most homes one player can rent in one borough. */
export const HOMES_PER_BOROUGH = 3;

/** Whole islands, 6 months (rings of the Manhattan outline, found by a point on them). */
export const ISLANDS: { id: string; name: string; at: [number, number]; price: number }[] = [
  { id: 'randalls', name: 'Randall’s Island', at: [40.7932, -73.9213], price: 274.99 },
  { id: 'governors', name: 'Governors Island', at: [40.6894, -74.0168], price: 299.99 },
  { id: 'roosevelt', name: 'Roosevelt Island', at: [40.7614, -73.9502], price: 249.99 },
];

/** Round to a price ending in .99 */
const p99 = (v: number) => Math.max(0.99, Math.round(v) - 0.01);
export function homePrice(tier: PriceTier, house: HouseId, months: number): number {
  const h = HOUSES.find((x) => x.id === house)!;
  const t = HOME_TERMS.find((x) => x.months === months) ?? HOME_TERMS[HOME_TERMS.length - 1];
  return p99(h.price6mo * TIER_MULT[tier] * t.share);
}
/** Ad price: whole block rate for 4 units, otherwise per unit. */
export function adPrice(tier: PriceTier, units: number, weeks: number): number {
  const p = AD_PRICES[tier];
  const perWeek = units >= AD_UNITS ? p.block : p.unit * units;
  return Math.round(perWeek * weeks * 100) / 100;
}

// ---------------------------------------------------------------- admin overrides
/**
 * Admin edits: turn a block into an ad block ('ad'), a home lot ('home')
 * or back into ordinary buildings ('buildings'); flag auctions. Applied
 * on top of the random picks below. (Later this list comes from the server.)
 */
export const PLOT_OVERRIDES: Record<string, { kind?: 'ad' | 'home' | 'buildings'; auction?: boolean }> = {
  // 'manhattan:-56,-226': { kind: 'ad', auction: true },
};

/** How many random ad blocks / extra home lots each area gets. */
const PICKS: Record<AreaId, { ads: number; harlemLots: number; lots: number }> = {
  manhattan: { ads: 20, harlemLots: 0.3, lots: 6 },
  brooklyn: { ads: 0, harlemLots: 0, lots: 0 }, // Brooklyn gets its plots when its streets are redone
};

// ---------------------------------------------------------------- building the list
export const blockId = (d: DistrictDef, c: number, r: number) => `${d.id}:${d.xs[c]},${d.zs[r]}`;

function tierAt(d: DistrictDef, z: number): PriceTier {
  if (d.id !== 'manhattan') return 'brooklyn';
  const n = manhattanStreetAt(z);
  if (z > 500) return 'downtown';
  if (n > 110) return 'harlem';
  if (n >= 30 && n <= 59) return 'midtown';
  return 'uptown';
}

/** A stable 0..1 number per block id (the "random" order of picks). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

function build(): Plot[] {
  const out: Plot[] = [];
  for (const d of Object.values(DISTRICTS)) {
    const pick = PICKS[d.id];
    // Blocks we must not touch: anything with a place on it, the hub and
    // its neighbours, whole-block landmarks.
    const busy = new Set(PLACES.filter((p) => p.area === d.id).map((p) => `${p.block[0]},${p.block[1]}`));
    for (const p of PLACES) if (p.area === d.id && FULL_BLOCK_LANDMARKS.has(p.id)) busy.add(`${p.block[0]},${p.block[1]}`);
    const free: { c: number; r: number; id: string; x: number; z: number }[] = [];
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        if (d.kind(c, r) !== 'buildings' || busy.has(`${c},${r}`)) continue;
        if (Math.abs(c - d.hub.c) <= 1 && Math.abs(r - d.hub.r) <= 1) continue;
        const b = blockRect(d, c, r);
        // Keep ad blocks and lots off Broadway and the highway.
        if (rectOnCorridor(d.id, { minX: b.minX + 6, maxX: b.maxX - 6, minZ: b.minZ + 6, maxZ: b.maxZ - 6 })) continue;
        free.push({ c, r, id: blockId(d, c, r), x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 });
      }
    }
    free.sort((a, b) => hash01(`${a.id}-ad`) - hash01(`${b.id}-ad`));
    // 1. Ad blocks: spread out (at least 190 m apart). Every other pick
    // brings its next-door block along when it's free, so there are pairs
    // side by side that a renter of both can MERGE into one giant board.
    const ads: typeof free = [];
    const freeAt = new Map(free.map((f) => [`${f.c},${f.r}`, f]));
    for (const f of free) {
      if (ads.length >= pick.ads) break;
      if (ads.some((a) => Math.hypot(a.x - f.x, a.z - f.z) < 190)) continue;
      ads.push(f);
      if (ads.length % 2 === 0 || ads.length >= pick.ads) continue;
      const mate = [freeAt.get(`${f.c + 1},${f.r}`), freeAt.get(`${f.c - 1},${f.r}`), freeAt.get(`${f.c},${f.r + 1}`), freeAt.get(`${f.c},${f.r - 1}`)].find((m) => m && !ads.includes(m));
      if (mate) ads.push(mate);
    }
    for (const a of ads) d.setKind(a.c, a.r, 'ads');
    // 2. Home lots: a share of Harlem's blocks, plus a few anywhere else
    // (picked in a fixed shuffled order, so it's the same every time).
    const left = free.filter((f) => d.kind(f.c, f.r) === 'buildings').sort((x, y) => hash01(`${x.id}-lot`) - hash01(`${y.id}-lot`));
    const isHarlem = (f: (typeof free)[number]) => d.id === 'manhattan' && manhattanStreetAt(f.z) > 110;
    const harlem = left.filter(isHarlem);
    for (const f of harlem.slice(0, Math.max(pick.harlemLots ? 4 : 0, Math.round(harlem.length * pick.harlemLots)))) d.setKind(f.c, f.r, 'lot');
    for (const f of left.filter((f) => !isHarlem(f)).slice(0, pick.lots)) d.setKind(f.c, f.r, 'lot');
    // 3. Admin overrides win.
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        const o = PLOT_OVERRIDES[blockId(d, c, r)];
        if (!o?.kind || busy.has(`${c},${r}`) || d.kind(c, r) === 'water') continue;
        d.setKind(c, r, ({ ad: 'ads', home: 'lot', buildings: 'buildings' } as Record<string, BlockKind>)[o.kind]);
      }
    }
    // 4. The plot list: every ad block and every grid lot.
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        const k = d.kind(c, r);
        if (k !== 'ads' && k !== 'lot') continue;
        const rect = blockRect(d, c, r);
        const center = { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
        const id = blockId(d, c, r);
        out.push({ id, kind: k === 'ads' ? 'ad' : 'home', area: d.id, borough: d.borough, name: crossStreets(d, center.x, center.z), block: [c, r], rect, center, tier: tierAt(d, center.z), auction: PLOT_OVERRIDES[id]?.auction });
      }
    }
  }
  // 5. The expandable lots around the playable streets are home lots too.
  for (const d of Object.values(DISTRICTS)) {
    for (const l of lotsFor(d)) {
      if (l.grid) continue; // already listed as a block above
      const rect = { minX: l.x0, maxX: l.x1, minZ: l.z0, maxZ: l.z1 };
      const center = { x: (l.x0 + l.x1) / 2, z: (l.z0 + l.z1) / 2 };
      const id = `${d.id}:lot:${Math.round(l.x0)},${Math.round(l.z0)}`;
      out.push({ id, kind: 'home', area: d.id, borough: d.borough, name: crossStreets(d, center.x, center.z), rect, center, tier: tierAt(d, center.z), auction: PLOT_OVERRIDES[id]?.auction });
    }
  }
  // 6. Islands.
  for (const isl of ISLANDS) {
    const p = project(isl.at[0], isl.at[1]);
    const ring = outline('manhattan').find((r) => pointInRing(p.x, p.z, r));
    if (!ring) continue;
    const cx = ring.reduce((s, q) => s + q.x, 0) / ring.length;
    const cz = ring.reduce((s, q) => s + q.z, 0) / ring.length;
    const id = `island:${isl.id}`;
    out.push({ id, kind: 'island', area: 'manhattan', borough: 'manhattan', name: isl.name, ring, center: { x: cx, z: cz }, tier: 'uptown', islandPrice: isl.price, auction: PLOT_OVERRIDES[id]?.auction });
  }
  return out;
}

/** Every rentable plot (built once, at start-up, before the city is drawn). */
export const PLOTS: Plot[] = build();
export const PLOT_BY_ID: Record<string, Plot> = Object.fromEntries(PLOTS.map((p) => [p.id, p]));

export function plotsIn(area: AreaId): Plot[] {
  return PLOTS.filter((p) => p.area === area);
}

/** The plot on block (c, r), if any. */
export function plotAtBlock(area: AreaId, c: number, r: number): Plot | undefined {
  return PLOTS.find((p) => p.area === area && p.block && p.block[0] === c && p.block[1] === r);
}

/**
 * Plots of the same kind right next door (sharing a street). Someone who
 * rents two side by side can MERGE them: one giant billboard across both
 * ad blocks, or one big estate across two lots.
 */
export function neighbourPlots(p: Plot): Plot[] {
  if (!p.block) return [];
  const [c, r] = p.block;
  return PLOTS.filter((q) => q !== p && q.kind === p.kind && q.area === p.area && q.block && Math.abs(q.block[0] - c) + Math.abs(q.block[1] - r) === 1);
}

/** Which ad unit (0 NW, 1 NE, 2 SW, 3 SE) a point on an ad block is in. */
export function adUnitRects(p: Plot): { minX: number; maxX: number; minZ: number; maxZ: number }[] {
  const r = p.rect!;
  const mx = (r.minX + r.maxX) / 2, mz = (r.minZ + r.maxZ) / 2;
  return [
    { minX: r.minX, maxX: mx, minZ: r.minZ, maxZ: mz },
    { minX: mx, maxX: r.maxX, minZ: r.minZ, maxZ: mz },
    { minX: r.minX, maxX: mx, minZ: mz, maxZ: r.maxZ },
    { minX: mx, maxX: r.maxX, minZ: mz, maxZ: r.maxZ },
  ];
}
