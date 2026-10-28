// =====================================================================
// arcade-pigeons.ts (sim) — the rules of 🐦 Pigeon Pop (ui/arcade/pigeons.ts),
// kept pure so they can be tested and so a friend's head-to-head score
// is played by the same rules (simulatePigeons).
//
// A 45-second round on a building front: nine spots (three windows,
// three window AC units, three trash cans on the sidewalk). Things pop up
// and duck back down:
//   🐦 pigeon          10 × combo (×1…×4), +5 for a quick pop
//   🕊️ golden pigeon   50 and FRENZY: 5 s of pigeons only, all ×2
//   🥖 bread bag        pops every pigeon that's up (they come running)
//   🐀 rat              −30 and the combo's gone. Never tap the rat.
// The pace ramps the whole round, and the last 10 s are RUSH HOUR.
// Goldens and bread bags come at set moments (two of each a round, at a
// random time inside their slot) so every round is equally fair.
// =====================================================================

export const PIGEON_ROUND = 45;
export const PIGEON_SPOTS = 9;
/** Hits less than this far apart keep the combo going. */
export const PIGEON_COMBO_WINDOW = 1.4;
/** A pop this soon after it showed up is QUICK (+5). */
export const PIGEON_QUICK = 0.35;
export const PIGEON_QUICK_BONUS = 5;
export const PIGEON_FRENZY = 5;
/** The last seconds of the round. */
export const PIGEON_RUSH = 10;
/** Still tappable this long after it starts ducking (late fingers on phones). */
export const PIGEON_GRACE = 0.12;
export const PIGEON_RAT_COST = 30;

export type PigeonKind = 'pigeon' | 'golden' | 'bread' | 'rat';
export const PIGEON_POINTS: Record<PigeonKind, number> = { pigeon: 10, golden: 50, bread: 0, rat: -PIGEON_RAT_COST };

/** One consistent emoji per thing (how-to, popups). */
export const PIGEON_EMOJI: Record<PigeonKind, string> = { pigeon: '🐦', golden: '🕊️', bread: '🥖', rat: '🐀' };

/** Combo multiplier: ×1 for the first 4 hits, then ×2, ×3, ×4 every 5. */
export const pigeonComboMult = (combo: number): number => Math.min(4, 1 + Math.floor(Math.max(0, combo - 1) / 5));

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A small seeded random (rounds replay exactly for a seed). */
export function pigeonRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PigeonPace {
  /** Seconds until the next pop-up. */
  gap: number;
  /** How long it stays up. */
  stay: number;
  /** Chance a second one pops at the same time. */
  double: number;
  /** Chance a regular pop-up is a 🐀 instead of a 🐦. */
  rat: number;
}

/** How fast things pop at round time t (seconds). Ramps up, then rush hour. */
export function pigeonPace(t: number, frenzy = false, length = PIGEON_ROUND): PigeonPace {
  if (frenzy) return { gap: 0.24, stay: 0.95, double: 0.35, rat: 0 };
  const k = clamp(t / length, 0, 1);
  const rush = t >= length - PIGEON_RUSH;
  return {
    gap: lerp(0.8, 0.42, k) * (rush ? 0.85 : 1),
    stay: lerp(1.35, 0.78, k) * (rush ? 0.92 : 1),
    double: lerp(0.06, 0.34, k) + (rush ? 0.08 : 0),
    rat: lerp(0.1, 0.22, k),
  };
}

/** Golden pigeons and bread bags: two of each, each somewhere inside its slot. */
export const PIGEON_SPECIAL_SLOTS: ReadonlyArray<{ kind: 'golden' | 'bread'; from: number; to: number }> = [
  { kind: 'golden', from: 8, to: 15 },
  { kind: 'bread', from: 16, to: 23 },
  { kind: 'golden', from: 25, to: 31 },
  { kind: 'bread', from: 36, to: 41 },
];

