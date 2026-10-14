// =====================================================================
// social.ts — what you can do with a person on the street, and how they
// react. Plug-in list: SOCIAL_ACTIONS.
//
// Reactions depend on WHO they are (kind/neutral/mean, temper), their
// MOOD today, how much they LIKE you, how often you've already done this
// to them TODAY (repeatFactor), your skills and your Cool.
//
// Some people fight back. A fight is never deadly: lose and you go to the
// hospital with a bill (sim/debt.ts handles what you can't pay). Win and
// they back off — but they remember, and the police might show up.
//
// TO ADD AN ACTION: add an entry to SOCIAL_ACTIONS (show + run).
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { money } from '../core/format.ts';
import { Registry } from '../core/registry.ts';
import { chargeBill, changeMoney } from './economy.ts';
import { addDebt } from './debt.ts';
import { coolScore } from './garage.ts';
import { repPerks } from './gangs.ts';
import { arrest } from './jail.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { adjustLikes, moodToday, personOf, remember, repeatFactor, type DayMood, type Memory, type Person } from './people.ts';
import type { AreaId, GameState, NeedKey } from './types.ts';

export interface SocialCtx {
  s: GameState;
  p: Person;
  m: Memory;
  mood: DayMood;
  hour: number;
  /** How many times you've already done THIS action to them today. */
  times: number;
  /** Your Cool (0–100). */
  cool: number;
}

export interface SocialResult {
  text: string;
  tone: 'good' | 'bad' | 'info';
  /** What they say out loud (shown as a speech bubble over them). */
  say?: string;
  /** They throw hands. */
  fight?: boolean;
  /** Open the date planner. */
  date?: boolean;
}

export interface SocialAction {
  id: string;
  label: string;
  emoji: string;
  /** Mean or illegal actions are shown in red. */
  risky?: boolean;
  show: (c: SocialCtx) => boolean;
  run: (c: SocialCtx) => SocialResult;
}

export const SOCIAL_ACTIONS = new Registry<SocialAction>('social action');

const chance = (p: number) => Math.random() < p;
const warmthMult = (p: Person) => (p.warmth === 'kind' ? 1.3 : p.warmth === 'mean' ? 0.6 : 1);
const moodMult = (m: DayMood) => (m === 'great' ? 1.3 : m === 'grumpy' ? 0.4 : m === 'busy' ? 0.6 : 1);

/** Gain scaled by who they are, their mood, repeats and Cool. */
function gain(c: SocialCtx, base: number): number {
  const f = repeatFactor(c.times);
  if (f < 0) return Math.round(base * f);
  return Math.round(base * f * warmthMult(c.p) * moodMult(c.mood) * (1 + c.cool / 250));
}

function annoyed(c: SocialCtx): SocialResult | null {
  if (repeatFactor(c.times) >= 0) return null;
  adjustLikes(c.m, -4);
  return { text: `${c.p.name.split(' ')[0]} is getting tired of this.`, tone: 'bad', say: 'Okay… you said that already.' };
}

function revealQuirk(c: SocialCtx): string {
  const q = c.p.quirks.find((x) => !c.m.known.includes(x.id));
  if (!q) return '';
  c.m.known.push(q.id);
  return ` You learned: ${q.emoji} ${q.label}.`;
}

/** Hot-tempered people are quicker to swing. */
export function swingChance(p: Person, m: Memory): number {
  const t = p.temper === 'hot' ? 0.7 : p.temper === 'warm' ? 0.3 : 0.08;
  return Math.min(0.95, t * (p.warmth === 'mean' ? 1.4 : 1) + m.grudge / 250);
}

