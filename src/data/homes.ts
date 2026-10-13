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
  floor: string;
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
      { uid: 'bed', item: 'twinBed', x: -3.22, z: -4.45, rot: 0 },
      { uid: 'night', item: 'crateNightstand', x: -2.35, z: -5.2, rot: 0 },
      { uid: 'radiator', item: 'radiator', x: -1.45, z: -5.35, rot: 0 },
      { uid: 'ac', item: 'windowAC', x: -1.71, z: -5.1, rot: 0 },
      { uid: 'posters', item: 'posters', x: -3.68, z: -2.6, rot: H },
      { uid: 'desk', item: 'foldingDesk', x: 1.0, z: -5.15, rot: 0 },
      { uid: 'rack', item: 'clothesRack', x: 3.4, z: -3.7, rot: -H },
      { uid: 'laundry', item: 'laundryPile', x: 0.4, z: -2.7, rot: 0 },
      { uid: 'boxes', item: 'movingBoxes', x: 2.75, z: -2.2, rot: 0 },
      // Kitchen along the left wall.
      { uid: 'stove', item: 'oldStove', x: -3.45, z: -1.05, rot: H },
      { uid: 'ksink', item: 'sinkCounter', x: -3.47, z: 0.25, rot: H },
      { uid: 'fridge', item: 'oldFridge', x: -3.43, z: 1.6, rot: H },
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
      { uid: 'bsink', item: 'pedestalSink', x: 2.2, z: 2.85, rot: 0 },
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
      { uid: 'bed', item: 'bedDouble', x: -4.7, z: 1.6, rot: 0 },
      { uid: 'night', item: 'nightstand', x: -5.6, z: -0.2, rot: 0 },
      { uid: 'stove', item: 'stove', x: -5.4, z: -4.0, rot: 0 },
      { uid: 'ksink', item: 'kitchenSink', x: -4.5, z: -4.0, rot: 0 },
      { uid: 'counter', item: 'counterMicrowave', x: -3.6, z: -4.0, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: -2.6, z: -4.1, rot: 0 },
      { uid: 'dining', item: 'diningTable', x: -3.1, z: -1.4, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 5.4, z: -2.4, rot: -H },
      { uid: 'shower', item: 'shower', x: 5.3, z: -3.9, rot: 0 },
      { uid: 'bsink', item: 'bathSink', x: 3.8, z: -4.2, rot: 0 },
      { uid: 'rug', item: 'rug', x: 1.0, z: 1.5, rot: 0 },
      { uid: 'tv', item: 'tv', x: 1.0, z: -0.3, rot: 0 },
      { uid: 'sofa', item: 'sofa', x: 1.0, z: 2.9, rot: PI },
      { uid: 'coffee', item: 'coffeeTable', x: 1.0, z: 1.6, rot: 0 },
      { uid: 'desk', item: 'desk', x: 4.8, z: 1.4, rot: -H },
      { uid: 'books', item: 'bookcase', x: 2.4, z: -4.1, rot: 0 },
      { uid: 'plant', item: 'plant', x: 5.5, z: 3.9, rot: 0 },
      { uid: 'lamp', item: 'floorLamp', x: -0.6, z: 3.6, rot: 0 },
      { uid: 'coat', item: 'coatRack', x: -5.5, z: 3.9, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: -1.6, z: -4.1, rot: 0 },
      { uid: 'closet', item: 'closet', x: -3.0, z: 4.0, rot: PI },
    ],
  },
  {
    // A big open Brooklyn loft: kitchen island, lounge, work corner, a proper bathroom.
    id: 'loft',
    name: 'Loft',
    width: 15,
    depth: 10,
    wallColor: '#e7d3c1',
    rooms: [
      { label: 'Loft', rect: [-7.5, -5, 7.5, 5], floor: '#9a6a43' },
      { label: 'Kitchen', rect: [-7.5, -5, -2, -1.5], floor: '#dcd6cc' },
      { label: 'Bathroom', rect: [4, -5, 7.5, -0.5], floor: '#cfe8ef' },
      { label: 'Bedroom', rect: [-7.5, 1.5, -2.5, 5], floor: '#b98d6a' },
    ],
    walls: [
      { a: [4, -5], b: [4, -0.5], gaps: [[3.2, 4.3]] },
      { a: [4, -0.5], b: [7.5, -0.5] },
      { a: [-2.5, 1.5], b: [-2.5, 5], gaps: [[0.4, 1.5]] },
    ],
    furniture: [
      { uid: 'bed', item: 'bedDouble', x: -5.8, z: 3.4, rot: H },
      { uid: 'night', item: 'nightstand', x: -7.0, z: 1.9, rot: 0 },
      { uid: 'stove', item: 'stove', x: -6.9, z: -4.5, rot: 0 },
      { uid: 'ksink', item: 'kitchenSink', x: -6.0, z: -4.5, rot: 0 },
      { uid: 'counter', item: 'counter', x: -5.1, z: -4.5, rot: 0 },
      { uid: 'counter2', item: 'counterMicrowave', x: -4.2, z: -4.5, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: -3.2, z: -4.6, rot: 0 },
      { uid: 'bar', item: 'breakfastBar', x: -5.0, z: -2.3, rot: 0 },
      { uid: 'bar2', item: 'breakfastBar', x: -4.1, z: -2.3, rot: 0 },
      { uid: 'tub', item: 'bathtub', x: 6.2, z: -4.3, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 7.0, z: -2.2, rot: -H },
      { uid: 'bsink', item: 'bathSink', x: 4.6, z: -4.7, rot: 0 },
      { uid: 'washer', item: 'washer', x: 4.6, z: -1.2, rot: H },
      { uid: 'rug', item: 'rug', x: 0.8, z: 1.4, rot: 0 },
      { uid: 'tv', item: 'tv', x: 0.8, z: -1.0, rot: 0 },
      { uid: 'sofa', item: 'sofaLong', x: 0.8, z: 3.3, rot: PI },
      { uid: 'arm', item: 'armchair', x: 3.0, z: 1.6, rot: -H },
      { uid: 'coffee', item: 'glassTable', x: 0.8, z: 1.5, rot: 0 },
      { uid: 'desk', item: 'deskScreen', x: 6.6, z: 2.4, rot: -H },
      { uid: 'books', item: 'bookcaseWide', x: 1.6, z: -4.6, rot: 0 },
      { uid: 'speakerL', item: 'speaker', x: -0.6, z: -1.0, rot: 0 },
      { uid: 'speakerR', item: 'speaker', x: 2.2, z: -1.0, rot: 0 },
      { uid: 'plant', item: 'plant', x: 7.0, z: 4.4, rot: 0 },
      { uid: 'plant2', item: 'plant', x: -1.6, z: -4.6, rot: 0 },
      { uid: 'lamp', item: 'floorLamp', x: -1.6, z: 4.4, rot: 0 },
      { uid: 'side', item: 'sideTable', x: 4.2, z: 4.5, rot: 0 },
      { uid: 'closet', item: 'closet', x: -4.0, z: 4.6, rot: PI },
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
      { uid: 'closet', item: 'closet', x: 1.9, z: -3.9, rot: 0 },
      { uid: 'toilet', item: 'toilet', x: 5.4, z: -3.6, rot: -H },
      { uid: 'shower', item: 'shower', x: 5.3, z: -1.0, rot: -H },
      { uid: 'bsink', item: 'bathSink', x: 3.2, z: -4.0, rot: 0 },
      { uid: 'dining', item: 'diningTable', x: 4.3, z: 2.4, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: 5.5, z: 4.0, rot: -H },
      { uid: 'tv', item: 'tvVintage', x: 3.0, z: 4.1, rot: PI },
      { uid: 'trash', item: 'trashcan', x: 0.4, z: 4.1, rot: 0 },
      { uid: 'plant', item: 'plant', x: 1.9, z: 0.4, rot: 0 },
    ],
  },
);

/** Which floor plan each home place uses. */
export const HOME_LAYOUT_FOR: Record<string, string> = { hkStudio: 'studio', wburgLoft: 'loft', sharedApt: 'harlemWalkup', shelter: 'shelter' };

export function layoutForPlace(placeId: string): HomeLayout {
  return HOME_LAYOUTS.get(HOME_LAYOUT_FOR[placeId]) ?? HOME_LAYOUTS.require('studio');
}