export function pigeonSpecials(rand: () => number, length = PIGEON_ROUND): { kind: 'golden' | 'bread'; t: number }[] {
  const s = length / PIGEON_ROUND;
  return PIGEON_SPECIAL_SLOTS.map((x) => ({ kind: x.kind, t: (x.from + rand() * (x.to - x.from)) * s })).sort((a, b) => a.t - b.t);
}

/** Points for popping one pigeon (or golden). */
export function pigeonPoints(kind: 'pigeon' | 'golden', combo: number, quick: boolean, frenzy: boolean): number {
  return PIGEON_POINTS[kind] * pigeonComboMult(combo) * (frenzy ? 2 : 1) + (quick ? PIGEON_QUICK_BONUS : 0);
}

export interface PigeonSpot {
  kind: PigeonKind | null;
  /** When it popped up, when it starts ducking, when it was hit (-1: not hit). */
  up: number;
  until: number;
  hitAt: number;
  /** The spot takes a new one from this time on. */
  freeAt: number;
}

export type PigeonEvent =
  | { type: 'spawn'; spot: number; kind: PigeonKind }
  | { type: 'hit'; spot: number; kind: 'pigeon' | 'golden'; pts: number; mult: number; combo: number; quick: boolean; bread: boolean }
  | { type: 'bread'; spot: number; popped: number[] }
  | { type: 'rat'; spot: number; pts: number; lostCombo: number }
  | { type: 'escape'; spot: number; kind: PigeonKind }
  | { type: 'whiff'; spot: number; lostCombo: number }
  | { type: 'frenzy'; on: boolean }
  | { type: 'rush' }
  | { type: 'end' };

export interface PigeonStats {
  spawned: number;
  pigeons: number;
  golden: number;
  bread: number;
  rats: number;
  escaped: number;
  whiffs: number;
  quick: number;
}

/** One round: update(dt) every frame, tap(spot) on a touch, drain events for the juice. */
export class PigeonRound {
  t = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  lastHit = -99;
  frenzyUntil = 0;
  over = false;
  readonly length: number;
  readonly spots: PigeonSpot[];
  readonly events: PigeonEvent[] = [];
  readonly stats: PigeonStats = { spawned: 0, pigeons: 0, golden: 0, bread: 0, rats: 0, escaped: 0, whiffs: 0, quick: 0 };
  private next = 0.7;
  private specials: { kind: 'golden' | 'bread'; t: number }[];
  private rand: () => number;
  private rushed = false;
  private wasFrenzy = false;

  constructor(seed: number, length = PIGEON_ROUND) {
    this.rand = pigeonRng(seed);
    this.length = length;
    this.specials = pigeonSpecials(this.rand, length);
    this.spots = Array.from({ length: PIGEON_SPOTS }, () => ({ kind: null, up: 0, until: 0, hitAt: -1, freeAt: 0 }));
  }

  get frenzy(): boolean {
    return this.t < this.frenzyUntil;
  }
  get left(): number {
    return Math.max(0, this.length - this.t);
  }
  get rush(): boolean {
    return this.t >= this.length - PIGEON_RUSH;
  }
  /** Is the combo timer still running? 0..1 left of it. */
  comboLeft(): number {
    return this.combo ? clamp(1 - (this.t - this.lastHit) / PIGEON_COMBO_WINDOW, 0, 1) : 0;
  }
  get mult(): number {
    return pigeonComboMult(this.combo);
  }

  /** Can this spot be tapped right now? */
  live(i: number): boolean {
    const s = this.spots[i];
    return !!s && s.kind !== null && s.hitAt < 0 && this.t >= s.up && this.t < s.until + PIGEON_GRACE;
  }

