// =====================================================================
// chess.ts — real chess for the Chess House and the park tables (Peter,
// 2026-10-15: "add a chess house"; 2026-10-28: "can you fix… chess…").
//
// Three layers, no DOM anywhere (the engine also runs in a Web Worker,
// ui/chess-worker.ts):
//
//   1. Board — a fast 0x88 board with make/unmake, Zobrist hashing and
//      full rules: castling (both sides, every condition), en passant,
//      promotion to any piece, check. Verified by perft in
//      tests/chess.test.ts (start position to depth 4, Kiwipete to 3…).
//   2. ChessGame — a game in progress: the move list in algebraic
//      notation (SAN), undo, and every way a game ends: checkmate,
//      stalemate, threefold repetition, the fifty-move rule and
//      insufficient material.
//   3. The engine — iterative-deepening alpha-beta (PVS) with a
//      transposition table, MVV-LVA / killer / history move ordering,
//      null-move pruning, late-move reductions, quiescence search and a
//      tapered evaluation (piece-square tables, pawn structure, king
//      safety, mop-up for mating). Each opponent gets a depth cap, a time
//      budget, a "spread" (how far from the best move they'll wander),
//      a blunder chance and a style (aggression, king safety, contempt).
//
// The old position-object API (Position, fromFen, play, legalMoves,
// result, bestMove, …) is kept as a thin layer over the Board.
// Public square indices: 0 = a8 … 63 = h1 (row 0 is Black's back rank).
// =====================================================================

export type Color = 'w' | 'b';

// ----------------------------------------------------------------- pieces
// Piece codes: type 1..6 (P N B R Q K), +8 for Black. 0 = empty.
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const WHITE = 0, BLACK = 1;
const CHARS = ' PNBRQK  pnbrqk';
const pieceOf = (ch: string): number => {
  const i = CHARS.indexOf(ch);
  return i > 0 ? i : 0;
};

// Move flags (bits 14..18).
const F_CAP = 1, F_EP = 2, F_DBL = 4, F_CK = 8, F_CQ = 16;
const mkMove = (from: number, to: number, flags: number, promo = 0) => from | (to << 7) | (flags << 14) | (promo << 20);
export const mFrom = (m: number) => m & 127;
export const mTo = (m: number) => (m >> 7) & 127;
export const mFlags = (m: number) => (m >> 14) & 31;
export const mPromo = (m: number) => (m >> 20) & 7;

/** Public index (0 = a8) ↔ 0x88 square. */
export const to88 = (i: number) => ((i >> 3) << 4) | (i & 7);
export const from88 = (s: number) => (s >> 4) * 8 + (s & 7);
const sqName88 = (s: number) => `${'abcdefgh'[s & 7]}${8 - (s >> 4)}`;
const sq88 = (n: string) => ((8 - Number(n[1])) << 4) | 'abcdefgh'.indexOf(n[0]);

const KNIGHT_D = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING_D = [-17, -16, -15, -1, 1, 15, 16, 17];
const BISHOP_D = [-17, -15, 15, 17];
const ROOK_D = [-16, -1, 1, 16];

// Castling rights bits: 1 = K, 2 = Q, 4 = k, 8 = q.
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[116] = 12; // e1
CASTLE_MASK[119] = 14; // h1
CASTLE_MASK[112] = 13; // a1
CASTLE_MASK[4] = 3; // e8
CASTLE_MASK[7] = 11; // h8
CASTLE_MASK[0] = 7; // a8

// ---------------------------------------------------------------- Zobrist
// Two 32-bit halves: one indexes the transposition table, both verify.
let seed = 0x9e3779b9;
const rnd32 = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed | 0;
};
const Z_LO = new Int32Array(16 * 128), Z_HI = new Int32Array(16 * 128);
for (let i = 0; i < Z_LO.length; i++) (Z_LO[i] = rnd32(), Z_HI[i] = rnd32());
const Z_SIDE_LO = rnd32(), Z_SIDE_HI = rnd32();
const Z_CASTLE_LO = Int32Array.from({ length: 16 }, rnd32), Z_CASTLE_HI = Int32Array.from({ length: 16 }, rnd32);
const Z_EP_LO = Int32Array.from({ length: 8 }, rnd32), Z_EP_HI = Int32Array.from({ length: 8 }, rnd32);

const MAX_HIST = 2048;

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The fast board. Mutable: make() / unmake(). */
export class Board {
  sq = new Int8Array(128);
  turn = WHITE;
  castling = 0;
  ep = -1;
  half = 0;
  fullmove = 1;
  kings = [0, 0];
  hashLo = 0;
  hashHi = 0;
  // Undo stack (one entry per make, including null moves).
  ply = 0;
  private uMove = new Int32Array(MAX_HIST);
  private uCap = new Int8Array(MAX_HIST);
  private uCastle = new Int8Array(MAX_HIST);
  private uEp = new Int16Array(MAX_HIST);
  private uHalf = new Int16Array(MAX_HIST);
  /** Hash of every position reached (index = ply), for repetitions. */
  histLo = new Int32Array(MAX_HIST + 1);
  histHi = new Int32Array(MAX_HIST + 1);

