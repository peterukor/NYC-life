// =====================================================================
// features.ts — everything a signed-in player does with the server:
//
//  ☁️ Cloud save       one save per account, with a revision number so
//                      two phones can't silently overwrite each other.
//  🏆 Season board     real players' season points (3-day seasons, same
//                      clock as the game). Points are capped per report
//                      and per hour, so an edited client can't top it.
//                      The top 3 claim their prize once.
//  🖼️ Gallery          hang paintings, like other people's (once each).
//  💸 Transfers        send game money to another player. Up to $3,000
//                      a game day goes straight through; more becomes a
//                      wire an admin reviews. The receiver collects it.
//  🚩 Reports          flag a player, a painting or a chat line.
//  🛠️ Admin            review wires and reports, hide art, ban.
//
// Note: the game itself still runs on the phone (money, needs…), so the
// server checks what it can (caps, limits, one-time claims). A fully
// server-run economy is a later step.
// =====================================================================

import { nycTime } from '../../src/core/clock.ts';
import { RULES } from './config.ts';
import { tx } from './db.ts';
import { requireAdmin, requireUser, type Ctx, type User } from './auth.ts';
import { ApiError, bad, field, notFound, RateLimiter, tooMany, type ApiReq } from './http.ts';

const gameDay = () => nycTime().dateKey;

// ------------------------------------------------------------ 🏆 game leaderboards

const scoreLimiter = new RateLimiter(RULES.scorePostsPerMinute, 60_000);

/** Report a finished game's score; your best per game is kept. */
export function postScore(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const game = field(req.body, 'game', 'string')!;
  const score = Math.floor(field(req.body, 'score', 'number')!);
  const cap = RULES.scoreGames[game];
  if (cap === undefined) throw bad('Unknown game.');
  if (!(score >= 0) || score > cap) throw bad('That score isn’t possible.');
  if (!scoreLimiter.hit(`score:${u.id}`, ctx.now())) throw tooMany('Slow down a little.');
  const now = ctx.now();
  ctx.db.prepare('INSERT INTO game_scores (game, user_id, best, updated) VALUES (?, ?, ?, ?) ON CONFLICT(game, user_id) DO UPDATE SET best = excluded.best, updated = excluded.updated WHERE excluded.best > game_scores.best').run(game, u.id, score, now);
  const best = (ctx.db.prepare('SELECT best FROM game_scores WHERE game = ? AND user_id = ?').get(game, u.id) as { best: number }).best;
  return { game, best, newBest: best === score && score > 0 };
}

/** A game's top 20 (and your own place, if you're signed in and on the board). */
export function gameBoard(ctx: Ctx, req: ApiReq) {
  const game = req.params.game;
  if (RULES.scoreGames[game] === undefined) throw notFound('No such game.');
  const top = ctx.db
    .prepare('SELECT u.username, s.best AS score FROM game_scores s JOIN users u ON u.id = s.user_id WHERE s.game = ? AND u.banned = 0 ORDER BY s.best DESC, s.updated ASC LIMIT 20')
    .all(game) as { username: string; score: number }[];
  let you: { place: number; score: number } | null = null;
  const u = req.headers.get('authorization') ? safeUser(ctx, req) : null;
  if (u) {
    const mine = ctx.db.prepare('SELECT best, updated FROM game_scores WHERE game = ? AND user_id = ?').get(game, u.id) as { best: number; updated: number } | undefined;
    if (mine) {
      const ahead = (ctx.db.prepare('SELECT COUNT(*) AS n FROM game_scores s JOIN users x ON x.id = s.user_id WHERE s.game = ? AND x.banned = 0 AND (s.best > ? OR (s.best = ? AND s.updated < ?))').get(game, mine.best, mine.best, mine.updated) as { n: number }).n;
      you = { place: ahead + 1, score: mine.best };
    }
  }
  return { game, top, you };
}

// ------------------------------------------------------------ ☁️ cloud save

export function getSave(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const row = ctx.db.prepare('SELECT rev, data, updated FROM saves WHERE user_id = ?').get(u.id) as { rev: number; data: string; updated: number } | undefined;
  return row ? { rev: row.rev, updated: row.updated, save: JSON.parse(row.data) } : { rev: 0, updated: 0, save: null };
}

