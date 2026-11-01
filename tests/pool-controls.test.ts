// Pool controls: drag-to-aim damping and the pull-down power meter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimDrag, aimGain, FINE_DIST, MIN_GAIN, MIN_POWER, meterPower, meterRelease, wrapAngle } from '../src/ui/pool-controls.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('wrapAngle folds into (-π, π]', () => {
  near(wrapAngle(0), 0);
  near(wrapAngle(Math.PI * 3), Math.PI);
  near(wrapAngle(-Math.PI), Math.PI);
  near(wrapAngle(Math.PI * 2 + 0.1), 0.1);
  near(wrapAngle(-0.1 - Math.PI * 4), -0.1);
});

test('aim is damped near the cue ball and full strength further out', () => {
  near(aimGain(0), MIN_GAIN);
  near(aimGain(FINE_DIST / 2), 0.5);
  near(aimGain(FINE_DIST), 1);
  near(aimGain(FINE_DIST * 3), 1);
  // A 0.2 rad turn of the finger close in moves the cue less than far out.
  const close = aimDrag(0, 0, 0.2, 4);
  const far = aimDrag(0, 0, 0.2, 30);
  assert.ok(close > 0 && close < far);
  near(far, 0.2);
});

test('aim drag follows the shortest way round across ±π', () => {
  // Finger crosses from just under π to just over -π: a small positive turn.
  near(aimDrag(1, Math.PI - 0.05, -Math.PI + 0.05, 40), 1.1);
  // And the aim itself wraps.
  near(aimDrag(Math.PI - 0.05, 0, 0.1, 40), -Math.PI + 0.05);
});

test('meter pull maps to power and clamps', () => {
  near(meterPower(0, 200), 0);
  near(meterPower(100, 200), 0.5);
  near(meterPower(400, 200), 1);
  near(meterPower(-50, 200), 0);
  near(meterPower(50, 0), 0);
  near(meterPower(NaN, 200), 0);
});

test('letting go almost at zero cancels instead of shooting', () => {
  assert.equal(meterRelease(0), 'cancel');
  assert.equal(meterRelease(MIN_POWER / 2), 'cancel');
  assert.equal(meterRelease(MIN_POWER), 'shoot');
  assert.equal(meterRelease(1), 'shoot');
});
