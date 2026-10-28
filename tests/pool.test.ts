// Pool: physics sanity, racks, 8-ball and 9-ball rules, and the AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiPlan, ball, beginShot, cueBall, D, endShot, FOOT, groupOf, L, legalTargets, moving, newGame, placeCue, playShot, R, seeded, settle, step, strike, W, type PoolGame } from '../src/sim/pool.ts';

/** Keep only these balls on the table, at these spots (the rest are pocketed). */
function only(g: PoolGame, spots: Record<number, [number, number]>): void {
  for (const b of g.balls) {
    const p = spots[b.id];
    Object.assign(b, p ? { x: p[0], y: p[1], on: true } : { on: false }, { vx: 0, vy: 0 });
  }
  g.breakShot = false;
  g.ballInHand = false;
  g.kitchen = false;
}

/** Fake a finished shot for the rules (no physics): what was hit first and what dropped. */
function fake(g: PoolGame, o: { first: number | null; potted?: number[]; rail?: boolean }): ReturnType<typeof endShot> {
  const rec = beginShot(g);
  rec.firstHit = o.first;
  rec.railAfter = o.rail ?? true;
  for (const id of o.potted ?? []) {
    rec.pocketed.push(id);
    if (id === 0) rec.scratch = true;
    ball(g, id).on = false;
  }
  return endShot(g);
}

const angleTo = (g: PoolGame, x: number, y: number) => Math.atan2(y - cueBall(g).y, x - cueBall(g).x);

test('racks: 15 in a triangle with the 8 in the middle, 9 in a diamond with the 1 on top and the 9 in the middle', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g8 = newGame('8', seeded(seed));
    assert.equal(g8.balls.length, 16);
    assert.deepEqual(g8.balls.map((b) => b.id), Array.from({ length: 16 }, (_, i) => i));
    const obj = g8.balls.filter((b) => b.id);
    // Third row (y = apex − 2 rows), middle spot.
    const rowY = (r: number) => FOOT.y - r * ((D + 0.012) * Math.sqrt(3)) / 2;
    const eight = ball(g8, 8);
    assert.ok(Math.abs(eight.x - FOOT.x) < 0.01 && Math.abs(eight.y - rowY(2)) < 0.01, 'the 8 sits in the middle');
    // Back corners: one solid and one stripe.
    const back = obj.filter((b) => Math.abs(b.y - rowY(4)) < 0.01).sort((a, b) => a.x - b.x);
    assert.equal(back.length, 5);
    assert.notEqual(groupOf(back[0].id), groupOf(back[4].id));
    assert.ok(['solids', 'stripes'].includes(groupOf(back[0].id)) && ['solids', 'stripes'].includes(groupOf(back[4].id)));
    const g9 = newGame('9', seeded(seed));
    assert.equal(g9.balls.length, 10);
    const apex = g9.balls.filter((b) => b.id).sort((a, b) => b.y - a.y)[0];
    assert.equal(apex.id, 1);
    assert.ok(Math.abs(ball(g9, 9).y - rowY(2)) < 0.01 && Math.abs(ball(g9, 9).x - FOOT.x) < 0.01, 'the 9 sits in the middle');
    for (const g of [g8, g9]) {
      for (const a of g.balls) {
        assert.ok(a.x > R && a.x < W - R && a.y > R && a.y < L - R);
        for (const b of g.balls) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= D, 'no overlaps');
      }
      assert.ok(g.breakShot && g.ballInHand && g.kitchen && cueBall(g).y >= 75);
    }
  }
  // Seeded racks repeat.
  assert.deepEqual(newGame('8', seeded(7)).balls, newGame('8', seeded(7)).balls);
});

test('physics: hard breaks and wild shots keep every ball on the table and everything stops', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const rand = seeded(seed);
    const g = newGame(seed % 2 ? '8' : '9', rand);
    const shots = [{ angle: angleTo(g, FOOT.x + (rand() - 0.5) * 0.6, FOOT.y), power: 1, spin: 0 }, { angle: rand() * Math.PI * 2, power: 1, spin: 1 }, { angle: rand() * Math.PI * 2, power: 0.9, spin: -1 }];
    for (const shot of shots) {
      if (!cueBall(g).on) placeCue(Object.assign(g, { ballInHand: true }), W / 2, 80) || assert.fail('could not place');
      strike(g, shot);
      let t = 0;
      while (moving(g)) {
        step(g, 1 / 60);
        t += 1 / 60;
        for (const b of g.balls) if (b.on) assert.ok(b.x >= 0 && b.x <= W && b.y >= 0 && b.y <= L, `ball ${b.id} left the table at ${b.x},${b.y}`);
        assert.ok(t < 30, 'balls stop in time');
      }
      // No two balls left overlapping.
      const on = g.balls.filter((b) => b.on);
      for (const a of on) for (const b of on) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > D - 0.05);
      endShot(g);
      g.over = false;
    }
  }
});

