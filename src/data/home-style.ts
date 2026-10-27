// =====================================================================
// home-style.ts — how a home LOOKS, beyond the furniture: the floor of
// each room, the paint or wallpaper on each wall, and the lights.
// (Peter, 2026-10-27: "Lagos Life-level house customisation is a must".)
//
// A home's style is saved per home (state.homeStyles[placeId]):
//   rooms[i]   — floor and walls for room i of the floor plan
//   faces[key] — one wall painted differently (an accent wall); the key
//                is the wall's id from home-interior.ts
//   lights     — 'auto' (on after dark), 'on' or 'off'
//
// Styles are short strings so saves stay small:
//   floor: 'oak', 'carpet:#7b5ea7'          (id, or id:colour when it takes a colour)
//   wall:  'paint:#f3e3d0', 'brick', 'stripes:#2e5e4e'
//
// TO ADD A FLOOR OR WALLPAPER: add it to FLOORS / WALLS here and draw
// it in render/home-surfaces.ts (same id).
// =====================================================================

export interface SurfaceStyle {
  id: string;
  name: string;
  emoji: string;
  /** Cost to lay/hang, in cents per square metre (floors) or per room (walls). */
  price: number;
  /** Takes a colour (paint, carpet, tiles…). */
  tint?: boolean;
  /** Default colour for tinted styles. */
  color?: string;
}

export const FLOORS: SurfaceStyle[] = [
  { id: 'oak', name: 'Oak planks', emoji: '🪵', price: 3_500 },
  { id: 'ash', name: 'Pale ash planks', emoji: '🪵', price: 4_000 },
  { id: 'walnut', name: 'Walnut planks', emoji: '🪵', price: 6_000 },
  { id: 'herringbone', name: 'Herringbone', emoji: '🪵', price: 9_000 },
  { id: 'parquet', name: 'Parquet squares', emoji: '🟫', price: 8_000 },
  { id: 'marble', name: 'White marble', emoji: '🤍', price: 18_000 },
  { id: 'marbleBlack', name: 'Black marble', emoji: '🖤', price: 22_000 },
  { id: 'terrazzo', name: 'Terrazzo', emoji: '🍪', price: 12_000 },
  { id: 'checker', name: 'Checkerboard', emoji: '🏁', price: 6_000 },
  { id: 'tile', name: 'Square tiles', emoji: '⬜', price: 4_500, tint: true, color: '#e9ecef' },
  { id: 'hex', name: 'Hex tiles', emoji: '⬡', price: 7_000, tint: true, color: '#dfe7e6' },
  { id: 'terracotta', name: 'Terracotta', emoji: '🧱', price: 5_500 },
  { id: 'concrete', name: 'Polished concrete', emoji: '🩶', price: 5_000 },
  { id: 'carpet', name: 'Carpet', emoji: '🧶', price: 3_000, tint: true, color: '#8d7b6a' },
  { id: 'vinyl', name: 'Old linoleum', emoji: '🟨', price: 1_500 },
];

export const WALLS: SurfaceStyle[] = [
  { id: 'paint', name: 'Paint', emoji: '🎨', price: 5_000, tint: true, color: '#efe6da' },
  { id: 'brick', name: 'Exposed brick', emoji: '🧱', price: 40_000 },
  { id: 'whiteBrick', name: 'White brick', emoji: '🧱', price: 35_000 },
  { id: 'stripes', name: 'Stripes', emoji: '🦓', price: 15_000, tint: true, color: '#3f6f5e' },
  { id: 'damask', name: 'Damask wallpaper', emoji: '🌸', price: 22_000, tint: true, color: '#7c3b4e' },
  { id: 'geo', name: 'Art deco wallpaper', emoji: '🔶', price: 25_000, tint: true, color: '#1f3b4d' },
  { id: 'panel', name: 'Wainscot panels', emoji: '🚪', price: 30_000, tint: true, color: '#2f4858' },
  { id: 'slats', name: 'Wood slats', emoji: '🪵', price: 28_000, tint: true, color: '#b07d4f' },
  { id: 'subway', name: 'Subway tiles', emoji: '⬜', price: 18_000, tint: true, color: '#f4f4f2' },
  { id: 'marbleWall', name: 'Marble slab', emoji: '🤍', price: 60_000 },
  { id: 'concreteWall', name: 'Raw concrete', emoji: '🩶', price: 12_000 },
];

