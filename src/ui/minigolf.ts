// =====================================================================
// minigolf.ts (ui) — ⛳ Central Park mini golf: the course picker, ten
// holes a round drawn top-down on a canvas, the live strokes / time HUD,
// pause, the scorecard, and the end card with the score breakdown and
// each course's 🏆 board. Holes, physics, the other player's putts and
// scoring live in sim/minigolf.ts; the seventy holes in
// sim/minigolf-courses/.
//
// openMinigolf(host, { opponent?: { name, skill }, course?, unlockAll? })
//   course: preselect a course id ('c1'…'c7'); unlockAll: every course
//   with holes is pickable (testing and previews only).
//
// Controls (touch first, the mouse works the same): put a finger down
// anywhere and drag back, away from where you want the ball to go. The
// dotted line shows the direction, the ring round the ball the power.
// Let go to putt; let go back where you started (or just tap) to cancel.
// The ⏱ clock only runs while it's your turn and the ball is still (it
// stops while it rolls, on the hole banner, and on the other player's
// turn). Solo, or versus a friend who putts in turn. A round costs $12.
// =====================================================================

import './minigolf.css';
import { esc, money } from '../core/format.ts';
import { fetchBoard, postScore, type Board } from '../net/scores.ts';
import { changeMoney } from '../sim/economy.ts';
import { COURSES, type Course, type CourseTheme } from '../sim/minigolf-courses/index.ts';
import {
  advance, armAngle, atRest, BALL_R, boardId, cabAt, clockText, courseRecord, courseUnlocked, CUP_R, cupAt, finishMinigolf, flipperIn, gateAt, holeBox, holeTime,
  maxStrokes, MINIGOLF_COST, moverAt, newHoleState, newPutter, planSteps, putt, seeded, spinnerAngle, stampFor, STAMP_WORD, STEP, tideRect, toPar,
  windAt, type Hole, type HoleState, type PlannedShot, type PlayEvent, type Pt, type Putter, type Shot, type Stamp, type Zone,
} from '../sim/minigolf.ts';
import { sfx } from './audio.ts';
import { rain, type CasinoHost } from './casino.ts';
import { openModal, toast } from './dom.ts';
import { boardHtml } from './scoreboard.ts';
import { buzz, Fx } from './juice.ts';

export interface MinigolfOpts {
  opponent?: { name: string; skill: number };
  /** Preselect this course on the picker ('c1'…'c7'). */
  course?: string;
  /** Every course with holes is pickable (testing / previews). */
  unlockAll?: boolean;
}

const TAU = Math.PI * 2;
const MARGIN = 4; // world units of background round each hole
const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const DISPLAY = '"Lilita One", "Arial Black", system-ui, sans-serif';
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const ease = (k: number) => 1 - Math.pow(1 - k, 3);
const BALL_COLORS = ['#ffffff', '#ff6fb5'];
/** Switch colours (by order on the hole): the button and everything it drives wear it. */
const SW_COLORS = ['#ff9f1c', '#3cc8ff', '#c77dff', '#7bf0a1'];
const PORTAL_COLORS = [['#3cc8ff', '#ff9f1c'], ['#c77dff', '#7bf0a1'], ['#ff5d8f', '#ffe066']];
/** The hole banner hangs this long before the clock starts (unless you touch first). */
const BANNER_S = 2.2;
const SWAP_S = 0.5; // the camera's move to the next hole

