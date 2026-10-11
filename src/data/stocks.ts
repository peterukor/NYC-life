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
}

export const STOCKS = new Registry<StockDef>('stock');

STOCKS.add(
  { id: 'nyx', ticker: 'NYX', name: 'Big Apple Index Fund', emoji: '🍎', sector: 'Index fund', start: 10_000, drift: 0.0003, vol: 0.007, fund: true },
  { id: 'bond', ticker: 'BOND', name: 'Steady Eddie Bond Fund', emoji: '🛡️', sector: 'Bonds', start: 5_000, drift: 0.00012, vol: 0.002, fund: true },
  { id: 'bagl', ticker: 'BAGL', name: 'Bagel Bros Holdings', emoji: '🥯', sector: 'Food', start: 4_200, drift: 0.0002, vol: 0.012 },
  { id: 'cabz', ticker: 'CABZ', name: 'YellowCab Rides', emoji: '🚕', sector: 'Transport', start: 2_800, drift: 0.0001, vol: 0.018 },
  { id: 'brkn', ticker: 'BRKN', name: 'Brooklyn Brew Co.', emoji: '🍺', sector: 'Drinks', start: 3_500, drift: 0.00025, vol: 0.014 },
  { id: 'subw', ticker: 'SUBW', name: 'MetroLine Systems', emoji: '🚇', sector: 'Infrastructure', start: 6_100, drift: 0.00018, vol: 0.009 },
  { id: 'tkts', ticker: 'TKTS', name: 'Broadway Nights Ent.', emoji: '🎭', sector: 'Entertainment', start: 3_900, drift: 0.0002, vol: 0.016 },
  { id: 'pzza', ticker: 'PZZA', name: 'Dollar Slice Corp', emoji: '🍕', sector: 'Food', start: 1_200, drift: 0.00015, vol: 0.02 },
  { id: 'byte', ticker: 'BYTE', name: 'DUMBO Tech Labs', emoji: '💻', sector: 'Tech', start: 15_000, drift: 0.0005, vol: 0.025 },
  { id: 'moon', ticker: 'MOON', name: 'RatCoin Mania', emoji: '🐀', sector: 'Meme', start: 300, drift: 0, vol: 0.06 },
);
