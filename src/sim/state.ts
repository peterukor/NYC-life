// =====================================================================
// state.ts — creating a brand-new life.
// =====================================================================

import { newGarageState } from './garage.ts';
import { newGangState } from './gangs.ts';
import { HUSTLER_LOAN, SAVE_VERSION } from '../core/constants.ts';
import { nowMs, nycTime } from '../core/clock.ts';
import { doorOf, PLACE_BY_ID } from '../data/places.ts';
import { starterWardrobe, type SpawnClass } from '../data/wardrobe.ts';
import { newPathsState } from './paths.ts';
import { newBusinessState } from './business.ts';
import { NEED_KEYS, SKILL_KEYS, type GameState, type Look, type NeedKey, type Origin, type SkillKey } from './types.ts';

export interface NewLifeOptions {
  name: string;
  origin: Origin;
  /** Social class you're born into (decides money, home and clothes). Defaults from origin. */
  spawnClass?: SpawnClass;
  look: Look;
  birthYear: number;
  traits: string[];
}

/** The two starting stories, shown on the character screen. */
export const ORIGINS: Record<Origin, { title: string; emoji: string; tagline: string; perks: string[] }> = {
  trustFund: {
    title: 'Trust Fund Kid',
    emoji: '💳',
    tagline: 'Dad “knows a guy”.',
    perks: ['$25,000 in the bank', 'Hell’s Kitchen studio — rent paid by Dad', 'Charisma starts at 2', 'Finance internship offer waiting'],
  },
  hustler: {
    title: 'Hustler',
    emoji: '🗽',
    tagline: 'Came with a duffel bag and a dream.',
    perks: ['$600 cash + a $12,000 student loan ($150/week)', 'Hustle and Street Smarts start at 2', 'Learn every skill 25% faster', 'Same studio — but you pay the rent'],
  },
};

/**
 * The four classes you can be born into (the rare billionaire tier is
 * capped at 15 citywide and needs the server, so it isn't pickable yet).
 * Each says how much money you start with, any debt, where you live,
 * who pays the rent, and your starting skills.
 */
export const CLASSES: Record<SpawnClass, {
  title: string;
  emoji: string;
  tagline: string;
  perks: string[];
  cash: number;
  bank: number;
  loan: boolean;
  homeId: string;
  rentPaid: boolean;
  origin: Origin;
  skills: Partial<Record<SkillKey, number>>;
}> = {
  poor: {
    title: 'Broke & Hungry', emoji: '🎒', tagline: 'Came with a duffel bag and a dream.',
    perks: ['$300 cash + a $12,000 student loan', 'Room in a shared Brooklyn apartment', 'Hustle and Street Smarts start at 2', 'Learn every skill 25% faster', '5 plain outfits'],
    cash: 30_000, bank: 0, loan: true, homeId: 'sharedApt', rentPaid: false, origin: 'hustler', skills: { hustle: 2, streetSmarts: 2 },
  },
  middle: {
    title: 'Regular New Yorker', emoji: '🗽', tagline: 'Steady, normal, ready to level up.',
    perks: ['$1,500 cash + $4,000 saved', 'Hell’s Kitchen studio (you pay rent)', 'Hustle and Charisma start at 1', '6 plain + 2 premium outfits'],
    cash: 150_000, bank: 400_000, loan: false, homeId: 'hkStudio', rentPaid: false, origin: 'hustler', skills: { hustle: 1, charisma: 1 },
  },
  upper: {
    title: 'Trust Fund Kid', emoji: '💳', tagline: 'Dad “knows a guy”.',
    perks: ['$25,000 in the bank', 'Hell’s Kitchen studio, rent paid by Dad', 'Charisma starts at 2', '10 plain + 5 premium + 1 exclusive outfits'],
    cash: 150_000, bank: 2_500_000, loan: false, homeId: 'hkStudio', rentPaid: true, origin: 'trustFund', skills: { charisma: 2 },
  },
  wealthy: {
    title: 'Old Money', emoji: '🥂', tagline: 'Your family name is on a museum wing.',
    perks: ['$250,000 in the bank', 'Brooklyn loft, rent paid by the family', 'Charisma 3, but no street smarts', '15 premium + 5 exclusive outfits'],
    cash: 500_000, bank: 25_000_000, loan: false, homeId: 'wburgLoft', rentPaid: true, origin: 'trustFund', skills: { charisma: 3 },
  },
};

