// =====================================================================
// wardrobe.ts — every piece of clothing (and hairstyle) in the game.
//
// HOW CLOTHES WORK
//   Every item is a modelled PART of the people pack (world/folk.ts,
//   built by scripts/build-people-assets.mjs): `parts` names the part on
//   the men's body (m) and the women's body (f). Tops, bottoms and shoes
//   are recoloured with the colours you pick (`colors`); a hairstyle is
//   either a whole head with its own hairdo ("head-suit") or a built
//   style on the bare head ("hair-afro"). Some headgear (a hard hat, a
//   crown) comes as a whole head too and replaces the hair.
//   The other settings (sleeve, leg, hood…) describe the item for the
//   shop text; the look comes from the part.
//
// HOW TO ADD AN ITEM
//   Add an entry to the right list below. Give it a unique id, a name, a
//   price in cents (0 = everyone owns it from the start), its colours and
//   its parts. It then shows up in the closet and in clothing stores
//   automatically. A new kind of part needs a rebuild of the people pack.
// =====================================================================

import { Registry } from '../core/registry.ts';
import type { Look } from '../sim/types.ts';

export type Slot = 'hair' | 'top' | 'bottom' | 'shoes' | 'hat' | 'extra';

/**
 * Clothing tiers. Plain = everyday basics, premium = nicer brands,
 * exclusive = rare designer pieces. Tier decides what you start with
 * (see STARTING_WARDROBE) and, later, which stores sell it.
 */
export type Tier = 'plain' | 'premium' | 'exclusive';

/** Social class you start life in (decides money, home and starting clothes). */
export type SpawnClass = 'poor' | 'middle' | 'rich' | 'billionaire';

interface Base {
  id: string;
  name: string;
  emoji: string;
  /** Price in cents. 0 = free starter item everyone owns. */
  price: number;
  /** Suggested colours shown as swatches (the first is the default). */
  colors: string[];
  /** Plain / premium / exclusive. Left out = worked out from the price (see tierOf). */
  tier?: Tier;
  /** The people-pack part on each body (see the top of this file). */
  parts: { m: string; f: string };
  /** Party and Halloween costumes (sold at the costume rack). */
  costume?: boolean;
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
  /** Shape: trainers (default), slides (open, worn with socks) or canvas low-tops. */
  style?: 'trainer' | 'slides' | 'canvas';
}

export interface HatItem extends Base {
  slot: 'hat';
  style: 'cap' | 'beanie' | 'bucket' | 'durag' | 'headgear';
}

export interface HairItem extends Base {
  slot: 'hair';
  style: 'bald' | 'buzz' | 'short' | 'curly' | 'afro' | 'long' | 'bun' | 'ponytail' | 'braids' | 'fade' | 'locs' | 'cornrows' | 'puffs' | 'spiky' | 'mohawk' | 'bob' | 'updo';
}

export interface ExtraItem extends Base {
  slot: 'extra';
  style: 'shades' | 'glasses' | 'backpack' | 'chain' | 'headphones';
}

export type ClothingItem = TopItem | BottomItem | ShoesItem | HatItem | HairItem | ExtraItem;

const BASICS = ['#ffffff', '#111111', '#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#6d597a', '#8ecae6', '#e9c46a', '#3a86ff', '#b5838d', '#4a4e69'];
const DENIM = ['#2f4a6d', '#3d5a80', '#1b263b', '#5b7fa6', '#111111', '#d6d2c4'];
const NEUTRAL = ['#111111', '#2b2d42', '#5c4033', '#8d99ae', '#c2b280', '#ffffff'];

export const CLOTHES = new Registry<ClothingItem>('clothing');

const P = (m: string, f: string = m) => ({ m, f });

