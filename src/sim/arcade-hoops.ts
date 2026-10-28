// =====================================================================
// arcade-hoops.ts (sim) — the rules and physics of 🏀 Hoop Shot
// (ui/arcade/hoops.ts), kept pure so they can be tested.
//
// A Pop-A-Shot lane in metres: you stand at z = 0 and the rim hangs
// 2.6 m down the lane, 2.6 m up. A flick launches a real ball (gravity,
// a ~1 s arc) at a fixed 68° lift; the flick's speed sets the power and
// its direction the aim. Both have a forgiving middle (wider when you're
// 🔥 on fire): inside it the shot is nearly true, outside it the error
// grows one-for-one. Then the physics decides: the rim is a torus the
// ball rattles on, the glass sends long shots back (bank shots), the net
// catches makes, the ramp rolls the ball home.
//
// The camera (for the 360×480 cabinet): a pinhole behind the shooter,
// exported so the UI draws exactly what the physics simulates.
// =====================================================================

export const HOOPS_G = 9.8;
export const BALL_R = 0.12;
/** The rim: radius, height, distance down the lane, tube thickness. */
export const RIM = { R: 0.23, Y: 2.6, Z: 2.6, TUBE: 0.014 } as const;
/** The glass: its face sits this far behind the rim's centre; half-width; bottom and top. */
export const BOARD = { DZ: 0.38, HW: 0.6, Y0: 2.45, Y1: 3.35 } as const;
/** Where the ball leaves your hands (x is where you hold it). */
export const LAUNCH = { Y: 1.2, Z: 0, XMAX: 0.3 } as const;
/** Launch lift: a steep, pretty arc that drops into the rim at ~55°. */
export const ELEV = (68 * Math.PI) / 180;
/** The side nets of the cabinet, the back wall, the ramp. */
export const CAGE = { X: 1.3, BACK: RIM.Z + BOARD.DZ + 0.25 } as const;
export const floorY = (z: number): number => 0.6 + 0.12 * Math.max(0, z);

/** Camera: a pinhole at z = -2.6, eye height 1.5; F px per metre at 1 m. */
export const CAM = { Z: -2.6, Y: 1.5, F: 480, CX: 180, HZN: 290 } as const;
export const scaleAt = (z: number): number => CAM.F / Math.max(0.3, z - CAM.Z);
export function project(x: number, y: number, z: number): { x: number; y: number; s: number } {
  const s = scaleAt(z);
  return { x: CAM.CX + x * s, y: CAM.HZN - (y - CAM.Y) * s, s };
}
/** Screen heights of the launch point and the rim (the flick is aimed between them). */
export const LAUNCH_SY = project(0, LAUNCH.Y, LAUNCH.Z).y;
export const RIM_SY = project(0, RIM.Y, RIM.Z).y;

/** The flick speed (cabinet px/s) for a dead-on shot, and the forgiving middles. */
export const SWEET = 1400;
export const POWER_TOL = 0.11, POWER_TOL_FIRE = 0.2;
export const AIM_TOL = 0.06, AIM_TOL_FIRE = 0.11;
/** Inside the middle, an error is shrunk to this much. */
const SOFT = 0.2;
/** A fractional power error → fractional launch-speed error. */
const POWER_K = 0.2;

/** Shrink an error: gently inside ±tol, one-for-one past it (continuous). */
export function forgive(e: number, tol: number): number {
  const a = Math.abs(e);
  return a <= tol ? e * SOFT : Math.sign(e) * (tol * SOFT + (a - tol));
}

/** Launch speed to drop a ball from the hands into a point `d` metres away, `h` metres up, at ELEV. */
export function idealSpeed(d: number, h: number): number {
  const t = Math.tan(ELEV), c = Math.cos(ELEV);
  const den = 2 * c * c * (d * t - h);
  return Math.sqrt((HOOPS_G * d * d) / Math.max(0.05, den));
}

