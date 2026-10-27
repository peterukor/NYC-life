// =====================================================================
// venue-looks.ts — every venue made bigger, livelier and more like the
// real thing (Peter, 2026-10-27: "clubs look like clubs, arcades look
// like arcades… make locations bigger so a full capacity don't feel too
// crowded").
//
// The floor plans in data/venues.ts stay the source of what's in each
// room (counters, stations, worker spots). This file DRESSES them:
//   scale  — the room grows by this much; pieces spread out with it,
//            but anything against a wall stays against that wall
//   mood   — how it's lit (a dark club, a warm bar, a bright deli…)
//   rooms  — floor and wall finish per room (data/home-style.ts)
//   tint   — colours for the existing pieces (booth leather, cushions…)
//   add    — extra pieces in the grown room: pendant lights, LED strips,
//            neon, plants, rugs, art (positions are AFTER scaling)
//   signs  — glowing neon words on the walls
//
// TO DRESS A NEW VENUE: add an entry keyed by its layout id.
// =====================================================================

import type { HomeItem, HomeLayout, HomeRoom } from './homes.ts';

type Look = {
  scale: number;
  mood: NonNullable<HomeLayout['mood']>;
  rooms: (HomeRoom['style'] | undefined)[];
  tint?: Record<string, { a?: string; b?: string; lc?: string }>;
  add?: Omit<HomeItem, 'uid'>[];
  signs?: NonNullable<HomeLayout['signs']>;
  wallHeight?: number;
  /** Old pieces to take out (the toy neon signs: real neon words replace them). */
  remove?: string[];
  /** Old pieces to nudge (after scaling): uid → [x, z]. */
  move?: Record<string, [number, number]>;
};

const H = Math.PI / 2;
/** A wall piece on the back wall at x (rot 0), the left wall at z (rot H), or the right wall at z (rot −H). */
const back = (item: string, x: number, hd: number, extra: Partial<HomeItem> = {}): Omit<HomeItem, 'uid'> => ({ item, x, z: -hd + 0.17, rot: 0, ...extra });
const left = (item: string, z: number, hw: number, extra: Partial<HomeItem> = {}): Omit<HomeItem, 'uid'> => ({ item, x: -hw + 0.14, z, rot: H, ...extra });
const right = (item: string, z: number, hw: number, extra: Partial<HomeItem> = {}): Omit<HomeItem, 'uid'> => ({ item, x: hw - 0.14, z, rot: -H, ...extra });
const hang = (item: string, x: number, z: number, lc?: string): Omit<HomeItem, 'uid'> => ({ item, x, z, rot: 0, ...(lc ? { lc } : {}) });
const at = (item: string, x: number, z: number, rot = 0, extra: Partial<HomeItem> = {}): Omit<HomeItem, 'uid'> => ({ item, x, z, rot, ...extra });
/** A neon word on the back wall (y up the wall), the left wall or the right wall. */
const neonBack = (text: string, color: string, x: number, y: number, hd: number, size = 0.55, font: 'script' | 'block' = 'block') => ({ text, color, x, y, z: -hd + 0.12, rot: 0, size, font });
const neonLeft = (text: string, color: string, z: number, y: number, hw: number, size = 0.55, font: 'script' | 'block' = 'block') => ({ text, color, x: -hw + 0.12, y, z, rot: H, size, font });
const neonRight = (text: string, color: string, z: number, y: number, hw: number, size = 0.55, font: 'script' | 'block' = 'block') => ({ text, color, x: hw - 0.12, y, z, rot: -H, size, font });

const PINK = '#ff4fb8', CYAN = '#22d3ee', PURPLE = '#9b5cff', AMBER = '#ffae42', RED = '#ff3b3b', GREEN = '#3ddc84', GOLD = '#ffd36b', BLUE = '#3d8bff';

