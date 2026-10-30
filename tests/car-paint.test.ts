// Tests for the car paint and material ids (world/car-shapes.ts,
// world/vehicle-models.ts): metallic paints are readable from the colour,
// every vehicle carries material ids, and parked cars stay plain.
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VEHICLES } from '../src/data/vehicles.ts';
import { isMetallic, MAT, metallic, paintMat, solid } from '../src/world/car-shapes.ts';
import { PAINT_MARKER, vehicleGeometry } from '../src/world/vehicle-models.ts';

test('metallic and solid paints round-trip through the blue byte', () => {
  for (const hex of ['#b7bcc3', '#16181c', '#ffffff', '#000000', '#ffc629']) {
    assert.ok(isMetallic(metallic(hex)), `${hex} metallic`);
    assert.ok(!isMetallic(solid(hex)), `${hex} solid`);
    // At most one step of blue changes; red and green never do.
    assert.equal(metallic(hex).slice(0, 5), hex.slice(0, 5));
    assert.ok(Math.abs(parseInt(metallic(hex).slice(5), 16) - parseInt(hex.slice(5), 16)) <= 1);
  }
});

test('traffic paints are a believable NYC mix with some metallics', () => {
  for (const v of VEHICLES.all()) for (const p of v.paints) assert.match(p, /^#[0-9a-f]{6}$/, `${v.id} paint ${p}`);
  const all = VEHICLES.all().filter((v) => !v.service).flatMap((v) => v.paints);
  const metals = all.filter(isMetallic).length;
  assert.ok(metals / all.length > 0.3 && metals / all.length < 0.8, `metallic share ${metals}/${all.length}`);
});

test('paint material ids pack the trim line', () => {
  const m = paintMat(0.37, 1);
  assert.equal(m % 16, MAT.paint);
  assert.equal(Math.floor(m / 16) % 4, 1);
  assert.equal(Math.floor(m / 64), 37);
});

test('every vehicle has material ids, with paint, glass and tyres', () => {
  for (const v of VEHICLES.all()) {
    const g = vehicleGeometry(v, PAINT_MARKER, 1);
    const a = g.getAttribute('aMat');
    assert.ok(a, `${v.id} has aMat`);
    const ids = new Set<number>();
    for (let i = 0; i < a.count; i++) ids.add(a.getX(i) % 16);
    for (const want of [MAT.paint, MAT.tyre, MAT.rim, MAT.lamp]) assert.ok(ids.has(want), `${v.id} has material ${want}`);
    if (v.spec?.cabin) assert.ok(ids.has(MAT.glass), `${v.id} has glass`);
  }
});

test('parked (baked) cars carry no material ids', () => {
  for (const v of VEHICLES.all()) assert.equal(vehicleGeometry(v, v.paints[0], 0, true).getAttribute('aMat'), undefined, v.id);
});
