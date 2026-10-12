// =====================================================================
// ground.ts — builds Manhattan: decides where every picture goes (roads,
// blocks, houses, trees, rocks) and draws the flat coded parts: block
// slabs, waterfront promenades, sea walls, water, Central Park's lawn,
// lake and paths, ad panels and landmark building sites.
//
// The camera never turns, so only the faces it can see are built (tops,
// west and south sides). Flat parts use plain colours (no lighting):
// the colours are picked from the building pictures so they match.
// All the plain-coloured boxes are merged into ONE mesh (one draw call).
// =====================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AD_PRICES, type PriceTier } from '../data/plots.ts';
import {
  CELL_D, CELL_W, COLS, GRID_D, GRID_W, PITCH_X, PITCH_Z, PROMENADE, ROAD, ROWS, SPACE_D, SPACE_W, STRIP, blockAt, cellX, cellZ, hoodOfRow, isPark,
  type Block, type Side,
} from './plan.ts';

// ---- colours (matched to the lit building pictures)
export const C = {
  asphalt: '#8a838b', // matches the road pictures' asphalt
  asphaltSide: '#4d4c58',
  lane: '#f6f3ea',
  yellow: '#f5c842',
  pave: '#fbe9c3',
  paveSide: '#d6ac8a',
  kerb: '#efe6d6',
  grass: '#86b43a',
  grassDark: '#6f9c2c',
  hedge: '#5e8f2a',
  promenade: '#f1dfbd',
  stone: '#c9b79a',
  stoneSide: '#a8957a',
  water: '#3aa3c8',
  shallows: '#7fd3df',
  dirt: '#d9bf8c',
  deck: '#f4e2c0',
  pool: '#43c6e6',
  poolEdge: '#e9f6f8',
  hoarding: '#2f6db5',
  rail: '#5b6470',
};

/** Height of the sidewalk slab every block stands on (the kerb). */
export const KERB_H = 0.25;

type Col = THREE.Color;
const col = (h: string): Col => new THREE.Color(h);

/** Collects coloured boxes, then merges them into one mesh. */
class BoxBatch {
  private pos: number[] = [];
  private colr: number[] = [];

  private quad(a: number[], b: number[], c: number[], d: number[], k: Col): void {
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) this.colr.push(k.r, k.g, k.b);
  }

  /** Box from (x0, y0, z0) to (x1, y1, z1): top + the west and south sides (the ones the camera sees). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: string, side?: string): void {
    const t = col(top);
    const s = col(side ?? top);
    const sE = s.clone().multiplyScalar(0.88);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], t); // top (counter-clockwise from above)
    if (y1 - y0 > 0.001) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], s); // south
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], sE); // west
    }
  }

  /** A flat rectangle at height y. */
  rect(x0: number, z0: number, x1: number, z1: number, y: number, color: string): void {
    this.box(x0, y, z0, x1, y, z1, color);
  }

  mesh(): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    // Colours are given as sRGB hex; THREE.Color converts them to linear,
    // and the renderer converts back on output, so they show as written.
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colr, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
  }
}

// ---- small lit 3D things (trees, lamps, posts): instanced, lit like the pictures
export interface PropSet {
  trees: { x: number; z: number; s: number }[];
  rocks: { x: number; z: number; s: number }[];
  lamps: { x: number; z: number }[];
  posts: { x: number; z: number; h: number; color: string }[];
}

/** Text on a canvas, as a texture. */
export function textTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** An upright sign board on a post, turned to face the camera. */
function signBoard(x: number, z: number, w: number, h: number, lift: number, tex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  board.position.y = lift + h / 2;
  g.add(board);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, lift + 0.2, 0.4), new THREE.MeshLambertMaterial({ color: '#4a3b2c' }));
  post.position.y = (lift + 0.2) / 2;
  g.add(post);
  g.position.set(x, KERB_H, z);
  g.rotation.y = -Math.PI / 4; // face the camera (south-west)
  return g;
}

