// =====================================================================
// arcade-beats.ts (sim) — the rules and the music of 🎵 Beat Street
// (ui/arcade/beats.ts), kept pure so they can be tested.
//
// Three original tracks, each with hand-written charts for Easy, Normal
// and Hard. A chart is one 16-step bar (sixteenth notes) per letter of
// the track's arrangement:
//   .        nothing
//   1 2 3 4  a tap in that lane
//   A B C D  a hold in lane 1–4; it lasts through the = that follow
//   =        the hold goes on (can run into the next bar)
//   q w x y z v   two lanes at once: q 1+4 · w 2+3 · x 1+3 · y 2+4 · z 1+2 · v 3+4
// The notes you tap ARE the melody: each lane is a chord tone (low to
// high), so a chart plays the tune and the backing is generated from the
// same arrangement (drums, bass, chord stabs).
//
// Judging: PERFECT ±45 ms, GREAT ±90, GOOD ±135 (Easy is 20% wider).
// Combo ×1…×4 (every 10), 🔥 hype ×2 for 8 s when the hype meter fills,
// misses drain the crowd 😃 (empty = booed off 🍅), grade S–D at the end.
// =====================================================================

export type BeatDiff = 'easy' | 'normal' | 'hard';
export const BEAT_DIFFS: BeatDiff[] = ['easy', 'normal', 'hard'];
export const BEAT_LANES = 4;

export type Groove = 'funk' | 'house' | 'chip';

export interface BeatTrack {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  bpm: number;
  /** The key's root (Hz), and its scale in semitones. */
  root: number;
  scale: number[];
  groove: Groove;
  lead: OscillatorType;
  /** Chords (scale degrees) for the verse and the chorus, one per bar, repeating. */
  verse: number[];
  chorus: number[];
  /** One letter per bar (see SECTIONS). */
  arrangement: string;
  /** Each difficulty's bar for each letter (16 steps). */
  bars: Record<BeatDiff, Record<string, string>>;
}

