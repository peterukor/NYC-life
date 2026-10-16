// =====================================================================
// cycling.ts (ui) — race the Central Park loop (Peter, 2026-10-15; more
// fun 2026-10-16, borrowing from Mario Kart). Rules and the field:
// sim/cycling.ts.
//
// - ROCKET START: tap right as it says GO (within 0.3 s) for a boost.
//   Tap during the countdown and you wobble off the line.
// - RHYTHM: tap ⬅️ ➡️ in turn. A smooth, steady rhythm fills the cadence
//   meter (more power); mashing or the same side twice wobbles you.
// - SLIPSTREAM: ride right behind another rider to draft (free speed).
// - CORNERS: too fast and you wobble, then wipe out. Take one just under
//   the limit (a CLEAN LINE) and you shoot out of it with a boost.
// - The last stretch is the SPRINT: cadence counts double.
// =====================================================================

import { BIKE, field, finishRace, riderStats } from '../sim/cycling.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { html, onAct, root } from './dom.ts';
import { Fx } from './juice.ts';

export interface BikeHost {
  state: GameState;
  saved: () => void;
  onTime?: (seconds: number) => void;
  /** Where you finished (0 = first). */
  onRace?: (place: number) => void;
}

/** Corners: start and end (share of the loop) and the safe speed. */
const CORNERS = [
  { a: 0.22, b: 0.3, safe: 24 },
  { a: 0.52, b: 0.6, safe: 22 },
  { a: 0.8, b: 0.88, safe: 26 },
];

