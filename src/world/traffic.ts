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
import { pickVehicle, type VehicleDef } from '../data/vehicles.ts';
import { avenueX, streetZ, type DistrictDef } from './layout.ts';
import { PAINT_MARKER, vehicleGeometry, vehicleMaterial } from './vehicle-models.ts';

interface Car {
  lane: number;
  t: number;
  speed: number;
  /** Which InstancedMesh draws this car, and which slot in it. */
  mesh: number;
  slot: number;
}

interface Lane {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  length: number;
  heading: number;
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
    for (let i = 0; i <= d.cols; i++) {
      const x = avenueX(d, i);
      // Two lanes, one each way (drive on the right).
      this.lanes.push(makeLane(x - 2.3, zA, x - 2.3, zB));
      this.lanes.push(makeLane(x + 2.3, zB, x + 2.3, zA));
    }
    const xA = avenueX(d, 0) - 40;
    const xB = avenueX(d, d.cols) + 40;
    for (let j = 1; j < d.rows; j++) {
      const z = streetZ(d, j);
      this.lanes.push(makeLane(xA, z + 2.2, xB, z + 2.2));
      this.lanes.push(makeLane(xB, z - 2.2, xA, z - 2.2));
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

  update(dt: number, rush: boolean): void {
    // Rush hour: everything crawls.
    const slow = rush ? 0.45 : 1;
    this.cars.forEach((car) => {
      const lane = this.lanes[car.lane];
      car.t += (car.speed * slow * dt) / lane.length;
      if (car.t > 1) car.t -= 1;
      this.dummy.position.set(lane.x0 + (lane.x1 - lane.x0) * car.t, 0, lane.z0 + (lane.z1 - lane.z0) * car.t);
      this.dummy.rotation.set(0, lane.heading, 0);
      this.dummy.updateMatrix();
      this.meshes[car.mesh].setMatrixAt(car.slot, this.dummy.matrix);
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    // Geometries are shared and cached (vehicle-models.ts): only drop the meshes.
    for (const m of this.meshes) m.dispose();
    this.group.removeFromParent();
  }
}

function makeLane(x0: number, z0: number, x1: number, z1: number): Lane {
  return { x0, z0, x1, z1, length: Math.hypot(x1 - x0, z1 - z0), heading: Math.atan2(x1 - x0, z1 - z0) };
}
