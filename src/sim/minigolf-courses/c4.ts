// ⛳ Course 4 🌉 The Bridges — wind, cables, water and air. The river is
// the hazard now: decks with water at the edges, gusts that push you
// toward it, cables that swing across the walkway, jumps between the
// spans, a drawbridge, and a cup that rides the tram.
import { box, deg, rect } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

export const course: CourseDef = {
  id: 'c4',
  name: 'The Bridges',
  emoji: '🌉',
  stars: 3,
  blurb: 'Gusts off the East River, swinging cables, a cup that won’t sit still.',
  theme: { turf: '#56c98d', stripe: '#4dbb81', rail: '#f4ead2', ink: '#1a2238', bg: ['#2d4f73', '#1b3350'], block: '#a0522d', accent: '#4a90c2', art: 'bridges' },
  holes: [
    {
      // New: wind. Streamers flutter, then a gust pushes toward the river. Putt in the calm.
      id: 'promenade', name: 'Brooklyn Promenade', emoji: '💨', par: 3, parTime: 11,
      tip: 'Streamers flutter before a gust. Putt in the calm.',
      outer: [[4, 0], [60, 0], [64, 4], [64, 26], [60, 30], [42, 30], [42, 112], [38, 116], [4, 116], [0, 112], [0, 4]],
      zones: [{ kind: 'water', poly: rect(32, 40, 42, 82) }, { kind: 'water', poly: rect(0, 40, 6, 82) }],
      winds: [{ poly: rect(6, 40, 32, 82), dir: 0, force: 80, period: 5, on: 2, warn: 1.2 }],
      bumpers: [{ x: 21, y: 18, r: 1.8, kind: 'post' }, { x: 40, y: 8, r: 1.8, kind: 'post' }],
      tee: { x: 20, y: 104 }, cup: { x: 54, y: 15 },
      deco: [{ x: 52, y: 60, emoji: '🌳', size: 8 }],
    },
    {
      // New: cables. Each swings from its tower like a pendulum; slip past on the far side or between swings.
      id: 'manhattan-cables', name: 'Manhattan Bridge Cables', emoji: '🎐', par: 3, parTime: 12,
      tip: 'Cables swing across the deck. Slip past when they swing away.',
      outer: [[4, 0], [36, 0], [40, 4], [40, 110], [30, 124], [10, 124], [0, 110], [0, 4]],
      arms: [
        { x: 2, y: 46, len: 27, a0: 0, amp: deg(55), period: 3.6, kind: 'cable' },
        { x: 38, y: 78, len: 27, a0: deg(180), amp: deg(55), period: 3.6, phase: 1.8, kind: 'cable' },
      ],
      zones: [{ kind: 'water', circle: { x: 20, y: 22, r: 5 } }],
      tee: { x: 20, y: 112 }, cup: { x: 20, y: 9 },
    },
    {
      // New: the cup rides the tram, back and forth behind the station wall. Time it through the gap.
      id: 'tram', name: 'Roosevelt Island Tram', emoji: '🚡', par: 3, parTime: 12,
      tip: 'The cup rides the tram. Time it through the gap.',
      outer: [[14, 0], [42, 0], [56, 14], [56, 96], [42, 110], [14, 110], [0, 96], [0, 14]],
      zones: [{ kind: 'water', poly: rect(0, 50, 22, 64) }, { kind: 'water', poly: rect(34, 50, 56, 64) }],
      low: [rect(0, 27, 24, 29), rect(32, 27, 56, 29)],
      cupTrack: { x: 44, y: 16, period: 5 },
      tee: { x: 28, y: 98 }, cup: { x: 12, y: 16 },
    },
    {
      // Jump the East River, or take the bike lane round. Fly far: a short hop lands in the sandbar.
      id: 'williamsburg', name: 'Williamsburg Leap', emoji: '🛹', par: 3, parTime: 11,
      tip: 'Fly the river off the ramp, or take the bike lane like a local.',
      outer: [[4, 0], [52, 0], [58, 6], [58, 132], [54, 136], [4, 136], [0, 132], [0, 4]],
      zones: [
        { kind: 'water', poly: rect(0, 70, 42, 88) }, { kind: 'path', poly: rect(42, 30, 58, 104) },
        { kind: 'sand', poly: rect(0, 60, 42, 70) },
        { kind: 'hill', circle: { x: 20, y: 30, r: 9 }, lift: 26 },
      ],
      low: [rect(40.5, 30, 42, 66)],
      bumpers: [{ x: 12, y: 46, r: 1.8, kind: 'cone' }, { x: 30, y: 50, r: 1.8, kind: 'cone' }],
      jumps: [{ x: 20, y: 89, dir: deg(-90), w: 12, len: 10, minSpeed: 60 }],
      tee: { x: 20, y: 122 }, cup: { x: 22, y: 12 },
      deco: [{ x: 50, y: 112, emoji: '🚲', size: 4.5 }],
    },
    {
      // The drawbridge goes up and down. Wait for it, or jump the channel.
      id: 'drawbridge', name: 'Pulaski Drawbridge', emoji: '🚢', par: 3, parTime: 12,
      tip: 'Wait for the bridge to come down, or jump the gap.',
      outer: box(0, 0, 60, 120),
      zones: [{ kind: 'water', poly: rect(0, 52, 24, 70) }, { kind: 'water', poly: rect(36, 52, 60, 70) }, { kind: 'sand', circle: { x: 50, y: 12, r: 7 } }],
      gates: [{ a: { x: 24, y: 61 }, b: { x: 36, y: 61 }, period: 5, open: 1.8 }],
      jumps: [{ x: 50, y: 72, dir: deg(-90), w: 10, len: 10, minSpeed: 64 }],
      blocks: [rect(0, 24, 34, 28)],
      look: { block: '#8e9aaf' },
      tee: { x: 30, y: 106 }, cup: { x: 12, y: 13 },
    },
    {
      // Wind between the towers, a cable at the arches, and the cup sliding along the top.
      id: 'brooklyn-gusts', name: 'Brooklyn Bridge Gusts', emoji: '🌉', par: 4, parTime: 18,
      tip: 'Through the arches, past the cable. Don’t park in a gust.',
      outer: box(0, 0, 60, 128),
      blocks: [rect(0, 92, 12, 98), rect(22, 92, 38, 98), rect(48, 92, 60, 98), rect(0, 30, 12, 36), rect(22, 30, 38, 36), rect(48, 30, 60, 36)],
      look: { block: '#b07a4f' },
      zones: [{ kind: 'water', poly: rect(0, 44, 7, 84) }, { kind: 'water', poly: rect(54, 52, 60, 76) }],
      winds: [{ poly: rect(0, 40, 60, 88), dir: 0, force: 65, period: 5, on: 2, warn: 1.2 }],
      arms: [{ x: 30, y: 64, len: 15, a0: deg(0), amp: deg(75), period: 3.2, kind: 'cable' }],
      cupTrack: { x: 44, y: 14, period: 6 },
      tee: { x: 30, y: 114 }, cup: { x: 16, y: 14 },
    },
    {
      // Jump the Hudson in a crosswind: the gust carries a ball in the air too. The toll plaza guards the cup.
      id: 'gwb', name: 'GW Crosswind', emoji: '🌁', par: 3, parTime: 13,
      tip: 'The gust blows you sideways in the air too. Jump in the calm.',
      outer: [[4, 0], [56, 0], [60, 4], [60, 92], [48, 130], [12, 130], [0, 92], [0, 4]],
      zones: [{ kind: 'water', poly: rect(0, 50, 60, 74) }, { kind: 'sand', circle: { x: 52, y: 42, r: 5 } }],
      winds: [{ poly: rect(0, 42, 60, 92), dir: 0, force: 100, period: 5, on: 2, warn: 1.2 }],
      jumps: [{ x: 30, y: 76, dir: deg(-90), w: 14, len: 12, minSpeed: 72 }],
      blocks: [rect(20, 20, 40, 28)],
      look: { block: '#8e9aaf', label: 'TOLL' },
      tee: { x: 30, y: 116 }, cup: { x: 30, y: 10 },
    },
    {
      // Jump onto the tidal flats and putt before the tide comes back, fly the lot, or take the long way down the shelf.
      id: 'hell-gate', name: 'Hell Gate Flats', emoji: '🪨', par: 4, parTime: 16,
      tip: 'The left shelf stays dry. The flats don’t.',
      outer: [[4, 0], [60, 0], [64, 4], [64, 98], [56, 128], [8, 128], [0, 120], [0, 34], [5, 24], [0, 14], [0, 4]],
      zones: [{ kind: 'water', poly: rect(14, 66, 64, 80) }],
      tides: [{ x0: 14, y0: 34, x1: 64, y1: 66, from: 'right', lo: 0, hi: 1, period: 6 }],
      jumps: [{ x: 40, y: 82, dir: deg(-90), w: 14, len: 12, minSpeed: 58 }],
      bumpers: [{ x: 30, y: 48, r: 2.4, kind: 'cone' }, { x: 50, y: 54, r: 2.4, kind: 'cone' }],
      tee: { x: 40, y: 116 }, cup: { x: 44, y: 14 },
    },
    {
      // A gale on the long span, unless you hit the button out on the Bronx arm first.
      id: 'triborough', name: 'Triborough Junction', emoji: '🧭', par: 3, parTime: 14,
      tip: 'The gale stops for good once you hit the button. Or time it.',
      outer: [[28, 0], [48, 0], [52, 4], [52, 124], [48, 128], [28, 128], [24, 124], [24, 98], [4, 98], [0, 94], [0, 76], [4, 72], [24, 72], [24, 4]],
      zones: [{ kind: 'water', poly: rect(24, 28, 30, 66) }, { kind: 'water', poly: rect(46, 28, 52, 66) }],
      winds: [{ poly: rect(24, 26, 52, 68), dir: 0, force: 110, period: 4.5, on: 2.2, warn: 1.2, sw: { id: 'A', active: 'off' } }],
      switches: [{ id: 'A', x: 8, y: 85, mode: 'once' }],
      turntables: [{ x: 38, y: 85, r: 9, omega: 1 }],
      tee: { x: 38, y: 116 }, cup: { x: 38, y: 32 },
    },
    {
      // The finale: the river (drawbridge or jump, in a crosswind), the towers with a cable at one arch, the moving cup.
      id: 'verrazzano', name: 'Verrazzano Finale', emoji: '🏁', par: 5, parTime: 24,
      tip: 'Bridge or jump, then an arch. The cup is still moving.',
      outer: box(0, 0, 72, 140),
      zones: [{ kind: 'water', poly: rect(0, 72, 31, 88) }, { kind: 'water', poly: rect(41, 72, 72, 88) }],
      gates: [{ a: { x: 31, y: 80 }, b: { x: 41, y: 80 }, period: 5, open: 1.8 }],
      jumps: [{ x: 58, y: 90, dir: deg(-90), w: 10, len: 10, minSpeed: 61 }],
      winds: [{ poly: rect(0, 44, 72, 92), dir: deg(180), force: 80, period: 5, on: 2, warn: 1.2 }],
      arms: [{ x: 54, y: 47, len: 10, a0: deg(-90), amp: deg(60), period: 3, kind: 'cable' }],
      blocks: [rect(0, 34, 13, 40), rect(23, 34, 49, 40), rect(59, 34, 72, 40), rect(28, 54, 44, 60)],
      look: { block: '#c0504d' },
      bumpers: [{ x: 24, y: 110, r: 2, kind: 'post' }, { x: 48, y: 110, r: 2, kind: 'post' }],
      cupTrack: { x: 52, y: 14, period: 6.5 },
      tee: { x: 14, y: 128 }, cup: { x: 18, y: 14 },
    },
  ],
};
