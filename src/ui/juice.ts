// =====================================================================
// juice.ts — game feel for every mini game (Peter, 2026-10-16: "make all
// the mini games more fun").
//
// For canvas games, one Fx per game:
//   fx.begin(g) … draw the game … fx.end(g)   (shake, particles, texts, flash)
//   fx.burst(x, y, …)   particles (dots or emoji: crumbs, feathers, sparks)
//   fx.pop(x, y, text)  floating "+20 ×3" that rises and fades
//   fx.shake(power)     screen shake that settles
//   fx.flash(color)     a full-screen flash
//   fx.stop(seconds)    hit-stop: freeze for a beat on a big hit
//   fx.stamp(text)      a big centred word (PERFECT!, ON FIRE!, K.O.!)
// For DOM games (fights, fishing, shifts): popAt, shakeEl, burstAt.
// Phones buzz a little on big moments (vibrate, where supported).
// =====================================================================

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color?: string;
  emoji?: string;
  spin: number;
  rot: number;
  gravity: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

/** People who asked for less motion get gentler shakes. */
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const DISPLAY = '"Lilita One", "Arial Black", system-ui, sans-serif';

/** A short buzz on phones that support it (ignored elsewhere). */
export function buzz(ms: number | number[] = 18): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not allowed here: fine.
  }
}

export class Fx {
  private parts: Particle[] = [];
  private floats: Floater[] = [];
  private shakeT = 0;
  private shakePow = 0;
  private flashT = 0;
  private flashMax = 0;
  private flashColor = '#fff';
  private stopT = 0;
  private stampT = 0;
  private stampMax = 0;
  private stampText = '';
  private stampColor = '#ffd23f';
  private last = performance.now();
  /** Shake offset this frame (games can also use it). */
  ox = 0;
  oy = 0;
  private w: number;
  private h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  /** True while a hit-stop freezes the action (skip the game's own update). */
  get frozen(): boolean {
    return this.stopT > 0;
  }

  burst(x: number, y: number, opts: { n?: number; colors?: string[]; emoji?: string | string[]; speed?: number; size?: number; gravity?: number; life?: number; up?: boolean } = {}): void {
    const n = opts.n ?? 14;
    const emojis = opts.emoji ? (Array.isArray(opts.emoji) ? opts.emoji : [opts.emoji]) : null;
    for (let i = 0; i < n; i++) {
      const a = opts.up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 180) * (0.4 + Math.random() * 0.8);
      const life = (opts.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: (opts.size ?? (emojis ? 18 : 4)) * (0.7 + Math.random() * 0.6),
        color: emojis ? undefined : (opts.colors ?? ['#ffd23f', '#ff4fa3', '#36c5f0', '#7bd88f'])[i % (opts.colors?.length ?? 4)],
        emoji: emojis ? emojis[i % emojis.length] : undefined,
        spin: (Math.random() - 0.5) * 8,
        rot: Math.random() * Math.PI,
        gravity: opts.gravity ?? 420,
      });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }

  pop(x: number, y: number, text: string, color = '#ffd23f', size = 22): void {
    this.floats.push({ x, y, text, color, size, life: 0.9, max: 0.9 });
    if (this.floats.length > 30) this.floats.shift();
  }

  shake(power = 8, seconds = 0.3): void {
    if (REDUCED) power *= 0.3;
    this.shakePow = Math.max(this.shakePow, power);
    this.shakeT = Math.max(this.shakeT, seconds);
    if (power >= 10) buzz(power >= 16 ? [30, 30, 40] : 25);
  }

  flash(color = '#ffffff', seconds = 0.18): void {
    this.flashColor = color;
    this.flashT = this.flashMax = seconds;
  }

  stop(seconds = 0.08): void {
    this.stopT = Math.max(this.stopT, seconds);
  }

  stamp(text: string, color = '#ffd23f', seconds = 0.9): void {
    this.stampText = text;
    this.stampColor = color;
    this.stampT = this.stampMax = seconds;
  }

  /** Before drawing the game: advance effects and apply the shake. Returns dt. */
  begin(g: CanvasRenderingContext2D): number {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.stopT = Math.max(0, this.stopT - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    const k = this.shakeT > 0 ? this.shakePow * Math.min(1, this.shakeT / 0.15) : 0;
    if (this.shakeT <= 0) this.shakePow = 0;
    this.ox = (Math.random() - 0.5) * 2 * k;
    this.oy = (Math.random() - 0.5) * 2 * k;
    g.save();
    g.translate(this.ox, this.oy);
    return dt;
  }

  /** After drawing the game: particles, floating texts, stamp and flash on top. */
  end(g: CanvasRenderingContext2D): void {
    const dt = Math.min(0.05, (performance.now() - this.last) / 1000 + 1 / 60);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      const a = Math.min(1, p.life / (p.max * 0.5));
      g.globalAlpha = a;
      if (p.emoji) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.font = `${p.size}px ${EMOJI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(p.emoji, 0, 0);
        g.restore();
      } else {
        g.fillStyle = p.color!;
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    g.globalAlpha = 1;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floats.splice(i, 1);
        continue;
      }
      const t = 1 - f.life / f.max;
      const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : 1.2 - Math.min(0.2, (t - 0.15) * 0.5);
      g.globalAlpha = Math.min(1, f.life / (f.max * 0.4));
      g.font = `900 ${Math.round(f.size * scale)}px ${DISPLAY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,.55)';
      g.strokeText(f.text, f.x, f.y - t * 46);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y - t * 46);
    }
    g.globalAlpha = 1;
    g.restore(); // undo the shake before the overlays
    if (this.stampT > 0) {
      this.stampT -= dt;
      const t = this.stampT;
      // Pop in: starts at 1.8× and settles to 1× over the first 0.2 s, whatever the duration.
      const e = this.stampMax - t;
      const s = e < 0.2 ? 1.8 - e * 4 : 1;
      g.globalAlpha = Math.min(1, t * 3);
      g.save();
      g.translate(this.w / 2, this.h * 0.32);
      g.rotate(-0.06);
      g.scale(s, s);
      // Fit the width of the game (small canvases get a smaller stamp).
      let size = Math.min(40, this.w / 8);
      g.font = `900 ${size}px ${DISPLAY}`;
      const tw = g.measureText(this.stampText).width;
      if (tw > this.w * 0.86) {
        size *= (this.w * 0.86) / tw;
        g.font = `900 ${size}px ${DISPLAY}`;
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = Math.max(3, size / 6);
      g.strokeStyle = '#1c2340';
      g.strokeText(this.stampText, 0, 0);
      g.fillStyle = this.stampColor;
      g.fillText(this.stampText, 0, 0);
      g.restore();
      g.globalAlpha = 1;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      g.globalAlpha = Math.max(0, this.flashT / this.flashMax) * 0.45;
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, this.w, this.h);
      g.globalAlpha = 1;
    }
  }
}

