// =====================================================================
// hair.mjs — extra hairstyles, built from the head itself.
//
// The modular packs give each face its own hairdo (a side part, a bob, a
// mohawk…) but no afros, braids, locs, puffs, cornrows or curls. These
// are made here, at build time, and pinned to the head bone. They sit on
// the "bare" head (the base face with its own hair removed).
//
// HOW (the scalp)
//   Every style starts from the SCALP: the bare head's own triangles above
//   the hairline, copied and pushed out along the surface by a few
//   millimetres. Because it is made from the head, it fits exactly — no
//   gaps, no hair across the eyes. A style then:
//     • pushes the scalp out further where it wants volume (an afro grows
//       towards the crown and the back, stays thin at the hairline), and/or
//     • adds pieces placed ON the scalp (puffs, a bun, braids, curls),
//       found by casting a ray from the middle of the head outwards.
//
// TO ADD A STYLE: add { id, build(scalp) } to HAIR_STYLES, returning
// { positions, indices } in metres (rest pose). It then shows up as a
// hairstyle in the game (data/wardrobe.ts lists the ids).
// =====================================================================

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Small repeatable noise (no Math.random: builds stay identical). */
const hash = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Build the scalp from the bare head.
 * head: { P (positions), S (slots), I (indices) } as flat arrays.
 * slots: the SLOT numbers (skin, eyes).
 */
export function makeScalp(head, slots) {
  // Where the eyes are: the hairline is measured from them.
  let ex = 0, ey = 0, ez = 0, ne = 0;
  const box = new THREE.Box3();
  for (let i = 0; i < head.S.length; i++) {
    const v = new THREE.Vector3(head.P[i * 3], head.P[i * 3 + 1], head.P[i * 3 + 2]);
    if (head.S[i] === slots.eyes) { ex += v.x; ey += v.y; ez += v.z; ne++; }
    if (head.S[i] === slots.skin) box.expandByPoint(v);
  }
  const eye = new THREE.Vector3(ex / ne, ey / ne, ez / ne);
  const top = box.max.y;
  const center = new THREE.Vector3((box.min.x + box.max.x) / 2, eye.y + 0.01, (box.min.z + box.max.z) / 2 - 0.01);
  const half = new THREE.Vector3((box.max.x - box.min.x) / 2, top - center.y, (box.max.z - box.min.z) / 2);
  // Hairline height above the eyes: high at the front (a forehead), at eye
  // level over the ears, lower at the nape.
  const hairline = (v) => {
    const front = (v.z - center.z) / half.z; // -1 back … +1 front
    const side = Math.abs(v.x - center.x) / half.x; // 0 middle … 1 side
    const lift = front > 0 ? 0.045 * smooth(0, 0.7, front) * (1 - 0.6 * smooth(0.55, 1, side)) : -0.075 * smooth(0, 0.9, -front);
    return eye.y + 0.012 + lift + (side > 0.86 && front > -0.3 ? 0.03 : 0); // over the ears
  };
  // Scalp triangles: all three corners above the hairline, skin only.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(head.P), 3));
  g.setIndex(head.I.filter((_, t) => true));
  const idx = [];
  const v = new THREE.Vector3();
  const above = (i) => {
    v.set(head.P[i * 3], head.P[i * 3 + 1], head.P[i * 3 + 2]);
    return head.S[i] === slots.skin && v.y > hairline(v);
  };
  for (let t = 0; t < head.I.length; t += 3) {
    const a = head.I[t], b = head.I[t + 1], c = head.I[t + 2];
    if (above(a) && above(b) && above(c)) idx.push(a, b, c);
  }
  const scalp = new THREE.BufferGeometry();
  scalp.setAttribute('position', new THREE.BufferAttribute(new Float32Array(head.P), 3));
  scalp.setIndex(idx);
  // Weld so the offset moves shared corners together, and smooth normals.
  const welded = mergeVertices(scalp, 1e-4);
  // Two loop subdivisions' worth of smoothness without the cost: split
  // each triangle in four once (looks less blocky when pushed out).
  const fine = subdivide(welded);
  fine.computeVertexNormals();
  // The whole bare head too (for "where is the skin in this direction").
  const whole = new THREE.BufferGeometry();
  whole.setAttribute('position', new THREE.BufferAttribute(new Float32Array(head.P), 3));
  whole.setIndex(Array.from(head.I));
  return { geometry: fine, whole, center, half, eye, hairline };
}

/** Split every triangle into four (midpoints shared). */
function subdivide(geo) {
  const p = geo.getAttribute('position');
  const index = geo.index.array;
  const pos = Array.from(p.array);
  const mid = new Map();
  const midpoint = (a, b) => {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (mid.has(k)) return mid.get(k);
    const i = pos.length / 3;
    pos.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2);
    mid.set(k, i);
    return i;
  };
  const out = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(out);
  return g;
}

/**
 * A copy of the scalp pushed out along its normals by thickness(v, n)
 * metres, as a closed-enough shell (just the outer surface: it sits on
 * the skin, so its underside is never seen).
 */
