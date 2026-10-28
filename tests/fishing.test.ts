// 🎣 Pier 84 fishing: what bites, the bite tells, every species' fight
// (landable by a sensible player, snaps if you just hold), the journal,
// selling, the morning derby, and old saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NycTime } from '../src/core/clock.ts';
import { Rng } from '../src/core/rng.ts';
import { newLife } from '../src/sim/state.ts';
import {
  BITE_WINDOW, DERBY_PRIZES, FISH, FISH_BY_ID, TENSION, biteOdds, bitePlan, castReach, derbyBoard, derbyPlace, fightPlan, fishingOf, inRun,
  journalCount, landCatch, landFish, newReel, perfectCast, perfectCatch, pullAt, reelStep, rollBite, runSoon, settleDerby, streakBonus,
  type FightPlan, type Reel,
} from '../src/sim/fishing.ts';

const life = () => newLife({ name: 'T', birthYear: 1995, origin: 'trustFund', spawnClass: 'rich', look: {} as never, traits: [] } as never);
const at = (hour: number, dateKey = '2026-10-28'): NycTime => ({ hour, minute: 0, weekday: 3, dateKey, hourFloat: hour });
const seq = (seed: string) => {
  const r = new Rng(seed);
  return () => r.next();
};

/** A sensible player: holds, lets go when the tension runs high or the line twangs. */
function play(plan: FightPlan, policy: 'smart' | 'hold' | 'never' | 'gauge', maxS = 120): Reel {
  const r = newReel();
  const dt = 1 / 60;
  let holding = true;
  while (!r.out && r.t < maxS) {
    if (policy === 'hold') holding = true;
    else if (policy === 'never') holding = false;
    else if (policy === 'smart') holding = !(inRun(plan, r.t + 0.2) || runSoon(plan, r.t, 0.25)) && r.tension < 0.85;
    else {
      // Watches the gauge only, with a human-ish reaction (~0.25 s late).
      if (holding && r.tension > 0.8) holding = false;
      else if (!holding && r.tension < 0.4) holding = true;
    }
    reelStep(r, plan, holding, dt);
  }
  return r;
}

test('the catalogue: unique ids, real Hudson fish, a few NYC jokes, legends go back', () => {
  assert.equal(new Set(FISH.map((f) => f.id)).size, FISH.length);
  for (const f of FISH) {
    assert.equal(FISH_BY_ID[f.id], f);
    assert.ok(f.lb[0] > 0 && f.lb[1] >= f.lb[0], f.id);
    assert.ok(f.fight >= 1 && f.fight <= 5, f.id);
    assert.ok(f.line.length > 5 && f.name && f.emoji, f.id);
    if (f.kind !== 'fish') assert.equal(f.perLb, 0, `${f.id} is not for sale`);
    else assert.ok(f.perLb > 0, f.id);
  }
  for (const id of ['bass', 'bluefish', 'fluke', 'porgy', 'blackSeaBass', 'eel', 'whitePerch']) assert.ok(FISH_BY_ID[id], id);
  const junk = FISH.filter((f) => f.kind === 'junk');
  assert.ok(junk.length >= 3 && junk.length <= 5);
  // Junk is rare: under 10% of bites at any reach.
  for (const reach of [0, 0.5, 1]) {
    const total = FISH.reduce((t, f) => t + biteOdds(f, reach), 0);
    const j = junk.reduce((t, f) => t + biteOdds(f, reach), 0);
    assert.ok(j / total < 0.1, `junk ${(j / total).toFixed(2)} at ${reach}`);
  }
});

test('rollBite: weights in range, and a long cast reaches bigger, rarer fish', () => {
  const rand = seq('bites');
  const stats = (reach: number) => {
    let big = 0, legend = 0;
    for (let i = 0; i < 4000; i++) {
      const { fish, lb } = rollBite(rand, reach);
      assert.ok(lb >= fish.lb[0] - 1e-9 && lb <= fish.lb[1] + 1e-9, `${fish.id} ${lb}`);
      if (fish.fight >= 3) big++;
      if (fish.kind === 'release') legend++;
    }
    return { big, legend };
  };
  const near = stats(0), far = stats(1);
  assert.ok(far.big > near.big * 1.6, `${far.big} vs ${near.big}`);
  assert.ok(far.legend > near.legend, `${far.legend} vs ${near.legend}`);
  // Still rare: a legend is under 5% even on a perfect cast.
  assert.ok(far.legend / 4000 < 0.05);
  // The old call shape still works.
  assert.ok(FISH_BY_ID[rollBite().fish.id]);
});

test('casting: the sweet spot is a perfect cast with full reach, over-cranking loses a little', () => {
  assert.equal(castReach(0.88), 1);
  assert.ok(perfectCast(0.88) && !perfectCast(0.5) && !perfectCast(1));
  assert.ok(castReach(1) < 1 && castReach(1) > 0.75);
  assert.ok(castReach(0.3) < castReach(0.6));
  assert.equal(castReach(-1), 0);
});

