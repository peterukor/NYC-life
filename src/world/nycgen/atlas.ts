// =====================================================================
// atlas.ts — the ONE texture and ONE material every generated building,
// prop, tree and parked car in the city is drawn with.
//
// THE FACADE ATLAS
//   A small 512×512 picture split into a 4×4 grid of "tiles". Each tile
//   is one window bay of one floor (a brick window, a glass panel, a
//   shop window…), painted at runtime on a <canvas>, so it costs no
//   download at all. Buildings repeat a tile across their walls: a wall
//   8 bays wide and 6 floors tall shows 48 windows from just 4 corners.
//
// HOW COLOUR WORKS
//   The tile's ALPHA channel says "paint me": alpha 1 = wall (takes the
//   building's own colour), alpha 0 = keep the tile's colour (glass,
//   cream window frames, stone sills). The mask is worked out from the
//   painted colours (see facadeAtlas). So one brick tile becomes a red,
//   cream, mint or pink building just by changing the vertex colour.
//   Tile 0 is plain white, used for solid things (trim, props, trees).
//
// EXTRA TRICKS IN THE SHADER (all cheap enough for low-end phones)
//   • Contact shading: everything darkens slightly near the ground, so
//     buildings and props look "planted" instead of floating.
//   • Night windows: after sunset a random half of the windows light up
//     warm yellow (a different pattern for every building).
//   • See-through: a building between the camera and you fades out with
//     a fine screen-door pattern (see BuildingFades below).
//   • Hidden blocks: whole far-away stand-in blocks can be switched off
//     without rebuilding any geometry (used for level of detail).
// =====================================================================

import * as THREE from 'three';
import { kitNight } from '../../assets/kit.ts';
import { worldUniforms } from '../../render/world-uniforms.ts';

/** Tile numbers in the atlas. Add new ones in paintTile() below. */
export const TILE = {
  solid: 0,
  brickWindow: 1,
  brownstoneWindow: 2,
  prewarWindow: 3,
  glass: 4,
  ribbon: 5,
  storefront: 6,
  blankBrick: 7,
  roof: 8,
  door: 9,
  stripes: 10,
  shutter: 11,
  solar: 12,
  glassDark: 13,
  paver: 14,
  officeWindow: 15,
} as const;

const S = 128; // pixels per tile
const N = 4; // tiles per row

let atlasTex: THREE.DataTexture | null = null;

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

/** Sky-blue glass with a soft diagonal shine: the cartoon look of windows. */
function glassPane(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dark = false): void {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, dark ? '#4c6f96' : '#bfe6ff');
  g.addColorStop(1, dark ? '#253b5c' : '#5aa2d8');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.15, y + h);
  ctx.lineTo(x + w * 0.45, y);
  ctx.lineTo(x + w * 0.62, y);
  ctx.lineTo(x + w * 0.32, y + h);
  ctx.fill();
}

/** Paint the wall background of a tile: near-white so tinting works, with faint brick courses. */
function wall(ctx: CanvasRenderingContext2D, ox: number, oy: number, bricks: boolean): void {
  ctx.fillStyle = rgba(255, 255, 255, 1);
  ctx.fillRect(ox, oy, S, S);
  if (!bricks) return;
  ctx.fillStyle = rgba(214, 214, 214, 1);
  for (let row = 0; row < 16; row++) {
    const y = oy + row * 8;
    ctx.fillRect(ox, y, S, 1);
    for (let k = 0; k < 6; k++) ctx.fillRect(ox + ((k * 24 + (row % 2) * 12) % S), y, 1, 8);
  }
}