test('physics: a straight shot pots the ball (side and corner)', () => {
  const g = newGame('8', seeded(1));
  only(g, { 0: [30, 50], 3: [10, 50] });
  playShot(g, { angle: Math.PI, power: 0.4, spin: 0 });
  assert.equal(ball(g, 3).on, false, 'into the side pocket');
  assert.equal(cueBall(g).on, true);
  const h = newGame('8', seeded(1));
  only(h, { 0: [22, 22], 3: [12, 12] });
  const res = playShot(h, { angle: Math.atan2(-1, -1), power: 0.35, spin: 0 });
  assert.equal(ball(h, 3).on, false, 'into the corner');
  assert.deepEqual(res.potted, [3]);
  // A gentle roll stops short; a draw shot comes back toward the shooter.
  const k = newGame('8', seeded(1));
  only(k, { 0: [25, 70], 5: [25, 50] });
  strike(k, { angle: -Math.PI / 2, power: 0.45, spin: -1 });
  settle(k);
  assert.ok(cueBall(k).y > 52, `drew back to ${cueBall(k).y.toFixed(1)}`);
});

test('8-ball: group goes to the first legal pot, and you keep shooting', () => {
  const g = newGame('8', seeded(2));
  only(g, { 0: [25, 80], 1: [10, 30], 3: [20, 30], 8: [25, 20], 11: [30, 30], 12: [40, 30] });
  assert.deepEqual(legalTargets(g).sort((a, b) => a - b), [1, 3, 11, 12], 'open table: anything but the 8');
  const r = fake(g, { first: 11, potted: [11] });
  assert.equal(r.assigned, 'stripes');
  assert.deepEqual(g.groups, ['stripes', 'solids']);
  assert.equal(r.keepTurn, true);
  assert.equal(g.turn, 0);
  assert.deepEqual(legalTargets(g), [12]);
  // Hitting a solid first now is a foul: the other player gets ball in hand.
  const f = fake(g, { first: 1 });
  assert.equal(f.foul, 'wrong-first');
  assert.equal(g.turn, 1);
  assert.equal(g.ballInHand, true);
  // Hitting the 8 first on an open table is a foul too.
  const h = newGame('8', seeded(2));
  only(h, { 0: [25, 80], 1: [10, 30], 8: [25, 20], 11: [30, 30] });
  assert.equal(fake(h, { first: 8 }).foul, 'wrong-first');
  // No rail after contact (and nothing potted) is a foul.
  const n = newGame('8', seeded(2));
  only(n, { 0: [25, 80], 1: [10, 30], 8: [25, 20], 11: [30, 30] });
  assert.equal(fake(n, { first: 1, rail: false }).foul, 'no-rail');
});

test('8-ball: the 8 early loses, scratching on the 8 loses, the 8 after your group wins', () => {
  const early = newGame('8', seeded(3));
  only(early, { 0: [25, 80], 2: [10, 30], 8: [25, 20], 9: [30, 30] });
  early.groups = ['solids', 'stripes'];
  const r1 = fake(early, { first: 2, potted: [2, 8] });
  assert.equal(r1.win, 1, 'the 8 went down with your last solid: too early');
  assert.equal(r1.why, 'eight-early');
  assert.ok(early.over);

  const scratch = newGame('8', seeded(3));
  only(scratch, { 0: [25, 80], 8: [25, 20], 9: [30, 30] });
  scratch.groups = ['solids', 'stripes'];
  assert.deepEqual(legalTargets(scratch), [8]);
  const r2 = fake(scratch, { first: 8, potted: [8, 0] });
  assert.equal(r2.win, 1);
  assert.equal(r2.why, 'eight-scratch');

  const legal = newGame('8', seeded(3));
  only(legal, { 0: [25, 60], 8: [25, 40], 9: [40, 30] });
  legal.groups = ['solids', 'stripes'];
  // The real thing: straight up the middle… into the side? No: line the 8 up on the side pocket.
  only(legal, { 0: [30, 50], 8: [10, 50], 9: [40, 20] });
  legal.groups = ['solids', 'stripes'];
  const r3 = playShot(legal, { angle: Math.PI, power: 0.4, spin: 0 });
  assert.equal(r3.win, 0);
  assert.equal(r3.why, 'eight');

  // The 8 on the break wins; with a scratch it comes back to the spot.
  const b1 = newGame('8', seeded(3));
  assert.equal(fake(b1, { first: 5, potted: [8] }).why, 'eight-break');
  const b2 = newGame('8', seeded(3));
  const r4 = fake(b2, { first: 5, potted: [8, 0] });
  assert.equal(r4.win, null);
  assert.equal(r4.spotted, 8);
  assert.ok(ball(b2, 8).on);
  assert.equal(b2.turn, 1);
  assert.ok(b2.ballInHand);
  // The table stays open after a break pot.
  const b3 = newGame('8', seeded(3));
  const r5 = fake(b3, { first: 5, potted: [5, 12] });
  assert.equal(r5.keepTurn, true);
  assert.deepEqual(b3.groups, [null, null]);
});

