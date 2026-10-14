// =====================================================================
// deli-shift.ts — playing a shift at the counter (every job has one:
// sim/shift.ts and data/shift-menus.ts hold the menus).
//
// Two ways in (Peter, 2026-10-14): ⏩ auto (done now, lowest pay) or 🎮
// play: about 3 real minutes of customers. Read the order, tap the items
// onto the tray, serve before they give up. Customers get less patient
// as the shift goes on. Three times something comes up and you choose.
// The clock in the corner runs through the 4 game hours. At the bar,
// people order from their tables and a waiter carries each drink over.
//
// This file only plays the shift and reports what happened; paying is
// done once, by the caller, with the shift's id.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { AUTO_SHIFT_SECONDS, ORDER_SECONDS, ORDER_SECONDS_END, SHIFT_PLAY_SECONDS, makeOrder, tipScale, menuFor, orderRight, orderTip, type CounterMenu, type ServedOrder, type ShiftPlay, type Payslip } from '../sim/shift.ts';
import { NEED_INFO } from '../sim/needs.ts';
import type { NeedKey } from '../sim/types.ts';
import { openModal } from './dom.ts';

export interface ShiftIntro {
  place: string;
  title: string;
  /** What auto-pilot pays, and the most a played shift pays (sim/shift.ts → payBand). */
  auto: number;
  max: number;
  startMinute: number;
  hours: number;
  choices: string[];
  /** Whose counter (the career id): picks the menu (sim/shift.ts → COUNTER_MENUS). */
  careerId: string;
  /** Tips multiplier tonight (the bar's late crowd), for the running total. */
  tipMult?: number;
  /** Shifts left today. */
  left?: number;
  /** Shifts you've already played at this job (0 = your first: you get the how-to and hints). */
  played?: number;
}

/** First shifts at a job come with training: needed items lit up for the first orders. */
export const TRAINING_SHIFTS = 2;
const TRAINING_ORDERS = 4;

const ingOf = (menu: CounterMenu, id: string) => menu.ingredients.find((g) => g.id === id);
const chips = (menu: CounterMenu, ids: string[]) => ids.map((id) => `<span class="rc-chip">${ingOf(menu, id)?.emoji ?? '❔'} ${esc(ingOf(menu, id)?.label ?? id)}</span>`).join('');

/** 📖 What goes in each order (the counter's cheat sheet). */
export function recipeBookHtml(menu: CounterMenu): string {
  const rows = menu.dishes
    .map((d) => `<div class="rc-row"><b>${esc(d.name)}</b><div class="rc-items">${chips(menu, d.items)}</div>${d.extras?.length ? `<small>${d.extras.map(([say, id]) => `“${esc(say)}” → +${ingOf(menu, id)?.emoji ?? ''}`).join(' · ')}</small>` : ''}</div>`)
    .join('');
  const side = menu.side ? `<p class="rc-side">Sometimes: “${esc(menu.side[1].replace(/^,\s*/, ''))}” → add ${ingOf(menu, menu.side[2])?.emoji ?? ''} ${esc(ingOf(menu, menu.side[2])?.label ?? '')}</p>` : '';
  return `<div class="rc-book">${rows}</div>${side}`;
}

/** How the counter game works, with a real example from this job. */
export function howToHtml(menu: CounterMenu): string {
  const d = menu.dishes[0];
  return `<ol class="howto">
    <li><b>Read the order.</b> ${esc(menu.ask)} <i>${esc(d.name)}</i>.</li>
    <li><b>Tap what it needs</b> (any order): ${chips(menu, d.items)}</li>
    <li><b>Tap ${esc(menu.serve)}</b> before the bar runs out. Faster = more ${esc((menu.tipWord ?? 'tips').toLowerCase())}. Wrong? <b>Clear</b> and try again.</li>
    <li>Forgot what goes in something? Tap <b>📖</b> during the shift (the clock stops).</li>
  </ol>`;
}

/** The how-to as its own sheet (from the intro). */
function showHowTo(menu: CounterMenu): Promise<void> {
  return new Promise((resolve) => {
    const m = openModal(`<div class="big">${menu.emoji}</div><h2>How the shift works</h2>${howToHtml(menu)}<h3 class="rc-h">📖 Every order</h3>${recipeBookHtml(menu)}<button class="btn primary block" data-act="ok">Got it</button>`);
    m.el.classList.add('howto-modal');
    m.el.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('[data-act]')) return;
      m.close();
      resolve();
    });
  });
}

const clock = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Real seconds a played shift lasts (QA can shorten it with ?shiftsec=N). */
function playSeconds(): number {
  const q = new URLSearchParams(location.search);
  const n = Number(q.get('shiftsec'));
  return q.get('qa') === '1' && n > 0 ? n : SHIFT_PLAY_SECONDS;
}

