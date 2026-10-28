// =====================================================================
// gym-games.ts (ui) — the frame around the seven gym mini-games:
// intro card (how to, your best, ▶️ Start), a 3-2-1 count-in, the
// canvas game (ui/gym-runs.ts), and the end card (score, stars,
// +fitness, new best, Again / Done). Rules: sim/gym-games.ts.
//
// openGymGame(host, 'bench' | 'treadmill' | 'bag' | 'rope' | 'spin' | 'row' | 'yoga')
// =====================================================================

import './gym-games.css';
import { esc } from '../core/format.ts';
import { GYM_BY_ID, GYM_FRESH_SESSIONS, finishGymGame, gymBest, gymSessionsToday, stars } from '../sim/gym-games.ts';
import { sfx } from './audio.ts';
import { H, W, emoji } from './arcade-games.ts';
import { rain, type CasinoHost } from './casino.ts';
import { openModal } from './dom.ts';
import { GYM_RUNS, type GymCtx } from './gym-runs.ts';
import { Fx, buzz } from './juice.ts';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** What the coach says on the intro card. Light, never mean. */
const HELLO: Record<string, string[]> = {
  bench: ['Spot’s on me. Mostly.', 'Chest day is a lifestyle.', 'Eight good reps. Quality over ego.'],
  treadmill: ['Pretend the 6 train’s pulling out.', 'Intervals. Your favourite. I can tell.'],
  bag: ['Hands up, chin down.', 'Snap it out, snap it back.'],
  rope: ['Light on your toes, like double dutch on the block.', 'Ten minutes of this beats an hour of scrolling.'],
  spin: ['Front row energy only.', 'Ride the line, feel the beat.'],
  row: ['Legs, back, arms. Arms, back, legs.', 'Long and strong. Don’t rush the slide.'],
  yoga: ['Breathe. The rent is due either way.', 'Find your centre. Ignore the sirens.'],
};

