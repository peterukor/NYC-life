// =====================================================================
// 🏙️ Rooftop Jump — bounce up the city, Doodle Jump style.
//
// You bounce on your own: hold the left or right half of the screen to
// steer (walk off one edge, come back on the other). Keys: ← →.
//   AC units and water towers hold you; fire escapes slide; 🍕 pizza
//   boxes give one bounce and fold; springs launch you sky-high.
//   🐦 Pigeons knock you down unless you stomp them from above.
//   🪙 Coins in quick succession build a combo; 🎈 balloons float you up.
// Score: metres climbed + coins + stomps. The sky turns to night as you
// climb. Fall off the bottom and it's over.
// =====================================================================

import { sfx } from '../audio.ts';
import { Combo, Fx } from '../juice.ts';
import { emoji, H, W, type Run } from '../arcade-games.ts';
import { clamp, finisher, keys, label, lerp, pointers, prerender } from './kit.ts';

type Kind = 'ground' | 'ac' | 'tower' | 'escape' | 'box';
interface Plat {
  x: number;
  y: number;
  w: number;
  kind: Kind;
  vx: number;
  spring: number; // x offset of a spring, or NaN
  springT: number;
  broken: boolean;
  fallV: number;
  rot: number;
}
interface Thing {
  x: number;
  y: number;
  kind: 'coin' | 'pigeon' | 'balloon';
  vx: number;
  dead: boolean;
  t: number;
}

const GRAV = 1500, JUMP = -700, SPRING = -1220, STOMP = -780;
const SKY: [number, string, string][] = [
  [0, '#6ec6ff', '#d8f1ff'],
  [150, '#ff8a5c', '#ffd29a'],
  [300, '#5b3a8c', '#ff7aa8'],
  [450, '#0b1030', '#2b2a6b'],
  [800, '#000008', '#120a33'],
];
const hex = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const SKY_RGB = SKY.map(([m, a, b]) => [m, hex(a), hex(b)] as const);
function skyAt(m: number, top: boolean): string {
  let i = 0;
  while (i < SKY_RGB.length - 2 && m > SKY_RGB[i + 1][0]) i++;
  const [m0, a0, b0] = SKY_RGB[i], [m1, a1, b1] = SKY_RGB[i + 1];
  const t = clamp((m - m0) / (m1 - m0), 0, 1);
  const A = top ? a0 : b0, B = top ? a1 : b1;
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}

