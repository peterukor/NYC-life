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
    // THE BROKE START: a room in a shared East Harlem walk-up, square
    // (Peter, 2026-10-27: "all apartments should be square"). Your room
    // and a tiny bathroom at the back, the shared kitchen and living room
    // in front, two roommates' doors. Cheap chunky pieces.
    id: 'harlemWalkup',
    name: 'East Harlem walk-up',
    version: 2,
    shaped: true,
    door: { x: 2, z: 5 },
    width: 10,
    depth: 10,
    wallColor: '#e8dcc4',
    conditions: {
      roommates: [
        { name: 'Danny', body: 'm', skin: '#8d5524', top: '#2a9d8f', bottom: '#264653', hair: '#1b1b1b', habit: 'works nights at the bakery on 116th' },
        { name: 'Keisha', body: 'f', skin: '#5c3a21', top: '#e9c46a', bottom: '#3d5a80', hair: '#2b1a10', habit: 'nursing student, always studying' },
      ],
      sharedBathroom: true,
    },
    rooms: [
      { label: 'Your room', rect: [-5, -5, 1, -0.5], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#e8dcc4' } },
      { label: 'Bathroom', rect: [1, -5, 5, -0.5], floor: '#b98a5e', style: { floor: 'hex:#dfe7e6', wall: 'subway:#e9efe9' } },
      { label: 'Kitchen', rect: [-5, -0.5, -1, 5], floor: '#b98a5e', style: { floor: 'checker', wall: 'paint:#e3d6bb' } },
      { label: 'Living', rect: [-1, -0.5, 5, 5], floor: '#b98a5e', style: { floor: 'vinyl', wall: 'paint:#e3d6bb' } },
    ],
    walls: [
      { a: [-5, -0.5], b: [5, -0.5], gaps: [[2.8, 3.8], [7.4, 8.4]] },
      { a: [1, -5], b: [1, -0.5] },
    ],
    furniture: [
      { uid: 'bed', item: 'twinBed', x: -4.2, z: -3.865, rot: 0 },
      { uid: 'night', item: 'crateNightstand', x: -3.3, z: -4.68, rot: 0 },
      { uid: 'radiator', item: 'radiator', x: -2.4, z: -4.79, rot: 0 },
      { uid: 'ac', item: 'windowAC', x: -2.4, z: -4.631, rot: 0 },
      { uid: 'desk', item: 'foldingDesk', x: -1.0, z: -4.365, rot: 0 },
      { uid: 'boxes', item: 'movingBoxes', x: 0.3, z: -4.4, rot: 0 },
      { uid: 'rack', item: 'clothesRack', x: -4.63, z: -1.8, rot: H },
      { uid: 'posters', item: 'posters', x: -4.873, z: -3.5, rot: H },
      { uid: 'laundry', item: 'laundryPile', x: -0.2, z: -2.2, rot: 0 },
      { uid: 'tub', item: 'tubShower', x: 4.0, z: -4.51, rot: 0 },
      { uid: 'toilet', item: 'oldToilet', x: 1.6, z: -4.57, rot: 0 },
      { uid: 'bsink', item: 'pedestalSink', x: 4.665, z: -2.5, rot: -H },
      { uid: 'fridge', item: 'oldFridge', x: -4.508, z: -0.0, rot: H },
      { uid: 'ksink', item: 'sinkCounter', x: -4.554, z: 1.01, rot: H },
      { uid: 'stove', item: 'oldStove', x: -4.527, z: 2.07, rot: H },
      { uid: 'trash', item: 'trashBags', x: -4.569, z: 2.903, rot: H },
      { uid: 'table', item: 'smallTable', x: -2.4, z: 2.0, rot: H },
      { uid: 'roomB', item: 'roommateDoor', x: -4.81, z: 4.2, rot: H },
      { uid: 'tv', item: 'crateTv', x: 4.63, z: 1.6, rot: -H },
      { uid: 'couch', item: 'wornCouch', x: 1.0, z: 1.6, rot: H },
      { uid: 'rug', item: 'wornRug', x: 2.8, z: 1.6, rot: H },
      { uid: 'roomA', item: 'roommateDoor', x: 4.81, z: 3.9, rot: -H },
      { uid: 'plant', item: 'plantStool', x: 4.5, z: 0.0, rot: 0 },
      { uid: 'shoes', item: 'shoePile', x: 0.4, z: 4.5, rot: 0 },
    ],
  },
  {
    // The middle start (square, 2026-10-27): a sleeping alcove behind a
    // wide opening, a real bathroom, and an open kitchen / dining / living.
    id: 'studio',
    name: 'Studio',
    version: 2,
    shaped: true,
    door: { x: 2.5, z: 6 },
    width: 12,
    depth: 12,
    wallColor: '#f3e3cc',
    conditions: { noise: { chance: 0.1, label: 'Sirens on Ninth Avenue woke you up' } },
    rooms: [
      { label: 'Sleeping alcove', rect: [-6, -6, 1.5, -1], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#f3e3cc' } },
      { label: 'Bathroom', rect: [1.5, -6, 6, -1], floor: '#b98a5e', style: { floor: 'hex:#dfe7e6', wall: 'subway:#ffffff' } },
      { label: 'Kitchen', rect: [-6, -1, -1, 3], floor: '#b98a5e', style: { floor: 'tile:#e9e4d8', wall: 'subway:#f4f4f2' } },
      { label: 'Dining', rect: [-6, 3, -1, 6], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#f3e3cc' } },
      { label: 'Living', rect: [-1, -1, 6, 6], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#f3e3cc' } },
    ],
    walls: [
      { a: [-6, -1], b: [6, -1], gaps: [[2.2, 4.8], [8.6, 9.7]] },
      { a: [1.5, -6], b: [1.5, -1] },
    ],
    furniture: [
      { uid: 'bed', item: 'bedDouble', x: -2.5, z: -4.765, rot: 0 },
      { uid: 'night', item: 'nightstand', x: -4.0, z: -5.673, rot: 0 },
      { uid: 'night2', item: 'nightstand', x: -1.0, z: -5.673, rot: 0 },
      { uid: 'lamp1', item: 'ceramicLamp', x: -4.0, z: -5.7, rot: 0 },
      { uid: 'closet', item: 'closet', x: -5.64, z: -3.5, rot: H },
      { uid: 'desk', item: 'desk', x: 0.998, z: -4.6, rot: -H },
      { uid: 'brug', item: 'squareRug', x: -2.5, z: -2.7, rot: 0 },
      { uid: 'lantern', item: 'paperLantern', x: -2.5, z: -3.5, rot: 0 },
      { uid: 'bart', item: 'artwork', x: -2.5, z: -5.71, rot: 0 },
      { uid: 'shower', item: 'shower', x: 5.35, z: -5.3, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 3.0, z: -5.413, rot: 0 },
      { uid: 'bsink', item: 'bathSink', x: 5.546, z: -3.4, rot: -H },
      { uid: 'washer', item: 'washer', x: 2.1, z: -2.0, rot: 0 },
      { uid: 'bathLight', item: 'flushLight', x: 3.8, z: -3.5, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: -5.598, z: -0.45, rot: H },
      { uid: 'counter', item: 'counter', x: -5.44, z: 0.43, rot: H },
      { uid: 'stove', item: 'stove', x: -5.44, z: 1.31, rot: H },
      { uid: 'ksink', item: 'kitchenSink', x: -5.44, z: 2.19, rot: H },
      { uid: 'kLight', item: 'cupCluster', x: -3.6, z: 1.0, rot: 0 },
      { uid: 'dining', item: 'pedestalTable', x: -3.6, z: 4.6, rot: 0 },
      { uid: 'chairA', item: 'slatChair', x: -4.55, z: 4.6, rot: H },
      { uid: 'chairB', item: 'slatChair', x: -2.65, z: 4.6, rot: -H },
      { uid: 'diningLight', item: 'domePendant', x: -3.6, z: 4.6, rot: 0 },
      { uid: 'plant2', item: 'plant', x: -5.6, z: 5.55, rot: 0 },
      { uid: 'tv', item: 'tvConsole', x: 5.63, z: 2.4, rot: -H },
      { uid: 'sofa', item: 'modernSofa', x: 1.9, z: 2.4, rot: H },
      { uid: 'rug', item: 'ovalRug', x: 3.6, z: 2.4, rot: H },
      { uid: 'coffee', item: 'coffeeTable', x: 3.6, z: 2.4, rot: H },
      { uid: 'arm', item: 'armchair', x: 3.6, z: 0.15, rot: 0 },
      { uid: 'lamp', item: 'floorLamp', x: 5.6, z: -0.5, rot: 0 },
      { uid: 'plant', item: 'plant', x: 5.6, z: 5.55, rot: 0 },
      { uid: 'light', item: 'globePendantGrey', x: 3.6, z: 2.4, rot: 0 },
      { uid: 'mat', item: 'doormat', x: 2.5, z: 5.55, rot: 0 },
      { uid: 'coat', item: 'coatRack', x: 0.4, z: 5.55, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: -5.6, z: 2.9, rot: 0 },
    ],
  },
  {
    // A Brooklyn loft, square (2026-10-27): two bedrooms and a bathroom
    // along the back, a big open kitchen / dining / living in front with
    // exposed brick and polished concrete, and a work corner.
    id: 'loft',
    name: 'Loft',
    version: 3,
    shaped: true,
    door: { x: 2, z: 8 },
    width: 16,
    depth: 16,
    wallColor: '#e7d3c1',
    zoomable: true,
    windows: { xs: [0], w: 2.4, h: 2.1, y: 1.55, view: 'sky' },
    rooms: [
      { label: 'Bedroom', rect: [-8, -8, -1.5, -1.5], floor: '#b98a5e', style: { floor: 'oak', wall: 'whiteBrick' } },
      { label: 'Bathroom', rect: [-1.5, -8, 2.5, -1.5], floor: '#b98a5e', style: { floor: 'hex:#dfe7e6', wall: 'subway:#f4f4f2' } },
      { label: 'Second bedroom', rect: [2.5, -8, 8, -1.5], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#e8dcc4' } },
      { label: 'Kitchen', rect: [-8, -1.5, -2, 3.5], floor: '#b98a5e', style: { floor: 'concrete', wall: 'subway:#f4f4f2' } },
      { label: 'Dining', rect: [-8, 3.5, -2, 8], floor: '#b98a5e', style: { floor: 'concrete', wall: 'brick' } },
      { label: 'Living', rect: [-2, -1.5, 8, 8], floor: '#b98a5e', style: { floor: 'concrete', wall: 'brick' } },
    ],
    walls: [
      { a: [-8, -1.5], b: [8, -1.5], gaps: [[4.6, 5.7], [7.6, 8.7], [11, 12.1]] },
      { a: [-1.5, -8], b: [-1.5, -1.5] },
      { a: [2.5, -8], b: [2.5, -1.5] },
    ],
    furniture: [
      { uid: 'bed', item: 'upholsteredKing', x: -5, z: -6.704, rot: 0 },
      { uid: 'night', item: 'nightstandTwo', x: -6.55, z: -7.604, rot: 0 },
      { uid: 'night2', item: 'nightstandTwo', x: -3.45, z: -7.604, rot: 0 },
      { uid: 'lamp1', item: 'ceramicLamp', x: -6.55, z: -7.6, rot: 0 },
      { uid: 'closet', item: 'closet', x: -7.64, z: -3.6, rot: H },
      { uid: 'brug', item: 'shagRug', x: -5, z: -4.4, rot: 0 },
      { uid: 'lantern', item: 'paperLantern', x: -5, z: -4.6, rot: 0 },
      { uid: 'bart', item: 'artwork', x: -5, z: -7.71, rot: 0 },
      { uid: 'barm', item: 'armchair', x: -2.25, z: -6.9, rot: 0 },
      { uid: 'bplant', item: 'fiddleFig', x: -1.95, z: -4.3, rot: 0 },
      { uid: 'tub', item: 'freestandingTub', x: -0.45, z: -7.45, rot: H },
      { uid: 'shower', item: 'rainShower', x: 1.95, z: -7.45, rot: 0 },
      { uid: 'toilet', item: 'toiletClassic', x: 1.967, z: -5.3, rot: -H },
      { uid: 'bsink', item: 'vanity', x: -1.07, z: -4.5, rot: H },
      { uid: 'washer', item: 'washerStack', x: 2.0, z: -2.4, rot: 0 },
      { uid: 'bathLight', item: 'flushLight', x: 0.5, z: -4.5, rot: 0 },
      { uid: 'bed2', item: 'bedDouble', x: 5.6, z: -6.765, rot: 0 },
      { uid: 'night3', item: 'nightstandOpen', x: 7.25, z: -7.604, rot: 0 },
      { uid: 'desk', item: 'deskScreen', x: 7.498, z: -3.8, rot: -H },
      { uid: 'closet2', item: 'closet', x: 2.86, z: -5.3, rot: H },
      { uid: 'rug2', item: 'rugRound', x: 5.2, z: -4.4, rot: 0 },
      { uid: 'light2', item: 'bellPendant', x: 5.4, z: -4.6, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: -7.598, z: -0.95, rot: H },
      { uid: 'counter', item: 'counter', x: -7.44, z: -0.07, rot: H },
      { uid: 'stove', item: 'stove', x: -7.44, z: 0.81, rot: H },
      { uid: 'ksink', item: 'kitchenSink', x: -7.44, z: 1.69, rot: H },
      { uid: 'counter2', item: 'counterMicrowave', x: -7.44, z: 2.57, rot: H },
      { uid: 'island', item: 'island', x: -4.6, z: 1.0, rot: H },
      { uid: 'stool0', item: 'barStool', x: -3.55, z: 0.4, rot: -H },
      { uid: 'stool1', item: 'barStool', x: -3.55, z: 1.0, rot: -H },
      { uid: 'stool2', item: 'barStool', x: -3.55, z: 1.6, rot: -H },
      { uid: 'islandLight', item: 'edisonCluster', x: -4.6, z: 1.0, rot: 0 },
      { uid: 'dining', item: 'farmTable', x: -5, z: 5.8, rot: 0 },
      { uid: 'chairA0', item: 'spindleChair', x: -5.4, z: 5.05, rot: 0 },
      { uid: 'chairB0', item: 'spindleChair', x: -5.4, z: 6.55, rot: PI },
      { uid: 'chairA1', item: 'spindleChair', x: -4.6, z: 5.05, rot: 0 },
      { uid: 'chairB1', item: 'spindleChair', x: -4.6, z: 6.55, rot: PI },
      { uid: 'diningLight', item: 'geoTrio', x: -5, z: 5.8, rot: 0 },
      { uid: 'sideboard', item: 'sideboard', x: -7.61, z: 5.8, rot: H },
      { uid: 'tv', item: 'tvConsole', x: 7.63, z: 3.4, rot: -H },
      { uid: 'led', item: 'ledStrip', x: 7.874, z: 3.4, rot: -H },
      { uid: 'sofa', item: 'sectionalL', x: 3.4, z: 3.4, rot: H },
      { uid: 'rug', item: 'persianRug', x: 5.6, z: 3.4, rot: H },
      { uid: 'coffee', item: 'squareCoffee', x: 5.6, z: 3.4, rot: 0 },
      { uid: 'arc', item: 'arcLamp', x: 2.0, z: 0.9, rot: 0 },
      { uid: 'fan', item: 'ceilingFan', x: 4.8, z: 3.4, rot: 0 },
      { uid: 'desk2', item: 'cornerDesk', x: 6.9, z: 6.9, rot: 0 },
      { uid: 'plant', item: 'monstera', x: 7.55, z: -1.0, rot: 0 },
      { uid: 'tree', item: 'oliveTree', x: -1.5, z: 7.4, rot: 0 },
      { uid: 'record', item: 'recordPlayer', x: 5.6, z: -1.18, rot: 0 },
      { uid: 'mat', item: 'doormat', x: 2, z: 7.55, rot: 0 },
      { uid: 'coat', item: 'coatRack', x: 0.2, z: 7.55, rot: 0 },
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
    // The city shelter (square, 2026-10-27): a dorm of single beds, a
    // washroom and a common corner. Where you land after bankruptcy.
    id: 'shelter',
    name: 'Shelter dorm',
    version: 2,
    shaped: true,
    door: { x: 0.7, z: 5 },
    width: 10,
    depth: 10,
    wallColor: '#dfe6ee',
    rooms: [
      { label: 'Dorm', rect: [-5, -5, 1.5, 5], floor: '#b98a5e', style: { floor: 'vinyl', wall: 'paint:#dfe6ee' } },
      { label: 'Washroom', rect: [1.5, -5, 5, 0], floor: '#b98a5e', style: { floor: 'tile:#d6dde3', wall: 'subway:#e9eef2' } },
      { label: 'Common', rect: [1.5, 0, 5, 5], floor: '#b98a5e', style: { floor: 'vinyl', wall: 'paint:#dfe6ee' } },
    ],
    walls: [
      { a: [1.5, -5], b: [1.5, 0], gaps: [[3, 4]] },
      { a: [1.5, 0], b: [5, 0], gaps: [[1.3, 2.3]] },
    ],
    furniture: [
      { uid: 'bed', item: 'bedSingle', x: -4.2, z: -3.765, rot: 0 },
      { uid: 'bed2', item: 'bedSingle', x: -2.6, z: -3.765, rot: 0 },
      { uid: 'bed3', item: 'bedSingle', x: -1.0, z: -3.765, rot: 0 },
      { uid: 'bed4', item: 'bedSingle', x: -4.2, z: 3.765, rot: PI },
      { uid: 'bed5', item: 'bedSingle', x: -2.6, z: 3.765, rot: PI },
      { uid: 'closet', item: 'closet', x: -4.64, z: 0.0, rot: H },
      { uid: 'toilet', item: 'toilet', x: 4.3, z: -4.413, rot: 0 },
      { uid: 'bsink', item: 'bathSink', x: 2.4, z: -4.546, rot: 0 },
      { uid: 'shower', item: 'shower', x: 4.308, z: -1.1, rot: -H },
      { uid: 'dining', item: 'diningTable', x: 3.3, z: 2.5, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: 4.598, z: 4.2, rot: -H },
      { uid: 'tv', item: 'tvVintage', x: 4.4, z: 0.45, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: 2.3, z: 4.6, rot: 0 },
      { uid: 'plant', item: 'plant', x: -0.6, z: 0.0, rot: 0 },
    ],
  },
  {
    // THE RICH START, v4 (Peter, 2026-10-27: square, big living room,
    // "walk-in closets or shower in the big rooms", a guest bathroom).
    // 20 × 20: a primary suite with a walk-in closet and its own marble
    // bathroom, a second bedroom with a glass shower, a third bedroom, an
    // open living / dining / kitchen with an island, a den with a pool
    // table, and a guest bathroom. Inside walls stay waist-high in the
    // angled view (Lagos Life style).
    id: 'uesTwoBed',
    name: 'Upper East Side residence',
    version: 4,
    shaped: true,
    door: { x: -2.5, z: 10 },
    width: 20,
    depth: 20,
    wallColor: '#eef1f4',
    conditions: { doorman: true },
    zoomable: true,
    windows: { xs: [0], w: 1.7, h: 1.8, y: 1.6, view: 'sky' },
    rooms: [
      { label: 'Primary bedroom', rect: [-10, -10, -3, -2], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'damask:#5e1f2b' } },
      { label: 'Walk-in closet', rect: [-3, -10, 0, -6.5], floor: '#b98a5e', style: { floor: 'walnut', wall: 'woodPanel' } },
      { label: 'Primary bathroom', rect: [-3, -6.5, 0, -2], floor: '#b98a5e', style: { floor: 'marble', wall: 'marbleWall' } },
      { label: 'Second bedroom', rect: [0, -10, 5, -2], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#cfdbe3' } },
      { label: 'Third bedroom', rect: [5, -10, 10, -2], floor: '#b98a5e', style: { floor: 'carpet:#d9c7b0', wall: 'paint:#d7e3c3' } },
      { label: 'Living room', rect: [-10, -2, 2, 4], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'paint:#ece6dc' } },
      { label: 'Dining room', rect: [2, -2, 10, 4], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'panel:#2f4858' } },
      { label: 'Guest bathroom', rect: [-10, 4, -6.5, 10], floor: '#b98a5e', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
      { label: 'Den', rect: [-6.5, 4, 1, 10], floor: '#b98a5e', style: { floor: 'walnut', wall: 'paint:#ece6dc' } },
      { label: 'Kitchen', rect: [1, 4, 10, 10], floor: '#b98a5e', style: { floor: 'marble', wall: 'subway:#f4f4f2' } },
    ],
    walls: [
      { a: [-10, -2], b: [10, -2], gaps: [[4.8, 6.0], [10.5, 11.6], [15.5, 16.6]] },
      { a: [-3, -10], b: [-3, -2], gaps: [[1.1, 2.1], [5.4, 6.4]] },
      { a: [-3, -6.5], b: [0, -6.5] },
      { a: [0, -10], b: [0, -2] },
      { a: [5, -10], b: [5, -2] },
      { a: [-6.5, 4], b: [-6.5, 10], gaps: [[1, 2.1]] },
      { a: [-10, 4], b: [-6.5, 4] },
    ],
    furniture: [
      { uid: 'bed', item: 'kingBed', x: -6.5, z: -8.69, rot: 0 },
      { uid: 'night', item: 'nightstandTwo', x: -8.1, z: -9.604, rot: 0 },
      { uid: 'night2', item: 'nightstandTwo', x: -4.9, z: -9.604, rot: 0 },
      { uid: 'lamp1', item: 'ceramicLamp', x: -8.1, z: -9.6, rot: 0 },
      { uid: 'lamp2', item: 'ceramicLamp', x: -4.9, z: -9.6, rot: 0 },
      { uid: 'bench', item: 'cushionBench', x: -6.5, z: -7.2, rot: 0 },
      { uid: 'brug', item: 'persianRug', x: -6.5, z: -6.4, rot: 0 },
      { uid: 'dresser', item: 'midDresser', x: -9.61, z: -4.6, rot: H },
      { uid: 'btv', item: 'wallTv', x: -9.865, z: -4.6, rot: H },
      { uid: 'bart', item: 'artwork', x: -6.5, z: -9.71, rot: 0 },
      { uid: 'bchair', item: 'shellChair', x: -9.339, z: -2.85, rot: H },
      { uid: 'bplant', item: 'fiddleFig', x: -3.55, z: -9.5, rot: 0 },
      { uid: 'bchand', item: 'crystalChandelier', x: -6.5, z: -6.2, rot: 0 },
      { uid: 'closet', item: 'wardrobeWall', x: -1.5, z: -9.565, rot: 0 },
      { uid: 'closet2', item: 'wardrobeWall', x: -0.435, z: -7.85, rot: -H },
      { uid: 'cottoman', item: 'ottoman', x: -1.8, z: -7.9, rot: 0 },
      { uid: 'clight', item: 'tulipChandelier', x: -1.6, z: -8.2, rot: 0 },
      { uid: 'tub', item: 'freestandingTub', x: -0.6, z: -5.3, rot: 0 },
      { uid: 'shower', item: 'rainShower', x: -2.4, z: -5.9, rot: 0 },
      { uid: 'bsink', item: 'doubleVanity', x: -1.5, z: -2.41, rot: PI },
      { uid: 'toilet', item: 'luxToilet', x: -1.45, z: -5.913, rot: 0 },
      { uid: 'bathLight', item: 'glassGlobe', x: -1.5, z: -4.3, rot: 0 },
      { uid: 'bed2', item: 'upholsteredKing', x: 2.6, z: -8.704, rot: 0 },
      { uid: 'night3', item: 'nightstandWood', x: 1.05, z: -9.604, rot: 0 },
      { uid: 'night4', item: 'nightstandWood', x: 4.15, z: -9.604, rot: 0 },
      { uid: 'lamp3', item: 'roundTableLamp', x: 1.05, z: -9.55, rot: 0 },
      { uid: 'shower2', item: 'roundShower', x: 4.3, z: -2.75, rot: 0 },
      { uid: 'bsink2', item: 'vanity', x: 4.57, z: -4.4, rot: -H },
      { uid: 'desk', item: 'deskScreen', x: 0.502, z: -5.0, rot: H },
      { uid: 'rug2', item: 'rugRound', x: 2.6, z: -5.9, rot: 0 },
      { uid: 'lantern2', item: 'paperLantern', x: 2.6, z: -6.0, rot: 0 },
      { uid: 'bed3', item: 'bedDouble', x: 7.8, z: -8.765, rot: 0 },
      { uid: 'night5', item: 'nightstand', x: 9.35, z: -9.673, rot: 0 },
      { uid: 'closet3', item: 'closet', x: 9.64, z: -5.2, rot: -H },
      { uid: 'desk3', item: 'desk', x: 5.502, z: -5.6, rot: H },
      { uid: 'rug3', item: 'squareRug', x: 7.8, z: -6.3, rot: 0 },
      { uid: 'flamp3', item: 'floorLamp', x: 9.6, z: -2.5, rot: 0 },
      { uid: 'light3', item: 'bellPendant', x: 7.8, z: -6.3, rot: 0 },
      { uid: 'tv', item: 'mediaWall', x: -9.638, z: 1.0, rot: H },
      { uid: 'rug', item: 'ovalRug', x: -6.6, z: 1.0, rot: H },
      { uid: 'coffee', item: 'coffeeTable', x: -6.6, z: 1.0, rot: H },
      { uid: 'sofa', item: 'velvetSectional', x: -3.7, z: 1.0, rot: -H },
      { uid: 'sofa2', item: 'greySofa', x: -6.6, z: -1.3, rot: 0 },
      { uid: 'sofa3', item: 'greySofa', x: -6.6, z: 3.3, rot: PI },
      { uid: 'candles', item: 'candles', x: -6.6, z: 1.0, rot: 0 },
      { uid: 'chandelier', item: 'crystalChandelier', x: -6.6, z: 1.0, rot: 0 },
      { uid: 'flamp', item: 'floorLamp', x: -9.6, z: -1.6, rot: 0 },
      { uid: 'fig', item: 'fiddleFig', x: -9.5, z: 3.5, rot: 0 },
      { uid: 'books', item: 'bookcaseWide', x: -1.3, z: -1.64, rot: 0 },
      { uid: 'side', item: 'sideTable', x: -3.8, z: -1.35, rot: 0 },
      { uid: 'sideLamp', item: 'tallTableLamp', x: -3.5, z: -1.35, rot: 0 },
      { uid: 'dining', item: 'ovalDining', x: 6.0, z: 1.3, rot: 0 },
      { uid: 'chairA0', item: 'diningChair', x: 5.2, z: 0.35, rot: 0 },
      { uid: 'chairB0', item: 'diningChair', x: 5.2, z: 2.25, rot: PI },
      { uid: 'chairA1', item: 'diningChair', x: 6.0, z: 0.35, rot: 0 },
      { uid: 'chairB1', item: 'diningChair', x: 6.0, z: 2.25, rot: PI },
      { uid: 'chairA2', item: 'diningChair', x: 6.8, z: 0.35, rot: 0 },
      { uid: 'chairB2', item: 'diningChair', x: 6.8, z: 2.25, rot: PI },
      { uid: 'chairC', item: 'diningChair', x: 4.45, z: 1.3, rot: H },
      { uid: 'chairD', item: 'diningChair', x: 7.55, z: 1.3, rot: -H },
      { uid: 'vase', item: 'flowerVase', x: 6.0, z: 1.3, rot: 0 },
      { uid: 'chandelier2', item: 'tulipChandelier', x: 6.0, z: 1.3, rot: 0 },
      { uid: 'sideboard', item: 'sideboard', x: 9.61, z: 1.3, rot: -H },
      { uid: 'art2', item: 'artwork', x: 9.71, z: 1.3, rot: -H },
      { uid: 'olive', item: 'oliveTree', x: 9.4, z: -1.4, rot: 0 },
      { uid: 'record', item: 'recordPlayer', x: 2.8, z: -1.6, rot: 0 },
      { uid: 'toilet2', item: 'toilet', x: -9.4, z: 4.587, rot: 0 },
      { uid: 'bsink3', item: 'bathSink', x: -8.3, z: 4.454, rot: 0 },
      { uid: 'tub2', item: 'bathtub', x: -9.33, z: 8.6, rot: H },
      { uid: 'washer', item: 'washerStack', x: -7.0, z: 9.4, rot: 0 },
      { uid: 'gbLight', item: 'flushLight', x: -8.3, z: 7, rot: 0 },
      { uid: 'pool', item: 'poolTable', x: -2.6, z: 6.9, rot: 0 },
      { uid: 'poolLight', item: 'sputnik', x: -2.6, z: 6.9, rot: 0 },
      { uid: 'club1', item: 'clubChair', x: -5.6, z: 8.0, rot: H },
      { uid: 'mat', item: 'doormat', x: -2.5, z: 9.55, rot: 0 },
      { uid: 'coat', item: 'coatRack', x: -5.9, z: 9.55, rot: 0 },
      { uid: 'palm', item: 'palmPot', x: 0.5, z: 9.5, rot: 0 },
      { uid: 'fridge', item: 'doubleFridge', x: 9.484, z: 4.64, rot: -H },
      { uid: 'cabinetDrawers', item: 'cabinetDrawers', x: 9.571, z: 5.468, rot: -H },
      { uid: 'stove', item: 'proRange', x: 9.585, z: 6.11, rot: -H },
      { uid: 'cabinetDoor', item: 'cabinetDoor', x: 9.585, z: 6.752, rot: -H },
      { uid: 'ksink', item: 'kitchenSink', x: 9.44, z: 7.49, rot: -H },
      { uid: 'cabinetTwo', item: 'cabinetTwo', x: 9.571, z: 8.228, rot: -H },
      { uid: 'cabinetMixed', item: 'cabinetMixed', x: 9.571, z: 8.824, rot: -H },
      { uid: 'cab8', item: 'cabinetMixed', x: 8.75, z: 9.571, rot: PI },
      { uid: 'cab9', item: 'cabinetDoor', x: 8.15, z: 9.585, rot: PI },
      { uid: 'coffeeMaker', item: 'coffeeMaker', x: 8.75, z: 9.6, rot: 0 },
      { uid: 'island', item: 'island', x: 5.6, z: 6.9, rot: 0 },
      { uid: 'stool0', item: 'barStool', x: 5.0, z: 7.85, rot: PI },
      { uid: 'stool1', item: 'barStool', x: 5.6, z: 7.85, rot: PI },
      { uid: 'stool2', item: 'barStool', x: 6.2, z: 7.85, rot: PI },
      { uid: 'islandLight', item: 'tripleCups', x: 5.6, z: 7.0, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: 4.0, z: 9.55, rot: 0 },
      { uid: 'kplant', item: 'monsteraLow', x: 1.6, z: 9.4, rot: 0 },
    ],
  },
  {
    // THE BILLIONAIRE HOME, v4 (Peter, 2026-10-27: square, no pool, big
    // living room, suites). 24 × 24: a primary suite with a walk-in closet
    // and a black-marble bathroom, a second bedroom with a glass shower, a
    // third bedroom, a huge living room (sofas round a rug, chandelier,
    // media wall), a dining room for eight with a grand piano, a chef's
    // kitchen with a marble island, a game lounge with a pool table, and a
    // guest bathroom.
    id: 'penthouse',
    name: "Billionaires' Row penthouse",
    version: 4,
    shaped: true,
    door: { x: -3, z: 12 },
    width: 24,
    depth: 24,
    wallColor: '#f4efe6',
    conditions: { housekeeper: true, doorman: true },
    zoomable: true,
    windows: { xs: [0], w: 2.2, h: 2.0, y: 1.5, view: 'park' },
    rooms: [
      { label: 'Primary bedroom', rect: [-12, -12, -4, -3], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'velvet:#1b3a2f' } },
      { label: 'Walk-in closet', rect: [-4, -12, 0, -7.5], floor: '#b98a5e', style: { floor: 'walnut', wall: 'woodPanel' } },
      { label: 'Primary bathroom', rect: [-4, -7.5, 0, -3], floor: '#b98a5e', style: { floor: 'marbleBlack', wall: 'marbleWall' } },
      { label: 'Second bedroom', rect: [0, -12, 6, -3], floor: '#b98a5e', style: { floor: 'oak', wall: 'paint:#d9c7b0' } },
      { label: 'Third bedroom', rect: [6, -12, 12, -3], floor: '#b98a5e', style: { floor: 'carpet:#d9c7b0', wall: 'paint:#cfdbe3' } },
      { label: 'Living room', rect: [-12, -3, 2, 5], floor: '#b98a5e', style: { floor: 'marble', wall: 'paint:#efe3cf' } },
      { label: 'Dining room', rect: [2, -3, 12, 5], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'geo:#1f3b4d' } },
      { label: 'Guest bathroom', rect: [-12, 5, -8, 12], floor: '#b98a5e', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
      { label: 'Game lounge', rect: [-8, 5, 2, 12], floor: '#b98a5e', style: { floor: 'walnut', wall: 'paint:#efe3cf' } },
      { label: 'Kitchen', rect: [2, 5, 12, 12], floor: '#b98a5e', style: { floor: 'tile:#e9e4d8', wall: 'subway:#f4f4f2' } },
    ],
    walls: [
      { a: [-12, -3], b: [12, -3], gaps: [[6, 7.2], [12.5, 13.7], [18.5, 19.7]] },
      { a: [-4, -12], b: [-4, -3], gaps: [[1.4, 2.6], [6.4, 7.6]] },
      { a: [-4, -7.5], b: [0, -7.5] },
      { a: [0, -12], b: [0, -3] },
      { a: [6, -12], b: [6, -3] },
      { a: [-8, 5], b: [-8, 12], gaps: [[1, 2.1]] },
      { a: [-12, 5], b: [-8, 5] },
    ],
    furniture: [
      { uid: 'bed', item: 'kingBed', x: -8, z: -10.69, rot: 0 },
      { uid: 'night', item: 'nightstandTwo', x: -9.6, z: -11.604, rot: 0 },
      { uid: 'night2', item: 'nightstandTwo', x: -6.4, z: -11.604, rot: 0 },
      { uid: 'lamp1', item: 'ceramicLamp', x: -9.6, z: -11.6, rot: 0 },
      { uid: 'lamp2', item: 'ceramicLamp', x: -6.4, z: -11.6, rot: 0 },
      { uid: 'bench', item: 'cushionBench', x: -8, z: -9.2, rot: 0 },
      { uid: 'brug', item: 'persianRug', x: -8, z: -8.6, rot: 0 },
      { uid: 'dresser', item: 'wideDresser', x: -10.0, z: -3.444, rot: PI },
      { uid: 'btv', item: 'wallTv', x: -11.865, z: -6.4, rot: H },
      { uid: 'bart', item: 'artwork', x: -8, z: -11.71, rot: 0 },
      { uid: 'bchair', item: 'shellChair', x: -4.661, z: -7.4, rot: -H },
      { uid: 'bplant', item: 'fiddleFig', x: -5.0, z: -11.4, rot: 0 },
      { uid: 'bchand', item: 'crystalChandelier', x: -8, z: -8, rot: 0 },
      { uid: 'bsconce', item: 'sconce', x: -11.77, z: -9.6, rot: H },
      { uid: 'closet', item: 'wardrobeWall', x: -1.9, z: -11.565, rot: 0 },
      { uid: 'closet2', item: 'wardrobeWall', x: -0.435, z: -9.3, rot: -H },
      { uid: 'cottoman', item: 'ottoman', x: -2.0, z: -9.4, rot: 0 },
      { uid: 'cchest', item: 'drawerChest', x: -2.2, z: -7.898, rot: PI },
      { uid: 'clight', item: 'tulipChandelier', x: -2.0, z: -9.6, rot: 0 },
      { uid: 'cmirror', item: 'mirrorArch', x: -3.5, z: -11.874, rot: 0 },
      { uid: 'tub', item: 'freestandingTub', x: -0.6, z: -5.3, rot: 0 },
      { uid: 'shower', item: 'rainShower', x: -3.4, z: -6.9, rot: 0 },
      { uid: 'bsink', item: 'doubleVanity', x: -2.0, z: -3.41, rot: PI },
      { uid: 'toilet', item: 'luxToilet', x: -2.1, z: -6.913, rot: 0 },
      { uid: 'bathLight', item: 'glassGlobe', x: -2.0, z: -5.2, rot: 0 },
      { uid: 'bathPlant', item: 'snakePlant', x: -3.6, z: -3.5, rot: 0 },
      { uid: 'bed2', item: 'upholsteredKing', x: 3.2, z: -10.704, rot: 0 },
      { uid: 'night3', item: 'nightstandWood', x: 1.65, z: -11.604, rot: 0 },
      { uid: 'night4', item: 'nightstandWood', x: 4.75, z: -11.604, rot: 0 },
      { uid: 'lamp3', item: 'roundTableLamp', x: 1.65, z: -11.55, rot: 0 },
      { uid: 'shower2', item: 'roundShower', x: 5.3, z: -3.75, rot: 0 },
      { uid: 'bsink2', item: 'vanity', x: 5.57, z: -5.3, rot: -H },
      { uid: 'desk', item: 'deskScreen', x: 0.502, z: -6.6, rot: H },
      { uid: 'rug2', item: 'rugRound', x: 3.2, z: -7.6, rot: 0 },
      { uid: 'lantern2', item: 'paperLantern', x: 3.2, z: -7.6, rot: 0 },
      { uid: 'bed3', item: 'bedDouble', x: 9.4, z: -10.765, rot: 0 },
      { uid: 'night5', item: 'nightstand', x: 7.95, z: -11.673, rot: 0 },
      { uid: 'night6', item: 'nightstand', x: 10.85, z: -11.673, rot: 0 },
      { uid: 'closet3', item: 'closet', x: 11.64, z: -6.0, rot: -H },
      { uid: 'desk3', item: 'desk', x: 6.502, z: -6.4, rot: H },
      { uid: 'rug3', item: 'squareRug', x: 9.4, z: -7.6, rot: 0 },
      { uid: 'flamp3', item: 'floorLamp', x: 11.5, z: -3.6, rot: 0 },
      { uid: 'light3', item: 'bellPendant', x: 9.4, z: -7.6, rot: 0 },
      { uid: 'tv', item: 'mediaWall', x: -11.638, z: 1.0, rot: H },
      { uid: 'rug', item: 'ovalRug', x: -7.4, z: 1.0, rot: H },
      { uid: 'coffee', item: 'coffeeTable', x: -7.4, z: 1.0, rot: H },
      { uid: 'sofa', item: 'velvetSectional', x: -4.4, z: 1.0, rot: -H },
      { uid: 'sofa2', item: 'greySofa', x: -7.4, z: -1.35, rot: 0 },
      { uid: 'sofa3', item: 'greySofa', x: -7.4, z: 3.35, rot: PI },
      { uid: 'candles', item: 'candles', x: -7.4, z: 1.0, rot: 0 },
      { uid: 'chandelier', item: 'crystalChandelier', x: -7.4, z: 1.0, rot: 0 },
      { uid: 'flamp', item: 'floorLamp', x: -11.6, z: -2.6, rot: 0 },
      { uid: 'palm', item: 'palmPot', x: -11.5, z: 4.4, rot: 0 },
      { uid: 'books', item: 'bookcaseWide', x: -2.2, z: -2.64, rot: 0 },
      { uid: 'fig', item: 'fiddleFig', x: -0.2, z: -2.55, rot: 0 },
      { uid: 'rug4', item: 'squareRug', x: 0.0, z: 1.6, rot: 0 },
      { uid: 'club3', item: 'clubChair', x: -1.0, z: 1.6, rot: H },
      { uid: 'club4', item: 'clubChair', x: 1.2, z: 1.6, rot: -H },
      { uid: 'coffee2', item: 'squareCoffee', x: 0.1, z: 1.6, rot: 0 },
      { uid: 'vase2', item: 'flowerVase', x: 0.1, z: 1.6, rot: 0 },
      { uid: 'arc', item: 'arcLamp', x: -0.6, z: 3.9, rot: 0 },
      { uid: 'nookLight', item: 'globePendantGrey', x: 0.1, z: 1.6, rot: 0 },
      { uid: 'dining', item: 'ovalDining', x: 6.6, z: 1.2, rot: 0 },
      { uid: 'chairA0', item: 'diningChair', x: 5.8, z: 0.25, rot: 0 },
      { uid: 'chairB0', item: 'diningChair', x: 5.8, z: 2.15, rot: PI },
      { uid: 'chairA1', item: 'diningChair', x: 6.6, z: 0.25, rot: 0 },
      { uid: 'chairB1', item: 'diningChair', x: 6.6, z: 2.15, rot: PI },
      { uid: 'chairA2', item: 'diningChair', x: 7.4, z: 0.25, rot: 0 },
      { uid: 'chairB2', item: 'diningChair', x: 7.4, z: 2.15, rot: PI },
      { uid: 'chairC', item: 'diningChair', x: 5.05, z: 1.2, rot: H },
      { uid: 'chairD', item: 'diningChair', x: 8.15, z: 1.2, rot: -H },
      { uid: 'vase', item: 'flowerVase', x: 6.6, z: 1.2, rot: 0 },
      { uid: 'chandelier2', item: 'crystalChandelier', x: 6.6, z: 1.2, rot: 0 },
      { uid: 'piano', item: 'grandPiano', x: 10.6, z: -1.6, rot: 0 },
      { uid: 'sideboard', item: 'sideboard', x: 11.61, z: 3.4, rot: -H },
      { uid: 'art2', item: 'artwork', x: 11.71, z: 3.4, rot: -H },
      { uid: 'olive', item: 'oliveTree', x: 2.6, z: -2.4, rot: 0 },
      { uid: 'tub2', item: 'bathtub', x: -11.33, z: 10.6, rot: H },
      { uid: 'toilet2', item: 'toilet', x: -11.2, z: 5.587, rot: 0 },
      { uid: 'bsink3', item: 'bathSink', x: -10.0, z: 5.454, rot: 0 },
      { uid: 'washer', item: 'washerStack', x: -8.6, z: 11.3, rot: 0 },
      { uid: 'gbLight', item: 'flushLight', x: -10, z: 8.5, rot: 0 },
      { uid: 'pool', item: 'poolTable', x: -3.6, z: 8.2, rot: 0 },
      { uid: 'poolLight', item: 'sputnik', x: -3.6, z: 8.2, rot: 0 },
      { uid: 'club1', item: 'clubChair', x: -6.9, z: 9.0, rot: H },
      { uid: 'club2', item: 'clubChair', x: -6.9, z: 10.6, rot: H },
      { uid: 'record', item: 'recordPlayer', x: 0.6, z: 11.4, rot: 0 },
      { uid: 'speaker', item: 'speaker', x: 1.45, z: 11.55, rot: 0 },
      { uid: 'lounge1', item: 'loungeChairModern', x: 0.6, z: 8.3, rot: -H },
      { uid: 'mat', item: 'doormat', x: -3, z: 11.55, rot: 0 },
      { uid: 'pampas', item: 'pampas', x: -7.6, z: 5.4, rot: 0 },
      { uid: 'poolRug', item: 'hideRug', x: -3.6, z: 8.2, rot: 0 },
      { uid: 'bean1', item: 'beanbag', x: 0.2, z: 6.2, rot: 0 },
      { uid: 'bean2', item: 'beanbag', x: 1.3, z: 6.9, rot: 0 },
      { uid: 'loungeRug', item: 'shagRug', x: -6.9, z: 9.8, rot: 0 },
      { uid: 'fridge', item: 'chefFridge', x: 11.49, z: 5.79, rot: -H },
      { uid: 'cabinetDrawers', item: 'cabinetDrawers', x: 11.571, z: 6.868, rot: -H },
      { uid: 'stove', item: 'chefRange', x: 11.468, z: 7.776, rot: -H },
      { uid: 'cabinetDoor', item: 'cabinetDoor', x: 11.585, z: 8.684, rot: -H },
      { uid: 'ksink', item: 'kitchenSink', x: 11.44, z: 9.422, rot: -H },
      { uid: 'cabinetTwo', item: 'cabinetTwo', x: 11.571, z: 10.16, rot: -H },
      { uid: 'cab5', item: 'cabinetMixed', x: 10.7, z: 11.571, rot: PI },
      { uid: 'cab6', item: 'cabinetDoor', x: 10.1, z: 11.585, rot: PI },
      { uid: 'cab7', item: 'cabinetMixed', x: 9.5, z: 11.571, rot: PI },
      { uid: 'coffeeMaker', item: 'coffeeMaker', x: 10.7, z: 11.6, rot: 0 },
      { uid: 'toaster', item: 'toaster', x: 9.5, z: 11.6, rot: 0 },
      { uid: 'island', item: 'marbleIsland', x: 7.3, z: 8.6, rot: H },
      { uid: 'stool0', item: 'barStool', x: 6.05, z: 7.9, rot: H },
      { uid: 'stool1', item: 'barStool', x: 6.05, z: 8.6, rot: H },
      { uid: 'stool2', item: 'barStool', x: 6.05, z: 9.3, rot: H },
      { uid: 'islandLight', item: 'tripleCups', x: 7.3, z: 7.9, rot: 0 },
      { uid: 'islandLight2', item: 'tripleCups', x: 7.3, z: 9.3, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: 10.6, z: 5.45, rot: 0 },
      { uid: 'kplant', item: 'monsteraLow', x: 2.6, z: 11.4, rot: 0 },
      { uid: 'islandVase', item: 'flowerVase', x: 7.3, z: 8.6, rot: 0 },
    ],
  },
);

/** Which floor plan each home place uses. */
export const HOME_LAYOUT_FOR: Record<string, string> = { hkStudio: 'studio', wburgLoft: 'loft', sharedApt: 'harlemWalkup', shelter: 'shelter', uesApt: 'uesTwoBed', penthouse: 'penthouse' };

export function layoutForPlace(placeId: string): HomeLayout {
  return HOME_LAYOUTS.get(HOME_LAYOUT_FOR[placeId]) ?? HOME_LAYOUTS.require('studio');
}