/** Paint and fabric colours: soft neutrals, rich darks, and a few loud ones. */
export const PALETTE: string[] = [
  '#ffffff', '#f4efe6', '#efe6da', '#e8d8c3', '#d9c7b0', '#c9b79c', '#a39887', '#6f6a63',
  '#3b3b3f', '#1d1f24', '#f2d4cf', '#e7a8a0', '#c8553d', '#8c2f39', '#5e1f2b', '#f6d58e',
  '#e9b44c', '#c47f2c', '#d7e3c3', '#a3b18a', '#588157', '#2f4f3a', '#1b3a2f', '#cfe3ea',
  '#8ecae6', '#4f86a6', '#1f3b4d', '#14213d', '#cdb4db', '#9d7bb0', '#5b2a86', '#ff6fb5',
];

/** Light colours for bulbs and LED strips. */
export const LIGHT_COLORS: { id: string; name: string; color: string }[] = [
  { id: 'warm', name: 'Warm white', color: '#ffd29a' },
  { id: 'soft', name: 'Soft white', color: '#fff1d6' },
  { id: 'cool', name: 'Daylight', color: '#e8f1ff' },
  { id: 'amber', name: 'Amber', color: '#ffae42' },
  { id: 'pink', name: 'Pink', color: '#ff5fa2' },
  { id: 'purple', name: 'Purple', color: '#9b5cff' },
  { id: 'blue', name: 'Blue', color: '#3d8bff' },
  { id: 'teal', name: 'Teal', color: '#22d3c5' },
  { id: 'green', name: 'Green', color: '#3ddc84' },
  { id: 'red', name: 'Red', color: '#ff3b3b' },
];

export interface RoomStyle {
  floor?: string;
  wall?: string;
}

export interface HomeStyle {
  rooms?: Record<string, RoomStyle>;
  faces?: Record<string, string>;
  lights?: 'auto' | 'on' | 'off';
}

/** 'carpet:#7b5ea7' → { id: 'carpet', color: '#7b5ea7' } */
export function parseStyle(s: string | undefined): { id: string; color?: string } {
  if (!s) return { id: '' };
  const k = s.indexOf(':');
  return k < 0 ? { id: s } : { id: s.slice(0, k), color: s.slice(k + 1) };
}

export function styleKey(id: string, color?: string): string {
  return color ? `${id}:${color}` : id;
}

export const floorStyle = (id: string) => FLOORS.find((f) => f.id === id);
export const wallStyle = (id: string) => WALLS.find((w) => w.id === id);

/** A floor in a layout written as a plain colour (old plans): the nearest style. */
export function floorFromColor(hex: string): string {
  const c = parseInt(hex.slice(1), 16);
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const l = (r + g + b) / 3;
  if (Math.abs(r - g) < 14 && Math.abs(g - b) < 14) return l > 200 ? 'tile' : l > 120 ? 'concrete' : 'marbleBlack';
  if (b > r) return styleKey('carpet', hex);
  return l > 170 ? 'ash' : l > 110 ? 'oak' : 'walnut';
}

/** One-tap looks for a whole home: every room's floor and walls together. */
export interface StylePreset {
  id: string;
  name: string;
  emoji: string;
  /** Floors and walls by room type (matched on the room's label). */
  living: RoomStyle;
  bed: RoomStyle;
  kitchen: RoomStyle;
  bath: RoomStyle;
  /** Pieces it recolours: main fabric and frame. */
  fabric: string;
  frame: string;
  light: string;
}

