// =====================================================================
// arcade-classics.ts — the seven original cabinets, rebuilt (Peter,
// 2026-10-28: "go back and rebuild all the games in the arcade, clean
// them up properly"). Each lives in ui/arcade/<id>.ts with its rules in
// sim/arcade-<id>.ts. These win over the old versions in arcade-games.ts.
// =====================================================================

import type { Run } from './arcade-games.ts';
import { beats } from './arcade/beats.ts';
import { pigeons } from './arcade/pigeons.ts';

export const RUNS3: Record<string, Run> = { pigeons, beats };
