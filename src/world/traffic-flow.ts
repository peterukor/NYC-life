// =====================================================================
// traffic-flow.ts — how the traffic DRIVES (no 3D here; traffic.ts draws).
//
//   • Lanes are polylines. Each lane keeps its cars sorted front to back
//     (an insertion sort every frame: the order hardly ever changes, so
//     it costs about one pass). A car's leader is simply the next car in
//     its lane, so the whole update is O(cars).
//   • Following: the "intelligent driver model", a classic one-line
//     formula. Each car wants its own cruising speed, keeps a time gap
//     to the car ahead and eases on and off the brakes instead of
//     snapping between speeds.
//   • Signals: one city-wide cycle. Avenues get green, then a short
//     all-red, then streets, then all-red again. A car facing red treats
//     the stop line (just before the crosswalk) as a parked car; if it is
//     too close to stop comfortably it carries on through, like a driver
//     on amber. Corridors (Broadway, highways) have no signals.
//   • Respawning: a car that leaves its lane or drifts far from the
//     player comes back on a lane near the player, but only somewhere the
//     camera can't see (behind it, or far off), with room to fit.
//   • Pose: the heading is the chord over a few metres of lane, so cars
//     ease into bends; they lean out of turns and dip their nose braking.
//   • Your own car (world/drive.ts) asks ahead() for the car in front and
//     sits in `obstacle`, so the traffic queues behind it too.
// =====================================================================

export interface XZ {
  x: number;
  z: number;
}

/** Which way a grid lane runs (its signal group); null = no signals (corridors). */
export type Axis = 'ave' | 'st' | null;

export interface Lane {
  pts: XZ[];
  /** Distance from the start to each point. */
  cum: number[];
  length: number;
  loop: boolean;
  axis: Axis;
  /** Stop lines (distance along the lane where a car's FRONT stops), ascending. */
  stops: number[];
  /** Cars in this lane, sorted by s ascending (back of the lane first). */
  cars: number[];
}

export interface FlowCar {
  /** -1 while waiting off-screen for a place to respawn. */
  lane: number;
  /** Distance of the car's centre along its lane (m). */
  s: number;
  v: number;
  /** Cruising speed (m/s). */
  vMax: number;
  /** Body length (m). */
  len: number;
  /** Index of the next stop line ahead in its lane. */
  stop: number;
  /** Last acceleration (for the nose dip). */
  acc: number;
  /** Pose, updated by pose(). */
  x: number;
  z: number;
  yaw: number;
  roll: number;
  pitch: number;
  /** Seconds before trying to respawn again (when waiting). */
  wait: number;
}

// Driver model numbers (metres, seconds).
const ACCEL = 1.6; // comfortable acceleration
const BRAKE = 3.0; // comfortable braking
const MIN_GAP = 2.2; // bumper to bumper when stopped
const HEADWAY = 1.1; // time gap to the car ahead
const MAX_BRAKE = 9; // emergency limit
// Signal cycle: avenues green, all-red, streets green, all-red.
export const SIGNAL = { green: 17, allRed: 3 };
const CYCLE = 2 * (SIGNAL.green + SIGNAL.allRed);
// Respawning.
const FAR = 260; // further than this from the player: recycle the car
const NEAR_LANE = 180; // lanes this close to the player can receive cars
const SPAWN_SPREAD = 190; // how far along a lane from the player a car may appear
const OVERRUN = 20; // metres a car may drive past a lane's end while in view

export function polyLane(pts: XZ[], loop: boolean, axis: Axis = null): Lane {
  const cum = [0];
  const n = pts.length;
  for (let i = 0; i < (loop ? n : n - 1); i++) cum.push(cum[i] + Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].z - pts[i].z));
  return { pts, cum, length: cum[cum.length - 1] || 1, loop, axis, stops: [], cars: [] };
}

/**
 * Put stop lines on the grid lanes wherever an avenue lane crosses a
 * street lane. `back(axis)` = how far before the crossing's centre line
 * the stop line is (half the crossing road plus the crosswalk).
 */
