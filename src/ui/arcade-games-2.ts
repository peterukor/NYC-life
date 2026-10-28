// =====================================================================
// arcade-games-2.ts — the second row of cabinets (Peter, 2026-10-28:
// "increase arcade to 3, please add more games… make it fun, make it
// look good"). Same contract as arcade-games.ts: a Run draws into the
// 360×480 cabinet canvas, calls hud() every frame and done(score) once.
//
// 🗽 Liberty Pinball   real flippers, Liberty bumper, 🚕 TAXI lanes,
//                     🚇 subway ramp, 🎯 targets → multiball, 3 balls.
// 🎳 Coney Skee-Ball   flick to roll: rail bounces, the hump, 10–50 rings
//                     and corner 💯s, hot streaks, last ball ×2.
// 🧱 Brooklyn Breakout brownstone brick breaker: chains, 🎱 ↔️ 🔥 ❤️
//                     power-ups, blocks that get harder.
// 🏙️ Rooftop Jump      Doodle-Jump up water towers, AC units and fire
//                     escapes: springs, 🐦 pigeon stomps, 🪙, 🎈.
// 🏒 Air Hockey        drag your mallet vs a house AI that ramps up.
//
// Each game lives in ui/arcade/<id>.ts; shared helpers in ui/arcade/kit.ts.
// Their names, how-tos and tickets: sim/arcade.ts (ARCADE_GAMES).
// =====================================================================

import type { Run } from './arcade-games.ts';
import { airhockey } from './arcade/airhockey.ts';
import { breakout } from './arcade/breakout.ts';
import { pinball } from './arcade/pinball.ts';
import { rooftop } from './arcade/rooftop.ts';
import { skeeball } from './arcade/skeeball.ts';

export const RUNS2: Record<string, Run> = { pinball, skeeball, breakout, rooftop, airhockey };