CLOTHES.add(
  // ---- Hair (free: it's your own hair)
  { id: 'hair_long', slot: 'hair', name: 'Long', emoji: '💇', price: 0, colors: [], style: 'long', parts: P('head-adventurer', 'head-soldier') },
  { id: 'hair_bun', slot: 'hair', name: 'Top bun', emoji: '💇', price: 0, colors: [], style: 'bun', parts: P('hair-bun') },
  { id: 'hair_ponytail', slot: 'hair', name: 'Ponytail', emoji: '💇', price: 0, colors: [], style: 'ponytail', parts: P('hair-ponytail') },
  { id: 'hair_braids', slot: 'hair', name: 'Box braids', emoji: '💇', price: 0, colors: [], style: 'braids', parts: P('hair-braids') },
  { id: 'hair_afro', slot: 'hair', name: 'Afro', emoji: '💇', price: 0, colors: [], style: 'afro', parts: P('hair-afro') },
  { id: 'hair_curly', slot: 'hair', name: 'Curls', emoji: '💇', price: 0, colors: [], style: 'curly', parts: P('hair-curls') },
  { id: 'hair_short', slot: 'hair', name: 'Short', emoji: '💇', price: 0, colors: [], style: 'short', parts: P('head-suit', 'head-adventurer') },
  { id: 'hair_buzz', slot: 'hair', name: 'Buzz cut', emoji: '💇', price: 0, colors: [], style: 'buzz', parts: P('hair-buzz') },
  { id: 'hair_bald', slot: 'hair', name: 'Bald', emoji: '💇', price: 0, colors: [], style: 'bald', parts: P('head-bare') },
  { id: 'hair_fade', slot: 'hair', name: 'Fade', emoji: '💈', price: 0, colors: [], style: 'fade', parts: P('hair-fade') },
  { id: 'hair_locs', slot: 'hair', name: 'Locs', emoji: '💇', price: 0, colors: [], style: 'locs', parts: P('hair-locs') },
  { id: 'hair_cornrows', slot: 'hair', name: 'Cornrows', emoji: '💇', price: 0, colors: [], style: 'cornrows', parts: P('hair-cornrows') },
  { id: 'hair_puffs', slot: 'hair', name: 'Afro puffs', emoji: '💇', price: 0, colors: [], style: 'puffs', parts: P('hair-puffs') },
  { id: 'hair_spiky', slot: 'hair', name: 'Spiky', emoji: '💇', price: 0, colors: [], style: 'spiky', parts: P('head-hoodie', 'head-scifi') },
  { id: 'hair_mohawk', slot: 'hair', name: 'Mohawk', emoji: '🤘', price: 0, colors: [], style: 'mohawk', parts: P('head-punk') },
  { id: 'hair_bob', slot: 'hair', name: 'Bob', emoji: '💇', price: 0, colors: [], style: 'bob', parts: P('head-casual') },
  { id: 'hair_updo', slot: 'hair', name: 'Updo', emoji: '💇', price: 0, colors: [], style: 'updo', parts: P('head-beach', 'head-formal') },

  // ---- Tops
  { id: 'tee', slot: 'top', name: 'T-shirt', emoji: '👕', price: 0, colors: BASICS, sleeve: 'short', parts: P('top-casual') },
  { id: 'tank', slot: 'top', name: 'Tank top', emoji: '🎽', price: 0, colors: BASICS, sleeve: 'none', parts: P('top-beach', 'top-soldier') },
  { id: 'longsleeve', slot: 'top', name: 'Long-sleeve tee', emoji: '👕', price: 1800, colors: BASICS, sleeve: 'long', parts: P('top-adventurer') },
  { id: 'hoodie', slot: 'top', name: 'Hoodie', emoji: '🧥', price: 4500, colors: ['#8d99ae', '#111111', '#1d3557', '#9b2226', '#2a9d8f', '#e9c46a'], sleeve: 'long', hood: true, long: true, parts: P('top-hoodie', 'top-scifi') },
  { id: 'denimJacket', slot: 'top', name: 'Denim vest', emoji: '🧥', price: 6500, colors: DENIM, sleeve: 'none', open: true, parts: P('top-punk', 'top-scifi') },
  { id: 'leatherJacket', slot: 'top', name: 'Leather vest', emoji: '🧥', price: 14000, colors: ['#111111', '#5c4033', '#7f1d1d'], sleeve: 'none', open: true, parts: P('top-punk') },
  { id: 'blazer', slot: 'top', name: 'Blazer', emoji: '🤵', price: 12000, colors: ['#1b263b', '#2b2d42', '#5c4033', '#111111', '#7d8597'], sleeve: 'long', open: true, long: true, parts: P('top-suit') },
  { id: 'pufferJacket', slot: 'top', name: 'Puffer jacket', emoji: '🧥', price: 16000, colors: ['#111111', '#e63946', '#f4a261', '#2a9d8f', '#ffffff'], sleeve: 'long', hood: true, long: true, parts: P('top-hoodie', 'top-scifi') },
  { id: 'jersey', slot: 'top', name: 'Basketball jersey', emoji: '🏀', price: 5500, tier: 'premium', colors: ['#1d428a', '#ffffff', '#f58426', '#000000'], sleeve: 'none', long: true, parts: P('top-beach', 'top-soldier') },
  { id: 'sundress', slot: 'top', name: 'Sundress', emoji: '👗', price: 5200, tier: 'premium', colors: ['#e9c46a', '#e76f51', '#8ecae6', '#ffffff', '#b5838d'], sleeve: 'none', dress: 0.5, parts: P('top-casual', 'top-formal') },
  { id: 'turtleneck', slot: 'top', name: 'Turtleneck', emoji: '🧶', price: 7500, colors: ['#111111', '#f1e9da', '#5c4033', '#6d597a'], sleeve: 'long', parts: P('top-hoodie', 'top-suit') },
  { id: 'trenchCoat', slot: 'top', name: 'Trench coat', emoji: '🧥', price: 15000, colors: ['#c2a878', '#111111', '#5c4033'], sleeve: 'long', open: true, long: true, parts: P('top-suit') },
  { id: 'designerSuit', slot: 'top', name: 'Designer suit jacket', emoji: '🤵', price: 120000, tier: 'exclusive', colors: ['#0b132b', '#3a0ca3', '#7f1d1d', '#111111'], sleeve: 'long', open: true, long: true, parts: P('top-suit') },
  { id: 'silkGown', slot: 'top', name: 'Silk gown', emoji: '👗', price: 150000, tier: 'exclusive', colors: ['#c9a227', '#9b2226', '#0b132b', '#e5e5e5'], sleeve: 'none', dress: 0.85, parts: P('top-suit', 'top-formal') },
  { id: 'flannel', slot: 'top', name: 'Flannel shirt', emoji: '👔', price: 3200, colors: ['#9b2226', '#1d3557', '#2d6a4f', '#5c4033', '#6d597a'], sleeve: 'long', open: true, parts: P('top-farmer', 'top-adventurer') },
  { id: 'polo', slot: 'top', name: 'Polo shirt', emoji: '👕', price: 3800, colors: ['#ffffff', '#1d3557', '#2a9d8f', '#e9c46a', '#111111'], sleeve: 'short', parts: P('top-casual') },
  { id: 'crewneck', slot: 'top', name: 'Crewneck sweatshirt', emoji: '🧶', price: 3500, colors: ['#8d99ae', '#2b2d42', '#6b705c', '#e9c46a', '#b5838d'], sleeve: 'long', long: true, parts: P('top-hoodie', 'top-casual') },
  { id: 'cardigan', slot: 'top', name: 'Cardigan', emoji: '🧶', price: 5000, colors: ['#c2b280', '#6d597a', '#2b2d42', '#9b2226'], sleeve: 'long', open: true, parts: P('top-adventurer') },
  { id: 'slipDress', slot: 'top', name: 'Evening dress', emoji: '👗', price: 11000, colors: ['#111111', '#9b2226', '#3a0ca3', '#c9a227'], sleeve: 'none', dress: 0.72, parts: P('top-suit', 'top-formal') },
  { id: 'hiVis', slot: 'top', name: 'Hi-vis vest', emoji: '🦺', price: 2500, colors: ['#ff7b00', '#d8f31b'], sleeve: 'short', parts: P('top-worker') },
  { id: 'tacticalVest', slot: 'top', name: 'Tactical vest', emoji: '🦺', price: 9000, colors: ['#3a3d42', '#4b5320', '#111111'], sleeve: 'long', costume: true, parts: P('top-swat', 'top-soldier') },
  { id: 'spaceSuit', slot: 'top', name: 'Space suit', emoji: '🧑‍🚀', price: 30000, colors: ['#445553', '#ffffff', '#174f6c'], sleeve: 'long', costume: true, parts: P('top-spacesuit', 'top-scifi') },
  { id: 'royalArmor', slot: 'top', name: 'Royal armour', emoji: '🛡️', price: 40000, colors: ['#414959', '#5c4033', '#7f1d1d'], sleeve: 'long', costume: true, parts: P('top-king', 'top-medieval') },
  { id: 'witchRobe', slot: 'top', name: "Witch's robe", emoji: '🧙', price: 18000, colors: ['#441f68', '#111111', '#2d6a4f'], sleeve: 'long', costume: true, parts: P('top-king', 'top-witch') },

  // ---- Bottoms
  { id: 'jeans', slot: 'bottom', name: 'Jeans', emoji: '👖', price: 0, colors: DENIM, leg: 'long', parts: P('bottom-casual') },
  { id: 'joggers', slot: 'bottom', name: 'Joggers', emoji: '👖', price: 0, colors: ['#8d99ae', '#111111', '#1d3557', '#2b2d42'], leg: 'long', parts: P('bottom-adventurer', 'bottom-soldier') },
  { id: 'shorts', slot: 'bottom', name: 'Shorts', emoji: '🩳', price: 2200, colors: [...DENIM.slice(0, 3), '#c2b280', '#111111'], leg: 'shorts', parts: P('bottom-hoodie', 'bottom-adventurer') },
  { id: 'chinos', slot: 'bottom', name: 'Chinos', emoji: '👖', price: 4800, tier: 'premium', colors: ['#c2b280', '#2b2d42', '#5c4033', '#6b705c'], leg: 'long', parts: P('bottom-worker') },
  { id: 'suitPants', slot: 'bottom', name: 'Suit trousers', emoji: '👔', price: 9000, colors: ['#1b263b', '#2b2d42', '#111111', '#7d8597'], leg: 'long', parts: P('bottom-suit') },
  { id: 'capris', slot: 'bottom', name: 'Cropped pants', emoji: '👖', price: 3800, colors: NEUTRAL, leg: 'capri', parts: P('bottom-hoodie', 'bottom-casual') },
  { id: 'miniSkirt', slot: 'bottom', name: 'Mini skirt', emoji: '👗', price: 3500, colors: ['#111111', '#9b2226', '#1d3557', '#d6d2c4'], leg: 'shorts', skirt: 0.32, parts: P('bottom-beach', 'bottom-formal') },
  { id: 'midiSkirt', slot: 'bottom', name: 'Long skirt', emoji: '👗', price: 4800, colors: ['#111111', '#6d597a', '#c2b280', '#2a9d8f'], leg: 'shorts', skirt: 0.58, parts: P('bottom-beach', 'bottom-witch') },
  { id: 'sweatShorts', slot: 'bottom', name: 'Swim shorts', emoji: '🩳', price: 1500, colors: ['#9b2226', '#111111', '#1d3557', '#2a9d8f'], leg: 'shorts', parts: P('bottom-beach', 'bottom-adventurer') },
  { id: 'cargoPants', slot: 'bottom', name: 'Cargo pants', emoji: '👖', price: 4200, colors: ['#6b705c', '#111111', '#c2b280', '#5c4033'], leg: 'long', parts: P('bottom-adventurer', 'bottom-soldier') },
  { id: 'rippedJeans', slot: 'bottom', name: 'Ripped jeans', emoji: '👖', price: 5200, colors: DENIM, leg: 'long', parts: P('bottom-punk') },
  { id: 'overalls', slot: 'bottom', name: 'Work overalls', emoji: '👖', price: 4500, colors: ['#2f4a6d', '#6b705c', '#5c4033'], leg: 'long', parts: P('bottom-farmer', 'bottom-worker') },
  { id: 'tacticalPants', slot: 'bottom', name: 'Tactical pants', emoji: '👖', price: 7000, colors: ['#3a3d42', '#4b5320', '#111111'], leg: 'long', costume: true, parts: P('bottom-swat', 'bottom-soldier') },
  { id: 'spacePants', slot: 'bottom', name: 'Space suit legs', emoji: '🧑‍🚀', price: 20000, colors: ['#445553', '#ffffff', '#174f6c'], leg: 'long', costume: true, parts: P('bottom-spacesuit', 'bottom-scifi') },
  { id: 'royalGreaves', slot: 'bottom', name: 'Royal greaves', emoji: '🛡️', price: 25000, colors: ['#4c4039', '#111111'], leg: 'long', costume: true, parts: P('bottom-king', 'bottom-medieval') },

  // ---- Shoes
  { id: 'sneakers', slot: 'shoes', name: 'Sneakers', emoji: '👟', price: 0, colors: ['#f2f2f2', '#111111', '#e63946', '#3a86ff'], sole: '#f7f7f7', parts: P('feet-casual') },
  { id: 'kicks', slot: 'shoes', name: 'High-top kicks', emoji: '👟', price: 13000, colors: ['#e63946', '#111111', '#ffffff', '#1d3557'], sole: '#ffffff', high: true, parts: P('feet-hoodie', 'feet-punk') },
  { id: 'boots', slot: 'shoes', name: 'Work boots', emoji: '🥾', price: 9500, colors: ['#c68b3b', '#3b2a1a', '#111111'], sole: '#2b2118', high: true, parts: P('feet-worker', 'feet-adventurer') },
  { id: 'limitedKicks', slot: 'shoes', name: 'Limited-drop sneakers', emoji: '👟', price: 90000, tier: 'exclusive', colors: ['#c9a227', '#7f1d1d', '#ffffff'], sole: '#111111', high: true, parts: P('feet-hoodie', 'feet-punk') },
  { id: 'slides', slot: 'shoes', name: 'Flip-flops', emoji: '🩴', price: 1200, colors: ['#111111', '#1d3557', '#9b2226', '#ffffff'], sole: '#2b2d42', style: 'slides', parts: P('feet-beach', 'feet-formal') },
  { id: 'canvas', slot: 'shoes', name: 'Canvas low-tops', emoji: '👟', price: 2500, colors: ['#111111', '#9b2226', '#1d3557', '#f1e9da'], sole: '#f7f4ea', style: 'canvas', parts: P('feet-casual') },
  { id: 'loafers', slot: 'shoes', name: 'Loafers', emoji: '👞', price: 8000, colors: ['#3b2a1a', '#111111', '#7f4f24'], sole: '#1a1410', parts: P('feet-suit') },
  { id: 'combatBoots', slot: 'shoes', name: 'Combat boots', emoji: '🥾', price: 11000, colors: ['#111111', '#3b2a1a'], sole: '#111111', high: true, parts: P('feet-punk', 'feet-soldier') },
  { id: 'spaceBoots', slot: 'shoes', name: 'Moon boots', emoji: '🧑‍🚀', price: 15000, colors: ['#a25e34', '#ffffff'], sole: '#b1a6a1', high: true, costume: true, parts: P('feet-spacesuit', 'feet-scifi') },
  { id: 'knightBoots', slot: 'shoes', name: 'Knight boots', emoji: '🛡️', price: 15000, colors: ['#636463', '#4b321e'], sole: '#505150', high: true, costume: true, parts: P('feet-king', 'feet-medieval') },

  // ---- Hats (a "headgear" hat is a whole head: it replaces the hair)
  { id: 'cap', slot: 'hat', name: 'Fitted cap', emoji: '🧢', price: 3000, colors: ['#1d3557', '#111111', '#e63946', '#ffffff', '#2a9d8f'], style: 'cap', parts: P('hat-cap') },
  { id: 'beanie', slot: 'hat', name: 'Beanie', emoji: '🧶', price: 2000, colors: ['#111111', '#e9c46a', '#e63946', '#8d99ae', '#2a9d8f'], style: 'beanie', parts: P('hat-beanie') },
  { id: 'bucketHat', slot: 'hat', name: 'Bucket hat', emoji: '👒', price: 2800, colors: ['#c2b280', '#111111', '#ffffff', '#6b705c'], style: 'bucket', parts: P('hat-bucket') },
  { id: 'durag', slot: 'hat', name: 'Durag', emoji: '🧣', price: 1500, colors: ['#111111', '#9b2226', '#1d3557', '#c9a227'], style: 'durag', parts: P('hat-durag') },
  { id: 'hardHat', slot: 'hat', name: 'Hard hat', emoji: '⛑️', price: 2500, colors: ['#f2c12e', '#ff7b00', '#ffffff'], style: 'headgear', parts: P('head-worker') },
  { id: 'cowboyHat', slot: 'hat', name: 'Cowboy hat', emoji: '🤠', price: 6000, colors: ['#9b967b', '#3b2a1a', '#111111'], style: 'headgear', costume: true, parts: P('head-farmer', 'head-worker') },
  { id: 'crown', slot: 'hat', name: 'Crown', emoji: '👑', price: 50000, colors: ['#d4af37'], style: 'headgear', costume: true, parts: P('head-king', 'head-medieval') },
  { id: 'witchHat', slot: 'hat', name: 'Witch hat', emoji: '🧙', price: 6000, colors: ['#441f68', '#111111'], style: 'headgear', costume: true, parts: P('head-farmer', 'head-witch') },
  { id: 'helmet', slot: 'hat', name: 'Tactical helmet', emoji: '🪖', price: 9000, colors: ['#34322f', '#4b5320'], style: 'headgear', costume: true, parts: P('head-swat', 'head-medieval') },
  { id: 'spaceHelmet', slot: 'hat', name: 'Space helmet', emoji: '🧑‍🚀', price: 25000, colors: ['#a25e34', '#ffffff'], style: 'headgear', costume: true, parts: P('head-spacesuit', 'head-scifi') },

  // ---- Extras
  { id: 'shades', slot: 'extra', name: 'Sunglasses', emoji: '🕶️', price: 2500, colors: ['#111111'], style: 'shades', parts: P('extra-shades') },
  { id: 'glasses', slot: 'extra', name: 'Glasses', emoji: '👓', price: 6000, colors: ['#222222', '#7f4f24', '#c9a227'], style: 'glasses', parts: P('extra-glasses') },
  { id: 'backpack', slot: 'extra', name: 'Backpack', emoji: '🎒', price: 4000, colors: ['#111111', '#e63946', '#2a9d8f', '#f4a261'], style: 'backpack', parts: P('pack-adventurer', '') },
  { id: 'headphones', slot: 'extra', name: 'Headphones', emoji: '🎧', price: 9000, colors: ['#111111', '#ffffff', '#e63946', '#3a86ff'], style: 'headphones', parts: P('extra-headphones') },
  { id: 'chain', slot: 'extra', name: 'Gold chain', emoji: '📿', price: 25000, tier: 'exclusive', colors: ['#d4af37'], style: 'chain', parts: P('extra-chain') },
  { id: 'diamondShades', slot: 'extra', name: 'Designer sunglasses', emoji: '🕶️', price: 60000, tier: 'exclusive', colors: ['#c9a227'], style: 'shades', parts: P('extra-shades') },
);

