// ⛳ Course 2 🚕 Midtown — timing. Cabs and turnstiles from the old nine,
// then a crosswalk gate, billboards that bounce, a revolving door, a
// push-to-cross button, the bus lane and the Port Authority walkway,
// finishing at the Top of the Rock.
import { box, deg, rect } from '../minigolf.ts';
import type { CourseDef } from './index.ts';

export const course: CourseDef = {
  id: 'c2',
  name: 'Midtown',
  emoji: '🚕',
  stars: 2,
  blurb: 'Cabs, crosswalks and the bus lane. Timing matters.',
  theme: { turf: '#55cf78', stripe: '#4cc26e', rail: '#fff4dc', ink: '#1c2340', bg: ['#3a3f5c', '#2a2e45'], block: '#e2553f', accent: '#f2b705', art: 'midtown' },
  holes: [
    {
      id: 'cab', name: 'Yellow Cab Crossing', emoji: '🚕', par: 3, parTime: 10,
      tip: 'Wait for the cab. It will not wait for you.',
      outer: box(0, 0, 50, 110),
      zones: [{ kind: 'street', poly: rect(0, 47, 50, 63) }],
      bumpers: [{ x: 11, y: 32, r: 2, kind: 'hydrant' }, { x: 39, y: 32, r: 2, kind: 'hydrant' }],
      cabs: [{ ax: 12, ay: 55, bx: 38, by: 55, w: 16, h: 9, period: 3.2, phase: 0 }],
      tee: { x: 25, y: 100 }, cup: { x: 25, y: 14 },
    },
    {
      // New: a timed gate. Read the light: green go, amber hurry, red wait.
      id: 'walk-signal', name: 'Walk Signal', emoji: '🚦', par: 2, parTime: 8,
      tip: 'Go on the green walk light. Amber means hurry.',
      outer: box(0, 0, 50, 100),
      zones: [{ kind: 'street', poly: rect(0, 40, 50, 62) }],
      blocks: [rect(0, 48, 16, 53), rect(34, 48, 50, 53)],
      look: { block: '#8e9aaf' },
      gates: [{ a: { x: 16, y: 50.5 }, b: { x: 34, y: 50.5 }, period: 4.4, open: 2.2, kind: 'crosswalk' }],
      tee: { x: 25, y: 88 }, cup: { x: 25, y: 14 },
      deco: [{ x: 8, y: 72, emoji: '🚶', size: 4 }, { x: 42, y: 28, emoji: '🧍', size: 4 }],
    },
    {
      id: 'turnstile', name: 'Turnstile Spin', emoji: '🎫', par: 3, parTime: 10,
      tip: 'Time it through the turnstile. No MetroCard needed.',
      outer: box(0, 0, 54, 100),
      blocks: [rect(0, 48, 17, 53), rect(37, 48, 54, 53)],
      look: { block: '#8e9aaf' },
      bumpers: [{ x: 27, y: 50.5, r: 2.5, kind: 'post' }],
      spinners: [{ x: 27, y: 50.5, hub: 2.5, len: 7, arms: 3, omega: 1.4, a0: 0 }],
      tee: { x: 27, y: 90 }, cup: { x: 27, y: 14 },
    },
    {
      // New: trampolines and spring rails (they send it back faster than it came).
      id: 'times-square', name: 'Times Square Billboards', emoji: '📺', par: 3, parTime: 11,
      tip: 'The billboards bounce hard. Bank off a spring, softly.',
      outer: box(0, 0, 60, 104),
      blocks: [rect(16, 44, 44, 56)],
      look: { block: '#7b6cf6', label: 'TKTS' },
      bumpers: [{ x: 8, y: 28, r: 2.6, kind: 'trampoline' }, { x: 52, y: 28, r: 2.6, kind: 'trampoline' }],
      springs: [{ a: { x: 0.5, y: 66 }, b: { x: 8, y: 58 } }, { a: { x: 52, y: 58 }, b: { x: 59.5, y: 66 } }],
      tee: { x: 30, y: 92 }, cup: { x: 30, y: 16 },
      deco: [{ x: 30, y: 36, emoji: '✨', size: 4 }, { x: 30, y: 70, emoji: '📸', size: 4 }],
    },
    {
      // New: one-way doors. In on the left, out on the right; the middle revolves.
      id: 'revolving-door', name: 'Revolving Door', emoji: '🚪', par: 3, parTime: 11,
      tip: 'Arrows show the way in. The right door is exit only.',
      outer: box(0, 0, 60, 100),
      blocks: [rect(0, 48, 4, 53), rect(16, 48, 23, 53), rect(37, 48, 44, 53), rect(56, 48, 60, 53)],
      look: { block: '#5d6b8a' },
      oneways: [{ a: { x: 4, y: 50.5 }, b: { x: 16, y: 50.5 }, dir: deg(-90) }, { a: { x: 44, y: 50.5 }, b: { x: 56, y: 50.5 }, dir: deg(90) }],
      spinners: [{ x: 30, y: 50.5, hub: 1.6, len: 7, arms: 4, omega: 1.1, a0: 0.4 }],
      tee: { x: 30, y: 88 }, cup: { x: 46, y: 16 },
      deco: [{ x: 30, y: 30, emoji: '🛎️', size: 4 }],
    },
    {
      id: 'grate', name: 'Union Square Transfer', emoji: '🚇', par: 3, parTime: 10,
      tip: 'Sink it in the subway grate to pop out up top. Or take the long way round.',
      outer: box(0, 0, 60, 104),
      blocks: [rect(0, 44, 48, 58)],
      look: { block: '#2f9e64', label: 'UNION SQ' },
      bumpers: [{ x: 54, y: 72, r: 2.4, kind: 'bumper' }],
      grates: [{ x: 26, y: 78, r: 3.4, to: { x: 52, y: 12 }, dir: Math.PI }],
      tee: { x: 12, y: 94 }, cup: { x: 14, y: 16 },
    },
    {
      // New: a switch. The button opens the barricade (roll over it again and it shuts).
      id: 'push-to-cross', name: 'Push to Cross', emoji: '🔘', par: 3, parTime: 12,
      tip: 'Hit the button to open the barricade. Or the long way, past the sand.',
      outer: box(0, 0, 58, 104),
      blocks: [rect(0, 50, 18, 55), rect(36, 50, 49, 55)],
      look: { block: '#8e9aaf' },
      gates: [{ a: { x: 18, y: 52.5 }, b: { x: 36, y: 52.5 }, kind: 'door', sw: { id: 'A', active: 'off' } }],
      switches: [{ id: 'A', x: 8, y: 72 }],
      zones: [{ kind: 'sand', poly: rect(42, 30, 58, 42) }],
      tee: { x: 27, y: 92 }, cup: { x: 27, y: 14 },
      deco: [{ x: 51, y: 70, emoji: '🚧', size: 4 }],
    },
    {
      // New: moving walls. Two buses pull across; go through the gap they leave.
      id: 'bus-lane', name: 'M15 Bus Lane', emoji: '🚌', par: 3, parTime: 12,
      tip: 'Two buses, out of step. Go when the lane clears.',
      outer: box(0, 0, 56, 110),
      zones: [{ kind: 'street', poly: rect(0, 32, 56, 48) }, { kind: 'street', poly: rect(0, 62, 56, 78) }],
      movers: [
        { a: { x: 6, y: 40 }, b: { x: 22, y: 40 }, dx: 28, dy: 0, period: 4, w: 7, kind: 'bus' },
        { a: { x: 34, y: 70 }, b: { x: 50, y: 70 }, dx: -28, dy: 0, period: 4, phase: 1, w: 7, kind: 'bus' },
      ],
      tee: { x: 28, y: 98 }, cup: { x: 28, y: 14 },
      deco: [{ x: 50, y: 92, emoji: '🚏', size: 5 }],
    },
    {
      // New: conveyor belts. The walkway carries the ball sideways; aim upstream.
      id: 'port-authority', name: 'Port Authority Walkway', emoji: '🛄', par: 3, parTime: 11,
      tip: 'The walkways drift your ball. Aim upstream of the cup.',
      outer: box(0, 0, 60, 106),
      conveyors: [
        { poly: rect(0, 38, 46, 50), dir: 0, speed: 26 },
        { poly: rect(0, 58, 46, 70), dir: 0, speed: 18 },
      ],
      bumpers: [{ x: 52, y: 26, r: 2.2, kind: 'post' }, { x: 24, y: 24, r: 2, kind: 'post' }],
      tee: { x: 34, y: 92 }, cup: { x: 14, y: 16 },
      deco: [{ x: 52, y: 44, emoji: '🧳', size: 4 }, { x: 7, y: 64, emoji: '🧳', size: 4 }],
    },
    {
      id: 'rock', name: 'Top of the Rock', emoji: '🗽', par: 4, parTime: 13,
      tip: 'Up the zigzag, past the fountain pool, over the hump. Finish strong.',
      outer: box(0, 0, 64, 124),
      blocks: [rect(0, 82, 42, 88), rect(22, 38, 64, 44)],
      look: { block: '#7b6cf6' },
      zones: [
        { kind: 'water', poly: [[0, 60], [14, 60], [24, 82], [0, 82]] },
        { kind: 'hill', circle: { x: 30, y: 20, r: 8 }, lift: 30 },
        { kind: 'sand', circle: { x: 56, y: 30, r: 5 } },
      ],
      bumpers: [{ x: 36, y: 66, r: 2.5, kind: 'bumper' }, { x: 52, y: 54, r: 2.5, kind: 'bumper' }],
      tee: { x: 54, y: 112 }, cup: { x: 50, y: 14 },
    },
  ],
};
