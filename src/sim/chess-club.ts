// =====================================================================
// chess-club.ts — playing for money and rating at the Chess House (and
// the park chess tables). The rules and the opponents are sim/chess.ts;
// the board is ui/chess.ts.
//
// You put up a stake (they match it), you play White. Win: double back,
// rating up (more for beating someone stronger), 🔥 street rep for big
// upsets and 🧠 street smarts. Lose: the stake's gone. Draw: stake back.
// Beating Grandmaster Gloria makes the news.
//
// In person only (Peter, 2026-10-15: perks for going outside): there's
// no chess on the phone; the house is where the money is.
// The record is saved as-is (s.chess): new opponents just add keys to
// wins / losses, so older saves load unchanged.
// =====================================================================

import { changeMoney } from './economy.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { postNews } from './news.ts';
import { changeRep } from './rep.ts';
import type { Opponent } from './chess.ts';
import type { GameState } from './types.ts';

export interface ChessRecord {
  rating: number;
  wins: Record<string, number>;
  losses: Record<string, number>;
  draws: number;
  /** Most won in one game (cents). */
  bestWin: number;
}

export function chessOf(s: GameState): ChessRecord {
  return (s.chess ??= { rating: 800, wins: {}, losses: {}, draws: 0, bestWin: 0 });
}

/** Put the stake down (cash). */
export function stakeUp(s: GameState, stake: number): string | null {
  if (stake <= 0) return null;
  if (s.money < stake) return `You need ${Math.round(stake / 100)} dollars in cash for that bet.`;
  changeMoney(s, -stake, '♟️ Chess bet');
  return null;
}

/** Elo with K=32. */
function elo(mine: number, theirs: number, score: number): number {
  const expect = 1 / (1 + 10 ** ((theirs - mine) / 400));
  return Math.round(32 * (score - expect));
}

export interface ChessPayout {
  text: string;
  money: number;
  ratingDelta: number;
}

export function settleChess(s: GameState, opp: Opponent, stake: number, outcome: 'win' | 'loss' | 'draw'): ChessPayout {
  const rec = chessOf(s);
  const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  const delta = elo(rec.rating, opp.rating, score);
  rec.rating = Math.max(100, rec.rating + delta);
  s.skills.streetSmarts = Math.min(10, s.skills.streetSmarts + (outcome === 'win' ? 0.3 : 0.12));
  applyNeeds(s, { fun: 12, social: 6 });
  if (outcome === 'draw') {
    rec.draws++;
    if (stake) changeMoney(s, stake, '♟️ Chess: draw, stake back');
    return { text: `A draw with ${opp.name}. Stake back. Rating ${rec.rating}.`, money: 0, ratingDelta: delta };
  }
  if (outcome === 'loss') {
    rec.losses[opp.id] = (rec.losses[opp.id] ?? 0) + 1;
    return { text: `${opp.name} wins. ${stake ? 'The stake is theirs.' : ''} Rating ${rec.rating}.`, money: -stake, ratingDelta: delta };
  }
  rec.wins[opp.id] = (rec.wins[opp.id] ?? 0) + 1;
  if (stake) {
    changeMoney(s, stake * 2, `♟️ Beat ${opp.name}`);
    rec.bestWin = Math.max(rec.bestWin, stake);
  }
  const upset = opp.rating - rec.rating + delta;
  const rep = opp.id === 'gloria' ? 25 : opp.id === 'tanya' ? 12 : opp.id === 'eddie' ? 8 : upset > 0 ? 3 : 0;
  if (rep) changeRep(s, 'street', rep);
  addMoodlet(s, { id: 'chessWin', label: `Beat ${opp.name} at chess`, emoji: '♟️', value: opp.id === 'gloria' ? 25 : 10, minutes: 60 * 6 });
  if (opp.id === 'gloria') postNews(s, { scope: 'city', emoji: '♟️', headline: `${s.profile.name} beat Grandmaster Gloria at the Chess House`, personal: true });
  return { text: `You beat ${opp.name}!${stake ? ` +$${Math.round(stake / 100)}.` : ''} Rating ${rec.rating}${rep ? ` · 🔥 +${rep} street rep` : ''}.`, money: stake, ratingDelta: delta };
}
