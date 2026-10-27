// =====================================================================
// homes.ts — the floor plans of player homes (Sims style: no roof, the
// walls nearest the camera cut down so you can see in).
//
// Each LAYOUT is a rectangle (width × depth, metres, centred on 0,0;
// the camera looks from +z), with:
//   rooms     — coloured floor areas (wood, tiles, carpet…)
//   walls     — wall lines inside the outer walls, with door gaps
//   furniture — the starting arrangement. Players can move every piece;
//               their arrangement is saved per home (state.homes).
//
// Different homes have different layouts on purpose: a studio, a loft
// and a shared apartment all feel different.
//
// TO ADD A HOME: add a layout here and point a home place at it in
// HOME_LAYOUT_FOR (place ids are in data/places.ts).
// =====================================================================

import { Registry } from '../core/registry.ts';

export interface HomeRoom {
  label: string;
  /** [minX, minZ, maxX, maxZ] */
  rect: [number, number, number, number];
  /** Old plans: a plain floor colour (turned into the nearest floor style). */
  floor: string;
  /** The room's starting floor and walls (data/home-style.ts), e.g. { floor: 'herringbone', wall: 'paint:#e8d8c3' }. */
  style?: { floor?: string; wall?: string };
}

export interface HomeWall {
  /** From point a to point b (x, z), axis-aligned. */
  a: [number, number];
  b: [number, number];
  /** Door gaps along the wall: [from, to] distances from a. */
  gaps?: [number, number][];
}

export interface HomeItem {
  /** Unique within the home (so two chairs can be told apart). */
  uid: string;
  item: string;
  x: number;
  z: number;
  /** Turn in quarter steps is nicest, but any radians work (0 = facing the camera). */
  rot: number;
  /** Chosen colours: main (fabric), frame (wood), and bulb colour for lights (data/home-style.ts). */
  a?: string;
  b?: string;
  lc?: string;
}

/**
 * What it's like to live there, beyond the furniture (2026-10-13). Kept
 * light: a little texture, never a daily punishment.
 */
export interface HomeConditions {
  /** Roommates who live there and wander about (names); you can chat with them. */
  roommates?: { name: string; body: 'm' | 'f'; skin: string; top: string; bottom: string; hair: string; habit: string }[];
  /** The bathroom is shared: now and then it's taken and you wait a moment. */
  sharedBathroom?: boolean;
  /** Street noise at night: an occasional broken sleep. */
  noise?: { chance: number; label: string };
  /** A doorman takes in your deliveries. */
  doorman?: boolean;
  /** A housekeeper keeps the place spotless (a small good mood, once a day). */
  housekeeper?: boolean;
}

export interface HomeLayout {
  id: string;
  name: string;
  width: number;
  depth: number;
  wallColor: string;
  rooms: HomeRoom[];
  walls: HomeWall[];
  furniture: HomeItem[];
  conditions?: HomeConditions;
  /** Busy places: NPC visitors, emoji pops over heads, and room effects (world/venue-life.ts). */
  life?: {
    visitors: number;
    pops: string[];
    fx: ('club' | 'steam' | 'notes' | 'flicker' | 'neon' | 'ducks' | 'splash')[];
    /** A waiter who carries drinks from `from` (a piece uid) to the `to` tables (world/venue-life.ts). */
    runner?: { from: string; to: string[]; carry: string[] };
  };
  /** Workplaces: where the (up to 6) workers stand; NPC coworkers fill the spots no player has taken. */
  workers?: { x: number; z: number; rot: number }[];
  /** Big homes: pinch to zoom and drag to pan (small homes keep a fixed view). */
  zoomable?: boolean;
  /**
   * Venues: how the room is lit, whatever the time (homes follow the clock).
   * 'outdoor' follows the clock too (the park, the alley).
   */
  mood?: 'bright' | 'cozy' | 'bar' | 'club' | 'arcade' | 'casino' | 'outdoor';
  /**
   * Not a plain rectangle (2026-10-27): the home is the union of its rooms,
   * and the outer walls are traced round it (world/footprint.ts). `door`
   * is then the front door, a point on an outer wall.
   */
  shaped?: boolean;
  door?: { x: number; z: number };
  /** Wall height (default 2.9 m; a park's hedges are lower). */
  wallHeight?: number;
  /** Video walls (animated colour on a wall): galaxy, waves, stocks, game. */
  screens?: { x: number; y: number; z: number; rot: number; w: number; h: number; kind?: 'galaxy' | 'waves' | 'stocks' | 'game' }[];
  /** Glowing signs on the walls (neon words, menu boards): world/home-interior.ts. */
  signs?: { text: string; color: string; x: number; y: number; z: number; rot: number; size?: number; font?: 'script' | 'block' }[];
  /** Homes: the car parked on the driveway when you don't own one yet (a vehicle id + paint). */
  yardCar?: { model: string; paint: string };
  /** Bumped when a plan changes shape: saved arrangements for an older version are reset (bought pieces go to Storage). */
  version?: number;
  /** Windows on the back wall (default: two ordinary ones). `view: 'park'` shows Central Park. */
  windows?: { xs: number[]; w: number; h: number; y: number; view?: 'sky' | 'park' };
}

const PI = Math.PI;
const H = PI / 2;

export const HOME_LAYOUTS = new Registry<HomeLayout>('home layout');

