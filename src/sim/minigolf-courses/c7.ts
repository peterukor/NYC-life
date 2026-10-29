// ⛳ Course 7 🗽 Liberty — STUB: one sample hole (a jump over the harbor,
// a portal, a gust, a magnet at the cup). Hole authors: fill to ten
// (guide: ./index.ts). The finale course: everything, combined, still fair.
import { box, deg, rect } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

export const course: CourseDef = {
  id: 'c7',
  name: 'Liberty',
  emoji: '🗽',
  stars: 5,
  blurb: 'Across the harbor to the torch. Everything you’ve learned.',
  theme: { turf: '#6fd3a8', stripe: '#63c69b', rail: '#f6f0dc', ink: '#13203a', bg: ['#1f5f7a', '#0f3347'], block: '#5f9e8f', accent: '#3fb8a0', art: 'liberty' },
  holes: [
    {
      id: 'lady-liberty', name: 'Lady Liberty', emoji: '🗽', par: 4, parTime: 16,
      tip: 'Fly the harbor or take the ferry. Gusts blow right; the torch magnet pushes.',
      outer: box(0, 0, 64, 124),
      zones: [{ kind: 'water', poly: rect(0, 58, 64, 70) }],
      jumps: [{ x: 32, y: 80, dir: deg(-90), w: 12, len: 10 }],
      portals: [{ a: { x: 10, y: 90 }, b: { x: 54, y: 46 }, oneWay: true }],
      winds: [{ poly: rect(0, 22, 64, 50), dir: 0, force: 45, period: 6, on: 2, warn: 1.4 }],
      magnets: [{ x: 30, y: 26, r: 9, strength: -55 }],
      low: [rect(4, 36, 24, 38)],
      tee: { x: 32, y: 112 }, cup: { x: 14, y: 16 },
    },
  ],
};
