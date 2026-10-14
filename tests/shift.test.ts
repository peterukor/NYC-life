import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { applyForJob } from '../src/sim/work.ts';
import { abandonShift, finishDeliShift, makeOrder, orderRight, orderTip, startDeliShift, SHIFT_ORDERS } from '../src/sim/shift.ts';
import { initClockFromUrl } from '../src/core/clock.ts';

initClockFromUrl('?hour=11');

const life = () => {
  const s = newLife({ name: 'T', origin: 'hustler', spawnClass: 'poor', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
  assert.equal(applyForJob(s, 'deli'), null);
  return s;
};
const goodPlay = { orders: Array.from({ length: SHIFT_ORDERS }, () => ({ right: true, timeLeft: 0.6 })), picks: {} };

test('orders are built from real ingredients, in any order of taps', () => {
  for (let i = 0; i < 50; i++) {
    const o = makeOrder();
    assert.ok(o.items.length >= 1 && o.items.length <= 6);
    assert.ok(orderRight(o, [...o.items].reverse()));
    assert.ok(!orderRight(o, o.items.slice(1)));
  }
});

test('a shift pays once: a second collect (double-tap, second tab) pays nothing', () => {
  const s = life();
  const r = startDeliShift(s);
  assert.ok(r.ok, (r as { why?: string }).why);
  const before = s.money;
  const slip = finishDeliShift(s, r.session.id, goodPlay)!;
  assert.ok(slip.total > 0 && s.money === before + slip.total);
  assert.equal(finishDeliShift(s, r.session.id, goodPlay), null);
  assert.equal(s.money, before + slip.total);
});

test('a shift saved mid-way and reloaded can’t be paid; walking out pays nothing', () => {
  const s = life();
  const r = startDeliShift(s);
  assert.ok(r.ok);
  const saved = JSON.parse(JSON.stringify(s));
  // Reload: the game abandons an unfinished shift.
  assert.equal(abandonShift(saved), true);
  const m = saved.money;
  assert.equal(finishDeliShift(saved, r.session.id, goodPlay), null);
  assert.equal(saved.money, m);
});

test('good work earns tips; wrong orders don’t; a shift costs energy and hunger', () => {
  assert.ok(orderTip({ right: true, timeLeft: 1 }) > orderTip({ right: true, timeLeft: 0 }));
  assert.equal(orderTip({ right: false, timeLeft: 1 }), 0);
  const s = life();
  const e = s.needs.energy, h = s.needs.hunger;
  const r = startDeliShift(s);
  assert.ok(r.ok);
  const slip = finishDeliShift(s, r.session.id, { orders: goodPlay.orders.map((o, i) => ({ ...o, right: i % 2 === 0 })), picks: {} })!;
  assert.equal(slip.right, 3);
  assert.ok(s.needs.energy < e && s.needs.hunger < h);
});

test('the bar is a hands-on counter too: drinks from the bar menu, its own choices', async () => {
  const { COUNTER_MENUS, menuFor } = await import('../src/sim/shift.ts');
  const bar = COUNTER_MENUS.bartender;
  const ids = new Set(bar.ingredients.map((i) => i.id));
  for (let i = 0; i < 80; i++) {
    const o = makeOrder(Math.random, bar);
    assert.ok(o.items.every((x) => ids.has(x)), o.ask);
    assert.ok(o.ask.startsWith('Can I get'));
  }
  assert.equal(menuFor('nope'), COUNTER_MENUS.deli, 'unknown careers fall back to the deli');
  const s = newLife({ name: 'T', origin: 'hustler', spawnClass: 'poor', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
  assert.equal(applyForJob(s, 'bartender'), null);
  initClockFromUrl('?hour=17');
  const r = startDeliShift(s);
  assert.ok(r.ok, (r as { why?: string }).why);
  assert.ok(r.session.choices.every((c) => bar.choices.some((x) => x.id === c)), 'bar choices');
  const close = { [r.session.choices[0]]: 'stay', close: 'stay' };
  const slip = finishDeliShift(s, r.session.id, { orders: goodPlay.orders, picks: close }, () => 0.99)!;
  assert.ok(slip.tips > 0);
  initClockFromUrl('?hour=11');
});

test('late-night bar tips are bigger', () => {
  const tipsAt = (hour: number) => {
    initClockFromUrl(`?hour=${hour}`);
    const s = newLife({ name: 'T', origin: 'hustler', spawnClass: 'poor', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
    applyForJob(s, 'bartender');
    const r = startDeliShift(s);
    assert.ok(r.ok, (r as { why?: string }).why);
    return finishDeliShift(s, r.session.id, goodPlay, () => 0.99)!.tips;
  };
  assert.ok(tipsAt(23) > tipsAt(17));
  initClockFromUrl('?hour=11');
});

import { COUNTER_MENUS, payBand, careerBand, SHIFT_PAY, SHIFT_PLAY_SECONDS } from '../src/sim/shift.ts';
import { CAREERS } from '../src/data/careers.ts';
import { shiftBlocker } from '../src/sim/work.ts';

test("Peter's pay: auto $50, a played shift up to $300, raises scale both", () => {
  assert.deepEqual(careerBand('deli', 0), { auto: 5_000, max: 30_000 });
  for (const c of CAREERS) {
    const b0 = careerBand(c.id, 0), b5 = careerBand(c.id, 5);
    assert.equal(b0.auto, SHIFT_PAY.auto, c.id);
    assert.equal(b0.max, SHIFT_PAY.max, c.id);
    assert.ok(b5.auto > b0.auto && b5.max > b0.max, c.id);
  }
  assert.ok(SHIFT_PLAY_SECONDS >= 300 && SHIFT_PLAY_SECONDS <= 420, '5–7 minutes');
});

test('auto pays exactly the lowest wage; a great played shift is capped at the max', () => {
  const s = life();
  const band = payBand(s);
  let r = startDeliShift(s);
  assert.ok(r.ok);
  const auto = finishDeliShift(s, r.session.id, { orders: [], picks: {}, skipped: true })!;
  assert.equal(auto.total, band.auto);
  s.job!.dayKey = 'yesterday'; // a new game day
  r = startDeliShift(s);
  assert.ok(r.ok, (r as { why?: string }).why);
  const many = { orders: Array.from({ length: 60 }, () => ({ right: true, timeLeft: 1 })), picks: {} };
  const slip = finishDeliShift(s, r.session.id, many)!;
  assert.equal(slip.total, band.max);
  assert.ok(slip.capped);
});

test('one shift a game day', () => {
  const s = life();
  const r = startDeliShift(s);
  assert.ok(r.ok);
  finishDeliShift(s, r.session.id, { orders: [], picks: {}, skipped: true });
  assert.match(shiftBlocker(s) ?? '', /One shift a day/);
});

test('every job’s menu: real items, enough choices, every dish buildable', () => {
  for (const [id, m] of Object.entries(COUNTER_MENUS)) {
    const ids = new Set(m.ingredients.map((i) => i.id));
    assert.equal(ids.size, m.ingredients.length, `${id}: duplicate item ids`);
    assert.ok(m.choices.length >= 3, `${id}: needs 3+ choices`);
    for (const d of m.dishes) for (const x of [...d.items, ...(d.extras ?? []).map((e) => e[1])]) assert.ok(ids.has(x), `${id}: ${d.name} uses unknown ${x}`);
    if (m.side) assert.ok(ids.has(m.side[2]), `${id}: side`);
    for (let i = 0; i < 30; i++) {
      const o = makeOrder(Math.random, m);
      assert.ok(o.items.length <= 7, `${id}: order fits the tray`);
    }
  }
  assert.ok(COUNTER_MENUS.bartender.runner, 'the bar has a waiter');
  assert.ok(makeOrder(Math.random, COUNTER_MENUS.bartender).table! >= 1, 'bar orders come from tables');
});

test('a twist multiplier (lost fight, busted) shrinks the pay', () => {
  const s = life();
  const r = startDeliShift(s);
  assert.ok(r.ok);
  const slip = finishDeliShift(s, r.session.id, { orders: [], picks: {}, skipped: true }, Math.random, 0)!;
  assert.equal(slip.total, 0);
});
