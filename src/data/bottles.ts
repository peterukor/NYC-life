// =====================================================================
// bottles.ts — bottle service at the club (Peter, 2026-10-14).
//
// Seven bottles from $700 to $100,000. Names nod to the real ones
// (parodies, with our own label art). The more you spend, the bigger the
// show: from the 3rd bottle a spotlight finds you (longer each step),
// fireworks match the bottle's colours and get bigger and longer, and
// more people come over to talk to you (2 up to 7). Everyone in the room
// gets a little lift. 📈 Big trades get the same show (TRADE_WINS).
// =====================================================================

export interface Celebration {
  /** Seconds the spotlight stays on you (0 = none). */
  spotlight: number;
  /** Firework size (1 = a decent burst, 5 = the sky's on fire) and how long they go (s). */
  fireworks: { size: number; seconds: number; colors: string[] };
  /** People who come over (men and women, all 21+). */
  admirers: number;
  /** How the room feels about it (a mood for everyone). */
  roomMood: number;
}

export interface BottleDef extends Celebration {
  id: string;
  name: string;
  /** What it is, in a few words. */
  kind: string;
  emoji: string;
  price: number;
}

export const BOTTLES: BottleDef[] = [
  { id: 'mowet', name: 'Mowêt Impérial', kind: 'Champagne', emoji: '🍾', price: 70_000, spotlight: 0, fireworks: { size: 1.4, seconds: 4, colors: ['#ffd166', '#ffffff'] }, admirers: 2, roomMood: 2 },
  { id: 'kliko', name: 'Veuve Kliko', kind: 'Champagne, yellow label', emoji: '🍾', price: 250_000, spotlight: 0, fireworks: { size: 1.7, seconds: 5, colors: ['#ffb703', '#fb8500'] }, admirers: 2, roomMood: 3 },
  { id: 'perinyon', name: 'Dom Perinyon', kind: 'Vintage champagne', emoji: '🍾', price: 500_000, spotlight: 6, fireworks: { size: 2.2, seconds: 6, colors: ['#ffffff', '#ffd166', '#c0c0c0'] }, admirers: 3, roomMood: 4 },
  { id: 'julyo', name: 'Don Julyo 1942', kind: 'Añejo tequila', emoji: '🥃', price: 1_000_000, spotlight: 9, fireworks: { size: 2.7, seconds: 8, colors: ['#f4a261', '#e9c46a', '#ffffff'] }, admirers: 4, roomMood: 5 },
  { id: 'shades', name: 'Ace of Shades', kind: 'Gold-bottle champagne', emoji: '🍾', price: 2_500_000, spotlight: 13, fireworks: { size: 3.3, seconds: 10, colors: ['#ffd700', '#ffec99', '#ffffff'] }, admirers: 5, roomMood: 6 },
  { id: 'cristalle', name: 'Cristalle Rosé', kind: 'Rosé champagne', emoji: '🥂', price: 5_000_000, spotlight: 18, fireworks: { size: 4.0, seconds: 13, colors: ['#ff8fab', '#ffc2d1', '#ffffff'] }, admirers: 6, roomMood: 8 },
  { id: 'goliath', name: 'Gold Goliath Jeroboam', kind: 'The giant bottle', emoji: '👑', price: 10_000_000, spotlight: 26, fireworks: { size: 5.0, seconds: 18, colors: ['#ffd700', '#ff4fa3', '#36c5f0', '#9b5de5', '#ffffff'] }, admirers: 7, roomMood: 10 },
];
export const BOTTLE_BY_ID: Record<string, BottleDef> = Object.fromEntries(BOTTLES.map((b) => [b.id, b]));

/** 📈 Big trade wins at the trading floor: the multiple you made, and its show. */
export const TRADE_WINS: { mult: number; show: Celebration }[] = [
  { mult: 100, show: { spotlight: 26, fireworks: { size: 5.0, seconds: 18, colors: ['#4cd137', '#ffd700', '#ffffff'] }, admirers: 7, roomMood: 10 } },
  { mult: 80, show: { spotlight: 18, fireworks: { size: 4.0, seconds: 13, colors: ['#4cd137', '#fbc531', '#ffffff'] }, admirers: 5, roomMood: 8 } },
  { mult: 50, show: { spotlight: 13, fireworks: { size: 3.3, seconds: 10, colors: ['#4cd137', '#fbc531'] }, admirers: 4, roomMood: 6 } },
  { mult: 30, show: { spotlight: 6, fireworks: { size: 2.4, seconds: 7, colors: ['#4cd137', '#ffffff'] }, admirers: 3, roomMood: 4 } },
  { mult: 10, show: { spotlight: 0, fireworks: { size: 1.6, seconds: 5, colors: ['#4cd137', '#ffffff'] }, admirers: 2, roomMood: 2 } },
];

/** The show for a trade that made `mult`× (null below 10×). */
export function tradeWinShow(mult: number): { mult: number; show: Celebration } | null {
  return TRADE_WINS.find((w) => mult >= w.mult) ?? null;
}
