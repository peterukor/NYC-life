// ⛳ Course 6 🌃 Rooftops at Night — STUB: one sample hole (flippers,
// magnets, a trampoline). Hole authors: fill to ten (guide: ./index.ts).
// Signature obstacles: flippers, magnets, trampolines and springs, jumps
// between roofs; searchlights sweep the sky (art).
import { box, deg } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

export const course: CourseDef = {
  id: 'c6',
  name: 'Rooftops at Night',
  emoji: '🌃',
  stars: 4,
  blurb: 'Pinball on the penthouse. Magnets, flippers, searchlights.',
  theme: { turf: '#2fbf9f', stripe: '#29ad90', rail: '#ffe9b0', ink: '#0d1024', bg: ['#141833', '#070914'], block: '#4b3f8f', accent: '#9b5de5', art: 'night' },
  holes: [
    {
      id: 'penthouse-pinball', name: 'Penthouse Pinball', emoji: '🪩', par: 3, parTime: 13,
      tip: 'Flippers fire when they glow. The left magnet grabs, the right one shoves.',
      outer: box(0, 0, 60, 116),
      arms: [
        { x: 10, y: 66, len: 13, a0: deg(30), amp: deg(-55), period: 2.4, kind: 'flipper' },
        { x: 50, y: 66, len: 13, a0: deg(150), amp: deg(55), period: 2.4, phase: 1.2, kind: 'flipper' },
      ],
      magnets: [{ x: 15, y: 30, r: 10, strength: 55 }, { x: 45, y: 30, r: 9, strength: -60 }],
      bumpers: [{ x: 30, y: 58, r: 3, kind: 'trampoline' }, { x: 30, y: 36, r: 2, kind: 'post' }],
      tee: { x: 30, y: 102 }, cup: { x: 30, y: 16 },
    },
  ],
};
