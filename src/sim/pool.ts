// =====================================================================
// pool.ts — 🎱 8-ball and 9-ball on a 9-foot table. Pure logic, no DOM:
// ball physics, racks, rules and the computer opponent. The table is
// ui/pool.ts. Played for in-game money only (or just for fun).
//
// Units are inches and seconds. The playing surface is 50 × 100 (a 9 ft
// table), drawn standing up: y = 0 is the foot rail (where the rack
// sits), y = 100 the head rail (where you break from).
//
// Physics: balls roll with friction that is part constant, part speed
// based (so a soft shot dies gently and a hard one carries), bounce off
// cushions that lose some speed, rattle off the pocket jaws, and drop
// when they cross into a pocket. Each frame is cut into sub-steps short
// enough (≤ 0.25 in of travel) that even the break never tunnels.
// English is simple: follow and draw, which take effect when the cue
// ball hits its first ball, and wear off into a natural roll over time.
//
// Rules: standard bar/league 8-ball (open table after the break, group
// on the first legal pot, the 8 called implicitly: pot it after your
// group to win, early or on a foul and you lose) and 9-ball (hit the
// lowest ball first, the 9 off any legal shot wins). Fouls: scratch, no
// ball hit, wrong ball first, no rail after contact; the other player
// gets ball in hand anywhere.
//
// Everything that rolls dice takes a `rand` so tests can seed it.
// =====================================================================

export type Mode = '8' | '9';
export type Group = 'solids' | 'stripes';
export type Rand = () => number;
export type Seat = 0 | 1;

/** Table width and length (inches), ball radius and diameter. */
export const W = 50, L = 100, R = 1.125, D = R * 2;
/** The head string: you break from behind it (y ≥ HEAD_Y). */
export const HEAD_Y = 75;
/** The foot spot: the rack's apex sits here. */
export const FOOT = { x: W / 2, y: L / 4 } as const;
/** Cue ball speed (in/s) at full power. */
export const MAX_SPEED = 340;

const CORNER_GAP = 3.6; // where the cushion stops before a corner (along each rail)
const SIDE_GAP = 2.8; // half the side pocket opening
const ROLL_A = 10; // constant rolling resistance (in/s²)
const ROLL_K = 0.5; // speed-based slowdown (1/s)
const STOP = 0.15; // below this a ball is at rest
const E_BALL = 0.95; // ball-on-ball restitution (a little loss each clack)
const E_RAIL = 0.72; // cushion restitution
const RAIL_GRIP = 0.96; // tangential speed kept off a cushion
const SPIN_SETTLE = 1.2; // how fast follow/draw turns into a natural roll (1/s)
const MAX_STEP = 0.25; // longest move per sub-step (inches)

export interface Pocket {
  x: number;
  y: number;
  /** A ball whose centre comes this close drops. */
  r: number;
  /** Where to send a ball to make it (the AI's target point). */
  aimX: number;
  aimY: number;
  side: boolean;
}

export const POCKETS: Pocket[] = [
  { x: 0, y: 0, r: 1.7, aimX: 1, aimY: 1, side: false },
  { x: W, y: 0, r: 1.7, aimX: W - 1, aimY: 1, side: false },
  { x: -0.3, y: L / 2, r: 1.5, aimX: 0, aimY: L / 2, side: true },
  { x: W + 0.3, y: L / 2, r: 1.5, aimX: W, aimY: L / 2, side: true },
  { x: 0, y: L, r: 1.7, aimX: 1, aimY: L - 1, side: false },
  { x: W, y: L, r: 1.7, aimX: W - 1, aimY: L - 1, side: false },
];

/** Cushion noses as segments [x1, y1, x2, y2]. Their ends are the pocket jaws. */
export const RAILS: readonly (readonly [number, number, number, number])[] = [
  [CORNER_GAP, 0, W - CORNER_GAP, 0],
  [CORNER_GAP, L, W - CORNER_GAP, L],
  [0, CORNER_GAP, 0, L / 2 - SIDE_GAP],
  [0, L / 2 + SIDE_GAP, 0, L - CORNER_GAP],
  [W, CORNER_GAP, W, L / 2 - SIDE_GAP],
  [W, L / 2 + SIDE_GAP, W, L - CORNER_GAP],
];

