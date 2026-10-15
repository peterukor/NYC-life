// =====================================================================
// soundscape.ts — what the city and each room sound like, footsteps, and
// the sound of what you're doing (Peter, 2026-10-14: "add sounds").
//
// game.ts calls soundscape.update() every frame with where you are and
// what you're doing. Peter (2026-10-14): music, not noise — so the
// background is the soundtrack (ui/music.ts, 7 songs on shuffle), plus
// footsteps and little sounds for what you're doing (typing, guitar,
// piano, games, weights). All synthesised (ui/audio.ts).
// =====================================================================

import { burst, note, sfx, soundReady } from './audio.ts';
import { music } from './music.ts';

export type Scene = 'city' | 'transit' | 'apartment' | 'bodega' | 'pizza' | 'cafe' | 'bar' | 'club' | 'office' | 'gym' | 'comedy' | 'furniture' | 'alley' | 'precinct' | 'arcade' | 'casino' | 'park' | 'none';

export interface SoundInput {
  scene: Scene;
  hour: number;
  /** Walking speed (0 = standing). */
  speed: number;
  /** What you're doing (an action id) or null. */
  activity: string | null;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);

/** Ticks while doing something rhythmic (typing, guitar, piano, games). */
function activityTick(id: string): ((n: number) => void) | null {
  if (/code|freelance|laptop|sellOnline|doomscroll/i.test(id)) return () => burst(0, 0.03, { type: 'bandpass', freq: r(2500, 4500), q: 2, gain: 0.05, out: 'loops' });
  if (/guitar|busk/i.test(id)) return (n) => [196, 247, 294, 392].forEach((f, i) => note(f * [1, 1.122, 1.335, 0.89][n % 4], i * 0.02, 0.9, 'triangle', 0.02, 'loops'));
  if (/piano/i.test(id)) return (n) => note([523, 587, 659, 784, 880, 784, 659, 587][n % 8], 0, 0.6, 'triangle', 0.04, 'loops');
  if (/gameConsole/i.test(id)) return (n) => note([440, 660, 880, 550][n % 4], 0, 0.06, 'square', 0.015, 'loops');
  if (/benchPress|workout|punchBag|trainHard/i.test(id)) return () => burst(0, 0.1, { type: 'lowpass', freq: 500, gain: 0.12, brown: true, out: 'loops' });
  return null;
}
const TICK_EVERY: [RegExp, number][] = [[/code|freelance|laptop|sellOnline|doomscroll/i, 0.12], [/guitar|busk/i, 0.9], [/piano/i, 0.38], [/gameConsole/i, 0.25], [/benchPress|workout|punchBag|trainHard/i, 1.4]];

class Soundscape {
  private loopFor: string | null = null;
  private tickIn = 0;
  private tickN = 0;
  private stepIn = 0;

  update(dt: number, s: SoundInput): void {
    if (!soundReady() || document.hidden) return;
    // ---- the soundtrack (ui/music.ts): starts after your first tap, then shuffles forever
    music.start();
    // ---- what you're doing
    const act = s.activity;
    if (act !== this.loopFor) {
      // Leaving the bathroom: the toilet flushes.
      if (this.loopFor && /toilet|publicRestroom/i.test(this.loopFor)) burst(0, 1.6, { type: 'lowpass', freq: 900, sweepTo: 250, gain: 0.25, attack: 0.15, out: 'loops' });
      if (act && /shower|soak/i.test(act)) sfx.done();
      this.loopFor = act;
      this.tickIn = 0.2;
      this.tickN = 0;
    }
    if (act) {
      const tick = activityTick(act);
      if (tick && (this.tickIn -= dt) <= 0) {
        const every = TICK_EVERY.find(([re]) => re.test(act))?.[1] ?? 0.5;
        this.tickIn = every * r(0.6, 1.4);
        tick(this.tickN++);
      }
    }
    // ---- footsteps
    if (s.speed > 0.2 && !act) {
      this.stepIn -= dt;
      if (this.stepIn <= 0) {
        this.stepIn = Math.max(0.22, 0.95 / Math.max(1, s.speed));
        sfx.step(s.scene === 'city' || s.scene === 'alley' || s.scene === 'park');
      }
    } else this.stepIn = 0.05;
  }

  /** Stop everything (sound switched off). */
  silence(): void {
    music.stop();
    this.loopFor = null;
  }
}

export const soundscape = new Soundscape();