/** What each arrangement letter means for the backing. */
export const SECTIONS: Record<string, { chords: 'verse' | 'chorus'; drums: 'intro' | 'full' | 'big' | 'break' | 'fill' | 'end' }> = {
  i: { chords: 'verse', drums: 'intro' },
  v: { chords: 'verse', drums: 'full' },
  w: { chords: 'verse', drums: 'full' },
  c: { chords: 'chorus', drums: 'big' },
  d: { chords: 'chorus', drums: 'big' },
  b: { chords: 'verse', drums: 'break' },
  f: { chords: 'chorus', drums: 'fill' },
  e: { chords: 'verse', drums: 'end' },
};

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const BEAT_TRACKS: BeatTrack[] = [
  {
    id: 'cat',
    name: 'Bodega Cat',
    emoji: '🐈',
    blurb: 'Lazy funk · 100 BPM',
    bpm: 100,
    root: 164.81,
    scale: DORIAN,
    groove: 'funk',
    lead: 'square',
    verse: [0, 3, 0, 3],
    chorus: [2, 3, 6, 0],
    arrangement: 'iivwvwcdcdbbvwvwcdfe',
    bars: {
      easy: {
        i: '1.......3.......',
        v: '1...2...3...2...',
        w: '1...2...3...4...',
        c: '1...3...2...4...',
        d: '1...3...A======.',
        b: 'A=======C=======',
        f: '1...2...3...4...',
        e: 'A==========.....',
      },
      normal: {
        i: '1...2...3...2...',
        v: '1..2..3.1...2...',
        w: '1..2..3.4...3.2.',
        c: 'x...2.3.x...3.4.',
        d: 'y...3.2.y...A===',
        b: 'A=======C=======',
        f: '1.2.3.4.4.3.2.1.',
        e: 'q...............',
      },
      hard: {
        i: '1.2.3.2.1.2.3.4.',
        v: '1.21..3.1.2.4.3.',
        w: '1.21..3.4.3.2121',
        c: 'x.2.3.2.x.3.4.32',
        d: 'y.3.2.3.y.21A===',
        b: 'A===2.3.C===3.2.',
        f: '1234321234321.q.',
        e: 'q.w.q.w.A=======',
      },
    },
  },
  {
    id: 'express',
    name: 'Express Train',
    emoji: '🚇',
    blurb: 'Four-on-the-floor house · 122 BPM',
    bpm: 122,
    root: 110,
    scale: MINOR,
    groove: 'house',
    lead: 'sawtooth',
    verse: [0, 5, 2, 6],
    chorus: [5, 6, 0, 4],
    arrangement: 'iivwvwcdcdbbvwvwcdcdfe',
    bars: {
      easy: {
        i: '1.......2.......',
        v: '1...2...1...3...',
        w: '1...2...3...4...',
        c: '1...3...1...4...',
        d: '1...3...A======.',
        b: 'A=======D=======',
        f: '1...2...3...4...',
        e: 'A==========.....',
      },
      normal: {
        i: '1...2...1...3...',
        v: '1...2.3.1...2.4.',
        w: '1...2.3.4...3.2.',
        c: 'x...3.2.x...4.3.',
        d: 'x...3.2.A===4.3.',
        b: 'A=======D=======',
        f: '1.2.3.4.4.3.2.1.',
        e: 'q...............',
      },
      hard: {
        i: '1.2.1.3.1.2.1.4.',
        v: '1.212.3.1.2.1.43',
        w: '1.2.3.4.4.3.2.12',
        c: 'x.3.w.4.x.3.w.4.',
        d: 'x.3.w.43x.3.A===',
        b: 'A===3.2.D===2.3.',
        f: '12341234321.q.q.',
        e: 'q.w.q.w.q.......',
      },
    },
  },
  {
    id: 'lights',
    name: 'Uptown Lights',
    emoji: '🌃',
    blurb: 'Chiptune pop · 140 BPM',
    bpm: 140,
    root: 98,
    scale: MAJOR,
    groove: 'chip',
    lead: 'square',
    verse: [0, 4, 5, 3],
    chorus: [3, 4, 0, 5],
    arrangement: 'iivwvwcdcdbbvwvwcdcdbbcdcdfe',
    bars: {
      easy: {
        i: '1.......3.......',
        v: '1...2...3...2...',
        w: '1...2...3...4...',
        c: '1...3...2...4...',
        d: '1...3...D=======',
        b: 'A=======B=======',
        f: '1...2...3...4...',
        e: 'A==========.....',
      },
      normal: {
        i: '1...2...3...4...',
        v: '1.2...3.1.2...4.',
        w: '1.2...3.4.3...2.',
        c: 'x...3.4.y...2.1.',
        d: 'x...3.4.y...D===',
        b: 'A=======B===3.4.',
        f: '1.2.3.4.4.3.2.1.',
        e: 'q...............',
      },
      hard: {
        i: '1.2.3.4.4.3.2.1.',
        v: '1.21.3.21.2.1.43',
        w: '1.2.3.4.4.3.2121',
        c: 'x.3.4.3.y.2.1.2.',
        d: 'x.3.4.3.y.2.D===',
        b: 'A===3.4.B===4.3.',
        f: '1234432112344321',
        e: 'q.y.x.w.q.......',
      },
    },
  },
];
export const BEAT_BY_ID: Record<string, BeatTrack> = Object.fromEntries(BEAT_TRACKS.map((t) => [t.id, t]));

// ------------------------------------------------------------- time & notes

/** Seconds per sixteenth and per bar. */
export const beatSix = (t: BeatTrack): number => 15 / t.bpm;
export const beatBar = (t: BeatTrack): number => 240 / t.bpm;
/** The song runs from 0 (the first charted bar) to here (plus a ringing tail). */
export const beatSongLength = (t: BeatTrack): number => t.arrangement.length * beatBar(t);

const CHORDS: Record<string, [number, number]> = { q: [0, 3], w: [1, 2], x: [0, 2], y: [1, 3], z: [0, 1], v: [2, 3] };

export interface BeatNote {
  id: number;
  lane: number;
  /** Song time (s) and its sixteenth step. */
  t: number;
  step: number;
  /** Hold length (s); 0 for a tap. */
  len: number;
  steps: number;
}

