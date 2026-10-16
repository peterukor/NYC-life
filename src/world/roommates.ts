// =====================================================================
// roommates.ts — the people you share the walk-up with.
//
// Each roommate is a real character (same body and clothes system as the
// player) who potters between the shared rooms: stands a while, walks
// somewhere else around the furniture, stands again. They never go into
// your room. Tap one to chat (data/actions.ts → chatRoommate); they stop
// and turn to you while you talk.
//
// They also have a life (sim/roommate-life.ts): every minute or so one
// heads out the front door, comes back (sometimes with a date), eats your
// leftovers, asks for $20… A date chats in the living room, then both
// walk into the roommate's room; the door gets bouncing emoji for a while
// (💕🎶😳) and the guest leaves later. Fade-to-black: nothing is shown.
// The words come from the game (onBeat → game.ts roommateBeat).
// =====================================================================

import * as THREE from 'three';
import type { HomeConditions } from '../data/homes.ts';
import { ROOMMATE_LIFE, pickBeat, type Beat } from '../sim/roommate-life.ts';
import type { Look } from '../sim/types.ts';
import { makeAvatar, OUTFIT_COLORS, SKIN_TONES, type Avatar } from './avatar.ts';
import type { HomeInterior } from './home-interior.ts';

type RoommateDef = NonNullable<HomeConditions['roommates']>[number];
type Pt = { x: number; z: number };

/** One scripted step (dates, heading out). */
type Step = { go: Pt } | { wait: number } | { hide: true } | { show: Pt } | { face: () => Pt; t: number } | { run: () => void };

interface Actor {
  avatar: Avatar;
  path: Pt[];
  /** Scripted steps; while any are left the actor doesn't wander. */
  script: Step[];
  /** Time spent on the current step. */
  stepT: number;
  stepStarted: boolean;
}

export interface Roommate extends Actor {
  def: RoommateDef;
  /** Invisible tap target around them (skinned meshes pick badly). */
  hit: THREE.Mesh;
  /** Seconds left standing before they wander off again. */
  wait: number;
  /** Talking to you: stay put and face this point. */
  heldBy: { x: number; z: number; t: number } | null;
  /** Out of the apartment. */
  away: boolean;
  /** Their bedroom door (furniture uid). */
  door: string;
}

const SPEED = 1.1;
const FRONT_DOOR: Pt = { x: 0.4, z: 4.9 };
const BUBBLES = ['💕', '🎶', '😳', '🛏️', '💦', '🔥', '🙈'];

export interface RoommateOptions {
  rand?: () => number;
  /** A beat is ready: show it. Return false if now's a bad time (a menu is open); it's tried again soon. */
  onBeat?: (b: Beat) => boolean;
  /** Mid-date lines (index 0..). */
  onDateLine?: (b: Beat, i: number) => void;
  /** The date left. */
  onDateOver?: (b: Beat) => void;
  /** NYC hour now (night owls may be out when you get home). */
  hour?: number;
}