test('9-ball: hit the lowest ball first; the 9 off a legal shot (even a combo) wins', () => {
  const g = newGame('9', seeded(4));
  only(g, { 0: [25, 80], 1: [10, 30], 2: [20, 30], 9: [25, 20] });
  assert.deepEqual(legalTargets(g), [1]);
  const f = fake(g, { first: 2, potted: [2] });
  assert.equal(f.foul, 'wrong-first');
  assert.equal(g.turn, 1);
  assert.ok(g.ballInHand);

  const combo = newGame('9', seeded(4));
  only(combo, { 0: [25, 80], 1: [10, 30], 9: [25, 20] });
  const r = fake(combo, { first: 1, potted: [9] });
  assert.equal(r.win, 0);
  assert.equal(r.why, 'nine');

  // A real combo: the cue ball sends the 1 into the 9, which drops in the side.
  const real = newGame('9', seeded(4));
  only(real, { 0: [40, 50], 1: [25, 50], 9: [12, 50] });
  const r2 = playShot(real, { angle: Math.PI, power: 0.6, spin: 0 });
  assert.equal(r2.firstHit, 1);
  assert.equal(r2.win, 0);

  // The 9 on a foul comes back up and the other player has ball in hand.
  const foul = newGame('9', seeded(4));
  only(foul, { 0: [25, 80], 2: [10, 30], 3: [30, 30], 9: [25, 60] });
  const r3 = fake(foul, { first: 3, potted: [9] });
  assert.equal(r3.foul, 'wrong-first');
  assert.equal(r3.win, null);
  assert.equal(r3.spotted, 9);
  assert.ok(ball(foul, 9).on);
  // Potting anything legally keeps you at the table.
  const keep = newGame('9', seeded(4));
  only(keep, { 0: [25, 80], 2: [10, 30], 3: [30, 30], 9: [25, 60] });
  assert.equal(fake(keep, { first: 2, potted: [3] }).keepTurn, true);
  assert.equal(keep.turn, 0);
});

test('AI: a strong player makes an easy straight-in shot nearly every time; plans are seeded', () => {
  let made = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = newGame('8', seeded(seed));
    only(g, { 0: [30, 62], 3: [20, 72], 8: [40, 15], 10: [8, 20] });
    g.groups = ['solids', 'stripes'];
    const plan = aiPlan(g, 0.95, seeded(seed * 31));
    const res = playShot(g, plan.shot);
    if (res.potted.includes(3) && !res.foul) made++;
  }
  assert.ok(made >= 16, `made ${made}/20`);
  // Same seed, same plan.
  const a = newGame('9', seeded(9)), b = newGame('9', seeded(9));
  only(a, { 0: [25, 80], 1: [15, 40], 9: [30, 30] });
  only(b, { 0: [25, 80], 1: [15, 40], 9: [30, 30] });
  assert.deepEqual(aiPlan(a, 0.5, seeded(5)), aiPlan(b, 0.5, seeded(5)));
  // Ball in hand: it places the cue ball somewhere legal and pots.
  const h = newGame('8', seeded(11));
  only(h, { 3: [20, 40], 8: [40, 15], 10: [8, 20] });
  h.groups = ['solids', 'stripes'];
  h.ballInHand = true;
  cueBall(h).on = false;
  const p = aiPlan(h, 0.95, seeded(3));
  assert.ok(p.place && placeCue(h, p.place.x, p.place.y));
  const res = playShot(h, p.shot);
  assert.ok(res.potted.includes(3) && !res.foul);
  // A whole AI-vs-AI game ends.
  const game = newGame('9', seeded(21));
  const rand = seeded(22);
  for (let i = 0; i < 200 && !game.over; i++) {
    const plan = aiPlan(game, 0.7, rand);
    if (plan.place) placeCue(game, plan.place.x, plan.place.y);
    else if (!cueBall(game).on) assert.fail('cue ball off without a placement');
    playShot(game, plan.shot);
  }
  assert.ok(game.over, 'the game finishes');
});
