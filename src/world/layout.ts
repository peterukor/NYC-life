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
import { boroughBounds, onLand as onAnyLand, outline, pointInRing, project, unproject, X_STRETCH, type BoroughId, type XZ } from './geo-proj.ts';

/** A hand-placed east–west position (measured at true proportions), stretched with the map (geo-proj X_STRETCH). */
const X = (v: number): number => v * X_STRETCH;
import { Rng } from '../core/rng.ts';
import { MANHATTAN_SHORE } from '../data/geo/manhattan-shore.ts';

export type Zone = 'tall' | 'midrise' | 'brownstone' | 'waterfront';

/**
 * What occupies a block, if it isn't ordinary buildings. 'water' = the
 * block is in the river. 'vacant' = fenced "coming soon" site (Hudson
 * Yards). 'lot' = empty land players rent to put a house on. 'ads' = an
 * ad block: four billboard units players rent (data/plots.ts).
 */
export type BlockKind = 'buildings' | 'plaza' | 'park' | 'vacant' | 'lot' | 'ads' | 'water';

export interface DistrictDef {
  id: AreaId;
  name: string;
  /** Short neighbourhood label shown on the map. */
  tagline: string;
  /** Which real borough this is (world/geo-proj.ts outlines). */
  borough: BoroughId;
  origin: { x: number; z: number };
  /** Avenue centre lines (cols + 1 of them) and street centre lines (rows + 1): NOT evenly spaced. */
  xs: number[];
  zs: number[];
  /** The same street pattern carried across the whole borough (for the lots beyond the grid). */
  allXs: number[];
  allZs: number[];
  /** Is the street between block (c, r) and (c, r + 1) closed (one long block)? */
  joinS: (c: number, r: number) => boolean;
  /** Is the avenue between block (c, r) and (c + 1, r) closed (one wide block)? */
  joinE: (c: number, r: number) => boolean;
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
  /**
   * Change a block's kind. Only data/plots.ts calls this, once, at start-up
   * (it turns some building blocks into home lots and ad blocks).
   */
  setKind: (c: number, r: number, kind: BlockKind) => void;
  /** A block cut down by the river (see trimToLand): its smaller rect, else null. */
  trimmed: (c: number, r: number) => Rect | null;
  /** The bright "Times Square" of this area: where the giant screens cluster. */
  hub: { c: number; r: number; name: string };
  /** Small seed so each area gets its own repeatable building heights. */
  seed: string;
}

export const SIDEWALK = 4;

/**
 * Street blocks only go on a borough's MAIN land (its biggest outline
 * ring): the small islands (Randall's, Roosevelt, Governors) stay open
 * land, rented whole (data/plots.ts).
 */
const mainRing = new Map<BoroughId, XZ[]>();
function onLand(borough: BoroughId, x: number, z: number): boolean {
  let ring = mainRing.get(borough);
  if (!ring) {
    const area = (r: XZ[]) => Math.abs(r.reduce((s, p, i) => s + p.x * r[(i + 1) % r.length].z - r[(i + 1) % r.length].x * p.z, 0));
    ring = outline(borough).reduce((a, b) => (area(b) > area(a) ? b : a));
    mainRing.set(borough, ring);
  }
  return onAnyLand(borough, x, z) && pointInRing(x, z, ring);
}

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

// Blocks are BIG and UNEVEN (Peter, 2026-10-11): real New York blocks are
// not all the same, so every avenue gap and street gap gets its own width
// (seeded, so it's the same every time), and here and there a street or an
// avenue is closed to make a long or wide block. Fewer, larger blocks fill
// more of the map.
// SCALED UP (Peter, 2026-10-12): bigger, chunkier blocks with bigger
// buildings, the cartoon way (SimCity BuildIt / Supercell). Blocks are
// 1.6× deeper (north–south) and 1.1× wider, so each holds about 1.8× the
// land, there are about half as many, and they're deep enough for two
// rows of houses with gardens. Width grows less because the island is
// narrow: much wider and Manhattan would be only three blocks across.
// Roads get only a little wider, so the city reads as blocks, not streets.
export const BLOCK_SCALE = { x: 1.1, z: 1.6 };
const AVE_W = 17;
const ST_W = 16;
const SX = (r: [number, number]): [number, number] => [Math.round(r[0] * BLOCK_SCALE.x), Math.round(r[1] * BLOCK_SCALE.x)];
const SZ = (r: [number, number]): [number, number] => [Math.round(r[0] * BLOCK_SCALE.z), Math.round(r[1] * BLOCK_SCALE.z)];
const COL_RANGE: [number, number] = SX([128, 196]); // avenue-to-avenue
const ROW_RANGE: [number, number] = SZ([62, 104]); // street-to-street

/** Street lines from an anchor outwards both ways, with seeded uneven gaps. */
function lines(anchor: number, from: number, to: number, range: [number, number], seed: string): number[] {
  const rng = new Rng(seed);
  const gap = () => Math.round(rng.range(range[0], range[1]));
  const out = [anchor];
  for (let v = anchor; v > from; ) out.unshift((v -= gap()));
  for (let v = anchor; v < to; ) out.push((v += gap()));
  return out;
}

