// =====================================================================
// folk.ts — the cartoon people (Quaternius "Ultimate Animated Character
// Pack", CC0 — free for any use).
//
// THE MODELS
//   19 rounded, low-poly cartoon characters: casual looks, suits,
//   doctors, chefs, construction workers, police, and well-off retirees.
//   They share one skeleton and 17 animations (idle, walk, run, sit,
//   pick-up, punch, hit, victory, defeat, death…).
//
// COLOURS
//   scripts/build-folk-assets.mjs baked each model's materials into
//   vertex colours and tagged every vertex with a SLOT (skin, eyes, hair,
//   top, bottom, hat, detail). A person can therefore be recoloured —
//   any skin tone, hair colour, shirt and trousers — and still be drawn
//   in a single draw call.
//
// TWO WAYS TO DRAW PEOPLE (so cheap phones keep up)
//   • Actor: fully animated (the player + the crowd nearest the camera).
//   • standingGeometries(): far-away crowd as instanced standing figures,
//     one draw call per character model.
//
// TO ADD A CHARACTER: add it in scripts/build-folk-assets.mjs, re-run,
// then list it in FOLK_ROLES below.
// =====================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import type { Look } from '../sim/types.ts';
import { buildOutfit } from './clothes.ts';

/** Model units → metres (the models are 3.1 units tall). */
export const FOLK_SCALE = 0.56;

/** Vertex slots (must match SLOT in scripts/build-folk-assets.mjs). */
export const SLOT = { skin: 0, eyes: 1, hair: 2, top: 3, bottom: 4, hat: 5, detail: 6 } as const;

/** Which characters suit which kind of person (used by jobs and the crowd). */
export const FOLK_ROLES = {
  casual: ['Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Casual_Bald'],
  office: ['Suit_Male', 'Suit_Female'],
  health: ['Doctor_Male_Young', 'Doctor_Female_Young'],
  chef: ['Chef_Male', 'Chef_Female'],
  construction: ['Worker_Male', 'Worker_Female'],
  wealthy: ['OldClassy_Male', 'OldClassy_Female'],
  police: ['BlueSoldier_Male', 'BlueSoldier_Female'],
} as const;

/** Short animation names the game uses → clip names in the pack. */
export const FOLK_ANIM = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  carry: 'Walk_Carry',
  sit: 'SitDown',
  stand: 'StandUp',
  pickup: 'PickUp',
  punch: 'Punch',
  hit: 'RecieveHit',
  yes: 'Victory',
  no: 'Defeat',
  jump: 'Jump',
  roll: 'Roll',
  die: 'Death',
} as const;
export type FolkAnim = keyof typeof FOLK_ANIM;

/** Clips that play once and hold their last pose. */
const ONCE: FolkAnim[] = ['sit', 'stand', 'pickup', 'die', 'yes', 'no', 'jump', 'roll', 'hit', 'punch'];

/** Ground speed (m/s) each moving clip looks right at. */
const CLIP_SPEED: Partial<Record<FolkAnim, number>> = { walk: 1.4, carry: 1.3, run: 4.5 };

export interface FolkKit {
  templates: Map<string, THREE.Object3D>;
  clips: Map<string, THREE.AnimationClip>;
  material: THREE.MeshLambertMaterial;
  /** Light standing figures for the far crowd (made once at load). */
  standing: { name: string; geometry: THREE.BufferGeometry }[];
}

let loading: Promise<FolkKit> | null = null;

