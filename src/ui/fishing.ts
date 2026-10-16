// =====================================================================
// fishing.ts (ui) — Pier 84 (Peter, 2026-10-15; more fun 2026-10-16,
// borrowing from Stardew Valley and Animal Crossing). Rules: sim/fishing.ts.
//
// 1. CAST: the power meter bounces; tap high for a long cast (PERFECT
//    CAST reaches the big ones more often).
// 2. WAIT: the bobber nibbles… don't fall for it! Tap on a nibble and the
//    fish gets spooked. On the real BITE (❗ and a big splash) tap fast:
//    under 0.35 s is a PERFECT HOOK (calmer line to start).
// 3. REEL: hold to reel, let go to ease off. Keep the tension in the
//    green; the gold band is the sweet spot. Fish make RUNS (the line
//    jerks hard: let go!). Sometimes a 🎁 shows up: keep the line in the
//    sweet spot to fill the treasure bar before you land the fish.
//    Never leave the green = PERFECT CATCH (+25% at the fish guy).
// Catch three in a row without losing one for a 🔥 streak.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { DERBY_PRIZES, derbyBoard, derbyOpen, fishingOf, landFish, landTreasure, rollBite, type FishDef } from '../sim/fishing.ts';
import { changeMoney } from '../sim/economy.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { html, onAct, openSheet, root } from './dom.ts';
import { burstAt, buzz, popAt, shakeEl } from './juice.ts';

export interface FishHost {
  state: GameState;
  saved: () => void;
  onCatch?: (lb: number) => void;
}

const GREEN = [0.18, 0.9] as const;
const SWEET = [0.45, 0.72] as const;

