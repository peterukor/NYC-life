// =====================================================================
// landmarks/index.ts — the registry of hand-built cartoon landmarks.
//
// Each landmark lives in its own file and registers itself here with
// the id of its place in data/places.ts. city.ts simply asks the
// registry to build whatever landmarks the area has, so adding (or
// removing) one never touches the city code.
//
// HOW TO ADD A LANDMARK
//   1. Add the place to data/places.ts (with its block and real link).
//   2. Create landmarks/<name>.ts that calls LANDMARKS.add({ id, build }).
//   3. Import that file at the bottom of this one.
// Build them as chunky, exaggerated, bright toys of the real thing —
// recognisable silhouette first, details second.
// =====================================================================

export { LANDMARKS, type LandmarkCtx, type LandmarkDef } from './registry.ts';

// Each file adds itself to the registry when imported.
import './empire-state.ts';
import './brooklyn-bridge.ts';
import './barclays.ts';
