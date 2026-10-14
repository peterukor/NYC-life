// =====================================================================
// minigames.ts — little games you play instead of skipping a shift.
//
// THE PLUG-IN INTERFACE: a mini-game is an entry in MINIGAMES with
//   careers  which jobs it's for
//   run(host, done)  draw itself inside `host` (a plain HTML element),
//                    and call done(score) once, with a score from 0 to 1.
//                    Return a cleanup function.
// Work uses the score for performance and pay (sim/work.ts). Leaderboards
// and multiplayer can hook in here later.
//
// Included: ORDER RUSH — a customer wants something, tap the right item
// before time runs out. Each job has its own items (coffee drinks for
// baristas, deli orders for the bodega, cocktails for bartenders…).
// =====================================================================

import { Registry } from '../core/registry.ts';

export interface MinigameDef {
  id: string;
  name: string;
  emoji: string;
  careers: string[];
  howTo: string;
  run: (host: HTMLElement, done: (score: number) => void) => () => void;
}

export const MINIGAMES = new Registry<MinigameDef>('mini-game');

/** Order Rush factory: `items` are [emoji, name] pairs for that job. */
function orderRush(id: string, name: string, emoji: string, careers: string[], items: [string, string][], who: string): MinigameDef {
  return {
    id,
    name,
    emoji,
    careers,
    howTo: `${who} call out orders. Tap the matching item, fast. 8 orders, 20 seconds.`,
    run(host, done) {
      const ORDERS = 8;
      const TIME = 20;
      let n = 0;
      let right = 0;
      let left = TIME;
      let finished = false;
      let want = items[0];
      host.innerHTML = `<div class="mg"><div class="mg-top"><span class="mg-timer"></span><span class="mg-score"></span></div><div class="mg-order"></div><div class="mg-grid"></div></div>`;
      const timerEl = host.querySelector<HTMLElement>('.mg-timer')!;
      const scoreEl = host.querySelector<HTMLElement>('.mg-score')!;
      const orderEl = host.querySelector<HTMLElement>('.mg-order')!;
      const grid = host.querySelector<HTMLElement>('.mg-grid')!;
      const next = () => {
        if (n >= ORDERS) return finish();
        want = items[Math.floor(Math.random() * items.length)];
        const options = [want, ...items.filter((x) => x !== want).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
        orderEl.innerHTML = `<span class="mg-bubble">“One ${want[1]}, please!”</span>`;
        grid.innerHTML = options.map((o) => `<button class="mg-item" data-pick="${o[1]}"><span>${o[0]}</span>${o[1]}</button>`).join('');
        scoreEl.textContent = `${right}/${ORDERS}`;
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearInterval(tick);
        const timeBonus = Math.max(0, left) / TIME;
        done(Math.min(1, right / ORDERS * 0.85 + timeBonus * 0.15));
      };
      grid.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]');
        if (!b || finished) return;
        const ok = b.dataset.pick === want[1];
        if (ok) right++;
        b.classList.add(ok ? 'ok' : 'no');
        n++;
        window.setTimeout(next, 180);
      });
      const tick = window.setInterval(() => {
        left -= 0.1;
        timerEl.textContent = `⏱ ${Math.max(0, left).toFixed(1)}s`;
        timerEl.style.color = left < 5 ? '#e0283f' : '';
        if (left <= 0) finish();
      }, 100);
      next();
      return () => window.clearInterval(tick);
    },
  };
}

MINIGAMES.add(
  orderRush('bodegaRush', 'Deli Line', '🥪', ['deli'], [['🥪', 'chopped cheese'], ['🥯', 'bacon egg & cheese'], ['🧃', 'juice'], ['🍌', 'banana'], ['🥤', 'soda'], ['🍫', 'candy bar']], 'Customers'),
  orderRush('barRush', 'Last Call', '🍸', ['bartender'], [['🍸', 'martini'], ['🍺', 'beer'], ['🍷', 'red wine'], ['🍹', 'mai tai'], ['🥃', 'whiskey'], ['🥂', 'champagne']], 'Thirsty guests'),
  orderRush('tradeRush', 'Trading Floor', '📈', ['finance'], [['📈', 'buy order'], ['📉', 'sell order'], ['💵', 'cash'], ['🪙', 'gold'], ['🏦', 'bond'], ['📊', 'report']], 'Clients'),
  orderRush('bugRush', 'Bug Bash', '🐛', ['tech'], [['🐛', 'bug fix'], ['🚀', 'deploy'], ['🔧', 'config'], ['✅', 'test'], ['🔒', 'security patch'], ['📦', 'package']], 'Your team lead'),
  orderRush('gymRush', 'Class Time', '🏋️', ['trainer'], [['🏋️', 'deadlift'], ['🚴', 'spin'], ['🧘', 'yoga'], ['🏃', 'sprints'], ['🤸', 'stretch'], ['🥊', 'boxing']], 'Clients'),
  orderRush('showRush', 'Showtime', '🌙', ['dancer'], [['💃', 'spin'], ['🕺', 'body roll'], ['🌀', 'twirl'], ['✨', 'pose'], ['🎶', 'on the beat'], ['🔥', 'big finish']], 'The crowd'),
  // Every product here is made up (Peter: five fictional products).
  orderRush('alleyRush', 'Corner Rush', '💊', ['pharmacist'], [['🍬', 'Sugar Comets'], ['🌙', 'Moon Mints'], ['🔮', 'Purple Marbles'], ['⚡', 'Zap Pops'], ['🧪', 'Lab Fizz'], ['💵', 'make change']], 'Customers'),
  orderRush('dispatchRush', 'Dispatch', '🚓', ['cop'], [['🚗', 'traffic stop'], ['🏃', 'foot chase'], ['📢', 'noise complaint'], ['🛍️', 'shoplifter'], ['🚑', 'medical call'], ['🐕', 'loose dog']], 'Dispatch'),
);

/** Careers whose shift is its own full game (ui/deli-shift.ts), not a mini-game. */
export const PLAYABLE_SHIFTS = new Set(['deli']);

export function minigameFor(careerId: string): MinigameDef | undefined {
  return MINIGAMES.where((m) => m.careers.includes(careerId))[0];
}