function paintTile(ctx: CanvasRenderingContext2D, tile: number): void {
  const ox = (tile % N) * S;
  const oy = Math.floor(tile / N) * S;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, S, S);
  ctx.clip();
  const frame = (x: number, y: number, w: number, h: number, color = '#ffffff', pad = 6) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x - pad, oy + y - pad, w + pad * 2, h + pad * 2);
  };
  switch (tile) {
    case TILE.solid:
      wall(ctx, ox, oy, false);
      break;
    case TILE.brickWindow:
      wall(ctx, ox, oy, true);
      frame(36, 22, 56, 74, '#fbf7ee', 7);
      ctx.fillStyle = '#e9dcc4';
      ctx.fillRect(ox + 26, oy + 8, 76, 10); // lintel
      ctx.fillRect(ox + 28, oy + 100, 72, 8); // sill
      glassPane(ctx, ox + 36, oy + 22, 56, 74);
      ctx.fillStyle = '#fbf7ee';
      ctx.fillRect(ox + 36, oy + 56, 56, 5);
      ctx.fillRect(ox + 62, oy + 22, 4, 74);
      break;
    case TILE.brownstoneWindow:
      wall(ctx, ox, oy, false);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      frame(38, 24, 52, 80, '#3a2a22', 6);
      ctx.fillStyle = '#efe2c8';
      ctx.beginPath();
      ctx.ellipse(ox + 64, oy + 18, 40, 14, 0, Math.PI, 0); // arched hood
      ctx.fill();
      ctx.fillRect(ox + 24, oy + 16, 80, 6);
      ctx.fillRect(ox + 30, oy + 108, 68, 7);
      glassPane(ctx, ox + 38, oy + 24, 52, 80, true);
      ctx.fillStyle = '#efe2c8';
      ctx.fillRect(ox + 38, oy + 62, 52, 4);
      break;
    case TILE.prewarWindow:
      wall(ctx, ox, oy, false);
      ctx.fillStyle = rgba(225, 225, 225, 1);
      ctx.fillRect(ox, oy + 120, S, 8); // floor line
      for (const x of [18, 70]) {
        frame(x, 26, 40, 70, '#f7f1e3', 5);
        glassPane(ctx, ox + x, oy + 26, 40, 70);
        ctx.fillStyle = '#f7f1e3';
        ctx.fillRect(ox + x, oy + 58, 40, 4);
      }
      break;
    case TILE.glass:
      glassPane(ctx, ox, oy, S, S);
      ctx.fillStyle = rgba(255, 255, 255, 1); // mullions take the building colour
      ctx.fillRect(ox, oy, S, 6);
      ctx.fillRect(ox, oy, 5, S);
      ctx.fillRect(ox + 62, oy, 4, S);
      break;
    case TILE.glassDark:
      glassPane(ctx, ox, oy, S, S, true);
      ctx.fillStyle = rgba(255, 255, 255, 1);
      ctx.fillRect(ox, oy, S, 10);
      ctx.fillRect(ox, oy, 6, S);
      break;
    case TILE.ribbon:
      wall(ctx, ox, oy, false);
      glassPane(ctx, ox, oy + 30, S, 62);
      ctx.fillStyle = rgba(245, 245, 245, 1);
      ctx.fillRect(ox + 60, oy + 30, 6, 62);
      break;
    case TILE.officeWindow:
      wall(ctx, ox, oy, false);
      glassPane(ctx, ox + 14, oy + 18, 100, 86);
      ctx.fillStyle = rgba(255, 255, 255, 1);
      ctx.fillRect(ox + 62, oy + 18, 4, 86);
      ctx.fillRect(ox + 14, oy + 58, 100, 4);
      break;
    case TILE.storefront:
      wall(ctx, ox, oy, false); // top band (sign strip) takes the colour
      ctx.fillStyle = '#2b2f3a';
      ctx.fillRect(ox, oy + 34, S, S - 34);
      glassPane(ctx, ox + 6, oy + 40, S - 12, S - 46);
      // A few shapes behind the glass so shops don't look empty.
      ctx.fillStyle = 'rgba(255,214,120,0.85)';
      ctx.fillRect(ox + 16, oy + 96, 30, 26);
      ctx.fillStyle = 'rgba(255,120,140,0.8)';
      ctx.fillRect(ox + 82, oy + 90, 26, 32);
      ctx.fillStyle = '#2b2f3a';
      ctx.fillRect(ox + 62, oy + 40, 5, S - 46);
      break;
    case TILE.blankBrick:
      wall(ctx, ox, oy, true);
      break;
    case TILE.roof: {
      wall(ctx, ox, oy, false);
      // Gravel speckle, still mostly white so the roof colour shows.
      let s = 7;
      for (let i = 0; i < 500; i++) {
        s = (s * 16807) % 2147483647;
        const v = 200 + (s % 50);
        ctx.fillStyle = rgba(v, v, v, 1);
        ctx.fillRect(ox + (s % S), oy + ((s >> 7) % S), 2, 2);
      }
      break;
    }
    case TILE.door:
      wall(ctx, ox, oy, false);
      frame(30, 12, 68, 116, '#f3ead6', 6);
      ctx.fillStyle = '#7a2e2a';
      ctx.fillRect(ox + 30, oy + 12, 68, 116);
      glassPane(ctx, ox + 40, oy + 20, 48, 26, true);
      ctx.fillStyle = '#e8c14a';
      ctx.fillRect(ox + 86, oy + 74, 6, 6);
      break;
    case TILE.stripes:
      // Even stripes are neutral white (take the awning colour); odd ones stay cream.
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#fff4e0' : '#ffffff';
        ctx.fillRect(ox + i * 16, oy, 16, S);
      }
      break;
    case TILE.shutter:
      ctx.fillStyle = '#9aa1ab';
      ctx.fillRect(ox, oy, S, S);
      ctx.fillStyle = '#7e8590';
      for (let y = 0; y < S; y += 8) ctx.fillRect(ox, oy + y, S, 2);
      break;
    case TILE.solar:
      ctx.fillStyle = '#d9dde3';
      ctx.fillRect(ox, oy, S, S);
      ctx.fillStyle = '#1f3c78';
      for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) ctx.fillRect(ox + 3 + x * 31, oy + 3 + y * 31, 28, 28);
      break;
    case TILE.paver:
      wall(ctx, ox, oy, false);
      ctx.fillStyle = rgba(220, 220, 220, 1);
      for (let k = 0; k < S; k += 32) {
        ctx.fillRect(ox + k, oy, 2, S);
        ctx.fillRect(ox, oy + k, S, 2);
      }
      break;
  }
  ctx.restore();
}

