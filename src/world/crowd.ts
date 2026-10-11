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

import { hashString } from '../core/rng.ts';
import * as THREE from 'three';
import { CROWD_RADIUS } from '../core/constants.ts';
import { weightedIndex } from '../core/rng.ts';
import { doorOf, placesIn } from '../data/places.ts';
import { blockRect, DISTRICTS, SIDEWALK } from './layout.ts';
import { CROWD_DENSITY, NEXT_STOP, PERSONALITIES, timeBias, type PersonalityDef, type Stop } from '../data/crowd-brain.ts';
import type { AreaId } from '../sim/types.ts';
import { crowdGeometries, OUTFIT_COLORS, SKIN_TONES } from './avatar.ts';
import { findPath, nearestWalkable, isWalkable, type NavGrid } from './nav.ts';
import { blobShadowTexture } from '../render/textures.ts';
import { Actor, FOLK_ROLES, type FolkKit } from './folk.ts';

// The decision tables (where people go, when, and who loves what) live
// in data/crowd-brain.ts so behaviour can be tuned without touching this file.

/** How busy the streets are by hour (1 = rush hour peak). */
export function crowdDensity(hour: number): number {
  return CROWD_DENSITY[Math.max(0, Math.min(23, hour))];
}

interface Agent {
  x: number;
  z: number;
  heading: number;
  speed: number;
  path: { x: number; z: number }[];
  last: Stop;
  personality: PersonalityDef;
  waitUntil: number;
  phase: number;
  active: boolean;
  /** Which cartoon character this person is (index into the standing meshes). */
  look: number;
  /** The animated actor drawing this person right now, if close to the camera. */
  actor: Actor | null;
  moving: boolean;
  /** Gone indoors (went home) until this time; then they come back out somewhere near. */
  insideUntil: number;
  /** Who this is (sim/people.ts). A new person each time they respawn, sometimes someone you know. */
  personId: string;
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
  /** Cartoon people: standing copies for far away + an animated pool nearby. */
  private standing: THREE.InstancedMesh[] = [];
  private pool: Actor[] = [];
  private poolTimer = 0;
  private serial = 0;
  /** Picks someone you already know to bump into again (set by game.ts). */
  familiar: ((taken: Set<string>) => string | null) | null = null;
  private v = new THREE.Vector3();

  constructor(private nav: NavGrid, private area: AreaId, private max: number, folk?: FolkKit, animated = 12) {
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
    if (folk) {
      // Cartoon people replace the simple figures.
      this.clothes.visible = false;
      this.skin.visible = false;
      for (const { name, geometry } of folk.standing) {
        const m = new THREE.InstancedMesh(geometry, folk.material, max);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        m.name = `crowd-${name}`;
        this.standing.push(m);
        this.group.add(m);
      }
      // Nearby animated people: mostly casual, with office workers,
      // doctors, chefs, builders and the odd cop mixed in.
      const cast = [...FOLK_ROLES.casual, ...FOLK_ROLES.casual, ...FOLK_ROLES.office, ...FOLK_ROLES.health, ...FOLK_ROLES.chef, ...FOLK_ROLES.construction, ...FOLK_ROLES.wealthy, FOLK_ROLES.police[0]];
      const tones = ['#8d5524', '#f1c27d', '#c68642', '#5c3a21', '#e0ac69', '#ffdbac', '#a46b44', '#3b2414'];
      const tops = ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#ffbe0b', '#8338ec', '#ff006e', '#06d6a0', '#ffffff', '#1d3557'];
      for (let i = 0; i < animated; i++) {
        const character = cast[(i * 7) % cast.length];
        const casual = (FOLK_ROLES.casual as readonly string[]).includes(character);
        const a = new Actor(folk, { character, skin: tones[(i * 3) % tones.length], top: casual ? tops[(i * 5) % tops.length] : undefined }, false);
        a.visible = false;
        this.pool.push(a);
        this.group.add(a.root);
      }
    }
    const color = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.clothes.setColorAt(i, color.set(OUTFIT_COLORS[i % OUTFIT_COLORS.length]));
      this.skin.setColorAt(i, color.set(SKIN_TONES[(i * 7) % SKIN_TONES.length]));
    }

