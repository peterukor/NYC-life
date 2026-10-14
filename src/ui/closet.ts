// =====================================================================
// closet.ts — change clothes at home, in front of the mirror.
//
// Shows the clothes you OWN (state.wardrobe), one tab per slot (tops,
// bottoms, shoes, hats, extras, hair), plus an Outfits tab with 4 saved
// looks. Tap an item to wear it, tap a colour swatch to recolour it.
// Items are sorted plain → premium → exclusive and show their tier.
// Changes apply to your character straight away; at home the camera
// swings round like a mirror (game.ts → openClosetMirror) and the sheet
// only covers the bottom half, so you see yourself while you dress.
// Items you don't own yet are counted ("12 more in stores") so there's
// always something to want.
// =====================================================================

import { esc } from '../core/format.ts';
import { CLOTHES, outfitDefaults, tierOf, type ClothingItem, type Slot, type Tier } from '../data/wardrobe.ts';
import type { GameState, Look } from '../sim/types.ts';
import { openSheet } from './dom.ts';

type Tab = Slot | 'outfits';

const TABS: { tab: Tab; label: string }[] = [
  { tab: 'top', label: 'Tops' },
  { tab: 'bottom', label: 'Bottoms' },
  { tab: 'shoes', label: 'Shoes' },
  { tab: 'hat', label: 'Hats' },
  { tab: 'extra', label: 'Extras' },
  { tab: 'hair', label: 'Hair' },
  { tab: 'outfits', label: '★ Outfits' },
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
const TIER_ORDER: Record<Tier, number> = { plain: 0, premium: 1, exclusive: 2 };
const OUTFIT_SLOTS = 4;

export interface ClosetHooks {
  /** Wear this look (and save the game). */
  apply: (look: Look) => void;
  /** Turn the character a quarter round in the mirror (only at home). */
  turn?: () => void;
  /** Move the rack/closet itself (closes the closet first). */
  move?: () => void;
  onClose?: () => void;
}

/** The pieces of a look, as emojis (for the saved-outfit cards). */
function outfitEmojis(l: Look): string {
  return (['topId', 'bottomId', 'shoesId', 'hatId', 'extraId'] as const)
    .map((k) => CLOTHES.get(l[k] as string | undefined)?.emoji)
    .filter(Boolean)
    .join('');
}

/** The colours of a look's top/bottom/shoes, as a little striped swatch. */
function outfitSwatch(l: Look): string {
  const cols = [l.top, l.bottom, l.shoes ?? '#f2f2f2'];
  return `<span class="outfit-sw">${cols.map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</span>`;
}

export function openCloset(state: GameState, hooks: ClosetHooks | ((look: Look) => void)): void {
  const h: ClosetHooks = typeof hooks === 'function' ? { apply: hooks } : hooks;
  let tab: Tab = 'top';
  const look = state.profile.look;
  const outfits = (state.outfits ??= Array(OUTFIT_SLOTS).fill(null));
  while (outfits.length < OUTFIT_SLOTS) outfits.push(null);
  const sheet = openSheet({
    emoji: '🪞',
    title: 'Closet',
    sub: 'Tap to wear · tap a colour to recolour',
    body: '<div class="closet"></div>',
    className: h.turn ? 'closet-sheet' : undefined,
    onClose: h.onClose,
  });
  const host = sheet.body.querySelector<HTMLElement>('.closet')!;

  const itemsTab = (slot: Slot) => {
    const f = FIELDS[slot];
    const owned = CLOTHES.where((c) => c.slot === slot && state.wardrobe.includes(c.id))
      .sort((a, b) => (slot === 'hair' ? 0 : TIER_ORDER[tierOf(a)] - TIER_ORDER[tierOf(b)] || a.price - b.price));
    const missing = CLOTHES.where((c) => c.slot === slot).length - owned.length;
    // Older looks may not name every item: fall back to the starter outfit.
    const defaults = outfitDefaults(look.body) as Record<string, string>;
    const wearing = (look[f.id] as string | undefined) ?? defaults[f.id as string];
    const current = CLOTHES.get(wearing);
    const colors = slot === 'hair' ? HAIR_COLORS : current?.colors ?? [];
    const canRemove = slot === 'hat' || slot === 'extra';
    const nowCol = look[f.color] as string | undefined;
    return `
      <div class="closet-grid">
        ${canRemove ? `<button class="closet-item${!wearing ? ' on' : ''}" data-wear=""><span class="ico">🚫</span><span class="nm">None</span></button>` : ''}
        ${owned.map((c: ClothingItem) => {
          const on = c.id === wearing;
          const dot = on && nowCol && slot !== 'hair' ? `<span class="dot" style="background:${esc(nowCol)}"></span>` : '';
          return `<button class="closet-item${on ? ' on' : ''}" data-wear="${c.id}">${dot}<span class="ico">${c.emoji}</span><span class="nm">${esc(c.name)}</span>${c.slot === 'hair' ? '' : `<span class="tier tier-${tierOf(c)}">${tierOf(c)}</span>`}</button>`;
        }).join('')}
      </div>
      ${colors.length > 1 && (wearing || slot === 'hair') ? `<div class="closet-colors">${colors.map((col) => `<button class="sw${nowCol === col ? ' on' : ''}" data-color="${col}" style="background:${col}" aria-label="Colour ${col}"></button>`).join('')}</div>` : ''}
      ${missing > 0 ? `<p class="blurb closet-more">${missing} more ${TABS.find((t) => t.tab === slot)!.label.toLowerCase()} to find in stores around the city.</p>` : ''}`;
  };

  const outfitsTab = () => `
    <p class="blurb">Save what you're wearing, then switch looks in one tap.</p>
    <div class="outfit-grid">
      ${outfits.map((o, i) => o
        ? `<div class="outfit-card">
            <button class="outfit-wear" data-outfit="${i}">${outfitSwatch(o)}<span class="ico">${outfitEmojis(o) || '👕'}</span><span class="nm">Outfit ${i + 1}</span></button>
            <div class="outfit-acts"><button data-save="${i}">Save over</button><button data-clear="${i}" aria-label="Delete outfit ${i + 1}">✕</button></div>
          </div>`
        : `<button class="outfit-card empty" data-save="${i}"><span class="ico">＋</span><span class="nm">Save current look</span></button>`).join('')}
    </div>`;

  const render = () => {
    host.innerHTML = `
      <div class="closet-tabs" role="tablist">${TABS.map((t) => `<button role="tab" aria-selected="${t.tab === tab}" data-tab="${t.tab}">${t.label}</button>`).join('')}</div>
      ${tab === 'outfits' ? outfitsTab() : itemsTab(tab)}
      ${h.turn ? '<button class="closet-turn" data-turn="1">↻ Turn around</button>' : ''}
      ${h.move ? '<button class="closet-turn" data-move="1">✋ Move the rack</button>' : ''}`;
  };

  /** Only wear saved pieces you still own (hair is always yours). */
  const wearOutfit = (o: Look) => {
    for (const slot of Object.keys(FIELDS) as Slot[]) {
      const f = FIELDS[slot];
      const id = o[f.id] as string | undefined;
      if (id && !state.wardrobe.includes(id)) continue;
      (look as unknown as Record<string, unknown>)[f.id] = id;
      if (o[f.color] !== undefined) (look as unknown as Record<string, unknown>)[f.color] = o[f.color];
    }
    if (o.topInner) look.topInner = o.topInner;
    h.apply(look);
  };

  host.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-wear],[data-color],[data-turn],[data-move],[data-outfit],[data-save],[data-clear]');
    if (!el) return;
    const d = el.dataset;
    if (d.tab) tab = d.tab as Tab;
    else if (d.turn) return h.turn?.();
    else if (d.move) {
      sheet.close();
      return h.move?.();
    }
    else if (d.outfit !== undefined) wearOutfit(outfits[+d.outfit]!);
    else if (d.save !== undefined) {
      outfits[+d.save] = { ...look };
      h.apply(look); // saves the game
    } else if (d.clear !== undefined) {
      outfits[+d.clear] = null;
      h.apply(look);
    } else if (tab !== 'outfits' && d.wear !== undefined) {
      const f = FIELDS[tab];
      const id = d.wear || undefined;
      (look as unknown as Record<string, unknown>)[f.id] = id;
      const item = CLOTHES.get(id);
      // Wearing a new item: give it its first suggested colour unless the current one suits it.
      if (item && item.colors.length && !item.colors.includes(look[f.color] as string)) (look as unknown as Record<string, unknown>)[f.color] = item.colors[0];
      h.apply(look);
    } else if (tab !== 'outfits' && d.color) {
      (look as unknown as Record<string, unknown>)[FIELDS[tab].color] = d.color;
      h.apply(look);
    }
    render();
  });
  render();
}
