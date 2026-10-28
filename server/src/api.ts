// =====================================================================
// api.ts — the route table: METHOD /api/path → handler. Handlers return
// data (sent as JSON) or throw ApiError (sent as { error, code }).
// =====================================================================

import * as auth from './auth.ts';
import type { Ctx } from './auth.ts';
import * as f from './features.ts';
import { ApiError, type ApiReq } from './http.ts';

type Handler = (ctx: Ctx, req: ApiReq) => unknown;

const ROUTES: [string, string, Handler][] = [
  ['GET', '/api/health', () => ({ ok: true, name: 'nyc-life', time: Date.now() })],
  // Accounts
  ['POST', '/api/auth/register', auth.register],
  ['POST', '/api/auth/login', auth.login],
  ['POST', '/api/auth/logout', auth.logout],
  ['GET', '/api/auth/me', auth.me],
  ['POST', '/api/auth/forgot', auth.forgot],
  ['POST', '/api/auth/reset', auth.reset],
  ['POST', '/api/auth/verify', auth.verify],
  ['POST', '/api/auth/verify/resend', auth.resendVerify],
  ['POST', '/api/auth/password', auth.changePassword],
  ['POST', '/api/auth/email', auth.changeEmail],
  ['POST', '/api/auth/delete', auth.deleteAccount],
  // Cloud save
  ['GET', '/api/save', f.getSave],
  ['PUT', '/api/save', f.putSave],
  // Season
  ['POST', '/api/season/points', f.addPoints],
  ['GET', '/api/season/board', f.seasonBoard],
  ['POST', '/api/season/claim', f.claimSeason],
  // Game leaderboards
  ['POST', '/api/scores', f.postScore],
  ['GET', '/api/scores/:game', f.gameBoard],
  // Gallery
  ['GET', '/api/art', f.artWall],
  ['POST', '/api/art', f.hangArt],
  ['POST', '/api/art/:id/like', f.likeArt],
  // Players
  ['GET', '/api/players', f.findPlayers],
  ['GET', '/api/players/:name', f.profile],
  // Money
  ['POST', '/api/transfers', f.sendMoney],
  ['GET', '/api/transfers/inbox', f.inbox],
  ['POST', '/api/transfers/:id/collect', f.collect],
  // Reports & admin
  ['POST', '/api/reports', f.report],
  ['GET', '/api/admin/queue', f.adminQueue],
  ['POST', '/api/admin/wires/:id', f.adminWire],
  ['POST', '/api/admin/reports/:id/resolve', f.adminResolve],
  ['POST', '/api/admin/art/:id/hide', f.adminHideArt],
  ['POST', '/api/admin/users/:name/ban', f.adminBan],
];

const COMPILED = ROUTES.map(([method, path, handler]) => {
  const names: string[] = [];
  const re = new RegExp(`^${path.replace(/:(\w+)/g, (_m, n: string) => (names.push(n), '([^/]+)'))}$`);
  return { method, re, names, handler };
});

export interface ApiResult {
  status: number;
  body: unknown;
}

/** Handle one API call. Never throws. */
export async function handleApi(ctx: Ctx, req: Omit<ApiReq, 'params'>): Promise<ApiResult> {
  let pathMatched = false;
  for (const r of COMPILED) {
    const m = r.re.exec(req.path);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== req.method) continue;
    const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    try {
      return { status: 200, body: (await r.handler(ctx, { ...req, params })) ?? { ok: true } };
    } catch (e) {
      if (e instanceof ApiError) return { status: e.status, body: { error: e.message, code: e.code } };
      console.error('API error', req.method, req.path, e);
      return { status: 500, body: { error: 'Something went wrong on our side. Try again.', code: 'server_error' } };
    }
  }
  return pathMatched ? { status: 405, body: { error: 'Method not allowed.', code: 'method' } } : { status: 404, body: { error: 'No such endpoint.', code: 'not_found' } };
}
