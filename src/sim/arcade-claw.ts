// =====================================================================
// arcade-claw.ts (sim) — the physics and rules of 🧸 Claw Machine
// (ui/arcade/claw.ts), kept pure so they can be tested and so a bot can
// play it headless.
//
// A side view of the cabinet in canvas px (360×480). The plushies are
// little rigid bodies made of one or two circles (Verlet particles with
// a distance constraint), piled up under gravity. The claw hangs from a
// gantry on a cable and swings like a pendulum when the gantry speeds
// up or stops. Drop it: it falls until its palm lands on something,
// the two fingers close until they touch the prize, and the GRIP is
// worked out from how centred the palm is, whether the fingertips got
// under the prize's middle, its fabric, its weight, how much the claw
// was swinging and the house's claw strength this try. On the way up
// and across, the LOAD (weight, the swing's jolts, a grab off the
// prize's middle, the classic loosen-at-the-top) is pitted against the
// grip: when the load wins the prize sags in the fingers and, if it
// sags far enough, slips out, keeping the claw's swing. Anything that
// drops past the plexi wall into the chute is won: carried, slipped or
// knocked.
// =====================================================================

export type Rand = () => number;

/** The cabinet: walls, floor, rail, the chute's plexi wall. */
export const CAB = { L: 18, R: 342, FLOOR: 428, RAIL: 46, WALL_X: 90, WALL_TOP: 338, CHUTE_X: 54 } as const;
export const GRAV = 1500;
export const TRIES = 3;
export const AIM_TIME = 15;

export interface PlushKind {
  id: string;
  emoji: string;
  /** Circles in body space (px). */
  parts: ReadonlyArray<{ x: number; y: number; r: number }>;
  value: number;
  /** How well fingers bite into it (a bear's fur 1, a glazed donut 0.6). */
  fabric: number;
  /** Mass relative to the teddy (1). */
  mass: number;
}

export const PLUSH: ReadonlyArray<PlushKind> = [
  { id: 'bear', emoji: '🧸', parts: [{ x: 0, y: 0, r: 21 }], value: 20, fabric: 1, mass: 1 },
  { id: 'pigeon', emoji: '🐦', parts: [{ x: 0, y: 0, r: 15 }], value: 10, fabric: 0.95, mass: 0.55 },
  { id: 'duck', emoji: '🦆', parts: [{ x: 0, y: 0, r: 16 }], value: 10, fabric: 0.9, mass: 0.6 },
  { id: 'donut', emoji: '🍩', parts: [{ x: 0, y: 0, r: 16 }], value: 15, fabric: 0.62, mass: 0.6 },
  { id: 'pizza', emoji: '🍕', parts: [{ x: -9, y: 0, r: 13 }, { x: 9, y: 0, r: 13 }], value: 15, fabric: 0.95, mass: 0.75 },
  { id: 'rat', emoji: '🐀', parts: [{ x: -11, y: 2, r: 12 }, { x: 11, y: 2, r: 12 }], value: 15, fabric: 0.9, mass: 0.7 },
  { id: 'unicorn', emoji: '🦄', parts: [{ x: -10, y: 0, r: 17 }, { x: 10, y: 0, r: 17 }], value: 30, fabric: 0.95, mass: 1.35 },
  { id: 'liberty', emoji: '🗽', parts: [{ x: 0, y: -13, r: 14 }, { x: 0, y: 11, r: 17 }], value: 40, fabric: 0.97, mass: 1.3 },
];
export const PLUSH_BY_ID: Record<string, PlushKind> = Object.fromEntries(PLUSH.map((k) => [k.id, k]));

export interface Particle { x: number; y: number; px: number; py: number; r: number; w: number }
export interface Body {
  id: number;
  kind: PlushKind;
  shiny: boolean;
  ps: Particle[];
  /** Rest length (two-circle bodies) and rest angle. */
  rest: number;
  rest0: number;
  /** Drawing angle (single circles roll). */
  angle: number;
  won: boolean;
}

/** Points for a prize: its value, ×2 if ✨ shiny. */
export const prizeValue = (b: { kind: PlushKind; shiny: boolean }): number => b.kind.value * (b.shiny ? 2 : 1);