export interface Ball {
  /** 0 is the cue ball. */
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Still on the table (false once pocketed). */
  on: boolean;
  /** Cue ball only: −1 full draw … 0 stun … 1 natural roll (… 1.8 heavy follow). */
  roll: number;
}

export interface Shot {
  /** Direction of the cue ball, radians (x right, y down the table). */
  angle: number;
  /** 0..1 of MAX_SPEED. */
  power: number;
  /** English: −1 draw … 0 centre … 1 follow. */
  spin: number;
}

/** What happened during one shot (filled in as the balls roll). */
export interface ShotRec {
  firstHit: number | null;
  pocketed: number[];
  scratch: boolean;
  /** A ball touched a cushion after the first contact. */
  railAfter: boolean;
  /** Balls it was legal to hit first. */
  legal: number[];
  /** 8-ball: the shooter was on the 8. */
  onEight: boolean;
  brk: boolean;
}

export type Foul = 'scratch' | 'miss' | 'wrong-first' | 'no-rail';
export type WinWhy = 'eight' | 'eight-break' | 'eight-early' | 'eight-scratch' | 'eight-foul' | 'nine';

export interface ShotResult {
  shooter: Seat;
  foul: Foul | null;
  /** Object balls potted this shot, in order. */
  potted: number[];
  firstHit: number | null;
  /** The balls that were legal to hit first. */
  legal: number[];
  keepTurn: boolean;
  /** 8-ball: the group the shooter just got. */
  assigned: Group | null;
  win: Seat | null;
  why: WinWhy | null;
  /** A ball put back on the foot spot (the 8 on a break foul, the 9 on a foul). */
  spotted: number | null;
  brk: boolean;
}

export interface PoolGame {
  mode: Mode;
  balls: Ball[];
  /** Whose shot it is. */
  turn: Seat;
  /** 8-ball groups per seat (null while the table is open). */
  groups: [Group | null, Group | null];
  /** The shooter may move the cue ball before shooting. */
  ballInHand: boolean;
  /** Ball in hand restricted to behind the head string (the break). */
  kitchen: boolean;
  breakShot: boolean;
  over: boolean;
  winner: Seat | null;
  rec: ShotRec | null;
  shots: number;
}

export interface PoolEvent {
  type: 'ball' | 'rail' | 'pocket';
  /** The ball. */
  a: number;
  /** The other ball (type 'ball') or the pocket index (type 'pocket'); −1 otherwise. */
  b: number;
  /** Impact speed (in/s). */
  speed: number;
  x: number;
  y: number;
}

// ------------------------------------------------------------------ helpers

export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: Rand): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function shuffle<T>(a: T[], rand: Rand): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function groupOf(id: number): Group | 'eight' | 'cue' {
  return id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solids' : 'stripes';
}

export function ball(g: PoolGame, id: number): Ball {
  return g.balls.find((b) => b.id === id)!;
}
export const cueBall = (g: PoolGame): Ball => g.balls[0];

// --------------------------------------------------------------------- racks

/** Rack positions: rows of balls from the apex on the foot spot toward the foot rail. */
function rackSpots(rows: number[], rand: Rand): { x: number; y: number }[] {
  const sx = D + 0.012, sy = (sx * Math.sqrt(3)) / 2;
  const out: { x: number; y: number }[] = [];
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) out.push({ x: FOOT.x + (i - (n - 1) / 2) * sx + (rand() - 0.5) * 0.004, y: FOOT.y - r * sy });
  });
  return out;
}

/**
 * The balls for a new game, cue ball first (id 0). 8-ball: 15 in a
 * triangle, the 8 in the middle, a solid and a stripe in the back corners.
 * 9-ball: a diamond, the 1 at the apex and the 9 in the middle.
 */
