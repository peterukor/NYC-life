// =====================================================================
// section.ts — your own VIP section at the club (Peter, 2026-10-14).
//
// 🛋️ Get a section: $300 for 10 real minutes (was $1,000). You can bring 2 friends.
// Everything you spend in the section (the section itself, bottles,
// extra time) grows it: one more friend per $300, up to 12 friends at
// $10,000. Friends are your contacts first (people with your number),
// then the "crew" (friends of friends) fills the rest. Contacts who are
// busy today say no. Players will take these seats when multiplayer is on.
// Bottles still bring admirers over (sim/celebrate.ts).
//
// SPENDING vs FRIENDSHIP (Peter, 2026-10-14): money buys seats and
// attention, not friends. Inviting someone barely moves the needle;
// talking to them in the section does (talkToGuest). About a third of the
// friends-of-friends are only here for the bottles: you find out when you
// talk to them, and they drift off a few minutes after the last bottle.
// =====================================================================

import { nowMs, nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { changeMoney } from './economy.ts';
import { addClubSpend } from './clubs.ts';
import { addMoodlet } from './needs.ts';
import { adjustLikes, moodToday, personOf, remember } from './people.ts';
import { addBond, logWith, tasteFor } from './friends.ts';
import { mayEnter } from './guests.ts';
import type { GameState } from './types.ts';

export const SECTION = {
  /** Peter, 2026-10-16: "section is 300" (was $1,000). */
  price: 30_000,
  minutes: 10,
  /** Each extra $300 spent adds a seat. */
  perFriend: 30_000,
  baseFriends: 2,
  maxFriends: 12,
  /** Keep the party going. */
  extend: { price: 15_000, minutes: 10 },
} as const;

export interface Section {
  placeId: string;
  /** Real time (ms) it ends. */
  until: number;
  /** Everything spent in it (cents). */
  spent: number;
  /** Person ids of the friends who came. */
  friends: string[];
  /**
   * Who each guest really is (Peter: spending unlocks seats and attention;
   * talking builds friendship; some are only here for the bottles).
   */
  guests?: Record<string, SectionGuest>;
  /** Last bottle (real ms): bottle-only guests leave when the bottles stop. */
  lastBottleAt?: number;
  /** Who may join (players later; sim/guests.ts). */
  policy?: 'inviteOnly' | 'friends' | 'open';
}

export interface SectionGuest {
  /** In your contacts, or a friend of a friend. */
  kind: 'contact' | 'crew';
  /** Only here for the free bottles (you find out by talking). */
  freeloader: boolean;
  talked: number;
  revealed: boolean;
  joinedAt: number;
}

/** Bottle-only guests leave this long after the last bottle (real ms). */
export const FREELOADER_PATIENCE = 4 * 60_000;
/** Share of friends-of-friends who are only here for the bottles. */
export const FREELOADER_SHARE = 0.35;

/** Your section at this place, if it's still going. */
export function activeSection(s: GameState, placeId: string, now = nowMs()): Section | null {
  const sec = s.section;
  if (!sec || sec.placeId !== placeId) return null;
  return now < sec.until ? sec : null;
}

/** How many friends the money spent so far lets you bring (2 at $300 up to 12 at $3,300). */
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
  if (!pay(s, SECTION.price, 'VIP section')) return { ok: false, why: `A section is $${SECTION.price / 100}` };
  s.section = { placeId, until: now + SECTION.minutes * 60_000, spent: SECTION.price, friends: [] };
  addClubSpend(s, placeId, SECTION.price);
  addMoodlet(s, { id: 'section', label: 'Got a section', emoji: '🛋️', value: 6, minutes: 60 });
  return { ok: true, section: s.section };
}

export function extendSection(s: GameState, placeId: string, now = nowMs()): string | null {
  const sec = activeSection(s, placeId, now);
  if (!sec) return 'No section right now';
  if (!pay(s, SECTION.extend.price, 'Section: more time')) return 'Not enough money';
  sec.until += SECTION.extend.minutes * 60_000;
  sec.spent += SECTION.extend.price;
  addClubSpend(s, placeId, SECTION.extend.price);
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
  // Same door rule as your home, for players later (sim/guests.ts). You invited them, so they're on the list.
  const why = mayEnter(sec.policy ?? 'inviteOnly', { kind: 'npc', id, name: personOf(id).name }, { kind: 'player', id: 'me', name: s.profile.name }, { invited: true, level: m?.level ?? 0, taken: sec.friends.length, capacity: friendSlots(sec.spent) });
  if (why) return why;
  if (m && moodToday(id, nycTime(now).dateKey) === 'busy') return `${personOf(id).name} can’t make it tonight`;
  sec.friends.push(id);
  // Contacts are your people; a friend of a friend might just want the Dom.
  const contact = !!m?.hasNumber;
  (sec.guests ??= {})[id] = { kind: contact ? 'contact' : 'crew', freeloader: !contact && new Rng(`fl-${id}`).next() < FREELOADER_SHARE, talked: 0, revealed: false, joinedAt: now };
  s.needs.social = Math.min(100, s.needs.social + 6);
  // Getting invited is nice, but it isn't friendship: that comes from talking (talkToGuest).
  if (m) {
    adjustLikes(m, 1);
    m.seen = now;
  }
  return null;
}

