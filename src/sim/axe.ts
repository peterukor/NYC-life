// =====================================================================
// axe.ts (sim) — the rules of 🪓 Axe Throwing (ui/arcade/axe.ts), kept
// pure so they can be tested: where a swipe sends the axe, whether it
// sticks, what it scores, and the tickets.
//
// The board (360×480 cabinet px): rings 1–5 and a bullseye (6), and two
// small kill-shot dots in the top corners (8, only if you call them).
// One full turn in the air and the blade bites; under- or over-spun and
// the handle hits first: clang, 0.
// =====================================================================

export const AXE_THROWS = 10;

/** The target's centre, the ring radii (bull first) and the board edge. */
export const AXE_CX = 180, AXE_CY = 200;
export const AXE_RINGS = [12, 30, 48, 66, 84, 102]; // bull (6), 5, 4, 3, 2, 1
export const AXE_KILL_R = 10;
export const AXE_KILLS: ReadonlyArray<{ x: number; y: number }> = [
  { x: AXE_CX - 112, y: AXE_CY - 112 },
  { x: AXE_CX + 112, y: AXE_CY - 112 },
];
export const AXE_BOARD = { x0: 30, y0: 52, x1: 330, y1: 334 };

/** Where the axe leaves your hand, and how far a swipe carries (landing = hand + swipe × gain). */
export const AXE_HAND = { x: 180, y: 444 };
export const AXE_GAIN = 1.6;

/** Release speed (cabinet px/s) for exactly one turn, and how far off one turn still bites. */
export const AXE_SWEET = 1000;
export const AXE_STICK_TOL = 0.2;

export type AxeZone = 'bull' | 'ring' | 'kill' | 'wood' | 'off';

/** What's under a point on the board. */
export function axeZone(x: number, y: number): { zone: AxeZone; ring: number } {
  const b = AXE_BOARD;
  if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return { zone: 'off', ring: 0 };
  for (const k of AXE_KILLS) if (Math.hypot(x - k.x, y - k.y) <= AXE_KILL_R) return { zone: 'kill', ring: 0 };
  const d = Math.hypot(x - AXE_CX, y - AXE_CY);
  if (d <= AXE_RINGS[0]) return { zone: 'bull', ring: 6 };
  for (let i = 1; i < AXE_RINGS.length; i++) if (d <= AXE_RINGS[i]) return { zone: 'ring', ring: 6 - i };
  return { zone: 'wood', ring: 0 };
}

/** Turns in the air for a release speed: the sweet speed is exactly one. */
export const axeSpin = (speed: number): number => Math.max(0, speed) / AXE_SWEET;

/** Blade first (sticks) or handle first (bounces)? */
export const axeSticks = (turns: number): boolean => Math.abs(turns - 1) <= AXE_STICK_TOL;

/** Too slow, too fast or just right (for the hint after a bounce). */
export function axeSpinVerdict(turns: number): 'slow' | 'fast' | 'good' {
  if (axeSticks(turns)) return 'good';
  return turns < 1 ? 'slow' : 'fast';
}

/**
 * Where a swipe lands: the swipe (dx, dy) from the hand, a bend in the
 * swipe (curl: sideways bow ÷ length) hooks it, and the sway of your aim
 * at the moment you let go is added on.
 */
export function axeAim(dx: number, dy: number, curl = 0, swayX = 0, swayY = 0): { x: number; y: number } {
  const bend = Math.sign(curl) * Math.max(0, Math.abs(curl) - 0.04) * 90;
  return { x: AXE_HAND.x + dx * AXE_GAIN + bend + swayX, y: AXE_HAND.y + dy * AXE_GAIN + swayY };
}

/** Bonus for a run of bulls: +2 for the 2nd in a row, +4, +6 (max) after that. */
export const axeBullBonus = (streak: number): number => (streak >= 2 ? Math.min(3, streak - 1) * 2 : 0);

export interface AxeResult {
  pts: number;
  base: number;
  bonus: number;
  /** Bulls in a row after this throw. */
  streak: number;
  zone: AxeZone;
  stuck: boolean;
  /** Why it scored 0, if it did. */
  why?: 'bounce' | 'off' | 'wood' | 'missedCall' | 'uncalled';
}

/** Score one throw. A called kill shot must hit a kill dot (8), or it's 0; an uncalled kill dot is 0. */
export function axeScore(x: number, y: number, turns: number, called: boolean, streak: number): AxeResult {
  const { zone, ring } = axeZone(x, y);
  const stuck = zone !== 'off' && axeSticks(turns);
  if (!stuck) return { pts: 0, base: 0, bonus: 0, streak: 0, zone, stuck, why: zone === 'off' ? 'off' : 'bounce' };
  if (called) {
    if (zone === 'kill') return { pts: 8, base: 8, bonus: 0, streak: 0, zone, stuck };
    return { pts: 0, base: 0, bonus: 0, streak: 0, zone, stuck, why: 'missedCall' };
  }
  if (zone === 'kill') return { pts: 0, base: 0, bonus: 0, streak: 0, zone, stuck, why: 'uncalled' };
  if (zone === 'wood') return { pts: 0, base: 0, bonus: 0, streak: 0, zone, stuck, why: 'wood' };
  const s = zone === 'bull' ? streak + 1 : 0;
  const bonus = zone === 'bull' ? axeBullBonus(s) : 0;
  return { pts: ring + bonus, base: ring, bonus, streak: s, zone, stuck };
}

/** The best a game can score: ten bulls in a row (6+8+10+12×7). */
export const AXE_MAX = 6 + 8 + 10 + 12 * (AXE_THROWS - 3);

/** Tickets: ¾ of a ticket a point (a good game, ~55, is ~40 🎟️). */
export const axeTickets = (score: number): number => Math.floor((Math.max(0, score) * 3) / 4);
