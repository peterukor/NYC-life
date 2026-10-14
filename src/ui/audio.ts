// =====================================================================
// audio.ts — tiny sound effects made with the Web Audio API.
//
// No audio files: each sound is a couple of synthesised beeps, so sound
// costs nothing to download. Browsers only allow sound after the player
// has tapped something, so the audio system wakes up on the first tap.
// =====================================================================

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.08): void {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}

export const sfx = {
  tap: () => tone(660, 0, 0.06, 'triangle', 0.05),
  cash: () => {
    tone(1318, 0, 0.08, 'square', 0.04);
    tone(1760, 0.07, 0.14, 'square', 0.04);
  },
  notify: () => {
    tone(880, 0, 0.1);
    tone(1175, 0.1, 0.16);
  },
  bad: () => {
    tone(330, 0, 0.14, 'sawtooth', 0.05);
    tone(247, 0.12, 0.2, 'sawtooth', 0.05);
  },
  /** One musical note (the rhythm game). */
  note: (freq: number) => tone(freq, 0, 0.16, 'triangle', 0.06),
  /** A reel or wheel ticking past. */
  tick: () => tone(1400, 0, 0.025, 'square', 0.025),
  /** A card sliding onto the felt. */
  card: () => tone(420, 0, 0.05, 'triangle', 0.04),
  /** A small win: three notes up. */
  win: () => {
    tone(784, 0, 0.1, 'triangle', 0.06);
    tone(988, 0.09, 0.1, 'triangle', 0.06);
    tone(1319, 0.18, 0.22, 'triangle', 0.06);
  },
  /** The jackpot: a fast run up and a ring. */
  jackpot: () => {
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.18, 'square', 0.04));
    tone(2093, 0.5, 0.8, 'triangle', 0.05);
  },
  /** The rocket blowing up. */
  boom: () => {
    tone(140, 0, 0.35, 'sawtooth', 0.08);
    tone(70, 0.05, 0.5, 'square', 0.06);
  },
  /** A coin into the machine. */
  coin: () => {
    tone(1976, 0, 0.06, 'square', 0.035);
    tone(2637, 0.05, 0.12, 'square', 0.035);
  },
  chime: () => {
    // The subway "stand clear of the closing doors" two-note chime.
    tone(784, 0, 0.35, 'sine', 0.07);
    tone(659, 0.32, 0.5, 'sine', 0.07);
  },
};
