// 🏀 Hoop Shot and 🧸 Claw Machine, rebuilt: shot physics, aim and forgiveness,
// scoring and tickets; the claw's grip, load and slip, a stable pile, whole games.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIM_TOL, BOARD, FLIGHT_T, HOOPS_TIME, LAUNCH, LAUNCH_SY, POWER_TOL, RIM, RIM_SY, SWEET, aimX, forgive, hoopAmp, hoopRound, hoopX,
  hoopsLaunch, hoopsPoints, hoopsSimulate, hoopsTickets, isMoneyBall, missHint, project, scaleAt,
} from '../src/sim/arcade-hoops.ts';
import {
  A_CLOSED, A_OPEN, CAB, ClawGame, PLUSH, PLUSH_BY_ID, TRIES, clawGrip, clawLoad, clawTickets, com, finger, prizeValue, type ClawEvent,
} from '../src/sim/arcade-claw.ts';

/** A small seeded random. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mid = () => 0.5;
const shot = (power: number, slope = 0, opts: { fire?: boolean; x0?: number; target?: number } = {}) =>
  hoopsSimulate(hoopsLaunch({ x0: opts.x0 ?? 0, slope, speed: SWEET * power }, opts.target ?? 0, { fire: opts.fire, rand: mid }));
/** The screen slope that points from a ball held at x0 at a rim at x. */
const slopeAt = (x: number, x0 = 0) => (x * scaleAt(RIM.Z) - x0 * scaleAt(LAUNCH.Z)) / (LAUNCH_SY - RIM_SY);

// ================================================================== 🏀 hoops
test('hoops camera: the ball starts low and big, the rim is up the lane and smaller', () => {
  const ball = project(0, LAUNCH.Y, LAUNCH.Z), rim = project(0, RIM.Y, RIM.Z);
  assert.ok(ball.y > 300 && ball.y < 400, `ball at y ${ball.y}`);
  assert.ok(rim.y > 120 && rim.y < 240, `rim at y ${rim.y}`);
  assert.ok(ball.s > rim.s * 1.5, 'perspective: things shrink down the lane');
  assert.ok(FLIGHT_T > 0.8 && FLIGHT_T < 1.2, 'about a second in the air');
});

test('hoops aim: swipe at the rim and you aim at the rim, from anywhere you hold the ball', () => {
  for (const x0 of [-LAUNCH.XMAX, 0, LAUNCH.XMAX]) for (const x of [-0.4, 0, 0.3]) assert.ok(Math.abs(aimX(x0, slopeAt(x, x0)) - x) < 1e-9);
});

test('hoops forgiveness: small errors shrink, big ones count in full, and it is continuous', () => {
  assert.equal(forgive(0, 0.1), 0);
  assert.ok(Math.abs(forgive(0.05, 0.1)) < 0.05);
  assert.ok(Math.abs(forgive(0.1 + 1e-9, 0.1) - forgive(0.1, 0.1)) < 1e-6);
  assert.ok(Math.abs(forgive(0.5, 0.1) - forgive(0.4, 0.1) - 0.1) < 1e-9, 'one-for-one past the tolerance');
  assert.equal(forgive(-0.3, 0.1), -forgive(0.3, 0.1));
});

test('hoops physics: a dead-on flick swishes; anywhere in the sweet spot drops', () => {
  const s = shot(1);
  assert.deepEqual([s.made, s.swish, s.rim, s.board], [true, true, 0, 0]);
  for (const p of [1 - POWER_TOL, 1 - POWER_TOL / 2, 1 + POWER_TOL / 2, 1 + POWER_TOL]) assert.ok(shot(p).made, `power ${p}`);
  const tolSlope = (AIM_TOL * scaleAt(RIM.Z)) / (LAUNCH_SY - RIM_SY);
  for (const sl of [-tolSlope, tolSlope]) assert.ok(shot(1, sl).made, `slope ${sl}`);
});

