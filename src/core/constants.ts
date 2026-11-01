// =====================================================================
// constants.ts — every balance number and tuning value in one place.
//
// Rule of thumb: game logic files should not contain "magic numbers".
// If you want to make the game easier, harder, cheaper or faster,
// this is the file to change.
//
// Money is stored in CENTS everywhere (integers), so $2.90 is 290.
// Using whole cents avoids rounding bugs that floats cause with money.
// =====================================================================

/** Name of the browser storage key that holds the single-player save. */
export const SAVE_KEY = 'nyclife.save.v1';

/** Bump this when the save format changes; see core/save.ts migrations. */
export const SAVE_VERSION = 1;

/** The real-world time zone the game clock follows (1 real minute = 1 game minute). */
export const GAME_TIME_ZONE = 'America/New_York';

/**
 * How long one in-game day lasts in REAL minutes (Peter, 2026-11-01: 33).
 * The sun, the clock and opening hours run on this: the game day turns
 * about 44 times in one real day. Everyone shares the same game clock:
 * it's worked out from the real time, so all players see the same hour.
 * (It was 203 = 3 h 23 min until 2026-11-01.)
 */
export const GAME_DAY_REAL_MINUTES = 33;

/**
 * The BALANCE DAY, in real minutes: the old game day (3 h 23 min).
 * Money, caps and cooldowns that should keep the same pace per REAL hour
 * whatever speed the visible clock runs at count in balance days:
 * rent and loans (7 balance days ≈ one real day), shifts per day,
 * business days, debt collectors, crew turf, daily challenges, the stock
 * market, jail time, licence points, the friendship cap… core/clock.ts
 * `balanceTime()` / `balanceDay()`. Its date keys are exactly the ones
 * saves written before 2026-11-01 hold, so old saves carry on without a
 * burst of catch-up days. See BALANCE NOTES in docs/HANDOFF.md.
 */
export const BALANCE_DAY_REAL_MINUTES = 203;

/** Minimum age to play, matching the Terms of Use draft. */
export const MIN_AGE = 21;

// ---------------------------------------------------------------------
// Needs (0 = empty/bad, 100 = full/good)
// ---------------------------------------------------------------------

/** One game day in real minutes, for writing need targets in game days (e.g. `1.5 * GAME_DAY`). */
export const GAME_DAY = GAME_DAY_REAL_MINUTES;

/**
 * NEED DRAIN TARGETS — the one table to tune (Peter, 2026-11-01, final).
 * How long each need takes to drain from full (100) to empty (0) while
 * you play, before weather, in REAL minutes. Peter set them in GAME days
 * (`1.5 * GAME_DAY` = 1.5 game days = 49.5 real minutes), so they follow
 * GAME_DAY_REAL_MINUTES if the day length changes; plain numbers are real
 * minutes. Bladder "fills up", which we model as the meter going down
 * like the others so that every bar in the UI means "higher is better".
 */
export const NEED_EMPTY_AFTER: Record<'hunger' | 'energy' | 'fun' | 'social' | 'hygiene' | 'bladder', number> = {
  hunger: 1.5 * GAME_DAY, // 49.5 real min
  energy: 1.5 * GAME_DAY, // 49.5 real min
  fun: 2 * GAME_DAY, // 66 real min
  social: 2 * GAME_DAY, // 66 real min
  hygiene: 3 * GAME_DAY, // 99 real min
  bladder: 1.5 * GAME_DAY, // 49.5 real min
};

/**
 * Points each need LOSES per REAL hour of play, worked out from
 * NEED_EMPTY_AFTER (100 points over that many minutes). Don't edit these:
 * edit the table above. (sim/needs.ts decayNeeds is fed real hours.)
 */
export const NEED_DECAY_PER_HOUR: Record<keyof typeof NEED_EMPTY_AFTER, number> = Object.fromEntries(
  Object.entries(NEED_EMPTY_AFTER).map(([k, min]) => [k, 6000 / min]),
) as Record<keyof typeof NEED_EMPTY_AFTER, number>;

