/**
 * The Amazon Federate stand-in from the SSO test suite (tests/helpers/mockIdp.ts, used
 * unchanged) served on a fixed port, so the dev server's real /api/auth/* handlers
 * (vite.config.ts, MC_LOCAL_API=1 + AMAZON_OIDC_ISSUER) can complete a sign-in in a browser.
 *
 *   source scripts/e2e/env.sh && npx tsx scripts/e2e/mock-idp.ts
 *
 * IdP:     http://127.0.0.1:$E2E_MOCK_IDP_PORT   (issuer; default 54399)
 * Control: http://127.0.0.1:$E2E_MOCK_IDP_CONTROL_PORT (default: the IdP port + 1)
 *   GET  /subject                       current claims of the next ID token
 *   POST /subject {"sub", "email"?, "name"?, "amazonAlias"?}   who approves the next sign-in
 *   POST /reset                         back to E2E_MOCK_IDP_SUB (default "e2etester")
 *   GET  /stats                         authorize / token request counts
 * Like the real Federate integ profile, the default token carries only `sub` (the alias):
 * the callback then signs the user in as <alias>@amazon.com.
 */
import http, { createServer, type IncomingMessage } from 'node:http';
import { startMockIdp } from '../../tests/helpers/mockIdp';

const PORT = Number(process.env.E2E_MOCK_IDP_PORT ?? 54399);
const CONTROL_PORT = Number(process.env.E2E_MOCK_IDP_CONTROL_PORT ?? PORT + 1);
const clientId = process.env.AMAZON_OIDC_CLIENT_ID ?? 'mentorconnect-e2e';
const clientSecret = process.env.AMAZON_OIDC_CLIENT_SECRET ?? 'e2e-mock-idp-client-secret-not-a-real-one';
const redirectUri = process.env.AMAZON_OIDC_REDIRECT_URI ?? 'http://localhost:5173/api/auth/callback/amazon';
const defaultSub = process.env.E2E_MOCK_IDP_SUB ?? 'e2etester';

type Claims = { sub: string; email?: string; name?: string; amazonAlias?: string };

// startMockIdp listens on port 0 (an ephemeral port). The dev server needs a fixed
// issuer, so the first listen(0) made while starting it is pointed at PORT instead;
// the helper itself stays untouched.
const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function listenOnFixedPort(this: http.Server, ...args: unknown[]) {
  if (args[0] === 0) args[0] = PORT;
  return (originalListen as (...a: unknown[]) => http.Server).apply(this, args);
} as typeof originalListen;
const idp = await startMockIdp({ clientId, clientSecret, redirectUri }).finally(() => {
  http.Server.prototype.listen = originalListen;
});

let current: Claims = { sub: defaultSub };
function apply(claims: Claims): void {
  current = claims;
  idp.reset({ claims: () => ({ ...current }) });
}
apply(current);

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

const control = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  try {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/subject') return send(200, current);
    if (req.method === 'GET' && path === '/stats') {
      return send(200, { authorize: idp.authorizeRequests.length, token: idp.tokenRequests.length, issuer: idp.issuer });
    }
    if (req.method === 'POST' && path === '/reset') {
      apply({ sub: defaultSub });
      return send(200, current);
    }
    if (req.method === 'POST' && path === '/subject') {
      const body = await readJson(req);
      if (typeof body.sub !== 'string' || !body.sub) return send(400, { error: 'sub required' });
      const next: Claims = { sub: body.sub };
      for (const key of ['email', 'name', 'amazonAlias'] as const) {
        if (typeof body[key] === 'string' && body[key]) next[key] = body[key] as string;
      }
      apply(next);
      return send(200, current);
    }
    send(404, { error: 'not_found' });
  } catch (err) {
    send(400, { error: err instanceof Error ? err.message : 'bad_request' });
  }
});
await new Promise<void>((resolve) => control.listen(CONTROL_PORT, '127.0.0.1', resolve));

console.log(`[mock-idp] issuer ${idp.issuer} (redirect ${redirectUri}); control http://127.0.0.1:${CONTROL_PORT}; subject ${current.sub}`);

const shutdown = () => {
  control.close();
  void idp.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