/** Dressing by layout id. The sizes in comments are after scaling. */
export const VENUE_LOOKS: Record<string, Look> = {
  // 🛋️ Lexington Home Goods: a bright showroom (17.5 × 12.5).
  furniture: {
    scale: 1.25, mood: 'bright',
    rooms: [{ floor: 'ash', wall: 'paint:#eef2ee' }],
    add: [hang('crystalChandelier', -2.0, -1.2), hang('geoTrio', 3.5, 1.6), hang('globePendantGrey', -6, 2), at('persianRug', -2.0, 3.6, 0), at('arcLamp', 6.0, 4.2, Math.PI), at('oliveTree', -8.0, 5.4), at('monstera', 8.1, -5.6), left('artTriptych', 0.4, 8.75), right('mirrorArch', -2.4, 8.75)],
    signs: [neonBack('Home Goods', '#ff8a5b', -3.4, 2.15, 6.25, 0.5, 'script')],
  },
  // ☕ Café (17.5 × 12.5): white brick, chevron floor, bulbs over the counter.
  cafe: {
    scale: 1.25, mood: 'cozy',
    rooms: [{ floor: 'herringbone', wall: 'whiteBrick' }],
    tint: { t1: { a: '#3f6f5e' }, t2: { a: '#3f6f5e' }, t3: { a: '#3f6f5e' }, sofa: { a: '#8c5a3c' }, rug: { a: '#c47f2c' } },
    add: [hang('edisonCluster', -1.9, -2.9), hang('domePendant', -5.6, 1.5), hang('domePendant', 0, 2.0), hang('domePendant', 5.6, 1.5), hang('hangingPlant', -7.6, -1.5), hang('hangingPlant', 7.4, 2.8), left('artSkyline', 1.6, 8.75), back('wallShelf', 5.8, 6.25), back('wallShelf', -5.6, 6.25)],
    signs: [neonBack('coffee', AMBER, 2.4, 2.2, 6.25, 0.6, 'script')],
  },
  // 🏪 Bodega (15 × 11.25): linoleum, bright tubes, neon in the window.
  bodega: {
    scale: 1.25, mood: 'bright',
    rooms: [{ floor: 'vinyl', wall: 'paint:#f6f1e1' }],
    add: [hang('flushLight', -3, -2), hang('flushLight', 3, -2), hang('flushLight', -3, 2.2), hang('flushLight', 3, 2.2), at('trashSmall', -6.8, 4.9)],
    signs: [neonBack('OPEN', RED, 3.2, 2.25, 5.625, 0.45), neonBack('COLD BEER', BLUE, -2.4, 2.25, 5.625, 0.36), neonLeft('LOTTO', GOLD, 3.0, 2.1, 7.5, 0.36)],
  },
  // 🍕 Pizza (15 × 11.25): checkerboard, white tile, ceiling fans.
  pizza: {
    scale: 1.25, mood: 'cozy',
    rooms: [{ floor: 'checker', wall: 'subway:#f6efe3' }],
    tint: { t1: { a: '#c8553d' }, t2: { a: '#c8553d' } },
    add: [hang('ceilingFan', -4.4, 1.8), hang('ceilingFan', 4.4, 1.8), hang('bellPendant', -1.2, -2.6), hang('bellPendant', 1.2, -2.6), at('palmPot', 6.8, 4.9), left('artSkyline', 1.6, 7.5)],
    signs: [neonBack('PIZZA', RED, 2.8, 2.2, 5.625, 0.6, 'script'), neonBack('HOT', AMBER, -2.6, 2.3, 5.625, 0.4)],
  },
  // 🍸 Bar (17.5 × 12.5): brick, dark wood, Edison bulbs, a glow behind the bottles.
  bar: {
    scale: 1.25, mood: 'bar',
    rooms: [{ floor: 'walnut', wall: 'brick' }],
    tint: { booth1: { a: '#5e1f2b' }, booth2: { a: '#5e1f2b' }, t2: { a: '#5e1f2b' }, rug: { a: '#1f3b4d' } },
    add: [hang('edisonCluster', -2.6, -3.3), hang('edisonCluster', 0.6, -3.3), hang('bellPendant', -5.4, 2.8), hang('bellPendant', 3.1, 2.5), back('ledStrip', -1.2, 6.25, { lc: AMBER }), at('candles', 3.1, 2.5), right('galleryWall', 3.6, 8.75)],
    signs: [neonBack('cocktails', PINK, 4.6, 2.2, 6.25, 0.55, 'script'), neonLeft('BAR', AMBER, -3.8, 2.15, 8.75, 0.5)],
  },
  // 🏢 Office (18.75 × 12.5): carpet tiles, panel lights, plants.
  office: {
    scale: 1.25, mood: 'bright',
    rooms: [{ floor: 'carpet:#6f6a63', wall: 'paint:#e6e9ec' }],
    tint: { sofa: { a: '#1f3b4d' } },
    add: [hang('flushLight', -5.5, 0.5), hang('flushLight', -1.5, 0.5), hang('flushLight', 2.5, 0.5), hang('flushLight', -5.5, 4), hang('flushLight', 2.5, 4), at('palmPot', -8.9, 5.6), at('monstera', 8.9, -5.7), left('artTriptych', -1.8, 9.375)],
  },
  // 🎤 Comedy club (17.5 × 12.5): the black brick wall, one spotlight, red neon.
  comedy: {
    scale: 1.25, mood: 'bar',
    rooms: [{ floor: 'walnut', wall: 'darkBrick' }, { floor: 'parquet', wall: 'darkBrick' }],
    tint: { t1: { a: '#8c2f39' }, t2: { a: '#8c2f39' }, t3: { a: '#8c2f39' }, t4: { a: '#8c2f39' } },
    add: [hang('spotLight', 0, -4.2, '#fff1d6'), hang('spotLight', -1.2, -4.0, '#fff1d6'), hang('spotLight', 1.2, -4.0, '#fff1d6'), hang('bellPendant', -5, 0.5), hang('bellPendant', 5, 0.5), at('candles', -5, 0.5), at('candles', 0, 0.5)],
    signs: [neonBack('Comedy', RED, 0, 2.1, 6.25, 0.7, 'script')],
  },

  // 🥪 Deli & grill (19.2 × 14.4)
  deliGrill: {
    scale: 1.2, mood: 'bright',
    rooms: [{ floor: 'tile:#ece6da', wall: 'subway:#f4f4f2' }, { floor: 'rubber', wall: 'subway:#f4f4f2' }],
    add: [hang('flushLight', -4, -2), hang('flushLight', 0, -2), hang('flushLight', -4, 2.5), hang('flushLight', 0, 2.5), hang('flushLight', 5, 2.5), hang('bellPendant', 2.4, -3.5), hang('bellPendant', 4.6, -3.5)],
    signs: [neonBack('DELI', RED, -3.6, 2.25, 7.2, 0.55), neonBack('OPEN 24 HRS', BLUE, -7.0, 2.25, 7.2, 0.32), neonLeft('BACON EGG & CHEESE', AMBER, 0.6, 2.2, 9.6, 0.26)],
  },
  // 🍺 The Stoop (24 × 16.8): bar under brick, a pool room in green felt and wood.
  stoopBar: {
    scale: 1.2, mood: 'bar',
    rooms: [{ floor: 'walnut', wall: 'brick' }, { floor: 'carpet:#2f4f3a', wall: 'woodPanel' }],
    add: [hang('edisonCluster', -2.4, -4.0), hang('edisonCluster', 1.6, -4.0), hang('edisonCluster', 4.6, -4.0), hang('bellPendant', 7.7, 1.0), hang('bellPendant', 7.7, 1.9), hang('bellPendant', 7.7, 5.2), hang('bellPendant', 7.7, 6.1), back('ledStrip', -1.2, 8.4, { lc: AMBER }), back('ledStrip', 2.6, 8.4, { lc: AMBER }), at('candles', -6.0, 0.7), at('candles', -6.0, 4.6), at('candles', -2.9, 2.6), left('galleryWall', 6.9, 12)],
    signs: [neonBack('The Stoop', PINK, -8.4, 2.15, 8.4, 0.6, 'script'), neonRight('POOL', CYAN, 6.8, 2.1, 12, 0.5), neonBack('ON TAP', AMBER, 7.4, 2.25, 8.4, 0.4)],
  },
  // 🏋️ Iron (24 × 16.8): rubber floor, black brick, red neon.
  gym: {
    scale: 1.2, mood: 'bright',
    rooms: [{ floor: 'rubber', wall: 'concreteWall' }, { floor: 'ash', wall: 'concreteWall' }],
    add: [hang('flushLight2', -6, -3), hang('flushLight2', 0, -3), hang('flushLight2', 6, -3), hang('flushLight2', -6, 3), hang('flushLight2', 0, 3), hang('flushLight2', 6, 3), right('mirrorArch', 5.5, 12), right('mirrorArch', 7.0, 12), back('ledStrip', -6.6, 8.4, { lc: RED }), back('ledStrip', 4.4, 8.4, { lc: RED })],
    signs: [neonBack('IRON', RED, -2.4, 2.2, 8.4, 0.7), neonLeft('no pain no gain', '#ff6a3d', -2.0, 2.1, 12, 0.4, 'script')],
  },
  // 💻 Chelsea Works (24 × 16.8): concrete, white brick, a neon motto.
  startup: {
    scale: 1.2, mood: 'bright',
    rooms: [{ floor: 'concrete', wall: 'whiteBrick' }, { floor: 'terrazzo', wall: 'whiteBrick' }, { floor: 'carpet:#cfe3ea', wall: 'whiteBrick' }],
    add: [hang('edisonCluster', -6.7, -6.0), hang('edisonCluster', -6.7, -2.6), hang('ringPendant', 7.4, 0.6, CYAN), hang('paperLantern', -6, 6.3), hang('paperLantern', -3, 6.3), at('oliveTree', 11.2, -7.8), back('wallShelf', 4.4, 8.4), left('artShapes', -1.0, 12)],
    signs: [neonBack('ship it', PINK, 5.4, 2.2, 8.4, 0.55, 'script')],
  },
  // 📈 Trading floor (24 × 16.8): grey carpet, a walnut meeting room, a marble client lounge.
  tradingFloor: {
    scale: 1.2, mood: 'bright',
    rooms: [{ floor: 'carpet:#3b3b3f', wall: 'paint:#e6e9ec' }, { floor: 'walnut', wall: 'panel:#1f3b4d' }, { floor: 'marble', wall: 'paint:#f4f1ea' }],
    tint: { lounge: { a: '#1f3b4d' } },
    add: [hang('flushLight', -8.8, -5), hang('flushLight', -5.3, -5), hang('flushLight', -1.7, -5), hang('flushLight', -8.8, -1.6), hang('flushLight', -5.3, -1.6), hang('tulipChandelier', 7.9, -5.8), hang('geoPendant', 6.2, 1.7), hang('geoPendant', 9.8, 1.7), at('palmPot', 11.3, -0.4), at('fiddleFig', 2.4, 7.6)],
    signs: [neonLeft('BUY', GREEN, -1.0, 2.25, 12, 0.45), neonLeft('SELL', RED, 1.2, 2.25, 12, 0.45)],
  },
  // 🌙 The Velvet Room (24.6 × 17.9): gloss black, velvet walls, coloured LED everywhere.
  club: {
    scale: 1.12, mood: 'club', remove: ['neon', 'neon2'],
    rooms: [{ floor: 'glossBlack', wall: 'velvet:#3a1d55' }, { floor: 'casinoCarpet:#2d1b3d', wall: 'velvet:#5b2a86' }],
    add: [back('ledStrip', -9.0, 8.96, { lc: PINK }), back('ledStrip', -6.8, 8.96, { lc: PURPLE }), back('ledStrip', 6.8, 8.96, { lc: CYAN }), back('ledStrip', 9.0, 8.96, { lc: PINK }), left('ledStrip', -5.0, 12.32, { lc: PURPLE }), left('ledStrip', 5.0, 12.32, { lc: CYAN }), right('ledStrip', 6.6, 12.32, { lc: PINK }), back('ledStripLow', -3.0, 8.96, { lc: CYAN }), back('ledStripLow', 3.0, 8.96, { lc: PINK }), hang('ringPendant', 0, 1.6, PINK), hang('sputnik', 9.6, -4.5), hang('crystalChandelier', 9.6, 1.0)],
    signs: [neonBack('Velvet', PINK, 0, 2.35, 8.96, 0.8, 'script'), neonLeft('DANCE', CYAN, 0.2, 2.2, 12.32, 0.55)],
  },
  // ♟️ The Chess House (17.5 × 12.5): parquet, wood panels, a lamp over every board.
  chessHouse: {
    scale: 1.25, mood: 'cozy',
    rooms: [{ floor: 'parquet', wall: 'woodPanel' }],
    add: [hang('bellPendant', -5.25, 0.25), hang('bellPendant', 0, 0.25), hang('bellPendant', 5.25, 0.25), hang('bellPendant', -2.6, 3.75), hang('bellPendant', 2.6, 3.75), at('persianRug', 0, 1.9), left('artSkyline', 2.6, 8.75)],
    signs: [neonBack('check', GOLD, -0.6, 2.3, 6.25, 0.5, 'script')],
  },
  // 🎨 Bowery Art Parlor (17.5 × 12.5): a white gallery with spotlights.
  artParlor: {
    scale: 1.25, mood: 'bright',
    rooms: [{ floor: 'concrete', wall: 'whiteBrick' }],
    add: [back('artShapes', -5.6, 6.25), back('artTriptych', 5.4, 6.25), left('galleryWall', 3.6, 8.75), right('artSkyline', -3.8, 8.75), hang('spotLight', -5.6, -4.6), hang('spotLight', 5.4, -4.6), hang('paperLantern', 0, 1.5), at('pampas', 8.1, 5.6)],
    signs: [neonBack('make art', PINK, 0, 2.35, 6.25, 0.5, 'script')],
  },
  // 🎧 Basement 212 (19.2 × 14.4): bare concrete and black brick, red and blue LED.
  club1: {
    scale: 1.2, mood: 'club', remove: ['neon'],
    rooms: [{ floor: 'concrete', wall: 'darkBrick' }],
    add: [back('ledStrip', -6.2, 7.2, { lc: RED }), back('ledStrip', 6.0, 7.2, { lc: BLUE }), left('ledStrip', -2.0, 9.6, { lc: RED }), left('ledStrip', 3.0, 9.6, { lc: BLUE }), right('ledStrip', 1.0, 9.6, { lc: RED }), hang('edisonCluster', -6.6, 1.4)],
    signs: [neonBack('212', RED, 3.6, 2.3, 7.2, 0.7), neonLeft('basement', BLUE, -5.0, 2.1, 9.6, 0.45, 'script')],
  },
  // 🌆 Skye Rooftop (28.6 × 19.8): a deck under the sky, a low parapet, fairy lights.
  club3: {
    scale: 1.1, mood: 'club', wallHeight: 1.3, remove: ['neon', 'neon2'],
    rooms: [{ floor: 'walnut', wall: 'concreteWall' }, { floor: 'casinoCarpet:#3a2440', wall: 'concreteWall' }],
    add: [back('ledStripLow', -9, 9.9, { lc: PINK }), back('ledStripLow', -5, 9.9, { lc: CYAN }), back('ledStripLow', 5, 9.9, { lc: PURPLE }), back('ledStripLow', 9, 9.9, { lc: PINK }), left('ledStripLow', -4, 14.3, { lc: CYAN }), left('ledStripLow', 4, 14.3, { lc: PURPLE }), hang('paperLantern', -3.5, -0.5), hang('paperLantern', 3.5, -0.5), hang('paperLantern', 0, 3.4), at('oliveTree', 13.2, 8.6), at('palmPot', -13.4, -3.4)],
    signs: [neonBack('SKYE', CYAN, 0, 1.05, 9.9, 0.5)],
  },
  // 💎 Aurum (33 × 22): black marble, art deco gold, crystal everywhere.
  club4: {
    scale: 1.1, mood: 'casino', remove: ['neon', 'neon2'],
    rooms: [{ floor: 'marbleBlack', wall: 'geo:#1d1f24' }, { floor: 'casinoCarpet:#3d2e12', wall: 'velvet:#3d2e12' }],
    add: [hang('crystalChandelier', -10, 4), hang('crystalChandelier', 0, 4.5), hang('crystalChandelier', 10, 4), hang('crystalChandelier', 14, -5), hang('sputnik', -3, -2.6), hang('sputnik', 3, -2.6), back('ledStrip', -12, 11, { lc: GOLD }), back('ledStrip', 12, 11, { lc: GOLD }), at('columnTall', -9.5, 9.6), at('columnTall', 9.5, 9.6)],
    signs: [neonBack('AURUM', GOLD, 0, 2.35, 11, 0.7)],
  },
  // 💊 Orchard Street alley (19.2 × 16.8): asphalt, brick, a string of bulbs.
  alley: {
    scale: 1.2, mood: 'outdoor',
    rooms: [{ floor: 'asphalt', wall: 'brick' }],
    add: [back('fairyLights', -3.0, 8.4), back('fairyLights', 3.4, 8.4)],
    signs: [neonLeft('OPEN', RED, 5.4, 2.2, 9.6, 0.4)],
  },
  // 🚓 18th Precinct (24 × 16.8): institutional green-grey, strip lights.
  precinct: {
    scale: 1.2, mood: 'bright',
    rooms: [{ floor: 'tile:#cfd8dc', wall: 'panel:#5b6b78' }, { floor: 'carpet:#5b6b78', wall: 'paint:#cfd8dc' }],
    add: [hang('flushLight2', -6, 0), hang('flushLight2', 0, 0), hang('flushLight2', -6, 4), hang('flushLight2', 0, 4), hang('flushLight2', 6, -5), hang('flushLight2', 6, -2), right('bathMirror', 6.0, 12)],
  },
  // 🕹️ Pixel Palace (21.6 × 16.8): the cosmic carpet, neon, glowing cabinets.
  arcade: {
    scale: 1.2, mood: 'arcade', remove: ['neon', 'neon2'], move: { stack1: [-9.7, 5.4] },
    rooms: [{ floor: 'cosmic', wall: 'paint:#140b2e' }, { floor: 'carpet:#2d1b5e', wall: 'paint:#1d1340' }],
    add: [back('ledStrip', -6.0, 8.4, { lc: PINK }), back('ledStrip', -1.0, 8.4, { lc: CYAN }), back('ledStrip', 4.0, 8.4, { lc: PURPLE }), left('ledStrip', -2.0, 10.8, { lc: CYAN }), left('ledStrip', 3.5, 10.8, { lc: PINK }), right('ledStrip', -4.4, 10.8, { lc: GREEN }), back('ledStripLow', -3.6, 8.4, { lc: PURPLE }), back('ledStripLow', 2.0, 8.4, { lc: PINK }), hang('ringPendant', -4.4, 1.4, CYAN), hang('ringPendant', 0, 4.4, PINK)],
    signs: [neonBack('ARCADE', CYAN, -2.6, 2.35, 8.4, 0.6), neonBack('GAME ON', PINK, 4.4, 2.35, 8.4, 0.45), neonRight('PRIZES', GOLD, 3.0, 2.25, 10.8, 0.5), neonLeft('HIGH SCORE', GREEN, 0.4, 2.25, 10.8, 0.36)],
  },
  // 🎰 Empire Casino (24.6 × 17.9): red carpet, damask, chandeliers, no clocks.
  casino: {
    scale: 1.12, mood: 'casino',
    rooms: [{ floor: 'casinoCarpet', wall: 'damask:#3d0c1e' }, { floor: 'casinoCarpet:#1f3b4d', wall: 'velvet:#3d0c1e' }],
    add: [hang('crystalChandelier', -6, -1), hang('crystalChandelier', 6, 6), hang('crystalChandelier', 6.8, -6.0), hang('tulipChandelier', -6, 5), back('ledStrip', -9, 8.96, { lc: GOLD }), back('ledStrip', 9, 8.96, { lc: GOLD }), at('columnTall', -1.6, 8.0), at('columnTall', 4.0, 8.0)],
    signs: [neonBack('JACKPOT', GOLD, -4.0, 2.35, 8.96, 0.6), neonRight('777', RED, 6.2, 2.3, 12.32, 0.6), neonLeft('Empire', PINK, 0, 2.3, 12.32, 0.55, 'script')],
  },
  // 🌳 Central Park (26.9 × 20.2): grass, paver paths, low hedges round the edge.
  park: {
    scale: 1.12, mood: 'outdoor', wallHeight: 1.1,
    rooms: [{ floor: 'grass', wall: 'hedge' }, { floor: 'hex:#cfc6b8', wall: 'hedge' }, { floor: 'hex:#cfc6b8', wall: 'hedge' }],
  },
};

