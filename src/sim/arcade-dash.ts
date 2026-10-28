// =====================================================================
// arcade-dash.ts (sim) — the rules of 🛵 Delivery Dash (ui/arcade/dash.ts),
// kept pure so they can be tested and botted: the waves of traffic, lane
// changes and hops, what you hit or collect, and the tickets.
//
// A 90-second shift up an avenue. Three lanes; steer left/right, hop over
// low things (🕳️ potholes, 🚧 sawhorses, 📦 boxes). Tall things (🚕 cabs,
// 🚌 buses, 🚚 double-parked trucks, Con Ed steam stacks, 🚶 jaywalkers,
// car doors) you steer around. 💵 tips build a streak multiplier (×5),
// 🥡 orders pay big, 🧲 magnet, 🪖 helmet (one free hit), ⚡ turbo (you
// plough through, ×2). Close calls score. Three hits and you're out.
//
// World units: z is the distance ahead of the scooter, x is lanes (0–2).
// Every wave leaves at least one lane open (or hop-able) on every row.
// =====================================================================

export const DASH_SECONDS = 90;
export const DASH_LANES = 3;
export const DASH_LIVES = 3;
export const DASH_SPAWN_Z = 2000;
/** A city block (for the street signs and the block bonus). */
export const DASH_BLOCK = 1500;
/** Lanes per second when switching (snappy). */
export const DASH_STEER = 9;
/** Hop: launch speed and gravity (≈0.5 s in the air, ≈42 high). */
export const DASH_HOP_V = 330;
export const DASH_GRAVITY = 1300;
/** Height that clears a low obstacle. */
export const DASH_CLEAR = 14;
/** How far from the lane centre still counts as in it (hazards / pickups). */
export const DASH_HIT_LANE = 0.48;
export const DASH_GRAB_LANE = 0.75;
/** Power-up lengths (s). */
export const DASH_MAGNET_S = 8;
export const DASH_TURBO_S = 4;

export type DashKind =
  | 'cash' | 'order' | 'magnet' | 'helmet' | 'turbo'
  | 'cab' | 'bus' | 'truck' | 'steam' | 'walker' | 'door'
  | 'pothole' | 'barrier' | 'box';

export interface DashInfo {
  /** tall = steer round it; low = hop it or steer; pickup = grab it. */
  type: 'tall' | 'low' | 'pickup';
  /** Length along the road (world units). */
  len: number;
  pts: number;
}

export const DASH_INFO: Record<DashKind, DashInfo> = {
  cash: { type: 'pickup', len: 30, pts: 5 },
  order: { type: 'pickup', len: 40, pts: 25 },
  magnet: { type: 'pickup', len: 40, pts: 0 },
  helmet: { type: 'pickup', len: 40, pts: 0 },
  turbo: { type: 'pickup', len: 40, pts: 0 },
  cab: { type: 'tall', len: 150, pts: 0 },
  bus: { type: 'tall', len: 360, pts: 0 },
  truck: { type: 'tall', len: 240, pts: 0 },
  steam: { type: 'tall', len: 50, pts: 0 },
  walker: { type: 'tall', len: 30, pts: 0 },
  door: { type: 'tall', len: 40, pts: 0 },
  pothole: { type: 'low', len: 50, pts: 0 },
  barrier: { type: 'low', len: 30, pts: 0 },
  box: { type: 'low', len: 30, pts: 0 },
};

export interface DashSpawn {
  /** Distance behind the front of the wave. */
  dz: number;
  lane: number;
  kind: DashKind;
  /** A cab that signals and changes lane. */
  to?: number;
}

export interface DashObj {
  kind: DashKind;
  lane: number;
  /** Where it started (walkers, swervers). */
  lane0: number;
  to: number;
  z: number;
  /** Seconds alive (animation). */
  t: number;
  done: boolean;
  /** Already scored as a close call / collided. */
  passed: boolean;
  /** For looks (which parked car, which sign): stable per object. */
  seed: number;
}