interface GridSpec {
  borough: BoroughId;
  allXs: number[];
  allZs: number[];
  /** Playable part: indexes into allXs/allZs (line c0 … c1, r0 … r1). */
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

function gridFor(borough: BoroughId, anchor: { x: number; z: number }, play: { minX: number; maxX: number; minZ: number; maxZ: number }, seed: string, colRange = COL_RANGE, rowRange = ROW_RANGE): GridSpec {
  const bb = boroughBounds(borough);
  const allXs = lines(anchor.x, bb.minX - 200, bb.maxX + 200, colRange, `${seed}-x`);
  const allZs = lines(anchor.z, bb.minZ - 200, bb.maxZ + 200, rowRange, `${seed}-z`);
  const near = (arr: number[], v: number) => arr.reduce((bi, a, i) => (Math.abs(a - v) < Math.abs(arr[bi] - v) ? i : bi), 0);
  return { borough, allXs, allZs, c0: near(allXs, play.minX), c1: near(allXs, play.maxX), r0: near(allZs, play.minZ), r1: near(allZs, play.maxZ) };
}

/** Where street blocks may stand (a point test), and how much shore to keep round them. */
type Fits = { at: (x: number, z: number) => boolean; pad: number };
const landFits = (borough: BoroughId): Fits => ({ at: (x, z) => onLand(borough, x, z), pad: 4 });

/**
 * Manhattan's blocks stay inside the ring highway (Peter, 2026-10-12: the
 * highway used to run through blocks). The core polygon is the smoothed
 * island shrunk past the highway, a kerb gap and the street round the block
 * (scripts/build-manhattan-shore.py), so a block inside it never touches
 * the highway or the water.
 */
const MANHATTAN_CORE: XZ[] = MANHATTAN_SHORE.core.map(([x, z]) => ({ x, z }));
const coreFits: Fits = { at: (x, z) => pointInRing(x, z, MANHATTAN_CORE), pad: 0 };

/** Is the whole block between lines (shrunk a little) on land? */
function cellOnLand(fits: Fits, xs: number[], zs: number[], c: number, r: number): boolean {
  const x0 = xs[c] + AVE_W / 2 + 2, x1 = xs[c + 1] - AVE_W / 2 - 2;
  const z0 = zs[r] + ST_W / 2 + 2, z1 = zs[r + 1] - ST_W / 2 - 2;
  const pts: [number, number][] = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1], [x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]];
  return pts.every(([x, z]) => fits.at(x, z));
}

/**
 * A block that is only PARTLY on land (the river cuts a corner off it) is
 * trimmed instead of dropped: its sides move in, a few metres at a time,
 * off the water until the whole block (plus a little shore) is on land.
 * Lower Manhattan is narrow and slanted, so without this most of downtown
 * would be lost. Returns null when too little is left to build on.
 */
function trimToLand(fits: Fits, full: { minX: number; maxX: number; minZ: number; maxZ: number }): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const r = { ...full };
  const STEP = 4, MIN_W = 38, MIN_D = 40, PAD = fits.pad;
  const N = 5;
  for (let guard = 0; guard < 80; guard++) {
    // Count the water samples near each side of the rect (+ a small shore pad).
    const miss = { w: 0, e: 0, n: 0, s: 0 };
    let total = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = r.minX - PAD + ((r.maxX - r.minX + PAD * 2) * i) / (N - 1);
        const z = r.minZ - PAD + ((r.maxZ - r.minZ + PAD * 2) * j) / (N - 1);
        if (fits.at(x, z)) continue;
        total++;
        if (i === 0) miss.w++;
        if (i === N - 1) miss.e++;
        if (j === 0) miss.n++;
        if (j === N - 1) miss.s++;
      }
    }
    if (!total) return r;
    // Move in the side with the most water (sides are weighted by length so
    // a long block loses depth rather than width when it's a tie).
    const side = (Object.keys(miss) as (keyof typeof miss)[]).reduce((a, b) => (miss[b] > miss[a] ? b : a));
    if (miss[side] === 0) return null; // water only in the middle: give up
    if (side === 'w') r.minX += STEP;
    if (side === 'e') r.maxX -= STEP;
    if (side === 'n') r.minZ += STEP;
    if (side === 's') r.maxZ -= STEP;
    if (r.maxX - r.minX < MIN_W || r.maxZ - r.minZ < MIN_D) return null;
  }
  return null;
}

/** Index of the gap containing v (−1 / n if outside). */
function cellOf(arr: number[], v: number): number {
  if (v < arr[0]) return -1;
  for (let i = 0; i < arr.length - 1; i++) if (v < arr[i + 1]) return i;
  return arr.length - 1;
}

/**
 * Seeded joins: close a street (long block) or an avenue (wide block) now
 * and then, never next to another join and never on special blocks.
 */
function makeJoins(cols: number, rows: number, seed: string, ok: (c: number, r: number) => boolean, rate = { s: 0.13, e: 0.08 }) {
  const rng = new Rng(seed);
  const S = new Set<string>();
  const E = new Set<string>();
  const used = new Set<string>();
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (used.has(`${c},${r}`) || !ok(c, r)) continue;
      const roll = rng.next();
      if (roll < rate.s && r + 1 < rows && ok(c, r + 1) && !used.has(`${c},${r + 1}`)) {
        S.add(`${c},${r}`);
        used.add(`${c},${r}`).add(`${c},${r + 1}`);
      } else if (roll > 1 - rate.e && c + 1 < cols && ok(c + 1, r) && !used.has(`${c + 1},${r}`)) {
        E.add(`${c},${r}`);
        used.add(`${c},${r}`).add(`${c + 1},${r}`);
      }
    }
  }
  return { joinS: (c: number, r: number) => S.has(`${c},${r}`), joinE: (c: number, r: number) => E.has(`${c},${r}`) };
}