  static fromFen(fen: string): Board {
    const b = new Board();
    const [rows, turn, castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
    let r = 0, f = 0;
    for (const ch of rows) {
      if (ch === '/') (r++, (f = 0));
      else if (/\d/.test(ch)) f += Number(ch);
      else {
        const p = pieceOf(ch);
        const s = (r << 4) | f;
        b.sq[s] = p;
        if ((p & 7) === K) b.kings[p >> 3] = s;
        f++;
      }
    }
    b.turn = turn === 'b' ? BLACK : WHITE;
    b.castling = (castling.includes('K') ? 1 : 0) | (castling.includes('Q') ? 2 : 0) | (castling.includes('k') ? 4 : 0) | (castling.includes('q') ? 8 : 0);
    b.ep = ep === '-' ? -1 : sq88(ep);
    b.half = Number(half) || 0;
    b.fullmove = Number(full) || 1;
    b.rehash();
    return b;
  }

  clone(): Board {
    const b = Board.fromFen(this.fen());
    return b;
  }

  fen(): string {
    let out = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.sq[(r << 4) | f];
        if (!p) empty++;
        else {
          if (empty) (out += empty, (empty = 0));
          out += CHARS[p];
        }
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    const c = this.castling;
    const cs = `${c & 1 ? 'K' : ''}${c & 2 ? 'Q' : ''}${c & 4 ? 'k' : ''}${c & 8 ? 'q' : ''}` || '-';
    return `${out} ${this.turn ? 'b' : 'w'} ${cs} ${this.ep < 0 ? '-' : sqName88(this.ep)} ${this.half} ${this.fullmove}`;
  }

  private rehash(): void {
    let lo = 0, hi = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88 || !this.sq[s]) continue;
      lo ^= Z_LO[this.sq[s] * 128 + s];
      hi ^= Z_HI[this.sq[s] * 128 + s];
    }
    if (this.turn) (lo ^= Z_SIDE_LO, (hi ^= Z_SIDE_HI));
    lo ^= Z_CASTLE_LO[this.castling];
    hi ^= Z_CASTLE_HI[this.castling];
    if (this.ep >= 0) (lo ^= Z_EP_LO[this.ep & 7], (hi ^= Z_EP_HI[this.ep & 7]));
    this.hashLo = lo;
    this.hashHi = hi;
    this.histLo[this.ply] = lo;
    this.histHi[this.ply] = hi;
  }

  /** Is 0x88 square `s` attacked by side `by`? */
  attacked(s: number, by: number): boolean {
    const b = this.sq;
    const c8 = by << 3;
    // Pawns.
    if (by === WHITE) {
      if (!((s + 15) & 0x88) && b[s + 15] === P) return true;
      if (!((s + 17) & 0x88) && b[s + 17] === P) return true;
    } else {
      if (!((s - 15) & 0x88) && b[s - 15] === (P | 8)) return true;
      if (!((s - 17) & 0x88) && b[s - 17] === (P | 8)) return true;
    }
    for (let i = 0; i < 8; i++) {
      const t = s + KNIGHT_D[i];
      if (!(t & 0x88) && b[t] === (N | c8)) return true;
    }
    for (let i = 0; i < 8; i++) {
      const t = s + KING_D[i];
      if (!(t & 0x88) && b[t] === (K | c8)) return true;
    }
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_D[i];
      for (let t = s + d; !(t & 0x88); t += d) {
        const p = b[t];
        if (p) {
          if (p === (B | c8) || p === (Q | c8)) return true;
          break;
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = ROOK_D[i];
      for (let t = s + d; !(t & 0x88); t += d) {
        const p = b[t];
        if (p) {
          if (p === (R | c8) || p === (Q | c8)) return true;
          break;
        }
      }
    }
    return false;
  }

  inCheck(side = this.turn): boolean {
    return this.attacked(this.kings[side], side ^ 1);
  }

  /** Pseudo-legal moves (own king may be left in check: make() rejects those). */
  gen(out: number[], capturesOnly = false): void {
    const b = this.sq;
    const me = this.turn;
    const them = me ^ 1;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = b[s];
      if (!p || p >> 3 !== me) continue;
      const t = p & 7;
      if (t === P) {
        const dir = me === WHITE ? -16 : 16;
        const startRow = me === WHITE ? 6 : 1;
        const lastRow = me === WHITE ? 0 : 7;
        const one = s + dir;
        const promoting = one >> 4 === lastRow;
        if (!b[one] && (!capturesOnly || promoting)) {
          if (promoting) for (let pr = Q; pr >= N; pr--) out.push(mkMove(s, one, 0, pr));
          else {
            out.push(mkMove(s, one, 0));
            if (s >> 4 === startRow && !b[one + dir]) out.push(mkMove(s, one + dir, F_DBL));
          }
        }
        for (const dx of [-1, 1]) {
          const to = one + dx;
          if (to & 0x88) continue;
          const q = b[to];
          if (q && q >> 3 === them) {
            if (promoting) for (let pr = Q; pr >= N; pr--) out.push(mkMove(s, to, F_CAP, pr));
            else out.push(mkMove(s, to, F_CAP));
          } else if (to === this.ep) out.push(mkMove(s, to, F_CAP | F_EP));
        }
      } else if (t === N || t === K) {
        const D = t === N ? KNIGHT_D : KING_D;
        for (let i = 0; i < 8; i++) {
          const to = s + D[i];
          if (to & 0x88) continue;
          const q = b[to];
          if (!q) {
            if (!capturesOnly) out.push(mkMove(s, to, 0));
          } else if (q >> 3 === them) out.push(mkMove(s, to, F_CAP));
        }
        if (t === K && !capturesOnly) {
          if (me === WHITE && s === 116) {
            if (this.castling & 1 && !b[117] && !b[118] && b[119] === R && !this.attacked(116, them) && !this.attacked(117, them) && !this.attacked(118, them)) out.push(mkMove(116, 118, F_CK));
            if (this.castling & 2 && !b[115] && !b[114] && !b[113] && b[112] === R && !this.attacked(116, them) && !this.attacked(115, them) && !this.attacked(114, them)) out.push(mkMove(116, 114, F_CQ));
          } else if (me === BLACK && s === 4) {
            if (this.castling & 4 && !b[5] && !b[6] && b[7] === (R | 8) && !this.attacked(4, them) && !this.attacked(5, them) && !this.attacked(6, them)) out.push(mkMove(4, 6, F_CK));
            if (this.castling & 8 && !b[3] && !b[2] && !b[1] && b[0] === (R | 8) && !this.attacked(4, them) && !this.attacked(3, them) && !this.attacked(2, them)) out.push(mkMove(4, 2, F_CQ));
          }
        }
      } else {
        const D = t === B ? BISHOP_D : t === R ? ROOK_D : KING_D;
        const n = t === Q ? 8 : 4;
        for (let i = 0; i < n; i++) {
          const d = D[i];
          for (let to = s + d; !(to & 0x88); to += d) {
            const q = b[to];
            if (!q) {
              if (!capturesOnly) out.push(mkMove(s, to, 0));
            } else {
              if (q >> 3 === them) out.push(mkMove(s, to, F_CAP));
              break;
            }
          }
        }
      }
    }
  }

  /** Play a pseudo-legal move. Returns false (and takes it back) if it leaves your king in check. */
  make(m: number): boolean {
    const from = m & 127, to = (m >> 7) & 127, fl = (m >> 14) & 31, pr = (m >> 20) & 7;
    const b = this.sq;
    const me = this.turn;
    const piece = b[from];
    const capSq = fl & F_EP ? to + (me === WHITE ? 16 : -16) : to;
    const cap = fl & F_CAP ? b[capSq] : 0;
    const i = this.ply;
    this.uMove[i] = m;
    this.uCap[i] = cap;
    this.uCastle[i] = this.castling;
    this.uEp[i] = this.ep;
    this.uHalf[i] = this.half;
    let lo = this.hashLo, hi = this.hashHi;
    // Lift the mover; drop the captured piece.
    lo ^= Z_LO[piece * 128 + from];
    hi ^= Z_HI[piece * 128 + from];
    if (cap) {
      lo ^= Z_LO[cap * 128 + capSq];
      hi ^= Z_HI[cap * 128 + capSq];
      b[capSq] = 0;
    }
    const placed = pr ? pr | (me << 3) : piece;
    b[from] = 0;
    b[to] = placed;
    lo ^= Z_LO[placed * 128 + to];
    hi ^= Z_HI[placed * 128 + to];
    if (fl & (F_CK | F_CQ)) {
      const rFrom = fl & F_CK ? to + 1 : to - 2;
      const rTo = fl & F_CK ? to - 1 : to + 1;
      const rook = b[rFrom];
      b[rFrom] = 0;
      b[rTo] = rook;
      lo ^= Z_LO[rook * 128 + rFrom] ^ Z_LO[rook * 128 + rTo];
      hi ^= Z_HI[rook * 128 + rFrom] ^ Z_HI[rook * 128 + rTo];
    }
    if ((piece & 7) === K) this.kings[me] = to;
    lo ^= Z_CASTLE_LO[this.castling];
    hi ^= Z_CASTLE_HI[this.castling];
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    lo ^= Z_CASTLE_LO[this.castling];
    hi ^= Z_CASTLE_HI[this.castling];
    if (this.ep >= 0) (lo ^= Z_EP_LO[this.ep & 7], (hi ^= Z_EP_HI[this.ep & 7]));
    this.ep = fl & F_DBL ? (from + to) >> 1 : -1;
    if (this.ep >= 0) (lo ^= Z_EP_LO[this.ep & 7], (hi ^= Z_EP_HI[this.ep & 7]));
    this.half = (piece & 7) === P || cap ? 0 : this.half + 1;
    if (me === BLACK) this.fullmove++;
    this.turn = me ^ 1;
    lo ^= Z_SIDE_LO;
    hi ^= Z_SIDE_HI;
    this.hashLo = lo;
    this.hashHi = hi;
    this.ply = i + 1;
    this.histLo[i + 1] = lo;
    this.histHi[i + 1] = hi;
    if (this.attacked(this.kings[me], me ^ 1)) {
      this.unmake();
      return false;
    }
    return true;
  }

  unmake(): void {
    const i = --this.ply;
    const m = this.uMove[i];
    const b = this.sq;
    if (m === 0) {
      // Null move.
      this.turn ^= 1;
      this.ep = this.uEp[i];
      this.hashLo = this.histLo[i];
      this.hashHi = this.histHi[i];
      return;
    }
    const from = m & 127, to = (m >> 7) & 127, fl = (m >> 14) & 31, pr = (m >> 20) & 7;
    const me = this.turn ^ 1;
    const piece = pr ? P | (me << 3) : b[to];
    b[from] = piece;
    b[to] = 0;
    const cap = this.uCap[i];
    if (cap) b[fl & F_EP ? to + (me === WHITE ? 16 : -16) : to] = cap;
    if (fl & (F_CK | F_CQ)) {
      const rFrom = fl & F_CK ? to + 1 : to - 2;
      const rTo = fl & F_CK ? to - 1 : to + 1;
      b[rFrom] = b[rTo];
      b[rTo] = 0;
    }
    if ((piece & 7) === K) this.kings[me] = from;
    if (me === BLACK) this.fullmove--;
    this.turn = me;
    this.castling = this.uCastle[i];
    this.ep = this.uEp[i];
    this.half = this.uHalf[i];
    this.hashLo = this.histLo[i];
    this.hashHi = this.histHi[i];
  }

  /** Pass the turn (search only; never when in check). */
  makeNull(): void {
    const i = this.ply;
    this.uMove[i] = 0;
    this.uEp[i] = this.ep;
    let lo = this.hashLo ^ Z_SIDE_LO, hi = this.hashHi ^ Z_SIDE_HI;
    if (this.ep >= 0) (lo ^= Z_EP_LO[this.ep & 7], (hi ^= Z_EP_HI[this.ep & 7]));
    this.ep = -1;
    this.turn ^= 1;
    this.hashLo = lo;
    this.hashHi = hi;
    this.ply = i + 1;
    this.histLo[i + 1] = lo;
    this.histHi[i + 1] = hi;
  }

  /** Every legal move. */
  legal(): number[] {
    const out: number[] = [];
    const ps: number[] = [];
    this.gen(ps);
    for (const m of ps) if (this.make(m)) (this.unmake(), out.push(m));
    return out;
  }

  /** Has this position occurred before since the last irreversible move (search: twofold = draw)? */
  repeated(): boolean {
    const lo = this.hashLo, hi = this.hashHi;
    const stop = Math.max(0, this.ply - this.half);
    for (let i = this.ply - 2; i >= stop; i -= 2) if (this.histLo[i] === lo && this.histHi[i] === hi) return true;
    return false;
  }

  uci(m: number): string {
    const pr = mPromo(m);
    return `${sqName88(mFrom(m))}${sqName88(mTo(m))}${pr ? ' pnbrq'[pr] : ''}`;
  }

  /** The legal move with this UCI text (e2e4, e7e8q), or 0. */
  parseUci(u: string): number {
    for (const m of this.legal()) if (this.uci(m) === u) return m;
    return 0;
  }

  /** Standard algebraic notation for a legal move (Nbd7, exd6, O-O, e8=Q+, Qh4#). */
  san(m: number): string {
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), pr = mPromo(m);
    const t = this.sq[from] & 7;
    let s: string;
    if (fl & F_CK) s = 'O-O';
    else if (fl & F_CQ) s = 'O-O-O';
    else {
      s = '';
      if (t === P) {
        if (fl & F_CAP) s += 'abcdefgh'[from & 7];
      } else {
        s += ' PNBRQK'[t];
        const rivals = this.legal().filter((x) => x !== m && mTo(x) === to && (this.sq[mFrom(x)] & 7) === t);
        if (rivals.length) {
          const sameFile = rivals.some((x) => (mFrom(x) & 7) === (from & 7));
          const sameRank = rivals.some((x) => mFrom(x) >> 4 === from >> 4);
          if (!sameFile) s += 'abcdefgh'[from & 7];
          else if (!sameRank) s += String(8 - (from >> 4));
          else s += sqName88(from);
        }
      }
      if (fl & F_CAP) s += 'x';
      s += sqName88(to);
      if (pr) s += `=${' PNBRQK'[pr]}`;
    }
    this.make(m);
    if (this.inCheck()) s += this.legal().length ? '+' : '#';
    this.unmake();
    return s;
  }

  /** Material on the board, for the draw rules: can anyone still mate? */
  insufficient(): boolean {
    const minors: { t: number; light: boolean }[] = [];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const t = this.sq[s] & 7;
      if (!t || t === K) continue;
      if (t === P || t === R || t === Q) return false;
      minors.push({ t, light: (((s >> 4) + (s & 7)) & 1) === 0 });
    }
    if (minors.length <= 1) return true;
    // Only bishops, all on one colour of square: nobody can ever mate.
    return minors.every((x) => x.t === B) && minors.every((x) => x.light === minors[0].light);
  }

  /** Could `side` ever deliver mate with what it has left (for running out of time)? */
  canMate(side: number): boolean {
    let minors = 0, bishopsL = 0, bishopsD = 0, knights = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = this.sq[s];
      if (!p || p >> 3 !== side) continue;
      const t = p & 7;
      if (t === P || t === R || t === Q) return true;
      if (t === N) (knights++, minors++);
      if (t === B) ((((s >> 4) + (s & 7)) & 1) === 0 ? bishopsL++ : bishopsD++, minors++);
    }
    if (minors >= 2 && !(knights === 0 && (bishopsL === 0 || bishopsD === 0))) return true;
    // A lone minor (or same-colour bishops) can still mate with help from the other side's pieces.
    if (minors >= 1) {
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) continue;
        const p = this.sq[s];
        if (p && p >> 3 !== side && (p & 7) !== K) return true;
      }
    }
    return false;
  }

  /** Repetition key for threefold: placement, side, castling, and en passant only when it can really be taken. */
  repKey(): string {
    const f = this.fen().split(' ');
    let ep = '-';
    if (this.ep >= 0 && this.legal().some((m) => mFlags(m) & F_EP)) ep = f[3];
    return `${f[0]} ${f[1]} ${f[2]} ${ep}`;
  }
}

