// =====================================================================
// ground.ts — everything flat (or nearly flat) in the 2.5D map: roads,
// lane lines, crosswalks, sidewalks with kerbs, lawns, the waterfront
// promenade, the sea wall and the water. Plus the small coded things
// on blocks that have no building picture yet: ad panels, empty lots,
// the park, the gym pool, landmark building sites, home plots.
//
// The camera never turns, so only the faces it can see are built (tops,
// east and south sides). Flat parts use plain colours (no lighting):
// the colours are picked from the building pictures so they match.
// All the plain-coloured boxes are merged into ONE mesh (one draw call).
// =====================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AD_PRICES } from '../data/plots.ts';
import {
  CELL_D, CELL_W, COLS, DOWNTOWN, GRID_D, GRID_W, PROMENADE, ROWS, SPACE_D, SPACE_W, STRIP, cellX, cellZ,
  type Block, type Side,
} from './plan.ts';

// ---- colours (matched to the lit building pictures)
export const C = {
  asphalt: '#6a6977',
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

  /** Box from (x0, y0, z0) to (x1, y1, z1): top + the east and south sides. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: string, side?: string): void {
    const t = col(top);
    const s = col(side ?? top);
    const sE = s.clone().multiplyScalar(0.88);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], t); // top (counter-clockwise from above)
    if (y1 - y0 > 0.001) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], s); // south
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], sE); // east
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
  g.rotation.y = Math.PI / 4; // face the camera (south-east)
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

function adTexture(side: 'LEFT' | 'RIGHT', rented: string | null, price: number): THREE.CanvasTexture {
  // The panel lies flat. The text is drawn turned 45° and stretched 2x
  // tall, so from the fixed camera it reads straight and upright, like
  // a sticker on the screen (the trick Clash of Clans uses for decals).
  return textTexture(512, 680, (g) => {
    g.fillStyle = rented ? '#e63946' : '#fffaf0';
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
    g.rotate(-Math.PI / 4);
    g.scale(1, 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (rented) {
      g.fillStyle = '#ffffff';
      g.font = '900 54px system-ui, sans-serif';
      g.fillText(rented, 0, -26, 560);
      g.font = '700 26px system-ui, sans-serif';
      g.fillText('Open late · Fulton St', 0, 22, 520);
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

export interface GroundBuild {
  group: THREE.Group;
  props: PropSet;
  /** Things to update each frame (water ripples). */
  tick: (t: number) => void;
}

export function buildGround(): GroundBuild {
  const group = new THREE.Group();
  const b = new BoxBatch();
  const props: PropSet = { trees: [], lamps: [], posts: [], rocks: [] };

  // ---- land beyond the grid (north and east: hidden under clouds)
  b.rect(-PROMENADE, -400, GRID_W + 400, 0, -0.02, C.grass);
  b.rect(GRID_W, 0, GRID_W + 400, GRID_D + PROMENADE, -0.02, C.grass);

  // ---- asphalt over the whole grid; blocks sit on top
  b.rect(0, 0, GRID_W, GRID_D, -0.4, C.asphalt);

  // Lane lines, crosswalks and street lamps come with Peter's road and
  // intersection pictures (placed in main.ts); the asphalt above only
  // fills any hairline gaps between them.

  // ---- waterfront: promenade on the west and south, sea wall, water
  b.box(-PROMENADE, -2.2, 0, 0, KERB_H, GRID_D + PROMENADE, C.promenade, C.stoneSide);
  b.box(-PROMENADE, -2.2, GRID_D, GRID_W, KERB_H, GRID_D + PROMENADE, C.promenade, C.stoneSide);
  b.box(GRID_W, -2.2, GRID_D, GRID_W + 400, -0.02, GRID_D + PROMENADE, C.grass, C.stoneSide);
  // A stone edge band along the water.
  b.rect(-PROMENADE, 0, -PROMENADE + 1.2, GRID_D + PROMENADE, KERB_H + 0.01, C.stone);
  b.rect(-PROMENADE, GRID_D + PROMENADE - 1.2, GRID_W, GRID_D + PROMENADE, KERB_H + 0.01, C.stone);
  for (let z = 6; z < GRID_D + PROMENADE - 2; z += 2.4) props.posts.push({ x: -PROMENADE + 0.6, z, h: 1.1, color: C.rail });
  for (let x = -PROMENADE + 1; x < GRID_W; x += 2.4) props.posts.push({ x, z: GRID_D + PROMENADE - 0.6, h: 1.1, color: C.rail });
  for (let z = 10; z < GRID_D; z += 18) props.trees.push({ x: -PROMENADE / 2 - 1, z, s: 1 });
  for (let z = 37; z < GRID_D; z += 72) props.rocks.push({ x: -PROMENADE + 3, z, s: 0.9 });
  for (let x = 46; x < GRID_W; x += 90) props.rocks.push({ x, z: GRID_D + PROMENADE - 3, s: 0.9 });
  for (let x = 4; x < GRID_W; x += 18) props.trees.push({ x, z: GRID_D + PROMENADE / 2 + 1, s: 1 });

  // ---- blocks
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x0 = cellX(c);
      const z0 = cellZ(r);
      // The sidewalk slab (its edge is the kerb).
      b.box(x0, 0, z0, x0 + CELL_W, KERB_H, z0 + CELL_D, C.pave, C.paveSide);
      blockContent(DOWNTOWN[r][c], x0, z0, b, group, props);
    }
  }

  group.add(b.mesh());

  // ---- water: one big plane, gently moving ripples
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
  ripples.repeat.set(30, 30);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshBasicMaterial({ map: ripples }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(GRID_W / 2 - 400, -1.6, GRID_D / 2 + 400);
  group.add(water);
  // Lighter shallow water along the sea wall.
  const sh = new BoxBatch();
  sh.rect(-PROMENADE - 7, 0, -PROMENADE, GRID_D + PROMENADE + 7, -1.55, C.shallows);
  sh.rect(-PROMENADE - 7, GRID_D + PROMENADE, GRID_W + 400, GRID_D + PROMENADE + 7, -1.55, C.shallows);
  const shMesh = sh.mesh();
  (shMesh.material as THREE.MeshBasicMaterial).transparent = true;
  (shMesh.material as THREE.MeshBasicMaterial).opacity = 0.55;
  group.add(shMesh);

  return {
    group,
    props,
    tick: (t) => {
      ripples.offset.set((t * 0.004) % 1, (t * 0.0025) % 1);
    },
  };
}

