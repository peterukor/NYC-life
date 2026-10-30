// =====================================================================
// drive.ts — driving your own car on the map (no 3D here: my-car.ts draws).
//
//   • Road graph: a node at every grid crossing that is real asphalt
//     (layout.ts onRoad, not a closed park/joined-block gap, on land) and
//     an edge along each avenue / street between neighbouring crossings
//     whose whole length is road. Blocks in the river have no road, so no
//     route ever goes into the water.
//   • Routes: Dijkstra over DIRECTED edges (which way you drive down a
//     road), so a route starts the way the car is facing and ends with the
//     destination on the car's right, at the kerb. Turns cost a little
//     (left more than right), U-turns a lot.
//   • Lanes: drive on the right, like traffic.ts: avenue lanes 2.3 m and
//     street lanes 2.2 m right of the centre line; you stop at the kerb
//     side, beside the parked cars (DRIVE.kerb). Corners are rounded with circular arcs (a real turning
//     radius), lane changes in and out of the kerb are gentle diagonals.
//   • CarController: a tiny vehicle model. Pure pursuit steering (aim at
//     a point a few metres ahead on the path, curvature limited by the
//     turning radius), smooth accelerate / brake, slows for corners
//     (lateral grip), stops at red lights (the same signal cycle as
//     traffic-flow.ts) and keeps a gap behind the car ahead. Body roll in
//     turns and nose dip under braking, like the traffic.
// =====================================================================

import { avenueX, inParkGap, onRoad, streetZ, type DistrictDef } from './layout.ts';

export interface XZ {
  x: number;
  z: number;
}
export interface Pose extends XZ {
  /** Heading: 0 faces +z, like the traffic (atan2(dx, dz)). */
  yaw: number;
}
export type RoadAxis = 'ave' | 'st';

export const DRIVE = {
  /** Right-hand lane offset from the centre line (traffic.ts). */
  lane: { ave: 2.3, st: 2.2 } as Record<RoadAxis, number>,
  /**
   * Where you stop (offset from the centre line). The kerb lane is lined
   * with parked cars (nycgen/props.ts: 7.2 / 6.7 m out, baked into the
   * city mesh at random spots), so you stop beside them, NYC style
   * (double-parked): clear of them and of the traffic lane.
   */
  kerb: { ave: 4.75, st: 4.45 } as Record<RoadAxis, number>,
  /** Half the car's length (m). */
  halfLen: 2.3,
  /** Top speed (m/s): about the old "walking × 3.2". game.ts passes the exact value. */
  vMax: 21,
  accel: 6.5,
  /** Comfortable braking (planning), and the hardest the car will brake. */
  brake: 8,
  maxBrake: 18,
  /** Lateral grip: corner speed = sqrt(latAcc · radius). */
  latAcc: 6,
  /** Tightest turning circle radius (m). */
  minRadius: 4.2,
  /** How fast the steering can move (curvature per second). */
  steerRate: 1.6,
  /** Bumper-to-bumper gap behind a stopped car. */
  minGap: 2.4,
  /** Metres to pull out of / into the kerb lane. */
  pullOut: 10,
  pullIn: 12,
  /** Corner rounding (tangent length, m): right turns are tighter than left. */
  cut: { right: 6.5, left: 9 },
  /** Never park closer than this to a crossing's centre (crosswalk + room). */
  parkMargin: 18,
};

// ---------------------------------------------------------------------
// Road graph
// ---------------------------------------------------------------------

export interface RoadNode extends XZ {
  i: number;
  j: number;
  /** Edge ids touching this node. */
  edges: number[];
  /** A signalled crossing (an avenue meets a street). */
  signal: boolean;
}
export interface RoadEdge {
  a: number;
  b: number;
  axis: RoadAxis;
  len: number;
  /** Unit direction a → b. */
  ux: number;
  uz: number;
}
export interface RoadGraph {
  d: DistrictDef;
  nodes: RoadNode[];
  edges: RoadEdge[];
  /** Is (x, z) drivable asphalt (on a road, not a park gap, on land)? */
  ok: (x: number, z: number) => boolean;
}

