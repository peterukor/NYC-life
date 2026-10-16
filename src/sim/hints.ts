// =====================================================================
// hints.ts — tips for new players (Peter, 2026-10-15: "hints for new
// players, that can be reduced or turned off").
//
// Small tips that pop up once each, when they're useful: the first time
// you're on the street, hungry, broke, in a club, carrying a lot of cash…
// Settings → 💡 Tips: All, Fewer (just the important ones) or Off.
// At most one tip every ~45 s, never over a menu. The first-day goal card
// (sim/goals.ts) hides its how-to line when tips are off.
// =====================================================================

import { PLACE_BY_ID } from '../data/places.ts';
import type { GameState } from './types.ts';

export type HintLevel = 'all' | 'few' | 'off';

export interface HintContext {
  /** Where you are: 'home', 'street', 'subway' or the place type you're inside. */
  where: string;
  placeId?: string | null;
  hour: number;
}

export interface HintDef {
  id: string;
  emoji: string;
  text: string;
  /** Shown on "Fewer" too (the important ones). */
  key?: boolean;
  when: (s: GameState, c: HintContext) => boolean;
}

export const HINT_GAP_SECONDS = 45;

const SHOWN_AT_START = 20; // seconds into a session before the first tip

export const HINTS: HintDef[] = [
  { id: 'home', emoji: '🏠', key: true, text: 'Tap things in your place to use them: the fridge to eat, the bed to sleep, the shower to wash. Hold and drag furniture to move it.', when: (_s, c) => c.where === 'home' },
  { id: 'goal', emoji: '★', key: true, text: 'The ★ card at the top is your next goal. Finish it for cash.', when: (s) => s.tutorialStep < 2 },
  { id: 'street', emoji: '🗺️', key: true, text: 'Tap the street to walk. 🏙️ Places lists everywhere you can go, and the Map gets you there by train, Rideshare or on foot.', when: (_s, c) => c.where === 'street' },
  { id: 'hungry', emoji: '🍔', key: true, text: 'You’re getting hungry. Eat at home, grab something from a deli, or order InstaDash on your phone.', when: (s) => s.needs.hunger < 30 },
  { id: 'tired', emoji: '😴', key: true, text: 'Low energy makes everything harder. Sleep at home, or grab a coffee for a quick boost.', when: (s) => s.needs.energy < 25 },
  { id: 'broke', emoji: '💸', key: true, text: 'Money’s tight. 💼 Go to work for a shift, and keep an eye on rent (Phone → Bank).', when: (s) => s.money + s.bank < 2_000 },
  { id: 'bank', emoji: '🏦', text: 'Carrying a lot of cash? Pickpockets love that. Phone → Bank → Deposit.', when: (s) => s.money > 50_000 },
  { id: 'phone', emoji: '📱', text: 'Your phone has the Map, Bank, Stocks, 🏆 Leaderboard, 🎮 Games and more. Daily challenges pay cash.', when: (s) => s.tutorialStep >= 2 },
  { id: 'subway', emoji: '🚇', text: 'Trains are quick and cheap. Now and then something happens on board: you can choose how to react.', when: (_s, c) => c.where === 'subway' },
  { id: 'night', emoji: '🌙', text: 'Night time: clubs and bars open up. Bigger clubs check your 🔥 street rep and 😎 Cool at the door.', when: (_s, c) => c.where === 'street' && (c.hour >= 21 || c.hour < 3) },
  { id: 'club', emoji: '🪩', text: 'Buy a bottle and your name goes up on the screen. Mingle to meet people with perks.', when: (_s, c) => c.where === 'nightlife' },
  { id: 'work', emoji: '💼', text: 'Work a shift here to get paid. Do well and the boss notices: raises come with levels.', when: (_s, c) => c.where === 'work' },
  { id: 'fun', emoji: '🎯', text: 'Fun spots earn 🏆 season points. Top 3 every 3 days win up to $2,000.', when: (_s, c) => c.where === 'fun' },
  { id: 'shop', emoji: '🛍️', text: 'Shops sell furniture, clothes and food. Better furniture means better sleep and more fun.', when: (_s, c) => c.where === 'shop' },
  { id: 'roommates', emoji: '🙋', text: 'Your roommates have lives too. Tap one to chat; good roommates help you out.', when: (s, c) => c.where === 'home' && c.placeId === 'harlemWalkup' && s.tutorialStep >= 1 },
  { id: 'citymap', emoji: '🗺️', text: 'Your map only shows places you’ve been near. The 🗺️ Full City Map ($250, at the bottom of the Map) shows every place, with filters.', when: (s, c) => c.where === 'street' && !s.cityMap && s.tutorialStep >= 3 },
  { id: 'odd', emoji: '🪦', text: 'Uptown is weird in the best way: a rage room, a pessimistic psychic, a haunted open house, a rat tour… Check 🏙️ Places.', when: (s, c) => c.where === 'street' && s.tutorialStep >= 5 },
  { id: 'paths', emoji: '🧭', text: 'Pick a life path (Phone → 🪜 Life Path) for goals that fit how you play: business, music, fighter, artist…', when: (s) => s.tutorialStep >= 4 && !s.paths.active },
];

export const hintLevel = (s: GameState): HintLevel => s.settings.hints ?? 'all';

/** The next tip to show now, or null. Marks it seen. */
export function nextHint(s: GameState, c: HintContext, secondsIn: number): HintDef | null {
  const level = hintLevel(s);
  if (level === 'off' || secondsIn < SHOWN_AT_START) return null;
  const seen = (s.hintsSeen ??= []);
  const h = HINTS.find((x) => !seen.includes(x.id) && (level === 'all' || x.key) && x.when(s, c));
  if (!h) return null;
  seen.push(h.id);
  return h;
}

/** What kind of place you're in, for tips. */
export function whereFor(s: GameState, mode: string): string {
  if (mode === 'transit') return 'subway';
  if (mode !== 'interior' || !s.location.placeId) return 'street';
  if (s.location.placeId === s.home.placeId) return 'home';
  return PLACE_BY_ID[s.location.placeId]?.type ?? 'street';
}
