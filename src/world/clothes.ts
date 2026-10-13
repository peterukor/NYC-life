// =====================================================================
// clothes.ts — real clothes on the player (not painted on).
//
// Peter, 2026-10-13: "No painted clothes please." Every garment is its
// own 3D shape that moves with the body:
//
//   • SHELLS grow out of the body itself. A top is the torso and arms
//     (cut at the hem and the sleeve length), pushed out along the
//     surface by the cloth's thickness and skinned to the SAME bones as
//     the skin under it, so it bends at the elbows and sways with the
//     walk. Its edges roll into thick cartoon hems and cuffs, and the
//     gap back to the body is closed, so it reads as cloth, not paint.
//   • RIGID PIECES are modelled in the character's rest pose and stuck
//     to one bone: the hood bunched behind the neck, a kangaroo pocket,
//     collars, buttons, belts, sneakers on the feet, skirts (blended
//     between the hips and the thighs), hats, glasses, a backpack.
//
// One outfit = ONE extra skinned mesh (one draw call) on the player.
// The skin under clothes is hidden; skin that no garment covers is
// painted skin colour, so a tank top really shows bare arms.
//
// THE REST POSE (bind pose) of the Quaternius bodies: a T-pose, facing
// +z, arms straight out along x. Heights here are measured as u (0 =
// soles of the feet, 1 = base of the neck) and arm reach as a (0 =
// middle of the chest, 1 = fingertips), so the rules fit every body.
//
// TO ADD A GARMENT: give the wardrobe item its shape settings (sleeve,
// hood, open, dress, leg, skirt, high, style…) in data/wardrobe.ts.
// New KINDS of shapes are added in buildOutfit() below.
// =====================================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { itemOf, type BottomItem } from '../data/wardrobe.ts';
import type { Look } from '../sim/types.ts';

/** Slots baked into the folk vertices (scripts/build-folk-assets.mjs). */
const SLOT_EYES = 1;
const SLOT_HAIR = 2;

type Cat = 'torso' | 'arm' | 'hand' | 'leg' | 'foot' | 'head' | 'other';
const catOf = (bone: string): Cat => {
  const b = bone.replace(/[^A-Za-z]/g, '');
  if (/^(Hips|Body|Abdomen|Torso|ShoulderL|ShoulderR)$/.test(b)) return 'torso';
  if (/^(UpperArm|LowerArm)/.test(b)) return 'arm';
  if (/^Fist/.test(b)) return 'hand';
  if (/^(UpperLeg|LowerLeg)/.test(b)) return 'leg';
  if (/^Foot/.test(b)) return 'foot';
  if (/^(Neck|Head)$/.test(b)) return 'head';
  return 'other';
};

/** Everything we need about one body model in its rest pose (worked out once). */
interface Body {
  n: number;
  pos: Float32Array;
  normal: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  slot: Uint8Array;
  cat: Cat[];
  /** Mostly moved by the neck bone (not the head). */
  neck: Uint8Array;
  index: Uint32Array;
  /** Height of the feet / base of the neck, half-span of the arms. */
  footY: number;
  neckY: number;
  reach: number;
  /** Chest depth at the front (z of the front of the torso). */
  frontZ: number;
  bone: (name: string) => number;
  /** Rest-pose point of a bone (the average of the vertices it mostly moves). */
  boneCentre: (name: string) => THREE.Vector3;
}

const bodies = new WeakMap<THREE.BufferGeometry, Body>();

