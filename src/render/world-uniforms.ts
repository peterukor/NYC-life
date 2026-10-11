// =====================================================================
// world-uniforms.ts — a few shared shader values every city material
// reads, so one system (like weather) can change the look of the whole
// city at once without touching any meshes.
//   snow: 0..1  — white snow settles on roofs, awnings and tree tops
//   wet:  0..1  — everything a bit darker and cooler, like after rain
// =====================================================================

export const worldUniforms = {
  uSnow: { value: 0 },
  uWet: { value: 0 },
};
