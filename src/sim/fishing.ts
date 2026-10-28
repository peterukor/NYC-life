// =====================================================================
// fishing.ts — Pier 84 on the Hudson (Peter, 2026-10-15: "add fishing
// competition"; rebuilt 2026-10-28: "can you fix fishing… please?").
//
// The rules, all pure and tested (tests/fishing.test.ts). The scene and
// input live in ui/fishing.ts.
//
//   CAST   power 0–1 → reach (how far out the bobber lands). Farther out
//          is deeper water: bigger fish and the rare ones bite more.
//   WAIT   bitePlan(): a few nibbles (twitches: don't strike) and then
//          the real bite (the bobber dips: strike within BITE_WINDOW).
//   FIGHT  fightPlan() + reelStep(): every species pulls its own way
//          (steady porgy, darting perch, dead-weight fluke, head-shaking
//          sea bass, thrashing bluefish, rolling eel, long runs from a
//          striper). Hold to reel: tension rises toward what you add plus
//          what the fish pulls. Let go: it eases off and the fish takes
//          line. Over the top for too long = SNAP. Slack for too long =
//          it spits the hook. Runs are telegraphed (runSoon) a beat early.
//   LAND   landCatch(): journal, record, the fish guy pays (perfect catch
//          +25%), the morning derby, streak bonus, rare-catch rep.
//
// The DERBY runs every morning 6–11 AM: your heaviest sold fish that
// morning against the regulars (seeded per day); at 11 AM the top three
// are paid (settleDerby). Fishing is in person only.
// =====================================================================