export interface DashState {
  /** Length of the shift (s). */
  end: number;
  t: number;
  dist: number;
  v: number;
  /** Target lane, and where the scooter actually is (float). */
  lane: number;
  pl: number;
  hop: number;
  hopV: number;
  /** A hop pressed just before landing (buffered). */
  hopBuf: number;
  lives: number;
  helmet: boolean;
  magnet: number;
  turbo: number;
  /** Blink after a hit (no damage). */
  invuln: number;
  streak: number;
  bestStreak: number;
  score: number;
  cash: number;
  orders: number;
  blocks: number;
  objs: DashObj[];
  /** Distance until the next wave. */
  nextWave: number;
  sincePower: number;
  lastSteer: number;
  dead: boolean;
  over: boolean;
}

export type DashEvent =
  | { type: 'grab'; kind: DashKind; lane: number; pts: number; mult: number }
  | { type: 'power'; kind: 'magnet' | 'helmet' | 'turbo' }
  | { type: 'hit'; kind: DashKind; lane: number; lives: number }
  | { type: 'saved'; kind: DashKind; lane: number }
  | { type: 'smash'; kind: DashKind; lane: number; pts: number }
  | { type: 'close'; kind: DashKind; lane: number; pts: number }
  | { type: 'hopped'; kind: DashKind; lane: number; pts: number }
  | { type: 'block'; blocks: number; pts: number }
  | { type: 'land' }
  | { type: 'end'; reason: 'crash' | 'time'; bonus: number };

/** Your speed up the avenue (world units/s): it ramps over the shift. */
export const dashSpeed = (t: number): number => Math.min(1150, 560 + 6.5 * t);

/** Tip multiplier: ×1 … ×5 every 10 tips in a row; turbo doubles it. */
export const dashMult = (streak: number, turbo: boolean): number => Math.min(5, 1 + Math.floor(streak / 10)) * (turbo ? 2 : 1);

const pick = <T>(a: readonly T[], r: number): T => a[Math.min(a.length - 1, Math.floor(r * a.length))];
const TALL_STILL: DashKind[] = ['truck', 'steam', 'cab'];
const LOW: DashKind[] = ['pothole', 'barrier', 'box'];

/**
 * One wave of traffic for time t (s). Rows of a wave are ≥420 apart, and
 * every row leaves a lane you can get through (open, or only low stuff).
 */
