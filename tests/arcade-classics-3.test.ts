// 🐦 Pigeon Pop and 🎵 Beat Street: the rules, the pace, the charts, judging, scoring, tickets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PIGEON_GRACE, PIGEON_QUICK_BONUS, PIGEON_RAT_COST, PIGEON_ROUND, PIGEON_RUSH, PIGEON_SPECIAL_SLOTS, PigeonRound,
  pigeonComboMult, pigeonPace, pigeonPoints, pigeonRng, pigeonSpecials, pigeonTickets, pigeonVersusQuick, simulatePigeons,
  type PigeonKind,
} from '../src/sim/arcade-pigeons.ts';
import {
  BEAT_DIFFS, BEAT_TRACKS, BEAT_WARMUP, BEAT_WINDOWS, BeatGame, LANE_TONES, SECTIONS, beatBacking, beatChart, beatComboMult, beatGrade, beatJudge,
  beatLeadFreq, beatSix, beatSongLength, beatTickets, simulateBeats,
} from '../src/sim/arcade-beats.ts';

// ------------------------------------------------------------------ 🐦 Pigeon Pop

/** Put something up on a spot right now (for hand-made situations). */
function place(r: PigeonRound, i: number, kind: PigeonKind, stay = 1): void {
  const s = r.spots[i];
  s.kind = kind;
  s.up = r.t;
  s.until = r.t + stay;
  s.hitAt = -1;
}
/** A round with nothing scheduled to pop on its own for a while. */
function quietRound(): PigeonRound {
  const r = new PigeonRound(1);
  r.update(0.01);
  r.events.length = 0;
  for (const s of r.spots) s.kind = null;
  // Push the spawner and the specials out of the way.
  (r as unknown as { next: number }).next = 99;
  (r as unknown as { specials: unknown[] }).specials = [];
  return r;
}

test('pigeons: combo multiplier steps ×1…×4 every 5 hits', () => {
  assert.deepEqual([1, 4, 5, 6, 10, 11, 16, 40].map(pigeonComboMult), [1, 1, 1, 2, 2, 3, 4, 4]);
  assert.equal(pigeonPoints('pigeon', 1, false, false), 10);
  assert.equal(pigeonPoints('pigeon', 16, true, true), 10 * 4 * 2 + PIGEON_QUICK_BONUS);
  assert.equal(pigeonPoints('golden', 1, false, false), 50);
});

test('pigeons: the pace ramps over the round, rush hour is faster, frenzy has no rats', () => {
  const a = pigeonPace(0), b = pigeonPace(PIGEON_ROUND - PIGEON_RUSH - 0.1), c = pigeonPace(PIGEON_ROUND - 1);
  assert.ok(a.gap > b.gap && b.gap > c.gap);
  assert.ok(a.stay > b.stay && b.stay > c.stay);
  assert.ok(a.rat < c.rat);
  assert.ok(a.double < c.double);
  // Still humanly tappable at the end.
  assert.ok(c.stay >= 0.65);
  assert.equal(pigeonPace(20, true).rat, 0);
});

test('pigeons: two goldens and two bread bags a round, each inside its slot', () => {
  for (let seed = 1; seed < 50; seed++) {
    const sp = pigeonSpecials(pigeonRng(seed));
    assert.equal(sp.filter((s) => s.kind === 'golden').length, 2);
    assert.equal(sp.filter((s) => s.kind === 'bread').length, 2);
    for (const s of sp) assert.ok(PIGEON_SPECIAL_SLOTS.some((x) => x.kind === s.kind && s.t >= x.from && s.t <= x.to));
  }
});

