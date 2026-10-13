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
}

export const CAREERS: CareerDef[] = [
  {
    id: 'barista',
    name: 'Coffee',
    emoji: '☕',
    placeId: 'beanMachine',
    skill: 'charisma',
    blurb: 'Pull shots for Hell’s Kitchen regulars. Remember the orders, earn the tips.',
    ladder: [
      { title: 'Barista', pay: 9_000 },
      { title: 'Shift Lead', pay: 13_500 },
      { title: 'Café Manager', pay: 19_000 },
      { title: 'Roaster', pay: 26_000 },
      { title: 'Café Owner', pay: 38_000 },
    ],
  },
  {
    id: 'bodega',
    name: 'Bodega',
    emoji: '🏪',
    placeId: 'bodegaHk',
    skill: 'hustle',
    blurb: 'Behind the counter making chopped cheese at 2 AM. Everyone knows your name.',
    ladder: [
      { title: 'Counter Clerk', pay: 8_000 },
      { title: 'Grill Master', pay: 12_000 },
      { title: 'Night Manager', pay: 17_000 },
      { title: 'Partner', pay: 25_000 },
      { title: 'Bodega Empire', pay: 40_000 },
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    emoji: '📈',
    placeId: 'midtownTower',
    skill: 'charisma',
    blurb: 'Sixth Avenue tower, spreadsheets, and a Patagonia vest. Charisma closes deals.',
    requires: { skill: 'charisma', level: 2 },
    ladder: [
      { title: 'Analyst', pay: 22_000 },
      { title: 'Associate', pay: 32_000 },
      { title: 'Vice President', pay: 46_000 },
      { title: 'Director', pay: 64_000 },
      { title: 'Managing Director', pay: 95_000 },
    ],
  },
  {
    id: 'tech',
    name: 'Tech',
    emoji: '💻',
    placeId: 'dumboWorks',
    skill: 'coding',
    blurb: 'Startup office in an old Chelsea factory. Ship features, survive standups.',
    requires: { skill: 'coding', level: 2 },
    ladder: [
      { title: 'Junior Developer', pay: 20_000 },
      { title: 'Developer', pay: 30_000 },
      { title: 'Senior Developer', pay: 44_000 },
      { title: 'Staff Engineer', pay: 60_000 },
      { title: 'CTO', pay: 90_000 },
    ],
  },
  {
    id: 'cook',
    name: 'Pizza',
    emoji: '🍕',
    placeId: 'sliceJoint',
    skill: 'cooking',
    blurb: 'Toss dough at the slice joint. Master the fold, own the oven.',
    ladder: [
      { title: 'Dough Tosser', pay: 8_500 },
      { title: 'Line Cook', pay: 12_500 },
      { title: 'Pizzaiolo', pay: 18_000 },
      { title: 'Head Chef', pay: 27_000 },
      { title: 'Pizza Legend', pay: 42_000 },
    ],
  },
  {
    id: 'bartender',
    name: 'Bartending',
    emoji: '🍸',
    placeId: 'theStoop',
    skill: 'charisma',
    blurb: 'East Village bar with a stoop out front. Shake cocktails, keep the regulars happy.',
    ladder: [
      { title: 'Barback', pay: 9_000 },
      { title: 'Bartender', pay: 14_000 },
      { title: 'Head Bartender', pay: 20_000 },
      { title: 'Bar Manager', pay: 28_000 },
      { title: 'Bar Owner', pay: 44_000 },
    ],
  },
  {
    id: 'trainer',
    name: 'Fitness',
    emoji: '🏋️',
    placeId: 'ironGym',
    skill: 'fitness',
    blurb: 'Early mornings coaching at Iron Hell’s Kitchen. Get strong, get clients.',
    requires: { skill: 'fitness', level: 1 },
    ladder: [
      { title: 'Front Desk', pay: 8_000 },
      { title: 'Personal Trainer', pay: 15_000 },
      { title: 'Head Coach', pay: 22_000 },
      { title: 'Gym Manager', pay: 30_000 },
      { title: 'Fitness Mogul', pay: 48_000 },
    ],
  },
];

export const CAREER_BY_ID: Record<string, CareerDef> = Object.fromEntries(CAREERS.map((c) => [c.id, c]));
