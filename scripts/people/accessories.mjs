// =====================================================================
// accessories.mjs — hats, glasses, headphones and chains for the people.
//
// Built at build time from simple shapes, sized from the bare head (the
// same "scalp" measurements as the hairstyles in hair.mjs), and pinned to
// a bone: hats and glasses to the head, the chain to the chest. Each
// vertex is tagged with a colour slot (main or trim) so the game can
// paint them any colour.
//
// TO ADD ONE: add { id, bone, build(s, bones) } to ACCESSORIES returning
// { positions, indices, slots } (slots: 'main' | 'trim' per vertex).
// The game lists accessories by id (data/wardrobe.ts → hats and extras).
// =====================================================================

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Collect pieces with a slot tag each, into flat arrays. */
function pack(pieces) {
  const geos = [], tags = [];
  for (const [geo, tag] of pieces) {
    const g = (geo.index ? geo : mergeVertices(geo, 1e-6));
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    geos.push(g);
    tags.push(...new Array(g.getAttribute('position').count).fill(tag));
  }
  const g = mergeGeometries(geos);
  return { positions: new Float32Array(g.getAttribute('position').array), indices: new Uint32Array(g.index.array), slots: tags };
}

/** A rounded-ish box (low-poly bevel by scaling a subdivided box). */
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** The dome over the skull: top of a sphere, squashed. */
function dome(s, k = 1.08, cut = 0.5, squash = 0.86) {
  const r = Math.max(s.half.x, s.half.z) * k;
  const g = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI * cut).scale(s.half.x * k / r, squash, s.half.z * k / r);
  return { g, r };
}

/** The brim height: a little above the eyebrows at the front. */
const brimY = (s) => s.eye.y + 0.045;

export const ACCESSORIES = [
  {
    id: 'cap',
    bone: 'Head',
    build: (s) => {
      const y = brimY(s);
      const { g } = dome(s, 1.12, 0.5, 0.95);
      g.translate(s.center.x, y, s.center.z);
      const peak = new THREE.CylinderGeometry(s.half.x * 1.05, s.half.x * 1.05, 0.012, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.75).translate(s.center.x, y + 0.004, s.center.z + s.half.z * 0.75);
      const button = new THREE.SphereGeometry(0.012, 6, 4).translate(s.center.x, y + s.half.y * 1.15, s.center.z);
      return pack([[g, 'main'], [peak, 'trim'], [button, 'trim']]);
    },
  },
  {
    id: 'beanie',
    bone: 'Head',
    build: (s) => {
      const y = brimY(s) - 0.005;
      const { g } = dome(s, 1.1, 0.5, 1.15);
      g.translate(s.center.x, y, s.center.z);
      const cuff = new THREE.CylinderGeometry(s.half.x * 1.13, s.half.x * 1.14, 0.045, 16, 1, true).scale(1, 1, s.half.z / s.half.x).translate(s.center.x, y + 0.02, s.center.z);
      const pom = new THREE.IcosahedronGeometry(0.03, 0).translate(s.center.x, y + s.half.y * 1.35, s.center.z);
      return pack([[g, 'main'], [cuff, 'trim'], [pom, 'trim']]);
    },
  },
  {
    id: 'bucket',
    bone: 'Head',
    build: (s) => {
      const y = brimY(s) - 0.005;
      const crown = new THREE.CylinderGeometry(s.half.x * 0.95, s.half.x * 1.12, s.half.y * 0.95, 14).scale(1, 1, s.half.z / s.half.x).translate(s.center.x, y + s.half.y * 0.47, s.center.z);
      const brim = new THREE.CylinderGeometry(s.half.x * 1.55, s.half.x * 1.65, 0.012, 16).scale(1, 1, s.half.z / s.half.x).translate(s.center.x, y, s.center.z);
      return pack([[crown, 'main'], [brim, 'trim']]);
    },
  },
  {
    id: 'durag',
    bone: 'Head',
    build: (s) => {
      const y = brimY(s) - 0.012;
      const { g } = dome(s, 1.1, 0.55, 1.05);
      g.translate(s.center.x, y, s.center.z);
      const tails = [-1, 1].map((sx) => box(0.035, 0.16, 0.01, s.center.x + sx * 0.025, y - 0.06, s.center.z - s.half.z * 1.02));
      return pack([[g, 'main'], ...tails.map((t) => [t, 'main'])]);
    },
  },
  {
    id: 'shades',
    bone: 'Head',
    build: (s) => {
      const z = s.eye.z + 0.022, y = s.eye.y + 0.004;
      const lenses = [-1, 1].map((sx) => box(0.052, 0.032, 0.008, s.center.x + sx * 0.034, y, z));
      const bridge = box(0.022, 0.006, 0.006, s.center.x, y + 0.008, z);
      const arms = [-1, 1].map((sx) => box(0.004, 0.006, s.half.z * 1.1, s.center.x + sx * (s.half.x * 0.98), y + 0.006, z - s.half.z * 0.55));
      return pack([...lenses.map((l) => [l, 'trim']), [bridge, 'main'], ...arms.map((a) => [a, 'main'])]);
    },
  },
  {
    id: 'glasses',
    bone: 'Head',
    build: (s) => {
      const z = s.eye.z + 0.02, y = s.eye.y + 0.002;
      const rims = [-1, 1].map((sx) => new THREE.TorusGeometry(0.022, 0.0035, 4, 10).scale(1.15, 0.85, 1).translate(s.center.x + sx * 0.034, y, z));
      const bridge = box(0.02, 0.005, 0.005, s.center.x, y + 0.006, z);
      const arms = [-1, 1].map((sx) => box(0.004, 0.005, s.half.z * 1.1, s.center.x + sx * (s.half.x * 0.98), y + 0.005, z - s.half.z * 0.55));
      return pack([...rims.map((r) => [r, 'main']), [bridge, 'main'], ...arms.map((a) => [a, 'main'])]);
    },
  },
  {
    id: 'headphones',
    bone: 'Head',
    build: (s) => {
      const y = s.eye.y - 0.005;
      const r = s.half.x * 1.12;
      const band = new THREE.TorusGeometry(r, 0.012, 5, 14, Math.PI).scale(1, (s.center.y + s.half.y * 1.08 - y) / r, 1).translate(s.center.x, y, s.center.z - 0.005);
      const cups = [-1, 1].map((sx) => new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateZ(Math.PI / 2).translate(s.center.x + sx * r, y, s.center.z - 0.005));
      return pack([[band, 'trim'], ...cups.map((c) => [c, 'main'])]);
    },
  },
  {
    id: 'chain',
    bone: 'Chest',
    build: (s, bones) => {
      const neck = bones.Neck;
      const ring = new THREE.TorusGeometry(0.07, 0.007, 4, 18).rotateX(Math.PI / 2 - 0.75).translate(neck.x, neck.y - 0.035, neck.z + 0.05);
      const pendant = new THREE.OctahedronGeometry(0.018, 0).translate(neck.x, neck.y - 0.1, neck.z + 0.105);
      return pack([[ring, 'main'], [pendant, 'main']]);
    },
  },
];
