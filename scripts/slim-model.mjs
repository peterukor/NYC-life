// =====================================================================
// slim-model.mjs — shrink an AI-generated (Tripo/Meshy) model for phones.
//   node scripts/slim-model.mjs <in.glb> <out.glb> <targetTriangles|0> [error]
// (0 = don't simplify, just pack: use after scripts/bake-model.py, which
// simplifies properly. Simplifying AI models here directly scrambles
// their texture below roughly 100k triangles.)
// Keeps only the colour texture (1024px WebP), simplifies across the
// texture seams AI models are full of, then quantizes + meshopt-packs it.
// Example: a 61 MB, 1.86M-triangle Tripo block -> 0.6 MB, 30k triangles.
// =====================================================================
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, textureCompress, quantize } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [src, out, target] = process.argv.slice(2, 5);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
// Keep only the colour texture: drop normal / metal-rough maps (cartoon look, phone budget).
for (const m of root.listMaterials()) {
  m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null);
  m.setMetallicFactor(0); m.setRoughnessFactor(1);
}
const count = () => root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
console.log('before', Math.round(count()));
await MeshoptSimplifier.ready;
// AI models are split into thousands of texture islands, which stops a normal
// simplifier early. 'Permissive' lets it collapse across those seams (the
// texture stretches a little at the edges, which a cartoon look hides).
await doc.transform(weld());
const ratio = Number(target) / count();
for (const mesh of Number(target) > 0 ? root.listMeshes() : []) {
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    const pos = prim.getAttribute('POSITION');
    if (!idx || !pos) continue;
    const want = Math.max(300, Math.floor((idx.getCount() * ratio) / 3) * 3);
    const positions = new Float32Array(pos.getArray());
    const indices = new Uint32Array(idx.getArray());
    let [out2] = MeshoptSimplifier.simplify(indices, positions, 3, want, Number(process.argv[5] ?? 0.2), ['Permissive']);
    if (out2.length > want * 1.3) out2 = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, want, 1)[0];
    idx.setArray(out2);
  }
}
await doc.transform(dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [Number(process.env.TEX ?? 1024), Number(process.env.TEX ?? 1024)], quality: 90 }));
console.log('after', Math.round(count()));
// Pack the geometry small (quantized + meshopt), like the other game models.
await MeshoptEncoder.ready;
await doc.transform(quantize());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const io2 = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await io2.write(out, doc);
