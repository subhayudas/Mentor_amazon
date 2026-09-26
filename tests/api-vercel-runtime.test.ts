import { fork, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { calEvent, pingEvent, signCal } from './helpers/cal.ts';

/**
 * R1-00 — the real api/ handlers behind Vercel's own Node runtime code (not tests/helpers/vercel.ts).
 *
 * Vercel builds api/*.ts as Node functions with `shouldAddHelpers: true`. Whenever a request
 * carries a Content-Type, @vercel/node's `addHelpers` reads the whole body stream before the
 * handler runs, then "restores" it with a shim that replays only `req.on('data' | 'end')` and
 * `req.read`. A handler that reads the raw body any other way (an async iterator) sees an empty
 * body: every Cal.com delivery failed its signature check and every /api/requests body was
 * "invalid". The doubles in tests/helpers/vercel.ts and the vite MC_LOCAL_API adapter hand the
 * handler a fresh Readable, so they can never show that.
 *
 * This suite forks node_modules/@vercel/node/dist/dev-server.mjs exactly as `vercel dev` does
 * (tsx loader, VERCEL_DEV_ENTRYPOINT / _CONFIG / _BUILD_ENV), points SUPABASE_URL at an
 * in-process PostgREST stand-in that records every call, and sends real HTTP requests, with the
 * helpers on (Vercel's default) and off (`NODEJS_HELPERS=0`: the handler gets the plain
 * IncomingMessage).
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
const DEV_SERVER = path.join(path.dirname(requireFromRoot.resolve('@vercel/node')), 'dev-server.mjs');
const TSX_LOADER = pathToFileURL(requireFromRoot.resolve('tsx')).href;

const GLOBAL_SECRET = 'global-secret-at-least-16-chars';
const MENTOR = '3f1c2a9e-8b7d-4c6e-9a1b-2c3d4e5f6a7b';
const MENTOR_SECRET = 'a'.repeat(64);
const REQUEST = {
  mentorId: '738d7465-42c6-5550-be9a-6e7ef35f52bc',
  name: 'Sara K.',
  email: 'sara@example.com',
  goal: 'I would like advice on our seed round.',
};

// ---------------------------------------------------------------------------
// PostgREST stand-in: answers exactly the calls the two handlers make and records them.

interface PgCall {
  method: string;
  path: string;
  search: string;
  body: string;
}
const pgCalls: PgCall[] = [];
let postgrest: Server;
let postgrestUrl = '';

function startPostgrest(): Promise<void> {
  postgrest = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://postgrest.local');
      const body = Buffer.concat(chunks).toString('utf8');
      pgCalls.push({ method: req.method ?? '', path: url.pathname, search: url.search, body });
      res.setHeader('Content-Type', 'application/json');
      const reply = (value: unknown) => res.end(JSON.stringify(value));
      switch (url.pathname) {
        case '/rest/v1/mentor_cal_webhooks': {
          const known = url.searchParams.get('mentor_id') === `eq.${MENTOR}`;
          return reply(known ? [{ secret: MENTOR_SECRET, previous_secret: null, previous_valid_until: null }] : []);
        }
        case '/rest/v1/rpc/cal_record_delivery':
          return reply({ outcome: (JSON.parse(body) as { p_outcome: string }).p_outcome });
        case '/rest/v1/rpc/cal_apply_event':
          return reply({ outcome: 'confirmed', booking_id: 'booking-1', changed: true });
        case '/rest/v1/rpc/create_booking_request':
          return reply({ outcome: 'created', booking_id: 'booking-1' });
        default:
          res.statusCode = 404;
          return reply({ code: 'PGRST202', message: `not served by the stand-in: ${url.pathname}` });
      }
    });
  });
  return new Promise((resolve) => {
    postgrest.listen(0, '127.0.0.1', () => {
      postgrestUrl = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
      resolve();
    });
  });
}

const callsTo = (pathname: string) => pgCalls.filter((c) => c.path === pathname);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// ---------------------------------------------------------------------------
// @vercel/node's dev-server, forked the way `vercel dev` forks it (fork-dev-server.ts).

interface DevServer {
  url: string;
  child: ChildProcess;
  output: () => string;
}

async function startDevServer(entrypoint: string, helpers: boolean): Promise<DevServer> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^(TURNSTILE_|VITE_TURNSTILE_|UPSTASH_|CAL_WEBHOOK_SECRET$|VERCEL_)/.test(name)) delete env[name];
  }
  Object.assign(env, {
    NODE_OPTIONS: `--import ${TSX_LOADER} --no-warnings`,
    VERCEL_DEV_ENTRYPOINT: entrypoint,
    VERCEL_DEV_CONFIG: '{}',
    VERCEL_DEV_BUILD_ENV: JSON.stringify(helpers ? {} : { NODEJS_HELPERS: '0' }),
    VERCEL_ENV: 'development',
    SUPABASE_URL: postgrestUrl,
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-not-real',
    CAL_WEBHOOK_SECRET: GLOBAL_SECRET,
  });
  const child = fork(DEV_SERVER, [], { cwd: ROOT, env, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  const address = await new Promise<AddressInfo>((resolve, reject) => {
    child.once('message', (message) => resolve(message as AddressInfo));
    child.once('exit', (code) => reject(new Error(`dev-server for ${entrypoint} exited (${code}):\n${output}`)));
  });
  return { url: `http://127.0.0.1:${address.port}`, child, output: () => output };
}

let ipCounter = 0;
async function post(server: DevServer, pathname: string, body: string, headers: Record<string, string>) {
  ipCounter += 1;
  const res = await fetch(server.url + pathname, {
    method: 'POST',
    headers: { 'x-forwarded-for': `198.51.100.${ipCounter}`, ...headers },
    body,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

beforeAll(startPostgrest);
afterAll(() => new Promise<void>((resolve) => postgrest.close(() => resolve())));
beforeEach(() => {
  pgCalls.length = 0;
});

for (const helpers of [true, false]) {
  const mode = helpers ? 'helpers on (Vercel default)' : 'helpers off (NODEJS_HELPERS=0)';

  describe(`POST /api/webhooks/cal through @vercel/node's dev-server, ${mode}`, () => {
    let server: DevServer;
    beforeAll(async () => {
      server = await startDevServer('api/webhooks/cal.ts', helpers);
    }, 60_000);
    afterAll(() => {
      server?.child.kill('SIGKILL');
    });

    it('a Cal.com PING signed with the global secret answers 200 ping, recorded with the hash of the bytes sent', async () => {
      const body = JSON.stringify(pingEvent());
      const res = await post(server, '/api/webhooks/cal', body, {
        'content-type': 'application/json',
        'x-cal-signature-256': signCal(body, GLOBAL_SECRET),
      });
      expect(res, server.output()).toEqual({ status: 200, json: { ok: true, outcome: 'ping' } });
      const recorded = callsTo('/rest/v1/rpc/cal_record_delivery');
      expect(recorded).toHaveLength(1);
      expect(JSON.parse(recorded[0].body)).toMatchObject({
        p_mentor_id: null,
        p_trigger: 'PING',
        p_outcome: 'ping',
        p_payload_sha256: sha256(body),
      });
    });

    it("a mentor's signed booking event is verified against their secret and reaches cal_apply_event", async () => {
      const body = JSON.stringify(calEvent('BOOKING_CREATED', { uid: 'calUid123', attendees: ['mentee@example.com'] }));
      const res = await post(server, `/api/webhooks/cal?mentor=${MENTOR}`, body, {
        'content-type': 'application/json',
        'x-cal-signature-256': signCal(body, MENTOR_SECRET),
      });
      expect(res, server.output()).toEqual({ status: 200, json: { ok: true, outcome: 'confirmed' } });
      expect(callsTo('/rest/v1/mentor_cal_webhooks')).toHaveLength(1);
      const applied = callsTo('/rest/v1/rpc/cal_apply_event');
      expect(applied).toHaveLength(1);
      expect(JSON.parse(applied[0].body)).toMatchObject({
        p_mentor_id: MENTOR,
        p_trigger: 'BOOKING_CREATED',
        p_uid: 'calUid123',
        p_attendee_emails: ['mentee@example.com'],
        p_payload_sha256: sha256(body),
      });
    });

    it('a large (200 KB) delivery arrives whole', async () => {
      const body = JSON.stringify({ ...pingEvent(), padding: 'x'.repeat(200_000) });
      const res = await post(server, '/api/webhooks/cal', body, {
        'content-type': 'application/json',
        'x-cal-signature-256': signCal(body, GLOBAL_SECRET),
      });
      expect(res.status, server.output()).toBe(200);
      expect(JSON.parse(callsTo('/rest/v1/rpc/cal_record_delivery')[0].body).p_payload_sha256).toBe(sha256(body));
    });

    it('the signature of an empty body does not verify a non-empty one (the handler hashes what was sent)', async () => {
      const body = JSON.stringify(pingEvent());
      const res = await post(server, '/api/webhooks/cal', body, {
        'content-type': 'application/json',
        'x-cal-signature-256': signCal('', GLOBAL_SECRET),
      });
      expect(res).toEqual({ status: 401, json: { error: 'invalid_signature' } });
      expect(pgCalls.filter((c) => c.path.startsWith('/rest/v1/rpc/'))).toEqual([]);
    });

    it('a body over 256 KiB is refused with 413 before any database call', async () => {
      const body = JSON.stringify({ ...pingEvent(), padding: 'x'.repeat(300_000) });
      const res = await post(server, '/api/webhooks/cal', body, {
        'content-type': 'application/json',
        'x-cal-signature-256': signCal(body, GLOBAL_SECRET),
      });
      expect(res).toEqual({ status: 413, json: { error: 'payload_too_large' } });
      expect(pgCalls).toEqual([]);
    });
  });

  describe(`POST /api/requests through @vercel/node's dev-server, ${mode}`, () => {
    let server: DevServer;
    beforeAll(async () => {
      server = await startDevServer('api/requests.ts', helpers);
    }, 60_000);
    afterAll(() => {
      server?.child.kill('SIGKILL');
    });

    it('a valid JSON body is parsed and reaches create_booking_request with exactly its values', async () => {
      const res = await post(server, '/api/requests', JSON.stringify(REQUEST), { 'content-type': 'application/json' });
      expect(res, server.output()).toEqual({ status: 200, json: { ok: true } });
      const rpc = callsTo('/rest/v1/rpc/create_booking_request');
      expect(rpc).toHaveLength(1);
      expect(JSON.parse(rpc[0].body)).toEqual({
        p_mentor_id: REQUEST.mentorId,
        p_email: REQUEST.email,
        p_name: REQUEST.name,
        p_goal: REQUEST.goal,
      });
    });

    it('a body with one bad field is refused naming that field (the body was read, not empty)', async () => {
      const res = await post(server, '/api/requests', JSON.stringify({ ...REQUEST, email: 'not-an-email' }), {
        'content-type': 'application/json; charset=utf-8',
      });
      expect(res).toEqual({ status: 400, json: { error: 'invalid_request', fields: ['email'] } });
      expect(pgCalls).toEqual([]);
    });
  });
}
