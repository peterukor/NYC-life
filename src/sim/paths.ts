// =====================================================================
// paths.ts (sim) — climbing the life ladders in data/paths.ts.
//
//   • joinPath / leavePath: one active path at a time; progress on the
//     others is kept if you come back.
//   • onPathAction: called after every activity. Gives rep on the
//     active path, counts tasks, tracks active days and the Celebrity
//     no-repeat streak — and rolls the dice on risky actions (busted!).
//   • levelTasks: the checklist for the next level, picked at random per
//     player (seeded), so everyone's climb is a bit different.
//   • tryLevelUp: checks rep + checklist and promotes you.
// =====================================================================

import { coolBonus } from './garage.ts';
import { arrest } from './jail.ts';
import { nowMs } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { PATHS, type PathTask } from '../data/paths.ts';
import { netWorth } from './market.ts';
import { addMoodlet } from './needs.ts';
import { postNews } from './news.ts';
import type { GameState } from './types.ts';

export interface PathsState {
  active: string | null;
  levels: Record<string, number>;
  rep: Record<string, number>;
  /** Action counts per path since joining it. */
  counts: Record<string, Record<string, number>>;
  /** Real calendar days (YYYY-MM-DD) you earned rep on, per path. */
  days: Record<string, string[]>;
  betrayals: number;
  /** Celebrity: consecutive real days entertaining one borough, without repeating yesterday's act. */
  streak: { area: string; lastDay: string; days: number; lastAction: string };
}

export const newPathsState = (): PathsState => ({ active: null, levels: {}, rep: {}, counts: {}, days: {}, betrayals: 0, streak: { area: '', lastDay: '', days: 0, lastAction: '' } });

const realDay = (ms = nowMs()) => new Date(ms).toISOString().slice(0, 10);

export function joinPath(s: GameState, id: string): void {
  if (!PATHS.has(id)) return;
  s.paths.active = id;
  s.paths.levels[id] ??= 1;
  s.paths.rep[id] ??= 0;
  s.paths.counts[id] ??= {};
  s.paths.days[id] ??= [];
}

export function leavePath(s: GameState): void {
  s.paths.active = null;
}

export function pathLevel(s: GameState, id = s.paths.active ?? ''): number {
  return s.paths.levels[id] ?? 0;
}

export function pathTitle(s: GameState, id = s.paths.active ?? ''): string {
  const p = PATHS.get(id);
  return p ? p.titles[Math.max(0, pathLevel(s, id) - 1)] : '';
}

/** The checklist for reaching the next level (stable per player). */
export function levelTasks(s: GameState, id: string): PathTask[] {
  const p = PATHS.get(id);
  const lvl = pathLevel(s, id);
  const stage = p?.tasks[lvl - 1];
  if (!p || !stage) return [];
  const rng = new Rng(`path-${id}-${lvl}-${s.createdAt}`);
  const pool = [...stage.pool];
  const picked: PathTask[] = [...(stage.fixed ?? [])];
  for (let i = 0; i < stage.pick && pool.length; i++) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return picked;
}

export function taskProgress(s: GameState, id: string, t: PathTask): { have: number; need: number } {
  switch (t.kind) {
    case 'action': return { have: s.paths.counts[id]?.[t.action] ?? 0, need: t.times };
    case 'skill': return { have: Math.floor(s.skills[t.skill]), need: t.level };
    case 'netWorth': return { have: Math.max(0, netWorth(s)), need: t.cents };
    case 'places': return { have: s.stats.placesVisited.length, need: t.count };
    case 'activeDays': return { have: s.paths.days[id]?.length ?? 0, need: t.days };
    case 'betrayals': return { have: s.paths.betrayals, need: t.count };
    case 'streak': return { have: s.paths.streak.days, need: t.days };
  }
}

