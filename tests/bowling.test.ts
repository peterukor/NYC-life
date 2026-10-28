// Bowling: 10-frame scoring (strikes, spares, the 10th frame), the
// score sheet marks, lane physics sanity, and the computer bowler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import {
  BALL_R, BOWLING_COST, LANE, RACK, aimAngle, ballXAt, bowlBall, bowlingBest, clearDeadwood, finishBowling, frameMarks, gameOver, gameScore, isSplit, maxPossible, newLane,
  newRack, nextBall, npcGame, npcThrow, rackOf, release, scoreFrames, seeded, settle, settled, splitFrames, standing, stepLane, strikeRun, tally, validRoll,
} from '../src/sim/bowling.ts';

const life = () => newLife({ name: 'T', birthYear: 1995, origin: 'trustFund', spawnClass: 'rich', look: {} as never, traits: [] } as never);
const rep = (n: number, v: number): number[] => Array.from({ length: n }, () => v);

// ---------------------------------------------------------------- scoring

test('a perfect game is 300: twelve strikes', () => {
  const rolls = rep(12, 10);
  assert.equal(gameScore(rolls), 300);
  assert.deepEqual(scoreFrames(rolls), [30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
  assert.ok(gameOver(rolls));
  assert.deepEqual(frameMarks(splitFrames(rolls)[9], true), ['X', 'X', 'X']);
  assert.equal(tally(rolls).strikes, 12);
  assert.equal(strikeRun(rolls), 12);
});

test('a gutter game is 0, all twenty balls', () => {
  const rolls = rep(20, 0);
  assert.equal(gameScore(rolls), 0);
  assert.ok(gameOver(rolls));
  assert.ok(!gameOver(rep(19, 0)));
  assert.deepEqual(frameMarks([0, 0], false), ['-', '-']);
});

test('all spares (5/ every frame, 5 on the bonus ball) is 150', () => {
  const rolls = rep(21, 5);
  assert.equal(gameScore(rolls), 150);
  assert.deepEqual(scoreFrames(rolls), [15, 30, 45, 60, 75, 90, 105, 120, 135, 150]);
  assert.deepEqual(frameMarks([5, 5], false), ['5', '/']);
  assert.deepEqual(frameMarks(splitFrames(rolls)[9], true), ['5', '/', '5']);
  assert.ok(gameOver(rolls));
  // 9/ with a strike on the bonus ball every frame: 10 + 10 per frame…
  assert.equal(gameScore([...rep(10, 0).flatMap(() => [9, 1]), 10]), 9 * 19 + 20);
  // A gutter then all ten is a spare, not a strike.
  assert.deepEqual(frameMarks([0, 10], false), ['-', '/']);
});

test('strikes and spares wait for their bonus balls', () => {
  assert.deepEqual(scoreFrames([10]).slice(0, 2), [null, null]);
  assert.deepEqual(scoreFrames([10, 3]).slice(0, 2), [null, null]);
  assert.deepEqual(scoreFrames([10, 3, 4]).slice(0, 3), [17, 24, null]);
  assert.deepEqual(scoreFrames([7, 3]).slice(0, 1), [null]);
  assert.deepEqual(scoreFrames([7, 3, 6]).slice(0, 1), [16]);
  assert.equal(gameScore([10, 10, 10, 7]), 30 + 27);
});

test('the 10th frame: bonus balls only after a strike or a spare, and the rack resets', () => {
  const nine = rep(18, 0); // nine open frames of gutters
  // Open 10th: two balls, done.
  assert.ok(gameOver([...nine, 3, 4]));
  assert.equal(gameScore([...nine, 3, 4]), 7);
  // Spare: a third ball on a fresh rack.
  assert.ok(!gameOver([...nine, 3, 7]));
  assert.deepEqual(nextBall([...nine, 3, 7]), { frame: 9, ball: 2, fresh: true, standing: 10 });
  assert.equal(gameScore([...nine, 3, 7, 10]), 20);
  assert.deepEqual(frameMarks([3, 7, 10], true), ['3', '/', 'X']);
  // Strike: two more; after X then 6 only 4 are standing.
  assert.deepEqual(nextBall([...nine, 10]), { frame: 9, ball: 1, fresh: true, standing: 10 });
  assert.deepEqual(nextBall([...nine, 10, 6]), { frame: 9, ball: 2, fresh: false, standing: 4 });
  assert.deepEqual(frameMarks([10, 6, 4], true), ['X', '6', '/']);
  assert.deepEqual(frameMarks([10, 10, 9], true), ['X', 'X', '9']);
  assert.deepEqual(frameMarks([10, 0, 0], true), ['X', '-', '-']);
  assert.equal(gameScore([...nine, 10, 6, 4]), 20);
  assert.ok(gameOver([...nine, 10, 6, 4]));
  // Can't knock more pins than are standing.
  assert.ok(validRoll([...nine, 10, 6], 4));
  assert.ok(!validRoll([...nine, 10, 6], 5));
  assert.ok(!validRoll([...nine, 3, 4], 0), 'game over');
  // 11 strikes then a 9: 299. Max possible after a 9-count first ball (spare, then all strikes): 290.
  assert.equal(gameScore([...rep(11, 10), 9]), 299);
  assert.equal(maxPossible([9]), 290);
  assert.equal(maxPossible([]), 300);
});

test('frame flow: after a strike the next frame starts; after a first ball the leave stands', () => {
  assert.deepEqual(nextBall([]), { frame: 0, ball: 0, fresh: true, standing: 10 });
  assert.deepEqual(nextBall([10]), { frame: 1, ball: 0, fresh: true, standing: 10 });
  assert.deepEqual(nextBall([7]), { frame: 0, ball: 1, fresh: false, standing: 3 });
  assert.deepEqual(nextBall([7, 2]), { frame: 1, ball: 0, fresh: true, standing: 10 });
  assert.equal(strikeRun([10, 10, 10]), 3);
  assert.equal(strikeRun([0, 10, 10]), 1, 'a spare is not a strike');
  assert.equal(tally([0, 10, 10, 10, 3, 4]).spares, 1);
});

test('splits: the head pin gone and the leave not touching', () => {
  assert.ok(isSplit([7, 10]));
  assert.ok(isSplit([4, 6]));
  assert.ok(!isSplit([4, 5]));
  assert.ok(!isSplit([10]));
  assert.ok(!isSplit([1, 7, 10]), 'head pin standing: not a split');
  assert.ok(!isSplit([3, 6, 10]));
});

// ---------------------------------------------------------------- physics

test('the rack: ten pins, 12 in apart, head pin at 60 ft', () => {
  assert.equal(RACK.length, 10);
  assert.equal(RACK[0].z, 720);
  const r = newRack(seeded(1), 0);
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) assert.ok(Math.hypot(r[i].x - r[j].x, r[i].z - r[j].z) > 11.9);
});

test('a straight ball stays on the lane and goes where it was aimed', () => {
  const rand = seeded(2);
  for (let i = 0; i < 20; i++) {
    const x = (rand() - 0.5) * 30;
    const lane = newLane([]);
    release(lane, { x, angle: 0, speed: 200 + rand() * 200, spin: 0 });
    for (let k = 0; k < 600 && !lane.ball!.out; k++) {
      stepLane(lane, 1 / 60, rand);
      assert.ok(Math.abs(lane.ball!.x) <= LANE.half + LANE.gutter, 'within the gutters');
      assert.equal(lane.ball!.gutter, 0);
    }
    assert.ok(lane.ball!.out, 'reaches the pit');
    assert.ok(Math.abs(lane.ball!.x - x) < 0.5);
  }
  // Aim solving: the ball crosses the target.
  for (const spin of [-0.8, 0, 0.6]) {
    const th = { x: 6, speed: 300, spin };
    const a = aimAngle(th, 2.5, 720);
    assert.ok(Math.abs(ballXAt({ ...th, angle: a }, 720) - 2.5) < 0.2);
  }
});

test('a hook curves the way it spins, more on a slower ball', () => {
  const left = ballXAt({ x: 0, angle: 0, speed: 300, spin: -0.6 }, 720);
  const right = ballXAt({ x: 0, angle: 0, speed: 300, spin: 0.6 }, 720);
  const slow = ballXAt({ x: 0, angle: 0, speed: 230, spin: 0.6 }, 720);
  assert.ok(left < -3 && right > 3 && slow > right);
  // It skids straight on the oil first.
  assert.ok(Math.abs(ballXAt({ x: 0, angle: 0, speed: 300, spin: 1 }, 300)) < 0.3);
});

test('a wide ball finds the gutter and touches no pins', () => {
  const r = bowlBall(newRack(seeded(3)), { x: 17, angle: 0.012, speed: 300, spin: 0 }, seeded(3));
  assert.notEqual(r.lane.ball!.gutter, 0);
  assert.equal(r.down, 0);
  assert.equal(standing(r.lane.pins).length, 10);
});

test('a straight pocket hit knocks most pins, and strikes happen', () => {
  const rand = seeded(4);
  let total = 0, strikes = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    const th = { x: 2, speed: 300, spin: 0 };
    const r = bowlBall(newRack(rand), { ...th, angle: aimAngle(th, 2.6, 720) }, rand);
    total += r.down;
    if (r.down === 10) strikes++;
    assert.ok(r.down >= 6, `pocket hit left ${10 - r.down}`);
  }
  assert.ok(total / N >= 8.3, `average ${total / N}`);
  assert.ok(strikes >= 3, `strikes ${strikes}`);
});

