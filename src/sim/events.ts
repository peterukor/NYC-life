// =====================================================================
// events.ts — random things that happen to you in New York, and the
// "director" that decides when.
//
// HOW CHANCES WORK
//   Every event has a `weight(ctx)` function. It looks at where you
//   are, the time, the weather, your money and skills, and returns how
//   likely the event is right now (0 = impossible). A coffee spill only
//   happens on a train; a bar fight only in a bar at night; the
//   billionaire heir offer is extremely rare and usually a scam.
//
// THE DIRECTOR (inspired by Left 4 Dead's director and RimWorld's
// storytellers) wakes up every few seconds, rolls whether *anything*
// should happen, then picks one event using the weights. It also keeps
// a balance: after two bad events in a row, good events get a boost.
//
// SCAMS teach real street smarts: each one lists red flags. Walk away
// and you learn; fall for it and the game explains what happened and
// how to recover (block, report, call your bank, track your phone).
// =====================================================================

import { dayPart, isRushHour, nowMs, nycTime, type DayPart } from '../core/clock.ts';
import { DIRECTOR_TICK_SECONDS, EVENT_BASE_CHANCE, EVENT_COOLDOWN_SECONDS, EVENT_MIN_GAP_SECONDS } from '../core/constants.ts';
import { money } from '../core/format.ts';
import { weightedIndex } from '../core/rng.ts';
import type { PlaceType } from '../data/places.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet, applyNeeds, computeMood } from './needs.ts';
import { postNews } from './news.ts';
import { skillGainMultiplier } from './state.ts';
import type { AreaId, GameState, NeedKey, SkillKey } from './types.ts';
import { isWet, weatherFor, type Weather } from './weather.ts';

/** Everything an event needs to decide if it fits the moment. */
export interface EventContext {
  s: GameState;
  area: AreaId;
  where: PlaceType | 'street' | 'subway';
  hour: number;
  part: DayPart;
  rush: boolean;
  weather: Weather;
  mood: number;
  skill: (k: SkillKey) => number;
}

/** What happens after you choose. Applied by `applyOutcome`. */
export interface Outcome {
  text: string;
  tone: 'good' | 'bad' | 'info';
  money?: number;
  needs?: Partial<Record<NeedKey, number>>;
  moodlet?: { id: string; label: string; emoji: string; value: number; minutes: number };
  skill?: { key: SkillKey; gain: number };
  loseMoneyPercent?: number;
  phoneLost?: string;
  scam?: 'fell' | 'spotted';
  news?: { scope: 'city' | AreaId; emoji: string; headline: string };
  /** Extra lesson shown after a scam: how to recover in real life. */
  lesson?: string;
}

export interface EventChoice {
  label: string;
  emoji: string;
  hint?: string;
  /** Hide this choice unless the condition holds (e.g. high street smarts). */
  show?: (c: EventContext) => boolean;
  run: (c: EventContext) => Outcome;
}

export interface RandomEventDef {
  id: string;
  title: string;
  emoji: string;
  /** Rough tone, used by the director to keep good and bad balanced. */
  kind: 'good' | 'bad' | 'mixed' | 'scam';
  weight: (c: EventContext) => number;
  text: (c: EventContext) => string;
  /** Warning signs a sharp New Yorker would notice. Shown after the event. */
  redFlags?: string[];
  choices: EventChoice[];
}

const chance = (p: number) => Math.random() < p;
const cash = (c: EventContext) => c.s.money;

