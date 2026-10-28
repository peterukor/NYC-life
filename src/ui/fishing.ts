// =====================================================================
// fishing.ts (ui) — 🎣 Pier 84 on the Hudson, rebuilt (Peter,
// 2026-10-28: "can you fix fishing… please?"). Rules: sim/fishing.ts.
//
// One canvas, touch first (Space works too):
//   CAST   Hold anywhere: the rod winds back and the power meter climbs.
//          Let go to cast (or flick up). Gold on the meter = PERFECT CAST
//          (full reach: deeper water, bigger and rarer fish). Hold too
//          long and the meter falls back.
//   WAIT   The bobber twitches on a nibble (don't!). When it DIPS under
//          with a splash and a ❗, tap. Fast = PERFECT HOOK (tired fish).
//   FIGHT  Hold to reel, let go to give line. The gauge at the bottom is
//          the line tension: keep it in the green. When the fish runs
//          (the shadow flashes and the line twangs just before), let go,
//          or the line SNAPS. Slack too long and it spits the hook.
//          Every species pulls its own way; big ones pull harder.
//   LAND   It flies up onto the pier: catch card (art, weight, records,
//          the fish guy's price), and the 📖 journal fills up.
// The scene follows the game clock: the sun sets behind the Palisades,
// the Jersey side lights up at night, gulls, a tug pushing a barge,
// the Intrepid next door. Sal (since 1971) has opinions.
//
// Entry points (game.ts): goFishing(host), openDerby(host).
// =====================================================================

import './fishing.css';
import { clockLabel, nycTime } from '../core/clock.ts';
import { esc, money } from '../core/format.ts';
import {
  BITE_WINDOW, CAST_SWEET, DERBY_PRIZES, FISH, PERFECT_HOOK, TENSION, bitePlan, castReach, derbyBoard, derbyOpen, derbyPlace, fightPlan, fishingOf,
  inRun, journalCount, landCatch, newReel, perfectCast, perfectCatch, pullAt, reelStep, rollBite, runSoon,
  type BitePlan, type CatchResult, type FightPlan, type FishDef, type Reel,
} from '../sim/fishing.ts';
import type { GameState } from '../sim/types.ts';
import { burst as hiss, sfx } from './audio.ts';
import { emoji, H, W } from './arcade-games.ts';
import { clamp, keys, label, lerp, pointers, prerender } from './arcade/kit.ts';
import { rain } from './casino.ts';
import { openModal, openSheet } from './dom.ts';
import { Fx, buzz } from './juice.ts';

export interface FishHost {
  state: GameState;
  saved: () => void;
  onCatch?: (lb: number) => void;
}

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// ------------------------------------------------------------ layout
const HZ = 168; // the horizon (foot of the Palisades)
const RAIL = H - 62; // top rail of the pier
const BUTT = { x: W - 26, y: H + 16 };
const ROD_LEN = 250;
const ROD_A0 = Math.atan2(-232, -96); // resting: up and to the left
const GAUGE = { x: 16, y: H - 30, w: W - 112, h: 14 };
/** Depth 0 (the far shore) … 1 (under the rail) → screen y and scale. */
const depthY = (z: number) => HZ + 6 + (RAIL - 22 - HZ - 6) * z;
const depthS = (z: number) => 0.42 + z * 0.78;
const zOfReach = (reach: number) => 0.84 - reach * 0.72;

// ------------------------------------------------------------ colours
type RGB = [number, number, number];
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: RGB, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
/** The sky over Jersey by the hour: [hour, top, bottom]. Pier 84 faces west, so sunsets are the show. */
const SKY = ([
  [0, '#070b22', '#1a2148'],
  [5, '#0d1433', '#2b2d5c'],
  [6.3, '#3a4f8f', '#e9a58c'],
  [7.6, '#6aa5df', '#f3d6b8'],
  [10, '#4f97dd', '#bfe0f5'],
  [15.5, '#4c92d8', '#cde5f2'],
  [17.4, '#5a7fc0', '#ffd59a'],
  [18.4, '#43407f', '#ff8a4c'],
  [19.2, '#24204f', '#c6506e'],
  [20.2, '#0d1233', '#3b2f63'],
  [24, '#070b22', '#1a2148'],
] as [number, string, string][]).map(([h, a, b]) => [h, hex(a), hex(b)] as const);
function skyAt(h: number): { top: RGB; bot: RGB } {
  let i = 0;
  while (i < SKY.length - 2 && h >= SKY[i + 1][0]) i++;
  const [h0, a0, b0] = SKY[i], [h1, a1, b1] = SKY[i + 1];
  const t = clamp((h - h0) / (h1 - h0), 0, 1);
  return { top: mix(a0, a1, t), bot: mix(b0, b1, t) };
}
/** 0 by day … 1 at night. */
const nightAt = (h: number) => (h < 5 ? 1 : h < 6.6 ? 1 - (h - 5) / 1.6 : h < 19 ? 0 : h < 20.4 ? (h - 19) / 1.4 : 1);
const DARK: RGB = hex('#121829');
const DEEP: RGB = hex('#0b2233');

