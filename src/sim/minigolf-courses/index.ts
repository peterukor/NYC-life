// =====================================================================
// minigolf-courses — ⛳ the seventy holes: seven courses of ten.
//
//   c1 🌳 The Park           warm-up: straight lines, sand, water, ramps, ice, a carousel, a jump
//   c2 🚕 Midtown            timing: cabs, crosswalk gates, buses, belts, one-way doors, a switch
//   c3 🚇 Underground        portals, trains, tides, grates, belts, dark tunnels
//   c4 🌉 The Bridges        wind, swinging cables, ramps and jumps over water, a sliding cup
//   c5 🏗️ The Construction Site  crumbling walls, crane beams, belts, switches, moving walls
//   c6 🌃 Rooftops at Night  flippers, magnets, trampolines, jumps between roofs, searchlights
//   c7 🗽 Liberty            the finale: everything, combined, still fair
//
// Each course lives in its own file (c1.ts … c7.ts) and exports
// `course: CourseDef`. This file collects them; the UI and tests read
// COURSES. A round is one course (ten holes). A course with fewer than ten
// holes shows as "under construction" and can't be picked yet.
//
// =====================================================================
// AUTHORING GUIDE
// =====================================================================
//
// UNITS AND COORDINATES
//   One unit ≈ an inch of turf. x grows right, y grows DOWN the screen.
//   Angles are radians: 0 = right, π/2 = down, −π/2 = up (use deg(−90)).
//   The ball's radius is 1.2 (BALL_R), the cup's 2.1 (CUP_R). Full power
//   is 125 units/s and rolls ~150 units on plain turf; a 0.3 putt rolls
//   ~30. Sand stops a ball in a few units; ice barely slows it.
//   A hole is 20…90 wide and 40…140 tall; on a 375 px phone a 60-wide hole
//   draws at ~5.6 px per unit, so keep gaps ≥ 5 units and anything you
//   must read (gates, buttons, flippers) ≥ 4 units long.
//   Every `phase` is in SECONDS (it shifts that obstacle's clock).
//   Every `period` is in seconds. Everything moving is a pure function of
//   the hole clock, which starts at 0 when the hole starts and never pauses
//   between shots (cabs keep driving while you think).
//
// THE HOLE (HoleDef, see sim/minigolf.ts). Required:
//   id        kebab-case, unique in the course (stored as `c3-${id}`)
//   name      2–4 words, NYC flavour ("Canal St Shuffle")
//   emoji     one emoji for the hole
//   par       2…6 strokes. What a good player takes on a normal day.
//   parTime   seconds of ACTIVE play (only the time you spend aiming; the
//             clock stops while the ball rolls). Guide: ~3 s a stroke on an
//             open hole, + 2–4 s for each read (a bank, a slope), + half a
//             cycle for every timing window you must wait for. A good, not
//             perfect, player should make parTime about half the time.
//   tip       one line under the name: the read, not a spoiler.
//   outer     the rail: a polygon (use box(x0, y0, x1, y1) for a box with
//             cut corners). The ball can never leave it.
//   tee, cup  {x, y}, on plain turf, ≥ 3.5 units from any wall.
// Optional lists (leave out what you don't use):
//   blocks    Pt[][]   solid buildings, full height (a jump never clears them)
//   low       Pt[][]   low walls / hedges / curbs, height 2.5: a jumping
//                      ball sails over, a rolling one bounces. Keep them ≤ 2
//                      units thick.
//   zones     sand {poly|circle} heavy friction · water {poly|circle} a
//             penalty stroke, back to where you hit from · ramp {poly, push:
//             [ax, ay]} a constant push (≥ 20 so nothing rests on it) ·
//             hill {circle, lift} pushes outward from the top · ice {poly|
//             circle} almost no friction · street / path / track: paint only.
//   bumpers   {x, y, r, kind}: 'bumper' kicks (e 1.15), 'trampoline' kicks
//             harder (e 1.45, out speed capped at 105), 'hydrant' | 'post' |
//             'cone' are dead solid. Height 3 (a jump clears them).
//   cabs      a box w×h driving between (ax, ay) and (bx, by): mode
//             'pingpong' (default, eases at the ends) or 'loop' (a → b at a
//             steady speed, then from a again: put a and b OFF the course
//             for a train that crosses and leaves). kind 'cab' | 'bus' |
//             'train' | 'beam' (art; trains and beams are full height, cabs
//             and buses 4 high, so a jump clears them). warn: seconds of
//             flashing crossing lights before a loop vehicle comes on.
//   spinners  a turnstile: {x, y, hub, len, arms, omega (rad/s), a0}.
//   grates    🚇 in at (x, y) radius r, out of the manhole at `to` heading dir.
//   conveyors {poly, dir, speed}: the belt surface moves; a ball rides it.
//             The DOWNSTREAM end must open onto turf, never into a wall
//             (validateHole drops a ball on every belt cell to check).
//   winds     {poly, dir, force, period, on, warn?, phase?}: blows `force`
//             (30–80 shoves a resting ball, 120 is a gale) for `on` s of
//             every period. Streamers flutter `warn` s (default 1.2) before.
//   movers    {a, b, dx, dy, period, phase?, w?, kind?}: a wall segment a–b
//             (thickness w, default 2) gliding by (dx, dy) and back.
//             kind 'wall' | 'bus' | 'beam' (a crane beam) | 'barrier'.
//   gates     {a, b, period?, open?, phase?, warn?, kind?}: shut from a to b,
//             open for `open` s of each period (default half), sliding over
//             0.3 s. A light shows green / amber (last `warn` s, default 1)
//             / red with a countdown ring. No period = a door that's always
//             shut, unless a switch says otherwise (see sw below).
//   springs   {a, b, e?}: a trampoline rail, e 1…1.8 (default 1.35).
//   magnets   {x, y, r, strength}: + pulls toward the centre, − pushes;
//             strongest halfway out, nothing at the centre or the edge.
//             40 is gentle, 90 is strong (green friction is 14). Centre one
//             on the cup for a helping hand, or beside the line to bend it.
//   portals   {a, b, r?, turn?, oneWay?}: in at a, out at b keeping its
//             speed, direction turned by `turn` (radians). Two-way unless
//             oneWay. Keep both ends ≥ r from walls; check what lies in
//             front of the exit in every direction a ball can come out.
//   arms      {x, y, len, a0, amp, period, phase?, kind, hold?, w?}: a bar
//             pivoting at (x, y). 'flipper': rests at a0, snaps by amp in
//             0.09 s, holds `hold` s (0.25), falls back in 0.3 s, every
//             period; it glows for the last 0.6 s before it fires.
//             'cable' / 'boom': swings a0 ± amp like a pendulum.
//   crumbles  {poly, hits}: solid until knocked `hits` times (a knock is a
//             hit faster than 9 units/s). Cracks show how many are left.
//   tides     {x0, y0, x1, y1, from, lo, hi, period, phase?}: water rising
//             over the rectangle from one side, covering lo…hi of it. A ball
//             (even a resting one) caught by it takes a penalty and goes back
//             (to the tee if it was hit from inside the tide's rectangle).
//   turntables {x, y, r, omega}: carries the ball round (position and
//             velocity), resting or rolling. 0.6–1.2 rad/s reads well.
//   oneways   {a, b, dir}: the ball crosses heading `dir` only; it bounces
//             off the other side. Chevrons show the way.
//   cupTrack  {x, y, period, phase?}: the cup slides between `cup` and
//             (x, y). Keep the whole track on plain turf.
//   jumps     {x, y, dir, w, len, minSpeed?, lift?}: a ramp `len` long and
//             `w` wide ending at the lip (x, y), launching toward dir. Over
//             the lip faster than minSpeed (38) and the ball flies (lift
//             0.4: speed 60 flies ~25 units, 90 ~50); slower and it rolls
//             back. In the air it ignores friction, water, sand, low walls,
//             bumpers, cabs and buses. It lands where it lands: put turf there.
//   switches  {id, x, y, r?, mode?}: rolling over a 🔘 flips it ('toggle',
//             default) or turns it on for good ('once'). Any conveyor,
//             wind, mover, gate, magnet, portal, arm or turntable can carry
//             `sw: { id, active: 'on' | 'off' }` and works only while that
//             switch is on / off. A door that a button opens:
//             gates: [{ a, b, sw: { id: 'A', active: 'off' } }].
//             Linked things wear the switch's colour letter.
//   deco      {x, y, emoji?, text?, size?, rot?, color?}: paint, no physics.
//   look      {block?, label?}: block colour and a sign on each block.
//
// DESIGN RULES
//   1. One clear read, one trick, one risk/reward route per hole. The tee
//      shot's outcome must be readable from the tee: no blind shots. If the
//      cup is round a corner, show the way (a bank, an arrow, a path).
//   2. Readable tells for everything that changes. Gates show their light,
//      winds flutter first, trains flash before they come, flippers glow
//      before they fire. Never make a player react faster than ~0.5 s.
//   3. Fair timing windows: an open window ≥ 1 s (≥ 1.5 s in c1–c3), and a
//      cycle ≤ 6 s so nobody waits long (the clock is running!).
//   4. Recoverable: a miss should cost about a stroke, not five. Water and
//      tides are the only penalties; never two in a row with no safe line.
//   5. One NEW idea per hole early in a course; combine known ideas later.
//      The first time a course uses an obstacle, make it the star and keep
//      the rest of the hole simple.
//   6. Par: count the strokes a good player takes on the safe line. Par 2
//      straight, 3 for one read or one timing window, 4 for two, 5 rarely.
//   7. Difficulty per course: holes 1–3 introduce, 4–7 develop, 8–9 test,
//      10 is the finale. Courses get harder by tighter windows, combos,
//      fewer safe lines and bigger hazards, never by hiding information.
//      Course 7 should be hard, not impossible: solveHole at skill 1 must
//      still finish every hole within par + 2.
//   8. Test it: tests/minigolf.test.ts checks every hole with
//      validateHole(h) (geometry, links, belts that trap a ball…) and
//      solveHole(h, 1, seeded(…)) (beatable within par + 2). Run
//      `node --test tests/minigolf.test.ts`. Then play it in the browser.
//
// A MINIMAL HOLE
//   {
//     id: 'canal', name: 'Canal St Shuffle', emoji: '👜', par: 3, parTime: 10,
//     tip: 'Wait for the gate. It opens every four seconds.',
//     outer: box(0, 0, 50, 100), tee: { x: 25, y: 88 }, cup: { x: 25, y: 14 },
//     blocks: [rect(0, 48, 17, 53), rect(33, 48, 50, 53)],
//     gates: [{ a: { x: 17, y: 50.5 }, b: { x: 33, y: 50.5 }, period: 4, open: 2 }],
//   }
// =====================================================================

