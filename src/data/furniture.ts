// =====================================================================
// furniture.ts — every piece of furniture you can have at home.
//
// Each entry is made of one or more models from public/models/furniture.glb
// (built by scripts/build-furniture-assets.mjs) and lists the actions it
// offers when you tap it (sleep, cook, shower, watch TV…). Pieces with
// no actions are decoration — they still make a home feel lived in, and
// you can still move them around.
//
// TO ADD A PIECE: add an entry here (model names are the .glb file
// names from the Kenney Furniture Kit; add new ones to MODELS in the
// build script first). Give it a price so it can be sold in shops later.
// =====================================================================

import { Registry } from '../core/registry.ts';

/** Kenney furniture is modelled small: this makes a double bed ~2 m long. */
export const FURN_SCALE = 2;

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
  /** Pieces with a screen: the TV ad plays on these. */
  tv?: boolean;
  /** Where the screen sits on a TV piece (metres from its centre): width, height, x, y, z. */
  screen?: [number, number, number, number, number];
  /** Opens a screen when tapped (the closet opens your wardrobe). */
  opens?: 'closet';
  /** Venue counters: offers whatever the PLACE sells (its actions list) instead of `actions`. */
  placeActions?: boolean;
}

export type Quality = 'cheap' | 'basic' | 'nice' | 'luxury';

/**
 * What quality does (Peter, 2026-10-13: "cheap furniture … add just a lil
 * bit"). `gain` scales what a piece gives back (energy from a bed, fun from
 * a TV); costs like hunger while sleeping are not scaled. Cheap pieces
 * may also leave a downside (their `quirk`), luxury ones a little treat.
 */
export const FURNITURE_QUALITY: Record<Quality, { label: string; gain: number; treat?: { id: string; label: string; emoji: string; value: number; minutes: number } }> = {
  cheap: { label: 'Cheap', gain: 0.7 },
  basic: { label: 'Basic', gain: 1 },
  nice: { label: 'Nice', gain: 1.25 },
  luxury: { label: 'Luxury', gain: 1.5, treat: { id: 'luxe', label: 'Living in luxury', emoji: '✨', value: 6, minutes: 60 } },
};

export const FURNITURE = new Registry<FurnitureDef>('furniture');

