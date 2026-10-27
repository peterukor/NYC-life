// =====================================================================
// build-interior-assets.mjs — every piece of home furniture, in one file.
//
// SOURCES (both free to use):
//   • Quaternius "Ultimate House Interior Pack" (CC0), the OBJ folder:
//     sofas, beds, lamps, chandeliers, plants, curtains, doors…
//   • Kenney "Furniture Kit" (CC0), the "Models/GLTF format" folder.
//
// Usage:
//   node scripts/build-interior-assets.mjs <Quaternius OBJ folder> <Kenney GLTF folder>
//
// WHAT IT DOES
//   Each model's materials are baked into its vertex colours (so a whole
//   room draws in a handful of calls), and every vertex gets a COLOUR
//   SLOT so players can repaint pieces (Lagos Life style):
//     0 fixed   — metal, glass, white porcelain: stays as modelled
//     1 main    — the fabric: sofa, bedding, cushions, rug, cabinet paint
//     2 frame   — the wood or paint of the frame, shelves, legs
//     3 glow    — lamp shades and bulbs: they light up at night
//   For slots 1 and 2 the vertex colour holds only the SHADING (how much
//   darker than the slot's main colour that face was), and the default
//   colour goes into src/data/interior-models.json. The game multiplies
//   the two, so any colour keeps the model's two-tone detail.
//
//   Sizes are baked in metres; every model sits centred on its footprint
//   with its feet at y = 0 (hanging lights: the top at y = 0).
//
// OUTPUT: public/models/interior.glb, src/data/interior-models.json
// =====================================================================

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, quantize, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { join } from 'node:path';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const [qDir, kDir] = process.argv.slice(2);
if (!qDir || !kDir) {
  console.error('Usage: node scripts/build-interior-assets.mjs <Quaternius OBJ folder> <Kenney GLTF folder>');
  process.exit(1);
}

// ---- Quaternius: which models, and how big. The pack is modelled at
// about twice real size; lamps and a few others at their own scale.
const Q_SCALE = 0.5;
const Q_SKIP = /^(Fork|Knife|Spoon|Plate_|Window_|Bathroom_ToiletPaper$)/;
const Q_SCALES = { Light_Floor1: 1.0, Light_Floor2: 0.7, Light_Floor3: 0.7, Light_Floor4: 0.7, Light_Stand1: 0.55, Light_Stand2: 0.55, Light_Desk: 0.9, Kitchen_Fridge: 0.56, Bed_King: 0.6, Bed_Single: 0.55, Bed_Bunk: 0.55, Bookshelf: 0.45,
  // Tables, chairs and kitchen cabinets come out small at 0.5: real heights (75 cm tables, 90 cm counters).
  Table_RoundLarge: 0.65, Table_RoundSmall: 0.65, Table_RoundSmall2: 0.65, Chair_1: 0.55, Chair_2: 0.55, Chair_3: 0.55, Chair_4: 0.55, Stool: 0.6,
  NightStand_1: 0.6, NightStand_2: 0.6, NightStand_3: 0.6,
  Kitchen_1Drawers: 0.57, Kitchen_2Drawers: 0.57, Kitchen_3Drawers: 0.57, Kitchen_Cabinet1: 0.57, Kitchen_Cabinet2: 0.57, Kitchen_CabinetSmall: 0.57, Kitchen_Sink: 0.57, Kitchen_Oven: 0.57, Kitchen_Oven_Large: 0.57 };
/** Hanging from the ceiling: the top goes at y = 0. */
const HANGS = /^(Light_Ceiling|Light_Chandelier|Light_Icosahedron|Light_Small$|Light_Cube|lampSquareCeiling|ceilingFan)/;
/** Quaternius colours are linear Blender values: lift them to read as they do in the preview. */
const Q_BRIGHT = 1.55;

// ---- Kenney: everything but the building bits (walls, floors, stairs).
const K_SCALE = 2;
const K_SKIP = /^(wall|floor|stairs|doorway|paneling)/;

