// =====================================================================
// pool.ts (ui) — 🎱 a pool table you can play at casinos, bars and home:
// 8-ball or 9-ball against a computer player, for fun or for a stake.
// Rules, physics and the computer's shots live in sim/pool.ts; this file
// draws the table and handles touch.
//
// Controls (touch first, the mouse works the same):
//   • Drag back from the cue ball: the line shows where it goes, the ghost
//     ball shows the contact, the stick and meter show the power. Let go
//     to shoot; let go near the ball to cancel.
//   • Tap or drag the spin ball for follow (top) or draw (bottom).
//   • Ball in hand: drag the cue ball itself to move it.
// Stakes go through sim/casino.ts (stake on the rack, a win pays 1.95×:
// the house keeps 2.5% of the pot). In-game money only.
// =====================================================================

import './pool.css';
import { esc, money } from '../core/format.ts';
import { payout, stake } from '../sim/casino.ts';
import { aimRay, aiPlan, ball as ballOf, ballsLeft, cueBall, endShot, FOOT, freeSpot, HEAD_Y, L, legalTargets, moving, newGame, placeCue, POCKETS, R, step, strike, W, type Mode, type PoolEvent, type PoolGame, type Seat, type Shot, type ShotResult } from '../sim/pool.ts';
import { sfx } from './audio.ts';
import { rain, type CasinoHost } from './casino.ts';
import { openModal, toast } from './dom.ts';
import { buzz, Fx, shakeEl } from './juice.ts';

export interface PoolOpts {
  mode?: '8' | '9';
  stake?: boolean;
  opponent?: { name: string; skill: number };
}

/** What a win returns, stake included (2× the stake less a 2.5% rake on the pot). */
export const POOL_PAYS = 1.95;
const CHIPS = [500, 2_500, 10_000, 50_000, 100_000, 500_000];
let lastBet = 2_500;
let lastMode: Mode = '8';

const RAIL = 3.4; // rail width drawn around the playing surface (inches)
const TW = W + RAIL * 2, TH = L + RAIL * 2;
const PULL = 30; // inches of drag for full power
const STEP = 1 / 120;
const TAU = Math.PI * 2;
const BALL_COL = ['#f4f1e6', '#f2c200', '#1f4fd1', '#d6262b', '#5b2a86', '#f07f13', '#137a3a', '#7d1a1a', '#151515'];
const colorOf = (id: number) => (id === 0 ? BALL_COL[0] : id === 8 ? BALL_COL[8] : BALL_COL[((id - 1) % 8) + 1]);
const FELT: Record<Mode, [string, string, string]> = { '8': ['#2f9e64', '#1d7a4b', '#155c39'], '9': ['#3283cf', '#1f5f9e', '#16467a'] };
const ease = (k: number) => 1 - Math.pow(1 - k, 3);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function skillWord(k: number): string {
  return k >= 0.85 ? 'shark 🦈' : k >= 0.65 ? 'good' : k >= 0.4 ? 'decent' : 'casual';
}

function mini(id: number, big = false): string {
  return `<i class="pb${id >= 9 ? ' st' : ''}${big ? ' big' : ''}" style="--c:${colorOf(id)}">${id}</i>`;
}

