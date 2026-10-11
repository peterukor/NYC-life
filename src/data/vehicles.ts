// =====================================================================
// vehicles.ts — every vehicle in the game, as plug-in data.
//
// 17 cars you can own, in four tiers, plus the city's service vehicles
// (taxis, buses, police, ambulances, fire engines, delivery vans) that
// only appear in traffic.
//
//   common (8)    — everyday cars, everywhere
//   premium (4)   — luxury sedans, SUVs, the electric GT, a roadster
//   exclusive (3) — muscle car, supercar, stretch limo: rare on the road
//   veryRare (2)  — the Halo hypercar and the Cloud '57: you might see
//                   one a week
//
// Every car is a smooth "lofted" shape described by a few numbers (see
// world/car-shapes.ts): side-profile heights along the car, a glass
// cabin, wheels and lights. Pricier cars get more segments (smoother
// curves), dark glass, chrome and gold.
//
// TO ADD A CAR: add one entry with a `spec` (copy the closest car and
// change the numbers) or a custom `build`. Traffic, parked cars and the
// dealership all read this list. TO REMOVE: delete the entry, or set
// trafficWeight and parkWeight to 0 and price to 0.
// =====================================================================

import { Registry } from '../core/registry.ts';
import type { CityMeshBuilder } from '../world/nycgen/builder.ts';
import { buildCar, CHROME, DARK_GLASS, GLASS, TYRE, type CarFrame, type CarSpec } from '../world/car-shapes.ts';

export type Rarity = 'common' | 'premium' | 'exclusive' | 'veryRare';

export const RARITY_INFO: Record<Rarity, { label: string; color: string; cool: number }> = {
  common: { label: 'Common', color: '#8d99ae', cool: 8 },
  premium: { label: 'Premium', color: '#3a86ff', cool: 22 },
  exclusive: { label: 'Exclusive', color: '#9b5de5', cool: 38 },
  veryRare: { label: 'Very rare', color: '#f2b705', cool: 50 },
};

export interface VehicleDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** City vehicles (taxi, bus, police…) are never for sale. */
  service?: boolean;
  blurb?: string;
  /** How often it appears in moving traffic (relative weight; 0 = never). */
  trafficWeight: number;
  /** How often it appears parked at the kerb (relative weight; 0 = never). */
  parkWeight: number;
  /** Driving speed range in metres per second (city traffic is ~7–12). */
  speed: [number, number];
  /** Paint colours to pick from (the first is the showroom colour). */
  paints: string[];
  /** Shop price in cents (0 = not for sale). */
  price: number;
  /** Shape numbers for the smooth car builder. */
  spec?: CarSpec;
  /** Extra bits on top of the spec (roof signs, spoilers, fins…). */
  extras?: (b: CityMeshBuilder, paint: string, f: CarFrame) => void;
  /** Fully custom drawing instead of a spec. */
  build?: (b: CityMeshBuilder, paint: string) => void;
}

/** Draw a vehicle (spec + extras, or its custom build). */
export function drawVehicle(v: VehicleDef, b: CityMeshBuilder, paint: string, lod: 0 | 1 = 1): void {
  if (v.spec) {
    const f = buildCar(b, v.spec, paint, lod);
    v.extras?.(b, paint, f);
  } else v.build?.(b, paint);
}

const H = (keys: [number, number][]) => keys;

// ---- Reusable shapes (service vehicles reuse the sedan) ----
const SEDAN: CarSpec = {
  length: 4.4, width: 1.92, wheelR: 0.38, wheels: [0.19, 0.8], segs: 12,
  top: H([[0, 0.98], [0.12, 1.03], [0.3, 1.05], [0.7, 1.0], [0.88, 0.93], [1, 0.82]]),
  cabin: { from: 0.22, to: 0.73, roof: 0.62, roofFrom: 0.3, roofTo: 0.66, pillars: [0.5] },
};

