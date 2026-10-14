// =====================================================================
// casino.ts (ui) — the four tables at the Empire Casino. Rules and
// payouts live in sim/casino.ts; this file draws and animates them.
//
// 🎰 Slots: three reels spin and stop one by one; wins flash and coins rain.
// 🃏 Blackjack: cards slide in and flip; the dealer's hole card turns last.
// 🎡 Roulette: a real wheel (all 37 pockets) spins one way, the ball the other.
// 🚀 Rocket: the multiplier climbs along a curve; cash out before 💥.
// Cash only; every bet goes through sim/casino.ts → stake/payout.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { BET, colourOf, crashPoint, dealBlackjack, doubleDown, handValue, hit, payout, REEL, rocketAt, rouletteReturn, slotMultiplier, spinReel, spinRoulette, stake, stand, WHEEL, type BjHand, type Card, type RouletteBet } from '../sim/casino.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { openModal, toast } from './dom.ts';

export interface CasinoHost {
  state: GameState;
  /** Save and refresh the HUD after money moves. */
  saved(): void;
}

const CHIPS = [500, 2_500, 10_000, 50_000, 100_000, 500_000];

/** A row of chips to pick your bet. Remembers the last pick per game. */
const lastBet: Record<string, number> = {};
function chipRow(game: string): string {
  const cur = lastBet[game] ?? 2_500;
  return `<div class="chips" role="radiogroup" aria-label="Bet">${CHIPS.map((c) => `<button class="chip${c === cur ? ' on' : ''}" data-chip="${c}" role="radio" aria-checked="${c === cur}">${money(c).replace('.00', '')}</button>`).join('')}</div>`;
}
function wireChips(el: HTMLElement, game: string): () => number {
  el.querySelector('.chips')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-chip]');
    if (!b) return;
    sfx.tap();
    lastBet[game] = Number(b.dataset.chip);
    el.querySelectorAll<HTMLElement>('.chip').forEach((c) => {
      c.classList.toggle('on', c === b);
      c.setAttribute('aria-checked', String(c === b));
    });
  });
  return () => lastBet[game] ?? 2_500;
}

/** Coins (or anything) raining down over an element. */
export function rain(el: HTMLElement, emoji: string, n = 24): void {
  const box = document.createElement('div');
  box.className = 'rain';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) {
    const d = document.createElement('span');
    d.textContent = emoji;
    d.style.left = `${Math.random() * 100}%`;
    d.style.animationDelay = `${Math.random() * 0.6}s`;
    d.style.animationDuration = `${1.2 + Math.random() * 0.9}s`;
    d.style.fontSize = `${18 + Math.random() * 16}px`;
    box.appendChild(d);
  }
  el.appendChild(box);
  window.setTimeout(() => box.remove(), 2600);
}

function head(emoji: string, title: string, s: GameState): string {
  return `<div class="cas-head"><span class="cas-emoji">${emoji}</span><h2>${esc(title)}</h2><span class="cas-cash" data-cash>${money(s.money)}</span></div>`;
}
function cash(el: HTMLElement, s: GameState): void {
  const c = el.querySelector<HTMLElement>('[data-cash]');
  if (c) c.textContent = money(s.money);
}
const closeBtn = '<button class="btn ghost block" data-close>Leave the table</button>';