// ---- Manhattan: real street numbers and avenues from x/z ----
/** Real street number at z (14th St … 110th St, linear: 15.87 game m per street). */
export const manhattanStreetAt = (z: number) => 14 + (488 - z) / 15.87;
/** Real avenues by x (measured at the projected intersections). West → east. */
const M_AVES: [string, number][] = [['12th Ave', X(-287)], ['11th Ave', X(-230)], ['10th Ave', X(-172)], ['9th Ave', X(-114)], ['8th Ave', X(-56)], ['7th Ave', X(-4)], ['6th Ave', X(56)], ['5th Ave', X(116)], ['Madison Ave', X(146)], ['Park Ave', X(176)], ['Lexington Ave', X(206)], ['3rd Ave', X(246)], ['2nd Ave', X(290)], ['1st Ave', X(335)], ['York Ave', X(380)]];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** Downtown (below 14th St) the grid stops being numbered: real names, west → east. */
const M_AVES_VILLAGE: [string, number][] = [['West St', X(-170)], ['Washington St', X(-120)], ['Hudson St', X(-60)], ['7th Ave S', X(0)], ['6th Ave', X(56)], ['5th Ave', X(116)], ['Broadway', X(172)], ['Lafayette St', X(212)], ['Bowery', X(268)], ['1st Ave', X(335)], ['Ave A', X(375)], ['Ave B', X(430)], ['Ave C', X(495)]];
const M_AVES_DOWNTOWN: [string, number][] = [['West St', X(15)], ['Greenwich St', X(70)], ['W Broadway', X(115)], ['Broadway', X(172)], ['Lafayette St', X(212)], ['Bowery', X(284)], ['Allen St', X(347)], ['Essex St', X(394)], ['Pitt St', X(480)]];
/** Downtown cross streets by z (measured where each meets Broadway). */
const M_DOWNTOWN_STREETS: [string, number][] = [
  ['14th St', 488], ['12th St', 523], ['10th St', 558], ['8th St', 593], ['4th St', 650], ['Bleecker St', 694], ['Houston St', 724], ['Spring St', 781], ['Broome St', 815],
  ['Grand St', 852], ['Canal St', 879], ['Franklin St', 930], ['Worth St', 977], ['Chambers St', 1032], ['Vesey St', 1085], ['Fulton St', 1113], ['Liberty St', 1165], ['Wall St', 1208],
  ['Battery Pl', 1265], ['State St', 1310],
];
const nearestName = (list: [string, number][], v: number) => list.reduce((b, a) => (Math.abs(a[1] - v) < Math.abs(b[1] - v) ? a : b))[0];
/** Above 110th St the avenues take their Harlem names. */
const M_AVES_HARLEM: [string, number][] = [['Riverside Dr', X(-287)], ['Broadway', X(-230)], ['Amsterdam Ave', X(-172)], ['St Nicholas Ave', X(-114)], ['Frederick Douglass Blvd', X(-56)], ['Adam Clayton Powell Jr Blvd', X(-4)], ['Malcolm X Blvd', X(56)], ['5th Ave', X(116)], ['Madison Ave', X(146)], ['Park Ave', X(176)], ['Lexington Ave', X(206)], ['3rd Ave', X(246)], ['2nd Ave', X(290)], ['1st Ave', X(335)], ['Pleasant Ave', X(380)]];
function manhattanAvenue(x: number, z = 0): string {
  if (z < -1060) return nearestName(M_AVES_HARLEM, x);
  if (z > 860) return nearestName(M_AVES_DOWNTOWN, x);
  if (z > 500) return nearestName(M_AVES_VILLAGE, x);
  return nearestName(M_AVES, x);
}
function manhattanStreet(x: number, z: number): string {
  if (z > 500) {
    const s = nearestName(M_DOWNTOWN_STREETS, z);
    // Numbered streets keep their East / West (5th Ave splits them).
    return /^\d/.test(s) ? `${x < X(116) ? 'W' : 'E'} ${s}` : s;
  }
  const n = Math.round(manhattanStreetAt(z));
  const inPark = x > X(-56) && x < X(116);
  if (n === 59 && inPark) return 'Central Park S';
  if (n === 110 && inPark) return 'Central Park N';
  return `${x < X(116) ? 'W' : 'E'} ${ordinal(n)} St`;
}

/**
 * Below 14th St the EAST side (East Village, Lower East Side: east of the
 * Bowery / 3rd Ave) is left empty for players to buy (Peter, 2026-10-11).
 * The line follows the real Bowery, which leans east as it goes south.
 */
export function manhattanForSale(x: number, z: number): boolean {
  return z > 500 && z < 960 && x > X(262 + (z - 656) * 0.12);
}

/** Build a district from its grid spec and its own rules. */
function district(base: Omit<DistrictDef, 'origin' | 'trimmed' | 'setKind' | 'xs' | 'zs' | 'allXs' | 'allZs' | 'cols' | 'rows' | 'joinS' | 'joinE' | 'kind' | 'hub' | 'avenueNames' | 'streetNames'> & {
  grid: GridSpec;
  /** Kind of a land block (water is handled for you), from its centre. */
  kindAt: (x: number, z: number, c: number, r: number) => BlockKind;
  /** Where the hub (Times Square / Atlantic Plaza) is. */
  hubAt: { x: number; z: number; name: string };
  /** How often streets / avenues are closed into long or wide blocks. */
  joinRate?: { s: number; e: number };
  /** Where blocks may stand (default: on the borough's main land). */
  fits?: Fits;
}): DistrictDef {
  const g = base.grid;
  const fits = base.fits ?? landFits(g.borough);
  const xs = g.allXs.slice(g.c0, g.c1 + 1);
  const zs = g.allZs.slice(g.r0, g.r1 + 1);
  const cols = xs.length - 1;
  const rows = zs.length - 1;
  const land = Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => cellOnLand(fits, xs, zs, c, r)));
  // Blocks on the shore that are only partly land get trimmed, not dropped.
  const trims = Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) =>
      land[c][r] ? null : trimToLand(fits, { minX: xs[c] + AVE_W / 2, maxX: xs[c + 1] - AVE_W / 2, minZ: zs[r] + ST_W / 2, maxZ: zs[r + 1] - ST_W / 2 }),
    ),
  );
  const hub = { c: cellOf(xs, base.hubAt.x), r: cellOf(zs, base.hubAt.z), name: base.hubAt.name };
  const kinds: BlockKind[][] = Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => {
      const t = trims[c][r];
      if (land[c][r]) return base.kindAt((xs[c] + xs[c + 1]) / 2, (zs[r] + zs[r + 1]) / 2, c, r);
      return t ? base.kindAt((t.minX + t.maxX) / 2, (t.minZ + t.maxZ) / 2, c, r) : 'water';
    }),
  );
  // The hub and the block north of it are the bright plaza.
  if (kinds[hub.c]?.[hub.r] && kinds[hub.c][hub.r] !== 'water') kinds[hub.c][hub.r] = 'plaza';
  const joins = makeJoins(cols, rows, `${base.seed}-joins`, (c, r) => kinds[c][r] === 'buildings' && !trims[c][r] && !(c === hub.c && Math.abs(r - hub.r) <= 1), base.joinRate);
  return {
    ...base,
    origin: { x: xs[0], z: zs[0] },
    xs,
    zs,
    allXs: g.allXs,
    allZs: g.allZs,
    cols,
    rows,
    joinS: joins.joinS,
    joinE: joins.joinE,
    kind: (c, r) => kinds[c]?.[r] ?? 'water',
    setKind: (c, r, k) => {
      if (kinds[c]?.[r] !== undefined) kinds[c][r] = k;
    },
    trimmed: (c, r) => trims[c]?.[r] ?? null,
    hub,
    avenueNames: xs.map((x) => base.names(x, (zs[0] + zs[rows]) / 2)[0]),
    streetNames: zs.map((z) => base.names((xs[0] + xs[cols]) / 2, z)[1]),
  };
}

