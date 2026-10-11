// =====================================================================
// closet.ts — change clothes at home.
//
// Shows the clothes you OWN (state.wardrobe), one tab per slot (tops,
// bottoms, shoes, hats, extras, hair). Tap an item to wear it, tap a
// colour swatch to recolour it. Each item shows its tier (plain,
// premium, exclusive). Changes apply to your character straight away.
// Items you don't own yet are counted ("12 more in stores") so there's
// always something to want.
// =====================================================================

import { esc } from '../core/format.ts';
import { CLOTHES, outfitDefaults, tierOf, type ClothingItem, type Slot } from '../data/wardrobe.ts';
import type { GameState, Look } from '../sim/types.ts';
import { openSheet } from './dom.ts';

const TABS: { slot: Slot; label: string }[] = [
  { slot: 'top', label: 'Tops' },
  { slot: 'bottom', label: 'Bottoms' },
  { slot: 'shoes', label: 'Shoes' },
  { slot: 'hat', label: 'Hats' },
  { slot: 'extra', label: 'Extras' },
  { slot: 'hair', label: 'Hair' },
];

/** Which Look fields hold an item's id and colour, per slot. */
const FIELDS: Record<Slot, { id: keyof Look; color: keyof Look }> = {
  top: { id: 'topId', color: 'top' },
  bottom: { id: 'bottomId', color: 'bottom' },
  shoes: { id: 'shoesId', color: 'shoes' },
  hat: { id: 'hatId', color: 'hat' },
  extra: { id: 'extraId', color: 'extra' },
  hair: { id: 'hairStyle', color: 'hair' },
};

const HAIR_COLORS = ['#1b1b1b', '#3b2416', '#6b4423', '#a0522d', '#d4a017', '#e8d9b5', '#b33a3a', '#6a4c93', '#2a9d8f'];

export function openCloset(state: GameState, apply: (look: Look) => void): void {
  let tab: Slot = 'top';
  const look = state.profile.look;
  const sheet = openSheet({ emoji: '👕', title: 'Closet', sub: 'Tap to wear · tap a colour to recolour', body: '<div class="closet"></div>' });
  const host = sheet.body.querySelector<HTMLElement>('.closet')!;

  const render = () => {
    const f = FIELDS[tab];
    const owned = CLOTHES.where((c) => c.slot === tab && state.wardrobe.includes(c.id));
    const missing = CLOTHES.where((c) => c.slot === tab).length - owned.length;
    // Older looks may not name every item: fall back to the starter outfit.
    const defaults = outfitDefaults(look.body) as Record<string, string>;
    const wearing = (look[f.id] as string | undefined) ?? defaults[f.id as string];
    const current = CLOTHES.get(wearing);
    const colors = tab === 'hair' ? HAIR_COLORS : current?.colors ?? [];
    const canRemove = tab === 'hat' || tab === 'extra';
    host.innerHTML = `
      <div class="closet-tabs" role="tablist">${TABS.map((t) => `<button role="tab" aria-selected="${t.slot === tab}" data-tab="${t.slot}">${t.label}</button>`).join('')}</div>
      <div class="closet-grid">
        ${canRemove ? `<button class="closet-item${!wearing ? ' on' : ''}" data-wear=""><span class="ico">🚫</span><span class="nm">None</span></button>` : ''}
        ${owned.map((c: ClothingItem) => `<button class="closet-item${c.id === wearing ? ' on' : ''}" data-wear="${c.id}"><span class="ico">${c.emoji}</span><span class="nm">${esc(c.name)}</span>${c.slot === 'hair' ? '' : `<span class="tier tier-${tierOf(c)}">${tierOf(c)}</span>`}</button>`).join('')}
      </div>
      ${colors.length > 1 && (wearing || tab === 'hair') ? `<div class="closet-colors">${colors.map((col) => `<button class="sw${look[f.color] === col ? ' on' : ''}" data-color="${col}" style="background:${col}" aria-label="Colour ${col}"></button>`).join('')}</div>` : ''}
      ${missing > 0 ? `<p class="blurb closet-more">${missing} more ${TABS.find((t) => t.slot === tab)!.label.toLowerCase()} to find in stores around the city.</p>` : ''}`;
  };

  host.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-wear],[data-color]');
    if (!el) return;
    const f = FIELDS[tab];
    if (el.dataset.tab) tab = el.dataset.tab as Slot;
    else if (el.dataset.wear !== undefined) {
      const id = el.dataset.wear || undefined;
      (look as unknown as Record<string, unknown>)[f.id] = id;
      const item = CLOTHES.get(id);
      // Wearing a new item: give it its first suggested colour unless the current one suits it.
      if (item && item.colors.length && !item.colors.includes(look[f.color] as string)) (look as unknown as Record<string, unknown>)[f.color] = item.colors[0];
      apply(look);
    } else if (el.dataset.color) {
      (look as unknown as Record<string, unknown>)[f.color] = el.dataset.color;
      apply(look);
    }
    render();
  });
  render();
}
