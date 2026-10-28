// =====================================================================
// furniture.ts — every piece of furniture you can have at home.
//
// Each entry is made of one or more models from public/models/interior.glb
// (built by scripts/build-interior-assets.mjs) and lists the actions it
// offers when you tap it (sleep, cook, shower, watch TV…). Pieces with
// no actions are decoration — they still make a home feel lived in, and
// you can still move them around.
//
// TO ADD A PIECE: most home pieces live in data/furniture-catalog.ts
// (model names are the node names in interior.glb, or a builder in
// world/furniture-toys.ts / furniture-deco.ts). Give it a price and a
// category and it shows up in the home Design menu.
// =====================================================================

import { Registry } from '../core/registry.ts';
import { cookActionId, MEALS } from './groceries.ts';
import { CATALOG, OLD_PIECES } from './furniture-catalog.ts';

/** A stove cooks every home meal (data/groceries.ts). */
const COOK_ACTIONS = MEALS.map((m) => cookActionId(m.id));


export interface FurniturePart {
  model: string;
  /** Offset from the piece's centre, in metres (after scaling). */
  x?: number;
  y?: number;
  z?: number;
  /** Extra turn (radians) for this part. */
  rot?: number;
}

export interface FurnitureDef {
  id: string;
  name: string;
  emoji: string;
  /** Price in cents (for the furniture shop, later). */
  price: number;
  parts: FurniturePart[];
  /** Action ids from data/actions.ts offered when tapped. */
  actions: string[];
  /** Flat things (rugs) can be walked over and sit under other furniture. */
  flat?: boolean;
  /** Hangs on a wall (posters, a window AC): snaps to the outer walls when moved. */
  wall?: boolean;
  /**
   * How good it is (see FURNITURE_QUALITY): cheap pieces give back less and
   * can leave you with a downside, luxury pieces give back more. Default basic.
   */
  quality?: Quality;
  /** A downside a cheap piece can give you after using it (chance 0–1). */
  quirk?: { chance: number; moodlet: { id: string; label: string; emoji: string; value: number; minutes: number } };
  /**
   * How you use it: lie on it (beds), sit on it (couches, toilets), sit at
   * it (desks), step into it (showers), or stand at it (default).
   */
  use?: 'lie' | 'sitOn' | 'sitAt' | 'stepIn' | 'stand';
  /** Something to sit on: TV actions sit you on the nearest one. */
  seat?: boolean;
  /** Built in (plumbing, the stove, doors): can't be moved or put in storage. */
  fixed?: boolean;
  /** What it is, for swapping one for another from Storage (a new bed for the old one). */
  kind?: 'bed' | 'couch' | 'tv' | 'chair' | 'lamp' | 'rug' | 'plant' | 'shelf';
  /** One line on what it's for, shown in the shop. */
  pitch?: string;
  /** Pieces with a screen: the TV ad plays on these. */
  tv?: boolean;
  /** Where the screen sits on a TV piece (metres from its centre): width, height, x, y, z. */
  screen?: [number, number, number, number, number];
  /** Opens a screen when tapped (the closet opens your wardrobe). */
  opens?: 'closet' | 'fridge' | 'stove' | 'stairs';
  /** Venue counters: offers whatever the PLACE sells (its actions list) instead of `actions`. */
  placeActions?: boolean;
  /** Where it goes in the buy menu (pieces without one aren't sold there). */
  category?: Category;
  /** Hangs from the ceiling (pendants, chandeliers): place it anywhere, it bumps only into other ceiling pieces. */
  hang?: boolean;
  /** Small decor that sits on the floor OR on top of a table, shelf or counter (vases, lamps, candles). */
  deco?: boolean;
  /** It gives light: lamps glow and light up the room at night (home-interior.ts). */
  light?: LightDef;
  /** Always glowing and animated (venues): disco tiles, a breathing LED bar front, chasing marquee lights. */
  pulse?: 'disco' | 'breathe' | 'chase' | 'steady';
  /** Default colours for its main (fabric) and frame (wood) parts; players can change them. */
  colors?: { a?: string; b?: string };
}

export type Category = 'beds' | 'seating' | 'tables' | 'storage' | 'kitchen' | 'bath' | 'lights' | 'rugs' | 'plants' | 'decor' | 'tech';

/** The buy menu's tabs, in order. */
export const CATEGORIES: { id: Category; name: string; emoji: string }[] = [
  { id: 'seating', name: 'Sofas & seats', emoji: '🛋️' },
  { id: 'beds', name: 'Beds', emoji: '🛏️' },
  { id: 'tables', name: 'Tables', emoji: '🪑' },
  { id: 'lights', name: 'Lights', emoji: '💡' },
  { id: 'rugs', name: 'Rugs', emoji: '🧶' },
  { id: 'decor', name: 'Decor', emoji: '🖼️' },
  { id: 'plants', name: 'Plants', emoji: '🪴' },
  { id: 'storage', name: 'Storage', emoji: '📚' },
  { id: 'tech', name: 'TV & tech', emoji: '📺' },
  { id: 'kitchen', name: 'Kitchen', emoji: '🍳' },
  { id: 'bath', name: 'Bathroom', emoji: '🛁' },
];

/**
 * A light: `kind` decides how it lights the room — a pool of light on the
 * floor below it (ceiling, floor, table lamps), a wash up the wall behind
 * it (LED strips, sconces, neon), or a flicker (fire, candles).
 */
export interface LightDef {
  kind: 'ceiling' | 'floor' | 'table' | 'wall' | 'strip' | 'fire';
  /** How far the light reaches (metres). */
  range: number;
  /** How strong (1 = a normal lamp). */
  power: number;
  /** Where the bulb is, from the piece's origin (metres; hanging pieces are negative). */
  y: number;
  /** Bulb colour (default warm white); players can change it for colour lights. */
  color?: string;
  /** Players can pick its colour (LED strips, neon, lava lamps). */
  colorful?: boolean;
}

export type Quality = 'cheap' | 'basic' | 'nice' | 'luxury';

/**
 * What quality does (Peter, 2026-10-13). `gain` scales what a piece gives
 * back (energy from a bed, fun from a TV); costs like hunger while
 * sleeping are not scaled. `speed` is how fast: a cheap mattress takes
 * longer to rest you, a nice one is quicker. Cheap is modest, not a
 * punishment: a few pieces have an occasional small discomfort (their
 * `quirk`), luxury ones leave a little treat.
 */
export const FURNITURE_QUALITY: Record<Quality, { label: string; gain: number; speed: number; treat?: { id: string; label: string; emoji: string; value: number; minutes: number } }> = {
  cheap: { label: 'Cheap', gain: 0.85, speed: 0.8 },
  basic: { label: 'Basic', gain: 1, speed: 1 },
  nice: { label: 'Nice', gain: 1.2, speed: 1.2 },
  luxury: { label: 'Luxury', gain: 1.35, speed: 1.35, treat: { id: 'luxe', label: 'Living in luxury', emoji: '✨', value: 6, minutes: 60 } },
};

/** Quality in plain words, for sheets and the shop. */
export function qualityLine(q: Quality): string {
  return { cheap: 'restores a bit less, a bit slower', basic: 'does the job', nice: 'restores more, and faster', luxury: 'restores the most, fastest, and feels great' }[q];
}

export const FURNITURE = new Registry<FurnitureDef>('furniture');

/**
 * What the furniture shop sells (Lexington Home Goods): a basic and a nice
 * step up from each starter piece (bed, couch, TV), and a few things to
 * make the room yours. Prices are set so the first useful upgrade (the
 * basic bed) takes a few shifts at the deli.
 */
