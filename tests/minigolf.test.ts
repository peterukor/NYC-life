// ⛳ Rooftop mini golf (sim/minigolf.ts): every hole can be finished, the
// ball never leaves the course, the cup only takes a slow ball, water,
// grates, sand and ramps do what they say, and the scoring adds up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import {
  advance, BALL_R, canRest, CUP_R, CUP_SPEED, finishMinigolf, HOLES, inBounds, inZone, MAX_STROKES, minigolfOf, newPutter, PAR_TOTAL, planShot, putt,
  roundScore, seeded, simulate, stampFor, STEP, stepBall, toPar, wallDistance, type Ball, type Hole, type Putter,
} from '../src/sim/minigolf.ts';

const life = () => newLife({ name: 'T', birthYear: 1995, origin: 'hustler', spawnClass: 'middle', look: {} as never, traits: [] } as never);
const hole = (id: string) => HOLES.find((h) => h.id === id)!;

/** Roll until the putt is over (or the hole is). Returns the clock after. */
function rollOut(h: Hole, p: Putter, t: number, check?: (b: Ball) => void): number {
  for (let i = 0; i < 30 / STEP && p.rolling && !p.done; i++) {
    advance(h, p, t, STEP);
    t += STEP;
    check?.(p.ball);
  }
  return t;
}

/** One player putting out a hole with the planner. */
function playHole(h: Hole, skill: number, rand: () => number): Putter {
  const p = newPutter(h);
  let t = 0;
  while (!p.done) {
    assert.ok(putt(p, planShot(h, p.ball, t, skill, rand)), 'a putt is always possible at rest');
    t = rollOut(h, p, t) + 0.7;
    for (let i = 0; i < 30 && !p.done; i++) (advance(h, p, t, STEP), (t += STEP)); // a beat between putts (cabs keep driving)
  }
  return p;
}

