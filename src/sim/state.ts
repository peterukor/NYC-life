// =====================================================================
// state.ts — creating a brand-new life.
// =====================================================================

import { HUSTLER_LOAN, SAVE_VERSION, START_MONEY } from '../core/constants.ts';
import { nowMs, nycTime } from '../core/clock.ts';
import { doorOf, PLACE_BY_ID } from '../data/places.ts';
import { starterWardrobe, type SpawnClass } from '../data/wardrobe.ts';
import { NEED_KEYS, SKILL_KEYS, type GameState, type Look, type NeedKey, type Origin, type SkillKey } from './types.ts';

export interface NewLifeOptions {
  name: string;
  origin: Origin;
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
  const home = PLACE_BY_ID.hkStudio;
  const door = doorOf(home);

  const needs = Object.fromEntries(NEED_KEYS.map((k) => [k, 80])) as Record<NeedKey, number>;
  const skills = Object.fromEntries(SKILL_KEYS.map((k) => [k, 0])) as Record<SkillKey, number>;

  const trust = opts.origin === 'trustFund';
  // Origins map onto spawn classes for now (poor/middle/upper/wealthy);
  // the full class pick comes with the new character screen.
  const spawnClass: SpawnClass = trust ? 'upper' : 'poor';
  const l = opts.look;
  const wearing = [l.hairStyle, l.topId, l.bottomId, l.shoesId, l.hatId, l.extraId].filter((x): x is string => !!x);
  if (trust) skills.charisma = 2;
  else {
    skills.hustle = 2;
    skills.streetSmarts = 2;
  }

  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastTick: now,
    profile: { name: opts.name, origin: opts.origin, traits: opts.traits, look: opts.look, birthYear: opts.birthYear, spawnClass },
    wardrobe: starterWardrobe(spawnClass, wearing, Math.random),
    money: trust ? 150_000 : START_MONEY.hustler,
    bank: trust ? START_MONEY.trustFund : 0,
    ledger: [],
    loan: trust ? null : { owed: HUSTLER_LOAN.owed, weekly: HUSTLER_LOAN.weekly, lastPaidDay: today },
    needs,
    moodlets: [],
    skills,
    job: null,
    home: { area: 'manhattan', placeId: home.id, weeklyRent: trust ? 0 : home.rent ?? 0, rentDueDay: today },
    // Start inside the apartment.
    location: { area: 'manhattan', placeId: home.id, x: door.x, z: door.z },
    phone: { ok: true },
    stats: { actionsDone: {}, placesVisited: [home.id], eventsSeen: {}, scamsFallenFor: 0, scamsSpotted: 0, earnedToday: 0, dayKey: today },
    events: { lastFiredAt: now, cooldowns: {} },
    homes: {},
    auto: { on: false, routine: [], since: 0 },
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
