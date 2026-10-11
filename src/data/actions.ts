// =====================================================================
// actions.ts — every activity a player can do, in one list.
//
// An action takes a few REAL seconds (like Lagos Life), costs some money
// (or pays some), and changes needs, skills and mood. Places and home
// objects list which action ids they offer.
//
// Fields:
//   seconds  how long it takes in real time
//   cost     price in cents (paid when you start)
//   pay      money earned in cents, or a function of your skills
//   needs    need changes applied when it finishes
//   skill    which skill it trains and how fast (points per use)
//   requires minimum skill level to unlock it
//   moodlet  optional temporary mood effect
//   tags     used by goals, missions and events (e.g. 'eat', 'nightlife')
// =====================================================================

import type { GameState, NeedKey, SkillKey } from '../sim/types.ts';

export interface ActionDef {
  id: string;
  label: string;
  emoji: string;
  seconds: number;
  cost?: number;
  pay?: number | ((s: GameState) => number);
  needs?: Partial<Record<NeedKey, number>>;
  skill?: { key: SkillKey; gain: number };
  requires?: { skill: SkillKey; level: number };
  moodlet?: { id: string; label: string; emoji: string; value: number; minutes: number };
  /** Only available between these New York hours (e.g. [22, 4] wraps past midnight). */
  hours?: [number, number];
  /** Only for players on this life path (data/paths.ts), from this level. */
  path?: { id: string; minLevel: number };
  /** Chance (0–1) this goes wrong and you get caught (sim/paths.ts handles it). */
  risk?: number;
  tags: string[];
}

const lvl = (s: GameState, k: SkillKey) => Math.floor(s.skills[k]);

