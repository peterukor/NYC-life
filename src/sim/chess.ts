// =====================================================================
// chess.ts — real chess for the Chess House (Peter, 2026-10-15: "add a
// chess house").
//
// Full rules: castling, en passant, promotion (to a queen, or pick),
// check, checkmate, stalemate, 50-move rule, bare-kings draw. The
// opponents are an alpha-beta search with material + piece-square
// tables; easier ones search shallower and blunder on purpose now and
// then, so a beginner can win and a grandmaster is a real fight.
//
// Board: 64 squares, index 0 = a8 … 63 = h1 (row 0 is Black's back rank).
// Pieces: 'P N B R Q K' for White, lower case for Black, '' empty.
// =====================================================================

export type Color = 'w' | 'b';
export interface Move {
  from: number;
  to: number;
  /** Promotion piece (upper/lower case matches the mover). */
  promo?: string;
  castle?: 'K' | 'Q';
  ep?: boolean;
  capture?: string;
}

export interface Position {
  board: string[];
  turn: Color;
  /** Castling rights: 'KQkq' subset. */
  castling: string;
  /** En passant target square (index) or -1. */
  ep: number;
  /** Half-moves since a capture or pawn move (50-move rule). */
  halfmove: number;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function fromFen(fen: string): Position {
  const [rows, turn, castling, ep, half] = fen.split(' ');
  const board: string[] = [];
  for (const ch of rows.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) board.push('');
    else board.push(ch);
  }
  return { board, turn: turn as Color, castling: castling === '-' ? '' : castling, ep: ep === '-' ? -1 : sq(ep), halfmove: Number(half) || 0 };
}

export const file = (i: number) => i % 8;
export const rank = (i: number) => 8 - Math.floor(i / 8);
export const name = (i: number) => `${'abcdefgh'[file(i)]}${rank(i)}`;
export function sq(n: string): number {
  return (8 - Number(n[1])) * 8 + 'abcdefgh'.indexOf(n[0]);
}
export const colorOf = (p: string): Color | null => (!p ? null : p === p.toUpperCase() ? 'w' : 'b');
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const at = (r: number, f: number) => (r >= 0 && r < 8 && f >= 0 && f < 8 ? r * 8 + f : -1);

/** Is square `i` attacked by colour `by`? */
export function attacked(pos: Position, i: number, by: Color): boolean {
  const b = pos.board;
  const r = Math.floor(i / 8), f = i % 8;
  const own = (p: string, t: string) => p === (by === 'w' ? t.toUpperCase() : t.toLowerCase());
  // Pawns.
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const df of [-1, 1]) {
    const j = at(pr, f + df);
    if (j >= 0 && own(b[j], 'p')) return true;
  }
  for (const [dr, df] of KNIGHT) {
    const j = at(r + dr, f + df);
    if (j >= 0 && own(b[j], 'n')) return true;
  }
  for (const [dr, df] of KING) {
    const j = at(r + dr, f + df);
    if (j >= 0 && own(b[j], 'k')) return true;
  }
  for (const [dirs, pieces] of [[DIAG, 'bq'], [ORTHO, 'rq']] as const) {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        const p = b[rr * 8 + ff];
        if (p) {
          if (colorOf(p) === by && pieces.includes(p.toLowerCase())) return true;
          break;
        }
        rr += dr;
        ff += df;
      }
    }
  }
  return false;
}

export function kingSquare(pos: Position, c: Color): number {
  return pos.board.indexOf(c === 'w' ? 'K' : 'k');
}

export function inCheck(pos: Position, c = pos.turn): boolean {
  const k = kingSquare(pos, c);
  return k >= 0 && attacked(pos, k, other(c));
}

