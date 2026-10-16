// =====================================================================
// api.ts (net) — talking to the NYC Life server (server/ in this repo).
//
// Where the server is: the build's VITE_API_URL, or ?api=https://… in the
// address (remembered on this device; ?api=off forgets it). With neither,
// the game stays fully offline and the 🌐 Online app says so.
// The session token is kept on this device (localStorage) and sent as
// "Authorization: Bearer …". The password never is.
// =====================================================================

const API_KEY = 'nyclife.api';
const TOKEN_KEY = 'nyclife.token';

const store = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

let base: string | null = null;

/** Work out the server address once, at start-up. */
export function initApi(search = typeof location === 'undefined' ? '' : location.search): void {
  const q = new URLSearchParams(search).get('api');
  if (q === 'off') store()?.removeItem(API_KEY);
  else if (q && /^https?:\/\/[^\s]+$/.test(q)) store()?.setItem(API_KEY, q.replace(/\/+$/, ''));
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || null;
  base = store()?.getItem(API_KEY) ?? fromEnv;
}

/** The server's address (http…), or null when the game is offline-only. */
export const apiBase = () => base;
export const onlineAvailable = () => !!base;

export const getToken = () => store()?.getItem(TOKEN_KEY) ?? null;
export function setToken(t: string | null): void {
  if (t) store()?.setItem(TOKEN_KEY, t);
  else store()?.removeItem(TOKEN_KEY);
}

export class ApiFail extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Call the API. Throws ApiFail with a message you can show the player. */
export async function api<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  if (!base) throw new ApiFail(0, 'offline', 'Online play isn’t switched on yet.');
  const token = getToken();
  let r: Response;
  try {
    r = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFail(0, 'network', 'Can’t reach the server. Check your connection.');
  }
  let data: Record<string, unknown> = {};
  try {
    data = await r.json();
  } catch {
    // An empty or broken answer: handled below.
  }
  if (!r.ok) {
    if (r.status === 401 && path !== '/auth/login') setToken(null);
    throw new ApiFail(r.status, String(data.code ?? 'error'), String(data.error ?? `Server error (${r.status}).`));
  }
  return data as T;
}

/** The WebSocket address for the real-time rooms. */
export const wsBase = () => (base ? base.replace(/^http/, 'ws') : null);
