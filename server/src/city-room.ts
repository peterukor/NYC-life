// =====================================================================
// city-room.ts — real-time: see other players walking around the city.
//
// One room per area ("manhattan", "brooklyn"…), up to 60 players each;
// more players open another copy. Joining needs a signed-in session.
//
// The server checks everything a client sends:
//  - move: position must be on the map and no faster than a car
//    (a jump is clamped back) — trains and rides send "travel" instead,
//    allowed once every few seconds.
//  - place: which place you're inside ("" on the street); inside, you're
//    hidden from the street.
//  - emote: one of a fixed set, not too often.
//  - say: a short line (80 chars), filtered, not too often. Sent as a
//    message, never stored.
// Dropped connections get 20 s to come back before the player is removed.
// One user = one seat: signing in somewhere else removes the old one.
// =====================================================================

import { Room, type Client } from '@colyseus/core';
import { schema, t, type SchemaType } from '@colyseus/schema';
import { userForToken, type Ctx, type User } from './auth.ts';

export const Player = schema(
  {
    name: t.string(),
    look: t.string(),
    x: t.float32(),
    z: t.float32(),
    ry: t.float32(),
    moving: t.boolean(),
    place: t.string(),
    emote: t.string(),
    emoteAt: t.number(),
  },
  'Player',
);
export type Player = SchemaType<typeof Player>;

export const CityState = schema({ players: t.map(Player) }, 'CityState');
export type CityState = SchemaType<typeof CityState>;

export const CITY = {
  maxClients: 60,
  /** Map bounds (metres) a position must be inside. */
  bounds: { minX: -2500, maxX: 2500, minZ: -3500, maxZ: 2000 },
  /** Fastest normal movement (m/s): a car with a bit of slack. */
  maxSpeed: 32,
  /** Travel (train, ride) can jump this often (ms). */
  travelEvery: 3_000,
  emoteEvery: 1_500,
  sayEvery: 2_500,
  reconnectSeconds: 20,
};

export const EMOTES = ['wave', 'dance', 'laugh', 'cheer', 'point', 'shrug', 'heart', 'fire', '🥂', '💸'];
const AREAS = ['manhattan', 'brooklyn', 'bronx', 'queens'];
const BLOCKED = ['nigg', 'fag', 'retard', 'kys', 'kill yourself', 'nazi'];