/** A boxy-but-soft van/truck body (bus, ambulance, delivery van). */
const boxBody = (length: number, width: number, height: number, cabT: number, cabH: number, R: number, wheels: number[]): CarSpec => ({
  length, width, wheelR: R, wheels, segs: 12, round: 5, endRound: 0.55, slices: 8,
  top: H([[0, height], [cabT - 0.03, height], [cabT + 0.04, cabH + 0.25], [0.93, cabH], [1, cabH - 0.2]]),
  bottom: H([[0, R * 0.9], [1, R * 0.9]]),
  trim: { color: '#3d424a', below: R * 1.05 },
});

/** Side windows as glass panels on a box body. */
function sideWindows(b: CityMeshBuilder, f: CarFrame, t0: number, t1: number, y0: number, y1: number, glass = GLASS): void {
  const w = f.halfW((t0 + t1) / 2) + 0.012;
  b.box(-w, w, y0, y1, f.z(t0), f.z(t1), glass, 'ew');
}

export const VEHICLES = new Registry<VehicleDef>('vehicle');

VEHICLES.add(
  // =================== COMMON (8) ===================
  {
    id: 'metroSedan', name: 'Metro Sedan', rarity: 'common', blurb: 'Sensible, reliable, beige personality. Gets you there.',
    trafficWeight: 5, parkWeight: 6, speed: [7, 11], price: 2_400_000,
    paints: ['#3a86ff', '#e63946', '#ffffff', '#2a9d8f', '#c0c7d1', '#1d3557', '#343a40'],
    spec: SEDAN,
  },
  {
    id: 'pipHatch', name: 'Pip Hatchback', rarity: 'common', blurb: 'Small, peppy, parks anywhere. The New Yorker’s friend.',
    trafficWeight: 4, parkWeight: 6, speed: [7, 11], price: 1_800_000,
    paints: ['#f4a261', '#8ecae6', '#ffd166', '#06a77d', '#ffffff', '#e76f51'],
    spec: { length: 3.7, width: 1.86, wheelR: 0.37, wheels: [0.18, 0.81], segs: 12, top: H([[0, 1.0], [0.1, 1.05], [0.6, 1.0], [0.85, 0.9], [1, 0.8]]), cabin: { from: 0.06, to: 0.7, roof: 0.7, roofFrom: 0.14, roofTo: 0.62, pillars: [0.45] } },
  },
  {
    id: 'bumble', name: 'Bumble Micro', rarity: 'common', blurb: 'A bubble on wheels. Fits in a bike lane (don’t).',
    trafficWeight: 2, parkWeight: 3, speed: [6, 9], price: 1_200_000,
    paints: ['#ffd166', '#ff8fab', '#80ed99', '#a0c4ff', '#ffffff'],
    spec: { length: 2.9, width: 1.7, wheelR: 0.34, wheels: [0.2, 0.8], round: 2.4, endRound: 0.6, segs: 12, top: H([[0, 0.92], [0.5, 1.0], [1, 0.86]]), cabin: { from: 0.12, to: 0.8, roof: 0.72, roofFrom: 0.35, roofTo: 0.6, width: 0.9 } },
  },
  {
    id: 'trailSuv', name: 'Trail SUV', rarity: 'common', blurb: 'Built for mountains, used for Costco.',
    trafficWeight: 3, parkWeight: 4, speed: [7, 10], price: 3_800_000,
    paints: ['#343a40', '#ffffff', '#6c757d', '#1d3557', '#8d0801', '#3d5a40'],
    spec: { length: 4.6, width: 2.05, wheelR: 0.44, wheels: [0.18, 0.8], round: 3.6, segs: 12, top: H([[0, 1.3], [0.1, 1.36], [0.7, 1.3], [0.88, 1.22], [1, 1.1]]), bottom: H([[0, 0.42], [1, 0.42]]), trim: { color: '#3d424a', below: 0.6 }, cabin: { from: 0.07, to: 0.72, roof: 0.7, roofFrom: 0.12, roofTo: 0.66, pillars: [0.42, 0.75] } },
  },
  {
    id: 'famVan', name: 'Family Minivan', rarity: 'common', blurb: 'Sliding doors. Snack crumbs. Pure love.',
    trafficWeight: 2, parkWeight: 3, speed: [7, 10], price: 3_200_000,
    paints: ['#c0c7d1', '#ffffff', '#264653', '#9d0208', '#e9c46a'],
    spec: { length: 4.9, width: 2.0, wheelR: 0.4, wheels: [0.17, 0.82], round: 3.6, segs: 12, top: H([[0, 1.18], [0.78, 1.15], [0.92, 1.0], [1, 0.86]]), cabin: { from: 0.05, to: 0.86, roof: 0.85, roofFrom: 0.06, roofTo: 0.72, pillars: [0.32, 0.62] } },
  },
  {
    id: 'pickup', name: 'Workhorse Pickup', rarity: 'common', blurb: 'Hauls lumber, couches and your friend’s whole apartment.',
    trafficWeight: 1.5, parkWeight: 2, speed: [7, 11], price: 4_200_000,
    paints: ['#e63946', '#264653', '#e9c46a', '#ffffff', '#343a40'],
    spec: { length: 5.1, width: 2.05, wheelR: 0.45, wheels: [0.18, 0.8], round: 3.8, segs: 12, top: H([[0, 1.24], [0.6, 1.24], [0.84, 1.18], [1, 1.06]]), bottom: H([[0, 0.45], [1, 0.45]]), trim: { color: '#3d424a', below: 0.62 }, cabin: { from: 0.42, to: 0.78, roof: 0.74, roofFrom: 0.12, roofTo: 0.7 } },
    extras: (b, _p, f) => {
      // The open bed: a dark floor with the body's rim around it.
      const w = f.halfW(0.2) * 0.8;
      b.box(-w, w, f.top(0.2) - 0.02, f.top(0.2) + 0.012, f.z(0.05), f.z(0.4), '#2d3138', 't');
    },
  },
  {
    id: 'sprout', name: 'Sprout EV', rarity: 'common', blurb: 'Quiet as a library. Smug as a podcast.',
    trafficWeight: 2.5, parkWeight: 3, speed: [8, 12], price: 2_900_000,
    paints: ['#80ed99', '#ffffff', '#a0c4ff', '#ffadad', '#bdb2ff'],
    spec: { length: 3.9, width: 1.88, wheelR: 0.36, wheels: [0.19, 0.81], round: 2.6, endRound: 0.6, segs: 12, top: H([[0, 0.95], [0.5, 1.0], [1, 0.84]]), cabin: { from: 0.1, to: 0.8, roof: 0.68, roofFrom: 0.35, roofTo: 0.56, roofColor: '#1f2937' } },
  },
  {
    id: 'wagon', name: 'Boxer Wagon', rarity: 'common', blurb: 'Room for the dog, the stroller and the drama.',
    trafficWeight: 1.5, parkWeight: 3, speed: [7, 10], price: 2_600_000,
    paints: ['#6d597a', '#b5838d', '#2a9d8f', '#ffffff', '#3d405b'],
    spec: { length: 4.7, width: 1.9, wheelR: 0.38, wheels: [0.18, 0.8], round: 3.4, segs: 12, top: H([[0, 1.0], [0.7, 1.0], [0.88, 0.92], [1, 0.82]]), cabin: { from: 0.05, to: 0.72, roof: 0.62, roofFrom: 0.08, roofTo: 0.68, pillars: [0.32, 0.6] } },
  },

  // =================== PREMIUM (4) ===================
  {
    id: 'aurora', name: 'Aurora Luxury Sedan', rarity: 'premium', blurb: 'Leather that smells like money. Rides like a cloud.',
    trafficWeight: 0.8, parkWeight: 0.8, speed: [9, 13], price: 9_500_000,
    paints: ['#111827', '#f8f9fa', '#5c677d', '#7f1d1d', '#1e3a5f'],
    spec: { length: 5.1, width: 2.0, wheelR: 0.41, wheels: [0.18, 0.79], segs: 16, slices: 9, round: 3.2, top: H([[0, 0.98], [0.15, 1.04], [0.35, 1.06], [0.7, 1.02], [0.9, 0.93], [1, 0.8]]), trim: { color: '#c9d1db', below: 0.5 }, rim: CHROME, cabin: { from: 0.24, to: 0.72, roof: 0.6, roofFrom: 0.36, roofTo: 0.66, pillars: [0.55], glass: DARK_GLASS } },
  },
  {
    id: 'summit', name: 'Summit Luxury SUV', rarity: 'premium', blurb: 'Tinted windows. Heated everything. Pretends it’s a tank.',
    trafficWeight: 0.8, parkWeight: 0.8, speed: [9, 12], price: 12_000_000,
    paints: ['#111827', '#f8f9fa', '#374151', '#0b3d2e'],
    spec: { length: 5.0, width: 2.12, wheelR: 0.47, wheels: [0.18, 0.8], segs: 16, slices: 9, round: 3.4, top: H([[0, 1.36], [0.12, 1.42], [0.7, 1.37], [0.88, 1.27], [1, 1.12]]), bottom: H([[0, 0.45], [1, 0.45]]), trim: { color: '#1f2329', below: 0.62 }, rim: '#e5e7eb', cabin: { from: 0.09, to: 0.72, roof: 0.68, roofFrom: 0.14, roofTo: 0.68, pillars: [0.45], glass: DARK_GLASS } },
  },
  {
    id: 'voltGt', name: 'Volt GT', rarity: 'premium', blurb: 'Electric fastback. 0–60 before you finish saying “zero”.',
    trafficWeight: 0.7, parkWeight: 0.6, speed: [11, 15], price: 8_000_000,
    paints: ['#e5e7eb', '#dc2626', '#2563eb', '#111827'],
    spec: { length: 4.8, width: 2.0, wheelR: 0.4, wheels: [0.19, 0.8], segs: 16, slices: 9, round: 2.8, endRound: 0.55, top: H([[0, 0.92], [0.2, 0.97], [0.6, 0.95], [0.85, 0.82], [1, 0.7]]), rim: '#9ca3af', cabin: { from: 0.12, to: 0.7, roof: 0.56, roofFrom: 0.45, roofTo: 0.6, roofColor: '#1b1f27', glass: DARK_GLASS } },
  },
  {
    id: 'roadster', name: 'Breeze Roadster', rarity: 'premium', blurb: 'Roof down, sunglasses on, hair ruined.',
    trafficWeight: 0.6, parkWeight: 0.5, speed: [11, 15], price: 7_500_000,
    paints: ['#e63946', '#ffbe0b', '#f8f9fa', '#06d6a0', '#3a86ff'],
    spec: { length: 4.2, width: 1.9, wheelR: 0.38, wheels: [0.19, 0.8], segs: 16, slices: 8, round: 2.8, top: H([[0, 0.9], [0.3, 0.93], [0.65, 0.9], [0.9, 0.8], [1, 0.7]]), rim: CHROME },
    extras: (b, _p, f) => {
      // Two seats, a little windscreen, and roll hoops.
      for (const x of [-0.42, 0.42]) {
        b.rounded(x, f.z(0.36), f.top(0.36) - 0.15, 0.62, 0.55, 0.32, '#3b2f2f');
        b.rounded(x, f.z(0.44), f.top(0.44) - 0.2, 0.62, 0.22, 0.55, '#4a3b3b');
      }
      const w = f.halfW(0.6) * 0.82;
      b.quad({ x: -w, y: f.top(0.6), z: f.z(0.6) }, { x: w, y: f.top(0.6), z: f.z(0.6) }, { x: w * 0.92, y: f.top(0.6) + 0.42, z: f.z(0.56) }, { x: -w * 0.92, y: f.top(0.6) + 0.42, z: f.z(0.56) }, GLASS);
      b.quad({ x: w, y: f.top(0.6), z: f.z(0.6) }, { x: -w, y: f.top(0.6), z: f.z(0.6) }, { x: -w * 0.92, y: f.top(0.6) + 0.42, z: f.z(0.56) }, { x: w * 0.92, y: f.top(0.6) + 0.42, z: f.z(0.56) }, GLASS);
    },
  },

  // =================== EXCLUSIVE (3) ===================
  {
    id: 'stallion', name: 'Stallion V8', rarity: 'exclusive', blurb: 'Loud. Proud. Wakes up the whole block at 2 a.m.',
    trafficWeight: 0.25, parkWeight: 0.2, speed: [12, 16], price: 22_000_000,
    paints: ['#ff7b00', '#d00000', '#1d1d1d', '#ffd60a', '#0077b6'],
    spec: { length: 4.8, width: 2.06, wheelR: 0.43, wheels: [0.19, 0.8], wheelW: 0.5, segs: 16, slices: 9, round: 3.6, top: H([[0, 1.02], [0.1, 1.07], [0.4, 1.02], [0.7, 1.0], [0.92, 0.98], [1, 0.88]]), rim: '#2b2d31', cabin: { from: 0.28, to: 0.66, roof: 0.5, roofFrom: 0.32, roofTo: 0.58, roofColor: '#15171c', glass: DARK_GLASS } },
    extras: (b, _p, f) => {
      b.rounded(0, f.z(0.82), f.top(0.82) - 0.06, 0.7, 0.16, 0.6, '#15171c'); // hood scoop
      for (const x of [-0.16, 0.16]) b.box(x - 0.07, x + 0.07, f.top(0.88) - 0.01, f.top(0.88) + 0.012, f.z(0.74), f.z(0.97), '#f8f9fa', 't'); // racing stripes
    },
  },
  {
    id: 'fang', name: 'Fang Supercar', rarity: 'exclusive', blurb: 'Doors go up. Price goes up. Everyone looks.',
    trafficWeight: 0.2, parkWeight: 0.15, speed: [13, 18], price: 45_000_000,
    paints: ['#a7c957', '#ff006e', '#ffbe0b', '#f8f9fa', '#3a0ca3'],
    spec: { length: 4.6, width: 2.12, wheelR: 0.41, wheels: [0.2, 0.8], wheelW: 0.5, segs: 18, slices: 10, round: 2.6, endRound: 0.5, top: H([[0, 0.94], [0.15, 0.98], [0.5, 0.86], [0.8, 0.68], [1, 0.55]]), bottom: H([[0, 0.24], [1, 0.22]]), rim: '#111111', cabin: { from: 0.26, to: 0.72, roof: 0.44, roofFrom: 0.45, roofTo: 0.6, roofColor: '#121212', glass: '#1d2636' } },
    extras: (b, paint, f) => {
      const y = f.top(0.04) + 0.28;
      b.rounded(0, f.z(0.04), y, 1.9, 0.08, 0.38, paint); // rear wing
      for (const x of [-0.6, 0.6]) b.box(x - 0.05, x + 0.05, f.top(0.06) - 0.05, y, f.z(0.03), f.z(0.06), '#111111', 'nsew');
    },
  },
  {
    id: 'monarch', name: 'Monarch Stretch Limo', rarity: 'exclusive', blurb: 'Prom night, every night. Comes with a mini bar.',
    trafficWeight: 0.15, parkWeight: 0.1, speed: [7, 10], price: 30_000_000,
    paints: ['#111111', '#f8f9fa'],
    spec: { length: 7.8, width: 2.05, wheelR: 0.4, wheels: [0.12, 0.88], segs: 14, slices: 12, round: 3.4, top: H([[0, 1.0], [0.08, 1.04], [0.85, 1.02], [0.94, 0.92], [1, 0.82]]), trim: { color: '#c9d1db', below: 0.52 }, rim: CHROME, cabin: { from: 0.1, to: 0.82, roof: 0.56, roofFrom: 0.06, roofTo: 0.9, pillars: [0.25, 0.45, 0.65, 0.82], glass: DARK_GLASS } },
  },

  // =================== VERY RARE (2) ===================
  {
    id: 'halo', name: 'Halo Hypercar', rarity: 'veryRare', blurb: 'Seven of them exist. Gold wheels. Sounds like a jet.',
    trafficWeight: 0.04, parkWeight: 0.02, speed: [14, 19], price: 250_000_000,
    paints: ['#f8f9fa', '#0b132b', '#c1121f', '#00b4d8'],
    spec: { length: 4.7, width: 2.16, wheelR: 0.42, wheels: [0.2, 0.8], wheelW: 0.52, segs: 20, slices: 12, round: 2.4, endRound: 0.6, top: H([[0, 0.9], [0.12, 0.98], [0.4, 0.86], [0.75, 0.62], [1, 0.48]]), bottom: H([[0, 0.24], [1, 0.22]]), rim: '#f2c14e', cabin: { from: 0.3, to: 0.7, roof: 0.42, roofFrom: 0.5, roofTo: 0.58, roofColor: '#141a26', glass: '#141a26' } },
    extras: (b, _p, f) => {
      b.rounded(0, f.z(0.03), f.top(0.03) + 0.06, 2.0, 0.06, 0.4, '#f2c14e'); // gold lip spoiler
      b.box(-0.7, 0.7, f.top(0.98) - 0.14, f.top(0.98) - 0.06, f.z(0.97), f.z(1) + 0.02, '#e0f7ff', 's'); // light strip
    },
  },
  {
    id: 'cloud57', name: 'Cloud ’57 Classic', rarity: 'veryRare', blurb: 'Tail fins, whitewalls, chrome everywhere. A museum on wheels.',
    trafficWeight: 0.05, parkWeight: 0.04, speed: [8, 11], price: 120_000_000,
    paints: ['#4ecdc4', '#ff6b6b', '#f7d794', '#9bf6ff'],
    spec: { length: 5.4, width: 2.05, wheelR: 0.4, wheels: [0.2, 0.8], segs: 18, slices: 11, round: 3.0, top: H([[0, 1.0], [0.06, 1.08], [0.25, 1.0], [0.7, 0.98], [0.9, 0.95], [1, 0.84]]), trim: { color: '#e0e5ec', below: 0.55 }, rim: '#f6f6f6', cabin: { from: 0.3, to: 0.66, roof: 0.56, roofFrom: 0.25, roofTo: 0.65, roofColor: '#f5ebe0' } },
    extras: (b, paint, f) => {
      // Tail fins.
      for (const x of [-1, 1]) {
        const xx = x * f.halfW(0.08) * 0.82;
        b.quad({ x: xx, y: f.top(0.02), z: f.z(0.02) }, { x: xx, y: f.top(0.2), z: f.z(0.2) }, { x: xx, y: f.top(0.04) + 0.2, z: f.z(0.04) }, { x: xx, y: f.top(0.04) + 0.2, z: f.z(0.04) }, paint);
        b.quad({ x: xx, y: f.top(0.2), z: f.z(0.2) }, { x: xx, y: f.top(0.02), z: f.z(0.02) }, { x: xx, y: f.top(0.04) + 0.2, z: f.z(0.04) }, { x: xx, y: f.top(0.04) + 0.2, z: f.z(0.04) }, paint);
      }
      b.box(-0.85, 0.85, 0.42, 0.56, f.z(1) - 0.05, f.z(1) + 0.06, CHROME, 'nsewt'); // big chrome bumper
    },
  },

  // =================== CITY SERVICE VEHICLES (not for sale) ===================
  {
    id: 'taxi', name: 'Yellow Cab', rarity: 'common', service: true,
    trafficWeight: 9, parkWeight: 2, speed: [8, 12], price: 0, paints: ['#ffc629'],
    spec: SEDAN,
    extras: (b, _p, f) => {
      b.rounded(0, f.z(0.47), f.top(0.47) + 0.6, 0.75, 0.26, 0.36, '#fff6d6'); // roof light
      const w = f.halfW(0.5) + 0.01;
      b.box(-w, w, 0.62, 0.74, f.z(0.25), f.z(0.72), '#1d1d1d', 'ew'); // checker stripe
    },
  },
  {
    id: 'police', name: 'Police Car', rarity: 'common', service: true,
    trafficWeight: 0.8, parkWeight: 0.4, speed: [9, 13], price: 0, paints: ['#ffffff'],
    spec: { ...SEDAN, length: 4.6 },
    extras: (b, _p, f) => {
      const w = f.halfW(0.5) + 0.01;
      b.box(-w, w, 0.6, 0.78, f.z(0.15), f.z(0.85), '#1d4ed8', 'ew');
      b.rounded(-0.3, f.z(0.47), f.top(0.47) + 0.6, 0.55, 0.2, 0.36, '#e11d48');
      b.rounded(0.3, f.z(0.47), f.top(0.47) + 0.6, 0.55, 0.2, 0.36, '#2563eb');
    },
  },
  {
    id: 'deliveryVan', name: 'Delivery Van', rarity: 'common', service: true,
    trafficWeight: 2, parkWeight: 1.5, speed: [6, 9], price: 0, paints: ['#ffffff', '#f1faee', '#ffd166'],
    spec: boxBody(5.2, 2.05, 2.25, 0.72, 1.35, 0.4, [0.17, 0.82]),
    extras: (b, _p, f) => sideWindows(b, f, 0.76, 0.9, 1.2, 1.6),
  },
  {
    id: 'bus', name: 'City Bus', rarity: 'common', service: true,
    trafficWeight: 1, parkWeight: 0, speed: [6, 8], price: 0, paints: ['#3a6ea5'],
    spec: { length: 11, width: 2.5, wheelR: 0.52, wheels: [0.17, 0.78], segs: 12, round: 5, endRound: 0.7, slices: 10, top: H([[0, 3.0], [1, 3.0]]), bottom: H([[0, 0.45], [1, 0.45]]), trim: { color: '#f1f3f5', below: 6 } },
    extras: (b, paint, f) => {
      const w = f.halfW(0.5) + 0.012;
      b.box(-w, w, 0.55, 1.25, f.z(0.05), f.z(0.95), paint, 'ew'); // blue skirt
      b.box(-w, w, 1.6, 2.5, f.z(0.06), f.z(0.95), GLASS, 'ew'); // window band
      b.box(-1.0, 1.0, 1.4, 2.6, f.z(1) - 0.05, f.z(1) + 0.01, GLASS, 's'); // windscreen
      b.rounded(0, f.z(0.5), 2.95, 1.9, 0.25, 7, '#d9dde3'); // roof unit
    },
  },
  {
    id: 'ambulance', name: 'Ambulance', rarity: 'common', service: true,
    trafficWeight: 0.35, parkWeight: 0, speed: [10, 14], price: 0, paints: ['#ffffff'],
    spec: boxBody(5.8, 2.15, 2.45, 0.7, 1.4, 0.42, [0.17, 0.82]),
    extras: (b, _p, f) => {
      sideWindows(b, f, 0.75, 0.9, 1.25, 1.65);
      const w = f.halfW(0.4) + 0.012;
      b.box(-w, w, 1.55, 1.85, f.z(0.05), f.z(0.68), '#e63946', 'ew');
      b.rounded(0, f.z(0.66), 2.42, 1.4, 0.2, 0.32, '#e63946');
    },
  },
  {
    id: 'firetruck', name: 'Fire Engine', rarity: 'common', service: true,
    trafficWeight: 0.2, parkWeight: 0, speed: [9, 13], price: 0, paints: ['#d62828'],
    spec: { ...boxBody(9, 2.5, 2.1, 0.78, 2.3, 0.5, [0.18, 0.8]), top: H([[0, 2.1], [0.74, 2.1], [0.8, 2.55], [0.95, 2.5], [1, 2.2]]) },
    extras: (b, _p, f) => {
      sideWindows(b, f, 0.82, 0.95, 1.6, 2.25);
      b.beam(-0.4, 2.3, f.z(0.08), -0.4, 2.3, f.z(0.72), 0.1, '#d5dbe3'); // ladder
      b.beam(0.4, 2.3, f.z(0.08), 0.4, 2.3, f.z(0.72), 0.1, '#d5dbe3');
      for (let t = 0.12; t < 0.72; t += 0.07) b.beam(-0.4, 2.3, f.z(t), 0.4, 2.3, f.z(t), 0.06, '#d5dbe3');
    },
  },
);

void TYRE;

/** Cars a player can buy, cheapest first. */
export function carsForSale(): VehicleDef[] {
  return VEHICLES.where((v) => !v.service && v.price > 0).sort((a, b) => a.price - b.price);
}

/** Pick a vehicle by weight (e.g. `pickVehicle(Math.random, 'trafficWeight')`). */
export function pickVehicle(rand: () => number, field: 'trafficWeight' | 'parkWeight', among?: VehicleDef[]): VehicleDef {
  const list = (among ?? VEHICLES.all()).filter((v) => v[field] > 0);
  const total = list.reduce((s, v) => s + v[field], 0);
  let t = rand() * total;
  for (const v of list) if ((t -= v[field]) <= 0) return v;
  return list[0];
}
