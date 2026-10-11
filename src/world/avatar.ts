// =====================================================================
// avatar.ts — people: the player's character and the crowd.
//
// THE PLAYER is a small "rig": rounded capsule shapes for the body and
// limbs, joints at the hips, knees, shoulders and elbows, and a head
// with eyes, brows and a nose. The walk cycle bends the knees, swings
// the arms, sways the hips and bobs the body, so it reads as a person,
// not a stack of boxes. Materials use soft, slightly glossy shading.
//
// THE CROWD uses INSTANCING: the GPU draws hundreds of copies of one
// person shape in a single call, each with its own position and colour.
// Crowd people use the same rounded silhouette, just with fewer
// polygons, so a cheap phone can still show a busy Times Square.
// =====================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Look } from '../sim/types.ts';
import { Actor, loadFolk, type FolkAnim, type FolkKit, type FolkLook } from './folk.ts';

/** Soft, slightly glossy material: nicer than flat shading, still cheap for one character. */
const soft = (color: string, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

export interface Avatar {
  root: THREE.Group;
  /** Call every frame with walking speed in m/s (0 = standing) and time step. */
  animate: (speed: number, dt: number) => void;
  setLook: (look: Look) => void;
  /** Show or hide face details (pass the camera's distance in metres). */
  setDetail: (cameraDistance: number) => void;
  /**
   * Play an activity animation (sitting, eating, phone…) while standing
   * still, or null to go back to normal. Walking always overrides it.
   */
  setAction: (name: FolkAnim | null) => void;
  dispose: () => void;
}

/**
 * The player's character.
 *
 * It shows the simple built-in figure straight away (so the game never
 * waits), loads the real 3D body in the background, and swaps it in as
 * soon as it's ready. If the download fails (offline, blocked), the
 * simple figure just stays — the game still works.
 */
export function makeAvatar(look: Look): Avatar {
  const root = new THREE.Group();
  const simple = makeSimpleAvatar(look);
  root.add(simple.root);
  let actor: Actor | null = null;
  let current = look;
  let action: FolkAnim | null = null;

  loadFolk()
    .then((kit: FolkKit) => {
      actor = new Actor(kit, folkLookOf(current));
      root.add(actor.root);
      simple.root.visible = false;
    })
    .catch((err) => console.info('[folk] using the simple figure:', err?.message ?? err));

  return {
    root,
    animate(speed, dt) {
      if (!actor) return simple.animate(speed, dt);
      if (speed > 0.15 || !action) actor.move(speed);
      else actor.play(action, 0.25);
      actor.update(dt);
    },
    setLook(l) {
      current = l;
      simple.setLook(l);
      actor?.setLook(folkLookOf(l));
    },
    setDetail(d) {
      simple.setDetail(d);
    },
    setAction(name) {
      action = name;
    },
    dispose() {
      simple.dispose();
      actor?.dispose();
    },
  };
}

/**
 * Which cartoon character parts a Look uses. The hairstyle picks the
 * head and the top picks the outfit, so changing clothes in the closet
 * changes the character on screen.
 */
export function folkLookOf(look: Look): FolkLook {
  const f = look.body === 'f';
  const pick = (m: string, w: string) => (f ? w : m);
  // The top decides the base model (a blazer is a suit, a hoodie is casual…).
  const top = look.topId ?? 'tee';
  const character =
    top === 'blazer' || top === 'designerSuit' || top === 'trenchCoat' ? pick('Suit_Male', 'Suit_Female')
    : top === 'longsleeve' || top === 'hoodie' || top === 'pufferJacket' || top === 'turtleneck' ? pick('Casual2_Male', 'Casual2_Female')
    : top === 'denimJacket' || top === 'leatherJacket' ? pick('Casual3_Male', 'Casual3_Female')
    : look.hairStyle === 'hair_bald' && !f ? 'Casual_Bald'
    : pick('Casual_Male', 'Casual_Female');
  return { character, skin: look.skin, hair: look.hair, top: look.top, bottom: look.bottom, hat: look.hat };
}

/** A capsule hanging down from its top end (handy for limbs that rotate at the joint). */
function hangingCapsule(radius: number, length: number, mat: THREE.Material, radial = 12): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(radius, length, 4, radial);
  g.translate(0, -(length / 2 + radius * 0.6), 0);
  return new THREE.Mesh(g, mat);
}

