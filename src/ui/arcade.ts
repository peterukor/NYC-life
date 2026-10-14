// =====================================================================
// arcade.ts (ui) — the five cabinets at Pixel Palace and the prize
// counter. Scores, tickets and prizes: sim/arcade.ts.
//
// 🐍 Subway Snake   classic snake on a subway map grid; eat 🍕 to grow.
// 🏀 Hoop Shot      tap in the green; the ball arcs to the rim. 30 s.
// 🐦 Pigeon Pop     whack-a-mole with pigeons in manholes (not the 🐀).
// 🎵 Beat Street    four-lane rhythm game with combos and a beat.
// 🧸 Claw Machine   the claw swings; drop it on a prize and pray.
//
// Every game is a canvas inside a modal: "insert coin" ($2) → play →
// score, tickets, best. Touch first (taps and swipes), keys work too.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { ARCADE_BY_ID, ARCADE_GAMES, PLAY_COST, PRIZES, bestScore, payToPlay, recordScore, redeem, tickets } from '../sim/arcade.ts';
import { sfx } from './audio.ts';
import { rain, type CasinoHost } from './casino.ts';
import { openModal, openSheet, onAct, toast } from './dom.ts';

const W = 360, H = 480;
type Run = (cv: HTMLCanvasElement, g: CanvasRenderingContext2D, done: (score: number) => void, hud: (text: string) => void) => () => void;

/** QA: ?arcadesec=N shortens timed games. */
function secs(n: number): number {
  const q = new URLSearchParams(location.search);
  const v = Number(q.get('arcadesec'));
  return q.get('qa') === '1' && v > 0 ? v : n;
}

function emoji(g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number): void {
  g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, x, y);
}
/** Canvas coordinates of a pointer event. */
function at(cv: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

// ================================================================= 🐍 snake
const snake: Run = (cv, g, done, hud) => {
  const C = 18, COLS = W / C, ROWS = H / C;
  let body = [{ x: 9, y: 14 }, { x: 9, y: 15 }, { x: 9, y: 16 }];
  let dir = { x: 0, y: -1 }, next = dir;
  let food = { x: 5, y: 6 };
  let score = 0, acc = 0, last = performance.now(), raf = 0, over = false;
  const placeFood = () => {
    do food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    while (body.some((b) => b.x === food.x && b.y === food.y));
  };
  const turn = (x: number, y: number) => {
    if (x !== -dir.x || y !== -dir.y) next = { x, y };
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
      // A tap: turn toward where you tapped, relative to the head.
      const h = body[0];
      const hx = h.x * C + C / 2, hy = h.y * C + C / 2;
      if (dir.x === 0) turn(p.x < hx ? -1 : 1, 0);
      else turn(0, p.y < hy ? -1 : 1);
      return;
    }
    Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy));
  };
  window.addEventListener('keydown', key);
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointerup', up);
  // The arrow pad under the screen.
  const pad = cv.parentElement!.querySelector('.arc-pad');
  pad?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-d]');
    if (!b) return;
    const [x, y] = b.dataset.d!.split(',').map(Number);
    turn(x, y);
  });
  const draw = () => {
    g.fillStyle = '#0b1320';
    g.fillRect(0, 0, W, H);
    // Subway-map grid lines.
    g.strokeStyle = '#16263a';
    g.lineWidth = 1;
    for (let x = 0; x <= COLS; x += 4) (g.beginPath(), g.moveTo(x * C, 0), g.lineTo(x * C, H), g.stroke());
    for (let y = 0; y <= ROWS; y += 4) (g.beginPath(), g.moveTo(0, y * C), g.lineTo(W, y * C), g.stroke());
    emoji(g, '🍕', food.x * C + C / 2, food.y * C + C / 2 + 1, C);
    body.forEach((b, i) => {
      // The train: MTA colours down the body.
      g.fillStyle = i === 0 ? '#ffd23f' : ['#ee352e', '#00933c', '#0039a6', '#ff6319', '#b933ad'][Math.floor(i / 3) % 5];
      g.beginPath();
      g.roundRect(b.x * C + 1, b.y * C + 1, C - 2, C - 2, 5);
      g.fill();
    });
    const h = body[0];
    g.fillStyle = '#111';
    g.fillRect(h.x * C + 5, h.y * C + 5, 3, 3);
    g.fillRect(h.x * C + C - 8, h.y * C + 5, 3, 3);
  };
  const loop = (now: number) => {
    if (over) return;
    acc += now - last;
    last = now;
    const speed = Math.max(55, 140 - score * 0.9);
    while (acc > speed) {
      acc -= speed;
      dir = next;
      const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || body.some((b) => b.x === head.x && b.y === head.y)) {
        over = true;
        sfx.bad();
        draw();
        emoji(g, '💥', head.x * C + C / 2, head.y * C + C / 2, 36);
        window.setTimeout(() => done(score), 700);
        return;
      }
      body.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        sfx.coin();
        placeFood();
      } else body.pop();
    }
    hud(`🍕 ${score}`);
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key);
  };
};

