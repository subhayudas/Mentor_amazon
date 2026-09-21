import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readEnv } from './env.js';
import { sendJson } from './http.js';

/**
 * IP rate limiting for the API routes: a fixed window per (route, IP).
 *
 * Backed by Upstash Redis (REST) when `UPSTASH_REDIS_REST_URL` /
 * `UPSTASH_REDIS_REST_TOKEN` are set, so the limit holds across every
 * function instance; otherwise an in-memory window per instance (still
 * useful against a single noisy client, honest about being per-instance).
 * Failure of the store never blocks a request — the limiter fails open and
 * logs, because the routes it guards are already authenticated or signed.
 */
export interface RateLimitRule {
  /** Route name used in the key, e.g. 'auth-login'. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

const memory = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (first ?? req.socket?.remoteAddress ?? 'unknown').trim();
}

async function hit(key: string, rule: RateLimitRule): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const env = readEnv(['upstashUrl', 'upstashToken'] as const);
  if (env.ok && env.env.upstashUrl && env.env.upstashToken) {
    try {
      const res = await fetch(`${env.env.upstashUrl}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.env.upstashToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, String(rule.windowSeconds), 'NX'],
          ['TTL', key],
        ]),
      });
      if (res.ok) {
        const rows = (await res.json()) as { result: number }[];
        const count = Number(rows[0]?.result ?? 0);
        const ttl = Number(rows[2]?.result ?? rule.windowSeconds);
        return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count), resetIn: ttl > 0 ? ttl : rule.windowSeconds };
      }
    } catch (err) {
      console.warn('[ratelimit] upstash unavailable, falling back to memory:', err instanceof Error ? err.message : err);
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return { allowed: true, remaining: rule.limit - 1, resetIn: rule.windowSeconds };
  }
  entry.count += 1;
  return { allowed: entry.count <= rule.limit, remaining: Math.max(0, rule.limit - entry.count), resetIn: Math.ceil((entry.resetAt - now) / 1000) };
}

/**
 * Apply `rule` to the request. Returns true when the request may proceed;
 * when it may not, a 429 with `Retry-After` has already been sent.
 */
export async function enforceRateLimit(req: VercelRequest, res: VercelResponse, rule: RateLimitRule): Promise<boolean> {
  const key = `rl:${rule.name}:${clientIp(req)}`;
  const result = await hit(key, rule);
  res.setHeader('X-RateLimit-Limit', String(rule.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (result.allowed) return true;
  res.setHeader('Retry-After', String(result.resetIn));
  sendJson(res, 429, { error: 'rate_limited', retry_after_seconds: result.resetIn });
  return false;
}

export const RULES = {
  authLogin: { name: 'auth-login', limit: 20, windowSeconds: 60 },
  authCallback: { name: 'auth-callback', limit: 30, windowSeconds: 60 },
  calWebhook: { name: 'cal-webhook', limit: 120, windowSeconds: 60 },
  turnstile: { name: 'turnstile', limit: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;
