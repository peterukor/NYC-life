// =====================================================================
// minigames.ts — the two action minigames (Peter, 2026-10-15; made more
// fun 2026-10-16).
//
// 🥊 playFight (Punch-Out!! rules, cartoon slapstick):
//    - ATTACK: a needle sweeps a bar; tap in the green to land a hit. Dead
//      centre is a CRIT (double). Miss and they get a swing.
//    - DEFEND: they wind up a LEFT or RIGHT hook (watch the tell: 🫲 / 🫱
//      and which side flashes). Tap the dodge on the OTHER side in time.
//      A good dodge opens a COUNTER: the green zone doubles for one swing.
//    - Three clean hits in a row charge a ⭐ STAR PUNCH (double damage,
//      the screen shakes). The last hit gets a slow-mo K.O.
//    - Foes talk trash. About 15–25 seconds.
//
// 🚔 playChase (Subway Surfers on the sidewalk):
//    - Tap left / right (or swipe) to switch lanes; swipe up or tap ⬆️ to
//      JUMP low stuff (🗑️ 📦 🛒 🌭 🐦 🧳). People and roadwork you can't
//      jump: go round.
//    - 🍩 the cop stops for a snack; 🛹 skateboard = 3 s of speed and
//      nothing can touch you; 💵 cash to grab (you keep it if you escape).
//    - The cop's distance is a bar: hits bring him closer, clean running
//      pulls you away. Survive the timer and you're gone.
//
// Difficulty comes from sim/brawl.ts (fightSetup / chaseSetup). Effects:
// ui/juice.ts. Nothing graphic: dust clouds, stars and pigeons.
// =====================================================================

import { esc } from '../core/format.ts';
import type { ChaseSetup, FightSetup } from '../sim/brawl.ts';
import { sfx } from './audio.ts';
import { html, root } from './dom.ts';
import { burstAt, buzz, Fx, popAt, shakeEl } from './juice.ts';

const hearts = (n: number, max: number) => '❤️'.repeat(Math.max(0, n)) + '🤍'.repeat(Math.max(0, max - n));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------------
// 🥊 Fight
// ---------------------------------------------------------------------

export interface FightResult {
  won: boolean;
  /** Your hearts left at the end. */
  hpLeft: number;
}