/** Load the people pack once. */
export function loadFolk(): Promise<FolkKit> {
  if (!loading) {
    loading = (async () => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/folk.glb`);
      const templates = new Map<string, THREE.Object3D>();
      for (const node of gltf.scene.children) templates.set(node.name, node);
      // Flat shading = the crisp low-poly look, computed on the GPU.
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const kit: FolkKit = { templates, clips: new Map(gltf.animations.map((c) => [c.name.split('|').pop()!, c])), material, standing: [] };
      await MeshoptSimplifier.ready.catch(() => undefined);
      kit.standing = standingGeometries(kit);
      return kit;
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

/** How a person looks: which character model, and colours per slot. */
export interface FolkLook {
  character: string;
  skin?: string;
  hair?: string;
  top?: string;
  bottom?: string;
  hat?: string;
  /**
   * The full outfit (the player): real 3D clothes are built on the body
   * (world/clothes.ts) instead of painting the model's own clothes.
   */
  dress?: Look;
}

function findSkinned(root: THREE.Object3D): THREE.SkinnedMesh {
  let m: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!m && (o as THREE.SkinnedMesh).isSkinnedMesh) m = o as THREE.SkinnedMesh;
  });
  if (!m) throw new Error('folk: character has no skinned mesh');
  return m;
}

/** Write the colours for a look into a colour attribute (by slot). */
function paint(src: THREE.BufferGeometry, look: FolkLook, out: THREE.BufferAttribute): void {
  const base = src.getAttribute('color');
  const slots = src.getAttribute('_slot') ?? src.getAttribute('_SLOT');
  const over: (THREE.Color | null)[] = [];
  over[SLOT.skin] = look.skin ? new THREE.Color(look.skin) : null;
  over[SLOT.hair] = look.hair ? new THREE.Color(look.hair) : null;
  over[SLOT.top] = look.top ? new THREE.Color(look.top) : null;
  over[SLOT.bottom] = look.bottom ? new THREE.Color(look.bottom) : null;
  over[SLOT.hat] = look.hat ? new THREE.Color(look.hat) : null;
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
  private model!: THREE.Object3D;
  private mesh!: THREE.SkinnedMesh;
  private mixer!: THREE.AnimationMixer;
  private actions = new Map<FolkAnim, THREE.AnimationAction>();
  private current: FolkAnim | null = null;
  private character = '';
  private clothes: THREE.SkinnedMesh | null = null;
  private dressKey = '';

  constructor(
    private kit: FolkKit,
    look: FolkLook,
    private shadows = true,
  ) {
    this.setLook(look);
  }

  /** Change model and/or colours. Swapping the model keeps the current animation. */
  setLook(look: FolkLook): void {
    const name = this.kit.templates.has(look.character) ? look.character : FOLK_ROLES.casual[0];
    if (name !== this.character) {
      const playing = this.current;
      this.undress();
      this.model?.removeFromParent();
      this.mixer?.stopAllAction();
      this.actions.clear();
      this.current = null;
      this.character = name;
      this.model = cloneSkinned(this.kit.templates.get(name)!);
      // The pack's characters share one rig, but glTF names every copy's
      // bones uniquely (Hips, Hips_1, Hips_2…). The clips target the plain
      // names, so without this every character but the first stood frozen
      // mid-stride: give each clone's bones their plain names back.
      this.model.traverse((o) => {
        if ((o as THREE.Bone).isBone) o.name = o.name.replace(/_\d+$/, '');
      });
      this.model.scale.setScalar(FOLK_SCALE);
      this.model.position.set(0, 0, 0);
      this.root.add(this.model);
      this.mesh = findSkinned(this.model);
      // Own colour list (shared positions), so each person can be recoloured.
      const src = this.mesh.geometry;
      const g = new THREE.BufferGeometry();
      for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.getAttribute(k));
      g.setIndex(src.getIndex());
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count * 3), 3));
      g.userData.src = src;
      this.mesh.geometry = g;
      this.mesh.material = this.kit.material;
      this.mesh.castShadow = this.shadows;
      this.mesh.frustumCulled = false;
      this.mixer = new THREE.AnimationMixer(this.model);
      this.play(playing ?? 'idle', 0);
    }
    const colors = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    paint(this.mesh.geometry.userData.src, look, colors);
    if (look.dress) this.dress(look.dress, colors);
    else this.undress();
  }

  /** Put real clothes on (rebuilt only when the outfit changes). */
  private dress(d: Look, colors: THREE.BufferAttribute): void {
    const src = this.mesh.geometry.userData.src as THREE.BufferGeometry;
    const key = `${this.character}|${d.topId}|${d.top}|${d.topInner}|${d.bottomId}|${d.bottom}|${d.shoesId}|${d.shoes}|${d.hatId}|${d.hat}|${d.extraId}|${d.extra}|${d.skin}`;
    const out = buildOutfit(this.mesh, src, d);
    // Under the clothes: the cloth's colour (so nothing pokes through at
    // the joints). Uncovered top/bottom areas are bare skin.
    const slots = src.getAttribute('_slot') ?? src.getAttribute('_SLOT');
    const skin = new THREE.Color(d.skin);
    const c = new THREE.Color();
    for (let i = 0; i < colors.count; i++) {
      const sl = slots ? Math.round(slots.getX(i)) : 0;
      const u = out.under[i];
      if (u) colors.setXYZ(i, ...(c.set(u).toArray() as [number, number, number]));
      else if (sl === SLOT.top || sl === SLOT.bottom || sl === SLOT.detail || sl === SLOT.hat) colors.setXYZ(i, skin.r, skin.g, skin.b);
    }
    colors.needsUpdate = true;
    this.tuckHair(src, out.hatLine);
    if (key === this.dressKey && this.clothes) return;
    this.undress();
    this.dressKey = key;
    if (!out.geometry) return;
    const m = new THREE.SkinnedMesh(out.geometry, this.kit.material);
    m.name = 'clothes';
    m.bind(this.mesh.skeleton, this.mesh.bindMatrix);
    m.position.copy(this.mesh.position);
    m.quaternion.copy(this.mesh.quaternion);
    m.scale.copy(this.mesh.scale);
    m.castShadow = this.shadows;
    m.frustumCulled = false;
    this.mesh.parent!.add(m);
    this.clothes = m;
  }

  /** Under a hat, hair above the brim goes inside the hat (hair below it still hangs out). */
  private tuckHair(src: THREE.BufferGeometry, line: { y: number; x: number; z: number; r: number } | null): void {
    const g = this.mesh.geometry;
    const shared = src.getAttribute('position');
    if (!line) {
      if (g.getAttribute('position') !== shared) g.setAttribute('position', shared);
      return;
    }
    const slots = src.getAttribute('_slot') ?? src.getAttribute('_SLOT');
    const n = shared.count;
    const pos = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(shared, i);
      if (slots && Math.round(slots.getX(i)) === SLOT.hair && v.y > line.y) {
        const dx = v.x - line.x, dy = v.y - line.y, dz = v.z - line.z;
        const d = Math.hypot(dx, dy * 1.75, dz);
        if (d > line.r) {
          const k = line.r / d;
          v.set(line.x + dx * k, line.y + dy * k, line.z + dz * k);
        }
      }
      pos.set([v.x, v.y, v.z], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }

  private undress(): void {
    if (!this.clothes) return;
    this.clothes.removeFromParent();
    this.clothes.geometry.dispose();
    this.clothes = null;
    this.dressKey = '';
  }

  play(name: FolkAnim, fade = 0.2, speed = 1): void {
    let action = this.actions.get(name);
    if (!action) {
      const clip = this.kit.clips.get(FOLK_ANIM[name]);
      if (!clip) return;
      action = this.mixer.clipAction(clip);
      if (ONCE.includes(name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
    action.timeScale = speed;
    if (this.current === name) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    action.reset().setEffectiveWeight(1).play();
    if (prev && fade > 0) prev.crossFadeTo(action, fade, false);
    else prev?.stop();
    this.current = name;
  }

  /** Walk or run to match a ground speed in m/s (0 = stand). */
  move(speed: number): void {
    if (speed < 0.15) return this.play('idle');
    const name: FolkAnim = speed > 3 ? 'run' : 'walk';
    this.play(name, 0.15, THREE.MathUtils.clamp(speed / (CLIP_SPEED[name] ?? 1.4), 0.6, 1.8));
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** What's playing (for QA). */
  debug(): { current: string | null; actions: [string, number, number, boolean, boolean][] } {
    return { current: this.current, actions: [...this.actions].map(([n, a]) => [n, +a.getEffectiveWeight().toFixed(2), +a.time.toFixed(2), a.paused, a.isRunning()]) };
  }

  /** Freeze a clip at a fraction of its length (0–1): a held pose (sitting, lying). */
  hold(name: FolkAnim, at: number): void {
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
    this.mixer.stopAllAction();
    this.undress();
    this.root.removeFromParent();
    this.mesh.geometry.dispose();
  }
}

// ---------------------------------------------------------------------
// Standing figures for the far-away crowd
// ---------------------------------------------------------------------

/**
 * One static "standing" geometry per character, in metres, with its
 * own colours — for drawing the far crowd with instancing.
 */
export function standingGeometries(kit: FolkKit): { name: string; geometry: THREE.BufferGeometry }[] {
  const out: { name: string; geometry: THREE.BufferGeometry }[] = [];
  const v = new THREE.Vector3();
  for (const [name, template] of kit.templates) {
    const copy = cloneSkinned(template);
    copy.scale.setScalar(FOLK_SCALE);
    // Pose it with the first frame of the idle animation (the raw model
    // stands in a T-pose with arms straight out).
    const idle = kit.clips.get(FOLK_ANIM.idle);
    if (idle) {
      const mixer = new THREE.AnimationMixer(copy);
      mixer.clipAction(idle).play();
      mixer.update(0.3);
    }
    copy.updateMatrixWorld(true);
    const sm = findSkinned(copy);
    sm.skeleton.update();
    const src = sm.geometry;
    const n = src.getAttribute('position').count;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      sm.getVertexPosition(i, v);
      v.applyMatrix4(sm.matrixWorld);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    paint(src, { character: name }, color);
    g.setAttribute('color', color);
    // Far-away people are a few pixels tall: keep about a quarter of the
    // triangles (colour seams are kept, so outfits stay recognisable).
    const index = src.getIndex();
    if (index && MeshoptSimplifier.supported) {
      const idx = new Uint32Array(index.array);
      const [lod] = MeshoptSimplifier.simplify(idx, pos, 3, Math.floor(idx.length * 0.22 / 3) * 3, 0.02, ['Sparse']);
      g.setIndex(new THREE.BufferAttribute(lod, 1));
    } else g.setIndex(index);
    g.computeBoundingSphere();
    out.push({ name, geometry: g });
  }
  return out;
}
