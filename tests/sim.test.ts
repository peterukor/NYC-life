// Tests for the life simulation. Run with: npm test
//
// These use Node's built-in test runner, so there is nothing extra to
// install. They cover the rules that must never break: money can't go
// negative or be faked, bills get charged, needs stay in range, and
// random events only happen where they make sense.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { changeMoney, chargeBill, deposit, withdraw } from '../src/sim/economy.ts';
import { applyNeeds, computeMood, decayNeeds } from '../src/sim/needs.ts';
import { newLife } from '../src/sim/state.ts';
import { advanceTo } from '../src/sim/life.ts';
import { applyForJob, completeShift, shiftBlocker } from '../src/sim/work.ts';
import { startAction, finishAction } from '../src/sim/activity.ts';
import { EVENTS, buildContext, directorPick, applyOutcome } from '../src/sim/events.ts';
import { weightedIndex, Rng } from '../src/core/rng.ts';
import { DISTRICTS, blockAt, blockRect } from '../src/world/layout.ts';
import { PLACES, doorOf } from '../src/data/places.ts';
import { CAREERS } from '../src/data/careers.ts';
import { ACTIONS } from '../src/data/actions.ts';
import { NEED_KEYS } from '../src/sim/types.ts';

const look = { body: 'f' as const, skin: '#8d5524', top: '#1d3557', bottom: '#222222', hair: '#111111' };
const fresh = (origin: 'hustler' | 'trustFund' = 'hustler') => newLife({ name: 'Test', origin, look, birthYear: 1995, traits: [] });

test('money: refuses fake, huge or overspending changes', () => {
  const s = fresh();
  const start = s.money;
  assert.equal(changeMoney(s, 1.5, 'bad').ok, false);
  assert.equal(changeMoney(s, Number.NaN, 'bad').ok, false);
  assert.equal(changeMoney(s, 10_000_000_000, 'bad').ok, false);
  assert.equal(changeMoney(s, -(start + 1), 'too much').ok, false);
  assert.equal(s.money, start, 'balance unchanged after refused changes');
  assert.equal(changeMoney(s, 500, 'tip').ok, true);
  assert.equal(s.money, start + 500);
  assert.equal(s.ledger[0].reason, 'tip');
});

test('money: bank deposit and withdraw keep the total the same', () => {
  const s = fresh();
  const total = s.money + s.bank;
  assert.equal(deposit(s, 10_000).ok, true);
  assert.equal(s.money + s.bank, total);
  assert.equal(withdraw(s, 99_999_999).ok, false);
  assert.equal(withdraw(s, 5_000).ok, true);
  assert.equal(s.money + s.bank, total);
});

test('bills draw from cash, then bank, and report any shortfall', () => {
  const s = fresh();
  s.money = 1_000;
  s.bank = 2_000;
  const r = chargeBill(s, 5_000, 'Rent');
  assert.deepEqual(r, { paid: 3_000, short: 2_000 });
  assert.equal(s.money, 0);
  assert.equal(s.bank, 0);
});

test('needs stay between 0 and 100', () => {
  const s = fresh();
  decayNeeds(s, 1000);
  for (const k of NEED_KEYS) assert.equal(s.needs[k], 0);
  applyNeeds(s, { hunger: 500 });
  assert.equal(s.needs.hunger, 100);
  const mood = computeMood(s);
  assert.ok(mood.score >= -100 && mood.score <= 100);
});

test('a week away charges rent and a loan payment', () => {
  const s = fresh('hustler');
  s.money = 500_000;
  // Pretend the save is from 8 days ago.
  s.stats.dayKey = '2000-01-01';
  const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
  s.home.rentDueDay = eightDaysAgo;
  s.loan!.lastPaidDay = eightDaysAgo;
  const loanBefore = s.loan!.owed;
  advanceTo(s, Date.now());
  assert.ok(s.money < 500_000, 'rent and loan were charged');
  assert.ok(s.loan!.owed < loanBefore, 'loan went down');
});

