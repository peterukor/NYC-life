// =====================================================================
// auth.ts — accounts: username + password + email (Peter, 2026-10-16).
//
// - Passwords are hashed with scrypt (a slow, salted hash) and never
//   stored or logged. Login takes your username OR email.
// - A session is a random token the game keeps; the server stores only
//   its SHA-256, so a stolen database can't be used to log in.
// - Forgot password: we email a one-hour link (?reset=…). Resetting signs
//   out every device. The answer never says whether an email exists.
// - Verify email: a link is sent when you sign up (?verify=…).
// - Too many wrong passwords from one place → a short cooldown.
// =====================================================================

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { CONFIG } from './config.ts';
import type { DB } from './db.ts';
import { ApiError, bad, field, forbidden, RateLimiter, tooMany, unauthorized, type ApiReq } from './http.ts';
import type { Mailer } from './mailer.ts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, len: 64 };

export interface Ctx {
  db: DB;
  mailer: Mailer;
  now: () => number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  created: number;
  email_verified: number;
  banned: number;
  look: string | null;
}

// ------------------------------------------------------------ rules

const RESERVED = new Set(['admin', 'administrator', 'mod', 'moderator', 'support', 'staff', 'system', 'nyclife', 'nyc_life', 'official', 'root', 'null', 'undefined', 'anthropic', 'claude']);
/** A few words no username may contain (kept short on purpose; reports catch the rest). */
const BLOCKED = ['nigg', 'fag', 'retard', 'rape', 'nazi', 'hitler', 'kkk', 'pedo'];

export function checkUsername(u: string): string | null {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) return 'Usernames are 3–20 letters, numbers or _.';
  const low = u.toLowerCase();
  if (RESERVED.has(low)) return 'That username is reserved.';
  if (BLOCKED.some((w) => low.includes(w))) return 'Pick a different username.';
  return null;
}

export function checkEmail(e: string): string | null {
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'That email doesn’t look right.';
  return null;
}

export function checkPassword(p: string, username = ''): string | null {
  if (p.length < 8) return 'Passwords need at least 8 characters.';
  if (p.length > 200) return 'That password is too long.';
  if (username && p.toLowerCase() === username.toLowerCase()) return 'Your password can’t be your username.';
  if (/^(.)\1+$/.test(p) || ['password', 'password1', '12345678', '123456789', 'qwertyui', 'iloveyou'].includes(p.toLowerCase())) return 'That password is too easy to guess.';
  return null;
}

// ------------------------------------------------------------ hashing

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, SCRYPT.len, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && timingSafeEqual(got, want);
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

// ------------------------------------------------------------ sessions

function createSession(ctx: Ctx, userId: number): string {
  const token = newToken();
  const now = ctx.now();
  ctx.db.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)').run(sha(token), userId, now, now + CONFIG.sessionDays * 86_400_000);
  return token;
}

