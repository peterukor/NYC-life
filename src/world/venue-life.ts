// =====================================================================
// venue-life.ts — making busy places feel alive (Peter, 2026-10-13).
//
// For a workplace room with `life` (data/venues.ts):
//  • NPC visitors come and go: they walk to something in the room and use
//    it a while (dance on the dance floor, eat at the counter, hit the
//    bag, sit at a booth, browse an aisle), then wander to the next thing.
//    They make room for players (sim/workroom.ts → npcVisitors).
//  • Little emoji pop over people's heads now and then (🍺 😂 💪 📈…).
//  • Room effects: club lights and a spinning disco ball, steam off the
//    grill and the espresso machine, music notes from the jukebox and the
//    DJ, and a flickering streetlamp in the alley.
// Cheap phones get fewer visitors (QualityTier).
// =====================================================================

import * as THREE from 'three';
import { ACTIONS } from '../data/actions.ts';
import type { HomeLayout } from '../data/homes.ts';
import type { FolkAnim } from './folk.ts';
import { makeAvatar, type Avatar } from './avatar.ts';
import type { HomeInterior } from './home-interior.ts';
import type { Coworkers } from './coworkers.ts';

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#a46b44', '#3b2414'];
const CLOTHES = ['#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#264653', '#111111', '#6d597a', '#b5838d', '#e9c46a', '#3a86ff', '#ffffff', '#ff006e'];
const HAIR = ['#111111', '#2b1b10', '#5a3825', '#a0522d', '#d4a017', '#b3b3b3'];
const SPEED = 1.15;

interface Target {
  /** Where to stand, and what to face. */
  at: { x: number; z: number };
  face: { x: number; z: number };
  pose: FolkAnim | null;
  /** The object it belongs to (two visitors don't share one spot). */
  key: string;
}

interface Visitor {
  avatar: Avatar;
  path: { x: number; z: number }[];
  target: Target | null;
  /** Seconds left doing the current thing. */
  stay: number;
}

/** A canvas texture of an emoji (cached). */
const emojiTex = new Map<string, THREE.CanvasTexture>();
function emojiTexture(e: string): THREE.CanvasTexture {
  let t = emojiTex.get(e);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '50px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, 32, 36);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  emojiTex.set(e, t);
  return t;
}

/** A floating sprite (an emoji pop, a steam puff, a music note). */
interface Float {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  vy: number;
  drift: number;
  grow: number;
}

export class VenueLife {
  private readonly visitors: Visitor[] = [];
  private readonly floats: Float[] = [];
  private readonly targets: Target[] = [];
  private readonly busy = new Set<string>();
  private readonly extras: THREE.Object3D[] = [];
  private readonly lights: { light: THREE.PointLight; phase: number; kind: 'club' | 'flicker'; base: THREE.Vector3 }[] = [];
  private discoBall: THREE.Object3D | null = null;
  private emitters: { at: THREE.Vector3; kind: 'steam' | 'notes'; every: number; t: number }[] = [];
  private popT = 0;
  private time = 0;

  constructor(
    private readonly home: HomeInterior,
    private readonly layout: HomeLayout,
    visitorCount: number,
    private readonly coworkers: Coworkers | null,
    private readonly rand: () => number = Math.random,
  ) {
    this.findTargets();
    for (let i = 0; i < visitorCount; i++) this.addVisitor(i);
    this.addEffects();
  }

  /** Everything a visitor might go and do: the room's usable pieces, plus the dance floors. */
  private findTargets(): void {
    for (const o of this.home.objects) {
      const info = this.home.pieceInfo(o.id);
      if (!info) continue;
      if (info.item === 'danceFloor') {
        // Several dancers per floor, spread over it.
        const { fp } = info;
        for (let k = 0; k < 4; k++) {
          const x = info.x + (fp.minX + (fp.maxX - fp.minX) * (0.2 + 0.6 * ((k % 2) + 0.5) / 2));
          const z = info.z + (fp.minZ + (fp.maxZ - fp.minZ) * (0.2 + 0.6 * (Math.floor(k / 2) + 0.5) / 2));
          this.targets.push({ at: { x, z }, face: { x, z: z - 1 }, pose: k % 2 ? 'yes' : 'jump', key: `${o.id}:${k}` });
        }
        continue;
      }
      if (!o.actions.length) continue;
      const tags = o.actions.flatMap((a) => ACTIONS[a]?.tags ?? []);
      const pose: FolkAnim | null = tags.includes('eat') || tags.includes('drink') || tags.includes('nightlife') ? 'pickup' : info.item === 'punchingBag' ? 'punch' : tags.includes('fitness') ? 'jump' : null;
      const c = o.mesh.getWorldPosition(new THREE.Vector3());
      this.targets.push({ at: { x: o.stand.x, z: o.stand.z }, face: { x: c.x, z: c.z }, pose, key: o.id });
    }
    // A few spots to just stand and chat.
    for (let k = 0; k < 6; k++) {
      const x = (this.rand() - 0.5) * (this.layout.width - 3);
      const z = (this.rand() - 0.2) * (this.layout.depth - 4) * 0.6;
      if (this.home.spotFree(x, z)) this.targets.push({ at: { x, z }, face: { x: x + this.rand() - 0.5, z: z + 1 }, pose: null, key: `chat:${k}` });
    }
  }

