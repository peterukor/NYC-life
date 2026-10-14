// =====================================================================
// sportsbook.ts (ui) — the betting window at the stadium (Peter,
// 2026-10-14). In-game money only. Games come from the sports feed
// (sim/sports.ts: simulated now, real games later).
//
// 🗓️ Board: the next games with odds; tap a team, pick a stake, bet.
// 🔴 Live: games being played, scores ticking on the jumbotron.
// 🧾 My bets: open and settled slips. Winnings are paid automatically.
// =====================================================================

import { nowMs } from '../core/clock.ts';
import { esc, money } from '../core/format.ts';
import { placeBet, settleBets, sportsFeed, SPORT_EMOJI, type Fixture } from '../sim/sports.ts';
import { sfx } from './audio.ts';
import { rain, type CasinoHost } from './casino.ts';
import { openModal, toast } from './dom.ts';

const STAKES = [500, 2_500, 10_000, 50_000, 100_000, 500_000];
let stakePick = 2_500;
let tab: 'board' | 'live' | 'bets' = 'board';

const mins = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 1 ? 'any second' : `in ${m} min`;
};

/** Settle anything finished and tell the player (also called from the game loop). */
export function settleAndTell(host: CasinoHost): void {
  const done = settleBets(host.state);
  for (const b of done) {
    if (b.settled === 'won') {
      sfx.win();
      toast(`${b.emoji} ${b.team} won! +${money(b.paid! - b.stake)}`, { icon: '🏟️', tone: 'good', ms: 4500 });
    } else if (b.settled === 'push') toast(`${b.emoji} Draw: ${money(b.stake)} back`, { icon: '🏟️', ms: 3500 });
    else toast(`${b.emoji} ${b.team} lost. −${money(b.stake)}`, { icon: '🏟️', tone: 'bad', ms: 3500 });
  }
  if (done.length) host.saved();
}

