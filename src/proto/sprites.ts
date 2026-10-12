// =====================================================================
// sprites.ts — building pictures that live 3D things can walk behind.
//
// Each picture (public/sprites/<name>.webp) comes with a depth picture
// (<name>.depth.png): for every pixel, how far it is from the camera,
// measured from the picture's anchor point (the centre of its footprint
// on the ground). The shader writes that distance into the depth
// buffer, so a 3D person walking behind a tower is hidden by it.
//
// PERFORMANCE: every copy of the same picture is drawn in ONE go
// (instancing), so the whole of Manhattan costs about two draw calls per
// different picture, however many blocks use it.
//   • pass 1 draws the mostly-solid part of every picture and writes depth;
//   • pass 2 draws the see-through part (soft shadows, edges) on top,
//     blended, after everything solid is in place.
// Copies are sorted far-to-near once (the camera never turns).
//
// MEMORY: each picture has a small "far" copy (1/4 size, always loaded)
// and the sharp "near" copy, loaded only while some copy of the picture
// is on screen and the camera is zoomed in; dropped again when not.
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
  /** Height of the picture's own ground at its centre (road tiles), if measured. */
  top?: number;
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

async function loadPair(name: string, far: boolean): Promise<{ map: THREE.Texture; depth: THREE.Texture }> {
  const sfx = far ? '.far' : '';
  const [img, dimg] = await Promise.all([loadImage(`${base()}${name}${sfx}.webp`), loadImage(`${base()}${name}${sfx}.depth.png`)]);
  // Colours are already exactly what we want on screen: no conversion.
  const map = new THREE.Texture(img);
  map.colorSpace = THREE.NoColorSpace;
  map.anisotropy = 4;
  map.needsUpdate = true;
  // Depth is two bytes per pixel: never blend or blur it.
  const depth = new THREE.Texture(dimg);
  depth.colorSpace = THREE.NoColorSpace;
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  depth.generateMipmaps = false;
  depth.needsUpdate = true;
  return { map, depth };
}

const vert = /* glsl */ `
  attribute vec3 iOffset;
  attribute float iScale;
  varying vec2 vUv;
  varying float vDist;
  varying float vScale;
  void main() {
    vUv = uv;
    vScale = iScale;
    vec4 world = modelMatrix * vec4(position * iScale, 1.0) + vec4(iOffset, 0.0);
    vec4 mv = viewMatrix * world;
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
  uniform float solid; // 1: solid pass, 0: see-through pass
  varying vec2 vUv;
  varying float vDist;
  varying float vScale;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (solid > 0.5) { if (c.a < 0.5) discard; }
    else { if (c.a >= 0.5 || c.a < 0.02) discard; }
    vec3 d = texture2D(depthMap, vUv).rgb;
    float q = (floor(d.r * 255.0 + 0.5) * 256.0 + floor(d.g * 255.0 + 0.5)) / 65535.0;
    // Metres from the camera; nudged 0.25 m closer so a picture's own
    // ground never flickers against the 3D ground.
    float dist = vDist + (q * 2.0 * range - range) * vScale - 0.25;
    gl_FragDepth = clamp((dist - near) / (far - near), 0.0, 1.0);
    gl_FragColor = c;
  }
`;

export interface Instance {
  x: number;
  z: number;
  scale?: number;
}

/** All copies of one picture. */
class Batch {
  meta: SpriteMeta | null = null;
  far: { map: THREE.Texture; depth: THREE.Texture } | null = null;
  near: { map: THREE.Texture; depth: THREE.Texture } | null = null;
  nearLoading = false;
  lastNeeded = 0;
  solid: THREE.Mesh | null = null;
  soft: THREE.Mesh | null = null;
  readonly items: Instance[] = [];
  constructor(readonly name: string) {}