export function openGymGame(host: CasinoHost, id: string): void {
  const game = GYM_BY_ID[id];
  const runGame = GYM_RUNS[id];
  if (!game || !runGame) return;
  const s = host.state;
  const m = openModal(`<div class="gg" style="--gg:${game.color}">
    <div class="gg-top"><b><span aria-hidden="true">${game.emoji}</span> ${esc(game.name)}</b><span class="gg-hud" aria-live="off"></span></div>
    <div class="gg-screen"><canvas aria-label="${esc(game.name)}"></canvas>
      <div class="gg-over"></div>
      <div class="gg-count" aria-live="assertive" hidden></div>
    </div>
    <div class="gg-coach" aria-live="polite"><span aria-hidden="true">🧔</span><em></em></div>
    <button class="btn ghost block gg-quit" data-close>Done for now</button>
  </div>`);
  m.el.classList.add('gg-modal');
  const cv = m.el.querySelector('canvas')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr;
  cv.height = H * dpr;
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const over = m.el.querySelector<HTMLElement>('.gg-over')!;
  const count = m.el.querySelector<HTMLElement>('.gg-count')!;
  const hudEl = m.el.querySelector<HTMLElement>('.gg-hud')!;
  const coachEl = m.el.querySelector<HTMLElement>('.gg-coach em')!;
  const coachBox = m.el.querySelector<HTMLElement>('.gg-coach')!;
  const quit = m.el.querySelector<HTMLElement>('.gg-quit')!;
  let stop: (() => void) | null = null;
  let timers: number[] = [];
  let lastCoach = 0;
  let closed = false;

  const coach = (line: string | string[], force = false) => {
    const now = performance.now();
    if (!force && now - lastCoach < 1400) return;
    lastCoach = now;
    coachEl.textContent = Array.isArray(line) ? pick(line) : line;
    coachBox.classList.remove('talk');
    void coachBox.offsetWidth;
    coachBox.classList.add('talk');
  };
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !closed && fn(), ms));
  const clearTimers = () => {
    timers.forEach((x) => window.clearTimeout(x));
    timers = [];
  };

  // Attract screen behind the intro card.
  const attract = () => {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#141a33');
    bg.addColorStop(1, '#23294a');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const wash = g.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, W);
    wash.addColorStop(0, game.color + '88');
    wash.addColorStop(1, game.color + '00');
    g.fillStyle = wash;
    g.fillRect(0, 0, W, H);
    emoji(g, game.emoji, W / 2, H * 0.42, 140);
  };

  const intro = () => {
    attract();
    const done = gymSessionsToday(s);
    const best = gymBest(s, id);
    over.className = 'gg-over';
    over.innerHTML = `<div class="gg-card">
      <div class="gg-emoji" aria-hidden="true">${game.emoji}</div>
      <h3>${esc(game.name)}</h3>
      <p>${esc(game.howTo)}</p>
      <div class="gg-chips"><span>🏆 Best ${best}</span><span>⏱️ ~${game.seconds} s</span><span>💪 Fitness ${s.skills.fitness.toFixed(1)}</span></div>
      ${done >= GYM_FRESH_SESSIONS ? `<p class="gg-warn">You’ve trained ${done} times today. Your muscles are cooked: gains are smaller until tomorrow.</p>` : ''}
      <button class="btn primary block" data-go>▶️ Start</button>
    </div>`;
    over.hidden = false;
    coach(HELLO[id] ?? ['Let’s get it.'], true);
  };

  const countIn = () => {
    over.hidden = true;
    quit.hidden = false;
    count.hidden = false;
    const steps = ['3', '2', '1', 'GO!'];
    steps.forEach((txt, i) =>
      later(i * 520, () => {
        count.innerHTML = `<span class="${txt === 'GO!' ? 'go' : ''}">${txt}</span>`;
        txt === 'GO!' ? (sfx.notify(), buzz(20)) : sfx.tick();
      }),
    );
    later(steps.length * 520 - 120, () => {
      count.hidden = true;
      start();
    });
    // The game's first frame under the count-in.
    attract();
  };

  const start = () => {
    hudEl.textContent = '';
    const fx = new Fx(W, H);
    let ended = false;
    const ctx: GymCtx = {
      cv,
      g,
      fx,
      game,
      fitness: s.skills.fitness,
      reduced: REDUCED,
      hud: (text) => {
        if (hudEl.textContent !== text) hudEl.textContent = text;
      },
      coach,
      end: (score, quality) => {
        if (ended) return;
        ended = true;
        // Let the end stamp land, then the card.
        later(1300, () => {
          stop?.();
          stop = null;
          finish(Math.max(0, Math.round(score)), quality);
        });
      },
    };
    stop = runGame(ctx);
  };

  const finish = (score: number, quality: number) => {
    const r = finishGymGame(s, id, score, quality);
    host.onScore?.(id, score);
    host.saved();
    const st = stars(quality);
    const starRow = [0, 1, 2].map((i) => `<i class="${i < st ? 'on' : ''}" style="--i:${i}">⭐</i>`).join('');
    over.className = 'gg-over end';
    over.innerHTML = `<div class="gg-card">
      <div class="gg-emoji" aria-hidden="true">${r.best ? '🏆' : game.emoji}</div>
      <h3>${r.best ? 'New best!' : st === 3 ? 'Great session!' : st >= 1 ? 'Nice work' : 'Done'}</h3>
      <p class="gg-score">${score}</p>
      <div class="gg-stars" role="img" aria-label="${st} of 3 stars">${starRow}</div>
      <div class="gg-gains">
        <span class="gg-gain">+${r.gain.toFixed(2)} 💪 fitness</span>
        ${r.pump ? '<span class="gg-pump">💪 The pump is real</span>' : ''}
      </div>
      ${r.tired ? '<p class="gg-warn">Muscles are cooked from today: smaller gains until tomorrow.</p>' : ''}
      <div class="gg-btns"><button class="btn primary" data-again>🔁 Again</button><button class="btn ghost" data-close>Done</button></div>
    </div>`;
    over.hidden = false;
    quit.hidden = true;
    hudEl.textContent = `Best ${gymBest(s, id)}`;
    if (r.best || st === 3) sfx.win();
    else sfx.chime();
    if (r.best) rain(m.el, '🏆', 14);
    else if (r.pump) rain(m.el, '💪', 14);
  };

  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) {
      closed = true;
      clearTimers();
      stop?.();
      stop = null;
      sfx.close();
      return m.close();
    }
    if (t.closest('[data-go]') || t.closest('[data-again]')) {
      sfx.tap();
      countIn();
    }
  });
  intro();
}
