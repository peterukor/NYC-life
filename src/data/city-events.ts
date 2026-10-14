// =====================================================================
// city-events.ts — what's happening in the city TODAY. Plug-in data.
//
// Every game day each area gets a few events at real places and times:
// a block party in the park, a celebrity sighting at a landmark, a food
// truck festival, a flash mob in Times Square, a sample sale, an open
// mic, a street race at night… Weather adds its own (hydrant parties in
// a heat wave, snowball fights in the snow).
//
// They're SEEDED by area + game day, so every player sees the same
// events at the same places — two friends can meet at the block party.
// They show up as pins (data/pins.ts → 'city-events') and in the ☰
// HAPPENING NOW list, and the place's card gets a button to join in
// (once per event per player).
//
// TO ADD AN EVENT: add a CITY_EVENTS entry (where, when, weight, join).
// =====================================================================

import { Registry } from '../core/registry.ts';
import { Rng } from '../core/rng.ts';
import { money } from '../core/format.ts';
import { chargeBill, changeMoney } from '../sim/economy.ts';
import { coolScore, drivingCar, licenceSuspended } from '../sim/garage.ts';
import { arrest } from '../sim/jail.ts';
import { addMoodlet, applyNeeds } from '../sim/needs.ts';
import type { AreaId, GameState } from '../sim/types.ts';
import { CLOTHES, tierOf } from './wardrobe.ts';
import { doorOf, placesIn, type PlaceDef } from './places.ts';
import { RARITY_INFO, VEHICLES } from './vehicles.ts';

export interface JoinResult {
  text: string;
  tone: 'good' | 'bad' | 'info';
}

export interface CityEventDef {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  /** Which places can host it. */
  where: (p: PlaceDef) => boolean;
  /** Start hour range and how long it runs (hours). */
  start: [number, number];
  hours: number;
  /** Relative chance today (weather id, month). 0 = not today. */
  weight: (weather: string, month: number) => number;
  /** Label for the join button. */
  joinLabel: string;
  /** Can you join right now (e.g. needs a car)? Return a reason if not. */
  blocker?: (s: GameState) => string | null;
  join: (s: GameState) => JoinResult;
}

export const CITY_EVENTS = new Registry<CityEventDef>('city event');

const outdoors = (p: PlaceDef) => p.type === 'park' || p.type === 'plaza';