/** Count leaf nodes to `depth` (move generator test). */
export function perft(b: Board, depth: number): number {
  if (depth === 0) return 1;
  const moves: number[] = [];
  b.gen(moves);
  let n = 0;
  for (const m of moves) {
    if (!b.make(m)) continue;
    n += depth === 1 ? 1 : perft(b, depth - 1);
    b.unmake();
  }
  return n;
}

// =====================================================================
// A game in progress
// =====================================================================

export type EndWhy = 'checkmate' | 'stalemate' | 'fifty' | 'material' | 'threefold' | 'resign' | 'time' | 'agreed';
export type Result = { over: false } | { over: true; winner: Color | null; why: EndWhy };

export interface PlayedMove {
  /** Engine move code. */
  code: number;
  uci: string;
  san: string;
  color: Color;
  /** Public squares (0 = a8). */
  from: number;
  to: number;
  /** Captured piece letter ('' when none). */
  captured: string;
  promo: string;
  castle: '' | 'K' | 'Q';
  ep: boolean;
}

export class ChessGame {
  readonly startFen: string;
  board: Board;
  moves: PlayedMove[] = [];
  private keys: string[];

  constructor(fen = START_FEN) {
    this.board = Board.fromFen(fen);
    this.startFen = this.board.fen();
    this.keys = [this.board.repKey()];
  }

