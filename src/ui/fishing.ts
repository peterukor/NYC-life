// =====================================================================
// fishing.ts (ui) — Pier 84 (Peter, 2026-10-15). Rules: sim/fishing.ts.
//
// 1. CAST: a power meter bounces; tap to cast.
// 2. WAIT: the bobber floats… when it dips (🎣 BITE!), tap fast.
// 3. REEL: hold to reel in, let go to ease off. Keep the line tension in
//    the green: too tight and it snaps, too slack and the fish gets off.
//    Bigger fish pull harder and jerk the line.
// =====================================================================

import { esc } from '../core/format.ts';
import { DERBY_PRIZES, derbyBoard, derbyOpen, fishingOf, landFish, rollBite, type FishDef } from '../sim/fishing.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { html, onAct, openSheet, root } from './dom.ts';
import { money } from '../core/format.ts';

export interface FishHost {
  state: GameState;
  saved: () => void;
  onCatch?: (lb: number) => void;
}

export function goFishing(host: FishHost): void {
  const el = html(`
    <div class="mg-wrap" role="dialog" aria-label="Fishing">
      <div class="mg fish">
        <div class="art-top"><b>🎣 Pier 84</b><button class="btn ghost" data-act="close" aria-label="Done fishing">Done</button></div>
        <div class="fish-water" data-water><div class="fish-bob" data-bob>🔴</div></div>
        <div class="fish-meter" data-meter><i data-fill></i><b class="fish-green" data-green hidden></b></div>
        <div class="mg-msg" data-msg aria-live="polite">Tap to cast!</div>
        <button class="btn primary block mg-big" data-main>🎣 Cast</button>
        <p class="sub" data-sub>${derbyOpen() ? '🏆 The derby is on until 11 AM: your heaviest fish counts.' : 'The derby runs 6–11 AM.'} Caught so far: ${fishingOf(host.state).caught}</p>
      </div>
    </div>`);
  root().appendChild(el);
  const $ = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const msg = $('[data-msg]'), main = $<HTMLButtonElement>('[data-main]'), fill = $('[data-fill]'), green = $('[data-green]'), bob = $('[data-bob]');
  let phase: 'cast' | 'wait' | 'bite' | 'reel' | 'done' = 'cast';
  let raf = 0, last = performance.now(), t = 0;
  let power = 0, biteAt = 0, biteUntil = 0;
  let fish: FishDef | null = null, lb = 0;
  let tension = 0.4, dist = 1, holding = false, overT = 0, slackT = 0, jerk = 0;
  let closed = false;

  const setPhase = (p: typeof phase) => {
    phase = p;
    green.hidden = p !== 'reel';
    if (p === 'cast') {
      msg.textContent = 'Tap when the meter is high to cast far.';
      main.textContent = '🎣 Cast';
      bob.style.top = '40%';
    }
    if (p === 'wait') {
      msg.textContent = 'Waiting for a bite…';
      main.textContent = '⏳ …';
      biteAt = t + 1.5 + Math.random() * 4;
    }
    if (p === 'reel') {
      msg.innerHTML = '<b>Hold to reel!</b> Keep the tension in the green.';
      main.textContent = '🌀 Hold to reel';
      tension = 0.45;
      dist = 1;
      overT = slackT = 0;
    }
  };

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (phase === 'cast') {
      power = (Math.sin(t * 3.2) + 1) / 2;
      fill.style.width = `${power * 100}%`;
      fill.style.background = power > 0.75 ? '#2b9348' : power > 0.4 ? '#ffd166' : '#e63946';
    } else if (phase === 'wait') {
      bob.style.transform = `translateY(${Math.sin(t * 2) * 4}px)`;
      if (t >= biteAt) {
        phase = 'bite';
        biteUntil = t + 0.9;
        msg.innerHTML = '<b>🎣 BITE! Tap!</b>';
        main.textContent = '❗ Hook it!';
        bob.style.transform = 'translateY(18px)';
        sfx.notify();
      }
    } else if (phase === 'bite') {
      if (t > biteUntil) {
        msg.textContent = 'Too slow. It took the bait and left. Rude.';
        window.setTimeout(() => !closed && setPhase('cast'), 900);
        phase = 'done';
      }
    } else if (phase === 'reel' && fish) {
      const pull = 0.05 + fish.fight * 0.045;
      // Jerks: big fish yank the line now and then.
      jerk -= dt;
      if (jerk <= 0) {
        jerk = 0.6 + Math.random() * (2.4 - fish.fight * 0.3);
        tension += 0.06 + fish.fight * 0.05 * Math.random();
      }
      tension += (holding ? 0.42 + pull : -0.5) * dt;
      tension = Math.max(0, Math.min(1.2, tension));
      if (holding && tension < 0.95) dist -= dt * (0.32 - fish.fight * 0.035) * (0.8 + power * 0.4);
      overT = tension > 0.95 ? overT + dt : 0;
      slackT = tension < 0.12 ? slackT + dt : 0;
      fill.style.width = `${Math.min(100, tension * 100)}%`;
      fill.style.background = tension > 0.95 ? '#e63946' : tension < 0.12 ? '#9aa0b5' : '#2a9d8f';
      bob.style.top = `${20 + dist * 50}%`;
      if (overT > 0.45) {
        sfx.bad();
        msg.textContent = `SNAP. The line broke. Something big is out there laughing at you.`;
        phase = 'done';
        window.setTimeout(() => !closed && setPhase('cast'), 1400);
      } else if (slackT > 2) {
        msg.textContent = 'Too slack: it shook the hook and swam off.';
        phase = 'done';
        window.setTimeout(() => !closed && setPhase('cast'), 1400);
      } else if (dist <= 0) {
        const line = landFish(host.state, fish, lb);
        host.saved();
        host.onCatch?.(lb);
        fish.fight >= 4 ? sfx.cheer() : sfx.win();
        msg.innerHTML = `<b>Landed!</b> ${esc(line)}`;
        main.textContent = '🎣 Cast again';
        phase = 'done';
        window.setTimeout(() => {
          if (!closed) {
            phase = 'cast';
            green.hidden = true;
          }
        }, 300);
        el.querySelector('[data-sub]')!.textContent = `Caught so far: ${fishingOf(host.state).caught}${derbyOpen() ? ' · 🏆 derby on until 11 AM' : ''}`;
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const press = () => {
    if (phase === 'cast') {
      sfx.whoosh();
      bob.style.top = `${60 - power * 30}%`;
      setPhase('wait');
    } else if (phase === 'bite') {
      const r = rollBite();
      // A long cast reaches bigger fish now and then.
      if (power > 0.8 && Math.random() < 0.3) {
        const r2 = rollBite();
        if (r2.lb > r.lb) Object.assign(r, r2);
      }
      fish = r.fish;
      lb = r.lb;
      sfx.tap();
      setPhase('reel');
      msg.innerHTML = `<b>Hooked something${fish.fight >= 4 ? ' HEAVY' : ''}!</b> Hold to reel, keep it green.`;
    }
  };
  main.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (phase === 'reel') holding = true;
    else press();
  });
  const up = () => (holding = false);
  main.addEventListener('pointerup', up);
  main.addEventListener('pointerleave', up);
  main.addEventListener('pointercancel', up);
  const key = (e: KeyboardEvent) => {
    if (e.key !== ' ') return;
    e.preventDefault();
    if (e.type === 'keydown') {
      if (phase === 'reel') holding = true;
      else if (!e.repeat) press();
    } else holding = false;
  };
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', key);
  onAct(el, (act) => {
    if (act !== 'close') return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', key);
    window.removeEventListener('keyup', key);
    el.remove();
  });
}

/** This morning's derby board. */
export function openDerby(host: FishHost): void {
  const s = host.state;
  const board = derbyBoard(s);
  openSheet({
    emoji: '🏆',
    title: 'Pier 84 Morning Derby',
    sub: derbyOpen() ? 'On now · ends 11 AM' : 'Runs 6–11 AM every morning',
    body: `<p class="blurb">Heaviest fish by 11 AM wins. Prizes: 🥇 ${money(DERBY_PRIZES[0])} · 🥈 ${money(DERBY_PRIZES[1])} · 🥉 ${money(DERBY_PRIZES[2])}. Paid when it ends.</p>
      <div class="travel">${board.map((r, i) => `<div class="opt" style="${r.you ? 'border-color:var(--ink);background:#fff3c4' : ''}"><span style="font-size:22px">${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span><span class="grow"><b>${esc(r.name)}${r.you ? ' (you)' : ''}</b></span><span class="cost">${r.lb} lb</span></div>`).join('')}</div>
      ${fishingOf(s).best ? `<p class="sub">Your record: ${fishingOf(s).best!.lb} lb.</p>` : ''}`,
  });
}
