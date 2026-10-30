// =====================================================================
// central-park-plan.ts — WHERE everything in the outdoor Central Park
// goes (Peter, 2026-10-30: "fix the central park… take your time pls").
//
// Pure numbers, no three.js, so the city builder (trees, no walking on
// water), the landmark (ground painting, buildings, lamps, benches) and
// the 2D map all read the same plan.
//
// THE LAYOUT follows the real park, south (59th St) to north (110th):
//   the Pond + Gapstow Bridge, Wollman Rink, Heckscher ballfields, the
//   Carousel, Sheep Meadow, the Mall's elms, the Bandshell, Bethesda
//   Terrace + the angel fountain, the Lake + Bow Bridge + rowboats +
//   the Loeb Boathouse, Cherry Hill, Strawberry Fields, Conservatory
//   Water (model sailboats), the Ramble's woods, Belvedere Castle on
//   Vista Rock over Turtle Pond, the Delacorte, the Great Lawn, the
//   Pinetum, the Reservoir + its running track, the tennis courts, the
//   North Meadow fields, the Pool + the Loch, the North Woods, the Great
//   Hill + the Blockhouse, Lasker Rink, the Conservatory Garden and the
//   Harlem Meer. The loop drive goes round it all (with the 72nd and
//   102nd St cross drives), paths curve (no grid), a stone wall with
//   gates runs round the edge, and the game's mini golf sits on the east
//   side (76th-79th, Cedar Hill).
//
// Everything is authored in "design metres" for a park whose grass runs
// x −88…187, z −238…−1113 (north is −z) and stretched onto whatever the
// city grid gives (centralParkRect), so a grid change can't break it.
// =====================================================================

import { Rng } from '../core/rng.ts';
import { project } from './geo-proj.ts';
import { blockAt, blockRect, colAt, isPark, rowAt, SIDEWALK, type DistrictDef, type Rect } from './layout.ts';

export interface XZ {
  x: number;
  z: number;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TreeKind = 'elm' | 'oak' | 'maple' | 'pine' | 'cherry' | 'willow';

export interface CPTree {
  x: number;
  z: number;
  y: number;
  sp: TreeKind;
  /** Size (1 ≈ an ordinary street tree). */
  s: number;
  /** Crown colour. */
  c: string;
}

export interface CPWater {
  name: string;
  /** Closed outline (smoothed). */
  pts: XZ[];
  /** Bounding ellipse (2D map dots, quick tests). */
  x: number;
  z: number;
  rx: number;
  rz: number;
  kind: 'lake' | 'pool' | 'reservoir';
}

/** One step of the ground painting (world metres; see central-park.ts). */
export type PaintOp =
  | { t: 'fill'; pts: XZ[]; color: string; alpha?: number }
  | { t: 'stroke'; pts: XZ[]; w: number; color: string; closed?: boolean; dash?: [number, number]; alpha?: number }
  | { t: 'stripes'; pts: XZ[]; color: string; gap: number; angle: number }
  | { t: 'circle'; x: number; z: number; r: number; color: string; alpha?: number }
  | { t: 'water'; pts: XZ[]; deep: string; shallow: string; rim: string; fence?: boolean; lilies?: number }
  | { t: 'diamond'; x: number; z: number; rot: number; s: number }
  | { t: 'tennis'; x: number; z: number; w: number; d: number }
  | { t: 'blanket'; x: number; z: number; rot: number; color: string }
  | { t: 'mosaic'; x: number; z: number; r: number }
  | { t: 'rink'; pts: XZ[]; ice: boolean };

export interface CPFeature {
  kind: string;
  x: number;
  z: number;
  rot: number;
  s: number;
}

export interface CentralParkPlan {
  /** The park's blocks (sidewalk ring included). */
  rect: Rect;
  /** The green inside the sidewalk ring. */
  grass: Rect;
  waters: CPWater[];
  /** Ground painting, back to front. */
  paint: PaintOp[];
  features: CPFeature[];
  lamps: XZ[];
  benches: { x: number; z: number; rot: number }[];
  /** Stone wall pieces (centre line) and gate pillars. */
  wall: { a: XZ; b: XZ }[];
  pillars: XZ[];
  /** Boats: little circles that stay on the water. */
  rowboats: { x: number; z: number; r: number }[];
  sailboats: { x: number; z: number; r: number }[];
  /** Areas you can't walk (water), as rectangles for the nav grid. */
  solids: Rect[];
  /** Where trees can't go (features), in world metres. */
  clear: { x: number; z: number; r: number }[];
  /** Is this point on a path, drive or plaza? */
  onPath: (x: number, z: number, pad?: number) => boolean;
  inWater: (x: number, z: number, pad?: number) => boolean;
  /** Lawns (no trees) and woods (dense trees). */
  lawns: XZ[][];
  woods: XZ[][];
  /** Tree spots (species picked per season by centralParkTrees). */
  treeSpots: { x: number; z: number; s: number; zone: 'woods' | 'edge' | 'shore' | 'grove' | 'mall' | 'pinetum' | 'cherry' | 'formal' }[];
}

// ------------------------------------------------------------------ geometry helpers

/** Catmull-Rom through the points, sampled about every `step` metres. */
export function spline(pts: XZ[], closed: boolean, step = 2): XZ[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const out: XZ[] = [];
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  if (!closed) out.push({ ...pts[n - 1] });
  return out;
}

export function pointInPoly(x: number, z: number, poly: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distToSeg(px: number, pz: number, a: XZ, b: XZ): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

/** Distance from a point to a closed outline. */
function distToPoly(x: number, z: number, poly: XZ[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSeg(x, z, poly[j], poly[i]));
  return d;
}

function ellipsePts(cx: number, cz: number, rx: number, rz: number, n = 28, wob = 0, seed = 1): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + wob * Math.sin(a * 3 + seed) * 0.6 + wob * Math.cos(a * 5 + seed * 2) * 0.4;
    out.push({ x: cx + Math.cos(a) * rx * w, z: cz + Math.sin(a) * rz * w });
  }
  return out;
}

function rectPts(x0: number, z0: number, x1: number, z1: number): XZ[] {
  return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}

/** Offset a closed outline outwards by `d` (simple vertex normals; fine for soft blobs). */
export function grow(poly: XZ[], d: number): XZ[] {
  const n = poly.length;
  // Winding sign so "outwards" is right either way round.
  let area = 0;
  for (let i = 0; i < n; i++) area += poly[i].x * poly[(i + 1) % n].z - poly[(i + 1) % n].x * poly[i].z;
  const s = area > 0 ? 1 : -1;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    const tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    return { x: p.x + (s * tz * d) / l, z: p.z - (s * tx * d) / l };
  });
}