/** When we load a save after time away, simulate at most this many hours. */
export const OFFLINE_CATCHUP_MAX_HOURS = 12;

/**
 * While away (a gap of 15+ minutes), needs drain at this share of the play
 * rate: your Sim is assumed to be sleeping or idle. 0.03 keeps the drain
 * per real hour away about where it was before the 2026-11-01 retune
 * (old 0.35 × 9 hunger an hour ≈ 0.03 × 121): a night away (8 h) costs
 * about a third of hunger, not everything.
 */
export const OFFLINE_DECAY_MULTIPLIER = 0.03;

/** Below this value a need counts as "low" and starts hurting your mood. */
export const NEED_LOW = 25;

// ---------------------------------------------------------------------
// Money and economy (all in cents)
// ---------------------------------------------------------------------

export const START_MONEY = {
  trustFund: 2_500_000, // $25,000 and a paid-for apartment in the West Village
  hustler: 60_000, // $600 and a student loan
} as const;

/** The Hustler start: a loan that must be repaid weekly. */
export const HUSTLER_LOAN = { owed: 1_200_000, weekly: 15_000 } as const;

/** Subway fare (OMNY-style tap), in cents. */
export const SUBWAY_FARE = 290;

/**
 * How long trips take, in real seconds (Peter, 2026-10-15): the train is
 * ~10 s and a long walk ~15 s, each an ad then a ~4 s scene; a rideshare
 * is ~5 s. Walks shorter than walkLive seconds are just walked live.
 */
export const TRAVEL_SECONDS = { trainAd: 6, trainScene: 4, walkAd: 11, walkScene: 4, walkLive: 15, ride: 5 } as const;

/** Rideshare Black: street rep per ride, at most once per this many BALANCE minutes (≈ 17 real minutes). */
export const BLACK_CAR_REP = { points: 3, everyGameMinutes: 120 } as const;

/** Rideshare pricing: base fare + per 100 metres, times surge. */
export const RIDESHARE = { base: 450, per100m: 35, minFare: 800, luxuryMultiplier: 2.4 } as const;

/**
 * Rent is charged every 7 BALANCE days (BALANCE_DAY_REAL_MINUTES, the old
 * 3 h 23 min game day), which is about once per REAL day whatever speed
 * the visible clock runs at. So these are balanced as "what a day of real
 * play should cover" (BALANCE NOTES in docs/HANDOFF.md): an entry-level
 * job (~$90 a shift, 6 shifts per balance day) covers a shared room after one short session and a studio after
 * two; the loft is a mid-career goal. The real numbers live on each home
 * place in data/places.ts (`rent`); these are the reference values.
 */
export const WEEKLY_RENT = {
  shared: 18_000, // room in a shared apartment
  studio: 35_000, // Hell's Kitchen studio
  loft: 90_000, // Fulton St loft
} as const;

/** How many ledger lines we keep in the save (the Bank app shows them). */
export const LEDGER_KEEP = 60;

/** Largest single change to money we accept (anti-bug guard). Server will enforce the real one. */
export const MAX_SINGLE_TRANSACTION = 500_000_000; // $5,000,000 (businesses and investments are big)

// ---------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------

/** A shift is a short real-time task, like Lagos Life's "1-hour shifts". */
export const SHIFT_SECONDS = 20;

/** How long a shift reads on the shift screen's own clock (cosmetic: the city clock doesn't skip). */
export const SHIFT_GAME_HOURS = 4;

/**
 * Shifts per BALANCE day (Peter, 2026-10-14: six per old game day). Counted
 * per balance day (3 h 23 min real), not per 33-minute game day, so the
 * real-time cap stays at 6 shifts per ~3.4 real hours.
 */
export const MAX_SHIFTS_PER_DAY = 6;

