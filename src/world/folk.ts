// =====================================================================
// folk.ts — the people (Quaternius "Ultimate Modular Men / Women", CC0).
//
// THE MODELS
//   Two bodies (men and women), each with one skeleton and a wardrobe of
//   PARTS: heads (a face with its hair or headgear), tops, bottoms, feet,
//   plus hairstyles, hats and accessories made in
//   scripts/build-people-assets.mjs. A person is a pick of parts merged
//   into ONE mesh (one draw call), so a crowd stays cheap.
//
// COLOURS
//   Every vertex carries a SLOT (skin, hair, top, top trim, bottom…), so
//   any skin tone, hair colour and outfit colour comes from the same
//   parts. Brows follow the hair colour.
//
// ANIMATIONS
//   39 clips per body (idle, walk, sit, dance, phone calls, eating,
//   driving…), mostly from Quaternius' Universal Animation Library and
//   moved onto these skeletons at build time. They load from a compact
//   .anim file (see world/people-anims.ts).
//
// TWO WAYS TO DRAW PEOPLE (so cheap phones keep up)
//   • Actor: fully animated (the player + the people nearest the camera).
//   • standingGeometries(): far-away crowd as instanced standing figures.
//
// TO ADD AN OUTFIT OR ANIMATION: see scripts/build-people-assets.mjs, then
// list wardrobe items in data/wardrobe.ts (their `parts`).
// =====================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { loadPeopleAnims } from './people-anims.ts';

/** The models are in metres already. */
export const FOLK_SCALE = 1;

/** Vertex slots (must match SLOT in scripts/build-people-assets.mjs). */
export const SLOT = { skin: 0, eyes: 1, hair: 2, top: 3, top2: 4, bottom: 5, bottom2: 6, shoes: 7, shoes2: 8, hat: 9, hat2: 10, detail: 11, brows: 12, extra: 13, extra2: 14 } as const;
export type ColorSlot = 'skin' | 'hair' | 'top' | 'top2' | 'bottom' | 'bottom2' | 'shoes' | 'shoes2' | 'hat' | 'hat2' | 'extra' | 'extra2';

/** Every animation the people have (names as the game calls them). */
export const FOLK_CLIPS = [
  'idle', 'walk', 'walkFormal', 'run', 'sprint', 'carry', 'sit', 'sitIdle', 'sitTalk', 'stand', 'pickup', 'interact',
  'punch', 'jab', 'hit', 'knockback', 'yes', 'no', 'jump', 'roll', 'die', 'dance', 'talk', 'phone', 'eat', 'drive',
  'lay', 'foldArms', 'fix', 'push', 'crouch', 'lean', 'throw', 'water', 'open', 'swim', 'zombie', 'wave', 'kick',
] as const;
export type FolkAnim = (typeof FOLK_CLIPS)[number];

/** Kept for older callers: game name → clip name (they are the same now). */
export const FOLK_ANIM = Object.fromEntries(FOLK_CLIPS.map((c) => [c, c])) as Record<FolkAnim, FolkAnim>;

/** Clips that play once and hold their last pose. */
const ONCE = new Set<FolkAnim>(['sit', 'stand', 'pickup', 'interact', 'punch', 'jab', 'hit', 'knockback', 'yes', 'jump', 'roll', 'die', 'lay', 'throw', 'open', 'kick']);

/** Ground speed (m/s) each moving clip looks right at (no foot sliding). */
const CLIP_SPEED: Partial<Record<FolkAnim, number>> = { walk: 1.3, walkFormal: 1.25, carry: 1.15, run: 3.2, sprint: 5.6, zombie: 0.7 };

export type Body = 'm' | 'f';

/** How a person looks: which parts, and colours per slot. */
export interface FolkLook {
  body: Body;
  /** Part names in the pack, e.g. "head-suit", "hair-afro", "top-casual". */
  head: string;
  hair?: string | null;
  top: string;
  bottom: string;
  feet: string;
  hat?: string | null;
  extra?: string | null;
  pack?: string | null;
  colors?: Partial<Record<ColorSlot, string>>;
}

