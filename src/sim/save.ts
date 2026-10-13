// =====================================================================
// save.ts — saving and loading one player's life in the browser.
//
// Single-player for now: the save lives in localStorage on this device.
// In the multiplayer version the server keeps the real copy and this
// becomes a cache. The `migrate` function upgrades old saves when the
// format changes, so players never lose progress after an update.
// =====================================================================

import { doorOf, PLACE_BY_ID } from '../data/places.ts';
import { newGarageState } from './garage.ts';
import { newGangState } from './gangs.ts';
import { SAVE_KEY, SAVE_VERSION } from '../core/constants.ts';
import { STARTER_ITEMS } from '../data/wardrobe.ts';
import { newPathsState } from './paths.ts';
import { newBusinessState } from './business.ts';
import { isOpenArea, type GameState } from './types.ts';

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
  data.paths ??= newPathsState();
  data.business ??= newBusinessState();
  data.debt ??= null;
  data.record ??= { bankruptcies: 0 };
  data.jail ??= null;
  data.garage ??= newGarageState();
  data.gang ??= newGangState();
  // 2026-10-11: the city moved onto the real borough shapes. Old street
  // positions mean nothing now, so old saves wake up at home.
  if ((data.layoutVersion ?? 1) < 2) {
    const home = PLACE_BY_ID[data.home?.placeId] ?? PLACE_BY_ID.hkStudio;
    const door = doorOf(home);
    data.location = { area: home.area, placeId: home.id, x: door.x, z: door.z };
    data.layoutVersion = 2;
  }
  // 2026-10-12: bigger blocks, Manhattan only (the other boroughs are
  // switched off, and their homes, bar and office moved to Manhattan).
  // Street positions moved, so everyone wakes up at home once more; a home
  // that's still in a closed borough falls back to the Hell's Kitchen studio.
  if ((data.layoutVersion ?? 1) < 3 || !isOpenArea(data.location.area)) {
    let home = PLACE_BY_ID[data.home?.placeId];
    if (!home || !isOpenArea(home.area)) {
      home = PLACE_BY_ID.hkStudio;
      data.home = { ...data.home, area: home.area, placeId: home.id, weeklyRent: data.home?.weeklyRent ? (home.rent ?? 0) : 0 };
    } else if (data.home.area !== home.area) {
      data.home.area = home.area;
    }
    const door = doorOf(home);
    data.location = { area: home.area, placeId: home.id, x: door.x, z: door.z };
    data.layoutVersion = 3;
  }
  data.people ??= {};
  data.joinedEvents ??= [];
  // Balance pass (2026-10-11): rents were rescaled. Paying tenants follow the
  // listing's current rent; homes paid by family (0) stay free.
  const listing = data.home ? PLACE_BY_ID[data.home.placeId] : undefined;
  if (listing && data.home.weeklyRent > 0 && listing.rent !== undefined) data.home.weeklyRent = listing.rent;
  // Saves from before owned clothes: you own the free items plus what you wear.
  if (!data.wardrobe) {
    const l = data.profile.look;
    data.wardrobe = [...new Set([...STARTER_ITEMS(), ...[l.hairStyle, l.topId, l.bottomId, l.shoesId, l.hatId, l.extraId].filter((x): x is string => !!x)])];
  }
  return data;
}