export function addStopLines(lanes: Lane[], back: (axis: 'ave' | 'st') => number): void {
  for (const a of lanes) {
    if (!a.axis || a.pts.length !== 2) continue;
    const hits: number[] = [];
    for (const b of lanes) {
      if (!b.axis || b.axis === a.axis || b.pts.length !== 2) continue;
      const s = crossAt(a.pts[0], a.pts[1], b.pts[0], b.pts[1]);
      if (s !== null) hits.push(s * a.length);
    }
    hits.sort((p, q) => p - q);
    // The crossing road has two lanes a few metres apart: one stop line per road.
    const roads: number[] = [];
    for (let i = 0; i < hits.length; ) {
      let j = i, sum = 0;
      while (j < hits.length && hits[j] - hits[i] < 8) sum += hits[j++];
      roads.push(sum / (j - i));
      i = j;
    }
    a.stops = roads.map((c) => c - back(a.axis!)).filter((s) => s > 4);
  }
}

/** Where (0…1 along p0→p1) two segments cross, or null. */
function crossAt(p0: XZ, p1: XZ, q0: XZ, q1: XZ): number | null {
  const rx = p1.x - p0.x, rz = p1.z - p0.z, sx = q1.x - q0.x, sz = q1.z - q0.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q0.x - p0.x) * sz - (q0.z - p0.z) * sx) / den;
  const u = ((q0.x - p0.x) * rz - (q0.z - p0.z) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** The point at distance s along a lane (beyond the ends: carries straight on). */
export function pointAt(l: Lane, s: number, out: XZ): XZ {
  const n = l.pts.length;
  const segs = l.loop ? n : n - 1;
  if (l.loop) s = ((s % l.length) + l.length) % l.length;
  let lo = 0, hi = segs - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (l.cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = l.pts[lo], b = l.pts[(lo + 1) % n];
  const seg = l.cum[lo + 1] - l.cum[lo] || 1;
  const u = (s - l.cum[lo]) / seg; // may go past 0/1 on the end segments
  out.x = a.x + (b.x - a.x) * u;
  out.z = a.z + (b.z - a.z) * u;
  return out;
}

/** The point on a lane nearest p: its distance along the lane and how far away it is. */
export function closestS(l: Lane, p: XZ): { s: number; d: number } {
  let best = { s: 0, d: Infinity };
  const n = l.pts.length;
  for (let i = 0; i < (l.loop ? n : n - 1); i++) {
    const a = l.pts[i], b = l.pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const seg = Math.hypot(dx, dz) || 1;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (seg * seg)));
    const dd = Math.hypot(p.x - (a.x + dx * u), p.z - (a.z + dz * u));
    if (dd < best.d) best = { s: l.cum[i] + u * seg, d: dd };
  }
  return best;
}

export interface FlowView {
  /** Where the player is: cars stay around here. */
  focus?: XZ;
  /** Can the camera see (x, z)? Cars only (re)appear where this is false. */
  canSee?: (x: number, z: number) => boolean;
  /** Speed multiplier (rush hour crawls). */
  slow?: number;
}

export class TrafficFlow {
  readonly cars: FlowCar[] = [];
  /** Seconds into the signal cycle. */
  clock: number;
  private nearLanes: number[] = [];
  private nearTimer = 0;
  private p0: XZ = { x: 0, z: 0 };
  private p1: XZ = { x: 0, z: 0 };

  readonly lanes: Lane[];
  private rand: () => number;
  /**
   * Something else on the road that traffic must queue behind (your own
   * car while you drive: world/my-car.ts). It counts on a lane only while
   * it's in that lane and facing along it, so a car parked at the kerb
   * doesn't block anyone.
   */
  obstacle: { x: number; z: number; yaw: number; v: number; len: number } | null = null;
  /** Where the obstacle is on each lane this frame (NaN = not on it). */
  private obsS: number[] = [];

