import { PassThrough, Readable } from 'node:stream';
import type { VercelRequest } from '@vercel/node';
import { describe, expect, it } from 'vitest';
import { readRawBody } from '../api/_lib/http.ts';

/**
 * R1-00 — readRawBody's own contract. tests/api-vercel-runtime.test.ts proves it against
 * @vercel/node's real dev-server; these cases pin the edges without a child process.
 */

function request(chunks: Array<Buffer | string>, headers: Record<string, string> = {}): VercelRequest {
  return Object.assign(Readable.from(chunks), { headers }) as unknown as VercelRequest;
}

describe('readRawBody', () => {
  it('returns every byte, joining Buffer and string chunks', async () => {
    const result = await readRawBody(request([Buffer.from('{"a":'), '1}']), 1024);
    expect(result.ok && result.body.toString()).toBe('{"a":1}');
  });

  it('refuses a declared content-length over the limit without reading', async () => {
    const result = await readRawBody(request(['{}'], { 'content-length': '2048' }), 1024);
    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('refuses a streamed body over the limit even when no length was declared', async () => {
    const result = await readRawBody(request([Buffer.alloc(600, 'x'), Buffer.alloc(600, 'y')]), 1024);
    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('an empty body is an empty buffer', async () => {
    const result = await readRawBody(request([]), 1024);
    expect(result.ok && result.body.length).toBe(0);
  });

  it('a stream that already ended and is not replayed answers at once instead of hanging', async () => {
    const consumed = new PassThrough();
    consumed.end('already read by someone else');
    consumed.resume();
    await new Promise((resolve) => consumed.once('end', resolve));
    const req = Object.assign(consumed, { headers: {} }) as unknown as VercelRequest;
    const result = await Promise.race([
      readRawBody(req, 1024),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 500)),
    ]);
    expect(result).toEqual({ ok: true, body: Buffer.alloc(0) });
  });

  it('a stream error rejects', async () => {
    const broken = new Readable({
      read() {
        this.destroy(new Error('socket hang up'));
      },
    });
    const req = Object.assign(broken, { headers: {} }) as unknown as VercelRequest;
    await expect(readRawBody(req, 1024)).rejects.toThrow('socket hang up');
  });
});
