// =====================================================================
// coworkers.ts — the people working alongside you (Peter, 2026-10-13).
//
// A workplace room has 6 worker spots (HomeLayout.workers). NPC
// coworkers stand in every spot that isn't a player's (sim/workroom.ts):
// when you work here you take one spot, and later other players will
// take theirs. They mostly stand at their station, with the odd shuffle
// or stretch. Tap one to say hi.
// =====================================================================

import * as THREE from 'three';
import type { HomeLayout } from '../data/homes.ts';
import type { WorkRoom } from '../sim/workroom.ts';
import { makeAvatar, type Avatar } from './avatar.ts';

export interface Coworker {
  name: string;
  avatar: Avatar;
  hit: THREE.Mesh;
  home: { x: number; z: number; rot: number };
  /** Seconds until the next little move. */
  fidget: number;
}

export class Coworkers {
  readonly list: Coworker[] = [];
  private readonly hitGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.7, 10);
  private readonly hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  private t = 0;

  constructor(scene: THREE.Scene, layout: HomeLayout, room: WorkRoom, free: (x: number, z: number) => boolean) {
    const spots = layout.workers ?? [];
    room.slots.forEach((slot, i) => {
      const at = spots[i];
      if (!at || slot.kind !== 'npc' || !free(at.x, at.z)) return;
      const n = slot.npc;
      const avatar = makeAvatar({ body: n.body, skin: n.skin, top: n.top, bottom: n.bottom, hair: n.hair });
      avatar.root.position.set(at.x, 0, at.z);
      avatar.root.rotation.y = at.rot;
      const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
      hit.position.y = 0.85;
      hit.userData.coworker = n.name;
      avatar.root.add(hit);
      scene.add(avatar.root);
      this.list.push({ name: n.name, avatar, hit, home: at, fidget: 2 + i * 1.3 });
    });
  }

  get hits(): THREE.Object3D[] {
    return this.list.map((c) => c.hit);
  }

  /** Where a worker spot is free for the player (the spot an NPC gave up). */
  update(dt: number): void {
    this.t += dt;
    for (const c of this.list) {
      // A little life: turn a bit now and then, then back to the station.
      c.fidget -= dt;
      if (c.fidget <= 0) {
        c.fidget = 3 + Math.random() * 5;
        c.avatar.root.rotation.y = c.home.rot + (Math.random() - 0.5) * 0.9;
      }
      c.avatar.animate(0, dt);
    }
  }

  dispose(): void {
    for (const c of this.list) {
      c.avatar.root.removeFromParent();
      c.avatar.dispose();
    }
    this.list.length = 0;
    this.hitGeo.dispose();
    this.hitMat.dispose();
  }
}
