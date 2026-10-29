// ⛳ Course 3 🚇 Underground — portals, trains, tides and belts. One new
// toy per hole to start (a portal, a train, the tide, the escalators),
// then they pair up: two tracks at once, the Canal St transfer, the car
// doors, magnets that pull you onto the wrong train, a switch that turns
// the escalator round, and a last ride out to Coney Island.
//
// Every track sits in a shallow trackbed (a gentle ramp back toward the
// tee side), so a ball never parks on the rails waiting to be shoved.
import { box, deg, rect, type Zone } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

/** A train crossing left to right on a horizontal track centred at y. */
const train = (y: number, period: number, phase = 0, w = 26, x0 = -40, x1 = 110) =>
  ({ ax: x0, ay: y, bx: x1, by: y, w, h: 9, period, phase, mode: 'loop' as const, kind: 'train' as const, warn: 1.5 });
/** Rails across x0…x1 from y0 to y1, in a trackbed that rolls a stopped ball back down (+y). */
const tracks = (x0: number, y0: number, x1: number, y1: number): Zone[] => [
  { kind: 'track', poly: rect(x0, y0, x1, y1) },
  { kind: 'ramp', poly: rect(x0, y0, x1, y1), push: [0, 24] },
];

export const course: CourseDef = {
  id: 'c3',
  name: 'Underground',
  emoji: '🚇',
  stars: 3,
  blurb: 'Portals between platforms, trains, and the tide in the tunnels.',
  theme: { turf: '#3fbf8f', stripe: '#38b083', rail: '#e9e4d4', ink: '#141826', bg: ['#2b2f3a', '#16181f'], block: '#c9a227', accent: '#3c8dde', art: 'subway' },
  holes: [
    {
      // New: a portal. One way, blue in, orange out, turned round to face the cup.
      id: 'fulton', name: 'Fulton St Shortcut', emoji: '🌀', par: 3, parTime: 10,
      tip: 'Blue in, orange out. Or walk the long way round the top.',
      outer: box(0, 0, 60, 110),
      blocks: [rect(27, 32, 33, 110)],
      look: { block: '#c9a227', label: 'A C' },
      portals: [{ a: { x: 14, y: 60 }, b: { x: 46, y: 42 }, turn: deg(180), oneWay: true }],
      tee: { x: 14, y: 98 }, cup: { x: 46, y: 94 },
      deco: [{ x: 14, y: 80, emoji: '⬆️', size: 3.5 }],
    },
    {
      // New: a train. Lights flash, then it comes through. Cross between trains, through the gap in the far curb.
      id: 'shuttle', name: 'Times Sq Shuttle', emoji: '🚆', par: 3, parTime: 11,
      tip: 'Lights flash, then the Shuttle. Cross between trains.',
      outer: [[24, 0], [52, 0], [56, 4], [56, 64], [38, 64], [38, 108], [34, 112], [4, 112], [0, 108], [0, 48], [18, 48], [18, 6]],
      zones: [{ kind: 'track', poly: rect(0, 48, 56, 64) }, { kind: 'ramp', poly: rect(0, 48, 38, 64), push: [0, 24] }, { kind: 'ramp', poly: rect(38, 48, 56, 64), push: [-24, 0] }],
      low: [rect(18, 46.4, 38, 48)],
      cabs: [train(55, 5.5, 0, 26, -34, 90)],
      bumpers: [{ x: 30, y: 30, r: 2.2, kind: 'post' }, { x: 44, y: 30, r: 2.2, kind: 'post' }],
      tee: { x: 16, y: 100 }, cup: { x: 38, y: 13 },
      deco: [{ x: 8, y: 70, emoji: '🚏', size: 4.5 }],
    },
    {
      // New: the tide. It floods the tunnel from the far end; cross while it's out, never stop inside.
      id: 'south-ferry', name: 'South Ferry Flood', emoji: '🌊', par: 3, parTime: 11,
      tip: 'Go while the tide is out. Never stop in the tunnel.',
      outer: [[4, 0], [56, 0], [60, 4], [60, 36], [56, 40], [40, 40], [40, 72], [56, 72], [60, 76], [60, 108], [56, 112], [4, 112], [0, 108], [0, 76], [4, 72], [20, 72], [20, 40], [4, 40], [0, 36], [0, 4]],
      tides: [{ x0: 20, y0: 40, x1: 40, y1: 72, from: 'left', lo: 0, hi: 1, period: 6 }],
      zones: [{ kind: 'sand', circle: { x: 48, y: 15, r: 6 } }],
      tee: { x: 30, y: 100 }, cup: { x: 10, y: 14 },
      deco: [{ x: 50, y: 96, emoji: '⛴️', size: 5 }],
    },
    {
      // New: belts. The up escalator carries you, the stairs are a climb, the down escalator says no.
      id: 'smith-9th', name: 'Smith–9th Escalators', emoji: '🛗', par: 3, parTime: 11,
      tip: 'Ride the up escalator, or take the stairs if you’ve got the legs.',
      outer: box(0, 0, 60, 112),
      blocks: [rect(18, 40, 22, 78), rect(38, 40, 42, 78)],
      look: { block: '#8e9aaf' },
      conveyors: [
        { poly: rect(0, 40, 18, 78), dir: deg(90), speed: 32 },
        { poly: rect(42, 40, 60, 78), dir: deg(-90), speed: 32 },
      ],
      zones: [{ kind: 'ramp', poly: rect(22, 40, 38, 78), push: [0, 40] }],
      tee: { x: 30, y: 100 }, cup: { x: 14, y: 16 },
      deco: [{ x: 30, y: 34, emoji: '🪜', size: 4 }],
    },
    {
      // Magnets pull a slow ball into the side portals, which drop it back at the start.
      id: 'atlantic', name: 'Atlantic Av Wrong Train', emoji: '🧲', par: 3, parTime: 11,
      tip: 'Roll past the magnets with pace, or ride back to the start.',
      outer: [[26, 0], [38, 0], [64, 22], [64, 92], [38, 120], [26, 120], [0, 92], [0, 22]],
      blocks: [rect(18, 44, 46, 64)],
      look: { block: '#c9a227', label: 'BARCLAYS' },
      magnets: [{ x: 6, y: 54, r: 15, strength: 70 }, { x: 58, y: 54, r: 15, strength: 70 }],
      portals: [
        { a: { x: 6, y: 54 }, b: { x: 14, y: 94 }, turn: deg(180), oneWay: true },
        { a: { x: 58, y: 54 }, b: { x: 50, y: 94 }, turn: deg(180), oneWay: true },
      ],
      zones: [{ kind: 'sand', circle: { x: 14, y: 96, r: 7 } }, { kind: 'sand', circle: { x: 50, y: 96, r: 7 } }],
      tee: { x: 32, y: 108 }, cup: { x: 32, y: 12 },
    },
    {
      // Portal + train + tide: the shortcut keeps your heading, but the tide covers it half the time.
      id: 'canal-st', name: 'Canal St Transfer', emoji: '🚉', par: 3, parTime: 12,
      tip: 'Mind the train. The portal skips the tracks, if the tide lets you.',
      outer: box(0, 0, 60, 110),
      zones: tracks(0, 50, 60, 62),
      blocks: [rect(20, 30, 60, 35)],
      look: { block: '#c9a227', label: 'CANAL' },
      cabs: [train(56, 7, 0, 26, -40, 160)],
      portals: [{ a: { x: 48, y: 86 }, b: { x: 12, y: 28 }, oneWay: true }],
      tides: [{ x0: 34, y0: 72, x1: 60, y1: 100, from: 'right', lo: 0.1, hi: 0.95, period: 6 }],
      tee: { x: 14, y: 98 }, cup: { x: 50, y: 15 },
      deco: [{ x: 8, y: 20, emoji: '👜', size: 4 }],
    },
    {
      // Two tracks: the local, then the express (twice as often). The far curbs have one gap each.
      id: 'express-local', name: 'Express or Local', emoji: '🚄', par: 4, parTime: 16,
      tip: 'Local first, then the express. Each curb has one gap.',
      outer: [[22, 0], [56, 0], [60, 4], [60, 120], [56, 124], [18, 124], [0, 106], [0, 22]],
      zones: [...tracks(0, 80, 60, 92), ...tracks(0, 40, 60, 52)],
      low: [rect(0, 78.4, 38, 80), rect(22, 38.4, 60, 40)],
      cabs: [train(86, 7, 0, 30, -40, 100), train(46, 5, 0, 20, -30, 100), train(46, 5, 2.5, 20, -30, 100)],
      bumpers: [{ x: 30, y: 66, r: 2, kind: 'post' }, { x: 36, y: 18, r: 2, kind: 'post' }],
      tee: { x: 47, y: 112 }, cup: { x: 50, y: 15 },
      deco: [{ x: 10, y: 66, emoji: '🧍', size: 4 }],
    },
    {
      // Subway doors: in one, through the car, out the other. They open together.
      id: 'stand-clear', name: 'Stand Clear of the Doors', emoji: '🚪', par: 3, parTime: 14,
      tip: 'In one door, through the car, out the other. They open together.',
      outer: [[10, 0], [50, 0], [54, 4], [54, 44], [60, 44], [60, 70], [54, 70], [54, 112], [50, 116], [10, 116], [6, 112], [6, 70], [0, 70], [0, 44], [6, 44], [6, 4]],
      blocks: [rect(0, 66, 10, 70), rect(21, 66, 60, 70), rect(0, 44, 39, 48), rect(50, 44, 60, 48)],
      look: { block: '#9aa3b5' },
      gates: [
        { a: { x: 10, y: 68 }, b: { x: 21, y: 68 }, period: 5, open: 2.4, kind: 'door' },
        { a: { x: 50, y: 46 }, b: { x: 39, y: 46 }, period: 5, open: 2.4, kind: 'door' },
      ],
      bumpers: [{ x: 30, y: 57, r: 1.6, kind: 'post' }],
      tee: { x: 15, y: 104 }, cup: { x: 45, y: 16 },
    },
    {
      // A switch turns the escalator round. Until then it runs down.
      id: 'jay-st', name: 'Jay St Switchback', emoji: '🔘', par: 4, parTime: 16,
      tip: 'The escalator runs down. Hit the button to turn it round.',
      outer: box(0, 0, 60, 124),
      zones: tracks(0, 88, 60, 100),
      cabs: [train(94, 6, 0, 26, -34, 100)],
      conveyors: [
        { poly: rect(0, 40, 60, 70), dir: deg(90), speed: 40, sw: { id: 'A', active: 'off' } },
        { poly: rect(0, 40, 60, 70), dir: deg(-90), speed: 40, sw: { id: 'A', active: 'on' } },
      ],
      switches: [{ id: 'A', x: 8, y: 112, mode: 'once' }],
      blocks: [rect(0, 26, 26, 30)],
      look: { block: '#8e9aaf' },
      tee: { x: 46, y: 112 }, cup: { x: 10, y: 14 },
    },
    {
      // The finale: the tide on the beach, the boardwalk belt, the F train, the Wonder Wheel.
      id: 'coney', name: 'Last Stop Coney Island', emoji: '🎡', par: 5, parTime: 22,
      tip: 'Beat the tide, ride the boardwalk, dodge the F, round the Wonder Wheel.',
      outer: box(0, 0, 76, 136),
      blocks: [rect(16, 86, 76, 96), rect(0, 40, 60, 50), rect(24, 0, 30, 26)],
      look: { block: '#e2553f' },
      tides: [{ x0: 0, y0: 100, x1: 50, y1: 132, from: 'bottom', lo: 0, hi: 0.9, period: 6 }],
      zones: tracks(0, 58, 76, 70),
      cabs: [train(64, 6, 0, 26, -34, 110)],
      conveyors: [{ poly: rect(16, 74, 58, 84), dir: 0, speed: 30 }],
      turntables: [{ x: 46, y: 20, r: 10, omega: 1 }],
      tee: { x: 64, y: 124 }, cup: { x: 12, y: 14 },
    },
  ],
};