/** The simple built-in figure (about 1.75 m tall), used until the 3D body loads. */
function makeSimpleAvatar(look: Look): Omit<Avatar, 'setAction'> {
  const root = new THREE.Group();
  const mats = {
    skin: soft(look.skin, 0.6),
    top: soft(look.top),
    bottom: soft(look.bottom, 0.85),
    hair: soft(look.hair, 0.55),
    shoe: soft('#1c1c1f', 0.5),
    sole: soft('#f2f2f2', 0.6),
    eye: soft('#141414', 0.3),
    white: soft('#ffffff', 0.4),
    belt: soft('#2a2320', 0.5),
  };

  // Everything above the hips sits on `body`, which bobs and twists while walking.
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  const body = new THREE.Group();
  hips.add(body);
  root.add(hips);

  // ---- Torso: a capsule, wider at the chest, with a slight taper via scale.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 6, 16), mats.top);
  torso.position.y = 0.32;
  torso.scale.set(1.25, 1, 0.78);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.06, 16), mats.belt);
  belt.scale.set(1.08, 1, 0.82);
  belt.position.y = 0.06;
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.06, 4, 14), mats.bottom);
  pelvis.scale.set(1.2, 1, 0.8);
  pelvis.position.y = -0.02;
  body.add(torso, belt, pelvis);

  // ---- Neck and head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), mats.skin);
  neck.position.y = 0.66;
  const head = new THREE.Group();
  head.position.y = 0.86;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), mats.skin);
  skull.scale.set(0.95, 1.1, 1);
  head.add(skull);
  // Small face parts live in their own group. They are hidden when the
  // camera is far away (you can't see them anyway) and never cast shadows,
  // which saves a few dozen draw calls on cheap phones.
  const face = new THREE.Group();
  face.name = 'face';
  head.add(face);
  // Eyes with a tiny white highlight, so the character has a gaze.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mats.eye);
    eye.position.set(side * 0.055, 0.02, 0.135);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), mats.white);
    glint.position.set(side * 0.055 + 0.008, 0.03, 0.155);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.04, 2, 6), mats.hair);
    brow.rotation.z = Math.PI / 2 + side * 0.12;
    brow.position.set(side * 0.057, 0.07, 0.137);
    face.add(eye, glint, brow);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mats.skin);
  nose.scale.set(1, 1.1, 1.3);
  nose.position.set(0, -0.015, 0.15);
  const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.035, 2, 6), soft('#7a3b33', 0.5));
  mouth.rotation.z = Math.PI / 2;
  mouth.position.set(0, -0.065, 0.135);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mats.skin);
    ear.scale.set(0.6, 1, 0.8);
    ear.position.set(side * 0.145, 0, 0);
    face.add(ear);
  }
  face.add(nose, mouth);
  head.add(makeHair(look, mats.hair));
  body.add(neck, head);

  // ---- Arms: shoulder → upper arm → elbow → forearm → hand.
  const makeArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.27, 0.52, 0);
    const upper = hangingCapsule(0.06, 0.2, mats.top);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    const fore = hangingCapsule(0.05, 0.18, mats.skin);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mats.skin);
    hand.scale.set(0.85, 1.1, 0.7);
    hand.position.y = -0.3;
    elbow.add(fore, hand);
    // Short sleeves: the top covers the upper arm; a cuff where it ends.
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.05, 10), mats.top);
    cuff.position.y = -0.27;
    shoulder.add(upper, cuff, elbow);
    shoulder.rotation.z = side * 0.06;
    return { shoulder, elbow };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  body.add(armL.shoulder, armR.shoulder);

  // ---- Legs: hip → thigh → knee → shin → sneaker.
  const makeLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, 0, 0);
    const thigh = hangingCapsule(0.085, 0.3, mats.bottom);
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    const shin = hangingCapsule(0.07, 0.3, mats.bottom);
    const shoe = new THREE.Group();
    shoe.position.y = -0.43;
    const upperShoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.12, 4, 10), mats.shoe);
    upperShoe.rotation.x = Math.PI / 2;
    upperShoe.position.set(0, 0.0, 0.05);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.28), mats.sole);
    sole.position.set(0, -0.055, 0.05);
    shoe.add(upperShoe, sole);
    knee.add(shin, shoe);
    hip.add(thigh, knee);
    return { hip, knee };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  hips.add(legL.hip, legR.hip);

  applyBodyShape(look, torso, pelvis);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  face.traverse((o) => (o.castShadow = false));
  // Hands too: tiny shadows nobody notices.
  for (const arm of [armL, armR]) arm.elbow.children.forEach((m) => (m.castShadow = false));

  let phase = 0;
  let blend = 0; // 0 = standing, 1 = walking; eased so starting/stopping is smooth
  let blinkTimer = 2 + Math.random() * 3;
  return {
    root,
    animate(speed, dt) {
      const target = speed > 0.1 ? 1 : 0;
      blend += (target - blend) * Math.min(1, dt * 8);
      phase += dt * (6 + 4 * blend);
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      // Legs swing from the hip; the knee bends on the forward swing.
      legL.hip.rotation.x = s * 0.55 * blend;
      legR.hip.rotation.x = -s * 0.55 * blend;
      legL.knee.rotation.x = Math.max(0, -c) * 0.9 * blend + 0.05;
      legR.knee.rotation.x = Math.max(0, c) * 0.9 * blend + 0.05;
      // Arms swing opposite to the legs, with a relaxed elbow bend.
      armL.shoulder.rotation.x = -s * 0.5 * blend;
      armR.shoulder.rotation.x = s * 0.5 * blend;
      armL.elbow.rotation.x = -0.25 - Math.max(0, s) * 0.35 * blend;
      armR.elbow.rotation.x = -0.25 - Math.max(0, -s) * 0.35 * blend;
      // Body: bob twice per stride, slight twist and hip sway; breathing when idle.
      hips.position.y = 0.9 + Math.abs(c) * 0.045 * blend + Math.sin(phase * 0.5) * 0.006 * (1 - blend);
      body.rotation.y = s * 0.12 * blend;
      hips.rotation.z = c * 0.035 * blend;
      body.rotation.x = 0.06 * blend; // lean into the walk
      head.rotation.y = -s * 0.08 * blend;
      // Occasional blink.
      blinkTimer -= dt;
      const blink = blinkTimer < 0.12;
      face.children.forEach((m) => {
        if ((m as THREE.Mesh).geometry?.type === 'SphereGeometry' && (m as THREE.Mesh).material === mats.eye) m.scale.y = blink ? 0.15 : 1;
      });
      if (blinkTimer < 0) blinkTimer = 2.5 + Math.random() * 3.5;
    },
    setDetail(cameraDistance) {
      face.visible = cameraDistance < 45;
    },
    setLook(l) {
      mats.skin.color.set(l.skin);
      mats.top.color.set(l.top);
      mats.bottom.color.set(l.bottom);
      mats.hair.color.set(l.hair);
      // Swap the hairstyle and body shape to match.
      const old = head.getObjectByName('hair');
      if (old) {
        head.remove(old);
        old.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      }
      const hair = makeHair(l, mats.hair);
      hair.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
      head.add(hair);
      applyBodyShape(l, torso, pelvis);
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      Object.values(mats).forEach((m) => m.dispose());
    },
  };
}

