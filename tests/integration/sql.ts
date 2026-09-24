import postgres from 'postgres';
import { expect } from 'vitest';
import { TEST_DB_URL } from './env.ts';

/**
 * Direct Postgres access for the integration suites. Row-level tests run inside a
 * transaction that is always rolled back (withTx), switching between the privileged
 * migration context and PostgREST's roles with asRole()/asService(), exactly the GUCs
 * PostgREST sets for a request (role + request.jwt.claims).
 */
export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function connect(url = TEST_DB_URL, max = 4): Sql {
  return postgres(url, { max, onnotice: () => undefined, idle_timeout: 5 });
}

const ROLLBACK = Symbol('rollback');

/** Run `fn` in a transaction that is rolled back afterwards, whatever it did. */
export async function withTx<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    await sql.begin(async (tx) => {
      result = await fn(tx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return result as T;
}

export type Claims = { sub?: string; email?: string; [key: string]: unknown };

/** Act as a PostgREST caller: `anon`, or `authenticated` with the JWT claims given. */
export async function asRole(tx: Tx, role: 'anon' | 'authenticated' | 'service_role', claims: Claims = {}): Promise<void> {
  await tx`reset role`;
  const full = { role, ...claims };
  await tx`select set_config('request.jwt.claims', ${JSON.stringify(full)}, true),
                  set_config('request.jwt.claim.sub', ${String(claims.sub ?? '')}, true),
                  set_config('request.jwt.claim.role', ${role}, true)`;
  await tx.unsafe(`set local role ${role}`);
}

/** Back to the migration context (session user postgres, no JWT): is_service_context() is true. */
export async function asService(tx: Tx): Promise<void> {
  await tx`reset role`;
  await tx`select set_config('request.jwt.claims', '', true),
                  set_config('request.jwt.claim.sub', '', true),
                  set_config('request.jwt.claim.role', '', true)`;
}

export interface PgFailure {
  code: string;
  message: string;
}

/** Run `fn` in a savepoint and return the Postgres error it raised (the transaction goes on). */
export async function pgError(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<PgFailure> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp as unknown as Tx);
    });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { code: e.code ?? '', message: e.message ?? String(err) };
  }
  throw new Error('expected a Postgres error, the statement succeeded');
}

/** Assert that `fn` fails with `code` (and optionally a message fragment). */
export async function expectPgError(tx: Tx, fn: (sp: Tx) => Promise<unknown>, code: string, message?: string | RegExp): Promise<void> {
  const failure = await pgError(tx, fn);
  expect(failure.code, failure.message).toBe(code);
  if (message) expect(failure.message).toMatch(message);
}

/** Run `fn` in a savepoint; true when it succeeded. */
export async function succeeds(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<boolean> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp as unknown as Tx);
    });
    return true;
  } catch {
    return false;
  }
}
