// =====================================================================
// casino-games.ts (ui) — the second floor of the Empire Casino. Rules and
// pay tables live in sim/casino-games.ts; this file draws and animates.
//
// ♠️ Hold'em      openPoker      a cash game vs the regulars
// 🎲 Craps        openCraps      pass / don't pass, odds, field
// 🀄 Baccarat     openBaccarat   squeeze the cards yourself
// 🎡 Big Six      openBigSix     the money wheel, flapper and all
// 🎟️ Scratchers   openScratch    scratch the foil with your finger
// 🔢 Keno         openKeno       pick up to 10, twenty balls drawn
// 🔻 Plinko       openPlinko     drop balls through twelve rows of pegs
// 🃏 Video poker  openVideoPoker Jacks or Better 9/6
//
// Money: every bet goes through sim/casino.ts → stake()/payout(). The
// result of a round is settled when it's revealed; leaving early settles
// anything still owed (nobody loses a win by closing, nobody escapes a loss).
// In-game money only.
// =====================================================================

import './casino-games.css';
import { esc, money } from '../core/format.ts';
import { BET, payout, stake } from '../sim/casino.ts';
import {
  bacTotal, baccaratReturn, bestHand, bigSixReturn, crapsCanBet, crapsOddsRoom, crapsRoll, dealBaccarat, drawKeno, KENO, KENO_PAY, kenoReturn,
  newBaccaratShoe, newPokerTable, npcDecide, PLINKO, PLINKO_ROWS, plinkoDrop, POKER_REGULARS, pokerAct, pokerOptions, potOf, printScratch, raiseSizes,
  rollDice, SCRATCHERS, SIX, SIX_BY, SIX_WHEEL, spinBigSix, startHand, vpDeal, vpDraw, vpEvaluate, VP_PAYS, vpSuggest,
  type BacBet, type Card, type CrapsBet, type CrapsTable, type PlinkoRisk, type PokerTable, type ScratchCard, type SixSym, type VpRound,
} from '../sim/casino-games.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { rain, type CasinoHost } from './casino.ts';
import { openModal, toast } from './dom.ts';
import { burstAt, popAt, shakeEl } from './juice.ts';

// ================================================================ shared

const CHIPS = [500, 2_500, 10_000, 50_000, 100_000, 500_000];
const lastBet: Record<string, number> = {};
const $ = (c: number) => money(c).replace(/\.00$/, '');
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function chipRow(game: string, label = 'Bet'): string {
  const cur = lastBet[game] ?? 2_500;
  return `<div class="chips" role="radiogroup" aria-label="${label}">${CHIPS.map((c) => `<button class="chip${c === cur ? ' on' : ''}" data-chip="${c}" role="radio" aria-checked="${c === cur}">${$(c)}</button>`).join('')}</div>`;
}

function head(emoji: string, title: string, s: GameState): string {
  return `<div class="cas-head"><span class="cas-emoji">${emoji}</span><h2>${esc(title)}</h2><span class="cas-cash" data-cash>${money(s.money)}</span></div>`;
}

interface Table {
  el: HTMLElement;
  q: <T extends HTMLElement = HTMLElement>(sel: string) => T;
  qa: <T extends HTMLElement = HTMLElement>(sel: string) => T[];
  alive: () => boolean;
  /** Resolves after ms (never, if the table was closed). */
  wait: (ms: number) => Promise<void>;
  later: (fn: () => void, ms: number) => void;
  /** Money owed from a round still being revealed. Call the result to settle now. */
  owe: (fn: () => void) => () => void;
  bet: () => number;
  cash: () => void;
  /** Take a bet (toasts why not). */
  take: (cents: number) => boolean;
  /** Pay out and record a win. */
  pay: (cents: number, staked: number) => void;
  onClose: (fn: () => void) => void;
  close: () => void;
}

/** Open a table: modal, chips, timers, money owed. */
function openTable(host: CasinoHost, id: string, label: string, icon: string, cls: string, body: string): Table {
  const s = host.state;
  const m = openModal(`<div class="cas cg ${cls}">${body}</div>`);
  m.el.classList.add('cas-modal', 'cg-modal');
  const timers = new Set<number>();
  const owed = new Set<() => void>();
  const closers: (() => void)[] = [];
  let alive = true;
  const T: Table = {
    el: m.el,
    q: (sel) => m.el.querySelector(sel)!,
    qa: (sel) => [...m.el.querySelectorAll(sel)] as never,
    alive: () => alive,
    later: (fn, ms) => {
      const t = window.setTimeout(() => (timers.delete(t), alive && fn()), ms);
      timers.add(t);
    },
    wait: (ms) => new Promise((r) => T.later(r, ms)),
    owe: (fn) => {
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        owed.delete(settle);
        fn();
      };
      owed.add(settle);
      return settle;
    },
    bet: () => lastBet[id] ?? 2_500,
    cash: () => {
      const c = m.el.querySelector<HTMLElement>('[data-cash]');
      if (c) c.textContent = money(s.money);
    },
    take: (cents) => {
      const why = stake(s, cents, label);
      if (why) {
        toast(why, { icon, tone: 'bad' });
        return false;
      }
      T.cash();
      host.saved();
      return true;
    },
    pay: (cents, staked) => {
      if (cents > 0) payout(s, cents, label);
      T.cash();
      host.saved();
      if (cents > staked) host.onScore?.(id, Math.round(cents - staked));
    },
    onClose: (fn) => closers.push(fn),
    close: () => {
      if (!alive) return;
      for (const fn of closers) fn();
      for (const settle of [...owed]) settle();
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
      host.saved();
      m.close();
    },
  };
  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return T.close();
    const chip = t.closest<HTMLElement>('[data-chip]');
    if (chip && chip.closest('.chips')) {
      sfx.tap();
      lastBet[id] = Number(chip.dataset.chip);
      chip.closest('.chips')!.querySelectorAll<HTMLElement>('.chip').forEach((c) => {
        c.classList.toggle('on', c === chip);
        c.setAttribute('aria-checked', String(c === chip));
      });
    }
  });
  return T;
}

const leave = (text = 'Leave the table') => `<button class="btn ghost block" data-close>${text}</button>`;

/** A playing card that can be dealt face down and flipped. */
function cardHtml(c: Card | null, opts: { down?: boolean; i?: number; cls?: string } = {}): string {
  const red = c && (c.suit === '♥' || c.suit === '♦');
  const face = c ? `<b>${c.rank}</b><span>${c.suit}</span><em>${c.suit}</em>` : '';
  return `<div class="cg-card${opts.cls ? ` ${opts.cls}` : ''}" style="--i:${opts.i ?? 0}"><div class="cg-in${opts.down || !c ? ' down' : ''}"><div class="cg-f${red ? ' red' : ''}">${face}</div><div class="cg-b"></div></div></div>`;
}
const flip = (card: Element | null) => card?.querySelector('.cg-in')?.classList.remove('down');

/** A big win: coins, shake, banner. */
function celebrate(T: Table, at: HTMLElement, text: string, size: 'small' | 'big' | 'huge'): void {
  if (size === 'small') return void (sfx.win(), popAt(at, text, { color: '#7bd88f', size: 24 }));
  if (size === 'big') {
    sfx.win();
    popAt(at, text, { color: '#ffd23f', size: 30 });
    if (!calm()) rain(T.el, '🪙', 18);
    return;
  }
  sfx.jackpot();
  popAt(at, text, { color: '#ffd23f', size: 38 });
  if (!calm()) (rain(T.el, '🪙', 40), shakeEl(T.q('.cas'), true), burstAt(at, ['🪙', '💵', '✨'], 14));
  T.el.classList.remove('cg-flash');
  void T.el.offsetWidth;
  T.el.classList.add('cg-flash');
}
const sizeOf = (won: number, staked: number): 'small' | 'big' | 'huge' => (won >= staked * 20 ? 'huge' : won >= staked * 4 ? 'big' : 'small');

// =============================================================== ♠️ HOLD'EM

/** Seat spots around the oval (clockwise from you at the bottom). */
const SPOTS: Record<string, [number, number]> = { B: [50, 87], LL: [12, 69], UL: [12, 29], T: [50, 11], UR: [88, 29], LR: [88, 69] };
const LAYOUT: Record<number, string[]> = { 4: ['B', 'UL', 'T', 'UR'], 5: ['B', 'LL', 'UL', 'UR', 'LR'], 6: ['B', 'LL', 'UL', 'T', 'UR', 'LR'] };