/** Real seconds an auto shift lasts (QA can shorten it with ?autosec=N). */
export function autoSeconds(): number {
  const q = new URLSearchParams(location.search);
  const n = Number(q.get('autosec'));
  return q.get('qa') === '1' && n > 0 ? n : AUTO_SHIFT_SECONDS;
}

/** Ask: play the shift, or auto-pilot it for the lowest pay. Null = not now. */
export function shiftIntro(info: ShiftIntro): Promise<'play' | 'auto' | null> {
  return new Promise((resolve) => {
    const menu = menuFor(info.careerId);
    const mins = Math.round(playSeconds() / 60);
    const m = openModal(`
      <div class="big">${menu.emoji}</div>
      <h2>${esc(info.title)} at ${esc(info.place)}</h2>
      <p>${clock(info.startMinute)} → ${clock(info.startMinute + info.hours * 60)}${info.left !== undefined ? ` · ${info.left} shift${info.left === 1 ? '' : 's'} left today` : ''}<br>
      <span class="shift-cost">⚡ tiring · 🍔 makes you hungry</span></p>
      ${!info.played ? `<div class="howto-card"><b>🎓 First shift here: how it works</b>${howToHtml(menu)}<small>Your first shifts come with hints: what each order needs lights up.</small></div>` : ''}
      <div class="choices">
        <button class="choice" data-act="play">🎮 <span>Play the shift<span class="hint">${esc(menu.clockIn)} · about ${mins} min · up to <b>${money(info.max)}</b> · 📈 counts toward your raise · builds skill and rep</span></span></button>
        <button class="choice" data-act="auto">⏩ <span>Auto<span class="hint">${autoSeconds()} seconds, stay in the game · ${money(info.auto)} · pay only: no raise progress, skill or rep</span></span></button>
        <button class="choice" data-act="no">↩️ <span>Not now</span></button>
      </div>
      <button class="btn ghost block" data-how>📖 How it works · every order</button>`);
    m.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-how]')) {
        void showHowTo(menu);
        return;
      }
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      m.close();
      resolve(b.dataset.act === 'play' ? 'play' : b.dataset.act === 'auto' ? 'auto' : null);
    });
  });
}