export const TRAITS: Record<string, { label: string; emoji: string; desc: string; skill?: SkillKey }> = {
  nightOwl: { label: 'Night Owl', emoji: '🦉', desc: 'Nightlife hits harder; mornings hit you harder.' },
  foodie: { label: 'Foodie', emoji: '🍜', desc: 'Food is extra fun. Cooking grows faster.', skill: 'cooking' },
  gymRat: { label: 'Gym Rat', emoji: '💪', desc: 'Fitness grows faster.', skill: 'fitness' },
  smoothTalker: { label: 'Smooth Talker', emoji: '😎', desc: 'Charisma grows faster.', skill: 'charisma' },
  techie: { label: 'Techie', emoji: '🤓', desc: 'Coding grows faster.', skill: 'coding' },
  streetwise: { label: 'Streetwise', emoji: '🧠', desc: 'Spots scams faster. Street Smarts grows faster.', skill: 'streetSmarts' },
  musician: { label: 'Musician', emoji: '🎶', desc: 'Music grows faster.', skill: 'music' },
};

export function newLife(opts: NewLifeOptions): GameState {
  const now = nowMs();
  const today = nycTime(now).dateKey;
  const spawnClass: SpawnClass = opts.spawnClass ?? (opts.origin === 'trustFund' ? 'upper' : 'poor');
  const cls = CLASSES[spawnClass];
  const home = PLACE_BY_ID[cls.homeId] ?? PLACE_BY_ID.hkStudio;
  const door = doorOf(home);

  const needs = Object.fromEntries(NEED_KEYS.map((k) => [k, 80])) as Record<NeedKey, number>;
  const skills = Object.fromEntries(SKILL_KEYS.map((k) => [k, 0])) as Record<SkillKey, number>;

  const l = opts.look;
  const wearing = [l.hairStyle, l.topId, l.bottomId, l.shoesId, l.hatId, l.extraId].filter((x): x is string => !!x);
  for (const [k, v] of Object.entries(cls.skills)) skills[k as SkillKey] = v;

  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastTick: now,
    profile: { name: opts.name, origin: cls.origin, traits: opts.traits, look: opts.look, birthYear: opts.birthYear, spawnClass },
    wardrobe: starterWardrobe(spawnClass, wearing, Math.random),
    money: cls.cash,
    bank: cls.bank,
    ledger: [],
    loan: cls.loan ? { owed: HUSTLER_LOAN.owed, weekly: HUSTLER_LOAN.weekly, lastPaidDay: today } : null,
    needs,
    moodlets: [],
    skills,
    job: null,
    home: { area: home.area, placeId: home.id, weeklyRent: cls.rentPaid ? 0 : home.rent ?? 0, rentDueDay: today },
    // Start inside your home.
    location: { area: home.area, placeId: home.id, x: door.x, z: door.z },
    phone: { ok: true },
    stats: { actionsDone: {}, placesVisited: [home.id], eventsSeen: {}, scamsFallenFor: 0, scamsSpotted: 0, earnedToday: 0, dayKey: today },
    events: { lastFiredAt: now, cooldowns: {} },
    homes: {},
    auto: { on: false, routine: [], since: 0 },
    portfolio: {},
    paths: newPathsState(),
    business: newBusinessState(),
    debt: null,
    record: { bankruptcies: 0 },
    jail: null,
    garage: newGarageState(),
    gang: newGangState(),
    people: {},
    joinedEvents: [],
    news: [],
    tutorialStep: 0,
    settings: { quality: 'auto', sound: true },
  };
}

/** Skill learning speed: Hustlers learn 25% faster; matching traits add 50%. */
export function skillGainMultiplier(s: GameState, key: SkillKey): number {
  let m = s.profile.origin === 'hustler' ? 1.25 : 1;
  for (const t of s.profile.traits) if (TRAITS[t]?.skill === key) m *= 1.5;
  return m;
}
