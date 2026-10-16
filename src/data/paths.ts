// =====================================================================
// paths.ts — the big life ladders: Crime Boss, CEO, Celebrity, Fighter,
// Artist and Game Shark.
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
  // New paths (Peter, 2026-10-15: "I love the life path, add more"). Their
  // rep comes from the playable stuff: fights, chases, art, chess, races…
  // (game.ts → credit(): these ids count like actions).
  {
    id: 'fighter',
    name: 'Fighter',
    emoji: '🥊',
    blurb: 'From scrapping outside the halal cart to headlining. Win fights, train hard, never back down. Every win builds your name.',
    titles: ['Scrapper', 'Brawler', 'Contender', 'Prospect', 'Champion', 'Legend', 'GOAT'],
    repCurve: [0, 40, 150, 400, 950, 2_300, 5_200],
    rep: { fightWon: 18, punchBag: 3, gymSession: 4, treadmill: 2, chaseEscaped: 6 },
    warning: 'Fights hurt. Losing costs street rep and sometimes an ER bill.',
    tasks: [
      { pick: 2, pool: [T.act('fightWon', 1, 'Win a fight'), T.act('punchBag', 3, 'Hit the heavy bag 3 times'), T.skill('fitness', 2, 'Fitness 2')] },
      { pick: 2, pool: [T.act('fightWon', 4, 'Win 4 fights'), T.act('gymSession', 4, 'Lift 4 times'), T.skill('fitness', 3, 'Fitness 3'), T.skill('streetSmarts', 3, 'Street Smarts 3')] },
      { pick: 3, pool: [T.act('fightWon', 10, 'Win 10 fights'), T.skill('fitness', 5, 'Fitness 5'), T.act('chaseEscaped', 2, 'Outrun the cops twice'), T.days(5, 'Active on 5 days'), T.act('punchBag', 15, '15 heavy bag sessions')] },
      { pick: 3, pool: [T.act('fightWon', 25, 'Win 25 fights'), T.skill('fitness', 7, 'Fitness 7'), T.skill('streetSmarts', 6, 'Street Smarts 6'), T.days(9, 'Active on 9 days')] },
      { pick: 3, fixed: [T.days(15, 'Two weeks of training (15 days)')], pool: [T.act('fightWon', 60, 'Win 60 fights'), T.skill('fitness', 9, 'Fitness 9'), T.act('chaseEscaped', 10, 'Outrun the cops 10 times')] },
      { pick: 2, fixed: [T.days(26, 'Active on 26 days')], pool: [T.act('fightWon', 140, 'Win 140 fights'), T.skill('fitness', 10, 'Fitness 10'), T.worth(20_000_000, 'Net worth $200,000')] },
    ],
  },
  {
    id: 'artist',
    name: 'Artist',
    emoji: '🎨',
    blurb: 'Paint at the Bowery Art Parlor, get noticed, sell to collectors. One day the whole city knows your style.',
    titles: ['Doodler', 'Painter', 'Up-and-Comer', 'Gallery Regular', 'Collected', 'Famous', 'Master'],
    repCurve: [0, 35, 130, 380, 900, 2_200, 5_000],
    rep: { paintHung: 10, artMilestone: 8, artSold: 35, busk: 3, openMic: 3 },
    tasks: [
      { pick: 2, pool: [T.act('paintHung', 1, 'Hang a painting'), T.act('artMilestone', 1, 'Get a painting to 10 likes'), T.places(4, 'Find 4 spots for inspiration')] },
      { pick: 2, pool: [T.act('paintHung', 4, 'Hang 4 paintings'), T.act('artMilestone', 3, 'Hit 3 like milestones'), T.skill('charisma', 2, 'Charisma 2')] },
      { pick: 3, pool: [T.act('paintHung', 10, 'Hang 10 paintings'), T.act('artSold', 1, 'Sell to a collector'), T.act('artMilestone', 8, 'Hit 8 like milestones'), T.days(5, 'Active on 5 days')] },
      { pick: 3, pool: [T.act('artSold', 4, 'Sell 4 paintings'), T.act('artMilestone', 20, '20 like milestones'), T.worth(5_000_000, 'Net worth $50,000'), T.days(9, 'Active on 9 days')] },
      { pick: 3, fixed: [T.days(15, 'Two weeks at the easel (15 days)')], pool: [T.act('artSold', 12, 'Sell 12 paintings'), T.act('paintHung', 50, 'Hang 50 paintings'), T.skill('charisma', 6, 'Charisma 6')] },
      { pick: 2, fixed: [T.days(26, 'Active on 26 days')], pool: [T.act('artSold', 30, 'Sell 30 paintings'), T.worth(50_000_000, 'Net worth $500,000')] },
    ],
  },
  {
    id: 'shark',
    name: 'Game Shark',
    emoji: '🎲',
    blurb: 'Chess hustler, arcade legend, derby champ, bike-loop king. If there’s a game in this city, you win it.',
    titles: ['Rookie', 'Regular', 'Shark', 'Hustler', 'Pro', 'Legend', 'Unbeatable'],
    repCurve: [0, 40, 140, 400, 950, 2_300, 5_200],
    rep: { chessWin: 14, arcadeGame: 2, raceWin: 14, fishLanded: 2, derbyWin: 25 },
    tasks: [
      { pick: 2, pool: [T.act('chessWin', 1, 'Win a game of chess'), T.act('arcadeGame', 5, 'Play 5 arcade or phone games'), T.act('fishLanded', 2, 'Land 2 fish')] },
      { pick: 2, pool: [T.act('chessWin', 4, 'Win 4 chess games'), T.act('raceWin', 1, 'Win the bike loop'), T.act('arcadeGame', 20, 'Play 20 games'), T.skill('streetSmarts', 3, 'Street Smarts 3')] },
      { pick: 3, pool: [T.act('chessWin', 10, 'Win 10 chess games'), T.act('raceWin', 4, 'Win the loop 4 times'), T.act('fishLanded', 20, 'Land 20 fish'), T.days(5, 'Active on 5 days')] },
      { pick: 3, pool: [T.act('derbyWin', 1, 'Win the fishing derby'), T.act('chessWin', 25, 'Win 25 chess games'), T.act('raceWin', 10, 'Win the loop 10 times'), T.days(9, 'Active on 9 days')] },
      { pick: 3, fixed: [T.days(15, 'Two weeks on top (15 days)')], pool: [T.act('chessWin', 60, 'Win 60 chess games'), T.act('derbyWin', 4, 'Win 4 derbies'), T.skill('streetSmarts', 7, 'Street Smarts 7')] },
      { pick: 2, fixed: [T.days(26, 'Active on 26 days')], pool: [T.act('chessWin', 140, 'Win 140 chess games'), T.worth(20_000_000, 'Net worth $200,000')] },
    ],
  },
);
