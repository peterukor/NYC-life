// =====================================================================
// arcade-stack.ts (sim) — the rules of 🥪 Bodega Stack (ui/arcade/stack.ts),
// kept pure so they can be tested and botted.
//
// A layer slides across; tap to drop it on the sandwich. What hangs over
// the edge is cut off. Land within a few pixels and it's PERFECT: it snaps
// on and keeps its width, and from the third perfect in a row each one
// grows the layer back a little. Every 10th layer is the top 🍞 bread: an
// ✨ ORDER UP worth ×3 and a bonus that rises with every order. It gets
// faster and the perfect window gets tighter as the sandwich climbs.
// Miss the sandwich completely and it's over.
// =====================================================================

export const STACK_BASE_W = 180;
/** The playfield is 360 wide (cabinet px). */
export const STACK_FIELD_W = 360;
/** Width a perfect streak grows the layer by (from the 3rd in a row). */
export const STACK_GROW = 10;
/** Every Nth layer is the top bread (an ORDER UP). */
export const STACK_ORDER_EVERY = 10;

/** The fillings, in the order of the deli case (index = texture in the UI). 0 is bread. */
export const STACK_FILLINGS = ['bread', 'bacon', 'cheese', 'lettuce', 'tomato', 'egg', 'turkey', 'onion', 'pickle', 'pastrami', 'peppers'] as const;
export type Filling = (typeof STACK_FILLINGS)[number];
export const STACK_EMOJI: Record<Filling, string> = {
  bread: '🍞', bacon: '🥓', cheese: '🧀', lettuce: '🥬', tomato: '🍅', egg: '🥚', turkey: '🦃', onion: '🧅', pickle: '🥒', pastrami: '🥩', peppers: '🌶️',
};

export interface StackLayer {
  x: number;
  w: number;
  /** Index into STACK_FILLINGS. */
  kind: number;
  gold: boolean;
}

export interface Slider extends StackLayer {
  dir: 1 | -1;
  speed: number;
}

export interface StackState {
  layers: StackLayer[];
  cur: Slider;
  streak: number;
  bestStreak: number;
  perfects: number;
  orders: number;
  score: number;
  dead: boolean;
}

export type StackDrop =
  | { kind: 'miss' }
  | { kind: 'perfect'; x: number; w: number; grow: number }
  | { kind: 'cut'; x: number; w: number; cutX: number; cutW: number };

export type StackEvent =
  | { type: 'place'; drop: Exclude<StackDrop, { kind: 'miss' }>; layer: number; pts: number; streak: number; gold: boolean }
  | { type: 'order'; orders: number; bonus: number }
  | { type: 'miss'; x: number; w: number };

/** Pixels of slack for a PERFECT (tighter as you climb). */
export const stackTolerance = (layer: number): number => Math.max(3.5, 7 - layer * 0.08);
/** Slide speed (px/s): faster as you climb. */
export const stackSpeed = (layer: number): number => Math.min(420, 140 + layer * 6);
/** Is layer n (1 = first on the base) the top bread? */
export const stackIsOrder = (n: number): boolean => n > 0 && n % STACK_ORDER_EVERY === 0;

/** Where a layer lands on the one below. */
export function stackDrop(topX: number, topW: number, x: number, w: number, tol: number, streakBefore: number): StackDrop {
  const l = Math.max(x, topX), r = Math.min(x + w, topX + topW);
  if (r - l <= 2) return { kind: 'miss' };
  if (Math.abs(x - topX) <= tol) {
    // Third perfect in a row and after: grow back a little (centred, up to the base width).
    const grow = streakBefore + 1 >= 3 ? Math.min(STACK_GROW, STACK_BASE_W - topW) : 0;
    return { kind: 'perfect', x: topX - grow / 2, w: topW + grow, grow };
  }
  const offLeft = x < l;
  return { kind: 'cut', x: l, w: r - l, cutX: offLeft ? x : r, cutW: w - (r - l) };
}

