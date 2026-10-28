// =====================================================================
// 🐍 Subway Snake — you're the 1 train, running uptown on a tiled grid.
//
// Swipe (or the arrow pad, or arrow keys / WASD) to turn; a tap turns
// toward where you tapped. Turns are buffered, so two quick swipes make a
// U-turn. Every 🍕 adds a car and a little speed; eat it within its par
// (the bar up top) to keep the combo going (×2 … ×5). Five 🍕 = the next
// stop: a bonus, a station chime, and a 🚧 that blinks before it's solid.
// ✨ Golden slices pay ×5 the points (and three gold cars); 🥤 is slow-mo.
// When the next cell is a wall the brakes screech for one step: turn!
// 90 seconds; whatever's left at the end pays 5 per car.
// The rules (pure, tested): sim/arcade-snake.ts.
// =====================================================================

import { sfx } from '../audio.ts';
import { Fx } from '../juice.ts';
import { H, secs, W, type Run } from '../arcade-games.ts';
import { bar, finisher, keys, label, prerender } from './kit.ts';
import { blit, emojiSprite, glowSprite, hudOnce, numText, qaExpose, REDUCED, rng, swipes } from './classic1-kit.ts';
import {
  createSnake, snakeDeadly, snakeFinish, snakeMult, snakeStepMs, snakeTick, snakeTurn, SNAKE_COLS, SNAKE_GOLD_STEPS, SNAKE_PER_STOP, SNAKE_ROWS,
  SNAKE_SECONDS, SNAKE_SLOW_STEPS, SNAKE_STOPS, type SnakeEvent,
} from '../../sim/arcade-snake.ts';

const C = 20, TOP = 40;
const RED = '#ee352e', GOLD = '#ffc928';
const READY = 0.9;

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  color: string;
}

/** Board pixel centre of a (fractional) cell. */
const px = (x: number) => x * C + C / 2;
const py = (y: number) => TOP + y * C + C / 2;