export const rooftop: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const coinCombo = new Combo(1.6);
  const START = H - 40;
  const p = { x: W / 2, y: START - 120, vx: 0, vy: 0, face: 1, squash: 0, stun: 0, balloon: 0 };
  let camY = 0, maxClimb = 0, coins = 0, bonus = 0, raf = 0, over = false, dead = false, milestone = 100;
  let hold = 0;
  const plats: Plat[] = [];
  const things: Thing[] = [];
  let topY = START;
  const mk = (x: number, y: number, w: number, kind: Kind, vx = 0, spring = NaN): Plat => {
    const pl: Plat = { x, y, w, kind, vx, spring, springT: 0, broken: false, fallV: 0, rot: 0 };
    plats.push(pl);
    return pl;
  };
  mk(W / 2, START, W, 'ground');
  let lastBox = false;
  const gen = () => {
    while (topY > camY - 120) {
      const m = (START - topY) / 10;
      const gap = Math.min(128, clamp(56 + m * 0.11, 56, 118) * (0.78 + Math.random() * 0.4));
      topY -= gap;
      const r = Math.random();
      let kind: Kind = 'ac';
      if (r < Math.min(0.32, m / 500)) kind = 'escape';
      else if (r < Math.min(0.32, m / 500) + Math.min(0.22, m / 700) && !lastBox) kind = 'box';
      else if (Math.random() < 0.14) kind = 'tower';
      lastBox = kind === 'box';
      const w = kind === 'tower' ? 66 : kind === 'escape' ? 62 : kind === 'box' ? 50 : 54;
      const x = w / 2 + 6 + Math.random() * (W - w - 12);
      const vx = kind === 'escape' ? (Math.random() < 0.5 ? -1 : 1) * (50 + Math.min(110, m * 0.2)) : 0;
      const spring = kind !== 'box' && Math.random() < 0.08 ? (Math.random() - 0.5) * (w - 20) : NaN;
      const pl = mk(x, topY, w, kind, vx, spring);
      // A box alone could strand you: always add a solid neighbour.
      if (kind === 'box') mk(clamp(W - x + (Math.random() - 0.5) * 60, 40, W - 40), topY - 8 - Math.random() * 20, 54, 'ac');
      if (Math.random() < 0.38) things.push({ x: pl.x + (Math.random() - 0.5) * 30, y: pl.y - 40 - Math.random() * 30, kind: 'coin', vx: 0, dead: false, t: Math.random() * 6 });
      if (m > 40 && Math.random() < Math.min(0.2, m / 1600)) things.push({ x: Math.random() * W, y: topY - gap / 2, kind: 'pigeon', vx: (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 60 + Math.min(80, m * 0.1)), dead: false, t: Math.random() * 6 });
      if (m > 80 && Math.random() < 0.015) things.push({ x: 40 + Math.random() * (W - 80), y: topY - 50, kind: 'balloon', vx: 0, dead: false, t: 0 });
    }
  };
  gen();

  const offP = pointers(cv, {
    down: (t) => (hold = t.x < W / 2 ? -1 : 1),
    move: (t) => (hold = t.x < W / 2 ? -1 : 1),
    up: () => (hold = 0),
  });
  let keyHold = 0;
  const offK = keys(
    (k) => {
      if (k === 'ArrowLeft' || k === 'a') keyHold = -1;
      if (k === 'ArrowRight' || k === 'd') keyHold = 1;
    },
    (k) => (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd') && (keyHold = 0),
  );

  const score = () => Math.floor(maxClimb / 10) + bonus;

  // ------------------------------------------------------------- scenery
  const skyline = prerender(W, 220, (c) => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    c.fillStyle = 'rgba(40,40,70,.55)';
    for (let x = -10; x < W; ) {
      const w = 22 + rnd() * 30, h = 60 + rnd() * 140;
      c.fillRect(x, 220 - h, w, h);
      x += w - 4;
    }
    c.fillRect(150, 20, 34, 200); // Empire State
    c.fillRect(158, 0, 18, 24);
    c.fillStyle = '#27274a';
    for (let x = -6; x < W; ) {
      const w = 26 + rnd() * 26, h = 30 + rnd() * 70;
      c.fillRect(x, 220 - h, w, h);
      c.fillStyle = 'rgba(255,214,90,.6)';
      for (let wy = 220 - h + 6; wy < 214; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 7) if (rnd() < 0.3) c.fillRect(wx, wy, 3, 4);
      c.fillStyle = '#27274a';
      x += w + 2;
    }
  });
  const stars = new Float32Array(120);
  for (let i = 0; i < 120; i += 2) (stars[i] = Math.random() * W), (stars[i + 1] = Math.random() * H);
  const clouds = [0, 1, 2, 3, 4].map((i) => ({ x: Math.random() * W, y: i * 140, s: 0.7 + Math.random() * 0.6 }));

  const drawPlat = (pl: Plat, now: number) => {
    const y = pl.y - camY, x = pl.x;
    if (y < -60 || y > H + 80) return;
    g.save();
    g.translate(x, y);
    if (pl.broken) g.rotate(pl.rot);
    const w = pl.w;
    if (pl.kind === 'ground') {
      g.fillStyle = '#3d3d4a';
      g.fillRect(-W / 2, 0, W, 60);
      g.fillStyle = '#555566';
      g.fillRect(-W / 2, 0, W, 5);
      emoji(g, '🚪', -120, -14, 24);
      emoji(g, '📡', 120, -14, 24);
    } else if (pl.kind === 'ac') {
      g.fillStyle = '#c9ced6';
      g.fillRect(-w / 2, 0, w, 18);
      g.fillStyle = '#9aa1ab';
      g.fillRect(-w / 2, 14, w, 4);
      g.fillStyle = '#6b7280';
      for (let i = -w / 2 + 5; i < w / 2 - 22; i += 4) g.fillRect(i, 4, 2, 9);
      // The fan, spinning.
      g.strokeStyle = '#6b7280';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(w / 2 - 12, 9, 6, 0, Math.PI * 2);
      g.stroke();
      const a = now / 60;
      g.beginPath();
      g.moveTo(w / 2 - 12 + Math.cos(a) * 5, 9 + Math.sin(a) * 5);
      g.lineTo(w / 2 - 12 - Math.cos(a) * 5, 9 - Math.sin(a) * 5);
      g.stroke();
    } else if (pl.kind === 'tower') {
      // A wooden water tower: you land on the lid.
      g.fillStyle = '#7a4b2a';
      g.beginPath();
      g.moveTo(-w / 2 + 2, 0);
      g.lineTo(0, -16);
      g.lineTo(w / 2 - 2, 0);
      g.closePath();
      g.fill();
      g.fillStyle = '#a0643a';
      g.fillRect(-w / 2 + 6, 0, w - 12, 34);
      g.fillStyle = '#4a2a14';
      g.fillRect(-w / 2 + 6, 8, w - 12, 2);
      g.fillRect(-w / 2 + 6, 22, w - 12, 2);
      g.strokeStyle = '#333';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-w / 2 + 10, 34);
      g.lineTo(-w / 2 + 6, 54);
      g.moveTo(w / 2 - 10, 34);
      g.lineTo(w / 2 - 6, 54);
      g.moveTo(-w / 2 + 10, 44);
      g.lineTo(w / 2 - 10, 44);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.fillRect(-w / 2, -2, w, 3);
    } else if (pl.kind === 'escape') {
      g.fillStyle = '#1d1f24';
      g.fillRect(-w / 2, 0, w, 6);
      g.strokeStyle = '#1d1f24';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-w / 2, 0);
      g.lineTo(-w / 2, -14);
      g.lineTo(w / 2, -14);
      g.lineTo(w / 2, 0);
      for (let i = -w / 2 + 8; i < w / 2; i += 8) (g.moveTo(i, 0), g.lineTo(i, -14));
      g.stroke();
      g.fillStyle = '#e0283f';
      g.fillRect(-w / 2, 6, w, 2);
    } else {
      g.fillStyle = pl.broken ? '#b58a52' : '#d9a86c';
      g.fillRect(-w / 2, 0, w, 10);
      g.fillStyle = '#e0283f';
      g.font = '900 7px "Arial Black", system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('PIZZA', 0, 5);
      g.strokeStyle = 'rgba(0,0,0,.25)';
      g.strokeRect(-w / 2, 0, w, 10);
    }
    if (!Number.isNaN(pl.spring)) {
      const c = pl.springT > 0 ? 4 : 10;
      g.strokeStyle = '#c0c6cf';
      g.lineWidth = 2.5;
      g.beginPath();
      for (let i = 0; i <= 5; i++) g.lineTo(pl.spring + (i % 2 ? 5 : -5), -(i / 5) * c);
      g.stroke();
      g.fillStyle = '#e0283f';
      g.fillRect(pl.spring - 8, -c - 3, 16, 3);
    }
    g.restore();
  };

  const drawPlayer = (now: number) => {
    const x = p.x, y = p.y - camY;
    const stretch = clamp(Math.abs(p.vy) / 1600, 0, 0.25);
    const sx = (1 - stretch * 0.6) * (1 + p.squash * 0.35), sy = (1 + stretch) * (1 - p.squash * 0.3);
    g.save();
    g.translate(x, y + 14);
    g.scale(sx * p.face, sy);
    // Legs and sneakers.
    g.fillStyle = '#2b4a8c';
    g.fillRect(-7, -10, 5, 9);
    g.fillRect(2, -10, 5, 9);
    g.fillStyle = '#fff';
    g.fillRect(-9, -2, 8, 4);
    g.fillRect(1, -2, 8, 4);
    // Hoodie body.
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.ellipse(0, -18, 11, 11, 0, 0, Math.PI * 2);
    g.fill();
    // Arms: up when rising.
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 4;
    g.lineCap = 'round';
    const up = p.vy < 0 ? -1 : 0.4;
    g.beginPath();
    g.moveTo(-9, -20);
    g.lineTo(-15, -20 + up * 9);
    g.moveTo(9, -20);
    g.lineTo(15, -20 + up * 9);
    g.stroke();
    // Head.
    g.fillStyle = '#f2c79b';
    g.beginPath();
    g.arc(0, -35, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.fillRect(2, -37, 2.5, 3);
    g.fillRect(6, -37, 2.5, 3);
    // Cap, brim forward.
    g.fillStyle = '#e0283f';
    g.beginPath();
    g.arc(0, -38, 9, Math.PI, 0);
    g.fill();
    g.fillRect(0, -40, 13, 3);
    g.restore();
    if (p.balloon > 0) {
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y - 18);
      g.lineTo(x, y - 52);
      g.stroke();
      emoji(g, '🎈', x, y - 64, 28);
    }
    if (p.stun > 0) for (let i = 0; i < 3; i++) emoji(g, '⭐', x + Math.cos(now / 120 + i * 2.1) * 14, y - 32 + Math.sin(now / 120 + i * 2.1) * 4, 9);
  };

  const draw = (now: number) => {
    const m = maxClimb / 10;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, skyAt(m + 30, true));
    sky.addColorStop(1, skyAt(m, false));
    g.fillStyle = sky;
    g.fillRect(-20, -20, W + 40, H + 40);
    // Stars at night.
    if (m > 280) {
      g.fillStyle = '#fff';
      g.globalAlpha = clamp((m - 280) / 150, 0, 1);
      for (let i = 0; i < 120; i += 2) {
        const sy = (stars[i + 1] - camY * 0.05) % H;
        const tw = (Math.sin(now / 300 + i) + 1) * 0.6 + 0.6;
        g.fillRect(stars[i], sy < 0 ? sy + H : sy, tw, tw);
      }
      g.globalAlpha = 1;
    }
    // The skyline sinks away as you climb.
    const sk = H - 250 - camY * 0.25;
    if (sk < H) g.drawImage(skyline, 0, sk);
    // Clouds (parallax).
    g.fillStyle = m > 400 ? 'rgba(180,180,220,.15)' : 'rgba(255,255,255,.6)';
    for (const c of clouds) {
      let cy = (c.y - camY * 0.4) % (H + 160);
      if (cy < -80) cy += H + 160;
      const cx = (c.x + now * 0.008 * c.s) % (W + 120) - 60;
      g.beginPath();
      g.arc(cx, cy, 18 * c.s, 0, Math.PI * 2);
      g.arc(cx + 20 * c.s, cy - 8 * c.s, 22 * c.s, 0, Math.PI * 2);
      g.arc(cx + 42 * c.s, cy, 16 * c.s, 0, Math.PI * 2);
      g.fill();
    }
    for (const pl of plats) drawPlat(pl, now);
    for (const t of things) {
      if (t.dead && t.kind === 'coin') continue;
      const y = t.y - camY;
      if (y < -40 || y > H + 40) continue;
      if (t.kind === 'coin') {
        const s = Math.abs(Math.cos(now / 200 + t.t));
        g.save();
        g.translate(t.x, y + Math.sin(now / 300 + t.t) * 3);
        g.scale(0.3 + s * 0.7, 1);
        emoji(g, '🪙', 0, 0, 20);
        g.restore();
      } else if (t.kind === 'pigeon') {
        g.save();
        g.translate(t.x, y + Math.sin(now / 150 + t.t) * 5);
        g.scale(t.vx > 0 ? -1 : 1, 1);
        if (t.dead) g.rotate(now / 80);
        emoji(g, '🐦', 0, 0, 26);
        g.restore();
      } else if (!t.dead) emoji(g, '🎈', t.x, y + Math.sin(now / 400) * 6, 28);
    }
    drawPlayer(now);
    // Touch hints.
    const hl = hold || keyHold;
    g.globalAlpha = hl === -1 ? 0.55 : 0.18;
    label(g, '◀', 26, H - 26, 30, '#fff');
    g.globalAlpha = hl === 1 ? 0.55 : 0.18;
    label(g, '▶', W - 26, H - 26, 30, '#fff');
    g.globalAlpha = 1;
    label(g, `${Math.floor(m)}m`, W / 2, 26, 26, '#fff');
    if (coinCombo.alive(now) && coinCombo.n > 1) label(g, `🪙 ×${coinCombo.n}`, W / 2, 52, 16, '#ffd23f');
  };

  // -------------------------------------------------------------- loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    if (!fx.frozen) {
      const dir = p.stun > 0 ? 0 : hold || keyHold;
      p.stun = Math.max(0, p.stun - dt);
      p.squash = Math.max(0, p.squash - dt * 5);
      if (dir) {
        p.vx = clamp(p.vx + dir * 2000 * dt, -310, 310);
        p.face = dir;
      } else p.vx *= Math.exp(-7 * dt);
      const prevFeet = p.y + 14;
      if (p.balloon > 0) {
        p.balloon -= dt;
        p.vy = -820;
        if (Math.random() < 0.5) fx.burst(p.x, p.y + 14, { colors: ['#fff', '#ff4fa3'], n: 1, size: 3, speed: 40, life: 0.4 });
      } else p.vy += GRAV * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -14) p.x = W + 14;
      if (p.x > W + 14) p.x = -14;
      const feet = p.y + 14;
      // Platforms.
      for (const pl of plats) {
        if (pl.vx) {
          pl.x += pl.vx * dt;
          if (pl.x < pl.w / 2 || pl.x > W - pl.w / 2) (pl.vx = -pl.vx), (pl.x = clamp(pl.x, pl.w / 2, W - pl.w / 2));
        }
        if (pl.springT > 0) pl.springT -= dt;
        if (pl.broken) {
          pl.fallV += GRAV * dt;
          pl.y += pl.fallV * dt;
          pl.rot += dt * 3;
          continue;
        }
        if (dead || p.vy <= 0 || p.balloon > 0) continue;
        const top = pl.y;
        if (prevFeet <= top + 2 && feet >= top && Math.abs(p.x - pl.x) < pl.w / 2 + 8) {
          p.y = top - 14;
          p.squash = 1;
          const onSpring = !Number.isNaN(pl.spring) && Math.abs(p.x - (pl.x + pl.spring)) < 16;
          if (onSpring) {
            p.vy = SPRING;
            pl.springT = 0.25;
            fx.pop(p.x, p.y - 30, 'BOING!', '#7bd88f', 20);
            fx.shake(5, 0.15);
            sfx.levelUp();
          } else {
            p.vy = JUMP;
            sfx.note(330 + Math.min(600, maxClimb / 20));
          }
          fx.burst(p.x, top, { colors: ['#fff', '#ddd'], n: 4, size: 3, speed: 60, up: true, life: 0.3 });
          if (pl.kind === 'box') {
            pl.broken = true;
            fx.burst(pl.x, top, { emoji: ['🍕'], n: 3, size: 14, speed: 120 });
            sfx.tick();
          }
        }
      }
      // Coins, pigeons, balloons.
      for (const t of things) {
        if (t.kind === 'pigeon') {
          t.x += t.vx * dt;
          if (t.dead) t.y -= 260 * dt;
          if (t.x < -30) t.x = W + 30;
          if (t.x > W + 30) t.x = -30;
        }
        if (t.dead || dead) continue;
        const dx = t.x - p.x, dy = t.y - (p.y - 14);
        const d2 = dx * dx + dy * dy;
        if (t.kind === 'coin' && d2 < 24 * 24) {
          t.dead = true;
          const n = coinCombo.hit(now);
          const pts = 10 * Math.min(4, n);
          coins++;
          bonus += pts;
          fx.pop(t.x, t.y - 10, `+${pts}`, '#ffd23f', n > 2 ? 20 : 16);
          fx.burst(t.x, t.y, { colors: ['#ffd23f', '#fff'], n: 6, size: 3, speed: 110, life: 0.35 });
          sfx.note(784 + Math.min(n, 8) * 70);
        } else if (t.kind === 'pigeon' && d2 < 26 * 26 && p.balloon <= 0) {
          t.dead = true;
          if (p.vy > 0 && p.y < t.y - 2) {
            p.vy = STOMP;
            p.squash = 1;
            bonus += 50;
            fx.pop(t.x, t.y - 20, 'STOMP +50', '#ff9f1c', 20);
            fx.burst(t.x, t.y, { emoji: '🪶', n: 8, size: 14, speed: 160 });
            fx.stop(0.06);
            fx.shake(6, 0.15);
            sfx.punch();
          } else {
            p.stun = 0.6;
            p.vy = Math.max(p.vy, 260);
            p.vx = Math.sign(p.x - t.x || 1) * 220;
            fx.pop(p.x, p.y - 34, 'BONK!', '#e0283f', 22);
            fx.burst(p.x, p.y - 14, { emoji: '🪶', n: 6, size: 12, speed: 140 });
            fx.flash('#e0283f', 0.2);
            fx.shake(10, 0.25);
            sfx.bad();
          }
        } else if (t.kind === 'balloon' && d2 < 30 * 30) {
          t.dead = true;
          p.balloon = 1.8;
          fx.stamp('🎈 UP UP!', '#ff4fa3', 0.8);
          sfx.chime();
        }
      }
      // Camera and score.
      const target = p.y - H * 0.42;
      if (target < camY) camY += (target - camY) * Math.min(1, dt * 10);
      maxClimb = Math.max(maxClimb, START - 14 - p.y);
      const m = maxClimb / 10;
      if (m >= milestone) {
        fx.stamp(`${milestone}m! 🏙️`, '#ffd23f', 1);
        fx.flash('#ffd23f', 0.2);
        fx.burst(W / 2, 80, { emoji: ['🎆', '✨', '🎉'], n: 14, size: 18, speed: 240 });
        sfx.cheer();
        milestone += 100;
      }
      gen();
      // Tidy up what fell below.
      const floor = camY + H + 120;
      for (let i = plats.length - 1; i >= 0; i--) if (plats[i].y > floor) plats.splice(i, 1);
      for (let i = things.length - 1; i >= 0; i--) if (things[i].y > floor || things[i].y < camY - 400) things.splice(i, 1);
      if (!dead && p.y - camY > H + 30) {
        dead = true;
        fx.stamp(`FELL! ${Math.floor(m)}m`, '#e0283f', 1.4);
        fx.shake(12, 0.4);
        sfx.punch();
        fin.end(score(), 1400);
      }
    }
    draw(now);
    fx.end(g);
    hud(`🏙️ ${Math.floor(maxClimb / 10)}m · 🪙 ${coins} · ${score()}`);
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
