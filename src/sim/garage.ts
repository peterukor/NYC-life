// =====================================================================
// garage.ts — owning a car, driving it, the Cool meter, speeding tickets
// and losing your licence.
//
//   • Buy a car at the dealership (Phone → Cars). Prices come from
//     data/vehicles.ts. Sell it back for GARAGE.resale of the price.
//   • "Drive" puts you behind the wheel: you move around the street in
//     your own car (much faster than walking), and the travel sheet gets
//     a "Drive there" option that's nearly free.
//   • "Floor it" gets there twice as fast and is fun, but every trip
//     rolls for a SPEEDING TICKET (fine + licence points). In the rain
//     or snow there's also a small chance of a crash → hospital bill.
//   • Too many points (GARAGE.suspendAt) suspends your licence for a few
//     game days. Drive anyway and the police may arrest you (sim/jail.ts).
//   • Points fade over time if you behave.
//
// COOL METER (0–100): how impressive you look in the city right now.
// Your car (by rarity), your outfit (by tier) and your fame add up. Cool
// makes social actions and Celebrity rep land better (see coolBonus).
//
// TO TUNE: change GARAGE. To add a car: data/vehicles.ts.
// =====================================================================

import { gameMinutesToRealMs, nowMs } from '../core/clock.ts';
import { carsForSale, RARITY_INFO, VEHICLES } from '../data/vehicles.ts';
import { CLOTHES, tierOf } from '../data/wardrobe.ts';
import { chargeBill, changeMoney } from './economy.ts';
import { arrest } from './jail.ts';
import { addDebt } from './debt.ts';
import { addMoodlet, applyNeeds } from './needs.ts';
import { isWet } from './weather.ts';
import type { GameState } from './types.ts';

export const GARAGE = {
  /** Share of the price you get back when selling. */
  resale: 0.6,
  /** Gas + tolls per trip (cents). */
  tripCost: 300,
  /** Speeding ticket. */
  ticketFine: 12_000,
  ticketPoints: 3,
  /** Chance of a ticket each time you floor it. */
  ticketOdds: 0.22,
  /** Points that suspend your licence, and for how long (game days). */
  suspendAt: 11,
  suspendDays: 3,
  /** One point fades away every this many game days. */
  pointFadeDays: 2,
  /** Chance of a crash when flooring it on a wet day. */
  wetCrashOdds: 0.07,
  /** Driving while suspended: chance per trip of being pulled over. */
  suspendedCatchOdds: 0.35,
  /** Walking speed multiplier while driving in the street. */
  driveSpeed: 3.2,
};

export interface OwnedCar {
  uid: string;
  model: string;
  paint: string;
}

export interface GarageState {
  cars: OwnedCar[];
  /** uid of the car you're driving right now (null = on foot). */
  driving: string | null;
  licence: { points: number; suspendedUntil: number; lastFade: number; tickets: number };
}

export const newGarageState = (): GarageState => ({ cars: [], driving: null, licence: { points: 0, suspendedUntil: 0, lastFade: 0, tickets: 0 } });

export function drivingCar(s: GameState): OwnedCar | null {
  return s.garage.cars.find((c) => c.uid === s.garage.driving) ?? null;
}

export function licenceSuspended(s: GameState): boolean {
  return s.garage.licence.suspendedUntil > nowMs();
}

/** Let points fade with time (call now and then; cheap). */
export function fadePoints(s: GameState): void {
  const l = s.garage.licence;
  const step = gameMinutesToRealMs(GARAGE.pointFadeDays * 24 * 60);
  if (!l.lastFade) l.lastFade = nowMs();
  while (l.points > 0 && nowMs() - l.lastFade >= step) {
    l.points--;
    l.lastFade += step;
  }
  if (l.points === 0) l.lastFade = nowMs();
}

export function buyCar(s: GameState, modelId: string, paint?: string): string | null {
  const v = VEHICLES.get(modelId);
  if (!v || v.service || v.price <= 0) return 'That car isn’t for sale.';
  if (s.money + s.bank < v.price) return 'You can’t afford it yet.';
  if (s.garage.cars.length >= 5) return 'Your garage is full (5 cars). Sell one first.';
  chargeBill(s, v.price, `Bought a ${v.name}`);
  const car: OwnedCar = { uid: `car-${nowMs().toString(36)}-${Math.floor(Math.random() * 1e4)}`, model: v.id, paint: paint && v.paints.includes(paint) ? paint : v.paints[0] };
  s.garage.cars.push(car);
  addMoodlet(s, { id: 'newCar', label: 'New car smell', emoji: '🚗', value: 20, minutes: 60 * 24 });
  return null;
}