test('nine holes, each with a name, emoji, par, and a tee and cup on open turf', () => {
  assert.equal(HOLES.length, 9);
  assert.deepEqual(HOLES.map((h) => h.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(HOLES.map((h) => h.id)).size, 9);
  assert.equal(PAR_TOTAL, HOLES.reduce((a, h) => a + h.par, 0));
  for (const h of HOLES) {
    assert.ok(h.name && h.emoji && h.tip, h.id);
    assert.ok(h.par >= 2 && h.par <= 4, h.id);
    for (const p of [h.tee, h.cup]) {
      assert.ok(inBounds(h, p.x, p.y), `${h.id} point on course`);
      assert.ok(wallDistance(h, p.x, p.y) > BALL_R + 2, `${h.id} point clear of walls`);
      assert.ok(!h.zones.some((z) => (z.kind === 'water' || z.kind === 'sand' || z.kind === 'ramp' || z.kind === 'hill') && inZone(z, p.x, p.y)), `${h.id} tee/cup on plain turf`);
    }
    for (const g of h.grates) assert.ok(inBounds(h, g.to.x, g.to.y) && wallDistance(h, g.to.x, g.to.y) > BALL_R, `${h.id} grate exit on course`);
  }
  // The features the course promises.
  const all = (f: (h: Hole) => boolean) => HOLES.some(f);
  assert.ok(all((h) => h.cabs.length > 0), 'a 🚕 cab');
  assert.ok(all((h) => h.spinners.length > 0), 'a turnstile');
  assert.ok(all((h) => h.zones.some((z) => z.kind === 'sand')), 'sand');
  assert.ok(all((h) => h.zones.some((z) => z.kind === 'water')), 'water');
  assert.ok(all((h) => h.zones.some((z) => z.kind === 'ramp')), 'a ramp');
  assert.ok(all((h) => h.bumpers.some((b) => b.kind === 'bumper')), 'bumpers');
  assert.ok(all((h) => h.grates.length > 0), 'a subway grate');
});

test('every hole is winnable: a sharp player holes out well inside the max, around par', () => {
  let total = 0;
  for (const h of HOLES) {
    const runs = [1, 2].map((seed) => playHole(h, 1, seeded(seed * 101 + h.n)));
    for (const p of runs) {
      assert.ok(p.sunk && !p.pickedUp, `${h.id}: holed out`);
      assert.ok(p.strokes <= h.par + 1, `${h.id}: ${p.strokes} strokes, par ${h.par}`);
    }
    total += runs[0].strokes;
  }
  assert.ok(total <= PAR_TOTAL, `a sharp round: ${total} vs par ${PAR_TOTAL}`);
});

test('an average player gets round in believable numbers (no hole is a wall)', () => {
  for (const h of HOLES) {
    const p = playHole(h, 0.5, seeded(7 + h.n));
    assert.ok(p.done, h.id);
    assert.ok(p.strokes <= MAX_STROKES, h.id);
  }
});

test('the ball never escapes the walls across many random shots', () => {
  const rand = seeded(42);
  for (const h of HOLES) {
    const p = newPutter(h);
    let t = 0;
    for (let shot = 0; shot < 40; shot++) {
      if (p.done) Object.assign(p, newPutter(h));
      p.strokes = 0; // keep shooting (no pick-up)
      assert.ok(putt(p, { angle: rand() * Math.PI * 2, power: 0.2 + rand() * 0.8 }));
      t = rollOut(h, p, t, (b) => {
        assert.ok(inBounds(h, b.x, b.y), `${h.id}: ball at ${b.x.toFixed(2)},${b.y.toFixed(2)} left the course`);
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
      });
      if (!p.done) {
        assert.ok(!p.rolling, `${h.id}: every putt stops`);
        assert.ok(wallDistance(h, p.ball.x, p.ball.y) >= BALL_R * 0.5, `${h.id}: resting clear of the wall`);
      }
    }
  }
});

test('lip-out: the cup takes a slow ball and spits out a fast one', () => {
  const h = hole('walkup');
  const at = (speed: number, offset = 0) => {
    const b: Ball = { x: h.cup.x + offset, y: h.cup.y + 6, vx: 0, vy: -speed };
    let sunk = false, lip = false;
    for (let i = 0; i < 240 && !sunk; i++) {
      const r = stepBall(h, b, i * STEP, STEP);
      sunk = r.result === 'cup';
      lip ||= r.events.some((e) => e.type === 'lip');
      if (b.y < h.cup.y - CUP_R - 1) break; // it's past the cup
    }
    return { sunk, lip };
  };
  assert.deepEqual(at(CUP_SPEED * 3), { sunk: false, lip: true }, 'too fast: lips out');
  assert.deepEqual(at(CUP_SPEED * 3, 1.2), { sunk: false, lip: true }, 'fast and off-centre: lips out');
  assert.equal(at(20).sunk, true, 'a firm, makeable putt drops');
  assert.equal(at(12, 0.8).sunk, true, 'slow and a bit off-centre still drops');
  // A ball dying on the lip falls in.
  const b: Ball = { x: h.cup.x + CUP_R + 0.6, y: h.cup.y, vx: 0, vy: 0 };
  let sunk = false;
  for (let i = 0; i < 240 && !sunk; i++) sunk = stepBall(h, b, i * STEP, STEP).result === 'cup';
  assert.ok(sunk, 'resting on the lip drops');
});

test('water: a penalty stroke and the ball goes back where it was hit from', () => {
  const h = hole('water');
  const p = newPutter(h);
  // Straight up from the tee lands in the river.
  putt(p, { angle: -Math.PI / 2, power: 0.6 });
  let pen = false;
  for (let i = 0; i < 2000 && p.rolling; i++) pen ||= advance(h, p, i * STEP, STEP).some((e) => e.type === 'penalty');
  assert.ok(pen);
  assert.equal(p.strokes, 2);
  assert.deepEqual([p.ball.x, p.ball.y], [h.tee.x, h.tee.y]);
  assert.equal(p.rolling, false);
});

test('max strokes: picked up at 8', () => {
  const h = hole('walkup');
  const p = newPutter(h);
  p.strokes = MAX_STROKES - 1;
  putt(p, { angle: Math.PI / 2, power: 0.1 }); // away from the cup
  rollOut(h, p, 0);
  assert.ok(p.done && p.pickedUp && !p.sunk);
  assert.equal(p.strokes, MAX_STROKES);
  assert.equal(putt(p, { angle: 0, power: 1 }), false, 'no more putts');
});

test('subway grate: in one, out of the manhole up top', () => {
  const h = hole('grate');
  const g = h.grates[0];
  const from = { x: g.x, y: g.y + 10 };
  const r = simulate(h, from, 0, { angle: -Math.PI / 2, power: 0.3 });
  assert.ok(r.y < 44, `came out above the wall (y ${r.y.toFixed(1)})`);
});

test('sand slows the ball; ramps roll it back and nothing rests on one', () => {
  const sandHole = hole('sand');
  const z = sandHole.zones.find((q) => q.kind === 'sand' && q.poly)!;
  const y = (z.poly![0][1] + z.poly![2][1]) / 2;
  const onSand = simulate(sandHole, { x: 21, y }, 0, { angle: 0, power: 0.25 });
  const onGrass = simulate(sandHole, { x: 4, y: 80 }, 0, { angle: 0, power: 0.25 });
  assert.ok(onSand.x - 21 < (onGrass.x - 4) * 0.6, `sand ${onSand.x - 21} vs grass ${onGrass.x - 4}`);

  const ramp = hole('ramp');
  assert.equal(canRest(ramp, 25, 55), false);
  const soft = simulate(ramp, { x: 25, y: 76 }, 0, { angle: -Math.PI / 2, power: 0.35 });
  assert.ok(soft.y > 72, 'a soft putt rolls back down');
  assert.ok(canRest(ramp, soft.x, soft.y));
});

test('the cab and the turnstile move by the clock and knock a resting ball', () => {
  const knocked = (h: Hole, b: Ball, type: 'cab' | 'spin') => {
    for (let i = 0; i < 6 / STEP; i++) if (stepBall(h, b, i * STEP, STEP).events.some((e) => e.type === type)) return true;
    return false;
  };
  const cab = hole('cab');
  const mid: Ball = { x: 25, y: 55, vx: 0, vy: 0 };
  assert.ok(knocked(cab, mid, 'cab'), 'a ball in the cab’s path gets bumped');
  assert.ok(inBounds(cab, mid.x, mid.y));
  const ts = hole('turnstile');
  const sp = ts.spinners[0];
  const b: Ball = { x: sp.x + sp.len - 2, y: sp.y + 3.5, vx: 0, vy: 0 };
  assert.ok(knocked(ts, b, 'spin'), 'the turnstile sweeps a ball sitting in it');
  assert.ok(inBounds(ts, b.x, b.y));
});

test('scoring: higher is better, par round 180, stamps and to-par', () => {
  assert.equal(roundScore(PAR_TOTAL), 180);
  assert.equal(roundScore(PAR_TOTAL - 3), 210);
  assert.equal(roundScore(9), (PAR_TOTAL + 18 - 9) * 10);
  assert.equal(roundScore(72), 0);
  assert.ok(roundScore(30) > roundScore(31));
  assert.equal(stampFor(1, 3), 'ace');
  assert.equal(stampFor(2, 4), 'eagle');
  assert.equal(stampFor(2, 3), 'birdie');
  assert.equal(stampFor(3, 3), 'par');
  assert.equal(stampFor(4, 3), 'bogey');
  assert.equal(stampFor(8, 3, true), 'pickup');
  assert.equal(toPar(25, 27), '−2');
  assert.equal(toPar(27, 27), 'E');
  assert.equal(toPar(30, 27), '+3');
});

test('finishMinigolf: best, fun and social, a moodlet under par', () => {
  const s = life();
  s.needs.fun = 40;
  s.needs.social = 40;
  const a = finishMinigolf(s, 30, PAR_TOTAL);
  assert.equal(a.score, roundScore(30));
  assert.equal(a.best, true);
  assert.equal(a.underPar, false);
  assert.ok(s.needs.fun > 40 && s.needs.social > 40);
  assert.ok(!s.moodlets?.some((m) => m.id === 'minigolf'));
  const b = finishMinigolf(s, 24, PAR_TOTAL, { versus: true, aces: 1 });
  assert.equal(b.best, true);
  assert.equal(b.underPar, true);
  assert.ok(s.moodlets.some((m) => m.id === 'minigolf'));
  assert.equal(finishMinigolf(s, 28, PAR_TOTAL).best, false);
  assert.deepEqual(minigolfOf(s), { best: 24, bestScore: roundScore(24), rounds: 3, aces: 1 });
  assert.equal(s.fun!.best.minigolf, roundScore(24), 'the offline 🏆 board sees it');
});