export function goFishing(host: FishHost): void {
  const el = html(`
    <div class="mg-wrap" role="dialog" aria-label="Fishing">
      <div class="mg fish">
        <div class="art-top"><b>🎣 Pier 84</b><span class="fish-streak" data-streak></span><button class="btn ghost" data-act="close" aria-label="Done fishing">Done</button></div>
        <div class="fish-water" data-water>
          <div class="fish-shadow" data-fishshadow hidden>🐟</div>
          <div class="fish-bob" data-bob>🔴</div>
          <div class="fish-alert" data-alert hidden>❗</div>
          <div class="fish-chest" data-chest hidden>🎁<i data-chestbar></i></div>
        </div>
        <div class="fish-meter" data-meter><b class="fish-green" data-green hidden></b><b class="fish-sweet" data-sweet hidden></b><i data-fill></i></div>
        <div class="fish-dist" data-dist hidden><i data-distbar></i><span>🎣</span></div>
        <div class="mg-msg" data-msg aria-live="polite">Tap to cast!</div>
        <button class="btn primary block mg-big" data-main>🎣 Cast</button>
        <p class="sub" data-sub>${derbyOpen() ? '🏆 The derby is on until 11 AM: your heaviest fish counts.' : 'The derby runs 6–11 AM.'} Caught so far: ${fishingOf(host.state).caught}</p>
      </div>
    </div>`);
  root().appendChild(el);
  const $ = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const msg = $('[data-msg]'), main = $<HTMLButtonElement>('[data-main]'), fill = $('[data-fill]'), green = $('[data-green]'), sweet = $('[data-sweet]'), bob = $('[data-bob]');
  const water = $('[data-water]'), alertEl = $('[data-alert]'), chest = $('[data-chest]'), chestBar = $('[data-chestbar]'), shadow = $('[data-fishshadow]'), dist = $('[data-dist]'), distBar = $('[data-distbar]');
  let phase: 'cast' | 'wait' | 'bite' | 'reel' | 'done' = 'cast';
  let raf = 0, last = performance.now(), t = 0;
  let power = 0, biteAt = 0, biteStart = 0, biteUntil = 0, nibbleAt = 0, nibbling = 0;
  let fish: FishDef | null = null, lb = 0;
  let tension = 0.4, far = 1, holding = false, overT = 0, slackT = 0, jerk = 0, runT = 0, perfect = true, treasure = -1, fishX = 0.5;
  let streak = 0, closed = false;
  green.style.left = `${GREEN[0] * 100}%`;
  green.style.width = `${(GREEN[1] - GREEN[0]) * 100}%`;
  sweet.style.left = `${SWEET[0] * 100}%`;
  sweet.style.width = `${(SWEET[1] - SWEET[0]) * 100}%`;

  const setStreak = () => ($('[data-streak]').textContent = streak >= 2 ? `🔥 ${streak} in a row` : '');
  const splash = (big = false) => burstAt(bob, big ? ['💦', '💧', '🌊'] : ['💧'], big ? 10 : 4);
  const setPhase = (p: typeof phase) => {
    phase = p;
    green.hidden = sweet.hidden = p !== 'reel';
    dist.hidden = p !== 'reel';
    alertEl.hidden = true;
    if (p !== 'reel') {
      chest.hidden = true;
      shadow.hidden = true;
    }
    if (p === 'cast') {
      msg.textContent = 'Tap when the meter is high to cast far.';
      main.textContent = '🎣 Cast';
      bob.style.top = '40%';
      bob.style.left = '50%';
    }
    if (p === 'wait') {
      msg.textContent = 'Waiting for a bite… (nibbles don’t count!)';
      main.textContent = '⏳ Wait for ❗';
      biteAt = t + 2 + Math.random() * 4.5;
      nibbleAt = t + 0.8 + Math.random() * 1.2;
    }
    if (p === 'reel') {
      main.textContent = '🌀 Hold to reel';
      far = 1;
      overT = slackT = runT = 0;
      perfect = true;
      fishX = 0.5;
      // Sometimes there's treasure down there with it.
      treasure = Math.random() < 0.2 ? 0 : -1;
      chest.hidden = treasure < 0;
      shadow.hidden = false;
      shadow.textContent = fish!.emoji;
    }
  };
  const lose = (text: string) => {
    sfx.bad();
    msg.innerHTML = text;
    if (streak >= 2) popAt(water, 'streak lost', { color: '#aaa', size: 18 });
    streak = 0;
    setStreak();
    phase = 'done';
    window.setTimeout(() => !closed && setPhase('cast'), 1400);
  };

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (phase === 'cast') {
      power = (Math.sin(t * 3.4) + 1) / 2;
      fill.style.width = `${power * 100}%`;
      fill.style.background = power > 0.9 ? '#ffd23f' : power > 0.7 ? '#2b9348' : power > 0.4 ? '#ffd166' : '#e63946';
    } else if (phase === 'wait') {
      // Nibbles: a little twitch that's NOT a bite.
      if (t >= nibbleAt && t < biteAt - 0.6) {
        nibbling = 0.3;
        nibbleAt = t + 0.9 + Math.random() * 1.6;
        sfx.tick();
      }
      nibbling = Math.max(0, nibbling - dt);
      bob.style.transform = `translateY(${Math.sin(t * 2) * 4 + (nibbling > 0 ? 7 : 0)}px)`;
      if (t >= biteAt) {
        phase = 'bite';
        biteStart = t;
        biteUntil = t + 0.85;
        alertEl.hidden = false;
        msg.innerHTML = '<b>❗ BITE! TAP!</b>';
        main.textContent = '❗ HOOK IT!';
        bob.style.transform = 'translateY(22px)';
        splash(true);
        shakeEl(water);
        buzz(40);
        sfx.notify();
      }
    } else if (phase === 'bite') {
      if (t > biteUntil) lose('Too slow. It took the bait and left. Rude.');
    } else if (phase === 'reel' && fish) {
      // Fish runs: a hard yank you have to give line to.
      jerk -= dt;
      if (jerk <= 0) {
        jerk = 0.7 + Math.random() * (2.6 - fish.fight * 0.3);
        if (fish.fight >= 3 && Math.random() < 0.35) {
          runT = 0.9 + fish.fight * 0.15;
          msg.innerHTML = '<b>🐟 IT’S RUNNING! Let go!</b>';
          shakeEl(water, true);
        } else tension += 0.06 + fish.fight * 0.05 * Math.random();
      }
      const pull = 0.05 + fish.fight * 0.045 + (runT > 0 ? 0.55 : 0);
      runT = Math.max(0, runT - dt);
      tension += (holding ? 0.42 + pull : -0.5 + (runT > 0 ? 0.35 : 0)) * dt;
      tension = Math.max(0, Math.min(1.2, tension));
      const inGreen = tension >= GREEN[0] && tension <= GREEN[1];
      const inSweet = tension >= SWEET[0] && tension <= SWEET[1];
      if (!inGreen) perfect = false;
      if (holding && tension < GREEN[1]) far -= dt * (0.32 - fish.fight * 0.035) * (0.8 + power * 0.4) * (inSweet ? 1.25 : 1);
      if (runT > 0) far = Math.min(1, far + dt * 0.08);
      // Treasure fills while you hold the sweet spot.
      if (treasure >= 0 && treasure < 1) {
        if (inSweet) treasure = Math.min(1, treasure + dt * 0.45);
        chestBar.style.width = `${treasure * 100}%`;
        if (treasure >= 1) {
          chest.classList.add('got');
          popAt(chest, 'TREASURE!', { color: '#ffd23f', size: 20 });
          sfx.chime();
        }
      }
      overT = tension > GREEN[1] + 0.05 ? overT + dt : 0;
      slackT = tension < GREEN[0] - 0.06 ? slackT + dt : 0;
      fill.style.width = `${Math.min(100, (tension / 1.0) * 100)}%`;
      fill.style.background = tension > GREEN[1] ? '#e63946' : tension < GREEN[0] ? '#9aa0b5' : inSweet ? '#ffd23f' : '#2a9d8f';
      // The fish thrashes about in the water.
      fishX += (Math.sin(t * (1.5 + fish.fight)) * 0.02 + (Math.random() - 0.5) * 0.01) * (runT > 0 ? 3 : 1);
      fishX = Math.max(0.12, Math.min(0.88, fishX));
      const y = 22 + far * 52;
      bob.style.top = `${y}%`;
      bob.style.left = `${fishX * 100}%`;
      shadow.style.top = `${y + 10}%`;
      shadow.style.left = `${fishX * 100}%`;
      distBar.style.width = `${(1 - far) * 100}%`;
      if (overT > 0.45) lose('SNAP. The line broke. Something big is out there laughing at you.');
      else if (slackT > 2) lose('Too slack: it shook the hook and swam off.');
      else if (far <= 0) landed();
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const landed = () => {
    if (!fish) return;
    phase = 'done';
    const junk = fish.perLb === 0 && fish.fight < 5;
    const line = landFish(host.state, fish, lb, { perfect });
    const extra: string[] = [];
    if (treasure >= 1) extra.push(landTreasure(host.state));
    if (!junk) {
      streak++;
      setStreak();
      if (streak >= 3) {
        const bonus = 500 * Math.min(5, streak - 2);
        changeMoney(host.state, bonus, '🎣 Catch streak');
        extra.push(`🔥 ${streak} in a row: +$${bonus / 100} streak bonus.`);
      }
    }
    host.saved();
    host.onCatch?.(lb);
    const big = fish.fight >= 4;
    big ? sfx.cheer() : sfx.win();
    burstAt(bob, junk ? ['💧', fish.emoji] : [fish.emoji, '💦', '✨'], big ? 16 : 9);
    popAt(water, `${fish.emoji} ${lb} lb`, { color: '#fff', size: big ? 34 : 26 });
    if (perfect && !junk) window.setTimeout(() => popAt(water, 'PERFECT CATCH!', { color: '#ffd23f', y: 40 }), 250);
    if (big) shakeEl(el.querySelector('.mg')!, true);
    msg.innerHTML = `<b>${junk ? 'Uh… landed?' : 'Landed!'}</b> ${esc(line)}${extra.map((x) => `<br>${esc(x)}`).join('')}`;
    main.textContent = '🎣 Cast again';
    window.setTimeout(() => {
      if (!closed) {
        phase = 'cast';
        green.hidden = sweet.hidden = dist.hidden = chest.hidden = shadow.hidden = true;
        chest.classList.remove('got');
      }
    }, 300);
    el.querySelector('[data-sub]')!.textContent = `Caught so far: ${fishingOf(host.state).caught}${derbyOpen() ? ' · 🏆 derby on until 11 AM' : ''}`;
  };

  const press = () => {
    if (phase === 'cast') {
      sfx.whoosh();
      const perfectCast = power > 0.9;
      bob.style.top = `${60 - power * 30}%`;
      if (perfectCast) popAt(water, 'PERFECT CAST!', { color: '#ffd23f', size: 22 });
      window.setTimeout(() => splash(), 250);
      setPhase('wait');
    } else if (phase === 'wait') {
      // Struck on a nibble: spooked.
      lose('Too early! You yanked on a nibble and spooked it. 🐟💨');
    } else if (phase === 'bite') {
      const react = t - biteStart;
      const r = rollBite();
      // A long cast reaches bigger fish now and then.
      if (power > 0.8 && Math.random() < (power > 0.9 ? 0.5 : 0.3)) {
        const r2 = rollBite();
        if (r2.lb > r.lb && r2.fish.perLb > 0) Object.assign(r, r2);
      }
      fish = r.fish;
      lb = r.lb;
      const perfectHook = react < 0.35;
      tension = perfectHook ? 0.55 : 0.75;
      sfx.tap();
      setPhase('reel');
      if (perfectHook) popAt(water, 'PERFECT HOOK!', { color: '#7bd88f', size: 22 });
      msg.innerHTML = `<b>Hooked something${fish.fight >= 4 ? ' HEAVY' : ''}!</b> Hold to reel. Gold = sweet spot.`;
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
