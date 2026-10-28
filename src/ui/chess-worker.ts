// =====================================================================
// chess-worker.ts — the chess engine off the main thread, so the board,
// the clocks and the opponent's chatter stay smooth while they think.
// ui/chess.ts sends the game (start FEN + moves so far, for repetitions)
// and the opponent's level; the reply is one Thought (sim/chess.ts).
// =====================================================================

import { Board, clearEngine, think, type Level, type Thought } from '../sim/chess.ts';

export interface EngineRequest {
  id: number;
  fen: string;
  moves: string[];
  level: Level;
  /** Start of a new game: forget the last one. */
  fresh?: boolean;
}
export interface EngineReply {
  id: number;
  thought: Thought;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<EngineRequest>) => void) | null; postMessage: (m: EngineReply) => void };
ctx.onmessage = (e) => {
  const { id, fen, moves, level, fresh } = e.data;
  if (fresh) clearEngine();
  const b = Board.fromFen(fen);
  for (const u of moves) {
    const m = b.parseUci(u);
    if (m) b.make(m);
  }
  ctx.postMessage({ id, thought: think(b, level) });
};
