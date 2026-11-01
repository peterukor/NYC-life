// =====================================================================
// day-speed.test.ts — the 33-minute game day (Peter, 2026-11-01).
//
// The visible clock (sun, opening hours) runs ~6.15× faster than before;
// money, caps and cooldowns run on the BALANCE clock (the old 3 h 23 min
// day) so they keep their pace per real hour; needs drain to the real-
// minute targets in NEED_EMPTY_AFTER. Old saves carry straight on.
// =====================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCE_SPEED, GAME_SPEED, balanceDay, balanceMinutesToRealMs, balanceTime, daysBetween, gameMinutesToRealMs,
  initClockFromUrl, msToNextBalanceDay, nycTime,
} from '../src/core/clock.ts';
import {
  BALANCE_DAY_REAL_MINUTES, GAME_DAY_REAL_MINUTES, MAX_SHIFTS_PER_DAY, NEED_DECAY_PER_HOUR, NEED_EMPTY_AFTER,
  OFFLINE_DECAY_MULTIPLIER,
} from '../src/core/constants.ts';
import { newLife } from '../src/sim/state.ts';
import { decayNeeds } from '../src/sim/needs.ts';
import { advanceTo } from '../src/sim/life.ts';
import { completeShift, shiftBlocker } from '../src/sim/work.ts';
import { buyBusiness } from '../src/sim/business.ts';
import { marketTick } from '../src/sim/market.ts';
import { clampBalanceKeys, migrate } from '../src/sim/save.ts';
import { DERBY_PRIZES, fishingOf, settleDerby } from '../src/sim/fishing.ts';
import { PLACE_BY_ID, isOpen } from '../src/data/places.ts';
import { CLUBS } from '../src/data/clubs.ts';
import { NEED_KEYS, type GameState } from '../src/sim/types.ts';

const look = { body: 'm', skin: '#c68642', hair: '#2b1d14', hairStyle: 'short', topId: 'tee', bottomId: 'jeans', shoesId: 'sneakers' } as never;
const fresh = (origin: 'hustler' | 'trustFund' = 'hustler') => newLife({ name: 'Test', origin, look, birthYear: 1995, traits: [] });
const MIN = 60_000;
const HOUR = 60 * MIN;

/** The game clock exactly as the code before 2026-11-01 worked it out (203-minute days). */
function oldDateKey(ms: number): string {
  const g = new Date(Date.UTC(2026, 0, 1) + (ms - Date.UTC(2026, 0, 1, 5)) * (1440 / 203));
  return g.toISOString().slice(0, 10);
}

// ----------------------------------------------------------------- the clocks

test('a game day is 33 real minutes: ~43.6 game minutes per real minute', () => {
  assert.equal(GAME_DAY_REAL_MINUTES, 33);
  assert.ok(Math.abs(GAME_SPEED - 43.64) < 0.01, `GAME_SPEED ${GAME_SPEED}`);
  const t0 = Date.UTC(2026, 10, 1, 12);
  const a = nycTime(t0), b = nycTime(t0 + MIN);
  let d = (b.hourFloat - a.hourFloat) * 60;
  if (d < 0) d += 1440;
  assert.ok(Math.abs(d - 43.64) < 0.1, `one real minute moved the clock ${d} game minutes`);
  assert.ok(Math.abs(gameMinutesToRealMs(1440) - 33 * MIN) < 1, 'a game day is 33 real minutes');
});

test('the balance clock is the old 3 h 23 min day, key for key', () => {
  assert.equal(BALANCE_DAY_REAL_MINUTES, 203);
  assert.ok(Math.abs(BALANCE_SPEED - 1440 / 203) < 1e-9);
  // Same keys the old game clock gave, so every key in an old save still means the same day.
  for (const ms of [Date.UTC(2026, 3, 2, 7, 13), Date.UTC(2026, 9, 30, 23, 59), Date.UTC(2026, 10, 1), Date.now()]) {
    assert.equal(balanceDay(ms), oldDateKey(ms), new Date(ms).toISOString());
  }
  assert.ok(Math.abs(balanceMinutesToRealMs(1440) - 203 * MIN) < 1, 'a balance day is 203 real minutes');
  const next = msToNextBalanceDay();
  assert.ok(next > 0 && next <= 203 * MIN);
  assert.notEqual(balanceDay(Date.now() + next + 1000), balanceDay(), 'a new balance day after the countdown');
});

