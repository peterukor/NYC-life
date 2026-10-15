// =====================================================================
// kit.ts — loads the cartoon model packs (Kenney, CC0) and turns every
// model into ONE geometry + ONE material, ready for instancing.
//
// WHY ONE GEOMETRY PER MODEL?
//   A building in the pack is a little tree of parts. Drawing the same
//   building 200 times would cost 200 × parts draw calls. Merged into one
//   geometry, all 200 copies go in a single InstancedMesh = 1 draw call.
//
// COLOURFUL BUT CHEAP
//   kitMaterial() makes a material that tints only the pale wall colour
//   of each copy (per-instance colour), so one building model can be
//   pink, mint, butter-yellow or brick-red, while windows, roofs and
//   trims keep their own colours. At night the blue windows glow.
//
// FAIL-SAFE
//   loadKits() never throws: if a pack can't download, the game keeps
//   its simple built-in shapes for that part of the world.
// =====================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

export interface KitModel {
  name: string;
  geometry: THREE.BufferGeometry;
  /** The pack's texture (a small colour palette image). */
  map: THREE.Texture | null;
  /** Size of the model in its own units (before scaling). */
  size: THREE.Vector3;
  /** Lowest corner, so callers can sit models on the ground exactly. */
  min: THREE.Vector3;
}

export type KitName = 'buildings' | 'props' | 'cars';

export interface Kits {
  buildings?: Map<string, KitModel>;
  props?: Map<string, KitModel>;
  cars?: Map<string, KitModel>;
}

let loader: GLTFLoader | null = null;
const getLoader = () => {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    // Decode the small palette images with a plain <img> instead of
    // createImageBitmap, which fails now and then on some devices.
    loader.register((parser) => {
      (parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(parser.options.manager);
      return { name: 'nyc-plain-image-textures' };
    });
  }
  return loader;
};

/**
 * Cut a geometry down to about `ratio` of its triangles, keeping the
 * outline and the colour boundaries (UV seams). Used for things that are
 * small on screen, like cars, so phones draw less.
 */
export function simplifyGeometry(geo: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry {
  if (!MeshoptSimplifier.supported) return geo;
  const g = mergeVertices(geo.index ? geo : geo, 1e-4);
  const index = g.getIndex();
  if (!index) return geo;
  const pos = g.getAttribute('position').array as Float32Array;
  const idx = new Uint32Array(index.array);
  const [out] = MeshoptSimplifier.simplify(idx, pos, 3, Math.max(3, Math.floor((idx.length * ratio) / 3) * 3), 0.01, ['Sparse']);
  g.setIndex(new THREE.BufferAttribute(out, 1));
  return g;
}

/** Load one pack and merge each top-level node into a single geometry. */
export async function loadKit(name: KitName): Promise<Map<string, KitModel>> {
  // The simplifier (a small wasm module) is only needed for cars.
  if (name === 'cars') await MeshoptSimplifier.ready.catch(() => undefined);
  const gltf = await getLoader().loadAsync(`${import.meta.env.BASE_URL}models/kit-${name}.glb`);
  const out = new Map<string, KitModel>();
  gltf.scene.updateMatrixWorld(true);
  for (const node of gltf.scene.children) {
    const parts: THREE.BufferGeometry[] = [];
    let map: THREE.Texture | null = null;
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone();
      // Keep only what the cartoon material needs, so all parts merge.
      for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
      // Quantized packs store positions as small integers: expand to floats.
      for (const key of ['position', 'normal', 'uv']) {
        const a = g.getAttribute(key);
        if (a && (a.normalized || !(a.array instanceof Float32Array))) {
          const f = new Float32Array(a.count * a.itemSize);
          for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
          g.setAttribute(key, new THREE.BufferAttribute(f, a.itemSize));
        }
      }
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      parts.push(g.index ? g.toNonIndexed() : g);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!map && mat.map) map = mat.map;
    });
    if (!parts.length) continue;
    let geometry = mergeGeometries(parts)!;
    // Cars are small on screen and there are many: keep ~40% of triangles.
    if (name === 'cars') geometry = simplifyGeometry(geometry, 0.4);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const box = geometry.boundingBox!;
    out.set(node.name, { name: node.name, geometry, map, size: box.getSize(new THREE.Vector3()), min: box.min.clone() });
  }
  return out;
}

