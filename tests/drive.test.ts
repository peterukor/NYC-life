// Driving your own car (world/drive.ts): routes keep to the right-hand
// lane on real asphalt, the car steers and brakes smoothly, parks at the
// kerb, stops at red lights and queues behind traffic (and traffic
// queues behind it: world/traffic-flow.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS, inParkGap, onRoad } from '../src/world/layout.ts';
import { onLand } from '../src/world/geo-proj.ts';
import { buildRoadGraph, CarController, DRIVE, kerbNear, planRoute, type DriveRoute, type DriveEnv } from '../src/world/drive.ts';
import { polyLane, TrafficFlow } from '../src/world/traffic-flow.ts';
import { doorOf, PLACE_BY_ID } from '../src/data/places.ts';

const d = DISTRICTS.manhattan;
const graph = buildRoadGraph(d, (x, z) => onLand(d.borough, x, z));
const doors = Object.values(PLACE_BY_ID)
  .filter((p) => p.area === 'manhattan')
  .map((p) => doorOf(p));
/** A spread of trips between real places (deterministic). */
const trips = Array.from({ length: 14 }, (_, i) => [doors[(i * 37) % doors.length], doors[(i * 53 + 11) % doors.length]] as const);
const VMAX = 20.8;

function drive(r: DriveRoute, from: { x: number; z: number; yaw: number }, env: DriveEnv = {}, maxT = 400) {
  const c = new CarController(from, VMAX);
  c.setRoute(r);
  const log: { x: number; z: number; yaw: number; v: number; steer: number; why: string; s: number }[] = [];
  let t = 0;
  let done = false;
  while (t < maxT && !done) {
    done = c.step(1 / 60, env);
    t += 1 / 60;
    log.push({ x: c.x, z: c.z, yaw: c.yaw, v: c.v, steer: c.steer, why: c.why, s: c.s });
  }
  return { c, log, done, t };
}

/** Is p inside a crossing (where the lanes meet and turn)? */
function inCrossing(x: number, z: number): boolean {
  return d.xs.some((ax) => Math.abs(x - ax) < d.avenueW / 2 + 6) && d.zs.some((sz) => Math.abs(z - sz) < d.streetW / 2 + 6);
}

