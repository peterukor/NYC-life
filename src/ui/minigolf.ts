// =====================================================================
// minigolf.ts (ui) — ⛳ rooftop mini golf: the intro card, nine holes
// drawn top-down on a canvas, the scorecard, and the end card with the
// 🏆 board. Holes, physics, the other player's putts and scoring live
// in sim/minigolf.ts.
//
// openMinigolf(host, { opponent?: { name, skill } })
//
// Controls (touch first, the mouse works the same): put a finger down
// anywhere and drag back, away from where you want the ball to go. The
// dotted line shows the direction, the ring round the ball the power.
// Let go to putt; let go back where you started (or just tap) to cancel.
// Solo, or versus a friend who putts in turn (alternate shots, honours
// to whoever won the last hole). A round costs $12.
// =====================================================================

import './minigolf.css';
import { esc, money } from '../core/format.ts';
import { fetchBoard, postScore } from '../net/scores.ts';
import { stake } from '../sim/casino.ts';
import {
  advance, atRest, BALL_R, cabAt, CUP_R, finishMinigolf, HOLES, MAX_STROKES, minigolfOf, MINIGOLF_COST, newPutter, PAR_TOTAL, planSteps, putt,
  seeded, spinnerAngle, stampFor, STAMP_WORD, STEP, toPar, type Hole, type PlayEvent, type Pt, type Putter, type Shot, type Stamp,
} from '../sim/minigolf.ts';
import { sfx } from './audio.ts';
import { rain, type CasinoHost } from './casino.ts';
import { openModal, toast } from './dom.ts';
import { boardHtml } from './scoreboard.ts';
import { buzz, Fx } from './juice.ts';

export interface MinigolfOpts { opponent?: { name: string; skill: number } }

const GAME = 'minigolf';
const TAU = Math.PI * 2;
const MARGIN = 4; // world units of rooftop around each hole
const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const DISPLAY = '"Lilita One", "Arial Black", system-ui, sans-serif';
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

/** Each hole's blocks: colour and a sign painted on top. */
const BLOCK_LOOK: Record<string, { fill: string; label?: string }> = {
  turnstile: { fill: '#8e9aaf' },
  sand: { fill: '#e2553f', label: 'BODEGA' },
  ramp: { fill: '#b46b4a', label: '🌉' },
  grate: { fill: '#2f9e64', label: 'UNION SQ' },
  rock: { fill: '#7b6cf6' },
};
const BALL_COLORS = ['#ffffff', '#ff6fb5'];

function skillWord(k: number): string {
  return k >= 0.85 ? 'pro ⭐' : k >= 0.65 ? 'good' : k >= 0.4 ? 'decent' : 'casual';
}

const STAMP_CLASS: Record<Stamp, string> = { ace: 'ace', albatross: 'eagle', eagle: 'eagle', birdie: 'birdie', par: 'par', bogey: 'over', double: 'over', worse: 'over', pickup: 'over' };

interface Player { name: string; you: boolean; skill: number; color: string; strokes: (number | null)[]; picked: boolean[]; p: Putter | null }

