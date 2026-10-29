// ⛳ Course 5 🏗️ The Construction Site — knock it down, swing round it,
// ride it. Crumbling walls and a crane boom first, then loop beams, the
// cement mixer, permits (switches), belts that take turns, a foundation
// pit to fly, the scaffolding zigzag and the topping-out finale, where
// every toy on site runs at once.
import { box, deg, rect } from '../minigolf.ts';
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
      // New: crumbling walls. Two good knocks and the plywood comes down.
      id: 'hard-hat', name: 'Hard Hat Area', emoji: '👷', par: 3, parTime: 12,
      tip: 'Two good knocks bring the wall down. Or squeeze round the right.',
      outer: box(0, 0, 60, 112),
      blocks: [rect(0, 54, 14, 58), rect(46, 54, 51, 58)],
      crumbles: [{ poly: rect(14, 54, 46, 58), hits: 2 }],
      movers: [{ a: { x: 4, y: 30 }, b: { x: 24, y: 30 }, dx: 32, dy: 0, period: 5, w: 3, kind: 'beam' }],
      conveyors: [{ poly: rect(0, 74, 44, 84), dir: 0, speed: 18 }],
      tee: { x: 20, y: 100 }, cup: { x: 30, y: 14 },
      deco: [{ x: 54, y: 90, emoji: '🚧', size: 4 }, { x: 6, y: 40, emoji: '🦺', size: 4 }],
    },
    {
      // New: the crane boom. It swings like a pendulum; the low lane is clear while it's swung out.
      id: 'swing-shift', name: 'Swing Shift', emoji: '🪝', par: 3, parTime: 12,
      tip: 'Up to the corner, then go low while the boom swings high.',
      outer: [[0, 18], [18, 0], [80, 0], [84, 4], [84, 26], [80, 30], [30, 30], [30, 108], [26, 112], [4, 112], [0, 108]],
      arms: [{ x: 48, y: 1, len: 26, a0: deg(90), amp: deg(50), period: 3.6, kind: 'boom', w: 2 }],
      zones: [{ kind: 'sand', circle: { x: 64, y: 6, r: 5 } }],
      bumpers: [{ x: 15, y: 60, r: 1.6, kind: 'cone' }],
      tee: { x: 15, y: 100 }, cup: { x: 74, y: 17 },
      deco: [{ x: 22, y: 82, emoji: '🧱', size: 4 }],
    },
    {
      // New: loop beams. Steel rides across on the crane and leaves; lights flash before each one.
      id: 'steel-delivery', name: 'Steel Delivery', emoji: '🔩', par: 3, parTime: 14,
      tip: 'Three beams fly across. Watch the lights, cross behind them.',
      outer: box(0, 0, 62, 128),
      zones: [
        { kind: 'track', poly: rect(0, 87, 62, 97) }, { kind: 'track', poly: rect(0, 61, 62, 71) }, { kind: 'track', poly: rect(0, 35, 62, 45) },
      ],
      cabs: [
        { ax: -18, ay: 92, bx: 80, by: 92, w: 28, h: 4, period: 2.6, phase: 0, mode: 'loop', kind: 'beam', warn: 1 },
        { ax: 82, ay: 66, bx: -20, by: 66, w: 30, h: 4, period: 3.2, phase: 1.5, mode: 'loop', kind: 'beam', warn: 1 },
        { ax: -18, ay: 40, bx: 80, by: 40, w: 28, h: 4, period: 2.2, phase: 0.7, mode: 'loop', kind: 'beam', warn: 1 },
      ],
      bumpers: [{ x: 16, y: 79, r: 1.6, kind: 'cone' }, { x: 46, y: 79, r: 1.6, kind: 'cone' }, { x: 31, y: 53, r: 1.8, kind: 'post' }, { x: 27, y: 22, r: 1.8, kind: 'post' }],
      tee: { x: 31, y: 116 }, cup: { x: 22, y: 14 },
      deco: [{ x: 6, y: 106, emoji: '🏗️', size: 5 }],
    },
    {
      // The cement mixer turns you round the bend. Or knock a window through the divider.
      id: 'mixer', name: 'Cement Mixer', emoji: '🚚', par: 4, parTime: 15,
      tip: 'Ride the mixer round the top. Or three knocks through the plywood.',
      outer: box(0, 0, 72, 120),
      blocks: [rect(32, 40, 40, 64), rect(32, 78, 40, 120)],
      crumbles: [{ poly: rect(32, 64, 40, 78), hits: 3 }],
      turntables: [{ x: 36, y: 20, r: 17, omega: 1 }],
      conveyors: [{ poly: rect(0, 44, 32, 56), dir: deg(90), speed: 22 }],
      movers: [{ a: { x: 42, y: 90 }, b: { x: 54, y: 90 }, dx: 16, dy: 0, period: 3.6, w: 3, kind: 'beam' }],
      zones: [{ kind: 'sand', circle: { x: 62, y: 112, r: 4 } }],
      tee: { x: 16, y: 108 }, cup: { x: 56, y: 104 },
      deco: [{ x: 64, y: 50, emoji: '🪣', size: 4 }, { x: 8, y: 80, emoji: '🧱', size: 4 }],
    },
    {
      // New on site: a switch. The permit (in the sandpit) opens the door. It's a toggle: once is enough.
      id: 'permit', name: 'Permit Pending', emoji: '📋', par: 4, parTime: 16,
      tip: 'Roll over the permit 🔘 to open the door. Or knock the wall down yourself.',
      outer: box(0, 0, 72, 124),
      blocks: [rect(0, 64, 20, 68), rect(32, 64, 56, 68)],
      crumbles: [{ poly: rect(20, 64, 32, 68), hits: 2 }],
      gates: [{ a: { x: 56, y: 66 }, b: { x: 72, y: 66 }, kind: 'door', sw: { id: 'A', active: 'off' } }],
      switches: [{ id: 'A', x: 60, y: 102 }],
      zones: [{ kind: 'sand', circle: { x: 60, y: 102, r: 7 } }, { kind: 'sand', circle: { x: 44, y: 22, r: 5 } }],
      movers: [{ a: { x: 40, y: 44 }, b: { x: 56, y: 44 }, dx: -36, dy: 0, period: 4, w: 3, kind: 'beam' }],
      bumpers: [{ x: 30, y: 32, r: 1.8, kind: 'post' }],
      tee: { x: 14, y: 112 }, cup: { x: 16, y: 16 },
      deco: [{ x: 66, y: 116, emoji: '📋', size: 4 }, { x: 8, y: 52, emoji: '🚧', size: 4 }],
    },
    {
      // Belts that run the wrong way until you flip them: 🔘A fixes the middle belt, 🔘B the top one.
      id: 'rebar', name: 'Rebar Sorting', emoji: '🛗', par: 4, parTime: 17,
      tip: 'The belts run against you. Roll over 🔘A, then 🔘B, and ride.',
      outer: box(0, 0, 80, 112),
      blocks: [rect(0, 72, 64, 76), rect(16, 38, 80, 42)],
      conveyors: [
        { poly: rect(16, 48, 64, 66), dir: 0, speed: 24, sw: { id: 'A', active: 'off' } },
        { poly: rect(16, 48, 64, 66), dir: Math.PI, speed: 24, sw: { id: 'A', active: 'on' } },
        { poly: rect(16, 8, 62, 30), dir: Math.PI, speed: 24, sw: { id: 'B', active: 'off' } },
        { poly: rect(16, 8, 62, 30), dir: 0, speed: 24, sw: { id: 'B', active: 'on' } },
      ],
      switches: [{ id: 'A', x: 40, y: 92 }, { id: 'B', x: 8, y: 57 }],
      tee: { x: 10, y: 100 }, cup: { x: 71, y: 18 },
      deco: [{ x: 72, y: 100, emoji: '🧱', size: 4 }],
    },
    {
      // Breather: lunch. Dirt mounds roll you off; the halal cart line is not moving.
      id: 'lunch', name: 'Halal Cart Lunch', emoji: '🥙', par: 3, parTime: 11,
      tip: 'The dirt mounds shrug a slow ball off. Hit through them.',
      outer: [[0, 44], [40, 4], [44, 0], [76, 0], [76, 66], [36, 106], [32, 110], [0, 110]],
      blocks: [rect(52, 64, 62, 74)],
      look: { label: 'HALAL' },
      zones: [
        { kind: 'hill', circle: { x: 28, y: 64, r: 9 }, lift: 26 },
        { kind: 'hill', circle: { x: 50, y: 38, r: 7 }, lift: 24 },
        { kind: 'sand', circle: { x: 40, y: 18, r: 5 } },
      ],
      bumpers: [{ x: 20, y: 86, r: 1.6, kind: 'cone' }],
      tee: { x: 14, y: 98 }, cup: { x: 62, y: 14 },
      deco: [{ x: 57, y: 60, emoji: '🥙', size: 4 }, { x: 10, y: 60, emoji: '🦺', size: 4 }],
    },
    {
      // Fly the flooded foundation, dodge the beam on landing, then get round the half-built wall.
      id: 'foundation', name: 'Foundation Pit', emoji: '🕳️', par: 4, parTime: 17,
      tip: 'Hit the ramp hard to fly the pit. Or the plank, between boom swings.',
      outer: box(0, 0, 70, 130),
      zones: [{ kind: 'water', poly: rect(14, 50, 70, 80) }, { kind: 'track', poly: rect(0, 31, 70, 41) }],
      jumps: [{ x: 48, y: 82, dir: deg(-90), w: 12, len: 10, minSpeed: 45 }],
      cabs: [{ ax: -14, ay: 36, bx: 84, by: 36, w: 18, h: 4, period: 3, phase: 0, mode: 'loop', kind: 'beam', warn: 1.2 }],
      arms: [{ x: 0, y: 65, len: 13, a0: 0, amp: deg(70), period: 3.2, kind: 'boom', w: 2 }],
      crumbles: [{ poly: rect(22, 19, 48, 22), hits: 3 }],
      bumpers: [{ x: 19, y: 20.5, r: 2, kind: 'post' }, { x: 51, y: 20.5, r: 2, kind: 'post' }],
      tee: { x: 50, y: 118 }, cup: { x: 35, y: 10 },
      deco: [{ x: 40, y: 65, emoji: '🦆', size: 4 }],
    },
    {
      // The zigzag up the scaffold: booms swing across each turn; cracked boards are shortcuts.
      id: 'scaffold', name: 'Scaffold Zigzag', emoji: '🪜', par: 5, parTime: 22,
      tip: 'Zigzag up past the booms. Cracked boards break in two knocks.',
      outer: box(0, 0, 76, 136),
      blocks: [rect(0, 102, 11, 106), rect(31, 102, 62, 106), rect(14, 68, 46, 72), rect(62, 68, 76, 72), rect(0, 34, 11, 38), rect(31, 34, 62, 38)],
      crumbles: [{ poly: rect(11, 102, 31, 106), hits: 2 }, { poly: rect(46, 68, 62, 72), hits: 2 }, { poly: rect(11, 34, 31, 38), hits: 2 }],
      arms: [
        { x: 62, y: 104, len: 12.5, a0: 0, amp: deg(60), period: 3.4, kind: 'boom', w: 2 },
        { x: 14, y: 70, len: 12.5, a0: Math.PI, amp: deg(60), period: 3, phase: 1, kind: 'boom', w: 2 },
        { x: 62, y: 36, len: 12.5, a0: 0, amp: deg(60), period: 3.6, phase: 2, kind: 'boom', w: 2 },
      ],
      conveyors: [{ poly: rect(18, 46, 56, 60), dir: 0, speed: 20 }],
      zones: [{ kind: 'sand', circle: { x: 40, y: 86, r: 5 } }],
      tee: { x: 21, y: 122 }, cup: { x: 21, y: 16 },
      deco: [{ x: 70, y: 124, emoji: '🪜', size: 4 }],
    },
    {
      // Finale: through the boom or the wall, ride the belt onto the permit (it flips the belt back to the
      // door it opened) or time the side gate, beat the beam, sink it on the sliding hoist.
      id: 'topping-out', name: 'Topping Out', emoji: '🌲', par: 5, parTime: 26,
      tip: 'Belt to the 🔘, it opens the door. Or time the side gate. Then beam, boom, hoist.',
      outer: box(0, 0, 84, 138),
      blocks: [rect(10, 100, 30, 104), rect(54, 100, 84, 104), rect(0, 52, 36, 56), rect(48, 52, 70, 56)],
      crumbles: [{ poly: rect(30, 100, 54, 104), hits: 3 }],
      arms: [
        { x: 10, y: 102, len: 9, a0: Math.PI, amp: deg(60), period: 3.2, kind: 'boom', w: 2 },
        { x: 42, y: 0, len: 22, a0: deg(90), amp: deg(55), period: 4, phase: 1, kind: 'boom', w: 2 },
      ],
      conveyors: [{ poly: rect(14, 74, 68, 90), dir: 0, speed: 22, sw: { id: 'A', active: 'off' } }, { poly: rect(14, 74, 68, 90), dir: Math.PI, speed: 22, sw: { id: 'A', active: 'on' } }],
      switches: [{ id: 'A', x: 76, y: 82 }],
      gates: [
        { a: { x: 36, y: 54 }, b: { x: 48, y: 54 }, kind: 'door', sw: { id: 'A', active: 'off' } },
        { a: { x: 70, y: 54 }, b: { x: 84, y: 54 }, period: 4.4, open: 1.1 },
      ],
      cabs: [{ ax: -14, ay: 34, bx: 98, by: 34, w: 20, h: 4, period: 3, phase: 0, mode: 'loop', kind: 'beam', warn: 1 }],
      zones: [{ kind: 'track', poly: rect(0, 29, 84, 39) }],
      cupTrack: { x: 60, y: 16, period: 5 },
      tee: { x: 42, y: 126 }, cup: { x: 24, y: 16 },
      deco: [{ x: 6, y: 120, emoji: '🌲', size: 5 }],
    },
  ],
};