// kindAt runs while the district is being built, so it reads the playable
// lines from these (filled just before each district is created).
const MANHATTAN_GRID = { xs: [] as number[], zs: [] as number[] };
const BROOKLYN_GRID = { xs: [] as number[], zs: [] as number[] };
function playable(g: GridSpec, into: { xs: number[]; zs: number[] }): GridSpec {
  into.xs = g.allXs.slice(g.c0, g.c1 + 1);
  into.zs = g.allZs.slice(g.r0, g.r1 + 1);
  return g;
}

const TIMES_SQ = project(40.758, -73.9855);
const M_FUNLAND = project(40.7795, -73.9845);
const M_BRYANT = project(40.7536, -73.9832);
const M_HY = project(40.7535, -74.001);
// Downtown parks (each fills its grid block).
const M_WSP = project(40.7308, -73.9973); // Washington Square Park
const M_CITYHALL = project(40.7128, -74.006); // City Hall Park
const M_BATTERY = project(40.7033, -74.017); // The Battery
const M_INWOOD = project(40.8715, -73.9235); // Inwood Hill Park
const M_TRYON = project(40.8620, -73.9320); // Fort Tryon Park
const M_HIGHBRIDGE = project(40.8425, -73.9310); // Highbridge Park

const MANHATTAN = district({
  id: 'manhattan',
  name: 'Manhattan',
  tagline: 'Harlem · Central Park · Midtown · Downtown',
  borough: 'manhattan',
  // Anchored on Central Park West (x −56) and Central Park South (z −226);
  // playable from Harlem (about 155th St) all the way down to the Battery
  // (the lines are the same seeded lines as before, the grid just reaches
  // further north and south).
  // 2026-10-12: the grid now runs the whole island, up to Inwood, and
  // stays inside the ring highway (coreFits).
  grid: playable(gridFor('manhattan', { x: X(-56), z: -226 }, { minX: X(-470), maxX: X(480), minZ: -2860, maxZ: 1340 }, 'manhattan-grid-v3'), MANHATTAN_GRID),
  fits: coreFits,
  blockW: 150,
  blockD: 70,
  avenueW: AVE_W,
  streetW: ST_W,
  names: (x, z) => [manhattanAvenue(x, z), manhattanStreet(x, z)],
  water: { side: 'west', label: 'Hudson River' },
  zone: (c, r) => {
    const d = MANHATTAN;
    const x = (d.xs[c] + d.xs[c + 1]) / 2;
    const z = (d.zs[r] + d.zs[r + 1]) / 2;
    const n = manhattanStreetAt(z);
    // Harlem, above 110th St: brownstones, East Harlem mid-rise.
    if (n > 110) return x > X(150) ? 'midrise' : 'brownstone';
    // Downtown, below 14th St.
    if (z > 1000) return 'tall'; // Financial District
    if (z > 840) return x < X(240) ? 'midrise' : 'brownstone'; // Tribeca / Chinatown
    if (z > 500) return x < X(60) ? 'brownstone' : 'midrise'; // West Village / SoHo & NoHo
    if (x < X(-240)) return 'waterfront';
    if (n >= 30 && n <= 59 && x > X(-60)) return 'tall'; // Midtown
    if (n > 59) return x > X(150) ? 'midrise' : 'brownstone'; // Upper West / Upper East Side
    if (n < 30) return x < X(-60) ? 'brownstone' : 'midrise'; // Chelsea / Flatiron & Gramercy
    return x < X(-60) ? 'midrise' : 'tall'; // Hell's Kitchen / Murray Hill
  },
  kindAt: (x, z, c, r) => {
    const n = manhattanStreetAt(z);
    const inBlock = (p: { x: number; z: number }) => cellOf(MANHATTAN_GRID.xs, p.x) === c && cellOf(MANHATTAN_GRID.zs, p.z) === r;
    if (n > 59 && n < 111 && x > X(-56) && x < X(116)) return 'park'; // Central Park, 59th → 110th, 8th → 5th Ave
    if (inBlock(M_BRYANT)) return 'park';
    if (inBlock(M_FUNLAND)) return 'plaza';
    if (inBlock(M_HY)) return 'vacant';
    if (inBlock(M_WSP) || inBlock(M_CITYHALL) || inBlock(M_BATTERY)) return 'park';
    if (inBlock(M_INWOOD) || inBlock(M_TRYON) || inBlock(M_HIGHBRIDGE)) return 'park'; // up north: Inwood Hill, Fort Tryon, Highbridge
    if (manhattanForSale(x, z)) return 'lot';
    return 'buildings';
  },
  hubAt: { x: TIMES_SQ.x, z: TIMES_SQ.z, name: 'Times Square' },
  seed: 'manhattan-real-v3',
});

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
  ['Bedford Ave', [40.722, -73.955], [40.68, -73.953]],
  ['Broadway', [40.7105, -73.9655], [40.693, -73.928]],
  ['Metropolitan Ave', [40.7145, -73.963], [40.7135, -73.935]],
  ['Grand St', [40.7155, -73.962], [40.712, -73.94]],
  ['Flushing Ave', [40.698, -73.975], [40.7005, -73.93]],
  ['Gates Ave', [40.686, -73.965], [40.6885, -73.93]],
  ['Nostrand Ave', [40.698, -73.951], [40.665, -73.95]],
  ['Classon Ave', [40.698, -73.961], [40.672, -73.958]],
  ['Franklin Ave', [40.7, -73.9575], [40.668, -73.957]],
  ['Kent Ave', [40.722, -73.962], [40.699, -73.968]],
  ['Lafayette Ave', [40.6875, -73.976], [40.69, -73.935]],
  ['7th Ave', [40.678, -73.973], [40.66, -73.985]],
  ['5th Ave', [40.684, -73.977], [40.664, -73.99]],
  ['Union St', [40.677, -73.995], [40.672, -73.97]],
  ['Eastern Pkwy', [40.6735, -73.97], [40.668, -73.93]],
  ['Bergen St', [40.6855, -73.995], [40.677, -73.94]],
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