export function openMinigolf(host: CasinoHost, opts: MinigolfOpts = {}): void {
  const s = host.state;
  const foe = opts.opponent ? { name: opts.opponent.name || 'Your friend', skill: clamp(Number(opts.opponent.skill) || 0.5, 0, 1) } : null;
  const m = openModal(`<div class="mg">
    <div class="mg-top"><b><span aria-hidden="true">⛳</span> Mini golf</b><span class="mg-hud" aria-live="off"></span><button class="mg-x" data-close aria-label="Leave the course">✕</button></div>
    <div class="mg-players" ${foe ? '' : 'hidden'}></div>
    <div class="mg-stage"><canvas class="mg-cv" role="img" aria-label="Mini golf hole. Drag back from anywhere to aim, let go to putt."></canvas>
      <div class="mg-banner" aria-live="polite"></div>
      <div class="mg-over"></div>
    </div>
    <div class="mg-sc-wrap"></div>
  </div>`);
  m.el.classList.add('mg-modal');
  m.el.parentElement?.classList.add('mg-wrap');
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => m.el.querySelector<T>(sel)!;
  const cv = q<HTMLCanvasElement>('.mg-cv');
  const g = cv.getContext('2d')!;
  const stage = q('.mg-stage');
  const over = q('.mg-over');
  const banner = q('.mg-banner');
  const hudEl = q('.mg-hud');
  const playersEl = q('.mg-players');
  const scWrap = q('.mg-sc-wrap');

  // ------------------------------------------------------------ state
  type Phase = 'intro' | 'aim' | 'roll' | 'npc' | 'between' | 'end';
  let phase: Phase = 'intro';
  let hi = 0; // hole index
  let hole: Hole = HOLES[0];
  let t = 0; // hole clock (s)
  let acc = 0;
  let turn = 0; // index into players
  let order: number[] = [0, 1];
  const players: Player[] = [
    { name: 'You', you: true, skill: 1, color: BALL_COLORS[0], strokes: [], picked: [], p: null },
    ...(foe ? [{ name: foe.name, you: false, skill: foe.skill, color: BALL_COLORS[1], strokes: [], picked: [], p: null }] : []),
  ];
  let dead = false;
  let raf = 0;
  let timers: number[] = [];
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !dead && fn(), ms));

  // Drawing scale.
  let cssW = 320, cssH = 480, dpr = 1, S = 4, ox = 0, oy = 0;
  let fx = new Fx(cssW, cssH);
  let bg: HTMLCanvasElement | null = null;
  let PULL = 150;
  const toCss = (x: number, y: number) => ({ x: ox + x * S, y: oy + y * S });

  // Aim (yours while dragging, theirs while they line it up).
  const aim = { show: false, angle: -Math.PI / 2, power: 0 };
  let drag: { id: number; sx: number; sy: number; moved: boolean } | null = null;
  let lastNotch = 0;
  // The other player's putt in the works.
  let npc: { it: Generator<void, Shot, void>; shot: Shot | null; at: number; a0: number; t0: number } | null = null;
  // Little things to animate.
  const trail: { x: number; y: number; life: number; c: string }[] = [];
  const bumperHit = new Map<number, number>();
  const sinking = new Map<number, number>(); // player index → seconds since it dropped
  let lastTick = 0;
  let clock = 0; // real seconds (for decorative animation)

  // ------------------------------------------------------------ layout
  const fit = () => {
    cv.style.width = '10px';
    cv.style.height = '10px';
    stage.style.height = '';
    const overhead = m.el.offsetHeight - stage.offsetHeight;
    const availW = Math.max(220, stage.clientWidth);
    const availH = Math.max(300, window.innerHeight - 24 - overhead);
    cssW = Math.floor(availW);
    cssH = Math.floor(Math.min(availH, availW * 1.75));
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = `${cssW}px`;
    cv.style.height = `${cssH}px`;
    stage.style.height = `${cssH}px`;
    fx = new Fx(cssW, cssH);
    PULL = clamp(Math.min(cssW, cssH) * 0.42, 110, 190);
    camera();
  };
  const camera = () => {
    const xs = hole.outer.map((p) => p[0]), ys = hole.outer.map((p) => p[1]);
    const x0 = Math.min(...xs) - MARGIN, x1 = Math.max(...xs) + MARGIN, y0 = Math.min(...ys) - MARGIN, y1 = Math.max(...ys) + MARGIN;
    S = Math.min(cssW / (x1 - x0), cssH / (y1 - y0));
    ox = (cssW - (x1 - x0) * S) / 2 - x0 * S;
    oy = (cssH - (y1 - y0) * S) / 2 - y0 * S;
    bg = drawCourse(hole, cssW, cssH, dpr, S, ox, oy);
  };
  const onResize = () => {
    if (!dead) fit();
  };
  window.addEventListener('resize', onResize);

  // ------------------------------------------------------------ HUD & scorecard
  const me = () => players[0];
  const active = () => players[turn];
  const totalOf = (pl: Player) => pl.strokes.reduce<number>((a, x) => a + (x ?? 0), 0);
  const parSoFar = (pl: Player) => HOLES.reduce((a, h, i) => a + (pl.strokes[i] != null ? h.par : 0), 0);
  const hud = () => {
    const p = me().p;
    const stroke = p ? Math.min(MAX_STROKES, p.strokes + (p.done ? 0 : 1)) : 1;
    hudEl.textContent = phase === 'intro' || phase === 'end' ? `Par ${PAR_TOTAL}` : `Hole ${hole.n}/9 · Par ${hole.par}${p && !p.done ? ` · Stroke ${stroke}` : ''}`;
    if (foe) {
      playersEl.innerHTML = players.map((pl, i) => {
        const tp = parSoFar(pl) ? toPar(totalOf(pl), parSoFar(pl)) : 'E';
        const on = (phase === 'aim' || phase === 'npc' || phase === 'roll') && turn === i;
        return `<span class="mg-pl${on ? ' on' : ''}"><i style="--c:${pl.color}"></i>${esc(pl.name)} <b>${tp}</b></span>`;
      }).join('<span class="mg-vs">vs</span>');
    }
  };
  const scorecard = () => {
    const head = `<tr><th>Hole</th>${HOLES.map((h, i) => `<th class="${i === hi && phase !== 'intro' && phase !== 'end' ? 'cur' : ''}">${h.n}</th>`).join('')}<th>Tot</th></tr>`;
    const par = `<tr class="par"><th>Par</th>${HOLES.map((h) => `<td>${h.par}</td>`).join('')}<td>${PAR_TOTAL}</td></tr>`;
    const rows = players.map((pl) => `<tr class="${pl.you ? 'you' : 'foe'}"><th>${esc(pl.you ? 'You' : pl.name)}</th>${HOLES.map((h, i) => {
      const n = pl.strokes[i];
      if (n == null) return `<td class="${i === hi && phase !== 'intro' && phase !== 'end' ? 'cur' : ''}"></td>`;
      const st = stampFor(n, h.par, pl.picked[i]);
      return `<td class="st-${STAMP_CLASS[st]}" title="${STAMP_WORD[st]}">${n}</td>`;
    }).join('')}<td><b>${pl.strokes.some((x) => x != null) ? totalOf(pl) : ''}</b></td></tr>`).join('');
    scWrap.innerHTML = `<table class="mg-sc" aria-label="Scorecard">${head}${par}${rows}</table>`;
  };

  // ------------------------------------------------------------ cards
  const intro = () => {
    phase = 'intro';
    const rec = minigolfOf(s);
    over.className = 'mg-over';
    over.innerHTML = `<div class="mg-card">
      <div class="mg-emoji" aria-hidden="true">⛳</div>
      <h3>Rooftop Mini Golf</h3>
      <p>Nine holes up on the roof. Drag back from anywhere, let go to putt. Tap to cancel.</p>
      <div class="mg-chips"><span>💵 ${money(MINIGOLF_COST).replace('.00', '')} a round</span><span>⛳ Par ${PAR_TOTAL}</span>${rec?.best ? `<span>🏆 Best ${rec.best}</span>` : ''}</div>
      ${foe ? `<p class="mg-vsline">You vs <b>${esc(foe.name)}</b> <span class="mg-skill">${skillWord(foe.skill)}</span></p>` : ''}
      <button class="btn primary block" data-go>⛳ Tee off · ${money(MINIGOLF_COST).replace('.00', '')}</button>
    </div>`;
    over.hidden = false;
    hud();
    scorecard();
  };

  const startRound = () => {
    const why = stake(s, MINIGOLF_COST, 'Mini golf');
    if (why) return void toast(why, { icon: '⛳', tone: 'bad' });
    sfx.coin();
    host.saved();
    for (const pl of players) {
      pl.strokes = [];
      pl.picked = [];
      pl.p = null;
    }
    order = players.map((_, i) => i);
    over.hidden = true;
    startHole(0);
  };

  const startHole = (i: number) => {
    hi = i;
    hole = HOLES[i];
    t = 0;
    acc = 0;
    npc = null;
    drag = null;
    aim.show = false;
    trail.length = 0;
    sinking.clear();
    bumperHit.clear();
    for (const pl of players) pl.p = newPutter(hole);
    camera();
    banner.innerHTML = `<div class="mg-hole"><small>Hole ${hole.n} · Par ${hole.par}</small><b>${hole.emoji} ${esc(hole.name)}</b><span>${esc(hole.tip)}</span></div>`;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    sfx.whoosh();
    turn = order[0];
    scorecard();
    nextTurn(true);
  };

  /** Hand the putter to whoever's next. */
  const nextTurn = (first = false) => {
    const left = order.filter((i) => !players[i].p!.done);
    if (!left.length) return holeOver();
    if (!first && foe) {
      // Alternate shots; whoever's holed out sits down.
      const k = order.indexOf(turn);
      for (let j = 1; j <= order.length; j++) {
        const cand = order[(k + j) % order.length];
        if (!players[cand].p!.done) {
          turn = cand;
          break;
        }
      }
    } else if (players[turn].p!.done) turn = left[0];
    const pl = active();
    if (pl.you) {
      phase = 'aim';
      aim.show = false;
    } else {
      phase = 'npc';
      aim.show = true;
      aim.power = 0;
      // Plan for an exact moment on the hole clock (the same steps the loop will take).
      let at = t;
      const think = Math.round((0.9 + Math.random() * 0.6) / STEP);
      for (let k = 0; k < think; k++) at += STEP;
      const p = pl.p!;
      npc = { it: planSteps(hole, { x: p.ball.x, y: p.ball.y }, at, pl.skill, Math.random), shot: null, at, a0: aim.angle, t0: t };
    }
    hud();
  };

  const holeOver = () => {
    phase = 'between';
    aim.show = false;
    const results = players.map((pl) => {
      const p = pl.p!;
      pl.strokes[hi] = p.strokes;
      pl.picked[hi] = p.pickedUp;
      return stampFor(p.strokes, hole.par, p.pickedUp);
    });
    scorecard();
    hud();
    const mine = results[0];
    const color = mine === 'ace' || mine === 'albatross' || mine === 'eagle' ? '#ffd23f' : mine === 'birdie' ? '#7bf0a1' : mine === 'par' ? '#ffffff' : '#ffb3b3';
    fx.stamp(STAMP_WORD[mine], color, 1.5);
    const c = toCss(hole.cup.x, hole.cup.y);
    if (mine === 'ace') {
      sfx.jackpot();
      later(300, () => sfx.cheer());
      fx.burst(c.x, c.y, { n: 30, emoji: ['🎉', '⛳', '✨'], speed: 260, life: 1.2, up: true });
      fx.shake(8, 0.35);
      rain(stage, '🎉', 28);
      buzz([30, 40, 60]);
    } else if (mine === 'albatross' || mine === 'eagle' || mine === 'birdie') {
      sfx.win();
      fx.burst(c.x, c.y, { n: 18, colors: ['#ffd23f', '#7bf0a1', '#ffffff'], speed: 180, up: true });
    } else if (mine === 'par') sfx.good();
    else sfx.tap();
    if (foe) {
      const theirs = results[1];
      const fp = toCss(hole.cup.x, hole.cup.y + 8);
      later(500, () => fx.pop(fp.x, fp.y, `${foe.name}: ${STAMP_WORD[theirs].toLowerCase().replace('!', '')}`, '#ffd0e8', 16));
      // Honours: the lower score on this hole putts first on the next.
      const a = players[0].strokes[hi]!, b = players[1].strokes[hi]!;
      if (a !== b) order = a < b ? [0, 1] : [1, 0];
    }
    later(mine === 'ace' ? 2600 : 1900, () => (hi + 1 < HOLES.length ? startHole(hi + 1) : endRound()));
  };

  const endRound = () => {
    phase = 'end';
    const you = me();
    const total = totalOf(you);
    const aces = you.strokes.filter((x) => x === 1).length;
    const r = finishMinigolf(s, total, PAR_TOTAL, { versus: !!foe, aces });
    host.onScore?.(GAME, r.score);
    postScore(GAME, r.score);
    host.saved();
    const tp = toPar(total, PAR_TOTAL);
    let title = r.underPar ? 'Under par!' : total === PAR_TOTAL ? 'Even par' : 'Round done';
    let big = r.best ? '🏆' : '⛳';
    let vsLine = '';
    if (foe) {
      const theirs = totalOf(players[1]);
      title = total < theirs ? 'You win!' : total > theirs ? `${esc(foe.name)} wins` : 'All square';
      big = total < theirs ? '🏆' : total > theirs ? '😤' : '🤝';
      vsLine = `<p class="mg-vsres"><span>You <b>${total}</b></span><span>${esc(foe.name)} <b>${theirs}</b></span></p>`;
    }
    over.className = 'mg-over end';
    over.innerHTML = `<div class="mg-card">
      <div class="mg-emoji" aria-hidden="true">${big}</div>
      <h3>${title}</h3>
      <p class="mg-total">${total} <small>strokes</small> <em class="${total < PAR_TOTAL ? 'under' : total > PAR_TOTAL ? 'overpar' : ''}">${tp}</em></p>
      ${vsLine}
      <div class="mg-chips"><span>🏆 Score ${r.score}</span><span>${r.best ? '✨ New best' : `Best ${minigolfOf(s)?.best ?? total}`}</span>${aces ? `<span>⛳ ${aces} hole${aces > 1 ? 's' : ''} in one</span>` : ''}</div>
      ${r.underPar ? '<p class="mg-mood">⛳ Under par on the roof. You’re in a good mood.</p>' : ''}
      <div class="mg-btns"><button class="btn primary" data-go>🔁 Again · ${money(MINIGOLF_COST).replace('.00', '')}</button><button class="btn ghost" data-board>🏆 Board</button></div>
      <button class="btn ghost block" data-close>Done</button>
    </div>`;
    over.hidden = false;
    hud();
    scorecard();
    if (r.best || r.underPar) rain(m.el, r.underPar ? '⛳' : '🏆', 16);
    (foe ? total < totalOf(players[1]) : r.underPar) ? sfx.win() : sfx.chime();
  };

  // ------------------------------------------------------------ events → feel
  const onEvents = (i: number, ev: PlayEvent[]) => {
    const pl = players[i];
    for (const e of ev) {
      const c = toCss(e.x, e.y);
      switch (e.type) {
        case 'wall':
          if (e.speed > 10 && clock - lastTick > 0.05) {
            lastTick = clock;
            sfx.tick();
            if (e.speed > 60) fx.burst(c.x, c.y, { n: 4, colors: ['#ffffff', '#fff1c1'], speed: 70, gravity: 0, life: 0.2, size: 2.5 });
          }
          break;
        case 'bumper': {
          const k = hole.bumpers.findIndex((b) => Math.hypot(b.x - e.x, b.y - e.y) < b.r + BALL_R + 0.5);
          if (k >= 0) bumperHit.set(k, clock);
          sfx.note(520 + Math.random() * 300);
          fx.shake(3, 0.12);
          fx.burst(c.x, c.y, { n: 8, colors: ['#ff4fa3', '#ffd23f', '#ffffff'], speed: 120, gravity: 0, life: 0.3, size: 3 });
          break;
        }
        case 'cab':
          sfx.honk();
          fx.shake(5, 0.2);
          fx.pop(c.x, c.y - 10, 'HONK!', '#ffd23f', 18);
          buzz(20);
          break;
        case 'spin':
          if (clock - lastTick > 0.08) (lastTick = clock), sfx.clink();
          break;
        case 'sand':
          sfx.card();
          fx.burst(c.x, c.y, { n: 8, colors: ['#f3d58a', '#e0b860'], speed: 60, gravity: 0, life: 0.35, size: 3 });
          break;
        case 'water': {
          sfx.bad();
          fx.burst(c.x, c.y, { n: 14, colors: ['#8fd3ff', '#ffffff', '#39a7ff'], speed: 120, life: 0.5, size: 3, up: true });
          fx.pop(c.x, c.y - 6, '+1 💦', '#8fd3ff', 20);
          break;
        }
        case 'penalty':
          if (pl.you) toast('In the drink. One-stroke penalty, back where you hit it from.', { icon: '💦', tone: 'bad', ms: 2200 });
          break;
        case 'grate':
          sfx.whoosh();
          fx.burst(c.x, c.y, { n: 10, colors: ['#9aa3b5', '#ffd23f'], speed: 90, gravity: 0, life: 0.35, size: 3 });
          later(120, () => {
            const p = pl.p!;
            const o = toCss(p.ball.x, p.ball.y);
            fx.pop(o.x, o.y - 8, '🚇 Next stop!', '#ffffff', 15);
          });
          break;
        case 'lip':
          sfx.clink();
          fx.pop(c.x, c.y - 10, 'Lip out!', '#ffb3b3', 17);
          buzz(12);
          break;
        case 'cup':
          sfx.chime();
          sinking.set(i, 0);
          fx.burst(c.x, c.y, { n: 10, colors: ['#ffffff', '#ffd23f'], speed: 90, gravity: 0, life: 0.35, size: 3 });
          buzz(18);
          break;
        case 'pickup':
          fx.pop(c.x, c.y - 8, `${MAX_STROKES} strokes. Picked up.`, '#ffb3b3', 15);
          break;
        case 'stop':
          break;
      }
    }
  };

  // ------------------------------------------------------------ input
  const cssPoint = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cssW, y: ((e.clientY - r.top) / r.height) * cssH };
  };
  const canPutt = () => phase === 'aim' && active().you && !!active().p && atRest(active().p!);
  const down = (e: PointerEvent) => {
    if (!canPutt() || drag) return;
    e.preventDefault();
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      // Fine without capture.
    }
    const p = cssPoint(e);
    drag = { id: e.pointerId, sx: p.x, sy: p.y, moved: false };
    lastNotch = 0;
    aim.power = 0;
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = cssPoint(e);
    const dx = drag.sx - p.x, dy = drag.sy - p.y;
    const len = Math.hypot(dx, dy);
    if (len > 8) drag.moved = true;
    aim.show = len > 8;
    if (len > 2) aim.angle = Math.atan2(dy, dx);
    aim.power = clamp((len - 8) / PULL, 0, 1);
    const notch = Math.floor(aim.power * 5);
    if (notch !== lastNotch) {
      if (notch > lastNotch) (sfx.tick(), buzz(4));
      lastNotch = notch;
    }
  };
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    const go = e.type === 'pointerup' && aim.show && aim.power >= 0.03 && canPutt();
    aim.show = false;
    if (!go) return void (aim.power = 0);
    shoot(0, { angle: aim.angle, power: aim.power });
  };
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  const shoot = (i: number, shot: Shot) => {
    const p = players[i].p!;
    if (!putt(p, shot)) return;
    phase = 'roll';
    aim.show = false;
    sfx.tap();
    if (shot.power > 0.7) sfx.punch();
    buzz(10);
    hud();
  };

  // ------------------------------------------------------------ loop
  const update = (dt: number) => {
    clock += dt;
    for (const [k, v] of sinking) sinking.set(k, v + dt);
    for (let i = trail.length - 1; i >= 0; i--) if ((trail[i].life -= dt) <= 0) trail.splice(i, 1);
    if (phase === 'intro' || phase === 'end') return;
    // Their putt: think a slice per frame, swing the aim round, fire on the planned tick.
    if (phase === 'npc' && npc) {
      const t0 = performance.now();
      while (!npc.shot && performance.now() - t0 < 7) {
        const r = npc.it.next();
        if (r.done) npc.shot = r.value;
      }
      const span = Math.max(STEP, npc.at - npc.t0);
      const k = clamp((t - npc.t0) / span, 0, 1);
      const want = npc.shot ?? { angle: Math.atan2(hole.cup.y - active().p!.ball.y, hole.cup.x - active().p!.ball.x), power: 0.2 };
      let da = (((want.angle - npc.a0) % TAU) + TAU * 1.5) % TAU - Math.PI;
      if (!Number.isFinite(da)) da = 0;
      aim.angle = npc.a0 + da * ease(Math.min(1, k * 1.6));
      aim.power = want.power * ease(clamp((k - 0.4) / 0.6, 0, 1));
    }
    if (fx.frozen) return;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n++ < 10) {
      // Fire their putt exactly on the tick it was planned for.
      if (phase === 'npc' && npc && t >= npc.at - 1e-9) {
        if (!npc.shot) {
          for (;;) {
            const r = npc.it.next();
            if (r.done) {
              npc.shot = r.value;
              break;
            }
          }
        }
        const shot = npc.shot!;
        npc = null;
        shoot(turn, shot);
      }
      players.forEach((pl, i) => {
        const p = pl.p;
        if (!p || p.done) return;
        const ev = advance(hole, p, t, STEP);
        if (ev.length) onEvents(i, ev);
        if (p.rolling && Math.hypot(p.ball.vx, p.ball.vy) > 25 && Math.random() < 0.5) trail.push({ x: p.ball.x, y: p.ball.y, life: 0.25, c: pl.color });
      });
      t += STEP;
      acc -= STEP;
      if (phase === 'roll') {
        const p = active().p!;
        if (p.done || atRest(p)) {
          phase = 'between';
          hud();
          later(p.done ? 650 : 280, () => nextTurn());
        }
      }
    }
    if (acc > STEP * 10) acc = 0;
  };

  const draw = () => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);
    const dt = fx.begin(g);
    if (bg) g.drawImage(bg, 0, 0, cssW, cssH);
    g.save();
    g.transform(S, 0, 0, S, ox, oy);
    drawLive(g, hole, t, clock, bumperHit);
    // Trails.
    for (const d of trail) {
      g.globalAlpha = (d.life / 0.25) * 0.35;
      g.fillStyle = d.c;
      g.beginPath();
      g.arc(d.x, d.y, BALL_R * 0.7, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    // Balls (the one putting on top).
    const idx = players.map((_, i) => i).sort((a, b) => (a === turn ? 1 : 0) - (b === turn ? 1 : 0));
    for (const i of idx) {
      const pl = players[i];
      const p = pl.p;
      if (!p || phase === 'intro') continue;
      const sk = sinking.get(i);
      if (p.done && p.sunk && (sk === undefined || sk > 0.3)) continue;
      if (p.done && !p.sunk) continue;
      const k = sk === undefined ? 1 : 1 - sk / 0.3;
      const x = sk === undefined ? p.ball.x : hole.cup.x, y = sk === undefined ? p.ball.y : hole.cup.y;
      drawBall(g, x, y, BALL_R * k, pl.color, foe ? (i === turn ? 1 : 0.7) : 1);
    }
    // Your turn: a soft pulse round your ball.
    const pl = active();
    if (pl?.p && (phase === 'aim' || phase === 'npc') && atRest(pl.p)) {
      const b = pl.p.ball;
      if (phase === 'aim' && !aim.show) {
        const k = (clock * 1.4) % 1;
        g.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
        g.lineWidth = 0.5;
        g.beginPath();
        g.arc(b.x, b.y, BALL_R + 1 + k * 3.5, 0, TAU);
        g.stroke();
      }
      if (aim.show) drawAim(g, b.x, b.y, aim.angle, aim.power, pl.color);
    }
    g.restore();
    fx.end(g);
    void dt;
  };

  let last = performance.now();
  const loop = () => {
    if (dead) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
  };

  // ------------------------------------------------------------ clicks
  const close = () => {
    dead = true;
    cancelAnimationFrame(raf);
    timers.forEach((x) => window.clearTimeout(x));
    timers = [];
    window.removeEventListener('resize', onResize);
    sfx.close();
    host.saved();
    m.close();
  };
  m.el.addEventListener('click', (e) => {
    const tg = e.target as HTMLElement;
    if (tg.closest('[data-close]')) return close();
    if (tg.closest('[data-go]')) {
      sfx.tap();
      return startRound();
    }
    const bb = tg.closest<HTMLElement>('[data-board]');
    if (bb) {
      bb.setAttribute('disabled', '');
      void fetchBoard(s, GAME).then((b) => {
        if (dead) return;
        const box = document.createElement('div');
        box.className = 'mg-board';
        box.innerHTML = boardHtml(GAME, b).replace(/<h3>.*?<\/h3>/, '<h3>🏆 ⛳ Mini golf</h3>');
        over.querySelector('.mg-card')?.appendChild(box);
        box.scrollIntoView({ block: 'nearest' });
      });
    }
  });

  // Smoke-test hook (read-only view of the round; harmless in play).
  Object.defineProperty(cv, '__mg', {
    value: {
      state: () => ({ phase, hole: hole.n, t, you: turn === 0, ball: me().p ? { ...me().p!.ball } : null, strokes: players.map((pl) => [...pl.strokes]) }),
      toCss: (x: number, y: number) => toCss(x, y),
      pull: () => PULL,
    },
  });

  fit();
  intro();
  loop();
  // Phones: the modal's height can settle a beat after it opens.
  later(60, fit);
}