export const SHOP_ITEMS: string[] = ['bedSingle', 'bedDouble', 'sofa', 'sofaLong', 'tvVintage', 'tv', 'armchair', 'floorLamp', 'rug', 'plant', 'bookcase'];

FURNITURE.add(
  // ---- bedroom
  { id: 'bedDouble', name: 'Double bed', emoji: '🛏️', price: 65_000, parts: [{ model: 'bedDouble' }], actions: ['sleep', 'nap'], use: 'lie', kind: 'bed', quality: 'nice', pitch: 'Big, soft, quick to rest you. Wake up feeling it.' },
  { id: 'bedSingle', name: 'Single bed', emoji: '🛏️', price: 32_000, parts: [{ model: 'bedSingle' }], actions: ['sleep', 'nap'], use: 'lie', kind: 'bed', quality: 'basic', pitch: 'A real mattress: you rest more, faster.' },
  { id: 'nightstand', name: 'Nightstand', emoji: '🗄️', price: 8_000, parts: [{ model: 'cabinetBedDrawer' }, { model: 'lampSquareTable', y: 0.52 }], actions: [] },
  { id: 'closet', name: 'Closet', emoji: '👕', price: 35_000, parts: [{ model: 'bookcaseClosedWide' }], actions: [], opens: 'closet' },
  // ---- kitchen
  { id: 'stove', name: 'Stove', emoji: '🍳', price: 45_000, parts: [{ model: 'kitchenStove' }], actions: COOK_ACTIONS, opens: 'stove', fixed: true },
  { id: 'fridge', name: 'Fridge', emoji: '🧊', price: 50_000, parts: [{ model: 'kitchenFridge' }], actions: ['snack'], opens: 'fridge' },
  { id: 'kitchenSink', name: 'Kitchen sink', emoji: '🚰', price: 20_000, parts: [{ model: 'kitchenSink' }], actions: [], fixed: true },
  { id: 'counter', name: 'Counter', emoji: '🗄️', price: 15_000, parts: [{ model: 'kitchenCabinetDrawer' }, { model: 'kitchenCoffeeMachine', y: 0.9, x: -0.1 }], actions: [] },
  { id: 'counterMicrowave', name: 'Counter + microwave', emoji: '🗄️', price: 22_000, parts: [{ model: 'kitchenCabinet' }, { model: 'kitchenMicrowave', y: 0.9 }], actions: ['snack'] },
  { id: 'diningTable', name: 'Dining table', emoji: '🍽️', price: 25_000, parts: [{ model: 'table' }, { model: 'chairCushion', x: -0.5, z: 0.75, rot: Math.PI }, { model: 'chairCushion', x: 0.5, z: -0.75 }], actions: [] },
  { id: 'breakfastBar', name: 'Breakfast bar', emoji: '🍽️', price: 18_000, parts: [{ model: 'kitchenBar' }, { model: 'stoolBar', z: 0.55 }], actions: [] },
  // ---- bathroom
  { id: 'shower', name: 'Shower', emoji: '🚿', price: 40_000, parts: [{ model: 'shower' }], actions: ['shower'], use: 'stepIn', fixed: true },
  { id: 'bathtub', name: 'Bathtub', emoji: '🛁', price: 70_000, parts: [{ model: 'bathtub' }], actions: ['shower'], use: 'stepIn', fixed: true, quality: 'nice' },
  { id: 'toilet', name: 'Toilet', emoji: '🚽', price: 20_000, parts: [{ model: 'toilet' }], actions: ['toilet'], use: 'sitOn', fixed: true },
  { id: 'bathSink', name: 'Bathroom sink', emoji: '🪥', price: 15_000, parts: [{ model: 'bathroomSink', y: 0.8 }, { model: 'bathroomMirror', y: 1.7, z: -0.2 }], actions: [], fixed: true },
  { id: 'washer', name: 'Washer-dryer', emoji: '🧺', price: 45_000, parts: [{ model: 'washer' }], actions: ['laundry'], fixed: true },
  // ---- living room
  { id: 'sofa', name: 'Sofa', emoji: '🛋️', price: 28_000, parts: [{ model: 'loungeSofa' }, { model: 'pillow', x: -0.6, y: 0.5, z: -0.2 }], actions: ['callMom', 'guitar', 'workout'], use: 'sitOn', seat: true, kind: 'couch', quality: 'basic', pitch: 'No springs poking you. More fun from the couch.' },
  { id: 'sofaLong', name: 'Big sofa', emoji: '🛋️', price: 72_000, parts: [{ model: 'loungeSofaLong' }], actions: ['callMom', 'guitar', 'workout'], use: 'sitOn', seat: true, kind: 'couch', quality: 'nice', pitch: 'Room to stretch out. The best seat in the house.' },
  { id: 'armchair', name: 'Armchair', emoji: '💺', price: 15_000, parts: [{ model: 'loungeChair' }], actions: [], use: 'sitOn', seat: true, kind: 'chair', pitch: 'A comfy seat to watch TV from.' },
  { id: 'coffeeTable', name: 'Coffee table', emoji: '☕', price: 12_000, parts: [{ model: 'tableCoffee' }], actions: [] },
  { id: 'glassTable', name: 'Glass coffee table', emoji: '☕', price: 20_000, parts: [{ model: 'tableCoffeeGlass' }], actions: [] },
  { id: 'tv', name: 'TV', emoji: '📺', price: 52_000, parts: [{ model: 'cabinetTelevision' }, { model: 'televisionModern', y: 0.62 }], actions: ['watchTv', 'gameConsole'], tv: true, kind: 'tv', quality: 'nice', pitch: 'Flat screen on a cabinet, plus a console. TV nights hit different.' },
  { id: 'tvVintage', name: 'Old TV', emoji: '📺', price: 16_000, parts: [{ model: 'televisionVintage' }], actions: ['watchTv'], tv: true, kind: 'tv', quality: 'basic', pitch: 'A proper set: clearer picture, more fun from TV.' },
  { id: 'bookcase', name: 'Bookcase', emoji: '📚', price: 12_000, parts: [{ model: 'bookcaseOpen' }], actions: [], kind: 'shelf', pitch: 'Somewhere for your stuff.' },
  { id: 'bookcaseWide', name: 'Wide bookcase', emoji: '📚', price: 28_000, parts: [{ model: 'bookcaseClosedWide' }], actions: [] },
  { id: 'speaker', name: 'Speaker', emoji: '🔊', price: 15_000, parts: [{ model: 'speaker' }], actions: [] },
  // ---- work
  { id: 'desk', name: 'Laptop desk', emoji: '💻', price: 30_000, parts: [{ model: 'desk' }, { model: 'laptop', y: 0.76 }, { model: 'chairDesk', z: 0.75, rot: Math.PI }], actions: ['codePractice', 'freelance', 'sellOnline', 'postContent', 'doomscroll'], use: 'sitAt' },
  { id: 'deskScreen', name: 'Computer desk', emoji: '🖥️', price: 70_000, parts: [{ model: 'desk' }, { model: 'computerScreen', y: 0.76, z: -0.15 }, { model: 'chairDesk', z: 0.75, rot: Math.PI }], actions: ['codePractice', 'freelance', 'sellOnline', 'postContent', 'doomscroll'], use: 'sitAt', quality: 'nice' },
  // ---- venues (shops, cafés, bars): the counter sells whatever the place sells
  { id: 'serviceCounter', name: 'Counter', emoji: '🛎️', price: 0, parts: [{ model: 'kitchenBar', x: -1.3 }, { model: 'kitchenBar', x: -0.43 }, { model: 'kitchenBar', x: 0.43 }, { model: 'kitchenBar', x: 1.3 }, { model: 'kitchenCoffeeMachine', x: -1.1, y: 0.84, z: -0.05 }], actions: [], placeActions: true },
  { id: 'barCounter', name: 'Bar', emoji: '🍸', price: 0, parts: [{ model: 'kitchenBar', x: -1.7 }, { model: 'kitchenBar', x: -0.85 }, { model: 'kitchenBar', x: 0 }, { model: 'kitchenBar', x: 0.85 }, { model: 'kitchenBar', x: 1.7 }, { model: 'stoolBar', x: -1.3, z: 0.6 }, { model: 'stoolBar', x: 0, z: 0.6 }, { model: 'stoolBar', x: 1.3, z: 0.6 }], actions: [], placeActions: true },
  { id: 'shelf', name: 'Shelf', emoji: '🗄️', price: 0, parts: [{ model: 'bookcaseClosedWide' }], actions: [] },
  { id: 'cafeTable', name: 'Café table', emoji: '☕', price: 0, parts: [{ model: 'tableRound' }, { model: 'chairCushion', x: -0.85, rot: Math.PI / 2 }, { model: 'chairCushion', x: 0.85, rot: -Math.PI / 2 }], actions: [], placeActions: true },
  { id: 'officeDesk', name: 'Desk', emoji: '🖥️', price: 0, parts: [{ model: 'desk' }, { model: 'computerScreen', y: 0.76, z: -0.15 }, { model: 'chairDesk', z: 0.75, rot: Math.PI }], actions: [] },
  { id: 'stageSpeaker', name: 'Speaker', emoji: '🔊', price: 0, parts: [{ model: 'speaker' }], actions: [] },
  // ---- decoration
  { id: 'rug', name: 'Rug', emoji: '🟥', price: 7_000, parts: [{ model: 'rugRectangle' }], actions: [], flat: true, kind: 'rug', pitch: 'Covers the scuffed floor.' },
  { id: 'rugRound', name: 'Round rug', emoji: '⭕', price: 8_000, parts: [{ model: 'rugRound' }], actions: [], flat: true },
  { id: 'plant', name: 'Potted plant', emoji: '🪴', price: 3_000, parts: [{ model: 'pottedPlant' }], actions: [], kind: 'plant', pitch: 'Something alive in the room.' },
  { id: 'floorLamp', name: 'Floor lamp', emoji: '💡', price: 4_500, parts: [{ model: 'lampRoundFloor' }], actions: [], kind: 'lamp', pitch: 'Warm light. Makes the room feel like yours.' },
  { id: 'coatRack', name: 'Coat rack', emoji: '🧥', price: 5_000, parts: [{ model: 'coatRackStanding' }], actions: [] },
  { id: 'sideTable', name: 'Side table', emoji: '🪑', price: 7_000, parts: [{ model: 'sideTable' }, { model: 'plantSmall1', y: 0.76 }], actions: [] },
  { id: 'trashcan', name: 'Trash can', emoji: '🗑️', price: 2_000, parts: [{ model: 'trashcan' }], actions: [] },
);