  update(dt: number): void {
    if (this.over) return;
    this.t += dt;
    const t = this.t;
    if (this.combo && t - this.lastHit > PIGEON_COMBO_WINDOW) this.combo = 0;
    if (this.wasFrenzy && !this.frenzy) this.events.push({ type: 'frenzy', on: false });
    this.wasFrenzy = this.frenzy;
    if (!this.rushed && this.rush) {
      this.rushed = true;
      this.events.push({ type: 'rush' });
    }
    // Ducked back down (or was hit and has finished its little animation).
    this.spots.forEach((s, i) => {
      if (s.kind === null) return;
      if (s.hitAt >= 0 ? t > s.hitAt + 0.35 : t > s.until + PIGEON_GRACE) {
        if (s.hitAt < 0 && s.kind !== 'rat') {
          this.stats.escaped++;
          this.events.push({ type: 'escape', spot: i, kind: s.kind });
        }
        s.kind = null;
        s.freeAt = t + 0.22;
      }
    });
    if (t >= this.length) {
      this.over = true;
      this.events.push({ type: 'end' });
      return;
    }
    // Scheduled specials pop as soon as a spot is free (never during the last second).
    while (this.specials.length && this.specials[0].t <= t && t < this.length - 1) {
      const i = this.freeSpot();
      if (i < 0) break;
      const sp = this.specials.shift()!;
      const pace = pigeonPace(t, this.frenzy, this.length);
      this.spawn(i, sp.kind, sp.kind === 'bread' ? Math.max(1.5, pace.stay * 1.4) : Math.max(0.85, pace.stay));
    }
    if (t >= this.next && t < this.length - 0.4) {
      const pace = pigeonPace(t, this.frenzy, this.length);
      const n = 1 + (this.rand() < pace.double ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const i = this.freeSpot();
        if (i < 0) break;
        const rat = this.rand() < pace.rat;
        this.spawn(i, rat ? 'rat' : 'pigeon', pace.stay * (rat ? 1.1 : 1) * (0.9 + this.rand() * 0.2));
      }
      this.next = t + pace.gap * (0.8 + this.rand() * 0.4);
    }
  }

  private freeSpot(): number {
    const free: number[] = [];
    this.spots.forEach((s, i) => s.kind === null && this.t >= s.freeAt && free.push(i));
    return free.length ? free[Math.floor(this.rand() * free.length)] : -1;
  }

  private spawn(i: number, kind: PigeonKind, stay: number): void {
    const s = this.spots[i];
    s.kind = kind;
    s.up = this.t;
    s.until = this.t + stay;
    s.hitAt = -1;
    this.stats.spawned++;
    this.events.push({ type: 'spawn', spot: i, kind });
  }

  /** A tap on spot i (or -1: the tap landed on no spot at all). */
  tap(i: number): PigeonEvent | null {
    if (this.over) return null;
    // A second tap on one you just popped (fat fingers): no harm done.
    const s = this.spots[i];
    if (s && s.kind !== null && s.hitAt >= 0) return null;
    if (i < 0 || !this.live(i)) {
      const ev: PigeonEvent = { type: 'whiff', spot: i, lostCombo: this.combo };
      this.combo = 0;
      this.stats.whiffs++;
      this.events.push(ev);
      return ev;
    }
    return this.hit(i, false);
  }

  private hit(i: number, viaBread: boolean): PigeonEvent {
    const s = this.spots[i];
    const t = this.t;
    s.hitAt = t;
    const kind = s.kind!;
    if (kind === 'rat') {
      const ev: PigeonEvent = { type: 'rat', spot: i, pts: -Math.min(this.score, PIGEON_RAT_COST), lostCombo: this.combo };
      this.score = Math.max(0, this.score - PIGEON_RAT_COST);
      this.combo = 0;
      this.stats.rats++;
      this.events.push(ev);
      return ev;
    }
    if (kind === 'bread') {
      this.stats.bread++;
      const popped: number[] = [];
      const ev: PigeonEvent = { type: 'bread', spot: i, popped };
      this.events.push(ev);
      this.spots.forEach((o, j) => {
        if (j !== i && this.live(j) && (o.kind === 'pigeon' || o.kind === 'golden')) {
          popped.push(j);
          this.hit(j, true);
        }
      });
      return ev;
    }
    // A pigeon or the golden one.
    this.combo = t - this.lastHit <= PIGEON_COMBO_WINDOW || this.combo === 0 ? this.combo + 1 : 1;
    this.lastHit = t;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const quick = !viaBread && t - s.up <= PIGEON_QUICK;
    const frenzy = this.frenzy;
    const pts = pigeonPoints(kind, this.combo, quick, frenzy);
    this.score += pts;
    if (quick) this.stats.quick++;
    if (kind === 'golden') {
      this.stats.golden++;
      this.frenzyUntil = Math.max(this.frenzyUntil, t) + PIGEON_FRENZY;
      this.wasFrenzy = true;
      this.next = Math.min(this.next, t + 0.15);
    } else this.stats.pigeons++;
    const ev: PigeonEvent = { type: 'hit', spot: i, kind, pts, mult: pigeonComboMult(this.combo) * (frenzy ? 2 : 1), combo: this.combo, quick, bread: viaBread };
    this.events.push(ev);
    if (kind === 'golden') this.events.push({ type: 'frenzy', on: true });
    return ev;
  }
}