/** A chart's notes, in time order. Throws on a malformed chart (tests check them all). */
export function beatChart(track: BeatTrack, diff: BeatDiff): BeatNote[] {
  const bars = track.bars[diff];
  const six = beatSix(track);
  let s = '';
  for (const ch of track.arrangement) {
    const b = bars[ch];
    if (b === undefined || b.length !== 16) throw new Error(`${track.id}/${diff}: bar '${ch}' must be 16 steps`);
    s += b;
  }
  const notes: BeatNote[] = [];
  let id = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '.' || c === '=') {
      if (c === '=' && !(i > 0 && (s[i - 1] === '=' || /[A-D]/.test(s[i - 1])))) throw new Error(`${track.id}/${diff}: stray = at step ${i}`);
      continue;
    }
    if (c >= '1' && c <= '4') notes.push({ id: id++, lane: +c - 1, t: i * six, step: i, len: 0, steps: 0 });
    else if (c >= 'A' && c <= 'D') {
      let n = 1;
      while (s[i + n] === '=') n++;
      if (n < 2) throw new Error(`${track.id}/${diff}: a hold needs at least one = (step ${i})`);
      notes.push({ id: id++, lane: c.charCodeAt(0) - 65, t: i * six, step: i, len: n * six, steps: n });
    } else if (CHORDS[c]) for (const l of CHORDS[c]) notes.push({ id: id++, lane: l, t: i * six, step: i, len: 0, steps: 0 });
    else throw new Error(`${track.id}/${diff}: unknown '${c}' at step ${i}`);
  }
  return notes;
}

// ------------------------------------------------------------- the music

const semis = (f: number, n: number) => f * Math.pow(2, n / 12);

/** The note `deg` steps up the track's scale (wraps into higher octaves). */
export function beatDegree(track: BeatTrack, deg: number, octave = 0): number {
  const n = track.scale.length;
  const o = Math.floor(deg / n);
  const st = track.scale[((deg % n) + n) % n];
  return semis(track.root, st + 12 * (o + octave));
}

/** The chord (scale degree) under a bar. */
export function beatChordAt(track: BeatTrack, bar: number): number {
  const sec = SECTIONS[track.arrangement[Math.max(0, Math.min(track.arrangement.length - 1, bar))]] ?? SECTIONS.v;
  if (sec.drums === 'end') return 0;
  const prog = sec.chords === 'chorus' ? track.chorus : track.verse;
  return prog[((bar % prog.length) + prog.length) % prog.length];
}

/** Lanes are chord tones, low to high: root, third, fifth, octave. */
export const LANE_TONES = [0, 2, 4, 7];

/** The pitch a lane plays at a step (the lead line IS the chart). */
export function beatLeadFreq(track: BeatTrack, step: number, lane: number): number {
  const chord = beatChordAt(track, Math.floor(step / 16));
  return beatDegree(track, chord + LANE_TONES[lane], 1);
}

export type BackingHit =
  | { k: 'kick' | 'snare' | 'hat' | 'clap' | 'stick' | 'crash'; g: number }
  | { k: 'bass' | 'stab' | 'pad'; f: number; steps: number; g: number };