  get turn(): Color {
    return this.board.turn ? 'b' : 'w';
  }

  /** Piece letter at a public square ('' empty). */
  at(i: number): string {
    const p = this.board.sq[to88(i)];
    return p ? CHARS[p] : '';
  }

  /** Legal moves as public squares. */
  legal(): { code: number; from: number; to: number; promo: string }[] {
    return this.board.legal().map((m) => ({ code: m, from: from88(mFrom(m)), to: from88(mTo(m)), promo: mPromo(m) ? 'pnbrq'[mPromo(m) - 1] : '' }));
  }

  /** Play a legal move by UCI text or code. Returns the record, or null if illegal. */
  play(move: string | number): PlayedMove | null {
    const b = this.board;
    const code = typeof move === 'number' ? (b.legal().includes(move) ? move : 0) : b.parseUci(move);
    if (!code) return null;
    const fl = mFlags(code);
    const from = mFrom(code), to = mTo(code);
    const capSq = fl & F_EP ? to + (b.turn === WHITE ? 16 : -16) : to;
    const rec: PlayedMove = {
      code,
      uci: b.uci(code),
      san: b.san(code),
      color: this.turn,
      from: from88(from),
      to: from88(to),
      captured: fl & F_CAP ? CHARS[b.sq[capSq]] : '',
      promo: mPromo(code) ? ' PNBRQK'[mPromo(code)] : '',
      castle: fl & F_CK ? 'K' : fl & F_CQ ? 'Q' : '',
      ep: !!(fl & F_EP),
    };
    b.make(code);
    this.moves.push(rec);
    this.keys.push(b.repKey());
    return rec;
  }

  /** Take back the last half-move. */
  undo(): PlayedMove | null {
    const m = this.moves.pop();
    if (!m) return null;
    this.board.unmake();
    this.keys.pop();
    return m;
  }

  inCheck(): boolean {
    return this.board.inCheck();
  }

  /** Public square of the king of the side to move (for the check glow). */
  kingSquare(c: Color = this.turn): number {
    return from88(this.board.kings[c === 'w' ? 0 : 1]);
  }

  /** How many times the current position has occurred. */
  repetitions(): number {
    const k = this.keys[this.keys.length - 1];
    return this.keys.filter((x) => x === k).length;
  }

  result(): Result {
    const b = this.board;
    if (!b.legal().length) return b.inCheck() ? { over: true, winner: b.turn ? 'w' : 'b', why: 'checkmate' } : { over: true, winner: null, why: 'stalemate' };
    if (b.insufficient()) return { over: true, winner: null, why: 'material' };
    if (b.half >= 100) return { over: true, winner: null, why: 'fifty' };
    if (this.repetitions() >= 3) return { over: true, winner: null, why: 'threefold' };
    return { over: false };
  }

  /** Can this colour still mate (a flag fall against a bare king is a draw)? */
  canMate(c: Color): boolean {
    return this.board.canMate(c === 'w' ? WHITE : BLACK);
  }

  fen(): string {
    return this.board.fen();
  }

  /** Every piece captured so far, by the colour that lost it. */
  captured(): { w: string[]; b: string[] } {
    const out = { w: [] as string[], b: [] as string[] };
    for (const m of this.moves) if (m.captured) (m.captured === m.captured.toUpperCase() ? out.w : out.b).push(m.captured);
    return out;
  }
}

// =====================================================================
// The legacy position-object API (kept for older callers and tests)
// =====================================================================

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

export const file = (i: number) => i % 8;
export const rank = (i: number) => 8 - Math.floor(i / 8);
export const name = (i: number) => `${'abcdefgh'[file(i)]}${rank(i)}`;
export function sq(n: string): number {
  return (8 - Number(n[1])) * 8 + 'abcdefgh'.indexOf(n[0]);
}
export const colorOf = (p: string): Color | null => (!p ? null : p === p.toUpperCase() ? 'w' : 'b');

export function toFen(pos: Position): string {
  let out = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = pos.board[r * 8 + f];
      if (!p) empty++;
      else {
        if (empty) (out += empty, (empty = 0));
        out += p;
      }
    }
    if (empty) out += empty;
    if (r < 7) out += '/';
  }
  return `${out} ${pos.turn} ${pos.castling || '-'} ${pos.ep < 0 ? '-' : name(pos.ep)} ${pos.halfmove} 1`;
}

const boardOf = (pos: Position) => Board.fromFen(toFen(pos));

function positionOf(b: Board): Position {
  const board: string[] = [];
  for (let i = 0; i < 64; i++) {
    const p = b.sq[to88(i)];
    board.push(p ? CHARS[p] : '');
  }
  const c = b.castling;
  return { board, turn: b.turn ? 'b' : 'w', castling: `${c & 1 ? 'K' : ''}${c & 2 ? 'Q' : ''}${c & 4 ? 'k' : ''}${c & 8 ? 'q' : ''}`, ep: b.ep < 0 ? -1 : from88(b.ep), halfmove: b.half };
}

function moveOf(b: Board, m: number): Move {
  const fl = mFlags(m);
  const out: Move = { from: from88(mFrom(m)), to: from88(mTo(m)) };
  if (mPromo(m)) out.promo = b.turn ? 'pnbrqk'[mPromo(m) - 1] : 'PNBRQK'[mPromo(m) - 1];
  if (fl & F_CK) out.castle = 'K';
  if (fl & F_CQ) out.castle = 'Q';
  if (fl & F_EP) out.ep = true;
  if (fl & F_CAP) out.capture = CHARS[b.sq[fl & F_EP ? mTo(m) + (b.turn === WHITE ? 16 : -16) : mTo(m)]];
  return out;
}

function codeOf(b: Board, m: Move): number {
  for (const c of b.legal()) {
    if (from88(mFrom(c)) !== m.from || from88(mTo(c)) !== m.to) continue;
    const pr = mPromo(c);
    if (!pr && !m.promo) return c;
    if (pr && m.promo && ' pnbrqk'[pr] === m.promo.toLowerCase()) return c;
  }
  return 0;
}

export function fromFen(fen: string): Position {
  return positionOf(Board.fromFen(fen));
}

export function legalMoves(pos: Position): Move[] {
  const b = boardOf(pos);
  return b.legal().map((m) => moveOf(b, m));
}

/** Play a move, returning the new position (the old one is untouched). */
export function play(pos: Position, m: Move): Position {
  const b = boardOf(pos);
  const code = codeOf(b, m);
  if (!code) throw new Error(`Illegal move ${name(m.from)}${name(m.to)}`);
  b.make(code);
  return positionOf(b);
}

export function kingSquare(pos: Position, c: Color): number {
  return pos.board.indexOf(c === 'w' ? 'K' : 'k');
}

export function inCheck(pos: Position, c = pos.turn): boolean {
  const b = boardOf(pos);
  return b.inCheck(c === 'w' ? WHITE : BLACK);
}

export function attacked(pos: Position, i: number, by: Color): boolean {
  return boardOf(pos).attacked(to88(i), by === 'w' ? WHITE : BLACK);
}

