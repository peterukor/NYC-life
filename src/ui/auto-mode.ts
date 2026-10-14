// =====================================================================
// auto-mode.ts — the screen where you set up AUTO MODE (sim/auto.ts).
//
// Pick up to AUTO.maxRoutine tasks; switch it on; close the game. The
// screen explains the rules up front, in plain words, so nobody is
// surprised: it can't fill every bar, and too long on autopilot makes
// you feel stuck in a rut.
// =====================================================================

import { ACTIONS } from '../data/actions.ts';
import { esc } from '../core/format.ts';
import { AUTO, ROUTINE_CHOICES, setAuto } from '../sim/auto.ts';
import type { GameState } from '../sim/types.ts';
import { openSheet, toast } from './dom.ts';

export function openAutoMode(s: GameState, save: () => void): void {
  let pick = s.auto.routine.length ? [...s.auto.routine] : ['sleep', 'snack', 'shower'];
  const sheet = openSheet({ emoji: '🤖', title: 'Auto mode', sub: 'Your character lives a simple routine while you’re away', body: '<div class="auto"></div>' });
  const host = sheet.body.querySelector<HTMLElement>('.auto')!;
  const render = () => {
    host.innerHTML = `
      <div class="card">
        <p style="margin:0 0 8px">Pick up to ${AUTO.maxRoutine} things to repeat every ${AUTO.cycleHours} hours while the game is closed.</p>
        <div class="auto-chips">${ROUTINE_CHOICES.map((id) => {
          const a = ACTIONS[id];
          return `<button class="chip${pick.includes(id) ? ' on' : ''}" data-id="${id}">${a.emoji} ${esc(a.label)}</button>`;
        }).join('')}</div>
      </div>
      <ul class="auto-rules">
        <li>🔋 A routine can’t fill every bar — one need always stays low.</li>
        <li>🌧️ About ${AUTO.bluesAfterDays} real days on autopilot and you’ll feel stuck in a rut. Shake it off by doing ${AUTO.varietyPerDay}+ different things a day for ${AUTO.recoveryDays} game days.</li>
        <li>💵 It only spends money you have. Never goes into debt.</li>
      </ul>
      ${s.auto.blues ? '<p class="blurb" style="color:var(--bad)">You’re in a rut right now. Go do something new!</p>' : ''}
      <button class="btn ${s.auto.on ? '' : 'primary'} block" data-toggle>${s.auto.on ? '⏹ Turn auto mode off' : '▶ Turn auto mode on'}</button>`;
  };
  host.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (chip) {
      const id = chip.dataset.id!;
      pick = pick.includes(id) ? pick.filter((x) => x !== id) : pick.length < AUTO.maxRoutine ? [...pick, id] : pick;
      if (s.auto.on) setAuto(s, true, pick);
      save();
      return render();
    }
    if ((e.target as HTMLElement).closest('[data-toggle]')) {
      if (!s.auto.on && !pick.length) return toast('Pick at least one task first', { icon: '🤖' });
      setAuto(s, !s.auto.on, pick);
      save();
      toast(s.auto.on ? 'Auto mode on. See you later!' : 'Auto mode off', { icon: '🤖', tone: 'good' });
      render();
    }
  });
  render();
}
