// =====================================================================
// http.ts — the shape of an API call, independent of the web framework.
// Every feature module takes an ApiReq and returns data or throws an
// ApiError; api.ts turns that into JSON. (So the same handlers could run
// on Cloudflare Workers or Express later.)
// =====================================================================

export interface ApiReq {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Headers;
  ip: string;
  /** Path parameters from the route (":id" → params.id). */
  params: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const bad = (message: string, code = 'bad_request') => new ApiError(400, code, message);
export const unauthorized = (message = 'Sign in first.') => new ApiError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed.') => new ApiError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new ApiError(404, 'not_found', message);
export const tooMany = (message = 'Slow down a little and try again soon.') => new ApiError(429, 'rate_limited', message);

/** Read a field from a JSON body, with a type check. */
export function field<T extends 'string' | 'number' | 'boolean'>(body: unknown, key: string, type: T, opts: { optional?: boolean } = {}): (T extends 'string' ? string : T extends 'number' ? number : boolean) | undefined {
  const v = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;
  if (v === undefined || v === null) {
    if (opts.optional) return undefined;
    throw bad(`Missing “${key}”.`);
  }
  if (typeof v !== type || (type === 'number' && !Number.isFinite(v))) throw bad(`“${key}” should be a ${type}.`);
  return v as never;
}

/** A small in-memory rate limiter: `hit(key)` is false once `max` hits happen within `windowMs`. */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  private max: number;
  private windowMs: number;
  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }
  hit(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now > h.reset) {
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      if (this.hits.size > 50_000) this.sweep(now);
      return true;
    }
    h.n++;
    return h.n <= this.max;
  }
  private sweep(now: number): void {
    for (const [k, h] of this.hits) if (now > h.reset) this.hits.delete(k);
  }
}
