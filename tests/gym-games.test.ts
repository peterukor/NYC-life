// Gym mini-games: the list, fitness by quality, tired legs after four
// sessions a day, personal bests, and the seeded plans the games use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import {
  BENCH_REPS, GYM_BY_ID, GYM_GAMES, bagCombo, bagRingTime, benchJudge, benchQuality, benchZone, finishGymGame, fmtSplit, gymBest, gymFatigue,
  gymSessionsToday, judgeOffset, ropeClears, ropePeriod, rowPeriod, seeded, segAt, spinPlan, spinTarget, split500, stars, treadmillPlan, yogaWobble,
} from '../src/sim/gym-games.ts';

const life = () => newLife({ name: 'T', birthYear: 1995, origin: 'trustFund', spawnClass: 'rich', look: {} as never, traits: [] } as never);
const DAY = Date.UTC(2026, 9, 28, 16); // midday in New York
const HOUR = 3_600_000;

test('metadata: the seven ids, each with an emoji, how-to, 30–60 s and a colour', () => {
  assert.deepEqual(GYM_GAMES.map((g) => g.id), ['bench', 'treadmill', 'bag', 'rope', 'spin', 'row', 'yoga']);
  for (const g of GYM_GAMES) {
    assert.equal(GYM_BY_ID[g.id], g);
    assert.ok(g.emoji && g.name && g.howTo.length > 20, g.id);
    assert.ok(g.seconds >= 30 && g.seconds <= 60, g.id);
    assert.match(g.color, /^#[0-9a-f]{6}$/i);
  }
  assert.equal(new Set(GYM_GAMES.map((g) => g.emoji)).size, 7, 'one emoji per game');
});

test('fitness gain scales with quality: a great run ≈ 1.2–1.5, a poor one small but above zero', () => {
  const gains = [0, 0.3, 0.6, 1].map((q) => finishGymGame(life(), 'bench', 100, q, DAY).gain);
  for (let i = 1; i < gains.length; i++) assert.ok(gains[i] > gains[i - 1]);
  assert.ok(gains[0] > 0 && gains[0] < 0.3, `poor ${gains[0]}`);
  assert.ok(gains[3] >= 1.2 && gains[3] <= 1.5, `great ${gains[3]}`);
  const s = life();
  const before = s.skills.fitness;
  const r = finishGymGame(s, 'row', 100, 1, DAY);
  assert.ok(Math.abs(s.skills.fitness - before - r.gain) < 1e-9);
  // Gym rats learn faster.
  const rat = life();
  rat.profile.traits = ['gymRat'];
  assert.ok(finishGymGame(rat, 'row', 1, 1, DAY).gain > r.gain);
  // Nonsense quality is clamped.
  assert.ok(finishGymGame(life(), 'row', 1, Number.NaN, DAY).gain > 0);
});

test('needs: energy and hygiene drop, fun goes up; a strong session gives the 💪 pump', () => {
  const s = life();
  s.needs.fun = 50;
  const e0 = s.needs.energy, h0 = s.needs.hygiene;
  const r = finishGymGame(s, 'spin', 300, 0.9, DAY);
  assert.ok(s.needs.energy < e0 && s.needs.hygiene < h0 && s.needs.fun > 50);
  assert.equal(r.pump, true);
  assert.ok(s.moodlets.some((m) => m.id === 'pump' && m.emoji === '💪'));
  const weak = life();
  assert.equal(finishGymGame(weak, 'spin', 10, 0.3, DAY).pump, false);
  assert.equal(weak.moodlets.length, 0);
});

test('diminishing returns after four sessions in one day, fresh again the next day', () => {
  const s = life();
  const g = [];
  for (let i = 0; i < 7; i++) g.push(finishGymGame(s, 'bag', 100, 1, DAY + i * 60_000));
  assert.equal(gymSessionsToday(s, DAY), 7);
  for (let i = 1; i < 4; i++) assert.ok(Math.abs(g[i].gain - g[0].gain) < 1e-9, 'first four are full');
  assert.ok(g.slice(0, 4).every((r) => !r.tired));
  assert.ok(g[4].tired && g[4].gain < g[3].gain && g[5].gain < g[4].gain && g[6].gain < g[5].gain);
  assert.ok(g[6].gain > 0);
  assert.equal(g[5].pump, false, 'no pump once cooked');
  assert.equal(gymFatigue(3), 1);
  assert.ok(gymFatigue(4) < 1 && gymFatigue(50) >= 0.1);
  const next = finishGymGame(s, 'bag', 100, 1, DAY + 24 * HOUR);
  assert.equal(next.tired, false);
  assert.equal(gymSessionsToday(s, DAY + 24 * HOUR), 1);
});

test('fitness never passes 10', () => {
  const s = life();
  s.skills.fitness = 9.9;
  finishGymGame(s, 'yoga', 1, 1, DAY);
  assert.equal(s.skills.fitness, 10);
  assert.equal(finishGymGame(s, 'yoga', 1, 1, DAY).gain, 0);
});

test('personal bests per game id', () => {
  const s = life();
  assert.equal(gymBest(s, 'rope'), 0);
  assert.equal(finishGymGame(s, 'rope', 120, 0.5, DAY).best, true);
  assert.equal(finishGymGame(s, 'rope', 80, 0.5, DAY).best, false);
  assert.equal(finishGymGame(s, 'rope', 120, 0.5, DAY).best, false, 'a tie is not a new best');
  assert.equal(finishGymGame(s, 'rope', 121.4, 0.5, DAY).best, true);
  assert.equal(gymBest(s, 'rope'), 121);
  assert.equal(gymBest(s, 'row'), 0);
  // Old saves without the field load fine (and survive JSON).
  const old = JSON.parse(JSON.stringify(life()));
  delete old.gym;
  assert.equal(gymBest(old, 'bench'), 0);
  finishGymGame(old, 'bench', 5, 0.2, DAY);
  assert.equal(JSON.parse(JSON.stringify(old)).gym.best.bench, 5);
});

test('stars', () => {
  assert.deepEqual([0, 0.3, 0.6, 0.85, 1].map(stars), [0, 1, 2, 3, 3]);
});

test('bench: the green shrinks with each rep and grows with fitness; centre taps are perfect', () => {
  for (let r = 1; r < BENCH_REPS; r++) assert.ok(benchZone(r, 0) < benchZone(r - 1, 0));
  assert.ok(benchZone(4, 8) > benchZone(4, 0));
  assert.ok(benchZone(99, 0) >= 0.1);
  assert.equal(benchJudge(0.5, 0.4, 0.2), 'perfect');
  assert.equal(benchJudge(0.42, 0.4, 0.2), 'clean');
  assert.equal(benchJudge(0.39, 0.4, 0.2), 'miss');
  assert.equal(benchQuality(BENCH_REPS, BENCH_REPS), 1);
  assert.ok(benchQuality(8, 0) > benchQuality(6, 3));
});

test('treadmill plan: covers the round with no gaps, starts with a jog, never repeats a kind', () => {
  for (let seed = 1; seed < 40; seed++) {
    const plan = treadmillPlan(seeded(seed), 40);
    assert.equal(plan[0].kind, 'jog');
    assert.equal(plan[0].from, 0);
    assert.equal(plan[plan.length - 1].to, 40);
    for (let i = 1; i < plan.length; i++) {
      assert.equal(plan[i].from, plan[i - 1].to);
      assert.notEqual(plan[i].kind, plan[i - 1].kind);
    }
    assert.ok(plan.some((p) => p.kind === 'sprint') || plan.some((p) => p.kind === 'hill'));
    for (const p of plan) assert.ok(p.lo < p.hi);
  }
  assert.deepEqual(treadmillPlan(seeded(7)), treadmillPlan(seeded(7)), 'seeded = repeatable');
  const plan = treadmillPlan(seeded(3));
  assert.equal(segAt(plan, 0), plan[0]);
  assert.equal(segAt(plan, 999), plan[plan.length - 1]);
});

test('bag: combos grow with level (2–5 punches) and the ring tightens', () => {
  const rand = seeded(11);
  for (let lvl = 0; lvl < 12; lvl++) {
    const c = bagCombo(rand, lvl);
    assert.ok(c.length >= 2 && c.length <= 5);
    assert.ok(c.every((p) => ['jab', 'cross', 'hook', 'upper'].includes(p)));
  }
  assert.equal(bagCombo(seeded(1), 0).length <= bagCombo(seeded(1), 8).length, true);
  assert.ok(bagRingTime(10) < bagRingTime(0) && bagRingTime(99) >= 0.5);
  assert.equal(judgeOffset(0.05), 'perfect');
  assert.equal(judgeOffset(-0.15), 'good');
  assert.equal(judgeOffset(0.4), 'miss');
});

test('rope speeds up; feet clear only mid-jump', () => {
  assert.ok(ropePeriod(40) < ropePeriod(0) && ropePeriod(999) >= 0.42);
  assert.equal(ropeClears(0.5), true);
  assert.equal(ropeClears(0.02), false);
  assert.equal(ropeClears(0.97), false);
});

test('spin plan: warm-up first, ends on a sprint, the target eases between segments', () => {
  for (let seed = 1; seed < 30; seed++) {
    const plan = spinPlan(seeded(seed), 45);
    assert.equal(plan[0].call, 'warm');
    assert.equal(plan[plan.length - 1].call, 'sprint');
    assert.equal(plan[plan.length - 1].to, 45);
    for (let i = 1; i < plan.length; i++) assert.equal(plan[i].from, plan[i - 1].to);
    const at = plan[1].from;
    const jump = Math.abs(spinTarget(plan, at + 0.01) - spinTarget(plan, at - 0.01));
    assert.ok(jump < 3, 'no step at a boundary');
    assert.ok(Math.abs(spinTarget(plan, plan[1].from + 2) - plan[1].rpm) < 1e-9);
  }
});

test('row: stroke rate climbs, split maths and formatting', () => {
  assert.ok(rowPeriod(30) < rowPeriod(0));
  assert.equal(rowPeriod(999), 2);
  assert.equal(split500(5), 100);
  assert.equal(split500(0), 0);
  assert.equal(fmtSplit(112.34), '1:52.3');
  assert.equal(fmtSplit(65), '1:05.0');
  assert.equal(fmtSplit(0), '-:--.-');
});

test('yoga wobble is smooth, bounded and seeded', () => {
  const a = yogaWobble(seeded(5)), b = yogaWobble(seeded(5));
  for (let t = 0; t < 36; t += 0.37) {
    const p = a(t);
    assert.deepEqual(p, b(t));
    assert.ok(Math.abs(p.x) <= 1.0001 && Math.abs(p.y) <= 1.0001);
    const q = a(t + 0.016);
    assert.ok(Math.abs(q.x - p.x) < 0.1 && Math.abs(q.y - p.y) < 0.1, 'smooth');
  }
});