// ---- Chunky cartoon pieces built in code (world/furniture-toys.ts):
// the broke East Harlem walk-up (Peter, 2026-10-13).
FURNITURE.add(
  { id: 'twinBed', name: 'Twin bed', emoji: '🛏️', price: 18_000, parts: [{ model: 'toyTwinBed' }], actions: ['sleep', 'nap'], use: 'lie', quality: 'cheap', quirk: { chance: 0.12, moodlet: { id: 'stiffBack', label: 'A bit stiff from the old mattress', emoji: '🥴', value: -3, minutes: 60 } }, kind: 'bed' },
  { id: 'crateNightstand', name: 'Milk-crate nightstand', emoji: '🧺', price: 1_500, parts: [{ model: 'toyCrateNightstand' }], actions: [], quality: 'cheap' },
  { id: 'clothesRack', name: 'Clothes rack', emoji: '👕', price: 4_000, parts: [{ model: 'toyClothesRack' }], actions: [], opens: 'closet', quality: 'cheap' },
  { id: 'foldingDesk', name: 'Folding desk', emoji: '💻', price: 6_000, parts: [{ model: 'toyFoldingDesk' }], actions: ['codePractice', 'freelance', 'sellOnline', 'postContent', 'doomscroll'], use: 'sitAt', quality: 'cheap' },
  { id: 'radiator', name: 'Radiator', emoji: '♨️', price: 0, parts: [{ model: 'toyRadiator' }], actions: [], fixed: true, quality: 'cheap' },
  { id: 'laundryPile', name: 'Laundry pile', emoji: '🧦', price: 0, parts: [{ model: 'toyLaundryPile' }], actions: [], quality: 'cheap' },
  { id: 'movingBoxes', name: 'Moving boxes', emoji: '📦', price: 0, parts: [{ model: 'toyMovingBoxes' }], actions: [], quality: 'cheap' },
  { id: 'wornCouch', name: 'Worn couch', emoji: '🛋️', price: 15_000, parts: [{ model: 'toyWornCouch' }], actions: ['callMom', 'guitar', 'workout'], use: 'sitOn', seat: true, quality: 'cheap', quirk: { chance: 0.08, moodlet: { id: 'lumpyCouch', label: 'A spring poked you', emoji: '😣', value: -2, minutes: 30 } }, kind: 'couch' },
  { id: 'crateTv', name: 'Old TV on crates', emoji: '📺', price: 5_000, parts: [{ model: 'toyCrateTv' }], actions: ['watchTv', 'gameConsole'], tv: true, screen: [0.5, 0.36, 0, 0.65, 0.255], quality: 'cheap', kind: 'tv' },
  { id: 'smallTable', name: 'Kitchen table', emoji: '🍽️', price: 9_000, parts: [{ model: 'toySmallTable' }], actions: [], quality: 'cheap' },
  { id: 'roommateDoor', name: "Roommate's door", emoji: '🚪', price: 0, parts: [{ model: 'toyRoommateDoor' }], actions: [], fixed: true },
  { id: 'plantStool', name: 'Pothos', emoji: '🪴', price: 2_500, parts: [{ model: 'toyPlantStool' }], actions: [], quality: 'cheap' },
  { id: 'shoePile', name: 'Shoes by the door', emoji: '👟', price: 0, parts: [{ model: 'toyShoePile' }], actions: [], flat: true, quality: 'cheap' },
  { id: 'wornRug', name: 'Worn rug', emoji: '🟫', price: 3_000, parts: [{ model: 'toyWornRug' }], actions: [], flat: true, quality: 'cheap' },
  { id: 'trashBags', name: 'Trash', emoji: '🗑️', price: 0, parts: [{ model: 'toyTrashBags' }], actions: [], quality: 'cheap' },
  { id: 'oldStove', name: 'Old stove', emoji: '🍳', price: 20_000, parts: [{ model: 'toyOldStove' }], actions: COOK_ACTIONS, opens: 'stove', fixed: true, quality: 'cheap' },
  { id: 'oldFridge', name: 'Old fridge', emoji: '🧊', price: 20_000, parts: [{ model: 'toyOldFridge' }], actions: ['snack'], opens: 'fridge', fixed: true, quality: 'cheap' },
  { id: 'sinkCounter', name: 'Sink and counter', emoji: '🚰', price: 12_000, parts: [{ model: 'toySinkCounter' }], actions: [], fixed: true, quality: 'cheap' },
  { id: 'oldToilet', name: 'Toilet', emoji: '🚽', price: 10_000, parts: [{ model: 'toyToilet' }], actions: ['toilet'], use: 'sitOn', fixed: true, quality: 'cheap' },
  { id: 'tubShower', name: 'Tub and shower', emoji: '🛁', price: 25_000, parts: [{ model: 'toyTubShower' }], actions: ['shower'], use: 'stepIn', fixed: true, quality: 'cheap', quirk: { chance: 0.1, moodlet: { id: 'coldShower', label: 'The hot water ran out early', emoji: '🥶', value: -2, minutes: 30 } } },
  { id: 'posters', name: 'Posters', emoji: '🖼️', price: 1_500, parts: [{ model: 'toyPosters' }], actions: [], wall: true, quality: 'cheap' },
  { id: 'windowAC', name: 'Window AC', emoji: '❄️', price: 9_000, parts: [{ model: 'toyWindowAC' }], actions: [], wall: true, quality: 'cheap' },
  { id: 'pedestalSink', name: 'Bathroom sink', emoji: '🪥', price: 8_000, parts: [{ model: 'toyPedestalSink' }], actions: [], fixed: true, quality: 'cheap' },
);

