// =====================================================================
// dates.ts — going on dates with people you've met (21+ only; anything
// intimate is a fade-to-black line of text, nothing more).
//
// HOW A DATE WORKS
//   1. They said yes (Ask them out, or a text). Pick a spot from
//      DATE_SPOTS (each has a price; you pay).
//   2. Three rounds of conversation. Each round offers three topics:
//      one they love (from their quirks), one neutral, and one they
//      can't stand. You don't know which is which unless you've learned
//      their quirks by chatting before — so getting to know people pays.
//   3. Score → how it went. Great dates move you to "Dating", and after
//      a few great dates, "Partner".
//   4. After a great date with someone you're dating, you can invite
//      them home. Fade to black. Light-fingered people may "borrow"
//      something before you wake up (cash or a piece of furniture).
//
// Closer relationships unlock their address (visit when they're home)
// and, for partners, a spare key (sim/people.ts Memory.address / .key).
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { layoutForPlace } from '../data/homes.ts';
import { money } from '../core/format.ts';
import { chargeBill, changeMoney } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { adjustLikes, DISLIKES, personOf, remember, type Person } from './people.ts';
import type { AreaId, GameState } from './types.ts';

export interface DateSpot {
  id: string;
  /** The place you go (data/places.ts). */
  placeId: string;
  label: string;
  emoji: string;
  /** Cost in cents (you pay for both). */
  cost: number;
  /** Extra charm for this kind of spot (0 = none). */
  bonus: number;
}

export const DATE_SPOTS: DateSpot[] = [
  { id: 'park', placeId: 'centralPark', label: 'Walk in Central Park', emoji: '🌳', cost: 0, bonus: 0 },
  { id: 'coffee', placeId: 'beanMachine', label: 'Coffee at Bean Machine', emoji: '☕', cost: 1_400, bonus: 0 },
  { id: 'pizza', placeId: 'sliceJoint', label: 'Slices at Slice of Ninth', emoji: '🍕', cost: 1_200, bonus: 0 },
  { id: 'comedy', placeId: 'comedyCellar', label: 'Comedy night', emoji: '🎤', cost: 5_000, bonus: 1 },
  { id: 'drinks', placeId: 'theStoop', label: 'Drinks at The Stoop', emoji: '🍸', cost: 6_000, bonus: 1 },
  { id: 'funland', placeId: 'funland', label: 'Rides at Funland', emoji: '🎡', cost: 8_000, bonus: 2 },
];

export interface Topic {
  text: string;
  /** +2 they love it, 0 neutral, -2 they hate it. */
  value: number;
}

const NEUTRAL = ['The weather', 'Your favourite subway line', 'Best bagel in the city', 'Weekend plans', 'Movies', 'Where you grew up', 'Travel', 'Music'];

/** One round of conversation: three shuffled topics. */
export function dateRound(p: Person, round: number): Topic[] {
  const love = p.quirks[round % p.quirks.length];
  const hate = round === 0 ? p.dislike : DISLIKES[(DISLIKES.indexOf(p.dislike) + round) % DISLIKES.length];
  const neutral = NEUTRAL[(round * 3 + p.name.length) % NEUTRAL.length];
  const list: Topic[] = [
    { text: `${love.emoji} ${love.topic}`, value: 2 },
    { text: `💬 ${neutral}`, value: 0 },
    { text: `💬 ${hate}`, value: hate === p.dislike ? -2 : -1 },
  ];
  return list.sort(() => Math.random() - 0.5);
}

export interface DateResult {
  grade: 'great' | 'good' | 'awkward' | 'disaster';
  text: string;
  /** Can you invite them home now? */
  canInvite: boolean;
}

/** Pay for the spot. Returns an error or null. */
export function payForDate(s: GameState, spot: DateSpot): string | null {
  if (spot.cost === 0) return null;
  if (s.money + s.bank < spot.cost) return `You need ${money(spot.cost)} for that.`;
  chargeBill(s, spot.cost, `Date: ${spot.label}`);
  return null;
}