test('the market keeps ticking on the balance clock (same prices as before the speed-up)', () => {
  const ms = Date.UTC(2026, 9, 31, 18, 0);
  const g = new Date(Date.UTC(2026, 0, 1) + (ms - Date.UTC(2026, 0, 1, 5)) * (1440 / 203));
  const oldTick = Math.round((Date.UTC(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate()) - Date.UTC(2026, 0, 1)) / 86_400_000) * 24 + g.getUTCHours();
  assert.equal(marketTick(balanceTime(ms)), oldTick);
});

// ----------------------------------------------------------------- needs

test('each need empties in its target real minutes (NEED_EMPTY_AFTER), not sooner', () => {
  assert.deepEqual({ ...NEED_EMPTY_AFTER }, { hunger: 90, energy: 150, fun: 120, social: 180, hygiene: 180, bladder: 60 });
  for (const k of NEED_KEYS) {
    const target = NEED_EMPTY_AFTER[k];
    const s = fresh();
    s.needs[k] = 100;
    decayNeeds(s, (0.95 * target) / 60);
    assert.ok(s.needs[k] > 0 && s.needs[k] < 10, `${k}: still a little left at 95% of ${target} min (${s.needs[k]})`);
    decayNeeds(s, (0.05 * target) / 60 + 1e-9);
    assert.ok(s.needs[k] <= 1e-6, `${k}: empty after ${target} real minutes`);
    assert.ok(Math.abs(NEED_DECAY_PER_HOUR[k] - 6000 / target) < 1e-9);
  }
});

test('need drain runs on real time while playing (frame-by-frame advanceTo)', () => {
  const s = fresh();
  const start = Date.UTC(2026, 10, 1, 15);
  s.lastTick = start;
  s.stats.dayKey = balanceDay(start);
  for (const k of NEED_KEYS) s.needs[k] = 100;
  // 30 real minutes in 2-second frames.
  for (let t = start; t <= start + 30 * MIN; t += 2000) advanceTo(s, t);
  // Weather can nudge a need ±50%, so check with that much slack.
  for (const k of NEED_KEYS) {
    const expect = 100 - (30 / NEED_EMPTY_AFTER[k]) * 100;
    assert.ok(Math.abs(s.needs[k] - expect) <= (100 - expect) * 0.5 + 0.5, `${k}: ${s.needs[k].toFixed(1)} vs ~${expect.toFixed(1)}`);
  }
});

test('weather and the offline multiplier still scale need drain', () => {
  const a = fresh(), b = fresh();
  a.needs.hygiene = b.needs.hygiene = 100;
  decayNeeds(a, 0.5);
  decayNeeds(b, 0.5, 1, 'heatwave');
  assert.ok(b.needs.hygiene < a.needs.hygiene, 'a heat wave makes you sweatier');
  const c = fresh();
  c.needs.hunger = 100;
  decayNeeds(c, 1, OFFLINE_DECAY_MULTIPLIER);
  assert.ok(Math.abs(100 - c.needs.hunger - NEED_DECAY_PER_HOUR.hunger * OFFLINE_DECAY_MULTIPLIER) < 1e-9);
});

test('a night away drains needs about as much as before the retune (not to zero)', () => {
  const s = fresh();
  const now = Date.UTC(2026, 10, 1, 15);
  s.lastTick = now - 8 * HOUR;
  s.stats.dayKey = balanceDay(now);
  s.home.rentDueDay = balanceDay(now);
  for (const k of NEED_KEYS) s.needs[k] = 100;
  advanceTo(s, now);
  // Before: 8 h × 0.35 × 9 = 25 hunger. Now: 8 h × 0.05 × 66.7 ≈ 27.
  assert.ok(s.needs.hunger > 60 && s.needs.hunger < 85, `hunger ${s.needs.hunger}`);
  for (const k of NEED_KEYS) assert.ok(s.needs[k] > 40, `${k} ${s.needs[k]}`);
});

// ----------------------------------------------------------------- rent and money

/** A save as it stood at `then`, opened again at `now`. */
function awaySince(s: GameState, then: number): void {
  const k = balanceDay(then);
  s.lastTick = then;
  s.stats.dayKey = k;
  s.home.rentDueDay = k;
  if (s.loan) s.loan.lastPaidDay = k;
}