export function openPoker(host: CasinoHost): void {
  const s = host.state;
  const T = openTable(host, 'poker', 'Hold’em', '♠️', 'cg-poker', `
    ${head('♠️', 'Hold’em', s)}
    <div class="pk-table" data-table>
      <div class="pk-pot" data-pot></div>
      <div class="pk-board" data-board></div>
      <div class="pk-lobby" data-lobby><b>No-limit Texas Hold’em</b><span>Blinds are 1/100 and 1/50 of your buy-in. The house rakes 5% of pots that see a flop.</span></div>
    </div>
    <div class="pk-me" data-me hidden><div class="pk-hole" data-hole></div><div class="pk-hand" data-hand></div></div>
    <p class="cas-msg" aria-live="polite">Pick a buy-in and grab a seat.</p>
    <div data-buyin>
      <div class="cg-seg" role="radiogroup" aria-label="Players at the table">${[3, 4, 5].map((n) => `<button data-npcs="${n}" class="${n === 4 ? 'on' : ''}">${n + 1} players</button>`).join('')}</div>
      ${chipRow('poker', 'Buy-in')}
      <button class="btn primary block cas-go" data-sit>Sit down</button>
    </div>
    <div class="pk-acts" data-acts hidden>
      <div class="pk-row"><button class="btn pk-fold" data-fold>Fold</button><button class="btn primary" data-call>Check</button></div>
      <div class="pk-sizes" data-sizes></div>
    </div>
    <button class="btn primary block cas-go" data-next hidden>Next hand</button>
    ${leave('Cash out & leave')}
  `);
  const msg = T.q('.cas-msg');
  let t: PokerTable | null = null;
  let npcs = 4;
  let boughtIn = 0;
  let shownBoard = 0;
  let busy = false;
  const spotOf = (i: number) => SPOTS[LAYOUT[t!.seats.length][i]];

  const drawSeats = (showdown: boolean) => {
    const tb = T.q('[data-table]');
    tb.querySelectorAll('.pk-seat, .pk-bet').forEach((x) => x.remove());
    const winners = new Set(t!.winners.map((w) => w.seat));
    t!.seats.forEach((p, i) => {
      const [x, y] = spotOf(i);
      const reveal = showdown && !p.folded && !p.out && !p.human && t!.winners.some((w) => w.hand);
      const cards = p.human || p.out ? '' : `<div class="pk-cards">${p.hole.map((c, k) => cardHtml(c, { down: true, i: k, cls: 'sm' })).join('')}</div>`;
      const cls = ['pk-seat', p.human ? 'me' : '', reveal ? 'reveal' : '', t!.toAct === i ? 'turn' : '', p.folded ? 'fold' : '', p.out ? 'out' : '', winners.has(i) ? 'win' : ''].join(' ');
      tb.insertAdjacentHTML('beforeend', `<div class="${cls}" style="left:${x}%;top:${y}%" data-seat="${i}">
        ${cards}<div class="pk-av">${p.emoji}${t!.button === i ? '<i class="pk-dealer">D</i>' : ''}</div>
        <div class="pk-name">${esc(p.name)}</div><div class="pk-stack">${p.allIn && !t!.handOver ? 'ALL-IN' : $(p.stack)}</div>
        ${p.last ? `<div class="pk-say${/Raise|Bet|All-in/.test(p.last) ? ' hot' : /Wins/.test(p.last) ? ' won' : ''}">${esc(p.last)}</div>` : ''}
      </div>`);
      if (p.bet > 0) {
        const bx = x + (50 - x) * 0.42, by = y + (50 - y) * 0.42;
        tb.insertAdjacentHTML('beforeend', `<div class="pk-bet" style="left:${bx}%;top:${by}%"><i></i>${$(p.bet)}</div>`);
      }
    });
  };

  const draw = (showdown = false) => {
    if (!t) return;
    T.q('[data-lobby]').hidden = true;
    T.q('[data-me]').hidden = false;
    T.q('[data-pot]').innerHTML = potOf(t) ? `Pot <b>${$(t.handOver ? t.winners.reduce((a, w) => a + w.amount, 0) : potOf(t))}</b>` : '';
    const board = T.q('[data-board]');
    if (t.board.length < shownBoard || !board.children.length) (board.innerHTML = Array.from({ length: 5 }, () => '<div class="pk-slot"></div>').join('')), (shownBoard = 0);
    for (let k = shownBoard; k < t.board.length; k++) {
      board.children[k].innerHTML = cardHtml(t.board[k], { i: k - shownBoard });
      sfx.card();
    }
    shownBoard = t.board.length;
    const me = t.seats[0];
    const hole = T.q('[data-hole]');
    if (hole.dataset.hand !== String(t.hands)) {
      hole.dataset.hand = String(t.hands);
      hole.innerHTML = me.hole.map((c, k) => cardHtml(c, { i: k, cls: 'lg' })).join('');
    }
    hole.classList.toggle('fold', me.folded);
    T.q('[data-hand]').textContent = me.hole.length && t.board.length >= 3 ? bestHand([...me.hole, ...t.board]).name : me.hole.length ? handHint(me.hole) : '';
    drawSeats(showdown);
    // Your options.
    const mine = !t.handOver && t.toAct === 0;
    T.q('[data-acts]').hidden = !mine;
    if (mine) {
      const o = pokerOptions(t);
      T.q('[data-call]').textContent = o.canCheck ? 'Check' : o.toCall >= me.stack ? `All-in ${$(o.toCall)}` : `Call ${$(o.toCall)}`;
      T.q('[data-sizes]').innerHTML = raiseSizes(t)
        .map((r) => `<button class="pk-size${r.label === 'All-in' ? ' allin' : ''}" data-raise="${r.to}"><small>${t!.currentBet ? (r.label === 'All-in' ? 'All-in' : `Raise · ${r.label}`) : r.label === 'All-in' ? 'All-in' : `Bet · ${r.label}`}</small>${$(r.to)}</button>`)
        .join('');
    }
    T.cash();
  };

  const handHint = (h: Card[]) => {
    const [a, b] = h;
    if (a.rank === b.rank) return `Pocket ${a.rank}s`;
    return `${a.rank}${b.rank}${a.suit === b.suit ? ' suited' : ''}`;
  };

  /** Let the regulars act until it's your turn or the hand ends. */
  const run = async () => {
    if (!t || busy) return;
    busy = true;
    let street = t.street;
    while (t && !t.handOver && t.toAct > 0) {
      draw();
      await T.wait(rnd(520, 1050));
      if (!t || t.handOver || t.toAct <= 0) break;
      const who = t.seats[t.toAct];
      pokerAct(t, npcDecide(t, t.toAct));
      if (/Raise|Bet|All-in/.test(who.last)) sfx.coin();
      else if (who.last === 'Fold') sfx.card();
      else sfx.tap();
      if (t.street !== street) (draw(), (street = t.street), await T.wait(600));
    }
    busy = false;
    draw();
    if (t?.handOver) await showdown();
    else if (t && t.toAct === 0) msg.textContent = msgFor(t);
  };

  const msgFor = (tt: PokerTable) => {
    const o = pokerOptions(tt);
    return o.canCheck ? 'Your move. Check or bet.' : `${$(o.toCall)} to call. Pot is ${$(potOf(tt))}.`;
  };

  const showdown = async () => {
    if (!t) return;
    // Run out the rest of the board slowly if everyone was all-in.
    draw(true);
    T.qa('.pk-seat.reveal .cg-card').forEach((c, k) => T.later(() => (flip(c), sfx.card()), 250 + 160 * k));
    const me = t.seats[0];
    const myWin = t.winners.find((w) => w.seat === 0);
    const top = t.winners.slice().sort((a, b) => b.amount - a.amount)[0];
    const w = t.seats[top.seat];
    const how = top.hand ? ` with ${top.hand}` : '';
    if (myWin) {
      const net = myWin.amount - me.totalIn;
      msg.innerHTML = `<b>You win ${$(myWin.amount)}${how}!</b>${t.rake ? ` <small>(house rake ${$(t.rake)})</small>` : ''}`;
      const big = myWin.amount >= t.bb * 40;
      celebrate(T, T.q('[data-hole]'), `+${$(Math.max(net, myWin.amount))}`, big ? (myWin.amount >= t.bb * 150 ? 'huge' : 'big') : 'small');
    } else {
      msg.innerHTML = `${w.emoji} <b>${esc(w.name)}</b> takes ${$(top.amount)}${how}.${me.folded ? '' : ' 😬'}`;
      if (!me.folded) sfx.bad();
    }
    T.q('[data-next]').hidden = me.stack <= 0;
    if (me.stack <= 0) {
      msg.innerHTML += ' <b>You’re out of chips.</b> Buy back in?';
      T.q('[data-buyin]').hidden = false;
      T.q('[data-sit]').textContent = 'Buy back in';
      T.q('.cg-seg').hidden = true;
    }
  };

  const deal = () => {
    if (!t) return;
    startHand(t);
    shownBoard = 0;
    T.q('[data-board]').innerHTML = '';
    T.q('[data-next]').hidden = true;
    msg.textContent = `Hand #${t.hands}. Blinds ${$(t.sb)}/${$(t.bb)}.`;
    sfx.card();
    draw();
    void run();
  };

  T.el.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const seg = el.closest<HTMLElement>('[data-npcs]');
    if (seg) {
      sfx.tap();
      npcs = Number(seg.dataset.npcs);
      T.qa('[data-npcs]').forEach((b) => b.classList.toggle('on', b === seg));
      return;
    }
    if (el.closest('[data-sit]')) {
      const buy = T.bet();
      if (t && t.seats[0].stack > 0) return;
      if (!T.take(buy)) return;
      boughtIn += buy;
      sfx.cash();
      if (!t) {
        t = newPokerTable(buy, npcs);
        const reg = t.seats[1 + Math.floor(Math.random() * (t.seats.length - 1))];
        const line = POKER_REGULARS.find((r) => r.name === reg.name)?.line ?? '';
        msg.innerHTML = `${reg.emoji} <b>${esc(reg.name)}</b>: “${esc(line)}”`;
      } else t.seats[0].stack = buy;
      T.q('[data-buyin]').hidden = true;
      T.later(deal, 900);
      return;
    }
    if (!t) return;
    if (el.closest('[data-next]')) return deal();
    if (t.handOver || t.toAct !== 0 || busy) return;
    if (el.closest('[data-fold]')) (pokerAct(t, { type: 'fold' }), sfx.card());
    else if (el.closest('[data-call]')) (pokerAct(t, { type: pokerOptions(t).canCheck ? 'check' : 'call' }), sfx.tap());
    else {
      const r = el.closest<HTMLElement>('[data-raise]');
      if (!r) return;
      pokerAct(t, { type: 'raise', to: Number(r.dataset.raise) });
      sfx.coin();
      if (t.seats[0].allIn) shakeEl(T.q('[data-table]'));
    }
    void run();
  });

  T.onClose(() => {
    if (!t || boughtIn === 0) return;
    // You leave with what's in front of you (chips already in the pot stay there).
    const left = t.seats[0].stack;
    if (left > 0) payout(s, left, 'Hold’em');
    const net = left - boughtIn;
    if (net > 0) host.onScore?.('poker', net);
    toast(net >= 0 ? `Cashed out ${$(left)} (up ${$(net)})` : `Cashed out ${$(left)} (down ${$(-net)})`, { icon: '♠️', tone: net >= 0 ? 'good' : 'info' });
  });
}

