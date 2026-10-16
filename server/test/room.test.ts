import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { start } from '../src/index.ts';
import { LogMailer } from '../src/mailer.ts';
import { cleanChat, CITY } from '../src/city-room.ts';

const srv = await start({ port: 2950 + Math.floor(Math.random() * 40), dbPath: ':memory:', mailer: new LogMailer(true), quiet: true });
after(async () => srv.stop());
const base = `http://localhost:${srv.port}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) return false;
    await wait(25);
  }
  return true;
};

async function signup(username: string) {
  const r = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, email: `${username.toLowerCase()}@example.com`, password: 'walk-the-city-1' }) });
  return ((await r.json()) as { token: string }).token;
}

const players = (room: { state: any }) => {
  const out: Record<string, any> = {};
  room.state?.players?.forEach((p: any, id: string) => (out[id] = p));
  return out;
};

test('signed-out players can’t join', async () => {
  const c = new Client(base);
  await assert.rejects(c.joinOrCreate('city', { area: 'manhattan', token: 'nope' }));
});

test('two players see each other move; speed is checked; emotes and chat', async () => {
  const [ta, tb] = [await signup('Walker_A'), await signup('Walker_B')];
  const a = await new Client(base).joinOrCreate('city', { area: 'manhattan', token: ta, x: 0, z: 0, look: '{"skin":"#8d5524"}' });
  const b = await new Client(base).joinOrCreate('city', { area: 'manhattan', token: tb, x: 10, z: 0 });
  assert.equal(a.roomId, b.roomId, 'same area → same room');
  assert.ok(await until(() => Object.keys(players(a)).length === 2), 'A sees 2 players');
  const bInA = () => Object.values(players(a)).find((p: any) => p.name === 'Walker_B');
  assert.equal(bInA()?.name, 'Walker_B');

  // A normal step goes through.
  await wait(500);
  b.send('move', { x: 14, z: 0, ry: 1, moving: true });
  assert.ok(await until(() => Math.abs(bInA()?.x - 14) < 0.01), 'B walked');
  // A jump across the map is clamped to a car's speed.
  await wait(100);
  b.send('move', { x: 1500, z: 0 });
  assert.ok(await until(() => bInA()?.x > 14));
  assert.ok(bInA()?.x < 14 + CITY.maxSpeed * 1.5 + 2, `no teleporting (x=${bInA()?.x})`);
  // Travel (train/ride) may jump.
  b.send('travel', { x: 800, z: -1200 });
  assert.ok(await until(() => Math.abs(bInA()?.x - 800) < 0.01 && Math.abs(bInA()?.z + 1200) < 0.01), 'took the train');
  // Junk is ignored.
  b.send('move', { x: 'lol', z: null });
  b.send('emote', { e: 'not-an-emote' });
  b.send('emote', { e: 'wave' });
  assert.ok(await until(() => bInA()?.emote === 'wave'));
  b.send('place', { placeId: 'rageRoom' });
  assert.ok(await until(() => bInA()?.place === 'rageRoom'));

  const heard: any[] = [];
  a.onMessage('said', (m) => heard.push(m));
  b.send('say', { text: '  yo   who wants a chopped cheese  ' });
  b.send('say', { text: 'spam' }); // too soon: dropped
  assert.ok(await until(() => heard.length >= 1));
  await wait(300);
  assert.equal(heard.length, 1);
  assert.equal(heard[0].text, 'yo who wants a chopped cheese');
  assert.equal(heard[0].name, 'Walker_B');

  // Signing in again elsewhere replaces the old seat.
  const b2 = await new Client(base).joinOrCreate('city', { area: 'manhattan', token: tb, x: 0, z: 0 });
  assert.ok(await until(() => Object.values(players(a)).filter((p: any) => p.name === 'Walker_B').length === 1 && Object.keys(players(a)).length === 2));

  // Leaving removes you.
  await b2.leave();
  assert.ok(await until(() => Object.keys(players(a)).length === 1));
  await a.leave();
});

test('another area is another room', async () => {
  const t = await signup('Brooklyn_C');
  const bk = await new Client(base).joinOrCreate('city', { area: 'brooklyn', token: t });
  const m = await new Client(base).joinOrCreate('city', { area: 'manhattan', token: await signup('Manhattan_D') });
  assert.notEqual(bk.roomId, m.roomId);
  await bk.leave();
  await m.leave();
});

test('chat filter', () => {
  assert.equal(cleanChat('  hello\n\nworld '), 'hello world');
  assert.equal(cleanChat('x'.repeat(200)).length, 80);
  assert.match(cleanChat('you nazi'), /\*{4}/);
  assert.equal(cleanChat(42), '');
});