/** right(h) for a heading vector: heading +z → right is −x (traffic.ts). */
const rightOf = (hx: number, hz: number): XZ => ({ x: -hz, z: hx });

/**
 * Build the drivable road graph of an area. `land` is an extra "is this
 * on land" test (game.ts passes the street nav grid, which knows the
 * coastline); the grid's own water blocks are always excluded.
 */
export function buildRoadGraph(d: DistrictDef, land?: (x: number, z: number) => boolean): RoadGraph {
  const ok = (x: number, z: number) => onRoad(d, x, z) && !inParkGap(d, x, z) && (!land || land(x, z));
  const nodes: RoadNode[] = [];
  const at = new Map<number, number>();
  for (let i = 0; i <= d.cols; i++) {
    for (let j = 0; j <= d.rows; j++) {
      const x = avenueX(d, i), z = streetZ(d, j);
      if (!ok(x, z)) continue;
      at.set(i * 1000 + j, nodes.length);
      nodes.push({ x, z, i, j, edges: [], signal: false });
    }
  }
  const edges: RoadEdge[] = [];
  const link = (n0: number | undefined, n1: number | undefined, axis: RoadAxis) => {
    if (n0 === undefined || n1 === undefined) return;
    const A = nodes[n0], B = nodes[n1];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len;
    const r = rightOf(ux, uz);
    const off = DRIVE.lane[axis];
    // The centre line has to be asphalt all the way, and both lanes
    // between the crossings (a T-junction's corner may be cut off).
    const box = (axis === 'ave' ? d.streetW : d.avenueW) / 2;
    for (let t = 0; t <= len; t += 2) {
      const cx = A.x + ux * t, cz = A.z + uz * t;
      if (!ok(cx, cz)) return;
      if (t > box && t < len - box && (!ok(cx + r.x * off, cz + r.z * off) || !ok(cx - r.x * off, cz - r.z * off))) return;
    }
    const e = edges.length;
    edges.push({ a: n0, b: n1, axis, len, ux, uz });
    A.edges.push(e);
    B.edges.push(e);
  };
  for (let i = 0; i <= d.cols; i++) for (let j = 0; j < d.rows; j++) link(at.get(i * 1000 + j), at.get(i * 1000 + j + 1), 'ave');
  for (let j = 0; j <= d.rows; j++) for (let i = 0; i < d.cols; i++) link(at.get(i * 1000 + j), at.get((i + 1) * 1000 + j), 'st');
  for (const n of nodes) {
    const axes = new Set(n.edges.map((e) => edges[e].axis));
    n.signal = axes.size === 2 && n.edges.length >= 3;
  }
  return { d, nodes, edges, ok };
}

/** Half the width of the road crossing an `axis` road (where its stop line goes). */
function crossHalf(d: DistrictDef, axis: RoadAxis): number {
  return (axis === 'ave' ? d.streetW : d.avenueW) / 2;
}

interface Spot {
  edge: number;
  /** Distance from node a along the edge. */
  t: number;
  /** Signed distance to the right of a → b. */
  lat: number;
  dist: number;
}

/** The nearest edge to (x, z). `yaw` given: prefer edges running that way. */
function nearestEdge(g: RoadGraph, x: number, z: number, yaw?: number): Spot | null {
  let best: Spot | null = null;
  let bestScore = Infinity;
  const hx = yaw === undefined ? 0 : Math.sin(yaw), hz = yaw === undefined ? 0 : Math.cos(yaw);
  g.edges.forEach((e, ei) => {
    const A = g.nodes[e.a];
    const t = Math.max(0, Math.min(e.len, (x - A.x) * e.ux + (z - A.z) * e.uz));
    const px = A.x + e.ux * t, pz = A.z + e.uz * t;
    const dist = Math.hypot(x - px, z - pz);
    const r = rightOf(e.ux, e.uz);
    const lat = (x - px) * r.x + (z - pz) * r.z;
    const score = dist + (yaw === undefined ? 0 : (1 - Math.abs(hx * e.ux + hz * e.uz)) * 8);
    if (score < bestScore) {
      bestScore = score;
      best = { edge: ei, t, lat, dist };
    }
  });
  return best;
}