HOME_LAYOUTS.add(
  {
    // THE BROKE START (10 × 8): a room in a shared East Harlem walk-up. Your
    // room and the shared bathroom at the back, the shared kitchen and
    // living room in front with two roommates' doors. Cheap chunky pieces.
    id: 'harlemWalkup',
    name: 'East Harlem walk-up',
    version: 3,
    shaped: true,
    door: { x: 2.5, z: 4 },
    width: 10,
    depth: 8,
    wallColor: '#e8dcc4',
    conditions: {
      roommates: [
        { name: 'Danny', body: 'm', skin: '#8d5524', top: '#2a9d8f', bottom: '#264653', hair: '#1b1b1b', habit: 'works nights at the bakery on 116th' },
        { name: 'Keisha', body: 'f', skin: '#5c3a21', top: '#e9c46a', bottom: '#3d5a80', hair: '#2b1a10', habit: 'nursing student, always studying' },
      ],
      sharedBathroom: true,
    },
    rooms: [
      { label: 'Your room', rect: [-5, -4, 1.5, 0], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#9ec5e8' } },
      { label: 'Bathroom', rect: [1.5, -4, 5, 0], floor: '#b98a5e', style: { floor: 'tile:#d6dde3', wall: 'subway:#e9efe9' } },
      { label: 'Kitchen', rect: [-5, 0, -1, 4], floor: '#b98a5e', style: { floor: 'checker', wall: 'paint:#f2d3a0' } },
      { label: 'Living', rect: [-1, 0, 5, 4], floor: '#b98a5e', style: { floor: 'terracotta', wall: 'paint:#f2d3a0' } },
    ],
    walls: [
      { a: [-5, 0], b: [5, 0], gaps: [[3.5, 4.5], [7.2, 8.2]] },
      { a: [1.5, -4], b: [1.5, 0] },
    ],
    furniture: [
      { uid: 'bed', item: 'twinBed', x: -4.3, z: -2.865, rot: 0, a: '#3d6b9c' },
      { uid: 'night', item: 'crateNightstand', x: -3.45, z: -3.68, rot: 0 },
      { uid: 'radiator', item: 'radiator', x: -2.5, z: -3.79, rot: 0 },
      { uid: 'ac', item: 'windowAC', x: -2.5, z: -3.631, rot: 0 },
      { uid: 'desk', item: 'foldingDesk', x: -0.6, z: -3.365, rot: 0 },
      { uid: 'boxes', item: 'movingBoxes', x: 0.8, z: -3.4, rot: 0 },
      { uid: 'rack', item: 'clothesRack', x: -4.63, z: -0.9, rot: H },
      { uid: 'posters', item: 'posters', x: 0.6, z: -3.873, rot: 0 },
      { uid: 'laundry', item: 'laundryPile', x: -2.2, z: -1.0, rot: 0 },
      { uid: 'fan', item: 'standFan', x: 0.9, z: -0.6, rot: 0 },
      { uid: 'tub', item: 'tubShower', x: 4.1, z: -3.51, rot: 0 },
      { uid: 'toilet', item: 'oldToilet', x: 2.1, z: -3.57, rot: 0 },
      { uid: 'bsink', item: 'pedestalSink', x: 4.665, z: -1.6, rot: -H },
      { uid: 'fridge', item: 'oldFridge', x: -4.508, z: 0.52, rot: H },
      { uid: 'ksink', item: 'sinkCounter', x: -4.554, z: 1.53, rot: H },
      { uid: 'stove', item: 'oldStove', x: -4.527, z: 2.59, rot: H },
      { uid: 'trash', item: 'trashBags', x: -4.569, z: 3.423, rot: H },
      { uid: 'table', item: 'smallTable', x: -2.6, z: 2.0, rot: H },
      { uid: 'roomA', item: 'roommateDoor', x: 4.81, z: 3.2, rot: -H },
      { uid: 'roomB', item: 'roommateDoor', x: 4.81, z: 1.0, rot: -H },
      { uid: 'art', item: 'popArt', x: 4.867, z: 2.1, rot: -H },
      { uid: 'tv', item: 'crateTv', x: 0.5, z: 0.37, rot: 0 },
      { uid: 'couch', item: 'wornCouch', x: 0.5, z: 2.2, rot: PI },
      { uid: 'rug', item: 'wornRug', x: 0.5, z: 1.2, rot: 0 },
      { uid: 'plant', item: 'plantStool', x: -0.6, z: 3.6, rot: 0 },
      { uid: 'shoes', item: 'shoePile', x: 1.1, z: 3.6, rot: 0 },
    ],
  },
  {
    // The middle start (11 × 9, a Lagos 'selfcon' feel): a sleeping alcove,
    // a bathroom, an open kitchen and living room. Mustard walls, dark tiles.
    id: 'studio',
    name: 'Studio',
    version: 3,
    shaped: true,
    door: { x: 2, z: 4.5 },
    width: 11,
    depth: 9,
    wallColor: '#f3e3cc',
    conditions: { noise: { chance: 0.1, label: 'Sirens on Ninth Avenue woke you up' } },
    rooms: [
      { label: 'Sleeping alcove', rect: [-5.5, -4.5, 1.5, -0.5], floor: '#b98a5e', style: { floor: 'bigTile:#2a2626', wall: 'paint:#e9b955' } },
      { label: 'Bathroom', rect: [1.5, -4.5, 5.5, -0.5], floor: '#b98a5e', style: { floor: 'hex:#dfe7e6', wall: 'subway:#ffffff' } },
      { label: 'Kitchen', rect: [-5.5, -0.5, -1.5, 4.5], floor: '#b98a5e', style: { floor: 'tile:#e9e4d8', wall: 'paint:#e9b955' } },
      { label: 'Living', rect: [-1.5, -0.5, 5.5, 4.5], floor: '#b98a5e', style: { floor: 'bigTile:#2a2626', wall: 'paint:#e9b955' } },
    ],
    walls: [
      { a: [-5.5, -0.5], b: [5.5, -0.5], gaps: [[1.8, 4.3], [7.9, 8.9]] },
      { a: [1.5, -4.5], b: [1.5, -0.5] },
    ],
    furniture: [
      { uid: 'bed', item: 'bedDouble', x: -2.5, z: -3.265, rot: 0, a: '#d94a3a', b: '#c9a27a' },
      { uid: 'night', item: 'nightstand', x: -4.0, z: -4.173, rot: 0 },
      { uid: 'night2', item: 'nightstand', x: -1.0, z: -4.173, rot: 0 },
      { uid: 'lamp1', item: 'ceramicLamp', x: -4.0, z: -4.2, rot: 0 },
      { uid: 'closet', item: 'closet', x: -5.14, z: -2.0, rot: H },
      { uid: 'desk', item: 'deskScreen', x: 0.998, z: -3.3, rot: -H },
      { uid: 'ring', item: 'ringLight', x: 0.9, z: -1.3, rot: 0 },
      { uid: 'ac1', item: 'splitAC', x: -4.6, z: -4.262, rot: 0 },
      { uid: 'sconce1', item: 'sconce', x: -3.9, z: -4.27, rot: 0 },
      { uid: 'sconce2', item: 'sconce', x: -1.1, z: -4.27, rot: 0 },
      { uid: 'brug', item: 'squareRug', x: -2.5, z: -1.6, rot: 0, a: '#a3202c' },
      { uid: 'lantern', item: 'paperLantern', x: -2.5, z: -2.4, rot: 0 },
      { uid: 'shower', item: 'shower', x: 4.85, z: -3.8, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 2.4, z: -3.913, rot: 0 },
      { uid: 'bsink', item: 'bathSink', x: 5.046, z: -1.6, rot: -H },
      { uid: 'mirror', item: 'ovalMirror', x: 5.381, z: -1.6, rot: -H },
      { uid: 'washer', item: 'frontLoader', x: 1.941, z: -2.4, rot: H },
      { uid: 'bathLight', item: 'flushLight', x: 3.5, z: -2.5, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: -5.098, z: 0.1, rot: H },
      { uid: 'counter', item: 'counter', x: -4.94, z: 0.98, rot: H },
      { uid: 'stove', item: 'stove', x: -4.94, z: 1.86, rot: H },
      { uid: 'ksink', item: 'kitchenSink', x: -4.94, z: 2.74, rot: H },
      { uid: 'water', item: 'waterDispenser', x: -5.1, z: 3.9, rot: 0 },
      { uid: 'dining', item: 'pedestalTable', x: -3.2, z: 2.9, rot: 0 },
      { uid: 'chairA', item: 'slatChair', x: -4.15, z: 2.9, rot: H },
      { uid: 'chairB', item: 'slatChair', x: -2.25, z: 2.9, rot: -H },
      { uid: 'diningLight', item: 'domePendant', x: -3.2, z: 2.9, rot: 0 },
      { uid: 'tv', item: 'tvConsole', x: 5.13, z: 1.8, rot: -H },
      { uid: 'led', item: 'ledStrip', x: 5.374, z: 1.8, rot: -H, lc: '#9b5cff' },
      { uid: 'ac2', item: 'splitAC', x: 5.262, z: 3.7, rot: -H },
      { uid: 'art2', item: 'popArt', x: 5.367, z: 0.2, rot: -H },
      { uid: 'sofa', item: 'modernSofa', x: 1.8, z: 1.8, rot: H, a: '#2f6b4f' },
      { uid: 'rug', item: 'squareRug', x: 3.4, z: 1.8, rot: 0, a: '#a3202c' },
      { uid: 'coffee', item: 'coffeeTable', x: 3.4, z: 1.8, rot: H },
      { uid: 'arm', item: 'armchair', x: 4.2, z: 3.4, rot: PI },
      { uid: 'fan', item: 'standFan', x: -1.0, z: 0.3, rot: 0 },
      { uid: 'plant', item: 'plant', x: 5.1, z: 0.0, rot: 0 },
      { uid: 'light', item: 'globePendantGrey', x: 3.4, z: 1.8, rot: 0 },
      { uid: 'mat', item: 'doormat', x: 2, z: 4.05, rot: 0 },
    ],
  },
  {
    // A Brooklyn loft (14 × 11): two bedrooms and a bathroom at the back, a
    // big open kitchen / dining / living in front, brick and concrete.
    id: 'loft',
    name: 'Loft',
    version: 4,
    shaped: true,
    door: { x: 2.5, z: 5.5 },
    width: 14,
    depth: 11,
    wallColor: '#e7d3c1',
    zoomable: true,
    windows: { xs: [0], w: 2.4, h: 2.1, y: 1.55, view: 'sky' },
    rooms: [
      { label: 'Bedroom', rect: [-7, -5.5, -1.5, 0], floor: '#b98a5e', style: { floor: 'oak', wall: 'whiteBrick' } },
      { label: 'Bathroom', rect: [-1.5, -5.5, 1.5, -2], floor: '#b98a5e', style: { floor: 'hex:#dfe7e6', wall: 'subway:#f4f4f2' } },
      { label: 'Hall', rect: [-1.5, -2, 1.5, 0], floor: '#b98a5e', style: { floor: 'concrete', wall: 'brick' } },
      { label: 'Second bedroom', rect: [1.5, -5.5, 7, 0], floor: '#b98a5e', style: { floor: 'oak', wall: 'brick' } },
      { label: 'Kitchen', rect: [-7, 0, -2, 5.5], floor: '#b98a5e', style: { floor: 'bigTile:#2b2b30', wall: 'subway:#f4f4f2' } },
      { label: 'Living', rect: [-2, 0, 7, 5.5], floor: '#b98a5e', style: { floor: 'concrete', wall: 'brick' } },
    ],
    walls: [
      { a: [-7, 0], b: [-1.5, 0], gaps: [[4, 5]] },
      { a: [1.5, 0], b: [7, 0], gaps: [[0.5, 1.5]] },
      { a: [-1.5, -5.5], b: [-1.5, 0] },
      { a: [1.5, -5.5], b: [1.5, 0] },
      { a: [-1.5, -2], b: [1.5, -2], gaps: [[1, 2]] },
    ],
    furniture: [
      { uid: 'bed', item: 'upholsteredKing', x: -4.3, z: -4.204, rot: 0, a: '#2f4f6f', b: '#3b2a20' },
      { uid: 'night', item: 'nightstandTwo', x: -5.8, z: -5.104, rot: 0 },
      { uid: 'night2', item: 'nightstandTwo', x: -2.8, z: -5.104, rot: 0 },
      { uid: 'lamp1', item: 'ceramicLamp', x: -5.8, z: -5.15, rot: 0 },
      { uid: 'closet', item: 'closet', x: -6.64, z: -1.6, rot: H },
      { uid: 'brug', item: 'shagRug', x: -4.3, z: -2.0, rot: 0, a: '#e9b44c' },
      { uid: 'barm', item: 'armchair', x: -2.1, z: -1.6, rot: 0 },
      { uid: 'led1', item: 'ledStrip', x: -4.3, z: -5.374, rot: 0, lc: '#ffd29a' },
      { uid: 'ac1', item: 'splitAC', x: -6.2, z: -5.262, rot: 0 },
      { uid: 'bart', item: 'artwork', x: -2.3, z: -5.21, rot: 0 },
      { uid: 'lantern', item: 'paperLantern', x: -4.3, z: -2.6, rot: 0 },
      { uid: 'shower', item: 'rainShower', x: 0.95, z: -4.95, rot: 0 },
      { uid: 'toilet', item: 'toiletClassic', x: -0.9, z: -4.967, rot: 0 },
      { uid: 'bsink', item: 'vanity', x: -1.07, z: -3.2, rot: H },
      { uid: 'washer', item: 'frontLoader', x: 1.059, z: -3.3, rot: -H },
      { uid: 'bathLight', item: 'flushLight', x: 0, z: -3.6, rot: 0 },
      { uid: 'bed2', item: 'bedDouble', x: 4.6, z: -4.265, rot: 0, a: '#e76f51' },
      { uid: 'night3', item: 'nightstandOpen', x: 6.15, z: -5.104, rot: 0 },
      { uid: 'closet2', item: 'closet', x: 1.86, z: -4.0, rot: H },
      { uid: 'desk', item: 'deskScreen', x: 6.498, z: -1.6, rot: -H },
      { uid: 'rug2', item: 'rugRound', x: 4.4, z: -2.5, rot: 0 },
      { uid: 'led2', item: 'ledStrip', x: 4.6, z: -5.374, rot: 0, lc: '#3d8bff' },
      { uid: 'art2', item: 'popArt', x: 2.4, z: -5.367, rot: 0 },
      { uid: 'ac2', item: 'splitAC', x: 6.762, z: -4.3, rot: -H },
      { uid: 'light2', item: 'bellPendant', x: 4.4, z: -2.6, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: -6.598, z: 0.6, rot: H },
      { uid: 'counter', item: 'counter', x: -6.44, z: 1.48, rot: H },
      { uid: 'stove', item: 'stove', x: -6.44, z: 2.36, rot: H },
      { uid: 'ksink', item: 'kitchenSink', x: -6.44, z: 3.24, rot: H },
      { uid: 'counterMicrowave', item: 'counterMicrowave', x: -6.44, z: 4.12, rot: H },
      { uid: 'water', item: 'waterDispenser', x: -6.6, z: 5.0, rot: 0 },
      { uid: 'island', item: 'island', x: -4.4, z: 2.6, rot: H },
      { uid: 'stool0', item: 'barStool', x: -3.3, z: 2.0, rot: -H },
      { uid: 'stool1', item: 'barStool', x: -3.3, z: 2.6, rot: -H },
      { uid: 'stool2', item: 'barStool', x: -3.3, z: 3.2, rot: -H },
      { uid: 'islandLight', item: 'edisonCluster', x: -4.4, z: 2.6, rot: 0 },
      { uid: 'tv', item: 'tvConsole', x: 6.63, z: 2.6, rot: -H },
      { uid: 'led3', item: 'ledStrip', x: 6.874, z: 2.6, rot: -H, lc: '#9b5cff' },
      { uid: 'art3', item: 'popArt', x: 6.867, z: 0.7, rot: -H },
      { uid: 'sofa', item: 'sectionalL', x: 2.6, z: 2.6, rot: H, a: '#e88aa8' },
      { uid: 'rug', item: 'borderRug', x: 4.8, z: 2.6, rot: H, a: '#f2f2f2', b: '#1d1e22' },
      { uid: 'coffee', item: 'squareCoffee', x: 4.8, z: 2.6, rot: 0 },
      { uid: 'dining', item: 'farmTable', x: -0.4, z: 2.6, rot: H },
      { uid: 'chairA0', item: 'spindleChair', x: -1.15, z: 2.2, rot: H },
      { uid: 'chairB0', item: 'spindleChair', x: 0.35, z: 2.2, rot: -H },
      { uid: 'chairA1', item: 'spindleChair', x: -1.15, z: 3.0, rot: H },
      { uid: 'chairB1', item: 'spindleChair', x: 0.35, z: 3.0, rot: -H },
      { uid: 'diningLight', item: 'geoTrio', x: -0.4, z: 2.6, rot: 0 },
      { uid: 'ring', item: 'ringLight', x: 6.4, z: 4.8, rot: 0 },
      { uid: 'plant', item: 'monstera', x: 6.6, z: 0.4, rot: 0 },
      { uid: 'tree', item: 'oliveTree', x: -1.5, z: 5.0, rot: 0 },
      { uid: 'fan', item: 'ceilingFan', x: 4.6, z: 2.6, rot: 0 },
      { uid: 'mat', item: 'doormat', x: 2.5, z: 5.05, rot: 0 },
    ],
  },
  {
    // A room in a shared apartment: your bedroom, plus the shared kitchen and bathroom.
    id: 'shared',
    name: 'Shared apartment',
    width: 12,
    depth: 9,
    wallColor: '#e3e9d8',
    rooms: [
      { label: 'Your room', rect: [-6, -4.5, -0.5, 4.5], floor: '#b07d55', style: { floor: 'oak', wall: 'paint:#e3e9d8' } },
      { label: 'Kitchen', rect: [-0.5, -4.5, 6, 0], floor: '#e4dccd', style: { floor: 'checker', wall: 'paint:#f2ead6' } },
      { label: 'Bathroom', rect: [2.5, 0, 6, 4.5], floor: '#c4e2e6', style: { floor: 'hex:#dfe7e6', wall: 'subway:#ffffff' } },
      { label: 'Hall', rect: [-0.5, 0, 2.5, 4.5], floor: '#c9a27c', style: { floor: 'ash', wall: 'paint:#e3e9d8' } },
    ],
    walls: [
      { a: [-0.5, -4.5], b: [-0.5, 4.5], gaps: [[5.2, 6.4]] },
      { a: [2.5, 0], b: [2.5, 4.5], gaps: [[0.6, 1.7]] },
      { a: [2.5, 0], b: [6, 0] },
    ],
    furniture: [
      { uid: 'bed', item: 'bedSingle', x: -5.0, z: -2.6, rot: 0 },
      { uid: 'night', item: 'nightstand', x: -3.9, z: -4.0, rot: 0 },
      { uid: 'desk', item: 'desk', x: -1.4, z: -3.4, rot: -H },
      { uid: 'tv', item: 'tvVintage', x: -5.4, z: 1.6, rot: H },
      { uid: 'arm', item: 'armchair', x: -2.8, z: 1.6, rot: -H },
      { uid: 'rug', item: 'rugRound', x: -3.6, z: 1.4, rot: 0 },
      { uid: 'books', item: 'bookcase', x: -3.2, z: -4.1, rot: 0 },
      { uid: 'plant', item: 'plant', x: -5.5, z: 4.0, rot: 0 },
      { uid: 'stove', item: 'stove', x: 0.2, z: -4.0, rot: 0 },
      { uid: 'ksink', item: 'kitchenSink', x: 1.1, z: -4.0, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: 2.1, z: -4.1, rot: 0 },
      { uid: 'dining', item: 'diningTable', x: 3.6, z: -2.0, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 5.4, z: 1.2, rot: -H },
      { uid: 'shower', item: 'shower', x: 5.3, z: 3.8, rot: 0 },
      { uid: 'bsink', item: 'bathSink', x: 3.3, z: 0.4, rot: 0 },
      { uid: 'coat', item: 'coatRack', x: 0.1, z: 3.9, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: 5.5, z: -4.1, rot: 0 },
      { uid: 'closet', item: 'closet', x: -5.6, z: -0.6, rot: H },
    ],
  },
  {
    // The city shelter (10 × 8): two bunk beds, lockers, a washroom and a
    // common corner. Where you land after bankruptcy.
    id: 'shelter',
    name: 'Shelter dorm',
    version: 3,
    shaped: true,
    door: { x: -1, z: 4 },
    width: 10,
    depth: 8,
    wallColor: '#dfe6ee',
    rooms: [
      { label: 'Dorm', rect: [-5, -4, 1.5, 4], floor: '#b98a5e', style: { floor: 'tile:#cfd8dc', wall: 'paint:#bfe0d4' } },
      { label: 'Washroom', rect: [1.5, -4, 5, 0], floor: '#b98a5e', style: { floor: 'tile:#d6dde3', wall: 'subway:#e9eef2' } },
      { label: 'Common', rect: [1.5, 0, 5, 4], floor: '#b98a5e', style: { floor: 'tile:#cfd8dc', wall: 'paint:#bfe0d4' } },
    ],
    walls: [
      { a: [1.5, -4], b: [1.5, 0], gaps: [[2.4, 3.4]] },
      { a: [1.5, 0], b: [5, 0], gaps: [[1, 2]] },
    ],
    furniture: [
      { uid: 'bed', item: 'bunkBed', x: -4.2, z: -2.791, rot: 0, a: '#4f86a6' },
      { uid: 'bed2', item: 'bunkBed', x: -2.4, z: -2.791, rot: 0, a: '#e76f51' },
      { uid: 'lockers', item: 'lockers', x: -4.63, z: 1.0, rot: H },
      { uid: 'posters', item: 'posters', x: -0.6, z: -3.873, rot: 0 },
      { uid: 'clock', item: 'wallClock', x: 0.8, z: -3.868, rot: 0 },
      { uid: 'bench', item: 'cushionBench', x: -3.3, z: -1.2, rot: 0 },
      { uid: 'plant', item: 'plant', x: 1.0, z: -3.5, rot: 0 },
      { uid: 'fan', item: 'standFan', x: -0.3, z: 1.0, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 4.3, z: -3.413, rot: 0 },
      { uid: 'bsink', item: 'bathSink', x: 2.4, z: -3.546, rot: 0 },
      { uid: 'shower', item: 'shower', x: 4.308, z: -1.1, rot: -H },
      { uid: 'dining', item: 'diningTable', x: 2.9, z: 2.0, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: 4.598, z: 3.4, rot: -H },
      { uid: 'tv', item: 'tvVintage', x: 4.62, z: 0.8, rot: -H },
      { uid: 'trash', item: 'trashcan', x: 1.9, z: 3.6, rot: 0 },
      { uid: 'water', item: 'waterDispenser', x: 1.9, z: 0.5, rot: 0 },
    ],
  },
  {
    // THE RICH START, v5 (17 × 13; Peter, 2026-10-27: Lagos Life houses).
    // Primary suite (black gloss tiles, walk-in closet, marble bathroom),
    // a pink second bedroom with a glass shower, a third bedroom, a big
    // living room with pink sofas round a rug and a pool table, a dining
    // room, a kitchen with an island, a guest bathroom. A garden and a car.
    id: 'uesTwoBed',
    name: 'Upper East Side residence',
    version: 5,
    shaped: true,
    door: { x: -5, z: 6.5 },
    width: 17,
    depth: 13,
    wallColor: '#eef1f4',
    conditions: { doorman: true },
    zoomable: true,
    windows: { xs: [0], w: 1.7, h: 1.8, y: 1.6, view: 'sky' },
    yardCar: { model: 'aurora', paint: '#f4f4f2' },
    rooms: [
      { label: 'Primary bedroom', rect: [-8.5, -6.5, -2, -1], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'paint:#26262b' } },
      { label: 'Walk-in closet', rect: [-2, -6.5, 1, -4], floor: '#b98a5e', style: { floor: 'walnut', wall: 'woodPanel' } },
      { label: 'Primary bathroom', rect: [-2, -4, 1, -1], floor: '#b98a5e', style: { floor: 'marble', wall: 'marbleWall' } },
      { label: 'Second bedroom', rect: [1, -6.5, 4.5, -1], floor: '#b98a5e', style: { floor: 'bigTile:#e9e2d6', wall: 'paint:#f2c6d6' } },
      { label: 'Kitchen', rect: [4.5, -6.5, 8.5, -1], floor: '#b98a5e', style: { floor: 'bigTile:#e8e0d0', wall: 'subway:#f4f4f2' } },
      { label: 'Living room', rect: [-8.5, -1, 0.5, 6.5], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'paint:#26262b' } },
      { label: 'Dining room', rect: [0.5, -1, 8.5, 2.5], floor: '#b98a5e', style: { floor: 'bigTile:#e8e0d0', wall: 'paint:#26262b' } },
      { label: 'Third bedroom', rect: [0.5, 2.5, 5, 6.5], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'paint:#cfe0ee' } },
      { label: 'Guest bathroom', rect: [5, 2.5, 8.5, 6.5], floor: '#b98a5e', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
    ],
    walls: [
      { a: [-8.5, -1], b: [4.5, -1], gaps: [[5.1, 6.2], [9.8, 10.8]] },
      { a: [-2, -6.5], b: [-2, -1], gaps: [[0.7, 1.7], [3.5, 4.5]] },
      { a: [-2, -4], b: [1, -4] },
      { a: [1, -6.5], b: [1, -1] },
      { a: [4.5, -6.5], b: [4.5, -1] },
      { a: [0.5, 2.5], b: [8.5, 2.5], gaps: [[0.5, 1.5], [5.5, 6.5]] },
      { a: [5, 2.5], b: [5, 6.5] },
      { a: [0.5, 2.5], b: [0.5, 6.5] },
    ],
    furniture: [
      { uid: 'bed', item: 'upholsteredKing', x: -5.3, z: -5.204, rot: 0, a: '#5b2a86', b: '#1d1e22' },
      { uid: 'night', item: 'nightstandTwo', x: -6.8, z: -6.104, rot: 0, a: '#1d1e22' },
      { uid: 'night2', item: 'nightstandTwo', x: -3.8, z: -6.104, rot: 0, a: '#1d1e22' },
      { uid: 'lamp1', item: 'ceramicLamp', x: -6.8, z: -6.15, rot: 0 },
      { uid: 'lamp2', item: 'ceramicLamp', x: -3.8, z: -6.15, rot: 0 },
      { uid: 'brug', item: 'borderRug', x: -5.3, z: -3.3, rot: 0, a: '#a3202c', b: '#d4a84b' },
      { uid: 'dresser', item: 'midDresser', x: -8.11, z: -2.4, rot: H, a: '#1d1e22' },
      { uid: 'btv', item: 'tvConsole', x: -5.3, z: -1.37, rot: PI },
      { uid: 'ring', item: 'ringLight', x: -7.8, z: -5.4, rot: 0 },
      { uid: 'led1', item: 'ledStrip', x: -5.3, z: -6.374, rot: 0, lc: '#9b5cff' },
      { uid: 'ac1', item: 'splitAC', x: -7.6, z: -6.262, rot: 0 },
      { uid: 'art1', item: 'popArt', x: -3.0, z: -6.367, rot: 0 },
      { uid: 'bchand', item: 'ringPendant', x: -5.3, z: -3.6, rot: 0 },
      { uid: 'bplant', item: 'monstera', x: -2.35, z: -3.7, rot: 0 },
      { uid: 'closet', item: 'wardrobeWall', x: -0.4, z: -6.065, rot: 0, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'closet2', item: 'closet', x: 0.64, z: -4.95, rot: -H },
      { uid: 'clight', item: 'tulipChandelier', x: -0.5, z: -5.3, rot: 0 },
      { uid: 'shower', item: 'rainShower', x: 0.45, z: -3.45, rot: 0 },
      { uid: 'toilet', item: 'luxToilet', x: -1.2, z: -3.413, rot: 0 },
      { uid: 'bsink', item: 'vanity', x: 0.57, z: -2.0, rot: -H },
      { uid: 'bathLight', item: 'glassGlobe', x: -0.5, z: -2.5, rot: 0 },
      { uid: 'bed2', item: 'bedDouble', x: 2.9, z: -5.265, rot: 0, a: '#ff8fb8', b: '#ffffff' },
      { uid: 'night3', item: 'nightstand', x: 4.12, z: -6.173, rot: 0 },
      { uid: 'shower2', item: 'roundShower', x: 3.85, z: -1.65, rot: 0 },
      { uid: 'ring2', item: 'ringLight', x: 1.4, z: -3.0, rot: 0 },
      { uid: 'chest2', item: 'drawerChest', x: 1.398, z: -4.6, rot: H },
      { uid: 'rug2', item: 'shagRug', x: 2.9, z: -3.3, rot: 0, a: '#ff5fa2' },
      { uid: 'led2', item: 'ledStrip', x: 2.9, z: -6.374, rot: 0, lc: '#ff5fa2' },
      { uid: 'art2', item: 'popArt', x: 1.5, z: -6.367, rot: 0 },
      { uid: 'lantern2', item: 'paperLantern', x: 2.9, z: -3.6, rot: 0 },
      { uid: 'fridge', item: 'doubleFridge', x: 5.14, z: -5.984, rot: 0 },
      { uid: 'cabinetDrawers', item: 'cabinetDrawers', x: 5.968, z: -6.071, rot: 0 },
      { uid: 'stove', item: 'proRange', x: 6.61, z: -6.085, rot: 0 },
      { uid: 'cabinetDoor', item: 'cabinetDoor', x: 7.252, z: -6.085, rot: 0 },
      { uid: 'cabinetTwo', item: 'cabinetTwo', x: 7.848, z: -6.071, rot: 0 },
      { uid: 'ksink', item: 'kitchenSink', x: 7.94, z: -5.1, rot: -H },
      { uid: 'cabinetMixed', item: 'cabinetMixed', x: 8.071, z: -4.362, rot: -H },
      { uid: 'counter', item: 'counter', x: 7.94, z: -3.624, rot: -H },
      { uid: 'waterDispenser', item: 'waterDispenser', x: 8.205, z: -2.994, rot: -H },
      { uid: 'upper1', item: 'upperDouble', x: 7.4, z: -6.17, rot: 0 },
      { uid: 'upper2', item: 'upperCabinet', x: 8.17, z: -4.3, rot: -H },
      { uid: 'island', item: 'island', x: 5.9, z: -3.4, rot: 0 },
      { uid: 'stool0', item: 'barStool', x: 5.35, z: -2.35, rot: PI },
      { uid: 'stool1', item: 'barStool', x: 5.9, z: -2.35, rot: PI },
      { uid: 'stool2', item: 'barStool', x: 6.45, z: -2.35, rot: PI },
      { uid: 'islandLight', item: 'tripleCups', x: 5.9, z: -3.4, rot: 0 },
      { uid: 'coffeeMaker', item: 'coffeeMaker', x: 7.95, z: -6.1, rot: 0 },
      { uid: 'tv', item: 'mediaWall', x: -8.138, z: 2.5, rot: H },
      { uid: 'rug', item: 'borderRug', x: -5.6, z: 2.5, rot: H, a: '#f2f2f2', b: '#1d1e22' },
      { uid: 'coffee', item: 'coffeeTable', x: -5.6, z: 2.5, rot: H, a: '#f4f4f2' },
      { uid: 'candles', item: 'candles', x: -5.6, z: 2.5, rot: 0 },
      { uid: 'sofa', item: 'threeSeater', x: -3.3, z: 2.5, rot: -H, a: '#e88aa8' },
      { uid: 'sofa2', item: 'greySofa', x: -5.6, z: 0.3, rot: 0, a: '#e88aa8' },
      { uid: 'sofa3', item: 'greySofa', x: -5.6, z: 4.7, rot: PI, a: '#e88aa8' },
      { uid: 'chandelier', item: 'crystalChandelier', x: -5.6, z: 2.5, rot: 0 },
      { uid: 'flamp', item: 'floorLamp', x: -8.0, z: 0.3, rot: 0 },
      { uid: 'flamp2', item: 'floorLamp', x: -8.0, z: 4.6, rot: 0 },
      { uid: 'fan', item: 'standFan', x: -2.8, z: 5.7, rot: 0 },
      { uid: 'books', item: 'whiteBookshelf', x: -1.0, z: -0.72, rot: 0 },
      { uid: 'pool', item: 'poolTable', x: -0.9, z: 3.3, rot: H },
      { uid: 'poolLight', item: 'sputnik', x: -0.9, z: 3.3, rot: 0 },
      { uid: 'palm', item: 'palmPot', x: 0.0, z: 6.0, rot: 0 },
      { uid: 'pampas', item: 'pampas', x: -8.0, z: 6.0, rot: 0 },
      { uid: 'dining', item: 'ovalDining', x: 4.2, z: 0.9, rot: 0 },
      { uid: 'chairA0', item: 'diningChair', x: 3.5, z: -0.05, rot: 0 },
      { uid: 'chairB0', item: 'diningChair', x: 3.5, z: 1.85, rot: PI },
      { uid: 'chairA1', item: 'diningChair', x: 4.2, z: -0.05, rot: 0 },
      { uid: 'chairB1', item: 'diningChair', x: 4.2, z: 1.85, rot: PI },
      { uid: 'chairA2', item: 'diningChair', x: 4.9, z: -0.05, rot: 0 },
      { uid: 'chairB2', item: 'diningChair', x: 4.9, z: 1.85, rot: PI },
      { uid: 'chairC', item: 'diningChair', x: 2.65, z: 0.9, rot: H },
      { uid: 'chairD', item: 'diningChair', x: 5.75, z: 0.9, rot: -H },
      { uid: 'vase', item: 'flowerVase', x: 4.2, z: 0.9, rot: 0 },
      { uid: 'chandelier2', item: 'tulipChandelier', x: 4.2, z: 0.9, rot: 0 },
      { uid: 'sideboard', item: 'sideboard', x: 8.11, z: 0.75, rot: -H },
      { uid: 'ac3', item: 'splitAC', x: 8.262, z: 0.75, rot: -H },
      { uid: 'clock', item: 'wallClock', x: 8.368, z: 2.0, rot: -H },
      { uid: 'art3', item: 'popArt', x: 8.367, z: -0.4, rot: -H },
      { uid: 'olive', item: 'oliveTree', x: 7.9, z: -0.6, rot: 0 },
      { uid: 'bed3', item: 'bedDouble', x: 3.765, z: 4.6, rot: -H, a: '#3d6b9c' },
      { uid: 'night5', item: 'nightstand', x: 4.673, z: 3.3, rot: -H },
      { uid: 'closet3', item: 'closet', x: 0.86, z: 4.8, rot: H },
      { uid: 'rug3', item: 'rugRound', x: 2.8, z: 4.6, rot: 0 },
      { uid: 'fan3', item: 'standFan', x: 2.0, z: 6.0, rot: 0 },
      { uid: 'light3', item: 'bellPendant', x: 2.8, z: 4.6, rot: 0 },
      { uid: 'tub2', item: 'bathtub', x: 7.83, z: 5.2, rot: -H },
      { uid: 'toilet2', item: 'toilet', x: 7.913, z: 3.3, rot: -H },
      { uid: 'bsink3', item: 'bathSink', x: 5.454, z: 4.0, rot: H },
      { uid: 'washer', item: 'washerStack', x: 5.5, z: 5.9, rot: 0 },
      { uid: 'gbLight', item: 'flushLight', x: 6.6, z: 4.5, rot: 0 },
      { uid: 'mat', item: 'doormat', x: -5, z: 6.05, rot: 0 },
    ],
  },
  {
    // THE BILLIONAIRE HOME, v5 (20 × 15; Lagos Life mansion feel): terracotta
    // floors and mustard walls, a primary suite with a four-poster bed,
    // walk-in closet and marble bathroom, a black-and-pink second bedroom
    // with a glass shower, a guest bedroom, a chef's kitchen with a marble
    // island, a living room round a big rug with a throne corner and a grand
    // piano, dining for eight, a pool table, a guest bathroom. No pool.
    id: 'penthouse',
    name: "Billionaires' Row penthouse",
    version: 5,
    shaped: true,
    door: { x: -6, z: 7.5 },
    width: 20,
    depth: 15,
    wallColor: '#f4efe6',
    conditions: { housekeeper: true, doorman: true },
    zoomable: true,
    windows: { xs: [0], w: 2.2, h: 2.0, y: 1.5, view: 'park' },
    yardCar: { model: 'summit', paint: '#1d1e22' },
    rooms: [
      { label: 'Primary suite', rect: [-10, -7.5, -3, -1.5], floor: '#b98a5e', style: { floor: 'bigTile:#7a3b22', wall: 'paint:#e3c47e' } },
      { label: 'Walk-in closet', rect: [-3, -7.5, 0, -4.5], floor: '#b98a5e', style: { floor: 'walnut', wall: 'woodPanel' } },
      { label: 'Primary bathroom', rect: [-3, -4.5, 0, -1.5], floor: '#b98a5e', style: { floor: 'marble', wall: 'marbleWall' } },
      { label: 'Second bedroom', rect: [0, -7.5, 5, -1.5], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'paint:#2b2930' } },
      { label: 'Kitchen', rect: [5, -7.5, 10, -1.5], floor: '#b98a5e', style: { floor: 'bigTile:#e8e0d0', wall: 'subway:#f4f4f2' } },
      { label: 'Living room', rect: [-10, -1.5, 1, 7.5], floor: '#b98a5e', style: { floor: 'bigTile:#9c4a2a', wall: 'paint:#e3c47e' } },
      { label: 'Dining & games', rect: [1, -1.5, 10, 3], floor: '#b98a5e', style: { floor: 'bigTile:#e8e0d0', wall: 'paint:#e3c47e' } },
      { label: 'Guest bedroom', rect: [1, 3, 6.5, 7.5], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'paint:#cfe0ee' } },
      { label: 'Guest bathroom', rect: [6.5, 3, 10, 7.5], floor: '#b98a5e', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
    ],
    walls: [
      { a: [-10, -1.5], b: [5, -1.5], gaps: [[5.4, 6.5], [10.6, 11.7]] },
      { a: [-3, -7.5], b: [-3, -1.5], gaps: [[0.9, 1.9], [3.9, 4.9]] },
      { a: [-3, -4.5], b: [0, -4.5] },
      { a: [0, -7.5], b: [0, -1.5] },
      { a: [5, -7.5], b: [5, -1.5] },
      { a: [1, 3], b: [10, 3], gaps: [[0.6, 1.7], [6.2, 7.3]] },
      { a: [6.5, 3], b: [6.5, 7.5] },
      { a: [1, 3], b: [1, 7.5] },
    ],
    furniture: [
      { uid: 'bed', item: 'canopyBed', x: -6.5, z: -6.24, rot: 0, a: '#5b2a86', b: '#1d1e22' },
      { uid: 'night', item: 'nightstandTwo', x: -8.05, z: -7.104, rot: 0, a: '#1d1e22' },
      { uid: 'night2', item: 'nightstandTwo', x: -4.95, z: -7.104, rot: 0, a: '#1d1e22' },
      { uid: 'lamp1', item: 'urnLamp', x: -8.05, z: -7.15, rot: 0 },
      { uid: 'lamp2', item: 'urnLamp', x: -4.95, z: -7.15, rot: 0 },
      { uid: 'brug', item: 'borderRug', x: -6.5, z: -4.0, rot: 0, a: '#5b2a86', b: '#d4a84b' },
      { uid: 'dresser', item: 'wideDresser', x: -9.556, z: -3.6, rot: H, a: '#1d1e22' },
      { uid: 'btv', item: 'tvConsole', x: -6.5, z: -1.87, rot: PI },
      { uid: 'ring', item: 'ringLight', x: -8.9, z: -5.6, rot: 0 },
      { uid: 'led1', item: 'ledStrip', x: -6.5, z: -7.374, rot: 0, lc: '#9b5cff' },
      { uid: 'ac1', item: 'splitAC', x: -8.9, z: -7.262, rot: 0 },
      { uid: 'art1', item: 'popArt', x: -3.9, z: -7.367, rot: 0 },
      { uid: 'bchand', item: 'crystalChandelier', x: -6.5, z: -4.0, rot: 0 },
      { uid: 'bplant', item: 'fiddleFig', x: -9.4, z: -2.1, rot: 0 },
      { uid: 'closet', item: 'wardrobeWall', x: -1.5, z: -7.065, rot: 0, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'closet2', item: 'closet', x: -0.36, z: -5.6, rot: -H },
      { uid: 'cottoman', item: 'ottoman', x: -1.7, z: -5.6, rot: 0, a: '#e88aa8' },
      { uid: 'clight', item: 'tulipChandelier', x: -1.6, z: -6.0, rot: 0 },
      { uid: 'shower', item: 'rainShower', x: -0.55, z: -3.95, rot: 0 },
      { uid: 'tub', item: 'freestandingTub', x: -1.5, z: -2.0, rot: H },
      { uid: 'toilet', item: 'luxToilet', x: -2.2, z: -3.913, rot: 0 },
      { uid: 'bsink', item: 'vanity', x: -0.43, z: -2.95, rot: -H },
      { uid: 'bathLight', item: 'glassGlobe', x: -1.5, z: -3.0, rot: 0 },
      { uid: 'bed2', item: 'upholsteredKing', x: 2.8, z: -6.204, rot: 0, a: '#ff8fb8', b: '#1d1e22' },
      { uid: 'night3', item: 'nightstandWood', x: 1.3, z: -7.104, rot: 0 },
      { uid: 'night4', item: 'nightstandWood', x: 4.3, z: -7.104, rot: 0 },
      { uid: 'lamp3', item: 'roundTableLamp', x: 1.3, z: -7.05, rot: 0 },
      { uid: 'shower2', item: 'roundShower', x: 4.35, z: -2.25, rot: 0 },
      { uid: 'bsink2', item: 'vanity', x: 4.57, z: -3.6, rot: -H },
      { uid: 'ring2', item: 'ringLight', x: 1.0, z: -3.0, rot: 0 },
      { uid: 'rug2', item: 'shagRug', x: 2.8, z: -3.9, rot: 0, a: '#ff5fa2' },
      { uid: 'led2', item: 'ledStrip', x: 2.8, z: -7.374, rot: 0, lc: '#ff5fa2' },
      { uid: 'art2', item: 'popArt', x: 0.6, z: -7.367, rot: 0 },
      { uid: 'ac2', item: 'splitAC', x: 4.45, z: -7.262, rot: 0 },
      { uid: 'lantern2', item: 'paperLantern', x: 2.8, z: -4.0, rot: 0 },
      { uid: 'chair2', item: 'shellChair', x: 1.0, z: -5.0, rot: H, a: '#ff5fa2' },
      { uid: 'fridge', item: 'chefFridge', x: 5.89, z: -6.99, rot: 0 },
      { uid: 'cabinetDrawers', item: 'cabinetDrawers', x: 6.968, z: -7.071, rot: 0 },
      { uid: 'stove', item: 'chefRange', x: 7.876, z: -6.968, rot: 0 },
      { uid: 'cabinetDoor', item: 'cabinetDoor', x: 8.784, z: -7.085, rot: 0 },
      { uid: 'cabinetTwo', item: 'cabinetTwo', x: 9.38, z: -7.071, rot: 0 },
      { uid: 'ksink', item: 'kitchenSink', x: 9.44, z: -6.2, rot: -H },
      { uid: 'cabinetMixed', item: 'cabinetMixed', x: 9.571, z: -5.462, rot: -H },
      { uid: 'counter', item: 'counter', x: 9.44, z: -4.724, rot: -H },
      { uid: 'waterDispenser', item: 'waterDispenser', x: 9.705, z: -4.094, rot: -H },
      { uid: 'upper1', item: 'upperDouble', x: 8.95, z: -7.17, rot: 0 },
      { uid: 'upper2', item: 'upperCabinet', x: 9.67, z: -5.4, rot: -H },
      { uid: 'island', item: 'marbleIsland', x: 7.1, z: -4.0, rot: 0 },
      { uid: 'stool0', item: 'barStool', x: 6.4, z: -2.85, rot: PI },
      { uid: 'stool1', item: 'barStool', x: 7.1, z: -2.85, rot: PI },
      { uid: 'stool2', item: 'barStool', x: 7.8, z: -2.85, rot: PI },
      { uid: 'islandLight', item: 'tripleCups', x: 6.5, z: -4.0, rot: 0 },
      { uid: 'islandLight2', item: 'tripleCups', x: 7.7, z: -4.0, rot: 0 },
      { uid: 'coffeeMaker', item: 'coffeeMaker', x: 9.5, z: -7.1, rot: 0 },
      { uid: 'islandVase', item: 'flowerVase', x: 7.1, z: -4.0, rot: 0 },
      { uid: 'tv', item: 'mediaWall', x: -9.638, z: 2.8, rot: H },
      { uid: 'rug', item: 'borderRug', x: -6.3, z: 2.8, rot: H, a: '#7a2a1d', b: '#d4a84b' },
      { uid: 'coffee', item: 'coffeeTable', x: -6.3, z: 2.8, rot: H, a: '#3b2a20' },
      { uid: 'candles', item: 'candles', x: -6.3, z: 2.8, rot: 0 },
      { uid: 'sofa', item: 'threeSeater', x: -4.0, z: 2.8, rot: -H, a: '#e9dcc4' },
      { uid: 'sofa2', item: 'greySofa', x: -6.3, z: 0.75, rot: 0, a: '#e9dcc4' },
      { uid: 'sofa3', item: 'retroLoveseat', x: -6.3, z: 4.85, rot: PI, a: '#e9dcc4', b: '#3b2a20' },
      { uid: 'chandelier', item: 'crystalChandelier', x: -6.3, z: 2.8, rot: 0 },
      { uid: 'flamp', item: 'floorLamp', x: -9.5, z: 0.6, rot: 0 },
      { uid: 'palm', item: 'palmPot', x: -9.5, z: -1.0, rot: 0 },
      { uid: 'palm2', item: 'palmPot', x: -9.4, z: 6.9, rot: 0 },
      { uid: 'throne', item: 'throne', x: 0.4, z: 3.0, rot: -H },
      { uid: 'club1', item: 'clubChair', x: -1.0, z: 1.9, rot: 0, a: '#e9dcc4' },
      { uid: 'club2', item: 'clubChair', x: -1.0, z: 4.1, rot: PI, a: '#e9dcc4' },
      { uid: 'rug5', item: 'borderRug', x: -0.6, z: 3.0, rot: H, a: '#a3202c', b: '#d4a84b' },
      { uid: 'piano', item: 'grandPiano', x: -2.4, z: 6.1, rot: PI },
      { uid: 'light5', item: 'tulipChandelier', x: -0.6, z: 3.0, rot: 0 },
      { uid: 'dining', item: 'ovalDining', x: 3.6, z: 0.8, rot: 0 },
      { uid: 'chairA0', item: 'diningChair', x: 2.9, z: -0.15, rot: 0 },
      { uid: 'chairB0', item: 'diningChair', x: 2.9, z: 1.75, rot: PI },
      { uid: 'chairA1', item: 'diningChair', x: 3.6, z: -0.15, rot: 0 },
      { uid: 'chairB1', item: 'diningChair', x: 3.6, z: 1.75, rot: PI },
      { uid: 'chairA2', item: 'diningChair', x: 4.3, z: -0.15, rot: 0 },
      { uid: 'chairB2', item: 'diningChair', x: 4.3, z: 1.75, rot: PI },
      { uid: 'chairC', item: 'diningChair', x: 2.05, z: 0.8, rot: H },
      { uid: 'chairD', item: 'diningChair', x: 5.15, z: 0.8, rot: -H },
      { uid: 'vase', item: 'flowerVase', x: 3.6, z: 0.8, rot: 0 },
      { uid: 'chandelier2', item: 'crystalChandelier', x: 3.6, z: 0.8, rot: 0 },
      { uid: 'pool', item: 'poolTable', x: 7.8, z: 1.0, rot: 0 },
      { uid: 'poolLight', item: 'sputnik', x: 7.8, z: 1.0, rot: 0 },
      { uid: 'sideboard', item: 'sideboard', x: 9.61, z: 0.6, rot: -H },
      { uid: 'ac3', item: 'splitAC', x: 9.762, z: 0.6, rot: -H },
      { uid: 'clock', item: 'wallClock', x: 9.868, z: 2.4, rot: -H },
      { uid: 'bed3', item: 'bedDouble', x: 5.265, z: 5.4, rot: -H, a: '#3d6b9c' },
      { uid: 'night5', item: 'nightstand', x: 6.173, z: 4.05, rot: -H },
      { uid: 'closet3', item: 'closet', x: 1.36, z: 5.4, rot: H },
      { uid: 'rug3', item: 'rugRound', x: 3.4, z: 5.4, rot: 0 },
      { uid: 'fan3', item: 'standFan', x: 1.6, z: 3.7, rot: 0 },
      { uid: 'light3', item: 'bellPendant', x: 3.6, z: 5.3, rot: 0 },
      { uid: 'tub2', item: 'bathtub', x: 9.33, z: 6.2, rot: -H },
      { uid: 'toilet2', item: 'toilet', x: 9.413, z: 4.0, rot: -H },
      { uid: 'bsink3', item: 'bathSink', x: 7.2, z: 7.046, rot: PI },
      { uid: 'shower3', item: 'shower', x: 7.2, z: 4.5, rot: 0 },
      { uid: 'gbLight', item: 'flushLight', x: 8.3, z: 5.0, rot: 0 },
      { uid: 'mat', item: 'doormat', x: -6, z: 7.05, rot: 0 },
    ],
  },
);

/** Which floor plan each home place uses. */
export const HOME_LAYOUT_FOR: Record<string, string> = { hkStudio: 'studio', wburgLoft: 'loft', sharedApt: 'harlemWalkup', shelter: 'shelter', uesApt: 'uesTwoBed', penthouse: 'penthouse' };

export function layoutForPlace(placeId: string): HomeLayout {
  return HOME_LAYOUTS.get(HOME_LAYOUT_FOR[placeId]) ?? HOME_LAYOUTS.require('studio');
}