test('pigeons: a round is replayable from its seed, ends on time, and specials do show up', () => {
  const run = (seed: number) => {
    const r = new PigeonRound(seed);
    const spawns: string[] = [];
    let ended = 0;
    while (!r.over) {
      r.update(1 / 60);
      for (const e of r.events) {
        if (e.type === 'spawn') {
          spawns.push(`${r.t.toFixed(2)}:${e.spot}:${e.kind}`);
          assert.ok(r.t < PIGEON_ROUND - 0.39, 'nothing pops in the last moment');
        }
        if (e.type === 'end') ended++;
      }
      r.events.length = 0;
    }
    assert.equal(ended, 1);
    assert.ok(Math.abs(r.t - PIGEON_ROUND) < 0.02);
    return spawns;
  };
  const a = run(7), b = run(7);
  assert.deepEqual(a, b);
  assert.equal(a.filter((s) => s.endsWith('golden')).length, 2);
  assert.equal(a.filter((s) => s.endsWith('bread')).length, 2);
  assert.ok(a.length > 60);
});

test('pigeons: tapping a pigeon scores, quick pops get a bonus, whiffs break the combo', () => {
  const r = quietRound();
  place(r, 0, 'pigeon');
  const ev = r.tap(0);
  assert.equal(ev?.type, 'hit');
  assert.equal(r.score, 10 + PIGEON_QUICK_BONUS); // tapped the instant it showed
  // Tapping it again (fat fingers) is harmless.
  assert.equal(r.tap(0), null);
  assert.equal(r.combo, 1);
  r.update(0.5);
  place(r, 1, 'pigeon');
  r.update(0.5); // not quick any more
  r.tap(1);
  assert.equal(r.combo, 2);
  assert.equal(r.score, 10 + PIGEON_QUICK_BONUS + 10);
  // An empty spot: whiff, the combo's gone.
  const w = r.tap(5);
  assert.equal(w?.type, 'whiff');
  assert.equal(r.combo, 0);
  assert.equal(r.score, 25);
});

test('pigeons: the combo runs out if you wait too long between hits', () => {
  const r = quietRound();
  place(r, 0, 'pigeon', 3);
  r.tap(0);
  r.update(1.6);
  assert.equal(r.combo, 0);
});

test('pigeons: a late tap just as it ducks still counts (grace), later is a whiff', () => {
  const r = quietRound();
  place(r, 2, 'pigeon', 0.5);
  r.update(0.5 + PIGEON_GRACE * 0.5);
  assert.equal(r.tap(2)?.type, 'hit');
  const r2 = quietRound();
  place(r2, 2, 'pigeon', 0.5);
  r2.update(0.5 + PIGEON_GRACE + 0.01);
  assert.equal(r2.tap(2)?.type, 'whiff');
});

test('pigeons: the rat costs points (never below zero) and the combo', () => {
  const r = quietRound();
  place(r, 3, 'rat');
  r.tap(3);
  assert.equal(r.score, 0);
  const r2 = quietRound();
  for (let i = 0; i < 6; i++) (place(r2, i, 'pigeon'), r2.tap(i));
  const before = r2.score;
  assert.equal(r2.combo, 6);
  place(r2, 7, 'rat');
  const ev = r2.tap(7);
  assert.equal(ev?.type, 'rat');
  assert.equal(r2.score, before - PIGEON_RAT_COST);
  assert.equal(r2.combo, 0);
});

test('pigeons: 🥖 bread pops every pigeon that’s up, but leaves the rat alone', () => {
  const r = quietRound();
  place(r, 0, 'pigeon');
  place(r, 1, 'pigeon');
  place(r, 2, 'rat');
  place(r, 4, 'bread');
  const ev = r.tap(4);
  assert.equal(ev?.type, 'bread');
  assert.deepEqual(ev?.type === 'bread' ? ev.popped : null, [0, 1]);
  assert.equal(r.stats.pigeons, 2);
  assert.equal(r.stats.rats, 0);
  assert.ok(r.live(2), 'the rat is still there (don’t tap it)');
  assert.equal(r.combo, 2);
});