const LIST: ActionDef[] = [
  // ---------- Home objects ----------
  { id: 'sleep', label: 'Sleep it off', emoji: '😴', seconds: 18, needs: { energy: 70, hunger: -6, bladder: -10 }, tags: ['rest'] },
  { id: 'nap', label: 'Power nap', emoji: '💤', seconds: 8, needs: { energy: 25 }, tags: ['rest'] },
  { id: 'snack', label: 'Grab a snack', emoji: '🥪', seconds: 4, needs: { hunger: 22 }, tags: ['eat'] },
  { id: 'cookPasta', label: 'Cook pasta', emoji: '🍝', seconds: 12, needs: { hunger: 55, fun: 4 }, skill: { key: 'cooking', gain: 0.6 }, tags: ['eat', 'cook'] },
  { id: 'cookFancy', label: 'Cook a date-night dinner', emoji: '🥘', seconds: 16, needs: { hunger: 70, fun: 10 }, skill: { key: 'cooking', gain: 0.9 }, requires: { skill: 'cooking', level: 2 }, tags: ['eat', 'cook'] },
  { id: 'shower', label: 'Take a shower', emoji: '🚿', seconds: 7, needs: { hygiene: 75, energy: 4 }, tags: ['bathe'] },
  { id: 'toilet', label: 'Use the toilet', emoji: '🚽', seconds: 4, needs: { bladder: 100 }, tags: ['toilet'] },
  { id: 'watchTv', label: 'Watch TV', emoji: '📺', seconds: 10, needs: { fun: 22, energy: -2 }, tags: ['fun', 'tv'] },
  { id: 'gameConsole', label: 'Play video games', emoji: '🎮', seconds: 12, needs: { fun: 30, social: 4, energy: -4 }, tags: ['fun'] },
  { id: 'codePractice', label: 'Practice coding', emoji: '💻', seconds: 14, needs: { fun: -6, energy: -4 }, skill: { key: 'coding', gain: 0.8 }, tags: ['skill'] },
  { id: 'freelance', label: 'Freelance gig', emoji: '💸', seconds: 20, needs: { energy: -8, fun: -4 }, pay: (s) => 4_500 + 2_200 * lvl(s, 'coding'), requires: { skill: 'coding', level: 2 }, skill: { key: 'coding', gain: 0.3 }, tags: ['earn', 'gig'] },
  { id: 'sellOnline', label: 'Flip sneakers online', emoji: '👟', seconds: 12, needs: { fun: 6 }, pay: (s) => 1_200 + 900 * lvl(s, 'hustle'), skill: { key: 'hustle', gain: 0.5 }, tags: ['earn', 'gig'] },
  { id: 'doomscroll', label: 'Scroll NYC Twitter', emoji: '📱', seconds: 6, needs: { fun: 10, social: 6, energy: -2 }, tags: ['online'] },
  { id: 'callMom', label: 'Call your mom', emoji: '📞', seconds: 8, needs: { social: 30, fun: 4 }, moodlet: { id: 'momCall', label: 'Mom says she’s proud', emoji: '🥹', value: 10, minutes: 90 }, tags: ['social'] },
  { id: 'guitar', label: 'Play guitar', emoji: '🎸', seconds: 12, needs: { fun: 18 }, skill: { key: 'music', gain: 0.7 }, tags: ['skill'] },
  { id: 'workout', label: 'Home workout', emoji: '🏋️', seconds: 12, needs: { energy: -14, hygiene: -14, fun: 4 }, skill: { key: 'fitness', gain: 0.7 }, tags: ['fitness'] },

  // ---------- Bodega ----------
  { id: 'baconEggCheese', label: 'Bacon, egg & cheese', emoji: '🥯', seconds: 6, cost: 650, needs: { hunger: 45, fun: 6 }, tags: ['eat'] },
  { id: 'choppedCheese', label: 'Chopped cheese', emoji: '🥪', seconds: 7, cost: 900, needs: { hunger: 55, fun: 6 }, tags: ['eat'] },
  { id: 'bodegaCoffee', label: 'Bodega coffee', emoji: '☕', seconds: 3, cost: 175, needs: { energy: 12 }, tags: ['drink'] },
  { id: 'petBodegaCat', label: 'Pet the bodega cat', emoji: '🐈', seconds: 5, needs: { fun: 14, social: 4 }, moodlet: { id: 'bodegaCat', label: 'Bodega cat approved', emoji: '🐈', value: 8, minutes: 60 }, tags: ['fun'] },
  { id: 'lottoTicket', label: 'Scratch-off ticket', emoji: '🎟️', seconds: 4, cost: 200, needs: { fun: 6 }, pay: () => (Math.random() < 0.08 ? 2_000 : Math.random() < 0.004 ? 50_000 : 0), tags: ['luck'] },
  { id: 'gistWithOwner', label: 'Chat with the owner', emoji: '🗣️', seconds: 6, needs: { social: 18 }, skill: { key: 'charisma', gain: 0.25 }, tags: ['social'] },

  // ---------- Pizza ----------
  { id: 'dollarSlice', label: 'Grab a dollar slice', emoji: '🍕', seconds: 4, cost: 150, needs: { hunger: 28 }, tags: ['eat'] },
  { id: 'fullPie', label: 'Whole pie with friends', emoji: '🍕', seconds: 12, cost: 2_400, needs: { hunger: 70, social: 25, fun: 15 }, tags: ['eat', 'social'] },
  { id: 'foldDebate', label: 'Debate: fold or no fold', emoji: '🤌', seconds: 6, needs: { social: 16, fun: 8 }, skill: { key: 'charisma', gain: 0.3 }, tags: ['social'] },

  // ---------- Café ----------
  { id: 'latte', label: 'Oat milk latte', emoji: '☕', seconds: 5, cost: 650, needs: { energy: 20, fun: 4 }, tags: ['drink'] },
  { id: 'laptopCafe', label: 'Work from the café', emoji: '💻', seconds: 14, cost: 450, needs: { fun: 2, social: 6 }, skill: { key: 'coding', gain: 0.6 }, tags: ['skill'] },
  { id: 'bagelSchmear', label: 'Bagel with schmear', emoji: '🥯', seconds: 5, cost: 525, needs: { hunger: 35 }, tags: ['eat'] },

  // ---------- Bars, clubs, comedy (nightlife) ----------
  { id: 'happyHour', label: 'Happy hour drinks', emoji: '🍹', seconds: 10, cost: 1_800, needs: { fun: 30, social: 30, bladder: -20, energy: -6 }, tags: ['nightlife', 'social'] },
  { id: 'karaoke', label: 'Karaoke night', emoji: '🎤', seconds: 12, cost: 1_000, needs: { fun: 38, social: 20 }, skill: { key: 'music', gain: 0.5 }, moodlet: { id: 'karaokeStar', label: 'Crowd sang along', emoji: '🎤', value: 12, minutes: 120 }, hours: [18, 3], tags: ['nightlife'] },
  { id: 'dancefloor', label: 'Hit the dance floor', emoji: '🪩', seconds: 14, cost: 2_500, needs: { fun: 45, social: 30, energy: -18, hygiene: -10 }, moodlet: { id: 'bigNight', label: 'Big night out', emoji: '🪩', value: 18, minutes: 180 }, hours: [21, 4], tags: ['nightlife'] },
  { id: 'openMic', label: 'Do 5 minutes at open mic', emoji: '😂', seconds: 14, needs: { fun: 20, social: 15, energy: -6 }, skill: { key: 'charisma', gain: 0.8 }, tags: ['nightlife', 'skill'] },
  { id: 'watchComedy', label: 'Watch a comedy show', emoji: '🎭', seconds: 12, cost: 2_000, needs: { fun: 40, social: 10 }, tags: ['nightlife', 'fun'] },

  // ---------- Gym ----------
  { id: 'gymSession', label: 'Lift weights', emoji: '🏋️', seconds: 14, cost: 1_500, needs: { energy: -16, hygiene: -20, fun: 8 }, skill: { key: 'fitness', gain: 1.1 }, tags: ['fitness'] },
  { id: 'spinClass', label: 'Spin class', emoji: '🚴', seconds: 14, cost: 3_200, needs: { energy: -20, hygiene: -20, fun: 14, social: 10 }, skill: { key: 'fitness', gain: 1.3 }, tags: ['fitness', 'social'] },
  { id: 'gymShower', label: 'Locker room shower', emoji: '🚿', seconds: 6, needs: { hygiene: 70 }, tags: ['bathe'] },

  // ---------- Parks and plazas ----------
  { id: 'peopleWatch', label: 'People-watch', emoji: '👀', seconds: 8, needs: { fun: 16, social: 6 }, skill: { key: 'streetSmarts', gain: 0.4 }, tags: ['relax'] },
  { id: 'picnic', label: 'Picnic on the lawn', emoji: '🧺', seconds: 10, cost: 1_200, needs: { hunger: 35, fun: 18, social: 10 }, tags: ['eat', 'relax'] },
  { id: 'chess', label: 'Speed chess with a regular', emoji: '♟️', seconds: 10, needs: { fun: 18, social: 12 }, skill: { key: 'streetSmarts', gain: 0.5 }, tags: ['fun'] },
  { id: 'jog', label: 'Go for a run', emoji: '🏃', seconds: 10, needs: { energy: -12, hygiene: -15, fun: 10 }, skill: { key: 'fitness', gain: 0.8 }, tags: ['fitness'] },
  { id: 'busk', label: 'Busk for tips', emoji: '🎸', seconds: 14, needs: { fun: 10, energy: -6 }, pay: (s) => 600 + 900 * lvl(s, 'music'), skill: { key: 'music', gain: 0.5 }, requires: { skill: 'music', level: 1 }, tags: ['earn', 'gig'] },
  { id: 'photoSelfie', label: 'Take a selfie', emoji: '🤳', seconds: 4, needs: { fun: 10, social: 4 }, moodlet: { id: 'selfie', label: 'Main character energy', emoji: '🤳', value: 6, minutes: 60 }, tags: ['fun', 'photo'] },
  { id: 'publicRestroom', label: 'Find a public restroom', emoji: '🚻', seconds: 8, needs: { bladder: 100, hygiene: -4 }, tags: ['toilet'] },
  { id: 'hotDogCart', label: 'Hot dog from the cart', emoji: '🌭', seconds: 4, cost: 400, needs: { hunger: 26 }, tags: ['eat'] },
  { id: 'halalCart', label: 'Chicken over rice (halal cart)', emoji: '🍛', seconds: 6, cost: 1_000, needs: { hunger: 60, fun: 6 }, tags: ['eat'] },

  // ---------- Landmarks ----------
  { id: 'observationDeck', label: 'Go up to the observation deck', emoji: '🏙️', seconds: 12, cost: 4_400, needs: { fun: 40, energy: -4 }, moodlet: { id: 'topOfCity', label: 'On top of the city', emoji: '🏙️', value: 15, minutes: 180 }, tags: ['landmark', 'fun'] },
  { id: 'walkBridge', label: 'Walk the bridge at sunset', emoji: '🌉', seconds: 12, needs: { fun: 30, energy: -8 }, moodlet: { id: 'bridgeWalk', label: 'Skyline views', emoji: '🌉', value: 12, minutes: 120 }, tags: ['landmark', 'fitness'] },
  { id: 'rowboat', label: 'Rent a rowboat on the lake', emoji: '🚣', seconds: 12, cost: 2_000, needs: { fun: 35, social: 10, energy: -6 }, moodlet: { id: 'rowboat', label: 'Lake day', emoji: '🚣', value: 10, minutes: 120 }, tags: ['landmark', 'fun'] },
  { id: 'windowShop', label: 'Window shop', emoji: '🛍️', seconds: 8, needs: { fun: 18, energy: -3 }, tags: ['fun', 'shopping'] },
  { id: 'foodHall', label: 'Eat at the food hall', emoji: '🍜', seconds: 9, cost: 1_800, needs: { hunger: 60, fun: 10, social: 6 }, tags: ['eat'] },
  { id: 'ferrisWheel', label: 'Ride the Ferris wheel', emoji: '🎡', seconds: 10, cost: 1_200, needs: { fun: 35, social: 8 }, moodlet: { id: 'ferris', label: 'On top of the wheel', emoji: '🎡', value: 10, minutes: 120 }, tags: ['fun', 'landmark'] },
  { id: 'rollerCoaster', label: 'Ride the roller coaster', emoji: '🎢', seconds: 8, cost: 1_500, needs: { fun: 50, energy: -6, bladder: -10 }, moodlet: { id: 'coaster', label: 'Adrenaline!', emoji: '🎢', value: 14, minutes: 90 }, tags: ['fun', 'landmark'] },
  { id: 'carnivalGames', label: 'Play carnival games', emoji: '🎯', seconds: 9, cost: 800, needs: { fun: 28 }, skill: { key: 'streetSmarts', gain: 0.2 }, tags: ['fun'] },
  { id: 'funnelCake', label: 'Funnel cake', emoji: '🍰', seconds: 5, cost: 900, needs: { hunger: 30, fun: 10 }, tags: ['eat'] },
  { id: 'catchGame', label: 'Catch a game', emoji: '🏀', seconds: 14, cost: 6_500, needs: { fun: 50, social: 25, hunger: -8 }, tags: ['landmark', 'fun', 'nightlife'] },

  // ---------- Life paths (data/paths.ts) ----------
  // Crime: kept vague on purpose (it's a cartoon, 21+). Risky ones can get you busted.
  { id: 'streetDeal', label: 'Move a package for the crew', emoji: '📦', seconds: 10, needs: { energy: -6, fun: 4 }, pay: (s) => 3_000 + 1_500 * lvl(s, 'streetSmarts'), skill: { key: 'streetSmarts', gain: 0.4 }, path: { id: 'crime', minLevel: 1 }, risk: 0.04, tags: ['crime', 'earn'] },
  { id: 'collectDebt', label: 'Collect what you’re owed', emoji: '💰', seconds: 12, needs: { energy: -8, social: -4 }, pay: (s) => 6_000 + 2_500 * lvl(s, 'hustle'), skill: { key: 'hustle', gain: 0.4 }, path: { id: 'crime', minLevel: 2 }, risk: 0.06, tags: ['crime', 'earn'] },
  { id: 'betrayCrew', label: 'Sell out someone who trusted you', emoji: '🐍', seconds: 8, needs: { social: -30, fun: -10 }, moodlet: { id: 'betrayer', label: 'Watching your back', emoji: '🐍', value: -18, minutes: 60 * 12 }, path: { id: 'crime', minLevel: 5 }, risk: 0.15, tags: ['crime', 'betrayal'] },
  // CEO
  { id: 'pitchInvestors', label: 'Pitch investors', emoji: '📊', seconds: 14, needs: { energy: -10, social: 8 }, skill: { key: 'charisma', gain: 0.5 }, path: { id: 'ceo', minLevel: 1 }, tags: ['ceo', 'skill'] },
  { id: 'dumpWaste', label: 'Quietly dump waste in the river', emoji: '🛢️', seconds: 8, needs: { fun: -10 }, pay: 40_000, moodlet: { id: 'guilt', label: 'People are getting sick', emoji: '😷', value: -15, minutes: 60 * 12 }, path: { id: 'ceo', minLevel: 5 }, risk: 0.2, tags: ['ceo', 'illegal'] },
  { id: 'bribeCops', label: 'Pay off an investigator', emoji: '🤫', seconds: 6, cost: 30_000, path: { id: 'ceo', minLevel: 5 }, risk: 0.25, tags: ['ceo', 'illegal'] },
  // Celebrity
  { id: 'postContent', label: 'Post content', emoji: '📸', seconds: 8, needs: { fun: 8, social: 6, energy: -3 }, skill: { key: 'charisma', gain: 0.2 }, path: { id: 'celebrity', minLevel: 1 }, tags: ['celebrity', 'online'] },

  // ---------- Transit ----------
  { id: 'subwayShowtime', label: 'Watch the Showtime dancers', emoji: '🕺', seconds: 6, needs: { fun: 16 }, tags: ['fun'] },
  { id: 'tipPerformer', label: 'Tip the performer $5', emoji: '💵', seconds: 2, cost: 500, needs: { fun: 6, social: 6 }, moodlet: { id: 'goodDeed', label: 'Supported local art', emoji: '💛', value: 6, minutes: 60 }, tags: ['social'] },
];

export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(LIST.map((a) => [a.id, a]));

/** Is this action available right now (time window and skill)? Returns a reason if not. */
export function actionLock(a: ActionDef, s: GameState, hour: number): string | null {
  if (a.requires && Math.floor(s.skills[a.requires.skill]) < a.requires.level) {
    return `Needs ${a.requires.skill} ${a.requires.level}`;
  }
  if (a.hours) {
    const [from, to] = a.hours;
    const open = from <= to ? hour >= from && hour < to : hour >= from || hour < to;
    if (!open) return `From ${fmtHour(from)}`;
  }
  if (a.path) {
    const p = s.paths.active === a.path.id ? s.paths.levels[a.path.id] ?? 1 : 0;
    if (p < a.path.minLevel) return p ? `${a.path.id === 'ceo' ? 'CEO' : a.path.id} level ${a.path.minLevel}` : 'Join this path first';
  }
  if (a.cost && s.money < a.cost) return 'Not enough cash';
  return null;
}

export function fmtHour(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? 'AM' : 'PM'}`;
}
