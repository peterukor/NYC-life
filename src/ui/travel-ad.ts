// =====================================================================
// travel-ad.ts — the ad on travel loading screens (Peter, 2026-10-14:
// "make loading screens for things like fast travel an ad").
//
// Rotates through the ads in turn so each gets its share. Today that's
// the fictional house ads; paid ads (data/plots.ts pricing, the ad
// system in world/ads.ts) slot in here when advertisers can buy them,
// and each showing should then count as a view for that advertiser.
// =====================================================================

import { HOUSE_ADS, type AdCreative } from '../render/textures.ts';

let turn = Math.floor(Math.random() * HOUSE_ADS.length);

/** Paid ads to rotate in ahead of the house ads (set by the ad system later). */
let paid: AdCreative[] = [];
export function setTravelAds(ads: AdCreative[]): void {
  paid = ads;
}

export function nextTravelAd(): AdCreative {
  const pool = paid.length ? paid : HOUSE_ADS;
  return pool[turn++ % pool.length];
}