/** What everyone wears if their save doesn't say (older saves, crowd defaults). */
export function outfitDefaults(body: 'm' | 'f'): Required<Pick<Look, 'hairStyle' | 'topId' | 'bottomId' | 'shoesId' | 'shoes'>> {
  return { hairStyle: body === 'f' ? 'hair_long' : 'hair_short', topId: 'tee', bottomId: 'jeans', shoesId: 'sneakers', shoes: '#f2f2f2' };
}

/** Item ids every player owns from the start (all the free ones). */
export const STARTER_ITEMS = (): string[] => CLOTHES.where((c) => c.price === 0).map((c) => c.id);

/** An item's tier: its own setting, or worked out from the price. */
export function tierOf(item: ClothingItem): Tier {
  if (item.tier) return item.tier;
  return item.price <= 5500 ? 'plain' : item.price <= 20000 ? 'premium' : 'exclusive';
}

/**
 * Hand-picked starting closets. Starting broke in an East Harlem walk-up:
 * a rack of hand-me-down basics, enough to dress for work, the gym and a
 * night out, nothing fancy. (Classes not listed get random items per tier.)
 */
export const STARTER_CLOSETS: Partial<Record<SpawnClass, string[]>> = {
  poor: ['tee', 'tank', 'flannel', 'crewneck', 'hoodie', 'jeans', 'joggers', 'sweatShorts', 'sneakers', 'slides', 'beanie', 'durag', 'backpack'],
};

