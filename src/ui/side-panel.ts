// =====================================================================
// side-panel.ts — the hamburger (☰) menu that slides in from the left.
//
// TOP: "HAPPENING NOW" — a short, calm list of what's going on right
// now: today's sales, events near you, and the newest headlines (the
// very newest gets a BREAKING tag). Tap one to go there / read it.
// BELOW: shortcuts (all news, map, bank, settings, help).
//
// Both lists are plug-in data: add a button to PANEL_BUTTONS, or a new
// kind of "happening" by adding a pin source in data/pins.ts (sales,
// events and friends all show up here automatically).
// =====================================================================

import { esc } from '../core/format.ts';
import { nowMs, nycTime } from '../core/clock.ts';
import { Registry } from '../core/registry.ts';
import { PIN_KINDS, PIN_SOURCES } from '../data/pins.ts';
import type { GameState } from '../sim/types.ts';
import { html, root } from './dom.ts';

/** What a panel button can ask the game to do. */
export type PanelAction = { kind: 'phone'; app?: string } | { kind: 'map' } | { kind: 'place'; placeId: string };

export interface PanelButton {
  id: string;
  label: string;
  emoji: string;
  action: PanelAction;
}

export const PANEL_BUTTONS = new Registry<PanelButton>('panel button');
PANEL_BUTTONS.add(
  { id: 'news', label: 'All news', emoji: '📰', action: { kind: 'phone', app: 'news' } },
  { id: 'map', label: 'Map', emoji: '🗺️', action: { kind: 'map' } },
  { id: 'bank', label: 'Bank', emoji: '🏦', action: { kind: 'phone', app: 'bank' } },
  { id: 'jobs', label: 'Jobs', emoji: '💼', action: { kind: 'phone', app: 'jobs' } },
  { id: 'settings', label: 'Settings', emoji: '⚙️', action: { kind: 'phone', app: 'settings' } },
  { id: 'help', label: 'How to play', emoji: '💡', action: { kind: 'phone', app: 'help' } },
);

/** Most "happening now" lines shown at once — keep it calm. */
const MAX_HAPPENING = 5;

export function openSidePanel(state: GameState, run: (a: PanelAction) => void): () => void {
  const t = nycTime();
  // Live things from the pin sources (sales, events, friends…), not home/work/landmarks.
  const live = PIN_SOURCES.all()
    .flatMap((src) => {
      try {
        return src.pins({ area: state.location.area, state, time: t });
      } catch {
        return [];
      }
    })
    .filter((p) => p.kind !== 'home' && p.kind !== 'work' && p.kind !== 'landmark');
  const news = state.news.slice(0, 4);
  const newest = news[0];
  // "Breaking" = posted in the last ~20 real minutes.
  const breaking = newest && nowMs() - newest.at < 20 * 60_000;

  const rows = [
    ...live.map((p) => ({ icon: p.icon, color: PIN_KINDS.get(p.kind)?.color ?? '#ff006e', text: p.label, tag: p.kind === 'sale' ? 'SALE' : 'NOW', act: p.placeId ? `place:${p.placeId}` : '' })),
    ...news.map((n, i) => ({ icon: n.emoji, color: '#e63946', text: n.headline, tag: i === 0 && breaking ? 'BREAKING' : '', act: 'phone:news' })),
  ].slice(0, MAX_HAPPENING);

  const backdrop = html('<div class="backdrop side-backdrop"></div>');
  const el = html(`
    <aside class="side-panel" role="dialog" aria-label="Menu">
      <div class="side-head"><b>${esc(state.profile.name)}</b><button class="close" aria-label="Close menu">✕</button></div>
      <h3 class="happening"><span class="live-dot" aria-hidden="true"></span>HAPPENING NOW</h3>
      <div class="happening-list">
        ${rows.length ? rows.map((r) => `<button class="happening-item" data-go="${r.act}"><span class="hi-ico" style="--c:${r.color}">${r.icon}</span><span class="hi-text">${r.tag ? `<em class="tag tag-${r.tag.toLowerCase()}">${r.tag}</em>` : ''}${esc(r.text)}</span></button>`).join('') : '<p class="blurb">All quiet right now. Check back soon.</p>'}
      </div>
      <nav class="side-buttons">${PANEL_BUTTONS.all().map((b) => `<button data-btn="${b.id}"><span>${b.emoji}</span>${esc(b.label)}</button>`).join('')}</nav>
    </aside>`);
  root().append(backdrop, el);
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    el.classList.add('open');
  });
  const close = () => {
    el.classList.remove('open');
    backdrop.classList.remove('open');
    window.setTimeout(() => {
      el.remove();
      backdrop.remove();
    }, 260);
  };
  backdrop.addEventListener('click', close);
  el.querySelector('.close')!.addEventListener('click', close);
  el.addEventListener('click', (e) => {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-btn]')?.dataset.btn;
    let action: PanelAction | null = null;
    if (go?.startsWith('place:')) action = { kind: 'place', placeId: go.slice(6) };
    else if (go?.startsWith('phone:')) action = { kind: 'phone', app: go.slice(6) };
    else if (btn) action = PANEL_BUTTONS.get(btn)?.action ?? null;
    if (!action) return;
    close();
    window.setTimeout(() => run(action!), 200);
  });
  return close;
}
