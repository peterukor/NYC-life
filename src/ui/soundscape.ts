// =====================================================================
// soundscape.ts — what the city and each room sound like, footsteps, and
// the sound of what you're doing (Peter, 2026-10-14: "add sounds").
//
// game.ts calls soundscape.update() every frame with where you are and
// what you're doing; this file picks the ambience (a bed of filtered
// noise, plus little events now and then), keeps a beat going in clubs
// and bars, steps when you walk, and loops the sound of your activity
// (shower water, a sizzling pan, the TV). All synthesised (ui/audio.ts).
// =====================================================================

import { ac, burst, bus, drum, noise, note, sfx, soundReady } from './audio.ts';

export type Scene = 'city' | 'transit' | 'apartment' | 'bodega' | 'pizza' | 'cafe' | 'bar' | 'club' | 'office' | 'gym' | 'comedy' | 'furniture' | 'alley' | 'precinct' | 'arcade' | 'casino' | 'park' | 'none';

export interface SoundInput {
  scene: Scene;
  hour: number;
  /** Walking speed (0 = standing). */
  speed: number;
  /** What you're doing (an action id) or null. */
  activity: string | null;
}

interface Bed {
  out: GainNode;
  stop(): void;
}

/** A looping noise bed through a filter (traffic rumble, room tone, crowd). */
function bed(layers: { brown?: boolean; type: BiquadFilterType; freq: number; q?: number; gain: number; wobble?: number }[], dest: 'ambience' | 'loops'): Bed | null {
  const a = ac();
  const b = bus(dest);
  if (!a || !b) return null;
  const out = a.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(1, a.currentTime, 0.6);
  out.connect(b);
  const srcs: AudioScheduledSourceNode[] = [];
  for (const l of layers) {
    const buf = noise(l.brown);
    if (!buf) continue;
    const s = a.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = 0.97 + Math.random() * 0.06;
    const f = a.createBiquadFilter();
    f.type = l.type;
    f.frequency.value = l.freq;
    f.Q.value = l.q ?? 0.7;
    const g = a.createGain();
    g.gain.value = l.gain;
    s.connect(f).connect(g).connect(out);
    // A slow wobble so it breathes (water, crowds) instead of a flat hiss.
    if (l.wobble) {
      const lfo = a.createOscillator();
      const lg = a.createGain();
      lfo.frequency.value = 0.15 + Math.random() * 0.4;
      lg.gain.value = l.gain * l.wobble;
      lfo.connect(lg).connect(g.gain);
      lfo.start();
      srcs.push(lfo);
    }
    s.start(0, Math.random() * 1.8);
    srcs.push(s);
  }
  return {
    out,
    stop() {
      const t = a.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.25);
      for (const s of srcs) s.stop(t + 1.5);
      window.setTimeout(() => out.disconnect(), 1700);
    },
  };
}

