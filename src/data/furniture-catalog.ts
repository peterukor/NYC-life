// =====================================================================
// furniture-catalog.ts — the big home catalogue (Peter, 2026-10-27:
// "from furnitures, to bulbs styles to hanging lights to mats and rugs,
// to different colors… you need to wow me").
//
// Every piece here can be bought from the Design menu at home, placed
// anywhere it fits, turned, and recoloured (main colour + frame colour;
// lights also take a bulb colour). Models: the Quaternius house interior
// pack (Capitalised_Names), the Kenney furniture kit (camelCase) and the
// decor built in code (deco…, world/furniture-deco.ts).
//
// Prices are in cents. Pieces that DO something reuse the same actions
// as the starter pieces (a bed sleeps, a sofa sits, a TV plays…).
//
// TO ADD A PIECE: add a line below (its model must exist: run
// scripts/build-interior-assets.mjs for a pack model, or add a deco
// builder). `category` puts it in the buy menu.
// =====================================================================

import type { Category, FurnitureDef, FurniturePart, LightDef } from './furniture.ts';

type Extra = Partial<FurnitureDef>;
const one = (model: string, p: Partial<FurniturePart> = {}): FurniturePart[] => [{ model, ...p }];

/** A piece: id, name, emoji, price (cents), category, parts, then anything else. */
function piece(id: string, name: string, emoji: string, price: number, category: Category, parts: FurniturePart[] | string, extra: Extra = {}): FurnitureDef {
  return { id, name, emoji, price, category, parts: typeof parts === 'string' ? one(parts) : parts, actions: [], ...extra };
}

const SLEEP: Extra = { actions: ['sleep', 'nap'], use: 'lie', kind: 'bed' };
const SOFA: Extra = { actions: ['callMom', 'guitar', 'workout'], use: 'sitOn', seat: true, kind: 'couch' };
const SEAT: Extra = { use: 'sitOn', seat: true, kind: 'chair' };
const WORK = ['codePractice', 'freelance', 'sellOnline', 'postContent', 'doomscroll'];
const L = (kind: LightDef['kind'], y: number, range = 3.5, power = 1, more: Partial<LightDef> = {}): LightDef => ({ kind, y, range, power, ...more });
/** Ceiling height in homes (home-interior.ts WALL_H): hanging pieces hang from here. */
const lamp = (kind: LightDef['kind'], y: number, range?: number, power?: number, more?: Partial<LightDef>): Extra => ({ light: L(kind, y, range, power, more), kind: 'lamp' });