test('pigeons: the 🕊️ golden pigeon starts a frenzy: pigeons only, double points', () => {
  const r = quietRound();
  place(r, 0, 'golden');
  r.tap(0);
  assert.ok(r.frenzy);
  assert.ok(r.events.some((e) => e.type === 'frenzy' && e.on));
  (r as unknown as { next: number }).next = r.t;
  const kinds: string[] = [];
  for (let k = 0; k < 4 * 60; k++) {
    r.update(1 / 60);
    for (const e of r.events) if (e.type === 'spawn') kinds.push(e.kind);
    r.events.length = 0;
  }
  assert.ok(kinds.length >= 10);
  assert.ok(kinds.every((k) => k === 'pigeon'));
  // A pigeon in a frenzy is worth double.
  const i = r.spots.findIndex((_, j) => r.live(j));
  const before = r.score;
  const hit = r.tap(i);
  assert.ok(hit?.type === 'hit' && hit.mult % 2 === 0);
  assert.ok(r.score - before >= 20);
});

test('pigeons: a better player scores more; a good round is about 40 🎟️', () => {
  const median = (skill: number) => {
    const xs = Array.from({ length: 30 }, (_, s) => simulatePigeons(1000 + s * 17, skill).score).sort((a, b) => a - b);
    return xs[15];
  };
  const m = [0, 0.5, 0.75, 1].map(median);
  assert.ok(m[0] < m[1] && m[1] < m[2] && m[2] < m[3], `medians ${m}`);
  const good = pigeonTickets(m[2]);
  assert.ok(good >= 30 && good <= 52, `good round: ${good} tickets`);
  assert.ok(pigeonTickets(m[3]) < 120);
  // The quick versus formula tracks the simulated player.
  for (const [i, k] of [0, 0.5, 0.75, 1].entries()) {
    const mid = (pigeonVersusQuick(k, () => 0.5));
    assert.ok(Math.abs(mid - m[i]) / m[i] < 0.25, `skill ${k}: formula ${mid} vs sim ${m[i]}`);
  }
});

// ------------------------------------------------------------------ 🎵 Beat Street

test('beats: every chart is well-formed, playable and the right length', () => {
  assert.equal(BEAT_TRACKS.length, 3);
  for (const tr of BEAT_TRACKS) {
    for (const ch of tr.arrangement) assert.ok(SECTIONS[ch], `${tr.id}: unknown section ${ch}`);
    const len = beatSongLength(tr);
    assert.ok(len >= 40 && len <= 60, `${tr.id}: ${len.toFixed(1)} s`);
    const counts: number[] = [];
    for (const d of BEAT_DIFFS) {
      for (const ch of new Set(tr.arrangement)) assert.equal(tr.bars[d][ch]?.length, 16, `${tr.id}/${d}/${ch}`);
      const notes = beatChart(tr, d);
      counts.push(notes.length);
      const six = beatSix(tr);
      let prevT = -1;
      const busyUntil = [-1, -1, -1, -1];
      const perStep = new Map<number, number>();
      for (const n of notes) {
        assert.ok(n.t >= prevT, 'in time order');
        prevT = n.t;
        assert.ok(n.t >= 0 && n.t + n.len <= len + 1e-9);
        assert.ok(n.lane >= 0 && n.lane < 4);
        // Nothing lands in a lane while a hold is still going in it.
        assert.ok(n.step >= busyUntil[n.lane], `${tr.id}/${d}: lane ${n.lane} busy at step ${n.step}`);
        busyUntil[n.lane] = n.step + Math.max(1, n.steps);
        if (n.len) assert.ok(n.steps >= 2 && Math.abs(n.len - n.steps * six) < 1e-9);
        perStep.set(n.step, (perStep.get(n.step) ?? 0) + 1);
      }
      // Two fingers at most, ever.
      assert.ok(Math.max(...perStep.values()) <= 2);
      // A breather to start: the first note waits for the downbeat at least.
      assert.ok(notes[0].t >= 0);
    }
    assert.ok(counts[0] < counts[1] && counts[1] < counts[2], `${tr.id}: ${counts}`);
  }
});

test('beats: easy charts are gentle (quarter notes, no chords)', () => {
  for (const tr of BEAT_TRACKS) {
    const notes = beatChart(tr, 'easy');
    for (const n of notes) assert.equal(n.step % 4, 0, `${tr.id}: easy note off the beat at ${n.step}`);
    const steps = notes.map((n) => n.step);
    assert.equal(new Set(steps).size, steps.length, `${tr.id}: easy has a chord`);
  }
});

