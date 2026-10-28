// Game leaderboards (net/scores.ts): the offline board — you against the regulars.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { recordScore } from '../src/sim/arcade.ts';
import { localBoard } from '../src/net/scores.ts';

const life = () => newLife({ name: 'Jack', birthYear: 1995, origin: 'hustler', spawnClass: 'middle', look: {} as never, traits: [] } as never);

test('offline board: regulars, sorted, steady for the week, you in it once you play', () => {
  const s = life();
  const a = localBoard(s, 'snake', Date.UTC(2026, 9, 27));
  assert.equal(a.online, false);
  assert.equal(a.you, null);
  assert.ok(a.rows.length >= 9);
  for (let i = 1; i < a.rows.length; i++) assert.ok(a.rows[i - 1].score >= a.rows[i].score);
  assert.deepEqual(localBoard(s, 'snake', Date.UTC(2026, 9, 28)).rows, a.rows, 'same week, same regulars');
  recordScore(s, 'snake', 99_999);
  const b = localBoard(s, 'snake', Date.UTC(2026, 9, 27));
  assert.deepEqual(b.you, { place: 1, score: 99_999 });
  assert.equal(b.rows[0].you, true);
});
