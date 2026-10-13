import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { beginActivity, completeActivity, scaledNeeds, stopActivity, tickActivity } from '../src/sim/home-activity.ts';
import { ACTIONS } from '../src/data/actions.ts';
import { FURNITURE_QUALITY } from '../src/data/furniture.ts';
const CHEAP = FURNITURE_QUALITY.cheap.gain;

const life = () => {
  const s = newLife({ name: 'T', origin: 'hustler', spawnClass: 'poor', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
  for (const k of Object.keys(s.needs) as (keyof typeof s.needs)[]) s.needs[k] = 20;
  return s;
};

test('cheap furniture gives back less than nice furniture; costs are not scaled', () => {
  const s = life();
  const sleep = ACTIONS.sleep;
  const cheap = scaledNeeds(s, sleep, 'twinBed');
  const nice = scaledNeeds(s, sleep, 'bedDouble');
  assert.ok(cheap.energy! < sleep.needs!.energy! && nice.energy! > sleep.needs!.energy!);
  assert.equal(cheap.hunger, sleep.needs!.hunger);
});

test('needs fill in as you go; stopping halfway keeps about half', () => {
  const s = life();
  const r = beginActivity(s, 'sleep', { item: 'bedSingle', uid: 'bed', placeId: 'x' });
  assert.ok(r.ok);
  const t0 = s.activity!.startedAt;
  tickActivity(s, t0 + s.activity!.seconds * 500);
  const mid = s.needs.energy;
  assert.ok(Math.abs(mid - (20 + 35)) < 0.5, `half the energy: ${mid}`);
  // Stop now (ticks to "now", which is ~0s after start in this test, so nothing more).
  s.activity!.startedAt = t0 - s.activity!.seconds * 500; // pretend half the time passed
  stopActivity(s);
  assert.equal(s.activity, null);
  assert.ok(Math.abs(s.needs.energy - 55) < 1);
});

test('finishing gives the rest, plus a cheap piece’s downside when it rolls', () => {
  const s = life();
  beginActivity(s, 'sleep', { item: 'twinBed' });
  const res = completeActivity(s, () => 0)!;
  assert.ok(Math.abs(s.needs.energy - Math.min(100, 20 + 70 * CHEAP)) < 0.5);
  assert.equal(res.quirk?.label.includes('stiff'), true);
  assert.ok(s.moodlets.some((m) => m.id === 'stiffBack'));
  assert.equal(s.activity, null);
});

test('an activity saved mid-way resumes from where it was (no double counting)', () => {
  const s = life();
  beginActivity(s, 'shower', { item: 'tubShower' });
  const act = s.activity!;
  tickActivity(s, act.startedAt + act.seconds * 300);
  const saved = JSON.parse(JSON.stringify(s));
  tickActivity(saved, act.startedAt + act.seconds * 1000);
  assert.ok(Math.abs(saved.needs.hygiene - Math.min(100, 20 + 75 * CHEAP)) < 0.5);
});

test('cheap pieces are slower, nice ones quicker; cooking burns less as you get better', async () => {
  const { activitySeconds } = await import('../src/sim/home-activity.ts');
  const sleep = ACTIONS.sleep;
  assert.ok(activitySeconds(sleep, 'twinBed') > activitySeconds(sleep, 'bedSingle'));
  assert.ok(activitySeconds(sleep, 'bedDouble') < activitySeconds(sleep, 'bedSingle'));
  const s = life();
  // A fixed sequence of rolls so the test never flakes.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let burns = 0;
  for (let i = 0; i < 400; i++) {
    beginActivity(s, 'cookPasta', { item: 'oldStove' });
    if (completeActivity(s, rand)?.quirk?.id === 'smokeAlarm') burns++;
    s.money = 1_000_000;
  }
  s.skills.cooking = 5;
  let pro = 0;
  for (let i = 0; i < 400; i++) {
    beginActivity(s, 'cookPasta', { item: 'oldStove' });
    if (completeActivity(s, rand)?.quirk?.id === 'smokeAlarm') pro++;
  }
  assert.ok(burns > pro, `beginner burns ${burns}, good cook ${pro}`);
});