test('pins settle: every pin ends still, up or down, and nothing escapes the deck', () => {
  const rand = seeded(5);
  for (let i = 0; i < 15; i++) {
    const lane = newLane(newRack(rand));
    release(lane, { x: (rand() - 0.5) * 16, angle: (rand() - 0.5) * 0.02, speed: 220 + rand() * 160, spin: (rand() - 0.5) * 1.6 });
    const secs = settle(lane, rand);
    assert.ok(settled(lane), 'came to rest');
    assert.ok(secs < 12, `took ${secs}s`);
    for (const p of lane.pins) {
      assert.ok(p.state !== 'tip', 'nothing mid-fall');
      if (p.state === 'out') continue;
      assert.ok(Math.abs(p.x) <= LANE.kick && p.z <= LANE.deck + 1, `pin ${p.n} at ${p.x},${p.z}`);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    }
    // The sweep keeps only standing pins, still.
    for (const p of clearDeadwood(lane.pins)) assert.ok(p.state === 'up' && p.vx === 0 && p.vz === 0);
  }
});

test('a single pin spare: aimed straight at it, it falls', () => {
  const rand = seeded(6);
  for (const n of [7, 10, 5]) {
    const pins = rackOf([n]);
    const th = { x: -pins[0].x * 0.5, speed: 300, spin: 0 };
    const r = bowlBall(pins, { ...th, angle: aimAngle(th, pins[0].x, pins[0].z) }, rand);
    assert.equal(r.down, 1, `pin ${n}`);
  }
  assert.ok(BALL_R > 4 && BALL_R < 4.5);
});

