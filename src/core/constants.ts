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
 * How long one in-game day lasts in REAL minutes. 203 = 3 h 23 min, so
 * the game day turns about 7 times in one real day. Change this one
 * number to speed the world up or slow it down (1440 = real time).
 * Everyone shares the same game clock: it's worked out from the real
 * time, so all players see the same hour.
 */
export const GAME_DAY_REAL_MINUTES = 203;

/** Minimum age to play, matching the Terms of Use draft. */
export const MIN_AGE = 21;

// ---------------------------------------------------------------------
// Needs (0 = empty/bad, 100 = full/good)
// ---------------------------------------------------------------------

/**
 * How many points each need LOSES per real hour while you go about your day.
 * Bladder "fills up", which we model as the meter going down like the others
 * so that every bar in the UI means "higher is better".
 */
export const NEED_DECAY_PER_HOUR = {
  hunger: 9,
  energy: 6,
  fun: 7,
  social: 5,
  hygiene: 5,
  bladder: 12,
} as const;

/** When we load a save after time away, simulate at most this many hours. */
export const OFFLINE_CATCHUP_MAX_HOURS = 12;

/** While away, needs drain slower (your Sim is assumed to be sleeping/idle). */
export const OFFLINE_DECAY_MULTIPLIER = 0.35;

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

/** Rideshare pricing: base fare + per 100 metres, times surge. */
export const RIDESHARE = { base: 450, per100m: 35, minFare: 800, luxuryMultiplier: 2.4 } as const;

/**
 * Rent is charged every 7 GAME days. With the fast clock (1 game day =
 * GAME_DAY_REAL_MINUTES) that is about once per REAL day, so these are
 * balanced as "what a day of real play should cover" (BALANCE NOTES in
 * docs/HANDOFF.md): an entry-level job (~$90 a shift, 4 shifts per game
 * day) covers a shared room after one short session and a studio after
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

/** How long a shift reads on the game clock (the timer "skips" these hours). */
export const SHIFT_GAME_HOURS = 4;

/** Shifts per GAME day (Peter, 2026-10-14: six). About 7 game days pass per real day. */
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
export const MAP_SPAN_FRACTION = 0.4; // Peter: max 0.4 of the whole map
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
