// =====================================================================
// music.ts — the game's soundtrack: 7 original, upbeat songs made in code
// (Peter, 2026-10-14: "fun music, not white noise… like 7 different songs
// that play randomly and loop").
//
// Each song is a small recipe — tempo, key, scale, chord progression,
// drum groove, bass style, lead sound — and the music box plays it bar by
// bar: drums, bass, chord stabs and a melody (seeded, so a song always
// sounds like itself). Songs run ~1½ minutes (A A B A, then again), then
// the next one starts, picked at random (never the same twice in a row),
// forever. It all goes through the "ambience" bus in ui/audio.ts, which
// the Music switch in Settings turns on and off.
// =====================================================================

import { ac, drum, note, soundReady } from './audio.ts';
import { Rng } from '../core/rng.ts';

type Groove = 'boombap' | 'house' | 'funk' | 'lofi' | 'chip' | 'bossa' | 'pop';
type Lead = 'square' | 'triangle' | 'sawtooth';

interface Song {
  title: string;
  bpm: number;
  /** Root note (Hz) of the key. */
  root: number;
  /** Scale steps in semitones. */
  scale: number[];
  /** Chord per bar, as scale degrees (0 = I). Verse, then the B section. */
  verse: number[];
  bridge: number[];
  groove: Groove;
  lead: Lead;
  /** Swing amount on off-beat sixteenths (0 = straight). */
  swing: number;
  /** How busy the melody is (0–1). */
  busy: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

export const SONGS: Song[] = [
  { title: 'Bodega Bounce', bpm: 96, root: 130.81, scale: MAJOR, verse: [0, 5, 3, 4], bridge: [3, 4, 2, 5], groove: 'boombap', lead: 'square', swing: 0.12, busy: 0.55 },
  { title: 'Yellow Cab Funk', bpm: 112, root: 164.81, scale: DORIAN, verse: [0, 3, 0, 3], bridge: [6, 5, 3, 4], groove: 'funk', lead: 'sawtooth', swing: 0.05, busy: 0.7 },
  { title: 'Rooftop Sunset', bpm: 84, root: 174.61, scale: MAJOR, verse: [1, 4, 0, 5], bridge: [3, 2, 1, 4], groove: 'lofi', lead: 'triangle', swing: 0.18, busy: 0.4 },
  { title: 'Times Square Rush', bpm: 124, root: 110.0, scale: MINOR, verse: [0, 5, 2, 6], bridge: [3, 4, 0, 4], groove: 'house', lead: 'sawtooth', swing: 0, busy: 0.6 },
  { title: 'Subway Surfin’', bpm: 140, root: 196.0, scale: MAJOR, verse: [0, 4, 5, 3], bridge: [3, 4, 0, 0], groove: 'chip', lead: 'square', swing: 0, busy: 0.85 },
  { title: 'Brooklyn Brunch', bpm: 100, root: 146.83, scale: MAJOR, verse: [0, 2, 3, 4], bridge: [5, 1, 4, 0], groove: 'bossa', lead: 'triangle', swing: 0.08, busy: 0.5 },
  { title: 'Empire Anthem', bpm: 118, root: 116.54, scale: MAJOR, verse: [3, 4, 2, 5], bridge: [0, 4, 5, 3], groove: 'pop', lead: 'sawtooth', swing: 0, busy: 0.65 },
];

/** Bars per song before the next one: (A A B A) × 2 with 4-bar sections. */
const SONG_BARS = 32;

const semis = (f: number, n: number) => f * Math.pow(2, n / 12);

/** The note `deg` steps up the scale from the root (wraps into higher octaves). */
function degree(song: Song, deg: number, octave = 0): number {
  const n = song.scale.length;
  const o = Math.floor(deg / n);
  const step = song.scale[((deg % n) + n) % n];
  return semis(song.root, step + 12 * (o + octave));
}

/** A melody for one section, seeded so the song always sounds like itself. */
function melody(song: Song, chords: number[], seed: string): ({ deg: number; len: number } | null)[][] {
  const r = new Rng(seed);
  return chords.map((c) => {
    const bar: ({ deg: number; len: number } | null)[] = Array(16).fill(null);
    let last = c + 7;
    for (let st = 0; st < 16; st++) {
      const strong = st % 4 === 0;
      if (!strong && r.next() > song.busy * (st % 2 === 0 ? 0.9 : 0.45)) continue;
      // Strong beats land on chord tones; the rest move by small steps.
      const deg = strong ? c + 7 + [0, 2, 4][Math.floor(r.next() * 3)] : last + [-2, -1, 1, 2, 0][Math.floor(r.next() * 5)];
      const len = strong && r.next() < 0.4 ? 2 : 1;
      bar[st] = { deg, len };
      last = deg;
      if (len === 2) st++;
    }
    return bar;
  });
}

class MusicBox {
  private song: Song | null = null;
  private last = -1;
  private bar = 0;
  private step = 0;
  private next = 0;
  private timer = 0;
  private sections: { a: ReturnType<typeof melody>; b: ReturnType<typeof melody> } | null = null;
  private on = true;