/** Which colour slot a material goes in. Per-model overrides first. */
const SLOT_OVERRIDE = {
  Bookshelf: { White: 2 }, Shelf_1: { White: 2 }, Shelf_2: { White: 2 }, Shelf_Large: { White: 2 }, Shelf_Small1: { White: 2 }, Shelf_Small2: { White: 2 }, Shelf_Small3: { White: 2 },
  Door_1: { White: 2 }, Door_7: { White: 2 }, 'Door_9': { 'White.001': 2 },
  Fireplace: { Marble: 2 }, Column_Round1: { Marble: 2 }, Column_Round2: { Marble: 2 }, Column_Round3: { Marble: 2 }, Column_SquareBig: { Marble: 2 }, Column_SquareSmall: { Marble: 2 },
  Bathroom_Towel: { White: 1, Red: 0 }, Bathroom_Bathtub: {}, Light_Floor2: { White: 3 }, Light_Floor3: { White: 3 }, Light_Floor4: { White: 3 }, Light_Stand1: { White: 3 }, Light_Stand2: { White: 3 },
  Light_Cube: { White: 3 }, Light_Cube2: { White: 3 }, Light_Desk: { White: 2 },
  Trashcan_Green: { DarkGreen: 1 }, Houseplant_8: { Wood: 0 }, Bed_Bunk: { Wood: 2 },
  Couch_Medium1: { Black: 0 }, Couch_Small1: { Black: 0 },
};
function slotOf(model, mat) {
  const o = SLOT_OVERRIDE[model];
  if (o && mat in o) return o[mat];
  const m = mat.replace(/\.\d+$/, '');
  if (/^(Couch_|Cushin|Red|DarkRed|LightOrange|Kitchen$|carpet(?!White)|fur)/.test(m)) return 1;
  if (/^(Wood|wood|Brown$)/.test(m) && !/^Houseplant/.test(model)) return 2;
  if (/^(Light$|lamp$)/.test(m)) return 3;
  return 0;
}
// Bedding: the white sheets stay white, the duvet (Red/DarkRed) is the main colour.

const lin2srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const hex = (c) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, lin2srgb(v))) * 255).toString(16).padStart(2, '0')).join('');
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** One model, as flat lists: positions, normals, colours, slots, indices. Material colour per triangle. */
function readObj(name) {
  const mtl = {};
  let cur = null;
  for (const line of readFileSync(join(qDir, `${name}.mtl`), 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'newmtl') cur = p[1];
    else if (p[0] === 'Kd' && cur) mtl[cur] = [+p[1], +p[2], +p[3]].map((v) => Math.min(1, v * Q_BRIGHT));
  }
  const v = [], vn = [];
  const tris = []; // [ [pi, ni] x3, mat ]
  let mat = null;
  for (const line of readFileSync(join(qDir, `${name}.obj`), 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vn') vn.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'usemtl') mat = p[1];
    else if (p[0] === 'f') {
      const c = p.slice(1).map((s) => {
        const [a, , n] = s.split('/');
        return [+a - 1, n ? +n - 1 : -1];
      });
      for (let i = 1; i + 1 < c.length; i++) tris.push([c[0], c[i], c[i + 1], mat]);
    }
  }
  const s = Q_SCALES[name] ?? Q_SCALE;
  const out = { pos: [], nor: [], mats: [] };
  for (const [a, b, c, m] of tris) {
    const pa = v[a[0]], pb = v[b[0]], pc = v[c[0]];
    // Flat normal if the file has none.
    let fn = null;
    if (a[1] < 0) {
      const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
      const wx = pc[0] - pa[0], wy = pc[1] - pa[1], wz = pc[2] - pa[2];
      fn = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
      const l = Math.hypot(...fn) || 1;
      fn = fn.map((x) => x / l);
    }
    for (const [pi, ni] of [a, b, c]) {
      out.pos.push(v[pi][0] * s, v[pi][1] * s, v[pi][2] * s);
      out.nor.push(...(ni >= 0 ? vn[ni] : fn));
      out.mats.push(m);
    }
  }
  return { ...out, colors: mtl };
}

const mulM = (m, x, y, z, w) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];

