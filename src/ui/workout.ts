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
import { burstAt, popAt, shakeEl } from './juice.ts';

export function openWorkout(s: GameState, label: string, saved: () => void): void {
  const m = openModal(`<div class="wo">
    <h2>💪 ${label}</h2>
    <p class="sub">Tap when the marker is in the green. ${WORKOUT_REPS} reps.</p>
    <div class="wo-stage"><div class="wo-coach" aria-live="polite"><span>🧔</span><em>Let’s get it.</em></div><div class="wo-lifter" aria-hidden="true">🏋️</div><div class="wo-bar"><i class="wo-zone"><i class="wo-perfect"></i></i><b class="wo-mark"></b></div></div>
    <div class="wo-count" aria-live="polite">0 / ${WORKOUT_REPS}</div>
    <button class="btn primary block wo-go" data-rep>Lift!</button>
    <button class="btn ghost block" data-close>Rack it</button>
  </div>`);
  m.el.classList.add('wo-modal');
  const zone = m.el.querySelector<HTMLElement>('.wo-zone')!;
  const mark = m.el.querySelector<HTMLElement>('.wo-mark')!;
  const lifter = m.el.querySelector<HTMLElement>('.wo-lifter')!;
  const count = m.el.querySelector<HTMLElement>('.wo-count')!;
  let rep = 0, clean = 0, perfect = 0, run = 0, raf = 0, done = false, zoneAt = 0.4, size = zoneFor(0, s.skills.fitness);
  const coach = m.el.querySelector<HTMLElement>('.wo-coach em')!;
  const say = (lines: string[]) => (coach.textContent = lines[Math.floor(Math.random() * lines.length)]);
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
    const r = finishWorkout(s, clean, perfect);
    saved();
    const go = m.el.querySelector<HTMLElement>('[data-rep]')!;
    go.hidden = true;
    count.innerHTML = `<b>${clean}/${WORKOUT_REPS} clean reps</b>${perfect ? ` · ✨ ${perfect} perfect` : ''} · +${r.gain.toFixed(1)} fitness${r.pump ? ' · 💪 the pump is real' : ''}`;
    say(clean === WORKOUT_REPS ? ['FLAWLESS. I’m telling the whole gym.', 'Somebody call Marvel.'] : r.pump ? ['LIGHT WEIGHT, BABY!', 'That’s a set. Go eat something.'] : ['We’ll get ’em next time.', 'Rest day tomorrow. Mandatory.']);
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
    const centre = ok && Math.abs(p - (zoneAt + size / 2)) < size * 0.18;
    rep++;
    if (ok) (clean++, run++);
    else run = 0;
    if (centre) perfect++;
    lifter.classList.remove('up', 'shake');
    void lifter.offsetWidth;
    lifter.classList.add(ok ? 'up' : 'shake');
    ok ? sfx.note(392 + clean * 30) : sfx.bad();
    if (centre) {
      popAt(lifter, 'PERFECT FORM ✨', { color: '#ffd23f', size: 20 });
      burstAt(lifter, ['💪', '✨'], 6);
    } else if (ok) popAt(lifter, run >= 4 ? `${run} IN A ROW 🔥` : 'CLEAN!', { color: '#2b9348', size: 18 });
    else {
      burstAt(lifter, '💦', 5);
      shakeEl(lifter);
    }
    say(!ok ? ['Shake it off!', 'Breathe. Again.', 'That one didn’t count, champ.', 'Ego lifting detected.'] : run >= 6 ? ['BEAST MODE!', 'Who IS this?!', 'LIGHT WEIGHT!'] : rep >= WORKOUT_REPS - 1 ? ['LAST ONE! ALL YOU!'] : ['Good rep!', 'Yeah buddy!', 'Squeeze!', 'One more!']);
    count.textContent = `${clean} clean · ${rep} / ${WORKOUT_REPS}`;
    if (rep >= WORKOUT_REPS) return finish();
    placeZone();
  });
}
