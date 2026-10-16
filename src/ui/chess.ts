// =====================================================================
// chess.ts (ui) — the Chess House (Peter, 2026-10-15) and the park
// chess tables: pick an opponent and a bet, then play a real game.
//
// You're White. Tap a piece to see where it can go (dots), tap a square
// to move. Pawns reaching the end become queens. The opponent thinks a
// moment, then answers (and talks a little). Resign any time.
// Rules + opponents: sim/chess.ts. Money + rating: sim/chess-club.ts.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { bestMove, fromFen, inCheck, kingSquare, legalMoves, moveLabel, OPPONENTS, play, result, START_FEN, type Move, type Opponent, type Position } from '../sim/chess.ts';
import { chessOf, settleChess, stakeUp } from '../sim/chess-club.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { burstAt, popAt, shakeEl } from './juice.ts';
import { html, onAct, openSheet, root, toast } from './dom.ts';

export interface ChessHost {
  state: GameState;
  saved: () => void;
  /** A game finished (🏆 leaderboard: your rating). */
  onRating?: (rating: number) => void;
  /** A game finished: how it went, against whom (season points, challenges). */
  onChess?: (outcome: 'win' | 'loss' | 'draw', opponentId: string) => void;
}

// Text-style glyphs (︎ stops phones drawing ♟ as an emoji).
const GLYPH: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
/** When you take one of their pieces / they take yours / you check them. */
const LOST: Record<string, string[]> = {
  kid: ['HEY. That was my favourite one.', 'I let you have that.', 'Mom!!'],
  professor: ['Ah. I underestimated you.', 'A fair trade. Mostly.', 'Noted.'],
  eddie: ['Lucky. Pure luck.', 'Okay, okay, the tourist bites.', 'I was testing you.'],
  gloria: ['Hm.', '…well played.', '(she sips her tea, louder)'],
};
const TOOK: Record<string, string[]> = {
  kid: ['YOINK!', 'Mine now!', 'I’m putting that on my shelf.'],
  professor: ['As the books predicted.', 'Elementary.', 'You left that undefended. Twice.'],
  eddie: ['Thank you for your donation.', 'Ka-ching.', 'Rookie mistake. I love rookies.'],
  gloria: ['Mm.', 'Thank you, dear.', '(doesn’t even look up)'],
};
const CHECKED: Record<string, string[]> = {
  kid: ['That’s not fair!', 'Is that allowed?!'],
  professor: ['Ah. Check. Very good.', 'A sharp move.'],
  eddie: ['Whoa, whoa. Relax.', 'Calm down, Bobby Fischer.'],
  gloria: ['Oh my.', '(puts the crossword down)'],
};
const line = (set: Record<string, string[]>, id: string) => {
  const a = set[id] ?? ['…'];
  return a[Math.floor(Math.random() * a.length)];
};

const TALK: Record<string, string[]> = {
  kid: ['My mom says I’m gifted.', 'Wait, can the horse do that?', 'I’m telling everyone at school.'],
  professor: ['Hmm. Interesting choice.', 'In 1974 I played this exact position.', 'Take your time. I have all day.'],
  eddie: ['Tick tock, tourist.', 'You play like you dress.', 'That’s twenty bucks walking away from you.'],
  gloria: ['…', 'Seven letters, “a quiet victory”? Ah.', 'Not bad. Not good either.'],
};

