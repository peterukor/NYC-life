// =====================================================================
// avatar.ts — people: the player's character and the crowd.
//
// The player is a small rig of simple shapes with swinging arms and
// legs. Crowds use INSTANCING: the GPU draws hundreds of copies of one
// person shape in a single call, each with its own position and colour.
// That's how a cheap phone can show a busy Times Square.
// =====================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Look } from '../sim/types.ts';

const toon = (color: string) => new THREE.MeshLambertMaterial({ color });

export interface Avatar {
  root: THREE.Group;
  /** Call every frame with walking speed (0 = standing) and time step. */
  animate: (speed: number, dt: number) => void;
  setLook: (look: Look) => void;
  dispose: () => void;
}

/** Build the player's character (about 1.75 m tall). */
export function makeAvatar(look: Look): Avatar {
  const root = new THREE.Group();
  const mats = { skin: toon(look.skin), top: toon(look.top), bottom: toon(look.bottom), hair: toon(look.hair), shoe: toon('#1b1b1b') };

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), mats.top);
  torso.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mats.skin);
  head.position.y = 1.6;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.hair);
  hair.position.y = 1.62;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), mats.skin);
  neck.position.y = 1.46;

  const limb = (w: number, h: number, mat: THREE.Material, x: number, y: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.y = -h / 2;
    pivot.add(m);
    return pivot;
  };
  const legL = limb(0.18, 0.8, mats.bottom, -0.13, 0.82);
  const legR = limb(0.18, 0.8, mats.bottom, 0.13, 0.82);
  const armL = limb(0.13, 0.6, mats.top, -0.33, 1.4);
  const armR = limb(0.13, 0.6, mats.top, 0.33, 1.4);
  // Hands
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), mats.skin);
    hand.position.y = -0.64;
    arm.add(hand);
  }
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.3), mats.shoe);
    shoe.position.set(0, -0.8, 0.05);
    leg.add(shoe);
  }
  const body = new THREE.Group();
  body.add(torso, head, hair, neck, legL, legR, armL, armR);
  if (look.body === 'f') {
    torso.scale.set(0.92, 1, 1);
    hair.scale.set(1.05, 1.25, 1.05);
    hair.position.y = 1.58;
  }
  root.add(body);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  let phase = 0;
  return {
    root,
    animate(speed, dt) {
      const moving = speed > 0.1;
      phase += dt * (moving ? 9 : 2);
      const swing = moving ? Math.sin(phase) * 0.6 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
      // A gentle bob while walking, a slow breath while standing.
      body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.05 : Math.sin(phase) * 0.008;
    },
    setLook(l) {
      mats.skin.color.set(l.skin);
      mats.top.color.set(l.top);
      mats.bottom.color.set(l.bottom);
      mats.hair.color.set(l.hair);
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

/**
 * Two shapes for crowd instancing: CLOTHES (torso + legs + arms) and
 * SKIN (head + hands). Each instance gets its own clothes and skin colour.
 * Legs are baked slightly darker via vertex colours so outfits read well.
 */
export function crowdGeometries(): { clothes: THREE.BufferGeometry; skin: THREE.BufferGeometry } {
  const tint = (g: THREE.BufferGeometry, v: number) => {
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3).fill(v);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  };
  const torso = tint(new THREE.BoxGeometry(0.5, 0.62, 0.28).translate(0, 1.12, 0), 1);
  const legL = tint(new THREE.BoxGeometry(0.18, 0.8, 0.18).translate(-0.13, 0.42, 0), 0.45);
  const legR = tint(new THREE.BoxGeometry(0.18, 0.8, 0.18).translate(0.13, 0.42, 0), 0.45);
  const armL = tint(new THREE.BoxGeometry(0.13, 0.58, 0.13).translate(-0.33, 1.12, 0), 0.9);
  const armR = tint(new THREE.BoxGeometry(0.13, 0.58, 0.13).translate(0.33, 1.12, 0), 0.9);
  const clothes = mergeGeometries([torso, legL, legR, armL, armR])!;
  const head = new THREE.SphereGeometry(0.17, 8, 6).translate(0, 1.6, 0);
  const handL = new THREE.SphereGeometry(0.075, 6, 4).translate(-0.33, 0.8, 0);
  const handR = new THREE.SphereGeometry(0.075, 6, 4).translate(0.33, 0.8, 0);
  const skin = mergeGeometries([head, handL, handR])!;
  return { clothes, skin };
}

export const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#a46b44', '#3b2414'];
export const OUTFIT_COLORS = ['#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#264653', '#111111', '#6d597a', '#b5838d', '#e9c46a', '#3a86ff', '#8ecae6', '#ffffff', '#4a4e69', '#9b2226'];
export const HAIR_COLORS = ['#111111', '#2b1b10', '#5a3825', '#a0522d', '#d4a017', '#b3b3b3', '#7b2cbf'];
