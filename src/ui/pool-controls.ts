// =====================================================================
// pool-controls.ts — the maths behind the pool controls (ui/pool.ts),
// kept free of the DOM so the tests can reach it.
//
//   • Aim: drag anywhere on the table and the cue turns round the cue ball
//     like a dial. Close to the ball the turn is damped, so a small finger
//     move is a small nudge; further out it is finer still.
//   • Power: a meter on the side you pull down. Pull distance maps to
//     power; letting go below MIN_POWER cancels instead of shooting.
// =====================================================================

/** Inside this distance (inches from the cue ball) the turn is damped. */
export const FINE_DIST = 14;
/** The most the turn is damped (right by the cue ball). */
export const MIN_GAIN = 0.2;
/** Let go of the meter below this and the shot is cancelled. */
export const MIN_POWER = 0.04;

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** An angle folded into (-π, π]. */
export function wrapAngle(a: number): number {
  const r = ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return r === -Math.PI ? Math.PI : r;
}

/** How much of the finger's turn round the ball reaches the cue at this distance. */
export function aimGain(dist: number): number {
  return clamp(dist / FINE_DIST, MIN_GAIN, 1);
}

/**
 * The new aim after the finger moves round the cue ball from `prev` to `next`
 * (both angles from the cue ball to the finger), `dist` inches out.
 */
export function aimDrag(aim: number, prev: number, next: number, dist: number): number {
  return wrapAngle(aim + wrapAngle(next - prev) * aimGain(dist));
}

/** Power (0..1) for a meter pulled `pull` px down a track `track` px long. */
export function meterPower(pull: number, track: number): number {
  if (!(track > 0) || !isFinite(pull)) return 0;
  return clamp(pull / track, 0, 1);
}

/** What letting go of the meter does at this power. */
export function meterRelease(power: number): 'shoot' | 'cancel' {
  return power >= MIN_POWER ? 'shoot' : 'cancel';
}
