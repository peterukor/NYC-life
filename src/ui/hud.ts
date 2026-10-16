// =====================================================================
// hud.ts — the always-on-screen bits.
//
// LOOK: "subway signage meets toy box". Everything is a chunky white
// sticker with a dark ink outline, like a cartoon game, but the shapes
// come from New York streets:
//   • your six needs are round subway LINE BULLETS (coloured like real
//     lines) whose outer ring drains as the need drops;
//   • where you are is a pair of green STREET SIGN blades;
//   • your money is a yellow MetroCard.
// =====================================================================

import { clockLabel, nycTime } from '../core/clock.ts';
import { esc, money } from '../core/format.ts';
import { computeMood, NEED_INFO } from '../sim/needs.ts';
import { NEED_KEYS, type GameState } from '../sim/types.ts';
import { WEATHER_INFO, weatherFor } from '../sim/weather.ts';
import { NEED_LOW } from '../core/constants.ts';
import { html, root } from './dom.ts';

export interface HudHandlers {
  onNav: (which: NavKey) => void;
  onMoney: () => void;
  onWork: () => void;
  onMenu: () => void;
  /** 🔊 one-tap mute for all sound. */
  onVolume?: () => void;
  /** Speak loud (ui/people-ui.ts). */
  onSpeak?: () => void;
}

export interface Where {
  area: string;
  /** Inside a place (or on the train): its name. */
  place?: string;
  /** On the street: the two cross streets. */
  streets?: string[];
}

export type NavKey = 'here' | 'map' | 'places' | 'phone' | 'leave' | 'storage';

export class Hud {
  private el: HTMLElement;
  private last = '';

  /** Show 🔇 on the top-bar button when everything is muted. */
  setMuted(muted: boolean): void {
    const b = this.el.querySelector<HTMLElement>('[data-vol]');
    if (!b) return;
    b.textContent = muted ? '🔇' : '🔊';
    b.setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound');
  }

  constructor(private h: HudHandlers) {
    this.el = html(`
      <div class="hud">
        <div class="hud-top">
          <button class="menu-btn" data-menu aria-label="Menu: happening now, news, settings"><i></i></button>
          <div class="clock" data-clock></div>
          <button class="vol-btn" data-vol aria-label="Mute sound">🔊</button>
          <button class="metrocard" data-money aria-label="Money and bank"></button>
        </div>
        <div class="hud-left">
          <div class="mood" data-mood></div>
          <div class="signpost" data-where></div>
        </div>
        <div class="goal" data-goal hidden></div>
        <div class="bullets" data-needs aria-label="Needs"></div>
        <button class="speak-btn" data-speak aria-label="Speak loud">💬</button>
        <button class="work-btn" data-work hidden><span class="work-ico" aria-hidden="true">💼</span><span data-work-label>Go to work</span></button>
        <nav class="dock" aria-label="Main">
          <button data-nav="here"><span class="dock-ico" aria-hidden="true">📍</span><span>Here</span></button>
          <button data-nav="map"><span class="dock-ico" aria-hidden="true">🗺️</span><span>Map</span></button>
          <button data-nav="places"><span class="dock-ico" aria-hidden="true">🏙️</span><span>Places</span></button>
          <button data-nav="phone"><span class="dock-ico" aria-hidden="true">📱</span><span>Phone</span></button>
          <button data-nav="storage" hidden><span class="dock-ico" aria-hidden="true">📦</span><span>Storage</span></button>
          <button data-nav="leave" hidden><span class="dock-ico" aria-hidden="true">🚪</span><span>Go outside</span></button>
        </nav>
      </div>`);
    root().appendChild(this.el);
    this.el.querySelectorAll<HTMLElement>('[data-nav]').forEach((b) => b.addEventListener('click', () => this.h.onNav(b.dataset.nav as NavKey)));
    this.el.querySelector('[data-money]')!.addEventListener('click', () => this.h.onMoney());
    this.el.querySelector('[data-menu]')!.addEventListener('click', () => this.h.onMenu());
    this.el.querySelector('[data-vol]')!.addEventListener('click', () => this.h.onVolume?.());
    this.el.querySelector('[data-work]')!.addEventListener('click', () => this.h.onWork());
    this.el.querySelector('[data-speak]')!.addEventListener('click', () => this.h.onSpeak?.());
    // The HUD wrapper must not block taps on the 3D city; only its controls take touches.
    this.el.style.pointerEvents = 'none';
    this.el.querySelectorAll<HTMLElement>('.metrocard, .bullets, .dock, .work-btn, .speak-btn').forEach((x) => (x.style.pointerEvents = 'auto'));
  }

