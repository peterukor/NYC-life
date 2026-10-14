// =====================================================================
// paths.ts — the big life ladders: Crime Boss, CEO and Celebrity.
//
// Each path has 7 levels (Celebrity tops out at 6). To climb you need
// REP (it builds fast early and very, very slowly later — see repCurve)
// plus a short checklist of varied tasks. The checklist is picked at
// random for each player and level (seeded, so it doesn't change when
// you reload), which stops bots from farming one action.
//
// Difficulty follows the owner's curve: 1–2 easy, 2–3 okay, 3–4 kinda
// hard, 4–5 very hard, 5–6 about two weeks of steady play, 6–7 hard
// but possible. Special gates: Crime 5→6 and 6→7 need betrayals; CEO
// 5+ unlocks optional illegal shortcuts; Celebrity 6 needs a 3-week
// streak of keeping a borough entertained without repeating yourself.
//
// TO ADD A PATH or tune one: edit this file. Rep comes from the actions
// listed in `rep` (action id → rep per use).
// =====================================================================

import { Registry } from '../core/registry.ts';
import type { SkillKey } from '../sim/types.ts';

/** One task in a level-up checklist. */
export type PathTask =
  | { kind: 'action'; action: string; times: number; label: string }
  | { kind: 'skill'; skill: SkillKey; level: number; label: string }
  | { kind: 'netWorth'; cents: number; label: string }
  | { kind: 'places'; count: number; label: string }
  | { kind: 'activeDays'; days: number; label: string }
  | { kind: 'betrayals'; count: number; label: string }
  | { kind: 'streak'; days: number; label: string };

export interface PathDef {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  titles: string[];
  /** Rep needed to reach each level (index = level - 1). */
  repCurve: number[];
  /** Action id → rep earned per use (only while on this path). */
  rep: Record<string, number>;
  /** Pool of tasks per level transition (index = level being reached - 2). How many to pick: `pick`. */
  tasks: { pick: number; pool: PathTask[]; fixed?: PathTask[] }[];
  /** Warning shown before joining. */
  warning?: string;
}

const T = {
  act: (action: string, times: number, label: string): PathTask => ({ kind: 'action', action, times, label }),
  skill: (skill: SkillKey, level: number, label: string): PathTask => ({ kind: 'skill', skill, level, label }),
  worth: (cents: number, label: string): PathTask => ({ kind: 'netWorth', cents, label }),
  places: (count: number, label: string): PathTask => ({ kind: 'places', count, label }),
  days: (days: number, label: string): PathTask => ({ kind: 'activeDays', days, label }),
};

export const PATHS = new Registry<PathDef>('life path');