  private addVisitor(i: number): void {
    const look = {
      body: this.rand() < 0.5 ? ('m' as const) : ('f' as const),
      skin: SKINS[Math.floor(this.rand() * SKINS.length)],
      top: CLOTHES[Math.floor(this.rand() * CLOTHES.length)],
      bottom: CLOTHES[Math.floor(this.rand() * CLOTHES.length)],
      hair: HAIR[Math.floor(this.rand() * HAIR.length)],
    };
    const avatar = makeAvatar(look);
    const t = this.pickTarget();
    // Start at a target already (the room's in full swing when you walk in), staggered.
    const at = t?.at ?? { x: (i % 5) - 2, z: 0 };
    avatar.root.position.set(at.x, 0, at.z);
    if (t) avatar.root.rotation.y = Math.atan2(t.face.x - at.x, t.face.z - at.z);
    avatar.setAction(t?.pose ?? null);
    this.home.scene.add(avatar.root);
    this.visitors.push({ avatar, path: [], target: t, stay: 3 + this.rand() * 12 });
  }

  private pickTarget(): Target | null {
    const free = this.targets.filter((t) => !this.busy.has(t.key));
    if (!free.length) return null;
    const t = free[Math.floor(this.rand() * free.length)];
    this.busy.add(t.key);
    return t;
  }

