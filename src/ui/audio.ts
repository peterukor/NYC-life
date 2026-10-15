// =====================================================================
// audio.ts — the game's sounds, made in code with the Web Audio API.
//
// No audio files: every sound is synthesised (tones, filtered noise,
// little envelopes), so sound costs nothing to download and works
// offline. Browsers only allow sound after the player has tapped
// something, so audio wakes up on the first tap.
//
// Three buses into a gentle compressor:
//   • sfx      — one-shots (taps, cash, doors, phone)
//   • ambience — the room or street (ui/soundscape.ts)
//   • loops    — what you're doing (shower water, sizzling pan, TV)
// Peter, 2026-10-14: "add sounds… create game sounds".
// =====================================================================

let ctx: AudioContext | null = null;
let enabled = true;
let musicOn = true;
let master: GainNode | null = null;
const buses: Partial<Record<'sfx' | 'ambience' | 'loops', GainNode>> = {};
const LEVEL = { sfx: 0.9, ambience: 0.55, loops: 0.6 };
/** Player volume (0–1) for the music and for everything else (the 🔊 mixer). */
const vol = { music: 0.7, sfx: 0.8 };
const busLevel = (k: 'sfx' | 'ambience' | 'loops') => (k === 'ambience' ? (musicOn ? LEVEL.ambience * vol.music : 0) : LEVEL[k] * vol.sfx);
/** Set the music and effects volume (0–1 each). */
export function setVolumes(music: number, sfx: number): void {
  vol.music = Math.max(0, Math.min(1, music));
  vol.sfx = Math.max(0, Math.min(1, sfx));
  if (!ctx) return;
  for (const k of ['sfx', 'ambience', 'loops'] as const) buses[k]?.gain.setTargetAtTime(busLevel(k), ctx.currentTime, 0.05);
}
let noiseBuf: AudioBuffer | null = null;
let brownBuf: AudioBuffer | null = null;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
}

/** Ambience and music on/off (separate from the effects). */
export function setAmbienceEnabled(on: boolean): void {
  musicOn = on;
  const b = buses.ambience;
  if (b && ctx) b.gain.setTargetAtTime(busLevel('ambience'), ctx.currentTime, 0.2);
}

export function soundReady(): boolean {
  return !!ctx && ctx.state === 'running' && enabled;
}

/** The audio context (created on first use), or null when sound is off. */
export function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 1;
      comp.connect(master).connect(ctx.destination);
      for (const k of ['sfx', 'ambience', 'loops'] as const) {
        const g = ctx.createGain();
        g.gain.value = busLevel(k);
        g.connect(comp);
        buses[k] = g;
      }
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function bus(k: 'sfx' | 'ambience' | 'loops'): GainNode | null {
  return ac() ? buses[k]! : null;
}