// ------------------------------------------------------------ simulated player

/**
 * A simulated player of a given skill (0 = first time, 1 = arcade rat)
 * plays a whole round: reaction time, finger speed, aim, and how often
 * they tap a 🐀 by mistake all scale with skill. Used for a friend's
 * head-to-head score and to tune tickets.
 */
export function simulatePigeons(seed: number, skill: number, length = PIGEON_ROUND): { score: number; round: PigeonRound } {
  const k = clamp(skill, 0, 1);
  const round = new PigeonRound(seed, length);
  const rand = pigeonRng(seed ^ 0x9e3779b9);
  const react = lerp(0.62, 0.27, k);
  const finger = lerp(0.36, 0.15, k); // min time between taps
  const aim = lerp(0.8, 0.975, k);
  const ratSlip = lerp(0.12, 0.01, k);
  const seen = new Map<number, number>(); // spot -> time this one is noticed
  let ready = 0;
  const dt = 1 / 60;
  while (!round.over) {
    round.update(dt);
    for (const ev of round.events) {
      if (ev.type !== 'spawn') continue;
      // A rat only gets tapped when this player slips up (decided when it shows).
      const slip = ev.kind !== 'rat' || rand() < ratSlip;
      seen.set(ev.spot, slip ? round.t + react * (0.75 + rand() * 0.5) : Infinity);
    }
    round.events.length = 0;
    if (round.t < ready) continue;
    // Pick a target: golden first, then bread when it'd pop a few, then the oldest pigeon.
    let best = -1, bestP = -1;
    round.spots.forEach((s, i) => {
      if (!round.live(i)) return;
      const at = seen.get(i) ?? Infinity;
      if (round.t < at) return;
      const p = s.kind === 'golden' ? 100 : s.kind === 'bread' ? 10 + round.spots.filter((o, j) => j !== i && round.live(j) && o.kind === 'pigeon').length * 20 : s.kind === 'pigeon' ? 20 - (round.t - s.up) : 1;
      if (p > bestP) (bestP = p), (best = i);
    });
    if (best < 0) continue;
    round.tap(rand() < aim ? best : -1);
    round.events.length = 0;
    ready = round.t + finger * (0.8 + rand() * 0.4);
  }
  return { score: round.score, round };
}

/** A friend's head-to-head score: they really play a round at their skill. */
export function pigeonVersusScore(skill: number, seed = Math.floor(Math.random() * 2 ** 31)): number {
  return simulatePigeons(seed, skill).score;
}

/**
 * The same thing as a closed form (≈ the simulator's median by skill),
 * ±25% luck either way: handy where running a round isn't wanted.
 */
export function pigeonVersusQuick(skill: number, rand: () => number = Math.random): number {
  const k = clamp(skill, 0, 1);
  const mid = 1300 + 370 * k + 4000 * k * k;
  return Math.max(0, Math.round((mid * (0.75 + rand() * 0.5)) / 5) * 5);
}

/** 🎟️ for a score: a good round (~3,600) is about 40. */
export const pigeonTickets = (score: number): number => Math.max(0, Math.floor(score / 90));