/** A point `t` metres from the START of directed edge (e, dir), `off` metres to its right. */
function onDirected(g: RoadGraph, e: number, dir: 0 | 1, t: number, off: number): XZ {
  const E = g.edges[e];
  const S = g.nodes[dir === 0 ? E.a : E.b];
  const hx = dir === 0 ? E.ux : -E.ux, hz = dir === 0 ? E.uz : -E.uz;
  const r = rightOf(hx, hz);
  return { x: S.x + hx * t + r.x * off, z: S.z + hz * t + r.z * off };
}

function headingOf(g: RoadGraph, e: number, dir: 0 | 1): XZ {
  const E = g.edges[e];
  return dir === 0 ? { x: E.ux, z: E.uz } : { x: -E.ux, z: -E.uz };
}

/** The kerb lane, or a bit further in if the kerb lane isn't asphalt here. */
function kerbOffset(g: RoadGraph, e: number, dir: 0 | 1, t: number): number {
  const ax = g.edges[e].axis;
  for (let off = DRIVE.kerb[ax]; off > DRIVE.lane[ax]; off -= 0.5) {
    const p = onDirected(g, e, dir, t, off);
    if (g.ok(p.x, p.z)) return off;
  }
  return DRIVE.lane[ax];
}

export interface KerbSpot extends Pose {
  edge: number;
  dir: 0 | 1;
  /** Distance along the directed edge. */
  t: number;
}

/**
 * Where to park for (x, z): the kerb of the nearest road, on the same
 * side as (x, z), facing so that kerb is on the car's right, and clear of
 * the crossings at either end.
 */
export function kerbNear(g: RoadGraph, x: number, z: number): KerbSpot | null {
  const sp = nearestEdge(g, x, z);
  if (!sp) return null;
  const E = g.edges[sp.edge];
  const dir: 0 | 1 = sp.lat >= 0 ? 0 : 1;
  let t = dir === 0 ? sp.t : E.len - sp.t;
  const m = Math.min(DRIVE.parkMargin, E.len / 2);
  t = Math.max(m, Math.min(E.len - m, t));
  const p = onDirected(g, sp.edge, dir, t, kerbOffset(g, sp.edge, dir, t));
  const h = headingOf(g, sp.edge, dir);
  return { x: p.x, z: p.z, yaw: Math.atan2(h.x, h.z), edge: sp.edge, dir, t };
}

// ---------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------

export interface DriveRoute {
  /** The path, sampled every metre or less, corners rounded. */
  pts: XZ[];
  cum: number[];
  length: number;
  /** Fastest safe speed at each sample (corners). */
  vCap: number[];
  /** Stop lines: distance along the path where the car's FRONT stops on red. */
  stops: { s: number; axis: RoadAxis }[];
  /** Where it parks. */
  park: Pose;
  /** The crossings it passes (QA). */
  via: XZ[];
  /** Starting from the kerb: lane points that must be clear of traffic before pulling out. */
  merge: XZ[];
}