/**
 * The shared facade atlas (painted once, on first use).
 * After painting we work out the "paint me" mask on the CPU: pixels that
 * are neutral (no hue) and light are wall; anything with a hue (blue
 * glass, cream frames, stone sills) or dark keeps its own colour. The
 * mask goes in the alpha channel of a raw texture, so nothing is lost.
 */
export function facadeAtlas(): THREE.DataTexture {
  if (atlasTex) return atlasTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S * N;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  for (let t = 0; t < N * N; t++) paintTile(ctx, t);
  const img = ctx.getImageData(0, 0, S * N, S * N).data;
  const data = new Uint8Array(img.length);
  for (let i = 0; i < img.length; i += 4) {
    const r = img[i], g = img[i + 1], b = img[i + 2];
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = hi - lo <= 7 && lum > 150 ? 255 : 0;
  }
  atlasTex = new THREE.DataTexture(data, S * N, S * N, THREE.RGBAFormat, THREE.UnsignedByteType);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.generateMipmaps = true;
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  atlasTex.magFilter = THREE.LinearFilter;
  atlasTex.anisotropy = 2;
  atlasTex.needsUpdate = true;
  return atlasTex;
}

// ---------------------------------------------------------------------
// Per-building fade values (see-through and level of detail)
// ---------------------------------------------------------------------

/**
 * One byte per building in a tiny texture the vertex shader reads.
 *   0        = solid
 *   1..229   = fading (see-through)
 *   255      = hidden completely (used to switch off far stand-ins)
 * Building ids are given out by allocate(); far-block switches use ids too.
 */
export class BuildingFades {
  static readonly W = 1024;
  static readonly H = 8;
  readonly data = new Uint8Array(BuildingFades.W * BuildingFades.H);
  readonly texture = new THREE.DataTexture(this.data, BuildingFades.W, BuildingFades.H, THREE.RedFormat, THREE.UnsignedByteType);
  private next = 1; // id 0 = "never fades" (props, trees, cars)
  constructor() {
    this.texture.needsUpdate = true;
  }
  allocate(): number {
    if (this.next >= this.data.length) return 0;
    return this.next++;
  }
  set(id: number, value01: number): void {
    if (!id) return;
    const v = Math.round(Math.min(1, Math.max(0, value01)) * 255);
    if (this.data[id] !== v) {
      this.data[id] = v;
      this.texture.needsUpdate = true;
    }
  }
  get(id: number): number {
    return this.data[id] / 255;
  }
}

/**
 * The city material: Lambert lighting + the atlas + vertex colours, with
 * the extra tricks listed at the top of this file. One shared instance.
 */
export function cityMaterial(fades: BuildingFades): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const atlas = facadeAtlas();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlas = { value: atlas };
    shader.uniforms.uFades = { value: fades.texture };
    shader.uniforms.uNight = kitNight;
    shader.uniforms.uSnow = worldUniforms.uSnow;
    shader.uniforms.uWet = worldUniforms.uWet;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute vec2 aCell;
