// =====================================================================
// furniture-kit.ts — loads public/models/interior.glb (every piece of
// home furniture: the Quaternius house interior pack and the Kenney
// furniture kit, see scripts/build-interior-assets.mjs) and gets every
// model ready to place: centred on its footprint, sitting on y=0.
//
// COLOURS. Each vertex has a colour SLOT (_slot): 0 fixed, 1 main
// (fabric, cabinet paint), 2 frame (wood), 3 glow (lamp shades). A
// piece's material multiplies slots 1 and 2 by its two chosen colours
// and lights slot 3 up when the lamp is on — so any sofa can be any
// colour (Lagos Life style) and still draws in one call per part.
// Materials are shared by every piece with the same colours.
//
// Never throws: if it can't load, homes fall back to the simple room.
// =====================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { toyFurnitureModels } from '../world/furniture-toys.ts';
import MODEL_INFO from '../data/interior-models.json';

export interface ModelInfo {
  size: [number, number, number];
  /** Default main and frame colours (sRGB hex). */
  a?: string;
  b?: string;
  /** Has a lamp shade or bulb that lights up. */
  glow?: boolean;
  /** Hangs from the ceiling (its top is at y = 0). */
  hang?: boolean;
}
export const MODELS_INFO = MODEL_INFO as unknown as Record<string, ModelInfo>;

/** A piece's look: main colour, frame colour, and how bright its lamp glows (0 = off). */
export interface Finish {
  a?: string;
  b?: string;
  glow?: number;
  glowColor?: string;
  /** Move mode: the held piece glows green (fits) or red (doesn't). */
  held?: string;
}

export interface FurnitureKit {
  models: Map<string, THREE.BufferGeometry>;
  /** The plain material (no recolouring): for code-built pieces. */
  material: THREE.MeshLambertMaterial;
  /** The material for a piece with these colours (cached and shared). */
  materialFor: (finish: Finish) => THREE.MeshLambertMaterial;
}

const WHITE = '#ffffff';

/**
 * A Lambert material that reads the colour slot. Every one of these
 * shares one shader program (same cache key), only the uniforms differ.
 */
function slotMaterial(f: Finish): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const u = {
    uTintA: { value: new THREE.Color(f.a ?? WHITE) },
    uTintB: { value: new THREE.Color(f.b ?? WHITE) },
    uGlow: { value: f.glow ?? 0 },
    uGlowColor: { value: new THREE.Color(f.glowColor ?? '#ffd29a') },
    uHeld: { value: new THREE.Color(f.held ?? '#000000') },
  };
  m.userData.uniforms = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _slot;\nuniform vec3 uTintA;\nuniform vec3 uTintB;\nvarying float vGlowSlot;')
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        vGlowSlot = 0.0;
        if (_slot > 0.5 && _slot < 1.5) vColor.rgb *= uTintA;
        else if (_slot > 1.5 && _slot < 2.5) vColor.rgb *= uTintB;
        else if (_slot > 2.5) vGlowSlot = 1.0;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform vec3 uGlowColor;\nuniform vec3 uHeld;\nvarying float vGlowSlot;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowColor * (uGlow * vGlowSlot * 1.6) + uHeld;');
  };
  m.customProgramCacheKey = () => 'furniture-slots';
  return m;
}

let promise: Promise<FurnitureKit | null> | null = null;

export function loadFurnitureKit(): Promise<FurnitureKit | null> {
  promise ??= (async () => {
    try {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/interior.glb`);
      gltf.scene.updateMatrixWorld(true);
      const models = new Map<string, THREE.BufferGeometry>();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = m.geometry.clone();
        // Compressed files store positions as small integers: expand to
        // plain floats before moving them.
        for (const key of ['position', 'normal', 'color', '_slot']) {
          const at = g.getAttribute(key);
          if (at && (at.normalized || !(at.array instanceof Float32Array))) {
            const f = new Float32Array(at.count * at.itemSize);
            for (let i = 0; i < at.count; i++) for (let k = 0; k < at.itemSize; k++) f[i * at.itemSize + k] = at.getComponent(i, k);
            g.setAttribute(key, new THREE.BufferAttribute(f, at.itemSize));
          }
        }
        g.applyMatrix4(m.matrixWorld);
        g.computeBoundingBox();
        g.computeBoundingSphere();
        models.set(m.name || m.parent?.name || '', g);
      });
      // The chunky cartoon pieces built in code (world/furniture-toys.ts),
      // each built the first time a room needs it. They have no slots: all fixed.
      const toys = toyFurnitureModels();
      const withSlots = new WeakSet<THREE.BufferGeometry>();
      const all = new (class extends Map<string, THREE.BufferGeometry> {
        override has(k: string) {
          return models.has(k) || toys.has(k);
        }
        override get(k: string) {
          const g = toys.get(k) ?? models.get(k);
          if (g && !g.getAttribute('_slot') && !withSlots.has(g)) {
            withSlots.add(g);
            g.setAttribute('_slot', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
          }
          return g;
        }
      })();
      const cache = new Map<string, THREE.MeshLambertMaterial>();
      const plain = slotMaterial({});
      cache.set('||0.00||', plain);
      return {
        models: all,
        material: plain,
        materialFor: (f) => {
          const key = `${f.a ?? ''}|${f.b ?? ''}|${(f.glow ?? 0).toFixed(2)}|${f.glow ? f.glowColor ?? '' : ''}|${f.held ?? ''}`;
          let m = cache.get(key);
          if (!m) cache.set(key, (m = slotMaterial(f)));
          return m;
        },
      };
    } catch (err) {
      console.info('[furniture] not loaded, using the simple apartment:', (err as Error)?.message ?? err);
      return null;
    }
  })();
  return promise;
}
