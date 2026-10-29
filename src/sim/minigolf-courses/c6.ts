// ⛳ Course 6 🌃 Rooftops at Night — the city after dark, ten floors up.
// Jumps between roofs, pinball in the penthouse, searchlights that only
// let you through in step, a spinning water tower, a helipad cup that
// won't sit still, gusts between towers, key-card doors, a flipper lane,
// and the Empire State finale with all of it switched on.
import { box, deg, rect, type Pt } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

/** A ring of short low walls round (cx, cy), radius r, n pieces, leaving out the pieces in `open` (piece i is centred at i × 360/n degrees, 0 = right). */
const ring = (cx: number, cy: number, r: number, n: number, open: number[]): Pt[][] => {
  const out: Pt[][] = [];
  const h = Math.PI / n;
  for (let i = 0; i < n; i++) {
    if (open.includes(i)) continue;
    const a = (i * 2 * Math.PI) / n;
    const p = (rr: number, aa: number): Pt => [cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr];
    out.push([p(r - 0.8, a - h), p(r + 0.8, a - h), p(r + 0.8, a + h), p(r - 0.8, a + h)]);
  }
  return out;
};

export const course: CourseDef = {
  id: 'c6',
  name: 'Rooftops at Night',
  emoji: '🌃',
  stars: 4,
  blurb: 'Pinball on the penthouse. Magnets, flippers, searchlights.',
  theme: { turf: '#2fbf9f', stripe: '#29ad90', rail: '#ffe9b0', ink: '#0d1024', bg: ['#141833', '#070914'], block: '#4b3f8f', accent: '#9b5de5', art: 'night' },
  holes: [
    {
      // Jumps return, now between buildings: fly the alley, then round the A/C to the cup.
      id: 'roof-hop', name: 'Roof Hop', emoji: '🏢', par: 3, parTime: 12,
      tip: 'Hit the ramp hard to clear the alley. The plank on the right is narrow.',
      outer: box(0, 0, 60, 120),
      zones: [{ kind: 'water', poly: rect(0, 50, 52, 66) }],
      jumps: [{ x: 24, y: 72, dir: deg(-90), w: 12, len: 10, minSpeed: 42 }],
      blocks: [rect(30, 22, 42, 32)],
      look: { label: 'A/C' },
      bumpers: [{ x: 14, y: 22, r: 1.6, kind: 'post' }],
      tee: { x: 24, y: 108 }, cup: { x: 48, y: 14 },
      deco: [{ x: 26, y: 58, text: '↓ 12 FLOORS', size: 2.6, color: '#ffffff' }, { x: 14, y: 18, emoji: '📡', size: 4 }],
    },
    {
      id: 'penthouse-pinball', name: 'Penthouse Pinball', emoji: '🪩', par: 3, parTime: 13,
      tip: 'Flippers fire when they glow. The left magnet grabs, the right one shoves.',
      outer: box(0, 0, 60, 116),
      blocks: [rect(22, 34, 38, 38)],
      look: { label: 'DJ' },
      arms: [
        { x: 10, y: 66, len: 13, a0: deg(30), amp: deg(-55), period: 2.4, kind: 'flipper' },
        { x: 50, y: 66, len: 13, a0: deg(150), amp: deg(55), period: 2.4, phase: 1.2, kind: 'flipper' },
      ],
      magnets: [{ x: 15, y: 26, r: 10, strength: 55 }, { x: 45, y: 26, r: 9, strength: -60 }],
      bumpers: [{ x: 30, y: 58, r: 3, kind: 'trampoline' }],
      tee: { x: 30, y: 102 }, cup: { x: 30, y: 16 },
    },
    {
      // Searchlights sweep the crossings in step: hit it at the right pace and they go green ahead of you.
      id: 'searchlights', name: 'Searchlight Row', emoji: '🔦', par: 3, parTime: 14,
      tip: 'Three lights, one after another. Zig, zag, and go when they go.',
      outer: box(0, 0, 56, 128),
      blocks: [
        rect(0, 90, 22, 94), rect(34, 90, 56, 94),
        rect(0, 66, 10, 70), rect(22, 66, 56, 70),
        rect(0, 42, 34, 46), rect(46, 42, 56, 46),
      ],
      gates: [
        { a: { x: 22, y: 92 }, b: { x: 34, y: 92 }, period: 4, open: 1.4 },
        { a: { x: 10, y: 68 }, b: { x: 22, y: 68 }, period: 4, open: 1.4, phase: -0.6 },
        { a: { x: 34, y: 44 }, b: { x: 46, y: 44 }, period: 4, open: 1.4, phase: -1.2 },
      ],
      tee: { x: 28, y: 116 }, cup: { x: 28, y: 14 },
      deco: [{ x: 6, y: 80, emoji: '🔦', size: 4 }, { x: 50, y: 56, emoji: '🔦', size: 4, rot: 3.1 }],
    },
    {
      // The water tower spins, fences and all, inside a fixed parapet with two gaps: line up both.
      id: 'water-tower', name: 'Water Tower', emoji: '🛢️', par: 3, parTime: 14,
      tip: 'In through a gap in the rail, then between the turning fences. Gently.',
      outer: box(0, 0, 70, 110),
      low: ring(35, 38, 19, 12, [2, 7]),
      turntables: [{ x: 35, y: 38, r: 15, omega: 0.9 }],
      spinners: [{ x: 35, y: 38, hub: 3.3, len: 14.5, arms: 3, omega: 0.9, a0: 0 }],
      winds: [{ poly: rect(0, 64, 70, 80), dir: Math.PI, force: 60, period: 4, on: 1.5, warn: 1.2 }],
      bumpers: [{ x: 20, y: 86, r: 1.6, kind: 'post' }],
      tee: { x: 60, y: 96 }, cup: { x: 35, y: 38 },
      deco: [{ x: 64, y: 70, emoji: '💨', size: 4 }],
    },
    {
      // The cup rides the helipad; springs and pads send you back faster than you came.
      id: 'helipad', name: 'Helipad', emoji: '🚁', par: 3, parTime: 14,
      tip: 'The cup slides across the pad. Lead it, or bank off a spring.',
      outer: box(0, 0, 64, 120),
      blocks: [rect(24, 52, 40, 64)],
      look: { label: 'LIFT' },
      springs: [{ a: { x: 1, y: 72 }, b: { x: 12, y: 62 } }, { a: { x: 52, y: 62 }, b: { x: 63, y: 72 } }],
      bumpers: [{ x: 10, y: 40, r: 2.4, kind: 'trampoline' }, { x: 54, y: 40, r: 2.4, kind: 'trampoline' }],
      cupTrack: { x: 46, y: 22, period: 4.4 },
      zones: [{ kind: 'path', circle: { x: 32, y: 22, r: 16 } }],
      tee: { x: 32, y: 108 }, cup: { x: 18, y: 22 },
      deco: [{ x: 32, y: 22, text: 'H', size: 9, color: 'rgba(255,255,255,0.35)' }],
    },
    {
      // Breather: the roof garden. Planters are low; the bird bath magnet helps at the end.
      id: 'roof-garden', name: 'Roof Garden', emoji: '🌿', par: 3, parTime: 11,
      tip: 'The sprinkler pushes you off line. The bird bath pulls you home.',
      outer: box(0, 0, 80, 92),
      low: [rect(20, 30, 50, 32), rect(30, 58, 62, 60)],
      zones: [{ kind: 'sand', circle: { x: 66, y: 30, r: 6 } }, { kind: 'sand', circle: { x: 14, y: 64, r: 6 } }],
      magnets: [{ x: 14, y: 14, r: 10, strength: 45 }, { x: 44, y: 44, r: 9, strength: -55 }],
      tee: { x: 68, y: 80 }, cup: { x: 14, y: 14 },
      deco: [{ x: 35, y: 31, emoji: '🌿', size: 3 }, { x: 46, y: 59, emoji: '🌷', size: 3 }, { x: 44, y: 44, emoji: '💦', size: 4 }],
    },
    {
      // Two alleys, two gusts: the wind blows in the air too. The bulkhead stops a jump that's too big.
      id: 'gusts', name: 'Between the Towers', emoji: '💨', par: 4, parTime: 18,
      tip: 'Two jumps. Gusts push you mid-air: watch the streamers. Planks on the right.',
      outer: box(0, 0, 64, 140),
      zones: [{ kind: 'water', poly: rect(0, 90, 52, 106) }, { kind: 'water', poly: rect(0, 38, 54, 54) }],
      blocks: [rect(6, 54, 30, 58)],
      low: [rect(0, 88.4, 52, 90), rect(0, 36.4, 54, 38)],
      look: { label: 'EXIT' },
      jumps: [{ x: 18, y: 106, dir: deg(-90), w: 12, len: 10, minSpeed: 42, lift: 0.3 }, { x: 42, y: 58, dir: deg(-90), w: 12, len: 8, minSpeed: 42, lift: 0.3 }],
      winds: [
        { poly: rect(0, 88, 64, 108), dir: 0, force: 70, period: 4, on: 1.6, warn: 1.2 },
        { poly: rect(0, 36, 64, 56), dir: Math.PI, force: 70, period: 4, on: 1.6, warn: 1.2, phase: 2 },
      ],
      bumpers: [{ x: 34, y: 14, r: 1.6, kind: 'post' }],
      tee: { x: 18, y: 128 }, cup: { x: 22, y: 14 },
      deco: [{ x: 58, y: 98, emoji: '🪜', size: 3 }, { x: 59, y: 46, emoji: '🪜', size: 3 }],
    },
    {
      // Key cards: 🔘A opens the lobby door (no way round it), 🔘B the roof door. Or bash the fire door.
      id: 'key-card', name: 'Key Card Access', emoji: '🛎️', par: 5, parTime: 22,
      tip: '🔘A opens the lobby. 🔘B opens the roof, or knock the fire door down.',
      outer: box(0, 0, 76, 124),
      blocks: [rect(0, 58, 10, 62), rect(22, 58, 56, 62), rect(70, 58, 76, 62), rect(36, 62, 40, 92), rect(36, 104, 40, 124)],
      crumbles: [{ poly: rect(10, 58, 22, 62), hits: 2 }],
      gates: [
        { a: { x: 38, y: 92 }, b: { x: 38, y: 104 }, kind: 'door', sw: { id: 'A', active: 'off' } },
        { a: { x: 56, y: 60 }, b: { x: 70, y: 60 }, kind: 'door', sw: { id: 'B', active: 'off' } },
      ],
      switches: [{ id: 'A', x: 12, y: 76 }, { id: 'B', x: 66, y: 112 }],
      magnets: [{ x: 12, y: 76, r: 7, strength: -45 }],
      spinners: [{ x: 56, y: 100, hub: 1.6, len: 7, arms: 3, omega: 1.3, a0: 0 }],
      arms: [{ x: 4, y: 30, len: 13, a0: deg(20), amp: deg(-45), period: 2.6, kind: 'flipper' }],
      bumpers: [{ x: 56, y: 100, r: 1.6, kind: 'post' }, { x: 40, y: 30, r: 2.6, kind: 'bumper' }],
      tee: { x: 22, y: 112 }, cup: { x: 18, y: 14 },
      deco: [{ x: 30, y: 72, emoji: '🛎️', size: 4 }, { x: 16, y: 54, text: 'FIRE DOOR', size: 1.8, color: '#ffe9b0' }],
    },
    {
      // Park it by the flipper in the right lane and it launches you up. Or thread the gap between the flippers.
      id: 'pinball-wizard', name: 'Pinball Wizard', emoji: '🕹️', par: 4, parTime: 17,
      tip: 'Roll into the right lane: the flipper launches you. Or thread the middle gap.',
      outer: box(0, 0, 70, 128),
      blocks: [rect(54, 34, 58, 108), rect(0, 34, 24, 38), rect(30, 34, 54, 38)],
      zones: [{ kind: 'ramp', poly: rect(58, 44, 70, 98), push: [0, 20] }],
      oneways: [{ a: { x: 58, y: 40 }, b: { x: 70, y: 40 }, dir: deg(-90) }],
      arms: [
        { x: 58.5, y: 120, len: 11, a0: deg(-6), amp: deg(-60), period: 2.5, kind: 'flipper', hold: 0.3 },
        { x: 13, y: 46, len: 10, a0: deg(25), amp: deg(-50), period: 2.4, kind: 'flipper' },
        { x: 41, y: 46, len: 10, a0: deg(155), amp: deg(50), period: 2.4, phase: 1.2, kind: 'flipper' },
      ],
      bumpers: [{ x: 16, y: 72, r: 2.6, kind: 'trampoline' }, { x: 38, y: 84, r: 2.6, kind: 'trampoline' }, { x: 28, y: 20, r: 2, kind: 'bumper' }],
      tee: { x: 24, y: 116 }, cup: { x: 12, y: 14 },
      deco: [{ x: 64, y: 70, text: '⇧', size: 5, color: '#ffe9b0' }],
    },
    {
      // Finale, shaped like the building: fly the gap in the gust, bank to a searchlight gate at either
      // end of the first setback, ride the water tower to the spire past its flippers, sink it on the sliding cup.
      id: 'empire-state', name: 'Empire State of Mind', emoji: '🏙️', par: 5, parTime: 26,
      tip: 'Jump the gap, out of the tar through a searchlight gate, ride the tower up.',
      outer: [[0, 140], [0, 60], [12, 60], [12, 30], [24, 30], [24, 4], [28, 0], [52, 0], [56, 4], [56, 30], [68, 30], [68, 60], [80, 60], [80, 140]],
      zones: [{ kind: 'water', poly: rect(10, 90, 80, 106) }, { kind: 'sand', poly: rect(0, 62, 80, 67) }],
      jumps: [{ x: 40, y: 110, dir: deg(-90), w: 12, len: 10, minSpeed: 42, lift: 0.3 }],
      low: [rect(10, 88.4, 80, 90)],
      winds: [{ poly: rect(0, 88, 80, 108), dir: Math.PI, force: 60, period: 4.4, on: 1.6, warn: 1.2 }],
      blocks: [rect(24, 56, 56, 60), rect(24, 26, 36, 30), rect(44, 26, 56, 30)],
      gates: [
        { a: { x: 24, y: 58 }, b: { x: 12, y: 58 }, period: 4, open: 1.2 },
        { a: { x: 56, y: 58 }, b: { x: 68, y: 58 }, period: 4, open: 1.2, phase: 2 },
        { a: { x: 36, y: 28 }, b: { x: 44, y: 28 }, period: 3.6, open: 1.3, phase: 1 },
      ],
      arms: [
        { x: 24, y: 36, len: 9, a0: deg(15), amp: deg(-45), period: 2.4, kind: 'flipper' },
        { x: 56, y: 36, len: 9, a0: deg(165), amp: deg(45), period: 2.4, phase: 1.2, kind: 'flipper' },
      ],
      turntables: [{ x: 40, y: 45, r: 9, omega: -1.1 }],
      bumpers: [{ x: 18, y: 78, r: 2.4, kind: 'trampoline' }, { x: 62, y: 78, r: 2.4, kind: 'trampoline' }],
      cupTrack: { x: 48, y: 12, period: 4.6 },
      tee: { x: 40, y: 130 }, cup: { x: 32, y: 12 },
      deco: [{ x: 5, y: 98, emoji: '🪜', size: 3 }, { x: 6, y: 70, emoji: '📡', size: 4 }],
    },
  ],
};
