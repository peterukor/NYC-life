// =====================================================================
// traffic.ts — cars, cabs, buses and the odd fire engine on the roads.
//
// Pure ambience: vehicles drive along fixed lanes (two-lane roads, one
// lane each way). HOW they drive (following distance, red lights,
// respawning out of sight, leaning into bends) is traffic-flow.ts; this
// file builds the lanes and the meshes and copies the poses across.
//
// WHAT DRIVES IS DATA: every vehicle comes from data/vehicles.ts — its
// rarity, how often it shows up (trafficWeight), its speed range and its
// paints. Add, edit or remove vehicles there; this file just runs them.
// Each (vehicle, paint) pair is one InstancedMesh, so 80 cars cost about
// 20 draw calls.
// =====================================================================

import * as THREE from 'three';
import { corridorsIn } from './corridors.ts';
import { addStopLines, polyLane, TrafficFlow, type Axis, type Lane } from './traffic-flow.ts';
import { pickVehicle, type VehicleDef } from '../data/vehicles.ts';
import { avenueX, inParkGap, onRoad, streetZ, type DistrictDef } from './layout.ts';
import { PAINT_MARKER, vehicleGeometry, vehicleMaterial } from './vehicle-models.ts';

export class Traffic {
  readonly group = new THREE.Group();
  readonly flow: TrafficFlow;
  /** Which InstancedMesh draws each car, and which slot in it. */
  private draw: { mesh: number; slot: number }[] = [];
  /** One InstancedMesh per vehicle model in use. */
  private meshes: THREE.InstancedMesh[] = [];
  private dummy = new THREE.Object3D();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private lastView: { focus?: { x: number; z: number }; camera?: THREE.Camera } = {};
  private camPos = new THREE.Vector3();
  private camDir = new THREE.Vector3();

  constructor(d: DistrictDef, count: number) {
    const lanes: Lane[] = [];
    const zA = streetZ(d, 0) - 40;
    const zB = streetZ(d, d.rows) + 40;
    // Lanes only run over land (the grid has blocks in the river): each
    // avenue/street keeps its longest stretch on the borough's coastline.
    const add = (x0: number, z0: number, x1: number, z1: number, axis: Axis) => {
      const run = landRun(d, x0, z0, x1, z1);
      if (run) lanes.push(polyLane([{ x: run[0], z: run[1] }, { x: run[2], z: run[3] }], false, axis));
    };
    for (let i = 0; i <= d.cols; i++) {
      const x = avenueX(d, i);
      // Two lanes, one each way (drive on the right).
      add(x - 2.3, zA, x - 2.3, zB, 'ave');
      add(x + 2.3, zB, x + 2.3, zA, 'ave');
    }
    const xA = avenueX(d, 0) - 40;
    const xB = avenueX(d, d.cols) + 40;
    for (let j = 1; j < d.rows; j++) {
      const z = streetZ(d, j);
      add(xA, z + 2.2, xB, z + 2.2, 'st');
      add(xB, z - 2.2, xA, z - 2.2, 'st');
    }
    // Stop lines just before each crosswalk (city.ts paints them 0.6–3.2 m off the kerb).
    addStopLines(lanes, (axis) => (axis === 'ave' ? d.streetW : d.avenueW) / 2 + 3.6);
    // Roads off the grid (world/corridors.ts): Broadway gets one lane each
    // way, highways two each way. Lanes are the centre line pushed sideways.
    for (const c of corridorsIn(d.id)) {
      const offs = c.highway ? [2.4, 6.4] : [2.3];
      for (const o of offs) {
        lanes.push(polyLane(offsetLine(c.pts, o, !!c.loop), !!c.loop));
        lanes.push(polyLane(offsetLine(c.pts, -o, !!c.loop).reverse(), !!c.loop));
      }
    }

    // Roll every car: which vehicle (by trafficWeight), which paint, how fast.
    // One mesh per vehicle model; the paint is each car's instance colour.
    const picks = new Map<string, { geo: THREE.BufferGeometry; cars: { vMax: number; len: number; paint: string }[] }>();
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
      picks.get(v.id)!.cars.push({ vMax: v.speed[0] + Math.random() * (v.speed[1] - v.speed[0]), len: v.spec?.length ?? 4.6, paint });
    }
    const specs: { vMax: number; len: number }[] = [];
    const c = new THREE.Color();
    for (const [id, p] of picks) {
      const mesh = new THREE.InstancedMesh(p.geo, vehicleMaterial(), p.cars.length);
      mesh.name = `car-${id}`;
      p.cars.forEach((car, slot) => {
        mesh.setColorAt(slot, c.set(car.paint));
        specs.push({ vMax: car.vMax, len: car.len });
        this.draw.push({ mesh: this.meshes.length, slot });
      });
      this.meshes.push(mesh);
    }
    this.flow = new TrafficFlow(lanes, specs);
    for (const m of this.meshes) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.frustumCulled = false; // cars spread over the whole area
      this.group.add(m);
    }
    this.writeMatrices();
  }

  /**
   * focus = where the player is: cars that wander far away (or reach the
   * end of their road) come back near it. camera = what can be seen: they
   * only reappear out of its view.
   */
  update(dt: number, rush: boolean, focus?: { x: number; z: number }, camera?: THREE.Camera): void {
    this.lastView = { focus, camera };
    let canSee: ((x: number, z: number) => boolean) | undefined;
    if (camera) {
      camera.getWorldPosition(this.camPos);
      camera.getWorldDirection(this.camDir);
      const cp = this.camPos, cd = this.camDir;
      canSee = (x, z) => {
        const dx = x - cp.x, dy = 1 - cp.y, dz = z - cp.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 170) return false; // far off: a pop is a few pixels at most
        if (dist < 12) return true; // right by the camera: never
        // In front of the camera (a generous cone, wider than the view).
        return (dx * cd.x + dy * cd.y + dz * cd.z) / dist > 0.2;
      };
    }
    this.flow.step(dt, { focus, canSee, slow: rush ? 0.45 : 1 });
    this.writeMatrices();
  }

  private writeMatrices(): void {
    const cars = this.flow.cars;
    const dm = this.dummy;
    dm.rotation.order = 'YXZ';
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const { mesh, slot } = this.draw[i];
      if (car.lane < 0) {
        this.meshes[mesh].setMatrixAt(slot, this.hidden);
        continue;
      }
      dm.position.set(car.x, 0, car.z);
      dm.rotation.set(car.pitch, car.yaw, car.roll);
      dm.updateMatrix();
      this.meshes[mesh].setMatrixAt(slot, dm.matrix);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  /** QA: where the cars are, the signal phase, and how long 100 updates take (ms each). */
  debug(): { lanes: number; green: string; cars: { x: number; z: number; h: number; v: number; lane: number }[]; updateMs: number } {
    const cars = this.flow.cars.map((c) => ({ x: Math.round(c.x), z: Math.round(c.z), h: +c.yaw.toFixed(2), v: +c.v.toFixed(1), lane: c.lane }));
    const green = this.flow.green('ave') ? 'avenues' : this.flow.green('st') ? 'streets' : 'all red';
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) this.update(1 / 60, false, this.lastView.focus, this.lastView.camera);
    return { lanes: this.flow.lanes.length, green, cars, updateMs: (performance.now() - t0) / 100 };
  }

  dispose(): void {
    // Geometries are shared and cached (vehicle-models.ts): only drop the meshes.
    for (const m of this.meshes) m.dispose();
    this.group.removeFromParent();
  }
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