/** 2 s of white noise, and of brown (rumbly) noise, shared by every sound. */
export function noise(brown = false): AudioBuffer | null {
  const a = ac();
  if (!a) return null;
  if (!noiseBuf) {
    const n = a.sampleRate * 2;
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    brownBuf = a.createBuffer(1, n, a.sampleRate);
    const w = noiseBuf.getChannelData(0), b = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
  }
  return brown ? brownBuf : noiseBuf;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, slideTo?: number, out: 'sfx' | 'ambience' | 'loops' = 'sfx'): void {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(buses[out]!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A burst of filtered noise (thuds, swishes, steps, pops). */
function hiss(start: number, dur: number, opts: { type?: BiquadFilterType; freq?: number; q?: number; gain?: number; sweepTo?: number; brown?: boolean; attack?: number; out?: 'sfx' | 'ambience' | 'loops' } = {}): void {
  const a = ac();
  const buf = noise(opts.brown);
  if (!a || !buf) return;
  const t = a.currentTime + start;
  const src = a.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const f = a.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 1000, t);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
  f.Q.value = opts.q ?? 1;
  const g = a.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.2, t + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(buses[opts.out ?? 'sfx']!);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

/** A soft drum hit (kick, snare, hat) for beats. */
export function drum(kind: 'kick' | 'snare' | 'hat' | 'clap', start = 0, gain = 1, out: 'sfx' | 'ambience' | 'loops' = 'ambience'): void {
  if (kind === 'kick') tone(120, start, 0.28, 'sine', 0.5 * gain, 42, out);
  else if (kind === 'snare') {
    hiss(start, 0.16, { type: 'highpass', freq: 1800, gain: 0.22 * gain, out });
    tone(190, start, 0.08, 'triangle', 0.12 * gain, undefined, out);
  } else if (kind === 'clap') {
    for (let i = 0; i < 3; i++) hiss(start + i * 0.012, 0.09, { type: 'bandpass', freq: 1400, q: 0.8, gain: 0.2 * gain, out });
  } else hiss(start, 0.04, { type: 'highpass', freq: 7000, gain: 0.12 * gain, out });
}

/** A short note on a given bus (bass lines, jingles). */
export function note(freq: number, start: number, dur: number, type: OscillatorType, gain: number, out: 'sfx' | 'ambience' | 'loops' = 'ambience'): void {
  tone(freq, start, dur, type, gain, undefined, out);
}

/** A filtered-noise burst on a bus (ambience events). */
export function burst(start: number, dur: number, opts: Parameters<typeof hiss>[2]): void {
  hiss(start, dur, opts);
}

const r = (a: number, b: number) => a + Math.random() * (b - a);
let lastTap = 0;

export const sfx = {
  /** A button press: a soft click. */
  tap: () => {
    const a = ac();
    if (!a || a.currentTime - lastTap < 0.04) return;
    lastTap = a.currentTime;
    hiss(0, 0.03, { type: 'bandpass', freq: 3200, q: 2, gain: 0.07 });
    tone(880, 0, 0.04, 'triangle', 0.025);
  },
  /** The register: ka-ching. */
  cash: () => {
    hiss(0, 0.05, { type: 'highpass', freq: 4000, gain: 0.1 });
    tone(1318, 0.02, 0.1, 'square', 0.035);
    tone(1760, 0.09, 0.3, 'triangle', 0.06);
    tone(2637, 0.09, 0.25, 'sine', 0.03);
  },
  notify: () => {
    tone(880, 0, 0.1, 'sine', 0.07);
    tone(1175, 0.1, 0.18, 'sine', 0.07);
  },
  bad: () => {
    tone(330, 0, 0.14, 'sawtooth', 0.04);
    tone(247, 0.12, 0.22, 'sawtooth', 0.04);
  },
  /** One musical note (the rhythm game). */
  note: (freq: number) => tone(freq, 0, 0.16, 'triangle', 0.06),
  /** A reel or wheel ticking past. */
  tick: () => tone(1400, 0, 0.025, 'square', 0.025),
  /** A card sliding onto the felt. */
  card: () => hiss(0, 0.09, { type: 'bandpass', freq: 2600, sweepTo: 1200, gain: 0.12 }),
  /** A small win: three notes up. */
  win: () => {
    tone(784, 0, 0.1, 'triangle', 0.06);
    tone(988, 0.09, 0.1, 'triangle', 0.06);
    tone(1319, 0.18, 0.22, 'triangle', 0.06);
  },
  /** The jackpot: a fast run up and a ring. */
  jackpot: () => {
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.18, 'square', 0.035));
    tone(2093, 0.5, 0.8, 'triangle', 0.05);
    for (let i = 0; i < 10; i++) tone(r(2400, 3600), 0.5 + i * 0.06, 0.08, 'sine', 0.02);
  },
  /** The rocket blowing up. */
  boom: () => {
    hiss(0, 0.9, { type: 'lowpass', freq: 900, sweepTo: 80, gain: 0.5, brown: true });
    tone(90, 0, 0.5, 'sine', 0.3, 35);
  },
  /** A coin into the machine. */
  coin: () => {
    tone(1976, 0, 0.06, 'square', 0.03);
    tone(2637, 0.05, 0.14, 'square', 0.03);
  },
  /** The subway "stand clear of the closing doors" two-note chime. */
  chime: () => {
    tone(784, 0, 0.35, 'sine', 0.07);
    tone(659, 0.32, 0.5, 'sine', 0.07);
  },
  /** A sheet sliding up. */
  open: () => hiss(0, 0.14, { type: 'bandpass', freq: 600, sweepTo: 2200, q: 0.7, gain: 0.06, attack: 0.04 }),
  /** Something sliding away. */
  close: () => hiss(0, 0.12, { type: 'bandpass', freq: 2000, sweepTo: 500, q: 0.7, gain: 0.05, attack: 0.03 }),
  /** A door: handle click, swing, soft thud. */
  door: () => {
    tone(2400, 0, 0.02, 'square', 0.03);
    hiss(0.03, 0.35, { type: 'lowpass', freq: 500, gain: 0.08, attack: 0.1, brown: true });
    tone(95, 0.32, 0.16, 'sine', 0.18, 60);
    hiss(0.32, 0.08, { type: 'lowpass', freq: 300, gain: 0.12 });
  },
  /** One footstep (soft, slightly random). */
  step: (hard = false) => {
    hiss(0, 0.07, { type: 'lowpass', freq: hard ? r(900, 1300) : r(450, 650), gain: hard ? 0.09 : 0.06 });
    tone(r(70, 95), 0, 0.05, 'sine', hard ? 0.06 : 0.04);
  },
  /** The phone buzzing in your pocket. */
  buzz: () => {
    for (let i = 0; i < 2; i++) tone(170, i * 0.28, 0.2, 'sawtooth', 0.035);
  },
  /** A text coming in: the little two-note pop. */
  msgIn: () => {
    tone(1568, 0, 0.07, 'sine', 0.06);
    tone(2093, 0.07, 0.12, 'sine', 0.06);
  },
  /** A text going out: a whoosh up. */
  msgOut: () => hiss(0, 0.18, { type: 'bandpass', freq: 500, sweepTo: 3500, q: 1.2, gain: 0.07, attack: 0.05 }),
  /** Somebody's calling (a ringtone, a few rings). */
  ring: () => {
    for (let k = 0; k < 2; k++) [1319, 1568, 1319, 1976].forEach((f, i) => tone(f, k * 0.9 + i * 0.11, 0.1, 'triangle', 0.05));
  },
  /** Popping a bottle: cork, then fizz. */
  cork: () => {
    tone(600, 0, 0.06, 'sine', 0.25, 1600);
    hiss(0.01, 0.05, { type: 'highpass', freq: 2000, gain: 0.25 });
    hiss(0.08, 1.2, { type: 'highpass', freq: 5000, gain: 0.05, attack: 0.05 });
  },
  /** Two glasses touching. */
  clink: () => {
    tone(3520, 0, 0.5, 'sine', 0.03);
    tone(4186, 0.005, 0.45, 'sine', 0.02);
    tone(5274, 0.01, 0.3, 'sine', 0.012);
  },
  /** A crowd: "ayyy". */
  cheer: () => {
    hiss(0, 1.4, { type: 'bandpass', freq: 900, q: 0.6, gain: 0.16, attack: 0.25 });
    for (let i = 0; i < 6; i++) tone(r(220, 480), r(0, 0.4), r(0.4, 0.8), 'sawtooth', 0.012, r(260, 600));
    for (let i = 0; i < 5; i++) hiss(0.2 + i * r(0.08, 0.14), 0.06, { type: 'bandpass', freq: 1500, gain: 0.1 });
  },
  /** A New York car horn. */
  honk: (far = false) => {
    const g = far ? 0.015 : 0.04;
    const t = r(0.18, 0.35);
    tone(415, 0, t, 'square', g);
    tone(523, 0, t, 'square', g * 0.8);
  },
  /** A siren going by. */
  siren: (far = true) => {
    const a = ac();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'triangle';
    const t = a.currentTime;
    for (let i = 0; i < 6; i++) {
      o.frequency.setValueAtTime(700, t + i * 0.5);
      o.frequency.linearRampToValueAtTime(1050, t + i * 0.5 + 0.25);
      o.frequency.linearRampToValueAtTime(700, t + i * 0.5 + 0.5);
    }
    const v = far ? 0.012 : 0.04;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + 3);
    o.connect(g).connect(buses.sfx!);
    o.start(t);
    o.stop(t + 3.05);
  },
  /** A punch landing. */
  punch: () => {
    hiss(0, 0.12, { type: 'lowpass', freq: 800, gain: 0.35, brown: true });
    tone(110, 0, 0.12, 'sine', 0.3, 50);
  },
  /** A whoosh (travel, swipe). */
  whoosh: () => hiss(0, 0.45, { type: 'bandpass', freq: 300, sweepTo: 1800, q: 0.9, gain: 0.1, attack: 0.15 }),
  /** Got something right in a mini-game. */
  good: () => {
    tone(1047, 0, 0.08, 'triangle', 0.05);
    tone(1568, 0.06, 0.14, 'triangle', 0.05);
  },
  /** Level up, raise, new skill: a little fanfare. */
  levelUp: () => {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.1, 0.12, 'square', 0.03));
    [1047, 1319, 1568].forEach((f) => tone(f, 0.32, 0.6, 'triangle', 0.04));
  },
  /** A fridge door: suck, then hum. */
  fridge: () => {
    hiss(0, 0.2, { type: 'lowpass', freq: 700, gain: 0.1, brown: true });
    tone(60, 0.1, 0.8, 'sine', 0.05);
  },
  /** A firework: sometimes a whistle up, then the bang and a crackle (clubs, the trading floor). */
  firework: (size = 1) => {
    const w = Math.random() < 0.5 ? r(0.25, 0.45) : 0;
    if (w) tone(r(700, 900), 0, w, 'sine', 0.025, r(1800, 2600));
    hiss(w, 0.6, { type: 'lowpass', freq: 1400, sweepTo: 120, gain: 0.28 * Math.min(1.6, size), brown: true });
    tone(70, w, 0.35, 'sine', 0.22 * Math.min(1.5, size), 40);
    for (let i = 0; i < 9; i++) hiss(w + 0.15 + r(0, 0.7), 0.03, { type: 'highpass', freq: r(3000, 6000), gain: 0.08 });
  },
  /** Done with something (a soft ding). */
  done: () => tone(1760, 0, 0.5, 'sine', 0.05),
};

/** Click on every button (once per press), so the whole UI feels physical. */
export function installUiClicks(): void {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const b = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], .opt, .choice');
      if (b && !(b as HTMLButtonElement).disabled) sfx.tap();
    },
    { capture: true, passive: true },
  );
}