/** Pick who to play and for how much. */
export function openChessHouse(host: ChessHost, where = 'The Chess House'): void {
  const s = host.state;
  const rec = chessOf(s);
  const sheet = openSheet({
    emoji: '♟️',
    title: where,
    sub: `Your rating ${rec.rating} · ${Object.values(rec.wins).reduce((a, b) => a + b, 0)} wins`,
    body: `<p class="blurb">Pick your opponent and your bet. You play White. Winning doubles your bet.</p>
      ${OPPONENTS.map((o) => `<div class="list-item"><div style="font-size:30px">${o.emoji}</div><div class="grow"><div class="title">${esc(o.name)} · ${o.rating}</div><div class="sub">${esc(o.blurb)}${rec.wins[o.id] ? `<br>🏆 You’ve beaten them ${rec.wins[o.id]}×` : ''}</div>
        <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">${o.stakes.map((st) => `<button class="btn ${st ? '' : 'primary'}" data-act="play:${o.id}:${st}" ${st > s.money ? 'disabled' : ''}>${st ? `Bet ${money(st)}` : 'Friendly'}</button>`).join('')}</div></div></div>`).join('')}`,
  });
  onAct(sheet.body, (act) => {
    const [, id, st] = act.split(':');
    const opp = OPPONENTS.find((o) => o.id === id);
    if (!opp) return;
    const stake = Number(st) || 0;
    const why = stakeUp(s, stake);
    if (why) return toast(why, { icon: '♟️', tone: 'bad' });
    host.saved();
    sheet.close();
    window.setTimeout(() => playChess(host, opp, stake), 250);
  });
}