const SW = 3; // sidewalk width on coded blocks

function blockContent(blk: Block, x0: number, z0: number, b: BoxBatch, group: THREE.Group, props: PropSet): void {
  const x1 = x0 + CELL_W;
  const z1 = z0 + CELL_D;
  const y = KERB_H;
  const ix0 = x0 + SW;
  const ix1 = x1 - SW;
  const iz0 = z0 + SW;
  const iz1 = z1 - SW;
  switch (blk.kind) {
    case 'model':
      if (blk.side) strip(blk.side, x0, z0, b, props);
      return; // the picture brings its own ground
    case 'ads': {
      const mid = (x0 + x1) / 2;
      const price = AD_PRICES.downtown.unit;
      const halves: [number, number, 'LEFT' | 'RIGHT', string | null][] = [
        [ix0, mid - 0.6, 'LEFT', blk.rented[0]],
        [mid + 0.6, ix1, 'RIGHT', blk.rented[1]],
      ];
      for (const [a, c, side, rented] of halves) {
        b.box(a, y, iz0, c, y + 0.35, iz1, rented ? '#c0392b' : '#f5b700', rented ? '#8e2a20' : '#c99400');
        const tex = adTexture(side, rented, price);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(c - a - 1.6, iz1 - iz0 - 1.6), new THREE.MeshBasicMaterial({ map: tex }));
        panel.rotation.x = -Math.PI / 2;
        panel.position.set((a + c) / 2, y + 0.37, (iz0 + iz1) / 2);
        group.add(panel);
      }
      return;
    }
    case 'lot': {
      b.box(ix0, y, iz0, ix1, y + 0.05, iz1, C.grassDark);
      // patchy dirt
      b.rect(ix0 + 12, iz0 + 8, ix0 + 30, iz0 + 20, y + 0.06, C.dirt);
      b.rect(ix1 - 26, iz1 - 18, ix1 - 10, iz1 - 9, y + 0.06, C.dirt);
      fence(props, ix0 + 0.5, iz0 + 0.5, ix1 - 0.5, iz1 - 0.5, '#8a6a48', 1.3, 2.5);
      props.rocks.push({ x: ix0 + 20, z: iz0 + 13, s: 1 }, { x: ix1 - 18, z: iz1 - 14, s: 1.2 }, { x: ix1 - 10, z: iz0 + 10, s: 1 });
      props.trees.push({ x: ix0 + 6, z: iz0 + 6, s: 0.9 });
      group.add(signBoard(x0 + CELL_W / 2, z1 - 6, 14, 7, 2.2, signTexture('FOR LEASE', 'Tap to rent this lot', '#2a9d8f')));
      return;
    }
    case 'park': {
      if (blk.sprite) return; // Peter's playground picture
      b.box(ix0, y, iz0, ix1, y + 0.08, iz1, C.grass);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      b.rect(ix0, cz - 2, ix1, cz + 2, y + 0.09, C.promenade);
      b.rect(cx - 2, iz0, cx + 2, iz1, y + 0.09, C.promenade);
      b.box(cx - 7, y, cz - 7, cx + 7, y + 0.1, cz + 7, C.promenade);
      b.box(cx - 4.5, y, cz - 4.5, cx + 4.5, y + 0.9, cz + 4.5, C.stone, C.stoneSide);
      b.rect(cx - 3.8, cz - 3.8, cx + 3.8, cz + 3.8, y + 0.8, C.pool);
      for (let i = 0; i < 18; i++) {
        const a = i * 2.39996;
        const tx = cx + Math.cos(a) * (14 + (i % 4) * 7);
        const tz = cz + Math.sin(a) * (10 + (i % 3) * 6);
        if (Math.abs(tx - cx) < 3 || Math.abs(tz - cz) < 3) continue;
        if (tx < ix0 + 2 || tx > ix1 - 2 || tz < iz0 + 2 || tz > iz1 - 2) continue;
        props.trees.push({ x: tx, z: tz, s: 0.9 + (i % 3) * 0.2 });
      }
      group.add(signBoard(ix0 + 8, iz1 - 3, 12, 4.5, 1.2, signTexture(blk.name.toUpperCase(), 'Park', '#2d6a4f')));
      return;
    }
    case 'gym': {
      if (blk.sprite) {
        if (blk.side) strip(blk.side, x0, z0, b, props);
        return;
      }
      b.box(ix0, y, iz0, ix1, y + 0.1, iz1, C.deck);
      const px0 = ix0 + 10;
      const px1 = ix1 - 22;
      const pz0 = iz0 + 10;
      const pz1 = iz1 - 10;
      b.box(px0 - 1.2, y, pz0 - 1.2, px1 + 1.2, y + 0.25, pz1 + 1.2, C.poolEdge);
      b.rect(px0, pz0, px1, pz1, y + 0.26, C.pool);
      for (let i = 1; i < 6; i++) b.rect(px0, pz0 + ((pz1 - pz0) * i) / 6 - 0.15, px1, pz0 + ((pz1 - pz0) * i) / 6 + 0.15, y + 0.27, '#ffffff');
      for (let i = 0; i < 6; i++) b.box(px0 + 2 + i * 6, y, iz1 - 6, px0 + 4.5 + i * 6, y + 0.6, iz1 - 2.5, '#ffffff', '#d8dde2');
      fence(props, ix0 + 0.4, iz0 + 0.4, ix1 - 0.4, iz1 - 0.4, '#e7eef3', 1.1, 2);
      group.add(signBoard(ix1 - 11, iz1 - 6, 14, 6, 2.5, signTexture('GYM & POOL', 'Building coming soon', '#3a86ff')));
      return;
    }
    case 'landmark': {
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
    case 'homes': {
      // 8 spaces across, 2 rows deep. Houses are pictures (see main.ts);
      // here: lawns, hedges between plots, FOR RENT signs on empty ones.
      b.rect(ix0, iz0, ix1, iz1, y + 0.01, C.grass);
      for (const p of blk.plots) {
        const pa = ix0 + p.c * SPACE_W;
        const pb = pa + p.w * SPACE_W;
        const za = iz0 + p.r * SPACE_D;
        const zb = za + p.h * SPACE_D;
        if (!p.house) {
          b.box(pa + 0.6, y, za + 0.6, pb - 0.6, y + 0.05, zb - 0.6, '#9fcb4f');
          group.add(signBoard((pa + pb) / 2, p.r ? zb - 3 : za + 3.5, 6, 3, 0.9, signTexture('FOR RENT', 'Empty plot', '#e76f51')));
        }
        if (p.c + p.w < 8) b.box(pb - 0.25, y, za + 1, pb + 0.25, y + 0.9, zb - 1, C.hedge, '#4a7720');
        if (p.r === 0 && p.h === 1) b.box(pa + 0.5, y, zb - 0.25, pb - 0.5, y + 0.9, zb + 0.25, C.hedge, '#4a7720');
      }
      return;
    }
  }
}