const TRASH = ['“My grandma hits harder.”', '“You swing like you’re waving down a cab.”', '“Is that it? I’ve been hit harder by a revolving door.”', '“Bro thinks he’s in a movie.”', '“Tie your shoes first.”', '“That was a high five, not a punch.”'];
const OUCH = ['“Okay, okay, lucky one.”', '“That’s… fair.”', '“My hat! Watch the hat!”', '“I wasn’t ready!”'];

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
            <div class="mg-vs" data-vs>VS</div>
            <div class="mg-side"><div class="mg-face" data-foe>${f.foeEmoji}</div><div class="mg-hp" data-foe-hp></div><small>${esc(f.foe)}</small></div>
          </div>
          <div class="mg-stars" data-stars aria-label="Star punch charge">☆☆☆</div>
          <div class="mg-bar" data-bar><i class="mg-zone" data-zone><i class="mg-crit"></i></i><b class="mg-needle" data-needle></b></div>
          <div class="mg-msg" data-msg aria-live="polite">Get ready…</div>
          <button class="btn primary block mg-big" data-hit hidden>👊 Swing</button>
          <div class="mg-dodges" data-dodges hidden>
            <button class="btn block mg-big mg-dodge" data-dodge="L">⬅️ Dodge</button>
            <button class="btn block mg-big mg-dodge" data-dodge="R">Dodge ➡️</button>
          </div>
        </div>
      </div>`);
    root().appendChild(el);
    const $ = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
    const card = $('.mg-fight');
    const bar = $('[data-bar]');
    const zoneEl = $('[data-zone]');
    const needle = $('[data-needle]');
    const msg = $('[data-msg]');
    const hitBtn = $<HTMLButtonElement>('[data-hit]');
    const dodges = $('[data-dodges]');
    const foeFace = $('[data-foe]');
    const youFace = $('[data-you]');
    let stars = 0;
    const draw = () => {
      $('[data-you-hp]').textContent = hearts(you, f.youHp);
      $('[data-foe-hp]').textContent = hearts(foe, f.foeHp);
      $('[data-stars]').textContent = stars >= 3 ? '⭐⭐⭐ STAR PUNCH READY' : '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
      $('[data-stars]').classList.toggle('ready', stars >= 3);
    };
    draw();

    let zoneAt = 0, zoneW = f.zone, counter = false;
    const newZone = () => {
      zoneW = Math.min(0.6, f.zone * (counter ? 2 : 1));
      zoneAt = 0.06 + Math.random() * (0.88 - zoneW);
      zoneEl.style.left = `${zoneAt * 100}%`;
      zoneEl.style.width = `${zoneW * 100}%`;
      bar.classList.toggle('counter', counter);
    };

    let phase: 'intro' | 'aim' | 'dodge' | 'pause' | 'done' = 'intro';
    let t0 = performance.now(), aimSince = performance.now(), pos = 0, raf = 0;
    let hookSide: 'L' | 'R' = 'L';
    const tick = (now: number) => {
      if (phase === 'aim') {
        const k = ((now - t0) / (f.sweepMs * (stars >= 3 ? 0.8 : 1))) % 2;
        pos = k < 1 ? k : 2 - k;
        needle.style.left = `${pos * 100}%`;
        if (now - aimSince > f.sweepMs * 3.2) {
          msg.textContent = 'Too slow! They swing first…';
          theySwing();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const end = (won: boolean) => {
      phase = 'done';
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      hitBtn.hidden = true;
      dodges.hidden = true;
      if (won) {
        // Slow-mo K.O.
        card.classList.add('mg-ko');
        foeFace.textContent = '😵';
        msg.innerHTML = '<b class="mg-kotext">K.O.! 🏆</b>';
        burstAt(foeFace, ['⭐', '💫', '✨', '🐦'], 16);
        shakeEl(card, true);
        sfx.cheer();
      } else {
        youFace.textContent = '😵‍💫';
        msg.innerHTML = '<b>😵 You’re down… T.K.O.</b>';
        burstAt(youFace, ['💫', '🐦'], 8);
        sfx.bad();
      }
      window.setTimeout(() => {
        el.remove();
        resolve({ won, hpLeft: you });
      }, 1700);
    };
    let dodgeTimer = 0;
    // They wind up a hook from one side: dodge to the OTHER side.
    const theySwing = () => {
      phase = 'dodge';
      hitBtn.hidden = true;
      counter = false;
      hookSide = Math.random() < 0.5 ? 'L' : 'R';
      foeFace.classList.remove('wind-L', 'wind-R');
      void foeFace.offsetWidth;
      foeFace.classList.add(`wind-${hookSide}`);
      msg.innerHTML = `<b>${esc(f.foe)} throws a ${hookSide === 'L' ? '🫲 LEFT' : 'RIGHT 🫱'} hook!</b> Dodge ${hookSide === 'L' ? 'RIGHT ➡️' : '⬅️ LEFT'}`;
      dodges.hidden = false;
      dodges.dataset.side = hookSide;
      sfx.whoosh();
      dodgeTimer = window.setTimeout(() => {
        you--;
        stars = 0;
        shakeEl(youFace, true);
        shakeEl(card);
        popAt(youFace, '-1', { color: '#e0283f' });
        burstAt(youFace, ['💥', '⭐'], 6);
        sfx.punch();
        msg.innerHTML = pick(['💥 Ow. Right on the chin.', '💥 You saw stars. And a pigeon.', '💥 That one echoed.']);
        draw();
        nextRound();
      }, f.dodgeMs);
    };
    const nextRound = (delay = 650) => {
      dodges.hidden = true;
      foeFace.classList.remove('wind-L', 'wind-R');
      if (you <= 0) return end(false);
      if (foe <= 0) return end(true);
      phase = 'pause';
      window.setTimeout(() => {
        if (phase === 'done') return;
        if (!counter && Math.random() < 0.25) return theySwing();
        phase = 'aim';
        newZone();
        t0 = performance.now() - Math.random() * f.sweepMs;
        aimSince = performance.now();
        hitBtn.hidden = false;
        hitBtn.textContent = stars >= 3 ? '⭐ STAR PUNCH' : counter ? '⚡ COUNTER!' : '👊 Swing';
        hitBtn.classList.toggle('mg-star', stars >= 3);
        if (!counter) msg.textContent = 'Tap when the needle is in the green!';
      }, delay);
    };
    const swing = () => {
      if (phase !== 'aim') return;
      const inZone = pos >= zoneAt && pos <= zoneAt + zoneW;
      const centre = Math.abs(pos - (zoneAt + zoneW / 2)) < zoneW * 0.17;
      if (inZone) {
        const star = stars >= 3;
        let dmg = 1 + (centre ? 1 : 0) + (star ? 1 : 0);
        dmg = Math.min(dmg, foe);
        foe -= dmg;
        stars = star ? 0 : Math.min(3, stars + 1);
        shakeEl(foeFace, dmg > 1);
        if (dmg > 1) shakeEl(card, true);
        popAt(foeFace, star ? `⭐ -${dmg}` : centre ? `CRIT -${dmg}` : `-${dmg}`, { color: dmg > 1 ? '#ffd23f' : '#fff', size: dmg > 1 ? 32 : 26 });
        burstAt(foeFace, star ? ['⭐', '💥', '✨'] : ['💥', '💫'], star ? 14 : 6);
        sfx.punch();
        if (dmg > 1) buzz([20, 30, 20]);
        msg.innerHTML = star ? '<b>⭐ STAR PUNCH!</b>' : centre ? '<b>💥 CRITICAL!</b>' : pick(['💥 Clean hit!', '⭐ Right in the pride!', '💨 Dust cloud! You land it.']) + ` <i>${pick(OUCH)}</i>`;
        counter = false;
        draw();
        nextRound();
      } else {
        stars = 0;
        counter = false;
        draw();
        msg.innerHTML = `Swing and a miss… <i>${pick(TRASH)}</i>`;
        theySwing();
      }
    };
    const dodge = (side: 'L' | 'R') => {
      if (phase !== 'dodge') return;
      window.clearTimeout(dodgeTimer);
      if (side === hookSide) {
        // Dodged INTO the punch.
        you--;
        stars = 0;
        shakeEl(youFace, true);
        popAt(youFace, '-1', { color: '#e0283f' });
        sfx.punch();
        msg.innerHTML = '💥 Wrong way! Walked right into it.';
        draw();
        return nextRound();
      }
      youFace.classList.remove('slip-L', 'slip-R');
      void youFace.offsetWidth;
      youFace.classList.add(`slip-${side}`);
      popAt(youFace, 'DODGE!', { color: '#36c5f0', size: 22 });
      sfx.whoosh();
      counter = true;
      msg.innerHTML = `<b>${pick(['😎 Dodged!', '🕺 Matrix moves.', '🙅 Not today.'])}</b> Counter now: the green is bigger!`;
      nextRound(380);
    };
    hitBtn.addEventListener('click', swing);
    el.querySelectorAll<HTMLButtonElement>('[data-dodge]').forEach((b) => b.addEventListener('click', () => dodge(b.dataset.dodge as 'L' | 'R')));
    bar.addEventListener('click', swing);
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && phase === 'aim') (e.preventDefault(), swing());
      if (e.key === 'ArrowLeft' || e.key === 'a') dodge('L');
      if (e.key === 'ArrowRight' || e.key === 'd') dodge('R');
    };
    window.addEventListener('keydown', onKey);
    // Ding ding: 3, 2, 1, FIGHT!
    const vs = $('[data-vs]');
    let n = 3;
    const count = () => {
      if (phase === 'done') return;
      if (n > 0) {
        vs.textContent = String(n--);
        sfx.tick();
        window.setTimeout(count, 420);
      } else {
        vs.textContent = 'VS';
        msg.innerHTML = '<b>🔔 FIGHT!</b>';
        sfx.ring();
        phase = 'pause';
        nextRound(300);
      }
    };
    count();
  });
}

// ---------------------------------------------------------------------
// 🚔 Chase
// ---------------------------------------------------------------------

export interface ChaseResult {
  escaped: boolean;
  /** 💵 picked up on the run (cents): yours if you got away. */
  cash: number;
}

const JUMPABLE = ['🗑️', '🛒', '🐦', '🧳', '🌭', '📦'];
const TALL = ['🚧', '🛴', '🧍', '🚶', '🧑‍🍳'];

export function playChase(c: ChaseSetup, opts: { reason?: string } = {}): Promise<ChaseResult> {
  return new Promise((resolve) => {
    const el = html(`
      <div class="mg-wrap mg-chase-wrap" role="dialog" aria-label="Police chase">
        <div class="mg mg-chase">
          <div class="mg-chase-top"><b>🚔 RUN!</b><span data-left></span><span data-cash>💵 $0</span></div>
          <div class="mg-gap" aria-label="How far ahead of the cop you are"><i data-gap></i><span>👮</span><span>🏃</span></div>
          <canvas data-canvas aria-label="Tap left or right to switch lanes, swipe up to jump"></canvas>
          <div class="row mg-chase-pad"><button class="btn" data-mv="-1" aria-label="Left">⬅️</button><button class="btn primary" data-jump aria-label="Jump">⬆️ Jump</button><button class="btn" data-mv="1" aria-label="Right">➡️</button></div>
          <div class="mg-msg" data-msg>${esc(opts.reason ?? 'The cops are on you.')} Dodge, jump, run!</div>
        </div>
      </div>`);
    root().appendChild(el);
    const canvas = el.querySelector<HTMLCanvasElement>('[data-canvas]')!;
    const g = canvas.getContext('2d')!;
    const msg = el.querySelector<HTMLElement>('[data-msg]')!;
    const leftEl = el.querySelector<HTMLElement>('[data-left]')!;
    const cashEl = el.querySelector<HTMLElement>('[data-cash]')!;
    const gapEl = el.querySelector<HTMLElement>('[data-gap]')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 300, H = 420;
    const size = () => {
      W = canvas.clientWidth || 300;
      H = canvas.clientHeight || 420;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const fx = new Fx(W, H);
    sfx.siren();

    type Ob = { lane: number; y: number; e: string; kind: 'low' | 'tall' | 'donut' | 'cash' | 'board'; passed?: boolean };
    const obs: Ob[] = [];
    let lane = 1, shown = 1, left = c.seconds, spawn = 0.6, stopped = 0, boardT = 0, jumpT = 0, done = false, raf = 0, cash = 0, dist = 0, lastMove = 0;
    // The gap to the cop: 1 = far ahead, 0 = caught. Each hit costs 1 / hits allowed.
    let gap = 1;
    const hitCost = 1 / c.hits;
    const laneX = (l: number) => (W / 3) * (l + 0.5);
    const youY = () => H * 0.7;

    const finish = (escaped: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey);
      msg.innerHTML = escaped ? `<b>💨 You got away!</b>${cash ? ` And kept $${cash / 100}.` : ''}` : `<b>🚔 Caught…</b>${cash ? ` They kept the $${cash / 100}.` : ''}`;
      fx.stamp(escaped ? 'GOT AWAY!' : 'BUSTED', escaped ? '#7bd88f' : '#e0283f', 1.2);
      if (escaped) (sfx.cheer(), fx.burst(W / 2, H / 2, { emoji: ['💨', '✨', '💵'], n: 16, size: 20 }));
      else sfx.siren();
      window.setTimeout(() => {
        cancelAnimationFrame(raf);
        el.remove();
        resolve({ escaped, cash: escaped ? cash : 0 });
      }, 1400);
    };

    const step = (now: number) => {
      const dt = fx.begin(g);
      if (!done && !fx.frozen) {
        left -= dt * (boardT > 0 ? 1.5 : 1);
        stopped = Math.max(0, stopped - dt);
        boardT = Math.max(0, boardT - dt);
        jumpT = Math.max(0, jumpT - dt);
        // Clean running slowly pulls you away; a stopped (snacking) cop falls behind fast.
        gap = Math.min(1, gap + dt * (stopped > 0 ? 0.12 : 0.025));
        const speed = H * 0.55 * c.speed * (boardT > 0 ? 1.5 : 1);
        dist += speed * dt;
        spawn -= dt;
        if (spawn <= 0) {
          const r = Math.random();
          const l = Math.floor(Math.random() * 3);
          if (r < 0.06) obs.push({ lane: l, y: -30, e: '🍩', kind: 'donut' });
          else if (r < 0.1) obs.push({ lane: l, y: -30, e: '🛹', kind: 'board' });
          else if (r < 0.3) for (let k = 0; k < 3; k++) obs.push({ lane: l, y: -30 - k * 36, e: '💵', kind: 'cash' });
          else if (r < 0.65) obs.push({ lane: l, y: -30, e: pick(JUMPABLE), kind: 'low' });
          else obs.push({ lane: l, y: -30, e: pick(TALL), kind: 'tall' });
          spawn = (1 / c.density) * (0.7 + Math.random() * 0.6);
        }
        shown += (lane - shown) * Math.min(1, dt * 14);
        for (let i = obs.length - 1; i >= 0; i--) {
          const o = obs[i];
          o.y += speed * dt;
          const hitNow = o.lane === lane && Math.abs(o.y - youY()) < 24;
          const x = laneX(lane), y = youY();
          if (hitNow) {
            if (o.kind === 'donut') {
              obs.splice(i, 1);
              stopped = 2.2;
              fx.pop(x, y - 30, '🍩 SNACK BREAK', '#ffd23f', 18);
              msg.textContent = '🍩 Donut! The cop stopped for a snack.';
              sfx.coin();
            } else if (o.kind === 'board') {
              obs.splice(i, 1);
              boardT = 3;
              fx.stamp('🛹 SKATE!', '#36c5f0', 0.8);
              sfx.chime();
            } else if (o.kind === 'cash') {
              obs.splice(i, 1);
              cash += 500;
              fx.pop(x, y - 26, '+$5', '#7bd88f', 16);
              sfx.coin();
            } else if (boardT > 0 || (o.kind === 'low' && jumpT > 0)) {
              // Skating through, or jumping over: fine.
              if (!o.passed) {
                o.passed = true;
                fx.pop(x, y - 40, jumpT > 0 ? 'HOP!' : 'WHOOSH', '#fff', 16);
              }
            } else {
              obs.splice(i, 1);
              gap -= hitCost;
              fx.shake(12, 0.35);
              fx.stop(0.1);
              fx.flash('#e0283f', 0.2);
              fx.burst(x, y - 10, { emoji: ['💥', '⭐', o.e], n: 6, size: 18 });
              sfx.punch();
              msg.textContent = pick(['Ow! A trash can.', 'You hit a tourist. He says sorry.', 'Pigeon to the face.', 'Hot dog cart! Mustard everywhere.', 'Shopping cart. It had a mind of its own.']);
            }
          } else if (o.y > youY() + 30 && !o.passed && (o.kind === 'low' || o.kind === 'tall')) {
            o.passed = true;
            if (Math.abs(o.lane - lane) === 1 && now - lastMove < 450) {
              fx.pop(laneX(lane), youY() - 46, 'CLOSE!', '#ffd23f', 16);
              gap = Math.min(1, gap + 0.03);
            }
          } else if (o.y > H + 40) obs.splice(i, 1);
        }
      }
      // Draw: sidewalk, lanes, stuff, you, the cop.
      g.fillStyle = '#5b6474';
      g.fillRect(-20, -20, W + 40, H + 40);
      for (let k = 0; k < 8; k++) {
        const y = ((k * 70 + dist * 0.8) % 560) - 70;
        g.fillStyle = ['#b56576', '#6d597a', '#355070'][k % 3];
        g.fillRect(-4, y, 10, 50);
        g.fillRect(W - 6, y + 30, 10, 50);
      }
      g.strokeStyle = 'rgba(255,255,255,.45)';
      g.lineWidth = 3;
      g.setLineDash([18, 16]);
      g.lineDashOffset = -(dist % 34);
      for (const x of [W / 3, (2 * W) / 3]) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, H), g.stroke());
      g.setLineDash([]);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const o of obs) {
        g.font = `${o.kind === 'cash' ? 24 : 34}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
        if (o.kind === 'tall') {
          g.fillStyle = 'rgba(224,40,63,.25)';
          g.fillRect(laneX(o.lane) - 26, o.y - 22, 52, 44);
        }
        g.fillStyle = '#000';
        g.fillText(o.e, laneX(o.lane), o.y);
      }
      const px = laneX(0) + (laneX(2) - laneX(0)) * (shown / 2);
      const hop = jumpT > 0 ? Math.sin((1 - jumpT / 0.55) * Math.PI) * 26 : 0;
      // Shadow, dust, runner.
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.ellipse(px, youY() + 18, 14 - hop / 4, 5, 0, 0, Math.PI * 2);
      g.fill();
      if (!done && Math.random() < 0.4) fx.burst(px, youY() + 16, { colors: ['#c9c3b6'], n: 1, size: 4, speed: 40, gravity: -20, life: 0.4 });
      g.font = '40px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
      g.fillStyle = '#000'; // emoji take the fill's transparency in some browsers
      g.fillText(boardT > 0 ? '🛹' : '🏃', px, youY() - hop);
      if (boardT > 0) g.fillText('🏃', px, youY() - 22);
      // The cop: as close as the gap says, frozen while eating.
      const copY = youY() + 36 + gap * (H - youY() - 30) + (stopped > 0 ? 0 : Math.sin(now / 120) * 4);
      g.fillText(stopped > 0 ? '👮🍩' : '👮', px, Math.min(H - 10, copY));
      fx.end(g);
      leftEl.textContent = `⏱️ ${Math.max(0, left).toFixed(1)}s`;
      cashEl.textContent = `💵 $${cash / 100}`;
      gapEl.style.width = `${Math.max(0, gap) * 100}%`;
      gapEl.style.background = gap > 0.5 ? '#7bd88f' : gap > 0.25 ? '#ffd23f' : '#e0283f';
      if (!done && gap <= 0.001) finish(false);
      if (!done && left <= 0) finish(true);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const move = (d: number) => {
      if (done) return;
      const n = Math.max(0, Math.min(2, lane + d));
      if (n !== lane) lastMove = performance.now();
      lane = n;
    };
    const jump = () => {
      if (done || jumpT > 0) return;
      jumpT = 0.55;
      sfx.whoosh();
    };
    let sx = 0, sy = 0;
    canvas.addEventListener('pointerdown', (e) => {
      sx = e.clientX;
      sy = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (dy < -30 && Math.abs(dy) > Math.abs(dx)) return jump();
      if (Math.abs(dx) > 30) return move(Math.sign(dx));
      const r = canvas.getBoundingClientRect();
      move(e.clientX - r.left < r.width / 2 ? -1 : 1);
    });
    el.querySelectorAll<HTMLButtonElement>('[data-mv]').forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.mv))));
    el.querySelector('[data-jump]')!.addEventListener('click', jump);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') move(-1);
      if (e.key === 'ArrowRight' || e.key === 'd') move(1);
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') (e.preventDefault(), jump());
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', size, { once: true });
  });
}