const B_FG_PARK = project(40.6913, -73.9757);
const B_MCCARREN = project(40.7206, -73.9513);
const B_HUB = project(40.6845, -73.978);
/** Prospect Park: blocks whose centre is in this lat/lon box. */
const inProspectPark = (lat: number, lon: number) => lat > 40.652 && lat < 40.6715 && lon > -73.9795 && lon < -73.962;

const BROOKLYN = district({
  id: 'brooklyn',
  name: 'Brooklyn',
  tagline: 'Williamsburg · DUMBO · Downtown · Park Slope · Bed-Stuy',
  borough: 'brooklyn',
  // Brooklyn is less regular than Manhattan (Peter, 2026-10-11): the block
  // sizes vary more, more streets are closed into odd long blocks, and a
  // web of diagonal avenues cuts across the grid (world/corridors.ts).
  // Playable from Greenpoint/Williamsburg down to Prospect Park, and east
  // to Bed-Stuy.
  grid: playable(gridFor('brooklyn', { x: X(480), z: 980 }, { minX: X(470), maxX: X(1520), minZ: 520, maxZ: 1880 }, 'brooklyn-grid-v4', SX([104, 214]), SZ([52, 124])), BROOKLYN_GRID),
  joinRate: { s: 0.2, e: 0.12 },
  blockW: 150,
  blockD: 70,
  avenueW: AVE_W,
  streetW: ST_W,
  names: bkNames,
  water: { side: 'north', label: 'East River' },
  zone: (c, r) => {
    const d = BROOKLYN;
    const x = (d.xs[c] + d.xs[c + 1]) / 2;
    const z = (d.zs[r] + d.zs[r + 1]) / 2;
    if (z < 1110 && x < X(760)) return 'waterfront'; // DUMBO / Vinegar Hill warehouses
    if (z < 900 && x < X(900)) return x < X(760) ? 'waterfront' : 'midrise'; // Williamsburg waterfront towers & lofts
    if (x > X(560) && x < X(1000) && z > 1200 && z < 1420) return 'tall'; // Downtown Brooklyn & Barclays
    return 'brownstone'; // Brooklyn Heights, Fort Greene, Park Slope, Bed-Stuy
  },
  kindAt: (x, z, c, r) => {
    const inBlock = (p: { x: number; z: number }) => cellOf(BROOKLYN_GRID.xs, p.x) === c && cellOf(BROOKLYN_GRID.zs, p.z) === r;
    if (inBlock(B_FG_PARK) || inBlock(B_MCCARREN)) return 'park';
    const ll = unproject(x, z);
    if (inProspectPark(ll.lat, ll.lon)) return 'park';
    return 'buildings';
  },
  hubAt: { x: B_HUB.x, z: B_HUB.z, name: 'Atlantic Plaza' },
  seed: 'brooklyn-real-v3',
});