// ===================================================================== 🎰
export function openSlots(host: CasinoHost): void {
  const s = host.state;
  const STRIP = 24; // symbols per reel strip (we land on the last row)
  const m = openModal(`<div class="cas cas-slots">
    ${head('🎰', 'Liberty Slots', s)}
    <div class="slot-window"><div class="slot-line" aria-hidden="true"></div>${[0, 1, 2].map((i) => `<div class="reel"><div class="strip" data-reel="${i}"></div></div>`).join('')}</div>
    <p class="cas-msg" aria-live="polite">Three of a kind pays up to 250×. Any pair of 🗽, 💎 or 7️⃣ pays too.</p>
    <details class="paytable"><summary>Pay table</summary>${REEL.map((r) => `<div><span>${r.sym}${r.sym}${r.sym}</span><b>${r.three}×</b><span>${r.sym}${r.sym}</span><b>${r.two}×</b></div>`).join('')}</details>
    ${chipRow('slots')}
    <button class="btn primary block cas-go" data-spin>Spin</button>
    ${closeBtn}
  </div>`);
  m.el.classList.add('cas-modal');
  const bet = wireChips(m.el, 'slots');
  const strips = [...m.el.querySelectorAll<HTMLElement>('.strip')];
  const msg = m.el.querySelector<HTMLElement>('.cas-msg')!;
  const fill = (strip: HTMLElement, land: number) => {
    const syms = Array.from({ length: STRIP }, (_, i) => (i === STRIP - 1 ? REEL[land].sym : REEL[spinReel()].sym));
    strip.innerHTML = syms.map((x) => `<div class="sym">${x}</div>`).join('');
  };
  strips.forEach((st) => fill(st, spinReel()));
  strips.forEach((st) => (st.style.transform = `translateY(calc(-${STRIP - 1} * var(--sym)))`));
  let spinning = false;
  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return m.close();
    if (!t.closest('[data-spin]') || spinning) return;
    const b = bet();
    const why = stake(s, b, 'Slots');
    if (why) return toast(why, { icon: '🎰', tone: 'bad' });
    sfx.coin();
    spinning = true;
    cash(m.el, s);
    m.el.querySelector('.slot-window')!.classList.remove('won', 'jackpot');
    const land = [spinReel(), spinReel(), spinReel()];
    msg.textContent = 'Spinning…';
    strips.forEach((st, i) => {
      fill(st, land[i]);
      st.style.transition = 'none';
      st.style.transform = 'translateY(0)';
      void st.offsetHeight;
      st.style.transition = `transform ${1.1 + i * 0.45}s cubic-bezier(.15,.85,.25,1.02)`;
      st.style.transform = `translateY(calc(-${STRIP - 1} * var(--sym)))`;
    });
    // Ticking while the reels spin.
    const ticker = window.setInterval(() => sfx.tick(), 70);
    window.setTimeout(() => {
      window.clearInterval(ticker);
      const mult = slotMultiplier(land);
      if (mult > 0) payout(s, b * mult, 'Slots');
      spinning = false;
      cash(m.el, s);
      const win = m.el.querySelector('.slot-window')!;
      if (mult >= 40) {
        sfx.jackpot();
        win.classList.add('jackpot');
        rain(m.el, '🪙', 40);
        msg.innerHTML = `<b>JACKPOT! ${mult}× · +${money(b * mult)}</b>`;
      } else if (mult > 0) {
        sfx.win();
        win.classList.add('won');
        if (mult >= 8) rain(m.el, '🪙', 18);
        msg.innerHTML = `<b>${mult}× · +${money(b * mult)}</b>`;
      } else msg.textContent = 'No luck. Spin again?';
      host.saved();
    }, 1100 + 2 * 450 + 80);
  });
}

// ===================================================================== 🃏
function cardHtml(c: Card | null, i: number): string {
  if (!c) return `<div class="card-p back" style="--i:${i}"><span>🗽</span></div>`;
  const red = c.suit === '♥' || c.suit === '♦';
  return `<div class="card-p${red ? ' red' : ''}" style="--i:${i}"><b>${c.rank}</b><span>${c.suit}</span></div>`;
}

