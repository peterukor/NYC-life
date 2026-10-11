// =====================================================================
// traffic-system.ts — plugs the moving traffic (world/traffic.ts) into
// the game. Which vehicles drive, how often and how fast is data in
// data/vehicles.ts; how many cars depends on the phone's quality tier.
// Rush hour slows everyone down.
// =====================================================================

import { isRushHour } from '../core/clock.ts';
import { SYSTEMS } from '../core/systems.ts';
import { Traffic } from '../world/traffic.ts';

let traffic: Traffic | null = null;

SYSTEMS.add({
  id: 'traffic',
  areaLoaded(ctx) {
    traffic = new Traffic(ctx.district, ctx.quality.cars);
    ctx.scene.add(traffic.group);
  },
  update(dt, ctx) {
    traffic?.update(dt, isRushHour(ctx.time));
  },
  areaUnloaded() {
    traffic?.dispose();
    traffic = null;
  },
});