/**
 * Grow a coordinate by `s`, but keep anything near a wall the same
 * distance from that wall (a booth against the wall stays against it).
 */
function grow(v: number, half: number, s: number): number {
  const gap = half - Math.abs(v);
  if (gap < 1.4) return Math.sign(v) * (half * s - gap);
  return v * s;
}

/** Dress one layout in place (data/venues.ts calls this on every venue). */
export function dressVenue(layout: HomeLayout): void {
  const look = VENUE_LOOKS[layout.id];
  if (!look) return;
  const s = look.scale;
  if (look.remove) layout.furniture = layout.furniture.filter((f) => !look.remove!.includes(f.uid));
  const hw = layout.width / 2, hd = layout.depth / 2;
  const gx = (x: number) => grow(x, hw, s), gz = (z: number) => grow(z, hd, s);
  for (const f of layout.furniture) {
    f.x = +gx(f.x).toFixed(3);
    f.z = +gz(f.z).toFixed(3);
    const t = look.tint?.[f.uid];
    if (t) Object.assign(f, t);
  }
  for (const w of layout.workers ?? []) {
    w.x = +gx(w.x).toFixed(3);
    w.z = +gz(w.z).toFixed(3);
  }
  for (const r of layout.rooms) r.rect = [r.rect[0] * s, r.rect[1] * s, r.rect[2] * s, r.rect[3] * s];
  layout.rooms.forEach((r, i) => {
    if (look.rooms[i]) r.style = look.rooms[i];
  });
  for (const w of layout.walls) {
    w.a = [w.a[0] * s, w.a[1] * s];
    w.b = [w.b[0] * s, w.b[1] * s];
    if (w.gaps) w.gaps = w.gaps.map(([a, b]) => [a * s, b * s]);
  }
  if (layout.windows) layout.windows = { ...layout.windows, xs: layout.windows.xs.map((x) => x * s) };
  layout.width = +(layout.width * s).toFixed(2);
  layout.depth = +(layout.depth * s).toFixed(2);
  layout.mood = look.mood;
  if (look.wallHeight) layout.wallHeight = look.wallHeight;
  for (const [uid, [x, z]] of Object.entries(look.move ?? {})) {
    const f = layout.furniture.find((i) => i.uid === uid);
    if (f) Object.assign(f, { x, z });
  }
  (look.add ?? []).forEach((a, i) => layout.furniture.push({ uid: `look${i}`, ...a }));
  if (look.signs) layout.signs = look.signs;
}
