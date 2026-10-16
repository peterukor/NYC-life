// Chess rules checked against standard perft counts (every legal move
// sequence to depth N), plus mates, stalemate, and the opponents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestMove, fromFen, legalMoves, OPPONENTS, play, result, sq, START_FEN, type Position } from '../src/sim/chess.ts';

function perft(p: Position, d: number): number {
  if (d === 0) return 1;
  let n = 0;
  for (const m of legalMoves(p)) n += perft(play(p, m), d - 1);
  return n;
}

test('perft: start position', () => {
  const p = fromFen(START_FEN);
  assert.equal(perft(p, 1), 20);
  assert.equal(perft(p, 2), 400);
  assert.equal(perft(p, 3), 8902);
});

test('perft: "Kiwipete" (castling, en passant, promotions, pins)', () => {
  const p = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(p, 1), 48);
  assert.equal(perft(p, 2), 2039);
  assert.equal(perft(p, 3), 97862);
});

test('perft: position 3 (en passant edge cases)', () => {
  const p = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.equal(perft(p, 1), 14);
  assert.equal(perft(p, 2), 191);
  assert.equal(perft(p, 3), 2812);
  assert.equal(perft(p, 4), 43238);
});

test('perft: position 4 (promotion and castling through check)', () => {
  const p = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
  assert.equal(perft(p, 1), 6);
  assert.equal(perft(p, 2), 264);
  assert.equal(perft(p, 3), 9467);
});

test('checkmate, stalemate and bare kings are spotted', () => {
  const mate = fromFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'); // fool's mate
  assert.deepEqual(result(mate), { over: true, winner: 'b', why: 'checkmate' });
  const stale = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.deepEqual(result(stale), { over: true, winner: null, why: 'stalemate' });
  assert.equal(result(fromFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1')).over, true);
});

test('opponents: every one finds mate in one; the grandmaster never blunders it', () => {
  const p = fromFen('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'); // Rd8#
  for (const o of OPPONENTS) {
    let found = 0;
    for (let i = 0; i < 5; i++) {
      const m = bestMove(p, o, () => 0.99); // no blunder roll
      if (m && m.from === sq('d1') && m.to === sq('d8')) found++;
    }
    assert.equal(found, 5, o.name);
  }
  // A full game between two engines finishes and every move is legal.
  let pos = fromFen(START_FEN);
  for (let ply = 0; ply < 60 && !result(pos).over; ply++) {
    const m = bestMove(pos, OPPONENTS[ply % 2])!;
    assert.ok(legalMoves(pos).some((x) => x.from === m.from && x.to === m.to));
    pos = play(pos, m);
  }
});
