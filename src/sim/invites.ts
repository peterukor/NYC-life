// =====================================================================
// invites.ts — inviting people out, and hanging out (Peter, 2026-10-14).
//
// REUSABLE FOR PLAYERS: an invitation is between two Parties, each an
// NPC or a player. Today NPCs answer with npcAnswer() (rules below); when
// multiplayer arrives, a player's answer comes over the network into the
// same Invite record (accept / decline / counter), and the rest (meeting
// up, the hangout, history) works unchanged. Guest lists for your section
// and your home use the same Party type (sim/guests.ts).
//
// HOW NPCs ANSWER (npcAnswer)
//   • No number, a grudge or a bad day → no.
//   • Something they avoid (their vibe) → no, or "how about <their
//     favourite> instead?".
//   • Wrong time (the club at 11 AM, the park at 2 AM, the place closed)
//     → "<later time> instead?".
//   • Invited too many times today → "we JUST hung out".
//   • Otherwise the chance of yes grows with how close you are, how much
//     they like the outing and their mood.
//   Even a yes can flake: kind people almost never, mean people more.
//
// MEETING UP: an accepted invite has a time and a place. Be there in the
// window and they show up (sim → game.ts creates the hangout). Don't show
// and they remember.
// =====================================================================

import { gameMinutesToRealMs, nowMs, nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { PLACE_BY_ID, isOpen } from '../data/places.ts';
import { addBond, favouriteOuting, logWith, OUTINGS, tasteFor, type OutingId } from './friends.ts';
import { adjustLikes, moodToday, personOf } from './people.ts';
import type { GameState } from './types.ts';

export interface Party { kind: 'npc' | 'player'; id: string; name: string }

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'done' | 'cancelled' | 'flaked';

export interface Invite {
  id: string;
  from: Party;
  to: Party;
  outing: OutingId;
  placeId: string;
  /** Real time (ms) to meet, and how long they'll wait. */
  at: number;
  until: number;
  status: InviteStatus;
  /** Their text back. */
  reply?: string;
  /** "How about … instead?" */
  counter?: { outing: OutingId; at: number; reply: string };
  createdAt: number;
}

export interface Hangout {
  inviteId: string;
  personId: string;
  outing: OutingId;
  placeId: string;
  startedAt: number;
  /** Real time it wraps up. */
  until: number;
  /** activity id → times done this hangout. */
  done: Record<string, number>;
  /** Friendship gained so far. */
  bond: number;
}

export interface SocialState {
  invites: Invite[];
  hangout: Hangout | null;
  /** Last time an NPC invited you (real ms). */
  lastIncoming: number;
  /** Invites sent per person per game day. */
  sentToday: { day: string; counts: Record<string, number> };
}

export function socialOf(s: GameState): SocialState {
  return (s.social ??= { invites: [], hangout: null, lastIncoming: 0, sentToday: { day: '', counts: {} } });
}

export const me = (s: GameState): Party => ({ kind: 'player', id: 'me', name: s.profile.name });
export const npc = (id: string): Party => ({ kind: 'npc', id, name: personOf(id).name });
const first = (name: string) => name.split(' ')[0];

/** When to meet. */
export type When = 'now' | 'tonight' | 'tomorrow';
export const WHEN_LABEL: Record<When, string> = { now: 'Now', tonight: 'Tonight (9 PM)', tomorrow: 'Tomorrow afternoon' };
/** How long they wait for you, in real minutes. */
export const WAIT_MINUTES = 15;
/** How long a hangout lasts, in real minutes. */
export const HANGOUT_MINUTES = 4; // was 15: too long (Peter, 2026-10-15). "Call it a day" still ends it any time.

/** Real ms until the game clock next shows `hour` (today or tomorrow). */
function nextGameHour(hour: number, now: number, plusDays = 0): number {
  const t = nycTime(now);
  let dh = hour - t.hourFloat;
  if (dh <= 0 && plusDays === 0) dh += 24;
  dh += plusDays * 24;
  return now + gameMinutesToRealMs(dh * 60);
}

export function meetTime(when: When, now = nowMs()): number {
  if (when === 'now') return now + 20_000;
  if (when === 'tonight') return nextGameHour(21, now);
  return nextGameHour(14, now, 1);
}

/** Where an outing happens for you. */
export function placeFor(s: GameState, outing: OutingId): string {
  return OUTINGS[outing].placeId ?? s.home.placeId;
}

/** Game hour at a real time. */
const hourAt = (ms: number) => nycTime(ms).hour;

/** A good time for an outing (null = any time is fine). */
function goodHour(outing: OutingId, hour: number): number | null {
  if (outing === 'club' && hour >= 4 && hour < 21) return 22;
  if (outing === 'park' && (hour >= 1 && hour < 7)) return 11;
  if (outing === 'gym' && (hour >= 23 || hour < 5)) return 8;
  if (outing === 'arcade' && hour >= 2 && hour < 10) return 16;
  return null;
}

const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

// ------------------------------------------------------------ the lines
// One light touch per text; most are plain. No line repeats across lists.

const YES: Record<'love' | 'fine', Record<OutingId, string[]>> = {
  love: {
    club: ['say less. wearing the shoes I can’t walk in', 'finally. i’ve been dressed since tuesday', 'bet. i’ll be the one yelling song requests at the DJ'],
    park: ['yes. i need grass under my feet asap', 'omw. bringing the good blanket', 'park? you get me'],
    arcade: ['prepare to lose at air hockey', 'i’ve been practicing pigeon pop. this is not a joke', 'yes. i have $20 in quarters for some reason'],
    gym: ['finally a gym buddy who isn’t my reflection', 'leg day? say less', 'yes. i need a witness for this squat'],
    home: ['omw. do you have snacks or do i bring snacks', 'your place > anywhere with a cover charge', 'yes!! text me the buzzer code'],
  },
  fine: {
    club: ['ok but we leave by 2 (we will not leave by 2)', 'fine. one drink. maybe two.', 'sure, as long as there’s a coat check'],
    park: ['sure, as long as no pigeons get personal', 'ok, i could use some air', 'down'],
    arcade: ['sure. haven’t been since i was 12, so go easy', 'ok, loser buys pretzels', 'down'],
    gym: ['ok. i’ll mostly be on the bike looking at my phone', 'sure, i guess my legs can take it', 'fine, but no burpees'],
    home: ['sure, text me the address', 'ok, i’ll come by', 'down. i’m bringing my own charger'],
  },
};
const NO_AVOID: Record<OutingId, string[]> = {
  club: ['the club? i’d rather ride the 6 at rush hour', 'too loud. i like hearing my own thoughts'],
  park: ['outside? like, with the bees?', 'the last time i touched grass it touched back. pass'],
  arcade: ['i lost $40 to a claw machine in 2019. never again', 'arcades give me a headache, sorry'],
  gym: ['the gym is a scam invented by mirrors', 'i walk up from the subway every day. that’s my cardio'],
  home: ['i’m weird about other people’s apartments, sorry', 'not really a hang-at-home person'],
};
const NO_BUSY = ['can’t today, work’s eating me alive', 'my landlord is “fixing” the radiator, i have to supervise', 'laundry day. it’s a whole expedition here', 'can’t, i’m waiting on a package that says “out for delivery” since 9 AM'];
const NO_GRUMPY = ['not today. today i’m a hermit', 'rain check? i’m not people-ing today', 'i woke up and chose my couch'];
const NO_GRUDGE = ['after last time? no.', 'i’m good, thanks.'];
const NO_TOO_MANY = ['we JUST hung out. let me miss you first', 'twice in one day? who are you, my mom?'];

const pick = (r: Rng, xs: string[]) => xs[Math.floor(r.next() * xs.length)];

export interface Answer {
  status: 'accepted' | 'declined' | 'countered';
  reply: string;
  counter?: { outing: OutingId; at: number; reply: string };
}

/**
 * How an NPC answers an invitation. `rand` is seeded by the invite in the
 * game so the same invite gets the same answer.
 */
export function npcAnswer(s: GameState, personId: string, outing: OutingId, at: number, rand: Rng, now = nowMs()): Answer {
  const p = personOf(personId);
  const m = s.people[personId];
  const mood = moodToday(personId);
  if (!m || !m.hasNumber) return { status: 'declined', reply: 'new phone, who dis' };
  if (m.grudge >= 40 || m.likes <= -20) return { status: 'declined', reply: pick(rand, NO_GRUDGE) };
  const sent = socialOf(s).sentToday;
  if ((sent.day === nycTime(now).dateKey ? sent.counts[personId] ?? 0 : 0) >= 3) return { status: 'declined', reply: pick(rand, NO_TOO_MANY) };
  if (mood === 'busy') {
    return rand.next() < 0.5
      ? { status: 'declined', reply: pick(rand, NO_BUSY) }
      : { status: 'countered', reply: pick(rand, NO_BUSY), counter: { outing, at: meetTime('tomorrow', now), reply: 'tomorrow afternoon tho?' } };
  }
  if (mood === 'grumpy' && rand.next() < 0.6) return { status: 'declined', reply: pick(rand, NO_GRUMPY) };
  const taste = tasteFor(personId, outing);
  if (taste < 0) {
    const fav = favouriteOuting(personId);
    if (fav !== outing && rand.next() < 0.6) {
      return { status: 'countered', reply: pick(rand, NO_AVOID[outing]), counter: { outing: fav, at, reply: `${OUTINGS[fav].emoji} ${OUTINGS[fav].label.toLowerCase()} instead?` } };
    }
    return { status: 'declined', reply: pick(rand, NO_AVOID[outing]) };
  }
  // Wrong time of day (or closed then): suggest a better hour.
  const h = hourAt(at);
  const better = goodHour(outing, h);
  const place = PLACE_BY_ID[placeFor(s, outing)];
  const closed = place && !isOpen(place, h);
  if (better !== null || closed) {
    const hr = better ?? (place?.hours ? (place.hours[0] + 2) % 24 : 18);
    const lines: Record<OutingId, string> = {
      club: `the club at ${fmtHour(h)}? it’s just the bouncer and a mop. ${fmtHour(hr)}?`,
      park: `the park at ${fmtHour(h)} is how documentaries start. ${fmtHour(hr)}?`,
      gym: `${fmtHour(h)}?? the gym’s closed and so am i. ${fmtHour(hr)}?`,
      arcade: `they’re closed rn. ${fmtHour(hr)}?`,
      home: `kinda late. ${fmtHour(hr)}?`,
    };
    return { status: 'countered', reply: lines[outing], counter: { outing, at: nextGameHour(hr, now), reply: `${fmtHour(hr)} works` } };
  }
  const level = m.level;
  const chance = Math.min(0.95, Math.max(0.1, 0.3 + level * 0.14 + taste * 0.15 + (mood === 'great' ? 0.15 : 0) + (p.warmth === 'kind' ? 0.08 : p.warmth === 'mean' ? -0.08 : 0)));
  if (rand.next() < chance) return { status: 'accepted', reply: pick(rand, YES[taste >= 2 ? 'love' : 'fine'][outing]) };
  return rand.next() < 0.5
    ? { status: 'countered', reply: 'can’t then, but', counter: { outing, at: meetTime(hourAt(now) < 18 ? 'tonight' : 'tomorrow', now), reply: hourAt(now) < 18 ? 'tonight?' : 'tomorrow?' } }
    : { status: 'declined', reply: pick(rand, ['can’t this time, next time for sure', 'ahh i have plans, sorry', 'rain check?']) };
}

/** Send an invitation (to an NPC for now: they answer straight away). */
export function sendInvite(s: GameState, personId: string, outing: OutingId, when: When, now = nowMs()): Invite {
  const soc = socialOf(s);
  const day = nycTime(now).dateKey;
  if (soc.sentToday.day !== day) soc.sentToday = { day, counts: {} };
  const at = meetTime(when, now);
  const inv: Invite = { id: `inv-${now}-${Math.floor(Math.random() * 1e6)}`, from: me(s), to: npc(personId), outing, placeId: placeFor(s, outing), at, until: at + WAIT_MINUTES * 60_000, status: 'pending', createdAt: now };
  const ans = npcAnswer(s, personId, outing, at, new Rng(inv.id), now);
  soc.sentToday.counts[personId] = (soc.sentToday.counts[personId] ?? 0) + 1;
  inv.status = ans.status;
  inv.reply = ans.reply;
  inv.counter = ans.counter;
  const m = s.people[personId];
  if (m) logWith(m, OUTINGS[outing].emoji, `You invited them: ${OUTINGS[outing].label.toLowerCase()} (${ans.status === 'accepted' ? 'yes' : ans.status === 'countered' ? 'maybe' : 'no'})`, now);
  soc.invites.unshift(inv);
  if (soc.invites.length > 30) soc.invites.length = 30;
  return inv;
}

/** Take their counter-offer: the invite becomes a plan. */
export function acceptCounter(s: GameState, inviteId: string): Invite | null {
  const inv = socialOf(s).invites.find((i) => i.id === inviteId);
  if (!inv || inv.status !== 'countered' || !inv.counter) return null;
  inv.outing = inv.counter.outing;
  inv.placeId = placeFor(s, inv.outing);
  inv.at = inv.counter.at;
  inv.until = inv.at + WAIT_MINUTES * 60_000;
  inv.status = 'accepted';
  inv.reply = inv.counter.reply;
  inv.counter = undefined;
  return inv;
}

export function cancelInvite(s: GameState, inviteId: string): void {
  const inv = socialOf(s).invites.find((i) => i.id === inviteId);
  if (inv && (inv.status === 'accepted' || inv.status === 'pending' || inv.status === 'countered')) {
    inv.status = 'cancelled';
    const id = inv.to.kind === 'npc' ? inv.to.id : inv.from.id;
    const m = s.people[id];
    if (m) {
      adjustLikes(m, -1);
      logWith(m, '❌', 'You cancelled plans');
    }
  }
}

/** The person on the other side of an invite (not you). */
export const otherOf = (inv: Invite): Party => (inv.from.id === 'me' ? inv.to : inv.from);

/** A plan you should be at right now, here. */
export function planHere(s: GameState, placeId: string, now = nowMs()): Invite | null {
  return socialOf(s).invites.find((i) => i.status === 'accepted' && i.placeId === placeId && now >= i.at - 60_000 && now <= i.until) ?? null;
}

/** Do they show up? Kind people almost always; mean people flake more. */
export function flakes(personId: string, inviteId: string): string | null {
  const p = personOf(personId);
  const r = new Rng(`flake-${inviteId}`);
  const chance = p.warmth === 'kind' ? 0.03 : p.warmth === 'mean' ? 0.16 : 0.08;
  if (r.next() >= chance) return null;
  return pick(r, ['SO sorry, my roommate locked us both out', 'can’t make it, the L just died under the river', 'my cat ate a hair tie, we’re at the vet', 'i lay down “for one sec” at 6. it is now later']);
}

/** They showed up: start hanging out. */
export function startHangout(s: GameState, inv: Invite, now = nowMs()): Hangout {
  const soc = socialOf(s);
  const personId = otherOf(inv).id;
  inv.status = 'done';
  soc.hangout = { inviteId: inv.id, personId, outing: inv.outing, placeId: inv.placeId, startedAt: now, until: now + HANGOUT_MINUTES * 60_000, done: {}, bond: 0 };
  return soc.hangout;
}

/** Hangout over (time's up, or you left). Returns a summary for a toast. */
export function endHangout(s: GameState, now = nowMs()): { personId: string; bond: number } | null {
  const soc = socialOf(s);
  const h = soc.hangout;
  if (!h) return null;
  soc.hangout = null;
  const m = s.people[h.personId];
  if (m) logWith(m, OUTINGS[h.outing].emoji, `Hung out: ${OUTINGS[h.outing].label.toLowerCase()} (+${h.bond} 💛)`, now);
  if (h.bond > 0) s.needs.social = Math.min(100, s.needs.social + 10);
  return { personId: h.personId, bond: h.bond };
}

/** Plans you missed: they waited, you never came. Returns who you stood up. */
export function expirePlans(s: GameState, now = nowMs()): { personId: string; text: string }[] {
  const out: { personId: string; text: string }[] = [];
  for (const inv of socialOf(s).invites) {
    if (inv.status !== 'accepted' || now <= inv.until) continue;
    inv.status = 'expired';
    const id = otherOf(inv).id;
    const m = s.people[id];
    if (m) {
      addBond(m, -6);
      m.grudge = Math.min(100, m.grudge + 5);
      logWith(m, '💀', 'You stood them up', now);
    }
    const lines: Record<OutingId, string> = {
      park: 'waited 15 min at the park. the ducks and i are not speaking to you',
      arcade: 'played pigeon pop alone for 15 min. you owe me $4',
      gym: 'did your sets AND mine. thanks for nothing',
      club: 'paid cover. stood by the rope. alone. cool cool',
      home: 'buzzed for 10 min. your neighbour thinks i’m a burglar now',
    };
    out.push({ personId: id, text: `${first(personOf(id).name)}: “${lines[inv.outing]}”` });
  }
  return out;
}

/**
 * Sometimes a friend invites YOU (friends and closer, about once every
 * 40 real minutes at most). Returns the new invite, if any.
 */
export function maybeIncoming(s: GameState, rand = Math.random, now = nowMs()): Invite | null {
  const soc = socialOf(s);
  // A grace period when you first play (nobody texts you the second you land).
  if (!soc.lastIncoming) {
    soc.lastIncoming = now;
    return null;
  }
  if (now - soc.lastIncoming < 40 * 60_000) return null;
  if (soc.invites.some((i) => i.from.id !== 'me' && i.status === 'pending')) return null;
  const friends = Object.entries(s.people).filter(([id, m]) => m.hasNumber && m.level >= 2 && m.grudge < 30 && moodToday(id) !== 'busy');
  if (!friends.length || rand() > 0.25) return null;
  soc.lastIncoming = now;
  const [id] = friends[Math.floor(rand() * friends.length)];
  const outing = favouriteOuting(id);
  const at = now + 3 * 60_000;
  const lines: Record<OutingId, string> = {
    park: 'park in a bit? i’m bringing bread for the ducks (don’t tell the sign)',
    arcade: 'arcade? i need to beat someone at something today',
    gym: 'gym? i need someone to watch me fail a PR',
    club: 'velvet room tonight. i already picked my outfit, you can’t say no',
    home: 'can i come over? my radiator is doing the clanking thing again',
  };
  const inv: Invite = { id: `inv-${now}-in`, from: npc(id), to: me(s), outing, placeId: placeFor(s, outing), at, until: at + WAIT_MINUTES * 60_000 + 3 * 60_000, status: 'pending', reply: lines[outing], createdAt: now };
  soc.invites.unshift(inv);
  return inv;
}

/** Your answer to an NPC's invite. */
export function answerIncoming(s: GameState, inviteId: string, yes: boolean): Invite | null {
  const inv = socialOf(s).invites.find((i) => i.id === inviteId);
  if (!inv || inv.status !== 'pending' || inv.from.id === 'me') return null;
  inv.status = yes ? 'accepted' : 'declined';
  const m = s.people[inv.from.id];
  if (m) {
    if (yes) addBond(m, 2);
    logWith(m, OUTINGS[inv.outing].emoji, `They invited you: ${OUTINGS[inv.outing].label.toLowerCase()} (${yes ? 'you said yes' : 'you passed'})`);
  }
  return inv;
}