  update(s: GameState, where: Where, opts: { inside: boolean; atHome?: boolean; canWork: boolean; workLabel: string; goal: { title: string; hint: string } | null }): void {
    const t = nycTime();
    const w = WEATHER_INFO[weatherFor(t.dateKey, t.hour)];
    const mood = computeMood(s);
    const key = [clockLabel(t), w.emoji, mood.label, s.money, JSON.stringify(where), opts.inside, opts.canWork, opts.workLabel, opts.goal?.title, opts.goal?.hint, NEED_KEYS.map((k) => Math.round(s.needs[k])).join(',')].join('|');
    if (key === this.last) return; // nothing changed: skip touching the page (saves battery)
    this.last = key;

    const night = t.hour >= 19 || t.hour < 6;
    this.el.querySelector('[data-clock]')!.innerHTML = `<span class="clock-ico" aria-hidden="true">${night ? '🌙' : w.emoji}</span><span>${clockLabel(t)}</span>`;
    const moodEl = this.el.querySelector<HTMLElement>('[data-mood]')!;
    moodEl.innerHTML = `<span class="mood-face" aria-hidden="true">${mood.emoji}</span><span>${esc(mood.label)}</span>`;
    moodEl.dataset.tone = mood.tone;
    this.el.querySelector('[data-money]')!.innerHTML = `<span class="mc-amount">${money(s.money)}</span><span class="mc-plus" aria-hidden="true">+</span>`;

    // Where you are: green street-sign blades, or a single plate inside.
    const blades = where.streets?.length ? where.streets : [where.place ?? where.area];
    this.el.querySelector('[data-where]')!.innerHTML =
      blades.map((b, i) => `<span class="blade${where.streets ? '' : ' plate'}" style="--tilt:${i % 2 ? 1.2 : -0.8}deg">${esc(b)}</span>`).join('') + `<span class="area">${esc(where.area)}</span>`;

    // Needs as subway line bullets: the coloured ring drains as the need drops.
    this.el.querySelector('[data-needs]')!.innerHTML = NEED_KEYS.map((k) => {
      const v = Math.round(s.needs[k]);
      const low = v < NEED_LOW;
      return `<div class="bullet${low ? ' low' : ''}" style="--c:${NEED_INFO[k].color};--v:${v}" role="img" aria-label="${NEED_INFO[k].label} ${v} percent"><span aria-hidden="true">${NEED_INFO[k].emoji}</span></div>`;
    }).join('');

    const work = this.el.querySelector<HTMLElement>('[data-work]')!;
    work.hidden = !opts.canWork;
    work.querySelector('[data-work-label]')!.textContent = opts.workLabel;
    (this.el.querySelector('[data-nav="leave"]') as HTMLElement).hidden = !opts.inside;
    (this.el.querySelector('[data-nav="storage"]') as HTMLElement).hidden = !opts.atHome;
    (this.el.querySelector('[data-nav="here"]') as HTMLElement).hidden = opts.inside;
    (this.el.querySelector('[data-nav="places"]') as HTMLElement).hidden = opts.inside;
    (this.el.querySelector('[data-speak]') as HTMLElement).hidden = opts.inside;
    const goal = this.el.querySelector<HTMLElement>('[data-goal]')!;
    goal.hidden = !opts.goal;
    if (opts.goal) goal.innerHTML = `<span class="goal-pin" aria-hidden="true">★</span><span><b>${esc(opts.goal.title)}</b>${opts.goal.hint ? `<small>${esc(opts.goal.hint)}</small>` : ''}</span>`;
  }

  setVisible(v: boolean): void {
    this.el.hidden = !v;
  }
}