export function playChess(host: ChessHost, opp: Opponent, stake: number): void {
  const s = host.state;
  let pos: Position = fromFen(START_FEN);
  let selected = -1;
  let targets: Move[] = [];
  let last: Move | null = null;
  let thinking = false;
  let finished = false;
  const log: string[] = [];
  const el = html(`
    <div class="mg-wrap" role="dialog" aria-label="Chess">
      <div class="mg chess">
        <div class="chess-top"><span class="chess-opp">${opp.emoji}</span><div class="grow"><b>${esc(opp.name)}</b><small>${stake ? `Bet ${money(stake)} · winner takes ${money(stake * 2)}` : 'Friendly game'}</small></div><button class="btn ghost" data-act="resign">🏳️ Resign</button></div>
        <div class="chess-say" data-say>“${esc(TALK[opp.id]?.[0] ?? 'Good luck.')}”</div>
        <div class="chess-board" data-board></div>
        <div class="chess-status" data-status aria-live="polite">Your move.</div>
        <div class="chess-log" data-log></div>
      </div>
    </div>`);
  root().appendChild(el);
  const boardEl = el.querySelector<HTMLElement>('[data-board]')!;
  const status = el.querySelector<HTMLElement>('[data-status]')!;
  const say = el.querySelector<HTMLElement>('[data-say]')!;
  const logEl = el.querySelector<HTMLElement>('[data-log]')!;

  const draw = () => {
    const check = inCheck(pos) ? kingSquare(pos, pos.turn) : -1;
    boardEl.innerHTML = pos.board
      .map((p, i) => {
        const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
        const tgt = targets.find((m) => m.to === i);
        const cls = ['chess-sq', dark ? 'dark' : 'light', i === selected ? 'sel' : '', last && (i === last.from || i === last.to) ? 'last' : '', i === check ? 'check' : '', tgt ? (p ? 'take' : 'dot') : ''].filter(Boolean).join(' ');
        return `<button class="${cls}" data-sq="${i}" aria-label="${'abcdefgh'[i % 8]}${8 - Math.floor(i / 8)} ${p || 'empty'}">${p ? `<span class="pc ${p === p.toUpperCase() ? 'w' : 'b'}">${GLYPH[p]}&#xFE0E;</span>` : ''}</button>`;
      })
      .join('');
    logEl.textContent = log.slice(-8).join('  ');
  };

  const end = (outcome: 'win' | 'loss' | 'draw', why: string) => {
    finished = true;
    const r = settleChess(s, opp, stake, outcome);
    host.saved();
    host.onRating?.(chessOf(s).rating);
    host.onChess?.(outcome, opp.id);
    if (outcome === 'win') (sfx.cheer(), burstAt(boardEl, ['♛', '🏆', '✨', '🎉'], 18), shakeEl(boardEl, true));
    else if (outcome === 'loss') sfx.bad();
    say.textContent = `“${outcome === 'win' ? line(LOST, opp.id) : outcome === 'loss' ? line(TOOK, opp.id) : 'A draw. Respectable.'}”`;
    status.innerHTML = `<b>${outcome === 'win' ? '🏆 You win' : outcome === 'loss' ? '😤 You lose' : '🤝 Draw'}</b> (${esc(why)}). ${esc(r.text)} <span class="sub">${r.ratingDelta >= 0 ? '+' : ''}${r.ratingDelta}</span>`;
    const btn = el.querySelector<HTMLButtonElement>('[data-act="resign"]')!;
    btn.textContent = 'Done';
    btn.dataset.act = 'close';
  };

  const checkEnd = (): boolean => {
    const r = result(pos);
    if (!r.over) return false;
    const why = { checkmate: 'checkmate', stalemate: 'stalemate', fifty: '50 quiet moves', material: 'not enough pieces to mate', resign: 'resigned' }[r.why];
    end(r.winner === 'w' ? 'win' : r.winner === 'b' ? 'loss' : 'draw', why);
    return true;
  };

  const theirTurn = () => {
    thinking = true;
    status.textContent = `${opp.name} is thinking…`;
    window.setTimeout(() => {
      if (finished) return;
      const m = bestMove(pos, opp);
      if (!m) return void checkEnd();
      const took = pos.board[m.to];
      log.push(`…${moveLabel(pos, m)}`);
      pos = play(pos, m);
      last = m;
      thinking = false;
      sfx.tick();
      if (took) say.textContent = `“${line(TOOK, opp.id)}”`;
      else if (Math.random() < 0.3) say.textContent = `“${TALK[opp.id]?.[Math.floor(Math.random() * 3)] ?? '…'}”`;
      draw();
      if (took) {
        const sq = boardEl.querySelector<HTMLElement>(`[data-sq="${m.to}"]`);
        if (sq) (shakeEl(sq), popAt(sq, GLYPH[took] ?? '✕', { color: '#e0283f', size: 26 }));
      }
      if (inCheck(pos)) {
        shakeEl(boardEl);
        popAt(boardEl, 'CHECK!', { color: '#e0283f', size: 30 });
      }
      if (!checkEnd()) status.textContent = inCheck(pos) ? 'Check! Your move.' : 'Your move.';
    }, 350);
  };

  boardEl.addEventListener('click', (e) => {
    if (finished || thinking) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-sq]');
    if (!t) return;
    const i = Number(t.dataset.sq);
    const move = targets.find((m) => m.to === i && (!m.promo || m.promo === 'Q'));
    if (move) {
      const took = pos.board[move.to];
      log.push(`${Math.floor(log.length / 2) + 1}. ${moveLabel(pos, move)}`);
      pos = play(pos, move);
      last = move;
      selected = -1;
      targets = [];
      took ? sfx.punch() : sfx.tap();
      draw();
      if (took) {
        const sq = boardEl.querySelector<HTMLElement>(`[data-sq="${move.to}"]`);
        if (sq) (burstAt(sq, ['💥', '✨'], 6), popAt(sq, GLYPH[took] ?? '✕', { color: '#ffd23f', size: 26 }));
        say.textContent = `“${line(LOST, opp.id)}”`;
      }
      if (inCheck(pos)) {
        popAt(boardEl, 'CHECK!', { color: '#ffd23f', size: 30 });
        say.textContent = `“${line(CHECKED, opp.id)}”`;
      }
      if (!checkEnd()) theirTurn();
      return;
    }
    if (pos.board[i] && pos.board[i] === pos.board[i].toUpperCase()) {
      selected = i;
      targets = legalMoves(pos).filter((m) => m.from === i);
      if (!targets.length) status.textContent = 'That piece can’t move.';
    } else {
      selected = -1;
      targets = [];
    }
    draw();
  });
  onAct(el, (act) => {
    if (act === 'resign' && !finished) return end('loss', 'you resigned');
    if (act === 'close') el.remove();
  });
  draw();
}
