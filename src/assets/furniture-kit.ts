// =====================================================================
// furniture-kit.ts — loads public/models/furniture.glb (one small file,
// all home furniture, colours baked into the vertices) and gets every
// model ready to place: scaled, centred on its footprint, sitting on y=0.
//
// Never throws: if it can't load, homes fall back to the simple room.
// =====================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FURN_SCALE } from '../data/furniture.ts';

export interface FurnitureKit {
  models: Map<string, THREE.BufferGeometry>;
  material: THREE.MeshLambertMaterial;
}

let promise: Promise<FurnitureKit | null> | null = null;

export function loadFurnitureKit(): Promise<FurnitureKit | null> {
  promise ??= (async () => {
    try {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/furniture.glb`);
      gltf.scene.updateMatrixWorld(true);
      const models = new Map<string, THREE.BufferGeometry>();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = m.geometry.clone();
        // Compressed files store positions as small integers: expand to
        // plain floats before moving/scaling them.
        for (const key of ['position', 'normal', 'color']) {
          const at = g.getAttribute(key);
          if (at && (at.normalized || !(at.array instanceof Float32Array))) {
            const f = new Float32Array(at.count * at.itemSize);
            for (let i = 0; i < at.count; i++) for (let k = 0; k < at.itemSize; k++) f[i * at.itemSize + k] = at.getComponent(i, k);
            g.setAttribute(key, new THREE.BufferAttribute(f, at.itemSize));
          }
        }
        g.applyMatrix4(m.matrixWorld);
        g.scale(FURN_SCALE, FURN_SCALE, FURN_SCALE);
        g.computeBoundingBox();
        const b = g.boundingBox!;
        // Centre on the footprint, feet on the floor.
        g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
        g.computeBoundingBox();
        g.computeBoundingSphere();
        models.set(m.name || m.parent?.name || '', g);
      });
      return { models, material: new THREE.MeshLambertMaterial({ vertexColors: true }) };
    } catch (err) {
      console.info('[furniture] not loaded, using the simple apartment:', (err as Error)?.message ?? err);
      return null;
    }
  })();
  return promise;
}