test('hoops physics: way short is an airball or front rim, way off-line misses, way long hits the glass', () => {
  const short = shot(0.6);
  assert.equal(short.made, false);
  assert.ok(!shot(1, 0.3).made && !shot(1, -0.3).made);
  const long = shot(1.4);
  assert.equal(long.made, false);
  assert.ok(long.board > 0 || long.rim > 0, 'a long one hits iron or glass');
});

test('hoops physics: the rim rattles, the glass banks (both happen across the range)', () => {
  let rattle = 0, bank = 0, swish = 0, miss = 0;
  for (let p = 0.6; p <= 1.6; p += 0.02) {
    for (const sl of [-0.12, -0.06, 0, 0.06, 0.12]) {
      const s = shot(p, sl);
      if (s.swish) swish++;
      else if (s.bank) bank++;
      else if (s.made && s.rim) rattle++;
      else if (!s.made) miss++;
    }
  }
  assert.ok(rattle > 0 && bank > 0 && swish > 0 && miss > 0, JSON.stringify({ rattle, bank, swish, miss }));
});

test('hoops on fire: a wider sweet spot turns a near miss into a bucket', () => {
  assert.equal(shot(0.75).made, false);
  assert.equal(shot(0.75, 0, { fire: true }).made, true);
});

test('hoops misses come with the right hint', () => {
  assert.equal(missHint({ ePower: -0.4, eAim: 0 }), 'short');
  assert.equal(missHint({ ePower: 0.4, eAim: 0 }), 'long');
  assert.equal(missHint({ ePower: 0, eAim: -0.3 }), 'left');
  assert.equal(missHint({ ePower: 0, eAim: 0.3 }), 'right');
  assert.equal(missHint({ ePower: 0.01, eAim: 0.01 }), null);
});

test('hoops rounds: still for 20 s, then it slides, faster from 40 s; lead it to score', () => {
  assert.equal(hoopX(5), 0);
  assert.equal(hoopX(19.9), 0);
  assert.deepEqual([hoopRound(0), hoopRound(25), hoopRound(50)], [1, 2, 3]);
  assert.ok(hoopAmp(30) > 0 && hoopAmp(50) > hoopAmp(30));
  for (let t = 0; t < 90; t += 0.37) assert.ok(Math.abs(hoopX(t)) <= 0.45 + 1e-9);
  // The glass never leaves the cage.
  assert.ok(0.45 + BOARD.HW < 1.3);
  // Mid-slide in round 3: aiming where the hoop is now misses, leading it scores.
  const t = 45 - FLIGHT_T / 2;
  const target = hoopX(t + FLIGHT_T);
  const fly = (aim: number) => hoopsSimulate(hoopsLaunch({ x0: 0, slope: slopeAt(aim), speed: SWEET }, target, { rand: mid }), (dt) => hoopX(t + dt));
  assert.ok(Math.abs(hoopX(t) - target) > 0.25, 'the hoop moves a lot in one flight');
  assert.equal(fly(hoopX(t)).made, false);
  assert.equal(fly(target).made, true);
});

test('hoops scoring: 2, a swish 3, ×2 for each of money ball, on fire, bonus time', () => {
  assert.equal(hoopsPoints({}), 2);
  assert.equal(hoopsPoints({ swish: true }), 3);
  assert.equal(hoopsPoints({ money: true }), 4);
  assert.equal(hoopsPoints({ swish: true, money: true, fire: true, bonus: true }), 24);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map(isMoneyBall), [false, false, false, false, true, false, true]);
});

test('hoops tickets: a good game (~200) pays ~40, a flawless one under 100, never negative', () => {
  assert.equal(hoopsTickets(0), 0);
  assert.equal(hoopsTickets(-5), 0);
  assert.ok(Math.abs(hoopsTickets(204) - 40) <= 1);
  assert.ok(hoopsTickets(1100) < 100);
  for (let s = 0; s < 2000; s += 7) assert.ok(hoopsTickets(s + 7) >= hoopsTickets(s));
  assert.equal(HOOPS_TIME, 60);
});