function applyBodyShape(look: Look, torso: THREE.Mesh, pelvis: THREE.Mesh): void {
  if (look.body === 'f') {
    torso.scale.set(1.12, 1, 0.8);
    pelvis.scale.set(1.3, 1, 0.85);
  } else {
    torso.scale.set(1.3, 1, 0.8);
    pelvis.scale.set(1.15, 1, 0.8);
  }
}

/**
 * Hair: femme bodies get longer hair with a bun or a ponytail; masc bodies
 * get a short cut or a high-top. The style is picked from the hair colour
 * string so it stays the same every load without a new save field.
 */
function makeHair(look: Look, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'hair';
  const pick = [...look.hair].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 2;
  // A cap of hair hugging the top and back of the head.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
  cap.scale.set(1, 1.1, 1.06);
  cap.position.set(0, 0.012, -0.008);
  cap.rotation.x = -0.18;
  g.add(cap);
  if (look.body === 'f') {
    // Long hair down the back.
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.2, 6, 14), mat);
    back.scale.set(1.05, 1, 0.55);
    back.position.set(0, -0.12, -0.075);
    g.add(back);
    if (pick === 0) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), mat);
      bun.position.set(0, 0.15, -0.09);
      g.add(bun);
    } else {
      const fringe = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.18, 4, 8), mat);
      fringe.rotation.z = Math.PI / 2 - 0.25;
      fringe.position.set(0.02, 0.11, 0.12);
      g.add(fringe);
    }
  } else if (pick === 0) {
    // High-top fade: a rounded block on top.
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 16), mat);
    top.position.set(0, 0.16, -0.01);
    g.add(top);
  } else {
    // Short textured crop with a little quiff at the front.
    const quiff = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mat);
    quiff.scale.set(1.6, 0.6, 1);
    quiff.position.set(0, 0.15, 0.06);
    g.add(quiff);
  }
  return g;
}

