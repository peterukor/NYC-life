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
export const WORKPLACE_LAYOUTS: Record<string, HomeLayout> = {
  deliGrill: {
    id: 'deliGrill', name: 'Deli & grill', width: 12, depth: 9, wallColor: '#f2e3c6',
    rooms: [{ label: 'Store', rect: [-6, -4.5, 6, 4.5], floor: '#d8d2c4' }, { label: 'Behind the counter', rect: [-0.2, -4.5, 6, -2.2], floor: '#b9a68c' }],
    walls: [],
    furniture: [
      { uid: 'counter', item: 'deliCounter', x: 1.6, z: -1.7, rot: 0 },
      { uid: 'grill', item: 'flatTopGrill', x: 1.2, z: -4.05, rot: 0 },
      { uid: 'coffee', item: 'coffeeStation', x: 3.3, z: -4.1, rot: 0 },
      { uid: 'cooler', item: 'drinkCooler', x: 5.55, z: -2.4, rot: -H },
      { uid: 'cooler2', item: 'drinkCooler', x: 5.55, z: 0.2, rot: -H },
      { uid: 'shelf1', item: 'snackShelf', x: -3.4, z: -1.2, rot: 0 },
      { uid: 'shelf2', item: 'snackShelf', x: -3.4, z: 1.3, rot: 0 },
      { uid: 'lotto', item: 'lottoStand', x: -0.6, z: -1.7, rot: 0 },
      { uid: 'cat', item: 'catBed', x: -5.3, z: 3.7, rot: 0 },
      { uid: 'mat', item: 'rug', x: 0, z: 3.4, rot: 0 },
    ],
    workers: [{ x: 0.7, z: -2.9, rot: 0 }, { x: 2.5, z: -2.9, rot: 0 }, { x: 1.2, z: -3.4, rot: B }, { x: 4.6, z: -1.0, rot: H }, { x: -2.2, z: 0.05, rot: -H }, { x: -4.8, z: 0.05, rot: H }],
  },
  stoopBar: {
    id: 'stoopBar', name: 'The Stoop', width: 12, depth: 9, wallColor: '#6b2f2f',
    rooms: [{ label: 'Bar', rect: [-6, -4.5, 6, 4.5], floor: '#4a2f22' }],
    walls: [],
    furniture: [
      { uid: 'bar', item: 'barTop', x: 0, z: -1.9, rot: 0 },
      { uid: 'back', item: 'bottleWall', x: 0, z: -4.2, rot: 0 },
      { uid: 'booth1', item: 'booth', x: -4.9, z: -1.6, rot: H },
      { uid: 'booth2', item: 'booth', x: -4.9, z: 1.4, rot: H },
      { uid: 'pool', item: 'poolTable', x: 3.4, z: 1.4, rot: 0 },
      { uid: 'juke', item: 'jukebox', x: 5.6, z: -1.4, rot: -H },
      { uid: 'neon', item: 'neonSign', x: -3.8, z: -4.33, rot: 0 },
      { uid: 'neon2', item: 'neonSign', x: 3.8, z: -4.33, rot: 0 },
    ],
    workers: [{ x: -1.0, z: -3.2, rot: 0 }, { x: 0.6, z: -3.2, rot: 0 }, { x: 1.9, z: -3.2, rot: 0 }, { x: 3.4, z: 3.0, rot: B }, { x: -3.2, z: 0, rot: -H }, { x: 1.2, z: 3.3, rot: B }],
  },
  gym: {
    id: 'gym', name: 'Iron Hell’s Kitchen', width: 14, depth: 10, wallColor: '#2b2d42',
    rooms: [{ label: 'Gym floor', rect: [-7, -5, 7, 5], floor: '#3d3f4f' }, { label: 'Mats', rect: [2.6, 0.2, 7, 5], floor: '#5a6b7a' }],
    walls: [],
    furniture: [
      { uid: 'desk', item: 'gymDesk', x: -4.6, z: 2.6, rot: 0 },
      { uid: 'tm1', item: 'treadmill', x: -5.6, z: -3.9, rot: 0 },
      { uid: 'tm2', item: 'treadmill', x: -4.4, z: -3.9, rot: 0 },
      { uid: 'tm3', item: 'treadmill', x: -3.2, z: -3.9, rot: 0 },
      { uid: 'bench', item: 'benchPress', x: 0.2, z: -3.7, rot: 0 },
      { uid: 'rack', item: 'dumbbellRack', x: 2.8, z: -4.55, rot: 0 },
      { uid: 'bag', item: 'punchingBag', x: 6.0, z: -3.7, rot: 0 },
      { uid: 'mats', item: 'yogaMats', x: 4.8, z: 2.4, rot: 0 },
      { uid: 'p1', item: 'plant', x: -6.5, z: 4.4, rot: 0 },
    ],
    workers: [{ x: -4.6, z: 1.8, rot: 0 }, { x: -4.4, z: -2.4, rot: 0 }, { x: 1.4, z: -2.9, rot: -H }, { x: 5.2, z: -3.0, rot: H }, { x: 4.8, z: 0.9, rot: 0 }, { x: 2.8, z: -3.6, rot: B }],
  },
  startup: {
    id: 'startup', name: 'Chelsea Works', width: 14, depth: 10, wallColor: '#f0ebe3',
    rooms: [{ label: 'Open plan', rect: [-7, -5, 7, 5], floor: '#a98467' }, { label: 'Chill zone', rect: [2.4, 0.6, 7, 5], floor: '#7fb7be' }],
    walls: [],
    furniture: [
      { uid: 'desk1', item: 'standingDesk', x: -4.8, z: -3.9, rot: 0 },
      { uid: 'desk2', item: 'standingDesk', x: -2.6, z: -3.9, rot: 0 },
      { uid: 'desk3', item: 'standingDesk', x: -4.8, z: -1.0, rot: 0 },
      { uid: 'desk4', item: 'standingDesk', x: -2.6, z: -1.0, rot: 0 },
      { uid: 'board', item: 'whiteboard', x: 1.4, z: -4.84, rot: 0 },
      { uid: 'pong', item: 'pingPong', x: 3.8, z: -2.4, rot: 0 },
      { uid: 'bags', item: 'beanbags', x: 4.4, z: 3.0, rot: 0 },
      { uid: 'snacks', item: 'snackWall', x: 6.7, z: 0.2, rot: -H },
      { uid: 'p1', item: 'plant', x: -6.5, z: 4.4, rot: 0 },
      { uid: 'p2', item: 'plant', x: 0.4, z: -4.5, rot: 0 },
    ],
    workers: [{ x: -4.8, z: -3.0, rot: B }, { x: -2.6, z: -3.0, rot: B }, { x: -4.8, z: -0.1, rot: B }, { x: -2.6, z: -0.1, rot: B }, { x: 3.8, z: -1.2, rot: B }, { x: 1.4, z: -3.8, rot: B }],
  },
  tradingFloor: {
    id: 'tradingFloor', name: 'Trading floor', width: 14, depth: 10, wallColor: '#dfe4ea',
    rooms: [{ label: 'Floor', rect: [-7, -5, 7, 5], floor: '#57606f' }, { label: 'Meeting room', rect: [2.2, -5, 7, -1.2], floor: '#a4b0be' }],
    walls: [{ a: [2.2, -5], b: [2.2, -1.2] }],
    furniture: [
      { uid: 'desk1', item: 'tradingDesk', x: -4.6, z: -3.9, rot: 0 },
      { uid: 'desk2', item: 'tradingDesk', x: -1.5, z: -3.9, rot: 0 },
      { uid: 'desk3', item: 'tradingDesk', x: -4.6, z: -1.0, rot: 0 },
      { uid: 'desk4', item: 'tradingDesk', x: -1.5, z: -1.0, rot: 0 },
      { uid: 'ticker', item: 'tickerWall', x: -3.6, z: -4.82, rot: 0 },
      { uid: 'meet', item: 'meetingTable', x: 4.6, z: -3.1, rot: 0 },
      { uid: 'espresso', item: 'espressoBar', x: 6.6, z: 1.5, rot: -H },
      { uid: 'bull', item: 'goldBull', x: -5.8, z: 3.4, rot: 0 },
      { uid: 'p1', item: 'plant', x: 6.4, z: 4.4, rot: 0 },
    ],
    workers: [{ x: -4.6, z: -2.9, rot: B }, { x: -1.5, z: -2.9, rot: B }, { x: -4.6, z: 0.0, rot: B }, { x: -1.5, z: 0.0, rot: B }, { x: 4.6, z: -1.6, rot: B }, { x: 5.8, z: 1.5, rot: H }],
  },
  club: {
    id: 'club', name: 'The Velvet Room', width: 14, depth: 10, wallColor: '#2a1838',
    windows: { xs: [], w: 0, h: 0, y: 0 }, // a club has no windows
    rooms: [{ label: 'Club', rect: [-7, -5, 7, 5], floor: '#1d1626' }],
    walls: [],
    furniture: [
      { uid: 'stage', item: 'stage', x: 0, z: -2.6, rot: 0 },
      { uid: 'dj', item: 'djBooth', x: -4.4, z: -3.4, rot: 0 },
      { uid: 'floor', item: 'danceFloor', x: 0, z: 1.7, rot: 0 },
      { uid: 'vip1', item: 'vipBooth', x: 5.2, z: -3.2, rot: 0 },
      { uid: 'vip2', item: 'vipBooth', x: 5.2, z: 1.2, rot: 0 },
      { uid: 'bar', item: 'barCounter', x: -5.9, z: 1.6, rot: H },
      { uid: 'neon', item: 'neonSign', x: 2.6, z: -4.83, rot: 0 },
    ],
    workers: [{ x: -2.0, z: -1.2, rot: 0 }, { x: 2.0, z: -1.2, rot: 0 }, { x: -4.4, z: -4.3, rot: 0 }, { x: -6.4, z: 0.6, rot: H }, { x: 2.8, z: 3.3, rot: B }, { x: -2.6, z: 3.6, rot: B }],
  },
  alley: {
    id: 'alley', name: 'Orchard Street Alley', width: 10, depth: 10, wallColor: '#8a4436',
    windows: { xs: [-2.2], w: 1.0, h: 1.2, y: 2.4 }, // one high laundromat window
    rooms: [{ label: 'Alley', rect: [-5, -5, 5, 5], floor: '#4a4e57' }],
    walls: [],
    furniture: [
      { uid: 'dumpster', item: 'dumpster', x: -3.4, z: -4.1, rot: 0 },
      { uid: 'bags', item: 'alleyTrash', x: -1.4, z: -4.4, rot: 0 },
      { uid: 'crates', item: 'stashCrates', x: 3.4, z: -4.0, rot: 0 },
      { uid: 'escape', item: 'fireEscape', x: 2.6, z: -4.45, rot: 0 },
      { uid: 'lamp', item: 'streetLamp', x: 4.4, z: 1.2, rot: 0 },
      { uid: 'graffiti', item: 'graffiti', x: -4.73, z: 0.4, rot: H },
      { uid: 'bags2', item: 'alleyTrash', x: 4.3, z: 3.9, rot: 0 },
    ],
    workers: [{ x: 2.6, z: -2.9, rot: 0 }, { x: 4.1, z: -2.9, rot: 0 }, { x: 3.4, z: 2.8, rot: B }, { x: -3.6, z: 2.6, rot: H }, { x: -0.6, z: 3.8, rot: B }, { x: -2.2, z: -2.6, rot: 0 }],
  },
  precinct: {
    id: 'precinct', name: '18th Precinct', width: 14, depth: 10, wallColor: '#cfd8dc',
    rooms: [{ label: 'Lobby', rect: [-7, -5, 7, 5], floor: '#9aa5ab' }, { label: 'Squad room', rect: [1.6, -5, 7, -0.6], floor: '#b8a990' }],
    walls: [],
    furniture: [
      { uid: 'desk', item: 'precinctDesk', x: -1.2, z: -1.6, rot: 0 },
      { uid: 'cell', item: 'holdingCell', x: -5.6, z: -4.0, rot: 0 },
      { uid: 'cd1', item: 'copDesk', x: 2.8, z: -4.2, rot: 0 },
      { uid: 'cd2', item: 'copDesk', x: 5.2, z: -4.2, rot: 0 },
      { uid: 'cd3', item: 'copDesk', x: 2.8, z: -1.8, rot: 0 },
      { uid: 'cd4', item: 'copDesk', x: 5.2, z: -1.8, rot: 0 },
      { uid: 'lockers', item: 'lockers', x: 6.65, z: 2.4, rot: -H },
      { uid: 'coffee', item: 'precinctCoffee', x: -6.6, z: 1.6, rot: H },
      { uid: 'board', item: 'wantedBoard', x: -1.2, z: -4.84, rot: 0 },
    ],
    workers: [{ x: -1.2, z: -2.6, rot: 0 }, { x: 2.8, z: -3.3, rot: B }, { x: 5.2, z: -3.3, rot: B }, { x: 2.8, z: -0.9, rot: B }, { x: -5.6, z: -2.6, rot: B }, { x: 5.6, z: 2.4, rot: H }],
  },
};

/** Each workplace's own room, by place id (wins over the shared venue plans). */
export const WORKPLACE_LAYOUT_FOR: Record<string, string> = {
  barrioDeli: 'deliGrill',
  theStoop: 'stoopBar',
  ironGym: 'gym',
  dumboWorks: 'startup',
  midtownTower: 'tradingFloor',
  velvetRoom: 'club',
  theAlley: 'alley',
  precinct: 'precinct',
};

export const VENUE_LAYOUT_FOR: Partial<Record<InteriorKind, string>> = { furniture: 'furniture', cafe: 'cafe', bodega: 'bodega', pizza: 'pizza', bar: 'bar', office: 'office', comedy: 'comedy' };
