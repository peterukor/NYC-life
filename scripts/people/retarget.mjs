// =====================================================================
// retarget.mjs — moves animations from one skeleton onto another.
//
// WHY
//   The people we use (Quaternius Ultimate Modular Men / Women) come with
//   24 action-game clips only: no sitting, dancing, talking or eating.
//   Quaternius' Universal Animation Library has 84 everyday clips, but on
//   a different skeleton (the Unreal-style mannequin: pelvis, spine_01,
//   upperarm_l…). This file copies those clips onto the modular skeleton
//   (Body, Abdomen, UpperArm.L…), once, at build time.
//
// HOW (the "world delta" method)
//   For every frame, for every bone we can match:
//     1. Work out the source bone's rotation in world space, and how far
//        it has turned from its rest pose (both skeletons rest in a T-pose
//        facing +Z, so "rest" means the same thing on both).
//     2. Turn the matching target bone by that same world-space amount,
//        starting from its own rest pose.
//     3. Convert back to a rotation relative to the target bone's parent,
//        which is what a glTF animation stores.
//   Small differences in the two rest poses (an arm 3° lower, a thigh
//   angled out) are removed first: each target bone is pre-turned so it
//   points the same way as its source bone at rest ("alignment").
//   The hips (target "Body") also copy the source pelvis' movement up,
//   down and sideways, scaled by how much longer or shorter the legs are.
//
// THE FEET ARE SPECIAL
//   On the modular rig the feet (Foot.L / Foot.R) are not children of the
//   shins: they hang off the Root (an IK set-up from Blender). So each foot
//   gets a world position too: wherever the shin's ankle ends up this frame.
//
// Everything here is plain maths on glTF data (via gltf-transform); no
// Blender needed. scripts/build-people-assets.mjs calls it.
// =====================================================================

import * as THREE from 'three';

/** Source (mannequin) bone → target (modular) bone. */
export const BONE_MAP = {
  pelvis: 'Body',
  spine_01: 'Abdomen',
  spine_02: 'Torso',
  spine_03: 'Chest',
  neck_01: 'Neck',
  Head: 'Head',
  clavicle_l: 'Shoulder.L', upperarm_l: 'UpperArm.L', lowerarm_l: 'LowerArm.L', hand_l: 'Wrist.L',
  clavicle_r: 'Shoulder.R', upperarm_r: 'UpperArm.R', lowerarm_r: 'LowerArm.R', hand_r: 'Wrist.R',
  thigh_l: 'UpperLeg.L', calf_l: 'LowerLeg.L', foot_l: 'Foot.L',
  thigh_r: 'UpperLeg.R', calf_r: 'LowerLeg.R', foot_r: 'Foot.R',
};
for (const side of ['l', 'r']) {
  const S = side.toUpperCase();
  for (const [src, dst] of [['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky'], ['thumb', 'Thumb']]) {
    for (let i = 1; i <= 3; i++) BONE_MAP[`${src}_0${i}_${side}`] = `${dst}${i}.${S}`;
  }
}

/**
 * Which child each bone "points at" (used to compare rest directions).
 * Target bones that aren't listed keep their own rest direction.
 */
const AIM = {
  'UpperArm.L': 'LowerArm.L', 'LowerArm.L': 'Wrist.L', 'Wrist.L': 'Middle1.L',
  'UpperArm.R': 'LowerArm.R', 'LowerArm.R': 'Wrist.R', 'Wrist.R': 'Middle1.R',
  'Shoulder.L': 'UpperArm.L', 'Shoulder.R': 'UpperArm.R',
  'UpperLeg.L': 'LowerLeg.L', 'UpperLeg.R': 'LowerLeg.R',
  'Abdomen': 'Torso', 'Torso': 'Chest', 'Chest': 'Neck', 'Neck': 'Head',
};
for (const S of ['L', 'R']) {
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
    AIM[`${f}1.${S}`] = `${f}2.${S}`;
    AIM[`${f}2.${S}`] = `${f}3.${S}`;
  }
}

