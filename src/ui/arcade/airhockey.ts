// =====================================================================
// 🏒 Air Hockey — you vs the house on a glowing table.
//
// Drag anywhere in your half: your mallet follows your finger. Hit the
// puck hard (a fast swing) for a SLAPSHOT. First to 7 wins, or whoever
// leads at the buzzer (90 s). The house gets faster every time you
// score. Goal streaks and slapshots score bonus points. Keys: arrows.
// =====================================================================

import { sfx } from '../audio.ts';
import { Fx } from '../juice.ts';
import { emoji, H, W, secs, type Run } from '../arcade-games.ts';
import { clamp, finisher, keys, label, pointers, prerender } from './kit.ts';

const M = 10, PR = 13, MR = 24, GX0 = 118, GX1 = 242, SUB = 4, MAXV = 1150, TO_WIN = 7;

export const airhockey: Run = (cv, g, done, hud) => {
  const END = secs(90);
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const t0 = performance.now();
  const puck = { x: W / 2, y: H * 0.68, vx: 0, vy: 0 };
  const me = { x: W / 2, y: H - 70, px: W / 2, py: H - 70, vx: 0, vy: 0, tx: W / 2, ty: H - 70 };
  const ai = { x: W / 2, y: 70, px: W / 2, py: 70, vx: 0, vy: 0, tx: W / 2, ty: 70 };
  let mine = 0, theirs = 0, streak = 0, score = 0, raf = 0, over = false, pause = 0.8, goalFlash = 0, goalSide = 0;
  let thinkT = 0, aimX = W / 2, hitCool = 0;
  const trail = new Float32Array(24);
  let ti = 0;
  trail.fill(0);

  const offP = pointers(cv, {
    down: (t) => ((me.tx = t.x), (me.ty = t.y)),
    move: (t) => ((me.tx = t.x), (me.ty = t.y)),
  });
  let kx = 0, ky = 0;
  const offK = keys(
    (k) => {
      if (k === 'ArrowLeft') kx = -1;
      if (k === 'ArrowRight') kx = 1;
      if (k === 'ArrowUp') ky = -1;
      if (k === 'ArrowDown') ky = 1;
    },
    (k) => {
      if (k === 'ArrowLeft' || k === 'ArrowRight') kx = 0;
      if (k === 'ArrowUp' || k === 'ArrowDown') ky = 0;
    },
  );

  const level = (el: number) => Math.min(6, 1 + mine * 0.5 + el / 45);

  /** Move a mallet toward its target at up to `max` px/s, inside its half. */
  const drive = (m: typeof me, max: number, dt: number, top: boolean) => {
    m.px = m.x;
    m.py = m.y;
    const tx = clamp(m.tx, M + MR, W - M - MR);
    const ty = top ? clamp(m.ty, M + MR, H / 2 - MR) : clamp(m.ty, H / 2 + MR, H - M - MR);
    const dx = tx - m.x, dy = ty - m.y;
    const d = Math.hypot(dx, dy);
    const step = max * dt;
    if (d <= step) (m.x = tx), (m.y = ty);
    else (m.x += (dx / d) * step), (m.y += (dy / d) * step);
    m.vx = (m.x - m.px) / Math.max(dt, 1e-3);
    m.vy = (m.y - m.py) / Math.max(dt, 1e-3);
  };

  /** Mallet vs puck (the mallet's position at sub-step fraction f). */
  const strike = (m: typeof me, f: number, isMe: boolean) => {
    const mx = m.px + (m.x - m.px) * f, my = m.py + (m.y - m.py) * f;
    const dx = puck.x - mx, dy = puck.y - my;
    const rr = PR + MR;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) return;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    puck.x = mx + nx * rr;
    puck.y = my + ny * rr;
    const rel = (puck.vx - m.vx) * nx + (puck.vy - m.vy) * ny;
    if (rel < 0) {
      puck.vx -= 1.85 * rel * nx;
      puck.vy -= 1.85 * rel * ny;
      const sp = -rel;
      if (hitCool <= 0) {
        hitCool = 0.06;
        if (sp > 650) {
          fx.burst(puck.x - nx * PR, puck.y - ny * PR, { colors: isMe ? ['#ff4fa3', '#fff'] : ['#36c5f0', '#fff'], n: 10, size: 3, speed: 240, life: 0.35 });
          fx.shake(Math.min(9, sp / 120), 0.12);
          if (isMe) fx.pop(puck.x, puck.y - 24, 'SLAP!', '#ff4fa3', 16);
          sfx.punch();
        } else sfx.tick();
      }
    }
  };

  const walls = () => {
    const inMouth = puck.x > GX0 && puck.x < GX1;
    if (puck.x < M + PR) {
      puck.x = M + PR;
      if (puck.vx < 0) wallHit((puck.vx = -puck.vx * 0.9), puck.x - PR, puck.y);
    } else if (puck.x > W - M - PR) {
      puck.x = W - M - PR;
      if (puck.vx > 0) wallHit((puck.vx = -puck.vx * 0.9), puck.x + PR, puck.y);
    }
    if (!inMouth) {
      if (puck.y < M + PR) {
        puck.y = M + PR;
        if (puck.vy < 0) wallHit((puck.vy = -puck.vy * 0.9), puck.x, puck.y - PR);
      } else if (puck.y > H - M - PR) {
        puck.y = H - M - PR;
        if (puck.vy > 0) wallHit((puck.vy = -puck.vy * 0.9), puck.x, puck.y + PR);
      }
    } else if (puck.y < M + PR || puck.y > H - M - PR) {
      // In the mouth: the posts.
      for (const gx of [GX0, GX1]) {
        if (Math.abs(puck.x - gx) < PR) {
          puck.x = gx + (puck.x < gx ? -PR : PR);
          puck.vx = -puck.vx * 0.8;
        }
      }
    }
  };
  const wallHit = (v: number, x: number, y: number) => {
    if (Math.abs(v) > 350) {
      fx.burst(x, y, { colors: ['#36c5f0', '#fff'], n: 4, size: 2, speed: 120, life: 0.25 });
      sfx.tick();
    }
  };

  const goal = (forMe: boolean, now: number) => {
    const sp = Math.hypot(puck.vx, puck.vy);
    goalFlash = 1;
    goalSide = forMe ? -1 : 1;
    if (forMe) {
      mine++;
      streak = Math.max(0, streak) + 1;
      let pts = 100 + (streak - 1) * 50;
      const slap = sp > 700;
      if (slap) pts += 50;
      score += pts;
      fx.stamp(slap ? 'SLAPSHOT GOAL!' : streak >= 3 ? `🔥 ${streak} STRAIGHT!` : 'GOAL!', '#ffd23f', 1.1);
      fx.pop(W / 2, 90, `+${pts}`, '#ffd23f', 28);
      fx.burst(W / 2, 20, { emoji: ['🎉', '✨', '🗽', '🎟️'], n: 24, size: 18, speed: 320 });
      fx.burst(W / 2, 20, { colors: ['#ffd23f', '#ff4fa3', '#36c5f0', '#7bd88f'], n: 30, size: 5, speed: 300 });
      fx.flash('#ffd23f', 0.35);
      fx.shake(12, 0.35);
      fx.stop(0.14);
      sfx.cheer();
      sfx.jackpot();
    } else {
      theirs++;
      streak = Math.min(0, streak) - 1;
      fx.stamp('THE HOUSE SCORES 😤', '#36c5f0', 1);
      fx.burst(W / 2, H - 20, { colors: ['#36c5f0', '#fff'], n: 18, size: 4, speed: 260 });
      fx.flash('#36c5f0', 0.25);
      fx.shake(8, 0.3);
      sfx.bad();
    }
    // Serve to whoever conceded.
    puck.x = W / 2;
    puck.y = forMe ? H * 0.3 : H * 0.7;
    puck.vx = puck.vy = 0;
    ai.x = ai.tx = W / 2;
    ai.y = ai.ty = 64;
    trail.fill(0);
    pause = 1.1;
    if (mine >= TO_WIN || theirs >= TO_WIN) finish(now);
  };
  const finish = (now: number) => {
    void now;
    const won = mine > theirs;
    if (won) score += 300 + (mine - theirs) * 50;
    fx.stamp(won ? '🏆 YOU WIN!' : mine === theirs ? 'DRAW' : 'HOUSE WINS', won ? '#ffd23f' : '#aaa', 1.6);
    if (won) (fx.burst(W / 2, H / 2, { emoji: ['🏆', '🎉', '🎟️'], n: 24, size: 22, speed: 300 }), sfx.win());
    fin.end(score, 1700);
  };

  const think = (el: number) => {
    const L = level(el);
    // Defend or attack.
    const inMine = puck.y < H / 2 + 10;
    if (inMine && puck.vy < 160) {
      if (puck.y > ai.y + 6) {
        // Behind the puck: strike toward a spot in your goal.
        const dx = aimX - puck.x, dy = H - puck.y;
        const d = Math.hypot(dx, dy) || 1;
        ai.tx = puck.x - (dx / d) * (MR + PR - 14);
        ai.ty = puck.y - (dy / d) * (MR + PR - 14);
      } else {
        // The puck got past: get round it without knocking it in.
        ai.tx = puck.x + (puck.x < W / 2 ? 46 : -46);
        ai.ty = puck.y - 36;
      }
    } else if (puck.vy < -40) {
      // Coming at the goal: predict where it crosses the crease (with wall bounces).
      const t = (puck.y - 64) / -puck.vy;
      let x = puck.x + puck.vx * t * (0.75 + L * 0.05);
      const lo = M + PR, hi = W - M - PR, span = hi - lo;
      x = ((((x - lo) % (2 * span)) + 2 * span) % (2 * span));
      x = lo + (x > span ? 2 * span - x : x);
      ai.tx = clamp(x, GX0 - 14, GX1 + 14);
      ai.ty = 58 + Math.min(60, L * 8);
    } else {
      ai.tx = W / 2 + (puck.x - W / 2) * 0.45;
      ai.ty = 64;
    }
    // Sloppier when it's slow.
    const wob = Math.max(0, 22 - L * 3.5);
    ai.tx += (Math.random() - 0.5) * wob;
  };

  // ------------------------------------------------------------- table
  const table = prerender(W, H, (c) => {
    const bg = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 380);
    bg.addColorStop(0, '#13264d');
    bg.addColorStop(1, '#060b1d');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    // Air holes.
    c.fillStyle = 'rgba(160,200,255,.12)';
    for (let y = 22; y < H - 14; y += 16) for (let x = 22 + ((y / 16) % 2) * 8; x < W - 14; x += 16) c.fillRect(x, y, 1.6, 1.6);
    // Faint Liberty logo at centre ice.
    c.globalAlpha = 0.12;
    c.font = '90px system-ui, "Apple Color Emoji", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('🗽', W / 2, H / 2);
    c.globalAlpha = 1;
    c.lineWidth = 3;
    const neon = (col: string, f: () => void) => {
      c.strokeStyle = col;
      c.shadowColor = col;
      c.shadowBlur = 12;
      c.beginPath();
      f();
      c.stroke();
      c.shadowBlur = 0;
    };
    neon('#ff2e63', () => (c.moveTo(M, H / 2), c.lineTo(W - M, H / 2)));
    neon('#ff2e63', () => c.arc(W / 2, H / 2, 46, 0, Math.PI * 2));
    neon('#36c5f0', () => c.arc(W / 2, M, 70, 0, Math.PI));
    neon('#ff4fa3', () => c.arc(W / 2, H - M, 70, Math.PI, 0));
    // Rails, with the goal mouths left open.
    c.lineWidth = 5;
    neon('#9ef', () => {
      c.moveTo(GX0, M);
      c.lineTo(M, M);
      c.lineTo(M, H - M);
      c.lineTo(GX0, H - M);
      c.moveTo(GX1, M);
      c.lineTo(W - M, M);
      c.lineTo(W - M, H - M);
      c.lineTo(GX1, H - M);
    });
    c.fillStyle = '#000';
    c.fillRect(GX0, 0, GX1 - GX0, M - 2);
    c.fillRect(GX0, H - M + 2, GX1 - GX0, M);
  });

  const mallet = (m: typeof me, col: string, now: number) => {
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    g.arc(m.x + 3, m.y + 5, MR, 0, Math.PI * 2);
    g.fill();
    const gr = g.createRadialGradient(m.x - 6, m.y - 8, 2, m.x, m.y, MR);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(0.3, col);
    gr.addColorStop(1, '#111');
    g.fillStyle = gr;
    g.shadowColor = col;
    g.shadowBlur = 14 + Math.sin(now / 200) * 4;
    g.beginPath();
    g.arc(m.x, m.y, MR, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(m.x, m.y, MR - 7, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.arc(m.x, m.y, 8, 0, Math.PI * 2);
    g.fill();
  };

  const draw = (now: number, left: number) => {
    g.drawImage(table, 0, 0);
    if (goalFlash > 0) {
      g.globalAlpha = goalFlash * 0.5;
      g.fillStyle = goalSide < 0 ? '#ffd23f' : '#36c5f0';
      g.fillRect(GX0, goalSide < 0 ? 0 : H - 40, GX1 - GX0, 40);
      g.globalAlpha = 1;
    }
    // Big faint scores either side of centre.
    g.globalAlpha = 0.35;
    label(g, String(theirs), 34, H / 2 - 30, 36, '#36c5f0');
    label(g, String(mine), 34, H / 2 + 32, 36, '#ff4fa3');
    g.globalAlpha = 1;
    label(g, `${Math.ceil(left)}`, W - 30, H / 2, 18, left < 10 ? '#e0283f' : '#fff');
    // Puck trail.
    const sp = Math.hypot(puck.vx, puck.vy);
    const hot = clamp(sp / 900, 0, 1);
    const col = hot > 0.7 ? '#ff6a00' : hot > 0.4 ? '#ffd23f' : '#ffffff';
    for (let k = 0; k < 12; k++) {
      const i = ((ti + k + 1) % 12) * 2;
      if (!trail[i] && !trail[i + 1]) continue;
      g.globalAlpha = (k / 12) * 0.35 * (0.3 + hot);
      g.fillStyle = col;
      g.beginPath();
      g.arc(trail[i], trail[i + 1], PR * (0.4 + k * 0.05), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // Puck.
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    g.arc(puck.x + 2, puck.y + 4, PR, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1b22';
    g.shadowColor = col;
    g.shadowBlur = 10 + hot * 14;
    g.beginPath();
    g.arc(puck.x, puck.y, PR, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(puck.x, puck.y, PR - 3, 0, Math.PI * 2);
    g.stroke();
    mallet(ai, '#36c5f0', now);
    mallet(me, '#ff4fa3', now);
    if (pause > 0 && !fin.ended && mine + theirs === 0) {
      label(g, 'drag your mallet', W / 2, H * 0.82, 16, '#fff');
      emoji(g, '👆', W / 2, H * 0.82 + 28 + Math.sin(now / 200) * 4, 22);
    }
  };

  // -------------------------------------------------------------- loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    const el = (now - t0) / 1000;
    const left = Math.max(0, END - el);
    goalFlash = Math.max(0, goalFlash - dt * 1.5);
    hitCool -= dt;
    if (!fx.frozen && !fin.ended) {
      if (kx || ky) (me.tx = me.x + kx * 40), (me.ty = me.y + ky * 40);
      drive(me, 2600, dt, false);
      const L = level(el);
      thinkT -= dt;
      if (thinkT <= 0) {
        thinkT = Math.max(0.04, 0.17 - L * 0.022);
        if (Math.random() < 0.3) aimX = GX0 + 10 + Math.random() * (GX1 - GX0 - 20);
        think(el);
      }
      drive(ai, 230 + 80 * L, dt, true);
      if (pause > 0) pause -= dt;
      else {
        const h = dt / SUB;
        for (let s = 0; s < SUB; s++) {
          puck.x += puck.vx * h;
          puck.y += puck.vy * h;
          strike(me, (s + 1) / SUB, true);
          strike(ai, (s + 1) / SUB, false);
          walls();
          if (puck.y < -PR) return goalThenLoop(true, now, left);
          if (puck.y > H + PR) return goalThenLoop(false, now, left);
        }
        const f = Math.exp(-0.32 * dt);
        puck.vx *= f;
        puck.vy *= f;
        const sp = Math.hypot(puck.vx, puck.vy);
        if (sp > MAXV) (puck.vx *= MAXV / sp), (puck.vy *= MAXV / sp);
        ti = (ti + 1) % 12;
        trail[ti * 2] = puck.x;
        trail[ti * 2 + 1] = puck.y;
      }
      if (left <= 0 && !fin.ended) {
        sfx.done();
        finish(now);
      }
    }
    frame(now, left);
  };
  const frame = (now: number, left: number) => {
    draw(now, left);
    fx.end(g);
    hud(`🏒 You ${mine} – ${theirs} House · ⏱ ${Math.ceil(left)}s${streak >= 2 ? ` · 🔥${streak}` : ''}`);
    raf = requestAnimationFrame(loop);
  };
  const goalThenLoop = (forMe: boolean, now: number, left: number) => {
    goal(forMe, now);
    frame(now, left);
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
