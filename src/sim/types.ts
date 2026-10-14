// =====================================================================
// types.ts — the shapes of all the game's data.
//
// `GameState` is the single source of truth for one player's life.
// Everything the player owns or has done lives inside it, and it's what
// gets saved. When multiplayer arrives, the SERVER will own the parts
// that matter (money, bank, job), and the browser will only hold a copy.
// =====================================================================

export type NeedKey = 'hunger' | 'energy' | 'fun' | 'social' | 'hygiene' | 'bladder';
export const NEED_KEYS: readonly NeedKey[] = ['hunger', 'energy', 'fun', 'social', 'hygiene', 'bladder'];

export type SkillKey = 'charisma' | 'hustle' | 'fitness' | 'cooking' | 'coding' | 'music' | 'streetSmarts';
export const SKILL_KEYS: readonly SkillKey[] = ['charisma', 'hustle', 'fitness', 'cooking', 'coding', 'music', 'streetSmarts'];

/** The two ways to start a life (NYC take on Lagos Life's Nepo / LAPO). */
export type Origin = 'trustFund' | 'hustler';

/** City areas that are built right now. More boroughs slot in later. */
export type AreaId = 'manhattan' | 'brooklyn' | 'bronx' | 'queens';
/** Every playable area, in map order (add new boroughs here). */
export const AREA_IDS: AreaId[] = ['manhattan', 'brooklyn', 'bronx', 'queens'];
/**
 * The areas you can actually go to right now. Peter, 2026-10-12: "focus on
 * only Manhattan" — the other boroughs are switched off (still drawn at the
 * edges of the map, but no travel, places or plots there). Add an area back
 * here to reopen it; its code and data are all still in place.
 */
export const OPEN_AREAS: AreaId[] = ['manhattan'];
export const isOpenArea = (a: AreaId): boolean => OPEN_AREAS.includes(a);

/**
 * How a character looks. The colours are always set; the clothing ids
 * are optional so older saves still load (missing = the starter outfit,
 * see data/wardrobe.ts → outfitDefaults).
 */
export interface Look {
  body: 'm' | 'f';
  skin: string;
  /** Colour of the top (shirt, jacket, dress). */
  top: string;
  /** Colour of the trousers/shorts/skirt. */
  bottom: string;
  /** Hair colour. */
  hair: string;
  /** Clothing ids from data/wardrobe.ts. */
  hairStyle?: string;
  topId?: string;
  /** Second top colour: the shirt you see under an open jacket. */
  topInner?: string;
  bottomId?: string;
  shoesId?: string;
  shoes?: string;
  hatId?: string;
  hat?: string;
  extraId?: string;
  extra?: string;
}

/** A temporary mood effect, like "Showtime!" (+15) or "Phone snatched" (-30). */
export interface Moodlet {
  id: string;
  label: string;
  emoji: string;
  value: number;
  /** Real time (ms) when it wears off. */
  expiresAt: number;
}

/** One line in the money history. Every money change creates one. */
export interface LedgerEntry {
  at: number;
  delta: number;
  balance: number;
  reason: string;
}

export interface JobState {
  careerId: string;
  /** 0-based index into the career's ladder. */
  level: number;
  /** 0-100; rises with good shifts, falls with bad ones. */
  performance: number;
  shiftsAtLevel: number;
  shiftsTotal: number;
  /** Shifts done today, reset at New York midnight. */
  shiftsToday: number;
  /** 💻 Tech perk: the NYC day you last worked from home (once a day). */
  remoteDay?: string;
  dayKey: string;
}

export interface NewsItem {
  id: string;
  at: number;
  scope: 'city' | AreaId;
  headline: string;
  body?: string;
  emoji: string;
  /** True for stories created by things the player did. */
  personal?: boolean;
}

export interface GameState {
  version: number;
  createdAt: number;
  /** Real time (ms) the simulation last advanced to. */
  lastTick: number;

