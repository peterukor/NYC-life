// ⛳ Course 7 🗽 Liberty — the finale. From the Battery across the harbor
// to the torch: every obstacle the game has, combined, on tighter clocks,
// and still fair. Most holes keep a safe-but-slow line (the footbridge,
// the ferry, the stairs) beside the fast-but-risky one (the jump, the
// crumbling scaffold, the magnet shot) so the time score pays for nerve.
//   1–3 introduce the combos: a jump into a crosswind, a sandbar between
//       two tidal flats whose dry strips slide (two tides out of step),
//       the star fort that spins.
//   4–7 develop: a scaffold you knock through past a crane beam, a magnet
//       you flip from push to pull, the ferry belt and its sliding cup,
//       the crown's seven rays crossing and parting round a sliding cup.
//   8–9 test: the fireworks barge (tide or rocket ramp, then a Catherine
//       wheel round the cup), the four-stage torch balcony.
//   10  the boss: harbor, pedestal, crown and torch in one hole.
// New behaviours from combining old parts: tides in opposite phase (a
// moving dry strip), a magnet pair on one switch (polarity), a portal that
// turns you onto a sliding cup's track, a spinner centred on the cup.
// Authoring guide: ./index.ts.
import { box, deg, rect, type Pt } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

/** A ring of wall pieces (n of them, each `th` thick) round (cx, cy), leaving out the pieces in `gaps`. Piece k is centred on angle k·360°/n. */
function ring(cx: number, cy: number, r: number, th: number, n: number, gaps: number[]): Pt[][] {
  const out: Pt[][] = [];
  const step = (Math.PI * 2) / n;
  for (let k = 0; k < n; k++) {
    if (gaps.includes(k)) continue;
    const a0 = (k - 0.5) * step, a1 = (k + 0.5) * step;
    const p = (a: number, rr: number): Pt => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    out.push([p(a0, r), p(a1, r), p(a1, r + th), p(a0, r + th)]);
  }
  return out;
}