/** Spent on a bottle in the section: more seats, and the bottle crowd stays. */
export function noteBottle(s: GameState, placeId: string, now = nowMs()): void {
  const sec = activeSection(s, placeId, now);
  if (sec) sec.lastBottleAt = now;
}

const FREELOADER_LINES = ['“So… are we getting another bottle, or?”', '“Love this for us. Is there more Dom?”', '“I’m a friend of Danny’s. You don’t know Danny. That’s fine.”', '“Wait, whose section is this? Doesn’t matter. Cheers!”'];
const CREW_LINES = ['“I’ve heard about you. All good things. Mostly.”', '“Okay, you’re actually fun. Danny undersold you.”', '“Wait, you also think brunch lines are a scam? We’re friends now.”'];

/**
 * Talk to someone in your section. Contacts: friendship (club taste,
 * less each time). Friends of friends: you might make a new friend (they
 * give you their number the second time). Bottle-only guests: you find out.
 */
export function talkToGuest(s: GameState, placeId: string, id: string, now = nowMs()): { line: string; bond: number; newContact: boolean; freeloader: boolean } | null {
  const sec = activeSection(s, placeId, now);
  const g = sec?.guests?.[id];
  if (!sec || !g) return null;
  g.talked++;
  const r = new Rng(`talk-${id}-${g.talked}`);
  if (g.freeloader) {
    g.revealed = true;
    return { line: FREELOADER_LINES[Math.floor(r.next() * FREELOADER_LINES.length)], bond: 0, newContact: false, freeloader: true };
  }
  g.revealed = true;
  const m = remember(s, id, s.location.area, now);
  const taste = tasteFor(id, 'club');
  const pts = Math.round([5, 3, 1, 0][Math.min(3, g.talked - 1)] * (taste >= 2 ? 1.4 : taste < 0 ? 0.5 : 1));
  const bond = addBond(m, pts);
  let newContact = false;
  if (g.kind === 'crew' && g.talked >= 2 && !m.hasNumber) {
    m.hasNumber = true;
    newContact = true;
    logWith(m, '📱', 'Met in your section, swapped numbers', now);
  } else logWith(m, '🛋️', 'Talked in your section', now);
  s.needs.social = Math.min(100, s.needs.social + 5);
  const line = g.kind === 'crew' ? CREW_LINES[Math.floor(r.next() * CREW_LINES.length)] : taste >= 2 ? '“Best section in the building. I’m not leaving.”' : taste < 0 ? '“I came for you, not the music. Love you. Ears hurt.”' : '“Thanks for the invite, for real.”';
  return { line, bond, newContact, freeloader: false };
}

/** Bottle-only guests drift off once the bottles stop. Returns who left. */
export function freeloadersLeave(s: GameState, now = nowMs()): string[] {
  const sec = s.section;
  if (!sec || !sec.guests || now >= sec.until) return [];
  const since = sec.lastBottleAt ?? sec.until - SECTION.minutes * 60_000;
  if (now - since < FREELOADER_PATIENCE) return [];
  const gone = sec.friends.filter((id) => sec.guests![id]?.freeloader && now - sec.guests![id].joinedAt >= FREELOADER_PATIENCE);
  sec.friends = sec.friends.filter((id) => !gone.includes(id));
  for (const id of gone) delete sec.guests[id];
  return gone;
}

/** Clear a section that's over. Returns true if one ended. */
export function endSectionIfOver(s: GameState, now = nowMs()): boolean {
  if (!s.section || now < s.section.until) return false;
  const n = s.section.friends.length;
  s.section = null;
  if (n >= 6) addMoodlet(s, { id: 'bigNight', label: 'Legendary night out', emoji: '🥂', value: 10, minutes: 240 });
  return true;
}
