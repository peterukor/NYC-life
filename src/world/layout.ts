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
import { boroughBounds, onLand as onAnyLand, outline, pointInRing, project, unproject, type BoroughId, type XZ } from './geo-proj.ts';
import { Rng } from '../core/rng.ts';

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
const AVE_W = 14;
const ST_W = 13;
const COL_RANGE: [number, number] = [128, 196]; // avenue-to-avenue
const ROW_RANGE: [number, number] = [62, 104]; // street-to-street

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

/** Is the whole block between lines (shrunk a little) on land? */
function cellOnLand(borough: BoroughId, xs: number[], zs: number[], c: number, r: number): boolean {
  const x0 = xs[c] + AVE_W / 2 + 2, x1 = xs[c + 1] - AVE_W / 2 - 2;
  const z0 = zs[r] + ST_W / 2 + 2, z1 = zs[r + 1] - ST_W / 2 - 2;
  return [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]].every(([x, z]) => onLand(borough, x, z));
}

/**
 * A block that is only PARTLY on land (the river cuts a corner off it) is
 * trimmed instead of dropped: its sides move in, a few metres at a time,
 * off the water until the whole block (plus a little shore) is on land.
 * Lower Manhattan is narrow and slanted, so without this most of downtown
 * would be lost. Returns null when too little is left to build on.
 */
function trimToLand(borough: BoroughId, full: { minX: number; maxX: number; minZ: number; maxZ: number }): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const r = { ...full };
  const STEP = 6, MIN_W = 46, MIN_D = 34, PAD = 4;
  const N = 5;
  for (let guard = 0; guard < 80; guard++) {
    // Count the water samples near each side of the rect (+ a small shore pad).
    const miss = { w: 0, e: 0, n: 0, s: 0 };
    let total = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = r.minX - PAD + ((r.maxX - r.minX + PAD * 2) * i) / (N - 1);
        const z = r.minZ - PAD + ((r.maxZ - r.minZ + PAD * 2) * j) / (N - 1);
        if (onLand(borough, x, z)) continue;
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
const M_AVES: [string, number][] = [['12th Ave', -287], ['11th Ave', -230], ['10th Ave', -172], ['9th Ave', -114], ['8th Ave', -56], ['7th Ave', -4], ['6th Ave', 56], ['5th Ave', 116], ['Madison Ave', 146], ['Park Ave', 176], ['Lexington Ave', 206], ['3rd Ave', 246], ['2nd Ave', 290], ['1st Ave', 335], ['York Ave', 380]];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** Downtown (below 14th St) the grid stops being numbered: real names, west → east. */
const M_AVES_VILLAGE: [string, number][] = [['West St', -170], ['Washington St', -120], ['Hudson St', -60], ['7th Ave S', 0], ['6th Ave', 56], ['5th Ave', 116], ['Broadway', 172], ['Lafayette St', 212], ['Bowery', 268], ['1st Ave', 335], ['Ave A', 375], ['Ave B', 430], ['Ave C', 495]];
const M_AVES_DOWNTOWN: [string, number][] = [['West St', 15], ['Greenwich St', 70], ['W Broadway', 115], ['Broadway', 172], ['Lafayette St', 212], ['Bowery', 284], ['Allen St', 347], ['Essex St', 394], ['Pitt St', 480]];
/** Downtown cross streets by z (measured where each meets Broadway). */
const M_DOWNTOWN_STREETS: [string, number][] = [
  ['14th St', 488], ['12th St', 523], ['10th St', 558], ['8th St', 593], ['4th St', 650], ['Bleecker St', 694], ['Houston St', 724], ['Spring St', 781], ['Broome St', 815],
  ['Grand St', 852], ['Canal St', 879], ['Franklin St', 930], ['Worth St', 977], ['Chambers St', 1032], ['Vesey St', 1085], ['Fulton St', 1113], ['Liberty St', 1165], ['Wall St', 1208],
  ['Battery Pl', 1265], ['State St', 1310],
];
const nearestName = (list: [string, number][], v: number) => list.reduce((b, a) => (Math.abs(a[1] - v) < Math.abs(b[1] - v) ? a : b))[0];
/** Above 110th St the avenues take their Harlem names. */
const M_AVES_HARLEM: [string, number][] = [['Riverside Dr', -287], ['Broadway', -230], ['Amsterdam Ave', -172], ['St Nicholas Ave', -114], ['Frederick Douglass Blvd', -56], ['Adam Clayton Powell Jr Blvd', -4], ['Malcolm X Blvd', 56], ['5th Ave', 116], ['Madison Ave', 146], ['Park Ave', 176], ['Lexington Ave', 206], ['3rd Ave', 246], ['2nd Ave', 290], ['1st Ave', 335], ['Pleasant Ave', 380]];
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
    return /^\d/.test(s) ? `${x < 116 ? 'W' : 'E'} ${s}` : s;
  }
  const n = Math.round(manhattanStreetAt(z));
  const inPark = x > -56 && x < 116;
  if (n === 59 && inPark) return 'Central Park S';
  if (n === 110 && inPark) return 'Central Park N';
  return `${x < 116 ? 'W' : 'E'} ${ordinal(n)} St`;
}