// ---------------------------------------------------------------------
// Reading a skeleton
// ---------------------------------------------------------------------

/**
 * Rest pose of a skin: for every joint, its rest matrix in world space
 * (from the inverse bind matrices, the true rest pose; node transforms in
 * these files hold whatever pose Blender was in when it exported).
 */
export function readRig(doc) {
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices().getArray();
  const byName = new Map();
  const world = new Map();
  joints.forEach((j, i) => {
    byName.set(j.getName(), j);
    world.set(j.getName(), new THREE.Matrix4().fromArray(ibm, i * 16).invert());
  });
  // Parent of each joint (by name), and the joint order parents-first.
  const parent = new Map();
  const isJoint = new Set(joints);
  for (const j of joints) {
    let p = j.getParentNode();
    parent.set(j.getName(), p && isJoint.has(p) ? p.getName() : null);
  }
  const order = [];
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    const p = parent.get(name);
    if (p) visit(p);
    seen.add(name);
    order.push(name);
  };
  for (const j of joints) visit(j.getName());
  // Rest local = parent⁻¹ · world.
  const local = new Map();
  for (const name of order) {
    const p = parent.get(name);
    const m = p ? new THREE.Matrix4().copy(world.get(p)).invert().multiply(world.get(name)) : world.get(name).clone();
    local.set(name, m);
  }
  return { joints: byName, world, local, parent, order };
}

const pos = (m) => new THREE.Vector3().setFromMatrixPosition(m);
const rot = (m) => {
  const q = new THREE.Quaternion();
  m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return q;
};

// ---------------------------------------------------------------------
// Sampling a source animation
// ---------------------------------------------------------------------

/** Value of one animation sampler at time t (LINEAR / STEP; quats slerped). */
function sample(sampler, t) {
  const times = sampler.getInput().getArray();
  const values = sampler.getOutput().getArray();
  const size = sampler.getOutput().getElementSize();
  const cubic = sampler.getInterpolation() === 'CUBICSPLINE';
  const stride = cubic ? size * 3 : size;
  const off = cubic ? size : 0;
  const n = times.length;
  const at = (i) => Array.from(values.slice(i * stride + off, i * stride + off + size));
  if (t <= times[0]) return at(0);
  if (t >= times[n - 1]) return at(n - 1);
  let i = 0;
  while (i < n - 2 && times[i + 1] < t) i++;
  const a = at(i), b = at(i + 1);
  if (sampler.getInterpolation() === 'STEP') return a;
  const k = (t - times[i]) / (times[i + 1] - times[i]);
  if (size === 4) {
    const qa = new THREE.Quaternion(...a), qb = new THREE.Quaternion(...b);
    return qa.slerp(qb, k).toArray();
  }
  return a.map((v, j) => v + (b[j] - v) * k);
}

/**
 * The source skeleton's world matrices at time t: animated channels where
 * the clip has them, the node's own transform everywhere else.
 */
function sourcePose(srcDoc, anim, t) {
  const tracks = new Map();
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    if (!node) continue;
    if (!tracks.has(node)) tracks.set(node, {});
    tracks.get(node)[ch.getTargetPath()] = ch.getSampler();
  }
  const world = new Map();
  const walk = (node, parentM) => {
    const tr = tracks.get(node) ?? {};
    const T = tr.translation ? sample(tr.translation, t) : node.getTranslation();
    const R = tr.rotation ? sample(tr.rotation, t) : node.getRotation();
    const S = tr.scale ? sample(tr.scale, t) : node.getScale();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...T), new THREE.Quaternion(...R).normalize(), new THREE.Vector3(...S));
    const w = new THREE.Matrix4().multiplyMatrices(parentM, m);
    world.set(node.getName(), w);
    for (const c of node.listChildren()) walk(c, w);
  };
  for (const n of srcDoc.getRoot().listScenes()[0].listChildren()) walk(n, new THREE.Matrix4());
  return world;
}

