// =====================================================================
// traffic.ts — yellow cabs, cars and buses flowing down the avenues.
//
// Pure ambience: cars drive along fixed lanes and loop at the ends of
// the area. Most Manhattan avenues are one-way, so each avenue gets one
// direction, alternating. All cars are two instanced meshes (body +
// windows), so 50 cars cost two draw calls.
// =====================================================================

import * as THREE from 'three';
import { avenueX, streetZ, type DistrictDef } from './layout.ts';

interface Car {
  lane: number;
  t: number;
  speed: number;
}

interface Lane {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  length: number;
  heading: number;
}

const CAR_COLORS = ['#f6c90e', '#f6c90e', '#f6c90e', '#1f1f1f', '#ececec', '#8a1c1c', '#22577a', '#9ca3af'];

export class Traffic {
  readonly group = new THREE.Group();
  private lanes: Lane[] = [];
  private cars: Car[] = [];
  private bodies: THREE.InstancedMesh;
  private cabins: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor(d: DistrictDef, count: number) {
    const zA = streetZ(d, 0) - 40;
    const zB = streetZ(d, d.rows) + 40;
    for (let i = 0; i <= d.cols; i++) {
      const x = avenueX(d, i);
      const south = i % 2 === 0;
      for (const off of [-5, 0, 5]) this.lanes.push(makeLane(x + off, south ? zA : zB, x + off, south ? zB : zA));
    }
    const xA = avenueX(d, 0) - 40;
    const xB = avenueX(d, d.cols) + 40;
    for (let j = 1; j < d.rows; j += 2) {
      const z = streetZ(d, j);
      const east = j % 4 === 1;
      this.lanes.push(makeLane(east ? xA : xB, z + 2, east ? xB : xA, z + 2));
    }

    const body = new THREE.BoxGeometry(1.9, 1.0, 4.6).translate(0, 0.75, 0);
    const cabin = new THREE.BoxGeometry(1.7, 0.7, 2.4).translate(0, 1.55, -0.2);
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial(), count);
    this.cabins = new THREE.InstancedMesh(cabin, new THREE.MeshLambertMaterial({ color: '#25303a' }), count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.cars.push({ lane: i % this.lanes.length, t: Math.random(), speed: 7 + Math.random() * 6 });
      this.bodies.setColorAt(i, c.set(CAR_COLORS[i % CAR_COLORS.length]));
    }
    for (const m of [this.bodies, this.cabins]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      this.group.add(m);
    }
  }

  update(dt: number, rush: boolean): void {
    // Rush hour: everything crawls.
    const slow = rush ? 0.45 : 1;
    this.cars.forEach((car, i) => {
      const lane = this.lanes[car.lane];
      car.t += (car.speed * slow * dt) / lane.length;
      if (car.t > 1) car.t -= 1;
      this.dummy.position.set(lane.x0 + (lane.x1 - lane.x0) * car.t, 0, lane.z0 + (lane.z1 - lane.z0) * car.t);
      this.dummy.rotation.set(0, lane.heading, 0);
      this.dummy.updateMatrix();
      this.bodies.setMatrixAt(i, this.dummy.matrix);
      this.cabins.setMatrixAt(i, this.dummy.matrix);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.cabins.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [this.bodies, this.cabins]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}

function makeLane(x0: number, z0: number, x1: number, z1: number): Lane {
  return { x0, z0, x1, z1, length: Math.hypot(x1 - x0, z1 - z0), heading: Math.atan2(x1 - x0, z1 - z0) };
}