/** Time in the air for a dead-on shot from the middle (the UI leads the moving hoop by this). */
export const FLIGHT_T = RIM.Z / (idealSpeed(RIM.Z, RIM.Y - LAUNCH.Y) * Math.cos(ELEV));

/**
 * Where a flick points, as an x on the rim's line: the swipe's screen
 * slope (dx / -dy) from the ball, carried up to the rim's screen height
 * and read off at the rim's depth. Swipe at the hoop and you aim at it.
 */
export function aimX(x0: number, slope: number): number {
  const s0 = scaleAt(LAUNCH.Z), sh = scaleAt(RIM.Z);
  return (x0 * s0 + slope * (LAUNCH_SY - RIM_SY)) / sh;
}

export interface Shot {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** The flick's raw errors: power (fraction, + = too hard) and aim (metres, + = right). */
  ePower: number;
  eAim: number;
}

export interface Flick {
  /** Where the ball is held (metres, ±LAUNCH.XMAX). */
  x0: number;
  /** Swipe direction on screen: dx / -dy. */
  slope: number;
  /** Swipe speed, cabinet px/s. */
  speed: number;
}

/**
 * A flick → a launched ball. `targetX` is where the rim will be when the
 * ball gets there (the UI predicts the moving hoop). `rand` adds a hair
 * of wobble so two identical flicks don't always rattle the same way.
 */
export function hoopsLaunch(f: Flick, targetX: number, opts: { fire?: boolean; rand?: () => number } = {}): Shot {
  const rand = opts.rand ?? Math.random;
  const x0 = Math.max(-LAUNCH.XMAX, Math.min(LAUNCH.XMAX, f.x0));
  const ePower = f.speed / SWEET - 1;
  const eAim = aimX(x0, f.slope) - targetX;
  const p = forgive(ePower, opts.fire ? POWER_TOL_FIRE : POWER_TOL);
  const a = forgive(eAim, opts.fire ? AIM_TOL_FIRE : AIM_TOL);
  const X = targetX + a + (rand() - 0.5) * 0.03;
  const dx = X - x0, dz = RIM.Z - LAUNCH.Z;
  const d = Math.hypot(dx, dz);
  const v = idealSpeed(d, RIM.Y - LAUNCH.Y) * Math.max(0.3, 1 + p * POWER_K + (rand() - 0.5) * 0.006);
  const vh = v * Math.cos(ELEV);
  return { x: x0, y: LAUNCH.Y, z: LAUNCH.Z, vx: (vh * dx) / d, vy: v * Math.sin(ELEV), vz: (vh * dz) / d, ePower, eAim };
}

export interface Ball {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  t: number;
  rim: number;
  board: number;
  scored: boolean;
  /** Below the rim inside the net (the UI swings the net). */
  inNet: boolean;
  floor: boolean;
  done: boolean;
  /** Spin (radians, for drawing the seams). */
  spin: number;
  lastRim: number;
}

export function newBall(s: Shot): Ball {
  return { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, t: 0, rim: 0, board: 0, scored: false, inNet: false, floor: false, done: false, spin: 0, lastRim: -1 };
}

export type HoopsEventKind = 'rim' | 'board' | 'score' | 'floor' | 'cage';
export interface HoopsEvent { kind: HoopsEventKind; power: number; x: number; y: number; z: number }

