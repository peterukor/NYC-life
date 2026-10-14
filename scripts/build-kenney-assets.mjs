// =====================================================================
// build-kenney-assets.mjs — packs the Kenney cartoon models the game
// uses into a few small files.
//
// SOURCE: Kenney "Game Assets All-in-1" (CC0 — public domain, free for
// commercial use, no credit required). Only these kits are used:
//   City Kit – Commercial, City Kit – Suburban, City Kit – Roads,
//   Car Kit.
// Copy each kit's "Models/GLB format" folder into one source folder:
//   <src>/commercial  <src>/suburban  <src>/roads  <src>/cars
//
// Usage:
//   node scripts/build-kenney-assets.mjs <src>
//
// OUTPUT (public/models/):
//   kit-buildings.glb — every building, one root node per model, named
//                       after the file (e.g. "building-a").
//   kit-props.glb     — lamps, trees, signs, cones, awnings…
//   kit-cars.glb      — every vehicle (body + wheels under one node).
//   kit-houses.glb    — suburban houses for future outer boroughs.
// (People come from a different pack: scripts/build-folk-assets.mjs.)
//
// The game (assets/kit.ts) turns each root node into one geometry, so
// each model can be drawn hundreds of times in a single draw call.
//
// TO ADD A MODEL: drop its .glb into the right source folder, add its
// name to the lists below, re-run. Then use the name in the game.
// =====================================================================

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, quantize, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-kenney-assets.mjs <src>');
  process.exit(1);
}

const letters = (s) => [...s];
const PACKS = {
  'kit-buildings.glb': [
    ...letters('abcdefghijklmn').map((c) => `commercial/building-${c}`),
    ...letters('abcde').map((c) => `commercial/building-skyscraper-${c}`),
    // Far-away stand-ins (100–380 triangles each instead of ~2,000).
    ...letters('abcdefghijklmn').map((c) => `commercial/low-detail-building-${c}`),
    'commercial/low-detail-building-wide-a', 'commercial/low-detail-building-wide-b',
  ],
  // Houses for the outer boroughs (Queens, Staten Island) — not loaded yet.
  'kit-houses.glb': letters('abcdefghijklmnopqrstu').map((c) => `suburban/building-type-${c}`),
  'kit-props.glb': [
    'commercial/detail-awning', 'commercial/detail-awning-wide', 'commercial/detail-overhang', 'commercial/detail-overhang-wide', 'commercial/detail-parasol-a', 'commercial/detail-parasol-b',
    'suburban/tree-large', 'suburban/tree-small', 'suburban/planter', 'suburban/fence', 'suburban/fence-low',
    'roads/light-square', 'roads/light-curved', 'roads/traffic-light', 'roads/construction-barrier', 'roads/construction-cone', 'roads/construction-fence', 'roads/dumpster', 'roads/road-sign-street',
  ],
  'kit-cars.glb': ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'police', 'ambulance', 'firetruck', 'garbage-truck', 'delivery', 'truck', 'van', 'race', 'race-future'].map((n) => `cars/${n}`),
};

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

for (const [out, models] of Object.entries(PACKS)) {
  const pack = new Document();
  pack.createBuffer();
  const packScene = pack.createScene('kit');
  let keptAnimations = false;
  for (const model of models) {
    const name = model.split('/')[1];
    const doc = await io.read(join(src, `${model}.glb`));
    const root = doc.getRoot();
    // Only the first character keeps the shared animations.
    if (root.listAnimations().length && keptAnimations) {
      for (const a of root.listAnimations()) {
        a.listChannels().forEach((c) => c.dispose());
        a.listSamplers().forEach((s) => s.dispose());
        a.dispose();
      }
    }
    if (root.listAnimations().length) keptAnimations = true;
    // Tangents and the second UV set aren't used (flat cartoon shading).
    for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
      p.setAttribute('TANGENT', null);
      p.setAttribute('TEXCOORD_1', null);
    }
    // Wrap everything in one node named after the model.
    const scene = root.listScenes()[0];
    const wrapper = doc.createNode(name);
    for (const child of scene.listChildren()) {
      scene.removeChild(child);
      wrapper.addChild(child);
    }
    scene.addChild(wrapper);
    const map = mergeDocuments(pack, doc);
    // mergeDocuments makes a new scene per source: move its node into ours.
    const merged = map.get(scene);
    for (const child of merged.listChildren()) {
      merged.removeChild(child);
      packScene.addChild(child);
    }
    merged.dispose();
  }
  await pack.transform(unpartition(), dedup(), prune());
  pack.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await pack.transform(quantize());
  const path = join('public/models', out);
  await io.write(path, pack);
  console.log(`${path}: ${models.length} models, ${(statSync(path).size / 1024).toFixed(0)} KB, ${pack.getRoot().listTextures().length} textures, ${pack.getRoot().listAnimations().length} animations`);
}
