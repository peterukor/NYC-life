// =====================================================================
// build-furniture-assets.mjs — packs home furniture into one small file.
//
// SOURCE: Kenney "Furniture Kit" (CC0 — public domain), the
// "Models/GLTF format" folder (.glb files).
//
// Usage:
//   node scripts/build-furniture-assets.mjs <path-to-GLTF-format-folder>
//
// WHAT IT DOES
//   Every model has several materials (wood, fabric, metal…), which
//   would cost several draw calls per piece. We bake each material's
//   colour into the vertices and merge every model into ONE mesh, then
//   compress the lot (meshopt). The game draws a whole room in a few
//   calls and can still tell pieces apart (one node per model, named
//   after its file).
//
// OUTPUT: public/models/furniture.glb
//
// TO ADD A PIECE: add its file name to MODELS, re-run, then add an
// entry for it in src/data/furniture.ts.
// =====================================================================

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, quantize, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-furniture-assets.mjs <GLTF format folder>');
  process.exit(1);
}

export const MODELS = [
  'bedDouble', 'bedSingle', 'cabinetBedDrawer', 'kitchenStove', 'kitchenFridge', 'kitchenSink', 'kitchenCabinet',
  'kitchenCabinetDrawer', 'kitchenCoffeeMachine', 'kitchenBar', 'stoolBar', 'table', 'tableRound', 'chair', 'chairCushion',
  'shower', 'bathtub', 'toilet', 'bathroomSink', 'washer', 'loungeSofa', 'loungeSofaLong', 'loungeSofaCorner', 'loungeChair',
  'tableCoffee', 'tableCoffeeGlass', 'cabinetTelevision', 'televisionModern', 'televisionVintage', 'bookcaseOpen',
  'bookcaseClosedWide', 'speaker', 'desk', 'chairDesk', 'computerScreen', 'laptop', 'rugRectangle', 'rugRound',
  'pottedPlant', 'plantSmall1', 'lampRoundFloor', 'lampSquareTable', 'coatRackStanding', 'sideTable', 'trashcan',
  'kitchenMicrowave', 'bathroomMirror', 'pillow',
];

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const out = new Document();
const buffer = out.createBuffer();
const material = out.createMaterial('furniture').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0);
const scene = out.createScene('furniture');

const mul = (m, x, y, z, w) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];

for (const name of MODELS) {
  const doc = await io.read(join(src, `${name}.glb`));
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION');
      const N = prim.getAttribute('NORMAL');
      const I = prim.getIndices();
      const c = prim.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const base = pos.length / 3;
      const p = [0, 0, 0];
      const n = [0, 0, 0];
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, p);
        pos.push(...mul(m, p[0], p[1], p[2], 1));
        if (N) {
          N.getElement(i, n);
          const t = mul(m, n[0], n[1], n[2], 0);
          const l = Math.hypot(...t) || 1;
          nor.push(t[0] / l, t[1] / l, t[2] / l);
        } else nor.push(0, 1, 0);
        col.push(c[0], c[1], c[2]);
      }
      if (I) for (let i = 0; i < I.getCount(); i++) idx.push(base + I.getScalar(i));
      else for (let i = 0; i < P.getCount(); i++) idx.push(base + i);
    }
  }
  const prim = out
    .createPrimitive()
    .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
    .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buffer))
    .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(new Float32Array(col)).setBuffer(buffer))
    .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer))
    .setMaterial(material);
  scene.addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(prim)));
}

await out.transform(weld(), quantize({ quantizeColor: 8 }), prune());
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const file = 'public/models/furniture.glb';
await io.write(file, out);
console.log(`${file}: ${MODELS.length} models, ${(statSync(file).size / 1024).toFixed(0)} KB`);