export function com(b: Body): { x: number; y: number } {
  let x = 0, y = 0, m = 0;
  for (const p of b.ps) {
    const k = p.r * p.r;
    x += p.x * k;
    y += p.y * k;
    m += k;
  }
  return { x: x / m, y: y / m };
}
/** Half its width and height (for centring and depth). */
export function extent(b: Body): { hw: number; hh: number } {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of b.ps) {
    x0 = Math.min(x0, p.x - p.r);
    x1 = Math.max(x1, p.x + p.r);
    y0 = Math.min(y0, p.y - p.r);
    y1 = Math.max(y1, p.y + p.r);
  }
  return { hw: (x1 - x0) / 2, hh: (y1 - y0) / 2 };
}
export function bodyAngle(b: Body): number {
  if (b.ps.length < 2) return b.angle;
  return Math.atan2(b.ps[1].y - b.ps[0].y, b.ps[1].x - b.ps[0].x) - b.rest0;
}

// ------------------------------------------------------------- grip/slip
export interface GripIn {
  /** Palm ↔ prize centre, sideways (px). */
  offset: number;
  /** The prize's half-width (px). */
  hw: number;
  /** How far the fingertips got below the prize's centre, ÷ its half-height (−1 above … +1 under). */
  depth: number;
  fabric: number;
  mass: number;
  /** The claw's swing when it closed: angle (rad) and angular speed (rad/s). */
  swing: number;
  swingV: number;
  /** This try's claw strength (the house sets it, ~0.85–1.05). */
  power: number;
}

/** How hard the claw holds, 0–1. Centred, deep, calm, light and fuzzy is strong. */
export function clawGrip(f: GripIn): number {
  const o = Math.abs(f.offset) / Math.max(1, f.hw);
  const centring = Math.max(0.05, 1 - 2.2 * o * o);
  const depth = Math.max(0.3, Math.min(1, 0.82 + f.depth * 0.4));
  const weight = Math.max(0.4, Math.min(1, 1.2 - f.mass * 0.2));
  const calm = Math.max(0.35, 1 - Math.abs(f.swing) * 2.2 - Math.abs(f.swingV) * 0.1);
  return Math.max(0, Math.min(1, centring * depth * f.fabric * weight * calm * f.power));
}

/**
 * The load on the grip while lifting and carrying: the prize's weight,
 * the jolts of the swing (the claw's acceleration ÷ g), a grab off the
 * prize's middle (it hangs and twists), and a spike at the top.
 */
export function clawLoad(f: { mass: number; accel: number; offCentre: number; jerk: number }): number {
  return f.mass * 0.36 + (Math.abs(f.accel) / GRAV) * 0.55 + Math.min(1, Math.abs(f.offCentre) / 24) * 0.12 + f.jerk;
}

/** Sag (px) the prize slips per second when the load beats the grip. */
export const SAG_RATE = 320;
/** It falls out past this much sag. */
export const SAG_MAX = 13;
/** A weak grab (below this) closes on nothing but fluff. */
export const GRIP_MIN = 0.12;
/** The loosen-at-the-top spike and how long it lasts. */
export const TOP_JERK = 0.22, TOP_JERK_T = 0.2;

// ---------------------------------------------------------- the claw rig
/** Finger angles (rad from straight down): open and fully closed. */
export const A_OPEN = 1.05, A_CLOSED = 0.12;
export const CLAW = { HUB_R: 13, UP: 26, LOW: 22, SHOULDER: 8, L_MIN: 44, DROP_V: 230, LIFT_V: 150, MAXV: 190, ACC: 900, CARRY_V: 170 } as const;
const L_MAX = CAB.FLOOR - 46 - (CAB.RAIL + 14);
/** The swing's arm (px): the claw pivots on the gantry's cable guide. */
export const SWING_ARM = 70;

export interface Seg { x0: number; y0: number; x1: number; y1: number }

/** The two finger segments of one side (s = −1 left, +1 right) at angle a, hub at (hx, hy), tilted by th. */
export function finger(hx: number, hy: number, th: number, s: number, a: number): [Seg, Seg] {
  const c = Math.cos(th), sn = Math.sin(th);
  const rot = (x: number, y: number) => ({ x: hx + x * c + y * sn, y: hy - x * sn + y * c });
  const sx = s * CLAW.SHOULDER, sy = 6;
  const ex = sx + s * Math.sin(a) * CLAW.UP, ey = sy + Math.cos(a) * CLAW.UP;
  const b = a - 1.25;
  const tx = ex + s * Math.sin(b) * CLAW.LOW, ty = ey + Math.cos(b) * CLAW.LOW;
  const S = rot(sx, sy), E = rot(ex, ey), T = rot(tx, ty);
  return [{ x0: S.x, y0: S.y, x1: E.x, y1: E.y }, { x0: E.x, y0: E.y, x1: T.x, y1: T.y }];
}