/** One position's result (no move history, so no threefold here: use ChessGame for that). */
export function result(pos: Position): Result {
  const b = boardOf(pos);
  if (!b.legal().length) return b.inCheck() ? { over: true, winner: b.turn ? 'w' : 'b', why: 'checkmate' } : { over: true, winner: null, why: 'stalemate' };
  if (b.insufficient()) return { over: true, winner: null, why: 'material' };
  if (pos.halfmove >= 100) return { over: true, winner: null, why: 'fifty' };
  return { over: false };
}

/** Algebraic notation for a move in a position. */
export function moveLabel(pos: Position, m: Move): string {
  const b = boardOf(pos);
  const code = codeOf(b, m);
  return code ? b.san(code) : '?';
}

// =====================================================================
// The engine
// =====================================================================

const MATE = 30000;
const MATE_BOUND = MATE - 512;
const INF = 32000;

// Material, middlegame / endgame (centipawns).
const VAL_MG = [0, 82, 337, 365, 477, 1025, 0];
const VAL_EG = [0, 94, 281, 297, 512, 936, 0];
/** Simple values for move ordering and the captured-pieces tray. */
export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER_VAL = [0, 100, 320, 330, 500, 900, 2000];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

// Piece-square tables, White's view, index 0 = a8.
const PST_MG: number[][] = [
  [],
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
];
const PST_EG: number[][] = [
  [],
  [0, 0, 0, 0, 0, 0, 0, 0, 80, 80, 80, 80, 80, 80, 80, 80, 50, 50, 50, 50, 50, 50, 50, 50, 30, 30, 30, 30, 30, 30, 30, 30, 15, 15, 15, 15, 15, 15, 15, 15, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  PST_MG[2],
  PST_MG[3],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  PST_MG[5],
  [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
];
// Flattened [piece * 128 + square] with material, from the owner's view.
const TAB_MG = new Int16Array(16 * 128), TAB_EG = new Int16Array(16 * 128);
for (let t = 1; t <= 6; t++) {
  for (let i = 0; i < 64; i++) {
    const r = i >> 3, f = i & 7;
    TAB_MG[t * 128 + ((r << 4) | f)] = VAL_MG[t] + PST_MG[t][i];
    TAB_EG[t * 128 + ((r << 4) | f)] = VAL_EG[t] + PST_EG[t][i];
    const mirror = (7 - r) * 8 + f;
    TAB_MG[(t | 8) * 128 + ((r << 4) | f)] = VAL_MG[t] + PST_MG[t][mirror];
    TAB_EG[(t | 8) * 128 + ((r << 4) | f)] = VAL_EG[t] + PST_EG[t][mirror];
  }
}
const PASSED_MG = [0, 5, 10, 15, 25, 40, 60, 0];
const PASSED_EG = [0, 10, 20, 35, 60, 90, 130, 0];

/** How an opponent plays (all optional; defaults are a sober engine). */
export interface Style {
  /** Bonus for pieces swarming the enemy king (0 = none, 1 = normal, 2 = wild). */
  aggression?: number;
  /** How much they care about their own pawn shield (1 = normal). */
  safety?: number;
  /** Centipawns they'd give up to avoid a draw (positive = plays on). */
  contempt?: number;
}

let styleAgg = 1, styleSafe = 1, styleContempt = 0, rootSide = WHITE;

/** Static evaluation from the side to move's point of view (centipawns). */
export function evaluate(b: Board): number {
  const sq = b.sq;
  let mgW = 0, mgB = 0, egW = 0, egB = 0, phase = 0;
  let bW = 0, bB = 0;
  // Per file: pawn counts, and the most advanced / least advanced rows.
  const pcW = [0, 0, 0, 0, 0, 0, 0, 0], pcB = [0, 0, 0, 0, 0, 0, 0, 0];
  const minRowB = [8, 8, 8, 8, 8, 8, 8, 8], maxRowW = [-1, -1, -1, -1, -1, -1, -1, -1];
  const minRowW = [8, 8, 8, 8, 8, 8, 8, 8], maxRowB = [-1, -1, -1, -1, -1, -1, -1, -1];
  let rooks = 0;
  const rookSq: number[] = [];
  let attW = 0, attB = 0;
  const kW = b.kings[0], kB = b.kings[1];
  let matW = 0, matB = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const p = sq[s];
    if (!p) continue;
    const t = p & 7;
    const r = s >> 4, f = s & 7;
    phase += PHASE_W[t];
    if (p < 8) {
      mgW += TAB_MG[p * 128 + s];
      egW += TAB_EG[p * 128 + s];
      matW += ORDER_VAL[t] * (t !== K ? 1 : 0);
      if (t === P) {
        pcW[f]++;
        if (r < minRowW[f]) minRowW[f] = r;
        if (r > maxRowW[f]) maxRowW[f] = r;
      } else if (t !== K) {
        if (t === B) bW++;
        if (t === R) (rooks++, rookSq.push(s));
        const d = Math.max(Math.abs((kB >> 4) - r), Math.abs((kB & 7) - f));
        if (d <= 2) attW += t === Q ? 2 : 1;
      }
    } else {
      mgB += TAB_MG[p * 128 + s];
      egB += TAB_EG[p * 128 + s];
      matB += ORDER_VAL[t] * (t !== K ? 1 : 0);
      if (t === P) {
        pcB[f]++;
        if (r < minRowB[f]) minRowB[f] = r;
        if (r > maxRowB[f]) maxRowB[f] = r;
      } else if (t !== K) {
        if (t === B) bB++;
        if (t === R) (rooks++, rookSq.push(s));
        const d = Math.max(Math.abs((kW >> 4) - r), Math.abs((kW & 7) - f));
        if (d <= 2) attB += t === Q ? 2 : 1;
      }
    }
  }
  // Pawn structure: doubled, isolated, passed.
  for (let f = 0; f < 8; f++) {
    if (pcW[f]) {
      if (pcW[f] > 1) (mgW -= 10 * (pcW[f] - 1), (egW -= 20 * (pcW[f] - 1)));
      if (!(f > 0 && pcW[f - 1]) && !(f < 7 && pcW[f + 1])) (mgW -= 10, (egW -= 12));
      // The most advanced white pawn on this file: passed if no black pawn ahead on f-1..f+1.
      const r = minRowW[f];
      let passed = true;
      for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) if (minRowB[g] < r) passed = false;
      if (passed) (mgW += PASSED_MG[7 - r], (egW += PASSED_EG[7 - r]));
    }
    if (pcB[f]) {
      if (pcB[f] > 1) (mgB -= 10 * (pcB[f] - 1), (egB -= 20 * (pcB[f] - 1)));
      if (!(f > 0 && pcB[f - 1]) && !(f < 7 && pcB[f + 1])) (mgB -= 10, (egB -= 12));
      const r = maxRowB[f];
      let passed = true;
      for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) if (maxRowW[g] > r) passed = false;
      if (passed) (mgB += PASSED_MG[r], (egB += PASSED_EG[r]));
    }
  }
  // Rooks on open and half-open files.
  for (let i = 0; i < rooks; i++) {
    const s = rookSq[i], f = s & 7;
    const white = sq[s] < 8;
    const own = white ? pcW[f] : pcB[f], their = white ? pcB[f] : pcW[f];
    const bonus = !own ? (their ? 10 : 20) : 0;
    if (white) (mgW += bonus, (egW += bonus >> 1));
    else (mgB += bonus, (egB += bonus >> 1));
  }
  if (bW >= 2) (mgW += 30, (egW += 45));
  if (bB >= 2) (mgB += 30, (egB += 45));
  // King safety: pawns in front of a castled king; attackers near the king.
  const shield = (k: number, own: number, dir: number) => {
    let n = 0;
    for (let df = -1; df <= 1; df++) {
      const s1 = k + dir + df, s2 = k + 2 * dir + df;
      if (!(s1 & 0x88) && sq[s1] === own) n += 2;
      else if (!(s2 & 0x88) && sq[s2] === own) n += 1;
    }
    return n;
  };
  if (kW >> 4 >= 6) mgW += shield(kW, P, -16) * 6 * styleSafe;
  if (kB >> 4 <= 1) mgB += shield(kB, P | 8, 16) * 6 * styleSafe;
  // Aggression is a personality: only the engine's own side gets the bonus.
  const aggW = rootSide === WHITE ? styleAgg : 1, aggB = rootSide === BLACK ? styleAgg : 1;
  mgW += attW * attW * 4 * aggW;
  mgB += attB * attB * 4 * aggB;
  if (phase > 24) phase = 24;
  let score = ((mgW - mgB) * phase + (egW - egB) * (24 - phase)) / 24;
  // Mop-up: with a big material lead and few pieces left, herd the king to the edge.
  if (phase <= 8) {
    const diff = matW - matB;
    if (Math.abs(diff) >= 300) {
      const loser = diff > 0 ? kB : kW, winner = diff > 0 ? kW : kB;
      const lr = loser >> 4, lf = loser & 7;
      const centre = Math.max(3 - lr, lr - 4) + Math.max(3 - lf, lf - 4);
      const dist = Math.abs(lr - (winner >> 4)) + Math.abs(lf - (winner & 7));
      const mop = centre * 12 + (14 - dist) * 5;
      score += diff > 0 ? mop : -mop;
    }
  }
  score = Math.round(score);
  return (b.turn === WHITE ? score : -score) + 10;
}