/** A tiny binary heap of [cost, id]. */
class Heap {
  private a: [number, number][] = [];
  get size(): number {
    return this.a.length;
  }
  push(c: number, id: number): void {
    const a = this.a;
    a.push([c, id]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const TURN_COST = { straight: 0, right: 4, left: 10, uturn: 90 };

function turnKind(h1: XZ, h2: XZ): keyof typeof TURN_COST {
  const dot = h1.x * h2.x + h1.z * h2.z;
  if (dot > 0.7) return 'straight';
  if (dot < -0.7) return 'uturn';
  return h1.x * h2.z - h1.z * h2.x > 0 ? 'right' : 'left';
}

interface Vtx extends XZ {
  /** Corner rounding (tangent length); 0 = a sharp point (or already curved). */
  cut: number;
}

/**
 * Plan a drive from a car pose to the kerb nearest `to`. Null if there's
 * no road (the areas are all one network, so only off-grid spots fail).
 */
export function planRoute(g: RoadGraph, from: Pose & { v?: number }, to: XZ, vMax = DRIVE.vMax): DriveRoute | null {
  const start = nearestEdge(g, from.x, from.z, from.yaw);
  const goal = kerbNear(g, to.x, to.z);
  if (!start || !goal) return null;
  const E0 = g.edges[start.edge];
  const dir0: 0 | 1 = Math.sin(from.yaw) * E0.ux + Math.cos(from.yaw) * E0.uz >= 0 ? 0 : 1;
  const t0 = dir0 === 0 ? start.t : E0.len - start.t;
  const v0 = from.v ?? 0;
  const startLat = Math.abs(start.lat);

  // Directed edge id = edge·2 + dir. Dijkstra from the end of the start edge.
  const N = g.edges.length * 2;
  const endNode = (de: number) => {
    const E = g.edges[de >> 1];
    return de & 1 ? E.a : E.b;
  };
  const de0 = start.edge * 2 + dir0;
  const deG = goal.edge * 2 + goal.dir;
  let chain: number[] | null = null;
  // Straight there along the same stretch of road?
  if (de0 === deG && goal.t - t0 > DRIVE.pullOut + 4) chain = [de0];
  else {
    const cost = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap = new Heap();
    cost[de0] = 0;
    heap.push(0, de0);
    // The goal is tracked on its own, so a trip back to a spot just behind
    // you on the same road (round the block) is found too.
    let best = Infinity, bestPrev = -1;
    while (heap.size) {
      const [c, de] = heap.pop();
      if (c > cost[de]) continue;
      if (c >= best) break;
      const n = endNode(de);
      const h1 = headingOf(g, de >> 1, (de & 1) as 0 | 1);
      for (const ei of g.nodes[n].edges) {
        const E = g.edges[ei];
        const nd = ei * 2 + (E.a === n ? 0 : 1);
        const turn = TURN_COST[turnKind(h1, headingOf(g, ei, (nd & 1) as 0 | 1))];
        if (nd === deG && c + goal.t + turn < best) {
          best = c + goal.t + turn;
          bestPrev = de;
        }
        const nc = c + E.len + turn;
        if (nc < cost[nd]) {
          cost[nd] = nc;
          prev[nd] = de;
          heap.push(nc, nd);
        }
      }
    }
    if (bestPrev < 0) return null;
    chain = [deG];
    for (let de = bestPrev; de >= 0 && chain.length < 400; de = prev[de]) {
      chain.push(de);
      if (de === de0) break;
    }
    if (chain[chain.length - 1] !== de0) return null;
    chain.reverse();
  }

  // ---- lane polyline
  const d = g.d;
  const vtx: Vtx[] = [{ x: from.x, z: from.z, cut: 0 }];
  const stopsAt: { q: XZ; axis: RoadAxis }[] = [];
  const via: XZ[] = [];
  const legE = (k: number) => chain![k] >> 1;
  const legD = (k: number) => (chain![k] & 1) as 0 | 1;
  const last = chain.length - 1;
  // Pull out of the kerb (or carry on, if already moving) into the lane.
  {
    const E = g.edges[legE(0)];
    const off = DRIVE.lane[E.axis];
    const endT = last === 0 ? goal.t - DRIVE.pullIn - 8 : E.len - crossHalf(d, E.axis) - 2;
    const t = Math.min(t0 + Math.max(DRIVE.pullOut, v0 * 0.9), endT);
    if (t > t0 + 2) vtx.push({ ...onDirected(g, legE(0), legD(0), t, off), cut: 4 });
  }
  for (let k = 0; k < last; k++) {
    const e1 = legE(k), e2 = legE(k + 1);
    const h1 = headingOf(g, e1, legD(k)), h2 = headingOf(g, e2, legD(k + 1));
    const P = g.nodes[endNode(chain[k])];
    via.push({ x: P.x, z: P.z });
    const ax1 = g.edges[e1].axis, ax2 = g.edges[e2].axis;
    const o1 = DRIVE.lane[ax1], o2 = DRIVE.lane[ax2];
    const r1 = rightOf(h1.x, h1.z), r2 = rightOf(h2.x, h2.z);
    if (P.signal) {
      const back = crossHalf(d, ax1) + 3.6; // the same stop line as the traffic (traffic.ts)
      stopsAt.push({ q: { x: P.x + r1.x * o1 - h1.x * back, z: P.z + r1.z * o1 - h1.z * back }, axis: ax1 });
    }
    const kind = turnKind(h1, h2);
    if (kind === 'straight') {
      vtx.push({ x: P.x + r1.x * o1, z: P.z + r1.z * o1, cut: 0 });
    } else if (kind === 'uturn') {
      // A U-turn in the crossing: a left-hand half circle at full lock
      // from my lane, ending out by the far kerb, then back into the lane.
      const R = DRIVE.minRadius + 0.3;
      const cx = P.x + r1.x * (o1 - R), cz = P.z + r1.z * (o1 - R);
      for (let s = 0; s <= 10; s++) {
        const th = (s / 10) * Math.PI;
        vtx.push({ x: cx + r1.x * R * Math.cos(th) + h1.x * R * Math.sin(th), z: cz + r1.z * R * Math.cos(th) + h1.z * R * Math.sin(th), cut: 0 });
      }
      vtx.push({ x: P.x + h2.x * 2 * R + r2.x * o2, z: P.z + h2.z * 2 * R + r2.z * o2, cut: 3 });
    } else {
      // Where the two lanes meet; rounded off below.
      vtx.push({ x: P.x + r1.x * o1 + r2.x * o2, z: P.z + r1.z * o1 + r2.z * o2, cut: kind === 'right' ? DRIVE.cut.right : DRIVE.cut.left });
    }
  }
  // Pull in to the kerb.
  {
    const E = g.edges[goal.edge];
    const off = DRIVE.lane[E.axis];
    const minT = last === 0 ? t0 + 3 : crossHalf(d, E.axis) + 3;
    // Diagonal into the kerb lane, then a few metres straight along it to stop.
    const kerbT = Math.max(minT + 4, goal.t - 6);
    const t = Math.max(minT, kerbT - DRIVE.pullIn);
    const lastV = vtx[vtx.length - 1];
    const p = onDirected(g, goal.edge, goal.dir, t, off);
    if (t < kerbT - 2 && Math.hypot(p.x - lastV.x, p.z - lastV.z) > 1) vtx.push({ ...p, cut: 4 });
    if (kerbT < goal.t - 1.5) vtx.push({ ...onDirected(g, goal.edge, goal.dir, kerbT, kerbOffset(g, goal.edge, goal.dir, goal.t)), cut: 3 });
    vtx.push({ x: goal.x, z: goal.z, cut: 0 });
  }

  const pts = densify(fillet(vtx));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const vCap = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 2)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 2)];
    const k = curvature(a, b, c);
    return k < 1e-4 ? vMax : Math.min(vMax, Math.sqrt(DRIVE.latAcc / k));
  });
  // Stop lines: the nearest path sample, in order along the path.
  const stops: DriveRoute['stops'] = [];
  let from_i = 0;
  for (const st of stopsAt) {
    let bi = -1, bd = 2.5;
    for (let i = from_i; i < pts.length; i++) {
      const dd = Math.hypot(pts[i].x - st.q.x, pts[i].z - st.q.z);
      if (dd < bd) {
        bd = dd;
        bi = i;
      }
    }
    if (bi > 0) {
      stops.push({ s: cum[bi], axis: st.axis });
      from_i = bi;
    }
  }
  // Pulling out of the kerb: look ahead and back up the lane first.
  const merge: XZ[] = [];
  if (startLat > DRIVE.lane[E0.axis] + 1.2 && v0 < 2) {
    const off = DRIVE.lane[E0.axis];
    merge.push(onDirected(g, start.edge, dir0, t0 + 7, off), onDirected(g, start.edge, dir0, t0 - 8, off), onDirected(g, start.edge, dir0, t0 - 22, off));
  }
  return { pts, cum, length: cum[cum.length - 1], vCap, stops, park: { x: goal.x, z: goal.z, yaw: goal.yaw }, via, merge };
}

