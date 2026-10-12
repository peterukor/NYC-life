// =====================================================================
// sprites.ts — building pictures that live 3D things can walk behind.
//
// Each picture (public/sprites/<name>.webp) comes with a depth picture
// (<name>.depth.png): for every pixel, how far it is from the camera,
// measured from the building's anchor point. The shader writes that
// distance into the depth buffer, so a 3D person walking behind a tower
// is hidden by it, and one in front of it is drawn over it, pixel-exact.
//
// The picture is a flat card facing the camera, standing at the anchor
// (the centre of the building's footprint, on the ground).
// =====================================================================

import * as THREE from 'three';
import { CAM_DIR, CAM_FAR, CAM_NEAR } from './view.ts';

export interface SpriteMeta {
  px: number;
  /** Picture size in metres. */
  w: number;
  h: number;
  /** Picture centre relative to the anchor, along the camera's right / up, in metres. */
  cx: number;
  cy: number;
  depthRange: number;
  foot: [number, number];
  height: number;
  /** Height of the picture's walkable top surface at its centre (road tiles), if measured. */
  top?: number;
}

export interface SpriteAsset {
  name: string;
  meta: SpriteMeta;
  map: THREE.Texture;
  depth: THREE.Texture;
}

const base = () => `${import.meta.env.BASE_URL}sprites/`;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error(`could not load ${url}`));
    img.src = url;
  });
}

const cache = new Map<string, Promise<SpriteAsset>>();

/** Load a picture, its depth and its sizes (once; later calls share it). */
export function loadSprite(name: string): Promise<SpriteAsset> {
  let p = cache.get(name);
  if (!p) {
    p = (async () => {
      const [meta, img, dimg] = await Promise.all([
        fetch(`${base()}${name}.json`).then((r) => {
          if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
          return r.json() as Promise<SpriteMeta>;
        }),
        loadImage(`${base()}${name}.webp`),
        loadImage(`${base()}${name}.depth.png`),
      ]);
      // The colours are already exactly what we want on screen: no colour
      // conversion, no lighting, no tone mapping.
      const map = new THREE.Texture(img);
      map.colorSpace = THREE.NoColorSpace;
      map.anisotropy = 4;
      map.needsUpdate = true;
      // Depth is two bytes per pixel: it must never be blended or blurred.
      const depth = new THREE.Texture(dimg);
      depth.colorSpace = THREE.NoColorSpace;
      depth.minFilter = depth.magFilter = THREE.NearestFilter;
      depth.generateMipmaps = false;
      depth.needsUpdate = true;
      return { name, meta, map, depth };
    })();
    cache.set(name, p);
  }
  return p;
}

const vert = /* glsl */ `
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D depthMap;
  uniform float range;
  uniform float near;
  uniform float far;
  uniform float opacity;
  uniform float dscale;
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.02) discard;
    vec3 d = texture2D(depthMap, vUv).rgb;
    float q = (floor(d.r * 255.0 + 0.5) * 256.0 + floor(d.g * 255.0 + 0.5)) / 65535.0;
    // Metres from the camera; nudged 0.25 m closer so the picture's own
    // ground (shadows, pavement) never flickers against the 3D ground.
    float dist = vDist + (q * 2.0 * range - range) * dscale - 0.25;
    gl_FragDepth = clamp((dist - near) / (far - near), 0.0, 1.0);
    gl_FragColor = vec4(c.rgb, c.a * opacity);
  }
`;

/** A building picture standing at (x, z) on the ground. */
const shared = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial }>();

/** scale: draw the picture bigger or smaller than photographed (depth is scaled to match). */
export function makeSpriteMesh(a: SpriteAsset, x: number, z: number, scale = 1): THREE.Mesh {
  const key = `${a.name}@${scale}`;
  let s = shared.get(key);
  if (!s) {
    s = { geo: spriteGeometry(a), mat: spriteMaterial(a) };
    s.mat.uniforms.dscale.value = scale;
    shared.set(key, s);
  }
  const mesh = new THREE.Mesh(s.geo, s.mat);
  mesh.scale.setScalar(scale);
  // Sink pictures whose own ground is raised (road tiles) so it sits at y = 0.
  mesh.position.set(x, -(a.meta.top ?? 0) * scale, z);
  // Face the camera: same orientation as the camera itself.
  mesh.quaternion.copy(cameraQuaternion());
  mesh.userData.sprite = a.name;
  return mesh;
}

function spriteGeometry(a: SpriteAsset): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(a.meta.w, a.meta.h);
  geo.translate(a.meta.cx, a.meta.cy, 0);
  return geo;
}

function spriteMaterial(a: SpriteAsset): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: a.map },
      depthMap: { value: a.depth },
      range: { value: a.meta.depthRange },
      near: { value: CAM_NEAR },
      far: { value: CAM_FAR },
      opacity: { value: 1 },
      dscale: { value: 1 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: true,
    depthTest: true,
  });
}

let q: THREE.Quaternion | null = null;
/** The fixed camera's orientation (also used by the camera itself). */
export function cameraQuaternion(): THREE.Quaternion {
  if (!q) {
    const m = new THREE.Matrix4().lookAt(CAM_DIR, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    q = new THREE.Quaternion().setFromRotationMatrix(m);
  }
  return q;
}