export function CATALOG(cook: string[]): FurnitureDef[] {
  return [
    // ================================================================ beds
    piece('platformSingle', 'Platform single bed', '🛏️', 28_000, 'beds', 'Bed_Single', { ...SLEEP, quality: 'basic', colors: { a: '#5b7f95', b: '#c9a27a' }, pitch: 'Low wooden frame, proper mattress.' }),
    piece('upholsteredKing', 'Upholstered king bed', '🛏️', 140_000, 'beds', 'Bed_King', { ...SLEEP, quality: 'nice', colors: { a: '#c8b8a6', b: '#6f4e37' }, pitch: 'Big enough to starfish. Pick any colour.' }),
    piece('bunkBed', 'Bunk bed', '🛏️', 45_000, 'beds', 'Bed_Bunk', { ...SLEEP, quality: 'basic', colors: { a: '#4f86a6', b: '#9c7a54' } }),
    piece('woodBunk', 'Wooden bunk', '🛏️', 38_000, 'beds', 'bedBunk', { ...SLEEP, quality: 'basic' }),
    piece('cabinBed', 'Cabin bed + drawers', '🛏️', 52_000, 'beds', [{ model: 'bedSingle' }, { model: 'cabinetBedDrawer', x: 0.85, z: -0.85 }], { ...SLEEP, quality: 'basic' }),

    // ================================================================ seating
    piece('sectionalL', 'L-shaped sectional', '🛋️', 220_000, 'seating', 'Couch_L', { ...SOFA, quality: 'nice', colors: { a: '#b9aa98' }, pitch: 'The whole crew fits. Any fabric colour.' }),
    piece('threeSeater', 'Three-seat sofa', '🛋️', 160_000, 'seating', 'Couch_Large1', { ...SOFA, quality: 'nice', colors: { a: '#8c2f39' } }),
    piece('greySofa', 'Classic sofa', '🛋️', 90_000, 'seating', 'Couch_Large2', { ...SOFA, quality: 'basic', colors: { a: '#9a958f' } }),
    piece('loungeSectional', 'Low lounge sectional', '🛋️', 260_000, 'seating', 'Couch_Large3', { ...SOFA, quality: 'nice', colors: { a: '#2f4f3a' } }),
    piece('midCenturySofa', 'Mid-century sofa', '🛋️', 130_000, 'seating', 'Couch_Medium1', { ...SOFA, quality: 'nice', colors: { a: '#1f3b4d' } }),
    piece('retroLoveseat', 'Retro loveseat', '🛋️', 70_000, 'seating', 'Couch_Medium2', { ...SOFA, quality: 'basic', colors: { a: '#e9b44c', b: '#7a5230' } }),
    piece('modernSofa', 'Modern sofa', '🛋️', 80_000, 'seating', 'loungeDesignSofa', { ...SOFA, quality: 'basic' }),
    piece('modernCorner', 'Modern corner sofa', '🛋️', 150_000, 'seating', 'loungeDesignSofaCorner', { ...SOFA, quality: 'nice' }),
    piece('cornerSofa', 'Corner sofa', '🛋️', 90_000, 'seating', 'loungeSofaCorner', { ...SOFA, quality: 'basic' }),
    piece('shellChair', 'Shell armchair', '💺', 45_000, 'seating', 'Couch_Small1', { ...SEAT, colors: { a: '#c8553d' } }),
    piece('clubChair', 'Club armchair', '💺', 38_000, 'seating', 'Couch_Small2', { ...SEAT, colors: { a: '#6e4a33' } }),
    piece('recliner', 'Recliner', '💺', 42_000, 'seating', 'loungeChairRelax', SEAT),
    piece('loungeChairModern', 'Lounge chair', '💺', 35_000, 'seating', 'loungeDesignChair', SEAT),
    piece('ottoman', 'Ottoman', '🟫', 15_000, 'seating', 'loungeSofaOttoman', SEAT),
    piece('beanbag', 'Beanbag', '🫘', 9_000, 'seating', 'decoBeanbag', { ...SEAT, colors: { a: '#e86a5a' } }),
    piece('pouf', 'Velvet pouf', '🟣', 12_000, 'seating', 'decoPouf', { ...SEAT, colors: { a: '#5b2a86', b: '#c9a24a' } }),
    piece('cushionBench', 'Cushioned bench', '🪑', 20_000, 'seating', 'benchCushion', SEAT),
    piece('ladderChair', 'Ladder-back chair', '🪑', 7_000, 'seating', 'Chair_1', { ...SEAT, colors: { b: '#8a5d36' } }),
    piece('diningChair', 'Cushioned dining chair', '🪑', 11_000, 'seating', 'Chair_2', { ...SEAT, colors: { a: '#e8d8c3', b: '#3b2a20' } }),
    piece('spindleChair', 'Spindle chair', '🪑', 11_000, 'seating', 'Chair_3', { ...SEAT, colors: { a: '#e8d8c3', b: '#3b2a20' } }),
    piece('slatChair', 'Slat chair', '🪑', 8_000, 'seating', 'Chair_4', { ...SEAT, colors: { b: '#b4824f' } }),
    piece('modernChair', 'Modern chair', '🪑', 9_000, 'seating', 'chairModernCushion', SEAT),
    piece('roundChair', 'Café chair', '🪑', 8_000, 'seating', 'chairRounded', SEAT),
    piece('barStool', 'Bar stool', '🪑', 6_000, 'seating', 'Stool', { ...SEAT, colors: { a: '#1d1f24', b: '#c9a24a' } }),
    piece('squareStool', 'Square stool', '🪑', 6_000, 'seating', 'stoolBarSquare', SEAT),

    // ================================================================ tables & dressers
    piece('ovalDining', 'Oval dining table', '🍽️', 65_000, 'tables', 'Table_RoundLarge', { colors: { b: '#6e4a33' } }),
    piece('pedestalTable', 'Pedestal table', '🍽️', 30_000, 'tables', 'Table_RoundSmall', { colors: { b: '#8a5d36' } }),
    piece('clawTable', 'Claw-foot table', '🍽️', 42_000, 'tables', 'Table_RoundSmall2', { colors: { b: '#3b2a20' } }),
    piece('glassDining', 'Glass dining table', '🍽️', 52_000, 'tables', 'tableGlass'),
    piece('farmTable', 'Farmhouse table', '🍽️', 38_000, 'tables', 'tableCross'),
    piece('clothTable', 'Table with a cloth', '🍽️', 35_000, 'tables', 'tableCrossCloth'),
    piece('squareCoffee', 'Square coffee table', '☕', 16_000, 'tables', 'tableCoffeeSquare'),
    piece('glassCoffeeSquare', 'Glass coffee table', '☕', 24_000, 'tables', 'tableCoffeeGlassSquare'),
    piece('consoleTable', 'Console table', '🪑', 22_000, 'tables', 'sideTableDrawers'),
    piece('cornerDesk', 'Corner desk setup', '🖥️', 85_000, 'tables', [{ model: 'deskCorner' }, { model: 'computerScreen', x: -0.45, y: 0.77, z: -0.6 }, { model: 'computerKeyboard', x: -0.45, y: 0.77, z: -0.3 }, { model: 'chairDesk', x: -0.4, z: 0.25, rot: Math.PI }], { actions: WORK, use: 'sitAt', quality: 'nice' }),
    piece('nightstandWood', 'Wooden nightstand', '🗄️', 9_000, 'tables', 'NightStand_1', { colors: { b: '#8a5d36' } }),
    piece('nightstandOpen', 'Open nightstand', '🗄️', 9_000, 'tables', 'NightStand_2', { colors: { b: '#c9a27a' } }),
    piece('nightstandTwo', 'Two-drawer nightstand', '🗄️', 12_000, 'tables', 'NightStand_3', { colors: { b: '#3b2a20' } }),
    piece('sideboard', 'Sideboard', '🗄️', 48_000, 'storage', 'Drawer_1', { colors: { b: '#8a5d36' } }),
    piece('mediaConsole', 'Low media console', '🗄️', 52_000, 'storage', 'Drawer_2', { colors: { b: '#6e4a33' } }),
    piece('wideDresser', 'Wide dresser', '🗄️', 42_000, 'storage', 'Drawer_3', { colors: { b: '#b4824f' } }),
    piece('midDresser', 'Mid-century dresser', '🗄️', 56_000, 'storage', 'Drawer_4', { colors: { b: '#a97947' } }),
    piece('drawerChest', 'Chest of drawers', '🗄️', 36_000, 'storage', 'Drawer_5', { colors: { b: '#7f552f' } }),

    // ================================================================ storage
    piece('whiteBookshelf', 'Tall bookshelf', '📚', 18_000, 'storage', [{ model: 'Bookshelf' }, { model: 'books', x: -0.2, y: 1.06 }, { model: 'books', x: 0.15, y: 0.62 }], { kind: 'shelf' }),
    piece('narrowShelf', 'Narrow shelf', '📚', 9_000, 'storage', 'Shelf_1'),
    piece('ladderShelf', 'Shelf tower', '📚', 12_000, 'storage', 'Shelf_2'),
    piece('wallUnit', 'Wall unit', '📚', 38_000, 'storage', 'Shelf_Large'),
    piece('lowShelf', 'Low shelf', '📚', 7_000, 'storage', 'Shelf_Small1'),
    piece('cubbyShelf', 'Cubby shelf', '📚', 8_000, 'storage', 'Shelf_Small2'),
    piece('benchShelf', 'Bench shelf', '📚', 7_000, 'storage', 'Shelf_Small3'),
    piece('doorCabinet', 'Cabinet', '🗄️', 26_000, 'storage', 'bookcaseClosedDoors'),
    piece('lowBookcase', 'Low bookcase', '📚', 12_000, 'storage', 'bookcaseOpenLow'),
    piece('coatHooks', 'Coat hooks', '🧥', 5_000, 'storage', one('coatRack', { y: 1.4 }), { wall: true }),
    piece('boxes', 'Cardboard boxes', '📦', 1_000, 'storage', [{ model: 'cardboardBoxClosed' }, { model: 'cardboardBoxOpen', x: 0.6, rot: 0.3 }]),

    // ================================================================ lights
    // Ceiling
    piece('domePendant', 'Dome pendant', '💡', 9_000, 'lights', 'Light_Ceiling1', { hang: true, ...lamp('ceiling', -0.38) }),
    piece('globePendantGrey', 'Opal pendant', '💡', 9_000, 'lights', 'Light_Ceiling2', { hang: true, ...lamp('ceiling', -0.45) }),
    piece('cupCluster', 'Five-cup cluster', '💡', 26_000, 'lights', 'Light_Ceiling3', { hang: true, ...lamp('ceiling', -0.3, 4.2, 1.2) }),
    piece('tripleCups', 'Triple cup pendant', '💡', 20_000, 'lights', 'Light_Ceiling4', { hang: true, ...lamp('ceiling', -0.55, 4, 1.1) }),
    piece('flushLight', 'Flush ceiling light', '💡', 6_000, 'lights', 'Light_Ceiling5', { hang: true, ...lamp('ceiling', -0.06, 4.2, 1) }),
    piece('flushLight2', 'Drum ceiling light', '💡', 7_000, 'lights', 'Light_Ceiling6', { hang: true, ...lamp('ceiling', -0.06, 4.2, 1) }),
    piece('bellPendant', 'Bell pendant', '💡', 7_000, 'lights', 'Light_CeilingSingle', { hang: true, ...lamp('ceiling', -0.22, 3, 0.8) }),
    piece('tulipChandelier', 'Tulip chandelier', '🕯️', 42_000, 'lights', 'Light_Chandelier', { hang: true, quality: 'nice', ...lamp('ceiling', -0.2, 4.6, 1.3) }),
    piece('cubeLantern', 'Cube lantern', '🏮', 14_000, 'lights', 'Light_Cube', { hang: true, ...lamp('ceiling', -0.35) }),
    piece('wireCube', 'Wire cube pendant', '💡', 16_000, 'lights', 'Light_Cube2', { hang: true, ...lamp('ceiling', -0.35) }),
    piece('geoPendant', 'Geo pendant', '💎', 18_000, 'lights', 'Light_Icosahedron', { hang: true, ...lamp('ceiling', -0.35) }),
    piece('geoTrio', 'Geo pendant trio', '💎', 48_000, 'lights', 'Light_Icosahedron2', { hang: true, quality: 'nice', ...lamp('ceiling', -0.35, 4.6, 1.3) }),
    piece('spotLight', 'Spotlight', '🔦', 4_000, 'lights', 'Light_Small', { hang: true, ...lamp('ceiling', -0.05, 2.4, 0.7) }),
    piece('ceilingFan', 'Ceiling fan', '🌀', 18_000, 'lights', 'ceilingFan', { hang: true, ...lamp('ceiling', -0.2, 3.6, 0.9) }),
    piece('squarePendant', 'Square pendant', '💡', 9_000, 'lights', 'lampSquareCeiling', { hang: true, ...lamp('ceiling', -0.35) }),
    piece('glassGlobe', 'Glass globe pendant', '🔮', 15_000, 'lights', 'decoGlobePendant', { hang: true, colors: { b: '#c9a24a' }, ...lamp('ceiling', -0.9) }),
    piece('edisonCluster', 'Edison bulb cluster', '💡', 21_000, 'lights', 'decoBulbCluster', { hang: true, colors: { b: '#1d1f24' }, ...lamp('ceiling', -0.8, 4, 1.1, { color: '#ffb766' }) }),
    piece('crystalChandelier', 'Crystal chandelier', '💎', 280_000, 'lights', 'decoCrystalChandelier', { hang: true, quality: 'luxury', colors: { b: '#c9a24a' }, ...lamp('ceiling', -0.65, 5.5, 1.6) }),
    piece('sputnik', 'Sputnik chandelier', '✴️', 90_000, 'lights', 'decoSputnik', { hang: true, quality: 'nice', colors: { b: '#c9a24a' }, ...lamp('ceiling', -0.55, 5, 1.4) }),
    piece('ringPendant', 'LED ring pendant', '⭕', 52_000, 'lights', 'decoRingPendant', { hang: true, quality: 'nice', colors: { b: '#1d1f24' }, ...lamp('ceiling', -0.85, 4.6, 1.3, { colorful: true }) }),
    piece('paperLantern', 'Paper lantern', '🏮', 4_500, 'lights', 'decoPaperLantern', { hang: true, ...lamp('ceiling', -0.9, 3.4, 0.9) }),
    // Floor lamps
    piece('slimFloorLamp', 'Slim floor lamp', '💡', 8_000, 'lights', 'Light_Floor1', lamp('floor', 1.5, 3, 0.8)),
    piece('drumFloorLamp', 'Drum floor lamp', '💡', 12_000, 'lights', 'Light_Stand1', lamp('floor', 1.5, 3.2, 0.9)),
    piece('drumFloorLamp2', 'Tall shade floor lamp', '💡', 12_000, 'lights', 'Light_Stand2', lamp('floor', 1.5, 3.2, 0.9)),
    piece('squareFloorLamp', 'Square floor lamp', '💡', 11_000, 'lights', 'lampSquareFloor', lamp('floor', 1.6, 3, 0.8)),
    piece('arcLamp', 'Arc floor lamp', '🌙', 65_000, 'lights', 'decoArcLamp', { quality: 'nice', colors: { b: '#c9a24a' }, ...lamp('floor', 1.55, 3.6, 1.1) }),
    piece('tripodLamp', 'Tripod floor lamp', '💡', 28_000, 'lights', 'decoTripodLamp', { colors: { b: '#8a5d36' }, ...lamp('floor', 1.35, 3.4, 1) }),
    // Table lamps (sit on tables, shelves, nightstands)
    piece('ceramicLamp', 'Ceramic table lamp', '💡', 7_000, 'lights', 'Light_Floor2', { deco: true, ...lamp('table', 0.6, 2.2, 0.7) }),
    piece('tallTableLamp', 'Tall table lamp', '💡', 7_500, 'lights', 'Light_Floor3', { deco: true, ...lamp('table', 0.7, 2.2, 0.7) }),
    piece('urnLamp', 'Urn table lamp', '💡', 8_000, 'lights', 'Light_Floor4', { deco: true, ...lamp('table', 0.6, 2.2, 0.7) }),
    piece('deskLamp', 'Desk lamp', '💡', 4_500, 'lights', 'Light_Desk', { deco: true, colors: { b: '#1d1f24' }, ...lamp('table', 0.4, 1.6, 0.6) }),
    piece('roundTableLamp', 'Round table lamp', '💡', 5_500, 'lights', 'lampRoundTable', { deco: true, ...lamp('table', 0.5, 2, 0.6) }),
    piece('squareTableLamp', 'Square table lamp', '💡', 5_500, 'lights', 'lampSquareTable', { deco: true, ...lamp('table', 0.45, 2, 0.6) }),
    piece('mushroomLamp', 'Mushroom lamp', '🍄', 16_000, 'lights', 'decoMushroomLamp', { deco: true, colors: { a: '#f6d58e' }, ...lamp('table', 0.3, 2, 0.7) }),
    piece('lavaLamp', 'Lava lamp', '🫧', 4_500, 'lights', 'decoLavaLamp', { deco: true, ...lamp('table', 0.25, 1.6, 0.6, { color: '#ff5fa2', colorful: true }) }),
    piece('candles', 'Candles', '🕯️', 2_500, 'lights', 'decoCandles', { deco: true, colors: { b: '#c9a24a' }, ...lamp('fire', 0.15, 1.4, 0.5, { color: '#ffb766' }) }),
    // Wall lights
    piece('sconce', 'Brass sconce', '🕯️', 9_000, 'lights', one('decoSconce', { y: 1.6 }), { wall: true, colors: { b: '#c9a24a' }, ...lamp('wall', 1.75, 2.4, 0.7) }),
    piece('wallLamp', 'Wall lamp', '💡', 7_000, 'lights', one('lampWall', { y: 1.6 }), { wall: true, ...lamp('wall', 1.7, 2.4, 0.7) }),
    piece('ledStrip', 'LED strip', '🌈', 6_000, 'lights', one('decoLedStrip', { y: 2.55 }), { wall: true, ...lamp('strip', 2.56, 2.6, 1.2, { color: '#9b5cff', colorful: true }), pitch: 'Any colour. Washes the wall in light after dark.' }),
    piece('ledStripLow', 'LED strip (low)', '🌈', 6_000, 'lights', one('decoLedStrip', { y: 0.12 }), { wall: true, ...lamp('strip', 0.13, 2.2, 1, { color: '#3d8bff', colorful: true }) }),
    piece('fairyLights', 'Fairy lights', '✨', 3_500, 'lights', one('decoFairyLights', { y: 1.9 }), { wall: true, ...lamp('strip', 2.1, 2.4, 0.8, { color: '#ffd29a', colorful: true }) }),
    piece('neonHeart', 'Neon heart', '💗', 22_000, 'lights', one('decoNeonHeart', { y: 1.5 }), { wall: true, ...lamp('strip', 1.75, 2.4, 1.1, { color: '#ff5fa2', colorful: true }) }),
    piece('neonBolt', 'Neon bolt', '⚡', 22_000, 'lights', one('decoNeonBolt', { y: 1.4 }), { wall: true, ...lamp('strip', 1.75, 2.4, 1.1, { color: '#3d8bff', colorful: true }) }),
    piece('neonNyc', 'Neon NYC sign', '🗽', 38_000, 'lights', one('decoNeonNyc', { y: 1.55 }), { wall: true, ...lamp('strip', 1.8, 2.8, 1.2, { color: '#22d3c5', colorful: true }) }),
    // Venues (2026-10-27): the party pieces. Some also sell at home (an LED floor in your living room, why not).
    piece('ledDanceFloor', 'LED dance floor', '🪩', 450_000, 'decor', 'decoLedFloor', { flat: true, pulse: 'disco', actions: ['dancefloor'], light: L('floor', 0.3, 5.5, 1.6, { color: '#ff4fd8', colorful: true }), pitch: 'Every tile lights up on the beat.' }),
    piece('ledBar', 'Bar', '🍸', 0, 'decor', [{ model: 'decoLedBar' }, { model: 'stoolBar', x: -1.6, z: 0.75 }, { model: 'stoolBar', x: -0.5, z: 0.75 }, { model: 'stoolBar', x: 0.6, z: 0.75 }, { model: 'stoolBar', x: 1.7, z: 0.75 }], { pulse: 'breathe', placeActions: true, fixed: true, colors: { a: '#1d1f24', b: '#efe9dd' } }),
    piece('ledBarPlain', 'Bar', '🍸', 0, 'decor', [{ model: 'decoLedBar' }, { model: 'stoolBar', x: -1.6, z: 0.75 }, { model: 'stoolBar', x: -0.5, z: 0.75 }, { model: 'stoolBar', x: 0.6, z: 0.75 }, { model: 'stoolBar', x: 1.7, z: 0.75 }], { pulse: 'breathe', actions: ['happyHour', 'dateHere'], fixed: true, colors: { a: '#1d1f24', b: '#efe9dd' } }),
    piece('bottleShelf', 'Back bar', '🍾', 0, 'decor', one('decoBottleShelf', { y: 0.9 }), { wall: true, fixed: true, pulse: 'steady', colors: { b: '#c9a24a' } }),
    piece('trussRing', 'Light rig', '💡', 0, 'lights', 'decoTrussRing', { hang: true, fixed: true, pulse: 'chase', light: L('ceiling', -1.3, 6, 1.5, { color: '#7a5cff', colorful: true }) }),
    piece('vipRiser', 'VIP deck', '💎', 0, 'decor', 'decoVipRiser', { flat: true, fixed: true, pulse: 'breathe', light: L('floor', 0.2, 4, 1.0, { color: '#3d8bff', colorful: true }) }),
    piece('loungeSet', 'Lounge table', '🥂', 0, 'decor', 'decoLoungeSet', { fixed: true, actions: ['happyHour', 'dateHere'], colors: { a: '#8c2f39', b: '#efe9dd' }, light: L('fire', 0.9, 1.2, 0.35, { color: '#ffb766' }) }),
    piece('liveStage', 'The stage', '🎤', 0, 'decor', 'decoLiveStage', { fixed: true, placeActions: true, colors: { b: '#2b2d33' } }),
    piece('neonArch', 'Entrance', '✨', 0, 'decor', 'decoNeonArch', { fixed: true, flat: true, pulse: 'breathe' }),
    // Two-floor homes (Peter, 2026-10-27): tap the stairs to go up or down.
    piece('stairsUp', 'Grand staircase', '🪜', 0, 'decor', 'decoStairsUp', { fixed: true, opens: 'stairs', colors: { a: '#e9dcc4', b: '#1d1e22' } }),
    piece('stairsDown', 'Stairs down', '🪜', 0, 'decor', 'decoStairsDown', { fixed: true, opens: 'stairs', colors: { a: '#e9dcc4', b: '#1d1e22' } }),
    // Lagos Life staples (Peter, 2026-10-27).
    piece('splitAC', 'Split AC', '❄️', 45_000, 'tech', one('decoSplitAC', { y: 2.2 }), { wall: true, colors: { b: '#f4f4f2' }, pitch: 'Cold air, quiet hum. Every room needs one.' }),
    piece('ringLight', 'Ring light', '💡', 9_000, 'lights', 'decoRingLight', { ...lamp('floor', 1.78, 2.2, 0.6, { color: '#fff1d6' }), actions: ['postContent'], pitch: 'Your angles, sorted.' }),
    piece('standFan', 'Standing fan', '🌀', 6_000, 'tech', 'decoStandFan', { colors: { a: '#4f86c6' }, pitch: 'For when NEPA takes the AC.' }),
    piece('waterDispenser', 'Water dispenser', '💧', 12_000, 'kitchen', 'decoWaterDispenser', { colors: { a: '#3d8bff' } }),
    piece('throne', 'Velvet throne', '👑', 380_000, 'seating', 'decoThrone', { ...SEAT, quality: 'luxury', colors: { a: '#8c1c2c', b: '#c9a24a' }, pitch: 'Main character energy, in chair form.' }),
    piece('canopyBed', 'Four-poster bed', '🛏️', 420_000, 'beds', 'decoCanopyBed', { ...SLEEP, quality: 'luxury', colors: { a: '#5b2a86', b: '#1d1e22' }, pitch: 'A bed with a roof. Royalty sleeps here.' }),
    piece('glassPanel', 'Glass partition', '🪟', 30_000, 'decor', 'decoGlassPanel', { colors: { b: '#1d1e22' }, pitch: 'Split a room without hiding it.' }),
    piece('borderRug', 'Bordered rug', '🟥', 28_000, 'rugs', 'decoBorderRug', { flat: true, colors: { a: '#a3202c', b: '#d4a84b' } }),
    piece('popArt', 'Pop-art poster', '🖼️', 7_000, 'decor', one('decoPopArt', { y: 1.35 }), { wall: true, colors: { a: '#f2c12e', b: '#f2c12e' } }),
    piece('wallClock', 'Wall clock', '🕰️', 5_000, 'decor', one('decoClock', { y: 1.9 }), { wall: true, colors: { b: '#1d1e22' } }),
    piece('pool', 'Indoor pool', '🏊', 850_000, 'decor', 'decoPool', { quality: 'luxury', colors: { b: '#e9e2d4' }, ...lamp('fire', 0.1, 5, 0.9, { color: '#5fd4ff' }), pitch: 'Lit from below. Very Billionaires’ Row.' }),
    piece('lounger', 'Sun lounger', '🏖️', 18_000, 'seating', 'decoLounger', { ...SEAT, colors: { a: '#f4efe6', b: '#3b2a20' } }),
    piece('fireplace', 'Stone fireplace', '🔥', 240_000, 'decor', [{ model: 'Fireplace' }, { model: 'decoFire', y: 0.08, z: 0.05 }], { quality: 'luxury', colors: { b: '#e9e2d4' }, ...lamp('fire', 0.4, 3.6, 1.2, { color: '#ff9a3c' }), pitch: 'A real fire. Cosy on a cold night.' }),

    // ================================================================ rugs
    piece('fringedRug', 'Fringed rug', '🧶', 12_000, 'rugs', 'Carpet_1', { flat: true, kind: 'rug', colors: { a: '#c47f2c' } }),
    piece('squareFringed', 'Square fringed rug', '🧶', 16_000, 'rugs', 'Carpet_2', { flat: true, kind: 'rug', colors: { a: '#8c2f39' } }),
    piece('roundFringed', 'Round fringed rug', '⭕', 14_000, 'rugs', 'Carpet_Round', { flat: true, kind: 'rug', colors: { a: '#4f86a6' } }),
    piece('ovalRug', 'Oval rug', '🧶', 11_000, 'rugs', 'rugRounded', { flat: true, kind: 'rug' }),
    piece('squareRug', 'Square rug', '🟥', 13_000, 'rugs', 'rugSquare', { flat: true, kind: 'rug' }),
    piece('doormat', 'Doormat', '🟫', 2_500, 'rugs', 'rugDoormat', { flat: true, kind: 'rug' }),
    piece('shagRug', 'Shaggy round rug', '☁️', 18_000, 'rugs', 'decoRugShag', { flat: true, kind: 'rug', colors: { a: '#f4efe6' } }),
    piece('persianRug', 'Persian rug', '🧿', 65_000, 'rugs', 'decoRugPersian', { flat: true, kind: 'rug', quality: 'nice', colors: { a: '#8c2f39', b: '#1f3b4d' } }),
    piece('runnerRug', 'Striped runner', '🧶', 9_000, 'rugs', 'decoRugRunner', { flat: true, kind: 'rug', colors: { a: '#1f3b4d' } }),
    piece('hideRug', 'Spotted hide rug', '🐄', 34_000, 'rugs', 'decoRugHide', { flat: true, kind: 'rug', colors: { a: '#3b2a20' } }),

    // ================================================================ plants
    piece('monstera', 'Monstera', '🪴', 6_000, 'plants', 'Houseplant_1', { kind: 'plant' }),
    piece('cactusSmall', 'Little cactus', '🌵', 1_500, 'plants', 'Houseplant_2', { deco: true }),
    piece('cactusTall', 'Barrel cactus', '🌵', 2_500, 'plants', 'Houseplant_3', { deco: true }),
    piece('snakePlant', 'Snake plant', '🪴', 3_000, 'plants', 'Houseplant_4', { deco: true }),
    piece('fernPot', 'Fern', '🌿', 3_500, 'plants', 'Houseplant_5', { deco: true }),
    piece('palmPot', 'Palm in a grey pot', '🌴', 9_000, 'plants', 'Houseplant_6', { kind: 'plant' }),
    piece('monsteraLow', 'Spreading monstera', '🪴', 7_000, 'plants', 'Houseplant_7', { kind: 'plant' }),
    piece('driedBranches', 'Dried branches', '🌾', 4_000, 'plants', 'Houseplant_8', { deco: true }),
    piece('succulent', 'Succulent', '🌱', 1_500, 'plants', 'plantSmall1', { deco: true }),
    piece('succulent2', 'Round succulent', '🌱', 1_500, 'plants', 'plantSmall2', { deco: true }),
    piece('succulent3', 'Tall succulent', '🌱', 1_500, 'plants', 'plantSmall3', { deco: true }),
    piece('oliveTree', 'Olive tree', '🫒', 26_000, 'plants', 'decoOliveTree', { kind: 'plant', quality: 'nice', colors: { a: '#cfc6b8' } }),
    piece('hangingPlant', 'Hanging plant', '🌿', 6_000, 'plants', 'decoHangingPlant', { hang: true, colors: { a: '#e9e6e0' } }),
    piece('pampas', 'Pampas vase', '🌾', 9_000, 'plants', 'decoPampasVase', { colors: { a: '#e9e2d4' } }),

    // ================================================================ decor
    piece('artShapes', 'Abstract canvas', '🎨', 30_000, 'decor', one('decoArtShapes', { y: 0.9 }), { wall: true, colors: { a: '#c8553d', b: '#1d1f24' } }),
    piece('artTriptych', 'Colour-field triptych', '🖼️', 45_000, 'decor', one('decoArtTriptych', { y: 1.15 }), { wall: true, colors: { a: '#4f86a6', b: '#e8d8c3' } }),
    piece('artSkyline', 'Skyline print', '🌆', 22_000, 'decor', one('decoArtSkyline', { y: 1.15 }), { wall: true, colors: { a: '#e7a8a0', b: '#1d1f24' } }),
    piece('galleryWall', 'Gallery wall', '🖼️', 38_000, 'decor', one('decoGallery', { y: 1.0 }), { wall: true, colors: { b: '#1d1f24' } }),
    piece('mirrorRound', 'Round mirror', '🪞', 16_000, 'decor', one('decoMirrorRound', { y: 1.1 }), { wall: true, colors: { b: '#c9a24a' } }),
    piece('mirrorArch', 'Arched mirror', '🪞', 34_000, 'decor', one('decoMirrorArch', { y: 0.35 }), { wall: true, colors: { b: '#1d1f24' } }),
    piece('wallShelf', 'Floating shelf', '📚', 12_000, 'decor', one('decoWallShelf', { y: 1.45 }), { wall: true, colors: { a: '#e8d8c3', b: '#b4824f' } }),
    piece('curtainsDouble', 'Curtains', '🪟', 14_000, 'decor', 'Curtains_Double', { wall: true, colors: { a: '#e8d8c3' } }),
    piece('curtainsSingle', 'Curtain panel', '🪟', 8_000, 'decor', 'Curtains_Single', { wall: true, colors: { a: '#e8d8c3' } }),
    piece('columnShort', 'Plinth', '🏛️', 30_000, 'decor', 'Column_Round1', { colors: { b: '#efe9dd' } }),
    piece('columnRound', 'Column', '🏛️', 50_000, 'decor', 'Column_Round2', { colors: { b: '#efe9dd' } }),
    piece('columnTall', 'Tall column', '🏛️', 60_000, 'decor', 'Column_Round3', { colors: { b: '#efe9dd' } }),
    piece('pedestal', 'Square pedestal', '🏛️', 25_000, 'decor', 'Column_SquareSmall', { colors: { b: '#efe9dd' } }),
    piece('pillar', 'Square pillar', '🏛️', 40_000, 'decor', 'Column_SquareBig', { colors: { b: '#efe9dd' } }),
    piece('flowerVase', 'Vase of flowers', '💐', 4_500, 'decor', 'decoFlowers', { deco: true, colors: { a: '#4f86a6' } }),
    piece('bookStack', 'Coffee-table books', '📚', 3_500, 'decor', 'decoBookStack', { deco: true, colors: { a: '#c9a24a' } }),
    piece('books', 'Books', '📕', 2_000, 'decor', 'books', { deco: true }),
    piece('teddy', 'Teddy bear', '🧸', 3_000, 'decor', 'bear', { deco: true }),
    piece('recordPlayer', 'Record player', '🎶', 32_000, 'decor', 'decoRecordPlayer', { colors: { b: '#8a5d36' } }),
    piece('radio', 'Radio', '📻', 6_000, 'decor', 'radio', { deco: true }),
    piece('trashTall', 'Pedal bin', '🗑️', 3_000, 'decor', 'Trashcan_Cylindric'),
    piece('trashGreen', 'Wheelie bin', '🗑️', 4_000, 'decor', 'Trashcan_Green'),
    piece('trashSmall', 'Waste basket', '🗑️', 1_500, 'decor', 'Trashcan_Small1'),

    // ================================================================ TV & tech
    piece('wallTv', 'Wall-mounted TV', '📺', 120_000, 'tech', one('decoTvWall', { y: 1.0 }), { wall: true, actions: ['watchTv', 'gameConsole'], tv: true, screen: [1.5, 0.84, 0, 1.46, 0.03], kind: 'tv', quality: 'nice', pitch: 'Big screen, no cabinet: hang it anywhere.' }),
    piece('tvConsole', 'TV + console', '📺', 70_000, 'tech', [{ model: 'cabinetTelevisionDoors' }, { model: 'televisionModern', y: 0.62 }], { actions: ['watchTv', 'gameConsole'], tv: true, kind: 'tv', quality: 'nice' }),
    piece('retroTv', 'Retro TV', '📺', 18_000, 'tech', [{ model: 'televisionVintage' }, { model: 'televisionAntenna', y: 0.54 }], { actions: ['watchTv'], tv: true, screen: [0.5, 0.34, -0.05, 0.3, 0.29], kind: 'tv', quality: 'basic' }),
    piece('speakerSmall', 'Bookshelf speaker', '🔊', 9_000, 'tech', 'speakerSmall', { deco: true }),
    piece('laptopDeco', 'Laptop', '💻', 60_000, 'tech', 'laptop', { deco: true }),

    // ================================================================ kitchen
    piece('retroFridge', 'Retro fridge', '🧊', 90_000, 'kitchen', 'Kitchen_Fridge', { actions: ['snack'], opens: 'fridge' }),
    piece('doubleFridge', 'Double-door fridge', '🧊', 220_000, 'kitchen', 'kitchenFridgeLarge', { actions: ['snack'], opens: 'fridge', quality: 'nice' }),
    piece('rangeOven', 'Range oven', '🍳', 80_000, 'kitchen', 'Kitchen_Oven', { actions: cook, opens: 'stove', colors: { a: '#5b7f6a' } }),
    piece('proRange', 'Pro range', '🍳', 160_000, 'kitchen', 'Kitchen_Oven_Large', { actions: cook, opens: 'stove', quality: 'nice' }),
    piece('electricHob', 'Electric stove', '🍳', 65_000, 'kitchen', 'kitchenStoveElectric', { actions: cook, opens: 'stove' }),
    piece('cabinetDrawers', 'Drawer cabinet', '🗄️', 18_000, 'kitchen', 'Kitchen_3Drawers', { colors: { a: '#5b7f6a' } }),
    piece('cabinetDoor', 'Kitchen cabinet', '🗄️', 15_000, 'kitchen', 'Kitchen_Cabinet1', { colors: { a: '#5b7f6a' } }),
    piece('cabinetMixed', 'Cabinet + drawer', '🗄️', 16_000, 'kitchen', 'Kitchen_1Drawers', { colors: { a: '#5b7f6a' } }),
    piece('cabinetTwo', 'Two-drawer cabinet', '🗄️', 17_000, 'kitchen', 'Kitchen_2Drawers', { colors: { a: '#5b7f6a' } }),
    piece('sinkCabinet', 'Sink cabinet', '🚰', 25_000, 'kitchen', 'Kitchen_Sink', { colors: { a: '#5b7f6a' } }),
    piece('upperCabinet', 'Wall cupboard', '🗄️', 14_000, 'kitchen', one('kitchenCabinetUpper', { y: 1.45 }), { wall: true }),
    piece('upperDouble', 'Double wall cupboard', '🗄️', 22_000, 'kitchen', one('kitchenCabinetUpperDouble', { y: 1.45 }), { wall: true }),
    piece('rangeHood', 'Range hood', '💨', 30_000, 'kitchen', one('hoodModern', { y: 1.4 }), { wall: true }),
    piece('island', 'Kitchen island', '🍽️', 60_000, 'kitchen', [{ model: 'kitchenBar', x: -0.43 }, { model: 'kitchenBar', x: 0.43 }, { model: 'kitchenBarEnd', x: 0.96 }, { model: 'stoolBarSquare', x: -0.4, z: 0.55 }, { model: 'stoolBarSquare', x: 0.4, z: 0.55 }]),
    piece('microwave', 'Microwave', '📦', 9_000, 'kitchen', 'kitchenMicrowave', { deco: true, actions: ['snack'] }),
    piece('coffeeMaker', 'Coffee machine', '☕', 12_000, 'kitchen', 'kitchenCoffeeMachine', { deco: true }),
    piece('blender', 'Blender', '🥤', 4_000, 'kitchen', 'kitchenBlender', { deco: true }),
    piece('toaster', 'Toaster', '🍞', 3_000, 'kitchen', 'toaster', { deco: true }),

    // ================================================================ bathroom
    piece('freestandingTub', 'Freestanding tub', '🛁', 180_000, 'bath', 'Bathroom_Bathtub', { actions: ['soak', 'shower'], use: 'stepIn', quality: 'nice' }),
    piece('rainShower', 'Rain shower', '🚿', 90_000, 'bath', 'Bathroom_Shower1', { actions: ['shower'], use: 'stepIn', quality: 'nice', colors: { a: '#e8d8c3' } }),
    piece('roundShower', 'Corner shower', '🚿', 80_000, 'bath', 'showerRound', { actions: ['shower'], use: 'stepIn' }),
    piece('toiletClassic', 'Toilet', '🚽', 25_000, 'bath', 'Bathroom_Toilet', { actions: ['toilet'], use: 'sitOn' }),
    piece('toiletWall', 'Wall-hung toilet', '🚽', 40_000, 'bath', 'Bathroom_Toilet2', { actions: ['toilet'], use: 'sitOn', quality: 'nice' }),
    piece('basin', 'Basin', '🪥', 18_000, 'bath', 'Bathroom_Sink'),
    piece('vanity', 'Vanity', '🪥', 42_000, 'bath', [{ model: 'bathroomCabinetDrawer' }, { model: 'Bathroom_Mirror1', y: 1.25, z: -0.2 }]),
    piece('frontLoader', 'Front-loader washer', '🧺', 65_000, 'bath', 'Bathroom_WashingMachine', { actions: ['laundry'] }),
    piece('washerStack', 'Washer-dryer stack', '🧺', 110_000, 'bath', 'washerDryerStacked', { actions: ['laundry'], quality: 'nice' }),
    piece('bathMirror', 'Bathroom mirror', '🪞', 6_000, 'bath', one('Bathroom_Mirror1', { y: 1.3 }), { wall: true }),
    piece('ovalMirror', 'Oval mirror', '🪞', 8_000, 'bath', one('Bathroom_Mirror2', { y: 1.35 }), { wall: true }),
    piece('towelRail', 'Towel rail', '🧻', 3_000, 'bath', one('Bathroom_Towel', { y: 1.0 }), { wall: true, colors: { a: '#ffffff' } }),
    piece('toiletRolls', 'Toilet rolls', '🧻', 800, 'bath', 'Bathroom_ToiletPaperPile', { deco: true }),
  ];
}

