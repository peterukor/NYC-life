// =====================================================================
// people.ts — the New Yorkers you meet: who they are, and what they
// remember about you.
//
// WHO THEY ARE
//   Every person on the street has an id. Everything about them (name,
//   age, kind or mean, hot-headed or calm, quirks, whether they date,
//   whether they steal) is rolled from that id, so the same person is
//   always the same person. All NPCs are adults (21+).
//
// WHAT THEY REMEMBER (state.people)
//   The first time you talk to someone, they get a small memory record:
//   how much they like you, any grudge, how close you are (stranger →
//   partner), what you've learned about them, and what you did today.
//   Memories are capped (MAX_MEMORIES); the people you haven't seen for
//   longest are forgotten first.
//
// WHY THIS MATTERS
//   • NPCs don't reset: insult someone and they'll remember tomorrow.
//   • No farming: doing the same thing to the same person over and over
//     gets weaker, then annoying (see repeatFactor).
//   • Every person also has a mood for the day (seeded), so the same
//     friend can be warm on Monday and short with you on Tuesday.
//
// TO ADD QUIRKS: add to QUIRKS. To change names: NAMES.
// =====================================================================

import { nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import type { AreaId, GameState } from './types.ts';

export type Warmth = 'kind' | 'neutral' | 'mean';
export type Temper = 'cool' | 'warm' | 'hot';

export interface Quirk {
  id: string;
  /** Shown once you've learned it ("Loves sneakers"). */
  label: string;
  emoji: string;
  /** A date/chat topic they light up about. */
  topic: string;
  /** Something they'd say about it. */
  line: string;
}

export const QUIRKS: Quirk[] = [
  { id: 'sneakers', label: 'Sneakerhead', emoji: '👟', topic: 'Sneaker drops', line: 'I camped out two nights for these. Worth it.' },
  { id: 'pigeons', label: 'Hates pigeons', emoji: '🐦', topic: 'The pigeon menace', line: 'They’re plotting. I’m serious.' },
  { id: 'rapper', label: 'Aspiring rapper', emoji: '🎤', topic: 'Their mixtape', line: 'Got a show at a basement in Bushwick Friday.' },
  { id: 'yankees', label: 'Yankees fan', emoji: '⚾', topic: 'Baseball', line: 'Pinstripes or nothing.' },
  { id: 'mets', label: 'Mets fan (suffering)', emoji: '🧢', topic: 'Baseball heartbreak', line: 'This is the year. It’s always the year.' },
  { id: 'foodie', label: 'Foodie', emoji: '🍜', topic: 'Hidden restaurants', line: 'There’s a dumpling spot on Mott you HAVE to try.' },
  { id: 'gym', label: 'Gym rat', emoji: '🏋️', topic: 'Workouts', line: 'Leg day is a lifestyle.' },
  { id: 'artist', label: 'Painter', emoji: '🎨', topic: 'Art', line: 'I sold a painting to a dentist in Queens. We’re basically MoMA.' },
  { id: 'crypto', label: 'Crypto guy', emoji: '🪙', topic: 'Crypto', line: 'You’re still early. Trust me.' },
  { id: 'theater', label: 'Broadway hopeful', emoji: '🎭', topic: 'Auditions', line: 'Callback for the ensemble. Ensemble! On BROADWAY!' },
  { id: 'dogs', label: 'Dog person', emoji: '🐕', topic: 'Dogs', line: 'My dog has more Instagram followers than me.' },
  { id: 'cats', label: 'Bodega cat fan', emoji: '🐈', topic: 'Bodega cats', line: 'I rate every bodega cat in Manhattan. Kings Deli’s is a 10.' },
  { id: 'night', label: 'Night owl', emoji: '🌙', topic: 'Late-night spots', line: 'Nothing good happens before midnight.' },
  { id: 'books', label: 'Bookworm', emoji: '📚', topic: 'Books', line: 'I read on the subway. Standing. No hands.' },
  { id: 'hustle', label: 'Side hustler', emoji: '💼', topic: 'Money moves', line: 'Three jobs and a resale shop on the side.' },
  { id: 'gossip', label: 'Knows everyone', emoji: '🗣️', topic: 'Neighbourhood gossip', line: 'You did NOT hear this from me…' },
  { id: 'runner', label: 'Marathon runner', emoji: '🏃', topic: 'Running', line: 'Did the bridge loop at 5 AM. Again.' },
  { id: 'chef', label: 'Home chef', emoji: '🍳', topic: 'Cooking', line: 'My abuela’s recipe. I’ll take it to my grave.' },
];

/** Topics some people can't stand (used on dates). */
export const DISLIKES = ['Their ex', 'Your crypto portfolio', 'Rent prices (again)', 'Astrology', 'Your gym routine', 'Reality TV'];

const FIRST = ['Maya', 'Jamal', 'Sofia', 'Luis', 'Priya', 'Dev', 'Keisha', 'Marcus', 'Elena', 'Tony', 'Aisha', 'Kenji', 'Rosa', 'Andre', 'Zoe', 'Omar', 'Bianca', 'Sam', 'Nia', 'Vinny', 'Hana', 'Diego', 'Grace', 'Malik', 'Ivy', 'Rafael', 'Tasha', 'Eli', 'Mei', 'Jordan', 'Carmen', 'Dmitri', 'Imani', 'Paulie', 'Lena', 'Kwame', 'Ruby', 'Hector', 'Yara', 'Nate'];
const LAST = ['R.', 'O.', 'K.', 'M.', 'T.', 'S.', 'D.', 'L.', 'B.', 'G.', 'P.', 'W.', 'C.', 'F.', 'V.', 'A.', 'N.', 'H.', 'J.', 'Z.'];
const JOBS = ['barista', 'nurse', 'bartender', 'coder', 'dog walker', 'teacher', 'cab driver', 'line cook', 'actor', 'paralegal', 'bike courier', 'hairstylist', 'trader', 'student (grad)', 'super of a building', 'DJ', 'personal trainer', 'bodega clerk'];

export interface Person {
  id: string;
  name: string;
  /** Always 21+. */
  age: number;
  job: string;
  warmth: Warmth;
  temper: Temper;
  quirks: Quirk[];
  dislike: string;
  /** Open to dating. */
  dates: boolean;
  /** Might "borrow" things when they stay over. */
  lightFingered: boolean;
  /** 1–10: how hard they hit back. */
  strength: number;
}

const cache = new Map<string, Person>();

/** Who this person is (always the same for the same id). */
export function personOf(id: string): Person {
  let p = cache.get(id);
  if (p) return p;
  const r = new Rng(`person-${id}`);
  const warmth: Warmth = r.chance(0.42) ? 'kind' : r.chance(0.7) ? 'neutral' : 'mean';
  const temper: Temper = r.chance(0.45) ? 'cool' : r.chance(0.6) ? 'warm' : 'hot';
  const pool = [...QUIRKS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const qs = pool.slice(0, 2 + (r.chance(0.4) ? 1 : 0));
  p = {
    id,
    name: `${r.pick(FIRST)} ${r.pick(LAST)}`,
    age: 21 + Math.floor(r.next() ** 1.6 * 48),
    job: r.pick(JOBS),
    warmth,
    temper,
    quirks: qs,
    dislike: r.pick(DISLIKES),
    dates: r.chance(0.65),
    lightFingered: r.chance(warmth === 'mean' ? 0.35 : 0.08),
    strength: 2 + Math.floor(r.next() * 8),
  };
  if (cache.size > 400) cache.clear();
  cache.set(id, p);
  return p;
}

export type DayMood = 'great' | 'fine' | 'grumpy' | 'busy';

/** Their mood today (seeded by person and game day). */
export function moodToday(id: string, dateKey = nycTime().dateKey): DayMood {
  const v = new Rng(`mood-${id}-${dateKey}`).next();
  return v < 0.25 ? 'great' : v < 0.7 ? 'fine' : v < 0.88 ? 'grumpy' : 'busy';
}

export const RELATION = ['Stranger', 'Acquaintance', 'Friend', 'Close friend', 'Dating', 'Partner'];

export interface Memory {
  area: AreaId;
  met: number;
  seen: number;
  /** -100 … 100. */
  likes: number;
  /** 0 … 100: how much they want payback. */
  grudge: number;
  /** Index into RELATION. */
  level: number;
  hasNumber: boolean;
  /** Quirk ids you've learned. */
  known: string[];
  /** What you did to them today: action id → times. */
  today: { day: string; acts: Record<string, number> };
  dates: number;
  /** They gave you their address (visit when they're home) / a spare key. */
  address?: boolean;
  key?: boolean;
  /** Last time they confronted you (ms), so they don't hound you. */
  lastConfront?: number;
  /** What you've done together, newest first (sim/friends.ts). */
  log?: { at: number; emoji: string; text: string }[];
  /** Friendship built today (capped: sim/friends.ts → DAILY_BOND_CAP). */
  bond?: { day: string; n: number };
  /** The game day you last picked up their tab. */
  treated?: string;
}

export const MAX_MEMORIES = 60;

export function memoryOf(s: GameState, id: string): Memory | undefined {
  return s.people[id];
}

/** Get (or start) a memory of someone. */
export function remember(s: GameState, id: string, area: AreaId, now: number): Memory {
  let m = s.people[id];
  if (!m) {
    m = { area, met: now, seen: now, likes: 0, grudge: 0, level: 0, hasNumber: false, known: [], today: { day: '', acts: {} }, dates: 0 };
    s.people[id] = m;
    const ids = Object.keys(s.people);
    if (ids.length > MAX_MEMORIES) {
      // Forget whoever we haven't seen for longest (but never a partner or someone with your key).
      const old = ids.filter((k) => s.people[k].level < 4 && !s.people[k].key).sort((a, b) => s.people[a].seen - s.people[b].seen)[0];
      if (old) delete s.people[old];
    }
  }
  m.seen = now;
  const day = nycTime().dateKey;
  if (m.today.day !== day) m.today = { day, acts: {} };
  return m;
}

/**
 * How much an action still counts when you repeat it on the same person
 * today: full, then weaker, then it starts to annoy them (negative).
 */
export function repeatFactor(times: number): number {
  return [1, 0.6, 0.25][times] ?? -0.5;
}

/** Change how much they like you, and move the relationship up or down. */
export function adjustLikes(m: Memory, delta: number): void {
  m.likes = Math.max(-100, Math.min(100, m.likes + delta));
  // Levels 0–3 follow likes; 4 (Dating) and 5 (Partner) come from dates (sim/dates.ts).
  const byLikes = m.likes >= 55 ? 3 : m.likes >= 30 ? 2 : m.likes >= 8 ? 1 : 0;
  if (m.level <= 3) m.level = Math.max(byLikes, Math.min(m.level, byLikes + 1));
  if (m.likes < 0 && m.level > 0 && m.level <= 3) m.level = Math.max(0, byLikes);
  if (m.level >= 4 && m.likes < 20) m.level = 2; // a bad enough fight ends it
}

/**
 * Pick someone you already know in this area to bump into again (so the
 * city feels like a neighbourhood). Friends and grudge-holders both come
 * back; strangers are forgotten.
 */
export function familiarFace(s: GameState, area: AreaId, taken: Set<string>): string | null {
  const ids = Object.keys(s.people).filter((k) => s.people[k].area === area && !taken.has(k));
  if (!ids.length) return null;
  const w = ids.map((k) => 1 + Math.abs(s.people[k].likes) / 20 + s.people[k].grudge / 15);
  let t = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) if ((t -= w[i]) <= 0) return ids[i];
  return ids[0];
}

/** A one-line summary of how they feel about you. */
export function vibe(m: Memory | undefined): { label: string; emoji: string } {
  if (!m) return { label: 'Never met', emoji: '🙂' };
  if (m.grudge >= 50) return { label: 'Wants payback', emoji: '😠' };
  if (m.likes <= -30) return { label: 'Can’t stand you', emoji: '🙄' };
  if (m.likes >= 70) return { label: 'Adores you', emoji: '🥰' };
  if (m.likes >= 30) return { label: 'Likes you', emoji: '😊' };
  return { label: 'Neutral', emoji: '😐' };
}