interface BodyKit {
  /** The skeleton in its rest pose (cloned per person). */
  rig: THREE.Object3D;
  boneNames: string[];
  boneInverses: THREE.Matrix4[];
  parts: Map<string, THREE.BufferGeometry>;
  clips: Map<string, THREE.AnimationClip>;
}

export interface FolkKit {
  bodies: Record<Body, BodyKit>;
  material: THREE.MeshLambertMaterial;
  /** Light standing figures for the far crowd (made once at load). */
  standing: { name: string; geometry: THREE.BufferGeometry }[];
  /** The looks those standing figures wear (same order). */
  standingLooks: FolkLook[];
}

let loading: Promise<FolkKit> | null = null;

async function loadBody(loader: GLTFLoader, body: Body): Promise<BodyKit> {
  const base = import.meta.env.BASE_URL;
  const [gltf, clips] = await Promise.all([loader.loadAsync(`${base}models/people-${body}.glb`), loadPeopleAnims(`${base}models/people-${body}.anim`)]);
  const parts = new Map<string, THREE.BufferGeometry>();
  let template: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    template ??= m;
    // Keep only what a person needs: shape, skinning, colour and slot.
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'skinIndex', 'skinWeight', 'color', '_slot']) {
      const a = m.geometry.getAttribute(k);
      if (a) g.setAttribute(k, a);
    }
    g.setIndex(m.geometry.getIndex());
    parts.set(m.name, g);
  });
  if (!template) throw new Error(`people-${body}: no parts`);
  const t = template as THREE.SkinnedMesh;
  const rig = gltf.scene.getObjectByName('rig');
  if (!rig) throw new Error(`people-${body}: no rig`);
  return { rig, boneNames: t.skeleton.bones.map((b) => b.name), boneInverses: t.skeleton.boneInverses, parts, clips };
}