  build(scene: THREE.Scene, q: THREE.Quaternion): void {
    const m = this.meta!;
    const plane = new THREE.PlaneGeometry(m.w, m.h).translate(m.cx, m.cy, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute('position', plane.getAttribute('position'));
    geo.setAttribute('uv', plane.getAttribute('uv'));
    // Far-to-near order (never changes: the camera only slides and zooms).
    const sorted = [...this.items].sort((a, b) => depthOf(b) - depthOf(a));
    const off = new Float32Array(sorted.length * 3);
    const sc = new Float32Array(sorted.length);
    sorted.forEach((it, i) => {
      const s = it.scale ?? 1;
      off.set([it.x, -(m.top ?? 0) * s, it.z], i * 3);
      sc[i] = s;
    });
    geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(sc, 1));
    geo.instanceCount = sorted.length;
    const mat = (solid: boolean) =>
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: this.far!.map },
          depthMap: { value: this.far!.depth },
          range: { value: m.depthRange },
          near: { value: CAM_NEAR },
          far: { value: CAM_FAR },
          solid: { value: solid ? 1 : 0 },
        },
        vertexShader: vert,
        fragmentShader: frag,
        // Both passes blend (dark soft shadows can be more than half opaque);
        // only the solid pass writes depth.
        transparent: true,
        depthWrite: solid,
        depthTest: true,
      });
    this.solid = new THREE.Mesh(geo, mat(true));
    this.soft = new THREE.Mesh(geo, mat(false));
    for (const mesh of [this.solid, this.soft]) {
      mesh.quaternion.copy(q);
      mesh.frustumCulled = false;
      mesh.userData.sprite = this.name;
    }
    this.soft.renderOrder = 10; // after every solid thing
    scene.add(this.solid, this.soft);
  }

  use(t: { map: THREE.Texture; depth: THREE.Texture }): void {
    for (const mesh of [this.solid, this.soft]) {
      if (!mesh) continue;
      const u = (mesh.material as THREE.ShaderMaterial).uniforms;
      u.map.value = t.map;
      u.depthMap.value = t.depth;
    }
  }

  /** Any copy inside the ground rectangle? */
  visibleIn(x0: number, z0: number, x1: number, z1: number): boolean {
    const pad = 60;
    return this.items.some((it) => it.x > x0 - pad && it.x < x1 + pad && it.z > z0 - pad && it.z < z1 + pad);
  }
}

const depthOf = (it: Instance) => -(it.x * CAM_DIR.x + it.z * CAM_DIR.z); // larger = farther from the camera

/** Every picture on the map, batched by picture. */
export class SpriteWorld {
  private batches = new Map<string, Batch>();
  constructor(private scene: THREE.Scene) {}

  add(name: string, x: number, z: number, scale = 1): void {
    let b = this.batches.get(name);
    if (!b) {
      b = new Batch(name);
      this.batches.set(name, b);
    }
    b.items.push({ x, z, scale });
  }

  /** Load the small copies and build everything. Missing pictures are skipped. */
  async build(): Promise<void> {
    const q = cameraQuaternion();
    await Promise.all(
      [...this.batches.values()].map(async (b) => {
        try {
          const [meta, far] = await Promise.all([
            fetch(`${base()}${b.name}.json`).then((r) => {
              if (!r.ok) throw new Error(`${b.name}.json: ${r.status}`);
              return r.json() as Promise<SpriteMeta>;
            }),
            loadPair(b.name, true),
          ]);
          b.meta = meta;
          b.far = far;
          b.build(this.scene, q);
        } catch (e) {
          console.warn('[sprites]', b.name, e);
        }
      }),
    );
  }

  /**
   * Call a few times a second: loads sharp copies of pictures on screen
   * (when zoomed in) and drops the ones nobody has seen for a while.
   */
  stream(x0: number, z0: number, x1: number, z1: number, zoomedIn: boolean, now: number): void {
    for (const b of this.batches.values()) {
      if (!b.solid) continue;
      const needed = zoomedIn && b.visibleIn(x0, z0, x1, z1);
      if (needed) {
        b.lastNeeded = now;
        if (!b.near && !b.nearLoading) {
          b.nearLoading = true;
          loadPair(b.name, false)
            .then((t) => {
              b.near = t;
              b.use(t);
            })
            .catch(() => {})
            .finally(() => (b.nearLoading = false));
        }
      } else if (b.near && now - b.lastNeeded > 12) {
        b.use(b.far!);
        b.near.map.dispose();
        b.near.depth.dispose();
        b.near = null;
      }
    }
  }

  get count(): { pictures: number; sharp: number } {
    let sharp = 0;
    for (const b of this.batches.values()) if (b.near) sharp++;
    return { pictures: this.batches.size, sharp };
  }
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
