// =====================================================================
// 🎵 Beat Street — a four-lane rhythm game on a neon street at night.
//
// Pick a track (🐈 Bodega Cat, 🚇 Express Train, 🌃 Uptown Lights) and
// Easy / Normal / Hard, then tap each lane as its note crosses the line
// (hold the long ones). The notes you play ARE the tune: miss and the
// lead drops out. PERFECT / GREAT / GOOD, combo ×4, 🔥 hype ×2, a crowd
// meter that boos you off when it empties, and a grade S–D.
//
// Timing: the backing and the lead are scheduled ahead on the Web Audio
// clock, the highway is drawn from what you're *hearing* (the output
// timestamp), and taps are judged by their event time on that same
// clock, minus a sync offset you can set (🎧 Sync, with a tap test) and
// that the game nudges after a song if you were consistently early or
// late. No sound? It still plays, to the lights.
// Keys (optional): D F J K (or ← ↓ ↑ →); in the menu ↑ ↓ ← → and Enter.
// The rules, charts and backing (pure, tested): sim/arcade-beats.ts.
// =====================================================================

import { ac, bus, burst as hiss, drum, note, sfx } from '../audio.ts';
import { Fx, buzz } from '../juice.ts';
import { at, emoji, H, W, type Run } from '../arcade-games.ts';
import { bar, clamp, finisher, glowDot, keys, label, num, prerender } from './kit.ts';
import {
  BEAT_DIFFS, BEAT_HYPE_SECONDS, BEAT_LANES, BEAT_TRACKS, BeatGame, beatBacking, beatBar, beatLeadFreq, beatSix, beatSongLength,
  type BeatDiff, type BeatEvent, type BeatGrade, type BeatTrack,
} from '../../sim/arcade-beats.ts';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** A touch screen: no D F J K hints under the lanes. */
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const COLORS = ['#ff4fa3', '#36c5f0', '#ffd23f', '#7bd88f'];
const KEYS_LANE: Record<string, number> = { d: 0, f: 1, j: 2, k: 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 };
const KEY_LABEL = ['D', 'F', 'J', 'K'];
const DIFF_LABEL: Record<BeatDiff, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const GRADE_COLOR: Record<BeatGrade, string> = { S: '#ffd23f', A: '#7bd88f', B: '#36c5f0', C: '#ffffff', D: '#ff6a6a' };
const J_TEXT = { perfect: ['PERFECT', '#ffd23f'], great: ['GREAT', '#7bd88f'], good: ['GOOD', '#36c5f0'] } as const;

// ---- the highway, in perspective
const LINE = 404;
const HZ = 118;
const CX = W / 2;
const LANE_W = W / BEAT_LANES;
const PERSP = 2;
const ZMAX = 1.7;
/** Seconds of song per unit of depth (how fast the notes come). */
const LOOK: Record<BeatDiff, number> = { easy: 1.15, normal: 0.95, hard: 0.8 };
const sAt = (z: number) => 1 / (1 + PERSP * Math.max(-0.12, z));
const yAt = (s: number) => HZ + (LINE - HZ) * s;
const xAt = (edge: number, s: number) => CX + (edge * LANE_W - CX) * s;

// ---- the menu's buttons
const TRACK_Y = 96, TRACK_H = 58, TRACK_GAP = 64;
const DIFF_Y = 300, DIFF_H = 46;
const SYNC_Y = 364, SYNC_H = 40;
const PLAY = { x: 70, y: 418, w: 220, h: 50 };
const MINUS = { x: 110, y: SYNC_Y, w: 44, h: SYNC_H };
const PLUS = { x: 226, y: SYNC_Y, w: 44, h: SYNC_H };
const TEST = { x: 280, y: SYNC_Y, w: 66, h: SYNC_H };
const inBox = (b: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

// ---- saved per device: sync offset, last pick, best grades
interface Saved {
  offset: number;
  track: string;
  diff: BeatDiff;
  best: Record<string, BeatGrade>;
}
const STORE = 'nyc.beats.v1';
function loadSaved(): Saved {
  const d: Saved = { offset: 0, track: BEAT_TRACKS[0].id, diff: 'normal', best: {} };
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (v && typeof v === 'object') return { ...d, ...v, best: { ...(v.best ?? {}) } };
  } catch {
    // Private mode or blocked storage: defaults.
  }
  return d;
}
function save(s: Saved): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    // Fine: it just won't be remembered.
  }
}
const GRADE_RANK: Record<BeatGrade, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };

// ---------------------------------------------------------------- the clock

/**
 * Song time from the audio clock. `heard(perfMs)` maps a performance.now()
 * time (a frame, or an input event's timeStamp) to the AudioContext time
 * that's coming out of the speaker at that moment. It's smoothed so the
 * highway scrolls evenly (the raw audio clock moves in chunks).
 */
class SongClock {
  readonly ctx: AudioContext | null;
  private k = 0;
  private synced = false;
  start = 0; // AudioContext time (or perf seconds without sound) of song time 0
  constructor(ctx: AudioContext | null) {
    this.ctx = ctx;
  }
  private raw(perf: number): number {
    const c = this.ctx!;
    const ts = typeof c.getOutputTimestamp === 'function' ? c.getOutputTimestamp() : null;
    if (ts && ts.contextTime && ts.performanceTime) return ts.contextTime - ts.performanceTime / 1000;
    const lat = (c.outputLatency || 0) + (c.baseLatency || 0);
    return c.currentTime - lat - perf / 1000;
  }
  /** Call once a frame. */
  sync(perf: number): void {
    if (!this.ctx) return;
    const r = this.raw(perf);
    if (!this.synced || Math.abs(r - this.k) > 0.05) this.k = r;
    else this.k += (r - this.k) * 0.06;
    this.synced = true;
  }
  /** The heard audio time at a performance.now() moment. */
  heard(perf: number): number {
    return this.ctx ? perf / 1000 + this.k : perf / 1000;
  }
  /** "Now" for scheduling (what's being rendered, not heard). */
  get ahead(): number {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }
  song(perf: number): number {
    return this.heard(perf) - this.start;
  }
}

