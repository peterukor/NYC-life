// =====================================================================
// places.ts — every place you can go: homes, shops, bars, parks,
// landmarks and subway stations.
//
// Each place sits on a block (c, r) of its area's grid (see
// world/layout.ts) and has a door on one side of that block. `slot`
// picks where along that side the door is (0 = west end … 3 = east end).
//
// `interior` chooses which shared room template is used when you go
// inside. Most venues of the same type share one template with the
// name and colours swapped, which keeps the game small and fast.
//
// Landmarks carry a `landmark` card with a short description and a
// link to the real place's official website (opens in a new tab).
// =====================================================================

import type { AreaId } from '../sim/types.ts';
import { DISTRICTS, blockRect, SIDEWALK } from '../world/layout.ts';

export type InteriorKind = 'apartment' | 'bodega' | 'pizza' | 'cafe' | 'bar' | 'club' | 'office' | 'gym' | 'comedy' | 'none';

export type PlaceType = 'home' | 'food' | 'cafe' | 'nightlife' | 'work' | 'fitness' | 'park' | 'plaza' | 'landmark' | 'station' | 'shop';

export interface PlaceDef {
  id: string;
  /** Clothing stores: which tiers they sell (data/wardrobe.ts). */
  sells?: ('plain' | 'premium' | 'exclusive')[];
  area: AreaId;
  name: string;
  emoji: string;
  type: PlaceType;
  blurb: string;
  block: [number, number];
  side: 'N' | 'S' | 'E' | 'W';
  slot: number;
  /** Opening hours [open, close) in New York time; close < open means past midnight. Omit = 24h. */
  hours?: [number, number];
  interior: InteriorKind;
  actions: string[];
  /** Accent colour for signs and the interior. */
  color: string;
  landmark?: { description: string; officialSite: string; siteLabel: string };
  /** For home listings: weekly rent in cents. */
  rent?: number;
}

