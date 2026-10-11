// =====================================================================
// vehicle-models.ts — turns vehicle definitions (data/vehicles.ts) into
// 3D geometry, once per vehicle + paint colour, and caches it.
//
// Moving traffic draws each (vehicle, paint) with one InstancedMesh;
// parked cars are copied straight into their block's merged mesh.
// =====================================================================

import * as THREE from 'three';
import type { VehicleDef } from '../data/vehicles.ts';
import { BuildingFades, cityMaterial } from './nycgen/atlas.ts';
import { CityMeshBuilder } from './nycgen/builder.ts';

const cache = new Map<string, THREE.BufferGeometry>();

export function vehicleGeometry(v: VehicleDef, paint: string): THREE.BufferGeometry {
  const key = `${v.id}|${paint}`;
  let g = cache.get(key);
  if (!g) {
    const b = new CityMeshBuilder();
    v.build(b, paint);
    g = b.build() ?? new THREE.BufferGeometry();
    cache.set(key, g);
  }
  return g;
}

/** The colour vehicles are built in when their paint comes from the instance (pure white). */
export const PAINT_MARKER = '#ffffff';

let mat: THREE.MeshLambertMaterial | null = null;
/**
 * Shared material for moving vehicles (same look as the city, never
 * fades). Each car's paint comes from its instance colour, but ONLY on
 * the body: vertices built in pure white (PAINT_MARKER) take the paint;
 * glass, tyres and lights keep their own colours. So one mesh per
 * vehicle model draws every paint job (fewer draw calls).
 */
export function vehicleMaterial(): THREE.MeshLambertMaterial {
  if (mat) return mat;
  mat = cityMaterial(new BuildingFades());
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      `#include <color_vertex>
      #ifdef USE_INSTANCING_COLOR
        // Undo the default "tint everything", then tint only white (paint) vertices.
        vColor.xyz = color.xyz;
        float isPaint = step(2.94, color.r + color.g + color.b);
        vColor.xyz = mix(color.xyz, instanceColor.xyz, isPaint);
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => 'nyc-vehicle-v1';
  return mat;
}
