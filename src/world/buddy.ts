// =====================================================================
// buddy.ts — the friend you're hanging out with (sim/invites.ts →
// Hangout). They walk in, stay near you, face you when you stop, and
// react to what you do together with an emoji over their head.
// A player's avatar will take this place in multiplayer.
// =====================================================================

import * as THREE from 'three';
import { Rng } from '../core/rng.ts';
import { makeAvatar, type Avatar } from './avatar.ts';

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#a46b44', '#3b2414'];
const FITS = ['#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#264653', '#111111', '#6d597a', '#ffffff', '#ff006e', '#3a86ff'];
const HAIR = ['#111111', '#2b1b10', '#5a3825', '#a0522d', '#d4a017', '#b3b3b3'];

/** The same person always looks the same. */
export function lookOf(personId: string) {
  const r = new Rng(`look-${personId}`);
  const p = <T,>(xs: T[]) => xs[Math.floor(r.next() * xs.length)];
  return { body: r.next() < 0.5 ? ('m' as const) : ('f' as const), skin: p(SKINS), top: p(FITS), bottom: p(FITS), hair: p(HAIR) };
}

export class Buddy {
  readonly avatar: Avatar;
  private readonly pops: { s: THREE.Sprite; age: number }[] = [];
  private t = 0;

  constructor(readonly scene: THREE.Scene, private readonly target: THREE.Object3D, personId: string) {
    this.avatar = makeAvatar(lookOf(personId));
    // Walk in from a few metres away.
    this.avatar.root.position.copy(target.position).add(new THREE.Vector3(2.5, 0, 3));
    scene.add(this.avatar.root);
  }

  update(dt: number): void {
    this.t += dt;
    const me = this.target.position;
    const p = this.avatar.root.position;
    // Stand a step to your side.
    const want = me.clone().add(new THREE.Vector3(1.1, 0, 0.5));
    const d = want.clone().sub(p);
    const dist = d.length();
    if (dist > 0.4) {
      const step = Math.min(dist, (dist > 3 ? 2.6 : 1.5) * dt);
      p.add(d.normalize().multiplyScalar(step));
      this.avatar.root.rotation.y = Math.atan2(d.x, d.z);
      this.avatar.setAction(null);
      this.avatar.animate(1.5, dt);
    } else {
      this.avatar.root.rotation.y = Math.atan2(me.x - p.x, me.z - p.z);
      this.avatar.animate(0, dt);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const x = this.pops[i];
      x.age += dt;
      x.s.position.copy(p).setY(2.1 + x.age * 0.5);
      x.s.material.opacity = Math.max(0, 1 - x.age / 2);
      if (x.age > 2) {
        x.s.removeFromParent();
        x.s.material.map?.dispose();
        x.s.material.dispose();
        this.pops.splice(i, 1);
      }
    }
  }

  /** An emoji over their head (their reaction), and a little hop if it's good. */
  react(emoji: string, happy = true): void {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '50px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, 32, 36);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(0.6, 0.6, 0.6);
    this.scene.add(s);
    this.pops.push({ s, age: 0 });
    this.avatar.setAction(happy ? 'jump' : null);
    window.setTimeout(() => this.avatar.setAction(null), 900);
  }

  dispose(): void {
    this.avatar.root.removeFromParent();
    this.avatar.dispose();
    for (const x of this.pops) {
      x.s.removeFromParent();
      x.s.material.map?.dispose();
      x.s.material.dispose();
    }
    this.pops.length = 0;
  }
}
