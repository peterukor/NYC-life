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
    // THE BROKE START (Peter, 2026-10-13): a room in a shared East Harlem
    // walk-up. Your small bedroom on the left (twin bed, milk crates, a
    // clothes rack for a closet), a shared kitchen and living room with
    // two roommates' doors, a tiny bathroom by the front door.
    // All chunky cartoon pieces built in code (world/furniture-toys.ts).
    id: 'harlemWalkup',
    name: 'East Harlem walk-up',
    // A railroad apartment: long and narrow, one room behind the other
    // (classic old-NYC walk-up, and it fills a phone held upright).
    width: 7.6,
    depth: 11,
    wallColor: '#e8dcc4',
    conditions: {
      roommates: [
        { name: 'Danny', body: 'm', skin: '#8d5524', top: '#2a9d8f', bottom: '#264653', hair: '#1b1b1b', habit: 'works nights at the bakery on 116th' },
        { name: 'Keisha', body: 'f', skin: '#5c3a21', top: '#e9c46a', bottom: '#3d5a80', hair: '#2b1a10', habit: 'nursing student, always studying' },
      ],
      sharedBathroom: true,
    },
    rooms: [
      { label: 'Your room', rect: [-3.8, -5.5, 3.8, -1.6], floor: '#a9784e' },
      { label: 'Living', rect: [-3.8, -1.6, 3.8, 2.6], floor: '#c09068' },
      { label: 'Kitchen', rect: [-3.8, -1.6, -2.75, 2.6], floor: '#e7e0cf' },
      { label: 'Hall', rect: [-3.8, 2.6, 1.2, 5.5], floor: '#b98a5f' },
      { label: 'Bathroom', rect: [1.2, 2.6, 3.8, 5.5], floor: '#bfe0e6' },
    ],
    walls: [
      { a: [-3.8, -1.6], b: [3.8, -1.6], gaps: [[2.2, 3.2]] },
      { a: [1.2, 2.6], b: [1.2, 5.5], gaps: [[0.3, 1.3]] },
      { a: [1.2, 2.6], b: [3.8, 2.6] },
    ],
    furniture: [
      // Your room at the back: bed in the corner, crates, a folding desk under the window.
      { uid: 'bed', item: 'twinBed', x: -3.19, z: -4.42, rot: 0 },
      { uid: 'night', item: 'crateNightstand', x: -2.35, z: -5.2, rot: 0 },
      { uid: 'radiator', item: 'radiator', x: -1.45, z: -5.35, rot: 0 },
      { uid: 'ac', item: 'windowAC', x: -1.71, z: -5.1, rot: 0 },
      { uid: 'posters', item: 'posters', x: -3.68, z: -2.6, rot: H },
      { uid: 'desk', item: 'foldingDesk', x: 1.0, z: -4.92, rot: 0 },
      { uid: 'rack', item: 'clothesRack', x: 3.4, z: -3.7, rot: -H },
      { uid: 'laundry', item: 'laundryPile', x: 0.4, z: -2.7, rot: 0 },
      { uid: 'boxes', item: 'movingBoxes', x: 2.75, z: -2.2, rot: 0 },
      // Kitchen along the left wall.
      { uid: 'stove', item: 'oldStove', x: -3.38, z: -1.05, rot: H },
      { uid: 'ksink', item: 'sinkCounter', x: -3.4, z: 0.25, rot: H },
      { uid: 'fridge', item: 'oldFridge', x: -3.36, z: 1.6, rot: H },
      { uid: 'trash', item: 'trashBags', x: -3.4, z: 2.35, rot: H },
      { uid: 'table', item: 'smallTable', x: -1.4, z: 0.3, rot: 0 },
      // Living room.
      { uid: 'rug', item: 'wornRug', x: 2.2, z: -0.2, rot: 0 },
      { uid: 'tv', item: 'crateTv', x: 2.2, z: -1.27, rot: 0 },
      { uid: 'couch', item: 'wornCouch', x: 2.2, z: 0.95, rot: PI },
      { uid: 'roomA', item: 'roommateDoor', x: 3.63, z: 2.0, rot: -H },
      { uid: 'posters2', item: 'posters', x: 3.68, z: -0.2, rot: -H },
      // Hall by the front door, and the bathroom.
      { uid: 'roomB', item: 'roommateDoor', x: -3.63, z: 3.7, rot: H },
      { uid: 'plant', item: 'plantStool', x: -3.3, z: 5.0, rot: 0 },
      { uid: 'shoes', item: 'shoePile', x: -0.4, z: 4.85, rot: 0 },
      { uid: 'bsink', item: 'pedestalSink', x: 2.2, z: 2.93, rot: 0 },
      { uid: 'tub', item: 'tubShower', x: 3.36, z: 4.3, rot: -H },
      { uid: 'toilet', item: 'oldToilet', x: 1.75, z: 4.95, rot: PI },
    ],
  },
  {
    // One big room with a little bathroom in the back corner.
    id: 'studio',
    name: 'Studio',
    width: 12,
    depth: 9,
    wallColor: '#f3e3cc',
    // The middle start: your own place, small but private. Ninth Avenue never sleeps.
    conditions: { noise: { chance: 0.1, label: 'Sirens on Ninth Avenue woke you up' } },
    rooms: [
      { label: 'Living', rect: [-6, -4.5, 6, 4.5], floor: '#c8935f' },
      { label: 'Kitchen', rect: [-6, -4.5, -1.6, -2.4], floor: '#e9e4d8' },
      { label: 'Bathroom', rect: [3, -4.5, 6, -1], floor: '#bfe3e8' },
    ],
    walls: [
      { a: [3, -4.5], b: [3, -1], gaps: [[2.2, 3.3]] },
      { a: [3, -1], b: [6, -1] },
    ],
    furniture: [
      { uid: 'bed', item: 'bedSingle', x: -5.1, z: 1.6, rot: 0 },
      { uid: 'night', item: 'nightstand', x: -5.6, z: -0.2, rot: 0 },
      { uid: 'stove', item: 'stove', x: -5.4, z: -4.0, rot: 0 },
      { uid: 'ksink', item: 'kitchenSink', x: -4.5, z: -4.0, rot: 0 },
      { uid: 'counter', item: 'counterMicrowave', x: -3.6, z: -4.0, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: -2.6, z: -4.1, rot: 0 },
      { uid: 'dining', item: 'diningTable', x: -3.1, z: -1.4, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 5.4, z: -2.4, rot: -H },
      { uid: 'shower', item: 'shower', x: 5.3, z: -3.87, rot: 0 },
      { uid: 'bsink', item: 'bathSink', x: 3.8, z: -4.1, rot: 0 },
      { uid: 'rug', item: 'rug', x: 1.0, z: 1.5, rot: 0 },
      { uid: 'tv', item: 'tvVintage', x: 1.0, z: -0.3, rot: 0 },
      { uid: 'sofa', item: 'sofa', x: 1.0, z: 2.9, rot: PI },
      { uid: 'coffee', item: 'coffeeTable', x: 1.0, z: 1.6, rot: 0 },
      { uid: 'desk', item: 'desk', x: 4.8, z: 1.4, rot: -H },
      { uid: 'books', item: 'bookcase', x: 2.4, z: -4.1, rot: 0 },
      { uid: 'plant', item: 'plant', x: 5.5, z: 3.9, rot: 0 },
      { uid: 'lamp', item: 'floorLamp', x: -1.6, z: 3.6, rot: 0 },
      { uid: 'coat', item: 'coatRack', x: -5.5, z: 3.9, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: -1.6, z: -4.1, rot: 0 },
      { uid: 'closet', item: 'closet', x: -3.0, z: 4.0, rot: PI },
    ],
  },
  {
    // A big open Brooklyn loft (bigger, 2026-10-27): exposed brick, polished
    // concrete, steel windows. Open kitchen with an island and a dining
    // table, a sunken-feeling lounge, a walled bedroom, a real bathroom,
    // a work corner.
    id: 'loft',
    name: 'Loft',
    version: 2,
    width: 18,
    depth: 12,
    wallColor: '#e7d3c1',
    zoomable: true,
    windows: { xs: [-6.5, -1.5, 2.5, 6.8], w: 2.6, h: 2.1, y: 1.55, view: 'sky' },
    rooms: [
      { label: 'Loft', rect: [-9, -6, 9, 6], floor: '#9a9894', style: { floor: 'concrete', wall: 'brick' } },
      { label: 'Kitchen', rect: [-9, -6, -3.4, -2.2], floor: '#9a9894', style: { floor: 'concrete', wall: 'subway:#f4f4f2' } },
      { label: 'Bedroom', rect: [-9, 1, -3.5, 6], floor: '#b98d6a', style: { floor: 'oak', wall: 'whiteBrick' } },
      { label: 'Bathroom', rect: [4.5, -6, 9, -1.5], floor: '#cfe8ef', style: { floor: 'hex:#dfe7e6', wall: 'subway:#f4f4f2' } },
      { label: 'Work corner', rect: [4.5, 1.5, 9, 6], floor: '#b98d6a', style: { floor: 'oak', wall: 'brick' } },
    ],
    walls: [
      { a: [-9, 1], b: [-3.5, 1] },
      { a: [-3.5, 1], b: [-3.5, 6], gaps: [[0.5, 1.6]] },
      { a: [4.5, -6], b: [4.5, -1.5], gaps: [[3.0, 4.1]] },
      { a: [4.5, -1.5], b: [9, -1.5] },
    ],
    furniture: [
      // kitchen along the back wall, an island in front of it
      { uid: 'stove', item: 'stove', x: -8.4, z: -5.45, rot: 0 },
      { uid: 'ksink', item: 'kitchenSink', x: -7.5, z: -5.45, rot: 0 },
      { uid: 'counter', item: 'counter', x: -6.6, z: -5.45, rot: 0 },
      { uid: 'counter2', item: 'counterMicrowave', x: -5.7, z: -5.45, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: -4.75, z: -5.5, rot: 0 },
      { uid: 'island', item: 'island', x: -6.6, z: -3.3, rot: 0 },
      { uid: 'islandLight', item: 'edisonCluster', x: -6.6, z: -3.5, rot: 0 },
      // dining
      { uid: 'dining', item: 'farmTable', x: -1.4, z: -3.6, rot: 0 },
      { uid: 'chairA', item: 'spindleChair', x: -1.9, z: -4.45, rot: 0 },
      { uid: 'chairB', item: 'spindleChair', x: -0.9, z: -4.45, rot: 0 },
      { uid: 'chairC', item: 'spindleChair', x: -1.9, z: -2.75, rot: PI },
      { uid: 'chairD', item: 'spindleChair', x: -0.9, z: -2.75, rot: PI },
      { uid: 'diningLight', item: 'geoTrio', x: -1.4, z: -3.6, rot: 0 },
      // lounge
      { uid: 'tv', item: 'tvConsole', x: 2.0, z: -5.6, rot: 0 },
      { uid: 'led', item: 'ledStrip', x: 2.0, z: -5.9, rot: 0 },
      { uid: 'sofa', item: 'sectionalL', x: 2.2, z: -1.5, rot: PI },
      { uid: 'rug', item: 'persianRug', x: 2.0, z: -3.3, rot: 0 },
      { uid: 'coffee', item: 'squareCoffee', x: 2.0, z: -3.35, rot: 0 },
      { uid: 'arc', item: 'arcLamp', x: 3.9, z: -1.2, rot: PI },
      { uid: 'plantL', item: 'palmPot', x: 0.0, z: -5.55, rot: 0 },
      { uid: 'books', item: 'bookcaseWide', x: -2.4, z: -0.9, rot: 0 },
      // bathroom
      { uid: 'tub', item: 'freestandingTub', x: 7.9, z: -4.7, rot: 0 },
      { uid: 'shower', item: 'rainShower', x: 5.15, z: -5.4, rot: 0 },
      { uid: 'toilet', item: 'toiletClassic', x: 6.45, z: -5.45, rot: 0 },
      { uid: 'bsink', item: 'vanity', x: 8.55, z: -2.3, rot: -H },
      { uid: 'washer', item: 'washerStack', x: 5.15, z: -3.9, rot: H },
      { uid: 'bathLight', item: 'flushLight', x: 6.8, z: -3.6, rot: 0 },
      // bedroom
      { uid: 'bed', item: 'upholsteredKing', x: -7.65, z: 3.55, rot: H },
      { uid: 'night', item: 'nightstandTwo', x: -8.6, z: 1.85, rot: H },
      { uid: 'night2', item: 'nightstandTwo', x: -8.6, z: 5.25, rot: H },
      { uid: 'lamp1', item: 'ceramicLamp', x: -8.6, z: 1.85, rot: H },
      { uid: 'closet', item: 'closet', x: -5.0, z: 5.6, rot: PI },
      { uid: 'brug', item: 'shagRug', x: -5.4, z: 3.5, rot: 0 },
      { uid: 'lantern', item: 'paperLantern', x: -6.3, z: 3.5, rot: 0 },
      // work corner
      { uid: 'desk', item: 'deskScreen', x: 7.8, z: 5.45, rot: PI },
      { uid: 'shelf', item: 'wallUnit', x: 8.7, z: 2.6, rot: -H },
      { uid: 'deskLamp', item: 'drumFloorLamp', x: 5.6, z: 5.5, rot: 0 },
      { uid: 'plant', item: 'monstera', x: 8.6, z: 1.0, rot: 0 },
      // by the door
      { uid: 'mat', item: 'doormat', x: 0, z: 5.6, rot: 0 },
      { uid: 'coat', item: 'coatRack', x: -2.6, z: 5.5, rot: 0 },
      { uid: 'tree', item: 'oliveTree', x: 3.2, z: 5.4, rot: 0 },
      { uid: 'ceiling', item: 'flushLight2', x: 0.5, z: 1.5, rot: 0 },
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
      { label: 'Your room', rect: [-6, -4.5, -0.5, 4.5], floor: '#b07d55' },
      { label: 'Kitchen', rect: [-0.5, -4.5, 6, 0], floor: '#e4dccd' },
      { label: 'Bathroom', rect: [2.5, 0, 6, 4.5], floor: '#c4e2e6' },
      { label: 'Hall', rect: [-0.5, 0, 2.5, 4.5], floor: '#c9a27c' },
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
    // The city shelter: a dorm of single beds, lockers, a shared table
    // and a bathroom. Where you land after bankruptcy (sim/debt.ts).
    id: 'shelter',
    name: 'Shelter dorm',
    width: 12,
    depth: 9,
    wallColor: '#dfe6ee',
    rooms: [
      { label: 'Dorm', rect: [-6, -4.5, 2.5, 4.5], floor: '#b9c4cf' },
      { label: 'Washroom', rect: [2.5, -4.5, 6, 0], floor: '#c4e2e6' },
      { label: 'Common', rect: [2.5, 0, 6, 4.5], floor: '#cfc6b8' },
    ],
    walls: [
      { a: [2.5, -4.5], b: [2.5, 0], gaps: [[2.8, 3.9]] },
      { a: [2.5, 0], b: [6, 0], gaps: [[1.0, 2.2]] },
    ],
    furniture: [
      { uid: 'bed', item: 'bedSingle', x: -5.0, z: -2.8, rot: 0 },
      { uid: 'bed2', item: 'bedSingle', x: -2.6, z: -2.8, rot: 0 },
      { uid: 'bed3', item: 'bedSingle', x: -0.2, z: -2.8, rot: 0 },
      { uid: 'bed4', item: 'bedSingle', x: -5.0, z: 2.6, rot: PI },
      { uid: 'bed5', item: 'bedSingle', x: -2.6, z: 2.6, rot: PI },
      { uid: 'closet', item: 'closet', x: 1.64, z: -3.9, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 5.4, z: -3.6, rot: -H },
      { uid: 'shower', item: 'shower', x: 5.3, z: -1.0, rot: -H },
      { uid: 'bsink', item: 'bathSink', x: 3.2, z: -4.0, rot: 0 },
      { uid: 'dining', item: 'diningTable', x: 4.3, z: 2.4, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: 5.5, z: 4.0, rot: -H },
      { uid: 'tv', item: 'tvVintage', x: 3.0, z: 4.1, rot: PI },
      { uid: 'trash', item: 'trashcan', x: 1.5, z: 4.1, rot: 0 },
      { uid: 'plant', item: 'plant', x: 1.9, z: 0.4, rot: 0 },
    ],
  },
  {
    // THE RICH START (about 1 in 11): a doorman pre-war two-bedroom on the
    // Upper East Side (bigger, 2026-10-27). Herringbone in the living room,
    // a checkerboard galley kitchen with an island, a subway-tiled bath,
    // a primary bedroom and a guest room you use as an office.
    id: 'uesTwoBed',
    name: 'Upper East Side two-bedroom',
    version: 2,
    width: 18,
    depth: 13,
    wallColor: '#eef1f4',
    conditions: { doorman: true },
    zoomable: true,
    windows: { xs: [-6.6, -3.6, -0.5, 4.0, 7.2], w: 1.7, h: 1.9, y: 1.6, view: 'sky' },
    rooms: [
      { label: 'Living', rect: [-9, -1, 3, 6.5], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'paint:#ece6dc' } },
      { label: 'Kitchen', rect: [3, -1, 9, 6.5], floor: '#e8e6e1', style: { floor: 'checker', wall: 'subway:#f4f4f2' } },
      { label: 'Bedroom', rect: [-9, -6.5, -2.5, -1], floor: '#a8b5c8', style: { floor: 'oak', wall: 'paint:#cfdbe3' } },
      { label: 'Bathroom', rect: [-2.5, -6.5, 1.5, -1], floor: '#d5ecef', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
      { label: 'Guest room', rect: [1.5, -6.5, 9, -1], floor: '#c9b8a0', style: { floor: 'ash', wall: 'paint:#e9e2d4' } },
    ],
    walls: [
      { a: [-9, -1], b: [9, -1], gaps: [[5.0, 6.1], [7.9, 9.0], [10.8, 11.8]] },
      { a: [-2.5, -6.5], b: [-2.5, -1] },
      { a: [1.5, -6.5], b: [1.5, -1] },
      { a: [3, -1], b: [3, 6.5], gaps: [[1.6, 3.6]] },
    ],
    furniture: [
      // bedroom
      { uid: 'bed', item: 'bedDouble', x: -5.75, z: -5.2, rot: 0 },
      { uid: 'night', item: 'nightstand', x: -7.3, z: -6.0, rot: 0 },
      { uid: 'night2', item: 'nightstandOpen', x: -4.15, z: -6.05, rot: 0 },
      { uid: 'closet', item: 'closet', x: -8.6, z: -3.4, rot: H },
      { uid: 'brug', item: 'rugRound', x: -5.75, z: -2.6, rot: 0 },
      { uid: 'bedLight', item: 'globePendantGrey', x: -5.75, z: -3.4, rot: 0 },
      { uid: 'dresser', item: 'drawerChest', x: -3.15, z: -3.2, rot: -H },
      // bathroom
      { uid: 'tub', item: 'bathtub', x: -0.5, z: -5.85, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 0.92, z: -3.7, rot: -H },
      { uid: 'bsink', item: 'bathSink', x: -2.05, z: -3.4, rot: H },
      { uid: 'bathLight', item: 'flushLight', x: -0.5, z: -3.6, rot: 0 },
      // guest room / office
      { uid: 'desk', item: 'deskScreen', x: 6.2, z: -5.95, rot: 0 },
      { uid: 'guestBed', item: 'bedSingle', x: 2.3, z: -5.25, rot: 0 },
      { uid: 'gbooks', item: 'bookcase', x: 8.6, z: -3.4, rot: -H },
      { uid: 'gplant', item: 'snakePlant', x: 8.4, z: -1.6, rot: 0 },
      { uid: 'deskLamp', item: 'slimFloorLamp', x: 7.6, z: -6.1, rot: 0 },
      // kitchen: a galley along the right wall, an island, a breakfast nook
      { uid: 'stove', item: 'stove', x: 8.45, z: -0.25, rot: -H },
      { uid: 'fridge', item: 'fridge', x: 8.45, z: 0.75, rot: -H },
      { uid: 'ksink', item: 'kitchenSink', x: 8.45, z: 1.75, rot: -H },
      { uid: 'counter', item: 'counterMicrowave', x: 8.45, z: 2.65, rot: -H },
      { uid: 'counter2', item: 'counter', x: 8.45, z: 3.55, rot: -H },
      { uid: 'washer', item: 'washer', x: 8.5, z: 5.9, rot: -H },
      { uid: 'island', item: 'island', x: 5.6, z: 2.4, rot: 0 },
      { uid: 'islandLight', item: 'tripleCups', x: 5.6, z: 2.4, rot: 0 },
      { uid: 'nook', item: 'pedestalTable', x: 4.4, z: 5.4, rot: 0 },
      { uid: 'nookChair', item: 'diningChair', x: 5.3, z: 5.4, rot: -H },
      // living
      { uid: 'tv', item: 'tv', x: -8.65, z: 2.6, rot: H },
      { uid: 'sofa', item: 'midCenturySofa', x: -4.6, z: 2.6, rot: -H },
      { uid: 'coffee', item: 'glassTable', x: -6.6, z: 2.6, rot: H },
      { uid: 'rug', item: 'persianRug', x: -6.6, z: 2.6, rot: H },
      { uid: 'chair', item: 'clubChair', x: -6.6, z: 5.0, rot: PI },
      { uid: 'lamp', item: 'tripodLamp', x: -8.4, z: 5.8, rot: 0 },
      { uid: 'livingLight', item: 'sputnik', x: -6.4, z: 2.6, rot: 0 },
      { uid: 'dining', item: 'ovalDining', x: -0.6, z: 2.3, rot: 0 },
      { uid: 'dchair1', item: 'diningChair', x: -1.3, z: 1.45, rot: 0 },
      { uid: 'dchair2', item: 'diningChair', x: 0.1, z: 1.45, rot: 0 },
      { uid: 'dchair3', item: 'diningChair', x: -1.3, z: 3.15, rot: PI },
      { uid: 'dchair4', item: 'diningChair', x: 0.1, z: 3.15, rot: PI },
      { uid: 'diningLight', item: 'tulipChandelier', x: -0.6, z: 2.3, rot: 0 },
      { uid: 'flowers', item: 'flowerVase', x: -0.6, z: 2.3, rot: 0 },
      { uid: 'books', item: 'bookcaseWide', x: -7.4, z: -0.6, rot: 0 },
      { uid: 'art', item: 'galleryWall', x: -8.85, z: 5.3, rot: H },
      { uid: 'plant', item: 'monstera', x: -8.5, z: -0.3, rot: 0 },
      { uid: 'plant2', item: 'palmPot', x: 2.4, z: 6.0, rot: 0 },
      { uid: 'mat', item: 'doormat', x: 0, z: 6.0, rot: 0 },
    ],
  },
  {
    // THE BILLIONAIRE START (1 in 100): a full floor on Billionaires' Row
    // (bigger, 2026-10-27), Central Park out of floor-to-ceiling windows.
    // A great room with a fireplace and a baby grand, dining for six under
    // a crystal chandelier, a chef's kitchen, a primary suite, a marble spa
    // bath, a wood-panelled library and a guest suite. A private chef and a
    // housekeeper.
    id: 'penthouse',
    name: 'Billionaires’ Row penthouse',
    version: 2,
    width: 26,
    depth: 16,
    wallColor: '#f4f1ea',
    conditions: { housekeeper: true, doorman: true },
    zoomable: true,
    windows: { xs: [-11, -7.4, -2.5, 3, 7.6, 11.2], w: 3.0, h: 2.45, y: 1.4, view: 'park' },
    rooms: [
      { label: 'Great room', rect: [-13, -2, 3, 8], floor: '#d9c6a5', style: { floor: 'herringbone', wall: 'paint:#f4efe6' } },
      { label: 'Kitchen', rect: [3, -2, 13, 8], floor: '#efece6', style: { floor: 'marble', wall: 'paint:#f4f1ea' } },
      { label: 'Primary suite', rect: [-13, -8, -5, -2], floor: '#c7b8a6', style: { floor: 'herringbone', wall: 'panel:#2f4858' } },
      { label: 'Spa bathroom', rect: [-5, -8, 0, -2], floor: '#e7e2da', style: { floor: 'marble', wall: 'marbleWall' } },
      { label: 'Library', rect: [0, -8, 6, -2], floor: '#8b6b4f', style: { floor: 'walnut', wall: 'panel:#1b3a2f' } },
      { label: 'Guest bedroom', rect: [6, -8, 13, -2], floor: '#d9c7b0', style: { floor: 'carpet:#d9c7b0', wall: 'damask:#a3b18a' } },
    ],
    walls: [
      { a: [-13, -2], b: [13, -2], gaps: [[6.5, 7.7], [10.0, 11.2], [14.4, 15.6], [21.0, 22.2]] },
      { a: [-5, -8], b: [-5, -2] },
      { a: [0, -8], b: [0, -2] },
      { a: [6, -8], b: [6, -2] },
    ],
    furniture: [
      // primary suite
      { uid: 'bed', item: 'kingBed', x: -9.2, z: -6.5, rot: 0 },
      { uid: 'wardrobe', item: 'wardrobeWall', x: -12.45, z: -4.4, rot: H },
      { uid: 'night1', item: 'nightstandTwo', x: -11.0, z: -7.5, rot: 0 },
      { uid: 'night2', item: 'nightstandTwo', x: -7.4, z: -7.5, rot: 0 },
      { uid: 'nlamp1', item: 'urnLamp', x: -11.0, z: -7.5, rot: 0 },
      { uid: 'nlamp2', item: 'urnLamp', x: -7.4, z: -7.5, rot: 0 },
      { uid: 'suiteRug', item: 'shagRug', x: -9.2, z: -4.2, rot: 0 },
      { uid: 'suiteLight', item: 'sputnik', x: -9.2, z: -5.0, rot: 0 },
      { uid: 'suiteChair', item: 'pouf', x: -11.6, z: -2.8, rot: 0 },
      // spa bathroom
      { uid: 'tub', item: 'soakingTub', x: -2.6, z: -6.6, rot: 0 },
      { uid: 'vanity', item: 'doubleVanity', x: -4.55, z: -4.2, rot: H },
      { uid: 'toilet', item: 'luxToilet', x: -0.55, z: -4.4, rot: -H },
      { uid: 'shower', item: 'rainShower', x: -0.6, z: -7.3, rot: 0 },
      { uid: 'spaLight', item: 'globePendantGrey', x: -2.5, z: -4.5, rot: 0 },
      { uid: 'spaPlant', item: 'snakePlant', x: -0.6, z: -2.6, rot: 0 },
      // library
      { uid: 'desk', item: 'executiveDesk', x: 3.0, z: -6.9, rot: 0 },
      { uid: 'books', item: 'wallUnit', x: 5.65, z: -6.4, rot: -H },
      { uid: 'books2', item: 'whiteBookshelf', x: 5.7, z: -4.2, rot: -H },
      { uid: 'readChair', item: 'clubChair', x: 1.0, z: -3.4, rot: H },
      { uid: 'readLamp', item: 'tripodLamp', x: 0.6, z: -4.6, rot: 0 },
      { uid: 'libRug', item: 'persianRug', x: 3.0, z: -4.4, rot: 0 },
      { uid: 'libLight', item: 'tulipChandelier', x: 3.0, z: -4.8, rot: 0 },
      // guest bedroom
      { uid: 'guestBed', item: 'upholsteredKing', x: 9.5, z: -6.7, rot: 0 },
      { uid: 'gnight1', item: 'nightstandWood', x: 8.1, z: -7.55, rot: 0 },
      { uid: 'gnight2', item: 'nightstandWood', x: 10.9, z: -7.55, rot: 0 },
      { uid: 'gdresser', item: 'midDresser', x: 12.6, z: -4.2, rot: -H },
      { uid: 'gLight', item: 'paperLantern', x: 9.5, z: -5.0, rot: 0 },
      { uid: 'gplant', item: 'fernPot', x: 12.5, z: -2.7, rot: 0 },
      // great room: lounge by the fireplace
      { uid: 'tv', item: 'mediaWall', x: -9.5, z: -1.45, rot: 0 },
      { uid: 'sofa', item: 'velvetSectional', x: -9.8, z: 2.6, rot: PI },
      { uid: 'coffee', item: 'glassCoffeeSquare', x: -9.6, z: 0.9, rot: 0 },
      { uid: 'rug', item: 'persianRug', x: -9.6, z: 1.0, rot: 0 },
      { uid: 'fireplace', item: 'fireplace', x: -12.6, z: 5.2, rot: H },
      { uid: 'fireChair1', item: 'shellChair', x: -10.6, z: 4.5, rot: -H },
      { uid: 'fireChair2', item: 'shellChair', x: -10.6, z: 6.0, rot: -H },
      { uid: 'arc', item: 'arcLamp', x: -12.4, z: 2.4, rot: 0 },
      { uid: 'loungeLight', item: 'crystalChandelier', x: -9.6, z: 1.6, rot: 0 },
      { uid: 'art1', item: 'artShapes', x: -12.88, z: 0.6, rot: H },
      { uid: 'piano', item: 'grandPiano', x: -4.6, z: 6.0, rot: 0 },
      // great room: dining for six
      { uid: 'dining', item: 'ovalDining', x: -2.6, z: 1.6, rot: 0 },
      { uid: 'dc1', item: 'diningChair', x: -3.4, z: 0.75, rot: 0 },
      { uid: 'dc2', item: 'diningChair', x: -2.6, z: 0.75, rot: 0 },
      { uid: 'dc3', item: 'diningChair', x: -1.8, z: 0.75, rot: 0 },
      { uid: 'dc4', item: 'diningChair', x: -3.4, z: 2.45, rot: PI },
      { uid: 'dc5', item: 'diningChair', x: -2.6, z: 2.45, rot: PI },
      { uid: 'dc6', item: 'diningChair', x: -1.8, z: 2.45, rot: PI },
      { uid: 'diningLight', item: 'crystalChandelier', x: -2.6, z: 1.6, rot: 0 },
      { uid: 'flowers', item: 'flowerVase', x: -2.6, z: 1.6, rot: 0 },
      { uid: 'fig1', item: 'fiddleFig', x: -12.3, z: 7.3, rot: 0 },
      { uid: 'fig2', item: 'oliveTree', x: 2.3, z: 7.3, rot: 0 },
      { uid: 'col1', item: 'columnTall', x: -6.4, z: -1.3, rot: 0 },
      { uid: 'col2', item: 'columnTall', x: 2.4, z: -1.3, rot: 0 },
      // kitchen
      { uid: 'range', item: 'chefRange', x: 12.45, z: 1.2, rot: -H },
      { uid: 'fridge', item: 'chefFridge', x: 12.4, z: -0.9, rot: -H },
      { uid: 'kc1', item: 'cabinetDrawers', x: 12.6, z: 2.6, rot: -H },
      { uid: 'kc2', item: 'sinkCabinet', x: 12.6, z: 3.2, rot: -H },
      { uid: 'kc3', item: 'cabinetDoor', x: 12.6, z: 3.8, rot: -H },
      { uid: 'kc4', item: 'cabinetTwo', x: 12.6, z: 4.4, rot: -H },
      { uid: 'island', item: 'marbleIsland', x: 8.6, z: 2.0, rot: H },
      { uid: 'stool1', item: 'barStool', x: 7.1, z: 1.2, rot: H },
      { uid: 'stool2', item: 'barStool', x: 7.1, z: 2.0, rot: H },
      { uid: 'stool3', item: 'barStool', x: 7.1, z: 2.8, rot: H },
      { uid: 'islandLight', item: 'edisonCluster', x: 8.6, z: 2.0, rot: 0 },
      { uid: 'coffeeMk', item: 'coffeeMaker', x: 12.6, z: 2.6, rot: -H },
      { uid: 'nook', item: 'pedestalTable', x: 9.6, z: 6.3, rot: 0 },
      { uid: 'nookC1', item: 'diningChair', x: 8.7, z: 6.3, rot: H },
      { uid: 'nookC2', item: 'diningChair', x: 10.5, z: 6.3, rot: -H },
      { uid: 'kplant', item: 'monstera', x: 12.5, z: 7.4, rot: 0 },
      { uid: 'lamp', item: 'floorLamp', x: 4.0, z: 7.4, rot: 0 },
      { uid: 'mat', item: 'doormat', x: 0, z: 7.5, rot: 0 },
    ],
  },
);

/** Which floor plan each home place uses. */
export const HOME_LAYOUT_FOR: Record<string, string> = { hkStudio: 'studio', wburgLoft: 'loft', sharedApt: 'harlemWalkup', shelter: 'shelter', uesApt: 'uesTwoBed', penthouse: 'penthouse' };

export function layoutForPlace(placeId: string): HomeLayout {
  return HOME_LAYOUTS.get(HOME_LAYOUT_FOR[placeId]) ?? HOME_LAYOUTS.require('studio');
}
