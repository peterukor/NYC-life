// =====================================================================
// scores.ts — the 🏆 game leaderboards for all players (Peter,
// 2026-10-27: "implement the leaderboards for all players").
//
// Signed in to the online server: every finished game sends its score
// (server keeps each player's best, refuses impossible scores), and the
// board shows the top 20 real players and your place.
// Not signed in, or no server yet: the board shows your best against the
// arcade's regulars (made-up names, scores that change each week), so
// the screen is never empty.
// =====================================================================

import { ARCADE_BY_ID, bestScore } from '../sim/arcade.ts';
import type { GameState } from '../sim/types.ts';
import { api, getToken, onlineAvailable } from './api.ts';

export interface BoardRow { name: string; score: number; you?: boolean }
export interface Board { online: boolean; rows: BoardRow[]; you: { place: number; score: number } | null }

const online = () => onlineAvailable() && !!getToken();

/** Send a finished game's score (fire and forget; quietly does nothing offline). */
export function postScore(game: string, score: number): void {
  if (!online() || !(score > 0)) return;
  void api('POST', '/scores', { game, score }).catch(() => {});
}

const REGULARS = ['Tiny Tim from 8th Ave', 'QueenOfQueens', 'Pigeon Whisperer', 'Bodega Cat', 'DJ Two Train', 'Nana Rosa', 'Jaz', 'Big Steve', 'Lil Subway', 'Marco', 'Shanice B.', 'Coach K'];

/** A tiny seeded random (so the regulars' scores hold steady for the week). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A "good" score for a game: where it pays about 40 🎟️. */
export function typicalScore(game: string): number {
  const g = ARCADE_BY_ID[game];
  if (!g) return 100;
  let lo = 1, hi = 1;
  while (g.tickets(hi) < 40 && hi < 1e8) hi *= 2;
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (g.tickets(mid) < 40) lo = mid + 1;
    else hi = mid;
  }
  return hi;
}

/** The offline board: you and the regulars. */
export function localBoard(s: GameState, game: string, now = Date.now()): Board {
  const week = Math.floor(now / (7 * 86_400_000));
  const r = rng([...game].reduce((a, c) => a * 31 + c.charCodeAt(0), week));
  const t = typicalScore(game);
  const rows: BoardRow[] = REGULARS.slice(0, 9).map((name) => ({ name, score: Math.max(1, Math.round(t * (0.35 + r() * 1.9))) }));
  const mine = bestScore(s, game);
  if (mine > 0) rows.push({ name: 'You', score: mine, you: true });
  rows.sort((a, b) => b.score - a.score);
  const place = rows.findIndex((x) => x.you);
  return { online: false, rows: rows.slice(0, 10), you: place >= 0 ? { place: place + 1, score: mine } : null };
}

/** The board for a game: real players when online, else the local one. */
export async function fetchBoard(s: GameState, game: string): Promise<Board> {
  if (!onlineAvailable()) return localBoard(s, game);
  try {
    const b = await api<{ top: { username: string; score: number }[]; you: { place: number; score: number } | null }>('GET', `/scores/${encodeURIComponent(game)}`);
    return { online: true, rows: b.top.map((x, i) => ({ name: x.username, score: x.score, you: b.you?.place === i + 1 })), you: b.you };
  } catch {
    return localBoard(s, game);
  }
}