// ---------------------------------------------------------------------
// The events themselves. Add new ones to this list; nothing else changes.
// ---------------------------------------------------------------------
export const EVENTS: RandomEventDef[] = [
  // ---------------- On the subway ----------------
  {
    id: 'coffeeSpill', title: 'Rush-hour coffee spill', emoji: '☕', kind: 'bad',
    weight: (c) => (c.where === 'subway' ? (c.rush ? 3 : 1) : 0),
    text: () => 'The train lurches. The guy next to you wears his iced coffee… and so do you.',
    choices: [
      { label: 'Laugh it off', emoji: '😂', run: () => ({ text: 'You both laugh. He offers napkins and a weird compliment about your shoes.', tone: 'info', needs: { hygiene: -15, social: 8 } }) },
      { label: 'Give him a look', emoji: '😤', run: () => ({ text: 'Classic New York stare-down. You win. You’re still sticky.', tone: 'bad', needs: { hygiene: -15 }, moodlet: { id: 'sticky', label: 'Covered in coffee', emoji: '☕', value: -10, minutes: 60 } }) },
    ],
  },
  {
    id: 'showtime', title: '“What time is it?” SHOWTIME!', emoji: '🕺', kind: 'good',
    weight: (c) => (c.where === 'subway' ? 2 : 0),
    text: () => 'Three dancers swing from the poles, inches from your face. The whole car is filming.',
    choices: [
      { label: 'Tip $5', emoji: '💵', show: (c) => cash(c) >= 500, run: () => ({ text: 'They flip off the pole and bow to you specifically. Iconic.', tone: 'good', money: -500, moodlet: { id: 'showtime', label: 'Caught a Showtime', emoji: '🕺', value: 14, minutes: 90 } }) },
      { label: 'Just watch', emoji: '👀', run: () => ({ text: 'You keep your head down. A sneaker misses you by a centimetre.', tone: 'info', needs: { fun: 10 } }) },
    ],
  },
  {
    id: 'signalProblems', title: 'Signal problems', emoji: '🚦', kind: 'bad',
    weight: (c) => (c.where === 'subway' ? (c.rush ? 3 : 1) * (isWet(c.weather) ? 2 : 1) : 0),
    text: () => '“We are being held momentarily by the train’s dispatcher.” It has been eleven minutes.',
    choices: [
      { label: 'Read a book', emoji: '📖', run: () => ({ text: 'You finish a chapter. The train moves. Small win.', tone: 'info', needs: { fun: 4 } }) },
      { label: 'Complain to strangers', emoji: '🗣️', run: () => ({ text: 'Instant bonding with the whole car over mutual suffering.', tone: 'info', needs: { social: 14, fun: -4 } }) },
    ],
  },
  {
    id: 'mariachi', title: 'Mariachi on the train', emoji: '🎺', kind: 'good',
    weight: (c) => (c.where === 'subway' && c.hour >= 11 && c.hour <= 21 ? 1.2 : 0),
    text: () => 'A mariachi band boards at the next stop and launches into a love song. A couple across from you starts slow-dancing.',
    choices: [
      { label: 'Sing along', emoji: '🎶', run: (c) => ({ text: 'You don’t know the words. Nobody cares. Best ride ever.', tone: 'good', needs: { fun: 20, social: 10 }, skill: c.skill('music') < 5 ? { key: 'music', gain: 0.2 } : undefined }) },
      { label: 'Tip $3', emoji: '💵', show: (c) => cash(c) >= 300, run: () => ({ text: 'The trumpet player winks at you. Worth it.', tone: 'good', money: -300, needs: { fun: 14 } }) },
    ],
  },
  {
    id: 'phoneSwap', title: 'Wait… this isn’t your phone', emoji: '📱', kind: 'mixed',
    weight: (c) => (c.where === 'subway' || c.where === 'street' ? 0.5 : 0),
    text: () => 'You reach for your phone and find an identical one with a cracked case. Someone just stepped off with yours.',
    choices: [
      { label: 'Call your own number', emoji: '📞', run: (c) => (chance(0.6 + c.skill('streetSmarts') * 0.08)
        ? { text: 'A flustered nurse answers. You meet at the next stop and swap. She gives you a granola bar.', tone: 'good', needs: { social: 12, hunger: 8 }, moodlet: { id: 'kindStranger', label: 'Faith in humanity', emoji: '💛', value: 10, minutes: 120 } }
        : { text: 'Voicemail. Your phone is somewhere in Queens now.', tone: 'bad', phoneLost: 'Swapped on the train', lesson: 'Use “Find My” from another device, then report it lost to your carrier so nobody can use your number.' }) },
      { label: 'Chase them', emoji: '🏃', run: () => (chance(0.4)
        ? { text: 'You catch them at the turnstile. Embarrassed laughter all round.', tone: 'good', needs: { energy: -8, fun: 10 } }
        : { text: 'The doors close in your face. Classic.', tone: 'bad', needs: { energy: -8 }, phoneLost: 'Swapped on the train', lesson: 'Use “Find My” from another device, then report it lost to your carrier.' }) },
    ],
  },
  {
    id: 'pickpocket', title: 'A bump in the crowd', emoji: '🫳', kind: 'bad',
    weight: (c) => ((c.where === 'subway' || c.where === 'plaza') && c.rush ? 1 : c.where === 'plaza' ? 0.6 : 0),
    text: () => 'Someone bumps you hard in the crowd, says sorry, and keeps moving fast.',
    redFlags: ['A hard bump in a crowd', 'They apologise and leave quickly', 'Wallet in a back pocket'],
    choices: [
      { label: 'Check your pockets', emoji: '👖', run: (c) => (chance(0.45 + c.skill('streetSmarts') * 0.1)
        ? { text: 'You feel the hand and grab your wallet back. They vanish into the crowd.', tone: 'good', scam: 'spotted', skill: { key: 'streetSmarts', gain: 0.5 } }
        : { text: 'Wallet’s lighter. They got some cash.', tone: 'bad', loseMoneyPercent: 0.25, scam: 'fell', lesson: 'Keep your wallet in a front pocket, and keep most money in the bank (the Bank app) — it can’t be stolen.' }) },
      { label: 'Ignore it', emoji: '🤷', run: () => ({ text: 'Later you notice your cash is gone.', tone: 'bad', loseMoneyPercent: 0.3, scam: 'fell', lesson: 'In crowds, a hard bump is a classic pickpocket move. Check immediately.' }) },
    ],
  },

  // ---------------- On the street ----------------
  {
    id: 'bump', title: 'Sidewalk collision', emoji: '💥', kind: 'mixed',
    weight: (c) => (c.where === 'street' ? (c.rush ? 2.5 : 1) : 0),
    text: () => 'You’re texting, they’re texting. You collide at full Midtown speed.',
    choices: [
      { label: 'Apologise', emoji: '🙏', run: () => ({ text: 'Turns out they’re cool. You trade “sorry”s and a laugh.', tone: 'good', needs: { social: 10 } }) },
      { label: '“Watch where you’re going!”', emoji: '😠', run: () => (chance(0.5)
        ? { text: 'They back down. You feel weirdly powerful.', tone: 'info', needs: { fun: 4 } }
        : { text: 'They do NOT back down. A 4-minute argument ruins your mood.', tone: 'bad', moodlet: { id: 'argued', label: 'Sidewalk beef', emoji: '😤', value: -12, minutes: 60 } }) },
    ],
  },
  {
    id: 'fight', title: 'A fight breaks out', emoji: '🥊', kind: 'bad',
    weight: (c) => ((c.where === 'street' || c.where === 'nightlife') && (c.part === 'night' || c.part === 'lateNight') ? 1.2 : 0),
    text: () => 'Two guys outside the bar start shoving over who was first in line for the halal cart.',
    choices: [
      { label: 'Walk away', emoji: '🚶', run: () => ({ text: 'Smart. You hear sirens a minute later.', tone: 'info', skill: { key: 'streetSmarts', gain: 0.3 } }) },
      { label: 'Try to break it up', emoji: '✋', run: (c) => (chance(0.35 + c.skill('charisma') * 0.1)
        ? { text: 'You talk them down. They end up sharing a platter. Legend.', tone: 'good', moodlet: { id: 'peacemaker', label: 'Peacemaker', emoji: '🕊️', value: 14, minutes: 120 }, skill: { key: 'charisma', gain: 0.4 } }
        : { text: 'You catch an elbow. Your ego and your face are bruised.', tone: 'bad', needs: { energy: -10 }, moodlet: { id: 'elbow', label: 'Caught an elbow', emoji: '🤕', value: -16, minutes: 120 } }) },
      { label: 'Film it', emoji: '📹', show: (c) => c.s.phone.ok, run: () => ({ text: 'Your video gets 40k views. You feel slightly bad about it.', tone: 'info', needs: { fun: 10, social: 6 } }) },
    ],
  },
  {
    id: 'found20', title: 'Twenty on the ground', emoji: '💵', kind: 'good',
    weight: (c) => (c.where === 'street' || c.where === 'park' ? 0.6 : 0),
    text: () => 'A crumpled $20 bill is blowing down the sidewalk towards you.',
    choices: [
      { label: 'Pocket it', emoji: '🤑', run: () => ({ text: 'Finders keepers. Lunch is on the universe.', tone: 'good', money: 2_000 }) },
      { label: 'Look for the owner', emoji: '🔎', run: () => (chance(0.5)
        ? { text: 'An older lady was looking for it. She hugs you. You feel amazing.', tone: 'good', moodlet: { id: 'goodSamaritan', label: 'Good Samaritan', emoji: '😇', value: 18, minutes: 180 } }
        : { text: 'Nobody claims it. You keep it with a clear conscience.', tone: 'good', money: 2_000 }) },
    ],
  },
  {
    id: 'touristDirections', title: 'Lost tourists', emoji: '🗺️', kind: 'good',
    weight: (c) => (c.area === 'manhattan' && (c.where === 'street' || c.where === 'plaza') && c.hour >= 9 && c.hour <= 21 ? 1.3 : 0),
    text: () => 'A family in matching I ♥ NY shirts asks how to get to the Empire State Building.',
    choices: [
      { label: 'Give perfect directions', emoji: '🧭', run: () => ({ text: '“Two blocks east, then down Fifth.” They thank you like you saved their trip.', tone: 'good', needs: { social: 12 }, skill: { key: 'charisma', gain: 0.25 } }) },
      { label: 'Point vaguely and keep walking', emoji: '👉', run: () => ({ text: 'Very New York of you.', tone: 'info', needs: { fun: 2 } }) },
    ],
  },
  {
    id: 'puddleSplash', title: 'Puddle ambush', emoji: '🌊', kind: 'bad',
    weight: (c) => (c.where === 'street' && isWet(c.weather) ? 2.2 : 0),
    text: () => 'A cab hits the corner puddle at full speed. It’s mostly on you.',
    choices: [
      { label: 'Shake your fist', emoji: '✊', run: () => ({ text: 'The cab is gone. Your socks are not dry.', tone: 'bad', needs: { hygiene: -20 }, moodlet: { id: 'soaked', label: 'Soaked', emoji: '💦', value: -12, minutes: 90 } }) },
      { label: 'Accept your fate', emoji: '🧘', run: () => ({ text: 'You are one with the city now. Wet, but at peace.', tone: 'info', needs: { hygiene: -20 } }) },
    ],
  },
  {
    id: 'streetSinger', title: 'Voice of an angel', emoji: '🎤', kind: 'good',
    weight: (c) => (c.where === 'street' || c.where === 'plaza' || c.where === 'park' ? 1 : 0),
    text: () => 'A woman with a tiny amp is singing soul on the corner. A crowd is gathering.',
    choices: [
      { label: 'Stay and listen', emoji: '🎶', run: () => ({ text: 'Goosebumps. This city, man.', tone: 'good', moodlet: { id: 'streetSoul', label: 'Street concert', emoji: '🎤', value: 12, minutes: 90 } }) },
      { label: 'Tip $5', emoji: '💵', show: (c) => cash(c) >= 500, run: () => ({ text: 'She nods mid-note. You feel part of something.', tone: 'good', money: -500, moodlet: { id: 'streetSoul', label: 'Street concert', emoji: '🎤', value: 16, minutes: 120 } }) },
    ],
  },
  {
    id: 'freeSample', title: 'Free samples!', emoji: '🧁', kind: 'good',
    weight: (c) => (c.where === 'street' || c.where === 'plaza' ? 0.8 : 0),
    text: () => 'Someone in a giant cupcake costume is handing out free samples of a new snack.',
    choices: [
      { label: 'Take three', emoji: '😋', run: () => ({ text: 'Sugar rush achieved.', tone: 'good', needs: { hunger: 15, fun: 8 } }) },
      { label: 'Politely decline', emoji: '🙅', run: () => ({ text: 'You walk on, slightly regretting it.', tone: 'info' }) },
    ],
  },
  {
    id: 'phoneSnatch', title: 'Phone snatched!', emoji: '🚲', kind: 'bad',
    weight: (c) => (c.where === 'street' && c.s.phone.ok && (c.part === 'night' || c.part === 'lateNight') ? 0.35 : 0),
    text: () => 'A guy on an e-bike rides past and yanks the phone right out of your hand.',
    redFlags: ['Phone held loosely at the curb', 'Late at night on a quiet block', 'E-bike riding close to the sidewalk'],
    choices: [
      { label: 'Yell and give chase', emoji: '🏃', run: () => ({ text: 'He’s gone. You’re out of breath and out of a phone.', tone: 'bad', needs: { energy: -10 }, phoneLost: 'Snatched on the street', lesson: 'Don’t chase — it’s dangerous. Track it with “Find My”, report it to police (non-emergency), and lock it remotely.' }) },
      { label: 'Stay calm, note details', emoji: '📝', run: (c) => ({ text: 'You note the bike and the direction. Useful for the police report.', tone: 'bad', phoneLost: 'Snatched on the street', skill: { key: 'streetSmarts', gain: 0.5 }, lesson: c.skill('streetSmarts') >= 2 ? 'Good instincts. Now track it with “Find My” and file a report.' : 'Track it with “Find My”, file a police report and lock it remotely.' }) },
    ],
  },
  {
    id: 'dogWalker', title: 'Hold this for a sec?', emoji: '🐕', kind: 'good',
    weight: (c) => (c.where === 'park' || c.where === 'street' ? 0.8 : 0),
    text: () => 'A frantic dog walker with seven leashes asks you to hold two while she untangles the rest.',
    choices: [
      { label: 'Sure!', emoji: '🐶', run: () => ({ text: 'A corgi falls in love with you. You might too.', tone: 'good', needs: { fun: 18, social: 8 }, moodlet: { id: 'dogLove', label: 'Puppy love', emoji: '🐶', value: 12, minutes: 120 } }) },
      { label: 'Sorry, in a rush', emoji: '⏱️', run: () => ({ text: 'You walk off. A pug judges you silently.', tone: 'info' }) },
    ],
  },

  // ---------------- Scams ----------------
  {
    id: 'monkBracelet', title: 'A gift for you', emoji: '📿', kind: 'scam',
    weight: (c) => (c.where === 'plaza' && c.area === 'manhattan' ? 1.4 : c.where === 'street' ? 0.3 : 0),
    text: () => 'A man in robes presses a “free” bracelet onto your wrist and opens a notebook of names and donation amounts. “Peace for you. Twenty dollars.”',
    redFlags: ['A “free gift” put on you before you agree', 'A notebook showing others “donated” big amounts', 'Pressure to pay on the spot'],
    choices: [
      { label: 'Give $20', emoji: '💵', show: (c) => cash(c) >= 2_000, run: () => ({ text: 'He’s gone in seconds, on to the next tourist.', tone: 'bad', money: -2_000, scam: 'fell', lesson: 'Times Square “monk” bracelets are a known scam. You can hand the item back and keep walking.' }) },
      { label: 'Hand it back and walk', emoji: '🚶', run: () => ({ text: 'You return the bracelet with a smile. He moves on.', tone: 'good', scam: 'spotted', skill: { key: 'streetSmarts', gain: 0.6 } }) },
    ],
  },
  {
    id: 'costumePhoto', title: 'Photo with a superhero?', emoji: '🦸', kind: 'scam',
    weight: (c) => (c.where === 'plaza' && c.area === 'manhattan' && c.hour >= 10 ? 1.2 : 0),
    text: () => 'A slightly-off-brand superhero throws an arm around you for a selfie, then demands $40 “for the photo”.',
    redFlags: ['They started the photo, not you', 'Price announced after the fact', 'Being blocked from walking off'],
    choices: [
      { label: 'Pay up', emoji: '💸', show: (c) => cash(c) >= 4_000, run: () => ({ text: 'You paid $40 for a blurry selfie.', tone: 'bad', money: -4_000, scam: 'fell', lesson: 'Costumed characters work for tips — you don’t owe a set fee. Say “no thanks” and walk; police patrol the plaza if they get pushy.' }) },
      { label: 'Tip $2, keep walking', emoji: '🪙', show: (c) => cash(c) >= 200, run: () => ({ text: 'He grumbles. You keep walking. Fair is fair.', tone: 'good', money: -200, scam: 'spotted', skill: { key: 'streetSmarts', gain: 0.5 } }) },
      { label: '“I didn’t ask for this”', emoji: '🙅', run: () => ({ text: 'He shrugs and finds a new target.', tone: 'good', scam: 'spotted', skill: { key: 'streetSmarts', gain: 0.6 } }) },
    ],
  },
  {
    id: 'threeCardMonte', title: 'Find the lady', emoji: '🃏', kind: 'scam',
    weight: (c) => (c.where === 'street' || c.where === 'plaza' ? 0.6 : 0),
    text: () => 'A guy is shuffling three cards on a cardboard box. Someone in the crowd just won $100 “easy”.',
    redFlags: ['The “winner” is part of the crew', 'Easy money on a cardboard box', 'Lookouts watching for police'],
    choices: [
      { label: 'Bet $50', emoji: '🎲', show: (c) => cash(c) >= 5_000, run: () => ({ text: 'You were SURE it was the middle one. It wasn’t. It never is.', tone: 'bad', money: -5_000, scam: 'fell', lesson: 'Three-card monte can’t be won — the dealer palms the card and the “winners” are shills.' }) },
      { label: 'Watch, then leave', emoji: '👀', run: () => ({ text: 'You spot the shill high-fiving the dealer later. Nice catch.', tone: 'good', scam: 'spotted', skill: { key: 'streetSmarts', gain: 0.7 } }) },
    ],
  },
  {
    id: 'fakeRecruiter', title: 'A “recruiter” DMs you', emoji: '💼', kind: 'scam',
    weight: (c) => (c.s.phone.ok && c.skill('coding') < 3 ? 0.5 : 0),
    text: () => '“Hi! A top tech company loved your profile. $180k remote role. Just pay a $300 training-kit fee and send your bank login to set up payroll.”',
    redFlags: ['A job that asks YOU to pay', 'Asking for bank logins', 'Too good to be true for your experience'],
    choices: [
      { label: 'Pay the fee', emoji: '💳', show: (c) => cash(c) >= 30_000, run: () => ({ text: 'The account disappears. So does your $300.', tone: 'bad', money: -30_000, scam: 'fell', lesson: 'Real employers never charge you to be hired or ask for your bank login. Report the account, and call your bank if you shared any details.', news: { scope: 'city', emoji: '⚠️', headline: 'Fake tech-recruiter scam hits job seekers; police urge caution' } }) },
      { label: 'Block and report', emoji: '🚫', run: () => ({ text: 'Blocked. You feel 10% smarter.', tone: 'good', scam: 'spotted', skill: { key: 'streetSmarts', gain: 0.6 } }) },
    ],
  },
  {
    id: 'realRecruiter', title: 'A real recruiter', emoji: '🚀', kind: 'good',
    weight: (c) => (c.skill('coding') >= 3 && (c.where === 'cafe' || c.where === 'work') ? 0.9 : 0),
    text: () => 'The person at the next table noticed your code. She’s a recruiter at a Brooklyn startup and hands you a card — no fees, just an interview.',
    choices: [
      { label: 'Take the card', emoji: '🪪', run: () => ({ text: 'Tech jobs in DUMBO are open to you (Phone → Jobs). She didn’t ask for a cent — that’s how you know it’s real.', tone: 'good', moodlet: { id: 'headhunted', label: 'Headhunted', emoji: '🚀', value: 16, minutes: 240 } }) },
      { label: 'Not looking right now', emoji: '🙂', run: () => ({ text: 'She smiles. “Offer stands.”', tone: 'info' }) },
    ],
  },
  {
    id: 'billionaireKid', title: 'Charming stranger', emoji: '🥂', kind: 'mixed',
    weight: (c) => ((c.where === 'nightlife' || c.where === 'landmark') && (c.part === 'evening' || c.part === 'night') ? 0.18 : 0),
    text: () => 'You hit it off with someone who mentions, very casually, that their family owns “a few buildings on Park”.',
    choices: [
      { label: 'Swap numbers', emoji: '💌', run: () => (chance(0.55)
        ? { text: 'They text first. Dinner next week. Romance storylines are coming in a future update!', tone: 'good', moodlet: { id: 'crush', label: 'New crush', emoji: '💘', value: 20, minutes: 60 * 12 } }
        : { text: 'They ask you to “cover the bill, my cards are frozen”. Hmm.', tone: 'bad', scam: 'spotted', lesson: 'Real rich people rarely need you to pay. Watch for sudden money requests early on — a classic romance-scam sign.' }) },
      { label: 'Keep it cool', emoji: '😎', run: () => ({ text: 'You play it cool. Mysterious. They’re intrigued.', tone: 'info', needs: { social: 10 } }) },
    ],
  },
  {
    id: 'heirOffer', title: 'An old billionaire seeks an heir', emoji: '🏦', kind: 'scam',
    // Extremely rare, and (for now) almost always a scam. The real heir
    // challenge becomes a multi-week multiplayer storyline later.
    weight: (c) => (c.s.phone.ok ? 0.05 : 0),
    text: () => 'An email: “I am a billionaire with no children. I have chosen YOU as my heir. Wire $500 to my lawyer to process the paperwork.”',
    redFlags: ['A stranger choosing you for a fortune', 'Upfront “processing” fees', 'Urgency and secrecy'],
    choices: [
      { label: 'Wire the $500', emoji: '💸', show: (c) => cash(c) >= 50_000, run: () => ({ text: 'The “lawyer” never replies again.', tone: 'bad', money: -50_000, scam: 'fell', lesson: 'Inheritance and lottery emails that ask for fees are always scams. Delete, report as phishing, and never wire money to strangers.', news: { scope: 'city', emoji: '🏦', headline: 'Another “billionaire heir” email scam sweeps the city' } }) },
      { label: 'Report as phishing', emoji: '🛡️', run: () => ({ text: 'Reported and deleted. If it sounds too good to be true…', tone: 'good', scam: 'spotted', skill: { key: 'streetSmarts', gain: 0.8 } }) },
    ],
  },

  // ---------------- Inside places ----------------
  {
    id: 'drinkBought', title: 'A drink from a stranger', emoji: '🍹', kind: 'good',
    weight: (c) => (c.where === 'nightlife' ? 1.2 : 0),
    text: () => 'The bartender slides a drink over. “From the table by the window.” They raise a glass.',
    choices: [
      { label: 'Go say thanks', emoji: '👋', run: () => ({ text: 'Great conversation. You leave with a new friend.', tone: 'good', needs: { social: 22, fun: 12 } }) },
      { label: 'Nod and stay put', emoji: '🙂', run: () => ({ text: 'A nod across the bar. Very cinematic.', tone: 'info', needs: { fun: 8 } }) },
    ],
  },
  {
    id: 'bodegaCatEvent', title: 'The bodega cat chose you', emoji: '🐈', kind: 'good',
    weight: (c) => (c.where === 'food' ? 0.9 : 0),
    text: () => 'The bodega cat jumps onto the counter and headbutts your hand. The owner gasps: “He never does that.”',
    choices: [
      { label: 'Accept the honour', emoji: '👑', run: () => ({ text: 'You are now neighbourhood royalty.', tone: 'good', moodlet: { id: 'catChosen', label: 'Chosen by the cat', emoji: '🐈', value: 15, minutes: 180 } }) },
    ],
  },
  {
    id: 'bossPraise', title: 'Boss stops by your desk', emoji: '👔', kind: 'good',
    weight: (c) => (c.where === 'work' && c.s.job ? 0.8 : 0),
    text: () => 'Your manager says the client loved your work and you should “keep doing that”.',
    choices: [
      { label: 'Ask for a raise', emoji: '💰', run: (c) => (chance(0.3 + c.skill('charisma') * 0.08)
        ? { text: 'She says yes — a one-time bonus!', tone: 'good', money: 15_000 }
        : { text: '“Let’s revisit at review time.” Classic.', tone: 'info' }) },
      { label: 'Say thanks', emoji: '🙏', run: () => ({ text: 'You glow for the rest of the shift.', tone: 'good', moodlet: { id: 'praised', label: 'Boss praised you', emoji: '⭐', value: 12, minutes: 180 } }) },
    ],
  },
  {
    id: 'ratSighting', title: 'Rat!', emoji: '🐀', kind: 'mixed',
    weight: (c) => (c.where === 'subway' || (c.where === 'street' && (c.part === 'night' || c.part === 'lateNight')) ? 1 : 0),
    text: () => 'A rat the size of a small dog strolls past carrying an entire slice of pizza.',
    choices: [
      { label: 'Film it', emoji: '📹', show: (c) => c.s.phone.ok, run: () => ({ text: 'Your video goes semi-viral. You are a citizen journalist now.', tone: 'good', needs: { fun: 15 }, news: { scope: 'city', emoji: '🐀', headline: 'Viral video: rat spotted carrying full slice; city reacts' } }) },
      { label: 'Climb on a bench', emoji: '😱', run: () => ({ text: 'Nobody judges you. Everyone has been there.', tone: 'info', needs: { fun: 4 } }) },
    ],
  },
];

