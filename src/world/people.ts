// =====================================================================
// people.ts — real 3D people: smooth bodies, proper animations, clothes.
//
// WHERE THE BODIES COME FROM
//   Two rigged bodies (masc and femme) and ~26 animations from
//   Quaternius' Universal Animation Library (CC0 — free for any use,
//   no credit required). scripts/build-character-assets.mjs shrinks
//   them to about 470 KB in total: public/models/*.glb.
//
// HOW CLOTHES WORK (no 3D modelling needed for most items)
//   When a body loads we work out, for every vertex, which body part it
//   belongs to (head, torso, upper arm, forearm, hand, hips, thigh, shin,
//   foot) from the bone that moves it most, and where it sits in the
//   standing pose. An outfit then simply COLOURS vertices: a T-shirt
//   paints the torso and the top half of the upper arm; long sleeves go
//   down to the wrist; shorts stop above the knee; boots cover the lower
//   shin. A few things need real shapes (hair, hats, skirts, hoods,
//   glasses, backpacks): those are small extra meshes glued to a bone,
//   so they move with the body.
//
// PERFORMANCE
//   One person = one skinned mesh (body) + one small mesh on the head
//   (face, hair, hat) + rarely one more (skirt/hood/backpack). All
//   people share two materials. Colour changes rewrite a small colour
//   list on the CPU; nothing new is uploaded per frame.
//
// HOW TO ADD AN ANIMATION
//   Add the clip name to CLIPS in scripts/build-character-assets.mjs,
//   re-run it, then add a short name for it to ANIM below.
// =====================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { itemOf, outfitDefaults } from '../data/wardrobe.ts';
import type { Look } from '../sim/types.ts';

// ---------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------

/** Short names the game uses → clip names inside anims.glb. */
export const ANIM = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  run: 'Sprint_Loop',
  strut: 'Walk_Formal_Loop',
  carry: 'Walk_Carry_Loop',
  sit: 'Sitting_Idle_Loop',
  sitTalk: 'Sitting_Talking_Loop',
  talk: 'Idle_Talking_Loop',
  phone: 'Idle_TalkingPhone_Loop',
  lookAround: 'Idle_LookAround_Loop',
  tired: 'Idle_Tired_Loop',
  foldArms: 'Idle_FoldArms_Loop',
  drink: 'Drink',
  eat: 'Consume',
  interact: 'Interact',
  pickup: 'PickUp_Table',
  counter: 'Counter_Idle_Loop',
  celebrate: 'Celebration',
  cry: 'Crying',
  dance: 'Dance_Loop',
  drive: 'Driving_Loop',
  hit: 'Hit_Chest',
  surprise: 'Surprise',
  yes: 'Yes',
  no: 'Idle_No_Loop',
} as const;
export type AnimName = keyof typeof ANIM;

/** How fast (m/s) each moving clip walks at normal speed: used to stop feet sliding. */
const CLIP_SPEED: Partial<Record<AnimName, number>> = { walk: 1.45, strut: 1.4, carry: 1.3, jog: 3.6, run: 6.2 };

// ---------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------

/** Body part each vertex belongs to. */
const Part = { Head: 0, Torso: 1, UpperArm: 2, Forearm: 3, Hand: 4, Hips: 5, Thigh: 6, Shin: 7, Foot: 8 } as const;
type Part = (typeof Part)[keyof typeof Part];

const PART_BY_BONE: [RegExp, Part][] = [
  [/^(Head|neck)/, Part.Head],
  [/^(spine|clavicle)/, Part.Torso],
  [/^upperarm/, Part.UpperArm],
  [/^lowerarm/, Part.Forearm],
  [/^(hand|index|middle|pinky|ring|thumb)/, Part.Hand],
  [/^(pelvis|root)/, Part.Hips],
  [/^thigh/, Part.Thigh],
  [/^calf/, Part.Shin],
  [/^(foot|ball)/, Part.Foot],
];

