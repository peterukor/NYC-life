// =====================================================================
// build-folk-assets.mjs — packs the cartoon people into one small file.
//
// SOURCE: Quaternius "Ultimate Animated Character Pack" (CC0 — public
// domain, free for commercial use). Use the glTF folder.
//
// Usage:
//   node scripts/build-folk-assets.mjs <path-to-glTF-folder>
//
// WHAT IT DOES
//   Each character comes with 6–8 materials (skin, hair, shirt, pants…),
//   which would mean 6–8 draw calls per person. We bake every material's
//   colour into the vertices and remember which "slot" each vertex is
//   (skin, hair, top, bottom, hat, eyes, detail). The game then draws a
//   person in ONE call and can recolour any slot — different skin tones,
//   hair colours and outfit colours from the same model.
//
// OUTPUT: public/models/folk.glb — every character as a root node named
// after its file, plus the 17 shared animations once.
//
// TO ADD A CHARACTER: put its .gltf in the folder, add it to CHARACTERS,
// re-run. The game finds it by name (see world/folk.ts → FOLK_ROLES).
// =====================================================================

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, joinPrimitives, mergeDocuments, prune, quantize, resample, simplify, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-folk-assets.mjs <glTF folder>');
  process.exit(1);
}

const CHARACTERS = [
  'Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Casual_Bald',
  'Suit_Male', 'Suit_Female', 'Doctor_Male_Young', 'Doctor_Female_Young', 'Chef_Male', 'Chef_Female',
  'Worker_Male', 'Worker_Female', 'OldClassy_Male', 'OldClassy_Female', 'BlueSoldier_Male', 'BlueSoldier_Female',
];

/** Material name → slot number (must match SLOT in world/folk.ts). */
const SLOT = { skin: 0, eyes: 1, hair: 2, top: 3, bottom: 4, hat: 5, detail: 6 };
const slotOf = (name) =>
  /^skin/i.test(name) ? SLOT.skin
  : /^face/i.test(name) ? SLOT.eyes
  : /^hair/i.test(name) ? SLOT.hair
  : /^(shirt|clothes|main)$/i.test(name) ? SLOT.top
  : /^(pants|darkclothes)$/i.test(name) ? SLOT.bottom
  : /^(hat|helmet)$/i.test(name) ? SLOT.hat
  : SLOT.detail;

/** Default skin tones, varied across the cast (the source is black). */
const SKINS = ['#8d5524', '#f1c27d', '#c68642', '#5c3a21', '#e0ac69', '#ffdbac', '#a46b44', '#3b2414'];
const srgbToLinear = (hex) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const pack = new Document();
pack.createBuffer();
const packScene = pack.createScene('folk');
let first = true;

for (const [ci, name] of CHARACTERS.entries()) {
  const doc = await io.read(join(src, `${name}.gltf`));
  const root = doc.getRoot();
  if (!first) {
    for (const a of root.listAnimations()) {
      a.listChannels().forEach((c) => c.dispose());
      a.listSamplers().forEach((s) => s.dispose());
      a.dispose();
    }
  }
  first = false;
  const white = doc.createMaterial('Folk').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.8).setMetallicFactor(0);
  const skin = srgbToLinear(SKINS[ci % SKINS.length]);
  for (const mesh of root.listMeshes()) {
    const prims = mesh.listPrimitives();
    for (const p of prims) {
      const mat = p.getMaterial();
      const slot = slotOf(mat?.getName() ?? '');
      const base = slot === SLOT.skin ? skin : (mat?.getBaseColorFactor() ?? [1, 1, 1]).slice(0, 3);
      const n = p.getAttribute('POSITION').getCount();
      const color = new Float32Array(n * 3);
      const slots = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        color.set(base, i * 3);
        slots[i] = slot;
      }
      p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(color));
      p.setAttribute('_SLOT', doc.createAccessor().setType('SCALAR').setArray(slots));
      p.setMaterial(white);
      // The style is flat-shaded low-poly: the game computes facet normals
      // on the GPU (flatShading), so stored normals would only duplicate
      // every vertex at each hard edge.
      p.setAttribute('NORMAL', null);
    }
    if (prims.length > 1) {
      mesh.addPrimitive(joinPrimitives(prims));
      prims.forEach((p) => p.dispose());
    }
  }
  // One root node per character, named after it.
  const scene = root.listScenes()[0];
  const wrapper = doc.createNode(name);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  const map = mergeDocuments(pack, doc);
  const merged = map.get(scene);
  for (const child of merged.listChildren()) {
    merged.removeChild(child);
    packScene.addChild(child);
  }
  merged.dispose();
}

// Fewer triangles (the source is ~9k vertices per person; a phone
// doesn't need that for a 1.7 m cartoon) and fewer animation keys.
await pack.transform(unpartition(), dedup(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.4, error: 0.004 }), resample({ tolerance: 0.002 }));
pack.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
// One quantization space for every character (scene-wide).
await pack.transform(quantize({ quantizationVolume: 'scene', pattern: /^(POSITION|NORMAL|COLOR|JOINTS|WEIGHTS)/ }));
const out = 'public/models/folk.glb';
await io.write(out, pack);
console.log(`${out}: ${CHARACTERS.length} characters, ${(statSync(out).size / 1024).toFixed(0)} KB, ${pack.getRoot().listAnimations().length} animations`);