export const EVENT_BY_ID: Record<string, RandomEventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// ---------------------------------------------------------------------
// Director
// ---------------------------------------------------------------------

export function buildContext(s: GameState, where: EventContext['where']): EventContext {
  const t = nycTime();
  return {
    s,
    area: s.location.area,
    where,
    hour: t.hour,
    part: dayPart(t.hour),
    rush: isRushHour(t),
    weather: weatherFor(t.dateKey, t.hour),
    mood: computeMood(s).score,
    skill: (k) => s.skills[k],
  };
}

/** Recent event tones, newest last; used to balance good and bad luck. */
const recentKinds: RandomEventDef['kind'][] = [];

/**
 * Called by the game loop every DIRECTOR_TICK_SECONDS. Returns an event
 * to show, or null if nothing happens this time.
 */
export function directorPick(s: GameState, where: EventContext['where'], force = false): RandomEventDef | null {
  const now = nowMs();
  if (!force && now - s.events.lastFiredAt < EVENT_MIN_GAP_SECONDS * 1000) return null;
  if (!force && Math.random() > EVENT_BASE_CHANCE) return null;

  const ctx = buildContext(s, where);
  const lastTwoBad = recentKinds.slice(-2).every((k) => k === 'bad' || k === 'scam') && recentKinds.length >= 2;

  const candidates = EVENTS.filter((e) => (s.events.cooldowns[e.id] ?? 0) <= now);
  const weights = candidates.map((e) => {
    let w = e.weight(ctx);
    if (w <= 0) return 0;
    if (lastTwoBad && e.kind === 'good') w *= 2.5;
    if (lastTwoBad && (e.kind === 'bad' || e.kind === 'scam')) w *= 0.3;
    // Streetwise players attract fewer scams; they look like they know.
    if (e.kind === 'scam' && s.profile.traits.includes('streetwise')) w *= 0.6;
    return w;
  });
  const i = weightedIndex(weights);
  if (i < 0) return null;
  const ev = candidates[i];
  s.events.lastFiredAt = now;
  s.events.cooldowns[ev.id] = now + EVENT_COOLDOWN_SECONDS * 1000;
  s.stats.eventsSeen[ev.id] = (s.stats.eventsSeen[ev.id] ?? 0) + 1;
  recentKinds.push(ev.kind);
  if (recentKinds.length > 6) recentKinds.shift();
  return ev;
}