export const snake: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const say = hudOnce(hud);
  const rand = rng((Math.random() * 2 ** 31) | 0);
  const s = createSnake(rand);
  const END = secs(SNAKE_SECONDS);
  qaExpose('snake', s);
  const events: SnakeEvent[] = [];
  const stripes: string[] = s.body.map(() => RED);
  const bulges: number[] = [];
  const debris: Debris[] = [];
  let goldCars = 0, acc = 0, elapsed = 0, ready = READY, raf = 0, over = false, squash = 0, lastMult = 1, lastSec = -1, flicker = 0;
  let stopName = SNAKE_STOPS[1], timeText = '1:30', hudKey = -1;
  const multText = numText((m) => `×${m}`);

  // ------------------------------------------------------------ input
  const turn = (dx: number, dy: number) => {
    if (fin.ended) return;
    if (snakeTurn(s, dx, dy)) sfx.tick();
  };
  const offS = swipes(cv, {
    swipe: turn,
    // A tap turns toward the finger (across the way you're going).
    tap: (x, y) => {
      const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
      const h = s.body[0];
      if (last.x === 0) turn(x < px(h.x) ? -1 : 1, 0);
      else turn(0, y < py(h.y) ? -1 : 1);
    },
  });
  const KEYS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  const offK = keys((k) => {
    const v = KEYS[k] ?? KEYS[k.toLowerCase()];
    if (v) turn(v[0], v[1]);
  });
  // The cabinet's arrow pad (buttons with data-d="dx,dy"): react on press, not on click-release.
  const pad = cv.closest('.arc')?.querySelector<HTMLElement>('.arc-pad') ?? null;
  const padDir = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-d]');
    if (!b?.dataset.d) return null;
    const [x, y] = b.dataset.d.split(',').map(Number);
    return [x, y] as const;
  };
  const padDown = (e: PointerEvent) => {
    const d = padDir(e);
    if (!d) return;
    e.preventDefault();
    turn(d[0], d[1]);
  };
  // Keyboard activation of a pad button (Enter/Space) arrives as a click with detail 0.
  const padClick = (e: MouseEvent) => {
    const d = padDir(e);
    if (d && e.detail === 0) turn(d[0], d[1]);
  };
  pad?.addEventListener('pointerdown', padDown);
  pad?.addEventListener('click', padClick);

  // ------------------------------------------------------------ art
  const bg = prerender(W, H, (c) => {
    const r = rng(7);
    // The board: worn platform tiles.
    for (let y = 0; y < SNAKE_ROWS; y++)
      for (let x = 0; x < SNAKE_COLS; x++) {
        const v = (x + y) % 2 ? 38 : 34;
        const n = Math.floor(r() * 6);
        c.fillStyle = `rgb(${v + n},${v + 2 + n},${v + 7 + n})`;
        c.fillRect(x * C, TOP + y * C, C, C);
        c.fillStyle = 'rgba(255,255,255,.035)';
        c.fillRect(x * C + 1, TOP + y * C + 1, C - 2, 1);
      }
    c.fillStyle = 'rgba(0,0,0,.35)';
    for (let x = 0; x <= SNAKE_COLS; x++) c.fillRect(x * C - 0.5, TOP, 1, H - TOP);
    for (let y = 0; y <= SNAKE_ROWS; y++) c.fillRect(0, TOP + y * C - 0.5, W, 1);
    // Grime and gum.
    for (let i = 0; i < 26; i++) {
      c.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.12})`;
      c.beginPath();
      c.ellipse(r() * W, TOP + r() * (H - TOP), 6 + r() * 22, 4 + r() * 12, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(200,200,210,.25)';
    for (let i = 0; i < 30; i++) {
      c.beginPath();
      c.arc(r() * W, TOP + r() * (H - TOP), 1 + r() * 1.5, 0, Math.PI * 2);
      c.fill();
    }
    // Overhead fluorescents: pools of light, and a vignette.
    for (const [lx, ly] of [[90, 130], [270, 130], [90, 330], [270, 330]]) {
      const gr = c.createRadialGradient(lx, ly, 10, lx, ly, 150);
      gr.addColorStop(0, 'rgba(210,235,255,.13)');
      gr.addColorStop(1, 'rgba(210,235,255,0)');
      c.fillStyle = gr;
      c.fillRect(lx - 150, ly - 150, 300, 300);
    }
    const vg = c.createRadialGradient(W / 2, TOP + 220, 140, W / 2, TOP + 220, 330);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = vg;
    c.fillRect(0, TOP, W, H - TOP);
    // The yellow platform-edge strip all the way round (the walls).
    c.fillStyle = '#e8b81f';
    c.fillRect(0, TOP, W, 4);
    c.fillRect(0, H - 4, W, 4);
    c.fillRect(0, TOP, 4, H - TOP);
    c.fillRect(W - 4, TOP, 4, H - TOP);
    c.fillStyle = 'rgba(120,80,0,.6)';
    for (let x = 3; x < W; x += 6) (c.fillRect(x, TOP + 1, 2, 2), c.fillRect(x, H - 3, 2, 2));
    for (let y = TOP + 3; y < H; y += 6) (c.fillRect(1, y, 2, 2), c.fillRect(W - 3, y, 2, 2));
    // The station sign band.
    c.fillStyle = '#111316';
    c.fillRect(0, 0, W, TOP);
    c.fillStyle = '#f4f4f4';
    c.fillRect(0, 3, W, 2);
  });
  const bullet = prerender(24, 24, (c) => {
    c.fillStyle = RED;
    c.beginPath();
    c.arc(12, 12, 11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = '900 15px Helvetica, Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('1', 12, 13);
  });
  // The headlight beam, pointing right; rotated to the train's heading.
  const beam = prerender(90, 60, (c) => {
    const gr = c.createRadialGradient(0, 30, 2, 0, 30, 90);
    gr.addColorStop(0, 'rgba(255,240,190,.55)');
    gr.addColorStop(1, 'rgba(255,240,190,0)');
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(0, 22);
    c.lineTo(90, 0);
    c.lineTo(90, 60);
    c.lineTo(0, 38);
    c.closePath();
    c.fill();
  });
  const PIZZA = emojiSprite('🍕', 40), SODA = emojiSprite('🥤', 40), CONE = emojiSprite('🚧', 40), SPARK = emojiSprite('✨', 40);
  const goldGlow = glowSprite(26, 'rgba(255,201,40,.8)');
  const foodGlow = glowSprite(18, 'rgba(255,170,90,.45)');
  const sodaGlow = glowSprite(20, 'rgba(80,190,255,.6)');
  const dangerGlow = glowSprite(18, 'rgba(255,40,40,.9)');
  const lampGlow = glowSprite(70, 'rgba(220,240,255,.35)');

  // ------------------------------------------------------------ events
  const handle = (e: SnakeEvent) => {
    switch (e.type) {
      case 'eat': {
        const x = px(e.x), y = py(e.y);
        squash = 1;
        bulges.push(0);
        if (e.kind === 'gold') {
          goldCars += 3;
          fx.stop(0.06);
          fx.flash(GOLD, 0.2);
          fx.burst(x, y, { emoji: ['✨', '🍕'], n: 10, size: 14, speed: 170 });
          fx.pop(x, y - 12, `+${e.pts}`, GOLD, 26);
          fx.shake(5, 0.15);
          sfx.jackpot();
        } else {
          fx.burst(x, y, { colors: ['#ffd166', '#e63946', '#f4a261', '#fff1c1'], n: 10, size: 4, speed: 150, life: 0.45 });
          fx.pop(x, y - 10, e.mult > 1 ? `+${e.pts} ×${e.mult}` : `+${e.pts}`, e.mult > 1 ? '#ffd166' : '#fff', e.mult > 1 ? 20 : 17);
          sfx.note(523 + Math.min(e.combo, 10) * 52);
          if (e.mult > lastMult) {
            fx.stamp(`COMBO ×${e.mult}`, '#7bd88f', 0.6);
            sfx.good();
          }
        }
        lastMult = e.mult;
        break;
      }
      case 'soda':
        fx.pop(px(e.x), py(e.y) - 10, 'SLOW-MO', '#5ec8ff', 20);
        fx.burst(px(e.x), py(e.y), { colors: ['#5ec8ff', '#fff'], n: 10, size: 3, speed: 120, life: 0.5 });
        fx.flash('#5ec8ff', 0.18);
        sfx.cork();
        break;
      case 'stop':
        stopName = SNAKE_STOPS[Math.min(e.stop + 1, SNAKE_STOPS.length - 1)];
        fx.stamp(e.name.toUpperCase(), '#fff', 1.1);
        fx.pop(W / 2, TOP + 70, `STOP BONUS +${e.bonus}`, '#7bd88f', 18);
        sfx.chime();
        break;
      case 'roadwork':
        fx.pop(px(e.x), py(e.y) - 12, '🚧 ROADWORK', '#ff9f1c', 15);
        break;
      case 'screech': {
        const h = s.body[0];
        fx.burst(px(h.x) + s.dir.x * 9, py(h.y) + s.dir.y * 9, { colors: ['#fff6a0', '#ffb347', '#fff'], n: 10, size: 3, speed: 200, life: 0.3 });
        fx.shake(3, 0.12);
        sfx.card();
        break;
      }
      case 'crash': {
        const x = px(Math.max(-0.4, Math.min(SNAKE_COLS - 0.6, e.x))), y = py(Math.max(-0.4, Math.min(SNAKE_ROWS - 0.6, e.y)));
        fx.stop(0.12);
        fx.shake(14, 0.5);
        fx.flash('#e0283f', 0.3);
        fx.burst(x, y, { colors: ['#fff6a0', '#ffb347', '#e0283f', '#fff'], n: 24, size: 4, speed: 260 });
        fx.burst(x, y, { emoji: ['💥'], n: 3, size: 26, speed: 60, gravity: 0 });
        fx.stamp('DERAILED!', '#e0283f', 1.2);
        sfx.punch();
        // The cars scatter.
        for (let i = 0; i < s.body.length; i++) {
          const b = s.body[i];
          const a = Math.random() * Math.PI * 2, sp = (REDUCED ? 30 : 80) + Math.random() * (REDUCED ? 40 : 160) * (1 - i / (s.body.length + 4));
          debris.push({ x: px(b.x), y: py(b.y), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: 0, spin: (Math.random() - 0.5) * (REDUCED ? 2 : 10), color: stripes[i] ?? RED });
        }
        fin.end(s.score, 1500);
        break;
      }
      case 'expire':
        fx.burst(px(e.x), py(e.y), { colors: ['#9aa3ad', '#d0d5db'], n: 8, size: 3, speed: 70, gravity: -40, life: 0.5 });
        break;
    }
  };

  // ------------------------------------------------------------ drawing
  const drawCar = (x: number, y: number, horiz: boolean, stripe: string, scale: number, head: boolean, ang: number) => {
    const h = 8 * scale;
    // Shadow (light from above).
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath();
    g.roundRect(x - h + 2, y - h + 3, h * 2, h * 2, 4);
    g.fill();
    g.fillStyle = head ? '#e9eef2' : '#c3cbd3';
    g.beginPath();
    g.roundRect(x - h, y - h, h * 2, h * 2, head ? 6 : 4);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    if (horiz) g.fillRect(x - h + 2, y - h + 1, h * 2 - 4, 1.5);
    else g.fillRect(x - h + 1, y - h + 2, 1.5, h * 2 - 4);
    if (head) {
      // The cab: windshield and headlights on the front, the route bullet on the roof.
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.fillStyle = '#26303b';
      g.fillRect(h - 6, -h + 3, 4, h * 2 - 6);
      g.fillStyle = '#fff6c2';
      g.fillRect(h - 1.5, -h + 2, 2, 3);
      g.fillRect(h - 1.5, h - 5, 2, 3);
      g.fillStyle = RED;
      g.fillRect(-h, -h + 2, 2, h * 2 - 4);
      g.restore();
      g.drawImage(bullet, x - 6.5, y - 6.5, 13, 13);
      return;
    }
    g.fillStyle = '#2a3440';
    if (horiz) g.fillRect(x - h + 2, y - 4, h * 2 - 4, 4);
    else g.fillRect(x - 4, y - h + 2, 4, h * 2 - 4);
    g.fillStyle = 'rgba(255,233,160,.8)';
    if (horiz) (g.fillRect(x - h + 4, y - 3, 3, 2), g.fillRect(x + 1, y - 3, 3, 2));
    else (g.fillRect(x - 3, y - h + 4, 2, 3), g.fillRect(x - 3, y + 1, 2, 3));
    g.fillStyle = stripe;
    if (horiz) g.fillRect(x - h, y + 2, h * 2, 3);
    else g.fillRect(x + 2, y - h, 3, h * 2);
  };

  const draw = (now: number, alpha: number) => {
    g.fillStyle = '#111316';
    g.fillRect(-20, -20, W + 40, H + 40);
    g.drawImage(bg, 0, 0);
    // A flickering tube.
    flicker = Math.random() < 0.02 ? 0.25 : Math.min(1, flicker + 0.08);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5 * (REDUCED ? 1 : flicker);
    g.drawImage(lampGlow, 270 - 70, 130 - 70);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const slow = s.slow > 0;
    // Roadworks (blinking until solid).
    for (const w of s.walls) {
      const x = px(w.x), y = py(w.y);
      if (w.warm > 0) {
        g.globalAlpha = Math.floor(now / 140) % 2 ? 0.75 : 0.25;
        g.strokeStyle = '#ff9f1c';
        g.lineWidth = 2;
        g.strokeRect(x - 9, y - 9, 18, 18);
      }
      blit(g, CONE, x, y, 19);
      g.globalAlpha = 1;
    }
    // Food.
    const bob = REDUCED ? 0 : Math.sin(now / 160) * 1.5;
    {
      const x = px(s.pizza.x), y = py(s.pizza.y);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(foodGlow, x - 18, y - 18);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.ellipse(x, y + 7, 7, 2.5, 0, 0, Math.PI * 2);
      g.fill();
      blit(g, PIZZA, x, y + bob - 1, 19);
    }
    if (s.gold && (s.gold.ttl > 10 || Math.floor(now / 110) % 2)) {
      const x = px(s.gold.x), y = py(s.gold.y);
      const pulse = 1 + Math.sin(now / 110) * 0.12;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(goldGlow, x - 26 * pulse, y - 26 * pulse, 52 * pulse, 52 * pulse);
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = GOLD;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * s.gold.ttl) / SNAKE_GOLD_STEPS);
      g.stroke();
      blit(g, PIZZA, x, y + bob, 21);
      blit(g, SPARK, x + 8, y - 9 + bob, 10);
    }
    if (s.soda && (s.soda.ttl > 10 || Math.floor(now / 110) % 2)) {
      const x = px(s.soda.x), y = py(s.soda.y);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(sodaGlow, x - 20, y - 20);
      g.globalCompositeOperation = 'source-over';
      blit(g, SODA, x, y + bob, 19);
    }
    // Danger: the next cell would end it (the screech window).
    if (!fin.ended && ready <= 0) {
      const d = s.queue.length ? s.queue[0] : s.dir;
      const h = s.body[0];
      if (snakeDeadly(s, h.x + d.x, h.y + d.y)) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = s.graced ? 0.9 : 0.5;
        g.drawImage(dangerGlow, px(h.x + d.x * 0.6) - 18, py(h.y + d.y * 0.6) - 18);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }
    // The train (or what's left of it).
    if (debris.length) {
      for (const d of debris) {
        g.save();
        g.translate(d.x, d.y);
        g.rotate(d.rot);
        drawCar(0, 0, true, d.color, 1, false, 0);
        g.restore();
      }
    } else {
      const n = s.body.length;
      // Couplers first, then cars tail → head.
      // Couplers: a dark-red spine so a coiled train still reads as one line.
      g.strokeStyle = '#6b1714';
      g.lineWidth = 8;
      g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const b = s.body[i], p = s.prev[i];
        const x = px(p.x + (b.x - p.x) * alpha), y = py(p.y + (b.y - p.y) * alpha);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      const h = s.body[0], hp = s.prev[0];
      const hx = px(hp.x + (h.x - hp.x) * alpha), hy = py(hp.y + (h.y - hp.y) * alpha);
      const ang = Math.atan2(s.dir.y, s.dir.x);
      // Headlight beam.
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.translate(hx, hy);
      g.rotate(ang);
      g.drawImage(beam, 6, -30);
      g.restore();
      for (let i = n - 1; i >= 0; i--) {
        const b = s.body[i], p = s.prev[i];
        const x = px(p.x + (b.x - p.x) * alpha), y = py(p.y + (b.y - p.y) * alpha);
        const nb = s.body[i === 0 ? 0 : i - 1];
        const horiz = i === 0 ? s.dir.x !== 0 : Math.abs(nb.x - b.x) >= Math.abs(nb.y - b.y);
        let scale = 1;
        for (const k of bulges) if (k === i) scale = 1.22;
        if (i === 0) scale = 1.08 + squash * 0.18;
        drawCar(x, y, horiz, stripes[i] ?? RED, scale, i === 0, ang);
      }
    }
    if (slow) {
      g.fillStyle = 'rgba(60,140,255,.10)';
      g.fillRect(0, TOP, W, H - TOP);
    }
    // ----- the station sign (top band)
    g.drawImage(bullet, 8, 10, 22, 22);
    g.font = '700 12px Helvetica, Arial, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#9aa3ad';
    g.fillText('NEXT', 36, 15);
    g.fillStyle = '#fff';
    g.font = '700 14px Helvetica, Arial, sans-serif';
    g.fillText(stopName, 36, 29);
    // Slices to the next stop.
    const got = s.eaten % SNAKE_PER_STOP;
    for (let i = 0; i < SNAKE_PER_STOP; i++) {
      g.fillStyle = i < got ? '#ffd166' : 'rgba(255,255,255,.18)';
      g.beginPath();
      g.arc(214 + i * 11, 15, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // Combo par bar.
    const m = snakeMult(s.combo);
    const parF = s.par / s.parMax;
    if (parF > 0 && ready <= 0) bar(g, 209, 26, 52, parF, m > 1 ? '#7bd88f' : '#ffd166');
    if (m > 1) label(g, multText(m), 280, 21, 16, '#7bd88f');
    label(g, timeText, W - 10, 21, 18, END - elapsed < 10 ? '#ff5a5a' : '#fff', 'right');
    if (slow) bar(g, W - 70, 33, 60, s.slow / SNAKE_SLOW_STEPS, '#5ec8ff');
    if (ready > 0) label(g, 'STAND CLEAR…', W / 2, TOP + 150, 24, '#fff');
  };

  // ------------------------------------------------------------ loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    if (!fx.frozen && !fin.ended) {
      if (ready > 0) {
        ready -= dt;
        if (ready <= 0) {
          sfx.chime();
          fx.stamp('GO!', '#7bd88f', 0.5);
        }
      } else {
        elapsed += dt;
        acc += dt * 1000;
        let step = snakeStepMs(s.eaten, s.slow > 0);
        while (acc >= step && !s.dead) {
          acc -= step;
          events.length = 0;
          snakeTick(s, rand, events);
          for (let i = 0; i < bulges.length; i++) bulges[i]++;
          while (bulges.length && bulges[0] >= s.body.length) bulges.shift();
          while (stripes.length < s.body.length) stripes.push(goldCars-- > 0 ? GOLD : RED);
          if (goldCars < 0) goldCars = 0;
          for (const e of events) handle(e);
          step = snakeStepMs(s.eaten, s.slow > 0);
        }
        if (!s.dead && elapsed >= END) {
          const bonus = snakeFinish(s);
          fx.stamp('LAST STOP!', '#ffd166', 1.4);
          fx.pop(W / 2, TOP + 200, `${s.body.length} cars · +${bonus}`, '#7bd88f', 22);
          fx.burst(W / 2, TOP + 160, { emoji: ['🎉', '🍕', '✨'], n: 16, size: 18, speed: 240 });
          sfx.cheer();
          fin.end(s.score, 1600);
        }
        const left = Math.max(0, Math.ceil(END - elapsed));
        if (left !== lastSec) {
          if (left <= 5 && left > 0 && lastSec !== -1) sfx.tick();
          lastSec = left;
          timeText = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        }
      }
    }
    squash = Math.max(0, squash - dt * 6);
    for (const d of debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 1 - dt * 2.2;
      d.vy *= 1 - dt * 2.2;
      d.rot += d.spin * dt;
      d.spin *= 1 - dt * 2;
    }
    const alpha = fin.ended || ready > 0 ? 1 : Math.min(1, acc / snakeStepMs(s.eaten, s.slow > 0));
    draw(now, alpha);
    fx.end(g);
    const m = snakeMult(s.combo) * (s.par >= 0 ? 1 : 0);
    const hk = s.score * 1000 + lastSec * 8 + m;
    if (hk !== hudKey) {
      hudKey = hk;
      say(`🍕 ${s.score} · ⏱ ${timeText}${m > 1 ? ` · 🔥×${m}` : ''}`);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    fin.cancel();
    cancelAnimationFrame(raf);
    offS();
    offK();
    pad?.removeEventListener('pointerdown', padDown);
    pad?.removeEventListener('click', padClick);
  };
};
