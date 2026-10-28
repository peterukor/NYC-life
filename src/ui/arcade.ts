// =====================================================================
// arcade.ts (ui) — the cabinet frame (coin, how-to, score, tickets) and
// the prize counter. The games themselves: ui/arcade-games.ts. Scores,
// tickets and prizes: sim/arcade.ts.
//
// Every game is a canvas inside a modal: "insert coin" ($2) → play →
// score, tickets, best. Touch first (taps and swipes), keys work too.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { ARCADE_BY_ID, ARCADE_GAMES, PLAY_COST, PRIZES, bestScore, payToPlay, recordScore, redeem, tickets } from '../sim/arcade.ts';
import { sfx } from './audio.ts';
import { rain, type CasinoHost } from './casino.ts';
import { openModal, openSheet, onAct, toast } from './dom.ts';
import { emoji, H, W } from './arcade-games.ts';
import { RUNS2 } from './arcade-games-2.ts';
import { RUNS3 } from './arcade-classics.ts';

const RUNS = { ...RUNS2, ...RUNS3 };
/** Cabinets that run their own count-in or menu (no 3-2-1 from the frame). */
const OWN_START = new Set(['snake', 'dash', 'pigeons', 'beats']);
import { fetchBoard, postScore, typicalScore } from '../net/scores.ts';
import { boardHtml, openScoreboards } from './scoreboard.ts';



/** Play one cabinet: pay, play, tickets. */
/** Head-to-head with a friend: they play after you (their score is theirs, not rigged). */
export interface Versus { name: string; skill: number; done: (mine: number, theirs: number) => void }

/** On your phone (📱 Games): free, for the high score; tickets only at the arcade. */
export const PHONE_GAMES = ['stack', 'dash', 'pigeons', 'hoops', 'beats', 'snake', 'breakout', 'rooftop'];

