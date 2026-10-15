// Moving house: costs the movers + first week, needs proof of rent, sets the new home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { homesForRent, listingName, moveBlocker, moveCost, moveTo, MOVING } from '../src/sim/moving.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';

const life = (cls: 'poor' | 'middle' | 'rich' | 'billionaire') => newLife({ name: 'T', birthYear: 1995, origin: 'hustler', spawnClass: cls, look: {} as never, traits: [] } as never);

test('homes for rent: open areas only, cheapest first, listing names drop "Your"', () => {
  const homes = homesForRent();
  assert.ok(homes.length >= 4);
  for (let i = 1; i < homes.length; i++) assert.ok((homes[i].rent ?? 0) >= (homes[i - 1].rent ?? 0));
  const s = life('middle');
  const ues = PLACE_BY_ID.uesApt;
  assert.ok(!/^Your/.test(listingName(s, ues)), listingName(s, ues));
  assert.match(listingName(s, PLACE_BY_ID[s.home.placeId]), /^Your/);
});

test('moving charges movers + first week, exactly, and changes your home', () => {
  const s = life('rich');
  const loft = PLACE_BY_ID.wburgLoft;
  const before = s.money + s.bank;
  assert.equal(moveTo(s, loft), null);
  assert.equal(before - (s.money + s.bank), MOVING.fee + (loft.rent ?? 0));
  assert.equal(s.home.placeId, 'wburgLoft');
  assert.equal(s.home.weeklyRent, loft.rent);
});

test('you need to afford it, and show a few weeks of rent', () => {
  const s = life('poor');
  assert.match(moveBlocker(s, PLACE_BY_ID.penthouse)!, /can’t cover|weeks of rent/);
  assert.equal(moveTo(s, PLACE_BY_ID.penthouse) !== null, true);
  assert.equal(s.home.placeId, 'sharedApt');
  // Enough for the first week but not the proof: refused.
  s.money = moveCost(PLACE_BY_ID.uesApt);
  s.bank = 0;
  assert.match(moveBlocker(s, PLACE_BY_ID.uesApt)!, /weeks of rent/);
  // The free shelter only needs the movers.
  s.money = MOVING.fee;
  assert.equal(moveTo(s, PLACE_BY_ID.shelter), null);
  assert.equal(s.money, 0);
  assert.equal(moveBlocker(s, PLACE_BY_ID.shelter), 'You already live here.');
});