test('bitePlan: nibbles come first, then the bite, with room to react', () => {
  const rand = seq('nibbles');
  for (let i = 0; i < 300; i++) {
    const p = bitePlan(rand);
    assert.ok(p.bite >= 2.4 && p.bite <= 6.01, String(p.bite));
    assert.ok(p.nibbles.length >= 1 && p.nibbles.length <= 3);
    for (let k = 0; k < p.nibbles.length; k++) {
      assert.ok(p.nibbles[k] <= p.bite - 0.7, 'a nibble never lands on top of the bite');
      if (k) assert.ok(p.nibbles[k] - p.nibbles[k - 1] >= 0.6);
    }
  }
  assert.ok(BITE_WINDOW >= 0.6 && BITE_WINDOW <= 1);
});

test('fightPlan is seeded; bigger fish of a kind pull harder; species pull differently', () => {
  const bass = FISH_BY_ID.bass;
  assert.deepEqual(fightPlan(bass, 20, 7).runs, fightPlan(bass, 20, 7).runs);
  const small = fightPlan(bass, 5, 7), big = fightPlan(bass, 40, 7);
  assert.ok(big.base > small.base && big.secs > small.secs);
  // A porgy barely runs; a striper makes long runs; a fluke is mostly dead weight.
  const porgy = fightPlan(FISH_BY_ID.porgy, 1, 3), fluke = fightPlan(FISH_BY_ID.fluke, 4, 3);
  const meanRun = (p: FightPlan) => p.runs.slice(0, 5).reduce((t, r) => t + r.dur * r.pow, 0) / 5;
  assert.ok(meanRun(big) > meanRun(porgy) * 3);
  assert.ok(fluke.base > porgy.base * 1.5);
  // The eel rolls: its pull swings a lot between runs.
  const eel = fightPlan(FISH_BY_ID.eel, 3, 3);
  const swings = [0.2, 0.4, 0.6, 0.8, 1].map((t) => pullAt(eel, t));
  assert.ok(Math.max(...swings) - Math.min(...swings) > 0.12);
  // A tired fish pulls less.
  assert.ok(pullAt(big, 0.5, 0.1) < pullAt(big, 0.5, 1));
  // Runs are telegraphed.
  const r0 = big.runs[0];
  assert.ok(runSoon(big, r0.at - 0.2) && !inRun(big, r0.at - 0.2) && inRun(big, r0.at + 0.3));
});

test('every species can be landed by a sensible player in a short, fair fight', () => {
  for (const f of FISH) {
    for (const size of [0, 1]) {
      const lb = f.lb[0] + (f.lb[1] - f.lb[0]) * size;
      for (const seed of [1, 2, 3]) {
        const plan = fightPlan(f, lb, seed);
        const smart = play(plan, 'smart');
        assert.equal(smart.out, 'landed', `${f.id} ${lb} lb seed ${seed}: ${smart.out} at ${smart.t.toFixed(1)}s`);
        assert.ok(smart.t > 4 && smart.t < 55, `${f.id} ${lb} lb took ${smart.t.toFixed(1)}s`);
        // Someone just watching the gauge mostly lands the small stuff too.
        if (f.fight <= 2) assert.equal(play(plan, 'gauge').out, 'landed', `${f.id} gauge`);
      }
    }
  }
});

test('hold through every run and the big ones snap; never reel and it spits the hook', () => {
  for (const id of ['bass', 'bluefish', 'sturgeon', 'shark']) {
    let snaps = 0;
    for (let seed = 1; seed <= 6; seed++) if (play(fightPlan(FISH_BY_ID[id], FISH_BY_ID[id].lb[1], seed), 'hold').out === 'snap') snaps++;
    assert.ok(snaps >= 5, `${id} snapped ${snaps}/6`);
  }
  // A porgy forgives a beginner who just holds.
  assert.equal(play(fightPlan(FISH_BY_ID.porgy, 1, 1), 'hold').out, 'landed');
  for (const id of ['porgy', 'fluke', 'bass']) assert.equal(play(fightPlan(FISH_BY_ID[id], FISH_BY_ID[id].lb[0], 2), 'never').out, 'spit', id);
});

test('tension responds fast enough to feel (attack under ~0.5 s, release faster)', () => {
  const plan = fightPlan(FISH_BY_ID.porgy, 1, 4);
  const r = newReel();
  r.tension = 0.1;
  let t = 0;
  while (r.tension < TENSION.green[0] + 0.15 && t < 2) (reelStep(r, plan, true, 1 / 60), (t += 1 / 60));
  assert.ok(t < 0.5, `attack ${t}`);
  const down = newReel();
  down.tension = 0.95;
  t = 0;
  while (down.tension > TENSION.green[1] - 0.1 && t < 2) (reelStep(down, plan, false, 1 / 60), (t += 1 / 60));
  assert.ok(t < 0.25, `release ${t}`);
});