/** Count-in (bar −1: four sticks) and the backing for one sixteenth of the song. */
export function beatBacking(track: BeatTrack, step: number): BackingHit[] {
  const out: BackingHit[] = [];
  const st = ((step % 16) + 16) % 16;
  if (step < 0) {
    if (st % 4 === 0) out.push({ k: 'stick', g: st === 0 ? 1 : 0.7 });
    return out;
  }
  const bar = Math.floor(step / 16);
  if (bar >= track.arrangement.length) {
    return out;
  }
  const sec = SECTIONS[track.arrangement[bar]] ?? SECTIONS.v;
  const chord = beatChordAt(track, bar);
  const root = beatDegree(track, chord, -1);
  const fifth = beatDegree(track, chord + 4, -1);
  const d = sec.drums;
  const gr = track.groove;
  if (d === 'end') {
    if (st === 0) {
      out.push({ k: 'kick', g: 1 }, { k: 'crash', g: 1 }, { k: 'bass', f: root, steps: 14, g: 1 });
      for (const deg of [0, 2, 4]) out.push({ k: 'pad', f: beatDegree(track, chord + deg), steps: 14, g: 1 });
    }
    return out;
  }
  if (d === 'break') {
    if (st % 2 === 0) out.push({ k: 'hat', g: st % 4 === 2 ? 0.5 : 0.25 });
    if (st === 0) {
      out.push({ k: 'bass', f: root, steps: 15, g: 0.8 });
      for (const deg of [0, 2, 4]) out.push({ k: 'pad', f: beatDegree(track, chord + deg), steps: 15, g: 0.8 });
    }
    return out;
  }
  const intro = d === 'intro';
  const v = intro ? 0.6 : 1;
  // Drums.
  if (gr === 'house') {
    if (st % 4 === 0) out.push({ k: 'kick', g: 0.9 * v });
    if (!intro && (st === 4 || st === 12)) out.push({ k: 'clap', g: 0.6 });
    if (st % 4 === 2) out.push({ k: 'hat', g: 0.7 * v });
    else if (d === 'big' && st % 2 === 1) out.push({ k: 'hat', g: 0.2 });
  } else if (gr === 'funk') {
    if (st === 0 || st === 3 || st === 10) out.push({ k: 'kick', g: 0.85 * v });
    if (!intro && (st === 4 || st === 12)) out.push({ k: 'snare', g: 0.55 });
    out.push({ k: 'hat', g: (st % 2 === 0 ? 0.4 : 0.18) * v });
    if (d === 'big' && st === 12) out.push({ k: 'clap', g: 0.4 });
  } else {
    if (st % 4 === 0) out.push({ k: 'kick', g: 0.75 * v });
    if (!intro && (st === 4 || st === 12)) out.push({ k: 'snare', g: 0.45 });
    if (st % 2 === 0) out.push({ k: 'hat', g: 0.3 * v });
    if (d === 'big' && st % 2 === 1) out.push({ k: 'hat', g: 0.12 });
  }
  if (d === 'fill' && st >= 12) out.push({ k: 'snare', g: 0.35 + (st - 12) * 0.12 });
  if (d === 'big' && st === 0 && bar % 4 === 0) out.push({ k: 'crash', g: 0.6 });
  // Bass.
  if (gr === 'house') {
    if (st % 4 === 2) out.push({ k: 'bass', f: root, steps: 2, g: 0.8 });
  } else if (gr === 'funk') {
    if ([0, 3, 6, 8, 11, 14].includes(st)) out.push({ k: 'bass', f: st === 11 ? fifth : st === 14 ? root * 2 : root, steps: 1, g: 0.9 });
  } else if (st % 2 === 0) out.push({ k: 'bass', f: st % 4 === 0 ? root : fifth, steps: 1, g: 0.8 });
  // Chord stabs (quiet: the lead is the star).
  const stabs = gr === 'house' ? [2, 6, 10, 14] : gr === 'funk' ? [2, 7, 10, 15] : [0, 8];
  if (!intro && stabs.includes(st)) for (const deg of [0, 2, 4]) out.push({ k: 'stab', f: beatDegree(track, chord + deg), steps: gr === 'chip' ? 6 : 1, g: 0.8 });
  return out;
}

// ------------------------------------------------------------- judging

export type Judgment = 'perfect' | 'great' | 'good' | 'miss';
/** Timing windows (seconds either side). */
export const BEAT_WINDOWS = { perfect: 0.045, great: 0.09, good: 0.135 };
export const beatWindowScale = (diff: BeatDiff): number => (diff === 'easy' ? 1.2 : 1);

/** How a tap this far off the note (s, + = late) is judged, or null when it's outside every window. */
export function beatJudge(delta: number, diff: BeatDiff = 'normal'): Exclude<Judgment, 'miss'> | null {
  const d = Math.abs(delta) / beatWindowScale(diff);
  if (d <= BEAT_WINDOWS.perfect) return 'perfect';
  if (d <= BEAT_WINDOWS.great) return 'great';
  if (d <= BEAT_WINDOWS.good) return 'good';
  return null;
}