export function rack(mode: Mode, rand: Rand = Math.random): Ball[] {
  const rows = mode === '8' ? [1, 2, 3, 4, 5] : [1, 2, 3, 2, 1];
  const spots = rackSpots(rows, rand);
  const order: number[] = new Array(spots.length).fill(0);
  if (mode === '8') {
    order[4] = 8; // middle of the third row
    const solids = shuffle([1, 2, 3, 4, 5, 6, 7], rand), stripes = shuffle([9, 10, 11, 12, 13, 14, 15], rand);
    const s = solids.pop()!, t = stripes.pop()!;
    [order[10], order[14]] = rand() < 0.5 ? [s, t] : [t, s];
    const rest = shuffle([...solids, ...stripes], rand);
    for (let i = 0; i < order.length; i++) if (!order[i]) order[i] = rest.pop()!;
  } else {
    order[0] = 1;
    order[4] = 9;
    const rest = shuffle([2, 3, 4, 5, 6, 7, 8], rand);
    for (let i = 0; i < order.length; i++) if (!order[i]) order[i] = rest.pop()!;
  }
  const mk = (id: number, x: number, y: number): Ball => ({ id, x, y, vx: 0, vy: 0, on: true, roll: 0 });
  const balls = [mk(0, W / 2, HEAD_Y + 10)];
  spots.forEach((p, i) => balls.push(mk(order[i], p.x, p.y)));
  balls.sort((a, b) => a.id - b.id);
  return balls;
}

export function newGame(mode: Mode, rand: Rand = Math.random, breaker: Seat = 0): PoolGame {
  return { mode, balls: rack(mode, rand), turn: breaker, groups: [null, null], ballInHand: true, kitchen: true, breakShot: true, over: false, winner: null, rec: null, shots: 0 };
}

export function clone(g: PoolGame): PoolGame {
  return { ...g, balls: g.balls.map((b) => ({ ...b })), groups: [g.groups[0], g.groups[1]], rec: g.rec ? { ...g.rec, pocketed: [...g.rec.pocketed], legal: [...g.rec.legal] } : null };
}

// ---------------------------------------------------------------- placement

/** Can the cue ball go here (ball in hand)? */
export function canPlace(g: PoolGame, x: number, y: number): boolean {
  if (x < R || x > W - R || y < R || y > L - R) return false;
  if (g.kitchen && y < HEAD_Y) return false;
  for (const p of POCKETS) if (Math.hypot(x - p.x, y - p.y) < p.r + 0.4) return false;
  for (const b of g.balls) if (b.id !== 0 && b.on && Math.hypot(b.x - x, b.y - y) < D + 0.01) return false;
  return true;
}

/** Move the cue ball (ball in hand only). False if the spot isn't allowed. */
export function placeCue(g: PoolGame, x: number, y: number): boolean {
  if (!g.ballInHand || !canPlace(g, x, y)) return false;
  const c = cueBall(g);
  Object.assign(c, { x, y, vx: 0, vy: 0, on: true, roll: 0 });
  return true;
}

/** The nearest legal spot for the cue ball to (x, y). */
export function freeSpot(g: PoolGame, x: number, y: number): { x: number; y: number } {
  if (canPlace(g, x, y)) return { x, y };
  for (let r = 0.5; r < 120; r += 0.5)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (canPlace(g, px, py)) return { x: px, y: py };
    }
  return { x: W / 2, y: L - 10 };
}

/** Put a ball back on the foot spot (or the nearest free point behind it). */
function spot(g: PoolGame, id: number): void {
  const b = ball(g, id);
  const free = (y: number) => g.balls.every((o) => o === b || !o.on || Math.hypot(o.x - FOOT.x, o.y - y) >= D + 0.01);
  let y = FOOT.y;
  while (!free(y) && y > R) y -= 0.05;
  if (!free(y)) for (y = FOOT.y; !free(y) && y < L - R; ) y += 0.05;
  Object.assign(b, { x: FOOT.x, y, vx: 0, vy: 0, on: true });
}

// ------------------------------------------------------------------- physics

export function moving(g: PoolGame): boolean {
  return g.balls.some((b) => b.on && (b.vx !== 0 || b.vy !== 0));
}