/** Load the people packs once. */
export function loadFolk(): Promise<FolkKit> {
  if (!loading) {
    loading = (async () => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const [m, f] = await Promise.all([loadBody(loader, 'm'), loadBody(loader, 'f')]);
      // Flat shading = the crisp low-poly look, computed on the GPU.
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const kit: FolkKit = { bodies: { m, f }, material, standing: [], standingLooks: [] };
      await MeshoptSimplifier.ready.catch(() => undefined);
      kit.standingLooks = CROWD_LOOKS.slice(0, 16);
      kit.standing = standingGeometries(kit, kit.standingLooks);
      return kit;
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

// ---------------------------------------------------------------------
// Putting a person together
// ---------------------------------------------------------------------

const partsOf = (look: FolkLook): string[] => [look.head, look.hair, look.top, look.bottom, look.feet, look.hat, look.extra, look.pack].filter((p): p is string => !!p);

/** Merged shapes, shared by everyone wearing the same parts. */
const merged = new Map<string, THREE.BufferGeometry>();

function mergedGeometry(kit: FolkKit, look: FolkLook): THREE.BufferGeometry {
  const body = kit.bodies[look.body];
  const names = partsOf(look).filter((p) => body.parts.has(p));
  const key = `${look.body}|${names.join('+')}`;
  let g = merged.get(key);
  if (!g) {
    const geos = names.map((n) => body.parts.get(n)!);
    g = geos.length === 1 ? geos[0] : mergeGeometries(geos)!;
    merged.set(key, g);
  }
  return g;
}

/** Default colours a slot keeps when the look doesn't say. */
const SLOT_OF: Record<ColorSlot, number> = { skin: SLOT.skin, hair: SLOT.hair, top: SLOT.top, top2: SLOT.top2, bottom: SLOT.bottom, bottom2: SLOT.bottom2, shoes: SLOT.shoes, shoes2: SLOT.shoes2, hat: SLOT.hat, hat2: SLOT.hat2, extra: SLOT.extra, extra2: SLOT.extra2 };

/** Write a look's colours into a colour attribute (by slot). */
function paint(src: THREE.BufferGeometry, look: FolkLook, out: THREE.BufferAttribute): void {
  const base = src.getAttribute('color');
  const slots = src.getAttribute('_slot');
  const over: (THREE.Color | null)[] = [];
  for (const [k, hex] of Object.entries(look.colors ?? {})) if (hex) over[SLOT_OF[k as ColorSlot]] = new THREE.Color(hex);
  over[SLOT.brows] = over[SLOT.hair] ?? null;
  for (let i = 0; i < out.count; i++) {
    const c = slots ? over[Math.round(slots.getX(i))] : null;
    if (c) out.setXYZ(i, c.r, c.g, c.b);
    else out.setXYZ(i, base.getX(i), base.getY(i), base.getZ(i));
  }
  out.needsUpdate = true;
}

// ---------------------------------------------------------------------
// Actor: one animated person
// ---------------------------------------------------------------------

export class Actor {
  /** Place/rotate this. Faces +Z. */
  readonly root = new THREE.Group();
  private rig: THREE.Object3D | null = null;
  private mesh: THREE.SkinnedMesh | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<FolkAnim, THREE.AnimationAction>();
  private current: FolkAnim | null = null;
  private body: Body | null = null;
  private shapeKey = '';

  constructor(
    private kit: FolkKit,
    look: FolkLook,
    private shadows = true,
  ) {
    this.setLook(look);
  }

  /** Change parts and/or colours. Keeps the current animation. */
  setLook(look: FolkLook): void {
    const kit = this.kit.bodies[look.body] ? look : { ...look, body: 'm' as Body };
    const bodyKit = this.kit.bodies[kit.body];
    if (kit.body !== this.body) {
      const playing = this.current;
      this.rig?.removeFromParent();
      this.mixer?.stopAllAction();
      this.actions.clear();
      this.current = null;
      this.body = kit.body;
      this.rig = cloneSkinned(bodyKit.rig);
      this.root.add(this.rig);
      this.mixer = new THREE.AnimationMixer(this.rig);
      this.shapeKey = '';
      this.mesh?.geometry.dispose();
      this.mesh = null;
      this.play(playing ?? 'idle', 0);
    }
    const shape = mergedGeometry(this.kit, kit);
    const key = `${kit.body}|${partsOf(kit).join('+')}`;
    if (key !== this.shapeKey || !this.mesh) {
      this.shapeKey = key;
      // Own colour list (shared shape), so each person can be recoloured.
      const g = new THREE.BufferGeometry();
      for (const k of Object.keys(shape.attributes)) if (k !== 'color') g.setAttribute(k, shape.getAttribute(k));
      g.setIndex(shape.getIndex());
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(shape.getAttribute('position').count * 3), 3));
      g.userData.src = shape;
      if (this.mesh) {
        this.mesh.geometry.dispose();
        this.mesh.geometry = g;
      } else {
        const bones = bodyKit.boneNames.map((n) => this.rig!.getObjectByName(n) as THREE.Bone);
        const skeleton = new THREE.Skeleton(bones, bodyKit.boneInverses);
        this.mesh = new THREE.SkinnedMesh(g, this.kit.material);
        this.mesh.name = 'person';
        this.mesh.bind(skeleton, new THREE.Matrix4());
        this.mesh.castShadow = this.shadows;
        this.mesh.frustumCulled = false;
        this.rig!.add(this.mesh);
      }
    }
    paint(this.mesh.geometry.userData.src, kit, this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute);
  }

  play(name: FolkAnim, fade = 0.2, speed = 1): void {
    if (!this.mixer || !this.body) return;
    let action = this.actions.get(name);
    if (!action) {
      const clip = this.kit.bodies[this.body].clips.get(name);
      if (!clip) return;
      action = this.mixer.clipAction(clip);
      if (ONCE.has(name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
    action.timeScale = speed;
    if (this.current === name) {
      action.paused = false;
      return;
    }
    const prev = this.current ? this.actions.get(this.current) : null;
    action.reset().setEffectiveWeight(1).play();
    if (prev && fade > 0) prev.crossFadeTo(action, fade, false);
    else prev?.stop();
    this.current = name;
  }

  /** Walk or run to match a ground speed in m/s (0 = stand). */
  move(speed: number): void {
    if (speed < 0.15) return this.play('idle');
    const name: FolkAnim = speed > 4.4 ? 'sprint' : speed > 2.2 ? 'run' : 'walk';
    this.play(name, 0.15, THREE.MathUtils.clamp(speed / (CLIP_SPEED[name] ?? 1.3), 0.6, 1.8));
  }

  update(dt: number): void {
    this.mixer?.update(dt);
  }

  /** What's playing (for QA). */
  debug(): { current: string | null; actions: [string, number, number, boolean, boolean][] } {
    return { current: this.current, actions: [...this.actions].map(([n, a]) => [n, +a.getEffectiveWeight().toFixed(2), +a.time.toFixed(2), a.paused, a.isRunning()]) };
  }

  /**
   * Hold a pose. Sitting all the way down (sit at 1) plays the seated
   * idle loop instead, so seated people breathe and shift.
   */
  hold(name: FolkAnim, at: number): void {
    if (name === 'sit' && at >= 0.99) return this.play('sitIdle', 0.3);
    this.play(name, 0.2);
    const action = this.actions.get(name);
    if (!action) return;
    action.time = action.getClip().duration * at;
    action.paused = true;
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
    this.mesh?.geometry.dispose();
  }
}

// ---------------------------------------------------------------------
// The crowd's wardrobe
// ---------------------------------------------------------------------

const SKINS = ['#8d5524', '#c68642', '#5c3a21', '#e0ac69', '#3b2414', '#f1c27d', '#a46b44', '#6b4226', '#ffdbac', '#4a2c17'];
const HAIRS = ['#161210', '#2b1b10', '#161210', '#4a2f1d', '#161210', '#8a6a3a', '#2b1b10', '#b5b5b5'];
const TOPS = ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#ffbe0b', '#8338ec', '#ff006e', '#06d6a0', '#ffffff', '#1d3557', '#222222', '#9b2226'];
const BOTTOMS = ['#2f4a6d', '#111111', '#3d5a80', '#5c4033', '#6b705c', '#1b263b', '#c2b280'];

/**
 * Everyday New Yorkers for the street crowd: casual most of all, then
 * office, workers, the odd suit and a few with hats and shades.
 */
function crowdLooks(): FolkLook[] {
  const out: FolkLook[] = [];
  const m: [string, string | null, string, string, string, string | null][] = [
    ['head-suit', null, 'top-casual', 'bottom-casual', 'feet-casual', null],
    ['head-bare', 'hair-fade', 'top-hoodie', 'bottom-adventurer', 'feet-hoodie', null],
    ['head-bare', 'hair-afro', 'top-casual', 'bottom-casual', 'feet-casual', null],
    ['head-suit', null, 'top-suit', 'bottom-suit', 'feet-suit', null],
    ['head-bare', 'hair-locs', 'top-beach', 'bottom-punk', 'feet-punk', null],
    ['head-bare', 'hair-buzz', 'top-worker', 'bottom-worker', 'feet-worker', 'hat-cap'],
    ['head-hoodie', null, 'top-punk', 'bottom-casual', 'feet-hoodie', null],
    ['head-bare', 'hair-cornrows', 'top-hoodie', 'bottom-hoodie', 'feet-casual', null],
    ['head-adventurer', null, 'top-adventurer', 'bottom-adventurer', 'feet-adventurer', null],
    ['head-bare', 'hair-buzz', 'top-casual', 'bottom-worker', 'feet-worker', 'hat-beanie'],
  ];
  const f: [string, string | null, string, string, string, string | null][] = [
    ['head-bare', 'hair-braids', 'top-casual', 'bottom-casual', 'feet-casual', null],
    ['head-casual', null, 'top-suit', 'bottom-suit', 'feet-suit', null],
    ['head-bare', 'hair-puffs', 'top-punk', 'bottom-punk', 'feet-punk', null],
    ['head-formal', null, 'top-formal', 'bottom-formal', 'feet-formal', null],
    ['head-bare', 'hair-afro', 'top-adventurer', 'bottom-casual', 'feet-casual', null],
    ['head-soldier', null, 'top-soldier', 'bottom-soldier', 'feet-casual', null],
    ['head-bare', 'hair-bun', 'top-casual', 'bottom-adventurer', 'feet-adventurer', null],
    ['head-bare', 'hair-curls', 'top-scifi', 'bottom-suit', 'feet-suit', null],
    ['head-adventurer', null, 'top-casual', 'bottom-worker', 'feet-worker', 'hat-bucket'],
    ['head-bare', 'hair-ponytail', 'top-soldier', 'bottom-casual', 'feet-casual', null],
  ];
  for (let i = 0; i < 20; i++) {
    const body: Body = i % 2 ? 'f' : 'm';
    const [head, hair, top, bottom, feet, hat] = (body === 'm' ? m : f)[(i >> 1) % 10];
    out.push({
      body, head, hair, top, bottom, feet, hat,
      extra: i % 7 === 3 ? 'extra-shades' : null,
      colors: {
        skin: SKINS[(i * 3) % SKINS.length],
        hair: HAIRS[(i * 5) % HAIRS.length],
        top: TOPS[(i * 7) % TOPS.length],
        bottom: BOTTOMS[(i * 3) % BOTTOMS.length],
        hat: TOPS[(i * 5 + 3) % TOPS.length],
      },
    });
  }
  return out;
}
export const CROWD_LOOKS: FolkLook[] = crowdLooks();

// ---------------------------------------------------------------------
// Standing figures for the far-away crowd
// ---------------------------------------------------------------------

/**
 * One static "standing" geometry per look, in metres, with its own
 * colours — for drawing the far crowd with instancing.
 */
export function standingGeometries(kit: FolkKit, looks: FolkLook[]): { name: string; geometry: THREE.BufferGeometry }[] {
  const out: { name: string; geometry: THREE.BufferGeometry }[] = [];
  const v = new THREE.Vector3();
  for (const [i, look] of looks.entries()) {
    const actor = new Actor(kit, look, false);
    // Pose with a moment of the idle loop (the raw rig is a T-pose).
    actor.play('idle', 0);
    actor.update(0.3);
    actor.root.updateMatrixWorld(true);
    let sm: THREE.SkinnedMesh | null = null;
    actor.root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) sm = o as THREE.SkinnedMesh;
    });
    if (!sm) continue;
    const mesh = sm as THREE.SkinnedMesh;
    mesh.skeleton.update();
    const src = mesh.geometry;
    const n = src.getAttribute('position').count;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      mesh.getVertexPosition(k, v);
      v.applyMatrix4(mesh.matrixWorld);
      pos.set([v.x, v.y, v.z], k * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', (src.getAttribute('color') as THREE.BufferAttribute).clone());
    // Far-away people are a few pixels tall: keep about a quarter of the
    // triangles (colour seams are kept, so outfits stay recognisable).
    const index = src.getIndex();
    if (index && MeshoptSimplifier.supported) {
      const idx = new Uint32Array(index.array);
      const [lod] = MeshoptSimplifier.simplify(idx, pos, 3, Math.floor((idx.length * 0.25) / 3) * 3, 0.02, ['Sparse']);
      g.setIndex(new THREE.BufferAttribute(lod, 1));
    } else g.setIndex(index);
    g.computeBoundingSphere();
    out.push({ name: `look${i}`, geometry: g });
    actor.dispose();
  }
  return out;
}
