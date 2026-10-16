// =====================================================================
// kitchen.ts — the fridge and the stove at home.
//
// Fridge: your leftovers (eat one), what ingredients you have, orders on
// their way, a free snack (always there, so an empty fridge never traps
// you) and a shortcut to order on InstaDash.
//
// Stove: every meal, with how long it takes on THIS stove, what it uses
// (and what you're missing), how many portions it makes and how much
// hunger each one restores, before you start.
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { esc } from '../core/format.ts';
import { ACTIONS } from '../data/actions.ts';
import { FURNITURE_QUALITY, type Quality } from '../data/furniture.ts';
import { INGREDIENTS, INGREDIENT_BY_ID, MEALS, MEAL_BY_ID, cookActionId, type MealDef } from '../data/groceries.ts';
import { activitySeconds } from '../sim/home-activity.ts';
import { kitchenOf, missingFor } from '../sim/kitchen.ts';
import type { GameState } from '../sim/types.ts';
import { onAct, openSheet } from './dom.ts';

const units = (id: string, n: number) => {
  const d = INGREDIENT_BY_ID[id];
  return `${n} ${d ? d.unit[n === 1 ? 0 : 1] : ''}`;
};

export interface FridgeHooks {
  eat: (mealId: string) => void;
  snack: () => void;
  /** Other things the fridge does (the billionaire's chef). */
  extra: { actionId: string; run: () => void }[];
  order: () => void;
}

export function openFridge(s: GameState, title: string, emoji: string, hooks: FridgeHooks): void {
  const k = kitchenOf(s);
  const left = Object.entries(k.leftovers).filter(([id, n]) => n > 0 && MEAL_BY_ID[id]);
  const stock = INGREDIENTS.filter((i) => (k.pantry[i.id] ?? 0) > 0);
  const coming = k.orders.length ? Math.max(0, Math.ceil((Math.min(...k.orders.map((o) => o.arrivesAt)) - nowMs()) / 1000)) : null;
  const sheet = openSheet({
    emoji,
    title,
    sub: 'What’s in the fridge',
    className: 'kitchen-sheet',
    body: `
      <h3 class="shop-group">Leftovers</h3>
      ${left.length
        ? left.map(([id, n]) => {
            const m = MEAL_BY_ID[id];
            return `<div class="list-item"><span class="k-emoji">${m.emoji}</span><div class="grow"><div class="title">${esc(m.name)}</div><div class="sub">${n} portion${n === 1 ? '' : 's'} · +${m.hunger} hunger each</div></div><button class="btn primary" data-act="eat:${id}">Eat one</button></div>`;
          }).join('')
        : '<p class="blurb">No leftovers. Cook something on the stove and keep the extra portions here.</p>'}
      <h3 class="shop-group">Ingredients</h3>
      ${stock.length
        ? `<div class="k-chips">${stock.map((i) => `<span class="k-chip">${i.emoji} ${esc(i.name)} <b>${units(i.id, k.pantry[i.id])}</b></span>`).join('')}</div><p class="sub">🔥 To cook with these, close the fridge and tap the stove.</p>`
        : '<p class="blurb">Nothing to cook with yet.</p>'}
      ${coming !== null ? `<p class="blurb k-coming">🛵 InstaDash order on its way · about ${coming}s</p>` : ''}
      <button class="btn block k-order" data-act="order">🛵 Order groceries on InstaDash</button>
      <div class="actions" style="margin-top:12px">
        ${[{ id: 'snack' }, ...hooks.extra.map((x) => ({ id: x.actionId }))].map(({ id }) => {
          const a = ACTIONS[id];
          return `<button class="action" data-act="do:${id}"><span class="price free">Free</span><span style="font-size:22px">${a.emoji}</span><span class="t">${esc(a.label)}</span><span class="m">${a.seconds}s</span><span class="fx">${Object.entries(a.needs ?? {}).map(([n, v]) => `<span>+${v} ${n}</span>`).join('')}</span></button>`;
        }).join('')}
      </div>`,
  });
  onAct(sheet.body, (act) => {
    sheet.close();
    if (act === 'order') return hooks.order();
    if (act.startsWith('eat:')) return hooks.eat(act.slice(4));
    if (act === 'do:snack') return hooks.snack();
    hooks.extra.find((x) => `do:${x.actionId}` === act)?.run();
  });
}

export interface StoveHooks {
  cook: (mealId: string) => void;
  order: () => void;
}

/** One meal's card: time, ingredients (have/need), portions, hunger. */
function mealCard(s: GameState, m: MealDef, item: string): string {
  const k = kitchenOf(s);
  const missing = missingFor(s, m);
  const lockLvl = m.level && Math.floor(s.skills.cooking) < m.level ? m.level : 0;
  const secs = activitySeconds(ACTIONS[cookActionId(m.id)], item);
  const uses = Object.entries(m.uses)
    .map(([id, n]) => {
      const have = k.pantry[id] ?? 0;
      const d = INGREDIENT_BY_ID[id];
      // "2 slices bread", but just "2 eggs" (not "2 eggs eggs").
      const name = d.unit.some((u) => u === d.name.toLowerCase() || u === d.name.toLowerCase().replace(/s$/, '')) ? '' : ` ${esc(d.name.toLowerCase())}`;
      return `<span class="k-use${have >= n ? '' : ' short'}">${d.emoji} ${units(id, n)}${name} <small>(have ${have})</small></span>`;
    })
    .join('');
  const can = !missing.length && !lockLvl;
  return `<div class="k-meal${can ? '' : ' off'}">
    <div class="k-meal-head"><span class="k-emoji">${m.emoji}</span><div class="grow"><b>${esc(m.name)}</b><small>⏱ ${secs}s · 🍽 ${m.portions} portion${m.portions === 1 ? '' : 's'} · +${m.hunger} hunger each${m.fun ? `, +${m.fun} fun` : ''}</small></div></div>
    <div class="k-uses">${uses}</div>
    ${lockLvl
      ? `<button class="btn block" disabled>🔒 Needs Cooking ${lockLvl} (you’re ${Math.floor(s.skills.cooking)})</button>`
      : missing.length
        ? `<button class="btn block" data-act="order">Missing ${missing.map((x) => esc(INGREDIENT_BY_ID[x.id].name.toLowerCase())).join(', ')} · order on InstaDash</button>`
        : `<button class="btn primary block" data-act="cook:${m.id}">Cook it</button>`}
  </div>`;
}

export function openStove(s: GameState, title: string, emoji: string, item: string, quality: Quality, hooks: StoveHooks): void {
  const sheet = openSheet({
    emoji,
    title,
    sub: `${FURNITURE_QUALITY[quality].label} kitchen · Cooking ${Math.floor(s.skills.cooking)}`,
    className: 'kitchen-sheet',
    body: `<p class="blurb">Cooking uses ingredients from your fridge. Extra portions go back in the fridge for later.</p>${MEALS.map((m) => mealCard(s, m, item)).join('')}`,
  });
  onAct(sheet.body, (act) => {
    sheet.close();
    if (act === 'order') return hooks.order();
    if (act.startsWith('cook:')) hooks.cook(act.slice(5));
  });
}
