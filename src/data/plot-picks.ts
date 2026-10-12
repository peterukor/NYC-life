// =====================================================================
// plot-picks.ts — which street blocks become AD BLOCKS and which become
// HOME BLOCKS (pre-built houses players rent), decided once at start-up.
//
// Spread by NEIGHBOURHOOD (Peter, 2026-10-12: "they seem to all be in
// Harlem"): every neighbourhood gets its own share of ad blocks and home
// blocks, so they show up all over the borough, not in one corner.
//
// This runs BEFORE the places (shops, bars, landmarks…) are snapped to
// blocks (data/places.ts), so a block picked here is kept clear and the
// places simply use the blocks next door. A block with a whole-block
// landmark standing on it (Empire State, Chrysler…) is never picked, nor
// are Times Square and its neighbours.
//
// Same seed = same picks every time; admins can still override single
// blocks in data/plots.ts (PLOT_OVERRIDES).
// =====================================================================

import type { AreaId } from '../sim/types.ts';
import { blockRect, DISTRICTS, SIDEWALK, type DistrictDef, type Rect } from '../world/layout.ts';
import { project } from '../world/geo-proj.ts';
import { onCorridor } from '../world/corridors.ts';
import { HOODS } from './neighborhoods.ts';

/** What a home block is built with (houses are already standing; players rent them). */
export type HomeTemplate = 'tiny' | 'townhouse' | 'villa' | 'mansion' | 'mix';

/**
 * How many ad blocks and home blocks each neighbourhood gets. A block
 * holds 2 ads (its left and right half) or a row of houses on each side.
 * Missing names use DEFAULT_SHARE.
 */
const SHARE: Record<string, { ads: number; homes: number }> = {
  Harlem: { ads: 2, homes: 3 },
  'Upper West Side': { ads: 2, homes: 2 },
  'Upper East Side': { ads: 2, homes: 2 },
  'Hell’s Kitchen': { ads: 2, homes: 1 },
  Midtown: { ads: 2, homes: 0 },
  'Hudson Yards': { ads: 1, homes: 0 },
  Chelsea: { ads: 2, homes: 1 },
  'Greenwich Village': { ads: 2, homes: 2 },
  'Financial District': { ads: 1, homes: 0 },
};
const DEFAULT_SHARE = { ads: 2, homes: 2 };
/** Boroughs with no neighbourhood names yet: one share for the whole borough. */
const WHOLE_AREA_SHARE = { ads: 8, homes: 6 };

/** Which kinds of houses each neighbourhood likes (weights). */
const HOME_MIX: Record<string, [HomeTemplate, number][]> = {
  Harlem: [['tiny', 3], ['townhouse', 4], ['mix', 3], ['villa', 1]],
  'Upper West Side': [['townhouse', 3], ['villa', 2], ['mansion', 2], ['mix', 1]],
  'Upper East Side': [['mansion', 3], ['villa', 3], ['townhouse', 2]],
  'Greenwich Village': [['townhouse', 4], ['tiny', 2], ['mix', 2]],
};
const DEFAULT_MIX: [HomeTemplate, number][] = [['tiny', 2], ['townhouse', 3], ['villa', 2], ['mansion', 1], ['mix', 3]];

/** A stable 0..1 number for a string (the "random" order of picks). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

const hoodPoints = new Map<string, { name: string; x: number; z: number }[]>();
/** The neighbourhood a point belongs to (nearest neighbourhood label), or null if the borough has none. */
export function hoodAt(d: DistrictDef, x: number, z: number): string | null {
  let list = hoodPoints.get(d.borough);
  if (!list) {
    list = HOODS.filter((h) => h.borough === d.borough).map((h) => ({ name: h.name, ...project(h.at[0], h.at[1]) }));
    hoodPoints.set(d.borough, list);
  }
  if (!list.length) return null;
  return list.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a)).name;
}

const templates = new Map<string, HomeTemplate>();
/** The house mix of a home block (fixed per block). */
export function homeTemplate(d: DistrictDef, c: number, r: number): HomeTemplate {
  const t = templates.get(`${d.id}:${c},${r}`);
  if (t) return t;
  // Not one of the picked blocks (an admin override): go by the neighbourhood.
  const b = blockRect(d, c, r);
  const hood = hoodAt(d, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2) ?? '';
  const mix = HOME_MIX[hood] ?? DEFAULT_MIX;
  const total = mix.reduce((s, [, w]) => s + w, 0);
  let k = hash01(`${d.id}:${c},${r}:home`) * total;
  for (const [m, w] of mix) if ((k -= w) <= 0) return m;
  return mix[0][0];
}

/**
 * Give every home block of an area its house mix: the four house kinds
 * and the mixed street are dealt out in turn (so every borough has all of
 * them), most expensive first where the neighbourhood is posh.
 */
function dealTemplates(d: DistrictDef): void {
  const blocks: { c: number; r: number; key: number; posh: number }[] = [];
  for (let c = 0; c < d.cols; c++) {
    for (let r = 0; r < d.rows; r++) {
      if (d.kind(c, r) !== 'lot') continue;
      const b = blockRect(d, c, r);
      const hood = hoodAt(d, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2) ?? '';
      const mix = HOME_MIX[hood] ?? DEFAULT_MIX;
      const posh = mix.reduce((s, [m, w]) => s + w * { tiny: 0, townhouse: 1, mix: 1, villa: 2, mansion: 3 }[m], 0) / mix.reduce((s, [, w]) => s + w, 0);
      blocks.push({ c, r, key: hash01(`${d.id}:${c},${r}:deal`), posh });
    }
  }
  // Posh neighbourhoods first, so they get the mansions and villas.
  blocks.sort((a, b) => b.posh - a.posh || a.key - b.key);
  const deck: HomeTemplate[] = ['mansion', 'villa', 'townhouse', 'mix', 'tiny'];
  blocks.forEach((b, i) => templates.set(`${d.id}:${b.c},${b.r}`, deck[i % deck.length]));
}