export class Roommates {
  readonly list: Roommate[] = [];
  private guests: Actor[] = [];
  private readonly hitGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.7, 10);
  private readonly hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  private readonly rand: () => number;
  private nextBeat: number;
  private bubble: { sprite: THREE.Sprite; tex: THREE.CanvasTexture; t: number; i: number; base: THREE.Vector3; canvas: HTMLCanvasElement } | null = null;

  constructor(
    private readonly home: HomeInterior,
    defs: RoommateDef[],
    private readonly opts: RoommateOptions = {},
  ) {
    this.rand = opts.rand ?? Math.random;
    const doors = home.items.filter((it) => it.item === 'roommateDoor').map((it) => it.uid);
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
      // The night-shift baker is often at work at night; anyone might be out.
      const night = opts.hour !== undefined && (opts.hour >= 21 || opts.hour < 5);
      const away = this.rand() < (night && /night/i.test(def.habit) ? 0.7 : 0.2);
      avatar.root.visible = !away;
      this.list.push({ def, avatar, hit, path: [], script: [], stepT: 0, stepStarted: false, wait: 1 + this.rand() * 4, heldBy: null, away, door: doors[i] ?? doors[0] ?? '' });
    });
    this.nextBeat = this.range(ROOMMATE_LIFE.firstAfter);
  }

  private range([a, b]: [number, number]): number {
    return a + this.rand() * (b - a);
  }

  /** Tap targets, for picking (not people who are out or behind a door). */
  get hits(): THREE.Object3D[] {
    return this.list.filter((r) => r.avatar.root.visible).map((r) => r.hit);
  }

  byName(name: string): Roommate | undefined {
    return this.list.find((r) => r.def.name === name);
  }

  /** In the middle of something (heading out, a date): can't chat. */
  busy(name: string): boolean {
    const r = this.byName(name);
    return !r || r.away || r.script.length > 0;
  }

  /** Stop and face someone for a few seconds (while you chat). */
  hold(name: string, x: number, z: number, seconds = 8): void {
    const r = this.byName(name);
    if (!r || r.script.length) return;
    r.path = [];
    r.heldBy = { x, z, t: seconds };
  }

  /** A date's happening behind a door right now. */
  get dateOn(): boolean {
    return !!this.bubble;
  }

  /** A clear standing spot in a shared room (never your room). */
  private spot(): Pt | null {
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

  /** Where to stand to go through a roommate's door (a step into the room from it). */
  private doorStand(r: Roommate): Pt {
    const d = this.home.itemPos(r.door);
    if (!d) return FRONT_DOOR;
    return { x: d.x - Math.sign(d.x || 1) * 0.65, z: d.z };
  }

  // -----------------------------------------------------------------
  // Beats
  // -----------------------------------------------------------------

  /** Make a beat happen now (QA). */
  force(b: Beat): boolean {
    if (this.opts.onBeat && !this.opts.onBeat(b)) return false;
    this.startBeat(b);
    return true;
  }

  private startBeat(b: Beat): void {
    const r = this.byName(b.name);
    if (!r) return;
    r.heldBy = null;
    r.path = [];
    if (b.kind === 'leave') {
      r.script.push({ go: FRONT_DOOR }, { hide: true }, { run: () => (r.away = true) });
    } else if (b.kind === 'return') {
      r.away = false;
      r.script.push({ show: FRONT_DOOR }, { wait: 1.5 });
    } else if (b.kind === 'date') {
      r.away = false;
      this.date(r, b);
    } else if (b.kind === 'cook' || b.kind === 'party') {
      // To the kitchen.
      r.script.push({ go: { x: -2.1, z: 0.9 } }, { wait: 6 });
    }
  }

  private date(r: Roommate, b: Beat): void {
    const g = this.makeGuest();
    const meet = this.spot() ?? { x: 1.2, z: 1.8 };
    const next = { x: meet.x + 0.7, z: meet.z };
    const gMeet = this.home.spotFree(next.x, next.z) ? next : { x: meet.x, z: meet.z + 0.7 };
    const door = this.doorStand(r);
    const gp = () => g.avatar.root.position;
    const rp = () => r.avatar.root.position;
    let lines = 0;
    const waitIn = (t: number): Step => ({ wait: t });
    r.script.push(
      { show: FRONT_DOOR },
      { go: meet },
      { face: () => gp(), t: ROOMMATE_LIFE.chatSeconds },
      { go: door },
      { hide: true },
      {
        run: () => this.showBubble(r),
      },
    );
    // Lines while they're in there, then the guest leaves.
    const gap = ROOMMATE_LIFE.inRoomSeconds / 4;
    for (let i = 0; i < 3; i++) r.script.push(waitIn(gap), { run: () => this.opts.onDateLine?.(b, lines++) });
    r.script.push(waitIn(gap), {
      run: () => {
        this.hideBubble();
        g.avatar.root.visible = true;
        g.avatar.root.position.set(door.x, 0, door.z);
        g.script.length = 0;
        g.stepStarted = false;
        g.script.push({ go: FRONT_DOOR }, { hide: true }, { run: () => this.dropGuest(g) });
        this.opts.onDateOver?.(b);
      },
    }, waitIn(3), { show: door }, { wait: 4 });
    g.script.push(
      { show: { x: FRONT_DOOR.x + 0.5, z: FRONT_DOOR.z } },
      { go: gMeet },
      { face: () => rp(), t: ROOMMATE_LIFE.chatSeconds + 1 },
      { go: door },
      { hide: true },
      // Wait behind the door until the roommate's script brings them back out.
      { wait: 9999 },
    );
  }

  private makeGuest(): Actor {
    const c = <T,>(a: readonly T[]) => a[Math.floor(this.rand() * a.length)];
    const look: Look = { body: this.rand() < 0.5 ? 'm' : 'f', skin: c(SKIN_TONES), top: c(OUTFIT_COLORS), bottom: c(OUTFIT_COLORS), hair: c(['#1b1b1b', '#2b1a10', '#6b4423', '#c8a165', '#a33']) };
    const avatar = makeAvatar(look);
    avatar.root.visible = false;
    this.home.scene.add(avatar.root);
    const g: Actor = { avatar, path: [], script: [], stepT: 0, stepStarted: false };
    this.guests.push(g);
    return g;
  }

  private dropGuest(g: Actor): void {
    g.script.length = 0;
    g.avatar.root.removeFromParent();
    g.avatar.dispose();
    this.guests = this.guests.filter((x) => x !== g);
  }

  // Emoji over the bedroom door: a sprite drawn from a canvas, bouncing.
  private showBubble(r: Roommate): void {
    this.hideBubble();
    const d = this.home.itemPos(r.door) ?? { x: 0, z: 0 };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(0.7, 0.7, 1);
    sprite.renderOrder = 10;
    const base = new THREE.Vector3(d.x - Math.sign(d.x || 1) * 0.3, 2.45, d.z);
    sprite.position.copy(base);
    this.home.scene.add(sprite);
    this.bubble = { sprite, tex, t: 0, i: -1, base, canvas };
  }

  private drawBubble(i: number): void {
    const b = this.bubble;
    if (!b) return;
    const g = b.canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1c2340';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(64, 60, 48, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.font = '60px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(BUBBLES[i % BUBBLES.length], 64, 64);
    b.tex.needsUpdate = true;
  }

  private hideBubble(): void {
    if (!this.bubble) return;
    this.bubble.sprite.removeFromParent();
    this.bubble.sprite.material.dispose();
    this.bubble.tex.dispose();
    this.bubble = null;
  }

  // -----------------------------------------------------------------
  // Per frame
  // -----------------------------------------------------------------

  /** One step along the path; returns the speed walked. */
  private walk(a: Actor, dt: number): number {
    const p = a.avatar.root.position;
    const wp = a.path[0];
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.06) {
      a.path.shift();
      return 0;
    }
    const step = Math.min(dist, SPEED * dt);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    let diff = Math.atan2(dx, dz) - a.avatar.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    a.avatar.root.rotation.y += diff * Math.min(1, dt * 10);
    return SPEED;
  }

  /** Run the actor's current script step. Returns the walking speed (for the animation). */
  private runScript(a: Actor, dt: number): number {
    const st = a.script[0];
    const p = a.avatar.root.position;
    let done = false, speed = 0;
    if (!a.stepStarted) {
      a.stepStarted = true;
      a.stepT = 0;
      if ('go' in st) {
        const pts = this.home.walkPath(p.x, p.z, st.go.x, st.go.z);
        a.path = pts ?? [];
        if (!pts) p.set(st.go.x, 0, st.go.z); // no way through: just be there
      }
    }
    a.stepT += dt;
    if ('go' in st) {
      if (a.path.length) speed = this.walk(a, dt);
      done = !a.path.length;
    } else if ('wait' in st) done = a.stepT >= st.wait;
    else if ('hide' in st) {
      a.avatar.root.visible = false;
      done = true;
    } else if ('show' in st) {
      p.set(st.show.x, 0, st.show.z);
      a.avatar.root.visible = true;
      done = true;
    } else if ('face' in st) {
      const f = st.face();
      a.avatar.root.rotation.y = Math.atan2(f.x - p.x, f.z - p.z);
      done = a.stepT >= st.t;
    } else if ('run' in st) {
      st.run();
      done = true;
    }
    if (done) {
      // `run` may have cleared the script (a guest leaving).
      if (a.script[0] === st) a.script.shift();
      a.stepStarted = false;
    }
    return speed;
  }

  update(dt: number): void {
    // The director: one beat every minute or so.
    if ((this.nextBeat -= dt) <= 0) {
      this.nextBeat = this.range(ROOMMATE_LIFE.every);
      const b = this.dateOn ? null : pickBeat(this.list.map((r) => ({ name: r.def.name, away: r.away, busy: r.script.length > 0 || !!r.heldBy })), this.rand);
      if (b) {
        if (this.opts.onBeat && !this.opts.onBeat(b)) this.nextBeat = 10;
        else this.startBeat(b);
      }
    }
    for (const r of this.list) {
      const p = r.avatar.root.position;
      let speed = 0;
      if (r.script.length) speed = this.runScript(r, dt);
      else if (r.away) {
        // Out of the apartment.
      } else if (r.heldBy) {
        r.heldBy.t -= dt;
        r.avatar.root.rotation.y = Math.atan2(r.heldBy.x - p.x, r.heldBy.z - p.z);
        if (r.heldBy.t <= 0) r.heldBy = null;
      } else if (r.path.length) {
        speed = this.walk(r, dt);
        if (!r.path.length) r.wait = 4 + this.rand() * 8;
      } else if ((r.wait -= dt) <= 0) {
        const to = this.spot();
        const pts = to ? this.home.walkPath(p.x, p.z, to.x, to.z) : null;
        if (pts?.length) r.path = pts;
        else r.wait = 2;
      }
      if (r.avatar.root.visible) r.avatar.animate(speed, dt);
    }
    for (const g of [...this.guests]) {
      const speed = g.script.length ? this.runScript(g, dt) : 0;
      if (g.avatar.root.visible) g.avatar.animate(speed, dt);
    }
    if (this.bubble) {
      const b = this.bubble;
      b.t += dt;
      const i = Math.floor(b.t / 1.4);
      if (i !== b.i) {
        b.i = i;
        this.drawBubble(i);
      }
      const k = (b.t % 1.4) / 1.4;
      b.sprite.position.set(b.base.x, b.base.y + Math.abs(Math.sin(k * Math.PI * 2)) * 0.18, b.base.z);
      const s = 0.62 + Math.sin(k * Math.PI) * 0.12;
      b.sprite.scale.set(s, s, 1);
    }
  }

  dispose(): void {
    this.hideBubble();
    for (const g of [...this.guests]) this.dropGuest(g);
    for (const r of this.list) {
      r.avatar.root.removeFromParent();
      r.avatar.dispose();
    }
    this.list.length = 0;
    this.hitGeo.dispose();
    this.hitMat.dispose();
  }
}
