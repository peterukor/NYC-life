// =====================================================================
// furniture-shop.ts — Lexington Home Goods: the furniture catalog.
//
// Every piece shows its price, quality and what it does for you, next to
// what you have now ("Sleep: +70 energy in 18 s · yours: +60 in 23 s"),
// so an upgrade is easy to judge before you buy. Your cash is shown at
// the top. Buy is greyed out when you can't afford it, and locks while a
// purchase goes through. Bought pieces are delivered to Storage at home.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { FURNITURE, FURNITURE_QUALITY, SHOP_ITEMS, qualityLine, type FurnitureDef } from '../data/furniture.ts';
import { NEED_INFO } from '../sim/needs.ts';
import { bestOwned, mainUse } from '../sim/shop.ts';
import type { GameState } from '../sim/types.ts';
import { openSheet } from './dom.ts';

const GROUPS: { label: string; kinds: FurnitureDef['kind'][] }[] = [
  { label: 'Beds', kinds: ['bed'] },
  { label: 'Couches & chairs', kinds: ['couch', 'chair'] },
  { label: 'TVs', kinds: ['tv'] },
  { label: 'Make it yours', kinds: ['lamp', 'rug', 'plant', 'shelf'] },
];

export interface ShopHooks {
  /** Buy one; returns why not, or null when it's in Storage. */
  buy: (item: string) => string | null;
}

/** The benefit line for a piece, compared with your best of the same kind. */
function benefit(s: GameState, def: FurnitureDef): string {
  const use = mainUse(def);
  if (!use) return '';
  const info = NEED_INFO[use.need];
  const mine = bestOwned(s, def.kind);
  const mineUse = mine && mine.id !== def.id ? mainUse(mine) : null;
  const better = mineUse ? use.amount - mineUse.amount : 0;
  return `<div class="shop-benefit">${info.emoji} ${esc(use.label)}: <b>+${use.amount} ${info.label.toLowerCase()}</b> in ${use.seconds}s${
    mineUse ? `<br><small>Yours (${esc(mine!.name)}): +${mineUse.amount} in ${mineUse.seconds}s${better > 0 ? ` · <b class="up">▲ ${better} more</b>` : better < 0 ? ' · yours is better' : ''}</small>` : ''
  }</div>`;
}

export function openFurnitureShop(state: GameState, hooks: ShopHooks, focus?: string): void {
  const sheet = openSheet({ emoji: '🛋️', title: 'Lexington Home Goods', sub: 'Delivered to your Storage, same day', body: '<div class="shop"></div>' });
  const host = sheet.body.querySelector<HTMLElement>('.shop')!;
  const bought = new Set<string>();

  const card = (def: FurnitureDef) => {
    const q = def.quality ?? 'basic';
    const afford = state.money >= def.price;
    return `<div class="shop-item${def.id === focus ? ' focus' : ''}" data-item="${def.id}">
      <div class="shop-head"><span class="shop-emoji">${def.emoji}</span><div class="grow"><b>${esc(def.name)}</b><span class="q-badge q-${q}">${FURNITURE_QUALITY[q].label}</span><small>${esc(qualityLine(q))}</small></div><span class="shop-price">${money(def.price)}</span></div>
      ${def.pitch ? `<p class="shop-pitch">${esc(def.pitch)}</p>` : ''}
      ${benefit(state, def)}
      <button class="btn${afford ? ' primary' : ''} block shop-buy" data-buy="${def.id}" ${afford ? '' : 'disabled'}>${bought.has(def.id) ? '✓ In your Storage · buy another' : afford ? `Buy for ${money(def.price)}` : `Need ${money(def.price - state.money)} more`}</button>
    </div>`;
  };

  const render = () => {
    const items = SHOP_ITEMS.map((id) => FURNITURE.get(id)).filter((d): d is FurnitureDef => !!d);
    host.innerHTML = `<div class="shop-cash">💵 Your cash: <b>${money(state.money)}</b></div>` +
      GROUPS.map((g) => {
        const list = items.filter((d) => g.kinds.includes(d.kind));
        return list.length ? `<h3 class="shop-group">${g.label}</h3>${list.map(card).join('')}` : '';
      }).join('');
  };

  host.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-buy]');
    if (!b || b.disabled) return;
    // Lock straight away: a double-tap can't buy twice.
    b.disabled = true;
    const id = b.dataset.buy!;
    const why = hooks.buy(id);
    if (!why) bought.add(id);
    render();
    // A moment before "buy another" works, so a double-tap buys one.
    const fresh = host.querySelector<HTMLButtonElement>(`[data-item="${id}"] .shop-buy`);
    if (fresh && !why) {
      fresh.disabled = true;
      window.setTimeout(() => (fresh.disabled = state.money < (FURNITURE.get(id)?.price ?? Infinity)), 1200);
    }
    if (why) {
      const again = host.querySelector<HTMLElement>(`[data-item="${id}"] .shop-buy`);
      if (again) again.textContent = why;
    }
  });
  render();
  if (focus) host.querySelector(`[data-item="${focus}"]`)?.scrollIntoView({ block: 'center' });
}
