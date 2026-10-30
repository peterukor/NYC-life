// =====================================================================
// traffic.ts — cars, cabs, buses and the odd fire engine on the roads.
//
// Pure ambience: vehicles drive along fixed lanes (two-lane roads, one
// lane each way) and loop at the ends of the area.
//
// WHAT DRIVES IS DATA: every vehicle comes from data/vehicles.ts — its
// rarity, how often it shows up (trafficWeight), its speed range and its
// paints. Add, edit or remove vehicles there; this file just runs them.
// Each (vehicle, paint) pair is one InstancedMesh, so 80 cars cost about
// 20 draw calls.
// =====================================================================

import * as THREE from 'three';
import { corridorsIn } from './corridors.ts';
import { pickVehicle, type VehicleDef } from '../data/vehicles.ts';
import { avenueX, inParkGap, onRoad, streetZ, type DistrictDef } from './layout.ts';
import { PAINT_MARKER, vehicleGeometry, vehicleMaterial } from './vehicle-models.ts';

interface Car {
  lane: number;
  t: number;
  speed: number;
  /** Which InstancedMesh draws this car, and which slot in it. */
  mesh: number;
  slot: number;
}

/**
 * A lane is a polyline (two points for a grid street; many for Broadway
 * or the ring highway). `cum` = distance from the start to each point.
 * A `loop` lane joins its last point back to its first (the ring road).
 */
interface Lane {
  pts: { x: number; z: number }[];
  cum: number[];
  length: number;
  loop: boolean;
}

export class Traffic {
  readonly group = new THREE.Group();
  private lanes: Lane[] = [];
  private cars: Car[] = [];
  /** One InstancedMesh per (vehicle, paint) in use. */
  private meshes: THREE.InstancedMesh[] = [];
  private dummy = new THREE.Object3D();

  constructor(d: DistrictDef, count: number) {
    const zA = streetZ(d, 0) - 40;
    const zB = streetZ(d, d.rows) + 40;
    // Lanes only run over land (the grid has blocks in the river): each
    // avenue/street keeps its longest stretch on the borough's coastline.
    const add = (x0: number, z0: number, x1: number, z1: number) => {
      const run = landRun(d, x0, z0, x1, z1);
      if (run) this.lanes.push(makeLane(run[0], run[1], run[2], run[3]));
    };
    for (let i = 0; i <= d.cols; i++) {
      const x = avenueX(d, i);
      // Two lanes, one each way (drive on the right).
      add(x - 2.3, zA, x - 2.3, zB);
      add(x + 2.3, zB, x + 2.3, zA);
    }
    const xA = avenueX(d, 0) - 40;
    const xB = avenueX(d, d.cols) + 40;
    for (let j = 1; j < d.rows; j++) {
      const z = streetZ(d, j);
      add(xA, z + 2.2, xB, z + 2.2);
      add(xB, z - 2.2, xA, z - 2.2);
    }
    // Roads off the grid (world/corridors.ts): Broadway gets one lane each
    // way, highways two each way. Lanes are the centre line pushed sideways.
    for (const c of corridorsIn(d.id)) {
      const offs = c.highway ? [2.4, 6.4] : [2.3];
      for (const o of offs) {
        this.lanes.push(polyLane(offsetLine(c.pts, o, !!c.loop), !!c.loop));
        this.lanes.push(polyLane(offsetLine(c.pts, -o, !!c.loop).reverse(), !!c.loop));
      }
    }

    // Roll every car: which vehicle (by trafficWeight), which paint, how fast.
    // One mesh per vehicle model; the paint is each car's instance colour.
    const picks = new Map<string, { geo: THREE.BufferGeometry; cars: { speed: number; paint: string }[] }>();
    // Each different model is one draw call, so an area only uses a
    // handful of models (always the common ones, plus a couple of rare
    // ones that change every time you load the area).
    const among: VehicleDef[] = [];
    const maxModels = count < 40 ? 9 : 13;
    for (let tries = 0; tries < 200 && among.length < maxModels; tries++) {
      const v = pickVehicle(Math.random, 'trafficWeight');
      if (!among.includes(v)) among.push(v);
    }
    for (let i = 0; i < count; i++) {
      const v = pickVehicle(Math.random, 'trafficWeight', among);
      const paint = v.paints[Math.floor(Math.random() * v.paints.length)];
      if (!picks.has(v.id)) picks.set(v.id, { geo: vehicleGeometry(v, PAINT_MARKER, count < 40 ? 0 : 1), cars: [] });
      picks.get(v.id)!.cars.push({ speed: v.speed[0] + Math.random() * (v.speed[1] - v.speed[0]), paint });
    }
    let n = 0;
    const c = new THREE.Color();
    for (const [id, p] of picks) {
      const mesh = new THREE.InstancedMesh(p.geo, vehicleMaterial(), p.cars.length);
      mesh.name = `car-${id}`;
      p.cars.forEach((car, slot) => {
        mesh.setColorAt(slot, c.set(car.paint));
        this.cars.push({ lane: n++ % this.lanes.length, t: Math.random(), speed: car.speed, mesh: this.meshes.length, slot });
      });
      this.meshes.push(mesh);
    }
    for (const m of this.meshes) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.frustumCulled = false; // cars spread over the whole area
      this.group.add(m);
    }
  }

  private nearLanes: number[] = [];
  private nearTimer = 0;
  private lastFocus: { x: number; z: number } | undefined;

  /** focus = where the player/camera is: cars that wander far away respawn near it, so the streets around you stay busy. */
  update(dt: number, rush: boolean, focus?: { x: number; z: number }): void {
    // Rush hour: everything crawls.
    const slow = rush ? 0.45 : 1;
    if (focus) this.lastFocus = focus;
    if (focus && (this.nearTimer -= dt) <= 0) {
      this.nearTimer = 1;
      this.nearLanes = [];
      this.lanes.forEach((l, i) => {
        if (closestT(l, focus).d < 180) this.nearLanes.push(i);
      });
    }
    this.cars.forEach((car) => {
      let lane = this.lanes[car.lane];
      car.t += (car.speed * slow * dt) / lane.length;
      if (car.t > 1) car.t -= 1;
      if (focus && this.nearLanes.length) {
        const at = laneAt(lane, car.t);
        if (Math.abs(at.x - focus.x) > 260 || Math.abs(at.z - focus.z) > 260) {
          car.lane = this.nearLanes[Math.floor(Math.random() * this.nearLanes.length)];
          lane = this.lanes[car.lane];
          const c = closestT(lane, focus);
          car.t = Math.min(1, Math.max(0, c.t + (Math.random() - 0.5) * (300 / lane.length)));
        }
      }
      const at = laneAt(lane, car.t);
      this.dummy.position.set(at.x, 0, at.z);
      this.dummy.rotation.set(0, at.heading, 0);
      this.dummy.updateMatrix();
      this.meshes[car.mesh].setMatrixAt(car.slot, this.dummy.matrix);
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  /** QA: where the cars are, and how long 100 updates take (ms each). */
  debug(): { lanes: number; cars: { x: number; z: number; h: number; v: number }[]; updateMs: number } {
    const cars = this.cars.map((c) => {
      const at = laneAt(this.lanes[c.lane], c.t);
      return { x: Math.round(at.x), z: Math.round(at.z), h: +at.heading.toFixed(2), v: +c.speed.toFixed(1) };
    });
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) this.update(1 / 60, false, this.lastFocus);
    return { lanes: this.lanes.length, cars, updateMs: (performance.now() - t0) / 100 };
  }

  dispose(): void {
    // Geometries are shared and cached (vehicle-models.ts): only drop the meshes.
    for (const m of this.meshes) m.dispose();
    this.group.removeFromParent();
  }
}

/** The point on a lane nearest p: its t (0…1) and how far away it is. */
function closestT(l: Lane, p: { x: number; z: number }): { t: number; d: number } {
  let best = { t: 0, d: Infinity };
  const n = l.pts.length;
  for (let i = 0; i < (l.loop ? n : n - 1); i++) {
    const a = l.pts[i], b = l.pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const seg = Math.hypot(dx, dz) || 1;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (seg * seg)));
    const dd = Math.hypot(p.x - (a.x + dx * u), p.z - (a.z + dz * u));
    if (dd < best.d) best = { t: (l.cum[i] + u * seg) / l.length, d: dd };
  }
  return best;
}