/** Everything we measured about one body type, shared by all its people. */
interface BodyInfo {
  template: THREE.Object3D;
  part: Uint8Array;
  /** Standing-pose position of every vertex (x, y, z). */
  pos: Float32Array;
  /** Inverse world matrix of each bone in the standing pose, by bone name. */
  restInverse: Map<string, THREE.Matrix4>;
  m: {
    shoulderX: number;
    elbowX: number;
    wristX: number;
    neckY: number;
    chestY: number;
    waistY: number;
    hipY: number;
    kneeY: number;
    ankleY: number;
    hipHalfW: number;
    hipHalfD: number;
    backZ: number;
    chestZ: number;
    /** Height and depth of the arm line, sideways offset and depth of each leg. */
    armY: number;
    armZ: number;
    legX: number;
    legZ: number;
  };
  head: { center: THREE.Vector3; size: THREE.Vector3; eyeY: number; eyeZ: number; noseZ: number; mouthZ: number };
}

export interface PeopleAssets {
  bodies: { m: BodyInfo; f: BodyInfo };
  clips: Map<string, THREE.AnimationClip>;
}

let loading: Promise<PeopleAssets> | null = null;

/** Load bodies and animations once; later calls return the same promise. */
export function loadPeople(): Promise<PeopleAssets> {
  if (!loading) {
    loading = (async () => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const base = `${import.meta.env.BASE_URL}models/`;
      const [m, f, a] = await Promise.all([loader.loadAsync(`${base}person_m.glb`), loader.loadAsync(`${base}person_f.glb`), loader.loadAsync(`${base}anims.glb`)]);
      const clips = new Map(a.animations.map((c) => [c.name, c]));
      return { bodies: { m: analyse(m.scene), f: analyse(f.scene) }, clips };
    })();
    loading.catch(() => (loading = null)); // allow a retry after a network error
  }
  return loading;
}

/** Measure a body: which part each vertex is, and key heights/widths. */
function analyse(scene: THREE.Object3D): BodyInfo {
  scene.updateMatrixWorld(true);
  let mesh: THREE.SkinnedMesh | null = null;
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh;
  });
  if (!mesh) throw new Error('people: body has no skinned mesh');
  const sm = mesh as THREE.SkinnedMesh;
  const geo = sm.geometry;
  const n = geo.getAttribute('position').count;
  const bones = sm.skeleton.bones;
  const boneWorld = (name: string) => {
    const b = bones.find((x) => x.name === name);
    return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : new THREE.Vector3();
  };
  const restInverse = new Map<string, THREE.Matrix4>();
  for (const b of bones) restInverse.set(b.name, b.matrixWorld.clone().invert());

  // Which part each bone index maps to.
  const boneParts = bones.map((b) => PART_BY_BONE.find(([re]) => re.test(b.name))?.[1] ?? Part.Torso);
  const skinIndex = geo.getAttribute('skinIndex');
  const skinWeight = geo.getAttribute('skinWeight');
  const part = new Uint8Array(n);
  const pos = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // Strongest bone decides the part.
    let best = 0;
    let bestW = -1;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (w > bestW) {
        bestW = w;
        best = skinIndex.getComponent(i, k);
      }
    }
    part[i] = boneParts[best];
    sm.getVertexPosition(i, v);
    v.applyMatrix4(sm.matrixWorld);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
  }

  const absX = (p: THREE.Vector3) => Math.abs(p.x);
  const m = {
    shoulderX: absX(boneWorld('upperarm_l')),
    elbowX: absX(boneWorld('lowerarm_l')),
    wristX: absX(boneWorld('hand_l')),
    neckY: boneWorld('neck_01').y,
    chestY: boneWorld('spine_03').y,
    waistY: boneWorld('spine_01').y,
    hipY: boneWorld('thigh_l').y,
    kneeY: boneWorld('calf_l').y,
    ankleY: boneWorld('foot_l').y,
    hipHalfW: 0,
    hipHalfD: 0,
    backZ: 0,
    chestZ: 0,
    armY: boneWorld('upperarm_l').y,
    armZ: boneWorld('upperarm_l').z,
    legX: Math.abs(boneWorld('calf_l').x),
    legZ: boneWorld('calf_l').z,
  };
  // Hip width/depth (for skirts) and back/chest depth (for backpacks, chains).
  const head = new THREE.Box3();
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    if (part[i] === Part.Hips || (part[i] === Part.Thigh && y > m.hipY - 0.05)) {
      m.hipHalfW = Math.max(m.hipHalfW, Math.abs(x));
      m.hipHalfD = Math.max(m.hipHalfD, Math.abs(z));
    }
    if (part[i] === Part.Torso && Math.abs(y - m.chestY) < 0.06) {
      m.backZ = Math.min(m.backZ, z);
      m.chestZ = Math.max(m.chestZ, z);
    }
    if (part[i] === Part.Head && y > m.neckY + 0.06) head.expandByPoint(v.set(x, y, z));
  }
  const center = head.getCenter(new THREE.Vector3());
  const size = head.getSize(new THREE.Vector3());
  const eyeY = head.min.y + size.y * 0.52;
  // How far forward the face is at a few heights (eyes, nose, mouth).
  const frontAt = (y: number, xMax: number) => {
    let z = center.z;
    for (let i = 0; i < n; i++) {
      if (part[i] !== Part.Head) continue;
      if (Math.abs(pos[i * 3 + 1] - y) < 0.012 && Math.abs(pos[i * 3]) < xMax) z = Math.max(z, pos[i * 3 + 2]);
    }
    return z;
  };
  return {
    template: scene,
    part,
    pos,
    restInverse,
    m,
    head: { center, size, eyeY, eyeZ: frontAt(eyeY, 0.045), noseZ: frontAt(eyeY - 0.035, 0.012), mouthZ: frontAt(eyeY - 0.07, 0.02) },
  };
}

