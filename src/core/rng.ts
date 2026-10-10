// =====================================================================
// rng.ts — random numbers you can repeat.
//
// Math.random() gives different numbers every time. For building the
// city we want the SAME buildings every time the game loads, so we use
// a "seeded" generator: give it the same seed, get the same sequence.
//
// We also use seeds made from today's date so that every player sees
// the same daily news headlines, even before we have a server.
// =====================================================================

/** Turn any text into a 32-bit number we can use as a seed. */
export function hashString(text: string): number {
  // FNV-1a hash: simple, fast, well-spread results.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small, fast seeded random generator (mulberry32). */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  }

  /** A number from 0 (inclusive) to 1 (exclusive). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A decimal number between min and max. */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** A whole number between min and max (both included). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with the given probability (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick one item from a list. */
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
}

/**
 * Pick one option where some options are more likely than others.
 * `weights` can be any non-negative numbers; they don't need to add to 1.
 * Returns -1 if every weight is zero.
 */
export function weightedIndex(weights: readonly number[], roll = Math.random()): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return -1;
  let target = roll * total;
  for (let i = 0; i < weights.length; i++) {
    target -= Math.max(0, weights[i]);
    if (target < 0) return i;
  }
  return weights.length - 1;
}