// ------------------------------------------------------- transposition table
const TT_BITS = 19;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
// Allocated on first use (~6 MB), so pages that only show a board don't pay for it.
let ttKey = new Int32Array(0);
let ttMove = new Int32Array(0);
let ttScore = new Int16Array(0);
let ttDepth = new Int8Array(0);
let ttFlag = new Uint8Array(1); // 0 empty, 1 exact, 2 lower, 3 upper
const EXACT = 1, LOWER = 2, UPPER = 3;
function ensureTT(): void {
  if (ttKey.length) return;
  ttKey = new Int32Array(TT_SIZE);
  ttMove = new Int32Array(TT_SIZE);
  ttScore = new Int16Array(TT_SIZE);
  ttDepth = new Int8Array(TT_SIZE);
  ttFlag = new Uint8Array(TT_SIZE);
}

/** Wipe the engine's memory (new game). */
export function clearEngine(): void {
  if (ttKey.length) ttFlag.fill(0);
  history.fill(0);
}

const MAX_PLY = 64;
const killers = new Int32Array(MAX_PLY * 2);
const history = new Int32Array(16 * 128);

interface SearchCtx {
  b: Board;
  nodes: number;
  stopAt: number;
  stopped: boolean;
  canStop: boolean;
  /** Plies from the root (selective depth). */
  seldepth: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function scoreMoves(ctx: SearchCtx, moves: number[], scores: number[], ttm: number, ply: number): void {
  const b = ctx.b;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    let sc: number;
    if (m === ttm) sc = 10_000_000;
    else if (mFlags(m) & F_CAP) {
      const victim = mFlags(m) & F_EP ? P : b.sq[mTo(m)] & 7;
      sc = 1_000_000 + ORDER_VAL[victim] * 10 - ORDER_VAL[b.sq[mFrom(m)] & 7] / 10;
    } else if (mPromo(m)) sc = 900_000 + mPromo(m);
    else if (m === killers[ply * 2]) sc = 800_000;
    else if (m === killers[ply * 2 + 1]) sc = 790_000;
    else sc = history[b.sq[mFrom(m)] * 128 + mTo(m)];
    scores[i] = sc;
  }
}

/** Selection sort step: move the best remaining move to index i. */
function pick(moves: number[], scores: number[], i: number): number {
  let best = i;
  for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[best]) best = j;
  if (best !== i) {
    const tm = moves[i];
    moves[i] = moves[best];
    moves[best] = tm;
    const ts = scores[i];
    scores[i] = scores[best];
    scores[best] = ts;
  }
  return moves[i];
}

function checkTime(ctx: SearchCtx): void {
  if ((ctx.nodes & 1023) === 0 && ctx.canStop && now() > ctx.stopAt) ctx.stopped = true;
}

function quiesce(ctx: SearchCtx, alpha: number, beta: number, ply: number): number {
  ctx.nodes++;
  checkTime(ctx);
  if (ctx.stopped) return 0;
  if (ply > ctx.seldepth) ctx.seldepth = ply;
  const b = ctx.b;
  const check = b.inCheck();
  if (!check) {
    const stand = evaluate(b);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply >= MAX_PLY - 1) return stand;
  } else if (ply >= MAX_PLY - 1) return evaluate(b);
  const moves: number[] = [];
  b.gen(moves, !check);
  const scores: number[] = new Array(moves.length);
  scoreMoves(ctx, moves, scores, 0, Math.min(ply, MAX_PLY - 1));
  let legal = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = pick(moves, scores, i);
    if (!b.make(m)) continue;
    legal++;
    const v = -quiesce(ctx, -beta, -alpha, ply + 1);
    b.unmake();
    if (ctx.stopped) return 0;
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  if (check && !legal) return -MATE + ply;
  return alpha;
}

function hasPieces(b: Board): boolean {
  const me = b.turn << 3;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    const p = b.sq[s];
    if (p && (p & 8) === me && (p & 7) !== P && (p & 7) !== K) return true;
  }
  return false;
}

