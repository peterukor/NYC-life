import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { bestOwned, buyFurniture, mainUse } from '../src/sim/shop.ts';
import { FURNITURE, SHOP_ITEMS } from '../src/data/furniture.ts';
import { applyForJob } from '../src/sim/work.ts';
import { finishDeliShift, startDeliShift } from '../src/sim/shift.ts';
import { initClockFromUrl } from '../src/core/clock.ts';

initClockFromUrl('?hour=11');
const life = () => newLife({ name: 'T', origin: 'hustler', spawnClass: 'poor', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });

test('the shop sells 6–10ish pieces, with a basic and a nice step up from the starter bed, couch and TV', () => {
  assert.ok(SHOP_ITEMS.length >= 6 && SHOP_ITEMS.length <= 12);
  for (const kind of ['bed', 'couch', 'tv'] as const) {
    const qs = SHOP_ITEMS.map((id) => FURNITURE.get(id)!).filter((d) => d.kind === kind).map((d) => d.quality);
    assert.ok(qs.includes('basic') && qs.includes('nice'), `${kind}: ${qs}`);
  }
});

test('you can’t spend more than you have; buying delivers to storage', () => {
  const s = life();
  s.money = 10_000;
  const r = buyFurniture(s, 'bedSingle');
  assert.equal(r.ok, false);
  assert.equal(s.money, 10_000);
  s.money = 40_000;
  const ok = buyFurniture(s, 'bedSingle');
  assert.ok(ok.ok);
  assert.equal(s.money, 40_000 - FURNITURE.get('bedSingle')!.price);
  assert.ok(s.storage!.includes('bedSingle'));
  assert.equal(buyFurniture(s, 'twinBed').ok, false, 'not for sale');
});

test('a basic bed really is better than the twin you start with', () => {
  const s = life();
  const twin = mainUse(FURNITURE.get('twinBed')!)!, single = mainUse(FURNITURE.get('bedSingle')!)!;
  assert.ok(single.amount > twin.amount && single.seconds < twin.seconds);
  assert.equal(bestOwned(s, 'bed')!.id, 'twinBed');
});

test('balance: the basic bed takes a shift or two starting broke (1–2, after the 2026-10-16 pay boost)', () => {
  const s = life();
  applyForJob(s, 'deli');
  const price = FURNITURE.get('bedSingle')!.price;
  let shifts = 0;
  // A decent player over an 80-second shift: about 7 orders, 5 in 6 right, half the wait left.
  while (s.money < price && shifts < 20) {
    s.needs.energy = 100;
    s.job!.shiftsToday = 0;
    const r = startDeliShift(s);
    assert.ok(r.ok, (r as { why?: string }).why);
    finishDeliShift(s, r.session.id, { orders: Array.from({ length: 7 }, (_, i) => ({ right: i % 6 !== 3, timeLeft: 0.5 })), picks: {} });
    shifts++;
  }
  assert.ok(shifts >= 1 && shifts <= 2, `took ${shifts} shifts`);
});
