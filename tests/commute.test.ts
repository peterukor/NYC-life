import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { afterWalk, changedClothes, fightLoseChance, stainAtWork, subwayIncident } from '../src/sim/commute.ts';
import { applyForJob } from '../src/sim/work.ts';

const life = () => newLife({ name: 'T', origin: 'hustler', spawnClass: 'poor', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });

test("fight odds follow Peter's numbers: 0% → 90%, 50% → 65%, 100% → 5%", () => {
  assert.equal(fightLoseChance(0), 0.9);
  assert.ok(Math.abs(fightLoseChance(5) - 0.65) < 1e-9);
  assert.ok(Math.abs(fightLoseChance(10) - 0.05) < 1e-9);
  for (let f = 0; f < 10; f++) assert.ok(fightLoseChance(f + 1) < fightLoseChance(f), 'fitter always loses less');
});

test('a long walk tires you; a short one is free', () => {
  const s = life();
  s.needs.energy = 80;
  assert.equal(afterWalk(s, 100), null);
  afterWalk(s, 1200);
  assert.ok(s.needs.energy < 80);
});

test('a subway spill stains you until you change; work notices', () => {
  const s = life();
  applyForJob(s, 'bartender');
  const inc = subwayIncident(s, () => 0);
  assert.equal(inc?.kind, 'spill');
  const p = s.job!.performance;
  assert.ok(stainAtWork(s));
  assert.equal(s.job!.performance, p - 8);
  changedClothes(s);
  assert.equal(stainAtWork(s), null);
});

test('subway fights: fit people mostly win, and most rides are quiet', () => {
  const s = life();
  s.skills.fitness = 10;
  const rolls = [0.09, 0.5]; // fight, then the win roll
  const inc = subwayIncident(s, () => rolls.shift()!);
  assert.equal(inc?.kind, 'fight');
  assert.ok(inc?.kind === 'fight' && inc.won);
  assert.equal(subwayIncident(life(), () => 0.5), null);
});
