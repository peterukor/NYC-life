// Batch 4: art likes and sales, fishing catches and the derby, the bike
// loop, the trading-floor perk, and phone games paying no tickets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { artQuality, artTick, likesNow, sellArt, submitArt } from '../src/sim/art.ts';
import { DERBY_PRIZES, derbyBoard, FISH, landFish, rollBite, settleDerby } from '../src/sim/fishing.ts';
import { field, finishRace, rentBike } from '../src/sim/cycling.ts';
import { tradeFee } from '../src/sim/market.ts';
import { recordScore } from '../src/sim/arcade.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';

const life = () => newLife({ name: 'Jack', birthYear: 1995, origin: 'hustler', spawnClass: 'middle', look: {} as never, traits: [] } as never);

test('the fun places exist, with their actions', () => {
  assert.deepEqual(PLACE_BY_ID.chessHouse.actions, ['playChess']);
  assert.ok(PLACE_BY_ID.artParlor.actions.includes('paintArt'));
  assert.ok(PLACE_BY_ID.pier84.actions.includes('goFishing'));
  assert.ok(PLACE_BY_ID.centralPark.actions.includes('bikeRace')); // the Bike Loop moved into the park (2026-10-30)
});

test('art: more effort = better; likes climb over hours; a collector offers; selling pays', () => {
  assert.ok(artQuality({ coverage: 0.6, colors: 6, strokes: 80 }) > artQuality({ coverage: 0.05, colors: 1, strokes: 3 }));
  const s = life();
  const a = submitArt(s, '  Pigeon at Dawn  ', 'data:x', { coverage: 0.7, colors: 7, strokes: 90 }, () => 0.9);
  assert.equal(a.title, 'Pigeon at Dawn');
  assert.equal(likesNow(a, a.at), 0);
  assert.ok(likesNow(a, a.at + 3 * 3_600_000) > likesNow(a, a.at + 3_600_000));
  assert.ok(likesNow(a, a.at + 48 * 3_600_000) >= a.target - 1);
  const lines = artTick(s, a.at + 48 * 3_600_000);
  assert.ok(lines.some((l) => /likes/.test(l)));
  assert.ok(a.offer && a.offer > 0, 'a collector made an offer');
  const before = s.money;
  assert.equal(sellArt(s, a.id), null);
  assert.equal(s.money - before, a.offer);
  assert.equal(sellArt(s, a.id), 'No offer on that one.');
});

test('fishing: bites come from the table; landing pays and counts for the derby', () => {
  for (let i = 0; i < 200; i++) {
    const { fish, lb } = rollBite();
    assert.ok(lb >= fish.lb[0] - 0.05 && lb <= fish.lb[1] + 0.05, fish.id);
  }
  const s = life();
  const bass = FISH.find((f) => f.id === 'bass')!;
  const m0 = s.money;
  const line = landFish(s, bass, 20);
  assert.ok(/Striped bass/.test(line) && s.money > m0);
  assert.equal(s.fishing!.caught, 1);
  assert.equal(s.fishing!.best!.lb, 20);
  // Seeded derby board, heaviest first.
  const b = derbyBoard(s, '2026-10-15');
  for (let i = 1; i < b.length; i++) assert.ok(b[i - 1].lb >= b[i].lb);
  // A finished derby you won pays the prize once.
  s.fishing!.derby = { day: '2000-01-01', lb: 999, paid: false };
  const before = s.money;
  const r = settleDerby(s);
  assert.ok(r && /1st/.test(r));
  assert.equal(s.money - before, DERBY_PRIZES[0]);
  assert.equal(settleDerby(s), null);
});

test('bike loop: rent, a seeded field, places and prizes', () => {
  const s = life();
  s.money = 1_000;
  assert.equal(rentBike(s), null);
  assert.equal(s.money, 500);
  const f = field('2026-10-15', 9);
  assert.equal(f.length, 3);
  assert.deepEqual(field('2026-10-15', 9), f, 'same hour, same field');
  const fastest = Math.min(...f.map((r) => r.time));
  const w = finishRace(s, fastest - 1, f);
  assert.equal(w.place, 0);
  assert.equal(s.bike!.wins, 1);
  const crash = finishRace(s, Infinity, f);
  assert.equal(crash.place, 3);
});

test('trading in person: no fee at the floor; phone pays the usual', () => {
  const s = life();
  const phone = tradeFee(100_000, s);
  assert.ok(phone > 0);
  s.location.placeId = 'midtownTower';
  assert.equal(tradeFee(100_000, s), 0);
});

test('phone games: high scores but no tickets; the arcade pays tickets', () => {
  const s = life();
  const p = recordScore(s, 'stack', 30, { phone: true });
  assert.equal(p.tickets, 0);
  assert.equal(p.best, true);
  const a = recordScore(s, 'stack', 31);
  assert.ok(a.tickets > 0);
});