/** The 30 m strip beside a square picture: a small plaza with trees (the subway picture goes on top in main.ts). */
function strip(side: Side, x0: number, z0: number, b: BoxBatch, props: PropSet): void {
  const y = KERB_H;
  b.rect(x0 + 1, z0 + 1, x0 + STRIP - 1, z0 + CELL_D - 1, y + 0.02, C.promenade);
  // a grass bed with trees along the back
  b.box(x0 + 4, y, z0 + 4, x0 + STRIP - 4, y + 0.4, z0 + 14, C.grass, C.paveSide);
  props.trees.push({ x: x0 + 9, z: z0 + 9, s: 1.1 }, { x: x0 + STRIP - 9, z: z0 + 9, s: 1 });
  if (side === 'subway') props.trees.push({ x: x0 + 5, z: z0 + CELL_D - 6, s: 0.9 }, { x: x0 + STRIP - 5, z: z0 + CELL_D - 6, s: 0.9 });
  if (side === 'plaza') {
    b.box(x0 + 4, y, z0 + CELL_D - 14, x0 + STRIP - 4, y + 0.4, z0 + CELL_D - 4, C.grass, C.paveSide);
    props.trees.push({ x: x0 + 10, z: z0 + CELL_D - 9, s: 1 }, { x: x0 + STRIP - 10, z: z0 + CELL_D - 9, s: 1.15 });
  }
}

function fence(props: PropSet, x0: number, z0: number, x1: number, z1: number, color: string, h: number, step: number): void {
  for (let x = x0; x <= x1; x += step) props.posts.push({ x, z: z0, h, color }, { x, z: z1, h, color });
  for (let z = z0 + step; z < z1; z += step) props.posts.push({ x: x0, z, h, color }, { x: x1, z, h, color });
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
