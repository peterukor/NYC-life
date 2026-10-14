// =====================================================================
// friends.ts — friendships that live in the city (Peter, 2026-10-14).
//
// Builds on people.ts (who people are, what they remember, likes and
// levels). Adds:
//   VIBES     everyone has a main vibe and a second one (night owl, gym
//             rat, touch-grass type, arcade kid, homebody, foodie), so
//             they love some outings and avoid others.
//   HISTORY   a short log of what you did together (last 8 things).
//   OUTINGS   park, arcade, gym, club, your place: what you can invite
//             people to (sim/invites.ts sends the invitation).
//   SHARED    things to do together at each outing. Doing things together
//             is what builds a friendship. Paying doesn't: activities that
//             cost money give the same as free ones, and "treating" someone
//             helps once a day, a little.
//   PROGRESS  friendship progress toward the next level (likes thresholds
//             from people.ts), capped per day so you can't speed-run a
//             best friend in one afternoon.
// =====================================================================

import { nowMs, nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { adjustLikes, moodToday, personOf, remember, type Memory } from './people.ts';
import type { AreaId, GameState } from './types.ts';

// --------------------------------------------------------------- vibes

export type Vibe = 'party' | 'gym' | 'chill' | 'gamer' | 'homebody' | 'foodie';
export const VIBES: Record<Vibe, { label: string; emoji: string }> = {
  party: { label: 'Night owl', emoji: '🪩' },
  gym: { label: 'Gym rat', emoji: '🏋️' },
  chill: { label: 'Touch-grass type', emoji: '🌿' },
  gamer: { label: 'Arcade kid', emoji: '🕹️' },
  homebody: { label: 'Homebody', emoji: '🛋️' },
  foodie: { label: 'Foodie', emoji: '🍜' },
};

export type OutingId = 'park' | 'arcade' | 'gym' | 'club' | 'home';
export const OUTINGS: Record<OutingId, { label: string; emoji: string; placeId: string | null; place: string }> = {
  park: { label: 'Chill at the park', emoji: '🌳', placeId: 'centralPark', place: 'Central Park' },
  arcade: { label: 'Hit the arcade', emoji: '🕹️', placeId: 'pixelPalace', place: 'Pixel Palace' },
  gym: { label: 'Work out together', emoji: '🏋️', placeId: 'ironGym', place: 'Iron Hell’s Kitchen' },
  club: { label: 'Go out dancing', emoji: '🪩', placeId: 'velvetRoom', place: 'The Velvet Room' },
  home: { label: 'Come over to mine', emoji: '🏠', placeId: null, place: 'your place' },
};
export const OUTING_IDS = Object.keys(OUTINGS) as OutingId[];

/** How much each vibe likes each outing: −1 avoids it, 0 fine, 1 likes, 2 loves. */
const TASTE: Record<Vibe, Record<OutingId, number>> = {
  party: { park: 0, arcade: 1, gym: -1, club: 2, home: 0 },
  gym: { park: 1, arcade: 0, gym: 2, club: 0, home: -1 },
  chill: { park: 2, arcade: 0, gym: 0, club: -1, home: 1 },
  gamer: { park: -1, arcade: 2, gym: -1, club: 0, home: 1 },
  homebody: { park: 1, arcade: 0, gym: -1, club: -1, home: 2 },
  foodie: { park: 1, arcade: 0, gym: -1, club: 0, home: 2 },
};

/** Quirks (people.ts) point to a vibe. */
const QUIRK_VIBE: Record<string, Vibe> = {
  night: 'party', rapper: 'party', theater: 'party', gossip: 'party',
  gym: 'gym', runner: 'gym', yankees: 'gym', mets: 'gym',
  books: 'chill', artist: 'chill', dogs: 'chill', pigeons: 'chill',
  sneakers: 'gamer', crypto: 'gamer', hustle: 'gamer',
  cats: 'homebody',
  foodie: 'foodie', chef: 'foodie',
};

/** Someone's two vibes (always the same for the same person). */
export function vibesOf(id: string): { main: Vibe; second: Vibe } {
  const p = personOf(id);
  const all = Object.keys(VIBES) as Vibe[];
  const r = new Rng(`vibe-${id}`);
  const fromQuirks = p.quirks.map((q) => QUIRK_VIBE[q.id]).filter((v): v is Vibe => !!v);
  const main = fromQuirks[0] ?? all[Math.floor(r.next() * all.length)];
  let second = fromQuirks.find((v) => v !== main) ?? all[Math.floor(r.next() * all.length)];
  if (second === main) second = all[(all.indexOf(main) + 1 + Math.floor(r.next() * (all.length - 1))) % all.length];
  return { main, second };
}

/** How much they like an outing (−1…2): the main vibe, nudged up by the second. */
export function tasteFor(id: string, outing: OutingId): number {
  const { main, second } = vibesOf(id);
  return Math.min(2, TASTE[main][outing] + (TASTE[second][outing] >= 2 ? 1 : 0));
}

/** Their favourite outing (the first one they love). */
export function favouriteOuting(id: string): OutingId {
  return OUTING_IDS.reduce((a, b) => (tasteFor(id, b) > tasteFor(id, a) ? b : a));
}

// ------------------------------------------------------------- history

export interface LogEntry { at: number; emoji: string; text: string }
export const LOG_MAX = 8;

/** Add a line to what you two have been through (newest first). */
export function logWith(m: Memory, emoji: string, text: string, now = nowMs()): void {
  const log = (m.log ??= []);
  log.unshift({ at: now, emoji, text });
  if (log.length > LOG_MAX) log.length = LOG_MAX;
}
export const historyOf = (m: Memory | undefined): LogEntry[] => m?.log ?? [];

/** Mark an outing's taste as learned (shown in Link Up). */
export function learnTaste(m: Memory, outing: OutingId): void {
  const k = `taste:${outing}`;
  if (!m.known.includes(k)) m.known.push(k);
}
export const knowsTaste = (m: Memory | undefined, outing: OutingId) => !!m?.known.includes(`taste:${outing}`);

// ------------------------------------------------------------ progress

/** Likes needed for each level (people.ts → adjustLikes). */
const LEVEL_AT = [0, 8, 30, 55, 100];
/** Progress (0–1) toward the next friendship level; levels 4+ come from dates. */
export function friendProgress(m: Memory): { level: number; next: number | null; fraction: number } {
  const lvl = Math.min(3, m.level);
  if (m.level >= 3) return { level: m.level, next: null, fraction: 1 };
  const lo = LEVEL_AT[lvl], hi = LEVEL_AT[lvl + 1];
  return { level: m.level, next: lvl + 1, fraction: Math.max(0, Math.min(1, (m.likes - lo) / (hi - lo))) };
}

/** Most friendship you can build with one person in one game day (hangouts and treats). */
export const DAILY_BOND_CAP = 18;

function bondToday(m: Memory, day = nycTime().dateKey): { day: string; n: number } {
  if (!m.bond || m.bond.day !== day) m.bond = { day, n: 0 };
  return m.bond;
}

/** Add friendship, within today's cap. Returns what was actually added. */
export function addBond(m: Memory, points: number): number {
  if (points <= 0) {
    adjustLikes(m, points);
    return points;
  }
  const b = bondToday(m);
  const add = Math.max(0, Math.min(points, DAILY_BOND_CAP - b.n));
  b.n += add;
  adjustLikes(m, add);
  return add;
}

// ---------------------------------------------------- shared activities

export interface SharedActivity {
  id: string;
  outing: OutingId;
  label: string;
  emoji: string;
  /** Real seconds it takes. */
  seconds: number;
  /** Friendship points (before taste, mood and repeats). Never depends on cost. */
  bond: number;
  /** Money for the two of you, if any (cents). */
  cost?: number;
  needs?: Partial<Record<'fun' | 'social' | 'energy' | 'hunger', number>>;
  /** Taste override: e.g. roasting outfits depends on how kind they are. */
  taste?: (id: string) => number;
  /** What they say: loved it / fine / not their thing. */
  lines: [string, string, string];
  /** Needs something special (a cooked portion at home, a TV). */
  special?: 'meal' | 'tv' | 'versus';
}

const kindTaste = (id: string) => (personOf(id).warmth === 'mean' ? 2 : personOf(id).warmth === 'kind' ? -1 : 1);

export const SHARED: SharedActivity[] = [
  // 🌳 park
  { id: 'walkTalk', outing: 'park', label: 'Walk and talk', emoji: '🚶', seconds: 8, bond: 7, needs: { social: 14, fun: 6 }, lines: ['“This is the most peaceful I’ve been since 2019.”', '“Nice out. Good call.”', '“Is it supposed to be this… outside?”'] },
  { id: 'ducks', outing: 'park', label: 'Feed the ducks', emoji: '🦆', seconds: 7, bond: 6, cost: 200, needs: { fun: 12 }, lines: ['“That one’s named Gerald. I decided.”', '“The ducks are lowkey aggressive.”', '“A duck just looked at me like I owe it money.”'] },
  { id: 'rateFits', outing: 'park', label: 'Rate strangers’ outfits', emoji: '🕶️', seconds: 7, bond: 7, needs: { fun: 14 }, taste: kindTaste, lines: ['“Cargo shorts guy: 4/10. The confidence: 10/10.”', '“Okay, that jacket goes hard.”', '“We’re being so mean right now. …The socks with sandals, though.”'] },
  { id: 'iceCream', outing: 'park', label: 'Ice cream for two', emoji: '🍦', seconds: 6, bond: 5, cost: 900, needs: { hunger: 10, fun: 8 }, lines: ['“Mint chip is the only correct answer.”', '“Thanks!”', '“I’m lactose intolerant, but I respect the gesture.”'] },
  { id: 'frisbee', outing: 'park', label: 'Toss a frisbee', emoji: '🥏', seconds: 8, bond: 6, needs: { fun: 16, energy: -6 }, lines: ['“I’ve been training for this my whole life.”', '“I’m better at catching the subway.”', '“It hit me in the face. Twice. On purpose?”'] },
  // 🕹️ arcade
  { id: 'versus', outing: 'arcade', label: 'Go head-to-head on Pigeon Pop', emoji: '🐦', seconds: 1, bond: 8, cost: 400, special: 'versus', lines: ['', '', ''] },
  { id: 'airHockey', outing: 'arcade', label: 'Air hockey', emoji: '🏒', seconds: 7, bond: 6, cost: 200, needs: { fun: 16, social: 6 }, lines: ['“GOAL. Say it with me. GOAL.”', '“Good game, I guess.”', '“My wrist hurts and I lost to you. Double loss.”'] },
  { id: 'photoBooth', outing: 'arcade', label: 'Photo booth strip', emoji: '📸', seconds: 6, bond: 6, cost: 500, needs: { fun: 12, social: 8 }, lines: ['“This is going on the fridge.”', '“Cute.”', '“Delete it. Burn it. I blinked in all four.”'] },
  { id: 'clawFor', outing: 'arcade', label: 'Win them something from the claw', emoji: '🧸', seconds: 6, bond: 5, cost: 200, needs: { fun: 8 }, lines: ['“A pigeon plush? For ME?”', '“So close. It’s rigged.”', '“Two dollars to watch a claw drop a bear. The economy is wild.”'] },
  // 🏋️ gym
  { id: 'spot', outing: 'gym', label: 'Spot each other', emoji: '🏋️', seconds: 8, bond: 7, needs: { energy: -10, social: 10 }, lines: ['“You didn’t let the bar crush me. That’s real friendship.”', '“Good set.”', '“I’m sore and we’re still on the warm-up.”'] },
  { id: 'race', outing: 'gym', label: 'Treadmill race', emoji: '🏃', seconds: 8, bond: 6, needs: { energy: -12, fun: 10 }, lines: ['“Rematch. Now.”', '“I let you win.”', '“Call an ambulance. For my legs.”'] },
  { id: 'mirror', outing: 'gym', label: 'Mirror selfie', emoji: '🤳', seconds: 4, bond: 4, needs: { fun: 8 }, lines: ['“The lighting in here is criminally good.”', '“Post it?”', '“I look like I lost a fight with a dumbbell.”'] },
  // 🪩 club
  { id: 'dance', outing: 'club', label: 'Dance together', emoji: '💃', seconds: 8, bond: 7, needs: { fun: 18, energy: -8 }, lines: ['“This is my SONG. They’re all my songs.”', '“Okay, the DJ’s actually good.”', '“I’m doing the two-step from my cousin’s wedding. It’s all I have.”'] },
  { id: 'hype', outing: 'club', label: 'Hype them up', emoji: '📣', seconds: 5, bond: 6, needs: { social: 10 }, lines: ['“Say it again, but louder.”', '“Stop, you’re too nice.”', '“People are looking. Please.”'] },
  { id: 'toast', outing: 'club', label: 'Toast to something dumb', emoji: '🥂', seconds: 5, bond: 6, cost: 2_400, needs: { fun: 12 }, lines: ['“To the L train. May it never be fixed.”', '“Cheers to whatever this is.”', '“I’m toasting with water and still having fun. Respect it.”'] },
  { id: 'yellTalk', outing: 'club', label: 'Yell-talk over the music', emoji: '🗣️', seconds: 6, bond: 5, needs: { social: 12 }, lines: ['“WHAT? …YEAH. …WHAT?”', '“…I think we agreed on something.”', '“I’ve lost my voice and gained nothing.”'] },
  // 🏠 your place
  { id: 'catchUp', outing: 'home', label: 'Catch up', emoji: '💬', seconds: 8, bond: 7, needs: { social: 16 }, lines: ['“Okay, I have SO much tea.”', '“Good to just sit for a sec.”', '“Wait, what were we talking about?”'] },
  { id: 'tv', outing: 'home', label: 'Watch TV together', emoji: '📺', seconds: 10, bond: 6, special: 'tv', needs: { fun: 14, energy: 4 }, lines: ['“One more episode.” (It was not one more.)', '“Sure, whatever’s on.”', '“You watch it with subtitles? We’re done.”'] },
  { id: 'meal', outing: 'home', label: 'Share a meal you cooked', emoji: '🍝', seconds: 9, bond: 10, special: 'meal', needs: { hunger: 40, social: 10 }, lines: ['“Who taught you to cook?? I’m moving in. (I’m not.)”', '“That hit. Thank you.”', '“Honestly? I ate before I came.”'] },
  { id: 'delivery', outing: 'home', label: 'Order InstaDash for two', emoji: '🛵', seconds: 6, bond: 4, cost: 3_200, needs: { hunger: 35 }, lines: ['“The driver went to the wrong building twice. Classic.”', '“Food’s food.”', '“Oh. Delivery. Cool cool cool.”'] },
  { id: 'videoGames', outing: 'home', label: 'Video games', emoji: '🎮', seconds: 9, bond: 6, needs: { fun: 18 }, lines: ['“One more. I’m not leaving until I win.”', '“GG.”', '“What button is jump. No, really.”'] },
];
export const SHARED_BY_ID = Object.fromEntries(SHARED.map((a) => [a.id, a]));
export const sharedFor = (outing: OutingId) => SHARED.filter((a) => a.outing === outing);

/** The taste that counts for an activity: its own rule, else the outing's. */
export function activityTaste(id: string, a: SharedActivity): number {
  return a.taste ? a.taste(id) : tasteFor(id, a.outing);
}

const TASTE_MULT = (t: number) => (t >= 2 ? 1.4 : t === 1 ? 1.1 : t === 0 ? 0.8 : 0.3);
const MOOD_MULT = { great: 1.2, fine: 1, grumpy: 0.7, busy: 0.8 } as const;
/** Doing the same thing again in one hangout counts for less. */
export const REPEAT_IN_HANGOUT = [1, 0.5, 0.2, 0];

/** What a shared activity does: friendship gained and their reaction. */
export function doTogether(s: GameState, personId: string, a: SharedActivity, timesThisHangout: number, area: AreaId, now = nowMs()): { bond: number; line: string; taste: number } {
  const m = remember(s, personId, area, now);
  const taste = activityTaste(personId, a);
  const rep = REPEAT_IN_HANGOUT[Math.min(timesThisHangout, REPEAT_IN_HANGOUT.length - 1)];
  const mood = MOOD_MULT[moodToday(personId)];
  const raw = Math.round(a.bond * TASTE_MULT(taste) * rep * mood);
  // Not their thing at all, done twice: a little annoying.
  const pts = taste < 0 && timesThisHangout >= 1 ? -2 : raw;
  const bond = addBond(m, pts);
  learnTaste(m, a.outing);
  m.seen = now;
  for (const [k, v] of Object.entries(a.needs ?? {})) s.needs[k as 'fun'] = Math.max(0, Math.min(100, s.needs[k as 'fun'] + (v as number)));
  const line = a.lines[taste >= 2 ? 0 : taste >= 0 ? 1 : 2];
  logWith(m, a.emoji, `${a.label}${taste >= 2 ? ' (they loved it)' : taste < 0 ? ' (not their thing)' : ''}`, now);
  return { bond, line, taste };
}

/** Pick up the tab for them: helps once a game day, a little. Money isn't a personality. */
export function treat(s: GameState, personId: string, area: AreaId, now = nowMs()): { bond: number; line: string } {
  const m = remember(s, personId, area, now);
  const day = nycTime(now).dateKey;
  if (m.treated === day) return { bond: 0, line: '“You already got the last one. I’m good, for real.”' };
  m.treated = day;
  const bond = addBond(m, 2);
  logWith(m, '💳', 'You picked up the tab', now);
  return { bond, line: '“Appreciated. You can’t buy my friendship, though. (A pretzel gets you close.)”' };
}

/** A quick summary of someone as a friend (for Link Up). */
export function friendCard(id: string, m: Memory) {
  const v = vibesOf(id);
  return { person: personOf(id), main: VIBES[v.main], second: VIBES[v.second], progress: friendProgress(m), history: historyOf(m), loves: OUTING_IDS.filter((o) => knowsTaste(m, o) && tasteFor(id, o) >= 2), avoids: OUTING_IDS.filter((o) => knowsTaste(m, o) && tasteFor(id, o) < 0) };
}
