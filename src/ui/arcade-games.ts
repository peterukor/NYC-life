// =====================================================================
// arcade-games.ts — the seven cabinets, rebuilt to be more fun (Peter,
// 2026-10-16: "take inspirations from other games… make all the mini
// games more fun"). Each borrows what made a classic feel good:
//
// 🐍 Subway Snake   Nokia Snake + combos: eat fast for ×2…×5, golden
//                   slices, 🥤 slow-mo soda, 🚧 roadworks every 60 pts.
// 🏀 Hoop Shot      NBA Jam / Pop-A-Shot: 3 in a row = ON FIRE (×2, wide
//                   green), 💰 money balls, the hoop moves in bonus time.
// 🐦 Pigeon Pop     whack-a-mole + combos: 🕊️ golden pigeon = FRENZY,
//                   🥖 bread bag pops everything, 🐀 rats hurt.
// 🎵 Beat Street    Guitar Hero: PERFECT/GREAT/GOOD windows, a crowd
//                   meter (empty = booed off), 🔥 hype mode ×2, a grade.
// 🥪 Bodega Stack   Stack: the cut piece falls off, 3 perfects in a row
//                   grow it back, ✨ golden layers, the sky changes.
// 🛵 Delivery Dash  Subway Surfers: 💵 lines, 🧲 magnet, 🪖 helmet,
//                   ⚡ turbo, close calls, a tip streak multiplier.
// 🧸 Claw Machine   a real UFO catcher: you steer it, it sways, prizes
//                   wobble and slip, rare ✨ shiny prizes.
//
// Shared feel (ui/juice.ts): particles, floating scores, shakes, flashes,
// hit-stop and stamps. Scores stay in the same ranges as before so
// 🎟️ tickets and records still make sense.
// =====================================================================

import { sfx } from './audio.ts';
import { Combo, Fx } from './juice.ts';

export const W = 360, H = 480;
export type Run = (cv: HTMLCanvasElement, g: CanvasRenderingContext2D, done: (score: number) => void, hud: (text: string) => void) => () => void;

/** QA: ?arcadesec=N shortens timed games. */
export function secs(n: number): number {
  const q = new URLSearchParams(location.search);
  const v = Number(q.get('arcadesec'));
  return q.get('qa') === '1' && v > 0 ? v : n;
}

export function emoji(g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number): void {
  g.fillStyle = '#000'; // emoji take the fill's transparency in some browsers
  g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, x, y);
}