/** A combo counter with a timeout: hit() within `window` seconds keeps it going. */
export class Combo {
  n = 0;
  best = 0;
  private lastAt = 0;
  private window: number;
  constructor(windowSeconds = 1.5) {
    this.window = windowSeconds;
  }
  hit(now = performance.now()): number {
    this.n = now - this.lastAt < this.window * 1000 || this.n === 0 ? this.n + 1 : 1;
    this.lastAt = now;
    this.best = Math.max(this.best, this.n);
    return this.n;
  }
  /** Points multiplier: ×1 … ×max as the combo grows (every `per` hits). */
  mult(per = 5, max = 5): number {
    return Math.min(max, 1 + Math.floor(this.n / per));
  }
  break(): void {
    this.n = 0;
  }
  /** Still alive? (the timer hasn't run out) */
  alive(now = performance.now()): boolean {
    return this.n > 0 && now - this.lastAt < this.window * 1000;
  }
  /** 0..1 of the combo timer left (for a draining bar). */
  left(now = performance.now()): number {
    return this.n ? Math.max(0, 1 - (now - this.lastAt) / (this.window * 1000)) : 0;
  }
}

// ---------------------------------------------------------------- DOM games

/** Floating text over an element (fights, fishing, shifts). */
export function popAt(el: HTMLElement, text: string, opts: { color?: string; x?: number; y?: number; size?: number } = {}): void {
  const r = el.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'fx-pop';
  p.textContent = text;
  p.style.left = `${r.left + (opts.x ?? r.width / 2)}px`;
  p.style.top = `${r.top + (opts.y ?? r.height / 2)}px`;
  if (opts.color) p.style.color = opts.color;
  if (opts.size) p.style.fontSize = `${opts.size}px`;
  document.body.appendChild(p);
  window.setTimeout(() => p.remove(), 1000);
}

/** Shake an element (CSS animation). */
export function shakeEl(el: HTMLElement, hard = false): void {
  el.classList.remove('fx-shake', 'fx-shake-hard');
  void el.offsetWidth; // restart the animation
  el.classList.add(hard ? 'fx-shake-hard' : 'fx-shake');
  window.setTimeout(() => el.classList.remove('fx-shake', 'fx-shake-hard'), 450);
  if (hard) buzz(30);
}

/** Emoji confetti from a point on screen (DOM). */
export function burstAt(el: HTMLElement, emoji: string | string[], n = 10): void {
  const r = el.getBoundingClientRect();
  const list = Array.isArray(emoji) ? emoji : [emoji];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'fx-bit';
    p.textContent = list[i % list.length];
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.top + r.height / 2}px`;
    p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    p.style.setProperty('--dy', `${Math.sin(a) * d - 40}px`);
    p.style.setProperty('--rot', `${(Math.random() - 0.5) * 540}deg`);
    document.body.appendChild(p);
    window.setTimeout(() => p.remove(), 900);
  }
}