/** Smallest land an ad block or home block may have after trimming (m, inside the sidewalk). */
const MIN_W = 84;
const MIN_D = 56;
const landCache = new Map<string, Rect | null>();

/**
 * The usable land of a block (inside its sidewalk) once the highway or
 * Broadway is kept off it: where a corridor clips an edge, that side moves
 * in a few metres at a time until the road is clear. A road through the
 * middle (or too little left) gives null. Ad panels and houses use this.
 */
export function plotLand(d: DistrictDef, c: number, r: number): Rect | null {
  const key = `${d.id}:${c},${r}`;
  if (landCache.has(key)) return landCache.get(key)!;
  const b = blockRect(d, c, r);
  const q = { minX: b.minX + SIDEWALK, maxX: b.maxX - SIDEWALK, minZ: b.minZ + SIDEWALK, maxZ: b.maxZ - SIDEWALK };
  const hits = (x: number, z: number) => !!onCorridor(d.id, x, z, 1);
  // Count corridor samples along each side (a 2 m band just inside it).
  const band = (side: 'w' | 'e' | 'n' | 's') => {
    let n = 0;
    const along = side === 'w' || side === 'e' ? [q.minZ, q.maxZ] : [q.minX, q.maxX];
    const steps = Math.max(2, Math.ceil((along[1] - along[0]) / 6));
    for (let i = 0; i <= steps; i++) {
      const t = along[0] + ((along[1] - along[0]) * i) / steps;
      if (side === 'w' && hits(q.minX + 1, t)) n++;
      if (side === 'e' && hits(q.maxX - 1, t)) n++;
      if (side === 'n' && hits(t, q.minZ + 1)) n++;
      if (side === 's' && hits(t, q.maxZ - 1)) n++;
    }
    return n;
  };
  let out: Rect | null = q;
  for (let guard = 0; guard < 80; guard++) {
    const m = { w: band('w'), e: band('e'), n: band('n'), s: band('s') };
    const side = (Object.keys(m) as (keyof typeof m)[]).reduce((a, k) => (m[k] > m[a] ? k : a));
    if (m[side] === 0) {
      // Edges are clear: make sure nothing crosses the middle either.
      for (let x = q.minX + 4; x < q.maxX && out; x += 8) for (let z = q.minZ + 4; z < q.maxZ; z += 8) if (hits(x, z)) { out = null; break; }
      break;
    }
    if (side === 'w') q.minX += 4;
    if (side === 'e') q.maxX -= 4;
    if (side === 'n') q.minZ += 4;
    if (side === 's') q.maxZ -= 4;
    if (q.maxX - q.minX < MIN_W || q.maxZ - q.minZ < MIN_D) {
      out = null;
      break;
    }
  }
  landCache.set(key, out);
  return out;
}

let done = false;

/**
 * Turn some ordinary building blocks into ad blocks and home blocks.
 * `busy` = real locations of every place (they keep their blocks).
 */
export function pickPlotBlocks(busy: { area: AreaId; x: number; z: number }[]): void {
  if (done) return;
  done = true;
  for (const d of Object.values(DISTRICTS)) {
    const pts = busy.filter((p) => p.area === d.id);
    type Cand = { c: number; r: number; hood: string; key: number };
    const byHood = new Map<string, Cand[]>();
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        if (d.kind(c, r) !== 'buildings') continue;
        if (Math.abs(c - d.hub.c) <= 1 && Math.abs(r - d.hub.r) <= 1) continue;
        const b = blockRect(d, c, r);
        if (pts.some((p) => p.x > b.minX - 8 && p.x < b.maxX + 8 && p.z > b.minZ - 8 && p.z < b.maxZ + 8)) continue;
        // Shore blocks cut by the river or clipped by the highway are fine
        // if enough land is left once the road is kept off.
        if (!plotLand(d, c, r)) continue;
        const hood = hoodAt(d, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2) ?? '*';
        if (!byHood.has(hood)) byHood.set(hood, []);
        byHood.get(hood)!.push({ c, r, hood, key: hash01(`${d.id}:${c},${r}:pick`) });
      }
    }
    const picked: { c: number; r: number }[] = [];
    // Never two picked blocks side by side, so ads and homes stay spread out.
    const clear = (f: Cand) => !picked.some((p) => Math.abs(p.c - f.c) + Math.abs(p.r - f.r) <= 1);
    for (const [hood, list] of byHood) {
      list.sort((a, b) => a.key - b.key);
      const share = hood === '*' ? WHOLE_AREA_SHARE : SHARE[hood] ?? DEFAULT_SHARE;
      let ads = 0;
      let homes = 0;
      for (const f of list) {
        if (!clear(f)) continue;
        // Alternate so both kinds get blocks even in a small neighbourhood.
        const wantAd = ads < share.ads && (homes >= share.homes || ads <= homes);
        if (wantAd) {
          d.setKind(f.c, f.r, 'ads');
          ads++;
        } else if (homes < share.homes) {
          d.setKind(f.c, f.r, 'lot');
          homes++;
        } else break;
        picked.push(f);
      }
    }
    dealTemplates(d);
  }
}