function signTexture(title: string, sub: string, bg: string, fg = '#ffffff'): THREE.CanvasTexture {
  return textTexture(512, 256, (g) => {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(4, 4, 504, 248, 28);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.stroke();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.font = '800 64px system-ui, sans-serif';
    g.fillText(title, 256, 118, 470);
    g.font = '600 36px system-ui, sans-serif';
    g.fillText(sub, 256, 186, 470);
  });
}

/** Made-up sample advertisers, so the ad blocks show what a rented half looks like. */
export const SAMPLE_ADS: Record<string, { bg: string; bg2: string; line: string }> = {
  'BIG APPLE PIZZA': { bg: '#e63946', bg2: '#f4a261', line: 'Open late · $1 slices' },
  'SKYLINE SODA': { bg: '#3a86ff', bg2: '#8ecae6', line: 'Taste the city' },
  'BROOKLYN BEANS': { bg: '#6d4c41', bg2: '#bc8a5f', line: 'Coffee roasted daily' },
  'EMPIRE FITNESS': { bg: '#2a9d8f', bg2: '#80ed99', line: 'First week free' },
  'METRO KICKS': { bg: '#8338ec', bg2: '#ff70a6', line: 'New drops every Friday' },
  'LIBERTY TAXI': { bg: '#f5b700', bg2: '#ffd166', line: 'Anywhere in 5 boroughs' },
};

