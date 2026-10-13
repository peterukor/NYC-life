// =====================================================================
// places.ts — every place you can go: homes, shops, bars, parks,
// landmarks and subway stations.
//
// Each place has a REAL location (`at`: lat, lon). At start-up
// resolvePlaces() snaps it to the nearest street block of its area's
// grid (world/layout.ts) and picks a free door spot on the side of the
// block nearest the real spot. So places sit where they are in real New
// York (compressed), and a new place only needs its coordinates.
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
import { project } from '../world/geo-proj.ts';

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
  /** Real location (lat, lon). The door is snapped to the nearest street block (see resolvePlaces). */
  at: [number, number];
  /** Where the Statue of Liberty etc. actually stand, if not at the door (lat, lon). */
  model?: [number, number];
  /** Filled in automatically from `at`. */
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

type RawPlace = Omit<PlaceDef, 'block' | 'side' | 'slot'>;

const RAW: RawPlace[] = [
  // ======================= MANHATTAN =======================
  {
    id: 'hkStudio', area: 'manhattan', name: 'Your Hell’s Kitchen studio', emoji: '🏠', type: 'home',
    blurb: 'Fourth-floor walk-up. Radiator clanks, but the location is unbeatable.',
    at: [40.7615, -73.9905], interior: 'apartment', actions: [], color: '#c0583b', rent: 35_000,
  },
  {
    id: 'shelter', area: 'manhattan', name: 'Hope House Shelter', emoji: '🛏️', type: 'home',
    blurb: 'Free bunk, hot meals, strict curfew. Everyone here is on their way back up.',
    at: [40.766, -73.9925], interior: 'apartment', actions: [], color: '#5b7c99', rent: 0,
  },
  {
    id: 'bodegaHk', area: 'manhattan', name: 'Kings Deli & Grocery', emoji: '🏪', type: 'food',
    blurb: 'Open 24/7. The cat runs the place. Best chopped cheese on Ninth.',
    at: [40.76, -73.9915], interior: 'bodega', color: '#e8b923',
    actions: ['baconEggCheese', 'choppedCheese', 'bodegaCoffee', 'petBodegaCat', 'lottoTicket', 'gistWithOwner'],
  },
  {
    id: 'sliceJoint', area: 'manhattan', name: 'Slice of Ninth', emoji: '🍕', type: 'food',
    blurb: 'Dollar-and-a-half slices, paper plates, zero chairs. Perfect.',
    at: [40.7588, -73.993], hours: [10, 4], interior: 'pizza', color: '#d6402f',
    actions: ['dollarSlice', 'fullPie', 'foldDebate'],
  },
  {
    id: 'beanMachine', area: 'manhattan', name: 'Bean Machine Coffee', emoji: '☕', type: 'cafe',
    blurb: 'Exposed brick, oat milk, and laptops as far as the eye can see.',
    at: [40.764, -73.988], hours: [6, 21], interior: 'cafe', color: '#7a4b2a',
    actions: ['latte', 'bagelSchmear', 'laptopCafe'],
  },
  {
    id: 'diveBar', area: 'manhattan', name: 'The Rusty Nail', emoji: '🍺', type: 'nightlife',
    blurb: 'Dive bar with a jukebox stuck on 2004. Karaoke Thursdays (and every other day).',
    at: [40.7612, -73.9975], hours: [16, 4], interior: 'bar', color: '#8c2f39',
    actions: ['happyHour', 'karaoke', 'streetDeal', 'collectDebt', 'betrayCrew'],
  },
  {
    id: 'comedyCellar', area: 'manhattan', name: 'The Basement Comedy Club', emoji: '😂', type: 'nightlife',
    blurb: 'Two-drink minimum, unlimited heckling. Open mic before the late show.',
    at: [40.76, -73.9848], hours: [18, 2], interior: 'comedy', color: '#3c2a5c',
    actions: ['watchComedy', 'openMic'],
  },
  {
    id: 'ironGym', area: 'manhattan', name: 'Iron Hell’s Kitchen', emoji: '🏋️', type: 'fitness',
    blurb: 'No-frills gym, frills-only clientele.',
    at: [40.765, -73.9965], hours: [5, 23], interior: 'gym', color: '#2b2d42',
    actions: ['gymSession', 'spinClass', 'gymShower'],
  },
  {
    id: 'midtownTower', area: 'manhattan', name: 'Sixth Avenue Tower', emoji: '🏢', type: 'work',
    blurb: 'Glass, granite and a lobby that smells like money.',
    at: [40.759, -73.9815], interior: 'office', color: '#355c7d', actions: ['pitchInvestors', 'dumpWaste', 'bribeCops'],
  },
  {
    id: 'timesSquare', area: 'manhattan', name: 'Times Square', emoji: '🌆', type: 'plaza',
    blurb: 'The crossroads of the world. Giant screens, costumed characters, and the red steps.',
    at: [40.758, -73.9855], interior: 'none', color: '#ff2d55',
    actions: ['peopleWatch', 'photoSelfie', 'hotDogCart', 'busk', 'publicRestroom'],
    landmark: { description: 'Midtown’s famous plaza of giant screens at Broadway and Seventh Avenue.', officialSite: 'https://www.timessquarenyc.org/', siteLabel: 'timessquarenyc.org' },
  },
  {
    id: 'bryantPark', area: 'manhattan', name: 'Bryant Park', emoji: '🌳', type: 'park',
    blurb: 'Lawn, chess tables and the library next door. Midtown’s backyard.',
    at: [40.7536, -73.9832], hours: [7, 23], interior: 'none', color: '#2e8b57',
    actions: ['picnic', 'chess', 'peopleWatch', 'halalCart', 'jog', 'publicRestroom'],
    landmark: { description: 'Nine-acre park behind the New York Public Library’s main branch.', officialSite: 'https://bryantpark.org/', siteLabel: 'bryantpark.org' },
  },
  {
    id: 'empireState', area: 'manhattan', name: 'Empire State Building', emoji: '🏙️', type: 'landmark',
    blurb: '102 floors of Art Deco. The view from the top hits different at night.',
    at: [40.7484, -73.9857], hours: [9, 24], interior: 'none', color: '#c9a227',
    actions: ['observationDeck', 'photoSelfie'],
    landmark: { description: 'The 1931 Art Deco skyscraper on Fifth Avenue at 34th Street.', officialSite: 'https://www.esbnyc.com/', siteLabel: 'esbnyc.com' },
  },
  {
    id: 'timesSqStation', area: 'manhattan', name: 'Times Sq–42 St Station', emoji: '🚇', type: 'station',
    blurb: 'Every line, every type of New Yorker, every kind of music.',
    at: [40.7553, -73.9875], interior: 'none', color: '#0039a6',
    actions: ['subwayShowtime', 'tipPerformer'],
  },
  {
    id: 'hudsonYardsLot', area: 'manhattan', name: 'Hudson Yards lots (coming soon)', emoji: '🚧', type: 'plaza',
    blurb: 'Fenced-off land waiting for the next big thing. Future venues and player plots.',
    at: [40.754, -74.002], interior: 'none', color: '#f4a261', actions: ['peopleWatch'],
  },

  {
    id: 'centralPark', area: 'manhattan', name: 'Central Park', emoji: '🌳', type: 'park',
    blurb: 'Lawns, a lake with rowboats, buskers and the whole city taking a breath.',
    at: [40.7712, -73.9742], hours: [6, 1], interior: 'none', color: '#2e8b57',
    actions: ['picnic', 'jog', 'rowboat', 'peopleWatch', 'busk', 'halalCart', 'publicRestroom'],
    landmark: { description: 'The 843-acre park in the middle of Manhattan, designed by Olmsted and Vaux.', officialSite: 'https://www.centralparknyc.org/', siteLabel: 'centralparknyc.org' },
  },
  {
    id: 'thriftHk', area: 'manhattan', name: 'Hell’s Kitchen Thrift', emoji: '👕', type: 'shop',
    blurb: 'Racks of basics, vintage tees and the occasional mystery jacket.',
    at: [40.757, -73.994], hours: [9, 21], interior: 'none', color: '#2a9d8f',
    actions: ['windowShop'], sells: ['plain'],
  },
  {
    id: 'sohoThreads', area: 'manhattan', name: 'Midtown Threads', emoji: '🛍️', type: 'shop',
    blurb: 'Good basics and the nicer brands. The changing rooms have great lighting.',
    at: [40.752, -73.988], hours: [10, 21], interior: 'none', color: '#3a86ff',
    actions: ['windowShop'], sells: ['plain', 'premium'],
  },
  {
    id: 'fifthBoutique', area: 'manhattan', name: 'Maison Fifth', emoji: '💎', type: 'shop',
    blurb: 'Fifth Avenue designer boutique. They offer you champagne. Prices are not shown on purpose.',
    at: [40.7625, -73.974], hours: [11, 19], interior: 'none', color: '#c9a227',
    actions: ['windowShop'], sells: ['premium', 'exclusive'],
  },
  {
    id: 'fultonMallShop', area: 'brooklyn', name: 'Fulton Street Kicks & Fits', emoji: '👟', type: 'shop',
    blurb: 'Brooklyn streetwear: sneakers, jerseys, puffers.',
    at: [40.6905, -73.986], hours: [10, 21], interior: 'none', color: '#e63946',
    actions: ['windowShop'], sells: ['plain', 'premium'],
  },
  {
    id: 'chrysler', area: 'manhattan', name: 'Chrysler Building', emoji: '🏢', type: 'landmark',
    blurb: 'The shiny Art Deco crown everyone secretly likes best. The lobby is a museum of marble and chrome.',
    at: [40.7516, -73.9755], hours: [8, 18], interior: 'none', color: '#9aa8b8',
    actions: ['photoSelfie'],
    landmark: { description: 'The 1930 Art Deco skyscraper at Lexington Avenue and 42nd Street, famous for its steel crown.', officialSite: 'https://www.nyc.gov/site/lpc/index.page', siteLabel: 'NYC Landmarks Preservation' },
  },
  {
    id: 'flatiron', area: 'manhattan', name: 'Flatiron Building', emoji: '📐', type: 'landmark',
    blurb: 'The wedge-shaped 1902 tower where Broadway meets Fifth. Everyone takes the same photo. You will too.',
    at: [40.7411, -73.9897], interior: 'none', color: '#d9c39b',
    actions: ['photoSelfie'],
    landmark: { description: 'The triangular 1902 skyscraper at Fifth Avenue, Broadway and 23rd Street.', officialSite: 'https://www.nyc.gov/site/lpc/index.page', siteLabel: 'NYC Landmarks Preservation' },
  },
  {
    id: 'statueOfLiberty', area: 'manhattan', name: 'Statue of Liberty', emoji: '🗽', type: 'landmark',
    blurb: 'Lady Liberty, out in the harbor. Wave from the pier, or squint at her torch at night.',
    at: [40.7033, -74.017], model: [40.6892, -74.0445], interior: 'none', color: '#7fcdb4',
    actions: ['photoSelfie'],
    landmark: { description: 'The 1886 copper statue on Liberty Island in New York Harbor, a gift from France.', officialSite: 'https://www.nps.gov/stli/', siteLabel: 'nps.gov/stli' },
  },
  {
    id: 'parkMall', area: 'manhattan', name: 'Central Park Galleria', emoji: '🛍️', type: 'landmark',
    blurb: 'Glass-roofed mall on the park: sneakers, fashion, a food hall and very nice bathrooms.',
    at: [40.7681, -73.9819], hours: [10, 22], interior: 'none', color: '#ff5fa2',
    actions: ['windowShop', 'foodHall', 'photoSelfie', 'publicRestroom'],
  },

  {
    id: 'funland', area: 'manhattan', name: 'Funland', emoji: '🎡', type: 'landmark',
    blurb: 'Ferris wheel, a rickety coaster, carnival games and funnel cake. Screaming encouraged. Right by Central Park.',
    at: [40.7795, -73.9845], hours: [11, 23], interior: 'none', color: '#ff3d7f',
    actions: ['ferrisWheel', 'rollerCoaster', 'carnivalGames', 'funnelCake', 'photoSelfie'],
  },

  // ======================= QUEENS =======================
  {
    id: 'courtSqStation', area: 'queens', name: 'Court Sq Station', emoji: '🚇', type: 'station',
    blurb: 'The 7, the E, the M and the G. One stop from Midtown, a world away.',
    at: [40.7471, -73.9456], interior: 'none', color: '#0039a6',
    actions: ['subwayShowtime', 'tipPerformer'],
  },
  {
    id: 'gantryPlaza', area: 'queens', name: 'Gantry Plaza State Park', emoji: '🌇', type: 'park',
    blurb: 'Old ship gantries, the Pepsi-Cola sign and the best Manhattan skyline view there is.',
    at: [40.7454, -73.9584], hours: [6, 24], interior: 'none', color: '#2e8b57',
    actions: ['picnic', 'peopleWatch', 'jog', 'photoSelfie'],
  },
  {
    id: 'astoriaPark', area: 'queens', name: 'Astoria Park', emoji: '🌳', type: 'park',
    blurb: 'Under the Hell Gate and Triborough bridges: a huge lawn, a track and the city’s oldest pool.',
    at: [40.7786, -73.9228], hours: [6, 23], interior: 'none', color: '#2e8b57',
    actions: ['picnic', 'jog', 'peopleWatch'],
  },
  {
    id: 'beerGarden', area: 'queens', name: 'Astoria Beer Garden', emoji: '🍺', type: 'nightlife',
    blurb: 'Long picnic tables under the trees, pitchers and a grill. Since 1910.',
    at: [40.7728, -73.9093], hours: [12, 2], interior: 'bar', color: '#6a994e',
    actions: ['happyHour', 'karaoke'],
  },
  {
    id: 'jhDeli', area: 'queens', name: 'Jackson Heights Deli', emoji: '🥟', type: 'food',
    blurb: 'Momos, samosas and a chopped cheese, all under the 7 train.',
    at: [40.7557, -73.8831], interior: 'bodega', color: '#e8b923',
    actions: ['baconEggCheese', 'choppedCheese', 'bodegaCoffee', 'petBodegaCat', 'lottoTicket', 'gistWithOwner'],
  },

  // ======================= THE BRONX =======================
  {
    id: 'yankeeStation', area: 'bronx', name: '161 St–Yankee Stadium Station', emoji: '🚇', type: 'station',
    blurb: 'The 4, the B and the D. Game nights, it’s a sea of pinstripes.',
    at: [40.8277, -73.9255], interior: 'none', color: '#0039a6',
    actions: ['subwayShowtime', 'tipPerformer'],
  },
  {
    id: 'yankeeStadium', area: 'bronx', name: 'Yankee Stadium', emoji: '⚾', type: 'landmark',
    blurb: 'The House That Ruth Built, rebuilt across the street. Bleacher creatures welcome.',
    at: [40.8296, -73.9262], interior: 'none', color: '#1c2b5a',
    actions: ['photoSelfie', 'peopleWatch'],
    landmark: { description: 'Home of the New York Yankees since 2009, on East 161st Street in the Bronx.', officialSite: 'https://www.mlb.com/yankees/ballpark', siteLabel: 'mlb.com/yankees' },
  },
  {
    id: 'bronxZoo', area: 'bronx', name: 'Bronx Zoo', emoji: '🦁', type: 'park',
    blurb: 'Tigers, gorillas and a monorail through “Wild Asia”. Bring snacks.',
    at: [40.8506, -73.8769], hours: [10, 17], interior: 'none', color: '#2e8b57',
    actions: ['picnic', 'peopleWatch', 'jog', 'photoSelfie'],
  },
  {
    id: 'arthurAve', area: 'bronx', name: 'Arthur Ave Pizzeria', emoji: '🍕', type: 'food',
    blurb: 'The real Little Italy. Fresh mozz, old-timers arguing, the best slice north of 110th.',
    at: [40.855, -73.888], hours: [10, 23], interior: 'pizza', color: '#c0392b',
    actions: ['dollarSlice', 'fullPie', 'foldDebate'],
  },
  {
    id: 'hubThrift', area: 'bronx', name: 'The Hub Thrift', emoji: '👕', type: 'shop',
    blurb: 'Under the lights at 149th and 3rd: racks, sneakers and bargains.',
    at: [40.8165, -73.9165], hours: [9, 21], interior: 'none', color: '#e76f51',
    actions: ['windowShop'], sells: ['plain'],
  },

  // ======================= BROOKLYN =======================
  {
    // Moved from Brooklyn to Tribeca when Manhattan became the whole game (2026-10-12).
    id: 'wburgLoft', area: 'manhattan', name: 'Tribeca loft (for rent)', emoji: '🏠', type: 'home',
    blurb: 'Big windows, exposed pipes, and a roof you’re technically not allowed on.',
    at: [40.7195, -74.0085], interior: 'apartment', actions: [], color: '#5d6d7e', rent: 90_000,
  },
  {
    // Moved from Brooklyn to Harlem (2026-10-12).
    id: 'sharedApt', area: 'manhattan', name: 'Room in a shared Harlem apartment', emoji: '🏠', type: 'home',
    blurb: 'Three roommates, one bathroom, great vibes (mostly).',
    at: [40.8075, -73.9450], interior: 'apartment', actions: [], color: '#a0522d', rent: 18_000,
  },
  {
    // Moved from Brooklyn to the East Village (2026-10-12).
    id: 'theStoop', area: 'manhattan', name: 'The Stoop', emoji: '🍸', type: 'nightlife',
    blurb: 'Neighbourhood bar with a backyard, a dog, and a bartender who remembers you.',
    at: [40.7265, -73.9845], hours: [15, 4], interior: 'bar', color: '#4a7c59',
    actions: ['happyHour', 'karaoke'],
  },
  {
    id: 'warehouseRave', area: 'brooklyn', name: 'Warehouse 9 (club)', emoji: '🪩', type: 'nightlife',
    blurb: 'Unmarked door, techno till sunrise. Don’t ask for the setlist.',
    at: [40.6985, -73.976], hours: [22, 6], interior: 'club', color: '#7b2cbf',
    actions: ['dancefloor', 'happyHour'],
  },
  {
    id: 'bodegaBk', area: 'brooklyn', name: 'Fulton Mini Market', emoji: '🏪', type: 'food',
    blurb: 'Plantain chips, phone chargers, and the friendliest cat in Brooklyn.',
    at: [40.6872, -73.9802], interior: 'bodega', color: '#e76f51',
    actions: ['baconEggCheese', 'choppedCheese', 'bodegaCoffee', 'petBodegaCat', 'lottoTicket', 'gistWithOwner'],
  },
  {
    id: 'fortGreeneCafe', area: 'brooklyn', name: 'Greene Bean', emoji: '☕', type: 'cafe',
    blurb: 'Brownstone café with a garden and very strong opinions about pour-over.',
    at: [40.688, -73.9725], hours: [7, 20], interior: 'cafe', color: '#6b8f71',
    actions: ['latte', 'bagelSchmear', 'laptopCafe'],
  },
  {
    id: 'bkPizza', area: 'brooklyn', name: 'Flatbush Pie Co.', emoji: '🍕', type: 'food',
    blurb: 'Square slices, grandma pies, and a line out the door on Fridays.',
    at: [40.6822, -73.979], hours: [11, 2], interior: 'pizza', color: '#c1121f',
    actions: ['dollarSlice', 'fullPie', 'foldDebate'],
  },
  {
    // Moved from DUMBO to Chelsea (2026-10-12); the id stays for old saves.
    id: 'dumboWorks', area: 'manhattan', name: 'Chelsea Works', emoji: '💻', type: 'work',
    blurb: 'Converted factory full of startups, bikes and free cold brew.',
    at: [40.7440, -74.0020], interior: 'office', color: '#264653', actions: [],
  },
  {
    id: 'brooklynBridge', area: 'brooklyn', name: 'Brooklyn Bridge', emoji: '🌉', type: 'landmark',
    blurb: 'Stone towers, steel cables, and the best skyline view in town.',
    at: [40.702, -73.9935], interior: 'none', color: '#8d6e63',
    actions: ['walkBridge', 'photoSelfie', 'jog'],
    landmark: { description: 'The 1883 suspension bridge linking Brooklyn and Manhattan over the East River.', officialSite: 'https://www.nyc.gov/html/dot/html/infrastructure/brooklyn-bridge.shtml', siteLabel: 'nyc.gov (NYC DOT)' },
  },
  {
    id: 'fortGreenePark', area: 'brooklyn', name: 'Fort Greene Park', emoji: '🌳', type: 'park',
    blurb: 'Hilltop park with a monument, a farmers market and Saturday pickup games.',
    at: [40.6913, -73.9757], hours: [6, 1], interior: 'none', color: '#40916c',
    actions: ['picnic', 'chess', 'jog', 'peopleWatch', 'busk', 'publicRestroom'],
    landmark: { description: 'Historic Brooklyn park designed by Olmsted and Vaux.', officialSite: 'https://www.nycgovparks.org/parks/fort-greene-park', siteLabel: 'nycgovparks.org' },
  },
  {
    id: 'atlanticPlaza', area: 'brooklyn', name: 'Atlantic Plaza', emoji: '🌆', type: 'plaza',
    blurb: 'Downtown Brooklyn’s bright crossroads: screens, street food and game-night crowds.',
    at: [40.6845, -73.978], interior: 'none', color: '#ff6b35',
    actions: ['peopleWatch', 'photoSelfie', 'halalCart', 'busk', 'publicRestroom'],
  },
  {
    id: 'atlanticArena', area: 'brooklyn', name: 'Atlantic Arena', emoji: '🏀', type: 'landmark',
    blurb: 'Rusted-steel arena. Basketball, concerts and very loud Tuesdays.',
    at: [40.6826, -73.9754], hours: [17, 23], interior: 'none', color: '#6c584c',
    actions: ['catchGame', 'photoSelfie'],
  },
  {
    id: 'atlanticStation', area: 'brooklyn', name: 'Atlantic Av–Barclays Ctr Station', emoji: '🚇', type: 'station',
    blurb: 'Nine lines meet under Flatbush. Mind the gap.',
    at: [40.684, -73.977], interior: 'none', color: '#0039a6',
    actions: ['subwayShowtime', 'tipPerformer'],
  },
];