// ===================================================================== drawing

function poly(g: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

function zonePath(g: CanvasRenderingContext2D, z: Hole['zones'][number]): void {
  if (z.circle) {
    g.beginPath();
    g.arc(z.circle.x, z.circle.y, z.circle.r, 0, TAU);
  } else if (z.poly) poly(g, z.poly);
}

/** A tiny seeded random (the speckles stay put between redraws). */
const rng = seeded;

/** Everything that doesn't move, drawn once per hole (and on resize). */
function drawCourse(h: Hole, w: number, hh: number, dpr: number, S: number, ox: number, oy: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(hh * dpr);
  const g = c.getContext('2d')!;
  // Rooftop: warm tar with gravel and a few roof tiles.
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = g.createLinearGradient(0, 0, 0, hh);
  sky.addColorStop(0, '#3a3f5c');
  sky.addColorStop(1, '#2a2e45');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hh);
  const r = rng(h.n * 97);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 260; i++) g.fillRect(r() * w, r() * hh, 1.5, 1.5);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  const tile = Math.max(24, S * 10);
  for (let x = (ox % tile) - tile; x < w; x += tile) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, hh), g.stroke());
  for (let y = (oy % tile) - tile; y < hh; y += tile) (g.beginPath(), g.moveTo(0, y), g.lineTo(w, y), g.stroke());

  g.setTransform(dpr * S, 0, 0, dpr * S, dpr * ox, dpr * oy);
  // Drop shadow under the course.
  g.save();
  g.translate(0.8, 1.6);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  poly(g, h.outer);
  g.fill();
  g.restore();
  // Turf with mowing stripes.
  g.save();
  poly(g, h.outer);
  g.clip();
  g.fillStyle = '#4fd36a';
  g.fillRect(-10, -10, 400, 400);
  g.fillStyle = '#46c560';
  for (let y = -10; y < 200; y += 12) g.fillRect(-10, y, 400, 6);
  // Surfaces.
  for (const z of h.zones) {
    if (z.kind === 'street') {
      zonePath(g, z);
      g.fillStyle = '#4a5063';
      g.fill();
      const ys = z.poly!.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
      g.fillStyle = '#ffd23f';
      for (let x = 2; x < 80; x += 7) g.fillRect(x, (y0 + y1) / 2 - 0.3, 3.5, 0.6);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (let x = 1; x < 80; x += 4) (g.fillRect(x, y0 + 0.6, 2, 1.6), g.fillRect(x, y1 - 2.2, 2, 1.6));
    } else if (z.kind === 'sand') {
      zonePath(g, z);
      g.fillStyle = '#f3d58a';
      g.fill();
      g.lineWidth = 0.6;
      g.strokeStyle = '#d9b25e';
      g.stroke();
      g.save();
      zonePath(g, z);
      g.clip();
      g.fillStyle = 'rgba(160,110,40,0.35)';
      const rr = rng(z.circle ? z.circle.x * 13 + z.circle.y : 7);
      for (let i = 0; i < 70; i++) g.fillRect(rr() * 80, rr() * 130, 0.4, 0.4);
      g.restore();
    } else if (z.kind === 'water') {
      zonePath(g, z);
      g.fillStyle = '#2f9bf0';
      g.fill();
      g.save();
      zonePath(g, z);
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 0.5;
      for (let y = 0; y < 130; y += 4) for (let x = (y % 8) * 0.8; x < 80; x += 7) {
        g.beginPath();
        g.arc(x, y, 1.4, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
      g.restore();
      zonePath(g, z);
      g.lineWidth = 0.6;
      g.strokeStyle = '#1b6fb3';
      g.stroke();
    } else if (z.kind === 'ramp') {
      zonePath(g, z);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fill();
      // Shading: lighter at the top of the slope.
      const ys = z.poly!.map((p) => p[1]);
      const grd = g.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
      const up = (z.push?.[1] ?? 0) > 0;
      grd.addColorStop(0, up ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)');
      grd.addColorStop(1, up ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)');
      zonePath(g, z);
      g.fillStyle = grd;
      g.fill();
    } else if (z.kind === 'hill' && z.circle) {
      const grd = g.createRadialGradient(z.circle.x - 1.5, z.circle.y - 1.5, 0.5, z.circle.x, z.circle.y, z.circle.r);
      grd.addColorStop(0, 'rgba(255,255,255,0.4)');
      grd.addColorStop(1, 'rgba(0,0,0,0.08)');
      zonePath(g, z);
      g.fillStyle = grd;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 0.35;
      for (const k of [0.35, 0.65]) (g.beginPath(), g.arc(z.circle.x, z.circle.y, z.circle.r * k, 0, TAU), g.stroke());
    }
  }
  g.restore();
  // Tee mat.
  g.fillStyle = '#2e8f4a';
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 0.4;
  g.beginPath();
  g.roundRect(h.tee.x - 4, h.tee.y - 2.6, 8, 5.2, 1.2);
  g.fill();
  g.stroke();
  // Grates and manholes.
  for (const gr of h.grates) {
    g.fillStyle = '#2b2f3a';
    g.beginPath();
    g.arc(gr.x, gr.y, gr.r, 0, TAU);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(gr.x, gr.y, gr.r - 0.4, 0, TAU);
    g.clip();
    g.strokeStyle = '#8b93a6';
    g.lineWidth = 0.45;
    for (let k = -gr.r; k <= gr.r; k += 1.1) {
      g.beginPath();
      g.moveTo(gr.x + k, gr.y - gr.r);
      g.lineTo(gr.x + k, gr.y + gr.r);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = '#1c2340';
    g.lineWidth = 0.6;
    g.beginPath();
    g.arc(gr.x, gr.y, gr.r, 0, TAU);
    g.stroke();
    // Exit manhole with an arrow.
    g.fillStyle = '#5b6274';
    g.beginPath();
    g.arc(gr.to.x, gr.to.y, 3, 0, TAU);
    g.fill();
    g.strokeStyle = '#1c2340';
    g.stroke();
    g.save();
    g.translate(gr.to.x, gr.to.y);
    g.rotate(gr.dir);
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.moveTo(2.2, 0);
    g.lineTo(-1, -1.6);
    g.lineTo(-1, 1.6);
    g.closePath();
    g.fill();
    g.restore();
  }
  // Cup.
  g.fillStyle = '#10131f';
  g.beginPath();
  g.arc(h.cup.x, h.cup.y, CUP_R, 0, TAU);
  g.fill();
  g.strokeStyle = '#e9edf7';
  g.lineWidth = 0.45;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.arc(h.cup.x + 0.4, h.cup.y + 0.5, CUP_R * 0.6, 0, TAU);
  g.fill();
  // Blocks.
  const look = BLOCK_LOOK[h.id] ?? { fill: '#e2553f' };
  for (const b of h.blocks) {
    g.save();
    g.translate(0.5, 1);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    poly(g, b);
    g.fill();
    g.restore();
    poly(g, b);
    g.fillStyle = look.fill;
    g.fill();
    g.lineWidth = 0.7;
    g.strokeStyle = '#1c2340';
    g.stroke();
    // Brick lines.
    g.save();
    poly(g, b);
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    g.lineWidth = 0.25;
    const ys = b.map((p) => p[1]), xs = b.map((p) => p[0]);
    for (let y = Math.min(...ys) + 1.6; y < Math.max(...ys); y += 1.6) (g.beginPath(), g.moveTo(Math.min(...xs), y), g.lineTo(Math.max(...xs), y), g.stroke());
    g.restore();
    if (look.label) {
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      if (bw > 10 && bh > 3.5) {
        const isEmoji = !/[A-Z]/.test(look.label);
        g.font = isEmoji ? `${Math.min(bh * 0.8, 6)}px ${EMOJI_FONT}` : `900 ${Math.min(bh * 0.55, 3.6)}px ${DISPLAY}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#fff';
        g.fillText(look.label, cx, cy + 0.2);
      }
    }
  }
  // Outer wall: a chunky cream rail with an ink outline.
  poly(g, h.outer);
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = '#1c2340';
  g.stroke();
  g.lineWidth = 1.9;
  g.strokeStyle = '#fff4dc';
  g.stroke();
  return c;
}

/** The moving parts: ramp arrows, bumpers, cabs, turnstiles, the flag. */
function drawLive(g: CanvasRenderingContext2D, h: Hole, t: number, clock: number, hits: Map<number, number>): void {
  // Ramp chevrons drifting downhill.
  for (const z of h.zones) {
    if (z.kind !== 'ramp' || !z.poly || !z.push) continue;
    g.save();
    zonePath(g, z);
    g.clip();
    const xs = z.poly.map((p) => p[0]), ys = z.poly.map((p) => p[1]);
    const a = Math.atan2(z.push[1], z.push[0]);
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 0.6;
    const off = (clock * 4) % 8;
    for (let y = Math.min(...ys) - 8 + off; y < Math.max(...ys) + 4; y += 8)
      for (let x = Math.min(...xs) + 6; x < Math.max(...xs); x += 12) {
        g.save();
        g.translate(x, y);
        g.rotate(a - Math.PI / 2);
        g.beginPath();
        g.moveTo(-2.4, -1.2);
        g.lineTo(0, 1.2);
        g.lineTo(2.4, -1.2);
        g.stroke();
        g.restore();
      }
    g.restore();
  }
  // Bumpers, hydrants and posts.
  h.bumpers.forEach((b, i) => {
    const since = clock - (hits.get(i) ?? -9);
    const pop = since < 0.18 ? 1 + 0.25 * (1 - since / 0.18) : 1;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.arc(b.x + 0.4, b.y + 0.8, b.r, 0, TAU);
    g.fill();
    if (b.kind === 'bumper') {
      g.fillStyle = since < 0.18 ? '#fff6a8' : '#ff4fa3';
      g.beginPath();
      g.arc(b.x, b.y, b.r * pop, 0, TAU);
      g.fill();
      g.lineWidth = 0.5;
      g.strokeStyle = '#1c2340';
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 0.45;
      g.beginPath();
      g.arc(b.x, b.y, b.r * pop * 0.6, 0, TAU);
      g.stroke();
    } else if (b.kind === 'hydrant') {
      g.fillStyle = '#e63946';
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, TAU);
      g.fill();
      g.lineWidth = 0.5;
      g.strokeStyle = '#1c2340';
      g.stroke();
      g.fillStyle = '#ffd0d4';
      g.beginPath();
      g.arc(b.x - 0.4, b.y - 0.4, b.r * 0.4, 0, TAU);
      g.fill();
    } else {
      g.fillStyle = '#c9d1e3';
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, TAU);
      g.fill();
      g.lineWidth = 0.5;
      g.strokeStyle = '#1c2340';
      g.stroke();
    }
  });
  // Turnstiles.
  for (const sp of h.spinners) {
    const a0 = spinnerAngle(sp, t);
    g.lineCap = 'round';
    for (let i = 0; i < sp.arms; i++) {
      const a = a0 + (i * TAU) / sp.arms;
      const x1 = sp.x + Math.cos(a) * sp.hub * 0.6, y1 = sp.y + Math.sin(a) * sp.hub * 0.6, x2 = sp.x + Math.cos(a) * sp.len, y2 = sp.y + Math.sin(a) * sp.len;
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x1 + 0.4, y1 + 0.8);
      g.lineTo(x2 + 0.4, y2 + 0.8);
      g.stroke();
      g.strokeStyle = '#1c2340';
      g.lineWidth = 1.7;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.strokeStyle = '#dfe6f3';
      g.lineWidth = 1;
      g.stroke();
    }
    g.fillStyle = '#9aa3b5';
    g.beginPath();
    g.arc(sp.x, sp.y, sp.hub, 0, TAU);
    g.fill();
    g.lineWidth = 0.5;
    g.strokeStyle = '#1c2340';
    g.stroke();
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(sp.x, sp.y, sp.hub * 0.35, 0, TAU);
    g.fill();
  }
  // Cabs.
  for (const c of h.cabs) {
    const p = cabAt(c, t);
    const dir = Math.sign(p.vx || 1);
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.roundRect(-c.w / 2 + 0.6, -c.h / 2 + 1.2, c.w, c.h, 2);
    g.fill();
    g.fillStyle = '#ffc629';
    g.strokeStyle = '#1c2340';
    g.lineWidth = 0.6;
    g.beginPath();
    g.roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 2);
    g.fill();
    g.stroke();
    // Windshield and rear window (the front faces where it's going).
    g.fillStyle = '#26324f';
    g.beginPath();
    g.roundRect(dir * c.w * 0.14 - 1.3, -c.h / 2 + 1, 2.6, c.h - 2, 0.8);
    g.fill();
    g.beginPath();
    g.roundRect(-dir * c.w * 0.3 - 1, -c.h / 2 + 1.3, 2, c.h - 2.6, 0.7);
    g.fill();
    // Checker stripe and the roof light.
    g.fillStyle = '#1c2340';
    for (let x = -c.w / 2 + 1; x < c.w / 2 - 1; x += 1.4) g.fillRect(x, c.h / 2 - 1.1, 0.7, 0.7);
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(-dir * 1.6 - 1.4, -1, 2.8, 2, 0.5);
    g.fill();
    g.fillStyle = '#ff9f1c';
    g.fillRect(dir * c.w / 2 - (dir > 0 ? 0.8 : 0), -c.h / 2 + 0.8, 0.8, 1.4);
    g.fillRect(dir * c.w / 2 - (dir > 0 ? 0.8 : 0), c.h / 2 - 2.2, 0.8, 1.4);
    g.restore();
  }
  // The flag: a pin leaning off the cup with a waving pennant.
  const fx0 = h.cup.x, fy0 = h.cup.y;
  const tx = fx0 + 3, ty = fy0 - 9;
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 0.5;
  g.beginPath();
  g.moveTo(fx0, fy0);
  g.lineTo(fx0 + 7, fy0 - 2);
  g.stroke();
  g.strokeStyle = '#f4f1e6';
  g.lineWidth = 0.55;
  g.beginPath();
  g.moveTo(fx0, fy0);
  g.lineTo(tx, ty);
  g.stroke();
  const wave = Math.sin(clock * 5) * 0.6;
  g.fillStyle = '#ff3b5c';
  g.strokeStyle = '#1c2340';
  g.lineWidth = 0.35;
  g.beginPath();
  g.moveTo(tx, ty);
  g.quadraticCurveTo(tx + 3, ty + 0.6 + wave, tx + 5.5, ty + 1.6 + wave * 0.5);
  g.lineTo(tx - 0.6, ty + 3.4);
  g.closePath();
  g.fill();
  g.stroke();
}

function drawBall(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (r <= 0.05) return;
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(x + 0.35, y + 0.6, r, r * 0.85, 0, 0, TAU);
  g.fill();
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.45, color);
  gr.addColorStop(1, color === '#ffffff' ? '#c9cfdc' : '#c2457f');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.lineWidth = 0.25;
  g.strokeStyle = '#1c2340';
  g.stroke();
  g.globalAlpha = 1;
}

/** The dotted line where it's going, and the power ring round the ball. */
function drawAim(g: CanvasRenderingContext2D, x: number, y: number, angle: number, power: number, color: string): void {
  const len = 6 + power * 42;
  const cx = Math.cos(angle), cy = Math.sin(angle);
  const col = power < 0.5 ? '#7bf0a1' : power < 0.8 ? '#ffd23f' : '#ff5a5a';
  for (let d = BALL_R + 2; d < len; d += 2.4) {
    const k = d / len;
    g.globalAlpha = 1 - k * 0.6;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x + cx * d, y + cy * d, 0.55 * (1 - k * 0.4), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  // Arrow tip.
  const ax = x + cx * len, ay = y + cy * len;
  g.save();
  g.translate(ax, ay);
  g.rotate(angle);
  g.fillStyle = color;
  g.strokeStyle = '#1c2340';
  g.lineWidth = 0.3;
  g.beginPath();
  g.moveTo(1.8, 0);
  g.lineTo(-1, -1.4);
  g.lineTo(-1, 1.4);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  // Power ring.
  const R = BALL_R + 2.6;
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(x, y, R, 0, TAU);
  g.stroke();
  g.strokeStyle = col;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + power * TAU);
  g.stroke();
  g.lineCap = 'butt';
}