  private addEffects(): void {
    const fx = this.layout.life?.fx ?? [];
    const pieces = (ids: string[]) => this.home.objects.filter((o) => ids.includes(this.home.pieceInfo(o.id)?.item ?? ''));
    if (fx.includes('club')) {
      // Coloured lights circling the dance floor, and a disco ball.
      for (const [i, color] of ['#ff4fa3', '#36c5f0', '#9b5de5'].entries()) {
        const light = new THREE.PointLight(color, 6, 12, 1.6);
        const base = new THREE.Vector3(0, 3.2, 1.2);
        light.position.copy(base);
        this.home.scene.add(light);
        this.extras.push(light);
        this.lights.push({ light, phase: (i * Math.PI * 2) / 3, kind: 'club', base });
      }
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: '#e6e6f0', metalness: 0.9, roughness: 0.25, flatShading: true }));
      ball.position.set(0, 4.0, 1.4);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 4), new THREE.MeshBasicMaterial({ color: '#111111' }));
      cord.position.set(0, 5.1, 1.4);
      this.home.scene.add(ball, cord);
      this.extras.push(ball, cord);
      this.discoBall = ball;
    }
    if (fx.includes('flicker')) {
      for (const o of pieces(['streetLamp'])) {
        const p = o.mesh.getWorldPosition(new THREE.Vector3());
        const light = new THREE.PointLight('#ffd27a', 4, 8, 1.6);
        light.position.set(p.x, 2.7, p.z);
        this.home.scene.add(light);
        this.extras.push(light);
        this.lights.push({ light, phase: this.rand() * 10, kind: 'flicker', base: light.position.clone() });
      }
    }
    if (fx.includes('steam')) for (const o of pieces(['flatTopGrill', 'coffeeStation', 'espressoBar'])) this.emitters.push({ at: o.mesh.getWorldPosition(new THREE.Vector3()).setY(1.3), kind: 'steam', every: 0.45, t: 0 });
    if (fx.includes('notes')) for (const o of pieces(['jukebox', 'djBooth'])) this.emitters.push({ at: o.mesh.getWorldPosition(new THREE.Vector3()).setY(1.5), kind: 'notes', every: 0.9, t: 0 });
  }

  private float(emoji: string, at: THREE.Vector3, opts: { life?: number; vy?: number; size?: number; drift?: number; grow?: number } = {}): void {
    if (this.floats.length > 40) return;
    const mat = new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    const size = opts.size ?? 0.55;
    sprite.scale.set(size, size, size);
    sprite.position.copy(at);
    sprite.renderOrder = 5;
    this.home.scene.add(sprite);
    this.floats.push({ sprite, age: 0, life: opts.life ?? 1.6, vy: opts.vy ?? 0.5, drift: opts.drift ?? 0, grow: opts.grow ?? 0 });
  }

  update(dt: number): void {
    this.time += dt;
    // Visitors.
    for (const v of this.visitors) {
      const p = v.avatar.root.position;
      let speed = 0;
      if (v.path.length) {
        const wp = v.path[0];
        const dx = wp.x - p.x, dz = wp.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.06) {
          v.path.shift();
          if (!v.path.length && v.target) {
            v.avatar.root.rotation.y = Math.atan2(v.target.face.x - p.x, v.target.face.z - p.z);
            v.avatar.setAction(v.target.pose);
          }
        } else {
          const step = Math.min(d, SPEED * dt);
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          v.avatar.root.rotation.y = Math.atan2(dx, dz);
          speed = SPEED;
        }
      } else if ((v.stay -= dt) <= 0) {
        // On to something else.
        if (v.target) this.busy.delete(v.target.key);
        const t = this.pickTarget();
        const pts = t ? this.home.walkPath(p.x, p.z, t.at.x, t.at.z) : null;
        if (t && pts?.length) {
          v.target = t;
          v.path = pts;
          v.avatar.setAction(null);
          v.stay = 6 + this.rand() * 12;
        } else {
          if (t) this.busy.delete(t.key);
          v.stay = 2;
        }
      }
      v.avatar.animate(speed, dt);
    }
    // Emoji pops over someone's head.
    const pops = this.layout.life?.pops ?? [];
    this.popT -= dt;
    if (pops.length && this.popT <= 0) {
      this.popT = 0.8 + this.rand() * 1.2;
      const people = [...this.visitors.map((v) => v.avatar.root), ...(this.coworkers?.list.map((c) => c.avatar.root) ?? [])];
      const who = people[Math.floor(this.rand() * people.length)];
      if (who) this.float(pops[Math.floor(this.rand() * pops.length)], who.position.clone().setY(2.0), { life: 1.8, vy: 0.35 });
    }
    // Steam and music notes.
    for (const e of this.emitters) {
      e.t -= dt;
      if (e.t > 0) continue;
      e.t = e.every * (0.7 + this.rand() * 0.6);
      if (e.kind === 'steam') this.float('☁️', e.at.clone().add(new THREE.Vector3((this.rand() - 0.5) * 0.5, 0, (this.rand() - 0.5) * 0.3)), { life: 1.4, vy: 0.6, size: 0.35, grow: 0.5 });
      else this.float(this.rand() < 0.5 ? '🎵' : '🎶', e.at.clone(), { life: 2.0, vy: 0.5, size: 0.4, drift: (this.rand() - 0.5) * 0.6 });
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.age += dt;
      f.sprite.position.y += f.vy * dt;
      f.sprite.position.x += f.drift * dt;
      const s = f.sprite.scale.x * (1 + f.grow * dt);
      f.sprite.scale.set(s, s, s);
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - f.age / f.life);
      if (f.age >= f.life) {
        f.sprite.removeFromParent();
        (f.sprite.material as THREE.SpriteMaterial).dispose();
        this.floats.splice(i, 1);
      }
    }
    // Lights: club lights circle on the beat; the alley lamp flickers.
    const beat = 0.6 + 0.4 * Math.abs(Math.sin(this.time * Math.PI * 2)); // 120 bpm
    for (const l of this.lights) {
      if (l.kind === 'club') {
        const a = this.time * 0.9 + l.phase;
        l.light.position.set(l.base.x + Math.cos(a) * 3.2, l.base.y, l.base.z + Math.sin(a) * 2.2);
        l.light.intensity = 6 * beat;
      } else {
        const n = Math.sin(this.time * 13 + l.phase) + Math.sin(this.time * 31 + l.phase * 2);
        l.light.intensity = n > 1.6 ? 0.4 : 4;
      }
    }
    if (this.discoBall) this.discoBall.rotation.y += dt * 0.8;
  }

  /** Visitors on screen (QA). */
  get count(): number {
    return this.visitors.length;
  }

  dispose(): void {
    for (const v of this.visitors) {
      v.avatar.root.removeFromParent();
      v.avatar.dispose();
    }
    for (const f of this.floats) {
      f.sprite.removeFromParent();
      (f.sprite.material as THREE.SpriteMaterial).dispose();
    }
    for (const x of this.extras) {
      x.removeFromParent();
      if (x instanceof THREE.Mesh) {
        x.geometry.dispose();
        (x.material as THREE.Material).dispose();
      }
    }
    this.visitors.length = 0;
    this.floats.length = 0;
  }
}