const r = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Room tone per scene, plus the things that happen now and then. */
const SCENES: Partial<Record<Scene, { bed: Parameters<typeof bed>[0]; every?: [number, number]; event?: (hour: number) => void; beat?: number }>> = {
  city: {
    bed: [
      { brown: true, type: 'lowpass', freq: 260, gain: 0.5, wobble: 0.35 },
      { type: 'bandpass', freq: 900, q: 0.5, gain: 0.025, wobble: 0.6 },
    ],
    every: [2.5, 7],
    event: (h) => {
      const night = h < 6 || h >= 22;
      const x = Math.random();
      if (x < 0.45) {
        sfx.honk(Math.random() < 0.6);
        if (Math.random() < 0.35) window.setTimeout(() => sfx.honk(true), r(150, 400));
      } else if (x < 0.55) sfx.siren(true);
      else if (x < 0.75) burst(0, r(1.5, 2.5), { type: 'lowpass', freq: 400, sweepTo: 140, gain: 0.12, brown: true, attack: 0.6, out: 'ambience' }); // a bus going by
      else if (!night) for (let i = 0; i < 3; i++) note(r(2800, 4200), i * 0.09, 0.06, 'sine', 0.01); // pigeons and sparrows
    },
  },
  transit: {
    bed: [
      { brown: true, type: 'lowpass', freq: 180, gain: 0.9, wobble: 0.25 },
      { type: 'bandpass', freq: 2500, q: 3, gain: 0.02, wobble: 0.9 },
    ],
    every: [0.35, 0.6],
    event: () => burst(0, 0.05, { type: 'lowpass', freq: 600, gain: 0.08, out: 'ambience' }), // clack-clack over the rails
  },
  apartment: {
    bed: [
      { brown: true, type: 'lowpass', freq: 120, gain: 0.12 },
      { type: 'lowpass', freq: 60, q: 6, gain: 0.05 }, // the fridge hum
    ],
    every: [9, 20],
    event: () => (Math.random() < 0.6 ? sfx.honk(true) : sfx.siren(true)), // the street through the window
  },
  bodega: {
    bed: [{ brown: true, type: 'lowpass', freq: 90, q: 4, gain: 0.18 }],
    every: [6, 14],
    event: () => (Math.random() < 0.5 ? burst(0, 0.5, { type: 'highpass', freq: 3000, gain: 0.02, out: 'ambience' }) : sfx.honk(true)), // grill hiss, street
  },
  pizza: {
    bed: [{ type: 'bandpass', freq: 700, q: 0.6, gain: 0.04, wobble: 0.5 }, { brown: true, type: 'lowpass', freq: 150, gain: 0.15 }],
    every: [5, 10],
    event: () => burst(0, 0.15, { type: 'bandpass', freq: 1800, gain: 0.03, out: 'ambience' }),
  },
  cafe: {
    bed: [{ type: 'bandpass', freq: 650, q: 0.5, gain: 0.05, wobble: 0.5 }],
    every: [4, 9],
    event: () =>
      Math.random() < 0.4
        ? burst(0, 1.6, { type: 'highpass', freq: 3500, gain: 0.03, attack: 0.2, out: 'ambience' }) // the milk steamer
        : [3200, 4100].forEach((f, i) => note(f, i * 0.05, 0.12, 'sine', 0.008)), // cups
  },
  bar: { bed: [{ type: 'bandpass', freq: 600, q: 0.5, gain: 0.07, wobble: 0.5 }], every: [5, 11], event: () => sfx.clink(), beat: 92 },
  club: { bed: [{ type: 'bandpass', freq: 500, q: 0.4, gain: 0.06, wobble: 0.6 }], every: [8, 16], event: () => (Math.random() < 0.3 ? sfx.cheer() : sfx.clink()), beat: 124 },
  office: {
    bed: [{ brown: true, type: 'lowpass', freq: 200, gain: 0.1 }, { type: 'bandpass', freq: 650, q: 0.6, gain: 0.015 }],
    every: [0.15, 1.6],
    event: () => burst(0, 0.03, { type: 'bandpass', freq: r(2500, 4000), q: 2, gain: 0.025, out: 'ambience' }), // keyboards
  },
  gym: {
    bed: [{ brown: true, type: 'lowpass', freq: 160, gain: 0.12 }],
    every: [2, 5],
    event: () => {
      // Plates clanking.
      note(r(900, 1400), 0, 0.3, 'square', 0.006);
      note(r(1800, 2600), 0.01, 0.25, 'sine', 0.01);
    },
    beat: 128,
  },
  comedy: {
    bed: [{ type: 'bandpass', freq: 600, q: 0.5, gain: 0.04, wobble: 0.4 }],
    every: [6, 14],
    event: () => burst(0, r(1, 2), { type: 'bandpass', freq: 1000, q: 0.5, gain: 0.12, attack: 0.1, out: 'ambience' }), // laughs
  },
  furniture: { bed: [{ brown: true, type: 'lowpass', freq: 140, gain: 0.08 }] },
  alley: {
    bed: [{ brown: true, type: 'lowpass', freq: 220, gain: 0.3, wobble: 0.3 }],
    every: [3, 8],
    event: () => (Math.random() < 0.5 ? burst(0, 0.08, { type: 'bandpass', freq: 1200, gain: 0.05, out: 'ambience' }) : sfx.honk(true)), // drips, street
  },
  precinct: {
    bed: [{ brown: true, type: 'lowpass', freq: 150, gain: 0.12 }],
    every: [5, 12],
    event: () => {
      // Radio: squelch, a garbled voice.
      burst(0, 0.1, { type: 'highpass', freq: 3000, gain: 0.04, out: 'ambience' });
      burst(0.12, r(0.6, 1.2), { type: 'bandpass', freq: 1100, q: 4, gain: 0.05, out: 'ambience' });
    },
  },
  arcade: {
    bed: [{ type: 'bandpass', freq: 700, q: 0.5, gain: 0.035, wobble: 0.5 }],
    every: [0.8, 2.2],
    event: () => {
      const base = pick([523, 659, 784, 880]);
      for (let i = 0; i < 4; i++) note(base * [1, 1.25, 1.5, 2][i], i * 0.06, 0.06, 'square', 0.006);
    },
  },
  casino: {
    bed: [{ type: 'bandpass', freq: 600, q: 0.5, gain: 0.05, wobble: 0.4 }],
    every: [1.2, 3.5],
    event: () => {
      // Slot machines going off somewhere in the room.
      const n = Math.random() < 0.2 ? 8 : 3;
      for (let i = 0; i < n; i++) note(pick([1568, 2093, 2637]), i * 0.08, 0.09, 'triangle', 0.008);
    },
  },
  park: {
    bed: [{ type: 'bandpass', freq: 500, q: 0.4, gain: 0.03, wobble: 0.8 }, { brown: true, type: 'lowpass', freq: 200, gain: 0.08 }],
    every: [1.5, 4],
    event: (h) => {
      if (h < 6 || h >= 21) {
        for (let i = 0; i < 3; i++) note(4200, i * 0.12, 0.05, 'sine', 0.006); // crickets
        return;
      }
      // A bird: a quick chirp or a little whistle.
      const f = r(2600, 4200);
      for (let i = 0; i < (Math.random() < 0.5 ? 2 : 4); i++) note(f * r(0.9, 1.15), i * r(0.07, 0.14), 0.06, 'sine', 0.012);
    },
  },
};