export function dashWave(t: number, rand: () => number, sincePower = 0): DashSpawn[] {
  const d = Math.min(1, t / DASH_SECONDS);
  const out: DashSpawn[] = [];
  const lane = () => Math.floor(rand() * 3);
  const cashLine = (l: number, dz: number, n = 5, step = 70) => {
    for (let k = 0; k < n; k++) out.push({ dz: dz + k * step, lane: l, kind: 'cash' });
  };
  const table: [number, () => void][] = [
    [1, () => {
      // A line of tips, sometimes switching lanes halfway.
      const a = lane();
      cashLine(a, 0, 4);
      const b = rand() < 0.45 ? (a + (rand() < 0.5 ? 1 : 2)) % 3 : a;
      cashLine(b === a ? a : b, 4 * 70 + 40, 3);
    }],
    [1.2, () => {
      // One thing in the way, tips beside it.
      const a = lane();
      out.push({ dz: 0, lane: a, kind: pick(TALL_STILL, rand()) });
      cashLine((a + 1 + Math.floor(rand() * 2)) % 3, -40, 3);
    }],
    [d > 0.12 ? 0.5 + d : 0, () => {
      // Two lanes blocked: the gap gets the order.
      const free = lane();
      for (let l = 0; l < 3; l++) if (l !== free) out.push({ dz: 0, lane: l, kind: pick(TALL_STILL, rand()) });
      out.push({ dz: 0, lane: free, kind: rand() < 0.35 ? 'order' : 'cash' });
    }],
    [d > 0.18 ? 0.5 + d * 0.6 : 0, () => {
      // Low stuff: hop it (all three lanes later on).
      const n = d > 0.4 && rand() < 0.4 ? 3 : 1 + Math.floor(rand() * 2);
      const first = lane();
      for (let k = 0; k < n; k++) out.push({ dz: 0, lane: (first + k) % 3, kind: pick(LOW, rand()) });
      // Tips over the hop.
      out.push({ dz: 10, lane: first, kind: 'cash' });
    }],
    [d > 0.08 ? 0.55 : 0, () => {
      const a = lane();
      out.push({ dz: 0, lane: a, kind: 'bus' });
      cashLine((a + 1) % 3, 60, 4);
    }],
    [0.45, () => {
      // A parked car's door swings open into the right lane.
      out.push({ dz: 0, lane: 2, kind: 'door' });
      cashLine(1, -60, 3);
    }],
    [d > 0.22 ? 0.4 : 0, () => {
      // A jaywalker strolls across.
      out.push({ dz: 0, lane: rand() < 0.5 ? -0.8 : 2.8, kind: 'walker' });
    }],
    [d > 0.32 ? 0.4 : 0, () => {
      // A cab signals and cuts across.
      const a = lane();
      const to = a === 1 ? (rand() < 0.5 ? 0 : 2) : 1;
      out.push({ dz: 0, lane: a, kind: 'cab', to });
      out.push({ dz: 260, lane: 3 - a - to, kind: 'order' });
    }],
    [d > 0.45 ? 0.45 : 0, () => {
      // Slalom: left, right, left with tips down the middle.
      const s = rand() < 0.5 ? 0 : 2;
      out.push({ dz: 0, lane: s, kind: pick(TALL_STILL, rand()) });
      out.push({ dz: 440, lane: 2 - s, kind: pick(TALL_STILL, rand()) });
      out.push({ dz: 880, lane: s, kind: pick(TALL_STILL, rand()) });
      cashLine(1, 0, 12, 80);
    }],
  ];
  let sum = 0;
  for (const [w] of table) sum += w;
  let r = rand() * sum;
  for (const [w, f] of table) {
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) {
      f();
      break;
    }
  }
  if (!out.length) table[0][1]();
  // A power-up now and then (more likely the longer it's been).
  if (rand() < Math.min(0.5, 0.06 + sincePower * 0.012)) {
    const busy = new Set(out.filter((o) => o.dz < 60 && o.dz > -60 && DASH_INFO[o.kind].type !== 'pickup').map((o) => Math.round(o.lane)));
    let l = lane();
    for (let k = 0; k < 3 && busy.has(l); k++) l = (l + 1) % 3;
    if (!busy.has(l)) out.push({ dz: -140, lane: l, kind: pick(['magnet', 'helmet', 'turbo'] as const, rand()) });
  }
  return out;
}

/** The z-extent of a wave (for spacing the next one). */
export function dashWaveLength(w: DashSpawn[]): number {
  let lo = 0, hi = 0;
  for (const s of w) {
    lo = Math.min(lo, s.dz);
    hi = Math.max(hi, s.dz + DASH_INFO[s.kind].len);
  }
  return hi - lo;
}

/** Is every row of a wave passable (some lane open or only low)? For tests. */
export function dashWavePassable(w: DashSpawn[]): boolean {
  for (const a of w) {
    if (DASH_INFO[a.kind].type !== 'tall') continue;
    const blocked = new Set<number>();
    for (const b of w) {
      if (DASH_INFO[b.kind].type !== 'tall' || b.kind === 'walker') continue;
      // Overlapping along the road?
      if (b.dz < a.dz + DASH_INFO[a.kind].len && a.dz < b.dz + DASH_INFO[b.kind].len) blocked.add(Math.round(b.lane));
      if (b.to !== undefined) blocked.add(b.to);
    }
    if (blocked.size >= 3) return false;
  }
  return true;
}