// ---------------------------------------------------------------------
// The retarget itself
// ---------------------------------------------------------------------

/**
 * Pre-turn of each target bone so its rest direction matches its source
 * bone's rest direction (world space). Identity when they already match.
 */
function alignment(src, tgt) {
  const inv = Object.fromEntries(Object.entries(BONE_MAP).map(([s, t]) => [t, s]));
  const fix = new Map();
  for (const name of tgt.order) {
    const child = AIM[name];
    const s = inv[name], sc = child && inv[child];
    if (!child || !s || !sc || !src.world.has(s) || !src.world.has(sc) || !tgt.world.has(child)) continue;
    const dt = pos(tgt.world.get(child)).sub(pos(tgt.world.get(name))).normalize();
    const ds = pos(src.world.get(sc)).sub(pos(src.world.get(s))).normalize();
    if (dt.lengthSq() < 1e-8 || ds.lengthSq() < 1e-8) continue;
    fix.set(name, new THREE.Quaternion().setFromUnitVectors(dt, ds));
  }
  return fix;
}

/**
 * Retarget one source clip. Returns { name, duration, times, tracks } where
 * tracks maps target joint name → { rotation: Float32Array (xyzw per
 * time), translation?: Float32Array (xyz per time) } in each joint's
 * parent space — ready to write as a glTF animation.
 *
 * opts.fps: sample rate (default 30).
 */
