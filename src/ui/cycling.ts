// =====================================================================
// cycling.ts (ui) — race the Central Park loop (Peter, 2026-10-15).
// Rules and the field: sim/cycling.ts.
//
// Tap ⬅️ and ➡️ in turn to pedal (the same side twice wobbles you).
// Three corners on the loop: go into one too fast and you wipe out
// (a few seconds lost). The regulars ride their times; beat them.
// =====================================================================

import { BIKE, field, finishRace, riderStats } from '../sim/cycling.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { html, onAct, root } from './dom.ts';

export interface BikeHost {
  state: GameState;
  saved: () => void;
  onTime?: (seconds: number) => void;
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
  const msg = el.querySelector<HTMLElement>('[data-msg]')!;
  const timeEl = el.querySelector<HTMLElement>('[data-time]')!;
  const speedEl = el.querySelector<HTMLElement>('[data-speed]')!;
  let speed = 0, pos = 0, t = -3, lastSide = '', crashT = 0, wobble = 0, done = false, raf = 0, last = performance.now();
  let countdown = 3;
  let lastPedal = 0;

  // The loop as an oval; `u` 0..1 round it.
  const at = (u: number) => {
    const a = u * Math.PI * 2 - Math.PI / 2;
    return { x: W / 2 + Math.cos(a) * W * 0.38, y: H / 2 + Math.sin(a) * H * 0.38 };
  };
  const draw = () => {
    g.fillStyle = '#6a994e';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#d6d3cb';
    g.lineWidth = 26;
    g.beginPath();
    g.ellipse(W / 2, H / 2, W * 0.38, H * 0.38, 0, 0, Math.PI * 2);
    g.stroke();
    // Corners in orange.
    g.strokeStyle = '#f4a261';
    for (const c of CORNERS) {
      g.beginPath();
      g.ellipse(W / 2, H / 2, W * 0.38, H * 0.38, 0, c.a * Math.PI * 2 - Math.PI / 2, c.b * Math.PI * 2 - Math.PI / 2);
      g.stroke();
    }
    // Start line.
    const s0 = at(0);
    g.fillStyle = '#fff';
    g.fillRect(s0.x - 2, s0.y - 16, 4, 32);
    g.font = '22px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const r of racers) {
      const p = at(Math.min(1, Math.max(0, t) / r.time));
      g.fillText(r.emoji, p.x, p.y);
    }
    const mine = at(Math.min(1, pos / BIKE.length));
    g.font = '30px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
    g.fillText(crashT > 0 ? '💥' : '🚴', mine.x, mine.y);
    g.font = '900 14px Nunito, sans-serif';
    g.fillStyle = '#1c2340';
    g.fillText('YOU', mine.x, mine.y - 24);
  };
  const corner = () => CORNERS.find((c) => pos / BIKE.length >= c.a && pos / BIKE.length <= c.b) ?? null;
  const finish = () => {
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key);
    const r = finishRace(s, t, racers);
    host.saved();
    host.onTime?.(t);
    r.place === 0 ? sfx.cheer() : sfx.win();
    msg.innerHTML = `<b>${r.text}</b>`;
    el.querySelector('.bike-pedals')!.innerHTML = '<button class="btn primary block" data-act="close">Done</button>';
  };
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!done) {
      t += dt;
      if (t < 0) {
        const c = Math.ceil(-t);
        if (c !== countdown) {
          countdown = c;
          sfx.tick();
        }
        msg.textContent = `${c}…`;
      } else {
        if (countdown > 0) {
          countdown = 0;
          msg.textContent = 'GO! Tap ⬅️ ➡️ ⬅️ ➡️';
          sfx.chime();
        }
        crashT = Math.max(0, crashT - dt);
        const inCorner = !!corner();
        // Drag; stop pedalling in a corner and you brake hard.
        const coasting = performance.now() - lastPedal > 250;
        speed = Math.max(0, speed - dt * ((inCorner && coasting ? 22 : 6) + speed * 0.12));
        if (crashT > 0) speed = Math.min(speed, 4);
        pos += speed * dt * 0.95;
        // Too fast into a corner: you start to wobble; keep it up and you go down.
        const c = corner();
        const ahead = !c && CORNERS.find((k) => pos / BIKE.length >= k.a - 0.05 && pos / BIKE.length < k.a);
        if (ahead && crashT <= 0) msg.textContent = `🟠 Corner ahead! Ease off below ${ahead.safe} mph.`;
        if (c && speed > c.safe && crashT <= 0) {
          wobble += dt;
          msg.textContent = '⚠️ Too fast for the corner! Ease off!';
          if (wobble > 0.9) {
            crashT = 2.5;
            wobble = 0;
            speed = 0;
            sfx.punch();
            msg.textContent = '💥 Wiped out! Back on the bike…';
          }
        } else {
          wobble = Math.max(0, wobble - dt);
          if (crashT <= 0) {
            if (c) msg.textContent = `🟠 In the corner: keep it under ${c.safe} mph.`;
            else if (!ahead && /Corner|Ease off|Wiped|corner/.test(msg.textContent ?? '')) msg.textContent = 'Clear! Pedal! ⬅️ ➡️';
          }
        }
        if (pos >= BIKE.length) finish();
      }
      timeEl.textContent = `${Math.max(0, t).toFixed(1)} s`;
      speedEl.textContent = `${Math.round(speed)} mph`;
    }
    draw();
    if (!done) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const pedal = (side: string) => {
    if (done || t < 0 || crashT > 0) return;
    if (side === lastSide) {
      speed = Math.max(0, speed - 2); // same pedal twice: wobble
      return;
    }
    lastSide = side;
    lastPedal = performance.now();
    speed = Math.min(me.top, speed + 3.4 * me.accel);
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
    if (act === 'close') el.remove();
  });
}