import { defineHole, type Hole, type HoleDef } from '../minigolf.ts';
import { course as c1 } from './c1.ts';
import { course as c2 } from './c2.ts';
import { course as c3 } from './c3.ts';
import { course as c4 } from './c4.ts';
import { course as c5 } from './c5.ts';
import { course as c6 } from './c6.ts';
import { course as c7 } from './c7.ts';

export type CourseArt = 'park' | 'midtown' | 'subway' | 'bridges' | 'construction' | 'night' | 'liberty';

/** How a course is painted. */
export interface CourseTheme {
  /** Turf and its mowing stripe. */
  turf: string;
  stripe: string;
  /** The rail (cream on top of an ink outline). */
  rail: string;
  ink: string;
  /** Background gradient (top, bottom). */
  bg: [string, string];
  /** Default block colour. */
  block: string;
  /** Header / button colour in the UI. */
  accent: string;
  /** Which background art to draw round the holes. */
  art: CourseArt;
}

export interface CourseDef {
  /** 'c1' … 'c7'. */
  id: string;
  name: string;
  emoji: string;
  /** Difficulty, 1…5 stars. */
  stars: number;
  /** One line on the course picker. */
  blurb: string;
  theme: CourseTheme;
  holes: HoleDef[];
}

export interface Course extends Omit<CourseDef, 'holes'> {
  holes: Hole[];
  /** Sum of the holes' par and parTime. */
  par: number;
  parTime: number;
  /** All ten holes are in. */
  ready: boolean;
}

export const HOLES_PER_COURSE = 10;

export function buildCourse(d: CourseDef): Course {
  const holes = d.holes.map((h, i) => defineHole(h, i + 1, d.id));
  return {
    ...d,
    holes,
    par: holes.reduce((a, h) => a + h.par, 0),
    parTime: holes.reduce((a, h) => a + h.parTime, 0),
    ready: holes.length === HOLES_PER_COURSE,
  };
}

export const COURSES: Course[] = [c1, c2, c3, c4, c5, c6, c7].map(buildCourse);
export const COURSE_BY_ID: Record<string, Course> = Object.fromEntries(COURSES.map((c) => [c.id, c]));
export const ALL_HOLES: Hole[] = COURSES.flatMap((c) => c.holes);