export function openPool(host: CasinoHost, opts: PoolOpts = {}): void {
  const s = host.state;
  const foe = { name: opts.opponent?.name ?? 'Sal', skill: clamp(opts.opponent?.skill ?? 0.55, 0, 1) };
  const m = openModal(`<div class="cas pool">
    <div class="cas-head"><span class="cas-emoji">🎱</span><h2>Pool</h2><span class="cas-cash" data-cash>${money(s.money)}</span><button class="pool-x" data-leave aria-label="Leave the table">✕</button></div>
    <div class="pool-body"></div>
  </div>`);
  m.el.classList.add('cas-modal', 'pool-modal');
  m.el.parentElement?.classList.add('pool-wrap');
  const body = m.el.querySelector<HTMLElement>('.pool-body')!;
  const xBtn = m.el.querySelector<HTMLElement>('.pool-x')!;
  let mode: Mode = opts.mode ?? lastMode;
  let bet = 0;
  let breaker: Seat = 0;
  let match: { destroy: () => void; over: () => boolean } | null = null;
  let confirmLeave = false;
  const showCash = () => {
    const c = m.el.querySelector<HTMLElement>('[data-cash]');
    if (c) c.textContent = money(s.money);
  };

  const leave = () => {
    if (match && !match.over() && bet && !confirmLeave) {
      confirmLeave = true;
      xBtn.classList.add('confirm');
      xBtn.textContent = 'Forfeit?';
      toast(`Leaving now forfeits your ${money(bet)} stake. Tap again to go.`, { icon: '🎱', tone: 'bad' });
      window.setTimeout(() => {
        confirmLeave = false;
        xBtn.classList.remove('confirm');
        xBtn.textContent = '✕';
      }, 3500);
      return;
    }
    match?.destroy();
    match = null;
    host.saved();
    m.close();
  };
  m.el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-leave]')) leave();
  });

  // ------------------------------------------------------------ setup screen
  const setup = () => {
    body.innerHTML = `<div class="pool-setup">
      <p class="pool-vs">You vs <b>${esc(foe.name)}</b> <span class="pool-skill">${skillWord(foe.skill)}</span></p>
      ${opts.mode ? '' : `<div class="pool-modes" role="radiogroup" aria-label="Game">
        <button class="pool-mode${mode === '8' ? ' on' : ''}" data-mode="8" role="radio" aria-checked="${mode === '8'}"><span>🎱</span><b>8-Ball</b><small>Solids or stripes, then sink the 8</small></button>
        <button class="pool-mode${mode === '9' ? ' on' : ''}" data-mode="9" role="radio" aria-checked="${mode === '9'}"><span>9️⃣</span><b>9-Ball</b><small>Always hit the lowest ball. Sink the 9 to win</small></button>
      </div>`}
      ${opts.stake ? `<div class="chips" role="radiogroup" aria-label="Stake">${CHIPS.map((c) => `<button class="chip${c === lastBet ? ' on' : ''}" data-chip="${c}" role="radio" aria-checked="${c === lastBet}">${money(c).replace('.00', '')}</button>`).join('')}</div>
      <p class="pool-help">Winner takes the pot: a win pays ${POOL_PAYS}× your stake.</p>` : ''}
      <p class="pool-help">Drag back from the cue ball to aim, let go to shoot.</p>
      <button class="btn primary block cas-go" data-start>Rack ’em</button>
    </div>`;
    body.onclick = (e) => {
      const t = e.target as HTMLElement;
      const md = t.closest<HTMLElement>('[data-mode]');
      if (md) {
        sfx.tap();
        mode = lastMode = md.dataset.mode as Mode;
        body.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => (b.classList.toggle('on', b === md), b.setAttribute('aria-checked', String(b === md))));
      }
      const ch = t.closest<HTMLElement>('[data-chip]');
      if (ch) {
        sfx.tap();
        lastBet = Number(ch.dataset.chip);
        body.querySelectorAll<HTMLElement>('[data-chip]').forEach((c) => (c.classList.toggle('on', c === ch), c.setAttribute('aria-checked', String(c === ch))));
      }
      if (t.closest('[data-start]')) start();
    };
  };

  const start = () => {
    bet = 0;
    if (opts.stake) {
      const why = stake(s, lastBet, 'Pool');
      if (why) return void toast(why, { icon: '🎱', tone: 'bad' });
      bet = lastBet;
      sfx.coin();
      showCash();
      host.saved();
    }
    body.onclick = null;
    match?.destroy();
    match = play();
  };

  // ------------------------------------------------------------------ a game
  const play = () => {
    const g: PoolGame = newGame(mode, Math.random, breaker);
    body.innerHTML = `<div class="pool-game">
      <div class="pool-players">
        <div class="pp" data-seat="0"><span class="pp-name">You</span><span class="pp-grp"></span><span class="pp-balls"></span></div>
        <div class="pp-mid"></div>
        <div class="pp" data-seat="1"><span class="pp-name">${esc(foe.name)}</span><span class="pp-grp"></span><span class="pp-balls"></span></div>
      </div>
      <div class="pool-stage"><canvas class="pool-cv" role="img" aria-label="Pool table. Drag back from the cue ball to aim and shoot."></canvas><div class="pool-end" hidden></div></div>
      <div class="pool-bar">
        <p class="cas-msg pool-msg" aria-live="polite"></p>
        <button class="pool-spin" aria-label="Spin: centre ball"><span class="pool-spin-ball"><i></i></span><small>Centre</small></button>
      </div>
    </div>`;
    const q = <T extends HTMLElement = HTMLElement>(sel: string) => body.querySelector<T>(sel)!;
    const cv = q<HTMLCanvasElement>('.pool-cv');
    const ctx = cv.getContext('2d')!;
    const stage = q('.pool-stage');
    const msgEl = q('.pool-msg');
    const spinBtn = q('.pool-spin');
    const endEl = q('.pool-end');
    const name = (seat: Seat) => (seat === 0 ? 'You' : foe.name);

    let dead = false;
    let raf = 0;
    let S = 5; // css px per inch
    let cssW = TW * S, cssH = TH * S;
    let dpr = 1;
    let fx = new Fx(cssW, cssH);
    let bg: HTMLCanvasElement | null = null;
    type Phase = 'aim' | 'strike' | 'roll' | 'ai' | 'over';
    let phase: Phase = 'ai';
    let acc = 0;
    let spin = 0;
    const aim = { angle: -Math.PI / 2, power: 0, show: false, who: 0 as Seat };
    let strikeT = 0;
    let pending: Shot | null = null;
    let drag: { kind: 'place' | 'aim'; start: number; ox: number; oy: number; id: number } | null = null;
    let ghost: { x: number; y: number } | null = null; // where an illegal placement would go
    let lastNotch = 0;
    const drops: { id: number; x: number; y: number; px: number; py: number; t: number }[] = [];
    const vis = new Map<number, { ph: number; dx: number; dy: number; lx: number; ly: number }>();
    for (const b of g.balls) vis.set(b.id, { ph: 0, dx: 0, dy: -1, lx: b.x, ly: b.y });
    const anims: { t: number; dur: number; f: (k: number) => void; done: () => void }[] = [];
    const tween = (dur: number, f: (k: number) => void) => new Promise<void>((res) => anims.push({ t: 0, dur, f, done: res }));
    const pause = (sec: number) => tween(sec, () => {});

    const px = (x: number) => (RAIL + x) * S;
    const py = (y: number) => (RAIL + y) * S;
    const toTable = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * TW - RAIL, y: ((e.clientY - r.top) / r.height) * TH - RAIL };
    };

    const say = (html: string) => (msgEl.innerHTML = html);

    // -------------------------------------------------------------- layout
    const fit = () => {
      cv.style.width = '10px';
      cv.style.height = '10px';
      const overhead = m.el.offsetHeight - stage.offsetHeight;
      const availH = Math.max(240, window.innerHeight - 30 - overhead);
      const availW = Math.max(200, body.clientWidth);
      S = Math.min(availW / TW, availH / TH);
      cssW = TW * S;
      cssH = TH * S;
      dpr = Math.min(3, window.devicePixelRatio || 1);
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
      cv.style.width = `${cssW}px`;
      cv.style.height = `${cssH}px`;
      fx = new Fx(cssW, cssH);
      bg = drawTable(mode, S, dpr);
    };

    // ------------------------------------------------------------- players
    const renderPlayers = () => {
      for (const seat of [0, 1] as Seat[]) {
        const el = q(`.pp[data-seat="${seat}"]`);
        el.classList.toggle('on', g.turn === seat && !g.over);
        const grp = g.groups[seat];
        el.querySelector('.pp-grp')!.textContent = g.mode === '9' ? (g.turn === seat && !g.over ? 'Shooting' : '') : grp ? (grp === 'solids' ? '● Solids' : '◐ Stripes') : 'Open table';
        const left = g.mode === '8' && grp ? ballsLeft(g, seat) : [];
        el.querySelector('.pp-balls')!.innerHTML = g.mode === '8' && grp ? (left.length ? left.map((id) => mini(id)).join('') : `<span class="pp-on8">on the ${mini(8)}</span>`) : '';
      }
      const low = g.mode === '9' ? legalTargets(g)[0] : undefined;
      q('.pp-mid').innerHTML = `${low !== undefined && !g.over ? `<span>Next</span>${mini(low, true)}` : '<span>vs</span>'}${bet ? `<small>Pot ${money(bet * 2).replace('.00', '')}</small>` : ''}`;
    };

    // ----------------------------------------------------------- the turns
    const yourTurn = (lead = '') => {
      phase = 'aim';
      aim.show = false;
      aim.who = 0;
      if (g.ballInHand && !cueBall(g).on) {
        const p = freeSpot(g, W / 2, g.kitchen ? HEAD_Y + 10 : L * 0.72);
        placeCue(g, p.x, p.y);
        syncVis(0);
      }
      renderPlayers();
      const tip = g.ballInHand
        ? `${g.breakShot ? 'Your break. ' : 'Ball in hand. '}Drag the cue ball to move it${g.kitchen ? ' (behind the line)' : ''}; drag back from beside it to aim.`
        : 'Drag back from the cue ball to aim. Let go to shoot.';
      say(`${lead ? `${lead} ` : ''}<span class="pool-tip">${tip}</span>`);
    };

    const aiTurn = async (lead = '') => {
      phase = 'ai';
      renderPlayers();
      say(`${lead ? `${lead} ` : ''}<span class="pool-tip">${esc(foe.name)} is lining it up<span class="pool-dots"></span></span>`);
      await pause(0.55 + Math.random() * 0.45);
      if (dead) return;
      const plan = aiPlan(g, foe.skill);
      if (dead) return;
      const c = cueBall(g);
      if (plan.place) {
        const to = plan.place;
        if (!c.on) {
          placeCue(g, to.x, to.y);
          syncVis(0);
          sfx.tap();
        } else {
          const fx0 = c.x, fy0 = c.y;
          await tween(0.35, (k) => ((c.x = fx0 + (to.x - fx0) * ease(k)), (c.y = fy0 + (to.y - fy0) * ease(k))));
          if (dead) return;
          placeCue(g, to.x, to.y);
          syncVis(0);
        }
      }
      aim.who = 1;
      aim.power = 0;
      aim.show = true;
      const a0 = aim.angle;
      let da = (((plan.shot.angle - a0) % TAU) + TAU * 1.5) % TAU - Math.PI;
      if (!isFinite(da)) da = 0;
      await tween(0.45, (k) => (aim.angle = a0 + da * ease(k)));
      await tween(0.3 + plan.shot.power * 0.25, (k) => (aim.power = plan.shot.power * ease(k)));
      await pause(0.12);
      if (dead) return;
      shoot(plan.shot);
    };

    const shoot = (shot: Shot) => {
      pending = shot;
      strikeT = 0;
      phase = 'strike';
      aim.angle = shot.angle;
      aim.power = shot.power;
    };

    const doStrike = () => {
      const shot = pending!;
      pending = null;
      const brk = g.breakShot;
      if (!strike(g, shot)) return yourTurn();
      aim.show = false;
      phase = 'roll';
      acc = 0;
      sfx.tap();
      sfx.tick();
      if (brk || shot.power > 0.75) (sfx.punch(), fx.shake(brk ? 7 : 3, 0.2));
      if (aim.who === 0) {
        spin = 0;
        setSpin(0);
      }
      say(brk ? '<b>Break!</b>' : '');
    };

    const onEvents = (ev: PoolEvent[]) => {
      let clacks = 0;
      for (const e of ev) {
        if (e.type === 'ball') {
          if (e.speed > 6 && clacks < 2) {
            clacks++;
            sfx.tick();
            if (e.speed > 110) sfx.tap();
          }
          if (e.speed > 160) {
            fx.stop(0.03);
            fx.shake(Math.min(7, e.speed / 45), 0.15);
            fx.burst(px(e.x), py(e.y), { n: 6, colors: ['#ffffff', '#ffe9a8'], speed: 110, gravity: 0, life: 0.25, size: 2.5 });
          }
        } else if (e.type === 'pocket') {
          const b = ballOf(g, e.a);
          drops.push({ id: e.a, x: b.x, y: b.y, px: e.x, py: e.y, t: 0 });
          sfx.punch();
          buzz(12);
          fx.burst(px(e.x), py(e.y), { n: 10, colors: [colorOf(e.a), '#ffd23f', '#ffffff'], speed: 120, gravity: 0, life: 0.45, size: 3 });
          if (e.a === 0) fx.pop(px(e.x), py(e.y), 'Scratch!', '#ff6b6b', 18);
        }
      }
    };

    const foulText = (r: ShotResult) => {
      switch (r.foul) {
        case 'scratch': return 'scratch';
        case 'miss': return 'no ball hit';
        case 'no-rail': return 'no rail after contact';
        case 'wrong-first': return g.mode === '9' ? `had to hit the ${r.legal[0]} first` : r.firstHit === 8 ? 'hit the 8 first' : 'hit the wrong group first';
      }
      return '';
    };

    const afterShot = () => {
      const res = endShot(g);
      for (const b of g.balls) syncVis(b.id);
      renderPlayers();
      if (res.win !== null) return gameOver(res);
      const me = res.shooter;
      const you = me === 0;
      const parts: string[] = [];
      if (res.foul) {
        sfx.bad();
        fx.stamp('FOUL', '#ff6b6b', 0.8);
        parts.push(`<b>Foul</b>${you ? '' : ` by ${esc(foe.name)}`}: ${foulText(res)}.`);
        parts.push(g.turn === 0 ? 'Ball in hand for you.' : `${esc(foe.name)} has ball in hand.`);
      } else if (res.assigned) {
        parts.push(`<b>${you ? 'You’re' : `${esc(foe.name)}’s`} ${res.assigned}.</b>`);
        if (you) (sfx.good(), fx.pop(cssW / 2, cssH * 0.45, res.assigned === 'solids' ? '● SOLIDS' : '◐ STRIPES', '#ffd23f', 24));
      } else if (res.keepTurn) {
        if (you) {
          sfx.good();
          parts.push(res.potted.length > 1 ? `<b>${res.potted.length} down.</b>` : '<b>Down.</b>');
        } else parts.push(`${esc(foe.name)} makes it.`);
      } else if (!res.brk) parts.push(you ? 'Nothing dropped.' : `${esc(foe.name)} misses.`);
      if (res.potted.length >= 2 && !res.foul) fx.stamp(res.brk ? `${res.potted.length} ON THE BREAK` : `${res.potted.length} BALLS!`, '#ffd23f', 0.9);
      if (res.spotted !== null) parts.push(`The ${res.spotted} goes back on the spot.`);
      const lead = parts.join(' ');
      if (g.turn === 1) void aiTurn(lead);
      else yourTurn(lead);
    };

    const gameOver = (res: ShotResult) => {
      phase = 'over';
      aim.show = false;
      const won = res.win === 0;
      const winner = name(res.win!), loser = name(res.win === 0 ? 1 : 0);
      const reason: Record<string, string> = {
        eight: `${winner} sank the 8.`,
        'eight-break': '8 on the break!',
        'eight-early': `${loser} sank the 8 early.`,
        'eight-scratch': `${loser} scratched on the 8.`,
        'eight-foul': `${loser} fouled on the 8.`,
        nine: res.firstHit !== null && res.firstHit !== 9 ? `${winner} sank the 9 off the ${res.firstHit}.` : `${winner} sank the 9.`,
      };
      const why = reason[res.why!];
      let paid = 0;
      if (won) {
        sfx.win();
        window.setTimeout(() => !dead && sfx.cheer(), 250);
        fx.stamp('YOU WIN!', '#ffd23f', 1.6);
        fx.burst(cssW / 2, cssH * 0.35, { n: 26, emoji: ['🎱', '✨', '🪙'], speed: 260, life: 1.1 });
        fx.shake(8, 0.35);
        if (bet) {
          paid = Math.round(bet * POOL_PAYS);
          payout(s, paid, 'Pool');
          sfx.jackpot();
          rain(m.el, '🪙', 30);
        }
        host.onScore?.('pool', 1);
      } else {
        sfx.bad();
        fx.stamp(`${foe.name.toUpperCase()} WINS`, '#ff6b6b', 1.6);
        fx.shake(6, 0.3);
      }
      showCash();
      host.saved();
      say(`<b>${esc(why)}</b>`);
      window.setTimeout(() => {
        if (dead) return;
        if (!won) shakeEl(stage);
        endEl.innerHTML = `<div class="pool-end-card ${won ? 'win' : 'lose'}">
          <div class="pool-end-big" aria-hidden="true">${won ? '🏆' : '🎱'}</div>
          <h3>${won ? 'You win!' : `${esc(foe.name)} wins`}</h3>
          <p>${esc(why)}</p>
          ${bet ? `<p class="pool-end-money">${won ? `+${money(paid - bet)}` : `−${money(bet)}`}</p>` : ''}
          <button class="btn primary block" data-again>Rematch${opts.stake ? ` · ${money(lastBet).replace('.00', '')}` : ''}</button>
          <button class="btn ghost block" data-leave>Leave the table</button>
        </div>`;
        endEl.hidden = false;
      }, 1300);
    };
    endEl.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('[data-again]')) return;
      sfx.tap();
      breaker = breaker === 0 ? 1 : 0;
      start();
    });

    // -------------------------------------------------------------- input
    const syncVis = (id: number) => {
      const b = ballOf(g, id), v = vis.get(id)!;
      v.lx = b.x;
      v.ly = b.y;
    };
    const tryPlace = (x: number, y: number) => {
      if (placeCue(g, x, y)) {
        ghost = null;
        syncVis(0);
      } else ghost = { x, y };
    };
    const aimAt = (x: number, y: number) => {
      const c = cueBall(g);
      const dx = c.x - x, dy = c.y - y;
      const d = Math.hypot(dx, dy);
      if (d > 0.6) aim.angle = Math.atan2(dy, dx);
      aim.power = clamp((d - drag!.start) / PULL, 0, 1);
      const notch = Math.floor(aim.power * 4);
      if (notch !== lastNotch) {
        if (notch > lastNotch) (sfx.tick(), buzz(4));
        lastNotch = notch;
      }
    };
    const down = (e: PointerEvent) => {
      if (phase !== 'aim' || g.turn !== 0 || drag) return;
      e.preventDefault();
      const p = toTable(e);
      const c = cueBall(g);
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        // Fine without capture.
      }
      if (g.ballInHand && Math.hypot(p.x - c.x, p.y - c.y) < 3) {
        drag = { kind: 'place', start: 0, ox: c.x - p.x, oy: c.y - p.y, id: e.pointerId };
        sfx.tap();
        return;
      }
      drag = { kind: 'aim', start: Math.hypot(p.x - c.x, p.y - c.y), ox: 0, oy: 0, id: e.pointerId };
      lastNotch = 0;
      aim.who = 0;
      aim.power = 0;
      aim.show = true;
      aimAt(p.x, p.y);
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = toTable(e);
      if (drag.kind === 'place') tryPlace(p.x + drag.ox, p.y + drag.oy);
      else aimAt(p.x, p.y);
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      ghost = null;
      if (d.kind === 'place') return void sfx.tap();
      if (e.type === 'pointerup' && aim.power >= 0.03 && phase === 'aim') shoot({ angle: aim.angle, power: aim.power, spin });
      else {
        aim.show = false;
        aim.power = 0;
      }
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    const setSpin = (v: number) => {
      spin = Math.abs(v) < 0.15 ? 0 : clamp(v, -1, 1);
      spinBtn.querySelector<HTMLElement>('i')!.style.setProperty('--sy', `${50 - spin * 34}%`);
      const word = spin > 0 ? 'Follow' : spin < 0 ? 'Draw' : 'Centre';
      spinBtn.querySelector('small')!.textContent = word;
      spinBtn.setAttribute('aria-label', `Spin: ${word.toLowerCase()}`);
    };
    let spinDrag = -1;
    const spinAt = (e: PointerEvent) => {
      const r = spinBtn.querySelector('.pool-spin-ball')!.getBoundingClientRect();
      setSpin(-(e.clientY - (r.top + r.height / 2)) / (r.height * 0.34));
    };
    spinBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      spinDrag = e.pointerId;
      try {
        spinBtn.setPointerCapture(e.pointerId);
      } catch {
        // Fine without capture.
      }
      spinAt(e);
      sfx.tap();
    });
    spinBtn.addEventListener('pointermove', (e) => e.pointerId === spinDrag && spinAt(e));
    const spinUp = () => (spinDrag = -1);
    spinBtn.addEventListener('pointerup', spinUp);
    spinBtn.addEventListener('pointercancel', spinUp);
    spinBtn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') (setSpin(spin + 0.5), e.preventDefault());
      if (e.key === 'ArrowDown') (setSpin(spin - 0.5), e.preventDefault());
    });

    // --------------------------------------------------------------- loop
    const update = (dt: number) => {
      for (let i = anims.length - 1; i >= 0; i--) {
        const a = anims[i];
        a.t += dt;
        const k = Math.min(1, a.t / a.dur);
        a.f(k);
        if (k >= 1) (anims.splice(i, 1), a.done());
      }
      if (phase === 'strike' && pending) {
        strikeT += dt;
        aim.power = pending.power * Math.max(0, 1 - strikeT / 0.07);
        if (strikeT >= 0.07) doStrike();
      }
      if (phase === 'roll' && !fx.frozen) {
        acc += dt;
        let n = 0;
        while (acc >= STEP && n++ < 8) {
          onEvents(step(g, STEP));
          acc -= STEP;
        }
        for (const b of g.balls) {
          if (!b.on) continue;
          const v = vis.get(b.id)!;
          const dx = b.x - v.lx, dy = b.y - v.ly;
          const d = Math.hypot(dx, dy);
          if (d > 1e-4) ((v.ph += d / R), (v.dx = dx / d), (v.dy = dy / d), (v.lx = b.x), (v.ly = b.y));
        }
        if (!moving(g)) {
          acc = 0;
          afterShot();
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) if ((drops[i].t += dt) > 0.3) drops.splice(i, 1);
    };

    const draw = () => {
      ctx.clearRect(0, 0, cssW, cssH);
      if (bg) ctx.drawImage(bg, 0, 0, cssW, cssH);
      ctx.save();
      ctx.translate(RAIL * S, RAIL * S);
      ctx.scale(S, S);
      const now = performance.now() / 1000;
      const c = cueBall(g);
      const yours = phase === 'aim' && g.turn === 0;
      // The kitchen while placing for the break.
      if (yours && g.ballInHand && g.kitchen) {
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        ctx.fillRect(0, HEAD_Y, W, L - HEAD_Y);
        ctx.strokeStyle = 'rgba(255,233,168,.55)';
        ctx.lineWidth = 0.25;
        ctx.beginPath();
        ctx.moveTo(0, HEAD_Y);
        ctx.lineTo(W, HEAD_Y);
        ctx.stroke();
      }
      // Which balls you can hit (a soft ring), unless the whole table is fair game.
      const legal = legalTargets(g);
      if (yours && !g.breakShot && legal.length <= 7) {
        ctx.strokeStyle = `rgba(255,233,168,${0.35 + 0.2 * Math.sin(now * 4)})`;
        ctx.lineWidth = 0.22;
        for (const id of legal) {
          const b = ballOf(g, id);
          ctx.beginPath();
          ctx.arc(b.x, b.y, R + 0.45, 0, TAU);
          ctx.stroke();
        }
      }
      // Balls (shadows first so they never sit on a neighbour).
      ctx.fillStyle = 'rgba(0,0,0,.32)';
      for (const b of g.balls) {
        if (!b.on) continue;
        ctx.beginPath();
        ctx.ellipse(b.x + R * 0.22, b.y + R * 0.3, R * 1.02, R * 0.94, 0, 0, TAU);
        ctx.fill();
      }
      for (const b of g.balls) if (b.on) drawBall(ctx, b.id, b.x, b.y, R, vis.get(b.id)!);
      for (const d of drops) {
        const k = Math.min(1, d.t / 0.25);
        ctx.globalAlpha = 1 - k * 0.8;
        drawBall(ctx, d.id, d.x + (d.px - d.x) * ease(k), d.y + (d.py - d.y) * ease(k), R * (1 - k * 0.55), vis.get(d.id)!);
        ctx.globalAlpha = 1;
      }
      // Ball in hand: a pulsing ring, and where an illegal spot would be.
      if (yours && g.ballInHand && c.on && !(drag?.kind === 'aim')) {
        ctx.setLineDash([0.7, 0.5]);
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 0.25;
        ctx.beginPath();
        ctx.arc(c.x, c.y, R + 1 + Math.sin(now * 5) * 0.3, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        if (ghost) {
          ctx.fillStyle = 'rgba(255,90,90,.45)';
          ctx.beginPath();
          ctx.arc(ghost.x, ghost.y, R, 0, TAU);
          ctx.fill();
        }
      }
      // The aim: dotted path, ghost ball, where the object ball and cue ball go.
      if (aim.show && c.on && (phase === 'aim' || phase === 'strike' || phase === 'ai')) {
        if (aim.who === 0 && phase !== 'strike') {
          const info = aimRay(g, aim.angle);
          const bad = info.hit !== null && !legal.includes(info.hit);
          const col = bad ? '255,110,110' : '255,255,255';
          ctx.strokeStyle = `rgba(${col},.85)`;
          ctx.lineWidth = 0.22;
          ctx.setLineDash([0.9, 0.7]);
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(info.x, info.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(info.x, info.y, R, 0, TAU);
          ctx.fillStyle = `rgba(${col},.12)`;
          ctx.fill();
          ctx.lineWidth = 0.18;
          ctx.stroke();
          if (info.hit !== null) {
            const h = ballOf(g, info.hit);
            ctx.strokeStyle = `rgba(${col},.75)`;
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.moveTo(h.x, h.y);
            ctx.lineTo(h.x + info.ox * 9, h.y + info.oy * 9);
            ctx.stroke();
            if (info.tx || info.ty) {
              ctx.strokeStyle = 'rgba(255,255,255,.35)';
              ctx.lineWidth = 0.18;
              ctx.beginPath();
              ctx.moveTo(info.x, info.y);
              ctx.lineTo(info.x + info.tx * 5, info.y + info.ty * 5);
              ctx.stroke();
            }
          }
        }
        drawStick(ctx, c.x, c.y, aim.angle, 0.5 + aim.power * 12);
      }
      ctx.restore();
      // Power meter on the right rail.
      if (aim.show && (phase === 'aim' || phase === 'ai' || phase === 'strike') && (aim.power > 0 || drag?.kind === 'aim')) {
        const x = cssW - RAIL * S * 0.72, w = RAIL * S * 0.44;
        const y0 = py(L * 0.2), h = py(L * 0.8) - y0;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.beginPath();
        ctx.roundRect(x, y0, w, h, w / 2);
        ctx.fill();
        const f = aim.power;
        const grad = ctx.createLinearGradient(0, y0 + h, 0, y0);
        grad.addColorStop(0, '#36c46b');
        grad.addColorStop(0.6, '#ffd23f');
        grad.addColorStop(1, '#ff4f4f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y0 + h * (1 - f), w, h * f, w / 2);
        ctx.fill();
        if (f > 0.02) {
          ctx.font = `900 ${Math.max(10, S * 2.2)}px "Lilita One", system-ui, sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,.6)';
          const ty = y0 + h * (1 - f);
          ctx.strokeText(`${Math.round(f * 100)}%`, x - 4, ty);
          ctx.fillStyle = '#fff';
          ctx.fillText(`${Math.round(f * 100)}%`, x - 4, ty);
        }
      }
    };

    const frame = () => {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const dt = fx.begin(ctx);
      update(dt);
      draw();
      fx.end(ctx);
    };

    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    fit();
    setSpin(0);
    renderPlayers();
    raf = requestAnimationFrame(frame);
    if (g.turn === 0) yourTurn();
    else void aiTurn(`${esc(foe.name)} breaks.`);

    return {
      over: () => g.over,
      destroy: () => {
        dead = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
      },
    };
  };

  if (opts.mode && !opts.stake) start();
  else setup();
}

// -------------------------------------------------------------- drawing

/** The table itself (rails, felt, pockets, diamonds), drawn once per size. */
function drawTable(mode: Mode, S: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(TW * S * dpr);
  c.height = Math.round(TH * S * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(S * dpr, 0, 0, S * dpr, RAIL * S * dpr, RAIL * S * dpr);
  // Wood rails.
  const wood = g.createLinearGradient(-RAIL, 0, W + RAIL, 0);
  wood.addColorStop(0, '#5e3519');
  wood.addColorStop(0.5, '#7a4722');
  wood.addColorStop(1, '#4a2911');
  g.fillStyle = wood;
  g.beginPath();
  g.roundRect(-RAIL, -RAIL, TW, TH, 2.4);
  g.fill();
  // Wood grain.
  g.strokeStyle = 'rgba(0,0,0,.12)';
  g.lineWidth = 0.08;
  for (let i = 0; i < 26; i++) {
    const x = -RAIL + ((i * 37) % 100) / 100 * TW;
    g.beginPath();
    g.moveTo(x, -RAIL);
    g.bezierCurveTo(x + 1.5, L * 0.3, x - 1.5, L * 0.6, x + 0.8, L + RAIL);
    g.stroke();
  }
  g.strokeStyle = '#e0b13a';
  g.lineWidth = 0.25;
  g.beginPath();
  g.roundRect(-RAIL + 0.3, -RAIL + 0.3, TW - 0.6, TH - 0.6, 2.1);
  g.stroke();
  // Cushions, then the felt.
  const [light, mid, dark] = FELT[mode];
  g.fillStyle = dark;
  g.fillRect(-1.2, -1.2, W + 2.4, L + 2.4);
  const felt = g.createRadialGradient(W / 2, L / 2, 4, W / 2, L / 2, L * 0.62);
  felt.addColorStop(0, light);
  felt.addColorStop(1, mid);
  g.fillStyle = felt;
  g.fillRect(0, 0, W, L);
  // Cushion nose highlight.
  g.strokeStyle = 'rgba(255,255,255,.08)';
  g.lineWidth = 0.15;
  g.strokeRect(0.1, 0.1, W - 0.2, L - 0.2);
  // Head string and foot spot.
  g.strokeStyle = 'rgba(255,255,255,.14)';
  g.lineWidth = 0.15;
  g.setLineDash([0.6, 0.6]);
  g.beginPath();
  g.moveTo(0, HEAD_Y);
  g.lineTo(W, HEAD_Y);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,255,255,.3)';
  g.beginPath();
  g.arc(FOOT.x, FOOT.y, 0.35, 0, TAU);
  g.fill();
  // Pockets.
  for (const p of POCKETS) {
    const x = p.side ? (p.x < W / 2 ? -1.1 : W + 1.1) : p.x < W / 2 ? -0.45 : W + 0.45;
    const y = p.side ? p.y : p.y < L / 2 ? -0.45 : L + 0.45;
    const r = p.side ? 2.15 : 2.45;
    g.fillStyle = '#c9a24a';
    g.beginPath();
    g.arc(x, y, r + 0.35, 0, TAU);
    g.fill();
    const hole = g.createRadialGradient(x, y, 0, x, y, r);
    hole.addColorStop(0, '#000');
    hole.addColorStop(0.75, '#0b0b0b');
    hole.addColorStop(1, '#262626');
    g.fillStyle = hole;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  // Diamonds.
  g.fillStyle = '#f3dc9a';
  const diamond = (x: number, y: number) => {
    g.beginPath();
    g.moveTo(x, y - 0.42);
    g.lineTo(x + 0.28, y);
    g.lineTo(x, y + 0.42);
    g.lineTo(x - 0.28, y);
    g.closePath();
    g.fill();
  };
  for (let k = 1; k < 8; k++) if (k !== 4) (diamond(-RAIL * 0.6, (L * k) / 8), diamond(W + RAIL * 0.6, (L * k) / 8));
  for (let k = 1; k < 4; k++) (diamond((W * k) / 4, -RAIL * 0.6), diamond((W * k) / 4, L + RAIL * 0.6));
  return c;
}

/** One ball, with a cheap rolling look: the number and stripe slide round as it rolls. */
function drawBall(g: CanvasRenderingContext2D, id: number, x: number, y: number, r: number, v: { ph: number; dx: number; dy: number }): void {
  const col = colorOf(id);
  const stripe = id >= 9;
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.clip();
  g.fillStyle = stripe ? BALL_COL[0] : col;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  const off = Math.sin(v.ph) * r * 0.55;
  const face = Math.cos(v.ph);
  if (stripe) {
    g.save();
    g.translate(x + v.dx * off * 0.5, y + v.dy * off * 0.5);
    g.rotate(Math.atan2(v.dy, v.dx) + Math.PI / 2);
    g.fillStyle = col;
    g.fillRect(-r * 1.6, -r * 0.5, r * 3.2, r * 1.0);
    g.restore();
  }
  if (id !== 0 && face > -0.35) {
    const k = 0.55 + 0.45 * Math.max(0, face);
    const cx = x + v.dx * off, cy = y + v.dy * off;
    g.fillStyle = '#fbf8ef';
    g.beginPath();
    g.arc(cx, cy, r * 0.5 * k, 0, TAU);
    g.fill();
    if (k > 0.7) {
      g.fillStyle = '#141414';
      g.font = `800 ${(r * 0.62 * k).toFixed(2)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(id), cx, cy + r * 0.04);
    }
  }
  if (id === 0) {
    // A red dot so you can see the cue ball roll.
    if (face > -0.2) {
      g.fillStyle = 'rgba(214,38,43,.75)';
      g.beginPath();
      g.arc(x + v.dx * off, y + v.dy * off, r * 0.14, 0, TAU);
      g.fill();
    }
  }
  const shine = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x - r * 0.2, y - r * 0.2, r * 1.15);
  shine.addColorStop(0, 'rgba(255,255,255,.75)');
  shine.addColorStop(0.25, 'rgba(255,255,255,.12)');
  shine.addColorStop(1, 'rgba(0,0,0,.38)');
  g.fillStyle = shine;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = 0.06;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.stroke();
}

/** The cue stick behind the cue ball, `gap` inches back from it. */
function drawStick(g: CanvasRenderingContext2D, x: number, y: number, angle: number, gap: number): void {
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const at = (d: number) => [x - ux * d, y - uy * d] as const;
  const t0 = R + gap;
  const seg = (a: number, b: number, w: number, col: string) => {
    const [x1, y1] = at(a), [x2, y2] = at(b);
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  g.lineCap = 'round';
  // Shadow.
  g.save();
  g.translate(0.6, 0.9);
  seg(t0, t0 + 58, 0.9, 'rgba(0,0,0,.28)');
  g.restore();
  seg(t0 + 0.25, t0 + 34, 0.5, '#ecd6a6'); // shaft
  seg(t0 + 34, t0 + 40, 0.66, '#1c1c1c'); // joint wrap
  seg(t0 + 40, t0 + 58, 0.86, '#5a2d12'); // butt
  seg(t0 + 44, t0 + 50, 0.88, '#e0b13a'); // gold inlay
  seg(t0 + 0.25, t0 + 0.9, 0.48, '#fbfbf5'); // ferrule
  seg(t0, t0 + 0.25, 0.44, '#3a7bd5'); // chalked tip
  g.lineCap = 'butt';
}