// ================================================================= 🎲 CRAPS

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieHtml = (v: number) => `<div class="cg-die" data-v="${v}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;

const CRAPS_SPOTS: { id: CrapsBet; label: string; sub: string }[] = [
  { id: 'dontPass', label: 'Don’t Pass Bar', sub: '2·3 win · 12 push' },
  { id: 'dontOdds', label: 'Lay Odds', sub: 'behind don’t pass' },
  { id: 'field', label: 'Field', sub: '2 pays 2× · 3·4·9·10·11 · 12 pays 3×' },
  { id: 'passOdds', label: 'Odds', sub: 'true odds, up to 2×' },
  { id: 'pass', label: 'Pass Line', sub: '7·11 win · 2·3·12 lose' },
];

export function openCraps(host: CasinoHost): void {
  const s = host.state;
  const T = openTable(host, 'craps', 'Craps', '🎲', 'cg-craps', `
    ${head('🎲', 'Craps', s)}
    <div class="felt cr-felt">
      <div class="cr-points">${[4, 5, 6, 8, 9, 10].map((n) => `<span data-pt="${n}">${n === 6 ? 'SIX' : n === 9 ? 'NINE' : n}</span>`).join('')}<b class="cr-puck" data-puck>OFF</b></div>
      <div class="cr-dice" data-dice>${dieHtml(3)}${dieHtml(4)}</div>
      <div class="cr-spots">${CRAPS_SPOTS.map((x) => `<button class="cr-spot cr-${x.id}" data-spot="${x.id}"><b>${x.label}</b><small>${x.sub}</small><span class="cr-stack" data-amt="${x.id}"></span></button>`).join('')}</div>
      <p class="cas-msg" aria-live="polite">Put a bet on the Pass Line (or the dark side), then roll.</p>
    </div>
    ${chipRow('craps')}
    <button class="btn primary block cas-go" data-roll>Roll the dice 🎲</button>
    ${leave()}
  `);
  const msg = T.q('.cas-msg');
  const tb: CrapsTable = { point: null, bets: {} };
  let rolling = false;
  let streak = 0;
  const staked: Partial<Record<CrapsBet, number>> = {};

  const draw = () => {
    for (const x of CRAPS_SPOTS) {
      const amt = tb.bets[x.id] ?? 0;
      const el = T.q(`[data-amt="${x.id}"]`);
      el.innerHTML = amt ? `<i></i>${$(amt)}` : '';
      const spot = T.q(`[data-spot="${x.id}"]`);
      spot.classList.toggle('has', amt > 0);
      spot.classList.toggle('dim', !!crapsCanBet(tb, x.id) && !amt);
    }
    const puck = T.q('[data-puck]');
    puck.textContent = tb.point ? 'ON' : 'OFF';
    puck.classList.toggle('on', !!tb.point);
    T.qa('[data-pt]').forEach((p) => p.classList.toggle('lit', Number(p.dataset.pt) === tb.point));
    const lit = T.q(`[data-pt="${tb.point}"]`);
    if (tb.point && lit) puck.style.left = `${lit.offsetLeft + lit.offsetWidth / 2}px`;
    else puck.style.left = '';
  };
  draw();

  const place = (id: CrapsBet) => {
    if (rolling) return;
    const why = crapsCanBet(tb, id);
    if (why) return toast(why, { icon: '🎲' });
    let amt = T.bet();
    if (id === 'passOdds' || id === 'dontOdds') {
      const room = crapsOddsRoom(tb, id);
      amt = Math.min(amt, room);
      if (amt < BET.min) return toast(room ? `Odds max is 2× your line bet` : 'Odds are maxed out', { icon: '🎲' });
    }
    if ((tb.bets[id] ?? 0) + amt > BET.max) return toast(`Table limit is ${$(BET.max)} a spot`, { icon: '🎲', tone: 'bad' });
    if (!T.take(amt)) return;
    tb.bets[id] = (tb.bets[id] ?? 0) + amt;
    staked[id] = (staked[id] ?? 0) + amt;
    sfx.coin();
    draw();
    const spot = T.q(`[data-spot="${id}"]`);
    spot.classList.remove('cr-drop');
    void spot.offsetWidth;
    spot.classList.add('cr-drop');
  };

  /** Pay a roll's winners; returns total won over the stakes of the settled bets. */
  const settle = (res: ReturnType<typeof crapsRoll>) => {
    let back = 0, put = 0;
    for (const [k, v] of Object.entries(res.returned) as [CrapsBet, number][]) (back += v), (put += staked[k] ?? 0), delete staked[k];
    for (const k of res.lost) (put += staked[k] ?? 0), delete staked[k];
    if (back > 0) T.pay(back, put);
    return { back, put };
  };

  const roll = async () => {
    if (rolling) return;
    if (!Object.keys(tb.bets).length) return toast('Place a bet first', { icon: '🎲' });
    rolling = true;
    const dice = rollDice();
    const res = crapsRoll(tb, dice);
    const owed = T.owe(() => settle(res));
    msg.textContent = tb.point === null && res.point === null ? 'Coming out…' : 'Dice are out…';
    const box = T.q('[data-dice]');
    box.classList.remove('land');
    box.classList.add('tumble');
    const ticks = calm() ? 3 : 9;
    for (let k = 0; k < ticks; k++) {
      box.innerHTML = dieHtml(1 + Math.floor(Math.random() * 6)) + dieHtml(1 + Math.floor(Math.random() * 6));
      sfx.tick();
      await T.wait(70 + k * 12);
    }
    box.classList.remove('tumble');
    box.innerHTML = dieHtml(dice[0]) + dieHtml(dice[1]);
    void box.offsetWidth;
    box.classList.add('land');
    sfx.card();
    await T.wait(320);
    const before = s.money;
    owed();
    const won = s.money - before;
    const sum = dice[0] + dice[1];
    const lostAny = res.lost.length > 0;
    if (/Hit the point/.test(res.call)) streak++;
    if (res.call === 'Seven out') streak = 0;
    msg.innerHTML = `<span class="cr-sum">${sum}</span> <b>${esc(res.call)}</b>${won ? ` · +${$(won)}` : ''}${streak >= 2 && /Hit/.test(res.call) ? ` · 🔥 ${streak} points in a row` : ''}`;
    if (won > 0) celebrate(T, box, `+${$(won)}`, won >= 20 * T.bet() ? 'big' : 'small');
    else if (lostAny) (sfx.bad(), res.call === 'Seven out' && shakeEl(T.q('.cr-felt')));
    if (res.point && res.point !== null && /Point is/.test(res.call)) (sfx.notify(), popAt(T.q('[data-puck]'), `POINT ${res.point}`, { color: '#fff', size: 22 }));
    draw();
    rolling = false;
  };

  T.el.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const spot = el.closest<HTMLElement>('[data-spot]');
    if (spot) return place(spot.dataset.spot as CrapsBet);
    if (el.closest('[data-roll]')) void roll();
  });

  // Walking away with a bet working: the dealer rolls it out for you (line bets can't come down).
  T.onClose(() => {
    let guard = 0, back = 0;
    while (Object.keys(tb.bets).length && guard++ < 500) back += settle(crapsRoll(tb, rollDice())).back;
    if (guard > 1) toast(back ? `Your bets rode without you: +${$(back)}` : 'Your bets rode without you… and lost', { icon: '🎲' });
  });
}

// ============================================================== 🀄 BACCARAT

export function openBaccarat(host: CasinoHost): void {
  const s = host.state;
  const T = openTable(host, 'baccarat', 'Baccarat', '🀄', 'cg-bac', `
    ${head('🀄', 'Baccarat', s)}
    <div class="felt bac-felt">
      <div class="bac-hands">
        <div class="bac-side" data-side="player"><span class="bac-lbl">PLAYER <i data-pt></i></span><div class="bac-cards" data-cards="player"></div></div>
        <div class="bac-side" data-side="banker"><span class="bac-lbl">BANKER <i data-pt></i></span><div class="bac-cards" data-cards="banker"></div></div>
      </div>
      <p class="cas-msg" aria-live="polite">Bet on Player, Banker or Tie. Closest to 9 wins.</p>
      <div class="bac-road" data-road aria-label="Last results"></div>
    </div>
    <div class="bac-bets">
      <button class="bac-bet player" data-bet="player"><b>PLAYER</b><small>pays 1 to 1</small></button>
      <button class="bac-bet tie" data-bet="tie"><b>TIE</b><small>pays 8 to 1</small></button>
      <button class="bac-bet banker" data-bet="banker"><b>BANKER</b><small>1 to 1, 5% commission</small></button>
    </div>
    ${chipRow('baccarat')}
    <button class="btn primary block cas-go" data-deal>Deal</button>
    <button class="btn block bac-skip" data-skip hidden>Flip them all</button>
    ${leave()}
  `);
  const msg = T.q('.cas-msg');
  let pick: BacBet | null = null;
  let shoe = newBaccaratShoe();
  let dealing = false;
  let skip = false;
  const road: BacBet[] = [];

  const drawRoad = () => {
    T.q('[data-road]').innerHTML = road.slice(-24).map((r) => `<i class="${r}">${r === 'player' ? 'P' : r === 'banker' ? 'B' : 'T'}</i>`).join('');
  };

  /** Peel a face-down card: drag up on it (or tap) when it's yours, otherwise the dealer turns it. */
  const squeeze = (card: HTMLElement, mine: boolean, slow: boolean): Promise<void> =>
    new Promise((done) => {
      const cover = card.querySelector<HTMLElement>('.bac-cover')!;
      let peel = 0;
      let finished = false;
      const set = (p: number) => {
        peel = Math.max(peel, Math.min(1, p));
        cover.style.setProperty('--peel', String(peel));
        if (peel >= 0.72 && !finished) end();
      };
      const end = () => {
        finished = true;
        cover.style.setProperty('--peel', '1');
        card.classList.add('open');
        sfx.card();
        T.later(done, 260);
      };
      if (skip || !mine) {
        // The dealer peels: slowly for the card that decides it.
        const dur = skip || calm() ? 120 : slow ? 1700 : 650;
        const t0 = performance.now();
        let lastTick = 0;
        const step = () => {
          if (!T.alive()) return;
          const k = (performance.now() - t0) / dur;
          // The slow one: peel a third, hold it there (the peek), then turn it over.
          const eased = !slow ? k : k < 0.4 ? (k / 0.4) * 0.3 : k < 0.75 ? 0.3 : 0.3 + ((k - 0.75) / 0.25) * 0.7;
          set(eased);
          if (Math.floor(eased * 8) > lastTick) (lastTick = Math.floor(eased * 8)), sfx.tick();
          if (!finished) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        return;
      }
      card.classList.add('yours');
      let y0 = 0;
      let dragging = false;
      card.onpointerdown = (e) => {
        dragging = true;
        y0 = e.clientY;
        card.setPointerCapture(e.pointerId);
      };
      card.onpointermove = (e) => {
        if (!dragging) return;
        const p = (y0 - e.clientY) / card.offsetHeight;
        if (p > peel + 0.06) sfx.tick();
        set(p);
      };
      card.onpointerup = () => {
        dragging = false;
        if (peel < 0.05) end(); // a tap flips it
      };
      const watch = () => {
        if (skip && !finished) end();
        else if (!finished && T.alive()) T.later(watch, 120);
      };
      watch();
    });

  const bacCard = (c: Card, k: number, third = false) => {
    const red = c.suit === '♥' || c.suit === '♦';
    return `<div class="bac-card${third ? ' third' : ''}" style="--i:${k}"><div class="cg-f${red ? ' red' : ''}"><b>${c.rank}</b><span>${c.suit}</span><em>${c.suit}</em></div><div class="bac-cover" style="--peel:0"></div></div>`;
  };

  const deal = async () => {
    if (dealing) return;
    if (!pick) return toast('Pick Player, Banker or Tie', { icon: '🀄' });
    const b = T.bet();
    if (!T.take(b)) return;
    dealing = true;
    skip = false;
    sfx.coin();
    if (shoe.length < 20) (shoe = newBaccaratShoe()), toast('Fresh shoe', { icon: '🀄' });
    const bet = pick;
    const co = dealBaccarat(shoe);
    const ret = Math.floor(b * baccaratReturn(bet, co.winner));
    const owed = T.owe(() => T.pay(ret, b));
    T.q('[data-deal]').hidden = true;
    T.q('[data-skip]').hidden = false;
    T.qa('.bac-side').forEach((x) => x.classList.remove('win'));
    T.qa('[data-pt]').forEach((x) => (x.textContent = ''));
    const P = T.q('[data-cards="player"]'), B = T.q('[data-cards="banker"]');
    P.innerHTML = '';
    B.innerHTML = '';
    // Deal P, B, P, B face down.
    const order: [HTMLElement, Card][] = [[P, co.player[0]], [B, co.banker[0]], [P, co.player[1]], [B, co.banker[1]]];
    for (const [k, [el, c]] of order.entries()) {
      el.insertAdjacentHTML('beforeend', bacCard(c, k >> 1));
      sfx.card();
      await T.wait(skip ? 40 : 220);
    }
    const mySide: 'player' | 'banker' = bet === 'banker' ? 'banker' : 'player';
    const total = (side: 'player' | 'banker', n: number) => {
      const cards = (side === 'player' ? co.player : co.banker).slice(0, n);
      T.q(`[data-side="${side}"] [data-pt]`).textContent = String(bacTotal(cards));
    };
    msg.textContent = mySide === 'player' ? 'Your side: drag the cards up to squeeze them (or tap).' : 'You’re the banker: squeeze yours.';
    // Player's side first, then the banker's.
    for (const side of ['player', 'banker'] as const) {
      const els = [...T.q(`[data-cards="${side}"]`).children] as HTMLElement[];
      for (let k = 0; k < 2; k++) await squeeze(els[k], side === mySide, false);
      total(side, 2);
    }
    if (co.natural) {
      msg.innerHTML = `<b>Natural ${Math.max(co.playerTotal, co.bankerTotal)}!</b>`;
      sfx.notify();
      await T.wait(500);
    }
    // Third cards: the drama.
    if (co.player.length === 3) {
      msg.textContent = 'Player draws…';
      P.insertAdjacentHTML('beforeend', bacCard(co.player[2], 2, true));
      sfx.card();
      await T.wait(300);
      await squeeze(P.lastElementChild as HTMLElement, mySide === 'player', true);
      total('player', 3);
    }
    if (co.banker.length === 3) {
      msg.textContent = 'Banker draws…';
      B.insertAdjacentHTML('beforeend', bacCard(co.banker[2], 2, true));
      sfx.card();
      await T.wait(300);
      await squeeze(B.lastElementChild as HTMLElement, mySide === 'banker', true);
      total('banker', 3);
    }
    await T.wait(250);
    owed();
    road.push(co.winner);
    drawRoad();
    if (co.winner !== 'tie') T.q(`[data-side="${co.winner}"]`).classList.add('win');
    const word = co.winner === 'tie' ? `Tie, ${co.playerTotal} all` : `${co.winner === 'player' ? 'Player' : 'Banker'} wins, ${Math.max(co.playerTotal, co.bankerTotal)} over ${Math.min(co.playerTotal, co.bankerTotal)}`;
    const net = ret - b;
    msg.innerHTML = `<b>${word}.</b> ${net > 0 ? `+${$(net)}` : net === 0 ? 'Push, bet back.' : `−${$(b)}`}`;
    if (net > 0) celebrate(T, T.q('.bac-hands'), `+${$(net)}`, bet === 'tie' ? 'big' : 'small');
    else if (net < 0) sfx.bad();
    T.q('[data-deal]').hidden = false;
    T.q('[data-skip]').hidden = true;
    dealing = false;
  };

  T.el.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const bt = el.closest<HTMLElement>('[data-bet]');
    if (bt && !dealing) {
      sfx.tap();
      pick = bt.dataset.bet as BacBet;
      T.qa('[data-bet]').forEach((x) => x.classList.toggle('on', x === bt));
      msg.textContent = `On ${pick === 'player' ? 'Player' : pick === 'banker' ? 'Banker' : 'the Tie'}. Deal when ready.`;
      return;
    }
    if (el.closest('[data-skip]')) return void (skip = true);
    if (el.closest('[data-deal]')) void deal();
  });
}

// =============================================================== 🎡 BIG SIX

export function openBigSix(host: CasinoHost): void {
  const s = host.state;
  const n = SIX_WHEEL.length;
  const step = 360 / n;
  const grad = SIX_WHEEL.map((sym, i) => `${SIX_BY[sym].color} ${i * step}deg ${(i + 1) * step}deg`).join(',');
  const labels = SIX_WHEEL.map((sym, i) => `<span class="six-seg" style="transform:rotate(${i * step}deg)"><i>${SIX_BY[sym].label.replace('$', '')}</i></span>`).join('');
  const T = openTable(host, 'bigsix', 'Big Six', '🎡', 'cg-six', `
    ${head('🎡', 'Big Six Wheel', s)}
    <div class="six-wrap">
      <div class="six-lights" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<b style="transform:rotate(${i * 15}deg)"></b>`).join('')}</div>
      <div class="six-wheel" data-wheel style="background:conic-gradient(from ${-step / 2}deg, ${grad})">${labels}<div class="six-hub">🗽</div></div>
      <div class="six-flap" data-flap aria-hidden="true"></div>
    </div>
    <p class="cas-msg" aria-live="polite">Pick one or more spots. Your chip goes on each.</p>
    <div class="six-bets">${SIX.map((x) => `<button class="six-bet" data-six="${x.sym}" style="--c:${x.color}"><b>${x.label}</b><small>${x.pays} to 1</small></button>`).join('')}</div>
    ${chipRow('bigsix')}
    <button class="btn primary block cas-go" data-spin>Spin the wheel</button>
    ${leave()}
  `);
  const msg = T.q('.cas-msg');
  const wheel = T.q('[data-wheel]');
  const flap = T.q('[data-flap]');
  const picks = new Set<SixSym>();
  let angle = 0;
  let spinning = false;

  const spin = async () => {
    if (spinning) return;
    if (!picks.size) return toast('Pick a spot first', { icon: '🎡' });
    const b = T.bet();
    const bets: SixSym[] = [];
    for (const p of picks) {
      if (!T.take(b)) break;
      bets.push(p);
    }
    if (!bets.length) return;
    spinning = true;
    sfx.coin();
    const idx = spinBigSix();
    const sym = SIX_WHEEL[idx];
    const ret = bets.reduce((a, p) => a + b * bigSixReturn(p, sym), 0);
    const owed = T.owe(() => T.pay(ret, b * bets.length));
    // Land segment idx under the flapper (top), somewhere inside the segment.
    const from = angle;
    const target = -idx * step + rnd(-step * 0.36, step * 0.36);
    const base = Math.ceil((from + 360 * 5) / 360) * 360;
    const to = base + ((target % 360) + 360) % 360;
    const dur = calm() ? 1800 : 6200;
    msg.textContent = 'Round and round she goes…';
    T.q('.six-lights').classList.add('chase');
    let lastSeg = Math.floor((from + step / 2) / step);
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const frame = () => {
        if (!T.alive()) return;
        const k = Math.min(1, (performance.now() - t0) / dur);
        // Fast start, long slow finish.
        const e = 1 - Math.pow(1 - k, 4);
        angle = from + (to - from) * e;
        wheel.style.transform = `rotate(${angle}deg)`;
        const seg = Math.floor((angle + step / 2) / step);
        if (seg !== lastSeg) {
          lastSeg = seg;
          sfx.tick();
          flap.classList.remove('kick');
          void flap.offsetWidth;
          flap.classList.add('kick');
        }
        if (k < 1) requestAnimationFrame(frame);
        else done();
      };
      requestAnimationFrame(frame);
    });
    angle %= 360;
    wheel.style.transform = `rotate(${angle}deg)`;
    T.q('.six-lights').classList.remove('chase');
    owed();
    const x = SIX_BY[sym];
    const hit = T.q(`[data-six="${sym}"]`);
    hit.classList.add('hit');
    T.later(() => hit.classList.remove('hit'), 2200);
    const net = ret - b * bets.length;
    msg.innerHTML = `It’s <b>${x.label}</b>! ${ret ? `You win ${$(ret - b)} on ${x.label}.` : 'House wins.'}`;
    if (ret) celebrate(T, T.q('.six-wrap'), `+${$(Math.max(net, ret - b))}`, x.pays >= 40 ? 'huge' : x.pays >= 10 ? 'big' : 'small');
    else sfx.bad();
    spinning = false;
  };

  T.el.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const bt = el.closest<HTMLElement>('[data-six]');
    if (bt && !spinning) {
      sfx.tap();
      const sym = bt.dataset.six as SixSym;
      if (picks.has(sym)) picks.delete(sym);
      else picks.add(sym);
      bt.classList.toggle('on', picks.has(sym));
      msg.textContent = picks.size ? `${picks.size} spot${picks.size > 1 ? 's' : ''} · ${$(T.bet() * picks.size)} a spin` : 'Pick one or more spots.';
      return;
    }
    if (el.closest('[data-spin]')) void spin();
  });
}