// ----------------------------------------------------------------- game
export type ClawPhase = 'aim' | 'drop' | 'close' | 'lift' | 'carry' | 'release' | 'settle' | 'over';
export type ClawEvent =
  | { kind: 'drop' }
  | { kind: 'land'; x: number; y: number }
  | { kind: 'grab'; grip: number; body: Body }
  | { kind: 'whiff' }
  | { kind: 'top' }
  | { kind: 'sag'; body: Body }
  | { kind: 'slip'; body: Body; x: number; y: number }
  | { kind: 'release' }
  | { kind: 'win'; body: Body; value: number; lucky: boolean }
  | { kind: 'tryEnd'; won: number }
  | { kind: 'over'; score: number };

export interface ClawInput {
  /** Hold to move: −1 left, +1 right. */
  dir: number;
  /** Or steer toward this x (a finger on the glass); null = none. */
  target: number | null;
  drop: boolean;
}

export class ClawGame {
  bodies: Body[] = [];
  phase: ClawPhase = 'aim';
  try = 1;
  score = 0;
  wonThisTry = 0;
  aimLeft = AIM_TIME;
  /** Gantry x and speed; cable length; pendulum angle and speed. */
  gx: number = CAB.CHUTE_X;
  gv = 0;
  L: number = CLAW.L_MIN;
  th = 0;
  thv = 0;
  /** Finger angles (left, right). */
  aL = A_OPEN;
  aR = A_OPEN;
  grip = 0;
  sag = 0;
  held: Body | null = null;
  heldP: Particle | null = null;
  /** The held particle's place relative to the palm. */
  hold = { x: 0, y: 0 };
  target: Body | null = null;
  power = 1;
  jerkT = 0;
  timer = 0;
  liftV = 0;
  /** Palm ↔ target centre when the palm landed. */
  landOff = 0;
  /** The palm's acceleration (for the load). */
  accel = 0;
  private lastHx = 0;
  private lastHv = 0;
  private lastHy = 0;
  private lastHvy = 0;
  private nextId = 1;
  private releasedThisTry = false;
  events: ClawEvent[] = [];
  readonly rand: Rand;

  constructor(rand: Rand = Math.random, opts: { count?: number; settle?: number } = {}) {
    this.rand = rand;
    this.fill(opts.count ?? 13);
    // Let the pile settle before the coin goes in.
    const s = opts.settle ?? 4;
    for (let t = 0; t < s; t += 1 / 60) this.physics(1 / 60);
    // Anything that tumbled over the wall while settling goes back on the shelf.
    this.bodies = this.bodies.filter((b) => !b.won && com(b).x > CAB.WALL_X);
    this.events.length = 0;
    this.newTry();
    this.lastHx = this.hub().x;
    this.lastHy = this.hub().y;
  }

  /** Plushies dropped in over the floor, one or two ✨ shiny. */
  private fill(n: number): void {
    const r = this.rand;
    const shinyAt = new Set<number>([Math.floor(r() * n)]);
    if (r() < 0.3) shinyAt.add(Math.floor(r() * n));
    // A few teddies and pigeons, the big prizes rarer.
    const pool = ['bear', 'bear', 'pigeon', 'pigeon', 'duck', 'donut', 'pizza', 'rat', 'unicorn', 'liberty', 'bear', 'duck', 'rat', 'pizza'];
    for (let i = 0; i < n; i++) {
      const kind = PLUSH_BY_ID[pool[Math.floor(r() * pool.length)]];
      const x = CAB.WALL_X + 34 + r() * (CAB.R - CAB.WALL_X - 60);
      const y = CAB.FLOOR - 40 - (i % 4) * 50 - r() * 30;
      this.add(kind, x, y, r() * Math.PI * 2 * 0.2 - 0.2, shinyAt.has(i));
    }
  }

