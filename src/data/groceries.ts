// =====================================================================
// groceries.ts — ingredients you order on InstaDash, and the meals you
// cook with them (Peter, 2026-10-13).
//
// Prices are in cents. Each ingredient is sold in a pack (a loaf is 8
// slices); recipes use units (2 slices of bread). Cooking a home meal is
// much cheaper than eating out (a sandwich costs about $3 in groceries,
// a chopped cheese $9), which is the reason to shop and cook.
//
// Add an ingredient: one line in INGREDIENTS. Add a meal: one line in
// MEALS, plus its two actions (cook and eat) are made for you below.
// =====================================================================

import type { ActionDef } from './actions.ts';
import type { SpawnClass } from './wardrobe.ts';

export interface IngredientDef {
  id: string;
  name: string;
  emoji: string;
  /** What one pack is ("Loaf, 8 slices"). */
  pack: string;
  /** Units in one pack. */
  units: number;
  /** One unit's name, singular and plural ("slice", "slices"). */
  unit: [string, string];
  price: number;
}

export const INGREDIENTS: IngredientDef[] = [
  { id: 'bread', name: 'Bread', emoji: '🍞', pack: 'Loaf, 8 slices', units: 8, unit: ['slice', 'slices'], price: 350 },
  { id: 'eggs', name: 'Eggs', emoji: '🥚', pack: 'Dozen', units: 12, unit: ['egg', 'eggs'], price: 450 },
  { id: 'cheese', name: 'Cheese', emoji: '🧀', pack: '10 slices', units: 10, unit: ['slice', 'slices'], price: 450 },
  { id: 'turkey', name: 'Deli turkey', emoji: '🦃', pack: '8 slices', units: 8, unit: ['slice', 'slices'], price: 600 },
  { id: 'pasta', name: 'Pasta', emoji: '🍝', pack: 'Box, 4 servings', units: 4, unit: ['serving', 'servings'], price: 200 },
  { id: 'sauce', name: 'Tomato sauce', emoji: '🥫', pack: 'Jar, 4 servings', units: 4, unit: ['serving', 'servings'], price: 350 },
  { id: 'veggies', name: 'Mixed veggies', emoji: '🥦', pack: 'Bag, 4 servings', units: 4, unit: ['serving', 'servings'], price: 400 },
  { id: 'chicken', name: 'Chicken breast', emoji: '🍗', pack: '2 pieces', units: 2, unit: ['piece', 'pieces'], price: 800 },
];
export const INGREDIENT_BY_ID: Record<string, IngredientDef> = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

export interface MealDef {
  id: string;
  name: string;
  emoji: string;
  /** Units of each ingredient one go uses. */
  uses: Record<string, number>;
  /** Portions one go makes (extra ones are leftovers). */
  portions: number;
  /** Seconds to make on a basic stove (cheap is slower, nice is quicker). */
  seconds: number;
  /** What eating one portion gives. */
  hunger: number;
  fun?: number;
  /** Cooking experience for making it. */
  skill: number;
  /** Cooking level needed. */
  level?: number;
}

export const MEALS: MealDef[] = [
  { id: 'sandwich', name: 'Turkey & cheese sandwich', emoji: '🥪', uses: { bread: 2, turkey: 2, cheese: 1 }, portions: 1, seconds: 6, hunger: 40, fun: 2, skill: 0.25 },
  { id: 'eggsToast', name: 'Eggs and toast', emoji: '🍳', uses: { eggs: 2, bread: 2 }, portions: 1, seconds: 8, hunger: 45, fun: 3, skill: 0.4 },
  { id: 'pasta', name: 'Pasta with red sauce', emoji: '🍝', uses: { pasta: 2, sauce: 1 }, portions: 2, seconds: 12, hunger: 55, fun: 4, skill: 0.6 },
  { id: 'chickenVeg', name: 'Roast chicken and veggies', emoji: '🍗', uses: { chicken: 1, veggies: 2 }, portions: 2, seconds: 16, hunger: 70, fun: 10, skill: 0.9, level: 2 },
];
export const MEAL_BY_ID: Record<string, MealDef> = Object.fromEntries(MEALS.map((m) => [m.id, m]));

/** The action that cooks a meal, and the one that eats a portion. */
export const cookActionId = (mealId: string) => `cook_${mealId}`;
export const eatActionId = (mealId: string) => `eat_${mealId}`;
/** The meal a cook_/eat_ action is about. */
export function mealOfAction(actionId: string): { meal: MealDef; kind: 'cook' | 'eat' } | null {
  const m = /^(cook|eat)_(.+)$/.exec(actionId);
  const meal = m ? MEAL_BY_ID[m[2]] : undefined;
  return meal ? { meal, kind: m![1] as 'cook' | 'eat' } : null;
}

/** Cook and eat actions for every meal (merged into ACTIONS). */
export function mealActions(): ActionDef[] {
  return MEALS.flatMap((m): ActionDef[] => [
    {
      id: cookActionId(m.id),
      label: `Cook ${m.name.toLowerCase()}`,
      emoji: m.emoji,
      seconds: m.seconds,
      skill: { key: 'cooking', gain: m.skill },
      ...(m.level ? { requires: { skill: 'cooking' as const, level: m.level } } : {}),
      tags: ['cook'],
    },
    { id: eatActionId(m.id), label: `Eat ${m.name.toLowerCase()}`, emoji: m.emoji, seconds: 5, needs: { hunger: m.hunger, ...(m.fun ? { fun: m.fun } : {}) }, tags: ['eat'] },
  ]);
}

/** InstaDash: delivery fee and how long the courier takes (real seconds). */
export const DELIVERY_FEE = 299;
export const DELIVERY_SECONDS = 40;

/** What's already in the fridge when you start (units). */
export const STARTER_PANTRY: Record<SpawnClass, Record<string, number>> = {
  poor: { bread: 4, eggs: 2 },
  middle: { bread: 6, eggs: 6, pasta: 2, sauce: 1 },
  rich: { bread: 8, eggs: 12, cheese: 10, turkey: 8, pasta: 4, sauce: 4 },
  billionaire: { bread: 8, eggs: 12, cheese: 10, turkey: 8, pasta: 4, sauce: 4, veggies: 4, chicken: 2 },
};
