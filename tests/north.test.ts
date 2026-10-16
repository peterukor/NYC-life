import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NORTH_ACTIONS, NORTH_ODD, NORTH_PLACES } from '../src/data/north.ts';
import { ACTIONS } from '../src/data/actions.ts';
import { PLACE_BY_ID, PLACES } from '../src/data/places.ts';
import { pickTwist } from '../src/sim/oddities.ts';

test('north Manhattan is filled in: 30+ places above 110th St, spread to Inwood', () => {
  const north = PLACES.filter((p) => p.area === 'manhattan' && p.at[0] > 40.795);
  assert.ok(north.length >= 30, `north places: ${north.length}`);
  // Every stretch has something: Harlem, the Heights, Inwood.
  for (const [lo, hi] of [[40.795, 40.82], [40.82, 40.845], [40.845, 40.875]]) {
    assert.ok(north.filter((p) => p.at[0] >= lo && p.at[0] < hi).length >= 6, `${lo}–${hi}`);
  }
});

test('north places have real activities; landmarks link to their official sites', () => {
  for (const p of NORTH_PLACES) {
    assert.ok(PLACE_BY_ID[p.id], p.id);
    assert.ok(p.actions.length, p.id);
    for (const a of p.actions) assert.ok(ACTIONS[a], `${p.id}: ${a}`);
    if (p.type === 'landmark') assert.match(p.landmark!.officialSite, /^https:\/\//);
  }
  for (const a of NORTH_ACTIONS) assert.ok(ACTIONS[a.id]);
  for (const o of NORTH_ODD) assert.ok(pickTwist(o.action.id, () => 0.5), o.action.id);
});

test('uptown food spots serve their own food now', () => {
  assert.ok(PLACE_BY_ID.harlemSoul.actions.includes('soulPlate'));
  assert.ok(PLACE_BY_ID.chimiTruck.actions.includes('chimiBurger'));
});
