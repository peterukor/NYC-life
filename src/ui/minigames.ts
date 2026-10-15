// =====================================================================
// minigames.ts — the two action minigames (Peter, 2026-10-15).
//
// 🥊 playFight: a needle sweeps a bar. Tap (anywhere, or Space) when it's
//    in the green to land a hit. Miss and they swing: a big DODGE button
//    flashes — tap it in time or lose a heart. First to zero hearts loses.
//    About 10–20 seconds.
//
// 🚔 playChase: you sprint up the block in 3 lanes. Tap the left/right
//    half of the screen (or swipe, or ←/→) to switch lanes and dodge
//    trash cans, carts, pigeons and tourists. Hit too many and you're
//    caught. Grab a 🍩 and the cop stops for a snack. Survive the timer
//    and you're gone.
//
// Difficulty comes from sim/brawl.ts (fightSetup / chaseSetup). Both are
// cartoon slapstick: dust clouds and stars, nothing graphic.
// =====================================================================

import { esc } from '../core/format.ts';
import type { ChaseSetup, FightSetup } from '../sim/brawl.ts';
import { sfx } from './audio.ts';
import { html, root } from './dom.ts';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const hearts = (n: number, max: number) => '❤️'.repeat(Math.max(0, n)) + '🤍'.repeat(Math.max(0, max - n));

// ---------------------------------------------------------------------
// 🥊 Fight
// ---------------------------------------------------------------------

export interface FightResult {
  won: boolean;
  /** Your hearts left at the end. */
  hpLeft: number;
}

