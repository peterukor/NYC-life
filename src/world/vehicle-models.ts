// =====================================================================
// vehicle-models.ts — turns vehicle definitions (data/vehicles.ts) into
// 3D geometry, once per vehicle + paint colour, and caches it; plus the
// one shared vehicle material and the soft contact shadows under cars.
//
// Moving traffic draws each vehicle model with one InstancedMesh (the
// paint is the instance colour); parked cars are copied straight into
// their block's merged mesh (`baked` geometry, plain city material).
//
// THE LOOK (cheap fake of glossy PBR paint, no textures, no env map):
//   paint   — clearcoat: a fresnel reflection of the sky (a gradient from
//             the scene's sky colour to its horizon/fog colour, dark street
//             below the horizon line) plus a sharp sun glint that slides
//             over the hood and roof as the car moves. Metallic paints
//             (car-shapes.ts metallic()) tint the reflection with the paint
//             and add a broad sheen.
//   trim    — black (or chrome) below each car's trim line: bumpers, sills.
//   glass   — dark tint, sky reflection, a diagonal streak.
//   chrome / rims / tyres / lamps — their own shading (rims get spokes).
// Everything is per-pixel maths on the vehicle material only, read from
// the aMat vertex attribute (car-shapes.ts MAT). At night the reflections
// and glints fade so the lamps (uNight glow) stay the focus.
// =====================================================================

import * as THREE from 'three';
import { drawVehicle, type VehicleDef } from '../data/vehicles.ts';
import { BEACON_BLUE, HEADLIGHT, SIGN_LIT, TAILLIGHT, type CarLod } from './car-shapes.ts';
import { BuildingFades, cityMaterial } from './nycgen/atlas.ts';
import { CityMeshBuilder } from './nycgen/builder.ts';
import { kitNight } from '../assets/kit.ts';

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * lod 0 = cheap version (parked cars, low-end phones), 1 = traffic, 2 = your own car.
 * baked = for merging into the city's blocks (parked cars): no material ids.
 */
export function vehicleGeometry(v: VehicleDef, paint: string, lod: CarLod = 1, baked = false): THREE.BufferGeometry {
  const key = `${v.id}|${paint}|${lod}|${baked ? 'b' : 's'}`;
  let g = cache.get(key);
  if (!g) {
    const b = new CityMeshBuilder();
    drawVehicle(v, b, paint, lod, baked);
    g = b.build() ?? new THREE.BufferGeometry();
    cache.set(key, g);
  }
  return g;
}

/** The colour vehicles are built in when their paint comes from the instance (pure white). */
export const PAINT_MARKER = '#ffffff';

/** Sky colours the paint reflects: copied from whichever scene is drawing (sky + fog). */
const carUniforms = {
  uSkyTop: { value: new THREE.Color('#7fc1ea') },
  uSkyHor: { value: new THREE.Color('#bfdcee') },
};

let mat: THREE.MeshLambertMaterial | null = null;
/**
 * Shared material for vehicles (same look as the city, never fades).
 * In traffic each car's paint comes from its instance colour, but ONLY
 * on paint: vertices with the paint material id built in pure white
 * (PAINT_MARKER) take it; glass, trim, tyres and lights keep their own
 * colours. So one mesh per vehicle model draws every paint job.
 */
