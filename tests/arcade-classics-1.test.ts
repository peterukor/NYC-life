// 🐍 Subway Snake, 🥪 Bodega Stack, 🛵 Delivery Dash: the pure rules (sim/arcade-snake|stack|dash.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTurn, createSnake, manhattan, snakeBonusRoll, snakeDeadly, snakeFinish, snakeFreeCell, snakeMult, snakeStepMs, snakeTick, snakeTickets, snakeTurn,
  SNAKE_COLS, SNAKE_MAX, SNAKE_PAR_SLACK, SNAKE_PER_STOP, SNAKE_PTS, SNAKE_ROWS, SNAKE_SLOW_STEPS, type SnakeEvent, type SnakeState,
} from '../src/sim/arcade-snake.ts';
import {
  createStack, stackDrop, stackIsOrder, stackNextKind, stackOrderBonus, stackPlace, stackPoints, stackRange, stackSlide, stackSpeed, stackTickets, stackTolerance,
  STACK_BASE_W, STACK_FIELD_W, STACK_FILLINGS, STACK_GROW, STACK_MAX, type StackEvent,
} from '../src/sim/arcade-stack.ts';
import {
  createDash, dashHop, dashMult, dashSpeed, dashSteer, dashTickets, dashUpdate, dashWave, dashWaveLength, dashWavePassable, DASH_INFO, DASH_LIVES, DASH_MAX, DASH_SECONDS,
  type DashEvent, type DashKind, type DashState,
} from '../src/sim/arcade-dash.ts';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =================================================================== 🐍 snake
const tick = (s: SnakeState, r = rng(1)) => {
  const out: SnakeEvent[] = [];
  snakeTick(s, r, out);
  return out;
};

test('snake: turns are buffered, never straight back, max 3 ahead', () => {
  const s = createSnake(rng(1));
  assert.deepEqual(s.dir, { x: 0, y: -1 });
  assert.ok(!canTurn(s.dir, 0, 1), 'no reversing');
  assert.ok(!canTurn(s.dir, 0, -1), 'no turning onto the same heading');
  assert.ok(!canTurn(s.dir, 1, 1), 'no diagonals');
  assert.ok(snakeTurn(s, 1, 0));
  assert.ok(snakeTurn(s, 0, 1), 'a U-turn takes two quick swipes');
  assert.ok(!snakeTurn(s, 0, -1), 'reverse of the last buffered turn');
  assert.ok(snakeTurn(s, -1, 0));
  assert.ok(!snakeTurn(s, 0, -1), 'buffer is full');
  tick(s);
  assert.deepEqual(s.dir, { x: 1, y: 0 });
});

test('snake: a step moves the train and remembers where it was', () => {
  const s = createSnake(rng(1));
  const head = { ...s.body[0] };
  tick(s);
  assert.deepEqual(s.body[0], { x: head.x, y: head.y - 1 });
  assert.deepEqual(s.prev[0], head);
  assert.equal(s.body.length, s.prev.length);
  assert.equal(s.steps, 1);
});

test('snake: eating a slice grows the train, scores, and places a new one', () => {
  const s = createSnake(rng(2));
  s.pizza = { x: s.body[0].x, y: s.body[0].y - 1 };
  s.par = 5;
  const len = s.body.length;
  const ev = tick(s);
  const eat = ev.find((e) => e.type === 'eat');
  assert.ok(eat && eat.type === 'eat' && eat.kind === 'pizza');
  assert.equal(s.eaten, 1);
  assert.equal(s.score, SNAKE_PTS.pizza);
  tick(s);
  assert.equal(s.body.length, len + 1, 'one car longer after the next step');
  assert.notDeepEqual(s.pizza, s.body[0]);
  assert.equal(s.par, s.parMax - 1, 'par counts down every step');
  assert.ok(s.parMax >= SNAKE_PAR_SLACK + 4, 'par = distance + slack');
});

test('snake: combo needs the slice within par; multiplier ×2 at 2 … ×5', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6, 8, 20].map(snakeMult), [1, 1, 2, 2, 3, 4, 5, 5]);
  const s = createSnake(rng(3));
  s.combo = 3;
  s.pizza = { x: s.body[0].x, y: s.body[0].y - 1 };
  s.par = 1; // just in time (par counts down as you step)
  tick(s);
  assert.equal(s.combo, 4);
  s.pizza = { x: s.body[0].x, y: s.body[0].y - 1 };
  s.par = -1; // already past par: too slow
  tick(s);
  assert.equal(s.combo, 1, 'a late slice restarts the combo');
});