export function playFight(f: FightSetup, opts: { you?: string; title?: string } = {}): Promise<FightResult> {
  return new Promise((resolve) => {
    let you = f.youHp;
    let foe = f.foeHp;
    const el = html(`
      <div class="mg-wrap" role="dialog" aria-label="Fight">
        <div class="mg mg-fight">
          <div class="mg-title">${esc(opts.title ?? `🥊 vs ${f.foe}`)}</div>
          <div class="mg-fighters">
            <div class="mg-side"><div class="mg-face" data-you>${opts.you ?? '🧍'}</div><div class="mg-hp" data-you-hp></div><small>You</small></div>
            <div class="mg-vs">VS</div>
            <div class="mg-side"><div class="mg-face" data-foe>${f.foeEmoji}</div><div class="mg-hp" data-foe-hp></div><small>${esc(f.foe)}</small></div>
          </div>
          <div class="mg-bar" data-bar><i class="mg-zone" data-zone></i><b class="mg-needle" data-needle></b></div>
          <div class="mg-msg" data-msg aria-live="polite">Tap when the needle is in the green!</div>
          <button class="btn primary block mg-big" data-hit>👊 Swing</button>
          <button class="btn block mg-big mg-dodge" data-dodge hidden>🫨 DODGE!</button>
        </div>
      </div>`);
    root().appendChild(el);
    const $ = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
    const bar = $('[data-bar]');
    const zoneEl = $('[data-zone]');
    const needle = $('[data-needle]');
    const msg = $('[data-msg]');
    const hitBtn = $<HTMLButtonElement>('[data-hit]');
    const dodgeBtn = $<HTMLButtonElement>('[data-dodge]');
    const draw = () => {
      $('[data-you-hp]').textContent = hearts(you, f.youHp);
      $('[data-foe-hp]').textContent = hearts(foe, f.foeHp);
    };
    draw();

    let zoneAt = 0;
    const newZone = () => {
      zoneAt = 0.08 + Math.random() * (0.84 - f.zone);
      zoneEl.style.left = `${zoneAt * 100}%`;
      zoneEl.style.width = `${f.zone * 100}%`;
    };
    newZone();

    // Needle: ping-pong across the bar.
    let phase: 'aim' | 'dodge' | 'pause' | 'done' = 'aim';
    let t0 = performance.now();
    let aimSince = performance.now();
    let pos = 0;
    let raf = 0;
    const tick = (now: number) => {
      if (phase === 'aim') {
        const k = ((now - t0) / f.sweepMs) % 2;
        pos = k < 1 ? k : 2 - k;
        needle.style.left = `${pos * 100}%`;
        // Hesitate too long and they swing first.
        if (now - aimSince > f.sweepMs * 3.2) {
          msg.textContent = 'Too slow! They swing first…';
          theySwing();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const shake = (who: '[data-you]' | '[data-foe]') => {
      const e = $(who);
      e.classList.remove('mg-hit');
      void e.offsetWidth;
      e.classList.add('mg-hit');
    };
    const end = (won: boolean) => {
      phase = 'done';
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      msg.innerHTML = won ? '<b>🏆 You won!</b>' : '<b>😵 You lost…</b>';
      if (won) sfx.cheer();
      else sfx.bad();
      hitBtn.hidden = true;
      dodgeBtn.hidden = true;
      window.setTimeout(() => {
        el.remove();
        resolve({ won, hpLeft: you });
      }, 1300);
    };
    let dodgeTimer = 0;
    // They swing at you: tap DODGE in time.
    const theySwing = () => {
      phase = 'dodge';
      hitBtn.hidden = true;
      dodgeBtn.hidden = false;
      // Put the dodge button somewhere a little different each time.
      dodgeBtn.style.marginLeft = `${Math.round(Math.random() * 40)}px`;
      msg.innerHTML = `<b>${esc(f.foe)} winds up… 🫲</b>`;
      sfx.whoosh();
      dodgeTimer = window.setTimeout(() => {
        // Too slow.
        you--;
        shake('[data-you]');
        sfx.punch();
        msg.innerHTML = '💥 Ow. Right on the chin.';
        draw();
        nextRound();
      }, f.dodgeMs);
    };
    const nextRound = () => {
      dodgeBtn.hidden = true;
      if (you <= 0) return end(false);
      if (foe <= 0) return end(true);
      phase = 'pause';
      window.setTimeout(() => {
        if (phase === 'done') return;
        // Now and then they swing first.
        if (Math.random() < 0.25) return theySwing();
        phase = 'aim';
        newZone();
        t0 = performance.now() - Math.random() * f.sweepMs;
        aimSince = performance.now();
        hitBtn.hidden = false;
        msg.textContent = 'Tap when the needle is in the green!';
      }, 650);
    };
    const swing = () => {
      if (phase !== 'aim') return;
      if (pos >= zoneAt && pos <= zoneAt + f.zone) {
        foe--;
        shake('[data-foe]');
        sfx.punch();
        msg.innerHTML = ['💥 Clean hit!', '⭐ Right in the pride!', '💨 Dust cloud! You land it.'][Math.floor(Math.random() * 3)];
        draw();
        nextRound();
      } else {
        msg.textContent = 'Swing and a miss…';
        theySwing();
      }
    };
    const dodge = () => {
      if (phase !== 'dodge') return;
      window.clearTimeout(dodgeTimer);
      sfx.whoosh();
      msg.innerHTML = ['😎 Dodged!', '🕺 Matrix moves.', '🙅 Not today.'][Math.floor(Math.random() * 3)];
      nextRound();
    };
    hitBtn.addEventListener('click', swing);
    dodgeBtn.addEventListener('click', dodge);
    bar.addEventListener('click', swing);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (phase === 'aim') swing();
        else if (phase === 'dodge') dodge();
      }
    };
    window.addEventListener('keydown', onKey);
  });
}

// ---------------------------------------------------------------------
// 🚔 Chase
// ---------------------------------------------------------------------

export interface ChaseResult {
  escaped: boolean;
}

const OBSTACLES = ['🗑️', '🛒', '🐦', '🧳', '🚧', '🌭', '🐀', '📦', '🛴', '🧍'];

export function playChase(c: ChaseSetup, opts: { reason?: string } = {}): Promise<ChaseResult> {
  return new Promise((resolve) => {
    const el = html(`
      <div class="mg-wrap mg-chase-wrap" role="dialog" aria-label="Police chase">
        <div class="mg mg-chase">
          <div class="mg-chase-top"><b>🚔 RUN!</b><span data-left></span><span data-hits></span></div>
          <canvas data-canvas aria-label="Tap left or right to switch lanes"></canvas>
          <div class="mg-msg" data-msg>${esc(opts.reason ?? 'The cops are on you.')} Tap left / right to dodge!</div>
        </div>
      </div>`);
    root().appendChild(el);
    const canvas = el.querySelector<HTMLCanvasElement>('[data-canvas]')!;
    const g = canvas.getContext('2d')!;
    const msg = el.querySelector<HTMLElement>('[data-msg]')!;
    const leftEl = el.querySelector<HTMLElement>('[data-left]')!;
    const hitsEl = el.querySelector<HTMLElement>('[data-hits]')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 300;
    let H = 420;
    const size = () => {
      W = canvas.clientWidth || 300;
      H = canvas.clientHeight || 420;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    sfx.siren();

    type Ob = { lane: number; y: number; e: string; kind: 'block' | 'donut' };
    const obs: Ob[] = [];
    let lane = 1;
    let shown = 1; // drawn lane (eases towards `lane`)
    let hits = 0;
    let left = c.seconds;
    let spawn = 0.6;
    let stopped = 0; // cop eating a donut
    let flash = 0;
    let last = performance.now();
    let done = false;
    let raf = 0;
    const laneX = (l: number) => (W / 3) * (l + 0.5);
    const youY = () => H * 0.72;

    const finish = (escaped: boolean) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      msg.innerHTML = escaped ? '<b>💨 You got away!</b>' : '<b>🚔 Caught…</b>';
      if (escaped) sfx.cheer();
      else sfx.siren();
      window.setTimeout(() => {
        el.remove();
        resolve({ escaped });
      }, 1200);
    };

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      left -= dt;
      if (stopped > 0) stopped -= dt;
      if (flash > 0) flash -= dt;
      const speed = H * 0.55 * c.speed;
      spawn -= dt;
      if (spawn <= 0) {
        // Never block all three lanes at once: one obstacle per row, sometimes a 🍩.
        const donut = Math.random() < 0.08;
        obs.push({ lane: Math.floor(Math.random() * 3), y: -30, e: donut ? '🍩' : OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)], kind: donut ? 'donut' : 'block' });
        spawn = (1 / c.density) * (0.7 + Math.random() * 0.6);
      }
      shown += (lane - shown) * Math.min(1, dt * 14);
      for (let i = obs.length - 1; i >= 0; i--) {
        const o = obs[i];
        o.y += speed * dt;
        if (o.lane === lane && Math.abs(o.y - youY()) < 26) {
          obs.splice(i, 1);
          if (o.kind === 'donut') {
            stopped = 2;
            msg.textContent = '🍩 Donut! The cop stopped for a snack.';
            sfx.coin();
          } else {
            hits++;
            flash = 0.3;
            sfx.punch();
            msg.textContent = ['Ow! A trash can.', 'You hit a tourist. He says sorry.', 'Pigeon to the face.', 'Hot dog cart! Mustard everywhere.'][Math.floor(Math.random() * 4)];
          }
        } else if (o.y > H + 40) obs.splice(i, 1);
      }
      // Draw: the block, lane lines, stuff, you, the cop.
      g.fillStyle = '#5b6474';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#c9c3b6';
      g.fillRect(0, 0, 8, H);
      g.fillRect(W - 8, 0, 8, H);
      g.strokeStyle = 'rgba(255,255,255,.45)';
      g.lineWidth = 3;
      g.setLineDash([18, 16]);
      g.lineDashOffset = -((now / 1000) * speed) % 34;
      for (const x of [W / 3, (2 * W) / 3]) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      g.setLineDash([]);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '34px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
      for (const o of obs) g.fillText(o.e, laneX(o.lane), o.y);
      if (flash > 0 && !reduced()) {
        g.fillStyle = 'rgba(255,60,60,.25)';
        g.fillRect(0, 0, W, H);
      }
      g.font = '40px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
      g.fillText('🏃', laneX(0) + (laneX(2) - laneX(0)) * (shown / 2), youY());
      // The cop: closer with each hit, frozen while eating.
      const copY = H - 30 - hits * 22 + (stopped > 0 ? 40 : Math.sin(now / 120) * 4);
      g.fillText(stopped > 0 ? '👮🍩' : '👮', laneX(0) + (laneX(2) - laneX(0)) * (shown / 2), Math.max(youY() + 40, copY));
      leftEl.textContent = `⏱️ ${Math.max(0, left).toFixed(1)}s`;
      hitsEl.textContent = `${'💢'.repeat(hits)}${'▫️'.repeat(Math.max(0, c.hits - hits))}`;
      if (hits >= c.hits) return finish(false);
      if (left <= 0) return finish(true);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const move = (d: -1 | 1) => {
      if (done) return;
      lane = Math.max(0, Math.min(2, lane + d));
    };
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      move(e.clientX - r.left < r.width / 2 ? -1 : 1);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') move(-1);
      if (e.key === 'ArrowRight' || e.key === 'd') move(1);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', size, { once: true });
  });
}
