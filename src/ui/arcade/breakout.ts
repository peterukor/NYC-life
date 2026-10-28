// =====================================================================
// 🧱 Brooklyn Breakout — brick breaker on a brownstone.
//
// Drag anywhere to slide the 🚕 paddle; lift your finger (or Space) to
// launch. Where the ball hits the cab aims it. Bricks broken without
// touching the paddle build a chain (×2…×5). 🪟 windows take two hits,
// ⛓️ fire escapes don't break (except to 🔥), ✨ gold bricks pay big.
// Power-ups fall from broken bricks: 🎱 multi-ball, ↔️ wide cab,
// 🔥 fireball, ❤️ extra ball. Clear the wall for the next block.
// 90 seconds, three balls. Keys: ← → and Space.
// =====================================================================

import { sfx } from '../audio.ts';
import { Fx } from '../juice.ts';
import { emoji, H, W, secs, type Run } from '../arcade-games.ts';
import { bar, clamp, finisher, keys, label, pointers, prerender } from './kit.ts';

const COLS = 8, BW = 40, BH = 16, GAP = 3, X0 = 13, Y0 = 58;
const PY = 436, PH = 12, BR = 6;
const LEVELS: { name: string; rows: string[] }[] = [
  { name: 'Park Slope', rows: ['11111111', '12211221', '12211221', '11111111', '12211221', '12211221', '11144111'] },
  { name: 'Fire Escapes', rows: ['55555555', '13311331', '12211221', '13311331', '12211221', '13311331', '11444411'] },
  { name: 'The Stoop', rows: ['...44...', '..1221..', '.122221.', '11233211', '12211221', '33111133', '11111111', '22222222'] },
  { name: 'Bed-Stuy Row', rows: ['45555554', '12121212', '21212121', '33.33.33', '12222221', '12244221', '11111111', '55555555'] },
];
type Kind = 'multi' | 'wide' | 'fire' | 'life';
const POWER: Record<Kind, { e: string; c: string }> = {
  multi: { e: '🎱', c: '#36c5f0' },
  wide: { e: '↔️', c: '#7bd88f' },
  fire: { e: '🔥', c: '#ff6a00' },
  life: { e: '❤️', c: '#ff4fa3' },
};

interface Brick {
  x: number;
  y: number;
  t: number; // 1 brownstone, 2 window, 3 steel, 4 gold, 5 garden
  hp: number;
  hit: number;
}
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean;
  off: number;
}
interface Drop {
  x: number;
  y: number;
  k: Kind;
}