/** Shifts can only start between these New York hours. */
export const WORK_HOURS = { start: 6, end: 23 } as const;

/** Performance needed (0-100) plus shifts done before a promotion is offered. */
export const PROMOTION = { minPerformance: 70, shiftsPerLevel: 14 } as const;

// ---------------------------------------------------------------------
// Random events ("the director")
// ---------------------------------------------------------------------

/** The director considers firing an event this often (seconds of play). */
export const DIRECTOR_TICK_SECONDS = 25;

/** Never fire two random events closer together than this (seconds). */
export const EVENT_MIN_GAP_SECONDS = 70;

/** Base chance per director tick that *something* happens (before context). */
export const EVENT_BASE_CHANCE = 0.42;

/** An individual event can't repeat for this long (seconds). */
export const EVENT_COOLDOWN_SECONDS = 60 * 20;

// ---------------------------------------------------------------------
// World / rendering
// ---------------------------------------------------------------------

/** Size of one chunk of city, in metres. Chunks load/unload as you move. */
export const CHUNK_SIZE = 120;

/** Chunks closer than this (metres) show full detail; further ones are simplified. */
export const DETAIL_RADIUS = 260;

/** NPCs further than this from the camera target are not drawn. */
export const CROWD_RADIUS = 170;

/** Camera zoom limits (metres from the player). Zoom out far to see the whole area. */
/**
 * Camera: a slanted top-down view (Township / Hay Day style). You can
 * zoom and spin, but the tilt stays between ~26° and ~56° from straight
 * down, so streets, ads and your character are always in view.
 */
export const CAMERA = { minDistance: 16, maxDistance: 190, startDistance: 100 } as const; // max: a little further than where it starts, about 0.4 of the old 480 (Peter, 2026-10-14); // max: about 6-8 blocks (Peter, 2026-10-12)

/**
 * The sky map's furthest zoom (metres from the ground point it looks at):
 * about 6-8 blocks on a phone (Peter, 2026-10-12). Zoomed further
 * the 3D city turns into grey noise and gets heavy for cheap phones; the
 * 🗺️ City button opens the flat map of the whole city instead.
 */
/**
 * Satellite map, straight down (Peter, 2026-10-14): fully zoomed out it shows
 * about three quarters of Manhattan, and it opens that way. The camera
 * distance follows from the 50° field of view: half the span / tan(25°).
 */
export const MAP_SPAN_FRACTION = 0.1; // satellite max zoom-out (Peter, 2026-10-15: 0.3 → 0.26 → 0.22 → 0.18 → 0.15 → 0.12; 2026-10-30: 0.1, so the ads on the ad spaces stay readable)
/** Manhattan's land in world units (data/geo/manhattan-shore.ts). */
export const MANHATTAN_BOUNDS = { minX: -770, maxX: 1212, minZ: -2955, maxZ: 1754 } as const;
export const MAP_MAX_DISTANCE = Math.round((MAP_SPAN_FRACTION * (MANHATTAN_BOUNDS.maxZ - MANHATTAN_BOUNDS.minZ)) / 2 / Math.tan((25 * Math.PI) / 180));

/**
 * Player travel speed on foot, metres per second. Faster than a real walk
 * so short trips don't drag; the character plays a light jog at this
 * speed (see world/folk.ts → Actor.move). Long trips: take the subway.
 */
/** Walking speed inside homes (m/s): a relaxed indoor stroll. */
export const INDOOR_WALK = 1.9;
export const WALK_SPEED = 6.5; // was 5: blocks got bigger (2026-10-12)

/** Billboards: how long each ad shows before the next one rotates in (seconds). */
export const AD_ROTATE_SECONDS = 15;

/** An ad view only counts if it covers at least this fraction of the screen height. */
export const AD_MIN_SCREEN_FRACTION = 0.06;

/** Only this many screens animate/rotate at once; the rest hold a still frame. */
export const AD_MAX_LIVE = { low: 3, medium: 6, high: 10 } as const;