  profile: { name: string; origin: Origin; traits: string[]; look: Look; birthYear: number; /** poor | middle | rich | billionaire (see sim/state.ts → CLASSES). */ spawnClass?: 'poor' | 'middle' | 'rich' | 'billionaire' };
  /** Clothing ids you own (data/wardrobe.ts). */
  wardrobe: string[];
  /** 🔥 Street rep and 💼 corporate rep (sim/rep.ts). Old saves: missing. */
  rep?: { street: number; corporate: number };
  /** 💊 Pharmacist heat with the police, and when it was last set (sim/job-perks.ts). */
  heat?: { value: number; at: number };
  /** 🚓 Cop corruption exposure, 0–100 (sim/job-perks.ts). */
  exposure?: number;
  /** A stain on your clothes (subway spill) until you change (sim/commute.ts). */
  stained?: boolean;
  /** Groceries, leftovers and InstaDash orders (sim/kitchen.ts). Old saves: missing. */
  kitchen?: import('./kitchen.ts').KitchenState;
  /** Saved outfits in the closet (4 slots; null = empty). */
  outfits?: (Look | null)[];
  /** Life paths (Crime Boss, CEO, Celebrity): see sim/paths.ts. */
  paths: import('./paths.ts').PathsState;
  /** Businesses you own, staff, and tax status: see sim/business.ts. */
  business: import('./business.ts').BusinessState;
  /** Investments: stock id → shares owned and what you paid in total (cents). */
  portfolio: Record<string, { shares: number; cost: number }>;
  /** Auto mode: the routine your character follows while you're away (sim/auto.ts). */
  auto: { on: boolean; routine: string[]; since: number; blues?: { dayKey: string; today: string[]; variedDays: number } };

  /** Cash on hand, in cents. Change ONLY through sim/economy.ts. */
  money: number;
  /** Money in the bank (safe from robbery and scams), in cents. */
  bank: number;
  ledger: LedgerEntry[];
  loan: { owed: number; weekly: number; lastPaidDay: string } | null;
  /** Unpaid bills in collections (hospital etc.): see sim/debt.ts. */
  debt: import('./debt.ts').DebtState | null;
  /** Your permanent record: bankruptcies, arrests, jail time (sim/debt.ts, sim/jail.ts). */
  record: { bankruptcies: number; lastBankruptcy?: string; arrests?: number; jailDays?: number };
  /** Jail: while `until` (real ms) is in the future you're locked up (sim/jail.ts). */
  jail: import('./jail.ts').JailState | null;
  /** Cars you own, your licence and your Cool rating (sim/garage.ts). */
  garage: import('./garage.ts').GarageState;
  /** Which city layout the saved positions belong to (2 = real borough shapes). */
  layoutVersion?: number;
  /** City events you've already joined (data/city-events.ts keys). */
  joinedEvents: string[];
  /** People you've met and what they remember about you (sim/people.ts). */
  people: Record<string, import('./people.ts').Memory>;
  /** Your crew and standing with every crew in the city (sim/gangs.ts). */
  gang: import('./gangs.ts').GangState;

  needs: Record<NeedKey, number>;
  moodlets: Moodlet[];
  skills: Record<SkillKey, number>;

  job: JobState | null;
  home: { area: AreaId; placeId: string; weeklyRent: number; rentDueDay: string; /** Penthouse: the day the housekeeper last cleaned (NYC date). */ cleanedDay?: string };

  /** Where the player is: which area, which building (null = outside), and street position. */
  location: { area: AreaId; placeId: string | null; x: number; z: number };

  /** Has a working phone? Losing it (scams, snatching) disables some apps until replaced. */
  phone: { ok: boolean; lostReason?: string };

  stats: {
    actionsDone: Record<string, number>;
    placesVisited: string[];
    eventsSeen: Record<string, number>;
    scamsFallenFor: number;
    scamsSpotted: number;
    earnedToday: number;
    dayKey: string;
  };

  events: { lastFiredAt: number; cooldowns: Record<string, number> };
  /** Each home's furniture arrangement, by home place id (see data/homes.ts). */
  homes: Record<string, { uid: string; item: string; x: number; z: number; rot: number }[]>;
  /** Furniture you own that isn't placed anywhere (item ids). */
  storage?: string[];
  /** A shift you've clocked in for and not been paid for yet (sim/shift.ts). */
  shift?: import('./shift.ts').ShiftSession | null;
  /** What you're doing right now at home (sim/home-activity.ts), if anything. */
  activity?: import('./home-activity.ts').Activity | null;
  news: NewsItem[];
  tutorialStep: number;
  settings: { quality: 'auto' | 'low' | 'medium' | 'high'; sound: boolean };
}
