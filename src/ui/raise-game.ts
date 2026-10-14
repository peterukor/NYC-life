// =====================================================================
// raise-game.ts — the "ask for a raise" mini-game screen.
//
// A tall bar with a green zone that wanders. Hold anywhere (or the space
// bar) to lift your line; let go and it sinks. Keep it in the green to
// fill the meter before the timer runs out. Rules: sim/raise.ts.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { RAISE_SECONDS, inZone, newRaiseGame, stepRaiseGame } from '../sim/raise.ts';
import { html, root } from './dom.ts';

export interface RaiseInfo {
  /** Raise number (1–5). */
  raise: number;
  boss: string;
  from: { title: string; pay: number };
  to: { title: string; pay: number };
}

/** Ask first: go for it now, or later. */
export function offerRaise(info: RaiseInfo): Promise<boolean> {
  return new Promise((resolve) => {
    const el = html(`<div class="modal-wrap"><div class="modal raise-offer" role="dialog" aria-modal="true" aria-label="Ask for a raise">
      <div class="big">📈</div><h2>Ask for a raise?</h2>
      <p>${esc(info.boss)} has a minute. You’ve earned a shot at <b>${esc(info.to.title)}</b>: ${money(info.from.pay)} → <b>${money(info.to.pay)}</b> a shift.</p>
      <p class="sub">Raise ${info.raise} of 5 · ${['easy', 'fair', 'tricky', 'hard', 'really hard'][info.raise - 1]}. Hold to keep the line in the green.</p>
      <div class="choices"><button class="choice" data-act="go">💼 <span>Ask now</span></button><button class="choice" data-act="later">⏳ <span>Not today</span></button></div>
    </div></div>`);
    root().appendChild(el);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      el.remove();
      resolve(b.dataset.act === 'go');
    });
  });
}

/** Play it. Resolves true if you won. */
export function playRaiseGame(info: RaiseInfo): Promise<boolean> {
  return new Promise((resolve) => {
    const g = newRaiseGame(info.raise);
    const el = html(`<div class="raise-game" role="application" aria-label="Raise mini-game: hold to lift the line, keep it in the green">
      <div class="rg-head"><b>📈 ${esc(info.to.title)}</b><span class="rg-time">${RAISE_SECONDS}s</span></div>
      <div class="rg-body">
        <div class="rg-bar"><div class="rg-zone"></div><div class="rg-line"></div></div>
        <div class="rg-meter"><div class="rg-fill"></div></div>
      </div>
      <p class="rg-hint">Hold anywhere to lift the line. Keep it in the green.</p>
    </div>`);
    root().appendChild(el);
    const zone = el.querySelector<HTMLElement>('.rg-zone')!;
    const line = el.querySelector<HTMLElement>('.rg-line')!;
    const fill = el.querySelector<HTMLElement>('.rg-fill')!;
    const time = el.querySelector<HTMLElement>('.rg-time')!;
    const bar = el.querySelector<HTMLElement>('.rg-bar')!;
    let holding = false;
    const down = (e: Event) => { e.preventDefault(); holding = true; };
    const up = () => { holding = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    const key = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); holding = e.type === 'keydown'; } };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    let last = performance.now();
    const frame = (now: number) => {
      // Small fixed steps, so a slow phone plays the same game.
      let dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      while (dt > 0 && !g.done) {
        const step = Math.min(dt, 1 / 60);
        stepRaiseGame(g, step, holding);
        dt -= step;
      }
      zone.style.height = `${g.d.zone * 100}%`;
      zone.style.bottom = `${(g.zoneY - g.d.zone / 2) * 100}%`;
      line.style.bottom = `calc(${g.y * 100}% - 3px)`;
      bar.classList.toggle('in', inZone(g));
      fill.style.height = `${g.meter * 100}%`;
      time.textContent = `${Math.max(0, Math.ceil(g.time))}s`;
      if (!g.done) return void requestAnimationFrame(frame);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
      window.setTimeout(() => {
        el.remove();
        resolve(g.done === 'won');
      }, 500);
    };
    requestAnimationFrame(frame);
  });
}