test('beats: a malformed chart is refused', () => {
  const tr = { ...BEAT_TRACKS[0], arrangement: 'v', bars: { ...BEAT_TRACKS[0].bars, normal: { v: '1..=............' } } };
  assert.throws(() => beatChart(tr, 'normal'));
  const tr2 = { ...BEAT_TRACKS[0], arrangement: 'v', bars: { ...BEAT_TRACKS[0].bars, normal: { v: '1...' } } };
  assert.throws(() => beatChart(tr2, 'normal'));
  const tr3 = { ...BEAT_TRACKS[0], arrangement: 'v', bars: { ...BEAT_TRACKS[0].bars, normal: { v: 'A...............' } } };
  assert.throws(() => beatChart(tr3, 'normal'));
});

test('beats: judging windows (and Easy is a bit wider)', () => {
  assert.equal(beatJudge(0), 'perfect');
  assert.equal(beatJudge(BEAT_WINDOWS.perfect), 'perfect');
  assert.equal(beatJudge(-BEAT_WINDOWS.perfect - 0.001), 'great');
  assert.equal(beatJudge(BEAT_WINDOWS.great + 0.001), 'good');
  assert.equal(beatJudge(BEAT_WINDOWS.good + 0.001), null);
  assert.equal(beatJudge(BEAT_WINDOWS.good + 0.001, 'easy'), 'good');
  assert.equal(beatJudge(BEAT_WINDOWS.perfect + 0.005, 'easy'), 'perfect');
  assert.deepEqual([0, 9, 10, 29, 30, 99].map(beatComboMult), [1, 1, 2, 3, 4, 4]);
  assert.deepEqual([[0.96, false], [0.9, false], [0.8, false], [0.65, false], [0.3, false], [1, true]].map(([a, b]) => beatGrade(a as number, b as boolean)), ['S', 'A', 'B', 'C', 'D', 'D']);
});

/** Play a chart perfectly (or with a fixed timing error). */
function play(game: BeatGame, late = 0): void {
  const ev: { t: number; f: () => void }[] = [];
  for (const n of game.notes) {
    ev.push({ t: n.t + late, f: () => game.press(n.lane, n.t + late) });
    ev.push({ t: n.t + (n.len || 0.05) + late, f: () => game.release(n.lane, n.t + (n.len || 0.05) + late) });
  }
  ev.sort((a, b) => a.t - b.t);
  let i = 0;
  for (let t = -1; !game.over && t < game.end + 1; t += 1 / 240) {
    while (i < ev.length && ev[i].t <= t) ev[i++].f();
    game.update(t);
  }
}

test('beats: a perfect run is an S with every hold held, a full combo, and the clear bonus', () => {
  for (const tr of BEAT_TRACKS) for (const d of BEAT_DIFFS) {
    const g = new BeatGame(tr, d);
    play(g);
    assert.ok(g.over && !g.booed);
    assert.equal(g.counts.miss, 0);
    assert.equal(g.counts.ghost, 0);
    assert.equal(g.counts.perfect, g.notes.length);
    assert.equal(g.counts.holds, g.notes.filter((n) => n.len > 0).length);
    assert.equal(g.bestCombo, g.notes.length);
    assert.equal(g.grade(), 'S');
    assert.equal(g.bonus, 200);
    assert.ok(g.events.some((e) => e.type === 'hype' && e.on), 'hype kicks in');
  }
});

test('beats: steadily late taps show up as a timing bias (the sync hint)', () => {
  const g = new BeatGame(BEAT_TRACKS[1], 'normal');
  play(g, 0.04);
  assert.ok(g.timingBias()! >= 35 && g.timingBias()! <= 45);
  assert.equal(g.counts.perfect, g.notes.length);
  const g2 = new BeatGame(BEAT_TRACKS[1], 'normal');
  play(g2, 0.07);
  assert.equal(g2.counts.great, g2.notes.length);
  assert.notEqual(g2.grade(), 'S');
});

