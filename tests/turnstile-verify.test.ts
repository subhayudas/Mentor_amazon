import { describe, expect, it, vi } from 'vitest';
import { SITEVERIFY_URL, parseHostnames, verifyTurnstile } from '../api/_lib/turnstile.ts';

/** U4 — server-side Turnstile verification (design §6.2). */

function fakeFetch(respond: () => Response | Promise<Response>) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => respond());
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('verifyTurnstile', () => {
  it('ok when Cloudflare confirms, sending secret, token and remoteip', async () => {
    const fetchImpl = fakeFetch(() => json({ success: true, hostname: 'mentor-amazon.vercel.app' }));
    await expect(verifyTurnstile('tok', '203.0.113.9', { secret: 's3cret', fetchImpl })).resolves.toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    const form = new URLSearchParams(String(init?.body));
    expect(form.get('secret')).toBe('s3cret');
    expect(form.get('response')).toBe('tok');
    expect(form.get('remoteip')).toBe('203.0.113.9');
  });

  it('missing token never calls Cloudflare', async () => {
    const fetchImpl = fakeFetch(() => json({ success: true }));
    await expect(verifyTurnstile('', '1.1.1.1', { secret: 's', fetchImpl })).resolves.toEqual({ ok: false, reason: 'missing' });
    await expect(verifyTurnstile(undefined, '1.1.1.1', { secret: 's', fetchImpl })).resolves.toEqual({ ok: false, reason: 'missing' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('failed when Cloudflare says no', async () => {
    const fetchImpl = fakeFetch(() => json({ success: false, 'error-codes': ['invalid-input-response'] }));
    await expect(verifyTurnstile('tok', '1.1.1.1', { secret: 's', fetchImpl })).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('unavailable on a network error, a non-2xx answer or garbage', async () => {
    const boom = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(verifyTurnstile('tok', '1.1.1.1', { secret: 's', fetchImpl: boom })).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(verifyTurnstile('tok', '1.1.1.1', { secret: 's', fetchImpl: fakeFetch(() => json({}, 502)) })).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(
      verifyTurnstile('tok', '1.1.1.1', { secret: 's', fetchImpl: fakeFetch(() => new Response('<html>', { status: 200 })) }),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('enforces the hostname allow-list when one is configured', async () => {
    const fetchImpl = fakeFetch(() => json({ success: true, hostname: 'evil.example' }));
    await expect(
      verifyTurnstile('tok', '1.1.1.1', { secret: 's', fetchImpl, allowedHostnames: ['mentor-amazon.vercel.app'] }),
    ).resolves.toEqual({ ok: false, reason: 'hostname' });
    const good = fakeFetch(() => json({ success: true, hostname: 'Mentor-Amazon.vercel.app' }));
    await expect(
      verifyTurnstile('tok', '1.1.1.1', { secret: 's', fetchImpl: good, allowedHostnames: ['mentor-amazon.vercel.app'] }),
    ).resolves.toEqual({ ok: true });
    await expect(verifyTurnstile('tok', '1.1.1.1', { secret: 's', fetchImpl, allowedHostnames: [] })).resolves.toEqual({ ok: true });
  });

  it('parses the allow-list env', () => {
    expect(parseHostnames(' a.example , B.example,, ')).toEqual(['a.example', 'b.example']);
    expect(parseHostnames('')).toEqual([]);
    expect(parseHostnames(undefined)).toEqual([]);
  });
});
