// =====================================================================
// vehicle-models.ts — turns vehicle definitions (data/vehicles.ts) into
// 3D geometry, once per vehicle + paint colour, and caches it.
//
// Moving traffic draws each (vehicle, paint) with one InstancedMesh;
// parked cars are copied straight into their block's merged mesh.
// =====================================================================

import * as THREE from 'three';
import { drawVehicle, type VehicleDef } from '../data/vehicles.ts';
import { BEACON_BLUE, HEADLIGHT, SIGN_LIT, TAILLIGHT } from './car-shapes.ts';
import { BuildingFades, cityMaterial } from './nycgen/atlas.ts';
import { CityMeshBuilder } from './nycgen/builder.ts';

const cache = new Map<string, THREE.BufferGeometry>();

/** lod 0 = cheap version (parked cars, low-end phones), 1 = full detail. */
export function vehicleGeometry(v: VehicleDef, paint: string, lod: 0 | 1 = 1): THREE.BufferGeometry {
  const key = `${v.id}|${paint}|${lod}`;
  let g = cache.get(key);
  if (!g) {
    const b = new CityMeshBuilder();
    drawVehicle(v, b, paint, lod);
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
    // Lamps: vertices in one of the exact lamp colours (car-shapes.ts) glow
    // at night, through the same uNight the city's lit windows use.
    const lamp = (hex: string, k: number) => {
      const c = new THREE.Color(hex);
      return `if (distance(color.rgb, vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})) < 0.006) vLamp = color.rgb * ${k.toFixed(2)};`;
    };
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec3 vLamp;\nvoid main() {').replace(
      '#include <color_vertex>',
      `#include <color_vertex>
      vLamp = vec3(0.0);
      ${lamp(HEADLIGHT, 1.5)}
      ${lamp(TAILLIGHT, 1.6)}
      ${lamp(SIGN_LIT, 1.3)}
      ${lamp(BEACON_BLUE, 1.6)}
      #ifdef USE_INSTANCING_COLOR
        // Undo the default "tint everything", then tint only white (paint) vertices.
        vColor.xyz = color.xyz;
        float isPaint = step(2.94, color.r + color.g + color.b);
        vColor.xyz = mix(color.xyz, instanceColor.xyz, isPaint);
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec3 vLamp;\nvoid main() {')
      .replace('totalEmissiveRadiance += windowLit', 'totalEmissiveRadiance += vLamp * uNight;\n  totalEmissiveRadiance += windowLit');
  };
  mat.customProgramCacheKey = () => 'nyc-vehicle-v2';
  return mat;
}
