// Fights and chases: difficulty follows skill/heat; results move rep both ways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { chaseReady, chaseSetup, escaped, fightSetup, finishFight, heatFor, markChase } from '../src/sim/brawl.ts';
import { changeRep, repOf } from '../src/sim/rep.ts';

const life = () => newLife({ name: 'T', birthYear: 1995, origin: 'hustler', spawnClass: 'middle', look: {} as never, traits: [] } as never);

test('a fitter you gets a bigger green zone and more time to dodge', () => {
  const weak = life();
  const fit = life();
  fit.skills.fitness = 8;
  fit.skills.streetSmarts = 6;
  const a = fightSetup(weak, 'Big Tony', '🦍', 6);
  const b = fightSetup(fit, 'Big Tony', '🦍', 6);
  assert.ok(b.zone > a.zone, `${b.zone} > ${a.zone}`);
  assert.ok(b.dodgeMs > a.dodgeMs);
  assert.ok(b.youHp >= a.youHp);
  // Tougher foes: faster needle, more hearts.
  const easy = fightSetup(weak, 'Kid', '🧒', 1);
  const hard = fightSetup(weak, 'Boxer', '🥊', 10);
  assert.ok(hard.sweepMs < easy.sweepMs && hard.foeHp > easy.foeHp && hard.zone < easy.zone);
  for (const f of [a, b, easy, hard]) assert.ok(f.zone >= 0.1 && f.zone <= 0.42 && f.dodgeMs >= 300 && f.sweepMs >= 420);
});

test('winning a fight gives street rep; losing takes some, and a beating is the ER', () => {
  const s = life();
  const setup = fightSetup(s, 'Big Tony', '🦍', 6);
  const w = finishFight(s, setup, true, 2, () => 0);
  assert.equal(w.won, true);
  assert.equal(repOf(s).street, w.repDelta);
  assert.ok(w.repDelta > 0);
  const money0 = s.money + s.bank;
  const l = finishFight(s, setup, false, 0, () => 0);
  assert.ok(l.repDelta < 0 && l.bill > 0);
  assert.equal(money0 - (s.money + s.bank), l.bill);
  // A close loss: no ER.
  const l2 = finishFight(s, setup, false, 1, () => 0);
  assert.equal(l2.bill, 0);
  assert.ok(repOf(s).street >= 0, 'rep never below zero');
});

test('rep can go down but never below zero; rank-up title reported', () => {
  const s = life();
  assert.equal(changeRep(s, 'street', 60).title, 'Seen Around');
  changeRep(s, 'street', -500);
  assert.equal(repOf(s).street, 0);
});

test('chase heat grows with the crime and your level; setup scales; cooldown', () => {
  const s = life();
  assert.equal(heatFor(s, 0.04), 1);
  assert.equal(heatFor(s, 0.2), 3);
  s.rep = { street: 6_000, corporate: 0 };
  assert.equal(heatFor(s, 0.2), 5);
  const c1 = chaseSetup(s, 1), c5 = chaseSetup(s, 5);
  assert.ok(c5.seconds > c1.seconds && c5.speed > c1.speed && c5.density > c1.density && c5.hits <= c1.hits);
  assert.equal(chaseReady(s), true);
  markChase(s);
  assert.equal(chaseReady(s), false);
  const r0 = repOf(s).street;
  const e = escaped(s, 3, () => 0);
  assert.equal(repOf(s).street - r0, e.repDelta);
  assert.ok(e.text.length > 10);
});
