// =====================================================================
// arcade-classics.ts — the seven original cabinets, rebuilt (Peter,
// 2026-10-28: "go back and rebuild all the games in the arcade, clean
// them up properly"). Each lives in ui/arcade/<id>.ts with its rules in
// sim/arcade-<id>.ts. These win over the old versions in arcade-games.ts.
// =====================================================================

import type { Run } from './arcade-games.ts';
import { beats } from './arcade/beats.ts';
import { dash } from './arcade/dash.ts';
import { pigeons } from './arcade/pigeons.ts';
import { snake } from './arcade/snake.ts';
import { stack } from './arcade/stack.ts';

export const RUNS3: Record<string, Run> = { snake, stack, dash, pigeons, beats };