  constructor(lanes: Lane[], specs: { vMax: number; len: number }[], rand: () => number = Math.random) {
    this.lanes = lanes;
    this.rand = rand;
    this.clock = rand() * CYCLE;
    specs.forEach((sp, i) => {
      const car: FlowCar = { lane: -1, s: 0, v: 0, vMax: sp.vMax, len: sp.len, stop: 0, acc: 0, x: 0, z: 0, yaw: 0, roll: 0, pitch: 0, wait: 0 };
      this.cars.push(car);
      // Start spread over the lanes, never on top of another car.
      if (!lanes.length) return;
      for (let k = 0; k < 12; k++) {
        const li = (i + k * 7) % lanes.length;
        const l = lanes[li];
        const s = this.rand() * (l.loop ? l.length : Math.max(1, l.length - car.len));
        if (this.place(i, li, s, car.vMax * 0.6)) break;
      }
    });
    for (const c of this.cars) if (c.lane >= 0) this.pose(c, 0);
  }

  /** Is this signal group green right now? Lanes without signals always are. */
  green(axis: Axis): boolean {
    if (!axis) return true;
    const t = this.clock % CYCLE;
    return axis === 'ave' ? t < SIGNAL.green : t >= SIGNAL.green + SIGNAL.allRed && t < CYCLE - SIGNAL.allRed;
  }

