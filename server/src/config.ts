// =====================================================================
// config.ts — every setting comes from the environment, with safe local
// defaults so `npm run dev` just works. See server/README.md.
// =====================================================================

const env = process.env;
const list = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export const CONFIG = {
  port: Number(env.PORT ?? 2567),
  /** SQLite file (":memory:" for tests). Put it on a persistent disk in production. */
  dbPath: env.DB_PATH ?? './data/nyc-life.db',
  /** Where the game is served: links in emails point here (?reset=…, ?verify=…). */
  gameUrl: env.GAME_URL ?? 'https://peterukor.github.io/NYC-life/',
  /** Usernames with admin powers (review wires, hide art, ban). */
  admins: list(env.ADMINS).map((u) => u.toLowerCase()),
  /** Email: RESEND_API_KEY sends real mail through Resend; without it, emails are printed to the log. */
  resendKey: env.RESEND_API_KEY ?? '',
  mailFrom: env.MAIL_FROM ?? 'NYC Life <no-reply@nyclife.game>',
  /** Sessions last this long without use (days). */
  sessionDays: Number(env.SESSION_DAYS ?? 60),
  /** Set to "1" behind a proxy (Fly, Render, Railway…) so rate limits see the real IP. */
  trustProxy: env.TRUST_PROXY === '1',
};

/** Game rules the server enforces. Money is in cents, like the game. */
export const RULES = {
  /** Transfers: up to this much per sender per game day goes straight through… */
  transferDaily: 300_000,
  /** …more than that (or one transfer over this) is a wire that an admin reviews. */
  wireReview: 300_000,
  /** The biggest single transfer allowed at all. */
  transferMax: 5_000_000,
  /** Season points one report can add, and per real hour (anti-cheat caps). */
  pointsPerPost: 300,
  pointsPerHour: 2_500,
  /** Season prizes (cents) for the top 3 real players. Same as the game (sim/season.ts). */
  seasonPrizes: [200_000, 100_000, 50_000],
  /** A cloud save may be at most this big (bytes of JSON). */
  saveMaxBytes: 2_000_000,
  /** Paintings: data-URL size limit (bytes) and how many a player can hang per game day. */
  artMaxBytes: 90_000,
  artPerDay: 6,
  /**
   * 🏆 Game leaderboards (2026-10-27): the games that keep a best score, and the
   * highest score each could plausibly reach (anything above is refused).
   */
  scoreGames: {
    snake: 8_000, hoops: 5_000, pigeons: 15_000, beats: 20_000, stack: 15_000, dash: 30_000, claw: 2_000,
    pinball: 2_000_000, skeeball: 20_000, breakout: 200_000, rooftop: 200_000, airhockey: 2_000, axe: 150,
    bowling: 300, minigolf: 360,
  } as Record<string, number>,
  /** Score posts allowed per player per minute. */
  scorePostsPerMinute: 20,
};
