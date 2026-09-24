import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';

/**
 * A local stand-in for Amazon Federate, shaped after the live discovery
 * document at https://idp-integ.federate.amazon.com/.well-known/openid-configuration
 * (same endpoint paths, `scopes_supported: ["openid"]`, RS256 only, no
 * end_session_endpoint). It enforces what the real IdP enforces for this
 * client: exact redirect URI, S256 PKCE, confidential-client auth and
 * single-use codes. The authorize endpoint plays Midway's part by approving
 * immediately as `subject`.
 */

export type ClientAuthMethod = 'client_secret_basic' | 'client_secret_post';

export interface TokenRequestRecord {
  method: ClientAuthMethod | 'none';
  status: number;
  form: Record<string, string>;
}

export interface IdTokenContext {
  nonce: string;
  clientId: string;
  issuer: string;
}

export interface MockIdpConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Auth methods the token endpoint accepts. */
  acceptedAuth: ClientAuthMethod[];
  /** Claims for the next ID token; iss/aud/iat/exp/nonce are added unless overridden here. */
  claims: (ctx: IdTokenContext) => Record<string, unknown>;
  /** Sign with a key that is not in the published JWKS. */
  signWithRogueKey: boolean;
  /** Userinfo body (sub is filled in from the token when absent); null → 401. */
  userinfo: Record<string, unknown> | null;
}

interface PendingCode {
  clientId: string;
  redirectUri: string;
  challenge: string;
  nonce: string;
  scope: string;
  used: boolean;
}

export interface MockIdp {
  issuer: string;
  config: MockIdpConfig;
  tokenRequests: TokenRequestRecord[];
  authorizeRequests: URL[];
  reset(overrides?: Partial<MockIdpConfig>): void;
  close(): Promise<void>;
}

const PATHS = {
  authorize: '/api/oauth2/v1/authorize',
  token: '/api/oauth2/v2/token',
  certs: '/api/oauth2/v2/certs',
  userinfo: '/api/oauth2/v1/userinfo',
  revoke: '/api/oauth2/v1/revoke',
};