export function vehicleMaterial(): THREE.MeshLambertMaterial {
  if (mat) return mat;
  mat = cityMaterial(new BuildingFades());
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    shader.uniforms.uSkyTop = carUniforms.uSkyTop;
    shader.uniforms.uSkyHor = carUniforms.uSkyHor;
    // Lamps: vertices in one of the exact lamp colours (car-shapes.ts) glow
    // at night, through the same uNight the city's lit windows use.
    const lamp = (hex: string, k: number) => {
      const c = new THREE.Color(hex);
      return `if (distance(color.rgb, vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})) < 0.006) vLamp = color.rgb * ${k.toFixed(2)};`;
    };
    shader.vertexShader = shader.vertexShader.replace('void main() {', `${CAR_VARYINGS}attribute float aMat;\nvoid main() {`).replace(
      '#include <color_vertex>',
      `#include <color_vertex>
      vLamp = vec3(0.0);
      ${lamp(HEADLIGHT, 1.5)}
      ${lamp(TAILLIGHT, 1.6)}
      ${lamp(SIGN_LIT, 1.3)}
      ${lamp(BEACON_BLUE, 1.6)}
      // aMat = id + 16 * trim kind + 64 * trim line (cm): car-shapes.ts paintMat().
      float carId = mod(aMat, 16.0);
      vMat = carId;
      vTrimKind = mod(floor(aMat / 16.0), 4.0);
      vTrimY = floor(aMat / 64.0) / 100.0;
      vLocal = position;
      vec3 paintC = color.rgb;
      #ifdef USE_INSTANCING_COLOR
        // Undo the default "tint everything", then tint only white paint vertices.
        float isPaint = step(abs(carId - 1.0), 0.5) * step(2.94, color.r + color.g + color.b);
        vColor.xyz = mix(color.xyz, instanceColor.xyz, isPaint);
        paintC = vColor.xyz;
      #endif
      // Metallic paint = an odd blue byte (car-shapes.ts metallic()). Read here,
      // in the vertex shader, where floats are always full precision.
      float bs = paintC.b < 0.0031308 ? paintC.b * 12.92 : 1.055 * pow(paintC.b, 1.0 / 2.4) - 0.055;
      vMetal = step(abs(carId - 1.0), 0.5) * mod(floor(bs * 255.0 + 0.5), 2.0);`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', LIGHTS_WITH_GLINT)
      .replace('void main() {', `${CAR_VARYINGS}${CAR_ENV}void main() {`)
      // Before lighting: trim below the trim line, metals lose some diffuse, rims get spokes.
      .replace('#include <emissivemap_fragment>', `${CAR_SURFACE}\n#include <emissivemap_fragment>`)
      .replace('totalEmissiveRadiance += windowLit', 'totalEmissiveRadiance += vLamp * uNight;\n  totalEmissiveRadiance += windowLit')
      // After lighting: reflections and glints.
      .replace('#include <opaque_fragment>', `${CAR_SHINE}\n#include <opaque_fragment>`);
  };
  mat.onBeforeRender = (_r, scene) => {
    // Reflect whatever sky this scene has (the city's follows the time of day).
    const bg = scene.background;
    if (bg instanceof THREE.Color) carUniforms.uSkyTop.value.copy(bg);
    const fog = scene.fog as THREE.Fog | null;
    if (fog) carUniforms.uSkyHor.value.copy(fog.color);
    else if (bg instanceof THREE.Color) carUniforms.uSkyHor.value.copy(bg).lerp(WHITE, 0.3);
  };
  mat.customProgramCacheKey = () => 'nyc-vehicle-v3';
  return mat;
}
const WHITE = new THREE.Color('#ffffff');

const CAR_VARYINGS = /* glsl */ `
flat varying float vMat;
flat varying float vTrimKind;
flat varying float vTrimY;
flat varying float vMetal;
varying vec3 vLocal;
varying vec3 vLamp;
`;

/**
 * Lambert's direct light, plus two specular sums the paint uses: a tight
 * sun glint and a broad sheen. They go through the light's own colour,
 * which already has the shadow map applied (no glints in the shade).
 */
const LIGHTS_WITH_GLINT = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
  'void RE_Direct_Lambert(',
  `vec3 gGlint = vec3(0.0);
vec3 gSheen = vec3(0.0);
void RE_Direct_Lambert(`,
).replace(
  'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
  `reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	vec3 halfV = normalize( directLight.direction + geometryViewDir );
	float nh = saturate( dot( geometryNormal, halfV ) );
	float nh2 = nh * nh, nh8 = nh2 * nh2 * nh2 * nh2;
	float nh32 = nh8 * nh8 * nh8 * nh8;
	gSheen += irradiance * nh8 * nh8;
	float nh160 = nh32 * nh32 * nh32 * nh32 * nh32;
	gGlint += irradiance * nh160 * nh160;`,
);
// nh^16 for the sheen, nh^320 for the glint (multiplies: no pow() on mediump phones).