/** Points for a drop: 5 a layer; a perfect 10 + 5 per streak (up to +30); ×3 on the top bread. */
export function stackPoints(kind: 'perfect' | 'cut', streak: number, gold: boolean): number {
  const base = kind === 'perfect' ? 10 + 5 * Math.min(6, Math.max(0, streak - 1)) : 5;
  return base * (gold ? 3 : 1);
}

/** The ORDER UP bonus for the nth order. */
export const stackOrderBonus = (orders: number): number => 25 + 25 * orders;

/** Which filling comes next (never the same twice; the top bread every 10th). */
export function stackNextKind(n: number, prevKind: number, r: number): number {
  if (stackIsOrder(n)) return 0;
  const k = 1 + Math.floor(r * (STACK_FILLINGS.length - 1));
  return k === prevKind ? 1 + (k % (STACK_FILLINGS.length - 1)) : k;
}

/** The sliding layer's range: it always passes over every point of the field. */
export const stackRange = (w: number): [number, number] => [-w * 0.45, STACK_FIELD_W - w * 0.55];

function spawn(s: StackState, rand: () => number): void {
  const n = s.layers.length; // the number this layer will be
  const top = s.layers[n - 1];
  const kind = stackNextKind(n, top.kind, rand());
  const dir: 1 | -1 = n % 2 ? 1 : -1;
  const [lo, hi] = stackRange(top.w);
  s.cur = { x: dir > 0 ? lo : hi, w: top.w, kind, gold: stackIsOrder(n), dir, speed: stackSpeed(n) };
}

export function createStack(rand: () => number): StackState {
  const base: StackLayer = { x: (STACK_FIELD_W - STACK_BASE_W) / 2, w: STACK_BASE_W, kind: 0, gold: false };
  const s: StackState = { layers: [base], cur: { ...base, dir: 1, speed: 0 }, streak: 0, bestStreak: 0, perfects: 0, orders: 0, score: 0, dead: false };
  spawn(s, rand);
  return s;
}

/** Slide the current layer (ping-pong inside its range). */
export function stackSlide(s: StackState, dt: number): void {
  if (s.dead) return;
  const c = s.cur;
  const [lo, hi] = stackRange(c.w);
  c.x += c.dir * c.speed * dt;
  if (c.x > hi) (c.x = hi - (c.x - hi)), (c.dir = -1);
  if (c.x < lo) (c.x = lo + (lo - c.x)), (c.dir = 1);
}

/** Drop the current layer. */
export function stackPlace(s: StackState, rand: () => number, out: StackEvent[]): void {
  if (s.dead) return;
  const top = s.layers[s.layers.length - 1];
  const c = s.cur;
  const n = s.layers.length;
  const d = stackDrop(top.x, top.w, c.x, c.w, stackTolerance(n), s.streak);
  if (d.kind === 'miss') {
    s.dead = true;
    out.push({ type: 'miss', x: c.x, w: c.w });
    return;
  }
  if (d.kind === 'perfect') {
    s.streak++;
    s.perfects++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else s.streak = 0;
  const pts = stackPoints(d.kind, s.streak, c.gold);
  s.score += pts;
  s.layers.push({ x: d.x, w: d.w, kind: c.kind, gold: c.gold });
  out.push({ type: 'place', drop: d, layer: n, pts, streak: s.streak, gold: c.gold });
  if (c.gold) {
    s.orders++;
    const bonus = stackOrderBonus(s.orders);
    s.score += bonus;
    out.push({ type: 'order', orders: s.orders, bonus });
  }
  spawn(s, rand);
}

/** 🎟️ for a score: a good sandwich (≈30 layers, ≈500) is about 40. */
export const stackTickets = (score: number): number => Math.floor(Math.max(0, score) / 12);

/** Highest score the server should accept. */
export const STACK_MAX = 15000;