  /** Start (or keep) playing; safe to call often. */
  start(): void {
    if (!this.on || this.timer || !soundReady()) return;
    const a = ac();
    if (!a) return;
    this.pick();
    this.next = a.currentTime + 0.15;
    this.timer = window.setInterval(() => this.tick(), 50);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  setEnabled(on: boolean): void {
    this.on = on;
    if (!on) this.stop();
  }

  /** What's playing (the phone could show it). */
  get title(): string | null {
    return this.song?.title ?? null;
  }

  /** Skip to another random song. */
  skip(): void {
    this.pick();
  }

  private pick(): void {
    let i = Math.floor(Math.random() * SONGS.length);
    if (i === this.last) i = (i + 1 + Math.floor(Math.random() * (SONGS.length - 1))) % SONGS.length;
    this.last = i;
    this.song = SONGS[i];
    this.sections = { a: melody(this.song, this.song.verse, `${this.song.title}-a`), b: melody(this.song, this.song.bridge, `${this.song.title}-b`) };
    this.bar = 0;
    this.step = 0;
  }

  private tick(): void {
    const a = ac();
    if (!a || !this.song || document.hidden) return;
    if (this.next < a.currentTime - 0.5) this.next = a.currentTime + 0.05; // came back from the background
    const sixteenth = 60 / this.song.bpm / 4;
    while (this.next < a.currentTime + 0.25) {
      const swing = this.step % 2 === 1 ? this.song.swing * sixteenth : 0;
      this.play(this.song, this.next + swing - a.currentTime, sixteenth);
      this.next += sixteenth;
      if (++this.step === 16) {
        this.step = 0;
        if (++this.bar >= SONG_BARS) this.pick();
      }
    }
  }

  /** One sixteenth of the song. */
  private play(song: Song, at: number, six: number): void {
    const st = this.step;
    // Sections: A A B A (4 bars each), twice. The first bar of a song is a soft intro.
    const sec = Math.floor(this.bar / 4) % 4;
    const inB = sec === 2;
    const barInSec = this.bar % 4;
    const chord = (inB ? song.bridge : song.verse)[barInSec];
    const intro = this.bar === 0;
    this.drums(song.groove, st, at, intro);
    this.bass(song, chord, st, at, six);
    this.stabs(song, chord, st, at, six);
    if (!intro) {
      const n = (inB ? this.sections!.b : this.sections!.a)[barInSec][st];
      if (n) {
        const g = song.lead === 'sawtooth' ? 0.022 : song.lead === 'square' ? 0.026 : 0.05;
        note(degree(song, n.deg), at, six * n.len * 1.6, song.lead, g);
      }
    }
  }

  private drums(g: Groove, st: number, at: number, intro: boolean): void {
    const v = intro ? 0.5 : 1;
    switch (g) {
      case 'house':
      case 'pop':
        if (st % 4 === 0) drum('kick', at, 0.75 * v);
        if (st === 4 || st === 12) drum(g === 'pop' ? 'clap' : 'clap', at, 0.5 * v);
        if (st % 4 === 2) drum('hat', at, 0.6 * v);
        if (g === 'pop' && st % 2 === 1) drum('hat', at, 0.2 * v);
        break;
      case 'boombap':
      case 'lofi':
        if (st === 0 || st === 7 || st === 10) drum('kick', at, (g === 'lofi' ? 0.5 : 0.7) * v);
        if (st === 4 || st === 12) drum('snare', at, (g === 'lofi' ? 0.3 : 0.45) * v);
        if (st % 2 === 0) drum('hat', at, 0.3 * v);
        break;
      case 'funk':
        if (st === 0 || st === 3 || st === 10) drum('kick', at, 0.7 * v);
        if (st === 4 || st === 12) drum('snare', at, 0.45 * v);
        drum('hat', at, (st % 2 === 0 ? 0.35 : 0.18) * v);
        break;
      case 'chip':
        if (st % 4 === 0) drum('kick', at, 0.6 * v);
        if (st === 4 || st === 12) drum('snare', at, 0.35 * v);
        if (st % 2 === 0) drum('hat', at, 0.25 * v);
        break;
      case 'bossa':
        if (st === 0 || st === 6 || st === 8 || st === 14) drum('kick', at, 0.5 * v);
        if ([0, 3, 6, 10, 12].includes(st)) drum('hat', at, 0.3 * v); // the clave-ish rim
        break;
    }
  }

  private bass(song: Song, chord: number, st: number, at: number, six: number): void {
    const root = degree(song, chord, -1);
    const fifth = degree(song, chord + 4, -1);
    const g = 0.09;
    switch (song.groove) {
      case 'house':
        if (st % 4 === 2) note(root, at, six * 1.6, 'sawtooth', g * 0.5);
        break;
      case 'funk':
        if ([0, 3, 6, 8, 11, 14].includes(st)) note(st === 11 ? fifth : st === 14 ? root * 2 : root, at, six * 0.9, 'sawtooth', g * 0.55);
        break;
      case 'chip':
        if (st % 2 === 0) note(st % 4 === 0 ? root : fifth, at, six * 0.9, 'triangle', g);
        break;
      case 'bossa':
        if (st === 0 || st === 6) note(root, at, six * 3, 'sine', g * 1.2);
        if (st === 8 || st === 14) note(fifth, at, six * 3, 'sine', g * 1.2);
        break;
      default:
        if (st === 0 || st === 10) note(root, at, six * 5, 'triangle', g);
        if (st === 7) note(fifth, at, six * 2, 'triangle', g * 0.8);
    }
  }

  private stabs(song: Song, chord: number, st: number, at: number, six: number): void {
    const hits = song.groove === 'house' ? [2, 6, 10, 14] : song.groove === 'funk' ? [2, 7, 10, 15] : song.groove === 'lofi' ? [0] : song.groove === 'bossa' ? [3, 10] : song.groove === 'chip' ? [] : [0, 8];
    if (!hits.includes(st)) return;
    const len = song.groove === 'lofi' ? six * 14 : song.groove === 'pop' ? six * 7 : six * 1.3;
    const type: OscillatorType = song.groove === 'lofi' || song.groove === 'bossa' ? 'triangle' : 'square';
    const g = type === 'square' ? 0.012 : 0.02;
    for (const d of [0, 2, 4]) note(degree(song, chord + d), at, len, type, g);
  }
}

export const music = new MusicBox();