/** Balls the shooter may legally hit first. */
export function legalTargets(g: PoolGame): number[] {
  const on = g.balls.filter((b) => b.on && b.id !== 0).map((b) => b.id);
  if (!on.length) return [];
  if (g.mode === '9') return [Math.min(...on)];
  if (g.breakShot) return on;
  const grp = g.groups[g.turn];
  if (!grp) {
    const xs = on.filter((id) => id !== 8);
    return xs.length ? xs : [8];
  }
  const mine = on.filter((id) => groupOf(id) === grp);
  return mine.length ? mine : [8];
}

/** Start recording a shot (strike() calls this). */
export function beginShot(g: PoolGame): ShotRec {
  const legal = legalTargets(g);
  g.rec = { firstHit: null, pocketed: [], scratch: false, railAfter: false, legal, onEight: g.mode === '8' && !g.breakShot && legal.length === 1 && legal[0] === 8, brk: g.breakShot };
  return g.rec;
}

/** Hit the cue ball. */
export function strike(g: PoolGame, shot: Shot): boolean {
  const c = cueBall(g);
  if (!c.on || g.over || moving(g)) return false;
  const brk = beginShot(g).brk;
  // A break cue (and a full-body swing) puts more on it than a normal shot.
  const sp = clamp(shot.power, 0.02, 1) * MAX_SPEED * (brk ? 1.25 : 1);
  c.vx = Math.cos(shot.angle) * sp;
  c.vy = Math.sin(shot.angle) * sp;
  const spin = clamp(shot.spin, -1, 1);
  c.roll = spin > 0 ? 1 + spin * 0.8 : spin;
  g.ballInHand = false;
  g.kitchen = false;
  return true;
}