/** Round each corner with a circular arc whose tangent length is the vertex's `cut`. */
function fillet(v: Vtx[]): XZ[] {
  const out: XZ[] = [v[0]];
  for (let k = 1; k < v.length - 1; k++) {
    const P0 = v[k - 1], P1 = v[k], P2 = v[k + 1];
    const l1 = Math.hypot(P1.x - P0.x, P1.z - P0.z), l2 = Math.hypot(P2.x - P1.x, P2.z - P1.z);
    if (!P1.cut || l1 < 1e-3 || l2 < 1e-3) {
      out.push(P1);
      continue;
    }
    const d1 = { x: (P1.x - P0.x) / l1, z: (P1.z - P0.z) / l1 };
    const d2 = { x: (P2.x - P1.x) / l2, z: (P2.z - P1.z) / l2 };
    const th = Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.z * d2.z)));
    if (th < 0.01 || th > Math.PI - 0.05) {
      out.push(P1);
      continue;
    }
    const T = Math.min(P1.cut, l1 * 0.45, l2 * 0.45);
    const r = T / Math.tan(th / 2);
    const A = { x: P1.x - d1.x * T, z: P1.z - d1.z * T };
    const right = d1.x * d2.z - d1.z * d2.x > 0;
    const n = right ? rightOf(d1.x, d1.z) : { x: d1.z, z: -d1.x };
    const O = { x: A.x + n.x * r, z: A.z + n.z * r };
    const vx = A.x - O.x, vz = A.z - O.z;
    const sgn = right ? 1 : -1;
    const steps = Math.max(2, Math.ceil((r * th) / 0.6));
    for (let s = 0; s <= steps; s++) {
      const ph = (sgn * th * s) / steps;
      // Rotating (vx, vz) by +ph turns the same way as a right turn (x' = x cos − z sin).
      const c = Math.cos(ph), si = Math.sin(ph);
      out.push({ x: O.x + vx * c - vz * si, z: O.z + vx * si + vz * c });
    }
  }
  out.push(v[v.length - 1]);
  return out;
}

