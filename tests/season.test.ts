// 🏆 Seasons, ✅ daily challenges, 🔥 streak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { addPoints, board, checkStreak, CHALLENGES, daily, progress, rivals, rollSeason, SEASON, seasonEnds, seasonId, seasonOf } from '../src/sim/season.ts';

const life = () => newLife({ name: 'Jack', birthYear: 1995, origin: 'hustler', spawnClass: 'middle', look: {} as never, traits: [] } as never);

test('points add up and put you on the board', () => {
  const s = life();
  addPoints(s, 'fights', 20);
  addPoints(s, 'fish', 7);
  assert.equal(seasonOf(s).points, 27);
  assert.deepEqual(seasonOf(s).from, { fights: 20, fish: 7 });
  const b = board(s);
  assert.equal(b.length, 11);
  assert.ok(b.some((r) => r.you && r.points === 27));
  for (let i = 1; i < b.length; i++) assert.ok(b[i - 1].points >= b[i].points);
});

test('rivals climb through the season; a season is 3 days', () => {
  const id = seasonId();
  const start = SEASON.epoch + id * SEASON.days * 86_400_000;
  const early = rivals(id, start + 1).reduce((a, r) => a + r.points, 0);
  const late = rivals(id, seasonEnds(id) - 1).reduce((a, r) => a + r.points, 0);
  assert.ok(late > early * 3);
  assert.equal(seasonEnds(id) - start, 3 * 86_400_000);
});

test('season end pays your place once, then starts fresh', () => {
  const s = life();
  const st = seasonOf(s);
  st.id = seasonId() - 1;
  st.points = 99_999; // a monster season: 1st
  const m0 = s.money;
  const line = rollSeason(s);
  assert.match(line!, /1st/);
  assert.equal(s.money - m0, SEASON.prizes[0]);
  assert.equal(seasonOf(s).points, 0);
  assert.equal(rollSeason(s), null, 'paid once');
});

test('daily challenges: three a day, progress, cash, bonus for all three', () => {
  assert.deepEqual(daily(life(), '2026-10-15').picks, daily(life(), '2026-10-15').picks, 'everyone gets the same three');
  const s = life();
  const d = daily(s); // today's
  assert.equal(d.picks.length, 3);
  const m0 = s.money;
  let lines: string[] = [];
  for (const id of d.picks) {
    const c = CHALLENGES.find((x) => x.id === id)!;
    for (let i = 0; i < c.need; i++) lines = lines.concat(id === 'places' ? progress(s, id, 1, `p${i}`) : progress(s, id));
  }
  assert.equal(d.done.length, 3);
  assert.ok(d.bonus);
  assert.ok(lines.some((l) => /All three/.test(l)));
  const cash = d.picks.reduce((t, id) => t + CHALLENGES.find((x) => x.id === id)!.cash, 0) + 50_000;
  assert.equal(s.money - m0, cash);
  // Not picked today: nothing.
  const other = CHALLENGES.find((c) => !d.picks.includes(c.id))!;
  assert.deepEqual(progress(s, other.id), []);
});

test('visiting the same place twice only counts once', () => {
  const s = life();
  const d = daily(s);
  d.picks = ['places', 'fish', 'art'];
  progress(s, 'places', 1, 'a');
  progress(s, 'places', 1, 'a');
  assert.equal(d.progress.places, 1);
});

test('streak: consecutive real days grow the gift (max 7)', () => {
  const s = life();
  const m0 = s.money;
  assert.match(checkStreak(s, '2026-10-10')!, /Welcome/);
  assert.equal(checkStreak(s, '2026-10-10'), null, 'once a day');
  assert.match(checkStreak(s, '2026-10-11')!, /2-day/);
  assert.equal(s.streak!.days, 2);
  checkStreak(s, '2026-10-13'); // missed a day
  assert.equal(s.streak!.days, 1);
  assert.equal(s.money - m0, 5_000 + 10_000 + 5_000);
});