export function openBlackjack(host: CasinoHost): void {
  const s = host.state;
  const m = openModal(`<div class="cas cas-bj">
    ${head('🃏', 'Blackjack', s)}
    <div class="felt">
      <div class="bj-row"><span class="bj-who">Dealer <i data-dv></i></span><div class="bj-cards" data-dealer></div></div>
      <div class="bj-row"><span class="bj-who">You <i data-pv></i></span><div class="bj-cards" data-player></div></div>
      <p class="cas-msg" aria-live="polite">Get closer to 21 than the dealer. Blackjack pays 3 to 2.</p>
    </div>
    <div data-betting>${chipRow('bj')}<button class="btn primary block cas-go" data-deal>Deal</button></div>
    <div class="bj-acts" data-playing hidden><button class="btn" data-hit>Hit</button><button class="btn primary" data-stand>Stand</button><button class="btn" data-double>Double</button></div>
    ${closeBtn}
  </div>`);
  m.el.classList.add('cas-modal');
  const bet = wireChips(m.el, 'bj');
  const q = (sel: string) => m.el.querySelector<HTMLElement>(sel)!;
  const msg = q('.cas-msg');
  let h: BjHand | null = null;
  const draw = () => {
    if (!h) return;
    q('[data-player]').innerHTML = h.player.map((c, i) => cardHtml(c, i)).join('');
    q('[data-dealer]').innerHTML = h.dealer.map((c, i) => cardHtml(i === 1 && !h!.done ? null : c, i)).join('');
    q('[data-pv]').textContent = String(handValue(h.player).total);
    q('[data-dv]').textContent = h.done ? String(handValue(h.dealer).total) : '?';
    q('[data-playing]').hidden = h.done;
    q('[data-betting]').hidden = !h.done;
    (q('[data-double]') as HTMLButtonElement).disabled = h.player.length !== 2 || s.money < h.bet;
    sfx.card();
    if (h.done) {
      const words: Record<string, string> = { blackjack: 'Blackjack! 🎉', win: 'You win! 🙌', push: 'Push. Bet back.', lose: 'Dealer wins.', bust: 'Bust! 💥' };
      payout(s, h.returned, 'Blackjack');
      const net = h.returned - h.bet;
      msg.innerHTML = `<b>${words[h.outcome!]}</b>${net > 0 ? ` +${money(net)}` : net < 0 ? ` −${money(-net)}` : ''}`;
      if (h.outcome === 'blackjack' || h.outcome === 'win') (sfx.win(), h.outcome === 'blackjack' && rain(m.el, '🪙', 16));
      else if (h.outcome !== 'push') sfx.bad();
      cash(m.el, s);
      host.saved();
    } else msg.textContent = 'Hit, stand or double?';
  };
  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return m.close();
    if (t.closest('[data-deal]')) {
      const b = bet();
      const why = stake(s, b, 'Blackjack');
      if (why) return toast(why, { icon: '🃏', tone: 'bad' });
      cash(m.el, s);
      h = dealBlackjack(b);
      return draw();
    }
    if (!h || h.done) return;
    if (t.closest('[data-hit]')) (hit(h), draw());
    else if (t.closest('[data-stand]')) (stand(h), draw());
    else if (t.closest('[data-double]')) {
      // Doubling: put up the same stake again.
      const why = stake(s, h.bet, 'Blackjack');
      if (why) return toast(why, { icon: '🃏', tone: 'bad' });
      doubleDown(h); // the hand now plays (and pays) on twice the bet
      draw();
    }
  });
}

// ===================================================================== 🎡
const BETS: { id: RouletteBet; label: string; cls?: string }[] = [
  { id: 'red', label: 'Red', cls: 'red' },
  { id: 'black', label: 'Black', cls: 'black' },
  { id: 'odd', label: 'Odd' },
  { id: 'even', label: 'Even' },
  { id: 'low', label: '1–18' },
  { id: 'high', label: '19–36' },
  { id: 'dozen1', label: '1st 12' },
  { id: 'dozen2', label: '2nd 12' },
  { id: 'dozen3', label: '3rd 12' },
];