/** How many items of each tier you start with, by spawn class. */
export const STARTING_WARDROBE: Record<SpawnClass, Record<Tier, number>> = {
  poor: { plain: 13, premium: 0, exclusive: 0 },
  middle: { plain: 6, premium: 2, exclusive: 0 },
  rich: { plain: 8, premium: 8, exclusive: 2 },
  billionaire: { plain: 2, premium: 12, exclusive: 5 },
};

/**
 * Pick a starting wardrobe: every hairstyle, the outfit you made on the
 * character screen, then random items per tier until the counts in
 * STARTING_WARDROBE are met. Everyone gets at least one top, bottom and
 * pair of shoes. `rand` returns 0..1.
 */
export function starterWardrobe(cls: SpawnClass, wearing: string[], rand: () => number): string[] {
  const owned = new Set<string>(CLOTHES.where((c) => c.slot === 'hair').map((c) => c.id));
  for (const id of wearing) if (CLOTHES.has(id)) owned.add(id);
  const curated = STARTER_CLOSETS[cls];
  if (curated) for (const id of curated) owned.add(id);
  else for (const [tier, n] of Object.entries(STARTING_WARDROBE[cls]) as [Tier, number][]) {
    const pool = CLOTHES.where((c) => c.slot !== 'hair' && !c.costume && tierOf(c) === tier && !owned.has(c.id));
    // Basics first so nobody starts without trousers.
    pool.sort((a, b) => (['top', 'bottom', 'shoes'].includes(b.slot) ? 1 : 0) - (['top', 'bottom', 'shoes'].includes(a.slot) ? 1 : 0) + (rand() - 0.5) * 1.5);
    let added = 0;
    for (const it of pool) {
      if (added >= n) break;
      owned.add(it.id);
      added++;
    }
  }
  for (const slot of ['top', 'bottom', 'shoes'] as const) {
    if (![...owned].some((id) => CLOTHES.get(id)?.slot === slot)) owned.add(CLOTHES.where((c) => c.slot === slot).sort((a, b) => a.price - b.price)[0].id);
  }
  return [...owned];
}

/** Narrow helper: the item in a slot, typed. */
export function itemOf<S extends Slot>(id: string | undefined, slot: S): Extract<ClothingItem, { slot: S }> | undefined {
  const it = CLOTHES.get(id);
  return it && it.slot === slot ? (it as Extract<ClothingItem, { slot: S }>) : undefined;
}