// ---- The Bronx: Mott Haven, Yankee Stadium, the Grand Concourse, Fordham, the Zoo ----
const BX_STREETS: [string, [number, number], [number, number]][] = [
  ['Grand Concourse', [40.8135, -73.93], [40.873, -73.89]],
  ['E 149th St', [40.818, -73.93], [40.813, -73.903]],
  ['E 161st St', [40.8285, -73.932], [40.824, -73.905]],
  ['Fordham Rd', [40.861, -73.912], [40.858, -73.875]],
  ['3rd Ave', [40.807, -73.927], [40.855, -73.892]],
  ['Webster Ave', [40.82, -73.913], [40.866, -73.885]],
  ['Southern Blvd', [40.807, -73.915], [40.854, -73.878]],
  ['Jerome Ave', [40.828, -73.928], [40.875, -73.895]],
  ['E Tremont Ave', [40.848, -73.91], [40.843, -73.875]],
  ['Bruckner Blvd', [40.806, -73.928], [40.818, -73.89]],
  ['E 138th St', [40.811, -73.931], [40.806, -73.912]],
  ['Arthur Ave', [40.861, -73.889], [40.85, -73.887]],
  ['Crotona Ave', [40.847, -73.893], [40.836, -73.898]],
];
const BX_LINES = BX_STREETS.map(([n, a, b]) => ({ n, a: project(a[0], a[1]), b: project(b[0], b[1]) }));
function bxNames(x: number, z: number): [string, string] {
  const dist = (l: (typeof BX_LINES)[number]) => {
    const dx = l.b.x - l.a.x, dz = l.b.z - l.a.z;
    const t = Math.max(0, Math.min(1, ((x - l.a.x) * dx + (z - l.a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (l.a.x + t * dx), z - (l.a.z + t * dz));
  };
  const sorted = [...BX_LINES].sort((p, q) => dist(p) - dist(q));
  return [sorted[0].n, sorted[1].n];
}
const BRONX_GRID = { xs: [] as number[], zs: [] as number[] };
const X_CROTONA = project(40.8396, -73.8975);
const X_HUB = project(40.816, -73.917);
/** The Bronx Zoo and the Botanical Garden: blocks whose centre is in these lat/lon boxes are park. */
const inBxGreen = (lat: number, lon: number) => (lat > 40.842 && lat < 40.858 && lon > -73.884 && lon < -73.869) || (lat > 40.858 && lat < 40.869 && lon > -73.882 && lon < -73.869);

const BRONX = district({
  id: 'bronx',
  name: 'The Bronx',
  tagline: 'Yankee Stadium · Grand Concourse · Fordham · the Zoo',
  borough: 'bronx',
  // The Bronx grid is the least regular yet: wide spread of block sizes,
  // lots of closed streets, and the Concourse, Fordham Rd, Southern Blvd,
  // the Deegan and the Cross Bronx cutting across (world/corridors.ts).
  grid: playable(gridFor('bronx', { x: X(180), z: -1860 }, { minX: X(-10), maxX: X(900), minZ: -2960, maxZ: -1440 }, 'bronx-grid-v1', SX([100, 220]), SZ([55, 130])), BRONX_GRID),
  joinRate: { s: 0.22, e: 0.14 },
  blockW: 150,
  blockD: 70,
  avenueW: AVE_W,
  streetW: ST_W,
  names: bxNames,
  water: { side: 'west', label: 'Harlem River' },
  zone: (c, r) => {
    const d = BRONX;
    const x = (d.xs[c] + d.xs[c + 1]) / 2;
    const z = (d.zs[r] + d.zs[r + 1]) / 2;
    if (z > -1640) return x > X(500) ? 'waterfront' : 'midrise'; // Mott Haven & Port Morris
    if (x < X(300) && z > -2300) return 'midrise'; // Grand Concourse art-deco apartment houses
    if (Math.hypot(x - X_HUB.x, z - X_HUB.z) < 220) return 'tall'; // The Hub, 149th & 3rd
    return 'brownstone'; // walk-ups and row houses
  },
  kindAt: (x, z, c, r) => {
    const inBlock = (p: { x: number; z: number }) => cellOf(BRONX_GRID.xs, p.x) === c && cellOf(BRONX_GRID.zs, p.z) === r;
    if (inBlock(X_CROTONA)) return 'park';
    const ll = unproject(x, z);
    if (inBxGreen(ll.lat, ll.lon)) return 'park';
    return 'buildings';
  },
  hubAt: { x: X_HUB.x, z: X_HUB.z, name: 'The Hub' },
  seed: 'bronx-real-v1',
});

// ---- Queens: Long Island City, Astoria, Sunnyside, Woodside, Jackson Heights ----
const QN_STREETS: [string, [number, number], [number, number]][] = [
  ['Queens Blvd', [40.7437, -73.9535], [40.738, -73.878]],
  ['Northern Blvd', [40.752, -73.933], [40.759, -73.86]],
  ['Astoria Blvd', [40.77, -73.928], [40.767, -73.885]],
  ['21st St', [40.741, -73.953], [40.772, -73.933]],
  ['Steinway St', [40.757, -73.921], [40.773, -73.907]],
  ['Broadway', [40.762, -73.932], [40.748, -73.905]],
  ['31st St', [40.744, -73.937], [40.776, -73.913]],
  ['Vernon Blvd', [40.74, -73.957], [40.768, -73.938]],
  ['Jackson Ave', [40.742, -73.952], [40.751, -73.938]],
  ['37th Ave', [40.753, -73.92], [40.75, -73.875]],
  ['Roosevelt Ave', [40.744, -73.912], [40.748, -73.875]],
  ['Ditmars Blvd', [40.779, -73.918], [40.772, -73.89]],
  ['Skillman Ave', [40.747, -73.935], [40.745, -73.905]],
];
const QN_LINES = QN_STREETS.map(([n, a, b]) => ({ n, a: project(a[0], a[1]), b: project(b[0], b[1]) }));
function qnNames(x: number, z: number): [string, string] {
  const dist = (l: (typeof QN_LINES)[number]) => {
    const dx = l.b.x - l.a.x, dz = l.b.z - l.a.z;
    const t = Math.max(0, Math.min(1, ((x - l.a.x) * dx + (z - l.a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (l.a.x + t * dx), z - (l.a.z + t * dz));
  };
  const sorted = [...QN_LINES].sort((p, q) => dist(p) - dist(q));
  return [sorted[0].n, sorted[1].n];
}
const QUEENS_GRID = { xs: [] as number[], zs: [] as number[] };
const Q_HUB = project(40.7471, -73.9435); // Court Square
const Q_ASTORIA_PARK = project(40.7786, -73.9228);
const Q_GANTRY = project(40.7454, -73.9584);
const Q_SUNNYSIDE_GDN = project(40.7468, -73.9165);

const QUEENS = district({
  id: 'queens',
  name: 'Queens',
  tagline: 'Long Island City · Astoria · Jackson Heights',
  borough: 'queens',
  // Queens: LIC towers by the river, Astoria and Sunnyside row houses,
  // Jackson Heights. Irregular blocks plus Queens Blvd, Northern Blvd and
  // friends cutting across (world/corridors.ts).
  grid: playable(gridFor('queens', { x: X(700), z: -100 }, { minX: X(520), maxX: X(1700), minZ: -1000, maxZ: 150 }, 'queens-grid-v1', SX([104, 210]), SZ([55, 125])), QUEENS_GRID),
  joinRate: { s: 0.2, e: 0.12 },
  blockW: 150,
  blockD: 70,
  avenueW: AVE_W,
  streetW: ST_W,
  names: qnNames,
  water: { side: 'west', label: 'East River' },
  zone: (c, r) => {
    const d = QUEENS;
    const x = (d.xs[c] + d.xs[c + 1]) / 2;
    const z = (d.zs[r] + d.zs[r + 1]) / 2;
    if (x < X(860) && z > -300) return x < X(640) ? 'waterfront' : 'tall'; // LIC towers & the Gantry waterfront
    if (x > X(1400)) return 'midrise'; // Jackson Heights co-ops
    if (z < -500) return 'brownstone'; // Astoria row houses
    return x < X(1000) ? 'midrise' : 'brownstone'; // Sunnyside & Woodside
  },
  kindAt: (x, z, c, r) => {
    void x;
    void z;
    const inBlock = (p: { x: number; z: number }) => cellOf(QUEENS_GRID.xs, p.x) === c && cellOf(QUEENS_GRID.zs, p.z) === r;
    if (inBlock(Q_ASTORIA_PARK) || inBlock(Q_GANTRY) || inBlock(Q_SUNNYSIDE_GDN)) return 'park';
    return 'buildings';
  },
  hubAt: { x: Q_HUB.x, z: Q_HUB.z, name: 'Court Square' },
  seed: 'queens-real-v1',
});

export const DISTRICTS: Record<AreaId, DistrictDef> = { manhattan: MANHATTAN, brooklyn: BROOKLYN, bronx: BRONX, queens: QUEENS };

export function avenueX(d: DistrictDef, i: number): number {
  return d.xs[Math.max(0, Math.min(d.cols, i))];
}

export function streetZ(d: DistrictDef, j: number): number {
  return d.zs[Math.max(0, Math.min(d.rows, j))];
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * The land of block (c, r), sidewalks included. Where a street or avenue
 * is closed, the block reaches across it to meet its neighbour (so a
 * joined pair reads as one long or wide block).
 */
export function blockRect(d: DistrictDef, c: number, r: number): Rect {
  const t = d.trimmed(c, r);
  if (t) return { ...t };
  const rect = {
    minX: avenueX(d, c) + d.avenueW / 2,
    maxX: avenueX(d, c + 1) - d.avenueW / 2,
    minZ: streetZ(d, r) + d.streetW / 2,
    maxZ: streetZ(d, r + 1) - d.streetW / 2,
  };
  if (d.joinE(c, r)) rect.maxX = avenueX(d, c + 1);
  if (c > 0 && d.joinE(c - 1, r)) rect.minX = avenueX(d, c);
  if (d.joinS(c, r)) rect.maxZ = streetZ(d, r + 1);
  if (r > 0 && d.joinS(c, r - 1)) rect.minZ = streetZ(d, r);
  return rect;
}

/** The whole area including a margin of empty land around it. */
export function districtBounds(d: DistrictDef, margin = 60): Rect {
  return { minX: d.xs[0] - margin, maxX: d.xs[d.cols] + margin, minZ: d.zs[0] - margin, maxZ: d.zs[d.rows] + margin };
}

export function districtCenter(d: DistrictDef): { x: number; z: number } {
  const b = districtBounds(d, 0);
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
}

/** Which block column / row a point is in (by the street centre lines; may be off the grid). */
export function colAt(d: DistrictDef, x: number): number {
  return cellOf(d.xs, x);
}
export function rowAt(d: DistrictDef, z: number): number {
  return cellOf(d.zs, z);
}

/** Which block (if any) a world point is inside. */
export function blockAt(d: DistrictDef, x: number, z: number): { c: number; r: number } | null {
  const c = colAt(d, x);
  const r = rowAt(d, z);
  if (c < 0 || r < 0 || c >= d.cols || r >= d.rows) return null;
  const b = blockRect(d, c, r);
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ ? { c, r } : null;
}

/** Name of the nearest cross streets, e.g. "8th Ave & W 44th St" (real names). */
export function crossStreets(d: DistrictDef, x: number, z: number): string {
  const [a, b] = d.names(x, z);
  return `${a} & ${b}`;
}

/**
 * Is (x, z) on real asphalt: inside the road ring around some block (and
 * not on the block itself)? Use this rather than onLand for road markings,
 * traffic lanes and lights — a trimmed shore block pulls its road in with it.
 */
export function onRoad(d: DistrictDef, x: number, z: number): boolean {
  const c0 = colAt(d, x), r0 = rowAt(d, z);
  let ring = false;
  for (let c = c0 - 1; c <= c0 + 1; c++) {
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      if (c < 0 || r < 0 || c >= d.cols || r >= d.rows || d.kind(c, r) === 'water') continue;
      const b = blockRect(d, c, r);
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false; // on the block
      if (x > b.minX - d.avenueW / 2 - 0.5 && x < b.maxX + d.avenueW / 2 + 0.5 && z > b.minZ - d.streetW / 2 - 0.5 && z < b.maxZ + d.streetW / 2 + 0.5) ring = true;
    }
  }
  return ring;
}

/** Is block (c, r) empty land players can rent for a house (data/plots.ts)? */
export function forSaleBlock(d: DistrictDef, c: number, r: number): boolean {
  return d.kind(c, r) === 'lot';
}

/** Is block (c, r) a park? (false off the grid) */
export function isPark(d: DistrictDef, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < d.cols && r < d.rows && d.kind(c, r) === 'park';
}

/** Is the road between block (c, r) and its east / south neighbour closed (park or joined block)? */
function closedE(d: DistrictDef, c: number, r: number): boolean {
  return (isPark(d, c, r) && isPark(d, c + 1, r)) || (c >= 0 && r >= 0 && c < d.cols && d.joinE(c, r));
}
function closedS(d: DistrictDef, c: number, r: number): boolean {
  return (isPark(d, c, r) && isPark(d, c, r + 1)) || (c >= 0 && r >= 0 && r < d.rows && d.joinS(c, r));
}

/**
 * Is (x, z) on a road that isn't there: through the middle of a park
 * (parks are one green patch) or across a joined block? No asphalt, no
 * cars, no road markings there.
 */
export function inParkGap(d: DistrictDef, x: number, z: number): boolean {
  // Which avenue / street line is (x, z) on, if any?
  let ave = -1;
  for (let i = 0; i <= d.cols; i++) if (Math.abs(x - d.xs[i]) < d.avenueW / 2) ave = i;
  let st = -1;
  for (let j = 0; j <= d.rows; j++) if (Math.abs(z - d.zs[j]) < d.streetW / 2) st = j;
  const c = colAt(d, x);
  const r = rowAt(d, z);
  if (ave >= 0 && st >= 0) return closedE(d, ave - 1, st - 1) && closedE(d, ave - 1, st) && closedS(d, ave - 1, st - 1) && closedS(d, ave, st - 1);
  if (ave >= 0) return closedE(d, ave - 1, r);
  if (st >= 0) return closedS(d, c, st - 1);
  return isPark(d, c, r);
}

/**
 * Street ends (Peter, 2026-10-12: streets used to dead-end in the grass by
 * the river). Where a street or avenue runs off the outside of the grid,
 * it carries on, straight, until it meets the ring highway, like real
 * cross streets meeting the West Side Highway and the FDR. Only Manhattan
 * has the ring. Each stub is a strip of asphalt `w` wide from (x0, z0) to
 * (x1, z1) along x or z.
 */
export interface StreetStub {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  w: number;
  /** Along x (a street) or along z (an avenue). */
  axis: 'x' | 'z';
}
const stubCache = new Map<AreaId, StreetStub[]>();
export function streetStubs(d: DistrictDef): StreetStub[] {
  const hit = stubCache.get(d.id);
  if (hit) return hit;
  const out: StreetStub[] = [];
  stubCache.set(d.id, out);
  if (d.id !== 'manhattan') return out;
  const ring = MANHATTAN_SHORE.ring;
  const n = ring.length;
  /** Distance along a ray to the ring highway's centre line (Infinity if it misses). */
  const toRing = (x: number, z: number, dx: number, dz: number): number => {
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
      const ex = bx - ax, ez = bz - az;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - x) * ez - (az - z) * ex) / den;
      const u = ((ax - x) * dz - (az - z) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return best;
  };
  // Every block's asphalt (the block plus half a road all round).
  const pads: (Rect & { c: number; r: number })[] = [];
  for (let c = 0; c < d.cols; c++) for (let r = 0; r < d.rows; r++) {
    if (d.kind(c, r) === 'water') continue;
    const b = blockRect(d, c, r);
    pads.push({ c, r, minX: b.minX - d.avenueW / 2 - 0.5, maxX: b.maxX + d.avenueW / 2 + 0.5, minZ: b.minZ - d.streetW / 2 - 0.5, maxZ: b.maxZ + d.streetW / 2 + 0.5 });
  }
  // Avenues only run on past the last block of their column (the island's
  // two ends): along the riverside strips they'd box the grass into squares.
  const lastInCol = new Map<number, { min: number; max: number }>();
  for (const q of pads) {
    const e = lastInCol.get(q.c) ?? { min: Infinity, max: -Infinity };
    lastInCol.set(q.c, { min: Math.min(e.min, q.r), max: Math.max(e.max, q.r) });
  }
  const hits = (r: Rect, self: Rect) => pads.some((p) => p !== self && r.minX < p.maxX - 0.6 && r.maxX > p.minX + 0.6 && r.minZ < p.maxZ - 0.6 && r.maxZ > p.minZ + 0.6);
  const seen = new Set<string>();
  const MAX = 170;
  for (const p of pads) {
    const cx = [p.minX + d.avenueW / 2 + 0.5, p.maxX - d.avenueW / 2 - 0.5]; // avenue centre lines either side
    const cz = [p.minZ + d.streetW / 2 + 0.5, p.maxZ - d.streetW / 2 - 0.5]; // street centre lines either side
    const tries: { x: number; z: number; dx: number; dz: number; w: number; axis: 'x' | 'z' }[] = [];
    for (const z of cz) {
      tries.push({ x: p.maxX, z, dx: 1, dz: 0, w: d.streetW, axis: 'x' }, { x: p.minX, z, dx: -1, dz: 0, w: d.streetW, axis: 'x' });
    }
    const ends = lastInCol.get(p.c)!;
    for (const x of cx) {
      if (p.r === ends.max) tries.push({ x, z: p.maxZ, dx: 0, dz: 1, w: d.avenueW, axis: 'z' });
      if (p.r === ends.min) tries.push({ x, z: p.minZ, dx: 0, dz: -1, w: d.avenueW, axis: 'z' });
    }
    for (const t of tries) {
      const L = toRing(t.x, t.z, t.dx, t.dz);
      if (!(L > 1 && L < MAX)) continue;
      const ex = t.x + t.dx * L, ez = t.z + t.dz * L;
      const half = t.w / 2;
      const r: Rect = t.axis === 'x'
        ? { minX: Math.min(t.x, ex), maxX: Math.max(t.x, ex), minZ: t.z - half, maxZ: t.z + half }
        : { minX: t.x - half, maxX: t.x + half, minZ: Math.min(t.z, ez), maxZ: Math.max(t.z, ez) };
      if (hits(r, p)) continue; // another block is in the way: not an outside edge
      const key = `${t.axis}:${Math.round(t.axis === 'x' ? t.z : t.x)}:${Math.sign(t.dx + t.dz)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x0: t.x, z0: t.z, x1: ex, z1: ez, w: t.w, axis: t.axis });
    }
  }
  return out;
}

/** A street stub's asphalt as a rect. */
export function stubRect(s: StreetStub): Rect {
  const h = s.w / 2;
  return s.axis === 'x'
    ? { minX: Math.min(s.x0, s.x1), maxX: Math.max(s.x0, s.x1), minZ: s.z0 - h, maxZ: s.z0 + h }
    : { minX: s.x0 - h, maxX: s.x0 + h, minZ: Math.min(s.z0, s.z1), maxZ: Math.max(s.z0, s.z1) };
}