test('every route point is on asphalt: never on a sidewalk, a block, a park gap or in the river', () => {
  let routes = 0;
  for (const [a, b] of trips) {
    const k = kerbNear(graph, a.x, a.z)!;
    const r = planRoute(graph, k, b, VMAX);
    assert.ok(r, 'a route between two places');
    routes++;
    for (const p of r!.pts) {
      assert.ok(onRoad(d, p.x, p.z), `off the road at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
      assert.ok(!inParkGap(d, p.x, p.z), `through a park at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
      assert.ok(onLand(d.borough, p.x, p.z), `in the river at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
    }
  }
  assert.equal(routes, trips.length);
});

test('routes keep to the right-hand lane between crossings and park at the kerb on the destination side', () => {
  for (const [a, b] of trips) {
    const k = kerbNear(graph, a.x, a.z)!;
    const r = planRoute(graph, k, b, VMAX)!;
    let checked = 0;
    for (let i = 1; i < r.pts.length; i++) {
      // Skip the pull-out at the start and the pull-in at the end (kerb lane there).
      if (r.cum[i] < DRIVE.pullOut + 6 || r.cum[i] > r.length - DRIVE.pullIn - 12) continue;
      const p = r.pts[i], q = r.pts[i - 1];
      if (inCrossing(p.x, p.z)) continue;
      const hx = p.x - q.x, hz = p.z - q.z;
      const hl = Math.hypot(hx, hz);
      // Which road is this, and how far to the right of its centre line?
      const onAve = Math.abs(hz) > Math.abs(hx);
      let lat: number, want: number;
      if (onAve) {
        const cx = d.xs.reduce((m, ax) => (Math.abs(ax - p.x) < Math.abs(m - p.x) ? ax : m));
        lat = ((p.x - cx) * -hz) / hl; // right of heading (hx, hz) is (−hz, hx)
        want = DRIVE.lane.ave;
      } else {
        const cz = d.zs.reduce((m, sz) => (Math.abs(sz - p.z) < Math.abs(m - p.z) ? sz : m));
        lat = ((p.z - cz) * hx) / hl;
        want = DRIVE.lane.st;
      }
      assert.ok(Math.abs(lat - want) < 0.3, `lane offset ${lat.toFixed(2)} (want ${want}) at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
      checked++;
    }
    assert.ok(checked > 20, 'checked a good stretch of the route');
    // Parked at the kerb, with the destination on the car's right.
    const fx = Math.sin(r.park.yaw), fz = Math.cos(r.park.yaw);
    const side = (b.x - r.park.x) * -fz + (b.z - r.park.z) * fx;
    assert.ok(side > 0, 'the destination is on the kerb side');
  }
  // Aiming at the road in front of a door (as game.ts does), the car parks
  // right outside. (About one in six can't: landmarks in parks, on piers or
  // islands, and doors facing a road closed off by a joined block.)
  let near = 0, all = 0;
  for (const p of Object.values(PLACE_BY_ID)) {
    if (p.area !== 'manhattan') continue;
    const door = doorOf(p);
    const k = kerbNear(graph, door.x + door.faceX * 10, door.z + door.faceZ * 10)!;
    all++;
    if (Math.hypot(door.x - k.x, door.z - k.z) < 20) near++; // corner doors: the car stops clear of the crosswalk
  }
  assert.ok(near / all > 0.78, `parks right outside most doors (${near}/${all})`);
});

test('the car speeds up, corners and brakes smoothly, turns with a real radius and parks on the spot', () => {
  for (const [a, b] of trips.slice(0, 6)) {
    const k = kerbNear(graph, a.x, a.z)!;
    const r = planRoute(graph, k, b, VMAX)!;
    const { c, log, done } = drive(r, k);
    assert.ok(done, 'arrived');
    const dt = 1 / 60;
    let maxDev = 0;
    for (let i = 1; i < log.length; i++) {
      const p = log[i - 1], q = log[i];
      let dy = q.yaw - p.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      // Never spins on the spot: the heading only turns as fast as the wheels allow at this speed.
      assert.ok(Math.abs(dy) <= (q.v / DRIVE.minRadius) * dt + 1e-6, `heading jumped ${dy.toFixed(3)} at v ${q.v.toFixed(1)}`);
      assert.ok(Math.abs(q.steer - p.steer) <= DRIVE.steerRate * dt + 1e-9, 'steering moves smoothly');
      assert.ok(q.v - p.v <= DRIVE.accel * dt + 1e-6 && p.v - q.v <= DRIVE.maxBrake * dt + 1e-6, `speed snapped ${p.v.toFixed(2)} → ${q.v.toFixed(2)} (${q.why})`);
      // Cornering grip: sideways acceleration stays sensible.
      assert.ok(q.v * q.v * Math.abs(q.steer) < DRIVE.latAcc * 1.8, `skidding: ${(q.v * q.v * Math.abs(q.steer)).toFixed(1)} m/s²`);
      let md = Infinity;
      for (let j = 0; j < r.pts.length; j += 1) md = Math.min(md, Math.hypot(r.pts[j].x - q.x, r.pts[j].z - q.z));
      maxDev = Math.max(maxDev, md);
    }
    assert.ok(maxDev < 1.3, `stays on its line (worst ${maxDev.toFixed(2)} m)`);
    assert.ok(Math.hypot(c.x - r.park.x, c.z - r.park.z) < 0.6, 'parks on the spot');
    assert.ok(Math.max(...log.map((l) => l.v)) > 15, 'gets up to city speed');
    // Slows down for the corners.
    const turning = log.filter((l) => Math.abs(l.steer) > 0.1);
    if (turning.length) assert.ok(Math.max(...turning.map((l) => l.v)) < 11, 'slow through the turns');
  }
});

test('stops at a red light just before the stop line, and goes again on green', () => {
  // Find a trip that crosses at least one signal.
  let tested = 0;
  for (const [a, b] of trips) {
    const k = kerbNear(graph, a.x, a.z)!;
    const r = planRoute(graph, k, b, VMAX)!;
    const first = r.stops[0];
    if (!first || first.s < 60) continue;
    let red = true;
    const env: DriveEnv = { green: () => !red };
    const c = new CarController(k, VMAX);
    c.setRoute(r);
    for (let i = 0; i < 60 * 60; i++) c.step(1 / 60, env);
    const front = c.s + DRIVE.halfLen;
    assert.ok(c.v < 0.05, `waiting at the red (v ${c.v.toFixed(2)})`);
    assert.ok(front <= first.s + 0.3 && front > first.s - 3, `stopped at the line (front ${front.toFixed(1)}, line ${first.s.toFixed(1)})`);
    assert.equal(c.why, 'red');
    red = false;
    let done = false;
    for (let i = 0; i < 60 * 300 && !done; i++) done = c.step(1 / 60, env);
    assert.ok(done, 'drove on and parked once green');
    if (++tested >= 3) break;
  }
  assert.ok(tested > 0, 'some route crossed a signal');
});

test('keeps a gap behind a slow car ahead', () => {
  const [a, b] = trips[0];
  const k = kerbNear(graph, a.x, a.z)!;
  const r = planRoute(graph, k, b, VMAX)!;
  // A car crawling along the route 40 m ahead at 4 m/s.
  let leadS = 40;
  const c = new CarController(k, VMAX);
  c.setRoute(r);
  let minGap = Infinity;
  for (let i = 0; i < 60 * 12; i++) {
    leadS = Math.min(r.length - 5, leadS + 4 / 60);
    const gap = leadS - c.s - DRIVE.halfLen * 2;
    c.step(1 / 60, { ahead: () => ({ gap, v: 4 }) });
    minGap = Math.min(minGap, leadS - c.s - DRIVE.halfLen * 2);
  }
  assert.ok(minGap > 1.5, `kept its distance (closest ${minGap.toFixed(2)} m)`);
  assert.ok(Math.abs(c.v - 4) < 1, 'settled to the speed of the car ahead');
});

test('traffic queues behind your car in its lane, and ahead() finds the car in front', () => {
  const lane = polyLane([{ x: 0, z: 0 }, { x: 0, z: 400 }], false, null);
  const flow = new TrafficFlow([lane], [{ vMax: 10, len: 4.5 }], () => 0.2);
  const car = flow.cars[0];
  assert.equal(car.lane, 0);
  // Your car stopped in the lane 60 m ahead of the traffic car.
  flow.obstacle = { x: 0, z: car.s + 60, yaw: 0, v: 0, len: 4.6 };
  for (let i = 0; i < 60 * 30; i++) flow.step(1 / 60);
  const gap = flow.obstacle.z - flow.obstacle.len / 2 - (car.s + car.len / 2);
  assert.ok(gap > 0.5 && gap < 4, `queued behind it (gap ${gap.toFixed(2)})`);
  assert.ok(car.v < 0.1, 'stopped');
  // Parked at the kerb (out of the lane): no longer in the way.
  flow.obstacle = { x: 4.6, z: car.s + 10, yaw: 0, v: 0, len: 4.6 };
  for (let i = 0; i < 60 * 5; i++) flow.step(1 / 60);
  assert.ok(car.v > 3, 'drives past a car parked at the kerb');
  // From behind the traffic car: ahead() sees it; from beside it, it doesn't.
  const hit = flow.ahead(car.x, car.z - 20, 0, 45);
  assert.ok(hit && Math.abs(hit.gap - (20 - 2.3 - car.len / 2)) < 0.01);
  assert.equal(flow.ahead(car.x + 4.6, car.z - 20, 0, 45), null);
  assert.equal(flow.ahead(car.x, car.z - 20, Math.PI, 45), null);
});

test('a spot just behind you on the same road: round the block or a U-turn at the crossing, never reversing', () => {
  const [a] = trips[2];
  const k = kerbNear(graph, a.x, a.z)!;
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  // 12 m behind, same kerb.
  const r = planRoute(graph, k, { x: k.x - fx * 12, z: k.z - fz * 12 }, VMAX);
  assert.ok(r, 'found a way round');
  assert.ok(r!.length > 100 && r!.via.length >= 2, `went round (${r!.length.toFixed(0)} m, ${r!.via.length} crossings)`);
  const { done } = drive(r!, k);
  assert.ok(done, 'and parked');
});

test('pulling out of the kerb waits for a gap in the traffic', () => {
  const [a, b] = trips[1];
  const k = kerbNear(graph, a.x, a.z)!;
  const r = planRoute(graph, k, b, VMAX)!;
  assert.equal(r.merge.length, 3, 'starting at the kerb checks the lane');
  let busy = true;
  const c = new CarController(k, VMAX);
  c.setRoute(r);
  for (let i = 0; i < 60 * 3; i++) c.step(1 / 60, { clear: () => !busy });
  assert.ok(Math.hypot(c.x - k.x, c.z - k.z) < 0.05 && c.why === 'merge', 'waits at the kerb');
  busy = false;
  for (let i = 0; i < 60 * 3; i++) c.step(1 / 60, { clear: () => !busy });
  assert.ok(c.s > 15, 'then pulls out');
});