export const BEAT_POINTS: Record<Judgment, number> = { perfect: 10, great: 7, good: 4, miss: 0 };
/** Points per sixteenth a hold is held, and for holding it to the end. */
export const BEAT_HOLD_TICK = 2;
export const BEAT_HOLD_BONUS = 5;
export const BEAT_HYPE_SECONDS = 8;
/** Before this song time you can't be booed off (warming up). */
export const BEAT_WARMUP = 8;

export const beatComboMult = (combo: number): number => Math.min(4, 1 + Math.floor(combo / 10));

const CROWD_GAIN: Record<Exclude<Judgment, 'miss'>, number> = { perfect: 0.03, great: 0.02, good: 0.01 };
const HYPE_GAIN: Record<Exclude<Judgment, 'miss'>, number> = { perfect: 0.04, great: 0.028, good: 0.014 };
const MISS_COST: Record<BeatDiff, number> = { easy: 0.05, normal: 0.07, hard: 0.08 };
const GHOST_COST = 0.02;
const DROP_COST = 0.03;
/** Accuracy weights. */
const ACC: Record<Judgment, number> = { perfect: 1, great: 0.75, good: 0.45, miss: 0 };

export type BeatGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export function beatGrade(acc: number, booed: boolean): BeatGrade {
  if (booed) return 'D';
  return acc >= 0.95 ? 'S' : acc >= 0.87 ? 'A' : acc >= 0.75 ? 'B' : acc >= 0.6 ? 'C' : 'D';
}

export type BeatEvent =
  | { type: 'hit'; lane: number; note: number; j: Exclude<Judgment, 'miss'>; delta: number; pts: number; combo: number; hold: boolean }
  | { type: 'miss'; lane: number; note: number; lostCombo: number }
  | { type: 'ghost'; lane: number; lostCombo: number }
  | { type: 'holdDone'; lane: number; note: number; pts: number }
  | { type: 'holdDrop'; lane: number; note: number }
  | { type: 'hype'; on: boolean }
  | { type: 'booed' }
  | { type: 'end' };

interface NoteState {
  res: Judgment | null;
  /** Hold: 'on' while held, then done or dropped. */
  hold: 'none' | 'on' | 'done' | 'drop';
  ticks: number;
}

/** One play of a chart. Feed it song time (s): press/release on input, update every frame. */
export class BeatGame {
  readonly track: BeatTrack;
  readonly diff: BeatDiff;
  readonly notes: BeatNote[];
  readonly state: NoteState[];
  readonly events: BeatEvent[] = [];
  readonly counts = { perfect: 0, great: 0, good: 0, miss: 0, ghost: 0, holds: 0, drops: 0 };
  /** Timing of every hit (s, + = late): the calibration hint at the end. */
  readonly deltas: number[] = [];
  score = 0;
  combo = 0;
  bestCombo = 0;
  crowd = 0.6;
  hype = 0;
  hypeUntil = -1;
  t = -Infinity;
  over = false;
  booed = false;
  bonus = 0;
  private holding: (number | null)[] = Array(BEAT_LANES).fill(null);
  private next = 0; // first note not yet judged (for update)
  readonly end: number;
  private six: number;

  constructor(track: BeatTrack, diff: BeatDiff) {
    this.track = track;
    this.diff = diff;
    this.notes = beatChart(track, diff);
    this.state = this.notes.map(() => ({ res: null, hold: 'none', ticks: 0 }));
    this.end = beatSongLength(track);
    this.six = beatSix(track);
  }

  get hyped(): boolean {
    return this.t < this.hypeUntil;
  }
  get mult(): number {
    return beatComboMult(this.combo) * (this.hyped ? 2 : 1);
  }
  private get good(): number {
    return BEAT_WINDOWS.good * beatWindowScale(this.diff);
  }

  /** Is a lane being held on a hold note right now? (which note) */
  heldNote(lane: number): number | null {
    return this.holding[lane];
  }