function shell(scalp, thickness) {
  const g = scalp.geometry.clone();
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    nn.fromBufferAttribute(n, i);
    const t = thickness(v, nn);
    p.setXYZ(i, v.x + nn.x * t, v.y + nn.y * t, v.z + nn.z * t);
  }
  g.deleteAttribute('normal');
  return g;
}

/** A point on the scalp shell in a direction from the head's centre. */
function onScalp(scalp, dir, out = 0.0) {
  const ray = new THREE.Raycaster(scalp.center.clone(), dir.clone().normalize(), 0, 1);
  const mesh = new THREE.Mesh(scalp.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const hit = ray.intersectObject(mesh)[0];
  const p = hit ? hit.point : scalp.center.clone().addScaledVector(dir.clone().normalize(), scalp.half.y);
  return p.addScaledVector(dir.clone().normalize(), out);
}

/** A low-poly ellipsoid with a little lumpiness. */
function blob(center, radii, detail = 1, lump = 0.06, seed = 0) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash(x + seed, y, z) - 0.5) * 2 * lump;
    p.setXYZ(i, center.x + x * radii.x * k, center.y + y * radii.y * k, center.z + z * radii.z * k);
  }
  return g;
}

/** A tapered tube from a to b (braids, locs, a ponytail). */
function tube(a, b, r0, r1, sides = 5) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, false);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** A tube through several points (a braid that follows the head). */
function chain(points, r0, r1, sides = 4) {
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const k0 = i / (points.length - 1), k1 = (i + 1) / (points.length - 1);
    parts.push(tube(points[i], points[i + 1], r0 + (r1 - r0) * k0, r0 + (r1 - r0) * k1, sides));
    parts.push(blob(points[i + 1], new THREE.Vector3(1, 1, 1).multiplyScalar(r0 + (r1 - r0) * k1), 0, 0));
  }
  return parts;
}

const toArrays = (geos) => {
  const g = mergeGeometries(geos.map((x) => {
    const y = x.index ? x : mergeVertices(x, 1e-6);
    for (const k of Object.keys(y.attributes)) if (k !== 'position') y.deleteAttribute(k);
    return y;
  }));
  return { positions: new Float32Array(g.getAttribute('position').array), indices: new Uint32Array(g.index.array) };
};

/**
 * Fit a hair volume to the hairline: any corner that would sit over the
 * face or ears slides up the head (same direction around, tilted upwards)
 * until it reaches the hairline, and stays a few millimetres off the skin.
 * The volume then rises cleanly out of the hairline instead of covering
 * the forehead. Corners inside the head are pushed out to the skin.
 */
function wrapToHairline(s, geo) {
  const p = geo.getAttribute('position');
  const head = new THREE.Mesh(s.whole, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  const skinAt = (dir) => {
    ray.set(s.center, dir);
    ray.far = 1;
    const hits = ray.intersectObject(head);
    return hits.length ? hits[hits.length - 1].point : null;
  };
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    d.copy(v).sub(s.center).normalize();
    let hit = skinAt(d);
    if (hit && hit.y >= s.hairline(hit)) {
      const minR = hit.distanceTo(s.center) + 0.006;
      if (v.distanceTo(s.center) < minR) v.copy(s.center).addScaledVector(d, minR);
      p.setXYZ(i, v.x, v.y, v.z);
      continue;
    }
    // Tilt up until the skin there is hair, not face.
    const az = Math.atan2(d.x, d.z);
    let el = Math.asin(Math.max(-1, Math.min(1, d.y)));
    for (let k = 0; k < 40; k++) {
      el = Math.min(Math.PI / 2, el + 0.05);
      d.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      hit = skinAt(d);
      if (hit && hit.y >= s.hairline(hit)) break;
    }
    const at = (hit ?? s.center.clone().addScaledVector(d, s.half.y)).clone().addScaledVector(d, 0.006);
    p.setXYZ(i, at.x, at.y, at.z);
  }
  p.needsUpdate = true;
  return geo;
}

/** How high a point sits between the hairline and the crown (0…1). */
const height = (s, v) => smooth(s.hairline(v), s.center.y + s.half.y, v.y);
/** How far towards the back of the head (0 front … 1 back). */
const backness = (s, v) => smooth(0.3, -0.9, (v.z - s.center.z) / s.half.z);