export function raceBike(host: BikeHost): void {
  const s = host.state;
  const racers = field();
  const me = riderStats(s);
  const el = html(`
    <div class="mg-wrap" role="dialog" aria-label="Bike race">
      <div class="mg bike">
        <div class="mg-chase-top"><b>🚴 The Loop</b><span data-time>0.0 s</span><span data-speed>0 mph</span></div>
        <canvas data-cv></canvas>
        <div class="bike-cad" aria-label="Cadence"><i data-cad></i><span>🦵 cadence</span></div>
        <div class="mg-msg" data-msg aria-live="polite">3…</div>
        <div class="row bike-pedals"><button class="btn mg-big" data-p="L" aria-label="Left pedal">⬅️</button><button class="btn mg-big" data-p="R" aria-label="Right pedal">➡️</button></div>
      </div>
    </div>`);
  root().appendChild(el);
  const cv = el.querySelector<HTMLCanvasElement>('[data-cv]')!;
  const g = cv.getContext('2d')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 300, H = cv.clientHeight || 300;
  cv.width = W * dpr;
  cv.height = H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fx = new Fx(W, H);
  const msg = el.querySelector<HTMLElement>('[data-msg]')!;
  const timeEl = el.querySelector<HTMLElement>('[data-time]')!;
  const speedEl = el.querySelector<HTMLElement>('[data-speed]')!;
  const cadEl = el.querySelector<HTMLElement>('[data-cad]')!;
  let speed = 0, pos = 0, t = -3, lastSide = '', crashT = 0, wobble = 0, done = false, raf = 0;
  let countdown = 3, lastPedal = 0, cadence = 0, boostT = 0, stall = 0, startTapped = false;
  let inCornerWas: (typeof CORNERS)[number] | null = null, cornerMax = 0;
  const intervals: number[] = [];

  const at = (u: number) => {
    const a = u * Math.PI * 2 - Math.PI / 2;
    return { x: W / 2 + Math.cos(a) * W * 0.38, y: H / 2 + Math.sin(a) * H * 0.38 };
  };
  const draw = (now: number) => {
    g.fillStyle = '#6a994e';
    g.fillRect(-20, -20, W + 40, H + 40);
    // Trees round the outside.
    g.font = '16px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000';
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      g.fillText(k % 3 ? '🌳' : '🌲', W / 2 + Math.cos(a) * W * 0.48, H / 2 + Math.sin(a) * H * 0.48);
    }
    g.fillText('🦆', W / 2 - 10, H / 2);
    g.fillText('🌊', W / 2 + 14, H / 2 + 6);
    g.strokeStyle = '#d6d3cb';
    g.lineWidth = 26;
    g.beginPath();
    g.ellipse(W / 2, H / 2, W * 0.38, H * 0.38, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#f4a261';
    for (const c of CORNERS) {
      g.beginPath();
      g.ellipse(W / 2, H / 2, W * 0.38, H * 0.38, 0, c.a * Math.PI * 2 - Math.PI / 2, c.b * Math.PI * 2 - Math.PI / 2);
      g.stroke();
    }
    // The sprint stretch.
    g.strokeStyle = 'rgba(255,210,63,.6)';
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(W / 2, H / 2, W * 0.38, H * 0.38, 0, 0.9 * Math.PI * 2 - Math.PI / 2, Math.PI * 2 - Math.PI / 2);
    g.stroke();
    const s0 = at(0);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 ? '#111' : '#fff';
      g.fillRect(s0.x - 2, s0.y - 16 + k * 8, 4, 8);
    }
    g.font = '22px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
    g.fillStyle = '#000';
    for (const r of racers) {
      const p = at(Math.min(1, Math.max(0, t) / r.time));
      g.fillText(r.emoji, p.x, p.y);
    }
    const mine = at(Math.min(1, pos / BIKE.length));
    // Speed trail.
    if (speed > 20 || boostT > 0) fx.burst(mine.x, mine.y, { colors: [boostT > 0 ? '#ffd23f' : '#ffffff'], n: 1, size: 4, speed: 10, gravity: 0, life: 0.35 });
    g.font = '30px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
    g.fillStyle = '#000';
    const wob = wobble > 0 ? Math.sin(now / 30) * 4 : 0;
    g.fillText(crashT > 0 ? '💥' : '🚴', mine.x + wob, mine.y);
    g.font = '900 14px Nunito, sans-serif';
    g.fillStyle = boostT > 0 ? '#ffd23f' : '#1c2340';
    g.fillText(boostT > 0 ? 'BOOST' : 'YOU', mine.x, mine.y - 24);
  };
  const corner = () => CORNERS.find((c) => pos / BIKE.length >= c.a && pos / BIKE.length <= c.b) ?? null;
  const finish = () => {
    done = true;
    window.removeEventListener('keydown', key);
    const r = finishRace(s, t, racers);
    host.saved();
    host.onTime?.(t);
    host.onRace?.(r.place);
    r.place === 0 ? sfx.cheer() : sfx.win();
    fx.stamp(r.place === 0 ? '🥇 WINNER!' : ['', '🥈 2ND!', '🥉 3RD!'][r.place] || `${r.place + 1}TH`, r.place === 0 ? '#ffd23f' : '#fff', 1.6);
    if (r.place === 0) fx.burst(W / 2, H / 2, { emoji: ['🏆', '✨', '🎉'], n: 22, size: 20, speed: 260 });
    msg.innerHTML = `<b>${r.text}</b>`;
    el.querySelector('.bike-pedals')!.innerHTML = '<button class="btn primary block" data-act="close">Done</button>';
  };
  const loop = (now: number) => {
    const dt = fx.begin(g);
    if (!done) {
      t += dt;
      if (t < 0) {
        const c = Math.ceil(-t);
        if (c !== countdown) {
          countdown = c;
          sfx.tick();
        }
        msg.innerHTML = `<b>${c}…</b> Tap right on GO for a rocket start!`;
      } else {
        if (countdown > 0) {
          countdown = 0;
          if (stall > 0) msg.textContent = 'You jumped the gun… wobbling off the line!';
          else msg.textContent = 'GO! Tap ⬅️ ➡️ in a steady rhythm';
          fx.stamp('GO!', '#7bd88f', 0.7);
          sfx.chime();
        }
        crashT = Math.max(0, crashT - dt);
        stall = Math.max(0, stall - dt);
        boostT = Math.max(0, boostT - dt);
        // Cadence decays if you stop.
        if (now - lastPedal > 450) cadence = Math.max(0, cadence - dt * 1.5);
        const c = corner();
        const coasting = now - lastPedal > 250;
        speed = Math.max(0, speed - dt * ((c && coasting ? 22 : 6) + speed * 0.12));
        // Slipstream: right behind a rider.
        const u = pos / BIKE.length;
        const drafting = racers.some((r) => {
          const ru = Math.min(1, Math.max(0, t) / r.time);
          return ru - u > 0.004 && ru - u < 0.025;
        });
        if (drafting) speed = Math.min(me.top + 3, speed + dt * 4);
        if (boostT > 0) speed = Math.min(me.top + 8, speed + dt * 30);
        if (crashT > 0 || stall > 0) speed = Math.min(speed, 4);
        pos += speed * dt * 0.95;
        // Corners: too fast wobbles, then crashes; a clean line boosts you out.
        const ahead = !c && CORNERS.find((k) => u >= k.a - 0.05 && u < k.a);
        if (c) cornerMax = Math.max(cornerMax, speed);
        if (c && speed > c.safe && crashT <= 0) {
          wobble += dt;
          msg.textContent = '⚠️ Too fast for the corner! Ease off!';
          if (wobble > 0.9) {
            crashT = 2.5;
            wobble = 0;
            speed = 0;
            cadence = 0;
            fx.shake(12, 0.4);
            fx.burst(at(u).x, at(u).y, { emoji: ['💥', '⭐', '🍃'], n: 10, size: 16 });
            sfx.punch();
            msg.textContent = '💥 Wiped out! Back on the bike…';
          }
        } else {
          wobble = Math.max(0, wobble - dt);
          if (crashT <= 0) {
            if (ahead) msg.textContent = `🟠 Corner ahead! Ease off below ${ahead.safe} mph.`;
            else if (c) msg.textContent = `🟠 In the corner: keep it under ${c.safe} mph.`;
            else if (drafting) msg.textContent = '💨 Slipstream! Free speed behind them.';
            else if (u > 0.9) msg.textContent = '🏁 SPRINT! Rhythm counts double!';
            else if (/Corner|Ease off|Wiped|corner|Slipstream|jumped|GO!/.test(msg.textContent ?? '')) msg.textContent = 'Clear! Keep the rhythm ⬅️ ➡️';
          }
        }
        // Coming out of a corner: was it clean?
        if (inCornerWas && !c) {
          if (crashT <= 0 && cornerMax > inCornerWas.safe - 4 && cornerMax <= inCornerWas.safe) {
            boostT = 1.2;
            fx.pop(at(u).x, at(u).y - 20, 'CLEAN LINE! 🚀', '#7bd88f', 18);
            sfx.chime();
          }
          cornerMax = 0;
        }
        inCornerWas = c;
        if (pos >= BIKE.length) finish();
      }
      timeEl.textContent = `${Math.max(0, t).toFixed(1)} s`;
      speedEl.textContent = `${Math.round(speed)} mph`;
      cadEl.style.width = `${cadence * 100}%`;
      cadEl.style.background = cadence > 0.75 ? '#ffd23f' : '#7bd88f';
    }
    draw(now);
    fx.end(g);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const pedal = (side: string) => {
    if (done) return;
    const now = performance.now();
    if (t < 0) {
      // Jumping the gun.
      if (!startTapped && t < -0.15) {
        startTapped = true;
        stall = 1.2 - t * 0.2;
        fx.pop(W / 2, H / 2, 'TOO EARLY!', '#e0283f', 20);
        sfx.bad();
      }
      return;
    }
    if (!startTapped && t < 0.3) {
      startTapped = true;
      boostT = 1.5;
      speed = Math.min(me.top, 14);
      fx.stamp('🚀 ROCKET START!', '#ffd23f', 1);
      fx.flash('#ffd23f', 0.2);
      sfx.cheer();
    }
    startTapped = true;
    if (crashT > 0 || stall > 0) return;
    if (side === lastSide) {
      speed = Math.max(0, speed - 2);
      cadence = Math.max(0, cadence - 0.2);
      wobble = Math.min(0.5, wobble + 0.1);
      return;
    }
    // Rhythm: steady gaps of 0.16–0.34 s build cadence; mashing or dawdling doesn't.
    const gap = (now - lastPedal) / 1000;
    if (lastPedal) intervals.push(gap);
    if (intervals.length > 6) intervals.shift();
    const avg = intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length);
    const steady = intervals.length >= 3 && intervals.every((x) => Math.abs(x - avg) < 0.08);
    const good = gap > 0.16 && gap < 0.34;
    cadence = Math.max(0, Math.min(1, cadence + (good && steady ? 0.12 : good ? 0.05 : -0.08)));
    lastSide = side;
    lastPedal = now;
    const sprint = pos / BIKE.length > 0.9 ? 2 : 1;
    speed = Math.min(me.top + (cadence > 0.75 ? 2 : 0), speed + 3.4 * me.accel * (0.7 + cadence * 0.5 * sprint));
    if (cadence > 0.75 && Math.random() < 0.15) fx.pop(at(pos / BIKE.length).x, at(pos / BIKE.length).y - 30, 'IN THE ZONE', '#ffd23f', 14);
  };
  el.querySelectorAll<HTMLButtonElement>('[data-p]').forEach((b) =>
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pedal(b.dataset.p!);
    }),
  );
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') pedal('L');
    if (e.key === 'ArrowRight' || e.key === 'd') pedal('R');
  };
  window.addEventListener('keydown', key);
  onAct(el, (act) => {
    if (act === 'close') {
      cancelAnimationFrame(raf);
      el.remove();
    }
  });
}