function skillWord(k: number): string {
  return k >= 0.85 ? 'pro ⭐' : k >= 0.65 ? 'good' : k >= 0.4 ? 'decent' : 'casual';
}
const stars = (n: number) => `<span class="putt-stars" aria-label="${n} of 5 stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
const cash = () => money(MINIGOLF_COST).replace('.00', '');

const STAMP_CLASS: Record<Stamp, string> = { ace: 'ace', albatross: 'eagle', eagle: 'eagle', birdie: 'birdie', par: 'par', bogey: 'over', double: 'over', worse: 'over', pickup: 'over' };

interface Player { name: string; you: boolean; skill: number; color: string; strokes: (number | null)[]; picked: boolean[]; secs: number[]; p: Putter | null }

export function openMinigolf(host: CasinoHost, opts: MinigolfOpts = {}): void {
  const s = host.state;
  const foe = opts.opponent ? { name: opts.opponent.name || 'Your friend', skill: clamp(Number(opts.opponent.skill) || 0.5, 0, 1) } : null;
  const m = openModal(`<div class="putt">
    <div class="putt-top"><b class="putt-title"><span aria-hidden="true" data-cemoji>⛳</span> <span data-cname>Mini golf</span></b><span class="putt-hud" aria-live="off"></span>
      <button class="putt-x putt-pause" data-pause aria-label="Pause" hidden>⏸</button><button class="putt-x" data-close aria-label="Leave the course">✕</button></div>
    <div class="putt-stats" hidden>
      <span class="putt-chip"><small>Hole</small><b data-hole>1/10</b><i data-hpar>Par 3</i></span>
      <span class="putt-chip"><small>Strokes</small><b data-strokes>0</b><i data-topar>E</i></span>
      <span class="putt-chip putt-time"><small>⏱ Time</small><b data-time>0.0s</b><i data-ptime>par 0s</i></span>
    </div>
    <div class="putt-players" ${foe ? '' : 'hidden'}></div>
    <div class="putt-stage"><canvas class="putt-cv" role="img" aria-label="Mini golf hole. Drag back from anywhere to aim, let go to putt."></canvas>
      <div class="putt-banner" aria-live="polite"></div>
      <div class="putt-over"></div>
    </div>
    <div class="putt-sc-wrap"></div>
  </div>`);
  m.el.classList.add('putt-modal');
  m.el.parentElement?.classList.add('putt-wrap');
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => m.el.querySelector<T>(sel)!;
  const cv = q<HTMLCanvasElement>('.putt-cv');
  const g = cv.getContext('2d')!;
  const stage = q('.putt-stage');
  const over = q('.putt-over');
  const banner = q('.putt-banner');
  const statsEl = q('.putt-stats');
  const pauseBtn = q('[data-pause]');
  const playersEl = q('.putt-players');
  const scWrap = q('.putt-sc-wrap');

  // ------------------------------------------------------------ state
  type Phase = 'intro' | 'aim' | 'roll' | 'npc' | 'between' | 'end';
  let phase: Phase = 'intro';
  const pickable = (c: Course, i: number) => c.holes.length > 0 && (opts.unlockAll || (c.ready && courseUnlocked(s, i)));
  // Start on the course you asked for, else the furthest one you can play.
  let course: Course = COURSES.find((c, i) => c.id === opts.course && pickable(c, i)) ?? [...COURSES].reverse().find((c) => pickable(c, COURSES.indexOf(c))) ?? COURSES[0];
  let hi = 0; // hole index
  let hole: Hole = course.holes[0];
  let st: HoleState = newHoleState(hole);
  let t = 0; // hole clock (s)
  let acc = 0;
  let turn = 0;
  let order: number[] = [0, 1];
  const players: Player[] = [
    { name: 'You', you: true, skill: 1, color: BALL_COLORS[0], strokes: [], picked: [], secs: [], p: null },
    ...(foe ? [{ name: foe.name, you: false, skill: foe.skill, color: BALL_COLORS[1], strokes: [], picked: [], secs: [], p: null }] : []),
  ];
  let dead = false;
  let paused = false;
  let raf = 0;
  let timers: number[] = [];
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !dead && fn(), ms));
  // ⏱ Active play time on this hole, and when the banner lets the clock start.
  let holeSecs = 0;
  let clockFrom = 0;

  // Drawing scale.
  let cssW = 320, cssH = 480, dpr = 1, S = 4, ox = 0, oy = 0;
  let fx = new Fx(cssW, cssH);
  let artCv: HTMLCanvasElement | null = null;
  let courseCv: HTMLCanvasElement | null = null;
  let PULL = 150;
  const toCss = (x: number, y: number) => ({ x: ox + x * S, y: oy + y * S });
  // The camera's move between holes: the old picture slides off as the new one comes in.
  let swap: { img: HTMLCanvasElement; k: number } | null = null;

  const aim = { show: false, angle: -Math.PI / 2, power: 0 };
  let drag: { id: number; sx: number; sy: number; moved: boolean } | null = null;
  let lastNotch = 0;
  // The other player's putt in the works: plan for a tick `steps` from now (+ the wait it picks).
  let npc: { it: Generator<void, PlannedShot, void>; shot: PlannedShot | null; steps: number; fire: number; a0: number } | null = null;
  const trail: { x: number; y: number; life: number; c: string }[] = [];
  const flash = new Map<string, number>(); // obstacle key → clock when it was hit
  const sinking = new Map<number, number>();
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
    const [bx0, by0, bx1, by1] = holeBox(hole);
    const x0 = bx0 - MARGIN, x1 = bx1 + MARGIN, y0 = by0 - MARGIN, y1 = by1 + MARGIN;
    S = Math.min(cssW / (x1 - x0), cssH / (y1 - y0));
    ox = (cssW - (x1 - x0) * S) / 2 - x0 * S;
    oy = (cssH - (y1 - y0) * S) / 2 - y0 * S;
    artCv = drawArt(course.theme, hole, cssW, cssH, dpr, ox, oy, S);
    courseCv = drawCourse(hole, course.theme, cssW, cssH, dpr, S, ox, oy);
  };
  const onResize = () => {
    if (!dead) fit();
  };
  window.addEventListener('resize', onResize);
  const onVis = () => {
    if (document.hidden && !dead && !paused && phase !== 'intro' && phase !== 'end') pause();
  };
  document.addEventListener('visibilitychange', onVis);

  // ------------------------------------------------------------ HUD & scorecard
  const me = () => players[0];
  const active = () => players[turn];
  const totalOf = (pl: Player) => pl.strokes.reduce<number>((a, x) => a + (x ?? 0), 0);
  const parSoFar = (pl: Player) => course.holes.reduce((a, h, i) => a + (pl.strokes[i] != null ? h.par : 0), 0);
  const timeOf = (pl: Player) => pl.secs.reduce((a, x, i) => a + holeTime(x ?? 0, course.holes[i].parTime, !!pl.picked[i]), 0);
  /** Your ⏱ so far this round (finished holes plus this one). */
  const myTime = () => timeOf(me()) + (phase === 'end' || me().strokes[hi] != null ? 0 : holeSecs);
  const myStrokes = () => totalOf(me()) + (me().strokes[hi] == null && me().p ? me().p!.strokes : 0);
  const header = () => {
    q('[data-cemoji]').textContent = course.emoji;
    q('[data-cname]').textContent = phase === 'intro' ? 'Mini golf' : course.name;
  };
  const hud = () => {
    const inRound = phase !== 'intro' && phase !== 'end';
    statsEl.hidden = !inRound;
    pauseBtn.hidden = !inRound;
    header();
    if (inRound) {
      q('[data-hole]').textContent = `${hole.n}/${course.holes.length}`;
      q('[data-hpar]').textContent = `Par ${hole.par}`;
      const n = myStrokes();
      const par = parSoFar(me()) + (me().strokes[hi] == null ? hole.par : 0);
      q('[data-strokes]').textContent = String(n);
      q('[data-topar]').textContent = toPar(totalOf(me()), parSoFar(me()));
      q('[data-topar]').title = `par ${par} through this hole`;
      hudTime();
    }
    if (foe) {
      playersEl.innerHTML = players.map((pl, i) => {
        const tp = parSoFar(pl) ? toPar(totalOf(pl), parSoFar(pl)) : 'E';
        const on = (phase === 'aim' || phase === 'npc' || phase === 'roll') && turn === i;
        return `<span class="putt-pl${on ? ' on' : ''}"><i style="--c:${pl.color}"></i>${esc(pl.name)} <b>${tp}</b></span>`;
      }).join('<span class="putt-vs">vs</span>');
    }
  };
  const timeEl = q('[data-time]'), ptimeEl = q('[data-ptime]'), timeChip = q('.putt-time');
  let shownTime = '';
  const hudTime = () => {
    const txt = clockText(myTime());
    if (txt !== shownTime) {
      timeEl.textContent = txt;
      shownTime = txt;
    }
    ptimeEl.textContent = `par ${clockText(course.parTime)}`;
    timeChip.classList.toggle('slow', holeSecs > hole.parTime && me().strokes[hi] == null);
    timeChip.classList.toggle('running', clockRunning());
  };
  const scorecard = () => {
    const cur = (i: number) => (i === hi && phase !== 'intro' && phase !== 'end' ? 'cur' : '');
    const head = `<tr><th>Hole</th>${course.holes.map((h, i) => `<th class="${cur(i)}">${h.n}</th>`).join('')}<th>Tot</th></tr>`;
    const par = `<tr class="par"><th>Par</th>${course.holes.map((h) => `<td>${h.par}</td>`).join('')}<td>${course.par}</td></tr>`;
    const rows = players.map((pl) => `<tr class="${pl.you ? 'you' : 'foe'}"><th>${esc(pl.you ? 'You' : pl.name)}</th>${course.holes.map((h, i) => {
      const n = pl.strokes[i];
      if (n == null) return `<td class="${cur(i)}"></td>`;
      const stp = stampFor(n, h.par, pl.picked[i]);
      return `<td class="st-${STAMP_CLASS[stp]}" title="${STAMP_WORD[stp]}">${n}</td>`;
    }).join('')}<td><b>${pl.strokes.some((x) => x != null) ? totalOf(pl) : ''}</b></td></tr>`).join('');
    scWrap.innerHTML = `<table class="putt-sc" aria-label="Scorecard">${head}${par}${rows}</table>`;
  };

  // ------------------------------------------------------------ the clock
  const clockRunning = () => phase === 'aim' && !paused && !swap && active().you && !!active().p && atRest(active().p!) && (clock >= clockFrom || !!drag);

  // ------------------------------------------------------------ cards
  const courseTiles = () => COURSES.map((c, i) => {
    const rec = courseRecord(s, c.id);
    const open = pickable(c, i);
    const why = !c.holes.length || (!c.ready && !opts.unlockAll) ? `🚧 Opening soon · ${c.holes.length}/10 holes` : !open ? `🔒 Finish ${esc(COURSES[i - 1].name)} to unlock` : rec ? `🏆 Best ${rec.best.toLocaleString('en-US')}` : 'Not played yet';
    return `<button class="putt-course${c === course ? ' on' : ''}${open ? '' : ' locked'}" data-course="${c.id}" ${open ? '' : 'aria-disabled="true"'} style="--cc:${c.theme.accent}">
      <span class="putt-cemoji" aria-hidden="true">${open ? c.emoji : '🔒'}</span>
      <span class="putt-cmain"><b>${esc(c.name)}</b><small>${why}</small></span>${stars(c.stars)}</button>`;
  }).join('');
  const intro = () => {
    phase = 'intro';
    paused = false;
    over.className = 'putt-over intro';
    over.innerHTML = `<div class="putt-card wide">
      <h3>Central Park Mini Golf</h3>
      <p class="putt-lede">Ten holes a round. Drag back anywhere, let go to putt.</p>
      <div class="putt-courses" role="list">${courseTiles()}</div>
      ${foe ? `<p class="putt-vsline">You vs <b>${esc(foe.name)}</b> <span class="putt-skill">${skillWord(foe.skill)}</span></p>` : ''}
      <div class="putt-btns putt-cta"><button class="btn primary" data-go>${course.emoji} Tee off · ${cash()}</button><button class="btn ghost" data-board>🏆 Board</button></div>
      <div class="putt-chips"><span>⛳ Par ${course.par}</span><span>⏱ Par time ${clockText(course.parTime)}</span></div>
      <p class="putt-rule">⏱ <b>Par strokes and par time = 1000.</b> Time counts 60%, strokes 40%. The clock only runs while you aim.</p>
    </div>`;
    over.hidden = false;
    applyTheme();
    hole = course.holes[0];
    st = newHoleState(hole);
    hi = 0;
    for (const pl of players) pl.p = null;
    camera();
    hud();
    scorecard();
  };
  const applyTheme = () => m.el.style.setProperty('--mg', course.theme.accent);

  const startRound = () => {
    if (!course.holes.length) return;
    // A round is a ticket, not a bet (not counted as casino money).
    const paid = changeMoney(s, -MINIGOLF_COST, '⛳ Mini golf');
    if (!paid.ok) return void toast('Not enough cash for a round.', { icon: '⛳', tone: 'bad' });
    sfx.coin();
    host.saved();
    for (const pl of players) {
      pl.strokes = [];
      pl.picked = [];
      pl.secs = [];
      pl.p = null;
    }
    order = players.map((_, i) => i);
    over.hidden = true;
    startHole(0);
  };

  const startHole = (i: number) => {
    // Keep the old picture to slide away.
    if (phase !== 'intro') {
      const snap = document.createElement('canvas');
      snap.width = cv.width;
      snap.height = cv.height;
      snap.getContext('2d')!.drawImage(cv, 0, 0);
      swap = { img: snap, k: 0 };
    }
    hi = i;
    hole = course.holes[i];
    st = newHoleState(hole);
    t = 0;
    acc = 0;
    npc = null;
    drag = null;
    aim.show = false;
    trail.length = 0;
    sinking.clear();
    flash.clear();
    holeSecs = 0;
    clockFrom = clock + BANNER_S + (swap ? SWAP_S : 0);
    for (const pl of players) pl.p = newPutter(hole);
    camera();
    banner.innerHTML = `<div class="putt-hole"><small>${course.emoji} Hole ${hole.n} of ${course.holes.length} · Par ${hole.par} · ⏱ ${hole.parTime}s</small><b>${hole.emoji} ${esc(hole.name)}</b><span>${esc(hole.tip)}</span></div>`;
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
    } else planNpc();
    hud();
  };
  /** The other player looks at the putt: plan for a tick a second or so from now. */
  const planNpc = () => {
    const pl = active();
    phase = 'npc';
    aim.show = true;
    aim.power = 0;
    const steps = Math.round((1.2 + Math.random() * 0.6) / STEP);
    const p = pl.p!;
    npc = { it: planSteps(hole, { x: p.ball.x, y: p.ball.y }, t, pl.skill, Math.random, st, steps * STEP), shot: null, steps: 0, fire: steps, a0: aim.angle };
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
    me().secs[hi] = holeSecs;
    scorecard();
    hud();
    const mine = results[0];
    const color = mine === 'ace' || mine === 'albatross' || mine === 'eagle' ? '#ffd23f' : mine === 'birdie' ? '#7bf0a1' : mine === 'par' ? '#ffffff' : '#ffb3b3';
    fx.stamp(STAMP_WORD[mine], color, 1.5);
    const cp = cupAt(hole, t);
    const c = toCss(cp.x, cp.y);
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
    // How long that one took you.
    const tp = toCss(cp.x, cp.y + 9);
    later(350, () => fx.pop(tp.x, tp.y, `⏱ ${clockText(holeSecs)}${holeSecs <= hole.parTime ? ' ✓' : ''}`, holeSecs <= hole.parTime ? '#7bf0a1' : '#ffd0a0', 15));
    if (foe) {
      const theirs = results[1];
      const fp = toCss(cp.x, cp.y + 15);
      later(700, () => fx.pop(fp.x, fp.y, `${foe.name}: ${STAMP_WORD[theirs].toLowerCase().replace('!', '')}`, '#ffd0e8', 15));
      const a = players[0].strokes[hi]!, b = players[1].strokes[hi]!;
      if (a !== b) order = a < b ? [0, 1] : [1, 0];
    }
    later(mine === 'ace' ? 2600 : 1900, () => (hi + 1 < course.holes.length ? startHole(hi + 1) : endRound()));
  };

  const endRound = () => {
    phase = 'end';
    swap = null;
    const you = me();
    const total = totalOf(you);
    const time = timeOf(you);
    const aces = you.strokes.filter((x) => x === 1).length;
    const ci = COURSES.indexOf(course);
    const nextWasLocked = ci + 1 < COURSES.length && !courseUnlocked(s, ci + 1);
    const r = finishMinigolf(s, { course: course.id, strokes: total, par: course.par, time, parTime: course.parTime, aces, versus: !!foe });
    const game = boardId(course.id);
    // Only a full ten-hole course goes on the 🏆 board (previews of unfinished ones don't).
    if (course.ready) {
      host.onScore?.(game, r.score);
      postScore(game, r.score);
    }
    host.saved();
    const next = COURSES[ci + 1];
    const unlocked = !!next && next.ready && nextWasLocked && courseUnlocked(s, ci + 1);
    const tp = toPar(total, course.par);
    let title = r.underPar ? 'Under par!' : total === course.par ? 'Even par' : 'Round done';
    let big = r.best ? '🏆' : course.emoji;
    let vsLine = '';
    if (foe) {
      const theirs = totalOf(players[1]);
      title = total < theirs ? 'You win!' : total > theirs ? `${esc(foe.name)} wins` : 'All square';
      big = total < theirs ? '🏆' : total > theirs ? '😤' : '🤝';
      vsLine = `<p class="putt-vsres"><span>You <b>${total}</b></span><span>${esc(foe.name)} <b>${theirs}</b></span></p>`;
    }
    const bests = COURSES.map((c, i) => {
      const rec = courseRecord(s, c.id);
      return `<span class="${c === course ? 'on' : ''}${pickable(c, i) ? '' : ' locked'}" title="${esc(c.name)}"><i aria-hidden="true">${c.emoji}</i>${rec ? rec.best.toLocaleString('en-US') : '—'}</span>`;
    }).join('');
    const canNext = next && pickable(next, ci + 1);
    over.className = 'putt-over end';
    over.innerHTML = `<div class="putt-card wide">
      <div class="putt-emoji" aria-hidden="true">${big}</div>
      <h3>${title}</h3>
      ${vsLine}
      <div class="putt-res">
        <span><small>⛳ Strokes</small><b>${total}</b><em class="${total < course.par ? 'under' : total > course.par ? 'overpar' : ''}">${tp}</em><i>par ${course.par}</i></span>
        <span><small>⏱ Time</small><b>${clockText(time)}</b><em class="${time < course.parTime ? 'under' : time > course.parTime ? 'overpar' : ''}">${time <= course.parTime ? '−' : '+'}${clockText(Math.abs(time - course.parTime))}</em><i>par ${clockText(course.parTime)}</i></span>
      </div>
      <div class="putt-break" aria-label="Score breakdown"><span>Strokes <b>${r.strokePart}</b></span><span>+</span><span>Time <b>${r.timePart}</b></span><span>=</span><span class="tot">🏆 <b>${r.score.toLocaleString('en-US')}</b></span></div>
      <div class="putt-chips">${r.best ? '<span>✨ New best</span>' : `<span>Best ${(courseRecord(s, course.id)?.best ?? r.score).toLocaleString('en-US')}</span>`}${aces ? `<span>⛳ ${aces} hole${aces > 1 ? 's' : ''} in one</span>` : ''}</div>
      ${unlocked ? `<p class="putt-mood">${next.emoji} <b>${esc(next.name)}</b> is open!</p>` : r.underPar ? '<p class="putt-mood">⛳ Under par in the park. You’re in a good mood.</p>' : ''}
      <div class="putt-bests" aria-label="Best score per course">${bests}</div>
      <div class="putt-btns"><button class="btn primary" data-go>🔁 Again · ${cash()}</button>${canNext ? `<button class="btn primary alt" data-next="${next.id}">${next.emoji} Next · ${cash()}</button>` : '<button class="btn ghost" data-board>🏆 Board</button>'}</div>
      <div class="putt-btns">${canNext ? '<button class="btn ghost" data-board>🏆 Board</button>' : '<button class="btn ghost" data-pick>🗺️ Courses</button>'}<button class="btn ghost" data-close>Done</button></div>
    </div>`;
    over.hidden = false;
    hud();
    scorecard();
    if (r.best || r.underPar || unlocked) rain(m.el, unlocked ? next.emoji : r.underPar ? '⛳' : '🏆', 16);
    (foe ? total < totalOf(players[1]) : r.underPar || r.best) ? sfx.win() : sfx.chime();
  };

  // ------------------------------------------------------------ pause
  const pause = () => {
    if (paused || phase === 'intro' || phase === 'end') return;
    paused = true;
    drag = null;
    aim.show = active().you ? false : aim.show;
    sfx.tap();
    over.className = 'putt-over pause';
    over.innerHTML = `<div class="putt-card">
      <div class="putt-emoji" aria-hidden="true">⏸</div>
      <h3>Paused</h3>
      <p>Hole ${hole.n} of ${course.holes.length} on ${esc(course.name)}. The clock is stopped.</p>
      <button class="btn primary block" data-resume>▶️ Resume</button>
      <button class="btn ghost block" data-leave>🚪 Leave the round</button>
      <p class="putt-small">Leaving ends the round: no score, and the ${cash()} ticket is spent.</p>
    </div>`;
    over.hidden = false;
    hud();
  };
  const resume = () => {
    paused = false;
    over.hidden = true;
    sfx.tap();
    last = performance.now();
    hud();
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
        case 'bumper':
          flash.set(`b${e.i}`, clock);
          sfx.note(520 + Math.random() * 300);
          fx.shake(3, 0.12);
          fx.burst(c.x, c.y, { n: 8, colors: ['#ff4fa3', '#ffd23f', '#ffffff'], speed: 120, gravity: 0, life: 0.3, size: 3 });
          break;
        case 'spring':
          flash.set(`s${e.i}`, clock);
          sfx.note(330 + Math.random() * 120);
          fx.burst(c.x, c.y, { n: 6, colors: ['#ffd23f', '#ffffff'], speed: 110, gravity: 0, life: 0.25, size: 3 });
          break;
        case 'cab':
          sfx.honk();
          fx.shake(5, 0.2);
          fx.pop(c.x, c.y - 10, 'HONK!', '#ffd23f', 18);
          buzz(20);
          break;
        case 'thud':
          if (clock - lastTick > 0.08) (lastTick = clock), sfx.step(true);
          fx.shake(2, 0.1);
          break;
        case 'flip':
          sfx.punch();
          flash.set(`a${e.i}`, clock);
          fx.shake(4, 0.12);
          buzz(16);
          break;
        case 'gate':
          if (clock - lastTick > 0.08) (lastTick = clock), sfx.clink();
          break;
        case 'spin':
          if (clock - lastTick > 0.08) (lastTick = clock), sfx.clink();
          break;
        case 'sand':
          sfx.card();
          fx.burst(c.x, c.y, { n: 8, colors: ['#f3d58a', '#e0b860'], speed: 60, gravity: 0, life: 0.35, size: 3 });
          break;
        case 'water':
          sfx.bad();
          fx.burst(c.x, c.y, { n: 14, colors: ['#8fd3ff', '#ffffff', '#39a7ff'], speed: 120, life: 0.5, size: 3, up: true });
          fx.pop(c.x, c.y - 6, '+1 💦', '#8fd3ff', 20);
          break;
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
        case 'portal': {
          sfx.whoosh();
          const col = PORTAL_COLORS[(e.i ?? 0) % PORTAL_COLORS.length];
          fx.burst(c.x, c.y, { n: 10, colors: [...col, '#ffffff'], speed: 90, gravity: 0, life: 0.35, size: 3 });
          later(30, () => {
            const p = pl.p!;
            const o = toCss(p.ball.x, p.ball.y);
            fx.burst(o.x, o.y, { n: 10, colors: [...col, '#ffffff'], speed: 90, gravity: 0, life: 0.35, size: 3 });
          });
          break;
        }
        case 'switch': {
          sfx.clink();
          buzz(12);
          const sw = hole.switches.find((x) => Math.hypot(x.x - e.x, x.y - e.y) < 0.1);
          fx.pop(c.x, c.y - 10, sw && st.sw[sw.id] ? '🔘 ON' : '🔘 OFF', sw && st.sw[sw.id] ? '#7bf0a1' : '#ffb3b3', 15);
          break;
        }
        case 'crack':
          sfx.step(true);
          flash.set(`c${e.i}`, clock);
          fx.burst(c.x, c.y, { n: 8, colors: ['#b0a08a', '#7d6f5e', '#ffffff'], speed: 80, life: 0.4, size: 3 });
          fx.shake(3, 0.15);
          break;
        case 'break':
          sfx.boom();
          fx.burst(c.x, c.y, { n: 22, colors: ['#b0a08a', '#7d6f5e', '#ffd23f'], speed: 160, life: 0.6, size: 4 });
          fx.shake(7, 0.3);
          fx.pop(c.x, c.y - 10, 'CRASH!', '#ffd23f', 18);
          buzz([20, 30, 20]);
          break;
        case 'jump':
          sfx.whoosh();
          fx.pop(c.x, c.y - 8, 'Air!', '#ffffff', 15);
          break;
        case 'land':
          sfx.step(true);
          fx.burst(c.x, c.y, { n: 6, colors: ['#ffffff', '#c9f7dc'], speed: 60, gravity: 0, life: 0.25, size: 2.5 });
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
          fx.pop(c.x, c.y - 8, `${maxStrokes(hole)} strokes. Picked up.`, '#ffb3b3', 15);
          break;
        default:
          break;
      }
    }
  };

  // ------------------------------------------------------------ input
  const cssPoint = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cssW, y: ((e.clientY - r.top) / r.height) * cssH };
  };
  const canPutt = () => phase === 'aim' && !paused && !swap && active().you && !!active().p && atRest(active().p!);
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
    clockFrom = Math.min(clockFrom, clock); // touching starts the clock (and you can putt through the banner)
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

  const shoot = (i: number, shot: Shot): boolean => {
    const p = players[i].p!;
    if (!putt(p, shot)) return false;
    phase = 'roll';
    aim.show = false;
    sfx.tap();
    if (shot.power > 0.7) sfx.punch();
    buzz(10);
    hud();
    return true;
  };

  // ------------------------------------------------------------ loop
  const update = (dt: number) => {
    clock += dt;
    for (const [k, v] of sinking) sinking.set(k, v + dt);
    for (let i = trail.length - 1; i >= 0; i--) if ((trail[i].life -= dt) <= 0) trail.splice(i, 1);
    if (swap && (swap.k += dt / SWAP_S) >= 1) swap = null;
    if (phase === 'intro' || phase === 'end' || paused) return;
    if (clockRunning()) holeSecs += dt;
    // Their putt: think a slice per frame, swing the aim round, fire on the planned tick.
    if (phase === 'npc' && npc) {
      const t0 = performance.now();
      while (!npc.shot && performance.now() - t0 < 9) {
        const r = npc.it.next();
        if (r.done) {
          npc.shot = r.value;
          npc.fire += Math.round(r.value.wait / STEP);
        }
      }
      const k = clamp(npc.steps / Math.max(1, npc.fire), 0, 1);
      const b = active().p!.ball;
      const want = npc.shot ?? { angle: Math.atan2(hole.cup.y - b.y, hole.cup.x - b.x), power: 0.2 };
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
      if (phase === 'npc' && npc) {
        if (npc.steps >= npc.fire) {
          if (!npc.shot) {
            for (;;) {
              const r = npc.it.next();
              if (r.done) {
                npc.shot = r.value;
                npc.fire += Math.round(r.value.wait / STEP);
                break;
              }
            }
          }
          if (npc.steps >= npc.fire) {
            const shot = npc.shot!;
            npc = null;
            if (!shoot(turn, shot)) later(300, () => phase === 'npc' && !npc && planNpc()); // knocked about meanwhile: look again
          }
        }
        if (npc) npc.steps++;
      }
      players.forEach((pl, i) => {
        const p = pl.p;
        if (!p || p.done) return;
        const ev = advance(hole, p, t, STEP, st);
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
    hudTime();
    if (me().p) {
      const n2 = myStrokes();
      if (q('[data-strokes]').textContent !== String(n2)) hud();
    }
  };

  const draw = () => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);
    const dt = fx.begin(g);
    // The camera's move to the next hole: the new hole rises in as the old one lifts away.
    const k = swap ? ease(swap.k) : 1;
    const lift = (1 - k) * cssH * 0.35;
    if (artCv) g.drawImage(artCv, 0, 0, cssW, cssH);
    drawSky(g, course.theme, cssW, cssH, clock);
    g.save();
    if (swap) {
      g.globalAlpha = k;
      g.translate(0, lift);
    }
    if (courseCv) g.drawImage(courseCv, 0, 0, cssW, cssH);
    g.transform(S, 0, 0, S, ox, oy);
    drawLive(g, hole, st, t, clock, flash);
    for (const d of trail) {
      g.globalAlpha = (d.life / 0.25) * 0.35 * k;
      g.fillStyle = d.c;
      g.beginPath();
      g.arc(d.x, d.y, BALL_R * 0.7, 0, TAU);
      g.fill();
    }
    g.globalAlpha = swap ? k : 1;
    const idx = players.map((_, i) => i).sort((a, b) => (a === turn ? 1 : 0) - (b === turn ? 1 : 0));
    const cp = cupAt(hole, t);
    for (const i of idx) {
      const pl = players[i];
      const p = pl.p;
      if (!p || phase === 'intro') continue;
      const sk = sinking.get(i);
      if (p.done && p.sunk && (sk === undefined || sk > 0.3)) continue;
      if (p.done && !p.sunk) continue;
      const kk = sk === undefined ? 1 : 1 - sk / 0.3;
      const x = sk === undefined ? p.ball.x : cp.x, y = sk === undefined ? p.ball.y : cp.y;
      drawBall(g, x, y, BALL_R * kk, pl.color, foe ? (i === turn ? 1 : 0.7) : 1, p.ball.z ?? 0);
    }
    const pl = active();
    if (pl?.p && (phase === 'aim' || phase === 'npc') && atRest(pl.p) && !paused) {
      const b = pl.p.ball;
      if (phase === 'aim' && !aim.show) {
        const kp = (clock * 1.4) % 1;
        g.strokeStyle = `rgba(255,255,255,${0.6 * (1 - kp)})`;
        g.lineWidth = 0.5;
        g.beginPath();
        g.arc(b.x, b.y, BALL_R + 1 + kp * 3.5, 0, TAU);
        g.stroke();
      }
      if (aim.show) drawAim(g, b.x, b.y, aim.angle, aim.power, pl.color);
    }
    g.restore();
    if (swap) {
      g.save();
      g.globalAlpha = 1 - k;
      g.drawImage(swap.img, 0, -k * cssH * 0.5, cssW, cssH);
      g.restore();
    }
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

  // ------------------------------------------------------------ the board
  const showBoard = (btn: HTMLElement) => {
    btn.setAttribute('disabled', '');
    const game = boardId(course.id);
    const c = course;
    void fetchBoard(s, game).then((b) => {
      if (dead) return;
      const board = b.online ? b : golfLocalBoard(c, courseRecord(s, c.id)?.best ?? 0);
      const box = document.createElement('div');
      box.className = 'putt-board';
      box.innerHTML = boardHtml(game, board).replace(/<h3>.*?<\/h3>/, `<h3>🏆 ${c.emoji} ${esc(c.name)}</h3>`);
      // Your own row: the strokes and time behind the score.
      const rec = courseRecord(s, c.id);
      if (rec) for (const el of box.querySelectorAll('.lb-row.you .lb-name')) el.innerHTML = `You <small class="putt-lbme">⛳ ${rec.strokes} · ⏱ ${clockText(rec.time)}</small>`;
      over.querySelector('.putt-card')?.appendChild(box);
      box.scrollIntoView({ block: 'nearest' });
    });
  };

  // ------------------------------------------------------------ clicks
  const close = () => {
    dead = true;
    cancelAnimationFrame(raf);
    timers.forEach((x) => window.clearTimeout(x));
    timers = [];
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    sfx.close();
    host.saved();
    m.close();
  };
  m.el.addEventListener('click', (e) => {
    const tg = e.target as HTMLElement;
    if (tg.closest('[data-close]')) {
      // Mid-round, ✕ pauses first (leaving there ends the round).
      if (phase !== 'intro' && phase !== 'end' && !paused) return pause();
      return close();
    }
    if (tg.closest('[data-pause]')) return paused ? resume() : pause();
    if (tg.closest('[data-resume]')) return resume();
    if (tg.closest('[data-leave]')) {
      sfx.tap();
      timers.forEach((x) => window.clearTimeout(x));
      timers = [];
      swap = null;
      return intro();
    }
    if (tg.closest('[data-pick]')) {
      sfx.tap();
      return intro();
    }
    const tile = tg.closest<HTMLElement>('[data-course]');
    if (tile) {
      const i = COURSES.findIndex((c) => c.id === tile.dataset.course);
      if (i < 0 || !pickable(COURSES[i], i)) {
        sfx.bad();
        const why = tile.querySelector('small')?.textContent ?? 'Locked';
        return void toast(why, { icon: COURSES[i]?.emoji ?? '⛳', ms: 1800 });
      }
      sfx.tap();
      course = COURSES[i];
      return intro();
    }
    const nx = tg.closest<HTMLElement>('[data-next]');
    if (nx) {
      const c = COURSES.find((x) => x.id === nx.dataset.next);
      if (c) {
        course = c;
        applyTheme();
        sfx.tap();
        return startRound();
      }
    }
    if (tg.closest('[data-go]')) {
      sfx.tap();
      return startRound();
    }
    const bb = tg.closest<HTMLElement>('[data-board]');
    if (bb) showBoard(bb);
  });

  // Smoke-test hook (read-only view of the round; harmless in play).
  Object.defineProperty(cv, '__mg', {
    value: {
      state: () => ({
        phase, paused, course: course.id, hole: hole.n, holeId: hole.id, t, you: turn === 0, ball: me().p ? { ...me().p!.ball } : null,
        strokes: players.map((pl) => [...pl.strokes]), secs: [...me().secs], holeSecs, clockRunning: clockRunning(), sw: { ...st.sw }, cracks: [...st.cracks],
      }),
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

/** Offline: you against the course's regulars (scores near the 1000 mark, steady for a week). */
const GOLF_REGULARS = ['Putt Daddy', 'Nana Rosa', 'Bodega Cat', 'Tiny Tim from 8th Ave', 'QueenOfQueens', 'Coach K', 'Shanice B.', 'Lil Subway', 'The Mayor (fake)'];
function golfLocalBoard(c: Course, mine: number, now = Date.now()): Board {
  const week = Math.floor(now / (7 * 86_400_000));
  const r = seeded(week * 7 + Number(c.id.slice(1)));
  const rows = GOLF_REGULARS.map((name) => ({ name, score: Math.round(1000 * (0.55 + r() * 0.85)), you: false }));
  if (mine > 0) rows.push({ name: 'You', score: mine, you: true });
  rows.sort((a, b) => b.score - a.score);
  const place = rows.findIndex((x) => x.you);
  return { online: false, rows: rows.slice(0, 10), you: place >= 0 ? { place: place + 1, score: mine } : null };
}

// ===================================================================== drawing

function poly(g: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}
function zonePath(g: CanvasRenderingContext2D, z: Zone): void {
  if (z.circle) {
    g.beginPath();
    g.arc(z.circle.x, z.circle.y, z.circle.r, 0, TAU);
  } else if (z.poly) poly(g, z.poly);
}
const bounds = (pts: readonly Pt[]) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
const rng = seeded;

/** The world round the holes, per course (screen space, drawn once per hole). */
function drawArt(th: CourseTheme, h: Hole, w: number, hh: number, dpr: number, ox: number, oy: number, S: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(hh * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = g.createLinearGradient(0, 0, 0, hh);
  sky.addColorStop(0, th.bg[0]);
  sky.addColorStop(1, th.bg[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hh);
  const r = rng(h.n * 97 + h.id.length);
  const dots = (n: number, col: string, size = 1.5) => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) g.fillRect(r() * w, r() * hh, size, size);
  };
  switch (th.art) {
    case 'park': {
      dots(300, 'rgba(255,255,255,0.05)');
      // Tree crowns round the edges.
      for (let i = 0; i < 26; i++) {
        const x = r() * w, y = r() * hh, rad = 10 + r() * 18;
        g.fillStyle = 'rgba(10,40,20,0.35)';
        g.beginPath();
        g.arc(x + 3, y + 4, rad, 0, TAU);
        g.fill();
        g.fillStyle = i % 3 ? '#2c7a43' : '#358f50';
        g.beginPath();
        g.arc(x, y, rad, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.beginPath();
        g.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.5, 0, TAU);
        g.fill();
      }
      break;
    }
    case 'midtown': {
      dots(200, 'rgba(255,255,255,0.05)');
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 14;
      const step = Math.max(80, S * 26);
      for (let x = (ox % step) - step; x < w; x += step) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, hh), g.stroke());
      for (let y = (oy % step) - step; y < hh; y += step) (g.beginPath(), g.moveTo(0, y), g.lineTo(w, y), g.stroke());
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let x = (ox % step) - step; x < w; x += step) for (let y = (oy % step) - step; y < hh; y += step) for (let k = -6; k <= 6; k += 3) g.fillRect(x + 9, y + k - 0.75, 8, 1.5);
      for (let i = 0; i < 10; i++) {
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(r() * w, r() * hh, 14 + r() * 20, 10 + r() * 14);
      }
      break;
    }
    case 'subway': {
      // White tiles in the dark, and the tracks.
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 1;
      for (let y = 0; y < hh; y += 8) for (let x = (y / 8) % 2 ? 0 : -8; x < w; x += 16) g.strokeRect(x, y, 16, 8);
      for (const ty of [hh * 0.18, hh * 0.86]) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, ty - 10, w, 20);
        g.fillStyle = '#5b4636';
        for (let x = 0; x < w; x += 9) g.fillRect(x, ty - 9, 4, 18);
        g.fillStyle = '#9aa3b5';
        g.fillRect(0, ty - 6, w, 2);
        g.fillRect(0, ty + 4, w, 2);
      }
      break;
    }
    case 'bridges': {
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 1;
      for (let y = 6; y < hh; y += 14) for (let x = (y % 28) * 0.7; x < w; x += 26) (g.beginPath(), g.arc(x, y, 6, Math.PI * 1.15, Math.PI * 1.85), g.stroke());
      g.strokeStyle = 'rgba(220,230,255,0.25)';
      g.lineWidth = 2;
      for (let i = -3; i < 8; i++) (g.beginPath(), g.moveTo(i * 60, 0), g.quadraticCurveTo(i * 60 + 120, hh * 0.5, i * 60 + 40, hh), g.stroke());
      break;
    }
    case 'construction': {
      dots(400, 'rgba(0,0,0,0.12)', 2);
      dots(200, 'rgba(255,255,255,0.05)', 2);
      g.strokeStyle = 'rgba(242,140,40,0.35)';
      g.lineWidth = 3;
      const step = 60;
      for (let x = (ox % step) - step; x < w; x += step) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, hh), g.stroke());
      for (let y = (oy % step) - step; y < hh; y += step) (g.beginPath(), g.moveTo(0, y), g.lineTo(w, y), g.stroke());
      // Hazard tape top and bottom.
      for (const y of [0, hh - 8]) for (let x = -10; x < w + 10; x += 16) {
        g.fillStyle = '#ffd23f';
        g.fillRect(x, y, 8, 8);
        g.fillStyle = '#1c1c1c';
        g.fillRect(x + 8, y, 8, 8);
      }
      break;
    }
    case 'night': {
      dots(140, 'rgba(255,255,255,0.6)', 1.2);
      dots(40, 'rgba(255,240,200,0.8)', 1.8);
      // Skyline along the bottom with lit windows.
      let x = -10;
      while (x < w) {
        const bw = 18 + r() * 30, bh = 40 + r() * hh * 0.22;
        g.fillStyle = '#0c0f22';
        g.fillRect(x, hh - bh, bw, bh);
        g.fillStyle = 'rgba(255,214,120,0.55)';
        for (let yy = hh - bh + 5; yy < hh - 4; yy += 7) for (let xx = x + 3; xx < x + bw - 3; xx += 6) if (r() < 0.35) g.fillRect(xx, yy, 2.5, 3);
        x += bw + 2;
      }
      break;
    }
    case 'liberty': {
      g.strokeStyle = 'rgba(255,255,255,0.13)';
      g.lineWidth = 1;
      for (let y = 6; y < hh; y += 12) for (let xx = (y % 24) * 0.8; xx < w; xx += 22) (g.beginPath(), g.arc(xx, y, 5, Math.PI * 1.15, Math.PI * 1.85), g.stroke());
      g.globalAlpha = 0.18;
      g.font = `${Math.round(hh * 0.3)}px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText('🗽', w * 0.82, hh);
      g.globalAlpha = 1;
      break;
    }
  }
  return c;
}

