// =====================================================================
// hud.ts — the always-on-screen bits: clock, weather, mood, money,
// where you are, your six needs, the bottom navigation, the "Go to
// work" button and the current goal.
// =====================================================================

import { clockLabel, nycTime } from '../core/clock.ts';
import { esc, money } from '../core/format.ts';
import { computeMood, NEED_INFO } from '../sim/needs.ts';
import { NEED_KEYS, type GameState } from '../sim/types.ts';
import { WEATHER_INFO, weatherFor } from '../sim/weather.ts';
import { NEED_LOW } from '../core/constants.ts';
import { html, root } from './dom.ts';

export interface HudHandlers {
  onNav: (which: 'here' | 'map' | 'phone' | 'leave') => void;
  onMoney: () => void;
  onWork: () => void;
}

export class Hud {
  private el: HTMLElement;
  private last = '';

  constructor(private h: HudHandlers) {
    this.el = html(`
      <div class="hud">
        <div class="hud-top">
          <div class="chip" data-clock></div>
          <div class="chip" data-mood></div>
          <button class="chip money" data-money aria-label="Money"></button>
        </div>
        <div class="where" data-where></div>
        <div class="goal" data-goal hidden></div>
        <div class="needs" data-needs aria-label="Needs"></div>
        <button class="fab-work" data-work hidden>💼 <span>Go to work</span></button>
        <nav class="nav" aria-label="Main">
          <button data-nav="here"><span class="ico">📍</span>Here</button>
          <button data-nav="map"><span class="ico">🗺️</span>Map</button>
          <button data-nav="phone"><span class="ico">📱</span>Phone</button>
          <button data-nav="leave" hidden><span class="ico">🚪</span>Leave</button>
        </nav>
      </div>`);
    root().appendChild(this.el);
    this.el.querySelectorAll<HTMLElement>('[data-nav]').forEach((b) => b.addEventListener('click', () => this.h.onNav(b.dataset.nav as 'here' | 'map' | 'phone' | 'leave')));
    this.el.querySelector('[data-money]')!.addEventListener('click', () => this.h.onMoney());
    this.el.querySelector('[data-work]')!.addEventListener('click', () => this.h.onWork());
    // The HUD wrapper itself must not block taps on the 3D city.
    this.el.style.pointerEvents = 'none';
    this.el.querySelectorAll<HTMLElement>('.hud-top > *, .needs, .nav, .fab-work').forEach((x) => (x.style.pointerEvents = 'auto'));
  }

  update(s: GameState, where: string, opts: { inside: boolean; canWork: boolean; workLabel: string; goal: { title: string; hint: string } | null }): void {
    const t = nycTime();
    const w = WEATHER_INFO[weatherFor(t.dateKey, t.hour)];
    const mood = computeMood(s);
    const key = [clockLabel(t), w.emoji, mood.label, s.money, where, opts.inside, opts.canWork, opts.workLabel, opts.goal?.title, NEED_KEYS.map((k) => Math.round(s.needs[k])).join(',')].join('|');
    if (key === this.last) return; // nothing changed: skip touching the page (saves battery)
    this.last = key;

    this.el.querySelector('[data-clock]')!.innerHTML = `${t.hour >= 19 || t.hour < 6 ? '🌙' : w.emoji} ${clockLabel(t)}`;
    const moodEl = this.el.querySelector<HTMLElement>('[data-mood]')!;
    moodEl.innerHTML = `${mood.emoji} <span class="muted">${mood.label}</span>`;
    moodEl.className = `chip ${mood.tone === 'good' ? 'mood-good' : mood.tone === 'bad' ? 'mood-bad' : ''}`;
    this.el.querySelector('[data-money]')!.innerHTML = `${money(s.money)} <span class="plus" aria-hidden="true">+</span>`;
    this.el.querySelector('[data-where]')!.innerHTML = where;
    this.el.querySelector('[data-needs]')!.innerHTML = NEED_KEYS.map((k) => {
      const v = Math.round(s.needs[k]);
      const col = v < NEED_LOW ? '#ff453a' : NEED_INFO[k].color;
      return `<div class="need ${v < NEED_LOW ? 'low' : ''}" title="${NEED_INFO[k].label} ${v}%" aria-label="${NEED_INFO[k].label} ${v} percent"><span aria-hidden="true">${NEED_INFO[k].emoji}</span><span class="bar"><i style="width:${v}%;background:${col}"></i></span></div>`;
    }).join('');
    const work = this.el.querySelector<HTMLElement>('[data-work]')!;
    work.hidden = !opts.canWork;
    work.querySelector('span')!.textContent = opts.workLabel;
    (this.el.querySelector('[data-nav="leave"]') as HTMLElement).hidden = !opts.inside;
    (this.el.querySelector('[data-nav="here"]') as HTMLElement).hidden = opts.inside;
    const goal = this.el.querySelector<HTMLElement>('[data-goal]')!;
    goal.hidden = !opts.goal;
    if (opts.goal) goal.innerHTML = `<b>🎯 ${esc(opts.goal.title)}</b><span>${esc(opts.goal.hint)}</span>`;
  }

  setVisible(v: boolean): void {
    this.el.hidden = !v;
  }
}
