import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, FURNITURE } from '../src/data/furniture.ts';
import { confirmBuy, pieceFacts, shortDuration, sizeLine } from '../src/sim/furniture-info.ts';
import { ACTIONS } from '../src/data/actions.ts';
import { activitySeconds } from '../src/sim/home-activity.ts';

const forSale = () => FURNITURE.all().filter((d) => d.category && d.price > 0);

test('every design category has pieces for sale', () => {
  for (const c of CATEGORIES) assert.ok(forSale().some((d) => d.category === c.id), `${c.id} is empty`);
});

test('every piece for sale has a preview with no holes', () => {
  for (const d of forSale()) {
    const f = pieceFacts(d);
    const all = [...f.does, ...f.effects, f.placement, f.quality?.label ?? '', f.quality?.line ?? ''].join(' | ');
    assert.ok(!/undefined|NaN|null/.test(all), `${d.id}: ${all}`);
    assert.ok(f.placement.length > 0, d.id);
    // Every action a piece offers shows up by name.
    for (const a of d.actions) if (ACTIONS[a]) assert.ok(f.does.some((x) => x.includes(ACTIONS[a].label)), `${d.id} misses ${a}`);
  }
});

test('beds say how long a full sleep takes on them', () => {
  const beds = forSale().filter((d) => d.actions.includes('sleep'));
  assert.ok(beds.length > 3);
  for (const b of beds) {
    const line = pieceFacts(b).effects.find((e) => e.includes('Full sleep'));
    assert.ok(line, `${b.id} has no sleep line`);
    assert.ok(line.includes(shortDuration(activitySeconds(ACTIONS.sleep, b.id))), `${b.id}: ${line}`);
  }
  // A luxury bed is quicker than a basic one, and says so against the basic time.
  const lux = beds.find((b) => b.quality === 'luxury');
  if (lux) assert.match(pieceFacts(lux).effects.join(' '), /on a basic bed/);
});

test('lights say what kind of light they give', () => {
  const lights = forSale().filter((d) => d.light);
  assert.ok(lights.length > 5);
  for (const l of lights) {
    const e = pieceFacts(l).effects.join(' ');
    assert.match(e, /reaches \d/, l.id);
    assert.match(e, /bulb colour/i, l.id);
  }
  const hanging = lights.find((l) => l.hang);
  if (hanging) assert.equal(pieceFacts(hanging).placement, 'Hangs from the ceiling');
});

test('sizes and durations read well', () => {
  assert.equal(sizeLine({ minX: -0.8, maxX: 0.8, minZ: -1.05, maxZ: 1.05, h: 0.9 }), '1.6 × 2.1 m, 0.9 m tall');
  assert.equal(sizeLine({ minX: 0, maxX: 2, minZ: 0, maxZ: 0, h: 0 }), '2.0 × 0.1 m');
  assert.equal(sizeLine({ minX: -0.45, maxX: 0.45, minZ: -0.45, maxZ: 0.45, h: 0.01 }), '0.9 × 0.9 m'); // a chandelier hangs below 0
  assert.equal(shortDuration(45), '45 s');
  assert.equal(shortDuration(90), '1 min 30 s');
  assert.equal(shortDuration(120), '2 min');
});

test('buying: money moves only on the confirm, once, and only if you have it', () => {
  assert.deepEqual(confirmBuy(10_000, 2_800), { ok: true, cash: 7_200 });
  assert.deepEqual(confirmBuy(2_800, 2_800), { ok: true, cash: 0 });
  assert.deepEqual(confirmBuy(2_000, 2_800), { ok: false, short: 800 });
  assert.deepEqual(confirmBuy(500, 0), { ok: true, cash: 500 });
});
