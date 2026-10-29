// ⛳ Mini golf (sim/minigolf.ts + sim/minigolf-courses): seven courses of
// ten, every authored hole valid and beatable, the ball never leaves the
// course, every obstacle does what it says (and by the clock, so it
// replays exactly), the round score weighs time over strokes, and old
// saves still load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { RULES } from '../server/src/config.ts';
import { COURSES, COURSE_BY_ID, HOLES_PER_COURSE } from '../src/sim/minigolf-courses/index.ts';
import {
  advance, armAngle, atRest, BALL_R, boardId, box, cabAt, canRest, courseRecord, courseUnlocked, CUP_R, CUP_SPEED, cupAt, deg, defineHole, finishMinigolf,
  gateAt, holeTime, inBounds, isTimed, maxStrokes, MAX_STROKES, minigolfOf, moverAt, newHoleState, newPutter, planShot, putt, rect, roundScore, SCORE_MAX,
  scoreParts, seeded, simulate, solveHole, SPRING_MAX, stampFor, STEP, stepBall, tideLevel, tideRect, toPar, validateHole, wallDistance, windAt,
  type Ball, type Hole, type HoleDef, type HoleState, type MgEvent, type Putter,
} from '../src/sim/minigolf.ts';

const life = () => newLife({ name: 'T', birthYear: 1995, origin: 'hustler', spawnClass: 'middle', look: {} as never, traits: [] } as never);
const ALL = COURSES.flatMap((c) => c.holes);
const hole = (id: string) => ALL.find((h) => h.id === id)!;
/** A little test hole: a plain 60 × 100 box unless told otherwise. */
const mk = (d: Partial<HoleDef>): Hole =>
  defineHole({ id: 'lab', name: 'Lab', emoji: '🧪', par: 3, parTime: 10, tip: 'test', outer: box(0, 0, 60, 100), tee: { x: 30, y: 90 }, cup: { x: 30, y: 10 }, ...d }, 1, 'cx');

/** Roll until the putt is over (or the hole is). Returns the clock after. */
function rollOut(h: Hole, p: Putter, t: number, st: HoleState, check?: (b: Ball) => void): number {
  for (let i = 0; i < 30 / STEP && p.rolling && !p.done; i++) {
    advance(h, p, t, STEP, st);
    t += STEP;
    check?.(p.ball);
  }
  return t;
}
/** Step a loose ball for `sec` seconds from t0, collecting events. */
function run(h: Hole, b: Ball, sec: number, st: HoleState = newHoleState(h), t0 = 0): MgEvent[] {
  const ev: MgEvent[] = [];
  for (let i = 0; i < sec / STEP; i++) {
    const r = stepBall(h, b, t0 + i * STEP, STEP, st);
    ev.push(...r.events);
    if (r.result) break;
  }
  return ev;
}
const ball = (x: number, y: number, vx = 0, vy = 0): Ball => ({ x, y, vx, vy, z: 0, vz: 0 });
const speed = (b: Ball) => Math.hypot(b.vx, b.vy);

// ------------------------------------------------------------------ the courses