export function openRoulette(host: CasinoHost): void {
  const s = host.state;
  const step = 360 / WHEEL.length;
  const pockets = WHEEL.map((n, i) => `<span class="pocket ${colourOf(n)}" style="transform:rotate(${i * step}deg)"><i>${n}</i></span>`).join('');
  const grad = WHEEL.map((n, i) => `${{ red: '#c1272d', black: '#1b1d22', green: '#1f8a4c' }[colourOf(n)]} ${i * step}deg ${(i + 1) * step}deg`).join(',');
  const m = openModal(`<div class="cas cas-roul">
    ${head('🎡', 'Roulette', s)}
    <div class="wheel-wrap"><div class="wheel" style="background:conic-gradient(from ${-step / 2}deg, ${grad})">${pockets}<div class="hub"></div></div><div class="ball-track"><div class="ball"></div></div><div class="wheel-pin" aria-hidden="true">▼</div></div>
    <p class="cas-msg" aria-live="polite">Pick a bet, then spin.</p>
    <div class="roul-bets">${BETS.map((b) => `<button class="rb ${b.cls ?? ''}" data-bet="${b.id}">${b.label}</button>`).join('')}</div>
    <div class="roul-nums">${Array.from({ length: 37 }, (_, n) => `<button class="rn ${colourOf(n)}" data-bet="n${n}">${n}</button>`).join('')}</div>
    ${chipRow('roul')}
    <button class="btn primary block cas-go" data-spin>Spin</button>
    ${closeBtn}
  </div>`);
  m.el.classList.add('cas-modal');
  const bet = wireChips(m.el, 'roul');
  const msg = m.el.querySelector<HTMLElement>('.cas-msg')!;
  const wheel = m.el.querySelector<HTMLElement>('.wheel')!;
  const ball = m.el.querySelector<HTMLElement>('.ball-track')!;
  let pick: RouletteBet | null = null;
  let spinning = false;
  let wheelAngle = 0;
  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return m.close();
    const b = t.closest<HTMLElement>('[data-bet]');
    if (b && !spinning) {
      sfx.tap();
      pick = b.dataset.bet as RouletteBet;
      m.el.querySelectorAll('[data-bet]').forEach((x) => x.classList.toggle('on', x === b));
      msg.textContent = `Bet on ${pick.startsWith('n') ? `number ${pick.slice(1)} (35 to 1)` : b.textContent}. Spin!`;
      return;
    }
    if (!t.closest('[data-spin]') || spinning) return;
    if (!pick) return toast('Pick a bet first', { icon: '🎡' });
    const stakeAmt = bet();
    const why = stake(s, stakeAmt, 'Roulette');
    if (why) return toast(why, { icon: '🎡', tone: 'bad' });
    spinning = true;
    cash(m.el, s);
    const n = spinRoulette();
    const idx = WHEEL.indexOf(n);
    // The wheel turns clockwise; the ball goes the other way and lands under the pin.
    wheelAngle += 360 * 4 + ((360 - ((wheelAngle % 360) + idx * step) % 360) % 360);
    wheel.style.transition = 'transform 4.2s cubic-bezier(.12,.75,.2,1)';
    wheel.style.transform = `rotate(${wheelAngle}deg)`;
    ball.classList.remove('roll');
    void ball.offsetWidth;
    ball.classList.add('roll');
    msg.textContent = 'No more bets…';
    const ticker = window.setInterval(() => sfx.tick(), 110);
    window.setTimeout(() => {
      window.clearInterval(ticker);
      spinning = false;
      const ret = rouletteReturn(pick!, n) * stakeAmt;
      payout(s, ret, 'Roulette');
      cash(m.el, s);
      const col = colourOf(n);
      msg.innerHTML = `<span class="landed ${col}">${n}</span> ${ret ? `<b>You win ${money(ret - stakeAmt)}!</b>` : 'House wins.'}`;
      if (ret) (sfx.win(), ret >= stakeAmt * 36 && (sfx.jackpot(), rain(m.el, '🪙', 40)));
      else sfx.bad();
      host.saved();
    }, 4300);
  });
}