/** Store the save. `rev` must be the revision you last saw (0 for the first); otherwise 409 with what's there. */
export function putSave(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const rev = field(req.body, 'rev', 'number')!;
  const force = field(req.body, 'force', 'boolean', { optional: true }) ?? false;
  const save = (req.body as { save?: unknown }).save;
  if (!save || typeof save !== 'object') throw bad('Missing “save”.');
  const data = JSON.stringify(save);
  if (data.length > RULES.saveMaxBytes) throw bad('That save is too big.');
  return tx(ctx.db, () => {
    const cur = ctx.db.prepare('SELECT rev, updated FROM saves WHERE user_id = ?').get(u.id) as { rev: number; updated: number } | undefined;
    const have = cur?.rev ?? 0;
    if (have !== rev && !force) throw new ApiError(409, 'conflict', `Your cloud save changed on another device (${new Date(cur!.updated).toISOString()}).`);
    const next = have + 1;
    const now = ctx.now();
    ctx.db.prepare('INSERT INTO saves (user_id, rev, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET rev = excluded.rev, data = excluded.data, updated = excluded.updated').run(u.id, next, data, now);
    return { rev: next, updated: now };
  });
}

// ------------------------------------------------------------ 🏆 seasons

/** Same seasons as the game (src/sim/season.ts): 3 real days from 2026-10-01 UTC. */
export const SEASON = { days: 3, epoch: Date.UTC(2026, 9, 1) };
export const seasonId = (now: number) => Math.floor((now - SEASON.epoch) / (SEASON.days * 86_400_000));
export const seasonEnds = (id: number) => SEASON.epoch + (id + 1) * SEASON.days * 86_400_000;

export function addPoints(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const pts = Math.floor(field(req.body, 'points', 'number')!);
  if (pts <= 0) throw bad('Points must be positive.');
  const now = ctx.now();
  const season = seasonId(now);
  return tx(ctx.db, () => {
    const lastHour = (ctx.db.prepare('SELECT COALESCE(SUM(points), 0) AS n FROM point_log WHERE user_id = ? AND at > ?').get(u.id, now - 3_600_000) as { n: number }).n;
    // Anti-cheat: a report can add at most pointsPerPost, and only pointsPerHour in an hour.
    const add = Math.max(0, Math.min(pts, RULES.pointsPerPost, RULES.pointsPerHour - lastHour));
    if (add > 0) {
      ctx.db.prepare('INSERT INTO point_log (user_id, at, points) VALUES (?, ?, ?)').run(u.id, now, add);
      ctx.db.prepare('INSERT INTO season_points (season, user_id, points, updated) VALUES (?, ?, ?, ?) ON CONFLICT(season, user_id) DO UPDATE SET points = points + excluded.points, updated = excluded.updated').run(season, u.id, add, now);
    }
    ctx.db.prepare('DELETE FROM point_log WHERE at < ?').run(now - 2 * 3_600_000);
    const mine = (ctx.db.prepare('SELECT points FROM season_points WHERE season = ? AND user_id = ?').get(season, u.id) as { points: number } | undefined)?.points ?? 0;
    return { season, added: add, points: mine, capped: add < pts };
  });
}

function boardFor(ctx: Ctx, season: number, limit: number) {
  return ctx.db
    .prepare('SELECT u.username, p.points FROM season_points p JOIN users u ON u.id = p.user_id WHERE p.season = ? AND u.banned = 0 ORDER BY p.points DESC, p.updated ASC LIMIT ?')
    .all(season, limit) as { username: string; points: number }[];
}

export function seasonBoard(ctx: Ctx, req: ApiReq) {
  const now = ctx.now();
  const season = req.query.get('season') ? Number(req.query.get('season')) : seasonId(now);
  if (!Number.isInteger(season)) throw bad('Bad season.');
  const top = boardFor(ctx, season, 50);
  // Your own place, even outside the top 50.
  let you: { place: number; points: number } | null = null;
  const u = req.headers.get('authorization') ? safeUser(ctx, req) : null;
  if (u) {
    const mine = ctx.db.prepare('SELECT points, updated FROM season_points WHERE season = ? AND user_id = ?').get(season, u.id) as { points: number; updated: number } | undefined;
    if (mine) {
      const ahead = (ctx.db.prepare('SELECT COUNT(*) AS n FROM season_points p JOIN users x ON x.id = p.user_id WHERE p.season = ? AND x.banned = 0 AND (p.points > ? OR (p.points = ? AND p.updated < ?))').get(season, mine.points, mine.points, mine.updated) as { n: number }).n;
      you = { place: ahead + 1, points: mine.points };
    }
  }
  return { season, ends: seasonEnds(season), prizes: RULES.seasonPrizes, top, you };
}