/** Starter pieces from before the catalogue: their buy-menu tab, and lights for the lamps. */
export const OLD_PIECES: Record<string, Partial<FurnitureDef>> = {
  bedDouble: { category: 'beds', colors: { a: '#6f8fb0' } }, bedSingle: { category: 'beds', colors: { a: '#5e8c7a' } }, nightstand: { category: 'tables' }, closet: { category: 'storage' },
  fridge: { category: 'kitchen' }, counter: { category: 'kitchen' }, counterMicrowave: { category: 'kitchen' }, diningTable: { category: 'tables', colors: { a: '#e8d8c3' } }, breakfastBar: { category: 'kitchen' },
  sofa: { category: 'seating', colors: { a: '#7b8794' } }, sofaLong: { category: 'seating', colors: { a: '#a39887' } }, armchair: { category: 'seating', colors: { a: '#c47f2c' } }, coffeeTable: { category: 'tables' }, glassTable: { category: 'tables' },
  tv: { category: 'tech' }, tvVintage: { category: 'tech' }, bookcase: { category: 'storage' }, bookcaseWide: { category: 'storage' }, speaker: { category: 'tech' },
  desk: { category: 'tables', colors: { a: '#1d1f24' } }, deskScreen: { category: 'tables', colors: { a: '#1d1f24' } }, rug: { category: 'rugs', colors: { a: '#8c2f39' } }, rugRound: { category: 'rugs', colors: { a: '#4f86a6' } }, plant: { category: 'plants' },
  floorLamp: { category: 'lights', light: L('floor', 1.55, 3, 0.8) }, coatRack: { category: 'storage' }, sideTable: { category: 'tables' }, trashcan: { category: 'decor' },
  kingBed: { category: 'beds' }, velvetSectional: { category: 'seating' }, mediaWall: { category: 'tech' }, grandPiano: { category: 'decor' }, artwork: { category: 'decor' },
  wardrobeWall: { category: 'storage' }, executiveDesk: { category: 'tables' }, fiddleFig: { category: 'plants' },
};