test('snake: every 5 slices is a stop with a bonus and a blinking 🚧', () => {
  const s = createSnake(rng(4));
  const r = rng(5);
  let stops = 0;
  for (let i = 0; i < SNAKE_PER_STOP; i++) {
    // Teleport the slice in front of the head (keeps the test about the rule).
    s.pizza = { x: s.body[0].x, y: s.body[0].y - 1 };
    const ev = tick(s, r);
    stops += ev.filter((e) => e.type === 'stop').length;
  }
  assert.equal(stops, 1);
  assert.equal(s.stop, 1);
  assert.equal(s.walls.length, 1);
  assert.ok(s.walls[0].warm > 0, 'blinks before it is solid');
  const w = s.walls[0];
  assert.ok(w.x > 0 && w.y > 0 && w.x < SNAKE_COLS - 1 && w.y < SNAKE_ROWS - 1, 'never on the outer ring');
  assert.ok(!snakeDeadly(s, w.x, w.y), 'not deadly while warming');
  w.warm = 0;
  assert.ok(snakeDeadly(s, w.x, w.y));
});

test('snake: the wall screeches once (a late turn saves you), then derails', () => {
  const s = createSnake(rng(6));
  s.pizza = { x: 0, y: 21 };
  // Drive straight up into the top wall.
  let ev: SnakeEvent[] = [];
  for (let i = 0; i < 40 && !ev.some((e) => e.type === 'screech'); i++) ev = tick(s);
  assert.equal(s.body[0].y, 0);
  assert.ok(ev.some((e) => e.type === 'screech'));
  assert.ok(!s.dead);
  // Turn now: saved.
  snakeTurn(s, 1, 0);
  ev = tick(s);
  assert.ok(!s.dead);
  assert.equal(s.body[0].x, 10);
  // Into the right wall with no turn: screech, then crash.
  for (let i = 0; i < 40 && !s.dead; i++) ev = tick(s);
  assert.ok(s.dead);
  assert.ok(ev.some((e) => e.type === 'crash'));
});

test('snake: chasing your own tail is fine, biting your body is not', () => {
  const s = createSnake(rng(7));
  s.body = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
  s.prev = s.body.map((b) => ({ ...b }));
  // The tail (5,6) moves away this step.
  assert.ok(!snakeDeadly(s, 5, 6));
  s.grow = 1;
  assert.ok(snakeDeadly(s, 5, 6), 'unless the train is growing');
  assert.ok(snakeDeadly(s, 6, 6));
  assert.ok(snakeDeadly(s, -1, 0) && snakeDeadly(s, SNAKE_COLS, 0) && snakeDeadly(s, 0, SNAKE_ROWS));
});

test('snake: bonus table, speed ramp, free cells, finish bonus', () => {
  assert.equal(snakeBonusRoll(0.1, false, false), 'gold');
  assert.equal(snakeBonusRoll(0.1, true, false), null);
  assert.equal(snakeBonusRoll(0.2, false, false), 'soda');
  assert.equal(snakeBonusRoll(0.2, false, true), null);
  assert.equal(snakeBonusRoll(0.5, false, false), null);
  assert.ok(snakeStepMs(0, false) > snakeStepMs(20, false));
  assert.equal(snakeStepMs(1000, false), 80, 'a speed cap');
  assert.ok(snakeStepMs(10, true) > snakeStepMs(10, false), '🥤 is slow-mo');
  const s = createSnake(rng(8));
  for (let i = 0; i < 200; i++) {
    const c = snakeFreeCell(s, rng(i), 3)!;
    assert.ok(c);
    assert.ok(manhattan(c, s.body[0]) >= 3);
    assert.ok(!s.body.some((b) => b.x === c.x && b.y === c.y));
  }
  const len = s.body.length;
  assert.equal(snakeFinish(s), len * SNAKE_PTS.perCar);
  assert.ok(SNAKE_SLOW_STEPS > 0);
});

test('snake: a full bot game stays in range and ends', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const r = rng(seed);
    const s = createSnake(r);
    for (let i = 0; i < 3000 && !s.dead; i++) {
      // A dumb bot: head for the slice, never reverse.
      const h = s.body[0];
      const dx = Math.sign(s.pizza.x - h.x), dy = Math.sign(s.pizza.y - h.y);
      if (dx && !snakeDeadly(s, h.x + dx, h.y)) snakeTurn(s, dx, 0);
      else if (dy && !snakeDeadly(s, h.x, h.y + dy)) snakeTurn(s, 0, dy);
      tick(s, r);
    }
    assert.ok(s.score >= 0 && s.score <= SNAKE_MAX);
  }
});