/** What's still missing before you can level up (empty = ready). */
export function levelBlockers(s: GameState, id: string): string[] {
  const p = PATHS.get(id);
  const lvl = pathLevel(s, id);
  if (!p || lvl >= p.titles.length) return ['Top of the ladder'];
  const out: string[] = [];
  const needRep = p.repCurve[lvl];
  if ((s.paths.rep[id] ?? 0) < needRep) out.push(`Rep ${Math.floor(s.paths.rep[id] ?? 0)}/${needRep}`);
  for (const t of levelTasks(s, id)) {
    const pr = taskProgress(s, id, t);
    if (pr.have < pr.need) out.push(t.label);
  }
  return out;
}

export function tryLevelUp(s: GameState, id: string): string | null {
  if (levelBlockers(s, id).length) return null;
  const p = PATHS.require(id);
  s.paths.levels[id] = pathLevel(s, id) + 1;
  const title = pathTitle(s, id);
  addMoodlet(s, { id: `path-${id}`, label: `New title: ${title}`, emoji: p.emoji, value: 20, minutes: 60 * 24 });
  if (pathLevel(s, id) >= 4) postNews(s, { scope: 'city', emoji: p.emoji, headline: `${s.profile.name} is now a ${title}`, personal: true });
  return title;
}

/** After an activity: rep, counts, days, streak, and the risk of getting caught. */
export function onPathAction(s: GameState, actionId: string, risk = 0): { rep: number; busted: string | null } {
  const id = s.paths.active;
  if (!id) return { rep: 0, busted: null };
  const p = PATHS.get(id);
  if (!p) return { rep: 0, busted: null };
  const counts = (s.paths.counts[id] ??= {});
  counts[actionId] = (counts[actionId] ?? 0) + 1;
  if (actionId === 'betrayCrew') s.paths.betrayals++;

  // Rep: fast early, slow later (diminishing with level), and repeats count less.
  const base = p.rep[actionId] ?? 0;
  const lvl = pathLevel(s, id);
  const repeatPenalty = counts[actionId] > 20 ? 0.6 : 1;
  // Fame comes faster when you look the part (Cool meter, sim/garage.ts).
  const cool = id === 'celebrity' ? coolBonus(s) : 1;
  const gained = base > 0 ? Math.max(1, Math.round(base * repeatPenalty * cool * (1.6 / (1 + lvl * 0.35)))) : 0;
  if (gained) {
    s.paths.rep[id] = (s.paths.rep[id] ?? 0) + gained;
    const today = realDay();
    const days = (s.paths.days[id] ??= []);
    if (!days.includes(today)) days.push(today);
    if (id === 'celebrity') updateStreak(s, actionId, today);
  }

  let busted: string | null = null;
  if (risk > 0 && Math.random() < risk * (1 + lvl * 0.08)) {
    // Caught: arrested. Bail costs about what the old fine did; or do the time.
    const bail = Math.max(20_000, Math.round(s.money * 0.25 / 100) * 100);
    s.paths.rep[id] = Math.floor((s.paths.rep[id] ?? 0) * 0.85);
    addMoodlet(s, { id: 'busted', label: 'Busted', emoji: '🚔', value: -20, minutes: 60 * 6 });
    busted = `${arrest(s, 'caught in the act', 6 + lvl * 3, bail)} You lost some rep.${lvl >= 4 ? ' It made the news.' : ''}`;
    if (lvl >= 4) postNews(s, { scope: s.location.area, emoji: '🚔', headline: `${s.profile.name} caught in a police sting`, personal: true });
  }
  return { rep: gained, busted };
}

function updateStreak(s: GameState, actionId: string, today: string): void {
  const st = s.paths.streak;
  const area = s.location.area;
  if (st.lastDay === today) return;
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  const continues = st.lastDay === yesterday && st.area === area && st.lastAction !== actionId;
  st.days = continues ? st.days + 1 : 1;
  st.area = area;
  st.lastDay = today;
  st.lastAction = actionId;
}

export { realDay };
