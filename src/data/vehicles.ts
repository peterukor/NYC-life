// =====================================================================
// vehicles.ts — every vehicle in the game, as plug-in data.
//
// TO ADD A VEHICLE: add one entry to VEHICLES below (or call
// VEHICLES.add(...) from a new file and import it once from main.ts).
// Give it an id, a rarity, how often it shows up in traffic, a speed
// range, paint colours and a build() that draws it out of soft toy
// shapes. Traffic, parked cars and (later) the car shop all read this
// list, so nothing else needs to change.
//
// TO EDIT: change the numbers. TO REMOVE: delete the entry (or set
// trafficWeight and parkWeight to 0 to keep it in the game but off the
// streets).
//
// Shapes are built facing +z (front) and sitting on y = 0, centred on
// the origin. Units are metres. Cartoon cars are a little chunkier than
// real ones so they read well from the high camera.
// =====================================================================

import { Registry } from '../core/registry.ts';
import type { CityMeshBuilder } from '../world/nycgen/builder.ts';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface VehicleDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** How often it appears in moving traffic (relative weight; 0 = never). */
  trafficWeight: number;
  /** How often it appears parked at the kerb (relative weight; 0 = never). */
  parkWeight: number;
  /** Driving speed range in metres per second (city traffic is ~7–12). */
  speed: [number, number];
  /** Paint colours to pick from. */
  paints: string[];
  /** Draw the vehicle into a mesh builder (see header for orientation). */
  build: (b: CityMeshBuilder, paint: string) => void;
  /** Shop price in cents, for when players can buy it (0 = not for sale). */
  price: number;
}

const GLASS = '#9fd4f2';
const TYRE = '#2a2d33';
const LIGHT = '#fff3c4';
const METAL = '#c9ced6';

interface ToyCarShape {
  length: number;
  width: number;
  /** Height of the main body above the wheels. */
  bodyH: number;
  /** Cabin (windows) length and height, and how far it sits back from centre. */
  cabL: number;
  cabH: number;
  cabBack: number;
}

/** The shared toy-car recipe: chamfered body, glass cabin, roof, wheels, lights. */
function toyCar(b: CityMeshBuilder, s: ToyCarShape, paint: string, roof = paint): void {
  const L = s.length;
  const W = s.width;
  b.rounded(0, 0, 0.32, W, s.bodyH, L, paint);
  const cz = -s.cabBack;
  const cy = 0.32 + s.bodyH - 0.04;
  b.rounded(0, cz, cy, W * 0.86, s.cabH, s.cabL, GLASS);
  b.box(-W * 0.44, W * 0.44, cy + s.cabH - 0.02, cy + s.cabH + 0.13, cz - s.cabL * 0.46, cz + s.cabL * 0.46, roof, 'nsewt');
  for (const z of [-L * 0.32, L * 0.32]) b.box(-W / 2 - 0.04, W / 2 + 0.04, 0.02, 0.64, z - 0.36, z + 0.36, TYRE, 'nsew');
  // Headlights (front) and tail lights (back).
  for (const x of [-W * 0.32, W * 0.32]) {
    b.box(x - 0.18, x + 0.18, 0.62, 0.82, L / 2 - 0.02, L / 2 + 0.04, LIGHT, 's');
    b.box(x - 0.18, x + 0.18, 0.62, 0.82, -L / 2 - 0.04, -L / 2 + 0.02, '#e63946', 'n');
  }
}

export const VEHICLES = new Registry<VehicleDef>('vehicle');