    // Where NPCs can go: every door in the area, grouped by place type,
    // plus "wander" points on random sidewalks.
    this.targets = { home: [], work: [], cafe: [], food: [], nightlife: [], fitness: [], park: [], plaza: [], landmark: [], station: [], shop: [], wander: [] };
    for (const p of placesIn(area)) {
      const d = doorOf(p);
      this.targets[p.type].push({ x: d.x, z: d.z });
    }
    // NPC homes: front doors along residential blocks. People heading
    // "home" walk to one and disappear inside (their home is on that block).
    const dist = DISTRICTS[area];
    for (let c = 0; c < dist.cols; c++) {
      for (let r = 0; r < dist.rows; r++) {
        if (dist.kind(c, r) !== 'buildings' || dist.zone(c, r) === 'tall') continue;
        const b = blockRect(dist, c, r);
        for (let x = b.minX + 8; x < b.maxX - 8; x += 16) {
          this.targets.home.push({ x, z: b.minZ + SIDEWALK - 0.8 }, { x: x + 6, z: b.maxZ - SIDEWALK + 0.8 });
        }
      }
    }
    for (let i = 0; i < 60; i++) {
      const x = nav.minX + Math.random() * nav.cols * 3;
      const z = nav.minZ + Math.random() * nav.rows * 3;
      if (isWalkable(nav, x, z)) this.targets.wander.push({ x, z });
    }
    const types = PERSONALITIES.all();
    const shares = types.map((t) => t.share);
    for (let i = 0; i < max; i++) {
      const p = types[Math.max(0, weightedIndex(shares))];
      this.agents.push({ x: 0, z: 0, heading: 0, speed: p.speed[0] + Math.random() * (p.speed[1] - p.speed[0]), path: [], last: 'wander', personality: p, waitUntil: 0, phase: Math.random() * 10, active: false, look: i, actor: null, moving: false, insideUntil: 0, personId: '' });
    }
  }

  /** Choose the next stop with the weighted table, then nudge and roll. */
  private nextStop(a: Agent, hour: number): Stop {
    const base = NEXT_STOP[a.last];
    const stops = Object.keys(base) as Stop[];
    const weights = stops.map((s) => (base[s] ?? 0) * timeBias(s, hour) * (a.personality.bias[s] ?? 1) * (this.targets[s].length ? 1 : 0));
    const i = weightedIndex(weights);
    return i < 0 ? 'wander' : stops[i];
  }

  /** Give a (re)spawned agent an identity: usually a new face, sometimes one you know. */
  private newIdentity(a: Agent): void {
    let id: string | null = null;
    if (this.familiar && Math.random() < 0.18) id = this.familiar(new Set(this.agents.map((x) => x.personId)));
    a.personId = id ?? `${this.area}-${Date.now().toString(36)}-${(this.serial++).toString(36)}`;
    a.look = hashString(a.personId);
  }

  private spawnNear(a: Agent, focus: THREE.Vector3): void {
    this.newIdentity(a);
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
      // Inside their home for now: drawn at zero size (keeps everyone's
      // colours in step). Then they come back out somewhere nearby.
      if (a.insideUntil > this.time) {
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        for (const m of [this.clothes, this.skin, this.shadows]) m.setMatrixAt(shown, this.dummy.matrix);
        shown++;
        continue;
      }
      if (a.insideUntil > 0) {
        a.insideUntil = 0;
        this.spawnNear(a, focus);
      }

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
          if (a.path.length === 0) a.waitUntil = this.time + a.personality.linger[0] + Math.random() * (a.personality.linger[1] - a.personality.linger[0]) * (a.last === 'plaza' ? 2 : 1);
          // Got home: step inside and vanish for a while.
          if (a.path.length === 0 && a.last === 'home') a.insideUntil = this.time + 25 + Math.random() * 50;
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

      a.moving = moving;
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
    if (this.standing.length) this.drawCartoon(dt, focus, wanted);
  }

  /**
   * Cartoon drawing: the people nearest the camera focus get animated
   * actors (re-chosen twice a second); everyone else is a standing copy
   * that bobs a little as it walks.
   */
  private drawCartoon(dt: number, focus: THREE.Vector3, wanted: number): void {
    this.poolTimer -= dt;
    if (this.poolTimer <= 0) {
      this.poolTimer = 0.5;
      const active = this.agents.slice(0, wanted).filter((a) => a.active && a.insideUntil <= this.time);
      active.sort((p, q) => (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 - ((q.x - focus.x) ** 2 + (q.z - focus.z) ** 2));
      const near = new Set(active.slice(0, this.pool.length));
      for (const a of this.agents) if (a.actor && !near.has(a)) a.actor = null;
      const free = this.pool.filter((p) => !this.agents.some((a) => a.actor === p));
      for (const a of near) if (!a.actor) a.actor = free.pop() ?? null;
      for (const p of this.pool) p.visible = this.agents.some((a) => a.actor === p);
    }
    const counts = this.standing.map(() => 0);
    for (let i = 0; i < wanted && i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!a.active) continue;
      if (a.insideUntil > this.time) {
        // Went home: hide their animated body too.
        if (a.actor) a.actor.visible = false;
        continue;
      }
      if (a.actor) {
        a.actor.visible = true;
        a.actor.root.position.set(a.x, 0.18, a.z);
        a.actor.root.rotation.y = a.heading;
        a.actor.move(a.moving ? a.speed * 1.4 : 0);
        a.actor.update(dt);
        continue;
      }
      const k = a.look % this.standing.length;
      const bob = a.moving ? Math.abs(Math.sin(a.phase)) * 0.12 : 0;
      this.dummy.position.set(a.x, 0.18 + bob, a.z);
      this.dummy.rotation.set(0, a.heading, a.moving ? Math.sin(a.phase) * 0.08 : 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.standing[k].setMatrixAt(counts[k]++, this.dummy.matrix);
    }
    this.standing.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  /** The person under a screen tap (pixels), if any: nearest to the tap within ~30 px. */
  pick(px: number, py: number, camera: THREE.Camera, width: number, height: number): { personId: string; x: number; z: number } | null {
    let best: Agent | null = null;
    let bestD = 34 * 34;
    for (const a of this.agents) {
      if (!a.active || a.insideUntil > this.time) continue;
      for (const y of [0.9, 1.6]) {
        this.v.set(a.x, y, a.z).project(camera);
        if (this.v.z > 1) continue;
        const sx = (this.v.x * 0.5 + 0.5) * width;
        const sy = (-this.v.y * 0.5 + 0.5) * height;
        const d = (sx - px) ** 2 + (sy - py) ** 2;
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
    }
    return best ? { personId: best.personId, x: best.x, z: best.z } : null;
  }

  /** Stop someone for a chat: they stand still facing (fx, fz) for `seconds`. */
  hold(personId: string, seconds: number, fx: number, fz: number): void {
    const a = this.agents.find((x) => x.personId === personId);
    if (!a) return;
    a.path = [];
    a.waitUntil = this.time + seconds;
    a.heading = Math.atan2(fx - a.x, fz - a.z);
  }

  /** Where a person is right now (null if gone). */
  where(personId: string): { x: number; z: number } | null {
    const a = this.agents.find((x) => x.personId === personId && x.active && x.insideUntil <= this.time);
    return a ? { x: a.x, z: a.z } : null;
  }

  /** People within r metres of (x, z), nearest first. */
  nearby(x: number, z: number, r: number): { personId: string; x: number; z: number; d: number }[] {
    const out: { personId: string; x: number; z: number; d: number }[] = [];
    for (const a of this.agents) {
      if (!a.active || a.insideUntil > this.time) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < r) out.push({ personId: a.personId, x: a.x, z: a.z, d });
    }
    return out.sort((p, q) => p.d - q.d);
  }

  /** Walk someone over to (x, z) (a grudge-holder coming for you). */
  approach(personId: string, x: number, z: number): void {
    const a = this.agents.find((p) => p.personId === personId);
    if (a) {
      a.path = findPath(this.nav, a.x, a.z, x, z);
      a.waitUntil = this.time + 6;
    }
  }

  dispose(): void {
    for (const p of this.pool) p.dispose();
    for (const m of this.standing) m.dispose();
    for (const m of [this.clothes, this.skin, this.shadows]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}