SOCIAL_ACTIONS.add(
  {
    id: 'chat',
    label: 'Chat',
    emoji: '💬',
    show: () => true,
    run: (c) => {
      const a = annoyed(c);
      if (a) return a;
      if (c.mood === 'busy' && chance(0.6)) return { text: 'They’re in a rush. “Sorry, can’t talk!”', tone: 'info', say: 'Can’t talk, late!' };
      const g = gain(c, 5);
      adjustLikes(c.m, g);
      applyNeeds(c.s, { social: 12 * Math.max(0.3, repeatFactor(c.times)) });
      const q = c.p.quirks[Math.floor(Math.random() * c.p.quirks.length)];
      const learned = chance(0.6) ? revealQuirk(c) : '';
      return { text: `You chatted with ${c.p.name.split(' ')[0]} (${c.p.job}).${learned}`, tone: g >= 0 ? 'good' : 'bad', say: c.mood === 'grumpy' ? 'Mm. Long day.' : q.line };
    },
  },
  {
    id: 'compliment',
    label: 'Compliment',
    emoji: '🌹',
    show: () => true,
    run: (c) => {
      const a = annoyed(c);
      if (a) return a;
      if (c.p.warmth === 'mean' && chance(0.5)) {
        adjustLikes(c.m, -2);
        return { text: 'They rolled their eyes so hard you heard it.', tone: 'bad', say: 'Uh-huh. Sure.' };
      }
      const g = gain(c, 7);
      adjustLikes(c.m, g);
      return { text: 'That landed. They’re smiling.', tone: 'good', say: c.p.warmth === 'kind' ? 'Aw, you made my day!' : 'Ha. Thanks.' };
    },
  },
  {
    id: 'joke',
    label: 'Tell a joke',
    emoji: '😂',
    show: () => true,
    run: (c) => {
      const a = annoyed(c);
      if (a) return a;
      const hit = chance(0.35 + (c.s.skills.charisma ?? 0) * 0.07 + (c.mood === 'great' ? 0.15 : c.mood === 'grumpy' ? -0.2 : 0));
      if (!hit) {
        adjustLikes(c.m, -3);
        return { text: 'Crickets. A pigeon walked away.', tone: 'bad', say: '…was that a joke?' };
      }
      adjustLikes(c.m, gain(c, 8));
      applyNeeds(c.s, { fun: 8 });
      return { text: 'They cracked up. Good one.', tone: 'good', say: 'HA! Stop it!' };
    },
  },
  {
    id: 'tip',
    label: 'Buy them a coffee ($5)',
    emoji: '☕',
    show: (c) => c.s.money >= 500,
    run: (c) => {
      const a = annoyed(c);
      if (a) return a;
      changeMoney(c.s, -500, 'Bought someone a coffee');
      adjustLikes(c.m, gain(c, 9));
      return { text: 'Small gesture, big smile.', tone: 'good', say: 'You’re sweet. Thank you!' };
    },
  },
  {
    id: 'askNumber',
    label: 'Ask for their number',
    emoji: '📱',
    show: (c) => !c.m.hasNumber && c.s.phone.ok,
    run: (c) => {
      if (c.times >= 1) {
        adjustLikes(c.m, -8);
        c.m.grudge = Math.min(100, c.m.grudge + 5);
        return { text: 'You already asked. Twice is too much.', tone: 'bad', say: 'I said no.' };
      }
      const ok = c.m.likes >= 20 || (c.m.likes >= 8 && c.cool >= 40);
      if (ok && c.mood !== 'grumpy') {
        c.m.hasNumber = true;
        return { text: `${c.p.name.split(' ')[0]} put their number in your phone. (Phone → Contacts)`, tone: 'good', say: 'Text me sometime!' };
      }
      adjustLikes(c.m, -2);
      return { text: 'Not yet. Get to know them first.', tone: 'info', say: 'Maybe when I know you better.' };
    },
  },
  {
    id: 'shareNumber',
    label: 'Give them your number',
    emoji: '📇',
    show: (c) => !c.m.hasNumber && c.s.phone.ok && c.m.likes >= 8,
    run: (c) => {
      // They might text you back (and then you have their number too).
      if (c.m.likes >= 15 && chance(0.6)) {
        c.m.hasNumber = true;
        return { text: 'Your phone buzzes a minute later: “hey it’s me 👋”. Saved to Contacts.', tone: 'good', say: 'I’ll text you!' };
      }
      return { text: 'They took it. Ball’s in their court.', tone: 'info', say: 'Cool, cool.' };
    },
  },
  {
    id: 'askOut',
    label: 'Ask them out',
    emoji: '💘',
    show: (c) => c.p.dates && c.m.level >= 2,
    run: (c) => {
      if (c.times >= 1) return { text: 'You already asked today.', tone: 'info' };
      const odds = (c.m.likes - 20) / 60 + c.cool / 200 + (c.s.skills.charisma ?? 0) * 0.04 + (c.mood === 'great' ? 0.15 : c.mood === 'grumpy' ? -0.3 : 0);
      if (chance(Math.max(0.05, Math.min(0.92, odds)))) return { text: 'They said YES. Pick a spot.', tone: 'good', say: 'I’d love that.', date: true };
      adjustLikes(c.m, -3);
      return { text: 'They let you down gently. Not today.', tone: 'bad', say: 'You’re sweet, but… no.' };
    },
  },
  {
    id: 'apologize',
    label: 'Apologise',
    emoji: '🙏',
    show: (c) => c.m.grudge > 0 || c.m.likes < 0,
    run: (c) => {
      if (c.times >= 2) return { text: 'Words aren’t enough any more.', tone: 'bad', say: 'Save it.' };
      const cut = c.p.warmth === 'kind' ? 25 : c.p.warmth === 'mean' ? 8 : 15;
      c.m.grudge = Math.max(0, c.m.grudge - cut);
      adjustLikes(c.m, cut / 3);
      return { text: c.p.warmth === 'mean' ? 'They grunted. Maybe it helped.' : 'They softened a little.', tone: 'info', say: c.p.warmth === 'kind' ? 'It’s okay. Thank you.' : 'Whatever.' };
    },
  },
  {
    id: 'insult',
    label: 'Insult them',
    emoji: '🤬',
    risky: true,
    show: () => true,
    run: (c) => {
      adjustLikes(c.m, -18);
      c.m.grudge = Math.min(100, c.m.grudge + 22);
      if (chance(swingChance(c.p, c.m))) return { text: `${c.p.name.split(' ')[0]} isn’t taking that.`, tone: 'bad', say: 'Say that again. I DARE you.', fight: true };
      return { text: c.p.warmth === 'kind' ? 'They looked genuinely hurt and walked off.' : 'They told you exactly where to go.', tone: 'bad', say: c.p.warmth === 'kind' ? 'Wow. Okay.' : 'Get lost, clown.' };
    },
  },
  {
    id: 'pickpocket',
    label: 'Pickpocket',
    emoji: '🫳',
    risky: true,
    show: (c) => c.m.level < 4,
    run: (c) => {
      if (c.times >= 1) return { text: 'They’re clutching their bag now. Not again.', tone: 'bad' };
      const ok = chance(0.25 + (c.s.skills.streetSmarts ?? 0) * 0.07 + (c.s.skills.hustle ?? 0) * 0.03 - (c.p.temper === 'hot' ? 0.05 : 0));
      if (ok) {
        const take = (5 + Math.floor(Math.random() * 55)) * 100;
        changeMoney(c.s, take, 'Pickpocketed');
        c.s.paths.rep.crime = (c.s.paths.rep.crime ?? 0) + 2;
        return { text: `Smooth. ${money(take)} lighter, and they didn’t notice… this time.`, tone: 'good' };
      }
      adjustLikes(c.m, -40);
      c.m.grudge = Math.min(100, c.m.grudge + 45);
      if (chance(swingChance(c.p, c.m))) return { text: '“HEY! Thief!” They grabbed your wrist.', tone: 'bad', say: 'THIEF!', fight: true };
      if (chance(0.45)) return { text: arrest(c.s, 'caught pickpocketing', 8, 30_000), tone: 'bad', say: 'POLICE! Over here!' };
      return { text: 'Caught red-handed. They screamed, you ran.', tone: 'bad', say: 'Somebody stop them!' };
    },
  },
);