// ------------------------------------------------------------ fish art
/** Draw a species facing left (the catch card, the journal, the leap out of the water). */
export function drawFish(g: CanvasRenderingContext2D, f: FishDef, x: number, y: number, len: number, opts: { sil?: string; flip?: boolean; wiggle?: number } = {}): void {
  const a = f.art;
  const sil = opts.sil;
  if (a.shape === 'emoji') {
    if (sil) {
      // Only on its own little canvas (the journal): paint over the emoji's pixels.
      g.save();
      emoji(g, f.emoji, x, y, len * 0.62);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = sil;
      g.fillRect(x - len, y - len, len * 2, len * 2);
      g.restore();
      return;
    }
    emoji(g, f.emoji, x, y, len * 0.62);
    return;
  }
  const h = len * (a.h ?? 0.4);
  g.save();
  g.translate(x, y);
  if (opts.flip) g.scale(-1, 1);
  const body = (top: string, bot: string) => {
    if (sil) return sil;
    const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
    gr.addColorStop(0, top);
    gr.addColorStop(0.55, lerpHex(top, bot, 0.6));
    gr.addColorStop(1, bot);
    return gr;
  };
  const fin = sil ?? a.fin;
  const L = len / 2;
  if (a.shape === 'eel') {
    const w = opts.wiggle ?? 0;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 24; i++) pts.push([-L + (len * i) / 24, Math.sin(i * 0.5 + w) * h * 1.6 * (0.3 + i / 30)]);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [col, wd, dy] of [[sil ?? a.top, h * 1.15, 0], [sil ?? a.belly, h * 0.45, h * 0.28]] as [string, number, number][]) {
      g.strokeStyle = col;
      g.beginPath();
      pts.forEach(([px, py], i) => {
        const taper = 1 - (i / 24) * 0.55;
        g.lineWidth = wd * taper;
        if (i === 0) g.moveTo(px, py + dy);
        else g.lineTo(px, py + dy);
      });
      g.stroke();
    }
    if (!sil) eye(g, -L + h * 0.5, pts[0][1] - h * 0.15, h * 0.2);
    g.restore();
    return;
  }
  if (a.shape === 'flat') {
    // Fluke: a flat oval with a frilly fin all round, both eyes on top.
    g.fillStyle = fin;
    g.beginPath();
    g.ellipse(-len * 0.04, 0, L * 0.86, h * 0.56, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(L * 0.7, 0);
    g.lineTo(L, -h * 0.32);
    g.lineTo(L * 0.96, 0);
    g.lineTo(L, h * 0.32);
    g.closePath();
    g.fill();
    g.fillStyle = body(a.top, a.belly);
    g.beginPath();
    g.ellipse(-len * 0.04, 0, L * 0.74, h * 0.44, 0, 0, Math.PI * 2);
    g.fill();
    if (!sil) {
      g.fillStyle = 'rgba(40,24,10,.45)';
      for (const [sx, sy, r] of [[-0.1, -0.15, 0.09], [0.2, 0.12, 0.08], [0.32, -0.12, 0.07], [-0.05, 0.2, 0.06], [0.08, -0.02, 0.05]]) {
        g.beginPath();
        g.arc(sx * len, sy * h * 2, r * h, 0, Math.PI * 2);
        g.fill();
      }
      eye(g, -L * 0.62, -h * 0.16, h * 0.08);
      eye(g, -L * 0.5, -h * 0.28, h * 0.08);
    }
    g.restore();
    return;
  }
  const shark = a.shape === 'shark', sturg = a.shape === 'sturgeon';
  // Tail.
  g.fillStyle = fin;
  g.beginPath();
  g.moveTo(L * 0.62, 0);
  if (shark || sturg) {
    g.lineTo(L * 1.02, -h * 0.85);
    g.lineTo(L * 0.92, -h * 0.1);
    g.lineTo(L * 0.96, h * 0.35);
  } else {
    g.lineTo(L * 1.02, -h * 0.62);
    g.quadraticCurveTo(L * 0.86, 0, L * 1.02, h * 0.62);
  }
  g.closePath();
  g.fill();
  // Dorsal and belly fins.
  g.beginPath();
  if (shark) {
    g.moveTo(-L * 0.12, -h * 0.4);
    g.lineTo(L * 0.02, -h * 1.05);
    g.lineTo(L * 0.18, -h * 0.36);
  } else if (sturg) {
    g.moveTo(L * 0.38, -h * 0.3);
    g.lineTo(L * 0.5, -h * 0.62);
    g.lineTo(L * 0.56, -h * 0.22);
  } else {
    g.moveTo(-L * 0.28, -h * 0.4);
    g.lineTo(-L * 0.16, -h * 0.78);
    g.lineTo(L * 0.12, -h * 0.7);
    g.lineTo(L * 0.34, -h * 0.3);
  }
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(-L * 0.2, h * 0.38);
  g.lineTo(-L * 0.06, h * 0.7);
  g.lineTo(L * 0.04, h * 0.38);
  g.moveTo(L * 0.2, h * 0.34);
  g.lineTo(L * 0.34, h * 0.56);
  g.lineTo(L * 0.42, h * 0.28);
  g.fill();
  // Body.
  g.fillStyle = body(a.top, a.belly);
  g.beginPath();
  const nose = shark || sturg ? -L * 1.02 : -L;
  g.moveTo(nose, sturg ? h * 0.05 : 0);
  g.bezierCurveTo(-L * 0.6, -h * 0.72, L * 0.25, -h * 0.62, L * 0.66, -h * 0.12);
  g.lineTo(L * 0.66, h * 0.12);
  g.bezierCurveTo(L * 0.25, h * 0.6, -L * 0.6, h * 0.66, nose, sturg ? h * 0.05 : 0);
  g.fill();
  if (!sil) {
    g.save();
    g.clip();
    if (a.stripes) {
      g.strokeStyle = 'rgba(25,30,40,.55)';
      g.lineWidth = Math.max(1, h * 0.045);
      for (let i = 0; i < a.stripes; i++) {
        const sy = -h * 0.36 + (i * h * 0.62) / a.stripes;
        g.beginPath();
        g.moveTo(-L * 0.55, sy);
        g.quadraticCurveTo(0, sy - h * 0.06, L * 0.66, sy * 0.4);
        g.stroke();
      }
    }
    if (a.bars) {
      g.fillStyle = 'rgba(40,50,30,.18)';
      for (let i = 0; i < a.bars; i++) g.fillRect(-L * 0.4 + (i * L) / a.bars, -h, L * 0.08, h * 1.1);
    }
    if (a.spots) {
      g.fillStyle = shark ? 'rgba(90,60,30,.55)' : 'rgba(40,24,10,.45)';
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(-L * 0.3 + ((i * 37) % 70) / 100 * L, -h * 0.25 + ((i * 53) % 40) / 100 * h, h * 0.05, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (sturg) {
      g.fillStyle = 'rgba(235,228,205,.85)';
      for (let i = 0; i < 9; i++) {
        const sx = -L * 0.6 + i * L * 0.15;
        for (const sy of [-h * 0.3, h * 0.08]) {
          g.beginPath();
          g.moveTo(sx, sy - h * 0.07);
          g.lineTo(sx + h * 0.08, sy);
          g.lineTo(sx, sy + h * 0.07);
          g.lineTo(sx - h * 0.08, sy);
          g.fill();
        }
      }
    }
    // A sheen along the back.
    g.strokeStyle = 'rgba(255,255,255,.28)';
    g.lineWidth = Math.max(1, h * 0.06);
    g.beginPath();
    g.moveTo(-L * 0.6, -h * 0.2);
    g.quadraticCurveTo(0, -h * 0.5, L * 0.5, -h * 0.16);
    g.stroke();
    g.restore();
    // Gills, eye, mouth.
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.lineWidth = Math.max(1, h * 0.035);
    if (shark) for (let i = 0; i < 4; i++) (g.beginPath(), g.moveTo(-L * 0.52 + i * h * 0.1, -h * 0.12), g.lineTo(-L * 0.54 + i * h * 0.1, h * 0.14), g.stroke());
    else {
      g.beginPath();
      g.arc(-L * 0.46, 0, h * 0.34, -0.9, 0.9);
      g.stroke();
    }
    eye(g, -L * 0.74, -h * 0.1, Math.max(1.5, h * (sturg ? 0.06 : 0.1)));
    if (sturg) {
      g.beginPath();
      g.moveTo(-L * 0.86, h * 0.14);
      g.lineTo(-L * 0.88, h * 0.32);
      g.moveTo(-L * 0.8, h * 0.16);
      g.lineTo(-L * 0.81, h * 0.34);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(nose + h * 0.05, h * 0.06);
      g.lineTo(nose + h * 0.26, h * 0.1);
      g.stroke();
    }
  }
  g.restore();
}
function eye(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(x - r * 0.15, y, r * 0.6, 0, Math.PI * 2);
  g.fill();
}
function lerpHex(a: string, b: string, t: number): string {
  return css(mix(hex(a), hex(b), t));
}

/** A small canvas with a species on it (catch card, journal). */
function artCanvas(f: FishDef, w: number, h: number, sil?: string): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = w * dpr;
  c.height = h * dpr;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.setAttribute('aria-hidden', 'true');
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const len = f.art.shape === 'eel' ? w * 0.86 : f.art.shape === 'emoji' ? Math.min(w, h * 1.6) : Math.min(w * 0.82, (h * 0.8) / (f.art.h ?? 0.4) / (f.art.shape === 'flat' ? 1.15 : 1.25));
  drawFish(g, f, w / 2, h / 2, len, { sil, wiggle: 0.8 });
  return c;
}

// ------------------------------------------------------------ Sal
const SAL = {
  ready: ['Hold, then let go. Aim for the gold.', 'Long cast, bigger fish. That’s the whole secret.', 'Hold to wind up. Let go to cast. Flick if you’re fancy.'],
  wait: ['Easy. Watch the bobber.', 'Patience. The river’s busy.', 'Don’t blink.'],
  nibble: ['Just a nibble. Not yet.', 'Tasting it. Wait for the dip.', 'Not yet…'],
  bite: ['NOW!', 'It’s under! Tap!'],
  early: ['Too early. You pulled it right out of its mouth.', 'That was a nibble. It’s gone now.'],
  late: ['Too slow. It took the bait and left. Rude.', 'Free lunch for that one.'],
  hooked: ['Hold to reel. Keep it in the green.', 'Got it! Hold to reel.'],
  big: ['That’s a big one. When it runs, let it run.', 'Oh, that’s heavy. Don’t horse it.'],
  run: ['Let it run!', 'Let go, let go!', 'Give it line!'],
  slack: ['Line’s slack. Reel!', 'Keep some tension on it!'],
  snap: ['Snapped. Something out there is laughing at you.', 'Line’s gone. Happens to everybody. Mostly you.'],
  spit: ['Too much slack. It spat the hook.', 'It got loose. Keep the line tight next time.'],
  fish: ['Nice fish.', 'Not bad, kid.', 'Now that’s fishing.', 'I’ve seen worse. From me.'],
  big2: ['Now THAT is a fish.', 'Fifty-five years on this pier. Nice one.'],
  junk: ['Hey, it counts. Kind of.', 'The Hudson gives back. Not what you wanted, but it gives.'],
  legend: ['I need to sit down.', 'Nobody’s gonna believe this. Good thing I took a picture.'],
};

// ============================================================ the game
type Phase = 'menu' | 'ready' | 'charge' | 'flight' | 'wait' | 'bite' | 'fight' | 'landing' | 'lost';

interface Ripple {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  s: number;
}

export function goFishing(host: FishHost): void {
  const s = host.state;
  const m = openModal(`<div class="pf">
    <div class="pf-top"><b><span aria-hidden="true">🎣</span> Pier 84</b><span class="pf-hud" aria-live="off"></span></div>
    <div class="pf-screen"><canvas aria-label="Fishing off Pier 84 on the Hudson. Hold to cast, tap when the bobber dips, hold to reel."></canvas>
      <div class="pf-over" hidden></div>
    </div>
    <div class="pf-coach" aria-live="polite"><span aria-hidden="true">🧓</span><em></em></div>
    <div class="pf-btns"><button class="btn ghost" data-journal>📖 Journal</button><button class="btn ghost" data-derby>🏆 Derby</button><button class="btn ghost" data-close>Done</button></div>
  </div>`);
  m.el.classList.add('pf-modal');
  const cv = m.el.querySelector('canvas')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr;
  cv.height = H * dpr;
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const over = m.el.querySelector<HTMLElement>('.pf-over')!;
  const hudEl = m.el.querySelector<HTMLElement>('.pf-hud')!;
  const coachEl = m.el.querySelector<HTMLElement>('.pf-coach em')!;
  const coachBox = m.el.querySelector<HTMLElement>('.pf-coach')!;
  const fx = new Fx(W, H);

  // ---------------------------------------------------------- state
  let phase: Phase = 'menu';
  let closed = false, raf = 0, timers: number[] = [];
  let t = 0; // seconds since open
  let hour = nycTime().hourFloat, hourAt = 0;
  let bucket = 0, streak = 0;
  // Cast.
  let power = 0, chargeT = 0, reach = 0.5, flightT = 0, flightDur = 0.8;
  const bob = { x: W * 0.5, y: 0, z: 0.5, sink: 0, twitch: 0 };
  let castFrom = { x: 0, y: 0 }, castTo = { x: 0, y: 0, z: 0 };
  // Rod spring (radians; + = wound back over your shoulder).
  let rodRot = 0, rodV = 0, rodTarget = 0, reelA = 0;
  // Wait / bite.
  let plan: BitePlan = bitePlan();
  let waitT = 0, nib = 0, biteT = 0, lastNibble = -9;
  // Fight.
  let fish: FishDef | null = null, lb = 0, fight: FightPlan | null = null, reel: Reel | null = null, holding = false;
  let fx0 = W / 2, fvx = 0, wasRun = false, wasSoon = false, slackSaid = 0, tickT = 0, zingT = 0, perfectHookNow = false;
  // Landing leap.
  let leapT = 0, leapFrom = { x: 0, y: 0 };
  const ripples: Ripple[] = [];

  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !closed && fn(), ms));
  let lastCoach = '';
  const coach = (line: string | string[]) => {
    const text = Array.isArray(line) ? pick(line) : line;
    if (text === lastCoach && coachEl.textContent === text) return;
    lastCoach = text;
    coachEl.textContent = text;
    coachBox.classList.remove('talk');
    void coachBox.offsetWidth;
    coachBox.classList.add('talk');
  };
  const setHud = () => {
    const place = derbyOpen() ? derbyPlace(s) : 0;
    const txt = `🪣 ${bucket}${streak >= 2 ? ` · 🔥 ${streak}` : ''} · ${derbyOpen() ? `🏆 ${place ? ordinal(place) : 'on till 11'}` : clockLabel(nycTime())}`;
    if (hudEl.textContent !== txt) hudEl.textContent = txt;
  };
  const ripple = (x: number, y: number, sc: number, big = false) => {
    ripples.push({ x, y, r: big ? 6 : 3, grow: big ? 60 : 30, life: big ? 1.2 : 0.8, max: big ? 1.2 : 0.8, s: sc });
    if (ripples.length > 24) ripples.shift();
  };
  const splashSound = (big: boolean) => hiss(0, big ? 0.45 : 0.22, { type: 'lowpass', freq: big ? 1600 : 2400, sweepTo: 300, gain: big ? 0.22 : 0.1, attack: 0.01 });

  // ---------------------------------------------------------- scenery (prerendered)
  const STARS = prerender(W, HZ, (c) => {
    c.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) {
      const x = (i * 97.3) % W, y = (i * 53.7) % (HZ - 30);
      c.globalAlpha = 0.35 + ((i * 7) % 10) / 15;
      c.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
  });
  /** The Jersey side: Palisades cliffs with Weehawken on top, Hoboken and the Jersey City towers to the south (left). */
  let skyline: HTMLCanvasElement | null = null, skylineKey = '';
  const buildSkyline = (bot: RGB, night: number) => {
    const key = `${Math.round(night * 6)}|${bot.map((v) => Math.round(v / 12)).join(',')}`;
    if (key === skylineKey && skyline) return skyline;
    skylineKey = key;
    const haze = mix(bot, DARK, 0.42 + night * 0.4);
    const near = mix(bot, DARK, 0.62 + night * 0.3);
    const cliff = mix(mix(bot, hex('#4a3b33'), 0.5), DARK, 0.55 + night * 0.35);
    skyline = prerender(W, 110, (c) => {
      let seed = 84;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const base = 110;
      const lights: [number, number, number, number][] = [];
      // Far left: Jersey City's towers, hazy.
      c.fillStyle = css(haze);
      for (const [x, w, h] of [[4, 12, 62], [18, 9, 48], [30, 14, 78], [46, 10, 56], [58, 12, 40], [72, 8, 34]]) {
        c.fillRect(x, base - h, w, h);
        lights.push([x, base - h, w, h]);
      }
      // Hoboken: low and dense.
      c.fillStyle = css(near);
      for (let x = 0; x < 120; ) {
        const w = 8 + rnd() * 12, h = 10 + rnd() * 16;
        c.fillRect(x, base - h, w, h);
        lights.push([x, base - h, w, h]);
        x += w + 1;
      }
      // The Palisades: a cliff band rising to the right.
      c.fillStyle = css(cliff);
      c.beginPath();
      c.moveTo(96, base);
      c.lineTo(126, base - 22);
      for (let x = 126; x <= W; x += 12) c.lineTo(x, base - 24 - Math.sin(x * 0.07) * 2 - (x - 126) * 0.02 - rnd() * 2);
      c.lineTo(W, base);
      c.closePath();
      c.fill();
      // The rock face: vertical seams, a lit ridge.
      c.fillStyle = css(mix(cliff, DARK, 0.35));
      for (let x = 132; x < W; x += 5 + rnd() * 7) c.fillRect(x, base - 20 + rnd() * 6, 1.2, 14 + rnd() * 6);
      c.fillStyle = css(mix(cliff, bot, 0.35));
      for (let x = 126; x < W; x += 12) c.fillRect(x, base - 24 - Math.sin(x * 0.07) * 2 - (x - 126) * 0.02, 12, 1.5);
      // Weehawken on top, and three round towers up the cliff (Galaxy Towers).
      c.fillStyle = css(near);
      for (let x = 128; x < W; ) {
        const w = 6 + rnd() * 10, h = 4 + rnd() * 9;
        const top = base - 26 - (x - 126) * 0.02;
        c.fillRect(x, top - h, w, h + 2);
        lights.push([x, top - h, w, h]);
        x += w + 2 + rnd() * 4;
      }
      for (const x of [262, 280, 298]) {
        const top = base - 30 - (x - 126) * 0.02;
        c.beginPath();
        c.roundRect(x, top - 34, 14, 36, 5);
        c.fill();
        lights.push([x + 2, top - 32, 10, 30]);
      }
      // A water's-edge strip of low docks.
      c.fillStyle = css(mix(near, DARK, 0.4));
      c.fillRect(0, base - 3, W, 3);
      if (night > 0.25) {
        c.fillStyle = `rgba(255,214,120,${0.35 + night * 0.5})`;
        for (const [x, y, w, h] of lights) for (let wy = y + 3; wy < y + h - 2; wy += 4) for (let wx = x + 2; wx < x + w - 1; wx += 3) if (rnd() < 0.3) c.fillRect(wx, wy, 1.2, 1.6);
      }
    });
    return skyline;
  };
  /** The Intrepid at Pier 86, next door (right edge). */
  const INTREPID = prerender(120, 60, (c) => {
    c.fillStyle = '#5c6670';
    c.beginPath();
    c.moveTo(0, 30);
    c.lineTo(120, 26);
    c.lineTo(120, 52);
    c.lineTo(14, 52);
    c.closePath();
    c.fill();
    c.fillStyle = '#4a535c';
    c.fillRect(0, 24, 120, 6); // the flight deck
    c.fillStyle = '#6d7780';
    c.fillRect(48, 6, 14, 18); // the island
    c.fillRect(52, 0, 4, 8);
    c.fillStyle = '#3b434b';
    c.fillRect(48, 12, 14, 2);
    // A jet on deck.
    c.fillStyle = '#7b858e';
    c.beginPath();
    c.moveTo(14, 22);
    c.lineTo(36, 20);
    c.lineTo(30, 16);
    c.lineTo(26, 20);
    c.closePath();
    c.fill();
    c.fillStyle = '#2b3138';
    c.fillRect(14, 40, 106, 2);
  });
  /** The pier rail and deck (foreground). */
  const RAILART = prerender(W, H - RAIL + 6, (c) => {
    const h = H - RAIL + 6;
    // Deck.
    c.fillStyle = '#6b4f37';
    c.fillRect(0, 34, W, h - 34);
    c.fillStyle = '#5a412d';
    for (let x = 0; x < W; x += 22) c.fillRect(x, 34, 2, h - 34);
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillRect(0, 34, W, 4);
    // Posts.
    for (const x of [8, 120, 232, 344]) {
      c.fillStyle = '#2d3b39';
      c.fillRect(x, 2, 8, h);
      c.fillStyle = '#466058';
      c.fillRect(x + 1, 2, 2, h);
    }
    // Rails: a thick top pipe and a thin middle one.
    for (const [y, th] of [[3, 7], [22, 4]]) {
      c.fillStyle = '#2d3b39';
      c.fillRect(0, y, W, th);
      c.fillStyle = '#6f8c83';
      c.fillRect(0, y, W, 2);
    }
  });

  // ---------------------------------------------------------- living things
  const gulls = [0, 1, 2].map((i) => ({ x: Math.random() * W, y: 40 + i * 30 + Math.random() * 20, vx: (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 14), ph: Math.random() * 6, s: 0.7 + Math.random() * 0.5, glide: 0 }));
  const tug = { x: -200, dir: 1, barge: true, next: 3 };
  const puffs: { x: number; y: number; r: number; life: number }[] = [];
  const WAVES = Array.from({ length: 90 }, (_, i) => ({ x: Math.random() * W, z: (i / 90) ** 0.8, len: 4 + Math.random() * 10, sp: 3 + Math.random() * 6, light: Math.random() < 0.5 }));

  // ---------------------------------------------------------- rod geometry
  const rodTip = () => {
    const bend = reel ? Math.min(1, reel.tension) : 0;
    const a = ROD_A0 + rodRot + bend * 0.22;
    return { x: BUTT.x + Math.cos(a) * ROD_LEN, y: BUTT.y + Math.sin(a) * ROD_LEN + bend * 10 };
  };

  // ---------------------------------------------------------- phases
  const toReady = () => {
    phase = 'ready';
    fish = null;
    fight = null;
    reel = null;
    holding = false;
    power = 0;
    rodTarget = 0;
    bob.sink = 0;
    coach(SAL.ready);
    setHud();
  };
  const startCharge = () => {
    phase = 'charge';
    chargeT = 0;
    power = 0;
    sfx.tick();
  };
  const cast = (pw: number) => {
    power = clamp(pw, 0, 1);
    reach = castReach(power);
    rodTarget = 0;
    rodV = -9 - power * 8; // whip forward
    const z = zOfReach(reach);
    const tip = rodTip();
    castFrom = { x: tip.x, y: tip.y };
    castTo = { x: W * 0.5 + (Math.random() - 0.5) * 120 * (1 - z * 0.4), y: depthY(z), z };
    flightT = 0;
    flightDur = 0.55 + reach * 0.45;
    phase = 'flight';
    sfx.whoosh();
    if (perfectCast(power)) {
      fx.stamp('PERFECT CAST!', '#ffd23f', 0.8);
      sfx.chime();
    } else if (power > CAST_SWEET[1]) coach('Too much! You wound it past the gold.');
  };
  const landBobber = () => {
    bob.x = castTo.x;
    bob.y = castTo.y;
    bob.z = castTo.z;
    const sc = depthS(bob.z);
    ripple(bob.x, bob.y, sc, true);
    fx.burst(bob.x, bob.y, { colors: ['#ffffff', '#cfe8ff'], n: 8, size: 3 * sc, speed: 90 * sc, up: true, life: 0.45 });
    splashSound(false);
    phase = 'wait';
    plan = bitePlan();
    waitT = 0;
    nib = 0;
    coach(SAL.wait);
  };
  const lose = (why: 'early' | 'late' | 'snap' | 'spit') => {
    phase = 'lost';

    holding = false;
    if (streak >= 2) fx.pop(W / 2, 120, 'streak lost', '#c9ced6', 16);
    streak = 0;
    if (why === 'snap') {
      fx.stamp('SNAP!', '#ff5d5d', 1);
      fx.flash('#ff3b3b', 0.25);
      fx.shake(12, 0.35);
      rodV = 8; // the rod springs back up
      sfx.bad();
      buzz([40, 30, 40]);
    } else if (why === 'spit') {
      fx.stamp('IT GOT AWAY', '#c9ced6', 0.9);
      ripple(fx0, depthY(reelZ()), depthS(reelZ()), true);
      sfx.bad();
    } else if (why === 'late') {
      fx.pop(bob.x, bob.y - 30, 'too slow', '#ffd23f', 18);
      sfx.bad();
    } else {
      fx.pop(bob.x, bob.y - 30, 'spooked', '#ffd23f', 18);
      ripple(bob.x, bob.y, depthS(bob.z));
      sfx.bad();
    }
    coach(SAL[why]);
    fish = null;
    reel = null;
    fight = null;
    setHud();
    later(1300, () => phase === 'lost' && toReady());
  };
  const reelZ = () => (reel ? lerp(0.98, castTo.z, clamp(reel.dist, 0, 1)) : bob.z);
  const hook = () => {
    const react = biteT;
    perfectHookNow = react < PERFECT_HOOK;
    const r = rollBite(Math.random, reach);
    fish = r.fish;
    lb = r.lb;
    fight = fightPlan(fish, lb);
    reel = newReel(perfectHookNow);
    holding = true;
    fx0 = bob.x;
    fvx = 0;
    wasRun = wasSoon = false;
    slackSaid = 0;
    phase = 'fight';
    fx.stop(0.07);
    fx.shake(7, 0.2);
    fx.stamp(perfectHookNow ? 'PERFECT HOOK!' : 'HOOKED!', perfectHookNow ? '#7bd88f' : '#ffd23f', 0.75);
    fx.burst(bob.x, bob.y, { colors: ['#ffffff', '#bfe3ff'], n: 12, size: 3, speed: 150, up: true, life: 0.5 });
    splashSound(true);
    sfx.punch();
    buzz(30);
    coach(fish.fight >= 4 || lb >= 15 ? SAL.big : SAL.hooked);
  };
  const startLanding = () => {
    phase = 'landing';
    leapT = 0;
    leapFrom = { x: fx0, y: depthY(reelZ()) };
    holding = false;
    fx.burst(leapFrom.x, leapFrom.y, { colors: ['#ffffff', '#cfe8ff'], n: 18, size: 4, speed: 200, up: true, life: 0.6 });
    ripple(leapFrom.x, leapFrom.y, 1, true);
    splashSound(true);
    sfx.whoosh();
  };
  const finishLanding = () => {
    if (!fish || !reel) return toReady();
    const f = fish;
    const perfect = perfectCatch(reel);
    if (f.kind !== 'junk') streak++;
    const r = landCatch(s, f, lb, { perfect, streak: f.kind === 'junk' ? 0 : streak });
    bucket++;
    host.saved();
    host.onCatch?.(lb);
    const big = f.fight >= 4 || lb >= 15;
    if (f.kind === 'release') {
      sfx.jackpot();
      rain(m.el, f.emoji, 16);
      coach(SAL.legend);
    } else if (f.kind === 'junk') {
      sfx.tap();
      coach(SAL.junk);
    } else {
      big ? sfx.cheer() : sfx.win();
      if (r.cents) later(250, () => sfx.cash());
      coach(big ? SAL.big2 : SAL.fish);
    }
    if (r.newSpecies) later(400, () => sfx.chime());
    if (r.newBest) rain(m.el, '🏆', 12);
    fx.flash('#ffffff', 0.15);
    setHud();
    showCard(r, perfect);
  };

  // ---------------------------------------------------------- input
  const down = () => {
    if (phase === 'ready') startCharge();
    else if (phase === 'wait') {
      const onNibble = bob.twitch > 0 || waitT - lastNibble < 0.5;
      lose('early');
      if (!onNibble) coach('Nothing on yet. Wait for the dip.');
    } else if (phase === 'bite') hook();
    else if (phase === 'fight') holding = true;
  };
  const up = (flickPower?: number) => {
    if (phase === 'charge') cast(flickPower ?? power);
    else if (phase === 'fight') holding = false;
  };
  const offP = pointers(cv, {
    down: () => {
      if (over.hidden) down();
    },
    up: (tc) => {
      const dy = tc.y0 - tc.y, ms = performance.now() - tc.t0;
      // A flick up: its speed is the power.
      const flick = phase === 'charge' && dy > 40 && ms < 360 ? clamp(0.2 + (dy / Math.max(60, ms)) * 0.5, 0, 1) : undefined;
      up(flick);
    },
  });
  const offK = keys(
    (k, e) => {
      if (k !== ' ' || !over.hidden) return;
      e.preventDefault();
      down();
    },
    (k) => k === ' ' && up(),
  );

  // ---------------------------------------------------------- update
  const update = (dt: number) => {
    t += dt;
    if (t - hourAt > 1) {
      hour = nycTime().hourFloat;
      hourAt = t;
      setHud();
    }
    // The rod: a damped spring toward its target.
    rodV += ((rodTarget - rodRot) * 160 - rodV * 14) * dt;
    rodRot += rodV * dt;
    // Gulls drift and flap; now and then one glides.
    for (const gl of gulls) {
      gl.x += gl.vx * dt;
      gl.y += Math.sin(t * 0.7 + gl.ph) * 4 * dt;
      if (gl.glide > 0) gl.glide -= dt;
      else if (Math.random() < dt * 0.15) gl.glide = 1.5 + Math.random() * 2;
      if (gl.x < -30) gl.x = W + 30;
      if (gl.x > W + 30) gl.x = -30;
    }
    // The tug and its barge, now and then.
    tug.next -= dt;
    if (tug.next <= 0 && (tug.x < -220 || tug.x > W + 220)) {
      tug.dir = Math.random() < 0.5 ? 1 : -1;
      tug.x = tug.dir > 0 ? -200 : W + 200;
      tug.barge = Math.random() < 0.6;
      tug.next = 40 + Math.random() * 30;
    }
    if (tug.x > -260 && tug.x < W + 260) {
      tug.x += tug.dir * 11 * dt;
      if (Math.random() < dt * 3) puffs.push({ x: tug.x + tug.dir * 2, y: HZ + 14, r: 2, life: 2.5 });
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life -= dt;
      p.r += dt * 3;
      p.y -= dt * 6;
      p.x -= dt * 4;
      if (p.life <= 0) puffs.splice(i, 1);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.life -= dt;
      r.r += r.grow * dt * (r.life / r.max + 0.3);
      if (r.life <= 0) ripples.splice(i, 1);
    }
    bob.twitch = Math.max(0, bob.twitch - dt);

    switch (phase) {
      case 'charge': {
        chargeT += dt;
        // Up over 1 s, then back down: hold too long and it drops.
        const c = (chargeT / 1.05) % 2;
        power = c < 1 ? c : 2 - c;
        rodTarget = power * 0.55;
        break;
      }
      case 'flight': {
        flightT += dt;
        const u = Math.min(1, flightT / flightDur);
        bob.x = lerp(castFrom.x, castTo.x, u);
        bob.y = lerp(castFrom.y, castTo.y, u) - Math.sin(u * Math.PI) * (70 + reach * 90);
        bob.z = lerp(1, castTo.z, u);
        if (u >= 1) landBobber();
        break;
      }
      case 'wait': {
        waitT += dt;
        if (nib < plan.nibbles.length && waitT >= plan.nibbles[nib]) {
          nib++;
          bob.twitch = 0.28;
          lastNibble = waitT;
          ripple(bob.x, bob.y, depthS(bob.z));
          sfx.tick();
          if (nib === 1 || Math.random() < 0.4) coach(SAL.nibble);
        }
        if (waitT >= plan.bite) {
          phase = 'bite';
          biteT = 0;
          bob.sink = 1;
          ripple(bob.x, bob.y, depthS(bob.z), true);
          fx.burst(bob.x, bob.y, { colors: ['#ffffff', '#cfe8ff'], n: 10, size: 3, speed: 110, up: true, life: 0.4 });
          fx.shake(4, 0.15);
          splashSound(true);
          sfx.notify();
          buzz(35);
          coach(SAL.bite);
        }
        break;
      }
      case 'bite':
        biteT += dt;
        if (biteT > BITE_WINDOW) lose('late');
        break;
      case 'fight': {
        if (!reel || !fight || !fish) break;
        reelStep(reel, fight, holding, dt);
        const running = inRun(fight, reel.t), soon = runSoon(fight, reel.t);
        const z = reelZ(), sc = depthS(z), fy = depthY(z);
        // The fish wanders; on a run it bolts sideways.
        if (running && !wasRun) {
          fvx = (fx0 < W / 2 ? 1 : -1) * (120 + fish.fight * 30) * (Math.random() < 0.25 ? -1 : 1);
          fx.burst(fx0, fy, { colors: ['#ffffff', '#cfe8ff'], n: 10 + fish.fight * 2, size: 3 * sc, speed: 140 * sc, up: true, life: 0.5 });
          ripple(fx0, fy, sc, true);
          splashSound(fish.fight >= 3);
          if (holding) coach(SAL.run);
          if (fish.fight >= 3) fx.shake(3 + fish.fight, 0.2);
        }
        if (soon && !wasSoon) {
          buzz(12);
          sfx.card();
        }
        wasRun = running;
        wasSoon = soon;
        fvx += (Math.sin(t * 1.3 + fight.phase) * 40 - fvx * (running ? 0.6 : 2.5)) * dt;
        fx0 = clamp(fx0 + fvx * dt, 40, W - 60);
        if (fx0 <= 40 || fx0 >= W - 60) fvx *= -0.5;
        bob.x = fx0 + Math.sin(t * 9) * 2 * pullAt(fight, reel.t, reel.stamina);
        bob.y = fy;
        bob.z = z;
        if (Math.random() < dt * (2 + fish.fight)) ripple(fx0, fy, sc * 0.7);
        // The reel: ratchet clicks while reeling, the drag zings when it takes line.
        if (holding) {
          reelA += dt * 14;
          tickT -= dt;
          if (tickT <= 0) {
            tickT = 0.11;
            sfx.tick();
          }
        } else {
          reelA -= dt * pullAt(fight, reel.t, reel.stamina) * 10;
          zingT -= dt;
          if (running && zingT <= 0) {
            zingT = 0.16;
            sfx.card();
          }
        }
        if (reel.slack > 1 && t - slackSaid > 2.5) {
          slackSaid = t;
          coach(SAL.slack);
        }
        if (reel.over > 0.05) buzz(8);
        if (reel.out === 'snap') lose('snap');
        else if (reel.out === 'spit') lose('spit');
        else if (reel.out === 'landed') startLanding();
        break;
      }
      case 'landing':
        leapT += dt;
        if (leapT >= 0.9) {
          phase = 'menu';
          finishLanding();
        }
        break;
      default:
        break;
    }
  };

  // ---------------------------------------------------------- draw
  const drawGull = (x: number, y: number, sc: number, flap: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = 1.6 * sc;
    g.lineCap = 'round';
    const wy = flap * 6 * sc;
    g.beginPath();
    g.moveTo(x - 9 * sc, y - wy);
    g.quadraticCurveTo(x - 4 * sc, y - 4 * sc - wy * 0.3, x, y);
    g.quadraticCurveTo(x + 4 * sc, y - 4 * sc - wy * 0.3, x + 9 * sc, y - wy);
    g.stroke();
  };
  const drawTug = (night: number) => {
    if (tug.x < -260 || tug.x > W + 260) return;
    const y = HZ + 22, d = tug.dir;
    g.save();
    g.translate(tug.x, y);
    g.scale(d * 0.62, 0.62);
    // Wake.
    g.fillStyle = 'rgba(255,255,255,.45)';
    for (let i = 1; i < 8; i++) g.fillRect(-34 - i * 14, 6 + (i % 2), 10 - i * 0.8, 1.5);
    if (tug.barge) {
      // Pushing a barge ahead of it.
      g.fillStyle = '#5b4a3c';
      g.fillRect(16, -6, 110, 12);
      g.fillStyle = '#3e332a';
      g.fillRect(16, 4, 110, 3);
      g.fillStyle = '#7a6a55';
      g.beginPath();
      g.moveTo(26, -6);
      g.lineTo(60, -18);
      g.lineTo(100, -18);
      g.lineTo(118, -6);
      g.fill();
    }
    g.fillStyle = '#1f2328';
    g.beginPath();
    g.moveTo(-34, -4);
    g.lineTo(16, -4);
    g.lineTo(12, 8);
    g.lineTo(-30, 8);
    g.closePath();
    g.fill();
    g.fillStyle = '#b8322c';
    g.fillRect(-34, -4, 50, 4);
    g.fillStyle = '#f2efe6';
    g.fillRect(-18, -18, 22, 14);
    g.fillRect(-12, -26, 14, 8);
    g.fillStyle = '#2a3440';
    g.fillRect(-14, -14, 4, 4);
    g.fillRect(-7, -14, 4, 4);
    g.fillRect(-9, -23, 8, 3);
    g.fillStyle = '#1f2328';
    g.fillRect(-26, -24, 5, 20);
    g.fillStyle = '#b8322c';
    g.fillRect(-26, -20, 5, 3);
    if (night > 0.3) {
      g.fillStyle = '#ff5050';
      g.fillRect(10, -8, 2, 2);
      g.fillStyle = '#fff4c0';
      g.fillRect(-6, -32, 2, 2);
    }
    g.restore();
  };
  const drawBobber = (x: number, y: number, sc: number) => {
    const r = 5 * sc;
    const sinkY = bob.sink * r * 1.6 + (bob.twitch > 0 ? Math.sin((bob.twitch / 0.28) * Math.PI) * r * 0.9 : 0);
    const bobY = phase === 'wait' || phase === 'bite' ? Math.sin(t * 2.4) * 1.2 * sc : 0;
    const cy = y + sinkY + bobY;
    g.save();
    // Waterline clip once it's on the water.
    const inWater = phase !== 'flight' && phase !== 'ready' && phase !== 'charge';
    if (inWater) {
      g.beginPath();
      g.rect(x - 20, y - 40, 40, 40 + r * 0.25);
      g.clip();
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, cy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e63946';
    g.beginPath();
    g.arc(x, cy, r, Math.PI, 0);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.4)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#222';
    g.fillRect(x - 0.75, cy - r * 2, 1.5, r);
    g.restore();
    if (inWater && bob.sink < 1) {
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(x, y + 1, r * 1.5, r * 0.4, 0, 0, Math.PI * 2);
      g.stroke();
    }
  };
  const drawShadow = (x: number, y: number, sc: number, flashOn: boolean) => {
    if (!fish || !reel) return;
    const size = (14 + Math.min(40, lb) * 0.9) * sc * (fish.kind === 'junk' ? 0.8 : 1);
    const face = fvx > 0 ? 1 : -1;
    g.save();
    g.translate(x, y + 8 * sc);
    g.scale(face, 1);
    g.globalAlpha = flashOn ? 0.75 : 0.42;
    g.fillStyle = flashOn ? '#e8f4ff' : '#04121d';
    g.beginPath();
    g.ellipse(0, 0, size, size * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    const tw = Math.sin(t * (6 + fish.fight * 2)) * size * 0.25;
    g.beginPath();
    g.moveTo(-size * 0.9, 0);
    g.lineTo(-size * 1.45, -size * 0.32 + tw);
    g.lineTo(-size * 1.45, size * 0.32 + tw);
    g.closePath();
    g.fill();
    g.restore();
  };
  const drawRod = (tip: { x: number; y: number }, line: { x: number; y: number } | null, tension: number) => {
    // Line first (behind the rod).
    if (line) {
      const mx = (tip.x + line.x) / 2, my = (tip.y + line.y) / 2;
      const sag = phase === 'flight' ? 10 : phase === 'fight' ? (1 - Math.min(1, tension)) * 46 : 28;
      const jit = phase === 'fight' && tension > 0.85 ? (Math.random() - 0.5) * 3 : 0;
      g.strokeStyle = phase === 'fight' && tension >= TENSION.snap ? 'rgba(255,120,120,.95)' : 'rgba(240,244,250,.75)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(tip.x, tip.y);
      g.quadraticCurveTo(mx + jit, my + sag + jit, line.x, line.y);
      g.stroke();
    }
    const bend = phase === 'fight' ? Math.min(1, tension) * 26 : 0;
    const ax = tip.x - BUTT.x, ay = tip.y - BUTT.y, al = Math.hypot(ax, ay);
    const cx = BUTT.x + ax * 0.55 + (-ay / al) * -bend, cy = BUTT.y + ay * 0.55 + (ax / al) * -bend;
    g.lineCap = 'round';
    g.strokeStyle = '#1b1d22';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(BUTT.x, BUTT.y);
    g.quadraticCurveTo(lerp(BUTT.x, cx, 0.5), lerp(BUTT.y, cy, 0.5), lerp(BUTT.x, cx, 0.75), lerp(BUTT.y, cy, 0.75));
    g.stroke();
    g.strokeStyle = '#2e3440';
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(BUTT.x, BUTT.y);
    g.quadraticCurveTo(cx, cy, tip.x, tip.y);
    g.stroke();
    g.strokeStyle = '#e8c26a';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(lerp(BUTT.x, cx, 0.35), lerp(BUTT.y, cy, 0.35));
    g.lineTo(lerp(BUTT.x, cx, 0.4), lerp(BUTT.y, cy, 0.4));
    g.stroke();
    // The reel.
    const rx = BUTT.x + ax * 0.15 - 12, ry = BUTT.y + ay * 0.15 + 2;
    g.fillStyle = '#9aa3ad';
    g.beginPath();
    g.arc(rx, ry, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5b636d';
    g.beginPath();
    g.arc(rx, ry, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1b1d22';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(rx, ry);
    g.lineTo(rx + Math.cos(reelA) * 13, ry + Math.sin(reelA) * 13);
    g.stroke();
    g.fillStyle = '#e8c26a';
    g.beginPath();
    g.arc(rx + Math.cos(reelA) * 13, ry + Math.sin(reelA) * 13, 3, 0, Math.PI * 2);
    g.fill();
  };
  const gauge = (f: number, kind: 'power' | 'tension', warn: boolean) => {
    const { x, y, w, h } = GAUGE;
    g.fillStyle = 'rgba(10,14,28,.72)';
    g.beginPath();
    g.roundRect(x - 4, y - 18, w + 8, h + 24, 9);
    g.fill();
    g.fillStyle = '#2a2f45';
    g.fillRect(x, y, w, h);
    const span = kind === 'tension' ? TENSION.max : 1;
    const X = (v: number) => x + (Math.min(span, v) / span) * w;
    if (kind === 'power') {
      g.fillStyle = 'rgba(255,210,63,.4)';
      g.fillRect(X(CAST_SWEET[0]), y, X(CAST_SWEET[1]) - X(CAST_SWEET[0]), h);
      const grd = g.createLinearGradient(x, 0, x + w, 0);
      grd.addColorStop(0, '#36c5f0');
      grd.addColorStop(0.8, '#7bd88f');
      grd.addColorStop(1, '#ffd23f');
      g.fillStyle = grd;
      g.fillRect(x, y + 3, X(f) - x, h - 6);
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 2;
      g.strokeRect(X(CAST_SWEET[0]), y, X(CAST_SWEET[1]) - X(CAST_SWEET[0]), h);
      label(g, perfectCast(f) ? 'PERFECT!' : 'POWER', x + 2, y - 8, 12, perfectCast(f) ? '#ffd23f' : '#ffffff', 'left');
    } else {
      const [g0, g1] = TENSION.green;
      g.fillStyle = '#56607a';
      g.fillRect(x, y, X(g0) - x, h);
      g.fillStyle = '#2bb673';
      g.fillRect(X(g0), y, X(g1) - X(g0), h);
      g.fillStyle = '#f2a541';
      g.fillRect(X(g1), y, X(TENSION.snap) - X(g1), h);
      g.fillStyle = warn && Math.floor(t * 10) % 2 ? '#ff2d2d' : '#c0392b';
      g.fillRect(X(TENSION.snap), y, x + w - X(TENSION.snap), h);
      // The needle.
      const nx = X(f);
      g.fillStyle = '#ffffff';
      g.fillRect(nx - 2, y - 4, 4, h + 8);
      g.beginPath();
      g.moveTo(nx - 6, y - 8);
      g.lineTo(nx + 6, y - 8);
      g.lineTo(nx, y - 2);
      g.fill();
      const zone = f >= TENSION.snap ? ['SNAPPING!', '#ff5d5d'] : f > g1 ? ['TOO TIGHT', '#f2a541'] : f < g0 ? ['SLACK', '#c9ced6'] : ['TENSION', '#7bd88f'];
      label(g, zone[0], x + 2, y - 8, 12, zone[1], 'left');
    }
  };

  const draw = () => {
    const sky = skyAt(hour), night = nightAt(hour);
    // Sky.
    const sg = g.createLinearGradient(0, 0, 0, HZ);
    sg.addColorStop(0, css(sky.top));
    sg.addColorStop(1, css(sky.bot));
    g.fillStyle = sg;
    g.fillRect(-20, -20, W + 40, HZ + 20);
    if (night > 0.05) {
      g.globalAlpha = night * (0.75 + Math.sin(t * 0.8) * 0.1);
      g.drawImage(STARS, 0, 0);
      g.globalAlpha = 1;
      // The moon, high over Jersey.
      g.fillStyle = `rgba(250,246,226,${night})`;
      g.beginPath();
      g.arc(W * 0.78, 48, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = css(sky.top, night);
      g.beginPath();
      g.arc(W * 0.78 + 5, 45, 10, 0, Math.PI * 2);
      g.fill();
    }
    // The sun sinks toward the Palisades in the afternoon (we face west).
    const sunUp = hour > 11.5 && hour < 19;
    const sunX = W * 0.36 + (19 - hour) * 7, sunY = HZ - 20 - ((19 - hour) / 7.5) * 150;
    if (sunUp) {
      const golden = clamp(1 - (19 - hour) / 2.5, 0, 1);
      const glow = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90 + golden * 70);
      glow.addColorStop(0, `rgba(255,${230 - golden * 70},${170 - golden * 90},${0.55 + golden * 0.3})`);
      glow.addColorStop(1, 'rgba(255,180,90,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, HZ);
      g.fillStyle = golden > 0.5 ? '#ffd08a' : '#fff6da';
      g.beginPath();
      g.arc(sunX, sunY, 13, 0, Math.PI * 2);
      g.fill();
    }
    // Gulls (silhouettes at golden hour and later).
    const gullCol = night > 0.4 || (hour > 17.5 && hour < 20) ? 'rgba(20,20,30,.75)' : 'rgba(255,255,255,.92)';
    for (const gl of gulls) drawGull(gl.x, gl.y, gl.s, gl.glide > 0 ? 0.2 : Math.sin(t * 7 + gl.ph), gullCol);
    // Jersey.
    g.drawImage(buildSkyline(sky.bot, night), 0, HZ - 108);
    // The Hudson.
    const wg = g.createLinearGradient(0, HZ, 0, H);
    wg.addColorStop(0, css(mix(sky.bot, hex('#2d5068'), 0.45)));
    wg.addColorStop(0.35, css(mix(sky.top, DEEP, 0.55)));
    wg.addColorStop(1, css(mix(sky.top, DEEP, 0.8)));
    g.fillStyle = wg;
    g.fillRect(0, HZ, W, H - HZ);
    // The skyline's reflection, and lights on the water at night.
    g.globalAlpha = 0.18;
    g.save();
    g.translate(0, HZ * 1.35 + 1);
    g.scale(1, -0.35);
    g.drawImage(skyline!, 0, HZ - 108);
    g.restore();
    g.globalAlpha = 1;
    if (night > 0.3) {
      g.fillStyle = `rgba(255,214,120,${night * 0.45})`;
      for (let i = 0; i < 26; i++) {
        const x = (i * 53.3) % W, yy = HZ + 2 + ((i * 7) % 5) * 3;
        const fl = Math.sin(t * 3 + i) * 0.5 + 0.5;
        g.fillRect(x + fl * 2, yy, 1.2, 3 + fl * 5);
      }
    }
    // Sun glitter.
    if (sunUp) {
      const golden = clamp(1 - (19 - hour) / 3, 0, 1);
      g.fillStyle = `rgba(255,${226 - golden * 60},${160 - golden * 70},${0.35 + golden * 0.4})`;
      for (let i = 0; i < 34; i++) {
        const z = i / 34;
        const yy = depthY(z);
        const wob = Math.sin(t * 2.2 + i * 1.7) * (4 + z * 22);
        const w = (3 + z * 26) * (0.5 + Math.abs(Math.sin(t * 1.3 + i * 2.3)) * 0.8);
        g.fillRect(sunX + wob - w / 2, yy, w, 1 + z * 1.5);
      }
    }
    // Waves.
    for (const wv of WAVES) {
      const z = wv.z, yy = depthY(z), sc = depthS(z);
      const x = (wv.x + t * wv.sp * sc) % (W + 30) - 15;
      g.fillStyle = wv.light ? `rgba(255,255,255,${0.06 + z * 0.12})` : `rgba(0,10,25,${0.12 + z * 0.15})`;
      g.fillRect(x, yy, wv.len * sc, 1 + z);
    }
    // The Intrepid, a tug.
    g.globalAlpha = 1 - night * 0.5;
    g.drawImage(INTREPID, W - 92, HZ - 22);
    g.globalAlpha = 1;
    drawTug(night);
    for (const p of puffs) {
      g.fillStyle = `rgba(200,200,205,${(p.life / 2.5) * 0.5})`;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    // Ripples.
    for (const r of ripples) {
      g.strokeStyle = `rgba(255,255,255,${(r.life / r.max) * 0.6})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(r.x, r.y + 2, r.r * r.s, r.r * r.s * 0.3, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // Night: dim the whole river a touch.
    if (night > 0) {
      g.fillStyle = `rgba(4,8,24,${night * 0.25})`;
      g.fillRect(0, HZ, W, H - HZ);
    }

    // Fish shadow, bobber, the leap.
    const tip = rodTip();
    let lineTo: { x: number; y: number } | null = null;
    const sc = depthS(bob.z);
    if (phase === 'fight' && reel && fight) {
      const soon = runSoon(fight, reel.t);
      drawShadow(bob.x, bob.y, sc, soon && Math.floor(t * 14) % 2 === 0);
      drawBobber(bob.x, bob.y, sc);
      lineTo = { x: bob.x, y: bob.y };
      if (soon || inRun(fight, reel.t)) label(g, '!', fx0, bob.y - 26 * sc, 22, soon ? '#ffd23f' : '#ff9f1c');
    } else if (phase === 'landing' && fish) {
      const u = Math.min(1, leapT / 0.9);
      const lx = lerp(leapFrom.x, W * 0.5, u), ly = lerp(leapFrom.y, RAIL - 60, u) - Math.sin(u * Math.PI) * 110;
      const len = 40 + Math.min(80, lb * 2.5) * (0.5 + u * 0.5);
      g.save();
      g.translate(lx, ly);
      g.rotate(Math.sin(t * 18) * 0.25 * (1 - u) + (fvx > 0 ? -0.2 : 0.2));
      drawFish(g, fish, 0, 0, len, { flip: fvx > 0, wiggle: t * 12 });
      g.restore();
      lineTo = { x: lx, y: ly - 4 };
    } else if (phase === 'ready' || phase === 'charge' || phase === 'menu') {
      // Hanging from the tip.
      const hx = tip.x + Math.sin(t * 1.6) * 3, hy = tip.y + 30;
      bob.x = hx;
      bob.y = hy;
      bob.z = 1;
      drawBobber(hx, hy, 1);
      lineTo = { x: hx, y: hy - 10 };
    } else if (phase !== 'lost') {
      drawBobber(bob.x, bob.y, phase === 'flight' ? lerp(1, sc, Math.min(1, flightT / flightDur)) : sc);
      lineTo = { x: bob.x, y: bob.y - 4 * sc };
      if (phase === 'bite') label(g, '❗', bob.x, bob.y - 30 * sc - Math.sin(t * 20) * 2, 26, '#ff4f4f');
    }
    // The pier.
    g.drawImage(RAILART, 0, RAIL - 4);
    if (phase !== 'charge' && phase !== 'fight') emoji(g, '🪣', 46, H - 12, 22);
    drawRod(tip, phase === 'lost' ? null : lineTo, reel?.tension ?? 0);
    // HUD on the canvas.
    if (phase === 'charge') gauge(power, 'power', false);
    else if (phase === 'fight' && reel && fight) {
      gauge(reel.tension, 'tension', reel.over > 0);
      const metres = Math.max(0, Math.round(reel.dist * (10 + reach * 46)));
      label(g, `${metres} m`, W / 2, 24, 24, '#ffffff');
      // How tired the fish is.
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(W / 2 - 40, 42, 80, 5);
      g.fillStyle = reel.stamina > 0.5 ? '#ff9f1c' : '#7bd88f';
      g.fillRect(W / 2 - 40, 42, 80 * reel.stamina, 5);
      if (!holding && inRun(fight, reel.t)) label(g, 'LET IT RUN', W / 2, 66, 15, '#ffd23f');
      else if (holding && (inRun(fight, reel.t) || runSoon(fight, reel.t))) label(g, 'LET GO!', W / 2, 66, 18, Math.floor(t * 8) % 2 ? '#ff5d5d' : '#ffd23f');
      else if (reel.slack > 0.6) label(g, 'REEL!', W / 2, 66, 16, '#c9ced6');
    } else if (phase === 'ready') {
      g.globalAlpha = 0.65 + Math.sin(t * 4) * 0.3;
      label(g, 'HOLD TO CAST', W / 2 - 40, H - 24, 18, '#ffffff');
      g.globalAlpha = 1;
    } else if (phase === 'wait') {
      g.globalAlpha = 0.5;
      label(g, 'wait for the dip…', W / 2 - 40, H - 24, 14, '#ffffff');
      g.globalAlpha = 1;
    } else if (phase === 'bite') label(g, 'TAP!', W / 2 - 40, H - 24, 22, '#ffd23f');
  };

  const loop = () => {
    if (closed) return;
    const dt = fx.begin(g);
    if (!fx.frozen) update(dt);
    draw();
    fx.end(g);
    raf = requestAnimationFrame(loop);
  };

  // ---------------------------------------------------------- overlays
  const showOver = (htmlStr: string) => {
    over.innerHTML = htmlStr;
    over.hidden = false;
    over.scrollTop = 0;
    holding = false;
  };
  const hideOver = () => {
    over.hidden = true;
    over.innerHTML = '';
  };
  /** Back to whatever was going on (overlays only open between casts). */
  const resume = () => {
    hideOver();
    if (phase === 'menu') toReady();
  };
  const chips = () => {
    const rec = fishingOf(s);
    const j = journalCount(s);
    const derby = derbyOpen() ? (rec.derby?.day === nycTime().dateKey && rec.derby.lb ? `🏆 Derby: ${rec.derby.lb} lb` : '🏆 Derby on till 11') : '🏆 Derby 6–11 AM';
    return `<div class="pf-chips"><span>📖 ${j.found}/${j.total}</span><span>⚖️ ${rec.best ? `Record ${rec.best.lb} lb` : 'No record yet'}</span><span>${derby}</span></div>`;
  };
  const intro = () => {
    phase = 'menu';
    showOver(`<div class="pf-card">
      <div class="pf-emoji" aria-hidden="true">🎣</div>
      <h3>Pier 84</h3>
      <ol class="pf-how">
        <li><span><b>Hold</b>, then let go to cast. Gold on the meter is a perfect cast.</span></li>
        <li><span>Twitches are nibbles. <b>Tap when the bobber dips.</b></span></li>
        <li><span><b>Hold to reel</b>, let go when it runs. Keep the line in the green.</span></li>
      </ol>
      ${chips()}
      <button class="btn primary block" data-go>🎣 Start fishing</button>
    </div>`);
    coach('Rods are free. The fish are not guaranteed.');
  };
  const showCard = (r: CatchResult, perfect: boolean) => {
    const f = r.fish;
    const place = r.derbyBest ? derbyPlace(s) : 0;
    const badges = [
      r.newSpecies ? '<span class="pf-badge new">📖 New species</span>' : '',
      r.newBest ? '<span class="pf-badge best">🏆 Personal best</span>' : r.speciesRecord && !r.newSpecies ? `<span class="pf-badge rec">⭐ Biggest ${esc(f.name.toLowerCase())} yet</span>` : '',
      place ? `<span class="pf-badge derby">🏅 Derby: ${ordinal(place)}</span>` : '',
    ].join('');
    const gains = [
      r.cents ? `<span class="pf-gain cash">+${money(r.cents)} from the fish guy</span>` : '',
      perfect && r.cents ? '<span class="pf-gain">✨ Perfect catch +25%</span>' : '',
      r.streakCents ? `<span class="pf-gain hot">🔥 ${streak} in a row +${money(r.streakCents)}</span>` : '',
      f.kind === 'release' ? '<span class="pf-gain">🌊 Released, with a photo</span>' : '',
      r.rep ? `<span class="pf-gain hot">+${r.rep} street rep</span>` : '',
    ].join('');
    phase = 'menu';
    showOver(`<div class="pf-card catch ${f.kind}">
      <div class="pf-badges">${badges}</div>
      <div class="pf-art" data-art></div>
      <h3>${esc(f.name)}</h3>
      <p class="pf-weight">${f.kind === 'junk' && lb < 1 ? '' : `${lb}<small> lb</small>`}</p>
      <p class="pf-line">${esc(f.line)}</p>
      ${gains ? `<div class="pf-gains">${gains}</div>` : ''}
      <div class="pf-row"><button class="btn primary" data-again>🎣 Cast again</button><button class="btn ghost" data-journal>📖 Journal</button></div>
    </div>`);
    over.querySelector('[data-art]')!.appendChild(artCanvas(f, 230, 104));
  };
  const journal = () => {
    const sp = fishingOf(s).species!;
    const j = journalCount(s);
    if (phase !== 'menu' && phase !== 'ready') return; // not mid-cast
    phase = 'menu';
    showOver(`<div class="pf-card wide">
      <h3>📖 Journal</h3>
      <p>${j.found} of ${j.total} found${j.found === j.total ? '. Sal is impressed. Quietly.' : '.'}</p>
      <div class="pf-grid">${FISH.map((f) => {
        const got = sp[f.id];
        return `<div class="pf-tile${got ? '' : ' unknown'}" data-tile="${f.id}"><div class="pf-tile-art"></div><b>${got ? esc(f.name.replace(/^An? /, '')) : '???'}</b><small>${got ? (f.kind === 'junk' ? `×${got.n}` : `×${got.n} · ${got.lb} lb`) : f.kind === 'release' ? 'legend' : f.kind === 'junk' ? 'river junk' : '&nbsp;'}</small></div>`;
      }).join('')}</div>
      <button class="btn primary block" data-back>Back to the water</button>
    </div>`);
    for (const f of FISH) over.querySelector(`[data-tile="${f.id}"] .pf-tile-art`)!.appendChild(artCanvas(f, 84, 36, sp[f.id] ? undefined : '#0b1022'));
  };
  const derby = () => {
    if (phase !== 'menu' && phase !== 'ready') return;
    phase = 'menu';
    showOver(`<div class="pf-card wide">
      <h3>🏆 Morning Derby</h3>
      <p>${derbyOpen() ? 'On now, until 11 AM.' : 'Runs 6–11 AM every morning.'} Heaviest fish you sell counts. Paid when it ends.</p>
      ${derbyHtml(s)}
      <button class="btn primary block" data-back>Back to the water</button>
    </div>`);
  };

  // ---------------------------------------------------------- buttons
  const close = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    timers.forEach((x) => window.clearTimeout(x));
    timers = [];
    offP();
    offK();
    sfx.close();
    m.close();
  };
  m.el.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-close]')) return close();
    if (el.closest('[data-go]') || el.closest('[data-again]') || el.closest('[data-back]')) {
      sfx.tap();
      return resume();
    }
    if (el.closest('[data-journal]')) {
      sfx.tap();
      if (phase !== 'menu' && phase !== 'ready') return coach('Finish this cast first.');
      return journal();
    }
    if (el.closest('[data-derby]')) {
      sfx.tap();
      if (phase !== 'menu' && phase !== 'ready') return coach('Finish this cast first.');
      return derby();
    }
  });

  setHud();
  intro();
  raf = requestAnimationFrame(loop);
  // QA hook: lets the smoke test drive the game without a finger.
  if (new URLSearchParams(location.search).get('qa') === '1') {
    (window as unknown as { __fishing?: unknown }).__fishing = {
      get phase() {
        return phase;
      },
      get tension() {
        return reel?.tension ?? 0;
      },
      get running() {
        return !!(reel && fight && (inRun(fight, reel.t) || runSoon(fight, reel.t)));
      },
      get fish() {
        return fish?.id ?? null;
      },
      down,
      up,
    };
  }
}

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function derbyHtml(s: GameState): string {
  const board = derbyBoard(s);
  const rec = fishingOf(s);
  return `<div class="pf-board">${board
    .map((r, i) => `<div class="pf-board-row${r.you ? ' you' : ''}"><span class="pf-medal">${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span><b>${esc(r.name)}${r.you ? ' (you)' : ''}</b><span>${r.lb} lb</span></div>`)
    .join('')}</div>
    <p class="pf-prizes">🥇 ${money(DERBY_PRIZES[0])} · 🥈 ${money(DERBY_PRIZES[1])} · 🥉 ${money(DERBY_PRIZES[2])}</p>
    ${rec.best ? `<p class="pf-small">Your record: ${rec.best.lb} lb.</p>` : ''}`;
}

/** This morning's derby board. */
export function openDerby(host: FishHost): void {
  const s = host.state;
  openSheet({
    emoji: '🏆',
    title: 'Pier 84 Morning Derby',
    sub: derbyOpen() ? 'On now · ends 11 AM' : 'Runs 6–11 AM every morning',
    className: 'pf-sheet',
    body: `<p class="blurb">Heaviest fish you sell by 11 AM wins. Paid when it ends.</p>${derbyHtml(s)}`,
  });
}
