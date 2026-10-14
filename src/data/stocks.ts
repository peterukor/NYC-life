// =====================================================================
// stocks.ts — the companies and funds you can invest in (all made up).
//
// Prices are worked out from the game date with seeded randomness, so
// every player sees the same market without a server (sim/market.ts).
// Each stock has a long-run trend (drift) and how wild it swings
// (volatility). Index funds are calm; meme stocks are not.
//
// TO ADD A STOCK: add an entry. Ids must be unique; prices start at
// `start` (cents) on game day 0 (Jan 1 2026) and wander from there.
// =====================================================================

import { Registry } from '../core/registry.ts';

export interface StockDef {
  id: string;
  /** Ticker shown in the app, e.g. "BAGL". */
  ticker: string;
  name: string;
  emoji: string;
  sector: string;
  /** Starting price in cents. */
  start: number;
  /** Average daily change (0.0004 ≈ +15% a year of game days). */
  drift: number;
  /** Typical daily swing (0.01 = 1%). */
  vol: number;
  /** Index funds are the "safe" choice and say so. */
  fund?: boolean;
  /**
   * How it behaves (sim/market.ts): 'fund' calm; 'blue' steady big company
   * (earnings days); 'growth' swings more; 'penny' cheap and jumpy, with
   * rare short squeezes; 'meme' wild: squeezes and rug pulls.
   */
  risk: 'fund' | 'blue' | 'growth' | 'penny' | 'meme';
}

export const STOCKS = new Registry<StockDef>('stock');

// 15 companies (Peter, 2026-10-14) plus 2 safe funds.
STOCKS.add(
  // ---- funds: the calm, boring, usually-up choice
  { id: 'nyx', ticker: 'NYX', name: 'Big Apple Index Fund', emoji: '🍎', sector: 'Index fund', start: 10_000, drift: 0.0003, vol: 0.007, fund: true, risk: 'fund' },
  { id: 'bond', ticker: 'BOND', name: 'Steady Eddie Bond Fund', emoji: '🛡️', sector: 'Bonds', start: 5_000, drift: 0.00012, vol: 0.002, fund: true, risk: 'fund' },
  // ---- blue chips: big, steady, move on earnings day
  { id: 'subw', ticker: 'SUBW', name: 'MetroLine Systems', emoji: '🚇', sector: 'Infrastructure', start: 6_100, drift: 0.00018, vol: 0.009, risk: 'blue' },
  { id: 'skyl', ticker: 'SKYL', name: 'Skyline Towers', emoji: '🏙️', sector: 'Real estate', start: 21_000, drift: 0.00022, vol: 0.01, risk: 'blue' },
  { id: 'bagl', ticker: 'BAGL', name: 'Bagel Bros Holdings', emoji: '🥯', sector: 'Food', start: 4_200, drift: 0.0002, vol: 0.012, risk: 'blue' },
  { id: 'brkn', ticker: 'BRKN', name: 'Brooklyn Brew Co.', emoji: '🍺', sector: 'Drinks', start: 3_500, drift: 0.00025, vol: 0.014, risk: 'blue' },
  // ---- growth: swing more, can run for weeks either way
  { id: 'byte', ticker: 'BYTE', name: 'DUMBO Tech Labs', emoji: '💻', sector: 'Tech', start: 15_000, drift: 0.0005, vol: 0.025, risk: 'growth' },
  { id: 'dash', ticker: 'DASH', name: 'InstaDash', emoji: '🛵', sector: 'Delivery apps', start: 8_800, drift: 0.0004, vol: 0.028, risk: 'growth' },
  { id: 'pign', ticker: 'PIGN', name: 'Pigeon Phones', emoji: '📱', sector: 'Devices', start: 12_400, drift: 0.00035, vol: 0.022, risk: 'growth' },
  { id: 'tkts', ticker: 'TKTS', name: 'Broadway Nights Ent.', emoji: '🎭', sector: 'Entertainment', start: 3_900, drift: 0.0002, vol: 0.016, risk: 'growth' },
  { id: 'vlvt', ticker: 'VLVT', name: 'Velvet Room Group', emoji: '🌙', sector: 'Nightlife', start: 2_600, drift: 0.0002, vol: 0.024, risk: 'growth' },
  { id: 'iron', ticker: 'IRON', name: 'Iron Fitness Clubs', emoji: '🏋️', sector: 'Fitness', start: 1_900, drift: 0.00025, vol: 0.02, risk: 'growth' },
  // ---- penny stocks: cheap, jumpy, the odd short squeeze
  { id: 'cabz', ticker: 'CABZ', name: 'YellowCab Rides', emoji: '🚕', sector: 'Transport', start: 280, drift: 0.0001, vol: 0.035, risk: 'penny' },
  { id: 'pzza', ticker: 'PZZA', name: 'Dollar Slice Corp', emoji: '🍕', sector: 'Food', start: 120, drift: 0.00015, vol: 0.04, risk: 'penny' },
  // ---- meme: anything can happen (squeezes to the moon, rug pulls to zero)
  { id: 'hype', ticker: 'HYPE', name: 'Hypebeast Sneakers', emoji: '👟', sector: 'Meme', start: 150, drift: 0, vol: 0.05, risk: 'meme' },
  { id: 'moon', ticker: 'MOON', name: 'RatCoin Mania', emoji: '🐀', sector: 'Meme', start: 30, drift: 0, vol: 0.06, risk: 'meme' },
  { id: 'cats', ticker: 'CATS', name: 'Bodega Cat Coin', emoji: '🐈', sector: 'Meme', start: 12, drift: 0, vol: 0.07, risk: 'meme' },
);