test('beats: do nothing and the crowd boos you off (but not during the warm-up)', () => {
  const g = new BeatGame(BEAT_TRACKS[0], 'normal');
  let t = -1;
  for (; !g.over && t < g.end + 1; t += 1 / 60) g.update(t);
  assert.ok(g.booed);
  assert.ok(t >= BEAT_WARMUP, `booed at ${t.toFixed(1)} s`);
  assert.ok(g.events.some((e) => e.type === 'booed'));
  assert.equal(g.grade(), 'D');
});

test('beats: a tap with no note breaks the combo; letting go of a hold early drops it', () => {
  const tr = BEAT_TRACKS[0];
  const g = new BeatGame(tr, 'normal');
  const first = g.notes[0];
  g.update(first.t - 0.5);
  g.press(first.lane, first.t);
  assert.equal(g.combo, 1);
  const ev = g.press((first.lane + 1) % 4, first.t + 0.3);
  assert.equal(ev?.type, 'ghost');
  assert.equal(g.combo, 0);
  // A hold.
  const gi = g.notes.findIndex((n) => n.len > 0);
  const h = g.notes[gi];
  const g2 = new BeatGame(tr, 'normal');
  for (const n of g2.notes) if (n.t < h.t) (g2.press(n.lane, n.t), g2.release(n.lane, n.t + 0.05), g2.update(n.t + 0.05));
  g2.update(h.t);
  g2.press(h.lane, h.t);
  assert.equal(g2.heldNote(h.lane), gi);
  g2.update(h.t + h.len * 0.3);
  const scoreMid = g2.score;
  g2.release(h.lane, h.t + h.len * 0.3);
  assert.ok(g2.events.some((e) => e.type === 'holdDrop'));
  assert.equal(g2.counts.drops, 1);
  assert.equal(g2.heldNote(h.lane), null);
  assert.ok(g2.score >= scoreMid);
});

test('beats: the backing counts in, keeps a beat, and the lanes climb in pitch', () => {
  for (const tr of BEAT_TRACKS) {
    const sticks = Array.from({ length: 16 }, (_, i) => beatBacking(tr, i - 16)).flat().filter((h) => h.k === 'stick');
    assert.equal(sticks.length, 4);
    // Every full-groove bar has a kick on the downbeat.
    tr.arrangement.split('').forEach((ch, bar) => {
      const hits = beatBacking(tr, bar * 16);
      if (SECTIONS[ch].drums !== 'break') assert.ok(hits.some((h) => h.k === 'kick'), `${tr.id} bar ${bar}`);
    });
    assert.deepEqual(beatBacking(tr, tr.arrangement.length * 16 + 3), []);
    for (let step = 0; step < tr.arrangement.length * 16; step += 16) {
      const f = [0, 1, 2, 3].map((l) => beatLeadFreq(tr, step, l));
      assert.ok(f[0] < f[1] && f[1] < f[2] && f[2] < f[3], `${tr.id} step ${step}`);
      assert.ok(f[0] > 80 && f[3] < 2000);
    }
  }
  assert.equal(LANE_TONES.length, 4);
});

test('beats: better players score more, and a good Normal run is about 40 🎟️', () => {
  for (const tr of BEAT_TRACKS) {
    const med = (k: number, d: (typeof BEAT_DIFFS)[number]) => {
      const xs = Array.from({ length: 15 }, (_, s) => simulateBeats(tr, d, k, 5 + s * 13).score).sort((a, b) => a - b);
      return xs[7];
    };
    const m = [0, 0.5, 0.75, 1].map((k) => med(k, 'normal'));
    assert.ok(m[0] < m[1] && m[1] < m[2] && m[2] < m[3], `${tr.id}: ${m}`);
    const good = beatTickets(m[2]);
    assert.ok(good >= 22 && good <= 60, `${tr.id}: good normal run ${good} tickets`);
    assert.ok(med(0.75, 'hard') > med(0.75, 'easy'), 'hard pays more');
  }
});