// ---------------------------------------------------------------- the scene

function drawCity(g: CanvasRenderingContext2D): void {
  const sky = g.createLinearGradient(0, 0, 0, HZ + 80);
  sky.addColorStop(0, '#0a0620');
  sky.addColorStop(0.7, '#2a0f45');
  sky.addColorStop(1, '#5a1a5e');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // Stars and a moon.
  let a = 7;
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(255,255,255,.7)';
  for (let k = 0; k < 40; k++) g.fillRect(rnd() * W, rnd() * 90, 1.4, 1.4);
  g.fillStyle = '#ffe9b0';
  g.beginPath();
  g.arc(300, 64, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a0f45';
  g.beginPath();
  g.arc(306, 60, 12, 0, Math.PI * 2);
  g.fill();
  // The skyline on the horizon, lit windows.
  let x = -4;
  while (x < W) {
    const w = 16 + rnd() * 26, h = 22 + rnd() * 56;
    g.fillStyle = rnd() < 0.5 ? '#1a0f2e' : '#140b25';
    g.fillRect(x, HZ + 40 - h, w, h + 40);
    for (let wy = HZ + 46 - h; wy < HZ + 36; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (rnd() < 0.3) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,214,120,.8)' : 'rgba(120,220,255,.6)';
      g.fillRect(wx, wy, 2.5, 3);
    }
    x += w + 1;
  }
  // The Empire State, middle-left, because of course.
  g.fillStyle = '#1d1233';
  g.fillRect(96, HZ - 40, 22, 80);
  g.fillRect(101, HZ - 58, 12, 20);
  g.fillRect(105.5, HZ - 76, 3, 20);
  // Street level.
  g.fillStyle = '#0d0818';
  g.fillRect(0, HZ + 40, W, H);
}

/** The road from the far end to the bottom of the screen. */
function roadPath(g: CanvasRenderingContext2D, e0: number, e1: number, sTop: number, sBot: number): void {
  g.beginPath();
  g.moveTo(xAt(e0, sTop), yAt(sTop));
  g.lineTo(xAt(e1, sTop), yAt(sTop));
  g.lineTo(xAt(e1, sBot), yAt(sBot));
  g.lineTo(xAt(e0, sBot), yAt(sBot));
  g.closePath();
}

// ---------------------------------------------------------------- sound

interface Rig {
  a: AudioContext;
  lead: GainNode;
  out: GainNode;
  ambBefore: number;
}

function makeRig(a: AudioContext): Rig | null {
  const sfxBus = bus('sfx');
  if (!sfxBus) return null;
  const lead = a.createGain();
  lead.gain.value = 1;
  const out = a.createGain();
  out.gain.value = 1;
  lead.connect(out).connect(sfxBus);
  // Duck the city's music and street sounds while the song plays.
  const amb = bus('ambience');
  const ambBefore = amb ? amb.gain.value : 0;
  if (amb) {
    amb.gain.cancelScheduledValues(a.currentTime);
    amb.gain.setTargetAtTime(0, a.currentTime, 0.12);
  }
  return { a, lead, out, ambBefore };
}

function releaseRig(r: Rig): void {
  const t = r.a.currentTime;
  r.lead.gain.setTargetAtTime(0, t, 0.05);
  r.out.gain.setTargetAtTime(0, t + 0.3, 0.1);
  const amb = bus('ambience');
  if (amb) {
    amb.gain.cancelScheduledValues(t);
    amb.gain.setTargetAtTime(r.ambBefore, t + 0.2, 0.4);
  }
  window.setTimeout(() => {
    try {
      r.out.disconnect();
    } catch {
      // Already gone.
    }
  }, 1500);
}

/** One lead note (our own voice, so a miss can mute the line). */
function leadVoice(r: Rig, f: number, when: number, dur: number, type: OscillatorType): void {
  const a = r.a;
  const o = a.createOscillator();
  const flt = a.createBiquadFilter();
  const env = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, when);
  flt.type = 'lowpass';
  flt.frequency.setValueAtTime(type === 'sawtooth' ? 2200 : 3200, when);
  const peak = type === 'sawtooth' ? 0.05 : type === 'square' ? 0.045 : 0.09;
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(peak, when + 0.006);
  env.gain.exponentialRampToValueAtTime(peak * 0.55, when + 0.09);
  env.gain.setValueAtTime(peak * 0.55, when + Math.max(0.09, dur));
  env.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.09, dur) + 0.08);
  o.connect(flt).connect(env).connect(r.lead);
  o.start(when);
  o.stop(when + Math.max(0.09, dur) + 0.12);
}

// ---------------------------------------------------------------- the game

type Phase = 'menu' | 'calib' | 'play' | 'paused' | 'results';

