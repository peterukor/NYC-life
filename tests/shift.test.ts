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

import { AUTO_SHIFT_SECONDS, COUNTER_MENUS, payBand, careerBand, SHIFT_PLAY_SECONDS } from '../src/sim/shift.ts';
import { CAREERS } from '../src/data/careers.ts';
import { shiftBlocker } from '../src/sim/work.ts';

test("Peter's pay: about $30 auto and $90 played; tip jobs start lower, skilled jobs higher; raises scale both", () => {
  assert.deepEqual(careerBand('deli', 0), { auto: 6_000, max: 22_500 }, 'auto ×2, played ×2.5 (Peter, 2026-10-16)');
  assert.ok(careerBand('bartender').auto < careerBand('deli').auto, 'tips: lower base');
  assert.ok(careerBand('dancer').auto < careerBand('deli').auto && careerBand('dancer').max > careerBand('deli').max, 'dancer: low base, big tips');
  assert.ok(careerBand('tech').auto > careerBand('deli').auto && careerBand('finance').auto > careerBand('tech').auto, 'skilled jobs start higher');
  for (const c of CAREERS) {
    const b0 = careerBand(c.id, 0), b5 = careerBand(c.id, 5);
    assert.ok(b0.max > b0.auto, c.id);
    assert.ok(b5.auto > b0.auto && b5.max > b0.max, c.id);
  }
  assert.equal(SHIFT_PLAY_SECONDS, 80, '1:20 (Peter, 2026-10-16)');
  assert.equal(AUTO_SHIFT_SECONDS, 30);
});

test('auto pays exactly the lowest wage and never raises performance; a great played shift is capped at the max', () => {
  const s = life();
  const band = payBand(s);
  const perf = s.job!.performance;
  let r = startDeliShift(s);
  assert.ok(r.ok);
  const auto = finishDeliShift(s, r.session.id, { orders: [], picks: {}, skipped: true })!;
  assert.equal(auto.total, band.auto);
  assert.equal(s.job!.performance, perf);
  assert.equal(auto.rep.length, 0, 'auto gives no rep');
  r = startDeliShift(s);
  assert.ok(r.ok, (r as { why?: string }).why);
  const many = { orders: Array.from({ length: 60 }, () => ({ right: true, timeLeft: 1 })), picks: {} };
  const slip = finishDeliShift(s, r.session.id, many)!;
  assert.equal(slip.total, band.max);
  assert.ok(slip.capped);
  assert.ok(slip.rep[0]?.kind === 'street' && slip.rep[0].points > 0, 'bodega shifts give street rep');
});

test('six shifts a game day', () => {
  const s = life();
  for (let i = 0; i < 6; i++) {
    s.needs.energy = 100;
    const r = startDeliShift(s);
    assert.ok(r.ok, `shift ${i + 1}`);
    finishDeliShift(s, r.session.id, { orders: [], picks: {}, skipped: true });
  }
  assert.match(shiftBlocker(s) ?? '', /6 shifts a day/);
});

test('office jobs give corporate rep', () => {
  const s = life();
  s.skills.charisma = 3;
  assert.equal(applyForJob(s, 'finance'), null);
  const r = startDeliShift(s);
  assert.ok(r.ok, (r as { why?: string }).why);
  const slip = finishDeliShift(s, r.session.id, { orders: Array.from({ length: 20 }, () => ({ right: true, timeLeft: 0.5 })), picks: {} })!;
  assert.equal(slip.rep[0]?.kind, 'corporate');
  assert.ok((s.rep?.corporate ?? 0) > 0);
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

test('🚓 cops get both reps: bad cops lean street, good cops lean corporate', () => {
  const shift = (exposure: number) => {
    const s = life();
    s.skills.fitness = 2;
    assert.equal(applyForJob(s, 'cop'), null);
    s.exposure = exposure;
    const r = startDeliShift(s);
    assert.ok(r.ok, (r as { why?: string }).why);
    const slip = finishDeliShift(s, r.session.id, { orders: Array.from({ length: 20 }, () => ({ right: true, timeLeft: 0.5 })), picks: {} })!;
    const get = (k: string) => slip.rep.find((x) => x.kind === k)?.points ?? 0;
    return { street: get('street'), corporate: get('corporate') };
  };
  const good = shift(0), bad = shift(30);
  assert.ok(good.street > 0 && good.corporate > good.street, `good cop ${JSON.stringify(good)}`);
  assert.ok(bad.corporate > 0 && bad.street > bad.corporate, `bad cop ${JSON.stringify(bad)}`);
});

test('auto is pay only: no skill, no raise progress; a played shift builds both', () => {
  const s = life();
  const skill0 = s.skills.hustle;
  let r = startDeliShift(s);
  assert.ok(r.ok);
  const auto = finishDeliShift(s, r.session.id, { orders: [], picks: {}, skipped: true })!;
  assert.equal(s.skills.hustle, skill0, 'no skill from auto');
  assert.equal(s.job!.shiftsAtLevel, 0, 'auto doesn’t count toward a raise');
  assert.ok(!auto.counted && auto.skill === 0);
  r = startDeliShift(s);
  assert.ok(r.ok);
  const played = finishDeliShift(s, r.session.id, { orders: Array.from({ length: 20 }, () => ({ right: true, timeLeft: 0.5 })), picks: {} })!;
  assert.ok(s.skills.hustle > skill0 && played.skill > 0);
  assert.equal(s.job!.shiftsAtLevel, 1);
  assert.ok(played.counted);
});