test('seven courses c1…c7 with names, emoji, stars and themes; c1 and c2 complete', () => {
  assert.deepEqual(COURSES.map((c) => c.id), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
  for (const [i, c] of COURSES.entries()) {
    assert.ok(c.name && c.emoji && c.blurb, c.id);
    assert.ok(c.stars >= 1 && c.stars <= 5, c.id);
    assert.ok(c.theme.turf && c.theme.accent && c.theme.art, c.id);
    assert.ok(c.holes.length >= 1 && c.holes.length <= HOLES_PER_COURSE, `${c.id} has ${c.holes.length} holes`);
    assert.equal(c.ready, c.holes.length === HOLES_PER_COURSE);
    assert.equal(c.par, c.holes.reduce((a, h) => a + h.par, 0));
    assert.equal(c.parTime, c.holes.reduce((a, h) => a + h.parTime, 0));
    assert.deepEqual(c.holes.map((h) => h.n), c.holes.map((_, k) => k + 1));
    if (i > 0) assert.ok(c.stars >= COURSES[i - 1].stars, 'stars never go down');
  }
  assert.ok(COURSE_BY_ID.c1.ready && COURSE_BY_ID.c2.ready, 'the first two courses are playable');
  assert.equal(new Set(ALL.map((h) => h.id)).size, ALL.length, 'hole ids are unique');
  // The old nine are all still here.
  for (const id of ['c1-walkup', 'c1-dogleg', 'c2-cab', 'c2-turnstile', 'c1-sand', 'c1-pond', 'c1-bow-bridge', 'c2-grate', 'c2-rock']) assert.ok(hole(id), id);
});

test('every authored hole is valid (geometry, links, nothing traps a ball)', () => {
  for (const h of ALL) assert.deepEqual(validateHole(h), [], h.id);
});

test('every authored hole is beatable: a sharp solver holes out within par + 2, in good time', () => {
  for (const h of ALL) {
    const r = solveHole(h, 1, seeded(h.n * 101 + h.id.length));
    assert.ok(r.sunk && !r.pickedUp, `${h.id}: holed out`);
    assert.ok(r.strokes <= h.par + 2, `${h.id}: ${r.strokes} strokes, par ${h.par}`);
    assert.ok(r.clock <= 12 + 10 * h.par, `${h.id}: took ${r.clock.toFixed(1)} s of hole clock`);
  }
});

test('a sharp round on course 1 is around par, an average one is believable', () => {
  const c = COURSE_BY_ID.c1;
  let sharp = 0;
  for (const h of c.holes) sharp += solveHole(h, 1, seeded(3 + h.n)).strokes;
  assert.ok(sharp <= c.par, `sharp ${sharp} vs par ${c.par}`);
  for (const h of c.holes.slice(0, 5)) {
    const r = solveHole(h, 0.5, seeded(7 + h.n));
    assert.ok(r.strokes <= maxStrokes(h), h.id);
  }
});

test('the ball never escapes the course across many random shots on every hole', () => {
  const rand = seeded(42);
  for (const h of ALL) {
    const st = newHoleState(h);
    const p = newPutter(h);
    let t = 0;
    for (let shot = 0; shot < 14; shot++) {
      if (p.done) Object.assign(p, newPutter(h));
      p.strokes = 0; // keep shooting (no pick-up)
      if (!atRest(p)) {
        p.ball.vx = p.ball.vy = 0;
        p.ball.z = p.ball.vz = 0;
      }
      assert.ok(putt(p, { angle: rand() * Math.PI * 2, power: 0.2 + rand() * 0.8 }));
      t = rollOut(h, p, t, st, (b) => {
        assert.ok(inBounds(h, b.x, b.y), `${h.id}: ball at ${b.x.toFixed(2)},${b.y.toFixed(2)} left the course`);
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
      });
      if (!p.done) assert.ok(!p.rolling, `${h.id}: every putt stops`);
      t += rand() * 2;
    }
  }
});

test('determinism: the same shot at the same clock lands in the same spot (state is never changed by a sim)', () => {
  for (const id of ['c2-cab', 'c2-push-to-cross', 'c3-canal-st', 'c4-brooklyn-gusts', 'c5-hard-hat', 'c6-penthouse-pinball']) {
    const h = hole(id);
    const st = newHoleState(h);
    const before = JSON.stringify(st);
    const a = simulate(h, h.tee, 1.7, { angle: -1.5, power: 0.7 }, st);
    const b = simulate(h, h.tee, 1.7, { angle: -1.5, power: 0.7 }, st);
    assert.deepEqual([a.x, a.y, a.sunk, a.water], [b.x, b.y, b.sunk, b.water], id);
    assert.equal(JSON.stringify(st), before, `${id}: simulate leaves the real state alone`);
  }
});

// ------------------------------------------------------------------ the old obstacles

test('lip-out: the cup takes a slow ball and spits out a fast one', () => {
  const h = hole('c1-walkup');
  const at = (sp: number, offset = 0) => {
    const b = ball(h.cup.x + offset, h.cup.y + 6, 0, -sp);
    let sunk = false, lip = false;
    for (let i = 0; i < 240 && !sunk; i++) {
      const r = stepBall(h, b, i * STEP, STEP);
      sunk = r.result === 'cup';
      lip ||= r.events.some((e) => e.type === 'lip');
      if (b.y < h.cup.y - CUP_R - 1) break;
    }
    return { sunk, lip };
  };
  assert.deepEqual(at(CUP_SPEED * 3), { sunk: false, lip: true });
  assert.deepEqual(at(CUP_SPEED * 3, 1.2), { sunk: false, lip: true });
  assert.equal(at(20).sunk, true);
  assert.equal(at(12, 0.8).sunk, true);
  const b = ball(h.cup.x + CUP_R + 0.6, h.cup.y);
  let sunk = false;
  for (let i = 0; i < 240 && !sunk; i++) sunk = stepBall(h, b, i * STEP, STEP).result === 'cup';
  assert.ok(sunk, 'resting on the lip drops');
});

test('water: a penalty stroke and the ball goes back where it was hit from', () => {
  const h = hole('c1-pond');
  const p = newPutter(h);
  const st = newHoleState(h);
  putt(p, { angle: -Math.PI / 2, power: 0.6 });
  let pen = false;
  for (let i = 0; i < 2000 && p.rolling; i++) pen ||= advance(h, p, i * STEP, STEP, st).some((e) => e.type === 'penalty');
  assert.ok(pen);
  assert.equal(p.strokes, 2);
  assert.deepEqual([p.ball.x, p.ball.y], [h.tee.x, h.tee.y]);
});

test('max strokes: picked up at 8 (par + 4 on a long hole)', () => {
  const h = hole('c1-walkup');
  const p = newPutter(h);
  p.strokes = MAX_STROKES - 1;
  putt(p, { angle: Math.PI / 2, power: 0.1 });
  rollOut(h, p, 0, newHoleState(h));
  assert.ok(p.done && p.pickedUp && !p.sunk);
  assert.equal(p.strokes, MAX_STROKES);
  assert.equal(putt(p, { angle: 0, power: 1 }), false);
  assert.equal(maxStrokes(mk({ par: 5 })), 9);
});

test('grate, sand, ramp, cab and turnstile still work', () => {
  const g = hole('c2-grate');
  const gr = g.grates[0];
  assert.ok(simulate(g, { x: gr.x, y: gr.y + 10 }, 0, { angle: -Math.PI / 2, power: 0.3 }).y < 44, 'grate pops out up top');
  const sand = hole('c1-sand');
  const z = sand.zones.find((q) => q.kind === 'sand' && q.poly)!;
  const y = (z.poly![0][1] + z.poly![2][1]) / 2;
  const onSand = simulate(sand, { x: 21, y }, 0, { angle: 0, power: 0.25 });
  const onGrass = simulate(sand, { x: 4, y: 80 }, 0, { angle: 0, power: 0.25 });
  assert.ok(onSand.x - 21 < (onGrass.x - 4) * 0.6);
  const ramp = hole('c1-bow-bridge');
  assert.equal(canRest(ramp, 25, 55), false);
  const soft = simulate(ramp, { x: 25, y: 76 }, 0, { angle: -Math.PI / 2, power: 0.35 });
  assert.ok(soft.y > 72 && canRest(ramp, soft.x, soft.y));
  const cab = hole('c2-cab');
  const mid = ball(25, 55);
  assert.ok(run(cab, mid, 6).some((e) => e.type === 'cab'), 'a ball in the cab’s path gets bumped');
  assert.ok(inBounds(cab, mid.x, mid.y));
  const ts = hole('c2-turnstile');
  const sp = ts.spinners[0];
  const b = ball(sp.x + sp.len - 2, sp.y + 3.5);
  assert.ok(run(ts, b, 6).some((e) => e.type === 'spin'));
});

// ------------------------------------------------------------------ the new obstacles

test('conveyor: a ball on the belt is carried downstream and settles off the end', () => {
  const h = mk({ conveyors: [{ poly: rect(10, 40, 40, 60), dir: 0, speed: 24 }] });
  assert.equal(canRest(h, 20, 50), false);
  const b = ball(14, 50);
  run(h, b, 0.8);
  assert.ok(b.vx > 15 && Math.abs(b.vy) < 1, `riding the belt (vx ${b.vx.toFixed(1)})`);
  run(h, b, 6, undefined, 0.8);
  assert.ok(b.x > 40 && speed(b) === 0, `came off the end and stopped (x ${b.x.toFixed(1)})`);
});

test('ice: the same putt goes much further on ice', () => {
  const icy = mk({ zones: [{ kind: 'ice', poly: rect(0, 0, 60, 100) }] });
  const plain = mk({});
  const a = simulate(icy, { x: 5, y: 50 }, 0, { angle: 0, power: 0.2 });
  const b = simulate(plain, { x: 5, y: 50 }, 0, { angle: 0, power: 0.2 });
  assert.ok(a.x - 5 > (b.x - 5) * 1.8, `ice ${(a.x - 5).toFixed(1)} vs turf ${(b.x - 5).toFixed(1)}`);
});

test('wind: a tell, then a gust that shoves a resting ball its way, then calm', () => {
  const w = { poly: rect(0, 30, 60, 70), dir: 0, force: 60, period: 5, on: 2, warn: 1.2 };
  const h = mk({ winds: [w] });
  assert.ok(windAt(w, 0.5).k > 0, 'blowing early in the cycle');
  assert.equal(windAt(w, 3).k, 0);
  assert.equal(windAt(w, 3).warn, false);
  assert.equal(windAt(w, 4.2).warn, true, 'the tell shows before it blows');
  const b = ball(20, 50);
  run(h, b, 0.7, undefined, 2.5); // calm: stays put
  assert.equal(b.x, 20);
  run(h, b, 1.5, undefined, 5); // the next gust
  assert.ok(b.x > 21, `shoved downwind (x ${b.x.toFixed(1)})`);
});

test('moving wall: glides by the clock and shoves what it meets, never through a wall', () => {
  const m = { a: { x: 6, y: 50 }, b: { x: 20, y: 50 }, dx: 30, dy: 0, period: 4, w: 6, kind: 'bus' as const };
  const h = mk({ movers: [m] });
  assert.deepEqual([moverAt(m, 0).ox, Math.round(moverAt(m, 2).ox)], [0, 30]);
  const b = ball(30, 50);
  const ev = run(h, b, 4);
  assert.ok(ev.some((e) => e.type === 'thud'), 'the bus hit it');
  assert.ok(inBounds(h, b.x, b.y));
});

test('timed gate: open, then shut (with a countdown), and a shut gate turns the ball back', () => {
  const g = { a: { x: 16, y: 50.5 }, b: { x: 44, y: 50.5 }, period: 4, open: 2 };
  const h = mk({ blocks: [rect(0, 48, 16, 53), rect(44, 48, 60, 53)], gates: [g] });
  assert.equal(gateAt(g, 1).shut, 0);
  assert.ok(Math.abs(gateAt(g, 1).left - 1) < 1e-9, 'counts down to shutting');
  assert.equal(gateAt(g, 3).shut, 1);
  assert.ok(gateAt(g, 2.15).shut > 0 && gateAt(g, 2.15).shut < 1, 'slides shut');
  const through = simulate(h, { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.5 });
  const blocked = simulate(h, { x: 30, y: 80 }, 2.3, { angle: -Math.PI / 2, power: 0.5 });
  assert.ok(through.y < 48, 'through while open');
  assert.ok(blocked.y > 53, 'turned back while shut');
});

test('trampolines and springs: out faster than in, but capped', () => {
  const h = mk({ bumpers: [{ x: 30, y: 40, r: 2.6, kind: 'trampoline' }] });
  const b = ball(30, 50, 0, -50);
  const ev = run(h, b, 0.3);
  assert.ok(ev.some((e) => e.type === 'bumper'));
  assert.ok(b.vy > 50 && speed(b) <= SPRING_MAX + 1, `bounced out at ${speed(b).toFixed(1)}`);
  const s = mk({ springs: [{ a: { x: 10, y: 40 }, b: { x: 50, y: 40 }, e: 1.5 }] });
  const c = ball(30, 42.4, 0, -40);
  run(s, c, 0.05);
  assert.ok(c.vy > 50, `spring rail: ${c.vy.toFixed(1)}`);
  const fast = ball(30, 50, 0, -124);
  run(s, fast, 0.1);
  assert.ok(fast.vy <= SPRING_MAX + 1, 'never over the cap');
});

test('magnets: one pulls a ball in, the other pushes it away', () => {
  const pull = mk({ magnets: [{ x: 30, y: 50, r: 12, strength: 60 }] });
  const a = ball(36, 50);
  run(pull, a, 2);
  assert.ok(Math.hypot(a.x - 30, a.y - 50) < 3, `pulled in (${a.x.toFixed(1)})`);
  const push = mk({ magnets: [{ x: 30, y: 50, r: 12, strength: -60 }] });
  const b = ball(34, 50);
  run(push, b, 2);
  assert.ok(b.x > 40, `pushed out (${b.x.toFixed(1)})`);
});

test('portals: same speed out of the other end, turned', () => {
  const h = mk({ portals: [{ a: { x: 30, y: 70 }, b: { x: 15, y: 25 }, turn: deg(90) }] });
  const b = ball(30, 80, 0, -60);
  let at: Ball | null = null, inSpeed = 0;
  for (let i = 0; i < 60 && !at; i++) {
    const e = stepBall(h, b, i * STEP, STEP).events.find((q) => q.type === 'portal');
    if (e) (at = { ...b }), (inSpeed = e.speed);
  }
  assert.ok(at, 'went through');
  assert.ok(Math.hypot(at!.x - 15, at!.y - 25) < 1.5, 'out at the other end');
  assert.ok(at!.vx > 50 && Math.abs(at!.vy) < 5, `heading turned 90° (vx ${at!.vx.toFixed(1)}, vy ${at!.vy.toFixed(1)})`);
  assert.ok(inSpeed > 50 && Math.abs(speed(at!) - inSpeed) < 1, `speed kept (${inSpeed.toFixed(1)} in, ${speed(at!).toFixed(1)} out)`);
});

test('flippers fire on a timer and launch a ball sitting on them', () => {
  const f = { x: 12, y: 60, len: 14, a0: deg(20), amp: deg(-50), period: 2.5, phase: 0.5, kind: 'flipper' as const };
  const h = mk({ arms: [f] });
  assert.ok(Math.abs(armAngle(f, 1.0) - f.a0) < 1e-9, 'resting');
  assert.ok(Math.abs(armAngle(f, 2.1) - (f.a0 + f.amp)) < 1e-9, 'up just after it fires');
  // Sit a ball just above the flipper's middle.
  const mx = f.x + Math.cos(f.a0) * 9, my = f.y + Math.sin(f.a0) * 9 - BALL_R - 0.6;
  const b = ball(mx, my);
  const ev = run(h, b, 2.3);
  assert.ok(ev.some((e) => e.type === 'flip'), 'flipped');
  const ev2: MgEvent[] = [];
  let top = 0;
  const b2 = ball(mx, my);
  for (let i = 0; i < 2.3 / STEP; i++) (ev2.push(...stepBall(h, b2, i * STEP, STEP).events), (top = Math.max(top, speed(b2))));
  assert.ok(top > 30, `launched at ${top.toFixed(1)}`);
});

test('crumbling wall: cracks, then breaks after N good knocks, then lets the ball through', () => {
  const h = mk({ blocks: [rect(0, 48, 16, 52), rect(44, 48, 60, 52)], crumbles: [{ poly: rect(16, 48, 44, 52), hits: 2 }] });
  const st = newHoleState(h);
  const first = simulate(h, { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.6 }, st);
  assert.ok(first.y > 52, 'bounced off');
  assert.equal(first.st.cracks[0], 1, 'one crack');
  const second = simulate(h, { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.6 }, first.st);
  assert.equal(second.st.cracks[0], 2);
  const third = simulate(h, { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.6 }, second.st);
  assert.ok(third.y < 48, 'through the rubble');
  // A soft nudge doesn't count.
  const soft = simulate(h, { x: 30, y: 56 }, 0, { angle: -Math.PI / 2, power: 0.05 }, st);
  assert.equal(soft.st.cracks[0], 0);
});

test('tide: rises and falls on its cycle, and a ball it catches takes a penalty', () => {
  const td = { x0: 0, y0: 40, x1: 60, y1: 60, from: 'top' as const, lo: 0, hi: 1, period: 6 };
  const h = mk({ tides: [td] });
  assert.equal(tideLevel(td, 0), 0);
  assert.ok(Math.abs(tideLevel(td, 3) - 1) < 1e-9);
  assert.ok(tideRect(td, 1.5)[3] > 40 && tideRect(td, 1.5)[3] < 60);
  // Resting on the dry part at t = 0; the water comes up over it.
  const p = newPutter(h);
  p.ball.x = 30;
  p.ball.y = 55;
  p.from = { x: 30, y: 85 };
  const st = newHoleState(h);
  let pen = false;
  for (let i = 0; i < 4 / STEP && !pen; i++) pen = advance(h, p, i * STEP, STEP, st).some((e) => e.type === 'penalty');
  assert.ok(pen, 'caught by the tide');
  assert.equal(p.strokes, 1);
  assert.deepEqual([p.ball.x, p.ball.y], [30, 85], 'back where it was hit from');
});

test('turntable: carries a resting ball round (same radius) and bends a rolling one', () => {
  const tt = { x: 30, y: 50, r: 14, omega: 1 };
  const h = mk({ turntables: [tt] });
  const b = ball(38, 50);
  run(h, b, 1);
  assert.ok(Math.abs(Math.hypot(b.x - 30, b.y - 50) - 8) < 0.05, 'same radius');
  assert.ok(Math.abs(Math.atan2(b.y - 50, b.x - 30) - 1) < 0.05, `turned by ω·t (${Math.atan2(b.y - 50, b.x - 30).toFixed(2)})`);
  const straight = simulate(mk({}), { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.6 });
  const bent = simulate(h, { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.6 });
  assert.ok(Math.abs(bent.x - straight.x) > 3, 'the spin bends a putt across it');
});

test('one-way gate: through one way, bounced the other', () => {
  const h = mk({ blocks: [rect(0, 48, 20, 53), rect(40, 48, 60, 53)], oneways: [{ a: { x: 20, y: 50.5 }, b: { x: 40, y: 50.5 }, dir: deg(-90) }] });
  const up = simulate(h, { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.5 });
  assert.ok(up.y < 48, 'up through it');
  const down = simulate(h, { x: 30, y: 20 }, 0, { angle: Math.PI / 2, power: 0.5 });
  assert.ok(down.y < 50, 'bounced back up');
});

test('moving cup: slides on its track by the clock and still takes a ball', () => {
  const h = mk({ cup: { x: 15, y: 20 }, cupTrack: { x: 45, y: 20, period: 6 } });
  assert.deepEqual([cupAt(h, 0).x, Math.round(cupAt(h, 3).x)], [15, 45]);
  // A ball resting where the cup will pass drops in when it arrives.
  const p = newPutter(h);
  p.ball.x = 30;
  p.ball.y = 20;
  const st = newHoleState(h);
  for (let i = 0; i < 3 / STEP && !p.done; i++) advance(h, p, i * STEP, STEP, st);
  assert.ok(p.sunk, 'the cup came to it');
});

test('jump: fast over the lip flies the water and a hedge and lands; slow rolls back', () => {
  const h = mk({
    outer: box(0, 0, 60, 130),
    zones: [{ kind: 'water', poly: rect(0, 56, 60, 68) }],
    low: [rect(10, 46, 50, 48)],
    jumps: [{ x: 30, y: 76, dir: deg(-90), w: 12, len: 10, minSpeed: 40 }],
    tee: { x: 30, y: 115 },
  });
  const b = ball(30, 100, 0, -110);
  const ev = run(h, b, 3);
  assert.ok(ev.some((e) => e.type === 'jump') && ev.some((e) => e.type === 'land'), 'flew and landed');
  assert.ok(!ev.some((e) => e.type === 'water'), 'cleared the water');
  assert.ok(b.y < 46, `cleared the hedge (y ${b.y.toFixed(1)})`);
  const slow = simulate(h, { x: 30, y: 92 }, 0, { angle: -Math.PI / 2, power: 0.25 });
  assert.ok(slow.y > 76 && !slow.water, 'too slow: back down the ramp');
  // A rolling ball can't clear the hedge.
  const roll = mk({ low: [rect(10, 46, 50, 48)] });
  assert.ok(simulate(roll, { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.6 }).y > 48);
});

test('switch: rolling over it flips it; a linked door opens; again and it shuts; once stays on', () => {
  const base: Partial<HoleDef> = {
    blocks: [rect(0, 48, 20, 53), rect(40, 48, 60, 53)],
    gates: [{ a: { x: 20, y: 50.5 }, b: { x: 40, y: 50.5 }, kind: 'door', sw: { id: 'A', active: 'off' } }],
    switches: [{ id: 'A', x: 30, y: 70 }],
  };
  const h = mk(base);
  const st = newHoleState(h);
  assert.equal(gateAt(h.gates[0], 0, st).shut, 1, 'door shut to start');
  const r = simulate(h, { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.6 }, st);
  assert.equal(r.st.sw.A, true, 'flipped on');
  assert.ok(r.y < 48, 'and the door opened in time to roll through');
  const back = simulate(h, { x: 30, y: 40 }, 0, { angle: Math.PI / 2, power: 0.5 }, r.st);
  assert.equal(back.st.sw.A, false, 'rolled back over: off again');
  const once = mk({ ...base, switches: [{ id: 'A', x: 30, y: 70, mode: 'once' }] });
  const a = simulate(once, { x: 30, y: 80 }, 0, { angle: -Math.PI / 2, power: 0.6 });
  const b2 = simulate(once, { x: 30, y: 40 }, 0, { angle: Math.PI / 2, power: 0.5 }, a.st);
  assert.equal(b2.st.sw.A, true, 'once: stays on');
});

test('trains loop across at a steady speed and come back round', () => {
  const c = { ax: -40, ay: 50, bx: 160, by: 50, w: 26, h: 9, period: 7, phase: 0, mode: 'loop' as const, kind: 'train' as const };
  assert.equal(cabAt(c, 0).x, -40);
  assert.ok(Math.abs(cabAt(c, 3.5).x - 60) < 1e-9);
  assert.ok(Math.abs(cabAt(c, 7).x + 40) < 1e-6, 'round again');
  assert.equal(cabAt(c, 1).vx, 200 / 7);
  assert.ok(isTimed(hole('c3-canal-st')));
});

test('the planner waits for its moment on a timed hole', () => {
  // A gate that is shut now and opens in 1.4 s: the planned putt waits (or still gets there).
  const h = mk({ blocks: [rect(0, 48, 22, 53), rect(38, 48, 60, 53)], gates: [{ a: { x: 22, y: 50.5 }, b: { x: 38, y: 50.5 }, period: 4, open: 1.6, phase: 1 }] });
  const st = newHoleState(h);
  const shot = planShot(h, h.tee, 0, 1, seeded(5), st);
  const r = simulate(h, h.tee, shot.wait, shot, st);
  assert.ok(r.y < 48 || r.sunk, `the planned putt gets through the gate (wait ${shot.wait})`);
});

// ------------------------------------------------------------------ scoring

test('score: par strokes in par time = 1000; time counts 60 %, strokes 40 %; each half caps at 2×', () => {
  assert.equal(roundScore(30, 30, 100, 100), 1000);
  assert.deepEqual(scoreParts(30, 30, 100, 100), { strokePart: 400, timePart: 600, score: 1000 });
  // Saving 10 % of the time beats saving 10 % of the strokes.
  assert.ok(roundScore(30, 30, 100, 90) > roundScore(30, 27, 100, 100));
  assert.ok(roundScore(30, 30, 100, 50) > roundScore(30, 15, 100, 100));
  // Caps.
  assert.equal(roundScore(30, 1, 100, 0.01), SCORE_MAX);
  assert.equal(roundScore(30, 15, 100, 50), 2000);
  assert.equal(roundScore(30, 30, 100, 20), 400 + 1200);
  // Worse is lower, never negative.
  assert.ok(roundScore(30, 31, 100, 100) < 1000 && roundScore(30, 30, 100, 101) < 1000);
  assert.ok(roundScore(30, 80, 100, 600) > 0);
  // A picked-up hole charges at least twice its par time.
  assert.equal(holeTime(3, 10, true), 20);
  assert.equal(holeTime(25, 10, true), 25);
  assert.equal(holeTime(3, 10, false), 3);
  // So slapping every hole to a pick-up in no time scores far below a par round.
  const c = COURSE_BY_ID.c1;
  const spam = roundScore(c.par, c.holes.reduce((a, h) => a + maxStrokes(h), 0), c.parTime, c.holes.reduce((a, h) => a + holeTime(1, h.parTime, true), 0));
  assert.ok(spam < 600, `spam scores ${spam}`);
});

test('stamps and to-par', () => {
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

test('finishMinigolf: per-course best (score, strokes, time), unlocks, fun and a moodlet under par', () => {
  const s = life();
  s.needs.fun = 40;
  s.needs.social = 40;
  assert.equal(courseUnlocked(s, 0), true);
  assert.equal(courseUnlocked(s, 1), false, 'Midtown is locked to start');
  const c1 = COURSE_BY_ID.c1;
  const a = finishMinigolf(s, { course: 'c1', strokes: c1.par + 3, par: c1.par, time: c1.parTime * 1.2, parTime: c1.parTime });
  assert.equal(a.score, roundScore(c1.par, c1.par + 3, c1.parTime, c1.parTime * 1.2));
  assert.equal(a.best, true);
  assert.equal(a.underPar, false);
  assert.ok(s.needs.fun > 40 && s.needs.social > 40);
  assert.equal(courseUnlocked(s, 1), true, 'finishing the park opens Midtown (any score)');
  assert.equal(courseUnlocked(s, 2), false);
  const b = finishMinigolf(s, { course: 'c1', strokes: c1.par - 2, par: c1.par, time: c1.parTime * 0.8, parTime: c1.parTime, aces: 1, versus: true });
  assert.ok(b.best && b.underPar && b.score > a.score);
  assert.ok(s.moodlets.some((m) => m.id === 'minigolf'));
  const worse = finishMinigolf(s, { course: 'c1', strokes: c1.par + 9, par: c1.par, time: 999, parTime: c1.parTime });
  assert.equal(worse.best, false);
  assert.deepEqual(courseRecord(s, 'c1'), { best: b.score, strokes: c1.par - 2, time: Math.round(c1.parTime * 0.8 * 10) / 10, rounds: 3 });
  assert.equal(minigolfOf(s)!.aces, 1);
  assert.equal(s.fun!.best.golf1, b.score, 'the offline 🏆 board sees it');
  assert.equal(boardId('c7'), 'golf7');
});

test('old saves (the nine-hole record) still load, and their players skip to Midtown', () => {
  const s = life();
  (s as unknown as { minigolf: unknown }).minigolf = { best: 24, bestScore: 210, rounds: 3, aces: 1 };
  const loaded = JSON.parse(JSON.stringify(s)) as typeof s;
  assert.deepEqual(minigolfOf(loaded), { best: 24, bestScore: 210, rounds: 3, aces: 1 });
  assert.equal(courseRecord(loaded, 'c1'), undefined);
  assert.equal(courseUnlocked(loaded, 1), true, 'they played Midtown’s holes already');
  assert.equal(courseUnlocked(loaded, 2), false);
  const r = finishMinigolf(loaded, { course: 'c2', strokes: 30, par: 30, time: 100, parTime: 100 });
  assert.equal(r.score, 1000);
  const rec = minigolfOf(loaded)!;
  assert.equal(rec.best, 24, 'old fields kept');
  assert.equal(rec.rounds, 4);
  assert.equal(rec.bestScore, 1000);
  assert.equal(courseUnlocked(loaded, 2), true);
});

test('leaderboards: one per course, golf1…golf7, capped on the server at the score ceiling', () => {
  for (const c of COURSES) {
    const id = boardId(c.id);
    assert.match(id, /^golf[1-7]$/);
    assert.equal(RULES.scoreGames[id], SCORE_MAX, id);
  }
});

test('tee and cup sit clear of the walls on every hole', () => {
  for (const h of ALL) for (const p of [h.tee, h.cup]) assert.ok(wallDistance(h, p.x, p.y) > BALL_R + 2, h.id);
});
