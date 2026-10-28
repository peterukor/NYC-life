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
import { UPTOWN_PLACES } from './uptown.ts';
import { NORTH_PLACES } from './north.ts';

export type InteriorKind = 'apartment' | 'pier' | 'restaurant' | 'bowling' | 'cinema' | 'golf' | 'shop' | 'bodega' | 'pizza' | 'cafe' | 'bar' | 'club' | 'office' | 'gym' | 'comedy' | 'furniture' | 'alley' | 'precinct' | 'arcade' | 'casino' | 'park' | 'none';

export type PlaceType = 'home' | 'food' | 'cafe' | 'nightlife' | 'work' | 'fitness' | 'park' | 'plaza' | 'landmark' | 'station' | 'shop' | 'fun';

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
  /** What the weekly bill is called (default "Weekly rent"; the penthouse pays building fees). */
  rentLabel?: string;
}

export type RawPlace = Omit<PlaceDef, 'block' | 'side' | 'slot'>;

const RAW: RawPlace[] = [
  // ======================= MANHATTAN =======================
  {
    id: 'hkStudio', area: 'manhattan', name: 'Your Hell’s Kitchen studio', emoji: '🏠', type: 'home',
    blurb: 'Fourth-floor walk-up. Radiator clanks, but the location is unbeatable.',
    at: [40.7615, -73.9905], interior: 'apartment', actions: [], color: '#c0583b', rent: 35_000,
  },
  {
    // The rich start (about 1 in 11): a doorman building on the Upper East Side.
    id: 'uesApt', area: 'manhattan', name: 'Your Upper East Side two-bedroom', emoji: '🏛️', type: 'home',
    blurb: 'Doorman, elevator, washer-dryer in the unit. The guest room is mostly for your stuff.',
    at: [40.7745, -73.9565], interior: 'apartment', actions: [], color: '#1d3a8a', rent: 120_000,
  },
  {
    // The billionaire start (1 in 100): a full floor on Billionaires' Row.
    id: 'penthouse', area: 'manhattan', name: 'Your penthouse on Billionaires’ Row', emoji: '🏙️', type: 'home',
    blurb: 'Ninety floors up, Central Park out every window. The chef starts at 7.',
    at: [40.7662, -73.9785], interior: 'apartment', actions: [], color: '#b08d2e', rent: 400_000, rentLabel: 'Building fees',
  },
  {
    id: 'shelter', area: 'manhattan', name: 'Hope House Shelter', emoji: '🛏️', type: 'home',
    blurb: 'Free bunk, hot meals, strict curfew. Everyone here is on their way back up.',
    at: [40.766, -73.9925], interior: 'apartment', actions: [], color: '#5b7c99', rent: 0,
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
    // Moved to Brooklyn (Peter, 2026-10-27: four bars, spread across the city).
    id: 'diveBar', area: 'brooklyn', name: 'The Rusty Nail', emoji: '🍺', type: 'nightlife',
    blurb: 'Brooklyn dive bar with a jukebox stuck on 2004, two pool tables and a back room where deals get done.',
    at: [40.6948, -73.9832], hours: [16, 4], interior: 'bar', color: '#8c2f39',
    actions: ['happyHour', 'karaoke', 'playPool', 'streetDeal', 'collectDebt', 'betrayCrew'],
  },
  {
    id: 'comedyCellar', area: 'manhattan', name: 'The Basement Comedy Club', emoji: '😂', type: 'nightlife',
    blurb: 'Two-drink minimum, unlimited heckling. Open mic before the late show.',
    at: [40.76, -73.9848], hours: [18, 2], interior: 'comedy', color: '#3c2a5c',
    actions: ['watchComedy', 'openMic'],
  },
  {
    id: 'ironGym', area: 'manhattan', name: 'Iron Hell’s Kitchen', emoji: '🏋️', type: 'fitness',
    blurb: 'The neighbourhood gym: free weights, a turf lane, a spin room and a front desk that knows your name.',
    at: [40.765, -73.9965], hours: [5, 23], interior: 'gym', color: '#2b2d42',
    actions: ['gymSession', 'spinClass', 'gymShower'],
  },
  {
    id: 'flexFulton', area: 'brooklyn', name: 'Flex Fitness Fulton', emoji: '💪', type: 'fitness',
    blurb: 'Cheap, purple, open all night. Rows of treadmills, a wall of mirrors and a massage chair with a waiting list.',
    at: [40.6880, -73.9800], interior: 'gym', color: '#7b2cbf',
    actions: ['gymSession', 'gymShower'],
  },
  {
    id: 'pulseLic', area: 'manhattan', name: 'Pulse Tribeca', emoji: '🏊', type: 'fitness',
    blurb: 'The fancy one on Hudson Street in Tribeca: a lap pool, a sauna, eucalyptus towels and a skyline view from the rowers.',
    at: [40.7193, -74.0090], hours: [5, 24], interior: 'gym', color: '#0f766e',
    actions: ['gymSession', 'spinClass', 'lapSwim', 'sauna', 'gymShower'],
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
    // A walkable park inside (data/venues.ts → park): benches, the lawn, a duck pond, the fountain.
    at: [40.7712, -73.9742], hours: [6, 1], interior: 'park', color: '#2e8b57',
    actions: ['picnic', 'jog', 'rowboat', 'peopleWatch', 'busk', 'halalCart', 'publicRestroom'],
    landmark: { description: 'The 843-acre park in the middle of Manhattan, designed by Olmsted and Vaux.', officialSite: 'https://www.centralparknyc.org/', siteLabel: 'centralparknyc.org' },
  },
  {
    id: 'thriftHk', area: 'manhattan', name: 'Hell’s Kitchen Thrift', emoji: '👕', type: 'shop',
    blurb: 'Racks of basics, vintage tees and the occasional mystery jacket.',
    at: [40.757, -73.994], hours: [9, 21], interior: 'shop', color: '#2a9d8f',
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
  {
    // Entertainment (Peter, 2026-10-14): five cabinets and a prize counter (ui/arcade.ts).
    id: 'pixelPalace', area: 'manhattan', name: 'Pixel Palace Arcade', emoji: '🕹️', type: 'nightlife',
    blurb: 'Times Square neon: Snake, Hoop Shot, Beat Street, pinball, air hockey, a claw machine that’s definitely rigged and a prize wall of plush pigeons.',
    at: [40.7593, -73.9873], hours: [10, 2], interior: 'arcade', color: '#ff4fa3',
    actions: ['playSnake', 'playHoops', 'playPigeons', 'playBeats', 'playPinball', 'playBreakout', 'playAirhockey', 'playClaw', 'prizeCounter'],
  },
  {
    // In-game money only (sim/casino.ts). Slots, blackjack, roulette and the Rocket.
    id: 'empireCasino', area: 'manhattan', name: 'Empire Casino', emoji: '🎰', type: 'nightlife',
    blurb: 'Chandeliers, red carpet, high-limit poker and baccarat, and a Rocket game that only goes up. Until it doesn’t.',
    at: [40.7565, -73.9975], interior: 'casino', color: '#c1272d',
    actions: ['playSlots', 'playBlackjack', 'playRoulette', 'playRocket', 'playPoker', 'playBaccarat', 'playBigSix', 'playVideoPoker', 'casinoCashier'],
  },
  // More arcades and casinos (Peter, 2026-10-27: three arcades, four casinos, across the boroughs). Game money only.
  {
    id: 'kingsArcade', area: 'brooklyn', name: 'Kings Arcade', emoji: '🕹️', type: 'nightlife',
    blurb: 'A boardwalk arcade in Downtown Brooklyn: skee-ball lanes, pinball, air hockey, Rooftop Jump and the loudest prize bell in the borough.',
    at: [40.6893, -73.9843], hours: [10, 2], interior: 'arcade', color: '#ff7f11',
    actions: ['playSkeeball', 'playPinball', 'playHoops', 'playDash', 'playStack', 'playRooftop', 'playAirhockey', 'playClaw', 'prizeCounter'],
  },
  {
    id: 'hubArcade', area: 'manhattan', name: 'Canal Street Arcade', emoji: '🕹️', type: 'nightlife',
    blurb: 'Down a Chinatown stairwell off Canal Street: retro cabinets under blacklight, Beat Street battles, Brooklyn Breakout, Rooftop Jump, skee-ball and a dance pad crowd.',
    at: [40.7181, -73.9990], hours: [11, 2], interior: 'arcade', color: '#7bd8ff',
    actions: ['playBeats', 'playSnake', 'playRooftop', 'playBreakout', 'playPigeons', 'playSkeeball', 'playDash', 'playClaw', 'prizeCounter'],
  },
  {
    id: 'astoriaRoyale', area: 'queens', name: 'Astoria Royale Casino', emoji: '🎲', type: 'nightlife',
    blurb: 'Loud, lucky and open all night: a packed craps pit, keno on the big board, Plinko, scratch cards and a wall of slots.',
    at: [40.7650, -73.9180], interior: 'casino', color: '#2a9d8f',
    actions: ['playSlots', 'playCraps', 'playRoulette', 'playKeno', 'playPlinko', 'playScratch', 'playVideoPoker', 'playBigSix', 'casinoCashier'],
  },
  {
    id: 'navyYardClub', area: 'manhattan', name: 'Bowery Card Club', emoji: '♠️', type: 'nightlife',
    blurb: 'An old Bowery warehouse turned card room and pool hall: Hold’em tables, baccarat, craps and money games on the pool tables.',
    at: [40.7246, -73.9921], interior: 'casino', color: '#1d3557',
    actions: ['playPoker', 'playBlackjack', 'playBaccarat', 'playCraps', 'playPool', 'playSlots', 'casinoCashier'],
  },
  {
    id: 'luckyStar', area: 'bronx', name: 'Lucky Star Casino', emoji: '⭐', type: 'nightlife',
    blurb: 'Neon stars on the Concourse: cheap slots, Plinko, keno, scratch cards, the Rocket and a pool table with a waiting list.',
    at: [40.8262, -73.9198], interior: 'casino', color: '#ffd23f',
    actions: ['playSlots', 'playPlinko', 'playScratch', 'playKeno', 'playRocket', 'playRoulette', 'playPool', 'casinoCashier'],
  },

  // ======================= QUEENS =======================
  {
    id: 'courtSqStation', area: 'queens', name: 'Court Sq Station', emoji: '🚇', type: 'station',
    blurb: 'The 7, the E, the M and the G. One stop from Midtown, a world away.',
    at: [40.7471, -73.9456], interior: 'none', color: '#0039a6',
    actions: ['subwayShowtime', 'tipPerformer'],
  },
  {
    id: 'beerGarden', area: 'queens', name: 'Astoria Beer Garden', emoji: '🍺', type: 'nightlife',
    blurb: 'Long picnic tables under the trees, pitchers and a grill. Since 1910.',
    at: [40.7728, -73.9093], hours: [12, 2], interior: 'bar', color: '#6a994e',
    actions: ['happyHour', 'karaoke', 'playPool'],
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
    actions: ['sportsbook', 'catchGame', 'photoSelfie', 'peopleWatch'],
    landmark: { description: 'Home of the New York Yankees since 2009, on East 161st Street in the Bronx.', officialSite: 'https://www.mlb.com/yankees/ballpark', siteLabel: 'mlb.com/yankees' },
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
    // The broke start (Peter, 2026-10-13): East Harlem, 116th St near 2nd Ave.
    id: 'sharedApt', area: 'manhattan', name: 'Room in an East Harlem walk-up', emoji: '🏠', type: 'home',
    blurb: 'Fourth floor, no elevator. Two roommates, one bathroom, a radiator that clanks all night, and the best bodega in El Barrio downstairs.',
    at: [40.7975, -73.9395], interior: 'apartment', actions: [], color: '#a0522d', rent: 18_000,
  },
  {
    // The starter job (Peter, 2026-10-13): a deli round the corner from the walk-up.
    id: 'barrioDeli', area: 'manhattan', name: 'El Barrio Deli & Grill', emoji: '🏪', type: 'food',
    blurb: 'Chopped cheese, café con leche and the whole block’s gossip. Always hiring for the counter.',
    at: [40.7968, -73.9402], hours: [6, 23], interior: 'bodega', color: '#d9480f',
    actions: ['choppedCheese', 'bodegaCoffee', 'baconEggCheese', 'petBodegaCat', 'lottoTicket', 'gistWithOwner'],
  },
  // Eating out (Peter, 2026-10-28: "3 local restaurants, 1 mid tier and 1 high tier").
  {
    id: 'mulberryTrattoria', area: 'manhattan', name: 'Mulberry Street Trattoria', emoji: '🍝', type: 'food',
    blurb: 'Little Italy, red-checked tablecloths, a waiter who calls everyone “boss”. Sunday sauce every day of the week.',
    at: [40.7196, -73.9972], hours: [11, 24], interior: 'restaurant', color: '#c1121f',
    actions: ['pastaDinner', 'chickenParm', 'cannoli'],
  },
  {
    id: 'gramercyRoom', area: 'manhattan', name: 'The Gramercy Room', emoji: '🥂', type: 'food',
    blurb: 'Fine dining off Gramercy Park: twelve courses, tweezers in the kitchen, a sommelier with opinions. Dress nice.',
    at: [40.7378, -73.9862], hours: [17, 24], interior: 'restaurant', color: '#1d3557',
    actions: ['tastingMenu', 'wineFlight', 'chefsTable'],
  },
  // Nights out (2026-10-28): bowling, the movies, rooftop mini golf.
  {
    id: 'hkLanes', area: 'manhattan', name: 'Hell’s Kitchen Lanes', emoji: '🎳', type: 'fun',
    blurb: 'Twelve glow-in-the-dark lanes off Tenth Avenue, rental shoes of questionable history, a bar and a jukebox.',
    at: [40.7615, -73.9940], hours: [12, 2], interior: 'bowling', color: '#7209b7',
    actions: ['playBowling', 'happyHour'],
  },
  {
    id: 'unionSqCinema', area: 'manhattan', name: 'Union Square Pictures', emoji: '🎬', type: 'fun',
    blurb: 'A big old movie house on Union Square: red seats, a massive screen, butter on everything.',
    at: [40.7352, -73.9905], hours: [10, 2], interior: 'cinema', color: '#9d0208',
    actions: ['watchMovie', 'popcorn'],
  },
  {
    id: 'seaportGolf', area: 'manhattan', name: 'Seaport Rooftop Golf', emoji: '⛳', type: 'fun',
    blurb: 'Nine holes of mini golf on a rooftop at the South Street Seaport, with the Brooklyn Bridge in the background.',
    at: [40.7060, -74.0032], hours: [11, 24], interior: 'golf', color: '#2a9d8f',
    actions: ['playMinigolf', 'happyHour'],
  },
  {
    // Night Dancer's club (Peter, 2026-10-13). Kept PG-13: shows, tips and the odd rowdy customer.
    id: 'velvetRoom', area: 'manhattan', name: 'The Velvet Room', emoji: '🌙', type: 'nightlife',
    blurb: 'Purple lights, a mirrored stage, a DJ who only plays bangers. Doors at 8 PM.',
    at: [40.7562, -73.9895], hours: [20, 4], interior: 'club', color: '#7b2cbf',
    actions: ['getSection', 'bottleService', 'dancefloor', 'happyHour', 'mingle'],
  },
  // Fun things to do in person (Peter, 2026-10-15): chess, art, fishing, cycling.
  {
    id: 'chessHouse', area: 'manhattan', name: 'The Chess House', emoji: '♟️', type: 'fun',
    blurb: 'A narrow shop on Thompson Street full of chess sets and people who take chess very seriously. Play for fun, or for money.',
    at: [40.7299, -73.9993], hours: [11, 24], interior: 'cafe', color: '#6b4226',
    actions: ['playChess'],
  },
  {
    id: 'artParlor', area: 'manhattan', name: 'Bowery Art Parlor', emoji: '🎨', type: 'fun',
    blurb: 'Easels, paint everywhere, a gallery wall. Paint something, hang it, and see if the city likes it.',
    at: [40.7243, -73.9928], hours: [10, 23], interior: 'cafe', color: '#e76f51',
    actions: ['paintArt', 'viewGallery'],
  },
  {
    id: 'pier84', area: 'manhattan', name: 'Pier 84 Fishing', emoji: '🎣', type: 'fun',
    blurb: 'Free fishing on the Hudson. Rods to borrow, a bucket, and a morning derby: biggest fish by 11 AM wins cash.',
    at: [40.7635, -73.9982], hours: [5, 22], interior: 'pier', color: '#3a86ff',
    actions: ['goFishing', 'fishDerby'],
  },
  {
    id: 'bikeLoop', area: 'manhattan', name: 'Central Park Bike Loop', emoji: '🚴', type: 'fun',
    blurb: 'Grab a Citi Bike at Columbus Circle and race the six-mile loop. Racers line up every hour. Watch the corners.',
    at: [40.7678, -73.9813], hours: [6, 22], interior: 'none', color: '#2a9d8f',
    actions: ['bikeRace'],
  },
  // More clubs, one per level (data/clubs.ts has the door policy and what makes each bigger).
  {
    // Moved to the Bronx (Peter, 2026-10-27: clubs across the boroughs). The easy door: everyone starts here.
    id: 'basement212', area: 'manhattan', name: 'Ludlow Basement', emoji: '🎧', type: 'nightlife',
    blurb: 'Down a staircase on Ludlow Street, Lower East Side. Graffiti, speaker stacks, cage dancers, nobody checks your shoes. Everyone starts here.',
    at: [40.7203, -73.9884], hours: [21, 4], interior: 'club', color: '#e63946',
    actions: ['bottleService', 'dancefloor', 'happyHour', 'mingle'],
  },
  {
    // Moved to Long Island City and open 24/7 (Peter, 2026-10-27): day party, night party.
    id: 'skyeRooftop', area: 'queens', name: 'Skye Rooftop LIC', emoji: '🌆', type: 'nightlife',
    blurb: 'A rooftop in Long Island City staring straight at the Manhattan skyline. Day party, night party, it never closes.',
    at: [40.7468, -73.9520], interior: 'club', color: '#ff8fab',
    actions: ['getSection', 'bottleService', 'dancefloor', 'happyHour', 'mingle'],
  },
  {
    id: 'aurumClub', area: 'manhattan', name: 'Aurum', emoji: '💎', type: 'nightlife',
    blurb: 'No sign on the door. Gold everything, chandeliers, a famous DJ. Members only: billionaires, celebrities, and now maybe you.',
    at: [40.7625, -73.9735], hours: [22, 4], interior: 'club', color: '#ffd700',
    actions: ['getSection', 'bottleService', 'dancefloor', 'happyHour', 'mingle'],
  },
  {
    // Alley Pharmacist's spot. Every product here is made up.
    id: 'theAlley', area: 'manhattan', name: 'Orchard Street Alley', emoji: '💊', type: 'work',
    blurb: 'Between a laundromat and a closed nail salon. Dumpsters, a fire escape, and customers who don’t make eye contact.',
    at: [40.7185, -73.9905], interior: 'alley', color: '#5c4b51',
    actions: [],
  },
  {
    // The Cop career's precinct (a fictional one).
    id: 'precinct', area: 'manhattan', name: '18th Precinct', emoji: '🚓', type: 'work',
    blurb: 'Green lamps by the door, a desk sergeant who’s seen everything, and the worst coffee in Midtown.',
    at: [40.7635, -73.9850], interior: 'precinct', color: '#1d3557',
    actions: [],
  },
  {
    // The first furniture shop: basic and nice alternatives to the starter pieces.
    id: 'homeGoods', area: 'manhattan', name: 'Lexington Home Goods', emoji: '🛋️', type: 'shop',
    blurb: 'Beds, couches and TVs, delivered same day. Floor models, fair prices.',
    at: [40.7955, -73.9428], hours: [9, 21], interior: 'furniture', color: '#2b7a78',
    actions: [],
  },
  {
    // Moved from Brooklyn to the East Village (2026-10-12).
    id: 'theStoop', area: 'manhattan', name: 'The Stoop', emoji: '🍸', type: 'nightlife',
    blurb: 'Neighbourhood bar with a backyard, a dog, and a bartender who remembers you.',
    at: [40.7265, -73.9845], hours: [15, 4], interior: 'bar', color: '#4a7c59',
    actions: ['happyHour', 'karaoke'],
  },
  {
    // Open 24/7 (Peter, 2026-10-27): techno round the clock.
    id: 'warehouseRave', area: 'brooklyn', name: 'Warehouse 9', emoji: '🪩', type: 'nightlife',
    blurb: 'An unmarked door in an old warehouse. Lasers, cage dancers, techno round the clock. It never closes.',
    at: [40.6985, -73.976], interior: 'club', color: '#3dff6e',
    actions: ['getSection', 'bottleService', 'dancefloor', 'happyHour', 'mingle'],
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
    id: 'atlanticPlaza', area: 'brooklyn', name: 'Atlantic Plaza', emoji: '🌆', type: 'plaza',
    blurb: 'Downtown Brooklyn’s bright crossroads: screens, street food and game-night crowds.',
    at: [40.6845, -73.978], interior: 'none', color: '#ff6b35',
    actions: ['peopleWatch', 'photoSelfie', 'halalCart', 'busk', 'publicRestroom'],
  },
  {
    id: 'atlanticArena', area: 'brooklyn', name: 'Atlantic Arena', emoji: '🏀', type: 'landmark',
    blurb: 'Rusted-steel arena. Basketball, concerts and very loud Tuesdays.',
    at: [40.6826, -73.9754], hours: [17, 23], interior: 'none', color: '#6c584c',
    actions: ['sportsbook', 'catchGame', 'photoSelfie'],
  },
  {
    id: 'atlanticStation', area: 'brooklyn', name: 'Atlantic Av–Barclays Ctr Station', emoji: '🚇', type: 'station',
    blurb: 'Nine lines meet under Flatbush. Mind the gap.',
    at: [40.684, -73.977], interior: 'none', color: '#0039a6',
    actions: ['subwayShowtime', 'tipPerformer'],
  },
];

// Midtown and uptown, and their darkly funny activities (data/uptown.ts, 2026-10-16).
RAW.push(...UPTOWN_PLACES, ...NORTH_PLACES);

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
