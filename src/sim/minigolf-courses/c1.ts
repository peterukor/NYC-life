// ⛳ Course 1 🌳 The Park — the warm-up. Straight lines and gentle reads:
// sand, water, a ramp, then one new toy at a time (bumpers, ice, the
// carousel, a fountain to go round) and a jump over the stream to finish.
// Reference course for authors: see the guide in ./index.ts.
import { box, deg, rect, type Pt } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

const hedge = (x0: number, y0: number, x1: number, y1: number): Pt[] => rect(x0, y0, x1, y1);

export const course: CourseDef = {
  id: 'c1',
  name: 'The Park',
  emoji: '🌳',
  stars: 1,
  blurb: 'Warm-up on the east lawn. Sand, a pond, the carousel.',
  theme: { turf: '#4fd36a', stripe: '#46c560', rail: '#fff4dc', ink: '#1c2340', bg: ['#2f6b3f', '#1f4a2c'], block: '#c0703f', accent: '#2fbf71', art: 'park' },
  holes: [
    {
      id: 'walkup', name: 'Park Drive Warm-Up', emoji: '🏃', par: 2, parTime: 6,
      tip: 'Straight shot. Stretch first.',
      outer: box(0, 0, 30, 90),
      tee: { x: 15, y: 80 }, cup: { x: 15, y: 14 },
      deco: [{ x: -3, y: 30, emoji: '🌳', size: 7 }, { x: 33, y: 64, emoji: '🌳', size: 6 }],
    },
    {
      id: 'dogleg', name: 'Dogleg on the Mall', emoji: '↪️', par: 3, parTime: 9,
      tip: 'Turns right at the top. The cut corner banks.',
      outer: [[0, 12], [12, 0], [70, 0], [70, 30], [28, 30], [28, 100], [0, 100]],
      tee: { x: 14, y: 90 }, cup: { x: 60, y: 15 },
      zones: [{ kind: 'path', poly: rect(4, 2, 70, 28) }],
      deco: [{ x: 50, y: 60, emoji: '🌳', size: 12 }, { x: 40, y: 85, emoji: '🐿️', size: 5 }],
    },
    {
      // New: bumpers. The straight line is blocked; any bank off them works.
      id: 'great-lawn', name: 'Great Lawn Bumpers', emoji: '🥏', par: 3, parTime: 9,
      tip: 'Pink bumpers kick. Use them or go round.',
      outer: box(0, 0, 56, 96),
      tee: { x: 28, y: 86 }, cup: { x: 28, y: 14 },
      bumpers: [
        { x: 28, y: 50, r: 2.6, kind: 'bumper' },
        { x: 17, y: 38, r: 2.4, kind: 'bumper' },
        { x: 39, y: 38, r: 2.4, kind: 'bumper' },
        { x: 28, y: 28, r: 2, kind: 'post' },
      ],
      deco: [{ x: 10, y: 70, emoji: '🧺', size: 5 }, { x: 46, y: 72, emoji: '🥏', size: 4 }],
    },
    {
      id: 'sand', name: 'Sheep Meadow Bunkers', emoji: '🏖️', par: 3, parTime: 9,
      tip: 'Round the hot dog cart. Sand eats putts.',
      outer: box(0, 0, 60, 100),
      blocks: [rect(22, 44, 38, 58)],
      look: { block: '#e2553f', label: 'HOT DOGS' },
      zones: [
        { kind: 'sand', circle: { x: 14, y: 20, r: 8 } },
        { kind: 'sand', circle: { x: 46, y: 20, r: 8 } },
        { kind: 'sand', poly: rect(20, 64, 40, 71) },
      ],
      tee: { x: 30, y: 90 }, cup: { x: 30, y: 14 },
      deco: [{ x: 30, y: 40, emoji: '🌭', size: 4 }],
    },
    {
      // New: ice. A soft touch: the rink barely slows anything.
      id: 'wollman', name: 'Wollman Rink', emoji: '⛸️', par: 3, parTime: 10,
      tip: 'Ice keeps it rolling. Barely touch it.',
      outer: box(0, 0, 50, 104),
      zones: [{ kind: 'ice', poly: box(5, 26, 45, 72, 6) }],
      bumpers: [{ x: 16, y: 44, r: 1.6, kind: 'cone' }, { x: 34, y: 54, r: 1.6, kind: 'cone' }, { x: 25, y: 36, r: 1.6, kind: 'cone' }],
      tee: { x: 25, y: 92 }, cup: { x: 25, y: 14 },
      deco: [{ x: 10, y: 64, emoji: '⛸️', size: 4 }, { x: 40, y: 32, emoji: '❄️', size: 4 }],
    },
    {
      id: 'pond', name: 'Turtle Pond', emoji: '🐢', par: 3, parTime: 10,
      tip: 'Take the footbridge or the long way. The pond takes a stroke.',
      outer: box(0, 0, 56, 105),
      zones: [
        { kind: 'water', poly: rect(8, 44, 22, 62) },
        { kind: 'water', poly: rect(28, 44, 56, 62) },
      ],
      tee: { x: 46, y: 94 }, cup: { x: 12, y: 14 },
      deco: [{ x: 40, y: 53, emoji: '🐢', size: 4 }, { x: 14, y: 52, emoji: '🦆', size: 4 }],
    },
    {
      id: 'bow-bridge', name: 'Bow Bridge', emoji: '🌉', par: 3, parTime: 9,
      tip: 'Uphill. Too soft and it rolls right back to you.',
      outer: box(0, 0, 50, 112),
      zones: [{ kind: 'ramp', poly: rect(0, 42, 50, 72), push: [0, 38] }],
      blocks: [rect(19, 29, 31, 33)],
      look: { block: '#b46b4a', label: '🌉' },
      bumpers: [{ x: 10, y: 26, r: 2.5, kind: 'bumper' }, { x: 40, y: 26, r: 2.5, kind: 'bumper' }],
      tee: { x: 25, y: 100 }, cup: { x: 25, y: 16 },
    },
    {
      // New: a turntable. It bends whatever crosses it, and carries a ball that stops on it.
      id: 'carousel', name: 'The Carousel', emoji: '🎠', par: 3, parTime: 11,
      tip: 'The carousel spins your ball. Firm and straight, or ride it round.',
      outer: box(0, 0, 60, 100),
      blocks: [rect(0, 47, 14, 57), rect(46, 47, 60, 57)],
      look: { block: '#d9a441' },
      turntables: [{ x: 30, y: 52, r: 14, omega: 0.9 }],
      tee: { x: 30, y: 90 }, cup: { x: 30, y: 14 },
      deco: [{ x: 7, y: 70, emoji: '🎈', size: 4 }, { x: 53, y: 30, emoji: '🎠', size: 5 }],
    },
    {
      id: 'bethesda', name: 'Bethesda Fountain', emoji: '⛲', par: 3, parTime: 10,
      tip: 'Round the fountain, left or right. Bumpers guard both lanes.',
      outer: box(0, 0, 64, 104),
      zones: [{ kind: 'water', circle: { x: 32, y: 52, r: 10 } }, { kind: 'path', circle: { x: 32, y: 52, r: 13 } }],
      bumpers: [{ x: 11, y: 40, r: 2.4, kind: 'bumper' }, { x: 53, y: 64, r: 2.4, kind: 'bumper' }, { x: 32, y: 30, r: 1.8, kind: 'post' }],
      tee: { x: 32, y: 92 }, cup: { x: 32, y: 14 },
      deco: [{ x: 32, y: 52, emoji: '⛲', size: 7 }, { x: 58, y: 20, emoji: '🌳', size: 6 }],
    },
    {
      // New: a jump. Fly the stream from the ramp, or take the footbridge on the left.
      id: 'ramble', name: 'Ramble Jump', emoji: '🪨', par: 4, parTime: 14,
      tip: 'Hit the ramp hard to fly the stream. Or the footbridge, the long way.',
      outer: box(0, 0, 64, 126),
      zones: [
        { kind: 'water', poly: rect(10, 56, 64, 68) },
        { kind: 'sand', circle: { x: 22, y: 24, r: 6 } },
        { kind: 'hill', circle: { x: 46, y: 36, r: 7 }, lift: 26 },
      ],
      low: [hedge(14, 86, 32, 88)],
      jumps: [{ x: 42, y: 76, dir: deg(-90), w: 10, len: 10, minSpeed: 45 }],
      tee: { x: 52, y: 112 }, cup: { x: 50, y: 14 },
      deco: [{ x: 5, y: 62, emoji: '🪵', size: 4 }, { x: 4, y: 100, emoji: '🌲', size: 6 }, { x: 60, y: 92, emoji: '🌲', size: 6 }],
    },
  ],
};