/** Finish a date with the summed topic score (−6 … +6). */
export function finishDate(s: GameState, personId: string, area: AreaId, score: number, spot: DateSpot): DateResult {
  const p = personOf(personId);
  const m = remember(s, personId, area, nowMs());
  const total = score + spot.bonus + Math.round((s.skills.charisma ?? 0) / 3);
  applyNeeds(s, { social: 30, fun: 20 });
  if (total >= 5) {
    m.dates++;
    adjustLikes(m, 18);
    if (m.level < 4) m.level = 4;
    else if (m.dates >= 3 && m.likes >= 70) m.level = 5;
    m.address = true;
    if (m.level >= 5) m.key = true;
    addMoodlet(s, { id: 'greatDate', label: 'Butterflies', emoji: '🦋', value: 25, minutes: 60 * 24 });
    return { grade: 'great', text: `Sparks. ${p.name.split(' ')[0]} kissed you goodnight${m.level >= 5 ? ' and pressed a spare key into your hand. You’re official. 🔑' : '. You’re dating now. 💘'}`, canInvite: true };
  }
  if (total >= 2) {
    m.dates++;
    adjustLikes(m, 8);
    addMoodlet(s, { id: 'niceDate', label: 'Nice date', emoji: '😊', value: 10, minutes: 60 * 8 });
    return { grade: 'good', text: 'A nice time. They want to do it again.', canInvite: m.level >= 4 };
  }
  if (total >= -1) {
    adjustLikes(m, -3);
    return { grade: 'awkward', text: 'Long silences. They checked their phone. Twice.', canInvite: false };
  }
  adjustLikes(m, -15);
  addMoodlet(s, { id: 'badDate', label: 'Date disaster', emoji: '😬', value: -12, minutes: 60 * 8 });
  return { grade: 'disaster', text: 'They “had an early morning”. At 8 PM.', canInvite: false };
}

/**
 * Invite them home for the night. Fade to black. Returns the morning's
 * story: usually sweet, sometimes they "borrowed" something.
 */
export function stayOver(s: GameState, personId: string, area: AreaId): string {
  const p = personOf(personId);
  const m = remember(s, personId, area, nowMs());
  adjustLikes(m, 6);
  applyNeeds(s, { social: 40, fun: 30, energy: 20 });
  addMoodlet(s, { id: 'stayedOver', label: 'Good night', emoji: '🌙', value: 20, minutes: 60 * 18 });
  const first = p.name.split(' ')[0];
  if (p.lightFingered && Math.random() < 0.55) {
    // They took something: cash first, otherwise a piece of furniture.
    const cash = Math.floor((s.money * (0.15 + Math.random() * 0.2)) / 100) * 100;
    if (cash >= 2_000) {
      changeMoney(s, -cash, `Missing from your wallet (${first})`);
      m.grudge = 0;
      adjustLikes(m, -10);
      return `You woke up alone. ${first} was gone — and so was ${money(cash)} from your wallet. 😑 You could confront them next time you see them.`;
    }
    const items = (s.homes[s.home.placeId] ??= layoutForPlace(s.home.placeId).furniture.map((f) => ({ ...f })));
    if (items.length > 4) {
      const i = items.findIndex((it) => !['bed', 'closet', 'toilet', 'shower'].includes(it.uid));
      if (i >= 0) {
        const [gone] = items.splice(i, 1);
        return `You woke up alone. ${first} left a note: “had to run 💋”. Your ${gone.item.replace(/([A-Z])/g, ' $1').toLowerCase()} is… gone.`;
      }
    }
  }
  return `The rest of the night is between you two. 🌙 In the morning, ${first} made coffee${p.quirks.some((q) => q.id === 'chef') ? ' and an incredible breakfast' : ''}.`;
}
