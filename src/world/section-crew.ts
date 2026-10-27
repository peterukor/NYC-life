// =====================================================================
// section-crew.ts — the friends in your club section (sim/section.ts).
//
// Friends stand in a half-ring in front of the section sofa, dancing on
// the spot with 🥂 🔥 🎉 popping over their heads. Invite another one and
// they walk in from the rope; when the section ends they leave.
// Players will replace these avatars when multiplayer arrives.
// =====================================================================

import * as THREE from 'three';
import { makeAvatar, type Avatar } from './avatar.ts';
import type { HomeInterior } from './home-interior.ts';

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#a46b44'];
const FITS = ['#111111', '#ffffff', '#e63946', '#f4a261', '#9b5de5', '#00bbf9', '#f15bb5', '#fee440', '#2a9d8f'];
const HAIR = ['#111111', '#2b1b10', '#5a3825', '#d4a017', '#b3b3b3', '#a0522d'];

interface Friend { avatar: Avatar; to: THREE.Vector3; pop: number }

export class SectionCrew {
  private readonly friends: Friend[] = [];
  private readonly sprites: { s: THREE.Sprite; age: number }[] = [];
  private time = 0;
  private readonly centre: THREE.Vector3;
  private readonly facing: number;

  constructor(private readonly home: HomeInterior, anchor: { x: number; z: number; rot: number }, private readonly bounds = { halfW: 99, halfD: 99 }) {
    this.centre = new THREE.Vector3(anchor.x, 0, anchor.z);
    this.facing = anchor.rot;
  }

  /** Where friend i stands: a half-ring in front of the sofa, two rows. */
  private spot(i: number): THREE.Vector3 {
    const row = i < 6 ? 0 : 1;
    const k = i % 6;
    const a = Math.PI * (0.15 + (k / 5) * 0.7);
    const r = 1.9 + row * 0.9;
    const local = new THREE.Vector3(-Math.cos(a) * r, 0, 0.4 + Math.sin(a) * r * 0.75);
    const p = local.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.facing).add(this.centre);
    // Stay inside the room.
    p.x = Math.max(-this.bounds.halfW + 0.6, Math.min(this.bounds.halfW - 0.6, p.x));
    p.z = Math.max(-this.bounds.halfD + 0.6, Math.min(this.bounds.halfD - 0.6, p.z));
    return p;
  }

  /** Match the number of friends (new ones walk in from further out). */
  set(n: number): void {
    while (this.friends.length < n) {
      const i = this.friends.length;
      const avatar = makeAvatar({
        body: (i * 7) % 3 === 0 ? 'm' : 'f',
        skin: SKINS[(i * 5) % SKINS.length],
        top: FITS[(i * 3) % FITS.length],
        bottom: FITS[(i * 7 + 2) % FITS.length],
        hair: HAIR[(i * 11) % HAIR.length],
      });
      const to = this.spot(i);
      const from = to.clone().sub(this.centre).multiplyScalar(2.2).add(this.centre);
      avatar.root.position.copy(from);
      this.home.scene.add(avatar.root);
      this.friends.push({ avatar, to, pop: 1 + Math.random() * 3 });
    }
    while (this.friends.length > n) {
      const f = this.friends.pop()!;
      f.avatar.root.removeFromParent();
      f.avatar.dispose();
    }
  }

  get count(): number {
    return this.friends.length;
  }

  update(dt: number): void {
    this.time += dt;
    this.friends.forEach((f, i) => {
      const p = f.avatar.root.position;
      const d = f.to.clone().sub(p);
      const dist = d.length();
      if (dist > 0.05) {
        const step = Math.min(dist, 1.6 * dt);
        p.add(d.normalize().multiplyScalar(step));
        f.avatar.root.rotation.y = Math.atan2(d.x, d.z);
        f.avatar.setAction(null);
        f.avatar.animate(1.6, dt);
        return;
      }
      // Arrived: face the middle of the section and dance.
      f.avatar.root.rotation.y = Math.atan2(this.centre.x - p.x, this.centre.z + 0.6 - p.z);
      f.avatar.setAction(Math.floor(this.time / 6 + i) % 3 ? 'dance' : 'talk');
      f.avatar.animate(0, dt);
      if ((f.pop -= dt) <= 0) {
        f.pop = 2 + Math.random() * 4;
        this.popAt(p, ['🥂', '🔥', '🎉', '💃', '🕺', '😂'][Math.floor(Math.random() * 6)]);
      }
    });
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const sp = this.sprites[i];
      sp.age += dt;
      sp.s.position.y += 0.4 * dt;
      sp.s.material.opacity = Math.max(0, 1 - sp.age / 1.6);
      if (sp.age > 1.6) {
        sp.s.removeFromParent();
        sp.s.material.map?.dispose();
        sp.s.material.dispose();
        this.sprites.splice(i, 1);
      }
    }
  }

  private popAt(p: THREE.Vector3, e: string): void {
    if (this.sprites.length > 16) return;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '48px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(e, 32, 36);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(0.5, 0.5, 0.5);
    s.position.set(p.x, 2.0, p.z);
    this.home.scene.add(s);
    this.sprites.push({ s, age: 0 });
  }

  dispose(): void {
    this.set(0);
    for (const sp of this.sprites) {
      sp.s.removeFromParent();
      sp.s.material.map?.dispose();
      sp.s.material.dispose();
    }
    this.sprites.length = 0;
  }
}