  press(lane: number, t: number): BeatEvent | null {
    if (this.over || lane < 0 || lane >= BEAT_LANES) return null;
    const held = this.holding[lane];
    if (held !== null) {
      // Still on a hold that's (nearly) over and the next note is here: the hold counts as done.
      const h = this.notes[held];
      if (t < h.t + h.len - this.good) return null;
      this.finishHold(held, t);
    }
    // The earliest unjudged note in this lane inside the GOOD window.
    let best = -1;
    for (let i = this.next; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > this.good) break;
      if (n.lane !== lane || this.state[i].res !== null) continue;
      if (Math.abs(t - n.t) <= this.good) {
        best = i;
        break;
      }
    }
    if (best < 0) {
      const ev: BeatEvent = { type: 'ghost', lane, lostCombo: this.combo };
      this.combo = 0;
      this.counts.ghost++;
      this.crowdBy(-GHOST_COST, t);
      this.events.push(ev);
      return ev;
    }
    const n = this.notes[best];
    const delta = t - n.t;
    const j = beatJudge(delta, this.diff) ?? 'good';
    this.state[best].res = j;
    this.counts[j]++;
    this.deltas.push(delta);
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const pts = BEAT_POINTS[j] * this.mult;
    this.score += pts;
    this.crowdBy(CROWD_GAIN[j], t);
    if (!this.hyped) {
      this.hype = Math.min(1, this.hype + HYPE_GAIN[j]);
      if (this.hype >= 1) {
        this.hype = 0;
        this.hypeUntil = t + BEAT_HYPE_SECONDS;
        this.events.push({ type: 'hype', on: true });
      }
    }
    if (n.len > 0) {
      this.state[best].hold = 'on';
      this.holding[lane] = best;
    }
    const ev: BeatEvent = { type: 'hit', lane, note: best, j, delta, pts, combo: this.combo, hold: n.len > 0 };
    this.events.push(ev);
    return ev;
  }

  release(lane: number, t: number): void {
    const i = this.holding[lane];
    if (i === null || i === undefined) return;
    const n = this.notes[i];
    this.tickHold(i, Math.min(t, n.t + n.len));
    // Let go within GOOD of the end: that counts as holding it all the way.
    if (t >= n.t + n.len - this.good) this.finishHold(i, t);
    else {
      this.state[i].hold = 'drop';
      this.holding[lane] = null;
      this.counts.drops++;
      this.crowdBy(-DROP_COST, t);
      this.events.push({ type: 'holdDrop', lane, note: i });
    }
  }

  private tickHold(i: number, upTo: number): void {
    const n = this.notes[i];
    const ticks = Math.min(n.steps, Math.floor((upTo - n.t) / this.six + 1e-6));
    const st = this.state[i];
    if (ticks > st.ticks) {
      this.score += (ticks - st.ticks) * BEAT_HOLD_TICK * (this.hyped ? 2 : 1);
      st.ticks = ticks;
    }
  }

  private finishHold(i: number, t: number): void {
    const n = this.notes[i];
    this.tickHold(i, n.t + n.len);
    this.state[i].hold = 'done';
    this.holding[n.lane] = null;
    this.counts.holds++;
    const pts = BEAT_HOLD_BONUS * this.mult;
    this.score += pts;
    this.crowdBy(0.01, t);
    this.events.push({ type: 'holdDone', lane: n.lane, note: i, pts });
  }

  private crowdBy(d: number, t: number): void {
    const floor = t < BEAT_WARMUP ? 0.15 : 0;
    this.crowd = Math.min(1, Math.max(d < 0 ? Math.min(floor, this.crowd) : 0, this.crowd + d));
    if (this.crowd <= 0 && !this.over) {
      this.over = true;
      this.booed = true;
      this.events.push({ type: 'booed' });
    }
  }

  update(t: number): void {
    if (this.over) return;
    const wasHyped = this.hyped;
    this.t = t;
    if (wasHyped && !this.hyped) this.events.push({ type: 'hype', on: false });
    // Holds in progress: score the ticks, finish them at the end.
    for (let l = 0; l < BEAT_LANES; l++) {
      const i = this.holding[l];
      if (i === null) continue;
      const n = this.notes[i];
      if (t >= n.t + n.len) this.finishHold(i, t);
      else this.tickHold(i, t);
    }
    // Notes that went by.
    while (this.next < this.notes.length) {
      const n = this.notes[this.next];
      const st = this.state[this.next];
      if (st.res === null) {
        if (t - n.t <= this.good) break;
        st.res = 'miss';
        this.counts.miss++;
        const lost = this.combo;
        this.combo = 0;
        this.hype = Math.max(0, this.hype - 0.1);
        this.events.push({ type: 'miss', lane: n.lane, note: this.next, lostCombo: lost });
        this.crowdBy(-MISS_COST[this.diff], t);
        if (this.over) return;
      }
      this.next++;
    }
    if (t >= this.end && this.holding.every((h) => h === null)) {
      this.over = true;
      // Clear bonus: up to +200 for accuracy.
      this.bonus = Math.round(this.accuracy() * 200);
      this.score += this.bonus;
      this.events.push({ type: 'end' });
    }
  }

  /** 0..1, weighted (perfect 1, great .75, good .45, miss 0; a dropped hold counts as a miss). */
  accuracy(): number {
    const c = this.counts;
    const holdsTotal = this.notes.filter((n, i) => n.len > 0 && this.state[i].res !== null && this.state[i].res !== 'miss').length;
    const judged = c.perfect + c.great + c.good + c.miss + holdsTotal;
    if (!judged) return 0;
    return (c.perfect * ACC.perfect + c.great * ACC.great + c.good * ACC.good + c.holds) / judged;
  }

  grade(): BeatGrade {
    return beatGrade(this.accuracy(), this.booed);
  }

  /** Median timing (ms, + = late) once there are enough hits to trust it; else null. */
  timingBias(): number | null {
    if (this.deltas.length < 16) return null;
    const s = [...this.deltas].sort((a, b) => a - b);
    return Math.round(s[Math.floor(s.length / 2)] * 1000);
  }
}

