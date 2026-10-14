// =====================================================================
// kitchen.ts — groceries, the fridge, cooking and leftovers.
//
// The loop: order ingredients on InstaDash → the courier brings them to
// your fridge → cook a meal at the stove → eat one portion now, keep the
// rest in the fridge for later.
//
// Everything is in the save (state.kitchen): what's in the fridge, the
// leftovers, orders on their way. Cooking takes the ingredients when it
// starts; stopping early gives them back (the activity remembers exactly
// what it took), and finishing puts the portions in the fridge. Eating
// takes one portion when it starts. So stopping or reloading can never
// copy food. The free "Grab a snack" at the fridge is always there, so an
// empty fridge never leaves you stuck.
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { DELIVERY_FEE, DELIVERY_SECONDS, INGREDIENT_BY_ID, MEAL_BY_ID, STARTER_PANTRY, type MealDef } from '../data/groceries.ts';
import type { SpawnClass } from '../data/wardrobe.ts';
import type { GameState } from './types.ts';

export interface KitchenState {
  /** Ingredient units in the fridge. */
  pantry: Record<string, number>;
  /** Cooked portions in the fridge, by meal. */
  leftovers: Record<string, number>;
  /** InstaDash orders on their way: packs of each ingredient. */
  orders: { id: number; packs: Record<string, number>; arrivesAt: number }[];
}

export function newKitchen(spawnClass: SpawnClass = 'poor'): KitchenState {
  return { pantry: { ...STARTER_PANTRY[spawnClass] }, leftovers: {}, orders: [] };
}

/** The kitchen (old saves get an empty one). */
export function kitchenOf(s: GameState): KitchenState {
  return (s.kitchen ??= { pantry: {}, leftovers: {}, orders: [] });
}

const add = (rec: Record<string, number>, id: string, n: number) => {
  const v = (rec[id] ?? 0) + n;
  if (v > 0) rec[id] = v;
  else delete rec[id];
};

// ---------------------------------------------------------------------
// InstaDash
// ---------------------------------------------------------------------

/** Groceries cost plus the delivery fee. */
export function cartTotal(packs: Record<string, number>): number {
  let sum = 0;
  for (const [id, n] of Object.entries(packs)) if (n > 0 && INGREDIENT_BY_ID[id]) sum += INGREDIENT_BY_ID[id].price * n;
  return sum > 0 ? sum + DELIVERY_FEE : 0;
}

/** Place an order: paid now (cash), delivered to your fridge soon. */
export function orderGroceries(s: GameState, packs: Record<string, number>, now = nowMs()): { ok: true; total: number; arrivesAt: number } | { ok: false; why: string } {
  const clean: Record<string, number> = {};
  for (const [id, n] of Object.entries(packs)) {
    const k = Math.floor(n);
    if (k > 0 && INGREDIENT_BY_ID[id]) clean[id] = Math.min(k, 20);
  }
  if (!Object.keys(clean).length) return { ok: false, why: 'Your cart is empty' };
  const total = cartTotal(clean);
  if (s.money < total) return { ok: false, why: 'Not enough cash for this order' };
  s.money -= total;
  const k = kitchenOf(s);
  const arrivesAt = now + DELIVERY_SECONDS * 1000;
  k.orders.push({ id: now, packs: clean, arrivesAt });
  return { ok: true, total, arrivesAt };
}

/** Orders that have arrived go into the fridge. Returns how many arrived. */
export function receiveOrders(s: GameState, now = nowMs()): number {
  const k = kitchenOf(s);
  const here = k.orders.filter((o) => o.arrivesAt <= now);
  if (!here.length) return 0;
  k.orders = k.orders.filter((o) => o.arrivesAt > now);
  for (const o of here) for (const [id, n] of Object.entries(o.packs)) if (INGREDIENT_BY_ID[id]) add(k.pantry, id, n * INGREDIENT_BY_ID[id].units);
  return here.length;
}

// ---------------------------------------------------------------------
// Cooking and eating
// ---------------------------------------------------------------------

/** What's missing to cook a meal (empty = you have it all). */
export function missingFor(s: GameState, meal: MealDef): { id: string; need: number; have: number }[] {
  const p = kitchenOf(s).pantry;
  return Object.entries(meal.uses)
    .filter(([id, n]) => (p[id] ?? 0) < n)
    .map(([id, n]) => ({ id, need: n, have: p[id] ?? 0 }));
}

/** Take a meal's ingredients out of the fridge. Returns what was taken, or null if something's missing. */
export function takeIngredients(s: GameState, mealId: string, dryRun = false): Record<string, number> | null {
  const meal = MEAL_BY_ID[mealId];
  if (!meal || missingFor(s, meal).length) return null;
  if (dryRun) return { ...meal.uses };
  const p = kitchenOf(s).pantry;
  for (const [id, n] of Object.entries(meal.uses)) add(p, id, -n);
  return { ...meal.uses };
}

/** Put ingredients back (cooking stopped before it was done). */
export function returnIngredients(s: GameState, took: Record<string, number>): void {
  const p = kitchenOf(s).pantry;
  for (const [id, n] of Object.entries(took)) add(p, id, n);
}

/** The cooked portions go in the fridge. */
export function storePortions(s: GameState, mealId: string, n: number): void {
  add(kitchenOf(s).leftovers, mealId, n);
}

/** Take one portion out to eat. Returns false if there isn't one. */
export function takePortion(s: GameState, mealId: string): boolean {
  const k = kitchenOf(s);
  if ((k.leftovers[mealId] ?? 0) < 1) return false;
  add(k.leftovers, mealId, -1);
  return true;
}