/** Cheap smooth value noise (0..1) for natural-looking groves. */
function valueNoise(x: number, z: number, seed: number): number {
  const h = (i: number, j: number) => {
    const v = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// ------------------------------------------------------------------ which blocks are the park

/** Every park block joined to the block at the real park's middle. */
export function centralParkRect(d: DistrictDef): Rect | null {
  if (d.id !== 'manhattan') return null;
  const mid = project(40.7829, -73.9654);
  const start = blockAt(d, mid.x, mid.z) ?? { c: colAt(d, mid.x), r: rowAt(d, mid.z) };
  const park = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const seen = new Set<string>();
  const todo = [start];
  while (todo.length) {
    const { c, r } = todo.pop()!;
    const k = `${c},${r}`;
    if (seen.has(k) || !isPark(d, c, r)) continue;
    seen.add(k);
    const b = blockRect(d, c, r);
    park.minX = Math.min(park.minX, b.minX);
    park.maxX = Math.max(park.maxX, b.maxX);
    park.minZ = Math.min(park.minZ, b.minZ);
    park.maxZ = Math.max(park.maxZ, b.maxZ);
    todo.push({ c: c + 1, r }, { c: c - 1, r }, { c, r: r + 1 }, { c, r: r - 1 });
  }
  return seen.size ? park : null;
}

// ------------------------------------------------------------------ the design (design metres)

/** The grass the design was drawn on (x west→east, z south→north is 0 → −875). */
const DX0 = -88, DX1 = 187, DZS = -238, DZN = -1113;

type P = [number, number];

const WATERS: { name: string; kind: CPWater['kind']; pts: P[] }[] = [
  // The Pond, 59th-62nd by Grand Army Plaza, with its north arm under Gapstow Bridge.
  { name: 'The Pond', kind: 'lake', pts: [[100, -266], [110, -256], [126, -251], [146, -249], [164, -251], [175, -258], [170, -266], [152, -267], [138, -271], [129, -280], [125, -291], [117, -292], [113, -281], [104, -276]] },
  // The Lake: east lobe (Bethesda → Loeb Boathouse), the channel under Bow Bridge, west lobe and Bank Rock Bay.
  { name: 'The Lake', kind: 'lake', pts: [[78, -463], [92, -470], [101, -482], [99, -496], [90, -505], [76, -507], [62, -501], [48, -494], [36, -490], [24, -490], [13, -494], [5, -502], [-6, -511], [-18, -521], [-29, -526], [-37, -517], [-33, -506], [-40, -496], [-39, -484], [-31, -474], [-18, -468], [-4, -466], [8, -470], [18, -474], [30, -474], [42, -470], [55, -466], [66, -463]] },
  // Conservatory Water: the model-sailboat pond by 5th Ave (74th).
  { name: 'Conservatory Water', kind: 'pool', pts: [[156, -481], [166, -478], [175, -481], [177, -495], [175, -509], [166, -512], [156, -509], [154, -495]] },
  // Turtle Pond under Belvedere Castle.
  { name: 'Turtle Pond', kind: 'lake', pts: [[26, -604], [33, -597], [47, -595], [61, -597], [71, -603], [68, -611], [55, -614], [41, -616], [30, -613]] },
  // The Reservoir (86th-96th): big, rounder in the north.
  { name: 'The Reservoir', kind: 'reservoir', pts: [[20, -708], [60, -704], [98, -710], [126, -726], [142, -756], [146, -796], [140, -836], [118, -858], [80, -868], [40, -869], [0, -864], [-28, -848], [-42, -816], [-43, -778], [-35, -744], [-12, -720]] },
  // The Pool (100th-103rd, west) where the Loch starts.
  { name: 'The Pool', kind: 'lake', pts: [[-30, -1000], [-20, -994], [-6, -995], [3, -1003], [-2, -1012], [-14, -1015], [-27, -1011]] },
  // Harlem Meer (106th-110th, north-east).
  { name: 'Harlem Meer', kind: 'lake', pts: [[94, -1066], [104, -1052], [124, -1048], [148, -1050], [170, -1054], [180, -1066], [176, -1084], [160, -1093], [134, -1095], [112, -1092], [97, -1082]] },
];

/** The loop drive (closed), the 72nd and 102nd St cross drives, and the spurs to the gates. */
const LOOP: P[] = [
  [52, -296], [70, -304], [78, -324], [100, -338], [120, -354], [130, -385], [127, -420], [124, -455], [126, -490], [132, -530], [133, -575], [130, -620], [136, -665], [156, -712], [166, -765], [166, -830], [158, -880], [146, -930], [138, -975], [126, -1012], [104, -1036], [80, -1054], [60, -1072], [36, -1086], [6, -1093], [-26, -1092], [-52, -1080], [-68, -1052], [-72, -1010], [-70, -965], [-66, -912], [-62, -868], [-62, -818], [-62, -762], [-58, -712], [-56, -672], [-60, -630], [-62, -590], [-58, -548], [-55, -520], [-58, -488], [-62, -455], [-60, -420], [-52, -385], [-52, -350], [-36, -336], [-10, -328], [14, -324], [34, -314],
];
const DRIVES: P[][] = [
  // Center Drive: 6th Ave gate → the loop.
  [[55, -238], [55, -252], [53, -272], [52, -296]],
  // West Drive: Columbus Circle → the loop.
  [[-80, -240], [-74, -256], [-68, -284], [-62, -318], [-52, -350]],
  // 72nd St (Terrace Drive), over Bethesda Terrace.
  [[-62, -432], [-30, -435], [5, -437], [40, -434], [72, -433], [100, -440], [124, -446]],
  // 102nd St cross drive.
  [[-71, -982], [-40, -980], [0, -976], [40, -974], [80, -977], [114, -984], [140, -990]],
];

/** Pedestrian paths: [points, width, benches?]. */
const PATHS: [P[], number, boolean][] = [
  // --- south: gates, the Pond, Wollman, the Dairy, the Carousel.
  [[[-30, -238], [-33, -248], [-44, -256], [-54, -266], [-56, -292], [-50, -316], [-38, -330]], 3, true],
  [[[118, -238], [112, -246], [100, -252], [90, -262], [83, -276], [76, -288], [72, -296]], 3, true],
  [[[180, -244], [160, -243], [130, -244], [112, -246]], 3, true],
  [[[182, -246], [184, -262], [178, -276], [160, -280], [142, -286], [133, -286]], 2.6, true],
  [[[109, -285], [98, -290], [86, -292], [76, -290]], 2.6, true],
  [[[-38, -330], [-20, -340], [5, -342], [26, -342], [38, -347]], 3, true],
  [[[30, -323], [34, -336], [40, -346]], 2.6, false],
  [[[49, -351], [62, -352], [76, -354]], 3.2, true],
  [[[28, -302], [36, -290], [40, -270], [30, -256], [10, -250], [-12, -252], [-33, -248]], 2.4, true],
  // Sheep Meadow ring.
  [[[18, -347], [52, -352], [68, -372], [68, -400], [52, -420], [18, -424], [-18, -420], [-36, -400], [-38, -372], [-22, -352], [18, -347]], 3, true],
  // Bethesda ↔ Cherry Hill ↔ Bow Bridge; Bethesda ↔ the Boathouse.
  [[[52, -452], [32, -456], [14, -454]], 3, true],
  [[[8, -456], [14, -462], [21, -467]], 2.6, false],
  [[[98, -452], [108, -462], [112, -478], [111, -494], [106, -508]], 3, true],
  // Strawberry Fields → along the Lake's south shore → Cherry Hill.
  [[[-88, -455], [-78, -452], [-66, -449], [-52, -452], [-36, -459], [-18, -459], [0, -457], [8, -455]], 3, true],
  // West lobe shore → Bank Rock → into the Ramble.
  [[[-88, -495], [-70, -494], [-50, -494], [-48, -510], [-44, -526], [-36, -534], [-20, -534], [-8, -540]], 2.6, true],
  // The Ramble's winding paths.
  [[[22, -497], [18, -510], [8, -520], [0, -535], [6, -550], [18, -562], [17, -574]], 2.2, false],
  [[[22, -497], [36, -506], [50, -515], [58, -530], [52, -548], [40, -556], [28, -566], [22, -574]], 2.2, false],
  [[[-8, -540], [6, -550]], 2.2, false],
  [[[58, -530], [76, -521], [94, -514], [106, -508]], 2.2, false],
  [[[0, -535], [-16, -552], [-32, -566], [-50, -572]], 2.2, false],
  [[[52, -548], [72, -560], [96, -568], [118, -572], [130, -568]], 2.6, true],
  // Conservatory Water ring and the 5th Ave gate.
  [[[187, -495], [180, -495]], 3, false],
  [[[166, -474], [181, -478], [183, -495], [181, -512], [166, -517], [151, -512], [149, -495], [151, -478]], 2.8, true],
  [[[149, -495], [128, -496]], 2.8, false],
  // Castle, Turtle Pond, the Delacorte, Great Lawn.
  [[[17, -574], [24, -588], [40, -590], [60, -590], [74, -596], [80, -607], [76, -620], [66, -628]], 2.8, true],
  [[[-88, -616], [-62, -612], [-40, -612], [-22, -610], [-10, -604], [-2, -592], [8, -584], [17, -574]], 2.8, true],
  [[[50, -626], [74, -628], [92, -636], [101, -650], [100, -670], [88, -686], [64, -693], [36, -693], [12, -686], [0, -670], [0, -650], [10, -636], [28, -628], [50, -626]], 3, true],
  [[[0, -660], [-22, -662], [-44, -664], [-57, -662]], 2.8, true],
  [[[101, -660], [118, -660], [134, -662]], 2.8, false],
  [[[187, -616], [168, -616], [150, -618], [131, -622], [112, -628], [96, -640]], 2.8, true],
  // Reservoir gates.
  [[[-88, -723], [-62, -722], [-49, -718]], 2.8, false],
  [[[187, -723], [170, -722], [160, -718]], 2.8, false],
  [[[-88, -864], [-62, -864], [-38, -858]], 2.8, false],
  [[[187, -864], [168, -864], [150, -858]], 2.8, false],
  // Tennis, the North Meadow.
  [[[-10, -876], [-4, -890], [-6, -918]], 2.6, false],
  [[[24, -882], [80, -880], [132, -886], [138, -926], [132, -970], [80, -970], [24, -968], [18, -926], [24, -882]], 2.8, true],
  [[[-88, -970], [-70, -972], [-54, -976], [-40, -990], [-36, -1008], [-22, -1020], [-2, -1020], [10, -1010]], 2.6, true],
  [[[187, -970], [168, -968], [148, -966], [132, -966]], 2.8, false],
  // The Loch path through the North Woods to the Meer.
  [[[10, -1010], [26, -1020], [44, -1028], [58, -1038], [72, -1048], [84, -1060], [92, -1074]], 2.4, true],
  [[[2, -1022], [8, -1044], [18, -1060], [8, -1076], [-12, -1086], [-20, -1100], [-20, -1113]], 2.4, false],
  // Great Hill ring.
  [[[-30, -1018], [-4, -1028], [2, -1045], [-12, -1062], [-36, -1064], [-58, -1052], [-60, -1032], [-48, -1020], [-30, -1018]], 2.6, true],
  // Harlem Meer ring + the north gates.
  [[[90, -1066], [102, -1046], [126, -1042], [150, -1044], [174, -1048], [186, -1066], [182, -1090], [162, -1102], [130, -1104], [106, -1100], [92, -1088], [90, -1066]], 3, true],
  [[[120, -1104], [120, -1113]], 3, false],
  [[[54, -1113], [52, -1100], [44, -1088]], 2.8, false],
  [[[-80, -1106], [-66, -1094], [-56, -1082]], 2.8, false],
  // Conservatory Garden axis (Vanderbilt Gate) to the drive.
  [[[187, -1022], [150, -1022], [134, -1018]], 3.4, false],
  // East side: 66th St gate → the Bandshell; Lasker ↔ the Meer.
  [[[187, -376], [168, -376], [148, -378], [128, -384], [110, -398], [98, -410]], 3, true],
  [[[-88, -376], [-70, -378], [-56, -380], [-40, -382]], 3, true],
  [[[46, -992], [44, -1004], [52, -1022], [58, -1036]], 2.4, false],
  // Mini golf entrance off the east drive.
  [[[134, -560], [142, -560]], 3, false],
];

/** Paved areas (fills). */
const PLAZAS: { pts: XZ[]; color: string }[] = [
  { pts: rectPts(52, -438, 98, -462), color: '#dccbaa' }, // Bethesda lower terrace
  { pts: ellipsePts(43.5, -351, 7, 6, 20), color: '#e3d5b8' }, // the park's front door
  { pts: ellipsePts(36, -330, 11, 10, 22), color: '#e3d5b8' }, // Carousel
  { pts: ellipsePts(11, -452, 8, 6, 20), color: '#dccbaa' }, // Cherry Hill
  { pts: rectPts(84, -404, 99, -432), color: '#e3d5b8' }, // Concert Ground by the Bandshell
  { pts: ellipsePts(-88, -238, 20, 18, 24), color: '#dfd2b6' }, // Columbus Circle / Merchants' Gate
  { pts: ellipsePts(187, -238, 18, 16, 24), color: '#dfd2b6' }, // Grand Army Plaza
  { pts: ellipsePts(-88, -1113, 16, 14, 24), color: '#dfd2b6' }, // Frederick Douglass Circle
  { pts: ellipsePts(187, -1113, 16, 14, 24), color: '#dfd2b6' }, // Duke Ellington Circle
  { pts: rectPts(140, -526, 186, -596), color: '#e6d6a8' }, // mini golf ground
  { pts: rectPts(0, -892, 22, -904), color: '#e3d5b8' }, // tennis house
  { pts: ellipsePts(108, -497, 8, 7, 18), color: '#dccbaa' }, // boathouse terrace
];

const LAWNS: { pts: XZ[]; color: string; stripe: string; angle: number }[] = [
  { pts: ellipsePts(15, -386, 46, 30, 32, 0.08, 2), color: '#9edc80', stripe: '#aee68f', angle: 0.35 }, // Sheep Meadow
  { pts: ellipsePts(50, -660, 46, 28, 32, 0.02, 1), color: '#9cdb7c', stripe: '#abe48b', angle: -0.25 }, // Great Lawn
  { pts: ellipsePts(78, -926, 52, 38, 28, 0.03, 4), color: '#98d878', stripe: '#a6e186', angle: 0.6 }, // North Meadow
  { pts: ellipsePts(-30, -1041, 25, 17, 24, 0.05, 3), color: '#9cdb7c', stripe: '#aae48a', angle: 0.1 }, // Great Hill
  { pts: ellipsePts(-12, -286, 34, 26, 26, 0.04, 6), color: '#9edc80', stripe: '#ade68e', angle: 0.9 }, // Heckscher ballfields
  { pts: ellipsePts(-74, -452, 9, 9, 16), color: '#98d878', stripe: '#a6e186', angle: 0 }, // Strawberry Fields
  { pts: ellipsePts(160, -946, 18, 13, 20, 0.04, 2), color: '#9cdb7c', stripe: '#aae48a', angle: 0.3 }, // East Meadow
  { pts: rectPts(155, -1012, 181, -1032), color: '#9edc80', stripe: '#aee68f', angle: Math.PI / 2 }, // Conservatory Garden lawn
];

const WOODS: P[][] = [
  // The Ramble.
  [[-34, -530], [-16, -514], [6, -506], [40, -500], [70, -509], [100, -513], [114, -530], [112, -560], [96, -574], [70, -584], [45, -586], [30, -580], [6, -580], [-20, -576], [-42, -566], [-46, -546]],
  // North Woods (the Ravine round the Loch).
  [[-74, -996], [-46, -993], [-12, -990], [30, -988], [44, -1014], [62, -1036], [82, -1048], [88, -1072], [70, -1090], [38, -1100], [0, -1104], [-40, -1104], [-78, -1098], [-82, -1050]],
  // Hallett Nature Sanctuary (by the Pond).
  [[130, -288], [158, -284], [176, -290], [172, -312], [140, -314], [124, -302]],
  // Woods west of the Reservoir and along the 97th St hills.
  [[-84, -880], [-70, -878], [-56, -900], [-60, -960], [-84, -965]],
];

const PINETUM: P[] = [[-46, -672], [-30, -666], [-8, -670], [-2, -686], [-10, -700], [-30, -703], [-46, -694]];
const CHERRY_WALKS: P[][] = [
  // Cherry trees around the east side of the Reservoir and on Cherry Hill.
  [[120, -704], [160, -704], [160, -870], [120, -870]],
  [[-4, -440], [26, -440], [26, -449], [-4, -449]],
];

// ------------------------------------------------------------------ build the plan

const cache = new Map<string, CentralParkPlan | null>();

export function centralParkPlan(d: DistrictDef): CentralParkPlan | null {
  if (cache.has(d.id)) return cache.get(d.id)!;
  const plan = buildPlan(d);
  cache.set(d.id, plan);
  return plan;
}

function buildPlan(d: DistrictDef): CentralParkPlan | null {
  const rect = centralParkRect(d);
  if (!rect) return null;
  const grass: Rect = { minX: rect.minX + SIDEWALK, maxX: rect.maxX - SIDEWALK, minZ: rect.minZ + SIDEWALK, maxZ: rect.maxZ - SIDEWALK };
  // Design → world.
  const kx = (grass.maxX - grass.minX) / (DX1 - DX0);
  const kz = (grass.maxZ - grass.minZ) / (DZS - DZN);
  const mx = (x: number) => grass.minX + (x - DX0) * kx;
  const mz = (z: number) => grass.maxZ - (DZS - z) * kz;
  const m = (p: XZ): XZ => ({ x: mx(p.x), z: mz(p.z) });
  const mp = (a: P[]): XZ[] => a.map(([x, z]) => ({ x: mx(x), z: mz(z) }));
  const rng = new Rng('central-park-v2');

  // ---- water
  const waters: CPWater[] = WATERS.map((w) => {
    const p = spline(mp(w.pts), true, 2.5);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p) {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
      z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
    }
    return { name: w.name, kind: w.kind, pts: p, x: (x0 + x1) / 2, z: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 };
  });
  const inWater = (x: number, z: number, pad = 0) =>
    waters.some((w) => Math.abs(x - w.x) < w.rx + pad + 1 && Math.abs(z - w.z) < w.rz + pad + 1 && (pointInPoly(x, z, w.pts) || (pad > 0 && distToPoly(x, z, w.pts) < pad)));

  // ---- drives and paths as sampled lines
  const loop = spline(mp(LOOP), true, 2);
  const drives = DRIVES.map((dr) => spline(mp(dr), false, 2));
  const paths = PATHS.map(([p, w, b]) => {
    const closed = p.length > 3 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1];
    const line = closed ? spline(mp(p.slice(0, -1)), true, 2) : p.length > 2 ? spline(mp(p), false, 2) : mp(p);
    if (closed) line.push({ ...line[0] });
    return { pts: line, w, benches: b, closed: false };
  });
  const DRIVE_W = 6.5;
  const plazas = PLAZAS.map((p) => ({ pts: p.pts.map(m), color: p.color }));
  const lawns = LAWNS.map((l) => ({ ...l, pts: l.pts.map(m) }));
  const woods = WOODS.map(mp);
  const pinetum = spline(mp(PINETUM), true, 3);
  const cherry = CHERRY_WALKS.map(mp);

  // Spatial hash of every line segment (paths and drives) for distance tests.
  const CELL = 8;
  const hash = new Map<string, { a: XZ; b: XZ; hw: number }[]>();
  const addLine = (line: XZ[], hw: number, closed = false) => {
    const n = closed ? line.length : line.length - 1;
    for (let i = 0; i < n; i++) {
      const a = line[i], b = line[(i + 1) % line.length];
      const cx0 = Math.floor((Math.min(a.x, b.x) - hw) / CELL), cx1 = Math.floor((Math.max(a.x, b.x) + hw) / CELL);
      const cz0 = Math.floor((Math.min(a.z, b.z) - hw) / CELL), cz1 = Math.floor((Math.max(a.z, b.z) + hw) / CELL);
      for (let cx = cx0; cx <= cx1; cx++)
        for (let cz = cz0; cz <= cz1; cz++) {
          const k = `${cx},${cz}`;
          let l = hash.get(k);
          if (!l) hash.set(k, (l = []));
          l.push({ a, b, hw });
        }
    }
  };
  addLine(loop, DRIVE_W / 2, true);
  for (const dr of drives) addLine(dr, DRIVE_W / 2);
  for (const p of paths) addLine(p.pts, p.w / 2);
  const onLine = (x: number, z: number, pad = 0) => {
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const l = hash.get(`${Math.floor(x / CELL) + dx},${Math.floor(z / CELL) + dz}`);
        if (!l) continue;
        for (const s of l) if (distToSeg(x, z, s.a, s.b) < s.hw + pad) return true;
      }
    void k;
    return false;
  };
  const onPlaza = (x: number, z: number, pad = 0) => plazas.some((p) => pointInPoly(x, z, p.pts) || (pad > 0 && distToPoly(x, z, p.pts) < pad));
  const onPath = (x: number, z: number, pad = 0) => onLine(x, z, pad) || onPlaza(x, z, pad);

  // ---- features (design spots → world)
  const F = (kind: string, x: number, z: number, rot = 0, s = 1): CPFeature => ({ kind, x: mx(x), z: mz(z), rot, s });
  const features: CPFeature[] = [
    F('bethesda', 75, -451, 0, 3.0),
    F('terrace', 75, -438, 0, 1),
    F('carousel', 34, -328, 0, 2.8),
    F('bandshell', 104, -418, -Math.PI / 2, 2.6),
    F('rink', 98, -306, 0, 1),
    F('gapstow', 121, -285, 0, 1),
    F('bowBridge', 21, -481, 0, 1),
    F('boathouse', 113, -497, 0, 1),
    F('dock', 101, -489, -Math.PI / 2, 2.6),
    F('castle', 18, -586, Math.PI, 3.8),
    F('vistaRock', 18, -584, 0, 1),
    F('delacorte', 4, -605, 0, 1),
    F('gatehouse', 84, -700, 0, 1),
    F('gatehouse', 44, -873, Math.PI, 1),
    F('tennis', -24, -898, 0, 1),
    F('blockhouse', -8, -1078, 0.2, 1),
    F('dana', 128, -1101, 0, 1),
    F('lasker', 68, -1004, 0, 1),
    F('cherryFountain', 11, -452, 0, 1),
    F('dairy', 64, -318, 0.3, 1),
    F('consGarden', 168, -1022, 0, 1),
    F('golfSign', 140, -560, -Math.PI / 2, 1),
    F('golfFence', 163, -561, 0, 1),
    F('golfStarter', 163, -592, 0, 2.6),
    F('golfHole', 152, -540, 0, 3.1),
    F('golfBridge', 174, -540, Math.PI, 3.1),
    F('golfTower', 152, -558, 0, 3.1),
    F('golfHole', 174, -558, Math.PI, 3.1),
    F('golfBridge', 152, -576, 0, 3.1),
    F('golfTower', 174, -576, 0.6, 3.1),
    F('playground', 170, -372, Math.PI / 2, 2.4),
    F('playground', -76, -600, -Math.PI / 2, 2.2),
    F('playground', -76, -930, -Math.PI / 2, 2.2),
    F('statue', 72, -362, Math.PI / 2, 1.9),
    F('statue', 88, -366, -Math.PI / 2, 1.9),
    F('statue', -72, -256, -0.8, 3.2), // USS Maine at Columbus Circle
    F('statue', 180, -247, 0.8, 2.6), // Sherman-ish by Grand Army Plaza
    F('pretzel', 61, -246, 0, 1.6),
    F('pretzel', 70, -350, 0.5, 1.6),
    F('pretzel', 160, -468, 0, 1.6),
    F('carriage', 128, -236, Math.PI / 2, 1.6),
    F('carriage', 143, -236, Math.PI / 2, 1.6),
    F('hedges', 168, -1022, 0, 1),
  ];
  // Ball fields: diamonds painted on the grass, a backstop behind home.
  const diamonds: CPFeature[] = [
    F('diamond', -30, -270, 0.6, 1.25), F('diamond', 8, -300, -0.4, 1.25), F('diamond', 14, -264, 2.4, 1.1),
    F('diamond', 14, -644, 0.8, 1.15), F('diamond', 86, -644, -0.8, 1.15), F('diamond', 14, -676, 2.35, 1.15), F('diamond', 86, -676, -2.35, 1.15),
    F('diamond', 42, -906, 0.7, 1.25), F('diamond', 110, -906, -0.7, 1.25), F('diamond', 76, -948, 3.14, 1.25),
  ];
  for (const dm of diamonds) features.push({ ...dm, kind: 'backstop' });
  // Rocks: Manhattan schist breaking through the grass.
  const ROCKS: [number, number, number][] = [
    [30, -284, 1.6], [-20, -372, 1.0], [56, -395, 0.8], [-40, -480, 1.0], [-12, -548, 1.2], [40, -540, 1.1], [80, -546, 1.0], [-26, -568, 0.9],
    [96, -604, 1.0], [-30, -640, 0.9], [-50, -735, 1.0], [150, -690, 0.9], [-40, -905, 1.0], [-50, -1068, 1.2], [20, -1050, 1.1], [62, -1070, 1.0],
    [-60, -1000, 0.9], [-46, -948, 0.9], [176, -440, 0.9], [-60, -540, 0.8], [150, -330, 0.9], [116, -1015, 0.9], [-74, -680, 0.9], [-8, -328, 0.8],
  ];
  for (const [x, z, s] of ROCKS) features.push(F('rocks', x, z, rng.range(0, 6.28), s));

  // Space each feature takes (no trees, lamps or benches on it).
  const R: Record<string, number> = {
    bethesda: 10, terrace: 0, carousel: 9, bandshell: 9, rink: 0, gapstow: 0, bowBridge: 0, boathouse: 10, dock: 5, castle: 13, vistaRock: 0, delacorte: 13, gatehouse: 7,
    tennis: 0, blockhouse: 8, dana: 8, lasker: 0, cherryFountain: 7, dairy: 7, consGarden: 0, golfSign: 4, golfFence: 0, golfStarter: 6, golfHole: 0, golfBridge: 0, golfTower: 0,
    playground: 10, statue: 3, pretzel: 3, carriage: 0, hedges: 0, backstop: 0, rocks: 4,
  };
  const clear: { x: number; z: number; r: number }[] = features.filter((f) => (R[f.kind] ?? 0) > 0).map((f) => ({ x: f.x, z: f.z, r: (R[f.kind] ?? 4) * (f.kind === 'rocks' ? f.s : 1) }));
  // Big flat things as rectangles turned into circles that cover them.
  const clearRect = (x0: number, z0: number, x1: number, z1: number) => {
    const a = m({ x: x0, z: z0 }), b = m({ x: x1, z: z1 });
    const step = 8;
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x += step)
      for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z += step) clear.push({ x, z, r: step * 0.75 });
  };
  clearRect(80, -296, 116, -316); // Wollman
  clearRect(-50, -880, 22, -918); // tennis courts
  clearRect(46, -992, 90, -1016); // Lasker
  clearRect(150, -998, 186, -1046); // Conservatory Garden
  clearRect(140, -524, 186, -598); // mini golf
  for (const dm of diamonds) clear.push({ x: dm.x, z: dm.z, r: 12 * dm.s });

  const blocked = (x: number, z: number, pad = 0) => clear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pad);

  // ---- ground painting
  const paint: PaintOp[] = [];
  for (const w of woods) paint.push({ t: 'fill', pts: spline(w, true, 3), color: '#5a9f4f', alpha: 0.55 });
  paint.push({ t: 'fill', pts: pinetum, color: '#5d9a52', alpha: 0.5 });
  for (const l of lawns) {
    paint.push({ t: 'fill', pts: l.pts, color: l.color });
    paint.push({ t: 'stripes', pts: l.pts, color: l.stripe, gap: 5, angle: l.angle });
  }
  // Rock slabs under the boulders.
  for (const f of features) if (f.kind === 'rocks') paint.push({ t: 'fill', pts: ellipsePts(f.x, f.z, 3.6 * f.s, 2.6 * f.s, 9, 0.25, f.x), color: '#9f9a90' });
  paint.push({ t: 'fill', pts: ellipsePts(mx(18), mz(-584), 15, 11, 12, 0.2, 3), color: '#9a958b' }); // Vista Rock
  paint.push({ t: 'fill', pts: ellipsePts(mx(-8), mz(-1078), 9, 7, 10, 0.25, 5), color: '#9a958b' }); // Blockhouse rock
  for (const dm of diamonds) paint.push({ t: 'diamond', x: dm.x, z: dm.z, rot: dm.rot, s: dm.s });
  // Tennis: 2 rows of 6 clay courts.
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) paint.push({ t: 'tennis', x: mx(-45 + i * 6.6), z: mz(-886 - row * 15), w: 5.6, d: 12 });
  // Water (shore, depth, lilies, the Reservoir's fence).
  for (const w of waters) {
    paint.push({ t: 'water', pts: w.pts, deep: w.kind === 'reservoir' ? '#2c78b8' : w.kind === 'pool' ? '#4fa9d8' : '#3a8fc6', shallow: w.kind === 'reservoir' ? '#4a9bd2' : '#64bfe6', rim: w.kind === 'pool' ? '#d9d1c1' : w.kind === 'reservoir' ? '#c9c0ae' : '#b9ad95', fence: w.kind === 'reservoir', lilies: w.name === 'Turtle Pond' || w.name === 'The Pool' ? 10 : w.name === 'Harlem Meer' ? 8 : w.name === 'The Pond' ? 6 : 0 });
  }
  // The Loch: a stream from the Pool through the woods to the Meer.
  paint.push({ t: 'stroke', pts: spline(mp([[2, -1006], [16, -1016], [32, -1026], [50, -1034], [66, -1048], [80, -1062], [95, -1074]]), false, 2), w: 4.2, color: '#b9ad95' });
  paint.push({ t: 'stroke', pts: spline(mp([[2, -1006], [16, -1016], [32, -1026], [50, -1034], [66, -1048], [80, -1062], [95, -1074]]), false, 2), w: 2.6, color: '#4fa9d8' });
  // Reservoir running track (gravel), round the water.
  const res = waters.find((w) => w.kind === 'reservoir')!;
  const track = grow(res.pts, 6);
  paint.push({ t: 'stroke', pts: track, w: 4.2, color: '#c7b28a', closed: true });
  paint.push({ t: 'stroke', pts: track, w: 3.4, color: '#dcc9a2', closed: true });
  addLine(track, 1.9, true);
  // Plazas.
  for (const p of plazas) {
    paint.push({ t: 'fill', pts: p.pts, color: '#c9b994' });
    paint.push({ t: 'fill', pts: grow(p.pts, -0.5), color: p.color });
  }
  paint.push({ t: 'mosaic', x: mx(-74), z: mz(-452), r: 3.2 }); // Imagine
  // Mini golf: a mowed green with sandy walks between the holes.
  {
    const green = rectPts(mx(143), mz(-529), mx(183), mz(-597));
    paint.push({ t: 'fill', pts: green, color: '#9fdc84' }, { t: 'stripes', pts: green, color: '#aee68f', gap: 2.5, angle: 0 });
    const walk = (a: P[]) => paint.push({ t: 'stroke', pts: mp(a), w: 3, color: '#eadbb0' });
    walk([[140, -563], [163, -563], [163, -530]]);
    walk([[163, -563], [163, -594]]);
    walk([[143, -549], [183, -549]]);
    walk([[143, -567], [183, -567]]);
    walk([[143, -585], [183, -585]]);
  }
  // Rinks.
  paint.push({ t: 'rink', pts: rectPts(mx(84), mz(-298), mx(112), mz(-314)), ice: true }); // Wollman
  paint.push({ t: 'rink', pts: rectPts(mx(50), mz(-996), mx(86), mz(-1012)), ice: false }); // Lasker pool
  // Conservatory Garden: hedged lawn, round beds north and south, gravel walks.
  paint.push({ t: 'fill', pts: rectPts(mx(150), mz(-998), mx(186), mz(-1046)), color: '#d9cba8' });
  paint.push({ t: 'fill', pts: rectPts(mx(155), mz(-1012), mx(181), mz(-1032)), color: '#9edc80' });
  paint.push({ t: 'stripes', pts: rectPts(mx(155), mz(-1012), mx(181), mz(-1032)), color: '#aee68f', gap: 3, angle: Math.PI / 2 });
  for (const zz of [-1004, -1040]) {
    paint.push({ t: 'circle', x: mx(168), z: mz(zz), r: 6.5, color: '#6aa84f' });
    paint.push({ t: 'circle', x: mx(168), z: mz(zz), r: 5, color: zz < -1020 ? '#f4a261' : '#e76f8a' });
    paint.push({ t: 'circle', x: mx(168), z: mz(zz), r: 3, color: zz < -1020 ? '#ffd166' : '#ffb3c6' });
    paint.push({ t: 'circle', x: mx(168), z: mz(zz), r: 1.8, color: '#5fbde6' });
  }
  // Drives: curb, asphalt, a dashed centre line.
  for (const line of [loop, ...drives]) {
    const closed = line === loop;
    paint.push({ t: 'stroke', pts: line, w: DRIVE_W + 1.2, color: '#d6cfbd', closed });
    paint.push({ t: 'stroke', pts: line, w: DRIVE_W, color: '#8f9296', closed });
    paint.push({ t: 'stroke', pts: line, w: 0.35, color: '#f4f1e8', closed, dash: [3, 4] });
  }
  // Paths: a darker edge, then the gravel.
  for (const p of paths) paint.push({ t: 'stroke', pts: p.pts, w: p.w + 0.9, color: '#c8b88f', closed: p.closed });
  for (const p of paths) paint.push({ t: 'stroke', pts: p.pts, w: p.w, color: '#ece2c8', closed: p.closed });
  // The Mall: a wide paved promenade.
  const mall = spline(mp([[80, -352], [79, -380], [77, -405], [76, -430]]), false, 2);
  paint.push({ t: 'stroke', pts: mall, w: 10, color: '#c8b88f' });
  paint.push({ t: 'stroke', pts: mall, w: 9, color: '#e8dcc0' });
  addLine(mall, 5);
  // Picnic blankets on the big lawns.
  const BLANKET = ['#e63946', '#ffffff', '#3a86ff', '#ffbe0b', '#ff006e', '#06d6a0', '#f4a261', '#8338ec'];
  for (const [l, n] of [[lawns[0], 34], [lawns[1], 24], [lawns[3], 8]] as const) {
    let k = 0;
    for (let tries = 0; tries < 400 && k < n; tries++) {
      const x = rng.range(l.pts.reduce((a, p) => Math.min(a, p.x), Infinity), l.pts.reduce((a, p) => Math.max(a, p.x), -Infinity));
      const z = rng.range(l.pts.reduce((a, p) => Math.min(a, p.z), Infinity), l.pts.reduce((a, p) => Math.max(a, p.z), -Infinity));
      if (!pointInPoly(x, z, grow(l.pts, -4)) || blocked(x, z, 2)) continue;
      paint.push({ t: 'blanket', x, z, rot: rng.range(0, 3.14), color: rng.pick(BLANKET) });
      k++;
    }
  }

  // ---- stone wall round the edge, with gates
  const wall: { a: XZ; b: XZ }[] = [];
  const pillars: XZ[] = [];
  const inset = 0.45;
  const W0 = grass.minX + inset, W1 = grass.maxX - inset, Z0 = grass.minZ + inset, Z1 = grass.maxZ - inset;
  /** One side of the wall from a to b (along one axis), cut at the gates (design positions along that side). */
  const side = (fixed: number, from: number, to: number, alongX: boolean, gates: number[], corner: number) => {
    const g = gates.map((v) => (alongX ? mx(v) : mz(v))).sort((a, b) => a - b);
    const lo = Math.min(from, to) + corner, hi = Math.max(from, to) - corner;
    const cuts: [number, number][] = [];
    let s = lo;
    for (const v of g) {
      const half = 4;
      if (v - half > s) cuts.push([s, v - half]);
      s = Math.max(s, v + half);
    }
    if (hi > s) cuts.push([s, hi]);
    for (const [a, b] of cuts) {
      if (b - a < 1) continue;
      wall.push(alongX ? { a: { x: a, z: fixed }, b: { x: b, z: fixed } } : { a: { x: fixed, z: a }, b: { x: fixed, z: b } });
      pillars.push(alongX ? { x: a, z: fixed } : { x: fixed, z: a }, alongX ? { x: b, z: fixed } : { x: fixed, z: b });
    }
  };
  const corner = 17;
  side(Z1, W0, W1, true, [-30, 55, 118], corner); // south (59th St)
  side(Z0, W0, W1, true, [-20, 54, 120], corner); // north (110th St)
  side(W0, Z0, Z1, false, [-376, -455, -495, -616, -723, -864, -970], corner); // west (CPW)
  side(W1, Z0, Z1, false, [-376, -495, -616, -723, -864, -970, -1022], corner); // east (5th Ave)

  // ---- lamps and benches along the paths
  const lamps: XZ[] = [];
  const benches: { x: number; z: number; rot: number }[] = [];
  const near = (list: XZ[], x: number, z: number, r: number) => list.some((p) => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r && Math.hypot(p.x - x, p.z - z) < r);
  const along = (line: XZ[], every: number, fn: (p: XZ, nx: number, nz: number, i: number) => void, start = every / 2) => {
    let acc = every - start, i = 0;
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1], b = line[k];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (!len) continue;
      while (acc + len >= every) {
        const t = (every - acc) / len;
        acc -= every;
        const p = { x: a.x + (b.x - a.x) * Math.max(0, t), z: a.z + (b.z - a.z) * Math.max(0, t) };
        fn(p, -(b.z - a.z) / len, (b.x - a.x) / len, i++);
      }
      acc += len;
    }
  };
  const inGrass = (x: number, z: number, pad: number) => x > grass.minX + pad && x < grass.maxX - pad && z > grass.minZ + pad && z < grass.maxZ - pad;
  const okSpot = (x: number, z: number) => inGrass(x, z, 1.5) && !inWater(x, z, 1.2) && !blocked(x, z, 0.5) && !onPath(x, z, 0.3);
  for (const p of paths) {
    along(p.pts, 22, (q, nx, nz, i) => {
      const s = i % 2 ? 1 : -1;
      const x = q.x + nx * s * (p.w / 2 + 0.9), z = q.z + nz * s * (p.w / 2 + 0.9);
      if (okSpot(x, z) && !near(lamps, x, z, 9)) lamps.push({ x, z });
    });
    if (p.benches)
      along(p.pts, 17, (q, nx, nz, i) => {
        const s = i % 2 ? -1 : 1;
        const off = p.w / 2 + 1.1;
        const x = q.x + nx * s * off, z = q.z + nz * s * off;
        // Bench front (+z) faces the path.
        if (okSpot(x, z) && !near(lamps, x, z, 2.2) && !near(benches, x, z, 5)) benches.push({ x, z, rot: Math.atan2(-nx * s, -nz * s) });
      }, 9);
  }
  for (const dr of [loop, ...drives]) {
    along(dr, 30, (q, nx, nz) => {
      const x = q.x + nx * (DRIVE_W / 2 + 1.0), z = q.z + nz * (DRIVE_W / 2 + 1.0);
      if (okSpot(x, z) && !near(lamps, x, z, 10)) lamps.push({ x, z });
    });
  }
  // The Mall: benches in long rows and lamps between the elms.
  along(mall, 6.5, (q, nx, nz, i) => {
    for (const s of [-1, 1]) {
      const x = q.x + nx * s * 5.4, z = q.z + nz * s * 5.4;
      if (i % 3 === 1) lamps.push({ x, z });
      else if (!blocked(x, z)) benches.push({ x, z, rot: Math.atan2(-nx * s, -nz * s) });
    }
  });
  // Benches facing out along the outside of the wall (the classic park-side benches).
  for (const w of wall) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    const alongX = Math.abs(w.b.x - w.a.x) > 1;
    for (let t = 6; t < len - 4; t += 22) {
      const x = alongX ? Math.min(w.a.x, w.b.x) + t : w.a.x;
      const z = alongX ? w.a.z : Math.min(w.a.z, w.b.z) + t;
      // Outside the wall, on the sidewalk, backs to the wall.
      const ox = alongX ? 0 : x < (grass.minX + grass.maxX) / 2 ? -1 : 1;
      const oz = alongX ? (z < (grass.minZ + grass.maxZ) / 2 ? -1 : 1) : 0;
      benches.push({ x: x + ox * 1.3, z: z + oz * 1.3, rot: Math.atan2(ox, oz) });
    }
  }
  // Lamps along the sidewalk by the wall too.
  for (const w of wall) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    const alongX = Math.abs(w.b.x - w.a.x) > 1;
    for (let t = 12; t < len - 4; t += 30) {
      const x = alongX ? Math.min(w.a.x, w.b.x) + t + 7 : w.a.x;
      const z = alongX ? w.a.z : Math.min(w.a.z, w.b.z) + t + 7;
      const ox = alongX ? 0 : x < (grass.minX + grass.maxX) / 2 ? -1 : 1;
      const oz = alongX ? (z < (grass.minZ + grass.maxZ) / 2 ? -1 : 1) : 0;
      lamps.push({ x: x + ox * 2.6, z: z + oz * 2.6 });
    }
  }

  // ---- boats: circles that stay on the water
  const loopFits = (x: number, z: number, r: number, w: CPWater) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!pointInPoly(px, pz, w.pts) || distToPoly(px, pz, w.pts) < 3) return false;
    }
    return true;
  };
  const boatLoops = (w: CPWater | undefined, n: number, rMin: number, rMax: number) => {
    const out: { x: number; z: number; r: number }[] = [];
    if (!w) return out;
    for (let tries = 0; tries < 600 && out.length < n; tries++) {
      const x = rng.range(w.x - w.rx, w.x + w.rx), z = rng.range(w.z - w.rz, w.z + w.rz), r = rng.range(rMin, rMax);
      if (!loopFits(x, z, r, w) || out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 2.5)) continue;
      out.push({ x, z, r });
    }
    return out;
  };
  const rowboats = boatLoops(waters.find((w) => w.name === 'The Lake'), 9, 2.5, 6);
  const sailboats = boatLoops(waters.find((w) => w.name === 'Conservatory Water'), 4, 1.5, 3);

  // ---- no walking on water: rectangles (rows of cells inside the water)
  const solids: Rect[] = [];
  for (const w of waters) {
    const step = 4;
    for (let z = w.z - w.rz; z < w.z + w.rz; z += step) {
      let run: number | null = null;
      for (let x = w.x - w.rx; x <= w.x + w.rx + step; x += step) {
        const inside = [[0, 0], [step, 0], [0, step], [step, step]].every(([dx, dz]) => pointInPoly(x + dx, z + dz, w.pts));
        if (inside && run === null) run = x;
        if (!inside && run !== null) {
          solids.push({ minX: run + 0.6, maxX: x - 0.6 + step, minZ: z + 0.6, maxZ: z + step - 0.6 });
          run = null;
        }
      }
    }
  }

  // ---- tree spots
  const treeSpots: CentralParkPlan['treeSpots'] = [];
  const shoreDist = (x: number, z: number) => {
    let dd = Infinity;
    for (const w of waters) if (Math.abs(x - w.x) < w.rx + 14 && Math.abs(z - w.z) < w.rz + 14) dd = Math.min(dd, distToPoly(x, z, w.pts));
    return dd;
  };
  const inLawn = (x: number, z: number) => lawns.some((l) => pointInPoly(x, z, l.pts));
  // The Mall's elms: four rows forming the green "cathedral".
  along(mall, 7.5, (q, nx, nz) => {
    for (const off of [-10.5, -6.8, 6.8, 10.5]) {
      const x = q.x + nx * off, z = q.z + nz * off;
      if (!blocked(x, z) && !onLine(x, z, 0.5)) treeSpots.push({ x, z, s: rng.range(1.55, 1.8), zone: 'mall' });
    }
  }, 3);
  const SP = 6.2;
  for (let gx = grass.minX + 3; gx < grass.maxX - 3; gx += SP)
    for (let gz = grass.minZ + 3; gz < grass.maxZ - 3; gz += SP) {
      const x = gx + rng.range(-SP * 0.42, SP * 0.42);
      const z = gz + rng.range(-SP * 0.42, SP * 0.42);
      const roll = rng.next();
      if (!inGrass(x, z, 2.2)) continue;
      if (inWater(x, z, 2.4) || onPath(x, z, 1.6) || blocked(x, z) || inLawn(x, z)) continue;
      if (treeSpots.some((t) => t.zone === 'mall' && Math.abs(t.x - x) < 4 && Math.abs(t.z - z) < 4)) continue;
      const edge = Math.min(x - grass.minX, grass.maxX - x, z - grass.minZ, grass.maxZ - z);
      const sd = shoreDist(x, z);
      let dens: number, zone: CentralParkPlan['treeSpots'][number]['zone'];
      if (pointInPoly(x, z, pinetum)) (dens = 0.8), (zone = 'pinetum');
      else if (cherry.some((c) => pointInPoly(x, z, c))) (dens = 0.75), (zone = 'cherry');
      else if (woods.some((w) => pointInPoly(x, z, w))) (dens = 0.88), (zone = 'woods');
      else if (edge < 13) (dens = 0.78), (zone = 'edge');
      else if (sd < 11) (dens = 0.55), (zone = 'shore');
      else {
        const n = valueNoise(x / 38, z / 38, 7) * 0.7 + valueNoise(x / 13, z / 13, 3) * 0.3;
        dens = 0.12 + 0.68 * Math.min(1, Math.max(0, (n - 0.4) / 0.3));
        zone = 'grove';
      }
      if (roll > dens) continue;
      const s = zone === 'woods' ? rng.range(1.25, 1.7) : zone === 'cherry' ? rng.range(0.95, 1.2) : zone === 'pinetum' ? rng.range(1.2, 1.6) : rng.range(1.1, 1.6);
      treeSpots.push({ x, z, s, zone: sd < 6 && zone !== 'cherry' ? 'shore' : zone });
    }

  return {
    rect,
    grass,
    waters,
    paint,
    features,
    lamps,
    benches,
    wall,
    pillars,
    rowboats,
    sailboats,
    solids,
    clear,
    onPath,
    inWater,
    lawns: lawns.map((l) => l.pts),
    woods,
    treeSpots,
  };
}

