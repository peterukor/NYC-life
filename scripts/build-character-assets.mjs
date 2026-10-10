// =====================================================================
// build-character-assets.mjs — turns the big source character files into
// the small ones the game downloads.
//
// SOURCE (not in this repo, it's ~2 GB): Quaternius' "Universal Animation
// Library" 1 and 2 (CC0 / public domain), e.g. from
//   https://github.com/tilakpatell/tilakverse-assets  (quaternius/…)
//   or https://quaternius.com
//
// Usage:
//   node scripts/build-character-assets.mjs <path-to>/quaternius
//
// OUTPUT (committed, in public/models/):
//   person_m.glb  — male body mesh + skeleton (no animations)
//   person_f.glb  — female body mesh + skeleton, simplified (the source
//                   has 25k vertices, too many for cheap phones)
//   anims.glb     — only the animation clips the game uses, shared by
//                   both bodies (they use the same skeleton)
//
// Everything is compressed with meshopt (the game loads it with three's
// MeshoptDecoder), and animations are resampled to drop redundant keys.
//
// TO ADD AN ANIMATION: add its name to CLIPS below, re-run the script,
// then use the name from world/people.ts (see ANIM in that file).
// =====================================================================

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, resample, simplify, weld, quantize, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-character-assets.mjs <path-to>/quaternius');
  process.exit(1);
}
const UAL1 = join(src, 'universal-animation-library/Unreal-Godot/UAL1.glb');
const UAL2 = join(src, 'universal-animation-library-2/Unreal-Godot/UAL2.glb');
const FEMALE = join(src, 'universal-animation-library-2/Female Mannequin/Unreal-Godot/Mannequin_F.glb');
const OUT = 'public/models';

/** The animation clips the game uses (names from the library). */
const CLIPS = {
  [UAL1]: ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Idle_Talking_Loop', 'Idle_LookAround_Loop', 'Idle_Tired_Loop', 'Drink', 'Interact', 'Celebration', 'Crying', 'Dance_Loop', 'Driving_Loop', 'Counter_Idle_Loop', 'PickUp_Table', 'Hit_Chest', 'Walk_Formal_Loop'],
  [UAL2]: ['Idle_TalkingPhone_Loop', 'Idle_FoldArms_Loop', 'Consume', 'Surprise', 'Yes', 'Idle_No_Loop', 'Walk_Carry_Loop'],
};

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

/** Remove animations fully, including their samplers' keyframe data. */
function disposeAnimations(list) {
  for (const a of list) {
    a.listChannels().forEach((c) => c.dispose());
    // Keyframe data (accessors) can be shared between samplers, so we
    // only drop the samplers here; prune() later removes orphaned data.
    a.listSamplers().forEach((s) => s.dispose());
    a.dispose();
  }
}

/**
 * Keep a channel only if it moves something you can see: finger bones
 * (40 of the 65 bones) are too small to notice in a city game, and only
 * the root and pelvis need position keys (the rest only rotate).
 */
const FINGER = /^(index|middle|pinky|ring|thumb)_/;
function wanted(nodeName, path) {
  if (FINGER.test(nodeName)) return false;
  if (path === 'scale') return false;
  if (path === 'translation') return nodeName === 'pelvis' || nodeName === 'root';
  return true;
}
function trimChannels(anim) {
  for (const c of anim.listChannels()) {
    if (wanted(c.getTargetNode()?.getName() ?? '', c.getTargetPath())) continue;
    const s = c.getSampler();
    c.dispose();
    if (s && !s.listParents().some((p) => p.propertyType === 'AnimationChannel')) s.dispose();
  }
}

/** Compress and write a document. */
async function save(doc, name) {
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await doc.transform(dedup(), prune(), quantize());
  const path = join(OUT, name);
  await io.write(path, doc);
  console.log(`${path}: ${(statSync(path).size / 1024).toFixed(0)} KB`);
}

/**
 * Body: drop animations, give both parts (body + joint rings) one shared
 * material so they draw in one call, remove the unused second UV set,
 * and optionally simplify.
 */
async function body(file, out, ratio) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  disposeAnimations(root.listAnimations());
  const [main, ...rest] = root.listMaterials();
  main.setName('Body').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.75).setMetallicFactor(0);
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      prim.setMaterial(main);
      // No textures on these bodies (colour comes from the outfit), so the
      // UV sets only get in the way of welding and simplifying.
      prim.setAttribute('TEXCOORD_0', null);
      prim.setAttribute('TEXCOORD_1', null);
    }
  }
  rest.forEach((m) => m.dispose());
  await doc.transform(weld());
  for (const mesh of root.listMeshes()) {
    const prims = mesh.listPrimitives();
    if (prims.length < 2) continue;
    mesh.addPrimitive(joinPrimitives(prims));
    prims.forEach((p) => p.dispose());
  }
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0015 }));
  await save(doc, out);
}

await body(UAL1, 'person_m.glb', 1);
await body(FEMALE, 'person_f.glb', 0.32);

// Animations: one file holding the chosen clips from both libraries.
const anims = await io.read(UAL1);
{
  const root = anims.getRoot();
  const keep = new Set(CLIPS[UAL1]);
  disposeAnimations(root.listAnimations().filter((a) => !keep.has(a.getName())));
  root.listAnimations().forEach(trimChannels);
  // Copy clips from UAL2 onto UAL1's skeleton by bone name.
  const ual2 = await io.read(UAL2);
  const nodeByName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  for (const a2 of ual2.getRoot().listAnimations()) {
    if (!CLIPS[UAL2].includes(a2.getName())) continue;
    const a = anims.createAnimation(a2.getName());
    for (const ch2 of a2.listChannels()) {
      const target = nodeByName.get(ch2.getTargetNode()?.getName());
      if (!target || !wanted(target.getName(), ch2.getTargetPath())) continue;
      const s2 = ch2.getSampler();
      const input = anims.createAccessor().setType('SCALAR').setArray(s2.getInput().getArray().slice());
      const output = anims.createAccessor().setType(s2.getOutput().getType()).setArray(s2.getOutput().getArray().slice());
      const s = anims.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s2.getInterpolation());
      a.addSampler(s).addChannel(anims.createAnimationChannel().setTargetNode(target).setTargetPath(ch2.getTargetPath()).setSampler(s));
    }
  }
  // The clips only need the skeleton, not the mesh.
  for (const n of root.listNodes()) {
    if (n.getMesh()) {
      n.getMesh().dispose();
      n.setSkin(null);
    }
  }
  root.listSkins().forEach((s) => s.dispose());
  await anims.transform(resample({ tolerance: 0.002 }));
  console.log('clips:', root.listAnimations().map((a) => a.getName()).join(', '));
  await save(anims, 'anims.glb');
}
