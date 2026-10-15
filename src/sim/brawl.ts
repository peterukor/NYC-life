// =====================================================================
// brawl.ts — the rules behind the two action minigames (Peter,
// 2026-10-15): street fights you actually play, and police chases after
// a crime. The minigames themselves are in ui/minigames.ts; this file
// decides how hard they are and what winning or losing does to you.
//
// 🥊 FIGHTS: a needle sweeps a bar; tap when it's in the green to land a
//    hit. Miss and they swing back: tap DODGE in time or take it. Your
//    fitness + street smarts (+ crew weapon) against their power decide
//    how big the green zone is, how fast the needle moves, and how long
//    you get to dodge. Win: 🔥 street rep. Lose: rep down, maybe the ER.
//
// 🚔 CHASES: a crime's risk roll used to arrest you on the spot. Now the
//    cops chase you first: dodge your way down the block for a few
//    seconds and you're gone (+street rep, a funny line). Heat (1–5)
//    comes from how big the crime was and how high your level is; more
//    heat = longer, faster, busier. A cooldown keeps chases occasional
//    ("just enough that it is funny"), so most nights are quiet.
//
// TO TUNE: FIGHT and CHASE below.
// =====================================================================

import { gameMinutesToRealMs, nowMs } from '../core/clock.ts';
import { money } from '../core/format.ts';
import { addDebt } from './debt.ts';
import { chargeBill } from './economy.ts';
import { repPerks } from './gangs.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { pathLevel } from './paths.ts';
import { changeRep, repRank } from './rep.ts';
import type { GameState } from './types.ts';

export const FIGHT = {
  /** Green zone as a share of the bar, before your edge moves it. */
  zone: 0.26,
  /** Needle: ms for one sweep across, at foe power 0 (faster for tougher foes). */
  sweepMs: 1000,
  /** Time to tap DODGE at foe power 0 (less for tougher foes, more if you're fit). */
  dodgeMs: 720,
  /** Street rep for a win, per point of foe power (and a floor). */
  winRepPerPower: 2,
  /** Street rep lost when you lose (per point of foe power, and a floor). */
  loseRepPerPower: 1.5,
  /** ER bill range when a loss is bad (cents). */
  erBill: [15_000, 60_000] as const,
};

export const CHASE = {
  /** Seconds to survive at heat 1; each heat adds more. */
  baseSeconds: 9,
  perHeatSeconds: 1.5,
  /** Hits (bumping into stuff) before you're caught. */
  hits: 3,
  /** At most one chase per this many game minutes. */
  cooldownGameMinutes: 180,
  /** Street rep for getting away, per heat. */
  escapeRepPerHeat: 4,
};

export interface FightSetup {
  foe: string;
  foeEmoji: string;
  /** 1–10. */
  foePower: number;
  /** Green zone width (0–1 share of the bar). */
  zone: number;
  /** Needle sweep time (ms). */
  sweepMs: number;
  /** Dodge window (ms). */
  dodgeMs: number;
  youHp: number;
  foeHp: number;
}

/** Your fighting strength (about 0–15). */
export function fightPower(s: GameState): number {
  return (s.skills.fitness ?? 0) * 1.2 + (s.skills.streetSmarts ?? 0) * 0.8 + repPerks(s).weapon.bonus;
}

/** How hard a fight is: everything the minigame needs. `foePower` 1–10. */
export function fightSetup(s: GameState, foe: string, foeEmoji: string, foePower: number): FightSetup {
  const p = Math.max(1, Math.min(10, foePower));
  const edge = Math.max(-0.6, Math.min(0.6, (fightPower(s) - p) / 10));
  return {
    foe,
    foeEmoji,
    foePower: p,
    zone: Math.max(0.1, Math.min(0.42, FIGHT.zone + edge * 0.22)),
    sweepMs: Math.round(Math.max(420, FIGHT.sweepMs - p * 50)),
    dodgeMs: Math.round(Math.max(300, Math.min(900, FIGHT.dodgeMs - p * 35 + (s.skills.fitness ?? 0) * 18))),
    youHp: 3 + ((s.skills.fitness ?? 0) >= 7 ? 1 : 0),
    foeHp: 2 + Math.floor(p / 4),
  };
}

export interface FightOutcome {
  won: boolean;
  text: string;
  repDelta: number;
  title: string | null;
  bill: number;
}

/**
 * Apply a fight's result. `hpLeft` = your hearts left (a close loss
 * is a bruise; a beating is the ER).
 */
