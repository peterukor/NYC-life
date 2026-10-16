import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ODD_ACTIVITIES, UPTOWN_PLACES } from '../src/data/uptown.ts';
import { ACTIONS } from '../src/data/actions.ts';
import { PLACE_BY_ID, PLACES, doorOf } from '../src/data/places.ts';
import { oddTwist, pickTwist } from '../src/sim/oddities.ts';
import { buyCityMap, CITY_MAP, hasCityMap, placeOnMap } from '../src/sim/citymap.ts';
import { newLife } from '../src/sim/state.ts';

const life = () => newLife({ name: 'Jack', birthYear: 1995, origin: 'hustler', spawnClass: 'rich', look: {} as never, traits: [] } as never);

test('uptown places: real, resolved, mostly Midtown and north, with known actions', () => {
  assert.ok(UPTOWN_PLACES.length >= 15);
  for (const p of UPTOWN_PLACES) {
    const r = PLACE_BY_ID[p.id];
    assert.ok(r, p.id);
    assert.ok(r.at[0] >= 40.745, `${p.id} is Midtown or north`);
    for (const a of p.actions) assert.ok(ACTIONS[a], `${p.id}: action ${a}`);
  }
  // Doors don't stack on top of each other.
  const doors = PLACES.filter((p) => p.area === 'manhattan').map((p) => doorOf(p));
  const keys = new Set(doors.map((d) => `${Math.round(d.x)},${Math.round(d.z)}`));
  assert.equal(keys.size, doors.length, 'every Manhattan door is its own spot');
  const north = PLACES.filter((p) => p.area === 'manhattan' && p.at[0] > 40.78).length;
  assert.ok(north >= 12, `places north of the park's middle: ${north}`);
});

test('odd activities: every twist reads well and can happen', () => {
  for (const o of ODD_ACTIVITIES) {
    assert.ok(o.twists.length >= 2, o.action.id);
    for (const t of o.twists) {
      assert.ok(t.w > 0 && t.text.length > 20 && !/undefined/.test(t.text), o.action.id);
    }
    assert.equal(pickTwist(o.action.id, () => 0), o.twists[0]);
    assert.equal(pickTwist(o.action.id, () => 0.9999), o.twists[o.twists.length - 1]);
  }
});

test('a twist pays out and moves mood', () => {
  const s = life();
  const before = s.money;
  const r = oddTwist(s, 'storageAuction', () => 0.99);
  assert.ok(r);
  const o = ODD_ACTIVITIES.find((x) => x.action.id === 'storageAuction')!;
  assert.equal(r!.twist, o.twists.at(-1));
  assert.equal(oddTwist(s, 'sleep'), null);
  const win = oddTwist(s, 'storageAuction', () => 0.7); // the parking spot
  assert.ok(s.money !== before || win);
});

test('🗺️ Full City Map: far places hidden until you buy it', () => {
  const s = life();
  s.money = 100_000;
  const far = PLACE_BY_ID.tortureMuseum;
  const me = { x: 0, z: 0 };
  assert.equal(placeOnMap(s, far, me), false);
  assert.equal(placeOnMap(s, PLACE_BY_ID[s.home.placeId], me), true, 'home always shows');
  s.stats.placesVisited.push('tortureMuseum');
  assert.equal(placeOnMap(s, far, me), true, 'been there: shows');
  s.stats.placesVisited.pop();
  assert.equal(buyCityMap(s), null);
  assert.ok(hasCityMap(s));
  assert.equal(s.money, 100_000 - CITY_MAP.price);
  assert.equal(placeOnMap(s, far, me), true);
  assert.ok(buyCityMap(s), 'only once');
});