/** The sky the paint reflects: horizon to sky colour above, dark street below the horizon line. */
const CAR_ENV = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
vec3 carEnv(vec3 r) {
  vec3 sky = mix(uSkyHor * 1.08, uSkyTop, smoothstep(0.03, 0.6, r.y));
  vec3 street = mix(vec3(0.035, 0.038, 0.045), uSkyHor * 0.3, smoothstep(-0.7, -0.02, r.y));
  return mix(street, sky, smoothstep(-0.03, 0.025, r.y));
}
`;

const CAR_SURFACE = /* glsl */ `
  // The city darkens everything near the ground (contact shading over 3 m):
  // on a 1.5 m car that just muddies the paint. Swap in a gentler one.
  diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(0.1, 1.2, vLocal.y)) / mix(0.6, 1.0, smoothstep(0.0, 3.2, vY));
  float carId = floor(vMat + 0.5);
  float carMetal = vMetal;
  if (abs(carId - 1.0) < 0.5 && vLocal.y < vTrimY) {
    // Below the trim line: satin black plastic, or chrome on the classics.
    carId = vTrimKind > 1.5 ? 3.0 : 4.0;
    carMetal = 0.0;
    diffuseColor.rgb = vTrimKind > 1.5 ? vec3(0.55, 0.58, 0.63) : vec3(0.011, 0.012, 0.014);
  }
  vec3 carBase = diffuseColor.rgb;
  if (abs(carId - 5.0) < 0.5) {
    // Rims: five spokes, a centre cap and a bright lip, from where on the rim we are (aCell).
    vec2 q = (vCell - 0.5) / 0.4;
    float rr = length(q);
    float ang = atan(q.y, q.x);
    float spoke = smoothstep(0.25, 0.7, cos(ang * 5.0));
    spoke = mix(spoke, 0.5, clamp(length(fwidth(q)) * 5.0, 0.0, 1.0)); // tiny on screen: average
    float lit = max(max(spoke * step(0.22, rr), 1.0 - smoothstep(0.16, 0.22, rr)), smoothstep(0.8, 0.88, rr));
    diffuseColor.rgb *= mix(0.12, 1.0, lit);
    carBase = diffuseColor.rgb;
  }
  if (abs(carId - 1.0) < 0.5) diffuseColor.rgb *= 1.0 - 0.5 * carMetal; // metallic: colour moves into the reflection
  if (abs(carId - 3.0) < 0.5) diffuseColor.rgb *= 0.35;
`;

const CAR_SHINE = /* glsl */ `
  if (carId > 0.5 && carId < 7.5) {
    vec3 nV = normalize(normal);
    vec3 vV = normalize(vViewPosition);
    float nv = saturate(dot(nV, vV));
    vec3 rW = normalize((vec4(reflect(-vV, nV), 0.0) * viewMatrix).xyz);
    vec3 env = carEnv(rW);
    float fres = pow(1.0 - nv, 4.0);
    float dayK = 1.0 - 0.65 * uNight; // night: lamps are the show
    if (carId < 1.5) {
      // Paint under clearcoat: fresnel sky reflection, sharp sun glint; metals add a tinted mirror and sheen.
      float f = 0.05 + 0.6 * fres;
      vec3 metalRefl = env * carBase * (0.55 + 0.45 * fres) * carMetal;
      outgoingLight = outgoingLight * (1.0 - 0.25 * f) + (env * f + metalRefl) * dayK
        + gGlint * 0.9 + gSheen * carBase * carMetal * 0.5;
    } else if (carId < 2.5) {
      // Tinted glass: mostly reflection, plus a soft diagonal streak.
      float d = fract((vLocal.z * 0.8 + vLocal.y * 1.3 + vLocal.x * 0.25) * 0.42);
      float streak = smoothstep(0.0, 0.03, d) * (1.0 - smoothstep(0.07, 0.11, d))
        + 0.5 * smoothstep(0.16, 0.18, d) * (1.0 - smoothstep(0.2, 0.22, d));
      outgoingLight = outgoingLight * 0.8 + env * (0.08 + 0.6 * fres) * dayK
        + uSkyHor * streak * 0.16 * dayK + gGlint * 0.9;
    } else if (carId < 3.5) {
      // Chrome: a bright mirror of the sky and street.
      outgoingLight = outgoingLight + env * mix(0.75, 1.0, fres) * mix(0.35, 1.0, dayK) + gGlint * 1.8 + gSheen * 0.25;
    } else if (carId < 4.5) {
      // Satin black trim: a faint sheen at grazing angles.
      outgoingLight += env * (0.03 + 0.22 * fres) * dayK + gSheen * 0.05;
    } else if (carId < 5.5) {
      outgoingLight = outgoingLight * 0.7 + env * carBase * 0.55 * dayK + gGlint * 0.9 + gSheen * carBase * 0.25;
    } else if (carId < 6.5) {
      outgoingLight *= 0.85; // tyres: matte rubber
    } else {
      outgoingLight += env * 0.25 * fres * dayK + gGlint * 1.2; // lamp lenses
    }
  }
