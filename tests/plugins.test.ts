// Tests for the plug-in registries: weather, vehicles and systems.
// They check that content added as data is valid, and that a broken
// plug-in can't crash the game. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WEATHER, weatherFor, weatherDef, weatherNeedMultiplier } from '../src/sim/weather.ts';
import { SYSTEMS, SystemRunner, type SystemContext } from '../src/core/systems.ts';

test('every weather type is complete and reachable', () => {
  for (const w of WEATHER.all()) {
    assert.ok(w.label && w.emoji, `${w.id} needs a label and emoji`);
    assert.ok(w.grey >= 0 && w.grey <= 1, `${w.id} grey must be 0..1`);
    let anyMonth = false;
    for (let m = 1; m <= 12; m++) if (w.odds(m, 12) > 0 || w.odds(m, 16) > 0) anyMonth = true;
    assert.ok(anyMonth, `${w.id} can never happen`);
  }
});

test('weatherFor always returns a registered weather, deterministically', () => {
  for (let d = 1; d <= 28; d++) {
    for (const month of ['01', '07', '10']) {
      const key = `2026-${month}-${String(d).padStart(2, '0')}`;
      const a = weatherFor(key, 10);
      assert.ok(WEATHER.has(a), `unknown weather ${a}`);
      assert.equal(weatherFor(key, 10), a, 'same day must give the same weather');
    }
  }
  // Snow never in July, heat waves never in January.
  for (let d = 1; d <= 28; d++) {
    assert.notEqual(weatherFor(`2026-07-${String(d).padStart(2, '0')}`, 10), 'snow');
    assert.notEqual(weatherFor(`2026-01-${String(d).padStart(2, '0')}`, 10), 'heatwave');
  }
});

test('weather changes how fast needs drain', () => {
  assert.ok(weatherNeedMultiplier('heatwave', 'hygiene') > 1);
  assert.equal(weatherNeedMultiplier('sunny', 'hygiene'), 1);
  assert.equal(weatherDef('no-such-weather').id, 'sunny');
});

test('a system that throws is switched off, the others keep running', () => {
  let goodRuns = 0;
  SYSTEMS.add(
    { id: 'test-broken', update: () => { throw new Error('boom'); } },
    { id: 'test-good', update: () => { goodRuns++; } },
  );
  const runner = new SystemRunner();
  const ctx = {} as SystemContext;
  const warn = console.warn;
  console.warn = () => {};
  runner.update(0.016, ctx);
  runner.update(0.016, ctx);
  console.warn = warn;
  assert.equal(goodRuns, 2);
});

import { VEHICLES, pickVehicle } from '../src/data/vehicles.ts';

test('every vehicle is complete', () => {
  for (const v of VEHICLES.all()) {
    assert.ok(v.paints.length > 0, `${v.id} needs at least one paint`);
    assert.ok(v.speed[0] > 0 && v.speed[0] <= v.speed[1], `${v.id} speed range is wrong`);
    assert.ok(v.trafficWeight >= 0 && v.parkWeight >= 0);
  }
  // Buses and fire engines never park at the kerb.
  for (let i = 0; i < 200; i++) assert.notEqual(pickVehicle(Math.random, 'parkWeight').id, 'bus');
});

import { PIN_KINDS, PIN_SOURCES } from '../src/data/pins.ts';

test('every pin source uses a known pin kind', () => {
  const ids = new Set(PIN_KINDS.all().map((k) => k.id));
  assert.ok(PIN_SOURCES.size > 0);
  for (const k of ['home', 'work', 'sale', 'landmark']) assert.ok(ids.has(k), `missing pin kind ${k}`);
});

import { FURNITURE } from '../src/data/furniture.ts';
import { HOME_LAYOUTS, HOME_LAYOUT_FOR } from '../src/data/homes.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';

test('home layouts only use real furniture, inside the walls, with unique ids', () => {
  for (const l of HOME_LAYOUTS.all()) {
    const uids = new Set<string>();
    for (const f of l.furniture) {
      assert.ok(FURNITURE.has(f.item), `${l.id}: unknown furniture ${f.item}`);
      assert.ok(Math.abs(f.x) <= l.width / 2 && Math.abs(f.z) <= l.depth / 2, `${l.id}: ${f.uid} is outside the home`);
      assert.ok(!uids.has(f.uid), `${l.id}: duplicate uid ${f.uid}`);
      uids.add(f.uid);
    }
    // Every home needs the basics.
    const has = (a: string) => l.furniture.some((f) => FURNITURE.get(f.item)!.actions.includes(a));
    for (const a of ['sleep', 'snack', 'shower', 'toilet']) assert.ok(has(a), `${l.id} has nowhere to ${a}`);
  }
  for (const [placeId, layoutId] of Object.entries(HOME_LAYOUT_FOR)) {
    assert.ok(PLACE_BY_ID[placeId], `unknown home place ${placeId}`);
    assert.ok(HOME_LAYOUTS.has(layoutId), `unknown layout ${layoutId}`);
  }
});
