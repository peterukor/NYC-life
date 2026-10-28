// =====================================================================
// home-interior.ts — your home, The Sims / Lagos Life style.
//
//   • No roof. The walls between you and the camera drop down to a low
//     ledge (a "cutaway"), and which walls drop follows the camera as it
//     swings round, so you always see in (setView).
//   • Every room has its own floor (planks, marble, tiles…) and every
//     wall its own paint or wallpaper — even one accent wall
//     (data/home-style.ts, render/home-surfaces.ts). Saved per home.
//   • Light: the time of day sets the sky through the windows and the
//     daylight; after dark the lamps you placed glow, throw pools of
//     light on the floor, wash the walls (LED strips, neon) and the
//     strongest few become real lights (more on stronger phones).
//   • Real furniture (data/furniture.ts) that you tap to use, recolour
//     (main + frame colour, bulb colour), and move: MOVE MODE picks a
//     piece up, a green shade means it fits, red means it doesn't
//     (world/furniture-fit.ts). Pendants hang from the ceiling; vases
//     and table lamps sit on whatever table is under them.
//
// Phones first: walls are merged into one mesh per finish, light pools,
// wall washes and contact shadows are one instanced mesh each, and real
// lights / shadows only switch on for the stronger quality tiers.
// =====================================================================

import * as THREE from 'three';
import { FURNITURE, type FurnitureDef, type LightDef } from '../data/furniture.ts';
import type { HomeItem, HomeLayout } from '../data/homes.ts';
import type { PlaceDef } from '../data/places.ts';
import { floorFromColor, type HomeStyle } from '../data/home-style.ts';
import { adTexture, blobShadowTexture, HOUSE_ADS, signTexture } from '../render/textures.ts';
import { floorMaterial, wallMaterial } from '../render/home-surfaces.ts';
import { HAIR_COLORS, makeAvatar, OUTFIT_COLORS, SKIN_TONES } from './avatar.ts';
import { FURNITURE_TIME, MODELS_INFO, type Finish, type FurnitureKit } from '../assets/furniture-kit.ts';
import type { Interior, InteriorObject } from './interior.ts';
import { buildYard, type YardOptions } from './home-yard.ts';
import { doorOfLayout, outline } from './footprint.ts';
import { rectAt, snapToWall, spotFree, WalkGrid, whyNot, type FitKind, type FitWorld, type Footprint } from './furniture-fit.ts';

export const WALL_H = 2.9;
const LOW_WALL = 0.55;
/** How high an inside wall stays when it's cut away. */
const INNER_LOW = 1.05;
const WALL_T = 0.2;

/** Shared by every wall material: which way the camera looks, so the near walls drop (see cutWalls). */
const CUT = {
  uView: { value: new THREE.Vector2(0, 1) },
  uCutAll: { value: 0 },
  uNoCut: { value: 0 },
  uLow: { value: LOW_WALL },
  uDrop: { value: WALL_H - LOW_WALL },
  // Inside walls cut down to waist height, not to the floor: you see every
  // room but the rooms still read as rooms (Lagos Life, Peter 2026-10-27).
  uLowIn: { value: INNER_LOW },
  uDropIn: { value: WALL_H - INNER_LOW },
};

/**
 * Teach a material the cutaway: wall vertices above the ledge drop down
 * when their wall faces the camera. Per-vertex `aWall` = (normal x,
 * normal z, flags): flag 1 = outer wall, +2 = vanish when cut (window
 * glass and door headers, which would otherwise end up on the floor).
 */
function cutaway<M extends THREE.Material>(m: M): M {
  if (m.userData.cutaway) return m;
  m.userData.cutaway = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r);
    Object.assign(shader.uniforms, CUT);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aWall;\nuniform vec2 uView;\nuniform float uCutAll;\nuniform float uNoCut;\nuniform float uLow;\nuniform float uDrop;\nuniform float uLowIn;\nuniform float uDropIn;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float facing = dot(aWall.xy, uView);
          float outer = mod(aWall.z, 2.0);
          bool cut = uNoCut < 0.5 && (uCutAll > 0.5 || (outer > 0.5 ? facing > 0.3 : abs(facing) > 0.5));
          float low = outer > 0.5 ? uLow : uLowIn;
          if (cut && position.y > low + 0.01) {
            if (aWall.z > 1.5) transformed.y = -1.0;
            else transformed.y -= outer > 0.5 ? uDrop : uDropIn;
          }
        }`,
      );
  };
  m.customProgramCacheKey = () => `cutaway-${m.type}`;
  m.needsUpdate = true;
  return m;
}

export interface HomeInterior extends Interior {
  layout: HomeLayout;
  /** The current arrangement (save this to keep the player's changes). */
  items: HomeItem[];
  /** Floor meshes: tap targets when placing furniture. */
  floors: THREE.Object3D[];
  /** Pick a piece up: remembers where it was and shows the floor shade. */
  beginMove: (uid: string) => void;
  /** Slide the held piece to a spot (snapped to a 10 cm grid). Returns whether it fits there. */
  dragTo: (uid: string, x: number, z: number) => boolean;
  /** Turn the held piece. Returns whether it fits. */
  rotateItem: (uid: string, step?: number) => boolean;
  /** Put it down: if it fits it stays (and that's the new "before"), otherwise it slides back. Returns the reason it didn't fit, or null. */
  drop: (uid: string) => string | null;
  /** Leave move mode: `cancel` puts it back where it was when picked up. */
  endMove: (uid: string, cancel: boolean) => void;
  /** Where the held piece is now (to drag it by the point you grabbed). */
  itemPos: (uid: string) => { x: number; z: number } | null;
  /** Is this standing spot clear? */
  spotFree: (x: number, z: number) => boolean;
  /** A walk around the furniture from one spot to another (null = no way there). */
  walkPath: (fx: number, fz: number, tx: number, tz: number) => { x: number; z: number }[] | null;
  /** Take a piece out of the home (into storage). */
  removePiece: (uid: string) => void;
  /** Bring a piece in at the free spot nearest (x, z). Returns its uid, or null if there's no room. */
  addPiece: (item: string, x: number, z: number, rot?: number, finish?: Pick<HomeItem, 'a' | 'b' | 'lc'>) => string | null;
  /** A piece's spot, turn and footprint (for posing the player on it). */
  pieceInfo: (uid: string) => { item: string; x: number; z: number; rot: number; fp: Footprint } | null;
  /** Any catalogue piece's footprint and height (QA: planning layouts). */
  footprintOf: (item: string) => (Footprint & { h: number }) | null;
  /** The first piece you use that can't be reached from the door (null = all fine). */
  blockedUse: () => string | null;
  /** Pieces standing where they shouldn't (for QA of the home layouts). */
  clashes: () => { uid: string; why: string }[];
  /** Glow the piece being moved (null = none). */
  highlight: (uid: string | null) => void;
  /** Homes: you can move furniture. Venues (shops, bars): you can't. */
  movable: boolean;
  // ---- the Lagos Life bits
  /** The home's floors, walls and lights as they are now (save this). */
  style: HomeStyle;
  /** Repaint / refloor (a whole new style, or a change to one room or wall). */
  setStyle: (style: HomeStyle) => void;
  /** Recolour a piece (main, frame, bulb colour). */
  setFinish: (uid: string, finish: Pick<HomeItem, 'a' | 'b' | 'lc'>) => void;
  /** What's under a ray: a wall face (with its key), a room's floor, or nothing. */
  pickSurface: (ray: THREE.Ray) => { kind: 'wall'; key: string; room: number } | { kind: 'floor'; room: number } | null;
  /** The camera's direction (from the room towards the camera) and mode: drops the near walls. */
  setView: (dirX: number, dirZ: number, mode?: 'cutaway' | 'top' | 'walls-up') => void;
  /** Lamps: on after dark ('auto'), always on, or off. */
  setLights: (mode: 'auto' | 'on' | 'off') => void;
  /** Are the lamps lit right now? */
  lightsLit: () => boolean;
  /** Preview a time of day (hours, 0–24), or null to follow the clock. */
  previewHour: (hour: number | null) => void;
  /** Which slots a piece can be recoloured in ('a' main, 'b' frame, 'lc' bulb colour). */
  recolorable: (item: string) => ('a' | 'b' | 'lc')[];
  /** A room's floor and wall style as shown now (saved choice, else the plan's). */
  roomFloor: (room: number) => string;
  roomWall: (room: number) => string;
  /** The room a wall face looks into. */
  faceRoom: (key: string) => number;
}

export interface BuildOptions {
  /** Venues: the counter offers these (the place's own actions). */
  placeActions?: string[];
  /** Venues get a name sign and a few locals and staff. */
  venue?: boolean;
  /** The home's saved floors, walls and lights. */
  style?: HomeStyle;
  /** The hour of the day now (0–24, fractional), for daylight and lamps. */
  clock?: () => number;
  /** Graphics tier: how many real lights and whether the sun casts shadows. */
  tier?: 'low' | 'medium' | 'high';
  /** Homes: the garden round the house (lawn, paths, lamps, your car). */
  yard?: YardOptions;
}

/** How venues are lit (layout.mood): background, sky and ground light, the "sun", and how dark it reads (lamps glow more). */
const MOODS: Record<'bright' | 'cozy' | 'bar' | 'club' | 'arcade' | 'casino', { bg: string; sky: string; ground: string; hemi: number; sun: string; sunI: number; dark: number }> = {
  bright: { bg: '#cfdbe4', sky: '#fff8ee', ground: '#7a6a5a', hemi: 1.2, sun: '#fff3e2', sunI: 0.9, dark: 0.15 },
  cozy: { bg: '#2a201a', sky: '#ffe6c8', ground: '#6a4a36', hemi: 1.0, sun: '#ffd9a8', sunI: 0.55, dark: 0.55 },
  bar: { bg: '#140c10', sky: '#ffd2ac', ground: '#6a3444', hemi: 1.05, sun: '#ffa070', sunI: 0.45, dark: 0.85 },
  club: { bg: '#0b0716', sky: '#d39bff', ground: '#5a1f70', hemi: 1.15, sun: '#ff6fd8', sunI: 0.5, dark: 0.95 },
  arcade: { bg: '#060a22', sky: '#9fb4ff', ground: '#3a1a80', hemi: 1.1, sun: '#22d3ee', sunI: 0.45, dark: 0.95 },
  casino: { bg: '#1c060c', sky: '#ffe0a8', ground: '#6a1428', hemi: 1.0, sun: '#ffc070', sunI: 0.45, dark: 0.7 },
};

/** Daylight through the day: sky colour, light colours and strengths, sun height, darkness (0 day … 1 night). */
function daylight(h: number) {
  const keys: [number, { bg: string; sky: string; ground: string; hemi: number; sun: string; sunI: number; elev: number; dark: number }][] = [
    [0, { bg: '#0d111c', sky: '#4a5a8c', ground: '#231d2a', hemi: 0.34, sun: '#7f96ff', sunI: 0.12, elev: 0.9, dark: 1 }],
    [5.5, { bg: '#1a1d33', sky: '#5d6798', ground: '#2a2230', hemi: 0.42, sun: '#8fa0ff', sunI: 0.15, elev: 0.6, dark: 0.9 }],
    [7, { bg: '#e8b9a0', sky: '#ffd9bf', ground: '#6b5348', hemi: 0.85, sun: '#ffb27a', sunI: 0.9, elev: 0.35, dark: 0.3 }],
    [9, { bg: '#c9dde8', sky: '#fff7ec', ground: '#6b5a4c', hemi: 1.2, sun: '#fff1dc', sunI: 1.35, elev: 0.75, dark: 0 }],
    [16, { bg: '#c9dde8', sky: '#fff7ec', ground: '#6b5a4c', hemi: 1.2, sun: '#fff1dc', sunI: 1.35, elev: 0.7, dark: 0 }],
    [18.3, { bg: '#e7a682', sky: '#ffcf9e', ground: '#5e4636', hemi: 0.8, sun: '#ff9a55', sunI: 1.0, elev: 0.25, dark: 0.35 }],
    [20, { bg: '#2a2443', sky: '#6a63a0', ground: '#2b2232', hemi: 0.45, sun: '#8a86d8', sunI: 0.2, elev: 0.5, dark: 0.85 }],
    [24, { bg: '#0d111c', sky: '#4a5a8c', ground: '#231d2a', hemi: 0.34, sun: '#7f96ff', sunI: 0.12, elev: 0.9, dark: 1 }],
  ];
  let i = 0;
  while (i < keys.length - 2 && h >= keys[i + 1][0]) i++;
  const [h0, a] = keys[i], [h1, b] = keys[i + 1];
  const t = THREE.MathUtils.clamp((h - h0) / (h1 - h0), 0, 1);
  const c = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  const n = (x: number, y: number) => x + (y - x) * t;
  return { bg: c(a.bg, b.bg), sky: c(a.sky, b.sky), ground: c(a.ground, b.ground), hemi: n(a.hemi, b.hemi), sun: c(a.sun, b.sun), sunI: n(a.sunI, b.sunI), elev: n(a.elev, b.elev), dark: n(a.dark, b.dark) };
}

/** A soft round glow (for light pools and bulb halos). */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** A wash of light up a wall: bright along the bottom edge, fading up and to the sides. */
function washTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const u = (x / 127) * 2 - 1, v = y / 127; // v: 0 top … 1 at the light
    const a = Math.max(0, 1 - u * u) * Math.pow(Math.max(0, 1 - Math.abs(v - 0.5) * 2), 1.6);
    const i = (y * 128 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/** A neon word: bright tube strokes with a glow, on a transparent canvas. */
function neonTexture(text: string, color: string, font: 'script' | 'block' = 'block'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const px = 96;
  const face = font === 'script' ? `italic 700 ${px}px "Brush Script MT", "Segoe Script", cursive` : `700 ${px}px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  g.font = face;
  const w = Math.ceil(g.measureText(text).width) + px;
  c.width = w;
  c.height = Math.round(px * 1.6);
  g.font = face;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  // Glow, then the coloured tube, then its white-hot core.
  g.shadowColor = color;
  g.shadowBlur = px * 0.35;
  g.strokeStyle = color;
  g.lineWidth = px * 0.12;
  for (let i = 0; i < 2; i++) g.strokeText(text, w / 2, c.height / 2);
  g.shadowBlur = 0;
  g.strokeStyle = '#ffffff';
  g.lineWidth = px * 0.035;
  g.globalAlpha = 0.85;
  g.strokeText(text, w / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Sunlight through a window, laid on the floor: four soft panes. */
function windowLightTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.filter = 'blur(5px)';
  g.fillStyle = '#ffffff';
  // Slanted a little, as if the sun comes in from the side.
  g.setTransform(1, 0, -0.25, 1, 18, 0);
  for (const [x, y] of [[16, 14], [64, 14], [16, 62], [64, 62]]) g.fillRect(x, y, 44, 44);
  return new THREE.CanvasTexture(c);
}

