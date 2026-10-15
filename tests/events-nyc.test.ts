// Every event's every choice runs and returns something sensible; weird
// events are registered; the director serves a weird one most days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { applyOutcome, buildContext, directorPick, EVENTS } from '../src/sim/events.ts';
import { WEIRD_EVENTS } from '../src/sim/events-nyc.ts';
import { repOf } from '../src/sim/rep.ts';

const life = () => newLife({ name: 'T', birthYear: 1995, origin: 'hustler', spawnClass: 'middle', look: {} as never, traits: [] } as never);

test('weird NYC events are registered and well formed', () => {
  assert.ok(WEIRD_EVENTS.length >= 20);
  const ids = new Set(EVENTS.map((e) => e.id));
  assert.equal(ids.size, EVENTS.length, 'unique ids');
  for (const e of WEIRD_EVENTS) {
    assert.ok(ids.has(e.id), e.id);
    assert.ok(e.weird, e.id);
    assert.ok(e.choices.length >= 2, `${e.id} has choices`);
  }
});

test('every choice of every event runs, many times, with sane outcomes', () => {
  for (const where of ['street', 'plaza', 'park', 'subway', 'food', 'cafe', 'nightlife'] as const) {
    for (const e of EVENTS) {
      for (let k = 0; k < 6; k++) {
        const s = life();
        s.money = 50_000;
        const c = buildContext(s, where);
        void e.weight(c);
        const text = e.text(c);
        assert.ok(text.length > 10, e.id);
        for (const ch of e.choices) {
          if (ch.show && !ch.show(c)) continue;
          const o = ch.run(c);
          assert.ok(o.text && ['good', 'bad', 'info'].includes(o.tone), `${e.id}/${ch.label}`);
          if (o.fight) assert.ok(o.fight.power >= 1 && o.fight.power <= 10 && o.fight.foe, `${e.id} fight`);
          if (o.chase) assert.ok(o.chase.heat >= 1 && o.chase.heat <= 5 && o.chase.hours > 0, `${e.id} chase`);
          const s2 = life();
          s2.money = 50_000;
          const out = applyOutcome(s2, o);
          assert.ok(out.length > 0);
          assert.ok(s2.money >= 0 && repOf(s2).street >= 0, `${e.id} keeps money/rep valid`);
        }
      }
    }
  }
});

test('rep in outcomes moves both ways and shows in the text', () => {
  const s = life();
  s.rep = { street: 10, corporate: 0 };
  const t = applyOutcome(s, { text: 'x', tone: 'bad', rep: { street: -3 } });
  assert.equal(repOf(s).street, 7);
  assert.match(t, /−3 street rep/);
});

test('out on the street with no weird moment yet today, one is very likely', () => {
  let weird = 0;
  for (let i = 0; i < 200; i++) {
    const s = life();
    s.events.lastFiredAt = 0; // a while since the last event
    const ev = directorPick(s, 'street');
    if (ev?.weird) weird++;
  }
  assert.ok(weird > 110, `${weird}/200 first picks were weird`);
});