export const beats: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const saved = loadSaved();
  const city = prerender(W, H, drawCity);
  let trackI = Math.max(0, BEAT_TRACKS.findIndex((t) => t.id === saved.track));
  let diffI = Math.max(0, BEAT_DIFFS.indexOf(saved.diff));
  let phase: Phase = 'menu';
  let raf = 0, stopped = false;
  let clock: SongClock | null = null;
  let rig: Rig | null = null;
  let game: BeatGame | null = null;
  let track: BeatTrack = BEAT_TRACKS[trackI];
  let diff: BeatDiff = BEAT_DIFFS[diffI];
  let schedTimer = 0;
  let nextStep = -16;
  let leadAt: Map<number, number[]> = new Map();
  let songT = -99;
  let pausedAt = 0;
  let resultsAt = 0;
  let nudged = 0;
  let silent = false;
  let audioCheck: { perf: number; ctx: number } | null = null;
  // Per-lane feel.
  const press = [0, 0, 0, 0]; // how lit each target is
  const down = [false, false, false, false];
  const jText: ({ text: string; color: string; sub: string; at: number } | null)[] = [null, null, null, null];
  const pointerLane = new Map<number, number>();
  let kick = 0; // speaker pump
  let crowdShown = 0.6;

  // ---------------------------------------------------------- audio scheduling
  const scheduleAhead = () => {
    if (!clock || !rig || !game || phase === 'paused') return;
    const six = beatSix(track);
    const horizon = clock.ahead + 0.16;
    const lastStep = track.arrangement.length * 16 + 1;
    while (nextStep <= lastStep && clock.start + nextStep * six < horizon) {
      const when = clock.start + nextStep * six;
      const off = when - rig.a.currentTime;
      if (off >= -0.015) playStep(nextStep, Math.max(0, off), when, six);
      nextStep++;
    }
  };

  const playStep = (step: number, off: number, when: number, six: number) => {
    if (!rig) return;
    for (const h of beatBacking(track, step)) {
      switch (h.k) {
        case 'kick':
        case 'snare':
        case 'hat':
        case 'clap':
          drum(h.k, off, h.g, 'sfx');
          if (h.k === 'kick') window.setTimeout(() => (kick = 1), off * 1000);
          break;
        case 'stick':
          note(h.g > 0.9 ? 2600 : 2000, off, 0.035, 'square', 0.03, 'sfx');
          hiss(off, 0.03, { type: 'highpass', freq: 4000, gain: 0.12, out: 'sfx' });
          break;
        case 'crash':
          hiss(off, 1.3 * h.g, { type: 'highpass', freq: 5200, gain: 0.1 * h.g, out: 'sfx' });
          break;
        case 'bass':
          note(h.f, off, six * h.steps * 0.95, track.groove === 'house' ? 'sawtooth' : 'triangle', track.groove === 'house' ? 0.06 * h.g : 0.12 * h.g, 'sfx');
          break;
        case 'stab':
          note(h.f, off, six * h.steps * 0.9, track.groove === 'chip' ? 'triangle' : 'square', (track.groove === 'chip' ? 0.022 : 0.012) * h.g, 'sfx');
          break;
        case 'pad':
          note(h.f, off, six * h.steps, 'triangle', 0.03 * h.g, 'sfx');
          break;
      }
    }
    // The lead: the chart's notes at this step.
    const ids = leadAt.get(step);
    if (ids && game) for (const id of ids) {
      const n = game.notes[id];
      leadVoice(rig, beatLeadFreq(track, n.step, n.lane), when, n.len > 0 ? n.len : six * 1.6, track.lead);
    }
  };

  const leadOn = (on: boolean) => {
    if (!rig) return;
    rig.lead.gain.setTargetAtTime(on ? 1 : 0.1, rig.a.currentTime, on ? 0.01 : 0.03);
  };

  // ---------------------------------------------------------- start a song
  const begin = () => {
    track = BEAT_TRACKS[trackI];
    diff = BEAT_DIFFS[diffI];
    saved.track = track.id;
    saved.diff = diff;
    save(saved);
    game = new BeatGame(track, diff);
    leadAt = new Map();
    game.notes.forEach((n, i) => {
      const a = leadAt.get(n.step) ?? [];
      a.push(i);
      leadAt.set(n.step, a);
    });
    const a = ac();
    silent = !a;
    clock = new SongClock(a);
    if (a) {
      rig = makeRig(a);
      if (!rig) silent = true;
    }
    const now = performance.now();
    if (clock.ctx) {
      // Song time 0 is one bar of count-in (plus a moment to get ready) from now.
      clock.start = clock.ctx.currentTime + 0.25 + beatBar(track);
      clock.sync(now);
      audioCheck = { perf: now, ctx: clock.ctx.currentTime };
    } else clock.start = now / 1000 + 0.25 + beatBar(track);
    nextStep = -16;
    phase = 'play';
    songT = -beatBar(track) - 0.25;
    crowdShown = game.crowd;
    // No sound: it counts in with the lights only.
    if (clock.ctx) {
      scheduleAhead();
      schedTimer = window.setInterval(scheduleAhead, 25);
    }
  };

  /** No sound came (blocked or suspended audio): carry on to the lights. */
  const goSilent = () => {
    if (!clock) return;
    const t = clock.song(performance.now());
    window.clearInterval(schedTimer);
    if (rig) releaseRig(rig);
    rig = null;
    silent = true;
    const c = new SongClock(null);
    c.start = performance.now() / 1000 - t;
    clock = c;
  };

  // ---------------------------------------------------------- calibration (tap test)
  const CAL_GAP = 0.6, CAL_N = 16, CAL_SKIP = 4;
  let cal: { clock: SongClock; taps: number[]; result: number | null; at: number } | null = null;
  const startCalib = () => {
    const a = ac();
    const c = new SongClock(a);
    const now = performance.now();
    c.start = (a ? a.currentTime : now / 1000) + 0.4;
    c.sync(now);
    if (a) for (let i = 0; i < CAL_N; i++) {
      const off = c.start + i * CAL_GAP - a.currentTime;
      note(i < CAL_SKIP ? 1760 : 2200, off, 0.04, 'square', 0.035, 'sfx');
      drum('kick', off, 0.6, 'sfx');
    }
    cal = { clock: c, taps: [], result: null, at: now };
    phase = 'calib';
  };
  const calTap = (perf: number) => {
    if (!cal || cal.result !== null) return;
    const t = cal.clock.song(perf);
    const i = Math.round(t / CAL_GAP);
    if (i < CAL_SKIP || i >= CAL_N) return;
    const d = t - i * CAL_GAP;
    if (Math.abs(d) < 0.25) cal.taps.push(d);
    press[i % 4] = 1;
  };
  const finishCalib = () => {
    if (!cal) return;
    if (cal.taps.length >= 6) {
      const s = [...cal.taps].sort((a, b) => a - b);
      const med = s[Math.floor(s.length / 2)];
      saved.offset = clamp(Math.round((med * 1000) / 5) * 5, -200, 300);
      save(saved);
      cal.result = saved.offset;
      sfx.good();
    } else cal.result = NaN;
    cal.at = performance.now();
  };

  // ---------------------------------------------------------- events → juice
  const laneX = (l: number) => (l + 0.5) * LANE_W;
  const react = (ev: BeatEvent) => {
    if (!game) return;
    const now = performance.now();
    switch (ev.type) {
      case 'hit': {
        const [text, color] = J_TEXT[ev.j];
        const ms = Math.round(ev.delta * 1000);
        jText[ev.lane] = { text, color, sub: ev.j === 'perfect' ? '' : ms < 0 ? 'early' : 'late', at: now };
        fx.burst(laneX(ev.lane), LINE, { colors: [COLORS[ev.lane], '#fff'], n: REDUCED ? 4 : ev.j === 'perfect' ? 14 : 7, speed: 220, size: 4, gravity: 260, up: true, life: 0.5 });
        leadOn(true);
        if (ev.combo > 0 && ev.combo % 50 === 0) {
          fx.stamp(`${ev.combo} COMBO!`, '#ffd23f', 0.8);
          sfx.cheer();
        } else if (ev.combo === 25) fx.stamp('25 COMBO!', '#7bd88f', 0.7);
        if (silent) sfx.tick();
        break;
      }
      case 'miss':
      case 'ghost': {
        jText[ev.lane] = { text: ev.type === 'miss' ? 'MISS' : '×', color: '#ff6a6a', sub: '', at: now };
        if (ev.type === 'miss') leadOn(false);
        if (ev.lostCombo >= 10) {
          fx.shake(6, 0.2);
          fx.pop(CX, 70, 'combo broken', '#ffb3bb', 16);
        }
        // A dead, muted pluck.
        note(98, 0, 0.09, 'square', 0.02, 'sfx');
        hiss(0, 0.05, { type: 'lowpass', freq: 500, gain: 0.08, out: 'sfx' });
        break;
      }
      case 'holdDone':
        fx.pop(laneX(ev.lane), LINE - 46, `HOLD +${ev.pts}`, COLORS[ev.lane], 16);
        fx.burst(laneX(ev.lane), LINE, { colors: [COLORS[ev.lane], '#fff'], n: REDUCED ? 4 : 10, speed: 180, size: 4, up: true, life: 0.5 });
        break;
      case 'holdDrop':
        jText[ev.lane] = { text: 'DROPPED', color: '#ffb3bb', sub: '', at: now };
        leadOn(false);
        break;
      case 'hype':
        if (ev.on) {
          fx.stamp('🔥 HYPE ×2 🔥', '#ff4fa3', 1);
          if (!REDUCED) fx.flash('#ff4fa3', 0.25);
          sfx.cheer();
          buzz([20, 40, 20]);
        } else fx.pop(CX, 90, 'hype over', '#ffc2e0', 16);
        break;
      case 'booed':
        fx.stamp('BOOED OFF 🍅', '#ff4d5e', 1.6);
        fx.burst(CX, 30, { emoji: '🍅', n: REDUCED ? 6 : 16, size: 24, speed: 160, gravity: 500 });
        fx.shake(12, 0.4);
        sfx.bad();
        endSong();
        break;
      case 'end':
        endSong();
        break;
    }
  };

  const endSong = () => {
    if (!game || phase === 'results') return;
    phase = 'results';
    resultsAt = performance.now();
    window.clearInterval(schedTimer);
    if (game.booed && rig) leadOn(false);
    const grade = game.grade();
    // Best grade per track and difficulty (this device).
    const key = `${track.id}:${diff}`;
    const prev = saved.best[key];
    if (!game.booed && (!prev || GRADE_RANK[grade] > GRADE_RANK[prev])) saved.best[key] = grade;
    // Consistently early or late? Nudge the sync halfway there.
    nudged = 0;
    const bias = game.timingBias();
    if (!game.booed && bias !== null && Math.abs(bias) >= 20) {
      const before = saved.offset;
      saved.offset = clamp(Math.round((saved.offset + bias * 0.5) / 5) * 5, -200, 300);
      nudged = saved.offset - before;
    }
    save(saved);
    if (!game.booed) {
      fx.stamp(grade === 'S' ? 'S RANK!' : grade === 'A' ? 'ENCORE!' : 'SONG CLEAR', GRADE_COLOR[grade], 1.2);
      if (grade === 'S' || grade === 'A') {
        sfx.cheer();
        fx.burst(CX, 160, { emoji: ['⭐', '🎶', '✨'], n: REDUCED ? 8 : 22, size: 20, speed: 260 });
      }
    }
    window.setTimeout(() => rig && (releaseRig(rig), (rig = null)), 1600);
  };

  const finish = () => {
    if (!game || fin.ended) return;
    fin.end(game.score, 300);
  };

  // ---------------------------------------------------------- input
  const pressLane = (lane: number, perf: number) => {
    press[lane] = 1;
    down[lane] = true;
    if (!game || !clock || phase !== 'play') return;
    const t = clock.song(perf) - saved.offset / 1000;
    game.press(lane, t);
  };
  const releaseLane = (lane: number, perf: number) => {
    down[lane] = false;
    if (!game || !clock || phase !== 'play') return;
    game.release(lane, clock.song(perf) - saved.offset / 1000);
  };

  const menuTap = (x: number, y: number) => {
    for (let i = 0; i < BEAT_TRACKS.length; i++) {
      if (y >= TRACK_Y + i * TRACK_GAP && y <= TRACK_Y + i * TRACK_GAP + TRACK_H && x > 10 && x < W - 10) {
        if (trackI !== i) (trackI = i), sfx.tap();
        return;
      }
    }
    if (y >= DIFF_Y && y <= DIFF_Y + DIFF_H) {
      const i = clamp(Math.floor((x - 14) / 112), 0, 2);
      if (diffI !== i) (diffI = i), sfx.tap();
      return;
    }
    if (inBox(MINUS, x, y)) return ((saved.offset = Math.max(-200, saved.offset - 10)), save(saved), sfx.tap());
    if (inBox(PLUS, x, y)) return ((saved.offset = Math.min(300, saved.offset + 10)), save(saved), sfx.tap());
    if (inBox(TEST, x, y)) return startCalib();
    if (inBox(PLAY, x, y)) begin();
  };

  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic event: fine.
    }
    ac(); // wake the audio on a real tap
    const p = at(cv, e);
    if (phase === 'menu') return menuTap(p.x, p.y);
    if (phase === 'calib') return calTap(e.timeStamp || performance.now());
    if (phase === 'paused') return resume();
    if (phase === 'results') {
      if (performance.now() - resultsAt > 900) finish();
      return;
    }
    const lane = clamp(Math.floor(p.x / LANE_W), 0, BEAT_LANES - 1);
    pointerLane.set(e.pointerId, lane);
    pressLane(lane, e.timeStamp || performance.now());
  };
  const onUp = (e: PointerEvent) => {
    const lane = pointerLane.get(e.pointerId);
    if (lane === undefined) return;
    pointerLane.delete(e.pointerId);
    // Another finger might still be on this lane.
    if ([...pointerLane.values()].includes(lane)) return;
    releaseLane(lane, e.timeStamp || performance.now());
  };
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  const offK = keys(
    (k, e) => {
      const key = k.toLowerCase();
      if (phase === 'menu') {
        if (key === 'arrowup') trackI = (trackI + BEAT_TRACKS.length - 1) % BEAT_TRACKS.length;
        else if (key === 'arrowdown') trackI = (trackI + 1) % BEAT_TRACKS.length;
        else if (key === 'arrowleft') diffI = Math.max(0, diffI - 1);
        else if (key === 'arrowright') diffI = Math.min(2, diffI + 1);
        else if (key === 'enter' || key === ' ') (ac(), begin());
        return;
      }
      if (phase === 'calib') return void (key === ' ' || key in KEYS_LANE ? calTap(e.timeStamp || performance.now()) : 0);
      if (phase === 'paused') return resume();
      if (phase === 'results') return void ((key === 'enter' || key === ' ') && performance.now() - resultsAt > 900 && finish());
      const lane = KEYS_LANE[key];
      if (lane !== undefined) (e.preventDefault(), pressLane(lane, e.timeStamp || performance.now()));
    },
    (k, e) => {
      const lane = KEYS_LANE[k.toLowerCase()];
      if (lane !== undefined) releaseLane(lane, e.timeStamp || performance.now());
    },
  );

  // ---------------------------------------------------------- pause when the app goes to the background
  const onVis = () => {
    if (document.hidden && phase === 'play' && clock && game) {
      pausedAt = clock.song(performance.now());
      phase = 'paused';
      window.clearInterval(schedTimer);
      leadOn(false);
      for (let l = 0; l < BEAT_LANES; l++) if (game.heldNote(l) !== null) game.release(l, pausedAt);
    }
  };
  document.addEventListener('visibilitychange', onVis);
  const resume = () => {
    if (phase !== 'paused' || !clock || !game) return;
    // Back in two beats, with a count of sticks.
    const beat = beatBar(track) / 4;
    const lead = 2 * beat + 0.2;
    const now = performance.now();
    if (clock.ctx && rig) {
      clock.start = clock.ctx.currentTime + lead - pausedAt;
      clock.sync(now);
      for (let i = 0; i < 2; i++) note(2200, 0.2 + i * beat, 0.035, 'square', 0.03, 'sfx');
      nextStep = Math.ceil(pausedAt / beatSix(track));
      leadOn(true);
      schedTimer = window.setInterval(scheduleAhead, 25);
    } else clock.start = now / 1000 + lead - pausedAt;
    phase = 'play';
  };

  // ---------------------------------------------------------- drawing
  const drawHighway = (t: number, now: number) => {
    const look = LOOK[diff];
    const hyped = game?.hyped ?? false;
    const sTop = sAt(ZMAX), sBot = (H - HZ) / (LINE - HZ);
    // The road.
    const rg = g.createLinearGradient(0, yAt(sTop), 0, H);
    rg.addColorStop(0, 'rgba(20,10,40,.2)');
    rg.addColorStop(1, hyped ? 'rgba(80,10,60,.95)' : 'rgba(18,10,36,.95)');
    g.fillStyle = rg;
    roadPath(g, 0, 4, sTop, sBot);
    g.fill();
    // Lane glow while held / pressed.
    for (let l = 0; l < BEAT_LANES; l++) {
      press[l] = Math.max(down[l] ? 0.55 : 0, press[l]);
      if (press[l] <= 0.01) continue;
      const lg = g.createLinearGradient(0, LINE, 0, yAt(sAt(0.9)));
      lg.addColorStop(0, COLORS[l] + '77');
      lg.addColorStop(1, COLORS[l] + '00');
      g.globalAlpha = press[l];
      g.fillStyle = lg;
      roadPath(g, l, l + 1, sAt(0.9), 1);
      g.fill();
      g.globalAlpha = 1;
    }
    // Beat lines rushing toward you (bar lines brighter).
    const beat = beatBar(track) / 4;
    const firstBeat = Math.ceil((t - 0.12 * look) / beat);
    for (let b = firstBeat; ; b++) {
      const z = (b * beat - t) / look;
      if (z > ZMAX) break;
      const s = sAt(z);
      const y = yAt(s);
      const barLine = ((b % 4) + 4) % 4 === 0;
      g.strokeStyle = barLine ? `rgba(255,255,255,${0.32 * Math.min(1, (ZMAX - z) * 2)})` : `rgba(255,255,255,${0.1 * Math.min(1, (ZMAX - z) * 2)})`;
      g.lineWidth = barLine ? 2 : 1;
      g.beginPath();
      g.moveTo(xAt(0, s), y);
      g.lineTo(xAt(4, s), y);
      g.stroke();
    }
    // Lane dividers and the edges.
    for (let e = 0; e <= 4; e++) {
      const edge = e === 0 || e === 4;
      g.strokeStyle = edge ? (hyped ? '#ff4fa3' : '#8a5cff') : 'rgba(255,255,255,.12)';
      g.lineWidth = edge ? 3 : 1;
      g.beginPath();
      g.moveTo(xAt(e, sTop), yAt(sTop));
      g.lineTo(xAt(e, sBot), yAt(sBot));
      g.stroke();
    }
    // The strike line and targets (they pump with the kick).
    const pulse = REDUCED ? 0 : kick;
    g.fillStyle = `rgba(255,255,255,${0.35 + pulse * 0.4})`;
    g.fillRect(0, LINE - 2, W, 4);
    for (let l = 0; l < BEAT_LANES; l++) {
      const x = laneX(l);
      g.strokeStyle = COLORS[l];
      g.lineWidth = 3 + press[l] * 3;
      g.beginPath();
      g.roundRect(x - 34, LINE - 13, 68, 26, 10);
      g.stroke();
      if (press[l] > 0.05) {
        g.globalAlpha = press[l] * 0.6;
        g.fillStyle = COLORS[l];
        g.fill();
        g.globalAlpha = 1;
      }
      if (!COARSE) label(g, KEY_LABEL[l], x, LINE + 44, 13, 'rgba(255,255,255,.28)');
    }
    if (!game) return;
    // Notes, far ones first.
    const notes = game.notes;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      const z = (n.t - t) / look;
      if (z > ZMAX) continue;
      const st = game.state[i];
      const tailZ = (n.t + n.len - t) / look;
      if (n.len === 0 && st.res !== null && st.res !== 'miss') continue;
      if (n.len > 0 && (st.hold === 'done' || tailZ < -0.15)) continue;
      if (z < -0.15 && n.len === 0) continue;
      const fade = clamp((ZMAX - z) / 0.25, 0, 1);
      const missed = st.res === 'miss' || st.hold === 'drop';
      const held = st.hold === 'on';
      const col = missed ? '#55506a' : COLORS[n.lane];
      g.globalAlpha = fade * (missed ? 0.6 : 1);
      // Hold body: a ribbon down the lane (it shortens while you hold it).
      if (n.len > 0) {
        const z0 = held ? 0 : Math.max(-0.1, z);
        const z1 = Math.min(ZMAX, tailZ);
        if (z1 > z0) {
          const s0 = sAt(z0), s1 = sAt(z1);
          const c = n.lane + 0.5;
          g.fillStyle = col;
          g.globalAlpha = fade * (missed ? 0.3 : held ? 0.85 : 0.55);
          g.beginPath();
          g.moveTo(xAt(c - 0.18, s1), yAt(s1));
          g.lineTo(xAt(c + 0.18, s1), yAt(s1));
          g.lineTo(xAt(c + 0.18, s0), yAt(s0));
          g.lineTo(xAt(c - 0.18, s0), yAt(s0));
          g.closePath();
          g.fill();
          if (held && !REDUCED) fx.burst(laneX(n.lane), LINE, { colors: [COLORS[n.lane], '#fff'], n: 1, speed: 120, size: 3, up: true, life: 0.35 });
          g.globalAlpha = fade;
          // The end cap.
          g.beginPath();
          g.ellipse(xAt(c, s1), yAt(s1), LANE_W * 0.22 * s1, 6 * s1, 0, 0, Math.PI * 2);
          g.fill();
        }
        if (held || (st.res !== null && st.res !== 'miss')) {
          g.globalAlpha = 1;
          continue;
        }
      }
      // The gem.
      const s = sAt(z);
      const x = CX + (laneX(n.lane) - CX) * s, y = yAt(s);
      const w = 70 * s, h = 22 * s;
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(x - w / 2, y - h / 2, w, h, 8 * s);
      g.fill();
      if (hyped && !missed) {
        // Hype: a white-hot rim (the lane colour stays readable).
        g.strokeStyle = '#fff';
        g.lineWidth = Math.max(1.5, 3 * s);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.fillRect(x - w / 2 + 5 * s, y - h / 2 + 3 * s, w - 10 * s, 4 * s);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(x - w / 2 + 4 * s, y + h / 2 - 5 * s, w - 8 * s, 3 * s);
      g.globalAlpha = 1;
    }
    // Judgments over each lane.
    for (let l = 0; l < BEAT_LANES; l++) {
      const j = jText[l];
      if (!j) continue;
      const age = (now - j.at) / 1000;
      if (age > 0.5) {
        jText[l] = null;
        continue;
      }
      g.globalAlpha = clamp((0.5 - age) * 4, 0, 1);
      const pop = REDUCED ? 1 : age < 0.08 ? 1.25 - age * 3 : 1;
      label(g, j.text, laneX(l), LINE - 34 - age * 30, Math.round(15 * pop), j.color);
      if (j.sub) label(g, j.sub, laneX(l), LINE - 18 - age * 30, 11, 'rgba(255,255,255,.7)');
      g.globalAlpha = 1;
    }
  };

  const drawCrowd = (now: number) => {
    // Silhouettes either side of the road, bouncing with the beat (more when they're into it).
    const c = game ? game.crowd : 0.6;
    const mood = c > 0.5 ? 1 : c > 0.25 ? 0.5 : 0.15;
    for (let i = 0; i < 9; i++) {
      for (const side of [0, 1]) {
        const x = side ? W - 14 - i * 13 : 14 + i * 13;
        const hop = REDUCED ? 0 : Math.abs(Math.sin(now / 160 + i * 1.7 + side)) * 6 * mood * (0.5 + kick);
        const y = HZ + 74 + (i % 2) * 8 - hop;
        g.fillStyle = side ? '#2a1748' : '#24143f';
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x - 6, y + 5, 12, 16);
        if (mood > 0.9 && i % 3 === 0) g.fillRect(x + (side ? -9 : 5), y - 12 + hop * 0.4, 3, 12); // hands up
      }
    }
  };

  const drawHudTop = (t: number) => {
    if (!game) return;
    crowdShown += (game.crowd - crowdShown) * 0.15;
    const c = crowdShown;
    emoji(g, c > 0.5 ? '😃' : c > 0.25 ? '😐' : '😬', 20, 22, 18);
    bar(g, 34, 19, 92, c, c > 0.5 ? '#7bd88f' : c > 0.25 ? '#ffd23f' : '#ff4d5e');
    emoji(g, '🔥', W - 20, 22, 18);
    const hf = game.hyped ? (game.hypeUntil - t) / BEAT_HYPE_SECONDS : game.hype;
    bar(g, W - 126, 19, 92, hf, game.hyped ? '#ff4fa3' : '#ff4fa3aa');
    label(g, num(game.score), CX, 22, 22, '#fff');
    // Song progress.
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.fillRect(0, 0, W, 3);
    g.fillStyle = '#8a5cff';
    g.fillRect(0, 0, W * clamp(t / beatSongLength(track), 0, 1), 3);
    if (game.combo >= 5) {
      label(g, `${game.combo}`, CX, 56, 28, game.hyped ? '#ff4fa3' : '#ffd23f');
      if (game.mult > 1) label(g, `×${game.mult}`, CX + 34 + String(game.combo).length * 6, 58, 16, game.hyped ? '#ff4fa3' : '#7bd88f', 'left');
    }
  };

  const drawLights = (now: number) => {
    if (REDUCED) return;
    const hyped = game?.hyped ?? false;
    for (const side of [0, 1]) {
      const a = Math.sin(now / 900 + side * 2) * 0.5 + (side ? -0.35 : 0.35);
      g.save();
      g.translate(side ? W - 10 : 10, 0);
      g.rotate(a);
      const lg = g.createLinearGradient(0, 0, 0, 300);
      const col = hyped ? '255,79,163' : side ? '54,197,240' : '138,92,255';
      lg.addColorStop(0, `rgba(${col},.32)`);
      lg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(-6, 0);
      g.lineTo(6, 0);
      g.lineTo(46, 300);
      g.lineTo(-46, 300);
      g.closePath();
      g.fill();
      g.restore();
    }
  };

  const button = (b: { x: number; y: number; w: number; h: number }, text: string, on: boolean, color: string, size = 16) => {
    g.fillStyle = on ? color : 'rgba(255,255,255,.08)';
    g.beginPath();
    g.roundRect(b.x, b.y, b.w, b.h, 12);
    g.fill();
    g.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.25)';
    g.lineWidth = on ? 2.5 : 1.5;
    g.stroke();
    label(g, text, b.x + b.w / 2, b.y + b.h / 2 + 1, size, '#fff');
  };

  const drawMenu = (now: number) => {
    g.drawImage(city, 0, 0);
    drawLights(now);
    g.fillStyle = 'rgba(10,6,30,.55)';
    g.fillRect(0, 0, W, H);
    const wob = REDUCED ? 0 : Math.sin(now / 300) * 2;
    label(g, 'BEAT STREET', CX, 46 + wob, 34, '#ff4fa3');
    label(g, 'pick a track', CX, 78, 13, 'rgba(255,255,255,.7)');
    BEAT_TRACKS.forEach((t, i) => {
      const y = TRACK_Y + i * TRACK_GAP;
      const on = i === trackI;
      g.fillStyle = on ? 'rgba(138,92,255,.45)' : 'rgba(255,255,255,.06)';
      g.beginPath();
      g.roundRect(12, y, W - 24, TRACK_H, 14);
      g.fill();
      g.strokeStyle = on ? '#ff4fa3' : 'rgba(255,255,255,.18)';
      g.lineWidth = on ? 3 : 1.5;
      g.stroke();
      emoji(g, t.emoji, 42, y + TRACK_H / 2, 28);
      label(g, t.name, 70, y + 20, 18, '#fff', 'left');
      g.font = '600 12px system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText(t.blurb, 70, y + 41);
      label(g, '★'.repeat(i + 1), W - 24, y + 18, 13, '#ffd23f', 'right');
      const best = saved.best[`${t.id}:${BEAT_DIFFS[diffI]}`];
      if (best) label(g, best, W - 30, y + 40, 18, GRADE_COLOR[best], 'right');
    });
    BEAT_DIFFS.forEach((d, i) => button({ x: 14 + i * 112, y: DIFF_Y, w: 104, h: DIFF_H }, DIFF_LABEL[d], i === diffI, ['#2f9e57', '#1f86b8', '#d0307f'][i]));
    label(g, '🎧 Sync', 14, SYNC_Y + SYNC_H / 2, 15, '#fff', 'left');
    button(MINUS, '−', false, '#fff', 20);
    button(PLUS, '+', false, '#fff', 20);
    label(g, `${saved.offset > 0 ? '+' : ''}${saved.offset} ms`, (MINUS.x + MINUS.w + PLUS.x) / 2, SYNC_Y + SYNC_H / 2, 14, '#fff');
    button(TEST, 'Tap test', false, '#fff', 13);
    const pulse = REDUCED ? 0 : (Math.sin(now / 200) + 1) * 0.5;
    g.shadowColor = '#ff4fa3';
    g.shadowBlur = 10 + pulse * 10;
    button(PLAY, '▶  PLAY', true, '#e0368c', 22);
    g.shadowBlur = 0;
  };

  const drawCalib = (now: number) => {
    g.drawImage(city, 0, 0);
    g.fillStyle = 'rgba(10,6,30,.7)';
    g.fillRect(0, 0, W, H);
    if (!cal) return;
    const t = cal.clock.song(now);
    label(g, '🎧 TAP TEST', CX, 60, 26, '#36c5f0');
    const i = Math.round(t / CAL_GAP);
    const ph = t - Math.floor(t / CAL_GAP + 0.5) * CAL_GAP;
    const flash = t > -0.1 && i < CAL_N ? Math.exp(-Math.abs(ph) * 18) : 0;
    glowDot(g, CX, 220, 34 + flash * 14, i < CAL_SKIP ? '#8a5cff' : '#36c5f0', 10 + flash * 20);
    if (cal.result === null) {
      label(g, i < CAL_SKIP ? 'listen…' : 'tap anywhere on each click', CX, 300, 16, '#fff');
      label(g, `${cal.taps.length} taps`, CX, 330, 13, 'rgba(255,255,255,.6)');
      // Each tap, early ← → late.
      g.fillStyle = 'rgba(255,255,255,.2)';
      g.fillRect(60, 370, 240, 2);
      g.fillRect(179, 362, 2, 18);
      for (const d of cal.taps) {
        g.fillStyle = '#ffd23f';
        g.fillRect(180 + clamp(d * 600, -120, 120) - 1.5, 364, 3, 14);
      }
      if (t > CAL_N * CAL_GAP + 0.3) finishCalib();
    } else {
      label(g, Number.isNaN(cal.result) ? 'Not enough taps. Try again?' : `Sync set to ${cal.result > 0 ? '+' : ''}${cal.result} ms`, CX, 300, 18, '#fff');
      if (now - cal.at > 1600) {
        phase = 'menu';
        cal = null;
      }
    }
  };

  const drawResults = (now: number) => {
    if (!game) return;
    const age = (now - resultsAt) / 1000;
    g.fillStyle = `rgba(8,4,24,${Math.min(0.82, age * 1.6)})`;
    g.fillRect(0, 0, W, H);
    if (age < 0.5) return;
    const grade = game.grade();
    const pop = REDUCED ? 1 : Math.min(1, (age - 0.5) * 5);
    g.save();
    g.translate(CX, 128);
    g.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
    label(g, grade, 0, 0, 96, GRADE_COLOR[grade]);
    g.restore();
    label(g, `${track.emoji} ${track.name} · ${DIFF_LABEL[diff]}`, CX, 196, 15, '#fff');
    label(g, game.booed ? 'Booed off 🍅' : `${Math.round(game.accuracy() * 100)}% · best combo ${game.bestCombo}`, CX, 222, 15, 'rgba(255,255,255,.8)');
    label(g, num(game.score), CX, 262, 34, '#ffd23f');
    if (game.bonus) label(g, `incl. clear bonus +${game.bonus}`, CX, 290, 12, 'rgba(255,255,255,.6)');
    const rows: [string, number, string][] = [
      ['Perfect', game.counts.perfect, '#ffd23f'],
      ['Great', game.counts.great, '#7bd88f'],
      ['Good', game.counts.good, '#36c5f0'],
      ['Miss', game.counts.miss, '#ff6a6a'],
    ];
    rows.forEach(([n, v, c], i) => {
      const x = 52 + i * 85;
      label(g, `${v}`, x, 322, 20, c);
      label(g, n, x, 344, 11, 'rgba(255,255,255,.7)');
    });
    const bias = game.timingBias();
    const timing = bias === null ? '' : Math.abs(bias) < 12 ? 'Timing: right on the beat' : `Timing: ${Math.abs(bias)} ms ${bias > 0 ? 'late' : 'early'} on average`;
    if (timing) label(g, timing, CX, 382, 13, '#fff');
    if (nudged) label(g, `🎧 Sync nudged to ${saved.offset > 0 ? '+' : ''}${saved.offset} ms`, CX, 404, 13, '#36c5f0');
    if (age > 0.9) label(g, 'tap to continue', CX, 446, 14, `rgba(255,255,255,${REDUCED ? 0.8 : 0.5 + 0.3 * Math.sin(now / 250)})`);
    if (age > 6) finish();
  };

  // ---------------------------------------------------------- loop
  const loop = () => {
    if (stopped) return;
    const now = performance.now();
    const dt = fx.begin(g);
    for (let l = 0; l < BEAT_LANES; l++) press[l] = Math.max(0, press[l] - dt * 5);
    kick = Math.max(0, kick - dt * 6);
    if (phase === 'menu') {
      drawMenu(now);
      hud('🎵 Pick a track');
    } else if (phase === 'calib') {
      drawCalib(now);
      hud('🎵 Tap test');
    } else {
      if (clock && phase === 'play') {
        clock.sync(now);
        songT = clock.song(now);
        // Audio blocked or suspended (the clock isn't moving)? Play on to the lights.
        if (audioCheck && clock.ctx) {
          if (clock.ctx.currentTime > audioCheck.ctx + 0.05) audioCheck = null;
          else if (now - audioCheck.perf > 500) {
            audioCheck = null;
            goSilent();
            fx.pop(CX, 150, '🔇 no sound: play to the lights', '#fff', 15);
          }
        }
        if (game) {
          game.update(songT - saved.offset / 1000);
          for (const ev of game.events) react(ev);
          game.events.length = 0;
        }
        // Lights-only kick when there's no sound.
        if (silent) {
          const beat = beatBar(track) / 4;
          const ph = ((songT % beat) + beat) % beat;
          if (ph < 0.03) kick = 1;
        }
      }
      const t = phase === 'paused' ? pausedAt : songT;
      g.drawImage(city, 0, 0);
      drawLights(now);
      drawCrowd(now);
      drawHighway(t, now);
      drawHudTop(t);
      // Count-in.
      if (phase === 'play' && t < 0) {
        const beat = beatBar(track) / 4;
        const left = Math.ceil(-t / beat);
        if (left <= 4) label(g, left === 1 ? 'GO!' : `${left - 1}`, CX, 230, 52, left === 1 ? '#7bd88f' : '#fff');
        else label(g, `${track.emoji} ${track.name}`, CX, 230, 24, '#fff');
      }
      if (phase === 'paused') {
        g.fillStyle = 'rgba(8,4,24,.7)';
        g.fillRect(0, 0, W, H);
        label(g, 'PAUSED', CX, 200, 36, '#fff');
        label(g, 'tap to jump back in', CX, 240, 16, 'rgba(255,255,255,.8)');
      }
      if (phase === 'results') drawResults(now);
      if (game) hud(`🎵 ${num(game.score)}${game.combo >= 5 ? ` · ${game.combo} combo` : ''}${game.hyped ? ' · 🔥×2' : ''}`);
    }
    fx.end(g);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    stopped = true;
    fin.cancel();
    cancelAnimationFrame(raf);
    window.clearInterval(schedTimer);
    if (rig) releaseRig(rig);
    rig = null;
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointerup', onUp);
    cv.removeEventListener('pointercancel', onUp);
    document.removeEventListener('visibilitychange', onVis);
    offK();
  };
};
