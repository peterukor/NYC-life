// Chess rules checked against standard perft counts (every legal move
// sequence to depth N), the draw rules, SAN, and the opponents' engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, bestMove, bookMove, ChessGame, clearEngine, fromFen, legalMoves, levelFor, OPPONENT_BY_ID, OPPONENTS, perft, play, result, sq, START_FEN, think, type Position } from '../src/sim/chess.ts';
import { chessOf, settleChess, stakeUp } from '../src/sim/chess-club.ts';
import { newLife } from '../src/sim/state.ts';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const counts = (fen: string, depth: number) => {
  const b = Board.fromFen(fen);
  return Array.from({ length: depth }, (_, i) => perft(b, i + 1));
};
/** A seeded random (mulberry32) so engine games repeat. */
const seeded = (a: number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const sans = (g: ChessGame) => g.moves.map((m) => m.san);
const playAll = (g: ChessGame, line: string) => line.split(' ').forEach((u) => assert.ok(g.play(u), `illegal ${u}`));

test('perft: start position, depth 1–4', () => {
  assert.deepEqual(counts(START_FEN, 4), [20, 400, 8902, 197281]);
});

test('perft: Kiwipete (castling, en passant, promotions, pins), depth 1–3', () => {
  assert.deepEqual(counts(KIWIPETE, 3), [48, 2039, 97862]);
});

test('perft: positions 3, 4 and 5 (en passant edge cases, promotion, castling through check)', () => {
  assert.deepEqual(counts('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4), [14, 191, 2812, 43238]);
  assert.deepEqual(counts('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3), [6, 264, 9467]);
  assert.deepEqual(counts('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3), [44, 1486, 62379]);
});

test('make/unmake leaves the board exactly as it was (FEN and hash)', () => {
  const b = Board.fromFen(KIWIPETE);
  const before = b.fen(), lo = b.hashLo, hi = b.hashHi;
  perft(b, 3);
  assert.equal(b.fen(), before);
  assert.equal(b.hashLo, lo);
  assert.equal(b.hashHi, hi);
  // The hash is a function of the position, however you got there.
  const a = new ChessGame(), c = new ChessGame();
  playAll(a, 'g1f3 g8f6 b1c3');
  playAll(c, 'b1c3 g8f6 g1f3');
  assert.equal(a.board.hashLo, c.board.hashLo);
  assert.equal(a.board.hashHi, c.board.hashHi);
});

test('the old position API agrees with the board', () => {
  const p = fromFen(KIWIPETE);
  const legacy = (q: Position, d: number): number => (d === 0 ? 1 : legalMoves(q).reduce((n, m) => n + legacy(play(q, m), d - 1), 0));
  assert.equal(legacy(fromFen(START_FEN), 2), 400);
  assert.equal(legacy(p, 2), 2039);
});

test('castling: both sides, and every condition', () => {
  const can = (fen: string) => {
    const g = new ChessGame(fen);
    return g.legal().filter((m) => m.from === g.kingSquare() && Math.abs(m.to - m.from) === 2).map((m) => (m.to > m.from ? 'O-O' : 'O-O-O')).sort();
  };
  assert.deepEqual(can('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), ['O-O', 'O-O-O']);
  assert.deepEqual(can('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1'), ['O-O', 'O-O-O']);
  assert.deepEqual(can('r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1'), [], 'no rights');
  assert.deepEqual(can('r3k2r/8/8/8/8/8/8/R3K2R w Q - 0 1'), ['O-O-O'], 'queenside only');
  assert.deepEqual(can('r3k2r/8/8/8/8/8/8/RN2K1NR w KQ - 0 1'), [], 'pieces in the way');
  assert.deepEqual(can('r3k2r/8/8/8/8/8/8/R2QK2R w KQ - 0 1'), ['O-O'], 'queen in the way on d1');
  assert.deepEqual(can('4k3/8/8/8/8/8/8/1R2K2R w K - 0 1'), ['O-O'], 'b1 rook is not a castling rook');
  assert.deepEqual(can('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'.replace('4k3', '4r1k1')), [], 'not out of check');
  assert.deepEqual(can('5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['O-O-O'], 'not through check (f1)');
  assert.deepEqual(can('6rk/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['O-O-O'], 'not into check (g1)');
  assert.deepEqual(can('1r4k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['O-O', 'O-O-O'], 'b1 attacked is fine for O-O-O');
  assert.deepEqual(can('2r3k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['O-O'], 'c1 attacked blocks O-O-O');
  // Moving the king or a rook loses the right; so does losing the rook.
  const g = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  playAll(g, 'h1h2 a8a7 h2h1 a7a8');
  assert.equal(g.fen().split(' ')[2], 'Qk', 'a rook that went home keeps no right');
});

test('castling rights after rook moves and captures', () => {
  const g = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  playAll(g, 'h1h2');
  assert.equal(g.fen().split(' ')[2], 'Qkq');
  playAll(g, 'a8a7');
  assert.equal(g.fen().split(' ')[2], 'Qk');
  const c = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  playAll(c, 'a1a8');
  assert.equal(c.fen().split(' ')[2], 'Kk', 'rook takes rook: both queenside rights go');
  const k = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  playAll(k, 'e1f1 e8d8');
  assert.equal(k.fen().split(' ')[2], '-');
  const o = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const rec = o.play('e1g1')!;
  assert.equal(rec.san, 'O-O');
  assert.equal(o.at(sq('f1')), 'R');
  assert.equal(o.at(sq('g1')), 'K');
  const rec2 = o.play('e8c8')!;
  assert.equal(rec2.san, 'O-O-O');
  assert.equal(o.at(sq('d8')), 'r');
});

test('en passant: only right away, and not when it exposes the king', () => {
  const g = new ChessGame('4k3/8/8/3P4/8/8/8/4K3 b - - 0 1');
  playAll(g, 'e8f8');
  const g2 = new ChessGame('4k3/4p3/8/3P4/8/8/8/4K3 b - - 0 1');
  playAll(g2, 'e7e5');
  const ep = g2.play('d5e6')!;
  assert.ok(ep.ep);
  assert.equal(ep.san, 'dxe6');
  assert.equal(ep.captured, 'p');
  assert.equal(g2.at(sq('e5')), '', 'the passed pawn is gone');
  const late = new ChessGame('4k3/4p3/8/3P4/8/8/8/4K3 b - - 0 1');
  playAll(late, 'e7e5 e1e2 e8e7');
  assert.equal(late.play('d5e6'), null, 'too late');
  // Horizontal pin through both pawns: taking en passant would leave the king in check.
  const pin = new ChessGame('8/8/8/8/k2Pp2Q/8/8/3K4 b - d3 0 1');
  assert.equal(pin.legal().some((m) => m.from === sq('e4') && m.to === sq('d3')), false);
});

test('promotion: four choices, under-promotion, SAN with check', () => {
  const g = new ChessGame('8/4P1k1/8/8/8/8/8/K7 w - - 0 1');
  const promos = g.legal().filter((m) => m.from === sq('e7')).map((m) => m.promo).sort();
  assert.deepEqual(promos, ['b', 'n', 'q', 'r']);
  const n = g.play('e7e8n')!;
  assert.equal(n.san, 'e8=N+');
  assert.equal(g.at(sq('e8')), 'N');
  g.undo();
  assert.equal(g.at(sq('e7')), 'P');
  assert.equal(g.play('e7e8q')!.san, 'e8=Q');
  // Capture-promotion.
  const c = new ChessGame('3r2k1/4P3/8/8/8/8/8/K7 w - - 0 1');
  assert.equal(c.play('e7d8r')!.san, 'exd8=R+');
});

test('SAN: disambiguation, captures, mate', () => {
  const g = new ChessGame('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
  assert.equal(g.board.san(g.board.parseUci('a1d1')), 'Rad1');
  const r = new ChessGame('4k3/R7/8/8/8/8/8/R3K3 w - - 0 1');
  assert.equal(r.board.san(r.board.parseUci('a1a3')), 'R1a3');
  const q = new ChessGame('2k5/8/8/8/1Q5Q/8/8/K6Q w - - 0 1');
  assert.equal(q.board.san(q.board.parseUci('h4e1')), 'Qh4e1');
  const fool = new ChessGame();
  playAll(fool, 'f2f3 e7e5 g2g4 d8h4');
  assert.deepEqual(sans(fool), ['f3', 'e5', 'g4', 'Qh4#']);
  assert.deepEqual(fool.result(), { over: true, winner: 'b', why: 'checkmate' });
  const kn = new ChessGame();
  playAll(kn, 'g1f3 b8c6 b1c3 c6d4 f3d4');
  assert.deepEqual(sans(kn), ['Nf3', 'Nc6', 'Nc3', 'Nd4', 'Nxd4']);
});

test('game endings: stalemate, material, fifty moves, threefold', () => {
  assert.deepEqual(new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').result(), { over: true, winner: null, why: 'stalemate' });
  const mat = (fen: string) => new ChessGame(fen).result();
  assert.deepEqual(mat('8/8/4k3/8/8/3K4/8/8 w - - 0 1'), { over: true, winner: null, why: 'material' });
  assert.deepEqual(mat('8/8/4k3/8/8/3K4/8/6N1 w - - 0 1'), { over: true, winner: null, why: 'material' }, 'K+N v K');
  assert.deepEqual(mat('8/8/4k3/8/8/3K4/8/5B2 w - - 0 1'), { over: true, winner: null, why: 'material' }, 'K+B v K');
  assert.deepEqual(mat('8/8/4kb2/8/8/3K4/8/5B2 w - - 0 1'), { over: false }, 'opposite bishops can still mate');
  assert.deepEqual(mat('8/8/4k1b1/8/8/3K4/8/5B2 w - - 0 1'), { over: true, winner: null, why: 'material' }, 'same-colour bishops cannot');
  assert.deepEqual(mat('8/8/4k3/8/8/3K4/8/5NN1 w - - 0 1'), { over: false }, 'K+N+N v K is not a dead draw');
  assert.deepEqual(mat('8/8/4k3/8/8/3K4/8/4R3 w - - 99 80'), { over: false });
  const fifty = new ChessGame('8/8/4k3/8/8/3K4/8/4R3 w - - 99 80');
  playAll(fifty, 'e1e2');
  assert.deepEqual(fifty.result(), { over: true, winner: null, why: 'fifty' });
  // Knights out and back twice: the start position comes up a third time.
  const g = new ChessGame();
  playAll(g, 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1');
  assert.equal(g.result().over, false);
  playAll(g, 'f6g8');
  assert.deepEqual(g.result(), { over: true, winner: null, why: 'threefold' });
  g.undo();
  assert.equal(g.result().over, false, 'undo takes the repetition back');
  // A side with only a king can't win on time.
  const t = new ChessGame('8/8/4k3/8/8/3K4/8/4R3 w - - 0 1');
  assert.equal(t.canMate('w'), true);
  assert.equal(t.canMate('b'), false);
  assert.equal(new ChessGame('8/8/4k3/8/8/3K4/8/5N2 w - - 0 1').canMate('w'), false);
  assert.equal(new ChessGame('8/8/4k3/4p3/8/3K4/8/5N2 w - - 0 1').canMate('w'), true, 'a lone knight can mate with help');
});

test('legacy result() and moveLabel still work', () => {
  const mate = fromFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  assert.deepEqual(result(mate), { over: true, winner: 'b', why: 'checkmate' });
});

test('opponents: every one finds mate in one (no blunder roll)', () => {
  const p = fromFen('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'); // Rd8#
  for (const o of OPPONENTS) {
    for (let i = 0; i < 3; i++) {
      const m = bestMove(p, o, () => 0.99, 200);
      assert.ok(m && m.from === sq('d1') && m.to === sq('d8'), o.name);
    }
  }
});

test('the grandmaster finds a mate in two and keeps her queen', () => {
  clearEngine();
  const b = Board.fromFen('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'); // Qxf7#
  assert.equal(think(b, levelFor(OPPONENT_BY_ID.gloria, 0), () => 0.5).uci, 'h5f7');
  // Mate in two: 1.Kb6 Kb8 2.Rh8#.
  const m2 = Board.fromFen('k7/8/2K5/8/8/8/8/7R w - - 0 1');
  const t = think(m2, { ...levelFor(OPPONENT_BY_ID.gloria), timeMs: 600 }, () => 0.5);
  assert.ok(t.score > 29000, `mate score, got ${t.score} (${t.uci})`);
  // Queen attacked by a pawn: move it.
  const hang = Board.fromFen('rnb1kbnr/pppp1ppp/8/4p3/3qP3/2P5/PP1P1PPP/RNBQKBNR b KQkq - 0 4');
  const r = think(hang, { ...levelFor(OPPONENT_BY_ID.gloria), timeMs: 400 }, () => 0.5);
  assert.equal(r.uci.slice(0, 2), 'd4');
});

test('the grandmaster mates with king and queen against a bare king', () => {
  clearEngine();
  const g = new ChessGame('8/8/8/4k3/8/8/8/3QK3 w - - 0 1');
  const gloria = { ...levelFor(OPPONENT_BY_ID.gloria), timeMs: 120 };
  const defender = { ...levelFor(OPPONENT_BY_ID.gloria), timeMs: 30 };
  const rand = seeded(7);
  for (let ply = 0; ply < 80 && !g.result().over; ply++) g.play(think(g.board, ply % 2 ? defender : gloria, rand).move);
  assert.deepEqual(g.result(), { over: true, winner: 'w', why: 'checkmate' });
});

test('strength: the grandmaster beats the kid; every move along the way is legal', () => {
  clearEngine();
  const g = new ChessGame();
  const rand = seeded(42);
  const gloria = { ...levelFor(OPPONENT_BY_ID.gloria), timeMs: 60 };
  const kid = levelFor(OPPONENT_BY_ID.kid);
  for (let ply = 0; ply < 200 && !g.result().over; ply++) {
    const t = think(g.board, ply % 2 === 0 ? gloria : kid, rand);
    assert.ok(g.play(t.move), 'legal');
  }
  const r = g.result();
  assert.ok(r.over && r.winner === 'w', `gloria should win, got ${JSON.stringify(r)} after ${g.moves.length} plies`);
});

test('weaker opponents wander: the kid does not always play the same move', () => {
  const b = Board.fromFen(START_FEN);
  const seen = new Set<string>();
  const rand = seeded(3);
  for (let i = 0; i < 12; i++) seen.add(think(b, levelFor(OPPONENT_BY_ID.kid), rand).uci);
  assert.ok(seen.size >= 3, [...seen].join(' '));
  assert.ok(OPPONENTS.every((o, i) => i === 0 || o.rating >= OPPONENTS[i - 1].rating), 'listed weakest first');
});

test('clock budgets: blitz thinks fast, never longer than the clock allows', () => {
  const lvl = levelFor(OPPONENT_BY_ID.gloria, 10_000, 2_000);
  assert.ok(lvl.timeMs <= 10_000 / 30 + 1400 + 1);
  assert.equal(levelFor(OPPONENT_BY_ID.gloria).timeMs, OPPONENT_BY_ID.gloria.thinkMs);
});

test('opening book follows the game and stops when it leaves', () => {
  assert.ok(['e2e4', 'd2d4', 'c2c4', 'g1f3'].includes(bookMove([], seeded(1))));
  assert.equal(bookMove(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'], () => 0), 'a7a6');
  assert.equal(bookMove(['a2a4']), '');
});

test('bets: win doubles the stake, draw returns it, loss keeps it; old saves load', () => {
  const life = () => newLife({ name: 'T', origin: 'hustler', spawnClass: 'poor', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
  const eddie = OPPONENT_BY_ID.eddie;
  const s = life();
  s.money = 10_000;
  assert.equal(stakeUp(s, 2_000), null);
  assert.equal(s.money, 8_000);
  settleChess(s, eddie, 2_000, 'win');
  assert.equal(s.money, 12_000);
  assert.equal(chessOf(s).wins.eddie, 1);
  stakeUp(s, 2_000);
  settleChess(s, eddie, 2_000, 'draw');
  assert.equal(s.money, 12_000);
  stakeUp(s, 2_000);
  settleChess(s, eddie, 2_000, 'loss');
  assert.equal(s.money, 10_000);
  assert.ok(stakeUp(s, 1_000_000), 'not enough cash');
  // An older save's record (no new opponents) still works.
  const old = life();
  old.chess = { rating: 1234, wins: { kid: 2 }, losses: {}, draws: 1, bestWin: 500 };
  settleChess(old, OPPONENT_BY_ID.tanya, 0, 'win');
  assert.equal(chessOf(old).wins.tanya, 1);
  assert.equal(chessOf(old).wins.kid, 2);
});