import { nycTime, type NycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { changeRep } from './rep.ts';
import type { GameState } from './types.ts';

/** How a fish fights on the line. */
export type Pattern = 'steady' | 'darty' | 'heavy' | 'shaky' | 'thrash' | 'runner' | 'twist' | 'monster' | 'dead';

/** How the catch card and journal draw it (ui/fishing.ts drawFish). */
export interface FishArt {
  shape: 'fish' | 'flat' | 'eel' | 'shark' | 'sturgeon' | 'emoji';
  /** Back, belly, fins. */
  top: string;
  belly: string;
  fin: string;
  /** Body height ÷ length. */
  h?: number;
  /** Dark lengthwise stripes (striped bass), spots (fluke), vertical bars (perch). */
  stripes?: number;
  spots?: boolean;
  bars?: number;
}

export interface FishDef {
  id: string;
  name: string;
  emoji: string;
  /** Weight range (lb). */
  lb: [number, number];
  /** How often it bites (relative). */
  odds: number;
  /** How hard it fights (1–5): pull strength and how jumpy. */
  fight: number;
  /** Market price per lb (cents); 0 = released or junk. */
  perLb: number;
  /** Funny line when you land it. */
  line: string;
  /** A real fish, something you have to put back, or NYC junk. */
  kind: 'fish' | 'release' | 'junk';
  pattern: Pattern;
  art: FishArt;
}

export const FISH: FishDef[] = [
  // ------------------------------------------------- the regulars
  { id: 'porgy', name: 'Porgy', emoji: '🐟', lb: [0.5, 2.5], odds: 20, fight: 1, perLb: 400, kind: 'fish', pattern: 'steady', line: 'Small, shiny, delicious. A classic.', art: { shape: 'fish', top: '#9aa7b4', belly: '#eef1f4', fin: '#d9a3b5', h: 0.46 } },
  { id: 'whitePerch', name: 'White perch', emoji: '🐟', lb: [0.3, 1.5], odds: 17, fight: 1, perLb: 300, kind: 'fish', pattern: 'darty', line: 'Feisty for its size. Respect.', art: { shape: 'fish', top: '#7c8a6a', belly: '#e9ecdf', fin: '#b9b38d', h: 0.36, bars: 5 } },
  { id: 'fluke', name: 'Fluke', emoji: '🐠', lb: [1, 8], odds: 13, fight: 2, perLb: 900, kind: 'fish', pattern: 'heavy', line: 'Flat as a MetroCard. Both eyes on one side. Tasty, though.', art: { shape: 'flat', top: '#8a6a48', belly: '#c9ab84', fin: '#6e5236', h: 0.5, spots: true } },
  { id: 'blackSeaBass', name: 'Black sea bass', emoji: '🐟', lb: [1, 5], odds: 10, fight: 2, perLb: 800, kind: 'fish', pattern: 'shaky', line: 'Shakes its head like it owes you money.', art: { shape: 'fish', top: '#23262f', belly: '#4b5164', fin: '#3a5f9e', h: 0.42 } },
  { id: 'crab', name: 'Blue crab', emoji: '🦀', lb: [0.3, 1], odds: 8, fight: 1, perLb: 1_800, kind: 'fish', pattern: 'steady', line: 'Sideways. Furious. Worth it.', art: { shape: 'emoji', top: '#3a6fb0', belly: '#e9eef5', fin: '#3a6fb0' } },
  { id: 'bluefish', name: 'Bluefish', emoji: '🐟', lb: [2, 14], odds: 9, fight: 3, perLb: 600, kind: 'fish', pattern: 'thrash', line: 'It bit the line, your hand, and your pride.', art: { shape: 'fish', top: '#2f6f86', belly: '#dfe9ee', fin: '#5f8f9a', h: 0.3 } },
  { id: 'eel', name: 'American eel', emoji: '🐍', lb: [1, 5], odds: 4, fight: 3, perLb: 1_000, kind: 'fish', pattern: 'twist', line: 'It wrapped around your arm. You screamed. Everyone heard.', art: { shape: 'eel', top: '#4b4a26', belly: '#c8c08a', fin: '#5d5a2f', h: 0.09 } },
  { id: 'bass', name: 'Striped bass', emoji: '🐟', lb: [5, 40], odds: 6, fight: 4, perLb: 1_200, kind: 'fish', pattern: 'runner', line: 'The fish of the Hudson. The pier applauds.', art: { shape: 'fish', top: '#6f7f8c', belly: '#f1f3f5', fin: '#8b97a1', h: 0.3, stripes: 6 } },
  // ------------------------------------------------- the legends (they go back in)
  { id: 'sturgeon', name: 'Atlantic sturgeon', emoji: '🐉', lb: [40, 120], odds: 0.6, fight: 5, perLb: 0, kind: 'release', pattern: 'monster', line: 'A living dinosaur. Protected, so it goes back in. The photo is legendary.', art: { shape: 'sturgeon', top: '#5b5a4c', belly: '#d7d1bd', fin: '#4a483c', h: 0.2 } },
  { id: 'shark', name: 'Sand tiger shark', emoji: '🦈', lb: [30, 80], odds: 0.45, fight: 5, perLb: 0, kind: 'release', pattern: 'monster', line: 'A SHARK. In the Hudson. You let it go and tell everyone forever.', art: { shape: 'shark', top: '#8a8273', belly: '#ece6d8', fin: '#776f61', h: 0.24, spots: true } },
  // ------------------------------------------------- the river gives back
  { id: 'boot', name: 'An old boot', emoji: '👢', lb: [1, 2], odds: 3, fight: 1, perLb: 0, kind: 'junk', pattern: 'dead', line: 'Size 11. No idea where the other one is.', art: { shape: 'emoji', top: '#6b4a2b', belly: '#6b4a2b', fin: '#6b4a2b' } },
  { id: 'metrocard', name: 'A soggy MetroCard', emoji: '🎫', lb: [0.1, 0.1], odds: 1.6, fight: 1, perLb: 0, kind: 'junk', pattern: 'dead', line: 'Might have $2.75 on it. You will never know for sure.', art: { shape: 'emoji', top: '#f2c230', belly: '#f2c230', fin: '#f2c230' } },
  { id: 'cart', name: 'A shopping cart', emoji: '🛒', lb: [18, 25], odds: 1, fight: 2, perLb: 0, kind: 'junk', pattern: 'dead', line: 'How. HOW.', art: { shape: 'emoji', top: '#9aa0a6', belly: '#9aa0a6', fin: '#9aa0a6' } },
  { id: 'citibike', name: 'A Citi Bike', emoji: '🚲', lb: [40, 45], odds: 0.4, fight: 3, perLb: 0, kind: 'junk', pattern: 'dead', line: 'The meter is still running. That’s somebody’s problem.', art: { shape: 'emoji', top: '#2f6fd6', belly: '#2f6fd6', fin: '#2f6fd6' } },
];
export const FISH_BY_ID: Record<string, FishDef> = Object.fromEntries(FISH.map((f) => [f.id, f]));

export interface FishingRecord {
  /** Biggest ever (lb) and what it was. */
  best: { id: string; lb: number } | null;
  caught: number;
  /** This morning's derby: date and your best (lb). */
  derby: { day: string; lb: number; paid: boolean } | null;
  /** 📖 The journal: how many of each you've landed and the heaviest (added 2026-10-28; old saves lack it). */
  species?: Record<string, { n: number; lb: number }>;
}

export function fishingOf(s: GameState): FishingRecord {
  const rec = (s.fishing ??= { best: null, caught: 0, derby: null });
  if (!rec.species) {
    // Old saves: the journal starts with your record fish, if you had one.
    rec.species = {};
    if (rec.best && FISH_BY_ID[rec.best.id]) rec.species[rec.best.id] = { n: 1, lb: rec.best.lb };
  }
  return rec;
}

/** Journal progress: species found / all there is. */
export function journalCount(s: GameState): { found: number; total: number } {
  const sp = fishingOf(s).species!;
  return { found: FISH.filter((f) => sp[f.id]).length, total: FISH.length };
}

/** The odds of each thing biting at this reach (0 = right under the pier, 1 = a perfect long cast). */
export function biteOdds(f: FishDef, reach = 0.5): number {
  const r = Math.max(0, Math.min(1, reach));
  if (f.kind === 'release') return f.odds * (0.2 + r * r * 3);
  if (f.kind === 'junk') return f.odds * (1.4 - r * 0.8); // junk sits by the pilings
  if (f.fight >= 3) return f.odds * (0.5 + r * 1.2);
  return f.odds * (1.25 - r * 0.5);
}

/** What's on the line this time. A long cast reaches bigger, rarer fish. */
export function rollBite(rand: () => number = Math.random, reach = 0.5): { fish: FishDef; lb: number } {
  const w = FISH.map((f) => biteOdds(f, reach));
  const total = w.reduce((t, x) => t + x, 0);
  let r = rand() * total;
  let fish = FISH[0];
  for (let i = 0; i < FISH.length; i++) {
    if (r < w[i]) {
      fish = FISH[i];
      break;
    }
    r -= w[i];
  }
  const skew = 1.7 - Math.max(0, Math.min(1, reach)) * 0.6;
  const lb = Math.round((fish.lb[0] + rand() ** skew * (fish.lb[1] - fish.lb[0])) * 10) / 10;
  return { fish, lb };
}

export const derbyOpen = (hour = nycTime().hour): boolean => hour >= 6 && hour < 11;

// ===================================================================== bite

/** Strike within this long of the dip (s). Under PERFECT_HOOK is a perfect hook. */
export const BITE_WINDOW = 0.8;
export const PERFECT_HOOK = 0.3;

export interface BitePlan {
  /** Seconds after the bobber lands: the nibbles (twitches) and the real bite (the dip). */
  nibbles: number[];
  bite: number;
}

export function bitePlan(rand: () => number = Math.random): BitePlan {
  const bite = 2.4 + rand() * 3.6;
  const n = 1 + Math.floor(rand() * 3);
  const nibbles: number[] = [];
  let t = 0.9 + rand() * 0.6;
  for (let i = 0; i < n && t < bite - 0.75; i++) {
    nibbles.push(Math.round(t * 100) / 100);
    t += 0.65 + rand() * 0.9;
  }
  return { nibbles, bite: Math.round(bite * 100) / 100 };
}

/** Power of a cast (0–1) → reach. The sweet spot near the top is a PERFECT CAST. */
export const CAST_SWEET: [number, number] = [0.8, 0.95];
export const castReach = (power: number): number => {
  const p = Math.max(0, Math.min(1, power));
  // Over-cranking past the sweet spot loses a little (the line birds-nests).
  return p > CAST_SWEET[1] ? 0.9 - (p - CAST_SWEET[1]) * 2 : p >= CAST_SWEET[0] ? 1 : p * 0.95;
};
export const perfectCast = (power: number): boolean => power >= CAST_SWEET[0] && power <= CAST_SWEET[1];

// ===================================================================== fight

/** The tension gauge: green is safe; at SNAP for SNAP_HOLD s the line breaks; under SLACK for SLACK_HOLD s it spits the hook. */
export const TENSION = { green: [0.25, 0.78] as [number, number], snap: 1, snapHold: 0.3, slack: 0.12, slackHold: 2.5, max: 1.15 };

export interface Run {
  at: number;
  dur: number;
  pow: number;
}

export interface FightPlan {
  fish: FishDef;
  lb: number;
  /** 0–1: how big it is for its kind. */
  size: number;
  base: number;
  runs: Run[];
  phase: number;
  /** Seconds of steady reeling it takes, before runs. */
  secs: number;
}

// Base pull and run shape per pattern: [base, every min, every max, dur min, dur max, power].
const SHAPE: Record<Pattern, [number, number, number, number, number, number]> = {
  steady: [0.13, 3, 5, 0.5, 0.7, 0.2],
  darty: [0.1, 0.9, 1.6, 0.25, 0.4, 0.26],
  heavy: [0.27, 4, 6, 0.8, 1.1, 0.3],
  shaky: [0.18, 3.5, 5, 0.5, 0.7, 0.3],
  thrash: [0.2, 1.5, 2.4, 0.5, 0.8, 0.42],
  runner: [0.22, 2.6, 4, 1.2, 2, 0.52],
  twist: [0.16, 3, 5, 0.6, 0.8, 0.34],
  monster: [0.3, 3, 4.2, 1.3, 2.1, 0.6],
  dead: [0.2, 99, 99, 0, 0, 0],
};

/** Everything about how this fish will fight, decided up front (seeded, so it can be tested). */
export function fightPlan(fish: FishDef, lb: number, seed: number | string = Math.random() * 1e9): FightPlan {
  const r = new Rng(seed);
  const span = fish.lb[1] - fish.lb[0];
  const size = span > 0 ? Math.max(0, Math.min(1, (lb - fish.lb[0]) / span)) : 0.5;
  const [b, e0, e1, d0, d1, pow] = SHAPE[fish.pattern];
  // Junk just hangs there: a cart is heavier than a boot.
  const base = fish.pattern === 'dead' ? 0.08 + Math.min(0.3, lb / 120) : b * (0.8 + size * 0.45);
  const runs: Run[] = [];
  let t = 1.4 + r.next() * 1.2; // a breather after the hook
  while (t < 180 && pow > 0) {
    const dur = d0 + r.next() * (d1 - d0);
    runs.push({ at: Math.round(t * 100) / 100, dur, pow: pow * (0.85 + size * 0.35) * (0.9 + r.next() * 0.2) });
    t += dur + e0 + r.next() * (e1 - e0);
  }
  const secs = Math.min(17, 3.2 + fish.fight * 1.9 + size * fish.fight * 1.1);
  return { fish, lb, size, base, runs, phase: r.next() * 6.28, secs };
}

const runAt = (plan: FightPlan, t: number): Run | null => {
  for (const r of plan.runs) {
    if (r.at > t) return null;
    if (t < r.at + r.dur) return r;
  }
  return null;
};

/** Is the fish running right now? */
export const inRun = (plan: FightPlan, t: number): boolean => runAt(plan, t) !== null;

/** The tell: a run starts within `lead` seconds (the line twangs, the fish flashes). */
export function runSoon(plan: FightPlan, t: number, lead = 0.45): boolean {
  for (const r of plan.runs) {
    if (r.at > t + lead) return false;
    if (r.at > t) return true;
  }
  return false;
}

/** How hard the fish pulls at time t (0…~0.9). Tired fish pull less. */
export function pullAt(plan: FightPlan, t: number, stamina = 1): number {
  const p = plan.phase;
  let v = plan.base;
  switch (plan.fish.pattern) {
    case 'steady':
      v *= 1 + 0.15 * Math.sin(2.1 * t + p);
      break;
    case 'heavy':
      v *= 1 + 0.1 * Math.sin(6 * t + p);
      break;
    case 'shaky':
      v *= 1 + 0.55 * Math.abs(Math.sin(8 * t + p));
      break;
    case 'thrash':
      v *= 1 + 0.4 * Math.abs(Math.sin(11 * t + p));
      break;
    case 'twist':
      v *= 1 + 0.75 * Math.sin(3.2 * t + p);
      break;
    case 'darty':
      v *= 1 + 0.2 * Math.sin(5 * t + p);
      break;
    default:
      break;
  }
  const run = runAt(plan, t);
  if (run) {
    // Ease in and out of a run over 0.15 s.
    const k = Math.min(1, (t - run.at) / 0.15, (run.at + run.dur - t) / 0.15);
    v += run.pow * Math.max(0, k);
  }
  const tired = plan.fish.pattern === 'dead' ? 1 : 0.45 + 0.55 * Math.max(0, stamina);
  return Math.max(0, v * tired);
}

export interface Reel {
  t: number;
  tension: number;
  /** Line out: 1 where it bit … 0 at the pier. */
  dist: number;
  stamina: number;
  /** Seconds at the snap point / slack in a row. */
  over: number;
  slack: number;
  /** Seconds outside the green (a perfect catch never leaves it for long). */
  outside: number;
  out: null | 'landed' | 'snap' | 'spit';
}

export function newReel(perfectHook = false): Reel {
  return { t: 0, tension: 0.5, dist: 1, stamina: perfectHook ? 0.85 : 1, over: 0, slack: 0, outside: 0, out: null };
}

/** One step of the fight. Hold = reel in. Mutates and returns r. */
export function reelStep(r: Reel, plan: FightPlan, holding: boolean, dt: number): Reel {
  if (r.out) return r;
  r.t += dt;
  const P = pullAt(plan, r.t, r.stamina);
  const target = holding ? 0.38 + P * 1.15 : P * 0.55;
  const rate = holding ? 3.2 : 4.5;
  r.tension += (target - r.tension) * (1 - Math.exp(-rate * dt));
  r.tension = Math.max(0, Math.min(TENSION.max, r.tension));
  if (holding) r.dist -= (dt / plan.secs) * Math.max(0, 1 - P * 1.1);
  else r.dist += P * 0.035 * dt;
  r.dist = Math.min(1, r.dist);
  r.stamina = Math.max(0, r.stamina - (dt / (plan.secs * 1.3)) * (holding ? 1 : 0.6));
  const [g0, g1] = TENSION.green;
  if (r.tension < g0 || r.tension > g1) r.outside += dt;
  r.over = r.tension >= TENSION.snap ? r.over + dt : Math.max(0, r.over - dt * 2);
  r.slack = r.tension < TENSION.slack ? r.slack + dt : 0;
  if (r.over >= TENSION.snapHold) r.out = 'snap';
  else if (r.slack >= TENSION.slackHold) r.out = 'spit';
  else if (r.dist <= 0) {
    r.dist = 0;
    r.out = 'landed';
  }
  return r;
}

/** A perfect catch: the line (nearly) never left the green. */
export const perfectCatch = (r: Reel): boolean => r.out === 'landed' && r.outside < 0.4;

/** 🔥 Three in a row (no fish lost in between) pays a little extra, growing to $25. */
export const streakBonus = (streak: number): number => (streak >= 3 ? 500 * Math.min(5, streak - 2) : 0);

// ===================================================================== landing

export interface CatchResult {
  fish: FishDef;
  lb: number;
  /** What the fish guy paid (cents), streak bonus included separately. */
  cents: number;
  streakCents: number;
  newSpecies: boolean;
  /** Heaviest of this kind so far. */
  speciesRecord: boolean;
  /** Heaviest fish ever. */
  newBest: boolean;
  /** Your derby weight went up. */
  derbyBest: boolean;
  /** Street rep for a legend. */
  rep: number;
  /** The text for the card. */
  text: string;
}

/** You landed it: journal, record, sell (unless protected or junk), derby, streak, legends. */
export function landCatch(s: GameState, fish: FishDef, lb: number, opts: { perfect?: boolean; streak?: number; time?: NycTime } = {}): CatchResult {
  const rec = fishingOf(s);
  const time = opts.time ?? nycTime();
  rec.caught++;
  const sp = rec.species!;
  const had = sp[fish.id];
  const newSpecies = !had;
  const speciesRecord = fish.kind !== 'junk' && (!had || lb > had.lb);
  sp[fish.id] = { n: (had?.n ?? 0) + 1, lb: Math.max(had?.lb ?? 0, lb) };
  const newBest = fish.kind !== 'junk' && (!rec.best || lb > rec.best.lb);
  if (newBest) rec.best = { id: fish.id, lb };
  applyNeeds(s, { fun: 8 + fish.fight * 2 + (newSpecies ? 4 : 0) });
  const bits = [`${fish.emoji} ${fish.name}, ${lb} lb. ${fish.line}`];
  let cents = 0;
  let derbyBest = false;
  if (fish.perLb > 0) {
    cents = Math.round((lb * fish.perLb * (opts.perfect ? 1.25 : 1)) / 100) * 100;
    if (cents > 0) {
      changeMoney(s, cents, `🎣 Sold a ${fish.name}`);
      bits.push(`The fish guy pays $${Math.round(cents / 100)}${opts.perfect ? ' (perfect catch +25%)' : ''}.`);
    }
    // The derby: your heaviest fish this morning counts.
    if (derbyOpen(time.hour)) {
      if (!rec.derby || rec.derby.day !== time.dateKey) rec.derby = { day: time.dateKey, lb: 0, paid: false };
      if (lb > rec.derby.lb) {
        rec.derby.lb = lb;
        derbyBest = true;
        bits.push('🏆 New best for the derby!');
      }
    }
  }
  const streakCents = fish.kind === 'junk' ? 0 : streakBonus(opts.streak ?? 0);
  if (streakCents) {
    changeMoney(s, streakCents, '🎣 Catch streak');
    bits.push(`🔥 ${opts.streak} in a row: +$${streakCents / 100}.`);
  }
  let rep = 0;
  if (fish.fight >= 5) {
    rep = 10;
    changeRep(s, 'street', rep);
    addMoodlet(s, { id: 'legendCatch', label: `Caught a ${fish.name}`, emoji: fish.emoji, value: 20, minutes: 60 * 12 });
    bits.push('🔥 +10 street rep.');
  }
  return { fish, lb, cents, streakCents, newSpecies, speciesRecord, newBest, derbyBest, rep, text: bits.join(' ') };
}

/** The old entry point: land it and get the line back. */
export function landFish(s: GameState, fish: FishDef, lb: number, opts: { perfect?: boolean; streak?: number; time?: NycTime } = {}): string {
  return landCatch(s, fish, lb, opts).text;
}

// ===================================================================== derby

/** Today's derby board: the regulars and you (heaviest first). */
export function derbyBoard(s: GameState, day = nycTime().dateKey): { name: string; lb: number; you: boolean }[] {
  const r = new Rng(`derby-${day}`);
  const regulars = ['Sal (since 1971)', 'Tina B.', 'Big Mike', 'Mr. Chen', 'The Kid with the Net'].map((name) => ({ name, lb: Math.round((3 + r.next() ** 1.4 * 24) * 10) / 10, you: false }));
  const rec = fishingOf(s);
  if (rec.derby && rec.derby.day === day && rec.derby.lb > 0) regulars.push({ name: s.profile.name, lb: rec.derby.lb, you: true });
  return regulars.sort((a, b) => b.lb - a.lb);
}

export const DERBY_PRIZES = [50_000, 20_000, 10_000];

/** Where you stand right now (1-based), or 0 if you haven't weighed in today. */
export function derbyPlace(s: GameState, day = nycTime().dateKey): number {
  return derbyBoard(s, day).findIndex((x) => x.you) + 1;
}

/** 🎁 Treasure (kept for old callers; the rebuilt game doesn't fish it up). */
export const TREASURE: { emoji: string; text: string; cash: number }[] = [
  { emoji: '💵', text: 'a soggy $20 bill. Still spends.', cash: 2_000 },
  { emoji: '💍', text: 'a ring. The pawn shop on 10th gives you $60.', cash: 6_000 },
  { emoji: '🪙', text: 'a jar of quarters. $14.25, exactly.', cash: 1_425 },
  { emoji: '⌚', text: 'a “Rolex”. It’s a Rolax. $8.', cash: 800 },
  { emoji: '🧳', text: 'a waterproof briefcase with $45 and a sandwich.', cash: 4_500 },
];

export function landTreasure(s: GameState, rand = Math.random): string {
  const t = TREASURE[Math.floor(rand() * TREASURE.length)];
  changeMoney(s, t.cash, '🎁 Fished up treasure');
  return `🎁 Treasure! ${t.emoji} You pulled up ${t.text}`;
}

/** After 11 AM: pay this morning's derby if you placed. Returns a line or null. */
export function settleDerby(s: GameState, t: NycTime = nycTime()): string | null {
  const rec = fishingOf(s);
  const d = rec.derby;
  if (!d || d.paid || (d.day === t.dateKey && t.hour < 11)) return null;
  d.paid = true;
  const place = derbyBoard(s, d.day).findIndex((x) => x.you);
  if (place < 0 || place > 2) return `🎣 Derby result: you were ${place + 1}th. Sal won again.`;
  changeMoney(s, DERBY_PRIZES[place], `🎣 Pier 84 derby: ${['1st', '2nd', '3rd'][place]} place`);
  changeRep(s, 'street', [12, 6, 3][place]);
  return `🎣 Pier 84 derby: you came ${['1st 🥇', '2nd 🥈', '3rd 🥉'][place]}! +$${DERBY_PRIZES[place] / 100}.`;
}
