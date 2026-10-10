// =====================================================================
// wardrobe.ts — every piece of clothing (and hairstyle) in the game.
//
// HOW CLOTHES WORK
//   The character is one smooth body. Clothes "paint" parts of it: a
//   long-sleeve top colours the arms down to the wrist, shorts colour the
//   legs only above the knee, boots colour the lower shin, and so on.
//   A few items also add a small extra shape (a skirt, a hood, a cap's
//   brim, sunglasses). So a new item is usually just a few settings —
//   no 3D modelling needed.
//
// HOW TO ADD AN ITEM
//   Add an entry to the right list below (TOPS, BOTTOMS, SHOES, HATS,
//   HAIR, EXTRAS). Give it a unique id, a name, a price in cents (0 =
//   everyone owns it from the start) and its settings. It then shows up
//   in the closet and in clothing stores automatically.
//
// HOW TO ADD A NEW KIND OF SHAPE (e.g. a new hat style)
//   Add the style name to the type here, then draw it in
//   world/people.ts → buildHeadwear() / buildExtras().
// =====================================================================

import { Registry } from '../core/registry.ts';
import type { Look } from '../sim/types.ts';

export type Slot = 'hair' | 'top' | 'bottom' | 'shoes' | 'hat' | 'extra';

interface Base {
  id: string;
  name: string;
  emoji: string;
  /** Price in cents. 0 = free starter item everyone owns. */
  price: number;
  /** Suggested colours shown as swatches (the first is the default). */
  colors: string[];
}

export interface TopItem extends Base {
  slot: 'top';
  sleeve: 'none' | 'short' | 'long';
  /** Open jackets show a second colour (the shirt underneath) down the front. */
  open?: boolean;
  /** Adds a hood bunched behind the neck. */
  hood?: boolean;
  /** Dresses colour the hips and thighs too, and add a flared skirt. */
  dress?: number;
  /** Longer tops cover the belt line. */
  long?: boolean;
}

export interface BottomItem extends Base {
  slot: 'bottom';
  /** How far down the legs go. */
  leg: 'shorts' | 'knee' | 'capri' | 'long';
  /** If set, a skirt of this length (metres from the waist) is added. */
  skirt?: number;
}

export interface ShoesItem extends Base {
  slot: 'shoes';
  /** Boots also cover the ankle and lower shin. */
  high?: boolean;
  sole: string;
}

export interface HatItem extends Base {
  slot: 'hat';
  style: 'cap' | 'beanie' | 'bucket' | 'durag';
}

export interface HairItem extends Base {
  slot: 'hair';
  style: 'bald' | 'buzz' | 'short' | 'curly' | 'afro' | 'long' | 'bun' | 'ponytail' | 'braids';
}

export interface ExtraItem extends Base {
  slot: 'extra';
  style: 'shades' | 'glasses' | 'backpack' | 'chain';
}

export type ClothingItem = TopItem | BottomItem | ShoesItem | HatItem | HairItem | ExtraItem;

const BASICS = ['#ffffff', '#111111', '#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#6d597a', '#8ecae6', '#e9c46a', '#3a86ff', '#b5838d', '#4a4e69'];
const DENIM = ['#2f4a6d', '#3d5a80', '#1b263b', '#5b7fa6', '#111111', '#d6d2c4'];
const NEUTRAL = ['#111111', '#2b2d42', '#5c4033', '#8d99ae', '#c2b280', '#ffffff'];

export const CLOTHES = new Registry<ClothingItem>('clothing');

