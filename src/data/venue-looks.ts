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
  /** Old pieces swapped for new ones (same uid, so jobs and waiters still find them): uid → [item, x, z, rot]. */
  swap?: Record<string, [string, number, number, number]>;
  /** Corners cut out of the room (after scaling): the room stops being a plain rectangle. */
  notch?: [number, number, number, number][];
  /** Video walls. */
  screens?: NonNullable<HomeLayout['screens']>;
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
  // 🍸 Bar (17.5 × 12.5): brick, a glowing bar, lit bottles, lounge tables with candles.
  bar: {
    scale: 1.25, mood: 'bar', remove: ['shelf', 'shelf2'], notch: [[5.6, 3.6, 8.75, 6.25]],
    rooms: [{ floor: 'walnut', wall: 'brick' }],
    tint: { booth1: { a: '#5e1f2b' }, booth2: { a: '#5e1f2b' }, rug: { a: '#1f3b4d' } },
    swap: { counter: ['ledBar', -1.3, -3.3, 0], t2: ['loungeSet', 3.1, 2.5, 0] },
    add: [back('bottleShelf', -1.3, 6.21), hang('edisonCluster', -2.6, -3.3), hang('edisonCluster', 0.6, -3.3), hang('bellPendant', -5.4, 2.8), at('loungeSet', -2.3, 4.6, 0), at('loungeSet', 2.0, 4.4, 0), back('ledStrip', 4.6, 6.25, { lc: PINK }), back('ledStrip', -5.6, 6.25, { lc: AMBER }), left('ledStripLow', -2.0, 8.75, { lc: PURPLE }), at('palmPot', 5.0, 3.2)],
    signs: [neonBack('cocktails', PINK, 4.4, 2.3, 6.25, 0.5, 'script'), neonLeft('BAR', AMBER, -3.8, 2.15, 8.75, 0.5)],
  },
  // 🏢 Office (18.75 × 12.5): carpet tiles, panel lights, plants.
  office: {
    scale: 1.25, mood: 'bright',
    rooms: [{ floor: 'carpet:#6f6a63', wall: 'paint:#e6e9ec' }],
    tint: { sofa: { a: '#1f3b4d' } },
    add: [hang('flushLight', -5.5, 0.5), hang('flushLight', -1.5, 0.5), hang('flushLight', 2.5, 0.5), hang('flushLight', -5.5, 4), hang('flushLight', 2.5, 4), at('palmPot', -8.9, 5.6), at('monstera', 8.9, -5.7), left('artTriptych', -1.8, 9.375)],
  },
  // 🎤 Comedy club (17.5 × 12.5): the black brick wall, a real stage, red neon, candles on every table.
  comedy: {
    scale: 1.25, mood: 'bar',
    rooms: [{ floor: 'walnut', wall: 'darkBrick' }, { floor: 'parquet', wall: 'darkBrick' }],
    swap: { counter: ['ledBar', 5.8, 4.5, Math.PI], t1: ['loungeSet', -5.0, 0.5, 0], t2: ['loungeSet', 0, 0.5, 0], t3: ['loungeSet', 5.0, 0.5, 0], t4: ['loungeSet', -2.5, 3.8, 0] },
    add: [at('liveStage', 0, -4.7, 0), at('loungeSet', 1.2, 3.8, 0), at('loungeSet', -6.2, 3.8, 0), hang('spotLight', 0, -4.2, '#fff1d6'), hang('spotLight', -1.2, -4.0, '#fff1d6'), hang('spotLight', 1.2, -4.0, '#fff1d6'), left('ledStripLow', 0, 8.75, { lc: RED }), right('ledStripLow', -1.5, 8.75, { lc: RED })],
    signs: [neonBack('Comedy', RED, 0, 2.3, 6.25, 0.65, 'script'), neonLeft('LIVE TONIGHT', AMBER, -1.5, 2.1, 8.75, 0.32)],
  },

  // 🥪 Deli & grill (19.2 × 14.4)
  deliGrill: {
    scale: 1.2, mood: 'bright',
    rooms: [{ floor: 'tile:#ece6da', wall: 'subway:#f4f4f2' }, { floor: 'rubber', wall: 'subway:#f4f4f2' }],
    add: [hang('flushLight', -4, -2), hang('flushLight', 0, -2), hang('flushLight', -4, 2.5), hang('flushLight', 0, 2.5), hang('flushLight', 5, 2.5), hang('bellPendant', 2.4, -3.5), hang('bellPendant', 4.6, -3.5)],
    signs: [neonBack('DELI', RED, -3.6, 2.25, 7.2, 0.55), neonBack('OPEN 24 HRS', BLUE, -7.0, 2.25, 7.2, 0.32), neonLeft('BACON EGG & CHEESE', AMBER, 0.6, 2.2, 9.6, 0.26)],
  },
  // 🍺 The Stoop (24 × 16.8): two glowing bars, lit bottle walls, lounge tables, a pool room in green and wood.
  stoopBar: {
    scale: 1.2, mood: 'bar', remove: ['neon', 'neon2', 'p1'], notch: [[-12, 6.6, -8.6, 8.4]],
    rooms: [{ floor: 'walnut', wall: 'brick' }, { floor: 'carpet:#2f4f3a', wall: 'woodPanel' }],
    swap: { bar: ['ledBar', -1.2, -3.8, 0], bar2: ['ledBarPlain', 3.3, -3.8, 0], back: ['bottleShelf', -1.2, -8.19, 0], back2: ['bottleShelf', 2.6, -8.19, 0], ht1: ['loungeSet', -6.0, 0.7, 0], ht2: ['loungeSet', -6.0, 4.6, 0], ht3: ['loungeSet', -2.9, 2.6, 0], ht4: ['loungeSet', 2.4, 0.6, 0] },
    add: [hang('edisonCluster', -2.4, -4.0), hang('edisonCluster', 1.6, -4.0), hang('edisonCluster', 4.6, -4.0), hang('bellPendant', 7.7, 1.0), hang('bellPendant', 7.7, 1.9), hang('bellPendant', 7.7, 5.2), hang('bellPendant', 7.7, 6.1), at('loungeSet', -2.6, 6.6, 0), at('loungeSet', 0.9, 6.6, 0), back('ledStrip', -6.6, 8.4, { lc: AMBER }), back('ledStrip', 7.0, 8.4, { lc: PINK }), left('ledStripLow', 0.5, 12, { lc: PURPLE }), at('oliveTree', -7.6, 7.6)],
    screens: [{ x: 11.86, y: 1.9, z: 3.4, rot: -H, w: 3.2, h: 1.8, kind: 'game' }],
    signs: [neonBack('The Stoop', PINK, -8.0, 2.2, 8.4, 0.6, 'script'), neonRight('POOL', CYAN, 7.0, 2.3, 12, 0.45), neonBack('ON TAP', AMBER, 7.0, 2.35, 8.4, 0.35)],
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
  // 🌙 The Velvet Room (24.6 × 17.9): LED dance floor under a lighting rig, a glowing bar, a video wall,
  // a lit VIP deck, lounge tables with candles, neon at the door. Not a rectangle.
  club: {
    scale: 1.12, mood: 'club', remove: ['neon', 'neon2', 'floor1', 'floor2', 'floor3', 'floor4', 'floor5'], notch: [[-12.32, 4.6, -9.2, 8.96]],
    rooms: [{ floor: 'marbleBlack', wall: 'velvet:#4a2470' }, { floor: 'casinoCarpet:#3d1b5d', wall: 'velvet:#6b2a96' }],
    swap: { stage: ['liveStage', 0, -6.9, 0], bar: ['ledBar', -11.2, -0.9, H], ht1: ['loungeSet', -7.6, 4.5, 0], ht2: ['loungeSet', -4.5, 6.6, 0], ht3: ['loungeSet', 4.7, 6.6, 0] },
    add: [at('ledDanceFloor', -2.05, 1.0), at('ledDanceFloor', 2.05, 1.0), hang('trussRing', 0, 1.0), at('vipRiser', 9.8, -4.5, H), at('loungeSet', -1.6, 6.8, 0), at('loungeSet', 1.4, 6.8, 0), left('bottleShelf', -0.9, 12.26), at('neonArch', 0, 8.3), back('ledStrip', -9.5, 8.96, { lc: PINK }), back('ledStrip', 9.5, 8.96, { lc: CYAN }), left('ledStrip', -5.0, 12.32, { lc: PURPLE }), left('ledStrip', 3.0, 12.32, { lc: CYAN }), right('ledStrip', 6.6, 12.32, { lc: PINK }), back('ledStripLow', -6.0, 8.96, { lc: CYAN }), back('ledStripLow', 6.0, 8.96, { lc: PINK }), hang('crystalChandelier', 9.6, -4.5), hang('sputnik', 9.6, 1.6)],
    screens: [{ x: 0, y: 1.75, z: -8.84, rot: 0, w: 7, h: 1.9, kind: 'galaxy' }, { x: 12.2, y: 1.7, z: -4.5, rot: -H, w: 4, h: 1.8, kind: 'waves' }],
    signs: [neonLeft('Velvet', PINK, 1.0, 2.35, 12.32, 0.7, 'script'), neonBack('DANCE', CYAN, -6.0, 2.4, 8.96, 0.45), neonBack('VIP', GOLD, 9.5, 2.45, 8.96, 0.4)],
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
  // 🎧 Basement 212 (19.2 × 14.4): bare concrete and black brick, an LED floor, red and blue everywhere.
  club1: {
    scale: 1.2, mood: 'club', remove: ['neon', 'floor1', 'floor2'], notch: [[-9.6, -7.2, -7.2, -4.4]],
    rooms: [{ floor: 'concrete', wall: 'darkBrick' }],
    swap: { stage: ['liveStage', 0, -5.6, 0], bar: ['ledBar', -8.5, 1.4, H], ht1: ['loungeSet', 6.0, 4.6, 0] },
    add: [at('ledDanceFloor', 0, 1.9), hang('trussRing', 0, 1.9), at('vipRiser', 6.7, -4.6, 0), at('loungeSet', 6.0, 1.2, 0), at('loungeSet', -5.4, 5.6, 0), at('loungeSet', -3.0, 5.4, 0), left('bottleShelf', 1.4, 9.54), at('neonArch', 0, 6.6), back('ledStrip', -4.6, 7.2, { lc: RED }), back('ledStrip', 6.0, 7.2, { lc: BLUE }), left('ledStrip', -2.4, 9.6, { lc: RED }), left('ledStrip', 4.6, 9.6, { lc: BLUE }), right('ledStrip', 1.0, 9.6, { lc: RED })],
    screens: [{ x: 3.6, y: 1.8, z: -7.08, rot: 0, w: 3.4, h: 1.6, kind: 'waves' }],
    signs: [neonBack('212', RED, -3.6, 2.35, 7.2, 0.6), neonRight('basement', BLUE, -3.5, 2.2, 9.6, 0.45, 'script')],
  },
  // 🌆 Skye Rooftop (28.6 × 19.8): a deck under the night sky, a low parapet, an LED floor under a rig, lounges.
  club3: {
    scale: 1.1, mood: 'club', wallHeight: 1.3, remove: ['neon', 'neon2', 'floor1', 'floor2', 'floor3', 'floor4', 'floor5', 'floor6'], notch: [[9.6, 6.6, 14.3, 9.9]],
    rooms: [{ floor: 'walnut', wall: 'concreteWall' }, { floor: 'casinoCarpet:#3a2440', wall: 'concreteWall' }],
    swap: { stage: ['liveStage', 0, -7.7, 0], bar: ['ledBar', -13.2, 0, H], ht1: ['loungeSet', -8.4, 5.7, 0], ht2: ['loungeSet', -4.8, 7.7, 0], ht3: ['loungeSet', 5.1, 7.7, 0] },
    add: [at('ledDanceFloor', -2.05, 0.6), at('ledDanceFloor', 2.05, 0.6), hang('trussRing', 0, 0.6), at('vipRiser', 11.7, -3.5, H), at('loungeSet', -1.6, 7.7, 0), at('loungeSet', 1.7, 7.7, 0), at('neonArch', 0, 9.2), back('ledStripLow', -9, 9.9, { lc: PINK }), back('ledStripLow', -5, 9.9, { lc: CYAN }), back('ledStripLow', 5, 9.9, { lc: PURPLE }), back('ledStripLow', 9, 9.9, { lc: PINK }), left('ledStripLow', -4, 14.3, { lc: CYAN }), left('ledStripLow', 4, 14.3, { lc: PURPLE }), hang('paperLantern', -7, -3), hang('paperLantern', 7, -3), hang('paperLantern', -8, 3.4), at('oliveTree', 8.6, 8.8), at('palmPot', -13.4, -3.4)],
    signs: [neonBack('SKYE', CYAN, 0, 1.05, 9.9, 0.5)],
  },
  // 💎 Aurum (33 × 22): black marble and gold, three LED floors under two rigs, crystal over the VIP decks. A T-shape.
  club4: {
    scale: 1.1, mood: 'casino', remove: ['neon', 'neon2', 'floor1', 'floor2', 'floor3', 'floor4', 'floor5', 'floor6', 'floor7'], notch: [[-16.5, 7.0, -11.5, 11], [11.5, 7.0, 16.5, 11]],
    rooms: [{ floor: 'marbleBlack', wall: 'geo:#1d1f24' }, { floor: 'casinoCarpet:#3d2e12', wall: 'velvet:#3d2e12' }],
    swap: { stage: ['liveStage', 0, -8.6, 0], bar: ['ledBar', -15.4, 1.1, H], ht1: ['loungeSet', -9.9, 6.6, 0], ht2: ['loungeSet', -6.2, 9.0, 0], ht3: ['loungeSet', 6.2, 9.0, 0] },
    add: [at('ledDanceFloor', -4.1, -0.5), at('ledDanceFloor', 0, -0.5), at('ledDanceFloor', 4.1, -0.5), hang('trussRing', -4.1, -0.5), hang('trussRing', 4.1, -0.5), at('vipRiser', 13.9, -6.6, H), at('vipRiser', 13.9, -1.7, H), at('loungeSet', -2.6, 9.2, 0), at('loungeSet', 2.4, 9.2, 0), at('loungeSet', 9.4, 6.4, 0), left('bottleShelf', 1.1, 16.44), at('neonArch', 0, 10.3), hang('crystalChandelier', -10, 3.5), hang('crystalChandelier', 10, 3.5), hang('crystalChandelier', 14, -4.2), back('ledStrip', -12, 11, { lc: GOLD }), back('ledStrip', 12, 11, { lc: GOLD }), left('ledStripLow', -5, 16.5, { lc: GOLD }), at('columnTall', -9.5, 9.6), at('columnTall', 9.5, 9.6)],
    screens: [{ x: 0, y: 1.75, z: -10.88, rot: 0, w: 8, h: 1.9, kind: 'galaxy' }],
    signs: [neonLeft('AURUM', GOLD, -5.0, 2.4, 16.5, 0.6), neonBack('members only', GOLD, -10, 2.35, 11, 0.38, 'script')],
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
  // 🕹️ Pixel Palace (21.6 × 16.8): the cosmic carpet, a marquee video strip over the cabinets, neon, a lit entrance.
  arcade: {
    scale: 1.2, mood: 'arcade', remove: ['neon', 'neon2'], move: { stack1: [-9.7, 5.4] }, notch: [[-10.8, 6.2, -7.6, 8.4]],
    rooms: [{ floor: 'cosmic', wall: 'paint:#140b2e' }, { floor: 'carpet:#2d1b5e', wall: 'paint:#1d1340' }],
    add: [back('ledStripLow', -6.0, 8.4, { lc: PINK }), back('ledStripLow', 2.0, 8.4, { lc: CYAN }), left('ledStrip', -2.0, 10.8, { lc: CYAN }), left('ledStrip', 3.5, 10.8, { lc: PINK }), right('ledStrip', -4.4, 10.8, { lc: GREEN }), hang('ringPendant', -4.4, 1.4, CYAN), hang('ringPendant', 0, 4.4, PINK), hang('ringPendant', 4.4, 1.4, PURPLE), at('neonArch', 0, 7.7), at('beanbag', 5.6, 6.8, 0, { a: '#ff4fb8' }), at('beanbag', 4.2, 7.0, 0, { a: '#22d3ee' }), at('pouf', 6.6, 5.6, 0, { a: '#9b5cff' })],
    screens: [{ x: -1.0, y: 2.5, z: -8.28, rot: 0, w: 18, h: 0.65, kind: 'game' }, { x: 10.68, y: 1.8, z: -3.0, rot: -H, w: 3.2, h: 1.6, kind: 'game' }],
    signs: [neonLeft('ARCADE', CYAN, 0.2, 2.3, 10.8, 0.55), neonRight('PRIZES', GOLD, 3.0, 2.3, 10.8, 0.5), neonLeft('HIGH SCORE', GREEN, -4.6, 2.25, 10.8, 0.32)],
  },
  // 🎰 Empire Casino (24.6 × 17.9): red carpet, damask, crystal, a glowing bar, a jackpot wall.
  casino: {
    scale: 1.12, mood: 'casino', notch: [[-12.32, 6.0, -8.6, 8.96]],
    rooms: [{ floor: 'casinoCarpet', wall: 'damask:#3d0c1e' }, { floor: 'casinoCarpet:#1f3b4d', wall: 'velvet:#3d0c1e' }],
    swap: { bar: ['ledBar', 0.7, 7.3, Math.PI] },
    add: [hang('crystalChandelier', -6, -1), hang('crystalChandelier', 6, 6), hang('crystalChandelier', 6.8, -6.0), hang('tulipChandelier', -6, 5), at('vipRiser', 7.6, -6.4, 0), at('loungeSet', -5.8, 7.0, 0), at('loungeSet', 6.6, 7.0, 0), back('ledStrip', -9.5, 8.96, { lc: GOLD }), back('ledStrip', 9.5, 8.96, { lc: GOLD }), right('ledStripLow', 4.0, 12.32, { lc: RED }), at('columnTall', -1.6, 8.3), at('columnTall', 4.0, 8.3)],
    screens: [{ x: 3.6, y: 1.85, z: -8.84, rot: 0, w: 4.2, h: 1.7, kind: 'game' }],
    signs: [neonBack('JACKPOT', GOLD, 3.6, 2.6, 8.96, 0.4), neonRight('777', RED, 6.2, 2.3, 12.32, 0.6), neonLeft('Empire', PINK, -1, 2.3, 12.32, 0.55, 'script')],
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
  const swapped = new Set(Object.keys(look.swap ?? {}));
  const hw = layout.width / 2, hd = layout.depth / 2;
  const gx = (x: number) => grow(x, hw, s), gz = (z: number) => grow(z, hd, s);
  for (const f of layout.furniture) {
    if (swapped.has(f.uid)) continue;
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
  for (const [uid, [item, x, z, rot]] of Object.entries(look.swap ?? {})) {
    const f = layout.furniture.find((i) => i.uid === uid);
    if (f) Object.assign(f, { item, x, z, rot });
  }
  if (look.notch?.length) {
    // Cut the corners out: rooms become the pieces left over, the outer walls follow (world/footprint.ts).
    const cut = (r: [number, number, number, number], c: [number, number, number, number]): [number, number, number, number][] => {
      if (c[0] >= r[2] || c[2] <= r[0] || c[1] >= r[3] || c[3] <= r[1]) return [r];
      const out: [number, number, number, number][] = [];
      if (c[0] > r[0]) out.push([r[0], r[1], c[0], r[3]]);
      if (c[2] < r[2]) out.push([c[2], r[1], r[2], r[3]]);
      const x0 = Math.max(r[0], c[0]), x1 = Math.min(r[2], c[2]);
      if (c[1] > r[1]) out.push([x0, r[1], x1, c[1]]);
      if (c[3] < r[3]) out.push([x0, c[3], x1, r[3]]);
      return out;
    };
    let rooms = layout.rooms;
    for (const c of look.notch) rooms = rooms.flatMap((r) => cut(r.rect, c).map((rect) => ({ ...r, rect })));
    layout.rooms = rooms;
    layout.shaped = true;
    const inNotch = (x: number, z: number) => look.notch!.some((c) => x > c[0] && x < c[2] && z > c[1] && z < c[3]);
    layout.furniture = layout.furniture.filter((f) => !inNotch(f.x, f.z));
  }
  if (look.screens) layout.screens = look.screens;
  for (const [uid, [x, z]] of Object.entries(look.move ?? {})) {
    const f = layout.furniture.find((i) => i.uid === uid);
    if (f) Object.assign(f, { x, z });
  }
  (look.add ?? []).forEach((a, i) => layout.furniture.push({ uid: `look${i}`, ...a }));
  if (look.signs) layout.signs = look.signs;
}