test('hoops is deterministic for a given random', () => {
  const a = hoopsLaunch({ x0: 0.1, slope: 0.02, speed: 1500 }, 0, { rand: seeded(3) });
  const b = hoopsLaunch({ x0: 0.1, slope: 0.02, speed: 1500 }, 0, { rand: seeded(3) });
  assert.deepEqual(a, b);
});

// =================================================================== 🧸 claw
const base = { offset: 0, hw: 20, depth: 0.3, fabric: 1, mass: 1, swing: 0, swingV: 0, power: 1 };

test('claw grip: centred, deep, calm, light and fuzzy is strong; each flaw weakens it', () => {
  const g0 = clawGrip(base);
  assert.ok(g0 > 0.7 && g0 <= 1);
  assert.ok(clawGrip({ ...base, offset: 8 }) < g0);
  assert.ok(clawGrip({ ...base, offset: 16 }) < clawGrip({ ...base, offset: 8 }));
  assert.equal(clawGrip({ ...base, offset: 8 }), clawGrip({ ...base, offset: -8 }));
  assert.ok(clawGrip({ ...base, depth: -0.8 }) < g0, 'fingertips above the middle');
  assert.ok(clawGrip({ ...base, swing: 0.15 }) < g0, 'still swinging');
  assert.ok(clawGrip({ ...base, mass: 1.5 }) < g0, 'heavy');
  assert.ok(clawGrip({ ...base, fabric: 0.6 }) < g0, 'slippery');
  assert.ok(clawGrip({ ...base, power: 0.85 }) < g0, 'a weak claw this go');
  for (const k of [{ offset: 99 }, { depth: -9 }, { swing: 9 }, { mass: 9 }]) {
    const v = clawGrip({ ...base, ...k });
    assert.ok(v >= 0 && v <= 1);
  }
});

test('claw load: weight, jolts, an off-centre grab and the jerk at the top all add up', () => {
  const l0 = clawLoad({ mass: 1, accel: 0, offCentre: 0, jerk: 0 });
  assert.ok(clawLoad({ mass: 1.4, accel: 0, offCentre: 0, jerk: 0 }) > l0);
  assert.ok(clawLoad({ mass: 1, accel: 800, offCentre: 0, jerk: 0 }) > l0);
  assert.ok(clawLoad({ mass: 1, accel: 0, offCentre: 15, jerk: 0 }) > l0);
  assert.ok(clawLoad({ mass: 1, accel: 0, offCentre: 0, jerk: 0.2 }) > l0);
});

test('claw fingers: open wide, closed they cross under the palm', () => {
  const [, lo] = finger(180, 200, 0, -1, A_OPEN), [, ro] = finger(180, 200, 0, 1, A_OPEN);
  const [, lc] = finger(180, 200, 0, -1, A_CLOSED), [, rc] = finger(180, 200, 0, 1, A_CLOSED);
  assert.ok(ro.x1 - lo.x1 > 40, 'open span');
  assert.ok(rc.x1 - lc.x1 < 0, 'closed tips cross');
  assert.ok(lo.y1 > 200 && ro.y1 > 200);
});

test('claw pile: settles in the cabinet, nothing in the chute, nothing moving, same seed same pile', () => {
  const g = new ClawGame(seeded(7));
  assert.ok(g.bodies.length >= 10);
  assert.ok(g.bodies.filter((b) => b.shiny).length >= 1, 'at least one ✨ shiny');
  for (const b of g.bodies) {
    const c = com(b);
    assert.ok(c.x > CAB.WALL_X && c.x < CAB.R && c.y < CAB.FLOOR && c.y > CAB.RAIL, `${b.kind.id} at ${c.x},${c.y}`);
  }
  for (let i = 0; i < 60; i++) g.step(1 / 60, { dir: 0, target: null, drop: false });
  for (const b of g.bodies) for (const p of b.ps) assert.ok(Math.hypot(p.x - p.px, p.y - p.py) < 1.5, 'at rest');
  const h = new ClawGame(seeded(7));
  assert.deepEqual(h.bodies.map((b) => [b.kind.id, Math.round(com(b).x)]), new ClawGame(seeded(7)).bodies.map((b) => [b.kind.id, Math.round(com(b).x)]));
});

