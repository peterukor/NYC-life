// =====================================================================
// traffic.ts — yellow cabs, cars and buses flowing down the avenues.
//
// Pure ambience: cars drive along fixed lanes and loop at the ends of
// the area. Most Manhattan avenues are one-way, so each avenue gets one
// direction, alternating. Cars are cartoon models from the kit; every
// copy of one model shares one instanced mesh, so 50 cars cost about a
// dozen draw calls. If the pack can't load, simple boxes stand in.
// =====================================================================

import * as THREE from 'three';
import { kitMaterial, type KitModel } from '../assets/kit.ts';
import { avenueX, streetZ, type DistrictDef } from './layout.ts';

/**
 * Which cartoon vehicles drive around, and how common each is. New York
 * traffic is mostly yellow cabs. Add a vehicle by adding its kit name.
 */
export const STREET_MIX: { model: string; weight: number }[] = [
  { model: 'taxi', weight: 9 },
  { model: 'sedan', weight: 4 },
  { model: 'suv', weight: 3 },
  { model: 'van', weight: 2 },
  { model: 'delivery', weight: 2 },
  { model: 'hatchback-sports', weight: 1.5 },
  { model: 'suv-luxury', weight: 1.2 },
  { model: 'sedan-sports', weight: 1 },
  { model: 'police', weight: 1 },
  { model: 'truck', weight: 1 },
  { model: 'garbage-truck', weight: 0.6 },
  { model: 'ambulance', weight: 0.4 },
  { model: 'firetruck', weight: 0.25 },
];

/** Cartoon cars are drawn a bit bigger than life so they read from far away. */
const CAR_SCALE = 1.35;

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

const CAR_COLORS = ['#f6c90e', '#f6c90e', '#f6c90e', '#1f1f1f', '#ececec', '#8a1c1c', '#22577a', '#9ca3af'];

export class Traffic {
  readonly group = new THREE.Group();
  private lanes: Lane[] = [];
  private cars: Car[] = [];
  /** One InstancedMesh per vehicle model (or two simple boxes as a fallback). */
  private meshes: THREE.InstancedMesh[] = [];
  private dummy = new THREE.Object3D();

  constructor(d: DistrictDef, count: number, cars?: Map<string, KitModel>) {
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

    const mix = cars ? STREET_MIX.filter((m) => cars.has(m.model)) : [];
    if (cars && mix.length) {
      // Roll each car's model by weight, then build one mesh per model.
      const total = mix.reduce((a, m) => a + m.weight, 0);
      const counts = new Map<string, number>();
      const picks: string[] = [];
      for (let i = 0; i < count; i++) {
        let r = Math.random() * total;
        const pick = mix.find((m) => (r -= m.weight) <= 0)?.model ?? mix[0].model;
        picks.push(pick);
        counts.set(pick, (counts.get(pick) ?? 0) + 1);
      }
      const meshIndex = new Map<string, number>();
      for (const [name, n] of counts) {
        const km = cars.get(name)!;
        const geo = km.geometry.clone().scale(CAR_SCALE, CAR_SCALE, CAR_SCALE).translate(0, -km.min.y * CAR_SCALE, 0);
        meshIndex.set(name, this.meshes.length);
        this.meshes.push(new THREE.InstancedMesh(geo, kitMaterial(km.map), n));
      }
      const used = new Map<string, number>();
      picks.forEach((name, i) => {
        const slot = used.get(name) ?? 0;
        used.set(name, slot + 1);
        this.cars.push({ lane: i % this.lanes.length, t: Math.random(), speed: 7 + Math.random() * 6, mesh: meshIndex.get(name)!, slot });
      });
    } else {
      // Fallback: simple boxes (used if the car pack couldn't load).
      const body = new THREE.BoxGeometry(1.9, 1.0, 4.6).translate(0, 0.75, 0);
      const cabin = new THREE.BoxGeometry(1.7, 0.7, 2.4).translate(0, 1.55, -0.2);
      const bodies = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial(), count);
      const cabins = new THREE.InstancedMesh(cabin, new THREE.MeshLambertMaterial({ color: '#25303a' }), count);
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        this.cars.push({ lane: i % this.lanes.length, t: Math.random(), speed: 7 + Math.random() * 6, mesh: -1, slot: i });
        bodies.setColorAt(i, c.set(CAR_COLORS[i % CAR_COLORS.length]));
      }
      this.meshes.push(bodies, cabins);
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
    this.cars.forEach((car, i) => {
      const lane = this.lanes[car.lane];
      car.t += (car.speed * slow * dt) / lane.length;
      if (car.t > 1) car.t -= 1;
      this.dummy.position.set(lane.x0 + (lane.x1 - lane.x0) * car.t, 0, lane.z0 + (lane.z1 - lane.z0) * car.t);
      this.dummy.rotation.set(0, lane.heading, 0);
      this.dummy.updateMatrix();
      if (car.mesh < 0) {
        this.meshes[0].setMatrixAt(i, this.dummy.matrix);
        this.meshes[1].setMatrixAt(i, this.dummy.matrix);
      } else this.meshes[car.mesh].setMatrixAt(car.slot, this.dummy.matrix);
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
    this.group.removeFromParent();
  }
}

function makeLane(x0: number, z0: number, x1: number, z1: number): Lane {
  return { x0, z0, x1, z1, length: Math.hypot(x1 - x0, z1 - z0), heading: Math.atan2(x1 - x0, z1 - z0) };
}
