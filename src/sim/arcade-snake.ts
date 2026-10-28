// =====================================================================
// arcade-snake.ts (sim) — the rules of 🐍 Subway Snake (ui/arcade/snake.ts),
// kept pure so they can be tested and botted: the grid, turning, the
// step, eating, combos, stops, 🚧 roadworks, and the tickets.
//
// You're the 1 train running uptown on a grid. Every 🍕 is a car longer
// and a bit faster; five 🍕 make a stop (bonus, and a 🚧 goes up). Eat
// a slice within its "par" (how far it was, plus a little slack) to keep
// the combo going (×2 at 2, up to ×5). ✨ golden slices and 🥤 slow-mo
// sodas show up for a while. Hitting a wall, a 🚧 or yourself ends it,
// but the first time the next cell is deadly the train screeches for
// one step, so a late turn still saves you.
// =====================================================================

export const SNAKE_COLS = 18;
export const SNAKE_ROWS = 22;
/** Length of a run (seconds; the cabinet's clock). */
export const SNAKE_SECONDS = 90;
export const SNAKE_PER_STOP = 5;
/** Steps of slack on top of the distance for a combo. */
export const SNAKE_PAR_SLACK = 6;
/** Steps a golden slice / soda stays, and the slow-mo it gives. */
export const SNAKE_GOLD_STEPS = 45;
export const SNAKE_SODA_STEPS = 60;
export const SNAKE_SLOW_STEPS = 40;
/** Steps a new 🚧 blinks before it's solid. */
export const SNAKE_WARM_STEPS = 12;
export const SNAKE_PTS = { pizza: 10, gold: 50, perCar: 5 } as const;

/** The 1 train, uptown (the stops you reach every five slices). */
export const SNAKE_STOPS = [
  'South Ferry', 'Chambers St', 'Canal St', 'Christopher St', '14 St', '23 St', '34 St–Penn', 'Times Sq–42 St', '59 St–Columbus Circle',
  '72 St', '86 St', '96 St', '110 St', '116 St–Columbia', '125 St', '145 St', '168 St', 'Dyckman St', '215 St', 'Van Cortlandt Park',
];

export interface Cell {
  x: number;
  y: number;
}
export interface Timed extends Cell {
  ttl: number;
}
export interface Roadwork extends Cell {
  /** Steps until solid (blinking until then). */
  warm: number;
}

export interface SnakeState {
  body: Cell[];
  /** Where each car was before the last step (for smooth drawing). */
  prev: Cell[];
  dir: Cell;
  /** Buffered turns (two quick swipes both count). */
  queue: Cell[];
  pizza: Cell;
  gold: Timed | null;
  soda: Timed | null;
  walls: Roadwork[];
  grow: number;
  eaten: number;
  score: number;
  combo: number;
  bestCombo: number;
  /** Steps left to eat this slice and keep the combo. */
  par: number;
  /** Par when the slice appeared (for the draining bar). */
  parMax: number;
  stop: number;
  slow: number;
  steps: number;
  graced: boolean;
  dead: boolean;
}

export type SnakeEvent =
  | { type: 'eat'; kind: 'pizza' | 'gold'; x: number; y: number; pts: number; mult: number; combo: number }
  | { type: 'soda'; x: number; y: number }
  | { type: 'stop'; stop: number; name: string; bonus: number }
  | { type: 'roadwork'; x: number; y: number }
  | { type: 'screech'; x: number; y: number }
  | { type: 'crash'; x: number; y: number }
  | { type: 'expire'; kind: 'gold' | 'soda'; x: number; y: number };

export const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Combo multiplier: ×1, ×2 at 2 quick slices, ×3 at 4 … ×5 at 8. */
export const snakeMult = (combo: number): number => Math.min(5, 1 + Math.floor(Math.max(0, combo) / 2));

/** Milliseconds per grid step: faster with every slice; 🥤 slows it. */
export function snakeStepMs(eaten: number, slow: boolean): number {
  return Math.max(80, 150 - eaten * 2.3) * (slow ? 1.6 : 1);
}

export const inGrid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < SNAKE_COLS && y < SNAKE_ROWS;

/** A turn is allowed if it isn't straight on or straight back (relative to the last buffered turn). */
export function canTurn(last: Cell, dx: number, dy: number): boolean {
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  if (dx === last.x && dy === last.y) return false;
  return !(dx === -last.x && dy === -last.y);
}