export function playArcade(host: CasinoHost, id: string, versus?: Versus, opts: { phone?: boolean } = {}): void {
  const phone = !!opts.phone;
  const game = ARCADE_BY_ID[id];
  const run = RUNS[id];
  if (!game || !run) return;
  const s = host.state;
  const m = openModal(`<div class="arc" style="--cab:${game.color}">
    <div class="arc-top"><b>${game.emoji} ${esc(game.name)}</b><span class="arc-hud" aria-live="off"></span></div>
    <div class="arc-screen"><canvas width="${W}" height="${H}"></canvas>
      <div class="arc-count" aria-live="assertive" hidden></div>
      <div class="arc-over"><div class="big">${game.emoji}</div><p>${esc(game.howTo)}</p><p class="sub">${versus ? `Head-to-head with ${esc(versus.name)}: you go first.` : phone ? `Best: ${bestScore(s, id)} · 📱 free on your phone · 🎟️ tickets only at the arcades` : `Best: ${bestScore(s, id)} · 🎟️ ${tickets(s)}`}</p><button class="btn primary" data-go>${versus ? 'Start' : phone ? '▶️ Play' : `Insert coin · ${money(PLAY_COST)}`}</button></div>
    </div>
    ${id === 'claw' ? '<div class="arc-pad arc-claw"><button data-claw-l aria-label="Move left">◀️</button><button class="btn primary" data-claw-drop>DROP</button><button data-claw-r aria-label="Move right">▶️</button></div>' : ''}
    ${id === 'snake' ? '<div class="arc-pad"><button data-d="0,-1" aria-label="Up">⬆️</button><button data-d="-1,0" aria-label="Left">⬅️</button><button data-d="1,0" aria-label="Right">➡️</button><button data-d="0,1" aria-label="Down">⬇️</button></div>' : ''}
    <button class="btn ghost block" data-close>${phone ? 'Close' : 'Leave the cabinet'}</button>
  </div>`);
  m.el.classList.add('arc-modal');
  const cv = m.el.querySelector('canvas')!;
  const g = cv.getContext('2d')!;
  const overlay = m.el.querySelector<HTMLElement>('.arc-over')!;
  const hudEl = m.el.querySelector<HTMLElement>('.arc-hud')!;
  let stop: (() => void) | null = null;
  // Attract screen.
  g.fillStyle = '#0b0b16';
  g.fillRect(0, 0, W, H);
  emoji(g, game.emoji, W / 2, H / 2 - 60, 110);
  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) {
      stop?.();
      return m.close();
    }
    if (t.closest('[data-board]')) {
      const btn = t.closest<HTMLElement>('[data-board]')!;
      btn.setAttribute('disabled', '');
      void fetchBoard(s, id).then((b) => {
        btn.insertAdjacentHTML('afterend', boardHtml(id, b));
        btn.remove();
      });
      return;
    }
    if (!t.closest('[data-go]')) return;
    // A head-to-head was paid for already (two plays).
    const why = versus || phone ? null : payToPlay(s);
    if (why) return toast(why, { icon: '🕹️', tone: 'bad' });
    sfx.coin();
    host.saved();
    overlay.hidden = true;
    // A 3-2-1 count-in on the cabinet before the game starts (2026-10-28).
    // Games with their own start beat (READY…, STAND CLEAR…, the track menu) skip it.
    if (OWN_START.has(id)) return begin();
    const countEl = m.el.querySelector<HTMLElement>('.arc-count')!;
    countEl.hidden = false;
    let n = 3;
    const tick = () => {
      if (!m.el.isConnected) return;
      countEl.textContent = n > 0 ? String(n) : 'GO!';
      countEl.classList.remove('pop');
      void countEl.offsetWidth;
      countEl.classList.add('pop');
      n > 0 ? sfx.tick() : sfx.coin();
      if (n-- > 0) return void (countTimer = window.setTimeout(tick, 520));
      countTimer = window.setTimeout(() => { countEl.hidden = true; begin(); }, 380);
    };
    let countTimer = 0;
    stop = () => window.clearTimeout(countTimer);
    tick();
  });
  const begin = () => {
    stop = run(cv, g, (score) => {
      stop?.();
      stop = null;
      const r = recordScore(s, id, score, { phone });
      host.saved();
      overlay.hidden = false;
      if (versus) {
        // Their score: around a good score for this game, scaled by their skill, sometimes a fluke either way.
        const typical = typicalScore(id);
        const k = Math.min(1, Math.max(0, versus.skill > 1 ? versus.skill / 3 : versus.skill));
        const raw = typical * (0.45 + k * 0.75) * (0.7 + Math.random() * 0.6);
        const theirs = Math.max(0, typical >= 100 ? Math.round(raw / 10) * 10 : Math.round(raw));
        overlay.innerHTML = `<div class="big">${score > theirs ? '🏆' : score < theirs ? '😤' : '🤝'}</div><h3>${score > theirs ? 'You win!' : score < theirs ? `${esc(versus.name)} wins` : 'A tie'}</h3><p class="arc-vs"><span>You <b>${score}</b></span><span>${esc(versus.name)} <b>${theirs}</b></span></p><p>+${r.tickets} 🎟️</p><button class="btn primary" data-close>Done</button>`;
        const done = versus.done;
        versus = undefined; // once
        done(score, theirs);
        return;
      }
      host.onScore?.(id, score);
      postScore(id, score);
      overlay.innerHTML = phone
        ? `<div class="big">${r.best ? '🏆' : game.emoji}</div><h3>${r.best ? 'New best!' : 'Game over'}</h3><p class="arc-score">${score}</p><p class="sub">At an 🕹️ arcade this would’ve won you ${Math.floor(game.tickets(score))} 🎟️.</p><button class="btn primary" data-go>Play again</button><button class="btn ghost" data-board>🏆 Leaderboard</button>`
        : `<div class="big">${r.best ? '🏆' : game.emoji}</div><h3>${r.best ? 'New best!' : 'Game over'}</h3><p class="arc-score">${score}</p><p>+${r.tickets} 🎟️ · you have ${tickets(s)}</p><button class="btn primary" data-go>Play again · ${money(PLAY_COST)}</button><button class="btn ghost" data-board>🏆 Leaderboard</button>`;
      if (r.best) rain(m.el, '🎟️', 18);
      r.tickets ? sfx.win() : sfx.tap();
    }, (text) => (hudEl.textContent = text));
  };
}

/** The prize counter. */
export function openPrizeCounter(host: CasinoHost): void {
  const s = host.state;
  const render = () => `<p class="blurb">You have <b>${tickets(s)} 🎟️</b>. Best scores: ${ARCADE_GAMES.map((g) => `${g.emoji} ${bestScore(s, g.id)}`).join(' · ')}</p>
    <div class="travel">${PRIZES.map((p) => `<button class="opt" data-act="prize:${p.id}" ${tickets(s) < p.cost ? 'disabled aria-disabled="true"' : ''}><span style="font-size:24px">${p.emoji}</span><span class="grow"><b>${esc(p.name)}</b></span><span class="cost">${p.cost} 🎟️</span></button>`).join('')}</div>`;
  const sheet = openSheet({ emoji: '🎟️', title: 'Prize counter', sub: 'Trade your tickets', body: render() + '<button class="btn ghost block" data-act="boards">🏆 High scores</button>' });
  onAct(sheet.body, (act) => {
    if (act === 'boards') return openScoreboards(s);
    if (!act.startsWith('prize:')) return;
    const why = redeem(s, act.slice(6));
    if (why) return toast(why, { icon: '🎟️', tone: 'bad' });
    sfx.win();
    toast('Enjoy your prize!', { icon: '🎁', tone: 'good' });
    host.saved();
    sheet.body.innerHTML = render() + '<button class="btn ghost block" data-act="boards">🏆 High scores</button>';
  });
}