/** The view through the windows: day sky with far towers, or the city lit up at night. */
function cityView(night: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 160);
  if (night) {
    sky.addColorStop(0, '#0b1024');
    sky.addColorStop(1, '#2a2350');
  } else {
    sky.addColorStop(0, '#8ec9f0');
    sky.addColorStop(1, '#e3f1fb');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 160);
  for (let x = 0, i = 0; x < 256; x += 14 + (i % 3) * 5, i++) {
    const w = 12 + (i % 4) * 4, h = 40 + ((i * 37) % 70);
    g.fillStyle = night ? '#141a30' : '#a9bccb';
    g.fillRect(x, 160 - h, w, h);
    if (night) {
      for (let wy = 160 - h + 5; wy < 156; wy += 7) for (let wx = x + 2; wx < x + w - 2; wx += 4) {
        if (((wx * 13 + wy * 7 + i) % 5) < 2) {
          g.fillStyle = (wx + wy) % 3 ? '#ffd88a' : '#fff1c9';
          g.fillRect(wx, wy, 2, 3);
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildHome(place: PlaceDef, layout: HomeLayout, arrangement: HomeItem[], kit: FurnitureKit, opts: BuildOptions = {}): HomeInterior {
  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const t = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const W = layout.width;
  const D = layout.depth;
  const hw = W / 2;
  const hd = D / 2;
  const animated: ((dt: number) => void)[] = [];
  const tier = opts.tier ?? 'medium';
  const wallH = layout.wallHeight ?? WALL_H;
  CUT.uDrop.value = Math.max(0, wallH - LOW_WALL);
  CUT.uLowIn.value = Math.min(INNER_LOW, wallH);
  CUT.uDropIn.value = Math.max(0, wallH - INNER_LOW);
  let style: HomeStyle = structuredClone(opts.style ?? {});

  // ---------------------------------------------------------------- light
  scene.background = new THREE.Color('#1b2030');
  const hemi = new THREE.HemisphereLight('#fff6e8', '#5a4a40', 1.2);
  const sun = new THREE.DirectionalLight('#ffe9c8', 1.2);
  sun.position.set(-6, 12, 8);
  scene.add(hemi, sun, sun.target);
  const shadows = tier === 'high';
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = sun.shadow.camera;
    s.left = -hw - 1; s.right = hw + 1; s.top = hd + 1; s.bottom = -hd - 1; s.near = 1; s.far = 40;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
  }
  // Real point lights (a fixed number, so turning lamps on never recompiles shaders).
  const realLights: THREE.PointLight[] = [];
  for (let i = 0; i < ({ low: 0, medium: 2, high: 4 } as const)[tier]; i++) {
    const p = new THREE.PointLight('#ffd29a', 0, 6, 1.6);
    scene.add(p);
    realLights.push(p);
  }

  // ---------------------------------------------------------------- the base (a diorama plinth)
  const baseMat = t(new THREE.MeshLambertMaterial({ color: '#2e3240' }));
  for (const r of layout.shaped ? layout.rooms.map((x) => x.rect) : [[-hw, -hd, hw, hd] as [number, number, number, number]]) {
    const base = new THREE.Mesh(t(new THREE.BoxGeometry(r[2] - r[0] + 0.5, 0.45, r[3] - r[1] + 0.5)), baseMat);
    base.position.set((r[0] + r[2]) / 2, -0.235, (r[1] + r[3]) / 2);
    scene.add(base);
  }
  const door = doorOfLayout(layout);
  // Homes sit in a garden (Lagos Life style), venues in their own light.
  const yard = !opts.venue && opts.yard ? t(buildYard(layout, { ...opts.yard, shadows, storey: layout.upstairs ? WALL_H + 0.3 : 0 })) : null;
  if (yard) scene.add(yard.group);

  // ---------------------------------------------------------------- floors & walls (rebuilt by setStyle)
  const floors: THREE.Object3D[] = [];
  const shell = new THREE.Group();
  shell.name = 'shell';
  scene.add(shell);
  const shellDisposables: { dispose(): void }[] = [];
  const roomAt = (x: number, z: number): number => {
    for (let i = layout.rooms.length - 1; i >= 0; i--) {
      const [x0, z0, x1, z1] = layout.rooms[i].rect;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return i;
    }
    return -1;
  };
  const roomFloor = (i: number) => style.rooms?.[i]?.floor ?? layout.rooms[i].style?.floor ?? floorFromColor(layout.rooms[i].floor);
  const roomWall = (i: number) => style.rooms?.[i]?.wall ?? layout.rooms[i]?.style?.wall ?? `paint:${layout.wallColor}`;

  /** Wall faces, for tapping one to paint it: key, room, the face's line and normal. */
  interface Face { key: string; room: number; ax: number; az: number; bx: number; bz: number; nx: number; nz: number; outer: boolean }
  let faces: Face[] = [];

  // Every wall line (outer box + the layout's inner walls), split at door gaps.
  interface Seg { ax: number; az: number; bx: number; bz: number; outer: boolean; on: [number, number]; n?: [number, number] }
  const segs: Seg[] = [];
  const gapsOf: { a: [number, number]; b: [number, number]; s0: number; s1: number; n?: [number, number] }[] = [];
  const addLine = (a: [number, number], b: [number, number], outer: boolean, gaps: [number, number][] = [], n?: [number, number]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    let s = 0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (g0 - s > 0.05) segs.push({ ax: a[0] + dx * s, az: a[1] + dz * s, bx: a[0] + dx * g0, bz: a[1] + dz * g0, outer, on: [s, g0], n });
      gapsOf.push({ a, b, s0: g0, s1: g1, n });
      s = g1;
    }
    if (len - s > 0.05) segs.push({ ax: a[0] + dx * s, az: a[1] + dz * s, bx: b[0], bz: b[1], outer, on: [s, len], n });
  };
  if (layout.shaped) {
    // Outer walls traced round the rooms (world/footprint.ts), the front door cut where the plan says.
    for (const e of outline(layout)) {
      const alongX = Math.abs(e.nz) > 0.5;
      const onIt = alongX ? Math.abs(door.z - e.az) < 0.05 && door.x > Math.min(e.ax, e.bx) && door.x < Math.max(e.ax, e.bx) : Math.abs(door.x - e.ax) < 0.05 && door.z > Math.min(e.az, e.bz) && door.z < Math.max(e.az, e.bz);
      const a: [number, number] = [Math.min(e.ax, e.bx), Math.min(e.az, e.bz)], b: [number, number] = [Math.max(e.ax, e.bx), Math.max(e.az, e.bz)];
      const at = alongX ? door.x - a[0] : door.z - a[1];
      addLine(a, b, true, onIt && !layout.upstairs ? [[at - 1.2, at + 1.2]] : [], [e.nx, e.nz]);
    }
  } else {
    addLine([-hw, -hd], [hw, -hd], true, [], [0, -1]); // back
    addLine([-hw, -hd], [-hw, hd], true, [], [-1, 0]); // left
    addLine([hw, -hd], [hw, hd], true, [], [1, 0]); // right
    addLine([-hw, hd], [hw, hd], true, [[hw - 1.2, hw + 1.2]], [0, 1]); // front, the front door in the middle
  }
  for (const w of layout.walls) addLine(w.a, w.b, false, w.gaps);

  const capMat = cutaway(t(new THREE.MeshLambertMaterial({ color: '#fbf6ee' })));
  const trimMat = cutaway(t(new THREE.MeshLambertMaterial({ color: '#f7f3ec' })));
  const outsideMat = cutaway(t(new THREE.MeshLambertMaterial({ color: '#b9ab98' })));
  const viewDay = t(layout.windows?.view === 'park' ? parkView() : cityView(false));
  const viewNight = t(cityView(true));
  const glassMat = cutaway(t(new THREE.MeshBasicMaterial({ map: viewDay, toneMapped: false })));
  // The rooftop: the skyline across the river, behind the back and right sides (day or lit up at night).
  const skyMat = t(new THREE.MeshBasicMaterial({ map: viewDay, toneMapped: false, fog: false }));
  if (layout.backdrop === 'skyline') {
    const span = Math.max(layout.width, layout.depth) * 2.4;
    for (const [x, z, ry] of [[0, -hd - 9, 0], [hw + 9, 0, -Math.PI / 2]] as const) {
      const g = t(new THREE.PlaneGeometry(span, span * 0.32));
      const m = new THREE.Mesh(g, skyMat);
      m.position.set(x, span * 0.16 - 3.5, z);
      m.rotation.y = ry;
      scene.add(m);
    }
  }

  /** Collects quads per material, then makes one mesh per material. */
  class Buckets {
    private map = new Map<THREE.Material, { p: number[]; n: number[]; uv: number[]; w: number[] }>();
    quad(mat: THREE.Material, v: [number, number, number][], n: [number, number, number], uv: [number, number][], wall: [number, number, number]) {
      let b = this.map.get(mat);
      if (!b) this.map.set(mat, (b = { p: [], n: [], uv: [], w: [] }));
      for (const k of [0, 1, 2, 0, 2, 3]) {
        b.p.push(...v[k]);
        b.n.push(...n);
        b.uv.push(...uv[k]);
        b.w.push(...wall);
      }
    }
    /** A box (any orientation along x or z), all six sides. */
    box(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, wall: [number, number, number]) {
      const q = (v: [number, number, number][], n: [number, number, number]) => this.quad(mat, v, n, [[0, 0], [1, 0], [1, 1], [0, 1]], wall);
      q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
      q([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
      q([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
      q([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
      q([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
    }
    meshes(): THREE.Mesh[] {
      return [...this.map].map(([mat, b]) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        g.setAttribute('aWall', new THREE.Float32BufferAttribute(b.w, 3));
        g.computeBoundingSphere();
        shellDisposables.push(g);
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = shadows;
        return m;
      });
    }
  }

  /** Where the windows go: the plan's, on the back wall, or (shaped homes) spaced along every outer wall. */
  const windowList: { cx: number; cz: number; nx: number; nz: number; w: number; h: number; y: number }[] = [];
  {
    const win = layout.windows ?? { xs: [-hw * 0.45, hw * 0.25], w: 2.0, h: 1.4, y: 1.75, view: 'sky' as const };
    if (layout.shaped) {
      const w = win.w || 1.8, h = win.h || 1.7, y = win.y || 1.6;
      if (win.xs.length) for (const e of outline(layout)) {
        const alongX = Math.abs(e.nz) > 0.5;
        const lo = alongX ? Math.min(e.ax, e.bx) : Math.min(e.az, e.bz), hi = alongX ? Math.max(e.ax, e.bx) : Math.max(e.az, e.bz);
        const n = Math.floor((hi - lo - 1.0) / (w + 1.6));
        for (let k = 0; k < n; k++) {
          const t = lo + ((k + 0.5) * (hi - lo)) / n;
          const cx = alongX ? t : e.ax, cz = alongX ? e.az : t;
          if (Math.hypot(cx - door.x, cz - door.z) < w / 2 + 1.6) continue;
          windowList.push({ cx, cz, nx: e.nx, nz: e.nz, w, h, y });
        }
      }
    } else for (const x of win.xs) windowList.push({ cx: x, cz: -hd, nx: 0, nz: -1, w: win.w, h: win.h, y: win.y });
  }

  const buildShell = () => {
    shellDisposables.forEach((d) => d.dispose());
    shellDisposables.length = 0;
    shell.clear();
    floors.length = 0;
    faces = [];
    // ---- floors: one plane per room with UVs in metres (later rooms on top).
    layout.rooms.forEach((r, i) => {
      const [x0, z0, x1, z1] = r.rect;
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0.002 + i * 0.002, (z0 + z1) / 2);
      const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
      for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k), -pos.getZ(k));
      shellDisposables.push(g);
      const m = new THREE.Mesh(g, floorMaterial(roomFloor(i)));
      m.name = `floor-${r.label}`;
      m.userData.room = i;
      m.receiveShadow = shadows;
      shell.add(m);
      floors.push(m);
    });
    // ---- walls
    const B = new Buckets();
    const T = WALL_T / 2;
    // Two strips (below and above the cut line) so a cut wall keeps its pattern unsquashed.
    const wallStrips = (outer?: boolean): [number, number][] => {
      const cutAt = Math.min(outer ? LOW_WALL : INNER_LOW, wallH);
      return [[0, cutAt], [cutAt, wallH]];
    };
    segs.forEach((s, si) => {
      const alongX = Math.abs(s.bz - s.az) < 1e-3;
      // The wall's own axis (u) and its normal (n), the box grown by T at each end to close corners.
      const u0 = alongX ? Math.min(s.ax, s.bx) - T : Math.min(s.az, s.bz) - T;
      const u1 = alongX ? Math.max(s.ax, s.bx) + T : Math.max(s.az, s.bz) + T;
      const c = alongX ? s.az : s.ax; // the wall's line (z for walls along x, x for walls along z)
      const P = (u: number, y: number, side: number): [number, number, number] => (alongX ? [u, y, c + side * T] : [c + side * T, y, u]);
      for (const side of [1, -1]) {
        const n: [number, number, number] = alongX ? [0, 0, side] : [side, 0, 0];
        const mid = (u0 + u1) / 2;
        const probe = alongX ? roomAt(mid, c + side * (T + 0.3)) : roomAt(c + side * (T + 0.3), mid);
        // Outer walls: the side facing out is the outside of the building.
        const inward = !s.outer || side === -(alongX ? s.n![1] : s.n![0]);
        const key = `${si}${side > 0 ? '+' : '-'}`;
        const mat = !inward ? outsideMat : cutaway(wallMaterial(style.faces?.[key] ?? (probe >= 0 ? roomWall(probe) : `paint:${layout.wallColor}`)));
        const outward: [number, number] = s.outer ? s.n! : [n[0], n[2]];
        const flag: [number, number, number] = [outward[0], outward[1], s.outer ? 1 : 0];
        // Two strips (below and above the ledge) so a cut wall keeps its pattern unsquashed.
        const flip = alongX ? side < 0 : side > 0; // keep the face pointing out of the wall
        for (const [y0, y1] of wallStrips(s.outer)) {
          const v: [number, number, number][] = [P(u0, y0, side), P(u1, y0, side), P(u1, y1, side), P(u0, y1, side)];
          const uv: [number, number][] = [[u0, y0], [u1, y0], [u1, y1], [u0, y1]];
          if (flip) {
            v.reverse();
            uv.reverse();
          }
          B.quad(mat, v, n, uv, flag);
        }
        if (inward) {
          faces.push({ key, room: probe, ax: alongX ? u0 : c + side * T, az: alongX ? c + side * T : u0, bx: alongX ? u1 : c + side * T, bz: alongX ? c + side * T : u1, nx: n[0], nz: n[2], outer: s.outer });
          // Skirting board along the bottom.
          const k = 0.014, h = 0.09;
          if (alongX) B.box(trimMat, u0 + T, 0, side > 0 ? c + T : c - T - k, u1 - T, h, side > 0 ? c + T + k : c - T, [0, 0, 0]);
          else B.box(trimMat, side > 0 ? c + T : c - T - k, 0, u0 + T, side > 0 ? c + T + k : c - T, h, u1 - T, [0, 0, 0]);
        }
      }
      // The whole wall's cut flag: outer walls by their outward normal (inner walls cut either way).
      const flag: [number, number, number] = s.outer ? [s.n![0], s.n![1], 1] : alongX ? [0, 1, 0] : [1, 0, 0];
      // End faces (door jambs) and the cap on top, the "cut edge" of a Sims wall.
      for (const [u, sgn] of [[u0, -1], [u1, 1]] as const) {
        const n: [number, number, number] = alongX ? [sgn, 0, 0] : [0, 0, sgn];
        for (const [y0, y1] of wallStrips(s.outer)) {
          const v: [number, number, number][] = [P(u, y0, -1), P(u, y0, 1), P(u, y1, 1), P(u, y1, -1)];
          if ((alongX && sgn > 0) || (!alongX && sgn < 0)) v.reverse();
          B.quad(capMat, v, n, [[0, 0], [1, 0], [1, 1], [0, 1]], flag);
        }
      }
      const cap = 0.02;
      if (alongX) B.box(capMat, u0 - cap, wallH, c - T - cap, u1 + cap, wallH + 0.05, c + T + cap, flag);
      else B.box(capMat, c - T - cap, wallH, u0 - cap, c + T + cap, wallH + 0.05, u1 + cap, flag);
    });
    // Door headers over inner doorways (vanish when that wall is cut).
    for (const g of wallH > 2.3 ? gapsOf : []) {
      const alongX = Math.abs(g.b[1] - g.a[1]) < 1e-3;
      const outer = !!g.n;
      const len = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
      const dx = (g.b[0] - g.a[0]) / len, dz = (g.b[1] - g.a[1]) / len;
      const p0 = [g.a[0] + dx * g.s0, g.a[1] + dz * g.s0], p1 = [g.a[0] + dx * g.s1, g.a[1] + dz * g.s1];
      const flag: [number, number, number] = outer ? [g.n![0], g.n![1], 3] : [alongX ? 0 : 1, alongX ? 1 : 0, 2];
      if (alongX) B.box(capMat, Math.min(p0[0], p1[0]), 2.15, p0[1] - WALL_T / 2, Math.max(p0[0], p1[0]), wallH, p0[1] + WALL_T / 2, flag);
      else B.box(capMat, p0[0] - WALL_T / 2, 2.15, Math.min(p0[1], p1[1]), p0[0] + WALL_T / 2, wallH, Math.max(p0[1], p1[1]), flag);
    }
    // Windows: a white frame, a sill, and the view (sky by day, the city lit up at night).
    for (const wv of windowList) {
      // Local frame: u along the wall, d into the room, from the wall's inner face.
      const ax = -wv.nz, az = wv.nx, ix = -wv.nx, iz = -wv.nz;
      const ox = wv.cx + ix * (WALL_T / 2), oz = wv.cz + iz * (WALL_T / 2);
      const P3 = (u: number, y: number, d: number): [number, number, number] => [ox + ax * u + ix * d, y, oz + az * u + iz * d];
      const flag: [number, number, number] = [wv.nx, wv.nz, 3];
      const bx = (u0: number, y0: number, d0: number, u1: number, y1: number, d1: number) => {
        const p = P3(u0, y0, d0), q = P3(u1, y1, d1);
        B.box(trimMat, Math.min(p[0], q[0]), y0, Math.min(p[2], q[2]), Math.max(p[0], q[0]), y1, Math.max(p[2], q[2]), flag);
      };
      const hwW = wv.w / 2, y0 = wv.y - wv.h / 2, y1 = wv.y + wv.h / 2;
      B.quad(glassMat, [P3(-hwW, y0, 0.012), P3(hwW, y0, 0.012), P3(hwW, y1, 0.012), P3(-hwW, y1, 0.012)], [ix, 0, iz], [[0, 0], [1, 0], [1, 1], [0, 1]], flag);
      const f = 0.07;
      bx(-hwW - f, y0 - f, 0, hwW + f, y0, 0.04); // bottom rail
      bx(-hwW - f - 0.04, y0 - f - 0.03, 0, hwW + f + 0.04, y0 - f, 0.1); // sill
      bx(-hwW - f, y1, 0, hwW + f, y1 + f, 0.04); // top rail
      bx(-hwW - f, y0, 0, -hwW, y1, 0.04); // sides
      bx(hwW, y0, 0, hwW + f, y1, 0.04);
      bx(-0.025, y0, 0, 0.025, y1, 0.03); // mullion
      bx(-hwW, wv.y - 0.02, 0, hwW, wv.y + 0.02, 0.03); // transom
    }
    for (const m of B.meshes()) shell.add(m);
  };
  buildShell();

  // ---------------------------------------------------------------- furniture
  const objects: InteriorObject[] = [];
  const groups = new Map<string, THREE.Group>();
  const items = arrangement.map((i) => ({ ...i }));
  let tvScreen: THREE.MeshBasicMaterial | null = null;
  let adTimer = 0;

  const boxCache = new Map<string, THREE.Box3>();
  /** A piece's whole size (all its parts), around its origin. */
  const pieceBox = (item: string): THREE.Box3 => {
    let box = boxCache.get(item);
    if (box) return box;
    box = new THREE.Box3();
    const def = FURNITURE.get(item);
    for (const p of def?.parts ?? []) {
      const g = kit.models.get(p.model);
      if (!g?.boundingBox) continue;
      const b = g.boundingBox.clone();
      if (p.rot) b.applyMatrix4(new THREE.Matrix4().makeRotationY(p.rot));
      b.translate(new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));
      box.union(b);
    }
    boxCache.set(item, box);
    return box;
  };
  const kindOf = (item: string): FitKind => {
    const def = FURNITURE.get(item);
    return def?.flat ? 'flat' : def?.wall ? 'wall' : def?.hang ? 'ceiling' : def?.deco ? 'deco' : 'floor';
  };

  const fpCache = new Map<string, Footprint | null>();
  const fit: FitWorld = {
    layout,
    items,
    footprint: (item) => {
      if (!fpCache.has(item)) {
        const b = pieceBox(item);
        fpCache.set(item, !b.isEmpty() ? { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z } : null);
      }
      return fpCache.get(item)!;
    },
    kind: kindOf,
    noDecoOn: (item) => {
      const d = FURNITURE.get(item);
      return !!d && (d.use === 'lie' || d.use === 'sitOn' || d.use === 'stepIn' || !!d.seat);
    },
  };

  /** How high a piece of decor sits: on the top of the table (or shelf, counter) under it, else the floor. */
  const surfaceY = (it: HomeItem): number => {
    let y = 0;
    for (const o of items) {
      if (o.uid === it.uid || kindOf(o.item) !== 'floor' || fit.noDecoOn!(o.item)) continue;
      const fp = fit.footprint(o.item);
      if (!fp) continue;
      const r = rectAt(fp, o.x, o.z, o.rot);
      if (it.x > r.x0 && it.x < r.x1 && it.z > r.z0 && it.z < r.z1) y = Math.max(y, Math.min(pieceBox(o.item).max.y, 2.3));
    }
    return y;
  };

  /** Where you stand to use a piece: in front if that's clear, else beside or behind it. */
  const standFor = (it: HomeItem, out: THREE.Vector3) => {
    const fb = fit.footprint(it.item) ?? { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 };
    const up = new THREE.Vector3(0, 1, 0);
    const tries: [number, number][] = [
      [0, fb.maxZ + 0.45], [0, fb.maxZ + 0.8],
      [fb.maxX + 0.4, 0], [fb.minX - 0.4, 0],
      [fb.maxX + 0.4, fb.maxZ + 0.3], [fb.minX - 0.4, fb.maxZ + 0.3],
      [0, fb.minZ - 0.45],
    ];
    for (const [lx, lz] of tries) {
      const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(up, it.rot);
      if (spotFree(fit, it.x + v.x, it.z + v.z)) return out.set(it.x + v.x, 0, it.z + v.z);
    }
    const v = new THREE.Vector3(0, 0, fb.maxZ + 0.45).applyAxisAngle(up, it.rot);
    return out.set(THREE.MathUtils.clamp(it.x + v.x, -hw + 0.4, hw - 0.4), 0, THREE.MathUtils.clamp(it.z + v.z, -hd + 0.4, hd - 0.4));
  };
  let grid: WalkGrid | null = null;
  /**
   * Can you still reach everything you use (bed, stove, shower…) from the
   * front door? Fitting on the floor isn't enough: a couch can fit and
   * still wall off the kitchen. Returns the first piece you can't reach.
   */
  const blockedUse = (): string | null => {
    const g = new WalkGrid(fit);
    const doorIn = { x: door.x - door.nx * 1.0, z: door.z - door.nz * 1.0 };
    const v = new THREE.Vector3();
    for (const it of items) {
      const def = FURNITURE.get(it.item);
      if (!def || !(def.actions.length || def.opens || def.placeActions) || def.deco || def.hang) continue;
      standFor(it, v);
      const path = g.path(doorIn.x, doorIn.z, v.x, v.z);
      const end = path?.[path.length - 1];
      if (!end || Math.hypot(end.x - v.x, end.z - v.z) > 0.35) return `${def.name} (${it.uid})`;
    }
    return null;
  };

  // ---- light state
  let lightMode: 'auto' | 'on' | 'off' = opts.venue ? (layout.mood === 'outdoor' ? 'auto' : 'on') : style.lights ?? 'auto';
  let hourOverride: number | null = null;
  let lit = false;
  let dark = 0;
  const lampOn = () => lightMode === 'on' || (lightMode === 'auto' && dark > 0.35);

  /** A part's material: its colours (piece's choice, else the piece's default, else the model's), lit or not. */
  let heldUid: string | null = null;
  let heldOk = true;
  const finishFor = (it: HomeItem, model: string): Finish => {
    const def = FURNITURE.get(it.item);
    const info = MODELS_INFO[model];
    const f: Finish = { a: it.a ?? def?.colors?.a ?? info?.a, b: it.b ?? def?.colors?.b ?? info?.b };
    if (def?.pulse) {
      f.glow = 1;
      f.glowColor = it.lc ?? '#ffffff';
      f.pulse = { disco: 1, breathe: 2, chase: 3, steady: 0 }[def.pulse];
    } else if (def?.light && lit) {
      f.glow = 1;
      f.glowColor = it.lc ?? def.light.color ?? '#ffd29a';
    } else if (def?.light) {
      f.glow = 0.12; // an unlit shade still reads as a lamp shade
      f.glowColor = it.lc ?? def.light.color ?? '#ffd29a';
    }
    if (it.uid === heldUid) f.held = heldOk ? '#1f7a3e' : '#9b1c22';
    return f;
  };
  const paint = (it: HomeItem) => {
    const g = groups.get(it.uid);
    if (!g) return;
    for (const m of g.children) {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || !mesh.userData.model) continue;
      mesh.material = kit.materialFor(finishFor(it, mesh.userData.model));
    }
  };

  const groupY = (it: HomeItem) => {
    const k = kindOf(it.item);
    return k === 'ceiling' ? WALL_H : k === 'deco' ? surfaceY(it) : 0;
  };
  const placeGroup = (it: HomeItem) => {
    const g = groups.get(it.uid);
    if (!g) return;
    g.position.set(it.x, groupY(it), it.z);
    g.rotation.y = it.rot;
  };
  const refreshStands = () => {
    grid = null;
    for (const it of items) {
      const obj = objects.find((o) => o.id === it.uid);
      if (obj) standFor(it, obj.stand);
      // Decor follows the table it stands on.
      if (kindOf(it.item) === 'deco') placeGroup(it);
    }
    lightsDirty = true;
    shadowsDirty = true;
  };

  /** Build a piece's 3D group and tap target. */
  const buildPiece = (it: HomeItem) => {
    const def = FURNITURE.get(it.item);
    if (!def) return;
    const g = new THREE.Group();
    g.name = `furniture-${it.uid}`;
    for (const p of def.parts) {
      const geo = kit.models.get(p.model);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, kit.material);
      m.userData.model = p.model;
      m.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
      m.rotation.y = p.rot ?? 0;
      m.castShadow = shadows && !def.flat && !def.hang;
      m.receiveShadow = shadows;
      g.add(m);
    }
    if (def.tv && !tvScreen) {
      tvScreen = t(new THREE.MeshBasicMaterial({ color: '#0b0b0b', toneMapped: false }));
      const big = def.id === 'tv';
      const [sw, sh, sx, sy, sz] = def.screen ?? (big ? [1.15, 0.62, 0, 1.1, 0.16] : [0.5, 0.34, -0.05, 0.3, 0.29]);
      const screen = new THREE.Mesh(t(new THREE.PlaneGeometry(sw, sh)), tvScreen);
      screen.position.set(sx, sy, sz);
      g.add(screen);
    }
    scene.add(g);
    groups.set(it.uid, g);
    g.traverse((o) => (o.userData.objectId = it.uid));
    const label = def.placeActions ? place.name : def.name;
    objects.push({ id: it.uid, label, emoji: def.placeActions ? place.emoji : def.emoji, mesh: g, actions: def.placeActions ? opts.placeActions ?? [] : def.actions, stand: new THREE.Vector3() });
    placeGroup(it);
    paint(it);
  };
  for (const it of items) buildPiece(it);

  // ---------------------------------------------------------------- lamps: pools, washes, halos, real lights
  const glowTex = t(glowTexture());
  const MAXL = 48;
  const poolMat = t(new THREE.MeshBasicMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  const pools = new THREE.InstancedMesh(t(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), poolMat, MAXL);
  pools.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXL * 3), 3);
  pools.frustumCulled = false;
  pools.renderOrder = 1;
  const washMat = t(new THREE.MeshBasicMaterial({ map: t(washTexture()), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const washes = new THREE.InstancedMesh(t(new THREE.PlaneGeometry(1, 1)), washMat, MAXL);
  washes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXL * 3), 3);
  washes.frustumCulled = false;
  washes.renderOrder = 1;
  const haloMat = t(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  const halos = new THREE.Group();
  scene.add(pools, washes, halos);
  // Sun patches on the floor under the windows (daytime only).
  const sunMat = t(new THREE.MeshBasicMaterial({ map: t(windowLightTexture()), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, color: '#000000' }));
  const sunPatches = new THREE.Group();
  const patchGeo = t(new THREE.PlaneGeometry(1, 0.9).rotateX(-Math.PI / 2));
  for (const wv of windowList) {
    const w = wv.w * 1.1;
    const m = new THREE.Mesh(patchGeo, sunMat);
    m.scale.set(w, 1, w);
    m.rotation.y = Math.atan2(-wv.nx, -wv.nz);
    m.position.set(wv.cx - wv.nx * (WALL_T / 2 + w * 0.5 + 0.2), 0.012, wv.cz - wv.nz * (WALL_T / 2 + w * 0.5 + 0.2));
    sunPatches.add(m);
  }
  scene.add(sunPatches);

  interface Glow { it: HomeItem; def: FurnitureDef; light: LightDef; pos: THREE.Vector3; color: THREE.Color; halo: THREE.Sprite }
  let glows: Glow[] = [];
  let lightsDirty = true;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const rebuildLights = () => {
    lightsDirty = false;
    halos.clear();
    glows = [];
    for (const it of items) {
      const def = FURNITURE.get(it.item);
      const g = groups.get(it.uid);
      if (!def?.light || !g) continue;
      const pos = new THREE.Vector3(0, def.light.y, 0);
      g.updateMatrixWorld(true);
      // Wall lights sit a little out from the wall.
      if (def.light.kind === 'wall' || def.light.kind === 'strip') pos.z += 0.12;
      pos.applyMatrix4(g.matrixWorld);
      const halo = new THREE.Sprite(haloMat);
      halo.position.copy(pos);
      halos.add(halo);
      glows.push({ it, def, light: def.light, pos, color: new THREE.Color(it.lc ?? def.light.color ?? '#ffd29a'), halo });
    }
    applyLights(0);
  };

  /** Light everything for the current darkness: lamp pools, wall washes, halos and the real lights. */
  const applyLights = (time: number) => {
    const on = lit;
    const k = on ? 0.35 + dark * 0.65 : 0;
    let np = 0, nw = 0;
    const col = new THREE.Color();
    for (const g of glows) {
      const flick = g.light.kind === 'fire' ? 0.82 + Math.sin(time * 11 + g.pos.x * 7) * 0.08 + Math.sin(time * 23 + g.pos.z) * 0.06 : 1;
      const pw = g.light.power * k * flick;
      g.halo.visible = on;
      const hs = (g.light.kind === 'strip' ? 0.9 : g.light.kind === 'table' || g.light.kind === 'fire' ? 0.45 : 0.75) * (0.6 + g.light.power * 0.4);
      g.halo.scale.set(hs, hs, hs);
      g.halo.material.opacity = 1;
      if (!on) continue;
      // A pool of light on the floor (strips and wall lights: smaller, near the wall).
      if (np < MAXL) {
        const r = g.light.range * (g.light.kind === 'strip' ? 0.7 : 1);
        _p.set(g.pos.x, 0.018 + np * 0.0002, g.pos.z);
        if (g.light.kind === 'strip' || g.light.kind === 'wall') _p.add(new THREE.Vector3(0, 0, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.it.rot));
        _m.compose(_p, _q.identity(), _s.set(r * 1.6, 1, r * 1.6));
        pools.setMatrixAt(np, _m);
        pools.setColorAt(np, col.copy(g.color).multiplyScalar(0.33 * pw));
        np++;
      }
      // A wash up the wall behind wall lights and strips (and lamps standing near a wall).
      if ((g.light.kind === 'strip' || g.light.kind === 'wall') && nw < MAXL) {
        const w = g.light.kind === 'strip' ? Math.max(2.6, pieceBox(g.it.item).getSize(_s).x + 1.2) : 1.6;
        const h = g.light.kind === 'strip' ? 1.8 : 1.4;
        _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.it.rot);
        _p.set(0, 0, -0.1).applyQuaternion(_q).add(g.pos);
        _m.compose(_p, _q, _s.set(w, h, 1));
        washes.setMatrixAt(nw, _m);
        washes.setColorAt(nw, col.copy(g.color).multiplyScalar(0.55 * pw));
        nw++;
      }
    }
    pools.count = np;
    washes.count = nw;
    pools.instanceMatrix.needsUpdate = washes.instanceMatrix.needsUpdate = true;
    if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
    if (washes.instanceColor) washes.instanceColor.needsUpdate = true;
    // The strongest lamps become real lights (ceiling and floor lamps first).
    const rank = (g: Glow) => g.light.power * g.light.range * (g.light.kind === 'ceiling' ? 1.4 : g.light.kind === 'floor' ? 1.2 : 1);
    const best = on ? [...glows].sort((a, b) => rank(b) - rank(a)).slice(0, realLights.length) : [];
    realLights.forEach((l, i) => {
      const g = best[i];
      if (!g) {
        l.intensity = 0;
        return;
      }
      l.position.copy(g.pos);
      if (g.light.kind === 'strip' || g.light.kind === 'wall') l.position.add(new THREE.Vector3(0, -0.3, 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.it.rot));
      l.color.copy(g.color);
      l.distance = g.light.range * 1.9;
      const flick = g.light.kind === 'fire' ? 0.85 + Math.sin(time * 11) * 0.1 : 1;
      l.intensity = g.light.power * (1.5 + dark * 3.5) * flick;
    });
  };

  // ---------------------------------------------------------------- contact shadows under furniture
  const blobMat = t(new THREE.MeshBasicMaterial({ map: t(blobShadowTexture()), transparent: true, depthWrite: false, color: '#000000', opacity: 1 }));
  blobMat.map!.colorSpace = THREE.NoColorSpace;
  const MAXB = 160;
  const blobs = new THREE.InstancedMesh(t(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), blobMat, MAXB);
  blobs.frustumCulled = false;
  blobs.renderOrder = 1;
  scene.add(blobs);
  let shadowsDirty = true;
  const rebuildShadows = () => {
    shadowsDirty = false;
    let n = 0;
    for (const it of items) {
      const k = kindOf(it.item);
      if (k === 'flat' || k === 'wall' || k === 'ceiling' || n >= MAXB) continue;
      const b = pieceBox(it.item);
      if (b.isEmpty()) continue;
      const sx = (b.max.x - b.min.x) * 1.25 + 0.25, sz = (b.max.z - b.min.z) * 1.25 + 0.25;
      const c = new THREE.Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      _m.compose(_p.set(it.x + c.x, groupY(it) + 0.02 + n * 0.0001, it.z + c.z), _q, _s.set(sx, 1, sz));
      blobs.setMatrixAt(n++, _m);
    }
    blobs.count = n;
    blobs.instanceMatrix.needsUpdate = true;
  };

  // ---------------------------------------------------------------- time of day
  let envTimer = 0;
  const updateEnv = (force = false) => {
    const h = hourOverride ?? opts.clock?.() ?? 13;
    const d = daylight(h);
    const outsideDark = d.dark;
    const mood = opts.venue ? layout.mood ?? 'bright' : null;
    if (mood && mood !== 'outdoor') {
      // Venues are lit for what they are, whatever the time outside.
      const m = MOODS[mood];
      d.bg.set(m.bg);
      d.sky.set(m.sky);
      d.ground.set(m.ground);
      d.hemi = m.hemi;
      d.sun.set(m.sun);
      d.sunI = m.sunI;
      d.dark = m.dark;
    }
    dark = d.dark;
    (scene.background as THREE.Color).copy(d.bg);
    hemi.color.copy(d.sky);
    hemi.groundColor.copy(d.ground);
    hemi.intensity = d.hemi;
    // Lights on after dark: the room fills with warm lamp light (the lamps add pools and accents on top).
    const glowK = lampOn() && (!mood || mood === 'outdoor') ? Math.min(1, d.dark * 1.2) : 0;
    if (glowK > 0) {
      hemi.color.lerp(new THREE.Color('#ffd7a6'), glowK * 0.75);
      hemi.groundColor.lerp(new THREE.Color('#6b4a36'), glowK * 0.6);
      hemi.intensity = Math.max(hemi.intensity, 0.5 + glowK * 0.7);
    }
    sun.color.copy(d.sun);
    sun.intensity = d.sunI;
    // The sun swings from the left (morning) to the right (evening), lower at the ends of the day.
    const az = THREE.MathUtils.clamp((h - 6) / 13, 0, 1) * Math.PI - Math.PI / 2;
    sun.position.set(Math.sin(az) * 10, 4 + d.elev * 10, 6 + Math.cos(az) * 4);
    yard?.setDark(outsideDark);
    sunMat.color.set(d.sun).multiplyScalar(Math.max(0, 1 - outsideDark * 1.6) * 0.075);
    glassMat.map = outsideDark > 0.55 ? viewNight : viewDay;
    skyMat.map = glassMat.map;
    const want = lampOn();
    if (want !== lit || force) {
      lit = want;
      for (const it of items) if (FURNITURE.get(it.item)?.light) paint(it);
    }
  };
  updateEnv(true);
  rebuildLights();
  rebuildShadows();
  refreshStands();

  // TV: the ad shows only when you turn the TV on, briefly and clearly.
  const playTvAd = tvScreen
    ? () => {
        const ad = HOUSE_ADS[Math.floor(Math.random() * HOUSE_ADS.length)];
        tvScreen!.map = adTexture(ad, 16 / 9);
        tvScreen!.color.set('#ffffff');
        tvScreen!.needsUpdate = true;
        adTimer = 5;
      }
    : undefined;
  let clock = 0;
  animated.push((dt) => {
    clock += dt;
    FURNITURE_TIME.value += dt;
    envTimer -= dt;
    if (envTimer <= 0) {
      envTimer = 2;
      updateEnv();
    }
    if (lightsDirty) rebuildLights();
    if (shadowsDirty) rebuildShadows();
    if (lit && glows.some((g) => g.light.kind === 'fire')) applyLights(clock);
    if (!tvScreen) return;
    if (adTimer > 0) {
      adTimer -= dt;
      if (adTimer <= 0) {
        tvScreen.map = null;
        tvScreen.needsUpdate = true;
      }
    }
    if (adTimer <= 0 && tvScreen.color.getHex() !== 0x0b0b0b) tvScreen.color.setHSL((performance.now() / 4000) % 1, 0.5, 0.45);
  });

  // ---------------------------------------------------------------- glowing signs on the walls (neon words)
  for (const sg of layout.signs ?? []) {
    const tex = t(neonTexture(sg.text, sg.color, sg.font));
    const h = sg.size ?? 0.5;
    const w = h * (tex.image.width / tex.image.height);
    const geo = t(new THREE.PlaneGeometry(w, h));
    // Which wall it's on (so it drops away with that wall when the camera swings round).
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), sg.rot);
    geo.setAttribute('aWall', new THREE.Float32BufferAttribute(new Array(geo.getAttribute('position').count).fill([-n.x, -n.z, 3]).flat(), 3));
    const mat = cutaway(t(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(sg.x, sg.y, sg.z);
    m.rotation.y = sg.rot;
    m.renderOrder = 2;
    scene.add(m);
    // A soft wash of its colour on the wall around it.
    const glow = new THREE.Mesh(geo, cutaway(t(new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(sg.color).multiplyScalar(0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))));
    glow.position.copy(m.position).addScaledVector(n, -0.005);
    glow.rotation.y = sg.rot;
    glow.scale.set(1.5, 2.6, 1);
    scene.add(glow);
  }

  // ---------------------------------------------------------------- video walls (animated colour, cheap: all in the shader)
  for (const sc of layout.screens ?? []) {
    const geo = t(new THREE.PlaneGeometry(sc.w, sc.h));
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), sc.rot);
    geo.setAttribute('aWall', new THREE.Float32BufferAttribute(new Array(geo.getAttribute('position').count).fill([-n.x, -n.z, 3]).flat(), 3));
    const mat = cutaway(t(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })));
    const prev = mat.onBeforeCompile;
    const kindN = { galaxy: 0, waves: 1, stocks: 2, game: 3 }[sc.kind ?? 'galaxy'];
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r);
      sh.uniforms.uTime = FURNITURE_TIME;
      sh.uniforms.uKind = { value: kindN };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vScrUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvScrUv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uKind;\nvarying vec2 vScrUv;')
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec2 p = vScrUv * vec2(3.0, 1.6);
          float t = uTime * 0.35;
          vec3 col;
          if (uKind < 0.5) {
            float v = sin(p.x * 2.1 + t) + sin(p.y * 3.3 - t * 1.3) + sin((p.x + p.y) * 1.7 + t * 0.7);
            col = mix(vec3(0.12, 0.02, 0.3), vec3(0.95, 0.25, 0.85), 0.5 + 0.25 * v);
            col = mix(col, vec3(0.2, 0.75, 1.0), smoothstep(0.6, 1.0, sin(p.x * 5.0 - t * 2.0) * 0.5 + 0.5) * 0.35);
            float star = step(0.995, fract(sin(dot(floor(vScrUv * 90.0), vec2(12.9, 78.2))) * 43758.5));
            col += star;
          } else if (uKind < 1.5) {
            float v = sin(p.x * 4.0 + t * 3.0 + sin(p.y * 3.0 + t) * 1.5);
            col = mix(vec3(0.0, 0.1, 0.35), vec3(0.1, 0.9, 1.0), 0.5 + 0.5 * v);
          } else if (uKind < 2.5) {
            float line = 0.5 + 0.3 * sin(vScrUv.x * 12.0 + t * 2.0) + 0.1 * sin(vScrUv.x * 37.0 - t);
            col = vec3(0.02, 0.05, 0.08) + vec3(0.1, 0.9, 0.4) * smoothstep(0.02, 0.0, abs(vScrUv.y - line));
            col += vec3(0.05) * step(0.97, fract(vScrUv.y * 8.0));
          } else {
            vec2 c = floor(vScrUv * vec2(16.0, 9.0));
            float on = step(0.6, fract(sin(dot(c, vec2(3.1, 7.7)) + floor(uTime * 3.0)) * 999.0));
            col = mix(vec3(0.05, 0.02, 0.12), vec3(1.0, 0.3, 0.8) * (0.5 + 0.5 * sin(c.x + t * 5.0)) + vec3(0.1, 0.6, 1.0) * on, 0.8);
          }
          vec4 diffuseColor = vec4( col, opacity );`,
        );
    };
    mat.customProgramCacheKey = () => 'video-wall';
    const m = new THREE.Mesh(geo, mat);
    m.position.set(sc.x, sc.y, sc.z);
    m.rotation.y = sc.rot;
    scene.add(m);
    // Its light spills on the floor in front of it.
    const spill = new THREE.Mesh(t(new THREE.PlaneGeometry(sc.w * 1.4, 2.2).rotateX(-Math.PI / 2)), t(new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(sc.kind === 'stocks' ? '#1f6f4a' : '#5a2a8a'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })));
    spill.position.set(sc.x + n.x * 1.1, 0.02, sc.z + n.z * 1.1);
    spill.rotation.y = sc.rot;
    scene.add(spill);
  }

  // ---------------------------------------------------------------- venues: a name sign, staff, a few locals
  if (opts.venue) {
    const sign = new THREE.Mesh(t(new THREE.PlaneGeometry(6, 1.1)), cutaway(t(new THREE.MeshBasicMaterial({ map: t(signTexture(place.name, place.color)) }))));
    sign.geometry.setAttribute('aWall', new THREE.Float32BufferAttribute(new Array(sign.geometry.getAttribute('position').count).fill([0, -1, 3]).flat(), 3));
    sign.position.set(0, wallH - 0.55, -hd + WALL_T / 2 + 0.03);
    if (wallH > 2 && !layout.screens?.length && !layout.signs?.length) scene.add(sign);
    const counter = items.find((i) => FURNITURE.get(i.item)?.placeActions);
    const people: { x: number; z: number; ry: number }[] = [];
    if (counter) people.push({ x: counter.x + 0.6, z: counter.z - 1.0, ry: 0 });
    for (let i = 0; i < 3; i++) people.push({ x: -hw + 2.5 + i * ((W - 5) / 2), z: 0.8 + (i % 2) * 1.8, ry: Math.PI + (i - 1) * 0.5 });
    people.forEach((p, i) => {
      const npc = makeAvatar({ body: i % 2 ? 'f' : 'm', skin: SKIN_TONES[(i * 3 + 1) % SKIN_TONES.length], top: i === 0 ? place.color : OUTFIT_COLORS[(i * 5 + 2) % OUTFIT_COLORS.length], bottom: '#2b2d42', hair: HAIR_COLORS[i % HAIR_COLORS.length] });
      npc.root.position.set(p.x, 0, p.z);
      npc.root.rotation.y = p.ry;
      scene.add(npc.root);
      disposables.push({ dispose: npc.dispose });
      animated.push((dt) => npc.animate(0, dt));
    });
  }

  // ---------------------------------------------------------------- move mode helpers
  let litUid: string | null = null;
  const ring = new THREE.Mesh(t(new THREE.RingGeometry(0.9, 1.15, 32)), t(new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.9, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  animated.push(() => {
    if (!litUid) return;
    const g = groups.get(litUid);
    if (!g) return;
    ring.position.set(g.position.x, 0.03, g.position.z);
    const s = 1 + Math.sin(performance.now() / 180) * 0.06;
    ring.scale.set(s, s, s);
  });

  // The floor shade under a held piece: green = fits, red = doesn't.
  const shadeMat = t(new THREE.MeshBasicMaterial({ color: '#36c46b', transparent: true, opacity: 0.55, depthWrite: false }));
  const tintHeld = (uid: string | null, ok = true) => {
    const before = heldUid;
    heldUid = uid;
    heldOk = ok;
    for (const id of new Set([before, uid])) {
      const it = id && items.find((i) => i.uid === id);
      if (it) paint(it);
    }
  };
  const shade = new THREE.Mesh(t(new THREE.PlaneGeometry(1, 1)), shadeMat);
  shade.rotation.x = -Math.PI / 2;
  shade.renderOrder = 2;
  shade.visible = false;
  const edge = new THREE.LineSegments(t(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1))), t(new THREE.LineBasicMaterial({ color: '#1f8f4a', transparent: true, opacity: 0.9, depthWrite: false })));
  edge.rotation.x = -Math.PI / 2;
  edge.renderOrder = 3;
  edge.visible = false;
  scene.add(shade, edge);
  let hold: { uid: string; startX: number; startZ: number; startRot: number; okX: number; okZ: number; okRot: number } | null = null;
  const updateShade = (it: HomeItem): boolean => {
    const fp = fit.footprint(it.item);
    const ok = !whyNot(fit, it.uid, it.x, it.z, it.rot);
    if (!fp) return ok;
    const w = fp.maxX - fp.minX, d = fp.maxZ - fp.minZ;
    const cx = (fp.minX + fp.maxX) / 2, cz = (fp.minZ + fp.maxZ) / 2;
    const c = new THREE.Vector3(cx, 0, cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
    for (const m of [shade, edge]) {
      m.visible = true;
      m.position.set(it.x + c.x, 0.04, it.z + c.z);
      m.rotation.z = it.rot;
      m.scale.set(w + 0.3, Math.max(d, 0.25) + 0.3, 1);
    }
    tintHeld(it.uid, ok);
    shadeMat.color.set(ok ? '#36c46b' : '#e5484d');
    (edge.material as THREE.LineBasicMaterial).color.set(ok ? '#1f8f4a' : '#a51d24');
    return ok;
  };
  const heldItem = (uid: string) => (hold?.uid === uid ? items.find((i) => i.uid === uid) ?? null : null);
  const putBack = (it: HomeItem, x: number, z: number, rot: number) => {
    it.x = x; it.z = z; it.rot = rot;
    placeGroup(it);
  };

  // ---------------------------------------------------------------- picking walls and floors
  const pickSurface: HomeInterior['pickSurface'] = (ray) => {
    let best: { d: number; hit: ReturnType<HomeInterior['pickSurface']> } | null = null;
    const v = CUT.uView.value;
    for (const f of faces) {
      const n = new THREE.Vector3(f.nx, 0, f.nz);
      if (n.dot(ray.direction) >= 0) continue; // facing away
      // Skip walls that are cut down (the same rule as the shader), above the ledge.
      const out = f.outer ? n.clone().negate() : n;
      const facing = out.x * v.x + out.z * v.y;
      const cut = CUT.uNoCut.value < 0.5 && (CUT.uCutAll.value > 0.5 || (f.outer ? facing > 0.3 : Math.abs(facing) > 0.5));
      const top = cut ? Math.min(f.outer ? LOW_WALL : INNER_LOW, wallH) : wallH;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(f.ax, 0, f.az));
      const p = ray.intersectPlane(plane, new THREE.Vector3());
      if (!p || p.y < 0 || p.y > top) continue;
      const along = Math.abs(f.nz) > 0.5 ? p.x : p.z;
      const lo = Math.min(Math.abs(f.nz) > 0.5 ? f.ax : f.az, Math.abs(f.nz) > 0.5 ? f.bx : f.bz);
      const hi = Math.max(Math.abs(f.nz) > 0.5 ? f.ax : f.az, Math.abs(f.nz) > 0.5 ? f.bx : f.bz);
      if (along < lo || along > hi) continue;
      const d = p.distanceTo(ray.origin);
      if (!best || d < best.d) best = { d, hit: { kind: 'wall', key: f.key, room: f.room } };
    }
    const fp = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (fp) {
      const room = roomAt(fp.x, fp.z);
      const d = fp.distanceTo(ray.origin);
      if (room >= 0 && (!best || d < best.d)) best = { d, hit: { kind: 'floor', room } };
    }
    return best?.hit ?? null;
  };

  const recolorable = (item: string): ('a' | 'b' | 'lc')[] => {
    const def = FURNITURE.get(item);
    if (!def) return [];
    const out: ('a' | 'b' | 'lc')[] = [];
    let a = false, b = false;
    for (const p of def.parts) {
      const g = kit.models.get(p.model);
      const s = g?.getAttribute('_slot');
      if (!s) continue;
      for (let i = 0; i < s.count && !(a && b); i += 3) {
        const v = s.getX(i);
        if (v > 0.5 && v < 1.5) a = true;
        else if (v > 1.5 && v < 2.5) b = true;
      }
    }
    if (a) out.push('a');
    if (b) out.push('b');
    if (def.light) out.push('lc');
    return out;
  };

  return {
    scene,
    objects,
    layout,
    items,
    floors,
    movable: !opts.venue,
    get style() {
      return style;
    },
    focus: new THREE.Vector3(0, 0.6, -0.4),
    spawn: new THREE.Vector3(door.x - door.nx * 1.0, 0, door.z - door.nz * 1.0),
    halfWidth: hw + 1.1, // margin: the front of the room is nearer the camera, so it looks wider
    playTvAd,
    beginMove(uid) {
      const it = items.find((i) => i.uid === uid);
      if (!it) return;
      hold = { uid, startX: it.x, startZ: it.z, startRot: it.rot, okX: it.x, okZ: it.z, okRot: it.rot };
      updateShade(it);
    },
    dragTo(uid, x, z) {
      const it = heldItem(uid);
      if (!it) return false;
      if (fit.kind(it.item) === 'wall') {
        const p = snapToWall(fit, it.item, x, z);
        it.x = p.x; it.z = p.z; it.rot = p.rot;
      } else {
        // A 10 cm grid makes lining things up easy; stay inside the outer walls.
        it.x = THREE.MathUtils.clamp(Math.round(x * 10) / 10, -hw + 0.2, hw - 0.2);
        it.z = THREE.MathUtils.clamp(Math.round(z * 10) / 10, -hd + 0.2, hd - 0.2);
      }
      placeGroup(it);
      lightsDirty = shadowsDirty = true;
      return updateShade(it);
    },
    rotateItem(uid, step = Math.PI / 2) {
      const it = heldItem(uid);
      if (!it || fit.kind(it.item) === 'wall') return it ? updateShade(it) : false;
      const q = Math.PI / 4;
      it.rot = ((Math.round((it.rot + step) / q) * q) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      placeGroup(it);
      lightsDirty = shadowsDirty = true;
      return updateShade(it);
    },
    drop(uid) {
      const it = heldItem(uid);
      if (!it || !hold) return null;
      let why = whyNot(fit, uid, it.x, it.z, it.rot);
      if (!why) {
        const cut = blockedUse();
        if (cut) why = `That blocks the way to the ${cut.toLowerCase()}`;
      }
      if (why) putBack(it, hold.okX, hold.okZ, hold.okRot);
      else Object.assign(hold, { okX: it.x, okZ: it.z, okRot: it.rot });
      updateShade(it);
      lightsDirty = shadowsDirty = true;
      return why;
    },
    endMove(uid, cancel) {
      const it = heldItem(uid);
      if (it && hold) {
        if (cancel) putBack(it, hold.startX, hold.startZ, hold.startRot);
        else if (whyNot(fit, uid, it.x, it.z, it.rot) || blockedUse()) putBack(it, hold.okX, hold.okZ, hold.okRot);
      }
      hold = null;
      shade.visible = edge.visible = false;
      tintHeld(null);
      refreshStands();
    },
    itemPos(uid) {
      const it = items.find((i) => i.uid === uid);
      return it ? { x: it.x, z: it.z } : null;
    },
    spotFree: (x, z) => spotFree(fit, x, z),
    removePiece(uid) {
      const k = items.findIndex((i) => i.uid === uid);
      if (k < 0) return;
      items.splice(k, 1);
      const g = groups.get(uid);
      g?.removeFromParent();
      groups.delete(uid);
      const o = objects.findIndex((x) => x.id === uid);
      if (o >= 0) objects.splice(o, 1);
      if (tvScreen && g && g.children.some((c) => (c as THREE.Mesh).material === tvScreen)) tvScreen = null;
      refreshStands();
    },
    addPiece(item, x, z, preferRot = 0, finish = {}) {
      const def = FURNITURE.get(item);
      if (!def) return null;
      let n = 1;
      while (items.some((i) => i.uid === `${item}-${n}`)) n++;
      const it: HomeItem = { uid: `${item}-${n}`, item, x, z, rot: 0, ...finish };
      items.push(it);
      // Search outwards from (x, z) on a 20 cm grid for a spot it fits (any quarter turn).
      let found = false;
      outer: for (let ringN = 0; ringN < 40; ringN++) {
        for (let dz = -ringN; dz <= ringN; dz++) for (let dx = -ringN; dx <= ringN; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ringN) continue;
          for (const rot of [preferRot, preferRot + Math.PI / 2, preferRot + Math.PI, preferRot - Math.PI / 2]) {
            let px = Math.round((x + dx * 0.2) * 10) / 10, pz = Math.round((z + dz * 0.2) * 10) / 10, pr = rot;
            if (def.wall) ({ x: px, z: pz, rot: pr } = snapToWall(fit, item, px, pz));
            if (!whyNot(fit, it.uid, px, pz, pr)) {
              Object.assign(it, { x: px, z: pz, rot: pr });
              if (blockedUse()) continue;
              found = true;
              break outer;
            }
          }
        }
      }
      if (!found) {
        items.pop();
        return null;
      }
      buildPiece(it);
      refreshStands();
      return it.uid;
    },
    blockedUse: () => blockedUse(),
    footprintOf: (item) => {
      const fp = fit.footprint(item);
      return fp ? { ...fp, h: pieceBox(item).max.y } : null;
    },
    pieceInfo: (uid) => {
      const it = items.find((i) => i.uid === uid);
      const fp = it && fit.footprint(it.item);
      return it && fp ? { item: it.item, x: it.x, z: it.z, rot: it.rot, fp } : null;
    },
    walkPath: (fx, fz, tx, tz) => (grid ??= new WalkGrid(fit)).path(fx, fz, tx, tz),
    clashes: () => items.flatMap((i) => {
      const why = whyNot(fit, i.uid, i.x, i.z, i.rot);
      const fp = fit.footprint(i.item);
      const r = fp ? rectAt(fp, i.x, i.z, i.rot) : null;
      return why ? [{ uid: i.uid, why: `${why} ${r ? [r.x0, r.z0, r.x1, r.z1].map((v) => v.toFixed(2)).join(',') : ''}` }] : [];
    }),
    highlight(uid) {
      litUid = uid;
      ring.visible = !!uid;
    },
    setStyle(next) {
      style = structuredClone(next);
      if (!opts.venue) lightMode = style.lights ?? 'auto';
      buildShell();
      updateEnv(true);
    },
    setFinish(uid, f) {
      const it = items.find((i) => i.uid === uid);
      if (!it) return;
      for (const k of ['a', 'b', 'lc'] as const) {
        if (k in f) {
          if (f[k]) it[k] = f[k];
          else delete it[k];
        }
      }
      paint(it);
      lightsDirty = true;
    },
    pickSurface,
    setView(dx, dz, mode = 'cutaway') {
      const l = Math.hypot(dx, dz) || 1;
      CUT.uView.value.set(dx / l, dz / l);
      CUT.uCutAll.value = mode === 'top' ? 1 : 0;
      CUT.uNoCut.value = mode === 'walls-up' ? 1 : 0;
    },
    setLights(mode) {
      lightMode = mode;
      style = { ...style, lights: mode };
      updateEnv(true);
      applyLights(clock);
    },
    lightsLit: () => lit,
    previewHour(h) {
      hourOverride = h;
      updateEnv(true);
      applyLights(clock);
    },
    recolorable,
    roomFloor,
    roomWall,
    faceRoom: (key) => faces.find((f) => f.key === key)?.room ?? -1,
    update: (dt) => animated.forEach((f) => f(dt)),
    dispose() {
      // Furniture geometry and materials are shared (kit), floors and wall finishes are cached: only drop our own things.
      shellDisposables.forEach((d) => d.dispose());
      disposables.forEach((x) => x.dispose());
      realLights.forEach((l) => l.dispose());
      sun.shadow.map?.dispose();
      pools.dispose();
      washes.dispose();
      blobs.dispose();
      CUT.uView.value.set(0, 1);
      CUT.uCutAll.value = CUT.uNoCut.value = 0;
    },
  };
}

/** Looking down on Central Park from ninety floors up: sky, skyline, the park, the lake. */
function parkView(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 70);
  sky.addColorStop(0, '#8ec9f0');
  sky.addColorStop(1, '#d9eefb');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 70);
  g.fillStyle = '#9fb3c4';
  for (let x = 0; x < 256; x += 9) {
    const h = 6 + ((x * 37) % 17);
    g.fillRect(x, 66 - h, 7, h + 4);
  }
  g.fillStyle = '#5f9e4f';
  g.fillRect(0, 68, 256, 92);
  g.fillStyle = '#4c8a41';
  for (let i = 0; i < 70; i++) g.fillRect((i * 53) % 256, 72 + ((i * 29) % 86), 6, 4);
  g.fillStyle = '#7fb6d8';
  g.beginPath();
  g.ellipse(150, 112, 48, 14, -0.15, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#e9e1c8';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 140);
  g.bezierCurveTo(70, 120, 120, 150, 256, 128);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