/** Play the counter. Resolves with what happened (orders + choices). */
export function playDeliShift(info: ShiftIntro): Promise<ShiftPlay> {
  const menu: CounterMenu = menuFor(info.careerId);
  const INGREDIENTS = menu.ingredients;
  const TOTAL = playSeconds();
  const scale = tipScale(info);
  const room = info.max - info.auto;
  const tipWord = menu.tipWord ?? 'Tips';
  return new Promise((resolve) => {
    const m = openModal(`<div class="deli deli-${menu.careerId}">
      <div class="deli-top"><span class="deli-clock"></span><span class="deli-count"></span><span class="deli-tips"></span><button class="deli-bookbtn" data-book aria-label="What goes in each order">📖</button></div>
      <div class="deli-shiftbar" aria-label="Shift progress"><i></i></div>
      <div class="deli-cust"><span class="deli-who"></span><span class="mg-bubble deli-ask"></span></div>
      <div class="deli-need" hidden></div>
      <div class="deli-wait"><i></i></div>
      <div class="deli-runner" aria-live="polite"></div>
      <div class="deli-tray" aria-label="Your tray"></div>
      <div class="deli-grid">${INGREDIENTS.map((g) => `<button class="deli-ing" data-ing="${g.id}"><span>${g.emoji}</span>${esc(g.label)}</button>`).join('')}</div>
      <div class="deli-acts"><button class="btn" data-clear>Clear</button><button class="btn primary" data-serve>${esc(menu.serve)}</button></div>
      <button class="btn ghost block deli-out" data-out>Clock out early</button>
      <div class="deli-choice" hidden></div>
      <div class="deli-book" hidden><h3>📖 What goes in each</h3>${recipeBookHtml(menu)}<button class="btn primary block" data-bookclose>Back to work</button></div>
    </div>`);
    m.el.classList.add('deli-modal');
    const q = <T extends HTMLElement>(s: string) => m.el.querySelector<T>(s)!;
    const clockEl = q('.deli-clock'), countEl = q('.deli-count'), tipsEl = q('.deli-tips');
    const whoEl = q('.deli-who'), askEl = q('.deli-ask'), waitEl = q<HTMLElement>('.deli-wait i'), trayEl = q('.deli-tray');
    const barEl = q<HTMLElement>('.deli-shiftbar i'), runnerEl = q('.deli-runner');
    const choiceEl = q('.deli-choice');
    const needEl = q<HTMLElement>('.deli-need'), bookEl = q<HTMLElement>('.deli-book');
    const played = info.played ?? 0;
    let bookOpen = false;
    let ordersShown = 0;
    const served: ServedOrder[] = [];
    const picks: Record<string, string> = {};
    const choiceAt: Record<string, number> = {};
    let tray: string[] = [];
    let order = makeOrder(Math.random, menu);
    let wait = ORDER_SECONDS;
    let left = wait;
    let paused = false;
    let done = false;
    let tipsSoFar = 0;
    let boost = 1;
    let elapsed = 0;
    let runnerN = 0;

    const progress = () => Math.min(1, elapsed / TOTAL);
    /** Training: light up what the order still needs (first shifts at a job). */
    const drawHints = () => {
      const light = played < TRAINING_SHIFTS && ordersShown <= TRAINING_ORDERS;
      const still = [...order.items];
      for (const id of tray) {
        const i = still.indexOf(id);
        if (i >= 0) still.splice(i, 1);
      }
      m.el.querySelectorAll<HTMLElement>('[data-ing]').forEach((b) => b.classList.toggle('want', light && still.includes(b.dataset.ing!)));
      q('[data-serve]').classList.toggle('want', light && !still.length && tray.length === order.items.length);
    };
    const drawTray = () => {
      trayEl.innerHTML = tray.length ? tray.map((id) => `<span>${INGREDIENTS.find((g) => g.id === id)!.emoji}</span>`).join('') : `<em>${esc(menu.trayHint)}</em>`;
      drawHints();
    };
    const drawTop = () => {
      clockEl.textContent = `🕘 ${clock(info.startMinute + progress() * info.hours * 60)}`;
      countEl.textContent = `✅ ${served.filter((o) => o.right).length}`;
      tipsEl.textContent = `${tipWord} ${money(Math.min(room, tipsSoFar))}${tipsSoFar >= room ? ' 💯' : ''}`;
      barEl.style.width = `${progress() * 100}%`;
    };
    const nextCustomer = () => {
      if (progress() >= 1) return finish();
      // A choice comes up a quarter, half and three quarters of the way through.
      const ci = info.choices.findIndex((id, i) => !picks[id] && progress() >= (i + 1) / (info.choices.length + 1));
      if (ci >= 0) return showChoice(info.choices[ci]);
      order = makeOrder(Math.random, menu);
      tray = [];
      // Customers get less patient as the shift goes on.
      wait = ORDER_SECONDS - (ORDER_SECONDS - ORDER_SECONDS_END) * progress();
      left = wait;
      whoEl.innerHTML = `${order.who}${order.table ? `<small class="deli-table">🪑 ${order.table}</small>` : ''}`;
      askEl.textContent = `“${order.ask}”`;
      ordersShown++;
      // Your first shift here spells out every order; the second, the first few.
      const spell = played === 0 || (played < TRAINING_SHIFTS && ordersShown <= TRAINING_ORDERS);
      needEl.hidden = !spell;
      if (spell) needEl.innerHTML = `Needs: ${chips(menu, order.items)}`;
      // (QA only: the order's ingredients, so a test can play the shift.)
      if (/[?&]qa=1/.test(location.search)) m.el.dataset.want = order.items.join(',');
      drawTray();
      drawTop();
    };
    const showChoice = (id: string) => {
      const c = menu.choices.find((x) => x.id === id)!;
      paused = true;
      choiceEl.hidden = false;
      choiceEl.innerHTML = `<div class="big">${c.emoji}</div><p><b>${esc(c.text)}</b></p><div class="choices">${c.options.map((o) => `<button class="choice" data-pick="${o.id}">${esc(o.label)}<span class="hint">${esc(o.hint)}</span></button>`).join('')}</div>`;
      choiceEl.onclick = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]');
        if (!b) return;
        picks[id] = b.dataset.pick!;
        choiceAt[id] = served.length;
        const fx = c.options.find((o) => o.id === picks[id])?.fx;
        if (fx?.tipsAfter) boost = fx.tipsAfter;
        choiceEl.hidden = true;
        choiceEl.onclick = null;
        paused = false;
        nextCustomer();
      };
    };
    /** 🍸 A waiter takes the drink to the table. */
    const runDrink = () => {
      if (!menu.runner || !order.table) return;
      const r = menu.runner;
      const name = r.names[runnerN++ % r.names.length];
      const drink = r.glass[order.items[0]] ?? r.defaultGlass;
      runnerEl.innerHTML = `<span class="deli-run">${r.emoji}${drink}</span> ${esc(name)} takes it to 🪑 table ${order.table}`;
      runnerEl.classList.remove('go');
      void runnerEl.offsetWidth; // restart the animation
      runnerEl.classList.add('go');
    };
    const serve = (gaveUp = false) => {
      if (paused || done) return;
      const right = !gaveUp && orderRight(order, tray);
      const o: ServedOrder = { right, timeLeft: left / wait };
      served.push(o);
      tipsSoFar += orderTip(o) * boost * scale * (info.tipMult ?? 1);
      if (right) runDrink();
      // A quick reaction from the customer, then the next one.
      askEl.textContent = gaveUp ? '“Forget it, I’m out.” 😤' : right ? `“Perfect, thanks!” ${o.timeLeft > 0.6 ? '💵' : '🙂'}` : '“That’s not what I asked for…” 😕';
      askEl.classList.toggle('ok', right);
      askEl.classList.toggle('no', !right);
      paused = true;
      drawTop();
      window.setTimeout(() => {
        askEl.classList.remove('ok', 'no');
        paused = false;
        nextCustomer();
      }, 700);
    };
    const finish = () => {
      if (done) return;
      done = true;
      window.clearInterval(tick);
      m.close();
      resolve({ orders: served, picks, choiceAt });
    };
    m.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const ing = t.closest<HTMLElement>('[data-ing]');
      if (ing && !paused && tray.length < 7) {
        tray.push(ing.dataset.ing!);
        drawTray();
      } else if (t.closest('[data-clear]') && !paused) {
        tray = [];
        drawTray();
      } else if (t.closest('[data-serve]')) serve();
      else if (t.closest('[data-out]')) finish();
      else if (t.closest('[data-book]') && choiceEl.hidden) {
        bookOpen = true;
        bookEl.hidden = false;
      } else if (t.closest('[data-bookclose]')) {
        bookOpen = false;
        bookEl.hidden = true;
      }
    });
    const tick = window.setInterval(() => {
      if (done) return;
      // The shift clock stops while you make a choice.
      if (choiceEl.hidden && !bookOpen) elapsed += 0.1;
      drawTop();
      if (paused || bookOpen) return;
      if (progress() >= 1) return finish();
      left -= 0.1;
      waitEl.style.width = `${Math.max(0, left / wait) * 100}%`;
      waitEl.style.background = left < 4 ? '#e0283f' : '';
      if (left <= 0) serve(true);
    }, 100);
    nextCustomer();
  });
}