export function createDash(end = DASH_SECONDS): DashState {
  return {
    end,
    t: 0, dist: 0, v: dashSpeed(0), lane: 1, pl: 1, hop: 0, hopV: 0, hopBuf: 0, lives: DASH_LIVES, helmet: false, magnet: 0, turbo: 0, invuln: 0,
    streak: 0, bestStreak: 0, score: 0, cash: 0, orders: 0, blocks: 0, objs: [], nextWave: 300, sincePower: 0, lastSteer: -9, dead: false, over: false,
  };
}

export function dashSteer(s: DashState, d: number): void {
  if (s.over) return;
  const n = Math.max(0, Math.min(2, s.lane + d));
  if (n !== s.lane) {
    s.lane = n;
    s.lastSteer = s.t;
  }
}

export function dashHop(s: DashState): void {
  if (s.over) return;
  if (s.hop <= 0.01) s.hopV = DASH_HOP_V;
  else s.hopBuf = 0.15; // pressed in the air: hop again on landing
}

/** Where a walker / swerving cab is now (lanes). */
function objLane(o: DashObj): number {
  if (o.kind === 'walker') {
    const dir = o.lane0 < 1 ? 1 : -1;
    // Starts walking once it's in sight; crosses at about a lane a second.
    return o.z > 1500 ? o.lane0 : o.lane0 + dir * Math.min(3.6, ((1500 - o.z) / 1500) * 3.6);
  }
  if (o.kind === 'cab' && o.to !== o.lane0) {
    const f = Math.max(0, Math.min(1, (1050 - o.z) / 300));
    return o.lane0 + (o.to - o.lane0) * f;
  }
  return o.lane;
}