/** Claim your prize for a finished season (once). */
export function claimSeason(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const season = field(req.body, 'season', 'number')!;
  if (season >= seasonId(ctx.now())) throw bad('That season isn’t over yet.');
  return tx(ctx.db, () => {
    const done = ctx.db.prepare('SELECT place, prize FROM season_claims WHERE season = ? AND user_id = ?').get(season, u.id) as { place: number; prize: number } | undefined;
    if (done) return { place: done.place, prize: 0, already: true };
    const place = boardFor(ctx, season, 3).findIndex((r) => r.username === u.username);
    const prize = place >= 0 ? RULES.seasonPrizes[place] : 0;
    ctx.db.prepare('INSERT INTO season_claims (season, user_id, place, prize) VALUES (?, ?, ?, ?)').run(season, u.id, place, prize);
    return { place, prize, already: false };
  });
}

function safeUser(ctx: Ctx, req: ApiReq): User | null {
  try {
    return requireUser(ctx, req);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ 🖼️ gallery

const artLimit = new RateLimiter(20, 60_000);

export function hangArt(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const title = field(req.body, 'title', 'string')!.trim().slice(0, 40) || 'Untitled';
  const img = field(req.body, 'img', 'string')!;
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img)) throw bad('That isn’t a picture.');
  if (img.length > RULES.artMaxBytes) throw bad('That picture is too big.');
  const day = gameDay();
  const today = (ctx.db.prepare('SELECT COUNT(*) AS n FROM art WHERE user_id = ? AND game_day = ?').get(u.id, day) as { n: number }).n;
  if (today >= RULES.artPerDay) throw tooMany(`You can hang ${RULES.artPerDay} paintings a day. The wall needs room.`);
  const r = ctx.db.prepare('INSERT INTO art (user_id, title, img, created, game_day) VALUES (?, ?, ?, ?, ?)').run(u.id, title, img, ctx.now(), day);
  return { id: Number(r.lastInsertRowid) };
}

export function artWall(ctx: Ctx, req: ApiReq) {
  const sort = req.query.get('sort') === 'new' ? 'a.created DESC' : 'a.likes DESC, a.created DESC';
  const since = ctx.now() - 3 * 86_400_000;
  const u = safeUser(ctx, req);
  const rows = ctx.db
    .prepare(`SELECT a.id, a.title, a.img, a.likes, a.created, x.username AS artist${u ? ', EXISTS(SELECT 1 FROM art_likes l WHERE l.art_id = a.id AND l.user_id = ?) AS liked' : ''} FROM art a JOIN users x ON x.id = a.user_id WHERE a.hidden = 0 AND x.banned = 0 AND a.created > ? ORDER BY ${sort} LIMIT 40`)
    .all(...(u ? [u.id, since] : [since])) as { id: number; title: string; img: string; likes: number; created: number; artist: string; liked?: number }[];
  return { art: rows.map((r) => ({ ...r, liked: !!r.liked, mine: !!u && r.artist === u.username })) };
}

export function likeArt(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  if (!artLimit.hit(`like:${u.id}`, ctx.now())) throw tooMany();
  const id = Number(req.params.id);
  const art = ctx.db.prepare('SELECT user_id FROM art WHERE id = ? AND hidden = 0').get(id) as { user_id: number } | undefined;
  if (!art) throw notFound('That painting is gone.');
  if (art.user_id === u.id) throw bad('You can’t like your own painting. (We know you love it.)');
  return tx(ctx.db, () => {
    const r = ctx.db.prepare('INSERT OR IGNORE INTO art_likes (art_id, user_id) VALUES (?, ?)').run(id, u.id);
    if (r.changes) ctx.db.prepare('UPDATE art SET likes = likes + 1 WHERE id = ?').run(id);
    return { likes: (ctx.db.prepare('SELECT likes FROM art WHERE id = ?').get(id) as { likes: number }).likes };
  });
}

// ------------------------------------------------------------ 👤 players