function bodyOf(mesh: THREE.SkinnedMesh, src: THREE.BufferGeometry): Body {
  const hit = bodies.get(src);
  if (hit) return hit;
  const P = src.getAttribute('position');
  const SI = src.getAttribute('skinIndex');
  const SW = src.getAttribute('skinWeight');
  const SL = src.getAttribute('_slot') ?? src.getAttribute('_SLOT');
  const n = P.count;
  const pos = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const slot = new Uint8Array(n);
  const names = mesh.skeleton.bones.map((b) => b.name);
  const clean = names.map((s) => s.replace(/[^A-Za-z]/g, ''));
  const cat: Cat[] = [];
  const neck = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = P.getX(i);
    pos[i * 3 + 1] = P.getY(i);
    pos[i * 3 + 2] = P.getZ(i);
    let best = 0;
    for (let k = 0; k < 4; k++) {
      skinIndex[i * 4 + k] = SI.getComponent(i, k);
      skinWeight[i * 4 + k] = SW.getComponent(i, k);
      if (skinWeight[i * 4 + k] > skinWeight[i * 4 + best]) best = k;
    }
    slot[i] = SL ? Math.round(SL.getX(i)) : 0;
    cat.push(catOf(names[skinIndex[i * 4 + best]] ?? ''));
    neck[i] = clean[skinIndex[i * 4 + best]] === 'Neck' ? 1 : 0;
  }
  const index = src.getIndex() ? new Uint32Array(src.getIndex()!.array) : Uint32Array.from({ length: n }, (_, i) => i);
  // Smooth normals, welded across seams (the model is split by colour).
  const key = (i: number) => `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  }
  const acc = new Float32Array(n * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const [i0, i1, i2] = [index[t], index[t + 1], index[t + 2]];
    a.fromArray(pos, i0 * 3);
    b.fromArray(pos, i1 * 3).sub(a);
    c.fromArray(pos, i2 * 3).sub(a);
    const fn = b.cross(c); // area-weighted
    for (const i of [i0, i1, i2]) {
      acc[i * 3] += fn.x;
      acc[i * 3 + 1] += fn.y;
      acc[i * 3 + 2] += fn.z;
    }
  }
  const normal = new Float32Array(n * 3);
  for (const list of groups.values()) {
    const s = new THREE.Vector3();
    for (const i of list) s.add(new THREE.Vector3(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]));
    s.normalize();
    for (const i of list) normal.set([s.x, s.y, s.z], i * 3);
  }
  // Measurements.
  let footY = Infinity, neckY = -Infinity, reach = 0, frontZ = 0;
  for (let i = 0; i < n; i++) {
    const y = pos[i * 3 + 1];
    if (cat[i] === 'foot') footY = Math.min(footY, y);
    if (cat[i] === 'head' && clean[skinIndex[i * 4]] === 'Neck') neckY = Math.max(neckY, y);
    if (cat[i] === 'hand') reach = Math.max(reach, Math.abs(pos[i * 3]));
    if (cat[i] === 'torso') frontZ = Math.max(frontZ, pos[i * 3 + 2]);
  }
  if (!isFinite(neckY)) {
    // No pure neck vertices: the lowest head vertex.
    neckY = Infinity;
    for (let i = 0; i < n; i++) if (cat[i] === 'head') neckY = Math.min(neckY, pos[i * 3 + 1]);
  }
  const centres = new Map<string, THREE.Vector3>();
  const body: Body = {
    n, pos, normal, skinIndex, skinWeight, slot, cat, neck, index, footY, neckY, reach, frontZ,
    bone: (name) => clean.indexOf(name.replace(/[^A-Za-z]/g, '')),
    boneCentre: (name) => {
      const hitC = centres.get(name);
      if (hitC) return hitC;
      const bi = clean.indexOf(name.replace(/[^A-Za-z]/g, ''));
      const s = new THREE.Vector3();
      let m = 0;
      for (let i = 0; i < n; i++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (skinWeight[i * 4 + k] > skinWeight[i * 4 + best]) best = k;
        if (skinIndex[i * 4 + best] === bi) {
          s.x += pos[i * 3];
          s.y += pos[i * 3 + 1];
          s.z += pos[i * 3 + 2];
          m++;
        }
      }
      if (m) s.divideScalar(m);
      centres.set(name, s);
      return s;
    },
  };
  bodies.set(src, body);
  return body;
}

// ---------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------

/** A growing list of skinned, coloured triangles (one outfit). */
class Sewing {
  pos: number[] = [];
  col: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];
  private c = new THREE.Color();

  vert(x: number, y: number, z: number, color: THREE.ColorRepresentation, si: ArrayLike<number>, sw: ArrayLike<number>): number {
    this.c.set(color);
    this.pos.push(x, y, z);
    this.col.push(this.c.r, this.c.g, this.c.b);
    for (let k = 0; k < 4; k++) {
      this.si.push(si[k] ?? 0);
      this.sw.push(sw[k] ?? 0);
    }
    return this.pos.length / 3 - 1;
  }

  /** A rigid piece: any geometry, already in rest-pose space, stuck to one bone (or blended with `blend`). */
  rigid(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, bone: number, blend?: (p: THREE.Vector3) => [number[], number[]]): void {
    const g = geo.index ? geo : geo;
    const P = g.getAttribute('position');
    const base = this.pos.length / 3;
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const [si, sw] = blend ? blend(v) : [[bone, 0, 0, 0], [1, 0, 0, 0]];
      this.vert(v.x, v.y, v.z, color, si, sw);
    }
    const I = g.getIndex();
    if (I) for (let i = 0; i < I.count; i++) this.idx.push(base + I.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    geo.dispose();
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

interface ShellSpec {
  /** Which body vertices this garment covers. */
  covers: (i: number) => boolean;
  /** How far the cloth stands off the skin (fraction of body height). */
  thick: number;
  /** Extra thickness at the hems and cuffs (the rolled edge). */
  hem: number;
  color: string;
  /** Per-vertex colour detail (stripes, seams): return a colour or null for the base. */
  detail?: (i: number, p: THREE.Vector3) => string | null;
  /** Extra puff per vertex (puffer quilting), as a fraction of thick. */
  puff?: (p: THREE.Vector3) => number;
}

/** A shell garment: the covered part of the body, pushed out, with rolled hems. Marks covered vertices. */
function shell(s: Sewing, b: Body, H: number, spec: ShellSpec, covered: Uint8Array): void {
  const tris: number[] = [];
  for (let t = 0; t < b.index.length; t += 3) {
    const i0 = b.index[t], i1 = b.index[t + 1], i2 = b.index[t + 2];
    if (spec.covers(i0) && spec.covers(i1) && spec.covers(i2)) tris.push(i0, i1, i2);
  }
  if (!tris.length) return;
  // Boundary edges (used by one kept triangle), by welded position, so colour seams don't count.
  const pkey = (i: number) => `${b.pos[i * 3].toFixed(4)},${b.pos[i * 3 + 1].toFixed(4)},${b.pos[i * 3 + 2].toFixed(4)}`;
  const ek = (a: number, c: number) => {
    const ka = pkey(a), kc = pkey(c);
    return ka < kc ? `${ka}|${kc}` : `${kc}|${ka}`;
  };
  const edgeUse = new Map<string, number>();
  for (let t = 0; t < tris.length; t += 3) for (const [a, c] of [[tris[t], tris[t + 1]], [tris[t + 1], tris[t + 2]], [tris[t + 2], tris[t]]]) edgeUse.set(ek(a, c), (edgeUse.get(ek(a, c)) ?? 0) + 1);
  const onEdge = new Set<string>();
  for (const [k, u] of edgeUse) if (u === 1) for (const p of k.split('|')) onEdge.add(p);
  // Shell vertices.
  const map = new Map<number, number>();
  const p = new THREE.Vector3();
  const get = (i: number) => {
    let v = map.get(i);
    if (v !== undefined) return v;
    p.fromArray(b.pos, i * 3);
    const edge = onEdge.has(pkey(i));
    const puff = spec.puff ? spec.puff(p) : 0;
    const d = (spec.thick * (1 + puff) + (edge ? spec.hem : 0)) * H;
    const color = spec.detail?.(i, p.clone()) ?? spec.color;
    v = s.vert(p.x + b.normal[i * 3] * d, p.y + b.normal[i * 3 + 1] * d, p.z + b.normal[i * 3 + 2] * d, color, b.skinIndex.subarray(i * 4, i * 4 + 4), b.skinWeight.subarray(i * 4, i * 4 + 4));
    map.set(i, v);
    covered[i] = 1;
    return v;
  };
  for (let t = 0; t < tris.length; t += 3) s.idx.push(get(tris[t]), get(tris[t + 1]), get(tris[t + 2]));
  // Close the open edges back to the skin, so the hem has a thickness.
  for (let t = 0; t < tris.length; t += 3) {
    for (const [a, c] of [[tris[t], tris[t + 1]], [tris[t + 1], tris[t + 2]], [tris[t + 2], tris[t]]]) {
      if (edgeUse.get(ek(a, c)) !== 1) continue;
      const sa = map.get(a)!, sc = map.get(c)!;
      const inset = 0.25 * spec.thick * H;
      const ia = s.vert(b.pos[a * 3] + b.normal[a * 3] * inset, b.pos[a * 3 + 1] + b.normal[a * 3 + 1] * inset, b.pos[a * 3 + 2] + b.normal[a * 3 + 2] * inset, shade(spec.color, 0.8), b.skinIndex.subarray(a * 4, a * 4 + 4), b.skinWeight.subarray(a * 4, a * 4 + 4));
      const ic = s.vert(b.pos[c * 3] + b.normal[c * 3] * inset, b.pos[c * 3 + 1] + b.normal[c * 3 + 1] * inset, b.pos[c * 3 + 2] + b.normal[c * 3 + 2] * inset, shade(spec.color, 0.8), b.skinIndex.subarray(c * 4, c * 4 + 4), b.skinWeight.subarray(c * 4, c * 4 + 4));
      // Both windings: the inside of a cuff is seen from both sides.
      s.idx.push(sc, sa, ia, sc, ia, ic, sa, sc, ia, ia, sc, ic);
    }
  }
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 1) c.multiplyScalar(k);
  else c.lerp(new THREE.Color('#ffffff'), k - 1);
  return `#${c.getHexString()}`;
}

