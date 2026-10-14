// =====================================================================
// section.ts — your own VIP section at the club (Peter, 2026-10-14).
//
// 🛋️ Get a section: $1,000 for 10 real minutes. You can bring 2 friends.
// Everything you spend in the section (the section itself, bottles,
// extra time) grows it: one more friend per $900, up to 12 friends at
// $10,000. Friends are your contacts first (people with your number),
// then the "crew" (friends of friends) fills the rest. Contacts who are
// busy today say no. Players will take these seats when multiplayer is on.
// Bottles still bring admirers over (sim/celebrate.ts).
// =====================================================================

import { nowMs, nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet } from './needs.ts';
import { adjustLikes, moodToday, personOf } from './people.ts';
import type { GameState } from './types.ts';

export const SECTION = {
  price: 100_000,
  minutes: 10,
  /** Each extra $900 spent adds a seat. */
  perFriend: 90_000,
  baseFriends: 2,
  maxFriends: 12,
  /** Keep the party going. */
  extend: { price: 50_000, minutes: 10 },
} as const;

export interface Section {
  placeId: string;
  /** Real time (ms) it ends. */
  until: number;
  /** Everything spent in it (cents). */
  spent: number;
  /** Person ids of the friends who came. */
  friends: string[];
}

/** Your section at this place, if it's still going. */
export function activeSection(s: GameState, placeId: string, now = nowMs()): Section | null {
  const sec = s.section;
  if (!sec || sec.placeId !== placeId) return null;
  return now < sec.until ? sec : null;
}

/** How many friends the money spent so far lets you bring (2 at $1,000 up to 12 at $10,000). */
export function friendSlots(spent: number): number {
  if (spent < SECTION.price) return 0;
  return Math.min(SECTION.maxFriends, SECTION.baseFriends + Math.floor((spent - SECTION.price) / SECTION.perFriend));
}

/** How much more to spend for the next seat (0 when full). */
export function nextSeatIn(spent: number): number {
  if (friendSlots(spent) >= SECTION.maxFriends) return 0;
  const need = SECTION.price + (friendSlots(spent) - SECTION.baseFriends + 1) * SECTION.perFriend;
  return Math.max(0, need - spent);
}

/** Pay from cash, then the bank. */
function pay(s: GameState, cents: number, label: string): boolean {
  if (s.money + s.bank < cents) return false;
  const fromCash = Math.min(s.money, cents);
  if (fromCash > 0) changeMoney(s, -fromCash, label);
  if (cents > fromCash) s.bank -= cents - fromCash;
  return true;
}

export function buySection(s: GameState, placeId: string, now = nowMs()): { ok: true; section: Section } | { ok: false; why: string } {
  if (activeSection(s, placeId, now)) return { ok: false, why: 'You already have a section here' };
  if (!pay(s, SECTION.price, 'VIP section')) return { ok: false, why: 'A section is $1,000' };
  s.section = { placeId, until: now + SECTION.minutes * 60_000, spent: SECTION.price, friends: [] };
  addMoodlet(s, { id: 'section', label: 'Got a section', emoji: '🛋️', value: 6, minutes: 60 });
  return { ok: true, section: s.section };
}

export function extendSection(s: GameState, placeId: string, now = nowMs()): string | null {
  const sec = activeSection(s, placeId, now);
  if (!sec) return 'No section right now';
  if (!pay(s, SECTION.extend.price, 'Section: more time')) return 'Not enough money';
  sec.until += SECTION.extend.minutes * 60_000;
  sec.spent += SECTION.extend.price;
  return null;
}

/** Spending in the club while your section is on (bottles) grows it. */
export function addSectionSpend(s: GameState, placeId: string, cents: number, now = nowMs()): void {
  const sec = activeSection(s, placeId, now);
  if (sec) sec.spent += cents;
}

/** Who you could invite: contacts with your number first, then the crew. */
export function inviteList(s: GameState, now = nowMs()): { id: string; name: string; contact: boolean; busy: boolean }[] {
  const taken = new Set(s.section?.friends ?? []);
  const day = nycTime(now).dateKey;
  const contacts = Object.entries(s.people)
    .filter(([id, m]) => m.hasNumber && !taken.has(id))
    .sort((a, b) => b[1].level - a[1].level || b[1].likes - a[1].likes)
    .map(([id]) => ({ id, name: personOf(id).name, contact: true, busy: moodToday(id, day) === 'busy' }));
  // The crew: friends of friends, always up for it (seeded so names stay put for the night).
  const r = new Rng(`crew-${day}`);
  const crew = Array.from({ length: SECTION.maxFriends }, (_, i) => `crew-${day}-${i}-${Math.floor(r.next() * 1e6)}`)
    .filter((id) => !taken.has(id))
    .map((id) => ({ id, name: personOf(id).name, contact: false, busy: false }));
  return [...contacts, ...crew];
}

/** Invite someone into your section. */
export function inviteFriend(s: GameState, placeId: string, id: string, now = nowMs()): string | null {
  const sec = activeSection(s, placeId, now);
  if (!sec) return 'No section right now';
  if (sec.friends.includes(id)) return 'Already here';
  if (sec.friends.length >= friendSlots(sec.spent)) {
    const more = nextSeatIn(sec.spent);
    return more ? `Section's full. Spend ${Math.ceil(more / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} more for another seat` : 'Section’s full (12 friends max)';
  }
  const m = s.people[id];
  if (m && moodToday(id, nycTime(now).dateKey) === 'busy') return `${personOf(id).name} can’t make it tonight`;
  sec.friends.push(id);
  s.needs.social = Math.min(100, s.needs.social + 8);
  s.needs.fun = Math.min(100, s.needs.fun + 4);
  if (m) {
    adjustLikes(m, 4);
    m.seen = now;
  }
  return null;
}

/** Clear a section that's over. Returns true if one ended. */
export function endSectionIfOver(s: GameState, now = nowMs()): boolean {
  if (!s.section || now < s.section.until) return false;
  const n = s.section.friends.length;
  s.section = null;
  if (n >= 6) addMoodlet(s, { id: 'bigNight', label: 'Legendary night out', emoji: '🥂', value: 10, minutes: 240 });
  return true;
}