/** Do a social action on a person. Returns the result (and saves the memory). */
export function doSocial(s: GameState, personId: string, area: AreaId, actionId: string, hour: number): SocialResult {
  const a = SOCIAL_ACTIONS.require(actionId);
  const p = personOf(personId);
  const m = remember(s, personId, area, nowMs());
  const c: SocialCtx = { s, p, m, mood: moodToday(personId), hour, times: m.today.acts[actionId] ?? 0, cool: coolScore(s).total };
  m.today.acts[actionId] = c.times + 1;
  return a.run(c);
}

export function socialContext(s: GameState, personId: string, area: AreaId, hour: number): SocialCtx {
  const p = personOf(personId);
  const m = remember(s, personId, area, nowMs());
  return { s, p, m, mood: moodToday(personId), hour, times: 0, cool: coolScore(s).total };
}

/**
 * A street fight with a person. Your fitness + street smarts against
 * their strength, with luck. Never deadly: losing means the hospital.
 */
export function streetFight(s: GameState, personId: string, area: AreaId): { won: boolean; text: string } {
  const p = personOf(personId);
  const m = remember(s, personId, area, nowMs());
  const you = (s.skills.fitness ?? 0) * 1.2 + (s.skills.streetSmarts ?? 0) * 0.8 + repPerks(s).weapon.bonus + Math.random() * 6;
  const them = p.strength + Math.random() * 6;
  m.grudge = Math.min(100, m.grudge + 20);
  if (you > them) {
    s.paths.rep.crime = (s.paths.rep.crime ?? 0) + 3;
    applyNeeds(s, { energy: -20 } as Partial<Record<NeedKey, number>>);
    addMoodlet(s, { id: 'wonFight', label: 'Won a scrap', emoji: '💪', value: 10, minutes: 60 * 6 });
    if (Math.random() < 0.2) return { won: true, text: `You won… then a cop car pulled up. ${arrest(s, 'fighting in the street', 6, 25_000)}` };
    return { won: true, text: `${p.name.split(' ')[0]} backed off. They won’t forget this.` };
  }
  const bill = 40_000 + Math.floor(Math.random() * 80_000);
  const { short } = chargeBill(s, bill, 'ER visit (street fight)');
  addDebt(s, short);
  applyNeeds(s, { energy: -45, fun: -25 } as Partial<Record<NeedKey, number>>);
  addMoodlet(s, { id: 'beatUp', label: 'Lost a fight', emoji: '🤕', value: -25, minutes: 60 * 24 });
  return { won: false, text: `You lost. A night in the ER and a ${money(bill)} bill${short ? ` (${money(short)} went to collections)` : ''}.` };
}