/** Where along a lane t (0…1) is, and which way the car faces there. */
function laneAt(l: Lane, t: number): { x: number; z: number; heading: number } {
  const s = t * l.length;
  const n = l.pts.length;
  const segs = l.loop ? n : n - 1;
  // Binary search for the segment holding distance s.
  let lo = 0, hi = segs - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (l.cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = l.pts[lo], b = l.pts[(lo + 1) % n];
  const seg = (l.cum[lo + 1] ?? l.length) - l.cum[lo] || 1;
  const u = Math.max(0, Math.min(1, (s - l.cum[lo]) / seg));
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}

function polyLane(pts: { x: number; z: number }[], loop: boolean): Lane {
  const cum = [0];
  const n = pts.length;
  for (let i = 0; i < (loop ? n : n - 1); i++) cum.push(cum[i] + Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].z - pts[i].z));
  return { pts, cum, length: cum[cum.length - 1] || 1, loop };
}

/** A polyline pushed `off` metres to its right (negative = left). */
function offsetLine(pts: { x: number; z: number }[], off: number, loop: boolean): { x: number; z: number }[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[loop ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[loop ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    // Facing +z (heading 0), "right" is −x.
    return { x: p.x - (dz / l) * off, z: p.z + (dx / l) * off };
  });
}

/** The longest stretch of a straight road that stays on land (null if under 60 m). */
function landRun(d: DistrictDef, x0: number, z0: number, x1: number, z1: number): [number, number, number, number] | null {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(len / 4);
  let best: [number, number] | null = null;
  let start = -1;
  for (let i = 0; i <= steps + 1; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
    const on = i <= steps && onRoad(d, px, pz) && !inParkGap(d, px, pz);
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (!best || i - 1 - start > best[1] - best[0]) best = [start, i - 1];
      start = -1;
    }
  }
  if (!best || ((best[1] - best[0]) / steps) * len < 60) return null;
  const a = best[0] / steps;
  const b = best[1] / steps;
  return [x0 + (x1 - x0) * a, z0 + (z1 - z0) * a, x0 + (x1 - x0) * b, z0 + (z1 - z0) * b];
}

function makeLane(x0: number, z0: number, x1: number, z1: number): Lane {
  return polyLane([{ x: x0, z: z0 }, { x: x1, z: z1 }], false);
}