// ===================================================================== 🚀
export function openRocket(host: CasinoHost): void {
  const s = host.state;
  const m = openModal(`<div class="cas cas-rocket">
    ${head('🚀', 'Rocket', s)}
    <div class="rocket-sky"><canvas width="640" height="360"></canvas><div class="rocket-mult">1.00×</div></div>
    <p class="cas-msg" aria-live="polite">The multiplier climbs until the rocket blows up. Cash out in time.</p>
    <div data-betting>${chipRow('rocket')}<button class="btn primary block cas-go" data-launch>Launch</button></div>
    <button class="btn primary block cas-go cash-out" data-out hidden>Cash out</button>
    ${closeBtn}
  </div>`);
  m.el.classList.add('cas-modal');
  const bet = wireChips(m.el, 'rocket');
  const cv = m.el.querySelector('canvas')!;
  const g = cv.getContext('2d')!;
  const multEl = m.el.querySelector<HTMLElement>('.rocket-mult')!;
  const msg = m.el.querySelector<HTMLElement>('.cas-msg')!;
  const outBtn = m.el.querySelector<HTMLElement>('[data-out]')!;
  const betting = m.el.querySelector<HTMLElement>('[data-betting]')!;
  let raf = 0;
  let flight: { stake: number; crash: number; t0: number; out: number | null } | null = null;
  // Stars that drift past as it climbs.
  const stars = Array.from({ length: 50 }, () => ({ x: Math.random() * 640, y: Math.random() * 360, r: Math.random() * 1.6 + 0.4 }));
  const drawSky = (t: number, mult: number, boom: boolean) => {
    g.fillStyle = '#0d1030';
    g.fillRect(0, 0, 640, 360);
    g.fillStyle = '#ffffffaa';
    for (const st of stars) {
      const y = (st.y + t * 30 * Math.min(4, mult)) % 360;
      g.beginPath();
      g.arc(st.x, y, st.r, 0, Math.PI * 2);
      g.fill();
    }
    // The curve: x by time, y by multiplier (log scale).
    const span = Math.max(8, t + 1);
    const X = (tt: number) => 30 + (tt / span) * 560;
    const Y = (mm: number) => 330 - (Math.log(mm) / Math.log(Math.max(2, mult * 1.4))) * 280;
    g.strokeStyle = boom ? '#e0283f' : '#36c46b';
    g.lineWidth = 5;
    g.beginPath();
    for (let k = 0; k <= 60; k++) {
      const tt = (t * k) / 60;
      const x = X(tt), y = Y(rocketAt(tt));
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    g.font = boom ? '64px system-ui' : '44px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(boom ? '💥' : '🚀', X(t), Y(mult) - 10);
  };
  drawSky(0, 1, false);
  const end = (boom: boolean) => {
    cancelAnimationFrame(raf);
    outBtn.hidden = true;
    betting.hidden = false;
    flight = null;
    cash(m.el, s);
    host.saved();
    if (boom) sfx.boom();
  };
  const frame = () => {
    if (!flight) return;
    const t = (performance.now() - flight.t0) / 1000;
    const mult = rocketAt(t);
    if (mult >= flight.crash) {
      drawSky(t, flight.crash, true);
      multEl.textContent = `💥 ${flight.crash.toFixed(2)}×`;
      multEl.classList.add('boom');
      if (flight.out === null) msg.innerHTML = `<b>Blew up at ${flight.crash.toFixed(2)}×.</b> Lost ${money(flight.stake)}.`;
      return end(true);
    }
    drawSky(t, mult, false);
    multEl.textContent = `${mult.toFixed(2)}×`;
    if (flight.out === null) outBtn.textContent = `Cash out ${money(Math.floor(flight.stake * mult))}`;
    raf = requestAnimationFrame(frame);
  };
  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) {
      // Leaving mid-flight cashes you out (no rage-quitting a loss away, no free money either).
      if (flight && flight.out === null) {
        const mult = rocketAt((performance.now() - flight.t0) / 1000);
        if (mult < flight.crash) payout(s, Math.floor(flight.stake * mult), 'Rocket');
      }
      cancelAnimationFrame(raf);
      host.saved();
      return m.close();
    }
    if (t.closest('[data-launch]') && !flight) {
      const b = bet();
      const why = stake(s, b, 'Rocket');
      if (why) return toast(why, { icon: '🚀', tone: 'bad' });
      cash(m.el, s);
      multEl.classList.remove('boom', 'safe');
      msg.textContent = '3… 2… 1… liftoff!';
      flight = { stake: b, crash: crashPoint(), t0: performance.now(), out: null };
      betting.hidden = true;
      outBtn.hidden = false;
      raf = requestAnimationFrame(frame);
      return;
    }
    if (t.closest('[data-out]') && flight && flight.out === null) {
      const mult = rocketAt((performance.now() - flight.t0) / 1000);
      if (mult >= flight.crash) return;
      flight.out = mult;
      const won = Math.floor(flight.stake * mult);
      payout(s, won, 'Rocket');
      sfx.win();
      if (mult >= 5) rain(m.el, '🪙', 20);
      multEl.classList.add('safe');
      msg.innerHTML = `<b>Cashed out at ${mult.toFixed(2)}× · +${money(won - flight.stake)}</b> (watch where it would have gone)`;
      outBtn.hidden = true;
      cash(m.el, s);
      host.saved();
    }
  });
}

/** The cashier: what you're up or down at the casino overall. */
export function casinoNetLine(s: GameState): string {
  const n = s.fun?.casinoNet ?? 0;
  return n === 0 ? 'Even so far' : n > 0 ? `You’re up ${money(n)}` : `You’re down ${money(-n)}`;
}

export { BET };
