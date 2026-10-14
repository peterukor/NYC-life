// =====================================================================
// roommates.ts — the people you share the walk-up with.
//
// Each roommate is a real character (same body and clothes system as the
// player) who potters between the shared rooms: stands a while, walks
// somewhere else around the furniture, stands again. They never go into
// your room. Tap one to chat (data/actions.ts → chatRoommate); they stop
// and turn to you while you talk.
// =====================================================================

import * as THREE from 'three';
import type { HomeConditions } from '../data/homes.ts';
import { makeAvatar, type Avatar } from './avatar.ts';
import type { HomeInterior } from './home-interior.ts';

type RoommateDef = NonNullable<HomeConditions['roommates']>[number];

export interface Roommate {
  def: RoommateDef;
  avatar: Avatar;
  /** Invisible tap target around them (skinned meshes pick badly). */
  hit: THREE.Mesh;
  path: { x: number; z: number }[];
  /** Seconds left standing before they wander off again. */
  wait: number;
  /** Talking to you: stay put and face this point. */
  heldBy: { x: number; z: number; t: number } | null;
}

const SPEED = 1.1;

export class Roommates {
  readonly list: Roommate[] = [];
  private readonly hitGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.7, 10);
  private readonly hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

  constructor(
    private readonly home: HomeInterior,
    defs: RoommateDef[],
    private readonly rand: () => number = Math.random,
  ) {
    defs.forEach((def, i) => {
      const avatar = makeAvatar({ body: def.body, skin: def.skin, top: def.top, bottom: def.bottom, hair: def.hair });
      const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
      hit.position.y = 0.85;
      hit.userData.roommate = def.name;
      avatar.root.add(hit);
      const start = this.spot() ?? { x: (i - 0.5) * 1.2, z: 0 };
      avatar.root.position.set(start.x, 0, start.z);
      avatar.root.rotation.y = this.rand() * Math.PI * 2;
      home.scene.add(avatar.root);
      this.list.push({ def, avatar, hit, path: [], wait: 1 + this.rand() * 4, heldBy: null });
    });
  }

  /** Tap targets, for picking. */
  get hits(): THREE.Object3D[] {
    return this.list.map((r) => r.hit);
  }

  byName(name: string): Roommate | undefined {
    return this.list.find((r) => r.def.name === name);
  }

  /** Stop and face someone for a few seconds (while you chat). */
  hold(name: string, x: number, z: number, seconds = 8): void {
    const r = this.byName(name);
    if (!r) return;
    r.path = [];
    r.heldBy = { x, z, t: seconds };
  }

  /** A clear standing spot in a shared room (never your room). */
  private spot(): { x: number; z: number } | null {
    // The living room and kitchen mostly; the hall by the front door only now and then.
    const shared = this.home.layout.rooms.filter((rm) => !/your|bath/i.test(rm.label));
    const rooms = this.rand() < 0.8 ? shared.filter((rm) => !/hall/i.test(rm.label)) : shared;
    for (let tries = 0; tries < 30; tries++) {
      const rm = rooms[Math.floor(this.rand() * rooms.length)];
      if (!rm) return null;
      const [x0, z0, x1, z1] = rm.rect;
      const x = x0 + 0.5 + this.rand() * Math.max(0, x1 - x0 - 1);
      const z = z0 + 0.5 + this.rand() * Math.max(0, z1 - z0 - 1);
      if (this.home.spotFree(x, z)) return { x, z };
    }
    return null;
  }

  update(dt: number): void {
    for (const r of this.list) {
      const p = r.avatar.root.position;
      let speed = 0;
      if (r.heldBy) {
        r.heldBy.t -= dt;
        r.avatar.root.rotation.y = Math.atan2(r.heldBy.x - p.x, r.heldBy.z - p.z);
        if (r.heldBy.t <= 0) r.heldBy = null;
      } else if (r.path.length) {
        const wp = r.path[0];
        const dx = wp.x - p.x, dz = wp.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.06) {
          r.path.shift();
          if (!r.path.length) r.wait = 4 + this.rand() * 8;
        } else {
          const step = Math.min(dist, SPEED * dt);
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          let diff = Math.atan2(dx, dz) - r.avatar.root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          r.avatar.root.rotation.y += diff * Math.min(1, dt * 10);
          speed = SPEED;
        }
      } else if ((r.wait -= dt) <= 0) {
        const to = this.spot();
        const pts = to ? this.home.walkPath(p.x, p.z, to.x, to.z) : null;
        if (pts?.length) r.path = pts;
        else r.wait = 2;
      }
      r.avatar.animate(speed, dt);
    }
  }

  dispose(): void {
    for (const r of this.list) {
      r.avatar.root.removeFromParent();
      r.avatar.dispose();
    }
    this.list.length = 0;
    this.hitGeo.dispose();
    this.hitMat.dispose();
  }
}
