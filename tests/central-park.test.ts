// The outdoor Central Park plan (world/central-park-plan.ts): everything
// sits where it should — inside the park, out of the water, off the paths,
// clear of the walk-in park's door.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS } from '../src/world/layout.ts';
import { centralParkPlan, centralParkTrees, pointInPoly, seasonOf } from '../src/world/central-park-plan.ts';
import { pondsFor } from '../src/data/parks.ts';
import { doorOf, PLACE_BY_ID } from '../src/data/places.ts';

const plan = centralParkPlan(DISTRICTS.manhattan)!;
const inside = (x: number, z: number, pad = 0) => x > plan.grass.minX + pad && x < plan.grass.maxX - pad && z > plan.grass.minZ + pad && z < plan.grass.maxZ - pad;

test('only Manhattan has Central Park, and it is the long rectangle in the middle', () => {
  assert.ok(plan);
  assert.equal(centralParkPlan(DISTRICTS.brooklyn), null);
  const w = plan.grass.maxX - plan.grass.minX, l = plan.grass.maxZ - plan.grass.minZ;
  assert.ok(l > w * 2.5, 'much longer than wide');
});

test('the real water bodies are there, inside the park, the Reservoir the biggest', () => {
  const names = plan.waters.map((w) => w.name);
  for (const n of ['The Pond', 'The Lake', 'Conservatory Water', 'Turtle Pond', 'The Reservoir', 'The Pool', 'Harlem Meer']) assert.ok(names.includes(n), n);
  for (const w of plan.waters) for (const p of w.pts) assert.ok(inside(p.x, p.z, 2), `${w.name} stays in the park`);
  const area = (n: string) => { const w = plan.waters.find((q) => q.name === n)!; return w.rx * w.rz; };
  assert.ok(plan.waters.every((w) => w.name === 'The Reservoir' || area(w.name) < area('The Reservoir')));
  // North (−z) to south: Meer and Reservoir up north, the Pond down south.
  const z = (n: string) => plan.waters.find((q) => q.name === n)!.z;
  assert.ok(z('Harlem Meer') < z('The Reservoir') && z('The Reservoir') < z('The Lake') && z('The Lake') < z('The Pond'));
  // The 2D map and the nav grid get the same outlines.
  assert.equal(pondsFor(DISTRICTS.manhattan).filter((p) => p.pts).length, plan.waters.length);
});

test('nothing dry-land sits in the water; solids are on the water', () => {
  const wet = (x: number, z: number) => plan.waters.some((w) => pointInPoly(x, z, w.pts));
  for (const f of plan.features) if (!['bowBridge', 'gapstow', 'dock'].includes(f.kind)) assert.ok(!wet(f.x, f.z), `${f.kind} at ${f.x.toFixed(0)},${f.z.toFixed(0)}`);
  for (const l of plan.lamps) assert.ok(!wet(l.x, l.z), 'lamp in water');
  for (const b of plan.benches) assert.ok(!wet(b.x, b.z), 'bench in water');
  for (const s of plan.solids) assert.ok(wet((s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2), 'solid on water');
  assert.ok(plan.solids.length > 20);
  for (const b of [...plan.rowboats, ...plan.sailboats]) assert.ok(wet(b.x, b.z), 'boat loop on water');
});

test('trees: plenty, varied, not in the water or on the paths, clear of the door', () => {
  const door = doorOf(PLACE_BY_ID.centralPark);
  const trees = centralParkTrees(plan, 'autumn');
  assert.ok(trees.length > 900 && trees.length < 2200, `${trees.length} trees`);
  const kinds = new Set(trees.map((t) => t.sp));
  for (const k of ['elm', 'oak', 'maple', 'pine', 'cherry', 'willow']) assert.ok(kinds.has(k as never), k);
  for (const t of trees) {
    assert.ok(inside(t.x, t.z), 'tree in the park');
    assert.ok(!plan.inWater(t.x, t.z), 'tree in water');
    assert.ok(!plan.onPath(t.x, t.z), 'tree on a path');
  }
  // City.ts keeps them off the door; the plan keeps the door's plaza paved anyway.
  assert.ok(plan.onPath(door.x, door.z), 'the walk-in door is on a paved plaza');
  assert.ok(!plan.inWater(door.x, door.z, 5));
  // Same spots every season, different colours.
  const spring = centralParkTrees(plan, 'spring');
  assert.equal(spring.length, trees.length);
  assert.notDeepEqual(spring.map((t) => t.c), trees.map((t) => t.c));
});

test('seasons follow the game month', () => {
  assert.equal(seasonOf('2026-10-30'), 'autumn');
  assert.equal(seasonOf('2026-04-02'), 'spring');
  assert.equal(seasonOf('2026-07-14'), 'summer');
  assert.equal(seasonOf('2027-01-05'), 'winter');
});

test('walking routes go round the water, not across it', async () => {
  const { buildNavGrid, findPath } = await import('../src/world/nav.ts');
  const nav = buildNavGrid(DISTRICTS.manhattan, plan.solids);
  const wet = (x: number, z: number) => plan.waters.some((w) => pointInPoly(x, z, w.pts));
  const g = plan.grass;
  const at = (u: number, v: number) => ({ x: g.minX + u * (g.maxX - g.minX), z: g.maxZ - v * (g.maxZ - g.minZ) });
  // Across the Lake (Cherry Hill → the Ramble), past the Reservoir, round the Pond and the Meer.
  for (const [a, b] of [[at(0.4, 0.25), at(0.4, 0.32)], [at(0.5, 0.52), at(0.5, 0.73)], [at(0.86, 0.0), at(0.75, 0.07)], [at(0.65, 0.92), at(0.8, 0.99)]]) {
    const path = [a, ...findPath(nav, a.x, a.z, b.x, b.z)];
    assert.ok(path.length > 1);
    for (let i = 1; i < path.length; i++)
      for (let t = 0; t <= 1; t += 0.05) {
        const x = path[i - 1].x + (path[i].x - path[i - 1].x) * t, z = path[i - 1].z + (path[i].z - path[i - 1].z) * t;
        assert.ok(!wet(x, z), `route through water at ${x.toFixed(0)},${z.toFixed(0)}`);
      }
  }
});