export function openSportsbook(host: CasinoHost): void {
  const s = host.state;
  const m = openModal(`<div class="sb">
    <div class="jumbo"><div class="jumbo-lights" aria-hidden="true"></div><div class="jumbo-text">🏟️ SPORTSBOOK</div><div class="jumbo-sub">In-game money only · <span data-cash></span></div></div>
    <div class="sb-tabs" role="tablist">
      <button role="tab" data-tab="board">🗓️ Board</button><button role="tab" data-tab="live">🔴 Live</button><button role="tab" data-tab="bets">🧾 My bets</button>
    </div>
    <div class="sb-body"></div>
    <button class="btn ghost block" data-close>Leave the window</button>
  </div>`);
  m.el.classList.add('sb-modal');
  const body = m.el.querySelector<HTMLElement>('.sb-body')!;
  const cashEl = m.el.querySelector<HTMLElement>('[data-cash]')!;
  let selected: { id: string; pick: 'home' | 'away' } | null = null;

  const row = (f: Fixture, now: number) => {
    const live = now >= f.startsAt;
    const sc = live ? sportsFeed().live?.(f, now) : null;
    const res = sportsFeed().result(f, now);
    const side = (pick: 'home' | 'away') => {
      const on = selected?.id === f.id && selected.pick === pick;
      return `<button class="sb-team${on ? ' on' : ''}" data-pick="${f.id}:${pick}" ${live ? 'disabled' : ''}><span>${esc(f[pick])}</span><b>${f.odds[pick].toFixed(2)}</b></button>`;
    };
    return `<div class="sb-game${live ? ' live' : ''}">
      <div class="sb-meta">${SPORT_EMOJI[f.sport]} ${f.sport[0].toUpperCase()}${f.sport.slice(1)} · ${res ? 'Final' : live ? '<span class="sb-dot"></span> LIVE' : mins(f.startsAt - now)}</div>
      ${sc || res ? `<div class="sb-score"><span>${esc(f.home)}</span><b>${(res ?? sc)!.home}</b><b>${(res ?? sc)!.away}</b><span>${esc(f.away)}</span></div>` : `<div class="sb-sides">${side('home')}<span class="sb-vs">vs</span>${side('away')}</div>`}
    </div>`;
  };

  const render = () => {
    const now = nowMs();
    cashEl.textContent = `cash ${money(s.money)}`;
    m.el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    const feed = sportsFeed();
    if (tab === 'board') {
      const list = feed.fixtures(now, now + 45 * 60_000).filter((f) => f.startsAt > now).slice(0, 8);
      const sel = selected && feed.fixture(selected.id);
      const odds = sel ? sel.odds[selected!.pick] : 0;
      body.innerHTML = `<p class="blurb">Pick who wins. Odds pay your stake times the number (2.00 doubles it). A draw gives your money back.</p>
        ${list.map((f) => row(f, now)).join('')}
        <div class="sb-slip${sel ? '' : ' empty'}">
          ${sel ? `<p><b>${esc(sel[selected!.pick])}</b> to win · ${odds.toFixed(2)}</p>
          <div class="chips">${STAKES.map((c) => `<button class="chip${c === stakePick ? ' on' : ''}" data-stake="${c}">${money(c).replace('.00', '')}</button>`).join('')}</div>
          <button class="btn primary block" data-bet>Bet ${money(stakePick)} to win ${money(Math.round(stakePick * odds))}</button>` : '<p>Tap a team to start a bet slip.</p>'}
        </div>`;
    } else if (tab === 'live') {
      const list = feed.fixtures(now - 15 * 60_000, now).filter((f) => f.startsAt <= now);
      body.innerHTML = list.length ? list.map((f) => row(f, now)).join('') : '<p class="blurb">Nothing on right now. Next game soon.</p>';
    } else {
      const bets = s.fun?.bets ?? [];
      body.innerHTML = bets.length
        ? bets.map((b) => {
            const f = feed.fixture(b.fixtureId);
            const state = b.settled === 'won' ? `<b class="pos">Won +${money(b.paid! - b.stake)}</b>` : b.settled === 'lost' ? '<b class="neg">Lost</b>' : b.settled === 'push' ? '<b>Draw: refunded</b>' : f && now >= f.startsAt ? '<span class="sb-dot"></span> Playing' : 'Open';
            return `<div class="list-item"><div style="font-size:22px">${b.emoji}</div><div class="grow"><div class="title">${esc(b.team)} · ${b.odds.toFixed(2)}</div><div class="sub">${esc(b.label)} · ${money(b.stake)} to win ${money(Math.round(b.stake * b.odds))}</div></div><div>${state}</div></div>`;
          }).join('')
        : '<p class="blurb">No bets yet.</p>';
    }
  };

  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return (window.clearInterval(timer), m.close());
    const tb = t.closest<HTMLElement>('[data-tab]');
    if (tb) return ((tab = tb.dataset.tab as typeof tab), sfx.tap(), render());
    const pk = t.closest<HTMLElement>('[data-pick]');
    if (pk) {
      const [id, pick] = pk.dataset.pick!.split(':');
      selected = { id, pick: pick as 'home' | 'away' };
      sfx.tap();
      return render();
    }
    const st = t.closest<HTMLElement>('[data-stake]');
    if (st) return ((stakePick = Number(st.dataset.stake)), render());
    if (t.closest('[data-bet]') && selected) {
      const why = placeBet(s, selected.id, selected.pick, stakePick);
      if (why) return toast(why, { icon: '🏟️', tone: 'bad' });
      sfx.cash();
      rain(m.el, '🎟️', 10);
      toast('Bet placed. Check “My bets”.', { icon: '🧾', tone: 'good' });
      selected = null;
      host.saved();
      render();
    }
  });
  // Live scores tick; finished bets pay out.
  const timer = window.setInterval(() => {
    if (!m.el.isConnected) return window.clearInterval(timer);
    settleAndTell(host);
    if (tab !== 'board') render();
  }, 1000);
  settleAndTell(host);
  render();
}
