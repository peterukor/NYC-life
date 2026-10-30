// =====================================================================
// my-car.ts — your own car on the map: where it is, getting in and out,
// and drawing it. How it drives (routes on the road, steering, braking,
// red lights) is world/drive.ts; this file is the glue to the scene.
//
//   rig  (position + heading)
//    └ body  (body roll, nose dip, the little "pop" when it pulls up)
//       └ the car mesh (game.ts builds it; its own transform stays clean)
//
// States: no car out · parked at the kerb (you're on foot) · you're in it
// (idle at the kerb or driving a route). Getting in / out is a short walk
// between the sidewalk and the car's kerb-side door.
// =====================================================================

import * as THREE from 'three';
import { buildRoadGraph, CarController, DRIVE, kerbNear, planRoute, type DriveEnv, type RoadGraph, type XZ } from './drive.ts';
import type { DistrictDef } from './layout.ts';

/** What just happened this frame (game.ts reacts). */
export type CarEvent = 'boarded' | 'parked' | 'alighted' | null;

export interface TracePoint {
  t: number;
  x: number;
  z: number;
  yaw: number;
  v: number;
  why: string;
}

/** Seconds of the step in / step out walk (plus a bit per metre). */
const STEP_SECONDS = 0.45;
const STEP_SPEED = 3.2;

export class MyCar {
  readonly rig = new THREE.Group();
  readonly body = new THREE.Group();
  /** Which of your cars is out on the street (driving or parked), or null. */
  uid: string | null = null;
  /** Are you sitting in it? */
  inCar = false;
  /** The car's pose and driving (null = no car out in this area). */
  ctrl: CarController | null = null;
  /** The person's walking speed this frame (for the walk animation while stepping in / out). */
  personSpeed = 0;
  /** QA: the car's path while driving (scripts/qa-drive.mjs). */
  trace: TracePoint[] | null = null;
  private graph: RoadGraph | null = null;
  private area = '';
  private walkable: (x: number, z: number) => XZ = (x, z) => ({ x, z });
  private anim: { kind: 'board' | 'alight'; t: number; dur: number; from: XZ; to: XZ } | null = null;
  private pop = 1;
  /** Where we last put the person (to notice them being moved elsewhere). */
  private wrote: XZ | null = null;
  private clock = 0;

  constructor(readonly vMax: number) {
    this.rig.name = 'my-car-rig';
    this.body.name = 'my-car-body';
    this.rig.add(this.body);
    this.rig.visible = false;
  }

  /**
   * Keep up with the loaded area. A new area has its own roads; a car out
   * in the old one stays there (you get it back by driving again).
   * land = "is this on land" (the street nav grid); walkable = nearest sidewalk point.
   */
  setArea(id: string, d: DistrictDef, land: (x: number, z: number) => boolean, walkable: (x: number, z: number) => XZ): void {
    this.walkable = walkable;
    if (id === this.area) return;
    this.area = id;
    this.graph = buildRoadGraph(d, land);
    this.ctrl = null;
    this.anim = null;
    this.inCar = false;
  }

  /** The mesh to draw goes in the body (re-parented if something else added it). */
  attach(mesh: THREE.Object3D | null, scene: THREE.Object3D): void {
    if (mesh && mesh.parent !== this.body) this.body.add(mesh);
    if (this.rig.parent !== scene) scene.add(this.rig);
  }

  get busy(): boolean {
    return !!this.anim;
  }
  /** Hide the person: sitting in the car (not while stepping in or out). */
  get hidesPerson(): boolean {
    return this.inCar && !this.anim;
  }
  get driving(): boolean {
    return this.inCar && !!this.ctrl?.route;
  }

  /** Park at the kerb nearest (x, z) straight away (fast travel, first sight, after being moved). */
  place(x: number, z: number, uid: string): boolean {
    const k = this.graph ? kerbNear(this.graph, x, z) : null;
    if (!k) return false;
    this.uid = uid;
    this.ctrl = new CarController(k, this.vMax);
    this.inCar = false;
    this.anim = null;
    this.pop = 1;
    this.writeRig();
    return true;
  }

  /** Get in. If it isn't parked right here, it pulls up at the kerb next to you first (a quick pop). */
  board(person: THREE.Object3D, uid: string): boolean {
    const p = person.position;
    if (!this.ctrl || this.uid !== uid || Math.hypot(this.ctrl.x - p.x, this.ctrl.z - p.z) > 14) {
      if (!this.place(p.x, p.z, uid)) return false;
      this.pop = 0;
    }
    const door = this.door(1.2);
    const dist = Math.hypot(door.x - p.x, door.z - p.z);
    this.anim = { kind: 'board', t: 0, dur: STEP_SECONDS + dist / STEP_SPEED, from: { x: p.x, z: p.z }, to: door };
    this.inCar = true;
    return true;
  }

  /** Get out on the kerb side and step up onto the sidewalk. */
  alight(person: THREE.Object3D): void {
    if (!this.ctrl) return;
    this.ctrl.setRoute(null);
    const door = this.door(1.2);
    const to = this.sidewalkSpot()!;
    person.position.x = door.x;
    person.position.z = door.z;
    this.anim = { kind: 'alight', t: 0, dur: STEP_SECONDS + Math.hypot(to.x - door.x, to.z - door.z) / STEP_SPEED, from: door, to };
    this.inCar = false;
  }