// ============================================================ 🎟️ SCRATCHERS

export function openScratch(host: CasinoHost): void {
  const s = host.state;
  const T = openTable(host, 'scratch', 'Scratchers', '🎟️', 'cg-scratch', `
    ${head('🎟️', 'Scratchers', s)}
    <div class="sc-shop" data-shop>${SCRATCHERS.map((t) => `<button class="sc-tix" data-tix="${t.id}" style="--a:${t.colors[0]};--b:${t.colors[1]}"><span class="sc-em">${t.emoji}</span><b>${esc(t.name)}</b><small>Top prize ${$(t.price * t.prizes[t.prizes.length - 1].mult)}</small><i>${$(t.price)}</i></button>`).join('')}</div>
    <div class="sc-play" data-play hidden>
      <div class="sc-ticket" data-ticket>
        <div class="sc-top"><span data-tname></span><small>Match 3 amounts, win that amount</small></div>
        <div class="sc-area"><div class="sc-grid" data-grid></div><canvas class="sc-foil" data-foil></canvas></div>
        <div class="sc-foot">In-game cash only · Odds of winning about 1 in 4</div>
      </div>
      <button class="btn block" data-reveal>Reveal all</button>
    </div>
    <p class="cas-msg" aria-live="polite">Pick a ticket. Scratch with your finger.</p>
    <button class="btn primary block cas-go" data-again hidden>Another one</button>
    ${leave('Back to the floor')}
  `);
  const msg = T.q('.cas-msg');
  const cv = T.q<HTMLCanvasElement>('[data-foil]');
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  let card: ScratchCard | null = null;
  let price = 0;
  let owed: (() => void) | null = null;
  let done = true;
  let lastSound = 0;
  let moves = 0;
  let lastTix = SCRATCHERS[0].id;

  const paintFoil = (a: string) => {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(10, Math.round(r.width * dpr));
    cv.height = Math.max(10, Math.round(r.height * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    const w = r.width, h = r.height;
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#d9dde3');
    grd.addColorStop(0.35, '#f7f8fa');
    grd.addColorStop(0.55, '#aab1bc');
    grd.addColorStop(1, '#e3e6ea');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.18;
    g.fillStyle = a;
    for (let y = 0; y < h; y += 26) for (let x = (y / 26) % 2 ? 13 : 0; x < w; x += 26) g.fillRect(x, y, 13, 13);
    g.globalAlpha = 1;
    g.fillStyle = '#5b6170';
    g.font = '900 15px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let k = 0; k < 3; k++) g.fillText('✨ SCRATCH HERE ✨', w / 2, (h * (k + 0.5)) / 3);
  };

  const scratchAt = (x: number, y: number, px?: number, py?: number) => {
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    g.lineWidth = 34;
    g.beginPath();
    g.moveTo(px ?? x, py ?? y);
    g.lineTo(x, y);
    g.stroke();
    const now = performance.now();
    if (now - lastSound > 90) (sfx.card(), (lastSound = now));
    if (++moves % 8 === 0) checkCleared();
  };

  const checkCleared = () => {
    if (done) return;
    const { width: w, height: h } = cv;
    const data = g.getImageData(0, 0, w, h).data;
    let clear = 0, total = 0;
    for (let i = 3; i < data.length; i += 4 * 37) (total++, data[i] < 40 && clear++);
    if (clear / total > 0.62) finish();
  };

  const finish = () => {
    if (done || !card) return;
    done = true;
    cv.classList.add('gone');
    owed?.();
    owed = null;
    T.q('[data-reveal]').hidden = true;
    T.q('[data-again]').hidden = false;
    const cells = T.qa('.sc-cell');
    if (card.prize) {
      card.winCells.forEach((i, k) => T.later(() => cells[i].classList.add('win'), k * 160));
      const mult = card.prize / price;
      msg.innerHTML = `<b>WINNER! ${$(card.prize)}</b>${mult >= 25 ? ' 🤯' : mult >= 5 ? ' 🎉' : ''}`;
      T.later(() => celebrate(T, T.q('[data-ticket]'), `+${$(card!.prize)}`, mult >= 25 ? 'huge' : mult >= 5 ? 'big' : 'small'), 500);
    } else {
      // Point out a near miss if there is one (two of a big amount).
      const counts = new Map<number, number>();
      for (const c of card.cells) counts.set(c, (counts.get(c) ?? 0) + 1);
      const near = [...counts].filter(([, n]) => n === 2).sort((a, b) => b[0] - a[0])[0];
      msg.innerHTML = near && near[0] >= price * 25 ? `Two ${$(near[0])}s… <b>so close.</b> 😩` : 'Not a winner. Ticket goes in the trash.';
      sfx.bad();
    }
  };

  const buy = (id: string) => {
    if (!done) return;
    const t = SCRATCHERS.find((x) => x.id === id)!;
    if (!T.take(t.price)) return;
    lastTix = id;
    sfx.cash();
    price = t.price;
    card = printScratch(t);
    const won = card.prize;
    owed = T.owe(() => T.pay(won, t.price));
    done = false;
    moves = 0;
    T.q('[data-shop]').hidden = true;
    T.q('[data-play]').hidden = false;
    T.q('[data-again]').hidden = true;
    T.q('[data-reveal]').hidden = false;
    const ticket = T.q('[data-ticket]');
    ticket.style.setProperty('--a', t.colors[0]);
    ticket.style.setProperty('--b', t.colors[1]);
    ticket.classList.remove('deal');
    void ticket.offsetWidth;
    ticket.classList.add('deal');
    T.q('[data-tname]').textContent = `${t.emoji} ${t.name}`;
    const icon = (v: number) => (v >= price * 500 ? '💎' : v >= price * 100 ? '👑' : v >= price * 25 ? '🗽' : v >= price * 10 ? '💰' : v >= price * 5 ? '🍎' : v >= price * 2 ? '🚕' : '🍕');
    T.q('[data-grid]').innerHTML = card.cells.map((v) => `<div class="sc-cell"><span>${icon(v)}</span><b>${$(v)}</b></div>`).join('');
    cv.classList.remove('gone');
    requestAnimationFrame(() => paintFoil(t.colors[0]));
    msg.textContent = `${t.name}: scratch the silver.`;
  };

  let prev: [number, number] | null = null;
  const pos = (e: PointerEvent): [number, number] => {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  cv.addEventListener('pointerdown', (e) => {
    if (done) return;
    cv.setPointerCapture(e.pointerId);
    prev = pos(e);
    scratchAt(...prev);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!prev || done) return;
    const p = pos(e);
    scratchAt(p[0], p[1], prev[0], prev[1]);
    prev = p;
  });
  const up = () => ((prev = null), checkCleared());
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  T.el.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const tix = el.closest<HTMLElement>('[data-tix]');
    if (tix) return buy(tix.dataset.tix!);
    if (el.closest('[data-reveal]')) return finish();
    if (el.closest('[data-again]')) {
      T.q('[data-shop]').hidden = false;
      T.q('[data-play]').hidden = true;
      T.q('[data-again]').hidden = true;
      T.q(`[data-tix="${lastTix}"]`).focus();
      msg.textContent = 'Pick a ticket.';
    }
  });
  T.onClose(() => {
    if (!done && card?.prize) toast(`Your ticket was a winner: ${$(card.prize)}`, { icon: '🎟️', tone: 'good' });
  });
}