test('rent comes about once per real day (7 balance days), not every ~3.9 real hours', () => {
  const now = Date.now();
  const count = (realHours: number) => {
    const s = fresh('hustler');
    s.money = 10_000_000;
    s.loan = null;
    awaySince(s, now - realHours * HOUR);
    const before = s.ledger.length;
    advanceTo(s, now);
    return s.ledger.slice(before).filter((l) => l.delta < 0 && /rent/i.test(l.reason)).length;
  };
  assert.equal(count(4), 0, 'four real hours: no rent yet');
  assert.equal(count(25), 1, 'a real day: one rent');
  assert.equal(count(72), 3, 'three real days: three rents (not ~18)');
});

test('a very old due date charges at most a month of catch-up rent', () => {
  const s = fresh('hustler');
  s.money = 100_000_000;
  s.loan = null;
  const now = Date.now();
  awaySince(s, now - 400 * 24 * HOUR);
  const before = s.ledger.length;
  advanceTo(s, now);
  const rents = s.ledger.slice(before).filter((l) => l.delta < 0 && /rent/i.test(l.reason)).length;
  assert.equal(rents, 30);
  assert.ok(daysBetween(s.home.rentDueDay, balanceDay(now)) < 7, 'the due day caught up to this week');
});

test('businesses pay once per balance day (~3.4 real hours), however many game days passed', () => {
  const s = fresh('trustFund');
  s.money = 50_000_000;
  assert.equal(buyBusiness(s, 'cart'), null);
  const now = Date.now();
  // Five real minutes ago, same balance day: no business run.
  awaySince(s, now - 5 * MIN);
  s.stats.dayKey = balanceDay(now);
  advanceTo(s, now);
  assert.equal(s.business.owned[0].last, undefined, 'no business day inside the same balance day');
  // Three real days away (~130 game days): one business run, as before the speed-up.
  awaySince(s, now - 72 * HOUR);
  const before = s.ledger.length;
  advanceTo(s, now);
  assert.equal((s.business.owned[0] as { last?: { day: string } }).last?.day, balanceDay(now));
  const runs = s.ledger.slice(before).filter((l) => /^Business (income|losses)/.test(l.reason)).length;
  assert.ok(runs <= 1, `business runs: ${runs}`);
});

// ----------------------------------------------------------------- shifts

/** Move the test clock to `extraMin` real minutes after the start of the next balance day. */
function jumpPastBalanceStart(extraMin: number): void {
  initClockFromUrl('?clock=+0h');
  initClockFromUrl(`?clock=+${Math.ceil(msToNextBalanceDay() / MIN) + 1 + extraMin}m`);
}