CLOTHES.add(
  // ---- Hair (free: it's your own hair)
  { id: 'hair_long', slot: 'hair', name: 'Long', emoji: '💇', price: 0, colors: [], style: 'long' },
  { id: 'hair_bun', slot: 'hair', name: 'Top bun', emoji: '💇', price: 0, colors: [], style: 'bun' },
  { id: 'hair_ponytail', slot: 'hair', name: 'Ponytail', emoji: '💇', price: 0, colors: [], style: 'ponytail' },
  { id: 'hair_braids', slot: 'hair', name: 'Braids', emoji: '💇', price: 0, colors: [], style: 'braids' },
  { id: 'hair_afro', slot: 'hair', name: 'Afro', emoji: '💇', price: 0, colors: [], style: 'afro' },
  { id: 'hair_curly', slot: 'hair', name: 'Curls', emoji: '💇', price: 0, colors: [], style: 'curly' },
  { id: 'hair_short', slot: 'hair', name: 'Short', emoji: '💇', price: 0, colors: [], style: 'short' },
  { id: 'hair_buzz', slot: 'hair', name: 'Buzz cut', emoji: '💇', price: 0, colors: [], style: 'buzz' },
  { id: 'hair_bald', slot: 'hair', name: 'Bald', emoji: '💇', price: 0, colors: [], style: 'bald' },

  // ---- Tops
  { id: 'tee', slot: 'top', name: 'T-shirt', emoji: '👕', price: 0, colors: BASICS, sleeve: 'short' },
  { id: 'tank', slot: 'top', name: 'Tank top', emoji: '🎽', price: 0, colors: BASICS, sleeve: 'none' },
  { id: 'longsleeve', slot: 'top', name: 'Long-sleeve tee', emoji: '👕', price: 1800, colors: BASICS, sleeve: 'long' },
  { id: 'hoodie', slot: 'top', name: 'Hoodie', emoji: '🧥', price: 4500, colors: ['#8d99ae', '#111111', '#1d3557', '#9b2226', '#2a9d8f', '#e9c46a'], sleeve: 'long', hood: true, long: true },
  { id: 'denimJacket', slot: 'top', name: 'Denim jacket', emoji: '🧥', price: 6500, colors: DENIM, sleeve: 'long', open: true },
  { id: 'leatherJacket', slot: 'top', name: 'Leather jacket', emoji: '🧥', price: 14000, colors: ['#111111', '#5c4033', '#7f1d1d'], sleeve: 'long', open: true },
  { id: 'blazer', slot: 'top', name: 'Blazer', emoji: '🤵', price: 12000, colors: ['#1b263b', '#2b2d42', '#5c4033', '#111111', '#7d8597'], sleeve: 'long', open: true, long: true },
  { id: 'pufferJacket', slot: 'top', name: 'Puffer jacket', emoji: '🧥', price: 16000, colors: ['#111111', '#e63946', '#f4a261', '#2a9d8f', '#ffffff'], sleeve: 'long', hood: true, long: true },
  { id: 'jersey', slot: 'top', name: 'Basketball jersey', emoji: '🏀', price: 5500, colors: ['#1d428a', '#ffffff', '#f58426', '#000000'], sleeve: 'none', long: true },
  { id: 'sundress', slot: 'top', name: 'Sundress', emoji: '👗', price: 5200, colors: ['#e9c46a', '#e76f51', '#8ecae6', '#ffffff', '#b5838d'], sleeve: 'none', dress: 0.5 },
  { id: 'slipDress', slot: 'top', name: 'Evening dress', emoji: '👗', price: 11000, colors: ['#111111', '#9b2226', '#3a0ca3', '#c9a227'], sleeve: 'none', dress: 0.72 },

  // ---- Bottoms
  { id: 'jeans', slot: 'bottom', name: 'Jeans', emoji: '👖', price: 0, colors: DENIM, leg: 'long' },
  { id: 'joggers', slot: 'bottom', name: 'Joggers', emoji: '👖', price: 0, colors: ['#8d99ae', '#111111', '#1d3557', '#2b2d42'], leg: 'long' },
  { id: 'shorts', slot: 'bottom', name: 'Shorts', emoji: '🩳', price: 2200, colors: [...DENIM.slice(0, 3), '#c2b280', '#111111'], leg: 'shorts' },
  { id: 'chinos', slot: 'bottom', name: 'Chinos', emoji: '👖', price: 4800, colors: ['#c2b280', '#2b2d42', '#5c4033', '#6b705c'], leg: 'long' },
  { id: 'suitPants', slot: 'bottom', name: 'Suit trousers', emoji: '👔', price: 9000, colors: ['#1b263b', '#2b2d42', '#111111', '#7d8597'], leg: 'long' },
  { id: 'capris', slot: 'bottom', name: 'Cropped pants', emoji: '👖', price: 3800, colors: NEUTRAL, leg: 'capri' },
  { id: 'miniSkirt', slot: 'bottom', name: 'Mini skirt', emoji: '👗', price: 3500, colors: ['#111111', '#9b2226', '#1d3557', '#d6d2c4'], leg: 'shorts', skirt: 0.32 },
  { id: 'midiSkirt', slot: 'bottom', name: 'Midi skirt', emoji: '👗', price: 4800, colors: ['#111111', '#6d597a', '#c2b280', '#2a9d8f'], leg: 'shorts', skirt: 0.58 },

  // ---- Shoes
  { id: 'sneakers', slot: 'shoes', name: 'Sneakers', emoji: '👟', price: 0, colors: ['#f2f2f2', '#111111', '#e63946', '#3a86ff'], sole: '#f7f7f7' },
  { id: 'kicks', slot: 'shoes', name: 'High-top kicks', emoji: '👟', price: 13000, colors: ['#e63946', '#111111', '#ffffff', '#1d3557'], sole: '#ffffff', high: true },
  { id: 'boots', slot: 'shoes', name: 'Work boots', emoji: '🥾', price: 9500, colors: ['#c68b3b', '#3b2a1a', '#111111'], sole: '#2b2118', high: true },
  { id: 'loafers', slot: 'shoes', name: 'Loafers', emoji: '👞', price: 8000, colors: ['#3b2a1a', '#111111', '#7f4f24'], sole: '#1a1410' },

  // ---- Hats
  { id: 'cap', slot: 'hat', name: 'Fitted cap', emoji: '🧢', price: 3000, colors: ['#1d3557', '#111111', '#e63946', '#ffffff', '#2a9d8f'], style: 'cap' },
  { id: 'beanie', slot: 'hat', name: 'Beanie', emoji: '🧶', price: 2000, colors: ['#111111', '#e9c46a', '#e63946', '#8d99ae', '#2a9d8f'], style: 'beanie' },
  { id: 'bucketHat', slot: 'hat', name: 'Bucket hat', emoji: '👒', price: 2800, colors: ['#c2b280', '#111111', '#ffffff', '#6b705c'], style: 'bucket' },
  { id: 'durag', slot: 'hat', name: 'Durag', emoji: '🧣', price: 1500, colors: ['#111111', '#9b2226', '#1d3557', '#c9a227'], style: 'durag' },

  // ---- Extras
  { id: 'shades', slot: 'extra', name: 'Sunglasses', emoji: '🕶️', price: 2500, colors: ['#111111'], style: 'shades' },
  { id: 'glasses', slot: 'extra', name: 'Glasses', emoji: '👓', price: 6000, colors: ['#222222', '#7f4f24', '#c9a227'], style: 'glasses' },
  { id: 'backpack', slot: 'extra', name: 'Backpack', emoji: '🎒', price: 4000, colors: ['#111111', '#e63946', '#2a9d8f', '#f4a261'], style: 'backpack' },
  { id: 'chain', slot: 'extra', name: 'Gold chain', emoji: '📿', price: 25000, colors: ['#d4af37'], style: 'chain' },
);

/** What everyone wears if their save doesn't say (older saves, crowd defaults). */
export function outfitDefaults(body: 'm' | 'f'): Required<Pick<Look, 'hairStyle' | 'topId' | 'bottomId' | 'shoesId' | 'shoes'>> {
  return { hairStyle: body === 'f' ? 'hair_long' : 'hair_short', topId: 'tee', bottomId: 'jeans', shoesId: 'sneakers', shoes: '#f2f2f2' };
}

/** Item ids every player owns from the start (all the free ones). */
export const STARTER_ITEMS = (): string[] => CLOTHES.where((c) => c.price === 0).map((c) => c.id);

/** Narrow helper: the item in a slot, typed. */
export function itemOf<S extends Slot>(id: string | undefined, slot: S): Extract<ClothingItem, { slot: S }> | undefined {
  const it = CLOTHES.get(id);
  return it && it.slot === slot ? (it as Extract<ClothingItem, { slot: S }>) : undefined;
}
