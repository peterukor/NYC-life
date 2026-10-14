// =====================================================================
// instadash.ts — InstaDash, the grocery delivery app on your phone.
//
// Pick packs of ingredients (+ / −), see the total with the delivery fee,
// pay with cash. A courier brings the bag to your fridge about
// DELIVERY_SECONDS later, wherever you are (sim/kitchen.ts). Placing the
// order empties the cart at once, so a double tap can't pay twice.
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { esc, money } from '../core/format.ts';
import { DELIVERY_FEE, DELIVERY_SECONDS, INGREDIENTS, MEALS, INGREDIENT_BY_ID } from '../data/groceries.ts';
import { cartTotal, kitchenOf, orderGroceries } from '../sim/kitchen.ts';
import { PHONE_APPS } from './phone-apps.ts';
import { toast } from './dom.ts';

/** The cart: packs of each ingredient (kept while the phone's closed). */
const cart: Record<string, number> = {};

const usedIn = (id: string) => MEALS.filter((m) => m.uses[id]).map((m) => m.emoji).join(' ');

PHONE_APPS.add({
  id: 'instadash',
  label: 'InstaDash',
  icon: '🛵',
  bg: '#ff3d2e',
  needsPhone: true,
  order: 15,
  render: ({ s }) => {
    const k = kitchenOf(s);
    const total = cartTotal(cart);
    const afford = s.money >= total;
    const soonest = k.orders.length ? Math.max(0, Math.ceil((Math.min(...k.orders.map((o) => o.arrivesAt)) - nowMs()) / 1000)) : null;
    return {
      title: '🛵 InstaDash',
      body: `
        <p class="blurb">Groceries to your fridge in about ${DELIVERY_SECONDS} seconds. Delivery ${money(DELIVERY_FEE)}. Cash: <b>${money(s.money)}</b></p>
        ${soonest !== null ? `<div class="card" style="margin-bottom:10px"><b>🛵 Your order is on its way</b><p>About ${soonest}s</p></div>` : ''}
        ${INGREDIENTS.map((i) => {
          const n = cart[i.id] ?? 0;
          const have = k.pantry[i.id] ?? 0;
          return `<div class="list-item dash-item"><span class="k-emoji">${i.emoji}</span><div class="grow"><div class="title">${esc(i.name)} <span class="sub">${money(i.price)}</span></div><div class="sub">${esc(i.pack)} · in your fridge: ${have} ${i.unit[have === 1 ? 0 : 1]} · for ${usedIn(i.id)}</div></div>
            <div class="dash-qty"><button class="btn" data-act="instadash.sub:${i.id}" aria-label="One less ${esc(i.name)}" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button class="btn" data-act="instadash.add:${i.id}" aria-label="One more ${esc(i.name)}">+</button></div></div>`;
        }).join('')}
        <div class="dash-total">${total ? `Groceries ${money(total - DELIVERY_FEE)} + delivery ${money(DELIVERY_FEE)} = <b>${money(total)}</b>` : 'Your cart is empty'}</div>
        <button class="btn ${total && afford ? 'primary' : ''} block" data-act="instadash.order" ${total && afford ? '' : 'disabled'}>${!total ? 'Add something to your cart' : afford ? `Place order · ${money(total)}` : `Need ${money(total - s.money)} more cash`}</button>
        ${total ? '<button class="btn ghost block" style="margin-top:8px" data-act="instadash.clear">Empty the cart</button>' : ''}`,
    };
  },
  act: (act, { s }) => {
    const [verb, id] = act.split(':');
    if (verb === 'add' && INGREDIENT_BY_ID[id]) cart[id] = Math.min(20, (cart[id] ?? 0) + 1);
    else if (verb === 'sub' && cart[id]) cart[id] -= 1;
    else if (verb === 'clear') for (const k of Object.keys(cart)) delete cart[k];
    else if (verb === 'order') {
      const order = { ...cart };
      for (const k of Object.keys(cart)) delete cart[k];
      const r = orderGroceries(s, order);
      if (!r.ok) {
        Object.assign(cart, order);
        toast(r.why, { icon: '🛵', tone: 'bad' });
      } else toast(`Order placed · ${money(r.total)}. Arriving in about ${DELIVERY_SECONDS}s`, { icon: '🛵', tone: 'good', ms: 3500 });
    }
  },
});

/** For QA: what's in the cart. */
export const instaDashCart = cart;