function negamax(ctx: SearchCtx, depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
  const b = ctx.b;
  if (ply > 0) {
    if (b.half >= 100 || b.repeated()) return b.turn === rootSide ? -styleContempt : styleContempt;
    // Mate distance pruning.
    const ma = Math.max(alpha, -MATE + ply), mb = Math.min(beta, MATE - ply - 1);
    if (ma >= mb) return ma;
  }
  const check = b.inCheck();
  if (check) depth++;
  if (depth <= 0 || ply >= MAX_PLY - 1) return quiesce(ctx, alpha, beta, ply);
  ctx.nodes++;
  checkTime(ctx);
  if (ctx.stopped) return 0;

  const idx = b.hashLo & TT_MASK;
  let ttm = 0;
  if (ttFlag[idx] && ttKey[idx] === b.hashHi) {
    ttm = ttMove[idx];
    if (ply > 0 && ttDepth[idx] >= depth) {
      let v = ttScore[idx];
      if (v > MATE_BOUND) v -= ply;
      else if (v < -MATE_BOUND) v += ply;
      const fl = ttFlag[idx];
      if (fl === EXACT || (fl === LOWER && v >= beta) || (fl === UPPER && v <= alpha)) return v;
    }
  }
  const pv = beta - alpha > 1;

  // Null move: if passing still beats beta, this line is too good to need searching.
  if (allowNull && !check && !pv && depth >= 3 && hasPieces(b) && evaluate(b) >= beta) {
    b.makeNull();
    const v = -negamax(ctx, depth - 3, -beta, -beta + 1, ply + 1, false);
    b.unmake();
    if (ctx.stopped) return 0;
    if (v >= beta) return v >= MATE_BOUND ? beta : v;
  }

  const moves: number[] = [];
  b.gen(moves);
  const scores: number[] = new Array(moves.length);
  scoreMoves(ctx, moves, scores, ttm, ply);
  let best = -INF, bestMove = 0, legal = 0;
  const alpha0 = alpha;
  for (let i = 0; i < moves.length; i++) {
    const m = pick(moves, scores, i);
    if (!b.make(m)) continue;
    legal++;
    const quiet = !(mFlags(m) & F_CAP) && !mPromo(m);
    let v: number;
    if (legal === 1) v = -negamax(ctx, depth - 1, -beta, -alpha, ply + 1, true);
    else {
      // Late, quiet moves get a shallower look first.
      let red = 0;
      if (depth >= 3 && legal > 3 && quiet && !check && !b.inCheck()) red = legal > 8 ? 2 : 1;
      v = -negamax(ctx, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
      if (v > alpha && red) v = -negamax(ctx, depth - 1, -alpha - 1, -alpha, ply + 1, true);
      if (v > alpha && v < beta) v = -negamax(ctx, depth - 1, -beta, -alpha, ply + 1, true);
    }
    b.unmake();
    if (ctx.stopped) return 0;
    if (v > best) {
      best = v;
      bestMove = m;
    }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (quiet) {
        if (killers[ply * 2] !== m) (killers[ply * 2 + 1] = killers[ply * 2], (killers[ply * 2] = m));
        history[b.sq[mFrom(m)] * 128 + mTo(m)] += depth * depth;
      }
      break;
    }
  }
  if (!legal) return check ? -MATE + ply : b.turn === rootSide ? -styleContempt : styleContempt;
  let store = best;
  if (store > MATE_BOUND) store += ply;
  else if (store < -MATE_BOUND) store -= ply;
  ttKey[idx] = b.hashHi;
  ttMove[idx] = bestMove;
  ttScore[idx] = store;
  ttDepth[idx] = depth;
  ttFlag[idx] = best >= beta ? LOWER : best <= alpha0 ? UPPER : EXACT;
  return best;
}

/** How an opponent thinks. */
export interface Level {
  /** Deepest full-width search (plies). */
  maxDepth: number;
  /** Thinking time budget (ms). */
  timeMs: number;
  /** Consider any move within this many centipawns of the best (0 = always the best). */
  spread: number;
  /** Softness of the pick among those moves (higher = more random). */
  temp: number;
  /** Chance per move of a real slip: a wider spread for that one move. */
  blunder: number;
  /** How wide that slip can be (centipawns). */
  blunderSpread: number;
  style?: Style;
}

export interface Thought {
  /** Engine move code (0 = no legal move). */
  move: number;
  uci: string;
  /** Score from the mover's point of view (centipawns; ±29xxx = mate). */
  score: number;
  depth: number;
  nodes: number;
  ms: number;
  /** True when the pick wasn't the engine's favourite. */
  slipped: boolean;
}

/** Think about the position on `b` and pick a move. `rand` drives the human touches. */
export function think(b: Board, level: Level, rand: () => number = Math.random): Thought {
  const t0 = now();
  ensureTT();
  const root = b.legal();
  if (!root.length) return { move: 0, uci: '', score: b.inCheck() ? -MATE : 0, depth: 0, nodes: 0, ms: 0, slipped: false };
  styleAgg = level.style?.aggression ?? 1;
  styleSafe = level.style?.safety ?? 1;
  styleContempt = level.style?.contempt ?? 0;
  rootSide = b.turn;
  killers.fill(0);
  for (let i = 0; i < history.length; i++) history[i] >>= 2;
  const ctx: SearchCtx = { b, nodes: 0, stopAt: t0 + level.timeMs, stopped: false, canStop: false, seldepth: 0 };
  const slip = level.blunder > 0 && rand() < level.blunder;
  const spread = slip ? Math.max(level.spread, level.blunderSpread) : level.spread;
  // Root moves with their latest scores (ordered best first between iterations).
  let order = root.slice();
  const ttIdx = b.hashLo & TT_MASK;
  if (ttFlag[ttIdx] && ttKey[ttIdx] === b.hashHi && order.includes(ttMove[ttIdx])) order = [ttMove[ttIdx], ...order.filter((m) => m !== ttMove[ttIdx])];
  let done: { m: number; v: number }[] = order.map((m) => ({ m, v: 0 }));
  let doneDepth = 0;
  for (let depth = 1; depth <= level.maxDepth; depth++) {
    ctx.canStop = depth > 1;
    const scored: { m: number; v: number }[] = [];
    let best = -INF;
    for (let i = 0; i < order.length; i++) {
      const m = order[i];
      b.make(m);
      let v: number;
      if (i === 0) v = -negamax(ctx, depth - 1, -INF, INF, 1, true);
      else if (spread > 0) {
        const lo = best - spread - 1;
        v = -negamax(ctx, depth - 1, -INF, -lo, 1, true);
      } else {
        v = -negamax(ctx, depth - 1, -best - 1, -best, 1, true);
        if (v > best && !ctx.stopped) v = -negamax(ctx, depth - 1, -INF, -best, 1, true);
      }
      b.unmake();
      if (ctx.stopped) break;
      scored.push({ m, v });
      if (v > best) best = v;
    }
    if (ctx.stopped) {
      // A partial iteration still helps if it found something better than the old favourite.
      if (scored.length && spread === 0) {
        const top = scored.reduce((a, x) => (x.v > a.v ? x : a), scored[0]);
        if (top.m !== done[0].m && top.v > scored[0].v) done = [top, ...done.filter((x) => x.m !== top.m)];
      }
      break;
    }
    scored.sort((a, c) => c.v - a.v);
    done = scored;
    doneDepth = depth;
    order = scored.map((x) => x.m);
    // Found a forced mate: no need to look deeper.
    if (Math.abs(scored[0].v) > MATE_BOUND && depth >= 2) break;
    // Not worth starting an iteration we can't finish.
    if (depth >= 2 && now() - t0 > level.timeMs * 0.45) break;
  }
  const bestV = done[0].v;
  let choice = done[0];
  if (spread > 0 && bestV < MATE_BOUND) {
    // Human touch: pick among the near-best moves, favouring the better ones. Never walk into a mate it can see.
    const pool = done.filter((x) => x.v >= bestV - spread && x.v > -MATE_BOUND);
    if (pool.length > 1) {
      const temp = Math.max(1, slip ? Math.max(level.temp, spread / 2) : level.temp);
      const w = pool.map((x) => Math.exp((x.v - bestV) / temp));
      let r = rand() * w.reduce((a, c) => a + c, 0);
      for (let i = 0; i < pool.length; i++) {
        r -= w[i];
        if (r <= 0) {
          choice = pool[i];
          break;
        }
      }
    }
  }
  return { move: choice.m, uci: b.uci(choice.m), score: choice.v, depth: doneDepth, nodes: ctx.nodes, ms: Math.round(now() - t0), slipped: choice.m !== done[0].m };
}

// =====================================================================
// A tiny opening book: a few mainstream lines so games don't all start
// the same. Lines are UCI; the engine follows one while the game does.
// =====================================================================

