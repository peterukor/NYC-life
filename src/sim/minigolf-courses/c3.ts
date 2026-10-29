// ⛳ Course 3 🚇 Underground — STUB: one sample hole (portals, a train
// crossing, a rising tide). Hole authors: replace or keep it and fill the
// course to ten holes (guide: ./index.ts). Signature obstacles: portals,
// trains (cabs with mode 'loop', kind 'train'), tides, grates, belts.
import { box, rect } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

export const course: CourseDef = {
  id: 'c3',
  name: 'Underground',
  emoji: '🚇',
  stars: 3,
  blurb: 'Portals between platforms, trains, and the tide in the tunnels.',
  theme: { turf: '#3fbf8f', stripe: '#38b083', rail: '#e9e4d4', ink: '#141826', bg: ['#2b2f3a', '#16181f'], block: '#c9a227', accent: '#3c8dde', art: 'subway' },
  holes: [
    {
      id: 'canal-st', name: 'Canal St Transfer', emoji: '🚉', par: 3, parTime: 12,
      tip: 'Mind the train. The portal skips the tracks, if the tide lets you.',
      outer: box(0, 0, 60, 110),
      zones: [{ kind: 'track', poly: rect(0, 50, 60, 62) }],
      cabs: [{ ax: -40, ay: 56, bx: 160, by: 56, w: 26, h: 9, period: 7, phase: 0, mode: 'loop', kind: 'train', warn: 1.5 }],
      portals: [{ a: { x: 46, y: 86 }, b: { x: 46, y: 32 } }],
      tides: [{ x0: 34, y0: 72, x1: 60, y1: 100, from: 'right', lo: 0.1, hi: 0.95, period: 6 }],
      tee: { x: 14, y: 98 }, cup: { x: 28, y: 16 },
    },
  ],
};