  /** Drive to the kerb nearest (x, z). False if there's no road there. */
  driveTo(x: number, z: number): boolean {
    const c = this.ctrl;
    if (!c || !this.graph) return false;
    const r = planRoute(this.graph, { x: c.x, z: c.z, yaw: c.yaw, v: c.v }, { x, z }, this.vMax);
    if (!r) return false;
    c.setRoute(r);
    return true;
  }

  /**
   * Stop driving: pull over to the kerb a little way ahead. False when
   * there's nothing to do (already stopped by the kerb): just get out.
   */
  pullOver(): boolean {
    const c = this.ctrl;
    if (!c) return false;
    if (c.v < 0.5 && !c.route) return false;
    const ahead = Math.max(28, (c.v * c.v) / (2 * DRIVE.brake) + 16);
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    if (this.driveTo(c.x + fx * ahead - fz * 5, c.z + fz * ahead + fx * 5)) return true;
    c.setRoute(null);
    return false;
  }

  /** The sidewalk beside the car's kerb-side door (past the parked cars), or null with no car out. */
  sidewalkSpot(): XZ | null {
    if (!this.ctrl) return null;
    const p = this.door(5.6);
    return this.walkable(p.x, p.z);
  }

  /** A point beside the car on its kerb (right) side, `out` metres from the car's centre line. */
  private door(out: number): XZ {
    const c = this.ctrl!;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    return { x: c.x - fz * out - fx * 0.4, z: c.z + fx * out - fz * 0.4 };
  }

  /**
   * One frame: step in / out, drive, pose the car. While you're in it the
   * person rides along (hidden). If something else moved you (fast
   * travel, leaving a building, the subway), the car is left parked at
   * the kerb by where you are now and you're on foot.
   */
  update(dt: number, person: THREE.Object3D, env: DriveEnv): CarEvent {
    this.personSpeed = 0;
    const c = this.ctrl;
    if (!c) {
      this.rig.visible = false;
      return null;
    }
    const p = person.position;
    if (this.inCar && !this.anim && this.wrote && Math.hypot(p.x - this.wrote.x, p.z - this.wrote.z) > 2) {
      this.place(p.x, p.z, this.uid!);
      this.wrote = null;
      return null;
    }
    let ev: CarEvent = null;
    const a = this.anim;
    if (a) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      const e = k * k * (3 - 2 * k);
      p.x = a.from.x + (a.to.x - a.from.x) * e;
      p.z = a.from.z + (a.to.z - a.from.z) * e;
      const dx = a.to.x - a.from.x, dz = a.to.z - a.from.z;
      if (Math.hypot(dx, dz) > 0.2) person.rotation.y = Math.atan2(dx, dz);
      this.personSpeed = k < 1 ? STEP_SPEED : 0;
      if (k >= 1) {
        this.anim = null;
        ev = a.kind === 'board' ? 'boarded' : 'alighted';
      }
    }
    this.pop = Math.min(1, this.pop + dt * 3.5);
    if (this.inCar && !this.anim) {
      if (c.step(dt, env)) ev = 'parked';
      p.x = c.x;
      p.z = c.z;
      person.rotation.y = c.yaw;
      this.wrote = { x: c.x, z: c.z };
      if (this.trace && (c.route || c.v > 0.01)) {
        this.clock += dt;
        this.trace.push({ t: +this.clock.toFixed(3), x: +c.x.toFixed(2), z: +c.z.toFixed(2), yaw: +c.yaw.toFixed(4), v: +c.v.toFixed(2), why: c.why });
      }
    } else this.wrote = null;
    this.writeRig();
    return ev;
  }

  private writeRig(): void {
    const c = this.ctrl;
    if (!c) return;
    this.rig.visible = true;
    this.rig.position.set(c.x, 0, c.z);
    this.rig.rotation.y = c.yaw;
    this.body.rotation.set(c.pitch, 0, c.roll);
    // Pull-up pop: a quick ease-out-back scale from 60%.
    const k = this.pop;
    const s = 0.6 + 0.4 * (1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2);
    this.body.scale.setScalar(k >= 1 ? 1 : s);
  }

  /** QA: where the car is and what it's doing. */
  debug(): { uid: string | null; inCar: boolean; busy: boolean; anim: { kind: string; t: number; dur: number } | null; x: number; z: number; yaw: number; v: number; why: string; route: { length: number; s: number; stops: number[]; via: XZ[]; park: XZ } | null } | null {
    const c = this.ctrl;
    if (!c) return null;
    const r = c.route;
    return {
      uid: this.uid,
      inCar: this.inCar,
      busy: this.busy,
      anim: this.anim ? { kind: this.anim.kind, t: +this.anim.t.toFixed(2), dur: +this.anim.dur.toFixed(2) } : null,
      x: +c.x.toFixed(2),
      z: +c.z.toFixed(2),
      yaw: +c.yaw.toFixed(3),
      v: +c.v.toFixed(2),
      why: c.why,
      route: r ? { length: Math.round(r.length), s: Math.round(c.s), stops: r.stops.map((s) => Math.round(s.s)), via: r.via, park: r.park } : null,
    };
  }
}