export function retargetClip(srcDoc, src, tgt, anim, opts = {}) {
  const fps = opts.fps ?? 30;
  let duration = 0;
  for (const s of anim.listSamplers()) {
    const t = s.getInput().getArray();
    duration = Math.max(duration, t[t.length - 1]);
  }
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(frames);
  for (let f = 0; f < frames; f++) times[f] = Math.min(duration, f / fps);

  const fix = alignment(src, tgt);
  // Rest world rotation of each target bone after alignment.
  const restT = new Map();
  for (const name of tgt.order) {
    const q = rot(tgt.world.get(name));
    restT.set(name, fix.has(name) ? fix.get(name).clone().multiply(q) : q);
  }
  const srcRestInv = new Map();
  for (const name of Object.keys(BONE_MAP)) if (src.world.has(name)) srcRestInv.set(name, rot(src.world.get(name)).invert());
  const fromSrc = Object.fromEntries(Object.entries(BONE_MAP).map(([s, t]) => [t, s]));

  // Leg length ratio (target hips height / source pelvis height).
  const legK = pos(tgt.world.get('Body')).y / pos(src.world.get('pelvis')).y;
  const srcPelvis0 = pos(src.world.get('pelvis'));
  const tgtBody0 = pos(tgt.world.get('Body'));

  // The ankle in each foot's own frame (for the IK-style feet).
  const ankle = {};
  for (const S of ['L', 'R']) {
    const shin = tgt.world.get(`LowerLeg.${S}`);
    const foot = tgt.world.get(`Foot.${S}`);
    // The shin's tail: its own length along its Y axis = the distance to
    // where the foot starts in its parent-of-skin space; use the foot's
    // height above the ground instead: the shin's world axis projected
    // down to ankle height (10 cm), which is where the source ankle sits.
    const shinPos = pos(shin);
    const shinDir = new THREE.Vector3(0, 1, 0).applyQuaternion(rot(shin));
    const ankleY = 0.1;
    const len = (shinPos.y - ankleY) / Math.max(0.2, -shinDir.y);
    const a = shinPos.clone().addScaledVector(shinDir, len);
    ankle[S] = {
      inShin: a.clone().applyMatrix4(new THREE.Matrix4().copy(shin).invert()),
      inFoot: a.clone().applyMatrix4(new THREE.Matrix4().copy(foot).invert()),
    };
  }

  const tracks = new Map();
  for (const name of tgt.order) tracks.set(name, { rotation: new Float32Array(frames * 4), translation: null });
  tracks.get('Body').translation = new Float32Array(frames * 3);
  tracks.get('Foot.L').translation = new Float32Array(frames * 3);
  tracks.get('Foot.R').translation = new Float32Array(frames * 3);

  const W = new Map();
  const v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
  for (let f = 0; f < frames; f++) {
    const sw = sourcePose(srcDoc, anim, times[f]);
    W.clear();
    for (const name of tgt.order) {
      const p = tgt.parent.get(name);
      const parentW = p ? W.get(p) : new THREE.Matrix4();
      const restLocal = tgt.local.get(name);
      // World rotation.
      let q;
      const s = fromSrc[name];
      if (s && sw.has(s) && srcRestInv.has(s)) {
        q = rot(sw.get(s)).multiply(srcRestInv.get(s)).multiply(restT.get(name));
      } else {
        q = rot(parentW).multiply(rot(restLocal));
      }
      // World position.
      let at;
      if (name === 'Body') {
        const d = pos(sw.get('pelvis')).sub(srcPelvis0).multiplyScalar(legK);
        at = tgtBody0.clone().add(d);
      } else if (name === 'Foot.L' || name === 'Foot.R') {
        const S = name.slice(-1);
        const shinW = W.get(`LowerLeg.${S}`);
        const a = ankle[S].inShin.clone().applyMatrix4(shinW);
        at = a.sub(ankle[S].inFoot.clone().applyQuaternion(q));
      } else {
        at = pos(restLocal).applyMatrix4(parentW);
      }
      const w = new THREE.Matrix4().compose(at, q, s1);
      W.set(name, w);
      const local = new THREE.Matrix4().copy(parentW).invert().multiply(w);
      const lq = rot(local);
      tracks.get(name).rotation.set([lq.x, lq.y, lq.z, lq.w], f * 4);
      const tr = tracks.get(name).translation;
      if (tr) {
        v.setFromMatrixPosition(local);
        tr.set([v.x, v.y, v.z], f * 3);
      }
    }
  }
  // Keep quaternions on one hemisphere so interpolation never spins the
  // long way round.
  for (const { rotation } of tracks.values()) {
    for (let f = 1; f < frames; f++) {
      const a = (f - 1) * 4, b = f * 4;
      const dot = rotation[a] * rotation[b] + rotation[a + 1] * rotation[b + 1] + rotation[a + 2] * rotation[b + 2] + rotation[a + 3] * rotation[b + 3];
      if (dot < 0) for (let k = 0; k < 4; k++) rotation[b + k] = -rotation[b + k];
    }
  }
  return { name: anim.getName(), duration, times, tracks };
}

/** Write a retargeted clip into a gltf-transform Document (target nodes by name). */
export function writeClip(doc, clip, nodesByName, rename = clip.name) {
  const anim = doc.createAnimation(rename);
  const buffer = doc.getRoot().listBuffers()[0];
  const input = doc.createAccessor().setType('SCALAR').setArray(clip.times).setBuffer(buffer);
  for (const [name, tr] of clip.tracks) {
    const node = nodesByName.get(name);
    if (!node) continue;
    const rs = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType('VEC4').setArray(tr.rotation).setBuffer(buffer)).setInterpolation('LINEAR');
    anim.addSampler(rs).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(rs));
    if (tr.translation) {
      const ts = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType('VEC3').setArray(tr.translation).setBuffer(buffer)).setInterpolation('LINEAR');
      anim.addSampler(ts).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('translation').setSampler(ts));
    }
  }
  return anim;
}

/** Put every joint node of a rig into its true rest pose (bind pose). */
export function resetToRest(rig) {
  for (const [name, node] of rig.joints) {
    const m = rig.local.get(name);
    const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(t, q, s);
    node.setTranslation(t.toArray()).setRotation(q.toArray()).setScale([1, 1, 1]);
  }
}
