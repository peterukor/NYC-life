import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

// Admins come from the environment; set before the server modules load.
process.env.ADMINS = 'BossLady';
const { start } = await import('../src/index.ts');
const { LogMailer } = await import('../src/mailer.ts');

const mailer = new LogMailer(true);
let clock = Date.UTC(2026, 9, 16, 12);
const srv = await start({ port: 0 + 2600 + Math.floor(Math.random() * 300), dbPath: ':memory:', mailer, now: () => clock, quiet: true });
const base = `http://localhost:${srv.port}/api`;

async function call(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}
const tokenIn = (text: string, param: string) => decodeURIComponent(new RegExp(`[?&]${param}=([^\\s&]+)`).exec(text)![1]);

let alice = '', bob = '', boss = '';
before(async () => {
  alice = (await call('POST', '/auth/register', { username: 'Alice', email: 'alice@example.com', password: 'pigeon-pizza-1' })).body.token;
  bob = (await call('POST', '/auth/register', { username: 'Bob_NYC', email: 'bob@example.com', password: 'bodega-cat-22' })).body.token;
  boss = (await call('POST', '/auth/register', { username: 'BossLady', email: 'boss@example.com', password: 'corner-office-9' })).body.token;
});
after(async () => srv.stop());

test('sign up: rules and duplicates', async () => {
  assert.ok(alice && bob && boss);
  assert.equal((await call('POST', '/auth/register', { username: 'al', email: 'x@example.com', password: 'longenough1' })).status, 400, 'short username');
  assert.equal((await call('POST', '/auth/register', { username: 'Carl', email: 'not-an-email', password: 'longenough1' })).status, 400, 'bad email');
  assert.equal((await call('POST', '/auth/register', { username: 'Carl', email: 'carl@example.com', password: 'short' })).status, 400, 'short password');
  assert.equal((await call('POST', '/auth/register', { username: 'admin', email: 'carl@example.com', password: 'longenough1' })).status, 400, 'reserved');
  const dupe = await call('POST', '/auth/register', { username: 'alice', email: 'other@example.com', password: 'longenough1' });
  assert.equal(dupe.status, 409);
  assert.match(dupe.body.error, /username/);
  const dupeMail = await call('POST', '/auth/register', { username: 'Alice2', email: 'ALICE@example.com', password: 'longenough1' });
  assert.equal(dupeMail.status, 409);
  assert.match(dupeMail.body.error, /email/);
});

test('log in with username or email; wrong password; me; logout', async () => {
  const a = await call('POST', '/auth/login', { login: 'alice', password: 'pigeon-pizza-1' });
  assert.equal(a.status, 200);
  const b = await call('POST', '/auth/login', { login: 'Alice@Example.com', password: 'pigeon-pizza-1' });
  assert.equal(b.status, 200);
  assert.equal((await call('POST', '/auth/login', { login: 'alice', password: 'nope-nope-nope' })).status, 401);
  assert.equal((await call('POST', '/auth/login', { login: 'nobody', password: 'nope-nope-nope' })).status, 401);
  const me = await call('GET', '/auth/me', undefined, a.body.token);
  assert.equal(me.body.user.username, 'Alice');
  assert.equal(me.body.user.pass, undefined, 'never send the hash');
  await call('POST', '/auth/logout', {}, a.body.token);
  assert.equal((await call('GET', '/auth/me', undefined, a.body.token)).status, 401);
  assert.equal((await call('GET', '/auth/me', undefined, b.body.token)).status, 200, 'other session still fine');
});

test('verify email by link', async () => {
  const mail = mailer.outbox.find((m) => m.to === 'bob@example.com' && /Confirm/.test(m.subject))!;
  assert.ok(mail);
  const r = await call('POST', '/auth/verify', { token: tokenIn(mail.text, 'verify') });
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/auth/me', undefined, bob)).body.user.emailVerified, true);
  assert.equal((await call('POST', '/auth/verify', { token: tokenIn(mail.text, 'verify') })).status, 400, 'one use only');
});