const BOOK = [
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1',
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3',
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 b1c3',
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g7g6',
  'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7',
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5',
  'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6',
  'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3',
  'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4',
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8',
  'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8',
  'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5',
  'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3',
  'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1',
];

/** A book move for this move history, or '' when out of book. */
export function bookMove(history: string[], rand: () => number = Math.random): string {
  const prefix = history.join(' ');
  const options = BOOK.map((l) => l.split(' ')).filter((l) => l.length > history.length && l.slice(0, history.length).join(' ') === prefix).map((l) => l[history.length]);
  return options.length ? options[Math.floor(rand() * options.length)] : '';
}

// =====================================================================
// The opponents
// =====================================================================

export interface Opponent {
  id: string;
  name: string;
  emoji: string;
  /** Deepest search (plies). */
  depth: number;
  /** Chance per move of a slip. */
  blunder: number;
  /** What they're like. */
  blurb: string;
  /** Rating shown (and used for yours). */
  rating: number;
  /** Bets they'll take (cents). 0 = a friendly game. */
  stakes: number[];
  /** Where you find them. */
  where: 'house' | 'park';
  /** One-line style tag on the card. */
  tag: string;
  /** Thinking time per move (ms) in an untimed game. */
  thinkMs: number;
  /** Shortest pause before they move (ms), so instant moves still feel like a person. */
  minDelay: number;
  spread: number;
  temp: number;
  blunderSpread: number;
  /** Follows the opening book. */
  book: boolean;
  style: Style;
  /** Accepts a draw offer when their eval is at or below this (centipawns, their view). */
  drawAt: number;
  /** Resigns a hopeless position (at or below this eval for two moves running); 0 = never resigns. */
  resignAt: number;
  /** The clock they like (first pick on the card). */
  clock: ClockId;
}

export type ClockId = 'untimed' | 'rapid' | 'blitz';
export const CLOCKS: Record<ClockId, { label: string; emoji: string; base: number; inc: number }> = {
  untimed: { label: 'Untimed', emoji: '♾️', base: 0, inc: 0 },
  rapid: { label: 'Rapid 10+0', emoji: '⏱️', base: 600_000, inc: 0 },
  blitz: { label: 'Blitz 3+2', emoji: '⚡', base: 180_000, inc: 2_000 },
};

export const OPPONENTS: Opponent[] = [
  {
    id: 'kid', name: 'Kid Kasparov', emoji: '🧒', where: 'house', tag: 'Chaos gremlin', rating: 800, stakes: [0, 500],
    blurb: 'Nine years old. Very confident. Will tell you about Minecraft.',
    depth: 2, thinkMs: 300, minDelay: 700, spread: 140, temp: 60, blunder: 0.25, blunderSpread: 450, book: false,
    style: { aggression: 1.6, safety: 0.3, contempt: 50 }, drawAt: -250, resignAt: 0, clock: 'untimed',
  },
  {
    id: 'lou', name: 'Lightning Lou', emoji: '⚡', where: 'park', tag: 'Bullet hustler', rating: 1000, stakes: [0, 1_000, 2_000],
    blurb: 'Moves before you’ve let go of the piece. Fast hands, faster mouth, the occasional oops.',
    depth: 3, thinkMs: 120, minDelay: 250, spread: 70, temp: 35, blunder: 0.16, blunderSpread: 350, book: true,
    style: { aggression: 1.5, safety: 0.6, contempt: 40 }, drawAt: -300, resignAt: 0, clock: 'blitz',
  },
  {
    id: 'professor', name: 'Professor Pawn', emoji: '👴', where: 'house', tag: 'Slow and solid', rating: 1200, stakes: [0, 2_000, 5_000],
    blurb: 'Retired math teacher. Plays slow, talks slower, punishes every mistake eventually.',
    depth: 3, thinkMs: 1200, minDelay: 1400, spread: 40, temp: 20, blunder: 0.08, blunderSpread: 220, book: true,
    style: { aggression: 0.7, safety: 1.5, contempt: 0 }, drawAt: -60, resignAt: -1100, clock: 'untimed',
  },
  {
    id: 'pops', name: 'Pops', emoji: '🧓', where: 'park', tag: 'The wall', rating: 1350, stakes: [0, 2_000, 5_000],
    blurb: 'Bryant Park since 1987. Never attacks, never hurries, never seems to lose a pawn.',
    depth: 4, thinkMs: 700, minDelay: 900, spread: 30, temp: 15, blunder: 0.06, blunderSpread: 200, book: true,
    style: { aggression: 0.4, safety: 2, contempt: -20 }, drawAt: 10, resignAt: 0, clock: 'rapid',
  },
  {
    id: 'eddie', name: 'Fast Eddie', emoji: '😎', where: 'park', tag: 'Blitz hustler', rating: 1500, stakes: [2_000, 10_000, 50_000],
    blurb: 'Washington Square legend. Hustles tourists for $20 a game. Plays fast, talks trash, sometimes trips over his own speed.',
    depth: 5, thinkMs: 350, minDelay: 300, spread: 20, temp: 10, blunder: 0.07, blunderSpread: 260, book: true,
    style: { aggression: 1.4, safety: 0.8, contempt: 60 }, drawAt: -150, resignAt: 0, clock: 'blitz',
  },
  {
    id: 'tanya', name: 'Tactical Tanya', emoji: '🗡️', where: 'house', tag: 'Attacker', rating: 1800, stakes: [0, 5_000, 20_000, 100_000],
    blurb: 'Club champion three years running. Sacrifices first, asks questions never.',
    depth: 7, thinkMs: 1200, minDelay: 700, spread: 10, temp: 5, blunder: 0.03, blunderSpread: 150, book: true,
    style: { aggression: 2, safety: 0.8, contempt: 30 }, drawAt: -80, resignAt: -1000, clock: 'rapid',
  },
  {
    id: 'gloria', name: 'Grandmaster Gloria', emoji: '👑', where: 'house', tag: 'Quiet grandmaster', rating: 2100, stakes: [10_000, 100_000, 500_000],
    blurb: 'An actual grandmaster. Plays you while doing a crossword. Beat her and the whole house stands up.',
    depth: 40, thinkMs: 2200, minDelay: 900, spread: 0, temp: 1, blunder: 0, blunderSpread: 0, book: true,
    style: { aggression: 1, safety: 1.2, contempt: 15 }, drawAt: -40, resignAt: -900, clock: 'untimed',
  },
];
export const OPPONENT_BY_ID: Record<string, Opponent> = Object.fromEntries(OPPONENTS.map((o) => [o.id, o]));

/** The engine settings for an opponent, given what's left on their clock (ms; 0 = untimed). */
export function levelFor(opp: Opponent, clockLeft = 0, inc = 0): Level {
  let timeMs = opp.thinkMs;
  // On a clock: never spend more than ~1/30 of what's left plus most of the increment.
  if (clockLeft > 0) timeMs = Math.max(40, Math.min(timeMs, clockLeft / 30 + inc * 0.7));
  return { maxDepth: opp.depth, timeMs, spread: opp.spread, temp: opp.temp, blunder: opp.blunder, blunderSpread: opp.blunderSpread, style: opp.style };
}

/** The opponent's move for a position (sync; the UI uses a worker). null if none. */
export function bestMove(pos: Position, opp: Opponent, rand: () => number = Math.random, ms?: number): Move | null {
  const b = boardOf(pos);
  const level = levelFor(opp);
  if (ms !== undefined) level.timeMs = ms;
  const t = think(b, level, rand);
  return t.move ? moveOf(b, t.move) : null;
}
