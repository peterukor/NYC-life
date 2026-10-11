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

let mat: THREE.MeshLambertMaterial | null = null;
/** Shared material for moving vehicles (same look as the city, never fades). */
export function vehicleMaterial(): THREE.MeshLambertMaterial {
  return (mat ??= cityMaterial(new BuildingFades()));
}
