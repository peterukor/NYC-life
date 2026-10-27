// =====================================================================
// people-anims.ts — reads the people's animations (the .anim files made
// by scripts/people/anim-pack.mjs) into three.js AnimationClips.
//
// The file is a small JSON index followed by three meshopt-compressed
// blocks: key times, rotations (quaternions) and positions. The meshopt
// decoder is the same one the game already uses for its .glb models.
// =====================================================================

import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

interface AnimIndex {
  fps: number;
  bones: string[];
  clips: { name: string; duration: number; tracks: [number, number, number][] }[];
  blocks: { time: [number, number]; rot: [number, number]; pos: [number, number] };
  posScale: number;
}

/** Load one .anim file → clips by name. */
export async function loadPeopleAnims(url: string): Promise<Map<string, THREE.AnimationClip>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return parsePeopleAnims(new Uint8Array(await res.arrayBuffer()));
}

/** Decode the bytes of an .anim file (see the format in anim-pack.mjs). */
export async function parsePeopleAnims(bytes: Uint8Array): Promise<Map<string, THREE.AnimationClip>> {
  await MeshoptDecoder.ready;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = view.getUint32(0, true);
  const index = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + jsonLen))) as AnimIndex;
  let o = 4 + jsonLen;
  const block = (len: number) => {
    const b = bytes.subarray(o, o + len);
    o += len;
    return b;
  };
  const [tCount, tLen] = index.blocks.time;
  const [rCount, rLen] = index.blocks.rot;
  const [pCount, pLen] = index.blocks.pos;
  const timeBytes = new Uint8Array(tCount * 2);
  MeshoptDecoder.decodeVertexBuffer(timeBytes, tCount / 2, 4, block(tLen));
  const times = new Uint16Array(timeBytes.buffer);
  const rotBytes = new Uint8Array(rCount * 8);
  MeshoptDecoder.decodeVertexBuffer(rotBytes, rCount, 8, block(rLen), 'QUATERNION');
  const rots = new Int16Array(rotBytes.buffer);
  const posBytes = new Uint8Array(pCount * 8);
  if (pCount) MeshoptDecoder.decodeVertexBuffer(posBytes, pCount, 8, block(pLen));
  const poss = new Int16Array(posBytes.buffer);

  // glTF loaders strip "." from bone names (UpperArm.L → UpperArmL).
  const bone = index.bones.map((b) => THREE.PropertyBinding.sanitizeNodeName(b));
  const clips = new Map<string, THREE.AnimationClip>();
  let ti = 0, ri = 0, pi = 0;
  for (const c of index.clips) {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [b, kind, keys] of c.tracks) {
      const t = new Float32Array(keys);
      for (let k = 0; k < keys; k++) t[k] = times[ti + k] / index.fps;
      ti += keys;
      if (kind === 0) {
        const v = new Float32Array(keys * 4);
        for (let k = 0; k < keys * 4; k++) v[k] = rots[ri * 4 + k] / 32767;
        ri += keys;
        tracks.push(new THREE.QuaternionKeyframeTrack(`${bone[b]}.quaternion`, t, v));
      } else {
        const v = new Float32Array(keys * 3);
        for (let k = 0; k < keys; k++) for (let a = 0; a < 3; a++) v[k * 3 + a] = poss[(pi + k) * 4 + a] * index.posScale;
        pi += keys;
        tracks.push(new THREE.VectorKeyframeTrack(`${bone[b]}.position`, t, v));
      }
    }
    clips.set(c.name, new THREE.AnimationClip(c.name, c.duration, tracks));
  }
  return clips;
}