/** Moves ignoring whether your own king is left in check. */
function pseudoMoves(pos: Position): Move[] {
  const out: Move[] = [];
  const b = pos.board;
  const me = pos.turn;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || colorOf(p) !== me) continue;
    const r = Math.floor(i / 8), f = i % 8;
    const t = p.toLowerCase();
    const add = (to: number) => {
      const cap = b[to];
      if (cap && colorOf(cap) === me) return false;
      out.push({ from: i, to, capture: cap || undefined });
      return !cap;
    };
    if (t === 'p') {
      const dir = me === 'w' ? -1 : 1;
      const startRow = me === 'w' ? 6 : 1;
      const lastRow = me === 'w' ? 0 : 7;
      const one = at(r + dir, f);
      const promos = (from: number, to: number, cap?: string) => {
        if (Math.floor(to / 8) === lastRow) for (const q of 'qrbn') out.push({ from, to, capture: cap, promo: me === 'w' ? q.toUpperCase() : q });
        else out.push({ from, to, capture: cap });
      };
      if (one >= 0 && !b[one]) {
        promos(i, one);
        const two = at(r + 2 * dir, f);
        if (r === startRow && !b[two]) out.push({ from: i, to: two });
      }
      for (const df of [-1, 1]) {
        const j = at(r + dir, f + df);
        if (j < 0) continue;
        if (b[j] && colorOf(b[j]) !== me) promos(i, j, b[j]);
        if (j === pos.ep) out.push({ from: i, to: j, ep: true, capture: me === 'w' ? 'p' : 'P' });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, df] of t === 'n' ? KNIGHT : KING) {
        const j = at(r + dr, f + df);
        if (j >= 0) add(j);
      }
      if (t === 'k') {
        const home = me === 'w' ? 60 : 4;
        if (i === home && !inCheck(pos, me)) {
          const [kR, qR] = me === 'w' ? ['K', 'Q'] : ['k', 'q'];
          const rook = me === 'w' ? 'R' : 'r';
          if (pos.castling.includes(kR) && !b[home + 1] && !b[home + 2] && b[home + 3] === rook && !attacked(pos, home + 1, other(me)) && !attacked(pos, home + 2, other(me))) out.push({ from: i, to: home + 2, castle: 'K' });
          if (pos.castling.includes(qR) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === rook && !attacked(pos, home - 1, other(me)) && !attacked(pos, home - 2, other(me))) out.push({ from: i, to: home - 2, castle: 'Q' });
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTHO : [...DIAG, ...ORTHO];
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          if (!add(rr * 8 + ff)) break;
          rr += dr;
          ff += df;
        }
      }
    }
  }
  return out;
}

/** Play a move, returning the new position (the old one is untouched). */
export function play(pos: Position, m: Move): Position {
  const b = pos.board.slice();
  const p = b[m.from];
  const me = pos.turn;
  b[m.to] = m.promo ?? p;
  b[m.from] = '';
  if (m.ep) b[m.to + (me === 'w' ? 8 : -8)] = '';
  if (m.castle) {
    const home = me === 'w' ? 60 : 4;
    if (m.castle === 'K') {
      b[home + 1] = b[home + 3];
      b[home + 3] = '';
    } else {
      b[home - 1] = b[home - 4];
      b[home - 4] = '';
    }
  }
  let castling = pos.castling;
  const strip = (chars: string) => (castling = castling.split('').filter((c) => !chars.includes(c)).join(''));
  if (p === 'K') strip('KQ');
  if (p === 'k') strip('kq');
  for (const s of [m.from, m.to]) {
    if (s === 63) strip('K');
    if (s === 56) strip('Q');
    if (s === 7) strip('k');
    if (s === 0) strip('q');
  }
  const pawn = p.toLowerCase() === 'p';
  const ep = pawn && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;
  return { board: b, turn: other(me), castling, ep, halfmove: pawn || m.capture ? 0 : pos.halfmove + 1 };
}

/** Every legal move for the side to move. */
export function legalMoves(pos: Position): Move[] {
  return pseudoMoves(pos).filter((m) => !inCheck(play(pos, m), pos.turn));
}

export type Result = { over: false } | { over: true; winner: Color | null; why: 'checkmate' | 'stalemate' | 'fifty' | 'material' | 'resign' };

export function result(pos: Position): Result {
  const moves = legalMoves(pos);
  if (!moves.length) return inCheck(pos) ? { over: true, winner: other(pos.turn), why: 'checkmate' } : { over: true, winner: null, why: 'stalemate' };
  if (pos.halfmove >= 100) return { over: true, winner: null, why: 'fifty' };
  const left = pos.board.filter((p) => p && p.toLowerCase() !== 'k');
  if (!left.length || (left.length === 1 && 'nb'.includes(left[0].toLowerCase()))) return { over: true, winner: null, why: 'material' };
  return { over: false };
}

