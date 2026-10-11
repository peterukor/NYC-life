// Tests for debt/bankruptcy, jail, cars and crews. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newLife } from '../src/sim/state.ts';
import { addDebt, bankruptcyBlocker, fileBankruptcy, runCollections } from '../src/sim/debt.ts';
import { arrest, inJail, postBail } from '../src/sim/jail.ts';
import { buyCar, driveTrip, GARAGE, licenceSuspended, sellCar, coolScore } from '../src/sim/garage.ts';
import { CREWS, crewOfBlock, joinBlocker, joinCrew, standing, turfAt } from '../src/sim/gangs.ts';
import { VEHICLES, carsForSale, RARITY_INFO } from '../src/data/vehicles.ts';
import { DISTRICTS, blockRect } from '../src/world/layout.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';

const fresh = () => newLife({ name: 'T', origin: 'hustler', spawnClass: 'middle', look: { body: 'f', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });

test('cars: 17 for sale — 8 common, 4 premium, 3 exclusive, 2 very rare', () => {
  const sale = carsForSale();
  assert.equal(sale.length, 17);
  const count = (r: string) => sale.filter((v) => v.rarity === r).length;
  assert.deepEqual([count('common'), count('premium'), count('exclusive'), count('veryRare')], [8, 4, 3, 2]);
  for (const v of VEHICLES.all()) assert.ok(RARITY_INFO[v.rarity], `${v.id} rarity`);
});

test('debt: collections, then bankruptcy sends you to the shelter', () => {
  const s = fresh();
  assert.ok(PLACE_BY_ID.shelter, 'shelter place exists');
  assert.ok(bankruptcyBlocker(s), 'no debt, no filing');
  s.money = 0;
  s.bank = 0;
  addDebt(s, 100_000);
  runCollections(s);
  assert.ok(s.debt!.owed > 100_000, 'interest when nothing to take');
  s.bank = 1_000_000;
  s.garage.cars.push({ uid: 'x', model: 'metroSedan', paint: '#fff' });
  assert.equal(fileBankruptcy(s), null);
  assert.equal(s.debt, null);
  assert.equal(s.bank, 0);
  assert.equal(s.garage.cars.length, 0);
  assert.equal(s.home.placeId, 'shelter');
  assert.ok(s.money > 0, 'walks out with a little cash');
  addDebt(s, 5_000);
  assert.ok(bankruptcyBlocker(s), 'cooldown stops a second filing');
});

test('jail: arrest, bail, repeat offenders get longer', () => {
  const s = fresh();
  arrest(s, 'test', 6, 10_000);
  assert.ok(inJail(s));
  const first = s.jail!.until;
  s.money = 5_000_000;
  assert.equal(postBail(s), null);
  assert.ok(!inJail(s));
  arrest(s, 'again', 6, 10_000);
  assert.ok(s.jail!.until - Date.now() > first - Date.now() - 5, 'second sentence is not shorter');
  assert.ok(s.jail!.bail > 10_000, 'bail grows for repeat offenders');
});

test('garage: buy, tickets suspend your licence, sell back', () => {
  const s = fresh();
  s.bank = 10_000_000;
  assert.equal(buyCar(s, 'taxi'), 'That car isn’t for sale.');
  assert.equal(buyCar(s, 'pipHatch'), null);
  assert.equal(s.garage.cars.length, 1);
  const before = coolScore(s).total;
  s.garage.driving = s.garage.cars[0].uid;
  assert.ok(coolScore(s).total >= before);
  const rnd = Math.random;
  Math.random = () => 0.01; // always ticketed (never crash: dry weather)
  for (let i = 0; i < 5 && !licenceSuspended(s); i++) driveTrip(s, true, 'sunny');
  Math.random = rnd;
  assert.ok(licenceSuspended(s), `suspended after enough points (limit ${GARAGE.suspendAt})`);
  const got = sellCar(s, s.garage.cars[0].uid);
  assert.ok(got > 0);
  assert.equal(s.garage.cars.length as number, 0);
});

test('crews: five crews, turf lookups, joining needs street rep', () => {
  assert.equal(CREWS.all().length, 5);
  const kings = CREWS.require('kings');
  const [c0, , r0] = kings.turf[0];
  const r = blockRect(DISTRICTS.manhattan, c0, r0);
  assert.equal(turfAt('manhattan', (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2)?.id, 'kings');
  assert.equal(crewOfBlock('manhattan', c0, r0)?.id, 'kings');
  const s = fresh();
  assert.ok(joinBlocker(s, 'kings'));
  s.paths.rep.crime = 100;
  assert.equal(joinCrew(s, 'kings'), null);
  assert.equal(standing(s, 'kings'), 'family');
  assert.equal(standing(s, 'dragons'), 'rival');
});