export const PRESETS: StylePreset[] = [
  { id: 'brooklyn', name: 'Brooklyn loft', emoji: '🧱', living: { floor: 'walnut', wall: 'brick' }, bed: { floor: 'oak', wall: 'paint:#e8d8c3' }, kitchen: { floor: 'concrete', wall: 'subway:#f4f4f2' }, bath: { floor: 'hex:#dfe7e6', wall: 'subway:#f4f4f2' }, fabric: '#8c5a3c', frame: '#3b2a20', light: 'warm' },
  { id: 'scandi', name: 'Scandi calm', emoji: '🤍', living: { floor: 'ash', wall: 'paint:#f4efe6' }, bed: { floor: 'ash', wall: 'paint:#d7e3c3' }, kitchen: { floor: 'tile:#e9ecef', wall: 'paint:#ffffff' }, bath: { floor: 'terrazzo', wall: 'subway:#ffffff' }, fabric: '#c9b79c', frame: '#e8d8c3', light: 'soft' },
  { id: 'luxe', name: 'Billionaire luxe', emoji: '💎', living: { floor: 'marble', wall: 'panel:#1d1f24' }, bed: { floor: 'herringbone', wall: 'damask:#5e1f2b' }, kitchen: { floor: 'marbleBlack', wall: 'marbleWall' }, bath: { floor: 'marble', wall: 'marbleWall' }, fabric: '#1b3a2f', frame: '#c47f2c', light: 'warm' },
  { id: 'harlem', name: 'Harlem brownstone', emoji: '🏛️', living: { floor: 'parquet', wall: 'panel:#5e1f2b' }, bed: { floor: 'parquet', wall: 'damask:#2f4f3a' }, kitchen: { floor: 'checker', wall: 'subway:#f4efe6' }, bath: { floor: 'checker', wall: 'subway:#f4efe6' }, fabric: '#8c2f39', frame: '#3b2a20', light: 'amber' },
  { id: 'miami', name: 'Miami pastel', emoji: '🌴', living: { floor: 'terrazzo', wall: 'paint:#f2d4cf' }, bed: { floor: 'terrazzo', wall: 'stripes:#8ecae6' }, kitchen: { floor: 'hex:#cfe3ea', wall: 'paint:#f6d58e' }, bath: { floor: 'hex:#f2d4cf', wall: 'subway:#cfe3ea' }, fabric: '#e7a8a0', frame: '#ffffff', light: 'pink' },
  { id: 'deco', name: 'Art deco night', emoji: '🔶', living: { floor: 'marbleBlack', wall: 'geo:#14213d' }, bed: { floor: 'herringbone', wall: 'geo:#1b3a2f' }, kitchen: { floor: 'checker', wall: 'paint:#1d1f24' }, bath: { floor: 'marbleBlack', wall: 'marbleWall' }, fabric: '#e9b44c', frame: '#1d1f24', light: 'amber' },
  { id: 'gamer', name: 'Gamer cave', emoji: '🎮', living: { floor: 'carpet:#1d1f24', wall: 'paint:#14213d' }, bed: { floor: 'carpet:#3b3b3f', wall: 'slats:#3b3b3f' }, kitchen: { floor: 'concrete', wall: 'paint:#1d1f24' }, bath: { floor: 'tile:#3b3b3f', wall: 'subway:#3b3b3f' }, fabric: '#5b2a86', frame: '#1d1f24', light: 'purple' },
  { id: 'cottage', name: 'Cosy cottage', emoji: '🌿', living: { floor: 'oak', wall: 'panel:#588157' }, bed: { floor: 'carpet:#d9c7b0', wall: 'damask:#a3b18a' }, kitchen: { floor: 'terracotta', wall: 'paint:#f4efe6' }, bath: { floor: 'terracotta', wall: 'subway:#d7e3c3' }, fabric: '#a3b18a', frame: '#c47f2c', light: 'warm' },
];

/** Which preset part a room gets, from its label. */
export function roomKind(label: string): 'living' | 'bed' | 'kitchen' | 'bath' {
  const l = label.toLowerCase();
  if (/bath|shower|toilet|powder/.test(l)) return 'bath';
  if (/kitchen|dining|pantry/.test(l)) return 'kitchen';
  if (/bed|sleep|nursery|guest/.test(l)) return 'bed';
  return 'living';
}