/**
 * Texting someone whose number you have (Phone → Contacts). Once per game
 * day per person counts; spamming them just annoys them.
 */
export function textPerson(s: GameState, personId: string, kind: 'hey' | 'date'): { reply: string; ok: boolean; date?: boolean } {
  const p = personOf(personId);
  const m = s.people[personId];
  if (!m) return { reply: '(number not found)', ok: false };
  const m2 = remember(s, personId, m.area, nowMs());
  const key = kind === 'hey' ? 'text' : 'textDate';
  const times = m2.today.acts[key] ?? 0;
  m2.today.acts[key] = times + 1;
  const mood = moodToday(personId);
  if (times >= 2) {
    adjustLikes(m2, -5);
    return { reply: 'Bro. Chill. 😐', ok: false };
  }
  if (kind === 'hey') {
    applyNeeds(s, { social: 8 * repeatFactor(times) });
    if (mood === 'busy') return { reply: 'at work, ttyl', ok: true };
    adjustLikes(m2, Math.round(3 * repeatFactor(times)));
    const q = p.quirks[Math.floor(Math.random() * p.quirks.length)];
    return { reply: mood === 'grumpy' ? 'hey. long day 😮‍💨' : `heyyy 😄 ${q.line}`, ok: true };
  }
  if (!p.dates || m2.level < 2) return { reply: 'haha you’re funny. as friends tho 😅', ok: false };
  const odds = (m2.likes - 20) / 60 + coolScore(s).total / 200 + (mood === 'great' ? 0.15 : mood === 'grumpy' ? -0.3 : 0);
  if (Math.random() < Math.max(0.05, Math.min(0.92, odds))) return { reply: 'YES. where are we going? 😍', ok: true, date: true };
  adjustLikes(m2, -2);
  return { reply: 'can’t this week, sorry!', ok: false };
}