function adTexture(side: 'LEFT' | 'RIGHT', rented: string | null, price: number): THREE.CanvasTexture {
  // The panel lies flat. The text is drawn turned 45° and stretched 2x
  // tall, so from the fixed camera it reads straight and upright, like
  // a sticker on the screen (the trick Clash of Clans uses for decals).
  const look = rented ? (SAMPLE_ADS[rented] ?? SAMPLE_ADS['BIG APPLE PIZZA']) : null;
  return textTexture(512, 680, (g) => {
    if (look) {
      const grd = g.createLinearGradient(0, 0, 512, 680);
      grd.addColorStop(0, look.bg);
      grd.addColorStop(1, look.bg2);
      g.fillStyle = grd;
    } else g.fillStyle = '#fffaf0';
    g.fillRect(0, 0, 512, 680);
    if (!rented) {
      g.strokeStyle = '#f5b700';
      g.lineWidth = 14;
      g.setLineDash([40, 22]);
      g.strokeRect(14, 14, 484, 652);
      g.setLineDash([]);
    }
    g.save();
    g.translate(256, 340);
    g.rotate(Math.PI / 4);
    g.scale(1, 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (rented) {
      g.fillStyle = '#ffffff';
      g.font = '900 54px system-ui, sans-serif';
      g.fillText(rented, 0, -26, 560);
      g.font = '700 26px system-ui, sans-serif';
      g.fillText(look!.line, 0, 22, 520);
    } else {
      g.fillStyle = '#1d3557';
      g.font = '900 64px system-ui, sans-serif';
      g.fillText('YOUR AD HERE', 0, -28, 560);
      g.fillStyle = '#e63946';
      g.font = '800 26px system-ui, sans-serif';
      g.fillText(`${side} HALF · $${price}/week`, 0, 24, 520);
    }
    g.restore();
  });
}

/** A picture to place (see sprites.ts). */
export interface Placement {
  name: string;
  x: number;
  z: number;
  scale?: number;
}

export interface GroundBuild {
  group: THREE.Group;
  props: PropSet;
  /** Every picture on the map: blocks, houses, roads, trees, rocks. */
  sprites: Placement[];
  /** Things to update each frame (water ripples). */
  tick: (t: number) => void;
}

/** Is road piece between these blocks inside Central Park (so not built)? */
const parkBoth = (c1: number, r1: number, c2: number, r2: number) => isPark(c1, r1) && isPark(c2, r2);

export function buildGround(): GroundBuild {
  const group = new THREE.Group();
  const b = new BoxBatch();
  const props: PropSet = { trees: [], lamps: [], posts: [], rocks: [] };
  const sprites: Placement[] = [];
  const tree = (x: number, z: number, s = 1) => props.trees.push({ x, z, s });
  const P = PROMENADE;

  // ---- the Bronx side (north): land under the clouds
  b.rect(-P - 300, -700, GRID_W + P + 300, 0, -0.02, C.grass);

  // ---- asphalt under the whole grid (fills hairline gaps between road pictures)
  b.rect(0, 0, GRID_W, GRID_D, -0.4, C.asphalt);

  // ---- roads: Peter's road and intersection pictures
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const ix = c * PITCH_X + ROAD / 2;
      const iz = r * PITCH_Z + ROAD / 2;
      const inside = isPark(c - 1, r - 1) && isPark(c, r - 1) && isPark(c - 1, r) && isPark(c, r);
      if (!inside) sprites.push({ name: 'intersection', x: ix, z: iz });
      if (c < COLS && !parkBoth(c, r - 1, c, r)) for (const k of [0.25, 0.75]) sprites.push({ name: 'road-ew', x: cellX(c) + CELL_W * k, z: iz });
      if (r < ROWS && !parkBoth(c - 1, r, c, r)) sprites.push({ name: 'road-ns', x: ix, z: cellZ(r) + CELL_D / 2 });
    }
  }

  // ---- waterfront promenades: Hudson (west), East River (east), harbour (south)
  b.box(-P, -2.2, 0, 0, KERB_H, GRID_D + P, C.promenade, C.stoneSide);
  b.box(GRID_W, -2.2, 0, GRID_W + P, KERB_H, GRID_D + P, C.promenade, C.stoneSide);
  b.box(-P, -2.2, GRID_D, GRID_W + P, KERB_H, GRID_D + P, C.promenade, C.stoneSide);
  b.rect(-P, 0, -P + 1.2, GRID_D + P, KERB_H + 0.01, C.stone);
  b.rect(GRID_W + P - 1.2, 0, GRID_W + P, GRID_D + P, KERB_H + 0.01, C.stone);
  b.rect(-P, GRID_D + P - 1.2, GRID_W + P, GRID_D + P, KERB_H + 0.01, C.stone);
  for (let z = 4; z < GRID_D + P - 1; z += 2.4) props.posts.push({ x: -P + 0.6, z, h: 1.1, color: C.rail }, { x: GRID_W + P - 0.6, z, h: 1.1, color: C.rail });
  for (let x = -P + 1; x < GRID_W + P; x += 2.4) props.posts.push({ x, z: GRID_D + P - 0.6, h: 1.1, color: C.rail });
  for (let z = 10; z < GRID_D; z += 19) {
    tree(-P / 2 - 1, z, 1 + (z % 3) * 0.1);
    tree(GRID_W + P / 2 + 1, z + 9, 1);
  }
  for (let x = 4; x < GRID_W; x += 19) tree(x, GRID_D + P / 2 + 1, 1);
  for (let z = 47; z < GRID_D; z += 152) props.rocks.push({ x: -P + 3, z, s: 0.9 }, { x: GRID_W + P - 3, z: z + 70, s: 0.9 });

  // ---- blocks
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const blk = blockAt(c, r);
      if (blk.kind === 'park') continue;
      const x0 = cellX(c);
      const z0 = cellZ(r);
      b.box(x0, 0, z0, x0 + CELL_W, KERB_H, z0 + CELL_D, C.pave, C.paveSide);
      blockContent(blk, hoodOfRow(r).tier, x0, z0, b, group, props, sprites);
    }
  }
  centralPark(b, group, props, sprites);

  group.add(b.mesh());

  // Trees and rocks are pictures of Peter's models.
  const TREES = ['prop-tree', 'prop-cherry', 'prop-tree'];
  props.trees.forEach((t, i) => sprites.push({ name: TREES[i % TREES.length], x: t.x, z: t.z, scale: t.s * 1.5 }));
  props.rocks.forEach((rk, i) => sprites.push({ name: ['prop-rock', 'prop-mossy-rock', 'prop-outcrop'][i % 3], x: rk.x, z: rk.z, scale: rk.s * 1.3 }));

  // ---- water all round: one big plane, gently moving ripples
  const ripples = textTexture(256, 256, (g) => {
    g.fillStyle = C.water;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % 256;
      const y = (i * 61) % 256;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 10, y - 5, x + 22, y);
      g.stroke();
    }
  });
  ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping;
  ripples.repeat.set(90, 90);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshBasicMaterial({ map: ripples }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(GRID_W / 2, -1.6, GRID_D / 2);
  group.add(water);
  // Lighter shallow water along the sea walls.
  const sh = new BoxBatch();
  sh.rect(-P - 7, 0, -P, GRID_D + P + 7, -1.55, C.shallows);
  sh.rect(GRID_W + P, 0, GRID_W + P + 7, GRID_D + P + 7, -1.55, C.shallows);
  sh.rect(-P, GRID_D + P, GRID_W + P, GRID_D + P + 7, -1.55, C.shallows);
  const shMesh = sh.mesh();
  (shMesh.material as THREE.MeshBasicMaterial).transparent = true;
  (shMesh.material as THREE.MeshBasicMaterial).opacity = 0.55;
  group.add(shMesh);

  return {
    group,
    props,
    sprites,
    tick: (t) => {
      ripples.offset.set((t * 0.004) % 1, (t * 0.0025) % 1);
    },
  };
}

