// =====================================================================
// careers.ts — jobs, their ladders and pay.
//
// Pay is per shift, in cents. A shift is a short real-time task you do
// at the workplace (see sim/work.ts). Promotions come from performance
// plus the skill each career cares about.
// =====================================================================

import type { SkillKey } from '../sim/types.ts';

export interface CareerDef {
  id: string;
  name: string;
  emoji: string;
  /** Where you go to work (a place id from places.ts). */
  placeId: string;
  skill: SkillKey;
  blurb: string;
  /** Minimum skill to be hired at the first rung, if any. */
  requires?: { skill: SkillKey; level: number };
  ladder: { title: string; pay: number }[];
  /** Shift hours (New York time) [from, to), past midnight allowed. Default: 6 AM to 11 PM. */
  hours?: [number, number];
  /**
   * What a shift pays at the first rung (cents): `auto` (30 s, the lowest)
   * and `max` (a great played shift). Raises scale both by the ladder.
   * Tip jobs start lower with more upside; skilled jobs start higher.
   * `rep`: what a played shift adds to your 🔥 street or 💼 corporate rep.
   */
  shift: { auto: number; max: number; rep?: { kind: 'street' | 'corporate'; max: number } };
}

export const CAREERS: CareerDef[] = [
  // The eight careers (Peter, 2026-10-13). Each ladder has 6 rungs: you
  // start on the first and win the other 5 by asking for raises
  // (sim/raise.ts). Each workplace has its own room (data/venues.ts →
  // WORKPLACE_LAYOUT_FOR). Job-specific twists live in sim/job-perks.ts.
  {
    // The starter job: round the corner from the walk-up. Pay is the
    // 4-hour base wage; tips come from how well you work the counter
    // (sim/shift.ts). (Its id stays 'deli' so old saves keep working.)
    id: 'deli',
    name: 'Bodega',
    emoji: '🏪',
    placeId: 'barrioDeli',
    shift: { auto: 3_000, max: 9_000, rep: { kind: 'street', max: 1 } },
    skill: 'hustle',
    blurb: 'Work the counter at El Barrio Deli & Grill: build the orders right, keep the line moving, earn the tips.',
    ladder: [
      { title: 'Counter Hand', pay: 6_600 },
      { title: 'Sandwich Maker', pay: 8_800 },
      { title: 'Grill Cook', pay: 11_500 },
      { title: 'Shift Lead', pay: 15_000 },
      { title: 'Night Manager', pay: 19_500 },
      { title: 'Partner', pay: 25_000 },
    ],
  },
  {
    id: 'bartender',
    name: 'Bartending',
    emoji: '🍸',
    placeId: 'theStoop',
    shift: { auto: 2_500, max: 10_000, rep: { kind: 'street', max: 2 } },
    hours: [15, 4],
    skill: 'charisma',
    blurb: 'East Village bar with a stoop out front. Pour drinks, read the room, keep the regulars happy. Tips double after 10 PM.',
    ladder: [
      { title: 'Barback', pay: 9_000 },
      { title: 'Bartender', pay: 12_500 },
      { title: 'Head Bartender', pay: 17_000 },
      { title: 'Bar Manager', pay: 23_000 },
      { title: 'Mixologist', pay: 31_000 },
      { title: 'Bar Owner', pay: 44_000 },
    ],
  },
  {
    id: 'trainer',
    name: 'Fitness',
    emoji: '🏋️',
    placeId: 'ironGym',
    shift: { auto: 3_000, max: 9_000, rep: { kind: 'street', max: 1 } },
    skill: 'fitness',
    blurb: 'Early mornings coaching at Iron Hell’s Kitchen. Get strong, get clients, get asked about protein.',
    requires: { skill: 'fitness', level: 1 },
    ladder: [
      { title: 'Front Desk', pay: 8_000 },
      { title: 'Personal Trainer', pay: 12_500 },
      { title: 'Class Coach', pay: 17_000 },
      { title: 'Head Coach', pay: 23_000 },
      { title: 'Gym Manager', pay: 31_000 },
      { title: 'Fitness Mogul', pay: 48_000 },
    ],
  },
  {
    id: 'tech',
    name: 'Tech',
    emoji: '💻',
    placeId: 'dumboWorks',
    shift: { auto: 4_500, max: 12_000, rep: { kind: 'corporate', max: 2 } },
    skill: 'coding',
    blurb: 'Startup office in an old Chelsea factory. Ship features, survive standups. Perks: freelance gigs pay 30%+ more, and you can work from home once a day.',
    requires: { skill: 'coding', level: 2 },
    ladder: [
      { title: 'Junior Developer', pay: 20_000 },
      { title: 'Developer', pay: 27_000 },
      { title: 'Senior Developer', pay: 36_000 },
      { title: 'Staff Engineer', pay: 48_000 },
      { title: 'Principal Engineer', pay: 64_000 },
      { title: 'CTO', pay: 90_000 },
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    emoji: '📈',
    placeId: 'midtownTower',
    shift: { auto: 5_000, max: 13_500, rep: { kind: 'corporate', max: 3 } },
    skill: 'charisma',
    blurb: 'A trading floor on Sixth Avenue: screens, shouting and a vest. Perks: lower fees on your own trades, and desk chatter about tomorrow’s market.',
    requires: { skill: 'charisma', level: 2 },
    ladder: [
      { title: 'Analyst', pay: 22_000 },
      { title: 'Associate', pay: 30_000 },
      { title: 'Vice President', pay: 40_000 },
      { title: 'Director', pay: 54_000 },
      { title: 'Managing Director', pay: 72_000 },
      { title: 'Partner', pay: 95_000 },
    ],
  },
  {
    id: 'dancer',
    name: 'Night Dancer',
    emoji: '🌙',
    placeId: 'velvetRoom',
    shift: { auto: 2_000, max: 11_000, rep: { kind: 'street', max: 3 } },
    hours: [20, 4],
    skill: 'fitness',
    blurb: 'Perform at the Velvet Room in Midtown. Cash tips every show. Rowdy customers sometimes start fights; fit dancers win them, the very strongest scare the tippers.',
    ladder: [
      { title: 'Newcomer', pay: 9_000 },
      { title: 'Regular', pay: 12_500 },
      { title: 'Featured Dancer', pay: 17_000 },
      { title: 'Headliner', pay: 23_000 },
      { title: 'Star of the Club', pay: 31_000 },
      { title: 'Club Legend', pay: 42_000 },
    ],
  },
  {
    id: 'pharmacist',
    name: 'Alley Pharmacist',
    emoji: '💊',
    placeId: 'theAlley',
    shift: { auto: 4_000, max: 12_000, rep: { kind: 'street', max: 3 } },
    hours: [0, 24],
    skill: 'streetSmarts',
    blurb: 'Sell five made-up products from a Lower East Side alley. Fast money; every sale raises your heat with the police.',
    ladder: [
      { title: 'Corner Kid', pay: 12_000 },
      { title: 'Runner', pay: 16_000 },
      { title: 'Supplier', pay: 21_000 },
      { title: 'Block Boss', pay: 28_000 },
      { title: 'Plug', pay: 37_000 },
      { title: 'Kingpin', pay: 50_000 },
    ],
  },
  {
    id: 'cop',
    name: 'Cop',
    emoji: '🚓',
    placeId: 'precinct',
    shift: { auto: 4_000, max: 9_000, rep: { kind: 'corporate', max: 1 } },
    hours: [0, 24],
    skill: 'streetSmarts',
    blurb: 'Patrol out of the 18th Precinct. Stay honest, or take the envelopes: corruption pays more until Internal Affairs notices.',
    requires: { skill: 'fitness', level: 1 },
    ladder: [
      { title: 'Officer', pay: 14_000 },
      { title: 'Senior Officer', pay: 18_000 },
      { title: 'Detective', pay: 24_000 },
      { title: 'Sergeant', pay: 31_000 },
      { title: 'Lieutenant', pay: 40_000 },
      { title: 'Captain', pay: 52_000 },
    ],
  },
];

/** Careers that were removed (2026-10-13), and where those workers went. */
export const RETIRED_CAREERS: Record<string, string> = { bodega: 'deli', barista: 'deli', cook: 'deli' };

export const CAREER_BY_ID: Record<string, CareerDef> = Object.fromEntries(CAREERS.map((c) => [c.id, c]));
