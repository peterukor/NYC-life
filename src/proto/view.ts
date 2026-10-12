// =====================================================================
// view.ts — the fixed camera and sun of the 2.5D map.
//
// Every building picture is photographed in Blender from exactly this
// angle with exactly this sun (scripts/render-sprite.py), so the live
// 3D bits (people, cars, trees) must use the same numbers or they won't
// line up. Change them in BOTH places, then re-render the pictures.
//
// World axes (three.js): x = east, z = south, y = up. 1 unit = 1 metre.
// =====================================================================

import * as THREE from 'three';

/** Camera: 30° down, turned 45°, looking north-west from the south-east. */
export const CAM_ELEVATION = THREE.MathUtils.degToRad(30);
export const CAM_AZIMUTH = THREE.MathUtils.degToRad(45);

/** Unit vector from the looked-at point towards the camera. */
export const CAM_DIR = new THREE.Vector3(
  Math.cos(CAM_ELEVATION) * Math.sin(CAM_AZIMUTH),
  Math.sin(CAM_ELEVATION),
  Math.cos(CAM_ELEVATION) * Math.cos(CAM_AZIMUTH),
);

/**
 * Direction the sunlight comes FROM (unit vector). Blender's sun is
 * rotated (35°, 0, -30°); converted to three.js axes this is it.
 */
export const SUN_FROM = (() => {
  const e = new THREE.Euler(THREE.MathUtils.degToRad(35), 0, THREE.MathUtils.degToRad(-30), 'XYZ');
  const travel = new THREE.Vector3(0, 0, -1).applyEuler(e); // Blender axes, z up
  return new THREE.Vector3(-travel.x, -travel.z, travel.y).normalize(); // to three.js, reversed
})();

/** Camera distance from its target (orthographic, so it only affects clipping). */
export const CAM_DISTANCE = 1500;
export const CAM_NEAR = 1;
export const CAM_FAR = 3200;
