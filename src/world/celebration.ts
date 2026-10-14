// =====================================================================
// celebration.ts — the show when you pop a bottle or land a huge trade
// (Peter, 2026-10-14).
//
// • Fireworks: bursts of sparks in the bottle's colours, over the room.
//   Bigger and longer the more you spent (even the smallest is a proper
//   burst, not a fizzle).
// • Sparklers on the bottle itself, fizzing beside you.
// • A spotlight that finds you and follows you (from the 3rd bottle up;
//   longer each step).
// • Admirers: 2 to 7 people (men and women, all 21+) walk over and hang
//   around you. Tap one to chat or to take them home.
// • Everyone else cheers (🎉 over their heads).
// =====================================================================

import * as THREE from 'three';
import type { Celebration } from '../data/bottles.ts';
import { makeAvatar, type Avatar } from './avatar.ts';
import type { HomeInterior } from './home-interior.ts';

const NAMES_M = ['Marco', 'Jalen', 'Dev', 'Theo', 'Andre', 'Luca', 'Rafi'];
const NAMES_F = ['Aaliyah', 'Sofia', 'Jade', 'Maya', 'Bianca', 'Imani', 'Chloe'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#a46b44'];
const FITS = ['#111111', '#e63946', '#ffd166', '#ffffff', '#9b5de5', '#ff006e', '#1d3557', '#c9b6e4'];
const HAIR = ['#111111', '#2b1b10', '#d4a017', '#a0522d', '#5a3825'];

export interface Admirer {
  name: string;
  avatar: Avatar;
  hit: THREE.Mesh;
  path: { x: number; z: number }[];
  /** Where they stand around you (offset from you). */
  slot: { x: number; z: number };
}

interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  age: number;
  life: number;
}

