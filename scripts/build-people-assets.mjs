// =====================================================================
// build-people-assets.mjs — packs the people (bodies, outfits, hair and
// their animations) into two small files: one for men, one for women.
//
// SOURCES (all CC0 by Quaternius, free for commercial use)
//   • Ultimate Modular Men (Feb 2022) and Ultimate Modular Women (Apr 2022),
//     the "Individual Characters/glTF" folders: 11 + 10 outfits, each split
//     into head (face + hair or hat), body (top + arms), legs and feet.
//   • Universal Animation Library 1 + 2 ("Unreal-Godot" .glb files): 84
//     everyday clips (sitting, dancing, phone calls, eating, driving…),
//     moved onto the modular skeleton by scripts/people/retarget.mjs.
//
// Usage:
//   node scripts/build-people-assets.mjs <men glTF dir> <women glTF dir> <UAL1.glb> <UAL2.glb>
//
// OUTPUT: public/models/people-m.glb + people-m.anim, people-f.glb + people-f.anim
//   • One skeleton ("rig") in its rest pose.
//   • Every outfit part as its own skinned mesh, named "<kind>-<outfit>",
//     e.g. "top-suit", "bottom-casual", "head-punk", "feet-worker",
//     plus "pack-adventurer" (the backpack).
//   • Every vertex carries a baked colour (COLOR_0) and a SLOT number
//     (_SLOT) saying what it is (skin, hair, top, trim…), so the game can
//     recolour any slot and merge a whole person into ONE draw call.
//   • The animations, named as the game calls them ("idle", "walk", "sit",
//     "phone"…; see CLIPS below).
//
// TO ADD AN OUTFIT: drop its .gltf in the folder and add it to OUTFITS.
// TO ADD AN ANIMATION: add a line to CLIPS (any Universal Animation
// Library clip name, or one of the modular pack's own clips).
// =====================================================================

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { join } from 'node:path';
import { statSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { readRig, retargetClip, writeClip, resetToRest } from './people/retarget.mjs';
import { HAIR_STYLES, makeScalp } from './people/hair.mjs';
import { packAnimations } from './people/anim-pack.mjs';
import { ACCESSORIES } from './people/accessories.mjs';

const [menDir, womenDir, ual1Path, ual2Path] = process.argv.slice(2);
if (!ual2Path) {
  console.error('Usage: node scripts/build-people-assets.mjs <men glTF dir> <women glTF dir> <UAL1.glb> <UAL2.glb>');
  process.exit(1);
}

/** Vertex slots (must match SLOT in src/world/people.ts). */
export const SLOT = { skin: 0, eyes: 1, hair: 2, top: 3, top2: 4, bottom: 5, bottom2: 6, shoes: 7, shoes2: 8, hat: 9, hat2: 10, detail: 11, brows: 12, extra: 13, extra2: 14 };

/**
 * The outfits, and for each part which material is which slot. Materials
 * not listed fall back to the rules in slotFor(): skin → skin, the
 * biggest other colour → the part's main slot, the rest → its second slot.
 */
const OUTFITS = {
  m: {
    dir: menDir,
    files: {
      casual: 'Casual_2', hoodie: 'Casual_Hoodie', beach: 'Beach', suit: 'Suit', worker: 'Worker', punk: 'Punk',
      adventurer: 'Adventurer', farmer: 'Farmer', swat: 'Swat', king: 'King', spacesuit: 'Spacesuit',
    },
    heads: {
      // material → slot for each head (anything else: skin/eyes/hair rules).
      farmer: { Beige: 'hat', Red: 'hat2', Eyebrows: 'brows' },
      worker: { Worker_Yellow: 'hat', Moustache: 'hair', Eyebrows: 'brows' },
      king: { Gold: 'hat', Hair_White: 'hair' },
      punk: { Red: 'hair', Red_Dark: 'hair', Earrings: 'detail' },
      beach: { Earrings: 'detail' },
      swat: { Swat_Black: 'hat', Swat: 'hat2', Visor: 'detail' },
      spacesuit: { SciFi_Light: 'hat2', SciFi_Light_Accent: 'hat', Grey: 'detail' },
    },
  },
  f: {
    dir: womenDir,
    files: {
      casual: 'Casual', formal: 'Formal', suit: 'Suit', worker: 'Worker', punk: 'Punk', adventurer: 'Adventurer',
      soldier: 'Soldier', scifi: 'SciFi', witch: 'Witch', medieval: 'Medieval',
    },
    heads: {
      casual: { Hair_Blond: 'hair', Hair_Brown: 'brows', Brown: 'eyes' },
      suit: { Hair_Blond: 'hair', Hair_Brown: 'brows', Brown: 'eyes' },
      formal: { Red: 'hair', Brown: 'eyes' },
      worker: { DarkBrown: 'hair', Worker_Yellow: 'hat', Brown: 'eyes' },
      punk: { Pink: 'hair', Black: 'detail', Hair_Brown: 'brows', Brown: 'eyes' },
      adventurer: { Hair_Brown: 'hair', Brown: 'eyes' },
      soldier: { Hair_Brown: 'hair', Brown: 'eyes' },
      scifi: { Hair_Black: 'hair', Blue: 'detail', Black: 'brows', Brown: 'eyes' },
      witch: { Hair_Black: 'hair', Purple: 'hat', Gold: 'hat2', Brown: 'eyes' },
      medieval: { White: 'hair', DarkBrown: 'hat', Black: 'brows', Brown: 'eyes' },
    },
  },
};

/** Fixed-colour materials (metal, gold, jewellery) everywhere. */
const DETAIL = /^(Gold|Metal|Metal_Dark|Earrings|Visor)$/;

/** The face the built hairstyles sit on (its own hair removed). */
const BARE_HEAD = { m: 'suit', f: 'casual' };

/**
 * Game animation name → source clip. "ual:" clips are retargeted from the
 * Universal Animation Library; "own:" clips come with the modular pack.
 */
const CLIPS = {
  idle: 'ual:Idle_Loop',
  walk: 'ual:Walk_Loop',
  walkFormal: 'ual:Walk_Formal_Loop',
  run: 'ual:Jog_Fwd_Loop',
  sprint: 'ual:Sprint_Loop',
  carry: 'ual:Walk_Carry_Loop',
  sit: 'ual:Sitting_Enter',
  sitIdle: 'ual:Sitting_Idle_Loop',
  sitTalk: 'ual:Sitting_Talking_Loop',
  stand: 'ual:Sitting_Exit',
  pickup: 'ual:PickUp_Table',
  interact: 'ual:Interact',
  punch: 'ual:Punch_Cross',
  jab: 'ual:Punch_Jab',
  hit: 'ual:Hit_Chest',
  knockback: 'ual:Hit_Knockback',
  yes: 'ual:Yes',
  no: 'ual:Idle_No_Loop',
  jump: 'ual:Jump_Start',
  roll: 'ual:Roll',
  die: 'ual:Death01',
  dance: 'ual:Dance_Loop',
  talk: 'ual:Idle_Talking_Loop',
  phone: 'ual:Idle_TalkingPhone_Loop',
  eat: 'ual:Consume',
  drive: 'ual:Driving_Loop',
  lay: 'ual:LayToIdle',
  foldArms: 'ual:Idle_FoldArms_Loop',
  fix: 'ual:Fixing_Kneeling',
  push: 'ual:Push_Loop',
  crouch: 'ual:Crouch_Idle_Loop',
  lean: 'ual:Idle_Rail_Loop',
  throw: 'ual:OverhandThrow',
  water: 'ual:Farm_Watering',
  open: 'ual:Chest_Open',
  swim: 'ual:Swim_Idle_Loop',
  zombie: 'ual:Zombie_Walk_Fwd_Loop',
  wave: 'own:Wave',
  kick: 'own:Kick_Right',
};

/** Clips whose hands hold or grab things (they keep finger motion). */
const HAND_CLIPS = new Set(['phone', 'eat', 'drive', 'carry', 'pickup', 'interact', 'fix', 'open', 'water', 'throw', 'punch', 'jab', 'foldArms', 'talk', 'sitTalk']);
const FINGER = /^(Index|Middle|Ring|Pinky|Thumb)\d\.[LR]$/;

const srgbToLinear = (hex) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** Which slot a material in a part is. */
function slotFor(kind, outfit, matName, isBiggest, gender) {
  if (kind === 'head') {
    const o = OUTFITS[gender].heads[outfit]?.[matName];
    if (o) return SLOT[o];
    if (/^Skin/.test(matName)) return SLOT.skin;
    if (/^Eye$/.test(matName)) return SLOT.eyes;
    if (/^Eyebrows$/.test(matName)) return SLOT.brows;
    if (/^Hair/.test(matName)) return SLOT.hair;
    if (DETAIL.test(matName)) return SLOT.detail;
    return SLOT.hat;
  }
  if (/^Skin/.test(matName)) return SLOT.skin;
  if (DETAIL.test(matName)) return SLOT.detail;
  const main = { top: SLOT.top, bottom: SLOT.bottom, feet: SLOT.shoes, pack: SLOT.top2 }[kind];
  const second = { top: SLOT.top2, bottom: SLOT.bottom2, feet: SLOT.shoes2, pack: SLOT.detail }[kind];
  return isBiggest ? main : second;
}

const kindOf = (meshNodeName) =>
  /_Head$|^Formad_Head$/.test(meshNodeName) ? 'head'
  : /_Body$/.test(meshNodeName) ? 'top'
  : /_(Legs|Pants)$/.test(meshNodeName) ? 'bottom'
  : /_Feet$/.test(meshNodeName) ? 'feet'
  : /^Backpack$/.test(meshNodeName) ? 'pack'
  : null;

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const ual = { 1: await io.read(ual1Path), 2: await io.read(ual2Path) };
const ualRig = readRig(ual[1]);
let menBare = null;
const findUal = (name) => {
  for (const k of [1, 2]) {
    const a = ual[k].getRoot().listAnimations().find((x) => x.getName() === name);
    if (a) return { doc: ual[k], anim: a };
  }
  return null;
};

for (const [g, cfg] of Object.entries(OUTFITS)) {
  const out = new Document();
  const buffer = out.createBuffer();
  const scene = out.createScene('people');

  // ---- The skeleton (copied from the first outfit, in its rest pose).
  const firstFile = Object.values(cfg.files)[0];
  const refDoc = await io.read(join(cfg.dir, `${firstFile}.gltf`));
  const refRig = readRig(refDoc);
  resetToRest(refRig);
  const refSkin = refDoc.getRoot().listSkins()[0];
  const jointNames = refSkin.listJoints().map((j) => j.getName());
  const nodes = new Map();
  for (const name of refRig.order) nodes.set(name, out.createNode(name).setTranslation(refRig.joints.get(name).getTranslation()).setRotation(refRig.joints.get(name).getRotation()));
  const rig = out.createNode('rig');
  for (const name of refRig.order) {
    const p = refRig.parent.get(name);
    (p ? nodes.get(p) : rig).addChild(nodes.get(name));
  }
  scene.addChild(rig);
  const skin = out.createSkin('rig').setSkeleton(nodes.get(jointNames[0]));
  for (const n of jointNames) skin.addJoint(nodes.get(n));
  skin.setInverseBindMatrices(out.createAccessor().setType('MAT4').setArray(new Float32Array(refSkin.getInverseBindMatrices().getArray())).setBuffer(buffer));
  const white = out.createMaterial('People').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0);

  // ---- Every outfit part.
  const partNames = [];
  let bare = null;
  for (const [outfit, file] of Object.entries(cfg.files)) {
    const doc = await io.read(join(cfg.dir, `${file}.gltf`));
    const srcJoints = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName());
    const jointRemap = srcJoints.map((n) => jointNames.indexOf(n));
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      const kind = mesh && kindOf(node.getName());
      if (!kind) continue;
      const prims = mesh.listPrimitives();
      // Biggest non-skin material = the part's main colour.
      let biggest = null, most = -1;
      for (const p of prims) {
        const nm = p.getMaterial()?.getName() ?? '';
        const n = p.getAttribute('POSITION').getCount();
        if (!/^Skin/.test(nm) && !DETAIL.test(nm) && n > most) { most = n; biggest = nm; }
      }
      // Merge every primitive into one, with colour + slot per vertex.
      const P = [], J = [], W = [], C = [], S = [], I = [];
      let base = 0;
      for (const p of prims) {
        const nm = p.getMaterial()?.getName() ?? '';
        const slot = slotFor(kind, outfit, nm, nm === biggest, g);
        const col = (p.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1]).slice(0, 3);
        const pos = p.getAttribute('POSITION'), jo = p.getAttribute('JOINTS_0'), we = p.getAttribute('WEIGHTS_0');
        const n = pos.getCount();
        const t = [0, 0, 0, 0];
        for (let i = 0; i < n; i++) {
          P.push(...pos.getElement(i, [0, 0, 0]));
          const j4 = jo.getElement(i, [0, 0, 0, 0]);
          J.push(...j4.map((j) => Math.max(0, jointRemap[j])));
          W.push(...we.getElement(i, t));
          C.push(...col);
          S.push(slot);
        }
        const idx = p.getIndices();
        if (idx) for (let i = 0; i < idx.getCount(); i++) I.push(idx.getScalar(i) + base);
        else for (let i = 0; i < n; i++) I.push(i + base);
        base += n;
      }
      const prim = out.createPrimitive()
        .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
        .setAttribute('JOINTS_0', out.createAccessor().setType('VEC4').setArray(new Uint16Array(J)).setBuffer(buffer))
        .setAttribute('WEIGHTS_0', out.createAccessor().setType('VEC4').setArray(new Float32Array(W)).setBuffer(buffer))
        .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(new Float32Array(C)).setBuffer(buffer))
        .setAttribute('_SLOT', out.createAccessor().setType('SCALAR').setArray(new Uint8Array(S)).setBuffer(buffer))
        .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buffer))
        .setMaterial(white);
      const name = `${kind}-${outfit}`;
      const part = out.createNode(name).setMesh(out.createMesh(name).addPrimitive(prim)).setSkin(skin);
      scene.addChild(part);
      partNames.push(name);
      if (kind === 'head' && outfit === BARE_HEAD[g]) bare = { P, J, W, C, S, I };
      if (kind === 'head' && process.env.BARE_ALL) {
        const keep = [];
        for (let t = 0; t < I.length; t += 3) if (![I[t], I[t + 1], I[t + 2]].some((i) => S[i] === SLOT.hair || S[i] === SLOT.hat)) keep.push(I[t], I[t + 1], I[t + 2]);
        const pr = out.createPrimitive().setAttribute('POSITION', prim.getAttribute('POSITION')).setAttribute('JOINTS_0', prim.getAttribute('JOINTS_0')).setAttribute('WEIGHTS_0', prim.getAttribute('WEIGHTS_0')).setAttribute('COLOR_0', prim.getAttribute('COLOR_0')).setAttribute('_SLOT', prim.getAttribute('_SLOT'))
          .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buffer)).setMaterial(white);
        scene.addChild(out.createNode(`bare-${outfit}`).setMesh(out.createMesh(`bare-${outfit}`).addPrimitive(pr)).setSkin(skin));
      }
    }
  }

  // ---- The bare head: the base face with its hair taken off, for the
  // built hairstyles. Triangles touching a hair vertex are dropped.
  const bareI = [];
  for (let t = 0; t < bare.I.length; t += 3) {
    const tri = bare.I.slice(t, t + 3);
    if (!tri.some((i) => bare.S[i] === SLOT.hair)) bareI.push(...tri);
  }
  {
    const prim = out.createPrimitive()
      .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(bare.P)).setBuffer(buffer))
      .setAttribute('JOINTS_0', out.createAccessor().setType('VEC4').setArray(new Uint16Array(bare.J)).setBuffer(buffer))
      .setAttribute('WEIGHTS_0', out.createAccessor().setType('VEC4').setArray(new Float32Array(bare.W)).setBuffer(buffer))
      .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(new Float32Array(bare.C)).setBuffer(buffer))
      .setAttribute('_SLOT', out.createAccessor().setType('SCALAR').setArray(new Uint8Array(bare.S)).setBuffer(buffer))
      .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(bareI)).setBuffer(buffer))
      .setMaterial(white);
    scene.addChild(out.createNode('head-bare').setMesh(out.createMesh('head-bare').addPrimitive(prim)).setSkin(skin));
    partNames.push('head-bare');
  }
  // The women's faces in the pack are masks: there is no skull under the
  // hair (nobody sees it). For the built hairstyles (and bald or buzz cuts)
  // the women's bare head borrows the back and top of the men's skull,
  // shrunk to fit, stitched behind her own face.
  if (g === 'm') menBare = bare;
  else {
    const headJ = jointNames.indexOf('Head');
    const eye = (b) => {
      let x = 0, y = 0, z = 0, n = 0;
      for (let i = 0; i < b.S.length; i++) if (b.S[i] === SLOT.eyes) { x += b.P[i * 3]; y += b.P[i * 3 + 1]; z += b.P[i * 3 + 2]; n++; }
      return [x / n, y / n, z / n];
    };
    const eM = eye(menBare), eW = eye(bare);
    const K = [0.87, 0.93, 0.92];
    const cen = (b, t) => [0, 1, 2].map((k) => (b.P[b.I[t] * 3 + k] + b.P[b.I[t + 1] * 3 + k] + b.P[b.I[t + 2] * 3 + k]) / 3);
    // Her face and neck, without the hidden flap behind the ears.
    const I2 = [];
    for (let t = 0; t < bare.I.length; t += 3) {
      const c = cen(bare, t);
      const tri = [bare.I[t], bare.I[t + 1], bare.I[t + 2]];
      if (tri.some((i) => bare.S[i] === SLOT.hair)) continue;
      if (c[2] < 0.05 && c[1] > 1.6) continue;
      I2.push(...tri);
    }
    // His skull: behind the cheeks or above the brows.
    const P = [...bare.P], J = [...bare.J], W = [...bare.W], C = [...bare.C], S = [...bare.S];
    const remap = new Map();
    const skinCol = bare.C.slice(bare.S.indexOf(SLOT.skin) * 3, bare.S.indexOf(SLOT.skin) * 3 + 3);
    for (let t = 0; t < menBare.I.length; t += 3) {
      const tri = [menBare.I[t], menBare.I[t + 1], menBare.I[t + 2]];
      if (tri.some((i) => menBare.S[i] !== SLOT.skin)) continue;
      const c = cen(menBare, t);
      if (!(c[2] < 0.11 && c[1] > 1.6 && Math.abs(c[0]) > 0.055) && !(c[2] < 0.06 && c[1] > 1.52) && !(c[1] > 1.735)) continue;
      for (const i of tri) {
        if (!remap.has(i)) {
          remap.set(i, S.length);
          for (let k = 0; k < 3; k++) P.push(eW[k] + K[k] * (menBare.P[i * 3 + k] - eM[k]));
          J.push(headJ, 0, 0, 0); W.push(1, 0, 0, 0); C.push(...skinCol); S.push(SLOT.skin);
        }
        I2.push(remap.get(i));
      }
    }
    bare = { P, J, W, C, S, I: I2 };
    // Replace the women's bare head part with the stitched one.
    const node = scene.listChildren().find((n) => n.getName() === 'head-bare');
    const prim = node.getMesh().listPrimitives()[0];
    prim.setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
      .setAttribute('JOINTS_0', out.createAccessor().setType('VEC4').setArray(new Uint16Array(J)).setBuffer(buffer))
      .setAttribute('WEIGHTS_0', out.createAccessor().setType('VEC4').setArray(new Float32Array(W)).setBuffer(buffer))
      .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(new Float32Array(C)).setBuffer(buffer))
      .setAttribute('_SLOT', out.createAccessor().setType('SCALAR').setArray(new Uint8Array(S)).setBuffer(buffer))
      .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(I2)).setBuffer(buffer));
  }

  // The scalp the built hairstyles grow from (scripts/people/hair.mjs).
  const scalp = makeScalp(bare, SLOT);

  // ---- Extra hairstyles, built from simple shapes and pinned to the head.
  const headIndex = jointNames.indexOf('Head');
  for (const style of HAIR_STYLES) {
    const geo = style.build(scalp);
    if (!geo) continue;
    const n = geo.positions.length / 3;
    const J = new Uint16Array(n * 4), W = new Float32Array(n * 4), C = new Float32Array(n * 3), S = new Uint8Array(n);
    const col = srgbToLinear('#2b1b10');
    for (let i = 0; i < n; i++) {
      J[i * 4] = headIndex;
      W[i * 4] = 1;
      C.set(col, i * 3);
      S[i] = geo.slots?.[i] ?? SLOT.hair;
    }
    const prim = out.createPrimitive()
      .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(geo.positions).setBuffer(buffer))
      .setAttribute('JOINTS_0', out.createAccessor().setType('VEC4').setArray(J).setBuffer(buffer))
      .setAttribute('WEIGHTS_0', out.createAccessor().setType('VEC4').setArray(W).setBuffer(buffer))
      .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(C).setBuffer(buffer))
      .setAttribute('_SLOT', out.createAccessor().setType('SCALAR').setArray(S).setBuffer(buffer))
      .setIndices(out.createAccessor().setType('SCALAR').setArray(geo.indices).setBuffer(buffer))
      .setMaterial(white);
    const name = `hair-${style.id}`;
    scene.addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(prim)).setSkin(skin));
    partNames.push(name);
  }

  // ---- Hats, glasses, headphones and chains (people/accessories.mjs).
  const boneAt = Object.fromEntries(jointNames.map((n) => [n, new THREE.Vector3().setFromMatrixPosition(refRig.world.get(n))]));
  for (const acc of ACCESSORIES) {
    const geo = acc.build(scalp, boneAt);
    const n = geo.positions.length / 3;
    const bi = jointNames.indexOf(acc.bone);
    const isHat = acc.bone === 'Head' && ['cap', 'beanie', 'bucket', 'durag'].includes(acc.id);
    const J = new Uint16Array(n * 4), W = new Float32Array(n * 4), C = new Float32Array(n * 3), S = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      J[i * 4] = bi;
      W[i * 4] = 1;
      const trim = geo.slots[i] === 'trim';
      S[i] = isHat ? (trim ? SLOT.hat2 : SLOT.hat) : trim ? SLOT.extra2 : SLOT.extra;
      C.set(srgbToLinear(trim ? '#15171c' : '#d4af37'), i * 3);
    }
    const prim = out.createPrimitive()
      .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(geo.positions).setBuffer(buffer))
      .setAttribute('JOINTS_0', out.createAccessor().setType('VEC4').setArray(J).setBuffer(buffer))
      .setAttribute('WEIGHTS_0', out.createAccessor().setType('VEC4').setArray(W).setBuffer(buffer))
      .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(C).setBuffer(buffer))
      .setAttribute('_SLOT', out.createAccessor().setType('SCALAR').setArray(S).setBuffer(buffer))
      .setIndices(out.createAccessor().setType('SCALAR').setArray(geo.indices).setBuffer(buffer))
      .setMaterial(white);
    const name = `${isHat ? 'hat' : 'extra'}-${acc.id}`;
    scene.addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(prim)).setSkin(skin));
    partNames.push(name);
  }

  // ---- Animations.
  const tgtRig = readRig(out);
  let relaxedHand = null;
  for (const [game, src] of Object.entries(process.env.NO_ANIM ? {} : CLIPS)) {
    const [kind, name] = src.split(':');
    if (kind === 'ual') {
      const found = findUal(name);
      if (!found) { console.warn('missing clip', name); continue; }
      const clip = retargetClip(found.doc, found.doc === ual[1] ? ualRig : readRig(found.doc), tgtRig, found.anim);
      // Fingers cost half the animation data. Only clips where the hands
      // hold or grab something keep their finger motion; the rest use the
      // relaxed hand from the first frame of "idle".
      if (game === 'idle') relaxedHand = new Map([...clip.tracks].filter(([n]) => FINGER.test(n)).map(([n, t]) => [n, t.rotation.slice(0, 4)]));
      else if (!HAND_CLIPS.has(game) && relaxedHand) {
        for (const [n, q] of relaxedHand) {
          const r = clip.tracks.get(n)?.rotation;
          if (r) for (let f = 0; f < r.length; f += 4) r.set(q, f);
        }
      }
      writeClip(out, clip, nodes, game);
    } else {
      // The modular pack's own clip: same skeleton, copy it across.
      const a = refDoc.getRoot().listAnimations().find((x) => x.getName().endsWith(name));
      if (!a) { console.warn('missing own clip', name); continue; }
      const copy = out.createAnimation(game);
      for (const ch of a.listChannels()) {
        const target = nodes.get(ch.getTargetNode()?.getName());
        if (!target) continue;
        const s = ch.getSampler();
        const ns = out.createAnimationSampler()
          .setInput(out.createAccessor().setType('SCALAR').setArray(new Float32Array(s.getInput().getArray())).setBuffer(buffer))
          .setOutput(out.createAccessor().setType(s.getOutput().getType()).setArray(new Float32Array(s.getOutput().getArray())).setBuffer(buffer))
          .setInterpolation(s.getInterpolation());
        copy.addSampler(ns).addChannel(out.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(ns));
      }
    }
  }

  // ---- Make it small. The look is flat-shaded low-poly, so no normals
  // (the game computes facets on the GPU), fewer triangles, fewer keys.
  await out.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: +(process.env.RATIO ?? 0.3), error: +(process.env.ERR ?? 0.006), lockBorder: true }),
    resample({ tolerance: +(process.env.TOL ?? 0.003) }),
    dedup(),
    prune({ keepAttributes: true, keepLeaves: true }),
  );
  // Fingers rest relaxed (the "idle" hand) instead of in the stiff
  // T-pose, so clips without finger keys still show natural hands; then
  // every track that never moves from a bone's resting value is dropped
  // (the bone just keeps its rest pose), which keeps the file small.
  if (relaxedHand) for (const [n, q] of relaxedHand) nodes.get(n)?.setRotation(Array.from(q));
  let dropped = 0;
  for (const anim of out.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode(), path = ch.getTargetPath();
      const rest = path === 'rotation' ? node.getRotation() : path === 'translation' ? node.getTranslation() : node.getScale();
      const arr = ch.getSampler().getOutput().getArray();
      const k = rest.length;
      let same = true;
      for (let i = 0; i < arr.length && same; i += k) {
        let d = 0;
        for (let c = 0; c < k; c++) d = Math.max(d, Math.abs(arr[i + c] - rest[c]));
        // q and -q are the same rotation.
        if (k === 4 && d > 0.002) { let e = 0; for (let c = 0; c < 4; c++) e = Math.max(e, Math.abs(arr[i + c] + rest[c])); d = Math.min(d, e); }
        if (d > (path === 'translation' ? 0.0008 : 0.002)) same = false;
      }
      if (same) { const sm = ch.getSampler(); ch.dispose(); sm.dispose(); dropped++; }
    }
  }
  await out.transform(prune({ keepAttributes: true, keepLeaves: true }));

  // The animations go in their own compact file (see people/anim-pack.mjs:
  // as glTF JSON they cost more than the motion itself).
  const animFile = `public/models/people-${g}.anim`;
  writeFileSync(animFile, await packAnimations(out));
  const clipCount = out.getRoot().listAnimations().length;
  for (const a of out.getRoot().listAnimations()) {
    for (const sm of a.listSamplers()) { sm.getInput()?.dispose(); sm.getOutput()?.dispose(); }
    a.dispose();
  }
  await out.transform(prune({ keepAttributes: true, keepLeaves: true }));

  out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await out.transform(quantize({ quantizationVolume: 'scene', pattern: /^(POSITION|COLOR|JOINTS|WEIGHTS)/ }));
  const file = `public/models/people-${g}.glb`;
  await io.write(file, out);
  const tris = out.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  console.log(`${file}: ${(statSync(file).size / 1024).toFixed(0)} KB, ${partNames.length} parts, ${Math.round(tris)} triangles in all; ${animFile}: ${(statSync(animFile).size / 1024).toFixed(0)} KB, ${clipCount} clips`);
}