FURNITURE.add(
  // ---- bedroom
  { id: 'bedDouble', name: 'Double bed', emoji: '🛏️', price: 60_000, parts: [{ model: 'bedDouble' }], actions: ['sleep', 'nap'], use: 'lie', quality: 'nice' },
  { id: 'bedSingle', name: 'Single bed', emoji: '🛏️', price: 30_000, parts: [{ model: 'bedSingle' }], actions: ['sleep', 'nap'], use: 'lie' },
  { id: 'nightstand', name: 'Nightstand', emoji: '🗄️', price: 8_000, parts: [{ model: 'cabinetBedDrawer' }, { model: 'lampSquareTable', y: 0.52 }], actions: [] },
  { id: 'closet', name: 'Closet', emoji: '👕', price: 35_000, parts: [{ model: 'bookcaseClosedWide' }], actions: [], opens: 'closet' },
  // ---- kitchen
  { id: 'stove', name: 'Stove', emoji: '🍳', price: 45_000, parts: [{ model: 'kitchenStove' }], actions: ['cookPasta', 'cookFancy'], fixed: true },
  { id: 'fridge', name: 'Fridge', emoji: '🧊', price: 50_000, parts: [{ model: 'kitchenFridge' }], actions: ['snack'] },
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
  { id: 'washer', name: 'Washing machine', emoji: '🧺', price: 45_000, parts: [{ model: 'washer' }], actions: [] },
  // ---- living room
  { id: 'sofa', name: 'Sofa', emoji: '🛋️', price: 55_000, parts: [{ model: 'loungeSofa' }, { model: 'pillow', x: -0.6, y: 0.5, z: -0.2 }], actions: ['callMom', 'guitar', 'workout'], use: 'sitOn', seat: true },
  { id: 'sofaLong', name: 'Big sofa', emoji: '🛋️', price: 90_000, parts: [{ model: 'loungeSofaLong' }], actions: ['callMom', 'guitar', 'workout'], use: 'sitOn', seat: true, quality: 'nice' },
  { id: 'armchair', name: 'Armchair', emoji: '💺', price: 25_000, parts: [{ model: 'loungeChair' }], actions: [], use: 'sitOn', seat: true },
  { id: 'coffeeTable', name: 'Coffee table', emoji: '☕', price: 12_000, parts: [{ model: 'tableCoffee' }], actions: [] },
  { id: 'glassTable', name: 'Glass coffee table', emoji: '☕', price: 20_000, parts: [{ model: 'tableCoffeeGlass' }], actions: [] },
  { id: 'tv', name: 'TV', emoji: '📺', price: 50_000, parts: [{ model: 'cabinetTelevision' }, { model: 'televisionModern', y: 0.62 }], actions: ['watchTv', 'gameConsole'], tv: true },
  { id: 'tvVintage', name: 'Old TV', emoji: '📺', price: 8_000, parts: [{ model: 'televisionVintage' }], actions: ['watchTv'], tv: true },
  { id: 'bookcase', name: 'Bookcase', emoji: '📚', price: 18_000, parts: [{ model: 'bookcaseOpen' }], actions: [] },
  { id: 'bookcaseWide', name: 'Wide bookcase', emoji: '📚', price: 28_000, parts: [{ model: 'bookcaseClosedWide' }], actions: [] },
  { id: 'speaker', name: 'Speaker', emoji: '🔊', price: 15_000, parts: [{ model: 'speaker' }], actions: [] },
  // ---- work
  { id: 'desk', name: 'Laptop desk', emoji: '💻', price: 30_000, parts: [{ model: 'desk' }, { model: 'laptop', y: 0.76 }, { model: 'chairDesk', z: 0.75, rot: Math.PI }], actions: ['codePractice', 'freelance', 'sellOnline', 'postContent', 'doomscroll'], use: 'sitAt' },
  { id: 'deskScreen', name: 'Computer desk', emoji: '🖥️', price: 70_000, parts: [{ model: 'desk' }, { model: 'computerScreen', y: 0.76, z: -0.15 }, { model: 'chairDesk', z: 0.75, rot: Math.PI }], actions: ['codePractice', 'freelance', 'sellOnline', 'postContent', 'doomscroll'], use: 'sitAt', quality: 'nice' },
  // ---- venues (shops, cafés, bars): the counter sells whatever the place sells
  { id: 'serviceCounter', name: 'Counter', emoji: '🛎️', price: 0, parts: [{ model: 'kitchenBar', x: -1.3 }, { model: 'kitchenBar', x: -0.43 }, { model: 'kitchenBar', x: 0.43 }, { model: 'kitchenBar', x: 1.3 }, { model: 'kitchenCoffeeMachine', x: -1.1, y: 0.84, z: -0.05 }], actions: [], placeActions: true },
  { id: 'barCounter', name: 'Bar', emoji: '🍸', price: 0, parts: [{ model: 'kitchenBar', x: -1.7 }, { model: 'kitchenBar', x: -0.85 }, { model: 'kitchenBar', x: 0 }, { model: 'kitchenBar', x: 0.85 }, { model: 'kitchenBar', x: 1.7 }, { model: 'stoolBar', x: -1.3, z: 0.6 }, { model: 'stoolBar', x: 0, z: 0.6 }, { model: 'stoolBar', x: 1.3, z: 0.6 }], actions: [], placeActions: true },
  { id: 'shelf', name: 'Shelf', emoji: '🗄️', price: 0, parts: [{ model: 'bookcaseClosedWide' }], actions: [] },
  { id: 'cafeTable', name: 'Café table', emoji: '☕', price: 0, parts: [{ model: 'tableRound' }, { model: 'chairCushion', x: -0.85, rot: Math.PI / 2 }, { model: 'chairCushion', x: 0.85, rot: -Math.PI / 2 }], actions: [] },
  { id: 'officeDesk', name: 'Desk', emoji: '🖥️', price: 0, parts: [{ model: 'desk' }, { model: 'computerScreen', y: 0.76, z: -0.15 }, { model: 'chairDesk', z: 0.75, rot: Math.PI }], actions: [] },
  { id: 'stageSpeaker', name: 'Speaker', emoji: '🔊', price: 0, parts: [{ model: 'speaker' }], actions: [] },
  // ---- decoration
  { id: 'rug', name: 'Rug', emoji: '🟥', price: 9_000, parts: [{ model: 'rugRectangle' }], actions: [], flat: true },
  { id: 'rugRound', name: 'Round rug', emoji: '⭕', price: 8_000, parts: [{ model: 'rugRound' }], actions: [], flat: true },
  { id: 'plant', name: 'Potted plant', emoji: '🪴', price: 4_000, parts: [{ model: 'pottedPlant' }], actions: [] },
  { id: 'floorLamp', name: 'Floor lamp', emoji: '💡', price: 6_000, parts: [{ model: 'lampRoundFloor' }], actions: [] },
  { id: 'coatRack', name: 'Coat rack', emoji: '🧥', price: 5_000, parts: [{ model: 'coatRackStanding' }], actions: [] },
  { id: 'sideTable', name: 'Side table', emoji: '🪑', price: 7_000, parts: [{ model: 'sideTable' }, { model: 'plantSmall1', y: 0.76 }], actions: [] },
  { id: 'trashcan', name: 'Trash can', emoji: '🗑️', price: 2_000, parts: [{ model: 'trashcan' }], actions: [] },
);