/** One physics substep (keep dt ≤ 1/240). `hx` is the hoop's x right now. Events are pushed to `out`. */
export function hoopsStep(b: Ball, hx: number, dt: number, out: HoopsEvent[]): void {
  if (b.done) return;
  const py = b.y;
  b.vy -= HOOPS_G * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.t += dt;
  b.spin -= (b.vz / BALL_R) * dt * 0.5;
  const ev = (kind: HoopsEventKind, power: number) => out.push({ kind, power, x: b.x, y: b.y, z: b.z });

  // Through the hoop: crossing the rim's plane downward, inside the ring.
  const rx = b.x - hx, rz = b.z - RIM.Z;
  const L = Math.hypot(rx, rz);
  if (!b.scored && py >= RIM.Y && b.y < RIM.Y && b.vy < 0 && L < RIM.R - 0.03) {
    b.scored = true;
    ev('score', Math.hypot(b.vx, b.vy, b.vz));
  }
  // The net: it soaks up the speed and centres the ball.
  b.inNet = b.scored && b.y < RIM.Y && b.y > RIM.Y - 0.45;
  if (b.inNet) {
    const k = Math.exp(-7 * dt);
    b.vx = b.vx * k - rx * 12 * dt;
    b.vz = b.vz * k - rz * 12 * dt;
    b.vy = Math.max(b.vy, -3.2);
  }

  // The rim: a torus. Nearest point on the ring's centre circle, then sphere vs tube.
  {
    const nx0 = L > 1e-6 ? rx / L : 1, nz0 = L > 1e-6 ? rz / L : 0;
    const qx = hx + nx0 * RIM.R, qz = RIM.Z + nz0 * RIM.R;
    const dx = b.x - qx, dy = b.y - RIM.Y, dz = b.z - qz;
    const dist = Math.hypot(dx, dy, dz);
    const min = BALL_R + RIM.TUBE;
    if (dist < min && dist > 1e-6) {
      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      b.x += nx * (min - dist);
      b.y += ny * (min - dist);
      b.z += nz * (min - dist);
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) {
        const e = 0.55;
        b.vx -= (1 + e) * vn * nx;
        b.vy -= (1 + e) * vn * ny;
        b.vz -= (1 + e) * vn * nz;
        // A little friction along the rim.
        b.vx *= 0.94;
        b.vz *= 0.94;
        if (-vn > 0.35 && b.t - b.lastRim > 0.06) {
          b.rim++;
          b.lastRim = b.t;
          ev('rim', -vn);
        }
      }
    }
  }

  // The glass: its face (z = board), its top edge.
  const bz = RIM.Z + BOARD.DZ;
  const inX = Math.abs(b.x - hx) < BOARD.HW;
  if (inX && b.y > BOARD.Y0 - BALL_R * 0.5 && b.y < BOARD.Y1 && b.z + BALL_R > bz && b.z < bz + 0.04 && b.vz > 0) {
    b.z = bz - BALL_R;
    b.vz = -b.vz * 0.58;
    b.vx *= 0.92;
    b.vy *= 0.92;
    b.board++;
    ev('board', Math.abs(b.vz));
  } else if (inX && b.z > bz - BALL_R && b.z < bz + 0.04 + BALL_R && b.y - BALL_R < BOARD.Y1 && b.y > BOARD.Y1 && b.vy < 0) {
    b.y = BOARD.Y1 + BALL_R;
    b.vy = -b.vy * 0.4;
    b.vz -= 0.6;
    ev('board', Math.abs(b.vy));
  }
  // The cage: side nets and the back wall.
  if (Math.abs(b.x) > CAGE.X - BALL_R) {
    b.x = Math.sign(b.x) * (CAGE.X - BALL_R);
    if (Math.abs(b.vx) > 0.5) ev('cage', Math.abs(b.vx));
    b.vx = -b.vx * 0.3;
  }
  if (b.z > CAGE.BACK - BALL_R) {
    b.z = CAGE.BACK - BALL_R;
    if (b.vz > 0.5) ev('cage', b.vz);
    b.vz = -b.vz * 0.3;
  }
  // The ramp: bounce, then roll home.
  const fy = floorY(b.z) + BALL_R;
  if (b.y < fy) {
    b.y = fy;
    if (b.vy < -1) ev('floor', -b.vy);
    b.vy = b.vy < -1 ? -b.vy * 0.45 : 0;
    b.vx *= 0.9;
    b.floor = true;
  }
  if (b.floor && b.y <= fy + 0.01) b.vz -= HOOPS_G * 0.12 * dt * 3; // the ramp tilts toward you
  if (b.z < LAUNCH.Z - 0.3 || b.t > 5) b.done = true;
}

export interface ShotResult {
  made: boolean;
  swish: boolean;
  bank: boolean;
  rim: number;
  board: number;
  /** Seconds from release to the ball dropping through. */
  at: number;
}