// ------------------------------------------------------------ the computer

test('the computer bowler scores by skill: casuals low, sharks high, all legal games', () => {
  const avg = (skill: number, seed: number) => {
    const rand = seeded(seed);
    let t = 0;
    for (let i = 0; i < 6; i++) {
      const rolls = npcGame(skill, rand);
      assert.ok(gameOver(rolls));
      // Every roll was possible.
      for (let k = 0; k < rolls.length; k++) assert.ok(validRoll(rolls.slice(0, k), rolls[k]), `roll ${k}`);
      const sc = gameScore(rolls);
      assert.ok(sc >= 0 && sc <= 300);
      t += sc;
    }
    return t / 6;
  };
  const lo = avg(0.05, 7), mid = avg(0.5, 8), hi = avg(0.95, 9);
  assert.ok(lo < mid && mid < hi, `${lo} < ${mid} < ${hi}`);
  assert.ok(lo >= 40 && lo <= 125, `casual ${lo}`);
  assert.ok(hi >= 150, `shark ${hi}`);
});

test('the computer aims at what is left (a ten pin gets a ball on the right)', () => {
  const th = npcThrow(1, rackOf([10]), seeded(10));
  assert.ok(ballXAt(th, 751) > 12);
  const th7 = npcThrow(1, rackOf([7]), seeded(11));
  assert.ok(ballXAt(th7, 751) < -12);
});

// ---------------------------------------------------------------- you

test('finishing a game: fun, social with company, best, and a moodlet at 200+', () => {
  assert.equal(BOWLING_COST, 800);
  const s = life();
  s.needs.fun = 40;
  s.needs.social = 40;
  const r1 = finishBowling(s, 120);
  assert.ok(r1.best && !r1.twoHundred);
  assert.ok(s.needs.fun > 40);
  assert.equal(s.needs.social, 40, 'solo: no social');
  assert.equal(bowlingBest(s), 120);
  assert.equal(s.fun?.best.bowling, 120, 'the 🏆 board sees it');
  const r2 = finishBowling(s, 95, { versus: true });
  assert.ok(!r2.best);
  assert.ok(s.needs.social > 40);
  assert.equal(bowlingBest(s), 120);
  const r3 = finishBowling(s, 214, { versus: true, won: true, strikes: 6 });
  assert.ok(r3.best && r3.twoHundred);
  assert.ok(s.moodlets.some((m) => m.id === 'bowl200'));
  assert.equal(s.bowling?.games, 3);
  assert.equal(s.bowling?.strikes, 6);
  // Nonsense scores are clamped.
  finishBowling(s, Number.NaN);
  finishBowling(s, 999);
  assert.equal(bowlingBest(s), 300);
});
