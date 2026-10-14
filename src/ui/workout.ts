// =====================================================================
// workout.ts (ui) — "Train hard": the gym mini-game (sim/workout.ts).
// A marker slides up and down the bar; tap when it's in the green to
// make the rep. The lifter on screen pushes the weight up on a clean rep
// and shakes on a miss. 12 reps.
// =====================================================================

import { WORKOUT_REPS, finishWorkout, zoneFor } from '../sim/workout.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { rain } from './casino.ts';
import { openModal } from './dom.ts';

export function openWorkout(s: GameState, label: string, saved: () => void): void {
  const m = openModal(`<div class="wo">
    <h2>💪 ${label}</h2>
    <p class="sub">Tap when the marker is in the green. ${WORKOUT_REPS} reps.</p>
    <div class="wo-stage"><div class="wo-lifter" aria-hidden="true">🏋️</div><div class="wo-bar"><i class="wo-zone"></i><b class="wo-mark"></b></div></div>
    <div class="wo-count" aria-live="polite">0 / ${WORKOUT_REPS}</div>
    <button class="btn primary block wo-go" data-rep>Lift!</button>
    <button class="btn ghost block" data-close>Rack it</button>
  </div>`);
  m.el.classList.add('wo-modal');
  const zone = m.el.querySelector<HTMLElement>('.wo-zone')!;
  const mark = m.el.querySelector<HTMLElement>('.wo-mark')!;
  const lifter = m.el.querySelector<HTMLElement>('.wo-lifter')!;
  const count = m.el.querySelector<HTMLElement>('.wo-count')!;
  let rep = 0, clean = 0, raf = 0, done = false, zoneAt = 0.4, size = zoneFor(0, s.skills.fitness);
  const t0 = performance.now();
  const pos = () => {
    // Speeds up a little each rep.
    const t = (performance.now() - t0) / 1000;
    return 0.5 + 0.5 * Math.sin(t * (2.4 + rep * 0.12));
  };
  const placeZone = () => {
    size = zoneFor(rep, s.skills.fitness);
    zoneAt = 0.1 + Math.random() * (0.8 - size);
    zone.style.bottom = `${zoneAt * 100}%`;
    zone.style.height = `${size * 100}%`;
  };
  placeZone();
  const loop = () => {
    if (done) return;
    mark.style.bottom = `${pos() * 100}%`;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const finish = () => {
    done = true;
    cancelAnimationFrame(raf);
    const r = finishWorkout(s, clean);
    saved();
    const go = m.el.querySelector<HTMLElement>('[data-rep]')!;
    go.hidden = true;
    count.innerHTML = `<b>${clean}/${WORKOUT_REPS} clean reps</b> · +${r.gain.toFixed(1)} fitness${r.pump ? ' · 💪 the pump is real' : ''}`;
    if (r.pump) (sfx.win(), rain(m.el, '💪', 14));
  };
  m.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) {
      if (!done && rep > 0) finish();
      cancelAnimationFrame(raf);
      return m.close();
    }
    if (!t.closest('[data-rep]') || done) return;
    const p = pos();
    const ok = p >= zoneAt && p <= zoneAt + size;
    rep++;
    if (ok) clean++;
    lifter.classList.remove('up', 'shake');
    void lifter.offsetWidth;
    lifter.classList.add(ok ? 'up' : 'shake');
    ok ? sfx.note(392 + clean * 30) : sfx.bad();
    count.textContent = `${clean} clean · ${rep} / ${WORKOUT_REPS}`;
    if (rep >= WORKOUT_REPS) return finish();
    placeZone();
  });
}