CITY_EVENTS.add(
  {
    id: 'blockParty', title: 'Block party', emoji: '🎉', blurb: 'Speakers on the stoop, grills going, everyone’s cousin is here.',
    where: outdoors, start: [13, 17], hours: 4, weight: (w) => (w === 'sunny' || w === 'cloudy' || w === 'heatwave' ? 3 : 0.2), joinLabel: 'Join the party',
    join: (s) => {
      applyNeeds(s, { fun: 30, social: 35, hunger: 20 });
      addMoodlet(s, { id: 'blockParty', label: 'Block party vibes', emoji: '🎉', value: 15, minutes: 60 * 8 });
      return { text: 'You danced, ate three burgers and met half the neighbourhood.', tone: 'good' };
    },
  },
  {
    id: 'celebSighting', title: 'Celebrity sighting', emoji: '🌟', blurb: 'Someone VERY famous is filming here. Phones are up.',
    where: (p) => p.type === 'landmark' || p.type === 'plaza', start: [10, 20], hours: 2, weight: () => 1.5, joinLabel: 'Try for a selfie',
    join: (s) => {
      const cool = coolScore(s).total;
      if (Math.random() < 0.45 + cool / 200) {
        s.paths.rep.celebrity = (s.paths.rep.celebrity ?? 0) + 12 + Math.round(cool / 10);
        applyNeeds(s, { fun: 20 });
        return { text: 'Selfie secured! It’s blowing up online. (+fame)', tone: 'good' };
      }
      return { text: 'Security blocked you. You got a great photo of a bodyguard’s elbow.', tone: 'info' };
    },
  },
  {
    id: 'foodTrucks', title: 'Food truck festival', emoji: '🚚', blurb: 'Tacos, dumplings, jerk chicken, halal carts and a lobster roll that costs too much.',
    where: outdoors, start: [11, 14], hours: 5, weight: (w) => (w === 'rain' || w === 'storm' || w === 'flood' ? 0 : 2), joinLabel: 'Eat your way through ($8)',
    blocker: (s) => (s.money < 800 ? 'You need $8 cash.' : null),
    join: (s) => {
      changeMoney(s, -800, 'Food truck festival');
      applyNeeds(s, { hunger: 55, fun: 12 });
      return { text: 'You ate something from every continent. No regrets.', tone: 'good' };
    },
  },
  {
    id: 'flashMob', title: 'Flash mob', emoji: '🕺', blurb: 'At exactly the top of the hour, fifty strangers start dancing.',
    where: (p) => p.type === 'plaza', start: [12, 19], hours: 1, weight: () => 1.2, joinLabel: 'Join in',
    join: (s) => {
      applyNeeds(s, { fun: 25, energy: -10 });
      if (Math.random() < 0.3) {
        s.paths.rep.celebrity = (s.paths.rep.celebrity ?? 0) + 20;
        return { text: 'You were front and centre in the video that went viral. (+fame)', tone: 'good' };
      }
      return { text: 'You nailed the choreography. Mostly.', tone: 'good' };
    },
  },
  {
    id: 'sampleSale', title: 'Sample sale', emoji: '🛍️', blurb: 'Designer pieces at a fraction of the price. Elbows out.',
    where: (p) => p.type === 'shop', start: [10, 15], hours: 4, weight: () => 1.4, joinLabel: 'Fight for a deal ($40)',
    blocker: (s) => (s.money + s.bank < 4_000 ? 'You need $40.' : null),
    join: (s) => {
      const pool = CLOTHES.all().filter((c) => c.price > 0 && tierOf(c) === 'premium' && !s.wardrobe.includes(c.id));
      chargeBill(s, 4_000, 'Sample sale');
      if (!pool.length || Math.random() < 0.25) return { text: 'Someone snatched the last one out of your hands. You got a tote bag.', tone: 'info' };
      const item = pool[Math.floor(Math.random() * pool.length)];
      s.wardrobe.push(item.id);
      return { text: `Score! ${item.emoji} ${item.name} (worth ${money(item.price)}) is in your closet.`, tone: 'good' };
    },
  },
  {
    id: 'openMic', title: 'Open mic night', emoji: '🎙️', blurb: 'Sign-up sheet by the bar. Five minutes. No mercy.',
    where: (p) => p.type === 'nightlife', start: [19, 21], hours: 3, weight: () => 1.6, joinLabel: 'Take the mic',
    join: (s) => {
      const skill = (s.skills.music ?? 0) + (s.skills.charisma ?? 0);
      if (Math.random() < 0.3 + skill * 0.06) {
        const tips = (20 + Math.floor(Math.random() * 60)) * 100;
        changeMoney(s, tips, 'Open mic tips');
        s.paths.rep.celebrity = (s.paths.rep.celebrity ?? 0) + 8;
        s.skills.music += 0.3;
        applyNeeds(s, { fun: 25 });
        return { text: `You killed it. Standing ovation and ${money(tips)} in the tip jar.`, tone: 'good' };
      }
      s.skills.charisma += 0.15;
      applyNeeds(s, { fun: -10 });
      return { text: 'You bombed. A man coughed for the whole set. You’ll be back.', tone: 'bad' };
    },
  },
  {
    id: 'hydrantParty', title: 'Hydrant party', emoji: '🚒', blurb: 'Someone opened the fire hydrant. The whole block is in the spray.',
    where: outdoors, start: [12, 15], hours: 4, weight: (w) => (w === 'heatwave' ? 6 : 0), joinLabel: 'Run through the spray',
    join: (s) => {
      applyNeeds(s, { hygiene: 20, fun: 30, energy: 10 });
      return { text: 'Best ten minutes of the summer.', tone: 'good' };
    },
  },
  {
    id: 'snowballFight', title: 'Snowball fight', emoji: '☃️', blurb: 'Two teams, no rules, one very tall snowman.',
    where: (p) => p.type === 'park', start: [10, 15], hours: 4, weight: (w) => (w === 'snow' ? 6 : 0), joinLabel: 'Pick a side',
    join: (s) => {
      applyNeeds(s, { fun: 35, energy: -15, social: 20 });
      return { text: 'Your team won. You have snow in places snow shouldn’t be.', tone: 'good' };
    },
  },
  {
    id: 'streetRace', title: 'Midnight street race', emoji: '🏁', blurb: 'Engines revving. $200 buy-in, winner takes the pot. Cops could show.',
    where: (p) => p.type === 'plaza' || p.type === 'landmark', start: [22, 23], hours: 3, weight: () => 1.1, joinLabel: 'Race ($200 buy-in)',
    blocker: (s) => (!drivingCar(s) ? 'You need to be driving your own car.' : s.money + s.bank < 20_000 ? 'Buy-in is $200.' : null),
    join: (s) => {
      const car = drivingCar(s)!;
      const v = VEHICLES.get(car.model);
      chargeBill(s, 20_000, 'Street race buy-in');
      if (Math.random() < 0.15 || (licenceSuspended(s) && Math.random() < 0.4)) return { text: arrest(s, 'illegal street racing', 10, 60_000), tone: 'bad' };
      const edge = v ? RARITY_INFO[v.rarity].cool / 100 : 0;
      if (Math.random() < 0.3 + edge) {
        changeMoney(s, 60_000, 'Street race winnings');
        s.paths.rep.crime = (s.paths.rep.crime ?? 0) + 6;
        addMoodlet(s, { id: 'wonRace', label: 'Won the race', emoji: '🏁', value: 20, minutes: 60 * 12 });
        return { text: 'You crossed the line first. $600 pot is yours.', tone: 'good' };
      }
      return { text: `You came second. ${v?.name ?? 'Your car'} was fast, just not fast enough.`, tone: 'bad' };
    },
  },
);