/** Central Park: one big lawn over its blocks and the roads between them. */
function centralPark(b: BoxBatch, group: THREE.Group, props: PropSet, sprites: Placement[]): void {
  let c0 = COLS, c1 = -1, r0 = ROWS, r1 = -1;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (isPark(c, r)) {
        c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
      }
  if (c1 < 0) return;
  const x0 = cellX(c0), x1 = cellX(c1) + CELL_W, z0 = cellZ(r0), z1 = cellZ(r1) + CELL_D;
  const y = KERB_H;
  b.box(x0, 0, z0, x1, y, z1, C.pave, C.paveSide);
  b.box(x0 + 3, y, z0 + 3, x1 - 3, y + 0.6, z1 - 3, C.stone, C.stoneSide); // low stone wall
  b.rect(x0 + 4, z0 + 4, x1 - 4, z1 - 4, y + 0.61, C.grass);
  const cx = (x0 + x1) / 2;
  // The lake (like the Reservoir), with a stone rim.
  const lx0 = x0 + 34, lx1 = x1 - 34, lz0 = z0 + 70, lz1 = z0 + 150;
  b.box(lx0 - 2, y, lz0 - 2, lx1 + 2, y + 0.8, lz1 + 2, C.stone, C.stoneSide);
  // Lake water with the same gentle ripples as the rivers.
  const lakeTex = textTexture(256, 256, (g) => {
    g.fillStyle = C.water;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const x = (i * 83) % 256;
      const yy = (i * 47) % 256;
      g.beginPath();
      g.moveTo(x, yy);
      g.quadraticCurveTo(x + 10, yy - 5, x + 22, yy);
      g.stroke();
    }
  });
  lakeTex.wrapS = lakeTex.wrapT = THREE.RepeatWrapping;
  lakeTex.repeat.set((lx1 - lx0) / 18, (lz1 - lz0) / 18);
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(lx1 - lx0, lz1 - lz0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lakeTex }));
  lake.position.set((lx0 + lx1) / 2, y + 0.81, (lz0 + lz1) / 2);
  group.add(lake);
  b.rect(lx0, lz0, lx1, lz0 + 3, y + 0.82, C.shallows);
  b.rect(lx0, lz0, lx0 + 3, lz1, y + 0.82, C.shallows);
  // A little boathouse jetty.
  b.box(lx0 + 20, y, lz1 - 10, lx0 + 24, y + 1.0, lz1 + 2, '#c8a27a', '#9c7a56');
  // Winding-looking paths: a loop drive and cross paths.
  const pathY = y + 0.62;
  const w = 3.5;
  b.rect(x0 + 14, z0 + 14, x1 - 14, z0 + 14 + w, pathY, C.promenade);
  b.rect(x0 + 14, z1 - 14 - w, x1 - 14, z1 - 14, pathY, C.promenade);
  b.rect(x0 + 14, z0 + 14, x0 + 14 + w, z1 - 14, pathY, C.promenade);
  b.rect(x1 - 14 - w, z0 + 14, x1 - 14, z1 - 14, pathY, C.promenade);
  b.rect(cx - w / 2, lz1 + 2, cx + w / 2, z1 - 14, pathY, C.promenade);
  b.rect(x0 + 14, (lz1 + z1) / 2, x1 - 14, (lz1 + z1) / 2 + w, pathY, C.promenade);
  // Bethesda-style fountain plaza.
  const fz = (lz1 + z1) / 2 + w / 2;
  b.box(cx - 11, y, fz - 9, cx + 11, y + 0.65, fz + 9, C.promenade);
  b.box(cx - 5, y, fz - 5, cx + 5, y + 1.3, fz + 5, C.stone, C.stoneSide);
  b.rect(cx - 4.2, fz - 4.2, cx + 4.2, fz + 4.2, y + 1.31, C.pool);
  // A playground in the south-east corner.
  sprites.push({ name: 'playground-r0', x: x1 - 14 - CELL_W / 2 + 4, z: z1 - 14 - CELL_D / 2 + 4, scale: 0.8 });
  // Lots of trees (kept off the paths, lake and playground).
  let k = 7;
  const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const clear = (x: number, z: number) => {
    if (x > lx0 - 6 && x < lx1 + 6 && z > lz0 - 6 && z < lz1 + 6) return false;
    if (Math.abs(x - cx) < 6 && z > lz1) return false;
    if (Math.abs(z - fz) < 12 && Math.abs(x - cx) < 16) return false;
    if (Math.abs(z - fz) < 5) return false;
    if (x > x1 - 14 - CELL_W * 0.8 - 4 && z > z1 - 14 - CELL_D * 0.8 - 4) return false;
    for (const e of [x0 + 14, x1 - 14]) if (Math.abs(x - e) < 5) return false;
    for (const e of [z0 + 14, z1 - 14]) if (Math.abs(z - e) < 5) return false;
    return true;
  };
  for (let i = 0; i < 260; i++) {
    const x = x0 + 8 + rnd() * (x1 - x0 - 16);
    const z = z0 + 8 + rnd() * (z1 - z0 - 16);
    if (clear(x, z)) props.trees.push({ x, z, s: 0.9 + rnd() * 0.4 });
  }
  for (let i = 0; i < 14; i++) {
    const x = x0 + 20 + rnd() * (x1 - x0 - 40);
    const z = z0 + 20 + rnd() * (z1 - z0 - 40);
    if (clear(x, z)) props.rocks.push({ x, z, s: 1 + rnd() * 0.6 });
  }
  group.add(signBoard(x0 + 30, z1 - 6, 28, 8, 2.4, signTexture('CENTRAL PARK', 'Relax · jog · picnic', '#2d6a4f')));
}