/** Canvas coordinates of a pointer event. */
export function at(cv: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

const DISPLAY = '"Lilita One", "Arial Black", system-ui, sans-serif';
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
  g.font = `900 ${size}px ${DISPLAY}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,.6)';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

/** A thin draining bar (combo timers, power-ups). */
function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, f: number, color: string): void {
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(x, y, w, 6);
  g.fillStyle = color;
  g.fillRect(x, y, w * Math.max(0, Math.min(1, f)), 6);
}

// ================================================================= 🐍 snake
const snake: Run = (cv, g, done, hud) => {
  const C = 18, COLS = W / C, ROWS = H / C;
  const fx = new Fx(W, H);
  const combo = new Combo(3);
  let body = [{ x: 9, y: 14 }, { x: 9, y: 15 }, { x: 9, y: 16 }];
  let dir = { x: 0, y: -1 };
  const queue: { x: number; y: number }[] = []; // buffered turns (two quick swipes both count)
  let food = { x: 5, y: 6 };
  let gold: { x: number; y: number; until: number } | null = null;
  let soda: { x: number; y: number; until: number } | null = null;
  const walls: { x: number; y: number }[] = [];
  let slowUntil = 0, score = 0, acc = 0, raf = 0, over = false, nextWall = 60, grow = 0;
  const free = (x: number, y: number) => !body.some((b) => b.x === x && b.y === y) && !walls.some((w) => w.x === x && w.y === y) && !(food.x === x && food.y === y);
  const spot = () => {
    let p: { x: number; y: number };
    do p = { x: 1 + Math.floor(Math.random() * (COLS - 2)), y: 1 + Math.floor(Math.random() * (ROWS - 2)) };
    while (!free(p.x, p.y) || Math.hypot(p.x - body[0].x, p.y - body[0].y) < 3);
    return p;
  };
  const turn = (x: number, y: number) => {
    const lastDir = queue.length ? queue[queue.length - 1] : dir;
    if ((x !== -lastDir.x || y !== -lastDir.y) && (x !== lastDir.x || y !== lastDir.y) && queue.length < 2) queue.push({ x, y });
  };
  const key = (e: KeyboardEvent) => {
    const m: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    const v = m[e.key];
    if (v) (e.preventDefault(), turn(v[0], v[1]));
  };
  let start: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => (start = at(cv, e));
  const up = (e: PointerEvent) => {
    if (!start) return;
    const p = at(cv, e);
    const dx = p.x - start.x, dy = p.y - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) {
      const h = body[0];
      const cur = queue.length ? queue[queue.length - 1] : dir;
      const hx = h.x * C + C / 2, hy = h.y * C + C / 2;
      if (cur.x === 0) turn(p.x < hx ? -1 : 1, 0);
      else turn(0, p.y < hy ? -1 : 1);
      return;
    }
    Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy));
  };
  window.addEventListener('keydown', key);
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointerup', up);
  const pad = cv.parentElement!.parentElement!.querySelector('.arc-pad');
  const padClick = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-d]');
    if (!b) return;
    const [x, y] = b.dataset.d!.split(',').map(Number);
    turn(x, y);
  };
  pad?.addEventListener('click', padClick);
  const eat = (cx: number, cy: number, pts: number, what: string) => {
    const n = combo.hit();
    const m = combo.mult(2, 5);
    score += pts * m;
    fx.burst(cx, cy, { emoji: what === 'gold' ? ['✨', '🍕'] : ['🧀', '🍅'], n: what === 'gold' ? 16 : 8, size: 14, speed: 160 });
    fx.pop(cx, cy - 10, `+${pts * m}${m > 1 ? ` ×${m}` : ''}`, what === 'gold' ? '#ffd23f' : '#fff', what === 'gold' ? 26 : 20);
    if (n >= 3 && n % 3 === 0) fx.stamp(`${n} COMBO!`, '#7bd88f', 0.7);
    if (what === 'gold') (fx.flash('#ffd23f', 0.25), sfx.jackpot());
    else sfx.note(523 + Math.min(n, 8) * 60);
  };
  const draw = (now: number) => {
    const slow = now < slowUntil;
    g.fillStyle = slow ? '#14213d' : '#0b1320';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#16263a';
    g.lineWidth = 1;
    for (let x = 0; x <= COLS; x += 4) (g.beginPath(), g.moveTo(x * C, 0), g.lineTo(x * C, H), g.stroke());
    for (let y = 0; y <= ROWS; y += 4) (g.beginPath(), g.moveTo(0, y * C), g.lineTo(W, y * C), g.stroke());
    for (const w of walls) emoji(g, '🚧', w.x * C + C / 2, w.y * C + C / 2 + 1, C);
    const bob = Math.sin(now / 150) * 1.5;
    emoji(g, '🍕', food.x * C + C / 2, food.y * C + C / 2 + 1 + bob, C + 2);
    if (gold) {
      const left = (gold.until - now) / 1000;
      if (left < 2 && Math.floor(now / 120) % 2) {
        // blinking out
      } else {
        g.fillStyle = 'rgba(255,210,63,.3)';
        g.beginPath();
        g.arc(gold.x * C + C / 2, gold.y * C + C / 2, C * (0.9 + Math.sin(now / 100) * 0.15), 0, Math.PI * 2);
        g.fill();
        emoji(g, '🍕', gold.x * C + C / 2, gold.y * C + C / 2 + 1, C + 6);
      }
    }
    if (soda) emoji(g, '🥤', soda.x * C + C / 2, soda.y * C + C / 2 + bob, C + 2);
    body.forEach((b, i) => {
      g.fillStyle = i === 0 ? '#ffd23f' : ['#ee352e', '#00933c', '#0039a6', '#ff6319', '#b933ad'][Math.floor(i / 3) % 5];
      g.beginPath();
      g.roundRect(b.x * C + 1, b.y * C + 1, C - 2, C - 2, i === 0 ? 7 : 5);
      g.fill();
      if (i > 0 && i % 3 === 1) {
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.fillRect(b.x * C + 4, b.y * C + 4, C - 8, 3); // windows
      }
    });
    const h = body[0];
    g.fillStyle = '#111';
    g.fillRect(h.x * C + 5, h.y * C + 5, 3, 3);
    g.fillRect(h.x * C + C - 8, h.y * C + 5, 3, 3);
    if (combo.alive(now)) bar(g, 10, 8, 100, combo.left(now), '#7bd88f');
    if (slow) bar(g, W - 110, 8, 100, (slowUntil - now) / 5000, '#36c5f0');
  };
  let last = performance.now();
  const loop = (now: number) => {
    const dt = fx.begin(g);
    if (!over && !fx.frozen) {
      acc += now - last;
      const slow = now < slowUntil;
      const speed = Math.max(60, 140 - score * 0.35) * (slow ? 1.8 : 1);
      while (acc > speed && !over) {
        acc -= speed;
        if (queue.length) dir = queue.shift()!;
        const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || body.some((b) => b.x === head.x && b.y === head.y) || walls.some((w) => w.x === head.x && w.y === head.y)) {
          over = true;
          sfx.punch();
          fx.shake(14, 0.5);
          fx.flash('#e0283f', 0.3);
          fx.burst(head.x * C + C / 2, head.y * C + C / 2, { emoji: ['💥', '🚃'], n: 10, size: 22 });
          fx.stamp('DERAILED!', '#e0283f', 1);
          window.setTimeout(() => done(score), 1100);
          break;
        }
        body.unshift(head);
        const cx = head.x * C + C / 2, cy = head.y * C + C / 2;
        if (head.x === food.x && head.y === food.y) {
          eat(cx, cy, 10, 'food');
          grow += 1;
          food = spot();
          // Sometimes a golden slice or a slow-mo soda shows up.
          if (!gold && Math.random() < 0.18) gold = { ...spot(), until: now + 6000 };
          if (!soda && Math.random() < 0.1) soda = { ...spot(), until: now + 7000 };
        } else if (gold && head.x === gold.x && head.y === gold.y) {
          eat(cx, cy, 50, 'gold');
          grow += 3;
          gold = null;
        } else if (soda && head.x === soda.x && head.y === soda.y) {
          slowUntil = now + 5000;
          soda = null;
          fx.pop(cx, cy, 'SLOW-MO', '#36c5f0', 22);
          sfx.chime();
        }
        if (grow > 0) grow--;
        else body.pop();
        if (score >= nextWall) {
          nextWall += 60;
          const w = spot();
          walls.push(w);
          fx.pop(w.x * C + C / 2, w.y * C, 'ROADWORK!', '#ff6319', 18);
        }
      }
      if (gold && now > gold.until) gold = null;
      if (soda && now > soda.until) soda = null;
    }
    last = now;
    void dt;
    draw(now);
    fx.end(g);
    hud(`🍕 ${score}${combo.alive() && combo.n > 1 ? ` · 🔥×${combo.mult(2, 5)}` : ''}`);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key);
    pad?.removeEventListener('click', padClick);
  };
};

// ================================================================= 🏀 hoops
const hoops: Run = (cv, g, done, hud) => {
  const END = secs(30);
  const fx = new Fx(W, H);
  const t0 = performance.now();
  let raf = 0, over = false, score = 0, streak = 0, shots = 0;
  let shot: { t: number; power: number; made: 0 | 2 | 3; money: boolean; x0: number; fire: boolean } | null = null;
  let fire = false;
  const hoop = { x: W / 2, y: 140 };
  let netKick = 0, phase = 0;
  const bonus = () => (performance.now() - t0) / 1000 > END - 10;
  const meter = () => (Math.sin(phase) + 1) / 2;
  const isMoney = () => (shots + 1) % 5 === 0;
  const tap = () => {
    if (shot || over) return;
    const p = meter();
    const d = Math.abs(p - 0.5);
    // On fire: the green zone is twice as forgiving.
    const k = fire ? 2 : 1;
    shot = { t: performance.now(), power: p, made: d < 0.05 * k ? 3 : d < 0.14 * k ? 2 : 0, money: isMoney(), x0: hoop.x, fire };
    shots++;
    sfx.whoosh();
  };
  cv.addEventListener('pointerdown', tap);
  const key = (e: KeyboardEvent) => e.key === ' ' && (e.preventDefault(), tap());
  window.addEventListener('keydown', key);
  const loop = () => {
    if (over) return;
    const dt = fx.begin(g);
    const now = performance.now();
    const el = (now - t0) / 1000;
    const left = Math.max(0, END - el);
    phase += dt * (3.2 + score * 0.03 + (fire ? 0.6 : 0));
    // Bonus time: the hoop slides side to side.
    if (bonus()) hoop.x = W / 2 + Math.sin(el * 1.8) * 90;
    netKick = Math.max(0, netKick - dt * 3);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, fire ? '#4a0d0d' : '#1a1036');
    grad.addColorStop(1, fire ? '#7a1f00' : '#3a1d5c');
    g.fillStyle = grad;
    g.fillRect(-20, -20, W + 40, H + 40);
    // The stands, and the crowd bouncing harder when you're hot.
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(-20, 214, W + 40, 30);
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.fillRect(-20, 244, W + 40, 3);
    for (let i = 0; i < 24; i++) {
      const hop = Math.abs(Math.sin(el * (fire ? 9 : 3) + i)) * (fire ? 6 : 2);
      emoji(g, ['🧍', '🙋', '🙌', '🧑'][i % 4], 15 + i * 15, 230 - hop, 14);
    }
    g.fillStyle = '#c47a3a';
    g.fillRect(-20, H - 90, W + 40, 110);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(-20, H - 90, W + 40, 3);
    // Backboard, rim, net.
    g.fillStyle = '#f1f1f1';
    g.fillRect(hoop.x - 60, hoop.y - 80, 120, 70);
    g.strokeStyle = '#e0283f';
    g.lineWidth = 3;
    g.strokeRect(hoop.x - 22, hoop.y - 48, 44, 32);
    g.strokeStyle = fire ? '#ffd23f' : '#ff6a00';
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(hoop.x, hoop.y, 28, 7, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#ffffffaa';
    g.lineWidth = 1.5;
    for (let k = -3; k <= 3; k++) (g.beginPath(), g.moveTo(hoop.x + k * 8, hoop.y + 4), g.lineTo(hoop.x + k * 5 + Math.sin(k + netKick * 20) * netKick * 6, hoop.y + 38 + netKick * 10), g.stroke());
    // The ball rack: every 5th is a 💰 money ball.
    for (let i = 0; i < 5; i++) emoji(g, (shots + i + 1) % 5 === 0 ? '🟡' : '🏀', 30 + i * 22, H - 18, 16);
    if (shot) {
      const f = Math.min(1, (now - shot.t) / 720);
      const target = hoop.x;
      const miss = shot.made ? 0 : (shot.power - 0.5) * 220;
      const x = W / 2 + (target - W / 2 + miss) * f;
      const y = (H - 120) * (1 - f) + (hoop.y - 6) * f - Math.sin(f * Math.PI) * 170;
      if (shot.fire) fx.burst(x, y, { colors: ['#ff6a00', '#ffd23f', '#e0283f'], n: 2, speed: 40, gravity: -60, life: 0.35, size: 6 });
      emoji(g, shot.money ? '🟡' : '🏀', x, y + (f >= 1 && shot.made ? 30 : 0), 40 - f * 10);
      if (f >= 1) {
        if (shot.made) {
          streak++;
          let pts = shot.made * (shot.money ? 2 : 1) * (fire ? 2 : 1) * (bonus() ? 2 : 1);
          score += pts;
          netKick = 1;
          fx.burst(target, hoop.y + 20, { emoji: shot.money ? ['💰', '✨'] : ['✨', '⭐'], n: shot.made === 3 ? 14 : 8, size: 16, up: true, speed: 220 });
          fx.pop(target, hoop.y - 30, `+${pts}`, shot.money ? '#ffd23f' : '#fff', 28);
          fx.stamp(shot.made === 3 ? 'SWISH!' : 'BUCKET!', shot.made === 3 ? '#7bd88f' : '#fff', 0.6);
          if (shot.made === 3) fx.shake(5, 0.15);
          sfx.win();
          if (streak === 3 && !fire) {
            fire = true;
            fx.stamp('🔥 ON FIRE! 🔥', '#ff6a00', 1.2);
            fx.flash('#ff6a00', 0.35);
            fx.shake(10, 0.3);
            sfx.cheer();
          }
          pts = 0;
        } else {
          if (fire) fx.stamp('Fire’s out 💨', '#aaa', 0.8);
          streak = 0;
          fire = false;
          fx.pop(W / 2 + (shot.power - 0.5) * 220, hoop.y, 'BRICK', '#e0283f', 22);
          fx.shake(6, 0.2);
          sfx.bad();
        }
        shot = null;
      }
    } else emoji(g, isMoney() ? '🟡' : '🏀', W / 2, H - 120, 40);
    // Power meter (green twice as wide on fire).
    const p = meter();
    const gw = fire ? 0.56 : 0.28, yw = fire ? 0.2 : 0.1;
    g.fillStyle = '#00000088';
    g.fillRect(40, H - 56, W - 80, 18);
    g.fillStyle = '#36c46b';
    g.fillRect(40 + (W - 80) * (0.5 - gw / 2), H - 56, (W - 80) * gw, 18);
    g.fillStyle = '#ffd23f';
    g.fillRect(40 + (W - 80) * (0.5 - yw / 2), H - 56, (W - 80) * yw, 18);
    g.fillStyle = '#fff';
    g.fillRect(40 + (W - 80) * p - 2, H - 62, 4, 30);
    if (fire) label(g, '🔥 ×2', W - 50, 30, 22, '#ff6a00');
    if (bonus()) label(g, 'BONUS ×2', 70, 30, 18, '#ffd23f');
    fx.end(g);
    hud(`🏀 ${score} · ⏱ ${Math.ceil(left)}s${streak >= 2 ? ` · 🔥${streak}` : ''}`);
    if (left <= 0 && !shot) {
      over = true;
      return done(score);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key);
  };
};

// =============================================================== 🐦 pigeons
const pigeons: Run = (cv, g, done, hud) => {
  const END = secs(30);
  const fx = new Fx(W, H);
  const combo = new Combo(1.2);
  const holes = Array.from({ length: 9 }, (_, i) => ({ x: 70 + (i % 3) * 110, y: 150 + Math.floor(i / 3) * 110, who: '', up: 0, until: 0, hit: 0 }));
  const t0 = performance.now();
  let raf = 0, over = false, score = 0, nextPop = 0, frenzyUntil = 0;
  const POINTS: Record<string, number> = { '🐦': 10, '🕊️': 40, '🐀': -25, '🥖': 0 };
  const whack = (h: (typeof holes)[number], now: number) => {
    h.hit = now;
    const y = h.y - 18;
    if (h.who === '🐀') {
      combo.break();
      score = Math.max(0, score - 25);
      fx.shake(12, 0.3);
      fx.flash('#e0283f', 0.2);
      fx.pop(h.x, y, '-25 🐀', '#e0283f', 24);
      sfx.bad();
      return;
    }
    if (h.who === '🥖') {
      // The bread bag: every pigeon on the street comes running (and gets popped).
      fx.stamp('🥖 BREAD!', '#e9c46a', 0.8);
      fx.burst(h.x, y, { emoji: '🍞', n: 12, size: 16 });
      sfx.cheer();
      for (const o of holes) if (o !== h && o.who && o.who !== '🐀' && !o.hit && now < o.until) whack(o, now);
      return;
    }
    const n = combo.hit(now);
    const m = combo.mult(4, 4);
    const pts = POINTS[h.who] * m;
    score += pts;
    fx.burst(h.x, y, { emoji: '🪶', n: h.who === '🕊️' ? 14 : 7, size: 14, speed: 150, gravity: 120 });
    fx.pop(h.x, y - 14, `+${pts}${m > 1 ? ` ×${m}` : ''}`, h.who === '🕊️' ? '#ffd23f' : '#fff', 22);
    if (h.who === '🕊️') {
      frenzyUntil = now + 4000;
      fx.stamp('🕊️ FRENZY!', '#ffd23f', 1);
      fx.flash('#ffd23f', 0.25);
      sfx.jackpot();
    } else sfx.note(587 + Math.min(n, 10) * 45);
    if (n > 0 && n % 8 === 0) fx.stamp(`${n} IN A ROW!`, '#7bd88f', 0.7);
  };
  const tap = (e: PointerEvent) => {
    const p = at(cv, e);
    const now = performance.now();
    for (const h of holes) {
      if (!h.who || now > h.until || h.hit) continue;
      if (Math.hypot(p.x - h.x, p.y - (h.y - 18)) < 48) return whack(h, now);
    }
    // Tapped an empty manhole: the combo drops.
    if (combo.n) fx.pop(p.x, p.y, 'whiff', '#aaa', 16);
    combo.break();
  };
  cv.addEventListener('pointerdown', tap);
  const loop = () => {
    if (over) return;
    fx.begin(g);
    const now = performance.now();
    const el = (now - t0) / 1000;
    const left = Math.max(0, END - el);
    const frenzy = now < frenzyUntil;
    if (now > nextPop) {
      const freeHoles = holes.filter((h) => !h.who || now > h.until + 200);
      const pops = frenzy ? 3 : el > 15 && Math.random() < 0.3 ? 2 : 1;
      for (let k = 0; k < pops; k++) {
        const h = freeHoles.splice(Math.floor(Math.random() * freeHoles.length), 1)[0];
        if (!h) break;
        const r = Math.random();
        h.who = frenzy ? '🐦' : r < 0.14 ? '🐀' : r < 0.2 ? '🕊️' : r < 0.25 ? '🥖' : '🐦';
        h.up = now;
        h.until = now + Math.max(480, 1150 - el * 18) * (frenzy ? 0.8 : 1);
        h.hit = 0;
      }
      nextPop = now + (frenzy ? 160 : Math.max(260, 700 - el * 14));
    }
    g.fillStyle = frenzy ? '#6b5a2e' : '#5c6470';
    g.fillRect(-20, -20, W + 40, H + 40);
    g.fillStyle = '#f1f1f1';
    for (let k = 0; k < 8; k++) g.fillRect(20 + k * 42, 36, 24, 50);
    for (const h of holes) {
      g.fillStyle = '#2b2d33';
      g.beginPath();
      g.ellipse(h.x, h.y + 16, 46, 16, 0, 0, Math.PI * 2);
      g.fill();
      const isUp = h.who && now < h.until;
      if (isUp) {
        // Pop up quickly, sink at the end.
        const rise = Math.min(1, (now - h.up) / 120), sink = Math.min(1, (h.until - now) / 150);
        const y = h.y + 6 - 28 * Math.min(rise, sink);
        if (h.hit) {
          const t = (now - h.hit) / 300;
          emoji(g, h.who === '🐀' ? '😬' : '💫', h.x, y - 6 - t * 20, 40);
        } else {
          // A little warning wobble for the rat.
          const wob = h.who === '🐀' ? Math.sin(now / 40) * 3 : 0;
          emoji(g, h.who, h.x + wob, y, h.who === '🕊️' ? 50 : 44);
        }
      }
      g.strokeStyle = '#8a8f99';
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(h.x, h.y + 16, 46, 16, 0, 0, Math.PI);
      g.stroke();
    }
    if (combo.alive(now) && combo.n > 1) {
      label(g, `${combo.n} combo ×${combo.mult(4, 4)}`, W / 2, H - 40, 20, '#7bd88f');
      bar(g, W / 2 - 60, H - 22, 120, combo.left(now), '#7bd88f');
    }
    if (frenzy) label(g, 'FRENZY!', W / 2, 110, 26, '#ffd23f');
    fx.end(g);
    hud(`🐦 ${score} · ⏱ ${Math.ceil(left)}s`);
    if (left <= 0) {
      over = true;
      return done(score);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    cancelAnimationFrame(raf);
  };
};

// ================================================================= 🎵 beats
// Guitar Hero rules: timing windows, a crowd meter that empties on misses
// (empty = booed off stage), a hype meter that fills with the combo and
// fires ×2 hype mode, and a letter grade at the end.
const beats: Run = (cv, g, done, hud) => {
  const END = secs(40);
  const fx = new Fx(W, H);
  const LANES = 4, LW = W / LANES, LINE = H - 80, SPEED = 270;
  const colors = ['#ff4fa3', '#36c5f0', '#ffd23f', '#7bd88f'];
  const scale = [523, 587, 659, 784, 880, 988];
  type N = { lane: number; t: number; hit: boolean; missed: boolean };
  const notes: N[] = [];
  // A beat map built from 2-bar riffs that repeat with variations (it feels like a song).
  const riff = () => Array.from({ length: 8 }, () => (Math.random() < 0.75 ? Math.floor(Math.random() * LANES) : -1));
  let a = riff(), b = riff();
  for (let bar = 0, t = 1.2; t < END; bar++) {
    if (bar % 4 === 0) [a, b] = [riff(), riff()];
    const pat = bar % 2 ? b : a;
    const busy = t / END;
    for (let i = 0; i < 8 && t < END; i++, t += 0.25) {
      if (i % 2 === 1 && busy < 0.35) continue; // off-beats only once it heats up
      if (pat[i] >= 0) notes.push({ lane: pat[i], t, hit: false, missed: false });
      if (busy > 0.6 && i % 4 === 0 && Math.random() < 0.35) notes.push({ lane: (pat[i] + 2) % LANES, t, hit: false, missed: false }); // chords
    }
  }
  const t0 = performance.now();
  let raf = 0, over = false, score = 0, combo = 0, bestCombo = 0, crowd = 0.7, hype = 0, hypeUntil = 0, hits = 0, perfects = 0;
  const glow = [0, 0, 0, 0];
  let flash: { lane: number; word: string; at: number; color: string } | null = null;
  const judge = (lane: number) => {
    if (over) return;
    const now = (performance.now() - t0) / 1000;
    let best: N | null = null, bd = 1e9;
    for (const n of notes) {
      if (n.lane !== lane || n.hit || n.missed) continue;
      const d = Math.abs(n.t - now) * SPEED;
      if (d < bd) (bd = d), (best = n);
    }
    glow[lane] = 1;
    const x = lane * LW + LW / 2;
    if (best && bd < 46) {
      best.hit = true;
      combo++;
      hits++;
      bestCombo = Math.max(bestCombo, combo);
      const [word, pts, color] = bd < 14 ? ['PERFECT', 10, '#ffd23f'] : bd < 28 ? ['GREAT', 7, '#7bd88f'] : ['GOOD', 4, '#36c5f0'];
      if (word === 'PERFECT') perfects++;
      const hyped = performance.now() < hypeUntil;
      const mult = Math.min(4, 1 + Math.floor(combo / 10)) * (hyped ? 2 : 1);
      score += (pts as number) * mult;
      crowd = Math.min(1, crowd + 0.025);
      if (!hyped) hype = Math.min(1, hype + 0.035);
      flash = { lane, word: word as string, at: performance.now(), color: color as string };
      fx.burst(x, LINE, { colors: [colors[lane], '#fff'], n: word === 'PERFECT' ? 12 : 6, speed: 200, size: 4, gravity: 200, up: true });
      sfx.note(scale[(lane + combo) % scale.length]);
      if (combo > 0 && combo % 25 === 0) fx.stamp(`${combo} COMBO!`, '#ffd23f', 0.8);
      if (hype >= 1 && !hyped) {
        hype = 0;
        hypeUntil = performance.now() + 8000;
        fx.stamp('🔥 HYPE ×2 🔥', '#ff4fa3', 1);
        fx.flash('#ff4fa3', 0.3);
        sfx.cheer();
      }
    } else {
      // Tapping with no note there: a smaller hit to the crowd than missing a note.
      miss(lane, 'MISS', 0.025);
    }
  };
  const miss = (lane: number, word: string, cost = 0.06) => {
    if (combo >= 10) fx.shake(6, 0.2);
    combo = 0;
    // The first 8 seconds you can't get booed off (warming up).
    const warm = (performance.now() - t0) / 1000 < 8;
    crowd = Math.max(warm ? 0.2 : 0, crowd - cost);
    flash = { lane, word, at: performance.now(), color: '#e0283f' };
    if (crowd <= 0 && !over) {
      over = true;
      fx.stamp('BOOED OFF 🍅', '#e0283f', 1.4);
      fx.burst(W / 2, 40, { emoji: '🍅', n: 14, size: 22, speed: 120 });
      sfx.bad();
      window.setTimeout(() => done(score), 1500);
    }
  };
  cv.addEventListener('pointerdown', (e) => judge(Math.min(LANES - 1, Math.floor(at(cv, e).x / LW))));
  const key = (e: KeyboardEvent) => {
    const i = ['d', 'f', 'j', 'k'].indexOf(e.key.toLowerCase());
    if (i >= 0) judge(i);
  };
  window.addEventListener('keydown', key);
  let lastBeat = -1;
  const loop = () => {
    const dt = fx.begin(g);
    const now = (performance.now() - t0) / 1000;
    const hyped = performance.now() < hypeUntil;
    // A soft kick on every beat.
    const beat = Math.floor(now / 0.5);
    if (beat !== lastBeat && !over && now < END) {
      lastBeat = beat;
      sfx.tick();
    }
    g.fillStyle = hyped ? '#2a0a2e' : '#120a24';
    g.fillRect(-20, -20, W + 40, H + 40);
    for (let l = 0; l < LANES; l++) {
      glow[l] = Math.max(0, glow[l] - dt * 5);
      g.fillStyle = l % 2 ? '#1a1033' : '#170d2e';
      g.fillRect(l * LW, 0, LW, H);
      if (glow[l] > 0) {
        const gr = g.createLinearGradient(0, LINE, 0, LINE - 220);
        gr.addColorStop(0, colors[l] + '88');
        gr.addColorStop(1, colors[l] + '00');
        g.globalAlpha = glow[l];
        g.fillStyle = gr;
        g.fillRect(l * LW, LINE - 220, LW, 220);
        g.globalAlpha = 1;
      }
    }
    const pulse = 0.5 + 0.5 * Math.cos(((now % 0.5) / 0.5) * Math.PI * 2);
    g.fillStyle = `rgba(255,255,255,${0.25 + pulse * 0.35})`;
    g.fillRect(0, LINE - 2, W, 4);
    for (let l = 0; l < LANES; l++) {
      g.strokeStyle = colors[l];
      g.lineWidth = 3 + glow[l] * 3;
      g.beginPath();
      g.arc(l * LW + LW / 2, LINE, 24 + glow[l] * 4, 0, Math.PI * 2);
      g.stroke();
      label(g, ['D', 'F', 'J', 'K'][l], l * LW + LW / 2, LINE + 40, 12, '#ffffff55');
    }
    for (const n of notes) {
      if (n.hit) continue;
      const y = LINE - (n.t - now) * SPEED;
      if (y > LINE + 46 && !n.missed) {
        n.missed = true;
        miss(n.lane, 'MISS');
      }
      if (y < -30 || y > H + 30 || n.missed) continue;
      g.fillStyle = hyped ? '#fff' : colors[n.lane];
      g.beginPath();
      g.arc(n.lane * LW + LW / 2, y, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.arc(n.lane * LW + LW / 2, y, 10, 0, Math.PI * 2);
      g.fill();
    }
    if (flash && performance.now() - flash.at < 450) label(g, flash.word, flash.lane * LW + LW / 2, LINE - 56 - (performance.now() - flash.at) / 20, 18, flash.color);
    // Crowd (left) and hype (right) meters.
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(8, 60, 10, 200);
    g.fillStyle = crowd > 0.5 ? '#7bd88f' : crowd > 0.25 ? '#ffd23f' : '#e0283f';
    g.fillRect(8, 60 + 200 * (1 - crowd), 10, 200 * crowd);
    emoji(g, crowd > 0.5 ? '😃' : crowd > 0.25 ? '😐' : '😬', 13, 46, 16);
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(W - 18, 60, 10, 200);
    g.fillStyle = hyped ? '#ff4fa3' : '#ff4fa3aa';
    const hf = hyped ? (hypeUntil - performance.now()) / 8000 : hype;
    g.fillRect(W - 18, 60 + 200 * (1 - hf), 10, 200 * hf);
    emoji(g, '🔥', W - 13, 46, 16);
    if (combo >= 10) label(g, `${combo} COMBO ×${Math.min(4, 1 + Math.floor(combo / 10)) * (hyped ? 2 : 1)}`, W / 2, 30, 22, '#ffd23f');
    fx.end(g);
    hud(`🎵 ${score} · ⏱ ${Math.max(0, Math.ceil(END - now))}s`);
    if (!over && now >= END + 0.8) {
      over = true;
      const acc = notes.length ? hits / notes.length : 0;
      const grade = acc > 0.95 && perfects / Math.max(1, hits) > 0.6 ? 'S' : acc > 0.9 ? 'A' : acc > 0.75 ? 'B' : acc > 0.55 ? 'C' : 'D';
      fx.stamp(`${grade} · ${Math.round(acc * 100)}%`, grade === 'S' ? '#ffd23f' : '#fff', 1.6);
      if (grade === 'S' || grade === 'A') (fx.burst(W / 2, H / 2, { emoji: ['⭐', '🎶', '✨'], n: 20, size: 20, speed: 260 }), sfx.cheer());
      // Full-song bonus for a clean run.
      if (acc > 0.9) score += Math.round(bestCombo * 2);
      window.setTimeout(() => done(score), 1700);
    }
    if (!over || performance.now() - t0 < (END + 3) * 1000) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key);
  };
};

// ================================================================= 🥪 bodega stack
// Stack, the sandwich edition. The overhang breaks off and tumbles away,
// three perfect drops in a row grow the layer back, every 10th layer is
// ✨ golden (×3), and the sky behind goes from deli to dusk to stars.
const stack: Run = (cv, g, done, hud) => {
  const LAYERS = ['🍞', '🥓', '🧀', '🥬', '🍅', '🥚', '🍗', '🧅', '🥒', '🌶️'];
  const COLORS = ['#e9c46a', '#e76f51', '#ffd166', '#80b918', '#e63946', '#fefae0', '#bc6c25', '#cdb4db', '#52b788', '#d00000'];
  const LH = 22;
  const fx = new Fx(W, H);
  type L = { x: number; w: number; c: string; e: string; gold?: boolean };
  type Chunk = { x: number; y: number; w: number; c: string; vx: number; vy: number; rot: number; spin: number };
  const placed: L[] = [{ x: W / 2 - 80, w: 160, c: '#c68b59', e: '🍞' }];
  const chunks: Chunk[] = [];
  const isGold = (n: number) => n % 10 === 0;
  let cur: L = { x: 0, w: 160, c: COLORS[1], e: LAYERS[1] };
  let dir = 1, speed = 150, score = 0, perfectRun = 0, raf = 0, over = false, camY = 0, wobble = 0, endAt = 0;
  const top = () => placed[placed.length - 1];
  const drop = () => {
    if (over) return;
    const t = top();
    const l = Math.max(cur.x, t.x), r = Math.min(cur.x + cur.w, t.x + t.w);
    const y = H - 40 + camY - (placed.length + 1) * LH;
    if (r - l <= 2) {
      over = true;
      chunks.push({ x: cur.x, y, w: cur.w, c: cur.c, vx: dir * 80, vy: -60, rot: 0, spin: dir * 3 });
      fx.shake(12, 0.4);
      fx.stamp('IT FELL! 🥪', '#e0283f', 1.2);
      sfx.bad();
      endAt = performance.now() + 1300;
      return;
    }
    const perfect = Math.abs(cur.x - t.x) < 5;
    let piece: L;
    if (perfect) {
      perfectRun++;
      // Three perfects in a row: the layer grows back a little (up to the bread's width).
      const grow = perfectRun >= 3 ? Math.min(160 - t.w, 12) : 0;
      piece = { ...cur, x: t.x - grow / 2, w: t.w + grow };
      const pts = (2 + Math.min(5, perfectRun)) * (cur.gold ? 3 : 1);
      score += pts;
      fx.pop(W / 2, y, `PERFECT${perfectRun > 1 ? ` ×${perfectRun}` : ''} +${pts}`, '#ffd166', 20);
      fx.burst(piece.x + piece.w / 2, y + LH / 2, { colors: ['#fff', '#ffd166'], n: 10 + perfectRun * 2, size: 4, speed: 160 });
      if (grow > 0) fx.pop(W / 2, y + 26, 'GROW!', '#7bd88f', 16);
      sfx.note(523 + Math.min(perfectRun, 8) * 70);
      wobble = 0;
    } else {
      perfectRun = 0;
      piece = { ...cur, x: l, w: r - l };
      // The overhang breaks off and tumbles.
      const offL = cur.x < l, cutX = offL ? cur.x : r, cutW = cur.w - (r - l);
      chunks.push({ x: cutX, y, w: cutW, c: cur.c, vx: (offL ? -1 : 1) * (60 + Math.random() * 60), vy: -40, rot: 0, spin: (offL ? -1 : 1) * (2 + Math.random() * 3) });
      const pts = cur.gold ? 3 : 1;
      score += pts;
      wobble = Math.min(1, cutW / 60);
      sfx.tap();
    }
    if (cur.gold) (fx.flash('#ffd23f', 0.2), fx.stamp('✨ GOLDEN ×3', '#ffd23f', 0.7));
    placed.push(piece);
    const n = placed.length;
    const i = n % LAYERS.length;
    speed = Math.min(430, 150 + n * 9);
    dir = Math.random() < 0.5 ? 1 : -1;
    cur = { x: dir > 0 ? -piece.w : W, w: piece.w, c: isGold(n) ? '#ffd23f' : COLORS[i], e: isGold(n) ? '✨' : LAYERS[i], gold: isGold(n) };
  };
  const loop = (now: number) => {
    const dt = fx.begin(g);
    if (!over) {
      cur.x += dir * speed * dt;
      if (cur.x > W - cur.w * 0.25) dir = -1;
      if (cur.x < -cur.w * 0.75) dir = 1;
    }
    wobble = Math.max(0, wobble - dt * 2);
    const want = Math.max(0, placed.length * LH - H * 0.5);
    camY += (want - camY) * Math.min(1, dt * 6);
    // The sky changes as the sandwich climbs: deli → sunset → night with stars.
    const hgt = placed.length;
    const sky = hgt < 15 ? ['#16213e', '#0f3460'] : hgt < 30 ? ['#ff7b54', '#3a1c71'] : ['#050816', '#1b1f3b'];
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, sky[0]);
    gr.addColorStop(1, sky[1]);
    g.fillStyle = gr;
    g.fillRect(-20, -20, W + 40, H + 40);
    if (hgt >= 30) for (let k = 0; k < 30; k++) g.fillRect((k * 97) % W, (k * 53 + camY * 0.2) % H, 2, 2);
    g.fillStyle = '#8d5524';
    g.fillRect(-20, H - 40 + camY, W + 40, 60);
    const y0 = H - 40 + camY;
    const sway = Math.sin(now / 90) * wobble * 4;
    placed.forEach((p, i) => {
      const y = y0 - (i + 1) * LH;
      if (y < -LH || y > H) return;
      const off = sway * (i / placed.length);
      g.fillStyle = p.c;
      g.beginPath();
      g.roundRect(p.x + off, y, p.w, LH - 3, 5);
      g.fill();
      if (p.gold) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.stroke();
      }
      emoji(g, p.e, p.x + off + p.w / 2, y + LH / 2, 16);
    });
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i];
      c.vy += 900 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.spin * dt;
      if (c.y > H + 60) {
        chunks.splice(i, 1);
        continue;
      }
      g.save();
      g.translate(c.x + c.w / 2, c.y + LH / 2);
      g.rotate(c.rot);
      g.fillStyle = c.c;
      g.fillRect(-c.w / 2, -LH / 2, c.w, LH - 3);
      g.restore();
    }
    if (!over) {
      const cy = y0 - (placed.length + 1) * LH;
      g.fillStyle = cur.c;
      g.beginPath();
      g.roundRect(cur.x, cy, cur.w, LH - 3, 5);
      g.fill();
      emoji(g, cur.e, cur.x + cur.w / 2, cy + LH / 2, 16);
      // A ghost guide: where the top layer is.
      g.strokeStyle = 'rgba(255,255,255,.18)';
      g.setLineDash([4, 4]);
      g.strokeRect(top().x, cy, top().w, LH - 3);
      g.setLineDash([]);
    }
    if (perfectRun >= 2) label(g, `🔥 ${perfectRun} perfect`, W / 2, 30, 18, '#ffd166');
    fx.end(g);
    hud(`🥪 ${score} · ${placed.length - 1} layers`);
    if (over && endAt && now > endAt) return done(score);
    raf = requestAnimationFrame(loop);
  };
  const tap = (e: Event) => {
    e.preventDefault();
    drop();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') tap(e);
  };
  cv.addEventListener('pointerdown', tap);
  window.addEventListener('keydown', key);
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    endAt = 0;
    cancelAnimationFrame(raf);
    cv.removeEventListener('pointerdown', tap);
    window.removeEventListener('keydown', key);
  };
};

// ================================================================= 🛵 delivery dash
// Subway Surfers on a bike lane: lines of 💵 to sweep up, power-ups
// (🧲 magnet, 🪖 helmet = one free hit, ⚡ turbo = invincible ×2), close
// calls for passing right next to trouble, and a tip streak multiplier
// that resets when you crash.
const dash: Run = (cv, g, done, hud) => {
  type O = { lane: number; y: number; e: string; kind: 'cash' | 'order' | 'bad' | 'magnet' | 'helmet' | 'turbo'; passed?: boolean };
  const BAD = ['🚪', '🕳️', '🚶', '🛴', '🚧', '🐕', '🚕'];
  const fx = new Fx(W, H);
  const obs: O[] = [];
  let lane = 1, shown = 1, lives = 3, score = 0, dist = 0, speed = 230, spawn = 0.6, raf = 0, over = false, hitT = 0, streak = 0;
  let magnetUntil = 0, turboUntil = 0, helmet = false, endAt = 0, lastLaneChange = 0;
  const lx = (l: number) => (W / 3) * (l + 0.5);
  const py = H - 90;
  const mult = () => Math.min(5, 1 + Math.floor(streak / 8)) * (performance.now() < turboUntil ? 2 : 1);
  const spawnWave = () => {
    const r = Math.random();
    if (r < 0.3) {
      // A line of cash down one lane.
      const l = Math.floor(Math.random() * 3);
      for (let k = 0; k < 5; k++) obs.push({ lane: l, y: -30 - k * 42, e: '💵', kind: 'cash' });
    } else if (r < 0.38) {
      const p = (['magnet', 'helmet', 'turbo'] as const)[Math.floor(Math.random() * 3)];
      obs.push({ lane: Math.floor(Math.random() * 3), y: -30, e: { magnet: '🧲', helmet: '🪖', turbo: '⚡' }[p], kind: p });
    } else if (r < 0.48) {
      obs.push({ lane: Math.floor(Math.random() * 3), y: -30, e: '🥡', kind: 'order' });
    } else {
      // Trouble: one or two lanes blocked (never all three).
      const a = Math.floor(Math.random() * 3);
      obs.push({ lane: a, y: -30, e: BAD[Math.floor(Math.random() * BAD.length)], kind: 'bad' });
      if (speed > 330 && Math.random() < 0.35) obs.push({ lane: (a + 1 + Math.floor(Math.random() * 2)) % 3, y: -30, e: BAD[Math.floor(Math.random() * BAD.length)], kind: 'bad' });
    }
  };
  const loop = (now: number) => {
    const dt = fx.begin(g);
    const turbo = now < turboUntil, magnet = now < magnetUntil;
    if (!over && !fx.frozen) {
      speed = Math.min(580, speed + dt * 9);
      const v = speed * (turbo ? 1.6 : 1);
      dist += v * dt;
      spawn -= dt;
      if (spawn <= 0) {
        spawnWave();
        spawn = Math.max(0.3, 0.8 - speed / 1400) * (0.7 + Math.random() * 0.6);
      }
      for (let i = obs.length - 1; i >= 0; i--) {
        const o = obs[i];
        o.y += v * dt;
        // The magnet pulls cash from the other lanes.
        if (magnet && (o.kind === 'cash' || o.kind === 'order') && o.y > py - 220 && o.y < py + 20) {
          const target = shown;
          o.lane += (target - o.lane) * Math.min(1, dt * 6);
        }
        const near = Math.abs(o.y - py) < 28;
        const same = Math.abs(o.lane - lane) < 0.5;
        if (near && same) {
          obs.splice(i, 1);
          const x = lx(lane), y = py - 10;
          if (o.kind === 'cash' || o.kind === 'order') {
            streak++;
            const pts = (o.kind === 'order' ? 25 : 10) * mult();
            score += pts;
            fx.pop(x, y - 20, `+${pts}`, o.kind === 'order' ? '#ffd23f' : '#7bd88f', o.kind === 'order' ? 24 : 18);
            fx.burst(x, y, { emoji: o.kind === 'order' ? '✨' : '💵', n: 4, size: 12, speed: 120, up: true });
            sfx.coin();
          } else if (o.kind === 'bad') {
            if (turbo) {
              // Turbo plows right through.
              fx.burst(x, y - 20, { emoji: [o.e, '💥'], n: 6, size: 20, speed: 260 });
              fx.pop(x, y - 30, 'SMASH +5', '#ffd23f', 18);
              score += 5;
              sfx.punch();
            } else if (helmet) {
              helmet = false;
              fx.stamp('🪖 SAVED!', '#36c5f0', 0.8);
              fx.shake(8, 0.25);
              sfx.punch();
            } else {
              lives--;
              streak = 0;
              hitT = 0.4;
              fx.shake(14, 0.4);
              fx.stop(0.12);
              fx.flash('#e0283f', 0.25);
              fx.burst(x, y - 10, { emoji: ['💥', '📦'], n: 6, size: 18 });
              sfx.punch();
              if (lives <= 0) {
                over = true;
                fx.stamp('WIPEOUT!', '#e0283f', 1.2);
                endAt = now + 1200;
              }
            }
          } else {
            if (o.kind === 'magnet') magnetUntil = now + 7000;
            if (o.kind === 'helmet') helmet = true;
            if (o.kind === 'turbo') turboUntil = now + 3500;
            fx.stamp({ magnet: '🧲 MAGNET', helmet: '🪖 HELMET', turbo: '⚡ TURBO ×2' }[o.kind], '#36c5f0', 0.8);
            fx.flash('#36c5f0', 0.15);
            sfx.chime();
          }
        } else if (o.kind === 'bad' && !o.passed && o.y > py + 20) {
          o.passed = true;
          // Close call: trouble in the next lane, and you only just switched away.
          if (Math.abs(o.lane - lane) === 1 && now - lastLaneChange < 400) {
            score += 5 * mult();
            fx.pop(lx(lane), py - 50, 'CLOSE! +5', '#ffd23f', 16);
          }
        } else if (o.y > H + 40) obs.splice(i, 1);
      }
    }
    shown += (lane - shown) * Math.min(1, dt * 16);
    hitT = Math.max(0, hitT - dt);
    g.fillStyle = '#2a9d8f';
    g.fillRect(-20, -20, W + 40, H + 40);
    g.globalAlpha = 0.25;
    g.fillStyle = '#000';
    g.fillRect(-20, -20, W + 40, H + 40);
    g.globalAlpha = 1;
    // Buildings scrolling by on both sides.
    for (let k = 0; k < 6; k++) {
      const y = ((k * 120 + dist * 0.6) % 720) - 120;
      g.fillStyle = ['#264653', '#3d405b', '#6d597a'][k % 3];
      g.fillRect(-14, y, 18, 90);
      g.fillRect(W - 4, y + 40, 18, 90);
    }
    g.strokeStyle = 'rgba(255,255,255,.6)';
    g.lineWidth = 3;
    g.setLineDash([20, 18]);
    g.lineDashOffset = -(dist % 38);
    for (const x of [W / 3, (2 * W) / 3]) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, H), g.stroke());
    g.setLineDash([]);
    // Speed lines in turbo.
    if (turbo) {
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 2;
      for (let k = 0; k < 10; k++) {
        const x = (k * 37 + dist) % W, y = (k * 71 + dist * 2) % H;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 40);
        g.stroke();
      }
    }
    for (const o of obs) {
      if (o.kind === 'magnet' || o.kind === 'helmet' || o.kind === 'turbo') {
        g.fillStyle = 'rgba(54,197,240,.35)';
        g.beginPath();
        g.arc(lx(o.lane), o.y, 24 + Math.sin(now / 100) * 3, 0, Math.PI * 2);
        g.fill();
      }
      emoji(g, o.e, lx(o.lane), o.y, o.kind === 'cash' ? 26 : 32);
    }
    if (hitT > 0) {
      g.fillStyle = 'rgba(255,60,60,.25)';
      g.fillRect(-20, -20, W + 40, H + 40);
    }
    const px = lx(0) + (lx(2) - lx(0)) * (shown / 2);
    if (helmet) {
      g.strokeStyle = '#36c5f0';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(px, py, 30, 0, Math.PI * 2);
      g.stroke();
    }
    if (magnet) emoji(g, '🧲', px + 22, py - 26, 16);
    emoji(g, '🛵', px, py + (turbo ? Math.sin(now / 30) * 2 : 0), 40);
    if (streak >= 8) label(g, `💵 streak ×${Math.min(5, 1 + Math.floor(streak / 8))}`, W / 2, 26, 18, '#7bd88f');
    if (turbo) bar(g, W / 2 - 50, 44, 100, (turboUntil - now) / 3500, '#ffd23f');
    if (magnet) bar(g, W / 2 - 50, 54, 100, (magnetUntil - now) / 7000, '#36c5f0');
    fx.end(g);
    const total = score + Math.floor(dist / 100);
    hud(`🛵 ${total} · ${'❤️'.repeat(Math.max(0, lives))}${helmet ? '🪖' : ''}`);
    if (over && endAt && now > endAt) return done(total);
    raf = requestAnimationFrame(loop);
  };
  const move = (d: number) => {
    if (over) return;
    const n = Math.max(0, Math.min(2, lane + d));
    if (n !== lane) (lastLaneChange = performance.now()), sfx.tick();
    lane = n;
  };
  let sx = 0;
  const down = (e: PointerEvent) => {
    e.preventDefault();
    sx = at(cv, e).x;
  };
  const up = (e: PointerEvent) => {
    const x = at(cv, e).x;
    // A swipe or a tap on either half.
    if (Math.abs(x - sx) > 30) move(Math.sign(x - sx));
    else move(x < W / 2 ? -1 : 1);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') move(-1);
    if (e.key === 'ArrowRight' || e.key === 'd') move(1);
  };
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointerup', up);
  window.addEventListener('keydown', key);
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    endAt = 0;
    cancelAnimationFrame(raf);
    cv.removeEventListener('pointerdown', down);
    cv.removeEventListener('pointerup', up);
    window.removeEventListener('keydown', key);
  };
};

// ================================================================== 🧸 claw
// A real UFO catcher: drag (or hold ◀ ▶) to steer the claw over a prize
// before the timer runs out, then DROP. The claw swings when it moves,
// the grip depends on how centred you are (and luck), prizes wobble on
// the way up and can slip, and some are ✨ shiny (double tickets).
const claw: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const PRIZE_POOL: [string, number][] = [['🧸', 60], ['🐦', 40], ['🍕', 25], ['🦆', 30], ['🐀', 20], ['👑', 150], ['🍩', 25], ['🦄', 90], ['🎧', 70], ['🗽', 110]];
  type P = { e: string; v: number; x: number; y: number; vy: number; taken: boolean; shiny: boolean };
  const prizes: P[] = Array.from({ length: 8 }, (_, i) => {
    const [e, v] = PRIZE_POOL[Math.floor(Math.random() * PRIZE_POOL.length)];
    const shiny = Math.random() < 0.15;
    return { e, v: shiny ? v * 2 : v, x: 96 + (i % 6) * 46 + (Math.random() - 0.5) * 10, y: H - 70 - (i >= 6 ? 30 : 0) - Math.random() * 10, vy: 0, taken: false, shiny };
  });
  const TIME = secs(15);
  let phase: 'aim' | 'drop' | 'grab' | 'lift' | 'carry' | 'done' = 'aim';
  let x = W / 2, tx = W / 2, y = 60, swing = 0, swingV = 0, raf = 0, over = false, held: P | null = null, grip = 0, grabT = 0, hold = 0;
  const t0 = performance.now();
  const startDrop = () => {
    if (phase !== 'aim') return;
    phase = 'drop';
    sfx.tap();
  };
  const dropBtn = cv.parentElement!.parentElement!.querySelector<HTMLElement>('[data-claw-drop]');
  const leftBtn = cv.parentElement!.parentElement!.querySelector<HTMLElement>('[data-claw-l]');
  const rightBtn = cv.parentElement!.parentElement!.querySelector<HTMLElement>('[data-claw-r]');
  const onDrop = () => startDrop();
  dropBtn?.addEventListener('click', onDrop);
  const holdOn = (d: number) => () => (hold = d);
  const holdOff = () => (hold = 0);
  leftBtn?.addEventListener('pointerdown', holdOn(-1));
  rightBtn?.addEventListener('pointerdown', holdOn(1));
  window.addEventListener('pointerup', holdOff);
  // Drag on the glass to steer; a quick tap drops.
  let downAt = 0, downX = 0;
  const pdown = (e: PointerEvent) => {
    downAt = performance.now();
    downX = at(cv, e).x;
    cv.setPointerCapture(e.pointerId);
  };
  const pmove = (e: PointerEvent) => {
    if (!downAt || phase !== 'aim') return;
    tx = Math.max(40, Math.min(W - 30, at(cv, e).x));
  };
  const pup = (e: PointerEvent) => {
    const quick = performance.now() - downAt < 220 && Math.abs(at(cv, e).x - downX) < 10;
    downAt = 0;
    if (quick) startDrop();
  };
  cv.addEventListener('pointerdown', pdown);
  cv.addEventListener('pointermove', pmove);
  cv.addEventListener('pointerup', pup);
  const key = (e: KeyboardEvent) => {
    if (e.key === ' ') (e.preventDefault(), startDrop());
    if (e.key === 'ArrowLeft') hold = -1;
    if (e.key === 'ArrowRight') hold = 1;
  };
  const keyUp = (e: KeyboardEvent) => (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (hold = 0);
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', keyUp);
  const finish = (won: P | null) => {
    phase = 'done';
    if (won) {
      fx.stamp(won.shiny ? '✨ SHINY! ✨' : 'GOT IT!', '#ffd23f', 1.2);
      fx.burst(36, H - 100, { emoji: ['🎟️', '✨', won.e], n: 18, size: 20, up: true, speed: 300 });
      fx.flash('#ffd23f', 0.3);
      sfx.jackpot();
    } else {
      fx.stamp('So close… 😩', '#aaa', 1);
      sfx.bad();
    }
    window.setTimeout(() => done(won ? won.v : 0), 1300);
  };
  const loop = () => {
    if (over) return;
    const dt = fx.begin(g);
    const now = performance.now();
    const left = Math.max(0, TIME - (now - t0) / 1000);
    if (phase === 'aim') {
      if (hold) tx = Math.max(40, Math.min(W - 30, tx + hold * 170 * dt));
      if (left <= 0) startDrop();
    }
    // The gantry eases toward the target; the claw swings from the motion (a pendulum).
    const prevX = x;
    if (phase === 'aim') x += (tx - x) * Math.min(1, dt * 5);
    const acc = (x - prevX) / Math.max(dt, 0.001);
    swingV += (-swing * 18 - acc * 0.0009 - swingV * 2.2) * dt;
    swing += swingV * dt;
    const clawX = x + Math.sin(swing) * (y - 10) * 0.35;
    if (phase === 'drop') {
      y += 240 * dt;
      const target = prizes.filter((p) => !p.taken).sort((a, b) => Math.abs(a.x - clawX) - Math.abs(b.x - clawX))[0];
      if (target && y >= target.y - 28) {
        const off = Math.abs(target.x - clawX);
        phase = 'grab';
        grabT = 0.4;
        if (off < 24) {
          held = target;
          target.taken = true;
          // How strong the grip is: centred and calm = strong.
          grip = Math.max(0, 1 - off / 26 - Math.abs(swing) * 1.5) * (0.75 + Math.random() * 0.4);
          fx.burst(target.x, target.y, { colors: ['#fff'], n: 6, size: 3, speed: 80 });
        }
      } else if (y > H - 60) (phase = 'grab'), (grabT = 0.3);
    } else if (phase === 'grab') {
      grabT -= dt;
      if (grabT <= 0) phase = 'lift';
    } else if (phase === 'lift') {
      y -= 160 * dt;
      // A weak grip wobbles, then maybe lets go.
      if (held && grip < 0.55 && y < H - 160 && Math.random() < (0.55 - grip) * dt * 3) {
        held.taken = false;
        held.y = y + 18;
        held.x = clawX;
        held.vy = 0;
        held = null;
        fx.pop(clawX, y + 20, 'SLIPPED!', '#e0283f', 20);
        fx.shake(6, 0.2);
        sfx.bad();
      }
      if (y <= 60) phase = 'carry';
    } else if (phase === 'carry') {
      x -= 200 * dt;
      if (x <= 36) finish(held);
    }
    // Dropped prizes fall back down.
    for (const p of prizes) {
      if (p.taken) continue;
      const floor = H - 70;
      if (p.y < floor) {
        p.vy += 900 * dt;
        p.y = Math.min(floor, p.y + p.vy * dt);
        if (p.y >= floor && p.vy > 200) (fx.burst(p.x, floor + 14, { colors: ['#fff'], n: 4, size: 3, speed: 60 }), (p.vy = -p.vy * 0.25));
      }
    }
    // The machine.
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#2a1446');
    grad.addColorStop(1, '#4b1d73');
    g.fillStyle = grad;
    g.fillRect(-20, -20, W + 40, H + 40);
    // Marquee lights chasing round the top.
    for (let k = 0; k < 18; k++) {
      g.fillStyle = (Math.floor(now / 120) + k) % 3 === 0 ? '#ffd23f' : '#ff4fa3';
      g.beginPath();
      g.arc(10 + k * 20, 10, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff14';
    for (let k = 0; k < 6; k++) g.fillRect(k * 70 - ((now / 50) % 70), 0, 20, H);
    g.fillStyle = '#ff4fa3';
    g.fillRect(-20, H - 40, W + 40, 60);
    g.fillStyle = '#111';
    g.fillRect(6, H - 110, 56, 70);
    emoji(g, '⬇️', 34, H - 128, 18);
    for (const p of prizes) {
      if (p.taken) continue;
      if (p.shiny) {
        g.fillStyle = `rgba(255,215,0,${0.25 + Math.sin(now / 150 + p.x) * 0.15})`;
        g.beginPath();
        g.arc(p.x, p.y, 26, 0, Math.PI * 2);
        g.fill();
      }
      emoji(g, p.e, p.x, p.y, 40);
    }
    // Aim shadow on the prizes.
    if (phase === 'aim') {
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.ellipse(clawX, H - 52, 20, 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Rail, cable, claw.
    g.fillStyle = '#888';
    g.fillRect(0, 22, W, 6);
    g.fillStyle = '#c0c6cf';
    g.fillRect(x - 14, 20, 28, 12);
    g.strokeStyle = '#ddd';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 30);
    g.lineTo(clawX, y - 14);
    g.stroke();
    g.fillStyle = '#c0c6cf';
    g.fillRect(clawX - 12, y - 18, 24, 10);
    const open = phase === 'aim' || phase === 'drop' ? 12 : held && grip < 0.55 ? 6 + Math.sin(now / 50) * 2 : 4;
    g.strokeStyle = '#c0c6cf';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(clawX - 8, y - 8);
    g.lineTo(clawX - 8 - open, y + 10);
    g.moveTo(clawX + 8, y - 8);
    g.lineTo(clawX + 8 + open, y + 10);
    g.stroke();
    if (held) emoji(g, held.e, clawX + (grip < 0.55 ? Math.sin(now / 60) * 3 : 0), y + 18, 36);
    if (phase === 'aim') {
      label(g, `${Math.ceil(left)}`, W - 30, 50, 26, left < 4 ? '#e0283f' : '#fff');
      bar(g, W / 2 - 60, 40, 120, left / TIME, left < 4 ? '#e0283f' : '#7bd88f');
    }
    fx.end(g);
    hud(phase === 'aim' ? '🧸 Steer, then DROP!' : phase === 'done' ? (held ? `🧸 Got it: ${held.v} 🎟️` : '🧸 So close…') : '🧸 …');
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    cancelAnimationFrame(raf);
    dropBtn?.removeEventListener('click', onDrop);
    window.removeEventListener('pointerup', holdOff);
    window.removeEventListener('keydown', key);
    window.removeEventListener('keyup', keyUp);
  };
};

export const RUNS: Record<string, Run> = { snake, hoops, pigeons, beats, claw, stack, dash };
