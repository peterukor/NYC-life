// =====================================================================
// crowd.ts — the New Yorkers on the street (NPCs).
//
// HOW NPCs DECIDE WHAT TO DO (no AI model, zero cost per player)
//   Each NPC has a personality and remembers its last stop. When it
//   arrives somewhere, it picks the next stop from a WEIGHTED TABLE:
//   "after the café, 35% go to work, 20% to the park…". Those weights
//   are then nudged by the time of day (bars at night, offices in the
//   morning) and personality (party people love bars, tourists love
//   Times Square). Then it rolls the dice. This is a Markov chain
//   blended with utility scoring — what classic life-sims did.
//
// HOW IT STAYS FAST ("simulation level of detail")
//   Only NPCs near the camera exist. When one drifts too far away it is
//   quietly re-spawned on a sidewalk near the camera, so the street
//   always looks busy where you are looking. Everyone is drawn with
//   instancing: two draw calls for the whole crowd.
// =====================================================================

import * as THREE from 'three';
import { CROWD_RADIUS } from '../core/constants.ts';
import { weightedIndex } from '../core/rng.ts';
import { doorOf, placesIn, type PlaceType } from '../data/places.ts';
import type { AreaId } from '../sim/types.ts';
import { crowdGeometries, OUTFIT_COLORS, SKIN_TONES } from './avatar.ts';
import { findPath, nearestWalkable, isWalkable, type NavGrid } from './nav.ts';
import { blobShadowTexture } from '../render/textures.ts';

type Stop = PlaceType | 'wander';
type Personality = 'commuter' | 'partier' | 'tourist' | 'local';

/** After visiting X, how likely is each next stop (before time/personality nudges)? */
const NEXT_STOP: Record<Stop, Partial<Record<Stop, number>>> = {
  home: { work: 3, cafe: 2, food: 2, wander: 2, station: 2 },
  work: { food: 3, cafe: 2, nightlife: 2, station: 3, wander: 1 },
  cafe: { work: 3, wander: 2, park: 2, plaza: 1 },
  food: { wander: 3, park: 2, home: 2, work: 1, plaza: 1 },
  nightlife: { nightlife: 1, food: 3, station: 2, home: 3 },
  fitness: { cafe: 2, home: 2, food: 2 },
  park: { wander: 2, cafe: 2, food: 2, plaza: 1 },
  plaza: { plaza: 2, food: 2, landmark: 2, station: 2, wander: 2 },
  landmark: { plaza: 2, food: 2, station: 2, park: 1 },
  station: { wander: 3, work: 2, plaza: 2, home: 2 },
  wander: { wander: 2, food: 2, cafe: 1, plaza: 2, park: 1, station: 1, nightlife: 1 },
};

const PERSONALITY_BIAS: Record<Personality, Partial<Record<Stop, number>>> = {
  commuter: { work: 2, station: 1.8, cafe: 1.4 },
  partier: { nightlife: 2.5, food: 1.3 },
  tourist: { plaza: 3, landmark: 3, station: 1.2, work: 0.1 },
  local: { food: 1.5, park: 1.5, cafe: 1.3 },
};

function timeBias(stop: Stop, hour: number): number {
  const night = hour >= 21 || hour < 4;
  const morning = hour >= 6 && hour < 10;
  switch (stop) {
    case 'nightlife': return night ? 3 : hour >= 17 ? 1.5 : 0.15;
    case 'work': return morning ? 2.5 : hour >= 10 && hour < 17 ? 1 : 0.1;
    case 'cafe': return morning ? 2.2 : hour < 18 ? 1 : 0.2;
    case 'park': return hour >= 7 && hour < 20 ? 1 : 0.1;
    case 'station': return morning || (hour >= 16 && hour < 19) ? 2 : 1;
    case 'home': return night ? 2 : 0.6;
    default: return 1;
  }
}

/** How busy the streets are by hour (1 = rush hour peak). */
export function crowdDensity(hour: number): number {
  const curve = [0.25, 0.18, 0.12, 0.1, 0.1, 0.18, 0.45, 0.8, 1, 0.85, 0.7, 0.75, 0.9, 0.85, 0.75, 0.8, 0.9, 1, 0.95, 0.85, 0.75, 0.65, 0.55, 0.4];
  return curve[Math.max(0, Math.min(23, hour))];
}

interface Agent {
  x: number;
  z: number;
  heading: number;
  speed: number;
  path: { x: number; z: number }[];
  last: Stop;
  personality: Personality;
  waitUntil: number;
  phase: number;
  active: boolean;
}

export class Crowd {
  readonly group = new THREE.Group();
  private agents: Agent[] = [];
  private clothes: THREE.InstancedMesh;
  private skin: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private targets: Record<Stop, { x: number; z: number }[]>;
  private pathBudget = 0;
  private time = 0;

