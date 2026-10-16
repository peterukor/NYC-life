import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beatLine, dateLines, lend, maybeRepay, pickBeat, refuse, ROOMMATE_LIFE, type BeatKind } from '../src/sim/roommate-life.ts';
import { newLife } from '../src/sim/state.ts';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

test('nobody busy and nobody away: a home beat', () => {
  const b = pickBeat([{ name: 'Danny', away: false, busy: false }], seq(0.5, 0.1));
  assert.ok(b && b.name === 'Danny' && b.kind !== 'return' && b.kind !== 'date');
});

test('someone away usually comes home, sometimes with a date', () => {
  const back = pickBeat([{ name: 'Danny', away: true, busy: false }, { name: 'Keisha', away: false, busy: false }], seq(0.1, 0, 0.9));
  assert.equal(back?.kind, 'return');
  const date = pickBeat([{ name: 'Danny', away: true, busy: false }], seq(0.1, 0, 0.1, 0));
  assert.equal(date?.kind, 'date');
  assert.ok(date?.guest);
});

test('busy roommates are left alone', () => {
  assert.equal(pickBeat([{ name: 'Danny', away: false, busy: true }]), null);
});

test('every beat has words', () => {
  for (const kind of ['leave', 'return', 'date', 'leftovers', 'borrow', 'party', 'cook'] as BeatKind[]) {
    const l = beatLine({ kind, name: 'Keisha', guest: 'Bree' });
    assert.ok(l.includes('Keisha') && !l.includes('undefined'), kind);
  }
  const lines = dateLines('Danny');
  assert.equal(lines.length, 3);
  assert.equal(new Set(lines).size, 3);
  assert.ok(lines.every((x) => !x.includes('{n}')));
});

test('lend $20, get paid back with interest', () => {
  const s = newLife({ name: 'Jack', birthYear: 1995, origin: 'hustler', spawnClass: 'rich', look: {} as never, traits: [] } as never);
  s.money = 10_000;
  lend(s, 'Danny');
  assert.equal(s.money, 10_000 - ROOMMATE_LIFE.borrow);
  assert.equal(maybeRepay(s, 'Keisha', () => 0), null);
  assert.ok(maybeRepay(s, 'Danny', () => 0));
  assert.equal(s.money, 10_000 - ROOMMATE_LIFE.borrow + ROOMMATE_LIFE.payBack);
  assert.equal(maybeRepay(s, 'Danny', () => 0), null, 'paid once');
  refuse(s, 'Danny');
});
