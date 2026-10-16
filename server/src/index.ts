// =====================================================================
// index.ts — start the NYC Life server: the HTTP API under /api and the
// real-time city rooms (Colyseus over WebSockets) on the same port.
//
//   npm run dev      (restarts on changes)   →  http://localhost:2567
//   npm start
//
// Settings: environment variables (src/config.ts, README.md).
// =====================================================================

import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { handleApi } from './api.ts';
import type { Ctx } from './auth.ts';
import { CityRoom, roomCtx } from './city-room.ts';
import { CONFIG } from './config.ts';
import { openDb } from './db.ts';
import { makeMailer, type Mailer } from './mailer.ts';

export interface StartOptions {
  port?: number;
  dbPath?: string;
  mailer?: Mailer;
  now?: () => number;
  quiet?: boolean;
}

/** Start the server. Returns the context and a stop function (tests use both). */
export async function start(opts: StartOptions = {}) {
  const ctx: Ctx = { db: openDb(opts.dbPath ?? CONFIG.dbPath), mailer: opts.mailer ?? makeMailer(), now: opts.now ?? Date.now };
  roomCtx.ctx = ctx;

  // Every /api/… call goes through one endpoint per method, into handleApi (src/api.ts).
  const api = (method: string) =>
    createEndpoint('/api/**', { method: method as 'GET' }, async (c: { request?: Request; body?: unknown; headers?: Headers }) => {
      const request = c.request!;
      const url = new URL(request.url);
      const headers = c.headers ?? request.headers;
      const fwd = CONFIG.trustProxy ? headers.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
      const r = await handleApi(ctx, { method, path: url.pathname, query: url.searchParams, body: c.body ?? null, headers, ip: fwd || headers.get('x-real-ip') || 'local' });
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    });
  const routes = createRouter({ apiGet: api('GET'), apiPost: api('POST'), apiPut: api('PUT'), apiDelete: api('DELETE') });

  const server = defineServer({
    rooms: { city: defineRoom(CityRoom).filterBy(['area']) },
    routes,
    transport: new WebSocketTransport({ maxPayload: 8 * 1024 }),
    greet: false,
    gracefullyShutdown: false,
  });
  const port = opts.port ?? CONFIG.port;
  await server.listen(port);
  if (!opts.quiet) console.log(`🗽 NYC Life server on http://localhost:${port} (API at /api, rooms over ws). Database: ${opts.dbPath ?? CONFIG.dbPath}`);
  return {
    ctx,
    port,
    stop: async () => {
      await server.gracefullyShutdown(false);
      ctx.db.close();
    },
  };
}

// Run directly (not imported by a test): start, and stop cleanly on Ctrl+C / deploy restarts.
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await start();
  for (const sig of ['SIGINT', 'SIGTERM'] as const)
    process.once(sig, async () => {
      console.log('Shutting down…');
      await s.stop();
      process.exit(0);
    });
}