/** The signed-in user for a session token, or null. Refreshes the expiry (sliding sessions). */
export function userForToken(ctx: Ctx, token: string | null | undefined): User | null {
  if (!token || token.length > 100) return null;
  const now = ctx.now();
  const row = ctx.db.prepare('SELECT u.*, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(sha(token)) as (User & { expires: number }) | undefined;
  if (!row || row.expires < now || row.banned) return null;
  // Slide the expiry forward at most once a day.
  if (row.expires - now < (CONFIG.sessionDays - 1) * 86_400_000) ctx.db.prepare('UPDATE sessions SET expires = ? WHERE token_hash = ?').run(now + CONFIG.sessionDays * 86_400_000, sha(token));
  const { expires: _e, ...user } = row;
  void _e;
  return user;
}

export function bearer(req: ApiReq): string | null {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

/** The signed-in user, or a 401. */
export function requireUser(ctx: Ctx, req: ApiReq): User {
  const u = userForToken(ctx, bearer(req));
  if (!u) throw unauthorized();
  return u;
}

export const isAdmin = (u: User) => CONFIG.admins.includes(u.username.toLowerCase());

export function requireAdmin(ctx: Ctx, req: ApiReq): User {
  const u = requireUser(ctx, req);
  if (!isAdmin(u)) throw forbidden();
  return u;
}

export const publicUser = (u: User) => ({ username: u.username, email: u.email, emailVerified: !!u.email_verified, created: u.created, admin: isAdmin(u) });

// ------------------------------------------------------------ one-time tokens (reset, verify)

function makeOneTime(ctx: Ctx, kind: 'reset' | 'verify', userId: number, ms: number): string {
  const token = newToken();
  ctx.db.prepare('DELETE FROM tokens WHERE user_id = ? AND kind = ?').run(userId, kind);
  ctx.db.prepare('INSERT INTO tokens (token_hash, kind, user_id, expires) VALUES (?, ?, ?, ?)').run(sha(token), kind, userId, ctx.now() + ms);
  return token;
}

function useOneTime(ctx: Ctx, kind: 'reset' | 'verify', token: string): number | null {
  const row = ctx.db.prepare('SELECT user_id, expires FROM tokens WHERE token_hash = ? AND kind = ?').get(sha(token), kind) as { user_id: number; expires: number } | undefined;
  if (!row) return null;
  ctx.db.prepare('DELETE FROM tokens WHERE token_hash = ?').run(sha(token));
  return row.expires < ctx.now() ? null : row.user_id;
}

const link = (param: string, token: string) => `${CONFIG.gameUrl}${CONFIG.gameUrl.includes('?') ? '&' : '?'}${param}=${encodeURIComponent(token)}`;

async function sendVerify(ctx: Ctx, u: { id: number; username: string; email: string }): Promise<void> {
  const token = makeOneTime(ctx, 'verify', u.id, 3 * 86_400_000);
  await ctx.mailer.send({ to: u.email, subject: 'Confirm your NYC Life email', text: `Hey ${u.username},\n\nTap to confirm this is your email:\n${link('verify', token)}\n\nIf you didn’t sign up for NYC Life, ignore this.\n` });
}

// ------------------------------------------------------------ endpoints

const loginLimit = new RateLimiter(10, 15 * 60_000);
const loginIpLimit = new RateLimiter(60, 15 * 60_000);
/** New accounts per IP per hour (only successful sign-ups count; shared Wi-Fi needs a few). */
const signupLimit = new RateLimiter(10, 60 * 60_000);
const mailLimit = new RateLimiter(3, 60 * 60_000);

export async function register(ctx: Ctx, req: ApiReq) {
  const username = field(req.body, 'username', 'string')!.trim();
  const email = field(req.body, 'email', 'string')!.trim().toLowerCase();
  const password = field(req.body, 'password', 'string')!;
  const why = checkUsername(username) ?? checkEmail(email) ?? checkPassword(password, username);
  if (why) throw bad(why);
  const taken = ctx.db.prepare('SELECT username, email FROM users WHERE username = ? OR email = ?').get(username, email) as { username: string; email: string } | undefined;
  if (taken) throw new ApiError(409, 'taken', taken.username.toLowerCase() === username.toLowerCase() ? 'That username is taken.' : 'That email already has an account. Sign in instead.');
  if (!signupLimit.hit(`signup:${req.ip}`, ctx.now())) throw tooMany('Too many new accounts from here. Try again in an hour.');
  const pass = await hashPassword(password);
  const r = ctx.db.prepare('INSERT INTO users (username, email, pass, created) VALUES (?, ?, ?, ?)').run(username, email, pass, ctx.now());
  const id = Number(r.lastInsertRowid);
  await sendVerify(ctx, { id, username, email });
  const user = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as User;
  return { token: createSession(ctx, id), user: publicUser(user) };
}

export async function login(ctx: Ctx, req: ApiReq) {
  const who = field(req.body, 'login', 'string')!.trim();
  const password = field(req.body, 'password', 'string')!;
  if (!loginLimit.hit(`login:${who.toLowerCase()}`, ctx.now()) || !loginIpLimit.hit(`login-ip:${req.ip}`, ctx.now())) throw tooMany('Too many tries. Wait 15 minutes, or reset your password.');
  const user = ctx.db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(who, who.toLowerCase()) as User & { pass: string } | undefined;
  // Same message (and roughly the same time) whether the account exists or not.
  const ok = user ? await verifyPassword(password, user.pass) : (await hashPassword(password), false);
  if (!user || !ok) throw new ApiError(401, 'bad_login', 'Wrong username/email or password.');
  if (user.banned) throw forbidden('This account is banned.');
  const { pass: _p, ...clean } = user;
  void _p;
  return { token: createSession(ctx, user.id), user: publicUser(clean) };
}

export function logout(ctx: Ctx, req: ApiReq) {
  const t = bearer(req);
  if (t) ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
  return { ok: true };
}

export function me(ctx: Ctx, req: ApiReq) {
  return { user: publicUser(requireUser(ctx, req)) };
}

export async function forgot(ctx: Ctx, req: ApiReq) {
  const email = field(req.body, 'email', 'string')!.trim().toLowerCase();
  if (!mailLimit.hit(`forgot:${email}`, ctx.now()) || !mailLimit.hit(`forgot-ip:${req.ip}`, ctx.now())) return { ok: true }; // quietly
  const user = ctx.db.prepare('SELECT id, username, email FROM users WHERE email = ? AND banned = 0').get(email) as { id: number; username: string; email: string } | undefined;
  if (user) {
    const token = makeOneTime(ctx, 'reset', user.id, 60 * 60_000);
    await ctx.mailer.send({ to: user.email, subject: 'Reset your NYC Life password', text: `Hey ${user.username},\n\nTap to pick a new password (the link works for one hour):\n${link('reset', token)}\n\nDidn’t ask for this? Ignore it: your password stays the same.\n` });
  }
  // Never reveal whether that email has an account.
  return { ok: true };
}

export async function reset(ctx: Ctx, req: ApiReq) {
  const token = field(req.body, 'token', 'string')!;
  const password = field(req.body, 'password', 'string')!;
  const userId = useOneTime(ctx, 'reset', token);
  if (!userId) throw bad('That reset link has expired or was already used. Ask for a new one.', 'bad_token');
  const user = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as User;
  const why = checkPassword(password, user.username);
  if (why) throw bad(why);
  ctx.db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(await hashPassword(password), userId);
  // Everyone else signed out; the email clearly works, so it's verified too.
  ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  ctx.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
  return { token: createSession(ctx, userId), user: publicUser({ ...user, email_verified: 1 }) };
}

export function verify(ctx: Ctx, req: ApiReq) {
  const userId = useOneTime(ctx, 'verify', field(req.body, 'token', 'string')!);
  if (!userId) throw bad('That link has expired. Send a new one from the Online app.', 'bad_token');
  ctx.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
  return { ok: true };
}

export async function resendVerify(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  if (u.email_verified) return { ok: true };
  if (!mailLimit.hit(`verify:${u.id}`, ctx.now())) throw tooMany('We just sent one. Check your inbox (and spam).');
  await sendVerify(ctx, u);
  return { ok: true };
}

export async function changePassword(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const old = field(req.body, 'old', 'string')!;
  const next = field(req.body, 'password', 'string')!;
  const row = ctx.db.prepare('SELECT pass FROM users WHERE id = ?').get(u.id) as { pass: string };
  if (!(await verifyPassword(old, row.pass))) throw new ApiError(401, 'bad_login', 'Your current password is wrong.');
  const why = checkPassword(next, u.username);
  if (why) throw bad(why);
  ctx.db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(await hashPassword(next), u.id);
  // Other devices are signed out; this one gets a fresh session.
  ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  return { token: createSession(ctx, u.id) };
}

export async function changeEmail(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const password = field(req.body, 'password', 'string')!;
  const email = field(req.body, 'email', 'string')!.trim().toLowerCase();
  const why = checkEmail(email);
  if (why) throw bad(why);
  const row = ctx.db.prepare('SELECT pass FROM users WHERE id = ?').get(u.id) as { pass: string };
  if (!(await verifyPassword(password, row.pass))) throw new ApiError(401, 'bad_login', 'Wrong password.');
  if (ctx.db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, u.id)) throw new ApiError(409, 'taken', 'That email already has an account.');
  ctx.db.prepare('UPDATE users SET email = ?, email_verified = 0 WHERE id = ?').run(email, u.id);
  await sendVerify(ctx, { id: u.id, username: u.username, email });
  return { ok: true };
}

/** Delete your account and everything in it (password required). */
export async function deleteAccount(ctx: Ctx, req: ApiReq) {
  const u = requireUser(ctx, req);
  const row = ctx.db.prepare('SELECT pass FROM users WHERE id = ?').get(u.id) as { pass: string };
  if (!(await verifyPassword(field(req.body, 'password', 'string')!, row.pass))) throw new ApiError(401, 'bad_login', 'Wrong password.');
  const now = ctx.now();
  // Money on its way to you goes back to whoever sent it; money you sent and nobody collected is cancelled.
  ctx.db.prepare("UPDATE transfers SET status = 'returned', settled = ? WHERE to_id = ? AND status IN ('sent', 'review')").run(now, u.id);
  ctx.db.prepare("UPDATE transfers SET status = 'cancelled', settled = ? WHERE from_id = ? AND status IN ('sent', 'review')").run(now, u.id);
  for (const t of ['sessions', 'tokens', 'saves', 'season_points', 'art']) ctx.db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(u.id);
  // The row stays (transfer history points at it) but nothing personal is left, and nobody can sign in.
  ctx.db.prepare("UPDATE users SET username = ?, email = ?, pass = '', banned = 1, look = NULL WHERE id = ?").run(`deleted_${u.id}`, `deleted_${u.id}@invalid`, u.id);
  return { ok: true };
}
