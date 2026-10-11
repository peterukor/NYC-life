// =====================================================================
// venues.ts — inside shops, cafés, bars and offices, Sims style.
//
// Same idea as homes (data/homes.ts): a floor plan with coloured floors,
// a few walls and real furniture from the furniture kit. The counter
// (serviceCounter / barCounter) offers whatever that place sells.
// Every venue of the same kind shares a plan; the place's name goes on
// the sign and its colour on the walls, so they feel related, not cloned.
//
// TO ADD A VENUE KIND: add a layout here and map the interior kind in
// VENUE_LAYOUT_FOR. Kinds without a layout keep the simple room.
// =====================================================================

import type { HomeLayout } from './homes.ts';
import type { InteriorKind } from './places.ts';

const PI = Math.PI;
const H = PI / 2;

export const VENUE_LAYOUTS: Record<string, HomeLayout> = {
  cafe: {
    id: 'cafe', name: 'Café', width: 14, depth: 10, wallColor: '#e9cfae',
    rooms: [
      { label: 'Café', rect: [-7, -5, 7, 5], floor: '#9a6a43' },
      { label: 'Behind the counter', rect: [-7, -5, 7, -2.6], floor: '#d9cdb8' },
    ],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'serviceCounter', x: -1.5, z: -2.2, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: 4.5, z: -4.5, rot: 0 },
      { uid: 'shelf', item: 'shelf', x: -5, z: -4.6, rot: 0 },
      { uid: 't1', item: 'cafeTable', x: -4.5, z: 1.2, rot: 0 },
      { uid: 't2', item: 'cafeTable', x: 0, z: 1.6, rot: 0 },
      { uid: 't3', item: 'cafeTable', x: 4.5, z: 1.2, rot: 0 },
      { uid: 'sofa', item: 'sofaLong', x: 6.2, z: -0.6, rot: -H },
      { uid: 'p1', item: 'plant', x: -6.4, z: 4.3, rot: 0 },
      { uid: 'p2', item: 'plant', x: 6.4, z: 4.3, rot: 0 },
      { uid: 'rug', item: 'rugRound', x: 0, z: 1.6, rot: 0 },
      { uid: 'lamp', item: 'floorLamp', x: -6.4, z: -1.2, rot: 0 },
    ],
  },
  bodega: {
    id: 'bodega', name: 'Bodega', width: 12, depth: 9, wallColor: '#f3efe2',
    rooms: [{ label: 'Store', rect: [-6, -4.5, 6, 4.5], floor: '#d6d3cb' }],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'serviceCounter', x: 2.5, z: -2.0, rot: 0 },
      { uid: 'fridge1', item: 'fridge', x: 5.3, z: -4.0, rot: 0 },
      { uid: 'fridge2', item: 'fridge', x: 5.3, z: -2.9, rot: -H },
      { uid: 's1', item: 'shelf', x: -4.6, z: -4.1, rot: 0 },
      { uid: 's2', item: 'shelf', x: -4.6, z: -1.2, rot: 0 },
      { uid: 's3', item: 'shelf', x: -4.6, z: 1.6, rot: 0 },
      { uid: 's4', item: 'bookcase', x: -1.6, z: -4.1, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: 5.4, z: 3.8, rot: 0 },
      { uid: 'mat', item: 'rug', x: 0, z: 3.4, rot: 0 },
    ],
  },
  pizza: {
    id: 'pizza', name: 'Pizza', width: 12, depth: 9, wallColor: '#f6e3c7',
    rooms: [{ label: 'Pizzeria', rect: [-6, -4.5, 6, 4.5], floor: '#c25b4a' }, { label: 'Kitchen', rect: [-6, -4.5, 6, -2.4], floor: '#e8dcc8' }],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'serviceCounter', x: 0, z: -2.0, rot: 0 },
      { uid: 'oven', item: 'stove', x: -4.8, z: -4.0, rot: 0 },
      { uid: 'oven2', item: 'stove', x: -3.9, z: -4.0, rot: 0 },
      { uid: 'fridge', item: 'fridge', x: 4.8, z: -4.1, rot: 0 },
      { uid: 't1', item: 'diningTable', x: -3.5, z: 1.8, rot: 0 },
      { uid: 't2', item: 'diningTable', x: 3.5, z: 1.8, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: 5.4, z: 3.8, rot: 0 },
    ],
  },
  bar: {
    id: 'bar', name: 'Bar', width: 14, depth: 10, wallColor: '#7a3b3b',
    rooms: [{ label: 'Bar', rect: [-7, -5, 7, 5], floor: '#4a2f22' }],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'barCounter', x: -1, z: -2.6, rot: 0 },
      { uid: 'shelf', item: 'shelf', x: -1.6, z: -4.6, rot: 0 },
      { uid: 'shelf2', item: 'shelf', x: 0.2, z: -4.6, rot: 0 },
      { uid: 'booth1', item: 'sofa', x: -5.6, z: 1.0, rot: H },
      { uid: 'booth2', item: 'sofa', x: -5.6, z: 3.4, rot: H },
      { uid: 'table1', item: 'coffeeTable', x: -4.4, z: 2.2, rot: H },
      { uid: 't2', item: 'cafeTable', x: 2.5, z: 2.0, rot: 0 },
      { uid: 'tv', item: 'tv', x: 5.6, z: -1.5, rot: -H },
      { uid: 'spk1', item: 'stageSpeaker', x: 6.3, z: 4.2, rot: 0 },
      { uid: 'rug', item: 'rug', x: 2.5, z: 2.0, rot: 0 },
    ],
  },
  office: {
    id: 'office', name: 'Office', width: 15, depth: 10, wallColor: '#e6e9ec',
    rooms: [{ label: 'Open plan', rect: [-7.5, -5, 7.5, 5], floor: '#8f969c' }, { label: 'Lounge', rect: [3.5, 1, 7.5, 5], floor: '#c9a27c' }],
    walls: [{ a: [3.5, 1], b: [3.5, 5], gaps: [[0.4, 1.6]] }],
    furniture: [
      { uid: 'counter', item: 'serviceCounter', x: 0, z: -3.6, rot: 0 },
      { uid: 'd1', item: 'officeDesk', x: -5.5, z: -1.0, rot: 0 },
      { uid: 'd2', item: 'officeDesk', x: -3.2, z: -1.0, rot: 0 },
      { uid: 'd3', item: 'officeDesk', x: -5.5, z: 2.0, rot: 0 },
      { uid: 'd4', item: 'officeDesk', x: -3.2, z: 2.0, rot: 0 },
      { uid: 'd5', item: 'officeDesk', x: 0.5, z: 2.0, rot: 0 },
      { uid: 'sofa', item: 'sofa', x: 5.5, z: 4.2, rot: PI },
      { uid: 'coffee', item: 'counter', x: 6.8, z: 1.6, rot: -H },
      { uid: 'books', item: 'bookcaseWide', x: 4.8, z: -4.6, rot: 0 },
      { uid: 'p1', item: 'plant', x: -7, z: -4.5, rot: 0 },
      { uid: 'p2', item: 'plant', x: 2.6, z: 4.4, rot: 0 },
    ],
  },
  comedy: {
    id: 'comedy', name: 'Comedy club', width: 14, depth: 10, wallColor: '#3a2340',
    rooms: [{ label: 'Club', rect: [-7, -5, 7, 5], floor: '#2a1f26' }, { label: 'Stage', rect: [-3, -5, 3, -2.5], floor: '#7b2cbf' }],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'barCounter', x: 4.6, z: 3.6, rot: PI },
      { uid: 'spk1', item: 'stageSpeaker', x: -3.4, z: -4.2, rot: 0 },
      { uid: 'spk2', item: 'stageSpeaker', x: 3.4, z: -4.2, rot: 0 },
      { uid: 't1', item: 'cafeTable', x: -4, z: 0.4, rot: 0 },
      { uid: 't2', item: 'cafeTable', x: 0, z: 0.4, rot: 0 },
      { uid: 't3', item: 'cafeTable', x: 4, z: 0.4, rot: 0 },
      { uid: 't4', item: 'cafeTable', x: -2, z: 3.0, rot: 0 },
    ],
  },
};

export const VENUE_LAYOUT_FOR: Partial<Record<InteriorKind, string>> = { cafe: 'cafe', bodega: 'bodega', pizza: 'pizza', bar: 'bar', office: 'office', comedy: 'comedy' };