export const HAIR_STYLES = [
  { id: 'buzz', build: (s) => toArrays([shell(s, () => 0.006)]) },
  {
    id: 'fade',
    build: (s) => toArrays([shell(s, (v) => 0.004 + 0.022 * height(s, v) * (1 - 0.5 * smooth(0.6, 1, Math.abs(v.x - s.center.x) / s.half.x)))]),
  },
  {
    id: 'afro',
    // A round cloud of hair, set up and back, cut away wherever it would
    // cover the face or ears, over a close crop that draws the hairline.
    build: (s) => {
      const c = s.center.clone().add(new THREE.Vector3(0, s.half.y * 0.42, -s.half.z * 0.1));
      const r = new THREE.Vector3(s.half.x * 1.62, s.half.y * 1.38, s.half.z * 1.42);
      return toArrays([shell(s, (v) => 0.008 + 0.012 * height(s, v)), wrapToHairline(s, blob(c, r, 2, 0.05))]);
    },
  },
  {
    id: 'curls',
    build: (s) => {
      const parts = [shell(s, (v) => 0.012 + 0.018 * height(s, v))];
      // Evenly spread curls (a Fibonacci spiral over the top half).
      const n = 60;
      for (let i = 0; i < n; i++) {
        const y = 1 - (i + 0.5) / n * 1.15;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const a = i * 2.39996;
        const p = onScalp(s, new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), 0.014);
        if (p.y < s.hairline(p) + 0.008) continue;
        parts.push(blob(p, new THREE.Vector3(1, 1, 1).multiplyScalar(0.02 + hash(i, 5, 6) * 0.008), 0, 0.12, i));
      }
      return toArrays(parts);
    },
  },
  {
    id: 'puffs',
    build: (s) => {
      const parts = [shell(s, (v) => 0.008 + 0.01 * height(s, v))];
      for (const side of [-1, 1]) parts.push(blob(onScalp(s, new THREE.Vector3(side * 0.75, 0.75, -0.15), 0.045), new THREE.Vector3(0.068, 0.062, 0.066), 1, 0.08, side));
      return toArrays(parts);
    },
  },
  {
    id: 'bun',
    build: (s) => toArrays([shell(s, (v) => 0.009 + 0.008 * height(s, v)), blob(onScalp(s, new THREE.Vector3(0, 0.85, -0.5), 0.035), new THREE.Vector3(0.055, 0.05, 0.055), 1, 0.05)]),
  },
  {
    id: 'ponytail',
    build: (s) => {
      const tie = onScalp(s, new THREE.Vector3(0, 0.45, -1), 0.01);
      const mid = tie.clone().add(new THREE.Vector3(0, -0.07, -0.06));
      const tip = tie.clone().add(new THREE.Vector3(0, -0.24, -0.05));
      return toArrays([shell(s, (v) => 0.009 + 0.008 * height(s, v)), blob(tie, new THREE.Vector3(0.03, 0.03, 0.03), 1, 0.02), ...chain([tie, mid, tip], 0.034, 0.012, 6)]);
    },
  },
  {
    id: 'braids',
    // Box braids to the shoulder blades, all round the back and sides.
    build: (s) => {
      const parts = [shell(s, (v) => 0.01 + 0.008 * height(s, v))];
      const n = 15;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.6 + (i / (n - 1)) * Math.PI * 1.2;
        const d = new THREE.Vector3(Math.sin(a), -0.05, -Math.cos(a));
        const root = onScalp(s, d, 0.005);
        const out = new THREE.Vector3(d.x, 0, d.z).normalize();
        const p1 = root.clone().addScaledVector(out, 0.03).add(new THREE.Vector3(0, -0.1, 0));
        const p2 = p1.clone().addScaledVector(out, 0.03).add(new THREE.Vector3(0, -0.2, -0.02));
        parts.push(...chain([root, p1, p2], 0.013, 0.009, 4));
      }
      return toArrays(parts);
    },
  },
  {
    id: 'locs',
    // Shoulder-length locs, thicker than braids.
    build: (s) => {
      const parts = [shell(s, (v) => 0.014 + 0.012 * height(s, v))];
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.68 + (i / (n - 1)) * Math.PI * 1.36;
        const d = new THREE.Vector3(Math.sin(a), 0.25, -Math.cos(a));
        const root = onScalp(s, d, 0.01);
        const out = new THREE.Vector3(d.x, 0, d.z).normalize();
        const p1 = root.clone().addScaledVector(out, 0.035).add(new THREE.Vector3(0, -0.09, 0));
        const p2 = p1.clone().addScaledVector(out, 0.01).add(new THREE.Vector3(0, -0.13, 0));
        parts.push(...chain([root, p1, p2], 0.018, 0.015, 5));
      }
      return toArrays(parts);
    },
  },
  {
    id: 'cornrows',
    // Rows running front to back over a tight scalp.
    build: (s) => {
      const parts = [shell(s, () => 0.005)];
      const rows = 7;
      for (let r = 0; r < rows; r++) {
        const x = -0.7 + (r / (rows - 1)) * 1.4;
        const pts = [];
        for (let k = 0; k <= 7; k++) {
          const t = k / 7;
          const ang = -0.15 + t * Math.PI * 0.95; // front-top → back
          const p = onScalp(s, new THREE.Vector3(x * Math.max(0.3, Math.sin(ang + 0.2)), Math.sin(ang), Math.cos(ang)), 0.006);
          if (p.y > s.hairline(p) - 0.005) pts.push(p);
        }
        if (pts.length > 1) parts.push(...chain(pts, 0.011, 0.009, 4));
      }
      return toArrays(parts);
    },
  },
];