// ---------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------

/** One material for every body and head piece (colours come per vertex). */
const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
/** Same, but drawn from both sides: for skirts and hoods (open shapes). */
const clothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });

// ---------------------------------------------------------------------
// A person
// ---------------------------------------------------------------------

export class Person {
  /** Move/rotate this to place the person. Faces +Z. */
  readonly root = new THREE.Group();
  private model: THREE.Object3D;
  private body: THREE.SkinnedMesh;
  private colors: THREE.BufferAttribute;
  private normals: THREE.BufferAttribute;
  private srcNormals: THREE.BufferAttribute;
  private bones = new Map<string, THREE.Bone>();
  private extras: THREE.Mesh[] = [];
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current: AnimName | null = null;

  constructor(
    private assets: PeopleAssets,
    private look: Look,
  ) {
    const info = assets.bodies[look.body];
    this.model = cloneSkinned(info.template);
    this.root.add(this.model);
    let body: THREE.SkinnedMesh | null = null;
    this.model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh;
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
    });
    this.body = body!;
    // Share the vertex data with the template, but give this person their
    // own colour list so they can wear different clothes.
    const g = new THREE.BufferGeometry();
    const src = this.body.geometry;
    for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.getAttribute(name));
    g.setIndex(src.getIndex());
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
    this.colors = new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count * 3), 3);
    g.setAttribute('color', this.colors);
    // Own normals too: clothes get smoothed shading (see paintBody).
    this.srcNormals = src.getAttribute('normal') as THREE.BufferAttribute;
    this.normals = new THREE.BufferAttribute(new Float32Array(this.srcNormals.count * 3), 3);
    g.setAttribute('normal', this.normals);
    this.body.geometry = g;
    this.body.material = bodyMat;
    this.body.castShadow = true;
    this.body.frustumCulled = true;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.dress(look);
    this.play('idle', 0);
  }

  /** Change clothes, hair or skin (rebuilds colours and the small extra shapes). */
  setLook(look: Look): void {
    if (look.body !== this.look.body) {
      // A different body means a different skeleton: the caller should
      // replace the whole Person (see makePersonAvatar in avatar.ts).
      this.look = look;
      return;
    }
    this.look = look;
    this.dress(look);
  }

  get bodyType(): 'm' | 'f' {
    return this.look.body;
  }

  /** Crossfade to an animation. `speed` scales playback (1 = normal). */
  play(name: AnimName, fade = 0.25, speed = 1): void {
    let action = this.actions.get(name);
    if (!action) {
      const clip = this.assets.clips.get(ANIM[name]);
      if (!clip) return;
      action = this.mixer.clipAction(clip);
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

  /** Pick walk/jog/run from a ground speed in m/s and match the step rate to it. */
  move(speed: number): void {
    if (speed < 0.15) return this.play('idle');
    const name: AnimName = speed > 5 ? 'run' : speed > 2.4 ? 'jog' : 'walk';
    const rate = THREE.MathUtils.clamp(speed / (CLIP_SPEED[name] ?? 1.4), 0.7, 1.8);
    this.play(name, 0.2, rate);
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** Hide the face/hair details when far away (saves work on cheap phones). */
  setDetail(visible: boolean): void {
    for (const e of this.extras) e.visible = visible;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    this.body.geometry.dispose();
    for (const e of this.extras) e.geometry.dispose();
  }

  // -------------------------------------------------------------------
  // Clothes
  // -------------------------------------------------------------------

  private dress(look: Look): void {
    const info = this.assets.bodies[look.body];
    paintBody(info, look, this.colors, this.srcNormals, this.normals);
    this.colors.needsUpdate = true;
    this.normals.needsUpdate = true;
    for (const e of this.extras) {
      e.removeFromParent();
      e.geometry.dispose();
    }
    this.extras = [];
    // Each extra shape is built in standing-pose space, then moved into
    // its bone's own space and glued to the bone.
    const attach = (boneName: string, geo: THREE.BufferGeometry | null, mat: THREE.Material) => {
      const bone = this.bones.get(boneName);
      const inv = info.restInverse.get(boneName);
      if (!geo || !bone || !inv) return;
      geo.applyMatrix4(inv);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      bone.add(mesh);
      this.extras.push(mesh);
    };
    attach('Head', buildHead(info, look), bodyMat);
    const parts = buildBodyExtras(info, look);
    attach('pelvis', parts.pelvis, clothMat);
    attach('spine_03', parts.chest, clothMat);
    attach('spine_02', parts.back, bodyMat);
  }
}

// ---------------------------------------------------------------------
// Painting clothes onto the body
// ---------------------------------------------------------------------

const tmp = new THREE.Color();

/**
 * Colour every vertex for this outfit, and soften the shading of clothed
 * parts. The bodies are sculpted like mannequins (visible muscles); real
 * fabric drapes over that, so for clothed vertices we bend the surface
 * normal towards a smooth cylinder around the limb or torso. Same
 * triangles, but a shirt now reads as cloth instead of painted-on skin.
 */
function paintBody(info: BodyInfo, look: Look, out: THREE.BufferAttribute, srcN: THREE.BufferAttribute, outN: THREE.BufferAttribute): void {
  const d = outfitDefaults(look.body);
  const top = itemOf(look.topId ?? d.topId, 'top') ?? itemOf('tee', 'top')!;
  const bottom = itemOf(look.bottomId ?? d.bottomId, 'bottom') ?? itemOf('jeans', 'bottom')!;
  const shoes = itemOf(look.shoesId ?? d.shoesId, 'shoes') ?? itemOf('sneakers', 'shoes')!;
  const C = {
    skin: new THREE.Color(look.skin),
    top: new THREE.Color(look.top),
    inner: new THREE.Color(look.topInner ?? '#f1f1f1'),
    bottom: new THREE.Color(look.bottom),
    shoes: new THREE.Color(look.shoes ?? shoes.colors[0] ?? '#f2f2f2'),
    sole: new THREE.Color(shoes.sole),
    lips: new THREE.Color(look.skin).multiplyScalar(0.78),
  };
  const m = info.m;
  // Where sleeves and trouser legs end.
  const sleeveEnd = top.sleeve === 'none' ? m.shoulderX - 0.02 : top.sleeve === 'short' ? m.shoulderX + (m.elbowX - m.shoulderX) * 0.55 : m.wristX - 0.015;
  const legEnd = bottom.leg === 'long' ? m.ankleY + 0.02 : bottom.leg === 'capri' ? m.ankleY + (m.kneeY - m.ankleY) * 0.45 : bottom.leg === 'knee' ? m.kneeY - 0.03 : m.kneeY + 0.16;
  const dressEnd = top.dress ? m.waistY - top.dress : Infinity;
  const shoeTop = shoes.high ? m.ankleY + 0.13 : m.ankleY + 0.02;
  const topBottomEdge = top.long ? m.hipY - 0.02 : m.waistY + 0.02;

  const { part, pos } = info;
  for (let i = 0; i < part.length; i++) {
    const x = Math.abs(pos[i * 3]);
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    let c = C.skin;
    switch (part[i]) {
      case Part.Head:
        c = y < m.neckY + 0.02 && top.hood ? C.top : C.skin;
        break;
      case Part.Torso:
        if (top.sleeve === 'none' && x > m.shoulderX - 0.06 && y > m.chestY - 0.02) c = C.skin; // bare shoulders
        else if (top.open && x < 0.075 && z > 0) c = C.inner; // shirt under an open jacket
        else c = C.top;
        if (y > m.neckY - 0.035 && !top.hood) c = C.skin; // neckline
        break;
      case Part.UpperArm:
      case Part.Forearm:
        c = x < sleeveEnd ? C.top : C.skin;
        break;
      case Part.Hand:
        c = C.skin;
        break;
      case Part.Hips:
        c = y > topBottomEdge || y > dressEnd ? C.top : C.bottom;
        if (top.dress) c = C.top;
        if (top.open && top.long && x < 0.075 && z > 0 && y > topBottomEdge) c = C.inner;
        break;
      case Part.Thigh:
      case Part.Shin:
        if (top.dress && y > dressEnd) c = C.top;
        else if (y > legEnd && !bottom.skirt && !top.dress) c = C.bottom;
        else if (bottom.skirt && y > m.hipY - bottom.skirt * 0.45) c = C.bottom; // under the skirt
        else c = C.skin;
        if (y < shoeTop) c = C.shoes;
        break;
      case Part.Foot:
        c = y < 0.03 ? C.sole : C.shoes;
        break;
    }
    tmp.copy(c);
    out.setXYZ(i, tmp.r, tmp.g, tmp.b);

    // Normals: original for skin, smoothed for cloth.
    nv.set(srcN.getX(i), srcN.getY(i), srcN.getZ(i));
    if (c !== C.skin) {
      const sx = pos[i * 3];
      const p = part[i];
      if (p === Part.UpperArm || p === Part.Forearm) cyl.set(0, y - m.armY, z - m.armZ);
      else if (p === Part.Thigh || p === Part.Shin || p === Part.Foot) cyl.set(sx - Math.sign(sx) * m.legX, nv.y * 0.15, z - m.legZ);
      else cyl.set(sx, nv.y * 0.6, z - (m.backZ + m.chestZ) / 2);
      if (cyl.lengthSq() > 1e-8) nv.lerp(cyl.normalize(), p === Part.Foot ? 0.3 : 0.62).normalize();
    }
    outN.setXYZ(i, nv.x, nv.y, nv.z);
  }
}
const nv = new THREE.Vector3();
const cyl = new THREE.Vector3();

// ---------------------------------------------------------------------
// Extra shapes
// ---------------------------------------------------------------------

/** Give a shape one flat colour and make it mergeable with the others. */
function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = ng.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}

/** Push vertices in and out a little so hair looks tufted, not like a helmet. */
function tufted(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = Math.sin(x * 61 + seed) * Math.cos(z * 53 + seed * 2) * Math.sin(y * 47 + seed);
    const k = 1 + n * amount;
    p.setXYZ(i, x * k, y * (1 + n * amount * 0.5), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Remove the triangles of a head-shaped shell that fall below the
 * hairline. The hairline height blends from `front` (forehead) to
 * `back` (nape) depending on the angle around the head.
 */
function trimBelowHairline(g: THREE.BufferGeometry, hc: THREE.Vector3, front: number, back: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.getAttribute('position');
  const keep: number[] = [];
  const line = (x: number, z: number) => {
    const t = (1 - Math.cos(Math.atan2(x - hc.x, z - hc.z))) / 2; // 0 = front, 1 = back
    return front + (back - front) * Math.pow(t, 0.7);
  };
  for (let i = 0; i < p.count; i += 3) {
    let ok = true;
    for (let k = 0; k < 3; k++) if (p.getY(i + k) < line(p.getX(i + k), p.getZ(i + k))) ok = false;
    if (ok) for (let k = 0; k < 3; k++) keep.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  out.computeVertexNormals();
  return out;
}

const merge = (list: THREE.BufferGeometry[]): THREE.BufferGeometry | null => (list.length ? mergeGeometries(list) : null);

/** Face, hair, hat and glasses, merged into one shape for the head bone. */
function buildHead(info: BodyInfo, look: Look): THREE.BufferGeometry | null {
  const { center: hc, size: hs, eyeY, eyeZ, noseZ, mouthZ } = info.head;
  const rx = hs.x / 2;
  const ry = hs.y / 2;
  const rz = hs.z / 2;
  const parts: THREE.BufferGeometry[] = [];
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

  // ---- Face: eyes with a highlight, brows, nose, lips.
  const eyeX = rx * 0.38;
  for (const s of [-1, 1]) {
    parts.push(paint(at(new THREE.SphereGeometry(0.0115, 10, 8).scale(1.2, 0.75, 0.4), s * eyeX, eyeY, eyeZ - 0.003), '#f4f1ea'));
    parts.push(paint(at(new THREE.SphereGeometry(0.0072, 10, 8).scale(1, 1, 0.5), s * eyeX, eyeY, eyeZ + 0.0015), '#24180f'));
    parts.push(paint(at(new THREE.SphereGeometry(0.0022, 6, 4), s * eyeX + 0.0025, eyeY + 0.0025, eyeZ + 0.0045), '#ffffff'));
    parts.push(paint(at(new THREE.BoxGeometry(0.028, 0.006, 0.006).rotateZ(-s * 0.12), s * eyeX, eyeY + 0.024, eyeZ - 0.001), look.hair));
  }
  parts.push(paint(at(new THREE.SphereGeometry(0.014, 8, 6).scale(0.85, 1.1, 1.1), 0, eyeY - 0.034, noseZ + 0.004), new THREE.Color(look.skin).multiplyScalar(0.94)));
  parts.push(paint(at(new THREE.CapsuleGeometry(0.0055, 0.024, 2, 6).rotateZ(Math.PI / 2), 0, eyeY - 0.068, mouthZ - 0.002), new THREE.Color(look.skin).multiplyScalar(0.7)));

  // ---- Hair (a hat hides most of it).
  const hat = itemOf(look.hatId, 'hat');
  const d = outfitDefaults(look.body);
  const hair = itemOf(look.hairStyle ?? d.hairStyle, 'hair');
  let style = hair?.style ?? 'short';
  if (hat && (style === 'afro' || style === 'curly' || style === 'short' || style === 'buzz')) style = 'bald';
  const hairCol = look.hair;
  // The hair "cap": a slightly bigger copy of the skull, trimmed along a
  // hairline that sits above the eyebrows at the front, around the top
  // of the ears at the sides, and low at the nape. Trimming by an actual
  // hairline keeps the face clear whatever the head shape.
  const front = eyeY + 0.042;
  const cap = (grow: number, back = eyeY - 0.07, lumps = 0.03, frontLine = front) =>
    trimBelowHairline(
      tufted(new THREE.SphereGeometry(1, 34, 24), lumps, 7).scale(rx * grow, ry * (grow - 0.03), rz * (grow + 0.02)).translate(hc.x, hc.y + ry * 0.05, hc.z - rz * 0.05),
      hc,
      frontLine,
      back,
    );
  switch (style) {
    case 'bald':
      break;
    case 'buzz':
      parts.push(paint(cap(1.07, eyeY - 0.06, 0.01), hairCol));
      break;
    case 'short':
      parts.push(paint(cap(1.13), hairCol));
      parts.push(paint(tufted(new THREE.SphereGeometry(1, 14, 10).scale(rx * 0.8, ry * 0.35, rz * 0.7), 0.08, 3).translate(hc.x, hc.y + ry * 0.85, hc.z + rz * 0.15), hairCol));
      break;
    case 'curly':
      parts.push(paint(cap(1.26, eyeY - 0.08, 0.1, front + 0.01), hairCol));
      break;
    case 'afro':
      parts.push(paint(tufted(new THREE.SphereGeometry(1, 24, 16).scale(rx * 1.5, ry * 1.18, rz * 1.32), 0.06, 9).translate(hc.x, hc.y + ry * 0.55, hc.z - rz * 0.38), hairCol));
      break;
    case 'long':
    case 'bun':
    case 'ponytail':
    case 'braids': {
      parts.push(paint(cap(1.13, eyeY - 0.1), hairCol));
      if (style === 'long') {
        // Hair falling down the back and over the shoulders.
        parts.push(paint(tufted(new THREE.CapsuleGeometry(rx * 0.95, ry * 1.2, 6, 18).scale(1.02, 1, 0.42), 0.05, 2).translate(hc.x, hc.y - ry * 0.6, hc.z - rz * 0.62), hairCol));
      } else if (style === 'bun') {
        parts.push(paint(tufted(new THREE.SphereGeometry(rx * 0.5, 14, 10), 0.06, 4).translate(hc.x, hc.y + ry * 1.05, hc.z - rz * 0.25), hairCol));
      } else if (style === 'ponytail') {
        parts.push(paint(new THREE.SphereGeometry(rx * 0.26, 10, 8).translate(hc.x, hc.y + ry * 0.35, hc.z - rz * 1.05), hairCol));
        parts.push(paint(tufted(new THREE.CapsuleGeometry(rx * 0.22, ry * 0.95, 4, 10).rotateX(0.35), 0.06, 6).translate(hc.x, hc.y - ry * 0.35, hc.z - rz * 1.2), hairCol));
      } else {
        for (let k = 0; k < 7; k++) {
          const a = Math.PI * (0.6 + (k / 6) * 0.8); // around the back of the head
          parts.push(paint(new THREE.CapsuleGeometry(0.011, ry * 1.25, 3, 6).translate(hc.x + Math.cos(a) * rx * 0.92, hc.y - ry * 0.55, hc.z - Math.abs(Math.sin(a)) * rz * 0.85), hairCol));
        }
      }
      break;
    }
  }

  // ---- Hat
  if (hat) {
    const col = look.hat ?? hat.colors[0];
    const dome = (h: number, grow: number) =>
      new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(rx * grow, ry * h, rz * (grow + 0.04)).rotateX(-0.18).translate(hc.x, hc.y + ry * 0.18, hc.z - rz * 0.05);
    if (hat.style === 'cap') {
      parts.push(paint(dome(0.95, 1.16), col));
      parts.push(paint(new THREE.CylinderGeometry(rx * 0.95, rx * 0.95, 0.012, 20, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.25).rotateX(0.12).translate(hc.x, hc.y + ry * 0.28, hc.z + rz * 0.62), col));
    } else if (hat.style === 'beanie') {
      parts.push(paint(tufted(dome(1.25, 1.17), 0.02, 1), col));
      parts.push(paint(new THREE.CylinderGeometry(rx * 1.19, rx * 1.2, ry * 0.32, 22, 1, true).scale(1, 1, (rz + 0.005) / rx).rotateX(-0.18).translate(hc.x, hc.y + ry * 0.24, hc.z - rz * 0.05), col));
    } else if (hat.style === 'bucket') {
      parts.push(paint(dome(1.05, 1.18), col));
      parts.push(paint(new THREE.CylinderGeometry(rx * 1.2, rx * 1.75, ry * 0.25, 22, 1, true).scale(1, 1, 1.05).rotateX(-0.1).translate(hc.x, hc.y + ry * 0.14, hc.z - rz * 0.04), col));
    } else {
      // Durag: a tight wrap plus the tail down the back.
      parts.push(paint(dome(1.0, 1.08), col));
      parts.push(paint(new THREE.BoxGeometry(rx * 0.7, ry * 1.1, 0.01).translate(hc.x, hc.y - ry * 0.4, hc.z - rz * 1.05), col));
    }
  }

  // ---- Glasses
  const extra = itemOf(look.extraId, 'extra');
  if (extra && (extra.style === 'shades' || extra.style === 'glasses')) {
    const col = look.extra ?? extra.colors[0];
    const z = eyeZ + 0.012;
    for (const s of [-1, 1]) {
      if (extra.style === 'shades') parts.push(paint(at(new THREE.CapsuleGeometry(0.012, 0.016, 4, 10).rotateZ(Math.PI / 2).scale(1, 1.05, 0.3), s * eyeX, eyeY - 0.002, z), col));
      else parts.push(paint(at(new THREE.TorusGeometry(0.016, 0.0022, 6, 18), s * eyeX, eyeY, z), col));
      // Arm back to the ear.
      parts.push(paint(at(new THREE.BoxGeometry(0.003, 0.003, rz * 1.1), s * rx * 0.98, eyeY + 0.004, z - rz * 0.55), col));
    }
    parts.push(paint(at(new THREE.BoxGeometry(eyeX * 0.6, 0.003, 0.003), 0, eyeY + 0.004, z), col));
  }
  return merge(parts);
}

/** Skirts and dresses (pelvis), hoods and chains (chest), backpacks (back). */
function buildBodyExtras(info: BodyInfo, look: Look): { pelvis: THREE.BufferGeometry | null; chest: THREE.BufferGeometry | null; back: THREE.BufferGeometry | null } {
  const m = info.m;
  const d = outfitDefaults(look.body);
  const top = itemOf(look.topId ?? d.topId, 'top');
  const bottom = itemOf(look.bottomId ?? d.bottomId, 'bottom');
  const extra = itemOf(look.extraId, 'extra');
  const pelvis: THREE.BufferGeometry[] = [];
  const chest: THREE.BufferGeometry[] = [];
  const back: THREE.BufferGeometry[] = [];
  const rTop = m.hipHalfW * 1.04;
  const depth = (m.hipHalfD * 1.15) / rTop;

  const flare = (len: number, spread: number, color: string, fromY: number) =>
    paint(new THREE.CylinderGeometry(rTop, rTop * spread, len, 24, 3, true).scale(1, 1, depth).translate(0, fromY - len / 2, 0.005), color);
  if (top?.dress) pelvis.push(flare(top.dress - 0.02, 1.55, look.top, m.waistY - 0.02));
  else if (bottom?.skirt) pelvis.push(flare(bottom.skirt, 1.45, look.bottom, m.waistY + 0.01));

  if (top?.hood) {
    // A soft hood bunched behind the neck.
    chest.push(paint(new THREE.TorusGeometry(0.075, 0.036, 8, 18, Math.PI * 1.25).rotateZ(-Math.PI * 0.125 - Math.PI / 2).rotateX(Math.PI / 2 - 0.5).scale(1.1, 1, 1).translate(0, m.neckY - 0.03, m.backZ * 0.55), look.top));
  }
  if (extra?.style === 'chain') {
    chest.push(paint(new THREE.TorusGeometry(0.09, 0.006, 6, 28).scale(1, 1.25, 1).rotateX(Math.PI / 2 - 1.15).translate(0, m.neckY - 0.1, m.chestZ * 0.62), look.extra ?? '#d4af37'));
  }
  if (extra?.style === 'backpack') {
    const col = look.extra ?? extra.colors[0];
    back.push(paint(new THREE.CapsuleGeometry(0.12, 0.16, 6, 14).scale(1.15, 1, 0.55).translate(0, m.chestY - 0.06, m.backZ - 0.07), col));
    back.push(paint(new THREE.BoxGeometry(0.2, 0.09, 0.05).translate(0, m.chestY - 0.17, m.backZ - 0.12), new THREE.Color(col).multiplyScalar(0.7)));
  }
  return { pelvis: merge(pelvis), chest: merge(chest), back: merge(back) };
}