attribute vec2 aInfo;
uniform sampler2D uFades;
varying vec2 vCell;
varying float vTile;
varying float vFade;
varying float vY;
varying float vSeed;
varying float vUp;
void main() {
  vUp = normal.y;
  vCell = aCell;
  vTile = aInfo.x;
  vSeed = aInfo.y;
  int bid = int(aInfo.y + 0.5);
  vFade = texelFetch(uFades, ivec2(bid % ${BuildingFades.W}, bid / ${BuildingFades.W}), 0).r;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vY = (modelMatrix * vec4(transformed, 1.0)).y;
  if (vFade > 0.99) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // hidden: outside the screen`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform sampler2D uAtlas;
uniform float uNight;
uniform float uSnow;
uniform float uWet;
varying float vUp;
varying vec2 vCell;
varying float vTile;
varying float vFade;
varying float vY;
varying float vSeed;
float cellHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  if (vFade > 0.004) {
    const float bayer[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    int bi = int(mod(gl_FragCoord.x, 4.0)) + int(mod(gl_FragCoord.y, 4.0)) * 4;
    if ((bayer[bi] + 0.5) / 16.0 < 0.92 * vFade / 0.9) discard;
  }`,
      )
      .replace(
        '#include <color_fragment>',
        `
  float tile = floor(vTile + 0.5);
  vec2 tileOrigin = vec2(mod(tile, ${N}.0), floor(tile / ${N}.0));
  vec2 f = fract(vCell);
  vec2 auv = (tileOrigin + 0.015 + vec2(f.x, 1.0 - f.y) * 0.97) / ${N}.0;
  vec2 dx = dFdx(vCell) * (0.97 / ${N}.0);
  vec2 dy = dFdy(vCell) * (0.97 / ${N}.0);
  dx.y = -dx.y;
  dy.y = -dy.y;
  vec4 texel = textureGrad(uAtlas, auv, dx, dy);
  vec3 base = mix(texel.rgb, texel.rgb * vColor.rgb, texel.a);
  // Contact shading: darker right at the ground, full colour from ~3 m up.
  base *= mix(0.6, 1.0, smoothstep(0.0, 3.2, vY));
  // Weather: snow settles on anything facing up; rain darkens and cools.
  base = mix(base, vec3(0.97, 0.98, 1.0), min(1.0, uSnow * 1.15) * smoothstep(0.45, 0.8, vUp));
  base *= mix(vec3(1.0), vec3(0.84, 0.88, 0.95), uWet);
  diffuseColor.rgb = base;
  // Half the windows are lit at night. Far away one pixel covers several
  // windows, and picking lit/dark per pixel sparkles like static; blend
  // to the average glow as windows get smaller than a pixel.
  float isWindowTile = step(0.5, tile) * step(tile, 6.5);
  float litSharp = step(0.5, cellHash(floor(vCell) + vSeed * 0.731));
  float cover = max(length(dFdx(vCell)), length(dFdy(vCell)));
  float lit = mix(litSharp, 0.5, smoothstep(0.18, 0.6, cover));
  float windowLit = (1.0 - texel.a) * lit * isWindowTile;
  `,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += windowLit * uNight * vec3(1.0, 0.8, 0.45) * 0.95;');
  };
  m.customProgramCacheKey = () => 'nyc-city-v3';
  return m;
}

// ---------------------------------------------------------------------
// Ground textures (painted once): soft cartoon asphalt and sidewalk pavers.
// ---------------------------------------------------------------------

let ground: { asphalt: THREE.CanvasTexture; paver: THREE.CanvasTexture } | null = null;

export function groundTextures(): { asphalt: THREE.CanvasTexture; paver: THREE.CanvasTexture } {
  if (ground) return ground;
  const make = (paint: (ctx: CanvasRenderingContext2D, n: number) => void, n = 128) => {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    paint(c.getContext('2d')!, n);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  // Blue-grey asphalt with soft blotches (painted, not photographic).
  const asphalt = make((ctx, n) => {
    ctx.fillStyle = '#6d7586';
    ctx.fillRect(0, 0, n, n);
    let s = 11;
    for (let i = 0; i < 70; i++) {
      s = (s * 16807) % 2147483647;
      const x = s % n;
      const y = (s >> 8) % n;
      const r = 4 + (s % 12);
      ctx.fillStyle = s % 3 ? 'rgba(255,255,255,0.035)' : 'rgba(20,24,40,0.05)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  // Warm sidewalk squares with soft grout lines and a highlight edge.
  const paver = make((ctx, n) => {
    ctx.fillStyle = '#e9e2d6';
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = '#f5f0e7';
    ctx.fillRect(4, 4, n - 8, 10);
    ctx.fillStyle = 'rgba(120,105,90,0.35)';
    ctx.fillRect(0, 0, n, 3);
    ctx.fillRect(0, 0, 3, n);
    let s = 5;
    for (let i = 0; i < 40; i++) {
      s = (s * 16807) % 2147483647;
      ctx.fillStyle = 'rgba(150,130,110,0.08)';
      ctx.fillRect(s % n, (s >> 8) % n, 3, 3);
    }
  });
  ground = { asphalt, paver };
  return ground;
}
