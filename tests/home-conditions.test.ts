import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { beginActivity, completeActivity } from '../src/sim/home-activity.ts';
import { arriveHome, BATHROOM_WAIT, hasDoorman } from '../src/sim/home-conditions.ts';
import { layoutForPlace } from '../src/data/homes.ts';
import type { SpawnClass } from '../src/data/wardrobe.ts';

const life = (spawnClass: SpawnClass = 'poor') =>
  newLife({ name: 'T', origin: 'hustler', spawnClass, look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });

test('the walk-up has two roommates; the shared bathroom is sometimes taken', () => {
  const s = life();
  const home = s.home.placeId;
  assert.equal(layoutForPlace(home).conditions?.roommates?.length, 2);
  const busy = beginActivity(s, 'shower', { item: 'tubShower', placeId: home, rand: () => 0 });
  assert.ok(busy.ok && busy.waitedFor);
  const plain = beginActivity(life(), 'shower', { item: 'tubShower', placeId: home, rand: () => 0.99 });
  assert.ok(plain.ok && !plain.waitedFor);
  assert.equal(s.activity!.seconds - BATHROOM_WAIT > 0, true);
  // Sleeping is never held up by the bathroom.
  const bed = beginActivity(life(), 'sleep', { item: 'twinBed', placeId: home, rand: () => 0 });
  assert.ok(bed.ok && !bed.waitedFor);
});

test('studio street noise can break a night, rarely', () => {
  const s = life('middle');
  const home = s.home.placeId;
  beginActivity(s, 'sleep', { item: 'bedSingle', placeId: home });
  const woke = completeActivity(s, () => 0.05);
  assert.equal(woke?.quirk?.id, 'streetNoise');
  beginActivity(s, 'sleep', { item: 'bedSingle', placeId: home });
  assert.equal(completeActivity(s, () => 0.5)?.quirk, null);
});

test('the penthouse housekeeper cleans once a day; doormen in the rich buildings', () => {
  const b = life('billionaire');
  assert.ok(arriveHome(b, b.home.placeId));
  assert.equal(arriveHome(b, b.home.placeId), null);
  assert.ok(b.moodlets.some((m) => m.id === 'spotless'));
  assert.equal(arriveHome(life('rich'), life('rich').home.placeId), null);
  assert.ok(hasDoorman(b) && hasDoorman(life('rich')));
  assert.ok(!hasDoorman(life('poor')) && !hasDoorman(life('middle')));
});