/**
 * Below 14th St the EAST side (East Village, Lower East Side: east of the
 * Bowery / 3rd Ave) is left empty for players to buy (Peter, 2026-10-11).
 * The line follows the real Bowery, which leans east as it goes south.
 */
export function manhattanForSale(x: number, z: number): boolean {
  return z > 500 && z < 960 && x > 262 + (z - 656) * 0.12;
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
}): DistrictDef {
  const g = base.grid;
  const xs = g.allXs.slice(g.c0, g.c1 + 1);
  const zs = g.allZs.slice(g.r0, g.r1 + 1);
  const cols = xs.length - 1;
  const rows = zs.length - 1;
  const land = Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => cellOnLand(g.borough, xs, zs, c, r)));
  // Blocks on the shore that are only partly land get trimmed, not dropped.
  const trims = Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) =>
      land[c][r] ? null : trimToLand(g.borough, { minX: xs[c] + AVE_W / 2, maxX: xs[c + 1] - AVE_W / 2, minZ: zs[r] + ST_W / 2, maxZ: zs[r + 1] - ST_W / 2 }),
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

const MANHATTAN = district({
  id: 'manhattan',
  name: 'Manhattan',
  tagline: 'Harlem · Central Park · Midtown · Downtown',
  borough: 'manhattan',
  // Anchored on Central Park West (x −56) and Central Park South (z −226);
  // playable from Harlem (about 155th St) all the way down to the Battery
  // (the lines are the same seeded lines as before, the grid just reaches
  // further north and south).
  grid: playable(gridFor('manhattan', { x: -56, z: -226 }, { minX: -470, maxX: 480, minZ: -1750, maxZ: 1340 }, 'manhattan-grid-v3'), MANHATTAN_GRID),
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
    if (n > 110) return x > 150 ? 'midrise' : 'brownstone';
    // Downtown, below 14th St.
    if (z > 1000) return 'tall'; // Financial District
    if (z > 840) return x < 240 ? 'midrise' : 'brownstone'; // Tribeca / Chinatown
    if (z > 500) return x < 60 ? 'brownstone' : 'midrise'; // West Village / SoHo & NoHo
    if (x < -240) return 'waterfront';
    if (n >= 30 && n <= 59 && x > -60) return 'tall'; // Midtown
    if (n > 59) return x > 150 ? 'midrise' : 'brownstone'; // Upper West / Upper East Side
    if (n < 30) return x < -60 ? 'brownstone' : 'midrise'; // Chelsea / Flatiron & Gramercy
    return x < -60 ? 'midrise' : 'tall'; // Hell's Kitchen / Murray Hill
  },
  kindAt: (x, z, c, r) => {
    const n = manhattanStreetAt(z);
    const inBlock = (p: { x: number; z: number }) => cellOf(MANHATTAN_GRID.xs, p.x) === c && cellOf(MANHATTAN_GRID.zs, p.z) === r;
    if (n > 59 && n < 111 && x > -56 && x < 116) return 'park'; // Central Park, 59th → 110th, 8th → 5th Ave
    if (inBlock(M_BRYANT)) return 'park';
    if (inBlock(M_FUNLAND)) return 'plaza';
    if (inBlock(M_HY)) return 'vacant';
    if (inBlock(M_WSP) || inBlock(M_CITYHALL) || inBlock(M_BATTERY)) return 'park';
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
  grid: playable(gridFor('brooklyn', { x: 480, z: 980 }, { minX: 470, maxX: 1520, minZ: 520, maxZ: 1880 }, 'brooklyn-grid-v4', [104, 214], [52, 124]), BROOKLYN_GRID),
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
    if (z < 1110 && x < 760) return 'waterfront'; // DUMBO / Vinegar Hill warehouses
    if (z < 900 && x < 900) return x < 760 ? 'waterfront' : 'midrise'; // Williamsburg waterfront towers & lofts
    if (x > 560 && x < 1000 && z > 1200 && z < 1420) return 'tall'; // Downtown Brooklyn & Barclays
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
  grid: playable(gridFor('bronx', { x: 180, z: -1860 }, { minX: -10, maxX: 900, minZ: -2960, maxZ: -1440 }, 'bronx-grid-v1', [100, 220], [55, 130]), BRONX_GRID),
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
    if (z > -1640) return x > 500 ? 'waterfront' : 'midrise'; // Mott Haven & Port Morris
    if (x < 300 && z > -2300) return 'midrise'; // Grand Concourse art-deco apartment houses
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

export const DISTRICTS: Record<AreaId, DistrictDef> = { manhattan: MANHATTAN, brooklyn: BROOKLYN, bronx: BRONX };

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
