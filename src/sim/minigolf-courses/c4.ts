// ⛳ Course 4 🌉 The Bridges — STUB: one sample hole (a wind gust,
// a swinging cable, a sliding cup). Hole authors: fill to ten (guide:
// ./index.ts). Signature obstacles: winds, cable arms, jumps over water,
// ramps, a cup on a track.
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
      id: 'brooklyn-gusts', name: 'Brooklyn Bridge Gusts', emoji: '💨', par: 4, parTime: 15,
      tip: 'Streamers flutter before a gust. The cable swings, the cup slides.',
      outer: box(0, 0, 56, 120),
      zones: [{ kind: 'water', poly: rect(0, 70, 9, 96) }, { kind: 'water', poly: rect(47, 70, 56, 96) }],
      winds: [{ poly: rect(0, 40, 56, 62), dir: 0, force: 60, period: 5, on: 2, warn: 1.2 }],
      arms: [{ x: 28, y: 82, len: 12, a0: deg(0), amp: deg(70), period: 3.2, kind: 'cable' }],
      cupTrack: { x: 40, y: 16, period: 6 },
      tee: { x: 28, y: 108 }, cup: { x: 16, y: 16 },
    },
  ],
};