/** Points at most a metre apart (and no duplicates). */
function densify(p: XZ[]): XZ[] {
  const out: XZ[] = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const a = out[out.length - 1], b = p[i];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l < 0.05) continue;
    const n = Math.ceil(l / 1);
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}

function curvature(a: XZ, b: XZ, c: XZ): number {
  const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ac = Math.hypot(c.x - a.x, c.z - a.z);
  if (ab * bc * ac < 1e-6) return 0;
  return (2 * Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))) / (ab * bc * ac);
}

// ---------------------------------------------------------------------
// The car
// ---------------------------------------------------------------------

export interface DriveEnv {
  /** Is this signal group green? (traffic-flow.ts TrafficFlow.green) */
  green?: (axis: RoadAxis) => boolean;
  /** The nearest car ahead in my lane (within `lateral` m of my line): bumper gap (m) and its speed. */
  ahead?: (x: number, z: number, yaw: number, within: number, lateral?: number) => { gap: number; v: number } | null;
  /** Is the road clear of traffic within r of (x, z)? (pulling out of the kerb) */
  clear?: (x: number, z: number, r: number) => boolean;
}

export class CarController {
  x: number;
  z: number;
  yaw: number;
  v = 0;
  acc = 0;
  /** Path curvature the wheels are steering (1/m). */
  steer = 0;
  yawRate = 0;
  roll = 0;
  pitch = 0;
  route: DriveRoute | null = null;
  /** Distance along the route. */
  s = 0;
  /** Why it's slowing (QA): 'red' | 'car' | 'corner' | 'park' | ''. */
  why = '';
  private idx = 0;
  private stopIdx = 0;
  readonly vMax: number;