/** Load every pack in parallel. Missing packs are simply left out. */
// Buildings and cars are generated from code now (world/nycgen, data/vehicles.ts):
// only the small props pack (traffic lights) is still downloaded.
export async function loadKits(names: KitName[] = ['props']): Promise<Kits> {
  const kits: Kits = {};
  await Promise.all(
    names.map(async (n) => {
      try {
        kits[n] = await loadKit(n);
      } catch (err) {
        console.info(`[kit] ${n} not loaded, using simple shapes:`, (err as Error)?.message ?? err);
      }
    }),
  );
  return kits;
}

// ---------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------

/** Shared night strength for every kit material (0 = day, 1 = night). */
export const kitNight = { value: 0 };

/**
 * See-through buildings, like The Sims: each building instance carries a
 * "fade" value (0 = solid, 1 = see-through). KitBuildings raises it for
 * whatever stands between the camera and the player. Faded buildings are
 * drawn with a fine screen-door pattern (most pixels dropped), which
 * needs no sorting and costs nothing on cheap phones.
 */
const FADE_FRAG = `
  if (vFade > 0.01) {
    // 4x4 ordered (Bayer) pattern: an even, clean see-through grid.
    const float bayer[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    int bi = int(mod(gl_FragCoord.x, 4.0)) + int(mod(gl_FragCoord.y, 4.0)) * 4;
    float b = (bayer[bi] + 0.5) / 16.0;
    if (b < 0.9 * vFade) discard;
  }`;

/**
 * Shader snippet: pale grey pixels (walls) take the building's colour;
 * dark grey pixels (roofs, trims) take a deep shade of the same colour,
 * so a pink building gets a plum roof — the bright Township look.
 */
const WALL_TINT = `
            float grey = 1.0 - smoothstep(0.06, 0.16, hi - lo);
            float wall = smoothstep(0.45, 0.7, lum) * grey;
            float roof = (1.0 - smoothstep(0.12, 0.3, lum)) * grey;
            diffuseColor.rgb = mix(texel, texel * vColor.rgb, wall);
            diffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb * 0.45 + texel * 0.3, roof);`;

const matCache = new Map<THREE.Texture | null, THREE.MeshLambertMaterial>();

/**
 * Cartoon material for kit models. Per-instance colour (InstancedMesh
 * setColorAt) tints only pale, unsaturated pixels — the walls — and
 * blue window pixels glow warmly at night.
 */
export function kitMaterial(map: THREE.Texture | null, opts: { tintWalls?: boolean; nightWindows?: boolean } = {}): THREE.MeshLambertMaterial {
  const key = map;
  const cacheable = !opts.tintWalls && !opts.nightWindows;
  if (cacheable && matCache.has(key)) return matCache.get(key)!;
  const m = new THREE.MeshLambertMaterial({ map });
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    // Palette textures must not blur between colour swatches up close
    // (nearest when magnified); far away, mipmaps stop small things (cars,
    // trees, people) sparkling on the sky map (Peter: "glitter").
    map.magFilter = THREE.NearestFilter;
    map.generateMipmaps = true;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.needsUpdate = true;
  }
  if (opts.tintWalls || opts.nightWindows) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = kitNight;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${opts.tintWalls ? 'attribute float instanceFade;' : ''}\nvarying float vFade;\nvoid main() {\n  vFade = ${opts.tintWalls ? 'instanceFade' : '0.0'};`);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `uniform float uNight;\nvarying float vFade;\nvoid main() {\n${opts.tintWalls ? FADE_FRAG : ''}`)
        .replace(
          '#include <color_fragment>',
          `
          vec3 texel = diffuseColor.rgb;
          float hi = max(texel.r, max(texel.g, texel.b));
          float lo = min(texel.r, min(texel.g, texel.b));
          float lum = dot(texel, vec3(0.299, 0.587, 0.114));
          #if defined( USE_COLOR )
            ${opts.tintWalls ? WALL_TINT : 'diffuseColor.rgb *= vColor.rgb;'}
          #endif
          float windowMask = ${opts.nightWindows ? 'smoothstep(0.08, 0.2, texel.b - texel.r) * step(0.25, lum)' : '0.0'};
          `,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += windowMask * uNight * vec3(1.0, 0.78, 0.42) * 1.15;');
    };
    m.customProgramCacheKey = () => `kit-${opts.tintWalls ? 't' : ''}${opts.nightWindows ? 'n' : ''}`;
  }
  if (cacheable) matCache.set(key, m);
  return m;
}
