// Street pedestrians (world/ped-walk.ts, used by world/crowd.ts): Peter saw
// "a lot of NPCs walking on the road". People keep to the sidewalks, cross
// only on the painted crosswalks at signalled corners, wait at the kerb
// for their walk phase (traffic-flow.ts), never stop half way over, and
// never (re)spawn or idle on the asphalt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avenueX, DISTRICTS, inParkGap, onRoad, streetZ, type DistrictDef } from '../src/world/layout.ts';
import { buildNavGrid } from '../src/world/nav.ts';
import { asphaltAt, buildPedGrid, closeUnsignalled, crosswalkAt, nearestStand, PED, pedPath, pedStandable, stepWalker, surfaceAt, type PedPoint, type Walker } from '../src/world/ped-walk.ts';
import { addStopLines, polyLane, SIGNAL, TrafficFlow, type Axis, type Lane } from '../src/world/traffic-flow.ts';
import { doorOf, PLACE_BY_ID } from '../src/data/places.ts';

const d = DISTRICTS.manhattan;
const nav = buildNavGrid(d);
const g = buildPedGrid(nav, d);

/** The grid lanes exactly as world/traffic.ts lays them (that file needs a browser). */
function gridLanes(dd: DistrictDef): Lane[] {
  const run = (x0: number, z0: number, x1: number, z1: number): number[] | null => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(len / 4);
    let best: [number, number] | null = null;
    let start = -1;
    for (let i = 0; i <= steps + 1; i++) {
      const t = i / steps;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const on = i <= steps && onRoad(dd, px, pz) && !inParkGap(dd, px, pz);
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (!best || i - 1 - start > best[1] - best[0]) best = [start, i - 1];
        start = -1;
      }
    }
    if (!best || ((best[1] - best[0]) / steps) * len < 60) return null;
    const a = best[0] / steps, b = best[1] / steps;
    return [x0 + (x1 - x0) * a, z0 + (z1 - z0) * a, x0 + (x1 - x0) * b, z0 + (z1 - z0) * b];
  };
  const lanes: Lane[] = [];
  const add = (x0: number, z0: number, x1: number, z1: number, axis: Axis) => {
    const r = run(x0, z0, x1, z1);
    if (r) lanes.push(polyLane([{ x: r[0], z: r[1] }, { x: r[2], z: r[3] }], false, axis));
  };
  const zA = streetZ(dd, 0) - 40, zB = streetZ(dd, dd.rows) + 40;
  for (let i = 0; i <= dd.cols; i++) {
    const x = avenueX(dd, i);
    add(x - 2.3, zA, x - 2.3, zB, 'ave');
    add(x + 2.3, zB, x + 2.3, zA, 'ave');
  }
  const xA = avenueX(dd, 0) - 40, xB = avenueX(dd, dd.cols) + 40;
  for (let j = 1; j < dd.rows; j++) {
    const z = streetZ(dd, j);
    add(xA, z + 2.2, xB, z + 2.2, 'st');
    add(xB, z - 2.2, xA, z - 2.2, 'st');
  }
  addStopLines(lanes, (axis) => (axis === 'ave' ? dd.streetW : dd.avenueW) / 2 + 3.6);
  return lanes;
}

/** Deterministic random numbers. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const lanes = gridLanes(d);
const flowFor = (cars: { vMax: number; len: number }[] = [], seed = 3) => new TrafficFlow(gridLanes(d), cars, rng(seed));
const signalFlow = new TrafficFlow(lanes, []);
const closed = closeUnsignalled(g, (x, z) => signalFlow.signalled(x, z));

/** Walk a route's polyline in 0.5 m steps. */
function samples(from: { x: number; z: number }, path: PedPoint[], fn: (x: number, z: number, seg: PedPoint) => void): void {
  let prev = from;
  for (const q of path) {
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - prev.x, q.z - prev.z) / 0.5));
    for (let i = 0; i <= n; i++) fn(prev.x + ((q.x - prev.x) * i) / n, prev.z + ((q.z - prev.z) * i) / n, q);
    prev = q;
  }
}

const manhattanDoors = Object.values(PLACE_BY_ID).filter((p) => p.area === 'manhattan').map((p) => doorOf(p));
// Midtown, Hell's Kitchen, the Lower East Side, Harlem (scripts/qa-crowd.mjs).
const SPOTS = [{ x: -6, z: 2 }, { x: -185, z: 2 }, { x: 509, z: 759 }, { x: 461, z: -1135 }];

