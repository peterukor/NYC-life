import test from 'node:test';
import assert from 'node:assert/strict';
import { rectAt, snapToWall, spotFree, whyNot, type FitWorld } from '../src/world/furniture-fit.ts';
import type { HomeLayout } from '../src/data/homes.ts';

// A 10 x 8 home split by a wall at z = 0 with a doorway from x = 4 to 5.
const layout: HomeLayout = {
  id: 't', name: 't', width: 10, depth: 8, wallColor: '#fff', rooms: [],
  walls: [{ a: [-5, 0], b: [5, 0], gaps: [[4, 5]] }], furniture: [],
};
const box = { minX: -0.5, maxX: 0.5, minZ: -0.3, maxZ: 0.3 };
const world = (): FitWorld => ({
  layout,
  items: [
    { uid: 'a', item: 'box', x: -3, z: -2, rot: 0 },
    { uid: 'b', item: 'box', x: 2, z: 2, rot: 0 },
    { uid: 'rug', item: 'rug', x: 2, z: 2, rot: 0 },
    { uid: 'p', item: 'poster', x: 0, z: -3.9, rot: 0 },
  ],
  footprint: (i) => (i === 'poster' ? { minX: -0.3, maxX: 0.3, minZ: -0.02, maxZ: 0.02 } : box),
  kind: (i) => (i === 'rug' ? 'flat' : i === 'poster' ? 'wall' : 'floor'),
});

test('a quarter turn swaps a footprint’s width and depth', () => {
  const r = rectAt(box, 0, 0, Math.PI / 2);
  assert.ok(Math.abs(r.x1 - r.x0 - 0.6) < 1e-9 && Math.abs(r.z1 - r.z0 - 1) < 1e-9);
});

test('furniture can’t overlap, cross walls, block doorways or leave the home', () => {
  const w = world();
  assert.equal(whyNot(w, 'a', -3, -2, 0), null);
  assert.match(whyNot(w, 'a', 2.2, 2, 0)!, /already there/);
  assert.match(whyNot(w, 'a', -2, 0, 0)!, /wall/);
  assert.match(whyNot(w, 'a', -0.5, 0, 0)!, /doorway/); // gap 4..5 from x=-5 → x -1..0
  assert.match(whyNot(w, 'a', 4.8, -2, 0)!, /wall/);
  assert.match(whyNot(w, 'a', 0, 3.4, 0)!, /doorway/); // the front door
  // Rugs go anywhere inside; furniture sits on rugs.
  assert.equal(whyNot(w, 'rug', -3, -2, 0), null);
  // Wall pieces ignore floor furniture.
  assert.equal(whyNot(w, 'p', -3, -3.9, 0), null);
});

test('wall pieces snap to the nearest outer wall and face the room', () => {
  const w = world();
  assert.deepEqual(Object.values(snapToWall(w, 'poster', -4.5, 1)).map((v) => +v.toFixed(2)), [-4.88, 1, +(Math.PI / 2).toFixed(2)]);
  assert.equal(snapToWall(w, 'poster', 0, -3).rot, 0);
  assert.equal(snapToWall(w, 'poster', 4.6, 2).rot, -Math.PI / 2);
});

test('standing spots avoid furniture and walls', () => {
  const w = world();
  assert.equal(spotFree(w, -3, -2), false);
  assert.equal(spotFree(w, 0, 0), false);
  assert.equal(spotFree(w, -3, -1.2), true);
});
