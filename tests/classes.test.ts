import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_ODDS, CLASSES, rollClass } from '../src/sim/state.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';

test('the class odds add up and match Peter’s numbers (55 / 35 / 9 / 1)', () => {
  const sum = CLASS_ODDS.reduce((a, [, p]) => a + p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  let seed = 12345;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 200_000;
  const tally: Record<string, number> = {};
  for (let i = 0; i < n; i++) { const c = rollClass(rand); tally[c] = (tally[c] ?? 0) + 1; }
  for (const [c, p] of CLASS_ODDS) assert.ok(Math.abs(tally[c] / n - p) < 0.01, `${c}: ${(tally[c] / n).toFixed(3)} vs ${p}`);
});

test('every class has a real home', () => {
  for (const [id, c] of Object.entries(CLASSES)) assert.ok(PLACE_BY_ID[c.homeId], `${id} → ${c.homeId}`);
});
