// Toy furniture is built on first use now: make sure every piece still builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOY_NAMES, toyFurnitureModels } from '../src/world/furniture-toys.ts';

test('every toy furniture piece builds, sits on its footprint', () => {
  const models = toyFurnitureModels();
  const names = TOY_NAMES();
  assert.ok(names.length > 50);
  for (const n of names) {
    assert.ok(models.has(n), n);
    const g = models.get(n);
    assert.ok(g && g.getAttribute('position').count > 0, `${n} has triangles`);
    assert.ok(Math.abs(g!.boundingBox!.min.x + g!.boundingBox!.max.x) < 1e-3, `${n} centred`);
  }
  assert.equal(models.get('no-such-piece'), undefined);
});