function blockContent(blk: Block, tier: PriceTier, x0: number, z0: number, b: BoxBatch, group: THREE.Group, props: PropSet, sprites: Placement[]): void {
  const x1 = x0 + CELL_W;
  const z1 = z0 + CELL_D;
  const y = KERB_H;
  const SW = 2;
  switch (blk.kind) {
    case 'rect':
      sprites.push({ name: blk.sprite, x: x0 + CELL_W / 2, z: z0 + CELL_D / 2 });
      return;
    case 'square':
    case 'gym':
      sprites.push({ name: blk.kind === 'gym' ? 'sq-gym-r0' : blk.sprite, x: x0 + STRIP + CELL_D / 2, z: z0 + CELL_D / 2 });
      strip(blk.side, x0, z0, b, props, sprites);
      return;
    case 'playground':
      sprites.push({ name: 'playground-r0', x: x0 + CELL_W / 2, z: z0 + CELL_D / 2 });
      return;
    case 'homes':
      // Every house fills its plot exactly (lawn, fence and all).
      for (const h of blk.houses) sprites.push({ name: h.sprite, x: x0 + (h.c + h.w / 2) * SPACE_W, z: z0 + (h.r + h.h / 2) * SPACE_D });
      return;
    case 'ads': {
      const mid = (x0 + x1) / 2;
      const price = AD_PRICES[tier].unit;
      const halves: [number, number, 'LEFT' | 'RIGHT', string | null][] = [
        [x0 + SW, mid - 0.6, 'LEFT', blk.rented[0]],
        [mid + 0.6, x1 - SW, 'RIGHT', blk.rented[1]],
      ];
      for (const [a, c, side, rented] of halves) {
        b.box(a, y, z0 + SW, c, y + 0.35, z1 - SW, rented ? '#ffffff' : '#f5b700', rented ? '#d0d4da' : '#c99400');
        const tex = adTexture(side, rented, price);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(c - a - 1.6, CELL_D - 2 * SW - 1.6), new THREE.MeshBasicMaterial({ map: tex }));
        panel.rotation.x = -Math.PI / 2;
        panel.position.set((a + c) / 2, y + 0.37, (z0 + z1) / 2);
        group.add(panel);
      }
      return;
    }
    case 'landmark': {
      const ix0 = x0 + SW, ix1 = x1 - SW, iz0 = z0 + SW, iz1 = z1 - SW;
      b.box(ix0, y, iz0, ix1, y + 0.06, iz1, C.dirt);
      // blue site hoarding
      b.box(ix0, y, iz1 - 0.4, ix1, y + 2.6, iz1, C.hoarding, C.hoarding);
      b.box(ix1 - 0.4, y, iz0, ix1, y + 2.6, iz1, C.hoarding, C.hoarding);
      b.box(ix0, y, iz0, ix1, y + 2.6, iz0 + 0.4, C.hoarding, C.hoarding);
      b.box(ix0, y, iz0, ix0 + 0.4, y + 2.6, iz1, C.hoarding, C.hoarding);
      // a crane
      const cx = ix0 + 22;
      const cz = iz0 + 18;
      b.box(cx - 1.2, y, cz - 1.2, cx + 1.2, y + 48, cz + 1.2, '#f2b705', '#d99e00');
      b.box(cx - 14, y + 46, cz - 0.9, cx + 34, y + 48.5, cz + 0.9, '#f2b705', '#d99e00');
      b.box(cx - 14, y + 42, cz - 2, cx - 8, y + 46, cz + 2, '#7a7f87', '#5d6168');
      b.box(cx + 25, y + 30, cz - 0.15, cx + 25.3, y + 46, cz + 0.15, '#333333');
      group.add(signBoard((x0 + x1) / 2 + 8, iz1 - 6, 24, 8, 3, signTexture(blk.name.toUpperCase(), 'Landmark coming soon', '#1d3557')));
      return;
    }
    case 'park':
      return;
  }
}