test(`the shift cap is ${MAX_SHIFTS_PER_DAY} per balance day: a new 33-minute game day doesn't reset it`, () => {
  try {
    const s = fresh();
    // The cop works round the clock, so opening hours don't get in the way.
    s.job = { careerId: 'cop', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' };
    jumpPastBalanceStart(0);
    const day = balanceDay();
    const gameDay = nycTime().dateKey;
    for (let i = 0; i < MAX_SHIFTS_PER_DAY; i++) {
      s.needs.energy = 100;
      assert.equal(shiftBlocker(s), null, `shift ${i + 1}`);
      completeShift(s, 'chill', { played: false });
    }
    assert.match(shiftBlocker(s) ?? '', /6 shifts/);
    // 40 real minutes later it's a new game day, but the same balance day.
    jumpPastBalanceStart(40);
    assert.equal(balanceDay(), day);
    assert.notEqual(nycTime().dateKey, gameDay);
    s.needs.energy = 100;
    assert.match(shiftBlocker(s) ?? '', /6 shifts/, 'still capped after a game day passes');
    // A balance day later: back on the rota.
    jumpPastBalanceStart(205);
    assert.notEqual(balanceDay(), day);
    assert.equal(shiftBlocker(s), null);
  } finally {
    initClockFromUrl('?clock=+0h');
  }
});

// ----------------------------------------------------------------- old saves

test('an old save (keys from the 203-minute clock) loads without a burst of catch-up', () => {
  const now = Date.now();
  const then = now - 26 * HOUR;
  const s = fresh('hustler');
  s.money = 5_000_000;
  // Exactly what the old build wrote: game-day keys from the 203-minute clock.
  const k = oldDateKey(then);
  s.lastTick = then;
  s.stats.dayKey = k;
  s.home.rentDueDay = k;
  s.loan!.lastPaidDay = k;
  s.job = { careerId: 'deli', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 6, dayKey: k };
  const loaded = migrate(JSON.parse(JSON.stringify(s)))!;
  assert.ok(loaded);
  assert.equal(loaded.home.rentDueDay, k, 'old keys are kept as they are');
  const before = loaded.ledger.length;
  advanceTo(loaded, now);
  const lines = loaded.ledger.slice(before);
  assert.equal(lines.filter((l) => /rent/i.test(l.reason)).length, 1, 'one rent for one real day');
  assert.equal(lines.filter((l) => /loan/i.test(l.reason)).length, 1, 'one loan payment');
  assert.equal(loaded.job!.shiftsToday, 0, 'a new balance day, a fresh shift count');
});

test('save keys from the future (the fast game calendar) are reset to today, not decades of waiting', () => {
  const s = fresh('hustler');
  const future = nycTime(Date.now() + 365 * 24 * HOUR).dateKey; // years ahead on the 33-minute calendar
  s.home.rentDueDay = future;
  s.loan!.lastPaidDay = 'garbage';
  s.stats.dayKey = future;
  (s as { owned?: unknown }).owned = [{ placeId: 'hkStudio', price: 1, lastRent: future }];
  const today = balanceDay();
  clampBalanceKeys(s, today);
  assert.equal(s.home.rentDueDay, today);
  assert.equal(s.loan!.lastPaidDay, today);
  assert.equal(s.stats.dayKey, today);
  assert.equal((s.owned as { lastRent: string }[])[0].lastRent, today);
});

// ----------------------------------------------------------------- places

test('24-hour places (Peter, 2026-11-01) and real landmark hours', () => {
  for (const id of ['pixelPalace', 'hubArcade', 'barrioDeli', 'sliceJoint', 'ironGym', 'velvetRoom', 'empireCasino', 'navyYardClub']) {
    const p = PLACE_BY_ID[id];
    assert.ok(p, id);
    assert.equal(p.hours, undefined, `${id} has no hours`);
    for (let h = 0; h < 24; h++) assert.ok(isOpen(p, h), `${id} open at ${h}`);
  }
  assert.deepEqual(PLACE_BY_ID.statueOfLiberty.hours, [9, 16]);
  assert.deepEqual(PLACE_BY_ID.grantsTomb.hours, [9, 17]);
  assert.equal(isOpen(PLACE_BY_ID.statueOfLiberty, 8), false);
  assert.equal(isOpen(PLACE_BY_ID.statueOfLiberty, 15), true);
  assert.equal(isOpen(PLACE_BY_ID.grantsTomb, 17), false);
  // The Velvet Room never closes but stays on the ladder (its door still checks you): not an allDay club.
  const velvet = CLUBS.find((c) => c.placeId === 'velvetRoom')!;
  assert.equal(velvet.allDay, undefined);
  assert.equal(velvet.tier, 2);
});

// ----------------------------------------------------------------- the derby

test('the morning derby pays prize money once per balance day; a second podium is rep only', () => {
  const s = fresh();
  const rec = fishingOf(s);
  const day1 = '2066-01-01', day2 = '2066-01-02';
  const at = (dateKey: string) => ({ hour: 12, minute: 0, weekday: 3, dateKey, hourFloat: 12 });
  const now = Date.now() + msToNextBalanceDay() + MIN; // just after a balance day starts
  rec.derby = { day: day1, lb: 80, paid: false };
  const m0 = s.money;
  assert.ok(settleDerby(s, at(day1), now));
  assert.equal(s.money, m0 + DERBY_PRIZES[0]);
  // The next game morning, 33 real minutes later: same balance day.
  rec.derby = { day: day2, lb: 80, paid: false };
  const line = settleDerby(s, at(day2), now + 33 * MIN);
  assert.equal(balanceDay(now + 33 * MIN), balanceDay(now));
  assert.equal(s.money, m0 + DERBY_PRIZES[0], 'no second prize in the same balance day');
  assert.match(line ?? '', /rep/);
  // A balance day later the pier pays again.
  rec.derby = { day: '2066-01-09', lb: 80, paid: false };
  const before = s.money;
  settleDerby(s, at('2066-01-09'), now + 210 * MIN);
  assert.equal(s.money, before + DERBY_PRIZES[0]);
});