test('perfect catch and streak bonus', () => {
  const plan = fightPlan(FISH_BY_ID.porgy, 1, 5);
  const r = play(plan, 'smart');
  assert.equal(r.out, 'landed');
  assert.equal(typeof perfectCatch(r), 'boolean');
  assert.deepEqual([0, 1, 2, 3, 4, 7, 20].map(streakBonus), [0, 0, 0, 500, 1000, 2500, 2500]);
});

test('landCatch: sells, fills the journal, records, and junk is just junk', () => {
  const s = life();
  const money0 = s.money;
  const a = landCatch(s, FISH_BY_ID.fluke, 4, { time: at(15) });
  assert.ok(a.newSpecies && a.speciesRecord && a.newBest);
  assert.equal(a.cents, 3600);
  assert.equal(s.money, money0 + 3600);
  const b = landCatch(s, FISH_BY_ID.fluke, 3, { time: at(15), perfect: true });
  assert.ok(!b.newSpecies && !b.speciesRecord && !b.newBest);
  assert.equal(b.cents, 3400, 'perfect is +25%, rounded to the dollar');
  const rec = fishingOf(s);
  assert.deepEqual(rec.species!.fluke, { n: 2, lb: 4 });
  assert.equal(rec.caught, 2);
  const m = s.money;
  const boot = landCatch(s, FISH_BY_ID.boot, 1.5, { time: at(15), streak: 5 });
  assert.equal(boot.cents + boot.streakCents, 0);
  assert.equal(s.money, m);
  assert.ok(boot.newSpecies && !boot.newBest);
  assert.equal(rec.best!.id, 'fluke');
  assert.deepEqual(journalCount(s), { found: 2, total: FISH.length });
  // A legend: no sale, but rep and the record.
  const st = landCatch(s, FISH_BY_ID.sturgeon, 80, { time: at(15) });
  assert.ok(st.rep === 10 && st.cents === 0 && st.newBest);
  // Streak pays on real fish.
  const c = landCatch(s, FISH_BY_ID.porgy, 1, { time: at(15), streak: 4 });
  assert.equal(c.streakCents, 1000);
  // The old string entry point.
  assert.match(landFish(s, FISH_BY_ID.porgy, 1, { time: at(15) }), /Porgy, 1 lb/);
});

test('the derby: only mornings, heaviest counts, paid after 11 with the same prizes', () => {
  const s = life();
  landCatch(s, FISH_BY_ID.bass, 12, { time: at(15) });
  assert.equal(fishingOf(s).derby, null, 'afternoon fish are not in the derby');
  const big = landCatch(s, FISH_BY_ID.bass, 30, { time: at(8) });
  assert.ok(big.derbyBest);
  assert.ok(!landCatch(s, FISH_BY_ID.porgy, 2, { time: at(9) }).derbyBest);
  assert.ok(!landCatch(s, FISH_BY_ID.sturgeon, 100, { time: at(9) }).derbyBest, 'protected fish are not weighed');
  assert.equal(fishingOf(s).derby!.lb, 30);
  const board = derbyBoard(s, '2026-10-28');
  assert.equal(board.length, 6);
  assert.ok(board.some((r) => r.you && r.lb === 30));
  const place = derbyPlace(s, '2026-10-28');
  assert.ok(place >= 1 && place <= 6);
  assert.equal(settleDerby(s, at(10)), null, 'not before 11');
  const money0 = s.money;
  const line = settleDerby(s, at(11));
  assert.ok(line);
  if (place <= 3) assert.equal(s.money, money0 + DERBY_PRIZES[place - 1]);
  else assert.equal(s.money, money0);
  assert.equal(settleDerby(s, at(12)), null, 'paid once');
  // A 30 lb striper beats the regulars most days (they top out at 27 lb).
  assert.equal(place, 1);
});

test('old saves load: no journal yet, record fish seeds it', () => {
  const s = life();
  (s as { fishing?: unknown }).fishing = { best: { id: 'bass', lb: 22.4 }, caught: 9, derby: { day: '2026-10-20', lb: 10, paid: true } };
  const rec = fishingOf(s);
  assert.deepEqual(rec.species, { bass: { n: 1, lb: 22.4 } });
  assert.equal(rec.caught, 9);
  // Removed ids in an old record don't break it.
  const t = life();
  (t as { fishing?: unknown }).fishing = { best: { id: 'phone', lb: 0.4 }, caught: 1, derby: null };
  assert.deepEqual(fishingOf(t).species, {});
  assert.deepEqual(journalCount(t).found, 0);
  // Brand new.
  assert.deepEqual(fishingOf(life()), { best: null, caught: 0, derby: null, species: {} });
});