test('forgot password: email link, reset signs out other devices, never says if the email exists', async () => {
  const other = (await call('POST', '/auth/login', { login: 'Alice', password: 'pigeon-pizza-1' })).body.token;
  const n = mailer.outbox.length;
  assert.equal((await call('POST', '/auth/forgot', { email: 'ghost@example.com' })).status, 200);
  assert.equal(mailer.outbox.length, n, 'no mail for an unknown email');
  assert.equal((await call('POST', '/auth/forgot', { email: 'alice@example.com' })).status, 200);
  const mail = mailer.outbox.at(-1)!;
  assert.match(mail.subject, /Reset/);
  const token = tokenIn(mail.text, 'reset');
  const r = await call('POST', '/auth/reset', { token, password: 'new-pigeon-pizza-2' });
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/auth/me', undefined, other)).status, 401, 'old sessions gone');
  assert.equal((await call('POST', '/auth/login', { login: 'Alice', password: 'new-pigeon-pizza-2' })).status, 200);
  assert.equal((await call('POST', '/auth/reset', { token, password: 'another-one-3' })).status, 400, 'link used');
  alice = r.body.token;
  // An old link expires after an hour.
  await call('POST', '/auth/forgot', { email: 'alice@example.com' });
  const late = tokenIn(mailer.outbox.at(-1)!.text, 'reset');
  clock += 61 * 60_000;
  assert.equal((await call('POST', '/auth/reset', { token: late, password: 'too-late-pw-4' })).status, 400);
});

test('cloud save with revisions (no silent overwrite from another phone)', async () => {
  assert.deepEqual((await call('GET', '/save', undefined, alice)).body.save, null);
  const p1 = await call('PUT', '/save', { rev: 0, save: { money: 100 } }, alice);
  assert.equal(p1.body.rev, 1);
  const stale = await call('PUT', '/save', { rev: 0, save: { money: 5 } }, alice);
  assert.equal(stale.status, 409);
  assert.equal((await call('PUT', '/save', { rev: 1, save: { money: 200 } }, alice)).body.rev, 2);
  assert.equal((await call('GET', '/save', undefined, alice)).body.save.money, 200);
  assert.equal((await call('PUT', '/save', { rev: 0, save: { money: 1 }, force: true }, alice)).body.rev, 3, 'force overwrites');
  assert.equal((await call('GET', '/save')).status, 401);
});

test('season points: capped per post and per hour; board and your place', async () => {
  const a = await call('POST', '/season/points', { points: 100_000 }, alice);
  assert.equal(a.body.added, 300);
  assert.equal(a.body.capped, true);
  for (let i = 0; i < 10; i++) await call('POST', '/season/points', { points: 300 }, alice);
  const capped = await call('POST', '/season/points', { points: 300 }, alice);
  assert.equal(capped.body.points, 2_500, 'hourly cap');
  await call('POST', '/season/points', { points: 120 }, bob);
  const board = await call('GET', '/season/board', undefined, bob);
  assert.equal(board.body.top[0].username, 'Alice');
  assert.deepEqual(board.body.you, { place: 2, points: 120 });
  assert.equal((await call('POST', '/season/claim', { season: board.body.season }, alice)).status, 400, 'not over yet');
  // Three days later: Alice claims 1st place once.
  clock += 3 * 86_400_000;
  const c = await call('POST', '/season/claim', { season: board.body.season }, alice);
  assert.deepEqual([c.body.place, c.body.prize], [0, 200_000]);
  assert.equal((await call('POST', '/season/claim', { season: board.body.season }, alice)).body.prize, 0, 'only once');
});

test('gallery: hang, like once, not your own', async () => {
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  const h = await call('POST', '/art', { title: 'Pigeon at Dawn', img }, alice);
  assert.equal(h.status, 200);
  assert.equal((await call('POST', '/art', { title: 'x', img: 'javascript:alert(1)' }, alice)).status, 400);
  assert.equal((await call('POST', `/art/${h.body.id}/like`, {}, alice)).status, 400, 'own painting');
  assert.equal((await call('POST', `/art/${h.body.id}/like`, {}, bob)).body.likes, 1);
  assert.equal((await call('POST', `/art/${h.body.id}/like`, {}, bob)).body.likes, 1, 'once');
  const wall = await call('GET', '/art', undefined, bob);
  assert.equal(wall.body.art[0].title, 'Pigeon at Dawn');
  assert.equal(wall.body.art[0].liked, true);
  assert.equal(wall.body.art[0].artist, 'Alice');
});

