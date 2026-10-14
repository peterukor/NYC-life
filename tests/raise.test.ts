import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { applyForJob, completeShift } from '../src/sim/work.ts';
import { newRaiseGame, raiseBlocker, raiseDifficulty, resolveRaise, stepRaiseGame, inZone } from '../src/sim/raise.ts';
import { CAREER_BY_ID } from '../src/data/careers.ts';

const life = () => newLife({ name: 'T', origin: 'hustler', spawnClass: 'poor', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });

/** A player who holds when below the zone's centre (with reaction lag `lag` seconds). */
function play(raise: number, skill: number, seed = 1): boolean {
  let x = seed;
  const rand = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const g = newRaiseGame(raise);
  const dt = 1 / 30;
  let hold = false;
  let react = 0;
  while (!g.done) {
    react -= dt;
    if (react <= 0) {
      // Skilled players read the zone well; the target wobbles by their error.
      hold = (g.zoneY - g.y) - 0.45 * g.vy + (rand() - 0.5) * g.d.zone * (1 - skill) * 2 > 0;
      react = 0.05 + (1 - skill) * 0.25;
    }
    stepRaiseGame(g, dt, hold, rand);
  }
  return g.done === 'won';
}

test('each raise is harder than the last', () => {
  for (let r = 1; r < 5; r++) {
    const a = raiseDifficulty(r), b = raiseDifficulty(r + 1);
    assert.ok(b.zone < a.zone && b.speed > a.speed && b.drain > a.drain);
  }
});

test('the first raise is winnable; the fifth is hard; doing nothing loses', () => {
  const rate = (raise: number, skill: number) => Array.from({ length: 40 }, (_, i) => play(raise, skill, i + 1)).filter(Boolean).length / 40;
  assert.ok(rate(1, 0.7) > 0.6, `raise 1, decent player: ${rate(1, 0.7)}`);
  assert.ok(rate(5, 0.7) < rate(1, 0.7), 'raise 5 harder');
  assert.ok(rate(5, 0.7) < 0.45, `raise 5, decent player: ${rate(5, 0.7)}`);
  const idle = newRaiseGame(1);
  while (!idle.done) stepRaiseGame(idle, 1 / 30, false);
  assert.equal(idle.done, 'lost');
  assert.ok(!inZone({ ...idle, y: 0, zoneY: 0.9 }));
});

test('no automatic promotions; ask when ready; losing means a couple more shifts', () => {
  const s = life();
  applyForJob(s, 'bartender');
  s.skills[CAREER_BY_ID.bartender.skill] = 3;
  for (let i = 0; i < 12; i++) {
    s.needs.energy = 100;
    s.job!.shiftsToday = 0;
    completeShift(s, 'grind');
  }
  assert.equal(s.job!.level, 0, 'shifts alone never promote');
  assert.equal(raiseBlocker(s), null);
  assert.equal(resolveRaise(s, false), null);
  assert.ok(raiseBlocker(s), 'not yet after a no');
  s.job!.shiftsAtLevel += 2;
  assert.ok(resolveRaise(s, true));
  assert.equal(s.job!.level, 1);
});