test('the pedestrian grid: walk cells are off the asphalt, crossing cells only in crosswalk bands', () => {
  let walk = 0, cross = 0;
  for (let i = 0; i < g.cls.length; i++) {
    const c = g.cls[i];
    if (!c) continue;
    const x = g.minX + ((i % g.cols) + 0.5) * 3, z = g.minZ + (Math.floor(i / g.cols) + 0.5) * 3;
    if (c === PED.walk) {
      walk++;
      assert.equal(asphaltAt(d, x, z), false, `walk cell on the asphalt at ${x}, ${z}`);
    } else {
      cross++;
      // (cells within 0.4 m of the kerb count as road: KERB in ped-walk.ts)
      assert.ok([[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([ox, oz]) => asphaltAt(d, x + ox, z + oz)), `crossing cell off the road at ${x}, ${z}`);
      assert.equal(crosswalkAt(d, x, z, 0, 4), c === PED.crossX ? 'ave' : 'st', `crossing cell outside a crosswalk at ${x}, ${z}`);
    }
  }
  assert.ok(walk > 80_000 && cross > 2000, `${walk} walk, ${cross} crossing cells`);
  // Some crossings have no stop line on every lane through them (lanes only
  // run along each road's longest stretch): those are shut.
  assert.ok(closed > 0 && closed < 400, `${closed} crosswalks closed`);
});

test('spawn points and route ends are on the sidewalk, never the road', () => {
  const r = rng(11);
  for (const s of SPOTS) {
    for (let k = 0; k < 200; k++) {
      const a = r() * Math.PI * 2, rad = 170 * (0.3 + r() * 0.65);
      const p = nearestStand(g, s.x + Math.cos(a) * rad, s.z + Math.sin(a) * rad);
      if (!p) continue;
      assert.equal(surfaceAt(d, p.x, p.z), 'walk');
      assert.ok(pedStandable(g, p.x, p.z));
    }
  }
  // A door on Broadway's asphalt (Times Square's) moves to the sidewalk beside it.
  const ts = nearestStand(g, -6, 2)!;
  assert.equal(surfaceAt(d, ts.x, ts.z), 'walk');
  assert.ok(Math.hypot(ts.x + 6, ts.z - 2) < 12);
});

test('routes between real places keep to the sidewalk and cross only on signalled crosswalks', () => {
  const r = rng(5);
  let routes = 0, crossings = 0;
  for (let k = 0; k < 160; k++) {
    const a = manhattanDoors[Math.floor(r() * manhattanDoors.length)];
    // Somewhere within the crowd's radius of a door (crowd.ts picks nearby stops).
    const ang = r() * Math.PI * 2, rad = 30 + r() * 140;
    const from = nearestStand(g, a.x, a.z)!;
    const path = pedPath(g, from.x, from.z, a.x + Math.cos(ang) * rad, a.z + Math.sin(ang) * rad, r);
    if (!path.length) continue;
    routes++;
    let prev = from;
    for (const q of path) {
      if (q.need) {
        crossings++;
        // Straight across one road, on the paint, both ends on the sidewalk.
        assert.ok(Math.abs(q.x - prev.x) < 1e-6 || Math.abs(q.z - prev.z) < 1e-6, 'crossing on the slant');
        assert.equal(surfaceAt(d, prev.x, prev.z), 'walk');
        assert.equal(surfaceAt(d, q.x, q.z), 'walk');
        const mid = { x: (prev.x + q.x) / 2, z: (prev.z + q.z) / 2 };
        const crosses = crosswalkAt(d, mid.x, mid.z, 0, 4);
        assert.ok(crosses, `crossing in the middle of a road at ${mid.x}, ${mid.z}`);
        // Avenues are crossed on the streets' green and the other way round.
        assert.equal(q.need, crosses === 'ave' ? 'st' : 'ave');
        assert.ok(signalFlow.signalled(crosses === 'ave' ? avenueX(d, nearest(d.xs, mid.x)) : mid.x, crosses === 'ave' ? mid.z : streetZ(d, nearest(d.zs, mid.z))), 'crosses where the traffic doesn\'t stop');
      }
      prev = q;
    }
    samples(from, path, (x, z, seg) => {
      const s = surfaceAt(d, x, z);
      assert.notEqual(s, 'road', `route on the road at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      if (s === 'crosswalk') assert.ok(seg.need, 'on a crosswalk outside a crossing');
    });
  }
  assert.ok(routes > 90, `${routes} routes`);
  assert.ok(crossings > 40, `${crossings} crossings`);
});

function nearest(lines: number[], v: number): number {
  let best = 0;
  lines.forEach((l, i) => (Math.abs(l - v) < Math.abs(lines[best] - v) ? (best = i) : 0));
  return best;
}

test('spawned and steered pedestrians stay off asphalt except at crosswalks, on their green, and never stop there', () => {
  const flow = flowFor();
  const r = rng(21);
  const walkers: (Walker & { goal: number })[] = [];
  for (const s of SPOTS) {
    for (let k = 0; k < 30; k++) {
      const a = r() * Math.PI * 2, rad = 170 * (0.3 + r() * 0.65);
      const p = nearestStand(g, s.x + Math.cos(a) * rad, s.z + Math.sin(a) * rad);
      if (p) walkers.push({ x: p.x, z: p.z, heading: 0, speed: 1 + r() * 0.9, path: [], crossing: false, waiting: false, goal: 0 });
    }
  }
  const dt = 1 / 15;
  let onCross = 0, waited = 0, crossed = 0;
  for (let t = 0; t < 240; t += dt) {
    flow.step(dt);
    for (const w of walkers) {
      if (!w.path.length) {
        // A new stop nearby (crowd.ts: a door or a wander point).
        const a = r() * Math.PI * 2, rad = 25 + r() * 120;
        const dest = nearestStand(g, w.x + Math.cos(a) * rad, w.z + Math.sin(a) * rad);
        if (dest) w.path = pedPath(g, w.x, w.z, dest.x, dest.z, r);
        continue;
      }
      const was = w.crossing;
      const res = stepWalker(w, dt, flow);
      if (was && !w.crossing) crossed++;
      if (res === 'waiting') waited++;
      const s = surfaceAt(d, w.x, w.z);
      assert.notEqual(s, 'road', `walker on the road at ${w.x.toFixed(2)}, ${w.z.toFixed(2)}`);
      if (s === 'crosswalk') {
        onCross++;
        assert.ok(w.crossing || res === 'reached', 'on a crosswalk without crossing');
        assert.notEqual(res, 'waiting', 'stopped on the road');
        // The traffic it crosses has a red: avenues only cross on the streets' green or the all-red.
        const crosses = crosswalkAt(d, w.x, w.z, 0, 4)!;
        assert.equal(flow.green(crosses), false, `on the crosswalk while ${crosses} traffic has a green`);
      }
    }
  }
  assert.ok(onCross > 500 && crossed > 40 && waited > 500, `${onCross} on crosswalks, ${crossed} crossings, ${waited} waits`);
});

test('a pedestrian waits at the kerb for the walk phase, then crosses in one go', () => {
  // Across 7th Ave on the north side of the street at z = -97 (Midtown), west to east.
  const path = pedPath(g, -125, -87, -75, -87, () => 0.5);
  const i = path.findIndex((p) => p.need);
  assert.ok(i > 0, 'route crosses');
  assert.equal(path[i].need, 'st'); // crossing an avenue: with the streets
  const kerb = path[i - 1];
  const w: Walker = { x: kerb.x, z: kerb.z, heading: 0, speed: 1.2, path: path.slice(i), crossing: false, waiting: false };
  const flow = flowFor();
  flow.clock = 0; // avenues just went green
  for (let t = 0; t < 19; t += 0.1) {
    flow.step(0.1);
    assert.equal(stepWalker(w, 0.1, flow), 'waiting');
    assert.equal(surfaceAt(d, w.x, w.z), 'walk');
  }
  // Streets go green at 20 s: off they go and don't stop until the far side.
  let t = 19;
  while (w.path[0]?.need && !w.crossing) {
    flow.step(0.1);
    stepWalker(w, 0.1, flow);
    t += 0.1;
  }
  assert.ok(t >= SIGNAL.green + SIGNAL.allRed - 0.2 && t < SIGNAL.green + SIGNAL.allRed + 0.5, `set off at ${t.toFixed(1)} s`);
  let steps = 0;
  while (w.crossing) {
    flow.step(0.1);
    assert.notEqual(stepWalker(w, 0.1, flow), 'waiting');
    steps++;
  }
  assert.equal(surfaceAt(d, w.x, w.z), 'walk');
  assert.ok(flow.green('st') || flow.greenLeft('ave') === 0, 'made it before the avenues went green');
  assert.ok(steps * 0.1 < SIGNAL.green, 'crossed within one green');
  // Late in the green there isn't time to get over: wait for the next one.
  const late: Walker = { x: kerb.x, z: kerb.z, heading: 0, speed: 1.2, path: path.slice(i), crossing: false, waiting: false };
  flow.clock = SIGNAL.green + SIGNAL.allRed + SIGNAL.green - 2;
  assert.equal(stepWalker(late, 0.1, flow), 'waiting');
});

test('no signals (no traffic): people just cross', () => {
  const path = pedPath(g, -125, -87, -75, -87, () => 0.5);
  const i = path.findIndex((p) => p.need);
  const w: Walker = { x: path[i - 1].x, z: path[i - 1].z, heading: 0, speed: 1.2, path: path.slice(i), crossing: false, waiting: false };
  assert.equal(stepWalker(w, 0.1, null), 'moving');
  assert.ok(w.crossing);
});

test('greenLeft agrees with green over the whole cycle', () => {
  const flow = flowFor();
  for (let t = 0; t < 40; t += 0.25) {
    flow.clock = t;
    for (const ax of ['ave', 'st'] as const) assert.equal(flow.greenLeft(ax) > 0, flow.green(ax), `${ax} at ${t}`);
  }
  flow.clock = 5;
  assert.equal(flow.greenLeft('ave'), SIGNAL.green - 5);
  assert.equal(flow.greenLeft(null), Infinity);
});

test('moving traffic never drives through someone on a crosswalk', () => {
  const r = rng(9);
  const flow = flowFor(Array.from({ length: 85 }, () => ({ vMax: 9 + r() * 5, len: 4.6 })), 9);
  const walkers: Walker[] = [];
  for (const s of SPOTS.slice(0, 2)) {
    for (let k = 0; k < 60; k++) {
      const a = r() * Math.PI * 2, rad = 20 + r() * 150;
      const p = nearestStand(g, s.x + Math.cos(a) * rad, s.z + Math.sin(a) * rad);
      if (p) walkers.push({ x: p.x, z: p.z, heading: 0, speed: 1 + r() * 0.9, path: [], crossing: false, waiting: false });
    }
  }
  // Cars that just (re)appeared somewhere are left out: respawning can drop
  // a car anywhere on a lane, which is traffic.ts's business (out of sight).
  const fresh = new Map<number, number>();
  const last = flow.cars.map((c) => ({ lane: c.lane, s: c.s }));
  const dt = 1 / 20;
  let near = 0;
  for (let t = 0; t < 160; t += dt) {
    flow.step(dt, { focus: SPOTS[Math.floor(t / 80)] });
    flow.cars.forEach((c, i) => {
      if (c.lane !== last[i].lane || Math.abs(c.s - last[i].s) > 3) fresh.set(i, t);
      last[i] = { lane: c.lane, s: c.s };
    });
    for (const w of walkers) {
      if (!w.path.length) {
        const a = r() * Math.PI * 2, rad = 25 + r() * 100;
        const dest = nearestStand(g, w.x + Math.cos(a) * rad, w.z + Math.sin(a) * rad);
        if (dest) w.path = pedPath(g, w.x, w.z, dest.x, dest.z, r);
        continue;
      }
      stepWalker(w, dt, flow);
      if (!w.crossing) continue;
      flow.cars.forEach((c, i) => {
        if (c.lane < 0 || c.v < 0.5 || t - (fresh.get(i) ?? -99) < 6) return;
        const dx = w.x - c.x, dz = w.z - c.z;
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        if (Math.abs(dx * fx + dz * fz) < c.len / 2 + 0.5 && Math.abs(dx * fz - dz * fx) < 1.4) {
          assert.fail(`car at ${c.x.toFixed(1)}, ${c.z.toFixed(1)} (${c.v.toFixed(1)} m/s) through a pedestrian at ${w.x.toFixed(1)}, ${w.z.toFixed(1)}`);
        }
        if (Math.hypot(dx, dz) < 12) near++;
      });
    }
  }
  assert.ok(near > 0, 'cars and crossing pedestrians did meet at corners');
});
