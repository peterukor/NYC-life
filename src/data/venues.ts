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
import { dressVenue } from './venue-looks.ts';
import { CLUB_ROOMS } from './club-rooms.ts';
import { FUN_ROOMS } from './fun-rooms.ts';
import { ACTIVE_ROOMS } from './active-rooms.ts';
import { TOWN_ROOMS } from './town-rooms.ts';

const PI = Math.PI;
const H = PI / 2;

export const VENUE_LAYOUTS: Record<string, HomeLayout> = {
  // Lexington Home Goods: floor models you can tap to see in the catalog.
  furniture: {
    id: 'furniture', name: 'Furniture store', width: 14, depth: 10, wallColor: '#e6efe9',
    rooms: [
      { label: 'Showroom', rect: [-7, -5, 7, 5], floor: '#c9b28f' },
      { label: 'Counter', rect: [2.6, -5, 7, -2.4], floor: '#e9e2d3' },
    ],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'serviceCounter', x: 4.6, z: -3.4, rot: 0 },
      { uid: 'bedSingle', item: 'bedSingle', x: -5.6, z: -3.4, rot: 0 },
      { uid: 'bedDouble', item: 'bedDouble', x: -2.6, z: -3.2, rot: 0 },
      { uid: 'tv', item: 'tv', x: 0.6, z: -4.5, rot: 0 },
      { uid: 'tvVintage', item: 'tvVintage', x: 1.9, z: -4.5, rot: 0 },
      { uid: 'sofa', item: 'sofa', x: -5.0, z: 1.0, rot: 0 },
      { uid: 'sofaLong', item: 'sofaLong', x: -1.3, z: 0.9, rot: 0 },
      { uid: 'armchair', item: 'armchair', x: 2.4, z: 0.9, rot: 0 },
      { uid: 'floorLamp', item: 'floorLamp', x: 3.9, z: 0.7, rot: 0 },
      { uid: 'bookcase', item: 'bookcase', x: 6.4, z: -0.4, rot: -H },
      { uid: 'plant', item: 'plant', x: 6.3, z: 3.9, rot: 0 },
      { uid: 'rug', item: 'rug', x: -1.3, z: 2.9, rot: 0 },
    ],
  },
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

// ---------------------------------------------------------------------
// The eight workplaces (Peter, 2026-10-13: "make each work space look
// unique, with its own furniture and actions"). Each has its own room,
// its own pieces (world/furniture-work.ts) and 6 worker spots: you plus
// NPC coworkers now, other players later (sim/workroom.ts).
// ---------------------------------------------------------------------
const B = PI;
/**
 * Workplace rooms are big (Peter: room for 20–30 players each: workers
 * plus visitors who come to eat, invest, trade, party, report someone,
 * fix a phone or go on a date). They open framed whole; pinch to zoom.
 * `life` makes them lively (world/venue-life.ts): NPC visitors, little
 * emoji pops over people's heads, and per-room effects.
 */
