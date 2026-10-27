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
      { label: 'Your room', rect: [-3.8, -5.5, 3.8, -1.6], floor: '#a9784e', style: { floor: 'oak', wall: 'paint:#e8dcc4' } },
      { label: 'Living', rect: [-3.8, -1.6, 3.8, 2.6], floor: '#c09068', style: { floor: 'vinyl', wall: 'paint:#e3d6bb' } },
      { label: 'Kitchen', rect: [-3.8, -1.6, -2.75, 2.6], floor: '#e7e0cf', style: { floor: 'checker', wall: 'paint:#e3d6bb' } },
      { label: 'Hall', rect: [-3.8, 2.6, 1.2, 5.5], floor: '#b98a5f', style: { floor: 'oak', wall: 'paint:#e3d6bb' } },
      { label: 'Bathroom', rect: [1.2, 2.6, 3.8, 5.5], floor: '#bfe0e6', style: { floor: 'hex:#dfe7e6', wall: 'subway:#e9efe9' } },
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
      { label: 'Living', rect: [-6, -4.5, 6, 4.5], floor: '#c8935f', style: { floor: 'oak', wall: 'paint:#f3e3cc' } },
      { label: 'Kitchen', rect: [-6, -4.5, -1.6, -2.4], floor: '#e9e4d8', style: { floor: 'tile:#e9e4d8', wall: 'subway:#f4f4f2' } },
      { label: 'Bathroom', rect: [3, -4.5, 6, -1], floor: '#bfe3e8', style: { floor: 'hex:#dfe7e6', wall: 'subway:#ffffff' } },
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
    // The city shelter: a dorm of single beds, lockers, a shared table
    // and a bathroom. Where you land after bankruptcy (sim/debt.ts).
    id: 'shelter',
    name: 'Shelter dorm',
    width: 12,
    depth: 9,
    wallColor: '#dfe6ee',
    rooms: [
      { label: 'Dorm', rect: [-6, -4.5, 2.5, 4.5], floor: '#b9c4cf', style: { floor: 'vinyl', wall: 'paint:#dfe6ee' } },
      { label: 'Washroom', rect: [2.5, -4.5, 6, 0], floor: '#c4e2e6', style: { floor: 'tile:#d6dde3', wall: 'subway:#e9eef2' } },
      { label: 'Common', rect: [2.5, 0, 6, 4.5], floor: '#cfc6b8', style: { floor: 'vinyl', wall: 'paint:#dfe6ee' } },
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
    // THE RICH START (about 1 in 11), v3 (Peter, 2026-10-27: "this is what
    // the rich should look like" — Lagos Life houses): a big L-shaped
    // Upper East Side duplex floor. Ten rooms: a primary suite with its
    // own marble bath, two more bedrooms, a second bath, a study, a home
    // cinema, an open living / dining / kitchen with a fireplace. Packed
    // with furniture and lit in layers (ceiling, lamps, accents).
    id: 'uesTwoBed',
    name: 'Upper East Side residence',
    version: 3,
    shaped: true,
    door: { x: 2.5, z: 3 },
    width: 30,
    depth: 22,
    wallColor: '#eef1f4',
    conditions: { doorman: true },
    zoomable: true,
    windows: { xs: [1], w: 1.7, h: 1.8, y: 1.6, view: 'sky' },
    rooms: [
      { label: 'Living room', rect: [-15, -4, -1, 3], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'paint:#ece6dc' } },
      { label: 'Dining room', rect: [-1, -4, 4, 3], floor: '#b98a5e', style: { floor: 'herringbone', wall: 'panel:#2f4858' } },
      { label: 'Kitchen', rect: [4, -4, 9, 3], floor: '#e8e6e1', style: { floor: 'marble', wall: 'subway:#f4f4f2' } },
      { label: 'Primary bedroom', rect: [-15, -11, -6, -4], floor: '#a8b5c8', style: { floor: 'oak', wall: 'damask:#5e1f2b' } },
      { label: 'Primary bathroom', rect: [-6, -11, -2, -4], floor: '#d5ecef', style: { floor: 'marble', wall: 'marbleWall' } },
      { label: 'Second bedroom', rect: [-2, -11, 4, -4], floor: '#c9b8a0', style: { floor: 'ash', wall: 'paint:#cfdbe3' } },
      { label: 'Bathroom', rect: [4, -11, 9, -4], floor: '#d5ecef', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
      { label: 'Home cinema', rect: [9, -11, 15, -1], floor: '#3b3b3f', style: { floor: 'carpet:#1d1f24', wall: 'acoustic:#2b2d42' } },
      { label: 'Guest bedroom', rect: [-15, 3, -10, 11], floor: '#c9b8a0', style: { floor: 'carpet:#d9c7b0', wall: 'paint:#d7e3c3' } },
      { label: 'Study', rect: [-10, 3, -5, 11], floor: '#8b6b4f', style: { floor: 'walnut', wall: 'woodPanel' } },
    ],
    walls: [
      { a: [-15, -4], b: [9, -4], gaps: [[5.0, 6.1], [15.0, 16.1]] },
      { a: [-6, -11], b: [-6, -4], gaps: [[4.5, 5.6]] },
      { a: [-2, -11], b: [-2, -4] },
      { a: [4, -11], b: [4, -4], gaps: [[4.5, 5.6]] },
      { a: [9, -11], b: [9, -1], gaps: [[8.8, 9.8]] },
      { a: [-15, 3], b: [-5, 3], gaps: [[2.5, 3.6], [7.0, 8.1]] },
      { a: [-10, 3], b: [-10, 11] },
    ],
    furniture: [
      // primary bedroom
      { uid: 'bed', item: 'upholsteredKing', x: -10.5, z: -9.66, rot: 0, a: '#e8d8c3', b: '#3b2a20' },
      { uid: 'night', item: 'nightstandTwo', x: -12.1, z: -10.55, rot: 0 },
      { uid: 'night2', item: 'nightstandTwo', x: -8.9, z: -10.55, rot: 0 },
      { uid: 'nlamp1', item: 'urnLamp', x: -12.1, z: -10.55, rot: 0 },
      { uid: 'nlamp2', item: 'urnLamp', x: -8.9, z: -10.55, rot: 0 },
      { uid: 'brug', item: 'persianRug', x: -10.5, z: -7.4, rot: 0 },
      { uid: 'closet', item: 'wardrobeWall', x: -14.45, z: -7.4, rot: H },
      { uid: 'dresser', item: 'midDresser', x: -6.42, z: -8.6, rot: -H },
      { uid: 'pouf', item: 'pouf', x: -7.6, z: -5.2, rot: 0, a: '#c9a24a' },
      { uid: 'bedLight', item: 'sputnik', x: -10.5, z: -7.4, rot: 0 },
      { uid: 'bedArt', item: 'artShapes', x: -10.5, z: -10.83, rot: 0, a: '#c9a24a' },
      { uid: 'bplant', item: 'fiddleFig', x: -14.4, z: -4.6, rot: 0 },
      // primary bathroom
      { uid: 'tub', item: 'freestandingTub', x: -2.6, z: -9.8, rot: 0 },
      { uid: 'shower', item: 'rainShower', x: -5.4, z: -10.35, rot: 0 },
      { uid: 'toilet', item: 'toiletWall', x: -5.45, z: -7.6, rot: H },
      { uid: 'bsink', item: 'vanity', x: -2.45, z: -6.2, rot: -H },
      { uid: 'bathLight', item: 'globePendantGrey', x: -4.0, z: -7.6, rot: 0 },
      { uid: 'bathPlant', item: 'snakePlant', x: -2.55, z: -4.55, rot: 0 },
      // second bedroom
      { uid: 'bed2', item: 'bedDouble', x: 1.0, z: -9.72, rot: 0, a: '#4f86a6' },
      { uid: 'b2night', item: 'nightstandWood', x: -0.45, z: -10.55, rot: 0 },
      { uid: 'b2night2', item: 'nightstandWood', x: 2.45, z: -10.55, rot: 0 },
      { uid: 'b2lamp', item: 'ceramicLamp', x: -0.45, z: -10.55, rot: 0 },
      { uid: 'b2rug', item: 'shagRug', x: 1.0, z: -6.9, rot: 0 },
      { uid: 'b2desk', item: 'desk', x: 3.2, z: -4.95, rot: -H },
      { uid: 'b2closet', item: 'closet', x: 3.6, z: -9.3, rot: -H },
      { uid: 'b2light', item: 'paperLantern', x: 1.0, z: -7.4, rot: 0 },
      { uid: 'b2art', item: 'artTriptych', x: 1.0, z: -10.83, rot: 0 },
      // bathroom
      { uid: 'tub2', item: 'bathtub', x: 6.5, z: -10.3, rot: 0 },
      { uid: 'toilet2', item: 'toiletClassic', x: 8.45, z: -8.0, rot: -H },
      { uid: 'bsink2', item: 'basin', x: 4.6, z: -7.6, rot: H },
      { uid: 'washer', item: 'washerStack', x: 8.45, z: -5.0, rot: -H },
      { uid: 'bath2Light', item: 'flushLight', x: 6.5, z: -7.5, rot: 0 },
      // home cinema
      { uid: 'tv', item: 'wallTv', x: 14.83, z: -6.0, rot: -H },
      { uid: 'cinemaSofa', item: 'sectionalL', x: 11.6, z: -6.0, rot: H, a: '#5e1f2b' },
      { uid: 'recliner1', item: 'recliner', x: 9.9, z: -9.3, rot: H },
      { uid: 'recliner2', item: 'recliner', x: 9.9, z: -2.9, rot: H },
      { uid: 'cinemaRug', item: 'squareRug', x: 13.2, z: -6.0, rot: 0 },
      { uid: 'spk1', item: 'speaker', x: 14.6, z: -8.2, rot: -H },
      { uid: 'spk2', item: 'speaker', x: 14.6, z: -3.8, rot: -H },
      { uid: 'arcade', item: 'cabSnake', x: 13.6, z: -10.4, rot: 0 },
      { uid: 'cinemaLed', item: 'ledStripLow', x: 14.86, z: -6.0, rot: -H, lc: '#9b5cff' },
      { uid: 'cinemaLed2', item: 'ledStrip', x: 12.0, z: -10.83, rot: 0, lc: '#3d8bff' },
      { uid: 'cinemaNeon', item: 'neonBolt', x: 10.6, z: -10.86, rot: 0, lc: '#ff4fb8' },
      { uid: 'cinemaSpot', item: 'spotLight', x: 12, z: -6, rot: 0, lc: '#9b5cff' },
      // living room
      { uid: 'livingTv', item: 'tvConsole', x: -14.62, z: -0.5, rot: H },
      { uid: 'sofa', item: 'loungeSectional', x: -10.6, z: -0.5, rot: -H, a: '#a39887' },
      { uid: 'coffee', item: 'glassCoffeeSquare', x: -12.6, z: -0.5, rot: 0 },
      { uid: 'rug', item: 'persianRug', x: -12.6, z: -0.5, rot: H, a: '#1f3b4d', b: '#c47f2c' },
      { uid: 'chair1', item: 'clubChair', x: -12.6, z: 1.6, rot: PI },
      { uid: 'chair2', item: 'clubChair', x: -12.6, z: -3.2, rot: 0 },
      { uid: 'arc', item: 'arcLamp', x: -9.2, z: 0.9, rot: 0 },
      { uid: 'livingLight', item: 'crystalChandelier', x: -12.4, z: -0.5, rot: 0 },
      { uid: 'fireplace', item: 'fireplace', x: -6.6, z: -3.55, rot: 0 },
      { uid: 'fireChair1', item: 'shellChair', x: -7.4, z: -1.5, rot: PI, a: '#2f4f3a' },
      { uid: 'fireChair2', item: 'shellChair', x: -5.6, z: -1.5, rot: PI, a: '#2f4f3a' },
      { uid: 'fireRug', item: 'hideRug', x: -6.5, z: -2.3, rot: 0 },
      { uid: 'shelves', item: 'wallUnit', x: -3.2, z: -3.7, rot: 0 },
      { uid: 'livingPlant', item: 'monstera', x: -14.5, z: 2.6, rot: 0 },
      { uid: 'livingTree', item: 'oliveTree', x: -5.4, z: 2.4, rot: 0 },
      { uid: 'gallery', item: 'galleryWall', x: -14.86, z: 2.1, rot: H },
      { uid: 'books', item: 'bookStack', x: -12.6, z: -0.5, rot: 0 },
      // dining room
      { uid: 'dining', item: 'ovalDining', x: 1.5, z: -0.6, rot: H },
      { uid: 'dc1', item: 'diningChair', x: 0.35, z: -1.4, rot: H },
      { uid: 'dc2', item: 'diningChair', x: 0.35, z: -0.6, rot: H },
      { uid: 'dc3', item: 'diningChair', x: 0.35, z: 0.2, rot: H },
      { uid: 'dc4', item: 'diningChair', x: 2.65, z: -1.4, rot: -H },
      { uid: 'dc5', item: 'diningChair', x: 2.65, z: -0.6, rot: -H },
      { uid: 'dc6', item: 'diningChair', x: 2.65, z: 0.2, rot: -H },
      { uid: 'diningLight', item: 'tulipChandelier', x: 1.5, z: -0.6, rot: 0 },
      { uid: 'flowers', item: 'flowerVase', x: 1.5, z: -0.6, rot: 0 },
      { uid: 'sideboard', item: 'sideboard', x: 2.6, z: -3.6, rot: 0 },
      { uid: 'candles', item: 'candles', x: 2.6, z: -3.6, rot: 0 },
      { uid: 'mat', item: 'doormat', x: 2.5, z: 2.6, rot: 0 },
      // kitchen
      { uid: 'stove', item: 'stove', x: 4.55, z: -3.45, rot: 0 },
      { uid: 'ksink', item: 'kitchenSink', x: 5.41, z: -3.45, rot: 0 },
      { uid: 'counter', item: 'counter', x: 6.27, z: -3.45, rot: 0 },
      { uid: 'counter2', item: 'counterMicrowave', x: 7.13, z: -3.45, rot: 0 },
      { uid: 'fridge', item: 'doubleFridge', x: 8.3, z: -3.5, rot: 0 },
      { uid: 'island', item: 'island', x: 6.3, z: -0.8, rot: 0 },
      { uid: 'islandLight', item: 'edisonCluster', x: 6.3, z: -1.0, rot: 0 },
      { uid: 'nook', item: 'pedestalTable', x: 7.7, z: 1.9, rot: 0 },
      { uid: 'nookChair', item: 'diningChair', x: 6.6, z: 1.9, rot: H },
      { uid: 'kplant', item: 'palmPot', x: 8.5, z: 0.4, rot: 0 },
      { uid: 'coffeeMk', item: 'coffeeMaker', x: 6.27, z: -3.45, rot: 0 },
      // guest bedroom
      { uid: 'guestBed', item: 'bedDouble', x: -12.5, z: 9.77, rot: PI, a: '#a3b18a' },
      { uid: 'gnight1', item: 'nightstandOpen', x: -14.2, z: 10.5, rot: PI },
      { uid: 'gnight2', item: 'nightstandOpen', x: -10.8, z: 10.5, rot: PI },
      { uid: 'glamp', item: 'mushroomLamp', x: -14.2, z: 10.5, rot: 0 },
      { uid: 'grug', item: 'roundFringed', x: -12.5, z: 6.6, rot: 0 },
      { uid: 'gcloset', item: 'closet', x: -14.65, z: 5.2, rot: H },
      { uid: 'gLight', item: 'globePendantGrey', x: -12.5, z: 7.4, rot: 0 },
      { uid: 'gplant', item: 'hangingPlant', x: -10.8, z: 4.2, rot: 0 },
      // study
      { uid: 'sdesk', item: 'deskScreen', x: -7.5, z: 10.3, rot: PI },
      { uid: 'sbooks', item: 'whiteBookshelf', x: -5.27, z: 6.0, rot: -H },
      { uid: 'sbooks2', item: 'wallUnit', x: -5.29, z: 8.6, rot: -H },
      { uid: 'schair', item: 'clubChair', x: -8.9, z: 5.6, rot: H },
      { uid: 'slamp', item: 'tripodLamp', x: -9.4, z: 4.0, rot: 0 },
      { uid: 'srug', item: 'runnerRug', x: -7.4, z: 6.6, rot: 0 },
      { uid: 'sLight', item: 'bellPendant', x: -7.5, z: 9.4, rot: 0 },
    ],
  },
  {
    // THE BILLIONAIRE START (1 in 100), v3 (Peter, 2026-10-27: "billionaire
    // should look even better"): a U-shaped mansion floor on Billionaires'
    // Row, Central Park out of every window. A back wing of suites (the
    // primary with a black-marble spa, a library, a guest suite with its
    // own bath, a gym), a great room with a fireplace and a baby grand, a
    // glowing indoor pool, a chef's kitchen, and two front wings: a home
    // cinema and a dining hall for twelve.
    id: 'penthouse',
    name: 'Billionaires’ Row mansion',
    version: 3,
    shaped: true,
    door: { x: -7, z: 5 },
    width: 40,
    depth: 28,
    wallColor: '#f4f1ea',
    conditions: { housekeeper: true, doorman: true },
    zoomable: true,
    windows: { xs: [1], w: 2.6, h: 2.3, y: 1.45, view: 'park' },
    rooms: [
      { label: 'Great room', rect: [-20, -5, -4, 5], floor: '#1c1c20', style: { floor: 'marbleBlack', wall: 'paint:#f4efe6' } },
      { label: 'Pool hall', rect: [-4, -5, 9, 5], floor: '#efece6', style: { floor: 'marble', wall: 'marbleWall' } },
      { label: 'Kitchen', rect: [9, -5, 20, 5], floor: '#efece6', style: { floor: 'checker', wall: 'subway:#f4f4f2' } },
      { label: 'Primary suite', rect: [-20, -14, -9, -5], floor: '#c7b8a6', style: { floor: 'herringbone', wall: 'velvet:#1b3a2f' } },
      { label: 'Spa bathroom', rect: [-9, -14, -3, -5], floor: '#1c1c20', style: { floor: 'marbleBlack', wall: 'marbleWall' } },
      { label: 'Library', rect: [-3, -14, 4, -5], floor: '#8b6b4f', style: { floor: 'walnut', wall: 'woodPanel' } },
      { label: 'Guest bedroom', rect: [4, -14, 12, -5], floor: '#d9c7b0', style: { floor: 'carpet:#d9c7b0', wall: 'damask:#a3b18a' } },
      { label: 'Guest bathroom', rect: [12, -14, 16, -5], floor: '#e7e2da', style: { floor: 'hex:#e9ecef', wall: 'subway:#ffffff' } },
      { label: 'Gym', rect: [16, -14, 20, -5], floor: '#3d3f4f', style: { floor: 'rubber', wall: 'concreteWall' } },
      { label: 'Cinema', rect: [-20, 5, -10, 14], floor: '#1d1f24', style: { floor: 'carpet:#1d1f24', wall: 'velvet:#5e1f2b' } },
      { label: 'Dining hall', rect: [10, 5, 20, 14], floor: '#d9c6a5', style: { floor: 'herringbone', wall: 'geo:#1f3b4d' } },
    ],
    walls: [
      { a: [-20, -5], b: [20, -5], gaps: [[8.0, 9.1], [20.0, 21.1], [27.0, 28.1], [37.0, 38.1]] },
      { a: [-9, -14], b: [-9, -5], gaps: [[6.0, 7.1]] },
      { a: [-3, -14], b: [-3, -5] },
      { a: [4, -14], b: [4, -5] },
      { a: [12, -14], b: [12, -5], gaps: [[6.0, 7.1]] },
      { a: [16, -14], b: [16, -5] },
      { a: [-4, -5], b: [-4, 5], gaps: [[3.0, 7.0]] },
      { a: [9, -5], b: [9, 5], gaps: [[3.5, 6.5]] },
      { a: [-20, 5], b: [-10, 5], gaps: [[4.0, 5.1]] },
      { a: [10, 5], b: [20, 5], gaps: [[3.0, 5.0]] },
    ],
    furniture: [
      // primary suite
      { uid: 'bed', item: 'kingBed', x: -14.5, z: -12.5, rot: 0 },
      { uid: 'night1', item: 'nightstandTwo', x: -16.7, z: -13.55, rot: 0 },
      { uid: 'night2', item: 'nightstandTwo', x: -12.3, z: -13.55, rot: 0 },
      { uid: 'nlamp1', item: 'urnLamp', x: -16.7, z: -13.55, rot: 0 },
      { uid: 'nlamp2', item: 'urnLamp', x: -12.3, z: -13.55, rot: 0 },
      { uid: 'wardrobe', item: 'wardrobeWall', x: -19.45, z: -9.5, rot: H },
      { uid: 'suiteRug', item: 'shagRug', x: -14.5, z: -9.6, rot: 0 },
      { uid: 'suiteBench', item: 'pouf', x: -14.5, z: -10.4, rot: 0, a: '#c9a24a' },
      { uid: 'suiteChair1', item: 'clubChair', x: -10.0, z: -7.3, rot: -H, a: '#1b3a2f' },
      { uid: 'suiteChair2', item: 'clubChair', x: -10.0, z: -9.0, rot: -H, a: '#1b3a2f' },
      { uid: 'suiteDresser', item: 'midDresser', x: -17.0, z: -5.42, rot: PI },
      { uid: 'suiteLight', item: 'crystalChandelier', x: -14.5, z: -9.5, rot: 0 },
      { uid: 'suiteArt', item: 'artTriptych', x: -14.5, z: -13.83, rot: 0, a: '#c9a24a' },
      { uid: 'suitePlant', item: 'fiddleFig', x: -19.4, z: -13.4, rot: 0 },
      // spa bathroom
      { uid: 'tub', item: 'soakingTub', x: -6.0, z: -12.6, rot: 0 },
      { uid: 'vanity', item: 'doubleVanity', x: -3.45, z: -9.0, rot: -H },
      { uid: 'shower', item: 'rainShower', x: -8.4, z: -13.35, rot: 0 },
      { uid: 'toilet', item: 'luxToilet', x: -8.35, z: -5.9, rot: H },
      { uid: 'spaLight', item: 'globePendantGrey', x: -6.0, z: -9.5, rot: 0 },
      { uid: 'spaPlant', item: 'snakePlant', x: -3.5, z: -5.6, rot: 0 },
      { uid: 'spaCandles', item: 'candles', x: -4.2, z: -13.3, rot: 0 },
      // library
      { uid: 'desk', item: 'executiveDesk', x: 0.5, z: -12.9, rot: 0 },
      { uid: 'lib1', item: 'wallUnit', x: -2.7, z: -11.6, rot: H },
      { uid: 'lib2', item: 'whiteBookshelf', x: -2.73, z: -9.3, rot: H },
      { uid: 'lib3', item: 'wallUnit', x: 3.7, z: -11.6, rot: -H },
      { uid: 'lib4', item: 'whiteBookshelf', x: 3.73, z: -9.3, rot: -H },
      { uid: 'readChair1', item: 'clubChair', x: -0.9, z: -7.6, rot: H },
      { uid: 'readChair2', item: 'clubChair', x: 2.3, z: -7.6, rot: -H },
      { uid: 'readTable', item: 'pedestalTable', x: 0.7, z: -7.6, rot: 0 },
      { uid: 'libRug', item: 'persianRug', x: 0.7, z: -8.4, rot: 0 },
      { uid: 'libLight', item: 'tulipChandelier', x: 0.7, z: -9.5, rot: 0 },
      { uid: 'libLamp', item: 'tripodLamp', x: -2.4, z: -6.0, rot: 0 },
      // guest bedroom
      { uid: 'guestBed', item: 'upholsteredKing', x: 8.0, z: -12.71, rot: 0, a: '#e8d8c3' },
      { uid: 'gnight1', item: 'nightstandWood', x: 6.45, z: -13.55, rot: 0 },
      { uid: 'gnight2', item: 'nightstandWood', x: 9.55, z: -13.55, rot: 0 },
      { uid: 'glamp', item: 'ceramicLamp', x: 6.45, z: -13.55, rot: 0 },
      { uid: 'gdesk', item: 'desk', x: 11.2, z: -10.6, rot: -H },
      { uid: 'gchair', item: 'shellChair', x: 5.0, z: -6.4, rot: H, a: '#c47f2c' },
      { uid: 'grug', item: 'roundFringed', x: 8.0, z: -9.6, rot: 0 },
      { uid: 'gLight', item: 'sputnik', x: 8.0, z: -9.5, rot: 0 },
      { uid: 'gArt', item: 'artSkyline', x: 8.0, z: -13.83, rot: 0 },
      // guest bathroom
      { uid: 'gtub', item: 'bathtub', x: 15.3, z: -11.5, rot: H },
      { uid: 'gtoilet', item: 'toiletClassic', x: 12.62, z: -13.3, rot: 0 },
      { uid: 'gbasin', item: 'basin', x: 12.36, z: -10.6, rot: H },
      { uid: 'gbLight', item: 'flushLight', x: 14.0, z: -9.5, rot: 0 },
      // gym
      { uid: 'tread1', item: 'treadmill', x: 17.2, z: -12.9, rot: 0 },
      { uid: 'tread2', item: 'treadmill', x: 18.8, z: -12.9, rot: 0 },
      { uid: 'bench', item: 'benchPress', x: 18.0, z: -9.6, rot: 0 },
      { uid: 'weights', item: 'dumbbellRack', x: 19.55, z: -6.6, rot: -H },
      { uid: 'bag', item: 'punchingBag', x: 16.9, z: -6.4, rot: 0 },
      { uid: 'gymMirror', item: 'mirrorArch', x: 19.86, z: -10.6, rot: -H },
      { uid: 'gymLight', item: 'flushLight2', x: 18.0, z: -9.5, rot: 0 },
      // great room
      { uid: 'tv', item: 'mediaWall', x: -15.0, z: -4.45, rot: 0 },
      { uid: 'sofa', item: 'velvetSectional', x: -15.2, z: -0.3, rot: PI },
      { uid: 'coffee', item: 'glassCoffeeSquare', x: -15.0, z: -2.3, rot: 0 },
      { uid: 'rug', item: 'persianRug', x: -15.0, z: -2.2, rot: 0, a: '#5e1f2b', b: '#c9a24a' },
      { uid: 'loungeLight', item: 'crystalChandelier', x: -15.0, z: -1.5, rot: 0 },
      { uid: 'arc', item: 'arcLamp', x: -19.3, z: -1.6, rot: 0 },
      { uid: 'fireplace', item: 'fireplace', x: -19.6, z: 2.9, rot: H },
      { uid: 'fireChair1', item: 'shellChair', x: -17.4, z: 2.0, rot: -H, a: '#5e1f2b' },
      { uid: 'fireChair2', item: 'shellChair', x: -17.4, z: 3.9, rot: -H, a: '#5e1f2b' },
      { uid: 'piano', item: 'grandPiano', x: -8.6, z: 1.8, rot: 0 },
      { uid: 'sideboard', item: 'sideboard', x: -9.0, z: -4.62, rot: 0 },
      { uid: 'sideCandles', item: 'candles', x: -9.0, z: -4.62, rot: 0 },
      { uid: 'greatLight', item: 'sputnik', x: -8.6, z: 0, rot: 0 },
      { uid: 'greatTree', item: 'oliveTree', x: -19.3, z: 4.3, rot: 0 },
      { uid: 'greatFig', item: 'fiddleFig', x: -4.8, z: -4.3, rot: 0 },
      { uid: 'greatArt', item: 'galleryWall', x: -19.86, z: -2.8, rot: H },
      // pool hall
      { uid: 'pool', item: 'pool', x: 2.5, z: -0.3, rot: 0 },
      { uid: 'lounger1', item: 'lounger', x: -0.6, z: 3.4, rot: PI },
      { uid: 'lounger2', item: 'lounger', x: 1.4, z: 3.4, rot: PI },
      { uid: 'lounger3', item: 'lounger', x: 3.6, z: 3.4, rot: PI },
      { uid: 'lounger4', item: 'lounger', x: 5.6, z: 3.4, rot: PI },
      { uid: 'palm1', item: 'palmPot', x: -3.3, z: -4.3, rot: 0 },
      { uid: 'palm2', item: 'palmPot', x: 8.3, z: -4.3, rot: 0 },
      { uid: 'palm3', item: 'palmPot', x: 8.3, z: 4.3, rot: 0 },
      { uid: 'col1', item: 'columnTall', x: -1.0, z: -4.3, rot: 0 },
      { uid: 'col2', item: 'columnTall', x: 6.0, z: -4.3, rot: 0 },
      { uid: 'poolLight', item: 'ringPendant', x: 2.5, z: -0.3, rot: 0, lc: '#22d3ee' },
      // kitchen
      { uid: 'range', item: 'chefRange', x: 19.45, z: -1.0, rot: -H },
      { uid: 'hood', item: 'rangeHood', x: 19.6, z: -1.0, rot: -H },
      { uid: 'fridge', item: 'chefFridge', x: 19.4, z: -3.4, rot: -H },
      { uid: 'kc1', item: 'cabinetDrawers', x: 19.58, z: 0.7, rot: -H },
      { uid: 'kc2', item: 'sinkCabinet', x: 19.58, z: 1.3, rot: -H },
      { uid: 'kc3', item: 'cabinetDoor', x: 19.58, z: 1.9, rot: -H },
      { uid: 'kc4', item: 'cabinetTwo', x: 19.58, z: 2.5, rot: -H },
      { uid: 'coffeeMk', item: 'coffeeMaker', x: 19.58, z: 0.7, rot: -H },
      { uid: 'island', item: 'marbleIsland', x: 15.0, z: 0.0, rot: H },
      { uid: 'stool1', item: 'barStool', x: 13.4, z: -0.8, rot: H },
      { uid: 'stool2', item: 'barStool', x: 13.4, z: 0.0, rot: H },
      { uid: 'stool3', item: 'barStool', x: 13.4, z: 0.8, rot: H },
      { uid: 'islandLight', item: 'edisonCluster', x: 15.0, z: 0.0, rot: 0 },
      { uid: 'nook', item: 'pedestalTable', x: 11.2, z: 3.6, rot: 0 },
      { uid: 'nookC1', item: 'diningChair', x: 10.2, z: 3.6, rot: H },
      { uid: 'nookC2', item: 'diningChair', x: 12.2, z: 3.6, rot: -H },
      { uid: 'kplant', item: 'monstera', x: 19.4, z: 4.4, rot: 0 },
      // cinema
      { uid: 'cinemaTv', item: 'wallTv', x: -19.83, z: 9.5, rot: H },
      { uid: 'cinemaSofa', item: 'sectionalL', x: -16.5, z: 9.5, rot: -H, a: '#5e1f2b' },
      { uid: 'rec1', item: 'recliner', x: -13.3, z: 8.1, rot: -H },
      { uid: 'rec2', item: 'recliner', x: -13.3, z: 9.5, rot: -H },
      { uid: 'rec3', item: 'recliner', x: -13.3, z: 10.9, rot: -H },
      { uid: 'cinemaRug', item: 'squareRug', x: -18.0, z: 9.5, rot: 0 },
      { uid: 'cinemaLed', item: 'ledStrip', x: -19.86, z: 12.2, rot: H, lc: '#9b5cff' },
      { uid: 'cinemaNeon', item: 'neonHeart', x: -19.86, z: 6.6, rot: H, lc: '#ff4fb8' },
      { uid: 'arcade', item: 'cabBeats', x: -10.7, z: 13.2, rot: -H },
      { uid: 'cinemaSpot', item: 'spotLight', x: -16.5, z: 9.5, rot: 0, lc: '#9b5cff' },
      // dining hall
      { uid: 'table1', item: 'ovalDining', x: 13.8, z: 9.5, rot: 0 },
      { uid: 'table2', item: 'ovalDining', x: 16.2, z: 9.5, rot: 0 },
      ...[12.9, 13.8, 14.7, 15.3, 16.2, 17.1].flatMap((x, i) => [
        { uid: `dcA${i}`, item: 'diningChair', x, z: 8.55, rot: 0, a: '#1f3b4d', b: '#1d1f24' },
        { uid: `dcB${i}`, item: 'diningChair', x, z: 10.45, rot: PI, a: '#1f3b4d', b: '#1d1f24' },
      ]),
      { uid: 'dLight1', item: 'crystalChandelier', x: 13.8, z: 9.5, rot: 0 },
      { uid: 'dLight2', item: 'crystalChandelier', x: 16.2, z: 9.5, rot: 0 },
      { uid: 'flowers1', item: 'flowerVase', x: 13.8, z: 9.5, rot: 0 },
      { uid: 'flowers2', item: 'flowerVase', x: 16.2, z: 9.5, rot: 0 },
      { uid: 'dSideboard', item: 'sideboard', x: 19.62, z: 9.5, rot: -H },
      { uid: 'dCandles', item: 'candles', x: 19.62, z: 9.5, rot: 0 },
      { uid: 'dArt', item: 'artShapes', x: 19.86, z: 12.6, rot: -H, a: '#c9a24a' },
      { uid: 'dGallery', item: 'galleryWall', x: 10.14, z: 11.0, rot: H },
      { uid: 'dPlant1', item: 'monstera', x: 19.4, z: 13.4, rot: 0 },
      { uid: 'dPlant2', item: 'monstera', x: 10.6, z: 13.4, rot: 0 },
      { uid: 'mat', item: 'doormat', x: -7, z: 4.6, rot: 0 },
    ],
  },
);

/** Which floor plan each home place uses. */
export const HOME_LAYOUT_FOR: Record<string, string> = { hkStudio: 'studio', wburgLoft: 'loft', sharedApt: 'harlemWalkup', shelter: 'shelter', uesApt: 'uesTwoBed', penthouse: 'penthouse' };

export function layoutForPlace(placeId: string): HomeLayout {
  return HOME_LAYOUTS.get(HOME_LAYOUT_FOR[placeId]) ?? HOME_LAYOUTS.require('studio');
}
