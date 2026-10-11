// =====================================================================
// speech.ts — "Speak loud": what you shout, how it's cleaned up, and how
// the people around you react.
//
// The filter here is a light first pass (rate limit, length, masking
// rude words). When multiplayer arrives, the server must run a proper
// moderation check before relaying anything to other players.
// =====================================================================

import { personOf, memoryOf, moodToday, adjustLikes, remember } from './people.ts';
import type { AreaId, GameState } from './types.ts';

export const SPEECH = {
  maxLength: 80,
  /** Minimum real ms between two shouts. */
  cooldownMs: 4000,
  /** How far people hear you (m). */
  hearing: 15,
  /** At most this many people answer. */
  maxReplies: 2,
};

/** Quick lines for one-tap shouting. */
export const QUICK_LINES = ['Hey! 👋', 'Anyone know a good slice around here?', 'What a day!', 'Who’s going out tonight?', 'I LOVE THIS CITY! 🗽', 'Lost my MetroCard again…', 'Free hugs! 🤗', 'Get out of my way!'];

const RUDE = ['idiot', 'stupid', 'loser', 'ugly', 'dumb', 'shut up', 'out of my way', 'moron', 'trash', 'clown', 'damn', 'hell', 'crap', 'sucks'];
const MASK = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'piss', 'cunt'];

/** Clean up what the player typed. Returns the text to show and whether it was rude. */
export function cleanSpeech(raw: string): { text: string; rude: boolean } {
  let text = raw.replace(/\s+/g, ' ').trim().slice(0, SPEECH.maxLength);
  let rude = false;
  for (const w of MASK) {
    const re = new RegExp(w, 'gi');
    if (re.test(text)) {
      rude = true;
      text = text.replace(re, (m) => m[0] + '*'.repeat(m.length - 1));
    }
  }
  const low = text.toLowerCase();
  if (RUDE.some((w) => low.includes(w))) rude = true;
  return { text, rude };
}

export interface Reply {
  personId: string;
  text: string;
  tone: 'nice' | 'rude';
  /** They're angry enough to come at you. */
  confront?: boolean;
}

const NICE = ['Haha, same!', 'Love the energy!', 'Ayy 🙌', 'Try Slice of Ninth!', 'NYC baby!', 'You good?', 'I’m in! 🎉'];
const MEH = ['…okay?', 'Tourist.', 'Inside voice, please.', '*puts headphones on*'];
const RUDE_BACK = ['Who you talking to?!', 'Watch your mouth.', 'Say that to my face.', 'Keep walking, pal.'];

/**
 * How nearby people react to a shout. Kind people cheer, mean ones snipe,
 * and a rude shout can make a hot-headed person come over.
 */
export function reactions(s: GameState, area: AreaId, listeners: { personId: string; d: number }[], rude: boolean, now: number): Reply[] {
  const out: Reply[] = [];
  for (const l of listeners) {
    if (out.length >= SPEECH.maxReplies) break;
    const p = personOf(l.personId);
    const mood = moodToday(l.personId);
    if (Math.random() < 0.45) continue; // most New Yorkers ignore you
    if (rude) {
      if (p.warmth === 'kind' && p.temper !== 'hot') {
        out.push({ personId: l.personId, text: 'Wow. Rude.', tone: 'rude' });
        continue;
      }
      const m = remember(s, l.personId, area, now);
      adjustLikes(m, -8);
      m.grudge = Math.min(100, m.grudge + 12);
      out.push({ personId: l.personId, text: RUDE_BACK[Math.floor(Math.random() * RUDE_BACK.length)], tone: 'rude', confront: p.temper === 'hot' && Math.random() < 0.6 });
      continue;
    }
    const known = memoryOf(s, l.personId);
    if (p.warmth === 'mean' || mood === 'grumpy') out.push({ personId: l.personId, text: MEH[Math.floor(Math.random() * MEH.length)], tone: 'rude' });
    else out.push({ personId: l.personId, text: known && known.likes > 20 ? `Hey, it’s you! 😄` : NICE[Math.floor(Math.random() * NICE.length)], tone: 'nice' });
  }
  return out;
}
