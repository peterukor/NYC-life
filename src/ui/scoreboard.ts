// =====================================================================
// scoreboard.ts (ui) — a game's 🏆 leaderboard, drawn inside the arcade
// cabinet or in a sheet (data: net/scores.ts).
// =====================================================================

import { esc } from '../core/format.ts';
import { fetchBoard, type Board } from '../net/scores.ts';
import { ARCADE_BY_ID, ARCADE_GAMES } from '../sim/arcade.ts';
import type { GameState } from '../sim/types.ts';
import { openSheet } from './dom.ts';

const MEDALS = ['🥇', '🥈', '🥉'];

export function boardHtml(game: string, b: Board): string {
  const g = ARCADE_BY_ID[game];
  const rows = b.rows.map((r, i) => `<li class="lb-row${r.you ? ' you' : ''}"><span class="lb-place">${MEDALS[i] ?? i + 1}</span><span class="lb-name">${esc(r.name)}</span><b class="lb-score">${r.score.toLocaleString('en-US')}</b></li>`).join('');
  const you = b.you && !b.rows.some((r) => r.you) ? `<li class="lb-row you"><span class="lb-place">${b.you.place}</span><span class="lb-name">You</span><b class="lb-score">${b.you.score.toLocaleString('en-US')}</b></li>` : '';
  const note = b.online ? 'Every player in New York, all-time best scores.' : 'Sign in on 🌐 Online to see every player. For now: you against the regulars.';
  return `<div class="lb"><h3>🏆 ${g ? `${g.emoji} ${esc(g.name)}` : 'Leaderboard'}</h3>${rows || you ? `<ol class="lb-list">${rows}${you}</ol>` : '<p class="sub">No scores yet. Be the first.</p>'}<p class="sub lb-note">${note}</p></div>`;
}

/** A sheet with every game's board, one tab per game. */
export function openScoreboards(s: GameState, first?: string): void {
  const games = ARCADE_GAMES;
  let cur = first && games.some((g) => g.id === first) ? first : games[0].id;
  const tabs = () => `<div class="lb-tabs" role="tablist">${games.map((g) => `<button role="tab" class="chip${g.id === cur ? ' on' : ''}" aria-selected="${g.id === cur}" data-lb="${g.id}">${g.emoji}</button>`).join('')}</div>`;
  const sheet = openSheet({ emoji: '🏆', title: 'High scores', sub: 'Arcade leaderboards', body: `${tabs()}<div data-lb-body><p class="sub">Loading…</p></div>` });
  const load = async () => {
    const body = sheet.body.querySelector<HTMLElement>('[data-lb-body]')!;
    body.innerHTML = '<p class="sub">Loading…</p>';
    const want = cur;
    const b = await fetchBoard(s, want);
    if (want === cur) body.innerHTML = boardHtml(want, b);
  };
  sheet.body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-lb]');
    if (!t) return;
    cur = t.dataset.lb!;
    sheet.body.querySelector('.lb-tabs')!.outerHTML = tabs();
    void load();
  });
  void load();
}
