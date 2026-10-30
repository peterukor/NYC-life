// How traffic drives (world/traffic-flow.ts): cars keep their distance,
// ease on and off the brakes, stop at red lights and only reappear where
// the camera can't see them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStopLines, polyLane, SIGNAL, TrafficFlow, type Lane } from '../src/world/traffic-flow.ts';

/** A seeded random (the tests must not flake). */
function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Bumper-to-bumper gaps in each lane (negative = cars overlap). */
function minGap(f: TrafficFlow): number {
  let g = Infinity;
  for (const l of f.lanes) {
    const cs = l.cars.map((i) => f.cars[i]).sort((a, b) => a.s - b.s);
    for (let k = 0; k + 1 < cs.length; k++) g = Math.min(g, cs[k + 1].s - cs[k + 1].len / 2 - (cs[k].s + cs[k].len / 2));
  }
  return g;
}

test('cars on a busy loop road never drive into each other, and brake smoothly', () => {
  const ring = polyLane(Array.from({ length: 24 }, (_, i) => ({ x: Math.cos((i / 24) * Math.PI * 2) * 60, z: Math.sin((i / 24) * Math.PI * 2) * 60 })), true);
  const specs = Array.from({ length: 14 }, (_, i) => ({ vMax: 6 + (i % 5) * 2, len: i % 4 ? 4.5 : 11 }));
  const f = new TrafficFlow([ring], specs, rng(3));
  assert.ok(f.cars.every((c) => c.lane === 0), 'all placed');
  let worst = Infinity;
  for (let step = 0; step < 60 * 40; step++) {
    const before = f.cars.map((c) => c.v);
    f.step(1 / 60);
    worst = Math.min(worst, minGap(f));
    f.cars.forEach((c, i) => assert.ok(Math.abs(c.v - before[i]) < 10 / 60 + 1e-6, 'no instant speed snaps'));
  }
  assert.ok(worst > 0, `cars overlapped (gap ${worst.toFixed(2)})`);
  // Fast cars end up queued behind slow ones rather than at their own speed.
  const speeds = f.cars.map((c) => c.v);
  assert.ok(Math.max(...speeds) - Math.min(...speeds) < 3, 'the ring settles into one flow');
});

/** One avenue lane (south → north) crossing one street lane (west → east) at the origin. */
function crossing(): Lane[] {
  const ave = polyLane([{ x: 0, z: -200 }, { x: 0, z: 200 }], false, 'ave');
  const st = polyLane([{ x: -200, z: 2 }, { x: 200, z: 2 }], false, 'st');
  const st2 = polyLane([{ x: 200, z: -2 }, { x: -200, z: -2 }], false, 'st');
  addStopLines([ave, st, st2], () => 12);
  return [ave, st, st2];
}

test('stop lines sit before each crossing road, one per road', () => {
  const [ave, st] = crossing();
  assert.equal(ave.stops.length, 1);
  assert.ok(Math.abs(ave.stops[0] - (200 - 12)) < 0.01);
  assert.equal(st.stops.length, 1);
});

test('a car stops at a red light, behind the line, and goes on green', () => {
  const lanes = crossing();
  const f = new TrafficFlow([lanes[0]], [{ vMax: 11, len: 4.5 }, { vMax: 11, len: 4.5 }], rng(1));
  // Put both cars well back from the light, and turn the avenues red.
  const [a, b] = f.cars;
  a.s = 100; b.s = 70;
  a.v = b.v = 10;
  lanes[0].cars.sort((i, j) => f.cars[i].s - f.cars[j].s);
  f.clock = SIGNAL.green + 0.01; // avenue just went red
  const line = lanes[0].stops[0];
  for (let t = 0; t < SIGNAL.allRed + SIGNAL.green - 0.5; t += 1 / 30) {
    f.step(1 / 30);
    assert.ok(a.s + a.len / 2 <= line + 0.05, 'front car stays behind the line');
    assert.ok(b.s + b.len / 2 < a.s - a.len / 2, 'the one behind queues');
  }
  assert.ok(a.v < 0.2 && b.v < 0.2, 'both stopped');
  assert.ok(line - (a.s + a.len / 2) < 1.5, 'stopped close to the line, not miles back');
  // Avenues go green again: off they go, through the crossing.
  for (let t = 0; t < 12; t += 1 / 30) f.step(1 / 30);
  assert.ok(a.s > 210, 'through the intersection');
});

test('a car too close to stop when the light changes carries on (amber)', () => {
  const lanes = crossing();
  const f = new TrafficFlow([lanes[0]], [{ vMax: 12, len: 4.5 }], rng(2));
  const car = f.cars[0];
  car.s = lanes[0].stops[0] - 6;
  car.v = 12;
  f.clock = SIGNAL.green + 0.01;
  for (let t = 0; t < 3; t += 1 / 30) f.step(1 / 30);
  assert.ok(car.s > 205, 'drove on rather than slamming to a stop past the line');
});

test('cars only reappear where the camera cannot see', () => {
  const lanes = [polyLane([{ x: 0, z: -150 }, { x: 0, z: 150 }], false), polyLane([{ x: 6, z: 150 }, { x: 6, z: -150 }], false)];
  const f = new TrafficFlow(lanes, Array.from({ length: 10 }, () => ({ vMax: 12, len: 4.5 })), rng(5));
  // The camera sees everything with z > 0 (in front); cars must respawn at z <= 0.
  const canSee = (_x: number, z: number) => z > 0;
  let respawns = 0;
  const lastLane = f.cars.map((c) => c.lane);
  const lastS = f.cars.map((c) => c.s);
  for (let step = 0; step < 60 * 60; step++) {
    f.step(1 / 60, { focus: { x: 0, z: 0 }, canSee });
    f.cars.forEach((c, i) => {
      if (c.lane >= 0 && (c.lane !== lastLane[i] || Math.abs(c.s - lastS[i]) > 2)) {
        respawns++;
        assert.ok(c.z <= 0.01, `reappeared in view at z=${c.z.toFixed(1)}`);
      }
      lastLane[i] = c.lane;
      lastS[i] = c.s;
    });
    assert.ok(minGap(f) > 0, 'respawned cars fit');
  }
  assert.ok(respawns > 5, 'cars do get recycled');
});

test('a car at the end of its road only vanishes out of sight (or well past it)', () => {
  const lane = polyLane([{ x: 0, z: 0 }, { x: 0, z: 100 }], false);
  const f = new TrafficFlow([lane], [{ vMax: 10, len: 4.5 }], rng(7));
  const car = f.cars[0];
  car.s = 90;
  car.v = 10;
  // Everything visible: it drives on past the end for a bit before going.
  for (let t = 0; t < 1.5; t += 1 / 60) f.step(1 / 60, { canSee: () => true });
  assert.equal(car.lane, 0, 'still there just past the end');
  assert.ok(car.z > 100);
  // While it's all in view, it waits off-stage instead of popping in.
  for (let t = 0; t < 5; t += 1 / 60) f.step(1 / 60, { canSee: () => true });
  assert.equal(car.lane, -1);
  for (let t = 0; t < 1; t += 1 / 60) f.step(1 / 60, { canSee: () => false });
  assert.equal(car.lane, 0, 'back once there is somewhere hidden');
});