/** The 30 m strip beside a square picture: a small plaza with trees, or a subway entrance. */
function strip(side: Side, x0: number, z0: number, b: BoxBatch, props: PropSet, sprites: Placement[]): void {
  const y = KERB_H;
  const x1 = x0 + STRIP;
  b.rect(x0 + 1, z0 + 1, x1 - 1, z0 + CELL_D - 1, y + 0.02, C.promenade);
  // Planted beds with trees front and back.
  const bed = (za: number, zb: number) => b.box(x0 + 3, y, za, x1 - 3, y + 0.45, zb, C.grass, C.paveSide);
  bed(z0 + 3, z0 + 17);
  props.trees.push({ x: x0 + 8, z: z0 + 8, s: 1.1 }, { x: x1 - 8, z: z0 + 11, s: 1 }, { x: x0 + STRIP / 2, z: z0 + 14, s: 0.8 });
  if (side === 'subway') {
    sprites.push({ name: 'subway-r0', x: x0 + STRIP / 2, z: z0 + CELL_D / 2 + 4, scale: 1.6 });
    bed(z0 + CELL_D - 12, z0 + CELL_D - 3);
    props.trees.push({ x: x0 + 8, z: z0 + CELL_D - 7, s: 0.9 }, { x: x1 - 8, z: z0 + CELL_D - 7, s: 0.9 });
  } else {
    bed(z0 + 24, z0 + 36);
    bed(z0 + CELL_D - 17, z0 + CELL_D - 3);
    props.trees.push({ x: x0 + 9, z: z0 + 30, s: 0.9 }, { x: x1 - 9, z: z0 + 30, s: 1 });
    props.trees.push({ x: x0 + 8, z: z0 + CELL_D - 9, s: 1 }, { x: x1 - 8, z: z0 + CELL_D - 11, s: 1.15 }, { x: x0 + STRIP / 2, z: z0 + CELL_D - 5, s: 0.8 });
    props.rocks.push({ x: x0 + STRIP / 2, z: z0 + 29, s: 0.7 });
  }
}