export const course: CourseDef = {
  id: 'c7',
  name: 'Liberty',
  emoji: '🗽',
  stars: 5,
  blurb: 'Across the harbor to the torch. Everything you’ve learned.',
  theme: { turf: '#6fd3a8', stripe: '#63c69b', rail: '#f6f0dc', ink: '#13203a', bg: ['#1f5f7a', '#0f3347'], block: '#5f9e8f', accent: '#3fb8a0', art: 'liberty' },
  holes: [
    {
      // Jump the harbor into a gust (wind pushes a ball in the air too), or walk the footbridge.
      id: 'harbor-crosswind', name: 'Harbor Crosswind', emoji: '💨', par: 3, parTime: 13,
      tip: 'Fly the harbor when the streamers sleep, or take the footbridge on the left.',
      outer: box(0, 0, 60, 120),
      zones: [{ kind: 'water', poly: rect(13, 50, 60, 68) }, { kind: 'path', poly: rect(0, 48, 11, 70) }, { kind: 'sand', poly: rect(6, 0.5, 54, 8) }],
      low: [rect(11, 48, 13, 70)],
      jumps: [{ x: 40, y: 80, dir: deg(-90), w: 12, len: 9, minSpeed: 45 }],
      winds: [{ poly: rect(13, 50, 60, 68), dir: deg(180), force: 80, period: 5, on: 1.8, warn: 1.2 }],
      bumpers: [{ x: 20, y: 34, r: 1.6, kind: 'cone' }, { x: 44, y: 30, r: 1.6, kind: 'cone' }],
      tee: { x: 38, y: 108 }, cup: { x: 30, y: 22 },
      deco: [{ x: 6, y: 59, emoji: '🚶', size: 4 }, { x: 40, y: 59, emoji: '⛵', size: 5 }, { x: 54, y: 95, emoji: '🎟️', size: 4 }],
    },
    {
      // The cup sits on a sandbar between two tidal flats. Each flat has two tides out of step, so its dry strip slides side to side.
      id: 'low-tide', name: 'Low Tide Sandbar', emoji: '🌊', par: 3, parTime: 14,
      tip: 'Cross where the dry strip will be. Too firm and the far tide takes it.',
      outer: box(0, 0, 64, 124),
      tides: [
        { x0: 0, y0: 70, x1: 64, y1: 88, from: 'left', lo: 0.08, hi: 0.66, period: 6 },
        { x0: 0, y0: 70, x1: 64, y1: 88, from: 'right', lo: 0.08, hi: 0.66, period: 6, phase: 3 },
        { x0: 0, y0: 34, x1: 64, y1: 52, from: 'left', lo: 0.08, hi: 0.66, period: 5, phase: 2.5 },
        { x0: 0, y0: 34, x1: 64, y1: 52, from: 'right', lo: 0.08, hi: 0.66, period: 5 },
      ],
      zones: [{ kind: 'sand', poly: rect(0, 52, 13, 70) }, { kind: 'sand', poly: rect(51, 52, 64, 70) }],
      bumpers: [{ x: 20, y: 18, r: 2, kind: 'post' }, { x: 44, y: 18, r: 2, kind: 'post' }],
      tee: { x: 32, y: 112 }, cup: { x: 32, y: 61 },
      deco: [{ x: 8, y: 100, emoji: '🦀', size: 4 }, { x: 56, y: 24, emoji: '🐚', size: 3 }],
    },
    {
      // The star fort the statue stands on: a turntable inside a ring wall with two doors.
      id: 'fort-wood', name: 'Fort Wood Star', emoji: '⭐', par: 3, parTime: 13,
      tip: 'In the bottom door, out the top right. The spin bends you right. Sand round the outside.',
      outer: box(0, 0, 64, 124),
      blocks: ring(32, 62, 17, 2.4, 12, [3, 10]),
      look: { block: '#9a8f7a' },
      turntables: [{ x: 32, y: 62, r: 14, omega: 1 }],
      zones: [{ kind: 'sand', poly: rect(0, 50, 11, 76) }, { kind: 'sand', poly: rect(53, 50, 64, 76) }],
      tee: { x: 32, y: 112 }, cup: { x: 32, y: 16 },
      deco: [{ x: 32, y: 62, emoji: '⭐', size: 5 }],
    },
    {
      // The 1986 restoration: knock the scaffold down between passes of the crane beam, or climb the stairs and go round the pedestal.
      id: 'scaffold', name: 'The Scaffold', emoji: '🏗️', par: 3, parTime: 13,
      tip: 'One good knock drops the scaffold, when the beam’s clear. Or the stairs on the right.',
      outer: box(0, 0, 66, 128),
      blocks: [rect(0, 58, 14, 62), rect(30, 58, 50, 62), rect(34, 12, 50, 44)],
      crumbles: [{ poly: rect(14, 58, 30, 62), hits: 1 }],
      zones: [{ kind: 'ramp', poly: rect(50, 36, 66, 72), push: [0, 32] }],
      movers: [{ a: { x: 2, y: 72 }, b: { x: 14, y: 72 }, dx: 24, dy: 0, period: 4, w: 3, kind: 'beam' }],
      tee: { x: 24, y: 116 }, cup: { x: 20, y: 16 },
      deco: [{ x: 42, y: 28, emoji: '🗽', size: 7 }, { x: 58, y: 54, emoji: '🪜', size: 5 }, { x: 10, y: 100, emoji: '🦺', size: 4 }, { x: 22, y: 54.5, emoji: '🚧', size: 3 }],
    },
    {
      // Wind + magnets: the cup's magnet shoves until the switch in the sandy alcove flips it to pull.
      id: 'polarity', name: 'Polarity Switch', emoji: '🧲', par: 3, parTime: 14,
      tip: 'The cup’s magnet shoves. Bank into the alcove, roll over 🔘, and it pulls. Gusts swap sides.',
      outer: box(0, 0, 64, 120),
      blocks: [rect(46, 48, 64, 52)],
      zones: [{ kind: 'sand', poly: rect(50, 28, 64, 48) }],
      winds: [
        { poly: rect(0, 56, 64, 82), dir: 0, force: 55, period: 6, on: 1.6, warn: 1.2 },
        { poly: rect(0, 56, 64, 82), dir: deg(180), force: 55, period: 6, on: 1.6, warn: 1.2, phase: 3 },
      ],
      magnets: [
        { x: 30, y: 22, r: 11, strength: -70, sw: { id: 'A', active: 'off' } },
        { x: 30, y: 22, r: 11, strength: 60, sw: { id: 'A', active: 'on' } },
      ],
      switches: [{ id: 'A', x: 57, y: 38, mode: 'once' }],
      tee: { x: 30, y: 108 }, cup: { x: 30, y: 22 },
      deco: [{ x: 10, y: 44, emoji: '🧲', size: 4 }],
    },
    {
      // The ferry: board on the left (it leaves every five seconds), ride the belt across, putt at the sliding cup. Or jump, but not too far.
      id: 'staten-ferry', name: 'Staten Island Ferry', emoji: '⛴️', par: 3, parTime: 15,
      tip: 'Board when the gate opens and ride it over. Or jump, but the bay is right behind the cup.',
      outer: box(0, 0, 72, 130),
      blocks: [rect(0, 50, 6, 92), rect(18, 80, 22, 92)],
      look: { block: '#f28c28' },
      zones: [{ kind: 'water', poly: rect(18, 52, 72, 80) }, { kind: 'water', poly: rect(4, 0, 68, 7) }],
      conveyors: [{ poly: rect(6, 46, 18, 86), dir: deg(-90), speed: 26 }],
      gates: [{ a: { x: 6, y: 90 }, b: { x: 18, y: 90 }, period: 5, open: 2 }],
      jumps: [{ x: 48, y: 88, dir: deg(-90), w: 12, len: 10, minSpeed: 48 }],
      bumpers: [{ x: 40, y: 36, r: 1.8, kind: 'post' }, { x: 62, y: 34, r: 1.8, kind: 'post' }],
      cupTrack: { x: 56, y: 20, period: 5 },
      tee: { x: 48, y: 118 }, cup: { x: 26, y: 20 },
      deco: [{ x: 12, y: 66, emoji: '⛴️', size: 6 }, { x: 46, y: 66, emoji: '🌊', size: 4 }],
    },
    {
      // The crown: the cup slides inside it, and its seven rays breathe in and out, so every other gap between them opens in turn.
      id: 'seven-rays', name: 'Seven Rays', emoji: '👑', par: 3, parTime: 14,
      tip: 'The rays cross and part, and the cup slides inside the crown. Go when a gap opens, soft.',
      outer: box(0, 0, 64, 112),
      blocks: ring(32, 28, 13, 2.4, 12, [1, 2, 3, 4, 5]),
      look: { block: '#5f9e8f' },
      arms: Array.from({ length: 7 }, (_, i) => {
        const a = deg(25 + (i * 130) / 6);
        return { x: 32 + Math.cos(a) * 16, y: 28 + Math.sin(a) * 16, len: 14, a0: a, amp: deg(24), period: 3.2, phase: (i % 2) * 1.6, kind: 'boom' as const };
      }),
      cupTrack: { x: 40, y: 25, period: 4 },
      tee: { x: 32, y: 100 }, cup: { x: 24, y: 25 },
      deco: [{ x: 32, y: 8, emoji: '👑', size: 6 }],
    },
    {
      // Fireworks night: a tide channel (or a rocket ramp over it), two trampolines, and a Catherine wheel spinning round the cup.
      id: 'fireworks', name: 'Fireworks Barge', emoji: '🎆', par: 4, parTime: 18,
      tip: 'Tide comes in from the left: cross right, or launch off the ramp. The wheel round the cup never stops.',
      outer: box(0, 0, 68, 128),
      tides: [{ x0: 0, y0: 74, x1: 68, y1: 96, from: 'left', lo: 0.15, hi: 0.9, period: 5.5 }],
      jumps: [{ x: 12, y: 100, dir: deg(-90), w: 10, len: 8, minSpeed: 46 }],
      blocks: [rect(14, 0, 20, 34), rect(48, 0, 54, 34)],
      look: { block: '#3b4a6b' },
      bumpers: [{ x: 24, y: 46, r: 2.6, kind: 'trampoline' }, { x: 44, y: 46, r: 2.6, kind: 'trampoline' }, { x: 34, y: 56, r: 2.4, kind: 'bumper' }],
      spinners: [{ x: 34, y: 16, hub: 3.4, len: 12, arms: 4, omega: 2, a0: 0 }],
      tee: { x: 34, y: 118 }, cup: { x: 34, y: 16 },
      deco: [{ x: 7, y: 16, emoji: '🎆', size: 5 }, { x: 61, y: 16, emoji: '🎇', size: 5 }, { x: 62, y: 85, emoji: '🛟', size: 3 }],
    },
    {
      // Four stages: the switch opens the door, the portal lifts you to the balcony, the cup slides along it.
      id: 'torch-balcony', name: 'Torch Balcony', emoji: '🔥', par: 4, parTime: 20,
      tip: '🔘 opens the door. Duck the beam into the portal; it drops you on the balcony rolling right.',
      outer: box(0, 0, 72, 132),
      blocks: [rect(0, 80, 30, 84), rect(46, 80, 72, 84), rect(0, 30, 72, 34)],
      gates: [{ a: { x: 30, y: 82 }, b: { x: 46, y: 82 }, kind: 'door', sw: { id: 'A', active: 'off' } }],
      switches: [{ id: 'A', x: 58, y: 104, mode: 'once' }],
      portals: [{ a: { x: 36, y: 50 }, b: { x: 8, y: 16 }, oneWay: true, turn: deg(90) }],
      movers: [{ a: { x: 4, y: 66 }, b: { x: 20, y: 66 }, dx: 46, dy: 0, period: 4.5, w: 3, kind: 'beam' }],
      cupTrack: { x: 56, y: 16, period: 5 },
      tee: { x: 16, y: 120 }, cup: { x: 26, y: 16 },
      deco: [{ x: 66, y: 22, emoji: '🔥', size: 5 }],
    },
    {
      // The boss: harbor (jump or ferry), pedestal (scaffold or switch door), crown (gusts, fireworks, portal), torch (magnet + sliding cup).
      id: 'lady-liberty', name: 'Lady Liberty', emoji: '🗽', par: 6, parTime: 34,
      tip: 'Harbor, pedestal, crown, torch. The torch magnet holds you till the cup comes round.',
      outer: box(0, 0, 80, 140),
      blocks: [
        rect(0, 92, 4, 124), rect(0, 62, 4, 66), rect(18, 62, 32, 66), rect(48, 62, 80, 66), rect(0, 28, 80, 32),
        rect(24, 32, 26, 52), rect(0, 52, 10, 54),
      ],
      zones: [{ kind: 'water', poly: rect(16, 100, 80, 114) }],
      conveyors: [{ poly: rect(4, 94, 16, 120), dir: deg(-90), speed: 28 }],
      jumps: [{ x: 44, y: 120, dir: deg(-90), w: 12, len: 8, minSpeed: 46 }],
      crumbles: [{ poly: rect(32, 62, 48, 66), hits: 2 }],
      gates: [
        { a: { x: 4, y: 64 }, b: { x: 18, y: 64 }, kind: 'door', sw: { id: 'A', active: 'off' } },
        { a: { x: 26, y: 53 }, b: { x: 10, y: 53 }, period: 4, open: 1.6 },
      ],
      switches: [{ id: 'A', x: 70, y: 72, mode: 'once' }],
      winds: [
        { poly: rect(26, 32, 80, 62), dir: 0, force: 50, period: 6, on: 1.6, warn: 1.2 },
        { poly: rect(26, 32, 80, 62), dir: deg(180), force: 50, period: 6, on: 1.6, warn: 1.2, phase: 3 },
      ],
      bumpers: [{ x: 50, y: 44, r: 2.6, kind: 'trampoline' }],
      portals: [{ a: { x: 12, y: 42 }, b: { x: 10, y: 14 }, oneWay: true, turn: deg(90) }],
      magnets: [{ x: 40, y: 14, r: 8, strength: 50 }],
      cupTrack: { x: 56, y: 14, period: 5 },
      tee: { x: 44, y: 133 }, cup: { x: 24, y: 14 },
      deco: [{ x: 70, y: 22, emoji: '🔥', size: 5 }, { x: 60, y: 107, emoji: '⛵', size: 4 }],
    },
  ],
};
