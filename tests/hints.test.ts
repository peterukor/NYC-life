import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HINTS, nextHint } from '../src/sim/hints.ts';
import { newLife } from '../src/sim/state.ts';

const life = () => newLife({ name: 'Jack', birthYear: 1995, origin: 'hustler', spawnClass: 'rich', look: {} as never, traits: [] } as never);
const home = { where: 'home', placeId: 'harlemWalkup', hour: 12 };

test('tips: one at a time, each once', () => {
  const s = life();
  assert.equal(nextHint(s, home, 5), null, 'not straight away');
  const a = nextHint(s, home, 30);
  assert.ok(a);
  const b = nextHint(s, home, 30);
  assert.notEqual(a!.id, b?.id);
  assert.ok(s.hintsSeen!.includes(a!.id));
});

test('fewer: only the important ones; off: none', () => {
  const s = life();
  s.settings.hints = 'few';
  for (let i = 0; i < 30; i++) {
    const h = nextHint(s, { where: 'nightlife', hour: 23 }, 60);
    if (!h) break;
    assert.ok(h.key, h.id);
  }
  const t = life();
  t.settings.hints = 'off';
  assert.equal(nextHint(t, home, 60), null);
});

test('tip ids are unique', () => {
  assert.equal(new Set(HINTS.map((h) => h.id)).size, HINTS.length);
});