/** What you're doing → the sound it makes while it runs. */
function activityBed(id: string): Parameters<typeof bed>[0] | null {
  if (/shower|soak/i.test(id)) return [{ type: 'highpass', freq: 1500, gain: 0.28, wobble: 0.25 }, { type: 'bandpass', freq: 600, q: 0.5, gain: 0.1 }];
  if (/cook|chefMeal|snack/i.test(id)) return [{ type: 'highpass', freq: 3200, gain: 0.1, wobble: 0.6 }, { type: 'bandpass', freq: 5500, q: 1.5, gain: 0.05, wobble: 0.9 }];
  if (/laundry/i.test(id)) return [{ brown: true, type: 'lowpass', freq: 180, gain: 0.5, wobble: 0.7 }];
  if (/watchTv/i.test(id)) return [{ type: 'bandpass', freq: 900, q: 3, gain: 0.08, wobble: 0.9 }, { type: 'bandpass', freq: 2100, q: 4, gain: 0.03, wobble: 0.9 }];
  if (/sleep|nap/i.test(id)) return [{ brown: true, type: 'lowpass', freq: 300, gain: 0.12, wobble: 0.9 }]; // slow breathing
  if (/treadmill|jog/i.test(id)) return [{ brown: true, type: 'lowpass', freq: 220, gain: 0.25 }];
  return null;
}

/** Ticks while doing something rhythmic (typing, guitar, piano, games). */
function activityTick(id: string): ((n: number) => void) | null {
  if (/code|freelance|laptop|sellOnline|doomscroll/i.test(id)) return () => burst(0, 0.03, { type: 'bandpass', freq: r(2500, 4500), q: 2, gain: 0.05, out: 'loops' });
  if (/guitar|busk/i.test(id)) return (n) => [196, 247, 294, 392].forEach((f, i) => note(f * [1, 1.122, 1.335, 0.89][n % 4], i * 0.02, 0.9, 'triangle', 0.02, 'loops'));
  if (/piano/i.test(id)) return (n) => note([523, 587, 659, 784, 880, 784, 659, 587][n % 8], 0, 0.6, 'triangle', 0.04, 'loops');
  if (/gameConsole/i.test(id)) return (n) => note([440, 660, 880, 550][n % 4], 0, 0.06, 'square', 0.015, 'loops');
  if (/benchPress|workout|punchBag|trainHard/i.test(id)) return () => burst(0, 0.1, { type: 'lowpass', freq: 500, gain: 0.12, brown: true, out: 'loops' });
  return null;
}
const TICK_EVERY: [RegExp, number][] = [[/code|freelance|laptop|sellOnline|doomscroll/i, 0.12], [/guitar|busk/i, 0.9], [/piano/i, 0.38], [/gameConsole/i, 0.25], [/benchPress|workout|punchBag|trainHard/i, 1.4]];