test('snake: tickets (a good run ≈ 1,000 → 40)', () => {
  assert.equal(snakeTickets(0), 0);
  assert.equal(snakeTickets(-5), 0);
  assert.equal(snakeTickets(1000), 40);
  assert.ok(snakeTickets(SNAKE_MAX) < 400);
});

// =================================================================== 🥪 stack
test('stack: miss, perfect (snaps), cut (overhang comes off)', () => {
  assert.equal(stackDrop(100, 160, 262, 160, 5, 0).kind, 'miss');
  assert.equal(stackDrop(100, 160, -60, 160, 5, 0).kind, 'miss', 'overlap of 0');
  const p = stackDrop(100, 160, 104, 160, 5, 0);
  assert.deepEqual(p, { kind: 'perfect', x: 100, w: 160, grow: 0 });
  const c = stackDrop(100, 160, 130, 160, 5, 0);
  assert.equal(c.kind, 'cut');
  if (c.kind === 'cut') {
    assert.equal(c.x, 130);
    assert.equal(c.w, 130);
    assert.equal(c.cutX, 260);
    assert.equal(c.cutW, 30);
  }
  const l = stackDrop(100, 160, 80, 160, 5, 0);
  if (l.kind === 'cut') {
    assert.equal(l.x, 100);
    assert.equal(l.w, 140);
    assert.equal(l.cutX, 80, 'off the left side');
    assert.equal(l.cutW, 20);
  } else assert.fail('expected a cut');
});

test('stack: from the 3rd perfect in a row it grows back (up to the base width)', () => {
  assert.equal((stackDrop(100, 120, 100, 120, 5, 0) as { grow: number }).grow, 0);
  assert.equal((stackDrop(100, 120, 100, 120, 5, 1) as { grow: number }).grow, 0);
  const g3 = stackDrop(100, 120, 100, 120, 5, 2);
  assert.equal(g3.kind, 'perfect');
  if (g3.kind === 'perfect') {
    assert.equal(g3.grow, STACK_GROW);
    assert.equal(g3.w, 120 + STACK_GROW);
    assert.equal(g3.x, 100 - STACK_GROW / 2, 'centred');
  }
  const full = stackDrop(90, STACK_BASE_W, 90, STACK_BASE_W, 5, 9);
  if (full.kind === 'perfect') assert.equal(full.w, STACK_BASE_W);
});

test('stack: points, orders, fillings, tolerance and speed curves', () => {
  assert.equal(stackPoints('cut', 0, false), 5);
  assert.equal(stackPoints('perfect', 1, false), 10);
  assert.equal(stackPoints('perfect', 3, false), 20);
  assert.equal(stackPoints('perfect', 50, false), 40, 'streak bonus caps');
  assert.equal(stackPoints('perfect', 1, true), 30, '×3 on the top bread');
  assert.equal(stackOrderBonus(1), 50);
  assert.ok(stackOrderBonus(3) > stackOrderBonus(2));
  assert.ok(stackIsOrder(10) && stackIsOrder(20) && !stackIsOrder(0) && !stackIsOrder(9));
  for (let n = 1; n < 60; n++) for (const r of [0, 0.3, 0.99]) {
    const k = stackNextKind(n, 3, r);
    if (stackIsOrder(n)) assert.equal(k, 0);
    else {
      assert.notEqual(k, 3, 'never the same filling twice');
      assert.ok(k >= 1 && k < STACK_FILLINGS.length);
    }
  }
  assert.ok(stackTolerance(0) > stackTolerance(40));
  assert.ok(stackTolerance(1000) >= 3.5);
  assert.ok(stackSpeed(0) < stackSpeed(30));
  assert.equal(stackSpeed(1000), 420);
});

test('stack: the slider ping-pongs inside its range and passes over the whole field', () => {
  const s = createStack(rng(1));
  const [lo, hi] = stackRange(s.cur.w);
  assert.ok(lo < 0 && hi + s.cur.w > STACK_FIELD_W);
  let min = 1e9, max = -1e9;
  for (let i = 0; i < 2000; i++) {
    stackSlide(s, 1 / 60);
    min = Math.min(min, s.cur.x);
    max = Math.max(max, s.cur.x);
    assert.ok(s.cur.x >= lo - 1e-6 && s.cur.x <= hi + 1e-6);
  }
  assert.ok(max - min > STACK_FIELD_W * 0.8);
});

