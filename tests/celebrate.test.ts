import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { BOTTLES, tradeWinShow } from '../src/data/bottles.ts';
import { buyBottle, goHomeWith } from '../src/sim/celebrate.ts';

const life = () => newLife({ name: 'T', origin: 'hustler', spawnClass: 'billionaire', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });

test("Peter's 7 bottles: $700 to $100k, and the show grows with the price", () => {
  assert.equal(BOTTLES.length, 7);
  assert.equal(BOTTLES[0].price, 70_000);
  assert.equal(BOTTLES[6].price, 10_000_000);
  assert.equal(BOTTLES[0].spotlight, 0);
  assert.equal(BOTTLES[1].spotlight, 0);
  assert.ok(BOTTLES[2].spotlight > 0, 'the 3rd bottle brings the spotlight');
  for (let i = 1; i < 7; i++) {
    const a = BOTTLES[i - 1], b = BOTTLES[i];
    assert.ok(b.price > a.price && b.fireworks.size > a.fireworks.size && b.fireworks.seconds > a.fireworks.seconds && b.admirers >= a.admirers);
    if (i >= 3) assert.ok(b.spotlight > a.spotlight);
  }
  assert.deepEqual(BOTTLES.map((b) => b.admirers), [2, 2, 3, 4, 5, 6, 7]);
  assert.ok(BOTTLES[0].fireworks.size >= 1.4, 'even the smallest burst is a proper one');
});

test('buying a bottle: cash then bank; can’t go below zero', () => {
  const s = life();
  s.money = 50_000;
  const bank = s.bank;
  assert.ok(buyBottle(s, 'mowet').ok);
  assert.equal(s.money, 0);
  assert.equal(s.bank, bank - 20_000);
  s.bank = 0;
  assert.equal(buyBottle(s, 'goliath').ok, false);
});

test('trade wins: 10× → 2 people … 100× → 7; under 10× no show', () => {
  assert.equal(tradeWinShow(9.9), null);
  assert.equal(tradeWinShow(10)!.show.admirers, 2);
  assert.equal(tradeWinShow(30)!.show.admirers, 3);
  assert.equal(tradeWinShow(55)!.show.admirers, 4);
  assert.equal(tradeWinShow(80)!.show.admirers, 5);
  assert.equal(tradeWinShow(250)!.show.admirers, 7);
});

test('going home with someone: a good night; a partner hears about it', () => {
  const s = life();
  assert.equal(goHomeWith(s, 'Jade').jealous, null);
  s.people = { p1: { level: 5, grudge: 0, likes: 10 } } as never;
  assert.equal(goHomeWith(s, 'Jade').jealous, 'p1');
  assert.ok(s.moodlets.some((m) => m.id === 'guilty'));
});
