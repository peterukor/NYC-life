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

import { CLOTHES, STARTING_WARDROBE, starterWardrobe, tierOf, type SpawnClass } from '../src/data/wardrobe.ts';

test('starting wardrobes follow the class table and always cover the basics', () => {
  for (const cls of Object.keys(STARTING_WARDROBE) as SpawnClass[]) {
    const owned = starterWardrobe(cls, ['tee', 'jeans', 'sneakers'], () => 0.5).map((id) => CLOTHES.get(id)!).filter((c) => c.slot !== 'hair');
    for (const slot of ['top', 'bottom', 'shoes']) assert.ok(owned.some((c) => c.slot === slot), `${cls} has no ${slot}`);
    const want = STARTING_WARDROBE[cls];
    for (const tier of ['premium', 'exclusive'] as const) {
      assert.equal(owned.filter((c) => tierOf(c) === tier).length, want[tier], `${cls} ${tier}`);
    }
    // Plain: the table count plus at most the 3 items you were wearing.
    assert.ok(owned.filter((c) => tierOf(c) === 'plain').length <= want.plain + 3);
  }
});

import { EVENTS, RARITY, applyOutcome } from '../src/sim/events.ts';
import { newLife } from '../src/sim/state.ts';

test('events have valid rarities and legendary ones are astronomically rare', () => {
  for (const e of EVENTS) assert.ok(RARITY[e.rarity ?? 'common'], `${e.id} has an unknown rarity`);
  assert.ok(EVENTS.some((e) => e.rarity === 'legendary' && e.kind === 'good'), 'needs a legendary good event');
  assert.ok(EVENTS.some((e) => e.rarity === 'legendary' && e.kind === 'bad'), 'needs a legendary bad event');
  assert.ok(RARITY.legendary.mult * 100 < RARITY.common.mult, 'legendary must be at least 100x rarer than common');
});

test('a real inheritance lands in the bank', () => {
  const s = newLife({ name: 'T', origin: 'hustler', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
  const before = s.bank;
  applyOutcome(s, { text: 'x', tone: 'good', inherit: 40_000_000 });
  assert.equal(s.bank - before, 40_000_000);
});

import { STOCKS } from '../src/data/stocks.ts';
import { buyStock, marketDay, netWorth, priceOf, sellStock } from '../src/sim/market.ts';

test('the market is the same for everyone and trading keeps the books straight', () => {
  const day = marketDay('2026-06-01');
  for (const st of STOCKS.all()) {
    const p = priceOf(st.id, day);
    assert.ok(p > 0, `${st.id} price`);
    assert.equal(priceOf(st.id, day), p, 'deterministic');
  }
  const s = newLife({ name: 'T', origin: 'hustler', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
  const before = netWorth(s);
  assert.equal(buyStock(s, 'nyx', 20_000), null);
  // Buying costs only the fee in net worth terms.
  assert.ok(before - netWorth(s) <= 1_000 + 20_000 * 0.005 + 5);
  const r = sellStock(s, 'nyx');
  assert.ok('got' in r && r.got > 0);
  assert.equal(s.portfolio.nyx, undefined);
  assert.notEqual(buyStock(s, 'nyx', 999_999_999), null, 'cannot buy without cash');
});

import { CLASSES } from '../src/sim/state.ts';

test('each spawn class starts with its own money, home and wardrobe', () => {
  for (const cls of Object.keys(CLASSES) as (keyof typeof CLASSES)[]) {
    const c = CLASSES[cls];
    const s = newLife({ name: 'T', origin: c.origin, spawnClass: cls, look: { body: 'f', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
    assert.equal(s.money, c.cash);
    assert.equal(s.bank, c.bank);
    assert.equal(s.home.placeId, c.homeId);
    assert.equal(!!s.loan, c.loan);
    assert.equal(s.home.weeklyRent === 0, c.rentPaid);
    assert.equal(s.profile.spawnClass, cls);
  }
});

import { PATHS } from '../src/data/paths.ts';
import { ACTIONS, actionLock } from '../src/data/actions.ts';
import { joinPath, levelBlockers, levelTasks, onPathAction, pathLevel, tryLevelUp } from '../src/sim/paths.ts';

test('life paths: valid data, seeded checklists, rep, gating and level-ups', () => {
  for (const p of PATHS.all()) {
    assert.equal(p.repCurve.length, p.titles.length, `${p.id} rep curve length`);
    assert.equal(p.tasks.length, p.titles.length - 1, `${p.id} task stages`);
    for (const id of Object.keys(p.rep)) assert.ok(ACTIONS[id], `${p.id}: unknown rep action ${id}`);
    for (const st of p.tasks) for (const t of [...st.pool, ...(st.fixed ?? [])]) if (t.kind === 'action') assert.ok(ACTIONS[t.action], `${p.id}: unknown task action ${t.action}`);
  }
  assert.equal(PATHS.require('celebrity').titles.length, 6, 'celebrity tops out at 6');
  const s = newLife({ name: 'T', origin: 'hustler', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
  // Path actions are locked until you join.
  assert.ok(actionLock(ACTIONS.streetDeal, s, 12));
  joinPath(s, 'crime');
  assert.equal(actionLock(ACTIONS.streetDeal, s, 12), null);
  assert.deepEqual(levelTasks(s, 'crime'), levelTasks(s, 'crime'), 'checklist is stable');
  // Earn rep and finish the level-1 checklist.
  for (let i = 0; i < 12; i++) onPathAction(s, 'streetDeal', 0);
  s.skills.streetSmarts = 3;
  s.stats.placesVisited = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(levelBlockers(s, 'crime'), []);
  assert.equal(tryLevelUp(s, 'crime'), 'Runner');
  assert.equal(pathLevel(s, 'crime'), 2);
});
