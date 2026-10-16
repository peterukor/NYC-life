// =====================================================================
// roommate-life.ts — what your roommates get up to while you're home
// (Peter, 2026-10-15: "make roommates realistic, they go out, bring
// people home… dont show it, just write something funny and show funny
// animations").
//
// Every minute or so one "beat" happens: a roommate heads out, comes
// home (sometimes with a date), eats your leftovers, asks to borrow $20,
// throws a kitchen party, or cooks too much and shares. The movement is
// in world/roommates.ts; the game shows the words (game.ts → roommateBeat).
// A date is fade-to-black: they go into the room, the door gets little
// emoji and you get some funny lines. Nothing is shown.
// =====================================================================

import { addMoodlet, applyNeeds } from './needs.ts';
import { changeMoney } from './economy.ts';
import type { GameState } from './types.ts';

export type BeatKind = 'leave' | 'return' | 'date' | 'leftovers' | 'borrow' | 'party' | 'cook';

export interface Beat {
  kind: BeatKind;
  /** Which roommate. */
  name: string;
  /** For a date: who they brought home. */
  guest?: string;
}

export const ROOMMATE_LIFE = {
  /** Seconds before the first beat after you come home, and between beats. */
  firstAfter: [20, 35] as [number, number],
  every: [40, 75] as [number, number],
  /** Seconds a roommate stays out. */
  outFor: [60, 150] as [number, number],
  /** Chance a roommate coming home brings a date. */
  dateOdds: 0.4,
  /** The date: chatting in the living room, then behind the door. */
  chatSeconds: 16,
  inRoomSeconds: 40,
  borrow: 2_000,
  /** What they pay back (cents) if they do. */
  payBack: 2_500,
  payBackOdds: 0.7,
};

export interface MateView {
  name: string;
  away: boolean;
  busy: boolean;
}

/** What happens next, or null if everyone's busy. */
export function pickBeat(mates: MateView[], rand = Math.random): Beat | null {
  const free = mates.filter((m) => !m.busy);
  if (!free.length) return null;
  const away = free.filter((m) => m.away);
  const home = free.filter((m) => !m.away);
  // Someone out comes home first, most of the time.
  if (away.length && (rand() < 0.6 || !home.length)) {
    const m = away[Math.floor(rand() * away.length)];
    return rand() < ROOMMATE_LIFE.dateOdds ? { kind: 'date', name: m.name, guest: GUESTS[Math.floor(rand() * GUESTS.length)] } : { kind: 'return', name: m.name };
  }
  if (!home.length) return null;
  const m = home[Math.floor(rand() * home.length)];
  const kinds: [BeatKind, number][] = [
    ['leave', 3],
    ['leftovers', 1],
    ['borrow', 1],
    ['party', 1],
    ['cook', 1.5],
  ];
  let r = rand() * kinds.reduce((a, [, w]) => a + w, 0);
  for (const [kind, w] of kinds) if ((r -= w) <= 0) return { kind, name: m.name };
  return { kind: 'leave', name: m.name };
}

export const GUESTS = ['Marcus from the gym', 'a girl named Bree', 'someone called “Tiny” (not tiny)', 'a DJ who only plays his own mixes', 'Jasmine from the 6 train', 'a guy in a full suit at 2 AM', 'their “friend” from class', 'Andre, who brought his own pillow'];

const pick = <T,>(a: T[], rand = Math.random) => a[Math.floor(rand() * a.length)];

export function beatLine(b: Beat, rand = Math.random): string {
  const n = b.name;
  switch (b.kind) {
    case 'leave':
      return pick([`${n} heads out: “Don’t eat my cereal.”`, `${n} grabs a jacket. “Back late. Or never. We’ll see.”`, `${n} is out. The apartment is 40% quieter.`, `${n}: “If my mom calls, I’m at the library.” (Not at the library.)`], rand);
    case 'return':
      return pick([`${n} is back with a bodega bag and no explanation.`, `${n} walks in: “The L train is a social experiment.”`, `${n} is home. Shoes off, vibes on.`, `${n} comes back with someone else’s umbrella.`], rand);
    case 'date':
      return `${n} came home with ${b.guest}. 👀`;
    case 'leftovers':
      return pick([`${n} ate your leftovers. There’s a sticky note: “IOU 🍜”.`, `Your leftovers are gone. ${n} is avoiding eye contact.`, `${n}: “Was that yours? It didn’t have a name on it.” It had your name on it.`], rand);
    case 'borrow':
      return `${n}: “Hey… can I borrow $20 till Friday? I swear.”`;
    case 'party':
      return `${n} started a kitchen party. Someone brought a speaker the size of a fridge.`;
    case 'cook':
      return pick([`${n} made way too much rice and beans. Want some?`, `${n} is frying plantains and offering. The whole floor smells amazing.`, `${n} cooked a family-size pot of pasta “by accident”. Grab a bowl?`], rand);
  }
}