export function findPlayers(ctx: Ctx, req: ApiReq) {
  requireUser(ctx, req);
  const q = (req.query.get('q') ?? '').trim();
  if (q.length < 2 || !/^[A-Za-z0-9_]+$/.test(q)) return { players: [] };
  const rows = ctx.db.prepare("SELECT username FROM users WHERE banned = 0 AND username LIKE ? ESCAPE '\\' ORDER BY length(username) LIMIT 8").all(`${q.replace(/_/g, '\\_')}%`) as { username: string }[];
  return { players: rows.map((r) => r.username) };
}

export function profile(ctx: Ctx, req: ApiReq) {
  const row = ctx.db.prepare('SELECT id, username, created FROM users WHERE username = ? AND banned = 0').get(req.params.name) as { id: number; username: string; created: number } | undefined;
  if (!row) throw notFound('No player with that name.');
  const pts = (ctx.db.prepare('SELECT points FROM season_points WHERE season = ? AND user_id = ?').get(seasonId(ctx.now()), row.id) as { points: number } | undefined)?.points ?? 0;
  const art = (ctx.db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(likes), 0) AS likes FROM art WHERE user_id = ? AND hidden = 0').get(row.id) as { n: number; likes: number });
  return { username: row.username, joined: row.created, seasonPoints: pts, paintings: art.n, likes: art.likes };
}

// ------------------------------------------------------------ 💸 transfers

const sendLimit = new RateLimiter(10, 60_000);

/**
 * Send money. The game takes it from your cash first (the response says
 * how much), then the receiver collects it. Over the daily limit it's a
 * wire: held until an admin approves (or refunds) it.
 */
