import { Readable } from 'node:stream';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Minimal request/response doubles for the Vercel Node handlers, plus a
 * cookie jar that behaves like a browser for the cookies these routes set.
 */

export type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

export class FakeResponse {
  statusCode = 200;
  body = '';
  ended = false;
  private headers = new Map<string, string | string[]>();

  setHeader(name: string, value: string | string[]): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  getHeader(name: string): string | string[] | undefined {
    return this.headers.get(name.toLowerCase());
  }

  end(chunk?: string): this {
    if (chunk) this.body += chunk;
    this.ended = true;
    return this;
  }

  get location(): string {
    return String(this.getHeader('location') ?? '');
  }

  get setCookies(): string[] {
    const raw = this.getHeader('set-cookie');
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  json(): Record<string, unknown> {
    return JSON.parse(this.body) as Record<string, unknown>;
  }
}

export class CookieJar {
  readonly cookies = new Map<string, string>();

  /** Apply Set-Cookie headers in order; Max-Age=0 deletes. */
  apply(setCookies: string[]): void {
    for (const header of setCookies) {
      const [pair, ...attrs] = header.split(';').map((s) => s.trim());
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx);
      const value = decodeURIComponent(pair.slice(idx + 1));
      const expired = attrs.some((a) => /^max-age=0$/i.test(a));
      if (expired || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
  }
}

let ipCounter = 0;
/** A fresh client IP so the per-IP rate limiter never couples tests. */
export function nextIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

export interface InvokeOptions {
  method?: string;
  jar?: CookieJar;
  ip?: string;
  cookie?: string;
  /** Raw request body. An object is sent as JSON; a string is sent as-is. */
  body?: string | object;
  /** Extra request headers (lower-case names, as Node delivers them). */
  headers?: Record<string, string>;
}

/**
 * Calls a handler with a request that is a real readable stream carrying the
 * body bytes (so handlers that read the raw stream work), plus the parsed
 * `body` and `query` helpers @vercel/node would add.
 */
export async function invoke(handler: Handler, path: string, opts: InvokeOptions = {}): Promise<FakeResponse> {
  const cookie = opts.cookie ?? opts.jar?.header();
  const raw = opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  let parsed: unknown;
  if (opts.body !== undefined && typeof opts.body !== 'string') parsed = opts.body;
  else if (raw !== undefined) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
  }
  const url = new URL(path, 'http://localhost');
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const prev = query[key];
    query[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    method: opts.method ?? 'GET',
    url: path,
    headers: {
      'x-forwarded-for': opts.ip ?? nextIp(),
      ...(cookie ? { cookie } : {}),
      ...(opts.headers ?? {}),
    },
    socket: {},
    body: parsed,
    query,
  }) as unknown as VercelRequest;
  const res = new FakeResponse();
  await handler(req, res as unknown as VercelResponse);
  opts.jar?.apply(res.setCookies);
  return res;
}