/** Clean a chat line: trim, collapse spaces, mask blocked words. Empty = don't send. */
export function cleanChat(text: unknown): string {
  if (typeof text !== 'string') return '';
  let t = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  for (const w of BLOCKED) t = t.replace(new RegExp(w.replace(/ /g, '\\s*'), 'gi'), (m) => '*'.repeat(m.length));
  return t;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

interface Seat {
  user: User;
  lastMove: number;
  lastTravel: number;
  lastEmote: number;
  lastSay: number;
}

/** The shared context (database) — set by index.ts before the server starts. */
export const roomCtx: { ctx: Ctx | null } = { ctx: null };

export class CityRoom extends Room<{ state: CityState }> {
  maxClients = CITY.maxClients;
  private seats = new Map<string, Seat>();
  private area = 'manhattan';

  onCreate(options: { area?: string }) {
    this.area = AREAS.includes(options?.area ?? '') ? options.area! : 'manhattan';
    this.setState(new CityState());
    this.metadata = { area: this.area };
    this.patchRate = 100;

    this.onMessage('move', (client, m: { x?: unknown; z?: unknown; ry?: unknown; moving?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      const seat = this.seats.get(client.sessionId);
      const x = num(m?.x), z = num(m?.z), ry = num(m?.ry);
      if (!p || !seat || x === null || z === null) return;
      const now = Date.now();
      const b = CITY.bounds;
      const tx = Math.min(b.maxX, Math.max(b.minX, x)), tz = Math.min(b.maxZ, Math.max(b.minZ, z));
      // Too fast for the time since the last move: only go as far as allowed.
      const dt = Math.max(0.05, (now - seat.lastMove) / 1000);
      const d = Math.hypot(tx - p.x, tz - p.z);
      const max = CITY.maxSpeed * dt + 2;
      const f = d > max ? max / d : 1;
      p.x += (tx - p.x) * f;
      p.z += (tz - p.z) * f;
      if (ry !== null) p.ry = ((ry % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      p.moving = m?.moving === true;
      seat.lastMove = now;
    });

    this.onMessage('travel', (client, m: { x?: unknown; z?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      const seat = this.seats.get(client.sessionId);
      const x = num(m?.x), z = num(m?.z);
      if (!p || !seat || x === null || z === null) return;
      const now = Date.now();
      if (now - seat.lastTravel < CITY.travelEvery) return;
      const b = CITY.bounds;
      p.x = Math.min(b.maxX, Math.max(b.minX, x));
      p.z = Math.min(b.maxZ, Math.max(b.minZ, z));
      p.moving = false;
      seat.lastTravel = seat.lastMove = now;
    });

    this.onMessage('place', (client, m: { placeId?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const id = typeof m?.placeId === 'string' && /^[A-Za-z0-9_]{0,40}$/.test(m.placeId) ? m.placeId : '';
      p.place = id;
    });

    this.onMessage('emote', (client, m: { e?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      const seat = this.seats.get(client.sessionId);
      if (!p || !seat || typeof m?.e !== 'string' || !EMOTES.includes(m.e)) return;
      const now = Date.now();
      if (now - seat.lastEmote < CITY.emoteEvery) return;
      seat.lastEmote = now;
      p.emote = m.e;
      p.emoteAt = now;
    });

    this.onMessage('say', (client, m: { text?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      const seat = this.seats.get(client.sessionId);
      if (!p || !seat) return;
      const now = Date.now();
      if (now - seat.lastSay < CITY.sayEvery) return;
      const text = cleanChat(m?.text);
      if (!text) return;
      seat.lastSay = now;
      this.broadcast('said', { id: client.sessionId, name: p.name, text, at: now });
    });
  }

  /** Signed in? (the session token from the Online app). */
  onAuth(_client: Client, options: { token?: string }) {
    const ctx = roomCtx.ctx;
    const user = ctx ? userForToken(ctx, options?.token) : null;
    if (!user) throw new Error('Sign in to go online.');
    return user;
  }

  onJoin(client: Client, options: { x?: number; z?: number; look?: unknown }) {
    const user = client.auth as User;
    // One seat per player: an older connection of the same account leaves.
    for (const [sid, s] of this.seats) {
      if (s.user.id === user.id && sid !== client.sessionId) {
        this.clients.find((c) => c.sessionId === sid)?.leave(4001, 'Signed in somewhere else.');
        this.state.players.delete(sid);
        this.seats.delete(sid);
      }
    }
    const p = new Player();
    const b = CITY.bounds;
    p.name = user.username;
    p.look = typeof options?.look === 'string' && options.look.length < 400 ? options.look : '';
    p.x = Math.min(b.maxX, Math.max(b.minX, num(options?.x) ?? 0));
    p.z = Math.min(b.maxZ, Math.max(b.minZ, num(options?.z) ?? 0));
    p.ry = 0;
    p.moving = false;
    p.place = '';
    p.emote = '';
    p.emoteAt = 0;
    this.state.players.set(client.sessionId, p);
    this.seats.set(client.sessionId, { user, lastMove: Date.now(), lastTravel: 0, lastEmote: 0, lastSay: 0 });
  }

  async onDrop(client: Client) {
    // Phones drop all the time: keep the seat for a bit.
    try {
      await this.allowReconnection(client, CITY.reconnectSeconds);
    } catch {
      // Didn't come back in time: onLeave removes them.
    }
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.seats.delete(client.sessionId);
  }
}

