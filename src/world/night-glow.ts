// =====================================================================
// night-glow.ts — how lit-up the city is (0 by day → ~1 at night), set
// every frame by the sky (city.ts setNightGlow). Its own tiny module so
// landmarks can read it without importing city.ts (which imports them).
// =====================================================================

export const nightGlow = { value: 0 };