VEHICLES.add(
  {
    id: 'taxi',
    name: 'Yellow Cab',
    rarity: 'common',
    trafficWeight: 9,
    parkWeight: 2,
    speed: [8, 12],
    paints: ['#ffc629'],
    price: 0,
    build: (b, paint) => {
      toyCar(b, { length: 4.4, width: 1.95, bodyH: 0.8, cabL: 2.3, cabH: 0.66, cabBack: 0.15 }, paint);
      b.rounded(0, -0.15, 1.88, 0.75, 0.3, 0.38, '#fff6d6'); // roof light
      b.box(-1.0, 1.0, 0.7, 0.86, -0.6, 0.4, '#1d1d1d', 'ew'); // checker stripe
    },
  },
  {
    id: 'sedan',
    name: 'Sedan',
    rarity: 'common',
    trafficWeight: 5,
    parkWeight: 6,
    speed: [7, 11],
    paints: ['#e63946', '#3a86ff', '#ffffff', '#2a9d8f', '#c0c7d1', '#1d3557', '#343a40', '#ff6b9a'],
    price: 2_500_000,
    build: (b, paint) => toyCar(b, { length: 4.3, width: 1.9, bodyH: 0.78, cabL: 2.2, cabH: 0.64, cabBack: 0.2 }, paint),
  },
  {
    id: 'hatchback',
    name: 'Hatchback',
    rarity: 'common',
    trafficWeight: 3,
    parkWeight: 5,
    speed: [7, 11],
    paints: ['#f4a261', '#8ecae6', '#ffd166', '#06a77d', '#ffffff', '#e76f51'],
    price: 1_800_000,
    build: (b, paint) => toyCar(b, { length: 3.7, width: 1.85, bodyH: 0.8, cabL: 2.1, cabH: 0.7, cabBack: 0.45 }, paint),
  },
  {
    id: 'suv',
    name: 'SUV',
    rarity: 'common',
    trafficWeight: 3,
    parkWeight: 4,
    speed: [7, 10],
    paints: ['#343a40', '#ffffff', '#6c757d', '#1d3557', '#8d0801', '#3d5a40'],
    price: 4_000_000,
    build: (b, paint) => toyCar(b, { length: 4.6, width: 2.05, bodyH: 1.0, cabL: 2.9, cabH: 0.75, cabBack: 0.35 }, paint),
  },
  {
    id: 'van',
    name: 'Delivery Van',
    rarity: 'common',
    trafficWeight: 2,
    parkWeight: 1.5,
    speed: [6, 9],
    paints: ['#ffffff', '#f1faee', '#ffd166'],
    price: 3_500_000,
    build: (b, paint) => {
      toyCar(b, { length: 5.0, width: 2.05, bodyH: 1.0, cabL: 1.3, cabH: 0.75, cabBack: -1.4 }, paint);
      b.rounded(0, -0.65, 1.28, 2.0, 1.25, 3.4, paint); // cargo box
    },
  },
  {
    id: 'pickup',
    name: 'Pickup Truck',
    rarity: 'uncommon',
    trafficWeight: 1.2,
    parkWeight: 1.5,
    speed: [7, 11],
    paints: ['#e63946', '#264653', '#e9c46a', '#ffffff'],
    price: 4_500_000,
    build: (b, paint) => {
      toyCar(b, { length: 5.0, width: 2.0, bodyH: 0.95, cabL: 1.7, cabH: 0.78, cabBack: -0.6 }, paint);
      b.box(-0.9, 0.9, 1.27, 1.5, -2.4, -0.4, paint, 'nsewt'); // bed rim
    },
  },
  {
    id: 'bus',
    name: 'City Bus',
    rarity: 'uncommon',
    trafficWeight: 1,
    parkWeight: 0,
    speed: [6, 8],
    paints: ['#3a6ea5'],
    price: 0,
    build: (b, paint) => {
      b.rounded(0, 0, 0.35, 2.5, 2.6, 11, '#f1f3f5');
      b.box(-1.27, 1.27, 0.5, 1.2, -5.4, 5.4, paint, 'ewns'); // blue skirt
      b.box(-1.27, 1.27, 1.5, 2.4, -5.0, 5.3, GLASS, 'ewns'); // window band
      b.box(-1.0, 1.0, 2.95, 3.15, -4.2, 4.2, '#d9dde3', 'nsewt'); // roof unit
      for (const z of [-3.6, 3.8]) b.box(-1.3, 1.3, 0.02, 0.8, z - 0.45, z + 0.45, TYRE, 'nsew');
    },
  },
  {
    id: 'police',
    name: 'Police Car',
    rarity: 'uncommon',
    trafficWeight: 0.8,
    parkWeight: 0.4,
    speed: [9, 13],
    paints: ['#ffffff'],
    price: 0,
    build: (b, paint) => {
      toyCar(b, { length: 4.5, width: 1.95, bodyH: 0.8, cabL: 2.3, cabH: 0.66, cabBack: 0.2 }, paint);
      b.box(-1.0, 1.0, 0.62, 0.9, -1.4, 1.0, '#1d4ed8', 'ew'); // blue stripe
      b.rounded(-0.3, -0.2, 1.88, 0.55, 0.24, 0.4, '#e11d48');
      b.rounded(0.3, -0.2, 1.88, 0.55, 0.24, 0.4, '#2563eb');
    },
  },
  {
    id: 'ambulance',
    name: 'Ambulance',
    rarity: 'rare',
    trafficWeight: 0.35,
    parkWeight: 0,
    speed: [10, 14],
    paints: ['#ffffff'],
    price: 0,
    build: (b, paint) => {
      toyCar(b, { length: 5.6, width: 2.15, bodyH: 1.0, cabL: 1.3, cabH: 0.8, cabBack: -1.75 }, paint);
      b.rounded(0, -0.7, 1.28, 2.15, 1.5, 3.9, paint);
      b.box(-1.09, 1.09, 1.7, 2.05, -2.6, 1.2, '#e63946', 'ew');
      b.rounded(0, 1.1, 2.3, 1.4, 0.22, 0.35, '#e63946');
    },
  },
  {
    id: 'firetruck',
    name: 'Fire Engine',
    rarity: 'rare',
    trafficWeight: 0.2,
    parkWeight: 0,
    speed: [9, 13],
    paints: ['#d62828'],
    price: 0,
    build: (b, paint) => {
      b.rounded(0, 0, 0.4, 2.5, 1.6, 9, paint);
      b.rounded(0, 3.4, 2.0, 2.3, 1.1, 2.0, paint);
      b.box(-1.1, 1.1, 2.1, 2.9, 3.0, 4.42, GLASS, 's');
      b.box(-0.35, 0.35, 2.05, 2.35, -4.0, 2.2, METAL, 'nsewt'); // ladder
      for (const z of [-3, 3]) b.box(-1.3, 1.3, 0.02, 0.85, z - 0.5, z + 0.5, TYRE, 'nsew');
    },
  },
  {
    id: 'sports',
    name: 'Sports Coupe',
    rarity: 'rare',
    trafficWeight: 0.5,
    parkWeight: 0.6,
    speed: [12, 17],
    paints: ['#e63946', '#ffbe0b', '#3a86ff', '#7b2cbf', '#06d6a0'],
    price: 12_000_000,
    build: (b, paint) => toyCar(b, { length: 4.4, width: 2.0, bodyH: 0.62, cabL: 1.8, cabH: 0.5, cabBack: 0.3 }, paint, '#1d1d1d'),
  },
  {
    id: 'limo',
    name: 'Stretch Limo',
    rarity: 'epic',
    trafficWeight: 0.12,
    parkWeight: 0.1,
    speed: [7, 10],
    paints: ['#111111', '#ffffff'],
    price: 30_000_000,
    build: (b, paint) => toyCar(b, { length: 7.6, width: 2.0, bodyH: 0.8, cabL: 5.0, cabH: 0.6, cabBack: 0.4 }, paint),
  },
  {
    id: 'vintage',
    name: 'Vintage Convertible',
    rarity: 'legendary',
    trafficWeight: 0.05,
    parkWeight: 0.05,
    speed: [7, 10],
    paints: ['#4ecdc4', '#ff6b6b', '#f7d794'],
    price: 60_000_000,
    build: (b, paint) => {
      b.rounded(0, 0, 0.32, 2.0, 0.75, 5.0, paint);
      b.rounded(0, -0.3, 1.0, 1.8, 0.35, 1.4, '#f5ebe0'); // cream seats
      b.box(-0.85, 0.85, 1.0, 1.35, 0.55, 0.62, GLASS, 'ns'); // windshield
      for (const z of [-1.6, 1.6]) b.box(-1.04, 1.04, 0.02, 0.66, z - 0.36, z + 0.36, TYRE, 'nsew');
    },
  },
);

/** Pick a vehicle by weight (e.g. `pickVehicle(Math.random, 'trafficWeight')`). */
export function pickVehicle(rand: () => number, field: 'trafficWeight' | 'parkWeight'): VehicleDef {
  const list = VEHICLES.where((v) => v[field] > 0);
  const total = list.reduce((s, v) => s + v[field], 0);
  let t = rand() * total;
  for (const v of list) if ((t -= v[field]) <= 0) return v;
  return list[0];
}