export const PLACES: PlaceDef[] = [
  // ======================= MANHATTAN =======================
  {
    id: 'hkStudio', area: 'manhattan', name: 'Your Hell’s Kitchen studio', emoji: '🏠', type: 'home',
    blurb: 'Fourth-floor walk-up. Radiator clanks, but the location is unbeatable.',
    block: [1, 5], side: 'S', slot: 1, interior: 'apartment', actions: [], color: '#c0583b', rent: 65_000,
  },
  {
    id: 'bodegaHk', area: 'manhattan', name: 'Kings Deli & Grocery', emoji: '🏪', type: 'food',
    blurb: 'Open 24/7. The cat runs the place. Best chopped cheese on Ninth.',
    block: [1, 6], side: 'S', slot: 2, interior: 'bodega', color: '#e8b923',
    actions: ['baconEggCheese', 'choppedCheese', 'bodegaCoffee', 'petBodegaCat', 'lottoTicket', 'gistWithOwner'],
  },
  {
    id: 'sliceJoint', area: 'manhattan', name: 'Slice of Ninth', emoji: '🍕', type: 'food',
    blurb: 'Dollar-and-a-half slices, paper plates, zero chairs. Perfect.',
    block: [2, 6], side: 'S', slot: 1, hours: [10, 4], interior: 'pizza', color: '#d6402f',
    actions: ['dollarSlice', 'fullPie', 'foldDebate'],
  },
  {
    id: 'beanMachine', area: 'manhattan', name: 'Bean Machine Coffee', emoji: '☕', type: 'cafe',
    blurb: 'Exposed brick, oat milk, and laptops as far as the eye can see.',
    block: [2, 5], side: 'S', slot: 2, hours: [6, 21], interior: 'cafe', color: '#7a4b2a',
    actions: ['latte', 'bagelSchmear', 'laptopCafe'],
  },
  {
    id: 'diveBar', area: 'manhattan', name: 'The Rusty Nail', emoji: '🍺', type: 'nightlife',
    blurb: 'Dive bar with a jukebox stuck on 2004. Karaoke Thursdays (and every other day).',
    block: [2, 4], side: 'S', slot: 1, hours: [16, 4], interior: 'bar', color: '#8c2f39',
    actions: ['happyHour', 'karaoke', 'streetDeal', 'collectDebt', 'betrayCrew'],
  },
  {
    id: 'comedyCellar', area: 'manhattan', name: 'The Basement Comedy Club', emoji: '😂', type: 'nightlife',
    blurb: 'Two-drink minimum, unlimited heckling. Open mic before the late show.',
    block: [3, 7], side: 'N', slot: 1, hours: [18, 2], interior: 'comedy', color: '#3c2a5c',
    actions: ['watchComedy', 'openMic'],
  },
  {
    id: 'ironGym', area: 'manhattan', name: 'Iron Hell’s Kitchen', emoji: '🏋️', type: 'fitness',
    blurb: 'No-frills gym, frills-only clientele.',
    block: [1, 8], side: 'N', slot: 2, hours: [5, 23], interior: 'gym', color: '#2b2d42',
    actions: ['gymSession', 'spinClass', 'gymShower'],
  },
  {
    id: 'midtownTower', area: 'manhattan', name: 'Sixth Avenue Tower', emoji: '🏢', type: 'work',
    blurb: 'Glass, granite and a lobby that smells like money.',
    block: [5, 5], side: 'W', slot: 1, interior: 'office', color: '#355c7d', actions: ['pitchInvestors', 'dumpWaste', 'bribeCops'],
  },
  {
    id: 'timesSquare', area: 'manhattan', name: 'Times Square', emoji: '🌆', type: 'plaza',
    blurb: 'The crossroads of the world. Giant screens, costumed characters, and the red steps.',
    block: [4, 5], side: 'W', slot: 1, interior: 'none', color: '#ff2d55',
    actions: ['peopleWatch', 'photoSelfie', 'hotDogCart', 'busk', 'publicRestroom'],
    landmark: { description: 'Midtown’s famous plaza of giant screens at Broadway and Seventh Avenue.', officialSite: 'https://www.timessquarenyc.org/', siteLabel: 'timessquarenyc.org' },
  },
  {
    id: 'bryantPark', area: 'manhattan', name: 'Bryant Park', emoji: '🌳', type: 'park',
    blurb: 'Lawn, chess tables and the library next door. Midtown’s backyard.',
    block: [5, 7], side: 'W', slot: 1, hours: [7, 23], interior: 'none', color: '#2e8b57',
    actions: ['picnic', 'chess', 'peopleWatch', 'halalCart', 'jog', 'publicRestroom'],
    landmark: { description: 'Nine-acre park behind the New York Public Library’s main branch.', officialSite: 'https://bryantpark.org/', siteLabel: 'bryantpark.org' },
  },
  {
    id: 'empireState', area: 'manhattan', name: 'Empire State Building', emoji: '🏙️', type: 'landmark',
    blurb: '102 floors of Art Deco. The view from the top hits different at night.',
    block: [5, 10], side: 'W', slot: 2, hours: [9, 24], interior: 'none', color: '#c9a227',
    actions: ['observationDeck', 'photoSelfie'],
    landmark: { description: 'The 1931 Art Deco skyscraper on Fifth Avenue at 34th Street.', officialSite: 'https://www.esbnyc.com/', siteLabel: 'esbnyc.com' },
  },
  {
    id: 'timesSqStation', area: 'manhattan', name: 'Times Sq–42 St Station', emoji: '🚇', type: 'station',
    blurb: 'Every line, every type of New Yorker, every kind of music.',
    block: [4, 6], side: 'S', slot: 1, interior: 'none', color: '#0039a6',
    actions: ['subwayShowtime', 'tipPerformer'],
  },
  {
    id: 'hudsonYardsLot', area: 'manhattan', name: 'Hudson Yards lots (coming soon)', emoji: '🚧', type: 'plaza',
    blurb: 'Fenced-off land waiting for the next big thing. Future venues and player plots.',
    block: [0, 10], side: 'E', slot: 1, interior: 'none', color: '#f4a261', actions: ['peopleWatch'],
  },

  {
    id: 'centralPark', area: 'manhattan', name: 'Central Park', emoji: '🌳', type: 'park',
    blurb: 'Lawns, a lake with rowboats, buskers and the whole city taking a breath.',
    block: [2, 1], side: 'S', slot: 1, hours: [6, 1], interior: 'none', color: '#2e8b57',
    actions: ['picnic', 'jog', 'rowboat', 'peopleWatch', 'busk', 'halalCart', 'publicRestroom'],
    landmark: { description: 'The 843-acre park in the middle of Manhattan, designed by Olmsted and Vaux.', officialSite: 'https://www.centralparknyc.org/', siteLabel: 'centralparknyc.org' },
  },
  {
    id: 'thriftHk', area: 'manhattan', name: 'Hell’s Kitchen Thrift', emoji: '👕', type: 'shop',
    blurb: 'Racks of basics, vintage tees and the occasional mystery jacket.',
    block: [2, 7], side: 'S', slot: 2, hours: [9, 21], interior: 'none', color: '#2a9d8f',
    actions: ['windowShop'], sells: ['plain'],
  },
  {
    id: 'sohoThreads', area: 'manhattan', name: 'Midtown Threads', emoji: '🛍️', type: 'shop',
    blurb: 'Good basics and the nicer brands. The changing rooms have great lighting.',
    block: [3, 6], side: 'N', slot: 1, hours: [10, 21], interior: 'none', color: '#3a86ff',
    actions: ['windowShop'], sells: ['plain', 'premium'],
  },
  {
    id: 'fifthBoutique', area: 'manhattan', name: 'Maison Fifth', emoji: '💎', type: 'shop',
    blurb: 'Fifth Avenue designer boutique. They offer you champagne. Prices are not shown on purpose.',
    block: [5, 9], side: 'W', slot: 1, hours: [11, 19], interior: 'none', color: '#c9a227',
    actions: ['windowShop'], sells: ['premium', 'exclusive'],
  },
  {
    id: 'fultonMallShop', area: 'brooklyn', name: 'Fulton Street Kicks & Fits', emoji: '👟', type: 'shop',
    blurb: 'Brooklyn streetwear: sneakers, jerseys, puffers.',
    block: [2, 3], side: 'S', slot: 2, hours: [10, 21], interior: 'none', color: '#e63946',
    actions: ['windowShop'], sells: ['plain', 'premium'],
  },
  {
    id: 'chrysler', area: 'manhattan', name: 'Chrysler Building', emoji: '🏢', type: 'landmark',
    blurb: 'The shiny Art Deco crown everyone secretly likes best. The lobby is a museum of marble and chrome.',
    block: [5, 8], side: 'W', slot: 1, hours: [8, 18], interior: 'none', color: '#9aa8b8',
    actions: ['photoSelfie'],
    landmark: { description: 'The 1930 Art Deco skyscraper at Lexington Avenue and 42nd Street, famous for its steel crown.', officialSite: 'https://www.nyc.gov/site/lpc/index.page', siteLabel: 'NYC Landmarks Preservation' },
  },
  {
    id: 'flatiron', area: 'manhattan', name: 'Flatiron Building', emoji: '📐', type: 'landmark',
    blurb: 'The wedge-shaped 1902 tower where Broadway meets Fifth. Everyone takes the same photo. You will too.',
    block: [3, 11], side: 'N', slot: 1, interior: 'none', color: '#d9c39b',
    actions: ['photoSelfie'],
    landmark: { description: 'The triangular 1902 skyscraper at Fifth Avenue, Broadway and 23rd Street.', officialSite: 'https://www.nyc.gov/site/lpc/index.page', siteLabel: 'NYC Landmarks Preservation' },
  },
  {
    id: 'statueOfLiberty', area: 'manhattan', name: 'Statue of Liberty', emoji: '🗽', type: 'landmark',
    blurb: 'Lady Liberty, out in the harbor. Wave from the pier, or squint at her torch at night.',
    block: [0, 9], side: 'W', slot: 2, interior: 'none', color: '#7fcdb4',
    actions: ['photoSelfie'],
    landmark: { description: 'The 1886 copper statue on Liberty Island in New York Harbor, a gift from France.', officialSite: 'https://www.nps.gov/stli/', siteLabel: 'nps.gov/stli' },
  },
  {
    id: 'parkMall', area: 'manhattan', name: 'Central Park Galleria', emoji: '🛍️', type: 'landmark',
    blurb: 'Glass-roofed mall on the park: sneakers, fashion, a food hall and very nice bathrooms.',
    block: [5, 1], side: 'W', slot: 1, hours: [10, 22], interior: 'none', color: '#ff5fa2',
    actions: ['windowShop', 'foodHall', 'photoSelfie', 'publicRestroom'],
  },

  {
    id: 'funland', area: 'manhattan', name: 'Funland', emoji: '🎡', type: 'landmark',
    blurb: 'Ferris wheel, a rickety coaster, carnival games and funnel cake. Screaming encouraged. Right by Central Park.',
    block: [0, 1], side: 'E', slot: 1, hours: [11, 23], interior: 'none', color: '#ff3d7f',
    actions: ['ferrisWheel', 'rollerCoaster', 'carnivalGames', 'funnelCake', 'photoSelfie'],
  },

  // ======================= BROOKLYN =======================
  {
    id: 'wburgLoft', area: 'brooklyn', name: 'Fulton St loft (for rent)', emoji: '🏠', type: 'home',
    blurb: 'Big windows, exposed pipes, and a roof you’re technically not allowed on.',
    block: [2, 1], side: 'S', slot: 1, interior: 'apartment', actions: [], color: '#5d6d7e', rent: 180_000,
  },
  {
    id: 'sharedApt', area: 'brooklyn', name: 'Room in a shared apartment', emoji: '🏠', type: 'home',
    blurb: 'Three roommates, one bathroom, great vibes (mostly).',
    block: [0, 4], side: 'S', slot: 2, interior: 'apartment', actions: [], color: '#a0522d', rent: 32_000,
  },
  {
    id: 'theStoop', area: 'brooklyn', name: 'The Stoop', emoji: '🍸', type: 'nightlife',
    blurb: 'Neighbourhood bar with a backyard, a dog, and a bartender who remembers you.',
    block: [2, 2], side: 'S', slot: 2, hours: [15, 4], interior: 'bar', color: '#4a7c59',
    actions: ['happyHour', 'karaoke'],
  },
  {
    id: 'warehouseRave', area: 'brooklyn', name: 'Warehouse 9 (club)', emoji: '🪩', type: 'nightlife',
    blurb: 'Unmarked door, techno till sunrise. Don’t ask for the setlist.',
    block: [3, 5], side: 'N', slot: 2, hours: [22, 6], interior: 'club', color: '#7b2cbf',
    actions: ['dancefloor', 'happyHour'],
  },
  {
    id: 'bodegaBk', area: 'brooklyn', name: 'Fulton Mini Market', emoji: '🏪', type: 'food',
    blurb: 'Plantain chips, phone chargers, and the friendliest cat in Brooklyn.',
    block: [0, 2], side: 'S', slot: 1, interior: 'bodega', color: '#e76f51',
    actions: ['baconEggCheese', 'choppedCheese', 'bodegaCoffee', 'petBodegaCat', 'lottoTicket', 'gistWithOwner'],
  },
  {
    id: 'fortGreeneCafe', area: 'brooklyn', name: 'Greene Bean', emoji: '☕', type: 'cafe',
    blurb: 'Brownstone café with a garden and very strong opinions about pour-over.',
    block: [1, 2], side: 'S', slot: 2, hours: [7, 20], interior: 'cafe', color: '#6b8f71',
    actions: ['latte', 'bagelSchmear', 'laptopCafe'],
  },
  {
    id: 'bkPizza', area: 'brooklyn', name: 'Flatbush Pie Co.', emoji: '🍕', type: 'food',
    blurb: 'Square slices, grandma pies, and a line out the door on Fridays.',
    block: [2, 4], side: 'S', slot: 1, hours: [11, 2], interior: 'pizza', color: '#c1121f',
    actions: ['dollarSlice', 'fullPie', 'foldDebate'],
  },
  {
    id: 'dumboWorks', area: 'brooklyn', name: 'DUMBO Works', emoji: '💻', type: 'work',
    blurb: 'Converted factory full of startups, bikes and free cold brew.',
    block: [2, 0], side: 'S', slot: 2, interior: 'office', color: '#264653', actions: [],
  },
  {
    id: 'brooklynBridge', area: 'brooklyn', name: 'Brooklyn Bridge', emoji: '🌉', type: 'landmark',
    blurb: 'Stone towers, steel cables, and the best skyline view in town.',
    block: [1, 0], side: 'S', slot: 1, interior: 'none', color: '#8d6e63',
    actions: ['walkBridge', 'photoSelfie', 'jog'],
    landmark: { description: 'The 1883 suspension bridge linking Brooklyn and Manhattan over the East River.', officialSite: 'https://www.nyc.gov/html/dot/html/infrastructure/brooklyn-bridge.shtml', siteLabel: 'nyc.gov (NYC DOT)' },
  },
  {
    id: 'fortGreenePark', area: 'brooklyn', name: 'Fort Greene Park', emoji: '🌳', type: 'park',
    blurb: 'Hilltop park with a monument, a farmers market and Saturday pickup games.',
    block: [1, 3], side: 'S', slot: 1, hours: [6, 1], interior: 'none', color: '#40916c',
    actions: ['picnic', 'chess', 'jog', 'peopleWatch', 'busk', 'publicRestroom'],
    landmark: { description: 'Historic Brooklyn park designed by Olmsted and Vaux.', officialSite: 'https://www.nycgovparks.org/parks/fort-greene-park', siteLabel: 'nycgovparks.org' },
  },
  {
    id: 'atlanticPlaza', area: 'brooklyn', name: 'Atlantic Plaza', emoji: '🌆', type: 'plaza',
    blurb: 'Downtown Brooklyn’s bright crossroads: screens, street food and game-night crowds.',
    block: [3, 3], side: 'W', slot: 1, interior: 'none', color: '#ff6b35',
    actions: ['peopleWatch', 'photoSelfie', 'halalCart', 'busk', 'publicRestroom'],
  },
  {
    id: 'atlanticArena', area: 'brooklyn', name: 'Atlantic Arena', emoji: '🏀', type: 'landmark',
    blurb: 'Rusted-steel arena. Basketball, concerts and very loud Tuesdays.',
    block: [4, 4], side: 'W', slot: 1, hours: [17, 23], interior: 'none', color: '#6c584c',
    actions: ['catchGame', 'photoSelfie'],
  },
  {
    id: 'atlanticStation', area: 'brooklyn', name: 'Atlantic Av–Barclays Ctr Station', emoji: '🚇', type: 'station',
    blurb: 'Nine lines meet under Flatbush. Mind the gap.',
    block: [3, 4], side: 'N', slot: 2, interior: 'none', color: '#0039a6',
    actions: ['subwayShowtime', 'tipPerformer'],
  },
];