  constructor(pose: Pose, vMax = DRIVE.vMax) {
    this.x = pose.x;
    this.z = pose.z;
    this.yaw = pose.yaw;
    this.vMax = vMax;
  }

  setRoute(r: DriveRoute | null): void {
    this.route = r;
    this.idx = 0;
    this.s = 0;
    this.stopIdx = 0;
  }

  /** Advance by dt seconds. Returns true the moment it has parked. */
  step(dt: number, env: DriveEnv = {}): boolean {
    dt = Math.min(dt, 0.1);
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    let parked = false;
    for (let k = 0; k < n; k++) parked = this.sub(dt / n, env) || parked;
    return parked;
  }

  private sub(h: number, env: DriveEnv): boolean {
    const r = this.route;
    if (!r) {
      // No route: roll to a stop.
      this.v = Math.max(0, this.v - DRIVE.brake * h);
      this.acc = this.v > 0 ? -DRIVE.brake : 0;
      this.yawRate = 0;
      this.pose(h);
      return false;
    }
    // Where am I along the path? (search a little way ahead of last time)
    let bi = this.idx, bd = Infinity;
    for (let i = this.idx; i < Math.min(r.pts.length, this.idx + 40); i++) {
      const dd = (r.pts[i].x - this.x) ** 2 + (r.pts[i].z - this.z) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = i;
      }
    }
    this.idx = bi;
    // Exact distance along the path (project onto the segment either side of the sample).
    {
      const j = Math.min(bi, r.pts.length - 2);
      const a = r.pts[j], b = r.pts[j + 1];
      const sx = b.x - a.x, sz = b.z - a.z;
      const sl = Math.hypot(sx, sz) || 1;
      this.s = Math.max(0, Math.min(r.length, r.cum[j] + ((this.x - a.x) * sx + (this.z - a.z) * sz) / sl));
    }
    const toEnd = r.length - this.s;