function substep(g: PoolGame, h: number, ev: PoolEvent[]): void {
  const bs = g.balls;
  const rec = g.rec;
  // Move and slow down.
  for (const b of bs) {
    if (!b.on || (b.vx === 0 && b.vy === 0)) continue;
    b.x += b.vx * h;
    b.y += b.vy * h;
    const v = Math.hypot(b.vx, b.vy);
    if (b.id === 0) b.roll += (1 - b.roll) * Math.min(1, SPIN_SETTLE * h);
    const nv = v - (ROLL_A + ROLL_K * v) * h;
    if (nv <= STOP) b.vx = b.vy = 0;
    else {
      const k = nv / v;
      b.vx *= k;
      b.vy *= k;
    }
  }
  // Ball on ball.
  for (let i = 0; i < bs.length; i++) {
    const a = bs[i];
    if (!a.on) continue;
    for (let j = i + 1; j < bs.length; j++) {
      const b = bs[j];
      if (!b.on || (a.vx === 0 && a.vy === 0 && b.vx === 0 && b.vy === 0)) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= D * D) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, ny = dy / d;
      const over = (D - d) / 2;
      a.x -= nx * over;
      a.y -= ny * over;
      b.x += nx * over;
      b.y += ny * over;
      const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vrel <= 0) continue;
      const jn = ((1 + E_BALL) / 2) * vrel;
      a.vx -= jn * nx;
      a.vy -= jn * ny;
      b.vx += jn * nx;
      b.vy += jn * ny;
      if (a.id === 0 || b.id === 0) {
        const cue = a.id === 0 ? a : b, other = a.id === 0 ? b : a;
        const sg = a.id === 0 ? 1 : -1; // (nx, ny) * sg points from the cue ball to the other
        // Follow carries on through, draw pulls back.
        const f = (cue.roll > 0 ? 0.32 : 0.6) * cue.roll * vrel;
        cue.vx += sg * nx * f;
        cue.vy += sg * ny * f;
        cue.roll = 0.2;
        if (rec && rec.firstHit === null) rec.firstHit = other.id;
      }
      ev.push({ type: 'ball', a: a.id, b: b.id, speed: vrel, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
  }
  // Cushions and jaws.
  for (const b of bs) {
    if (!b.on) continue;
    for (const [x1, y1, x2, y2] of RAILS) {
      const sx = x2 - x1, sy = y2 - y1;
      const t = clamp(((b.x - x1) * sx + (b.y - y1) * sy) / (sx * sx + sy * sy), 0, 1);
      const cx = x1 + sx * t, cy = y1 + sy * t;
      const dx = b.x - cx, dy = b.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = d2 ? dx / d : x1 === x2 ? (x1 === 0 ? 1 : -1) : 0;
      const ny = d2 ? dy / d : y1 === y2 ? (y1 === 0 ? 1 : -1) : 0;
      b.x = cx + nx * R;
      b.y = cy + ny * R;
      const vn = b.vx * nx + b.vy * ny;
      if (vn >= 0) continue;
      const vt = -b.vx * ny + b.vy * nx;
      b.vx -= (1 + E_RAIL) * vn * nx + (1 - RAIL_GRIP) * vt * -ny;
      b.vy -= (1 + E_RAIL) * vn * ny + (1 - RAIL_GRIP) * vt * nx;
      if (rec && rec.firstHit !== null) rec.railAfter = true;
      ev.push({ type: 'rail', a: b.id, b: -1, speed: -vn, x: cx, y: cy });
    }
  }
  // Pockets: close to the drop point, or past the cushion line (only possible through a pocket mouth).
  for (const b of bs) {
    if (!b.on) continue;
    const out = b.x < 0 || b.x > W || b.y < 0 || b.y > L;
    let k = -1, best = Infinity;
    POCKETS.forEach((p, i) => {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if ((out || d < p.r) && d < best) (best = d), (k = i);
    });
    if (k < 0) continue;
    const speed = Math.hypot(b.vx, b.vy);
    b.on = false;
    b.vx = b.vy = 0;
    if (rec) {
      rec.pocketed.push(b.id);
      if (b.id === 0) rec.scratch = true;
    }
    ev.push({ type: 'pocket', a: b.id, b: k, speed, x: POCKETS[k].x, y: POCKETS[k].y });
  }
}

/** Advance the table by dt seconds (split into safe sub-steps). Returns what happened. */
export function step(g: PoolGame, dt: number): PoolEvent[] {
  const ev: PoolEvent[] = [];
  let maxV = 0;
  for (const b of g.balls) if (b.on) maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
  if (maxV === 0) return ev;
  const n = Math.min(2000, Math.max(1, Math.ceil((maxV * dt) / MAX_STEP)));
  for (let i = 0; i < n; i++) substep(g, dt / n, ev);
  return ev;
}

/** Run until everything stops. Returns the seconds it took. */
export function settle(g: PoolGame, maxSeconds = 60): number {
  let t = 0;
  while (moving(g) && t < maxSeconds) {
    step(g, 1 / 120);
    t += 1 / 120;
  }
  for (const b of g.balls) b.vx = b.vy = 0;
  return t;
}

// --------------------------------------------------------------------- rules

/** The balls have stopped: apply the rules and hand over the table. */
export function endShot(g: PoolGame): ShotResult {
  const rec = g.rec ?? beginShot(g);
  g.rec = null;
  for (const b of g.balls) b.vx = b.vy = 0;
  const me = g.turn, opp: Seat = me === 0 ? 1 : 0;
  const brk = rec.brk;
  g.breakShot = false;
  g.shots++;
  const potted = rec.pocketed.filter((id) => id !== 0);
  let foul: Foul | null = null;
  if (rec.scratch) foul = 'scratch';
  else if (rec.firstHit === null) foul = 'miss';
  else if (!rec.legal.includes(rec.firstHit)) foul = 'wrong-first';
  else if (!brk && !potted.length && !rec.railAfter) foul = 'no-rail';
  const res: ShotResult = { shooter: me, foul, potted, firstHit: rec.firstHit, legal: rec.legal, keepTurn: false, assigned: null, win: null, why: null, spotted: null, brk };
  const win = (who: Seat, why: WinWhy) => {
    res.win = who;
    res.why = why;
    g.over = true;
    g.winner = who;
  };
  if (g.mode === '8') {
    if (potted.includes(8)) {
      if (brk) {
        if (foul) (spot(g, 8), (res.spotted = 8));
        else win(me, 'eight-break');
      } else if (!rec.onEight) win(opp, 'eight-early');
      else if (foul) win(opp, foul === 'scratch' ? 'eight-scratch' : 'eight-foul');
      else win(me, 'eight');
    }
    if (!g.over && !brk && !foul && !g.groups[me]) {
      const first = potted.find((id) => id !== 8);
      if (first !== undefined) {
        const grp = groupOf(first) as Group;
        g.groups[me] = grp;
        g.groups[opp] = grp === 'solids' ? 'stripes' : 'solids';
        res.assigned = grp;
      }
    }
    const mine = g.groups[me];
    res.keepTurn = !foul && potted.some((id) => id !== 8 && (!mine || groupOf(id) === mine));
  } else {
    if (potted.includes(9)) {
      if (!foul) win(me, 'nine');
      else (spot(g, 9), (res.spotted = 9));
    }
    res.keepTurn = !foul && potted.length > 0;
  }
  if (g.over) {
    g.ballInHand = false;
    return res;
  }
  if (!res.keepTurn) g.turn = opp;
  g.ballInHand = !!foul;
  g.kitchen = false;
  return res;
}

/** Strike, roll to a stop and apply the rules (no animation). */
export function playShot(g: PoolGame, shot: Shot): ShotResult {
  strike(g, shot);
  settle(g);
  return endShot(g);
}

/** Object balls a seat still has to pot before the 8 (8-ball) or balls left (9-ball). */
export function ballsLeft(g: PoolGame, seat: Seat): number[] {
  const on = g.balls.filter((b) => b.on && b.id !== 0).map((b) => b.id);
  if (g.mode === '9') return on;
  const grp = g.groups[seat];
  return grp ? on.filter((id) => groupOf(id) === grp) : on.filter((id) => id !== 8);
}

// ------------------------------------------------------------------- aiming

export interface AimInfo {
  /** Where the cue ball's centre is at first contact (the ghost ball) or at the cushion. */
  x: number;
  y: number;
  hit: number | null;
  /** Object ball's direction after contact (unit), if a ball is hit. */
  ox: number;
  oy: number;
  /** Cue ball's stun line after contact (unit; zero for a full hit). */
  tx: number;
  ty: number;
}

/** Trace the cue ball's path to its first contact (for the aim line and ghost ball). */
export function aimRay(g: PoolGame, angle: number): AimInfo {
  const c = cueBall(g);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  let best = Infinity, hit: Ball | null = null;
  for (const b of g.balls) {
    if (!b.on || b.id === 0) continue;
    const wx = b.x - c.x, wy = b.y - c.y;
    const tca = wx * ux + wy * uy;
    if (tca <= 0) continue;
    const d2 = wx * wx + wy * wy - tca * tca;
    if (d2 > D * D) continue;
    const t = tca - Math.sqrt(D * D - d2);
    if (t < best) (best = t), (hit = b);
  }
  let tr = Infinity;
  if (ux < 0) tr = Math.min(tr, (R - c.x) / ux);
  if (ux > 0) tr = Math.min(tr, (W - R - c.x) / ux);
  if (uy < 0) tr = Math.min(tr, (R - c.y) / uy);
  if (uy > 0) tr = Math.min(tr, (L - R - c.y) / uy);
  if (!hit || tr < best) return { x: c.x + ux * tr, y: c.y + uy * tr, hit: null, ox: 0, oy: 0, tx: 0, ty: 0 };
  const x = c.x + ux * best, y = c.y + uy * best;
  const ox = (hit.x - x) / D, oy = (hit.y - y) / D;
  const dot = ux * ox + uy * oy;
  let tx = ux - dot * ox, ty = uy - dot * oy;
  const tl = Math.hypot(tx, ty);
  if (tl > 1e-3) (tx /= tl), (ty /= tl);
  else tx = ty = 0;
  return { x, y, hit: hit.id, ox, oy, tx, ty };
}

// --------------------------------------------------------------------- the AI

interface Line {
  target: number;
  pocket: number;
  angle: number;
  /** cos of the cut angle (1 = straight in). */
  cut: number;
  quality: number;
}

/** No ball (other than those skipped) within a ball's width of the path a→b. */
function clear(g: PoolGame, ax: number, ay: number, bx: number, by: number, skip: number[]): boolean {
  const sx = bx - ax, sy = by - ay;
  const len2 = sx * sx + sy * sy || 1e-9;
  for (const o of g.balls) {
    if (!o.on || skip.includes(o.id)) continue;
    const t = clamp(((o.x - ax) * sx + (o.y - ay) * sy) / len2, 0, 1);
    if (Math.hypot(o.x - (ax + sx * t), o.y - (ay + sy * t)) < D - 0.02) return false;
  }
  return true;
}

/** Makeable pots from where the cue ball is now, best first. */
function potLines(g: PoolGame, targets = legalTargets(g)): Line[] {
  const c = cueBall(g);
  if (!c.on) return [];
  const out: Line[] = [];
  for (const id of targets) {
    const b = ball(g, id);
    POCKETS.forEach((p, k) => {
      let ux = p.aimX - b.x, uy = p.aimY - b.y;
      const dp = Math.hypot(ux, uy);
      ux /= dp;
      uy /= dp;
      if (p.side && Math.abs(ux) < 0.35) return; // too shallow into a side pocket
      const gx = b.x - ux * D, gy = b.y - uy * D;
      const ax = gx - c.x, ay = gy - c.y;
      const dc = Math.hypot(ax, ay);
      if (dc < 0.05) return;
      const cut = (ax * ux + ay * uy) / dc;
      if (cut < 0.25) return;
      if (!clear(g, c.x, c.y, gx, gy, [0, id]) || !clear(g, b.x, b.y, p.aimX, p.aimY, [id])) return;
      out.push({ target: id, pocket: k, angle: Math.atan2(ay, ax), cut, quality: (cut * cut) / (1 + (dc + dp) / 60) });
    });
  }
  return out.sort((a, b) => b.quality - a.quality);
}

/** How good a finished (simulated) shot was for the shooter. */
function judge(after: PoolGame, res: ShotResult, me: Seat): number {
  if (res.win === me) return 100_000;
  if (res.win !== null) return -100_000;
  if (res.foul) return -2_000;
  const next = potLines(after);
  const look = Math.min(3, next.length) * 60 + (next[0]?.quality ?? 0) * 300;
  return res.keepTurn ? 1_000 + look + res.potted.length * 20 : -look;
}

export interface Plan {
  /** Where to put the cue ball first (ball in hand), if anywhere. */
  place: { x: number; y: number } | null;
  shot: Shot;
}

/**
 * The computer's shot. It looks for pots (ghost-ball lines to every pocket
 * with clear paths), plays each at a few speeds on a copy of the table, and
 * keeps the one that wins, keeps the turn and leaves a next shot. No pot?
 * It plays the safest legal hit it can find. Then its hand shakes a little:
 * aim and speed errors grow as skill (0..1) drops.
 */
export function aiPlan(g: PoolGame, skill: number, rand: Rand = Math.random): Plan {
  skill = clamp(skill, 0, 1);
  const me = g.turn;
  const sigma = 0.0012 + 0.03 * Math.pow(1 - skill, 1.5);
  const shake = (p: Plan): Plan => ({
    place: p.place,
    shot: { angle: p.shot.angle + gauss(rand) * sigma, power: clamp(p.shot.power * (1 + gauss(rand) * 0.07 * (1 - skill)), 0.05, 1), spin: p.shot.spin },
  });

  if (g.breakShot) {
    let place: Plan['place'] = null;
    if (g.ballInHand) {
      const want = freeSpot(g, W / 2 + (rand() - 0.5) * 10, HEAD_Y + 10);
      place = want;
    }
    const cx = place?.x ?? cueBall(g).x, cy = place?.y ?? cueBall(g).y;
    const legal = legalTargets(g);
    const head = g.balls.filter((b) => b.on && legal.includes(b.id)).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    return shake({ place, shot: { angle: Math.atan2(head.y - cy, head.x - cx), power: 0.82 + 0.16 * skill, spin: 0 } });
  }

  type Cand = { place: Plan['place']; shot: Shot; score: number };
  const cands: Cand[] = [];
  const run = (place: Plan['place'], shot: Shot): number => {
    const c = clone(g);
    if (place && !placeCue(c, place.x, place.y)) return -1e9;
    strike(c, shot);
    settle(c);
    const res = endShot(c);
    return judge(c, res, me);
  };
  const tryShot = (_base: PoolGame, place: Plan['place'], shot: Shot) => {
    const score = run(place, shot);
    if (score > -1e9) cands.push({ place, shot, score });
  };
  const top = () => cands.reduce<Cand | null>((a, c) => (!a || c.score > a.score ? c : a), null);

  // Where the cue ball can be: where it is, or (ball in hand) behind good pots.
  const spots: Plan['place'][] = [];
  if (g.ballInHand) {
    const legal = legalTargets(g);
    const opts: { x: number; y: number; q: number }[] = [];
    for (const id of legal) {
      const b = ball(g, id);
      for (const p of POCKETS) {
        let ux = p.aimX - b.x, uy = p.aimY - b.y;
        const dp = Math.hypot(ux, uy);
        ux /= dp;
        uy /= dp;
        if (p.side && Math.abs(ux) < 0.35) continue;
        if (!clear(g, b.x, b.y, p.aimX, p.aimY, [0, id])) continue;
        for (const back of [5, 10, 16]) {
          const x = b.x - ux * (D + back), y = b.y - uy * (D + back);
          if (!canPlace(g, x, y) || !clear(g, x, y, b.x - ux * D, b.y - uy * D, [0, id])) continue;
          opts.push({ x, y, q: 1 / (1 + (back + dp) / 60) });
        }
      }
    }
    opts.sort((a, b) => b.q - a.q);
    for (const o of opts.slice(0, 6)) spots.push({ x: o.x, y: o.y });
    const c = cueBall(g);
    if (c.on) spots.push(null);
    if (!spots.length) spots.push(freeSpot(g, W / 2, HEAD_Y));
  } else spots.push(null);

  for (const place of spots) {
    const base = place ? clone(g) : g;
    if (place) placeCue(base, place.x, place.y);
    const lines = potLines(base).slice(0, place ? 2 : 8);
    for (const ln of lines) for (const power of [0.22, 0.38, 0.6, 0.85]) tryShot(g, place, { angle: ln.angle, power, spin: 0 });
  }
  // No good pot: find a legal hit that doesn't give much away.
  if ((top()?.score ?? -1e9) < 500) {
    const place = spots[0];
    const base = place ? clone(g) : g;
    if (place) placeCue(base, place.x, place.y);
    const c = cueBall(base);
    for (const id of legalTargets(base)) {
      const b = ball(base, id);
      const a0 = Math.atan2(b.y - c.y, b.x - c.x);
      const dist = Math.hypot(b.x - c.x, b.y - c.y);
      const thin = Math.asin(Math.min(1, (D * 0.8) / Math.max(dist, D)));
      for (const da of [0, -thin * 0.5, thin * 0.5, -thin, thin]) for (const power of [0.25, 0.45, 0.7]) tryShot(g, place, { angle: a0 + da, power, spin: 0 });
    }
    // Snookered: sweep the clock for anything legal (kicks off the cushions).
    if ((top()?.score ?? -1e9) <= -2_000)
      for (let k = 0; k < 48; k++) for (const power of [0.4, 0.7]) tryShot(g, place, { angle: (k / 48) * Math.PI * 2, power, spin: 0 });
  }
  // Robustness: replay the best few with the aim a hair off either way and keep
  // the one that still works (a long thin cut that only drops dead-on loses out).
  const d = 2 * sigma + 0.003;
  const ranked = [...cands].sort((a, b) => b.score - a.score).slice(0, 6);
  let pick: Cand | null = null, pickScore = -Infinity;
  for (const c of ranked) {
    const sc = (c.score + run(c.place, { ...c.shot, angle: c.shot.angle + d }) + run(c.place, { ...c.shot, angle: c.shot.angle - d })) / 3;
    if (sc > pickScore) (pickScore = sc), (pick = c);
  }
  if (!pick) {
    const c = cueBall(g);
    const t = ball(g, legalTargets(g)[0] ?? 0);
    return shake({ place: spots[0], shot: { angle: Math.atan2(t.y - c.y, t.x - c.x), power: 0.5, spin: 0 } });
  }
  return shake({ place: pick.place, shot: pick.shot });
}
