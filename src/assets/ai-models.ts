// =====================================================================
// ai-models.ts — loads the AI-made models (Peter's OpenAI images →
// Tripo 3D → scripts/slim-model.mjs) from public/models/ai/.
//
// Each file is one model with one colour texture. We turn it into:
//   • `near`: <name>.glb (8k–30k triangles, 1–2K baked texture), close up;
//   • `far`:  <name>.far.glb (1k–4k triangles, small baked texture), for
//             everything outside the detail circle.
// Both are made by scripts/bake-model.py (simplify + bake the colours onto
// a clean UV layout) then packed by scripts/slim-model.mjs <in> <out> 0.
// A model costs at most 2 draw calls however many times it appears
// (world/ai-city.ts draws them instanced).
//
// Every model is normalised: centred on x/z, standing on y = 0. Models
// face +z (their front door / street side), width along x, depth along z.
//
// TO ADD A MODEL: slim it into public/models/ai/<name>.glb and add the
// name to AI_MODELS. A model that fails to load is simply left out.
// =====================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const AI_MODELS = ['house-tiny', 'house-townhouse', 'house-villa', 'house-mansion', 'block-walkups-a', 'block-rowhouses-a', 'block-harlem-a', 'block-fidi-a', 'block-midtown-a', 'block-mixed-a', 'block-soho-a'] as const;
export type AiModelName = (typeof AI_MODELS)[number];

export interface AiModel {
  name: AiModelName;
  near: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  material: THREE.Material;
  /** The far copy has its own small baked texture. */
  farMaterial: THREE.Material;
  /** Footprint (x = width, z = depth) and height, after normalising. */
  size: THREE.Vector3;
}

/** Plain floats for every attribute (meshopt-packed files store small integers). */
function expand(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const key of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(key)) {
      g.deleteAttribute(key);
      continue;
    }
    const a = g.getAttribute(key);
    if (a.normalized || !(a.array instanceof Float32Array)) {
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
      g.setAttribute(key, new THREE.BufferAttribute(f, a.itemSize));
    }
  }
  return g;
}

/** One file → one geometry (all meshes merged, plain floats) and its colour texture. */
async function readGeometry(loader: GLTFLoader, file: string): Promise<{ geo: THREE.BufferGeometry; map: THREE.Texture | null }> {
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/ai/${file}.glb`);
  gltf.scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let map: THREE.Texture | null = null;
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = expand(mesh.geometry.clone());
    g.applyMatrix4(mesh.matrixWorld);
    parts.push(g);
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (!map && m.map) map = m.map;
  });
  if (!parts.length) throw new Error(`${file}: no mesh`);
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts)!;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const tex = map as THREE.Texture | null;
  if (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  return { geo, map: tex };
}

/** Normalise like the near model: centre on x/z, stand on y = 0 (using the near model's box). */
function place(g: THREE.BufferGeometry, box: THREE.Box3): void {
  g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

async function loadOne(loader: GLTFLoader, name: AiModelName): Promise<AiModel> {
  // Near and far are separate files, each baked with its own clean texture
  // (scripts/bake-model.py): simplifying at load time would scramble it.
  const [n, f] = await Promise.all([readGeometry(loader, name), readGeometry(loader, `${name}.far`).catch(() => null)]);
  n.geo.computeBoundingBox();
  const box = n.geo.boundingBox!.clone();
  place(n.geo, box);
  if (f) place(f.geo, box);
  // Lambert, like the rest of the city: cheap, soft and cartoon-friendly.
  const mat = (m: THREE.Texture | null) => new THREE.MeshLambertMaterial({ map: m ?? undefined, color: m ? '#ffffff' : '#c98b6b' });
  const material = mat(n.map);
  return { name, near: n.geo, far: f?.geo ?? n.geo, material, farMaterial: f ? mat(f.map) : material, size: n.geo.boundingBox!.getSize(new THREE.Vector3()) };
}

/** Load every AI model in parallel. Missing ones are left out (the city falls back to generated buildings). */
export async function loadAiModels(): Promise<Map<AiModelName, AiModel>> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const out = new Map<AiModelName, AiModel>();
  await Promise.all(
    AI_MODELS.map(async (n) => {
      try {
        out.set(n, await loadOne(loader, n));
      } catch (err) {
        console.info(`[ai-models] ${n} not loaded:`, (err as Error)?.message ?? err);
      }
    }),
  );
  return out;
}