// ---------------------------------------------------------------------
// The opponent
// ---------------------------------------------------------------------

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Piece-square tables (White's view, index 0 = a8). Simple, classic.
const PST: Record<string, number[]> = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

/** Score from White's point of view (centipawns). */
export function evaluate(pos: Position): number {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (!p) continue;
    const t = p.toLowerCase();
    if (p === p.toUpperCase()) s += VALUE[t] + PST[t][i];
    else s -= VALUE[t] + PST[t][(7 - Math.floor(i / 8)) * 8 + (i % 8)];
  }
  return s;
}

function order(moves: Move[]): Move[] {
  return moves.sort((a, b) => (b.capture ? VALUE[b.capture.toLowerCase()] * 10 : 0) + (b.promo ? 800 : 0) - ((a.capture ? VALUE[a.capture.toLowerCase()] * 10 : 0) + (a.promo ? 800 : 0)));
}

function search(pos: Position, depth: number, alpha: number, beta: number, budget: { n: number }): number {
  if (--budget.n < 0) return evaluate(pos) * (pos.turn === 'w' ? 1 : -1);
  const moves = legalMoves(pos);
  if (!moves.length) return inCheck(pos) ? -100_000 - depth : 0;
  if (depth === 0) return evaluate(pos) * (pos.turn === 'w' ? 1 : -1);
  for (const m of order(moves)) {
    const v = -search(play(pos, m), depth - 1, -beta, -alpha, budget);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

export interface Opponent {
  id: string;
  name: string;
  emoji: string;
  /** Plies the search looks ahead. */
  depth: number;
  /** Chance per move of playing a plausible-but-worse move. */
  blunder: number;
  /** What they're like. */
  blurb: string;
  /** Rating shown (and used for yours). */
  rating: number;
  /** Bets they'll take (cents). */
  stakes: number[];
}

export const OPPONENTS: Opponent[] = [
  { id: 'kid', name: 'Kid Kasparov', emoji: '🧒', depth: 1, blunder: 0.35, rating: 800, blurb: 'Nine years old. Very confident. Will tell you about Minecraft.', stakes: [0, 500] },
  { id: 'professor', name: 'Professor Pawn', emoji: '👴', depth: 2, blunder: 0.15, rating: 1200, blurb: 'Retired math teacher. Plays slow, talks slower, punishes every mistake eventually.', stakes: [0, 2_000, 5_000] },
  { id: 'eddie', name: 'Fast Eddie', emoji: '😎', depth: 2, blunder: 0.04, rating: 1500, blurb: 'Washington Square legend. Hustles tourists for $20 a game. Talks trash the whole time.', stakes: [2_000, 10_000, 50_000] },
  { id: 'gloria', name: 'Grandmaster Gloria', emoji: '👑', depth: 3, blunder: 0, rating: 2100, blurb: 'An actual grandmaster. Plays you while doing a crossword. Beat her and the whole house stands up.', stakes: [10_000, 100_000, 500_000] },
];
export const OPPONENT_BY_ID: Record<string, Opponent> = Object.fromEntries(OPPONENTS.map((o) => [o.id, o]));

/** The opponent's move (null if none). */
export function bestMove(pos: Position, opp: Opponent, rand = Math.random): Move | null {
  const moves = legalMoves(pos);
  if (!moves.length) return null;
  const budget = { n: 60_000 };
  const scored = order(moves.slice()).map((m) => ({ m, v: -search(play(pos, m), opp.depth - 1, -Infinity, Infinity, budget) }));
  scored.sort((a, b) => b.v - a.v);
  // Easier opponents sometimes pick from the next-best few (never a mate-in-one miss on purpose at depth ≥ 2).
  if (rand() < opp.blunder && scored.length > 1) {
    const pool = scored.slice(1, Math.min(scored.length, 4)).filter((x) => x.v > -50_000);
    if (pool.length) return pool[Math.floor(rand() * pool.length)].m;
  }
  const top = scored.filter((x) => x.v >= scored[0].v - 10);
  return top[Math.floor(rand() * top.length)].m;
}

/** "e2e4"-style label for a move (for the log). */
export function moveLabel(pos: Position, m: Move): string {
  if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
  const p = pos.board[m.from].toUpperCase();
  return `${p === 'P' ? '' : p}${m.capture ? (p === 'P' ? 'abcdefgh'[file(m.from)] : '') + 'x' : ''}${name(m.to)}${m.promo ? `=${m.promo.toUpperCase()}` : ''}`;
}