    // ---- speed. Each limit ahead is (distance, speed to be at by then).
    // vT = fastest allowed now; need = the braking that lands exactly on
    // the strictest limit (so stops are on the mark, not past it).
    const B = DRIVE.brake;
    let vT = this.vMax;
    let need = 0;
    this.why = '';
    const limit = (D: number, vc: number, why: string) => {
      D = Math.max(0, D);
      const lim = Math.sqrt(vc * vc + 2 * B * D);
      if (lim < vT) {
        vT = lim;
        this.why = why;
      }
      if (this.v > vc) need = Math.max(need, (this.v * this.v - vc * vc) / (2 * Math.max(D, 0.25)));
    };
    const reach = (this.v * this.v) / (2 * B) + 25;
    for (let i = bi; i < r.pts.length && r.cum[i] - this.s < reach; i++) if (r.vCap[i] < this.vMax - 0.01) limit(r.cum[i] - this.s - 0.5, r.vCap[i], 'corner');
    limit(toEnd - 0.1, 0, 'park');
    const front = this.s + DRIVE.halfLen;
    while (this.stopIdx < r.stops.length && r.stops[this.stopIdx].s < front - 0.5) this.stopIdx++;
    const st = r.stops[this.stopIdx];
    if (st && env.green && !env.green(st.axis)) {
      const dStop = st.s - front;
      // Too close to stop comfortably: carry on through (amber), like the traffic.
      if (dStop > (this.v * this.v) / (2 * B * 1.3) - 0.5) limit(dStop - 0.3, 0, 'red');
    }
    // Pulling out: wait for a gap in the lane (traffic close ahead, or coming up behind).
    const pulling = r.merge.length > 0 && this.s < DRIVE.pullOut + 2;
    if (pulling && this.v < 3 && env.clear && !r.merge.every((m, i) => env.clear!(m.x, m.z, i === 0 ? 7 : 8))) limit(0, 0, 'merge');
    const lead = env.ahead?.(this.x, this.z, this.yaw, 45, pulling ? 3.2 : 1.5);
    if (lead) limit(lead.gap - DRIVE.minGap, Math.min(lead.v, this.vMax), 'car');
    // Brake with just the force needed once it gets firm; otherwise ease toward vT
    // (gentle on the throttle near top speed).
    const up = DRIVE.accel * (1 - (this.v / this.vMax) ** 4);
    let a = need > B * 0.7 ? -need : (vT - this.v) * 3;
    // On the spot: brake to a stand (firmly, not instantly).
    if (toEnd < 0.3) a = -Math.min(DRIVE.brake, this.v / h);
    a = Math.max(-DRIVE.maxBrake, Math.min(up, a));
    this.acc = a;
    this.v = Math.max(0, this.v + a * h);

    // ---- steering: pure pursuit on a point ahead on the path
    const L = 3 + 0.32 * this.v;
    const tgt = pathPoint(r, Math.min(r.length, this.s + L));
    const dx = tgt.x - this.x, dz = tgt.z - this.z;
    const dist = Math.hypot(dx, dz);
    let want = 0;
    if (dist > 0.3) {
      let al = Math.atan2(dx, dz) - this.yaw;
      al = Math.atan2(Math.sin(al), Math.cos(al));
      want = (2 * Math.sin(al)) / Math.max(dist, 2);
    }
    const kMax = 1 / DRIVE.minRadius;
    want = Math.max(-kMax, Math.min(kMax, want));
    const ds = DRIVE.steerRate * h;
    this.steer += Math.max(-ds, Math.min(ds, want - this.steer));
    this.yawRate = this.v * this.steer;
    this.pose(h);

    if (toEnd < 0.3 && this.v < 0.01) {
      this.v = 0;
      this.acc = 0;
      this.steer = 0;
      this.yawRate = 0;
      this.route = null;
      return true;
    }
    return false;
  }

  /** Move along the heading, and ease the body roll and nose dip. */
  private pose(h: number): void {
    this.yaw += this.yawRate * h;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.x += Math.sin(this.yaw) * this.v * h;
    this.z += Math.cos(this.yaw) * this.v * h;
    // Same feel as traffic-flow.ts: lean out of turns, dip the nose braking.
    const rollT = Math.max(-0.06, Math.min(0.06, this.yawRate * this.v * 0.006));
    const pitchT = Math.max(-0.03, Math.min(0.045, -this.acc * 0.005));
    const k = Math.min(1, h * 6);
    this.roll += (rollT - this.roll) * k;
    this.pitch += (pitchT - this.pitch) * k;
  }
}

/** The point at distance s along a route. */
export function pathPoint(r: DriveRoute, s: number): XZ {
  let lo = 0, hi = r.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (r.cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  if (lo >= r.pts.length - 1) return r.pts[r.pts.length - 1];
  const a = r.pts[lo], b = r.pts[lo + 1];
  const u = (s - r.cum[lo]) / (r.cum[lo + 1] - r.cum[lo] || 1);
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
}