async function readKenney(io, name) {
  const doc = await io.read(join(kDir, `${name}.glb`));
  const out = { pos: [], nor: [], mats: [], colors: {} };
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION');
      const N = prim.getAttribute('NORMAL');
      const I = prim.getIndices();
      const mat = prim.getMaterial();
      const mname = mat?.getName() || '_defaultMat';
      out.colors[mname] = (mat?.getBaseColorFactor() ?? [1, 1, 1]).slice(0, 3);
      const idx = I ? Array.from({ length: I.getCount() }, (_, i) => I.getScalar(i)) : Array.from({ length: P.getCount() }, (_, i) => i);
      const p = [0, 0, 0], n = [0, 0, 0];
      for (const i of idx) {
        P.getElement(i, p);
        out.pos.push(...mulM(m, p[0], p[1], p[2], 1).map((x) => x * K_SCALE));
        if (N) {
          N.getElement(i, n);
          const t = mulM(m, n[0], n[1], n[2], 0);
          const l = Math.hypot(...t) || 1;
          out.nor.push(t[0] / l, t[1] / l, t[2] / l);
        } else out.nor.push(0, 1, 0);
        out.mats.push(mname);
      }
    }
  }
  return out;
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const out = new Document();
const buffer = out.createBuffer();
const material = out.createMaterial('interior').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0);
const scene = out.createScene('interior');
const meta = {};
let tris = 0;

function addModel(name, m) {
  // Each slot's main colour: the brightest of its materials. Shading = how much darker.
  const ref = {};
  for (const mat of new Set(m.mats)) {
    const s = slotOf(name, mat);
    if (s !== 1 && s !== 2) continue;
    const c = m.colors[mat] ?? [1, 1, 1];
    if (!ref[s] || lum(c) > lum(ref[s])) ref[s] = c;
  }
  const col = [], slot = [];
  for (const mat of m.mats) {
    const s = slotOf(name, mat);
    const c = m.colors[mat] ?? [1, 1, 1];
    if (ref[s]) {
      const k = Math.min(1, lum(c) / Math.max(1e-4, lum(ref[s])));
      col.push(k, k, k);
    } else col.push(...c);
    slot.push(s);
  }
  // Centre on the footprint; feet on the floor (hanging lights: top at 0).
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < m.pos.length; i += 3) {
    x0 = Math.min(x0, m.pos[i]); x1 = Math.max(x1, m.pos[i]);
    y0 = Math.min(y0, m.pos[i + 1]); y1 = Math.max(y1, m.pos[i + 1]);
    z0 = Math.min(z0, m.pos[i + 2]); z1 = Math.max(z1, m.pos[i + 2]);
  }
  const hang = HANGS.test(name);
  const dx = -(x0 + x1) / 2, dy = hang ? -y1 : -y0, dz = -(z0 + z1) / 2;
  const pos = new Float32Array(m.pos.length);
  for (let i = 0; i < m.pos.length; i += 3) { pos[i] = m.pos[i] + dx; pos[i + 1] = m.pos[i + 1] + dy; pos[i + 2] = m.pos[i + 2] + dz; }
  const prim = out
    .createPrimitive()
    .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
    .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(m.nor)).setBuffer(buffer))
    .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(new Float32Array(col)).setBuffer(buffer))
    .setAttribute('_SLOT', out.createAccessor().setType('SCALAR').setArray(new Uint8Array(slot)).setBuffer(buffer))
    .setMaterial(material);
  scene.addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(prim)));
  tris += pos.length / 9;
  const r = (v) => +v.toFixed(2);
  meta[name] = { size: [r(x1 - x0), r(y1 - y0), r(z1 - z0)] };
  if (ref[1]) meta[name].a = hex(ref[1]);
  if (ref[2]) meta[name].b = hex(ref[2]);
  if (slot.includes(3)) meta[name].glow = true;
  if (hang) meta[name].hang = true;
}

const qNames = readdirSync(qDir).filter((f) => f.endsWith('.obj')).map((f) => f.slice(0, -4)).filter((n) => !Q_SKIP.test(n)).sort();
for (const n of qNames) addModel(n, readObj(n));
const kNames = readdirSync(kDir).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).filter((n) => !K_SKIP.test(n)).sort();
for (const n of kNames) addModel(n, await readKenney(io, n));

await out.transform(weld(), quantize({ quantizeColor: 8 }), prune());
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const file = 'public/models/interior.glb';
await io.write(file, out);
writeFileSync('src/data/interior-models.json', JSON.stringify(meta, null, 0).replace(/\},"/g, '},\n"') + '\n');
console.log(`${file}: ${qNames.length} Quaternius + ${kNames.length} Kenney models, ${tris} triangles, ${(statSync(file).size / 1024).toFixed(0)} KB`);
