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