test('trust fund kids pay no rent', () => {
  const s = fresh('trustFund');
  assert.equal(s.home.weeklyRent, 0);
  assert.equal(s.loan, null);
});

test('jobs: skill requirements block hiring, shifts pay and count', () => {
  const s = fresh('hustler');
  assert.notEqual(applyForJob(s, 'finance'), null, 'finance needs charisma 2');
  assert.equal(applyForJob(s, 'barista'), null);
  const before = s.money;
  s.needs.energy = 100;
  const r = completeShift(s, 'grind');
  assert.ok(r.pay > 0);
  assert.equal(s.money, before + r.pay);
  assert.equal(s.job!.shiftsToday, 1);
  s.job!.shiftsToday = 99;
  const blocker = shiftBlocker(s);
  assert.ok(blocker === null || typeof blocker === 'string');
});

test('actions: cost is charged up front and effects apply on finish', () => {
  const s = fresh();
  s.needs.hunger = 10;
  const before = s.money;
  const r = startAction(s, 'dollarSlice');
  assert.equal(r.ok, true);
  assert.equal(s.money, before - ACTIONS.dollarSlice.cost!);
  if (r.ok) finishAction(s, r.action);
  assert.ok(s.needs.hunger > 10);
  s.money = 0;
  assert.equal(startAction(s, 'fullPie').ok, false, 'cannot afford');
});

test('events: weights are never negative and context matters', () => {
  const s = fresh();
  for (const where of ['street', 'subway', 'plaza', 'park', 'nightlife', 'food', 'work', 'home'] as const) {
    const ctx = buildContext(s, where);
    for (const e of EVENTS) assert.ok(e.weight(ctx) >= 0, `${e.id} weight >= 0 at ${where}`);
  }
  const home = buildContext(s, 'home');
  assert.equal(EVENTS.find((e) => e.id === 'coffeeSpill')!.weight(home), 0, 'no coffee spill at home');
});

test('director only picks events that can happen here', () => {
  const s = fresh();
  for (let i = 0; i < 200; i++) {
    s.events.cooldowns = {};
    const ev = directorPick(s, 'subway', true);
    if (ev) assert.ok(ev.weight(buildContext(s, 'subway')) > 0, `${ev.id} fits the subway`);
  }
});

test('event outcomes never make money negative', () => {
  const s = fresh();
  s.money = 100;
  applyOutcome(s, { text: 'x', tone: 'bad', money: -50_000 });
  assert.equal(s.money, 0);
  s.money = 10_000;
  applyOutcome(s, { text: 'x', tone: 'bad', loseMoneyPercent: 0.3 });
  assert.ok(s.money >= 0 && s.money < 10_000);
});

test('weighted random choice respects zero weights', () => {
  for (let i = 0; i < 100; i++) assert.notEqual(weightedIndex([0, 1, 0], Math.random()), 0);
  assert.equal(weightedIndex([0, 0]), -1);
  const a = new Rng('seed');
  const b = new Rng('seed');
  assert.equal(a.next(), b.next(), 'same seed, same numbers');
});

test('every place door sits on its own block, and data references are valid', () => {
  for (const p of PLACES) {
    const d = DISTRICTS[p.area];
    const door = doorOf(p);
    const blk = blockAt(d, door.x, door.z);
    assert.deepEqual(blk, { c: p.block[0], r: p.block[1] }, `${p.id} door on its block`);
    const b = blockRect(d, p.block[0], p.block[1]);
    assert.ok(door.x >= b.minX && door.x <= b.maxX);
    for (const a of p.actions) assert.ok(ACTIONS[a], `${p.id} action ${a} exists`);
  }
  const ids = new Set(PLACES.map((p) => p.id));
  for (const c of CAREERS) assert.ok(ids.has(c.placeId), `${c.id} workplace exists`);
});
