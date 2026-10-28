// Clubs: the door by rep/cool/promoter, bribes, cover, mingling (richer
// people at bigger clubs), top spenders, and each connection's perk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { CLUB_BY_PLACE, CLUBS, CONNECTIONS } from '../src/data/clubs.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';
import { addClubSpend, doorCheck, mingle, payCover, topSpenders, tryBribe } from '../src/sim/clubs.ts';
import { BOTTLES } from '../src/data/bottles.ts';
import { bottlePrice, buyBottle } from '../src/sim/celebrate.ts';
import { coolScore } from '../src/sim/garage.ts';
import { moveCost } from '../src/sim/moving.ts';
import { skillGainMultiplier } from '../src/sim/state.ts';
import { WORKPLACE_LAYOUT_FOR, WORKPLACE_LAYOUTS as VENUE_LAYOUTS } from '../src/data/venues.ts';

const life = () => newLife({ name: 'Jack', birthYear: 1995, origin: 'hustler', spawnClass: 'middle', look: {} as never, traits: [] } as never);

test('five clubs: a three-step ladder and two 24/7 clubs, each a real place with its own room', () => {
  assert.deepEqual(CLUBS.filter((c) => !c.allDay).map((c) => c.tier), [1, 2, 4]);
  assert.equal(CLUBS.filter((c) => c.allDay).length, 2);
  // Spread over the boroughs, every club its own room.
  assert.ok(new Set(CLUBS.map((c) => PLACE_BY_ID[c.placeId].area)).size >= 4);
  assert.equal(new Set(CLUBS.map((c) => WORKPLACE_LAYOUT_FOR[c.placeId])).size, CLUBS.length);
  for (const c of CLUBS) {
    const p = PLACE_BY_ID[c.placeId];
    assert.ok(p && p.interior === 'club' && p.actions.includes('mingle'), c.placeId);
    const layout = VENUE_LAYOUTS[WORKPLACE_LAYOUT_FOR[c.placeId]];
    assert.ok(layout, `${c.placeId} has a room`);
  }
  // Bigger clubs: bigger rooms, more people, bigger shows, more rep, more drops.
  const ladder = CLUBS.filter((c) => !c.allDay);
  for (let i = 1; i < ladder.length; i++) {
    const a = ladder[i - 1], b = ladder[i];
    const la = VENUE_LAYOUTS[WORKPLACE_LAYOUT_FOR[a.placeId]], lb = VENUE_LAYOUTS[WORKPLACE_LAYOUT_FOR[b.placeId]];
    assert.ok(lb.width * lb.depth > la.width * la.depth && (lb.life?.visitors ?? 0) > (la.life?.visitors ?? 0), `${b.placeId} bigger`);
    assert.ok(b.show > a.show && b.rep > a.rep && b.dropEvery < a.dropEvery && b.connectChance > a.connectChance && b.cover > a.cover);
  }
});

test('the door: rep or cool gets you in; the basement lets everyone in', () => {
  const s = life();
  assert.equal(doorCheck(s, CLUB_BY_PLACE.basement212).ok, true);
  const v = doorCheck(s, CLUB_BY_PLACE.velvetRoom);
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.bribe && /Seen Around/.test(v.why));
  s.rep = { street: 60, corporate: 0 }; // Seen Around
  assert.equal(doorCheck(s, CLUB_BY_PLACE.velvetRoom).ok, true);
  // The 24/7 clubs let everyone in.
  assert.equal(doorCheck(life(), CLUB_BY_PLACE.skyeRooftop).ok, true);
  assert.equal(doorCheck(life(), CLUB_BY_PLACE.warehouseRave).ok, true);
  // The promoter gets you one level past your rep, but not into members-only.
  const fresh = life();
  fresh.connections = ['promoter'];
  assert.deepEqual(doorCheck(fresh, CLUB_BY_PLACE.velvetRoom), { ok: true, how: 'promoter' });
  s.connections = ['promoter'];
  const a = doorCheck(s, CLUB_BY_PLACE.aurumClub);
  assert.ok(!a.ok && a.bribe === null, 'no bribing members-only');
  s.rep.street = 1_000; // Club Royalty
  assert.equal(doorCheck(s, CLUB_BY_PLACE.aurumClub).ok, true);
});

test('bribes cost money and can fail; cover is charged', () => {
  const s = life();
  s.money = 100_000;
  const c = CLUB_BY_PLACE.velvetRoom;
  const r1 = tryBribe(s, c, () => 0);
  assert.equal(r1.ok, true);
  assert.equal(s.money, 100_000 - c.cover * 6);
  const r2 = tryBribe(s, c, () => 0.99);
  assert.equal(r2.ok, false);
  const before = s.money;
  assert.equal(payCover(s, c), true);
  assert.equal(before - s.money, c.cover);
  s.money = 0;
  assert.equal(payCover(s, c), false);
});

test('mingling meets people you can meet at that tier, once each', () => {
  const s = life();
  const basement = CLUB_BY_PLACE.basement212;
  const r = mingle(s, basement, () => 0);
  assert.equal(r.met?.id, 'promoter', 'only the promoter hangs out in the basement');
  assert.equal(mingle(s, basement, () => 0).met, null, 'met already');
  const top = CLUB_BY_PLACE.aurumClub;
  const r2 = mingle(s, top, () => 0);
  assert.equal(r2.met?.minTier, 4, 'the richest person you can meet');
  for (let i = 0; i < 20; i++) mingle(s, top, () => 0);
  assert.equal(new Set(s.connections).size, CONNECTIONS.length);
});

test('top spenders: the regulars plus you once you spend, biggest first', () => {
  const s = life();
  const c = CLUB_BY_PLACE.velvetRoom;
  const b0 = topSpenders(s, c, '2026-10-15');
  assert.ok(!b0.some((r) => r.you));
  addClubSpend(s, c.placeId, 50_000_000);
  const b1 = topSpenders(s, c);
  assert.equal(b1[0].you, true);
  assert.equal(b1[0].name, 'Jack');
  for (let i = 1; i < b1.length; i++) assert.ok(b1[i - 1].spent >= b1[i].spent);
});

test('bottles: more street rep at bigger clubs, and the heir’s discount', () => {
  const s = life();
  s.money = 10_000_000;
  s.location.placeId = 'basement212';
  const a = buyBottle(s, BOTTLES[0].id);
  s.location.placeId = 'aurumClub';
  const b = buyBottle(s, BOTTLES[0].id);
  assert.ok(a.ok && b.ok && b.street > a.street);
  const p0 = bottlePrice(s, BOTTLES[3]);
  s.connections = ['heir'];
  assert.equal(bottlePrice(s, BOTTLES[3]), Math.round((p0 * 0.9) / 100) * 100);
});

test('connection perks: stylist cool, realtor movers, producer music', () => {
  const s = life();
  const cool0 = coolScore(s).total;
  const move0 = moveCost(PLACE_BY_ID.uesApt, s);
  const mus0 = skillGainMultiplier(s, 'music');
  s.connections = ['stylist', 'realtor', 'producer'];
  assert.equal(coolScore(s).total, cool0 + 10);
  assert.equal(moveCost(PLACE_BY_ID.uesApt, s), move0 - 15_000);
  assert.equal(skillGainMultiplier(s, 'music'), mus0 * 1.25);
});