`;

// ---------------------------------------------------------------------
// Contact shadows: a soft dark blob on the road under each car.
// ---------------------------------------------------------------------

const SHADOW_Y = 0.07; // over the road (0.02) and its paint, under every car's body

let shadowGeo: THREE.BufferGeometry | null = null;
let shadowMat: THREE.MeshBasicMaterial | null = null;

/** A soft rounded rectangle (alpha), painted once: 32×64 px. */
function shadowParts(): { geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial } {
  if (shadowGeo && shadowMat) return { geo: shadowGeo, mat: shadowMat };
  const w = 32, h = 64;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Rounded-rect distance in metres-ish units (car ≈ 2 × 4.4).
      const px = (((x + 0.5) / w) * 2 - 1) * 1.0, pz = (((y + 0.5) / h) * 2 - 1) * 2.2;
      const qx = Math.abs(px) - 0.62, qz = Math.abs(pz) - 1.7;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 0.12;
      const t = Math.min(1, Math.max(0, (d + 0.22) / 0.5));
      const a = 1 - t * t * (3 - 2 * t);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(a * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  shadowMat = new THREE.MeshBasicMaterial({
    color: '#05070c',
    alphaMap: tex,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // A little lighter at night (no sun to block), still there as contact shade.
  shadowMat.onBeforeRender = () => {
    shadowMat!.opacity = 0.7 - 0.2 * kitNight.value;
  };
  return { geo: shadowGeo, mat: shadowMat };
}

/** Shadow footprint for a car geometry: width, length and centre offset along the car. */
function footprint(g: THREE.BufferGeometry): { sx: number; sz: number; cz: number } {
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox!;
  return { sx: (bb.max.x - bb.min.x) * 1.22, sz: (bb.max.z - bb.min.z) * 1.12, cz: (bb.max.z + bb.min.z) / 2 };
}

/**
 * One InstancedMesh (one draw call) of contact shadows for every moving
 * car in a group of traffic meshes (world/traffic.ts names them "car-…").
 * Call sync() after the cars move: it copies each car's position and
 * heading (not its lean) into the shadow's matrix.
 */
export class CarShadows {
  readonly mesh: THREE.InstancedMesh;
  private sources: { mesh: THREE.InstancedMesh; sx: number; sz: number; cz: number }[] = [];

  constructor(group: THREE.Object3D) {
    for (const o of group.children) {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh && m.name.startsWith('car-')) this.sources.push({ mesh: m, ...footprint(m.geometry) });
    }
    const total = this.sources.reduce((n, s) => n + s.mesh.count, 0);
    const { geo, mat: m } = shadowParts();
    this.mesh = new THREE.InstancedMesh(geo, m, Math.max(1, total));
    this.mesh.count = total;
    this.mesh.name = 'car-shadows';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 1;
    group.add(this.mesh);
    this.sync();
  }

  sync(): void {
    const out = this.mesh.instanceMatrix.array as Float32Array;
    let k = 0;
    for (const s of this.sources) {
      const a = s.mesh.instanceMatrix.array;
      for (let i = 0; i < s.mesh.count; i++, k++) {
        const o = i * 16, d = k * 16;
        const zx = a[o + 8], zz = a[o + 10];
        const l = Math.hypot(zx, zz);
        if (l < 1e-6) {
          out.fill(0, d, d + 16); // hidden car: no shadow
          continue;
        }
        const fx = zx / l, fz = zz / l;
        out[d] = fz * s.sx; out[d + 1] = 0; out[d + 2] = -fx * s.sx; out[d + 3] = 0;
        out[d + 4] = 0; out[d + 5] = 1; out[d + 6] = 0; out[d + 7] = 0;
        out[d + 8] = fx * s.sz; out[d + 9] = 0; out[d + 10] = fz * s.sz; out[d + 11] = 0;
        out[d + 12] = a[o + 12] + fx * s.cz; out[d + 13] = SHADOW_Y; out[d + 14] = a[o + 14] + fz * s.cz; out[d + 15] = 1;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose(); // geometry and material are shared
  }
}

/**
 * One vehicle as a plain mesh in the full look (your own car, the
 * driveway, the showroom): showroom detail, with its contact shadow as a
 * child so it follows the car.
 */
export function vehicleMesh(v: VehicleDef, paint: string, lod: CarLod = 2): THREE.Mesh {
  const g = vehicleGeometry(v, paint, lod);
  const m = new THREE.Mesh(g, vehicleMaterial());
  const { geo, mat: sm } = shadowParts();
  const f = footprint(g);
  const s = new THREE.Mesh(geo, sm);
  s.scale.set(f.sx, 1, f.sz);
  // A bit higher than traffic's: your car can stop on a kerb (sidewalks are 0.18 m),
  // and seen from above a soft blob 0.2 m up still sits under the car.
  s.position.set(0, 0.2, f.cz);
  s.renderOrder = 1;
  s.name = 'car-shadow';
  m.add(s);
  return m;
}