test('transfers: verified email, daily limit, wires reviewed by an admin, collect once', async () => {
  // Alice hasn't confirmed her email... (she reset her password, which confirms it). Use Boss, who hasn't.
  assert.equal((await call('POST', '/transfers', { to: 'Bob_NYC', amount: 1000 }, boss)).status, 403);
  const s1 = await call('POST', '/transfers', { to: 'Bob_NYC', amount: 250_000, note: 'rent 🙏' }, alice);
  assert.equal(s1.body.status, 'sent');
  const s2 = await call('POST', '/transfers', { to: 'Bob_NYC', amount: 100_000 }, alice);
  assert.equal(s2.body.status, 'review', 'over $3,000 today: a wire');
  assert.equal((await call('POST', '/transfers', { to: 'Alice', amount: 500 }, alice)).status, 400, 'not to yourself');
  assert.equal((await call('POST', '/transfers', { to: 'Nobody', amount: 500 }, alice)).status, 404);
  const box = await call('GET', '/transfers/inbox', undefined, bob);
  assert.equal(box.body.incoming.length, 1);
  assert.equal(box.body.incoming[0].from_name, 'Alice');
  const got = await call('POST', `/transfers/${s1.body.id}/collect`, {}, bob);
  assert.equal(got.body.amount, 250_000);
  assert.equal((await call('POST', `/transfers/${s1.body.id}/collect`, {}, bob)).status, 409, 'only once');
  // The wire: only an admin can review it. Turned down → Alice collects a refund.
  assert.equal((await call('GET', '/admin/queue', undefined, alice)).status, 403);
  const q = await call('GET', '/admin/queue', undefined, boss);
  assert.equal(q.body.wires.length, 1);
  await call('POST', `/admin/wires/${s2.body.id}`, { approve: false }, boss);
  const refund = await call('POST', `/transfers/${s2.body.id}/collect`, {}, alice);
  assert.deepEqual([refund.body.amount, refund.body.kind], [100_000, 'refund']);
});

test('reports, profiles, player search, bans', async () => {
  assert.equal((await call('POST', '/reports', { kind: 'chat', target: 'Bob_NYC', reason: 'spam' }, alice)).status, 200);
  assert.equal((await call('GET', '/admin/queue', undefined, boss)).body.reports.length, 1);
  assert.deepEqual((await call('GET', '/players?q=bo', undefined, alice)).body.players.sort(), ['Bob_NYC', 'BossLady']);
  assert.equal((await call('GET', '/players/Alice')).body.paintings, 1);
  await call('POST', '/admin/users/Bob_NYC/ban', { ban: true }, boss);
  assert.equal((await call('GET', '/auth/me', undefined, bob)).status, 401, 'banned: signed out');
  assert.equal((await call('POST', '/auth/login', { login: 'Bob_NYC', password: 'bodega-cat-22' })).status, 403);
  await call('POST', '/admin/users/Bob_NYC/ban', { ban: false }, boss);
});

test('delete account: password needed, then gone', async () => {
  const c = (await call('POST', '/auth/register', { username: 'Temp_1', email: 'temp@example.com', password: 'temporary-99' })).body.token;
  assert.equal((await call('POST', '/auth/delete', { password: 'wrong-wrong' }, c)).status, 401);
  assert.equal((await call('POST', '/auth/delete', { password: 'temporary-99' }, c)).status, 200);
  assert.equal((await call('GET', '/auth/me', undefined, c)).status, 401);
  assert.equal((await call('POST', '/auth/login', { login: 'temp@example.com', password: 'temporary-99' })).status, 401);
  // The name is free again.
  assert.equal((await call('POST', '/auth/register', { username: 'Temp_1', email: 'temp@example.com', password: 'temporary-99' })).status, 200);
});

test('unknown routes and wrong methods', async () => {
  assert.equal((await call('GET', '/nope')).status, 404);
  assert.equal((await call('DELETE', '/save', undefined, alice)).status, 405);
});