test('stack: a game — perfects, cuts, an order, then a miss ends it', () => {
  const r = rng(2);
  const s = createStack(r);
  const out: StackEvent[] = [];
  for (let n = 1; n <= 10; n++) {
    const top = s.layers[s.layers.length - 1];
    s.cur.x = top.x + (n % 4 === 0 ? 12 : 0);
    stackPlace(s, r, out);
  }
  assert.equal(s.layers.length, 11);
  assert.equal(s.orders, 1);
  assert.ok(out.some((e) => e.type === 'order'));
  assert.ok(s.layers[10].gold && s.layers[10].kind === 0, 'the 10th is the top bread');
  assert.ok(s.perfects >= 7);
  s.cur.x = 400;
  out.length = 0;
  stackPlace(s, r, out);
  assert.ok(s.dead);
  assert.equal(out[0].type, 'miss');
  const score = s.score;
  stackPlace(s, r, out);
  assert.equal(s.score, score, 'nothing after the end');
});

test('stack: tickets (a good sandwich ≈ 500 → 41)', () => {
  assert.equal(stackTickets(0), 0);
  assert.equal(stackTickets(500), 41);
  assert.ok(stackTickets(STACK_MAX) < 2000);
});

// =================================================================== 🛵 dash
test('dash: every wave leaves a way through, for all times and many seeds', () => {
  const r = rng(11);
  for (let i = 0; i < 4000; i++) {
    const t = (i % 91);
    const w = dashWave(t, r, i % 30);
    assert.ok(w.length > 0);
    assert.ok(dashWavePassable(w), `wave at t=${t}: ${JSON.stringify(w)}`);
    assert.ok(dashWaveLength(w) > 0);
    for (const sp of w) assert.ok(sp.kind in DASH_INFO);
  }
});

test('dash: early waves are gentle (no slaloms, no jaywalkers in the first seconds)', () => {
  const r = rng(12);
  for (let i = 0; i < 500; i++) {
    const kinds = new Set(dashWave(3, r).map((s) => s.kind));
    assert.ok(!kinds.has('walker'));
    assert.ok(!kinds.has('bus'));
  }
});

/** A road with one thing on it at distance z in a lane. */
function road(kind: DashKind, lane: number, z = 200): DashState {
  const s = createDash();
  s.nextWave = 1e9;
  s.objs.push({ kind, lane, lane0: lane, to: lane, z, t: 0, done: false, passed: false, seed: 0 });
  return s;
}
function run(s: DashState, secs: number, each?: (s: DashState) => void): DashEvent[] {
  const all: DashEvent[] = [];
  const r = rng(1);
  for (let t = 0; t < secs; t += 1 / 60) {
    each?.(s);
    const out: DashEvent[] = [];
    dashUpdate(s, 1 / 60, r, out);
    all.push(...out);
  }
  return all;
}

test('dash: steering clamps to the three lanes and slides over quickly', () => {
  const s = createDash();
  dashSteer(s, -1);
  dashSteer(s, -1);
  dashSteer(s, -1);
  assert.equal(s.lane, 0);
  run(s, 0.2);
  assert.equal(s.pl, 0, 'there in under 0.2 s');
  dashSteer(s, 5);
  assert.equal(s.lane, 1, 'one lane at a time');
});

test('dash: a tall thing in your lane hits; next to you it does not', () => {
  const s = road('cab', 1);
  const ev = run(s, 0.6);
  assert.ok(ev.some((e) => e.type === 'hit'));
  assert.equal(s.lives, DASH_LIVES - 1);
  assert.equal(s.streak, 0);
  const t = road('cab', 0);
  assert.ok(!run(t, 0.6).some((e) => e.type === 'hit'));
});

test('dash: hop clears low things, not tall ones', () => {
  const low = road('pothole', 1, 120);
  const evL = run(low, 0.8, (s) => s.objs[0] && s.objs[0].z < 60 && s.hop === 0 && s.hopV === 0 && dashHop(s));
  assert.ok(!evL.some((e) => e.type === 'hit'), 'hopped the pothole');
  assert.ok(evL.some((e) => e.type === 'hopped'));
  const tall = road('truck', 1, 120);
  const evT = run(tall, 0.8, (s) => s.objs[0] && s.objs[0].z < 60 && s.hop === 0 && s.hopV === 0 && dashHop(s));
  assert.ok(evT.some((e) => e.type === 'hit'), 'you cannot hop a truck');
});