// The Bronx places are appended to RAW below (see BRONX_PLACES).

/** Landmarks that fill their whole block (no ordinary buildings there). */
export const FULL_BLOCK_LANDMARKS = new Set(['empireState', 'atlanticArena', 'parkMall', 'chrysler', 'flatiron', 'yankeeStadium']);

/**
 * Snap every place to a door spot: the free (block, side, slot) whose door
 * is closest to the place's real location. Parks and plazas go on blocks of
 * their own kind; whole-block landmarks claim their block first.
 */
function resolvePlaces(raw: RawPlace[]): PlaceDef[] {
  const taken = new Set<string>();
  const fullBlocks = new Set<string>();
  const order = [...raw].sort((a, b) => Number(FULL_BLOCK_LANDMARKS.has(b.id)) - Number(FULL_BLOCK_LANDMARKS.has(a.id)) || Number(b.type === 'park' || b.type === 'plaza') - Number(a.type === 'park' || a.type === 'plaza'));
  const out = new Map<string, PlaceDef>();
  for (const rp of order) {
    const d = DISTRICTS[rp.area];
    const target = project(rp.at[0], rp.at[1]);
    const wantKind = rp.id === 'hudsonYardsLot' ? 'vacant' : rp.id === 'funland' ? 'plaza' : rp.type === 'park' ? 'park' : rp.type === 'plaza' ? 'plaza' : 'buildings';
    let best: { c: number; r: number; side: PlaceDef['side']; slot: number; dist: number } | null = null;
    for (let c = 0; c < d.cols; c++) {
      for (let r = 0; r < d.rows; r++) {
        const kind = d.kind(c, r);
        if (kind !== wantKind && !(wantKind === 'buildings' && kind === 'plaza' && rp.type === 'station')) continue;
        if (fullBlocks.has(`${c},${r}`)) continue;
        for (const side of ['N', 'S', 'E', 'W'] as const) {
          for (let slot = 0; slot < 4; slot++) {
            if (taken.has(`${rp.area},${c},${r},${side},${slot}`)) continue;
            const door = doorOf({ area: rp.area, block: [c, r], side, slot } as PlaceDef);
            const dist = Math.hypot(door.x - target.x, door.z - target.z);
            if (!best || dist < best.dist) best = { c, r, side, slot, dist };
          }
        }
      }
    }
    if (!best) throw new Error(`No room for place ${rp.id}`);
    taken.add(`${rp.area},${best.c},${best.r},${best.side},${best.slot}`);
    if (FULL_BLOCK_LANDMARKS.has(rp.id)) fullBlocks.add(`${best.c},${best.r}`);
    out.set(rp.id, { ...rp, block: [best.c, best.r], side: best.side, slot: best.slot });
  }
  return raw.map((p) => out.get(p.id)!);
}

export const PLACES: PlaceDef[] = resolvePlaces(RAW);

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