/** Fly a shot to the end (tests, tuning, the bot). `hoopX(t)` = the hoop's x t seconds after release. */
export function hoopsSimulate(s: Shot, hoopX: (t: number) => number = () => 0, step = 1 / 240): ShotResult {
  const b = newBall(s);
  const out: HoopsEvent[] = [];
  let at = 0;
  while (!b.done && b.t < 5) {
    hoopsStep(b, hoopX(b.t), step, out);
    if (b.scored && !at) at = b.t;
    // A make is settled once it's through the net.
    if (b.scored && b.y < RIM.Y - 0.5) break;
    // A miss is settled once it falls well below the rim (it can't bounce back up that high).
    if (!b.scored && b.vy < 0 && b.y < RIM.Y - 0.4) break;
  }
  return outcome(b, at);
}

export function outcome(b: Ball, at = 0): ShotResult {
  return { made: b.scored, swish: b.scored && b.rim === 0 && b.board === 0, bank: b.scored && b.board > 0, rim: b.rim, board: b.board, at };
}

/** Why a shot missed, for the hint: the bigger of the two errors. */
export function missHint(e: { ePower: number; eAim: number }, fire = false): 'short' | 'long' | 'left' | 'right' | null {
  const p = Math.abs(e.ePower) / (fire ? POWER_TOL_FIRE : POWER_TOL);
  const a = Math.abs(e.eAim) / (fire ? AIM_TOL_FIRE : AIM_TOL);
  if (p < 1 && a < 1) return null;
  if (p >= a) return e.ePower < 0 ? 'short' : 'long';
  return e.eAim < 0 ? 'left' : 'right';
}

// ------------------------------------------------------------- the game
export const HOOPS_TIME = 60;
export const RACK = 5;
/** A perfect rack (5 of 5) adds this to the clock, up to RACK_BONUS_MAX in a game. */
export const RACK_BONUS_S = 5;
export const RACK_BONUS_MAX = 15;
/** The last seconds are BONUS TIME: every bucket ×2. */
export const BONUS_LAST = 10;
/** Makes in a row to catch fire. */
export const FIRE_AT = 3;
/** Balls in the air at once, and the reload between shots. */
export const MAX_IN_AIR = 3;
export const RELOAD = 0.28;

/** Points for one make: 2, 3 for a swish (nothing but net); ×2 for each of 💰 money ball, 🔥 on fire, bonus time. */
export function hoopsPoints(o: { swish?: boolean; money?: boolean; fire?: boolean; bonus?: boolean }): number {
  let p = o.swish ? 3 : 2;
  if (o.money) p *= 2;
  if (o.fire) p *= 2;
  if (o.bonus) p *= 2;
  return p;
}

/** Ball n (1-based, over the whole game) is a 💰 money ball: the last of every rack. */
export const isMoneyBall = (n: number): boolean => n > 0 && n % RACK === 0;

/** The hoop's side-to-side: still for 20 s, then a slow slide, then a quick one from 40 s. */
export function hoopAmp(t: number): number {
  if (t < 20) return 0;
  if (t < 22) return ((t - 20) / 2) * 0.3;
  if (t < 40) return 0.3;
  if (t < 42) return 0.3 + ((t - 40) / 2) * 0.15;
  return 0.45;
}
export const HOOP_W = 1.1;
export const hoopX = (t: number): number => hoopAmp(t) * Math.sin(HOOP_W * Math.max(0, t - 20));

/** Round 1–3 (for the stamp). */
export const hoopRound = (t: number): 1 | 2 | 3 => (t < 20 ? 1 : t < 40 ? 2 : 3);

/**
 * Tickets: a square-root curve, so the multipliers that make a hot
 * streak exciting don't flood the prize counter. A good game (~200) is
 * ~40 🎟️; a flawless one (~1,000) ~90.
 */
export const hoopsTickets = (score: number): number => Math.floor(Math.sqrt(Math.max(0, score)) * 2.8);