test('dash: a hop pressed just before landing is buffered', () => {
  const s = createDash();
  s.nextWave = 1e9;
  dashHop(s);
  let landed = 0;
  let pressed = false;
  for (let i = 0; i < 120; i++) {
    if (!pressed && s.hopV < 0 && s.hop < 10) (dashHop(s), (pressed = true));
    const out: DashEvent[] = [];
    dashUpdate(s, 1 / 60, rng(1), out);
    if (out.some((e) => e.type === 'land')) {
      landed++;
      if (landed === 1) assert.ok(s.hopV > 0, 'took off again straight away');
    }
  }
  assert.ok(pressed);
});

test('dash: helmet saves one hit, turbo smashes through, invulnerability after a hit', () => {
  const h = road('steam', 1);
  h.helmet = true;
  const evH = run(h, 0.6);
  assert.ok(evH.some((e) => e.type === 'saved'));
  assert.equal(h.lives, DASH_LIVES);
  assert.ok(!h.helmet);
  const t = road('bus', 1);
  t.turbo = 3;
  const evT = run(t, 0.6);
  assert.ok(evT.some((e) => e.type === 'smash'));
  assert.equal(t.lives, DASH_LIVES);
  const i = road('cab', 1);
  i.objs.push({ kind: 'truck', lane: 1, lane0: 1, to: 1, z: 420, t: 0, done: false, passed: false, seed: 0 });
  run(i, 1.0);
  assert.equal(i.lives, DASH_LIVES - 1, 'the second one landed while still blinking');
});

test('dash: tips build the streak multiplier; turbo doubles it', () => {
  assert.deepEqual([0, 9, 10, 25, 40, 99].map((n) => dashMult(n, false)), [1, 1, 2, 3, 5, 5]);
  assert.equal(dashMult(40, true), 10);
  const s = road('cash', 1);
  for (let k = 1; k < 12; k++) s.objs.push({ kind: 'cash', lane: 1, lane0: 1, to: 1, z: 200 + k * 60, t: 0, done: false, passed: false, seed: 0 });
  const ev = run(s, 2);
  const grabs = ev.filter((e) => e.type === 'grab');
  assert.equal(grabs.length, 12);
  assert.equal(s.streak, 12);
  assert.equal(s.cash, 12);
  const last = grabs[11];
  assert.ok(last.type === 'grab' && last.mult === 2 && last.pts === DASH_INFO.cash.pts * 2);
});

test('dash: the magnet pulls tips over from the next lane', () => {
  const s = road('cash', 0, 600);
  s.magnet = 5;
  const ev = run(s, 1.2);
  assert.ok(ev.some((e) => e.type === 'grab'));
});

test('dash: three hits end the shift; time ends it with a bonus per heart', () => {
  const s = createDash();
  s.nextWave = 1e9;
  for (let k = 0; k < 3; k++) s.objs.push({ kind: 'truck', lane: 1, lane0: 1, to: 1, z: 200 + k * 900, t: 0, done: false, passed: false, seed: 0 });
  const ev = run(s, 6);
  assert.ok(s.dead && s.over);
  assert.ok(ev.some((e) => e.type === 'end' && e.reason === 'crash'));
  const t = createDash(2);
  t.nextWave = 1e9;
  const evT = run(t, 2.2);
  const end = evT.find((e) => e.type === 'end');
  assert.ok(end && end.type === 'end' && end.reason === 'time' && end.bonus === 100 * DASH_LIVES);
  assert.equal(t.score, end.bonus + 10 * t.blocks);
});

test('dash: speed ramps and caps; same seed, same shift', () => {
  assert.ok(dashSpeed(0) < dashSpeed(45));
  assert.equal(dashSpeed(1000), 1150);
  const play = (seed: number) => {
    const s = createDash();
    const r = rng(seed);
    for (let i = 0; i < 60 * 30; i++) {
      if (i % 37 === 0) dashSteer(s, i % 74 ? 1 : -1);
      dashUpdate(s, 1 / 60, r, []);
    }
    return s.score * 1000 + s.lives;
  };
  assert.equal(play(5), play(5));
  assert.ok(DASH_SECONDS === 90);
});

test('dash: tickets (a good shift ≈ 5,000 → 41)', () => {
  assert.equal(dashTickets(0), 0);
  assert.equal(dashTickets(5000), 41);
  assert.ok(dashTickets(DASH_MAX) < 400);
});