PATHS.add(
  {
    id: 'crime',
    name: 'Crime Boss',
    emoji: '🕶️',
    blurb: 'Run a crew, move packages, collect what you’re owed. The higher you climb, the more cops and rivals watch you.',
    titles: ['Lookout', 'Runner', 'Hustler', 'Lieutenant', 'Captain', 'Underboss', 'Kingpin'],
    repCurve: [0, 40, 140, 380, 900, 2_200, 5_000],
    rep: { streetDeal: 12, collectDebt: 16, betrayCrew: 60, sellOnline: 2 },
    warning: 'This is a crime story (21+). Busts mean fines and jail time. Betrayal is part of the climb.',
    tasks: [
      { pick: 2, pool: [T.act('streetDeal', 3, 'Move 3 packages'), T.skill('streetSmarts', 2, 'Street Smarts 2'), T.places(5, 'Know 5 spots in the city')] },
      { pick: 2, pool: [T.act('streetDeal', 8, 'Move 8 packages'), T.act('collectDebt', 2, 'Collect 2 debts'), T.skill('streetSmarts', 3, 'Street Smarts 3'), T.worth(500_000, 'Net worth $5,000')] },
      { pick: 3, pool: [T.act('collectDebt', 6, 'Collect 6 debts'), T.skill('hustle', 4, 'Hustle 4'), T.worth(2_000_000, 'Net worth $20,000'), T.places(10, 'Know 10 spots'), T.days(4, 'Active on 4 days')] },
      { pick: 3, pool: [T.act('streetDeal', 30, 'Move 30 packages'), T.skill('streetSmarts', 5, 'Street Smarts 5'), T.worth(8_000_000, 'Net worth $80,000'), T.days(7, 'Active on 7 days'), T.skill('fitness', 4, 'Fitness 4')] },
      { pick: 3, fixed: [{ kind: 'betrayals', count: 1, label: 'Betray someone who trusted you' }, T.days(14, 'Two weeks of steady work (14 days)')], pool: [T.act('collectDebt', 25, 'Collect 25 debts'), T.worth(25_000_000, 'Net worth $250,000'), T.skill('charisma', 5, 'Charisma 5')] },
      { pick: 3, fixed: [{ kind: 'betrayals', count: 4, label: 'Betray many (4 in total)' }, T.days(24, 'Active on 24 days')], pool: [T.worth(100_000_000, 'Net worth $1,000,000'), T.skill('streetSmarts', 8, 'Street Smarts 8'), T.act('streetDeal', 120, 'Move 120 packages')] },
    ],
  },
  {
    id: 'ceo',
    name: 'CEO',
    emoji: '💼',
    blurb: 'Pitch, network, build a company. It’s legal, so it’s slower — unless you cut corners at the top.',
    titles: ['Founder', 'Startup CEO', 'Funded CEO', 'Scale-up CEO', 'Unicorn CEO', 'Mogul', 'Titan of Industry'],
    repCurve: [0, 50, 170, 450, 1_100, 2_700, 6_000],
    rep: { pitchInvestors: 14, laptopCafe: 4, freelance: 6, happyHour: 3, codePractice: 2, sellOnline: 3, dumpWaste: 45, bribeCops: 30 },
    warning: 'At the top, you’ll be offered illegal shortcuts. You can always say no.',
    tasks: [
      { pick: 2, pool: [T.act('pitchInvestors', 2, 'Pitch investors twice'), T.skill('coding', 2, 'Coding 2'), T.skill('charisma', 2, 'Charisma 2')] },
      { pick: 2, pool: [T.act('pitchInvestors', 6, 'Pitch 6 times'), T.act('happyHour', 3, 'Network at 3 happy hours'), T.worth(1_000_000, 'Net worth $10,000'), T.skill('coding', 3, 'Coding 3')] },
      { pick: 3, pool: [T.act('pitchInvestors', 15, 'Pitch 15 times'), T.skill('charisma', 4, 'Charisma 4'), T.worth(5_000_000, 'Net worth $50,000'), T.days(5, 'Active on 5 days'), T.places(12, 'Know 12 spots')] },
      { pick: 3, pool: [T.skill('coding', 6, 'Coding 6'), T.skill('charisma', 6, 'Charisma 6'), T.worth(20_000_000, 'Net worth $200,000'), T.days(9, 'Active on 9 days'), T.act('pitchInvestors', 40, 'Pitch 40 times')] },
      { pick: 3, fixed: [T.days(16, 'Two+ weeks of steady work (16 days)')], pool: [T.worth(60_000_000, 'Net worth $600,000'), T.skill('charisma', 7, 'Charisma 7'), T.act('pitchInvestors', 90, 'Pitch 90 times'), T.skill('hustle', 7, 'Hustle 7')] },
      { pick: 3, fixed: [T.days(28, 'Active on 28 days')], pool: [T.worth(300_000_000, 'Net worth $3,000,000'), T.skill('charisma', 9, 'Charisma 9'), T.skill('coding', 9, 'Coding 9')] },
    ],
  },
  {
    id: 'celebrity',
    name: 'Celebrity',
    emoji: '🌟',
    blurb: 'Perform, post, get seen. Level 5 is real fame. Level 6 means a whole borough loves you.',
    titles: ['Nobody', 'Local Character', 'Rising Star', 'Influencer', 'Celebrity', 'Icon'],
    repCurve: [0, 45, 160, 420, 1_300, 4_000],
    rep: { openMic: 10, karaoke: 6, busk: 7, photoSelfie: 1, dancefloor: 4, catchGame: 3, guitar: 2, postContent: 9 },
    warning: 'Fame has a dark side. Some doors only open if you’re willing to do bad things (shown as messages only).',
    tasks: [
      { pick: 2, pool: [T.act('openMic', 2, 'Do open mic twice'), T.act('busk', 2, 'Busk twice'), T.act('postContent', 3, 'Post 3 times')] },
      { pick: 2, pool: [T.act('openMic', 6, 'Do 6 open mics'), T.skill('music', 3, 'Music 3'), T.skill('charisma', 3, 'Charisma 3'), T.act('postContent', 10, 'Post 10 times')] },
      { pick: 3, pool: [T.act('karaoke', 8, 'Own 8 karaoke nights'), T.skill('charisma', 5, 'Charisma 5'), T.places(14, 'Be seen at 14 spots'), T.days(6, 'Active on 6 days'), T.act('postContent', 25, 'Post 25 times')] },
      { pick: 3, fixed: [T.days(14, 'Two weeks in the spotlight (14 days)')], pool: [T.skill('music', 7, 'Music 7'), T.skill('charisma', 7, 'Charisma 7'), T.act('openMic', 40, '40 open mics'), T.worth(10_000_000, 'Net worth $100,000')] },
      { pick: 0, fixed: [{ kind: 'streak', days: 21, label: 'Keep a borough entertained 21 days in a row (no repeats)' }], pool: [] },
    ],
  },
);