/** Funny lines while the date is behind the door (one every few seconds). */
export const DATE_LINES = [
  '🎶 Slow jams just started in {n}’s room. Very loud. Very slow.',
  '🔧 The radiator in {n}’s room is clanking… in rhythm.',
  '🎧 You put your headphones on. Then turned them all the way up.',
  '🐈 The neighbour’s cat is staring at the wall too.',
  '📺 You turn on the TV. It’s a nature documentary. Of course it is.',
  '🧱 Someone knocks on the wall from next door. Then knocks again, approvingly?',
];

export function dateLines(name: string, rand = Math.random): string[] {
  const pool = [...DATE_LINES];
  const out: string[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].replace('{n}', name));
  return out;
}

export const dateOutLine = (b: Beat) => `${b.guest ? b.guest[0].toUpperCase() + b.guest.slice(1) : 'The date'} leaves, doing the walk of fame. ${b.name} is humming. 😌`;

// ---------------------------------------------------------------------
// What your choices do
// ---------------------------------------------------------------------

type Loans = Record<string, number>;
const loansOf = (s: GameState): Loans => (s.stats.roommateLoans ??= {});

/** Lend the $20. */
export function lend(s: GameState, name: string): string {
  if (s.money < ROOMMATE_LIFE.borrow) return 'You check your wallet. You can’t either.';
  changeMoney(s, -ROOMMATE_LIFE.borrow, `🤝 Lent ${name} $20`);
  loansOf(s)[name] = (loansOf(s)[name] ?? 0) + ROOMMATE_LIFE.borrow;
  applyNeeds(s, { social: 8 });
  return `${name}: “You’re a real one.” 🤝`;
}

export function refuse(s: GameState, name: string): string {
  addMoodlet(s, { id: 'roommateAwkward', label: 'Awkward with a roommate', emoji: '😬', value: -4, minutes: 120 });
  return `${name}: “All good, all good.” (It is a little bit not good.)`;
}

/** A roommate who owes you came home: maybe they pay you back. */
export function maybeRepay(s: GameState, name: string, rand = Math.random): string | null {
  const owed = loansOf(s)[name];
  if (!owed || rand() > ROOMMATE_LIFE.payBackOdds) return null;
  delete loansOf(s)[name];
  const back = owed + (ROOMMATE_LIFE.payBack - ROOMMATE_LIFE.borrow);
  changeMoney(s, back, `🤝 ${name} paid you back`);
  return `${name} paid you back ${'$' + back / 100}, plus a croissant. A legend. 🥐`;
}

export function joinParty(s: GameState): string {
  applyNeeds(s, { social: 22, fun: 18, energy: -8 });
  addMoodlet(s, { id: 'kitchenParty', label: 'Kitchen party', emoji: '🎉', value: 8, minutes: 180 });
  return pick(['🎉 You learned a new dance, two names and one secret. Good night.', '🎉 Someone made you the aux. The kitchen went off.', '🎉 The landlord texted “keep it down”. You kept it a little down.']);
}

export function skipParty(s: GameState): string {
  applyNeeds(s, { energy: 4 });
  return '🎧 Headphones on, door shut. Peace and quiet-ish.';
}

export function eatShared(s: GameState): string {
  applyNeeds(s, { hunger: 30, social: 6 });
  return '😋 Free food from a roommate. Elite.';
}

export function lostLeftovers(s: GameState): void {
  const left = s.kitchen?.leftovers;
  if (left) {
    const k = Object.keys(left).find((id) => left[id] > 0);
    if (k) left[k]--;
  }
  addMoodlet(s, { id: 'leftoversGone', label: 'Someone ate my leftovers', emoji: '🍜', value: -3, minutes: 90 });
}
