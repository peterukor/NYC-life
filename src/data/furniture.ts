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
  /** Pieces with a screen: the TV ad plays on these. */
  tv?: boolean;
}

export const FURNITURE = new Registry<FurnitureDef>('furniture');

FURNITURE.add(
  // ---- bedroom
  { id: 'bedDouble', name: 'Double bed', emoji: '🛏️', price: 60_000, parts: [{ model: 'bedDouble' }], actions: ['sleep', 'nap'] },
  { id: 'bedSingle', name: 'Single bed', emoji: '🛏️', price: 30_000, parts: [{ model: 'bedSingle' }], actions: ['sleep', 'nap'] },
  { id: 'nightstand', name: 'Nightstand', emoji: '🗄️', price: 8_000, parts: [{ model: 'cabinetBedDrawer' }, { model: 'lampSquareTable', y: 0.52 }], actions: [] },
  // ---- kitchen
  { id: 'stove', name: 'Stove', emoji: '🍳', price: 45_000, parts: [{ model: 'kitchenStove' }], actions: ['cookPasta', 'cookFancy'] },
  { id: 'fridge', name: 'Fridge', emoji: '🧊', price: 50_000, parts: [{ model: 'kitchenFridge' }], actions: ['snack'] },
  { id: 'kitchenSink', name: 'Kitchen sink', emoji: '🚰', price: 20_000, parts: [{ model: 'kitchenSink' }], actions: [] },
  { id: 'counter', name: 'Counter', emoji: '🗄️', price: 15_000, parts: [{ model: 'kitchenCabinetDrawer' }, { model: 'kitchenCoffeeMachine', y: 0.9, x: -0.1 }], actions: [] },
  { id: 'counterMicrowave', name: 'Counter + microwave', emoji: '🗄️', price: 22_000, parts: [{ model: 'kitchenCabinet' }, { model: 'kitchenMicrowave', y: 0.9 }], actions: ['snack'] },
  { id: 'diningTable', name: 'Dining table', emoji: '🍽️', price: 25_000, parts: [{ model: 'table' }, { model: 'chairCushion', x: -0.5, z: 0.75, rot: Math.PI }, { model: 'chairCushion', x: 0.5, z: -0.75 }], actions: [] },
  { id: 'breakfastBar', name: 'Breakfast bar', emoji: '🍽️', price: 18_000, parts: [{ model: 'kitchenBar' }, { model: 'stoolBar', z: 0.55 }], actions: [] },
  // ---- bathroom
  { id: 'shower', name: 'Shower', emoji: '🚿', price: 40_000, parts: [{ model: 'shower' }], actions: ['shower'] },
  { id: 'bathtub', name: 'Bathtub', emoji: '🛁', price: 70_000, parts: [{ model: 'bathtub' }], actions: ['shower'] },
  { id: 'toilet', name: 'Toilet', emoji: '🚽', price: 20_000, parts: [{ model: 'toilet' }], actions: ['toilet'] },
  { id: 'bathSink', name: 'Bathroom sink', emoji: '🪥', price: 15_000, parts: [{ model: 'bathroomSink', y: 0.8 }, { model: 'bathroomMirror', y: 1.7, z: -0.2 }], actions: [] },
  { id: 'washer', name: 'Washing machine', emoji: '🧺', price: 45_000, parts: [{ model: 'washer' }], actions: [] },
  // ---- living room
  { id: 'sofa', name: 'Sofa', emoji: '🛋️', price: 55_000, parts: [{ model: 'loungeSofa' }, { model: 'pillow', x: -0.6, y: 0.5, z: -0.2 }], actions: ['callMom', 'guitar', 'workout'] },
  { id: 'sofaLong', name: 'Big sofa', emoji: '🛋️', price: 90_000, parts: [{ model: 'loungeSofaLong' }], actions: ['callMom', 'guitar', 'workout'] },
  { id: 'armchair', name: 'Armchair', emoji: '💺', price: 25_000, parts: [{ model: 'loungeChair' }], actions: [] },
  { id: 'coffeeTable', name: 'Coffee table', emoji: '☕', price: 12_000, parts: [{ model: 'tableCoffee' }], actions: [] },
  { id: 'glassTable', name: 'Glass coffee table', emoji: '☕', price: 20_000, parts: [{ model: 'tableCoffeeGlass' }], actions: [] },
  { id: 'tv', name: 'TV', emoji: '📺', price: 50_000, parts: [{ model: 'cabinetTelevision' }, { model: 'televisionModern', y: 0.62 }], actions: ['watchTv', 'gameConsole'], tv: true },
  { id: 'tvVintage', name: 'Old TV', emoji: '📺', price: 8_000, parts: [{ model: 'televisionVintage' }], actions: ['watchTv'], tv: true },
  { id: 'bookcase', name: 'Bookcase', emoji: '📚', price: 18_000, parts: [{ model: 'bookcaseOpen' }], actions: [] },
  { id: 'bookcaseWide', name: 'Wide bookcase', emoji: '📚', price: 28_000, parts: [{ model: 'bookcaseClosedWide' }], actions: [] },
  { id: 'speaker', name: 'Speaker', emoji: '🔊', price: 15_000, parts: [{ model: 'speaker' }], actions: [] },
  // ---- work
  { id: 'desk', name: 'Laptop desk', emoji: '💻', price: 30_000, parts: [{ model: 'desk' }, { model: 'laptop', y: 0.76 }, { model: 'chairDesk', z: 0.75, rot: Math.PI }], actions: ['codePractice', 'freelance', 'sellOnline', 'doomscroll'] },
  { id: 'deskScreen', name: 'Computer desk', emoji: '🖥️', price: 70_000, parts: [{ model: 'desk' }, { model: 'computerScreen', y: 0.76, z: -0.15 }, { model: 'chairDesk', z: 0.75, rot: Math.PI }], actions: ['codePractice', 'freelance', 'sellOnline', 'doomscroll'] },
  // ---- decoration
  { id: 'rug', name: 'Rug', emoji: '🟥', price: 9_000, parts: [{ model: 'rugRectangle' }], actions: [], flat: true },
  { id: 'rugRound', name: 'Round rug', emoji: '⭕', price: 8_000, parts: [{ model: 'rugRound' }], actions: [], flat: true },
  { id: 'plant', name: 'Potted plant', emoji: '🪴', price: 4_000, parts: [{ model: 'pottedPlant' }], actions: [] },
  { id: 'floorLamp', name: 'Floor lamp', emoji: '💡', price: 6_000, parts: [{ model: 'lampRoundFloor' }], actions: [] },
  { id: 'coatRack', name: 'Coat rack', emoji: '🧥', price: 5_000, parts: [{ model: 'coatRackStanding' }], actions: [] },
  { id: 'sideTable', name: 'Side table', emoji: '🪑', price: 7_000, parts: [{ model: 'sideTable' }, { model: 'plantSmall1', y: 0.76 }], actions: [] },
  { id: 'trashcan', name: 'Trash can', emoji: '🗑️', price: 2_000, parts: [{ model: 'trashcan' }], actions: [] },
);
