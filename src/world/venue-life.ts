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

/** A light beam's fade: bright at the lamp, gone by the floor. */
let beamTex: THREE.CanvasTexture | null = null;
function beamTexture(): THREE.CanvasTexture {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
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
  private readonly lights: { light: THREE.PointLight; phase: number; kind: 'club' | 'flicker' | 'neon'; base: THREE.Vector3 }[] = [];
  /** 🦆 Ducks circling the pond: sprite, pond centre, radius, phase, speed. */
  private readonly ducks: { sprite: THREE.Sprite; c: THREE.Vector3; r: number; a: number; w: number }[] = [];
  private discoBall: THREE.Object3D | null = null;
  /** 🌈 Club light beams: cones that sweep the room. */
  private readonly beams: { beam: THREE.Mesh; phase: number }[] = [];
  private emitters: { at: THREE.Vector3; kind: 'steam' | 'notes' | 'drops'; every: number; t: number }[] = [];
  private popT = 0;
  private time = 0;
  /** 💃 Club dancers on the pole stages (NPC only: players can't get up there). */
  private readonly poleDancers: { avatar: Avatar; c: THREE.Vector3; top: number; a: number; t: number; cycle: number; mode: string }[] = [];
  /** 🟩 Laser fans from the DJ end of the room. */
  private readonly lasers: { mesh: THREE.Mesh; phase: number; mat: THREE.MeshBasicMaterial }[] = [];
  /** 🌫️ Haze drifting low over the floor. */
  private readonly haze: { sprite: THREE.Sprite; v: THREE.Vector3; base: number }[] = [];
  /** 💨 CO2 blasts and 🎊 confetti on the drop. */
  private readonly bits: { sprite: THREE.Sprite; v: THREE.Vector3; age: number; life: number; spin: number; grow: number }[] = [];
  private nextDrop = 6;
  private dropT = -1;
  private strobe: THREE.PointLight | null = null;
  private djAt = new THREE.Vector3(0, 0, -4);
  private readonly tmp = new THREE.Vector3();
  /** The room is cheering (someone popped a bottle) until this time. */
  private cheerUntil = 0;
  /** 🤵 The bar's waiter: picks up at the bar, carries a drink to a table, comes back. */
  private runner: { avatar: Avatar; drink: THREE.Sprite; path: { x: number; z: number }[]; leg: 'toBar' | 'atBar' | 'toTable' | 'atTable'; wait: number; table: THREE.Vector3 | null; drinks: number } | null = null;

  constructor(
    private readonly home: HomeInterior,
    private readonly layout: HomeLayout,
    visitorCount: number,
    private readonly coworkers: Coworkers | null,
    private readonly rand: () => number = Math.random,
  ) {
    this.findTargets();
    for (let i = 0; i < visitorCount; i++) this.addVisitor(i);
    this.addPoleDancers();
    this.addEffects();
    this.addRunner();
  }

  private addRunner(): void {
    const r = this.layout.life?.runner;
    const bar = r && this.home.objects.find((o) => o.id === r.from);
    if (!r || !bar) return;
    const avatar = makeAvatar({ body: this.rand() < 0.5 ? 'm' : 'f', skin: SKINS[Math.floor(this.rand() * SKINS.length)], top: '#f4f4f4', bottom: '#111111', hair: HAIR[Math.floor(this.rand() * HAIR.length)] });
    avatar.root.position.set(bar.stand.x, 0, bar.stand.z);
    this.home.scene.add(avatar.root);
    const drink = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🍺'), transparent: true, depthWrite: false }));
    drink.scale.set(0.38, 0.38, 0.38);
    drink.position.set(0.3, 1.35, 0.25);
    drink.visible = false;
    avatar.root.add(drink);
    this.runner = { avatar, drink, path: [], leg: 'atBar', wait: 1, table: null, drinks: 0 };
  }

  /** 🤵 One step of the waiter's loop: bar → table → bar. */
  private updateRunner(dt: number): void {
    const w = this.runner;
    const r = this.layout.life?.runner;
    if (!w || !r) return;
    const p = w.avatar.root.position;
    let speed = 0;
    if (w.path.length) {
      const wp = w.path[0];
      const dx = wp.x - p.x, dz = wp.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.06) w.path.shift();
      else {
        const step = Math.min(d, SPEED * 1.25 * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        w.avatar.root.rotation.y = Math.atan2(dx, dz);
        speed = SPEED * 1.25;
      }
    } else if ((w.wait -= dt) <= 0) {
      if (w.leg === 'toTable') {
        // Drop the drink off.
        w.leg = 'atTable';
        w.wait = 1.2;
        w.drink.visible = false;
        w.drinks++;
        if (w.table) this.float('🙏', w.table.clone().setY(1.8), { life: 1.4, vy: 0.4, size: 0.45 });
      } else if (w.leg === 'atTable' || w.leg === 'toBar') {
        // Head back to the bar.
        const bar = this.home.objects.find((o) => o.id === r.from)!;
        w.path = this.home.walkPath(p.x, p.z, bar.stand.x, bar.stand.z) ?? [];
        w.leg = w.leg === 'atTable' ? 'toBar' : 'atBar';
        w.wait = w.leg === 'atBar' ? 1.5 + this.rand() * 1.5 : 0;
      } else {
        // At the bar: pick up a drink and take it to a table.
        const tables = r.to.map((id) => this.home.objects.find((o) => o.id === id)).filter((o) => !!o);
        const t = tables[Math.floor(this.rand() * tables.length)];
        const pts = t ? this.home.walkPath(p.x, p.z, t.stand.x, t.stand.z) : null;
        if (t && pts?.length) {
          (w.drink.material as THREE.SpriteMaterial).map = emojiTexture(r.carry[Math.floor(this.rand() * r.carry.length)]);
          w.drink.visible = true;
          w.path = pts;
          w.table = t.mesh.getWorldPosition(new THREE.Vector3());
          w.leg = 'toTable';
          w.wait = 0;
        } else w.wait = 2;
      }
    }
    w.avatar.animate(speed, dt);
  }

  /** Drinks the waiter has delivered (QA). */
  get runnerDrinks(): number {
    return this.runner?.drinks ?? -1;
  }

  /** Everything a visitor might go and do: the room's usable pieces, plus the dance floors. */
  private findTargets(): void {
    for (const o of this.home.objects) {
      const info = this.home.pieceInfo(o.id);
      if (!info) continue;
      if (info.item === 'danceFloor' || info.item === 'ledDanceFloor' || info.item.startsWith('ledFloor')) {
        // Several dancers per floor, spread over it.
        const { fp } = info;
        const n = info.item === 'danceFloor' ? 2 : 3;
        for (let k = 0; k < n * n; k++) {
          const x = info.x + (fp.minX + (fp.maxX - fp.minX) * (0.15 + 0.7 * ((k % n) + 0.5) / n));
          const z = info.z + (fp.minZ + (fp.maxZ - fp.minZ) * (0.15 + 0.7 * (Math.floor(k / n) + 0.5) / n));
          this.targets.push({ at: { x, z }, face: { x, z: z - 1 }, pose: 'dance', key: `${o.id}:${k}` });
        }
        continue;
      }
      if (!o.actions.length) continue;
      const tags = o.actions.flatMap((a) => ACTIONS[a]?.tags ?? []);
      // What a visitor does there: eat or drink at counters and tables,
      // talk at the bar, punch the bag, train, browse, play.
      const pose: FolkAnim | null =
        info.item === 'punchingBag' ? 'jab'
        : tags.includes('eat') || tags.includes('drink') ? 'eat'
        : tags.includes('nightlife') ? (this.rand() < 0.5 ? 'dance' : 'talk')
        : tags.includes('fitness') ? (this.rand() < 0.5 ? 'push' : 'crouch')
        : tags.includes('shop') ? 'interact'
        : null;
      const c = o.mesh.getWorldPosition(new THREE.Vector3());
      this.targets.push({ at: { x: o.stand.x, z: o.stand.z }, face: { x: c.x, z: c.z }, pose, key: o.id });
    }
    // A few spots to just stand and chat.
    // Clubs are packed: lots more people standing round with drinks, dancing where they stand.
    const club = this.layout.life?.fx.includes('lasers');
    const spots = club ? 26 : 6;
    for (let k = 0; k < spots; k++) {
      const x = (this.rand() - 0.5) * (this.layout.width - 3);
      const z = club ? (this.rand() - 0.5) * (this.layout.depth - 3) : (this.rand() - 0.2) * (this.layout.depth - 4) * 0.6;
      const poses = club ? (['dance', 'dance', 'talk', 'dance', 'phone', 'eat'] as const) : (['talk', 'talk', 'phone', 'foldArms', null] as const);
      if (this.home.spotFree(x, z)) this.targets.push({ at: { x, z }, face: { x: x + this.rand() - 0.5, z: z + 1 }, pose: poses[k % poses.length], key: `chat:${k}` });
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


  /** 💃 A dancer on every pole stage: they circle the pole, spin up it and slide down, on a loop. */
  private addPoleDancers(): void {
    const OUTFITS = ['#ff3fb4', '#9b5cff', '#22d3ee', '#ffd36b', '#ffffff', '#e63946', '#1d1e22', '#c9a24a'];
    for (const o of this.home.objects) {
      const info = this.home.pieceInfo(o.id);
      if (!info || (info.item !== 'polePodium' && info.item !== 'cagePole')) continue;
      const body = this.rand() < 0.75 ? ('f' as const) : ('m' as const);
      const top = OUTFITS[Math.floor(this.rand() * OUTFITS.length)];
      const avatar = makeAvatar({ body, skin: SKINS[Math.floor(this.rand() * SKINS.length)], top, bottom: this.rand() < 0.5 ? '#111111' : top, hair: HAIR[Math.floor(this.rand() * HAIR.length)] });
      const c = new THREE.Vector3(info.x, 0, info.z);
      const top0 = info.item === 'cagePole' ? 0.45 : 0.42;
      avatar.root.position.set(c.x, top0, c.z + 0.4);
      avatar.setAction('dance');
      this.home.scene.add(avatar.root);
      this.poleDancers.push({ avatar, c, top: top0, a: this.rand() * Math.PI * 2, t: this.rand() * 10, cycle: 11 + this.rand() * 3, mode: 'dance' });
    }
  }

  private updatePoleDancers(dt: number): void {
    for (const d of this.poleDancers) {
      d.t = (d.t + dt) % d.cycle;
      const u = d.t / d.cycle;
      // 0–55%: dance round the pole · 55–75%: spin up it · 75–90%: slide down · 90–100%: hit a pose.
      const mode = u < 0.55 ? 'dance' : u < 0.75 ? 'spin' : u < 0.9 ? 'slide' : 'pose';
      if (mode !== d.mode) {
        d.mode = mode;
        if (mode === 'dance') { d.avatar.setHold(null); d.avatar.setAction('dance'); }
        else if (mode === 'spin') { d.avatar.setAction('jump'); d.avatar.setHold(0.42); }
        else if (mode === 'slide') { d.avatar.setAction('jump'); d.avatar.setHold(0.3); }
        else { d.avatar.setHold(null); d.avatar.setAction('wave'); }
      }
      const r = mode === 'dance' ? 0.42 : 0.3;
      d.a += dt * (mode === 'spin' ? 4.2 : mode === 'slide' ? 2.4 : 0.55);
      const lift = mode === 'spin' ? Math.min(1, (u - 0.55) / 0.08) * 0.85 : mode === 'slide' ? (1 - (u - 0.75) / 0.15) * 0.85 : 0;
      const p = d.avatar.root.position;
      p.set(d.c.x + Math.cos(d.a) * r, d.top + lift, d.c.z + Math.sin(d.a) * r);
      // Side-on to the pole, one hand on it.
      d.avatar.root.rotation.y = Math.atan2(d.c.x - p.x, d.c.z - p.z) + (mode === 'dance' ? Math.PI / 2 : Math.PI / 2.4);
      d.avatar.root.rotation.z = mode === 'spin' ? 0.25 : 0;
      d.avatar.animate(0, dt);
      // Now and then the crowd makes it rain.
      if (this.rand() < dt * 0.35) this.float(this.rand() < 0.7 ? '💸' : '🔥', p.clone().setY(2.6), { life: 1.6, vy: -0.6, size: 0.42, drift: (this.rand() - 0.5) * 0.8 });
    }
  }

  /** A soft round glow (haze puffs, CO2, sparks). */
  private static glowTex: THREE.CanvasTexture | null = null;
  private glowTexture(): THREE.CanvasTexture {
    if (VenueLife.glowTex) return VenueLife.glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    VenueLife.glowTex = new THREE.CanvasTexture(c);
    return VenueLife.glowTex;
  }

  private spawnBit(at: THREE.Vector3, v: THREE.Vector3, color: string, size: number, life: number, opts: { additive?: boolean; grow?: number; spin?: number; square?: boolean } = {}): void {
    if (this.bits.length > 220) return;
    const mat = new THREE.SpriteMaterial({ map: opts.square ? null : this.glowTexture(), color, transparent: true, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, size);
    sprite.position.copy(at);
    sprite.renderOrder = 6;
    this.home.scene.add(sprite);
    this.bits.push({ sprite, v, age: 0, life, spin: opts.spin ?? 0, grow: opts.grow ?? 0 });
  }

  /** 💥 The drop: CO2 jets by the DJ, confetti over the floor, the strobe goes. */
  drop(): void {
    this.dropT = 0;
    this.cheer(4);
    const fx = this.layout.life?.fx ?? [];
    if (fx.includes('co2')) {
      for (const sx of [-2.4, 2.4]) {
        for (let i = 0; i < 26; i++) {
          const at = this.djAt.clone().add(new THREE.Vector3(sx, 0.4, 0.6));
          this.spawnBit(at, new THREE.Vector3((this.rand() - 0.5) * 0.8, 3.5 + this.rand() * 2.5, (this.rand() - 0.5) * 0.8), '#e8f4ff', 0.8, 2.0 + this.rand() * 0.6, { grow: 1.4 });
        }
      }
    }
    if (fx.includes('confetti')) {
      const cols = ['#ff3fb4', '#22d3ee', '#ffd36b', '#9b5cff', '#3ddc84', '#ffffff'];
      for (let i = 0; i < 140; i++) {
        const at = new THREE.Vector3((this.rand() - 0.5) * this.layout.width * 0.6, 3.6 + this.rand(), (this.rand() - 0.5) * this.layout.depth * 0.5);
        this.spawnBit(at, new THREE.Vector3((this.rand() - 0.5) * 0.6, -0.9 - this.rand() * 0.6, (this.rand() - 0.5) * 0.6), cols[i % cols.length], 0.16, 5 + this.rand() * 2, { square: true, spin: (this.rand() - 0.5) * 8 });
      }
    }
  }

  private addEffects(): void {
    const fx = this.layout.life?.fx ?? [];
    const pieces = (ids: string[]) => this.home.objects.filter((o) => ids.includes(this.home.pieceInfo(o.id)?.item ?? ''));
    const dj = pieces(['djBooth'])[0];
    if (dj) this.djAt = dj.mesh.getWorldPosition(new THREE.Vector3()).setY(0);
    if (fx.includes('lasers')) {
      // A fan of laser beams from above the DJ, sweeping the room.
      const cols = this.layout.life?.laserColors ?? ['#3dff6e', '#3dff6e', '#ff2a5c', '#22d3ee'];
      for (let i = 0; i < 10; i++) {
        // A unit-long beam, stretched each frame so it ends where it hits the floor.
        const geo = new THREE.CylinderGeometry(0.02, 0.02, 1, 4, 1, true).translate(0, -0.5, 0);
        const mat = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(this.djAt.x, 3.1, this.djAt.z + 0.2);
        mesh.renderOrder = 4;
        this.home.scene.add(mesh);
        this.extras.push(mesh);
        this.lasers.push({ mesh, phase: i * 0.62, mat });
      }
    }
    if (fx.includes('haze')) {
      for (let i = 0; i < 14; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: i % 3 ? '#b9a6ff' : '#ff9fd8', transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending }));
        const s0 = 3 + this.rand() * 2.5;
        sprite.scale.set(s0, s0 * 0.55, s0);
        sprite.position.set((this.rand() - 0.5) * this.layout.width * 0.8, 0.6 + this.rand() * 1.2, (this.rand() - 0.5) * this.layout.depth * 0.7);
        sprite.renderOrder = 3;
        this.home.scene.add(sprite);
        this.extras.push(sprite);
        this.haze.push({ sprite, v: new THREE.Vector3((this.rand() - 0.5) * 0.4, 0, (this.rand() - 0.5) * 0.3), base: sprite.position.y });
      }
    }
    if (fx.includes('co2') || fx.includes('confetti')) {
      this.strobe = new THREE.PointLight('#ffffff', 0, 30, 1.2);
      this.strobe.position.set(0, 4, 0);
      this.home.scene.add(this.strobe);
      this.extras.push(this.strobe);
    }
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
      // Light beams sweeping the room from up high (soft additive cones: cheap "haze").
      const tex = beamTexture();
      const cols = ['#ff4fb8', '#22d3ee', '#9b5cff', '#ffd36b', '#3ddc84', '#ff4fb8'];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const len = 5.5;
        const geo = new THREE.ConeGeometry(0.9, len, 18, 1, true).translate(0, -len / 2, 0);
        const mat = new THREE.MeshBasicMaterial({ map: tex, color: cols[i], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
        const beam = new THREE.Mesh(geo, mat);
        const x = ((i + 0.5) / n - 0.5) * this.layout.width * 0.7;
        beam.position.set(x, 3.3, -this.layout.depth / 2 + 1.2);
        beam.renderOrder = 4;
        this.home.scene.add(beam);
        this.extras.push(beam);
        this.beams.push({ beam, phase: i * 1.3 });
      }
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
    if (fx.includes('neon')) {
      // Arcade / casino: coloured lights that breathe in and out over the floor.
      const cols = ['#ff4fa3', '#36c5f0', '#ffd23f', '#9b5de5'];
      for (let i = 0; i < 4; i++) {
        const base = new THREE.Vector3(((i % 2) - 0.5) * this.layout.width * 0.5, 3.0, (Math.floor(i / 2) - 0.5) * this.layout.depth * 0.45);
        const light = new THREE.PointLight(cols[i], 5, 11, 1.6);
        light.position.copy(base);
        this.home.scene.add(light);
        this.extras.push(light);
        this.lights.push({ light, phase: i * 1.7, kind: 'neon', base });
      }
    }
    if (fx.includes('ducks')) {
      // The duck pond, and the Lake in Central Park (more ducks, two rowboats, wider circles).
      for (const o of pieces(['pond', 'lake'])) {
        const lake = this.home.pieceInfo(o.id)?.item === 'lake';
        const c = o.mesh.getWorldPosition(new THREE.Vector3()).setY(0.32);
        if (lake) c.x -= 3.6;
        for (let k = 0; k < (lake ? 6 : 4); k++) {
          if (lake && k >= 4) {
            const boat = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🚣'), transparent: true, depthWrite: false }));
            boat.scale.set(0.9, 0.9, 0.9);
            this.home.scene.add(boat);
            this.extras.push(boat);
            this.ducks.push({ sprite: boat, c: c.clone().setX(c.x + 4.6), r: 1.6 + (k - 4) * 0.5, a: k * 2.2, w: (k % 2 ? -1 : 1) * 0.18 });
            continue;
          }
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(k === 3 ? '🦢' : '🦆'), transparent: true, depthWrite: false }));
          sprite.scale.set(0.55, 0.55, 0.55);
          this.home.scene.add(sprite);
          this.extras.push(sprite);
          this.ducks.push({ sprite, c, r: (lake ? 0.9 : 0.6) + k * (lake ? 0.45 : 0.32), a: k * 1.9, w: (k % 2 ? -1 : 1) * (0.35 + this.rand() * 0.25) });
        }
      }
    }
    if (fx.includes('splash')) for (const o of pieces(['fountain', 'bethesdaFountain'])) this.emitters.push({ at: o.mesh.getWorldPosition(new THREE.Vector3()).setY(this.home.pieceInfo(o.id)?.item === 'bethesdaFountain' ? 2.4 : 2.0), kind: 'drops', every: 0.18, t: 0 });
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
    for (const b of this.beams) {
      const t = this.time * 0.7 + b.phase;
      // Aim down into the room and sweep side to side and back and forth.
      b.beam.rotation.set(-0.55 - Math.sin(t * 0.8) * 0.35, 0, Math.sin(t) * 0.6);
    }
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
    const cheering = this.time < this.cheerUntil;
    const pops = cheering ? ['🎉', '🙌', '🔥', '🥂', '😍'] : this.layout.life?.pops ?? [];
    this.popT -= dt;
    if (pops.length && this.popT <= 0) {
      this.popT = cheering ? 0.15 + this.rand() * 0.2 : 0.8 + this.rand() * 1.2;
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
      else if (e.kind === 'drops') this.float('💧', e.at.clone().add(new THREE.Vector3((this.rand() - 0.5) * 0.3, 0, (this.rand() - 0.5) * 0.3)), { life: 0.9, vy: -1.4, size: 0.22, drift: (this.rand() - 0.5) * 1.6 });
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
      } else if (l.kind === 'neon') {
        l.light.intensity = 3 + 3 * (0.5 + 0.5 * Math.sin(this.time * 1.4 + l.phase));
      } else {
        const n = Math.sin(this.time * 13 + l.phase) + Math.sin(this.time * 31 + l.phase * 2);
        l.light.intensity = n > 1.6 ? 0.4 : 4;
      }
    }
    if (this.discoBall) this.discoBall.rotation.y += dt * 0.8;
    this.updatePoleDancers(dt);
    for (const l of this.lasers) {
      const t = this.time * 0.9 + l.phase;
      l.mesh.rotation.set(-0.75 - Math.sin(t * 0.7) * 0.35, 0, Math.sin(t) * 0.8);
      // Where the beam points (local −y), and how far until it reaches the floor.
      this.tmp.set(0, -1, 0).applyEuler(l.mesh.rotation);
      l.mesh.scale.y = Math.min(l.mesh.position.y / Math.max(0.2, -this.tmp.y), Math.max(this.layout.width, this.layout.depth) * 0.6);
      l.mat.opacity = 0.55 + 0.45 * beat;
    }
    for (const h of this.haze) {
      h.sprite.position.addScaledVector(h.v, dt);
      h.sprite.position.y = h.base + Math.sin(this.time * 0.4 + h.base * 3) * 0.15;
      if (Math.abs(h.sprite.position.x) > this.layout.width * 0.45) h.v.x *= -1;
      if (Math.abs(h.sprite.position.z) > this.layout.depth * 0.4) h.v.z *= -1;
    }
    // The drop every half a minute or so.
    if ((this.layout.life?.fx ?? []).some((f) => f === 'co2' || f === 'confetti')) {
      this.nextDrop -= dt;
      if (this.nextDrop <= 0) {
        this.nextDrop = 26 + this.rand() * 14;
        this.drop();
      }
    }
    if (this.dropT >= 0) {
      this.dropT += dt;
      if (this.strobe) this.strobe.intensity = this.dropT < 2.2 && Math.floor(this.dropT * 12) % 2 === 0 ? 22 : 0;
      if (this.dropT > 2.4) this.dropT = -1;
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.age += dt;
      b.v.y -= b.grow > 0 ? 2.5 * dt : 0;
      b.sprite.position.addScaledVector(b.v, dt);
      if (b.grow) { const k = b.sprite.scale.x * (1 + b.grow * dt); b.sprite.scale.set(k, k, k); }
      if (b.spin) (b.sprite.material as THREE.SpriteMaterial).rotation += b.spin * dt;
      if (b.sprite.position.y < 0.05) b.v.set(0, 0, 0);
      (b.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - b.age / b.life) * (b.grow ? 0.6 : 1);
      if (b.age >= b.life) {
        b.sprite.removeFromParent();
        (b.sprite.material as THREE.SpriteMaterial).dispose();
        this.bits.splice(i, 1);
      }
    }
    // Ducks paddle round the pond, bobbing a little.
    for (const d of this.ducks) {
      d.a += d.w * dt;
      d.sprite.position.set(d.c.x + Math.cos(d.a) * d.r, d.c.y + Math.sin(this.time * 3 + d.r) * 0.03, d.c.z + Math.sin(d.a) * d.r);
    }
    this.updateRunner(dt);
  }

  /** Everyone cheers for a while (🎉 over heads, faster). */
  cheer(seconds: number): void {
    this.cheerUntil = Math.max(this.cheerUntil, this.time + seconds);
  }

  /** Visitors on screen (QA). */
  get count(): number {
    return this.visitors.length;
  }

  dispose(): void {
    if (this.runner) {
      this.runner.avatar.root.removeFromParent();
      (this.runner.drink.material as THREE.SpriteMaterial).dispose();
      this.runner.avatar.dispose();
      this.runner = null;
    }
    for (const v of [...this.visitors, ...this.poleDancers]) {
      v.avatar.root.removeFromParent();
      v.avatar.dispose();
    }
    for (const b of this.bits) {
      b.sprite.removeFromParent();
      (b.sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.bits.length = 0;
    this.poleDancers.length = 0;
    for (const f of this.floats) {
      f.sprite.removeFromParent();
      (f.sprite.material as THREE.SpriteMaterial).dispose();
    }
    for (const x of this.extras) {
      x.removeFromParent();
      if (x instanceof THREE.Mesh) {
        x.geometry.dispose();
        (x.material as THREE.Material).dispose();
      } else if (x instanceof THREE.Sprite) x.material.dispose();
    }
    this.visitors.length = 0;
    this.floats.length = 0;
  }
}