export function finishFight(s: GameState, setup: FightSetup, won: boolean, hpLeft: number, rand = Math.random): FightOutcome {
  const first = setup.foe.split(' ')[0];
  if (won) {
    const pts = Math.max(3, Math.round(setup.foePower * FIGHT.winRepPerPower));
    const r = changeRep(s, 'street', pts);
    applyNeeds(s, { energy: -12 });
    addMoodlet(s, { id: 'wonFight', label: 'Won a scrap', emoji: '💪', value: 10, minutes: 60 * 6 });
    const lines = [`${first} is suddenly very interested in their phone.`, `${first} tapped out. The bodega cat saw everything.`, `${first} walked off saying they "let you win". They did not.`, `The whole block clapped. One guy filmed it. You look great.`];
    return { won, text: lines[Math.floor(rand() * lines.length)], repDelta: pts, title: r.title, bill: 0 };
  }
  const pts = Math.max(2, Math.round(setup.foePower * FIGHT.loseRepPerPower));
  changeRep(s, 'street', -pts);
  addMoodlet(s, { id: 'beatUp', label: 'Lost a fight', emoji: '🤕', value: -14, minutes: 60 * 8 });
  // A close one (you still had a heart in you) is a bruise; a beating is the ER.
  if (hpLeft <= 0 && setup.foePower >= 4) {
    const bill = Math.round((FIGHT.erBill[0] + rand() * (FIGHT.erBill[1] - FIGHT.erBill[0])) / 100) * 100;
    const { short } = chargeBill(s, bill, 'ER visit (lost a fight)');
    addDebt(s, short);
    applyNeeds(s, { energy: -35, fun: -20 });
    return { won, text: `You woke up in the ER. ${money(bill)} bill${short ? ` (${money(short)} went to collections)` : ''}. ${first} is telling everyone.`, repDelta: -pts, title: null, bill };
  }
  applyNeeds(s, { energy: -20, fun: -10 });
  return { won, text: `${first} got the better of you. Your pride needs an ice pack.`, repDelta: -pts, title: null, bill: 0 };
}

// ---------------------------------------------------------------------
// Chases
// ---------------------------------------------------------------------

export interface ChaseSetup {
  heat: number;
  seconds: number;
  /** Scroll speed multiplier (1 = calm). */
  speed: number;
  /** Obstacles per second. */
  density: number;
  hits: number;
}

/** Your overall standing: the higher you are, the harder they come (0–6). */
export function playerLevel(s: GameState): number {
  return Math.max(pathLevel(s, 'crime'), repRank(s, 'street'));
}

/** Heat 1–5 from how risky the crime was (its risk, 0–1) and your level. */
export function heatFor(s: GameState, risk: number): number {
  const fromCrime = risk >= 0.15 ? 2 : risk >= 0.06 ? 1 : 0;
  const fromLevel = Math.floor(playerLevel(s) / 2);
  return Math.max(1, Math.min(5, 1 + fromCrime + fromLevel));
}

export function chaseSetup(s: GameState, heat: number): ChaseSetup {
  const h = Math.max(1, Math.min(5, Math.round(heat)));
  const fit = s.skills.fitness ?? 0;
  return {
    heat: h,
    seconds: CHASE.baseSeconds + h * CHASE.perHeatSeconds,
    speed: 1 + (h - 1) * 0.18,
    density: 1.1 + h * 0.35,
    hits: CHASE.hits + (fit >= 6 ? 1 : 0) - (h >= 5 ? 1 : 0),
  };
}

/** Can the cops chase you right now? (Not more than once every few game hours.) */
export function chaseReady(s: GameState): boolean {
  return nowMs() - (s.stats.lastChase ?? 0) >= gameMinutesToRealMs(CHASE.cooldownGameMinutes);
}

export function markChase(s: GameState): void {
  s.stats.lastChase = nowMs();
}

/** You got away: rep and a line. */
export function escaped(s: GameState, heat: number, rand = Math.random): { text: string; repDelta: number; title: string | null } {
  const pts = CHASE.escapeRepPerHeat * heat;
  const r = changeRep(s, 'street', pts);
  addMoodlet(s, { id: 'gotAway', label: 'Got away', emoji: '💨', value: 12, minutes: 60 * 4 });
  applyNeeds(s, { energy: -15, fun: 10 });
  const lines = [
    'You ducked into a bodega. The cat didn’t snitch.',
    'The cop stopped to argue with a pigeon. You were gone.',
    'You blended into a tour group. Someone gave you a lanyard.',
    'You hopped a turnstile, said sorry to the turnstile, and vanished.',
    'The officer got distracted by a sample sale. Fashion saved you.',
    'You hid behind a hot dog cart. The vendor charged you $4 for the privilege.',
  ];
  return { text: lines[Math.floor(rand() * lines.length)], repDelta: pts, title: r.title };
}
