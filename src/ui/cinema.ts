// =====================================================================
// cinema.ts (ui) — 🎬 the box office and the big screen at Union Square
// Pictures. Pick a film (or paste a YouTube link), buy a ticket, and it
// plays in YouTube's embedded player inside a dark "theater" frame. The
// game's music pauses while the film runs.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { embedUrl, MOVIES, TICKET_PRICE, youtubeId, type Movie } from '../data/movies.ts';
import { changeMoney } from '../sim/economy.ts';
import { addMoodlet, applyNeeds } from '../sim/needs.ts';
import { sfx } from './audio.ts';
import type { CasinoHost } from './casino.ts';
import { openModal, toast } from './dom.ts';
import { music } from './music.ts';
import './cinema.css';

/** The box office: the lineup, a link box, and the ticket. */
export function openCinema(host: CasinoHost): void {
  const s = host.state;
  const m = openModal(`<div class="cine">
    <div class="cine-marquee"><span>NOW SHOWING</span></div>
    <div class="cine-list">${MOVIES.map((f) => `<button class="cine-film" data-film="${f.id}"><span class="cine-emoji">${f.emoji}</span><span class="grow"><b>${esc(f.title)}</b><small>${esc(f.genre)} · ${f.minutes} min</small><span class="cine-blurb">${esc(f.blurb)}</span></span></button>`).join('')}</div>
    <form class="cine-link"><label for="cine-url">Or watch any YouTube video</label><div class="row"><input id="cine-url" type="url" inputmode="url" placeholder="Paste a YouTube link" autocomplete="off"><button class="btn" type="submit">▶️</button></div></form>
    <p class="sub">🎟️ Ticket ${money(TICKET_PRICE)} · popcorn at the stand</p>
    <button class="btn ghost block" data-close>Not tonight</button>
  </div>`);
  m.el.classList.add('cine-modal');
  const buy = (film: Pick<Movie, 'yt' | 'title' | 'emoji'>) => {
    const r = changeMoney(s, -TICKET_PRICE, `🎬 ${film.title}`);
    if (!r.ok) return toast('Not enough cash for a ticket.', { icon: '🎟️', tone: 'bad' });
    sfx.cash();
    applyNeeds(s, { fun: 25, social: 6 });
    addMoodlet(s, { id: 'movies', label: 'Caught a movie', emoji: '🎬', value: 6, minutes: 180 });
    host.saved();
    m.close();
    playFilm(film);
  };
  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return m.close();
    const b = t.closest<HTMLElement>('[data-film]');
    if (b) {
      const f = MOVIES.find((x) => x.id === b.dataset.film);
      if (f) buy(f);
    }
  });
  m.el.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = m.el.querySelector<HTMLInputElement>('#cine-url')!;
    const yt = youtubeId(input.value);
    if (!yt) return toast('That doesn’t look like a YouTube link.', { icon: '🎬', tone: 'bad' });
    buy({ yt, title: 'Your pick', emoji: '🎞️' });
  });
}

/** The theater: lights down, the film in YouTube's player, lights up when you leave. */
function playFilm(film: Pick<Movie, 'yt' | 'title' | 'emoji'>): void {
  music.stop();
  const m = openModal(`<div class="cine-room">
    <div class="cine-curtain l"></div><div class="cine-curtain r"></div>
    <div class="cine-screen"><iframe src="${embedUrl(film.yt)}" title="${esc(film.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <div class="cine-seats" aria-hidden="true">${'💺'.repeat(9)}</div>
    <div class="cine-bar"><span>${film.emoji} ${esc(film.title)}</span><button class="btn" data-close>Leave the theater</button></div>
  </div>`);
  m.el.classList.add('cine-modal', 'cine-dark');
  m.el.querySelector('[data-close]')!.addEventListener('click', () => {
    m.close();
    music.start();
  });
}