export interface ActiveEvent {
  /** Unique for this event today: what you can only join once. */
  key: string;
  def: CityEventDef;
  place: PlaceDef;
  start: number;
  end: number;
}

/** Today's events in an area (seeded: the same for every player). */
export function todaysEvents(area: AreaId, dateKey: string, weather: string): ActiveEvent[] {
  const rng = new Rng(`city-events-${area}-${dateKey}`);
  const month = Number(dateKey.slice(5, 7));
  const places = placesIn(area);
  const defs = CITY_EVENTS.all().map((d) => ({ d, w: d.weight(weather, month) })).filter((x) => x.w > 0);
  const out: ActiveEvent[] = [];
  for (let i = 0; i < 4 && defs.length; i++) {
    let t = rng.next() * defs.reduce((a, b) => a + b.w, 0);
    const pick = defs.find((x) => (t -= x.w) <= 0) ?? defs[0];
    defs.splice(defs.indexOf(pick), 1);
    const hosts = places.filter(pick.d.where).filter((p) => !out.some((o) => o.place.id === p.id));
    if (!hosts.length) continue;
    const place = rng.pick(hosts);
    const start = rng.int(pick.d.start[0], pick.d.start[1]);
    out.push({ key: `${pick.d.id}-${place.id}-${dateKey}`, def: pick.d, place, start, end: start + pick.d.hours });
  }
  return out;
}

/** Is it running at this hour (handles events running past midnight)? */
export function isLive(e: ActiveEvent, hour: number): boolean {
  const h = hour < e.start && e.end > 24 ? hour + 24 : hour;
  return h >= e.start && h < e.end;
}

export function eventAt(area: AreaId, placeId: string, dateKey: string, hour: number, weather: string): ActiveEvent | null {
  return todaysEvents(area, dateKey, weather).find((e) => e.place.id === placeId && isLive(e, hour)) ?? null;
}

export function joinEvent(s: GameState, e: ActiveEvent): JoinResult {
  if (s.joinedEvents.includes(e.key)) return { text: 'You already did this one today.', tone: 'info' };
  const why = e.def.blocker?.(s);
  if (why) return { text: why, tone: 'bad' };
  s.joinedEvents.push(e.key);
  if (s.joinedEvents.length > 40) s.joinedEvents.splice(0, s.joinedEvents.length - 40);
  return e.def.join(s);
}

/** Door position (for pins). */
export const eventDoor = (e: ActiveEvent) => doorOf(e.place);
