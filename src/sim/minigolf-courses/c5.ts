// ⛳ Course 5 🏗️ The Construction Site — STUB: one sample hole
// (a crumbling wall, a crane beam, a belt). Hole authors: fill to ten
// (guide: ./index.ts). Signature obstacles: crumbles, beam movers and
// loop beams, belts, switches, moving walls.
import { box, rect } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

export const course: CourseDef = {
  id: 'c5',
  name: 'The Construction Site',
  emoji: '🏗️',
  stars: 4,
  blurb: 'Knock walls down, dodge the crane beams, ride the belts.',
  theme: { turf: '#8cc63f', stripe: '#80b938', rail: '#ffd23f', ink: '#1c1c1c', bg: ['#5a4a3a', '#3a2f25'], block: '#9a9a9a', accent: '#f28c28', art: 'construction' },
  holes: [
    {
      id: 'hard-hat', name: 'Hard Hat Area', emoji: '👷', par: 3, parTime: 13,
      tip: 'Two good knocks bring the wall down. Or squeeze round the right.',
      outer: box(0, 0, 60, 112),
      blocks: [rect(0, 54, 14, 58), rect(46, 54, 51, 58)],
      crumbles: [{ poly: rect(14, 54, 46, 58), hits: 2 }],
      movers: [{ a: { x: 4, y: 30 }, b: { x: 24, y: 30 }, dx: 32, dy: 0, period: 5, w: 3, kind: 'beam' }],
      conveyors: [{ poly: rect(0, 74, 44, 84), dir: 0, speed: 18 }],
      tee: { x: 20, y: 100 }, cup: { x: 30, y: 14 },
    },
  ],
};