/** Soft rounded block, centred at (x, y, z). */
const rbox = (w: number, h: number, d: number, x: number, y: number, z: number, r = 0.3) => new RoundedBoxGeometry(w, h, d, 2, Math.max(0.002, Math.min(w, h, d) * r)).translate(x, y, z);

// ---------------------------------------------------------------------
// The outfit
// ---------------------------------------------------------------------

/** Heights (u) and arm reach (a) of hems and sleeves on the chibi body. */
/** Shoes cover the feet up to this height (u); high-tops about twice as high. */
const SHOE_U = 0.02;
const U = { crotch: 0.44, waist: 0.6, hipLong: 0.4, knee: 0.3, shin: 0.17, ankle: 0.05 };
const SLEEVE = { none: 0.235, short: 0.42, long: 0.74 };
const LEG_CUFF: Record<BottomItem['leg'], number> = { shorts: 0.36, knee: 0.27, capri: 0.16, long: -1 }; // long: right down into the shoe (the shin is one triangle, knee to foot)

export interface Dressing {
  geometry: THREE.BufferGeometry | null;
  /** Under a hat: hair above this line is tucked inside a sphere of radius r round (x, y, z). */
  hatLine: { y: number; x: number; z: number; r: number } | null;
  /** Body vertices hidden under clothes (paint them like the cloth over them, so nothing pokes through). */
  covered: Uint8Array;
  /** Colour to paint each covered vertex (the garment's colour). */
  under: (string | null)[];
}