  step(dt: number, view: FlowView = {}): void {
    dt = Math.min(dt, 0.1);
    if (dt <= 0) return;
    this.clock = (this.clock + dt) % CYCLE;
    const slow = view.slow ?? 1;
    const focus = view.focus;
    if (focus && (this.nearTimer -= dt) <= 0) {
      this.nearTimer = 1;
      this.nearLanes = [];
      this.lanes.forEach((l, i) => {
        if (closestS(l, focus).d < NEAR_LANE) this.nearLanes.push(i);
      });
    }

    const obs = this.obstacle;
    for (let li = 0; li < this.lanes.length; li++) this.obsS[li] = obs ? this.onLane(li, obs) : NaN;
    for (let li = 0; li < this.lanes.length; li++) {
      const l = this.lanes[li];
      const list = l.cars;
      sortLane(list, this.cars);
      const os = this.obsS[li];
      const n = list.length;
      const green = this.green(l.axis);
      for (let k = 0; k < n; k++) {
        const car = this.cars[list[k]];
        // The car ahead (wrapping round on a loop road).
        let gap = Infinity, dv = 0, leadBack = Infinity;
        if (k + 1 < n || (l.loop && n > 1)) {
          const lead = this.cars[list[(k + 1) % n]];
          const ls = k + 1 < n ? lead.s : lead.s + l.length;
          leadBack = ls - lead.len / 2;
          gap = leadBack - (car.s + car.len / 2);
          dv = car.v - lead.v;
        }
        // Your car in this lane, ahead of this one: queue behind it like any other.
        if (obs && !Number.isNaN(os) && os > car.s) {
          const g = os - obs.len / 2 - (car.s + car.len / 2);
          if (g > -0.5 && g < gap) {
            gap = Math.max(0.05, g);
            dv = car.v - obs.v;
          }
        }
        // Signals: red = a stopped "car" at the stop line, unless too close to stop.
        if (l.axis) {
          const front = car.s + car.len / 2;
          while (car.stop < l.stops.length && l.stops[car.stop] < front - 0.5) car.stop++;
          if (!green && car.stop < l.stops.length) {
            const d = l.stops[car.stop] - front;
            if (d > (car.v * car.v) / (2 * BRAKE * 1.3) - 0.5) {
              const g = d + MIN_GAP - 0.6; // stop just behind the line, not MIN_GAP short of it
              if (g < gap) {
                gap = g;
                dv = car.v;
              }
            }
          }
        }
        const v0 = Math.max(0.5, car.vMax * slow);
        const want = MIN_GAP + Math.max(0, car.v * HEADWAY + (car.v * dv) / (2 * Math.sqrt(ACCEL * BRAKE)));
        let a = ACCEL * (1 - (car.v / v0) ** 4 - (want / Math.max(gap, 0.2)) ** 2);
        a = Math.max(-MAX_BRAKE, Math.min(ACCEL, a));
        car.acc = a;
        car.v = Math.max(0, car.v + a * dt);
        car.s += car.v * dt;
        // Never into the car ahead, whatever the numbers say.
        if (leadBack < Infinity && car.s + car.len / 2 > leadBack - 0.3) {
          car.s = leadBack - 0.3 - car.len / 2;
          car.v = Math.min(car.v, this.cars[list[(k + 1) % n]].v);
        }
      }
      // Loop roads wrap round; the sort fixes the order next frame.
      if (l.loop) for (const ci of list) {
        const c = this.cars[ci];
        if (c.s >= l.length) {
          c.s -= l.length;
          c.stop = 0;
        }
      }
    }

    // Pose every car; recycle the ones that left their lane or the player.
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (car.lane < 0) {
        if ((car.wait -= dt) <= 0) this.respawn(i, view);
        continue;
      }
      const l = this.lanes[car.lane];
      this.pose(car, dt);
      let gone = false;
      if (!l.loop && car.s > l.length) {
        // Past the end of the road: vanish only out of sight (or once well past it).
        gone = car.s > l.length + OVERRUN || !view.canSee?.(car.x, car.z);
      }
      if (focus && (Math.abs(car.x - focus.x) > FAR || Math.abs(car.z - focus.z) > FAR)) gone = true;
      if (gone) {
        this.unplace(i);
        this.respawn(i, view);
      }
    }
  }

  /** Distance along lane li of something at (x, z) facing yaw, or NaN if it isn't in that lane. */
  private onLane(li: number, o: { x: number; z: number; yaw: number }): number {
    const l = this.lanes[li];
    // Cheap reject on the lane's bounding box first.
    const p0 = l.pts[0], p1 = l.pts[l.pts.length - 1];
    if (l.pts.length === 2 && (o.x < Math.min(p0.x, p1.x) - 3 || o.x > Math.max(p0.x, p1.x) + 3 || o.z < Math.min(p0.z, p1.z) - 3 || o.z > Math.max(p0.z, p1.z) + 3)) return NaN;
    const c = closestS(l, o);
    if (c.d > 1.4) return NaN;
    const a = pointAt(l, c.s - 1, this.p0), b = pointAt(l, c.s + 1, this.p1);
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    return (dx * Math.sin(o.yaw) + dz * Math.cos(o.yaw)) / len > 0.75 ? c.s : NaN;
  }

  /**
   * The nearest car ahead of (x, z) going the same way (heading yaw) in
   * the same lane, within `within` metres: the bumper-to-bumper gap from
   * a car of half-length `half`, and its speed. For your own car.
   */
  ahead(x: number, z: number, yaw: number, within: number, lateral = 1.5, half = 2.3): { gap: number; v: number } | null {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best: { gap: number; v: number } | null = null;
    for (const c of this.cars) {
      if (c.lane < 0) continue;
      const dx = c.x - x, dz = c.z - z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > within + c.len) continue;
      if (Math.abs(dx * fz - dz * fx) > lateral) continue; // not in my lane
      if (Math.cos(c.yaw - yaw) < 0.6) continue; // crossing or oncoming
      const gap = along - half - c.len / 2;
      if (!best || gap < best.gap) best = { gap, v: c.v };
    }
    return best;
  }

  /** No traffic within r metres of (x, z)? */
  clear(x: number, z: number, r: number): boolean {
    for (const c of this.cars) if (c.lane >= 0 && Math.abs(c.x - x) < r && Math.abs(c.z - z) < r && Math.hypot(c.x - x, c.z - z) < r) return false;
    return true;
  }

  /** Update a car's position, heading, lean and nose dip. */
  private pose(car: FlowCar, dt: number): void {
    const l = this.lanes[car.lane];
    // Heading = the chord over ±2.5 m of lane, so bends are eased into.
    const a = pointAt(l, car.s - 2.5, this.p0);
    const b = pointAt(l, car.s + 2.5, this.p1);
    const x = l.pts.length > 2 ? (a.x + b.x) / 2 : 0;
    const z = l.pts.length > 2 ? (a.z + b.z) / 2 : 0;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    if (l.pts.length > 2) {
      car.x = x;
      car.z = z;
    } else {
      const p = pointAt(l, car.s, this.p0);
      car.x = p.x;
      car.z = p.z;
    }
    if (dt > 0) {
      let dy = yaw - car.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const turn = dy / dt; // rad/s
      // Lean out of the turn (positive roll leans right; turning left is +yaw).
      const rollT = Math.max(-0.07, Math.min(0.07, turn * car.v * 0.006));
      const pitchT = Math.max(-0.035, Math.min(0.025, -car.acc * 0.006));
      const k = Math.min(1, dt * 6);
      car.roll += (rollT - car.roll) * k;
      car.pitch += (pitchT - car.pitch) * k;
    }
    car.yaw = yaw;
  }

  /** Put car i on lane li at s if there's room. */
  private place(i: number, li: number, s: number, v: number): boolean {
    const l = this.lanes[li];
    const car = this.cars[i];
    if (!l.loop && (s < car.len || s > l.length - car.len)) return false;
    for (const oi of l.cars) {
      const o = this.cars[oi];
      let d = Math.abs(o.s - s);
      if (l.loop) d = Math.min(d, l.length - d);
      if (d < (o.len + car.len) / 2 + 8) return false;
    }
    car.lane = li;
    car.s = s;
    car.v = v;
    car.acc = 0;
    car.roll = car.pitch = 0;
    let st = 0;
    while (st < l.stops.length && l.stops[st] < s + car.len / 2) st++;
    car.stop = st;
    // Insert in order.
    let at = l.cars.length;
    while (at > 0 && this.cars[l.cars[at - 1]].s > s) at--;
    l.cars.splice(at, 0, i);
    // Face the right way from the first frame (no spin-in).
    const a = pointAt(l, s - 2.5, this.p0), b = pointAt(l, s + 2.5, this.p1);
    car.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    return true;
  }

  private unplace(i: number): void {
    const car = this.cars[i];
    if (car.lane < 0) return;
    const list = this.lanes[car.lane].cars;
    const at = list.indexOf(i);
    if (at >= 0) list.splice(at, 1);
    car.lane = -1;
  }

  /** Bring car i back on a lane near the player, somewhere the camera can't see. */
  private respawn(i: number, view: FlowView): void {
    const car = this.cars[i];
    const focus = view.focus;
    const pool = focus && this.nearLanes.length ? this.nearLanes : null;
    for (let tries = 0; tries < 6; tries++) {
      const li = pool ? pool[Math.floor(this.rand() * pool.length)] : Math.floor(this.rand() * this.lanes.length);
      const l = this.lanes[li];
      let s: number;
      if (focus) {
        s = closestS(l, focus).s + (this.rand() * 2 - 1) * SPAWN_SPREAD;
        if (l.loop) s = ((s % l.length) + l.length) % l.length;
      } else s = this.rand() * l.length;
      const p = pointAt(l, s, this.p0);
      if (focus && (Math.abs(p.x - focus.x) > FAR - 30 || Math.abs(p.z - focus.z) > FAR - 30)) continue;
      if (view.canSee?.(p.x, p.z)) continue;
      if (this.place(i, li, s, car.vMax * 0.75)) {
        this.pose(car, 0);
        return;
      }
    }
    // Nowhere hidden right now: wait off-screen and try again shortly.
    car.lane = -1;
    car.wait = 0.25 + this.rand() * 0.25;
  }
}

/** Insertion sort by s: nearly sorted already, so about one pass. */
function sortLane(list: number[], cars: FlowCar[]): void {
  for (let i = 1; i < list.length; i++) {
    const ci = list[i];
    const s = cars[ci].s;
    let j = i - 1;
    while (j >= 0 && cars[list[j]].s > s) {
      list[j + 1] = list[j];
      j--;
    }
    list[j + 1] = ci;
  }
}