// ================================================================= 🏀 hoops
const hoops: Run = (cv, g, done, hud) => {
  const END = secs(30);
  let t0 = performance.now(), raf = 0, over = false, score = 0;
  let shot: { t: number; power: number; made: 0 | 2 | 3 } | null = null;
  let streak = 0;
  const hoop = { x: W / 2, y: 140 };
  const meter = () => (Math.sin((performance.now() - t0) / 1000 * (3.2 + score * 0.04)) + 1) / 2; // 0..1
  const tap = () => {
    if (shot || over) return;
    const p = meter();
    const d = Math.abs(p - 0.5);
    shot = { t: performance.now(), power: p, made: d < 0.05 ? 3 : d < 0.14 ? 2 : 0 };
    sfx.tap();
  };
  cv.addEventListener('pointerdown', tap);
  const key = (e: KeyboardEvent) => e.key === ' ' && (e.preventDefault(), tap());
  window.addEventListener('keydown', key);
  const loop = () => {
    if (over) return;
    const el = (performance.now() - t0) / 1000;
    const left = Math.max(0, END - el);
    // Court.
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a1036');
    grad.addColorStop(1, '#3a1d5c');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#c47a3a';
    g.fillRect(0, H - 90, W, 90);
    // Backboard and rim.
    g.fillStyle = '#f1f1f1';
    g.fillRect(hoop.x - 60, hoop.y - 80, 120, 70);
    g.strokeStyle = '#e0283f';
    g.lineWidth = 3;
    g.strokeRect(hoop.x - 22, hoop.y - 48, 44, 32);
    g.strokeStyle = '#ff6a00';
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(hoop.x, hoop.y, 28, 7, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#ffffffaa';
    g.lineWidth = 1.5;
    for (let k = -3; k <= 3; k++) (g.beginPath(), g.moveTo(hoop.x + k * 8, hoop.y + 4), g.lineTo(hoop.x + k * 5, hoop.y + 38), g.stroke());
    // The ball in flight: an arc from the bottom to the rim (or off it).
    if (shot) {
      const f = Math.min(1, (performance.now() - shot.t) / 750);
      const miss = shot.made ? 0 : (shot.power - 0.5) * 220;
      const x = W / 2 + miss * f;
      const y = (H - 120) * (1 - f) + (hoop.y - 6) * f - Math.sin(f * Math.PI) * 170;
      emoji(g, '🏀', x, y + (f >= 1 && shot.made ? 30 : 0), 40);
      if (f >= 1) {
        if (shot.made) {
          score += shot.made;
          streak++;
          sfx.win();
        } else (streak = 0), sfx.bad();
        shot = null;
      }
    } else emoji(g, '🏀', W / 2, H - 120, 40);
    // Power meter.
    const p = meter();
    g.fillStyle = '#00000088';
    g.fillRect(40, H - 46, W - 80, 18);
    g.fillStyle = '#36c46b';
    g.fillRect(40 + (W - 80) * 0.36, H - 46, (W - 80) * 0.28, 18);
    g.fillStyle = '#ffd23f';
    g.fillRect(40 + (W - 80) * 0.45, H - 46, (W - 80) * 0.1, 18);
    g.fillStyle = '#fff';
    g.fillRect(40 + (W - 80) * p - 2, H - 52, 4, 30);
    if (streak >= 3) emoji(g, '🔥', W - 40, 40, 32);
    hud(`🏀 ${score} · ⏱ ${Math.ceil(left)}s`);
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
  const holes = Array.from({ length: 9 }, (_, i) => ({ x: 70 + (i % 3) * 110, y: 150 + Math.floor(i / 3) * 110, who: '', until: 0, hit: 0 }));
  let t0 = performance.now(), raf = 0, over = false, score = 0, nextPop = 0;
  const tap = (e: PointerEvent) => {
    const p = at(cv, e);
    const now = performance.now();
    for (const h of holes) {
      if (!h.who || now > h.until || h.hit) continue;
      if (Math.hypot(p.x - h.x, p.y - (h.y - 18)) < 46) {
        h.hit = now;
        const v = h.who === '🐀' ? -20 : h.who === '🕊️' ? 30 : 10;
        score = Math.max(0, score + v);
        v > 0 ? sfx.coin() : sfx.bad();
        return;
      }
    }
  };
  cv.addEventListener('pointerdown', tap);
  const loop = () => {
    if (over) return;
    const now = performance.now();
    const el = (now - t0) / 1000;
    const left = Math.max(0, END - el);
    if (now > nextPop) {
      const free = holes.filter((h) => !h.who || now > h.until + 200);
      const h = free[Math.floor(Math.random() * free.length)];
      if (h) {
        const r = Math.random();
        h.who = r < 0.12 ? '🐀' : r < 0.2 ? '🕊️' : '🐦';
        h.until = now + Math.max(450, 1100 - el * 18);
        h.hit = 0;
      }
      nextPop = now + Math.max(260, 700 - el * 14);
    }
    g.fillStyle = '#5c6470';
    g.fillRect(0, 0, W, H);
    // Street: lane lines and a crosswalk.
    g.fillStyle = '#f1f1f1';
    for (let k = 0; k < 8; k++) g.fillRect(20 + k * 42, 36, 24, 50);
    for (const h of holes) {
      g.fillStyle = '#2b2d33';
      g.beginPath();
      g.ellipse(h.x, h.y + 16, 46, 16, 0, 0, Math.PI * 2);
      g.fill();
      const up = h.who && now < h.until;
      if (up) {
        const life = Math.min(1, (now - (h.until - 900)) / 150);
        const y = h.y + 6 - 26 * Math.max(0, life);
        if (h.hit) {
          emoji(g, h.who === '🐀' ? '😬' : '💫', h.x, y - 6, 40);
        } else emoji(g, h.who, h.x, y, 44);
      }
      // Manhole lid edge (in front of whoever's popping out).
      g.strokeStyle = '#8a8f99';
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(h.x, h.y + 16, 46, 16, 0, 0, Math.PI);
      g.stroke();
    }
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
const beats: Run = (cv, g, done, hud) => {
  const END = secs(40);
  const LANES = 4, LW = W / LANES, LINE = H - 80, SPEED = 260; // px per second
  const colors = ['#ff4fa3', '#36c5f0', '#ffd23f', '#7bd88f'];
  const notesOf = ['🎵', '🎶', '🎵', '🎶'];
  const scale = [523, 587, 659, 784, 880];
  const notes: { lane: number; t: number; hit: boolean; missed: boolean }[] = [];
  // A beat map: 120 bpm, busier as it goes, with some doubles.
  for (let t = 1.2; t < END; t += 0.5) {
    const busy = t / END;
    if (Math.random() < 0.55 + busy * 0.4) notes.push({ lane: Math.floor(Math.random() * LANES), t, hit: false, missed: false });
    if (busy > 0.5 && Math.random() < 0.25) notes.push({ lane: Math.floor(Math.random() * LANES), t: t + 0.25, hit: false, missed: false });
  }
  let t0 = performance.now(), raf = 0, over = false, score = 0, combo = 0, flash: { lane: number; word: string; at: number } | null = null;
  const hitLane = (lane: number) => {
    const now = (performance.now() - t0) / 1000;
    let best: (typeof notes)[number] | null = null;
    let bd = 1e9;
    for (const n of notes) {
      if (n.lane !== lane || n.hit || n.missed) continue;
      const d = Math.abs(n.t - now) * SPEED;
      if (d < bd) (bd = d), (best = n);
    }
    if (best && bd < 44) {
      best.hit = true;
      combo++;
      const pts = (bd < 18 ? 10 : 5) * (1 + Math.floor(combo / 10));
      score += pts;
      flash = { lane, word: bd < 18 ? 'PERFECT' : 'GOOD', at: performance.now() };
      // Every hit plays a note of the scale: you're playing the song.
      sfx.note(scale[(lane + combo) % scale.length]);
    } else {
      combo = 0;
      flash = { lane, word: 'MISS', at: performance.now() };
    }
  };
  cv.addEventListener('pointerdown', (e) => hitLane(Math.min(LANES - 1, Math.floor(at(cv, e).x / LW))));
  const key = (e: KeyboardEvent) => {
    const i = ['d', 'f', 'j', 'k'].indexOf(e.key.toLowerCase());
    if (i >= 0) hitLane(i);
  };
  window.addEventListener('keydown', key);
  const loop = () => {
    if (over) return;
    const now = (performance.now() - t0) / 1000;
    g.fillStyle = '#120a24';
    g.fillRect(0, 0, W, H);
    for (let l = 0; l < LANES; l++) {
      g.fillStyle = l % 2 ? '#1a1033' : '#170d2e';
      g.fillRect(l * LW, 0, LW, H);
    }
    // Pulsing hit line on the beat.
    const pulse = 0.5 + 0.5 * Math.cos((now % 0.5) / 0.5 * Math.PI * 2);
    g.fillStyle = `rgba(255,255,255,${0.25 + pulse * 0.35})`;
    g.fillRect(0, LINE - 2, W, 4);
    for (let l = 0; l < LANES; l++) {
      g.strokeStyle = colors[l];
      g.lineWidth = 3;
      g.beginPath();
      g.arc(l * LW + LW / 2, LINE, 24, 0, Math.PI * 2);
      g.stroke();
    }
    for (const n of notes) {
      if (n.hit) continue;
      const y = LINE - (n.t - now) * SPEED;
      if (y > LINE + 44 && !n.missed) (n.missed = true), (combo = 0);
      if (y < -30 || y > H + 30) continue;
      g.fillStyle = colors[n.lane];
      g.beginPath();
      g.arc(n.lane * LW + LW / 2, y, 20, 0, Math.PI * 2);
      g.fill();
      emoji(g, notesOf[n.lane], n.lane * LW + LW / 2, y + 1, 20);
    }
    if (flash && performance.now() - flash.at < 400) {
      g.fillStyle = flash.word === 'MISS' ? '#e0283f' : flash.word === 'PERFECT' ? '#ffd23f' : '#7bd88f';
      g.font = 'bold 18px system-ui';
      g.textAlign = 'center';
      g.fillText(flash.word, flash.lane * LW + LW / 2, LINE - 50);
    }
    if (combo >= 10) {
      g.fillStyle = '#ffd23f';
      g.font = 'bold 22px system-ui';
      g.textAlign = 'center';
      g.fillText(`${combo} COMBO ×${1 + Math.floor(combo / 10)}`, W / 2, 40);
    }
    hud(`🎵 ${score} · ⏱ ${Math.max(0, Math.ceil(END - now))}s`);
    if (now >= END + 0.8) {
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

// ================================================================== 🧸 claw
const claw: Run = (cv, g, done, hud) => {
  const PRIZE_POOL: [string, number][] = [['🧸', 60], ['🐦', 40], ['🍕', 25], ['🦆', 30], ['🐀', 20], ['👑', 150], ['🍩', 25], ['🦄', 90]];
  const prizes = Array.from({ length: 6 }, (_, i) => {
    const [e, v] = PRIZE_POOL[Math.floor(Math.random() * PRIZE_POOL.length)];
    return { e, v, x: 96 + i * 47 + (Math.random() - 0.5) * 12, y: H - 70 - Math.random() * 20, taken: false };
  });
  let phase: 'swing' | 'drop' | 'lift' | 'carry' | 'done' = 'swing';
  let x = W / 2, y = 60, t = 0, raf = 0, over = false, held: (typeof prizes)[number] | null = null, slipAt = -1;
  const t0 = performance.now();
  let last = t0;
  const drop = () => {
    if (phase !== 'swing') return;
    phase = 'drop';
    sfx.tap();
  };
  cv.addEventListener('pointerdown', drop);
  const key = (e: KeyboardEvent) => e.key === ' ' && (e.preventDefault(), drop());
  window.addEventListener('keydown', key);
  // After 12 s the claw drops on its own.
  const auto = window.setTimeout(drop, secs(12) * 1000);
  const loop = () => {
    if (over) return;
    const now = performance.now();
    // Moves are per second, so it plays the same at any frame rate.
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t = (now - t0) / 1000;
    if (phase === 'swing') x = W / 2 + Math.sin(t * 1.6) * (W / 2 - 40);
    else if (phase === 'drop') {
      y += 240 * dt;
      const target = prizes.filter((p) => !p.taken).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
      if (target && y >= target.y - 28) {
        const off = Math.abs(target.x - x);
        if (off < 22) {
          held = target;
          target.taken = true;
          // A grip that's a bit off-centre might slip on the way up.
          slipAt = off > 10 && Math.random() < 0.45 ? 120 + Math.random() * 160 : -1;
        }
        phase = 'lift';
      } else if (y > H - 60) phase = 'lift';
    } else if (phase === 'lift') {
      y -= 180 * dt;
      if (held && slipAt > 0 && y < slipAt) {
        held.taken = false;
        held.y = H - 70;
        held = null;
        sfx.bad();
      }
      if (y <= 60) phase = 'carry';
    } else if (phase === 'carry') {
      x -= 240 * dt;
      if (x <= 36) {
        phase = 'done';
        if (held) (sfx.jackpot(), window.setTimeout(() => done(held!.v), 600));
        else window.setTimeout(() => done(0), 600);
      }
    }
    // Machine.
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#2a1446');
    grad.addColorStop(1, '#4b1d73');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff14';
    for (let k = 0; k < 6; k++) g.fillRect(k * 70 - (t * 20) % 70, 0, 20, H); // glass glare
    g.fillStyle = '#ff4fa3';
    g.fillRect(0, H - 40, W, 40);
    g.fillStyle = '#111';
    g.fillRect(6, H - 110, 56, 70); // the chute
    emoji(g, '⬇️', 34, H - 128, 18);
    for (const p of prizes) if (!p.taken) emoji(g, p.e, p.x, p.y, 40);
    // Claw: cable, body and fingers.
    g.strokeStyle = '#ddd';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, y - 14);
    g.stroke();
    g.fillStyle = '#c0c6cf';
    g.fillRect(x - 12, y - 18, 24, 10);
    const open = phase === 'swing' || phase === 'drop' ? 12 : 4;
    g.strokeStyle = '#c0c6cf';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x - 8, y - 8);
    g.lineTo(x - 8 - open, y + 10);
    g.moveTo(x + 8, y - 8);
    g.lineTo(x + 8 + open, y + 10);
    g.stroke();
    if (held) emoji(g, held.e, x, y + 18, 36);
    hud(phase === 'swing' ? '🧸 Tap to drop!' : phase === 'done' ? (held ? `🧸 Got it: ${held.v} 🎟️` : '🧸 So close…') : '🧸 …');
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(auto);
    window.removeEventListener('keydown', key);
  };
};

const RUNS: Record<string, Run> = { snake, hoops, pigeons, beats, claw };

/** Play one cabinet: pay, play, tickets. */
export function playArcade(host: CasinoHost, id: string): void {
  const game = ARCADE_BY_ID[id];
  const run = RUNS[id];
  if (!game || !run) return;
  const s = host.state;
  const m = openModal(`<div class="arc" style="--cab:${game.color}">
    <div class="arc-top"><b>${game.emoji} ${esc(game.name)}</b><span class="arc-hud" aria-live="off"></span></div>
    <div class="arc-screen"><canvas width="${W}" height="${H}"></canvas>
      <div class="arc-over"><div class="big">${game.emoji}</div><p>${esc(game.howTo)}</p><p class="sub">Best: ${bestScore(s, id)} · 🎟️ ${tickets(s)}</p><button class="btn primary" data-go>Insert coin · ${money(PLAY_COST)}</button></div>
    </div>
    ${id === 'snake' ? '<div class="arc-pad"><button data-d="0,-1" aria-label="Up">⬆️</button><button data-d="-1,0" aria-label="Left">⬅️</button><button data-d="1,0" aria-label="Right">➡️</button><button data-d="0,1" aria-label="Down">⬇️</button></div>' : ''}
    <button class="btn ghost block" data-close>Leave the cabinet</button>
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
    if (!t.closest('[data-go]')) return;
    const why = payToPlay(s);
    if (why) return toast(why, { icon: '🕹️', tone: 'bad' });
    sfx.coin();
    host.saved();
    overlay.hidden = true;
    stop = run(cv, g, (score) => {
      stop?.();
      stop = null;
      const r = recordScore(s, id, score);
      host.saved();
      overlay.hidden = false;
      overlay.innerHTML = `<div class="big">${r.best ? '🏆' : game.emoji}</div><h3>${r.best ? 'New best!' : 'Game over'}</h3><p class="arc-score">${score}</p><p>+${r.tickets} 🎟️ · you have ${tickets(s)}</p><button class="btn primary" data-go>Play again · ${money(PLAY_COST)}</button>`;
      if (r.best) rain(m.el, '🎟️', 18);
      r.tickets ? sfx.win() : sfx.tap();
    }, (text) => (hudEl.textContent = text));
  });
}

/** The prize counter. */
export function openPrizeCounter(host: CasinoHost): void {
  const s = host.state;
  const render = () => `<p class="blurb">You have <b>${tickets(s)} 🎟️</b>. Best scores: ${ARCADE_GAMES.map((g) => `${g.emoji} ${bestScore(s, g.id)}`).join(' · ')}</p>
    <div class="travel">${PRIZES.map((p) => `<button class="opt" data-act="prize:${p.id}" ${tickets(s) < p.cost ? 'disabled aria-disabled="true"' : ''}><span style="font-size:24px">${p.emoji}</span><span class="grow"><b>${esc(p.name)}</b></span><span class="cost">${p.cost} 🎟️</span></button>`).join('')}</div>`;
  const sheet = openSheet({ emoji: '🎟️', title: 'Prize counter', sub: 'Pixel Palace', body: render() });
  onAct(sheet.body, (act) => {
    if (!act.startsWith('prize:')) return;
    const why = redeem(s, act.slice(6));
    if (why) return toast(why, { icon: '🎟️', tone: 'bad' });
    sfx.win();
    toast('Enjoy your prize!', { icon: '🎁', tone: 'good' });
    host.saved();
    sheet.body.innerHTML = render();
  });
}
