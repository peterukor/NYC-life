// 🔑 Buying homes: price, live rent-free, tenants pay weekly, selling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { buyHome, collectRents, homePrice, REAL_ESTATE, sellHome } from '../src/sim/realestate.ts';
import { moveCost, moveTo, MOVING } from '../src/sim/moving.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';

const life = () => newLife({ name: 'Jack', birthYear: 1995, origin: 'hustler', spawnClass: 'rich', look: {} as never, traits: [] } as never);

test('price is five years of rent; the shelter is not for sale', () => {
  assert.equal(homePrice(PLACE_BY_ID.hkStudio), Math.round((PLACE_BY_ID.hkStudio.rent! * 260) / 10_000) * 10_000);
  assert.equal(homePrice(PLACE_BY_ID.shelter), 0);
});

test('buy where you live: no more rent', () => {
  const s = life();
  s.bank = 100_000_000;
  const home = PLACE_BY_ID[s.home.placeId];
  const t0 = s.money + s.bank;
  assert.equal(buyHome(s, home.id), null);
  assert.equal(t0 - (s.money + s.bank), homePrice(home));
  assert.equal(s.home.weeklyRent, 0);
  assert.equal(buyHome(s, home.id), 'You already own it.');
  assert.ok('error' in sellHome(s, home.id), 'can’t sell where you live');
});

test('a home you own but don’t live in pays you weekly; selling gets 90%', () => {
  const s = life();
  s.bank = 100_000_000;
  assert.equal(buyHome(s, 'wburgLoft'), null);
  const o = s.owned!.find((x) => x.placeId === 'wburgLoft')!;
  o.lastRent = '2026-10-01';
  const m0 = s.money + s.bank;
  const notes = collectRents(s, '2026-10-15', () => 0.99); // 2 weeks, no repairs
  assert.equal(notes.length, 2);
  assert.equal(s.money + s.bank - m0, 2 * Math.round((PLACE_BY_ID.wburgLoft.rent! * REAL_ESTATE.keep) / 100) * 100);
  assert.equal(o.lastRent, '2026-10-15');
  const before = s.money;
  const r = sellHome(s, 'wburgLoft');
  assert.ok(!('error' in r));
  assert.equal(s.money - before, Math.round((o.price * 0.9) / 100) * 100);
});

test('moving into a home you own: just the movers, no rent', () => {
  const s = life();
  s.bank = 100_000_000;
  buyHome(s, 'wburgLoft');
  assert.equal(moveCost(PLACE_BY_ID.wburgLoft, s), MOVING.fee);
  assert.equal(moveTo(s, PLACE_BY_ID.wburgLoft), null);
  assert.equal(s.home.weeklyRent, 0);
});