/** Things in the sky that move (behind the course): searchlights at night. */
function drawSky(g: CanvasRenderingContext2D, th: CourseTheme, w: number, hh: number, clock: number): void {
  if (th.art !== 'night') return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const bx = w * (0.15 + i * 0.35), by = hh + 10;
    const a = -Math.PI / 2 + Math.sin(clock * (0.25 + i * 0.07) + i * 2) * 0.55;
    const grd = g.createLinearGradient(bx, by, bx + Math.cos(a) * hh, by + Math.sin(a) * hh);
    grd.addColorStop(0, 'rgba(255,245,200,0.22)');
    grd.addColorStop(1, 'rgba(255,245,200,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + Math.cos(a - 0.07) * hh * 1.3, by + Math.sin(a - 0.07) * hh * 1.3);
    g.lineTo(bx + Math.cos(a + 0.07) * hh * 1.3, by + Math.sin(a + 0.07) * hh * 1.3);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** Everything on the hole that doesn't move, drawn once per hole (and on resize). */
function drawCourse(h: Hole, th: CourseTheme, w: number, hh: number, dpr: number, S: number, ox: number, oy: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(hh * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr * S, 0, 0, dpr * S, dpr * ox, dpr * oy);
  const [bx0, by0, bx1, by1] = holeBox(h);
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
  g.fillStyle = th.turf;
  g.fillRect(bx0 - 2, by0 - 2, bx1 - bx0 + 4, by1 - by0 + 4);
  g.fillStyle = th.stripe;
  for (let y = by0 - 2; y < by1 + 2; y += 12) g.fillRect(bx0 - 2, y, bx1 - bx0 + 4, 6);
  const W = bx1 - bx0 + 20, H = by1 - by0 + 20;
  // Surfaces.
  for (const z of h.zones) {
    if (z.kind === 'street' || z.kind === 'track') {
      zonePath(g, z);
      g.fillStyle = z.kind === 'street' ? '#4a5063' : '#3b3530';
      g.fill();
      const b = z.poly ? bounds(z.poly) : { x0: 0, y0: 0, x1: W, y1: H };
      if (z.kind === 'street') {
        g.fillStyle = '#ffd23f';
        for (let x = b.x0 + 2; x < b.x1; x += 7) g.fillRect(x, (b.y0 + b.y1) / 2 - 0.3, 3.5, 0.6);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        for (let x = b.x0 + 1; x < b.x1; x += 4) (g.fillRect(x, b.y0 + 0.6, 2, 1.6), g.fillRect(x, b.y1 - 2.2, 2, 1.6));
      } else {
        // Sleepers and rails.
        g.fillStyle = '#6b5440';
        for (let x = b.x0 + 1; x < b.x1; x += 3) g.fillRect(x, b.y0 + 1, 1.4, b.y1 - b.y0 - 2);
        g.fillStyle = '#b8c0cf';
        g.fillRect(b.x0, b.y0 + (b.y1 - b.y0) * 0.3 - 0.3, b.x1 - b.x0, 0.6);
        g.fillRect(b.x0, b.y0 + (b.y1 - b.y0) * 0.7 - 0.3, b.x1 - b.x0, 0.6);
      }
    } else if (z.kind === 'path') {
      zonePath(g, z);
      g.fillStyle = 'rgba(214,196,160,0.55)';
      g.fill();
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
      for (let i = 0; i < 90; i++) g.fillRect(bx0 + rr() * W, by0 + rr() * H, 0.4, 0.4);
      g.restore();
    } else if (z.kind === 'ice') {
      zonePath(g, z);
      g.fillStyle = '#d9f2ff';
      g.fill();
      g.save();
      zonePath(g, z);
      g.clip();
      g.strokeStyle = 'rgba(120,180,220,0.5)';
      g.lineWidth = 0.3;
      const rr = rng(31);
      for (let i = 0; i < 22; i++) {
        const x = bx0 + rr() * W, y = by0 + rr() * H;
        g.beginPath();
        g.arc(x, y, 3 + rr() * 6, rr() * TAU, rr() * TAU + 1.6);
        g.stroke();
      }
      g.restore();
      zonePath(g, z);
      g.lineWidth = 0.6;
      g.strokeStyle = '#8fc9ec';
      g.stroke();
    } else if (z.kind === 'water') {
      zonePath(g, z);
      g.fillStyle = '#2f9bf0';
      g.fill();
      g.save();
      zonePath(g, z);
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 0.5;
      for (let y = by0; y < by1; y += 4) for (let x = bx0 + (y % 8) * 0.8; x < bx1; x += 7) {
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
      const ys = z.poly!.map((p) => p[1]);
      const grd = g.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
      const upward = (z.push?.[1] ?? 0) > 0;
      grd.addColorStop(0, upward ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)');
      grd.addColorStop(1, upward ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)');
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
  // Belts (the moving chevrons are live).
  for (const cvy of h.conveyors) {
    poly(g, cvy.poly);
    g.fillStyle = '#3d4152';
    g.fill();
    g.lineWidth = 0.5;
    g.strokeStyle = '#1c2340';
    g.stroke();
  }
  // Wind zones: a faint sky-blue wash.
  for (const wd of h.winds) {
    poly(g, wd.poly);
    g.fillStyle = 'rgba(200,235,255,0.12)';
    g.fill();
    g.setLineDash([1.2, 1.2]);
    g.lineWidth = 0.35;
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.stroke();
    g.setLineDash([]);
  }
  // Tide flats: wet sand where the water comes and goes.
  for (const td of h.tides) {
    g.fillStyle = '#c8b78a';
    g.fillRect(td.x0, td.y0, td.x1 - td.x0, td.y1 - td.y0);
    g.strokeStyle = 'rgba(80,60,30,0.35)';
    g.lineWidth = 0.3;
    for (let y = td.y0 + 2; y < td.y1; y += 3) (g.beginPath(), g.moveTo(td.x0, y), g.lineTo(td.x1, y), g.stroke());
  }
  // The track a sliding cup runs in.
  if (h.cupTrack) {
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = CUP_R * 2 + 1;
    g.beginPath();
    g.moveTo(h.cup.x, h.cup.y);
    g.lineTo(h.cupTrack.x, h.cupTrack.y);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 0.4;
    g.stroke();
    g.lineCap = 'butt';
  }
  // Jump ramps: a wedge with stripes, the lip bright.
  for (const j of h.jumps) {
    g.save();
    g.translate(j.x, j.y);
    g.rotate(j.dir);
    const grd = g.createLinearGradient(-j.len, 0, 0, 0);
    grd.addColorStop(0, '#9a6b42');
    grd.addColorStop(1, '#e0a96b');
    g.fillStyle = grd;
    g.fillRect(-j.len, -j.w / 2, j.len, j.w);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    for (let x = -j.len + 1; x < 0; x += 2.5) g.fillRect(x, -j.w / 2, 0.8, j.w);
    g.fillStyle = '#ffd23f';
    g.fillRect(-0.8, -j.w / 2, 0.8, j.w);
    g.strokeStyle = '#1c2340';
    g.lineWidth = 0.4;
    g.strokeRect(-j.len, -j.w / 2, j.len, j.w);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(-j.len * 0.25, 0);
    g.lineTo(-j.len * 0.65, -j.w * 0.22);
    g.lineTo(-j.len * 0.65, j.w * 0.22);
    g.closePath();
    g.fill();
    g.restore();
  }
  // Decorations painted on the turf.
  for (const d of h.deco) {
    if (d.x < bx0 || d.x > bx1 || d.y < by0 || d.y > by1) continue;
    drawDeco(g, d, 0.55);
  }
  g.restore();
  // Decorations off the turf (trees, signs).
  for (const d of h.deco) if (d.x < bx0 || d.x > bx1 || d.y < by0 || d.y > by1) drawDeco(g, d, 1);
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
    for (let k = -gr.r; k <= gr.r; k += 1.1) (g.beginPath(), g.moveTo(gr.x + k, gr.y - gr.r), g.lineTo(gr.x + k, gr.y + gr.r), g.stroke());
    g.restore();
    g.strokeStyle = '#1c2340';
    g.lineWidth = 0.6;
    g.beginPath();
    g.arc(gr.x, gr.y, gr.r, 0, TAU);
    g.stroke();
    g.fillStyle = '#5b6274';
    g.beginPath();
    g.arc(gr.to.x, gr.to.y, 3, 0, TAU);
    g.fill();
    g.strokeStyle = '#1c2340';
    g.stroke();
    arrow(g, gr.to.x, gr.to.y, gr.dir, '#ffd23f', 1);
  }
  // A fixed cup (a sliding one is live).
  if (!h.cupTrack) drawCup(g, h.cup.x, h.cup.y);
  // Low walls: clipped hedges / curbs.
  for (const lw of h.low) {
    g.save();
    g.translate(0.3, 0.6);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    poly(g, lw);
    g.fill();
    g.restore();
    poly(g, lw);
    g.fillStyle = th.art === 'park' ? '#2f7d3f' : '#9aa3b5';
    g.fill();
    g.lineWidth = 0.4;
    g.strokeStyle = '#1c2340';
    g.stroke();
    if (th.art === 'park') {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      const b = bounds(lw);
      for (let x = b.x0 + 0.8; x < b.x1; x += 1.6) for (let y = b.y0 + 0.5; y < b.y1; y += 1.4) g.fillRect(x, y, 0.5, 0.5);
    }
  }
  // Blocks.
  const fill = h.look?.block ?? th.block;
  for (const b of h.blocks) {
    g.save();
    g.translate(0.5, 1);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    poly(g, b);
    g.fill();
    g.restore();
    poly(g, b);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 0.7;
    g.strokeStyle = th.ink;
    g.stroke();
    g.save();
    poly(g, b);
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    g.lineWidth = 0.25;
    const bb = bounds(b);
    for (let y = bb.y0 + 1.6; y < bb.y1; y += 1.6) (g.beginPath(), g.moveTo(bb.x0, y), g.lineTo(bb.x1, y), g.stroke());
    g.restore();
    const label = h.look?.label;
    if (label) {
      const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
      if (bw > 10 && bh > 3.5) {
        const isEmoji = !/[A-Z]/.test(label);
        g.font = isEmoji ? `${Math.min(bh * 0.8, 6)}px ${EMOJI_FONT}` : `900 ${Math.min(bh * 0.55, 3.6)}px ${DISPLAY}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#fff';
        g.fillText(label, cx, cy + 0.2);
      }
    }
  }
  // Springs: yellow and black rails.
  for (const sp of h.springs) {
    g.lineCap = 'round';
    g.strokeStyle = '#1c2340';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(sp.a.x, sp.a.y);
    g.lineTo(sp.b.x, sp.b.y);
    g.stroke();
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 1;
    g.setLineDash([1, 1]);
    g.stroke();
    g.setLineDash([]);
    g.lineCap = 'butt';
  }
  // One-way gates: a dashed line and chevrons the way you may go.
  for (const o of h.oneways) {
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 0.5;
    g.setLineDash([1, 0.8]);
    g.beginPath();
    g.moveTo(o.a.x, o.a.y);
    g.lineTo(o.b.x, o.b.y);
    g.stroke();
    g.setLineDash([]);
    const L = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y);
    for (let k = 2; k < L - 1; k += 3.5) {
      const x = o.a.x + ((o.b.x - o.a.x) * k) / L, y = o.a.y + ((o.b.y - o.a.y) * k) / L;
      arrow(g, x, y, o.dir, '#7bf0a1', 0.8);
    }
  }
  // The rail: a chunky rail with an ink outline.
  poly(g, h.outer);
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = th.ink;
  g.stroke();
  g.lineWidth = 1.9;
  g.strokeStyle = th.rail;
  g.stroke();
  return c;
}

function drawDeco(g: CanvasRenderingContext2D, d: Hole['deco'][number], alpha: number): void {
  g.save();
  g.globalAlpha = alpha;
  g.translate(d.x, d.y);
  if (d.rot) g.rotate(d.rot);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (d.emoji) {
    g.font = `${d.size ?? 5}px ${EMOJI_FONT}`;
    g.fillText(d.emoji, 0, 0);
  } else if (d.text) {
    g.font = `900 ${d.size ?? 3}px ${DISPLAY}`;
    g.fillStyle = d.color ?? '#ffffff';
    g.fillText(d.text, 0, 0);
  }
  g.restore();
}

function arrow(g: CanvasRenderingContext2D, x: number, y: number, a: number, col: string, s = 1): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.scale(s, s);
  g.fillStyle = col;
  g.strokeStyle = '#1c2340';
  g.lineWidth = 0.3;
  g.beginPath();
  g.moveTo(1.6, 0);
  g.lineTo(-1, -1.4);
  g.lineTo(-0.3, 0);
  g.lineTo(-1, 1.4);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function drawCup(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = '#10131f';
  g.beginPath();
  g.arc(x, y, CUP_R, 0, TAU);
  g.fill();
  g.strokeStyle = '#e9edf7';
  g.lineWidth = 0.45;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.arc(x + 0.4, y + 0.5, CUP_R * 0.6, 0, TAU);
  g.fill();
}

/** A little round badge with a switch letter, so you can see what a button drives. */
function swBadge(g: CanvasRenderingContext2D, h: Hole, id: string, x: number, y: number, on: boolean): void {
  const i = Math.max(0, h.switches.findIndex((s) => s.id === id));
  g.fillStyle = SW_COLORS[i % SW_COLORS.length];
  g.strokeStyle = '#1c2340';
  g.lineWidth = 0.3;
  g.beginPath();
  g.arc(x, y, 1.5, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = '#1c2340';
  g.font = `900 1.9px ${DISPLAY}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(id.slice(0, 1), x, y + 0.1);
  if (!on) {
    g.strokeStyle = 'rgba(28,35,64,0.8)';
    g.lineWidth = 0.35;
    g.beginPath();
    g.moveTo(x - 1.2, y + 1.2);
    g.lineTo(x + 1.2, y - 1.2);
    g.stroke();
  }
}

/** The countdown light on a gate: green (open), amber (shutting soon), red (shut), with a ring for the time left. */
function drawGateLight(g: CanvasRenderingContext2D, x: number, y: number, state: 'go' | 'soon' | 'stop' | 'off', frac: number): void {
  g.fillStyle = '#1c2340';
  g.beginPath();
  g.arc(x, y, 2, 0, TAU);
  g.fill();
  g.fillStyle = state === 'go' ? '#3be07a' : state === 'soon' ? '#ffb000' : state === 'stop' ? '#ff4b4b' : '#555c70';
  g.beginPath();
  g.arc(x, y, 1.25, 0, TAU);
  g.fill();
  if (state !== 'off' && frac >= 0) {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 0.4;
    g.beginPath();
    g.arc(x, y, 1.7, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1));
    g.stroke();
  }
}

/** Is a loop vehicle's box over the course right now? */
const onCourse = (c: Hole['cabs'][number], t: number, box: [number, number, number, number]) => {
  const p = cabAt(c, t);
  return p.x + c.w / 2 > box[0] && p.x - c.w / 2 < box[2] && p.y + c.h / 2 > box[1] && p.y - c.h / 2 < box[3];
};

/** The moving parts and everything with a state: drawn every frame. */
function drawLive(g: CanvasRenderingContext2D, h: Hole, st: HoleState, t: number, clock: number, hits: Map<string, number>): void {
  const box = holeBox(h);
  // Surfaces first, kept inside the rail.
  g.save();
  poly(g, h.outer);
  g.clip();
  // Ramp chevrons drifting downhill.
  for (const z of h.zones) {
    if (z.kind !== 'ramp' || !z.poly || !z.push) continue;
    g.save();
    zonePath(g, z);
    g.clip();
    const b = bounds(z.poly);
    const a = Math.atan2(z.push[1], z.push[0]);
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 0.6;
    const off = (clock * 4) % 8;
    for (let y = b.y0 - 8 + off; y < b.y1 + 4; y += 8)
      for (let x = b.x0 + 6; x < b.x1; x += 12) {
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
  // Belts: chevrons moving at belt speed.
  for (const cvy of h.conveyors) {
    const on = !cvy.sw || (!!st.sw[cvy.sw.id] === (cvy.sw.active === 'on'));
    g.save();
    poly(g, cvy.poly);
    g.clip();
    const b = bounds(cvy.poly);
    const cx = Math.cos(cvy.dir), cy = Math.sin(cvy.dir);
    const off = on ? (t * cvy.speed) % 6 : 0;
    g.strokeStyle = on ? 'rgba(255,210,63,0.75)' : 'rgba(255,255,255,0.25)';
    g.lineWidth = 0.7;
    const R = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 6, mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
    for (let k = -R; k < R; k += 6) for (let j = -R; j < R; j += 5) {
      const x = mx + cx * (k + off) - cy * j, y = my + cy * (k + off) + cx * j;
      g.save();
      g.translate(x, y);
      g.rotate(cvy.dir);
      g.beginPath();
      g.moveTo(-1, -1.4);
      g.lineTo(0.6, 0);
      g.lineTo(-1, 1.4);
      g.stroke();
      g.restore();
    }
    g.restore();
    if (cvy.sw) swBadge(g, h, cvy.sw.id, b.x0 + 2, b.y0 + 2, on);
  }
  // Tides: the water, its edge foaming.
  for (const td of h.tides) {
    const [x0, y0, x1, y1] = tideRect(td, t);
    if (x1 - x0 > 0.01 && y1 - y0 > 0.01) {
      g.fillStyle = 'rgba(47,155,240,0.92)';
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.save();
      g.beginPath();
      g.rect(x0, y0, x1 - x0, y1 - y0);
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.4)';
      g.lineWidth = 0.4;
      for (let y = y0 + ((clock * 2) % 4); y < y1; y += 4) for (let x = x0 + (y % 8) * 0.8; x < x1; x += 7) (g.beginPath(), g.arc(x, y, 1.3, Math.PI * 1.15, Math.PI * 1.85), g.stroke());
      g.restore();
      // Foam on the moving edge.
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 0.6;
      g.beginPath();
      if (td.from === 'top') (g.moveTo(x0, y1), g.lineTo(x1, y1));
      else if (td.from === 'bottom') (g.moveTo(x0, y0), g.lineTo(x1, y0));
      else if (td.from === 'left') (g.moveTo(x1, y0), g.lineTo(x1, y1));
      else (g.moveTo(x0, y0), g.lineTo(x0, y1));
      g.stroke();
    }
    // Rising or falling?
    const rising = tideRectArea(td, t + 0.3) > tideRectArea(td, t);
    g.font = `2.6px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(rising ? '⬆️🌊' : '⬇️🌊', (td.x0 + td.x1) / 2, td.from === 'top' ? td.y1 + 2 : td.from === 'bottom' ? td.y0 - 2 : (td.y0 + td.y1) / 2);
  }
  // Turntables: a spinning disc.
  for (const tt of h.turntables) {
    const on = !tt.sw || (!!st.sw[tt.sw.id] === (tt.sw.active === 'on'));
    const a = on ? tt.omega * t : 0;
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.arc(tt.x + 0.3, tt.y + 0.6, tt.r, 0, TAU);
    g.fill();
    g.fillStyle = '#f6e7c8';
    g.beginPath();
    g.arc(tt.x, tt.y, tt.r, 0, TAU);
    g.fill();
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 2 ? '#e94f64' : '#f6e7c8';
      g.beginPath();
      g.moveTo(tt.x, tt.y);
      g.arc(tt.x, tt.y, tt.r - 0.6, a + (i * TAU) / 12, a + ((i + 1) * TAU) / 12);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 0.55;
    g.fillStyle = '#f6e7c8';
    g.beginPath();
    g.arc(tt.x, tt.y, tt.r * 0.72, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = '#1c2340';
    g.lineWidth = 0.5;
    g.beginPath();
    g.arc(tt.x, tt.y, tt.r, 0, TAU);
    g.stroke();
    // A spin arrow round the rim.
    g.strokeStyle = 'rgba(28,35,64,0.7)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.arc(tt.x, tt.y, tt.r * 0.85, a, a + 1.2 * Math.sign(tt.omega || 1), tt.omega < 0);
    g.stroke();
    arrow(g, tt.x + Math.cos(a + 1.2 * Math.sign(tt.omega || 1)) * tt.r * 0.85, tt.y + Math.sin(a + 1.2 * Math.sign(tt.omega || 1)) * tt.r * 0.85, a + 1.2 * Math.sign(tt.omega || 1) + (Math.PI / 2) * Math.sign(tt.omega || 1), '#1c2340', 0.7);
    if (tt.sw) swBadge(g, h, tt.sw.id, tt.x, tt.y, on);
  }
  // Magnets: rings flowing in (pull) or out (push).
  for (const mg of h.magnets) {
    const on = !mg.sw || (!!st.sw[mg.sw.id] === (mg.sw.active === 'on'));
    const pull = mg.strength > 0;
    const col = pull ? '255,90,110' : '90,170,255';
    g.fillStyle = `rgba(${col},${on ? 0.1 : 0.04})`;
    g.beginPath();
    g.arc(mg.x, mg.y, mg.r, 0, TAU);
    g.fill();
    if (on) for (let k = 0; k < 3; k++) {
      let f = ((clock * 0.6 + k / 3) % 1);
      if (pull) f = 1 - f;
      g.strokeStyle = `rgba(${col},${0.55 * Math.sin(Math.PI * f)})`;
      g.lineWidth = 0.4;
      g.beginPath();
      g.arc(mg.x, mg.y, mg.r * f, 0, TAU);
      g.stroke();
    }
    g.setLineDash([0.8, 0.8]);
    g.strokeStyle = `rgba(${col},0.6)`;
    g.lineWidth = 0.3;
    g.beginPath();
    g.arc(mg.x, mg.y, mg.r, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    if (!(Math.hypot(mg.x - h.cup.x, mg.y - h.cup.y) < 0.5)) {
      g.font = `3px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🧲', mg.x, mg.y);
    }
    if (mg.sw) swBadge(g, h, mg.sw.id, mg.x + 2.5, mg.y - 2.5, on);
  }
  // Wind: streamers that flutter as a tell and stream while it blows.
  for (const wd of h.winds) {
    const on = !wd.sw || (!!st.sw[wd.sw.id] === (wd.sw.active === 'on'));
    const w = windAt(wd, t);
    const b = bounds(wd.poly);
    const cx = Math.cos(wd.dir), cy = Math.sin(wd.dir);
    g.save();
    poly(g, wd.poly);
    g.clip();
    const rr = rng(7);
    for (let i = 0; i < 18; i++) {
      const x0 = b.x0 + rr() * (b.x1 - b.x0), y0 = b.y0 + rr() * (b.y1 - b.y0);
      if (!on) continue;
      if (w.k > 0) {
        const span = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
        const k = (clock * 1.6 + rr()) % 1;
        const x = x0 + cx * (k - 0.5) * span * 0.6, y = y0 + cy * (k - 0.5) * span * 0.6;
        g.strokeStyle = `rgba(255,255,255,${0.7 * w.k})`;
        g.lineWidth = 0.45;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - cx * 5, y - cy * 5);
        g.stroke();
      } else if (w.warn) {
        const wob = Math.sin(clock * 22 + i) * 0.8;
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.lineWidth = 0.4;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x0 + cx * 2 - cy * wob, y0 + cy * 2 + cx * wob);
        g.stroke();
      }
    }
    g.restore();
    // A windsock at the upwind edge: limp, twitching, or straight out.
    const sx = (b.x0 + b.x1) / 2 - cx * ((b.x1 - b.x0) / 2 - 3), sy = (b.y0 + b.y1) / 2 - cy * ((b.y1 - b.y0) / 2 - 3);
    const ang = w.k > 0 ? wd.dir : w.warn ? wd.dir + Math.sin(clock * 16) * 0.5 + 0.6 : wd.dir + 1.3;
    g.save();
    g.translate(sx, sy);
    g.rotate(ang);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#ff6b3d';
      g.fillRect(i * 1.1, -0.9 + i * 0.15, 1.1, 1.8 - i * 0.3);
    }
    g.restore();
    g.fillStyle = '#1c2340';
    g.beginPath();
    g.arc(sx, sy, 0.5, 0, TAU);
    g.fill();
    if (w.warn && on) {
      g.font = `3px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = 0.6 + 0.4 * Math.sin(clock * 12);
      g.fillText('💨', sx, sy - 3);
      g.globalAlpha = 1;
    }
    if (wd.sw) swBadge(g, h, wd.sw.id, sx + 3, sy, on);
  }
  g.restore();
  // Portals: swirling pairs.
  h.portals.forEach((po, i) => {
    const on = !po.sw || (!!st.sw[po.sw.id] === (po.sw.active === 'on'));
    const cols = PORTAL_COLORS[i % PORTAL_COLORS.length];
    const r = po.r ?? 2.6;
    for (const [end, col] of [[po.a, cols[0]], [po.b, cols[1]]] as const) {
      if (po.oneWay && end === po.b) {
        g.fillStyle = 'rgba(0,0,0,0.25)';
      } else g.fillStyle = '#10131f';
      g.beginPath();
      g.arc(end.x, end.y, r, 0, TAU);
      g.fill();
      g.strokeStyle = on ? col : '#666';
      g.lineWidth = 0.55;
      for (let k = 0; k < 3; k++) {
        const a = clock * (end === po.a ? 3 : -3) + (k * TAU) / 3;
        g.beginPath();
        g.arc(end.x, end.y, r * (0.45 + k * 0.18), a, a + 2.2);
        g.stroke();
      }
      g.beginPath();
      g.arc(end.x, end.y, r, 0, TAU);
      g.stroke();
    }
    if (po.oneWay) arrow(g, po.b.x, po.b.y - r - 1.4, -Math.PI / 2, cols[1], 0.6);
    if (po.sw) swBadge(g, h, po.sw.id, po.a.x + r, po.a.y - r, on);
  });
  // Switches.
  h.switches.forEach((sw, i) => {
    const on = !!st.sw[sw.id];
    const r = sw.r ?? 2.4;
    g.fillStyle = '#1c2340';
    g.beginPath();
    g.arc(sw.x, sw.y, r, 0, TAU);
    g.fill();
    g.fillStyle = SW_COLORS[i % SW_COLORS.length];
    g.beginPath();
    g.arc(sw.x, sw.y - (on ? 0 : 0.3), r * 0.72, 0, TAU);
    g.fill();
    g.fillStyle = on ? '#3be07a' : '#ff4b4b';
    g.beginPath();
    g.arc(sw.x, sw.y, r * 0.3, 0, TAU);
    g.fill();
    if (!on) {
      const k = (clock * 1.2) % 1;
      g.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
      g.lineWidth = 0.35;
      g.beginPath();
      g.arc(sw.x, sw.y, r + k * 2.5, 0, TAU);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.font = `900 2px ${DISPLAY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(sw.id.slice(0, 1), sw.x, sw.y - r - 1.6);
  });
  // A sliding cup.
  if (h.cupTrack) {
    const c = cupAt(h, t);
    drawCup(g, c.x, c.y);
  }
  // Crumbling walls: cracks for every knock.
  h.crumbles.forEach((cr, i) => {
    const left = cr.hits - st.cracks[i];
    if (left <= 0) {
      // Rubble.
      const b = bounds(cr.poly);
      const rr = rng(i * 13 + 5);
      g.fillStyle = 'rgba(120,105,90,0.6)';
      for (let k = 0; k < 14; k++) g.fillRect(b.x0 + rr() * (b.x1 - b.x0), b.y0 + rr() * (b.y1 - b.y0), 0.8, 0.8);
      return;
    }
    const since = clock - (hits.get(`c${i}`) ?? -9);
    const jig = since < 0.15 ? Math.sin(since * 120) * 0.25 : 0;
    g.save();
    g.translate(jig, 0);
    g.save();
    g.translate(0.5, 1);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    poly(g, cr.poly);
    g.fill();
    g.restore();
    poly(g, cr.poly);
    g.fillStyle = st.cracks[i] ? '#a89a86' : '#c4b59e';
    g.fill();
    g.lineWidth = 0.5;
    g.strokeStyle = '#1c2340';
    g.stroke();
    g.save();
    poly(g, cr.poly);
    g.clip();
    const b = bounds(cr.poly);
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    g.lineWidth = 0.2;
    for (let y = b.y0 + 1; y < b.y1; y += 1.3) (g.beginPath(), g.moveTo(b.x0, y), g.lineTo(b.x1, y), g.stroke());
    const rr = rng(i * 7 + 3);
    g.strokeStyle = '#2b2118';
    g.lineWidth = 0.35;
    for (let k = 0; k < st.cracks[i] * 3; k++) {
      let x = b.x0 + rr() * (b.x1 - b.x0), y = b.y0;
      g.beginPath();
      g.moveTo(x, y);
      while (y < b.y1) (x += (rr() - 0.5) * 2.2), (y += 0.8 + rr()), g.lineTo(x, y);
      g.stroke();
    }
    g.restore();
    // Knocks left, in small pips.
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    for (let k = 0; k < left; k++) {
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(cx + (k - (left - 1) / 2) * 1.6, cy, 0.5, 0, TAU);
      g.fill();
    }
    g.restore();
  });
  // Bumpers, trampolines, hydrants, posts, cones.
  h.bumpers.forEach((b, i) => {
    const since = clock - (hits.get(`b${i}`) ?? -9);
    const pop = since < 0.18 ? 1 + 0.25 * (1 - since / 0.18) : 1;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.arc(b.x + 0.4, b.y + 0.8, b.r, 0, TAU);
    g.fill();
    if (b.kind === 'bumper' || b.kind === 'trampoline') {
      const tramp = b.kind === 'trampoline';
      g.fillStyle = since < 0.18 ? '#fff6a8' : tramp ? '#2ad1c9' : '#ff4fa3';
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
      if (tramp) {
        g.beginPath();
        g.arc(b.x, b.y, b.r * pop * 0.3, 0, TAU);
        g.stroke();
      }
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
    } else if (b.kind === 'cone') {
      g.fillStyle = '#ff7a1a';
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, TAU);
      g.fill();
      g.lineWidth = 0.4;
      g.strokeStyle = '#1c2340';
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 0.5;
      g.beginPath();
      g.arc(b.x, b.y, b.r * 0.55, 0, TAU);
      g.stroke();
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
  // Springs flash when hit.
  h.springs.forEach((sp, i) => {
    const since = clock - (hits.get(`s${i}`) ?? -9);
    if (since > 0.2) return;
    g.strokeStyle = `rgba(255,255,255,${1 - since / 0.2})`;
    g.lineWidth = 1.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(sp.a.x, sp.a.y);
    g.lineTo(sp.b.x, sp.b.y);
    g.stroke();
    g.lineCap = 'butt';
  });
  // Gates: the shut part and the countdown light.
  for (const gt of h.gates) {
    const s = gateAt(gt, t, st);
    const ex = gt.a.x + (gt.b.x - gt.a.x) * s.shut, ey = gt.a.y + (gt.b.y - gt.a.y) * s.shut;
    // Ghost of where it closes.
    g.setLineDash([0.8, 0.8]);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 0.4;
    g.beginPath();
    g.moveTo(gt.a.x, gt.a.y);
    g.lineTo(gt.b.x, gt.b.y);
    g.stroke();
    g.setLineDash([]);
    if (s.shut > 0) {
      g.lineCap = 'round';
      g.strokeStyle = '#1c2340';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(gt.a.x, gt.a.y);
      g.lineTo(ex, ey);
      g.stroke();
      g.strokeStyle = gt.kind === 'door' ? '#c9d1e3' : '#ff5a5a';
      g.lineWidth = 1.1;
      g.stroke();
      if (gt.kind !== 'door') {
        g.strokeStyle = '#ffffff';
        g.setLineDash([1, 1]);
        g.lineWidth = 1.1;
        g.stroke();
        g.setLineDash([]);
      }
      g.lineCap = 'butt';
    }
    if (gt.period) {
      const open = gt.open ?? gt.period / 2, warn = gt.warn ?? 1;
      const swOff = gt.sw && !(!!st.sw[gt.sw.id] === (gt.sw.active === 'on'));
      const state = swOff ? 'off' : s.shut <= 0 ? (s.left <= warn ? 'soon' : 'go') : 'stop';
      const frac = s.shut <= 0 ? s.left / open : s.left / Math.max(0.1, gt.period - open);
      drawGateLight(g, gt.a.x - (gt.b.x - gt.a.x) * 0.0 + 0, gt.a.y - 3, state, frac);
      if (gt.kind === 'crosswalk') {
        g.font = `2.6px ${EMOJI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(state === 'go' ? '🚶' : '✋', gt.a.x + 3.2, gt.a.y - 3);
      }
    } else if (gt.sw) swBadge(g, h, gt.sw.id, (gt.a.x + gt.b.x) / 2, (gt.a.y + gt.b.y) / 2 - 2.2, s.shut <= 0);
  }
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
    g.lineCap = 'butt';
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
  // Moving walls: buses, crane beams, barriers.
  for (const mv of h.movers) {
    const on = !mv.sw || (!!st.sw[mv.sw.id] === (mv.sw.active === 'on'));
    if (!on) {
      if (mv.sw) swBadge(g, h, mv.sw.id, (mv.a.x + mv.b.x) / 2, (mv.a.y + mv.b.y) / 2, false);
      continue;
    }
    const p = moverAt(mv, t);
    const ax = mv.a.x + p.ox, ay = mv.a.y + p.oy, bx = mv.b.x + p.ox, by = mv.b.y + p.oy;
    const w = mv.w ?? 2;
    const L = Math.hypot(bx - ax, by - ay), a = Math.atan2(by - ay, bx - ax);
    g.save();
    g.translate((ax + bx) / 2, (ay + by) / 2);
    if (mv.kind === 'beam') {
      // The crane's hook line, up and off the top.
      g.strokeStyle = 'rgba(28,35,64,0.6)';
      g.lineWidth = 0.3;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -400);
      g.stroke();
    }
    g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.roundRect(-L / 2 - w / 2 + 0.5, -w / 2 + 1, L + w, w, w / 2);
    g.fill();
    if (mv.kind === 'bus') {
      g.fillStyle = '#e9edf7';
      g.strokeStyle = '#1c2340';
      g.lineWidth = 0.5;
      g.beginPath();
      g.roundRect(-L / 2 - w / 2, -w / 2, L + w, w, 1.6);
      g.fill();
      g.stroke();
      g.fillStyle = '#2a64c5';
      g.fillRect(-L / 2 - w / 2, w * 0.1, L + w, w * 0.22);
      g.fillStyle = '#26324f';
      for (let x = -L / 2; x < L / 2; x += 3) g.fillRect(x, -w / 2 + 0.8, 2, w * 0.3);
    } else if (mv.kind === 'beam') {
      g.fillStyle = '#f28c28';
      g.strokeStyle = '#1c1c1c';
      g.lineWidth = 0.45;
      g.fillRect(-L / 2 - w / 2, -w / 2, L + w, w);
      g.strokeRect(-L / 2 - w / 2, -w / 2, L + w, w);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-L / 2 - w / 2, -0.25, L + w, 0.5);
      g.fillStyle = '#1c1c1c';
      for (let x = -L / 2; x < L / 2; x += 2.5) (g.beginPath(), g.arc(x, -w / 2 + 0.6, 0.25, 0, TAU), g.fill(), g.beginPath(), g.arc(x, w / 2 - 0.6, 0.25, 0, TAU), g.fill());
    } else {
      g.fillStyle = mv.kind === 'barrier' ? '#ff7a1a' : '#8e9aaf';
      g.strokeStyle = '#1c2340';
      g.lineWidth = 0.5;
      g.beginPath();
      g.roundRect(-L / 2 - w / 2, -w / 2, L + w, w, w / 2);
      g.fill();
      g.stroke();
      if (mv.kind === 'barrier') {
        g.save();
        g.clip();
        g.fillStyle = '#ffffff';
        for (let x = -L / 2 - w; x < L / 2 + w; x += 3) (g.beginPath(), g.moveTo(x, -w), g.lineTo(x + 1.4, -w), g.lineTo(x + 1.4 + w * 2, w), g.lineTo(x + w * 2, w), g.fill());
        g.restore();
      }
    }
    g.restore();
    if (mv.sw) swBadge(g, h, mv.sw.id, (ax + bx) / 2, (ay + by) / 2, true);
  }
  // Arms: flippers, bridge cables, crane booms.
  h.arms.forEach((am, i) => {
    const on = !am.sw || (!!st.sw[am.sw.id] === (am.sw.active === 'on'));
    const a = armAngle(am, on ? t : 0);
    const x2 = am.x + Math.cos(a) * am.len, y2 = am.y + Math.sin(a) * am.len;
    const w = am.w ?? 1;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = w + 0.8;
    g.beginPath();
    g.moveTo(am.x + 0.4, am.y + 0.8);
    g.lineTo(x2 + 0.4, y2 + 0.8);
    g.stroke();
    if (am.kind === 'flipper') {
      const soon = on && flipperIn(am, t) < 0.6;
      const since = clock - (hits.get(`a${i}`) ?? -9);
      if (soon) {
        g.strokeStyle = `rgba(255,230,80,${0.5 + 0.5 * Math.sin(clock * 30)})`;
        g.lineWidth = w + 2.2;
        g.beginPath();
        g.moveTo(am.x, am.y);
        g.lineTo(x2, y2);
        g.stroke();
      }
      g.strokeStyle = '#1c2340';
      g.lineWidth = w + 1.4;
      g.beginPath();
      g.moveTo(am.x, am.y);
      g.lineTo(x2, y2);
      g.stroke();
      g.strokeStyle = since < 0.2 ? '#fff6a8' : '#ff4fa3';
      g.lineWidth = w + 0.5;
      g.stroke();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(am.x, am.y, w * 0.9, 0, TAU);
      g.fill();
    } else {
      g.strokeStyle = am.kind === 'cable' ? '#3d4a63' : '#f28c28';
      g.lineWidth = w + 0.6;
      g.beginPath();
      g.moveTo(am.x, am.y);
      g.lineTo(x2, y2);
      g.stroke();
      g.strokeStyle = am.kind === 'cable' ? '#b8c4d8' : '#ffd23f';
      g.lineWidth = w * 0.4;
      g.stroke();
      g.fillStyle = '#1c2340';
      g.beginPath();
      g.arc(am.x, am.y, w * 0.9 + 0.4, 0, TAU);
      g.fill();
      g.fillStyle = am.kind === 'cable' ? '#c9d1e3' : '#ffd23f';
      g.beginPath();
      g.arc(x2, y2, w * 0.7 + 0.3, 0, TAU);
      g.fill();
    }
    g.lineCap = 'butt';
    if (am.sw) swBadge(g, h, am.sw.id, am.x, am.y - 2.5, on);
  });
  // Cabs, buses, trains and beams (moving boxes).
  for (const c of h.cabs) {
    if (c.mode === 'loop') {
      // Crossing lights where the track meets the rail, flashing before it comes.
      const coming = !onCourse(c, t, box) && [0.25, 0.5, 0.75, 1].some((k) => onCourse(c, t + (c.warn ?? 1.5) * k, box));
      const here = onCourse(c, t, box);
      const horiz = Math.abs(c.bx - c.ax) >= Math.abs(c.by - c.ay);
      const pts = horiz ? [[box[0] + 1.5, c.ay - c.h / 2 - 2], [box[2] - 1.5, c.ay - c.h / 2 - 2]] : [[c.ax - c.w / 2 - 2, box[1] + 1.5], [c.ax - c.w / 2 - 2, box[3] - 1.5]];
      for (const [x, y] of pts) {
        const lit = (coming || here) && Math.floor(clock * 6) % 2 === 0;
        g.fillStyle = '#1c2340';
        g.beginPath();
        g.arc(x, y, 1.3, 0, TAU);
        g.fill();
        g.fillStyle = lit ? '#ff3b3b' : '#4a1d1d';
        g.beginPath();
        g.arc(x, y, 0.85, 0, TAU);
        g.fill();
      }
      if (!here) continue;
    }
    const p = cabAt(c, t);
    const dir = Math.sign(p.vx || p.vy || 1);
    g.save();
    if (c.mode === 'loop') {
      poly(g, h.outer);
      g.clip();
    }
    g.translate(p.x, p.y);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.roundRect(-c.w / 2 + 0.6, -c.h / 2 + 1.2, c.w, c.h, 2);
    g.fill();
    if (c.kind === 'train') {
      g.fillStyle = '#c9d1e3';
      g.strokeStyle = '#1c2340';
      g.lineWidth = 0.5;
      const cars = Math.max(1, Math.round(c.w / 13));
      const cw = c.w / cars;
      for (let k = 0; k < cars; k++) {
        g.beginPath();
        g.roundRect(-c.w / 2 + k * cw + 0.2, -c.h / 2, cw - 0.4, c.h, 1.2);
        g.fill();
        g.stroke();
        g.fillStyle = '#ff6319';
        g.fillRect(-c.w / 2 + k * cw + 0.2, -0.4, cw - 0.4, 0.8);
        g.fillStyle = '#26324f';
        for (let x = -c.w / 2 + k * cw + 1.2; x < -c.w / 2 + (k + 1) * cw - 1.5; x += 2.4) (g.fillRect(x, -c.h / 2 + 0.8, 1.6, 1.4), g.fillRect(x, c.h / 2 - 2.2, 1.6, 1.4));
        g.fillStyle = '#c9d1e3';
      }
      g.fillStyle = '#ffe066';
      g.fillRect(dir * (c.w / 2 - 0.8) - 0.4, -c.h / 2 + 1, 0.8, 1.2);
      g.fillRect(dir * (c.w / 2 - 0.8) - 0.4, c.h / 2 - 2.2, 0.8, 1.2);
    } else if (c.kind === 'beam') {
      g.fillStyle = '#f28c28';
      g.strokeStyle = '#1c1c1c';
      g.lineWidth = 0.45;
      g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      g.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h);
    } else if (c.kind === 'bus') {
      g.fillStyle = '#e9edf7';
      g.strokeStyle = '#1c2340';
      g.lineWidth = 0.5;
      g.beginPath();
      g.roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 1.6);
      g.fill();
      g.stroke();
      g.fillStyle = '#2a64c5';
      g.fillRect(-c.w / 2, c.h * 0.1, c.w, c.h * 0.22);
    } else {
      g.fillStyle = '#ffc629';
      g.strokeStyle = '#1c2340';
      g.lineWidth = 0.6;
      g.beginPath();
      g.roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#26324f';
      g.beginPath();
      g.roundRect(dir * c.w * 0.14 - 1.3, -c.h / 2 + 1, 2.6, c.h - 2, 0.8);
      g.fill();
      g.beginPath();
      g.roundRect(-dir * c.w * 0.3 - 1, -c.h / 2 + 1.3, 2, c.h - 2.6, 0.7);
      g.fill();
      g.fillStyle = '#1c2340';
      for (let x = -c.w / 2 + 1; x < c.w / 2 - 1; x += 1.4) g.fillRect(x, c.h / 2 - 1.1, 0.7, 0.7);
      g.fillStyle = '#fff';
      g.beginPath();
      g.roundRect(-dir * 1.6 - 1.4, -1, 2.8, 2, 0.5);
      g.fill();
      g.fillStyle = '#ff9f1c';
      g.fillRect(dir * c.w / 2 - (dir > 0 ? 0.8 : 0), -c.h / 2 + 0.8, 0.8, 1.4);
      g.fillRect(dir * c.w / 2 - (dir > 0 ? 0.8 : 0), c.h / 2 - 2.2, 0.8, 1.4);
    }
    g.restore();
  }
  // The flag: a pin leaning off the cup with a waving pennant.
  const cp = cupAt(h, t);
  const fx0 = cp.x, fy0 = cp.y;
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

const tideRectArea = (td: Hole['tides'][number], t: number) => {
  const [x0, y0, x1, y1] = tideRect(td, t);
  return (x1 - x0) * (y1 - y0);
};

function drawBall(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number, z = 0): void {
  if (r <= 0.05) return;
  g.globalAlpha = alpha;
  // In the air: the shadow stays on the turf, the ball rises and grows.
  const s = 1 + z * 0.09;
  g.fillStyle = `rgba(0,0,0,${0.35 / (1 + z * 0.15)})`;
  g.beginPath();
  g.ellipse(x + 0.35 + z * 0.25, y + 0.6 + z * 0.4, r, r * 0.85, 0, 0, TAU);
  g.fill();
  const yy = y - z * 0.6, rr = r * s;
  const gr = g.createRadialGradient(x - rr * 0.35, yy - rr * 0.4, rr * 0.1, x, yy, rr);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.45, color);
  gr.addColorStop(1, color === '#ffffff' ? '#c9cfdc' : '#c2457f');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, yy, rr, 0, TAU);
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