// ------------------------------------------------------------- tickets, simulated player

/** 🎟️ for a score: a good Normal run (~4,400 on 🚇 Express Train) is about 40; a flawless Hard run tops out at 120. */
export const beatTickets = (score: number): number => Math.max(0, Math.min(120, Math.floor(score / 110)));

/**
 * A simulated player (skill 0–1) plays a chart: their timing spread and
 * how often they flub a note scale with skill. Used to tune tickets.
 */
export function simulateBeats(track: BeatTrack, diff: BeatDiff, skill: number, seed = 1): BeatGame {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const k = Math.max(0, Math.min(1, skill));
  const spread = 0.075 - 0.06 * k; // s, roughly the standard deviation
  const flub = (0.16 - 0.15 * k) * (diff === 'hard' ? 1.5 : diff === 'easy' ? 0.6 : 1);
  const game = new BeatGame(track, diff);
  const gauss = () => (rand() + rand() + rand() - 1.5) * 1.2;
  const presses: { t: number; lane: number; up: number }[] = [];
  for (const n of game.notes) {
    if (rand() < flub) continue;
    const t = n.t + gauss() * spread;
    const up = n.len > 0 ? (rand() < 0.15 * (1 - k) ? n.t + n.len * 0.5 : n.t + n.len + 0.02) : t + 0.08;
    presses.push({ t, lane: n.lane, up });
  }
  presses.sort((x, y) => x.t - y.t);
  const ups: { t: number; lane: number }[] = [];
  const dt = 1 / 120;
  let pi = 0;
  for (let t = -1; !game.over && t < game.end + 2; t += dt) {
    while (pi < presses.length && presses[pi].t <= t) {
      const p = presses[pi++];
      game.press(p.lane, p.t);
      ups.push({ t: p.up, lane: p.lane });
    }
    for (let u = ups.length - 1; u >= 0; u--) if (ups[u].t <= t) (game.release(ups[u].lane, ups[u].t), ups.splice(u, 1));
    game.update(t);
  }
  return game;
}