  add(kind: PlushKind, x: number, y: number, rot = 0, shiny = false): Body {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ps = kind.parts.map((q) => {
      const px = x + q.x * c - q.y * s, py = y + q.x * s + q.y * c;
      return { x: px, y: py, px, py, r: q.r, w: 1 / (kind.mass * (q.r * q.r) / 300) };
    });
    const rest = ps.length > 1 ? Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y) : 0;
    const rest0 = ps.length > 1 ? Math.atan2(kind.parts[1].y - kind.parts[0].y, kind.parts[1].x - kind.parts[0].x) : 0;
    const b: Body = { id: this.nextId++, kind, shiny, ps, rest, rest0, angle: rot, won: false };
    this.bodies.push(b);
    return b;
  }

  private newTry(): void {
    this.phase = 'aim';
    this.aimLeft = AIM_TIME;
    this.wonThisTry = 0;
    this.releasedThisTry = false;
    // The house sets the claw's strength each go.
    this.power = 0.84 + this.rand() * 0.18;
    this.aL = this.aR = A_OPEN;
    this.grip = 0;
    this.sag = 0;
  }

  /**
   * Where the palm is. The cable runs through a guide on the gantry, so
   * the claw swings about a short arm (SWING_ARM): a swing knocks the palm
   * a few px sideways whatever the depth, it doesn't grow down the cable.
   */
  hub(): { x: number; y: number } {
    return { x: this.gx + SWING_ARM * Math.sin(this.th), y: CAB.RAIL + 14 + this.L - SWING_ARM * (1 - Math.cos(this.th)) };
  }

  fingers(): Seg[] {
    const h = this.hub();
    return [...finger(h.x, h.y, this.th, -1, this.aL), ...finger(h.x, h.y, this.th, 1, this.aR)];
  }

  /** One frame (dt ≤ 0.05 s). */
  step(dt: number, input: ClawInput): void {
    // ---- the gantry
    let vdes = 0;
    const lo = CAB.L + 30, hi = CAB.R - 24;
    if (this.phase === 'aim') {
      if (input.target !== null) vdes = Math.max(-CLAW.MAXV, Math.min(CLAW.MAXV, (input.target - this.gx) * 7));
      else vdes = input.dir * CLAW.MAXV;
      this.aimLeft -= dt;
      if (input.drop || this.aimLeft <= 0) this.startDrop();
    } else if (this.phase === 'carry') {
      vdes = Math.max(-CLAW.CARRY_V, Math.min(CLAW.CARRY_V, (CAB.CHUTE_X - this.gx) * 4));
    }
    const dv = Math.max(-CLAW.ACC * dt, Math.min(CLAW.ACC * dt, vdes - this.gv));
    this.gv += dv;
    const nx = Math.max(lo, Math.min(hi, this.gx + this.gv * dt));
    if (nx !== this.gx + this.gv * dt) this.gv = 0;
    this.gx = nx;
    const ga = dv / Math.max(dt, 1e-4);
    // ---- the pendulum about the cable guide (half the gantry's push reaches the claw)
    const L = SWING_ARM;
    this.thv += (-(GRAV / L) * Math.sin(this.th) - ((ga * 0.5) / L) * Math.cos(this.th) - 2.2 * this.thv) * dt;
    this.th = Math.max(-0.6, Math.min(0.6, this.th + this.thv * dt));

    // ---- the claw's job
    const h = this.hub();
    this.timer += dt;
    if (this.phase === 'drop') {
      this.L = Math.min(L_MAX, this.L + CLAW.DROP_V * dt);
      if (this.palmTouches() || this.L >= L_MAX) {
        this.phase = 'close';
        this.timer = 0;
        this.target = this.pickTarget();
        // Centring is judged where the palm lands: closing fingers shove the prize to the middle
        // anyway, but a prize grabbed off its middle sits crooked and loose.
        this.landOff = this.target ? com(this.target).x - h.x : 0;
        this.events.push({ kind: 'land', x: h.x, y: h.y });
      }
    } else if (this.phase === 'close') {
      if (this.timer > 0.1) {
        const rate = 2.4 * dt;
        const t = this.target;
        let doneL = this.aL <= A_CLOSED, doneR = this.aR <= A_CLOSED;
        if (!doneL) (this.aL = Math.max(A_CLOSED, this.aL - rate), (doneL = !!t && this.touches(t, -1)));
        if (!doneR) (this.aR = Math.max(A_CLOSED, this.aR - rate), (doneR = !!t && this.touches(t, 1)));
        if ((doneL || this.aL <= A_CLOSED) && (doneR || this.aR <= A_CLOSED)) this.grab();
      }
    } else if (this.phase === 'lift') {
      // Eases in and out (the motor), so the only jolt at the top is the house's.
      this.liftV = Math.min(CLAW.LIFT_V, this.liftV + 400 * dt, (this.L - CLAW.L_MIN) * 3 + 25);
      this.L = Math.max(CLAW.L_MIN, this.L - this.liftV * dt);
      if (this.L <= CLAW.L_MIN) {
        this.phase = 'carry';
        this.timer = 0;
        // The classic: the claw loosens at the top.
        if (this.held) this.jerkT = TOP_JERK_T;
        this.events.push({ kind: 'top' });
      }
    } else if (this.phase === 'carry') {
      if (Math.abs(this.gx - CAB.CHUTE_X) < 1.5 && Math.abs(this.gv) < 8 && this.timer > 0.3) {
        this.phase = 'release';
        this.timer = 0;
      }
    } else if (this.phase === 'release') {
      if (this.timer > 0.25 && this.aL < A_OPEN) {
        if (this.held) this.letGo();
        this.aL = Math.min(A_OPEN, this.aL + 3 * dt);
        this.aR = Math.min(A_OPEN, this.aR + 3 * dt);
        if (this.aL >= A_OPEN) this.events.push({ kind: 'release' });
      }
      if (this.timer > 0.6) {
        this.phase = 'settle';
        this.timer = 0;
      }
    } else if (this.phase === 'settle') {
      if (this.timer > 1.1) {
        this.events.push({ kind: 'tryEnd', won: this.wonThisTry });
        if (this.try >= TRIES) {
          this.phase = 'over';
          this.events.push({ kind: 'over', score: this.score });
        } else {
          this.try++;
          this.newTry();
        }
      }
    }

    // ---- the palm's acceleration and the load on the grip
    const nh = this.hub();
    const hv = (nh.x - this.lastHx) / Math.max(dt, 1e-4), hvy = (nh.y - this.lastHy) / Math.max(dt, 1e-4);
    const ax = (hv - this.lastHv) / Math.max(dt, 1e-4), ay = (hvy - this.lastHvy) / Math.max(dt, 1e-4);
    this.accel += (Math.hypot(ax, ay) - this.accel) * Math.min(1, dt * 10); // smoothed
    this.lastHx = nh.x;
    this.lastHy = nh.y;
    this.lastHv = hv;
    this.lastHvy = hvy;
    if (this.held && (this.phase === 'lift' || this.phase === 'carry' || this.phase === 'release')) {
      this.jerkT = Math.max(0, this.jerkT - dt);
      const c = com(this.held);
      const load = clawLoad({ mass: this.held.kind.mass, accel: this.accel, offCentre: c.x - nh.x, jerk: this.jerkT > 0 ? TOP_JERK : 0 });
      if (load > this.grip) {
        const before = this.sag;
        this.sag += (load - this.grip) * SAG_RATE * dt;
        if (before < 3 && this.sag >= 3) this.events.push({ kind: 'sag', body: this.held });
        if (this.sag > SAG_MAX) {
          const b = this.held;
          this.letGo();
          this.events.push({ kind: 'slip', body: b, x: c.x, y: c.y });
        }
      }
    }

    this.physics(dt);
    this.collect();
  }

  startDrop(): void {
    if (this.phase !== 'aim') return;
    this.phase = 'drop';
    this.timer = 0;
    this.events.push({ kind: 'drop' });
  }

  /** The palm (hub) sits on a prize? */
  private palmTouches(): boolean {
    const h = this.hub();
    const hy = h.y + 6;
    for (const b of this.bodies) for (const p of b.ps) if (Math.hypot(p.x - h.x, p.y - hy) < p.r + CLAW.HUB_R + 1) return true;
    return false;
  }

  /** The prize between the fingers: the one whose middle is nearest the palm, inside the cup. */
  private pickTarget(): Body | null {
    const h = this.hub();
    let best: Body | null = null, bd = Infinity;
    for (const b of this.bodies) {
      if (b.won) continue;
      const c = com(b);
      const inCup = b.ps.some((p) => Math.abs(p.x - h.x) < 30 + p.r * 0.5 && p.y > h.y - 4 && p.y - p.r < h.y + 52);
      if (!inCup) continue;
      const d = Math.abs(c.x - h.x) + Math.max(0, c.y - (h.y + 30)) * 0.5;
      if (d < bd) (bd = d), (best = b);
    }
    return best;
  }

  private touches(b: Body, s: number): boolean {
    const h = this.hub();
    const segs = finger(h.x, h.y, this.th, s, s < 0 ? this.aL : this.aR);
    for (const p of b.ps) for (const g of segs) if (segDist(p.x, p.y, g).d < p.r + 4) return true;
    return false;
  }

  private grab(): void {
    const t = this.target;
    const h = this.hub();
    this.phase = 'lift';
    this.timer = 0;
    this.sag = 0;
    this.liftV = 0;
    if (!t) {
      this.events.push({ kind: 'whiff' });
      return;
    }
    const c = com(t), e = extent(t);
    const tips = this.fingers();
    const tipY = (tips[1].y1 + tips[3].y1) / 2;
    const grip = clawGrip({
      offset: this.landOff,
      hw: e.hw,
      depth: (tipY - c.y) / Math.max(8, e.hh),
      fabric: t.kind.fabric,
      mass: t.kind.mass,
      swing: this.th,
      swingV: this.thv,
      power: this.power,
    }) + (this.rand() - 0.5) * 0.06;
    this.grip = Math.max(0, Math.min(1, grip));
    if (this.grip < GRIP_MIN) {
      this.events.push({ kind: 'whiff' });
      return;
    }
    // Hold the particle nearest the palm.
    let hp = t.ps[0], hd = Infinity;
    for (const p of t.ps) {
      const d = Math.hypot(p.x - h.x, p.y - (h.y + 30));
      if (d < hd) (hd = d), (hp = p);
    }
    this.held = t;
    this.heldP = hp;
    // Held where it was gripped (no snap: a snap would bulldoze the neighbours).
    this.hold = { x: Math.max(-18, Math.min(18, hp.x - h.x)), y: Math.max(8, Math.min(50, hp.y - h.y)) };
    this.events.push({ kind: 'grab', grip: this.grip, body: t });
  }

  private letGo(): void {
    if (this.phase !== 'release' && this.phase !== 'settle') {
      // A slip: the fingers spring open a little.
      this.aL = Math.min(A_OPEN, this.aL + 0.25);
      this.aR = Math.min(A_OPEN, this.aR + 0.25);
    } else this.releasedThisTry = true;
    this.held = null;
    this.heldP = null;
  }

  /** Prizes past the plexi wall, down the chute: won. */
  private collect(): void {
    for (const b of this.bodies) {
      if (b.won || b === this.held) continue;
      const c = com(b);
      if (c.x < CAB.WALL_X - 2 && c.y > CAB.FLOOR + 8) {
        b.won = true;
        const value = prizeValue(b);
        this.score += value;
        this.wonThisTry++;
        this.events.push({ kind: 'win', body: b, value, lucky: !this.releasedThisTry });
      }
    }
    if (this.bodies.some((b) => b.won)) this.bodies = this.bodies.filter((b) => !b.won);
  }

  // ------------------------------------------------------------ physics
  private contacts: { a: Particle; b: Particle | null; nx: number; ny: number }[] = [];

  physics(dt: number): void {
    const SUB = 2, ITER = 5;
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      const hub = this.hub();
      // Integrate.
      for (const b of this.bodies) {
        for (const p of b.ps) {
          if (p === this.heldP) {
            const tx = hub.x + this.hold.x, ty = hub.y + this.hold.y + this.sag;
            p.px = p.x;
            p.py = p.y;
            p.x = tx;
            p.y = ty;
            continue;
          }
          let vx = (p.x - p.px) * 0.996, vy = (p.y - p.py) * 0.996;
          // A speed cap: nothing in a claw machine moves faster than a dropped plush.
          const sp = Math.hypot(vx, vy), cap = MAX_SPEED * h;
          if (sp > cap) (vx *= cap / sp), (vy *= cap / sp);
          p.px = p.x;
          p.py = p.y;
          p.x += vx;
          p.y += vy + GRAV * h * h;
        }
      }
      // The claw only shoves plush while it closes: on the way down the open fingers sink in (plush
      // squashes), and once closed only the prize it grips comes along (no scooping a loose one).
      const touchy = this.phase === 'close' || this.phase === 'drop';
      const segs = this.phase === 'close' ? this.fingers() : [];
      for (let it = 0; it < ITER; it++) {
        const last = it === ITER - 1;
        if (last) this.contacts.length = 0;
        // The bodies hold their shape.
        for (const b of this.bodies) {
          if (b.ps.length < 2) continue;
          const p = b.ps[0], q = b.ps[1];
          const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
          const wp = p === this.heldP ? 0 : p.w, wq = q === this.heldP ? 0 : q.w;
          const k = (d - b.rest) / d / (wp + wq || 1);
          p.x += dx * k * wp;
          p.y += dy * k * wp;
          q.x -= dx * k * wq;
          q.y -= dy * k * wq;
        }
        // Plush on plush.
        const all = this.bodies;
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) {
            for (const p of all[i].ps) {
              for (const q of all[j].ps) {
                const dx = q.x - p.x, dy = q.y - p.y, rr = p.r + q.r;
                if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
                const d = Math.hypot(dx, dy);
                if (d >= rr || d < 1e-6) continue;
                const wp = p === this.heldP ? 0 : p.w, wq = q === this.heldP ? 0 : q.w;
                if (!wp && !wq) continue;
                const k = (rr - d) / d / (wp + wq);
                p.x -= dx * k * wp;
                p.y -= dy * k * wp;
                q.x += dx * k * wq;
                q.y += dy * k * wq;
                // Shoved by the prize in the claw (it can't give): a shove, not a launch.
                if (!wp) (q.px += dx * k * wq * CLAW_SOAK), (q.py += dy * k * wq * CLAW_SOAK);
                if (!wq) (p.px -= dx * k * wp * CLAW_SOAK), (p.py -= dy * k * wp * CLAW_SOAK);
                if (last) this.contacts.push({ a: p, b: q, nx: dx / d, ny: dy / d });
              }
            }
          }
        }
        // The claw (palm and fingers) pushes everything but what it's holding.
        for (const b of this.bodies) {
          if (b === this.held || !touchy) continue;
          for (const p of b.ps) {
            const hy = hub.y + 4;
            {
              const dx = p.x - hub.x, dy = p.y - hy, d = Math.hypot(dx, dy), rr = p.r + CLAW.HUB_R;
              // The palm rests on what's below it (the drop stops there); it never shoves the pile down.
              if (d < rr && d > 1e-6 && dy < 0) {
                const cx = (dx / d) * (rr - d), cy = (dy / d) * (rr - d);
                p.x += cx;
                p.y += cy;
                // A shove, not a launch: most of the correction doesn't turn into speed.
                p.px += cx * CLAW_SOAK;
                p.py += cy * CLAW_SOAK;
                if (last) this.contacts.push({ a: p, b: null, nx: -dx / d, ny: -dy / d });
              }
            }
            // The fingers squeeze only the prize they're closing on (the rest of the pile is soft).
            if (b !== this.target) continue;
            for (let si = 0; si < segs.length; si++) {
              const sd = segDist(p.x, p.y, segs[si]);
              const rr = p.r + 3;
              // One-sided: a finger closes on what's between the fingers. Plush it sank into on the
              // way down, on its outer side, it slides past (rather than scooping it out and up).
              const side = si < 2 ? -1 : 1;
              if (sd.d < rr && (p.x - sd.x) * side <= 0) {
                const nx = sd.d > 1e-6 ? (p.x - sd.x) / sd.d : 0, ny = sd.d > 1e-6 ? (p.y - sd.y) / sd.d : -1;
                const ox = p.x, oy = p.y;
                // Sideways or up, never down: a claw can't press plush into the bed (that squeeze
                // would pressurise the pile and pop prizes out of it). And gently: fingers that sank
                // in on the way down ease the prize to the middle instead of snapping it there.
                p.x = ox + clampAbs(sd.x + nx * rr - ox, MAX_PUSH);
                p.y = Math.min(oy, oy + clampAbs(sd.y + ny * rr - oy, MAX_PUSH));
                p.px += (p.x - ox) * CLAW_SOAK;
                p.py += (p.y - oy) * CLAW_SOAK;
                if (last) this.contacts.push({ a: p, b: null, nx: -nx, ny: -ny });
              }
            }
          }
        }
        // The cabinet: walls, floor (none over the chute), the plexi wall, the roof.
        for (const b of this.bodies) {
          for (const p of b.ps) {
            if (p === this.heldP) continue;
            if (p.x < CAB.L + p.r) p.x = CAB.L + p.r;
            if (p.x > CAB.R - p.r) p.x = CAB.R - p.r;
            if (p.y < CAB.RAIL + p.r) p.y = CAB.RAIL + p.r;
            if (p.x > CAB.WALL_X && p.y > CAB.FLOOR - p.r) {
              p.y = CAB.FLOOR - p.r;
              if (last) this.contacts.push({ a: p, b: null, nx: 0, ny: 1 });
            }
            const sd = segDist(p.x, p.y, WALL);
            const rr = p.r + 2;
            if (sd.d < rr) {
              const nx = sd.d > 1e-6 ? (p.x - sd.x) / sd.d : 1, ny = sd.d > 1e-6 ? (p.y - sd.y) / sd.d : 0;
              p.x = sd.x + nx * rr;
              p.y = sd.y + ny * rr;
              if (last) this.contacts.push({ a: p, b: null, nx: -nx, ny: -ny });
            }
          }
        }
      }
      // Friction at the contacts: plush is grippy, it stacks.
      for (const c of this.contacts) {
        const a = c.a;
        const avx = a.x - a.px, avy = a.y - a.py;
        const bvx = c.b ? c.b.x - c.b.px : 0, bvy = c.b ? c.b.y - c.b.py : 0;
        const rvx = avx - bvx, rvy = avy - bvy;
        const vn = rvx * c.nx + rvy * c.ny;
        const tx = rvx - vn * c.nx, ty = rvy - vn * c.ny;
        const mu = 0.35;
        const wa = a === this.heldP ? 0 : a.w, wb = c.b ? (c.b === this.heldP ? 0 : c.b.w) : 0;
        const sum = wa + wb || 1;
        // Plush doesn't bounce: soak up most of a separating speed (what the solver's pushes
        // create), so a squeeze in the pile can't launch a prize across the box.
        if (vn < 0) {
          const dv = vn * 0.75;
          if (wa) {
            a.px += dv * c.nx * (c.b ? wa / sum : 1);
            a.py += dv * c.ny * (c.b ? wa / sum : 1);
          }
          if (c.b && wb) {
            c.b.px -= dv * c.nx * (wb / sum);
            c.b.py -= dv * c.ny * (wb / sum);
          }
        }
        a.px += tx * mu * (c.b ? wa / sum : 1) * (wa ? 1 : 0);
        a.py += ty * mu * (c.b ? wa / sum : 1) * (wa ? 1 : 0);
        if (c.b && wb) {
          c.b.px -= tx * mu * (wb / sum);
          c.b.py -= ty * mu * (wb / sum);
        }
      }
      // Rest: kill the micro-jitter of a settled pile; single circles roll.
      for (const b of this.bodies) {
        for (const p of b.ps) {
          if (p === this.heldP) continue;
          if (Math.abs(p.x - p.px) < 0.02 && Math.abs(p.y - p.py) < 0.02) {
            p.px = p.x;
            p.py = p.y;
          }
        }
        if (b.ps.length === 1) b.angle += (b.ps[0].x - b.ps[0].px) / b.ps[0].r;
      }
    }
  }
}

/** How much of a shove from the claw is soaked up (not turned into speed), and a speed cap (px/s). */
const CLAW_SOAK = 0.8;
/** Most a finger moves a prize per solver pass (px). */
const MAX_PUSH = 0.6;
const clampAbs = (v: number, m: number) => (v > m ? m : v < -m ? -m : v);
const MAX_SPEED = 900;
const WALL: Seg = { x0: CAB.WALL_X, y0: CAB.WALL_TOP, x1: CAB.WALL_X, y1: CAB.FLOOR + 30 };

/** Distance from a point to a segment, and the nearest point. */
export function segDist(px: number, py: number, s: Seg): { d: number; x: number; y: number } {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / L2));
  const x = s.x0 + dx * t, y = s.y0 + dy * t;
  return { d: Math.hypot(px - x, py - y), x, y };
}

/** Tickets: ⅘ of a point (a careful coin, ~50 points of plush, is ~40 🎟️). */
export const clawTickets = (score: number): number => Math.floor((Math.max(0, score) * 4) / 5);