/** Buffer a turn (max 3 ahead). Returns whether it was taken. */
export function snakeTurn(s: SnakeState, dx: number, dy: number): boolean {
  if (s.dead) return false;
  const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  if (s.queue.length >= 3 || !canTurn(last, dx, dy)) return false;
  s.queue.push({ x: dx, y: dy });
  return true;
}

/** Is a cell occupied by something you'd crash into? (The tail moves away unless the train is growing.) */
export function snakeDeadly(s: SnakeState, x: number, y: number): boolean {
  if (!inGrid(x, y)) return true;
  for (const w of s.walls) if (w.warm <= 0 && w.x === x && w.y === y) return true;
  const n = s.body.length - (s.grow > 0 ? 0 : 1);
  for (let i = 0; i < n; i++) if (s.body[i].x === x && s.body[i].y === y) return true;
  return false;
}

function taken(s: SnakeState, x: number, y: number): boolean {
  for (const b of s.body) if (b.x === x && b.y === y) return true;
  for (const w of s.walls) if (w.x === x && w.y === y) return true;
  if (s.pizza.x === x && s.pizza.y === y) return true;
  if (s.gold && s.gold.x === x && s.gold.y === y) return true;
  if (s.soda && s.soda.x === x && s.soda.y === y) return true;
  return false;
}

/** A random free cell at least `minDist` from the head (null if the board is full). */
export function snakeFreeCell(s: SnakeState, rand: () => number, minDist = 3, avoidAhead = false): Cell | null {
  const h = s.body[0];
  const ok = (x: number, y: number) => {
    if (taken(s, x, y) || Math.abs(x - h.x) + Math.abs(y - h.y) < minDist) return false;
    // Never drop a 🚧 straight in front of the train.
    if (avoidAhead && ((s.dir.x !== 0 && y === h.y && Math.sign(x - h.x) === s.dir.x) || (s.dir.y !== 0 && x === h.x && Math.sign(y - h.y) === s.dir.y))) return false;
    // Keep 🚧 off the outer ring so corners never become traps.
    if (avoidAhead && (x === 0 || y === 0 || x === SNAKE_COLS - 1 || y === SNAKE_ROWS - 1)) return false;
    return true;
  };
  for (let i = 0; i < 80; i++) {
    const x = Math.floor(rand() * SNAKE_COLS), y = Math.floor(rand() * SNAKE_ROWS);
    if (ok(x, y)) return { x, y };
  }
  const start = Math.floor(rand() * SNAKE_COLS * SNAKE_ROWS);
  for (let k = 0; k < SNAKE_COLS * SNAKE_ROWS; k++) {
    const i = (start + k) % (SNAKE_COLS * SNAKE_ROWS);
    const x = i % SNAKE_COLS, y = Math.floor(i / SNAKE_COLS);
    if (ok(x, y)) return { x, y };
  }
  return null;
}

/** After a slice: maybe a ✨ golden slice or a 🥤 soda (the spawn table). */
export function snakeBonusRoll(r: number, hasGold: boolean, hasSoda: boolean): 'gold' | 'soda' | null {
  if (!hasGold && r < 0.16) return 'gold';
  if (!hasSoda && r >= 0.16 && r < 0.24) return 'soda';
  return null;
}

function placePizza(s: SnakeState, rand: () => number): void {
  const c = snakeFreeCell(s, rand, 4);
  if (c) s.pizza = c;
  s.par = s.parMax = manhattan(s.body[0], s.pizza) + SNAKE_PAR_SLACK;
}

export function createSnake(rand: () => number): SnakeState {
  const body = [{ x: 9, y: 15 }, { x: 9, y: 16 }, { x: 9, y: 17 }];
  const s: SnakeState = {
    body,
    prev: body.map((b) => ({ x: b.x, y: b.y + 1 })),
    dir: { x: 0, y: -1 },
    queue: [],
    pizza: { x: 9, y: 8 },
    gold: null,
    soda: null,
    walls: [],
    grow: 0,
    eaten: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    par: 0,
    parMax: 1,
    stop: 0,
    slow: 0,
    steps: 0,
    graced: false,
    dead: false,
  };
  // The first slice is straight ahead: an easy start.
  s.pizza = { x: 9, y: 9 };
  s.par = s.parMax = manhattan(body[0], s.pizza) + SNAKE_PAR_SLACK;
  void rand;
  return s;
}