// ---- Chunky cartoon pieces built in code (world/furniture-toys.ts):
// the broke East Harlem walk-up (Peter, 2026-10-13).
FURNITURE.add(
  { id: 'twinBed', name: 'Twin bed', emoji: '🛏️', price: 18_000, parts: [{ model: 'toyTwinBed' }], actions: ['sleep', 'nap'], use: 'lie', quality: 'cheap', quirk: { chance: 0.35, moodlet: { id: 'stiffBack', label: 'Stiff back from the cheap mattress', emoji: '🥴', value: -6, minutes: 120 } } },
  { id: 'crateNightstand', name: 'Milk-crate nightstand', emoji: '🧺', price: 1_500, parts: [{ model: 'toyCrateNightstand' }], actions: [], quality: 'cheap' },
  { id: 'clothesRack', name: 'Clothes rack', emoji: '👕', price: 4_000, parts: [{ model: 'toyClothesRack' }], actions: [], opens: 'closet', quality: 'cheap' },
  { id: 'foldingDesk', name: 'Folding desk', emoji: '💻', price: 6_000, parts: [{ model: 'toyFoldingDesk' }], actions: ['codePractice', 'freelance', 'sellOnline', 'postContent', 'doomscroll'], use: 'sitAt', quality: 'cheap', quirk: { chance: 0.2, moodlet: { id: 'wobblyDesk', label: 'The folding desk wobbles', emoji: '😤', value: -3, minutes: 45 } } },
  { id: 'radiator', name: 'Radiator', emoji: '♨️', price: 0, parts: [{ model: 'toyRadiator' }], actions: [], fixed: true, quality: 'cheap' },
  { id: 'laundryPile', name: 'Laundry pile', emoji: '🧦', price: 0, parts: [{ model: 'toyLaundryPile' }], actions: [], quality: 'cheap' },
  { id: 'movingBoxes', name: 'Moving boxes', emoji: '📦', price: 0, parts: [{ model: 'toyMovingBoxes' }], actions: [], quality: 'cheap' },
  { id: 'wornCouch', name: 'Worn couch', emoji: '🛋️', price: 15_000, parts: [{ model: 'toyWornCouch' }], actions: ['callMom', 'guitar', 'workout'], use: 'sitOn', seat: true, quality: 'cheap', quirk: { chance: 0.25, moodlet: { id: 'lumpyCouch', label: 'A spring poked you', emoji: '😣', value: -4, minutes: 60 } } },
  { id: 'crateTv', name: 'Old TV on crates', emoji: '📺', price: 5_000, parts: [{ model: 'toyCrateTv' }], actions: ['watchTv', 'gameConsole'], tv: true, screen: [0.5, 0.36, 0, 0.65, 0.255], quality: 'cheap', quirk: { chance: 0.25, moodlet: { id: 'badSignal', label: 'The TV kept cutting out', emoji: '📶', value: -3, minutes: 45 } } },
  { id: 'smallTable', name: 'Kitchen table', emoji: '🍽️', price: 9_000, parts: [{ model: 'toySmallTable' }], actions: [], quality: 'cheap' },
  { id: 'roommateDoor', name: "Roommate's door", emoji: '🚪', price: 0, parts: [{ model: 'toyRoommateDoor' }], actions: [], fixed: true },
  { id: 'plantStool', name: 'Pothos', emoji: '🪴', price: 2_500, parts: [{ model: 'toyPlantStool' }], actions: [], quality: 'cheap' },
  { id: 'shoePile', name: 'Shoes by the door', emoji: '👟', price: 0, parts: [{ model: 'toyShoePile' }], actions: [], flat: true, quality: 'cheap' },
  { id: 'wornRug', name: 'Worn rug', emoji: '🟫', price: 3_000, parts: [{ model: 'toyWornRug' }], actions: [], flat: true, quality: 'cheap' },
  { id: 'trashBags', name: 'Trash', emoji: '🗑️', price: 0, parts: [{ model: 'toyTrashBags' }], actions: [], quality: 'cheap' },
  { id: 'oldStove', name: 'Old stove', emoji: '🍳', price: 20_000, parts: [{ model: 'toyOldStove' }], actions: ['cookPasta', 'cookFancy'], fixed: true, quality: 'cheap', quirk: { chance: 0.2, moodlet: { id: 'smokeAlarm', label: 'Set off the smoke alarm', emoji: '🚨', value: -4, minutes: 45 } } },
  { id: 'oldFridge', name: 'Old fridge', emoji: '🧊', price: 20_000, parts: [{ model: 'toyOldFridge' }], actions: ['snack'], fixed: true, quality: 'cheap', quirk: { chance: 0.15, moodlet: { id: 'offMilk', label: 'The milk was a little off', emoji: '🤢', value: -4, minutes: 60 } } },
  { id: 'sinkCounter', name: 'Sink and counter', emoji: '🚰', price: 12_000, parts: [{ model: 'toySinkCounter' }], actions: [], fixed: true, quality: 'cheap' },
  { id: 'oldToilet', name: 'Toilet', emoji: '🚽', price: 10_000, parts: [{ model: 'toyToilet' }], actions: ['toilet'], use: 'sitOn', fixed: true, quality: 'cheap' },
  { id: 'tubShower', name: 'Tub and shower', emoji: '🛁', price: 25_000, parts: [{ model: 'toyTubShower' }], actions: ['shower'], use: 'stepIn', fixed: true, quality: 'cheap', quirk: { chance: 0.3, moodlet: { id: 'coldShower', label: 'The hot water ran out', emoji: '🥶', value: -5, minutes: 60 } } },
  { id: 'posters', name: 'Posters', emoji: '🖼️', price: 1_500, parts: [{ model: 'toyPosters' }], actions: [], wall: true, quality: 'cheap' },
  { id: 'windowAC', name: 'Window AC', emoji: '❄️', price: 9_000, parts: [{ model: 'toyWindowAC' }], actions: [], wall: true, quality: 'cheap' },
  { id: 'pedestalSink', name: 'Bathroom sink', emoji: '🪥', price: 8_000, parts: [{ model: 'toyPedestalSink' }], actions: [], fixed: true, quality: 'cheap' },
);