// ---- The penthouse (billionaire start), built in code like the walk-up's
// pieces but in marble, walnut, brass and velvet. All luxury.
FURNITURE.add(
  { id: 'kingBed', name: 'King bed', emoji: '🛏️', price: 1_800_000, parts: [{ model: 'toyKingBed' }], actions: ['sleep', 'nap'], use: 'lie', kind: 'bed', quality: 'luxury' },
  { id: 'velvetSectional', name: 'Velvet sectional', emoji: '🛋️', price: 1_200_000, parts: [{ model: 'toyVelvetSectional' }], actions: ['callMom', 'guitar', 'workout'], use: 'sitOn', seat: true, kind: 'couch', quality: 'luxury' },
  { id: 'mediaWall', name: 'Home cinema', emoji: '📺', price: 900_000, parts: [{ model: 'toyMediaWall' }], actions: ['watchTv', 'gameConsole'], tv: true, screen: [2.0, 1.1, 0, 1.33, 0.0], kind: 'tv', quality: 'luxury' },
  { id: 'chefRange', name: 'Chef’s range', emoji: '🍳', price: 1_500_000, parts: [{ model: 'toyChefRange' }], actions: COOK_ACTIONS, opens: 'stove', fixed: true, quality: 'luxury' },
  { id: 'chefFridge', name: 'Chef’s fridge', emoji: '🧊', price: 1_200_000, parts: [{ model: 'toyChefFridge' }], actions: ['chefMeal', 'snack'], opens: 'fridge', fixed: true, quality: 'luxury' },
  { id: 'marbleIsland', name: 'Marble island', emoji: '🍽️', price: 800_000, parts: [{ model: 'toyMarbleIsland' }], actions: [], fixed: true, quality: 'luxury' },
  { id: 'soakingTub', name: 'Soaking tub', emoji: '🛁', price: 1_000_000, parts: [{ model: 'toySoakingTub' }], actions: ['soak', 'shower'], use: 'stepIn', fixed: true, quality: 'luxury' },
  { id: 'doubleVanity', name: 'Double vanity', emoji: '🪥', price: 600_000, parts: [{ model: 'toyDoubleVanity' }], actions: [], fixed: true, quality: 'luxury' },
  { id: 'luxToilet', name: 'Toilet', emoji: '🚽', price: 300_000, parts: [{ model: 'toilet' }], actions: ['toilet'], use: 'sitOn', fixed: true, quality: 'luxury' },
  { id: 'grandPiano', name: 'Baby grand piano', emoji: '🎹', price: 4_500_000, parts: [{ model: 'toyGrandPiano' }], actions: ['playPiano'], quality: 'luxury' },
  { id: 'artwork', name: 'Original painting', emoji: '🖼️', price: 2_500_000, parts: [{ model: 'toyArtwork' }], actions: [], wall: true, quality: 'luxury' },
  // ---- Workplace pieces (world/furniture-work.ts), 2026-10-13. `placeActions`
  // marks each room's work station (tap it to work a shift or buy).
  // 🏪 bodega
  { id: 'deliCounter', name: 'Deli counter', emoji: '🥪', price: 0, parts: [{ model: 'toyDeliCounter' }], actions: [], placeActions: true, fixed: true },
  { id: 'flatTopGrill', name: 'Flat-top grill', emoji: '🔥', price: 0, parts: [{ model: 'toyFlatTopGrill' }], actions: ['choppedCheese', 'baconEggCheese'], fixed: true },
  { id: 'drinkCooler', name: 'Drinks cooler', emoji: '🥤', price: 0, parts: [{ model: 'toyDrinkCooler' }], actions: ['bodegaCoffee'], fixed: true },
  { id: 'snackShelf', name: 'Snack aisle', emoji: '🍫', price: 0, parts: [{ model: 'toySnackShelf' }], actions: [], fixed: true },
  { id: 'lottoStand', name: 'Lotto stand', emoji: '🎟️', price: 0, parts: [{ model: 'toyLottoStand' }], actions: ['lottoTicket'], fixed: true },
  { id: 'catBed', name: 'The bodega cat', emoji: '🐈', price: 0, parts: [{ model: 'toyCatBed' }], actions: ['petBodegaCat'], fixed: true },
  { id: 'coffeeStation', name: 'Coffee station', emoji: '☕', price: 0, parts: [{ model: 'toyCoffeeStation' }], actions: ['bodegaCoffee'], fixed: true },
  // 🍸 bar
  { id: 'barTop', name: 'The bar', emoji: '🍸', price: 0, parts: [{ model: 'toyBarTop' }], actions: [], placeActions: true, fixed: true },
  { id: 'bottleWall', name: 'Back bar', emoji: '🍾', price: 0, parts: [{ model: 'toyBottleWall' }], actions: [], fixed: true },
  { id: 'booth', name: 'Booth', emoji: '🛋️', price: 0, parts: [{ model: 'toyBooth' }], actions: ['happyHour', 'dateHere'], fixed: true },
  { id: 'jukebox', name: 'Jukebox', emoji: '🎵', price: 0, parts: [{ model: 'toyJukebox' }], actions: ['jukeboxSong'], fixed: true },
  { id: 'poolTable', name: 'Pool table', emoji: '🎱', price: 0, parts: [{ model: 'toyPoolTable' }], actions: ['playPool', 'poolGame'], fixed: true },
  { id: 'neonSign', name: 'Neon sign', emoji: '💡', price: 0, parts: [{ model: 'toyNeonSign', y: 1.5 }], actions: [], wall: true, fixed: true },
  // 🏋️ gym
  { id: 'gymDesk', name: 'Front desk', emoji: '🏋️', price: 0, parts: [{ model: 'toyGymDesk' }], actions: [], placeActions: true, fixed: true },
  { id: 'treadmill', name: 'Treadmill', emoji: '🏃', price: 0, parts: [{ model: 'toyTreadmill' }], actions: ['playTreadmill', 'treadmill'], fixed: true },
  { id: 'benchPress', name: 'Bench press', emoji: '🏋️', price: 0, parts: [{ model: 'toyBenchPress' }], actions: ['playBench', 'benchPress'], fixed: true },
  { id: 'dumbbellRack', name: 'Dumbbells', emoji: '💪', price: 0, parts: [{ model: 'toyDumbbellRack' }], actions: ['trainHard', 'workout'], fixed: true },
  { id: 'punchingBag', name: 'Heavy bag', emoji: '🥊', price: 0, parts: [{ model: 'toyPunchingBag' }], actions: ['playBag', 'punchBag'], fixed: true },
  { id: 'yogaMats', name: 'Stretch area', emoji: '🧘', price: 0, parts: [{ model: 'toyYogaMats' }], actions: ['playYoga', 'yoga'], fixed: true },
  // 💻 startup
  { id: 'standingDesk', name: 'Your desk', emoji: '💻', price: 0, parts: [{ model: 'toyStandingDesk' }], actions: ['codePractice'], placeActions: true, fixed: true },
  { id: 'beanbags', name: 'Beanbags', emoji: '🫘', price: 0, parts: [{ model: 'toyBeanbags' }], actions: ['beanbagNap'], fixed: true },
  { id: 'pingPong', name: 'Ping-pong table', emoji: '🏓', price: 0, parts: [{ model: 'toyPingPong' }], actions: ['pingPong'], fixed: true },
  { id: 'snackWall', name: 'Snack wall', emoji: '🍫', price: 0, parts: [{ model: 'toySnackWall' }], actions: ['officeSnack'], fixed: true },
  { id: 'whiteboard', name: 'Whiteboard', emoji: '📋', price: 0, parts: [{ model: 'toyWhiteboard', y: 0.9 }], actions: [], wall: true, fixed: true },
  // 📈 trading floor
  { id: 'tradingDesk', name: 'Trading desk', emoji: '📈', price: 0, parts: [{ model: 'toyTradingDesk' }], actions: [], placeActions: true, fixed: true },
  { id: 'tickerWall', name: 'Stock ticker', emoji: '📊', price: 0, parts: [{ model: 'toyTickerWall', y: 1.5 }], actions: [], wall: true, fixed: true },
  { id: 'meetingTable', name: 'Meeting table', emoji: '🤝', price: 0, parts: [{ model: 'toyMeetingTable' }], actions: [], fixed: true },
  { id: 'espressoBar', name: 'Espresso bar', emoji: '☕', price: 0, parts: [{ model: 'toyEspressoBar' }], actions: ['espresso'], fixed: true },
  { id: 'goldBull', name: 'The gold bull', emoji: '🐂', price: 0, parts: [{ model: 'toyGoldBull' }], actions: ['rubBull'], fixed: true },
  // 🌙 club
  { id: 'stage', name: 'The stage', emoji: '🌙', price: 0, parts: [{ model: 'toyStage' }], actions: [], placeActions: true, fixed: true },
  { id: 'djBooth', name: 'DJ booth', emoji: '🎧', price: 0, parts: [{ model: 'toyDjBooth' }], actions: ['djRequest'], fixed: true },
  { id: 'danceFloor', name: 'Dance floor', emoji: '🪩', price: 0, parts: [{ model: 'toyDanceFloor' }], actions: ['dancefloor'], fixed: true },
  { id: 'vipBooth', name: 'VIP booth', emoji: '🍾', price: 0, parts: [{ model: 'toyVipBooth' }], actions: ['getSection', 'bottleService', 'dateHere'], fixed: true },
  // 💊 alley
  { id: 'stashCrates', name: 'Your crates', emoji: '📦', price: 0, parts: [{ model: 'toyStashCrates' }], actions: [], placeActions: true, fixed: true },
  { id: 'dumpster', name: 'Dumpster', emoji: '🗑️', price: 0, parts: [{ model: 'toyDumpster' }], actions: [], fixed: true },
  { id: 'alleyTrash', name: 'Trash bags', emoji: '🛍️', price: 0, parts: [{ model: 'toyAlleyTrash' }], actions: [], fixed: true },
  { id: 'fireEscape', name: 'Fire escape', emoji: '🪜', price: 0, parts: [{ model: 'toyFireEscape' }], actions: [], wall: true, fixed: true },
  { id: 'streetLamp', name: 'Streetlamp', emoji: '💡', price: 0, parts: [{ model: 'toyStreetLamp' }], actions: [], fixed: true },
  { id: 'graffiti', name: 'Graffiti', emoji: '🎨', price: 0, parts: [{ model: 'toyGraffiti', y: 0.3 }], actions: ['photoSelfie'], wall: true, fixed: true },
  // 🚓 precinct
  { id: 'precinctDesk', name: 'Front desk', emoji: '🚓', price: 0, parts: [{ model: 'toyPrecinctDesk' }], actions: [], placeActions: true, fixed: true },
  { id: 'holdingCell', name: 'Holding cell', emoji: '🔒', price: 0, parts: [{ model: 'toyHoldingCell' }], actions: [], fixed: true },
  { id: 'copDesk', name: 'Desk', emoji: '🗂️', price: 0, parts: [{ model: 'toyCopDesk' }], actions: [], fixed: true },
  { id: 'lockers', name: 'Lockers', emoji: '🔐', price: 0, parts: [{ model: 'toyLockers' }], actions: ['lockerChange'], fixed: true },
  { id: 'precinctCoffee', name: 'Coffee pot', emoji: '☕', price: 0, parts: [{ model: 'toyPrecinctCoffee' }], actions: ['precinctCoffee'], fixed: true },
  { id: 'wantedBoard', name: 'Wanted board', emoji: '📌', price: 0, parts: [{ model: 'toyWantedBoard', y: 1.0 }], actions: [], wall: true, fixed: true },
  // For visitors (2026-10-13): what other people come to each place for.
  { id: 'repairBar', name: 'Fix-It Bar', emoji: '📱', price: 0, parts: [{ model: 'toyRepairBar' }], actions: ['fixPhone'], fixed: true },
  { id: 'investorDesk', name: 'Client desk', emoji: '📈', price: 0, parts: [{ model: 'toyInvestorDesk' }], actions: ['investNow', 'tradeStocks'], fixed: true },
  { id: 'reportWindow', name: 'Report window', emoji: '📝', price: 0, parts: [{ model: 'toyReportWindow' }], actions: ['reportCrime'], fixed: true },
  { id: 'windowCounter', name: 'Window counter', emoji: '🥪', price: 0, parts: [{ model: 'toyWindowCounter' }], actions: ['choppedCheese', 'baconEggCheese', 'dateHere'], fixed: true },
  { id: 'highTop', name: 'High-top table', emoji: '🍸', price: 0, parts: [{ model: 'toyHighTop' }], actions: ['happyHour', 'dateHere'], fixed: true },
  { id: 'waitingBench', name: 'Waiting bench', emoji: '🪑', price: 0, parts: [{ model: 'toyWaitingBench' }], actions: [], fixed: true },
  { id: 'velvetRope', name: 'Velvet rope', emoji: '🎟️', price: 0, parts: [{ model: 'toyVelvetRope' }], actions: [], fixed: true },
  // Entertainment (2026-10-14): world/furniture-fun.ts.
  // 🕹️ arcade
  { id: 'cabSnake', name: 'Subway Snake', emoji: '🐍', price: 0, parts: [{ model: 'toyCabSnake' }], actions: ['playSnake'], fixed: true, pulse: 'breathe' },
  { id: 'cabHoops', name: 'Hoop Shot', emoji: '🏀', price: 0, parts: [{ model: 'toyCabHoops' }], actions: ['playHoops'], fixed: true },
  { id: 'cabPigeons', name: 'Pigeon Pop', emoji: '🐦', price: 0, parts: [{ model: 'toyCabPigeons' }], actions: ['playPigeons'], fixed: true, pulse: 'breathe' },
  { id: 'cabBeats', name: 'Beat Street', emoji: '🎵', price: 0, parts: [{ model: 'toyCabBeats' }], actions: ['playBeats'], fixed: true, pulse: 'breathe' },
  { id: 'cabStack', name: 'Bodega Stack', emoji: '🥪', price: 0, parts: [{ model: 'toyCabHoops' }], actions: ['playStack'], fixed: true },
  { id: 'cabDash', name: 'Delivery Dash', emoji: '🛵', price: 0, parts: [{ model: 'toyCabSnake' }], actions: ['playDash'], fixed: true, pulse: 'breathe' },
  { id: 'clawMachine', name: 'Claw machine', emoji: '🧸', price: 0, parts: [{ model: 'toyClawMachine' }], actions: ['playClaw'], fixed: true },
  { id: 'prizeCounter', name: 'Prize counter', emoji: '🎟️', price: 0, parts: [{ model: 'toyPrizeCounter' }], actions: ['prizeCounter'], fixed: true },
  { id: 'airHockeyTable', name: 'Air hockey', emoji: '🏒', price: 0, parts: [{ model: 'toyAirHockey' }], actions: ['playAirhockey', 'airHockey'], fixed: true },
  // 🕹️ more cabinets and 🎰 more tables (2026-10-27)
  { id: 'cabBreakout', name: 'Brooklyn Breakout', emoji: '🧱', price: 0, parts: [{ model: 'toyCabBreakout' }], actions: ['playBreakout'], fixed: true, pulse: 'breathe' },
  { id: 'cabRooftop', name: 'Rooftop Jump', emoji: '🏙️', price: 0, parts: [{ model: 'toyCabRooftop' }], actions: ['playRooftop'], fixed: true, pulse: 'breathe' },
  { id: 'pinballMachine', name: 'Liberty Pinball', emoji: '🗽', price: 0, parts: [{ model: 'toyPinball' }], actions: ['playPinball'], fixed: true, pulse: 'chase' },
  { id: 'skeeBall', name: 'Coney Skee-Ball', emoji: '🎳', price: 0, parts: [{ model: 'toySkeeBall' }], actions: ['playSkeeball'], fixed: true },
  { id: 'pokerTable', name: 'Poker table', emoji: '♠️', price: 0, parts: [{ model: 'toyPokerTable' }], actions: ['playPoker'], fixed: true },
  { id: 'crapsTable', name: 'Craps table', emoji: '🎲', price: 0, parts: [{ model: 'toyCrapsTable' }], actions: ['playCraps'], fixed: true },
  { id: 'baccaratTable', name: 'Baccarat table', emoji: '🂡', price: 0, parts: [{ model: 'toyBaccaratTable' }], actions: ['playBaccarat'], fixed: true },
  { id: 'bigSixWheel', name: 'Big Six wheel', emoji: '🎡', price: 0, parts: [{ model: 'toyBigSix' }], actions: ['playBigSix'], fixed: true },
  { id: 'plinkoBoard', name: 'Plinko', emoji: '🔻', price: 0, parts: [{ model: 'toyPlinko' }], actions: ['playPlinko'], fixed: true, pulse: 'chase' },
  { id: 'scratchKiosk', name: 'Scratch cards', emoji: '🎫', price: 0, parts: [{ model: 'toyScratchKiosk' }], actions: ['playScratch'], fixed: true, pulse: 'breathe' },
  { id: 'videoPoker', name: 'Video poker', emoji: '🃏', price: 0, parts: [{ model: 'toyVideoPoker' }], actions: ['playVideoPoker'], fixed: true, pulse: 'breathe' },
  { id: 'kenoBoard', name: 'Keno board', emoji: '🔢', price: 0, parts: [{ model: 'toyKenoBoard' }], actions: ['playKeno'], fixed: true, pulse: 'disco' },
  // 🎰 casino
  { id: 'slotMachine', name: 'Slot machine', emoji: '🎰', price: 0, parts: [{ model: 'toySlotMachine' }], actions: ['playSlots'], fixed: true, pulse: 'chase' },
  { id: 'blackjackTable', name: 'Blackjack table', emoji: '🃏', price: 0, parts: [{ model: 'toyBlackjackTable' }], actions: ['playBlackjack'], fixed: true },
  { id: 'rouletteTable', name: 'Roulette', emoji: '🎡', price: 0, parts: [{ model: 'toyRouletteTable' }], actions: ['playRoulette'], fixed: true },
  { id: 'rocketScreen', name: 'Rocket', emoji: '🚀', price: 0, parts: [{ model: 'toyRocketScreen' }], actions: ['playRocket'], fixed: true, pulse: 'breathe' },
  { id: 'cashierCage', name: 'Cashier', emoji: '💵', price: 0, parts: [{ model: 'toyCashierCage' }], actions: ['casinoCashier'], fixed: true },
  { id: 'chandelier', name: 'Chandelier', emoji: '💎', price: 0, parts: [{ model: 'toyChandelier' }], actions: [], flat: true, fixed: true },
  // 🌳 park
  // 🍝 Eating out, 👕 shops, 🧪 research, ♟️ chess, 🎳 bowling, 🎬 cinema, ⛳ mini golf, 🪓 axe lanes (world/furniture-town.ts, 2026-10-28).
  { id: 'pizzaOven', name: 'Wood-fired oven', emoji: '🔥', price: 0, parts: [{ model: 'toyPizzaOven' }], actions: ['fullPie'], fixed: true, pulse: 'breathe' },
  { id: 'pizzaCounter', name: 'Pizza counter', emoji: '🍕', price: 0, parts: [{ model: 'toyPizzaCounter' }], actions: [], fixed: true, placeActions: true, pulse: 'steady' },
  { id: 'steamTable', name: 'Steam table', emoji: '🍗', price: 0, parts: [{ model: 'toySteamTable' }], actions: [], fixed: true, placeActions: true, pulse: 'steady' },
  { id: 'trattoriaTable', name: 'Table for four', emoji: '🍝', price: 0, parts: [{ model: 'toyTrattoriaTable' }], actions: [], fixed: true, placeActions: true, pulse: 'breathe' },
  { id: 'wineWall', name: 'Wine wall', emoji: '🍷', price: 0, parts: [{ model: 'toyWineWall' }], actions: ['wineFlight'], fixed: true, pulse: 'steady' },
  { id: 'hostStand', name: 'Host stand', emoji: '📖', price: 0, parts: [{ model: 'toyHostStand' }], actions: ['dateHere'], fixed: true, pulse: 'steady' },
  { id: 'chefPass', name: 'Open kitchen', emoji: '👨‍🍳', price: 0, parts: [{ model: 'toyChefPass' }], actions: ['chefsTable'], fixed: true, pulse: 'steady' },
  { id: 'fineTable', name: 'Table for two', emoji: '🍽️', price: 0, parts: [{ model: 'toyFineTable' }], actions: [], fixed: true, placeActions: true, pulse: 'breathe' },
  { id: 'pastryCase', name: 'Pastry case', emoji: '🥐', price: 0, parts: [{ model: 'toyPastryCase' }], actions: [], fixed: true, placeActions: true, pulse: 'steady' },
  { id: 'menuBoard', name: 'Menu board', emoji: '📋', price: 0, parts: [{ model: 'toyMenuBoard' }], actions: [], fixed: true, wall: true, placeActions: true },
  { id: 'shopRail', name: 'Clothes rail', emoji: '👕', price: 0, parts: [{ model: 'toyShopRail' }], actions: ['browseClothes'], fixed: true },
  { id: 'bargainBin', name: 'Bargain bin', emoji: '🧺', price: 0, parts: [{ model: 'toyBargainBin' }], actions: ['browseClothes'], fixed: true },
  { id: 'mannequin', name: 'Mannequin', emoji: '🧍', price: 0, parts: [{ model: 'toyMannequin' }], actions: ['browseClothes'], fixed: true },
  { id: 'fittingRooms', name: 'Fitting rooms', emoji: '🚪', price: 0, parts: [{ model: 'toyFittingRooms' }], actions: ['browseClothes'], fixed: true },
  { id: 'storageUnit', name: 'Storage unit', emoji: '📦', price: 0, parts: [{ model: 'toyStorageUnit' }], actions: ['storageAuction'], fixed: true },
  { id: 'auctionPodium', name: 'Auctioneer', emoji: '🔨', price: 0, parts: [{ model: 'toyAuctionPodium' }], actions: ['storageAuction'], fixed: true },
  { id: 'bidderChairs', name: 'Bidder seats', emoji: '🪑', price: 0, parts: [{ model: 'toyBidderChairs' }], actions: [], fixed: true },
  { id: 'labBench', name: 'Lab bench', emoji: '🧪', price: 0, parts: [{ model: 'toyLabBench' }], actions: ['clinicalTrial'], fixed: true, pulse: 'breathe' },
  { id: 'examChair', name: 'Exam chair', emoji: '💺', price: 0, parts: [{ model: 'toyExamChair' }], actions: ['clinicalTrial'], fixed: true, pulse: 'steady' },
  { id: 'chessTableWood', name: 'Chess table', emoji: '♟️', price: 0, parts: [{ model: 'toyChessTableWood' }], actions: ['playChess'], fixed: true },
  { id: 'chessCase', name: 'Chess sets', emoji: '♟️', price: 0, parts: [{ model: 'toyChessCase' }], actions: ['playChess'], fixed: true, pulse: 'steady' },
  { id: 'bowlingLane', name: 'Bowling lane', emoji: '🎳', price: 0, parts: [{ model: 'toyBowlingLane' }], actions: ['playBowling'], fixed: true, pulse: 'chase' },
  { id: 'ballReturn', name: 'Ball return', emoji: '🎳', price: 0, parts: [{ model: 'toyBallReturn' }], actions: ['playBowling'], fixed: true },
  { id: 'ballRack', name: 'House balls', emoji: '🎳', price: 0, parts: [{ model: 'toyBallRack' }], actions: ['playBowling'], fixed: true },
  { id: 'shoeCounter', name: 'Shoe rental', emoji: '👟', price: 0, parts: [{ model: 'toyShoeCounter' }], actions: ['playBowling'], fixed: true, pulse: 'breathe' },
  { id: 'bowlingSeats', name: 'Lane seats', emoji: '🛋️', price: 0, parts: [{ model: 'toyBowlingSeats' }], actions: ['happyHour', 'dateHere'], fixed: true },
  { id: 'cinemaScreen', name: 'The big screen', emoji: '🎬', price: 0, parts: [{ model: 'toyCinemaScreen' }], actions: ['watchMovie'], fixed: true, pulse: 'breathe' },
  { id: 'cinemaRow', name: 'Seats', emoji: '💺', price: 0, parts: [{ model: 'toyCinemaRow' }], actions: ['watchMovie', 'dateHere'], fixed: true, pulse: 'steady' },
  { id: 'concessions', name: 'Concessions', emoji: '🍿', price: 0, parts: [{ model: 'toyConcessions' }], actions: ['popcorn'], fixed: true, pulse: 'steady' },
  { id: 'posterBox', name: 'Now showing', emoji: '🎞️', price: 0, parts: [{ model: 'toyPosterBox' }], actions: ['watchMovie'], fixed: true, pulse: 'steady' },
  { id: 'golfHole', name: 'Hole: the cab', emoji: '⛳', price: 0, parts: [{ model: 'toyGolfHole' }], actions: ['playMinigolf'], fixed: true },
  { id: 'golfTower', name: 'Hole: the water tower', emoji: '⛳', price: 0, parts: [{ model: 'toyGolfTower' }], actions: ['playMinigolf'], fixed: true },
  { id: 'golfBridge', name: 'Hole: the bridge', emoji: '⛳', price: 0, parts: [{ model: 'toyGolfBridge' }], actions: ['playMinigolf'], fixed: true },
  { id: 'golfStarter', name: 'First tee', emoji: '⛳', price: 0, parts: [{ model: 'toyGolfStarter' }], actions: ['playMinigolf'], fixed: true },
  { id: 'axeLane', name: 'Axe lane', emoji: '🪓', price: 0, parts: [{ model: 'toyAxeLane' }], actions: ['playAxe'], fixed: true, pulse: 'steady' },
  // 🏋️ The three gyms (world/furniture-active.ts, 2026-10-28).
  { id: 'spinBike', name: 'Spin bike', emoji: '🚴', price: 0, parts: [{ model: 'toySpinBike' }], actions: ['playSpin', 'spinClass'], fixed: true, pulse: 'steady' },
  { id: 'rowingMachine', name: 'Rowing machine', emoji: '🚣', price: 0, parts: [{ model: 'toyRowingMachine' }], actions: ['playRow', 'gymSession'], fixed: true, pulse: 'steady' },
  { id: 'squatRack', name: 'Squat rack', emoji: '🏋️', price: 0, parts: [{ model: 'toySquatRack' }], actions: ['playBench', 'gymSession'], fixed: true },
  { id: 'cableMachine', name: 'Cable machine', emoji: '💪', price: 0, parts: [{ model: 'toyCableMachine' }], actions: ['gymSession'], fixed: true },
  { id: 'kettlebellRack', name: 'Kettlebells', emoji: '🔔', price: 0, parts: [{ model: 'toyKettlebellRack' }], actions: ['gymSession'], fixed: true },
  { id: 'plyoBoxes', name: 'Plyo boxes', emoji: '📦', price: 0, parts: [{ model: 'toyPlyoBoxes' }], actions: ['gymSession'], fixed: true },
  { id: 'turfLane', name: 'Turf lane', emoji: '🛷', price: 0, parts: [{ model: 'toyTurfLane' }], actions: ['gymSession'], flat: true, fixed: true },
  { id: 'ropeMat', name: 'Jump rope mat', emoji: '🪢', price: 0, parts: [{ model: 'toyRopeMat' }], actions: ['playRope'], flat: true, fixed: true },
  { id: 'mirrorPanel', name: 'Mirror', emoji: '🪞', price: 0, parts: [{ model: 'toyMirrorPanel' }], actions: ['photoSelfie'], fixed: true },
  { id: 'weightBench', name: 'Weight bench', emoji: '🏋️', price: 0, parts: [{ model: 'toyWeightBench' }], actions: ['playBench', 'gymSession'], fixed: true },
  { id: 'elliptical', name: 'Elliptical', emoji: '🏃', price: 0, parts: [{ model: 'toyElliptical' }], actions: ['playTreadmill', 'treadmill'], fixed: true, pulse: 'steady' },
  { id: 'battleRopes', name: 'Battle ropes', emoji: '〰️', price: 0, parts: [{ model: 'toyBattleRopes' }], actions: ['gymSession'], fixed: true },
  { id: 'smoothieBar', name: 'Smoothie bar', emoji: '🥤', price: 0, parts: [{ model: 'toySmoothieBar' }], actions: ['smoothie'], fixed: true, pulse: 'steady' },
  { id: 'massageChair', name: 'Massage chair', emoji: '💆', price: 0, parts: [{ model: 'toyMassageChair' }], actions: ['massageChair'], fixed: true, pulse: 'breathe' },
  { id: 'lapPool', name: 'Lap pool', emoji: '🏊', price: 0, parts: [{ model: 'toyLapPool' }], actions: ['lapSwim'], fixed: true, pulse: 'breathe' },
  { id: 'sauna', name: 'Sauna', emoji: '🧖', price: 0, parts: [{ model: 'toySauna' }], actions: ['sauna'], fixed: true, pulse: 'steady' },
  { id: 'towelShelf', name: 'Towels', emoji: '🧺', price: 0, parts: [{ model: 'toyTowelShelf' }], actions: ['gymShower'], fixed: true },
  // 🌳 Central Park, rebuilt (2026-10-28).
  { id: 'lake', name: 'The Lake & Bow Bridge', emoji: '🌉', price: 0, parts: [{ model: 'toyLake' }], actions: ['feedDucks', 'photoSelfie'], fixed: true },
  { id: 'boatDock', name: 'Boathouse dock', emoji: '🚣', price: 0, parts: [{ model: 'toyBoatDock' }], actions: ['rowboat'], fixed: true },
  { id: 'bethesdaFountain', name: 'Angel fountain', emoji: '⛲', price: 0, parts: [{ model: 'toyBethesdaFountain' }], actions: ['fountainWish', 'photoSelfie', 'busk'], fixed: true },
  { id: 'carousel', name: 'The carousel', emoji: '🎠', price: 0, parts: [{ model: 'toyCarousel' }], actions: ['rideCarousel'], fixed: true, pulse: 'chase' },
  { id: 'playground', name: 'Playground', emoji: '🛝', price: 0, parts: [{ model: 'toyPlayground' }], actions: ['swingSet'], fixed: true },
  { id: 'ballField', name: 'Ball field', emoji: '🥎', price: 0, parts: [{ model: 'toyBallField' }], actions: ['softball', 'frisbee', 'lieOnGrass'], flat: true, fixed: true },
  { id: 'backstop', name: 'Backstop', emoji: '🥎', price: 0, parts: [{ model: 'toyBackstop' }], actions: ['softball'], fixed: true },
  { id: 'castle', name: 'The castle', emoji: '🏰', price: 0, parts: [{ model: 'toyCastle' }], actions: ['castleView', 'photoSelfie'], fixed: true },
  { id: 'rocks', name: 'Rocks', emoji: '🪨', price: 0, parts: [{ model: 'toyRocks' }], actions: ['climbRocks'], fixed: true },
  { id: 'flowerBed', name: 'Tulips', emoji: '🌷', price: 0, parts: [{ model: 'toyFlowerBed' }], actions: ['photoSelfie'], fixed: true },
  { id: 'elm', name: 'American elm', emoji: '🌳', price: 0, parts: [{ model: 'toyElm' }], actions: [], fixed: true },
  { id: 'cherryTree', name: 'Cherry tree', emoji: '🌸', price: 0, parts: [{ model: 'toyCherryTree' }], actions: [], fixed: true },
  { id: 'maple', name: 'Maple', emoji: '🍁', price: 0, parts: [{ model: 'toyMaple' }], actions: [], fixed: true },
  { id: 'pine', name: 'Pine', emoji: '🌲', price: 0, parts: [{ model: 'toyPine' }], actions: [], fixed: true },
  { id: 'hedgeRow', name: 'Hedge', emoji: '🌿', price: 0, parts: [{ model: 'toyHedgeRow' }], actions: [], fixed: true },
  { id: 'pretzelCart', name: 'Pretzel & hot dog cart', emoji: '🥨', price: 0, parts: [{ model: 'toyPretzelCart' }], actions: ['hotDogCart', 'halalCart'], fixed: true },
  { id: 'carriage', name: 'Horse carriage', emoji: '🐴', price: 0, parts: [{ model: 'toyCarriage' }], actions: ['carriageRide'], fixed: true },
  { id: 'dogRun', name: 'Dog run', emoji: '🐕', price: 0, parts: [{ model: 'toyDogRun' }], actions: ['petDogs'], fixed: true },
  { id: 'picnicSpot', name: 'Picnic blanket', emoji: '🧺', price: 0, parts: [{ model: 'toyPicnicSpot' }], actions: ['picnic', 'lieOnGrass'], flat: true, fixed: true },
  { id: 'bandshell', name: 'The bandshell', emoji: '🎺', price: 0, parts: [{ model: 'toyBandshell' }], actions: ['bandshell', 'busk'], fixed: true, pulse: 'steady' },
  { id: 'statue', name: 'Statue', emoji: '🗿', price: 0, parts: [{ model: 'toyStatue' }], actions: ['photoSelfie'], fixed: true },
  { id: 'parkBench', name: 'Park bench', emoji: '🪑', price: 0, parts: [{ model: 'toyParkBench' }], actions: ['chillBench', 'peopleWatch', 'dateHere'], fixed: true },
  { id: 'pond', name: 'Duck pond', emoji: '🦆', price: 0, parts: [{ model: 'toyPond' }], actions: ['feedDucks'], fixed: true },
  { id: 'parkTree', name: 'Tree', emoji: '🌳', price: 0, parts: [{ model: 'toyParkTree' }], actions: [], fixed: true },
  { id: 'parkLamp', name: 'Lamp post', emoji: '💡', price: 0, parts: [{ model: 'toyParkLamp' }], actions: [], fixed: true },
  { id: 'iceCreamCart', name: 'Ice cream cart', emoji: '🍦', price: 0, parts: [{ model: 'toyIceCreamCart' }], actions: ['iceCream', 'halalCart'], fixed: true },
  { id: 'lawn', name: 'The lawn', emoji: '🌤️', price: 0, parts: [{ model: 'toyLawn' }], actions: ['lieOnGrass', 'picnic', 'frisbee'], flat: true, fixed: true },
  { id: 'chessTable', name: 'Chess table', emoji: '♟️', price: 0, parts: [{ model: 'toyChessTable' }], actions: ['chess'], fixed: true },
  { id: 'fountain', name: 'Fountain', emoji: '⛲', price: 0, parts: [{ model: 'toyFountain' }], actions: ['fountainWish', 'photoSelfie'], fixed: true },
  // 🛋️ club section
  { id: 'sectionSofa', name: 'VIP section', emoji: '🛋️', price: 0, parts: [{ model: 'toySectionSofa' }], actions: ['getSection', 'bottleService'], fixed: true },
  { id: 'wardrobeWall', name: 'Walk-in wardrobe', emoji: '👔', price: 900_000, parts: [{ model: 'toyWardrobeWall' }], actions: [], opens: 'closet', quality: 'luxury' },
  { id: 'executiveDesk', name: 'Executive desk', emoji: '💻', price: 700_000, parts: [{ model: 'toyExecutiveDesk' }], actions: ['codePractice', 'freelance', 'sellOnline', 'postContent', 'doomscroll'], use: 'sitAt', quality: 'luxury' },
  { id: 'fiddleFig', name: 'Fiddle-leaf fig', emoji: '🪴', price: 40_000, parts: [{ model: 'toyFiddleFig' }], actions: [], kind: 'plant', quality: 'luxury' },
);

// ---- The big home catalogue (2026-10-27): data/furniture-catalog.ts.
FURNITURE.add(...CATALOG(COOK_ACTIONS));
for (const [id, patch] of Object.entries(OLD_PIECES)) {
  const def = FURNITURE.get(id);
  if (def) Object.assign(def, patch);
}