/** One try at a single prize alone in the box: aim `off` px from its middle, drop once settled. */
function lone(id: string, off: number, power: number): { events: ClawEvent['kind'][]; score: number } {
  const g = new ClawGame(() => power, { count: 0, settle: 0 });
  const b = g.add(PLUSH_BY_ID[id], 220, 380);
  for (let i = 0; i < 120; i++) g.physics(1 / 60);
  const x = com(b).x + off;
  const events: ClawEvent['kind'][] = [];
  for (let f = 0; f < 60 * 20 && g.try === 1; f++) {
    g.step(1 / 60, { dir: 0, target: x, drop: f > 120 && Math.abs(g.gx - x) < 0.5 && Math.abs(g.gv) < 2 });
    for (const e of g.events) events.push(e.kind);
    g.events.length = 0;
  }
  return { events, score: g.score };
}

test('claw: a centred grab on a teddy carries it to the chute; way off-centre it slips', () => {
  const good = lone('bear', 0, 0.5);
  assert.ok(good.events.includes('grab') && good.events.includes('win') && !good.events.includes('slip'), good.events.join(','));
  assert.equal(good.score, 20);
  const bad = lone('bear', 14, 0.5);
  assert.ok(bad.events.includes('slip') || bad.events.includes('whiff'), bad.events.join(','));
  assert.equal(bad.score, 0);
});

test('claw: the big prize needs a centred grab AND a strong claw', () => {
  assert.equal(lone('liberty', 0, 0.9).score, 40);
  assert.equal(lone('liberty', 0, 0.1).score, 0);
  assert.equal(lone('liberty', 6, 0.9).score, 0);
});

test('claw: a whole game is three tries, then over, and the score is what went down the chute', () => {
  const g = new ClawGame(seeded(11));
  const won: number[] = [];
  let over = 0, tries = 0, maxRise = 0;
  const y0 = new Map(g.bodies.map((b) => [b, com(b).y]));
  const touched = new Set<unknown>();
  for (let f = 0; f < 60 * 120 && g.phase !== 'over'; f++) {
    // Aim at the highest prize and drop once over it.
    const top = g.bodies.filter((b) => com(b).x > CAB.WALL_X + 20).sort((a, b) => com(a).y - com(b).y)[0];
    const x = top ? com(top).x : 200;
    g.step(1 / 60, { dir: 0, target: x, drop: g.phase === 'aim' && Math.abs(g.gx - x) < 1 && Math.abs(g.gv) < 3 });
    if (g.held) touched.add(g.held);
    for (const e of g.events) {
      if (e.kind === 'win') won.push(e.value);
      if (e.kind === 'slip') touched.add(e.body);
      if (e.kind === 'tryEnd') tries++;
      if (e.kind === 'over') over++;
    }
    g.events.length = 0;
    for (const b of g.bodies) if (!touched.has(b)) maxRise = Math.max(maxRise, y0.get(b)! - com(b).y);
  }
  assert.equal(over, 1);
  assert.equal(tries, TRIES);
  assert.equal(g.score, won.reduce((a, b) => a + b, 0));
  assert.ok(maxRise < 60, `nothing the claw didn't touch flies up (rose ${Math.round(maxRise)} px)`);
});

test('claw prizes: values, shiny doubles, tickets ⅘ of a point', () => {
  for (const k of PLUSH) assert.ok(k.value > 0 && k.fabric > 0 && k.fabric <= 1 && k.mass > 0 && k.parts.length >= 1);
  assert.equal(new Set(PLUSH.map((k) => k.emoji)).size, PLUSH.length, 'one emoji per prize');
  assert.equal(prizeValue({ kind: PLUSH_BY_ID.bear, shiny: false }), 20);
  assert.equal(prizeValue({ kind: PLUSH_BY_ID.bear, shiny: true }), 40);
  assert.equal(clawTickets(50), 40);
  assert.equal(clawTickets(-3), 0);
});