export const PLACE_BY_ID: Record<string, PlaceDef> = Object.fromEntries(PLACES.map((p) => [p.id, p]));

/** Places in one area. */
export function placesIn(area: AreaId): PlaceDef[] {
  return PLACES.filter((p) => p.area === area);
}

/** The subway station of an area. */
export function stationOf(area: AreaId): PlaceDef {
  return PLACES.find((p) => p.area === area && p.type === 'station')!;
}

/**
 * World position of a place's door: on the sidewalk, in front of the
 * building, at the chosen slot along the chosen side of the block.
 */
export function doorOf(p: PlaceDef): { x: number; z: number; faceX: number; faceZ: number } {
  const d = DISTRICTS[p.area];
  const b = blockRect(d, p.block[0], p.block[1]);
  const t = (Math.min(3, Math.max(0, p.slot)) + 0.5) / 4;
  const inset = SIDEWALK * 0.55;
  switch (p.side) {
    case 'S':
      return { x: b.minX + (b.maxX - b.minX) * t, z: b.maxZ - inset, faceX: 0, faceZ: 1 };
    case 'N':
      return { x: b.minX + (b.maxX - b.minX) * t, z: b.minZ + inset, faceX: 0, faceZ: -1 };
    case 'E':
      return { x: b.maxX - inset, z: b.minZ + (b.maxZ - b.minZ) * t, faceX: 1, faceZ: 0 };
    case 'W':
      return { x: b.minX + inset, z: b.minZ + (b.maxZ - b.minZ) * t, faceX: -1, faceZ: 0 };
  }
}

/** Is the place open at this New York hour? */
export function isOpen(p: PlaceDef, hour: number): boolean {
  if (!p.hours) return true;
  const [from, to] = p.hours;
  if (to === 24) return hour >= from;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}