/** Build the clothes for a look on one body model. */
export function buildOutfit(mesh: THREE.SkinnedMesh, src: THREE.BufferGeometry, look: Look): Dressing {
  const b = bodyOf(mesh, src);
  const H = b.neckY - b.footY;
  const u = (i: number) => (b.pos[i * 3 + 1] - b.footY) / H;
  const a = (i: number) => Math.abs(b.pos[i * 3]) / b.reach;
  const s = new Sewing();
  const covered = new Uint8Array(b.n);
  const under: (string | null)[] = new Array(b.n).fill(null);
  const mark = (fn: (i: number) => boolean, color: string) => {
    for (let i = 0; i < b.n; i++) if (fn(i)) under[i] = color;
  };
  const notFace = (i: number) => b.slot[i] !== SLOT_EYES && b.slot[i] !== SLOT_HAIR;
  const torso = b.bone('Torso'), abdomen = b.bone('Abdomen'), hips = b.bone('Hips'), head = b.bone('Head');
  const yAt = (uu: number) => b.footY + uu * H;
  const fz = b.frontZ;

  // ------------------------------------------------ bottoms (under the top)
  const bottom = itemOf(look.bottomId ?? 'jeans', 'bottom');
  const top = itemOf(look.topId ?? 'tee', 'top');
  const dress = top?.dress;
  if (bottom && !dress) {
    const cuff = LEG_CUFF[bottom.leg];
    // Shins are mostly moved by the foot bone: above the shoe line they're leg.
    const covers = (i: number) => notFace(i) && ((b.cat[i] === 'torso' && u(i) <= U.waist) || ((b.cat[i] === 'leg' || (b.cat[i] === 'foot' && (cuff < 0 || u(i) > SHOE_U))) && u(i) >= cuff));
    const denim = /jeans|shorts/.test(bottom.id);
    shell(s, b, H, {
      covers, thick: 0.012, hem: 0.012, color: look.bottom,
      // Jeans: a darker side seam and lighter stitching at the waistband.
      detail: denim ? (_i, p) => (Math.abs(p.z) < 0.012 * H && Math.abs(p.x) > 0.08 * H ? shade(look.bottom, 0.82) : null) : undefined,
    }, covered);
    mark(covers, look.bottom);
    // Waistband + belt (or drawstring on joggers).
    const wy = yAt(U.waist) - 0.012 * H;
    const hc = b.boneCentre('Hips');
    void hc;
    // Drawstring on joggers (belts would sit under the top: no top is tucked in).
    if ((bottom.id === 'joggers' || bottom.id === 'sweatShorts') && !top?.long) for (const sx of [-1, 1]) s.rigid(rbox(0.008 * H, 0.07 * H, 0.008 * H, hc.x + sx * 0.02 * H, wy - 0.04 * H, fz + 0.012 * H, 0.4), '#f4f1ea', hips);
    if (bottom.id === 'cargoPants') for (const side of ['L', 'R'] as const) {
      // Bellows pockets on the outside of each thigh.
      const lc = b.boneCentre(`UpperLeg.${side}`);
      const sx = Math.sign(lc.x) || 1;
      const leg = b.bone(`UpperLeg.${side}`);
      s.rigid(rbox(0.03 * H, 0.09 * H, 0.08 * H, lc.x + sx * 0.068 * H, lc.y - 0.015 * H, lc.z, 0.35), shade(look.bottom, 0.92), leg);
      s.rigid(rbox(0.034 * H, 0.025 * H, 0.084 * H, lc.x + sx * 0.07 * H, lc.y + 0.035 * H, lc.z, 0.35), shade(look.bottom, 0.82), leg);
    }
    if (bottom.skirt) skirt(s, b, H, bottom.skirt, look.bottom, yAt(U.waist) - 0.01 * H);
  }

  // ------------------------------------------------ top
  if (top) {
    const sleeveA = SLEEVE[top.sleeve];
    const hemU = dress ? U.crotch + 0.06 : top.long ? U.hipLong : U.crotch + 0.06;
    const open = !!top.open;
    const inner = look.topInner ?? '#f4f1ea';
    const puffer = top.id === 'pufferJacket';
    const thick = puffer ? 0.03 : open ? 0.022 : 0.016;
    const covers = (i: number) =>
      notFace(i) &&
      ((b.cat[i] === 'torso' && u(i) >= hemU && u(i) <= 1.02) || (b.cat[i] === 'arm' && a(i) <= sleeveA) || (b.neck[i] === 1 && top.id === 'turtleneck'));
    // Open jackets leave a strip down the front: the shirt underneath shows.
    const jacket = (i: number) => covers(i) && !(open && b.cat[i] === 'torso' && b.pos[i * 3 + 2] > fz * 0.45 && Math.abs(b.pos[i * 3]) < 0.045 * H);
    const jersey = top.id === 'jersey';
    // Ribbed hem and cuffs (sweatshirts, cardigans) or darker cuffs (flannel).
    const ribbed = top.id === 'crewneck' || top.id === 'cardigan' || top.id === 'flannel';
    const cuffCol = shade(look.top, top.id === 'flannel' ? 0.78 : 0.86);
    shell(s, b, H, {
      covers: jacket, thick, hem: puffer ? 0.012 : 0.01, color: look.top,
      puff: puffer ? (p) => 0.35 * Math.abs(Math.sin(((p.y - b.footY) / H) * Math.PI * 9)) : undefined,
      detail: jersey
        ? (_i, p) => (Math.abs(((p.y - b.footY) / H) - hemU) < 0.03 || ((p.y - b.footY) / H) > 0.96 ? '#ffffff' : null)
        : ribbed
          ? (i, p) => ((b.cat[i] === 'arm' && a(i) > sleeveA - 0.07) || (b.cat[i] === 'torso' && ((p.y - b.footY) / H) - hemU < 0.035) ? cuffCol : null)
          : undefined,
    }, covered);
    mark(jacket, look.top);
    if (open) {
      // The shirt under the jacket: a thin shell on the open strip.
      const shirt = (i: number) => covers(i) && !jacket(i) && b.cat[i] === 'torso';
      shell(s, b, H, { covers: shirt, thick: 0.008, hem: 0, color: inner }, covered);
      mark(shirt, inner);
      // Lapels / collar points and buttons.
      for (const sx of [-1, 1]) s.rigid(rbox(0.035 * H, 0.09 * H, 0.012 * H, sx * 0.055 * H, yAt(0.93), fz + 0.03 * H, 0.3).rotateZ(sx * -0.35), shade(look.top, 0.85), torso);
      if (top.id === 'cardigan') for (const uu of [0.6, 0.68, 0.76, 0.84]) s.rigid(new THREE.SphereGeometry(0.01 * H, 8, 6).translate(0.05 * H, yAt(uu), fz + 0.03 * H), shade(look.top, 0.6), uu > 0.7 ? torso : abdomen);
      if (top.id === 'flannel') for (const sx of [-1, 1]) {
        // Chest pockets with flaps.
        s.rigid(rbox(0.07 * H, 0.07 * H, 0.012 * H, sx * 0.1 * H, yAt(0.82), fz + 0.022 * H, 0.3), shade(look.top, 0.9), torso);
        s.rigid(rbox(0.075 * H, 0.025 * H, 0.016 * H, sx * 0.1 * H, yAt(0.86), fz + 0.026 * H, 0.3), shade(look.top, 0.75), torso);
      }
      if (top.id === 'blazer' || top.id === 'designerSuit' || top.id === 'trenchCoat') for (const uu of [0.66, 0.76]) s.rigid(new THREE.SphereGeometry(0.012 * H, 8, 6).translate(0.05 * H, yAt(uu), fz + 0.035 * H), '#d9c27a', abdomen);
    }
    const tc = b.boneCentre('Torso');
    // Collars.
    if (top.id === 'polo') {
      // Folded collar points and a short button placket.
      for (const sx of [-1, 1]) s.rigid(rbox(0.06 * H, 0.05 * H, 0.012 * H, tc.x + sx * 0.04 * H, b.neckY - 0.03 * H, fz * 0.75 + 0.02 * H, 0.3).rotateZ(sx * 0.5), shade(look.top, 0.92), torso);
      s.rigid(new THREE.TorusGeometry(0.075 * H, 0.014 * H, 6, 18).rotateX(Math.PI / 2).translate(tc.x, b.neckY, tc.z), shade(look.top, 0.92), torso);
      for (const uu of [0.86, 0.9]) s.rigid(new THREE.SphereGeometry(0.008 * H, 6, 5).translate(tc.x, yAt(uu), fz + 0.02 * H), '#f4f1ea', torso);
    }
    if (top.id === 'tee' || top.id === 'longsleeve' || top.id === 'crewneck' || jersey) s.rigid(new THREE.TorusGeometry(0.07 * H, 0.012 * H, 6, 18).rotateX(Math.PI / 2).translate(tc.x, b.neckY - 0.01 * H, tc.z), jersey ? '#ffffff' : shade(look.top, 0.88), torso);
    if (top.id === 'turtleneck') s.rigid(new THREE.CylinderGeometry(0.075 * H, 0.085 * H, 0.08 * H, 16, 1, true).translate(tc.x, b.neckY + 0.02 * H, tc.z), look.top, b.bone('Neck'));
    if (top.id === 'denimJacket' || top.id === 'leatherJacket' || top.id === 'trenchCoat') s.rigid(new THREE.TorusGeometry(0.085 * H, 0.022 * H, 6, 18, Math.PI * 1.3).rotateX(Math.PI / 2).rotateY(Math.PI * 0.35).translate(tc.x, b.neckY - 0.015 * H, tc.z - 0.01 * H), shade(look.top, 0.9), torso);
    // Hood bunched behind the neck, drawstrings, a kangaroo pocket.
    if (top.hood) {
      s.rigid(new THREE.SphereGeometry(0.12 * H, 12, 8).scale(1.25, 0.75, 0.75).translate(tc.x, b.neckY - 0.02 * H, tc.z - 0.11 * H), shade(look.top, 0.95), torso);
      s.rigid(new THREE.TorusGeometry(0.08 * H, 0.03 * H, 6, 16, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(tc.x, b.neckY - 0.005 * H, tc.z - 0.02 * H), shade(look.top, 0.95), torso);
      if (!puffer) for (const sx of [-1, 1]) s.rigid(new THREE.CylinderGeometry(0.006 * H, 0.006 * H, 0.12 * H, 5).translate(tc.x + sx * 0.03 * H, b.neckY - 0.08 * H, fz + 0.035 * H), '#f4f1ea', torso);
      if (!puffer) s.rigid(rbox(0.2 * H, 0.09 * H, 0.025 * H, tc.x, yAt(0.66), fz + 0.03 * H, 0.35), shade(look.top, 0.9), abdomen);
    }
    if (puffer) s.rigid(rbox(0.012 * H, 0.42 * H, 0.012 * H, 0, yAt(0.73), fz + 0.05 * H, 0.4), '#c9ced6', abdomen); // zip
    if (dress) skirt(s, b, H, dress, look.top, yAt(U.waist) - 0.02 * H, true);
  }

  // ------------------------------------------------ shoes
  const shoes = itemOf(look.shoesId ?? 'sneakers', 'shoes');
  if (shoes) {
    for (const side of ['L', 'R'] as const) {
      const bi = b.bone(`Foot.${side}`);
      const fc = b.boneCentre(`Foot.${side}`);
      const color = look.shoes ?? shoes.colors[0];
      const L = 0.2 * H, W = 0.12 * H, sole = 0.03 * H;
      const cz = fc.z + 0.035 * H; // toes forward
      const y0 = b.footY;
      if (shoes.style === 'slides') {
        // A flat footbed and one wide strap over the socks.
        s.rigid(rbox(W + 0.01 * H, sole * 0.9, L + 0.015 * H, fc.x, y0 + sole * 0.45, cz, 0.35), shoes.sole, bi);
        s.rigid(rbox(W + 0.014 * H, 0.05 * H, L * 0.42, fc.x, y0 + sole + 0.02 * H, cz + L * 0.12, 0.5), color, bi);
        s.rigid(rbox(W * 0.5, 0.008 * H, L * 0.2, fc.x, y0 + sole + 0.046 * H, cz + L * 0.12, 0.4), '#ffffff', bi); // logo
        continue;
      }
      s.rigid(rbox(W + 0.008 * H, sole, L + 0.01 * H, fc.x, y0 + sole / 2, cz, 0.35), shoes.sole, bi);
      const high = shoes.high ? 0.12 * H : 0.065 * H;
      s.rigid(rbox(W, high, L * 0.95, fc.x, y0 + sole + high / 2 - 0.004 * H, cz - 0.005 * H, 0.45), color, bi);
      s.rigid(rbox(W * 0.88, 0.04 * H, L * 0.42, fc.x, y0 + sole + 0.025 * H, cz + L * 0.3, 0.5), color, bi); // toe cap
      if (shoes.style === 'canvas') {
        // White rubber toe and a stripe round the sole.
        s.rigid(rbox(W * 0.9, 0.035 * H, L * 0.22, fc.x, y0 + sole + 0.016 * H, cz + L * 0.4, 0.5), shoes.sole, bi);
        s.rigid(rbox(W + 0.012 * H, 0.008 * H, L + 0.014 * H, fc.x, y0 + sole * 0.7, cz, 0.3), '#c23b3b', bi);
      }
      if (shoes.id !== 'loafers' && shoes.id !== 'boots') {
        for (let k = 0; k < 3; k++) s.rigid(rbox(W * 0.55, 0.006 * H, 0.008 * H, fc.x, y0 + sole + high - 0.004 * H - k * 0.012 * H, cz + L * 0.12 - k * 0.025 * H, 0.4), '#ffffff', bi); // laces
        if (shoes.style !== 'canvas') s.rigid(rbox(0.005 * H, high * 0.5, L * 0.35, fc.x + (side === 'L' ? 1 : -1) * W * 0.51, y0 + sole + high * 0.45, cz - L * 0.05, 0.4), shoes.sole === '#111111' ? '#ffffff' : shade(color, 0.7), bi); // side swoosh
      }
    }
    // Slides: the feet show, in socks.
    mark((i) => b.cat[i] === 'foot' && u(i) <= (shoes.high ? SHOE_U * 2.2 : SHOE_U), shoes.style === 'slides' ? '#f4f1ea' : look.shoes ?? shoes.colors[0]);
  }

  // ------------------------------------------------ hats & extras (stuck to the head / torso)
  // The head itself (skin, not the hairdo): its middle, top and radius.
  // The middle is the head's own bounding box, not the bone (which sits
  // back by the neck and would make every hat too big).
  const hc = b.boneCentre('Head');
  let headTop = -Infinity, headR = 0;
  {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < b.n; i++) if (b.cat[i] === 'head' && b.slot[i] !== SLOT_HAIR && b.slot[i] !== SLOT_EYES) {
      const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2];
      headTop = Math.max(headTop, y);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    hc.x = (x0 + x1) / 2;
    hc.z = (z0 + z1) / 2;
    headR = Math.max((x1 - x0) / 2, (z1 - z0) / 2);
  }
  const hat = itemOf(look.hatId, 'hat');
  let hatLine: Dressing['hatLine'] = null;
  if (hat) {
    const hcol = look.hat ?? hat.colors[0];
    // Hats hug the head (just over the hairline); the hairdo shows round the edge.
    const r = headR * 1.06;
    const yb = headTop - r * 0.64;
    // A durag wraps all the hair; other hats let it hang out below.
    hatLine = hat.style === 'durag' ? { y: yb - r * 0.4, x: hc.x, z: hc.z, r: r * 0.92 } : { y: yb - 0.01 * H, x: hc.x, z: hc.z, r: r * 0.86 };
    if (hat.style === 'cap') {
      s.rigid(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).translate(hc.x, yb, hc.z), hcol, head);
      s.rigid(rbox(r * 1.1, 0.02 * H, r * 0.9, hc.x, yb + 0.005 * H, hc.z + r * 1.15, 0.3), shade(hcol, 0.85), head);
      s.rigid(new THREE.SphereGeometry(0.02 * H, 8, 6).translate(hc.x, yb + r * 0.8, hc.z), shade(hcol, 0.8), head);
    } else if (hat.style === 'beanie') {
      s.rigid(new THREE.SphereGeometry(r * 1.01, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1).translate(hc.x, yb, hc.z), hcol, head);
      // Folded cuff: a snug band, not a brim.
      s.rigid(new THREE.CylinderGeometry(r * 1.02, r * 1.03, 0.07 * H, 24, 1, true).translate(hc.x, yb + 0.03 * H, hc.z), shade(hcol, 0.88), head);
      s.rigid(new THREE.TorusGeometry(r * 1.025, 0.008 * H, 5, 24).rotateX(Math.PI / 2).translate(hc.x, yb + 0.067 * H, hc.z), shade(hcol, 0.8), head);
      s.rigid(new THREE.SphereGeometry(0.05 * H, 8, 6).translate(hc.x, yb + r * 0.85, hc.z), shade(hcol, 1.15), head);
    } else if (hat.style === 'bucket') {
      s.rigid(new THREE.CylinderGeometry(r * 0.85, r * 1.0, r * 0.6, 18).translate(hc.x, yb + r * 0.3, hc.z), hcol, head);
      s.rigid(new THREE.CylinderGeometry(r * 1.35, r * 1.45, 0.02 * H, 20).translate(hc.x, yb, hc.z), shade(hcol, 0.9), head);
    } else {
      s.rigid(new THREE.SphereGeometry(r * 1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.84, 1).translate(hc.x, yb, hc.z), hcol, head);
      for (const sx of [-1, 1]) s.rigid(rbox(0.04 * H, 0.18 * H, 0.015 * H, hc.x + sx * 0.03 * H, yb - 0.08 * H, hc.z - r * 0.95, 0.4), hcol, head);
    }
  }
  const extra = itemOf(look.extraId, 'extra');
  if (extra) {
    const ecol = look.extra ?? extra.colors[0];
    // Eyes: the eye vertices' middle height and front.
    // (Middle of the eyes' full height, brows included, so shades cover them.)
    let ey0 = Infinity, ey1 = -Infinity, ez = -Infinity;
    for (let i = 0; i < b.n; i++) if (b.slot[i] === SLOT_EYES) { const y = b.pos[i * 3 + 1]; ey0 = Math.min(ey0, y); ey1 = Math.max(ey1, y); ez = Math.max(ez, b.pos[i * 3 + 2]); }
    const ey = ey1 > ey0 ? (ey0 + ey1) / 2 : hc.y;
    const eh = ey1 > ey0 ? ey1 - ey0 : 0.07 * H;
    if (extra.style === 'shades' || extra.style === 'glasses') {
      for (const sx of [-1, 1]) {
        if (extra.style === 'shades') s.rigid(rbox(0.11 * H, Math.max(0.07 * H, eh * 1.15), 0.012 * H, hc.x + sx * 0.08 * H, ey, ez + 0.012 * H, 0.4), '#15171c', head);
        else s.rigid(new THREE.TorusGeometry(Math.max(0.045 * H, eh * 0.62), 0.008 * H, 6, 16).translate(hc.x + sx * 0.08 * H, ey, ez + 0.012 * H), ecol, head);
      }
      s.rigid(rbox(0.06 * H, 0.012 * H, 0.012 * H, hc.x, ey + 0.01 * H, ez + 0.014 * H, 0.3), ecol, head);
    } else if (extra.style === 'chain') {
      const tc = b.boneCentre('Torso');
      s.rigid(new THREE.TorusGeometry(0.095 * H, 0.01 * H, 6, 24).rotateX(Math.PI / 2 - 0.5).translate(tc.x, b.neckY - 0.05 * H, tc.z + 0.03 * H), ecol, torso);
      s.rigid(new THREE.SphereGeometry(0.022 * H, 8, 6).translate(tc.x, b.neckY - 0.13 * H, fz + 0.035 * H), ecol, torso);
    } else if (extra.style === 'headphones') {
      // A chunky band over the top of the head and two big ear cups.
      const r = headR * 1.08;
      s.rigid(new THREE.TorusGeometry(r, 0.018 * H, 6, 20, Math.PI).translate(hc.x, ey, hc.z), shade(ecol, 0.85), head);
      for (const sx of [-1, 1]) {
        s.rigid(new THREE.CylinderGeometry(0.055 * H, 0.055 * H, 0.04 * H, 14).rotateZ(Math.PI / 2).translate(hc.x + sx * r, ey, hc.z), ecol, head);
        s.rigid(new THREE.CylinderGeometry(0.035 * H, 0.035 * H, 0.012 * H, 12).rotateZ(Math.PI / 2).translate(hc.x + sx * (r + 0.022 * H), ey, hc.z), shade(ecol, 0.7), head);
      }
    } else if (extra.style === 'backpack') {
      const tc = b.boneCentre('Torso');
      s.rigid(rbox(0.26 * H, 0.32 * H, 0.13 * H, tc.x, yAt(0.78), -fz - 0.07 * H, 0.35), ecol, torso);
      s.rigid(rbox(0.2 * H, 0.12 * H, 0.04 * H, tc.x, yAt(0.7), -fz - 0.14 * H, 0.35), shade(ecol, 0.85), torso);
      for (const sx of [-1, 1]) s.rigid(rbox(0.035 * H, 0.32 * H, 0.02 * H, tc.x + sx * 0.08 * H, yAt(0.8), fz + 0.03 * H, 0.4), shade(ecol, 0.75), torso);
    }
  }

  // Where a garment ends, the skin right at its edge stays skin colour, so
  // the colour doesn't bleed down the arm or leg past the cuff.
  for (let t = 0; t < b.index.length; t += 3) {
    const tri = [b.index[t], b.index[t + 1], b.index[t + 2]];
    const set = tri.filter((i) => under[i] !== null);
    if (set.length && set.length < 3) for (const i of set) under[i] = null;
  }
  return { geometry: s.build(), covered, under, hatLine };
}

