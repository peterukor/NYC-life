// =====================================================================
// save.ts — saving and loading one player's life in the browser.
//
// Single-player for now: the save lives in localStorage on this device.
// In the multiplayer version the server keeps the real copy and this
// becomes a cache. The `migrate` function upgrades old saves when the
// format changes, so players never lose progress after an update.
// =====================================================================

import { SAVE_KEY, SAVE_VERSION } from '../core/constants.ts';
import { STARTER_ITEMS } from '../data/wardrobe.ts';
import type { GameState } from './types.ts';

function storage(): Storage | null {
  // Private browsing and some embedded views throw when touching storage.
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadGame(): GameState | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GameState;
    return migrate(data);
  } catch (err) {
    console.warn('[save] could not read save, starting fresh', err);
    return null;
  }
}

export function saveGame(state: GameState): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    // Storage full or blocked. The game keeps running; we just can't persist.
    console.warn('[save] could not write save', err);
    return false;
  }
}

export function deleteGame(): void {
  storage()?.removeItem(SAVE_KEY);
}

/** Upgrade older save formats to the current one. Returns null if it's unusable. */
function migrate(data: GameState): GameState | null {
  if (!data || typeof data !== 'object' || typeof data.version !== 'number') return null;
  if (data.version > SAVE_VERSION) return null; // a save from a newer build; don't risk corrupting it
  // v1 is the first format. Future: if (data.version === 1) { …; data.version = 2; }
  // Fill in any fields added after the save was made.
  data.phone ??= { ok: true };
  data.news ??= [];
  data.events ??= { lastFiredAt: Date.now(), cooldowns: {} };
  data.settings ??= { quality: 'auto', sound: true };
  data.homes ??= {};
  data.auto ??= { on: false, routine: [], since: 0 };
  data.portfolio ??= {};
  // Saves from before owned clothes: you own the free items plus what you wear.
  if (!data.wardrobe) {
    const l = data.profile.look;
    data.wardrobe = [...new Set([...STARTER_ITEMS(), ...[l.hairStyle, l.topId, l.bottomId, l.shoesId, l.hatId, l.extraId].filter((x): x is string => !!x)])];
  }
  return data;
}