// ================================================================== 🔢 KENO

export function openKeno(host: CasinoHost): void {
  const s = host.state;
  const T = openTable(host, 'keno', 'Keno', '🔢', 'cg-keno', `
    ${head('🔢', 'Keno', s)}
    <div class="kn-board">
      <div class="kn-ball" data-ball aria-live="off"><span>?</span></div>
      <div class="kn-stats"><span>Picked <b data-picked>0</b>/10</span><span>Drawn <b data-drawn>0</b>/20</span><span>Hits <b data-hits>0</b></span></div>
    </div>
    <div class="kn-grid" data-grid>${Array.from({ length: KENO.numbers }, (_, i) => `<button class="kn-n" data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
    <div class="kn-pay" data-pay></div>
    <p class="cas-msg" aria-live="polite">Pick 1 to 10 numbers. Twenty balls get drawn.</p>
    <div class="kn-tools"><button class="btn" data-quick>🎲 Quick pick</button><button class="btn" data-clear>Clear</button></div>
    ${chipRow('keno')}
    <button class="btn primary block cas-go" data-play>Draw</button>
    ${leave()}
  `);
  const msg = T.q('.cas-msg');
  const picks = new Set<number>();
  let drawing = false;
  let quickSize = 6;

  const drawPay = (hits = -1) => {
    const n = picks.size;
    T.q('[data-picked]').textContent = String(n);
    if (!n) return void (T.q('[data-pay]').innerHTML = '<small>The pay table shows up once you pick.</small>');
    const rows = Object.entries(KENO_PAY[n]).sort((a, b) => Number(b[0]) - Number(a[0]));
    T.q('[data-pay]').innerHTML = `<small>${n}-spot pays (per ${$(T.bet())})</small>${rows.map(([k, v]) => `<span class="${Number(k) === hits ? 'on' : ''}"><i>${k} hit${k === '1' ? '' : 's'}</i><b>${$(Math.round(v * T.bet()))}</b></span>`).join('')}`;
  };
  drawPay();

  const reset = () => T.qa('.kn-n').forEach((b) => b.classList.remove('drawn', 'hit', 'pop'));

  const play = async () => {
    if (drawing) return;
    if (!picks.size) return toast('Pick at least one number', { icon: '🔢' });
    const b = T.bet();
    if (!T.take(b)) return;
    drawing = true;
    sfx.coin();
    reset();
    const mine = [...picks];
    const drawn = drawKeno();
    const hitsTotal = drawn.filter((x) => picks.has(x)).length;
    const ret = Math.floor(b * kenoReturn(mine.length, hitsTotal));
    const owed = T.owe(() => T.pay(ret, b));
    const ball = T.q('[data-ball]');
    const best = Math.max(...Object.keys(KENO_PAY[mine.length]).map(Number));
    let hits = 0;
    msg.textContent = 'Drawing…';
    for (let k = 0; k < drawn.length; k++) {
      const x = drawn[k];
      const cell = T.q(`[data-n="${x}"]`);
      const hit = picks.has(x);
      ball.innerHTML = `<span>${x}</span>`;
      ball.classList.remove('roll', 'hit');
      void ball.offsetWidth;
      ball.classList.add('roll');
      cell.classList.add('drawn');
      if (hit) {
        hits++;
        cell.classList.add('hit', 'pop');
        ball.classList.add('hit');
        sfx.note(523 * Math.pow(2, hits / 6));
        if (hits >= 3 && !calm()) burstAt(cell, '✨', 4);
      } else sfx.tick();
      T.q('[data-drawn]').textContent = String(k + 1);
      T.q('[data-hits]').textContent = String(hits);
      drawPay(hits);
      // Tension: one more hit would pay (or pay more).
      const now = kenoReturn(mine.length, hits), next = kenoReturn(mine.length, hits + 1);
      const left = drawn.length - k - 1;
      if (left > 0 && next > now && hits + 1 <= best) msg.innerHTML = `${hits} hit${hits === 1 ? '' : 's'}. <b>One more pays ${$(Math.round(next * b))}!</b> (${left} to go)`;
      else msg.textContent = `${hits} hit${hits === 1 ? '' : 's'}… ${left} to go`;
      // Slow down near the end when it's close.
      await T.wait(calm() ? 60 : left < 4 && next > now ? 520 : 210);
    }
    owed();
    const net = ret - b;
    msg.innerHTML = ret ? `<b>${hits} of ${mine.length}! You win ${$(ret)}</b>` : `${hits} of ${mine.length}. No win this time.`;
    if (ret > b) celebrate(T, T.q('[data-ball]'), `+${$(net)}`, sizeOf(ret, b));
    else if (ret) sfx.win();
    else sfx.bad();
    drawing = false;
  };

  T.el.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const c = el.closest<HTMLElement>('[data-n]');
    if (c && !drawing) {
      const n = Number(c.dataset.n);
      if (picks.has(n)) picks.delete(n);
      else if (picks.size >= KENO.maxSpots) return toast('Ten numbers max', { icon: '🔢' });
      else picks.add(n);
      sfx.tap();
      reset();
      c.classList.toggle('pick', picks.has(n));
      drawPay();
      return;
    }
    if (el.closest('.chip')) return void requestAnimationFrame(() => drawPay());
    if (drawing) return;
    if (el.closest('[data-clear]')) {
      picks.clear();
      T.qa('.kn-n').forEach((b) => b.classList.remove('pick', 'drawn', 'hit', 'pop'));
      return drawPay();
    }
    if (el.closest('[data-quick]')) {
      if (picks.size) quickSize = picks.size;
      picks.clear();
      while (picks.size < quickSize) picks.add(1 + Math.floor(Math.random() * KENO.numbers));
      sfx.tap();
      reset();
      T.qa('.kn-n').forEach((b) => b.classList.toggle('pick', picks.has(Number(b.dataset.n))));
      return drawPay();
    }
    if (el.closest('[data-play]')) void play();
  });
}

// ================================================================ 🔻 PLINKO

export function openPlinko(host: CasinoHost): void {
  const s = host.state;
  const T = openTable(host, 'plinko', 'Plinko', '🔻', 'cg-plinko', `
    ${head('🔻', 'Plinko', s)}
    <div class="pl-board"><canvas data-cv></canvas></div>
    <div class="pl-recent" data-recent></div>
    <div class="cg-seg" role="radiogroup" aria-label="Risk">${(['low', 'medium', 'high'] as PlinkoRisk[]).map((r) => `<button data-risk="${r}" class="${r === 'medium' ? 'on' : ''}">${r === 'low' ? '🟢 Low' : r === 'medium' ? '🟡 Medium' : '🔴 High'} risk</button>`).join('')}</div>
    <p class="cas-msg" aria-live="polite">Drop a ball. Edges pay big, the middle pays small.</p>
    ${chipRow('plinko')}
    <button class="btn primary block cas-go" data-drop>Drop ball</button>
    ${leave()}
  `);
  const msg = T.q('.cas-msg');
  const cv = T.q<HTMLCanvasElement>('[data-cv]');
  const g = cv.getContext('2d')!;
  let risk: PlinkoRisk = 'medium';
  const W = 360, H = 330;
  const rows = PLINKO_ROWS;
  const dx = W / (rows + 3);
  const top = 26, dy = (H - top - 52) / rows;
  const pegX = (r: number, j: number) => W / 2 + (j - (r + 2) / 2) * dx;
  const pegY = (r: number) => top + r * dy;
  const slotX = (k: number) => W / 2 + (k - rows / 2) * dx;
  const slotY = top + rows * dy + 14;
  const glow = new Map<string, number>();
  const slotBump = new Array<number>(rows + 1).fill(0);
  interface Ball { path: (0 | 1)[]; slot: number; t0: number; done: boolean; stake: number; settle: () => void; hue: number }
  const balls: Ball[] = [];
  let raf = 0;
  const ROW_MS = calm() ? 60 : 125;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr;
  cv.height = H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const slotColor = (m: number) => (m >= 10 ? '#ff4d5e' : m >= 3 ? '#ff8a3d' : m >= 1.5 ? '#ffb93d' : m >= 1 ? '#ffd23f' : '#f2e6a6');

  const render = (now: number) => {
    g.clearRect(0, 0, W, H);
    // Pegs.
    for (let r = 0; r < rows; r++)
      for (let j = 0; j < r + 3; j++) {
        const key = `${r}:${j}`;
        const gl = glow.get(key) ?? 0;
        const k = Math.max(0, 1 - (now - gl) / 350);
        g.beginPath();
        g.arc(pegX(r, j), pegY(r), 3.2 + k * 2, 0, Math.PI * 2);
        g.fillStyle = k > 0 ? `rgba(255,210,63,${0.5 + k / 2})` : '#e8ecff';
        g.fill();
        if (k > 0) {
          g.beginPath();
          g.arc(pegX(r, j), pegY(r), 9 * k + 3, 0, Math.PI * 2);
          g.fillStyle = `rgba(255,210,63,${k * 0.25})`;
          g.fill();
        }
      }
    // Slots.
    const mults = PLINKO[risk];
    for (let k = 0; k <= rows; k++) {
      const b = Math.max(0, 1 - (now - slotBump[k]) / 400);
      const x = slotX(k), y = slotY + b * 6;
      g.fillStyle = slotColor(mults[k]);
      g.beginPath();
      g.roundRect(x - dx / 2 + 1.5, y - 11, dx - 3, 24, 5);
      g.fill();
      g.fillStyle = '#1c2340';
      g.font = `900 ${mults[k] >= 100 ? 8.5 : 9.5}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`${mults[k]}×`, x, y + 1);
    }
    // Balls.
    let live = false;
    for (const ball of balls) {
      if (ball.done) continue;
      live = true;
      const e = (now - ball.t0) / ROW_MS;
      const r = Math.floor(e);
      const f = e - r;
      let rights = 0;
      for (let k = 0; k < Math.min(r, rows); k++) rights += ball.path[k];
      let x: number, y: number;
      if (r < 0) {
        // Dropping in from the top.
        const f2 = e + 1;
        x = W / 2;
        y = top - 30 + (pegY(0) - 8 - (top - 30)) * f2 * f2;
      }
      else if (r < rows) {
        // From above peg (r, rights+1) hop to above the next row's peg.
        const x0 = pegX(r, rights + 1), y0 = pegY(r) - 8;
        const dir = ball.path[r] ? 1 : -1;
        const x1 = x0 + (dir * dx) / 2, y1 = (r + 1 < rows ? pegY(r + 1) : slotY) - 8;
        x = x0 + (x1 - x0) * f;
        y = y0 + (y1 - y0) * f * f - Math.sin(f * Math.PI) * dy * 0.35;
        const key = `${r}:${rights + 1}`;
        if (f < 0.25 && (glow.get(key) ?? 0) < ball.t0 + r * ROW_MS) (glow.set(key, now), sfx.note(330 + r * 40 + Math.random() * 30));
      } else {
        ball.done = true;
        slotBump[ball.slot] = now;
        landed(ball);
        continue;
      }
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fillStyle = `hsl(${ball.hue} 95% 60%)`;
      g.shadowColor = `hsl(${ball.hue} 95% 60%)`;
      g.shadowBlur = 10;
      g.fill();
      g.shadowBlur = 0;
    }
    for (let i = balls.length - 1; i >= 0; i--) if (balls[i].done) balls.splice(i, 1);
    const pending = slotBump.some((t) => now - t < 400) || [...glow.values()].some((t) => now - t < 350);
    if (live || pending) raf = requestAnimationFrame(render);
    else raf = 0;
  };
  const kick = () => raf || (raf = requestAnimationFrame(render));
  requestAnimationFrame(render);

  const recent: number[] = [];
  const landed = (ball: Ball) => {
    ball.settle();
    const m = PLINKO[risk][ball.slot];
    recent.unshift(m);
    recent.length = Math.min(recent.length, 8);
    T.q('[data-recent]').innerHTML = recent.map((x) => `<i style="background:${slotColor(x)}">${x}×</i>`).join('');
    const won = Math.floor(ball.stake * m);
    const at = T.q('.pl-board');
    msg.innerHTML = `<b>${m}×</b> ${won >= ball.stake ? `· +${$(won - ball.stake)}` : `· ${$(won)} back`}`;
    if (m >= 10) celebrate(T, at, `${m}×!`, m >= 24 ? 'huge' : 'big');
    else if (m > 1) (sfx.win(), popAt(at, `${m}×`, { color: '#7bd88f', y: at.offsetHeight - 30, x: (slotX(ball.slot) / W) * at.offsetWidth, size: 22 }));
    else sfx.tick();
  };

  T.el.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const rk = el.closest<HTMLElement>('[data-risk]');
    if (rk) {
      if (balls.length) return toast('Wait for the balls to land', { icon: '🔻' });
      sfx.tap();
      risk = rk.dataset.risk as PlinkoRisk;
      T.qa('[data-risk]').forEach((b) => b.classList.toggle('on', b === rk));
      kick();
      return;
    }
    if (!el.closest('[data-drop]')) return;
    if (balls.length >= 12) return;
    const b = T.bet();
    if (!T.take(b)) return;
    sfx.coin();
    const d = plinkoDrop();
    const m = PLINKO[risk][d.slot];
    const ret = Math.floor(b * m);
    balls.push({ ...d, t0: performance.now() + ROW_MS, done: false, stake: b, settle: T.owe(() => T.pay(ret, b)), hue: 40 + Math.random() * 300 });
    kick();
  });
  T.onClose(() => cancelAnimationFrame(raf));
}