/** The payslip. `collect` pays (once); the button can't be pressed twice. */
export function showPayslip(slip: Payslip, opts: { title: string; tipWord?: string; auto?: boolean; max?: number; skillLabel?: string }): Promise<void> {
  return new Promise((resolve) => {
    const needLine = (Object.entries(slip.needs) as [NeedKey, number][])
      .filter(([, v]) => Math.round(v) !== 0)
      .map(([k, v]) => `${NEED_INFO[k].emoji} ${v > 0 ? '+' : ''}${Math.round(v)}`)
      .join(' · ');
    const row = (label: string, v: number) => `<div class="slip-row"><span>${label}</span><b>${v < 0 ? '−' : ''}${money(Math.abs(v))}</b></div>`;
    const m = openModal(`
      <div class="big">🧾</div>
      <h2>Payslip</h2>
      <p>${esc(opts.title)} · ${opts.auto ? '⏩ auto' : `${slip.right}/${slip.of} right`}</p>
      <div class="slip">
        ${row('Base wage (4 h)', slip.base)}
        ${opts.auto ? '' : row(opts.tipWord ?? 'Tips', slip.tips)}
        ${slip.overtime ? row('Overtime', slip.overtime) : ''}
        ${slip.covered ? row('Out of your pocket', slip.covered) : ''}
        <div class="slip-row total"><span>Paid to your cash</span><b>${money(slip.total)}</b></div>
      </div>
      ${slip.capped ? '<p><b>💯 Max pay for a shift!</b></p>' : ''}
      ${slip.rep.map((r) => `<p><b>+${r.points} ${r.kind === 'street' ? '🔥 street' : '💼 corporate'} rep</b>${r.rankUp ? ` · you’re now ${esc(r.rankUp)}` : ''}</p>`).join('')}
      ${slip.counted ? `<p>📈 Counts toward your next raise${slip.skill > 0 ? ` · +${slip.skill.toFixed(1)} ${esc(opts.skillLabel ?? 'skill')}` : ''}</p>` : ''}
      ${opts.auto && opts.max ? `<p class="sub">Auto pays only. Play the shift for up to ${money(opts.max)}, raise progress, skill and rep.</p>` : ''}
      <p class="slip-needs">${needLine}</p>
      ${slip.promoted ? `<p><b>📈 Promoted to ${esc(slip.promoted)}!</b></p>` : ''}
      <button class="btn primary block" data-act="ok">Nice</button>`);
    m.el.querySelector('[data-act="ok"]')!.addEventListener('click', () => {
      m.close();
      resolve();
    }, { once: true });
  });
}