export const WORKPLACE_LAYOUTS: Record<string, HomeLayout> = {
  deliGrill: {
    id: 'deliGrill', name: 'Deli & grill', width: 16, depth: 12, wallColor: '#f2e3c6', zoomable: true,
    life: { visitors: 9, pops: ['🥪', '☕', '🎟️', '💬', '😋'], fx: ['steam'] },
    rooms: [{ label: 'Store', rect: [-8, -6, 8, 6], floor: '#d8d2c4' }, { label: 'Behind the counter', rect: [0.6, -6, 8, -3.0], floor: '#b9a68c' }],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'deliCounter', x: 3.0, z: -2.6, rot: 0 },
      { uid: 'grill', item: 'flatTopGrill', x: 2.4, z: -5.55, rot: 0 },
      { uid: 'coffee', item: 'coffeeStation', x: 4.6, z: -5.6, rot: 0 },
      { uid: 'cooler', item: 'drinkCooler', x: 7.55, z: -3.6, rot: -H },
      { uid: 'cooler2', item: 'drinkCooler', x: 7.55, z: -1.0, rot: -H },
      { uid: 'cooler3', item: 'drinkCooler', x: 7.55, z: 1.6, rot: -H },
      { uid: 'lotto', item: 'lottoStand', x: 0.6, z: -2.6, rot: 0 },
      { uid: 'shelf1', item: 'snackShelf', x: -5.6, z: -3.6, rot: 0 },
      { uid: 'shelf2', item: 'snackShelf', x: -5.6, z: -1.2, rot: 0 },
      { uid: 'shelf3', item: 'snackShelf', x: -2.6, z: -3.6, rot: 0 },
      { uid: 'shelf4', item: 'snackShelf', x: -2.6, z: -1.2, rot: 0 },
      { uid: 'eat', item: 'windowCounter', x: -4.6, z: 5.2, rot: B },
      { uid: 'cat', item: 'catBed', x: -7.3, z: -5.4, rot: 0 },
      { uid: 'mat', item: 'rug', x: 0, z: 5.0, rot: 0 },
      { uid: 'trash', item: 'trashcan', x: 7.4, z: 5.3, rot: 0 },
    ],
    workers: [{ x: 1.9, z: -3.6, rot: 0 }, { x: 3.4, z: -3.6, rot: 0 }, { x: 4.8, z: -3.6, rot: 0 }, { x: 2.4, z: -4.7, rot: B }, { x: -4.1, z: -2.4, rot: -H }, { x: 6.6, z: -2.3, rot: H }],
  },
  startup: {
    id: 'startup', name: 'Chelsea Works', width: 20, depth: 14, wallColor: '#f0ebe3', zoomable: true,
    life: { visitors: 10, pops: ['💬', '☕', '💡', '🐛', '🚀', '📱'], fx: [] },
    rooms: [{ label: 'Open plan', rect: [-10, -7, 10, 7], floor: '#a98467' }, { label: 'Fix-It Bar', rect: [3.2, -1.4, 10, 3.0], floor: '#d6d9de' }, { label: 'Chill zone', rect: [-10, 2.6, -1.0, 7], floor: '#7fb7be' }],
    walls: [],
    furniture: [
      { uid: 'desk1', item: 'standingDesk', x: -7.8, z: -5.9, rot: 0 },
      { uid: 'desk2', item: 'standingDesk', x: -5.6, z: -5.9, rot: 0 },
      { uid: 'desk3', item: 'standingDesk', x: -3.4, z: -5.9, rot: 0 },
      { uid: 'desk4', item: 'standingDesk', x: -7.8, z: -3.0, rot: 0 },
      { uid: 'desk5', item: 'standingDesk', x: -5.6, z: -3.0, rot: 0 },
      { uid: 'desk6', item: 'standingDesk', x: -3.4, z: -3.0, rot: 0 },
      { uid: 'board', item: 'whiteboard', x: 0.2, z: -6.84, rot: 0 },
      { uid: 'pong', item: 'pingPong', x: 5.4, z: -4.8, rot: 0 },
      { uid: 'fix', item: 'repairBar', x: 6.2, z: 0.4, rot: 0 },
      { uid: 'bags', item: 'beanbags', x: -6.6, z: 4.8, rot: 0 },
      { uid: 'bags2', item: 'beanbags', x: -3.4, z: 5.0, rot: 0 },
      { uid: 'snacks', item: 'snackWall', x: 9.55, z: -3.4, rot: -H },
      { uid: 'p1', item: 'plant', x: -9.4, z: 1.2, rot: 0 },
      { uid: 'p2', item: 'plant', x: 2.0, z: -6.5, rot: 0 },
      { uid: 'p3', item: 'plant', x: 9.4, z: 6.4, rot: 0 },
    ],
    workers: [{ x: -7.8, z: -5.0, rot: B }, { x: -5.6, z: -5.0, rot: B }, { x: -3.4, z: -5.0, rot: B }, { x: -7.8, z: -2.1, rot: B }, { x: 6.2, z: -0.5, rot: 0 }, { x: 5.4, z: -3.4, rot: B }],
  },
  tradingFloor: {
    id: 'tradingFloor', name: 'Trading floor', width: 20, depth: 14, wallColor: '#dfe4ea', zoomable: true,
    life: { visitors: 10, pops: ['📈', '📉', '💸', '💬', '☕', '🤝'], fx: [] },
    rooms: [{ label: 'Floor', rect: [-10, -7, 10, 7], floor: '#57606f' }, { label: 'Meeting room', rect: [3.4, -7, 10, -2.2], floor: '#a4b0be' }, { label: 'Clients', rect: [3.4, -0.6, 10, 7], floor: '#ced6e0' }],
    walls: [{ a: [3.4, -7], b: [3.4, -2.2] }],
    furniture: [
      { uid: 'desk1', item: 'tradingDesk', x: -7.4, z: -6.0, rot: 0 },
      { uid: 'desk2', item: 'tradingDesk', x: -4.4, z: -6.0, rot: 0 },
      { uid: 'desk3', item: 'tradingDesk', x: -1.4, z: -6.0, rot: 0 },
      { uid: 'desk4', item: 'tradingDesk', x: -7.4, z: -3.0, rot: 0 },
      { uid: 'desk5', item: 'tradingDesk', x: -4.4, z: -3.0, rot: 0 },
      { uid: 'desk6', item: 'tradingDesk', x: -1.4, z: -3.0, rot: 0 },
      { uid: 'ticker', item: 'tickerWall', x: -4.4, z: -6.82, rot: 0 },
      { uid: 'meet', item: 'meetingTable', x: 6.6, z: -4.8, rot: 0 },
      { uid: 'invest', item: 'investorDesk', x: 5.2, z: 1.4, rot: 0 },
      { uid: 'invest2', item: 'investorDesk', x: 8.2, z: 1.4, rot: 0 },
      { uid: 'espresso', item: 'espressoBar', x: -9.55, z: 1.6, rot: H },
      { uid: 'lounge', item: 'sofaLong', x: 6.6, z: 5.8, rot: B },
      { uid: 'bull', item: 'goldBull', x: -7.6, z: 4.6, rot: 0 },
      { uid: 'p1', item: 'plant', x: 9.4, z: -1.2, rot: 0 },
      { uid: 'p2', item: 'plant', x: -9.4, z: 6.4, rot: 0 },
    ],
    workers: [{ x: -7.4, z: -5.0, rot: B }, { x: -4.4, z: -5.0, rot: B }, { x: -1.4, z: -5.0, rot: B }, { x: -7.4, z: -2.0, rot: B }, { x: -4.4, z: -2.0, rot: B }, { x: 5.2, z: 0.15, rot: 0 }],
  },
  // ♟️ The Chess House: tables in rows, a counter, shelves of sets.
  chessHouse: {
    id: 'chessHouse', name: 'The Chess House', width: 14, depth: 10, wallColor: '#6b4226', zoomable: true,
    windows: { xs: [-4, 4], w: 1.6, h: 1.4, y: 1.6 },
    life: { visitors: 8, pops: ['♟️', '🤔', '⏱️', '😤', '🏆', '👀'], fx: [] },
    rooms: [{ label: 'Chess House', rect: [-7, -5, 7, 5], floor: '#8b5a3c' }],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'serviceCounter', x: -3.6, z: -3.6, rot: 0 },
      { uid: 'shelf', item: 'bookcaseWide', x: 3.6, z: -4.55, rot: 0 },
      { uid: 'c1', item: 'chessTable', x: -4.2, z: 0.2, rot: 0 },
      { uid: 'c2', item: 'chessTable', x: 0, z: 0.2, rot: 0 },
      { uid: 'c3', item: 'chessTable', x: 4.2, z: 0.2, rot: 0 },
      { uid: 'c4', item: 'chessTable', x: -2.1, z: 3.0, rot: 0 },
      { uid: 'c5', item: 'chessTable', x: 2.1, z: 3.0, rot: 0 },
      { uid: 'lamp', item: 'floorLamp', x: -6.3, z: -1.8, rot: 0 },
      { uid: 'plant', item: 'plant', x: 6.3, z: 4.2, rot: 0 },
    ],
    workers: [{ x: -3.6, z: -4.4, rot: 0 }, { x: -4.2, z: 1.2, rot: B }, { x: 4.2, z: 1.2, rot: B }],
  },
  // 🎨 Bowery Art Parlor: a counter (paint), art on the walls, tables to work at.
  artParlor: {
    id: 'artParlor', name: 'Bowery Art Parlor', width: 14, depth: 10, wallColor: '#f4f1de', zoomable: true,
    windows: { xs: [-4.5, 4.5], w: 1.6, h: 1.6, y: 1.5 },
    life: { visitors: 8, pops: ['🎨', '🖌️', '😍', '🤔', '✨', '👀'], fx: [] },
    rooms: [{ label: 'Studio', rect: [-7, -5, 7, 5], floor: '#c9ada7' }],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'serviceCounter', x: 0, z: -3.6, rot: 0 },
      { uid: 'art1', item: 'artwork', x: -6.76, z: -1.2, rot: H },
      { uid: 'art2', item: 'artwork', x: 6.76, z: 1.4, rot: -H },
      { uid: 't1', item: 'cafeTable', x: -4.2, z: 0.6, rot: 0 },
      { uid: 't2', item: 'cafeTable', x: 0, z: 1.2, rot: 0 },
      { uid: 't3', item: 'cafeTable', x: 4.2, z: 0.6, rot: 0 },
      { uid: 'rug', item: 'rugRound', x: 0, z: 1.2, rot: 0 },
      { uid: 'plant', item: 'plant', x: -6.3, z: 4.2, rot: 0 },
      { uid: 'lamp', item: 'floorLamp', x: 6.3, z: -1.6, rot: 0 },
    ],
    workers: [{ x: 0, z: -4.4, rot: 0 }, { x: -4.2, z: 1.6, rot: B }],
  },
  alley: {
    id: 'alley', name: 'Orchard Street Alley', width: 16, depth: 14, wallColor: '#8a4436', zoomable: true,
    windows: { xs: [-3.6, 3.0], w: 1.0, h: 1.2, y: 2.4 },
    life: { visitors: 7, pops: ['👀', '🤫', '💵', '🚨', '💬'], fx: ['flicker'] },
    rooms: [{ label: 'Alley', rect: [-8, -7, 8, 7], floor: '#4a4e57' }],
    walls: [],
    furniture: [
      { uid: 'dumpster', item: 'dumpster', x: -5.8, z: -6.2, rot: 0 },
      { uid: 'dumpster2', item: 'dumpster', x: 7.2, z: 4.6, rot: -H },
      { uid: 'bags', item: 'alleyTrash', x: -3.6, z: -6.4, rot: 0 },
      { uid: 'bags2', item: 'alleyTrash', x: 6.8, z: 2.0, rot: 0 },
      { uid: 'crates', item: 'stashCrates', x: 4.4, z: -6.0, rot: 0 },
      { uid: 'escape', item: 'fireEscape', x: 1.0, z: -6.45, rot: 0 },
      { uid: 'lamp', item: 'streetLamp', x: -7.2, z: 1.2, rot: 0 },
      { uid: 'lamp2', item: 'streetLamp', x: 6.8, z: -1.8, rot: 0 },
      { uid: 'graffiti', item: 'graffiti', x: -7.73, z: -1.8, rot: H },
      { uid: 'graffiti2', item: 'graffiti', x: -7.73, z: 3.6, rot: H },
      { uid: 'boxes', item: 'movingBoxes', x: -5.8, z: 5.4, rot: 0 },
    ],
    workers: [{ x: 3.4, z: -4.8, rot: 0 }, { x: 5.4, z: -4.8, rot: 0 }, { x: 5.6, z: 1.0, rot: -H }, { x: -6.0, z: 3.4, rot: H }, { x: -2.0, z: 5.6, rot: B }, { x: -3.6, z: -4.8, rot: 0 }],
  },
  precinct: {
    id: 'precinct', name: '18th Precinct', width: 20, depth: 14, wallColor: '#cfd8dc', zoomable: true,
    life: { visitors: 9, pops: ['📻', '📝', '☕', '🚨', '💬', '😤'], fx: [] },
    rooms: [{ label: 'Lobby', rect: [-10, -7, 10, 7], floor: '#9aa5ab' }, { label: 'Squad room', rect: [2.2, -7, 10, -1.4], floor: '#b8a990' }],
    walls: [],
    furniture: [
      { uid: 'desk', item: 'precinctDesk', x: -1.6, z: -3.0, rot: 0 },
      { uid: 'report', item: 'reportWindow', x: -9.55, z: 3.0, rot: H },
      { uid: 'bench1', item: 'waitingBench', x: -4.6, z: 2.0, rot: B },
      { uid: 'bench2', item: 'waitingBench', x: 1.4, z: 2.0, rot: B },
      { uid: 'cell', item: 'holdingCell', x: -8.4, z: -6.05, rot: 0 },
      { uid: 'cd1', item: 'copDesk', x: 3.8, z: -6.2, rot: 0 },
      { uid: 'cd2', item: 'copDesk', x: 6.6, z: -6.2, rot: 0 },
      { uid: 'cd3', item: 'copDesk', x: 3.8, z: -3.6, rot: 0 },
      { uid: 'cd4', item: 'copDesk', x: 6.6, z: -3.6, rot: 0 },
      { uid: 'lockers', item: 'lockers', x: 9.55, z: 1.6, rot: -H },
      { uid: 'coffee', item: 'precinctCoffee', x: -9.55, z: -2.0, rot: H },
      { uid: 'board', item: 'wantedBoard', x: -1.6, z: -6.84, rot: 0 },
      { uid: 'p1', item: 'plant', x: 9.4, z: 6.4, rot: 0 },
    ],
    workers: [{ x: -1.6, z: -4.0, rot: 0 }, { x: 3.8, z: -5.4, rot: B }, { x: 6.6, z: -5.4, rot: B }, { x: 3.8, z: -2.8, rot: B }, { x: -8.4, z: -4.6, rot: B }, { x: 6.6, z: -2.8, rot: B }],
  },
};