// ========================================================== 🃏 VIDEO POKER

export function openVideoPoker(host: CasinoHost): void {
  const s = host.state;
  const T = openTable(host, 'videopoker', 'Video Poker', '🃏', 'cg-vp', `
    ${head('🃏', 'Jacks or Better', s)}
    <div class="vp-screen">
      <div class="vp-pays" data-pays>${VP_PAYS.map((p) => `<div data-row="${p.key}"><span>${p.name}</span><b data-pv="${p.key}"></b></div>`).join('')}</div>
      <div class="vp-cards" data-cards>${Array.from({ length: 5 }, (_, i) => `<button class="vp-slot" data-hold="${i}" aria-pressed="false">${cardHtml(null, { cls: 'vp' })}<span class="vp-held">HELD</span></button>`).join('')}</div>
      <p class="cas-msg vp-msg" aria-live="polite">Deal, hold what you like, draw once.</p>
    </div>
    ${chipRow('videopoker')}
    <div class="vp-acts"><button class="btn" data-hint>💡 Hint</button><button class="btn primary cas-go" data-go>Deal</button></div>
    ${leave()}
  `);
  const msg = T.q('.vp-msg');
  let r: VpRound | null = null;
  let stakeAmt = 0;
  let busy = false;

  const drawPays = (b: number, hot?: string) => {
    for (const p of VP_PAYS) T.q(`[data-pv="${p.key}"]`).textContent = $(p.pays * b);
    T.qa('[data-row]').forEach((x) => x.classList.toggle('on', x.dataset.row === hot));
  };
  drawPays(T.bet());

  const showHand = async (which: boolean[]) => {
    const slots = T.qa('[data-hold]');
    for (let i = 0; i < 5; i++) {
      if (!which[i]) continue;
      slots[i].querySelector('.cg-card')!.outerHTML = cardHtml(r!.hand[i], { down: true, cls: 'vp' });
    }
    await T.wait(60);
    for (let i = 0; i < 5; i++) {
      if (!which[i]) continue;
      flip(slots[i].querySelector('.cg-card'));
      sfx.card();
      await T.wait(calm() ? 30 : 120);
    }
  };

  const setHolds = () => T.qa('[data-hold]').forEach((b, i) => (b.classList.toggle('held', !!r?.held[i]), b.setAttribute('aria-pressed', String(!!r?.held[i]))));

  const go = async () => {
    if (busy) return;
    busy = true;
    if (!r || r.drawn) {
      const b = T.bet();
      if (!T.take(b)) return void (busy = false);
      sfx.coin();
      stakeAmt = b;
      drawPays(b);
      r = vpDeal();
      setHolds();
      await showHand([true, true, true, true, true]);
      const made = vpEvaluate(r.hand);
      drawPays(b, made?.key);
      msg.innerHTML = made ? `<b>${made.name}!</b> Hold your cards and draw.` : 'Tap cards to hold, then draw.';
      T.q('[data-go]').textContent = 'Draw';
    } else {
      const round = r;
      vpDraw(round);
      const made = vpEvaluate(round.hand);
      const ret = made ? made.pays * stakeAmt : 0;
      const owed = T.owe(() => T.pay(ret, stakeAmt));
      await showHand(round.held.map((h) => !h));
      owed();
      drawPays(stakeAmt, made?.key);
      T.q('[data-go]').textContent = 'Deal';
      if (made) {
        msg.innerHTML = `<b>${made.name}!</b> Pays ${$(ret)}`;
        if (ret > stakeAmt) celebrate(T, T.q('[data-cards]'), `+${$(ret - stakeAmt)}`, made.pays >= 25 ? 'huge' : made.pays >= 4 ? 'big' : 'small');
        else (sfx.win(), popAt(T.q('[data-cards]'), 'Bet back', { color: '#7bd88f', size: 20 }));
        if (made.key === 'royal') toast('ROYAL FLUSH. Frame this.', { icon: '👑', tone: 'good' });
      } else {
        msg.textContent = 'No win. Deal again?';
        sfx.bad();
      }
    }
    busy = false;
  };

  T.el.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('.chip') && (!r || r.drawn)) return void requestAnimationFrame(() => drawPays(T.bet()));
    const h = el.closest<HTMLElement>('[data-hold]');
    if (h && r && !r.drawn && !busy) {
      const i = Number(h.dataset.hold);
      r.held[i] = !r.held[i];
      sfx.tap();
      return setHolds();
    }
    if (el.closest('[data-hint]')) {
      if (!r || r.drawn || busy) return toast('Deal first, then ask', { icon: '💡' });
      r.held = vpSuggest(r.hand);
      sfx.notify();
      setHolds();
      msg.textContent = r.held.some(Boolean) ? 'The old-timer at the next machine says: hold these.' : 'Old-timer says: toss them all.';
      return;
    }
    if (el.closest('[data-go]')) void go();
  });

  // Leaving mid-hand plays the draw with your holds (no free exits, no lost hands).
  T.onClose(() => {
    if (!r || r.drawn) return;
    vpDraw(r);
    const made = vpEvaluate(r.hand);
    if (made) {
      payout(s, made.pays * stakeAmt, 'Video Poker');
      toast(`Your draw made ${made.name}: ${$(made.pays * stakeAmt)}`, { icon: '🃏', tone: 'good' });
    }
  });
}