export const breakout: Run = (cv, g, done, hud) => {
  const END = secs(90);
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const t0 = performance.now();
  let raf = 0, over = false, score = 0, lives = 3, level = 0, chain = 0, bestChain = 0;
  let px = W / 2, tx = W / 2, pw = 64, wideUntil = 0, fireUntil = 0, squash = 0, clearPause = 0;
  let bricks: Brick[] = [];
  const balls: Ball[] = [];
  const drops: Drop[] = [];
  const trail = new Float32Array(20); // the first ball's trail: 10 points
  let trailI = 0;

  const speed = () => 300 + Math.min(level, 6) * 22;
  const build = () => {
    const L = LEVELS[level % LEVELS.length];
    bricks = [];
    L.rows.forEach((row, r) => {
      for (let c = 0; c < COLS; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        const t = Number(ch);
        bricks.push({ x: X0 + c * (BW + GAP), y: Y0 + r * (BH + GAP), t, hp: t === 2 ? 2 : 1, hit: 0 });
      }
    });
  };
  const serve = () => {
    balls.length = 0;
    balls.push({ x: px, y: PY - BR, vx: 0, vy: 0, stuck: true, off: 0 });
    stuckAt = performance.now();
  };
  let stuckAt = performance.now();
  build();
  serve();

  const launch = () => {
    for (const b of balls) {
      if (!b.stuck) continue;
      b.stuck = false;
      const a = b.off * 0.9 + (Math.random() - 0.5) * 0.2;
      b.vx = Math.sin(a) * speed();
      b.vy = -Math.cos(a) * speed();
      sfx.whoosh();
    }
  };
  const offP = pointers(cv, {
    down: (t) => (tx = t.x),
    move: (t) => (tx = t.x),
    up: () => launch(),
  });
  let keyDir = 0;
  const offK = keys(
    (k) => {
      if (k === 'ArrowLeft') keyDir = -1;
      if (k === 'ArrowRight') keyDir = 1;
      if (k === ' ' || k === 'ArrowUp') launch();
    },
    (k) => (k === 'ArrowLeft' || k === 'ArrowRight') && (keyDir = 0),
  );

  const breakBrick = (k: Brick) => {
    k.hit = 0.15;
    if (k.t === 3) {
      sfx.tick();
      return;
    }
    k.hp--;
    const cx = k.x + BW / 2, cy = k.y + BH / 2;
    if (k.hp > 0) {
      fx.burst(cx, cy, { colors: ['#bfe8ff', '#fff'], n: 5, size: 3, speed: 90, life: 0.3 });
      sfx.clink();
      return;
    }
    chain++;
    bestChain = Math.max(bestChain, chain);
    const m = Math.min(5, 1 + Math.floor(chain / 4));
    const base = k.t === 4 ? 60 : k.t === 2 ? 20 : 10;
    const pts = base * m;
    score += pts;
    fx.pop(cx, cy, `+${pts}${m > 1 ? ` ×${m}` : ''}`, k.t === 4 ? '#ffd23f' : m > 2 ? '#ff9f1c' : '#fff', k.t === 4 ? 22 : 16);
    fx.burst(cx, cy, {
      colors: k.t === 4 ? ['#ffd23f', '#fff4b0'] : k.t === 2 ? ['#bfe8ff', '#ffd27a'] : k.t === 5 ? ['#3fae5a', '#7bd88f'] : ['#8a4b2a', '#b5653a', '#5b2e1a'],
      n: k.t === 4 ? 16 : 9,
      size: 4,
      speed: 170,
    });
    if (k.t === 4) (sfx.coin(), fx.shake(5, 0.12));
    else sfx.note(392 + Math.min(chain, 14) * 45);
    fx.shake(fireUntil > performance.now() ? 3 : 1.5, 0.06);
    if (chain > 0 && chain % 8 === 0) fx.stamp(`${chain} CHAIN! ×${m}`, '#ff9f1c', 0.7);
    // Power-ups.
    if (Math.random() < (k.t === 4 ? 0.6 : 0.13)) {
      const r = Math.random();
      const kind: Kind = r < 0.32 ? 'multi' : r < 0.62 ? 'wide' : r < 0.92 ? 'fire' : 'life';
      drops.push({ x: cx, y: cy, k: kind });
    }
  };
  const power = (k: Kind, now: number) => {
    const P = POWER[k];
    fx.flash(P.c, 0.18);
    sfx.chime();
    if (k === 'multi') {
      const src = balls.filter((b) => !b.stuck).slice(0, 4);
      if (!src.length) launch();
      for (const b of src) {
        for (const da of [-0.45, 0.45]) {
          const c = Math.cos(da), s = Math.sin(da);
          balls.push({ x: b.x, y: b.y, vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c, stuck: false, off: 0 });
        }
      }
      fx.stamp('🎱 MULTI-BALL!', P.c, 0.8);
    } else if (k === 'wide') {
      wideUntil = now + 12000;
      fx.stamp('↔️ STRETCH CAB!', P.c, 0.8);
    } else if (k === 'fire') {
      fireUntil = now + 8000;
      fx.stamp('🔥 FIREBALL!', P.c, 0.8);
    } else {
      lives = Math.min(5, lives + 1);
      fx.stamp('❤️ +1 BALL', P.c, 0.8);
    }
  };

  const step = (h: number, now: number) => {
    const fire = fireUntil > now;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b.stuck) {
        b.x = px + b.off * (pw / 2 - 8);
        b.y = PY - BR;
        continue;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (b.x < BR) (b.x = BR, (b.vx = Math.abs(b.vx)), sfx.tick());
      if (b.x > W - BR) (b.x = W - BR, (b.vx = -Math.abs(b.vx)), sfx.tick());
      if (b.y < 46 + BR) (b.y = 46 + BR, (b.vy = Math.abs(b.vy)), sfx.tick());
      // The cab.
      if (b.vy > 0 && b.y + BR >= PY && b.y - BR <= PY + PH && b.x > px - pw / 2 - BR && b.x < px + pw / 2 + BR) {
        const off = clamp((b.x - px) / (pw / 2), -1, 1);
        const sp = Math.min(560, Math.hypot(b.vx, b.vy) + 5);
        const a = off * 1.05;
        b.vx = Math.sin(a) * sp;
        b.vy = -Math.cos(a) * sp;
        b.y = PY - BR;
        squash = 1;
        if (chain >= 4) fx.pop(px, PY - 24, `chain ${chain} banked`, '#aaa', 12);
        chain = 0;
        sfx.punch();
        fx.burst(b.x, PY, { colors: ['#ffd23f', '#fff'], n: 4, size: 3, speed: 80, up: true, life: 0.3 });
      }
      // Bricks.
      if (b.y - BR < Y0 + 9 * (BH + GAP)) {
        let bounced = false;
        for (const k of bricks) {
          if (k.hp <= 0) continue;
          const cx = clamp(b.x, k.x, k.x + BW), cy = clamp(b.y, k.y, k.y + BH);
          const dx = b.x - cx, dy = b.y - cy;
          if (dx * dx + dy * dy > BR * BR) continue;
          const pass = fire && k.t !== 3;
          if (!pass && !bounced) {
            bounced = true;
            if (dx === 0 && dy === 0) b.vy = -b.vy;
            else if (Math.abs(dx) > Math.abs(dy)) b.vx = Math.sign(dx) * Math.abs(b.vx);
            else b.vy = Math.sign(dy) * Math.abs(b.vy);
          }
          if (k.t === 3 && !bounced) continue;
          if (pass) k.hp = 1; // fire goes straight through, windows and all
          breakBrick(k);
        }
      }
      // Never let it go flat (endless side-to-side).
      const sp = Math.hypot(b.vx, b.vy);
      if (Math.abs(b.vy) < sp * 0.28) {
        b.vy = Math.sign(b.vy || -1) * sp * 0.28;
        b.vx = Math.sign(b.vx) * Math.sqrt(sp * sp - b.vy * b.vy);
      }
      if (b.y > H + 12) balls.splice(i, 1);
    }
    bricks = bricks.filter((k) => k.hp > 0);
  };

  // ------------------------------------------------------------ sprites
  const SPR: Record<number, HTMLCanvasElement> = {};
  const brickSprite = (t: number, cracked = false) =>
    prerender(BW, BH, (c) => {
      if (t === 1) {
        const gr = c.createLinearGradient(0, 0, 0, BH);
        gr.addColorStop(0, '#b5653a');
        gr.addColorStop(1, '#7a3a1e');
        c.fillStyle = gr;
        c.fillRect(0, 0, BW, BH);
        c.fillStyle = 'rgba(0,0,0,.18)';
        c.fillRect(0, BH / 2 - 0.5, BW, 1);
        c.fillRect(BW / 2, 0, 1, BH / 2);
        c.fillRect(BW / 4, BH / 2, 1, BH / 2);
        c.fillRect((BW * 3) / 4, BH / 2, 1, BH / 2);
        c.fillStyle = 'rgba(255,255,255,.18)';
        c.fillRect(0, 0, BW, 2);
      } else if (t === 2) {
        c.fillStyle = '#5b2e1a';
        c.fillRect(0, 0, BW, BH);
        const gl = c.createLinearGradient(0, 0, 0, BH);
        gl.addColorStop(0, '#ffe7a8');
        gl.addColorStop(1, '#f2a83b');
        c.fillStyle = gl;
        c.fillRect(4, 2, BW - 8, BH - 4);
        c.fillStyle = '#5b2e1a';
        c.fillRect(BW / 2 - 1, 2, 2, BH - 4);
        c.fillRect(4, BH / 2 - 1, BW - 8, 1.5);
        if (cracked) {
          c.strokeStyle = 'rgba(40,20,10,.9)';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(8, 3);
          c.lineTo(15, 9);
          c.lineTo(11, 14);
          c.moveTo(15, 9);
          c.lineTo(26, 6);
          c.lineTo(32, 13);
          c.stroke();
        }
      } else if (t === 3) {
        c.fillStyle = '#20232a';
        c.fillRect(0, 0, BW, BH);
        c.strokeStyle = '#5c6370';
        c.lineWidth = 1.5;
        c.strokeRect(1, 1, BW - 2, BH - 2);
        for (let x = 5; x < BW; x += 5) (c.beginPath(), c.moveTo(x, 2), c.lineTo(x, BH - 2), c.stroke());
      } else if (t === 4) {
        const gr = c.createLinearGradient(0, 0, BW, BH);
        gr.addColorStop(0, '#fff4b0');
        gr.addColorStop(0.5, '#ffd23f');
        gr.addColorStop(1, '#c98a00');
        c.fillStyle = gr;
        c.fillRect(0, 0, BW, BH);
        c.fillStyle = 'rgba(255,255,255,.6)';
        c.fillRect(3, 2, BW - 6, 2);
      } else {
        c.fillStyle = '#6b3b22';
        c.fillRect(0, BH / 2, BW, BH / 2);
        c.fillStyle = '#3fae5a';
        for (let x = 2; x < BW; x += 6) (c.beginPath(), c.arc(x + 2, BH / 2, 4, Math.PI, 0), c.fill());
        c.fillStyle = '#ff4fa3';
        c.fillRect(9, 3, 3, 3);
        c.fillRect(27, 4, 3, 3);
      }
    });
  for (const t of [1, 2, 3, 4, 5]) SPR[t] = brickSprite(t);
  const CRACKED = brickSprite(2, true);
  const bg = prerender(W, H, (c) => {
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#24123f');
    sky.addColorStop(0.6, '#4a2350');
    sky.addColorStop(1, '#1b1020');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    // The brownstone behind the bricks (darker, so the bricks pop).
    c.fillStyle = '#3a1d12';
    c.fillRect(6, 46, W - 12, 210);
    // Cornice.
    c.fillStyle = '#2a140c';
    c.fillRect(0, 0, W, 46);
    c.fillStyle = '#5b2e1a';
    for (let x = 0; x < W; x += 12) c.fillRect(x + 2, 36, 8, 8);
    c.fillStyle = '#7a3a1e';
    c.fillRect(0, 32, W, 4);
    // Street: lamp posts and a sidewalk.
    c.fillStyle = '#2b2b33';
    c.fillRect(0, PY + PH + 8, W, H);
    c.fillStyle = 'rgba(255,255,255,.08)';
    for (let x = 0; x < W; x += 40) c.fillRect(x, PY + PH + 8, 1, H);
    for (const x of [40, 320]) {
      const lg = c.createRadialGradient(x, 300, 4, x, 300, 90);
      lg.addColorStop(0, 'rgba(255,210,120,.35)');
      lg.addColorStop(1, 'rgba(255,210,120,0)');
      c.fillStyle = lg;
      c.fillRect(x - 90, 210, 180, 180);
      c.fillStyle = '#111';
      c.fillRect(x - 2, 300, 4, PY + 20 - 300);
      c.fillStyle = '#ffd27a';
      c.beginPath();
      c.arc(x, 298, 5, 0, Math.PI * 2);
      c.fill();
    }
    // A tree silhouette.
    c.fillStyle = 'rgba(10,30,20,.65)';
    for (const [x, y, r] of [[120, 300, 34], [150, 285, 28], [170, 310, 30], [240, 305, 26]]) (c.beginPath(), c.arc(x, y, r, 0, Math.PI * 2), c.fill());
    c.fillStyle = 'rgba(10,30,20,.65)';
    c.fillRect(146, 320, 6, PY - 312);
  });

  const drawCab = (now: number) => {
    const w = pw * (1 + squash * 0.08), hgt = PH * (1 - squash * 0.25);
    const x = px - w / 2, y = PY + (PH - hgt);
    const fire = fireUntil > now;
    g.shadowColor = fire ? '#ff6a00' : '#ffd23f';
    g.shadowBlur = 12;
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.roundRect(x, y, w, hgt, 5);
    g.fill();
    g.shadowBlur = 0;
    // Checker stripe.
    g.fillStyle = '#111';
    for (let i = 0; i < w / 6 - 1; i++) if (i % 2 === 0) g.fillRect(x + 3 + i * 6, y + hgt / 2 - 1.5, 5, 3);
    // Roof light.
    g.fillStyle = '#fff';
    g.fillRect(px - 6, y - 4, 12, 4);
    // Wheels.
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(x + 10, y + hgt, 4, 0, Math.PI * 2);
    g.arc(x + w - 10, y + hgt, 4, 0, Math.PI * 2);
    g.fill();
  };

  const draw = (now: number, left: number) => {
    g.drawImage(bg, 0, 0);
    // Window glow flicker behind (motion even when idle).
    for (const k of bricks) {
      g.drawImage(k.t === 2 && k.hp === 1 ? CRACKED : SPR[k.t], k.x, k.y);
      if (k.t === 4) {
        const s = (now / 600 + k.x * 0.05) % 1;
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.fillRect(k.x + s * (BW - 6), k.y + 2, 4, BH - 4);
      }
      if (k.hit > 0) {
        k.hit -= 1 / 60;
        g.fillStyle = 'rgba(255,255,255,.6)';
        g.fillRect(k.x, k.y, BW, BH);
      }
    }
    // Power-up capsules.
    for (const d of drops) {
      const P = POWER[d.k];
      g.fillStyle = P.c;
      g.shadowColor = P.c;
      g.shadowBlur = 10;
      g.beginPath();
      g.roundRect(d.x - 16, d.y - 8, 32, 16, 8);
      g.fill();
      g.shadowBlur = 0;
      emoji(g, P.e, d.x, d.y + 1, 12);
    }
    // Trail of the first ball.
    const fire = fireUntil > now;
    for (let k = 0; k < 10; k++) {
      const i = ((trailI + k + 1) % 10) * 2;
      g.globalAlpha = k * 0.04;
      g.fillStyle = fire ? '#ff6a00' : '#bfe8ff';
      g.beginPath();
      g.arc(trail[i], trail[i + 1], BR * (0.4 + k * 0.06), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    for (const b of balls) {
      g.fillStyle = fire ? '#ffb347' : '#fff';
      g.shadowColor = fire ? '#ff6a00' : '#bfe8ff';
      g.shadowBlur = fire ? 16 : 8;
      g.beginPath();
      g.arc(b.x, b.y, BR, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      if (fire && Math.random() < 0.6) fx.burst(b.x, b.y, { colors: ['#ff6a00', '#ffd23f'], n: 1, size: 3, speed: 30, gravity: -80, life: 0.3 });
    }
    drawCab(now);
    // Aim hint while stuck.
    if (balls.length && balls[0].stuck && !clearPause) {
      const b = balls[0];
      const a = b.off * 0.9;
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.setLineDash([4, 6]);
      g.lineDashOffset = -now / 40;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x + Math.sin(a) * 70, b.y - Math.cos(a) * 70);
      g.stroke();
      g.setLineDash([]);
      label(g, 'drag · lift to launch', W / 2, PY + 30, 14, '#fff');
    }
    // Top bar: lives, block, time.
    label(g, LEVELS[level % LEVELS.length].name + (level >= LEVELS.length ? ` +${Math.floor(level / LEVELS.length)}` : ''), 10, 16, 14, '#ffd23f', 'left');
    for (let i = 0; i < lives; i++) emoji(g, '❤️', W - 14 - i * 16, 16, 12);
    bar(g, 10, 28, W - 20, left / END, left < 10 ? '#e0283f' : '#7bd88f');
    if (wideUntil > now) emoji(g, '↔️', W - 20, PY + 34, 14);
    if (fire) bar(g, W / 2 - 40, PY + 26, 80, (fireUntil - now) / 8000, '#ff6a00');
    if (chain >= 4) label(g, `⛓️ ${chain} ×${Math.min(5, 1 + Math.floor(chain / 4))}`, 12, PY + 34, 14, '#ff9f1c', 'left');
  };

  // -------------------------------------------------------------- loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    const left = Math.max(0, END - (now - t0) / 1000);
    if (!fx.frozen && !fin.ended) {
      if (keyDir) tx = clamp(tx + keyDir * 420 * dt, 0, W);
      const targetW = wideUntil > now ? 104 : 64;
      pw += (targetW - pw) * Math.min(1, dt * 8);
      px += (clamp(tx, pw / 2, W - pw / 2) - px) * Math.min(1, dt * 22);
      squash = Math.max(0, squash - dt * 6);
      if (clearPause > 0) {
        clearPause -= dt;
        if (clearPause <= 0) {
          clearPause = 0;
          level++;
          build();
          serve();
          fx.stamp(LEVELS[level % LEVELS.length].name.toUpperCase(), '#ffd23f', 1);
        }
      } else {
        if (balls.some((b) => b.stuck) && now - stuckAt > 2500) launch();
        const SUBS = 3;
        for (let s = 0; s < SUBS; s++) step(dt / SUBS, now);
        if (balls.length) {
          trailI = (trailI + 1) % 10;
          trail[trailI * 2] = balls[0].x;
          trail[trailI * 2 + 1] = balls[0].y;
        }
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          d.y += 150 * dt;
          if (d.y > PY - 6 && d.y < PY + PH + 8 && Math.abs(d.x - px) < pw / 2 + 14) {
            power(d.k, now);
            drops.splice(i, 1);
          } else if (d.y > H + 20) drops.splice(i, 1);
        }
        if (!bricks.some((k) => k.t !== 3)) {
          const bonus = 250 * (level + 1);
          score += bonus;
          fx.stamp('BLOCK CLEARED!', '#7bd88f', 1.3);
          fx.pop(W / 2, 220, `+${bonus}`, '#7bd88f', 30);
          fx.flash('#7bd88f', 0.3);
          fx.burst(W / 2, 150, { emoji: ['🧱', '✨', '🎉'], n: 20, size: 18, speed: 280 });
          sfx.levelUp();
          drops.length = 0;
          balls.length = 0;
          clearPause = 1.5;
        } else if (!balls.length) {
          lives--;
          chain = 0;
          fx.shake(10, 0.3);
          fx.flash('#e0283f', 0.25);
          sfx.bad();
          if (lives <= 0) {
            fx.stamp('OUT OF BALLS', '#e0283f', 1.4);
            fin.end(score, 1500);
          } else {
            fx.stamp(`${lives} LEFT`, '#fff', 0.8);
            fireUntil = 0;
            serve();
          }
        }
      }
      if (left <= 0 && !fin.ended) {
        fx.stamp(bestChain >= 10 ? `TIME! best chain ${bestChain}` : 'TIME!', '#ffd23f', 1.4);
        sfx.done();
        fin.end(score, 1500);
      }
    }
    draw(now, left);
    fx.end(g);
    hud(`🧱 ${score} · ⏱ ${Math.ceil(left)}s${chain >= 4 ? ` · ⛓️×${Math.min(5, 1 + Math.floor(chain / 4))}` : ''}`);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    fin.cancel();
    cancelAnimationFrame(raf);
    offP();
    offK();
  };
};