/** Trees, lamp posts and fence posts as three instanced meshes, lit like the pictures. */
export function buildProps(p: PropSet): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const colr = new THREE.Color();

  // Trees: a trunk and a two-blob crown, cartoon greens like the models'.
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 3, 6).translate(0, 1.5, 0);
  // Round, soft crowns like the trees in the building pictures.
  const crownGeo = mergeGeometries([
    new THREE.SphereGeometry(2.3, 14, 10).scale(1, 0.85, 1).translate(0, 4.3, 0),
    new THREE.SphereGeometry(1.7, 12, 8).scale(1, 0.85, 1).translate(0.2, 5.8, 0.2),
  ])!;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#7a5233' }), p.trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), p.trees.length);
  const greens = ['#9fd13a', '#8cc63f', '#a8d84a', '#7fbf35'];
  p.trees.forEach((t, i) => {
    q.setFromAxisAngle(v.set(0, 1, 0), i * 1.7);
    m.compose(v.set(t.x, KERB_H, t.z), q, s.set(t.s, t.s, t.s));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, colr.set(greens[i % greens.length]));
  });
  g.add(trunks, crowns);

  // Lamp posts: dark green pole with a warm lamp.
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6).translate(0, 2.6, 0),
    new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 5.35, 0),
  ])!;
  const lamps = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#2f4a3f' }), p.lamps.length);
  p.lamps.forEach((l, i) => {
    m.compose(v.set(l.x, KERB_H, l.z), q.identity(), s.set(1, 1, 1));
    lamps.setMatrixAt(i, m);
  });
  g.add(lamps);

  // Fence and railing posts with a rail on top.
  const postGeo = new THREE.BoxGeometry(0.18, 1, 0.18).translate(0, 0.5, 0);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), p.posts.length);
  p.posts.forEach((pt, i) => {
    m.compose(v.set(pt.x, KERB_H, pt.z), q.identity(), s.set(1, pt.h, 1));
    posts.setMatrixAt(i, m);
    posts.setColorAt(i, colr.set(pt.color));
  });
  g.add(posts);
  return g;
}