export function sellCar(s: GameState, uid: string): number {
  const i = s.garage.cars.findIndex((c) => c.uid === uid);
  if (i < 0) return 0;
  const v = VEHICLES.get(s.garage.cars[i].model);
  const amount = Math.round(((v?.price ?? 0) * GARAGE.resale) / 100) * 100;
  s.garage.cars.splice(i, 1);
  if (s.garage.driving === uid) s.garage.driving = null;
  if (amount > 0) {
    // Big sales go straight to the bank (cash on hand stays sensible).
    s.bank += amount;
    s.ledger.unshift({ at: nowMs(), delta: amount, balance: s.money, reason: `Sold a ${v?.name ?? 'car'} (to bank)` });
  }
  return amount;
}

export interface TripResult {
  /** Multiply the trip time by this. */
  timeFactor: number;
  lines: string[];
  tone: 'good' | 'bad' | 'info';
  /** True if the trip ended in a cell or the hospital (don't arrive). */
  stopped: boolean;
}

/** Drive somewhere in your own car. `floorIt` = speeding. */
export function driveTrip(s: GameState, floorIt: boolean, weather: string): TripResult {
  const out: TripResult = { timeFactor: floorIt ? 0.5 : 0.8, lines: [], tone: 'good', stopped: false };
  if (s.money >= GARAGE.tripCost) changeMoney(s, -GARAGE.tripCost, 'Gas and tolls');
  fadePoints(s);

  if (licenceSuspended(s) && Math.random() < GARAGE.suspendedCatchOdds) {
    out.lines.push(arrest(s, 'driving on a suspended licence', 12, 120_000));
    out.tone = 'bad';
    out.stopped = true;
    return out;
  }
  if (floorIt) {
    applyNeeds(s, { fun: 12 });
    if (isWet(weather) && Math.random() < GARAGE.wetCrashOdds) {
      const { short } = chargeBill(s, 60_000, 'ER visit (car crash)');
      addDebt(s, short);
      applyNeeds(s, { energy: -40, fun: -30 });
      addMoodlet(s, { id: 'crashed', label: 'Shaken up after a crash', emoji: '🚑', value: -25, minutes: 60 * 24 });
      out.lines.push('💥 You lost it on the wet road. A night in the ER and a $600 bill. Slow down in the rain!');
      out.tone = 'bad';
      out.stopped = true;
      return out;
    }
    if (Math.random() < GARAGE.ticketOdds) {
      const l = s.garage.licence;
      chargeBill(s, GARAGE.ticketFine, 'Speeding ticket');
      l.points += GARAGE.ticketPoints;
      l.tickets++;
      out.tone = 'bad';
      out.lines.push(`🚨 Pulled over! Speeding ticket: $${GARAGE.ticketFine / 100} and ${GARAGE.ticketPoints} points (${l.points}/${GARAGE.suspendAt}).`);
      if (l.points >= GARAGE.suspendAt) {
        l.suspendedUntil = nowMs() + gameMinutesToRealMs(GARAGE.suspendDays * 24 * 60);
        l.points = 0;
        out.lines.push(`🪪 Licence SUSPENDED for ${GARAGE.suspendDays} days. Driving now could get you arrested.`);
      }
    } else out.lines.push('🏎️ You flew across town. What a rush!');
  }
  return out;
}

/** Your Cool rating right now (0–100). */
export function coolScore(s: GameState): { total: number; car: number; outfit: number; fame: number } {
  const best = s.garage.cars.map((c) => VEHICLES.get(c.model)).filter((v) => !!v).map((v) => RARITY_INFO[v!.rarity].cool);
  const driving = drivingCar(s);
  const drivingCool = driving ? RARITY_INFO[VEHICLES.get(driving.model)?.rarity ?? 'common'].cool : 0;
  const car = Math.round(Math.max(drivingCool, (Math.max(0, ...best) || 0) * 0.5));
  const l = s.profile.look;
  const worn = [l.topId, l.bottomId, l.shoesId, l.hatId, l.extraId].map((id) => (id ? CLOTHES.get(id) : undefined)).filter((x) => !!x);
  const outfit = Math.min(30, worn.reduce((sum, item) => sum + ({ plain: 1, premium: 4, exclusive: 7 } as const)[tierOf(item!)], 0));
  const fame = Math.min(20, Math.floor((s.paths.rep.celebrity ?? 0) / 40));
  return { total: Math.min(100, car + outfit + fame), car, outfit, fame };
}

/** Multiplier for social/fame gains from being cool (1.0 – 1.5). */
export function coolBonus(s: GameState): number {
  return 1 + coolScore(s).total / 200;
}

export { carsForSale };
