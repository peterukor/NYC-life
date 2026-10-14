// =====================================================================
// store.ts — clothing stores. Each store sells certain tiers (a thrift
// shop sells plain basics; the Fifth Avenue boutique sells premium and
// exclusive). Shows what you don't own yet; buy it, and wear it now if
// you like. Money moves through economy.ts.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { CLOTHES, tierOf, type ClothingItem, type Slot } from '../data/wardrobe.ts';
import type { PlaceDef } from '../data/places.ts';
import { changeMoney } from '../sim/economy.ts';
import type { GameState, Look } from '../sim/types.ts';
import { openSheet, toast } from './dom.ts';

const SLOT_ID: Partial<Record<Slot, keyof Look>> = { top: 'topId', bottom: 'bottomId', shoes: 'shoesId', hat: 'hatId', extra: 'extraId' };
const SLOT_COLOR: Partial<Record<Slot, keyof Look>> = { top: 'top', bottom: 'bottom', shoes: 'shoes', hat: 'hat', extra: 'extra' };

export function openStore(s: GameState, place: PlaceDef, wear: (look: Look) => void, save: () => void): void {
  const sheet = openSheet({ emoji: place.emoji, title: place.name, sub: `Sells ${(place.sells ?? []).join(' & ')} · you have ${money(s.money)}`, body: '<div class="store"></div>' });
  const host = sheet.body.querySelector<HTMLElement>('.store')!;
  const render = () => {
    const items = CLOTHES.where((c) => c.slot !== 'hair' && (place.sells ?? []).includes(tierOf(c)) && !s.wardrobe.includes(c.id)).sort((a, b) => a.price - b.price);
    host.innerHTML = items.length
      ? `<div class="closet-grid">${items.map((c: ClothingItem) => `<button class="closet-item" data-buy="${c.id}"><span class="ico">${c.emoji}</span><span class="nm">${esc(c.name)}</span><span class="nm"><b>${money(c.price)}</b></span><span class="tier tier-${tierOf(c)}">${tierOf(c)}</span></button>`).join('')}</div>`
      : '<p class="blurb">You own everything this store sells. Stylish.</p>';
  };
  host.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-buy]')?.dataset.buy;
    const item = CLOTHES.get(id);
    if (!item) return;
    if (s.money < item.price) return toast('Not enough cash on you', { icon: '💸', tone: 'bad' });
    const r = changeMoney(s, -item.price, `Bought: ${item.name}`);
    if (!r.ok) return toast(r.why, { tone: 'bad' });
    s.wardrobe.push(item.id);
    // Wear it straight away (that's the fun part).
    const look = s.profile.look as unknown as Record<string, unknown>;
    const idKey = SLOT_ID[item.slot];
    const colKey = SLOT_COLOR[item.slot];
    if (idKey) look[idKey] = item.id;
    if (colKey && item.colors.length) look[colKey] = item.colors[0];
    wear(s.profile.look);
    save();
    toast(`Bought and wearing: ${item.name}`, { icon: item.emoji, tone: 'good' });
    render();
  });
  render();
}