export function sendMoney(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  if (!sendLimit.hit(`send:${u.id}`, ctx.now())) throw tooMany();
  const to = field(req.body, 'to', 'string')!.trim();
  const amount = Math.round(field(req.body, 'amount', 'number')!);
  const note = (field(req.body, 'note', 'string', { optional: true }) ?? '').trim().slice(0, 80);
  if (amount < 100) throw bad('The smallest transfer is $1.');
  if (amount > RULES.transferMax) throw bad(`The most you can send at once is $${RULES.transferMax / 100}.`);
  if (!u.email_verified) throw new ApiError(403, 'verify_email', 'Confirm your email first (check your inbox), then you can send money.');
  const dest = ctx.db.prepare('SELECT id, username FROM users WHERE username = ? AND banned = 0').get(to) as { id: number; username: string } | undefined;
  if (!dest) throw notFound('No player with that name.');
  if (dest.id === u.id) throw bad('You can’t send money to yourself.');
  const day = gameDay();
  return tx(ctx.db, () => {
    const sentToday = (ctx.db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM transfers WHERE from_id = ? AND game_day = ? AND status IN ('sent', 'claimed')").get(u.id, day) as { n: number }).n;
    const wire = sentToday + amount > RULES.transferDaily || amount > RULES.wireReview;
    const status = wire ? 'review' : 'sent';
    const r = ctx.db.prepare('INSERT INTO transfers (from_id, to_id, amount, note, status, game_day, created) VALUES (?, ?, ?, ?, ?, ?, ?)').run(u.id, dest.id, amount, note, status, day, ctx.now());
    return { id: Number(r.lastInsertRowid), to: dest.username, amount, status, leftToday: Math.max(0, RULES.transferDaily - sentToday - (wire ? 0 : amount)) };
  });
}

/** Money waiting for you: transfers to collect, and refunds of wires that were turned down. */
export function inbox(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const incoming = ctx.db.prepare("SELECT t.id, t.amount, t.note, t.created, f.username AS from_name FROM transfers t JOIN users f ON f.id = t.from_id WHERE t.to_id = ? AND t.status = 'sent' ORDER BY t.created").all(u.id);
  const refunds = ctx.db.prepare("SELECT t.id, t.amount, t.status, x.username AS to_name FROM transfers t JOIN users x ON x.id = t.to_id WHERE t.from_id = ? AND t.status IN ('rejected', 'returned') ORDER BY t.created").all(u.id);
  const pending = ctx.db.prepare("SELECT t.id, t.amount, t.created, x.username AS to_name FROM transfers t JOIN users x ON x.id = t.to_id WHERE t.from_id = ? AND t.status = 'review' ORDER BY t.created").all(u.id);
  const sentToday = (ctx.db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM transfers WHERE from_id = ? AND game_day = ? AND status IN ('sent', 'claimed')").get(u.id, gameDay()) as { n: number }).n;
  return { incoming, refunds, pending, leftToday: Math.max(0, RULES.transferDaily - sentToday) };
}

/** Collect a transfer (or a refund). Pays once: returns the amount for the game to add. */
export function collect(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const id = Number(req.params.id);
  return tx(ctx.db, () => {
    const t = ctx.db.prepare('SELECT * FROM transfers WHERE id = ?').get(id) as { id: number; from_id: number; to_id: number; amount: number; status: string } | undefined;
    if (!t) throw notFound();
    const now = ctx.now();
    if (t.to_id === u.id && t.status === 'sent') {
      ctx.db.prepare("UPDATE transfers SET status = 'claimed', settled = ? WHERE id = ?").run(now, id);
      return { amount: t.amount, kind: 'transfer' };
    }
    if (t.from_id === u.id && (t.status === 'rejected' || t.status === 'returned')) {
      ctx.db.prepare("UPDATE transfers SET status = 'refunded', settled = ? WHERE id = ?").run(now, id);
      return { amount: t.amount, kind: 'refund' };
    }
    throw new ApiError(409, 'already', 'Already collected.');
  });
}

// ------------------------------------------------------------ 🚩 reports

const reportLimit = new RateLimiter(10, 60 * 60_000);

export function report(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  if (!reportLimit.hit(`report:${u.id}`, ctx.now())) throw tooMany('Thanks, we have your reports. Give us a bit to look.');
  const kind = field(req.body, 'kind', 'string')!;
  if (!['player', 'art', 'chat'].includes(kind)) throw bad('Report a player, a painting or a chat line.');
  const target = field(req.body, 'target', 'string')!.slice(0, 120);
  const reason = (field(req.body, 'reason', 'string', { optional: true }) ?? '').slice(0, 300);
  ctx.db.prepare('INSERT INTO reports (from_id, kind, target, reason, created) VALUES (?, ?, ?, ?, ?)').run(u.id, kind, target, reason, ctx.now());
  return { ok: true };
}

// ------------------------------------------------------------ 🛠️ admin

export function adminQueue(ctx: Ctx, req: ApiReq) {
  requireAdmin(ctx, req);
  return {
    wires: ctx.db.prepare("SELECT t.id, t.amount, t.note, t.created, f.username AS from_name, x.username AS to_name FROM transfers t JOIN users f ON f.id = t.from_id JOIN users x ON x.id = t.to_id WHERE t.status = 'review' ORDER BY t.created").all(),
    reports: ctx.db.prepare('SELECT r.id, r.kind, r.target, r.reason, r.created, u.username AS from_name FROM reports r JOIN users u ON u.id = r.from_id WHERE r.resolved = 0 ORDER BY r.created LIMIT 100').all(),
  };
}

export function adminWire(ctx: Ctx, req: ApiReq) {
  requireAdmin(ctx, req);
  const approve = field(req.body, 'approve', 'boolean')!;
  const r = ctx.db.prepare("UPDATE transfers SET status = ? WHERE id = ? AND status = 'review'").run(approve ? 'sent' : 'rejected', Number(req.params.id));
  if (!r.changes) throw notFound('No wire waiting with that id.');
  return { ok: true };
}

export function adminResolve(ctx: Ctx, req: ApiReq) {
  requireAdmin(ctx, req);
  ctx.db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(Number(req.params.id));
  return { ok: true };
}

export function adminHideArt(ctx: Ctx, req: ApiReq) {
  requireAdmin(ctx, req);
  ctx.db.prepare('UPDATE art SET hidden = 1 WHERE id = ?').run(Number(req.params.id));
  return { ok: true };
}

export function adminBan(ctx: Ctx, req: ApiReq) {
  const admin = requireAdmin(ctx, req);
  const ban = field(req.body, 'ban', 'boolean')!;
  const row = ctx.db.prepare('SELECT id, username FROM users WHERE username = ?').get(req.params.name) as { id: number; username: string } | undefined;
  if (!row) throw notFound();
  if (row.id === admin.id) throw bad('You can’t ban yourself.');
  ctx.db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(ban ? 1 : 0, row.id);
  if (ban) ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
  return { ok: true };
}
