// =====================================================================
// palette.ts — ground colours, taken from the AI-made models (Peter,
// 2026-10-11: "the grass and sidewalks must match the models perfectly").
// Measured from the baked model textures (the colour the models are
// drawn with, so under the same lights the ground matches exactly):
//   grass   median #46680b … light #5f8110 (we use the lighter half:
//           lawns are the sunny parts of the models)
//   paving  median #e6caa5 … light #f5d9b1
//   asphalt #494743 (warm dark grey)
// Change a colour here and every lawn / sidewalk / road follows.
// =====================================================================

export const GROUND = {
  grass: '#5f8a14',
  grassLight: '#78a11e',
  grassDark: '#4a700d',
  pave: '#ecd2ad',
  paveLight: '#f6dfbb',
  paveGrout: '#c9a67c',
  asphalt: '#55545a',
  asphaltLight: '#626168',
  /** Land outside the built blocks (shore lawns, the rest of the borough). */
  land: '#6b9419',
  /** Other boroughs across the water (a little paler: far away). */
  landFar: '#8aa94a',
} as const;
