// =====================================================================
// systems.ts — the plug-in board for things that RUN (not just data).
//
// A "system" is a self-contained piece of the game that does work over
// time: weather effects, traffic, flood water, fireworks on New Year's,
// a parade, a mini-game in the street… Each system lives in its own file
// and registers itself here. The game calls every registered system at
// the right moments, so adding one never means editing game.ts.
//
// LIFECYCLE (all optional):
//   areaLoaded(ctx)   — an area (Manhattan, Brooklyn…) was just built:
//                       create your meshes and add them to ctx.scene
//   update(dt, ctx)   — every frame while walking around the city
//   tick(ctx)         — once a second (cheap game logic)
//   areaUnloaded()    — the area is going away: remove/dispose your stuff
//
// TO ADD A SYSTEM: create a file that calls SYSTEMS.add({...}) and import
// it once from systems/index.ts. TO REMOVE ONE: delete that import line.
// A system that throws is switched off (with a console warning) instead
// of crashing the game.
// =====================================================================

import type * as THREE from 'three';
import type { DistrictDef } from '../world/layout.ts';
import type { QualitySettings } from '../render/quality.ts';
import type { GameState } from '../sim/types.ts';
import type { NycTime } from './clock.ts';
import { Registry } from './registry.ts';

/** What a system gets to work with. Read-only by convention. */
export interface SystemContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Where the player's character stands. */
  player: THREE.Vector3;
  district: DistrictDef;
  quality: QualitySettings;
  state: GameState;
  time: NycTime;
  /** Today's weather id (see sim/weather.ts). */
  weather: string;
}

export interface GameSystem {
  id: string;
  /** Lower runs first (default 100). */
  order?: number;
  areaLoaded?: (ctx: SystemContext) => void;
  update?: (dt: number, ctx: SystemContext) => void;
  tick?: (ctx: SystemContext) => void;
  areaUnloaded?: () => void;
}

export const SYSTEMS = new Registry<GameSystem>('system');

/** Runs every registered system safely. Owned by game.ts. */
export class SystemRunner {
  private broken = new Set<string>();
  private timer = 0;

  private list(): GameSystem[] {
    return SYSTEMS.all()
      .filter((s) => !this.broken.has(s.id))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  private safe(s: GameSystem, what: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.broken.add(s.id);
      console.warn(`[systems] "${s.id}" failed in ${what} and was switched off:`, err);
    }
  }

  areaLoaded(ctx: SystemContext): void {
    for (const s of this.list()) if (s.areaLoaded) this.safe(s, 'areaLoaded', () => s.areaLoaded!(ctx));
  }

  areaUnloaded(): void {
    for (const s of this.list()) if (s.areaUnloaded) this.safe(s, 'areaUnloaded', () => s.areaUnloaded!());
  }

  update(dt: number, ctx: SystemContext): void {
    const list = this.list();
    for (const s of list) if (s.update) this.safe(s, 'update', () => s.update!(dt, ctx));
    this.timer += dt;
    if (this.timer >= 1) {
      this.timer = 0;
      for (const s of list) if (s.tick) this.safe(s, 'tick', () => s.tick!(ctx));
    }
  }
}
