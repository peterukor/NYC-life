// 🪓 Axe Throwing: where a swipe lands, stick or bounce, scoring, tickets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AXE_BOARD, AXE_CX, AXE_CY, AXE_GAIN, AXE_HAND, AXE_KILLS, AXE_MAX, AXE_RINGS, AXE_STICK_TOL, AXE_SWEET, AXE_THROWS,
  axeAim, axeBullBonus, axeScore, axeSpin, axeSpinVerdict, axeSticks, axeTickets, axeZone,
} from '../src/sim/axe.ts';
import { ARCADE_BY_ID } from '../src/sim/arcade.ts';

test('zones: bull, rings 5..1, wood, kill dots, off the board', () => {
  assert.deepEqual(axeZone(AXE_CX, AXE_CY), { zone: 'bull', ring: 6 });
  assert.deepEqual(axeZone(AXE_CX + AXE_RINGS[0], AXE_CY), { zone: 'bull', ring: 6 }); // on the line counts
  for (let i = 1; i < AXE_RINGS.length; i++) {
    const mid = (AXE_RINGS[i] + AXE_RINGS[i - 1]) / 2;
    assert.deepEqual(axeZone(AXE_CX, AXE_CY + mid), { zone: 'ring', ring: 6 - i });
  }
  assert.equal(axeZone(AXE_CX + AXE_RINGS[5] + 5, AXE_CY).zone, 'wood');
  for (const k of AXE_KILLS) assert.equal(axeZone(k.x, k.y).zone, 'kill');
  assert.equal(axeZone(AXE_BOARD.x0 - 1, AXE_CY).zone, 'off');
  assert.equal(axeZone(AXE_CX, AXE_BOARD.y0 - 1).zone, 'off');
});

test('kill dots sit on the board, clear of the rings', () => {
  for (const k of AXE_KILLS) {
    assert.ok(Math.hypot(k.x - AXE_CX, k.y - AXE_CY) > AXE_RINGS[5] + 15);
    assert.ok(k.x > AXE_BOARD.x0 && k.x < AXE_BOARD.x1 && k.y > AXE_BOARD.y0);
  }
});

test('spin: the sweet speed is one turn and sticks; too slow or fast bounces', () => {
  assert.equal(axeSpin(AXE_SWEET), 1);
  assert.equal(axeSpin(-50), 0);
  assert.ok(axeSticks(1));
  assert.ok(axeSticks(1 + AXE_STICK_TOL));
  assert.ok(axeSticks(1 - AXE_STICK_TOL));
  assert.ok(!axeSticks(axeSpin(AXE_SWEET * 0.6)));
  assert.ok(!axeSticks(axeSpin(AXE_SWEET * 1.5)));
  assert.equal(axeSpinVerdict(0.5), 'slow');
  assert.equal(axeSpinVerdict(1.6), 'fast');
  assert.equal(axeSpinVerdict(1.05), 'good');
});

test('aim: a straight swipe of the right length hits the bull; a bent one hooks', () => {
  const dy = (AXE_CY - AXE_HAND.y) / AXE_GAIN;
  const p = axeAim(0, dy);
  assert.equal(p.x, AXE_CX);
  assert.equal(p.y, AXE_CY);
  assert.equal(axeAim(0, dy, 0.03).x, AXE_CX); // a little wobble is forgiven
  assert.ok(axeAim(0, dy, 0.2).x > AXE_CX + 10); // bowed right, drifts right
  assert.ok(axeAim(0, dy, -0.2).x < AXE_CX - 10);
  const q = axeAim(0, dy, 0, 5, -3); // sway adds on
  assert.deepEqual(q, { x: AXE_CX + 5, y: AXE_CY - 3 });
});

test('scoring: rings, bull, a bounce scores 0', () => {
  const mid = (i: number) => AXE_CY + (AXE_RINGS[i] + AXE_RINGS[i - 1]) / 2;
  assert.equal(axeScore(AXE_CX, mid(1), 1, false, 0).pts, 5);
  assert.equal(axeScore(AXE_CX, mid(5), 1, false, 0).pts, 1);
  const b = axeScore(AXE_CX, AXE_CY, 1, false, 0);
  assert.deepEqual([b.pts, b.streak, b.zone, b.stuck], [6, 1, 'bull', true]);
  const bounce = axeScore(AXE_CX, AXE_CY, 0.5, false, 3);
  assert.deepEqual([bounce.pts, bounce.streak, bounce.stuck, bounce.why], [0, 0, false, 'bounce']);
  const off = axeScore(5, 5, 1, false, 0);
  assert.deepEqual([off.pts, off.why], [0, 'off']);
  const wood = axeScore(AXE_CX + AXE_RINGS[5] + 5, AXE_CY, 1, false, 2);
  assert.deepEqual([wood.pts, wood.stuck, wood.streak, wood.why], [0, true, 0, 'wood']);
});

test('bull combo: +2, +4, then +6 a throw; anything else resets it', () => {
  assert.deepEqual([1, 2, 3, 4, 7].map(axeBullBonus), [0, 2, 4, 6, 6]);
  let streak = 0, total = 0;
  for (let i = 0; i < 3; i++) {
    const r = axeScore(AXE_CX, AXE_CY, 1, false, streak);
    streak = r.streak;
    total += r.pts;
  }
  assert.equal(total, 6 + 8 + 10);
  const ring = axeScore(AXE_CX, AXE_CY + 40, 1, false, streak);
  assert.equal(ring.streak, 0);
  assert.equal(ring.bonus, 0);
});

test('kill shots: 8 only when called; a missed call or an uncalled hit is 0', () => {
  const k = AXE_KILLS[1];
  assert.equal(axeScore(k.x, k.y, 1, true, 0).pts, 8);
  const missed = axeScore(AXE_CX, AXE_CY, 1, true, 2); // a bull, but you called the kill
  assert.deepEqual([missed.pts, missed.why, missed.streak], [0, 'missedCall', 0]);
  const uncalled = axeScore(k.x, k.y, 1, false, 0);
  assert.deepEqual([uncalled.pts, uncalled.why], [0, 'uncalled']);
  assert.equal(axeScore(k.x, k.y, 1.6, true, 0).pts, 0); // called, but bounced
});

test('max score, the server cap and tickets', () => {
  assert.equal(AXE_THROWS, 10);
  assert.equal(AXE_MAX, 108);
  assert.ok(AXE_MAX >= 8 * AXE_THROWS); // ten kill shots can't beat ten bulls
  assert.equal(axeTickets(0), 0);
  assert.equal(axeTickets(-5), 0);
  assert.equal(axeTickets(54), 40); // a good game
  assert.equal(axeTickets(AXE_MAX), 81);
  assert.equal(ARCADE_BY_ID.axe.tickets(54), 40);
  assert.equal(ARCADE_BY_ID.axe.emoji, '🪓');
});