/**
 * Crowd shapes for instancing: CLOTHES (torso, hips, legs, sleeves, shoes)
 * and SKIN (head, neck, forearms, hands). Rounded capsules like the
 * player, but with few sides so hundreds stay cheap. Legs and shoes are
 * baked darker with vertex colours so outfits read as top + trousers.
 */
export function crowdGeometries(): { clothes: THREE.BufferGeometry; skin: THREE.BufferGeometry } {
  const tint = (g: THREE.BufferGeometry, v: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const n = ng.getAttribute('position').count;
    ng.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(v), 3));
    ng.deleteAttribute('uv');
    return ng;
  };
  const cap = (r: number, len: number, x: number, y: number, rz = 0) => {
    const g = new THREE.CapsuleGeometry(r, len, 2, 6);
    g.rotateZ(rz);
    g.translate(x, y, 0);
    return g;
  };
  const torso = new THREE.CapsuleGeometry(0.2, 0.34, 3, 8).scale(1.25, 1, 0.78).translate(0, 1.22, 0);
  const pelvis = new THREE.CapsuleGeometry(0.19, 0.04, 2, 8).scale(1.18, 1, 0.8).translate(0, 0.9, 0);
  const clothes = mergeGeometries([
    tint(torso, 1),
    tint(pelvis, 0.42),
    tint(cap(0.08, 0.66, -0.11, 0.5), 0.42),
    tint(cap(0.08, 0.66, 0.11, 0.5), 0.42),
    tint(cap(0.06, 0.2, -0.29, 1.3, 0.08), 0.92),
    tint(cap(0.06, 0.2, 0.29, 1.3, -0.08), 0.92),
    tint(new THREE.BoxGeometry(0.14, 0.09, 0.26).translate(-0.11, 0.05, 0.05), 0.2),
    tint(new THREE.BoxGeometry(0.14, 0.09, 0.26).translate(0.11, 0.05, 0.05), 0.2),
  ])!;
  const skin = mergeGeometries([
    stripUv(new THREE.SphereGeometry(0.15, 10, 8).scale(0.95, 1.1, 1).translate(0, 1.76, 0)),
    stripUv(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 6).translate(0, 1.56, 0)),
    stripUv(cap(0.05, 0.18, -0.31, 1.0, 0.05)),
    stripUv(cap(0.05, 0.18, 0.31, 1.0, -0.05)),
  ].map((g) => (g.index ? g.toNonIndexed() : g)))!;
  return { clothes, skin };
}

function stripUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  return g;
}

export const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#a46b44', '#3b2414'];
export const OUTFIT_COLORS = ['#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#264653', '#111111', '#6d597a', '#b5838d', '#e9c46a', '#3a86ff', '#8ecae6', '#ffffff', '#4a4e69', '#9b2226'];
export const HAIR_COLORS = ['#111111', '#2b1b10', '#5a3825', '#a0522d', '#d4a017', '#b3b3b3', '#7b2cbf'];