/** Advance the shift by dt seconds. */
export function dashUpdate(s: DashState, dt: number, rand: () => number, out: DashEvent[]): void {
  if (s.over) return;
  s.t += dt;
  const turbo = s.turbo > 0;
  s.v = dashSpeed(s.t) * (turbo ? 1.45 : 1);
  const step = s.v * dt;
  s.dist += step;
  s.magnet = Math.max(0, s.magnet - dt);
  s.turbo = Math.max(0, s.turbo - dt);
  s.invuln = Math.max(0, s.invuln - dt);
  s.hopBuf = Math.max(0, s.hopBuf - dt);
  // Steering: straight to the lane, fast.
  const dl = s.lane - s.pl;
  s.pl += Math.sign(dl) * Math.min(Math.abs(dl), DASH_STEER * dt);
  // Hop.
  if (s.hop > 0 || s.hopV > 0) {
    s.hopV -= DASH_GRAVITY * dt;
    s.hop += s.hopV * dt;
    if (s.hop <= 0) {
      s.hop = 0;
      s.hopV = 0;
      out.push({ type: 'land' });
      if (s.hopBuf > 0) (s.hopV = DASH_HOP_V), (s.hopBuf = 0);
    }
  }
  // Blocks.
  const blocks = Math.floor(s.dist / DASH_BLOCK);
  if (blocks > s.blocks) {
    s.blocks = blocks;
    s.score += 10;
    out.push({ type: 'block', blocks, pts: 10 });
  }
  // Waves.
  s.nextWave -= step;
  if (s.nextWave <= 0) {
    const w = dashWave(s.t, rand, s.sincePower);
    let power = false;
    for (const sp of w) {
      s.objs.push({ kind: sp.kind, lane: sp.lane, lane0: sp.lane, to: sp.to ?? sp.lane, z: DASH_SPAWN_Z + sp.dz + 140, t: 0, done: false, passed: false, seed: Math.floor(s.dist + sp.dz) });
      if (sp.kind === 'magnet' || sp.kind === 'helmet' || sp.kind === 'turbo') power = true;
    }
    s.sincePower = power ? 0 : s.sincePower + 1;
    s.nextWave = dashWaveLength(w) + 380 + rand() * 220;
  }
  const mult = dashMult(s.streak, turbo);
  for (const o of s.objs) {
    if (o.done) continue;
    const info = DASH_INFO[o.kind];
    const prevZ = o.z;
    o.z -= step;
    o.t += dt;
    o.lane = objLane(o);
    // The 🧲 pulls pickups into your lane.
    if (s.magnet > 0 && info.type === 'pickup' && o.z < 650 && o.z > -20) o.lane += (s.pl - o.lane) * Math.min(1, dt * 7);
    const near = Math.abs(o.lane - s.pl);
    // Overlapping the scooter along the road (with a little forgiveness at the back).
    const over = (o.z <= 18 && o.z + info.len >= -10) || (prevZ > 18 && o.z + info.len < -10);
    if (info.type === 'pickup') {
      if (over && near < DASH_GRAB_LANE) {
        o.done = true;
        if (o.kind === 'cash' || o.kind === 'order') {
          s.streak++;
          s.bestStreak = Math.max(s.bestStreak, s.streak);
          const m = dashMult(s.streak, turbo);
          const pts = info.pts * m;
          s.score += pts;
          if (o.kind === 'cash') s.cash++;
          else s.orders++;
          out.push({ type: 'grab', kind: o.kind, lane: o.lane, pts, mult: m });
        } else if (o.kind === 'magnet' || o.kind === 'helmet' || o.kind === 'turbo') {
          if (o.kind === 'magnet') s.magnet = DASH_MAGNET_S;
          if (o.kind === 'helmet') s.helmet = true;
          if (o.kind === 'turbo') s.turbo = DASH_TURBO_S;
          out.push({ type: 'power', kind: o.kind });
        }
      }
    } else if (!o.passed && over && near < DASH_HIT_LANE) {
      if (info.type === 'low' && s.hop > DASH_CLEAR) {
        // Cleared it in the air (scored once it's behind you).
      } else {
        o.passed = true;
        if (turbo) {
          o.done = true;
          s.score += 10 * mult;
          out.push({ type: 'smash', kind: o.kind, lane: o.lane, pts: 10 * mult });
        } else if (s.invuln > 0) {
          // Still blinking from the last one.
        } else if (s.helmet) {
          s.helmet = false;
          s.invuln = 1;
          out.push({ type: 'saved', kind: o.kind, lane: o.lane });
        } else {
          s.lives--;
          s.streak = 0;
          s.invuln = 1.3;
          out.push({ type: 'hit', kind: o.kind, lane: o.lane, lives: s.lives });
          if (s.lives <= 0) {
            s.dead = s.over = true;
            out.push({ type: 'end', reason: 'crash', bonus: 0 });
            return;
          }
        }
      }
    }
    // Behind you: close calls and clean hops.
    if (!o.passed && info.type !== 'pickup' && o.z + info.len < -10) {
      o.passed = true;
      if (info.type === 'low' && near < DASH_HIT_LANE) {
        s.score += 5 * mult;
        out.push({ type: 'hopped', kind: o.kind, lane: o.lane, pts: 5 * mult });
      } else if (info.type === 'tall' && near < 1.35 && s.t - s.lastSteer < 0.7) {
        s.score += 10 * mult;
        out.push({ type: 'close', kind: o.kind, lane: o.lane, pts: 10 * mult });
      }
    }
    if (o.z + info.len < -260) o.done = true;
  }
  // Tidy: grabbed, smashed and far-behind things leave the road (in place, no new array).
  let j = 0;
  for (let i = 0; i < s.objs.length; i++) if (!s.objs[i].done) s.objs[j++] = s.objs[i];
  s.objs.length = j;
  if (s.t >= s.end) {
    s.over = true;
    const bonus = 100 * s.lives;
    s.score += bonus;
    out.push({ type: 'end', reason: 'time', bonus });
  }
}

/** 🎟️ for a score: a good shift (≈5,000) is about 40. */
export const dashTickets = (score: number): number => Math.floor(Math.max(0, score) / 120);

/** Highest score the server should accept. */
export const DASH_MAX = 30000;