class Soundscape {
  private scene: Scene | null = null;
  private ambience: Bed | null = null;
  private eventIn = 3;
  private loop: Bed | null = null;
  private loopFor: string | null = null;
  private tickIn = 0;
  private tickN = 0;
  private stepIn = 0;
  private beat: { bpm: number; next: number; step: number } | null = null;

  update(dt: number, s: SoundInput): void {
    if (!soundReady() || document.hidden) return;
    const a = ac()!;
    // ---- ambience
    if (s.scene !== this.scene) {
      this.scene = s.scene;
      this.ambience?.stop();
      const def = SCENES[s.scene];
      this.ambience = def ? bed(def.bed, 'ambience') : null;
      this.eventIn = def?.every ? r(...def.every) : 999;
      this.beat = def?.beat ? { bpm: def.beat, next: a.currentTime + 0.3, step: 0 } : null;
    }
    const def = SCENES[s.scene];
    if (def?.event && def.every && (this.eventIn -= dt) <= 0) {
      this.eventIn = r(...def.every);
      def.event(s.hour);
    }
    // ---- the beat (clubs, bars, the gym): schedule a little ahead
    if (this.beat) this.scheduleBeat(a);
    // ---- what you're doing
    const act = s.activity;
    if (act !== this.loopFor) {
      this.loop?.stop();
      // Leaving the bathroom: the toilet flushes.
      if (this.loopFor && /toilet|publicRestroom/i.test(this.loopFor)) burst(0, 1.6, { type: 'lowpass', freq: 900, sweepTo: 250, gain: 0.25, attack: 0.15, out: 'loops' });
      this.loopFor = act;
      const b = act ? activityBed(act) : null;
      this.loop = b ? bed(b, 'loops') : null;
      this.tickIn = 0.2;
      this.tickN = 0;
    }
    if (act) {
      const tick = activityTick(act);
      if (tick && (this.tickIn -= dt) <= 0) {
        const every = TICK_EVERY.find(([re]) => re.test(act))?.[1] ?? 0.5;
        this.tickIn = every * r(0.6, 1.4);
        tick(this.tickN++);
      }
    }
    // ---- footsteps
    if (s.speed > 0.2 && !act) {
      this.stepIn -= dt;
      if (this.stepIn <= 0) {
        this.stepIn = Math.max(0.22, 0.95 / Math.max(1, s.speed));
        sfx.step(s.scene === 'city' || s.scene === 'alley' || s.scene === 'park');
      }
    } else this.stepIn = 0.05;
  }

  private scheduleBeat(a: AudioContext): void {
    const b = this.beat!;
    const sixteenth = 60 / b.bpm / 4;
    if (b.next < a.currentTime) b.next = a.currentTime + 0.05;
    // A dance pattern: four on the floor, claps on 2 and 4, off-beat hats, a bass line.
    const club = b.bpm >= 120;
    const bassRoots = [55, 55, 65.4, 49];
    while (b.next < a.currentTime + 0.25) {
      const st = b.step % 16;
      const at = b.next - a.currentTime;
      if (club) {
        if (st % 4 === 0) drum('kick', at, 0.7);
        if (st === 4 || st === 12) drum('clap', at, 0.5);
        if (st % 4 === 2) drum('hat', at, 0.6);
        if (st % 4 === 2 && this.scene === 'club') note(bassRoots[Math.floor(b.step / 16) % 4] * 2, at, sixteenth * 1.6, 'sawtooth', 0.05);
      } else {
        // The bar's jukebox: a lazy hip-hop beat.
        if (st === 0 || st === 10) drum('kick', at, 0.5);
        if (st === 4 || st === 12) drum('snare', at, 0.4);
        if (st % 2 === 0) drum('hat', at, 0.35);
        if (st === 0) note(bassRoots[Math.floor(b.step / 16) % 4] * 2, at, sixteenth * 6, 'triangle', 0.06);
      }
      b.next += sixteenth;
      b.step++;
    }
  }

  /** Stop everything (sound switched off). */
  silence(): void {
    this.ambience?.stop();
    this.loop?.stop();
    this.ambience = this.loop = null;
    this.scene = null;
    this.loopFor = null;
    this.beat = null;
  }
}

export const soundscape = new Soundscape();