/** One grid step. Pushes what happened into `out`. */
export function snakeTick(s: SnakeState, rand: () => number, out: SnakeEvent[]): void {
  if (s.dead) return;
  if (s.queue.length) s.dir = s.queue.shift()!;
  const h = s.body[0];
  const nx = h.x + s.dir.x, ny = h.y + s.dir.y;
  if (snakeDeadly(s, nx, ny)) {
    if (!s.graced) {
      // The screech: hold one step so a late turn still saves you.
      s.graced = true;
      for (let i = 0; i < s.body.length; i++) (s.prev[i].x = s.body[i].x), (s.prev[i].y = s.body[i].y);
      out.push({ type: 'screech', x: h.x, y: h.y });
      return;
    }
    s.dead = true;
    out.push({ type: 'crash', x: nx, y: ny });
    return;
  }
  s.graced = false;
  s.steps++;
  // Move: remember where everyone was, shift down the train.
  const tail = s.body[s.body.length - 1];
  const tx = tail.x, ty = tail.y;
  for (let i = 0; i < s.body.length; i++) (s.prev[i].x = s.body[i].x), (s.prev[i].y = s.body[i].y);
  for (let i = s.body.length - 1; i > 0; i--) (s.body[i].x = s.body[i - 1].x), (s.body[i].y = s.body[i - 1].y);
  s.body[0].x = nx;
  s.body[0].y = ny;
  if (s.grow > 0) {
    s.grow--;
    s.body.push({ x: tx, y: ty });
    s.prev.push({ x: tx, y: ty });
  }
  s.par--;
  if (s.slow > 0) s.slow--;
  for (const w of s.walls) if (w.warm > 0) w.warm--;
  if (s.gold && --s.gold.ttl <= 0) out.push({ type: 'expire', kind: 'gold', x: s.gold.x, y: s.gold.y }), (s.gold = null);
  if (s.soda && --s.soda.ttl <= 0) out.push({ type: 'expire', kind: 'soda', x: s.soda.x, y: s.soda.y }), (s.soda = null);

  if (nx === s.pizza.x && ny === s.pizza.y) {
    s.combo = s.par >= 0 ? s.combo + 1 : 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    const mult = snakeMult(s.combo);
    const pts = SNAKE_PTS.pizza * mult;
    s.score += pts;
    s.eaten++;
    s.grow += 1;
    out.push({ type: 'eat', kind: 'pizza', x: nx, y: ny, pts, mult, combo: s.combo });
    if (s.eaten % SNAKE_PER_STOP === 0) {
      s.stop++;
      const bonus = 20 * s.stop;
      s.score += bonus;
      out.push({ type: 'stop', stop: s.stop, name: SNAKE_STOPS[Math.min(s.stop, SNAKE_STOPS.length - 1)], bonus });
      const c = snakeFreeCell(s, rand, 5, true);
      if (c) {
        s.walls.push({ x: c.x, y: c.y, warm: SNAKE_WARM_STEPS });
        out.push({ type: 'roadwork', x: c.x, y: c.y });
      }
    }
    placePizza(s, rand);
    const b = snakeBonusRoll(rand(), !!s.gold, !!s.soda);
    if (b) {
      const c = snakeFreeCell(s, rand, 4);
      if (c) {
        if (b === 'gold') s.gold = { x: c.x, y: c.y, ttl: SNAKE_GOLD_STEPS };
        else s.soda = { x: c.x, y: c.y, ttl: SNAKE_SODA_STEPS };
      }
    }
  } else if (s.gold && nx === s.gold.x && ny === s.gold.y) {
    const mult = snakeMult(s.combo);
    const pts = SNAKE_PTS.gold * mult;
    s.score += pts;
    s.grow += 3;
    s.gold = null;
    out.push({ type: 'eat', kind: 'gold', x: nx, y: ny, pts, mult, combo: s.combo });
  } else if (s.soda && nx === s.soda.x && ny === s.soda.y) {
    s.slow = SNAKE_SLOW_STEPS;
    s.soda = null;
    out.push({ type: 'soda', x: nx, y: ny });
  }
}

/** End of the line (time's up): a bonus per car. Returns the bonus. */
export function snakeFinish(s: SnakeState): number {
  const bonus = SNAKE_PTS.perCar * s.body.length;
  s.score += bonus;
  return bonus;
}

/** 🎟️ for a score: a good run (≈1,000) is about 40. */
export const snakeTickets = (score: number): number => Math.floor(Math.max(0, score) / 25);

/** Highest score the server should accept. */
export const SNAKE_MAX = 8000;