// The five clubs (data/club-rooms.ts).
Object.assign(WORKPLACE_LAYOUTS, CLUB_ROOMS, FUN_ROOMS, ACTIVE_ROOMS, TOWN_ROOMS);

/** Each workplace's own room, by place id (wins over the shared venue plans). */
export const WORKPLACE_LAYOUT_FOR: Record<string, string> = {
  barrioDeli: 'deli2',
  theStoop: 'stoopBar',
  ironGym: 'gym',
  flexFulton: 'gym2',
  pulseLic: 'gym3',
  dumboWorks: 'startup2',
  midtownTower: 'office2',
  velvetRoom: 'club',
  basement212: 'club1',
  chessHouse: 'chessHouse2',
  artParlor: 'artStudio',
  pier84: 'pier84',
  skyeRooftop: 'club3',
  aurumClub: 'club4',
  theAlley: 'alley2',
  precinct: 'precinct2',
  // Entertainment (no jobs here yet; NPC staff fill the spots).
  warehouseRave: 'club5',
  pixelPalace: 'arcade',
  kingsArcade: 'arcade2',
  hubArcade: 'arcade3',
  empireCasino: 'casino',
  astoriaRoyale: 'casino2',
  navyYardClub: 'casino3',
  luckyStar: 'casino4',
  diveBar: 'bar1',
  beerGarden: 'bar2',
  lenoxLounge: 'bar3',
  centralPark: 'park',
  // Rebuilt 2026-10-28 (data/town-rooms.ts).
  sliceJoint: 'slice',
  harlemSoul: 'soulKitchen',
  mulberryTrattoria: 'trattoria',
  gramercyRoom: 'gramercy',
  beanMachine: 'beanCafe',
  panaderia: 'panaderia',
  thriftHk: 'thrift',
  storageAuction: 'storage',
  clinicalTrial: 'lab',
  homeGoods: 'homeStore',
  hkLanes: 'lanes',
  unionSqCinema: 'cinema',
  seaportGolf: 'golf',
};

export const VENUE_LAYOUT_FOR: Partial<Record<InteriorKind, string>> = { furniture: 'furniture', cafe: 'cafe', bodega: 'bodega', pizza: 'pizza', bar: 'bar', office: 'office', comedy: 'comedy' };

// Bigger, livelier, lit for what they are (data/venue-looks.ts, 2026-10-27).
for (const l of [...Object.values(VENUE_LAYOUTS), ...Object.values(WORKPLACE_LAYOUTS)]) dressVenue(l);