function defaults(base: Pick<MockIdpConfig, 'clientId' | 'clientSecret' | 'redirectUri'>): MockIdpConfig {
  return {
    ...base,
    acceptedAuth: ['client_secret_basic', 'client_secret_post'],
    claims: () => ({ sub: 'jdoe' }),
    signWithRogueKey: false,
    userinfo: null,
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function startMockIdp(base: Pick<MockIdpConfig, 'clientId' | 'clientSecret' | 'redirectUri'>): Promise<MockIdp> {
  const signing = await generateKeyPair('RS256');
  const rogue = await generateKeyPair('RS256');
  const publicJwk: JWK = { ...(await exportJWK(signing.publicKey)), kid: 'mock-1', alg: 'RS256', use: 'sig' };

  const codes = new Map<string, PendingCode>();
  const accessTokens = new Map<string, string>(); // access token → sub
  const state: { config: MockIdpConfig } = { config: defaults(base) };
  const tokenRequests: TokenRequestRecord[] = [];
  const authorizeRequests: URL[] = [];
  let issuer = '';

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', issuer);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      json(200, {
        issuer,
        authorization_endpoint: issuer + PATHS.authorize,
        token_endpoint: issuer + PATHS.token,
        userinfo_endpoint: issuer + PATHS.userinfo,
        jwks_uri: issuer + PATHS.certs,
        revocation_endpoint: issuer + PATHS.revoke,
        scopes_supported: ['openid'],
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        claims_supported: ['aud', 'exp', 'iat', 'iss', 'sub', 'groups', 'amr'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
        code_challenge_methods_supported: ['S256'],
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === PATHS.certs) {
      json(200, { keys: [publicJwk] });
      return;
    }

    if (req.method === 'GET' && url.pathname === PATHS.authorize) {
      authorizeRequests.push(url);
      const p = url.searchParams;
      const cfg = state.config;
      if (
        p.get('response_type') !== 'code' ||
        p.get('client_id') !== cfg.clientId ||
        p.get('redirect_uri') !== cfg.redirectUri ||
        p.get('code_challenge_method') !== 'S256' ||
        !p.get('code_challenge') ||
        !(p.get('scope') ?? '').split(' ').includes('openid')
      ) {
        json(400, { error: 'invalid_request' });
        return;
      }
      const code = randomBytes(16).toString('hex');
      codes.set(code, {
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        challenge: p.get('code_challenge')!,
        nonce: p.get('nonce') ?? '',
        scope: p.get('scope')!,
        used: false,
      });
      const back = new URL(cfg.redirectUri);
      back.searchParams.set('code', code);
      if (p.get('state')) back.searchParams.set('state', p.get('state')!);
      res.writeHead(302, { Location: back.toString() });
      res.end();
      return;
    }

    if (req.method === 'POST' && url.pathname === PATHS.token) {
      const cfg = state.config;
      const form = Object.fromEntries(new URLSearchParams(await readBody(req)));
      const record: TokenRequestRecord = { method: 'none', status: 0, form };
      tokenRequests.push(record);
      const reply = (status: number, body: unknown) => {
        record.status = status;
        json(status, body);
      };

      // --- client authentication (RFC 6749 §2.3.1) ---
      let clientId: string | undefined;
      let clientSecret: string | undefined;
      const authz = req.headers.authorization;
      if (authz?.startsWith('Basic ')) {
        record.method = 'client_secret_basic';
        const decoded = Buffer.from(authz.slice(6), 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        clientId = decodeURIComponent(decoded.slice(0, idx));
        clientSecret = decodeURIComponent(decoded.slice(idx + 1));
      } else if (form.client_secret !== undefined) {
        record.method = 'client_secret_post';
        clientId = form.client_id;
        clientSecret = form.client_secret;
      }
      if (
        record.method === 'none' ||
        !cfg.acceptedAuth.includes(record.method as ClientAuthMethod) ||
        clientId !== cfg.clientId ||
        clientSecret !== cfg.clientSecret
      ) {
        // Federate integ answers a bad client credential with 400, not 401
        // (observed 2026-09-24), so the fallback must key off the body.
        reply(400, { error: 'invalid_client', error_description: 'Invalid client' });
        return;
      }

      // --- grant ---
      const pending = form.code ? codes.get(form.code) : undefined;
      if (form.grant_type !== 'authorization_code' || !pending || pending.used || pending.clientId !== clientId) {
        reply(400, { error: 'invalid_grant' });
        return;
      }
      if (form.redirect_uri !== pending.redirectUri) {
        reply(400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
        return;
      }
      const expected = createHash('sha256').update(form.code_verifier ?? '').digest('base64url');
      if (expected !== pending.challenge) {
        reply(400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
        return;
      }
      pending.used = true;

      const now = Math.floor(Date.now() / 1000);
      const claims: Record<string, unknown> = {
        iss: issuer,
        aud: cfg.clientId,
        iat: now,
        exp: now + 3600,
        nonce: pending.nonce,
        ...cfg.claims({ nonce: pending.nonce, clientId: cfg.clientId, issuer }),
      };
      const key = cfg.signWithRogueKey ? rogue.privateKey : signing.privateKey;
      const idToken = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'mock-1', typ: 'JWT' }).sign(key);
      const accessToken = randomBytes(16).toString('hex');
      accessTokens.set(accessToken, String(claims.sub ?? ''));
      reply(200, { access_token: accessToken, token_type: 'Bearer', expires_in: 3600, id_token: idToken, scope: pending.scope });
      return;
    }

    if (req.method === 'GET' && url.pathname === PATHS.userinfo) {
      const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
      const sub = accessTokens.get(token);
      if (sub === undefined || !state.config.userinfo) {
        json(401, { error: 'invalid_token' });
        return;
      }
      json(200, { sub, ...state.config.userinfo });
      return;
    }

    json(404, { error: 'not_found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    get issuer() {
      return issuer;
    },
    get config() {
      return state.config;
    },
    tokenRequests,
    authorizeRequests,
    reset(overrides = {}) {
      state.config = { ...defaults(base), ...overrides };
      tokenRequests.length = 0;
      authorizeRequests.length = 0;
    },
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
