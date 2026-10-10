// =====================================================================
// quality.ts — picking graphics settings that suit the device.
//
// Cheap phones get fewer people on the streets, no real-time shadows,
// a lower render resolution and shorter view distance. Strong devices
// get the full show. Players can override this in Settings.
// =====================================================================

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  crowd: number;
  cars: number;
  viewDistance: number;
  trees: boolean;
}

const PRESETS: Record<QualityTier, Omit<QualitySettings, 'tier' | 'pixelRatio'> & { maxPixelRatio: number }> = {
  low: { maxPixelRatio: 1, antialias: false, shadows: false, crowd: 45, cars: 14, viewDistance: 420, trees: true },
  medium: { maxPixelRatio: 1.5, antialias: true, shadows: false, crowd: 110, cars: 30, viewDistance: 650, trees: true },
  high: { maxPixelRatio: 2, antialias: true, shadows: true, crowd: 220, cars: 55, viewDistance: 900, trees: true },
};

/** Guess a tier from what the browser tells us about the device. */
export function detectTier(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 4; // GB; not all browsers report it
  const cores = nav.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (memory <= 2 || cores <= 4 && mobile) return 'low';
  if (mobile || memory <= 4) return 'medium';
  return 'high';
}

export function qualitySettings(choice: 'auto' | QualityTier): QualitySettings {
  const tier = choice === 'auto' ? detectTier() : choice;
  const p = PRESETS[tier];
  return {
    tier,
    pixelRatio: Math.min(window.devicePixelRatio || 1, p.maxPixelRatio),
    antialias: p.antialias,
    shadows: p.shadows,
    crowd: p.crowd,
    cars: p.cars,
    viewDistance: p.viewDistance,
    trees: p.trees,
  };
}