export class CelebrationFx {
  readonly admirers: Admirer[] = [];
  private bursts: Burst[] = [];
  private fwLeft = 0;
  private fwT = 0;
  private fw: Celebration['fireworks'] | null = null;
  private spot: { light: THREE.SpotLight; cone: THREE.Mesh; left: number } | null = null;
  private sparkler: { group: THREE.Group; sparks: Burst | null; left: number } | null = null;
  private readonly hitGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.7, 10);
  private readonly hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  private readonly sparkTex = makeSparkTexture();

  constructor(
    private readonly home: HomeInterior,
    private readonly player: THREE.Object3D,
  ) {}

  /** Start the show. */
  start(show: Celebration, rand = Math.random): void {
    this.fw = show.fireworks;
    this.fwLeft = show.fireworks.seconds;
    this.fwT = 0;
    if (show.spotlight > 0) this.startSpotlight(show.spotlight);
    this.startSparkler(show.fireworks.colors, Math.max(4, show.fireworks.seconds * 0.6));
    this.callAdmirers(show.admirers, rand);
  }

  private startSpotlight(seconds: number): void {
    if (this.spot) {
      this.spot.left = Math.max(this.spot.left, seconds);
      return;
    }
    const light = new THREE.SpotLight('#fff4d6', 60, 14, 0.32, 0.4, 1.2);
    light.position.set(this.player.position.x, 6, this.player.position.z + 1);
    light.target = this.player;
    // A soft visible beam, so you can see who it's on.
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.home.scene.add(light, cone);
    this.spot = { light, cone, left: seconds };
  }

  private startSparkler(colors: string[], seconds: number): void {
    this.stopSparkler();
    const group = new THREE.Group();
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.42, 12), new THREE.MeshStandardMaterial({ color: colors[0], metalness: 0.6, roughness: 0.3, emissive: colors[0], emissiveIntensity: 0.25 }));
    bottle.position.y = 1.15;
    group.add(bottle);
    this.home.scene.add(group);
    this.sparkler = { group, sparks: null, left: seconds };
  }

  private stopSparkler(): void {
    if (!this.sparkler) return;
    this.sparkler.group.removeFromParent();
    this.sparkler.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.sparkler = null;
  }

  /** Fireworks: one burst of sparks. */
  private burst(at: THREE.Vector3, color: string, size: number, count = 70): Burst {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = (1.4 + Math.random() * 0.8) * (0.9 + size * 0.35);
      vel.set([r * Math.cos(a) * sp, u * sp, r * Math.sin(a) * sp], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.22 + size * 0.05, map: this.sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    this.home.scene.add(points);
    const b = { points, vel, age: 0, life: 1.5 + size * 0.15 };
    this.bursts.push(b);
    return b;
  }

  private callAdmirers(n: number, rand: () => number): void {
    const doorZ = this.home.layout.depth / 2 - 0.6;
    for (let i = 0; i < n; i++) {
      const body = i % 2 === 0 ? 'f' : 'm';
      // No two with the same name.
      const names = (body === 'f' ? NAMES_F : NAMES_M).filter((x) => !this.admirers.some((a) => a.name === x));
      const name = names[Math.floor(rand() * names.length)] ?? `Guest ${i + 1}`;
      const avatar = makeAvatar({ body, skin: SKINS[Math.floor(rand() * SKINS.length)], top: FITS[Math.floor(rand() * FITS.length)], bottom: FITS[Math.floor(rand() * FITS.length)], hair: HAIR[Math.floor(rand() * HAIR.length)] });
      // They come in from around the room (a few from the door).
      const sx = (rand() - 0.5) * (this.home.layout.width - 3);
      const sz = i < 2 ? doorZ : (rand() - 0.5) * (this.home.layout.depth - 3);
      const start = this.home.spotFree(sx, sz) ? { x: sx, z: sz } : { x: 0, z: doorZ };
      avatar.root.position.set(start.x, 0, start.z);
      const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
      hit.position.y = 0.85;
      hit.userData.admirer = name;
      avatar.root.add(hit);
      this.home.scene.add(avatar.root);
      const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.4;
      const radius = n > 4 ? 1.3 : 1.0;
      this.admirers.push({ name, avatar, hit, path: [], slot: { x: Math.sin(a) * radius, z: Math.cos(a) * radius } });
    }
  }

  get hits(): THREE.Object3D[] {
    return this.admirers.map((a) => a.hit);
  }

  /** Send everyone home (after you leave with someone, or they get bored). */
  dismissAdmirers(): void {
    for (const a of this.admirers) {
      a.avatar.root.removeFromParent();
      a.avatar.dispose();
    }
    this.admirers.length = 0;
  }

  update(dt: number): void {
    const p = this.player.position;
    // Fireworks over the room, around you.
    if (this.fw && this.fwLeft > 0) {
      this.fwLeft -= dt;
      this.fwT -= dt;
      if (this.fwT <= 0) {
        this.fwT = Math.max(0.18, 0.7 - this.fw.size * 0.1);
        const c = this.fw.colors[Math.floor(Math.random() * this.fw.colors.length)];
        const at = new THREE.Vector3(p.x + (Math.random() - 0.5) * (2 + this.fw.size * 1.6), 3.2 + Math.random() * (1 + this.fw.size * 0.4), p.z + (Math.random() - 0.7) * (2 + this.fw.size));
        this.burst(at, c, this.fw.size, Math.round(50 + this.fw.size * 18));
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      const pos = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < b.vel.length; k += 3) {
        b.vel[k + 1] -= 2.2 * dt; // gravity
        pos.array[k] += b.vel[k] * dt;
        pos.array[k + 1] += b.vel[k + 1] * dt;
        pos.array[k + 2] += b.vel[k + 2] * dt;
        b.vel[k] *= 0.985;
        b.vel[k + 2] *= 0.985;
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.age / b.life);
      if (b.age >= b.life) {
        b.points.removeFromParent();
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
    // The sparkler bottle beside you, fizzing.
    if (this.sparkler) {
      const sp = this.sparkler;
      sp.left -= dt;
      sp.group.position.set(p.x + 0.45, 0, p.z + 0.25);
      if (Math.random() < dt * 14) {
        const col = (sp.group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        const b = this.burst(new THREE.Vector3(p.x + 0.45, 1.45, p.z + 0.25), `#${col.color.getHexString()}`, 0.2, 10);
        b.life = 0.6;
        for (let k = 1; k < b.vel.length; k += 3) b.vel[k] = Math.abs(b.vel[k]) + 1.2;
      }
      if (sp.left <= 0) this.stopSparkler();
    }
    // The spotlight follows you.
    if (this.spot) {
      const s = this.spot;
      s.left -= dt;
      s.light.position.set(p.x, 6, p.z + 1);
      s.cone.position.set(p.x, 3.0, p.z + 0.5);
      const fade = Math.min(1, s.left / 1.5);
      s.light.intensity = 60 * fade;
      (s.cone.material as THREE.MeshBasicMaterial).opacity = 0.16 * fade;
      if (s.left <= 0) {
        s.light.removeFromParent();
        s.cone.removeFromParent();
        s.cone.geometry.dispose();
        (s.cone.material as THREE.Material).dispose();
        this.spot = null;
      }
    }
    // Admirers walk over and stand around you, facing you.
    for (const a of this.admirers) {
      const q = a.avatar.root.position;
      const want = { x: p.x + a.slot.x, z: p.z + a.slot.z };
      let speed = 0;
      if (!a.path.length && Math.hypot(want.x - q.x, want.z - q.z) > 0.5) {
        const pts = this.home.walkPath(q.x, q.z, want.x, want.z);
        a.path = pts?.length ? pts : [want];
      }
      if (a.path.length) {
        const wp = a.path[0];
        const dx = wp.x - q.x, dz = wp.z - q.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) a.path.shift();
        else {
          const step = Math.min(d, 1.3 * dt);
          q.x += (dx / d) * step;
          q.z += (dz / d) * step;
          a.avatar.root.rotation.y = Math.atan2(dx, dz);
          speed = 1.3;
        }
      } else a.avatar.root.rotation.y = Math.atan2(p.x - q.x, p.z - q.z);
      a.avatar.animate(speed, dt);
    }
  }

  dispose(): void {
    this.dismissAdmirers();
    this.stopSparkler();
    for (const b of this.bursts) {
      b.points.removeFromParent();
      b.points.geometry.dispose();
      (b.points.material as THREE.Material).dispose();
    }
    this.bursts = [];
    if (this.spot) {
      this.spot.light.removeFromParent();
      this.spot.cone.removeFromParent();
      this.spot.cone.geometry.dispose();
      (this.spot.cone.material as THREE.Material).dispose();
      this.spot = null;
    }
    this.hitGeo.dispose();
    this.hitMat.dispose();
    this.sparkTex.dispose();
  }
}

/** A soft round glow for sparks. */
function makeSparkTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  return t;
}