/**
 * A skirt: a flared cone from the waist, blended between the hips and the
 * thighs so it swings with the legs instead of tearing.
 */
function skirt(s: Sewing, b: Body, H: number, lengthM: number, color: string, waistY: number, fromDress = false): void {
  // The wardrobe gives a length in metres on a grown-up; the chibi legs are short.
  const len = Math.min(0.55, lengthM * 0.62) * H;
  const r0 = 0.165 * H, r1 = r0 + len * (fromDress ? 0.32 : 0.24);
  const segs = 22, rings = 4;
  const hips = b.bone('Hips'), L = b.bone('UpperLeg.L'), R = b.bone('UpperLeg.R'), LL = b.bone('LowerLeg.L'), LR = b.bone('LowerLeg.R');
  const geo = new THREE.CylinderGeometry(r0, r1, len, segs, rings, true).translate(0, waistY - len / 2, 0.005 * H);
  // Skin weights shared by the outside, the lining and the hem, so they never part.
  // Left and right legs blend smoothly across the middle (no tear at the front seam);
  // long gowns follow the legs less, so they sway instead of wrapping each leg.
  const follow = fromDress && lengthM > 0.7 ? 0.55 : 0.85;
  const weights = (p: THREE.Vector3): [number[], number[]] => {
    const t = THREE.MathUtils.clamp((waistY - p.y) / len, 0, 1);
    const k = THREE.MathUtils.smoothstep(p.x, -r0 * 0.6, r0 * 0.6); // 1 = the character's left
    const side = Math.min(1, Math.abs(p.x) / r0);
    const wl = t * follow * (0.45 + 0.55 * side);
    const wLow = t > 0.7 ? (t - 0.7) * 0.5 * follow : 0;
    const hipW = Math.max(0, 1 - wl - wLow);
    return [[hips, L, R, k > 0.5 ? LL : LR], [hipW, wl * k, wl * (1 - k), wLow]];
  };
  s.rigid(geo, color, hips, weights);
  // The inside of the skirt (seen from below while walking).
  const inside = new THREE.CylinderGeometry(r0 * 0.98, r1 * 0.98, len * 0.98, segs, rings, true).translate(0, waistY - len / 2, 0.005 * H);
  const idx = inside.getIndex()!;
  const arr = Array.from(idx.array);
  for (let i = 0; i < arr.length; i += 3) [arr[i + 1], arr[i + 2]] = [arr[i + 2], arr[i + 1]];
  inside.setIndex(arr);
  s.rigid(inside, shade(color, 0.75), hips, weights);
  // Hem ring.
  s.rigid(new THREE.TorusGeometry(r1, 0.012 * H, 5, segs).rotateX(Math.PI / 2).translate(0, waistY - len, 0.005 * H), shade(color, fromDress ? 0.9 : 0.85), hips, weights);
}