  constructor(private nav: NavGrid, area: AreaId, private max: number) {
    const { clothes, skin } = crowdGeometries();
    const clothesMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const skinMat = new THREE.MeshLambertMaterial();
    this.clothes = new THREE.InstancedMesh(clothes, clothesMat, max);
    this.skin = new THREE.InstancedMesh(skin, skinMat, max);
    const shadowMat = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), shadowMat, max);
    for (const m of [this.clothes, this.skin, this.shadows]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; // the crowd follows the camera; culling the whole batch would hide everyone
      this.group.add(m);
    }
    const color = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.clothes.setColorAt(i, color.set(OUTFIT_COLORS[i % OUTFIT_COLORS.length]));
      this.skin.setColorAt(i, color.set(SKIN_TONES[(i * 7) % SKIN_TONES.length]));
    }

    // Where NPCs can go: every door in the area, grouped by place type,
    // plus "wander" points on random sidewalks.
    this.targets = { home: [], work: [], cafe: [], food: [], nightlife: [], fitness: [], park: [], plaza: [], landmark: [], station: [], wander: [] };
    for (const p of placesIn(area)) {
      const d = doorOf(p);
      this.targets[p.type].push({ x: d.x, z: d.z });
    }
    for (let i = 0; i < 60; i++) {
      const x = nav.minX + Math.random() * nav.cols * 3;
      const z = nav.minZ + Math.random() * nav.rows * 3;
      if (isWalkable(nav, x, z)) this.targets.wander.push({ x, z });
    }
    const personalities: Personality[] = ['commuter', 'commuter', 'local', 'local', 'partier', 'tourist'];
    for (let i = 0; i < max; i++) {
      this.agents.push({ x: 0, z: 0, heading: 0, speed: 1.2 + Math.random() * 0.6, path: [], last: 'wander', personality: personalities[i % personalities.length], waitUntil: 0, phase: Math.random() * 10, active: false });
    }
  }

  /** Choose the next stop with the weighted table, then nudge and roll. */
  private nextStop(a: Agent, hour: number): Stop {
    const base = NEXT_STOP[a.last];
    const stops = Object.keys(base) as Stop[];
    const weights = stops.map((s) => (base[s] ?? 0) * timeBias(s, hour) * (PERSONALITY_BIAS[a.personality][s] ?? 1) * (this.targets[s].length ? 1 : 0));
    const i = weightedIndex(weights);
    return i < 0 ? 'wander' : stops[i];
  }

  private spawnNear(a: Agent, focus: THREE.Vector3): void {
    for (let tries = 0; tries < 12; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = CROWD_RADIUS * (0.3 + Math.random() * 0.65);
      const p = nearestWalkable(this.nav, focus.x + Math.cos(ang) * r, focus.z + Math.sin(ang) * r);
      if (Math.hypot(p.x - focus.x, p.z - focus.z) < CROWD_RADIUS) {
        a.x = p.x + (Math.random() - 0.5) * 2;
        a.z = p.z + (Math.random() - 0.5) * 2;
        a.path = [];
        a.waitUntil = 0;
        return;
      }
    }
  }

  update(dt: number, focus: THREE.Vector3, hour: number, hubBoost: (x: number, z: number) => number): void {
    this.time += dt;
    this.pathBudget = 3; // A* runs are spread out: at most 3 new routes per frame
    const wanted = Math.max(8, Math.round(this.max * crowdDensity(hour) * hubBoost(focus.x, focus.z)));
    const R2 = (CROWD_RADIUS * 1.15) ** 2;
    let shown = 0;

    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      const shouldBeActive = i < wanted;
      if (shouldBeActive && !a.active) {
        a.active = true;
        this.spawnNear(a, focus);
      }
      a.active = shouldBeActive;
      if (!a.active) continue;

      // Drifted out of the bubble? Re-spawn near the camera.
      const dx0 = a.x - focus.x;
      const dz0 = a.z - focus.z;
      if (dx0 * dx0 + dz0 * dz0 > R2) this.spawnNear(a, focus);

      let moving = false;
      if (a.path.length === 0) {
        if (this.time > a.waitUntil && this.pathBudget > 0) {
          this.pathBudget--;
          const stop = this.nextStop(a, hour);
          const list = this.targets[stop];
          const t = list[Math.floor(Math.random() * list.length)];
          // Prefer nearby targets so people don't all march off-screen.
          const jitter = { x: t.x + (Math.random() - 0.5) * 6, z: t.z + (Math.random() - 0.5) * 6 };
          const far = Math.hypot(jitter.x - a.x, jitter.z - a.z) > CROWD_RADIUS;
          const dest = far ? this.targets.wander[Math.floor(Math.random() * this.targets.wander.length)] ?? jitter : jitter;
          a.path = findPath(this.nav, a.x, a.z, dest.x, dest.z);
          a.last = far ? 'wander' : stop;
        }
      } else {
        const wp = a.path[0];
        const dx = wp.x - a.x;
        const dz = wp.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.6) {
          a.path.shift();
          // Arrived: hang around a bit (look at screens, wait for a friend).
          if (a.path.length === 0) a.waitUntil = this.time + 2 + Math.random() * (a.last === 'plaza' ? 14 : 6);
        } else {
          const step = Math.min(dist, a.speed * dt * 1.4);
          a.x += (dx / dist) * step;
          a.z += (dz / dist) * step;
          const target = Math.atan2(dx, dz);
          let diff = target - a.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          a.heading += diff * Math.min(1, dt * 8);
          moving = true;
        }
      }

      a.phase += dt * (moving ? 9 : 1.5);
      const bob = moving ? Math.abs(Math.sin(a.phase)) * 0.06 : 0;
      this.dummy.position.set(a.x, 0.18 + bob, a.z);
      this.dummy.rotation.set(0, a.heading, moving ? Math.sin(a.phase) * 0.04 : 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.clothes.setMatrixAt(shown, this.dummy.matrix);
      this.skin.setMatrixAt(shown, this.dummy.matrix);
      this.dummy.position.y = 0.21;
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.shadows.setMatrixAt(shown, this.dummy.matrix);
      shown++; // active agents are always 0..wanted-1, so instance colours stay matched
    }
    for (const m of [this.clothes, this.skin, this.shadows]) {
      m.count = shown;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const m of [this.clothes, this.skin, this.shadows]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}