export { DIRECTOR_TICK_SECONDS };

/** Apply what a choice did. Returns the final text to show (with money details). */
export function applyOutcome(s: GameState, o: Outcome): string {
  let text = o.text;
  if (o.money) {
    const r = changeMoney(s, o.money, 'Street life');
    if (!r.ok && o.money < 0) {
      // Couldn't afford it: take what's there instead.
      const take = s.money;
      if (take > 0) changeMoney(s, -take, 'Street life');
    }
  }
  if (o.loseMoneyPercent) {
    const lost = Math.round((s.money * o.loseMoneyPercent) / 100) * 100;
    if (lost > 0) {
      changeMoney(s, -lost, 'Pickpocketed');
      text += ` You lost ${money(lost)}.`;
    }
  }
  if (o.needs) applyNeeds(s, o.needs);
  if (o.moodlet) addMoodlet(s, o.moodlet);
  if (o.skill) s.skills[o.skill.key] += o.skill.gain * skillGainMultiplier(s, o.skill.key);
  if (o.phoneLost) s.phone = { ok: false, lostReason: o.phoneLost };
  if (o.scam === 'fell') s.stats.scamsFallenFor += 1;
  if (o.scam === 'spotted') s.stats.scamsSpotted += 1;
  if (o.news) postNews(s, { ...o.news, personal: true });
  return text;
}
