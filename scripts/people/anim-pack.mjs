// =====================================================================
// anim-pack.mjs — writes the people's animations as one small binary.
//
// WHY NOT KEEP THEM IN THE .glb?
//   A glTF file describes every animation track in JSON (a channel, a
//   sampler and two accessors each). 39 clips × ~30 tracks is over a
//   thousand tracks: the JSON alone was ~420 KB, bigger than the motion
//   data. This format stores the same keys in three compressed blocks
//   plus a tiny index. src/world/people-anims.ts reads it back.
//
// FORMAT (little-endian)
//   u32 index byte length, then the index as UTF-8 JSON:
//     { bones: [names], clips: [{ name, duration, tracks: [[bone, kind, keys]] }],
//       blocks: { time: [count, bytes], rot: [count, bytes], pos: [count, bytes] },
//       posScale }
//     kind: 0 = rotation (quaternion), 1 = translation.
//   Then the three blocks, each meshopt-compressed (EXT_meshopt_compression's
//   vertex codec, which the game already ships the decoder for):
//     time: every key's time, as u16 thirtieths of a second, padded to 4 bytes
//     rot:  quaternions, 16-bit, meshopt QUATERNION filter (8 bytes each)
//     pos:  translations, 16-bit (value / posScale), padded to 8 bytes
//   Keys come in order: clip by clip, track by track.
// =====================================================================

import { MeshoptEncoder } from 'meshoptimizer';

const FPS = 30;

/** Pack every animation of a gltf-transform Document. Returns a Uint8Array. */
export async function packAnimations(doc) {
  await MeshoptEncoder.ready;
  const bones = [];
  const boneIndex = new Map();
  const clips = [];
  const times = [], rots = [], poss = [];
  let maxPos = 0;
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) if (ch.getTargetPath() === 'translation') {
      for (const v of ch.getSampler().getOutput().getArray()) maxPos = Math.max(maxPos, Math.abs(v));
    }
  }
  const posScale = Math.max(maxPos, 0.01) / 32767;
  for (const anim of doc.getRoot().listAnimations()) {
    const tracks = [];
    let duration = 0;
    for (const ch of anim.listChannels()) {
      const path = ch.getTargetPath();
      if (path !== 'rotation' && path !== 'translation') continue;
      const name = ch.getTargetNode().getName();
      if (!boneIndex.has(name)) { boneIndex.set(name, bones.length); bones.push(name); }
      const s = ch.getSampler();
      const t = s.getInput().getArray();
      const out = s.getOutput();
      const v = out.getArray();
      const norm = out.getNormalized() ? 1 / 32767 : 1;
      duration = Math.max(duration, t[t.length - 1]);
      for (let i = 0; i < t.length; i++) times.push(Math.round(t[i] * FPS));
      if (path === 'rotation') {
        for (let i = 0; i < t.length; i++) rots.push(v[i * 4] * norm, v[i * 4 + 1] * norm, v[i * 4 + 2] * norm, v[i * 4 + 3] * norm);
      } else {
        for (let i = 0; i < t.length; i++) poss.push(Math.round(v[i * 3] / posScale), Math.round(v[i * 3 + 1] / posScale), Math.round(v[i * 3 + 2] / posScale), 0);
      }
      tracks.push([boneIndex.get(name), path === 'rotation' ? 0 : 1, t.length]);
    }
    clips.push({ name: anim.getName(), duration: +duration.toFixed(4), tracks });
  }
  // Times: u16, padded so the count is even (the codec wants 4-byte rows).
  if (times.length % 2) times.push(0);
  const timeBytes = new Uint8Array(new Uint16Array(times).buffer);
  const timeBlock = MeshoptEncoder.encodeVertexBuffer(timeBytes, times.length / 2, 4);
  const rotCount = rots.length / 4;
  const rotFiltered = MeshoptEncoder.encodeFilterQuat(new Float32Array(rots), rotCount, 8, 12);
  const rotBlock = MeshoptEncoder.encodeVertexBuffer(rotFiltered, rotCount, 8);
  const posCount = poss.length / 4;
  const posBlock = posCount ? MeshoptEncoder.encodeVertexBuffer(new Uint8Array(new Int16Array(poss).buffer), posCount, 8) : new Uint8Array(0);
  const index = {
    fps: FPS,
    bones,
    clips,
    blocks: { time: [times.length, timeBlock.length], rot: [rotCount, rotBlock.length], pos: [posCount, posBlock.length] },
    posScale,
  };
  const json = new TextEncoder().encode(JSON.stringify(index));
  const out = new Uint8Array(4 + json.length + timeBlock.length + rotBlock.length + posBlock.length);
  new DataView(out.buffer).setUint32(0, json.length, true);
  let o = 4;
  for (const part of [json, timeBlock, rotBlock, posBlock]) { out.set(part, o); o += part.length; }
  return out;
}
