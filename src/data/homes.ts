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
  /** Two-floor homes: the layout id of the floor upstairs (its stairs piece takes you there and back). */
  upper?: string;
  /** An upstairs floor: no front door in its walls (you arrive by the stairs). */
  upstairs?: boolean;
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
    // THE RICH START, v9 (28 × 20; back to the v7 plan, Peter preferred
    // it). Black gloss tiles and pink: a primary suite with walk-in closet
    // and marble bathroom, a pink bedroom with a glass shower, a third
    // bedroom, a guest bathroom, a big living room, a home cinema, a lounge
    // by the door, dining, a kitchen with an island, a game room with a pool
    // table, and a study. A garden and a car.
    id: 'uesTwoBed',
    name: 'Upper East Side residence',
    version: 9,
    shaped: true,
    door: { x: -3.5, z: 10 },
    width: 28,
    depth: 20,
    wallColor: '#eef1f4',
    conditions: { doorman: true },
    zoomable: true,
    windows: { xs: [0], w: 1.7, h: 1.8, y: 1.6, view: 'sky' },
    yardCar: { model: 'aurora', paint: '#f4f4f2' },
    rooms: [
      { label: 'Primary suite', rect: [-14, -10, -5, -3], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'paint:#26262b' } },
      { label: 'Walk-in closet', rect: [-5, -10, -1, -6.5], floor: '#b98a5e', style: { floor: 'walnut', wall: 'woodPanel' } },
      { label: 'Primary bathroom', rect: [-5, -6.5, -1, -3], floor: '#b98a5e', style: { floor: 'marble', wall: 'marbleWall' } },
      { label: 'Second bedroom', rect: [-1, -10, 5, -3], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'paint:#2b2930' } },
      { label: 'Third bedroom', rect: [5, -10, 9.5, -3], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'paint:#cfe0ee' } },
      { label: 'Guest bathroom', rect: [9.5, -10, 14, -3], floor: '#b98a5e', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
      { label: 'Living room', rect: [-14, -3, -1, 6], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'paint:#26262b' } },
      { label: 'Home cinema', rect: [-14, 6, -6, 10], floor: '#b98a5e', style: { floor: 'carpet:#2b1d2a', wall: 'acoustic:#2b2d42' } },
      { label: 'Lounge', rect: [-6, 6, -1, 10], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'paint:#26262b' } },
      { label: 'Dining room', rect: [-1, -3, 6.5, 3], floor: '#b98a5e', style: { floor: 'bigTile:#e8e0d0', wall: 'paint:#e3c47e' } },
      { label: 'Kitchen', rect: [6.5, -3, 14, 3], floor: '#b98a5e', style: { floor: 'bigTile:#e8e0d0', wall: 'subway:#f4f4f2' } },
      { label: 'Game room', rect: [-1, 3, 7, 10], floor: '#b98a5e', style: { floor: 'walnut', wall: 'paint:#e3c47e' } },
      { label: 'Study', rect: [7, 3, 14, 10], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'woodPanel' } },
    ],
    walls: [
      { a: [-14, -3], b: [14, -3], gaps: [[7.5, 8.6], [13.5, 14.6], [19.5, 20.6], [24.5, 25.6]] },
      { a: [-5, -10], b: [-5, -3], gaps: [[1, 2], [5, 6]] },
      { a: [-5, -6.5], b: [-1, -6.5] },
      { a: [-1, -10], b: [-1, -3] },
      { a: [5, -10], b: [5, -3] },
      { a: [9.5, -10], b: [9.5, -3] },
      { a: [-14, 6], b: [-6, 6], gaps: [[5, 6.2]] },
      { a: [-6, 6], b: [-6, 10], gaps: [[0.6, 2.0]] },
      { a: [7, 3], b: [7, 10], gaps: [[1, 2.1]] },
      { a: [7, 3], b: [14, 3] },
    ],
    furniture: [
      { uid: 'bed', item: 'upholsteredKing', x: -9.5, z: -8.704, rot: 0, a: '#5b2a86', b: '#1d1e22' },
      { uid: 'night', item: 'nightstandTwo', x: -11.05, z: -9.604, rot: 0, a: '#1d1e22' },
      { uid: 'night2', item: 'nightstandTwo', x: -7.95, z: -9.604, rot: 0, a: '#1d1e22' },
      { uid: 'lamp1', item: 'urnLamp', x: -11.05, z: -9.65, rot: 0 },
      { uid: 'lamp2', item: 'urnLamp', x: -7.95, z: -9.65, rot: 0 },
      { uid: 'brug', item: 'borderRug', x: -9.5, z: -6.3, rot: 0, a: '#5b2a86', b: '#d4a84b' },
      { uid: 'bench', item: 'cushionBench', x: -9.5, z: -7.25, rot: 0, a: '#c9a24a' },
      { uid: 'dresser', item: 'wideDresser', x: -13.556, z: -5.0, rot: H, a: '#1d1e22' },
      { uid: 'btv', item: 'tvConsole', x: -9.5, z: -3.37, rot: PI },
      { uid: 'ring', item: 'ringLight', x: -12.6, z: -8.6, rot: 0 },
      { uid: 'led1', item: 'ledStrip', x: -9.5, z: -9.874, rot: 0, lc: '#9b5cff' },
      { uid: 'ac1', item: 'splitAC', x: -12.6, z: -9.762, rot: 0 },
      { uid: 'art1', item: 'popArt', x: -6.3, z: -9.867, rot: 0 },
      { uid: 'chair1', item: 'shellChair', x: -6.0, z: -6.9, rot: -H, a: '#c9a24a' },
      { uid: 'bchand', item: 'crystalChandelier', x: -9.5, z: -6.5, rot: 0 },
      { uid: 'bplant', item: 'fiddleFig', x: -13.4, z: -3.6, rot: 0 },
      { uid: 'closet', item: 'wardrobeWall', x: -2.8, z: -9.565, rot: 0, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'closet2', item: 'wardrobeWall', x: -1.435, z: -8.0, rot: -H, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'clight', item: 'tulipChandelier', x: -3.0, z: -8.2, rot: 0 },
      { uid: 'shower', item: 'rainShower', x: -1.55, z: -4.05, rot: 0 },
      { uid: 'tub', item: 'freestandingTub', x: -2.6, z: -6.0, rot: H },
      { uid: 'bsink', item: 'doubleVanity', x: -3.3, z: -3.41, rot: PI },
      { uid: 'toilet', item: 'luxToilet', x: -1.587, z: -5.3, rot: -H },
      { uid: 'bathLight', item: 'glassGlobe', x: -3.0, z: -4.8, rot: 0 },
      { uid: 'bed2', item: 'upholsteredKing', x: 2.0, z: -8.704, rot: 0, a: '#ff8fb8', b: '#1d1e22' },
      { uid: 'night3', item: 'nightstandWood', x: 0.45, z: -9.604, rot: 0 },
      { uid: 'night4', item: 'nightstandWood', x: 3.55, z: -9.604, rot: 0 },
      { uid: 'lamp3', item: 'roundTableLamp', x: 0.45, z: -9.55, rot: 0 },
      { uid: 'shower2', item: 'roundShower', x: 4.35, z: -3.75, rot: 0 },
      { uid: 'bsink2', item: 'vanity', x: 4.57, z: -5.3, rot: -H },
      { uid: 'ring2', item: 'ringLight', x: -0.4, z: -5.0, rot: 0 },
      { uid: 'rug2', item: 'shagRug', x: 2.0, z: -6.0, rot: 0, a: '#ff5fa2' },
      { uid: 'led2', item: 'ledStrip', x: 2.0, z: -9.874, rot: 0, lc: '#ff5fa2' },
      { uid: 'ac2', item: 'splitAC', x: 4.3, z: -9.762, rot: 0 },
      { uid: 'lantern2', item: 'paperLantern', x: 2.0, z: -6.2, rot: 0 },
      { uid: 'chair2', item: 'shellChair', x: 0.0, z: -7.2, rot: H, a: '#ff5fa2' },
      { uid: 'bed3', item: 'bedDouble', x: 7.25, z: -8.765, rot: 0, a: '#3d6b9c' },
      { uid: 'night5', item: 'nightstand', x: 8.75, z: -9.673, rot: 0 },
      { uid: 'closet3', item: 'closet', x: 5.36, z: -6.0, rot: H },
      { uid: 'rug3', item: 'rugRound', x: 7.3, z: -6.0, rot: 0 },
      { uid: 'fan3', item: 'standFan', x: 9.0, z: -4.0, rot: 0 },
      { uid: 'art3', item: 'popArt', x: 5.7, z: -9.867, rot: 0 },
      { uid: 'light3', item: 'bellPendant', x: 7.3, z: -6.2, rot: 0 },
      { uid: 'tub2', item: 'bathtub', x: 13.33, z: -8.6, rot: -H },
      { uid: 'toilet2', item: 'toilet', x: 13.413, z: -6.4, rot: -H },
      { uid: 'bsink3', item: 'doubleVanity', x: 9.91, z: -7.5, rot: H },
      { uid: 'shower3', item: 'rainShower', x: 13.45, z: -3.55, rot: 0 },
      { uid: 'bathPalm', item: 'palmPot', x: 10.0, z: -9.5, rot: 0 },
      { uid: 'gbLight', item: 'flushLight', x: 11.8, z: -6.5, rot: 0 },
      { uid: 'tv', item: 'mediaWall', x: -13.638, z: 1.5, rot: H },
      { uid: 'rug', item: 'borderRug', x: -10.4, z: 1.5, rot: H, a: '#f2f2f2', b: '#1d1e22' },
      { uid: 'coffee', item: 'coffeeTable', x: -10.4, z: 1.5, rot: H, a: '#3b2a20' },
      { uid: 'candles', item: 'candles', x: -10.4, z: 1.5, rot: 0 },
      { uid: 'sofa', item: 'threeSeater', x: -8.1, z: 1.5, rot: -H, a: '#e88aa8' },
      { uid: 'sofa2', item: 'greySofa', x: -10.4, z: -0.55, rot: 0, a: '#e88aa8' },
      { uid: 'sofa3', item: 'retroLoveseat', x: -10.4, z: 3.55, rot: PI, a: '#e88aa8', b: '#1d1e22' },
      { uid: 'chandelier', item: 'crystalChandelier', x: -10.4, z: 1.5, rot: 0 },
      { uid: 'flamp', item: 'floorLamp', x: -13.5, z: -0.6, rot: 0 },
      { uid: 'flamp2', item: 'floorLamp', x: -13.5, z: 3.6, rot: 0 },
      { uid: 'palm', item: 'palmPot', x: -13.4, z: 5.4, rot: 0 },
      { uid: 'rug5', item: 'borderRug', x: -4.0, z: 1.5, rot: H, a: '#a3202c', b: '#d4a84b' },
      { uid: 'throne', item: 'shellChair', x: -2.2, z: 1.5, rot: -H, a: '#ff5fa2' },
      { uid: 'club1', item: 'clubChair', x: -4.4, z: 0.3, rot: 0, a: '#e88aa8' },
      { uid: 'club2', item: 'clubChair', x: -4.4, z: 2.7, rot: PI, a: '#e88aa8' },
      { uid: 'coffee2', item: 'squareCoffee', x: -4.0, z: 1.5, rot: 0, a: '#3b2a20' },
      { uid: 'light5', item: 'tulipChandelier', x: -4.0, z: 1.5, rot: 0 },
      { uid: 'olive', item: 'oliveTree', x: -1.6, z: 5.2, rot: 0 },
      { uid: 'tv2', item: 'mediaWall', x: -11.1, z: 9.45, rot: PI },
      { uid: 'rec1', item: 'recliner', x: -12.4, z: 7.0, rot: PI },
      { uid: 'rec2', item: 'recliner', x: -11.1, z: 7.0, rot: PI },
      { uid: 'rec3', item: 'recliner', x: -9.8, z: 7.0, rot: PI },
      { uid: 'spk1', item: 'speaker', x: -13.5, z: 9.5, rot: 0 },
      { uid: 'spk2', item: 'speaker', x: -6.6, z: 9.5, rot: 0 },
      { uid: 'cinemaLight', item: 'spotLight', x: -11.1, z: 8.0, rot: 0 },
      { uid: 'lounge2', item: 'shellChair', x: -5.0, z: 7.6, rot: H, a: '#ff5fa2' },
      { uid: 'lounge3', item: 'shellChair', x: -2.0, z: 7.6, rot: -H, a: '#ff5fa2' },
      { uid: 'lcoffee', item: 'squareCoffee', x: -3.5, z: 7.6, rot: 0 },
      { uid: 'pampas', item: 'pampas', x: -1.5, z: 6.5, rot: 0 },
      { uid: 'mat', item: 'doormat', x: -3.5, z: 9.55, rot: 0 },
      { uid: 'dining', item: 'ovalDining', x: 2.75, z: 0.0, rot: 0 },
      { uid: 'chairA0', item: 'diningChair', x: 2.05, z: -0.95, rot: 0 },
      { uid: 'chairB0', item: 'diningChair', x: 2.05, z: 0.95, rot: PI },
      { uid: 'chairA1', item: 'diningChair', x: 2.75, z: -0.95, rot: 0 },
      { uid: 'chairB1', item: 'diningChair', x: 2.75, z: 0.95, rot: PI },
      { uid: 'chairA2', item: 'diningChair', x: 3.45, z: -0.95, rot: 0 },
      { uid: 'chairB2', item: 'diningChair', x: 3.45, z: 0.95, rot: PI },
      { uid: 'chairC', item: 'diningChair', x: 1.2, z: 0.0, rot: H },
      { uid: 'chairD', item: 'diningChair', x: 4.3, z: 0.0, rot: -H },
      { uid: 'vase', item: 'flowerVase', x: 2.75, z: 0.0, rot: 0 },
      { uid: 'chandelier2', item: 'crystalChandelier', x: 2.75, z: 0.0, rot: 0 },
      { uid: 'fridge', item: 'chefFridge', x: 13.49, z: -2.11, rot: -H },
      { uid: 'ksink', item: 'kitchenSink', x: 13.44, z: -0.89, rot: -H },
      { uid: 'cabinetDrawers', item: 'cabinetDrawers', x: 13.571, z: -0.152, rot: -H },
      { uid: 'stove', item: 'chefRange', x: 13.468, z: 0.756, rot: -H },
      { uid: 'cabinetDoor', item: 'cabinetDoor', x: 13.585, z: 1.664, rot: -H },
      { uid: 'upper1', item: 'upperDouble', x: 13.67, z: 0.6, rot: -H },
      { uid: 'upper2', item: 'upperCabinet', x: 13.67, z: -1.0, rot: -H },
      { uid: 'island', item: 'marbleIsland', x: 10.2, z: 0.0, rot: H },
      { uid: 'stool0', item: 'barStool', x: 8.95, z: -0.7, rot: H },
      { uid: 'stool1', item: 'barStool', x: 8.95, z: 0.0, rot: H },
      { uid: 'stool2', item: 'barStool', x: 8.95, z: 0.7, rot: H },
      { uid: 'islandLight', item: 'tripleCups', x: 10.2, z: -0.6, rot: 0 },
      { uid: 'islandLight2', item: 'tripleCups', x: 10.2, z: 0.6, rot: 0 },
      { uid: 'islandVase', item: 'flowerVase', x: 10.2, z: 0.0, rot: 0 },
      { uid: 'water', item: 'waterDispenser', x: 7.0, z: -2.6, rot: 0 },
      { uid: 'pool', item: 'poolTable', x: 2.0, z: 6.4, rot: 0 },
      { uid: 'poolLight', item: 'sputnik', x: 2.0, z: 6.4, rot: 0 },
      { uid: 'poolRug', item: 'hideRug', x: 2.0, z: 6.4, rot: 0 },
      { uid: 'bean1', item: 'beanbag', x: 5.4, z: 4.0, rot: 0 },
      { uid: 'bean2', item: 'beanbag', x: 6.1, z: 5.0, rot: 0 },
      { uid: 'lounge', item: 'loungeSectional', x: 3.0, z: 9.1, rot: PI },
      { uid: 'record', item: 'recordPlayer', x: -0.3, z: 9.5, rot: 0 },
      { uid: 'spk3', item: 'speaker', x: 6.5, z: 9.5, rot: 0 },
      { uid: 'desk', item: 'deskScreen', x: 11.0, z: 7.0, rot: PI },
      { uid: 'books1', item: 'bookcaseWide', x: 13.64, z: 5.5, rot: -H },
      { uid: 'books2', item: 'bookcaseWide', x: 13.64, z: 7.8, rot: -H },
      { uid: 'art4', item: 'artwork', x: 13.71, z: 6.6, rot: -H },
      { uid: 'club3', item: 'clubChair', x: 8.3, z: 8.8, rot: H, a: '#6e4a33' },
      { uid: 'srug', item: 'persianRug', x: 11.0, z: 6.4, rot: 0 },
      { uid: 'slamp', item: 'drumFloorLamp', x: 7.6, z: 4.0, rot: 0 },
      { uid: 'studyLight', item: 'globePendantGrey', x: 11.0, z: 6.6, rot: 0 },
      { uid: 'clock', item: 'wallClock', x: 13.868, z: 4.0, rot: -H },
    ],
  },
  {
    // THE BILLIONAIRE HOME, ground floor, v8 (36 × 26; Lagos Life mansion
    // feel, no pool). A grand staircase in the living room goes up to the
    // owner's floor (penthouseUp). Down here: a guest suite, three more
    // bedrooms, a huge living room with a throne corner, a home cinema, an
    // entry lounge with a grand piano, dining, a chef's kitchen, a game room,
    // a home gym, a guest bathroom, a study and a bar.
    id: 'penthouse',
    name: "Billionaires' Row penthouse",
    version: 8,
    shaped: true,
    upper: 'penthouseUp',
    door: { x: -5.5, z: 13 },
    width: 36,
    depth: 26,
    wallColor: '#f4efe6',
    conditions: { housekeeper: true, doorman: true },
    zoomable: true,
    windows: { xs: [0], w: 2.2, h: 2.0, y: 1.5, view: 'park' },
    yardCar: { model: 'summit', paint: '#1d1e22' },
    rooms: [
      { label: 'Guest suite', rect: [-18, -13, -7, -5], floor: '#b98a5e', style: { floor: 'bigTile:#7a3b22', wall: 'paint:#e3c47e' } },
      { label: 'Guest closet', rect: [-7, -13, -2, -9], floor: '#b98a5e', style: { floor: 'walnut', wall: 'woodPanel' } },
      { label: 'Guest suite bathroom', rect: [-7, -9, -2, -5], floor: '#b98a5e', style: { floor: 'marbleBlack', wall: 'marbleWall' } },
      { label: 'Second bedroom', rect: [-2, -13, 5, -5], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'paint:#2b2930' } },
      { label: 'Third bedroom', rect: [5, -13, 11, -5], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'paint:#cfe0ee' } },
      { label: 'Fourth bedroom', rect: [11, -13, 18, -5], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#d7e3c3' } },
      { label: 'Living room', rect: [-18, -5, -2, 5], floor: '#b98a5e', style: { floor: 'bigTile:#9c4a2a', wall: 'paint:#e3c47e' } },
      { label: 'Home cinema', rect: [-18, 5, -9, 13], floor: '#b98a5e', style: { floor: 'carpet:#2b1d2a', wall: 'acoustic:#2b2d42' } },
      { label: 'Entry lounge', rect: [-9, 5, -2, 13], floor: '#b98a5e', style: { floor: 'bigTile:#9c4a2a', wall: 'paint:#e3c47e' } },
      { label: 'Dining room', rect: [-2, -5, 7, 2], floor: '#b98a5e', style: { floor: 'bigTile:#e8e0d0', wall: 'paint:#e3c47e' } },
      { label: 'Kitchen', rect: [7, -5, 18, 2], floor: '#b98a5e', style: { floor: 'bigTile:#e8e0d0', wall: 'subway:#f4f4f2' } },
      { label: 'Game room', rect: [-2, 2, 8, 8.5], floor: '#b98a5e', style: { floor: 'walnut', wall: 'paint:#e3c47e' } },
      { label: 'Home gym', rect: [-2, 8.5, 4, 13], floor: '#b98a5e', style: { floor: 'rubber', wall: 'concreteWall' } },
      { label: 'Guest bathroom', rect: [4, 8.5, 8, 13], floor: '#b98a5e', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
      { label: 'Study', rect: [8, 2, 18, 7.5], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'woodPanel' } },
      { label: 'Bar', rect: [8, 7.5, 18, 13], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'paint:#2b2930' } },
    ],
    walls: [
      { a: [-18, -5], b: [18, -5], gaps: [[8.5, 9.6], [16.5, 17.6], [23.5, 24.6], [29.5, 30.6]] },
      { a: [-7, -13], b: [-7, -5], gaps: [[1, 2], [6, 7]] },
      { a: [-7, -9], b: [-2, -9] },
      { a: [-2, -13], b: [-2, -5] },
      { a: [5, -13], b: [5, -5] },
      { a: [11, -13], b: [11, -5] },
      { a: [-18, 5], b: [-9, 5], gaps: [[6, 7.2]] },
      { a: [-9, 5], b: [-9, 13], gaps: [[1, 2.4]] },
      { a: [-2, 8.5], b: [8, 8.5], gaps: [[0.8, 1.9], [7, 8.1]] },
      { a: [4, 8.5], b: [4, 13] },
      { a: [8, 2], b: [18, 2] },
      { a: [8, 2], b: [8, 13], gaps: [[1, 2.1], [5.6, 6.5]] },
      { a: [8, 7.5], b: [18, 7.5] },
    ],
    furniture: [
      { uid: 'bed', item: 'canopyBed', x: -13.5, z: -11.74, rot: 0, a: '#5b2a86', b: '#1d1e22' },
      { uid: 'night', item: 'nightstandTwo', x: -15.05, z: -12.604, rot: 0, a: '#1d1e22' },
      { uid: 'night2', item: 'nightstandTwo', x: -11.95, z: -12.604, rot: 0, a: '#1d1e22' },
      { uid: 'lamp1', item: 'urnLamp', x: -15.05, z: -12.65, rot: 0 },
      { uid: 'lamp2', item: 'urnLamp', x: -11.95, z: -12.65, rot: 0 },
      { uid: 'brug', item: 'borderRug', x: -13.5, z: -9.2, rot: 0, a: '#5b2a86', b: '#d4a84b' },
      { uid: 'bench', item: 'cushionBench', x: -13.5, z: -10.25, rot: 0, a: '#c9a24a' },
      { uid: 'btv', item: 'tvConsole', x: -13.5, z: -5.37, rot: PI },
      { uid: 'dresser', item: 'wideDresser', x: -17.556, z: -8.0, rot: H, a: '#1d1e22' },
      { uid: 'ring', item: 'ringLight', x: -16.8, z: -11.4, rot: 0 },
      { uid: 'led1', item: 'ledStrip', x: -13.5, z: -12.874, rot: 0, lc: '#9b5cff' },
      { uid: 'ac1', item: 'splitAC', x: -16.6, z: -12.762, rot: 0 },
      { uid: 'art1', item: 'popArt', x: -10.2, z: -12.867, rot: 0 },
      { uid: 'bchand', item: 'crystalChandelier', x: -13.5, z: -9.5, rot: 0 },
      { uid: 'chair1', item: 'shellChair', x: -16.6, z: -9.4, rot: H, a: '#c9a24a' },
      { uid: 'bplant', item: 'fiddleFig', x: -17.4, z: -5.6, rot: 0 },
      { uid: 'bpalm', item: 'palmPot', x: -7.6, z: -5.6, rot: 0 },
      { uid: 'closet', item: 'wardrobeWall', x: -4.5, z: -12.565, rot: 0, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'closet2', item: 'wardrobeWall', x: -2.435, z: -10.7, rot: -H, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'cchest', item: 'drawerChest', x: -4.6, z: -9.398, rot: PI, a: '#f4efe6' },
      { uid: 'clight', item: 'tulipChandelier', x: -4.5, z: -11.0, rot: 0 },
      { uid: 'shower', item: 'rainShower', x: -2.55, z: -8.45, rot: 0 },
      { uid: 'tub', item: 'soakingTub', x: -4.5, z: -8.4, rot: 0 },
      { uid: 'bsink', item: 'doubleVanity', x: -4.5, z: -5.41, rot: PI },
      { uid: 'toilet', item: 'luxToilet', x: -6.3, z: -8.413, rot: 0 },
      { uid: 'bathLight', item: 'glassGlobe', x: -4.5, z: -7.0, rot: 0 },
      { uid: 'bed2', item: 'upholsteredKing', x: 1.5, z: -11.704, rot: 0, a: '#ff8fb8', b: '#1d1e22' },
      { uid: 'night3', item: 'nightstandWood', x: -0.05, z: -12.604, rot: 0 },
      { uid: 'night4', item: 'nightstandWood', x: 3.05, z: -12.604, rot: 0 },
      { uid: 'lamp3', item: 'roundTableLamp', x: -0.05, z: -12.55, rot: 0 },
      { uid: 'shower2', item: 'roundShower', x: 4.35, z: -5.75, rot: 0 },
      { uid: 'bsink2', item: 'vanity', x: 4.57, z: -7.3, rot: -H },
      { uid: 'ring2', item: 'ringLight', x: -1.4, z: -8.0, rot: 0 },
      { uid: 'rug2', item: 'shagRug', x: 1.5, z: -8.8, rot: 0, a: '#ff5fa2' },
      { uid: 'led2', item: 'ledStrip', x: 1.5, z: -12.874, rot: 0, lc: '#ff5fa2' },
      { uid: 'ac2', item: 'splitAC', x: 4.2, z: -12.762, rot: 0 },
      { uid: 'lantern2', item: 'paperLantern', x: 1.5, z: -9.0, rot: 0 },
      { uid: 'chair2', item: 'shellChair', x: -1.0, z: -10.6, rot: H, a: '#ff5fa2' },
      { uid: 'bed3', item: 'bedDouble', x: 8.0, z: -11.765, rot: 0, a: '#3d6b9c' },
      { uid: 'night5', item: 'nightstand', x: 6.65, z: -12.673, rot: 0 },
      { uid: 'night6', item: 'nightstand', x: 9.35, z: -12.673, rot: 0 },
      { uid: 'closet3', item: 'closet', x: 5.36, z: -8.5, rot: H },
      { uid: 'desk3', item: 'desk', x: 10.498, z: -8.5, rot: -H },
      { uid: 'rug3', item: 'rugRound', x: 8.0, z: -8.8, rot: 0 },
      { uid: 'fan3', item: 'standFan', x: 10.4, z: -5.6, rot: 0 },
      { uid: 'art3', item: 'popArt', x: 10.2, z: -12.867, rot: 0 },
      { uid: 'light3', item: 'bellPendant', x: 8.0, z: -9.0, rot: 0 },
      { uid: 'bed4', item: 'bedDouble', x: 14.5, z: -11.765, rot: 0, a: '#2f6b4f' },
      { uid: 'night7', item: 'nightstandOpen', x: 12.95, z: -12.604, rot: 0 },
      { uid: 'night8', item: 'nightstandOpen', x: 16.05, z: -12.604, rot: 0 },
      { uid: 'closet4', item: 'closet', x: 17.64, z: -8.5, rot: -H },
      { uid: 'rug4', item: 'squareRug', x: 14.5, z: -8.8, rot: 0, a: '#e9b44c' },
      { uid: 'ac4', item: 'splitAC', x: 17.762, z: -10.5, rot: -H },
      { uid: 'art4', item: 'popArt', x: 17.867, z: -6.3, rot: -H },
      { uid: 'arm4', item: 'armchair', x: 12.0, z: -6.0, rot: 0 },
      { uid: 'light4', item: 'cubeLantern', x: 14.5, z: -9.0, rot: 0 },
      { uid: 'tv', item: 'mediaWall', x: -17.638, z: 0.0, rot: H },
      { uid: 'rug', item: 'borderRug', x: -14.4, z: 0.0, rot: H, a: '#7a2a1d', b: '#d4a84b' },
      { uid: 'coffee', item: 'coffeeTable', x: -14.4, z: 0.0, rot: H, a: '#3b2a20' },
      { uid: 'candles', item: 'candles', x: -14.4, z: 0.0, rot: 0 },
      { uid: 'sofa', item: 'threeSeater', x: -12.1, z: 0.0, rot: -H, a: '#e9dcc4' },
      { uid: 'sofa2', item: 'greySofa', x: -14.4, z: -2.05, rot: 0, a: '#e9dcc4' },
      { uid: 'sofa3', item: 'retroLoveseat', x: -14.4, z: 2.05, rot: PI, a: '#e9dcc4', b: '#3b2a20' },
      { uid: 'chandelier', item: 'crystalChandelier', x: -14.4, z: 0.0, rot: 0 },
      { uid: 'flamp', item: 'floorLamp', x: -17.5, z: -2.6, rot: 0 },
      { uid: 'flamp2', item: 'floorLamp', x: -17.5, z: 2.6, rot: 0 },
      { uid: 'palm', item: 'palmPot', x: -17.4, z: 4.4, rot: 0 },
      { uid: 'palm2', item: 'palmPot', x: -17.4, z: -4.4, rot: 0 },
      { uid: 'rug5', item: 'borderRug', x: -6.5, z: 2.2, rot: H, a: '#a3202c', b: '#d4a84b' },
      { uid: 'throne', item: 'throne', x: -4.5, z: 2.2, rot: -H },
      { uid: 'club1', item: 'clubChair', x: -6.9, z: 1.0, rot: 0, a: '#e9dcc4' },
      { uid: 'club2', item: 'clubChair', x: -6.9, z: 3.4, rot: PI, a: '#e9dcc4' },
      { uid: 'coffee2', item: 'squareCoffee', x: -6.5, z: 2.2, rot: 0, a: '#3b2a20' },
      { uid: 'light5', item: 'tulipChandelier', x: -6.5, z: 2.2, rot: 0 },
      { uid: 'stairs', item: 'stairsUp', x: -4.2, z: -2.99, rot: 0, a: '#e9dcc4', b: '#1d1e22' },
      { uid: 'olive', item: 'oliveTree', x: -2.6, z: 4.4, rot: 0 },
      { uid: 'olive2', item: 'oliveTree', x: -2.6, z: -4.4, rot: 0 },
      { uid: 'tv2', item: 'mediaWall', x: -13.5, z: 12.45, rot: PI },
      { uid: 'rec0', item: 'recliner', x: -15.4, z: 9.6, rot: PI },
      { uid: 'rec1', item: 'recliner', x: -14.1, z: 9.6, rot: PI },
      { uid: 'rec2', item: 'recliner', x: -12.8, z: 9.6, rot: PI },
      { uid: 'rec3', item: 'recliner', x: -11.5, z: 9.6, rot: PI },
      { uid: 'cinemaSofa', item: 'loungeSectional', x: -13.5, z: 7.0, rot: PI, a: '#5e1f2b' },
      { uid: 'spk1', item: 'speaker', x: -17.5, z: 12.5, rot: 0 },
      { uid: 'spk2', item: 'speaker', x: -9.5, z: 12.5, rot: 0 },
      { uid: 'cinemaLight', item: 'spotLight', x: -13.5, z: 10.5, rot: 0 },
      { uid: 'piano', item: 'grandPiano', x: -4.0, z: 7.2, rot: PI },
      { uid: 'lchair', item: 'shellChair', x: -8.2, z: 9.5, rot: H, a: '#c9a24a' },
      { uid: 'pampas', item: 'pampas', x: -2.6, z: 12.4, rot: 0 },
      { uid: 'mat', item: 'doormat', x: -5.5, z: 12.55, rot: 0 },
      { uid: 'entryLight', item: 'crystalChandelier', x: -5.5, z: 9.0, rot: 0 },
      { uid: 'dining', item: 'ovalDining', x: 2.5, z: -1.4, rot: 0 },
      { uid: 'chairA0', item: 'diningChair', x: 1.8, z: -2.35, rot: 0 },
      { uid: 'chairB0', item: 'diningChair', x: 1.8, z: -0.45, rot: PI },
      { uid: 'chairA1', item: 'diningChair', x: 2.5, z: -2.35, rot: 0 },
      { uid: 'chairB1', item: 'diningChair', x: 2.5, z: -0.45, rot: PI },
      { uid: 'chairA2', item: 'diningChair', x: 3.2, z: -2.35, rot: 0 },
      { uid: 'chairB2', item: 'diningChair', x: 3.2, z: -0.45, rot: PI },
      { uid: 'chairC', item: 'diningChair', x: 0.95, z: -1.4, rot: H },
      { uid: 'chairD', item: 'diningChair', x: 4.05, z: -1.4, rot: -H },
      { uid: 'vase', item: 'flowerVase', x: 2.5, z: -1.4, rot: 0 },
      { uid: 'chandelier2', item: 'crystalChandelier', x: 2.5, z: -1.4, rot: 0 },
      { uid: 'dplant', item: 'monsteraLow', x: -1.4, z: 1.4, rot: 0 },
      { uid: 'fridge', item: 'chefFridge', x: 17.49, z: -4.11, rot: -H },
      { uid: 'ksink', item: 'kitchenSink', x: 17.44, z: -2.89, rot: -H },
      { uid: 'cabinetDrawers', item: 'cabinetDrawers', x: 17.571, z: -2.152, rot: -H },
      { uid: 'stove', item: 'chefRange', x: 17.468, z: -1.244, rot: -H },
      { uid: 'cabinetDoor', item: 'cabinetDoor', x: 17.585, z: -0.336, rot: -H },
      { uid: 'cabinetTwo', item: 'cabinetTwo', x: 17.571, z: 0.26, rot: -H },
      { uid: 'upper1', item: 'upperDouble', x: 17.67, z: -1.5, rot: -H },
      { uid: 'upper2', item: 'upperCabinet', x: 17.67, z: -3.3, rot: -H },
      { uid: 'island', item: 'marbleIsland', x: 13.0, z: -1.5, rot: 0 },
      { uid: 'stool0', item: 'barStool', x: 12.3, z: -0.3, rot: PI },
      { uid: 'stool1', item: 'barStool', x: 13.0, z: -0.3, rot: PI },
      { uid: 'stool2', item: 'barStool', x: 13.7, z: -0.3, rot: PI },
      { uid: 'islandLight', item: 'tripleCups', x: 12.4, z: -1.5, rot: 0 },
      { uid: 'islandLight2', item: 'tripleCups', x: 13.6, z: -1.5, rot: 0 },
      { uid: 'islandVase', item: 'flowerVase', x: 13.0, z: -1.5, rot: 0 },
      { uid: 'water', item: 'waterDispenser', x: 7.5, z: -4.6, rot: 0 },
      { uid: 'nook', item: 'pedestalTable', x: 9.4, z: -1.5, rot: 0 },
      { uid: 'nookA', item: 'slatChair', x: 8.45, z: -1.5, rot: H },
      { uid: 'nookB', item: 'slatChair', x: 10.35, z: -1.5, rot: -H },
      { uid: 'pool', item: 'poolTable', x: 1.4, z: 5.0, rot: 0 },
      { uid: 'poolLight', item: 'sputnik', x: 1.4, z: 5.0, rot: 0 },
      { uid: 'poolRug', item: 'hideRug', x: 1.4, z: 5.0, rot: 0 },
      { uid: 'bean1', item: 'beanbag', x: 5.0, z: 3.0, rot: 0 },
      { uid: 'bean2', item: 'beanbag', x: 6.2, z: 3.4, rot: 0 },
      { uid: 'record', item: 'recordPlayer', x: 6.8, z: 7.9, rot: 0 },
      { uid: 'spk3', item: 'speaker', x: 7.6, z: 2.4, rot: 0 },
      { uid: 'gsofa', item: 'velvetSectional', x: 4.8, z: 6.6, rot: PI, a: '#1f3b4d' },
      { uid: 'treadmill', item: 'treadmill', x: -1.3, z: 11.985, rot: PI },
      { uid: 'treadmill2', item: 'treadmill', x: -0.3, z: 11.985, rot: PI },
      { uid: 'bench2', item: 'benchPress', x: 1.9, z: 11.4, rot: 0 },
      { uid: 'gymLight', item: 'flushLight', x: 1.0, z: 10.8, rot: 0 },
      { uid: 'tub2', item: 'bathtub', x: 7.33, z: 11.4, rot: -H },
      { uid: 'toilet2', item: 'toilet', x: 4.587, z: 11.9, rot: H },
      { uid: 'gbLight', item: 'flushLight', x: 6.0, z: 10.5, rot: 0 },
      { uid: 'desk', item: 'executiveDesk', x: 14.0, z: 5.0, rot: PI },
      { uid: 'books1', item: 'bookcaseWide', x: 17.64, z: 3.5, rot: -H },
      { uid: 'books2', item: 'bookcaseWide', x: 17.64, z: 5.6, rot: -H },
      { uid: 'books3', item: 'bookcaseWide', x: 10.0, z: 2.36, rot: 0 },
      { uid: 'club3', item: 'clubChair', x: 10.0, z: 5.5, rot: H, a: '#6e4a33' },
      { uid: 'club4', item: 'clubChair', x: 11.4, z: 6.6, rot: PI, a: '#6e4a33' },
      { uid: 'srug', item: 'persianRug', x: 13.5, z: 4.8, rot: 0 },
      { uid: 'slamp', item: 'drumFloorLamp', x: 9.0, z: 6.9, rot: 0 },
      { uid: 'studyLight', item: 'globePendantGrey', x: 14.0, z: 4.8, rot: 0 },
      { uid: 'bottles', item: 'bottleShelf', x: 17.73, z: 10.25, rot: -H },
      { uid: 'bar', item: 'ledBarPlain', x: 15.4, z: 10.6, rot: -H },
      { uid: 'bstool0', item: 'barStool', x: 13.95, z: 9.4, rot: H },
      { uid: 'bstool1', item: 'barStool', x: 13.95, z: 10.2, rot: H },
      { uid: 'bstool2', item: 'barStool', x: 13.95, z: 11.0, rot: H },
      { uid: 'bstool3', item: 'barStool', x: 13.95, z: 11.8, rot: H },
      { uid: 'lset1', item: 'loungeSet', x: 10.4, z: 9.0, rot: 0, a: '#8c2f39' },
      { uid: 'lset2', item: 'loungeSet', x: 10.4, z: 11.6, rot: 0, a: '#8c2f39' },
      { uid: 'neon', item: 'neonHeart', x: 17.865, z: 12.4, rot: -H, lc: '#ff5fa2' },
      { uid: 'barLight', item: 'ringPendant', x: 13.0, z: 10.2, rot: 0 },
    ],
  },
  {
    // THE BILLIONAIRE HOME, UPSTAIRS (Peter, 2026-10-27: "we will just add an
    // upper floor to the billionaire home"): the owner's floor. An owner's
    // suite with a lounge, a boutique walk-in closet and a spa bathroom; a
    // glam room (vanities, ring lights, shoe walls); a library; a sky lounge
    // where the stairs come up; a sunroom; a teen room; a guest suite; a
    // music studio; a balcony; laundry and a guest bathroom.
    id: 'penthouseUp',
    name: "Billionaires' Row penthouse, upstairs",
    version: 1,
    shaped: true,
    upstairs: true,
    door: { x: 14, z: 13 },
    width: 36,
    depth: 26,
    wallColor: '#f4efe6',
    zoomable: true,
    windows: { xs: [0], w: 2.2, h: 2.0, y: 1.5, view: 'park' },
    rooms: [
      { label: 'Owner’s suite', rect: [-18, -13, -6, -5], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'velvet:#2a1a3a' } },
      { label: 'Owner’s closet', rect: [-6, -13, 1, -9], floor: '#b98a5e', style: { floor: 'walnut', wall: 'woodPanel' } },
      { label: 'Spa bathroom', rect: [-6, -9, 1, -5], floor: '#b98a5e', style: { floor: 'marble', wall: 'marbleWall' } },
      { label: 'Glam room', rect: [1, -13, 8, -5], floor: '#b98a5e', style: { floor: 'bigTile:#f2e6ea', wall: 'paint:#f2c6d6' } },
      { label: 'Library', rect: [8, -13, 14, -5], floor: '#b98a5e', style: { floor: 'walnut', wall: 'woodPanel' } },
      { label: 'Guest bathroom', rect: [14, -13, 18, -9], floor: '#b98a5e', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
      { label: 'Laundry', rect: [14, -9, 18, -5], floor: '#b98a5e', style: { floor: 'tile:#d6dde3', wall: 'subway:#f4f4f2' } },
      { label: 'Sky lounge', rect: [-18, -5, 6, 5], floor: '#b98a5e', style: { floor: 'marble', wall: 'paint:#e3c47e' } },
      { label: 'Sunroom', rect: [6, -5, 18, 5], floor: '#b98a5e', style: { floor: 'terrazzo', wall: 'paint:#f4efe6' } },
      { label: 'Teen room', rect: [-18, 5, -9, 13], floor: '#b98a5e', style: { floor: 'carpet:#3b2a4a', wall: 'paint:#2b2930' } },
      { label: 'Guest suite', rect: [-9, 5, 2, 13], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#d7e3c3' } },
      { label: 'Music studio', rect: [2, 5, 10, 13], floor: '#b98a5e', style: { floor: 'bigTile:#1e1e24', wall: 'acoustic:#2b2d42' } },
      { label: 'Balcony', rect: [10, 5, 18, 13], floor: '#b98a5e', style: { floor: 'paving', wall: 'whiteBrick' } },
    ],
    walls: [
      { a: [-18, -5], b: [18, -5], gaps: [[8.5, 9.6], [20, 21.1], [27, 28.1], [33, 34]] },
      { a: [-6, -13], b: [-6, -5], gaps: [[1, 2], [6, 7]] },
      { a: [-6, -9], b: [1, -9] },
      { a: [1, -13], b: [1, -5] },
      { a: [8, -13], b: [8, -5] },
      { a: [14, -13], b: [14, -5] },
      { a: [14, -9], b: [18, -9], gaps: [[1, 2]] },
      { a: [6, -5], b: [6, 5], gaps: [[3, 7]] },
      { a: [-18, 5], b: [18, 5], gaps: [[4, 5.2], [13, 14.2], [22, 23.2], [30, 33]] },
      { a: [-9, 5], b: [-9, 13] },
      { a: [2, 5], b: [2, 13] },
      { a: [10, 5], b: [10, 13] },
    ],
    furniture: [
      { uid: 'stairs', item: 'stairsDown', x: -4.2, z: -2.972, rot: 0, a: '#e9dcc4', b: '#1d1e22' },
      { uid: 'bed', item: 'canopyBed', x: -12.5, z: -11.74, rot: 0, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'night', item: 'nightstandTwo', x: -14.05, z: -12.604, rot: 0, a: '#1d1e22' },
      { uid: 'night2', item: 'nightstandTwo', x: -10.95, z: -12.604, rot: 0, a: '#1d1e22' },
      { uid: 'lamp1', item: 'urnLamp', x: -14.05, z: -12.65, rot: 0 },
      { uid: 'lamp2', item: 'urnLamp', x: -10.95, z: -12.65, rot: 0 },
      { uid: 'brug', item: 'borderRug', x: -12.5, z: -9.0, rot: 0, a: '#2a1a3a', b: '#d4a84b' },
      { uid: 'bench', item: 'cushionBench', x: -12.5, z: -10.25, rot: 0, a: '#d4a84b' },
      { uid: 'led1', item: 'ledStrip', x: -12.5, z: -12.874, rot: 0, lc: '#9b5cff' },
      { uid: 'ac1', item: 'splitAC', x: -16.2, z: -12.762, rot: 0 },
      { uid: 'art1', item: 'artwork', x: -8.4, z: -12.71, rot: 0 },
      { uid: 'bchand', item: 'crystalChandelier', x: -12.5, z: -9.0, rot: 0 },
      { uid: 'bsofa', item: 'velvetSectional', x: -8.2, z: -10.0, rot: -H, a: '#5b2a86' },
      { uid: 'bcoffee', item: 'squareCoffee', x: -9.9, z: -10.0, rot: 0, a: '#1d1e22' },
      { uid: 'btv', item: 'tvConsole', x: -12.5, z: -5.37, rot: PI },
      { uid: 'bplant', item: 'fiddleFig', x: -17.4, z: -5.6, rot: 0 },
      { uid: 'bpalm', item: 'palmPot', x: -17.4, z: -12.4, rot: 0 },
      { uid: 'ring', item: 'ringLight', x: -16.6, z: -8.6, rot: 0 },
      { uid: 'closet', item: 'wardrobeWall', x: -3.5, z: -12.565, rot: 0, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'closet2', item: 'wardrobeWall', x: -0.95, z: -12.565, rot: 0, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'cchest', item: 'drawerChest', x: -2.3, z: -10.4, rot: 0, a: '#f4efe6' },
      { uid: 'clight', item: 'crystalChandelier', x: -2.3, z: -10.8, rot: 0 },
      { uid: 'tub', item: 'soakingTub', x: -1.5, z: -8.4, rot: 0 },
      { uid: 'shower', item: 'roundShower', x: 0.35, z: -8.35, rot: 0 },
      { uid: 'bsink', item: 'doubleVanity', x: -2.0, z: -5.41, rot: PI },
      { uid: 'toilet', item: 'luxToilet', x: 0.413, z: -6.5, rot: -H },
      { uid: 'bathPlant', item: 'monstera', x: -5.6, z: -8.5, rot: 0 },
      { uid: 'bathLight', item: 'glassGlobe', x: -2.5, z: -7.0, rot: 0 },
      { uid: 'shoes1', item: 'whiteBookshelf', x: 2.0, z: -12.72, rot: 0 },
      { uid: 'shoes2', item: 'whiteBookshelf', x: 3.1, z: -12.72, rot: 0 },
      { uid: 'gmirror', item: 'mirrorArch', x: 5.0, z: -12.874, rot: 0 },
      { uid: 'vanity1', item: 'consoleTable', x: 7.668, z: -10.6, rot: -H },
      { uid: 'vanity2', item: 'consoleTable', x: 7.668, z: -8.4, rot: -H },
      { uid: 'vlamp1', item: 'roundTableLamp', x: 7.75, z: -10.6, rot: 0 },
      { uid: 'ring2', item: 'ringLight', x: 6.7, z: -12.3, rot: 0 },
      { uid: 'ring3', item: 'ringLight', x: 6.7, z: -6.6, rot: 0 },
      { uid: 'gchair', item: 'shellChair', x: 4.0, z: -8.8, rot: 0, a: '#ff5fa2' },
      { uid: 'grug', item: 'shagRug', x: 4.0, z: -8.8, rot: 0, a: '#ff5fa2' },
      { uid: 'glight', item: 'paperLantern', x: 4.0, z: -9.0, rot: 0 },
      { uid: 'books1', item: 'bookcaseWide', x: 9.5, z: -12.64, rot: 0 },
      { uid: 'books2', item: 'bookcaseWide', x: 11.3, z: -12.64, rot: 0 },
      { uid: 'books3', item: 'bookcaseWide', x: 13.64, z: -10.6, rot: -H },
      { uid: 'books4', item: 'bookcaseWide', x: 13.64, z: -8.6, rot: -H },
      { uid: 'lchair1', item: 'clubChair', x: 10.0, z: -9.0, rot: 0, a: '#6e4a33' },
      { uid: 'lchair2', item: 'clubChair', x: 11.8, z: -9.0, rot: 0, a: '#6e4a33' },
      { uid: 'lrug', item: 'persianRug', x: 10.9, z: -8.6, rot: 0 },
      { uid: 'llamp', item: 'drumFloorLamp', x: 8.6, z: -5.8, rot: 0 },
      { uid: 'llight', item: 'globePendantGrey', x: 10.9, z: -8.6, rot: 0 },
      { uid: 'toilet2', item: 'toilet', x: 17.3, z: -12.413, rot: 0 },
      { uid: 'bsink2', item: 'bathSink', x: 16.1, z: -12.546, rot: 0 },
      { uid: 'shower2', item: 'shower', x: 14.65, z: -12.3, rot: 0 },
      { uid: 'gbLight', item: 'flushLight', x: 16.0, z: -11.0, rot: 0 },
      { uid: 'washer', item: 'washerStack', x: 17.5, z: -7.8, rot: -H },
      { uid: 'dryer', item: 'washerStack', x: 17.5, z: -6.9, rot: -H },
      { uid: 'tv', item: 'mediaWall', x: -17.638, z: 0.0, rot: H },
      { uid: 'rug', item: 'borderRug', x: -14.4, z: 0.0, rot: H, a: '#f4efe6', b: '#d4a84b' },
      { uid: 'coffee', item: 'coffeeTable', x: -14.4, z: 0.0, rot: H, a: '#1d1e22' },
      { uid: 'candles', item: 'candles', x: -14.4, z: 0.0, rot: 0 },
      { uid: 'sofa', item: 'threeSeater', x: -12.1, z: 0.0, rot: -H, a: '#f4efe6' },
      { uid: 'sofa2', item: 'greySofa', x: -14.4, z: -2.05, rot: 0, a: '#f4efe6' },
      { uid: 'sofa3', item: 'greySofa', x: -14.4, z: 2.05, rot: PI, a: '#f4efe6' },
      { uid: 'chandelier', item: 'crystalChandelier', x: -14.4, z: 0.0, rot: 0 },
      { uid: 'lset1', item: 'loungeSet', x: 0.6, z: -3.6, rot: 0, a: '#5b2a86' },
      { uid: 'lset2', item: 'loungeSet', x: 0.6, z: 3.6, rot: 0, a: '#5b2a86' },
      { uid: 'olive', item: 'oliveTree', x: -1.2, z: -4.4, rot: 0 },
      { uid: 'palm', item: 'palmPot', x: -17.4, z: 4.4, rot: 0 },
      { uid: 'palm2', item: 'palmPot', x: -17.4, z: -4.4, rot: 0 },
      { uid: 'light2', item: 'tulipChandelier', x: 1.2, z: 0.0, rot: 0 },
      { uid: 'rug3', item: 'borderRug', x: -8.6, z: 1.8, rot: 0, a: '#5b2a86', b: '#d4a84b' },
      { uid: 'lsofa', item: 'loungeSectional', x: -8.6, z: 3.6, rot: PI, a: '#5b2a86' },
      { uid: 'lcoffee2', item: 'squareCoffee', x: -8.6, z: 1.6, rot: 0, a: '#1d1e22' },
      { uid: 'lclub1', item: 'clubChair', x: -10.4, z: 0.6, rot: H, a: '#d4a84b' },
      { uid: 'lclub2', item: 'clubChair', x: -6.8, z: 0.6, rot: -H, a: '#d4a84b' },
      { uid: 'chandelier3', item: 'crystalChandelier', x: -8.6, z: 1.8, rot: 0 },
      { uid: 'bar', item: 'ledBarPlain', x: 4.6, z: 0.0, rot: -H },
      { uid: 'bstool0', item: 'barStool', x: 3.35, z: -1.2, rot: H },
      { uid: 'bstool1', item: 'barStool', x: 3.35, z: -0.4, rot: H },
      { uid: 'bstool2', item: 'barStool', x: 3.35, z: 0.4, rot: H },
      { uid: 'bstool3', item: 'barStool', x: 3.35, z: 1.2, rot: H },
      { uid: 'lounger0', item: 'lounger', x: 9.0, z: -3.4, rot: 0, a: '#f4efe6' },
      { uid: 'lounger1', item: 'lounger', x: 10.8, z: -3.4, rot: 0, a: '#f4efe6' },
      { uid: 'lounger2', item: 'lounger', x: 12.6, z: -3.4, rot: 0, a: '#f4efe6' },
      { uid: 'lounger3', item: 'lounger', x: 14.4, z: -3.4, rot: 0, a: '#f4efe6' },
      { uid: 'sun1', item: 'oliveTree', x: 17.3, z: -4.3, rot: 0 },
      { uid: 'sun2', item: 'palmPot', x: 17.3, z: 4.3, rot: 0 },
      { uid: 'sun3', item: 'monsteraLow', x: 7.0, z: 4.3, rot: 0 },
      { uid: 'sun4', item: 'fiddleFig', x: 17.3, z: 0.0, rot: 0 },
      { uid: 'suntable', item: 'pedestalTable', x: 12.0, z: 1.6, rot: 0 },
      { uid: 'sunchairA', item: 'slatChair', x: 11.05, z: 1.6, rot: H },
      { uid: 'sunchairB', item: 'slatChair', x: 12.95, z: 1.6, rot: -H },
      { uid: 'hang0', item: 'hangingPlant', x: 9.5, z: -0.5, rot: 0 },
      { uid: 'hang1', item: 'hangingPlant', x: 12.0, z: -0.5, rot: 0 },
      { uid: 'hang2', item: 'hangingPlant', x: 14.5, z: -0.5, rot: 0 },
      { uid: 'hang3', item: 'hangingPlant', x: 9.5, z: 3.5, rot: 0 },
      { uid: 'hang4', item: 'hangingPlant', x: 14.5, z: 3.5, rot: 0 },
      { uid: 'bed3', item: 'bedDouble', x: -15.6, z: 6.235, rot: 0, a: '#5b2a86' },
      { uid: 'night3', item: 'nightstand', x: -14.25, z: 5.327, rot: 0 },
      { uid: 'desk3', item: 'deskScreen', x: -11.5, z: 12.498, rot: PI },
      { uid: 'bean1', item: 'beanbag', x: -15.8, z: 11.6, rot: 0, a: '#ff5fa2' },
      { uid: 'bean2', item: 'beanbag', x: -14.6, z: 12.2, rot: 0, a: '#3d8bff' },
      { uid: 'trug', item: 'squareRug', x: -14.0, z: 9.6, rot: 0, a: '#3d8bff' },
      { uid: 'tlight', item: 'cubeLantern', x: -13.5, z: 9.0, rot: 0 },
      { uid: 'bed4', item: 'upholsteredKing', x: -6.5, z: 11.704, rot: PI, a: '#e9dcc4', b: '#3b2a20' },
      { uid: 'night4', item: 'nightstandTwo', x: -8.05, z: 12.604, rot: PI },
      { uid: 'night5', item: 'nightstandTwo', x: -4.95, z: 12.604, rot: PI },
      { uid: 'tub2', item: 'freestandingTub', x: 0.9, z: 11.6, rot: 0 },
      { uid: 'grug2', item: 'rugRound', x: -6.5, z: 8.6, rot: 0 },
      { uid: 'glight2', item: 'bellPendant', x: -6.5, z: 9.0, rot: 0 },
      { uid: 'glass', item: 'glassPanel', x: 0.0, z: 10.6, rot: H },
      { uid: 'gtv', item: 'tvConsole', x: -6.5, z: 5.37, rot: 0 },
      { uid: 'gchair2', item: 'shellChair', x: -2.6, z: 7.0, rot: -H, a: '#e9dcc4' },
      { uid: 'gpalm', item: 'palmPot', x: -8.4, z: 5.6, rot: 0 },
      { uid: 'studioDesk', item: 'mediaConsole', x: 6.0, z: 12.61, rot: PI },
      { uid: 'spk1', item: 'speaker', x: 3.0, z: 12.6, rot: 0 },
      { uid: 'spk2', item: 'speaker', x: 9.0, z: 12.6, rot: 0 },
      { uid: 'record', item: 'recordPlayer', x: 3.3, z: 6.0, rot: 0 },
      { uid: 'ssofa', item: 'loungeSectional', x: 6.0, z: 8.2, rot: 0, a: '#1f3b4d' },
      { uid: 'slight', item: 'ringPendant', x: 6.0, z: 10.0, rot: 0 },
      { uid: 'blounger1', item: 'lounger', x: 12.0, z: 10.6, rot: 0 },
      { uid: 'blounger2', item: 'lounger', x: 13.6, z: 10.6, rot: 0 },
      { uid: 'bal1', item: 'oliveTree', x: 17.3, z: 12.3, rot: 0 },
      { uid: 'bal2', item: 'palmPot', x: 17.4, z: 6.6, rot: 0 },
      { uid: 'bal3', item: 'pampas', x: 10.6, z: 12.4, rot: 0 },
      { uid: 'baltable', item: 'pedestalTable', x: 16.0, z: 9.0, rot: 0 },
    ],
  },
);

/** Which floor plan each home place uses. */
export const HOME_LAYOUT_FOR: Record<string, string> = { hkStudio: 'studio', wburgLoft: 'loft', sharedApt: 'harlemWalkup', shelter: 'shelter', uesApt: 'uesTwoBed', penthouse: 'penthouse' };

/** A home's floor: 0 = the ground floor, 1 = upstairs (if the plan has one). */
export function floorLayout(placeId: string, floor: number): HomeLayout {
  const base = layoutForPlace(placeId);
  return floor > 0 && base.upper ? HOME_LAYOUTS.get(base.upper) ?? base : base;
}

export function layoutForPlace(placeId: string): HomeLayout {
  return HOME_LAYOUTS.get(HOME_LAYOUT_FOR[placeId]) ?? HOME_LAYOUTS.require('studio');
}
