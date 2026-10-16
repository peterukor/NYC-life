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
import { burstAt, popAt, shakeEl } from './juice.ts';

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
      <p>${esc(info.boss)} has a minute. You’ve earned a shot at <b>${esc(info.to.title)}</b>: top shift pay ${money(info.from.pay)} → <b>${money(info.to.pay)}</b>.</p>
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
      <div class="rg-boss"><span class="rg-face">😐</span><em class="rg-says">“So. You wanted to talk?”</em></div>
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
    const face = el.querySelector<HTMLElement>('.rg-face')!;
    const says = el.querySelector<HTMLElement>('.rg-says')!;
    const BOSS_OK = ['“Go on…”', '“Okay, I’m listening.”', '“Huh. Fair point.”', '“That’s… actually true.”'];
    const BOSS_NO = ['“Times are tough, you know.”', '“Have you tried passion instead of money?”', '“We’re a family here.”', '“Let’s circle back.”', '“The budget is… complicated.”'];
    const YOU = ['I closed three deals!', 'I trained the new guy.', 'I never call out.', 'I fixed the printer. Twice.', 'Customers ask for me by name.', 'I know where the good stapler is.'];
    let lastLine = 0, lastPoint = 0, wasIn = false;
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
      const inside = inZone(g);
      bar.classList.toggle('in', inside);
      fill.style.height = `${g.meter * 100}%`;
      // The boss reacts to how it's going.
      face.textContent = g.meter > 0.75 ? '😃' : g.meter > 0.45 ? '🙂' : inside ? '🤔' : g.meter < 0.15 ? '😠' : '😐';
      if (now - lastLine > 2600 || inside !== wasIn) {
        if (now - lastLine > 900) {
          says.textContent = (inside ? BOSS_OK : BOSS_NO)[Math.floor(Math.random() * (inside ? BOSS_OK : BOSS_NO).length)];
          lastLine = now;
        }
        wasIn = inside;
      }
      // Your talking points pop up while you're making your case.
      if (inside && now - lastPoint > 1500) {
        lastPoint = now;
        popAt(bar, YOU[Math.floor(Math.random() * YOU.length)], { color: '#fff', size: 16, y: 30 });
      }
      time.textContent = `${Math.max(0, Math.ceil(g.time))}s`;
      if (!g.done) return void requestAnimationFrame(frame);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
      const won = g.done === 'won';
      face.textContent = won ? '🤝' : '🙃';
      says.textContent = won ? '“Fine. You earned it. Don’t tell anyone.”' : '“Let’s revisit this next quarter.” (They won’t.)';
      el.classList.add(won ? 'rg-won' : 'rg-lost');
      if (won) burstAt(face, ['💵', '📈', '🎉'], 14);
      else shakeEl(face);
      window.setTimeout(() => {
        el.remove();
        resolve(won);
      }, 1600);
    };
    requestAnimationFrame(frame);
  });
}