// ------------------------------------------------------------------ trees, by season

/** The season from a game date key ('2026-10-30'). */
export function seasonOf(dateKey: string): Season {
  const mth = Number(dateKey.slice(5, 7)) || 7;
  return mth >= 3 && mth <= 5 ? 'spring' : mth >= 6 && mth <= 8 ? 'summer' : mth >= 9 && mth <= 11 ? 'autumn' : 'winter';
}

const COLORS: Record<Season, Record<TreeKind, string[]>> = {
  summer: {
    elm: ['#4f9d4a', '#5cb85c', '#46914a', '#63b55a'],
    oak: ['#3f8f45', '#4a9a4c', '#2f7d3f', '#579f4c'],
    maple: ['#5cb85c', '#6cc66a', '#4fa857'],
    pine: ['#2d6a4f', '#24604a', '#2f7352'],
    cherry: ['#6cc66a', '#5cb85c'],
    willow: ['#9ccf5a', '#8fc55a'],
  },
  autumn: {
    elm: ['#d9b23a', '#c9b52f', '#8db34a', '#e0a63e', '#6faa48'],
    oak: ['#b5651d', '#a8742a', '#8d9a3a', '#6c8f3c', '#c27a2c'],
    maple: ['#e8743b', '#d9472b', '#f2a541', '#c0392b', '#ef8a2e'],
    pine: ['#2d6a4f', '#24604a', '#2f7352'],
    cherry: ['#d9533b', '#e38b4f', '#c94a3a'],
    willow: ['#c9c255', '#b5bf52'],
  },
  spring: {
    elm: ['#8fd16a', '#7cc95e', '#a5dd7a'],
    oak: ['#79c25a', '#8acd63', '#6cb855'],
    maple: ['#9ad36b', '#c4e07a', '#e05d4f'],
    pine: ['#2d6a4f', '#2f7352'],
    cherry: ['#ffb7cf', '#ffc8dd', '#f7a1c4', '#fff0f5'],
    willow: ['#c8e67a', '#b8df6e'],
  },
  winter: {
    elm: ['#8a7d6e', '#958877', '#7d8c6a'],
    oak: ['#8f7a62', '#7f6d5a', '#6f7f5e'],
    maple: ['#9a8570', '#8a7563'],
    pine: ['#2b5f47', '#285a44', '#30684d'],
    cherry: ['#8a7563', '#9a8570'],
    willow: ['#a3a06a', '#9a9a68'],
  },
};

/** Every park tree with its species and colour for the season. */
export function centralParkTrees(plan: CentralParkPlan, season: Season): CPTree[] {
  const rng = new Rng(`central-park-trees-${season}`);
  const pal = COLORS[season];
  return plan.treeSpots.map((t) => {
    let sp: TreeKind;
    switch (t.zone) {
      case 'mall': sp = 'elm'; break;
      case 'pinetum': sp = rng.chance(0.85) ? 'pine' : 'oak'; break;
      case 'cherry': sp = rng.chance(0.85) ? 'cherry' : 'elm'; break;
      case 'shore': sp = rng.chance(0.45) ? 'willow' : rng.chance(0.4) ? 'maple' : 'oak'; break;
      case 'woods': sp = rng.chance(0.08) ? 'pine' : rng.chance(0.35) ? 'maple' : rng.chance(0.5) ? 'oak' : 'elm'; break;
      default: sp = rng.chance(0.06) ? 'pine' : rng.chance(0.3) ? 'maple' : rng.chance(0.5) ? 'elm' : 'oak';
    }
    return { x: t.x, z: t.z, y: 0.28, sp, s: sp === 'cherry' ? t.s * 0.9 : t.s, c: rng.pick(pal[sp]) };
  });
}
